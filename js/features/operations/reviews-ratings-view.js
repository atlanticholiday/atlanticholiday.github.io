import {
  formatScore,
  getCleanlinessStatus,
  isAttentionNeeded
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
    showSyncModal = false
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
      <!-- Top Navigation Bar -->
      <header class="bg-white border-b border-gray-200 sticky top-0 z-20">
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
                  <p class="text-xs text-gray-500">Live guest satisfaction and OTA performance tracking</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-3">
              <div class="hidden sm:flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                <i class="fas fa-clock text-gray-400"></i>
                <span>Last updated: <strong class="text-gray-700">${lastUpdatedFormatted}</strong></span>
              </div>
              <button id="reviews-sync-btn" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-sm font-semibold shadow-sm transition-all">
                <i class="fas fa-sync-alt"></i>
                <span>Sync Reviews</span>
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
      ${selectedProperty ? renderPropertyDetailModal(selectedProperty) : ''}

      <!-- Sync Reviews Instructions Modal -->
      ${showSyncModal ? renderSyncModal() : ''}
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

  return `
    <div class="bg-white rounded-3xl border ${attention ? 'border-rose-200 ring-2 ring-rose-100' : 'border-gray-200'} p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <!-- Card Header -->
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <div class="flex items-center gap-2">
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
        <div class="grid grid-cols-2 gap-3 mb-5">
          <!-- Booking.com Box -->
          <div class="rounded-2xl p-4 bg-blue-50/50 border border-blue-100 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-blue-700 text-xs font-semibold mb-2">
                <span class="flex items-center gap-1.5"><i class="fas fa-hotel"></i>Booking.com</span>
                ${prop.bookingUrl ? `<a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener" class="text-blue-500 hover:text-blue-700" title="Open listing"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
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
          </div>

          <!-- Airbnb Box -->
          <div class="rounded-2xl p-4 bg-rose-50/50 border border-rose-100 flex flex-col justify-between">
            <div>
              <div class="flex items-center justify-between text-rose-700 text-xs font-semibold mb-2">
                <span class="flex items-center gap-1.5"><i class="fab fa-airbnb text-sm"></i>Airbnb</span>
                ${prop.airbnbUrl ? `<a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener" class="text-rose-500 hover:text-rose-700" title="Open listing"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
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
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="pt-3 border-t border-gray-100 flex items-center justify-between">
        <span class="text-[11px] text-gray-400">
          Last check: ${prop.airbnb?.lastChecked ? new Date(prop.airbnb.lastChecked).toLocaleDateString('en-GB') : (prop.booking?.lastChecked ? new Date(prop.booking.lastChecked).toLocaleDateString('en-GB') : 'Never')}
        </span>
        <button class="reviews-details-btn inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors" data-id="${escapeHtml(prop.id)}">
          <span>View full breakdown</span>
          <i class="fas fa-chevron-right text-[10px]"></i>
        </button>
      </div>
    </div>
  `;
}

function renderPropertyDetailModal(prop) {
  const airbnbSubs = prop.airbnb?.subScores || {};
  const bookingSubs = prop.booking?.subScores || {};

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <!-- Close Button -->
        <button id="modal-close-btn" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors">
          <i class="fas fa-times text-sm"></i>
        </button>

        <div class="mb-6">
          <span class="text-xs font-semibold uppercase tracking-wider text-amber-600">Property Scorecard</span>
          <h2 class="text-2xl font-black text-gray-900 mt-1">${escapeHtml(prop.name)}</h2>
          <p class="text-xs text-gray-500 flex items-center gap-1 mt-1">
            <i class="fas fa-map-marker-alt"></i>
            <span>${escapeHtml(prop.location || 'Madeira')}</span>
          </p>
        </div>

        <!-- Breakdown Grid -->
        <div class="space-y-6">
          <!-- Booking.com Subscores -->
          <div class="rounded-2xl border border-blue-100 bg-blue-50/30 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-blue-900 flex items-center gap-2">
                <i class="fas fa-hotel text-blue-600"></i>
                <span>Booking.com Sub-category Ratings</span>
              </h3>
              <span class="text-xs font-semibold text-blue-700">Overall: ${prop.booking?.score || '—'} / 10</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              ${renderSubScorePill('Cleanliness', bookingSubs.cleanliness, 10, 'broom')}
              ${renderSubScorePill('Staff', bookingSubs.staff, 10, 'user-tie')}
              ${renderSubScorePill('Facilities', bookingSubs.facilities, 10, 'concierge-bell')}
              ${renderSubScorePill('Comfort', bookingSubs.comfort, 10, 'couch')}
              ${renderSubScorePill('Value', bookingSubs.value, 10, 'tag')}
              ${renderSubScorePill('Location', bookingSubs.location, 10, 'map-marker-alt')}
            </div>
          </div>

          <!-- Airbnb Subscores -->
          <div class="rounded-2xl border border-rose-100 bg-rose-50/30 p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-bold text-rose-900 flex items-center gap-2">
                <i class="fab fa-airbnb text-rose-600"></i>
                <span>Airbnb Sub-category Ratings</span>
              </h3>
              <span class="text-xs font-semibold text-rose-700">Overall: ${prop.airbnb?.score ? `${prop.airbnb.score} ★` : '—'}</span>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
              ${renderSubScorePill('Cleanliness', airbnbSubs.cleanliness, 5, 'broom')}
              ${renderSubScorePill('Accuracy', airbnbSubs.accuracy, 5, 'check-double')}
              ${renderSubScorePill('Check-in', airbnbSubs.checkin, 5, 'key')}
              ${renderSubScorePill('Communication', airbnbSubs.communication, 5, 'comment-dots')}
              ${renderSubScorePill('Location', airbnbSubs.location, 5, 'map-marker-alt')}
              ${renderSubScorePill('Value', airbnbSubs.value, 5, 'tag')}
            </div>
          </div>
        </div>

        <div class="mt-8 flex justify-end">
          <button id="modal-ok-btn" class="px-5 py-2.5 rounded-xl bg-gray-900 text-white font-medium text-sm hover:bg-black transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderSubScorePill(label, value, max, icon) {
  const valText = typeof value === 'number' ? value.toFixed(1) : '—';
  const isHigh = typeof value === 'number' && (max === 5 ? value >= 4.8 : value >= 9.0);

  return `
    <div class="bg-white rounded-xl p-3 border border-gray-200/80 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <i class="fas fa-${icon} text-gray-400 text-xs"></i>
        <span class="text-xs text-gray-600 font-medium">${label}</span>
      </div>
      <span class="text-xs font-bold ${isHigh ? 'text-emerald-600' : 'text-gray-800'}">${valText}</span>
    </div>
  `;
}

function renderSyncModal() {
  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative">
        <button id="sync-modal-close-btn" class="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors">
          <i class="fas fa-times text-sm"></i>
        </button>

        <div class="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 text-xl font-bold mb-4">
          <i class="fas fa-sync-alt"></i>
        </div>

        <h2 class="text-xl font-bold text-gray-900">Synchronize Reviews & Ratings</h2>
        <p class="text-sm text-gray-600 mt-2">
          The background Playwright scraper visits each property's Airbnb and Booking.com links silently using Microsoft Edge and updates all scores.
        </p>

        <div class="mt-5 space-y-3">
          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Option 1: Terminal Command</h4>
            <div class="flex items-center justify-between gap-2 mt-2 bg-gray-900 text-gray-100 font-mono text-xs p-2.5 rounded-lg overflow-x-auto">
              <code>npm run sync:reviews</code>
              <button id="copy-sync-command-btn" class="text-amber-400 hover:text-amber-300 px-2 py-1 rounded text-[11px] font-sans font-semibold transition-colors">Copy</button>
            </div>
          </div>

          <div class="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Option 2: 1-Click File Shortcut</h4>
            <p class="text-xs text-gray-600 mt-1">
              Double-click <strong class="text-gray-900 font-mono">sync-reviews.cmd</strong> in the project folder to run the sync anytime without opening a terminal.
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end">
          <button id="sync-modal-done-btn" class="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors shadow-sm">
            Got it
          </button>
        </div>
      </div>
    </div>
  `;
}

function bindViewEvents(container, handlers) {
  // Back button
  container.querySelector('#reviews-back-btn')?.addEventListener('click', () => {
    handlers.onBack?.();
  });

  // Sync button
  container.querySelector('#reviews-sync-btn')?.addEventListener('click', () => {
    handlers.onOpenSyncModal?.();
  });

  // Search input
  const searchInput = container.querySelector('#reviews-search-input');
  searchInput?.addEventListener('input', (e) => {
    handlers.onSearch?.(e.target.value);
  });

  // Filter buttons
  container.querySelectorAll('.reviews-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onFilter?.(btn.dataset.filter);
    });
  });

  // Sort select
  container.querySelector('#reviews-sort-select')?.addEventListener('change', (e) => {
    handlers.onSort?.(e.target.value);
  });

  // Details buttons
  container.querySelectorAll('.reviews-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onSelectProperty?.(btn.dataset.id);
    });
  });

  // Detail Modal close
  container.querySelector('#modal-close-btn')?.addEventListener('click', () => {
    handlers.onCloseDetailModal?.();
  });
  container.querySelector('#modal-ok-btn')?.addEventListener('click', () => {
    handlers.onCloseDetailModal?.();
  });

  // Sync Modal close & copy
  container.querySelector('#sync-modal-close-btn')?.addEventListener('click', () => {
    handlers.onCloseSyncModal?.();
  });
  container.querySelector('#sync-modal-done-btn')?.addEventListener('click', () => {
    handlers.onCloseSyncModal?.();
  });
  container.querySelector('#copy-sync-command-btn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('npm run sync:reviews');
      const btn = container.querySelector('#copy-sync-command-btn');
      if (btn) btn.textContent = 'Copied!';
      setTimeout(() => {
        if (btn) btn.textContent = 'Copy';
      }, 2000);
    } catch {}
  });
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
