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
    assert.ok(document.querySelector("[data-laundry-action='review-return']"));
    assert.ok(!document.getElementById("laundry-log-property-input"));

    manager.switchWorkspace("entry");

    assert.ok(!document.getElementById("laundry-log-form-card").open);
    assert.ok(document.getElementById("laundry-log-property-input"));
    assert.ok(!document.getElementById("laundry-log-received-date-input"));
    assert.ok(document.getElementById("laundry-log-form-card").compareDocumentPosition(
      document.querySelector("[data-laundry-action='jump-section']")
    ) & Node.DOCUMENT_POSITION_FOLLOWING);
    assert.equal(document.querySelectorAll("[data-laundry-action='jump-section']").length, 5);
    assert.equal(document.querySelectorAll("[data-laundry-action='review-return']").length, 0);
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
    assert.includes(document.getElementById("laundry-log-return-editor").textContent, "4");
  });

  test("keeps mismatches out of returns and shows them in a counted mismatch workspace", () => {
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
        id: "pending",
        ...createLaundryLogRecord({
          propertyName: "Atlantic View",
          deliveryDate: "2026-04-10",
          items: {
            bathTowel: { delivered: 4, received: 0 }
          }
        }, {
          now: () => "2026-04-10T10:00:00.000Z"
        })
      },
      {
        id: "mismatch",
        ...createLaundryLogRecord({
          propertyName: "Art Studio",
          deliveryDate: "2026-04-11",
          receivedDate: "2026-04-13",
          items: {
            bathTowel: { delivered: 4, received: 3 }
          }
        }, {
          now: () => "2026-04-11T10:00:00.000Z"
        })
      }
    ];

    manager.activeWorkspace = "returns";
    manager.render();

    assert.includes(document.getElementById("laundry-log-root").textContent, "Atlantic View");
    assert.ok(!document.getElementById("laundry-log-root").textContent.includes("Art Studio"));
    assert.ok(document.querySelector("[data-workspace='mismatches']").textContent.includes("1"));

    manager.switchWorkspace("mismatches");

    assert.includes(document.getElementById("laundry-log-root").textContent, "Art Studio");
    assert.ok(!document.getElementById("laundry-log-root").textContent.includes("Atlantic View"));
  });

  test("shows a clear saved confirmation banner", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.currentLang = "en";
    i18n.translations = {
      en: {
        laundryLog: {
          messages: {
            savedTitle: "Saved",
            errorTitle: "Needs attention",
            noticeTitle: "Notice",
            savedDetailsTitle: "Saved details",
            savedItemsTitle: "Items saved",
            saved: "Laundry handoff saved."
          },
          labels: {
            property: "Property",
            deliveryDate: "Delivery date",
            receivedDate: "Received date",
            notes: "Notes",
            customItemFallback: "Other item"
          },
          summary: {
            delivered: "Out: {{count}}",
            received: "Back: {{count}}"
          },
          items: {
            bathTowel: "Bath towels",
            pillowCases: "Pillowcases"
          },
          stats: {
            summaryToggle: "Quick Summary",
            summaryHint: "{{count}} records, {{pending}} pending",
            totalRecords: "Records",
            pending: "Pending",
            matched: "Matched",
            unitsDelivered: "Units out",
            unitsReceived: "Units back"
          },
          views: {
            entryWorkspace: "Entry",
            returnsWorkspace: "Returns",
            completedWorkspace: "Completed",
            sectionNavTitle: "Laundry sections",
            formTitle: "New laundry handoff"
          },
          form: {
            openHelper: "Tap to register a new handoff."
          },
          actions: {
            openForm: "New handoff"
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
      const savedDetails = manager.buildSavedStatusDetails(manager.createDefaultDraft({
        propertyName: "Atlantic View",
        deliveryDate: "2026-04-10",
        items: {
          bathTowel: { delivered: 4, received: 0 },
          pillowCases: { delivered: 2, received: 2 }
        },
        customItems: [{ name: "Beach bags", delivered: 1, received: 0 }]
      }));
      manager.setStatus("Laundry handoff saved.", "success", savedDetails);
      manager.render();

      const banner = document.getElementById("laundry-log-status-message");
      assert.ok(banner);
      assert.includes(banner.textContent, "Saved");
      assert.includes(banner.textContent, "Laundry handoff saved.");
      assert.includes(banner.textContent, "Atlantic View");
      assert.includes(banner.textContent, "Bath towels");
      assert.includes(banner.textContent, "Out: 4");
      assert.includes(banner.textContent, "Pillowcases");
      assert.includes(banner.textContent, "Back: 2");
      assert.includes(banner.textContent, "Beach bags");
    } finally {
      i18n.translations = previousTranslations;
      i18n.currentLang = previousLang;
    }
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

      manager.startReturnReview("current");

      const warning = document.querySelector("[data-laundry-return-mismatch-warning='true']");
      assert.ok(warning);
      assert.includes(warning.textContent, "Laundry return mismatch");
      assert.includes(warning.textContent, "Bath towels");
      assert.includes(warning.textContent, "Missing: 1");
      assert.ok(!warning.textContent.includes("Face towels"));
    } finally {
      i18n.translations = previousTranslations;
      i18n.currentLang = previousLang;
    }
  });
});
