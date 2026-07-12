import { describe, test, assert } from "../../../test-harness.js";
import {
  buildQuickSearchItems,
  QuickSearchManager,
  normalizeSearchText,
  searchQuickSearchItems
} from "../../../../js/features/search/quick-search-manager.js";

function removeQuickSearchDom() {
  document.getElementById("quick-search-trigger")?.remove();
  document.getElementById("quick-search-overlay")?.remove();
}

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

  test("opens a selected page result from the rendered list", () => {
    removeQuickSearchDom();

    let openedPage = null;
    let openedEventCount = 0;
    const manager = new QuickSearchManager({
      navigationManager: {
        canOpenPage: () => true,
        showPage: (pageName) => {
          openedPage = pageName;
        }
      },
      getDataManager: () => ({
        canAccessApp: () => false,
        getActiveEmployees: () => []
      })
    });

    document.addEventListener("operationsPageOpened", () => {
      openedEventCount += 1;
    }, { once: true });

    manager.init();
    manager.setEnabled(true);
    manager.open();
    manager.input.value = "operations";
    manager.input.dispatchEvent(new Event("input", { bubbles: true }));

    const resultButton = document.querySelector("[data-quick-search-index='0']");
    assert.ok(resultButton);
    resultButton.click();

    assert.equal(openedPage, "operations");
    assert.equal(openedEventCount, 1);
    assert.ok(manager.overlay.classList.contains("hidden"));

    removeQuickSearchDom();
  });

  test("hover selection does not replace result buttons before click", () => {
    removeQuickSearchDom();

    const manager = new QuickSearchManager({
      navigationManager: {
        canOpenPage: () => true,
        showPage: () => {}
      },
      getDataManager: () => ({
        canAccessApp: () => false,
        getActiveEmployees: () => []
      })
    });

    manager.init();
    manager.setEnabled(true);
    manager.open();

    const firstButton = document.querySelector("[data-quick-search-index='0']");
    const secondButton = document.querySelector("[data-quick-search-index='1']");
    assert.ok(firstButton);
    assert.ok(secondButton);

    secondButton.dispatchEvent(new Event("mouseenter"));

    assert.ok(document.querySelector("[data-quick-search-index='0']") === firstButton);
    assert.ok(secondButton.classList.contains("is-active"));
    assert.equal(secondButton.getAttribute("aria-selected"), "true");

    removeQuickSearchDom();
  });
});
