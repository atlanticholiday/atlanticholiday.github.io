import { describe, test, assert } from "../test-harness.js";
import { getAppAccessOption } from "../../js/shared/app-access.js";

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
      { path: "../index.html", markers: ["main-app", "landing-page", "time-clock-page", "vacation-board-container", "schedule-access-banner", "go-to-tasks-btn", "tasks-page", "vacation-center-page", "vacation-center-root", "vacation-type-select", "go-to-airbnb-reservation-invoices-btn", "airbnb-reservation-invoices-page", "go-to-operational-guidelines-btn", "operational-guidelines-page", "operational-guidelines-root", "go-to-build-planner-btn", "build-planner-page"] },
      { path: "../property-settings.html", markers: ["property-settings-form", "save-settings"] },
      { path: "../inventory.html", markers: ["inventory"] }
    ];

    for (const page of pages) {
      const response = await fetch(page.path);
      assert.ok(response.ok, `Failed to fetch ${page.path}`);
      const html = await response.text();

      assert.includes(html.toLowerCase(), "<!doctype html", `${page.path} is missing a doctype`);
      assert.includes(html, 'src="js/core/theme-manager.js"', `${page.path} is missing the theme manager`);
      assert.includes(html, 'href="styles/theme.css?v=20260829-dark-controls"', `${page.path} is missing theme styles`);
      page.markers.forEach((marker) => {
        assert.includes(html, marker, `${page.path} is missing marker ${marker}`);
      });

      if (page.path === "../index.html") {
        const documentRef = new DOMParser().parseFromString(html, "text/html");
        assert.equal(documentRef.querySelector("#landing-page .dashboard-logo")?.getAttribute("src"), "assets/atlantic-holiday-logo.svg", "Landing header should use the tightly cropped logo");
        assert.equal(documentRef.getElementById("welcome-packs-page")?.parentElement?.tagName, "BODY", "welcome-packs-page should be a top-level page");
        assert.equal(documentRef.getElementById("operational-guidelines-page")?.parentElement?.tagName, "BODY", "operational-guidelines-page should be a top-level page");
        assert.equal(documentRef.getElementById("vacation-center-page")?.parentElement?.tagName, "BODY", "vacation-center-page should be a top-level page");
        assert.equal(documentRef.getElementById("staff-page")?.parentElement?.tagName, "BODY", "staff-page should be a top-level page");
        assert.equal(documentRef.getElementById("tasks-page")?.parentElement?.tagName, "BODY", "tasks-page should be a top-level page");
      }
    }
  });

  test("archived tools live only inside Show More Tools and keep their pages", async () => {
    const response = await fetch("../index.html");
    assert.ok(response.ok);
    const documentRef = new DOMParser().parseFromString(await response.text(), "text/html");
    const section = documentRef.getElementById("more-tools-section");
    assert.ok(section?.classList.contains("hidden"), "Other Tools should start collapsed");

    for (const key of ["operationalGuidelines", "vehicles", "airbnbReservationInvoices", "reservations"]) {
      const option = getAppAccessOption(key);
      assert.equal(option.group, "more", key + " should be classified as More tools");
      assert.equal(documentRef.querySelectorAll("#" + option.buttonId).length, 1);
      const card = documentRef.getElementById(option.buttonId);
      assert.equal(card.parentElement.id, "other-tools-grid");
      assert.ok(section.contains(card));
      assert.ok(documentRef.getElementById(option.buttonId.replace("go-to-", "").replace("-btn", "-page")));
    }

    assert.equal(documentRef.querySelector('[id*="nuki"]'), null, "Nuki UI must be removed");
    assert.equal(documentRef.getElementById("finance-owners-grid"), null, "Do not leave an empty Finance category");
    assert.ok(documentRef.getElementById("services-logistics-grid"), "Keep the container used by Laundry and Linen Inventory");

    // Run only the landing toggle in an isolated document, without booting Firebase.
    const toggleScript = Array.from(documentRef.querySelectorAll("#landing-page script"))
      .find((script) => script.textContent.includes("updateMoreToolsToggleLabel"));
    assert.ok(toggleScript);
    const frame = document.createElement("iframe");
    try {
      const loaded = new Promise((resolve) => { frame.onload = resolve; });
      frame.srcdoc = '<button id="toggle-more-tools-btn"></button><span id="more-tools-icon"></span>'
        + section.outerHTML + '<script>' + toggleScript.textContent + '<\/script>';
      document.body.appendChild(frame);
      await loaded;
      const frameDocument = frame.contentDocument;
      const toggle = frameDocument.getElementById("toggle-more-tools-btn");
      const toolsSection = frameDocument.getElementById("more-tools-section");
      toggle.click();
      assert.ok(!toolsSection.classList.contains("hidden"), "Show More Tools should expand");
      toggle.click();
      assert.ok(toolsSection.classList.contains("hidden"), "Show More Tools should collapse again");
    } finally {
      frame.remove();
    }
  });

  test("retired door integration has no runtime wiring or backend handlers", async () => {
    for (const path of [
      "../js/app/main.js",
      "../js/features/scheduling/navigation-manager.js",
      "../js/features/scheduling/app-switcher.js",
      "../js/features/search/quick-search-manager.js",
      "../js/features/admin/access-preview.js",
      "../js/features/admin/user-management-controller.js",
      "../functions/index.js",
      "../firestore.rules",
      "../locales/en.json",
      "../locales/pt.json"
    ]) {
      const response = await fetch(path);
      assert.ok(response.ok);
      assert.ok(!/nuki/i.test(await response.text()), path + " must not retain Nuki integration code");
    }
  });

  test("black theme covers header controls, floating search and Laundry Log canvas", async () => {
    const response = await fetch("../styles/theme.css?v=20260829-dark-controls");
    assert.ok(response.ok, "Failed to fetch theme styles");

    const previousTheme = document.documentElement.dataset.theme;
    const style = document.createElement("style");
    style.textContent = await response.text();
    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <button class="app-switcher-trigger">Apps</button>
      <button class="landing-search-btn"><kbd>Ctrl K</kbd></button>
      <button class="landing-sign-out-btn">Sign Out</button>
      <button class="quick-search-trigger">Search</button>
      <section id="laundry-log-page" class="bg-stone-50"></section>
    `;
    document.head.appendChild(style);
    document.body.appendChild(fixture);
    document.documentElement.dataset.theme = "dark";

    try {
      const expectedSurface = "rgb(32, 32, 36)";
      assert.equal(getComputedStyle(fixture.querySelector(".app-switcher-trigger")).backgroundColor, expectedSurface, "Apps control should use a dark surface");
      assert.equal(getComputedStyle(fixture.querySelector(".landing-search-btn")).backgroundColor, expectedSurface, "Header search should use a dark surface");
      assert.equal(getComputedStyle(fixture.querySelector(".landing-sign-out-btn")).backgroundColor, expectedSurface, "Sign Out should use a dark surface");
      assert.equal(getComputedStyle(fixture.querySelector(".quick-search-trigger")).backgroundColor, expectedSurface, "Floating search should use a dark surface");
      assert.equal(getComputedStyle(fixture.querySelector("#laundry-log-page")).backgroundColor, "rgb(9, 9, 11)", "Laundry Log should use the dark canvas");
    } finally {
      if (previousTheme) {
        document.documentElement.dataset.theme = previousTheme;
      } else {
        delete document.documentElement.dataset.theme;
      }
      fixture.remove();
      style.remove();
    }
  });
});
