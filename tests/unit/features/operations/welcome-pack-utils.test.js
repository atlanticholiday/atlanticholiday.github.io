import { describe, test, assert } from "../../../test-harness.js";
import {
    formatWelcomePackCurrency,
    normalizeWelcomePackLog,
    summarizeWelcomePackCart,
    summarizeWelcomePackInventory,
    summarizeWelcomePackLogs
} from "../../../../js/features/operations/welcome-pack-utils.js";

describe("Welcome Pack utilities", () => {
    test("summarizes a cart with quantities and a manual charged amount", () => {
        const summary = summarizeWelcomePackCart([
            { name: "Water", quantity: 2, costPrice: 1.1, sellPrice: 2.5 },
            { name: "Cookies", quantity: 1, costPrice: 1.8, sellPrice: 4.2 }
        ], 8.4);

        assert.equal(summary.totals.totalLines, 2);
        assert.equal(summary.totals.totalUnits, 3);
        assert.equal(summary.totals.totalCost, 4);
        assert.equal(summary.totals.suggestedCharge, 9.2);
        assert.equal(summary.totals.chargedAmount, 8.4);
        assert.equal(summary.totals.profit, 4.4);
    });

    test("normalizes legacy logs that only stored totalSell", () => {
        const normalized = normalizeWelcomePackLog({
            property: "Sea Breeze",
            date: "2026-04-02",
            items: [{ name: "Wine", quantity: 1, costPrice: 4.5, sellPrice: 8 }],
            totalSell: 10
        });

        assert.equal(normalized.propertyName, "Sea Breeze");
        assert.equal(normalized.totalCost, 4.5);
        assert.equal(normalized.suggestedSell, 8);
        assert.equal(normalized.chargedAmount, 10);
        assert.equal(normalized.totalSell, 10);
        assert.equal(normalized.profit, 5.5);
    });

    test("summarizes logs by totals and property within a date range", () => {
        const summary = summarizeWelcomePackLogs([
            {
                property: "Sea Breeze",
                date: "2026-04-01",
                items: [{ name: "Water", quantity: 2, costPrice: 1, sellPrice: 2 }],
                chargedAmount: 6
            },
            {
                property: "Sea Breeze",
                date: "2026-04-04",
                items: [{ name: "Wine", quantity: 1, costPrice: 4, sellPrice: 8 }],
                totalSell: 9
            },
            {
                property: "Cliff House",
                date: "2026-03-20",
                items: [{ name: "Snacks", quantity: 1, costPrice: 3, sellPrice: 5 }],
                chargedAmount: 5
            }
        ], {
            startDate: "2026-04-01",
            endDate: "2026-04-30"
        });

        assert.equal(summary.totals.count, 2);
        assert.equal(summary.totals.units, 3);
        assert.equal(summary.totals.cost, 6);
        assert.equal(summary.totals.revenue, 15);
        assert.equal(summary.totals.profit, 9);
        assert.equal(summary.byProperty.length, 1);
        assert.equal(summary.byProperty[0].label, "Sea Breeze");
        assert.equal(summary.byProperty[0].count, 2);
        assert.equal(summary.byProperty[0].profit, 9);
        assert.equal(summary.recentLogs[0].date, "2026-04-04");
    });

    test("summarizes inventory value and low stock materials", () => {
        const summary = summarizeWelcomePackInventory([
            { name: "Water", quantity: 12, costPrice: 1.1, sellPrice: 2.4 },
            { name: "Cookies", quantity: 3, costPrice: 1.5, sellPrice: 3.6 }
        ]);

        assert.equal(summary.totals.materialCount, 2);
        assert.equal(summary.totals.stockUnits, 15);
        assert.equal(summary.totals.stockCostValue, 17.7);
        assert.equal(summary.totals.stockSellValue, 39.6);
        assert.equal(summary.totals.potentialProfit, 21.9);
        assert.equal(summary.totals.lowStockCount, 1);
        assert.equal(summary.lowStockItems[0].name, "Cookies");
    });

    test("formats euro values consistently", () => {
        assert.equal(formatWelcomePackCurrency(7), "€7.00");
        assert.equal(formatWelcomePackCurrency(7.456), "€7.46");
    });
});
