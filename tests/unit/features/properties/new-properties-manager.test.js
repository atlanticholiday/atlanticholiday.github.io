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
});

