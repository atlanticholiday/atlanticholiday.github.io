import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { NavigationManager } from "../../../../js/features/scheduling/navigation-manager.js";

describe("NavigationManager", () => {
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
});
