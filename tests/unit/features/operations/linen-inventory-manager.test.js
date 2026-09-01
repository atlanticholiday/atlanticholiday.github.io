import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { LinenInventoryManager } from "../../../../js/features/operations/linen-inventory-manager.js";
import { createLinenInventoryRecord } from "../../../../js/features/operations/linen-inventory-utils.js";

describe("LinenInventoryManager", () => {
  test("creates a dedicated page and dashboard card", () => {
    resetDom(`
      <div id="landing-page">
        <section class="landing-category">
          <div id="services-logistics-grid">
            <button id="go-to-laundry-log-btn" class="dashboard-card"></button>
          </div>
        </section>
      </div>
    `);

    const manager = new LinenInventoryManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.render();

    assert.ok(document.getElementById("linen-inventory-page"));
    assert.ok(document.getElementById("linen-inventory-root"));
    assert.ok(document.getElementById("linen-inventory-header-actions"));
    assert.ok(document.getElementById("go-to-linen-inventory-btn"));
    assert.equal(document.getElementById("linen-inventory-property-input"), null);
    assert.ok(document.querySelector("[data-linen-action='manager-workspace'][data-workspace='records'][aria-selected='true']"));

    document.querySelector("[data-linen-action='manager-workspace'][data-workspace='count']").click();

    assert.ok(document.getElementById("linen-inventory-property-input"));
    assert.equal(document.querySelectorAll("[data-linen-section-key]").length, 0);
    assert.ok(document.querySelector("[data-linen-action='add-section'][data-section-key='doubleBed']"));
    assert.ok(document.querySelector("[data-linen-live-summary='countedUnits']"));

    document.querySelector("[data-linen-action='add-section'][data-section-key='doubleBed']").click();
    const countInput = document.querySelector("[data-linen-item-key='doubleMattressProtector'][data-linen-item-field='count']");
    countInput.value = "3";
    countInput.dispatchEvent(new Event("input", { bubbles: true }));

    assert.equal(document.querySelector("[data-linen-live-summary='countedUnits']").textContent, "3");
  });

  test("reads property, count date, bed section settings, item counts, and custom rows from the form", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-laundry-log-btn"></button>
    `);

    const manager = new LinenInventoryManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.render();
    manager.switchManagerWorkspace("count");

    document.getElementById("linen-inventory-property-input").value = "Atlantic View";
    document.getElementById("linen-inventory-counted-input").value = "2026-04-12";
    document.querySelector("[data-linen-action='add-section'][data-section-key='doubleBed']").click();
    document.querySelector("[data-linen-section-key='doubleBed'][data-linen-section-field='bedroomCount']").value = "2";
    document.querySelector("[data-linen-section-key='doubleBed'][data-linen-section-field='bedSize']").value = "160x200";
    document.querySelector("[data-linen-action='add-section'][data-section-key='towels']").click();
    document.querySelector("[data-linen-item-key='bathTowel'][data-linen-item-field='count']").value = "4";
    document.querySelector("[data-linen-action='add-bedroom']").click();
    document.querySelector("[data-linen-bedroom-field='name']").value = "Main bedroom";
    document.querySelector("[data-linen-bed-field='type']").value = "Double";
    document.querySelector("[data-linen-bed-field='size']").value = "160x200";
    document.querySelector("[data-linen-action='add-bed']").click();
    document.querySelectorAll("[data-linen-bed-field='type']")[1].value = "Double";
    document.querySelectorAll("[data-linen-bed-field='size']")[1].value = "180x200";
    document.querySelector("[data-linen-action='add-section'][data-section-key='other']").click();
    document.querySelector("[data-linen-action='add-custom-item']").click();
    document.querySelector("[data-linen-custom-field='name']").value = "Beach bags";
    document.querySelector("[data-linen-custom-field='count']").value = "2";

    const draft = manager.readDraftFromDom();

    assert.equal(draft.propertyId, "p1");
    assert.equal(draft.propertyName, "Atlantic View");
    assert.equal(draft.countedDate, "2026-04-12");
    assert.equal(draft.activeSections.includes("doubleBed"), true);
    assert.equal(draft.activeSections.includes("towels"), true);
    assert.equal(draft.activeSections.includes("other"), true);
    assert.equal(draft.sections.doubleBed.bedroomCount, 2);
    assert.equal(draft.sections.doubleBed.bedSize, "160x200");
    assert.equal(draft.items.bathTowel.count, 4);
    assert.equal(draft.items.bathTowel.checked, true);
    assert.equal(draft.bedrooms.length, 1);
    assert.equal(draft.bedrooms[0].name, "Main bedroom");
    assert.equal(draft.bedrooms[0].beds.length, 2);
    assert.equal(draft.bedrooms[0].beds[1].size, "180x200");
    assert.equal(draft.customItems.length, 1);
    assert.equal(draft.customItems[0].name, "Beach bags");
    assert.equal(draft.customItems[0].count, 2);
  });

  test("renders saved linen counts and can open one for editing", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-laundry-log-btn"></button>
    `);

    const manager = new LinenInventoryManager(null, {
      getProperties: () => [{ id: "p1", name: "Atlantic View" }]
    });

    manager.ensureDomScaffold();
    manager.records = [
      {
        id: "atlantic",
        ...createLinenInventoryRecord({
          propertyId: "p1",
          propertyName: "Atlantic View",
          countedDate: "2026-04-12",
          sections: {
            doubleBed: { bedroomCount: 2, bedSize: "160x200" }
          },
          bedrooms: [
            { name: "Main bedroom", beds: [{ type: "Double", size: "160x200" }] }
          ],
          items: {
            bathTowel: { count: 4 }
          }
        }, {
          now: () => "2026-04-12T10:00:00.000Z"
        })
      }
    ];
    manager.render();

    assert.ok(document.querySelector("[data-linen-action='edit']"));
    assert.includes(document.getElementById("linen-inventory-root").innerHTML, "Atlantic View");
    assert.includes(document.getElementById("linen-inventory-root").innerHTML, "160x200");
    assert.includes(document.getElementById("linen-inventory-root").innerHTML, "4");

    manager.startEditing("atlantic");

    assert.equal(manager.managerWorkspace, "count");
    assert.ok(document.getElementById("linen-inventory-form-card"));
    assert.equal(document.querySelector("[data-linen-admin-only]"), null);
    assert.equal(manager.draft.propertyName, "Atlantic View");
    assert.equal(manager.draft.countedDate, "2026-04-12");
    assert.equal(manager.draft.sections.doubleBed.bedroomCount, 2);
    assert.equal(manager.draft.sections.doubleBed.bedSize, "160x200");
    assert.equal(manager.draft.bedrooms[0].beds[0].size, "160x200");
    assert.equal(manager.draft.items.bathTowel.count, 4);
  });

  test("renders a search-first phone workflow for colleagues without admin controls", () => {
    resetDom(`
      <div id="landing-page"></div>
      <button id="go-to-laundry-log-btn"></button>
    `);

    const manager = new LinenInventoryManager(null, {
      getDataManager: () => ({
        canAccessApp: () => true,
        hasPrivilegedRole: () => false,
        getCurrentUserContext: () => ({ uid: "cleaner-1", email: "ana@example.com" }),
        getCurrentUserEmployee: () => ({ name: "Ana" })
      }),
      getProperties: () => [{ id: "secret", name: "Full property record" }]
    });
    manager.propertyDirectory = [
      { id: "p1", name: "Atlantic View" },
      { id: "p2", name: "Calas Loft" }
    ];

    manager.ensureDomScaffold();
    manager.render();

    assert.ok(document.getElementById("linen-cleaner-property-search"));
    assert.ok(document.querySelector("[data-linen-property-option]").classList.contains("hidden"));
    assert.ok(!document.getElementById("linen-inventory-root").textContent.includes("Full property record"));
    assert.equal(document.querySelectorAll("[data-linen-action='delete']").length, 0);
    assert.equal(document.querySelectorAll("[data-linen-admin-only]").length, 0);

    manager.selectCleanerProperty("p1", "Atlantic View");

    assert.ok(document.getElementById("linen-cleaner-count-form"));
    assert.ok(document.querySelector("[data-linen-action='adjust-count'][data-item-key='bathTowel']"));
    assert.ok(document.querySelector("[data-linen-action='open-submit-review']"));
  });

  test("loads a name-only property directory for the colleague search", async () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    const manager = new LinenInventoryManager(null, {
      getDataManager: () => ({
        canAccessApp: () => true,
        hasPrivilegedRole: () => false,
        getCurrentUserContext: () => ({ uid: "cleaner-1", email: "ana@example.com" })
      }),
      getPropertyDirectory: async () => ({
        data: {
          properties: [
            { id: "p1", name: " Atlantic View ", icalUrl: "must-not-reach-the-ui" },
            { id: "", name: "Invalid" }
          ]
        }
      })
    });

    manager.ensureDomScaffold();
    await manager.ensurePropertyDirectory();

    assert.equal(manager.propertyDirectory.length, 1);
    assert.equal(manager.propertyDirectory[0].id, "p1");
    assert.equal(manager.propertyDirectory[0].name, "Atlantic View");
    assert.equal(Object.keys(manager.propertyDirectory[0]).sort().join(","), "id,name");
  });

  test("falls back to the sanitized Firestore directory when the callable is unavailable", async () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    let fallbackCalls = 0;
    const manager = new LinenInventoryManager(null, {
      getDataManager: () => ({
        canAccessApp: () => true,
        hasPrivilegedRole: () => false,
        getCurrentUserContext: () => ({ uid: "cleaner-1", email: "ana@example.com" })
      }),
      getPropertyDirectory: async () => {
        throw new Error("functions/not-found");
      },
      getPropertyDirectoryFallback: async () => {
        fallbackCalls += 1;
        return { properties: [{ id: "p1", name: "Atlantic View" }] };
      }
    });

    manager.ensureDomScaffold();
    await manager.ensurePropertyDirectory();

    assert.equal(fallbackCalls, 1);
    assert.equal(manager.propertyDirectoryLoaded, true);
    assert.deepEqual(manager.propertyDirectory, [{ id: "p1", name: "Atlantic View" }]);
    assert.equal(manager.statusMessage, "");
  });

  test("clears colleague records, directory data, and in-memory drafts at sign-out", () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    const manager = new LinenInventoryManager(null);
    manager.records = [{ id: "owned-count" }];
    manager.propertyDirectory = [{ id: "p1", name: "Atlantic View" }];
    manager.propertyDirectoryLoaded = true;
    manager.editingRecordId = "owned-count";
    manager.draft = manager.createDefaultDraft({ propertyId: "p1", propertyName: "Atlantic View" });

    manager.stopListening();

    assert.equal(manager.records.length, 0);
    assert.equal(manager.propertyDirectory.length, 0);
    assert.equal(manager.propertyDirectoryLoaded, false);
    assert.equal(manager.editingRecordId, null);
    assert.equal(manager.draft.propertyName, "");
  });

  test("builds owned audited payloads and keeps submitted records locked for colleagues", () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    const manager = new LinenInventoryManager(null, {
      getDataManager: () => ({
        canAccessApp: () => true,
        hasPrivilegedRole: () => false,
        getCurrentUserContext: () => ({ uid: "cleaner-1", email: "ana@example.com" }),
        getCurrentUserEmployee: () => ({ name: "Ana" })
      })
    });

    const payload = manager.buildAuditedPayload({
      propertyId: "p1",
      propertyName: "Atlantic View",
      countedDate: "2026-08-07",
      items: { bathTowel: { count: 0, checked: true } }
    }, null, {
      workflowStatus: "submitted",
      now: () => "2026-08-07T12:00:00.000Z"
    });

    assert.equal(payload.createdBy.uid, "cleaner-1");
    assert.equal(payload.submittedBy.uid, "cleaner-1");
    assert.equal(payload.workflowStatus, "submitted");
    assert.equal(manager.canEditRecord(payload), false);
    assert.equal(manager.canDeleteRecord(payload), false);
  });

  test("carries the latest approved targets into a new admin review", () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    const manager = new LinenInventoryManager(null);
    manager.records = [
      {
        id: "baseline",
        ...createLinenInventoryRecord({
          propertyId: "p1",
          propertyName: "Atlantic View",
          countedDate: "2026-07-01",
          workflowStatus: "approved",
          items: { bathTowel: { count: 8, checked: true, target: 8 } }
        }, { now: () => "2026-07-01T10:00:00.000Z" })
      },
      {
        id: "new-count",
        ...createLinenInventoryRecord({
          propertyId: "p1",
          propertyName: "Atlantic View",
          countedDate: "2026-08-07",
          workflowStatus: "submitted",
          items: { bathTowel: { count: 6, checked: true } }
        }, { now: () => "2026-08-07T10:00:00.000Z" })
      }
    ];

    const effective = manager.getRecordWithEffectiveTargets(manager.records[1]);

    assert.equal(effective.items.bathTowel.target, 8);
    assert.equal(effective.summary.shortageUnits, 2);
  });

  test("renders actor, shortage, issue, and review actions for admins", () => {
    resetDom(`<div id="landing-page"></div><button id="go-to-laundry-log-btn"></button>`);
    const manager = new LinenInventoryManager(null);
    manager.ensureDomScaffold();
    manager.records = [{
      id: "review-me",
      ...createLinenInventoryRecord({
        propertyId: "p1",
        propertyName: "Atlantic View",
        countedDate: "2026-08-07",
        workflowStatus: "submitted",
        submittedBy: { uid: "cleaner-1", name: "Ana" },
        items: { bathTowel: { count: 4, checked: true, target: 6, issue: "missing" } }
      }, { now: () => "2026-08-07T10:00:00.000Z" })
    }];
    manager.render();

    const text = document.getElementById("linen-inventory-root").textContent;
    assert.includes(text, "Atlantic View");
    assert.includes(text, "Ana");
    assert.ok(document.querySelector("[data-linen-action='review']"));
    assert.ok(document.querySelector("[data-linen-action='archive']"));
    assert.ok(document.querySelector("[data-linen-action='delete']"));
  });
});
