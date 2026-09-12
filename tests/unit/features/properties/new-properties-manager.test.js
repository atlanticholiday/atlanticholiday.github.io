import { describe, test, assert } from "../../../test-harness.js";
import { NewPropertiesManager } from "../../../../js/features/properties/new-properties-manager.js";

function createMockStorage(initial = {}) {
    const store = new Map(Object.entries(initial));
    return {
        getItem: (key) => store.has(key) ? store.get(key) : null,
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear()
    };
}

describe("New Properties Manager", () => {
    test("initializes, renders Asana board layout, and loads 42 properties", () => {
        const container = document.createElement("div");
        container.id = "test-new-props";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-new-props", storage });
            manager.init();

            assert.equal(manager.properties.length, 42, "Loads 42 properties by default");
            assert.ok(container.querySelector(".asana-layout"), "Renders Asana layout");
            assert.ok(container.querySelector(".asana-sidebar"), "Renders Asana dark sidebar");
            assert.ok(container.querySelector(".asana-board"), "Renders board by default");

            const columns = container.querySelectorAll(".asana-column");
            assert.equal(columns.length, 3, "Renders 3 Kanban columns");
        } finally {
            container.remove();
        }
    });

    test("switches between board, list, and inventory views", () => {
        const container = document.createElement("div");
        container.id = "test-view-switch";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-view-switch", storage });
            manager.init();

            assert.ok(container.querySelector(".asana-board"));

            // Switch to list
            manager.activeView = "list";
            manager.render();
            assert.ok(container.querySelector(".asana-table-container"), "Renders table list view");

            // Switch to master inventory
            manager.activeView = "inventory";
            manager.render();
            assert.ok(container.querySelector(".asana-canvas").textContent.includes("Inventário"), "Renders master inventory view");
        } finally {
            container.remove();
        }
    });

    test("opens drawer, modifies bedrooms, bathrooms, and capacity, and recalculates inventory", () => {
        const container = document.createElement("div");
        container.id = "test-drawer";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-drawer", storage });
            manager.init();

            const firstProp = manager.properties[0];
            manager.selectedPropertyId = firstProp.id;
            manager.activeDrawerTab = "inventory";
            manager.render();

            const drawer = container.querySelector(".asana-drawer");
            assert.ok(drawer, "Property drawer is rendered");

            const initialBedrooms = firstProp.bedrooms;
            const initialBathrooms = firstProp.bathrooms;
            const initialCapacity = firstProp.capacity;

            // Increment bedrooms by 1
            manager.updateSpecs(firstProp.id, { bedroomsDelta: 1 });
            assert.equal(firstProp.bedrooms, initialBedrooms + 1);

            // Increment bathrooms by 1
            manager.updateSpecs(firstProp.id, { bathroomsDelta: 1 });
            assert.equal(firstProp.bathrooms, initialBathrooms + 1);

            // Increment capacity by 2
            manager.updateSpecs(firstProp.id, { capacityDelta: 2 });
            assert.equal(firstProp.capacity, initialCapacity + 2);

            // Add a bed
            const initialBedsLen = (firstProp.beds || []).length;
            manager.addBed(firstProp.id, "single");
            assert.equal(firstProp.beds.length, initialBedsLen + 1);

            // Remove the added bed
            manager.removeBed(firstProp.id, initialBedsLen);
            assert.equal(firstProp.beds.length, initialBedsLen);
        } finally {
            container.remove();
        }
    });

    test("toggles checklist items and recalculates progress", () => {
        const container = document.createElement("div");
        container.id = "test-checklist";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-checklist", storage });
            manager.init();

            const prop = manager.properties[0];
            const taskId = prop.checklist[0].tasks[0].id;
            const initialDone = prop.checklist[0].tasks[0].done;

            manager.toggleTask(prop.id, taskId);
            assert.equal(prop.checklist[0].tasks[0].done, !initialDone);

            manager.toggleTask(prop.id, taskId);
            assert.equal(prop.checklist[0].tasks[0].done, initialDone);
        } finally {
            container.remove();
        }
    });

    test("filters by search query and status", () => {
        const container = document.createElement("div");
        container.id = "test-filters";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-filters", storage });
            manager.init();

            manager.searchQuery = "Merlot";
            const filtered = manager.getFilteredProperties();
            assert.equal(filtered.length, 1);
            assert.equal(filtered[0].name, "Merlot Apartment");

            manager.searchQuery = "";
            manager.statusFilter = "waiting";
            const waitingProps = manager.getFilteredProperties();
            assert.equal(waitingProps.length, 4);
        } finally {
            container.remove();
        }
    });

    test("removes stray floating theme toggle and exposes inventory-lang-switcher", () => {
        const container = document.createElement("div");
        container.id = "test-theme";
        const stray = document.createElement("button");
        stray.className = "theme-toggle theme-toggle-floating";
        document.body.append(container, stray);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-theme", storage });
            manager.init();

            assert.equal(document.querySelectorAll(".theme-toggle-floating").length, 0, "Stray floating toggle is removed");
            assert.ok(container.querySelector(".inventory-lang-switcher"), "Inline switcher is present");
        } finally {
            container.remove();
            stray.remove();
        }
    });

    test("closes drawer when clicking on the drawer overlay backdrop outside the panel", () => {
        const container = document.createElement("div");
        container.id = "test-drawer-backdrop";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-drawer-backdrop", storage });
            manager.init();

            const firstProp = manager.properties[0];
            manager.selectedPropertyId = firstProp.id;
            manager.render();

            assert.equal(manager.selectedPropertyId, firstProp.id, "Drawer is initially open");
            const overlay = container.querySelector("#asana-property-drawer-overlay");
            assert.ok(overlay, "Overlay exists");

            // Click directly on overlay backdrop
            overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.equal(manager.selectedPropertyId, null, "Drawer closed when clicking overlay backdrop");
        } finally {
            container.remove();
        }
    });

    test("closes drawer when clicking close button [data-action='close-drawer']", () => {
        const container = document.createElement("div");
        container.id = "test-drawer-close-btn";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-drawer-close-btn", storage });
            manager.init();

            manager.selectedPropertyId = manager.properties[0].id;
            manager.render();

            const closeBtn = container.querySelector(".asana-drawer button[data-action='close-drawer']");
            assert.ok(closeBtn, "Close button exists inside drawer");

            closeBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.equal(manager.selectedPropertyId, null, "Drawer closed after clicking close button");
        } finally {
            container.remove();
        }
    });

    test("closes new property modal when clicking on its backdrop", () => {
        const container = document.createElement("div");
        container.id = "test-modal-backdrop";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-modal-backdrop", storage });
            manager.init();

            const modal = container.querySelector("#new-property-modal");
            assert.ok(modal, "Modal exists");
            modal.classList.remove("hidden");
            assert.ok(!modal.classList.contains("hidden"), "Modal is visible");

            // Click directly on modal backdrop
            modal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.ok(modal.classList.contains("hidden"), "Modal hidden after clicking backdrop");
        } finally {
            container.remove();
        }
    });

    test("toggles hideNewListings option to hide new listings and show completed only", () => {
        const container = document.createElement("div");
        container.id = "test-hide-new";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-hide-new", storage });
            manager.init();

            assert.equal(manager.hideNewListings, false, "hideNewListings is false by default");
            assert.equal(manager.getFilteredProperties().length, 42, "Shows all 42 properties");

            // Toggle hide new listings
            manager.toggleHideNewListings();
            assert.equal(manager.hideNewListings, true, "hideNewListings is now true");
            assert.equal(manager.getFilteredProperties().length, 20, "Shows only completed listings (20)");
            assert.equal(storage.getItem("atlantic_holiday_new_properties_hide_new_v1"), "true", "Persists to storage");

            // Check UI button active state and active filter banner
            assert.ok(container.textContent.includes("Filtro Ativo"), "Shows active filter banner");

            // Click toggle button in topbar/sidebar via event delegation
            const toggleBtn = container.querySelector("[data-action='toggle-hide-new']");
            assert.ok(toggleBtn, "Toggle button rendered");
            toggleBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            assert.equal(manager.hideNewListings, false, "hideNewListings toggled back to false");
            assert.equal(manager.getFilteredProperties().length, 42, "Shows all 42 properties again");
        } finally {
            container.remove();
        }
    });

    test("allows hiding and unhiding an individual property", () => {
        const container = document.createElement("div");
        container.id = "test-hide-prop";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-hide-prop", storage });
            manager.init();

            const targetProp = manager.properties[0];
            assert.equal(targetProp.hidden, false);
            assert.equal(manager.getFilteredProperties().length, 42);

            manager.toggleHideProperty(targetProp.id);
            assert.equal(targetProp.hidden, true, "Property is marked hidden");
            assert.equal(manager.getFilteredProperties().length, 41, "Hidden property excluded from general list");

            manager.toggleHideProperty(targetProp.id);
            assert.equal(targetProp.hidden, false, "Property is unhidden");
            assert.equal(manager.getFilteredProperties().length, 42, "All properties visible again");
        } finally {
            container.remove();
        }
    });

    test("manages archived properties for stopped and permanently disabled processes", () => {
        const container = document.createElement("div");
        container.id = "test-archived-props";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-archived-props", storage });
            manager.init();

            // 1. Sidebar has "Propriedades Arquivadas" item with count 0 initially
            const archiveNav = container.querySelector("[data-action='filter-status'][data-status='archived']");
            assert.ok(archiveNav, "Archived properties nav item exists in sidebar");
            assert.ok(archiveNav.textContent.includes("Propriedades Arquivadas"));

            // 2. Initial active properties = 42, archived = 0
            assert.equal(manager.getFilteredProperties().length, 42);

            // 3. Switch to archived view: empty state is shown
            manager.statusFilter = "archived";
            manager.render();
            assert.equal(manager.getFilteredProperties().length, 0);
            assert.ok(container.textContent.includes("Nenhum alojamento arquivado"), "Shows empty state when no properties are archived");

            // 4. Archive a property (stopped/disabled process)
            const targetProp = manager.properties[0];
            manager.toggleArchiveProperty(targetProp.id);
            assert.equal(targetProp.status, "archived", "Property status is set to archived");

            // 5. Active views exclude archived property
            manager.statusFilter = "all";
            manager.render();
            assert.equal(manager.getFilteredProperties().length, 41, "Archived property excluded from active list");

            // 6. Archived view shows the archived property
            manager.statusFilter = "archived";
            manager.render();
            const archivedList = manager.getFilteredProperties();
            assert.equal(archivedList.length, 1, "Archived list contains the stopped property");
            assert.equal(archivedList[0].id, targetProp.id);
            assert.ok(container.textContent.includes(targetProp.name), "Renders archived property card");

            // 7. Open drawer for archived property: shows stopped/disabled warning banner and reactivate button
            manager.selectedPropertyId = targetProp.id;
            manager.render();
            assert.ok(container.textContent.includes("Processo Parado / Desativado Permanentemente"), "Shows archived banner in drawer");

            const reactivateBtn = container.querySelector(".asana-drawer [data-action='toggle-archive-property']");
            assert.ok(reactivateBtn, "Reactivate button is rendered");

            // 8. Reactivate the property
            reactivateBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.equal(targetProp.status, "in_progress", "Property restored to in_progress");

            manager.statusFilter = "all";
            assert.equal(manager.getFilteredProperties().length, 42, "Active list has 42 properties again");
        } finally {
            container.remove();
        }
    });

    test("keeps drawer open when clicking bed configuration controls with matched sizing", () => {
        const container = document.createElement("div");
        container.id = "test-bed-controls-sizing";
        document.body.appendChild(container);

        try {
            const storage = createMockStorage();
            const manager = new NewPropertiesManager({ containerId: "test-bed-controls-sizing", storage });
            manager.init();

            // 1. Open drawer for first property
            const targetProp = manager.properties[0];
            manager.selectedPropertyId = targetProp.id;
            manager.render();

            assert.equal(manager.selectedPropertyId, targetProp.id, "Drawer is open");

            // 2. Bed select and add button have matched classes
            const bedSelect = container.querySelector("#drawer-add-bed-select");
            const addBedBtn = container.querySelector(".asana-drawer button[data-action='add-bed']");
            assert.ok(bedSelect, "Bed select dropdown exists");
            assert.ok(addBedBtn, "Add bed button exists");
            assert.ok(bedSelect.classList.contains("asana-bed-select"), "Select has asana-bed-select class");
            assert.ok(addBedBtn.classList.contains("asana-bed-add-btn"), "Button has asana-bed-add-btn class");

            // 3. Click directly on bed select: drawer MUST NOT close
            bedSelect.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.equal(manager.selectedPropertyId, targetProp.id, "Drawer remains open when clicking bed select dropdown");

            // 4. Click on bed chip label: drawer MUST NOT close
            const bedChip = container.querySelector(".asana-bed-chip span");
            if (bedChip) {
                bedChip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                assert.equal(manager.selectedPropertyId, targetProp.id, "Drawer remains open when clicking inside bed chip");
            }

            // 5. Select bed type and click add bed button
            const initialBedsCount = (targetProp.beds || []).length;
            bedSelect.value = "single";
            addBedBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

            assert.equal(manager.selectedPropertyId, targetProp.id, "Drawer remains open after adding a bed");
            assert.equal((targetProp.beds || []).length, initialBedsCount + 1, "Bed was added to property");

            // 6. Clicking on the overlay backdrop outside the drawer still closes it
            const overlay = container.querySelector("#asana-property-drawer-overlay");
            assert.ok(overlay, "Overlay backdrop exists");
            overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            assert.equal(manager.selectedPropertyId, null, "Drawer closes when clicking overlay backdrop");
        } finally {
            container.remove();
        }
    });
});



