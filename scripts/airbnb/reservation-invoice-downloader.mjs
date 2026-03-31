import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright-core";

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.AIRBNB_BROWSER_PATH,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter(Boolean);

const DEFAULT_PROFILE_DIR = path.resolve(".airbnb-playwright");
const DEFAULT_DOWNLOADS_DIR = path.resolve(process.env.USERPROFILE || process.env.HOME || ".", "Downloads", "airbnb-reservation-invoices");
const DEFAULT_START_URL = "https://www.airbnb.pt/hosting/reservations/completed";
const DEFAULT_CONCURRENCY = 10;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_PAGE_WAIT_MS = 2500;
const RESERVATIONS_API_PAGE_DELAY_MS = 1200;
const RESERVATIONS_API_RETRY_DELAYS_MS = [1500, 3000, 6000];
const MAX_API_PAGES = 100;

function printHelp() {
  console.log(`
Airbnb reservation invoice downloader

Usage:
  npm run airbnb:download-reservation-invoices -- --limit 5

Workflow:
  1. The browser opens with your saved Airbnb profile.
  2. You log in if needed.
  3. You manually open Completed Reservations and apply the exact filters/date range you want.
  4. You press Enter in the terminal.
  5. The script reads Airbnb's reservations API for the currently prepared list.
  6. It extracts each host VAT invoice URL and saves the invoice page to PDF directly.

Options:
  --profile-dir PATH
  --downloads-dir PATH
  --browser-path PATH
  --start-url URL
  --limit N
  --concurrency N
  --pages N
  --headless
  --skip-login-prompt
  --overwrite
  --dry-run
  --auto-close
  --help

Notes:
  - --headless only makes sense with --skip-login-prompt.
  - The exporter uses the exact reservations API request visible on the prepared page,
    then replays it with the same logged-in browser session.
  - Invoice exports run with 10 parallel browser workers by default.
`);
}

function expectValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    profileDir: DEFAULT_PROFILE_DIR,
    downloadsDir: DEFAULT_DOWNLOADS_DIR,
    browserPath: "",
    startUrl: DEFAULT_START_URL,
    concurrency: DEFAULT_CONCURRENCY,
    maxPages: DEFAULT_MAX_PAGES,
    headless: false,
    skipLoginPrompt: false,
    overwrite: false,
    dryRun: false,
    autoClose: false,
    help: false,
    limit: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [key, inlineValue] = token.startsWith("--") ? token.split("=", 2) : [token, undefined];
    const nextValue = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue === undefined;

    switch (key) {
      case "--profile-dir":
        options.profileDir = path.resolve(expectValue(key, nextValue));
        if (consumeNext) index += 1;
        break;
      case "--downloads-dir":
        options.downloadsDir = path.resolve(expectValue(key, nextValue));
        if (consumeNext) index += 1;
        break;
      case "--browser-path":
        options.browserPath = path.resolve(expectValue(key, nextValue));
        if (consumeNext) index += 1;
        break;
      case "--start-url":
        options.startUrl = expectValue(key, nextValue);
        if (consumeNext) index += 1;
        break;
      case "--limit":
        options.limit = Number.parseInt(expectValue(key, nextValue), 10);
        if (consumeNext) index += 1;
        break;
      case "--concurrency":
        options.concurrency = Number.parseInt(expectValue(key, nextValue), 10);
        if (consumeNext) index += 1;
        break;
      case "--pages":
        options.maxPages = Number.parseInt(expectValue(key, nextValue), 10);
        if (consumeNext) index += 1;
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--skip-login-prompt":
        options.skipLoginPrompt = true;
        break;
      case "--overwrite":
        options.overwrite = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--auto-close":
        options.autoClose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer.");
  }

  if (!Number.isInteger(options.maxPages) || options.maxPages < 1) {
    throw new Error("--pages must be a positive integer.");
  }

  if (options.headless && !options.skipLoginPrompt) {
    throw new Error("--headless requires --skip-login-prompt because the live preparation step needs a visible browser.");
  }

  return options;
}

function logStep(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function resolveBrowserPath(preferredPath) {
  const candidates = preferredPath ? [preferredPath] : DEFAULT_BROWSER_CANDIDATES;
  const resolved = candidates.find((candidate) => candidate && fs.existsSync(candidate));

  if (!resolved) {
    throw new Error(
      "No supported Chromium browser was found. Set AIRBNB_BROWSER_PATH or pass --browser-path."
    );
  }

  return resolved;
}

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

async function promptForEnter(message) {
  if (!input.isTTY || !output.isTTY) {
    console.log(message);
    console.log("TTY input is not available, so the script will continue after 10 seconds.");
    await new Promise((resolve) => setTimeout(resolve, 10000));
    return;
  }

  const rl = readline.createInterface({ input, output });

  try {
    await rl.question(`${message}\nPress Enter to continue... `);
  } finally {
    rl.close();
  }
}

async function pauseBeforeClose(message, options) {
  if (options.headless || options.autoClose) {
    return;
  }

  await promptForEnter(message);
}

function normalizeFileName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildRequestId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function toAbsoluteAirbnbUrl(value) {
  return new URL(value, "https://www.airbnb.pt/").toString();
}

function getReservationsPageSize(apiUrl) {
  try {
    const parsed = new URL(apiUrl);
    const limit = Number.parseInt(parsed.searchParams.get("_limit") || "", 10);
    return Number.isInteger(limit) && limit > 0 ? limit : 40;
  } catch {
    return 40;
  }
}

function withReservationsOffset(apiUrl, offset) {
  const parsed = new URL(apiUrl);
  parsed.searchParams.set("_offset", String(offset));
  return parsed.toString();
}

function isLoginUrl(url) {
  return /\/login\b/i.test(url || "");
}

function findExistingInvoice(downloadsDir, item) {
  const expected = buildInvoiceFilePath(downloadsDir, item);
  return fs.existsSync(expected) ? expected : null;
}

function buildInvoiceFilePath(downloadsDir, item) {
  const parts = [item.code || "reservation", "vat-invoice"];
  if (item.invoiceNumber) {
    parts.push(normalizeFileName(item.invoiceNumber));
  } else if (item.invoicePath) {
    const invoiceSlug = String(item.invoicePath).split("/").filter(Boolean).at(-1);
    if (invoiceSlug) {
      parts.push(normalizeFileName(invoiceSlug));
    }
  }
  return path.join(downloadsDir, `${parts.join("__")}.pdf`);
}

async function saveDebugScreenshot(page, downloadsDir, label) {
  const filePath = path.join(downloadsDir, `debug-${normalizeFileName(label)}-${Date.now()}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => null);
  return filePath;
}

async function smartClickByText(page, labels, options = {}) {
  const selectors = options.selectors || [
    "button",
    "a",
    "label",
    "li",
    "span",
    "div",
    "[role='button']",
    "[role='menuitem']",
    "[role='option']"
  ];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const outcome = await page.evaluate(({ labels: wantedLabels, selectors: selectorList }) => {
      const normalize = (value) =>
        (value || "")
          .normalize("NFD")
          .replace(/\p{M}+/gu, "")
          .replace(/[.,]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      const visible = (element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const wanted = wantedLabels.map(normalize).filter(Boolean);
      const candidates = [];

      for (const element of document.querySelectorAll(selectorList.join(","))) {
        if (!visible(element)) continue;
        const text = normalize(element.getAttribute("aria-label") || element.textContent || "");
        if (!text || text.length > 120) continue;
        let score = -1;
        for (const target of wanted) {
          if (text === target) score = Math.max(score, 4000 - text.length);
          else if (text.startsWith(target)) score = Math.max(score, 3000 - text.length);
          else if (text.includes(target)) score = Math.max(score, 2000 - text.length);
        }
        if (score >= 0) candidates.push({ element, score });
      }

      candidates.sort((left, right) => right.score - left.score);
      const winner = candidates[0];
      if (!winner) return false;
      winner.element.scrollIntoView({ block: "center", inline: "center" });
      winner.element.click();
      return true;
    }, { labels, selectors });

    if (outcome) {
      return true;
    }

    await page.waitForTimeout(300);
  }

  if (options.bestEffort) {
    return false;
  }

  throw new Error(`Could not find a clickable element for [${labels.join(", ")}].`);
}

async function dismissCommonOverlays(page) {
  const labelsList = [
    ["Accept all", "Accept", "Aceitar", "Aceitar tudo"],
    ["Not now", "Agora nao", "Later", "Talvez mais tarde"],
    ["Close", "Fechar", "Dismiss"]
  ];

  for (const labels of labelsList) {
    await smartClickByText(page, labels, { timeoutMs: 1200, bestEffort: true });
  }
}

async function createContext(profileDir, browserPath, headless) {
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: browserPath,
    headless
  });
  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  return context;
}

async function extractRuntimeConfig(page) {
  const runtimeConfig = await page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    const apiKeyMatch = html.match(/"api_config":\{"key":"([^"]+)"/);
    const reservationsApiUrl = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\/api\/v2\/reservations\?/i.test(name))
      .at(-1);

    return {
      pageUrl: location.href,
      pageTitle: document.title,
      pageText: document.body.innerText.slice(0, 1200),
      apiKey: apiKeyMatch ? apiKeyMatch[1] : null,
      reservationsApiUrl: reservationsApiUrl || null
    };
  });

  if (!runtimeConfig.apiKey) {
    throw new Error("Could not find Airbnb's runtime API key on the prepared page.");
  }

  if (!runtimeConfig.reservationsApiUrl) {
    throw new Error(
      "Could not find the reservations API request on the prepared page. Open Completed Reservations, wait for the list to load, then try again."
    );
  }

  if (isLoginUrl(runtimeConfig.pageUrl) || /entrar ou registar|log in|sign up/i.test(runtimeConfig.pageText)) {
    throw new Error("The prepared page is not logged in. Log into Airbnb first.");
  }

  return runtimeConfig;
}

async function fetchReservationsPayload(page, apiKey, apiUrl) {
  const result = await page.evaluate(async ({ apiKey: currentApiKey, apiUrl: currentApiUrl }) => {
    const response = await fetch(currentApiUrl, {
      credentials: "include",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        "x-airbnb-api-key": currentApiKey,
        "x-airbnb-supports-airlock-v2": "true",
        "x-csrf-without-token": "1",
        "x-client-request-id": `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
      }
    });
    const text = await response.text();
    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      parsed,
      text: text.slice(0, 2000)
    };
  }, { apiKey, apiUrl });

  if (!result.ok || !Array.isArray(result.parsed?.reservations)) {
    throw new Error(
      `Failed to fetch reservations API data (${result.status}). ${result.parsed?.error_message || result.text}`
    );
  }

  return result.parsed;
}

async function fetchReservationsPayloadWithRetry(page, apiKey, apiUrl) {
  let lastError = null;

  for (let attemptIndex = 0; attemptIndex <= RESERVATIONS_API_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    try {
      return await fetchReservationsPayload(page, apiKey, apiUrl);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isRetryable = /Failed to fetch reservations API data \((429|503)\)/.test(message);

      if (!isRetryable || attemptIndex >= RESERVATIONS_API_RETRY_DELAYS_MS.length) {
        throw error;
      }

      const delayMs = RESERVATIONS_API_RETRY_DELAYS_MS[attemptIndex];
      logStep(
        `Reservations API rate-limited/unavailable on page fetch. Retrying in ${Math.round(delayMs / 1000)}s...`
      );
      await page.waitForTimeout(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function normalizeReservationCandidates(payload) {
  const reservations = Array.isArray(payload?.reservations) ? payload.reservations : [];
  const candidates = [];

  for (const reservation of reservations) {
    const invoices = Array.isArray(reservation.host_vat_invoices) ? reservation.host_vat_invoices : [];
    for (const invoice of invoices) {
      if (!invoice?.invoice_url) {
        continue;
      }

      candidates.push({
        code: reservation.confirmation_code || null,
        invoiceNumber: invoice.invoice_number || null,
        invoicePath: invoice.invoice_url,
        invoiceUrl: toAbsoluteAirbnbUrl(invoice.invoice_url),
        reservationUrl: reservation.confirmation_code
          ? `https://www.airbnb.pt/hosting/reservations/details/${reservation.confirmation_code}`
          : null,
        guestName: reservation.guest_user?.full_name || reservation.guest_user?.first_name || "",
        listingName: reservation.listing_name || "",
        bookedDate: reservation.booked_date || "",
        startDate: reservation.start_date || "",
        endDate: reservation.end_date || "",
        earnings: reservation.earnings || ""
      });
    }
  }

  return {
    reservationsCount: reservations.length,
    candidates
  };
}

async function collectInvoiceCandidates(page, runtimeConfig, options) {
  const pageSize = getReservationsPageSize(runtimeConfig.reservationsApiUrl);
  const firstPageUrl = withReservationsOffset(runtimeConfig.reservationsApiUrl, 0);
  const items = [];
  const seenKeys = new Set();

  for (let pageIndex = 0; pageIndex < Math.min(options.maxPages, MAX_API_PAGES); pageIndex += 1) {
    const offset = pageIndex * pageSize;
    const apiUrl = withReservationsOffset(firstPageUrl, offset);
    logStep(`Fetching reservations API page ${pageIndex + 1} (offset ${offset})`);

    if (pageIndex > 0) {
      await page.waitForTimeout(RESERVATIONS_API_PAGE_DELAY_MS);
    }

    const payload = await fetchReservationsPayloadWithRetry(page, runtimeConfig.apiKey, apiUrl);
    const pageResult = normalizeReservationCandidates(payload);

    if (pageResult.reservationsCount === 0) {
      break;
    }

    for (const item of pageResult.candidates) {
      const key = `${item.code || "unknown"}::${item.invoiceNumber || item.invoiceUrl}`;
      if (seenKeys.has(key)) {
        continue;
      }

      seenKeys.add(key);
      items.push(item);
    }

    if (options.limit && items.length >= options.limit) {
      break;
    }

    if (pageResult.reservationsCount < pageSize) {
      break;
    }
  }

  return options.limit ? items.slice(0, options.limit) : items;
}

async function exportInvoicePdf(invoicePage, item, downloadsDir) {
  const filePath = buildInvoiceFilePath(downloadsDir, item);
  const invoiceResponsePromise = invoicePage
    .waitForResponse((response) => /\/api\/v3\/InvoiceQuery\//i.test(response.url()) && response.ok(), {
      timeout: 15000
    })
    .catch(() => null);

  await invoicePage.goto(item.invoiceUrl, { waitUntil: "domcontentloaded" });
  await invoicePage.waitForTimeout(DEFAULT_PAGE_WAIT_MS);
  await invoiceResponsePromise;

  const state = await invoicePage.evaluate(() => ({
    url: location.href,
    title: document.title,
    text: document.body.innerText.slice(0, 1600)
  }));

  if (isLoginUrl(state.url) || /entrar ou registar|log in|sign up/i.test(state.text)) {
    throw new Error("The invoice page redirected to login.");
  }

  if (!/fatura|invoice|iva|vat/i.test(`${state.title} ${state.text}`)) {
    throw new Error("The loaded page does not look like an Airbnb invoice.");
  }

  await invoicePage.emulateMedia({ media: "print" });
  await invoicePage.pdf({
    path: filePath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "12mm",
      right: "12mm",
      bottom: "12mm",
      left: "12mm"
    }
  });

  return filePath;
}

async function captureRuntimeConfigInteractively(browserPath, options) {
  const context = await createContext(options.profileDir, browserPath, false);
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(options.startUrl, { waitUntil: "domcontentloaded" });
    await dismissCommonOverlays(page);

    await promptForEnter(
      [
        "Log into Airbnb in the opened browser window if needed.",
        "Open Completed Reservations and apply the exact filters/date range you want.",
        "Wait until the prepared list is visible before continuing."
      ].join("\n")
    );

    const runtimeConfig = await extractRuntimeConfig(page);
    logStep(`Captured prepared reservations page: ${runtimeConfig.pageUrl}`);
    return runtimeConfig;
  } catch (error) {
    await pauseBeforeClose(
      `Could not capture the prepared reservations page.\n${error instanceof Error ? error.message : error}\nPress Enter to close the browser.`,
      options
    );
    throw error;
  } finally {
    await context.close().catch(() => {});
  }
}

async function exportInvoices(browserPath, options, runtimeConfig) {
  const context = await createContext(options.profileDir, browserPath, true);
  const page = context.pages()[0] || (await context.newPage());

  try {
    await page.goto(runtimeConfig.pageUrl || options.startUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(DEFAULT_PAGE_WAIT_MS);

    if (isLoginUrl(page.url())) {
      throw new Error("The saved Airbnb browser session is no longer valid.");
    }

    const liveRuntimeConfig = await extractRuntimeConfig(page).catch(() => null);
    if (liveRuntimeConfig?.apiKey) {
      runtimeConfig.apiKey = liveRuntimeConfig.apiKey;
    }

    const candidates = await collectInvoiceCandidates(page, runtimeConfig, options);
    if (candidates.length === 0) {
      throw new Error("No VAT invoice URLs were found for the prepared reservations list.");
    }

    logStep(
      `Found ${candidates.length} invoice candidate(s): ${candidates
        .map((item) => item.code || item.invoiceNumber || item.invoiceUrl)
        .join(" | ")}`
    );

    if (options.dryRun) {
      for (const item of candidates) {
        console.log(
          `- ${item.code || "unknown"} | ${item.invoiceNumber || "no-invoice-number"} | ${item.invoiceUrl}`
        );
      }
      return;
    }

    const pendingItems = [];
    let skippedCount = 0;
    for (const item of candidates) {
      const existingFile = !options.overwrite ? findExistingInvoice(options.downloadsDir, item) : null;
      if (existingFile) {
        skippedCount += 1;
        continue;
      }

      pendingItems.push(item);
    }

    if (pendingItems.length === 0) {
      logStep(`No new invoice PDFs needed. ${skippedCount} already existed.`);
      return;
    }

    const workerCount = Math.min(options.concurrency, pendingItems.length);
    let nextIndex = 0;
    let completedCount = 0;

    logStep(
      `Preparing ${pendingItems.length} invoice(s) with ${workerCount} parallel worker(s)${
        skippedCount ? `, ${skippedCount} already existing` : ""
      }.`
    );

    await Promise.all(
      Array.from({ length: workerCount }, async (_, workerIndex) => {
        const workerPage = await context.newPage();
        const workerLabel = `worker-${workerIndex + 1}`;

        try {
          while (nextIndex < pendingItems.length) {
            const item = pendingItems[nextIndex];
            nextIndex += 1;

            try {
              await exportInvoicePdf(workerPage, item, options.downloadsDir);
              completedCount += 1;
              logStep(`Downloaded ${completedCount} / ${pendingItems.length}`);
            } catch (error) {
              const screenshotPath = await saveDebugScreenshot(
                workerPage,
                options.downloadsDir,
                `invoice-failed-${workerLabel}-${item.code || item.invoiceNumber || "unknown"}`
              );
              throw new Error(
                `Failed to export invoice ${item.invoiceNumber || item.invoiceUrl} for ${item.code || "unknown"}. ${
                  error instanceof Error ? error.message : error
                } Debug screenshot: ${screenshotPath}`
              );
            }
          }
        } finally {
          await workerPage.close().catch(() => {});
        }
      })
    );
  } finally {
    await context.close().catch(() => {});
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  await ensureDirectory(options.profileDir);
  await ensureDirectory(options.downloadsDir);

  const browserPath = resolveBrowserPath(options.browserPath);
  logStep(`Using browser: ${browserPath}`);

  const runtimeConfig = options.skipLoginPrompt
    ? {
        pageUrl: options.startUrl,
        reservationsApiUrl: null,
        apiKey: null
      }
    : await captureRuntimeConfigInteractively(browserPath, options);

  if (options.skipLoginPrompt) {
    const context = await createContext(options.profileDir, browserPath, true);
    try {
      const page = context.pages()[0] || (await context.newPage());
      await page.goto(options.startUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(DEFAULT_PAGE_WAIT_MS);
      Object.assign(runtimeConfig, await extractRuntimeConfig(page));
    } finally {
      await context.close().catch(() => {});
    }
  }

  await exportInvoices(browserPath, options, runtimeConfig);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
