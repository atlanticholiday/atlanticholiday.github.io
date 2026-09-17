import {
  formatScore,
  getCleanlinessStatus,
  isAttentionNeeded,
  isPropertyArchived,
  getAllPropertyReviews,
  getLatestReviewSnippet,
  getLatestReviewsAcrossProperties,
  filterPropertyReviews,
  getReviewResponse,
  hasReviewResponse,
  analysePropertyInsights,
  getAllPropertyImprovements,
  ISSUE_BUCKETS
} from './reviews-ratings-utils.js';

export function renderReviewsRatingsDashboard(container, state, handlers) {
  if (!container) return;

  const {
    properties = [],
    rawProperties = [],
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
    isAddingReview = false,
    activeTab = 'properties',
    activeModalTab = 'overview',
    improvementsFilter = 'all',
    improvementsSearch = ''
  } = state;

  const improvementsData = getAllPropertyImprovements(rawProperties, {
    category: improvementsFilter,
    search: improvementsSearch
  });
  const improvementsCount = improvementsData.totalWithIssues;

  const activePropertiesCount = (rawProperties || []).filter((p) => !isPropertyArchived(p)).length;
  const archivedPropertiesCount = (rawProperties || []).filter(isPropertyArchived).length;

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

          <!-- Tab Navigation -->
          <div class="flex items-center gap-1 -mb-px">
            <button class="reviews-tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'properties' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}" data-tab="properties">
              <i class="fas fa-building text-xs mr-1.5"></i>Properties
            </button>
            <button class="reviews-tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'improvements' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} inline-flex items-center gap-2" data-tab="improvements">
              <span class="inline-flex items-center"><i class="fas fa-lightbulb text-xs mr-1.5"></i>Improvements</span>
              ${improvementsCount > 0 ? `
                <span class="px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeTab === 'improvements' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700'}">
                  ${improvementsCount}
                </span>
              ` : ''}
            </button>
            <button class="reviews-tab-btn px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'latest-reviews' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}" data-tab="latest-reviews">
              <i class="fas fa-stream text-xs mr-1.5"></i>Latest Reviews
            </button>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        <!-- KPI Summary Cards (always visible) -->
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
              <span class="inline-block w-2 h-2 rounded-full ${summary.airbnbAvg ? (summary.airbnbAvg >= 4.8 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-gray-300'}"></span>
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
              <span class="inline-block w-2 h-2 rounded-full ${summary.bookingAvg ? (summary.bookingAvg >= 9.0 ? 'bg-emerald-500' : 'bg-amber-500') : 'bg-gray-300'}"></span>
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
              <span class="inline-block w-2 h-2 rounded-full ${summary.cleanlinessAvgAirbnb || summary.cleanlinessAvgBooking ? 'bg-emerald-500' : 'bg-gray-300'}"></span>
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
                : `<span class="text-emerald-600 font-medium"><i class="fas fa-check-circle text-xs mr-1"></i>All rated properties on track</span>`}
            </p>
          </div>
        </section>

        ${activeTab === 'properties' ? `
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
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-filter="all">All (${activePropertiesCount})</button>
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'attention' ? 'bg-white text-rose-600 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-600'}" data-filter="attention">Needs Attention</button>
              <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'guest-favourite' ? 'bg-white text-amber-600 shadow-sm font-bold' : 'text-gray-600 hover:text-amber-600'}" data-filter="guest-favourite">Guest Favourite</button>
              ${archivedPropertiesCount > 0 ? `
                <button class="reviews-filter-btn px-3 py-1.5 rounded-lg transition-colors ${filter === 'archived' ? 'bg-white text-amber-800 shadow-sm font-bold' : 'text-gray-600 hover:text-amber-800'}" data-filter="archived"><i class="fas fa-box-archive mr-1 text-[10px]"></i>Archived (${archivedPropertiesCount})</button>
              ` : ''}
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
        ` : activeTab === 'improvements' ? `
        <!-- Improvements & Recommendations Full Page Tab -->
        ${renderImprovementsPage(improvementsData, state, handlers)}
        ` : `
        <!-- Latest Reviews Full Page Tab -->
        ${renderLatestReviewsPage(rawProperties)}
        `}
      </main>

      <!-- Property Details Modal / Drawer -->
      ${selectedProperty ? renderPropertyDetailModal(selectedProperty, reviewModalFilter, reviewModalSearch, isEditingLinks, isAddingReview, activeModalTab) : ''}
    </div>
  `;

  // Bind Events
  bindViewEvents(container, handlers);
}

function renderPropertyCard(prop) {
  const isArchived = isPropertyArchived(prop);
  const attention = isAttentionNeeded(prop);
  const cleanStatus = getCleanlinessStatus(prop);

  const hasBookingData = prop.booking?.score !== undefined && prop.booking?.score !== null;
  const isBookingAwaitingSync = Boolean(prop.bookingUrl && !hasBookingData);
  const bookingScore = hasBookingData
    ? `${prop.booking.score.toFixed(1)}`
    : (isBookingAwaitingSync ? 'Awaiting sync' : '—');
  const bookingCount = prop.booking?.reviewCount ? `(${prop.booking.reviewCount})` : '';
  const bookingClean = prop.booking?.subScores?.cleanliness
    ? `${prop.booking.subScores.cleanliness.toFixed(1)} / 10`
    : (isBookingAwaitingSync ? 'Pending sync' : '— / 10');

  const hasAirbnbData = prop.airbnb?.score !== undefined && prop.airbnb?.score !== null;
  const isAirbnbAwaitingSync = Boolean(prop.airbnbUrl && !hasAirbnbData);
  const airbnbScore = hasAirbnbData
    ? `${prop.airbnb.score.toFixed(1)} ★`
    : (isAirbnbAwaitingSync ? 'Awaiting sync' : '—');
  const airbnbCount = prop.airbnb?.reviewCount ? `(${prop.airbnb.reviewCount})` : '';
  const airbnbClean = prop.airbnb?.subScores?.cleanliness
    ? `${prop.airbnb.subScores.cleanliness.toFixed(1)} / 5.0`
    : (isAirbnbAwaitingSync ? 'Pending sync' : '— / 5.0');

  const latestReview = getLatestReviewSnippet(prop);
  const allReviews = getAllPropertyReviews(prop);
  const unansweredReviewsCount = allReviews.filter((review) => !hasReviewResponse(review)).length;
  const totalReviewsCount = (prop.booking?.reviewCount || 0) + (prop.airbnb?.reviewCount || 0) || allReviews.length;

  return `
    <div class="bg-white rounded-3xl border ${attention ? 'border-rose-200 ring-2 ring-rose-100' : (isArchived ? 'border-amber-200 bg-amber-50/10' : 'border-gray-200')} p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
      <div>
        <!-- Card Header -->
        <div class="flex items-start justify-between gap-3 mb-4">
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-lg font-bold text-gray-900">${escapeHtml(prop.name)}</h3>
              ${prop.airbnb?.badge === 'Guest favourite' ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fas fa-trophy text-[9px]"></i>Guest Favourite</span>` : ''}
              ${isArchived ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"><i class="fas fa-box-archive text-[9px]"></i>Archived</span>` : ''}
            </div>
            <p class="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <i class="fas fa-map-marker-alt text-gray-400"></i>
              <span>${escapeHtml(prop.location || 'Madeira')}</span>
            </p>
          </div>

          <div class="flex items-center gap-1.5">
            ${
              isArchived
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300"><i class="fas fa-box-archive text-[10px]"></i>Archived</span>`
                : attention
                  ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"><i class="fas fa-exclamation-circle"></i>Attention</span>`
                  : (hasBookingData || hasAirbnbData)
                    ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><i class="fas fa-check-circle"></i>Good</span>`
                    : (prop.bookingUrl || prop.airbnbUrl)
                      ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200" title="Listing linked, awaiting automated review sync"><i class="fas fa-clock text-[10px]"></i>Awaiting Sync</span>`
                      : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-50 text-gray-500 border border-gray-200"><i class="far fa-circle text-[10px]"></i>Unrated</span>`
            }
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
                <span class="${isBookingAwaitingSync ? 'text-xs font-bold text-amber-600 italic' : 'text-2xl font-black text-gray-900'}">${bookingScore}</span>
                <span class="text-xs text-gray-500">${bookingCount}</span>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-blue-100/80 text-[11px] text-gray-600 flex items-center justify-between">
              <span>Cleanliness:</span>
              <strong class="font-semibold text-gray-800">${bookingClean}</strong>
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
                <span class="${isAirbnbAwaitingSync ? 'text-xs font-bold text-amber-600 italic' : 'text-2xl font-black text-gray-900'}">${airbnbScore}</span>
                <span class="text-xs text-gray-500">${airbnbCount}</span>
              </div>
            </div>
            <div class="mt-3 pt-2 border-t border-rose-100/80 text-[11px] text-gray-600 flex items-center justify-between">
              <span>Cleanliness:</span>
              <strong class="font-semibold text-gray-800">${airbnbClean}</strong>
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
          <span>${allReviews.length > 0 ? `${allReviews.length} fetched reviews` : (totalReviewsCount > 0 ? `${totalReviewsCount} reviews` : '0 reviews')}${unansweredReviewsCount > 0 ? ` · <strong class="text-amber-600">${unansweredReviewsCount} unanswered</strong>` : ''}</span>
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

function renderImprovementsPage(improvementsData, state, handlers) {
  const {
    items = [],
    allClear = [],
    unrated = [],
    categoryCounts = {},
    totalWithIssues = 0,
    totalAllClear = 0
  } = improvementsData;

  const { improvementsFilter = 'all', improvementsSearch = '' } = state;

  const activeCategoryKeys = Object.keys(categoryCounts).filter((k) => categoryCounts[k] > 0);

  return `
    <div class="space-y-6">
      <!-- Section Header Banner -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg flex-shrink-0">
            <i class="fas fa-lightbulb"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-gray-900 leading-tight">Improvements &amp; Recommendations</h2>
            <p class="text-xs text-gray-500">Action items, recurring complaints, and operational suggestions grouped per property</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ${totalWithIssues > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-gray-100 text-gray-600'}">
            <i class="fas fa-exclamation-circle text-amber-500"></i>
            <span>${totalWithIssues} ${totalWithIssues === 1 ? 'property' : 'properties'} with action items</span>
          </span>
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
            <i class="fas fa-check-circle text-emerald-500"></i>
            <span>${totalAllClear} all clear</span>
          </span>
        </div>
      </div>

      <!-- Filter & Search Toolbar -->
      <div class="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <!-- Search -->
        <div class="relative w-full md:w-80">
          <i class="fas fa-search absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            id="improvements-search-input"
            value="${escapeHtml(improvementsSearch)}"
            placeholder="Search properties, locations, or issues..."
            class="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-gray-50/50"
          />
        </div>

        <!-- Category Filter Pills -->
        <div class="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-medium w-full md:w-auto overflow-x-auto">
          <button class="improvements-filter-btn px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${improvementsFilter === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-category="all">
            All Issues (${totalWithIssues})
          </button>
          ${activeCategoryKeys.map((catKey) => {
            const bucket = ISSUE_BUCKETS.find((b) => b.key === catKey);
            const label = bucket?.label || catKey;
            const icon = bucket?.icon || 'tag';
            const count = categoryCounts[catKey] || 0;
            const isActive = improvementsFilter === catKey;
            return `
              <button class="improvements-filter-btn px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${isActive ? 'bg-white text-amber-800 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-category="${catKey}">
                <i class="fas fa-${icon} text-[10px] mr-1 ${isActive ? 'text-amber-600' : 'text-gray-400'}"></i>${label} (${count})
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Property Improvement Cards List -->
      <div class="space-y-4">
        ${items.length === 0 ? `
          <div class="text-center py-16 bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
            <div class="w-12 h-12 rounded-full ${totalWithIssues === 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-gray-100 text-gray-400'} flex items-center justify-center mx-auto mb-3 text-xl">
              <i class="fas ${totalWithIssues === 0 ? 'fa-check' : 'fa-search'}"></i>
            </div>
            <h3 class="text-base font-bold text-gray-800">
              ${totalWithIssues === 0 ? 'All properties are running smoothly!' : 'No matching properties found'}
            </h3>
            <p class="text-sm text-gray-500 mt-1">
              ${totalWithIssues === 0 ? 'No recurring complaints, critical score dips, or unresolved issues detected.' : 'Try changing your search query or selecting "All Issues".'}
            </p>
          </div>
        ` : items.map((item) => renderImprovementCard(item)).join('')}
      </div>

      <!-- All Clear Properties Collapsible Section -->
      ${allClear.length > 0 ? `
        <details class="group bg-white rounded-2xl border border-gray-200 p-4 shadow-sm transition-all">
          <summary class="flex items-center justify-between cursor-pointer text-xs font-bold text-gray-700 select-none">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
                <i class="fas fa-check"></i>
              </span>
              <span>All Clear Properties (${allClear.length}) — No Issues Reported</span>
            </div>
            <div class="flex items-center gap-1 text-gray-400 group-open:rotate-180 transition-transform text-xs">
              <i class="fas fa-chevron-down"></i>
            </div>
          </summary>
          <div class="mt-4 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            ${allClear.map((ac) => `
              <div class="flex items-center justify-between p-2.5 rounded-xl bg-gray-50/70 border border-gray-200/70 text-xs">
                <div class="truncate mr-2">
                  <strong class="font-bold text-gray-800 truncate block">${escapeHtml(ac.property.name)}</strong>
                  <span class="text-[11px] text-gray-400">${escapeHtml(ac.property.location || 'Madeira')}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <span class="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                    <i class="fas fa-check-circle text-[10px]"></i> 100% Positive
                  </span>
                  <button class="improvements-view-prop-btn text-xs text-amber-600 hover:text-amber-700 font-semibold px-2 py-1 rounded-lg hover:bg-amber-50 transition-colors" data-id="${escapeHtml(ac.property.id)}">
                    View
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </details>
      ` : ''}
    </div>
  `;
}

function renderImprovementCard(item) {
  const { property: prop, severity, insights, guestFeedback = [], unansweredCount = 0 } = item;
  const { issues = [], recommendations = [] } = insights;

  const severityBadge = {
    high: `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200"><i class="fas fa-exclamation-triangle text-[10px]"></i>High Priority</span>`,
    medium: `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200"><i class="fas fa-exclamation-circle text-[10px]"></i>Needs Attention</span>`,
    low: `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200"><i class="fas fa-lightbulb text-[10px]"></i>Optimization</span>`
  }[severity] || '';

  const bookingScore = prop.booking?.score != null ? `${prop.booking.score.toFixed(1)} / 10` : '—';
  const airbnbScore = prop.airbnb?.score != null ? `${prop.airbnb.score.toFixed(1)} ★` : '—';

  return `
    <div class="bg-white rounded-2xl border ${severity === 'high' ? 'border-rose-200 ring-1 ring-rose-100 shadow-sm' : (severity === 'medium' ? 'border-amber-200 ring-1 ring-amber-100 shadow-sm' : 'border-gray-200 shadow-sm')} p-5 transition-all">
      <!-- Card Header -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-2xl ${severity === 'high' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'} flex items-center justify-center text-base font-bold flex-shrink-0">
            <i class="fas ${severity === 'high' ? 'fa-tools' : 'fa-clipboard-list'}"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-bold text-gray-900">${escapeHtml(prop.name)}</h3>
              ${severityBadge}
            </div>
            <p class="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
              <i class="fas fa-map-marker-alt text-gray-400"></i>
              <span>${escapeHtml(prop.location || 'Madeira')}</span>
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2.5 flex-shrink-0 self-start sm:self-center">
          <div class="flex items-center gap-2 text-xs bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200/80">
            <div class="flex items-center gap-1 text-blue-700 font-semibold" title="Booking.com Score">
              <i class="fas fa-hotel text-[10px]"></i>
              <span>${bookingScore}</span>
            </div>
            <span class="text-gray-300">|</span>
            <div class="flex items-center gap-1 text-rose-700 font-semibold" title="Airbnb Score">
              <i class="fab fa-airbnb text-[11px]"></i>
              <span>${airbnbScore}</span>
            </div>
          </div>
          <button class="improvements-view-prop-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs font-semibold transition-colors border border-amber-200" data-id="${escapeHtml(prop.id)}">
            <span>View Property</span>
            <i class="fas fa-arrow-right text-[10px]"></i>
          </button>
        </div>
      </div>

      <!-- Body: Action Items + Issues Tags -->
      <div class="py-4 space-y-3.5">
        <!-- Recommendations -->
        ${recommendations.length > 0 ? `
          <div class="rounded-xl bg-amber-50/50 border border-amber-100 p-3.5 space-y-2">
            <div class="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <i class="fas fa-check-circle text-amber-600"></i>
              <span>Recommended Actions (${recommendations.length})</span>
            </div>
            <ul class="space-y-1.5">
              ${recommendations.map((rec) => `
                <li class="flex items-start gap-2 text-xs text-gray-800">
                  <i class="fas fa-${rec.icon} text-amber-600 mt-0.5 flex-shrink-0"></i>
                  <span class="leading-relaxed">${escapeHtml(rec.text)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- Reported Issues Tags -->
        ${issues.length > 0 ? `
          <div>
            <div class="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <i class="fas fa-tags text-gray-400"></i>
              <span>Reported Issues in Reviews (${issues.length})</span>
            </div>
            <div class="flex flex-wrap gap-2">
              ${issues.map((iss) => `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${iss.severity === 'high' ? 'bg-rose-50 text-rose-700 border border-rose-200' : (iss.severity === 'medium' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-gray-100 text-gray-700 border border-gray-200')}">
                  <i class="fas fa-${iss.icon} text-[10px]"></i>
                  <span>${escapeHtml(iss.label)}</span>
                  <span class="font-bold opacity-75">(${iss.count}×)</span>
                </span>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Direct Guest Feedback Quotes -->
        ${guestFeedback.length > 0 ? `
          <div>
            <div class="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <i class="fas fa-quote-left text-gray-400"></i>
              <span>Direct Guest Feedback</span>
            </div>
            <div class="space-y-2">
              ${guestFeedback.map((fb) => `
                <div class="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-gray-700 flex flex-col gap-1">
                  <div class="flex items-center justify-between text-[11px] text-gray-500">
                    <span class="font-semibold text-gray-800 flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full ${fb.platform === 'Airbnb' ? 'bg-rose-500' : 'bg-blue-500'}"></span>
                      ${escapeHtml(fb.author)} (${escapeHtml(fb.platform)})
                    </span>
                    ${fb.score ? `<span class="font-bold ${fb.platform === 'Airbnb' ? 'text-rose-700' : 'text-blue-700'}">${fb.score} ${fb.platform === 'Airbnb' ? '★' : '/ 10'}</span>` : ''}
                  </div>
                  <p class="italic text-gray-700 leading-relaxed">“${escapeHtml(fb.text)}”</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Card Footer -->
      <div class="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
        <div class="flex items-center gap-3">
          <span><i class="fas fa-comments text-gray-300 mr-1"></i>${item.totalReviews} total reviews</span>
          ${unansweredCount > 0 ? `<span class="text-amber-600 font-semibold"><i class="fas fa-reply-all text-amber-500 mr-1"></i>${unansweredCount} awaiting reply</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderLatestReviewsPage(rawProperties, handlers) {
  const latestReviews = getLatestReviewsAcrossProperties(rawProperties, 50);

  if (latestReviews.length === 0) {
    return `
      <div class="text-center py-16 bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
        <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 mx-auto mb-3">
          <i class="fas fa-comments text-lg"></i>
        </div>
        <h3 class="text-base font-bold text-gray-800">No reviews found</h3>
        <p class="text-sm text-gray-500 mt-1">Sync reviews from OTAs or add a review manually to get started.</p>
      </div>
    `;
  }

  return `
    <div class="space-y-6">
      <!-- Section Header Banner -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg flex-shrink-0">
            <i class="fas fa-stream"></i>
          </div>
          <div>
            <h2 class="text-base font-bold text-gray-900 leading-tight">Latest Guest Reviews</h2>
            <p class="text-xs text-gray-500">Most recent feedback submitted across all properties, sorted by date (newest first)</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-xl">
            <i class="fas fa-history text-gray-400"></i>
            <span>${latestReviews.length} most recent reviews</span>
          </span>
        </div>
      </div>

      <!-- Reviews Feed Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        ${latestReviews.map((r) => renderReviewItem(r)).join('')}
      </div>
    </div>
  `;
}

function renderPropertyDetailModal(prop, activeFilter = 'all', searchQuery = '', isEditingLinks = false, isAddingReview = false, activeModalTab = 'overview') {
  const isArchived = isPropertyArchived(prop);
  const airbnbSubs = prop.airbnb?.subScores || {};
  const bookingSubs = prop.booking?.subScores || {};
  const allReviews = getAllPropertyReviews(prop);

  const bookingReviewsCount = allReviews.filter((r) => r.platform === 'Booking.com').length;
  const airbnbReviewsCount = allReviews.filter((r) => r.platform === 'Airbnb').length;
  const answeredReviewsCount = allReviews.filter(hasReviewResponse).length;
  const unansweredReviewsCount = allReviews.length - answeredReviewsCount;

  const filteredReviews = filterPropertyReviews(allReviews, {
    platform: activeFilter === 'booking' ? 'Booking.com' : (activeFilter === 'airbnb' ? 'Airbnb' : 'all'),
    filter: ['positive', 'attention', 'answered', 'unanswered'].includes(activeFilter) ? activeFilter : 'all',
    search: searchQuery
  });

  const TABS = [
    { key: 'overview',  label: 'Overview',  icon: 'chart-bar' },
    { key: 'insights',  label: 'Insights',  icon: 'lightbulb' },
    { key: 'reviews',   label: `Reviews (${allReviews.length})`, icon: 'comments' },
    { key: 'settings',  label: 'Settings',  icon: 'cog' }
  ];

  const tabBtn = (t) => `
    <button class="modal-tab-btn flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
      activeModalTab === t.key
        ? 'border-amber-500 text-amber-700'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }" data-tab="${t.key}">
      <i class="fas fa-${t.icon} text-[11px]"></i>
      <span>${t.label}</span>
    </button>`;

  // ── TAB: OVERVIEW ──────────────────────────────────────────────────────────
  const overviewTab = `
    <div class="space-y-4">
      <!-- Score summary row -->
      <div class="grid grid-cols-2 gap-3">
        <!-- Booking.com -->
        <${prop.bookingUrl ? `a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener noreferrer"` : 'div'}
          class="rounded-2xl p-4 bg-blue-50/60 border border-blue-100 flex flex-col justify-between ${prop.bookingUrl ? 'hover:bg-blue-50 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer group' : ''}">
          <div class="flex items-center justify-between text-blue-700 text-xs font-semibold mb-3">
            <span class="flex items-center gap-1.5 ${prop.bookingUrl ? 'group-hover:underline' : ''}">
              <i class="fas fa-hotel"></i> Booking.com
            </span>
            ${prop.bookingUrl ? `<i class="fas fa-external-link-alt text-[10px] text-blue-400 group-hover:text-blue-600"></i>` : ''}
          </div>
          <div class="flex items-baseline gap-1.5 mb-1">
            <span class="text-3xl font-black text-gray-900">${prop.booking?.score != null ? prop.booking.score.toFixed(1) : (prop.bookingUrl ? '—' : '—')}</span>
            <span class="text-xs text-gray-500">/ 10</span>
            ${prop.booking?.reviewCount ? `<span class="text-xs text-gray-400 ml-1">(${prop.booking.reviewCount} reviews)</span>` : ''}
          </div>
          ${prop.booking?.score != null
            ? `<div class="w-full bg-blue-100 rounded-full h-1.5 mt-2">
                 <div class="bg-blue-500 h-1.5 rounded-full" style="width:${Math.min(100, (prop.booking.score / 10) * 100)}%"></div>
               </div>`
            : `<p class="text-[11px] text-amber-600 italic mt-1">${prop.bookingUrl ? 'No score yet' : 'No listing linked'}</p>`
          }
        </${prop.bookingUrl ? 'a' : 'div'}>

        <!-- Airbnb -->
        <${prop.airbnbUrl ? `a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener noreferrer"` : 'div'}
          class="rounded-2xl p-4 bg-rose-50/60 border border-rose-100 flex flex-col justify-between ${prop.airbnbUrl ? 'hover:bg-rose-50 hover:border-rose-300 hover:shadow-sm transition-all cursor-pointer group' : ''}">
          <div class="flex items-center justify-between text-rose-700 text-xs font-semibold mb-3">
            <span class="flex items-center gap-1.5 ${prop.airbnbUrl ? 'group-hover:underline' : ''}">
              <i class="fab fa-airbnb text-sm"></i> Airbnb
            </span>
            ${prop.airbnbUrl ? `<i class="fas fa-external-link-alt text-[10px] text-rose-400 group-hover:text-rose-600"></i>` : ''}
          </div>
          <div class="flex items-baseline gap-1.5 mb-1">
            <span class="text-3xl font-black text-gray-900">${prop.airbnb?.score != null ? prop.airbnb.score.toFixed(2) : '—'}</span>
            <span class="text-xs text-gray-500">★ / 5.0</span>
            ${prop.airbnb?.reviewCount ? `<span class="text-xs text-gray-400 ml-1">(${prop.airbnb.reviewCount} reviews)</span>` : ''}
          </div>
          ${prop.airbnb?.score != null
            ? `<div class="w-full bg-rose-100 rounded-full h-1.5 mt-2">
                 <div class="bg-rose-500 h-1.5 rounded-full" style="width:${Math.min(100, (prop.airbnb.score / 5) * 100)}%"></div>
               </div>`
            : `<p class="text-[11px] text-amber-600 italic mt-1">${prop.airbnbUrl ? 'No score yet' : 'No listing linked'}</p>`
          }
          ${prop.airbnb?.badge ? `<span class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 w-fit"><i class="fas fa-trophy text-[9px]"></i>${escapeHtml(prop.airbnb.badge)}</span>` : ''}
        </${prop.airbnbUrl ? 'a' : 'div'}>
      </div>

      <!-- Booking.com Sub-scores -->
      <div class="rounded-2xl border border-blue-100 bg-blue-50/30 p-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 class="text-xs font-bold text-blue-900 flex items-center gap-2">
            <i class="fas fa-hotel text-blue-600"></i>
            Booking.com Sub-scores
          </h3>
          <span class="text-xs font-bold text-blue-700">Overall: ${prop.booking?.score != null ? `${prop.booking.score} / 10` : (prop.bookingUrl ? 'Awaiting sync' : '—')}</span>
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

      <!-- Airbnb Sub-scores -->
      <div class="rounded-2xl border border-rose-100 bg-rose-50/30 p-4">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 class="text-xs font-bold text-rose-900 flex items-center gap-2">
            <i class="fab fa-airbnb text-rose-600"></i>
            Airbnb Sub-scores
          </h3>
          <span class="text-xs font-bold text-rose-700">Overall: ${prop.airbnb?.score != null ? `${prop.airbnb.score} ★` : (prop.airbnbUrl ? 'Awaiting sync' : '—')}</span>
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
    </div>`;

  // ── TAB: INSIGHTS ──────────────────────────────────────────────────────────
  const insightsTab = `
    <div>
      ${renderInsightsPanel(prop) || `
        <div class="text-center py-12 text-gray-500">
          <div class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
            <i class="fas fa-lightbulb text-lg"></i>
          </div>
          <p class="text-sm font-medium text-gray-700">Not enough data yet</p>
          <p class="text-xs text-gray-400 mt-1">Insights appear once scores or written reviews are available.</p>
        </div>
      `}
    </div>`;

  // ── TAB: REVIEWS ──────────────────────────────────────────────────────────
  const reviewsTab = `
    <div class="space-y-4">
      <!-- Counters row -->
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <span class="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 text-blue-700 font-semibold px-2.5 py-1 rounded-xl">
          <i class="fas fa-hotel text-[10px]"></i> Booking.com: ${bookingReviewsCount}
        </span>
        <span class="inline-flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-700 font-semibold px-2.5 py-1 rounded-xl">
          <i class="fab fa-airbnb text-[10px]"></i> Airbnb: ${airbnbReviewsCount}
        </span>
        ${unansweredReviewsCount > 0
          ? `<span class="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 font-semibold px-2.5 py-1 rounded-xl">
               <i class="fas fa-clock text-[10px]"></i> ${unansweredReviewsCount} unanswered
             </span>`
          : `<span class="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold px-2.5 py-1 rounded-xl">
               <i class="fas fa-check-circle text-[10px]"></i> All answered
             </span>`
        }
        <button id="modal-toggle-add-review-btn" class="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold text-xs transition-colors border border-amber-200">
          <i class="fas ${isAddingReview ? 'fa-times' : 'fa-plus'} text-[10px]"></i>
          <span>${isAddingReview ? 'Cancel' : 'Add Review'}</span>
        </button>
      </div>

      <!-- Add Review Form -->
      ${isAddingReview ? `
        <form id="add-review-form" class="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
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
                <option value="Booking.com">Booking.com (/ 10)</option>
                <option value="Airbnb">Airbnb (/ 5.0)</option>
                <option value="Direct">Direct Guest (/ 10)</option>
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
            <input type="text" id="review-title-input" placeholder="e.g. Fantastic stay, super clean!" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-700 mb-1">Full Comment</label>
            <textarea id="review-comment-input" rows="2" placeholder="Guest feedback..." class="w-full p-2 rounded-xl border border-gray-300 bg-white"></textarea>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
            <div>
              <label class="block text-[11px] font-semibold text-emerald-800 mb-1">Liked (positive)</label>
              <input type="text" id="review-positive-input" placeholder="e.g. Spotlessly clean, great terrace" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
            </div>
            <div>
              <label class="block text-[11px] font-semibold text-amber-800 mb-1">Room for improvement</label>
              <input type="text" id="review-negative-input" placeholder="e.g. Could use more coffee pods" class="w-full p-2 rounded-xl border border-gray-300 bg-white" />
            </div>
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-gray-700 mb-1">Host Response (optional)</label>
            <textarea id="review-response-input" rows="2" placeholder="Paste the host reply sent to the guest..." class="w-full p-2 rounded-xl border border-gray-300 bg-white"></textarea>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="submit" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-sm">
              <i class="fas fa-check text-[11px]"></i> Save Review
            </button>
          </div>
        </form>
      ` : ''}

      <!-- Search + Filter Pills -->
      <div class="space-y-2">
        <div class="relative">
          <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input
            type="text"
            id="modal-review-search"
            value="${escapeHtml(searchQuery)}"
            placeholder="Search in reviews..."
            class="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-gray-50/50"
          />
        </div>
        <div class="flex flex-wrap items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-medium">
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'all' ? 'bg-white text-gray-900 shadow-sm font-bold' : 'text-gray-600 hover:text-gray-900'}" data-filter="all">All (${allReviews.length})</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'booking' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-gray-600 hover:text-blue-700'}" data-filter="booking">Booking.com (${bookingReviewsCount})</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'airbnb' ? 'bg-white text-rose-700 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-700'}" data-filter="airbnb">Airbnb (${airbnbReviewsCount})</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'positive' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-gray-600 hover:text-emerald-700'}" data-filter="positive">Positive</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'attention' ? 'bg-white text-rose-700 shadow-sm font-bold' : 'text-gray-600 hover:text-rose-700'}" data-filter="attention">Needs Attention</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'answered' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-gray-600 hover:text-emerald-700'}" data-filter="answered">Answered (${answeredReviewsCount})</button>
          <button class="modal-review-filter-btn px-3 py-1.5 rounded-lg transition-colors ${activeFilter === 'unanswered' ? 'bg-white text-amber-700 shadow-sm font-bold' : 'text-gray-600 hover:text-amber-700'}" data-filter="unanswered">Unanswered (${unansweredReviewsCount})</button>
        </div>
      </div>

      <!-- Review Cards -->
      <div class="space-y-4">
        ${filteredReviews.length === 0
          ? `<div class="text-center py-10 bg-gray-50 rounded-2xl border border-gray-200 p-6 text-gray-500 text-xs">
               <i class="fas fa-comment-slash text-2xl text-gray-400 mb-2"></i>
               <p class="font-medium text-gray-700">No reviews match this filter</p>
               <p class="mt-0.5 text-gray-400">Try clearing the search or switching filters.</p>
             </div>`
          : filteredReviews.map((r) => renderReviewItem(r)).join('')
        }
      </div>
      <p class="text-xs text-gray-400 text-right">Showing ${filteredReviews.length} of ${allReviews.length} reviews</p>
    </div>`;

  // ── TAB: SETTINGS ──────────────────────────────────────────────────────────
  const settingsTab = `
    <div class="space-y-4">
      <!-- Listing URLs -->
      <div class="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-xs font-bold text-gray-800 flex items-center gap-1.5">
            <i class="fas fa-link text-amber-500"></i>
            Listing URLs
          </h4>
          <button id="modal-toggle-edit-links-btn" class="text-xs font-semibold text-amber-600 hover:text-amber-700 transition-colors">
            ${isEditingLinks ? '<i class="fas fa-times mr-1"></i>Cancel' : '<i class="fas fa-pen mr-1"></i>Edit Links & Scores'}
          </button>
        </div>

        ${!isEditingLinks ? `
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <div class="flex items-center gap-2 truncate pr-2">
                <i class="fas fa-hotel text-blue-600 flex-shrink-0"></i>
                <span class="truncate text-gray-700">${prop.bookingUrl ? escapeHtml(prop.bookingUrl) : '<span class="text-gray-400 italic">No Booking.com link added</span>'}</span>
              </div>
              ${prop.bookingUrl ? `<a href="${escapeHtml(prop.bookingUrl)}" target="_blank" rel="noopener" class="text-blue-500 hover:text-blue-700 p-1 flex-shrink-0"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
            </div>
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-200 shadow-sm">
              <div class="flex items-center gap-2 truncate pr-2">
                <i class="fab fa-airbnb text-rose-600 flex-shrink-0"></i>
                <span class="truncate text-gray-700">${prop.airbnbUrl ? escapeHtml(prop.airbnbUrl) : '<span class="text-gray-400 italic">No Airbnb link added</span>'}</span>
              </div>
              ${prop.airbnbUrl ? `<a href="${escapeHtml(prop.airbnbUrl)}" target="_blank" rel="noopener" class="text-rose-500 hover:text-rose-700 p-1 flex-shrink-0"><i class="fas fa-external-link-alt text-[10px]"></i></a>` : ''}
            </div>
          </div>
        ` : `
          <div class="space-y-4 pt-1">
            <div class="rounded-xl border border-blue-100 bg-blue-50/40 p-3 space-y-2.5">
              <span class="text-xs font-bold text-blue-900 flex items-center gap-1.5"><i class="fas fa-hotel text-blue-600"></i> Booking.com</span>
              <div>
                <label class="block text-[10px] font-semibold text-gray-600 mb-1">Listing URL</label>
                <input type="url" id="edit-booking-url-input" value="${escapeHtml(prop.bookingUrl || '')}" placeholder="https://www.booking.com/hotel/pt/..." class="w-full text-xs p-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white" />
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Score (/10)</label>
                  <input type="number" step="0.1" min="1" max="10" id="edit-booking-score-input" value="${prop.booking?.score != null ? prop.booking.score : ''}" placeholder="e.g. 9.2" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Cleanliness (/10)</label>
                  <input type="number" step="0.1" min="1" max="10" id="edit-booking-clean-input" value="${prop.booking?.subScores?.cleanliness != null ? prop.booking.subScores.cleanliness : ''}" placeholder="e.g. 9.5" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Review Count</label>
                  <input type="number" min="0" id="edit-booking-count-input" value="${prop.booking?.reviewCount != null ? prop.booking.reviewCount : ''}" placeholder="e.g. 15" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
              </div>
            </div>
            <div class="rounded-xl border border-rose-100 bg-rose-50/40 p-3 space-y-2.5">
              <span class="text-xs font-bold text-rose-900 flex items-center gap-1.5"><i class="fab fa-airbnb text-rose-600"></i> Airbnb</span>
              <div>
                <label class="block text-[10px] font-semibold text-gray-600 mb-1">Listing URL</label>
                <input type="url" id="edit-airbnb-url-input" value="${escapeHtml(prop.airbnbUrl || '')}" placeholder="https://www.airbnb.pt/rooms/..." class="w-full text-xs p-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 bg-white" />
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Score (/5.0)</label>
                  <input type="number" step="0.01" min="1" max="5" id="edit-airbnb-score-input" value="${prop.airbnb?.score != null ? prop.airbnb.score : ''}" placeholder="e.g. 4.88" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Cleanliness (/5.0)</label>
                  <input type="number" step="0.1" min="1" max="5" id="edit-airbnb-clean-input" value="${prop.airbnb?.subScores?.cleanliness != null ? prop.airbnb.subScores.cleanliness : ''}" placeholder="e.g. 4.9" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-gray-600 mb-0.5">Review Count</label>
                  <input type="number" min="0" id="edit-airbnb-count-input" value="${prop.airbnb?.reviewCount != null ? prop.airbnb.reviewCount : ''}" placeholder="e.g. 24" class="w-full text-xs p-2 rounded-lg border border-gray-300 bg-white" />
                </div>
              </div>
            </div>
            <div class="flex justify-end">
              <button id="modal-save-links-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs transition-colors shadow-sm">
                <i class="fas fa-save text-[11px]"></i> Save Details & Scores
              </button>
            </div>
          </div>
        `}
        <div class="mt-3 pt-2.5 border-t border-gray-200/70 flex items-start gap-2 text-[11px] text-gray-500">
          <i class="fas fa-info-circle text-amber-500 mt-0.5 flex-shrink-0"></i>
          <span>Run <code class="bg-gray-200/80 px-1 py-0.5 rounded text-gray-800 font-mono text-[10px]">sync-reviews.cmd</code> to pull latest scores and guest reviews.</span>
        </div>
      </div>

      <!-- Archive / Restore -->
      <div class="rounded-2xl border ${isArchived ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/30'} p-4">
        <h4 class="text-xs font-bold ${isArchived ? 'text-emerald-900' : 'text-amber-900'} mb-1 flex items-center gap-1.5">
          <i class="fas ${isArchived ? 'fa-box-open text-emerald-600' : 'fa-box-archive text-amber-600'}"></i>
          ${isArchived ? 'Property Archived' : 'Archive Property'}
        </h4>
        <p class="text-[11px] ${isArchived ? 'text-emerald-700' : 'text-amber-700'} mb-3 leading-snug">
          ${isArchived
            ? 'This property is currently archived and hidden from the active portfolio. Restore it to make it visible again.'
            : 'Archiving removes this property from the active portfolio view. Scores and reviews are preserved and it can be restored at any time.'}
        </p>
        <button id="modal-toggle-archive-btn" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${isArchived ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600' : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-300'}">
          <i class="fas ${isArchived ? 'fa-box-open' : 'fa-box-archive'} text-[11px]"></i>
          ${isArchived ? 'Restore to Active' : 'Archive Property'}
        </button>
      </div>
    </div>`;

  const tabContent = {
    overview: overviewTab,
    insights: insightsTab,
    reviews: reviewsTab,
    settings: settingsTab
  };

  return `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm">
      <div class="bg-white rounded-3xl max-w-3xl w-full shadow-2xl relative max-h-[92vh] flex flex-col">
        <!-- Close Button -->
        <button id="modal-close-btn" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center transition-colors z-10">
          <i class="fas fa-times text-sm"></i>
        </button>

        <!-- Header (fixed) -->
        <div class="px-6 pt-6 pb-0 flex-shrink-0">
          <div class="flex items-start gap-3 pr-10 mb-1">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-0.5">
                <span class="text-xs font-semibold uppercase tracking-wider text-amber-600">Property Reviews & Ratings</span>
                ${prop.airbnb?.badge === 'Guest favourite' ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"><i class="fas fa-trophy text-[9px]"></i>Guest Favourite</span>` : ''}
                ${isArchived ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"><i class="fas fa-box-archive text-[9px]"></i>Archived</span>` : ''}
              </div>
              <h2 class="text-2xl font-black text-gray-900 truncate">${escapeHtml(prop.name)}</h2>
              <p class="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                <i class="fas fa-map-marker-alt text-gray-400"></i>
                <span>${escapeHtml(prop.location || 'Madeira')}</span>
                <span class="mx-1.5">•</span>
                <span>${allReviews.length} fetched review${allReviews.length !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>

          <!-- Tab Bar -->
          <div class="flex items-center gap-0 -mb-px mt-4 border-b border-gray-200 overflow-x-auto">
            ${TABS.map(tabBtn).join('')}
          </div>
        </div>

        <!-- Scrollable Tab Content -->
        <div class="overflow-y-auto flex-grow px-6 pt-5 pb-6">
          ${tabContent[activeModalTab] || overviewTab}
        </div>

        <!-- Footer -->
        <div class="px-6 pb-5 pt-3 border-t border-gray-100 flex justify-end flex-shrink-0">
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
  const scoreText = typeof r.score === 'number' ? (isAirbnb ? `${r.score} ★` : `${r.score} / 10`) : 'No score';
  const initials = getInitials(r.author);
  const response = getReviewResponse(r);
  const answered = hasReviewResponse(r);

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
              <span class="text-[11px] text-gray-400">${escapeHtml(formatReviewDate(r))}</span>
            </div>
            ${r.propertyName ? `
              <div class="mt-1">
                <button class="latest-review-prop-btn inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-medium transition-colors border border-amber-200" data-property-id="${escapeHtml(r.propertyId || '')}" title="View property details">
                  <i class="fas fa-building text-amber-600 text-[10px]"></i>
                  <span>${escapeHtml(r.propertyName)}</span>
                  <i class="fas fa-arrow-right text-[8px] opacity-60"></i>
                </button>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="flex flex-col items-end flex-shrink-0 gap-1.5">
          <div class="flex items-center gap-1.5">
            <span class="inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[10px] font-bold ${answered ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}">
              <i class="fas ${answered ? 'fa-reply' : 'fa-clock'}"></i>
              ${answered ? 'Answered' : 'Unanswered'}
            </span>
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${isAirbnb ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}">
              ${scoreText}
            </span>
            <button class="review-delete-btn text-gray-400 hover:text-rose-600 transition-colors text-xs p-1" data-review-id="${escapeHtml(r.id)}" ${r.propertyId ? `data-property-id="${escapeHtml(r.propertyId)}"` : ''} title="Delete review">
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

      ${
        answered
          ? `
        <div class="rounded-xl bg-sky-50/80 border border-sky-100 p-3 text-xs text-sky-950">
          <div class="flex items-center justify-between gap-2 mb-1.5">
            <strong class="font-semibold text-sky-800 flex items-center gap-1.5"><i class="fas fa-reply"></i>Host answer${r.responseAuthor ? ` by ${escapeHtml(r.responseAuthor)}` : ''}</strong>
            ${r.responseDate ? `<span class="text-[10px] text-sky-600">${escapeHtml(r.responseDate)}</span>` : ''}
          </div>
          <p class="leading-relaxed whitespace-pre-line">${escapeHtml(response)}</p>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderInsightsPanel(prop) {
  const insights = analysePropertyInsights(prop);
  if (!insights.hasData) return '';

  const { issues, positives, recommendations, reviewsAnalysed } = insights;

  const severityClasses = {
    high: 'bg-rose-50 border-rose-200 text-rose-800',
    medium: 'bg-amber-50 border-amber-200 text-amber-800',
    low: 'bg-gray-50 border-gray-200 text-gray-600'
  };
  const severityIconClasses = {
    high: 'text-rose-500',
    medium: 'text-amber-500',
    low: 'text-gray-400'
  };
  const severityDotClasses = {
    high: 'bg-rose-500',
    medium: 'bg-amber-400',
    low: 'bg-gray-300'
  };

  const noIssues = issues.length === 0;
  const noPositives = positives.length === 0;

  return `
    <div class="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4 space-y-4">
      <!-- Panel Header -->
      <div class="flex items-center justify-between gap-2 flex-wrap">
        <h4 class="text-sm font-bold text-indigo-900 flex items-center gap-2">
          <span class="w-7 h-7 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-lightbulb text-xs"></i>
          </span>
          Guest Insights &amp; Recommendations
        </h4>
        ${reviewsAnalysed > 0
          ? `<span class="text-[11px] text-indigo-500 font-medium bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
               Based on ${reviewsAnalysed} review${reviewsAnalysed > 1 ? 's' : ''} with written feedback
             </span>`
          : `<span class="text-[11px] text-indigo-400 font-medium">Based on scores &amp; sub-scores</span>`
        }
      </div>

      <!-- Issues + Positives two-column grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <!-- Issues Column -->
        <div class="rounded-xl border ${noIssues ? 'border-emerald-100 bg-emerald-50/50' : 'border-rose-100 bg-rose-50/30'} p-3">
          <div class="flex items-center gap-1.5 mb-2.5">
            <i class="fas ${noIssues ? 'fa-check-circle text-emerald-500' : 'fa-exclamation-triangle text-rose-500'} text-xs"></i>
            <span class="text-xs font-bold ${noIssues ? 'text-emerald-800' : 'text-rose-800'}">
              ${noIssues ? 'No Issues Detected' : `Issues Reported (${issues.length})`}
            </span>
          </div>
          ${noIssues
            ? `<p class="text-[11px] text-emerald-700">All guest feedback is positive — great work! Keep maintaining current standards.</p>`
            : `<ul class="space-y-1.5">
                ${issues.map((issue) => `
                  <li class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[11px] font-medium ${severityClasses[issue.severity]}">
                    <span class="flex items-center gap-1.5 truncate">
                      <i class="fas fa-${issue.icon} ${severityIconClasses[issue.severity]} flex-shrink-0"></i>
                      <span class="truncate">${escapeHtml(issue.label)}</span>
                    </span>
                    <span class="flex items-center gap-1 flex-shrink-0">
                      <span class="w-1.5 h-1.5 rounded-full ${severityDotClasses[issue.severity]}"></span>
                      <span>${issue.count}×</span>
                    </span>
                  </li>
                `).join('')}
              </ul>`
          }
        </div>

        <!-- Positives Column -->
        <div class="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3">
          <div class="flex items-center gap-1.5 mb-2.5">
            <i class="fas fa-thumbs-up text-emerald-500 text-xs"></i>
            <span class="text-xs font-bold text-emerald-800">
              ${noPositives ? 'No Praise Detected' : `What Guests Love (${positives.length})`}
            </span>
          </div>
          ${noPositives
            ? `<p class="text-[11px] text-emerald-600 italic">No specific praise keywords detected in written reviews.</p>`
            : `<ul class="space-y-1.5">
                ${positives.map((pos) => `
                  <li class="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-emerald-100 bg-white text-[11px] font-medium text-emerald-800">
                    <span class="flex items-center gap-1.5 truncate">
                      <i class="fas fa-${pos.icon} text-emerald-500 flex-shrink-0"></i>
                      <span class="truncate">${escapeHtml(pos.label)}</span>
                    </span>
                    <span class="text-emerald-600 font-bold flex-shrink-0">${pos.count}×</span>
                  </li>
                `).join('')}
              </ul>`
          }
        </div>
      </div>

      <!-- Recommendations -->
      ${recommendations.length > 0 ? `
        <div class="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
          <div class="flex items-center gap-1.5 mb-1">
            <i class="fas fa-clipboard-list text-indigo-500 text-xs"></i>
            <span class="text-xs font-bold text-indigo-900">Recommendations (${recommendations.length})</span>
          </div>
          <ul class="space-y-1.5">
            ${recommendations.map((rec) => `
              <li class="flex items-start gap-2 text-[11px] text-gray-700">
                <i class="fas fa-${rec.icon} text-indigo-400 mt-0.5 flex-shrink-0"></i>
                <span class="leading-snug">${escapeHtml(rec.text)}</span>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
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

  // Tab buttons (Properties vs Improvements vs Latest Reviews)
  container.querySelectorAll('.reviews-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onTabChange?.(btn.dataset.tab);
    });
  });

  // Improvements search input
  const impSearchInput = container.querySelector('#improvements-search-input');
  impSearchInput?.addEventListener('input', (e) => {
    handlers.onImprovementsSearch?.(e.target.value);
  });

  // Improvements category filter buttons
  container.querySelectorAll('.improvements-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onImprovementsFilter?.(btn.dataset.category);
    });
  });

  // Improvements View Property buttons
  container.querySelectorAll('.improvements-view-prop-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const propId = btn.dataset.id;
      if (propId) handlers.onSelectProperty?.(propId, false);
    });
  });

  // Details buttons on property cards
  container.querySelectorAll('.reviews-details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onSelectProperty?.(btn.dataset.id, false);
    });
  });

  // Property link buttons on Latest Reviews feed
  container.querySelectorAll('.latest-review-prop-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const propId = btn.dataset.propertyId;
      if (propId) handlers.onSelectProperty?.(propId, false);
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

  // Modal Tab Buttons
  container.querySelectorAll('.modal-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onModalTabChange?.(btn.dataset.tab);
    });
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

  // Modal Toggle Archive Button
  container.querySelector('#modal-toggle-archive-btn')?.addEventListener('click', () => {
    handlers.onToggleArchive?.();
  });

  // Modal Toggle Edit Links Button
  container.querySelector('#modal-toggle-edit-links-btn')?.addEventListener('click', () => {
    handlers.onToggleEditLinks?.();
  });

  // Modal Save Links & Scores Button
  container.querySelector('#modal-save-links-btn')?.addEventListener('click', () => {
    const bookingUrl = container.querySelector('#edit-booking-url-input')?.value.trim() || '';
    const airbnbUrl = container.querySelector('#edit-airbnb-url-input')?.value.trim() || '';
    const bookingScore = container.querySelector('#edit-booking-score-input')?.value.trim();
    const bookingClean = container.querySelector('#edit-booking-clean-input')?.value.trim();
    const bookingCount = container.querySelector('#edit-booking-count-input')?.value.trim();
    const airbnbScore = container.querySelector('#edit-airbnb-score-input')?.value.trim();
    const airbnbClean = container.querySelector('#edit-airbnb-clean-input')?.value.trim();
    const airbnbCount = container.querySelector('#edit-airbnb-count-input')?.value.trim();

    handlers.onSaveLinks?.({
      bookingUrl,
      airbnbUrl,
      bookingScore,
      bookingClean,
      bookingCount,
      airbnbScore,
      airbnbClean,
      airbnbCount
    });
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
    const response = container.querySelector('#review-response-input')?.value.trim() || '';

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
      negative,
      response
    });
  });

  // Delete Review Buttons
  container.querySelectorAll('.review-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const reviewId = btn.dataset.reviewId;
      const propertyId = btn.dataset.propertyId;
      if (reviewId) {
        handlers.onDeleteReview?.(reviewId, propertyId);
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

function formatReviewDate(review = {}) {
  if (!review.date) return review.localizedDate || 'Verified Stay';
  let dateVal = review.date;
  if (typeof dateVal === 'number' || /^\d{9,13}$/.test(String(dateVal).trim())) {
    const num = Number(dateVal);
    dateVal = num < 1e11 ? num * 1000 : num;
  } else if (typeof dateVal === 'string') {
    dateVal = dateVal.replace(/^Reviewed:\s*/i, '').trim();
  }
  const parsed = new Date(dateVal);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', day: 'numeric' });
  }
  return review.localizedDate || review.date;
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
