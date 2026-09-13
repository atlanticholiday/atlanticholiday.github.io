import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { HeatedPoolsManager } from "../../../../js/features/operations/heated-pools-manager.js";

describe("HeatedPoolsManager", () => {
  test("opens one pool's state history from its compact status row", () => {
    resetDom(`
      <div id="heated-pools-property-status-list"></div>
      <div id="heated-pools-property-history-dialog" class="heated-pools-dialog hidden">
        <section class="heated-pools-dialog__panel">
          <button type="button">Close</button>
          <h3 id="heated-pools-property-history-title"></h3>
          <div id="heated-pools-property-history-summary"></div>
          <div id="heated-pools-property-history-timeline"></div>
        </section>
      </div>
    `);

    try {
      const manager = new HeatedPoolsManager(null);
      manager.properties = [manager.normalizeProperty({
        id: "dream-house",
        propertyName: "Dream House",
        poolState: "off",
        statusHistory: [
          {
            id: "change-on",
            previousState: "off",
            state: "on",
            at: "2026-09-10T09:00:00.000Z",
            actor: { name: "Ana" }
          },
          {
            id: "change-off",
            previousState: "on",
            state: "off",
            at: "2026-09-12T11:30:00.000Z",
            actor: { name: "Lucas" }
          }
        ],
        reservations: []
      })];

      manager.renderPropertyTable();
      const trigger = document.querySelector('[data-open-property-history="dream-house"]');
      assert.ok(trigger);
      trigger.click();

      assert.equal(document.getElementById("heated-pools-property-history-dialog").classList.contains("hidden"), false);
      assert.equal(document.getElementById("heated-pools-property-history-title").textContent, "Dream House");
      assert.includes(document.getElementById("heated-pools-property-history-summary").textContent, "2");
      const changes = document.querySelectorAll("#heated-pools-property-history-timeline li");
      assert.equal(changes.length, 2);
      assert.includes(changes[0].textContent, "Lucas");
      assert.includes(changes[1].textContent, "Ana");
    } finally {
      resetDom();
      document.body.classList.remove("heated-pools-dialog-open");
    }
  });
});
