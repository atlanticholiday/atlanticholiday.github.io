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

  test("renders an open link action beside URL fields", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    initializeAllInfoPage({
      documentRef: document,
      properties: [
        {
          id: "property-1",
          name: "Acanto",
          location: "Funchal",
          googleMapsLink: "maps.google.com/example"
        }
      ]
    });

    document.querySelector('[data-idx="1"]').click();

    const openLink = document.querySelector(".allinfo-link-open");
    assert.ok(openLink);
    assert.equal(openLink.getAttribute("target"), "_blank");
    assert.equal(openLink.getAttribute("rel"), "noopener noreferrer");
    assert.equal(openLink.href, "https://maps.google.com/example");
  });

  test("switches categories from the left category rail", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    initializeAllInfoPage({
      documentRef: document,
      properties: [
        {
          id: "property-1",
          name: "Acanto",
          location: "Funchal",
          googleMapsLink: "https://maps.example.com"
        }
      ]
    });

    document.querySelector('[data-idx="1"]').click();

    assert.ok(document.querySelector(".allinfo-category-header h3").textContent.includes("Maps"));
  });

  test("turns off edit modes when leaving the edit tools workspace", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    let bulkClicks = 0;
    const restoreBulkApi = installGlobalProperty("AllInfoBulkEdit", {
      isActive() {
        return true;
      }
    });

    try {
      initializeAllInfoPage({
        documentRef: document,
        properties: [
          { id: "property-1", name: "Acanto", location: "Funchal", type: "apartment", typology: "T1", rooms: 1 }
        ]
      });

      const actionsBar = document.createElement("div");
      actionsBar.id = "allinfo-actions-bar";

      const bulkButton = document.createElement("button");
      bulkButton.id = "allinfo-bulk-toggle-btn";
      bulkButton.addEventListener("click", () => { bulkClicks += 1; });

      const sequentialButton = document.createElement("button");
      sequentialButton.id = "allinfo-seq-toggle-btn";
      sequentialButton.setAttribute("data-active", "true");
      sequentialButton.addEventListener("click", () => sequentialButton.setAttribute("data-active", "false"));

      const accordionButton = document.createElement("button");
      accordionButton.id = "allinfo-accordion-toggle-btn";
      accordionButton.setAttribute("data-active", "true");
      accordionButton.addEventListener("click", () => accordionButton.setAttribute("data-active", "false"));

      actionsBar.append(bulkButton, sequentialButton, accordionButton);
      document.getElementById("allinfo-filter-wrapper").appendChild(actionsBar);

      document.querySelector('[data-workspace="missing"]').click();

      assert.equal(bulkClicks, 1);
      assert.equal(sequentialButton.getAttribute("data-active"), "false");
      assert.equal(accordionButton.getAttribute("data-active"), "false");
    } finally {
      restoreBulkApi();
    }
  });

  test("renders Asana project header with progress meter and status pill", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    initializeAllInfoPage({
      documentRef: document,
      properties: [
        { id: "p-1", name: "Acanto", location: "Funchal", type: "apartment", typology: "T1", rooms: 1, bathrooms: 1, floor: 2 }
      ]
    });

    const projectHeader = document.querySelector(".asana-project-header");
    assert.ok(projectHeader);

    const title = projectHeader.querySelector(".asana-project-title");
    assert.ok(title);
    assert.equal(title.textContent, "All Property Info");

    const pill = projectHeader.querySelector(".asana-status-pill");
    assert.ok(pill);

    const progressBar = projectHeader.querySelector(".asana-progress-bar");
    assert.ok(progressBar);
  });

  test("switches to Asana Kanban board view and displays columns", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    initializeAllInfoPage({
      documentRef: document,
      properties: [
        { id: "p-1", name: "Acanto", location: "Funchal", type: "apartment", typology: "T1", rooms: 1, bathrooms: 1, floor: 2 },
        { id: "p-2", name: "Bravo Villa", location: "Calheta", type: "villa", typology: "T3" }
      ]
    });

    const boardTab = document.querySelector('[data-workspace="board"]');
    assert.ok(boardTab);

    boardTab.click();

    const boardContainer = document.querySelector(".asana-board-container");
    assert.ok(boardContainer);

    const columns = document.querySelectorAll(".asana-board-column");
    assert.equal(columns.length, 3);

    const cards = document.querySelectorAll(".asana-card");
    assert.ok(cards.length >= 2);
  });

  test("opens Asana property detail drawer on row inspect and saves edits", async () => {
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
      id: "p-drawer",
      name: "Ocean View",
      location: "Funchal",
      type: "apartment",
      typology: "T2",
      rooms: 2,
      bathrooms: 1
    };

    try {
      initializeAllInfoPage({
        documentRef: document,
        properties: [property]
      });

      const drawerRoot = document.querySelector(".asana-drawer-root");
      assert.ok(drawerRoot);
      assert.ok(drawerRoot.classList.contains("hidden"));

      const propertyCell = document.querySelector(".allinfo-property-cell");
      assert.ok(propertyCell);
      propertyCell.click();

      assert.equal(drawerRoot.classList.contains("hidden"), false);

      const drawerTitle = drawerRoot.querySelector(".asana-drawer-title");
      assert.equal(drawerTitle.textContent, "Ocean View");

      const drawerInput = drawerRoot.querySelector('[data-drawer-field="rooms"]');
      assert.ok(drawerInput);
      drawerInput.value = "3";
      drawerInput.dispatchEvent(new Event("change", { bubbles: true }));

      await Promise.resolve();
      await Promise.resolve();

      assert.equal(saved.length, 1);
      assert.equal(saved[0].id, "p-drawer");
      assert.deepEqual(saved[0].updates, { rooms: 3 });
      assert.equal(property.rooms, 3);

      const closeBtn = drawerRoot.querySelector(".asana-drawer-close-btn");
      assert.ok(closeBtn);
      closeBtn.click();

      assert.equal(drawerRoot.classList.contains("hidden"), true);

      // Re-open and verify Escape key closes the drawer
      propertyCell.click();
      assert.equal(drawerRoot.classList.contains("hidden"), false);

      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      assert.equal(drawerRoot.classList.contains("hidden"), true);
    } finally {
      restoreManager();
    }
  });

  test("opens Asana property detail drawer from Kanban board card", () => {
    resetDom(`
      <div id="allinfo-filter-wrapper"></div>
      <nav id="allinfo-nav"></nav>
      <div id="allinfo-content"></div>
    `);

    const property = {
      id: "p-card-test",
      name: "Mountain Sunset",
      location: "Calheta",
      type: "house",
      typology: "T3"
    };

    initializeAllInfoPage({
      documentRef: document,
      properties: [property]
    });

    const boardTab = document.querySelector('[data-workspace="board"]');
    boardTab.click();

    const card = document.querySelector('.asana-card[data-property-id="p-card-test"]');
    assert.ok(card);

    const drawerRoot = document.querySelector(".asana-drawer-root");
    assert.ok(drawerRoot);
    assert.ok(drawerRoot.classList.contains("hidden"));

    card.click();
    assert.equal(drawerRoot.classList.contains("hidden"), false);

    const drawerTitle = drawerRoot.querySelector(".asana-drawer-title");
    assert.equal(drawerTitle.textContent, "Mountain Sunset");
  });
});
