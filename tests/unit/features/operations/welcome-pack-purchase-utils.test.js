import { describe, test, assert } from "../../../test-harness.js";
import {
    calculatePurchaseLine,
    calculateWeightedAverageCost,
    matchPurchaseLinesToMaterials,
    parseWelcomePackInvoiceText,
    summarizePurchase
} from "../../../../js/features/operations/welcome-pack-purchase-utils.js";

describe("Welcome Pack purchase utilities", () => {
    test("calculates bulk stock and discounted unit cost", () => {
        const line = calculatePurchaseLine({
            name: "Broas",
            purchaseQuantity: 200,
            unitsPerPurchaseUnit: 1,
            unitPrice: 1.2,
            discountPercent: 3,
            vatRate: 22,
            priceMode: "net"
        });

        assert.equal(line.stockQuantity, 200);
        assert.equal(line.inventoryCostTotal, 232.8);
        assert.equal(line.unitCost, 1.164);
        assert.equal(line.lineGross, 284.02);
    });

    test("keeps returnable deposits outside inventory cost", () => {
        const purchase = summarizePurchase({
            lines: [{
                name: "Water",
                purchaseQuantity: 120,
                unitsPerPurchaseUnit: 1,
                unitPrice: 0.504,
                priceMode: "gross",
                vatRate: 12,
                recoverableDeposit: 12
            }]
        });

        assert.equal(purchase.totals.inventoryCostNet, 54);
        assert.equal(purchase.totals.vat, 6.48);
        assert.equal(purchase.totals.deposits, 12);
        assert.equal(purchase.totals.gross, 72.48);
        assert.equal(purchase.lines[0].unitCost, 0.45);
    });

    test("calculates a weighted average cost when stock is replenished", () => {
        assert.equal(calculateWeightedAverageCost({
            currentQuantity: 10,
            currentUnitCost: 1,
            addedQuantity: 20,
            addedUnitCost: 1.3
        }), 1.2);
    });

    test("parses Continente weighted fruit lines and card credit", () => {
        const purchase = parseWelcomePackInvoiceText(`
            CONTINENTE
            Nro:FS BGM208/134157 21/08/2026 09:38
            (A) BANANA REGIONAL KG
            3,125 X 1,99 6,22
            (A) MACA FUJI
            1,125 X 2,29 2,58
            SUBTOTAL 8,80
            Desconto Cartao Utilizado 2,76
            TOTAL A PAGAR 6,04
        `);

        assert.equal(purchase.supplier, "Continente");
        assert.equal(purchase.invoiceNumber, "FS BGM208/134157");
        assert.equal(purchase.date, "2026-08-21");
        assert.equal(purchase.cardCredit, 2.76);
        assert.equal(purchase.cashPaid, 6.04);
        assert.equal(purchase.lines.length, 2);
        assert.equal(purchase.lines[0].stockQuantity, 3.125);
        assert.equal(purchase.lines[0].stockUnit, "kg");
        assert.equal(purchase.lines[0].vatRate, 4);
    });

    test("parses a discounted Chabom bulk line", () => {
        const purchase = parseWelcomePackInvoiceText(`
            Chábom, Lda.
            Fatura FT FA.2026/2250 Pág. 1/1
            Data 2026-06-26
            0038 BROAS DA ILHA DA MADEIRA - 200GRS 17526A038 200,0000 UN 1,20000 3,00 22,00 232,80
            Total ( EUR ) 887,55
        `);

        assert.equal(purchase.importProfile, "chabom");
        assert.equal(purchase.lines.length, 1);
        assert.equal(purchase.lines[0].stockQuantity, 200);
        assert.equal(purchase.lines[0].unitCost, 1.164);
    });

    test("parses Coral deposits and Henriques IEC", () => {
        const coral = parseWelcomePackInvoiceText(`
            MISTURA GLACIAR LDA
            Fatura/Recibo
            FR 1/1837399
            Data:2026-07-17 16:17H
            ED15S 120 12% 10 60,48
            AGUA ATLANTIDA 4x1,5 LT PCK PET
            VOLTA 120 0% 0 12,00
            Total 72,48 EUR
            ATCUD: JFZVH9C8-183799
        `);
        const wine = parseWelcomePackInvoiceText(`
            HENRIQUES E HENRIQUES - VINHOS, S.A.
            Fatura FT FA.2026/356
            Data 2026-05-25
            AH4MD03001 Gfa/Bt 37,5cl AQ Medium Rich L2606826E 151,00 UN 3,460 15,00 24,89 22,00 444,09
            AH4MD03001 Gfa/Bt 37,5cl AQ Medium Rich L2610526B 233,00 UN 3,460 15,00 38,41 22,00 685,25
            IEC/Outras Contribuições 63,30
            Total ( EUR ) 1.455,02
        `);

        assert.equal(coral.invoiceNumber, "FR 1/183799");
        assert.equal(coral.lines[0].recoverableDeposit, 12);
        assert.equal(wine.lines[0].stockQuantity, 384);
        assert.equal(wine.lines[0].extraCostNet, 63.3);
        assert.equal(wine.lines[0].unitCost, 3.1058);
        assert.equal(wine.cashPaid, 1455.02);
    });

    test("matches imported lines to existing materials", () => {
        const [line] = matchPurchaseLinesToMaterials([
            { name: "Água Atlântida", stockUnit: "unit" }
        ], [
            { id: "water-1", name: "Agua Atlantida", stockUnit: "bottle" }
        ]);

        assert.equal(line.materialId, "water-1");
        assert.equal(line.stockUnit, "bottle");
    });
});
