import { describe, test, assert } from "../../../test-harness.js";
import {
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
