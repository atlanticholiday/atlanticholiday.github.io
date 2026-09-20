// Shared by the browser and the collection script. No DOM or network dependencies.
export const RATING_THRESHOLDS = Object.freeze({
  AIRBNB_TARGET: 4.8, AIRBNB_ALERT: 4.6,
  BOOKING_TARGET: 9, BOOKING_ALERT: 8.5,
  CLEANLINESS_AIRBNB_TARGET: 4.8, CLEANLINESS_BOOKING_TARGET: 9,
  STALE_DAYS: 14, RECENT_DAYS: 90
});

export function reviewTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().replace(/^Reviewed:\s*/i, '');
  const time = /^\d{9,13}$/.test(text)
    ? Number(text) * (Number(text) < 1e11 ? 1000 : 1)
    : Date.parse(text);
  return Number.isFinite(time) ? time : null;
}

export function validScore(value, max) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
}

export function reviewNeedsAttention(review) {
  const airbnb = review.platform === 'Airbnb';
  const max = airbnb ? 5 : 10;
  return (validScore(review.score, max) && review.score < (airbnb ? RATING_THRESHOLDS.AIRBNB_ALERT : RATING_THRESHOLDS.BOOKING_ALERT))
    || (validScore(review.cleanlinessScore, max) && review.cleanlinessScore < (airbnb ? RATING_THRESHOLDS.CLEANLINESS_AIRBNB_TARGET : RATING_THRESHOLDS.CLEANLINESS_BOOKING_TARGET));
}

const normalize = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const TOPICS = {
  cleanliness: /\b(clean\w*|dirty|dirt|dust\w*|stain\w*|smell\w*|mou?ld|cockroach\w*|bugs?|ants?|hair|hygiene|filth\w*|limp\w*|suj\w*|poeira|bolor|mofo|propre\w*|sale|salete|suci\w*|schmutzig|sauber)\b/,
  noise: /\b(nois\w*|loud|traffic|barking|barulho|ruido\w*|bruit\w*|larm|laut)\b/,
  wifi: /\b(wi-?fi|internet|connection|connectivity|rede|conexao|connexion|wlan)\b/,
  water: /\b(shower|water|pressure|leak\w*|plumb\w*|tap|faucet|chuveiro|agua|pressao|douche|eau|ducha|wasser|dusche)\b/,
  beds: /\b(bed\w*|mattress|pillow\w*|sofa|couch|cama\w*|colchao|almofada\w*|lit|matelas|bett|matratze)\b/,
  kitchen: /\b(kitchen|oven|microwave|fridge|utensil\w*|cutlery|dishwasher|kettle|toaster|cozinha|fogao|frigorifico|cuisine|cocina|kuche)\b/,
  parking: /\b(park\w*|garage|estacionamento|aparcamiento)\b/,
  checkin: /\b(check.in|checkin|lockbox|access code|key collection|door code|entrada|chave\w*|acesso|arrivee)\b/,
  ac: /\b(air con\w*|aircon|air conditioning|a\/c|heating|heater|ar condicionado|aquecimento|climatisation|chauffage|heizung)\b/,
  description: /\b(mislead\w*|not as described|inaccurate|false advertising|descricao|enganos\w*|description|anuncio)\b/,
  location: /\b(location|remote|steep hill|long walk|far from|localizacao|longe|localisation|ubicacion)\b/,
  host: /\b(host|communication|response|reply|unresponsive|ignored|anfitriao|comunicacao|resposta|comunicacion)\b/,
  space: /\b(space|small|tiny|cramped|espaco|pequen\w*|exigu|espace)\b/,
  maintenance: /\b(broken|malfunction\w*|repair|damage\w*|cracked|faulty|out of order|partid\w*|avariad\w*|estragad\w*|cass\w*|roto|kaputt)\b/
};
const NEGATIVE = /\b(dirty|dusty|stain\w*|smelly|mou?ld|cockroach\w*|filthy|noisy|loud|slow|disconnect\w*|broken|uncomfortable|hard|lumpy|leak\w*|cold|poor|bad|terrible|difficult|cramped|tiny|mislead\w*|inaccurate|unresponsive|ignored|faulty|damage\w*|cracked|missing|not working|no (?:hot water|internet|wifi|heating)|didn't (?:work|reply)|not (?:clean|comfortable|respond|as described)|too (?:small|hot|cold)|far from|suj\w*|poeira|bolor|mofo|barulh\w*|lent\w*|avariad\w*|partid\w*|desconfortavel|fria|frio|mau|ruim|sem (?:agua|internet|wifi)|nao (?:funciona\w*|responde\w*)|sale|salete|bruyant\w*|froid\w*|cass\w*|pas (?:propre|fonctionnel)|suci\w*|ruid\w*|roto|schmutzig|kaputt|laut)\b/;
const POSITIVE = /\b(clean|spotless\w*|immaculate|comfortable|excellent|great|perfect|quiet|fast|good|lovely|limp\w*|confortavel|excelente|otimo|bom|boa|tranquilo|rapido|propre|confortable|calme|parfait|limpio|sauber|ruhig)\b/;
const NEGATED_COMPLAINT = /\b(?:no|not|without|sem|nenhum|nenhuma|nao|sans|aucun|aucune|pas de|sin|kein|keine)\s+(?:(?:any|nenhum|nenhuma)\s+)?(?:noise|noisy|dirt|dirty|dust|mou?ld|problems?|issues?|barulho|ruido|poeira|problemas?|bruit|salete|problemes?|larm)\b/g;

function evidenceId(review, category, text) {
  // Stable across import order; changed text gets a fresh decision.
  const identity = [review.platform, review.sourceId || review.id || `${review.author}|${review.date}`, category, normalize(text)].join('|');
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `finding-${(hash >>> 0).toString(36)}`;
}

export function classifyReviewIssues(review, decisions = {}) {
  const findings = new Map();
  for (const field of ['negative', 'comment']) {
    const text = String(review[field] || '');
    // Contrast and sentence boundaries keep praise from lending sentiment to unrelated topics.
    for (const passage of text.split(/[.!?;,\n]+|\b(?:but|however|although|mas|porem|mais|pero|aber|and|et|und|e|y)\b/i)) {
      const original = normalize(passage);
      const normalized = original.replace(NEGATED_COMPLAINT, '');
      if (normalized !== original && !NEGATIVE.test(normalized)) continue;
      if (!normalized.trim()) continue;
      const negative = NEGATIVE.test(normalized);
      if (!negative && POSITIVE.test(normalized)) continue;
      for (const [category, pattern] of Object.entries(TOPICS)) {
        if (!pattern.test(normalized)) continue;
        const excerpt = passage.trim();
        const key = evidenceId(review, category, excerpt);
        const decision = decisions[key] || 'pending';
        const finding = { key, category, excerpt, reviewId: review.id || '', sourceId: review.sourceId || '',
          platform: review.platform, date: review.date || null, author: review.author || 'Guest',
          confidence: negative ? 'high' : 'uncertain', decision, lowScore: reviewNeedsAttention(review) };
        const previous = findings.get(category);
        if (!previous || (previous.confidence !== 'high' && negative)) findings.set(category, finding);
      }
    }
  }
  return [...findings.values()];
}

export function platformHealth(property, platform, now = Date.now()) {
  const data = property[platform];
  const lastSuccess = data?.lastSuccessAt || (data?.status === 'success' ? data.lastChecked : null);
  const time = reviewTime(lastSuccess);
  let status = 'current';
  if (!property[`${platform}Url`] && !data) status = 'unlinked';
  else if (data?.status === 'error') status = 'failed';
  else if (time === null || time > now || !validScore(data?.score, platform === 'airbnb' ? 5 : 10)) status = 'unknown';
  else if (now - time > RATING_THRESHOLDS.STALE_DAYS * 86400000) status = 'stale';
  return { platform, status, lastSuccess: time === null ? null : lastSuccess,
    lastAttempt: data?.lastChecked || null, reviewsCollectedAt: data?.reviewsCollectedAt || null };
}

export function platformMetrics(properties, platform, getReviews) {
  const max = platform === 'airbnb' ? 5 : 10;
  const label = platform === 'airbnb' ? 'Airbnb' : 'Booking.com';
  const rated = properties.filter(p => validScore(p[platform]?.score, max));
  const weighted = rated.filter(p => Number.isFinite(p[platform]?.reviewCount) && p[platform].reviewCount > 0);
  const denominator = weighted.reduce((sum, p) => sum + p[platform].reviewCount, 0);
  const clean = properties.filter(p => validScore(p[platform]?.subScores?.cleanliness, max));
  const counts = properties.filter(p => Number.isFinite(p[platform]?.reviewCount) && p[platform].reviewCount >= 0);
  const records = properties.flatMap(getReviews).filter(r => r.platform === label && r.origin !== 'manual');
  const mean = (list, field) => list.length ? Math.round(list.reduce((sum, p) => sum + field(p), 0) / list.length * 100) / 100 : null;
  return {
    average: mean(rated, p => p[platform].score), properties: rated.length,
    weightedAverage: denominator ? Math.round(weighted.reduce((sum, p) => sum + p[platform].score * p[platform].reviewCount, 0) / denominator * 100) / 100 : null,
    weightedProperties: weighted.length, weightReviews: denominator,
    cleanliness: mean(clean, p => p[platform].subScores.cleanliness), cleanlinessProperties: clean.length,
    platformReviews: counts.reduce((sum, p) => sum + p[platform].reviewCount, 0), countsKnown: counts.length,
    importedReviews: records.length, unknownDates: records.filter(r => reviewTime(r.date) === null).length
  };
}

// Preserve the last successful values after a failed attempt, and record only actual observations.
export function mergeCollectedPlatform(previous = {}, result, fetchReviews = false) {
  previous ||= {};
  const history = [...(previous.ratingHistory || [])];
  const addSnapshot = (data) => {
    const at = data.lastSuccessAt || (data.status === 'success' ? data.lastChecked : null);
    if (reviewTime(at) === null || !validScore(data.score, 10) || history.some(h => h.at === at)) return;
    history.push({ at, score: data.score, reviewCount: Number.isFinite(data.reviewCount) ? data.reviewCount : null,
      cleanliness: data.subScores?.cleanliness ?? null });
  };
  addSnapshot(previous);
  if (result.status === 'success') addSnapshot(result);
  history.sort((a, b) => reviewTime(a.at) - reviewTime(b.at));
  return {
    ...previous, ...result,
    ...(result.status !== 'success' ? { score: previous.score ?? null, reviewCount: previous.reviewCount ?? null, subScores: previous.subScores || {} } : {}),
    lastSuccessAt: result.status === 'success' ? result.lastChecked : previous.lastSuccessAt || (previous.status === 'success' ? previous.lastChecked : null) || null,
    reviewsCollectedAt: result.status === 'success' && fetchReviews ? result.lastChecked : previous.reviewsCollectedAt || null,
    reviews: result.status === 'success' && fetchReviews ? result.reviews || [] : previous.reviews || [],
    ratingHistory: history
  };
}
