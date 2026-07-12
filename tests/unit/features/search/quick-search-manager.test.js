import { describe, test, assert } from "../../../test-harness.js";
import {
  buildQuickSearchItems,
  normalizeSearchText,
  searchQuickSearchItems
} from "../../../../js/features/search/quick-search-manager.js";

describe("Quick search", () => {
  test("normalizes case and accents", () => {
    assert.equal(normalizeSearchText("  Água Rápida  "), "agua rapida");
    assert.equal(normalizeSearchText("Wi-Fi/TV"), "wi-fi tv");
  });

  test("filters page and record results through access checks", () => {
    const items = buildQuickSearchItems({
      canOpenPage: (pageName) => pageName !== "properties" && pageName !== "staff",
      dataManager: {
        canAccessApp: () => false,
        getActiveEmployees: () => [{ id: "emp-1", name: "Ana Silva" }]
      },
      properties: [{ id: "prop-1", name: "Casa Vista", location: "Funchal" }]
    });

    assert.ok(!items.some((item) => item.type === "property"));
    assert.ok(!items.some((item) => item.type === "staff"));
    assert.ok(!items.some((item) => item.pageName === "properties"));
  });

  test("ranks exact title matches above keyword-only matches", () => {
    const items = [
      {
        id: "guide-wifi",
        type: "guide",
        title: "Hot water protocol",
        subtitle: "Operational Guide",
        keywords: ["wifi"],
        priority: 50
      },
      {
        id: "page-wifi",
        type: "page",
        title: "WiFi",
        subtitle: "Settings",
        keywords: ["internet"],
        priority: 20
      }
    ];

    const results = searchQuickSearchItems(items, "wifi");
    assert.equal(results[0].id, "page-wifi");
  });

  test("creates Inventory as an external page result when granted", () => {
    const items = buildQuickSearchItems({
      canOpenPage: () => true,
      dataManager: {
        canAccessApp: (key) => key === "inventory",
        getActiveEmployees: () => []
      }
    });

    const result = searchQuickSearchItems(items, "inventory")[0];
    assert.equal(result.url, "inventory.html");
  });
});
