import { buildAttentionQueue } from './reviews-attention-utils.js';
import { platformHealth, reviewTime, RATING_THRESHOLDS } from './review-quality-utils.js';
import { analysePropertyInsights } from './reviews-ratings-utils.js';
import { reviewText as t } from './reviews-ratings-copy.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = (key, values) => h(t(key, values));
const platformName = platform => platform === 'all' ? t('allPlatforms') : platform === 'airbnb' ? 'Airbnb' : 'Booking.com';
const score = value => value === null || value === undefined ? '—' : Number(value).toFixed(2);
export const reviewDate = value => reviewTime(value) === null ? t('unknownDate') : new Date(reviewTime(value)).toLocaleDateString(globalThis.window?.i18n?.currentLang === 'pt' ? 'pt-PT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function renderReviewWorkspaceStyles() {
  return `<style>
    .reviews-page-wrapper { color:#1f2937; }
    .reviews-page-wrapper :is(button,input,select):focus-visible { outline:2px solid #b45309; outline-offset:3px; }
    .reviews-page-wrapper button { touch-action:manipulation; }.reviews-page-wrapper .reviews-tab-btn {white-space:nowrap;flex-shrink:0}.rr-action:disabled {opacity:.45;cursor:default}
    .rr-summary { display:grid;grid-template-columns:repeat(4,minmax(0,1fr));background:white;border-block:1px solid #e5e7eb; }
    .rr-metric { padding:20px;text-align:left;border-right:1px solid #e5e7eb;min-width:0; }
    .rr-metric:last-child { border-right:0; }
    .rr-label { font-size:13px;color:#4b5563;font-weight:600; }
    .rr-value { display:block;font-size:28px;font-weight:700;letter-spacing:-.03em;margin:5px 0; }
    .rr-note { font-size:13px;line-height:1.6;color:#4b5563; }
    .rr-controls { display:flex;flex-wrap:wrap;gap:12px;align-items:center; }
    .rr-controls input,.rr-controls select { border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;font-size:14px;background:white;max-width:100%; }
    .rr-controls input { flex:1;min-width:180px; }
    .rr-tabs { display:flex;gap:6px;flex-wrap:wrap;padding:16px 0; }
    .rr-tabs button { padding:8px 12px;font-size:13px;border-radius:6px;color:#4b5563; }
    .rr-tabs button[aria-pressed=true] { background:#fef3c7;color:#78350f;font-weight:650; }
    .rr-row { display:grid;grid-template-columns:minmax(155px,1fr) minmax(0,2.2fr) auto;gap:24px;align-items:start;padding:20px 4px;border-top:1px solid #e5e7eb; }
    .rr-row h3 { font-size:15px;font-weight:650; }
    .rr-row p { font-size:14px;line-height:1.6; }
    .rr-row blockquote { margin:8px 0 0;padding-left:12px;border-left:2px solid #d1d5db;color:#4b5563;font-size:14px;overflow-wrap:anywhere; }
    .rr-action { padding:8px 12px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;font-weight:600;background:white;transition:background .15s; }
    .rr-action:hover { background:#f9fafb; }
    .rr-actions { display:flex;gap:8px;flex-wrap:wrap; }
    .rr-evidence { padding:14px 0;border-top:1px solid #e5e7eb; }
    .rr-health { padding:16px 0;border-block:1px solid #e5e7eb;margin:16px 0; }
    .rr-health-grid { display:grid;grid-template-columns:1fr 1fr;gap:20px; }
    .rr-health dt { font-size:12px;color:#6b7280; }.rr-health dd { font-size:13px;margin-bottom:8px; }
    .reviews-page-wrapper .text-xs { font-size:13px; }
    .reviews-page-wrapper [class*="text-[10px]"],.reviews-page-wrapper [class*="text-[11px]"] { font-size:12px; }
    .rr-workspace { animation:rr-enter .16s ease-out; }
    @keyframes rr-enter { from { opacity:.6;transform:translateY(3px) } to { opacity:1;transform:none } }
    @media(max-width:767px) { .rr-summary { grid-template-columns:1fr 1fr; }.rr-metric { padding:14px;border-bottom:1px solid #e5e7eb; }.rr-metric .rr-note {font-size:12px;line-height:1.4}.rr-row { grid-template-columns:1fr;gap:10px; }.rr-value {font-size:24px}.rr-health-grid {grid-template-columns:1fr}.rr-controls label {width:100%} }
    @media(prefers-reduced-motion:reduce) { .rr-workspace {animation:none}.rr-action {transition:none} }
  </style>`;
}

export function renderReviewMetrics(summary, mode = 'property', expanded = null) {
  const weighted = mode === 'weighted';
  return `<details class="rr-metrics-panel" ${(expanded ?? (globalThis.innerWidth >= 768)) ? 'open' : ''}><summary id="reviews-metrics-toggle" class="cursor-pointer text-sm font-semibold mb-3">${tx('portfolio')}</summary><section aria-label="${tx('averageMode')}">
    <div class="rr-controls mb-3"><label class="rr-note" for="reviews-average-mode">${tx('averageMode')}</label><select id="reviews-average-mode"><option value="property" ${weighted ? '' : 'selected'}>${tx('average')}</option><option value="weighted" ${weighted ? 'selected' : ''}>${tx('weighted')}</option></select></div>
    <div class="rr-summary">
      ${['airbnb', 'booking'].map(platform => { const metric = summary[platform] || {}; return `<button class="rr-metric" data-metric="${platform}">
        <span class="rr-label">${platformName(platform)}</span><span class="rr-value">${score(weighted ? metric.weightedAverage : metric.average)} <small class="text-sm text-gray-500">/ ${platform === 'airbnb' ? 5 : 10}</small></span>
        <span class="rr-note">${weighted ? tx('weightedBasis', { count: metric.weightedProperties || 0, reviews: metric.weightReviews || 0 }) : tx('ratedProperties', { count: metric.properties || 0 })}</span><span class="rr-note block mt-1">${tx('target', { target: platform === 'airbnb' ? RATING_THRESHOLDS.AIRBNB_TARGET : RATING_THRESHOLDS.BOOKING_TARGET })}</span></button>`; }).join('')}
      <button class="rr-metric" data-metric="cleanliness"><span class="rr-label">${tx('cleanliness')}</span>
        <span class="block mt-2 text-base font-semibold">Airbnb ${score(summary.airbnb?.cleanliness)} / 5</span><span class="rr-note">${tx('cleanBasis', { count: summary.airbnb?.cleanlinessProperties || 0 })}</span>
        <span class="block mt-2 text-base font-semibold">Booking ${score(summary.booking?.cleanliness)} / 10</span><span class="rr-note">${tx('cleanBasis', { count: summary.booking?.cleanlinessProperties || 0 })}</span></button>
      <button class="rr-metric" data-metric="coverage"><span class="rr-label">${tx('coverage')}</span><span class="rr-value">${summary.importedReviews || 0}</span><span class="rr-note block">${tx('imported', { count: summary.importedReviews || 0 })}</span><span class="rr-note">${tx('reported', { count: summary.totalReviews || 0 })}</span></button>
    </div>
    <details class="rr-note mt-2"><summary class="cursor-pointer">${tx('average')} · ${tx('coverage')}</summary><p>${tx('averageHelp')}</p><p>${tx('coverageHelp')}</p><p>${tx('countsKnown', { count: (summary.airbnb?.countsKnown || 0) + (summary.booking?.countsKnown || 0) })}</p><p>${tx('unknownDates', { count: (summary.airbnb?.unknownDates || 0) + (summary.booking?.unknownDates || 0) })}</p></details>
  </section></details>`;
}

export function renderAttentionWorkspace(properties, state) {
  const queue = state.attentionQueue || 'all';
  const platform = state.attentionPlatform || 'all';
  const search = state.attentionSearch || '';
  const result = buildAttentionQueue(properties, { queue, platform, search, workItems: state.workItems || [], tasks: state.linkedTasks || [], followUps: state.followUps || [] });
  const pages = Math.max(1, Math.ceil(result.items.length / 25));
  const page = Math.min(state.attentionPage || 1, pages);
  return `<section class="rr-workspace" aria-label="${tx('attention')}">
    <div class="flex justify-between items-baseline gap-3"><h2 class="text-xl font-semibold">${tx('attention')}</h2><span class="rr-note" role="status">${tx('results', { count: result.items.length })}</span></div>
    <p class="rr-note mt-2 mb-4">${tx('attentionHelp')}</p>
    <div class="rr-controls"><input id="attention-search" aria-label="${tx('search')}" placeholder="${tx('search')}" value="${h(search)}"><label for="attention-platform" class="sr-only">${tx('platform')}</label><select id="attention-platform">${['all', 'airbnb', 'booking'].map(p => `<option value="${p}" ${platform === p ? 'selected' : ''}>${p === 'all' ? tx('allPlatforms') : platformName(p)}</option>`).join('')}</select></div>
    <div class="rr-tabs" aria-label="${tx('attention')}">${Object.entries(result.counts).map(([key, count]) => `<button data-attention-queue="${key}" aria-pressed="${queue === key}">${tx(key)} <span class="ml-1">${count}</span></button>`).join('')}</div>
    ${queue === 'declining' ? `<p class="rr-note mb-3">${tx('declineHelp')}</p>` : ''}
    ${queue === 'classifications' ? `<p class="rr-note mb-3">${tx('evidenceHelp')}</p>` : ''}
    ${queue === 'data' ? `<p class="rr-note mb-3">${tx('dataHealthHelp')}</p>` : ''}
    ${result.items.slice((page - 1) * 25, page * 25).map(row => `<article class="rr-row">
      <div><h3>${h(row.propertyName)}</h3><p class="rr-note">${h(row.location)} · ${platformName(row.platform)}</p><span class="rr-note">${tx(row.queue)}${row.category ? ` · ${tx(`${row.category}Category`)}` : ''}</span></div>
      <div><p>${tx(row.reason, row.params)}</p>${row.excerpt ? `<blockquote>${h(row.excerpt)}</blockquote>` : ''}${row.date || row.author ? `<p class="rr-note mt-1">${h(row.author || '')} · ${h(reviewDate(row.date))}${row.score != null ? ` · ${h(row.score)} / ${row.platform === 'airbnb' ? 5 : 10}` : ''}</p>` : ''}
      ${row.health ? `<p class="rr-note">${tx('lastSuccess')}: ${h(reviewDate(row.health.lastSuccess))}</p>` : ''}
      ${row.finding ? renderFindingActions(row.propertyId, row.finding) : ''}</div>
      <button class="rr-action" ${row.workId ? `data-work-id="${h(row.workId)}" data-work-property="${h(row.propertyId)}" data-work-category="${h(row.category)}"` : `data-attention-property="${h(row.propertyId)}"`} data-action="${row.action}" data-review-id="${h(row.reviewId || '')}">${tx(row.action === 'reviews' ? 'openReviews' : row.action === 'settings' ? 'openSettings' : 'openProperty')}</button>
    </article>`).join('') || `<div class="py-12 text-center"><h3 class="font-semibold">${tx('empty')}</h3><p class="rr-note mt-2">${tx('emptyHelp')}</p></div>`}
    <div class="rr-controls justify-end border-t border-gray-200 pt-4"><button class="rr-action" data-attention-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>${tx('previous')}</button><span class="rr-note">${tx('page', { page, pages })}</span><button class="rr-action" data-attention-page="${page + 1}" ${page === pages ? 'disabled' : ''}>${tx('next')}</button></div>
  </section>`;
}

function renderFindingActions(propertyId, finding) {
  const button = (decision, label) => `<button class="rr-action" data-insight-property="${h(propertyId)}" data-insight-key="${h(finding.key)}" data-decision="${decision}">${tx(label)}</button>`;
  return `<div class="rr-actions mt-3">${finding.decision === 'pending' ? button('confirmed', 'confirm') + button('dismissed', 'dismiss') : button('pending', 'restore')}</div>`;
}

export function renderPropertyDataHealth(property) {
  return `<section class="rr-health"><h3 class="font-semibold mb-3">${tx('dataHealth')}</h3><div class="rr-health-grid">${['airbnb', 'booking'].map(platform => {
    const health = platformHealth(property, platform);
    return `<div><h4 class="font-semibold text-sm">${platformName(platform)}</h4><p class="rr-note mb-2">${tx(health.status)}</p><dl><dt>${tx('lastSuccess')}</dt><dd>${h(reviewDate(health.lastSuccess))}</dd><dt>${tx('lastAttempt')}</dt><dd>${h(reviewDate(health.lastAttempt))}</dd><dt>${tx('reviewCollection')}</dt><dd>${h(reviewDate(health.reviewsCollectedAt))}</dd></dl></div>`;
  }).join('')}</div></section>`;
}

export function renderPropertyEvidence(property) {
  const evidence = analysePropertyInsights(property).evidence || [];
  if (!evidence.length) return '';
  return `<section class="mt-5"><h3 class="font-semibold">${tx('evidence')}</h3><p class="rr-note my-2">${tx('evidenceHelp')}</p>${evidence.map(finding => `<div class="rr-evidence"><div class="flex flex-wrap justify-between gap-2 text-sm"><strong>${tx(`${finding.category}Category`)}</strong><span>${tx(finding.decision)}</span></div><blockquote class="text-sm text-gray-700 my-2">${h(finding.excerpt)}</blockquote><p class="rr-note">${h(finding.author)} · ${h(finding.platform)} · ${h(reviewDate(finding.date))}</p>${renderFindingActions(property.id, finding)}</div>`).join('')}</section>`;
}
