import {
  formatScore,
  getCleanlinessStatus,
  isAttentionNeeded,
  getAllPropertyReviews,
  getLatestReviewSnippet,
  filterPropertyReviews
} from './reviews-ratings-utils.js';

export function renderReviewsRatingsDashboard(container, state, handlers) {
  if (!container) return;

  const {
    properties = [],
    summary = {},
    searchQuery = '',
    filter = 'all',
    sort = 'name-asc',
    lastUpdated = null,
    selectedProperty = null,
    isSyncing = false,
    syncToastMessage = null,
    reviewModalFilter = 'all',
    reviewModalSearch = '',
    isEditingLinks = false,
    isAddingReview = false
  } = state;

  const lastUpdatedFormatted = lastUpdated
    ? new Date(lastUpdated).toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Not yet synchronized';

  container.innerHTML = `
    <div class="reviews-page-wrapper bg-slate-50 min-h-screen pb-16">
      <!-- Sync Status Toast -->
      ${
        syncToastMessage
          ? `
        <div id="reviews-sync-toast" class="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm font-medium sticky top-0 z-30 animate-fade-in">
          <div class="max-w-7xl mx-auto px-4 w-full flex items-center justify-between">
            <div class="flex items-center gap-2">
              <i class="fas fa-check-circle text-emerald-200 text-base"></i>
              <span>${escapeHtml(syncToastMessage)}</span>
            </div>
            <button id="toast-close-btn" class="text-white/80 hover:text-white text-xs px-2 py-1 rounded">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      `
          : ''
      }

      <!-- Top Navigation Bar -->
      <header class="bg-white border-b border-gray-200 sticky ${syncToastMessage ? 'top-10' : 'top-0'} z-20 transition-all">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <div class="flex items-center gap-4">
              <button id="reviews-back-btn" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 text-sm font-medium transition-colors shadow-sm">
                <i class="fas fa-arrow-left text-xs"></i>
                <span>Back</span>
              </button>
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold">
                  <i class="fas fa-star"></i>
                </div>
                <div>
                  <h1 class="text-lg font-bold text-gray-900 leading-tight">Reviews & Ratings</h1>
                  <p class="text-xs text-gray-500">Live guest satisfaction and verified OTA performance</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="hidden sm:flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <i class="fas fa-clock text-gray-400"></i>
                <span>Last updated: <strong class="text-gray-700">${lastUpdatedFormatted}</strong></span>
              </div>
              <button
                id="reviews-sync-btn"
                ${isSyncing ? 'disabled' : ''}
                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm font-semibold shadow-sm transition-all ${
                  isSyncing ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'
                }"
              >
                <i class="fas fa-sync-alt ${isSyncing ? 'fa-spin' : ''}"></i>
                <span>${isSyncing ? 'Syncing Reviews...' : 'Sync Reviews'}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <!-- KPI Summary Cards -->
        <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Airbnb Rating Card -->
          <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
            <div class="flex items-center justify-between text-rose-600 mb-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Airbnb Average</span>
              <i class="fab fa-airbnb text-xl"></i>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-gray-900">${summary.airbnbAvg ? `${summary.airbnbAvg} ★` : '—'}</span>
              <span class="text-xs text-gray-500 font-medium">/ 5.0</span>
            </div>
            <p class="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full ${summary.airbnbAvg >= 4.8 ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
              Superhost benchmark: 4.80
            </p>
          </div>

          <!-- Booking.com Score Card -->
          <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
            <div class="flex items-center justify-between text-blue-600 mb-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Booking.com Score</span>
              <i class="fas fa-hotel text-xl"></i>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-gray-900">${summary.bookingAvg ? `${summary.bookingAvg}` : '—'}</span>
              <span class="text-xs text-gray-500 font-medium">/ 10.0</span>
            </div>
            <p class="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full ${summary.bookingAvg >= 9.0 ? 'bg-emerald-500' : 'bg-amber-500'}"></span>
              Target benchmark: 9.00
            </p>
          </div>

          <!-- Cleanliness Benchmark Card -->
          <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
            <div class="flex items-center justify-between text-emerald-600 mb-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Cleanliness Index</span>
              <i class="fas fa-broom text-xl"></i>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-gray-900">${summary.cleanlinessAvgAirbnb ? `${summary.cleanlinessAvgAirbnb} ★` : (summary.cleanlinessAvgBooking ? `${summary.cleanlinessAvgBooking}` : '—')}</span>
              <span class="text-xs text-gray-500 font-medium">${summary.cleanlinessAvgAirbnb ? '/ 5.0' : '/ 10.0'}</span>
            </div>
            <p class="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
              Directly aligned with Cleaning AH
            </p>
          </div>

          <!-- Total Reviews Card -->
          <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
            <div class="flex items-center justify-between text-indigo-600 mb-3">
              <span class="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Reviews</span>
              <i class="fas fa-comments text-xl"></i>
            </div>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-extrabold text-gray-900">${summary.totalReviews || 0}</span>
              <span class="text-xs text-gray-500 font-medium">verified guest reviews</span>
            </div>
            <p class="text-xs text-gray-500 mt-2 flex items-center gap-1.5">
              ${summary.attentionNeededCount > 0
                ? `<span class="text-rose-600 font-semibold"><i class="fas fa-exclamation-triangle text-xs mr-1"></i>${summary.attentionNeededCount} need attention</span>`
                : `<span class="text-emerald-600 font-medium"><i class="fas fa-check-circle text-xs mr-1"></i>All properties on track</span>`}
            </p>
          </div>
        </section>

        <!-- Filter & Search Toolbar -->
        <div class="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <!-- Search -->
          <div class="relative w-full md:w-80">
            <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              id="reviews-search-input"
              value="${escapeHtml(searchQuery)}"
              placeholder="Search properties or locations..."
              class="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-gray-50/50"
            />
          </div>

          <!-- Filter Pills & Sorting -->
          <div class="flex flex-wrap items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            <div class="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-medium">
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-filter="all">All (${properties.length})</button>
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'attention' ? 'bg-white text-rose-600 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-600'}" data-filter="attention">Needs Attention</button>
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'guest-favourite' ? 'bg-white text-amber-600 shadow-sm font-bold' : 'text-gray-600 hover:text-amber-600'}" data-filter="guest-favourite">Guest Favourite</button>
            </div>

            <div class="flex items-center gap-2">
              <select id="reviews-sort-select" class="px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500">
                <option value="name-asc" ${sort === 'name-asc' ? 'selected' : ''}>Name (A-Z)</option>
                <option value="name-desc" ${sort === 'name-desc' ? 'selected' : ''}>Name (Z-A)</option>
                <option value="airbnb-desc" ${sort === 'airbnb-desc' ? 'selected' : ''}>Highest Airbnb Score</option>
                <option value="booking-desc" ${sort === 'booking-desc' ? 'selected' : ''}>Highest Booking.com Score</option>
                <option value="cleanliness-desc" ${sort === 'cleanliness-desc' ? 'selected' : ''}>Highest Cleanliness</option>
                <option value="reviews-desc" ${sort === 'reviews-desc' ? 'selected' : ''}>Most Reviews</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Properties Scorecard Grid -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
          ${properties.length === 0
            ? `<div class="col-span-2 text-center py-16 bg-white rounded-3xl border border-gray-200 p-8">
                 <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
                   <i class="fas fa-search text-lg"></i>
                 </div>
                 <h3 class="text-base font-bold text-gray-800">No properties match your filter</h3>
                 <p class="text-sm text-gray-500 mt-1">Try clearing your search query or switching filters.</p>
               </div>`
            : properties.map((prop) => renderPropertyCard(prop)).join('')}
        </section>
      </main>

      <!-- Property Details Modal / Drawer -->
      ${selectedProperty ? renderPropertyDetailModal(selectedProperty, reviewModalFilter, reviewModalSearch, isEditingLinks, isAddingReview) : ''}
    </div>
  `;

  // Bind Events
  bindViewEvents(container, handlers);
}

function renderPropertyCard(prop) {
  const attention = isAttentionNeeded(prop);
  const cleanStatus = getCleanlinessStatus(prop);

  const airbnbScore = prop.airbnb?.score ? `${prop.airbnb.score.toFixed(1)} ★` : '—';
  const airbnbCount = prop.airbnb?.reviewCount ? `(${prop.airbnb.reviewCount})` : '';
  const airbnbClean = prop.airbnb?.subScores?.cleanliness ? `${prop.airbnb.subScores.cleanliness.toFixed(1)}` : '—';

  const bookingScore = prop.booking?.score ? `${prop.booking.score.toFixed(1)}` : '—';
  const bookingCount = prop.booking?.reviewCount ? `(${prop.booking.reviewCount})` : '';
  const bookingClean = prop.booking?.subScores?.cleanliness ? `${prop.booking.subScores.cleanliness.toFixed(1)}` : '—';

  const latestReview = getLatestReviewSnippet(prop);
  const allReviews = getAllPropertyReviews(prop);
  const totalReviewsCount = (prop.booking?.reviewCount || 0) + (prop.airbnb?.reviewCount || 0) || allReviews.length;

  return `
    <div class="bg-white rounded-3xl border ${attention ? 'border-rose-200 ring-2 ring-rose-100' : 'border-gray-200'} p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <!-- Card Header -->
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-lg font-bold text-gray-900">${escapeHtml(prop.name)}</h3>
              ${prop.airbnb?.badge === 'Guest favourite' ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fas fa-trophy text-[9px]"></i>Guest Favourite</span>` : ''}
            </div>
            <p class="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <i class="fas fa-map-marker-alt text-gray-400"></i>
              <span>${escapeHtml(prop.location || 'Madeira')}</span>
            </p>
          </div>

          <div class="flex items-center gap-1.5">
            ${attention
              ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><i class="fas fa-exclamation-circle"></i>Attention</span>`
              : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fas fa-check-circle"></i>Good</span>`}
          </div>
        </div>

        <!-- OTA Scores Comparison Grid -->
        <div class="grid grid-cols-2 gap-3 mb-4">
          <!-- Booking.com Box (Clickable) -->
          <${prop.bookingUrl ? `a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener noreferrer"` : 'div'} class="rounded-2xl p-4 bg-blue-50/50 border border-blue-100 flex flex-col justify-between ${prop.bookingUrl ? 'hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group' : ''}">
            <div>
              <div class="flex items-center justify-between text-blue-700 text-xs font-semibold mb-2">
                <span class="flex items-center gap-1.5 ${prop.bookingUrl ? 'group-hover:text-blue-900 group-hover:underline' : ''}">
                  <i class="fas fa-hotel"></i>
                  <span>Booking.com</span>
                </span>
                ${
                  prop.bookingUrl
                    ? `<span class="text-blue-500 group-hover:text-blue-700 transition-colors flex items-center gap-1 text-[11px] font-medium" title="Open listing in new tab">
                        <span class="text-[10px] hidden sm:group-hover:inline">Open</span>
                        <i class="fas fa-external-link-alt text-[10px]"></i>
                      </span>`
                    : `<span class="text-[10px] text-gray-400 font-normal">No link</span>`
                }
              </div>
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-black text-gray-900">${bookingScore}</span>
                <span class="text-xs text-gray-500">${bookingCount}</span>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-blue-100/80 text-[11px] text-gray-600 flex items-center justify-between">
              <span>Cleanliness:</span>
              <strong class="font-semibold text-gray-800">${bookingClean} / 10</strong>
            </div>
          </${prop.bookingUrl ? 'a' : 'div'}>

          <!-- Airbnb Box (Clickable) -->
          <${prop.airbnbUrl ? `a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener noreferrer"` : 'div'} class="rounded-2xl p-4 bg-rose-50/50 border border-rose-100 flex flex-col justify-between ${prop.airbnbUrl ? 'hover:bg-rose-50 hover:border-rose-300 hover:shadow-sm transition-all cursor-pointer group' : ''}">
            <div>
              <div class="flex items-center justify-between text-rose-700 text-xs font-semibold mb-2">
                <span class="flex items-center gap-1.5 ${prop.airbnbUrl ? 'group-hover:text-rose-900 group-hover:underline' : ''}">
                  <i class="fab fa-airbnb text-sm"></i>
                  <span>Airbnb</span>
                </span>
                ${
                  prop.airbnbUrl
                    ? `<span class="text-rose-500 group-hover:text-rose-700 transition-colors flex items-center gap-1 text-[11px] font-medium" title="Open listing in new tab">
                        <span class="text-[10px] hidden sm:group-hover:inline">Open</span>
                        <i class="fas fa-external-link-alt text-[10px]"></i>
                      </span>`
                    : `<span class="text-[10px] text-gray-400 font-normal">No link</span>`
                }
              </div>
              <div class="flex items-baseline gap-1.5">
                <span class="text-2xl font-black text-gray-900">${airbnbScore}</span>
                <span class="text-xs text-gray-500">${airbnbCount}</span>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-rose-100/80 text-[11px] text-gray-600 flex items-center justify-between">
              <span>Cleanliness:</span>
              <strong class="font-semibold text-gray-800">${airbnbClean} / 5.0</strong>
            </div>
          </${prop.airbnbUrl ? 'a' : 'div'}>
        </div>

        <!-- Latest Guest Review Snippet -->
        ${
          latestReview
            ? `
          <div class="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 mb-4 text-xs text-gray-700">
            <div class="flex items-center justify-between mb-1.5">
              <div class="flex items-center gap-1.5 text-[11px] font-semibold text-gray-800 truncate">
                <span class="w-5 h-5 rounded-full ${latestReview.platform === 'Airbnb' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'} flex items-center justify-center text-[10px] flex-shrink-0">
                  ${latestReview.platform === 'Airbnb' ? '<i class="fab fa-airbnb"></i>' : '<i class="fas fa-hotel"></i>'}
                </span>
                <span class="truncate">${escapeHtml(latestReview.author || 'Guest')}</span>
                ${latestReview.country ? `<span class="text-gray-400 font-normal">(${escapeHtml(latestReview.country)})</span>` : ''}
              </div>
              <span class="flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${latestReview.platform === 'Airbnb' ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">
                ${latestReview.platform === 'Airbnb' ? `${latestReview.score} ★` : `${latestReview.score} / 10`}
              </span>
            </div>
            <p class="text-xs text-gray-600 line-clamp-2 italic">“${escapeHtml(latestReview.comment || latestReview.title || '')}”</p>
            ${latestReview.positive ? `<p class="text-[11px] text-emerald-700 font-medium mt-1 truncate"><i class="fas fa-check text-emerald-500 mr-1 text-[10px]"></i>${escapeHtml(latestReview.positive)}</p>` : ''}
          </div>
        `
            : ''
        }
      </div>

      <!-- Footer Actions -->
      <div class="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <span class="text-[11px] text-gray-400 flex items-center gap-1 truncate">
          <i class="fas fa-comments text-gray-300"></i>
          <span>${allReviews.length > 0 ? `${allReviews.length} verified reviews` : `${totalReviewsCount} reviews`}</span>
        </span>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button class="reviews-card-edit-links-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-semibold transition-colors" data-id="${escapeHtml(prop.id)}" title="Edit Listing URLs">
            <i class="fas fa-link text-amber-500 text-[10px]"></i>
            <span>Links</span>
          </button>
          <button class="reviews-details-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors" data-id="${escapeHtml(prop.id)}">
            <span>Read reviews</span>
            <i class="fas fa-chevron-right text-[10px]"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderPropertyDetailModal(prop, activeFilter = 'all', searchQuery = '', isEditingLinks = false, isAddingReview = false) {
  const airbnbSubs = prop.airbnb?.subScores || {};
  const bookingSubs = prop.booking?.subScores || {};
  const allReviews = getAllPropertyReviews(prop);

  const bookingReviewsCount = allReviews.filter((r) => r.platform === 'Booking.com').length;
  const airbnbReviewsCount = allReviews.filter((r) => r.platform === 'Airbnb').length;

  const filteredReviews = filterPropertyReviews(allReviews, {
    platform: activeFilter === 'booking' ? 'Booking.com' : (activeFilter === 'airbnb' ? 'Airbnb' : 'all'),
    filter: activeFilter === 'positive' ? 'positive' : (activeFilter === 'attention' ? 'attention' : 'all'),
    search: searchQuery
  });

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[92vh] flex flex-col">
        <!-- Close Button -->
        <button id="modal-close-btn" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors z-10">
          <i class="fas fa-times text-sm"></i>
        </button>

        <!-- Header -->
        <div class="mb-5 pb-4 border-b border-gray-100 pr-10 flex-shrink-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wider text-amber-600">Property Reviews & Ratings</span>
            ${prop.airbnb?.badge === 'Guest favourite' ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fas fa-trophy text-[9px]"></i>Guest Favourite</span>` : ''}
          </div>
          <h2 class="text-2xl font-black text-gray-900 mt-1">${escapeHtml(prop.name)}</h2>
          <p class="text-xs text-gray-500 flex items-center gap-1 mt-1">
            <i class="fas fa-map-marker-alt text-gray-400"></i>
            <span>${escapeHtml(prop.location || 'Madeira')}</span>
            <span class="mx-1.5">•</span>
            <span>${allReviews.length} full guest reviews</span>
          </p>
        </div>

        <!-- Scrollable Modal Body -->
        <div class="overflow-y-auto space-y-6 flex-grow pr-1">
          <!-- OTA Listing Links Section -->
          <div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
            <div class="flex items-center justify-between mb-2.5">
              <h4 class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                <i class="fas fa-link text-amber-500"></i>
                <span>Listing URLs (for Automated Review Sync)</span>
              </h4>
              <button id="modal-toggle-edit-links-btn" class="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">
                ${isEditingLinks ? '<i class="fas fa-times mr-1"></i>Cancel' : '<i class="fas fa-pen mr-1"></i>Edit Links'}
              </button>
            </div>

            ${
              !isEditingLinks
                ? `
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div class="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
                  <div class="flex items-center gap-2 truncate pr-2">
                    <i class="fas fa-hotel text-blue-600 flex-shrink-0"></i>
                    <span class="truncate text-gray-700">${prop.bookingUrl ? escapeHtml(prop.bookingUrl) : '<span class="text-gray-400 italic">No Booking.com link added</span>'}</span>
                  </div>
                  ${prop.bookingUrl ? `<a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener" class="text-blue-500 hover:text-blue-700 p-1 flex-shrink-0" title="Open listing"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
                </div>

                <div class="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
                  <div class="flex items-center gap-2 truncate pr-2">
                    <i class="fab fa-airbnb text-rose-600 flex-shrink-0"></i>
                    <span class="truncate text-gray-700">${prop.airbnbUrl ? escapeHtml(prop.airbnbUrl) : '<span class="text-gray-400 italic">No Airbnb link added</span>'}</span>
                  </div>
                  ${prop.airbnbUrl ? `<a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener" class="text-rose-500 hover:text-rose-700 p-1 flex-shrink-0" title="Open listing"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
                </div>
              </div>
            `
                : `
              <div class="space-y-3 pt-1">
                <div>
                  <label class="block text-[11px] font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                    <i class="fas fa-hotel text-blue-600"></i> Booking.com Listing URL
                  </label>
                  <input
                    type="url"
                    id="edit-booking-url-input"
                    value="${escapeHtml(prop.bookingUrl || '')}"
                    placeholder="https://www.booking.com/hotel/pt/..."
                    class="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                    <i class="fab fa-airbnb text-rose-600"></i> Airbnb Listing URL
                  </label>
                  <input
                    type="url"
                    id="edit-airbnb-url-input"
                    value="${escapeHtml(prop.airbnbUrl || '')}"
                    placeholder="https://www.airbnb.pt/rooms/..."
                    class="w-full text-xs p-2.5 rounded-xl border border-gray-300 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
                  />
                </div>

                <div class="flex justify-end gap-2 pt-1">
                  <button id="modal-save-links-btn" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-sm">
                    <i class="fas fa-save text-[11px]"></i>
                    <span>Save Links</span>
                  </button>
                </div>
              </div>
            `
            }
          </div>

          <!-- Subscores Overview -->
          <div class="space-y-4">
            <!-- Booking.com Subscores -->
            <div class="rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
              <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 class="text-xs font-bold text-blue-900 flex items-center gap-2">
                  <i class="fas fa-hotel text-blue-600"></i>
                  <span>Booking.com Sub-category Ratings</span>
                  ${prop.bookingUrl ? `<a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 text-[11px] font-semibold underline flex items-center gap-1 ml-1" title="Open listing on Booking.com"><i class="fas fa-external-link-alt text-[9px]"></i>View listing</a>` : ''}
                </h3>
                <span class="text-xs font-bold text-blue-700">Overall: ${prop.booking?.score ? `${prop.booking.score} / 10` : '—'}</span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                ${renderSubScorePill('Cleanliness', bookingSubs.cleanliness, 10, 'broom')}
                ${renderSubScorePill('Staff', bookingSubs.staff, 10, 'user-tie')}
                ${renderSubScorePill('Facilities', bookingSubs.facilities, 10, 'concierge-bell')}
                ${renderSubScorePill('Comfort', bookingSubs.comfort, 10, 'couch')}
                ${renderSubScorePill('Value', bookingSubs.value, 10, 'tag')}
                ${renderSubScorePill('Location', bookingSubs.location, 10, 'map-marker-alt')}
              </div>
            </div>

            <!-- Airbnb Subscores -->
            <div class="rounded-2xl border border-rose-100 bg-rose-50/30 p-4">
              <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 class="text-xs font-bold text-rose-900 flex items-center gap-2">
                  <i class="fab fa-airbnb text-rose-600"></i>
                  <span>Airbnb Sub-category Ratings</span>
                  ${prop.airbnbUrl ? `<a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener noreferrer" class="text-rose-600 hover:text-rose-800 text-[11px] font-semibold underline flex items-center gap-1 ml-1" title="Open listing on Airbnb"><i class="fas fa-external-link-alt text-[9px]"></i>View listing</a>` : ''}
                </h3>
                <span class="text-xs font-bold text-rose-700">Overall: ${prop.airbnb?.score ? `${prop.airbnb.score} ★` : '—'}</span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                ${renderSubScorePill('Cleanliness', airbnbSubs.cleanliness, 5, 'broom')}
                ${renderSubScorePill('Accuracy', airbnbSubs.accuracy, 5, 'check-double')}
                ${renderSubScorePill('Check-in', airbnbSubs.checkin, 5, 'key')}
                ${renderSubScorePill('Communication', airbnbSubs.communication, 5, 'comment-dots')}
                ${renderSubScorePill('Location', airbnbSubs.location, 5, 'map-marker-alt')}
                ${renderSubScorePill('Value', airbnbSubs.value, 5, 'tag')}
              </div>
            </div>
          </div>

          <!-- Guest Reviews & Feedback Section -->
          <div class="pt-2">
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div>
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="text-base font-bold text-gray-900 flex items-center gap-2">
                    <i class="fas fa-comments text-amber-500"></i>
                    <span>Guest Reviews & Feedback (${allReviews.length})</span>
                  </h3>
                  <button id="modal-toggle-add-review-btn" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-xs transition-colors">
                    <i class="fas ${isAddingReview ? 'fa-times' : 'fa-plus'} text-[10px]"></i>
                    <span>${isAddingReview ? 'Cancel' : 'Add Review'}</span>
                  </button>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">Read detailed feedback, comments, and positive/negative points</p>
              </div>

              <!-- Search in reviews -->
              <div class="relative w-full sm:w-60">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  id="modal-review-search"
                  value="${escapeHtml(searchQuery)}"
                  placeholder="Search in reviews..."
                  class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-gray-50/50"
                />
              </div>
            </div>

            <!-- Add Review Inline Form -->
            ${
              isAddingReview
                ? `
              <form id="add-review-form" class="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 mb-4">
                <h4 class="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                  <i class="fas fa-edit text-amber-600"></i> Add Guest Review for ${escapeHtml(prop.name)}
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Guest Name *</label>
                    <input type="text" id="review-author-input" required placeholder="e.g. Charlotte M." class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Country</label>
                    <input type="text" id="review-country-input" placeholder="e.g. United Kingdom" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Platform</label>
                    <select id="review-platform-input" class="w-full p-2 rounded-xl border border-gray-300 bg-white">
                      <option value="Booking.com">Booking.com (Score / 10)</option>
                      <option value="Airbnb">Airbnb (Score / 5.0)</option>
                      <option value="Direct">Direct Guest (Score / 10)</option>
                    </select>
                  </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Overall Score *</label>
                    <input type="number" step="0.1" id="review-score-input" required placeholder="10 or 5.0" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Cleanliness Score</label>
                    <input type="number" step="0.1" id="review-clean-input" placeholder="9.5 or 5.0" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-gray-700 mb-1">Date</label>
                    <input type="date" id="review-date-input" value="${new Date().toISOString().split('T')[0]}" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-gray-700 mb-1">Review Title</label>
                  <input type="text" id="review-title-input" placeholder="e.g. Fantastic stay, super clean and stunning view!" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                </div>
                <div>
                  <label class="block text-[11px] font-semibold text-gray-700 mb-1">Full Comment</label>
                  <textarea id="review-comment-input" rows="2" placeholder="Write the guest feedback or comments here..." class="w-full p-2 rounded-xl border border-gray-300 bg-white"></textarea>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div>
                    <label class="block text-[11px] font-semibold text-emerald-800 mb-1">What was liked (positive)</label>
                    <input type="text" id="review-positive-input" placeholder="e.g. Spotlessly clean, quiet area, great terrace view" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                  <div>
                    <label class="block text-[11px] font-semibold text-amber-800 mb-1">Room for improvement (negative)</label>
                    <input type="text" id="review-negative-input" placeholder="e.g. Could use a few more coffee pods" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
                  </div>
                </div>
                <div class="flex justify-end gap-2 pt-1">
                  <button type="submit" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-sm">
                    <i class="fas fa-check text-[11px]"></i>
                    <span>Save Review</span>
                  </button>
                </div>
              </form>
            `
                : ''
            }

            <!-- Review Filter Pills -->
            <div class="flex flex-wrap items-center gap-1.5 mb-4 bg-gray-100 p-1 rounded-xl text-xs font-medium">
              <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-filter="all">All (${allReviews.length})</button>
              <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'booking' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-gray-600 hover:text-blue-700'}" data-filter="booking">Booking.com (${bookingReviewsCount})</button>
              <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'airbnb' ? 'bg-white text-rose-700 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-700'}" data-filter="airbnb">Airbnb (${airbnbReviewsCount})</button>
              <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'positive' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-gray-600 hover:text-emerald-700'}" data-filter="positive">Positive (9-10 / 5★)</button>
              <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'attention' ? 'bg-white text-rose-700 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-700'}" data-filter="attention">Needs Attention</button>
            </div>

            <!-- Review Cards List -->
            <div class="space-y-4">
              ${
                filteredReviews.length === 0
                  ? `
                <div class="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200 p-6 text-gray-500 text-xs">
                  <i class="fas fa-comment-slash text-2xl text-gray-400 mb-2"></i>
                  <p class="font-medium text-gray-700">No reviews match this filter</p>
                  <p class="mt-0.5 text-gray-400">Try clearing the search or switching review filters.</p>
                </div>
              `
                  : filteredReviews.map((r) => renderReviewItem(r)).join('')
              }
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <span class="text-xs text-gray-400">
            Showing ${filteredReviews.length} of ${allReviews.length} reviews
          </span>
          <button id="modal-ok-btn" class="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-black text-white font-medium text-sm transition-colors shadow-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderReviewItem(r) {
  const isAirbnb = r.platform === 'Airbnb';
  const scoreText = isAirbnb ? `${r.score} ★` : `${r.score} / 10`;
  const initials = getInitials(r.author);

  return `
    <div class="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow space-y-3">
      <!-- Review Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${isAirbnb ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-blue-50 text-blue-600 border border-blue-100'} flex items-center justify-center font-bold text-sm flex-shrink-0">
            ${initials}
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="text-sm font-bold text-gray-900">${escapeHtml(r.author || 'Guest')}</h4>
              ${r.country ? `<span class="text-xs text-gray-500 font-normal">(${escapeHtml(r.country)})</span>` : ''}
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="inline-flex items-center gap-1 text-[11px] font-semibold ${isAirbnb ? 'text-rose-600' : 'text-blue-600'}">
                ${isAirbnb ? '<i class="fab fa-airbnb"></i> Airbnb' : '<i class="fas fa-hotel"></i> Booking.com'}
              </span>
              <span class="text-gray-300">•</span>
              <span class="text-[11px] text-gray-400">${r.date ? new Date(r.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', day: 'numeric' }) : 'Verified Stay'}</span>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-end flex-shrink-0 gap-1.5">
          <div class="flex items-center gap-1.5">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${isAirbnb ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">
              ${scoreText}
            </span>
            <button class="review-delete-btn text-gray-400 hover:text-rose-600 transition-colors text-xs p-1" data-review-id="${escapeHtml(r.id)}" title="Delete review">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
          ${r.cleanlinessScore ? `<span class="text-[10px] text-emerald-700 font-semibold"><i class="fas fa-broom mr-1"></i>Cleanliness ${r.cleanlinessScore}</span>` : ''}
        </div>
      </div>

      <!-- Review Body -->
      ${r.title ? `<h5 class="text-xs font-bold text-gray-900">${escapeHtml(r.title)}</h5>` : ''}
      ${r.comment ? `<p class="text-xs text-gray-700 leading-relaxed">${escapeHtml(r.comment)}</p>` : ''}

      <!-- Highlight Boxes -->
      ${
        r.positive
          ? `
        <div class="rounded-xl bg-emerald-50/80 border border-emerald-100 p-2.5 text-xs text-emerald-900 flex items-start gap-2">
          <i class="fas fa-thumbs-up text-emerald-600 mt-0.5 text-xs flex-shrink-0"></i>
          <div>
            <strong class="font-semibold text-emerald-800">What was liked:</strong>
            <span>${escapeHtml(r.positive)}</span>
          </div>
        </div>
      `
          : ''
      }

      ${
        r.negative
          ? `
        <div class="rounded-xl bg-amber-50/80 border border-amber-100 p-2.5 text-xs text-amber-900 flex items-start gap-2">
          <i class="fas fa-exclamation-circle text-amber-600 mt-0.5 text-xs flex-shrink-0"></i>
          <div>
            <strong class="font-semibold text-amber-800">Room for improvement:</strong>
            <span>${escapeHtml(r.negative)}</span>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderSubScorePill(label, value, max, icon) {
  const valText = typeof value === 'number' ? value.toFixed(1) : '—';
  const isHigh = typeof value === 'number' && (max === 5 ? value >= 4.8 : value >= 9.0);

  return `
    <div class="bg-white rounded-xl p-2.5 border border-gray-200/80 flex items-center justify-between">
      <div class="flex items-center gap-2 truncate">
        <i class="fas fa-${icon} text-gray-400 text-xs flex-shrink-0"></i>
        <span class="text-xs text-gray-600 font-medium truncate">${label}</span>
      </div>
      <span class="text-xs font-bold ${isHigh ? 'text-emerald-600' : 'text-gray-800'} ml-1">${valText}</span>
    </div>
  `;
}

function bindViewEvents(container, handlers) {
  // Back button
  container.querySelector('#reviews-back-btn')?.addEventListener('click', () => {
    handlers.onBack?.();
  });

  // Sync button (instant in-app refresh, no terminal commands!)
  container.querySelector('#reviews-sync-btn')?.addEventListener('click', () => {
    handlers.onSyncReviews?.();
  });

  // Toast close button
  container.querySelector('#toast-close-btn')?.addEventListener('click', () => {
    handlers.onCloseToast?.();
  });

  // Search input
  const searchInput = container.querySelector('#reviews-search-input');
  searchInput?.addEventListener('input', (e) => {
    handlers.onSearch?.(e.target.value);
  });

  // Main filter buttons
  container.querySelectorAll('.reviews-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onFilter?.(btn.dataset.filter);
    });
  });

  // Sort select
  container.querySelector('#reviews-sort-select')?.addEventListener('change', (e) => {
    handlers.onSort?.(e.target.value);
  });

  // Details buttons on property cards
  container.querySelectorAll('.reviews-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onSelectProperty?.(btn.dataset.id, false);
    });
  });

  // Quick Links buttons on property cards
  container.querySelectorAll('.reviews-card-edit-links-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onSelectProperty?.(btn.dataset.id, true);
    });
  });

  // Detail Modal close
  container.querySelector('#modal-close-btn')?.addEventListener('click', () => {
    handlers.onCloseDetailModal?.();
  });
  container.querySelector('#modal-ok-btn')?.addEventListener('click', () => {
    handlers.onCloseDetailModal?.();
  });

  // Modal Review Filter Buttons
  container.querySelectorAll('.modal-review-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onModalReviewFilter?.(btn.dataset.filter);
    });
  });

  // Modal Review Search Input
  const modalSearchInput = container.querySelector('#modal-review-search');
  modalSearchInput?.addEventListener('input', (e) => {
    handlers.onModalReviewSearch?.(e.target.value);
  });

  // Modal Toggle Edit Links Button
  container.querySelector('#modal-toggle-edit-links-btn')?.addEventListener('click', () => {
    handlers.onToggleEditLinks?.();
  });

  // Modal Save Links Button
  container.querySelector('#modal-save-links-btn')?.addEventListener('click', () => {
    const bookingUrl = container.querySelector('#edit-booking-url-input')?.value.trim() || '';
    const airbnbUrl = container.querySelector('#edit-airbnb-url-input')?.value.trim() || '';
    handlers.onSaveLinks?.({ bookingUrl, airbnbUrl });
  });

  // Modal Toggle Add Review Button
  container.querySelector('#modal-toggle-add-review-btn')?.addEventListener('click', () => {
    handlers.onToggleAddReview?.();
  });

  // Add Review Form Submit
  container.querySelector('#add-review-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const author = container.querySelector('#review-author-input')?.value.trim() || '';
    const country = container.querySelector('#review-country-input')?.value.trim() || '';
    const platform = container.querySelector('#review-platform-input')?.value || 'Booking.com';
    const score = container.querySelector('#review-score-input')?.value || '';
    const cleanlinessScore = container.querySelector('#review-clean-input')?.value || '';
    const date = container.querySelector('#review-date-input')?.value || '';
    const title = container.querySelector('#review-title-input')?.value.trim() || '';
    const comment = container.querySelector('#review-comment-input')?.value.trim() || '';
    const positive = container.querySelector('#review-positive-input')?.value.trim() || '';
    const negative = container.querySelector('#review-negative-input')?.value.trim() || '';

    handlers.onAddReview?.({
      author,
      country,
      platform,
      score,
      cleanlinessScore,
      date,
      title,
      comment,
      positive,
      negative
    });
  });

  // Delete Review Buttons
  container.querySelectorAll('.review-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reviewId = btn.dataset.reviewId;
      if (reviewId) {
        handlers.onDeleteReview?.(reviewId);
      }
    });
  });
}

function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0] ? parts[0].slice(0, 2) : 'AH').toUpperCase();
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
