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
        permissionDenied: "Welcome Packs is not available for this account. Check your access level and try again."
      }
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
