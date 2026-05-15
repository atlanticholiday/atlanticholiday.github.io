import { describe, test, assert } from "../../../test-harness.js";
import {
    createPlenoHotelEmail,
    filterPlenoHotelRecords,
    getRecordReminders,
    getWorkflowStage,
    normalizeBooleanStatus,
    normalizePlenoHotelRecord,
    parseBedSizes,
    parseMoney,
    parseSpreadsheetDate,
    summarizePlenoHotelRecords
} from "../../../../js/features/inventory/plenohotel-utils.js";

describe("PlenoHotel utilities", () => {
    test("normalizes mixed spreadsheet statuses", () => {
        assert.equal(normalizeBooleanStatus("Sim"), "yes");
        assert.equal(normalizeBooleanStatus("Não aprovado"), "no");
        assert.equal(normalizeBooleanStatus("Setembro"), "later");
        assert.equal(normalizeBooleanStatus("Vou verificar com a Marcia primeiro"), "ask");
        assert.equal(normalizeBooleanStatus("Sim, mas, ficou a faltar coisas"), "partial");
    });

    test("parses Excel dates, money, and bed sizes", () => {
        assert.equal(parseSpreadsheetDate(45813), "2025-06-05");
        assert.equal(parseSpreadsheetDate("13/5", { defaultYear: 2026 }), "2026-05-13");
        assert.equal(parseMoney("1.586,76 €"), 1586.76);

        const bedSizes = parseBedSizes(["1 - 200x160", "140x200 - 2"]);
        assert.equal(bedSizes.length, 2);
        assert.equal(bedSizes[0].quantity, 1);
        assert.equal(bedSizes[0].width, 200);
        assert.equal(bedSizes[1].quantity, 2);
    });

    test("derives workflow stages and reminders", () => {
        const record = normalizePlenoHotelRecord({
            propertyName: "Banana Lodge",
            needStatus: "yes",
            authorizationStatus: "yes",
            quoteNumber: "PH/213",
            deliveredStatus: "yes",
            chargedStatus: "unknown",
            plenoSubtotal: "1000",
            commissionRate: 10
        });

        assert.equal(getWorkflowStage(record).key, "waitingBilling");
        assert.equal(record.commissionAmount, 100);
        assert.equal(record.ownerChargeTotal, 1100);
        assert.ok(getRecordReminders(record).some((reminder) => reminder.includes("Charge the owner")));
    });

    test("summarizes and filters records by stage and query", () => {
        const records = [
            normalizePlenoHotelRecord({ propertyName: "Alpha", needStatus: "unknown" }),
            normalizePlenoHotelRecord({ propertyName: "Bravo", needStatus: "no" }),
            normalizePlenoHotelRecord({
                propertyName: "Charlie",
                needStatus: "yes",
                authorizationStatus: "yes",
                quoteNumber: "PH/1",
                deliveredStatus: "yes",
                chargedStatus: "yes",
                commissionAmount: 25
            })
        ];

        const summary = summarizePlenoHotelRecords(records);
        const complete = filterPlenoHotelRecords(records, { stage: "complete" });
        const alpha = filterPlenoHotelRecords(records, { query: "alp" });

        assert.equal(summary.total, 3);
        assert.equal(summary.stages.needsQuestion, 1);
        assert.equal(summary.stages.notNeeded, 1);
        assert.equal(summary.stages.complete, 1);
        assert.equal(summary.totalCommission, 25);
        assert.equal(complete.length, 1);
        assert.equal(complete[0].propertyName, "Charlie");
        assert.equal(alpha.length, 1);
    });

    test("creates supplier and owner emails from record data", () => {
        const record = normalizePlenoHotelRecord({
            propertyName: "Ocean View",
            supplierEmail: "pleno@example.com",
            ownerEmail: "owner@example.com",
            bedSizes: parseBedSizes(["1 - 160x200cm"]),
            ownerChargeTotal: 350
        });

        const quoteEmail = createPlenoHotelEmail(record, "quoteRequest");
        const ownerEmail = createPlenoHotelEmail(record, "ownerAuthorization");

        assert.equal(quoteEmail.to, "pleno@example.com");
        assert.includes(quoteEmail.body, "1 - 160x200cm");
        assert.equal(ownerEmail.to, "owner@example.com");
        assert.includes(ownerEmail.body, "350,00");
    });
});
