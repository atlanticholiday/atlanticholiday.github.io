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
    @media(max-width:767px) { .rr-summary { grid-template-columns:1fr 1fr; }.rr-metric { padding:14px;border-bottom:1px solid #e5e7eb; }.rr-metric .rr-note {font-size:12px;line-height:1.4}.rr-row { grid-template-columns:1fr;gap:10px; }.rr-value {font-size:24px}.rr-health-grid {grid-template-columns:1fr}.rr-controls label:not(.sr-only) {width:100%} }
    @media(prefers-reduced-motion:reduce) { .rr-workspace {animation:none}.rr-action {transition:none} }
    .rr-shell{min-height:100vh;background:#fff;font-family:Inter,system-ui,sans-serif;color:#26302d;padding-bottom:48px}
    .rr-shell button,.rr-shell input,.rr-shell select,.rr-shell textarea{font-family:inherit}
    .rr-header{background:#fff;border-bottom:1px solid #e6e8e5;padding:0 40px;position:sticky;top:0;z-index:20}
    .rr-heading{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 0 20px}
    .rr-brand{display:flex;align-items:center;gap:18px;min-width:0}.rr-brand h1{font-size:22px;font-weight:650;letter-spacing:-.035em;line-height:1.3}.rr-brand p{font-size:13px;color:#737a76;margin-top:5px}
    .rr-back{width:36px;height:36px;border:1px solid #e6e8e5;border-radius:6px;font-size:21px;flex-shrink:0;transition:background .15s}.rr-back:hover{background:#f6f7f5}
    .rr-refresh{display:flex;align-items:flex-end;flex-direction:column;gap:8px}.rr-refresh>span{font-size:11px;color:#737a76}.rr-refresh button{font-size:12px}
    .rr-navigation-tabs{display:flex;gap:28px;overflow-x:auto;scrollbar-width:thin}.rr-navigation-tabs button{border-bottom:2px solid transparent;padding:14px 0;font-size:14px;color:#606964;display:flex;align-items:center;gap:8px;transition:color .15s,border-color .15s}
    .rr-navigation-tabs button[aria-current=page]{border-color:#b45309;color:#8a420c;font-weight:600}.rr-navigation-tabs button:hover{color:#8a420c}.rr-reference-tab{margin-left:auto}.rr-nav-count{background:#f3f1eb;padding:1px 6px;border-radius:4px;font-size:12px;color:#606964;font-variant-numeric:tabular-nums}
    .rr-main{max-width:1480px;margin:auto;padding:32px 40px}.rr-main>section{animation:rr-enter .16s ease-out}.rr-main h2{font-size:20px;font-weight:600;letter-spacing:-.025em}.rr-main>p[role]{margin-bottom:16px}
    .rr-section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:20px}.rr-section-heading h3{font-size:15px;font-weight:600}.rr-section-heading>.rr-note{font-size:12px;text-align:right}
    .rr-attention-layout{display:grid;grid-template-columns:205px minmax(0,1fr);gap:32px;margin-top:26px}.rr-queue-nav{display:flex;flex-direction:column;gap:4px;align-self:start}.rr-queue-nav button{display:flex;align-items:center;justify-content:space-between;gap:16px;text-align:left;font-size:13px;padding:11px 12px;border-radius:5px;color:#626a65;transition:background .15s}.rr-queue-nav button>span:last-child{font-variant-numeric:tabular-nums;font-size:12px;color:#7d837f}.rr-queue-nav button[aria-pressed=true]{background:#faf1e5;color:#874409;font-weight:600}.rr-queue-nav button:hover{background:#f6f5f1}.rr-queue-content{min-width:0}.rr-queue-content>.rr-controls{margin-bottom:18px}
    .rr-controls input,.rr-controls select{border-color:#dde1dc;font-size:13px;padding:9px 11px;border-radius:5px;min-height:38px}.rr-row{grid-template-columns:minmax(145px,1fr) minmax(0,2fr) auto;gap:22px;padding:22px 0}.rr-row h3{font-size:14px}.rr-row p{font-size:13px}.rr-row blockquote{font-size:13px}.rr-action{border-color:#dce0da;border-radius:5px;font-size:12px;line-height:1.5;font-weight:550;padding:8px 11px;white-space:normal;color:#38453c;background:white}.rr-primary{background:#a34d0b;color:white;border-color:#a34d0b}.rr-primary:hover{background:#874409}
    .rr-property-navigation{display:flex;gap:24px;border-bottom:1px solid #e5e7e3;margin:22px 0}.rr-property-navigation button{font-size:13px;padding:10px 0;border-bottom:2px solid transparent;color:#6c736d}.rr-property-navigation button[aria-pressed=true]{border-color:#59655b;color:#26302d}.rr-property-navigation span{font-size:11px;margin-left:5px}
    .rr-metrics-panel{margin:18px 0 24px}.rr-metrics-panel>summary{font-size:13px!important;font-weight:500!important;color:#68716a}.rr-metrics-panel[open]{padding-bottom:18px;border-bottom:1px solid #e5e7e3}.rr-summary{border:1px solid #e5e7e3}.rr-metric{text-align:left}.rr-value{font-size:26px}.rr-property-toolbar{margin:22px 0 18px}.rr-view-switch{display:flex;gap:2px;background:#f4f5f2;border-radius:5px;padding:3px}.rr-view-switch button{padding:6px 10px;font-size:12px;border-radius:3px}.rr-view-switch button[aria-pressed=true]{background:white;box-shadow:0 1px 3px #00000012}
    .rr-table-scroll{overflow:auto;max-width:100%}.rr-property-table{border-collapse:collapse;width:100%;font-size:13px}.rr-property-table th{text-align:left;padding:12px 14px;font-weight:500;font-size:12px;color:#6d766e;border-block:1px solid #e4e7e1;background:#fafbf9;white-space:nowrap}.rr-property-table td{padding:17px 14px;border-bottom:1px solid #eceee9;vertical-align:top}.rr-property-table td:first-child{min-width:180px}.rr-property-table td:last-child{white-space:nowrap}.rr-property-table tr:hover td{background:#fafbf9}.rr-property-name{text-align:left;font-size:14px;font-weight:600;color:#263c2e}.rr-property-name:hover{text-decoration:underline;text-underline-offset:3px}.rr-feedback-cell{max-width:280px;min-width:190px}.rr-property-table .rr-note{font-size:11px}.rr-platform-rating strong{font-size:19px;font-weight:600}.rr-platform-rating small{font-size:12px;font-weight:400;color:#818880}.rr-platform-rating h3{font-size:13px;font-weight:600;margin-bottom:10px}.rr-property-table .rr-platform-rating strong{font-size:15px}.rr-status{font-size:11px;color:#727b73;display:inline-block;max-width:140px}.rr-status-alert{color:#9a4a0b;background:#fcf1e4;padding:3px 7px;border-radius:4px}
    .rr-property-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.rr-property-card{padding:20px;border:1px solid #e4e7e1;border-radius:7px;transition:border-color .15s}.rr-property-card:hover{border-color:#b2bcaf}.rr-property-scores{display:grid;grid-template-columns:1fr 1fr;gap:20px;padding:20px 0;border-bottom:1px solid #e6e9e3}.rr-property-card .rr-property-scores{margin-bottom:12px}.rr-empty{padding:48px 0;color:#70786f;font-size:14px;text-align:center}
    .rr-inspector-header{padding:26px 28px 20px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.rr-inspector-header h2{font-size:23px;line-height:1.3;font-weight:600;letter-spacing:-.03em;margin:5px 0}.rr-eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a8379}.rr-inspector-tabs{display:flex;gap:24px;padding:0 28px;border-bottom:1px solid #e2e7df}.rr-inspector-tabs button{padding:12px 0;border-bottom:2px solid transparent;font-size:13px;color:#667161}.rr-inspector-tabs button[aria-current=page]{color:#984909;border-color:#b45309;font-weight:600}.rr-inspector-content{padding:24px 28px;flex:1}.rr-drawer{width:min(740px,70vw)}.rr-disclosure{border-top:1px solid #e3e7df;margin-top:24px;padding-top:18px}.rr-disclosure>summary{font-size:13px;font-weight:600;cursor:pointer}.rr-review{padding:22px 0;border-bottom:1px solid #e6e9e2}.rr-reply{font-size:13px;white-space:pre-wrap;border-left:2px solid #d6dfce;padding:12px 16px;background:#f7f9f4;margin-top:12px}.rr-manual-form{border-block:1px solid #e3e7dd;padding:20px 0;margin-bottom:20px}.rr-inspector-content fieldset{min-width:0}.rr-inspector-content legend{font-size:14px;font-weight:600;margin-bottom:12px}.rr-inspector-content fieldset .rr-field{margin-bottom:12px}.rr-field>span{font-size:12px}
    .rr-toast{display:flex;justify-content:space-between;padding:12px 40px;color:white;font-size:13px}.rr-toast button{font-size:20px}.rr-advanced-filters{margin:16px 0}.rr-advanced-filters>summary{font-size:13px;cursor:pointer;color:#65705f}.rr-advanced-filters>summary span{margin-left:10px;font-size:11px;color:#97501a}
    @media(max-width:1023px){.rr-header{padding:0 24px}.rr-main{padding:26px 24px}.rr-attention-layout{grid-template-columns:180px minmax(0,1fr);gap:22px}.rr-row{grid-template-columns:minmax(0,1fr) auto}.rr-row>div:first-child{grid-column:1/-1}.rr-property-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:767px){.rr-header{padding:0 18px}.rr-heading{padding:18px 0 12px;gap:12px;align-items:flex-start}.rr-brand{gap:10px}.rr-brand h1{font-size:18px}.rr-brand p,.rr-refresh>span{display:none}.rr-refresh button{max-width:125px;min-height:38px;padding:6px 8px;font-size:11px}.rr-back{width:30px;height:34px}.rr-navigation-tabs{gap:23px}.rr-navigation-tabs button{font-size:13px;padding:12px 0}.rr-reference-tab{margin-left:0}.rr-main{padding:24px 18px}.rr-section-heading{flex-wrap:wrap;gap:7px}.rr-section-heading>.rr-note{text-align:left}.rr-main h2{font-size:19px}.rr-attention-layout{display:block;margin-top:18px}.rr-queue-nav{flex-direction:row;overflow-x:auto;gap:5px;margin:0 -18px 20px;padding:0 18px 8px;scrollbar-width:thin}.rr-queue-nav button{white-space:nowrap;gap:10px;padding:9px 11px}.rr-queue-nav button>span:last-child{font-size:11px}.rr-controls{gap:8px}.rr-controls input{min-width:150px}.rr-row{display:block;padding:20px 0}.rr-row>div{margin-bottom:12px}.rr-row>button{min-height:38px}.rr-property-toolbar>select{max-width:100%;flex:1;min-width:140px}.rr-property-cards{grid-template-columns:1fr}.rr-drawer{width:100vw}.rr-inspector-header{padding:22px 18px 14px}.rr-inspector-header h2{font-size:21px;overflow-wrap:anywhere}.rr-inspector-tabs{padding:0 18px}.rr-inspector-content{padding:20px 18px}.rr-toast{padding:10px 18px}.rr-summary{grid-template-columns:1fr}.rr-metric{border-right:0}.rr-inspector-header .rr-action{flex-shrink:0}}
    .rr-brand h1,.rr-brand p{text-align:left}.rr-inspector-content>button{margin-bottom:18px}
    body:has(#reviews-ratings-page:not(.hidden)) .theme-toggle-floating{top:auto;bottom:18px;z-index:30}
    body:has(#reviews-ratings-page:not(.hidden) .rr-drawer) .theme-toggle-floating{visibility:hidden}
    html[data-theme=dark] .rr-shell{background:var(--theme-canvas);color:var(--theme-text)}
    html[data-theme=dark] .rr-shell :is(.rr-header,.rr-summary,.rr-property-card,.rr-drawer,.rr-action,.rr-metric,.rr-view-switch button[aria-pressed=true]){background:var(--theme-surface);color:var(--theme-text);border-color:var(--theme-border)}
    html[data-theme=dark] .rr-shell :is(.rr-note,.rr-label,.rr-eyebrow,.rr-brand p,.rr-refresh>span,.rr-status,.rr-navigation-tabs button,.rr-inspector-tabs button,.rr-property-navigation button,.rr-metrics-panel>summary,.rr-advanced-filters>summary){color:var(--theme-text-muted)}
    html[data-theme=dark] .rr-shell :is(.rr-property-name,.rr-field>span,.rr-platform-rating strong){color:var(--theme-text)}
    html[data-theme=dark] .rr-shell :is(.rr-property-table th,.rr-property-table tr:hover td,.rr-reply,.rr-view-switch,.rr-nav-count){background:var(--theme-surface-muted);color:var(--theme-text-muted)}
    html[data-theme=dark] .rr-shell :is(.rr-row,.rr-property-table td,.rr-property-table th,.rr-property-navigation,.rr-property-scores,.rr-disclosure,.rr-review,.rr-inspector-tabs,.rr-metrics-panel[open]){border-color:var(--theme-border)}
    html[data-theme=dark] .rr-shell :is(input,select,textarea){background:var(--theme-surface)!important;color:var(--theme-text)!important;border-color:var(--theme-border)!important}
    html[data-theme=dark] .rr-shell :is(.rr-queue-nav button[aria-pressed=true],.rr-status-alert){background:#382618;color:#f2ba74}
    html[data-theme=dark] .rr-shell .rr-queue-nav button{color:var(--theme-text-muted)}
    html[data-theme=dark] .rr-shell :is(button[aria-current=page],.rr-property-navigation button[aria-pressed=true]){color:#f2ba74;border-color:#d99040}
    @media(prefers-reduced-motion:reduce){.rr-main>section{animation:none}.rr-shell button,.rr-property-card{transition:none}}
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
  return `<section class="rr-workspace" aria-label="${tx(state.dataOnly ? 'collectionView' : 'attention')}">
    <div class="rr-section-heading"><h2>${tx(state.dataOnly ? 'collectionView' : 'attention')}</h2><span class="rr-note" role="status">${tx('queueCount', { count: result.items.length })}</span></div>
    <p class="rr-note mt-2 mb-4">${tx(state.dataOnly ? 'collectionHelp' : 'attentionHelp')}</p>
    <div class="${state.dataOnly ? '' : 'rr-attention-layout'}">
    ${state.dataOnly ? '' : `<nav class="rr-queue-nav" aria-label="${tx('queueType')}">${Object.entries(result.counts).filter(([key]) => key !== 'data').map(([key,count])=>`<button data-attention-queue="${key}" aria-pressed="${queue===key}"><span>${tx(key)}</span><span>${count}</span></button>`).join('')}</nav>`}
    <div class="rr-queue-content">
    <div class="rr-controls"><input id="attention-search" aria-label="${tx('search')}" placeholder="${tx('search')}" value="${h(search)}"><label for="attention-platform" class="sr-only">${tx('platform')}</label><select id="attention-platform">${['all', 'airbnb', 'booking'].map(p => `<option value="${p}" ${platform === p ? 'selected' : ''}>${p === 'all' ? tx('allPlatforms') : platformName(p)}</option>`).join('')}</select></div>
    ${queue === 'declining' ? `<p class="rr-note mb-3">${tx('declineHelp')}</p>` : ''}
    ${queue === 'classifications' ? `<p class="rr-note mb-3">${tx('evidenceHelp')}</p>` : ''}
    ${queue === 'data' ? `<p class="rr-note mb-3">${tx('dataHealthHelp')}</p>` : ''}
    ${result.items.slice((page - 1) * 25, page * 25).map(row => `<article class="rr-row">
      <div><h3>${h(row.propertyName)}</h3><p class="rr-note">${h(row.location)} · ${platformName(row.platform)}</p><span class="rr-note">${tx(row.queue)}${row.category ? ` · ${tx(`${row.category}Category`)}` : ''}</span></div>
      <div><p>${tx(row.reason, row.params)}</p>${row.excerpt ? `<blockquote class="${row.finding ? '' : 'rr-clamp'}">${h(row.excerpt)}</blockquote>` : ''}${row.date || row.author ? `<p class="rr-note mt-1">${h(row.author || '')} · ${h(reviewDate(row.date))}${row.score != null ? ` · ${h(row.score)} / ${row.platform === 'airbnb' ? 5 : 10}` : ''}</p>` : ''}
      ${row.health ? `<p class="rr-note">${tx('lastSuccess')}: ${h(reviewDate(row.health.lastSuccess))}</p>` : ''}
      ${row.finding ? renderFindingActions(row.propertyId, row.finding) : ''}</div>
      <button class="rr-action" ${row.workId ? `data-work-id="${h(row.workId)}" data-work-property="${h(row.propertyId)}" data-work-category="${h(row.category)}"` : `data-attention-property="${h(row.propertyId)}"`} data-action="${row.action}" data-review-id="${h(row.reviewId || '')}" data-attention-review-key="${h(row.reviewKey || '')}">${tx(row.workId ? 'openImprovement' : row.action === 'reviews' ? 'openReviews' : row.action === 'settings' ? 'openSettings' : 'openProperty')}</button>
    </article>`).join('') || `<div class="py-12 text-center"><h3 class="font-semibold">${tx('empty')}</h3><p class="rr-note mt-2">${tx('emptyHelp')}</p></div>`}
    <div class="rr-controls justify-end border-t border-gray-200 pt-4"><button class="rr-action" data-attention-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>${tx('previous')}</button><span class="rr-note">${tx('page', { page, pages })}</span><button class="rr-action" data-attention-page="${page + 1}" ${page === pages ? 'disabled' : ''}>${tx('next')}</button></div>
    </div></div>
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
