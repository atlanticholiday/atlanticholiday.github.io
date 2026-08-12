import { describe, test, assert } from "../../../test-harness.js";
import { createStorageMock, resetDom } from "../../../test-utils.js";
import { NavigationManager } from "../../../../js/features/scheduling/navigation-manager.js";

describe("NavigationManager", () => {
  test("restores recent app pages from local storage", () => {
    resetDom("");
    const storage = createStorageMock({
      "atlantic-holiday-recent-pages": JSON.stringify(["vacationCenter", "schedule", "vacationCenter", "login", "unknown"])
    });
    const navigationManager = new NavigationManager({ storage });

    assert.deepEqual(navigationManager.getRecentPages(), ["vacationCenter", "schedule"]);
  });

  test("keeps the 10 most recent unique app pages", () => {
    resetDom(`
      <div id="properties-page"></div>
      <div id="welcome-packs-page"></div>
      <div id="laundry-log-page"></div>
      <div id="linen-inventory-page"></div>
      <div id="airbnb-reservation-invoices-page"></div>
      <div id="operational-guidelines-page"></div>
      <div id="heated-pools-page"></div>
      <div id="app-content"></div>
      <div id="reservations-page"></div>
      <div id="time-clock-page"></div>
      <div id="allinfo-page"></div>
      <div id="rnal-page"></div>
    `);
    const storage = createStorageMock();
    const navigationManager = new NavigationManager({ storage });

    [
      "properties",
      "welcomePacks",
      "laundryLog",
      "linenInventory",
      "airbnbReservationInvoices",
      "operationalGuidelines",
      "heatedPools",
      "schedule",
      "reservations",
      "timeClock",
      "allinfo",
      "rnal"
    ].forEach((pageName) => navigationManager.showPage(pageName));

    assert.equal(navigationManager.getRecentPages().length, 10);
    assert.equal(navigationManager.getRecentPages()[0], "rnal");
    assert.ok(!navigationManager.getRecentPages().includes("properties"));
    assert.ok(!navigationManager.getRecentPages().includes("welcomePacks"));

    navigationManager.showPage("schedule");
    assert.equal(navigationManager.getRecentPages()[0], "schedule");
    assert.equal(new Set(navigationManager.getRecentPages()).size, 10);
    assert.equal(JSON.parse(storage.getItem("atlantic-holiday-recent-pages"))[0], "schedule");
  });

  test("Vacation Center back returns to the actual previous page", () => {
    resetDom(`
      <button id="back-to-landing-from-vacation-center-btn">Back</button>
      <div id="landing-page"></div>
      <div id="app-content" class="hidden"></div>
      <div id="vacation-center-page" class="hidden"></div>
    `);
    const navigationManager = new NavigationManager({ storage: createStorageMock() });
    navigationManager.setupNavigationListeners();

    navigationManager.showLandingPage();
    navigationManager.showSchedulePage();
    navigationManager.showVacationCenterPage();
    document.getElementById("back-to-landing-from-vacation-center-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "schedule");
    assert.ok(!document.getElementById("app-content").classList.contains("hidden"));
    assert.ok(document.getElementById("vacation-center-page").classList.contains("hidden"));
  });

  test("app switcher groups apps under static categories and filters them by search", () => {
    resetDom(`
      <div id="main-app">
        <div id="landing-page">
          <header class="dashboard-header"><div class="header-right"></div></header>
          <button id="go-to-time-clock-btn"><h3>Time Clock</h3></button>
          <button id="go-to-schedule-btn"><h3>Work Schedule</h3></button>
          <button id="go-to-vacation-center-btn"><h3>Centro de Férias</h3></button>
          <button id="go-to-staff-btn"><h3>Staff</h3></button>
          <button id="go-to-reservations-btn"><h3>Weekly Reservations</h3></button>
          <button id="go-to-heated-pools-btn"><h3>Heated Pools</h3></button>
        </div>
        <div id="time-clock-page" class="hidden"></div>
        <div id="app-content" class="hidden"></div>
        <div id="vacation-center-page" class="hidden"></div>
        <div id="staff-page" class="hidden"></div>
        <div id="reservations-page" class="hidden"></div>
        <div id="heated-pools-page" class="hidden"></div>
      </div>
    `);
    const navigationManager = new NavigationManager({ storage: createStorageMock() });
    navigationManager.setupNavigationListeners();

    document.querySelector("[data-app-switcher-trigger]").click();

    const categories = Array.from(document.querySelectorAll("[data-app-switcher-category]"));
    assert.equal(categories.length, 2);
    assert.ok(categories.every((category) => category.querySelector("h3")?.textContent.trim()));
    assert.equal(categories[0].querySelectorAll("[data-app-switcher-page]").length, 4);
    assert.equal(categories[1].querySelectorAll("[data-app-switcher-page]").length, 2);

    const searchInput = document.querySelector("[data-app-switcher-search]");
    searchInput.value = "ferias";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    assert.equal(document.querySelector('[data-app-switcher-page="vacationCenter"]').hidden, false);
    assert.equal(document.querySelector('[data-app-switcher-page="schedule"]').hidden, true);
    assert.equal(document.querySelector("[data-app-switcher-recent-section]").hidden, true);

    searchInput.value = "missing app";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(document.querySelector("[data-app-switcher-no-results]").hidden, false);
    assert.ok(categories.every((category) => category.hidden));
  });

  test("routes to welcome packs and back to landing", () => {
    resetDom(`
      <button id="go-to-welcome-packs-btn">Welcome Packs</button>
      <button id="back-to-landing-from-welcome-btn">Back</button>
      <div id="landing-page"></div>
      <div id="welcome-packs-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let welcomeEventCount = 0;
    document.addEventListener("welcomePacksPageOpened", () => {
      welcomeEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-welcome-packs-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "welcomePacks");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("welcome-packs-page").classList.contains("hidden"));
    assert.equal(welcomeEventCount, 1);

    document.getElementById("back-to-landing-from-welcome-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("welcome-packs-page").classList.contains("hidden"));
  });

  test("routes to Airbnb reservation invoices and back to landing", () => {
    resetDom(`
      <button id="go-to-airbnb-reservation-invoices-btn">Airbnb VAT Invoices</button>
      <button id="back-to-landing-from-airbnb-reservation-invoices-btn">Back</button>
      <div id="landing-page"></div>
      <div id="airbnb-reservation-invoices-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("airbnbReservationInvoicesPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-airbnb-reservation-invoices-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "airbnbReservationInvoices");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("airbnb-reservation-invoices-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-airbnb-reservation-invoices-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("airbnb-reservation-invoices-page").classList.contains("hidden"));
  });

  test("routes to laundry log and back to landing", () => {
    resetDom(`
      <button id="go-to-laundry-log-btn">Laundry Log</button>
      <button id="back-to-landing-from-laundry-log-btn">Back</button>
      <div id="landing-page"></div>
      <div id="laundry-log-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("laundryLogPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-laundry-log-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "laundryLog");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("laundry-log-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-laundry-log-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("laundry-log-page").classList.contains("hidden"));
  });

  test("routes to linen inventory and back to landing", () => {
    resetDom(`
      <button id="go-to-linen-inventory-btn">Linen Inventory</button>
      <button id="back-to-landing-from-linen-inventory-btn">Back</button>
      <div id="landing-page"></div>
      <div id="linen-inventory-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("linenInventoryPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-linen-inventory-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "linenInventory");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("linen-inventory-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-linen-inventory-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("linen-inventory-page").classList.contains("hidden"));
  });

  test("routes to build planner and back to landing", () => {
    resetDom(`
      <button id="go-to-build-planner-btn">Build Planner</button>
      <button id="back-to-landing-from-build-planner-btn">Back</button>
      <div id="landing-page"></div>
      <div id="build-planner-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("buildPlannerPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-build-planner-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "buildPlanner");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("build-planner-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-build-planner-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("build-planner-page").classList.contains("hidden"));
  });

  test("routes to Nuki doors and back to landing", () => {
    resetDom(`
      <button id="go-to-nuki-doors-btn">Nuki Doors</button>
      <button id="back-to-landing-from-nuki-doors-btn">Back</button>
      <div id="landing-page"></div>
      <div id="nuki-doors-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("nukiDoorsPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-nuki-doors-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "nukiDoors");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("nuki-doors-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-nuki-doors-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("nuki-doors-page").classList.contains("hidden"));
  });

  test("routes to Vacation Center and back to landing", () => {
    resetDom(`
      <button id="go-to-vacation-center-btn">Vacation Center</button>
      <button id="back-to-landing-from-vacation-center-btn">Back</button>
      <div id="landing-page"></div>
      <div id="vacation-center-page" class="hidden"></div>
    `);

    const navigationManager = new NavigationManager();
    navigationManager.setupNavigationListeners();

    let pageEventCount = 0;
    document.addEventListener("vacationCenterPageOpened", () => {
      pageEventCount += 1;
    }, { once: true });

    document.getElementById("go-to-vacation-center-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "vacationCenter");
    assert.ok(document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(!document.getElementById("vacation-center-page").classList.contains("hidden"));
    assert.equal(pageEventCount, 1);

    document.getElementById("back-to-landing-from-vacation-center-btn").click();

    assert.equal(navigationManager.getCurrentPage(), "landing");
    assert.ok(!document.getElementById("landing-page").classList.contains("hidden"));
    assert.ok(document.getElementById("vacation-center-page").classList.contains("hidden"));
  });
});
