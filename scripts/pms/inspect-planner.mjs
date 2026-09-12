import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BROWSER_PATH = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PROFILE_DIR = path.resolve(".pms-playwright");
const CACHE_DIR = path.resolve(".cache");

async function main() {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });

  console.log("🔍 Connecting to Edge with saved session...");

  // Clean any existing process
  try {
    const { execSync } = await import("node:child_process");
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = 'msedge.exe'\\" | Where-Object { $_.CommandLine -like '*${PROFILE_DIR}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`,
      { stdio: "ignore" }
    );
  } catch {}

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    executablePath: BROWSER_PATH,
    headless: false,
    viewport: { width: 1440, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  console.log("🚀 Navigating to Planner...");
  await page.goto("https://app.avantio.pro/index.php?module=Planner&action=index", {
    waitUntil: "networkidle",
    timeout: 30000
  }).catch(() => {});

  console.log(`📄 Page Title: ${await page.title()}`);
  console.log(`🔗 Current URL: ${page.url()}`);

  const inspection = await page.evaluate(() => {
    const result = {
      globalKeys: [],
      matchedScriptSnippets: [],
      domSample: "",
      foundProperties: []
    };

    // 1. Look for interesting window variables
    for (const key of Object.keys(window)) {
      if (/plan|accomm|occup|book|event|reser|tape|chart|matrix|aloj/i.test(key)) {
        result.globalKeys.push(key);
      }
    }

    // 2. Search scripts for embedded data
    const scripts = document.querySelectorAll("script");
    scripts.forEach((s, idx) => {
      const txt = s.textContent || "";
      if (txt.includes("Casinha") || txt.includes("Acanto") || txt.includes("Acqua")) {
        result.matchedScriptSnippets.push({
          index: idx,
          snippet: txt.slice(0, 500)
        });
      }
    });

    // 3. Search DOM for text "A Casinha"
    const allElements = Array.from(document.querySelectorAll("*"));
    const match = allElements.find((el) => el.children.length === 0 && el.textContent.includes("Casinha"));
    if (match) {
      let parent = match;
      for (let i = 0; i < 4; i++) {
        if (parent.parentElement) parent = parent.parentElement;
      }
      result.domSample = parent.outerHTML.slice(0, 1500);
    }

    // 4. Try to find all accommodation row labels in DOM
    const candidateRows = document.querySelectorAll('[class*="row"], tr, div');
    candidateRows.forEach((row) => {
      const text = row.textContent || "";
      if (text.includes("4p/") || text.includes("6p/") || text.includes("2p/")) {
        const firstLine = text.trim().split("\n")[0].trim();
        if (firstLine.length < 60 && !result.foundProperties.includes(firstLine)) {
          result.foundProperties.push(firstLine);
        }
      }
    });

    return result;
  });

  console.log("\n📊 INSPECTION RESULTS:");
  console.log(`- Matched window globals: ${inspection.globalKeys.join(", ") || "none"}`);
  console.log(`- Matched inline scripts containing property names: ${inspection.matchedScriptSnippets.length}`);
  console.log(`- Detected properties in DOM: ${inspection.foundProperties.length}`);
  if (inspection.foundProperties.length) {
    console.log(`  Sample properties: ${inspection.foundProperties.slice(0, 5).join(", ")}`);
  }

  const dumpPath = path.join(CACHE_DIR, "planner-inspection.json");
  await fs.promises.writeFile(dumpPath, JSON.stringify(inspection, null, 2), "utf8");
  console.log(`💾 Saved inspection report to ${dumpPath}`);

  if (inspection.domSample) {
    const htmlDumpPath = path.join(CACHE_DIR, "planner-dom-sample.html");
    await fs.promises.writeFile(htmlDumpPath, inspection.domSample, "utf8");
    console.log(`💾 Saved DOM sample to ${htmlDumpPath}`);
  }

  await context.close();
}

main().catch(console.error);
