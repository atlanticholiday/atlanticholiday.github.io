import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  findBookingReviewObjects,
  mergeReviews,
  normalizeAirbnbReview,
  normalizeBookingReview,
  stripReviewHtml
} from "./review-scraper-utils.js";

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.PMS_BROWSER_PATH,
  process.env.AIRBNB_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const DEFAULT_OUTPUT_FILE = path.resolve("server-data", "property-reviews.json");

// Default initial properties seeded with the verified links
const DEFAULT_SEED_PROPERTIES = [
  {
    id: "funchal-essence",
    name: "Funchal Essence",
    location: "Funchal",
    bookingUrl: "https://www.booking.com/Share-1C9oRtC",
    airbnbUrl: "https://www.airbnb.com/rooms/1309575642223826130?guests=1&adults=1"
  },
  {
    id: "villa-de-la-ponte",
    name: "Villa de la Ponte",
    location: "Arco da Calheta",
    bookingUrl: "https://www.booking.com/Share-F4c5fMH",
    airbnbUrl: "https://www.airbnb.com/rooms/595401506743251467?guests=1&adults=1"
  }
];

function resolveBrowserExecutable(preferredPath) {
  const candidates = preferredPath ? [preferredPath] : DEFAULT_BROWSER_CANDIDATES;
  const resolved = candidates.find((c) => c && fs.existsSync(c));
  if (!resolved) {
    throw new Error("No supported Chromium browser (Edge or Chrome) found.");
  }
  return resolved;
}

function parseCommandLine(argv) {
  const options = {
    output: DEFAULT_OUTPUT_FILE,
    headless: true,
    browserPath: "",
    propertyFilter: "",
    limit: 0,
    fetchReviews: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const [key, inlineValue] = token.startsWith("--") ? token.split("=", 2) : [token, undefined];
    const nextValue = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined;

    switch (key) {
      case "--output":
        options.output = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--browser-path":
        options.browserPath = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--property":
        options.propertyFilter = String(nextValue || "").trim().toLowerCase();
        if (consumeNext) i += 1;
        break;
      case "--limit":
        options.limit = parseInt(nextValue, 10) || 0;
        if (consumeNext) i += 1;
        break;
      case "--fetch-reviews":
      case "--reviews":
        options.fetchReviews = true;
        break;
      case "--no-headless":
        options.headless = false;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Atlantic Holiday - Property Reviews & Ratings Scraper

Usage:
  node scripts/reviews/sync-reviews.mjs [options]

Options:
  --output PATH         Path to save output JSON (default: server-data/property-reviews.json)
  --property NAME       Sync only a specific property by name or ID
  --fetch-reviews       Fetch every available guest review and host response
  --no-headless         Show the browser window while running
  --dry-run             List targets without scraping
  --browser-path PATH   Custom path to Edge or Chrome executable
  --help, -h            Show this help message
`);
}

function requestHeadersForReplay(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !name.startsWith(":") && !["content-length", "cookie", "host"].includes(name.toLowerCase()))
  );
}

function normalizeBookingPayloads(payloads = []) {
  const reviews = payloads.flatMap((payload) => findBookingReviewObjects(payload))
    .map(normalizeBookingReview)
    .filter((review) => review.author !== "Guest" || review.comment || review.positive || review.negative);
  return mergeReviews(reviews);
}

async function extractBookingReviewsFromDom(page) {
  const reviewCards = page.locator('[data-testid="review-card"], .review_list_new_item_block, .review_item');
  const reviewCardCount = await reviewCards.count();
  for (let index = 0; index < reviewCardCount; index += 1) {
    await reviewCards.nth(index).scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(75);
  }

  const rawReviews = await reviewCards.evaluateAll((cards) => cards.map((card) => {
    const text = (selector) => card.querySelector(selector)?.textContent?.trim() || "";
    const attr = (selector, name) => card.querySelector(selector)?.getAttribute(name) || "";
    return {
      reviewId: card.getAttribute("data-review-id") || card.id || "",
      reviewerName: text('[data-testid="reviewer-name"], [data-testid="review-avatar"] h3, [data-testid="review-avatar"] h4, [data-testid="reviewer-avatar"] + div h3, .bui-avatar-block__title, .reviewer_name'),
      countryName: attr('[data-testid="reviewer-country"] img, .reviewer_country_flag', "alt") || text('[data-testid="reviewer-country"], .reviewer_country'),
      reviewDate: text('[data-testid="review-date"], .review_item_date'),
      reviewScore: text('[data-testid="review-score"], .review-score-badge, .review-score-badge__score'),
      title: text('[data-testid="review-title"], .review_item_header_content'),
      positiveText: text('[data-testid="review-positive-text"], .review_pos'),
      negativeText: text('[data-testid="review-negative-text"], .review_neg'),
      reviewText: text('[data-testid="review-comment"], [data-testid="review-text"], .review_item_review_content'),
      propertyResponse: text('[data-testid*="response"], [data-testid*="reply"], .review_item_response, .c-review-block__response')
    };
  })).catch(() => []);

  const featured = await page.locator('[data-testid="featuredreview"]').evaluateAll((cards) => cards.map((card) => ({
    reviewerName: card.querySelector('[data-testid="featuredreview-avatar"] h4')?.textContent?.trim() || "",
    countryName: card.querySelector('[data-testid="featuredreview-avatar"] img')?.getAttribute("alt") || "",
    reviewText: card.querySelector('[data-testid="featuredreview-text"] blockquote')?.textContent?.replace(/^\s*["“]|["”]\s*$/g, "").trim() || ""
  }))).catch(() => []);

  const normalizedCards = rawReviews.map(normalizeBookingReview)
    .filter((review) => review.author !== "Guest" || review.comment || review.positive || review.negative);
  const normalizedFeatured = featured.map(normalizeBookingReview)
    .filter((review) => review.author !== "Guest" || review.comment);

  // Featured cards repeat reviews from the full list and do not carry stable
  // source IDs. Use them only when Booking does not expose the full list.
  return mergeReviews(normalizedCards.length ? normalizedCards : normalizedFeatured);
}

async function fetchBookingReviews(page, expectedCount = 0) {
  const payloads = [];
  let replayRequest = null;

  const captureReviewResponse = async (response) => {
    const request = response.request();
    if (!request.url().includes("/dml/graphql") || !/ReviewList/i.test(request.postData() || "")) return;
    try {
      const payload = await response.json();
      const reviews = normalizeBookingPayloads([payload]);
      if (reviews.length) {
        payloads.push(payload);
        replayRequest = request;
      }
    } catch {}
  };

  page.on("response", captureReviewResponse);
  try {
    await page.locator('#onetrust-reject-all-handler, #onetrust-accept-btn-handler').first().click({ timeout: 1500 }).catch(() => {});
    const openReviews = page.locator('[data-testid="review-score-read-all-actionable"], [data-testid="fr-read-all-reviews"]').first();
    if (await openReviews.count()) {
      await openReviews.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3500);
    }

    let reviews = mergeReviews(normalizeBookingPayloads(payloads), await extractBookingReviewsFromDom(page));

    if (replayRequest && expectedCount > reviews.length) {
      const body = replayRequest.postDataJSON();
      const pageSize = Number(body?.variables?.input?.limit) || 10;
      const headers = requestHeadersForReplay(await replayRequest.allHeaders());
      let skip = pageSize;

      while (skip < expectedCount) {
        const nextBody = structuredClone(body);
        nextBody.variables.input.skip = skip;
        const response = await page.request.post(replayRequest.url(), { headers, data: nextBody });
        if (!response.ok()) break;
        const payload = await response.json();
        const pageReviews = normalizeBookingPayloads([payload]);
        if (!pageReviews.length) break;
        payloads.push(payload);
        reviews = mergeReviews(reviews, pageReviews);
        skip += pageSize;
        if (pageReviews.length < pageSize) break;
      }
    }

    return mergeReviews(reviews, normalizeBookingPayloads(payloads));
  } finally {
    page.off("response", captureReviewResponse);
  }
}

function airbnbReviewsRoot(payload) {
  return payload?.data?.presentation?.stayProductDetailPage?.reviews || null;
}

async function fetchRemainingAirbnbReviews(page, initialRequest, initialPayload) {
  const root = airbnbReviewsRoot(initialPayload);
  if (!root || !initialRequest) return [];

  const reviews = [...(root.reviews || [])];
  const total = Number(root.metadata?.reviewsCount) || reviews.length;
  const url = new URL(initialRequest.url());
  const variables = JSON.parse(url.searchParams.get("variables") || "{}");
  const requestOptions = variables.pdpReviewsRequest;
  const pageSize = Number(requestOptions?.limit) || 24;
  const headers = requestHeadersForReplay(await initialRequest.allHeaders());

  // The page's initial query often returns only a small featured subset even
  // though it asks for a full page. Replaying offset 0 returns the actual page.
  for (let offset = 0; offset < total; offset += pageSize) {
    const nextVariables = structuredClone(variables);
    nextVariables.pdpReviewsRequest.offset = String(offset);
    nextVariables.pdpReviewsRequest.limit = pageSize;
    nextVariables.pdpReviewsRequest.first = pageSize;
    nextVariables.pdpReviewsRequest.sortingPreference = "MOST_RECENT";
    url.searchParams.set("variables", JSON.stringify(nextVariables));

    const response = await page.request.get(url.toString(), { headers });
    if (!response.ok()) {
      console.warn(`     ⚠️ Airbnb review page ${Math.floor(offset / pageSize) + 1} returned HTTP ${response.status()}`);
      break;
    }
    const payload = await response.json();
    const nextRoot = airbnbReviewsRoot(payload);
    const nextReviews = nextRoot?.reviews || [];
    if (!nextReviews.length) {
      const apiMessage = payload?.errors?.[0]?.message || "no review records returned";
      console.warn(`     ⚠️ Airbnb review page ${Math.floor(offset / pageSize) + 1}: ${apiMessage}`);
      break;
    }
    reviews.push(...nextReviews);
    if (nextReviews.length < pageSize) break;
  }

  return mergeReviews(reviews.map(normalizeAirbnbReview));
}

async function scrapeBooking(page, url, { fetchReviews = false } = {}) {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(3000);

    // Dismiss cookie banners if present
    try {
      const acceptBtn = await page.$('button#onetrust-accept-btn-handler, button[data-testid*="accept"], button:has-text("Accept"), button:has-text("Aceitar"), button:has-text("OK")');
      if (acceptBtn) {
        await acceptBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {}

    const extracted = await page.evaluate(() => {
      // Score
      const scoreEl = document.querySelector('[data-testid="review-score-component"] div, .b5cd09854e.d10a6220b4, [data-testid="review-score-right-component"] div, .a3b8729ab1.d86cee9c25');
      let scoreText = scoreEl ? scoreEl.textContent.trim().replace(",", ".") : null;

      // JSON-LD structured data fallback & review count
      let jsonLd = null;
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const parsed = JSON.parse(s.textContent);
          if (parsed.aggregateRating || (Array.isArray(parsed) && parsed.some((p) => p.aggregateRating))) {
            jsonLd = parsed.aggregateRating || parsed.find((p) => p.aggregateRating)?.aggregateRating;
          }
        } catch {}
      });

      const numericScore = scoreText ? Number.parseFloat(scoreText) : (jsonLd?.ratingValue ? Number.parseFloat(jsonLd.ratingValue) : null);
      const reviewCount = jsonLd?.reviewCount ? Number.parseInt(jsonLd.reviewCount, 10) : null;

      // Extract sub-scores
      const subScores = {};
      document.querySelectorAll('[data-testid="subscores-container"] > div, .review_list_score_breakdown li, [data-testid="review-subscore"]').forEach((el) => {
        const text = el.textContent.trim();
        // Regex match: category name and score (e.g. "Cleanliness 9.9" or "Limpeza, 8,1")
        const match = text.match(/([a-zA-Z\u00C0-\u017F\s\/]+)[,\s]+([0-9]+[.,][0-9]+)/);
        if (match) {
          const rawCat = match[1].trim().toLowerCase();
          const val = Number.parseFloat(match[2].replace(",", "."));
          if (rawCat.includes("clean") || rawCat.includes("limp")) subScores.cleanliness = val;
          else if (rawCat.includes("staff") || rawCat.includes("func")) subScores.staff = val;
          else if (rawCat.includes("loca")) subScores.location = val;
          else if (rawCat.includes("facil") || rawCat.includes("comod")) subScores.facilities = val;
          else if (rawCat.includes("comf") || rawCat.includes("confor")) subScores.comfort = val;
          else if (rawCat.includes("val") || rawCat.includes("preço") || rawCat.includes("preco")) subScores.value = val;
        }
      });

      return {
        score: numericScore,
        reviewCount,
        subScores,
        finalUrl: window.location.href
      };
    });

    const reviews = fetchReviews ? await fetchBookingReviews(page, extracted.reviewCount) : [];

    return {
      status: "success",
      score: extracted.score,
      reviewCount: extracted.reviewCount,
      subScores: extracted.subScores,
      reviews,
      fetchedReviewCount: reviews.length,
      finalUrl: extracted.finalUrl,
      lastChecked: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: "error",
      error: err.message,
      lastChecked: new Date().toISOString()
    };
  }
}

async function scrapeAirbnb(page, url, { fetchReviews = false } = {}) {
  let reviewsRequest = null;
  let reviewsPayload = null;
  let capturedReviewCount = 0;
  const captureReviews = async (response) => {
    if (!response.url().includes("StaysPdpReviewsQuery")) return;
    try {
      const payload = await response.json();
      const reviewCount = airbnbReviewsRoot(payload)?.reviews?.length || 0;
      if (reviewCount > capturedReviewCount) {
        capturedReviewCount = reviewCount;
        reviewsRequest = response.request();
        reviewsPayload = payload;
      }
    } catch {}
  };
  page.on("response", captureReviews);

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40000 });
    await page.waitForTimeout(3000);

    // Dismiss cookie banners if present
    try {
      const acceptBtn = await page.$('button[data-testid*="accept"], button:has-text("Accept"), button:has-text("Aceitar"), button:has-text("OK")');
      if (acceptBtn) {
        await acceptBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {}

    const extracted = await page.evaluate(() => {
      // JSON-LD structured data
      let jsonLdRating = null;
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        try {
          const parsed = JSON.parse(s.textContent);
          if (parsed.aggregateRating) {
            jsonLdRating = parsed.aggregateRating;
          }
        } catch {}
      });

      const score = jsonLdRating?.ratingValue ? Number.parseFloat(jsonLdRating.ratingValue) : null;
      const reviewCount = jsonLdRating?.ratingCount ? Number.parseInt(jsonLdRating.ratingCount, 10) : null;

      // Extract sub-scores
      const subScores = {};
      document.querySelectorAll('[data-testid="pdp-reviews-subscore"], [aria-label*="rated"], div[role="group"] div').forEach((el) => {
        const text = el.textContent.trim();
        // Regex match category and score (e.g. "Cleanliness5.0" or "Cleanliness 4.9")
        const cleanMatch = text.match(/Cleanliness\s*([0-9]+[.,][0-9]+)/i);
        if (cleanMatch) subScores.cleanliness = Number.parseFloat(cleanMatch[1].replace(",", "."));

        const accMatch = text.match(/Accuracy\s*([0-9]+[.,][0-9]+)/i);
        if (accMatch) subScores.accuracy = Number.parseFloat(accMatch[1].replace(",", "."));

        const checkMatch = text.match(/Check-in\s*([0-9]+[.,][0-9]+)/i);
        if (checkMatch) subScores.checkin = Number.parseFloat(checkMatch[1].replace(",", "."));

        const commMatch = text.match(/Communication\s*([0-9]+[.,][0-9]+)/i);
        if (commMatch) subScores.communication = Number.parseFloat(commMatch[1].replace(",", "."));

        const locMatch = text.match(/Location\s*([0-9]+[.,][0-9]+)/i);
        if (locMatch) subScores.location = Number.parseFloat(locMatch[1].replace(",", "."));

        const valMatch = text.match(/Value\s*([0-9]+[.,][0-9]+)/i);
        if (valMatch) subScores.value = Number.parseFloat(valMatch[1].replace(",", "."));
      });

      // Check badge ("Guest favourite" or "Superhost")
      const pageText = document.body.innerText || "";
      const isGuestFavourite = /Guest\s+favourite|Preferido\s+dos\s+hóspedes/i.test(pageText);
      const isSuperhost = /Superhost/i.test(pageText);

      return {
        score,
        reviewCount,
        subScores,
        badge: isGuestFavourite ? "Guest favourite" : (isSuperhost ? "Superhost" : null),
        finalUrl: window.location.href
      };
    });

    const reviews = fetchReviews
      ? await fetchRemainingAirbnbReviews(page, reviewsRequest, reviewsPayload)
      : [];

    return {
      status: "success",
      score: extracted.score,
      reviewCount: extracted.reviewCount,
      subScores: extracted.subScores,
      badge: extracted.badge,
      reviews,
      fetchedReviewCount: reviews.length,
      finalUrl: extracted.finalUrl,
      lastChecked: new Date().toISOString()
    };
  } catch (err) {
    return {
      status: "error",
      error: err.message,
      lastChecked: new Date().toISOString()
    };
  } finally {
    page.off("response", captureReviews);
  }
}

async function loadExistingDataset(outputPath) {
  if (fs.existsSync(outputPath)) {
    try {
      const raw = await fs.promises.readFile(outputPath, "utf8");
      return JSON.parse(raw);
    } catch {
      // Ignore parse errors and return fallback
    }
  }

  return {
    lastUpdated: null,
    properties: DEFAULT_SEED_PROPERTIES.map((p) => ({
      ...p,
      booking: null,
      airbnb: null
    }))
  };
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log("🌟 Atlantic Holiday - Reviews & Ratings Synchronizer");
  console.log(`📁 Target dataset: ${options.output}`);
  console.log(`💬 Full review fetching: ${options.fetchReviews ? "Enabled" : "Disabled (ratings only)"}`);

  const dataset = await loadExistingDataset(options.output);
  let targets = dataset.properties || [];

  if (options.propertyFilter) {
    targets = targets.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(options.propertyFilter)) ||
        (p.id && p.id.toLowerCase().includes(options.propertyFilter))
    );
  }

  if (options.limit > 0) {
    targets = targets.slice(0, options.limit);
  }

  console.log(`📋 Properties queued for sync: ${targets.length}`);
  if (!targets.length) {
    console.log("No properties matched the criteria.");
    return;
  }

  if (options.dryRun) {
    console.log("\n[Dry Run] Targets:");
    targets.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.name}`);
      console.log(`     Booking: ${p.bookingUrl || "(none)"}`);
      console.log(`     Airbnb:  ${p.airbnbUrl || "(none)"}`);
    });
    return;
  }

  const executablePath = resolveBrowserExecutable(options.browserPath);
  console.log(`🌐 Using browser: ${executablePath}`);
  console.log(`🖥️  Headless mode: ${options.headless ? "Enabled" : "Disabled"}`);

  const browser = await chromium.launch({
    executablePath,
    headless: options.headless,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"]
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
    viewport: { width: 1366, height: 768 },
    locale: "en-US"
  });

  try {
    for (const property of targets) {
      console.log(`\n==================================================`);
      console.log(`🏨 Syncing: ${property.name} (${property.location || "Atlantic Holiday"})`);

      // 1. Scrape Booking.com if URL provided
      if (property.bookingUrl) {
        console.log(`  🔵 Booking.com: ${property.bookingUrl}`);
        const page = await context.newPage();
        try {
          const bookingResult = await scrapeBooking(page, property.bookingUrl, { fetchReviews: options.fetchReviews });
          const previousBookingReviews = property.booking?.reviews || [];
          property.booking = {
            ...bookingResult,
            reviews: options.fetchReviews && bookingResult.status === "success"
              ? bookingResult.reviews
              : previousBookingReviews
          };
          if (bookingResult.status === "success") {
            console.log(`     ✅ Score: ${bookingResult.score}/10 (${bookingResult.reviewCount || "?"} reviews)`);
            if (options.fetchReviews) console.log(`     💬 Fetched ${bookingResult.fetchedReviewCount} review records`);
            if (options.fetchReviews && bookingResult.reviewCount > bookingResult.fetchedReviewCount) {
              console.warn(`     ⚠️ Booking.com exposed ${bookingResult.fetchedReviewCount} of ${bookingResult.reviewCount} public reviews to this session`);
            }
            if (bookingResult.subScores?.cleanliness) {
              console.log(`     🧹 Cleanliness: ${bookingResult.subScores.cleanliness}/10`);
            }
          } else {
            console.log(`     ⚠️ Failed: ${bookingResult.error}`);
          }
        } finally {
          await page.close();
        }
      }

      // Friendly delay between platforms
      if (property.bookingUrl && property.airbnbUrl) await new Promise((r) => setTimeout(r, 2000));

      // 2. Scrape Airbnb if URL provided
      if (property.airbnbUrl) {
        console.log(`  🔴 Airbnb: ${property.airbnbUrl}`);
        const page = await context.newPage();
        try {
          const airbnbResult = await scrapeAirbnb(page, property.airbnbUrl, { fetchReviews: options.fetchReviews });
          const previousAirbnbReviews = property.airbnb?.reviews || [];
          property.airbnb = {
            ...airbnbResult,
            reviews: options.fetchReviews && airbnbResult.status === "success"
              ? airbnbResult.reviews
              : previousAirbnbReviews
          };
          if (airbnbResult.status === "success") {
            console.log(`     ✅ Score: ${airbnbResult.score}/5 ★ (${airbnbResult.reviewCount || "?"} reviews)`);
            if (options.fetchReviews) console.log(`     💬 Fetched ${airbnbResult.fetchedReviewCount} review records`);
            if (options.fetchReviews && airbnbResult.reviewCount > airbnbResult.fetchedReviewCount) {
              console.warn(`     ⚠️ Airbnb exposed ${airbnbResult.fetchedReviewCount} of ${airbnbResult.reviewCount} public reviews to this session`);
            }
            if (airbnbResult.badge) {
              console.log(`     🏆 Badge: ${airbnbResult.badge}`);
            }
            if (airbnbResult.subScores?.cleanliness) {
              console.log(`     🧹 Cleanliness: ${airbnbResult.subScores.cleanliness}/5.0`);
            }
          } else {
            console.log(`     ⚠️ Failed: ${airbnbResult.error}`);
          }
        } finally {
          await page.close();
        }
      }

      // Small pause between properties
      if (property.bookingUrl || property.airbnbUrl) await new Promise((r) => setTimeout(r, 2000));
    }

    dataset.lastUpdated = new Date().toISOString();
    await fs.promises.mkdir(path.dirname(options.output), { recursive: true });
    await fs.promises.writeFile(options.output, JSON.stringify(dataset, null, 2), "utf8");

    console.log(`\n🎉 Sync complete! Updated dataset saved to:`);
    console.log(`👉 ${options.output}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Execution failed:", err.message);
  process.exit(1);
});
