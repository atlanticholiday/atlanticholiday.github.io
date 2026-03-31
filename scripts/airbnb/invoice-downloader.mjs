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
const DEFAULT_DOWNLOADS_DIR = path.resolve("downloads", "airbnb-invoices");
const DEFAULT_START_URL = "https://www.airbnb.com/hosting/reservations";
const DEFAULT_TIMEOUT_MS = 30000;

function printHelp() {
  console.log(`
Airbnb invoice downloader

Usage:
  npm run airbnb:download-invoices -- --from 2025-10 --to 2026-03 --format pdf

Options:
  --from YYYY-MM            First month to export. Defaults to the last 6 months.
  --to YYYY-MM              Last month to export. Defaults to the current month.
  --format pdf|csv          Export format. Default: pdf
  --profile-dir PATH        Persistent browser profile directory.
  --downloads-dir PATH      Target directory for downloaded files.
  --browser-path PATH       Override browser executable path.
  --start-url URL           Reservations page URL. Default: ${DEFAULT_START_URL}
  --limit N                 Export only the first N months from the computed range.
  --headless                Run without showing the browser window.
  --skip-login-prompt       Skip the first-run login/page-positioning pause.
  --dry-run                 Print the months that would be exported and exit.
  --help                    Show this help.

Notes:
  - First run is intentionally semi-manual: log into Airbnb and open the host
    Reservations page with the Export button visible, then press Enter.
  - The script reuses the saved browser profile on later runs.
  - Airbnb's bulk VAT invoice export is officially limited to the past 6 months
    in supported regions, so older invoices may need a different workflow.
`);
}

function parseArgs(argv) {
  const options = {
    format: "pdf",
    profileDir: DEFAULT_PROFILE_DIR,
    downloadsDir: DEFAULT_DOWNLOADS_DIR,
    browserPath: "",
    startUrl: DEFAULT_START_URL,
    headless: false,
    skipLoginPrompt: false,
    dryRun: false,
    help: false,
    limit: null,
    from: null,
    to: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const [key, inlineValue] = token.startsWith("--") ? token.split("=", 2) : [token, undefined];
    const nextValue = inlineValue ?? argv[index + 1];
    const consumeNext = inlineValue === undefined;

    switch (key) {
      case "--from":
        options.from = expectValue(key, nextValue);
        if (consumeNext) index += 1;
        break;
      case "--to":
        options.to = expectValue(key, nextValue);
        if (consumeNext) index += 1;
        break;
      case "--format":
        options.format = expectValue(key, nextValue).toLowerCase();
        if (consumeNext) index += 1;
        break;
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
      case "--headless":
        options.headless = true;
        break;
      case "--skip-login-prompt":
        options.skipLoginPrompt = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!["pdf", "csv"].includes(options.format)) {
    throw new Error(`Unsupported format "${options.format}". Use "pdf" or "csv".`);
  }

  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  return options;
}

function expectValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthOffset(date, offset) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function parseMonth(value, flagName) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${flagName} must use YYYY-MM format. Received "${value}".`);
  }

  const [yearText, monthText] = value.split("-");
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);

  if (month < 1 || month > 12) {
    throw new Error(`${flagName} has an invalid month: "${value}".`);
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

function formatMonthValue(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthRange(fromDate, toDate) {
  if (fromDate.getTime() > toDate.getTime()) {
    throw new Error(`--from ${formatMonthValue(fromDate)} cannot be after --to ${formatMonthValue(toDate)}.`);
  }

  const months = [];
  let cursor = fromDate;

  while (cursor.getTime() <= toDate.getTime()) {
    months.push(cursor);
    cursor = monthOffset(cursor, 1);
  }

  return months;
}

function buildMonthLabelCandidates(date) {
  const labels = new Set();
  const locales = ["en-US", "en-GB", "pt-PT", "pt-BR"];
  const formats = [
    { month: "long", year: "numeric" },
    { month: "short", year: "numeric" },
    { month: "long", year: "2-digit" },
    { month: "short", year: "2-digit" }
  ];

  for (const locale of locales) {
    for (const format of formats) {
      const label = new Intl.DateTimeFormat(locale, format).format(date);
      labels.add(label);
      labels.add(label.replace(/\./g, ""));
    }
  }

  const monthNumber = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear());
  const shortYear = year.slice(-2);
  labels.add(`${monthNumber}/${year}`);
  labels.add(`${monthNumber}/${shortYear}`);
  labels.add(`${year}-${monthNumber}`);

  return Array.from(labels);
}

function normalizeForFileName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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

async function dismissCommonOverlays(page) {
  const dismissTargets = [
    ["Accept all", "Accept", "Aceitar", "Aceitar tudo"],
    ["Not now", "Agora nao", "Later", "Talvez mais tarde"],
    ["Close", "Fechar", "Dismiss"]
  ];

  for (const labels of dismissTargets) {
    await smartClickByText(page, labels, { timeoutMs: 1500, bestEffort: true });
  }
}

function logStep(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function ensureDirectory(directoryPath) {
  await fs.promises.mkdir(directoryPath, { recursive: true });
}

async function pageHasVisibleDialog(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    return Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')).some(visible);
  });
}

async function smartClickByText(page, labels, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    bestEffort = false,
    selectors = [
      "button",
      "a",
      "label",
      "li",
      "span",
      "div",
      "input[type='button']",
      "input[type='submit']",
      "[role='button']",
      "[role='menuitem']",
      "[role='menuitemradio']",
      "[role='option']",
      "[tabindex]"
    ]
  } = options;

  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = [];

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

      const interactiveSelector = [
        "button",
        "a",
        "label",
        "li",
        "input[type='button']",
        "input[type='submit']",
        "[role='button']",
        "[role='menuitem']",
        "[role='menuitemradio']",
        "[role='option']",
        "[tabindex]"
      ].join(",");

      const wanted = wantedLabels.map(normalize).filter(Boolean);
      const modalRoots = Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')).filter(visible);
      const roots = modalRoots.length > 0 ? modalRoots : [document.body];
      const matches = [];

      const scoreText = (text) => {
        let best = -1;
        for (const target of wanted) {
          if (text === target) best = Math.max(best, 4000 - text.length);
          else if (text.startsWith(target)) best = Math.max(best, 3000 - text.length);
          else if (text.includes(target)) best = Math.max(best, 2000 - text.length);
          else if (target.includes(text)) best = Math.max(best, 1000 - text.length);
        }
        return best;
      };

      for (const root of roots) {
        for (const element of root.querySelectorAll(selectorList.join(","))) {
          const clickTarget = element.closest(interactiveSelector) || element;
          if (!visible(clickTarget)) continue;

          const rawText =
            clickTarget.getAttribute("aria-label") ||
            clickTarget.textContent ||
            element.getAttribute("aria-label") ||
            element.textContent ||
            "";
          const text = normalize(rawText);
          if (!text || text.length > 120) continue;

          const score = scoreText(text);
          if (score < 0) continue;

          matches.push({
            score,
            text,
            target: clickTarget
          });
        }
      }

      matches.sort((left, right) => right.score - left.score || left.text.length - right.text.length);
      const winner = matches[0];

      if (!winner) {
        const snapshot = [];
        for (const root of roots) {
          for (const element of root.querySelectorAll(selectorList.join(","))) {
            const clickTarget = element.closest(interactiveSelector) || element;
            if (!visible(clickTarget)) continue;
            const text = normalize(
              clickTarget.getAttribute("aria-label") || clickTarget.textContent || element.textContent || ""
            );
            if (!text || text.length > 80) continue;
            if (!snapshot.includes(text)) snapshot.push(text);
            if (snapshot.length >= 20) break;
          }
          if (snapshot.length >= 20) break;
        }

        return { ok: false, snapshot };
      }

      winner.target.scrollIntoView({ block: "center", inline: "center" });
      winner.target.click();
      return { ok: true, match: winner.text };
    }, { labels, selectors });

    if (outcome.ok) {
      return outcome.match;
    }

    lastSnapshot = outcome.snapshot || [];
    await page.waitForTimeout(350);
  }

  if (bestEffort) {
    return null;
  }

  const snapshotText = lastSnapshot.length > 0 ? ` Visible texts: ${lastSnapshot.join(" | ")}` : "";
  throw new Error(`Could not find a clickable element for [${labels.join(", ")}].${snapshotText}`);
}

async function selectFromAnyControl(page, labels) {
  const nativeSelects = page.locator("select");
  const nativeCount = await nativeSelects.count();

  for (let index = 0; index < nativeCount; index += 1) {
    const select = nativeSelects.nth(index);
    if (!(await select.isVisible().catch(() => false))) {
      continue;
    }

    const match = await select.evaluate((element, wantedLabels) => {
      const normalize = (value) =>
        (value || "")
          .normalize("NFD")
          .replace(/\p{M}+/gu, "")
          .replace(/[.,]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const wanted = wantedLabels.map(normalize);
      const options = Array.from(element.options).map((option) => ({
        value: option.value,
        label: normalize(option.label || option.textContent || "")
      }));

      let winner = null;
      for (const option of options) {
        for (const target of wanted) {
          if (option.label === target) {
            return option.value;
          }
          if (!winner && (option.label.includes(target) || target.includes(option.label))) {
            winner = option.value;
          }
        }
      }

      return winner;
    }, labels);

    if (match) {
      await select.selectOption(match);
      return true;
    }
  }

  const comboCandidates = page.locator(
    [
      "[role='combobox']",
      "button[aria-haspopup='listbox']",
      "button[aria-haspopup='menu']",
      "input[role='combobox']"
    ].join(", ")
  );
  const comboCount = await comboCandidates.count();

  for (let index = 0; index < comboCount; index += 1) {
    const combo = comboCandidates.nth(index);
    if (!(await combo.isVisible().catch(() => false))) {
      continue;
    }

    await combo.click().catch(() => null);
    await page.waitForTimeout(300);

    const selected = await smartClickByText(page, labels, {
      timeoutMs: 1500,
      bestEffort: true,
      selectors: ["li", "button", "span", "div", "[role='option']", "[role='menuitem']", "[role='menuitemradio']"]
    });

    if (selected) {
      return true;
    }

    await page.keyboard.press("Escape").catch(() => null);
  }

  return false;
}

async function openExportDialog(page) {
  try {
    await page.getByRole("button", { name: /export|exportar/i }).click({ timeout: 4000 });
  } catch {
    await smartClickByText(page, ["Export", "Exportar"], { timeoutMs: 8000 });
  }

  await page.waitForTimeout(700);
}

async function configureExport(page, monthDate, format) {
  const formatLabels = format === "csv" ? ["CSV", "Download CSV"] : ["PDF", "Download PDF"];
  const monthLabels = buildMonthLabelCandidates(monthDate);

  const formatSelected = await selectFromAnyControl(page, formatLabels);
  if (!formatSelected) {
    await smartClickByText(page, formatLabels, { timeoutMs: 5000 });
  }

  const monthSelected = await selectFromAnyControl(page, monthLabels);
  if (!monthSelected) {
    throw new Error(`Could not select month ${formatMonthValue(monthDate)} from the export dialog.`);
  }

  await page.waitForTimeout(500);
}

async function saveDebugScreenshot(page, downloadsDir, label) {
  const filePath = path.join(
    downloadsDir,
    `debug-${normalizeForFileName(label)}-${Date.now()}.png`
  );
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => null);
  return filePath;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const currentMonth = startOfMonth(new Date());
  const defaultFrom = monthOffset(currentMonth, -5);
  const fromDate = options.from ? parseMonth(options.from, "--from") : defaultFrom;
  const toDate = options.to ? parseMonth(options.to, "--to") : currentMonth;
  const monthRange = buildMonthRange(fromDate, toDate);
  const monthsToExport = options.limit ? monthRange.slice(0, options.limit) : monthRange;

  if (monthsToExport.length === 0) {
    throw new Error("No months matched the requested range.");
  }

  logStep(
    `Planned exports: ${monthsToExport.map((month) => formatMonthValue(month)).join(", ")} (${options.format.toUpperCase()})`
  );

  if (options.dryRun) {
    return;
  }

  await ensureDirectory(options.profileDir);
  await ensureDirectory(options.downloadsDir);

  const browserPath = resolveBrowserPath(options.browserPath);
  logStep(`Using browser: ${browserPath}`);

  const context = await chromium.launchPersistentContext(options.profileDir, {
    executablePath: browserPath,
    headless: options.headless,
    acceptDownloads: true
  });

  context.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  const page = context.pages()[0] || (await context.newPage());
  const manifest = {
    generatedAt: new Date().toISOString(),
    format: options.format,
    downloadsDir: options.downloadsDir,
    startUrl: options.startUrl,
    files: []
  };

  try {
    await page.goto("https://www.airbnb.com/", { waitUntil: "domcontentloaded" });
    await dismissCommonOverlays(page);

    if (!options.skipLoginPrompt) {
      await promptForEnter(
        [
          "Log into Airbnb in the opened browser window.",
          "Open the host Reservations page and make sure the Export button is visible.",
          "When the page is ready, come back here."
        ].join("\n")
      );

      if (page.url() && page.url() !== "about:blank") {
        options.startUrl = page.url();
      }

      manifest.startUrl = options.startUrl;
      logStep(`Captured start URL from the browser: ${options.startUrl}`);
    }

    for (const month of monthsToExport) {
      const monthValue = formatMonthValue(month);
      logStep(`Starting export for ${monthValue}`);

      try {
        await page.goto(options.startUrl, { waitUntil: "domcontentloaded" });
        await dismissCommonOverlays(page);
        await page.waitForTimeout(1200);

        await openExportDialog(page);

        if (!(await pageHasVisibleDialog(page))) {
          logStep("Export dialog was not detected as a modal. Continuing with page-level controls.");
        }

        await configureExport(page, month, options.format);

        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: DEFAULT_TIMEOUT_MS }),
          smartClickByText(page, ["Download", "Download CSV", "Download PDF", "Descarregar", "Baixar"], {
            timeoutMs: 8000
          })
        ]);

        const suggestedName = download.suggestedFilename();
        const targetName = `${monthValue}__${normalizeForFileName(suggestedName) || `airbnb-${monthValue}.${options.format}`}`;
        const targetPath = path.join(options.downloadsDir, targetName);
        await download.saveAs(targetPath);

        const failure = await download.failure();
        if (failure) {
          throw new Error(`Download failed for ${monthValue}: ${failure}`);
        }

        manifest.files.push({
          month: monthValue,
          format: options.format,
          filePath: targetPath,
          suggestedFilename: suggestedName
        });

        logStep(`Saved ${targetPath}`);
      } catch (error) {
        const screenshotPath = await saveDebugScreenshot(page, options.downloadsDir, `failed-${monthValue}`);
        throw new Error(
          [
            `Export failed for ${monthValue}.`,
            error instanceof Error ? error.message : String(error),
            `Debug screenshot: ${screenshotPath}`
          ].join(" ")
        );
      }
    }

    const manifestPath = path.join(options.downloadsDir, `manifest-${Date.now()}.json`);
    await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    logStep(`Wrote manifest: ${manifestPath}`);
  } finally {
    await context.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
