import { describe, test, assert } from "../../../test-harness.js";
import {
    CLEANING_AH_DEFAULTS,
    CLEANING_AH_RESERVATION_SOURCES,
    computeCleaningAhAmounts,
    createCleaningAhFingerprint,
    createCleaningAhRecord,
    createStandaloneLaundryRecord,
    deriveCleaningAhRecords,
    parseCleaningAhCsv,
    summarizeCleaningAhRecords,
    summarizeLaundryRecords
} from "../../../../js/features/operations/cleaning-ah-utils.js";

describe("Cleaning AH utilities", () => {
    test("computes platform commission, extracted VAT, and totals for manual entries", () => {
        const result = computeCleaningAhAmounts({
            guestAmount: 120,
            laundryKg: 10
        });

        assert.equal(result.platformCommission, 18.6);
        assert.equal(result.vatAmount, 21.64);
        assert.equal(result.totalToAhWithoutLaundry, 79.76);
        assert.equal(result.laundryAmount, 21);
        assert.equal(result.totalToAh, 58.76);
    });

    test("sets platform commission to zero for direct reservations", () => {
        const result = computeCleaningAhAmounts({
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.direct
        });

        assert.equal(result.platformCommission, 0);
        assert.equal(result.totalToAhWithoutLaundry, 98.36);
        assert.equal(result.reservationSource, "direct");
    });

    test("preserves imported financials while still generating the duplicate fingerprint", () => {
        const imported = createCleaningAhRecord({
            date: "2025-11-11",
            propertyName: "Acqua Beach",
            category: "Limpeza check-out",
            guestAmount: 120,
            platformCommission: 18.6,
            vatAmount: 21.64,
            totalToAhWithoutLaundry: 79.76,
            laundryAmount: 25.43,
            totalToAh: 54.33,
            source: "import"
        }, {
            defaults: CLEANING_AH_DEFAULTS,
            preserveProvidedFinancials: true
        });

        assert.equal(imported.totalToAh, 54.33);
        assert.equal(imported.fingerprint, createCleaningAhFingerprint(imported));
        assert.equal(imported.importWarnings?.length || 0, 0);
    });

    test("parses the cleaning csv and skips summary rows", () => {
        const csv = [
            ",,,,Total,\"9 015,00 €\",\"1 397,33 €\",\"1 625,66 €\",,,\"352,45 €\",\"4 257,54 €\"",
            ",Data,Mês,Tarefa,Categoria,Valor,Plataforma,IVA,Líquido AH,Contas IVA,Lavandaria S/IVA,Total para a AH",
            ",11/11/2025,novembro,Acqua Beach,Limpeza check-out,\"120,00 €\",\"18,60 €\",\"21,64 €\",\"79,76 €\",\"98,36 €\",\"25,43 €\",\"54,33 €\"",
            ",29/11/2025,novembro,Acqua Beach,Limpeza check-out,\"120,00 €\",\"18,60 €\",\"21,64 €\",\"79,76 €\",\"98,36 €\",,\"79,76 €\"",
            ",,,,,,,,,,,,,,,,,Total,\"9 672,58 €\""
        ].join("\n");

        const result = parseCleaningAhCsv(csv);

        assert.equal(result.records.length, 2);
        assert.equal(result.records[0].date, "2025-11-11");
        assert.equal(result.records[0].propertyName, "Acqua Beach");
        assert.equal(result.records[0].laundryAmount, 25.43);
        assert.equal(result.records[1].totalToAh, 79.76);
    });

    test("derives effective laundry and net from linked standalone laundry", () => {
        const records = [
            {
                id: "c1",
                ...createCleaningAhRecord({
                    date: "2025-11-18",
                    propertyName: "Acqua Beach",
                    category: "Limpeza check-out",
                    guestAmount: 120,
                    laundryAmount: 0,
                    source: "manual"
                })
            }
        ];
        const standaloneLaundry = [
            createStandaloneLaundryRecord({
                date: "2025-11-20",
                propertyName: "Ignored because linked",
                kg: 12,
                linkedCleaningId: "c1"
            })
        ];

        const derived = deriveCleaningAhRecords(records, standaloneLaundry);

        assert.equal(derived[0].linkedLaundryAmount, 25.2);
        assert.equal(derived[0].effectiveLaundryAmount, 25.2);
        assert.equal(derived[0].effectiveTotalToAh, 54.56);
    });

    test("summarizes cleaning records by totals, month, property, and category", () => {
        const records = [
            createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                guestAmount: 120,
                laundryAmount: 25.43,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-11-18",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                guestAmount: 120,
                laundryAmount: 0,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-12-01",
                propertyName: "Calas Loft",
                category: "Primeira Limpeza",
                guestAmount: 90,
                laundryAmount: 12.6,
                source: "manual"
            })
        ];
        records[1].id = "manual-cleaning";
        const standaloneLaundry = [
            createStandaloneLaundryRecord({
                date: "2025-11-20",
                propertyName: "Acqua Beach",
                kg: 12,
                linkedCleaningId: "manual-cleaning"
            })
        ];

        const summary = summarizeCleaningAhRecords(records, standaloneLaundry);

        assert.equal(summary.totals.count, 3);
        assert.equal(summary.totals.guestAmount, 330);
        assert.equal(summary.totals.cleaningsWithLaundry, 3);
        assert.equal(summary.byMonth.length, 2);
        assert.equal(summary.byProperty[0].label, "Acqua Beach");
        assert.equal(summary.byCategory[0].label, "Limpeza check-out");
        assert.equal(summary.records[1].effectiveLaundryAmount, 25.2);
    });

    test("combines cleaning laundry with standalone laundry entries", () => {
        const cleaningRecords = [
            {
                id: "imported-cleaning",
                ...createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                guestAmount: 120,
                laundryAmount: 25.2,
                source: "manual"
                })
            }
        ];
        const standaloneLaundry = [
            createStandaloneLaundryRecord({
                date: "2025-11-12",
                propertyName: "Calas Loft",
                kg: 8
            }),
            createStandaloneLaundryRecord({
                date: "2025-11-13",
                propertyName: "",
                kg: 6,
                linkedCleaningId: "imported-cleaning"
            })
        ];

        const summary = summarizeLaundryRecords(cleaningRecords, standaloneLaundry);

        assert.equal(summary.totals.count, 3);
        assert.equal(summary.totals.amount, 54.6);
        assert.equal(summary.byProperty[0].label, "Acqua Beach");
        assert.equal(summary.entries[0].date, "2025-11-13");
        assert.equal(summary.entries[0].propertyName, "Acqua Beach");
    });
});
