import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
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

    assert.ok(!document.getElementById("laundry-log-form-card").open);
    assert.ok(document.getElementById("laundry-log-property-input"));
    assert.ok(!document.getElementById("laundry-log-received-date-input"));
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
    assert.ok(!document.querySelector("[data-laundry-custom-field='received']"));

    const draft = manager.readDraftFromDom();

    assert.equal(document.querySelectorAll("[data-laundry-custom-field='name']").length, 1);
    assert.equal(draft.customItems.length, 1);
    assert.equal(draft.customItems[0].name, "Beach bags");
    assert.equal(draft.customItems[0].delivered, 3);
    assert.equal(draft.customItems[0].received, 0);
  });

  test("reviews returns in the returns workspace instead of reopening the entry form", () => {
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
        id: "handoff-1",
        ...createLaundryLogRecord({
          propertyName: "Atlantic View",
          deliveryDate: "2026-04-10",
          items: {
            bathTowel: { delivered: 4, received: 0 }
          }
        }, {
          now: () => "2026-04-10T10:00:00.000Z"
        })
      }
    ];

    manager.activeWorkspace = "returns";
    manager.render();
    document.querySelector("[data-laundry-action='review-return']").click();

    assert.equal(manager.activeWorkspace, "returns");
    assert.ok(document.getElementById("laundry-log-return-editor"));
    assert.ok(document.getElementById("laundry-log-received-date-input"));
    assert.ok(!document.querySelector("#laundry-log-return-editor [data-laundry-item-field='delivered']"));
    assert.ok(document.querySelector("#laundry-log-return-editor [data-laundry-item-field='received']"));
  });

  test("warns when collected laundry return counts do not match what went out", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.currentLang = "en";
    i18n.translations = {
      en: {
        laundryLog: {
          warnings: {
            returnMismatchTitle: "Laundry return mismatch",
            returnMismatchBody: "The counts sent to the laundry and received back do not match.",
            returnMismatchItem: "Out: {{delivered}} · Back: {{received}} · Missing: {{missing}} · Extra: {{extra}}"
          },
          items: {
            bathTowel: "Bath towels",
            faceTowel: "Face towels"
          }
        }
      }
    };

    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-welcome-packs-btn"></button>
    `);

    try {
      const manager = new LaundryLogManager(null, {
        getProperties: () => [{ id: "p1", name: "Atlantic View" }]
      });

      manager.ensureDomScaffold();
      manager.records = [
        {
          id: "current",
          ...createLaundryLogRecord({
            propertyName: "Atlantic View",
            deliveryDate: "2026-04-15",
            receivedDate: "2026-04-17",
            items: {
              bathTowel: { delivered: 4, received: 3 },
              faceTowel: { delivered: 2, received: 2 }
            }
          }, {
            now: () => "2026-04-15T10:00:00.000Z"
          })
        }
      ];

      manager.activeWorkspace = "returns";
      manager.render();

      const html = document.getElementById("laundry-log-root").innerHTML;
      assert.includes(html, "Laundry return mismatch");
      assert.includes(html, "Bath towels");
      assert.includes(html, "Missing: 1");
      assert.ok(!html.includes("Face towels"));
    } finally {
      i18n.translations = previousTranslations;
      i18n.currentLang = previousLang;
    }
  });
});
