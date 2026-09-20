import { reviewText as t } from './reviews-ratings-copy.js';
import { reviewDate } from './reviews-attention-view.js';
import { queryReviewInbox, workSignals, workMetadata, WORK_CATEGORIES, IMPROVEMENT_STATUSES, WORK_PRIORITIES, reviewReplyState, safePlatformUrl } from './reviews-workflow-utils.js';
import { getReviewResponse, isPropertyArchived } from './reviews-ratings-utils.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tx = (key, params) => h(t(key, params));
const options = (items, selected) => items.map(([value, label]) => `<option value="${h(value)}" ${value === selected ? 'selected' : ''}>${h(label)}</option>`).join('');
const employees = (state, draft) => {
  const rows = [['', t('unassigned')], ...(state.employees || []).map(e => [e.id, e.name])];
  if (draft?.assigneeId && !rows.some(([id]) => id === draft.assigneeId)) rows.push([draft.assigneeId, draft.assigneeName || draft.assigneeId]);
  return rows;
};
const button = (label, attrs = '', disabled = false) => `<button type="button" class="rr-action" ${attrs} ${disabled ? 'disabled' : ''}>${tx(label)}</button>`;
const statusLabel = key => t(key === 'unknown' ? 'unknownReply' : key);
const pageControls = (kind, page, pages) => `<div class="rr-controls justify-end pt-4">${button('previous', `data-${kind}-page="${page - 1}"`, page <= 1)}<span class="rr-note">${tx('page', { page, pages })}</span>${button('next', `data-${kind}-page="${page + 1}"`, page >= pages)}</div>`;

export function renderWorkflowStyles() {
  return `<style>
    .rr-field{display:flex;flex-direction:column;gap:6px;font-size:13px;min-width:0}.rr-field>span{font-weight:600;color:#374151}
    .rr-field :is(input,select,textarea){border:1px solid #d1d5db;border-radius:7px;padding:9px 10px;background:white;font-size:14px;max-width:100%;width:100%}
    .rr-field :is(input,select,textarea):disabled{background:#f3f4f6;color:#6b7280}.rr-field textarea{min-height:88px;resize:vertical}
    .rr-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.rr-span{grid-column:1/-1}
    .rr-inbox-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0}
    .rr-inbox-row{padding:22px 0;border-top:1px solid #e5e7eb;display:grid;grid-template-columns:minmax(160px,1fr) minmax(0,3fr) auto;gap:24px}
    .rr-excerpt{white-space:pre-line;overflow-wrap:anywhere;font-size:14px;line-height:1.65}.rr-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .rr-history{padding:12px 0;border-top:1px solid #e5e7eb;font-size:13px;line-height:1.6}.rr-history p{white-space:pre-wrap;overflow-wrap:anywhere}
    .rr-drawer-backdrop{position:fixed;inset:0;z-index:50;background:#0f172a40;display:flex;justify-content:flex-end}
    .rr-drawer{background:white;width:min(740px,65vw);height:100dvh;display:flex;flex-direction:column;box-shadow:-8px 0 35px #0f172a20;position:relative;animation:rr-slide .18s ease-out}
    .rr-drawer .overflow-y-auto{overscroll-behavior:contain;min-height:0}.rr-work-item{padding:18px 0;border-top:1px solid #e5e7eb}
    @keyframes rr-slide{from{transform:translateX(25px);opacity:.7}to{transform:none;opacity:1}}
    @media(max-width:767px){.rr-inbox-filters{grid-template-columns:1fr 1fr}.rr-inbox-row{grid-template-columns:1fr;gap:10px}.rr-drawer{width:100vw}.rr-form-grid{grid-template-columns:1fr}.rr-drawer .px-6{padding-left:18px;padding-right:18px}}
    @media(prefers-reduced-motion:reduce){.rr-drawer{animation:none}}
  </style>`;
}

export function renderSharedStatus(state) {
  return state.workflowError ? `<p role="alert" class="rr-note text-red-800">${h(state.workflowError)} ${button('retryShared', 'data-workflow-retry')}</p>`
    : state.workflowLoading ? `<p role="status" class="rr-note">${tx('sharedLoading')}</p>`
    : !state.workflowConnected ? `<p class="rr-note">${tx('sharedDisconnected')}</p>` : !state.canManageWork ? `<p class="rr-note">${tx('readOnly')}</p>` : '';
}

export function renderWorkBoard(properties, state) {
  const active = properties.filter(p => !isPropertyArchived(p));
  let items = (state.workItems || []).filter(w => active.some(p => p.id === w.propertyId)).map(work => ({ work, ...workSignals(work, active.find(p => p.id === work.propertyId), state.linkedTasks) }));
  const query = (state.workSearch || '').toLowerCase();
  items = items.filter(({ work, metadata, overdue, newComplaints }) => {
    if (query && !`${work.title} ${work.propertyName}`.toLowerCase().includes(query)) return false;
    if (state.workOwner !== 'all' && state.workOwner && (state.workOwner === 'unassigned' ? metadata.assigneeId || !metadata.available : !metadata.assigneeIds.includes(state.workOwner))) return false;
    const filter = state.workFilter || 'open';
    return filter === 'all' || (filter === 'open' ? !['resolved', 'dismissed'].includes(work.status) : filter === 'overdue' ? overdue : filter === 'reassess' ? newComplaints.length > 0 : work.status === filter);
  });
  items.sort((a,b) => Number(b.overdue) - Number(a.overdue) || (a.metadata.dueDate || '9999').localeCompare(b.metadata.dueDate || '9999') || a.work.title.localeCompare(b.work.title));
  const pages = Math.max(1, Math.ceil(items.length / 25)), page = Math.min(state.workPage || 1, pages);
  return `<section><h2 class="text-xl font-semibold">${tx('workBoard')}</h2><p class="rr-note my-2">${tx('workHelp')}</p>${renderSharedStatus(state)}
    <div class="rr-controls my-4"><input id="work-search" data-work-filter="workSearch" aria-label="${tx('workSearch')}" placeholder="${tx('workSearch')}" value="${h(state.workSearch)}">
      <select id="work-status-filter" data-work-filter="workFilter" aria-label="${tx('status')}">${options([['open',t('openWork')],['all',t('allWork')],['overdue',t('overdue')],['reassess',t('reassess')],...IMPROVEMENT_STATUSES.map(s=>[s,t(s)])], state.workFilter)}</select>
      <select id="work-owner-filter" data-work-filter="workOwner" aria-label="${tx('owner')}">${options([['all',t('allOwners')],['unassigned',t('unassigned')],...employees(state).slice(1)],state.workOwner)}</select></div>
    ${state.canManageWork ? `<form data-work-create-form class="rr-controls mb-5"><select name="propertyId" aria-label="${tx('chooseProperty')}" required>${options([['',t('chooseProperty')],...active.map(p=>[p.id,p.name])],'')}</select><select name="category" aria-label="${tx('category')}">${options(WORK_CATEGORIES.map(c=>[c,t(`${c}Category`)]),'cleanliness')}</select><button class="rr-action" ${state.workflowLoading || state.workflowError ? 'disabled' : ''}>${tx('newImprovement')}</button></form>` : ''}
    ${items.slice((page-1)*25,page*25).map(({work,metadata,overdue,newComplaints,evidence})=>`<article class="rr-row"><div><h3>${h(work.propertyName)}</h3><p class="rr-note">${tx(`${work.category}Category`)}</p></div><div><h3>${h(work.title)}</h3><p>${tx(work.status)} · ${metadata.available ? h(metadata.assigneeName || t('unassigned')) : tx('linkedTaskUnavailable')}</p><p class="rr-note">${metadata.dueDate ? `${tx('dueDate')}: ${h(metadata.dueDate)} · ` : ''}${metadata.priority ? tx(metadata.priority) : ''} · ${tx('evidenceCount',{count:evidence.length})}</p>${overdue ? `<p class="text-red-700 text-sm">${tx('overdue')}</p>`:''}${newComplaints.length ? `<p class="text-amber-800 text-sm">${tx('newComplaints',{count:newComplaints.length})}</p>`:''}</div>${button('openProperty',`data-work-id="${h(work.id)}" data-work-property="${h(work.propertyId)}" data-work-category="${h(work.category)}"`)}</article>`).join('') || `<p class="rr-note py-8">${tx('workEmpty')}</p>`}
    ${pageControls('work',page,pages)}</section>`;
}

export function renderWorkEditor(property, state) {
  const draft = state.workDraft?.propertyId === property.id ? state.workDraft : null;
  if (!draft) {
    const items = (state.workItems || []).filter(w => w.propertyId === property.id);
    return `<section><h3 class="font-semibold text-lg mb-3">${tx('workBoard')}</h3>${renderSharedStatus(state)}
      ${state.canManageWork ? `<form data-work-create-form class="rr-controls my-4"><input type="hidden" name="propertyId" value="${h(property.id)}"><select name="category" aria-label="${tx('category')}">${options(WORK_CATEGORIES.map(c=>[c,t(`${c}Category`)]),'cleanliness')}</select><button class="rr-action" ${state.workflowLoading || state.workflowError ? 'disabled' : ''}>${tx('newImprovement')}</button></form>` : ''}
      ${items.map(w=>`<article class="rr-work-item"><h4 class="font-semibold">${h(w.title)}</h4><p class="rr-note my-2">${tx(w.status)} · ${tx(`${w.category}Category`)}</p>${button('openProperty',`data-work-id="${h(w.id)}" data-work-property="${h(w.propertyId)}" data-work-category="${h(w.category)}"`)}</article>`).join('') || `<p class="rr-note py-4">${tx('workEmpty')}</p>`}</section>`;
  }
  const locked = !state.canManageWork || state.workflowSaving || state.workflowLoading || Boolean(state.workflowError);
  const meta = workMetadata(draft,state.linkedTasks), operationalLocked = locked || Boolean(draft.linkedTaskId);
  const signals = workSignals(draft,property,state.linkedTasks);
  const field = (name,label,type='text',disabled=locked) => `<label class="rr-field ${type==='textarea'?'rr-span':''}"><span>${tx(label)}</span>${type==='textarea'?`<textarea id="work-${name}" data-work-field="${name}" ${disabled?'disabled':''}>${h(draft[name])}</textarea>`:`<input id="work-${name}" data-work-field="${name}" type="${type}" value="${h(draft[name])}" ${disabled?'disabled':''} ${name==='title'?'maxlength="200" required':''}>`}</label>`;
  return `<section>${renderSharedStatus(state)}<h3 class="font-semibold text-lg mb-4">${tx(`${draft.category}Category`)}</h3>
    ${signals.newComplaints.length?`<p class="rr-note text-amber-800 mb-4">${tx('newComplaints',{count:signals.newComplaints.length})}</p>`:''}
    <form id="work-edit-form" class="rr-form-grid">${field('title','workTitle')}
    <label class="rr-field"><span>${tx('status')}</span><select id="work-status" data-work-field="status" ${locked?'disabled':''}>${options(IMPROVEMENT_STATUSES.map(s=>[s,t(s)]),draft.status)}</select></label>
    ${draft.linkedTaskId ? `<div class="rr-span rr-note">${tx('linkedTaskHelp')}<p>${meta.available?h(`${meta.assigneeName || t('unassigned')} · ${meta.dueDate || '—'} · ${t(meta.priority)}`):tx('linkedTaskUnavailable')}</p></div>` : `<label class="rr-field"><span>${tx('owner')}</span><select id="work-assigneeId" data-work-field="assigneeId" ${locked?'disabled':''}>${options(employees(state,draft),draft.assigneeId)}</select></label>${field('dueDate','dueDate','date',operationalLocked)}<label class="rr-field"><span>${tx('priority')}</span><select id="work-priority" data-work-field="priority" ${operationalLocked?'disabled':''}>${options(WORK_PRIORITIES.map(p=>[p,t(p)]),draft.priority)}</select></label>`}
    ${field('completionEvidence','completionEvidence','textarea')}<p class="rr-note rr-span">${tx('completionHelp')}</p>${field('note','note','textarea')}
    <div class="rr-actions rr-span"><button class="rr-action" ${locked?'disabled':''}>${tx(state.workflowSaving?'saving':'saveWork')}</button>${button('reload','data-work-reload',state.workflowSaving)}</div></form>
    <section class="rr-health"><h4 class="font-semibold mb-2">${tx('linkedTask')}</h4>${draft.linkedTaskId?`${meta.task?`<p class="rr-note">${h(meta.task.title)} · ${tx(meta.task.status==='done'?'taskDone':meta.task.status==='inProgress'?'taskInProgress':'taskTodo')}</p>`:''}${button('openTask',`data-linked-task="${h(draft.linkedTaskId)}"`,!meta.available)}`:`<div class="rr-form-grid"><label class="rr-field"><span>${tx('linkExisting')}</span><select id="work-link-task">${options([['',t('chooseTask')],...(state.linkedTasks||[]).map(task=>[task.id,task.title])],'')}</select></label><div class="self-end">${button('linkTask','data-link-existing',locked||!draft.revision)}</div><label class="rr-field"><span>${tx('department')}</span><select id="work-task-department">${options([['general',t('generalDepartment')],...(state.taskDepartments||[]).filter(d=>d.id!=='general').map(d=>[d.id,d.name])],'general')}</select></label><div class="self-end">${button('createTask','data-create-linked',locked||!draft.revision)}</div></div>`}</section>
    <h4 class="font-semibold my-3">${tx('evidenceCount',{count:signals.evidence.length})}</h4>${signals.evidence.map(e=>`<article class="rr-evidence"><p class="rr-excerpt">${h(e.excerpt)}</p><p class="rr-note">${h(e.platform)} · ${h(e.author)} · ${h(reviewDate(e.date))}</p>${button('viewEvidence',`data-inbox-property="${h(property.id)}" data-inbox-key="${h(e.key)}"`)}</article>`).join('')||`<p class="rr-note">${tx('noEvidence')}</p>`}
    ${renderHistory(draft.history)}</section>`;
}

function renderHistory(history = []) {
  return `<details class="mt-5"><summary class="cursor-pointer font-semibold">${tx('history')} (${history.length})</summary>${[...history].reverse().map(event=>`<article class="rr-history"><strong>${h(event.actor?.name||event.actor?.email||t('actorUnknown'))}</strong> · ${h(reviewDate(event.at))} · ${tx(event.action==='linkedTask'?'linkedTaskAction':event.action)}${(event.changes||[]).map(c=>`<p>${tx(c.field==='assigneeId'?'owner':c.field==='title'?'workTitle':c.field)}: ${h(c.before||'—')} → ${h(c.after||'—')}</p>`).join('')}${event.assigneeName?`<p>${tx('owner')}: ${h(event.assigneeName)}</p>`:''}${event.note?`<p>${h(event.note)}</p>`:''}</article>`).join('')}</details>`;
}

export function renderReviewInbox(properties,state) {
  const filters=state.inbox||{}, result=queryReviewInbox(properties,state.followUps,filters);
  const select=(key,label,items)=>`<label class="rr-field"><span>${tx(label)}</span><select id="inbox-${key}" data-inbox-filter="${key}">${options(items,filters[key])}</select></label>`;
  return `<section><div class="flex justify-between gap-3"><h2 class="text-xl font-semibold">${tx('reviewInbox')}</h2><span class="rr-note" role="status">${tx('results',{count:result.total})}</span></div><p class="rr-note mt-2">${tx('inboxHelp')}</p>${renderSharedStatus(state)}
    <div class="rr-controls mt-4"><input type="search" id="inbox-search" data-inbox-filter="search" aria-label="${tx('search')}" placeholder="${tx('search')}" value="${h(filters.search)}"></div>
    <div class="rr-inbox-filters">${select('property','properties',[['all',t('allProperties')],...properties.filter(p=>!isPropertyArchived(p)).map(p=>[p.id,p.name])])}${select('platform','platform',[['all',t('allPlatforms')],['Airbnb','Airbnb'],['Booking.com','Booking.com'],['Direct','Direct']])}${select('response','responseStatus',[['all',t('allResponses')],['replied',t('replied')],['unanswered',t('unanswered')],['unknown',t('unknownReply')]])}${select('rating','ratingFilter',[['all',t('allRatings')],['low',t('lowRatings')],['positive',t('positiveRatings')]])}
    ${select('owner','owner',[['all',t('allOwners')],['unassigned',t('unassigned')],...employees(state).slice(1)])}${select('work','followUpStatus',[['all',t('allHandling')],['open',t('open')],['handled',t('handled')]])}${['from','to'].map(key=>`<label class="rr-field"><span>${tx(key==='from'?'startDate':'endDate')}</span><input type="date" id="inbox-${key}" data-inbox-filter="${key}" value="${h(filters[key])}"></label>`).join('')}${select('sort','sortReviews',[['newest',t('newest')],['priority',t('priorityReplies')]])}</div>
    ${filters.from&&filters.to&&filters.from>filters.to?`<p role="alert" class="text-red-800">${tx('dateRangeError')}</p>`:''}
    ${result.rows.map(r=>`<article class="rr-inbox-row"><div><h3 class="font-semibold">${h(r.propertyName)}</h3><p class="rr-note">${h(r.platform)} · ${h(reviewDate(r.date))}</p><p class="rr-note">${h(r.author||'Guest')} · ${h(r.score??'—')} / ${r.platform==='Airbnb'?5:10}</p></div><div><p class="rr-excerpt rr-clamp">${h([r.title,r.comment,r.positive,r.negative].filter(Boolean).join('\n') || t('noWrittenReview'))}</p><p class="rr-note mt-2">${h(statusLabel(r.replyState))} · ${tx(r.followUp?.status||'open')}${r.followUp?.assigneeName?` · ${h(r.followUp.assigneeName)}`:''}</p></div><div>${button('followUp',`data-inbox-property="${h(r.propertyId)}" data-inbox-key="${h(r.reviewKey)}"`)}</div></article>`).join('')||`<p class="rr-note py-8">${tx('inboxEmpty')}</p>`}
    ${pageControls('inbox',result.page,result.pages)}</section>`;
}

export function renderFollowUpEditor(property,state) {
  const review=state.selectedInboxReview, draft=state.followUpDraft;
  if (!review || review.propertyId!==property.id || !draft) return '';
  const url=safePlatformUrl(property,review), locked=!state.canManageWork||state.workflowSaving||state.workflowLoading||Boolean(state.workflowError);
  return `<section>${renderSharedStatus(state)}<h3 class="font-semibold text-lg">${tx('followUp')}</h3><p class="rr-note my-2">${h(review.author||'Guest')} · ${h(review.platform)} · ${h(reviewDate(review.date))} · ${h(review.score??'—')} / ${review.platform==='Airbnb'?5:10}</p>
    <p class="rr-excerpt">${h([review.title,review.comment,review.positive,review.negative].filter(Boolean).join('\n\n') || t('noWrittenReview'))}</p><p class="rr-note mt-3">${h(statusLabel(reviewReplyState(review)))}</p>${getReviewResponse(review)?`<blockquote class="rr-excerpt bg-gray-50 p-3 my-3">${h(getReviewResponse(review))}</blockquote>`:''}
    ${url?`<a class="rr-action inline-block my-3" href="${h(url)}" target="_blank" rel="noopener noreferrer">${tx('openPlatform')} ↗</a>`:`<p class="rr-note">${tx('platformUnavailable')}</p>`}
    <p class="rr-note my-3">${tx('followUpHelp')}</p><form id="follow-up-form" class="rr-form-grid"><label class="rr-field"><span>${tx('owner')}</span><select id="followup-owner" data-followup-field="assigneeId" ${locked?'disabled':''}>${options(employees(state,draft),draft.assigneeId)}</select></label><label class="rr-field"><span>${tx('followUpStatus')}</span><select id="followup-status" data-followup-field="status" ${locked?'disabled':''}>${options(['open','handled'].map(s=>[s,t(s)]),draft.status)}</select></label><label class="rr-field rr-span"><span>${tx('note')}</span><textarea id="followup-note" data-followup-field="note" ${locked?'disabled':''}>${h(draft.note)}</textarea></label><div class="rr-actions rr-span"><button class="rr-action" ${locked?'disabled':''}>${tx(state.workflowSaving?'saving':'saveFollowUp')}</button>${button('reload','data-followup-reload',state.workflowSaving)}</div></form>${renderHistory(draft.history)}</section>`;
}

export function bindWorkflowEvents(container,handlers) {
  container.querySelectorAll('[data-workflow-retry]').forEach(b=>b.addEventListener('click',()=>handlers.onWorkflowRetry?.()));
  container.querySelectorAll('[data-work-create-form]').forEach(form=>form.addEventListener('submit',event=>{event.preventDefault();const values=new FormData(event.currentTarget);handlers.onWorkOpen?.(values.get('propertyId'),values.get('category'));}));
  container.querySelectorAll('[data-work-id], [data-work-new]').forEach(b=>b.addEventListener('click',()=>handlers.onWorkOpen?.(b.dataset.workProperty||b.dataset.workNew,b.dataset.workCategory,b.dataset.workId)));
  container.querySelectorAll('[data-work-field]').forEach(el=>el.addEventListener('input',()=>handlers.onWorkField?.(el.dataset.workField,el.value)));
  container.querySelector('#work-edit-form')?.addEventListener('submit',e=>{e.preventDefault();handlers.onWorkSave?.();});
  container.querySelector('[data-work-reload]')?.addEventListener('click',()=>handlers.onWorkReload?.());
  container.querySelectorAll('[data-work-filter]').forEach(el=>el.addEventListener(el.tagName==='SELECT'?'change':'input',()=>handlers.onWorkFilter?.(el.dataset.workFilter,el.value)));
  container.querySelectorAll('[data-work-page]').forEach(b=>b.addEventListener('click',()=>handlers.onWorkPage?.(Number(b.dataset.workPage))));
  container.querySelectorAll('[data-inbox-filter]').forEach(el=>el.addEventListener(el.tagName==='SELECT'||el.type==='date'?'change':'input',()=>handlers.onInboxFilter?.(el.dataset.inboxFilter,el.value)));
  container.querySelectorAll('[data-inbox-page]').forEach(b=>b.addEventListener('click',()=>handlers.onInboxFilter?.('page',Number(b.dataset.inboxPage))));
  container.querySelectorAll('[data-inbox-key]').forEach(b=>b.addEventListener('click',()=>handlers.onInboxOpen?.(b.dataset.inboxProperty,b.dataset.inboxKey)));
  container.querySelectorAll('[data-followup-field]').forEach(el=>el.addEventListener('input',()=>handlers.onFollowUpField?.(el.dataset.followupField,el.value)));
  container.querySelector('#follow-up-form')?.addEventListener('submit',e=>{e.preventDefault();handlers.onFollowUpSave?.();});
  container.querySelector('[data-followup-reload]')?.addEventListener('click',()=>handlers.onFollowUpReload?.());
  container.querySelector('[data-link-existing]')?.addEventListener('click',()=>{const id=container.querySelector('#work-link-task')?.value;if(id)handlers.onLinkTask?.(id);});
  container.querySelector('[data-create-linked]')?.addEventListener('click',()=>handlers.onLinkTask?.('',container.querySelector('#work-task-department')?.value));
  container.querySelectorAll('[data-linked-task]').forEach(b=>b.addEventListener('click',()=>handlers.onOpenLinkedTask?.(b.dataset.linkedTask)));
}
