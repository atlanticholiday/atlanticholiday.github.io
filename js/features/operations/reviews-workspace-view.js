import { renderSharedStatus, renderWorkflowStyles, renderWorkBoard, renderReviewInbox } from './reviews-workflow-view.js';
import { renderTrends } from './reviews-trends-view.js';
import { renderReviewWorkspaceStyles, renderReviewMetrics, renderAttentionWorkspace } from './reviews-attention-view.js';
import { renderPropertyList, renderPropertyInspector } from './reviews-property-view.js';
import { buildAttentionQueue } from './reviews-attention-utils.js';
import { isPropertyArchived } from './reviews-ratings-utils.js';
import { reviewText as t } from './reviews-ratings-copy.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = (key, values) => h(t(key, values));

export function renderWorkspace(state) {
  const { rawProperties = [], activeTab = 'attention', syncToastMessage, isSyncing } = state;
  const activeIds = new Set(rawProperties.filter(p => !isPropertyArchived(p)).map(p => p.id));
  const workAvailable = state.workflowConnected && !state.workflowLoading && !state.workflowError;
  const improvementsCount = workAvailable ? (state.workItems || []).filter(w => activeIds.has(w.propertyId) && !['resolved','dismissed'].includes(w.status)).length : null;
  const lastUpdated = state.lastUpdated ? new Date(state.lastUpdated).toLocaleString(globalThis.window?.i18n?.currentLang === 'pt' ? 'pt-PT' : 'en-GB') : t('unknownDate');
  return `${renderReviewWorkspaceStyles()}${renderWorkflowStyles()}
    <div class="reviews-page-wrapper rr-shell">
      ${syncToastMessage ? `<div id="reviews-sync-toast" role="status" class="rr-toast ${state.syncToastKind === 'error' ? 'bg-red-800' : 'bg-slate-800'}"><span>${h(syncToastMessage)}</span><button id="toast-close-btn" aria-label="${tx('close')}">×</button></div>` : ''}
      <header class="rr-header">
        <div class="rr-heading"><div class="rr-brand"><button id="reviews-back-btn" class="rr-back" aria-label="${tx('back')}">←</button><div><h1>${tx('title')}</h1><p>${tx('subtitle')}</p></div></div>
          <div class="rr-refresh"><span>${tx('dataset')}: ${h(lastUpdated)}</span><button id="reviews-sync-btn" class="rr-action" title="${tx('refreshHelp')}" ${isSyncing?'disabled':''}>${tx(isSyncing?'refreshing':'refresh')}</button></div>
        </div>
        <nav class="rr-navigation-tabs" aria-label="${tx('title')}">${[['attention','attention'],['latest-reviews','reviews'],['improvements','improvements'],['properties','properties'],['trends','trends']].map(([tab,key])=>`<button class="reviews-tab-btn ${tab==='properties'?'rr-reference-tab':''}" data-tab="${tab}">${tx(key)}${tab==='improvements' && improvementsCount > 0 ? `<span class="rr-nav-count" aria-label="${tx('openImprovements',{count:improvementsCount})}">${improvementsCount}</span>`:''}</button>`).join('')}</nav>
      </header>
      <main class="rr-main">
        ${state.isLoading?`<p role="status" class="rr-note">${tx('loading')}</p>`:''}
        ${activeTab==='attention' ? renderSharedStatus(state)+renderAttentionWorkspace(rawProperties,{...state,attentionQueue:state.attentionQueue==='data'?'all':state.attentionQueue})
          : activeTab==='latest-reviews'?renderReviewInbox(rawProperties,state)
          : activeTab==='improvements'?renderWorkBoard(rawProperties,state)
          : activeTab==='trends'?renderTrends(rawProperties,state)
          : renderProperties(state)}
      </main>
      ${state.selectedProperty?renderPropertyInspector(state.selectedProperty,state):''}
    </div>`;
}

function renderProperties(state) {
  const raw = state.rawProperties || [];
  return `<div class="rr-section-heading"><div><h2>${tx('properties')}</h2><p class="rr-note">${tx('propertyHelp')}</p></div></div>
    <div class="rr-property-navigation"><button data-property-view="list" aria-pressed="${!state.propertyDataView}">${tx('propertyList')}</button><button data-property-view="data" aria-pressed="${Boolean(state.propertyDataView)}">${tx('collectionView')} <span>${buildAttentionQueue(raw,{queue:'data'}).counts.data}</span></button></div>
    ${state.propertyDataView?`<p class="rr-note mb-4">${tx('refreshHelp')}</p>${renderAttentionWorkspace(raw,{...state,attentionQueue:'data',dataOnly:true,attentionSearch:state.dataSearch||'',attentionPlatform:state.dataPlatform||'all',attentionPage:state.dataPage||1})}`
      : `${renderReviewMetrics(state.summary || {},state.averageMode,state.metricsExpanded??false)}${renderPropertyList(state.properties||[],{...state,rawProperties:raw})}`}`;
}
