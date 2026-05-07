import { describe, test, assert } from "../../../test-harness.js";
import { installGlobalProperty, resetDom } from "../../../test-utils.js";
import { initializeAllInfoPage } from "../../../../js/features/properties/all-info-page.js";

describe("all-info-page", () => {
  test("saves inline row edits through the properties manager and updates local row data", async () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    const saved = [];
    const restoreManager = installGlobalProperty("propertiesManager", {
      async updateProperty(id, updates) {
        saved.push({ id, updates });
      }
    });

    const property = {
      id: "property-1",
      name: "Acanto Loft",
      location: "Funchal",
      type: "apartment",
      typology: "T1",
      rooms: 1,
      bathrooms: ""
    };

    try {
      initializeAllInfoPage({
        documentRef: document,
        properties: [property]
      });

      const bathroomsInput = document.querySelector('[data-field="bathrooms"]');
      assert.ok(bathroomsInput);

      bathroomsInput.value = "2";
      bathroomsInput.dispatchEvent(new Event("input", { bubbles: true }));

      const saveButton = document.querySelector(".allinfo-inline-save-btn");
      assert.equal(saveButton.disabled, false);

      await saveButton.onclick();

      assert.equal(saved.length, 1);
      assert.equal(saved[0].id, "property-1");
      assert.deepEqual(saved[0].updates, { bathrooms: 2 });
      assert.equal(property.bathrooms, 2);
      assert.equal(saveButton.disabled, true);
    } finally {
      restoreManager();
    }
  });

  test("saves filled missing queue values in one batch", async () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    const savedBatches = [];
    const restoreManager = installGlobalProperty("propertiesManager", {
      async updatePropertiesBatchMixed(items) {
        savedBatches.push(items);
      }
    });

    const property = {
      id: "property-1",
      name: "Acanto Loft",
      location: "Funchal",
      type: "apartment",
      typology: "T1",
      rooms: 1,
      bathrooms: ""
    };

    try {
      initializeAllInfoPage({
        documentRef: document,
        properties: [property]
      });

      const missingInput = document.querySelector('[data-missing-field="bathrooms"]');
      assert.ok(missingInput);

      missingInput.value = "2";
      missingInput.dispatchEvent(new Event("input", { bubbles: true }));

      const saveFilledButton = document.getElementById("allinfo-save-filled-missing");
      assert.equal(saveFilledButton.disabled, false);

      saveFilledButton.click();
      await Promise.resolve();
      await Promise.resolve();

      assert.equal(savedBatches.length, 1);
      assert.deepEqual(savedBatches[0], [
        { id: "property-1", updates: { bathrooms: 2 } }
      ]);
      assert.equal(property.bathrooms, 2);
    } finally {
      restoreManager();
    }
  });

  test("sorts table columns using inline input values", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    initializeAllInfoPage({
      documentRef: document,
      properties: [
        { id: "property-1", name: "Bravo", location: "Porto", type: "apartment", typology: "T2", rooms: 2 },
        { id: "property-2", name: "Acanto", location: "Funchal", type: "apartment", typology: "T1", rooms: 1 }
      ]
    });

    const locationHeader = Array.from(document.querySelectorAll("th"))
      .find((header) => header.textContent.includes("Location"));
    assert.ok(locationHeader);

    locationHeader.click();

    const firstRowName = document.querySelector("tbody tr .allinfo-property-cell").textContent;
    assert.equal(firstRowName, "Acanto");
  });
});
