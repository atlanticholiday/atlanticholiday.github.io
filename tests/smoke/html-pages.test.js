import { describe, test, assert } from "../test-harness.js";

describe("HTML smoke", () => {
  test("main pages are present and contain expected anchors", async () => {
    const pages = [
      { path: "../index.html", markers: ["main-app", "landing-page", "time-clock-page", "vacation-board-container", "schedule-access-banner", "go-to-airbnb-reservation-invoices-btn", "airbnb-reservation-invoices-page", "go-to-operational-guidelines-btn", "operational-guidelines-page", "operational-guidelines-root", "go-to-build-planner-btn", "build-planner-page"] },
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

      if (page.path === "../index.html") {
        const documentRef = new DOMParser().parseFromString(html, "text/html");
        assert.equal(documentRef.getElementById("welcome-packs-page")?.parentElement?.tagName, "BODY", "welcome-packs-page should be a top-level page");
        assert.equal(documentRef.getElementById("operational-guidelines-page")?.parentElement?.tagName, "BODY", "operational-guidelines-page should be a top-level page");
        assert.equal(documentRef.getElementById("staff-page")?.parentElement?.tagName, "BODY", "staff-page should be a top-level page");
      }
    }
  });
});
