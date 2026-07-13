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
    assert.ok(document.getElementById("go-to-linen-inventory-btn"));
    assert.ok(document.getElementById("linen-inventory-property-input"));
    assert.equal(document.querySelectorAll("[data-linen-section-key]").length, 0);
    assert.ok(document.querySelector("[data-linen-action='add-section'][data-section-key='doubleBed']"));
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

    assert.equal(manager.draft.propertyName, "Atlantic View");
    assert.equal(manager.draft.countedDate, "2026-04-12");
    assert.equal(manager.draft.sections.doubleBed.bedroomCount, 2);
    assert.equal(manager.draft.sections.doubleBed.bedSize, "160x200");
    assert.equal(manager.draft.bedrooms[0].beds[0].size, "160x200");
    assert.equal(manager.draft.items.bathTowel.count, 4);
  });
});
