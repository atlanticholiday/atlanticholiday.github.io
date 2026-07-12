import { describe, test, assert } from "../test-harness.js";

describe("PWA", () => {
  test("main pages expose install metadata and service worker registration", async () => {
    const pages = ["../index.html", "../inventory.html", "../property-settings.html"];

    for (const page of pages) {
      const response = await fetch(page);
      assert.ok(response.ok, `Failed to fetch ${page}`);
      const html = await response.text();

      assert.includes(html, 'rel="manifest" href="manifest.webmanifest"', `${page} is missing manifest link`);
      assert.includes(html, 'rel="apple-touch-icon" sizes="180x180" href="assets/icons/icon-180.png"', `${page} is missing apple touch icon`);
      assert.includes(html, 'src="js/pwa-register.js"', `${page} is missing service worker registration`);
      assert.includes(html, 'name="theme-color"', `${page} is missing theme color`);
    }
  });

  test("manifest has installable app identity and icons", async () => {
    const response = await fetch("../manifest.webmanifest");
    assert.ok(response.ok, "Failed to fetch manifest");

    const manifest = await response.json();
    assert.equal(manifest.name, "Atlantic Holiday");
    assert.equal(manifest.start_url, "./index.html");
    assert.equal(manifest.display, "standalone");
    assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.src === "assets/icons/icon-192.png"), "Manifest is missing 192 icon");
    assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.src === "assets/icons/icon-512.png"), "Manifest is missing 512 icon");
  });

  test("service worker provides install, activate, and fetch handlers", async () => {
    const response = await fetch("../service-worker.js");
    assert.ok(response.ok, "Failed to fetch service worker");

    const serviceWorker = await response.text();
    assert.includes(serviceWorker, 'addEventListener("install"', "Service worker is missing install handler");
    assert.includes(serviceWorker, 'addEventListener("activate"', "Service worker is missing activate handler");
    assert.includes(serviceWorker, 'addEventListener("fetch"', "Service worker is missing fetch handler");
  });
});
