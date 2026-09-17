import {
  calculatePortfolioSummary,
  filterAndSortProperties,
  isPropertyArchived
} from './reviews-ratings-utils.js';
import { renderReviewsRatingsDashboard } from './reviews-ratings-view.js';

const STORAGE_KEY = 'atlantic_holiday_property_reviews_cache_v5';
const STORAGE_KEY_OVERRIDES = 'atlantic_holiday_reviews_user_overrides_v1';

function normalizePropName(name = '') {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/by atlantic holiday/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function mergePlatformReviews(serverReviews = [], localReviews = [], deletedIds = new Set()) {
  const sRevs = Array.isArray(serverReviews) ? serverReviews : [];
  const lRevs = Array.isArray(localReviews) ? localReviews : [];

  const map = new Map();
  // Server reviews are primary scraped reviews
  for (const r of sRevs) {
    if (!r) continue;
    const id = r.id || r.sourceId;
    if (id && deletedIds.has(id)) continue;
    map.set(id || `srv-${map.size}`, r);
  }
  // Local reviews may contain user additions or edits
  for (const r of lRevs) {
    if (!r) continue;
    const id = r.id || r.sourceId;
    if (id && deletedIds.has(id)) continue;
    if (id && map.has(id)) {
      map.set(id, { ...map.get(id), ...r });
    } else {
      map.set(id || `loc-${map.size}`, r);
    }
  }
  return Array.from(map.values());
}

function mergePlatformData(serverPlat, localPlat, deletedIds = new Set()) {
  if (!serverPlat && !localPlat) return null;
  if (!serverPlat) return localPlat;
  if (!localPlat) return serverPlat;

  const mergedReviews = mergePlatformReviews(serverPlat.reviews, localPlat.reviews, deletedIds);

  return {
    ...localPlat,
    ...serverPlat,
    score: serverPlat.score !== undefined && serverPlat.score !== null ? serverPlat.score : localPlat.score,
    reviewCount: serverPlat.reviewCount !== undefined && serverPlat.reviewCount !== null ? serverPlat.reviewCount : localPlat.reviewCount,
    subScores: {
      ...(localPlat.subScores || {}),
      ...(serverPlat.subScores || {})
    },
    reviews: mergedReviews,
    fetchedReviewCount: mergedReviews.length
  };
}

export class ReviewsRatingsManager {
  constructor(db = null, navigationManager = null, { getPropertiesManager = null } = {}) {
    this.db = db;
    this.navigationManager = navigationManager;
    this.getPropertiesManager = getPropertiesManager;
    this.propertiesManager = null;
    this.archivedPropertiesList = [];

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
      isAddingReview: false,
      activeTab: 'properties',
      activeModalTab: 'overview',
      improvementsFilter: 'all',
      improvementsSearch: '',
      viewMode: (typeof localStorage !== 'undefined' && localStorage.getItem('atlantic_holiday_reviews_view_mode')) || 'cards'
    };

    this.userOverrides = {};
    this.unsubscribeOverrides = null;
    this.unsubscribeProperties = null;
    this.initialized = false;
    this._toastTimer = null;

    if (typeof document !== 'undefined') {
      document.addEventListener('propertiesDataUpdated', () => {
        const pm = this.getPropertiesManager?.() || this.propertiesManager || (typeof window !== 'undefined' ? window?.propertiesManager : null);
        if (pm?.properties) {
          this.archivedPropertiesList = pm.properties.filter(
            (p) => p && (p.archived === true || p.status === 'archived')
          );
          this.syncArchivedStatusToRaw();
          this.updateCalculations();
          this.render();
        }
      });
    }

    this.loadFromStorage();
    this.setupFirestoreSync();
  }

  setPropertiesManager(propertiesManager) {
    this.propertiesManager = propertiesManager;
    if (propertiesManager?.properties) {
      this.archivedPropertiesList = propertiesManager.properties.filter(
        (p) => p && (p.archived === true || p.status === 'archived')
      );
    }
    this.syncArchivedStatusToRaw();
    this.updateCalculations();
    this.render();
  }

  setNavigationManager(navManager) {
    this.navigationManager = navManager;
  }

  hasAccess() {
    if (!this.navigationManager) return true;
    return this.navigationManager.canOpenPage?.('reviewsRatings') !== false;
  }

  syncAccessVisibility() {
    if (!this.hasAccess()) {
      const container = document.getElementById('reviews-ratings-page');
      if (container) container.innerHTML = '';
      this.state.rawProperties = [];
      this.state.filteredProperties = [];
    }
  }

  init() {
    if (!this.hasAccess()) {
      this.render();
      return;
    }
    this.render();
    this.loadFromServer();
  }

  loadFromStorage() {
    try {
      // Purge legacy sample caches
      ['v1', 'v2', 'v3', 'v4'].forEach((v) => {
        try { localStorage.removeItem(`atlantic_holiday_property_reviews_cache_${v}`); } catch {}
      });
      try { localStorage.removeItem('atlantic_holiday_property_reviews_cache'); } catch {}

      const cachedOverrides = localStorage.getItem(STORAGE_KEY_OVERRIDES);
      if (cachedOverrides) {
        this.userOverrides = JSON.parse(cachedOverrides) || {};
      }

      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed.properties) && parsed.properties.length > 0) {
          this.state.rawProperties = parsed.properties;
          this.state.lastUpdated = parsed.lastUpdated || null;
          this.applyUserOverrides();
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

  saveOverridesToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(this.userOverrides));
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Failed to cache user overrides:', err);
    }
  }

  async setupFirestoreSync() {
    if (!this.db) return;
    try {
      const { doc, collection, onSnapshot } = await import(
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
      );
      const docRef = doc(this.db, 'settings', 'propertyReviewOverrides');
      this.unsubscribeOverrides = onSnapshot(
        docRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const remoteOverrides = snapshot.data() || {};
            this.userOverrides = { ...this.userOverrides, ...remoteOverrides };
            this.saveOverridesToStorage();
            this.applyUserOverrides();
            this.updateCalculations();
            this.render();
          }
        },
        (err) => {
          console.warn('[ReviewsRatingsManager] Firestore overrides listener warning:', err?.message || err);
        }
      );

      try {
        const colRef = collection(this.db, 'properties');
        this.unsubscribeProperties = onSnapshot(
          colRef,
          (snapshot) => {
            this.archivedPropertiesList = snapshot.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((p) => p && (p.archived === true || p.status === 'archived'));
            this.syncArchivedStatusToRaw();
            this.updateCalculations();
            this.render();
          },
          (err) => {
            console.warn('[ReviewsRatingsManager] Firestore properties listener warning:', err?.message || err);
          }
        );
      } catch (err) {
        console.warn('[ReviewsRatingsManager] Could not listen to properties collection:', err?.message || err);
      }
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Failed to init Firestore sync:', err);
    }
  }

  async saveOverrideToFirestore(propId, overrideData) {
    if (!this.db) return;
    try {
      const { doc, setDoc, updateDoc } = await import(
        'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
      );
      const docRef = doc(this.db, 'settings', 'propertyReviewOverrides');
      await setDoc(docRef, { [propId]: overrideData }, { merge: true });

      // If matching property document exists in properties collection, update its listing URLs or archive state
      try {
        const propDoc = doc(this.db, 'properties', propId);
        const updatePayload = {};
        if (overrideData.bookingUrl !== undefined) updatePayload.bookingListingUrl = overrideData.bookingUrl;
        if (overrideData.airbnbUrl !== undefined) updatePayload.airbnbListingUrl = overrideData.airbnbUrl;
        if (overrideData.archived !== undefined) {
          updatePayload.archived = Boolean(overrideData.archived);
          updatePayload.status = overrideData.archived ? 'archived' : 'active';
        }
        if (Object.keys(updatePayload).length > 0) {
          updateDoc(propDoc, updatePayload).catch(() => {});
        }
      } catch {}
    } catch (err) {
      console.warn('[ReviewsRatingsManager] Could not save override to Firestore:', err?.message || err);
    }
  }

  applyUserOverrides() {
    if (!this.userOverrides || typeof this.userOverrides !== 'object') return;
    for (const [propId, override] of Object.entries(this.userOverrides)) {
      if (!override || typeof override !== 'object') continue;
      const prop = this.state.rawProperties.find((p) => p.id === propId);
      if (!prop) continue;

      if (override.archived !== undefined) prop.archived = Boolean(override.archived);
      if (override.bookingUrl !== undefined) prop.bookingUrl = override.bookingUrl;
      if (override.airbnbUrl !== undefined) prop.airbnbUrl = override.airbnbUrl;

      if (override.bookingScore !== undefined || override.bookingClean !== undefined || override.bookingCount !== undefined) {
        if (!prop.booking) prop.booking = { status: 'success', subScores: {}, reviews: [] };
        if (override.bookingScore !== undefined && override.bookingScore !== null && override.bookingScore !== '') {
          prop.booking.score = Number(override.bookingScore);
        }
        if (override.bookingClean !== undefined && override.bookingClean !== null && override.bookingClean !== '') {
          if (!prop.booking.subScores) prop.booking.subScores = {};
          prop.booking.subScores.cleanliness = Number(override.bookingClean);
        }
        if (override.bookingCount !== undefined && override.bookingCount !== null && override.bookingCount !== '') {
          prop.booking.reviewCount = parseInt(override.bookingCount, 10);
        }
      }

      if (override.airbnbScore !== undefined || override.airbnbClean !== undefined || override.airbnbCount !== undefined) {
        if (!prop.airbnb) prop.airbnb = { status: 'success', subScores: {}, reviews: [] };
        if (override.airbnbScore !== undefined && override.airbnbScore !== null && override.airbnbScore !== '') {
          prop.airbnb.score = Number(override.airbnbScore);
        }
        if (override.airbnbClean !== undefined && override.airbnbClean !== null && override.airbnbClean !== '') {
          if (!prop.airbnb.subScores) prop.airbnb.subScores = {};
          prop.airbnb.subScores.cleanliness = Number(override.airbnbClean);
        }
        if (override.airbnbCount !== undefined && override.airbnbCount !== null && override.airbnbCount !== '') {
          prop.airbnb.reviewCount = parseInt(override.airbnbCount, 10);
        }
      }

      if (Array.isArray(override.deletedReviewIds) && override.deletedReviewIds.length > 0) {
        const delSet = new Set(override.deletedReviewIds);
        if (Array.isArray(prop.reviews)) {
          prop.reviews = prop.reviews.filter((r) => !delSet.has(r.id) && !delSet.has(r.sourceId));
        }
        if (Array.isArray(prop.booking?.reviews)) {
          prop.booking.reviews = prop.booking.reviews.filter((r) => !delSet.has(r.id) && !delSet.has(r.sourceId));
          prop.booking.fetchedReviewCount = prop.booking.reviews.length;
        }
        if (Array.isArray(prop.airbnb?.reviews)) {
          prop.airbnb.reviews = prop.airbnb.reviews.filter((r) => !delSet.has(r.id) && !delSet.has(r.sourceId));
          prop.airbnb.fetchedReviewCount = prop.airbnb.reviews.length;
        }
      }
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

  mergeServerDataset(dataset) {
    if (!dataset || !Array.isArray(dataset.properties)) return;
    const existingMap = new Map((this.state.rawProperties || []).map((p) => [p.id, p]));
    const merged = dataset.properties.map((serverProp) => {
      const local = existingMap.get(serverProp.id);
      const propOverrides = this.userOverrides?.[serverProp.id] || {};
      const deletedIds = new Set(Array.isArray(propOverrides.deletedReviewIds) ? propOverrides.deletedReviewIds : []);

      if (!local) {
        return {
          ...serverProp,
          booking: mergePlatformData(serverProp.booking, null, deletedIds),
          airbnb: mergePlatformData(serverProp.airbnb, null, deletedIds),
          reviews: (serverProp.reviews || []).filter((r) => {
            const id = r.id || r.sourceId;
            return !id || !deletedIds.has(id);
          })
        };
      }

      const mergedTopReviews = [
        ...(serverProp.reviews || []),
        ...((local.reviews || []).filter((lr) => !(serverProp.reviews || []).some((sr) => (sr.id || sr.sourceId) === (lr.id || lr.sourceId))))
      ].filter((r) => {
        const id = r.id || r.sourceId;
        return !id || !deletedIds.has(id);
      });

      return {
        ...serverProp,
        bookingUrl: local.bookingUrl || serverProp.bookingUrl || '',
        airbnbUrl: local.airbnbUrl || serverProp.airbnbUrl || '',
        booking: mergePlatformData(serverProp.booking, local.booking, deletedIds),
        airbnb: mergePlatformData(serverProp.airbnb, local.airbnb, deletedIds),
        reviews: mergedTopReviews
      };
    });
    this.state.rawProperties = merged;
    // Layer user overrides on top of server data
    this.applyUserOverrides();
    // Keep selectedProperty in sync with freshly merged property
    if (this.state.selectedProperty) {
      this.state.selectedProperty =
        this.state.rawProperties.find((p) => p.id === this.state.selectedProperty.id) ||
        this.state.selectedProperty;
    }
    this.state.lastUpdated = dataset.lastUpdated || this.state.lastUpdated;
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });
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
          this.mergeServerDataset(dataset);
          this.updateCalculations();
          const lastUpdatedFormatted = this.state.lastUpdated
            ? new Date(this.state.lastUpdated).toLocaleString('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })
            : null;
          this.showToast(
            lastUpdatedFormatted
              ? `Reviews dataset refreshed from server (scraped: ${lastUpdatedFormatted})`
              : 'Reviews dataset refreshed from server'
          );
        } else {
          this.showToast('Reviews dataset refreshed.');
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
          this.mergeServerDataset(dataset);
          this.updateCalculations();
          this.render();
        }
      }
    } catch (err) {
      console.log('[ReviewsRatingsManager] Could not load fresh reviews from server-data, using cached.');
    }
  }

  syncArchivedStatusToRaw() {
    const archivedDocIds = new Set();
    const archivedNames = new Set();
    const archivedUrls = new Set();

    const pm = this.getPropertiesManager?.() || this.propertiesManager || (typeof window !== 'undefined' ? window?.propertiesManager : null);
    const sourceProperties = [
      ...(this.archivedPropertiesList || []),
      ...((pm?.properties || []).filter((p) => p && (p.archived === true || p.status === 'archived')))
    ];

    for (const p of sourceProperties) {
      if (p.id) archivedDocIds.add(String(p.id));
      if (p.name) archivedNames.add(normalizePropName(p.name));
      if (p.displayName) archivedNames.add(normalizePropName(p.displayName));
      if (p.title) archivedNames.add(normalizePropName(p.title));
      if (p.bookingListingUrl) archivedUrls.add(p.bookingListingUrl.toLowerCase().trim());
      if (p.airbnbListingUrl) archivedUrls.add(p.airbnbListingUrl.toLowerCase().trim());
    }

    for (const prop of (this.state.rawProperties || [])) {
      if (this.userOverrides?.[prop.id]?.archived !== undefined) {
        prop.archived = Boolean(this.userOverrides[prop.id].archived);
        continue;
      }

      const normName = normalizePropName(prop.name);
      const bUrl = (prop.bookingUrl || '').toLowerCase().trim();
      const aUrl = (prop.airbnbUrl || '').toLowerCase().trim();

      const matchesArchived =
        archivedDocIds.has(String(prop.id)) ||
        (normName && archivedNames.has(normName)) ||
        (bUrl && archivedUrls.has(bUrl)) ||
        (aUrl && archivedUrls.has(aUrl));

      if (matchesArchived) {
        prop.archived = true;
      } else if (prop.status === 'archived') {
        prop.archived = true;
      } else if (prop.archived === undefined) {
        prop.archived = false;
      }
    }
  }

  async toggleArchiveProperty(propertyId) {
    if (!propertyId) return;
    const prop = this.state.rawProperties.find((p) => p.id === propertyId);
    if (!prop) return;

    const newArchived = !isPropertyArchived(prop);
    prop.archived = newArchived;
    if (this.state.selectedProperty && this.state.selectedProperty.id === propertyId) {
      this.state.selectedProperty.archived = newArchived;
    }

    if (!this.userOverrides[propertyId]) {
      this.userOverrides[propertyId] = {};
    }
    this.userOverrides[propertyId].archived = newArchived;

    this.saveOverridesToStorage();
    await this.saveOverrideToFirestore(propertyId, this.userOverrides[propertyId]);

    // Also update properties collection document if possible
    if (this.db) {
      try {
        const { doc, updateDoc } = await import(
          'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js'
        );
        const matching = (this.archivedPropertiesList || []).find((p) =>
          p.id === propertyId ||
          normalizePropName(p.name) === normalizePropName(prop.name)
        );
        const targetId = matching?.id || propertyId;
        const propRef = doc(this.db, 'properties', targetId);
        await updateDoc(propRef, {
          archived: newArchived,
          status: newArchived ? 'archived' : 'active'
        });
      } catch (err) {
        console.warn('[ReviewsRatingsManager] Could not update properties doc archive state:', err?.message || err);
      }
    }

    this.updateCalculations();
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });

    this.showToast(
      newArchived
        ? `Property "${prop.name}" has been archived.`
        : `Property "${prop.name}" has been restored to active.`
    );
    this.render();
  }

  updateCalculations() {
    this.syncArchivedStatusToRaw();
    this.state.summary = calculatePortfolioSummary(this.state.rawProperties);
    this.state.filteredProperties = filterAndSortProperties(this.state.rawProperties, {
      search: this.state.searchQuery,
      filter: this.state.filter,
      sort: this.state.sort
    });
  }

  savePropertyLinks({
    bookingUrl,
    airbnbUrl,
    bookingScore,
    bookingClean,
    bookingCount,
    airbnbScore,
    airbnbClean,
    airbnbCount
  } = {}) {
    if (!this.state.selectedProperty) return;

    const prop = this.state.selectedProperty;
    const propId = prop.id;

    if (bookingUrl !== undefined) prop.bookingUrl = bookingUrl || '';
    if (airbnbUrl !== undefined) prop.airbnbUrl = airbnbUrl || '';

    // Direct Score & Cleanliness updates
    if (bookingScore !== undefined && bookingScore !== '') {
      if (!prop.booking) prop.booking = { status: 'success', subScores: {}, reviews: [] };
      prop.booking.score = Number(bookingScore);
    }
    if (bookingClean !== undefined && bookingClean !== '') {
      if (!prop.booking) prop.booking = { status: 'success', subScores: {}, reviews: [] };
      if (!prop.booking.subScores) prop.booking.subScores = {};
      prop.booking.subScores.cleanliness = Number(bookingClean);
    }
    if (bookingCount !== undefined && bookingCount !== '') {
      if (!prop.booking) prop.booking = { status: 'success', subScores: {}, reviews: [] };
      prop.booking.reviewCount = parseInt(bookingCount, 10);
    }

    if (airbnbScore !== undefined && airbnbScore !== '') {
      if (!prop.airbnb) prop.airbnb = { status: 'success', subScores: {}, reviews: [] };
      prop.airbnb.score = Number(airbnbScore);
    }
    if (airbnbClean !== undefined && airbnbClean !== '') {
      if (!prop.airbnb) prop.airbnb = { status: 'success', subScores: {}, reviews: [] };
      if (!prop.airbnb.subScores) prop.airbnb.subScores = {};
      prop.airbnb.subScores.cleanliness = Number(airbnbClean);
    }
    if (airbnbCount !== undefined && airbnbCount !== '') {
      if (!prop.airbnb) prop.airbnb = { status: 'success', subScores: {}, reviews: [] };
      prop.airbnb.reviewCount = parseInt(airbnbCount, 10);
    }

    const propInList = this.state.rawProperties.find((p) => p.id === propId);
    if (propInList) {
      propInList.bookingUrl = prop.bookingUrl;
      propInList.airbnbUrl = prop.airbnbUrl;
      propInList.booking = prop.booking;
      propInList.airbnb = prop.airbnb;
    }

    // Record user override so it survives all future server refreshes
    const override = {
      bookingUrl: prop.bookingUrl,
      airbnbUrl: prop.airbnbUrl
    };
    if (bookingScore !== undefined && bookingScore !== '') override.bookingScore = Number(bookingScore);
    if (bookingClean !== undefined && bookingClean !== '') override.bookingClean = Number(bookingClean);
    if (bookingCount !== undefined && bookingCount !== '') override.bookingCount = parseInt(bookingCount, 10);
    if (airbnbScore !== undefined && airbnbScore !== '') override.airbnbScore = Number(airbnbScore);
    if (airbnbClean !== undefined && airbnbClean !== '') override.airbnbClean = Number(airbnbClean);
    if (airbnbCount !== undefined && airbnbCount !== '') override.airbnbCount = parseInt(airbnbCount, 10);

    this.userOverrides[propId] = {
      ...(this.userOverrides[propId] || {}),
      ...override
    };
    this.saveOverridesToStorage();
    this.saveOverrideToFirestore(propId, this.userOverrides[propId]);

    this.state.isEditingLinks = false;
    this.updateCalculations();
    this.saveToStorage({
      lastUpdated: this.state.lastUpdated,
      properties: this.state.rawProperties
    });

    this.showToast(`Details and ratings saved for ${prop.name}!`);
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
      cleanlinessScore: cleanVal,
      response: reviewData.response || '',
      hasResponse: Boolean(reviewData.response?.trim())
    };

    prop.reviews.unshift(newRev);

    const propInList = this.state.rawProperties.find((p) => p.id === prop.id);
    if (propInList && propInList !== prop) {
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

  deletePropertyReview(reviewId, propertyId = null) {
    let prop = this.state.selectedProperty;
    if (!prop && propertyId) {
      prop = this.state.rawProperties.find((p) => p.id === propertyId);
    }
    if (!prop) {
      prop = this.state.rawProperties.find((p) =>
        (p.reviews || []).some((r) => r.id === reviewId || r.sourceId === reviewId) ||
        (p.booking?.reviews || []).some((r) => r.id === reviewId || r.sourceId === reviewId) ||
        (p.airbnb?.reviews || []).some((r) => r.id === reviewId || r.sourceId === reviewId)
      );
    }
    if (!prop) return;
    const propId = prop.id;

    if (!this.userOverrides[propId]) this.userOverrides[propId] = {};
    if (!Array.isArray(this.userOverrides[propId].deletedReviewIds)) {
      this.userOverrides[propId].deletedReviewIds = [];
    }
    if (!this.userOverrides[propId].deletedReviewIds.includes(reviewId)) {
      this.userOverrides[propId].deletedReviewIds.push(reviewId);
    }
    this.saveOverridesToStorage();
    this.saveOverrideToFirestore(propId, this.userOverrides[propId]);

    const filterRev = (list) => (Array.isArray(list) ? list.filter((r) => r.id !== reviewId && r.sourceId !== reviewId) : []);

    prop.reviews = filterRev(prop.reviews);
    if (prop.booking) {
      prop.booking.reviews = filterRev(prop.booking.reviews);
      prop.booking.fetchedReviewCount = prop.booking.reviews.length;
    }
    if (prop.airbnb) {
      prop.airbnb.reviews = filterRev(prop.airbnb.reviews);
      prop.airbnb.fetchedReviewCount = prop.airbnb.reviews.length;
    }

    const propInList = this.state.rawProperties.find((p) => p.id === propId);
    if (propInList && propInList !== prop) {
      propInList.reviews = filterRev(propInList.reviews);
      if (propInList.booking) {
        propInList.booking.reviews = filterRev(propInList.booking.reviews);
        propInList.booking.fetchedReviewCount = propInList.booking.reviews.length;
      }
      if (propInList.airbnb) {
        propInList.airbnb.reviews = filterRev(propInList.airbnb.reviews);
        propInList.airbnb.fetchedReviewCount = propInList.airbnb.reviews.length;
      }
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

    if (!this.hasAccess()) {
      container.innerHTML = `
        <div class="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div class="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full text-center shadow-sm space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-xl">
              <i class="fas fa-lock"></i>
            </div>
            <h2 class="text-lg font-bold text-gray-900">Access Restricted</h2>
            <p class="text-sm text-gray-500 leading-relaxed">
              You do not have permission to view Reviews & Ratings. Please contact an administrator if you require access.
            </p>
            <button id="reviews-access-back-btn" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 text-sm font-medium transition-colors">
              <i class="fas fa-arrow-left text-xs"></i>
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>
      `;
      container.querySelector('#reviews-access-back-btn')?.addEventListener('click', () => {
        this.navigationManager?.showLandingPage?.();
      });
      return;
    }

    renderReviewsRatingsDashboard(
      container,
      {
        properties: this.state.filteredProperties,
        rawProperties: this.state.rawProperties,
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
        isAddingReview: this.state.isAddingReview,
        activeTab: this.state.activeTab,
        activeModalTab: this.state.activeModalTab,
        improvementsFilter: this.state.improvementsFilter,
        improvementsSearch: this.state.improvementsSearch,
        viewMode: this.state.viewMode
      },
      {
        onBack: () => {
          if (this.navigationManager) {
            this.navigationManager.showPreviousPage('landing');
          }
        },
        onViewModeChange: (mode) => {
          this.state.viewMode = mode;
          try {
            localStorage.setItem('atlantic_holiday_reviews_view_mode', mode);
          } catch {}
          this.render();
        },
        onTabChange: (tab) => {
          this.state.activeTab = tab;
          this.render();
        },
        onImprovementsFilter: (category) => {
          this.state.improvementsFilter = category;
          this.render();
        },
        onImprovementsSearch: (query) => {
          this.state.improvementsSearch = query;
          this.render();
        },
        onModalTabChange: (tab) => {
          this.state.activeModalTab = tab;
          this.render();
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
          this.state.activeModalTab = openInEditLinks ? 'settings' : 'overview';
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
        onDeleteReview: (reviewId, propertyId) => {
          this.deletePropertyReview(reviewId, propertyId);
        },
        onToggleArchive: () => {
          if (this.state.selectedProperty) {
            this.toggleArchiveProperty(this.state.selectedProperty.id);
          }
        }
      }
    );
  }
}
