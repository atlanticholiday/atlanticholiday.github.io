import { describe, test, assert } from "../../../test-harness.js";
import {
    createLinenInventoryRecord,
    filterLinenInventoryRecords,
    summarizeLinenInventoryRecord,
    summarizeLinenInventoryRecords
} from "../../../../js/features/operations/linen-inventory-utils.js";

describe("Linen Inventory utilities", () => {
    test("creates a normalized linen count for one property and date", () => {
        const record = createLinenInventoryRecord({
            propertyName: "Atlantic View",
            countedDate: "2026-04-12",
            items: {
                bathTowel: { count: 6 },
                pillowCases: { count: 10 }
            },
            customItems: [
                { name: "Beach bags", count: 2 },
                { name: "", count: 0 }
            ]
        }, {
            now: () => "2026-04-12T10:00:00.000Z"
        });
        const summary = summarizeLinenInventoryRecord(record);

        assert.equal(record.status, "counted");
        assert.equal(record.countedDate, "2026-04-12");
        assert.equal(record.countedUnits, 18);
        assert.equal(record.trackedItems, 3);
        assert.equal(record.customItems.length, 1);
        assert.equal(summary.sectionSummaries.find((section) => section.key === "towels").count, 6);
    });

    test("marks records without counted quantities as empty", () => {
        const summary = summarizeLinenInventoryRecord({
            items: {
                poolTowel: { count: 0 }
            }
        });

        assert.equal(summary.status, "empty");
        assert.equal(summary.countedUnits, 0);
        assert.equal(summary.trackedItems, 0);
    });

    test("keeps old saved values readable as simple counts", () => {
        const summary = summarizeLinenInventoryRecord({
            items: {
                bathTowel: { counted: 4 },
                pillowCases: { setup: 2, spare: 2 }
            }
        });

        assert.equal(summary.status, "counted");
        assert.equal(summary.countedUnits, 8);
        assert.equal(summary.trackedItems, 2);
    });

    test("filters records by query and totals saved counts", () => {
        const records = [
            {
                id: "atlantic",
                ...createLinenInventoryRecord({
                    propertyName: "Atlantic View",
                    countedDate: "2026-04-12",
                    items: {
                        bathTowel: { count: 4 }
                    }
                }, {
                    now: () => "2026-04-12T10:00:00.000Z"
                })
            },
            {
                id: "calas",
                ...createLinenInventoryRecord({
                    propertyName: "Calas Loft",
                    countedDate: "2026-04-13",
                    items: {
                        pillowCases: { count: 8 }
                    }
                }, {
                    now: () => "2026-04-13T10:00:00.000Z"
                })
            }
        ];

        const filtered = filterLinenInventoryRecords(records, { query: "calas" });
        const summary = summarizeLinenInventoryRecords(records);

        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].id, "calas");
        assert.equal(summary.totals.count, 2);
        assert.equal(summary.totals.countedUnits, 12);
        assert.equal(summary.totals.trackedItems, 2);
    });
});
