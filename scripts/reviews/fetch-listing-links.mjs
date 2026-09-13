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
    .toLowerCase()
    .replace(/by\s+atlantic\s+holiday/gi, "")
    .replace(/by\s+atlantic\s+holidays/gi, "")
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

        // Recursive search for listing objects with id and name
        function searchListings(obj) {
          if (!obj || typeof obj !== "object") return;
          if (Array.isArray(obj)) {
            obj.forEach(searchListings);
            return;
          }

          if (obj.id && (obj.name || obj.title || obj.nickname)) {
            const rawId = String(obj.id);
            // Numeric or long ID
            if (/^\d{6,}$/.test(rawId) || rawId.length > 8) {
              const name = obj.nickname || obj.name || obj.title;
              discovered.set(rawId, {
                id: rawId,
                name: name.trim(),
                url: `https://www.airbnb.com/rooms/${rawId}`
              });
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

  await promptForEnter(
    "\n👉 In Microsoft Edge:\n   1. Log into your Airbnb Host account (if prompted).\n   2. Make sure you are on the 'Listings' page where your properties are shown."
  );

  console.log("🔍 Scanning Airbnb page elements...");

  // Also extract from DOM in case network interception missed any rows
  const domListings = await page.evaluate(() => {
    const results = [];
    // Links to editor or room
    const links = document.querySelectorAll('a[href*="/hosting/listings/editor/"], a[href*="/rooms/"], [data-testid*="listing"]');
    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/(?:editor|rooms)\/(\d+)/);
      if (match) {
        const id = match[1];
        const row = link.closest("tr") || link.closest('[role="row"]') || link.parentElement;
        const text = row ? row.innerText : link.innerText;
        const titleLine = text.split("\n").map((t) => t.trim()).find((t) => t.length > 3 && !t.includes("Active") && !t.includes("Listed"));
        results.push({ id, name: titleLine || `Listing ${id}`, url: `https://www.airbnb.com/rooms/${id}` });
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
  console.log(`✅ Successfully extracted ${results.length} Airbnb properties!`);
  results.forEach((r, idx) => {
    console.log(`   ${idx + 1}. ${r.name} -> ${r.url}`);
  });

  return results;
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

function mergeIntoDataset(dataset, airbnbListings = [], bookingListings = []) {
  const existing = dataset.properties || [];

  // Match and merge Airbnb
  airbnbListings.forEach((ab) => {
    const normAb = normalizeTitle(ab.name);
    let match = existing.find((p) => {
      const normP = normalizeTitle(p.name);
      return normP === normAb || normP.includes(normAb) || normAb.includes(normP);
    });

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
    let match = existing.find((p) => {
      const normP = normalizeTitle(p.name);
      return normP === normBk || normP.includes(normBk) || normBk.includes(normP);
    });

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
  console.log("\nYou can now run 'npm run sync:reviews' or 'sync-reviews.cmd' to fetch reviews for all of them!");
}

main().catch((err) => {
  console.error("\n❌ Execution failed:", err.message);
  process.exit(1);
});
