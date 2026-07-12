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
    assert.ok(document.querySelector("[data-laundry-action='add-custom-item']"));
  });

  test("adds manual other items without using the fixed item list", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-welcome-packs-btn"></button>
    `);

    const manager = new LaundryLogManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.render();

    document.getElementById("laundry-log-property-input").value = "Atlantic View";
    document.querySelector("[data-laundry-action='add-custom-item']").click();

    document.querySelector("[data-laundry-custom-field='name']").value = "Beach bags";
    document.querySelector("[data-laundry-custom-field='delivered']").value = "3";
    document.querySelector("[data-laundry-custom-field='received']").value = "2";

    const draft = manager.readDraftFromDom();

    assert.equal(document.querySelectorAll("[data-laundry-custom-field='name']").length, 1);
    assert.equal(draft.customItems.length, 1);
    assert.equal(draft.customItems[0].name, "Beach bags");
    assert.equal(draft.customItems[0].delivered, 3);
    assert.equal(draft.customItems[0].received, 2);
  });

  test("warns when current out counts are lower than the previous completed return", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-welcome-packs-btn"></button>
    `);

    const manager = new LaundryLogManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.records = [
      {
        id: "previous",
        ...createLaundryLogRecord({
          propertyName: "Atlantic View",
          deliveryDate: "2026-04-10",
          receivedDate: "2026-04-12",
          items: {
            bathTowel: { delivered: 1, received: 1 },
            faceTowel: { delivered: 1, received: 1 }
          }
        }, {
          now: () => "2026-04-12T10:00:00.000Z"
        })
      },
      {
        id: "current",
        ...createLaundryLogRecord({
          propertyName: "Atlantic View",
          deliveryDate: "2026-04-15",
          items: {
            bathTowel: { delivered: 1, received: 0 }
          }
        }, {
          now: () => "2026-04-15T10:00:00.000Z"
        })
      }
    ];

    manager.activeWorkspace = "returns";
    manager.render();

    assert.includes(document.getElementById("laundry-log-root").innerHTML, "laundryLog.warnings.previousStockTitle");
    assert.includes(document.getElementById("laundry-log-root").innerHTML, "laundryLog.items.faceTowel");
  });
});
