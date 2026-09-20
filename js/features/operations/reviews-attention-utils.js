import { getAllPropertyReviews, hasReviewResponse, isPropertyArchived, analysePropertyInsights } from './reviews-ratings-utils.js';
import { platformHealth, reviewTime, reviewNeedsAttention, validScore, RATING_THRESHOLDS } from './review-quality-utils.js';

export function buildAttentionQueue(properties = [], { now = Date.now(), search = '', platform = 'all', queue = 'all' } = {}) {
  const rows = [];
  const day = 86400000;
  for (const property of properties.filter(p => !isPropertyArchived(p))) {
    const reviews = getAllPropertyReviews(property);
    const recent = reviews.filter(r => {
      const time = reviewTime(r.date);
      return time !== null && time <= now && time >= now - RATING_THRESHOLDS.RECENT_DAYS * day;
    });
    const add = (row) => rows.push({ propertyId: property.id, propertyName: property.name || '', location: property.location || '', ...row });
    for (const review of recent) {
      if (hasReviewResponse(review) || review.hasResponse === true) continue;
      add({ queue: 'replies', platform: review.platform === 'Airbnb' ? 'airbnb' : 'booking',
        reason: 'replyReason', params: { days: Math.floor((now - reviewTime(review.date)) / day) },
        score: review.score, date: review.date, excerpt: review.negative || review.comment || review.title || '',
        author: review.author || 'Guest', reviewId: review.id, priority: reviewNeedsAttention(review) ? 0 : 3, action: 'reviews' });
    }
    for (const platform of ['airbnb', 'booking']) {
      const health = platformHealth(property, platform, now);
      if (health.status !== 'current') {
        add({ queue: 'data', platform, reason: health.status, params: {}, health,
          priority: health.status === 'failed' ? 1 : 4, action: health.status === 'unlinked' ? 'settings' : 'overview' });
      }
      const data = property[platform];
      const max = platform === 'airbnb' ? 5 : 10;
      const target = platform === 'airbnb' ? RATING_THRESHOLDS.AIRBNB_ALERT : RATING_THRESHOLDS.BOOKING_ALERT;
      const cleanTarget = platform === 'airbnb' ? RATING_THRESHOLDS.CLEANLINESS_AIRBNB_TARGET : RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET;
      if (validScore(data?.score, max) && data.score < target) add({ queue: 'ratings', platform, reason: 'lowScore', params: { score: data.score, max, target }, priority: 1, action: 'overview' });
      if (validScore(data?.subScores?.cleanliness, max) && data.subScores.cleanliness < cleanTarget) add({ queue: 'ratings', platform, reason: 'lowClean', params: { score: data.subScores.cleanliness, max, target: cleanTarget }, priority: 1, action: 'overview' });

      const dated = recent.filter(r => r.platform === (platform === 'airbnb' ? 'Airbnb' : 'Booking.com') && validScore(r.score, max));
      const current = dated.filter(r => reviewTime(r.date) >= now - 30 * day);
      const previous = dated.filter(r => reviewTime(r.date) < now - 30 * day && reviewTime(r.date) >= now - 60 * day);
      if (current.length >= 5 && previous.length >= 5) {
        const mean = list => list.reduce((sum, r) => sum + r.score, 0) / list.length;
        if (mean(previous) - mean(current) >= max * 0.04) add({ queue: 'declining', platform, reason: 'declineReason',
          params: { before: mean(previous).toFixed(2), after: mean(current).toFixed(2), max, beforeCount: previous.length, afterCount: current.length }, priority: 1, action: 'reviews' });
      }
    }
    const evidence = (analysePropertyInsights(property).evidence || []).filter(e => {
      const at = reviewTime(e.date);
      return e.decision !== 'dismissed' && (at === null || (at <= now && at >= now - 90 * day));
    });
    for (const finding of evidence.filter(e => e.decision === 'pending')) {
      add({ queue: 'classifications', platform: finding.platform === 'Airbnb' ? 'airbnb' : 'booking', reason: finding.confidence === 'uncertain' ? 'uncertainReason' : 'suggestedReason',
        params: {}, excerpt: finding.excerpt, date: finding.date, author: finding.author,
        priority: 3, action: 'overview', category: finding.category, finding });
    }
    for (const platform of ['airbnb', 'booking']) {
      const groups = new Map();
      for (const finding of evidence.filter(e => e.decision === 'confirmed' && reviewTime(e.date) !== null && e.platform === (platform === 'airbnb' ? 'Airbnb' : 'Booking.com'))) {
        const group = groups.get(finding.category) || [];
        group.push(finding);
        groups.set(finding.category, group);
      }
      for (const [category, group] of groups) {
        if (group.length >= 2) add({ queue: 'recurring', platform, category, reason: 'recurringReason', params: { count: group.length },
          excerpt: group[0].excerpt, priority: 1, action: 'overview' });
      }
    }
  }
  const query = search.toLocaleLowerCase().trim();
  const matching = rows.filter(r => (platform === 'all' || r.platform === platform) && (!query ||
    [r.propertyName, r.location, r.excerpt, r.author].some(v => String(v || '').toLocaleLowerCase().includes(query))));
  const counts = { all: matching.length, replies: 0, ratings: 0, recurring: 0, declining: 0, classifications: 0, data: 0 };
  for (const row of matching) counts[row.queue]++;
  const items = matching.filter(r => queue === 'all' || r.queue === queue).sort((a, b) =>
    a.priority - b.priority || (reviewTime(b.date) || 0) - (reviewTime(a.date) || 0) || a.propertyName.localeCompare(b.propertyName));
  return { items, counts };
}
