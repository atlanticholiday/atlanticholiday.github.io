import { describe, test, assert } from "../../../test-harness.js";
import {
  OPERATIONAL_GUIDELINE_SECTIONS,
  localizeOperationalGuidelineSections
} from "../../../../js/features/operations/operational-guidelines-data.js";
import {
  buildOperationalGuidelineSections,
  getOperationalGuidelineItems,
  normalizeGuidelineText,
  searchOperationalGuidelines,
  tokenizeGuidelineQuery
} from "../../../../js/features/operations/operational-guidelines-utils.js";

describe("operational guidelines utils", () => {
  test("flattens the manual into protocol records", () => {
    const items = getOperationalGuidelineItems();

    assert.equal(items.length, 34, "manual should expose the 33 numbered protocols plus emergency guidance");
    assert.equal(OPERATIONAL_GUIDELINE_SECTIONS.length, 6, "manual should keep the source section grouping");
    assert.ok(items.every((item) => item.sectionId && item.sectionTitle), "items should retain section context");
  });

  test("normalizes accents and punctuation for search", () => {
    assert.equal(normalizeGuidelineText("Água quente / Wi-Fi!"), "agua quente wi fi");
    assert.deepEqual(tokenizeGuidelineQuery("O hóspede sem luz"), ["hospede", "sem", "luz", "energia"]);
  });

  test("finds the right protocol from natural operational wording", () => {
    assert.equal(searchOperationalGuidelines("guest says wifi is slow")[0]?.id, "wifi-slow");
    assert.equal(searchOperationalGuidelines("a placa tem cadeado e nao liga")[0]?.id, "induction-locked");
    assert.equal(searchOperationalGuidelines("querem late checkout depois das 10")[0]?.id, "late-checkout");
    assert.equal(searchOperationalGuidelines("há um carro no nosso estacionamento")[0]?.id, "parking-occupied");
  });

  test("searches the English version of built-in protocols", () => {
    const sections = localizeOperationalGuidelineSections(OPERATIONAL_GUIDELINE_SECTIONS, "en");

    assert.equal(searchOperationalGuidelines("guest says the hob has a lock", { sections })[0]?.id, "induction-locked");
    assert.equal(searchOperationalGuidelines("they want more toilet paper", { sections })[0]?.id, "extra-consumables");
    assert.equal(searchOperationalGuidelines("parking space is occupied", { sections })[0]?.id, "parking-occupied");
  });

  test("returns all protocols when query is empty", () => {
    const items = getOperationalGuidelineItems();
    const results = searchOperationalGuidelines("");

    assert.equal(results.length, items.length);
    assert.equal(results[0].score, 0);
  });

  test("merges edited and added protocols into searchable sections", () => {
    const sections = buildOperationalGuidelineSections({
      protocols: [
        {
          id: "wifi-slow",
          number: 1,
          sectionId: "technical",
          sectionTitle: "Resolução de Problemas Técnicos",
          title: "Internet não funciona",
          action: "Pedir fotografia do router.",
          response: "Olá [Nome]. Envie-nos uma fotografia do router, por favor.",
          keywords: ["router", "fotografia"],
          isEdited: true
        },
        {
          id: "custom-test",
          number: "C1",
          sectionId: "custom",
          sectionTitle: "Protocolos personalizados",
          title: "Teste personalizado",
          action: "Confirmar contexto.",
          response: "Olá [Nome]. Vamos confirmar com a nossa equipa.",
          keywords: ["personalizado"],
          isCustom: true
        }
      ],
      deletedIds: ["tv-no-signal"]
    });

    const items = getOperationalGuidelineItems(sections);

    assert.equal(items.find((item) => item.id === "wifi-slow")?.title, "Internet não funciona");
    assert.equal(items.some((item) => item.id === "tv-no-signal"), false);
    assert.equal(searchOperationalGuidelines("personalizado", { sections })[0]?.id, "custom-test");
  });
});
