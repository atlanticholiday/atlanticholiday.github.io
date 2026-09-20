/**
 * Pure utility functions for the Reviews & Ratings module.
 */

import { RATING_THRESHOLDS, classifyReviewIssues, platformMetrics, reviewNeedsAttention, validScore } from './review-quality-utils.js';
export { RATING_THRESHOLDS } from './review-quality-utils.js';

export function round(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatScore(score, maxScore = 5) {
  if (score === null || score === undefined || Number.isNaN(score)) return '—';
  const num = Number(score);
  return `${num.toFixed(1)} / ${maxScore}`;
}

export function getCleanlinessStatus(property) {
  const airbnbClean = property?.airbnb?.subScores?.cleanliness;
  const bookingClean = property?.booking?.subScores?.cleanliness;

  let isAlert = false;
  let isGood = false;

  if (validScore(airbnbClean, 5)) {
    if (airbnbClean < RATING_THRESHOLDS.CLEANLINESS_AIRBNB_TARGET) isAlert = true;
    else if (airbnbClean >= 4.9) isGood = true;
  }

  if (validScore(bookingClean, 10)) {
    if (bookingClean < RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET) isAlert = true;
    else if (bookingClean >= 9.5) isGood = true;
  }

  if (isAlert) return 'alert';
  if (isGood) return 'excellent';
  if (validScore(airbnbClean, 5) || validScore(bookingClean, 10)) return 'good';
  return 'unrated';
}

export function isAttentionNeeded(property) {
  const airbnbScore = property?.airbnb?.score;
  const bookingScore = property?.booking?.score;
  const cleanliness = getCleanlinessStatus(property);

  if (cleanliness === 'alert') return true;
  if (validScore(airbnbScore, 5) && airbnbScore < RATING_THRESHOLDS.AIRBNB_ALERT) return true;
  if (validScore(bookingScore, 10) && bookingScore < RATING_THRESHOLDS.BOOKING_ALERT) return true;
  return false;
}

export function isPropertyArchived(property) {
  return Boolean(
    property && (
      property.archived === true ||
      property.status === 'archived' ||
      property.isArchived === true
    )
  );
}

export function calculatePortfolioSummary(properties = []) {
  const active = (Array.isArray(properties) ? properties : []).filter(p => !isPropertyArchived(p));
  const airbnb = platformMetrics(active, 'airbnb', getAllPropertyReviews);
  const booking = platformMetrics(active, 'booking', getAllPropertyReviews);
  return {
    totalProperties: active.length, airbnbAvg: airbnb.average, bookingAvg: booking.average,
    cleanlinessAvgAirbnb: airbnb.cleanliness, cleanlinessAvgBooking: booking.cleanliness,
    totalReviews: airbnb.platformReviews + booking.platformReviews,
    importedReviews: airbnb.importedReviews + booking.importedReviews,
    attentionNeededCount: active.filter(isAttentionNeeded).length,
    airbnb, booking
  };
}

export function getAllPropertyReviews(property) {
  if (!property) return [];
  const rawList = [];

  if (Array.isArray(property.reviews)) {
    rawList.push(...property.reviews);
  }
  if (Array.isArray(property.booking?.reviews)) {
    property.booking.reviews.forEach((r) => {
      rawList.push({ ...r, platform: r.platform || 'Booking.com' });
    });
  }
  if (Array.isArray(property.airbnb?.reviews)) {
    property.airbnb.reviews.forEach((r) => {
      rawList.push({ ...r, platform: r.platform || 'Airbnb' });
    });
  }

  // Deduplicate by signature and merge complementary fields
  const GENERIC_SCORE_TITLES = new Set([
    'exceptional', 'superb', 'wonderful', 'fabulous', 'very good', 'good',
    'pleasant', 'passable', 'disappointing', 'very poor', 'poor',
    'excecional', 'soberbo', 'muito bom', 'bom', 'agradável', 'passável', 'fraco', 'muito fraco'
  ]);

  const byKey = new Map();
  for (const r of rawList) {
    if (!r) continue;
    const authorNorm = (r.author || 'guest').trim().toLowerCase();
    const bodyText = (r.comment || r.positive || r.negative || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    const titleNorm = (r.title || '').trim().toLowerCase();
    const effectiveText = bodyText || (GENERIC_SCORE_TITLES.has(titleNorm) ? '' : titleNorm);
    const textSample = effectiveText.slice(0, 80);
    const platformNorm = (r.platform || '').trim().toLowerCase();

    let key;
    if (authorNorm && authorNorm !== 'guest') {
      key = textSample
        ? `${platformNorm}|${authorNorm}|${textSample}`
        : `${platformNorm}|${authorNorm}`;
    } else if (textSample) {
      key = `${platformNorm}|${textSample}`;
    } else {
      key = r.sourceId ? `${platformNorm}|${r.sourceId}` : (r.id || `${platformNorm}|${authorNorm}|${r.date}`);
    }

    // Distinct source IDs or dated stays must not collapse merely because the author matches.
    const candidate = byKey.get(key);
    if (candidate && ((r.sourceId && candidate.sourceId && r.sourceId !== candidate.sourceId) ||
        (!r.sourceId && !candidate.sourceId && r.date && candidate.date && r.date !== candidate.date))) {
      key += `|${r.sourceId || r.date}`;
    }
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...r,
        ...existing,
        id: existing.sourceId ? existing.id : (r.sourceId ? r.id : existing.id),
        sourceId: existing.sourceId || r.sourceId || '',
        score: existing.score !== null && existing.score !== undefined ? existing.score : r.score,
        country: existing.country || r.country || '',
        title: existing.title || r.title || '',
        positive: existing.positive || r.positive || '',
        negative: existing.negative || r.negative || '',
        comment: existing.comment || r.comment || '',
        response: existing.response || r.response || '',
        hasResponse: existing.hasResponse || r.hasResponse || Boolean(r.response || existing.response),
        date: existing.date && !/^\d{9,13}$/.test(existing.date) ? existing.date : (r.date || existing.date)
      });
    } else {
      byKey.set(key, { ...r });
    }
  }

  const unique = Array.from(byKey.values());

  // Sort by date descending (newest first)
  unique.sort((a, b) => {
    const parseTime = (d) => {
      if (!d) return 0;
      const s = String(d).trim();
      if (/^\d{9,13}$/.test(s)) {
        const n = Number(s);
        return n < 1e11 ? n * 1000 : n;
      }
      const clean = s.replace(/^Reviewed:\s*/i, '');
      const t = new Date(clean).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return parseTime(b.date) - parseTime(a.date);
  });

  return unique;
}

export function getLatestReviewSnippet(property) {
  const reviews = getAllPropertyReviews(property);
  return reviews.length > 0 ? reviews[0] : null;
}

export function getReviewResponse(review) {
  if (!review || typeof review !== 'object') return '';
  return [review.response, review.hostResponse, review.propertyResponse, review.reply, review.answer]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

export function hasReviewResponse(review) {
  return getReviewResponse(review).length > 0 || review?.hasResponse === true;
}

export function filterPropertyReviews(reviews = [], { platform = 'all', filter = 'all', search = '' } = {}) {
  let list = [...reviews];

  if (platform !== 'all') {
    const platLow = platform.toLowerCase();
    list = list.filter((r) => (r.platform || '').toLowerCase().includes(platLow));
  }

  if (filter === 'positive') {
    list = list.filter((r) => {
      if (r.platform === 'Airbnb') return (r.score || 0) >= RATING_THRESHOLDS.AIRBNB_TARGET;
      return (r.score || 0) >= RATING_THRESHOLDS.BOOKING_TARGET;
    });
  } else if (filter === 'attention') {
    list = list.filter(reviewNeedsAttention);
  } else if (filter === 'answered') {
    list = list.filter(hasReviewResponse);
  } else if (filter === 'unanswered') {
    list = list.filter((r) => !hasReviewResponse(r));
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((r) =>
      (r.id && String(r.id).toLowerCase() === q) ||
      (r.author && r.author.toLowerCase().includes(q)) ||
      (r.title && r.title.toLowerCase().includes(q)) ||
      (r.comment && r.comment.toLowerCase().includes(q)) ||
      (r.positive && r.positive.toLowerCase().includes(q)) ||
      (r.negative && r.negative.toLowerCase().includes(q)) ||
      (getReviewResponse(r).toLowerCase().includes(q)) ||
      (r.country && r.country.toLowerCase().includes(q))
    );
  }

  return list;
}

// ---------------------------------------------------------------------------
// Guest Insights & Recommendations — pure analysis, no external API
// ---------------------------------------------------------------------------

export const ISSUE_BUCKETS = [
  {
    key: 'cleanliness',
    label: 'Cleanliness',
    icon: 'broom',
    patterns: [/\b(dirt|dirty|clean|unclean|dust|dusty|stain|smelly|smell|mould|mold|cockroach|bug|ant|spider|hair|grime|grimy|hygiene|filth|filthy)\b/i]
  },
  {
    key: 'noise',
    label: 'Noise',
    icon: 'volume-up',
    patterns: [/\b(noise|noisy|loud|loudness|traffic|party|parties|disturb|disturbing|thin wall|street noise|barking)\b/i]
  },
  {
    key: 'wifi',
    label: 'WiFi / Internet',
    icon: 'wifi',
    patterns: [/\b(wifi|wi-fi|internet|connection|connectivity|network|slow speed|no internet|disconnect)\b/i]
  },
  {
    key: 'water',
    label: 'Water / Shower',
    icon: 'shower',
    patterns: [/\b(hot water|cold water|shower|water pressure|pressure|damp|leak|plumbing|tap|faucet)\b/i]
  },
  {
    key: 'beds',
    label: 'Beds / Comfort',
    icon: 'bed',
    patterns: [/\b(bed|mattress|pillow|sofa|couch|uncomfortable|hard bed|soft bed|sleep|lumpy)\b/i]
  },
  {
    key: 'kitchen',
    label: 'Kitchen / Appliances',
    icon: 'utensils',
    patterns: [/\b(kitchen|oven|microwave|fridge|refrigerator|utensil|cutlery|pot|pan|dish|dishwasher|stovetop|hob|kettle|coffee|toaster)\b/i]
  },
  {
    key: 'parking',
    label: 'Parking',
    icon: 'car',
    patterns: [/\b(parking|park|garage)\b/i]
  },
  {
    key: 'checkin',
    label: 'Check-in / Access',
    icon: 'key',
    patterns: [/\b(check-in|check in|checkin|lockbox|access code|late arrival|key collection|entry|door code)\b/i]
  },
  {
    key: 'ac',
    label: 'AC / Heating',
    icon: 'thermometer-half',
    patterns: [/\b(air con|aircon|air conditioning|a\/c|heating|heater|cold room|hot room|freezing|no heat)\b/i]
  },
  {
    key: 'description',
    label: 'Listing Accuracy',
    icon: 'image',
    patterns: [/\b(mislead|misleading|different from photo|not as described|as advertised|inaccurate|false advertising|not what we expect)\b/i]
  },
  {
    key: 'location',
    label: 'Location / Access',
    icon: 'map-marker-alt',
    patterns: [/\b(far from|very remote|steep hill|long walk|hard to find|difficult to reach|no transport)\b/i]
  },
  {
    key: 'host',
    label: 'Host Communication',
    icon: 'comment-slash',
    patterns: [/\b(no response|didn't reply|unresponsive|not respond|slow response|ignored|never replied|hard to contact|communication issue)\b/i]
  },
  {
    key: 'space',
    label: 'Space / Size',
    icon: 'expand',
    patterns: [/\b(too small|very small|tiny space|cramped|very cramped|no space|limited space)\b/i]
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    icon: 'tools',
    patterns: [/\b(broken|not working|malfunction|needs repair|damage|damaged|cracked|faulty|out of order|needs fixing)\b/i]
  }
];

const POSITIVE_BUCKETS = [
  { key: 'cleanliness', label: 'Cleanliness', icon: 'broom', patterns: [/\b(spotless|very clean|immaculate|perfectly clean|sparkling|pristine)\b/i] },
  { key: 'location', label: 'Location', icon: 'map-marker-alt', patterns: [/\b(great location|perfect location|excellent location|well located|convenient location|ideal location|location)\b/i] },
  { key: 'view', label: 'View', icon: 'mountain', patterns: [/\b(stunning view|amazing view|beautiful view|ocean view|sea view|incredible view|breathtaking view|panoramic view|gorgeous view)\b/i] },
  { key: 'host', label: 'Host / Communication', icon: 'user-check', patterns: [/\b(great host|amazing host|wonderful host|excellent communication|very responsive|super helpful|friendly host|attentive host)\b/i] },
  { key: 'value', label: 'Value for Money', icon: 'tag', patterns: [/\b(great value|excellent value|value for money|worth every|good price|very affordable|well priced)\b/i] },
  { key: 'comfort', label: 'Comfort', icon: 'couch', patterns: [/\b(very comfortable|super comfortable|cosy|cozy|well equipped|fully equipped|very spacious|nicely furnished)\b/i] },
  { key: 'checkin', label: 'Easy Check-in', icon: 'key', patterns: [/\b(easy check-in|smooth check.in|straightforward check|simple check.in|easy access|seamless arrival)\b/i] },
  { key: 'quiet', label: 'Peaceful / Quiet', icon: 'leaf', patterns: [/\b(very quiet|nice and quiet|peaceful|tranquil|calm and|serene)\b/i] }
];

function matchesBuckets(text, buckets) {
  const results = {};
  for (const bucket of buckets) {
    for (const pattern of bucket.patterns) {
      if (pattern.test(text)) {
        results[bucket.key] = (results[bucket.key] || 0) + 1;
        break;
      }
    }
  }
  return results;
}

export function analysePropertyInsights(property) {
  if (!property) return { issues: [], positives: [], recommendations: [], hasData: false };

  const reviews = getAllPropertyReviews(property);
  const reviewsWithText = reviews.filter((r) =>
    (r.negative && r.negative.trim()) ||
    (r.comment && r.comment.trim()) ||
    (r.positive && r.positive.trim()) ||
    (r.title && r.title.trim())
  );

  const hasScoreData = (property.booking?.score != null) || (property.airbnb?.score != null);

  // A score or a single written review is sufficient for evidence.
  if (!hasScoreData && reviewsWithText.length === 0) {
    return { issues: [], positives: [], recommendations: [], hasData: false };
  }

  // --- Issue counting from review text ---
  const issueCounts = {};  // key -> { count, highCount }
  const positiveCounts = {}; // key -> count
  const evidence = [];

  for (const review of reviews) {
    const findings = classifyReviewIssues(review, property.insightDecisions || {});
    const posText = [review.positive || '', review.comment || '', review.title || ''].join(' ');
    const isAirbnb = review.platform === 'Airbnb';
    const isLowScore = typeof review.score === 'number' &&
      ((isAirbnb && review.score < RATING_THRESHOLDS.AIRBNB_ALERT) || (!isAirbnb && review.score < RATING_THRESHOLDS.BOOKING_ALERT));

    for (const finding of findings) {
      evidence.push(finding);
      if (finding.decision === 'dismissed' || (finding.confidence === 'uncertain' && finding.decision !== 'confirmed')) continue;
      if (!issueCounts[finding.category]) issueCounts[finding.category] = { count: 0, highCount: 0 };
      issueCounts[finding.category].count += 1;
      if (isLowScore) issueCounts[finding.category].highCount += 1;
    }

    if (posText.trim()) {
      const matched = matchesBuckets(posText, POSITIVE_BUCKETS);
      for (const [key, cnt] of Object.entries(matched)) {
        positiveCounts[key] = (positiveCounts[key] || 0) + cnt;
      }
    }
  }

  // Score alerts are separate from review mentions: a low sub-score is not another complaint.
  const bookingClean = property.booking?.subScores?.cleanliness;
  const airbnbClean = property.airbnb?.subScores?.cleanliness;
  const bookingValue = property.booking?.subScores?.value;

  // Build issues list
  const issues = Object.entries(issueCounts)
    .map(([key, { count, highCount }]) => {
      const bucket = ISSUE_BUCKETS.find((b) => b.key === key);
      const severity = highCount > 0 ? 'high' : (count >= 3 ? 'medium' : 'low');
      return { key, label: bucket?.label || key, icon: bucket?.icon || 'exclamation-circle', count, severity };
    })
    .filter((i) => i.count > 0)
    .sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
      return sevDiff !== 0 ? sevDiff : b.count - a.count;
    });

  // Build positives list
  const positives = Object.entries(positiveCounts)
    .map(([key, count]) => {
      const bucket = POSITIVE_BUCKETS.find((b) => b.key === key);
      return { key, label: bucket?.label || key, icon: bucket?.icon || 'thumbs-up', count };
    })
    .filter((p) => p.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // --- Recommendations ---
  const recommendations = [];

  const unansweredCount = reviews.filter(r => !hasReviewResponse(r) && r.hasResponse !== true).length;
  const unansweredPct = reviews.length > 0 ? unansweredCount / reviews.length : 0;

  if (unansweredCount > 0 && unansweredPct > 0.2) {
    recommendations.push({
      icon: 'reply',
      text: `Respond to ${unansweredCount} unanswered guest review${unansweredCount > 1 ? 's' : ''} — check the platform for current reply status`
    });
  }
  if (validScore(bookingClean, 10) && bookingClean < RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET) {
    recommendations.push({
      icon: 'broom',
      text: `Booking.com cleanliness score (${bookingClean.toFixed(1)}/10) is below the ${RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET} target — review the cleaning checklist`
    });
  }
  if (validScore(airbnbClean, 5) && airbnbClean < RATING_THRESHOLDS.CLEANLINESS_AIRBNB_TARGET) {
    recommendations.push({
      icon: 'broom',
      text: `Airbnb cleanliness score (${airbnbClean.toFixed(1)}/5.0) needs attention — coordinate with the cleaning team`
    });
  }
  if (issueCounts.wifi?.count >= 2) {
    recommendations.push({ icon: 'wifi', text: `WiFi issues mentioned in ${issueCounts.wifi.count} review${issueCounts.wifi.count > 1 ? 's' : ''} — consider upgrading router or checking signal coverage` });
  }
  if (issueCounts.noise?.count >= 2) {
    recommendations.push({ icon: 'volume-mute', text: `Noise complaints in ${issueCounts.noise.count} reviews — consider adding earplugs or updating the listing description` });
  }
  if (issueCounts.maintenance?.count >= 2) {
    recommendations.push({ icon: 'tools', text: `Maintenance issues flagged in ${issueCounts.maintenance.count} reviews — schedule a property inspection` });
  }
  if (issueCounts.checkin?.count >= 2) {
    recommendations.push({ icon: 'key', text: `Check-in difficulties mentioned in ${issueCounts.checkin.count} reviews — review guest arrival instructions` });
  }
  if (issueCounts.water?.count >= 2) {
    recommendations.push({ icon: 'shower', text: `Water/shower issues in ${issueCounts.water.count} reviews — check plumbing and hot water system` });
  }
  if (validScore(bookingValue, 10) && bookingValue < 8.0) {
    recommendations.push({ icon: 'tag', text: `Value-for-money score (${bookingValue.toFixed(1)}/10) is low — consider reviewing pricing or adding amenities` });
  }

  for (const [label, value, max, target] of [
    ['Booking.com staff', property.booking?.subScores?.staff, 10, 8],
    ['Airbnb communication', property.airbnb?.subScores?.communication, 5, 4],
    ['Airbnb check-in', property.airbnb?.subScores?.checkin, 5, 4]
  ]) {
    if (validScore(value, max) && value < target) recommendations.push({ icon: 'comment', text: `${label} score (${value}/${max}) is below the ${target} target — review the guest experience` });
  }

  const hasData = issues.length > 0 || positives.length > 0 || recommendations.length > 0 || hasScoreData;

  return { issues, positives, recommendations, hasData, evidence, reviewsAnalysed: reviewsWithText.length };
}
/**
 * Returns the N most recent reviews across ALL properties, each tagged
 * with `propertyName` and `propertyId` so the dashboard can render a
 * cross-portfolio "Latest Reviews" feed.
 */
export function getLatestReviewsAcrossProperties(properties = [], limit = 50) {
  if (!Array.isArray(properties) || properties.length === 0) return [];

  const all = [];
  for (const prop of properties) {
    if (isPropertyArchived(prop)) continue;
    const reviews = getAllPropertyReviews(prop);
    for (const r of reviews) {
      all.push({
        ...r,
        propertyName: prop.name || 'Unknown',
        propertyId: prop.id || ''
      });
    }
  }

  // Sort newest first
  all.sort((a, b) => {
    const parseTime = (d) => {
      if (!d) return 0;
      const s = String(d).trim();
      if (/^\d{9,13}$/.test(s)) {
        const n = Number(s);
        return n < 1e11 ? n * 1000 : n;
      }
      const clean = s.replace(/^Reviewed:\s*/i, '');
      const t = new Date(clean).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    return parseTime(b.date) - parseTime(a.date);
  });

  return all.slice(0, limit);
}

export function filterAndSortProperties(properties = [], { search = '', filter = 'all', sort = 'name-asc', includeArchived = false } = {}) {
  let list = [...properties];

  // Archive filter handling:
  // Explicit 'archived' filter shows only archived properties.
  // Otherwise, unless includeArchived is true, archived properties are excluded.
  if (filter === 'archived') {
    list = list.filter(isPropertyArchived);
  } else if (!includeArchived) {
    list = list.filter((p) => !isPropertyArchived(p));
  }

  // Search by name, location, or review comments/authors
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((p) => {
      if (p.name && p.name.toLowerCase().includes(q)) return true;
      if (p.location && p.location.toLowerCase().includes(q)) return true;
      const allReviews = getAllPropertyReviews(p);
      return allReviews.some((r) =>
        (r.author && r.author.toLowerCase().includes(q)) ||
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.comment && r.comment.toLowerCase().includes(q)) ||
        (r.positive && r.positive.toLowerCase().includes(q)) ||
        (r.negative && r.negative.toLowerCase().includes(q)) ||
        (getReviewResponse(r).toLowerCase().includes(q)) ||
        (r.country && r.country.toLowerCase().includes(q))
      );
    });
  }

  // Filters
  if (filter === 'attention') {
    list = list.filter(isAttentionNeeded);
  } else if (filter === 'airbnb') {
    list = list.filter((p) => Boolean(p.airbnb?.score));
  } else if (filter === 'booking') {
    list = list.filter((p) => Boolean(p.booking?.score));
  } else if (filter === 'cleanliness') {
    list = list.filter(p => getCleanlinessStatus(p) !== 'unrated');
  } else if (filter === 'guest-favourite') {
    list = list.filter((p) => p.airbnb?.badge === 'Guest favourite');
  }

  // Sorting
  list.sort((a, b) => {
    switch (sort) {
      case 'airbnb-desc':
        return (b.airbnb?.score || 0) - (a.airbnb?.score || 0);
      case 'booking-desc':
        return (b.booking?.score || 0) - (a.booking?.score || 0);
      case 'cleanliness-desc': {
        const cleanA = a.airbnb?.subScores?.cleanliness || (a.booking?.subScores?.cleanliness ? a.booking.subScores.cleanliness / 2 : 0);
        const cleanB = b.airbnb?.subScores?.cleanliness || (b.booking?.subScores?.cleanliness ? b.booking.subScores.cleanliness / 2 : 0);
        return cleanB - cleanA;
      }
      case 'reviews-desc': {
        const revA = (a.airbnb?.reviewCount || 0) + (a.booking?.reviewCount || 0);
        const revB = (b.airbnb?.reviewCount || 0) + (b.booking?.reviewCount || 0);
        return revB - revA;
      }
      case 'name-desc':
        return (b.name || '').localeCompare(a.name || '');
      case 'name-asc':
      default:
        return (a.name || '').localeCompare(b.name || '');
    }
  });

  return list;
}

/**
 * Compiles a portfolio-wide list of property improvement opportunities and recommendations.
 * Groups findings per property and calculates cross-portfolio category tallies for filtering.
 */
export function getAllPropertyImprovements(properties = [], { category = 'all', search = '', includeArchived = false } = {}) {
  const activeProps = (Array.isArray(properties) ? properties : []).filter((p) => {
    if (!includeArchived && isPropertyArchived(p)) return false;
    return true;
  });

  const categoryCounts = {};
  const allPropertiesWithImprovements = [];
  const allClear = [];
  const unrated = [];

  for (const prop of activeProps) {
    const insights = analysePropertyInsights(prop);
    const reviews = getAllPropertyReviews(prop);
    const unansweredCount = reviews.filter((r) => !hasReviewResponse(r)).length;
    const attentionNeeded = isAttentionNeeded(prop);

    // Extract recent negative feedback snippets
    const guestFeedback = [];
    for (const r of reviews) {
      const neg = (r.negative || '').trim();
      const comment = (r.comment || '').trim();
      const isLowScore = reviewNeedsAttention(r);

      if (neg) {
        guestFeedback.push({
          author: r.author || 'Guest',
          date: r.date,
          platform: r.platform || 'OTA',
          score: r.score,
          text: neg,
          isNegativeField: true
        });
      } else if (isLowScore && comment) {
        guestFeedback.push({
          author: r.author || 'Guest',
          date: r.date,
          platform: r.platform || 'OTA',
          score: r.score,
          text: comment,
          isNegativeField: false
        });
      }
      if (guestFeedback.length >= 3) break;
    }

    const hasIssues = insights.issues.length > 0;
    const hasRecs = insights.recommendations.length > 0;
    const hasData = insights.hasData || reviews.length > 0 || prop.booking?.score != null || prop.airbnb?.score != null;

    if (!hasData) {
      unrated.push(prop);
      continue;
    }

    const needsImprovement = hasIssues || hasRecs || attentionNeeded;

    if (!needsImprovement) {
      allClear.push({
        property: prop,
        insights,
        totalReviews: reviews.length
      });
      continue;
    }

    // Determine overall urgency severity
    let severity = 'low';
    const hasHighIssue = insights.issues.some((i) => i.severity === 'high');
    const hasMedIssue = insights.issues.some((i) => i.severity === 'medium');

    if (attentionNeeded || hasHighIssue) {
      severity = 'high';
    } else if (hasMedIssue || unansweredCount >= 3) {
      severity = 'medium';
    }

    // Tally issue categories across the portfolio
    const touchedCategories = new Set();
    for (const issue of insights.issues) {
      touchedCategories.add(issue.key);
    }
    for (const catKey of touchedCategories) {
      categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
    }

    allPropertiesWithImprovements.push({
      property: prop,
      severity,
      insights,
      guestFeedback,
      unansweredCount,
      attentionNeeded,
      totalReviews: reviews.length
    });
  }

  // Sort with most critical first
  const sevWeight = { high: 0, medium: 1, low: 2 };
  allPropertiesWithImprovements.sort((a, b) => {
    const sevDiff = sevWeight[a.severity] - sevWeight[b.severity];
    if (sevDiff !== 0) return sevDiff;
    const countA = a.insights.issues.length + a.insights.recommendations.length;
    const countB = b.insights.issues.length + b.insights.recommendations.length;
    if (countB !== countA) return countB - countA;
    return (a.property.name || '').localeCompare(b.property.name || '');
  });

  const totalWithIssues = allPropertiesWithImprovements.length;
  const totalAllClear = allClear.length;

  // Filter by category and search
  let filtered = allPropertiesWithImprovements;

  if (category && category !== 'all') {
    filtered = filtered.filter((item) => {
      return item.insights.issues.some((issue) => issue.key === category);
    });
  }

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((item) => {
      const prop = item.property;
      if (prop.name && prop.name.toLowerCase().includes(q)) return true;
      if (prop.location && prop.location.toLowerCase().includes(q)) return true;
      if (item.insights.issues.some((i) => i.label.toLowerCase().includes(q))) return true;
      if (item.insights.recommendations.some((r) => r.text.toLowerCase().includes(q))) return true;
      if (item.guestFeedback.some((f) => f.text.toLowerCase().includes(q))) return true;
      return false;
    });
  }

  return {
    items: filtered,
    allClear,
    unrated,
    categoryCounts,
    totalWithIssues,
    totalAllClear
  };
}
