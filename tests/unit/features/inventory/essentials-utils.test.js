import { describe, test, assert } from "../../../test-harness.js";
import {
    buildEssentialsList,
    calculateRule,
    DEFAULT_ESSENTIALS_TEMPLATE,
    sanitizeFilename,
    validateEssentialsTemplate
} from "../../../../js/features/inventory/essentials-utils.js";

describe("essentials-utils", () => {
    test("builds bedding sections for standard and custom bed sizes", () => {
        const list = buildEssentialsList({
            listName: "Ocean View",
            guests: 4,
            bathrooms: 1,
            bedrooms: 2,
            language: "en",
            beds: [
                { optionId: "queen-160", type: "queen", size: "160x200cm" },
                { optionId: "custom", type: "custom", size: "135x190cm", customSize: "135x190cm" }
            ]
        }, DEFAULT_ESSENTIALS_TEMPLATE);

        const categories = [...new Set(list.rows.map((row) => row.category))];
        assert.includes(categories, "Bedding - 160x200cm");
        assert.includes(categories, "Bedding - 135x190cm");
        assert.ok(list.rows.find((row) => row.category === "Bedding - 160x200cm" && row.item === "Fitted Sheets" && row.ahQuantity === "3"));
    });

    test("calculates guest, bathroom and conditional pool quantities", () => {
        const withPool = buildEssentialsList({
            guests: 4,
            bathrooms: 2,
            hasPool: true,
            beds: []
        });
        const withoutPool = buildEssentialsList({
            guests: 4,
            bathrooms: 2,
            hasPool: false,
            beds: []
        });

        assert.equal(withPool.rows.find((row) => row.item === "Bath Towel").ahQuantity, "12");
        assert.equal(withPool.rows.find((row) => row.item === "Bath Mat").ahQuantity, "6");
        assert.equal(withPool.rows.find((row) => row.item === "Pool Towel").ahQuantity, "12");
        assert.equal(withoutPool.rows.find((row) => row.item === "Pool Towel").ahQuantity, "-");
    });

    test("supports Portuguese labels", () => {
        const list = buildEssentialsList({
            language: "pt",
            guests: 2,
            bathrooms: 1,
            beds: [{ optionId: "single-90", type: "single", size: "90x200cm" }]
        });

        assert.includes(list.rows.map((row) => row.category), "Cama - 90x200cm");
        assert.ok(list.rows.find((row) => row.item === "Toalha de banho"));
    });

    test("validates editable templates", () => {
        assert.deepEqual(validateEssentialsTemplate(DEFAULT_ESSENTIALS_TEMPLATE), []);
        assert.ok(validateEssentialsTemplate({ categories: [] }).length > 0);
    });

    test("calculates text rules and sanitizes filenames", () => {
        assert.equal(calculateRule({ type: "text", value: "1 per room", valuePt: "1 por quarto" }, {}, {}, "pt"), "1 por quarto");
        assert.equal(sanitizeFilename("Essentials: A/B* C"), "Essentials- A-B- C");
    });
});

