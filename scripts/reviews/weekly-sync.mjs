import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const LOG_FILE = path.resolve("logs", "reviews-weekly-sync.log");
fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {}
}

async function main() {
  log("🚀 Starting scheduled weekly reviews & ratings sync...");

  try {
    // 1. Run sync-reviews.mjs in headless mode
    log("Scraping updated reviews & ratings...");
    execSync("node scripts/reviews/sync-reviews.mjs", { stdio: "inherit" });
    log("✅ Scrape complete.");

    // 2. Commit and push updated dataset to GitHub Pages
    log("Committing updated property-reviews.json to git...");
    execSync("git add server-data/property-reviews.json", { stdio: "pipe" });
    
    const status = execSync("git status --porcelain server-data/property-reviews.json", { encoding: "utf8" });
    if (status.trim()) {
      const dateStr = new Date().toISOString().slice(0, 10);
      execSync(`git commit -m "Auto-sync weekly reviews & ratings: ${dateStr}"`, { stdio: "pipe" });
      log("Pushing updates to GitHub main branch...");
      execSync("git push origin main", { stdio: "inherit" });
      log("✅ Successfully pushed updated reviews to GitHub Pages!");
    } else {
      log("ℹ️ No data changes detected in property-reviews.json.");
    }

    log("🎉 Weekly sync finished successfully.");
  } catch (err) {
    log(`❌ Error during weekly sync: ${err.message}`);
    process.exit(1);
  }
}

main();
