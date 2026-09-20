import { getAllPropertyReviews, isPropertyArchived } from './reviews-ratings-utils.js';
import { classifyReviewIssues, reviewTime, validScore, RATING_THRESHOLDS } from './review-quality-utils.js';
import { reviewKey, reviewReplyState } from './reviews-workflow-utils.js';

const DAY = 86400000;
export const TREND_MIN_SAMPLE = 5;
export const TREND_PLATFORMS = ['Airbnb', 'Booking.com'];
const written = r => ['title', 'comment', 'positive', 'negative'].some(key => String(r[key] || '').trim());
const mean = values => values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : null;
const ratio = (count, total) => total ? count / total * 100 : null;
const median = values => { const ordered = [...values].sort((a, b) => a - b), i = Math.floor(ordered.length / 2); return ordered.length ? ordered.length % 2 ? ordered[i] : (ordered[i - 1] + ordered[i]) / 2 : null; };
export const trendDateKey = time => new Date(time).toISOString().slice(0, 10);

export function trendWindows(days = 90, now = Date.now()) {
  days = [30, 90, 365].includes(Number(days)) ? Number(days) : 90;
  const today = Math.floor(now / DAY) * DAY, start = today - (days - 1) * DAY;
  return { days, now, current: { start, end: now + 1 }, previous: { start: start - days * DAY, end: start } };
}

export function trendProperties(properties, filters = {}) {
  return properties.filter(p => !isPropertyArchived(p) && (!filters.property || filters.property === 'all' || p.id === filters.property)
    && (!filters.location || filters.location === 'all' || p.location === filters.location));
}

export function trendRecords(properties) {
  return properties.flatMap(property => getAllPropertyReviews(property).map(review => ({ ...review, propertyId: property.id,
    findings: classifyReviewIssues(review, property.insightDecisions || {}), time: reviewTime(review.date), written: written(review) })));
}

const inWindow = (r, window) => r.time !== null && r.time >= window.start && r.time < window.end;
const eligible = r => r.origin !== 'manual' && TREND_PLATFORMS.includes(r.platform);

export function summarizeTrendPeriod(records, platform, window, followUps = [], now = Date.now()) {
  const rows = records.filter(r => eligible(r) && r.platform === platform && inWindow(r, window) && r.time <= now);
  const max = platform === 'Airbnb' ? 5 : 10;
  const target = platform === 'Airbnb' ? RATING_THRESHOLDS.AIRBNB_ALERT : RATING_THRESHOLDS.BOOKING_ALERT;
  const ratings = rows.filter(r => validScore(r.score, max));
  const low = ratings.filter(r => r.score < target).length;
  const text = rows.filter(r => r.written);
  const complaints = text.filter(r => r.findings.some(f => f.decision === 'confirmed')).length;
  const pending = text.filter(r => r.findings.some(f => f.decision === 'pending')).length;
  const replied = rows.filter(r => reviewReplyState(r) === 'replied').length;
  const handled = new Set(followUps.filter(f => f.status === 'handled').map(f => `${f.propertyId}|${f.reviewKey}`));
  const backlog = rows.filter(r => reviewReplyState(r) !== 'replied' && !handled.has(`${r.propertyId}|${reviewKey(r)}`));
  const ages = [0, 0, 0, 0];
  for (const r of backlog) { const days = Math.floor((now - r.time) / DAY); ages[days <= 7 ? 0 : days <= 30 ? 1 : days <= 90 ? 2 : 3]++; }
  // Day-only dates and collection timestamps cannot establish elapsed response time.
  const exact = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const responseHours = rows.flatMap(r => {
    const at = reviewTime(r.responseDate);
    return reviewReplyState(r) === 'replied' && exact(r.date) && exact(r.responseDate) && at !== null && at >= r.time && at <= now ? [(at - r.time) / 3600000] : [];
  });
  return { count: rows.length, rated: ratings.length, written: text.length, properties: new Set(rows.map(r => r.propertyId)).size,
    average: mean(ratings.map(r => r.score)), low, lowShare: ratio(low, ratings.length), complaints, complaintShare: ratio(complaints, text.length), pending,
    replied, replyCoverage: ratio(replied, rows.length), responseHours: median(responseHours), responseSample: responseHours.length,
    backlog: backlog.length, confirmedUnanswered: backlog.filter(r => reviewReplyState(r) === 'unanswered').length,
    uncaptured: backlog.filter(r => reviewReplyState(r) === 'unknown').length, ages };
}

export function trendDelta(current, previous, metric, denominator) {
  return current[denominator] >= TREND_MIN_SAMPLE && previous[denominator] >= TREND_MIN_SAMPLE && current[metric] !== null && previous[metric] !== null
    ? current[metric] - previous[metric] : null;
}

export function reviewTrendSeries(records, platform, windows) {
  const width = Math.ceil(windows.days / 12) * DAY, series = [];
  for (let start = windows.current.start; start < windows.current.end; start += width) {
    const end = Math.min(start + width, windows.current.end);
    const values = records.filter(r => eligible(r) && r.platform === platform && inWindow(r, { start, end }) && validScore(r.score, platform === 'Airbnb' ? 5 : 10));
    series.push({ start, end, count: values.length, value: mean(values.map(r => r.score)) });
  }
  return series;
}

export function listingScoreHistory(property, platform, window, now = Date.now()) {
  const key = platform === 'Airbnb' ? 'airbnb' : 'booking', data = property?.[key];
  const snapshots = [...(Array.isArray(data?.ratingHistory) ? data.ratingHistory : [])];
  const at = data?.lastSuccessAt || (data?.status === 'success' ? data.lastChecked : null);
  if (at) snapshots.push({ at, score: data.score, reviewCount: data.reviewCount });
  const byTime = new Map();
  for (const snapshot of snapshots) {
    const time = reviewTime(snapshot?.at);
    if (time === null || time > now || time < window.start || time >= window.end || !validScore(snapshot.score, platform === 'Airbnb' ? 5 : 10)) continue;
    byTime.set(time, { at: time, score: snapshot.score, reviewCount: Number.isFinite(snapshot.reviewCount) && snapshot.reviewCount >= 0 ? snapshot.reviewCount : null });
  }
  return [...byTime.values()].sort((a, b) => a.at - b.at);
}

export function improvementOutcome(work, property, platform, days = 90, now = Date.now()) {
  const completed = reviewTime(work.monitoringSince || work.resolvedAt);
  if (!['monitoring', 'resolved'].includes(work.status) || completed === null || completed > now) return null;
  // Reviews often have only a calendar date. Omit the completion day and compare equal complete days.
  const completionDay = Math.floor(completed / DAY) * DAY, afterStart = completionDay + DAY;
  const elapsed = Math.max(0, Math.min(Number(days), Math.floor((Math.floor(now / DAY) * DAY - afterStart) / DAY)));
  const beforeWindow = { start: completionDay - elapsed * DAY, end: completionDay };
  const afterWindow = { start: afterStart, end: afterStart + elapsed * DAY };
  const records = trendRecords([property]).filter(r => eligible(r) && r.platform === platform);
  const summarize = window => {
    const rows = records.filter(r => inWindow(r, window));
    const text = rows.filter(r => r.written), ratings = rows.filter(r => validScore(r.score, platform === 'Airbnb' ? 5 : 10));
    const matches = r => r.findings.filter(f => f.category === work.category);
    const confirmed = text.filter(r => matches(r).some(f => f.decision === 'confirmed')).length;
    const pending = text.filter(r => matches(r).some(f => f.decision === 'pending')).length;
    return { count: rows.length, written: text.length, rated: ratings.length, confirmed, pending, share: ratio(confirmed, text.length), average: mean(ratings.map(r => r.score)) };
  };
  const before = summarize(beforeWindow), after = summarize(afterWindow);
  return { work, platform, completed, days: elapsed, beforeWindow, afterWindow, before, after,
    delta: trendDelta(after, before, 'share', 'written'), comparable: before.written >= TREND_MIN_SAMPLE && after.written >= TREND_MIN_SAMPLE };
}

export function buildTrendsReport(properties, filters = {}, followUps = [], now = Date.now()) {
  const selected = trendProperties(properties, filters), windows = trendWindows(filters.days, now), records = trendRecords(selected);
  const platforms = TREND_PLATFORMS.filter(p => !filters.platform || filters.platform === 'all' || p === filters.platform);
  const imported = records.filter(r => eligible(r) && platforms.includes(r.platform));
  return { properties: selected, windows, platforms: platforms.map(platform => ({ platform,
    current: summarizeTrendPeriod(records, platform, windows.current, followUps, now),
    previous: summarizeTrendPeriod(records, platform, windows.previous, followUps, now), series: reviewTrendSeries(records, platform, windows) })),
    unknownDates: imported.filter(r => r.time === null).length, futureDates: imported.filter(r => r.time !== null && r.time > now).length,
    manual: records.filter(r => r.origin === 'manual' && platforms.includes(r.platform)).length };
}
