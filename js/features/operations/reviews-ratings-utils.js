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

export function calculatePortfolioSummary(properties = []) {
  if (!Array.isArray(properties) || properties.length === 0) {
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

  properties.forEach((p) => {
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
    totalProperties: properties.length,
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
  const reviews = [];

  if (Array.isArray(property.reviews)) {
    reviews.push(...property.reviews);
  }
  if (Array.isArray(property.booking?.reviews)) {
    property.booking.reviews.forEach((r) => {
      reviews.push({ ...r, platform: r.platform || 'Booking.com' });
    });
  }
  if (Array.isArray(property.airbnb?.reviews)) {
    property.airbnb.reviews.forEach((r) => {
      reviews.push({ ...r, platform: r.platform || 'Airbnb' });
    });
  }

  // Deduplicate by ID if present
  const seen = new Set();
  const unique = [];
  for (const r of reviews) {
    const key = r.id || `${r.platform}-${r.author}-${r.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }

  // Sort by date descending (newest first)
  unique.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return unique;
}

export function getLatestReviewSnippet(property) {
  const reviews = getAllPropertyReviews(property);
  return reviews.length > 0 ? reviews[0] : null;
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
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter((r) =>
      (r.author && r.author.toLowerCase().includes(q)) ||
      (r.title && r.title.toLowerCase().includes(q)) ||
      (r.comment && r.comment.toLowerCase().includes(q)) ||
      (r.positive && r.positive.toLowerCase().includes(q)) ||
      (r.negative && r.negative.toLowerCase().includes(q)) ||
      (r.country && r.country.toLowerCase().includes(q))
    );
  }

  return list;
}

export function filterAndSortProperties(properties = [], { search = '', filter = 'all', sort = 'name-asc' } = {}) {
  let list = [...properties];

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

