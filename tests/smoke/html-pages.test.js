import { describe, test, assert } from "../test-harness.js";

describe("HTML smoke", () => {
  test("hidden dashboard cards stay hidden after dashboard styles load", async () => {
    const response = await fetch("../styles/main.css");
    assert.ok(response.ok, "Failed to fetch dashboard styles");

    const style = document.createElement("style");
    style.textContent = `.hidden { display: none; }\n${await response.text()}`;
    const card = document.createElement("button");
    card.className = "dashboard-card hidden";
    document.head.appendChild(style);
    document.body.appendChild(card);

    try {
      assert.equal(getComputedStyle(card).display, "none", "Restricted dashboard cards must not be visible");
    } finally {
      card.remove();
      style.remove();
    }
  });

  test("closed heated-pool dialogs stay hidden outside their page", async () => {
    const response = await fetch("../styles/main.css");
    assert.ok(response.ok, "Failed to fetch dashboard styles");

    const style = document.createElement("style");
    style.textContent = `.hidden { display: none; }\n${await response.text()}`;
    const dialog = document.createElement("div");
    dialog.className = "heated-pools-dialog hidden";
    document.head.appendChild(style);
    document.body.appendChild(dialog);

    try {
      assert.equal(getComputedStyle(dialog).display, "none", "Closed Heated Pools dialogs must not block login or other pages");
    } finally {
      dialog.remove();
      style.remove();
    }
  });

  test("floating quick search stays out of the Tasks workspace", async () => {
    const response = await fetch("../styles/tasks.css");
    assert.ok(response.ok, "Failed to fetch Tasks styles");

    const style = document.createElement("style");
    style.textContent = await response.text();
    const page = document.createElement("div");
    page.id = "tasks-page";
    const trigger = document.createElement("button");
    trigger.className = "quick-search-trigger";
    document.head.appendChild(style);
    document.body.append(page, trigger);

    try {
      assert.equal(getComputedStyle(trigger).display, "none", "Quick search must not cover the Tasks drawer");
    } finally {
      trigger.remove();
      page.remove();
      style.remove();
    }
  });

  test("main pages are present and contain expected anchors", async () => {
    const pages = [
      { path: "../index.html", markers: ["main-app", "landing-page", "time-clock-page", "vacation-board-container", "schedule-access-banner", "go-to-tasks-btn", "tasks-page", "vacation-center-page", "vacation-center-root", "vacation-type-select", "go-to-airbnb-reservation-invoices-btn", "airbnb-reservation-invoices-page", "go-to-operational-guidelines-btn", "operational-guidelines-page", "operational-guidelines-root", "go-to-build-planner-btn", "build-planner-page", "go-to-nuki-doors-btn", "nuki-doors-page", "nuki-doors-root"] },
      { path: "../property-settings.html", markers: ["property-settings-form", "save-settings"] },
      { path: "../inventory.html", markers: ["inventory"] }
    ];

    for (const page of pages) {
      const response = await fetch(page.path);
      assert.ok(response.ok, `Failed to fetch ${page.path}`);
      const html = await response.text();

      assert.includes(html.toLowerCase(), "<!doctype html", `${page.path} is missing a doctype`);
      assert.includes(html, 'src="js/core/theme-manager.js"', `${page.path} is missing the theme manager`);
      assert.includes(html, 'href="styles/theme.css?v=20260829-black-theme"', `${page.path} is missing theme styles`);
      page.markers.forEach((marker) => {
        assert.includes(html, marker, `${page.path} is missing marker ${marker}`);
      });

      if (page.path === "../index.html") {
        const documentRef = new DOMParser().parseFromString(html, "text/html");
        assert.equal(documentRef.getElementById("welcome-packs-page")?.parentElement?.tagName, "BODY", "welcome-packs-page should be a top-level page");
        assert.equal(documentRef.getElementById("operational-guidelines-page")?.parentElement?.tagName, "BODY", "operational-guidelines-page should be a top-level page");
        assert.equal(documentRef.getElementById("vacation-center-page")?.parentElement?.tagName, "BODY", "vacation-center-page should be a top-level page");
        assert.equal(documentRef.getElementById("staff-page")?.parentElement?.tagName, "BODY", "staff-page should be a top-level page");
        assert.equal(documentRef.getElementById("tasks-page")?.parentElement?.tagName, "BODY", "tasks-page should be a top-level page");
      }
    }
  });
});
