import { describe, test, assert } from "../../../test-harness.js";
import {
    createLinenInventoryRecord,
    filterLinenInventoryRecords,
    isLinenInventoryRecordEditableByColleague,
    summarizeLinenInventoryRecord,
    summarizeLinenInventoryRecords
} from "../../../../js/features/operations/linen-inventory-utils.js";

describe("Linen Inventory utilities", () => {
    test("creates a normalized linen count for one property and date", () => {
        const record = createLinenInventoryRecord({
            propertyName: "Atlantic View",
            countedDate: "2026-04-12",
            sections: {
                doubleBed: { bedroomCount: 2, bedSize: "160x200" }
            },
            items: {
                bathTowel: { count: 6 },
                pillowCases: { count: 10 }
            },
            customItems: [
                { name: "Beach bags", count: 2 },
                { name: "", count: 0 }
            ],
            bedrooms: [
                {
                    name: "Bedroom 1",
                    beds: [
                        { type: "Double", size: "160x200" },
                        { type: "Double", size: "180x200" }
                    ]
                }
            ]
        }, {
            now: () => "2026-04-12T10:00:00.000Z"
        });
        const summary = summarizeLinenInventoryRecord(record);

        assert.equal(record.status, "counted");
        assert.equal(record.countedDate, "2026-04-12");
        assert.equal(record.countedUnits, 18);
        assert.equal(record.trackedItems, 3);
        assert.equal(record.sections.doubleBed.bedroomCount, 2);
        assert.equal(record.sections.doubleBed.bedSize, "160x200");
        assert.equal(record.customItems.length, 1);
        assert.equal(record.bedrooms[0].beds.length, 2);
        assert.equal(record.bedrooms[0].beds[1].size, "180x200");
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

    test("distinguishes an explicitly counted zero from an unchecked item", () => {
        const summary = summarizeLinenInventoryRecord({
            items: {
                bathTowel: { count: 0, checked: true },
                faceTowel: { count: 0, checked: false }
            }
        });

        assert.equal(summary.status, "counted");
        assert.equal(summary.countedUnits, 0);
        assert.equal(summary.trackedItems, 1);
        assert.equal(summary.sectionSummaries.find((section) => section.key === "towels").itemCount, 1);
    });

    test("tracks completion, targets, shortages, issues, and skipped sections", () => {
        const summary = summarizeLinenInventoryRecord({
            sections: {
                doubleBed: { notApplicable: true }
            },
            items: {
                bathTowel: { count: 3, checked: true, target: 5, issue: "missing", note: "Two missing" }
            }
        });

        assert.equal(summary.shortageUnits, 2);
        assert.equal(summary.issueCount, 1);
        assert.ok(summary.completion.completedItems > 1);
        assert.ok(summary.completion.remainingItems > 0);
    });

    test("uses the immutable target snapshot instead of nested client target values", () => {
        const untrusted = createLinenInventoryRecord({
            targets: {},
            items: {
                bathTowel: { count: 3, checked: true, target: 99 }
            }
        });
        const reviewed = createLinenInventoryRecord({
            targets: { bathTowel: 5 },
            items: {
                bathTowel: { count: 3, checked: true, target: 99 }
            }
        });

        assert.equal(untrusted.items.bathTowel.target, 0);
        assert.equal(untrusted.shortageUnits, 0);
        assert.equal(reviewed.items.bathTowel.target, 5);
        assert.equal(reviewed.shortageUnits, 2);
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
                    sections: {
                        doubleBed: { bedroomCount: 1, bedSize: "180x200" }
                    },
                    items: {
                        pillowCases: { count: 8 }
                    }
                }, {
                    now: () => "2026-04-13T10:00:00.000Z"
                })
            }
        ];

        const filtered = filterLinenInventoryRecords(records, { query: "calas" });
        const byBedSize = filterLinenInventoryRecords(records, { query: "180x200" });
        const summary = summarizeLinenInventoryRecords(records);

        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].id, "calas");
        assert.equal(byBedSize.length, 1);
        assert.equal(byBedSize[0].id, "calas");
        assert.equal(summary.totals.count, 2);
        assert.equal(summary.totals.countedUnits, 12);
        assert.equal(summary.totals.trackedItems, 2);
    });

    test("keeps workflow state and filters history by review status and date", () => {
        const records = [
            {
                id: "submitted",
                ...createLinenInventoryRecord({
                    propertyName: "Atlantic View",
                    countedDate: "2026-04-12",
                    workflowStatus: "submitted",
                    createdBy: { uid: "cleaner-1", name: "Ana" },
                    items: { bathTowel: { count: 4, checked: true } }
                }, { now: () => "2026-04-12T10:00:00.000Z" })
            },
            {
                id: "approved",
                ...createLinenInventoryRecord({
                    propertyName: "Calas Loft",
                    countedDate: "2026-05-03",
                    workflowStatus: "approved",
                    createdBy: { uid: "cleaner-2", name: "Beatriz" },
                    items: { pillowCases: { count: 8, checked: true } }
                }, { now: () => "2026-05-03T10:00:00.000Z" })
            }
        ];

        const filtered = filterLinenInventoryRecords(records, {
            workflowStatus: "submitted",
            dateFrom: "2026-04-01",
            dateTo: "2026-04-30"
        });

        assert.equal(filtered.length, 1);
        assert.equal(filtered[0].id, "submitted");
        assert.equal(filtered[0].workflowStatus, "submitted");
        assert.equal(filterLinenInventoryRecords(records, { query: "beatriz" })[0].id, "approved");
    });

    test("only lets a colleague edit their own draft or returned count", () => {
        const ownDraft = { workflowStatus: "draft", createdBy: { uid: "cleaner-1" } };
        const ownReturned = { workflowStatus: "needsCorrection", createdBy: { uid: "cleaner-1" } };
        const ownSubmitted = { workflowStatus: "submitted", createdBy: { uid: "cleaner-1" } };
        const otherDraft = { workflowStatus: "draft", createdBy: { uid: "cleaner-2" } };

        assert.equal(isLinenInventoryRecordEditableByColleague(ownDraft, "cleaner-1"), true);
        assert.equal(isLinenInventoryRecordEditableByColleague(ownReturned, "cleaner-1"), true);
        assert.equal(isLinenInventoryRecordEditableByColleague(ownSubmitted, "cleaner-1"), false);
        assert.equal(isLinenInventoryRecordEditableByColleague(otherDraft, "cleaner-1"), false);
    });
});
