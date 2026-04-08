import { describe, test, assert } from "../../../test-harness.js";
import { createStorageMock, resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
import { BuildPlannerManager } from "../../../../js/features/planning/build-planner-manager.js";

describe("BuildPlannerManager", () => {
  test("renders roadmap content, persists status, and copies prompts", async () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    const originalClipboard = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
    const copiedValues = [];

    i18n.translations = {
      en: {
        common: {
          back: "Back",
          signOut: "Sign Out"
        }
      }
    };
    i18n.currentLang = "en";

    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        async writeText(value) {
          copiedValues.push(value);
        }
      }
    });

    try {
      resetDom(`
        <div id="build-planner-card-title"></div>
        <div id="build-planner-card-description"></div>
        <div id="build-planner-header-kicker"></div>
        <div id="build-planner-page-title"></div>
        <div id="build-planner-page-subtitle"></div>
        <div id="build-planner-back-label"></div>
        <div id="build-planner-sign-out-label"></div>
        <div id="build-planner-root"></div>
      `);

      const storage = createStorageMock();
      const manager = new BuildPlannerManager({
        documentRef: document,
        windowRef: window,
        storageRef: storage
      });

      manager.init();

      assert.equal(document.getElementById("build-planner-card-title").textContent, "Build Planner");
      assert.includes(document.getElementById("build-planner-root").textContent, "PMS Sync Layer");

      const firstStatus = document.querySelector('[data-item-status="pms-sync"]');
      firstStatus.value = "ready";
      firstStatus.dispatchEvent(new Event("change", { bubbles: true }));

      assert.equal(JSON.parse(storage.getItem("build-planner-statuses"))["pms-sync"], "ready");

      const copyButton = document.querySelector('[data-copy-prompt="plan"][data-item-id="pms-sync"]');
      copyButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      assert.includes(copiedValues[0], "PMS Sync Layer");
      assert.equal(document.getElementById("build-planner-feedback").textContent, "Planning prompt copied.");
    } finally {
      i18n.translations = previousTranslations;
      i18n.currentLang = previousLang;
      if (originalClipboard) {
        Object.defineProperty(window.navigator, "clipboard", originalClipboard);
      } else {
        delete window.navigator.clipboard;
      }
      resetDom();
    }
  });

  test("renders roadmap item content in Portuguese", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    i18n.translations = {
      pt: {
        common: {
          back: "Voltar",
          signOut: "Sair"
        }
      }
    };
    i18n.currentLang = "pt";

    try {
      resetDom(`
        <div id="build-planner-card-title"></div>
        <div id="build-planner-card-description"></div>
        <div id="build-planner-header-kicker"></div>
        <div id="build-planner-page-title"></div>
        <div id="build-planner-page-subtitle"></div>
        <div id="build-planner-back-label"></div>
        <div id="build-planner-sign-out-label"></div>
        <div id="build-planner-root"></div>
      `);

      const manager = new BuildPlannerManager({
        documentRef: document,
        windowRef: window,
        storageRef: createStorageMock()
      });

      manager.init();

      const rootText = document.getElementById("build-planner-root").textContent;
      assert.includes(rootText, "Camada de Sincronizacao PMS");
      assert.includes(rootText, "Motor de Tarefas por Reserva");
      assert.includes(rootText, "Como usar esta pagina");
    } finally {
      i18n.translations = previousTranslations;
      i18n.currentLang = previousLang;
      resetDom();
    }
  });
});
