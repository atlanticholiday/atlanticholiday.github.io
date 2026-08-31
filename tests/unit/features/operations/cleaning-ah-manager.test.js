import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { i18n } from "../../../../js/core/i18n.js";
import { CleaningAhManager } from "../../../../js/features/operations/cleaning-ah-manager.js";
import { CLEANING_AH_CATEGORY_KEYS } from "../../../../js/features/operations/cleaning-ah-utils.js";

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
    assert.equal(preview.amount, 11.5);

    resetDom();
  });

  test("limits property filter options to names that have entries", () => {
    resetDom();

    const manager = new CleaningAhManager(null, {
      getProperties: () => [
        { name: "Acqua Beach" },
        { name: "No Entries Villa" }
      ]
    });
    manager.cleaningRecords = [
      {
        id: "cleaning-1",
        date: "2026-04-07",
        monthKey: "2026-04",
        propertyName: "Acqua Beach",
        category: "Limpeza check-out"
      }
    ];
    manager.laundryRecords = [];

    const propertyNames = manager.getFilterPropertyNames();

    assert.deepEqual(propertyNames, ["Acqua Beach"]);

    resetDom();
  });

  test("renders the special cleanings tab and register labels", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    i18n.translations = {
      en: {
        common: {
          notes: "Notes",
          edit: "Edit",
          delete: "Delete"
        },
        cleaningAh: {
          tabs: {
            stats: "Stats",
            cleanings: "Cleanings",
            laundry: "Laundry",
            specialCleanings: "Special cleanings",
            ariaLabel: "Cleaning AH tabs"
          },
          specialCleanings: {
            entryKicker: "Special cleaning tracker",
            addTitle: "Add special cleaning",
            editTitle: "Edit special cleaning",
            description: "Track one-off work.",
            registerKicker: "Stored data",
            registerTitle: "Special cleanings",
            registerDescription: "Simple history.",
            empty: "No special cleaning records match the current filters.",
            typeLabel: "Type",
            costLabel: "Cost",
            costHint: "Enter the supplier cost without VAT.",
            descriptionLabel: "Description",
            descriptionPlaceholder: "Optional description",
            types: {
              sofa: "Sofa",
              mattress: "Mattress",
              other: "Other"
            }
          },
          forms: {
            date: "Date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            notesPlaceholder: "Optional note"
          },
          actions: {
            cancelEdit: "Cancel edit",
            saveChanges: "Save changes",
            saveSpecialCleaning: "Save special cleaning",
            reset: "Reset"
          },
          tables: {
            date: "Date",
            property: "Property",
            actions: "Actions"
          },
          counts: {
            rows: {
              one: "1 row",
              other: "{{count}} rows"
            }
          }
        }
      }
    };
    i18n.currentLang = "en";

    const manager = new CleaningAhManager(null);
    manager.specialCleaningDraft = manager.createDefaultSpecialCleaningDraft();

    const tabMarkup = manager.renderTabBar();
    const specialMarkup = manager.renderSpecialCleaningsTab([
      {
        id: "special-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        specialType: "mattress",
        cost: 45,
        description: "Main bedroom",
        notes: "Needs follow-up"
      }
    ]);

    assert.match(tabMarkup, /Special cleanings/);
    assert.match(specialMarkup, /Add special cleaning/);
    assert.match(specialMarkup, /Mattress/);
    assert.match(specialMarkup, /Cost/);
    assert.match(specialMarkup, /without VAT/);
    assert.match(specialMarkup, /Main bedroom/);
    assert.match(specialMarkup, /Needs follow-up/);

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders a Monday-first cleaning calendar week", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          tabs: {
            register: "To register",
            calendar: "Calendar",
            stats: "Stats",
            cleanings: "Cleanings",
            laundry: "Laundry",
            specialCleanings: "Special cleanings",
            ariaLabel: "Cleaning AH tabs"
          },
          calendar: {
            kicker: "Calendar",
            today: "Today",
            previous: "Previous",
            next: "Next",
            emptyDay: "No cleanings",
            addCleaning: "Add cleaning",
            modalKicker: "Calendar cleaning",
            addTitle: "Add cleaning",
            editTitle: "Edit cleaning"
          },
          categories: {
            checkout: { label: "Check-out" }
          },
          labels: {
            unknown: "Unknown"
          },
          laundryState: {
            waiting: "Waiting for laundry",
            added: "Laundry added",
            none: "No laundry",
            needsCorrection: "Needs correction"
          },
          counts: {
            rows: {
              one: "1 row",
              other: "{{count}} rows"
            }
          }
        }
      }
    };
    i18n.currentLang = "en";
    manager.calendarDate = "2026-07-08";

    const days = manager.getCalendarWeekDays();
    const html = manager.renderCalendarTab([
      {
        id: "cleaning-1",
        date: "2026-07-06",
        propertyName: "Tropical Pearl",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
        laundryAmount: 0,
        effectiveLaundryAmount: 0
      },
      {
        id: "cleaning-2",
        date: "2026-07-08",
        propertyName: "Ocean Refuge",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
        laundryAmount: 11.5,
        effectiveLaundryAmount: 11.5
      }
    ]);
    const tabHtml = manager.renderTabBar();

    assert.equal(days[0].date, "2026-07-06");
    assert.equal(days[6].date, "2026-07-12");
    assert.includes(tabHtml, "Calendar");
    assert.includes(html, "Jul 6, 2026");
    assert.includes(html, "Jul 12, 2026");
    manager.activeTab = "calendar";
    const activeTabHtml = manager.renderActiveTab([], [
      { id: "cleaning-1", date: "2026-07-06", propertyName: "Tropical Pearl", guestAmount: 100 }
    ]);
    assert.includes(activeTabHtml, "Tropical Pearl");
    assert.includes(html, 'data-action="open-calendar-add-cleaning" data-date="2026-07-06"');
    assert.includes(html, 'data-action="open-calendar-edit-cleaning" data-id="cleaning-1"');

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders calendar cleaning modal using the connected cleaning form", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        common: {
          cancel: "Cancel",
          notes: "Notes"
        },
        cleaningAh: {
          calendar: {
            modalKicker: "Calendar cleaning",
            addTitle: "Add cleaning",
            editTitle: "Edit cleaning"
          },
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Owner checkout" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            checkout: "Checkout rule"
          },
          forms: {
            cleaningDate: "Cleaning date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount",
            kg: "Kg",
            amount: "Amount",
            notesPlaceholder: "Optional note"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          preview: {
            title: "Preview"
          },
          metrics: {
            commission: "Commission",
            vat: "VAT",
            beforeLaundry: "Before laundry",
            laundry: "Laundry",
            currentNet: "Current net"
          },
          actions: {
            saveCleaning: "Save cleaning",
            saveChanges: "Save changes"
          }
        }
      }
    };
    i18n.currentLang = "en";
    manager.calendarModalMode = "add";
    manager.cleaningDraft = {
      ...manager.createDefaultCleaningDraft(),
      date: "2026-07-08",
      propertyName: "Ocean Refuge",
      guestAmount: "120"
    };

    const html = manager.renderCalendarCleaningModal();

    assert.includes(html, 'role="dialog"');
    assert.includes(html, 'id="cleaning-ah-calendar-cleaning-form"');
    assert.includes(html, 'form="cleaning-ah-calendar-cleaning-form"');
    assert.includes(html, 'value="2026-07-08"');
    assert.includes(html, 'value="Ocean Refuge"');
    assert.includes(html, "Save cleaning");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("scopes stats records to the selected cleaning category", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const records = [
      {
        id: "cleaning-1",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
      },
      {
        id: "cleaning-2",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.firstCleaning
      }
    ];

    const scopedRecords = manager.getStatsScopedCleaningRecords(records, CLEANING_AH_CATEGORY_KEYS.firstCleaning);

    assert.equal(scopedRecords.length, 1);
    assert.equal(scopedRecords[0].id, "cleaning-2");

    resetDom();
  });

  test("scopes legacy raw category labels without falling back to all stats records", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const records = [
      {
        id: "cleaning-1",
        propertyName: "Acqua Beach",
        category: "Limpeza intermédia"
      },
      {
        id: "cleaning-2",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
      }
    ];

    const scopedRecords = manager.getStatsScopedCleaningRecords(records, "Limpeza intermédia");

    assert.equal(scopedRecords.length, 1);
    assert.equal(scopedRecords[0].id, "cleaning-1");

    resetDom();
  });

  test("renders the fast registration tab with queue actions", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          tabs: {
            register: "To register",
            stats: "Stats",
            cleanings: "Cleanings",
            laundry: "Laundry",
            specialCleanings: "Special cleanings",
            ariaLabel: "Cleaning AH tabs"
          },
          register: {
            entryKicker: "Fast register",
            entryTitle: "Register today's work",
            entryDescription: "Compact form",
            queueKicker: "Today and pending",
            queueTitle: "To register",
            queueDescription: "Pending rows",
            emptyQueue: "No rows"
          },
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Check-out from property owner" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            checkout: "Checkout rule"
          },
          forms: {
            date: "Date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount",
            notesPlaceholder: "Optional note"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          tables: {
            guest: "Amount"
          },
          actions: {
            saveCleaning: "Save cleaning",
            saveAndNext: "Save and next",
            reset: "Reset"
          }
        },
        common: {
          notes: "Notes",
          edit: "Edit"
        }
      }
    };
    i18n.currentLang = "en";
    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
      reservationSource: "platform",
      guestAmount: "",
      notes: ""
    };

    const tabHtml = manager.renderTabBar();
    const registerHtml = manager.renderRegisterTab([
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
        guestAmount: 150,
        totalToAh: 99.7
      }
    ]);

    assert.includes(tabHtml, "To register");
    assert.includes(registerHtml, 'id="cleaning-ah-fast-register-form"');
    assert.includes(registerHtml, 'id="cleaning-ah-fast-property"');
    assert.includes(registerHtml, "Save and next");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("finds duplicate cleaning rows by date, property, and category", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    manager.cleaningRecords = [
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
      }
    ];

    const duplicate = manager.getDuplicateCleaningRecord({
      date: "2026-04-07",
      propertyName: "acqua beach",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
    });
    const excluded = manager.getDuplicateCleaningRecord({
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
    }, "cleaning-1");

    assert.equal(duplicate.id, "cleaning-1");
    assert.equal(excluded, null);

    resetDom();
  });

  test("renders collapsible stats help and per-category hover guidance", () => {
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;

    i18n.translations = {
      en: {
        cleaningAh: {
          metrics: {
            platformFees: "Platform fees",
            vat: "VAT",
            ahBeforeLaundry: "AH before laundry",
            avgNetPerCleaning: "Avg net / cleaning",
            avgKgPerCleaning: "Avg kg / cleaning"
          },
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Owner check-out" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            checkout: "Checkout rule",
            ownerCheckout: "Owner rule",
            firstCleaning: "First rule",
            midTerm: "Mid-term rule",
            otherCleanings: "Other rule"
          },
          stats: {
            allCleaningTypes: "All cleaning types",
            helpKicker: "How to read this tab",
            helpTitle: "Stats instructions",
            helpDescription: "Help description",
            workflowTitle: "Recommended order",
            allTypesRule: "All types rule",
            workflow: {
              step1: "Step 1",
              step2: "Step 2",
              step3: "Step 3"
            }
          }
        }
      }
    };
    i18n.currentLang = "en";

    const manager = new CleaningAhManager(null);
    manager.statsCategoryKey = CLEANING_AH_CATEGORY_KEYS.firstCleaning;

    const helpMarkup = manager.renderStatsHelpDisclosure();
    const switcherMarkup = manager.renderStatsCategorySwitcher([
      { key: "", label: "All cleaning types", count: 8 },
      { key: CLEANING_AH_CATEGORY_KEYS.checkout, label: "Check-out", count: 3 },
      { key: CLEANING_AH_CATEGORY_KEYS.ownerCheckout, label: "Owner check-out", count: 2 },
      { key: CLEANING_AH_CATEGORY_KEYS.firstCleaning, label: "First cleaning", count: 2 },
      { key: CLEANING_AH_CATEGORY_KEYS.midTerm, label: "Mid-term cleaning", count: 1 },
      { key: CLEANING_AH_CATEGORY_KEYS.otherCleanings, label: "Other cleanings", count: 1 }
    ]);

    assert.match(helpMarkup, /<details/);
    assert.match(helpMarkup, /Stats instructions/);
    assert.match(helpMarkup, /Help description/);
    assert.match(helpMarkup, /Step 1/);
    assert.match(helpMarkup, /Platform fees:/);
    assert.match(helpMarkup, /All cleaning types:/);
    assert.match(switcherMarkup, /All cleaning types/);
    assert.match(switcherMarkup, /All types rule/);
    assert.match(switcherMarkup, /Check-out/);
    assert.match(switcherMarkup, /Owner check-out/);
    assert.match(switcherMarkup, /First cleaning/);
    assert.match(switcherMarkup, /Mid-term cleaning/);
    assert.match(switcherMarkup, /Other cleanings/);
    assert.match(switcherMarkup, /First rule/);
    assert.match(switcherMarkup, /Other rule/);

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
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

  test("prefers the property guest cleaning fee over older cleaning history for checkout suggestions", () => {
    resetDom();

    const manager = new CleaningAhManager(null, {
      getProperties: () => [
        {
          id: "property-1",
          name: "Acqua Beach",
          guestCleaningFee: 175
        }
      ]
    });
    manager.cleaningRecords = [
      {
        id: "cleaning-latest",
        date: "2026-04-06",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
        guestAmount: 150
      }
    ];

    const suggestedAmount = manager.getSuggestedCleaningGuestAmount("Acqua Beach", {
      categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout
    });

    assert.equal(suggestedAmount, 175);

    resetDom();
  });
  test("renders cleaning single and batch previews", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      category: "Limpeza check-out",
      reservationSource: "platform",
      guestAmount: "150",
      notes: ""
    };
    manager.cleaningBatchDraft = {
      date: "2026-04-07",
      category: "Limpeza check-out",
      reservationSource: "platform",
      rows: [
        manager.createCleaningBatchRow({ propertyName: "Acqua Beach", guestAmount: "150", notes: "" })
      ]
    };

    const previewRecord = manager.renderCleaningSingleForm({
      draft: manager.cleaningDraft,
      preview: {
        platformCommission: 23.25,
        vatAmount: 27.05,
        totalToAhWithoutLaundry: 99.7,
        totalToAh: 99.7
      },
      guestAmountField: manager.getCleaningGuestAmountFieldState(manager.cleaningDraft, {
        enableSuggestion: false
      })
    });
    const batchPreview = manager.getCleaningBatchPreview();

    assert.includes(previewRecord, 'name="guestAmount"');
    assert.equal(batchPreview.count, 1);
    assert.equal(batchPreview.totalToAh, 99.7);

    resetDom();
  });

  test("uses saved-amount rules for mid-term cleaning forms", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Check-out from property owner" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            midTerm: "Mid-term cleanings use the amount field as saved cleaning-company cost.",
            otherCleanings: "Other cleanings use the charged amount field."
          },
          forms: {
            date: "Date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount",
            chargedAmount: "Charged amount",
            savedAmount: "Saved amount",
            notesPlaceholder: "Optional note"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          preview: {
            title: "Preview"
          },
          metrics: {
            commission: "Commission",
            vat: "VAT",
            netToAh: "Net to AH"
          }
        },
        common: {
          notes: "Notes"
        }
      }
    };
    i18n.currentLang = "en";

    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.midTerm,
      reservationSource: "platform",
      guestAmount: "150",
      notes: ""
    };

    const html = manager.renderCleaningSingleForm({
      draft: manager.cleaningDraft,
      preview: {
        platformCommission: 0,
        vatAmount: 0,
        totalToAhWithoutLaundry: 150,
        totalToAh: 150
      },
      guestAmountField: manager.getCleaningGuestAmountFieldState(manager.cleaningDraft, {
        enableSuggestion: false
      })
    });

    assert.includes(html, "Saved amount");
    assert.includes(html, "disabled");
    assert.includes(html, "Mid-term cleanings use the amount field as saved cleaning-company cost.");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("uses charged-amount rules for other cleanings forms", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Check-out from property owner" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            otherCleanings: "Other cleanings use the charged amount field."
          },
          forms: {
            date: "Date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount",
            chargedAmount: "Charged amount",
            savedAmount: "Saved amount",
            notesPlaceholder: "Optional note"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          preview: {
            title: "Preview"
          },
          metrics: {
            commission: "Commission",
            vat: "VAT",
            netToAh: "Net to AH"
          }
        },
        common: {
          notes: "Notes"
        }
      }
    };
    i18n.currentLang = "en";

    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.otherCleanings,
      reservationSource: "platform",
      guestAmount: "150",
      notes: ""
    };

    const html = manager.renderCleaningSingleForm({
      draft: manager.cleaningDraft,
      preview: {
        platformCommission: 0,
        vatAmount: 27.05,
        totalToAhWithoutLaundry: 122.95,
        totalToAh: 122.95
      },
      guestAmountField: manager.getCleaningGuestAmountFieldState(manager.cleaningDraft, {
        enableSuggestion: false
      })
    });

    assert.includes(html, "Charged amount");
    assert.equal(manager.getCleaningAmountLabel(CLEANING_AH_CATEGORY_KEYS.otherCleanings), "Charged amount");
    assert.includes(html, "Other cleanings use the charged amount field.");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
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
            net: "Net",
            actions: "Actions"
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
        totalToAh: 99.7,
        notes: "",
        source: "manual"
      }
    ]);

    assert.includes(formHtml, 'name="reservationSource"');
    assert.includes(batchHtml, 'name="reservationSource"');
    assert.includes(tableHtml, "Reservation");
    assert.includes(tableHtml, "Direct");
    assert.includes(tableHtml, 'aria-label="Edit"');
    assert.includes(tableHtml, 'aria-label="Delete"');
    assert.includes(tableHtml, 'fas fa-pen');
    assert.includes(tableHtml, 'fas fa-trash');

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;

    resetDom();
  });

  test("renders laundry single and batch forms with quantity and rate", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    manager.laundryDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      quantity: "3",
      kg: "5",
      amount: "11.5",
      laundryRatePerKg: "2.3",
      notes: ""
    };
    manager.laundryBatchDraft = {
      date: "2026-04-07",
      laundryRatePerKg: "2.3",
      rows: [
        manager.createLaundryBatchRow({ propertyName: "Acqua Beach", quantity: "3", kg: "5", notes: "" })
      ]
    };

    const singleHtml = manager.renderLaundrySingleForm({
      draft: manager.laundryDraft,
      preview: { amount: 11.5 }
    });
    const batchPreview = manager.getLaundryBatchPreview();

    assert.includes(singleHtml, 'name="quantity"');
    assert.includes(singleHtml, 'name="kg"');
    assert.includes(singleHtml, 'name="laundryRatePerKg"');
    assert.equal(batchPreview.quantity, 3);
    assert.equal(batchPreview.kg, 5);
    assert.equal(batchPreview.amount, 11.5);

    resetDom();
  });

  test("renders cleaning edits inline in the stored-data table", () => {
    resetDom();

    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          categories: {
            checkout: { label: "Check-out" },
            "owner-checkout": { label: "Check-out from property owner" },
            "first-cleaning": { label: "First cleaning" },
            "mid-term": { label: "Mid-term cleaning" },
            "other-cleanings": { label: "Other cleanings" }
          },
          categoryRules: {
            checkout: "Checkout rule"
          },
          cleanings: {
            editTitle: "Edit cleaning"
          },
          forms: {
            date: "Date",
            property: "Property",
            propertyPlaceholder: "Type or pick a property",
            category: "Category",
            reservationSource: "Reservation",
            guestAmount: "Guest amount",
            notesPlaceholder: "Optional note"
          },
          reservationSources: {
            platform: "Platform",
            direct: "Direct"
          },
          preview: {
            title: "Preview"
          },
          metrics: {
            commission: "Commission",
            vat: "VAT",
            netToAh: "Net to AH"
          },
          tables: {
            date: "Date",
            property: "Property",
            category: "Category",
            reservation: "Reservation",
            guest: "Guest",
            net: "Net",
            actions: "Actions"
          },
          actions: {
            cancelEdit: "Cancel edit",
            saveChanges: "Save changes"
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
    manager.editingCleaningId = "cleaning-1";
    manager.cleaningDraft = {
      date: "2026-04-07",
      propertyName: "Acqua Beach",
      categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
      reservationSource: "platform",
      guestAmount: "150",
      notes: "Needs correction"
    };

    const tableHtml = manager.renderCleaningsTable([
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        categoryKey: CLEANING_AH_CATEGORY_KEYS.checkout,
        reservationSource: "platform",
        guestAmount: 150,
        totalToAh: 99.7,
        notes: "",
        source: "manual"
      }
    ]);

    assert.includes(tableHtml, 'id="cleaning-ah-inline-cleaning-form"');
    assert.includes(tableHtml, 'id="cleaning-ah-inline-cleaning-preview"');
    assert.includes(tableHtml, 'form="cleaning-ah-inline-cleaning-form"');
    assert.includes(tableHtml, "Needs correction");

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders standalone laundry table with quantity column and actions", () => {
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
          tables: {
            date: "Date",
            property: "Property",
            quantity: "Qty",
            kg: "Kg",
            ratePerKg: "Rate / kg",
            amount: "Amount",
            actions: "Actions"
          }
        }
      }
    };
    i18n.currentLang = "en";

    const tableHtml = manager.renderLaundryTable([
      {
        id: "laundry-1",
        date: "2026-04-07",
        propertyName: "Acqua Beach",
        quantity: 2,
        kg: 5,
        laundryRatePerKg: 2.3,
        amount: 11.5,
        notes: "",
        source: "standalone"
      }
    ]);

    assert.includes(tableHtml, "Qty");
    assert.includes(tableHtml, "Acqua Beach");
    assert.includes(tableHtml, 'aria-label="Edit"');
    assert.includes(tableHtml, 'aria-label="Delete"');
    assert.includes(tableHtml, 'fas fa-pen');
    assert.includes(tableHtml, 'fas fa-trash');

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders cleaning register controls and applies cleaning register sort", () => {
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
            storedDescription: "Use Show and Order by to explore cleanings.",
            empty: "No cleaning records match the current filters.",
            registerFilters: {
              all: "All rows"
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
    manager.cleaningRegisterSort = "property-asc";

    const visibleEntries = manager.getVisibleCleaningRegisterEntries([
      {
        id: "cleaning-1",
        date: "2026-04-07",
        propertyName: "Bravo",
        totalToAh: 88.2
      },
      {
        id: "cleaning-2",
        date: "2026-04-06",
        propertyName: "Acqua Beach",
        totalToAh: 99.7
      }
    ]);
    const controlsHtml = manager.renderCleaningRegisterControls();

    assert.equal(visibleEntries[0].id, "cleaning-2");
    assert.includes(controlsHtml, 'id="cleaning-ah-cleaning-register-sort"');

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders heatmap cells with correct interactive click and hover attributes", () => {
    const manager = new CleaningAhManager(null);
    const records = [
      { propertyName: "Acqua Beach", date: "2026-07-05", totalToAh: 120 }
    ];
    const html = manager.renderPropertyMonthHeatmap(records);
    assert.includes(html, "data-action=\"open-heatmap-detail\"");
    assert.includes(html, "data-property=\"Acqua Beach\"");
    assert.includes(html, "data-month=\"2026-07\"");
    assert.includes(html, "cursor-pointer");
  });

  test("renders heatmap detail modal when active", () => {
    const manager = new CleaningAhManager(null);
    manager.heatmapDetailModal = { propertyName: "Acqua Beach", monthKey: "2026-07" };
    const allRecords = [
      { propertyName: "Acqua Beach", date: "2026-07-05", categoryKey: "checkout", reservationSource: "platform", guestAmount: 150, platformCommission: 15, vatAmount: 22, effectiveLaundryAmount: 30, effectiveTotalToAh: 105 }
    ];
    const html = manager.renderHeatmapDetailModal(allRecords);
    assert.includes(html, "Acqua Beach");
    assert.includes(html, "2026-07-05");
    assert.includes(html, "data-action=\"close-heatmap-detail\"");
  });

  test("exportMonthReportAsPDF generates and saves report correctly", () => {
    const manager = new CleaningAhManager(null);
    manager.cleaningRecords = [
      { id: "c1", date: "2026-07-05", propertyName: "Acqua Beach", categoryKey: "checkout", guestAmount: 150, platformCommission: 15, vatAmount: 22, laundryAmount: 30 }
    ];
    manager.laundryRecords = [];

    let constructorCalled = false;
    let autoTableCalls = [];
    let saveCalledFilename = null;

    class jsPDFMock {
      constructor(options) {
        constructorCalled = true;
        this.options = options;
        this.internal = {
          getNumberOfPages: () => 1
        };
        this.lastAutoTable = { finalY: 100 };
      }
      setFont() {}
      setFontSize() {}
      setTextColor() {}
      setDrawColor() {}
      setLineWidth() {}
      line() {}
      text() {}
      addPage() {}
      autoTable(config) {
        autoTableCalls.push(config);
      }
      save(filename) {
        saveCalledFilename = filename;
      }
    }

    const originalJspdf = window.jspdf;
    window.jspdf = { jsPDF: jsPDFMock };

    try {
      manager.exportMonthReportAsPDF("2026-07");

      assert.ok(constructorCalled);
      assert.equal(autoTableCalls.length, 2); // highlights + properties
      assert.equal(saveCalledFilename, "financial-report-2026-07.pdf");
    } finally {
      window.jspdf = originalJspdf;
    }
  });

  test("renders stats tab with 3-pillar summary and consolidated monthly statement", () => {
    resetDom();
    const manager = new CleaningAhManager(null);
    const previousTranslations = i18n.translations;
    const previousLang = i18n.currentLang;
    i18n.translations = {
      en: {
        cleaningAh: {
          stats: {
            consolidatedKicker: "Consolidated Financials",
            consolidatedTitle: "Overall Performance & Final Net",
            consolidatedDescription: "Cleanings revenue, laundry expenses, and what AH earned in total after all costs.",
            cleaningsTitle: "Cleanings Summary",
            laundryTitle: "Laundry Summary",
            everythingTogetherTitle: "Final Take-Home (Everything Together)",
            consolidatedByMonthKicker: "Combined Breakdown",
            consolidatedByMonthTitle: "Monthly Consolidated Statement",
            consolidatedByMonthDescription: "Side-by-side monthly comparison of cleanings net, laundry expenses, and final take-home earnings.",
            exportReport: "Export PDF Summary"
          },
          metrics: {
            guestTotal: "Amount total",
            platformFees: "Platform fees",
            vat: "VAT",
            cleaningsNet: "Cleanings net",
            laundryExpenses: "Laundry expenses",
            finalNetProfit: "Final net earnings",
            quantity: "Quantity",
            kg: "Kg"
          },
          tables: {
            month: "Month",
            rows: "rows",
            total: "Total"
          },
          tabs: {
            cleanings: "Cleanings",
            laundry: "Laundry"
          }
        }
      }
    };
    i18n.currentLang = "en";

    const cleaningSummary = {
      totals: {
        count: 10,
        guestAmount: 1500,
        platformCommission: 232.5,
        vatAmount: 270.5,
        totalToAh: 997,
        averageTotalToAh: 99.7
      },
      byMonth: [
        { key: "2026-04", label: "2026-04", count: 10, guestAmount: 1500, totalToAh: 997 }
      ],
      byCategory: []
    };
    const laundrySummary = {
      totals: {
        count: 5,
        quantity: 12,
        kg: 40,
        amount: 92
      },
      byMonth: [
        { key: "2026-04", label: "2026-04", count: 5, quantity: 12, kg: 40, amount: 92 }
      ],
      byProperty: []
    };

    const html = manager.renderStatsTab(
      cleaningSummary,
      [],
      [],
      "",
      null,
      laundrySummary,
      []
    );

    // Cleanings pillar
    assert.includes(html, "Cleanings Summary");
    // Laundry pillar
    assert.includes(html, "Laundry Summary");
    assert.includes(html, "40 kg");
    // Consolidated / Final Take-Home pillar (Everything together: 997 - 92 = 905)
    assert.includes(html, "Final Take-Home (Everything Together)");
    assert.includes(html, "Monthly Consolidated Statement");
    assert.includes(html, "905"); // 997 - 92 = 905 EUR

    i18n.translations = previousTranslations;
    i18n.currentLang = previousLang;
    resetDom();
  });

  test("renders laundry expenses from laundry records and deducts them from cleaning earnings", () => {
    resetDom('<div id="cleaning-ah-root"></div>');
    const manager = new CleaningAhManager(null);
    manager.activeTab = "stats";
    manager.cleaningRecords = [
      { id: "c1", date: "2026-04-05", monthKey: "2026-04", propertyName: "Acqua Beach", totalToAh: 100 },
      { id: "c2", date: "2026-04-06", monthKey: "2026-04", propertyName: "Calas Loft", totalToAh: 100 }
    ];
    manager.laundryRecords = [
      { id: "l1", date: "2026-04-07", monthKey: "2026-04", propertyName: "Acqua Beach", quantity: 2, kg: 5, laundryRatePerKg: 2.3, amount: 0 },
      { id: "l2", date: "2026-04-08", monthKey: "2026-04", propertyName: "Calas Loft", quantity: 3, kg: 5, laundryRatePerKg: 2.3, amount: 20 },
      { id: "l3", date: "2026-05-01", monthKey: "2026-05", propertyName: "Acqua Beach", quantity: 1, kg: 4, laundryRatePerKg: 3 }
    ];

    const root = document.getElementById("cleaning-ah-root");
    const assertSummary = ({ count, quantity, kg, amount, net }) => {
      const cards = root.querySelectorAll(".cleaning-ah-card");
      const laundryCard = cards[1];
      assert.equal(laundryCard.querySelector(".cleaning-ah-card-value").textContent, manager.formatCurrency(amount));
      assert.includes(laundryCard.textContent, `${count} ${manager.tr("tables.rows")}`);
      assert.includes(laundryCard.textContent, `${quantity} items`);
      assert.includes(laundryCard.textContent, `${manager.formatNumber(kg)} kg`);
      assert.equal(cards[2].querySelector(".cleaning-ah-card-value").textContent, manager.formatCurrency(net));
      const totals = root.querySelector("tfoot tr").cells;
      assert.equal(totals[2].textContent, manager.formatCurrency(amount));
      assert.equal(totals[3].textContent, manager.formatCurrency(net));
    };

    try {
      manager.render();
      assertSummary({ count: 3, quantity: 6, kg: 14, amount: 43.5, net: 156.5 });
      const rows = [...root.querySelectorAll("tbody tr")];
      const april = rows.find((row) => row.cells[0].textContent === manager.formatMonthKey("2026-04"));
      assert.equal(april.cells[2].textContent, manager.formatCurrency(31.5));
      assert.equal(april.cells[3].textContent, manager.formatCurrency(168.5));

      manager.statsViewMode = "property";
      manager.render();
      assertSummary({ count: 3, quantity: 6, kg: 14, amount: 43.5, net: 156.5 });
      const propertyRow = [...root.querySelectorAll("tbody tr")]
        .find((row) => row.cells[0].textContent === "Acqua Beach");
      assert.equal(propertyRow.cells[2].textContent, manager.formatCurrency(23.5));
      assert.equal(propertyRow.cells[3].textContent, manager.formatCurrency(76.5));

      manager.statsViewMode = "month";
      manager.selectedMonthKey = "2026-04";
      manager.selectedPropertyName = "Acqua Beach";
      manager.render();
      assertSummary({ count: 1, quantity: 2, kg: 5, amount: 11.5, net: 88.5 });

      // Laundry-only months must still contribute expenses, even without cleanings.
      manager.selectedMonthKey = "2026-05";
      manager.render();
      assertSummary({ count: 1, quantity: 1, kg: 4, amount: 12, net: -12 });

      manager.laundryRecords = [];
      manager.render();
      assertSummary({ count: 0, quantity: 0, kg: 0, amount: 0, net: 0 });
    } finally {
      resetDom();
    }
  });

  test("opens property stats from the ranking and returns without changing the filters", () => {
    resetDom('<div id="cleaning-ah-root"></div>');
    const manager = new CleaningAhManager(null);
    manager.activeTab = "stats";
    manager.statsViewMode = "property";
    manager.cleaningRecords = [
      { id: "c1", date: "2026-04-05", monthKey: "2026-04", propertyName: "Villa Magnólia", totalToAh: 100 },
      { id: "c2", date: "2026-05-05", monthKey: "2026-05", propertyName: "Villa Magnólia", totalToAh: 200 },
      { id: "c3", date: "2026-04-06", monthKey: "2026-04", propertyName: "Calas Loft", totalToAh: 400 }
    ];
    manager.laundryRecords = [
      { id: "l1", date: "2026-04-07", monthKey: "2026-04", propertyName: "Villa Magnólia", quantity: 2, kg: 5, amount: 20 },
      { id: "l2", date: "2026-05-07", monthKey: "2026-05", propertyName: "Villa Magnólia", quantity: 1, kg: 10, laundryRatePerKg: 2.3 },
      { id: "l3", date: "2026-04-08", monthKey: "2026-04", propertyName: "Laundry Only", quantity: 3, kg: 4, amount: 12 }
    ];
    const root = document.getElementById("cleaning-ah-root");
    const openProperty = (name) => [...root.querySelectorAll("[data-action='open-stats-property']")]
      .find((button) => button.dataset.propertyName === name).click();
    const cardValues = () => [...root.querySelectorAll(".cleaning-ah-card-value")].map((card) => card.textContent);
    const back = () => root.querySelector("[data-action='close-stats-property']").click();

    try {
      manager.render();
      openProperty("Villa Magnólia");
      assert.equal(root.querySelector("#cleaning-ah-property-stats-title").textContent, "Villa Magnólia");
      assert.deepEqual(cardValues(), [300, 43, 257].map((value) => manager.formatCurrency(value)));
      assert.equal(root.querySelectorAll("tbody tr").length, 2);
      const april = [...root.querySelectorAll("tbody tr")].find((row) => row.cells[0].textContent === manager.formatMonthKey("2026-04"));
      assert.equal(april.cells[3].textContent, manager.formatCurrency(80));
      assert.ok(!root.querySelector("[data-action='open-export-modal']"));
      assert.ok(!root.querySelector("[data-action='open-stats-property']"));
      back();
      assert.equal(manager.statsViewMode, "property");
      assert.deepEqual(cardValues(), [700, 55, 645].map((value) => manager.formatCurrency(value)));

      manager.selectedMonthKey = "2026-04";
      manager.render();
      openProperty("Villa Magnólia");
      assert.deepEqual(cardValues(), [100, 20, 80].map((value) => manager.formatCurrency(value)));
      assert.equal(root.querySelectorAll("tbody tr").length, 1);
      back();
      assert.equal(manager.selectedMonthKey, "2026-04");

      openProperty("Laundry Only");
      assert.deepEqual(cardValues(), [0, 12, -12].map((value) => manager.formatCurrency(value)));
      assert.includes(root.textContent, "4 kg");
      back();
      assert.equal(manager.statsDetailPropertyName, "");
    } finally {
      resetDom();
    }
  });

  test("groups cleanings by month with count and net sums for Asana section view", () => {
    const manager = new CleaningAhManager(null);
    const records = [
      { id: "c1", monthKey: "2026-04", date: "2026-04-10", guestAmount: 100, effectiveTotalToAh: 68 },
      { id: "c2", monthKey: "2026-04", date: "2026-04-15", guestAmount: 120, effectiveTotalToAh: 82 },
      { id: "c3", monthKey: "2026-03", date: "2026-03-20", guestAmount: 90, effectiveTotalToAh: 60 }
    ];

    const groups = manager.groupCleaningsByMonth(records);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].monthKey, "2026-04");
    assert.equal(groups[0].records.length, 2);
    assert.equal(groups[0].netSum, 150);
    assert.equal(groups[0].guestSum, 220);

    assert.equal(groups[1].monthKey, "2026-03");
    assert.equal(groups[1].records.length, 1);
    assert.equal(groups[1].netSum, 60);
  });

  test("opens and closes Asana slide-over drawer for cleanings, laundry, and special cleanings", () => {
    resetDom();
    const manager = new CleaningAhManager(null);
    manager.cleaningRecords = [
      { id: "c-100", propertyName: "Acqua Beach", date: "2026-04-05", guestAmount: 110, category: "Limpeza check-out", notes: "First clean" }
    ];
    manager.laundryRecords = [
      { id: "l-100", propertyName: "Sunset Villa", date: "2026-04-06", quantity: 2, kg: 10, laundryRatePerKg: 2.3, notes: "Towels" }
    ];
    manager.specialCleaningRecords = [
      { id: "s-100", propertyName: "Ocean View", date: "2026-04-07", specialType: "deep", cost: 150, description: "Full spring clean", notes: "" }
    ];

    // Open cleaning drawer for edit
    manager.openCleaningDrawer("c-100");
    assert.equal(manager.activeDrawer.type, "cleaning");
    assert.equal(manager.activeDrawer.id, "c-100");
    assert.equal(manager.editingCleaningId, "c-100");
    assert.equal(manager.cleaningDraft.propertyName, "Acqua Beach");

    let drawerHtml = manager.renderSlideOverDrawer();
    assert.includes(drawerHtml, "data-cleaning-detail");
    assert.includes(drawerHtml, "cleaning-detail is-open");
    assert.includes(drawerHtml, "Acqua Beach");

    // Close drawer
    manager.closeDrawer();
    assert.equal(manager.activeDrawer, null);
    assert.equal(manager.editingCleaningId, null);

    // Open laundry drawer for new
    manager.openLaundryDrawer(null, { propertyName: "Test Prop" });
    assert.equal(manager.activeDrawer.type, "laundry");
    assert.equal(manager.activeDrawer.id, null);
    assert.equal(manager.laundryDraft.propertyName, "Test Prop");

    drawerHtml = manager.renderSlideOverDrawer();
    assert.includes(drawerHtml, "cleaning-detail is-open");
    assert.includes(drawerHtml, "Test Prop");

    // Open special cleaning drawer
    manager.openSpecialCleaningDrawer("s-100");
    assert.equal(manager.activeDrawer.type, "special");
    assert.equal(manager.editingSpecialCleaningId, "s-100");

    drawerHtml = manager.renderSlideOverDrawer();
    assert.includes(drawerHtml, "Full spring clean");

    manager.closeDrawer();
    assert.equal(manager.activeDrawer, null);
    resetDom();
  });
});

