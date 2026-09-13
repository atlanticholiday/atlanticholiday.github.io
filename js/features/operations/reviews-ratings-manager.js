import {
  calculatePortfolioSummary,
  filterAndSortProperties
} from './reviews-ratings-utils.js';
import { renderReviewsRatingsDashboard } from './reviews-ratings-view.js';

const STORAGE_KEY = 'atlantic_holiday_property_reviews_cache';

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
      reviewModalSearch: ''
    };

    this.initialized = false;
    this._toastTimer = null;
    this.loadFromStorage();
  }

  setNavigationManager(navManager) {
    this.navigationManager = navManager;
  }

  init() {
    if (this.initialized) {
      this.render();
      return;
    }

    this.initialized = true;
    this.render();
    this.loadFromServer();
  }

  loadFromStorage() {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.properties?.length) {
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
        reviewModalSearch: this.state.reviewModalSearch
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
        onSelectProperty: (propertyId) => {
          this.state.selectedProperty = this.state.rawProperties.find((p) => p.id === propertyId) || null;
          this.state.reviewModalFilter = 'all';
          this.state.reviewModalSearch = '';
          this.render();
        },
        onCloseDetailModal: () => {
          this.state.selectedProperty = null;
          this.render();
        },
        onModalReviewFilter: (filterKey) => {
          this.state.reviewModalFilter = filterKey;
          this.render();
        },
        onModalReviewSearch: (searchQuery) => {
          this.state.reviewModalSearch = searchQuery;
          this.render();
        }
      }
    );
  }
}

