export function stripReviewHtml(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstDefined(object, paths) {
  for (const path of paths) {
    let value = object;
    for (const key of path.split(".")) value = value?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function stableId(platform, sourceId, author, date, comment) {
  if (sourceId !== null && sourceId !== undefined && String(sourceId).trim()) {
    return `${platform.toLowerCase()}-${String(sourceId).trim()}`;
  }
  const seed = [platform, author, date, comment].join("|");
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${platform.toLowerCase()}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeAirbnbReview(review = {}) {
  const localized = review.localizedCommentV2 || review.localizedReview || {};
  const author = stripReviewHtml(firstDefined(review, ["reviewer.firstName", "reviewer.hostName", "author"]) || "Guest");
  const comment = stripReviewHtml(firstDefined(review, ["comments", "commentV2", "comment", "localizedCommentV2.comments", "localizedReview.comments"]) || "");
  const response = stripReviewHtml(firstDefined(review, ["response", "localizedCommentV2.response", "localizedReview.response"]) || "");
  const date = String(firstDefined(review, ["createdAt", "date"]) || "");

  return {
    id: stableId("airbnb", review.id, author, date, comment),
    sourceId: review.id ? String(review.id) : "",
    platform: "Airbnb",
    author,
    country: stripReviewHtml(firstDefined(review, ["reviewer.location", "country"]) || ""),
    date,
    localizedDate: stripReviewHtml(review.localizedDate || ""),
    score: numberOrNull(firstDefined(review, ["rating", "score"])),
    maxScore: 5,
    title: stripReviewHtml(review.reviewHighlight || ""),
    comment,
    language: String(review.language || localized.commentsLanguage || ""),
    response,
    responseAuthor: stripReviewHtml(firstDefined(review, ["responder.hostName", "responder.firstName"]) || ""),
    responseDate: stripReviewHtml(review.localizedRespondedDate || ""),
    hasResponse: Boolean(response)
  };
}

export function normalizeBookingReview(review = {}) {
  const author = stripReviewHtml(firstDefined(review, [
    "guestDetails.username", "reviewer.name", "reviewerName", "guestName", "author.name", "author"
  ]) || "Guest");
  const comment = stripReviewHtml(firstDefined(review, [
    "text", "reviewText", "comment", "content", "body", "description"
  ]) || "");
  const positive = stripReviewHtml(firstDefined(review, [
    "textDetails.positiveText", "pros", "positive", "positiveText", "likedText", "reviewerReviewContent.pros"
  ]) || "");
  const negative = stripReviewHtml(firstDefined(review, [
    "textDetails.negativeText", "cons", "negative", "negativeText", "dislikedText", "reviewerReviewContent.cons"
  ]) || "");
  const response = stripReviewHtml(firstDefined(review, [
    "partnerReply.reply", "response.text", "ownerResponse.text", "reply.text", "answer.text",
    "response", "reply", "answer", "hotelResponse", "propertyResponse"
  ]) || "");
  const date = String(firstDefined(review, [
    "reviewedDate", "date", "reviewDate", "createdAt", "dateOfReview", "stayDate"
  ]) || "");
  const sourceId = firstDefined(review, ["id", "reviewId", "reviewUrl", "url"]);

  return {
    id: stableId("booking", sourceId, author, date, `${positive}|${negative}|${comment}`),
    sourceId: sourceId ? String(sourceId) : "",
    platform: "Booking.com",
    author,
    country: stripReviewHtml(firstDefined(review, [
      "guestDetails.countryName", "reviewer.countryName", "reviewer.country", "countryName", "country"
    ]) || ""),
    date,
    score: numberOrNull(firstDefined(review, ["reviewScore", "score", "rating"])),
    maxScore: 10,
    title: stripReviewHtml(firstDefined(review, ["textDetails.title", "title", "headline", "reviewTitle"]) || ""),
    comment,
    positive,
    negative,
    response,
    responseAuthor: stripReviewHtml(firstDefined(review, ["responseAuthor", "ownerResponse.author"]) || ""),
    responseDate: stripReviewHtml(firstDefined(review, ["responseDate", "ownerResponse.date"]) || ""),
    hasResponse: Boolean(response)
  };
}

export function findBookingReviewObjects(payload) {
  const candidates = [];
  const seen = new Set();

  function visit(value, parentKey = "") {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      if (/review/i.test(parentKey)) {
        value.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item)) candidates.push(item);
        });
      }
      value.forEach((item) => visit(item, parentKey));
      return;
    }

    Object.entries(value).forEach(([key, child]) => visit(child, key));
  }

  visit(payload);
  return candidates.filter((item) => {
    const keys = Object.keys(item).join(" ");
    return /(reviewUrl|reviewId|reviewer|reviewText|positive|negative|pros|cons|score|rating)/i.test(keys);
  });
}

export function mergeReviews(...groups) {
  const byId = new Map();
  groups.flat().filter(Boolean).forEach((review) => {
    const key = review.id || `${review.platform}|${review.author}|${review.date}|${review.comment || review.positive || ""}`;
    const existing = byId.get(key);
    byId.set(key, existing ? { ...existing, ...review } : review);
  });
  return [...byId.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
