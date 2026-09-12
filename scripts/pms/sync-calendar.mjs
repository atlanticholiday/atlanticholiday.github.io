import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright-core";
import { normalizePmsCalendarDataset, normalizeCalendarEvent } from "../../js/features/operations/property-calendar-utils.js";

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.PMS_BROWSER_PATH,
  process.env.AIRBNB_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const DEFAULT_START_URL = "https://app.avantio.pro/";
const DEFAULT_PROFILE_DIR = path.resolve(".pms-playwright");
const DEFAULT_OUTPUT_FILE = path.resolve("server-data", "pms-calendar.json");
const DEFAULT_CACHE_DIR = path.resolve(".cache");

function printHelp() {
  console.log(`
PMS Calendar Fetcher & Synchronizer

Usage:
  node scripts/pms/sync-calendar.mjs [options]

Workflow:
  1. The browser opens with a saved local PMS profile (session preserved across runs).
  2. If needed, log into your PMS (Avantio) and navigate to the Calendar / Tape Chart.
  3. The script intercepts tape chart API responses and DOM data.
  4. Press Enter in this terminal to finalize extraction.
  5. Extracted property names, availability dates, and guest names are saved to server-data/pms-calendar.json.

Options:
  --start-url URL       PMS URL to open (default: ${DEFAULT_START_URL})
  --profile-dir PATH    Directory for browser session cache (default: .pms-playwright)
  --output PATH         Path to save normalized JSON (default: server-data/pms-calendar.json)
  --browser-path PATH   Path to Edge or Chrome executable
  --auto-close          Automatically close browser after extraction
  --help, -h            Show this help message
`);
}

function parseCommandLine(argv) {
  const options = {
    startUrl: DEFAULT_START_URL,
    profileDir: DEFAULT_PROFILE_DIR,
    outputFile: DEFAULT_OUTPUT_FILE,
    browserPath: "",
    autoClose: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const [key, inlineValue] = token.startsWith("--") ? token.split("=", 2) : [token, undefined];
    const nextValue = inlineValue ?? argv[i + 1];
    const consumeNext = inlineValue === undefined;

    switch (key) {
      case "--start-url":
        options.startUrl = nextValue;
        if (consumeNext) i += 1;
        break;
      case "--profile-dir":
        options.profileDir = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--output":
        options.outputFile = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--browser-path":
        options.browserPath = path.resolve(nextValue);
        if (consumeNext) i += 1;
        break;
      case "--auto-close":
        options.autoClose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
    }
  }

  return options;
}

function resolveBrowserExecutable(preferredPath) {
  const candidates = preferredPath ? [preferredPath] : DEFAULT_BROWSER_CANDIDATES;
  const resolved = candidates.find((c) => c && fs.existsSync(c));
  if (!resolved) {
    throw new Error("No supported Chromium browser (Edge or Chrome) found.");
  }
  return resolved;
}

async function promptForEnter(message) {
  if (!input.isTTY || !output.isTTY) {
    console.log(message);
    console.log("Waiting 15 seconds...");
    await new Promise((r) => setTimeout(r, 15000));
    return;
  }

  const rl = readline.createInterface({ input, output });
  try {
    await rl.question(`${message}\n👉 Press [ENTER] when the Calendar is loaded on screen: `);
  } finally {
    rl.close();
  }
}

async function extractDomCalendarData(page) {
  return await page.evaluate(() => {
    const results = [];

    // Strategy 1: Look for tape chart row elements
    // Common tape chart structures in Avantio / React / Vue / Angular calendars
    const rowElements = document.querySelectorAll(
      '[class*="accommodation"], [class*="tape-chart-row"], [class*="calendar-row"], tr[data-accommodation], .timeline-row'
    );

    if (rowElements.length) {
      rowElements.forEach((row) => {
        const nameEl = row.querySelector('[class*="name"], [class*="title"], td:first-child, .accommodation-title');
        const propName = nameEl ? nameEl.textContent.trim() : '';
        if (!propName) return;

        const bookingEls = row.querySelectorAll('[class*="booking"], [class*="reservation"], [class*="event"], [class*="block"]');
        bookingEls.forEach((b) => {
          const guest = b.textContent.trim();
          const start = b.getAttribute('data-start') || b.getAttribute('data-date-from') || b.getAttribute('title');
          const end = b.getAttribute('data-end') || b.getAttribute('data-date-to');
          results.push({
            propertyName: propName,
            guestName: guest,
            startDate: start,
            endDate: end,
            status: b.className
          });
        });
      });
    }

    return results;
  });
}

async function main() {
  const options = parseCommandLine(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const executablePath = resolveBrowserExecutable(options.browserPath);
  console.log(`🌐 Using browser: ${executablePath}`);
  console.log(`📂 Browser profile: ${options.profileDir}`);
  console.log(`🎯 Target URL: ${options.startUrl}`);

  await fs.promises.mkdir(options.profileDir, { recursive: true });
  await fs.promises.mkdir(DEFAULT_CACHE_DIR, { recursive: true });
  await fs.promises.mkdir(path.dirname(options.outputFile), { recursive: true });

  // Clean up any previous Edge instance holding the profile lock
  try {
    if (process.platform === "win32") {
      const { execSync } = await import("node:child_process");
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${options.profileDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
        { stdio: "ignore" }
      );
    }
  } catch {
    // Ignore if no processes found
  }

  const capturedNetworkPayloads = [];

  const context = await chromium.launchPersistentContext(options.profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"]
  });

  const page = context.pages()[0] || await context.newPage();

  // Monitor network responses across all pages and iframes
  context.on("response", async (response) => {
    try {
      const url = response.url();
      const req = response.request();
      const resourceType = req.resourceType();
      const contentType = response.headers()["content-type"] || "";

      // Ignore static static assets, fonts, icons, manifest, tracking
      if (
        url.endsWith(".js") || url.endsWith(".css") || url.endsWith(".png") ||
        url.endsWith(".svg") || url.endsWith(".woff2") || url.endsWith(".ico") ||
        url.includes("manifest.json") ||
        /google-analytics|datadog|sentry|hotjar|intercom|segment|mixpanel|doubleclick/i.test(url)
      ) {
        return;
      }

      if (resourceType === "fetch" || resourceType === "xhr" || contentType.includes("json")) {
        console.log(`📡 [${req.method()}] ${response.status()} ${url.slice(0, 110)}`);
        try {
          const bodyText = await response.text();
          const parsed = JSON.parse(bodyText);
          capturedNetworkPayloads.push({ url, method: req.method(), data: parsed, timestamp: new Date().toISOString() });

          const candidate = normalizePmsCalendarDataset(parsed);
          if (candidate.properties?.length) {
            console.log(`🎉 CAPTURED CALENDAR DATA! Found ${candidate.properties.length} accommodations!`);
          }
        } catch {
          // Response body may not be JSON
        }
      }
    } catch {
      // Ignore response read errors
    }
  });

  console.log(`\n🚀 Opening ${options.startUrl}...`);
  await page.goto(options.startUrl, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => {});

  await promptForEnter("\n👉 In Edge, press [Ctrl + R] to reload the calendar (or click '>' to change month), so we record the fresh data.");

  console.log("🔍 Extracting calendar data...");

  // Save raw network captures for diagnostics
  if (capturedNetworkPayloads.length) {
    const rawDumpPath = path.join(DEFAULT_CACHE_DIR, "pms-calendar-raw.json");
    await fs.promises.writeFile(rawDumpPath, JSON.stringify(capturedNetworkPayloads, null, 2), "utf8");
    console.log(`💾 Saved ${capturedNetworkPayloads.length} intercepted responses to ${rawDumpPath}`);
    console.log(`📋 Intercepted endpoints:`);
    capturedNetworkPayloads.forEach((item, idx) => {
      const keys = typeof item.data === "object" && item.data !== null ? Object.keys(item.data).slice(0, 8).join(", ") : "non-object";
      console.log(`   ${idx + 1}. [${item.method || "GET"}] ${item.url.slice(0, 85)} (keys: [${keys}])`);
    });
  }

  // Attempt to parse normalized dataset from intercepted network payloads
  let calendarDataset = { properties: [] };

  for (const item of capturedNetworkPayloads) {
    const candidate = normalizePmsCalendarDataset(item.data);
    if (candidate.properties?.length > calendarDataset.properties.length) {
      calendarDataset = candidate;
      console.log(`✨ Found ${candidate.properties.length} properties in: ${item.url.slice(0, 90)}`);
    }
  }

  // If network payloads didn't capture full properties, inspect all frames
  if (!calendarDataset.properties.length) {
    console.log("ℹ️ Checking all page frames for calendar data...");
    for (const frame of page.frames()) {
      try {
        const domEvents = await extractDomCalendarData(frame);
        if (domEvents.length) {
          const candidate = normalizePmsCalendarDataset(domEvents);
          if (candidate.properties?.length > calendarDataset.properties.length) {
            calendarDataset = candidate;
            console.log(`✨ Extracted ${candidate.properties.length} properties from frame: ${frame.url()}`);
          }
        }
      } catch {
        // Frame might be cross-origin or detached
      }
    }
  }

  calendarDataset.fetchedAt = new Date().toISOString();
  calendarDataset.sourceUrl = page.url();

  await fs.promises.writeFile(options.outputFile, JSON.stringify(calendarDataset, null, 2), "utf8");
  console.log(`\n✅ Calendar dataset saved to: ${options.outputFile}`);
  console.log(`📊 Accommodations found: ${calendarDataset.properties.length}`);
  const totalBookings = calendarDataset.properties.reduce((sum, p) => sum + (p.reservations?.length || 0), 0);
  console.log(`📅 Total reservations/blocks found: ${totalBookings}`);

  if (options.autoClose) {
    await context.close();
  } else {
    console.log("\nBrowser kept open. You can close it when finished.");
  }
}

main().catch((err) => {
  console.error("❌ Execution error:", err.message);
  process.exit(1);
});
