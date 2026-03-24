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
});
