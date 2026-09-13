import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const CSV_PATH = "C:\\Users\\Lucas\\Downloads\\Nova pasta (28)\\Front Desk - Alojamentos AH - Descrições.csv";
const OUTPUT_FILE = path.resolve("server-data", "property-reviews.json");

const COMPETITORS = [
  "guestready", "homie", "your key", "lovelystay", "an island apart",
  "host wise", "we host", "domustay", "madeira sun travel"
];

const GENERIC_TOKENS = new Set([
  "apartment", "apartamentos", "apartamento", "villa", "villas", "house", "casas", "casa",
  "studio", "loft", "suite", "guesthouse", "flat", "residence", "residence", "place",
  "funchal", "santa", "cruz", "calheta", "machico", "canico", "ribeira", "brava", "santana",
  "vicente", "moniz", "camara", "lobos", "ponta", "sol", "madeira", "portugal",
  "view", "ocean", "sea", "mar", "azul", "prime", "location"
]);

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return normalizeText(text).replace(/\s+/g, "-");
}

function isCompetitorTitle(normTitle) {
  if (normTitle.includes("atlantic holiday") || normTitle.includes("atlantic holidays")) {
    return false;
  }
  return COMPETITORS.some(c => normTitle.includes(c));
}

// 1. Discover OTA links from Edge and Chrome history & bookmarks
function discoverLocalOtaLinks() {
  const roots = [
    path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "User Data"),
    path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data")
  ];

  const found = new Map();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let dirs = [];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      continue;
    }

    for (const d of dirs) {
      const pDir = path.join(root, d);
      try {
        if (!fs.statSync(pDir).isDirectory()) continue;
      } catch {
        continue;
      }

      // Check Bookmarks
      const bmFile = path.join(pDir, "Bookmarks");
      if (fs.existsSync(bmFile)) {
        try {
          const bmData = JSON.parse(fs.readFileSync(bmFile, "utf8"));
          const traverse = (node) => {
            if (!node) return;
            if (node.url && (node.url.includes("airbnb.") || node.url.includes("booking."))) {
              found.set(node.url, node.name || "");
            }
            if (node.children) node.children.forEach(traverse);
          };
          if (bmData.roots) {
            Object.values(bmData.roots).forEach(traverse);
          }
        } catch {}
      }

      // Check History SQLite
      const histFile = path.join(pDir, "History");
      if (fs.existsSync(histFile)) {
        const tempHist = path.resolve(`temp_hist_${Math.random().toString(36).slice(2)}.sqlite`);
        try {
          fs.copyFileSync(histFile, tempHist);
          const db = new DatabaseSync(tempHist);
          const rows = db.prepare(`
            SELECT title, url FROM urls 
            WHERE (url LIKE '%airbnb.%/rooms/%' 
               OR url LIKE '%booking.com/hotel/%' 
               OR url LIKE '%booking.com/Share%')
              AND url NOT LIKE '%admin.booking.com%'
              AND url NOT LIKE '%account.booking.com%'
          `).all();
          rows.forEach((r) => {
            if (!found.has(r.url)) {
              found.set(r.url, r.title || "");
            }
          });
          db.close();
        } catch {
        } finally {
          try { fs.unlinkSync(tempHist); } catch {}
        }
      }
    }
  }

  const cleanLinks = [];
  for (const [url, title] of found.entries()) {
    const cleanUrl = url.split("?")[0].replace(/\/reviews$|\/cancellation-policy$/, "");
    const normTitle = normalizeText(title);
    if (
      !isCompetitorTitle(normTitle) &&
      (!url.includes("airbnb.") || /\/rooms\/\d+/.test(cleanUrl)) &&
      (!url.includes("booking.com") || (!cleanUrl.includes("admin.booking.com") && !cleanUrl.includes("account.booking.com")))
    ) {
      cleanLinks.push({
        url: cleanUrl,
        title,
        normTitle
      });
    }
  }

  return cleanLinks;
}

// 2. Load property names from local CSV
const propertyNames = [];
if (fs.existsSync(CSV_PATH)) {
  const lines = fs.readFileSync(CSV_PATH, "utf8").split("\n").map(l => l.trim()).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const m = lines[i].match(/^("[^"]+"|[^,]+)/);
    if (m) {
      const name = m[0].replace(/^"|"$/g, "").trim();
      if (name && !propertyNames.includes(name)) {
        propertyNames.push(name);
      }
    }
  }
}

console.log(`Loaded ${propertyNames.length} properties from local CSV.`);

const discoveredLinks = discoverLocalOtaLinks();
console.log(`Discovered ${discoveredLinks.length} non-competitor OTA links from local browser history.`);

const airbnbLinks = discoveredLinks.filter(l => l.url.includes("airbnb.") && l.url.includes("/rooms/"));
const bookingLinks = discoveredLinks.filter(l => l.url.includes("booking.com"));

// Load existing reviews dataset to preserve already synchronized reviews
let existingData = { lastUpdated: new Date().toISOString(), properties: [] };
if (fs.existsSync(OUTPUT_FILE)) {
  try {
    existingData = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  } catch {}
}

const existingMap = new Map((existingData.properties || []).map(p => [p.id, p]));

// Match properties
const matchedList = [];

for (const propName of propertyNames) {
  const id = slugify(propName);
  const normName = normalizeText(propName);
  const existing = existingMap.get(id) || {};

  let airbnbUrl = existing.airbnbUrl || "";
  if (airbnbUrl && !/\/rooms\/\d+/.test(airbnbUrl)) {
    airbnbUrl = "";
  }
  let bookingUrl = existing.bookingUrl || "";
  if (bookingUrl && (bookingUrl.includes("admin.booking.com") || bookingUrl.includes("account.booking.com"))) {
    bookingUrl = "";
  }

  // 1. Try matching Airbnb from history using distinctive tokens
  if (!airbnbUrl) {
    const distinctiveTokens = normName.split(" ").filter(t => t.length >= 3 && !GENERIC_TOKENS.has(t));
    if (distinctiveTokens.length > 0) {
      const abMatch = airbnbLinks.find(l => {
        return distinctiveTokens.every(token => new RegExp(`\\b${token}\\b`, "i").test(l.normTitle));
      });
      if (abMatch) {
        airbnbUrl = abMatch.url;
      }
    }
  }

  // 2. Try matching Booking from history
  if (!bookingUrl) {
    const bkMatch = bookingLinks.find(l => {
      return l.normTitle.includes(normName) || l.url.includes(id);
    });
    if (bkMatch) {
      bookingUrl = bkMatch.url;
    }
  }

  // 3. Fallback Booking canonical slug
  if (!bookingUrl) {
    const candidateSlug = id.endsWith("-by-atlantic-holiday") ? id : `${id}-by-atlantic-holiday`;
    bookingUrl = `https://www.booking.com/hotel/pt/${candidateSlug}.html`;
  }

  matchedList.push({
    id,
    name: propName,
    location: existing.location || "Madeira",
    bookingUrl: bookingUrl || "",
    airbnbUrl: airbnbUrl || "",
    booking: existing.booking || null,
    airbnb: existing.airbnb || null
  });
}

// Summary stats
const withAirbnb = matchedList.filter(p => p.airbnbUrl);
const withBooking = matchedList.filter(p => p.bookingUrl);
const withBoth = matchedList.filter(p => p.airbnbUrl && p.bookingUrl);

console.log("\n=== MATCHING SUMMARY ===");
console.log(`Total properties: ${matchedList.length}`);
console.log(`With Booking URL: ${withBooking.length}`);
console.log(`With Airbnb URL:  ${withAirbnb.length}`);
console.log(`With Both URLs:   ${withBoth.length}`);

console.log("\nProperties matched with Airbnb URLs:");
withAirbnb.forEach(p => {
  console.log(`- ${p.name}: ${p.airbnbUrl}`);
});

// Update dataset
const updatedDataset = {
  lastUpdated: new Date().toISOString(),
  properties: matchedList
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(updatedDataset, null, 2), "utf8");
console.log(`\nUpdated dataset saved to ${OUTPUT_FILE}`);
