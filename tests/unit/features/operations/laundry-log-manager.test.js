import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { LaundryLogManager } from "../../../../js/features/operations/laundry-log-manager.js";
import { createLaundryLogRecord } from "../../../../js/features/operations/laundry-log-utils.js";

describe("LaundryLogManager", () => {
  test("renders separate entry, returns, and completed workspaces with section navigation", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-welcome-packs-btn"></button>
    `);

    const manager = new LaundryLogManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.records = [
      createLaundryLogRecord({
        propertyName: "Atlantic View",
        deliveryDate: "2026-04-10",
        items: {
          bathTowel: { delivered: 4, received: 0 }
        }
      }, {
        now: () => "2026-04-10T10:00:00.000Z"
      })
    ];

    manager.activeWorkspace = "completed";
    manager.render();

    assert.ok(document.getElementById("laundry-log-search-input"));
    assert.ok(!document.getElementById("laundry-log-property-input"));

    manager.switchWorkspace("returns");
    assert.ok(document.querySelector("[data-laundry-action='edit']"));
    assert.ok(!document.getElementById("laundry-log-property-input"));

    manager.switchWorkspace("entry");

    assert.ok(document.getElementById("laundry-log-property-input"));
    assert.equal(document.querySelectorAll("[data-laundry-action='jump-section']").length, 5);
  });
});
