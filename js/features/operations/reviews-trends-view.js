import { reviewText as t } from './reviews-ratings-copy.js';
import { buildTrendsReport, trendDelta, trendDateKey, TREND_PLATFORMS, listingScoreHistory, improvementOutcome } from './reviews-trends-utils.js';
import { isPropertyArchived } from './reviews-ratings-utils.js';
import { RATING_THRESHOLDS } from './review-quality-utils.js';
import { renderSharedStatus } from './reviews-workflow-view.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = (key, params) => h(t(key, params));
const number = (value, digits = 1) => value === null || value === undefined ? '—' : value.toLocaleString(globalThis.window?.i18n?.currentLang === 'pt' ? 'pt-PT' : 'en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const date = value => trendDateKey(value);
const range = window => `${date(window.start)} — ${date(window.end - 1)}`;
const signed = value => value === null ? '—' : `${value > 0 ? '+' : ''}${number(value, 2)}`;
const pct = value => value === null ? '—' : `${number(value)}%`;
const options = (items, selected) => items.map(([value, label]) => `<option value="${h(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${h(label)}</option>`).join('');
const select = (key, label, items, selected) => `<label class="rr-field"><span>${tx(label)}</span><select id="trend-${key}" data-trend-filter="${key}">${options(items, selected)}</select></label>`;

function chart(points, max, window, label) {
  if (!points.some(p => p.value !== null)) return `<div class="rr-trend-empty"><p class="rr-note">${tx('trendNoData')}</p></div>`;
  const width = 560, height = 200, left = 36, right = 542, top = 16, bottom = 164;
  const x = point => left + (point.at - window.start) / Math.max(1, window.end - window.start) * (right - left);
  const y = point => bottom - point.value / max * (bottom - top);
  const paths = []; let segment = [];
  for (const point of points) {
    if (point.value === null) { if (segment.length) paths.push(segment); segment = []; }
    else segment.push(point);
  }
  if (segment.length) paths.push(segment);
  return `<svg viewBox="0 0 ${width} ${height}" class="rr-trend-chart" role="img" aria-label="${h(label)}">
    ${[0,max/2,max].map(n=>`<line x1="${left}" y1="${bottom-n/max*(bottom-top)}" x2="${right}" y2="${bottom-n/max*(bottom-top)}" stroke="#e5e7eb"/><text x="26" y="${bottom-n/max*(bottom-top)+4}" text-anchor="end">${n}</text>`).join('')}
    ${paths.filter(path=>path.length>1).map(path=>`<polyline points="${path.map(p=>`${x(p)},${y(p)}`).join(' ')}" fill="none" stroke="#b45309" stroke-width="2"/>`).join('')}
    ${points.filter(p=>p.value!==null).map(p=>`<circle cx="${x(p)}" cy="${y(p)}" r="4" fill="${p.count<5?'white':'#b45309'}" stroke="#b45309" stroke-width="2" tabindex="0" aria-label="${h(p.label)}"><title>${h(p.label)}</title></circle>`).join('')}
    <text x="${left}" y="191">${date(window.start)}</text><text x="${right}" y="191" text-anchor="end">${date(window.end-1)}</text></svg>`;
}

function metricRows(current, previous, max) {
  const metrics = [
    ['trendAverage','average','rated',v=>`${number(v,2)} / ${max}`,s=>t('trendRated',{count:s.rated})],
    ['trendLow','lowShare','rated',pct,s=>t('trendFraction',{count:s.low,total:s.rated})],
    ['trendComplaints','complaintShare','written',pct,s=>t('trendFraction',{count:s.complaints,total:s.written})],
    ['trendReplies','replyCoverage','count',pct,s=>t('trendFraction',{count:s.replied,total:s.count})]
  ];
  return metrics.map(([label,key,denominator,format,sample])=>{
    const delta = trendDelta(current,previous,key,denominator);
    return `<tr><th scope="row">${tx(label)}</th><td><strong>${h(format(current[key]))}</strong><small>${h(sample(current))}</small></td><td>${h(format(previous[key]))}<small>${h(sample(previous))}</small></td><td>${delta===null?'—':tx(key==='average'?'trendScoreChange':'trendPP',{value:signed(delta)})}</td></tr>`;
  }).join('');
}

function renderPlatform({ platform, current, previous, series }, windows, sharedReady) {
  const max = platform === 'Airbnb' ? 5 : 10;
  const points = series.map(s=>({ at:(s.start+s.end)/2,value:s.value,count:s.count,label:`${range(s)}: ${number(s.value,2)} / ${max}, ${t('trendRated',{count:s.count})}` }));
  return `<section class="rr-trend-platform"><div class="flex justify-between items-baseline gap-3"><h3 class="text-lg font-semibold">${h(platform)} <span class="rr-note">/ ${max}</span></h3><span class="rr-note">${tx('trendTotal',{count:current.count,properties:current.properties})}</span></div>
    ${chart(points,max,windows.current,`${platform} — ${t('trendImported')}`)}<p class="rr-note rr-table-hint">${tx('trendSwipe')}</p>
    <div class="rr-trend-table-wrap" tabindex="0" role="region" aria-label="${h(platform)} ${tx('trendMetric')}"><table class="rr-trend-table"><thead><tr><th>${tx('trendMetric')}</th><th>${tx('trendCurrent')}</th><th>${tx('trendPrevious')}</th><th>${tx('trendChange')}</th></tr></thead><tbody>${metricRows(current,previous,max)}</tbody></table></div>
    ${['rated','written','count'].some(key=>current[key]<5||previous[key]<5)?`<p class="rr-note mt-3">${tx('trendSmall')}</p>`:''}<p class="rr-note mt-3">${tx('trendLowHelp',{target:platform==='Airbnb'?RATING_THRESHOLDS.AIRBNB_ALERT:RATING_THRESHOLDS.BOOKING_ALERT,max})}</p><p class="rr-note">${tx('trendCurrent')}: ${tx('trendPending',{count:current.pending})}</p><p class="rr-note">${tx('trendPrevious')}: ${tx('trendPending',{count:previous.pending})}</p>
    <details class="mt-3"><summary class="rr-note cursor-pointer">${tx('trendTable')}</summary><table class="rr-trend-table"><thead><tr><th>${tx('trendInterval')}</th><th>${tx('trendAverage')}</th><th>${tx('trendSample')}</th></tr></thead><tbody>${series.map(s=>`<tr><td>${range(s)}</td><td>${number(s.value,2)} / ${max}</td><td>${s.count}</td></tr>`).join('')}</tbody></table></details>
    ${sharedReady?`<h4 class="font-semibold mt-6 mb-2">${tx('trendBacklog')} · ${current.backlog}</h4><p class="rr-note">${tx('trendUnanswered',{confirmed:current.confirmedUnanswered,unknown:current.uncaptured})}</p>
    <dl class="rr-trend-ages">${['trendAge7','trendAge30','trendAge90','trendAgeOlder'].map((label,i)=>`<div><dt>${tx(label)}</dt><dd>${current.ages[i]}</dd></div>`).join('')}</dl>`:`<p class="rr-note mt-6 mb-3">${tx('trendBacklogUnavailable')}</p>`}
    <p class="rr-note"><strong>${tx('trendTiming')}:</strong> ${current.responseHours===null?tx('trendTimingMissing'):tx('trendHours',{hours:number(current.responseHours)})}</p><p class="rr-note">${tx('trendTimingSample',{count:current.responseSample})}</p></section>`;
}

function renderHistory(property, platforms, windows) {
  return `<section class="rr-trend-section"><h3 class="text-lg font-semibold">${tx('trendHistory')}</h3><p class="rr-note my-2">${tx('trendHistoryHelp')}</p>${!property?`<p class="rr-note py-4">${tx('trendChooseHistory')}</p>`:`<div class="rr-trend-columns">${platforms.map(platform=>{
    const history=listingScoreHistory(property,platform,windows.current,windows.now), max=platform==='Airbnb'?5:10;
    return `<div><h4 class="font-semibold mt-3">${h(platform)}</h4>${history.length?`${chart(history.map(s=>({at:s.at,value:s.score,count:5,label:`${date(s.at)}: ${s.score} / ${max}`})),max,windows.current,`${platform} — ${t('trendHeadline')}`)}${history.length===1?`<p class="rr-note">${tx('trendHistorySingle')}</p>`:''}<details><summary class="rr-note cursor-pointer">${tx('trendTable')}</summary><table class="rr-trend-table"><thead><tr><th>${tx('trendCollected')}</th><th>${tx('trendHeadline')}</th><th>${tx('trendPlatformCount')}</th></tr></thead><tbody>${history.map(s=>`<tr><td>${h(new Date(s.at).toISOString())}</td><td>${number(s.score,2)} / ${max}</td><td>${s.reviewCount??'—'}</td></tr>`).join('')}</tbody></table></details>`:`<p class="rr-note py-5">${tx('trendHistoryEmpty')}</p>`}</div>`;
  }).join('')}</div>`}</section>`;
}

function renderOutcomes(report,state) {
  const outcomes=(state.workItems||[]).flatMap(work=>{
    const property=report.properties.find(p=>p.id===work.propertyId);
    return property?report.platforms.map(p=>improvementOutcome(work,property,p.platform,report.windows.days,report.windows.now)).filter(Boolean):[];
  }).sort((a,b)=>b.completed-a.completed);
  const pages=Math.max(1,Math.ceil(outcomes.length/10)),page=Math.min(state.trends?.outcomePage||1,pages);
  return `<section class="rr-trend-section"><h3 class="text-lg font-semibold">${tx('trendOutcomes')}</h3><p class="rr-note my-2">${tx('trendOutcomeHelp')}</p>${renderSharedStatus(state)}<p class="rr-note">${tx('trendOutcomeCount',{count:outcomes.length})}</p>
    ${outcomes.slice((page-1)*10,page*10).map(o=>`<article class="rr-trend-outcome"><div class="flex flex-wrap justify-between gap-3"><div><h4 class="font-semibold">${h(o.work.title)}</h4><p class="rr-note">${h(o.work.propertyName)} · ${h(o.platform)} · ${tx(`${o.work.category}Category`)}</p></div><button class="rr-action" data-work-id="${h(o.work.id)}" data-work-property="${h(o.work.propertyId)}" data-work-category="${h(o.work.category)}" data-trend-platform="${h(o.platform)}">${tx('trendWorkOpen')}</button></div>
      ${!o.days?`<p class="rr-note mt-3">${tx('trendOutcomeWaiting')}</p>`:`<p class="rr-note my-3">${tx('trendOutcomeWindow',{days:o.days,date:date(o.completed)})}</p><div class="rr-trend-table-wrap" tabindex="0" role="region" aria-label="${tx('trendOutcomes')}"><table class="rr-trend-table"><thead><tr><th>${tx('trendCategoryRate')}</th><th>${tx('trendBefore')}</th><th>${tx('trendAfter')}</th><th>${tx('trendChange')}</th></tr></thead><tbody><tr><th scope="row">${tx(`${o.work.category}Category`)}</th><td>${pct(o.before.share)}<small>${tx('trendFraction',{count:o.before.confirmed,total:o.before.written})} · ${tx('trendWritten',{count:o.before.written})}</small><small>${range(o.beforeWindow)}</small></td><td>${pct(o.after.share)}<small>${tx('trendFraction',{count:o.after.confirmed,total:o.after.written})} · ${tx('trendWritten',{count:o.after.written})}</small><small>${range(o.afterWindow)}</small></td><td>${o.delta===null?'—':tx('trendPP',{value:signed(o.delta)})}</td></tr></tbody></table></div><p class="rr-note mt-2">${tx('trendOutcomePending',{before:o.before.pending,after:o.after.pending})}</p><p class="rr-note">${tx(o.comparable?'trendOutcomePartial':'trendSmall')}</p>`}</article>`).join('')||`<p class="rr-note py-5">${tx('trendOutcomeEmpty')}</p>`}
    ${pages>1?`<div class="rr-controls justify-end mt-4"><button class="rr-action" data-trend-page="${page-1}" ${page<=1?'disabled':''}>${tx('previous')}</button><span class="rr-note">${tx('page',{page,pages})}</span><button class="rr-action" data-trend-page="${page+1}" ${page>=pages?'disabled':''}>${tx('next')}</button></div>`:''}</section>`;
}

export function renderTrends(properties,state) {
  const filters=state.trends||{days:90,property:'all',platform:'all',location:'all'},report=buildTrendsReport(properties,filters,state.followUps);
  const active=properties.filter(p=>!isPropertyArchived(p));
  return `<style>.rr-table-hint{display:none}.rr-trend-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:20px 0}.rr-trend-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:32px}.rr-trend-columns>*{min-width:0}.rr-trend-empty{aspect-ratio:560/200;display:flex;align-items:center;margin:12px 0}.rr-trend-chart{width:100%;height:auto;margin:12px 0;overflow:visible}.rr-trend-chart text{font:12px system-ui;fill:#64748b}.rr-trend-chart circle:focus{outline:2px solid #78350f;outline-offset:3px}.rr-trend-table-wrap{overflow-x:auto}.rr-trend-table{width:100%;font-size:13px;text-align:left;border-collapse:collapse}.rr-trend-table th{font-weight:600}.rr-trend-table :is(th,td){padding:12px 10px 12px 0;border-bottom:1px solid #e5e7eb;vertical-align:top}.rr-trend-table small{display:block;font-size:12px;color:#64748b;margin-top:4px}.rr-trend-section{padding-top:24px;margin-top:28px;border-top:1px solid #d1d5db}.rr-trend-ages{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.rr-trend-ages dt{font-size:12px;color:#64748b}.rr-trend-ages dd{font-size:22px;font-weight:600}.rr-trend-outcome{padding:22px 0;border-bottom:1px solid #e5e7eb}@media(max-width:1000px){.rr-trend-columns{grid-template-columns:1fr}}@media(max-width:600px){.rr-table-hint{display:block;margin-bottom:8px}.rr-trend-filters{grid-template-columns:1fr 1fr}.rr-trend-table-wrap .rr-trend-table{min-width:540px}.rr-trend-chart text{font-size:14px}}</style>
    <section class="rr-workspace"><h2 class="text-2xl font-semibold">${tx('trendTitle')}</h2><p class="rr-note mt-2">${tx('trendHelp')}</p>
    <div class="rr-trend-filters">${select('days','trendPeriod',[30,90,365].map(d=>[d,t('trendDays',{days:d})]),filters.days)}${select('platform','platform',[['all',t('allPlatforms')],...TREND_PLATFORMS.map(p=>[p,p])],filters.platform)}${select('location','trendLocation',[['all',t('trendAllLocations')],...[...new Set(active.map(p=>p.location).filter(Boolean))].sort().map(l=>[l,l])],filters.location)}${select('property','properties',[['all',t('allProperties')],...active.filter(p=>filters.location==='all'||!filters.location||p.location===filters.location).map(p=>[p.id,p.name])],filters.property)}</div>
    <p class="rr-note"><strong>${tx('trendCurrent')}:</strong> ${range(report.windows.current)} · <strong>${tx('trendPrevious')}:</strong> ${range(report.windows.previous)}</p><p class="rr-note">${tx('trendToday')}</p>
    ${!report.properties.length?`<p class="rr-note py-8">${tx('trendNoProperties')}</p>`:`<h3 class="text-lg font-semibold mt-6">${tx('trendImported')}</h3><p class="rr-note mt-2">${tx('trendCoverage')}</p><p class="rr-note">${tx('trendChartHelp')}</p><div class="rr-trend-columns mt-4">${report.platforms.map(p=>renderPlatform(p,report.windows,state.workflowConnected&&!state.workflowLoading&&!state.workflowError)).join('')}</div>
    <details class="mt-5"><summary class="rr-note cursor-pointer">${tx('trendMethods')}</summary><p class="rr-note mt-2">${tx('trendSmall')}</p><p class="rr-note">${tx('trendComplaintHelp')}</p><p class="rr-note">${tx('trendReplyHelp')}</p><p class="rr-note">${tx('trendBacklogHelp')}</p></details><p class="rr-note mt-3">${tx('trendExclusions',{unknown:report.unknownDates,future:report.futureDates,manual:report.manual})}</p>
    ${renderHistory(filters.property!=='all'?report.properties.find(p=>p.id===filters.property):null,report.platforms.map(p=>p.platform),report.windows)}${renderOutcomes(report,state)}`}</section>`;
}

export function bindTrendsEvents(container,handlers) {
  container.querySelectorAll('[data-trend-filter]').forEach(el=>el.addEventListener('change',()=>handlers.onTrendsFilter?.(el.dataset.trendFilter,el.value)));
  container.querySelectorAll('[data-trend-page]').forEach(el=>el.addEventListener('click',()=>handlers.onTrendsFilter?.('outcomePage',Number(el.dataset.trendPage))));
}
