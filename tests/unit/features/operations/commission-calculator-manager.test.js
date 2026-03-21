import { describe, test, assert } from "../../../test-harness.js";
import { CommissionCalculatorManager } from "../../../../js/features/operations/commission-calculator-manager.js";
import { almostEqual, resetDom } from "../../../test-utils.js";

describe("CommissionCalculatorManager", () => {
  test("computes platform fee, VAT extraction, and net correctly", () => {
    const manager = new CommissionCalculatorManager();
    manager.totalPosted = 100;
    manager.platformPct = 15;
    manager.vatPct = 22;

    const result = manager.compute();

    assert.ok(almostEqual(result.platformFee, 15), "Platform fee should be 15");
    assert.ok(almostEqual(result.vat, 18.0327868852), "VAT extraction formula changed");
    assert.ok(almostEqual(result.net, 66.9672131148), "Net result changed");
  });

  test("renders a breakdown into the target node", () => {
    resetDom(`<div id="commission-calculator-root"></div>`);
    const manager = new CommissionCalculatorManager();
    manager.render();

    assert.ok(document.getElementById("cc-breakdown"), "Breakdown container should exist after render");
    assert.includes(document.getElementById("commission-calculator-root").textContent, "Net remaining");
    resetDom();
  });

  test("reset restores the default calculator values", () => {
    const manager = new CommissionCalculatorManager();
    manager.totalPosted = 999;
    manager.platformPct = 3;
    manager.vatPct = 6;
    manager.render = () => {};

    manager.reset();

    assert.equal(manager.totalPosted, 100);
    assert.equal(manager.platformPct, 15);
    assert.equal(manager.vatPct, 22);
  });
});
