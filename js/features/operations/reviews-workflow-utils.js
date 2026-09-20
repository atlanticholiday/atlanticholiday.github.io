import { analysePropertyInsights, getAllPropertyReviews, getReviewResponse, hasReviewResponse, isPropertyArchived, ISSUE_BUCKETS } from './reviews-ratings-utils.js';
import { reviewTime, reviewNeedsAttention } from './review-quality-utils.js';

export const IMPROVEMENT_STATUSES = ['new', 'inProgress', 'monitoring', 'resolved', 'dismissed'];
export const WORK_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const WORK_CATEGORIES = [...ISSUE_BUCKETS.map(b => b.key), 'other'];
export const workId = (propertyId, category) => `reviews-work:${encodeURIComponent(propertyId)}:${category}`;

export function reviewKey(review) {
  // IDs from the platform take precedence over scraper-specific IDs.
  return `${review.platform || 'Direct'}:${review.sourceId || review.id || JSON.stringify([review.author, review.date, review.comment, review.positive, review.negative])}`;
}

export function followUpId(propertyId, review) {
  // A deterministic, collision-resistant document key without exposing review text in paths.
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${propertyId}|${reviewKey(review)}`))
    .then(bytes => `reviews-reply:${Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('')}`);
}

export function reviewReplyState(review) {
  if (hasReviewResponse(review)) return 'replied';
  return review.responseStatus === 'unanswered' && review.responseCheckedAt ? 'unanswered' : 'unknown';
}

export function safePlatformUrl(property, review) {
  const platform = review.platform === 'Airbnb' ? 'airbnb' : review.platform === 'Booking.com' ? 'booking' : null;
  if (!platform) return '';
  for (const candidate of [review.reviewUrl, review.url, property[`${platform}Url`]]) {
    try {
      const url = new URL(candidate);
      const domain = platform === 'airbnb' ? /(^|\.)airbnb\.(com|pt|co\.uk|es|fr|de)$/i : /(^|\.)booking\.com$/i;
      if (url.protocol === 'https:' && domain.test(url.hostname) && !url.username && !url.password) return url.href;
    } catch { /* Missing or unsupported destination. */ }
  }
  return '';
}

export function collectWorkEvidence(property, category) {
  const reviews = getAllPropertyReviews(property);
  return (analysePropertyInsights(property).evidence || [])
    .filter(f => f.category === category && f.decision !== 'dismissed' && (f.confidence === 'high' || f.decision === 'confirmed'))
    .map(f => {
      const review = reviews.find(r => r.platform === f.platform && ((f.sourceId && r.sourceId === f.sourceId) || (f.reviewId && r.id === f.reviewId)));
      return { key: review ? reviewKey(review) : `${f.platform}:${f.reviewId}`, findingKey: f.key, reviewId: f.reviewId,
        sourceId: f.sourceId, platform: f.platform, date: f.date, excerpt: f.excerpt, author: f.author };
    });
}

export function mergeEvidence(previous = [], incoming = []) {
  return [...new Map([...previous, ...incoming].map(e => [e.key, e])).values()];
}

export function workMetadata(work, tasks = []) {
  if (!work.linkedTaskId) return { assigneeId: work.assigneeId || '', assigneeIds: work.assigneeId ? [work.assigneeId] : [], assigneeName: work.assigneeName || '', dueDate: work.dueDate || '', priority: work.priority || 'normal', task: null, available: true };
  const task = tasks.find(t => t.id === work.linkedTaskId);
  return task ? { assigneeId: task.assigneeIds?.[0] || '', assigneeIds: task.assigneeIds || [], assigneeName: (task.assignees || []).map(a => a.name).join(', '), dueDate: task.dueDate || '', priority: task.priority || 'normal', task, available: true }
    : { assigneeId: '', assigneeIds: [], assigneeName: '', dueDate: '', priority: '', task: null, available: false };
}

export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function workSignals(work, property, tasks = [], now = Date.now()) {
  const metadata = workMetadata(work, tasks);
  const closed = ['resolved', 'dismissed'].includes(work.status);
  const evidence = mergeEvidence(work.evidence, property ? collectWorkEvidence(property, work.category) : []);
  const baseline = new Set(work.monitoringEvidenceKeys || []);
  const monitoredAt = reviewTime(work.monitoringSince);
  const newComplaints = monitoredAt === null || !['monitoring', 'resolved'].includes(work.status) ? [] : evidence.filter(e =>
    !baseline.has(e.key) && reviewTime(e.date) !== null && reviewTime(e.date) > monitoredAt && reviewTime(e.date) <= now);
  return { metadata, evidence, newComplaints, overdue: !closed && Boolean(metadata.dueDate && metadata.dueDate < localDateKey(new Date(now))), unassigned: !closed && metadata.available && !metadata.assigneeId };
}

export function createWorkSeed(property, category, title) {
  if (!property?.id || !WORK_CATEGORIES.includes(category)) throw new Error('invalidWork');
  return { id: workId(property.id, category), recordType: 'improvement', propertyId: property.id, propertyName: property.name,
    category, title: title || `${property.name} · ${category}`, status: 'new', priority: 'normal', assigneeId: '', assigneeName: '',
    dueDate: '', completionEvidence: '', linkedTaskId: '', evidence: collectWorkEvidence(property, category), revision: 0 };
}

export function applyWorkChange(current, draft, actor, now = new Date().toISOString()) {
  if (!actor?.uid || !draft.title?.trim() || !IMPROVEMENT_STATUSES.includes(draft.status) || !WORK_PRIORITIES.includes(draft.priority)) throw new Error('invalidWork');
  if (draft.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate) || !Number.isFinite(Date.parse(`${draft.dueDate}T12:00:00Z`)) || new Date(`${draft.dueDate}T12:00:00Z`).toISOString().slice(0, 10) !== draft.dueDate)) throw new Error('invalidDate');
  if (['monitoring', 'resolved'].includes(draft.status) && !draft.completionEvidence?.trim()) throw new Error('completionRequired');
  if (draft.status === 'dismissed' && current?.status !== 'dismissed' && !draft.note?.trim()) throw new Error('dismissalRequired');
  const identity = current || draft;
  const evidence = mergeEvidence(current?.evidence, draft.evidence);
  const next = { ...identity, title: draft.title.trim().slice(0, 200), status: draft.status,
    completionEvidence: String(draft.completionEvidence || '').trim().slice(0, 8000), evidence,
    createdAt: current?.createdAt || now, createdBy: current?.createdBy || actor,
    updatedAt: now, updatedBy: actor, revision: (current?.revision || 0) + 1 };
  // When linked, operational metadata belongs to Tasks and is never overwritten here.
  if (!current?.linkedTaskId) Object.assign(next, { assigneeId: draft.assigneeId || '', assigneeName: draft.assigneeName || '', dueDate: draft.dueDate || '', priority: draft.priority });
  if (['monitoring', 'resolved'].includes(draft.status) && !['monitoring', 'resolved'].includes(current?.status)) {
    next.monitoringSince = now;
    next.monitoringEvidenceKeys = evidence.map(e => e.key);
  }
  if (draft.status === 'resolved' && (current?.status !== 'resolved' || draft.note?.trim() || draft.completionEvidence !== current?.completionEvidence)) {
    next.monitoringEvidenceKeys = evidence.map(e => e.key);
  }
  next.resolvedAt = draft.status === 'resolved' ? current?.resolvedAt || now : '';
  const fields = ['title', 'status', 'assigneeId', 'dueDate', 'priority', 'completionEvidence'];
  const changes = fields.filter(field => current?.[field] !== next[field]).map(field => ({ field, before: current?.[field] || '', after: next[field] || '' }));
  const event = { at: now, actor, action: current ? 'updated' : 'created', changes, note: String(draft.note || '').trim().slice(0, 8000) };
  next.history = [...(current?.history || []), event];
  delete next.note;
  return next;
}

export function queryReviewInbox(properties, followUps = [], filters = {}, now = Date.now()) {
  const byKey = new Map(followUps.map(f => [`${f.propertyId}|${f.reviewKey}`, f]));
  let rows = properties.filter(p => !isPropertyArchived(p)).flatMap(property => getAllPropertyReviews(property).map(review => ({
    ...review, propertyId: property.id, propertyName: property.name, location: property.location,
    reviewKey: reviewKey(review), replyState: reviewReplyState(review), platformUrl: safePlatformUrl(property, review),
    followUp: byKey.get(`${property.id}|${reviewKey(review)}`) || null
  })));
  const search = (filters.search || '').toLocaleLowerCase().trim();
  rows = rows.filter(r => {
    const date = reviewTime(r.date);
    if (filters.property && filters.property !== 'all' && r.propertyId !== filters.property) return false;
    if (filters.platform && filters.platform !== 'all' && r.platform !== filters.platform) return false;
    if (filters.response && filters.response !== 'all' && r.replyState !== filters.response) return false;
    if (filters.rating === 'low' && !reviewNeedsAttention(r)) return false;
    if (filters.rating === 'positive' && !(r.score >= (r.platform === 'Airbnb' ? 4.8 : 9))) return false;
    if (filters.owner && filters.owner !== 'all' && (filters.owner === 'unassigned' ? r.followUp?.assigneeId : r.followUp?.assigneeId !== filters.owner)) return false;
    if (filters.work === 'open' && r.followUp?.status === 'handled') return false;
    if (filters.work === 'handled' && r.followUp?.status !== 'handled') return false;
    if ((filters.from || filters.to) && (date === null || date > now)) return false;
    if (filters.from && date < Date.parse(`${filters.from}T00:00:00`)) return false;
    if (filters.to && date > Date.parse(`${filters.to}T23:59:59.999`)) return false;
    return !search || [r.propertyName, r.location, r.author, r.comment, r.positive, r.negative, r.title, getReviewResponse(r)].some(value => String(value || '').toLocaleLowerCase().includes(search));
  });
  rows.sort((a, b) => {
    if (filters.sort === 'priority') {
      const rank = r => {
        const recent = reviewTime(r.date) !== null && reviewTime(r.date) <= now && reviewTime(r.date) >= now - 90 * 86400000;
        return r.replyState !== 'replied' && r.followUp?.status !== 'handled' ? recent ? reviewNeedsAttention(r) ? 0 : 1 : 2 : 3;
      };
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return (reviewTime(b.date) || 0) - (reviewTime(a.date) || 0) || a.reviewKey.localeCompare(b.reviewKey);
  });
  const total = rows.length, pages = Math.max(1, Math.ceil(total / 25));
  const page = Math.min(Math.max(1, Number(filters.page) || 1), pages);
  return { rows: rows.slice((page - 1) * 25, page * 25), total, pages, page };
}
