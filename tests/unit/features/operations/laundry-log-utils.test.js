import { describe, test, assert } from "../../../test-harness.js";
import {
    compareLaundryLogPreviousStock,
    createEmptyLaundryLogItems,
    createLaundryLogRecord,
    filterLaundryLogRecords,
    summarizeLaundryLogRecord,
    summarizeLaundryLogRecords
} from "../../../../js/features/operations/laundry-log-utils.js";

describe("Laundry Log utilities", () => {
    test("creates a normalized record with mismatch status and derived totals", () => {
        const record = createLaundryLogRecord({
            propertyName: "Atlantic View",
            deliveryDate: "2026-04-10",
            receivedDate: "2026-04-12",
            items: {
                doubleFittedSheet: { delivered: 4, received: 3 },
                bathTowel: { delivered: 6, received: 6 }
            }
        }, {
            now: () => "2026-04-12T10:00:00.000Z"
        });

        assert.equal(record.status, "mismatch");
        assert.equal(record.deliveredUnits, 10);
        assert.equal(record.receivedUnits, 9);
        assert.equal(record.differenceUnits, 1);
        assert.deepEqual(record.mismatchItemKeys, ["doubleFittedSheet"]);
        assert.equal(record.monthKey, "2026-04");
    });

    test("treats a record with no return started as pending", () => {
        const summary = summarizeLaundryLogRecord({
            items: {
                ...createEmptyLaundryLogItems(),
                poolTowel: { delivered: 5, received: 0 }
            }
        });

        assert.equal(summary.status, "pending");
        assert.equal(summary.deliveredUnits, 5);
        assert.equal(summary.receivedUnits, 0);
        assert.equal(summary.mismatches.length, 1);
    });

    test("includes unlimited custom other items in totals, mismatches, and search", () => {
        const record = createLaundryLogRecord({
            propertyName: "Atlantic View",
            deliveryDate: "2026-04-10",
            receivedDate: "2026-04-12",
            customItems: [
                { name: "Beach bags", delivered: 3, received: 2 },
                { name: "Loose covers", delivered: 4, received: 4 },
                { name: "", delivered: 0, received: 0 }
            ]
        }, {
            now: () => "2026-04-12T10:00:00.000Z"
        });

        const summary = summarizeLaundryLogRecord(record);
        const otherSection = summary.sectionSummaries.find((section) => section.key === "other");
        const filtered = filterLaundryLogRecords([record], { query: "beach" });

        assert.equal(record.customItems.length, 2);
        assert.equal(record.status, "mismatch");
        assert.equal(record.deliveredUnits, 7);
        assert.equal(record.receivedUnits, 6);
        assert.equal(summary.mismatches[0].name, "Beach bags");
        assert.equal(otherSection.delivered, 7);
        assert.equal(filtered.length, 1);
    });

    test("compares current out counts with the previous completed return", () => {
        const previous = createLaundryLogRecord({
            propertyName: "Atlantic View",
            deliveryDate: "2026-04-10",
            receivedDate: "2026-04-12",
            items: {
                bathTowel: { delivered: 1, received: 1 },
                faceTowel: { delivered: 1, received: 1 }
            },
            customItems: [
                { name: "Beach bag", delivered: 1, received: 1 }
            ]
        }, {
            now: () => "2026-04-12T10:00:00.000Z"
        });
        const current = createLaundryLogRecord({
            propertyName: "Atlantic View",
            deliveryDate: "2026-04-15",
            items: {
                bathTowel: { delivered: 1, received: 0 }
            }
        }, {
            now: () => "2026-04-15T10:00:00.000Z"
        });

        const missing = compareLaundryLogPreviousStock(current, previous);

        assert.equal(missing.length, 2);
        assert.equal(missing[0].key, "faceTowel");
        assert.equal(missing[0].missing, 1);
        assert.equal(missing[1].name, "Beach bag");
    });

    test("summarizes record totals across statuses", () => {
        const records = [
            createLaundryLogRecord({
                propertyName: "Atlantic View",
                deliveryDate: "2026-04-10",
                items: {
                    bathTowel: { delivered: 3, received: 0 }
                }
            }, {
                now: () => "2026-04-10T08:00:00.000Z"
            }),
            createLaundryLogRecord({
                propertyName: "Calas Loft",
                deliveryDate: "2026-04-11",
                receivedDate: "2026-04-12",
                items: {
                    bathTowel: { delivered: 4, received: 4 }
                }
            }, {
                now: () => "2026-04-12T08:00:00.000Z"
            }),
            createLaundryLogRecord({
                propertyName: "Sea Breeze",
                deliveryDate: "2026-05-01",
                receivedDate: "2026-05-02",
                items: {
                    pillows: { delivered: 2, received: 1 }
                }
            }, {
                now: () => "2026-05-02T08:00:00.000Z"
            })
        ];

        const summary = summarizeLaundryLogRecords(records);

        assert.equal(summary.totals.count, 3);
        assert.equal(summary.totals.pending, 1);
        assert.equal(summary.totals.matched, 1);
        assert.equal(summary.totals.mismatch, 1);
        assert.equal(summary.totals.deliveredUnits, 9);
        assert.equal(summary.totals.receivedUnits, 5);
    });

    test("filters records by query, month, and status", () => {
        const records = [
            {
                id: "record-atlantic",
                ...createLaundryLogRecord({
                propertyName: "Atlantic View",
                deliveryDate: "2026-04-10",
                items: {
                    bathTowel: { delivered: 3, received: 0 }
                }
            }, {
                now: () => "2026-04-10T08:00:00.000Z"
                })
            },
            {
                id: "record-calas",
                ...createLaundryLogRecord({
                propertyName: "Calas Loft",
                deliveryDate: "2026-04-11",
                receivedDate: "2026-04-12",
                items: {
                    bathTowel: { delivered: 4, received: 4 }
                }
            }, {
                now: () => "2026-04-12T08:00:00.000Z"
                })
            },
            {
                id: "record-sea",
                ...createLaundryLogRecord({
                propertyName: "Sea Breeze",
                deliveryDate: "2026-05-01",
                receivedDate: "2026-05-02",
                items: {
                    pillows: { delivered: 2, received: 1 }
                }
            }, {
                now: () => "2026-05-02T08:00:00.000Z"
                })
            }
        ];

        const pendingApril = filterLaundryLogRecords(records, {
            status: "pending",
            month: "2026-04"
        });
        const seaQuery = filterLaundryLogRecords(records, {
            query: "sea"
        });

        assert.equal(pendingApril.length, 1);
        assert.equal(pendingApril[0].propertyName, "Atlantic View");
        assert.equal(pendingApril[0].id, "record-atlantic");
        assert.equal(seaQuery.length, 1);
        assert.equal(seaQuery[0].status, "mismatch");
        assert.equal(seaQuery[0].id, "record-sea");
    });
});
