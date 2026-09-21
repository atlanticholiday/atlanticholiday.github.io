import { reviewText as t } from './reviews-ratings-copy.js';
import { getAllPropertyReviews, filterPropertyReviews, getReviewResponse, isPropertyArchived, isAttentionNeeded, getLatestReviewSnippet } from './reviews-ratings-utils.js';
import { reviewReplyState, reviewKey, safePlatformUrl } from './reviews-workflow-utils.js';
import { renderPropertyDataHealth, renderPropertyEvidence, reviewDate } from './reviews-attention-view.js';
import { renderWorkEditor, renderFollowUpEditor } from './reviews-workflow-view.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = (key, values) => h(t(key, values));
const score = (value, max) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(max === 5 ? 2 : 1)} <small>/ ${max}</small>` : '—';
const option = (value, label, selected) => `<option value="${h(value)}" ${value === selected ? 'selected' : ''}>${h(label)}</option>`;
const action = (key, attributes = '') => `<button type="button" ${attributes.includes('class=') ? '' : 'class="rr-action"'} ${attributes}>${tx(key)}</button>`;

export function renderPropertyList(properties, state) {
  const active = state.rawProperties.filter(p => !isPropertyArchived(p)).length;
  const archived = state.rawProperties.length - active;
  const filters = [['all', `${t('allPropertiesShort')} (${active})`], ['attention', t('ratingAlert')], ['guest-favourite', t('guestFavourite')],
    ...(archived ? [['archived', `${t('archived')} (${archived})`]] : []),
    ...(['airbnb', 'booking', 'cleanliness'].includes(state.filter) ? [[state.filter, state.filter === 'cleanliness' ? t('cleanlinessScore') : state.filter === 'airbnb' ? 'Airbnb' : 'Booking.com']] : [])];
  return `<div class="rr-controls rr-property-toolbar">
    <input id="reviews-search-input" type="search" aria-label="${tx('propertySearch')}" placeholder="${tx('propertySearch')}" value="${h(state.searchQuery)}">
    <select id="reviews-property-filter" aria-label="${tx('properties')}">${filters.map(([v,l]) => option(v,l,state.filter)).join('')}</select>
    <select id="reviews-sort-select" aria-label="${tx('sortProperties')}">${[['name-asc','nameAsc'],['name-desc','nameDesc'],['airbnb-desc','highestAirbnb'],['booking-desc','highestBooking'],['cleanliness-desc','highestCleanliness'],['reviews-desc','mostReviews']].map(([v,k]) => option(v,t(k),state.sort)).join('')}</select>
    <div class="rr-view-switch" aria-label="${tx('properties')}">${[['list','listView'],['cards','cardsView']].map(([v,k]) => `<button class="reviews-view-mode-btn" data-mode="${v}" aria-pressed="${state.viewMode === v}">${tx(k)}</button>`).join('')}</div>
  </div>${!properties.length ? `<p class="rr-empty">${tx('noProperties')}</p>` : state.viewMode === 'cards'
    ? `<div class="rr-property-cards">${properties.map(p => `<article class="rr-property-card">
        <div class="rr-card-header">
          <div class="min-w-0">
            <h3>${propertyButton(p)}</h3>
            <p class="rr-note">${h(p.location)}</p>
          </div>
          <button type="button" class="reviews-card-edit-links-btn rr-card-quick-links-btn" data-id="${h(p.id)}" title="${tx('editLinks')}" aria-label="${tx('editLinks')} - ${h(p.name)}">
            <svg class="w-3.5 h-3.5 inline mr-1" viewBox="0 0 20 20" fill="currentColor"><path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z"/><path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z"/></svg>
            <span>${tx('editLinks')}</span>
          </button>
        </div>
        <div class="rr-property-scores">${platformRating(p,'airbnb')}${platformRating(p,'booking')}</div>
        <div class="rr-card-footer">
          <p class="rr-note">${tx('importedCount',{count:getAllPropertyReviews(p).filter(r=>r.origin!=='manual').length})}</p>
          ${status(p)}
        </div>
      </article>`).join('')}</div>`
    : `<div class="rr-table-scroll" tabindex="0" role="region" aria-label="${tx('properties')}"><table class="rr-property-table"><thead><tr>${['property','status','Airbnb','Booking.com','latestFeedback','reviews','actions'].map(k=>`<th scope="col">${k.includes('.') || ['Airbnb','actions'].includes(k) ? (k === 'actions' ? '' : k) : tx(k)}</th>`).join('')}</tr></thead><tbody>${properties.map(p => {
      const latest = getLatestReviewSnippet(p);
      return `<tr><td>${propertyButton(p)}<span class="rr-note block">${h(p.location)}</span></td><td>${status(p)}</td>${['airbnb','booking'].map(platform=>`<td>${platformRating(p,platform,false)}</td>`).join('')}<td class="rr-feedback-cell">${latest ? `<p class="rr-clamp">${h(latest.comment || latest.positive || latest.negative || latest.title || t('noWrittenReview'))}</p><span class="rr-note">${h(latest.author || t('guest'))}</span>` : '—'}</td><td>${tx('reviewCount',{count:getAllPropertyReviews(p).length})}</td><td><button type="button" class="reviews-card-edit-links-btn rr-action rr-table-edit-btn" data-id="${h(p.id)}" title="${tx('editLinks')}">${tx('editLinks')}</button></td></tr>`;
    }).join('')}</tbody></table></div>`}`;
}

function propertyButton(p) {
  return `<button class="reviews-details-btn rr-property-name" data-id="${h(p.id)}">${h(p.name)}</button>`;
}

function status(p) {
  const key = isPropertyArchived(p) ? 'archived' : isAttentionNeeded(p) ? 'ratingAlert' : p.airbnb?.score || p.booking?.score ? 'withinThresholds' : p.airbnbUrl || p.bookingUrl ? 'awaitingData' : 'unrated';
  const alertClass = key === 'ratingAlert' ? 'rr-status-alert' : key === 'withinThresholds' ? 'rr-status-within' : key === 'guestFavourite' ? 'rr-status-favourite' : '';
  return `<span class="rr-status ${alertClass}">${tx(key)}</span>`;
}

function platformRating(p, platform, label = true) {
  const data = p[platform], max = platform === 'airbnb' ? 5 : 10;
  const isHigh = data?.score != null && ((platform === 'airbnb' && data.score >= 4.8) || (platform === 'booking' && data.score >= 9.0));
  const isAlert = data?.score != null && ((platform === 'airbnb' && data.score < 4.7) || (platform === 'booking' && data.score < 8.5));
  const scoreClass = isHigh ? 'rr-score-high' : isAlert ? 'rr-score-alert' : '';
  return `<div class="rr-platform-rating rr-platform-${platform}">${label ? `<div class="rr-platform-badge rr-badge-${platform}"><span class="rr-platform-dot"></span><span>${platform === 'airbnb' ? 'Airbnb' : 'Booking.com'}</span></div>` : ''}<strong class="${scoreClass}">${score(data?.score,max)}</strong><span class="rr-note block">${tx('cleanlinessScore')}: ${score(data?.subScores?.cleanliness,max)}</span>${label ? `<span class="rr-note">${tx('platformCount')}: ${h(data?.reviewCount ?? '—')}</span>` : ''}</div>`;
}

export function renderPropertyInspector(property, state) {
  const current = state.activeModalTab || 'overview';
  const tab = ['settings','insights'].includes(current) ? 'overview' : current === 'followUp' ? 'reviews' : current;
  const reviews = getAllPropertyReviews(property);
  const content = current === 'followUp' ? `${action('allReviews','class="modal-tab-btn rr-action" data-tab="reviews"')}${renderFollowUpEditor(property,state)}`
    : tab === 'work' ? renderWorkEditor(property,state) : tab === 'reviews' ? renderPropertyReviews(property,state) : `<div class="rr-property-scores">${platformRating(property,'airbnb')}${platformRating(property,'booking')}</div>
      <p class="rr-note mt-3">${tx('ratingHelp')}</p>
      ${property.airbnb?.badge === 'Guest favourite' ? `<p class="rr-note mt-3">Airbnb · ${tx('guestFavourite')}</p>` : ''}
      <details data-rr-disclosure="property-settings" class="rr-disclosure ${state.isEditingLinks || current === 'settings' ? 'rr-highlight-section' : ''}" ${current === 'settings' || state.isEditingLinks ? 'open' : ''}><summary>${tx('listings')}</summary>${renderPropertySettings(property,state)}</details>
      <details data-rr-disclosure="property-scores" class="rr-disclosure"><summary>${tx('subScores')}</summary><div class="rr-property-scores">${['airbnb','booking'].map(platform=>`<div><h3>${platform==='airbnb'?'Airbnb':'Booking.com'}</h3><dl>${Object.entries(property[platform]?.subScores || {}).map(([key,value])=>`<div class="rr-section-heading my-3"><dt class="rr-note">${tx(({cleanliness:'cleanlinessScore',checkin:'checkIn',check_in:'checkIn',value_for_money:'value',free_wifi:'wifi'})[key] || key)}</dt><dd>${score(value,platform==='airbnb'?5:10)}</dd></div>`).join('') || '<p class="rr-note">—</p>'}</dl></div>`).join('')}</div></details>
      ${renderPropertyEvidence(property)}
      <details data-rr-disclosure="property-health" class="rr-disclosure"><summary>${tx('dataHealth')}</summary>${renderPropertyDataHealth(property)}</details>`;
  return `<div class="rr-drawer-backdrop"><section role="dialog" aria-modal="true" aria-label="${h(property.name)}" class="rr-drawer">
    <div class="rr-inspector-header"><div><p class="rr-eyebrow">${tx('property')}</p><h2>${h(property.name)}</h2><p class="rr-note">${h(property.location)} · ${tx('reviewCount',{count:reviews.length})}</p></div>${action('close','id="modal-close-btn"')}</div>
    <nav class="rr-inspector-tabs" aria-label="${tx('property')}">${[['overview','overview'],['reviews','reviews'],['work','improvements']].map(([v,k])=>`<button class="modal-tab-btn" data-tab="${v}" aria-current="${v===tab?'page':'false'}">${tx(k)}</button>`).join('')}</nav>
    <div class="overflow-y-auto rr-inspector-content">${content}</div>
  </section></div>`;
}

function renderPropertySettings(p,state) {
  return `<p class="rr-note my-3">${tx('listingsHelp')}</p>${action(state.isEditingLinks?'cancel':'editDetails','id="modal-toggle-edit-links-btn"')}
    ${state.isEditingLinks ? `<form id="property-listing-form" class="rr-form-grid mt-4">${['booking','airbnb'].map(platform=>{
      const max=platform==='airbnb'?5:10, data=p[platform];
      return `<fieldset><legend>${platform==='airbnb'?'Airbnb':'Booking.com'}</legend>${field(`edit-${platform}-url-input`,'listingUrl','url',p[`${platform}Url`]||'')}${field(`edit-${platform}-score-input`,'overallScore','number',data?.score??'',`min="0.1" max="${max}" step="0.01"`)}${field(`edit-${platform}-clean-input`,'cleanlinessScore','number',data?.subScores?.cleanliness??'',`min="0.1" max="${max}" step="0.01"`)}${field(`edit-${platform}-count-input`,'platformCount','number',data?.reviewCount??'','min="0" step="1"')}</fieldset>`;
    }).join('')}<div class="rr-span">${action('saveDetails','id="modal-save-links-btn" class="rr-action rr-primary"')}</div></form>` : `<div class="rr-actions my-4">${['Airbnb','Booking.com'].map(platform=>{
      const url=safePlatformUrl(p,{platform});
      return url?`<a class="rr-action" href="${h(url)}" target="_blank" rel="noopener noreferrer">${platform} ↗</a>`:`<span class="rr-note">${platform}: ${tx('unlinked')}</span>`;
    }).join('')}</div>`}
    <div class="rr-health">${action(isPropertyArchived(p)?'restoreProperty':'archiveProperty','id="modal-toggle-archive-btn"')}</div>`;
}

function field(id,key,type='text',value='',extra='') {
  return `<label class="rr-field"><span>${tx(key)}</span>${type==='textarea'?`<textarea id="${id}" ${extra}>${h(value)}</textarea>`:`<input id="${id}" type="${type}" value="${h(value)}" ${extra}>`}</label>`;
}

function renderManualReviewForm() {
  return `<form id="add-review-form" class="rr-form-grid rr-manual-form"><p class="rr-note rr-span">${tx('manualHelp')}</p>
    ${field('review-author-input','guest','text','','required')}${field('review-country-input','country')}
    <label class="rr-field"><span>${tx('platform')}</span><select id="review-platform-input"><option value="Booking.com">Booking.com /10</option><option value="Airbnb">Airbnb /5</option><option value="Direct">${tx('directGuest')} /10</option></select></label>
    ${field('review-date-input','date','date',new Date().toISOString().slice(0,10))}
    ${field('review-score-input','overallScore','number','','min="0.1" max="10" step="0.01" required')}${field('review-clean-input','cleanlinessScore','number','','min="0.1" max="10" step="0.01"')}
    ${field('review-title-input','reviewTitle')}${field('review-comment-input','comment','textarea')}${field('review-positive-input','positiveComment','textarea')}${field('review-negative-input','negativeComment','textarea')}${field('review-response-input','capturedResponse','textarea')}
    <div class="rr-span"><button class="rr-action rr-primary" type="submit">${tx('saveReview')}</button></div></form>`;
}

function renderPropertyReviews(p,state) {
  const filter=state.reviewModalFilter||'all';
  const reviews=filterPropertyReviews(getAllPropertyReviews(p),{platform:filter==='booking'?'Booking.com':filter==='airbnb'?'Airbnb':'all',filter:['positive','attention','answered','unanswered'].includes(filter)?filter:'all',search:state.reviewModalSearch||''});
  return `<p class="rr-note mb-4">${tx('reviewHelp')}</p><div class="rr-controls"><input type="search" id="modal-review-search" aria-label="${tx('reviewSearch')}" placeholder="${tx('reviewSearch')}" value="${h(state.reviewModalSearch)}"><select id="modal-review-filter" aria-label="${tx('allReviews')}">${[['all',t('allReviews')],['booking','Booking.com'],['airbnb','Airbnb'],['positive',t('positiveRatings')],['attention',t('lowRatings')],['answered',t('capturedReplies')],['unanswered',t('uncapturedReplies')]].map(([v,l])=>option(v,l,filter)).join('')}</select></div>
    <div class="rr-section-heading my-4"><span class="rr-note">${tx('results',{count:reviews.length})}</span>${action(state.isAddingReview?'cancel':'addReview','id="modal-toggle-add-review-btn"')}</div>
    ${state.isAddingReview?renderManualReviewForm():''}
    ${reviews.map(r=>renderReview(r,p)).join('')||`<p class="rr-empty">${tx('inboxEmpty')}</p>`}`;
}

function renderReview(r,p) {
  const response=getReviewResponse(r), reply=reviewReplyState(r);
  return `<article class="rr-review"><div class="rr-section-heading"><h3>${h(r.author||t('guest'))}</h3><strong>${score(r.score,r.platform==='Airbnb'?5:10)}</strong></div><p class="rr-note">${h(r.platform)} · ${h(reviewDate(r.date))}${r.country?` · ${h(r.country)}`:''}</p>
    <p class="rr-excerpt my-3">${h([r.title,r.comment,r.positive,r.negative].filter(Boolean).join('\n\n')||t('noWrittenReview'))}</p>
    <p class="rr-note">${tx(reply==='unknown'?'unknownReply':reply)}</p>${response?`<blockquote class="rr-reply">${h(response)}</blockquote>`:''}
    <div class="rr-actions mt-3">${action('followUp',`data-inbox-property="${h(p.id)}" data-inbox-key="${h(reviewKey(r))}"`)}${r.id?action('deleteReview',`class="review-delete-btn rr-action" data-review-id="${h(r.id)}" data-property-id="${h(p.id)}"`):''}</div></article>`;
}
