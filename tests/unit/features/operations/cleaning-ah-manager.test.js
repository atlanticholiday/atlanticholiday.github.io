import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
import { CleaningAhManager } from "../../../../js/features/operations/cleaning-ah-manager.js";

describe("CleaningAhManager", () => {
  test("updates scaffold copy and locale-aware formatting when the language changes", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    i18n.translations = {
      en: {
        common: {
          back: "Back",
          signOut: "Sign Out"
        },
        cleaningAh: {
          header: {
            kicker: "Finance",
            title: "Cleaning AH",
            subtitle: "Track checkout revenue."
          },
          landing: {
            description: "Checkout revenue, laundry, and stats."
          }
        }
      },
      pt: {
        common: {
          back: "Voltar",
          signOut: "Sair"
        },
        cleaningAh: {
          header: {
            kicker: "Financeiro",
            title: "Cleaning AH",
            subtitle: "Acompanhe a receita de check-out."
          },
          landing: {
            description: "Receita de check-out, lavandaria e estatisticas."
          }
        }
      }
    };
    i18n.currentLang = "en";

    resetDom(`
      <div id="landing-page"></div>
      <div id="other-tools-grid"></div>
    `);

    const manager = new CleaningAhManager(null);
    manager.ensureDomScaffold();

    assert.equal(document.getElementById("cleaning-ah-back-label").textContent, "Back");
    assert.equal(document.getElementById("cleaning-ah-sign-out-btn").textContent, "Sign Out");
    assert.equal(document.getElementById("cleaning-ah-card-description").textContent, "Checkout revenue, laundry, and stats.");
    assert.equal(document.querySelector('[data-lang-option="en"]').getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector('[data-lang-option="pt"]').getAttribute("aria-pressed"), "false");
    assert.equal(manager.formatMonthKey("2026-04"), "April 2026");

    manager.render = () => {};
    i18n.currentLang = "pt";
    window.dispatchEvent(new CustomEvent("languageChanged"));

    assert.equal(document.getElementById("cleaning-ah-back-label").textContent, "Voltar");
    assert.equal(document.getElementById("cleaning-ah-sign-out-btn").textContent, "Sair");
    assert.equal(document.getElementById("cleaning-ah-card-description").textContent, "Receita de check-out, lavandaria e estatisticas.");
    assert.equal(document.querySelector('[data-lang-option="en"]').getAttribute("aria-pressed"), "false");
    assert.equal(document.querySelector('[data-lang-option="pt"]').getAttribute("aria-pressed"), "true");
    assert.match(manager.formatMonthKey("2026-04"), /abril/i);

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });
});
