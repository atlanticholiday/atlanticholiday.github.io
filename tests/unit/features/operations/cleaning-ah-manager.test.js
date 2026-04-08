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

  test("builds a batch laundry preview with the shared default kg rate", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    manager.laundryBatchDraft = {
      date: "2026-04-07",
      laundryRatePerKg: "",
      rows: [
        manager.createLaundryBatchRow({ propertyName: "Acqua Beach", kg: "5", notes: "" }),
        manager.createLaundryBatchRow({ propertyName: "", kg: "2", notes: "" })
      ]
    };

    const preview = manager.getLaundryBatchPreview();

    assert.equal(preview.count, 1);
    assert.equal(preview.kg, 5);
    assert.equal(preview.amount, 13);

    resetDom();
  });

  test("suggests the latest guest amount per property and reuses it in cleaning batch preview", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    manager.cleaningRecords = [
      {
        id: "cleaning-latest",
        date: "2026-04-06",
        propertyName: "Acqua Beach",
        guestAmount: 150
      },
      {
        id: "cleaning-older",
        date: "2026-04-03",
        propertyName: "Acqua Beach",
        guestAmount: 120
      },
      {
        id: "cleaning-other",
        date: "2026-04-05",
        propertyName: "Villa Mar",
        guestAmount: 200
      }
    ];
    manager.cleaningBatchDraft = {
      date: "2026-04-07",
      category: "Limpeza check-out",
      reservationSource: "platform",
      rows: [
        manager.createCleaningBatchRow({ propertyName: "Acqua Beach", guestAmount: "", notes: "" }),
        manager.createCleaningBatchRow({ propertyName: "", guestAmount: "80", notes: "" })
      ]
    };

    const suggestedAmount = manager.getSuggestedCleaningGuestAmount("Acqua Beach");
    const fallbackAmount = manager.getSuggestedCleaningGuestAmount("Acqua Beach", { excludeRecordId: "cleaning-latest" });
    const fieldState = manager.getCleaningGuestAmountFieldState({ propertyName: "Acqua Beach", guestAmount: "" });
    const preview = manager.getCleaningBatchPreview();

    assert.equal(suggestedAmount, 150);
    assert.equal(fallbackAmount, 120);
    assert.equal(fieldState.inputValue, "150");
    assert.equal(fieldState.suggestedInputValue, "150");
    assert.equal(preview.count, 1);
    assert.equal(preview.guestAmount, 150);
    assert.equal(preview.totalToAh, 99.7);

    resetDom();
  });

  test("renders reservation source controls in cleaning forms and stored rows", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          actions: {
            addLaundry: "Add laundry"
          },
          forms: {
            date: "Date",
            property: "Property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          tables: {
            date: "Date",
            property: "Property",
            category: "Category",
            reservation: "Reservation",
            guest: "Guest",
            laundry: "Laundry",
            net: "Net",
            actions: "Actions"
          },
          laundryState: {
            waiting: "Waiting for laundry"
          }
        },
        common: {
          notes: "Notes",
          edit: "Edit",
          delete: "Delete"
        }
      }
    };
    i18n.currentLang = "en";
    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      category: "Limpeza check-out",
      reservationSource: "platform",
      guestAmount: "150",
      notes: ""
    };

    const formHtml = manager.renderCleaningSingleForm({
      draft: manager.cleaningDraft,
      preview: {
        reservationSource: "platform",
        platformCommission: 23.25,
        vatAmount: 27.05,
        totalToAhWithoutLaundry: 99.7
      },
      guestAmountField: manager.getCleaningGuestAmountFieldState(manager.cleaningDraft, {
        enableSuggestion: false
      })
    });
    manager.cleaningBatchDraft = {
      date: "2026-04-07",
      category: "Limpeza check-out",
      reservationSource: "direct",
      rows: [
        manager.createCleaningBatchRow({ propertyName: "Acqua Beach", guestAmount: "150", notes: "" })
      ]
    };
    const batchHtml = manager.renderCleaningBatchForm(manager.getCleaningBatchPreview());

    const tableHtml = manager.renderCleaningsTable([
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        category: "Limpeza check-out",
        reservationSource: "direct",
        guestAmount: 150,
        laundryAmount: 0,
        effectiveLaundryAmount: 0,
        totalToAh: 99.7,
        notes: "",
        source: "manual"
      }
    ]);

    assert.includes(formHtml, 'name="reservationSource"');
    assert.includes(batchHtml, 'name="reservationSource"');
    assert.includes(tableHtml, "Reservation");
    assert.includes(tableHtml, "Direct");
    assert.includes(tableHtml, 'aria-label="Add laundry"');
    assert.includes(tableHtml, 'aria-label="Edit"');
    assert.includes(tableHtml, 'aria-label="Delete"');
    assert.includes(tableHtml, 'fas fa-plus');
    assert.includes(tableHtml, 'fas fa-pen');
    assert.includes(tableHtml, 'fas fa-trash');

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;

    resetDom();
  });

  test("renders quick linked-laundry controls in the cleanings register", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          cleanings: {
            quickLaundryHint: "This saves a linked laundry row for this cleaning and it also appears in the Laundry tab."
          },
          forms: {
            date: "Date",
            kg: "Kg",
            ratePerKg: "Rate / kg",
            notesPlaceholder: "Optional note"
          },
          actions: {
            addLaundry: "Add laundry",
            addMoreLaundry: "Add more laundry",
            saveLaundry: "Save laundry"
          },
          tables: {
            date: "Date",
            property: "Property",
            category: "Category",
            reservation: "Reservation",
            guest: "Guest",
            laundry: "Laundry",
            net: "Net",
            actions: "Actions"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          laundryState: {
            waiting: "Waiting for laundry"
          }
        },
        common: {
          cancel: "Cancel",
          notes: "Notes",
          edit: "Edit",
          delete: "Delete"
        }
      }
    };
    i18n.currentLang = "en";

    manager.openCleaningLaundryEntryId = "cleaning-1";
    manager.cleaningLaundryQuickDrafts["cleaning-1"] = manager.createCleaningQuickLaundryDraft({ id: "cleaning-1" }, {
      date: "2026-04-08",
      kg: "5",
      laundryRatePerKg: "2.6",
      notes: ""
    });

    const tableHtml = manager.renderCleaningsTable([
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        category: "Limpeza check-out",
        reservationSource: "platform",
        guestAmount: 150,
        laundryAmount: 0,
        effectiveLaundryAmount: 0,
        effectiveTotalToAh: 99.7,
        notes: "",
        source: "manual"
      }
    ]);

    assert.includes(tableHtml, 'data-action="toggle-cleaning-laundry-entry"');
    assert.includes(tableHtml, 'data-cleaning-laundry-entry="cleaning-1"');
    assert.includes(tableHtml, 'data-action="save-cleaning-laundry"');
    assert.includes(tableHtml, 'name="laundryRatePerKg"');
    assert.includes(tableHtml, 'aria-label="Cancel"');
    assert.includes(tableHtml, 'fas fa-xmark');
    assert.includes(tableHtml, "This saves a linked laundry row for this cleaning and it also appears in the Laundry tab.");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders quick link controls for standalone laundry rows in the register", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        common: {
          cancel: "Cancel",
          edit: "Edit",
          delete: "Delete"
        },
        cleaningAh: {
          actions: {
            linkCleaning: "Link cleaning",
            changeLink: "Change link",
            saveLink: "Save link",
            openCleaning: "Open cleaning"
          },
          tables: {
            linkedCleaning: "Linked cleaning"
          },
          forms: {
            noLinkedCleaning: "No linked cleaning"
          }
        }
      }
    };
    i18n.currentLang = "en";
    manager.cleaningRecords = [
      {
        id: "cleaning-1",
        date: "2026-04-06",
        propertyName: "Acqua Beach",
        category: "Limpeza check-out",
        laundryAmount: 0
      }
    ];

    const collapsedHtml = manager.renderLaundryTable([
      {
        id: "laundry-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        linkedCleaningId: "",
        linkedCleaningDate: "",
        linkedCleaningCategory: "",
        kg: 5,
        laundryRatePerKg: 2.6,
        amount: 13,
        notes: "",
        source: "standalone"
      }
    ]);
    manager.openLaundryLinkEditorId = "laundry-1";
    const standaloneHtml = manager.renderLaundryTable([
      {
        id: "laundry-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        linkedCleaningId: "",
        linkedCleaningDate: "",
        linkedCleaningCategory: "",
        kg: 5,
        laundryRatePerKg: 2.6,
        amount: 13,
        notes: "",
        source: "standalone"
      }
    ]);
    const cleaningHtml = manager.renderLaundryTable([
      {
        id: "cleaning-embedded",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        linkedCleaningId: "cleaning-1",
        linkedCleaningDate: "2026-04-06",
        linkedCleaningCategory: "Limpeza check-out",
        kg: 5,
        laundryRatePerKg: 2.6,
        amount: 13,
        notes: "",
        source: "cleaning"
      }
    ]);

    assert.includes(collapsedHtml, 'data-action="toggle-laundry-link-editor"');
    assert.includes(collapsedHtml, 'aria-label="Edit"');
    assert.includes(collapsedHtml, 'aria-label="Delete"');
    assert.includes(collapsedHtml, 'fas fa-pen');
    assert.includes(collapsedHtml, 'fas fa-trash');
    assert.includes(standaloneHtml, 'data-action="save-laundry-link"');
    assert.includes(standaloneHtml, 'data-laundry-link-select');
    assert.includes(cleaningHtml, 'aria-label="Open cleaning"');
    assert.includes(cleaningHtml, 'fa-arrow-up-right-from-square');
    assert.equal(cleaningHtml.includes('data-action="save-laundry-link"'), false);

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders cleaning register controls and applies cleaning register filters", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          cleanings: {
            registerFilterLabel: "Show",
            registerSortLabel: "Order by",
            storedKicker: "Stored data",
            storedTitle: "Cleanings",
            storedDescription: "Use Show and Order by to focus on rows that already have laundry linked or are still waiting on laundry.",
            empty: "No cleaning records match the current filters.",
            registerFilters: {
              all: "All rows",
              withLaundry: "With laundry",
              waitingLaundry: "Waiting on laundry"
            },
            registerSortOptions: {
              dateDesc: "Newest first",
              dateAsc: "Oldest first",
              propertyAsc: "Property A-Z",
              propertyDesc: "Property Z-A",
              guestDesc: "Highest guest amount",
              guestAsc: "Lowest guest amount",
              netDesc: "Highest net",
              netAsc: "Lowest net"
            }
          }
        }
      }
    };
    i18n.currentLang = "en";
    manager.cleaningRegisterFilter = "waiting-laundry";
    manager.cleaningRegisterSort = "property-asc";

    const visibleEntries = manager.getVisibleCleaningRegisterEntries([
      {
        id: "cleaning-with-laundry",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        effectiveLaundryAmount: 13,
        effectiveTotalToAh: 86.7
      },
      {
        id: "cleaning-waiting",
        date: "2026-04-06",
        propertyName: "Bravo",
        effectiveLaundryAmount: 0,
        effectiveTotalToAh: 99.7
      }
    ]);
    const controlsHtml = manager.renderCleaningRegisterControls();
    const tabHtml = manager.renderCleaningsTab(visibleEntries);

    assert.equal(visibleEntries.length, 1);
    assert.equal(visibleEntries[0].id, "cleaning-waiting");
    assert.includes(controlsHtml, 'id="cleaning-ah-cleaning-register-filter"');
    assert.includes(controlsHtml, 'id="cleaning-ah-cleaning-register-sort"');
    assert.includes(controlsHtml, "Waiting on laundry");
    assert.includes(tabHtml, "Use Show and Order by to focus on rows that already have laundry linked or are still waiting on laundry.");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });
});
