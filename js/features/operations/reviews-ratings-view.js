import { renderWorkspace } from './reviews-workspace-view.js';
import { bindWorkflowEvents } from './reviews-workflow-view.js';
import { bindTrendsEvents } from './reviews-trends-view.js';

export function renderReviewsRatingsDashboard(container, state, handlers) {
  if (!container) return;
  const { selectedProperty = null, activeModalTab = 'overview', activeTab = 'attention' } = state;
  const sameProperty = container._rrPropertyId === state.selectedProperty?.id;
  const disclosures = new Map([...container.querySelectorAll('[data-rr-disclosure]')].filter(el => sameProperty || !el.dataset.rrDisclosure.startsWith('property-')).map(el => [el.dataset.rrDisclosure, el.open]));
  container._rrPropertyId = state.selectedProperty?.id;
  const focused = container.contains(document.activeElement) ? document.activeElement : null;
  const focusId = focused?.id;
  const focusAttributes = ['data-id', 'data-property-view', 'data-rr-disclosure', 'data-attention-queue', 'data-attention-page', 'data-attention-property', 'data-attention-review-key', 'data-insight-key', 'data-insight-property', 'data-tab', 'data-mode', 'data-filter', 'data-metric', 'data-inbox-key', 'data-inbox-property', 'data-work-id', 'data-work-property', 'data-work-new', 'data-work-category', 'data-inbox-page', 'data-work-page', 'data-trend-platform'];
  const focusSelector = focused ? focusAttributes.filter(attr => focused.hasAttribute(attr)).map(attr => `[${attr}="${CSS.escape(focused.getAttribute(attr))}"]`).join('') : '';
  const selection = focused && (['text', 'search'].includes(focused.type) || focused.tagName === 'TEXTAREA') ? [focused.selectionStart, focused.selectionEnd] : null;
  const navigationScroll = container.querySelector('.rr-navigation-tabs')?.scrollLeft || 0;
  const queueScroll = container.querySelector('.rr-queue-nav')?.scrollLeft || 0;
  const previousDialog = container.querySelector('[role="dialog"]');
  const panelKey = selectedProperty ? `${selectedProperty.id}|${activeModalTab}` : '';
  const modalScroll = container._rrPanelKey === panelKey ? previousDialog?.querySelector('.overflow-y-auto')?.scrollTop || 0 : 0;
  container._rrPanelKey = panelKey;
  if (selectedProperty && !previousDialog) {
    container._rrScroll = window.scrollY;
    container._rrReturnFocus = focusId ? `#${CSS.escape(focusId)}` : focusSelector;
    container._rrBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  container.innerHTML = renderWorkspace(state);
  container.querySelectorAll('[data-rr-disclosure]').forEach(el => {
    if (disclosures.has(el.dataset.rrDisclosure) && !(el.dataset.rrDisclosure === 'property-settings' && state.isEditingLinks)) el.open = disclosures.get(el.dataset.rrDisclosure);
  });
  // Bind Events
  bindViewEvents(container, handlers);
  bindWorkflowEvents(container, handlers);
  bindTrendsEvents(container, handlers);
  container.querySelectorAll('.reviews-tab-btn').forEach(button => button.setAttribute('aria-current', button.dataset.tab === activeTab ? 'page' : 'false'));
  const nav = container.querySelector('.rr-navigation-tabs');
  const activeNav = nav?.querySelector('[aria-current="page"]');
  const queueNav = container.querySelector('.rr-queue-nav');
  if (queueNav) queueNav.scrollLeft = queueScroll;
  if (nav && activeNav) {
    nav.scrollLeft = navigationScroll;
    const bounds = nav.getBoundingClientRect(), activeBounds = activeNav.getBoundingClientRect();
    if (activeBounds.right > bounds.right) nav.scrollLeft += activeBounds.right - bounds.right;
    else if (activeBounds.left < bounds.left) nav.scrollLeft -= bounds.left - activeBounds.left;
  }
  const nextFocus = focusId ? document.getElementById(focusId) : focusSelector ? container.querySelector(focusSelector) || container.querySelector('[data-attention-queue][aria-pressed="true"]') : null;
  if (nextFocus && container.contains(nextFocus)) {
    nextFocus.focus({ preventScroll: true });
    if (selection) nextFocus.setSelectionRange(...selection);
  }
  const dialog = container.querySelector('[role="dialog"]');
  if (dialog && !previousDialog) {
    if (state.isEditingLinks) {
      const editInput = dialog.querySelector('#edit-airbnb-url-input, #edit-booking-url-input, #modal-toggle-edit-links-btn');
      editInput?.focus({ preventScroll: true });
    } else {
      dialog.querySelector('#modal-close-btn')?.focus({ preventScroll: true });
    }
  }
  if (dialog && previousDialog) { dialog.style.animation = 'none'; dialog.querySelector('.overflow-y-auto').scrollTop = modalScroll; }
  container.querySelector('main').inert = Boolean(dialog);
  container.querySelector('header').inert = Boolean(dialog);
  if (!dialog && previousDialog) {
    document.body.style.overflow = container._rrBodyOverflow || '';
    window.scrollTo({ top: container._rrScroll || 0, behavior: 'instant' });
    const returnTarget = container._rrReturnFocus ? container.querySelector(container._rrReturnFocus) : null;
    (returnTarget || container.querySelector('.reviews-tab-btn[aria-current="page"]'))?.focus({ preventScroll: true });
  }
  container.onkeydown = event => {
    const currentDialog = container.querySelector('[role="dialog"]');
    if (!currentDialog) return;
    if (event.key === 'Escape') { event.preventDefault(); handlers.onCloseDetailModal?.(); }
    if (event.key === 'Tab') {
      const focusable = [...currentDialog.querySelectorAll('button:not([disabled]), input, select, textarea, a[href], summary')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
}

function bindViewEvents(container, handlers) {
  container.querySelectorAll('[data-property-view]').forEach(button => button.addEventListener('click', () => handlers.onPropertyView?.(button.dataset.propertyView)));
  container.querySelector('#reviews-property-filter')?.addEventListener('change', e => handlers.onFilter?.(e.target.value));
  container.querySelector('#modal-review-filter')?.addEventListener('change', e => handlers.onModalReviewFilter?.(e.target.value));
  container.querySelector('#review-platform-input')?.addEventListener('change', e => {
    const max = e.target.value === 'Airbnb' ? '5' : '10';
    for (const id of ['review-score-input', 'review-clean-input']) container.querySelector(`#${id}`).max = max;
  });
  container.querySelector('#reviews-metrics-toggle')?.addEventListener('click', event => { event.preventDefault(); handlers.onMetricsExpanded?.(!event.currentTarget.parentElement.open); });
  container.querySelector('#reviews-average-mode')?.addEventListener('change', e => handlers.onAverageMode?.(e.target.value));
  container.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => handlers.onMetric?.(button.dataset.metric)));
  container.querySelector('#attention-search')?.addEventListener('input', e => handlers.onAttentionFilter?.('attentionSearch', e.target.value));
  container.querySelector('#attention-platform')?.addEventListener('change', e => handlers.onAttentionFilter?.('attentionPlatform', e.target.value));
  container.querySelectorAll('[data-attention-queue]').forEach(button => button.addEventListener('click', () => handlers.onAttentionFilter?.('attentionQueue', button.dataset.attentionQueue)));
  container.querySelectorAll('[data-attention-page]').forEach(button => button.addEventListener('click', () => handlers.onAttentionPage?.(Number(button.dataset.attentionPage))));
  container.querySelectorAll('[data-attention-property]').forEach(button => button.addEventListener('click', () => handlers.onAttentionProperty?.(button.dataset.attentionProperty, button.dataset.action, button.dataset.reviewId, button.dataset.attentionReviewKey)));
  container.querySelectorAll('[data-insight-key]').forEach(button => button.addEventListener('click', () => handlers.onInsightDecision?.(button.dataset.insightProperty, button.dataset.insightKey, button.dataset.decision)));

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

  // View mode switcher buttons (Cards vs List)
  container.querySelectorAll('.reviews-view-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onViewModeChange?.(btn.dataset.mode);
    });
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
    if (!container.querySelector('#property-listing-form')?.reportValidity()) return;
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
