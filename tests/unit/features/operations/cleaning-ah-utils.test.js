import { describe, test, assert } from "../../../test-harness.js";
import {
    CLEANING_AH_CATEGORY_KEYS,
    CLEANING_AH_DEFAULTS,
    CLEANING_AH_RESERVATION_SOURCES,
    calculateAverageRemainingPerCleaning,
    computeCleaningAhAmounts,
    createCleaningAhFingerprint,
    createCleaningAhRecord,
    createStandaloneLaundryRecord,
    deriveCleaningAhRecords,
    filterCleaningRegisterEntries,
    filterLaundryRegisterEntries,
    parseCleaningAhCsv,
    resolveLaundryAmount,
    summarizeCleaningAhRecords,
    summarizeCleaningAhPropertyDetail,
    summarizeCleaningAhPropertyRows,
    sortCleaningAhPropertyRows,
    summarizeLaundryRecords,
    combineCleaningAndLaundryMonthlySummaries,
    combineCleaningAndLaundryPropertySummaries
} from "../../../../js/features/operations/cleaning-ah-utils.js";

describe("Cleaning AH utilities", () => {
    test("averages remaining earnings per cleaning, including losses and no-cleaning periods", () => {
        assert.equal(calculateAverageRemainingPerCleaning(22628.13, 454), 49.84);
        assert.equal(calculateAverageRemainingPerCleaning(257, 2), 128.5);
        assert.equal(calculateAverageRemainingPerCleaning(-12, 2), -6);
        assert.equal(calculateAverageRemainingPerCleaning(0, 2), 0);
        assert.equal(calculateAverageRemainingPerCleaning(-12, 0), null);
        assert.equal(calculateAverageRemainingPerCleaning(0, 0), null);
    });

    test("computes platform commission, extracted VAT, and totals for manual entries", () => {
        const result = computeCleaningAhAmounts({
            guestAmount: 120
        });

        assert.equal(result.platformCommission, 18.6);
        assert.equal(result.vatAmount, 21.64);
        assert.equal(result.totalToAhWithoutLaundry, 79.76);
        assert.equal(result.totalToAh, 79.76);
    });

    test("resolves laundry amount from kg and rate", () => {
        assert.equal(resolveLaundryAmount({ kg: 5, amount: 0, laundryRatePerKg: 2.3 }), 11.5);
        assert.equal(resolveLaundryAmount({ kg: 5, amount: 15, laundryRatePerKg: 2.3 }), 15);
    });

    test("sets platform commission to zero for direct reservations", () => {
        const result = computeCleaningAhAmounts({
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.direct
        });

        assert.equal(result.platformCommission, 0);
        assert.equal(result.totalToAhWithoutLaundry, 98.36);
        assert.equal(result.totalToAh, 98.36);
        assert.equal(result.reservationSource, "direct");
    });

    test("skips platform commission for owner, first-cleaning, and other-cleanings categories", () => {
        const ownerResult = computeCleaningAhAmounts({
            categoryKey: CLEANING_AH_CATEGORY_KEYS.ownerCheckout,
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform
        });
        const firstCleaningResult = computeCleaningAhAmounts({
            categoryKey: CLEANING_AH_CATEGORY_KEYS.firstCleaning,
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform
        });
        const otherCleaningsResult = computeCleaningAhAmounts({
            categoryKey: CLEANING_AH_CATEGORY_KEYS.otherCleanings,
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform
        });

        assert.equal(ownerResult.platformCommission, 0);
        assert.equal(ownerResult.vatAmount, 21.64);
        assert.equal(firstCleaningResult.platformCommission, 0);
        assert.equal(firstCleaningResult.vatAmount, 21.64);
        assert.equal(otherCleaningsResult.platformCommission, 0);
        assert.equal(otherCleaningsResult.vatAmount, 21.64);
        assert.equal(ownerResult.reservationSource, CLEANING_AH_RESERVATION_SOURCES.direct);
        assert.equal(firstCleaningResult.reservationSource, CLEANING_AH_RESERVATION_SOURCES.direct);
        assert.equal(otherCleaningsResult.reservationSource, CLEANING_AH_RESERVATION_SOURCES.direct);
    });

    test("treats mid-term cleanings as saved amount without commission or VAT", () => {
        const result = computeCleaningAhAmounts({
            categoryKey: CLEANING_AH_CATEGORY_KEYS.midTerm,
            guestAmount: 120,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform
        });

        assert.equal(result.platformCommission, 0);
        assert.equal(result.vatAmount, 0);
        assert.equal(result.totalToAhWithoutLaundry, 120);
        assert.equal(result.totalToAh, 120);
        assert.equal(result.reservationSource, CLEANING_AH_RESERVATION_SOURCES.direct);
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
        assert.equal(imported.importWarnings?.length || 0, 1);
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
        assert.equal(result.records[1].totalToAh, 79.76);
    });

    test("derives cleaning records with effective total to AH", () => {
        const records = [
            {
                id: "c1",
                ...createCleaningAhRecord({
                    date: "2025-11-18",
                    propertyName: "Acqua Beach",
                    category: "Limpeza check-out",
                    guestAmount: 120,
                    source: "manual"
                })
            }
        ];

        const derived = deriveCleaningAhRecords(records);

        assert.equal(derived[0].effectiveTotalToAh, 79.76);
    });

    test("creates standalone laundry records with quantity and custom rate per kg", () => {
        const record = createStandaloneLaundryRecord({
            date: "2025-11-20",
            propertyName: "Acqua Beach",
            quantity: 3,
            kg: 10,
            laundryRatePerKg: 2.35
        });

        assert.equal(record.quantity, 3);
        assert.equal(record.laundryRatePerKg, 2.35);
        assert.equal(record.amount, 23.5);
    });

    test("summarizes cleaning records by totals, month, property, and category", () => {
        const records = [
            createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                guestAmount: 120,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-11-18",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                guestAmount: 120,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-12-01",
                propertyName: "Calas Loft",
                category: "Primeira Limpeza",
                guestAmount: 90,
                source: "manual"
            })
        ];

        const summary = summarizeCleaningAhRecords(records);

        assert.equal(summary.totals.count, 3);
        assert.equal(summary.totals.guestAmount, 330);
        assert.equal(summary.byMonth.length, 2);
        assert.equal(summary.byProperty[0].label, "Acqua Beach");
        assert.equal(summary.byCategory[0].key, CLEANING_AH_CATEGORY_KEYS.checkout);
    });

    test("builds sortable property comparison rows from derived cleaning records", () => {
        const records = summarizeCleaningAhRecords([
            createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
                guestAmount: 120,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-11-18",
                propertyName: "Acqua Beach",
                category: "Primeira Limpeza",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.direct,
                guestAmount: 90,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-11-19",
                propertyName: "Bravo",
                category: "Limpeza check-out",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
                guestAmount: 100,
                source: "manual"
            })
        ]).records;

        const rows = summarizeCleaningAhPropertyRows(records);
        const sortedRows = sortCleaningAhPropertyRows(rows, "count-desc");

        assert.equal(rows.length, 2);
        assert.equal(sortedRows[0].label, "Acqua Beach");
        assert.equal(sortedRows[0].count, 2);
        assert.equal(sortedRows[0].platformCount, 1);
        assert.equal(sortedRows[0].directCount, 1);
        assert.equal(sortedRows[0].lastEntryDate, "2025-11-18");
    });

    test("summarizes detailed stats for one selected property", () => {
        const records = summarizeCleaningAhRecords([
            createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                category: "Limpeza check-out",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
                guestAmount: 120,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-12-01",
                propertyName: "Acqua Beach",
                category: "Primeira Limpeza",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.direct,
                guestAmount: 90,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-12-02",
                propertyName: "Bravo",
                category: "Limpeza check-out",
                reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
                guestAmount: 100,
                source: "manual"
            })
        ]).records;

        const detail = summarizeCleaningAhPropertyDetail(records, "Acqua Beach");

        assert.equal(detail.propertyName, "Acqua Beach");
        assert.equal(detail.totals.count, 2);
        assert.equal(detail.totals.platformCount, 1);
        assert.equal(detail.totals.directCount, 1);
        assert.equal(detail.byMonth.length, 2);
        assert.equal(detail.byCategory[0].count, 1);
        assert.equal(detail.byReservationSource.length, 2);
        assert.equal(detail.recentEntries[0].date, "2025-12-01");
    });

    test("merges legacy and normalized category labels into one stats category", () => {
        const summary = summarizeCleaningAhRecords([
            createCleaningAhRecord({
                date: "2025-11-11",
                propertyName: "Acqua Beach",
                categoryKey: CLEANING_AH_CATEGORY_KEYS.firstCleaning,
                category: "Primeira limpeza",
                guestAmount: 90,
                source: "manual"
            }),
            createCleaningAhRecord({
                date: "2025-11-12",
                propertyName: "Acqua Beach",
                category: "Primeira limpeza",
                guestAmount: 80,
                source: "import"
            }),
            createCleaningAhRecord({
                date: "2025-11-13",
                propertyName: "Bravo",
                category: "Limpeza intermédia",
                guestAmount: 70,
                source: "import"
            })
        ]);

        const firstCleaningGroup = summary.byCategory.find((entry) => entry.key === CLEANING_AH_CATEGORY_KEYS.firstCleaning);
        const midTermGroup = summary.byCategory.find((entry) => entry.key === CLEANING_AH_CATEGORY_KEYS.midTerm);

        assert.equal(summary.byCategory.length, 2);
        assert.equal(firstCleaningGroup.count, 2);
        assert.equal(midTermGroup.count, 1);
    });

    test("summarizes standalone laundry records", () => {
        const standaloneLaundry = [
            {
                id: "standalone-laundry",
                ...createStandaloneLaundryRecord({
                    date: "2025-11-12",
                    propertyName: "Calas Loft",
                    quantity: 2,
                    kg: 8
                })
            },
            {
                id: "standalone-laundry-2",
                ...createStandaloneLaundryRecord({
                    date: "2025-11-13",
                    propertyName: "Acqua Beach",
                    quantity: 4,
                    kg: 6
                })
            }
        ];

        const summary = summarizeLaundryRecords(standaloneLaundry);

        assert.equal(summary.totals.count, 2);
        assert.equal(summary.totals.quantity, 6);
        assert.equal(summary.totals.kg, 14);
        assert.equal(summary.totals.amount, 32.2);
        assert.equal(summary.byProperty[0].label, "Calas Loft");
    });

    test("filters and sorts standalone laundry register entries", () => {
        const entries = [
            {
                id: "entry-1",
                date: "2025-11-10",
                propertyName: "Bravo",
                quantity: 1,
                kg: 4,
                amount: 10.4
            },
            {
                id: "entry-2",
                date: "2025-11-12",
                propertyName: "Acqua",
                quantity: 5,
                kg: 7,
                amount: 18.2
            },
            {
                id: "entry-3",
                date: "2025-11-11",
                propertyName: "Calas",
                quantity: 2,
                kg: 3,
                amount: 7.8
            }
        ];

        const propertySortedEntries = filterLaundryRegisterEntries(entries, { sort: "property-asc" });
        const amountSortedEntries = filterLaundryRegisterEntries(entries, { sort: "amount-desc" });
        const quantitySortedEntries = filterLaundryRegisterEntries(entries, { sort: "quantity-desc" });

        assert.equal(propertySortedEntries[0].propertyName, "Acqua");
        assert.equal(propertySortedEntries[2].propertyName, "Calas");
        assert.equal(amountSortedEntries[0].id, "entry-2");
        assert.equal(amountSortedEntries[2].id, "entry-3");
        assert.equal(quantitySortedEntries[0].id, "entry-2");
        assert.equal(quantitySortedEntries[2].id, "entry-1");
    });

    test("filters and sorts cleaning register entries", () => {
        const entries = [
            {
                id: "cleaning-1",
                date: "2025-11-10",
                propertyName: "Bravo",
                guestAmount: 120,
                effectiveTotalToAh: 82
            },
            {
                id: "cleaning-2",
                date: "2025-11-12",
                propertyName: "Acqua",
                guestAmount: 160,
                effectiveTotalToAh: 99.7
            },
            {
                id: "cleaning-3",
                date: "2025-11-11",
                propertyName: "Calas",
                guestAmount: 90,
                effectiveTotalToAh: 61.43
            }
        ];

        const propertySortedEntries = filterCleaningRegisterEntries(entries, { sort: "property-asc" });
        const netSortedEntries = filterCleaningRegisterEntries(entries, { sort: "net-desc" });

        assert.equal(propertySortedEntries[0].propertyName, "Acqua");
        assert.equal(propertySortedEntries[2].propertyName, "Calas");
        assert.equal(netSortedEntries[0].id, "cleaning-2");
        assert.equal(netSortedEntries[2].id, "cleaning-3");
    });

    test("combines cleaning and laundry monthly summaries into consolidated performance", () => {
        const cleaningByMonth = [
            {
                key: "2026-04",
                label: "2026-04",
                count: 10,
                guestAmount: 1500,
                platformCommission: 232.5,
                vatAmount: 270.5,
                totalToAh: 997
            }
        ];
        const laundryByMonth = [
            {
                key: "2026-04",
                label: "2026-04",
                count: 5,
                quantity: 15,
                kg: 40,
                amount: 92
            }
        ];

        const combined = combineCleaningAndLaundryMonthlySummaries(cleaningByMonth, laundryByMonth);

        assert.equal(combined.length, 1);
        assert.equal(combined[0].cleaningsCount, 10);
        assert.equal(combined[0].cleaningsNetToAh, 997);
        assert.equal(combined[0].laundryCount, 5);
        assert.equal(combined[0].laundryKg, 40);
        assert.equal(combined[0].laundryAmount, 92);
        assert.equal(combined[0].finalNetEarnings, 905); // 997 - 92
    });

    test("combines cleaning and laundry property summaries into consolidated ranking", () => {
        const cleaningByProperty = [
            {
                key: "acqua",
                label: "Acqua Beach",
                count: 4,
                guestAmount: 600,
                totalToAh: 420
            },
            {
                key: "calas",
                label: "Calas",
                count: 2,
                guestAmount: 300,
                totalToAh: 210
            }
        ];
        const laundryByProperty = [
            {
                key: "acqua",
                label: "Acqua Beach",
                count: 2,
                quantity: 6,
                kg: 20,
                amount: 46
            },
            {
                key: "calas",
                label: "Calas",
                count: 1,
                quantity: 4,
                kg: 10,
                amount: 23
            }
        ];

        const combined = combineCleaningAndLaundryPropertySummaries(cleaningByProperty, laundryByProperty);

        assert.equal(combined.length, 2);
        assert.equal(combined[0].label, "Acqua Beach");
        assert.equal(combined[0].cleaningsNetToAh, 420);
        assert.equal(combined[0].laundryAmount, 46);
        assert.equal(combined[0].finalNetEarnings, 374); // 420 - 46

        assert.equal(combined[1].label, "Calas");
        assert.equal(combined[1].cleaningsNetToAh, 210);
        assert.equal(combined[1].laundryAmount, 23);
        assert.equal(combined[1].finalNetEarnings, 187); // 210 - 23
    });
});
