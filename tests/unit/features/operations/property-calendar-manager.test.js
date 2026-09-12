import { describe, test, assert } from "../../../test-harness.js";
import { PropertyCalendarManager } from "../../../../js/features/operations/property-calendar-manager.js";

describe("PropertyCalendarManager", () => {
    test("initializes with expected default state", () => {
        const manager = new PropertyCalendarManager(null, "user-123", null);
        assert.ok(manager.state);
        assert.equal(manager.state.daysCount, 60);
        assert.equal(manager.state.searchQuery, "");
        assert.ok(manager.state.startDate.match(/^\d{4}-\d{2}-01$/));
    });

    test("renders empty state when no container properties exist", () => {
        let container = document.getElementById("property-calendar-page");
        if (!container) {
            container = document.createElement("div");
            container.id = "property-calendar-page";
            document.body.appendChild(container);
        }

        const manager = new PropertyCalendarManager(null, "user-123", null);
        manager.init();

        assert.ok(container.querySelector(".pms-calendar-page"));
        assert.ok(container.querySelector("#pms-search-input"));
        assert.ok(container.querySelector("#pms-today-btn"));
        assert.ok(container.querySelector("#pms-sync-btn"));
    });

    test("updates state and re-renders when date or search changes", () => {
        const container = document.getElementById("property-calendar-page");
        const manager = new PropertyCalendarManager(null, "user-123", null);
        manager.state.properties = [
            { id: "1", name: "Acqua Beach", reservations: [] },
            { id: "2", name: "Banana Lodge", reservations: [] }
        ];
        manager.render();

        const badge = container.querySelector(".pms-badge-count");
        assert.ok(badge.textContent.includes("2"));

        manager.state.searchQuery = "banana";
        manager.render();

        const updatedBadge = container.querySelector(".pms-badge-count");
        assert.ok(updatedBadge.textContent.includes("1"));
    });
});
