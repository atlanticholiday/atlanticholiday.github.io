import { describe, test, assert } from "../test-harness.js";

describe("HTML smoke", () => {
  test("main pages are present and contain expected anchors", async () => {
    const pages = [
      { path: "../index.html", markers: ["main-app", "landing-page", "time-clock-page"] },
      { path: "../property-settings.html", markers: ["property-settings-form", "save-settings"] },
      { path: "../inventory.html", markers: ["inventory"] }
    ];

    for (const page of pages) {
      const response = await fetch(page.path);
      assert.ok(response.ok, `Failed to fetch ${page.path}`);
      const html = await response.text();

      assert.includes(html.toLowerCase(), "<!doctype html", `${page.path} is missing a doctype`);
      page.markers.forEach((marker) => {
        assert.includes(html, marker, `${page.path} is missing marker ${marker}`);
      });
    }
  });
});
