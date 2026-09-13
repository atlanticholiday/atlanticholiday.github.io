import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright-core";

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.AIRBNB_BROWSER_PATH,
  process.env.PMS_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const DATASET_FILE = path.resolve("server-data", "property-reviews.json");
const AIRBNB_PROFILE_DIR = path.resolve(".airbnb-playwright");
const BOOKING_PROFILE_DIR = path.resolve(".booking-playwright");

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
    platform: "airbnb", // 'airbnb', 'booking', or 'both'
    output: DATASET_FILE,
    browserPath: "",
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const [key, inlineValue] = token.startsWith("--") ? token.split("=", 2) : [token, undefined];
    const nextValue = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined;

    switch (key) {
      case "--platform":
        options.platform = (nextValue || "").toLowerCase();
        if (consumeNext) i += 1;
        break;
      case "--output":
        options.output = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--browser-path":
        options.browserPath = path.resolve(nextValue);
        if (consumeNext) i += 1;
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
Atlantic Holiday - Automatic Listing Links Fetcher

Usage:
  node scripts/reviews/fetch-listing-links.mjs [options]

Options:
  --platform airbnb|booking|both   Which portal to extract links from (default: airbnb)
  --output PATH                    Dataset to update (default: server-data/property-reviews.json)
  --browser-path PATH              Path to Edge or Chrome executable
  --help, -h                       Show this help message
`);
}

async function promptForEnter(message) {
  if (!input.isTTY || !output.isTTY) {
    console.log(message);
    console.log("Waiting 20 seconds...");
    await new Promise((r) => setTimeout(r, 20000));
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\n👉 Press [ENTER] in this terminal when the page is loaded: `);
  } finally {
    rl.close();
  }
}

function normalizeTitle(title) {
  return String(title || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/by\s+atlantic\s+holiday[s]?/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadDataset(filePath) {
  if (fs.existsSync(filePath)) {
    try {
      const raw = await fs.promises.readFile(filePath, "utf8");
      return JSON.parse(raw);
    } catch {}
  }
  return { lastUpdated: null, properties: [] };
}

async function saveDataset(filePath, dataset) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(dataset, null, 2), "utf8");
}

async function fetchAirbnbListings(executablePath) {
  console.log("\n==================================================");
  console.log("🔴 STEP 1: Fetching Airbnb Listings from Host Portal");
  console.log("==================================================");

  await fs.promises.mkdir(AIRBNB_PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(AIRBNB_PROFILE_DIR, {
    executablePath,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const page = context.pages()[0] || (await context.newPage());
  const discovered = new Map(); // id -> { id, name, url }

  // Intercept GraphQL network responses that list properties
  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (url.includes("graphql") || url.includes("Listings") || url.includes("getListings")) {
        const text = await response.text();
        const json = JSON.parse(text);

        function searchListings(obj) {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            obj.forEach(searchListings);
            return;
          }

          let rawId = obj.id || obj.listing_id || obj.listingId || obj.roomId || obj.room_id || (obj.listing && obj.listing.id);
          if (rawId) {
            rawId = String(rawId);
            if (!/^\d+$/.test(rawId) && rawId.length > 12) {
              try {
                const decoded = Buffer.from(rawId, "base64").toString("utf8");
                const m = decoded.match(/\d{6,}/);
                if (m) rawId = m[0];
              } catch {}
            }
            const numMatch = rawId.match(/\b(\d{6,})\b/);
            if (numMatch) {
              const id = numMatch[1];
              const name = obj.nickname || obj.listing_nickname || obj.name || obj.title || obj.listing_title || obj.public_name || (obj.listing && (obj.listing.nickname || obj.listing.name || obj.listing.title));
              if (name && typeof name === "string" && name.trim().length > 1) {
                discovered.set(id, {
                  id,
                  name: name.trim(),
                  url: `https://www.airbnb.com/rooms/${id}`
                });
              }
            }
          }

          Object.values(obj).forEach(searchListings);
        }

        searchListings(json);
      }
    } catch {}
  });

  const targetUrl = "https://www.airbnb.com/hosting/listings";
  console.log(`🌐 Opening ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

  console.log("\n👉 Please log into your Airbnb Host account in Microsoft Edge.");
  console.log("   Once logged in, the script will automatically detect the listings page and extract everything!");

  // Wait for user to log in and reach hosting listings
  const startTime = Date.now();
  const maxWaitMs = 10 * 60 * 1000; // 10 minutes
  let isReady = false;

  while (Date.now() - startTime < maxWaitMs) {
    if (page.isClosed()) {
      console.log("⚠️ Browser window closed by user.");
      break;
    }

    const currentUrl = page.url();
    const isLoginPage = currentUrl.includes("/login") || currentUrl.includes("authenticate") || currentUrl.includes("checkpoint");
    const isHosting = (currentUrl.includes("/hosting") || currentUrl.includes("/multicalendar")) && !isLoginPage;

    if (isHosting) {
      const hasListingsInDOM = await page.evaluate(() => {
        return Boolean(
          document.querySelector('a[href*="/hosting/listings/"], a[href*="/rooms/"], [data-testid*="listing"], table tbody tr')
        );
      }).catch(() => false);

      if (hasListingsInDOM || discovered.size > 0) {
        isReady = true;
        console.log("🎉 Airbnb Host Login detected! Proceeding to extract listings...");
        break;
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    if (elapsed > 0 && elapsed % 15 === 0) {
      console.log(`⏳ [${Math.floor(elapsed / 60)}m ${elapsed % 60}s / 10m] Waiting for login in Microsoft Edge...`);
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  if (page.isClosed()) {
    return Array.from(discovered.values());
  }

  // Inject friendly helper banner
  await page.evaluate(() => {
    try {
      if (document.getElementById("ah-status-banner")) return;
      const banner = document.createElement("div");
      banner.id = "ah-status-banner";
      banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999999;background:#0d9488;color:#fff;font-size:16px;font-weight:bold;text-align:center;padding:12px;box-shadow:0 2px 10px rgba(0,0,0,0.3);font-family:sans-serif;";
      banner.innerText = "🌊 Atlantic Holiday: Logged in! Automatically scanning and collecting all listings...";
      document.body.appendChild(banner);
    } catch {}
  }).catch(() => {});

  async function scrapeDomListings() {
    const items = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[href*="/hosting/listings/editor/"], a[href*="/hosting/listings/details/"], a[href*="/hosting/listings/"], a[href*="/rooms/"], [data-testid*="listing"]');
      links.forEach((link) => {
        const href = link.getAttribute("href") || "";
        const match = href.match(/\/(?:editor|details|rooms|listings)\/(\d{6,})/);
        if (match) {
          const id = match[1];
          const row = link.closest("tr") || link.closest('[role="row"]') || link.closest('[data-testid*="listing"]') || link.parentElement;
          const text = row ? row.innerText : link.innerText;
          const lines = text.split("\n").map((t) => t.trim()).filter((t) => t.length > 2);
          const titleLine = lines.find((t) =>
            !t.includes("Active") &&
            !t.includes("Listed") &&
            !t.includes("Unlisted") &&
            !t.includes("In progress") &&
            !t.includes("bedroom") &&
            !t.includes("bath") &&
            !t.includes("Instant") &&
            !/^\d+$/.test(t)
          );
          if (titleLine) {
            results.push({ id, name: titleLine, url: `https://www.airbnb.com/rooms/${id}` });
          }
        }
      });
      return results;
    }).catch(() => []);

    items.forEach((it) => {
      if (!discovered.has(it.id)) {
        discovered.set(it.id, it);
      }
    });
  }

  // Iterate pages
  let pageNum = 1;
  let hasMore = true;

  while (hasMore && pageNum <= 30) {
    if (page.isClosed()) break;
    console.log(`📄 Scanning listings page ${pageNum}... (Captured so far: ${discovered.size})`);

    for (let s = 0; s < 5; s++) {
      await page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {});
      await page.waitForTimeout(400);
    }

    await scrapeDomListings();

    const nextBtn = await page.evaluate(() => {
      const selectors = [
        'button[aria-label*="Next"]',
        'button[aria-label*="Próximo"]',
        'button[aria-label*="Seguinte"]',
        'a[aria-label*="Next"]',
        'a[aria-label*="Próximo"]',
        'a[aria-label*="Seguinte"]',
        '[data-testid*="pagination-next"]',
        'nav[aria-label*="Pagination"] button:last-child',
        'nav[aria-label*="Paginação"] button:last-child'
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const disabled = el.disabled || el.getAttribute("aria-disabled") === "true" || el.classList.contains("disabled");
          return { found: true, disabled, selector: sel };
        }
      }
      return { found: false };
    }).catch(() => ({ found: false }));

    if (nextBtn.found && !nextBtn.disabled) {
      console.log(`➡️ Navigating to next listings page...`);
      await page.evaluate((sel) => {
        document.querySelector(sel)?.click();
      }, nextBtn.selector).catch(() => {});
      await page.waitForTimeout(3000);
      pageNum += 1;
    } else {
      hasMore = false;
    }
  }

  await scrapeDomListings();

  console.log(`\n🎉 Extracted ${discovered.size} total Airbnb listings!`);

  // Update banner
  await page.evaluate((count) => {
    try {
      const banner = document.getElementById("ah-status-banner");
      if (banner) {
        banner.style.background = "#16a34a";
        banner.innerText = `✅ Done! Captured ${count} Airbnb listings. Saving now...`;
      }
    } catch {}
  }, discovered.size).catch(() => {});

  await page.waitForTimeout(2500);
  await context.close().catch(() => {});

  return Array.from(discovered.values());
}

async function fetchBookingListings(executablePath) {
  console.log("\n==================================================");
  console.log("🔵 STEP 2: Fetching Booking.com Listings from Extranet");
  console.log("==================================================");

  await fs.promises.mkdir(BOOKING_PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(BOOKING_PROFILE_DIR, {
    executablePath,
    headless: false,
    viewport: { width: 1400, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const page = context.pages()[0] || (await context.newPage());
  const discovered = new Map(); // id -> { id, name, url }

  // Intercept extranet responses
  page.on("response", async (response) => {
    try {
      const url = response.url();
      if (url.includes("properties") || url.includes("hotels") || url.includes("json")) {
        const text = await response.text();
        const json = JSON.parse(text);

        function searchHotels(obj) {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            obj.forEach(searchHotels);
            return;
          }

          if (obj.hotel_id || obj.hotelId || obj.id) {
            const id = String(obj.hotel_id || obj.hotelId || obj.id);
            const name = obj.hotel_name || obj.name || obj.title;
            if (/^\d{4,}$/.test(id) && name) {
              discovered.set(id, {
                id,
                name: name.trim(),
                url: obj.url || `https://www.booking.com/hotel/${id}.html`
              });
            }
          }

          Object.values(obj).forEach(searchHotels);
        }

        searchHotels(json);
      }
    } catch {}
  });

  const targetUrl = "https://admin.booking.com/";
  console.log(`🌐 Opening ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

  await promptForEnter(
    "\n👉 In Microsoft Edge:\n   1. Log into your Booking.com Extranet (if prompted).\n   2. Open your 'Group / All Properties' list or Home page where your properties are listed."
  );

  console.log("🔍 Scanning Booking.com page elements...");

  // DOM extraction
  const domListings = await page.evaluate(() => {
    const results = [];
    // Links containing hotel_id or hotel links
    const elements = document.querySelectorAll('a[href*="hotel_id="], a[href*="/hotel/"], tr[data-hotel-id], [data-hotel-id]');
    elements.forEach((el) => {
      const href = el.getAttribute("href") || "";
      const match = href.match(/hotel_id=(\d+)/) || href.match(/\/hotel\/[a-z]{2}\/([a-z0-9-]+)\.html/);
      const dataId = el.getAttribute("data-hotel-id");
      const id = dataId || (match ? match[1] : null);

      if (id) {
        const name = el.innerText.trim().split("\n")[0];
        if (name && name.length > 2) {
          const url = href.startsWith("http") && !href.includes("admin.booking.com")
            ? href
            : `https://www.booking.com/hotel/${id}.html`;
          results.push({ id, name, url });
        }
      }
    });
    return results;
  });

  domListings.forEach((item) => {
    if (!discovered.has(item.id)) {
      discovered.set(item.id, item);
    }
  });

  await context.close();

  const results = Array.from(discovered.values());
  console.log(`✅ Successfully extracted ${results.length} Booking.com properties!`);
  results.forEach((r, idx) => {
    console.log(`   ${idx + 1}. ${r.name} -> ${r.url}`);
  });

  return results;
}

const GENERIC_TOKENS = new Set([
  "apartment", "apartamentos", "apartamento", "villa", "villas", "house", "casas", "casa",
  "studio", "loft", "suite", "guesthouse", "flat", "residence", "place",
  "funchal", "santa", "cruz", "calheta", "machico", "canico", "ribeira", "brava", "santana",
  "vicente", "moniz", "camara", "lobos", "ponta", "sol", "madeira", "portugal",
  "view", "ocean", "sea", "mar", "azul", "prime", "location", "by", "pela", "pelo", "por", "atlantic", "holiday", "holidays"
]);

function findBestMatch(existing, candidateName) {
  const normCand = normalizeTitle(candidateName);
  // 1. Direct or substring
  const direct = existing.find((p) => {
    const normP = normalizeTitle(p.name);
    return normP === normCand || normP.includes(normCand) || normCand.includes(normP);
  });
  if (direct) return direct;

  // 2. Token match
  const candTokens = normCand.split(" ").filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t));
  if (candTokens.length > 0) {
    return existing.find((p) => {
      const normP = normalizeTitle(p.name);
      return candTokens.every((token) => new RegExp(`\\b${token}\\b`, "i").test(normP));
    });
  }
  return null;
}

function mergeIntoDataset(dataset, airbnbListings = [], bookingListings = []) {
  const existing = dataset.properties || [];

  // Match and merge Airbnb
  airbnbListings.forEach((ab) => {
    const normAb = normalizeTitle(ab.name);
    const match = findBestMatch(existing, ab.name);

    if (match) {
      match.airbnbUrl = ab.url;
      console.log(`🔗 Matched Airbnb: "${ab.name}" -> "${match.name}"`);
    } else {
      // Add as new property entry
      const slug = normAb.replace(/\s+/g, "-") || `property-${ab.id}`;
      const newEntry = {
        id: slug,
        name: ab.name,
        location: "Madeira",
        airbnbUrl: ab.url,
        bookingUrl: null,
        airbnb: null,
        booking: null
      };
      existing.push(newEntry);
      console.log(`➕ Added new property from Airbnb: "${ab.name}"`);
    }
  });

  // Match and merge Booking.com
  bookingListings.forEach((bk) => {
    const normBk = normalizeTitle(bk.name);
    const match = findBestMatch(existing, bk.name);

    if (match) {
      match.bookingUrl = bk.url;
      console.log(`🔗 Matched Booking: "${bk.name}" -> "${match.name}"`);
    } else {
      // Add as new property entry
      const slug = normBk.replace(/\s+/g, "-") || `property-${bk.id}`;
      const newEntry = {
        id: slug,
        name: bk.name,
        location: "Madeira",
        airbnbUrl: null,
        bookingUrl: bk.url,
        airbnb: null,
        booking: null
      };
      existing.push(newEntry);
      console.log(`➕ Added new property from Booking: "${bk.name}"`);
    }
  });

  dataset.properties = existing;
  return dataset;
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const executablePath = resolveBrowserExecutable(options.browserPath);
  console.log(`🌟 Atlantic Holiday - Automatic Listing Links Fetcher`);
  console.log(`🌐 Browser: ${executablePath}`);
  console.log(`📁 Target dataset: ${options.output}`);

  let airbnbListings = [];
  let bookingListings = [];

  if (options.platform === "airbnb" || options.platform === "both") {
    airbnbListings = await fetchAirbnbListings(executablePath);
  }

  if (options.platform === "booking" || options.platform === "both") {
    bookingListings = await fetchBookingListings(executablePath);
  }

  const dataset = await loadDataset(options.output);
  const updatedDataset = mergeIntoDataset(dataset, airbnbListings, bookingListings);

  await saveDataset(options.output, updatedDataset);

  console.log("\n🎉 ALL DONE!");
  console.log(`📊 Total properties in dataset: ${updatedDataset.properties.length}`);
  console.log(`👉 Saved to: ${options.output}`);

  try {
    const { execSync } = await import("node:child_process");
    execSync("git add server-data/property-reviews.json", { stdio: "pipe" });
    const status = execSync("git status --porcelain server-data/property-reviews.json", { encoding: "utf8" });
    if (status.trim()) {
      console.log("💾 Committing and pushing updated listing links to GitHub...");
      execSync('git commit -m "Update property listing links (Airbnb & Booking)"', { stdio: "pipe" });
      execSync("git push origin main", { stdio: "inherit" });
      console.log("✅ Pushed successfully to GitHub!");
    }
  } catch (err) {
    console.warn("⚠️ Git commit/push skipped or failed:", err.message);
  }

  console.log("\nYou can now run 'npm run sync:reviews' or 'sync-reviews.cmd' to fetch reviews for all of them!");
}

main().catch((err) => {
  console.error("\n❌ Execution failed:", err.message);
  process.exit(1);
});

