import {
  calculatePortfolioSummary,
  filterAndSortProperties
} from './reviews-ratings-utils.js';
import { renderReviewsRatingsDashboard } from './reviews-ratings-view.js';

const STORAGE_KEY = 'atlantic_holiday_property_reviews_cache_v3';

export class ReviewsRatingsManager {
  constructor(db = null, navigationManager = null) {
    this.db = db;
    this.navigationManager = navigationManager;

    this.state = {
      rawProperties: [],
      filteredProperties: [],
      summary: {},
      searchQuery: '',
      filter: 'all',
      sort: 'name-asc',
      lastUpdated: null,
      selectedProperty: null,
      isSyncing: false,
      syncToastMessage: null,
      reviewModalFilter: 'all',
      reviewModalSearch: '',
      isEditingLinks: false,
      isAddingReview: false
    };

    this.initialized = false;
    this._toastTimer = null;
    this.loadFromStorage();
  }

  setNavigationManager(navManager) {
    this.navigationManager = navManager;
  }

  init() {
    this.render();
    this.loadFromServer();
  }

  loadFromStorage() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.properties?.length && parsed.properties.some((p) => p.reviews?.length)) {
          this.state.rawProperties = parsed.properties;
          this.state.lastUpdated = parsed.lastUpdated || null;
          this.updateCalculations();
        }
      }
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Failed to load cached dataset:', err);
    }
  }

  saveToStorage(dataset) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Failed to cache dataset:', err);
    }
  }

  showToast(message) {
    this.state.syncToastMessage = message;
    this.render();
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.state.syncToastMessage = null;
      this.render();
    }, 4500);
  }

  async syncReviews() {
    this.state.isSyncing = true;
    this.render();

    try {
      const url = `./server-data/property-reviews.json?t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const dataset = await response.json();
        if (dataset && Array.isArray(dataset.properties)) {
          this.state.rawProperties = dataset.properties;
          this.state.lastUpdated = dataset.lastUpdated || new Date().toISOString();
          this.saveToStorage(dataset);
          this.updateCalculations();
          this.showToast(`Reviews synchronized! (${this.state.rawProperties.length} properties updated)`);
        } else {
          this.showToast('Reviews updated.');
        }
      } else {
        this.showToast('Unable to fetch latest reviews file. Displaying local data.');
      }
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Sync error:', err);
      this.showToast('Network error while refreshing reviews. Displaying local data.');
    } finally {
      this.state.isSyncing = false;
      this.render();
    }
  }

  async loadFromServer() {
    try {
      // Load static JSON directly from server-data endpoint with cache busting
      const url = `./server-data/property-reviews.json?t=${Date.now()}`;
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const dataset = await response.json();
        if (dataset && Array.isArray(dataset.properties)) {
          this.state.rawProperties = dataset.properties;
          this.state.lastUpdated = dataset.lastUpdated || null;
          this.saveToStorage(dataset);
          this.updateCalculations();
          this.render();
        }
      }
    } catch (err) {
      console.log('[ReviewsRatingsManager] Could not load fresh reviews from server-data, using cached.');
    }
  }

  updateCalculations() {
    this.state.summary = calculatePortfolioSummary(this.state.rawProperties);
    this.state.filteredProperties = filterAndSortProperties(this.state.rawProperties, {
      search: this.state.searchQuery,
      filter: this.state.filter,
      sort: this.state.sort
    });
  }

  savePropertyLinks({ bookingUrl, airbnbUrl } = {}) {
    if (!this.state.selectedProperty) return;

    const propId = this.state.selectedProperty.id;
    this.state.selectedProperty.bookingUrl = bookingUrl || '';
    this.state.selectedProperty.airbnbUrl = airbnbUrl || '';

    const propInList = this.state.rawProperties.find((p) => p.id === propId);
    if (propInList) {
      propInList.bookingUrl = bookingUrl || '';
      propInList.airbnbUrl = airbnbUrl || '';
    }

    this.state.isEditingLinks = false;
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });

    this.showToast(`Listing links saved for ${this.state.selectedProperty.name}!`);
    this.render();
  }

  addPropertyReview(reviewData = {}) {
    if (!this.state.selectedProperty) return;
    const prop = this.state.selectedProperty;
    if (!Array.isArray(prop.reviews)) prop.reviews = [];

    const isAirbnb = reviewData.platform === 'Airbnb';
    const scoreVal = Number(reviewData.score) || (isAirbnb ? 5 : 10);
    const cleanVal = reviewData.cleanlinessScore ? Number(reviewData.cleanlinessScore) : null;

    const newRev = {
      id: `${prop.id}-rev-${Date.now()}`,
      author: reviewData.author || 'Guest',
      country: reviewData.country || '',
      countryCode: '',
      date: reviewData.date || new Date().toISOString().split('T')[0],
      platform: reviewData.platform || 'Direct',
      score: scoreVal,
      maxScore: isAirbnb ? 5 : 10,
      title: reviewData.title || '',
      comment: reviewData.comment || '',
      positive: reviewData.positive || '',
      negative: reviewData.negative || '',
      cleanlinessScore: cleanVal
    };

    prop.reviews.unshift(newRev);

    const propInList = this.state.rawProperties.find((p) => p.id === prop.id);
    if (propInList) {
      if (!Array.isArray(propInList.reviews)) propInList.reviews = [];
      propInList.reviews.unshift(newRev);
    }

    this.state.isAddingReview = false;
    this.updateCalculations();
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });

    this.showToast(`New review added for ${prop.name}!`);
    this.render();
  }

  deletePropertyReview(reviewId) {
    if (!this.state.selectedProperty) return;
    const prop = this.state.selectedProperty;
    if (Array.isArray(prop.reviews)) {
      prop.reviews = prop.reviews.filter((r) => r.id !== reviewId);
    }

    const propInList = this.state.rawProperties.find((p) => p.id === prop.id);
    if (propInList && Array.isArray(propInList.reviews)) {
      propInList.reviews = propInList.reviews.filter((r) => r.id !== reviewId);
    }

    this.updateCalculations();
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });

    this.showToast('Review removed.');
    this.render();
  }

  render() {
    const container = document.getElementById('reviews-ratings-page');
    if (!container) return;

    renderReviewsRatingsDashboard(
      container,
      {
        properties: this.state.filteredProperties,
        summary: this.state.summary,
        searchQuery: this.state.searchQuery,
        filter: this.state.filter,
        sort: this.state.sort,
        lastUpdated: this.state.lastUpdated,
        selectedProperty: this.state.selectedProperty,
        isSyncing: this.state.isSyncing,
        syncToastMessage: this.state.syncToastMessage,
        reviewModalFilter: this.state.reviewModalFilter,
        reviewModalSearch: this.state.reviewModalSearch,
        isEditingLinks: this.state.isEditingLinks,
        isAddingReview: this.state.isAddingReview
      },
      {
        onBack: () => {
          if (this.navigationManager) {
            this.navigationManager.showPreviousPage('landing');
          }
        },
        onSyncReviews: () => {
          this.syncReviews();
        },
        onCloseToast: () => {
          this.state.syncToastMessage = null;
          this.render();
        },
        onSearch: (query) => {
          this.state.searchQuery = query;
          this.updateCalculations();
          this.render();
        },
        onFilter: (filterKey) => {
          this.state.filter = filterKey;
          this.updateCalculations();
          this.render();
        },
        onSort: (sortKey) => {
          this.state.sort = sortKey;
          this.updateCalculations();
          this.render();
        },
        onSelectProperty: (propertyId, openInEditLinks = false) => {
          this.state.selectedProperty = this.state.rawProperties.find((p) => p.id === propertyId) || null;
          this.state.reviewModalFilter = 'all';
          this.state.reviewModalSearch = '';
          this.state.isEditingLinks = Boolean(openInEditLinks);
          this.state.isAddingReview = false;
          this.render();
        },
        onCloseDetailModal: () => {
          this.state.selectedProperty = null;
          this.state.isEditingLinks = false;
          this.state.isAddingReview = false;
          this.render();
        },
        onModalReviewFilter: (filterKey) => {
          this.state.reviewModalFilter = filterKey;
          this.render();
        },
        onModalReviewSearch: (searchQuery) => {
          this.state.reviewModalSearch = searchQuery;
          this.render();
        },
        onToggleEditLinks: () => {
          this.state.isEditingLinks = !this.state.isEditingLinks;
          this.render();
        },
        onSaveLinks: (links) => {
          this.savePropertyLinks(links);
        },
        onToggleAddReview: () => {
          this.state.isAddingReview = !this.state.isAddingReview;
          this.render();
        },
        onAddReview: (reviewData) => {
          this.addPropertyReview(reviewData);
        },
        onDeleteReview: (reviewId) => {
          this.deletePropertyReview(reviewId);
        }
      }
    );
  }
}

