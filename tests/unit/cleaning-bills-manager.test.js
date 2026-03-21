import { describe, test, assert } from "../test-harness.js";
import { CleaningBillsManager } from "../../js/cleaning-bills-manager.js";
import { createStorageMock, installGlobalProperty } from "../test-utils.js";

describe("CleaningBillsManager", () => {
  test("normalizes locations case-insensitively to the canonical spelling", () => {
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock());
    const manager = new CleaningBillsManager();

    assert.equal(manager.normalizeLocation("funchal"), "Funchal");
    assert.equal(manager.normalizeLocation(""), "");
    assert.equal(manager.normalizeLocation("Unknown"), "");

    restoreStorage();
  });

  test("computes cleaning, laundry, and travel totals for fixed-price companies", () => {
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock());
    const manager = new CleaningBillsManager();
    manager.companyId = "seletivo";
    manager.type = "T2";
    manager.defaultKg = 10;
    manager.pricePerKg = 2;
    manager.location = "Funchal";

    const result = manager.compute();

    assert.equal(result.laundry, 20);
    assert.equal(result.cleaning, 65);
    assert.equal(result.travel, 5);
    assert.equal(result.total, 90);

    restoreStorage();
  });

  test("uses property prices for property-based companies", () => {
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock());
    const previousPropertiesManager = window.propertiesManager;
    window.propertiesManager = {
      properties: [
        {
          id: "property-1",
          name: "Atlantic View",
          location: "Caniço",
          cleaningCompanyContact: "That's Maid",
          cleaningCompanyPrice: "82.5"
        }
      ]
    };

    const manager = new CleaningBillsManager();
    manager.companyId = "thatsMaid";
    manager.activePropertyId = "property-1";
    manager.defaultKg = 8;
    manager.pricePerKg = 2.1;
    manager.location = "Caniço";

    const result = manager.compute();

    assert.equal(result.cleaning, 82.5);
    assert.equal(result.travel, 11);
    assert.equal(result.total, 110.3);

    window.propertiesManager = previousPropertiesManager;
    restoreStorage();
  });

  test("persists selected company and property in preferences", () => {
    const storage = createStorageMock();
    const restoreStorage = installGlobalProperty("localStorage", storage);
    const manager = new CleaningBillsManager();
    manager.companyId = "thatsMaid";
    manager.activePropertyId = "property-77";

    manager.savePrefs();

    const prefs = JSON.parse(localStorage.getItem("cleaningBillsPrefs"));
    assert.equal(prefs.lastCompanyId, "thatsMaid");
    assert.equal(prefs.lastPropertyByCompany.thatsMaid, "property-77");

    restoreStorage();
  });

  test("computes the embedded commission calculator consistently", () => {
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock());
    const manager = new CleaningBillsManager();
    manager.totalPosted = 100;
    manager.platformPct = 15;
    manager.vatPct = 22;

    const result = manager.computeCommission();

    assert.equal(result.platformFee, 15);
    assert.ok(result.vat > 18 && result.vat < 18.1, "VAT extraction should match gross-price formula");
    assert.ok(result.net > 66 && result.net < 67, "Net amount should remain in expected range");

    restoreStorage();
  });
});
