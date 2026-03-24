import { describe, test, assert } from "../../test-harness.js";
import { i18n } from "../../../js/core/i18n.js";
import { createStorageMock, installGlobalProperty, installNavigatorLanguage, resetDom } from "../../test-utils.js";

describe("i18n", () => {
  test("reads nested keys and falls back to the fallback language", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    const previousFallback = i18n.fallbackLang;

    i18n.translations = {
      en: { schedule: { title: "Schedule" }, greeting: "Hello {{name}}" },
      pt: {}
    };
    i18n.currentLang = "pt";
    i18n.fallbackLang = "en";

    assert.equal(i18n.t("schedule.title"), "Schedule");
    assert.equal(i18n.t("greeting", { name: "Lucas" }), "Hello Lucas");
    assert.equal(i18n.t("missing.key"), "missing.key");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    i18n.fallbackLang = previousFallback;
  });

  test("updates matching DOM elements and translated attributes", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    resetDom(`
      <div id="label" data-i18n="schedule.title"></div>
      <input id="search" placeholder="placeholder" data-i18n="search.placeholder">
      <button id="cta" data-i18n="cta.copy" data-i18n-attr="aria-label"></button>
      <div id="tip" data-i18n-title="tooltip.text"></div>
    `);

    i18n.translations = {
      en: {
        schedule: { title: "Weekly schedule" },
        search: { placeholder: "Search reservations" },
        cta: { copy: "Copy breakdown" },
        tooltip: { text: "Helpful tip" }
      }
    };
    i18n.currentLang = "en";

    i18n.updateUI();

    assert.equal(document.getElementById("label").textContent, "Weekly schedule");
    assert.equal(document.getElementById("search").placeholder, "Search reservations");
    assert.equal(document.getElementById("cta").getAttribute("aria-label"), "Copy breakdown");
    assert.equal(document.getElementById("tip").title, "Helpful tip");
    assert.equal(document.documentElement.lang, "en");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("initializes from localStorage and browser language using mocked fetch", async () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    const previousInitialized = i18n.initialized;
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock({ "atlantic-holiday-lang": "pt" }));
    const restoreLanguage = installNavigatorLanguage("en-US");
    const restoreFetch = installGlobalProperty("fetch", async (url) => {
      if (url === "locales/pt.json") {
        return {
          ok: true,
          async json() {
            return { nav: { title: "Agenda" } };
          }
        };
      }

      if (url === "locales/en.json") {
        return {
          ok: true,
          async json() {
            return { nav: { title: "Schedule" } };
          }
        };
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    });

    resetDom(`
      <button id="lang-en" data-lang-option="en"></button>
      <button id="lang-pt" data-lang-option="pt"></button>
      <button id="landing-lang-en" data-lang-option="en"></button>
      <button id="landing-lang-pt" data-lang-option="pt"></button>
      <div data-i18n="nav.title"></div>
    `);

    i18n.translations = {};
    i18n.currentLang = "en";
    i18n.initialized = false;

    await i18n.init();

    assert.equal(i18n.getCurrentLanguage(), "pt");
    assert.equal(document.querySelector("[data-i18n]").textContent, "Agenda");
    assert.ok(document.getElementById("lang-pt").classList.contains("active"), "Portuguese switcher should be active");
    assert.ok(document.getElementById("landing-lang-pt").classList.contains("active"), "Secondary Portuguese switcher should be active");
    assert.equal(document.getElementById("lang-pt").getAttribute("aria-pressed"), "true");
    assert.equal(document.getElementById("lang-en").getAttribute("aria-pressed"), "false");

    restoreFetch();
    restoreLanguage();
    restoreStorage();
    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    i18n.initialized = previousInitialized;
    resetDom();
  });

  test("setLanguage persists and dispatches a language change event", async () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    const restoreStorage = installGlobalProperty("localStorage", createStorageMock());

    resetDom(`
      <button id="lang-en" data-lang-option="en"></button>
      <button id="lang-pt" data-lang-option="pt"></button>
      <button id="time-clock-lang-en" data-lang-option="en"></button>
      <button id="time-clock-lang-pt" data-lang-option="pt"></button>
      <div data-i18n="nav.title"></div>
    `);

    i18n.translations = {
      en: { nav: { title: "Schedule" } },
      pt: { nav: { title: "Agenda" } }
    };
    i18n.currentLang = "en";

    let eventLanguage = null;
    const handler = (event) => {
      eventLanguage = event.detail.lang;
    };

    window.addEventListener("languageChanged", handler, { once: true });
    await i18n.setLanguage("pt");

    assert.equal(localStorage.getItem("atlantic-holiday-lang"), "pt");
    assert.equal(document.querySelector("[data-i18n]").textContent, "Agenda");
    assert.equal(eventLanguage, "pt");
    assert.ok(document.getElementById("time-clock-lang-pt").classList.contains("active"));
    assert.equal(document.documentElement.lang, "pt");

    restoreStorage();
    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });
});
