/**
 * Pure utility functions for the Reviews & Ratings module.
 */

export const RATING_THRESHOLDS = Object.freeze({
  AIRBNB_TARGET: 4.8,
  AIRBNB_ALERT: 4.6,
  BOOKING_TARGET: 9.0,
  BOOKING_ALERT: 8.5,
  CLEANLINESS_AIRBNB_TARGET: 4.8,
  CLEANLINESS_BOOKING_TARGET: 9.0
});

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

  if (typeof airbnbClean === 'number') {
    if (airbnbClean < RATING_THRESHOLDS.CLEANLINESS_AIRBNB_TARGET) isAlert = true;
    else if (airbnbClean >= 4.9) isGood = true;
  }

  if (typeof bookingClean === 'number') {
    if (bookingClean < RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET) isAlert = true;
    else if (bookingClean >= 9.5) isGood = true;
  }

  if (isAlert) return 'alert';
  if (isGood) return 'excellent';
  if (typeof airbnbClean === 'number' || typeof bookingClean === 'number') return 'good';
  return 'unrated';
}

export function isAttentionNeeded(property) {
  const airbnbScore = property?.airbnb?.score;
  const bookingScore = property?.booking?.score;
  const cleanliness = getCleanlinessStatus(property);

  if (cleanliness === 'alert') return true;
  if (typeof airbnbScore === 'number' && airbnbScore < RATING_THRESHOLDS.AIRBNB_ALERT) return true;
  if (typeof bookingScore === 'number' && bookingScore < RATING_THRESHOLDS.BOOKING_ALERT) return true;
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
  const activeProperties = (Array.isArray(properties) ? properties : []).filter((p) => !isPropertyArchived(p));
  if (activeProperties.length === 0) {
    return {
      totalProperties: 0,
      airbnbAvg: null,
      bookingAvg: null,
      cleanlinessAvgAirbnb: null,
      cleanlinessAvgBooking: null,
      totalReviews: 0,
      attentionNeededCount: 0
    };
  }

  let airbnbTotal = 0;
  let airbnbCount = 0;
  let bookingTotal = 0;
  let bookingCount = 0;

  let cleanAirbnbTotal = 0;
  let cleanAirbnbCount = 0;
  let cleanBookingTotal = 0;
  let cleanBookingCount = 0;

  let totalReviews = 0;
  let attentionCount = 0;

  activeProperties.forEach((p) => {
    if (p.airbnb?.score) {
      airbnbTotal += p.airbnb.score;
      airbnbCount += 1;
    }
    if (p.airbnb?.reviewCount) {
      totalReviews += p.airbnb.reviewCount;
    }
    if (p.airbnb?.subScores?.cleanliness) {
      cleanAirbnbTotal += p.airbnb.subScores.cleanliness;
      cleanAirbnbCount += 1;
    }

    if (p.booking?.score) {
      bookingTotal += p.booking.score;
      bookingCount += 1;
    }
    if (p.booking?.reviewCount) {
      totalReviews += p.booking.reviewCount;
    }
    if (p.booking?.subScores?.cleanliness) {
      cleanBookingTotal += p.booking.subScores.cleanliness;
      cleanBookingCount += 1;
    }

    if (isAttentionNeeded(p)) {
      attentionCount += 1;
    }
  });

  return {
    totalProperties: activeProperties.length,
    airbnbAvg: airbnbCount > 0 ? round(airbnbTotal / airbnbCount, 2) : null,
    bookingAvg: bookingCount > 0 ? round(bookingTotal / bookingCount, 2) : null,
    cleanlinessAvgAirbnb: cleanAirbnbCount > 0 ? round(cleanAirbnbTotal / cleanAirbnbCount, 2) : null,
    cleanlinessAvgBooking: cleanBookingCount > 0 ? round(cleanBookingTotal / cleanBookingCount, 2) : null,
    totalReviews,
    attentionNeededCount: attentionCount
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
  const response = review.response
    ?? review.hostResponse
    ?? review.propertyResponse
    ?? review.reply
    ?? review.answer
    ?? '';
  return typeof response === 'string' ? response.trim() : '';
}

export function hasReviewResponse(review) {
  return getReviewResponse(review).length > 0;
}

export function filterPropertyReviews(reviews = [], { platform = 'all', filter = 'all', search = '' } = {}) {
  let list = [...reviews];

  if (platform !== 'all') {
    const platLow = platform.toLowerCase();
    list = list.filter((r) => (r.platform || '').toLowerCase().includes(platLow));
  }

  if (filter === 'positive') {
    list = list.filter((r) => {
      if (r.platform === 'Airbnb') return (r.score || 0) >= 4.8;
      return (r.score || 0) >= 9.0;
    });
  } else if (filter === 'attention') {
    list = list.filter((r) => {
      if (r.platform === 'Airbnb') {
        return (r.score || 5) < 4.7 || (r.cleanlinessScore && r.cleanlinessScore < 4.8);
      }
      return (r.score || 10) < 8.5 || (r.cleanlinessScore && r.cleanlinessScore < 9.0);
    });
  } else if (filter === 'answered') {
    list = list.filter(hasReviewResponse);
  } else if (filter === 'unanswered') {
    list = list.filter((r) => !hasReviewResponse(r));
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((r) =>
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

const ISSUE_BUCKETS = [
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

  // Need score data OR at least 2 reviews with text
  if (!hasScoreData && reviewsWithText.length < 2) {
    return { issues: [], positives: [], recommendations: [], hasData: false };
  }

  // --- Issue counting from review text ---
  const issueCounts = {};  // key -> { count, highCount }
  const positiveCounts = {}; // key -> count

  for (const review of reviews) {
    const negText = [review.negative || '', review.comment || ''].join(' ');
    const posText = [review.positive || '', review.comment || '', review.title || ''].join(' ');
    const isAirbnb = review.platform === 'Airbnb';
    const isLowScore = typeof review.score === 'number' &&
      ((isAirbnb && review.score < 3.5) || (!isAirbnb && review.score < 7));

    if (negText.trim()) {
      const matched = matchesBuckets(negText, ISSUE_BUCKETS);
      for (const [key, cnt] of Object.entries(matched)) {
        if (!issueCounts[key]) issueCounts[key] = { count: 0, highCount: 0 };
        issueCounts[key].count += cnt;
        if (isLowScore) issueCounts[key].highCount += cnt;
      }
    }

    if (posText.trim()) {
      const matched = matchesBuckets(posText, POSITIVE_BUCKETS);
      for (const [key, cnt] of Object.entries(matched)) {
        positiveCounts[key] = (positiveCounts[key] || 0) + cnt;
      }
    }
  }

  // --- Score-based issue detection (from sub-scores) ---
  const bookingClean = property.booking?.subScores?.cleanliness;
  const airbnbClean = property.airbnb?.subScores?.cleanliness;
  const bookingValue = property.booking?.subScores?.value;
  const bookingStaff = property.booking?.subScores?.staff;
  const airbnbCheckin = property.airbnb?.subScores?.checkin;
  const airbnbComm = property.airbnb?.subScores?.communication;

  if (typeof bookingClean === 'number' && bookingClean < 8.5) {
    if (!issueCounts.cleanliness) issueCounts.cleanliness = { count: 0, highCount: 0 };
    issueCounts.cleanliness.count += 1;
    if (bookingClean < 7.5) issueCounts.cleanliness.highCount += 1;
  }
  if (typeof airbnbClean === 'number' && airbnbClean < 4.0) {
    if (!issueCounts.cleanliness) issueCounts.cleanliness = { count: 0, highCount: 0 };
    issueCounts.cleanliness.count += 1;
    if (airbnbClean < 3.5) issueCounts.cleanliness.highCount += 1;
  }
  if (typeof bookingValue === 'number' && bookingValue < 8.0) {
    if (!issueCounts.value) issueCounts.value = { count: 0, highCount: 0 };
    issueCounts.value.count += 1;
  }
  if ((typeof bookingStaff === 'number' && bookingStaff < 8.0) ||
      (typeof airbnbComm === 'number' && airbnbComm < 4.0)) {
    if (!issueCounts.host) issueCounts.host = { count: 0, highCount: 0 };
    issueCounts.host.count += 1;
  }
  if (typeof airbnbCheckin === 'number' && airbnbCheckin < 4.0) {
    if (!issueCounts.checkin) issueCounts.checkin = { count: 0, highCount: 0 };
    issueCounts.checkin.count += 1;
  }

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

  const unansweredCount = reviews.filter((r) => {
    const resp = r.response ?? r.hostResponse ?? r.reply ?? '';
    return !resp || !String(resp).trim();
  }).length;
  const unansweredPct = reviews.length > 0 ? unansweredCount / reviews.length : 0;

  if (unansweredCount > 0 && unansweredPct > 0.2) {
    recommendations.push({
      icon: 'reply',
      text: `Respond to ${unansweredCount} unanswered guest review${unansweredCount > 1 ? 's' : ''} — host replies improve future bookings`
    });
  }
  if (typeof bookingClean === 'number' && bookingClean < 8.5) {
    recommendations.push({
      icon: 'broom',
      text: `Booking.com cleanliness score (${bookingClean.toFixed(1)}/10) is below the 8.5 target — review the cleaning checklist`
    });
  }
  if (typeof airbnbClean === 'number' && airbnbClean < 4.0) {
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
  if (typeof bookingValue === 'number' && bookingValue < 8.0) {
    recommendations.push({ icon: 'tag', text: `Value-for-money score (${bookingValue.toFixed(1)}/10) is low — consider reviewing pricing or adding amenities` });
  }

  const hasData = issues.length > 0 || positives.length > 0 || recommendations.length > 0 || hasScoreData;

  return { issues, positives, recommendations, hasData, reviewsAnalysed: reviewsWithText.length };
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
