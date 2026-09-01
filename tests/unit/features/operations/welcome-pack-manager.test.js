import { describe, test, assert } from "../../../test-harness.js";
import { WelcomePackManager } from "../../../../js/features/operations/welcome-pack-manager.js";
import { resetDom, installGlobalProperty } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";

function primeWelcomePackTranslations() {
  i18n.currentLang = "en";
  i18n.translations.en = {
    ...(i18n.translations.en || {}),
    welcomePack: {
      ...((i18n.translations.en || {}).welcomePack || {}),
      reservations: {
        upcoming: {
          reserved: "Reserved"
        }
      },
      states: {
        unavailableTitle: "Welcome Packs Unavailable",
        permissionDenied: "Welcome Packs is not available for this account. Check your access level and try again.",
        permissionDeniedPrivileged: "Administrator access is recognized, but the server permissions for this feature are not active yet. Deploy the latest Firebase rules and try again."
      }
    }
  };
}

function primePortugueseWelcomePackTranslations() {
  i18n.currentLang = "pt";
  i18n.translations.pt = {
    ...(i18n.translations.pt || {}),
    welcomePack: {
      ...((i18n.translations.pt || {}).welcomePack || {})
    }
  };
}

async function flushRender() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("WelcomePackManager", () => {
  test("calculates VAT from a net amount", () => {
    const manager = new WelcomePackManager({});
    const result = manager.calculateVAT(10, 22);

    assert.equal(result.net, 10);
    assert.equal(result.vatAmount, 2.2);
    assert.equal(result.grossPrice, 12.2);
    assert.equal(result.rate, 22);
  });

  test("parses iCal reservations into check-in and check-out dates", () => {
    primeWelcomePackTranslations();
    const manager = new WelcomePackManager({});
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260321",
      "DTEND;VALUE=DATE:20260325",
      "SUMMARY:Booking.com - Guest One",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260401",
      "DTEND;VALUE=DATE:20260405",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\n");

    const reservations = manager.parseIcalData(ical, "Sea Breeze");

    assert.equal(reservations.length, 2);
    assert.equal(reservations[0].propertyName, "Sea Breeze");
    assert.match(reservations[0].checkIn, /^2026-03-21T00:00:00/);
    assert.match(reservations[0].checkOut, /^2026-03-25T00:00:00/);
    assert.equal(reservations[0].summary, "Booking.com - Guest One");
    assert.equal(reservations[1].summary, "Reserved");
  });

  test("blocks browser-side iCal requests", async () => {
    const manager = new WelcomePackManager({});
    let rejected = false;

    try {
      await manager.fetchAndParseIcal("https://example.test/private.ics", "Sea Breeze");
    } catch (error) {
      rejected = true;
      assert.includes(error.message, "protected backend");
    }

    assert.equal(rejected, true);
  });

  test("loads minimal reservation data through the protected service without browser caching", async () => {
    primeWelcomePackTranslations();
    resetDom(`
      <div id="wp-reservations-list"></div>
      <button id="wp-sync-reservations-btn"></button>
      <span id="wp-last-sync-label"></span>
      <span id="wp-today-count"></span>
      <span id="wp-week-count"></span>
      <span id="wp-period-count"></span>
    `);
    localStorage.removeItem("wp_reservations");
    localStorage.removeItem("wp_last_sync");

    const requestedDays = [];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const checkout = new Date(tomorrow);
    checkout.setDate(checkout.getDate() + 2);
    const propertyName = 'Sea <img src=x onerror="window.__guestXss=true"> Breeze';
    const manager = new WelcomePackManager({
      async getAllProperties() {
        return [{ id: "p1", name: propertyName, welcomePackEnabled: true }];
      }
    }, {
      async getUpcomingReservations(payload) {
        requestedDays.push(payload.days);
        return {
          data: {
            reservations: [{
              propertyName,
              checkIn: tomorrow.toISOString(),
              checkOut: checkout.toISOString(),
              portal: "Airbnb"
            }]
          }
        };
      }
    });

    await manager.syncAndDisplayReservations(false);

    assert.deepEqual(requestedDays, [7]);
    assert.equal(document.querySelector("#wp-reservations-list img"), null);
    assert.includes(document.getElementById("wp-reservations-list").textContent, propertyName);
    assert.equal(localStorage.getItem("wp_reservations"), null);
    assert.equal(localStorage.getItem("wp_last_sync"), null);
  });

  test("invalidates either one cache bucket or an array of buckets", () => {
    const manager = new WelcomePackManager({});
    manager.cache.logs = [1];
    manager.cache.items = [2];
    manager.cache.presets = [3];

    manager._invalidateCache("logs");
    manager._invalidateCache(["items", "presets"]);

    assert.equal(manager.cache.logs, null);
    assert.equal(manager.cache.items, null);
    assert.equal(manager.cache.presets, null);
  });

  test("renders an inline error when the dashboard cannot be loaded", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      const manager = new WelcomePackManager({
        async getWelcomePackLogs() {
          const error = new Error("Missing or insufficient permissions.");
          error.code = "permission-denied";
          throw error;
        },
        async getWelcomePackItems() {
          return [];
        }
      });

      manager.currentView = "dashboard";
      manager.init();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const text = document.getElementById("wp-view-container").textContent;
      assert.includes(text, "Welcome Packs Unavailable");
      assert.includes(text, "not available for this account");
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("creates multiple property charge rows for new entries", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);

    const manager = new WelcomePackManager({
      async getWelcomePackLogs() {
        return [];
      },
      async getWelcomePackItems() {
        return [];
      },
      async getWelcomePackPresets() {
        return [];
      },
      async getAllProperties() {
        return [{ id: "p1", name: "Sea Breeze", welcomePackEnabled: true }];
      }
    });

    manager.currentView = "log";
    await manager.render();
    await flushRender();

    document.getElementById("wp-add-log-entry-btn").click();

    assert.equal(document.querySelectorAll("[data-wp-log-entry-id]").length, 2);
  });

  test("uses one invoice import for every material and keeps manual decimal quantities", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const manager = new WelcomePackManager({
      async getWelcomePackLogs() { return []; },
      async getWelcomePackItems() { return []; },
      async getWelcomePackPurchases() { return []; }
    });

    manager.currentView = "purchases";
    await manager.render();
    await flushRender();
    assert.equal(document.getElementById("wp-fruit-purchase-btn"), null);
    assert.ok(document.getElementById("wp-import-invoice-btn"));

    document.getElementById("wp-new-purchase-btn").click();
    await manager.renderCurrentView();

    assert.equal(document.querySelectorAll("[data-purchase-line-id]").length, 1);

    const quantityInput = document.querySelector('[data-purchase-line-field="purchaseQuantity"]');
    quantityInput.value = "2.135";
    quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
    const stockUnit = document.querySelector('[data-purchase-line-field="stockUnit"]');
    stockUnit.value = "kg";
    stockUnit.dispatchEvent(new Event("change", { bubbles: true }));

    assert.equal(manager.purchaseDraft.lines[0].stockQuantity, 2.135);
    assert.equal(manager.purchaseDraft.lines[0].stockUnit, "kg");
  });

  test("opens a bulk purchase draft from the workspace header", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const manager = new WelcomePackManager({
      async getWelcomePackLogs() { return []; },
      async getWelcomePackItems() { return []; },
      async getWelcomePackPurchases() { return []; }
    });

    await manager.render();
    await flushRender();
    document.querySelector("[data-wp-start-purchase]").click();
    await flushRender();

    assert.equal(manager.currentView, "purchases");
    assert.ok(manager.purchaseDraft);
    assert.ok(document.querySelector(".welcome-pack-purchase-editor"));
  });

  test("opens with a Portuguese overview split into daily work and setup", async () => {
    primePortugueseWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const manager = new WelcomePackManager({
      async getWelcomePackLogs() { return []; },
      async getWelcomePackItems() { return []; }
    });

    await manager.render();
    await flushRender();

    assert.equal(manager.currentView, "overview");
    assert.includes(document.getElementById("welcome-pack-content").textContent, "Operação diária");
    assert.includes(document.getElementById("welcome-pack-content").textContent, "Preparação e stock");
    assert.equal(document.querySelectorAll(".welcome-pack-overview-step").length, 6);
    assert.equal(document.querySelector('[data-wp-view="overview"]').getAttribute("aria-current"), "page");
  });

  test("opens the walkthrough and routes directly to the selected area", async () => {
    primePortugueseWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const manager = new WelcomePackManager({
      async getWelcomePackLogs() { return []; },
      async getWelcomePackItems() { return []; }
    });

    await manager.render();
    await flushRender();
    document.querySelector("[data-wp-open-guide]").click();

    assert.equal(document.querySelectorAll("[data-wp-guide-view]").length, 6);
    assert.includes(document.getElementById("wp-help-modal").textContent, "Como funcionam os Welcome Packs");

    document.querySelector('[data-wp-guide-view="dashboard"]').click();
    await flushRender();

    assert.equal(manager.currentView, "dashboard");
    assert.ok(document.querySelector('[data-wp-view="dashboard"].is-active'));
  });

  test("explains missing server rules when an administrator is denied", () => {
    primeWelcomePackTranslations();
    const manager = new WelcomePackManager({
      hasPrivilegedRole() { return true; }
    });
    const error = new Error("Missing or insufficient permissions.");
    error.code = "permission-denied";

    assert.includes(manager.describeLoadError(error), "Administrator access is recognized");
  });

  test("saves a reviewed purchase and clears the draft", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const saved = [];
    const alerts = [];
    const restoreAlert = installGlobalProperty("alert", (message) => alerts.push(message));

    try {
      const manager = new WelcomePackManager({
        async getWelcomePackLogs() { return []; },
        async getWelcomePackItems() { return []; },
        async getWelcomePackPurchases() { return []; },
        async saveWelcomePackPurchase(purchase) {
          saved.push(purchase);
          return { id: purchase.id, lines: purchase.lines };
        }
      });

      manager.currentView = "purchases";
      await manager.render();
      await flushRender();
      manager.startPurchaseDraft();
      await manager.renderCurrentView();

      const supplier = document.querySelector('[data-purchase-meta="supplier"]');
      supplier.value = "Supplier A";
      supplier.dispatchEvent(new Event("input", { bubbles: true }));
      const name = document.querySelector('[data-purchase-line-field="name"]');
      name.value = "Water";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      const quantity = document.querySelector('[data-purchase-line-field="purchaseQuantity"]');
      quantity.value = "24";
      quantity.dispatchEvent(new Event("input", { bubbles: true }));
      const price = document.querySelector('[data-purchase-line-field="unitPrice"]');
      price.value = "0.5";
      price.dispatchEvent(new Event("input", { bubbles: true }));

      await manager.savePurchaseDraft();

      assert.equal(saved.length, 1);
      assert.equal(saved[0].lines[0].stockQuantity, 24);
      assert.equal(manager.purchaseDraft, null);
      assert.ok(alerts.length > 0);
    } finally {
      restoreAlert();
    }
  });

  test("saves multiple property charge rows as a batch", async () => {
    primeWelcomePackTranslations();
    resetDom(`<div id="welcome-pack-content"></div>`);
    const alerts = [];
    const restoreAlert = installGlobalProperty("alert", (message) => alerts.push(message));
    const savedBatches = [];

    try {
      const manager = new WelcomePackManager({
        async getWelcomePackLogs() {
          return [];
        },
        async getWelcomePackItems() {
          return [{
            id: "item-1",
            name: "Water",
            quantity: 10,
            costPrice: 1,
            sellPrice: 2
          }];
        },
        async getWelcomePackPresets() {
          return [];
        },
        async getAllProperties() {
          return [{ id: "p1", name: "Sea Breeze", welcomePackEnabled: true }];
        },
        async logWelcomePackBatch(logs) {
          savedBatches.push(logs);
        }
      });

      manager.currentView = "log";
      await manager.render();
      await flushRender();

      manager.addItemToCart({
        id: "item-1",
        name: "Water",
        quantity: 1,
        costPrice: 1,
        sellPrice: 2
      });

      const [firstEntry] = manager.logEntries;
      manager.updateLogEntryField(firstEntry.id, "property", "Sea Breeze");
      manager.updateLogEntryField(firstEntry.id, "date", "2026-04-14");

      manager.addLogEntry({
        property: "Ocean View",
        date: "2026-04-15"
      });

      manager.updateLogEntryField(firstEntry.id, "chargedAmount", "2");
      manager.updateLogEntryField(manager.logEntries[1].id, "chargedAmount", "2");

      await manager.saveLog();

      assert.equal(savedBatches.length, 1);
      assert.equal(savedBatches[0].length, 2);
      assert.equal(savedBatches[0][0].property, "Sea Breeze");
      assert.equal(savedBatches[0][1].property, "Ocean View");
      assert.equal(savedBatches[0][0].date, "2026-04-14");
      assert.equal(savedBatches[0][1].date, "2026-04-15");
      assert.equal(savedBatches[0][0].chargedAmountNet, 2);
      assert.equal(savedBatches[0][1].chargedAmountNet, 2);
      assert.equal(savedBatches[0][0].chargedAmount, 2);
      assert.equal(savedBatches[0][1].chargedAmount, 2);
      assert.equal(savedBatches[0][0].chargedAmountGross, 2.44);
      assert.equal(savedBatches[0][1].chargedAmountGross, 2.44);
      assert.equal(savedBatches[0][0].totalSell, 2);
      assert.equal(savedBatches[0][1].totalSell, 2);
      assert.ok(alerts.length > 0);
    } finally {
      restoreAlert();
    }
  });
});
