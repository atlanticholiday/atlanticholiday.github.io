import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
    CLEANING_AH_CATEGORY_KEYS,
    CLEANING_AH_DEFAULTS,
    CLEANING_AH_RESERVATION_SOURCES,
    createCleaningAhFingerprint,
    createCleaningAhRecord,
    createStandaloneLaundryRecord,
    filterCleaningRegisterEntries,
    filterLaundryRegisterEntries,
    getCleaningAhCategoryConfig,
    normalizeCleaningAhCategoryKey,
    parseCleaningAhCsv,
    roundCurrency,
    summarizeCleaningAhRecords,
    summarizeCleaningAhPropertyDetail,
    summarizeCleaningAhPropertyRows,
    summarizeLaundryRecords,
    sortCleaningAhPropertyRows
} from "./cleaning-ah-utils.js";
import { i18n, t } from "../../core/i18n.js";

const DEFAULT_CLEANING_CATEGORY_KEY = CLEANING_AH_CATEGORY_KEYS.checkout;

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeLabel(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ");
}

function normalizeKey(value) {
    return normalizeLabel(value).toLocaleLowerCase();
}

function toInputNumber(value) {
    return value === null || value === undefined || value === ""
        ? ""
        : String(value);
}

function toOptionalNumber(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function getTodayIsoDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export class CleaningAhManager {
    constructor(db, { getDataManager = null, getProperties = null } = {}) {
        this.db = db || null;
        this.getDataManager = typeof getDataManager === "function" ? getDataManager : () => null;
        this.readProperties = typeof getProperties === "function" ? getProperties : () => [];
        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.cleaningRecords = [];
        this.laundryRecords = [];
        this.specialCleaningRecords = [];
        this.cleaningUnsubscribe = null;
        this.laundryUnsubscribe = null;
        this.specialCleaningUnsubscribe = null;

        this.activeTab = "stats";
        this.searchQuery = "";
        this.selectedMonthKey = "";
        this.selectedPropertyName = "";
        this.selectedCategory = "";
        this.statsCategoryKey = "";
        this.statsPropertySort = "net-desc";
        this.statsSelectedPropertyName = "";
        this.cleaningRegisterFilter = "all";
        this.cleaningRegisterSort = "date-desc";
        this.laundryRegisterFilter = "all";
        this.laundryRegisterSort = "date-desc";
        this.openLaundryLinkEditorId = "";
        this.openCleaningLaundryEntryId = "";
        this.cleaningLaundryQuickDrafts = {};

        this.editingCleaningId = null;
        this.editingLaundryId = null;
        this.editingSpecialCleaningId = null;
        this.cleaningEntryMode = "single";
        this.laundryEntryMode = "single";
        this.nextCleaningBatchRowId = 0;
        this.nextLaundryBatchRowId = 0;
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.cleaningBatchDraft = this.createDefaultCleaningBatchDraft();
        this.laundryDraft = this.createDefaultLaundryDraft();
        this.laundryBatchDraft = this.createDefaultLaundryBatchDraft();
        this.specialCleaningDraft = this.createDefaultSpecialCleaningDraft();

        this.importPreview = null;
        this.statusMessage = "";
        this.statusTone = "info";

        if (typeof window !== "undefined") {
            window.setTimeout(() => this.ensureDomScaffold(), 50);
            document.addEventListener("cleaningAhPageOpened", () => {
                this.ensureDomScaffold();
                this.startListening();
                this.render();
            });
            document.addEventListener("propertiesDataUpdated", () => {
                if (document.getElementById("cleaning-ah-page")) {
                    this.render();
                }
            });
            window.addEventListener("languageChanged", this.handleLanguageChange);
        }
    }

    tr(key, replacements = {}) {
        return t(`cleaningAh.${key}`, replacements);
    }

    trCount(key, count, replacements = {}) {
        return this.tr(`${key}.${count === 1 ? "one" : "other"}`, {
            count,
            ...replacements
        });
    }

    getLocale() {
        const activeLanguage = i18n?.getCurrentLanguage?.() || i18n?.currentLang || "en";
        return activeLanguage === "pt" ? "pt-PT" : "en-US";
    }

    getRowsLabel(count) {
        return this.trCount("counts.rows", count);
    }

    getRecordsLabel(count) {
        return this.trCount("counts.records", count);
    }

    getWarningsLabel(count) {
        return this.trCount("counts.warnings", count);
    }

    getLinkedRowsLabel(count) {
        return this.trCount("counts.linkedRows", count);
    }

    getImportRowsLabel(count) {
        return this.trCount("counts.importRows", count);
    }

    getReservationSourceLabel(value) {
        return value === CLEANING_AH_RESERVATION_SOURCES.direct
            ? this.tr("reservationSources.direct")
            : this.tr("reservationSources.platform");
    }

    getCleaningCategoryDefinitions() {
        return [
            CLEANING_AH_CATEGORY_KEYS.checkout,
            CLEANING_AH_CATEGORY_KEYS.ownerCheckout,
            CLEANING_AH_CATEGORY_KEYS.firstCleaning,
            CLEANING_AH_CATEGORY_KEYS.midTerm,
            CLEANING_AH_CATEGORY_KEYS.otherCleanings
        ].map((key) => ({
            key,
            label: this.tr(`categories.${key}.label`)
        }));
    }

    getCleaningCategoryKey(value) {
        return normalizeCleaningAhCategoryKey(value) || DEFAULT_CLEANING_CATEGORY_KEY;
    }

    getCleaningCategoryLabel(value) {
        const categoryKey = normalizeCleaningAhCategoryKey(value);
        return categoryKey
            ? this.tr(`categories.${categoryKey}.label`)
            : normalizeLabel(value) || this.tr(`categories.${DEFAULT_CLEANING_CATEGORY_KEY}.label`);
    }

    getCleaningCategoryConfig(value) {
        return getCleaningAhCategoryConfig(this.getCleaningCategoryKey(value));
    }

    getCleaningCategoryRuleKey(categoryValue) {
        const categoryKey = this.getCleaningCategoryKey(categoryValue);
        const ruleKeyByCategory = {
            [CLEANING_AH_CATEGORY_KEYS.checkout]: "checkout",
            [CLEANING_AH_CATEGORY_KEYS.ownerCheckout]: "ownerCheckout",
            [CLEANING_AH_CATEGORY_KEYS.firstCleaning]: "firstCleaning",
            [CLEANING_AH_CATEGORY_KEYS.midTerm]: "midTerm",
            [CLEANING_AH_CATEGORY_KEYS.otherCleanings]: "otherCleanings"
        };

        return ruleKeyByCategory[categoryKey] || "checkout";
    }

    getCleaningCategoryRuleText(categoryValue) {
        return this.tr(`categoryRules.${this.getCleaningCategoryRuleKey(categoryValue)}`);
    }

    getCleaningAmountLabel(categoryValue) {
        const categoryKey = this.getCleaningCategoryKey(categoryValue);
        if (categoryKey === CLEANING_AH_CATEGORY_KEYS.midTerm) {
            return this.tr("forms.savedAmount");
        }

        if (
            categoryKey === CLEANING_AH_CATEGORY_KEYS.ownerCheckout
            || categoryKey === CLEANING_AH_CATEGORY_KEYS.firstCleaning
            || categoryKey === CLEANING_AH_CATEGORY_KEYS.otherCleanings
        ) {
            return this.tr("forms.chargedAmount");
        }

        return this.tr("forms.guestAmount");
    }

    categoryUsesReservationSource(categoryValue) {
        return this.getCleaningCategoryKey(categoryValue) === CLEANING_AH_CATEGORY_KEYS.checkout;
    }

    getCleaningReservationSource(record = {}) {
        if (!this.categoryUsesReservationSource(record.categoryKey || record.category)) {
            return CLEANING_AH_RESERVATION_SOURCES.direct;
        }

        return record.reservationSource
            || (roundCurrency(record.platformCommission || 0) === 0
                ? CLEANING_AH_RESERVATION_SOURCES.direct
                : CLEANING_AH_RESERVATION_SOURCES.platform);
    }

    createCleaningQuickLaundryDraft(record = {}, overrides = {}) {
        return {
            date: getTodayIsoDate(),
            kg: "",
            laundryRatePerKg: String(CLEANING_AH_DEFAULTS.laundryRatePerKg),
            notes: "",
            ...overrides,
            linkedCleaningId: record.id || ""
        };
    }

    getRecordSourceLabel(value) {
        const sourceKeyByValue = {
            manual: "recordSources.manual",
            import: "recordSources.import",
            standalone: "recordSources.standalone",
            cleaning: "recordSources.cleaning"
        };
        const translationKey = sourceKeyByValue[value];

        return translationKey ? this.tr(translationKey) : String(value || this.tr("recordSources.manual"));
    }

    getSpecialCleaningTypeOptions() {
        return [
            ["sofa", this.tr("specialCleanings.types.sofa")],
            ["mattress", this.tr("specialCleanings.types.mattress")],
            ["other", this.tr("specialCleanings.types.other")]
        ];
    }

    getSpecialCleaningTypeLabel(value) {
        const match = this.getSpecialCleaningTypeOptions().find(([key]) => key === value);
        return match?.[1] || this.tr("specialCleanings.types.other");
    }

    handleLanguageChange() {
        this.ensureDomScaffold();
        this.render();
    }

    createDefaultCleaningDraft() {
        return {
            date: getTodayIsoDate(),
            propertyName: "",
            categoryKey: DEFAULT_CLEANING_CATEGORY_KEY,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
            guestAmount: "",
            laundryKg: "",
            notes: ""
        };
    }

    createCleaningBatchRow(overrides = {}) {
        return {
            rowId: `cleaning-batch-row-${this.nextCleaningBatchRowId += 1}`,
            propertyName: "",
            guestAmount: "",
            laundryKg: "",
            notes: "",
            ...overrides
        };
    }

    createDefaultCleaningBatchDraft() {
        return {
            date: getTodayIsoDate(),
            categoryKey: DEFAULT_CLEANING_CATEGORY_KEY,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
            rows: [this.createCleaningBatchRow()]
        };
    }

    createDefaultLaundryDraft() {
        return {
            date: getTodayIsoDate(),
            linkedCleaningId: "",
            propertyName: "",
            kg: "",
            laundryRatePerKg: String(CLEANING_AH_DEFAULTS.laundryRatePerKg),
            notes: ""
        };
    }

    createLaundryBatchRow(overrides = {}) {
        return {
            rowId: `laundry-batch-row-${this.nextLaundryBatchRowId += 1}`,
            propertyName: "",
            kg: "",
            notes: "",
            ...overrides
        };
    }

    createDefaultLaundryBatchDraft() {
        return {
            date: getTodayIsoDate(),
            laundryRatePerKg: String(CLEANING_AH_DEFAULTS.laundryRatePerKg),
            rows: [this.createLaundryBatchRow()]
        };
    }

    createDefaultSpecialCleaningDraft() {
        return {
            date: getTodayIsoDate(),
            propertyName: "",
            specialType: "sofa",
            cost: "",
            description: "",
            notes: ""
        };
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.canAccessApp !== "function") {
            return true;
        }

        return Boolean(dataManager.canAccessApp("cleaningAh"));
    }

    syncAccessVisibility() {
        const button = document.getElementById("go-to-cleaning-ah-btn");
        if (button) {
            button.classList.toggle("hidden", !this.hasAccess());
        }

        if (document.getElementById("cleaning-ah-page")) {
            this.render();
        }
    }

    updateStaticCopy() {
        const backLabel = document.getElementById("cleaning-ah-back-label");
        if (backLabel) {
            backLabel.textContent = t("common.back");
        }

        const headerKicker = document.getElementById("cleaning-ah-header-kicker");
        if (headerKicker) {
            headerKicker.textContent = this.tr("header.kicker");
        }

        const headerTitle = document.getElementById("cleaning-ah-header-title");
        if (headerTitle) {
            headerTitle.textContent = this.tr("header.title");
        }

        const headerSubtitle = document.getElementById("cleaning-ah-header-subtitle");
        if (headerSubtitle) {
            headerSubtitle.textContent = this.tr("header.subtitle");
        }

        const signOutButton = document.getElementById("cleaning-ah-sign-out-btn");
        if (signOutButton) {
            signOutButton.textContent = t("common.signOut");
        }

        const landingCardTitle = document.getElementById("cleaning-ah-card-title");
        if (landingCardTitle) {
            landingCardTitle.textContent = this.tr("header.title");
        }

        const landingCardDescription = document.getElementById("cleaning-ah-card-description");
        if (landingCardDescription) {
            landingCardDescription.textContent = this.tr("landing.description");
        }
    }

    ensureDomScaffold() {
        if (!document.getElementById("cleaning-ah-page")) {
            const page = document.createElement("div");
            page.id = "cleaning-ah-page";
            page.className = "hidden min-h-screen bg-slate-50";
            page.innerHTML = `
                <div id="cleaning-ah-shell" class="mx-auto w-full max-w-[1700px] px-4 py-6 xl:px-6 2xl:px-8">
                    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
                        <div class="flex items-center gap-3">
                            <button id="back-to-landing-from-cleaning-ah-btn" class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center">
                                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                                <span id="cleaning-ah-back-label"></span>
                            </button>
                            <div>
                                <div id="cleaning-ah-header-kicker" class="text-xs uppercase tracking-[0.28em] text-sky-600 font-semibold"></div>
                                <h1 id="cleaning-ah-header-title" class="text-2xl font-semibold text-slate-900"></h1>
                                <p id="cleaning-ah-header-subtitle" class="text-sm text-slate-600 mt-1"></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 self-start md:self-auto">
                            <div class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm">
                                <button type="button" class="lang-btn px-2 py-1 rounded text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="en" title="English">EN</button>
                                <button type="button" class="lang-btn px-2 py-1 rounded text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="pt" title="Português">PT</button>
                            </div>
                            <button id="cleaning-ah-sign-out-btn" class="text-sm text-red-600 hover:underline"></button>
                        </div>
                    </div>
                    <div id="cleaning-ah-root" class="space-y-6"></div>
                </div>
            `;

            const landing = document.getElementById("landing-page");
            if (landing && landing.parentElement) {
                landing.parentElement.appendChild(page);
            } else {
                document.body.appendChild(page);
            }
        }

        const shell = document.getElementById("cleaning-ah-shell");
        if (shell) {
            shell.className = "mx-auto w-full max-w-[1700px] px-4 py-6 xl:px-6 2xl:px-8";
        }

        if (!document.getElementById("go-to-cleaning-ah-btn")) {
            const parent = document.getElementById("go-to-properties-btn")?.parentElement
                || document.getElementById("other-tools-grid");

            if (parent) {
                const card = document.createElement("button");
                card.id = "go-to-cleaning-ah-btn";
                card.className = parent.querySelector(".dashboard-card")?.className || "dashboard-card";
                card.innerHTML = `
                    <div class="card-icon bg-sky-500/10 text-sky-600">
                        <i class="fas fa-broom"></i>
                    </div>
                    <div class="card-body">
                        <h3 id="cleaning-ah-card-title"></h3>
                        <p id="cleaning-ah-card-description"></p>
                    </div>
                `;
                parent.appendChild(card);
            }
        }

        this.updateStaticCopy();
        i18n.setupLanguageSwitcher?.();
        i18n.updateLanguageSwitcher?.();
        this.syncAccessVisibility();
    }

    getCleaningsCollectionRef() {
        if (!this.db) return null;
        return collection(this.db, "cleaningAhRecords");
    }

    getLaundryCollectionRef() {
        if (!this.db) return null;
        return collection(this.db, "cleaningAhLaundryRecords");
    }

    getSpecialCleaningCollectionRef() {
        if (!this.db) return null;
        return collection(this.db, "cleaningAhSpecialCleaningRecords");
    }

    startListening() {
        const cleaningsRef = this.getCleaningsCollectionRef();
        const laundryRef = this.getLaundryCollectionRef();
        const specialCleaningRef = this.getSpecialCleaningCollectionRef();
        if (cleaningsRef && !this.cleaningUnsubscribe) {
            this.cleaningUnsubscribe = onSnapshot(cleaningsRef, (snapshot) => {
                this.cleaningRecords = snapshot.docs
                    .map((entry) => ({ id: entry.id, ...entry.data() }))
                    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
                this.render();
            }, (error) => {
                console.error("[Cleaning AH] cleanings listener failed:", error);
            });
        }

        if (laundryRef && !this.laundryUnsubscribe) {
            this.laundryUnsubscribe = onSnapshot(laundryRef, (snapshot) => {
                this.laundryRecords = snapshot.docs
                    .map((entry) => ({ id: entry.id, ...entry.data() }))
                    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
                this.render();
            }, (error) => {
                console.error("[Cleaning AH] laundry listener failed:", error);
            });
        }

        if (specialCleaningRef && !this.specialCleaningUnsubscribe) {
            this.specialCleaningUnsubscribe = onSnapshot(specialCleaningRef, (snapshot) => {
                this.specialCleaningRecords = snapshot.docs
                    .map((entry) => ({ id: entry.id, ...entry.data() }))
                    .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
                this.render();
            }, (error) => {
                console.error("[Cleaning AH] special cleanings listener failed:", error);
            });
        }
    }

    stopListening() {
        if (this.cleaningUnsubscribe) {
            this.cleaningUnsubscribe();
            this.cleaningUnsubscribe = null;
        }
        if (this.laundryUnsubscribe) {
            this.laundryUnsubscribe();
            this.laundryUnsubscribe = null;
        }
        if (this.specialCleaningUnsubscribe) {
            this.specialCleaningUnsubscribe();
            this.specialCleaningUnsubscribe = null;
        }
    }

    getProperties() {
        const properties = this.readProperties();
        return Array.isArray(properties) ? properties : [];
    }

    findPropertyByName(propertyName) {
        const normalizedName = normalizeKey(propertyName);
        if (!normalizedName) {
            return null;
        }

        return this.getProperties().find((property) => {
            const candidateNames = [
                property?.name,
                property?.displayName,
                property?.title,
                property?.reference,
                property?.code
            ].filter(Boolean);

            return candidateNames.some((name) => normalizeKey(name) === normalizedName);
        }) || null;
    }

    getKnownPropertyNames() {
        const propertyNames = new Map();
        this.getProperties().forEach((property) => {
            const label = normalizeLabel(
                property?.name
                || property?.displayName
                || property?.title
                || property?.reference
                || property?.code
            );
            if (label) {
                propertyNames.set(normalizeKey(label), label);
            }
        });
        this.cleaningRecords.forEach((record) => {
            if (record.propertyName) {
                propertyNames.set(normalizeKey(record.propertyName), record.propertyName);
            }
        });
        this.laundryRecords.forEach((record) => {
            if (record.propertyName) {
                propertyNames.set(normalizeKey(record.propertyName), record.propertyName);
            }
        });
        this.specialCleaningRecords.forEach((record) => {
            if (record.propertyName) {
                propertyNames.set(normalizeKey(record.propertyName), record.propertyName);
            }
        });

        return [...propertyNames.values()].sort((left, right) => left.localeCompare(right));
    }

    getFilterPropertyNames() {
        const propertyNames = new Map();

        this.cleaningRecords.forEach((record) => {
            if (this.selectedMonthKey && record.monthKey !== this.selectedMonthKey) {
                return;
            }
            if (
                this.selectedCategory
                && normalizeCleaningAhCategoryKey(record.categoryKey || record.category) !== normalizeCleaningAhCategoryKey(this.selectedCategory)
            ) {
                return;
            }
            if (record.propertyName) {
                propertyNames.set(normalizeKey(record.propertyName), record.propertyName);
            }
        });

        this.laundryRecords.forEach((record) => {
            if (this.selectedMonthKey && record.monthKey !== this.selectedMonthKey) {
                return;
            }
            if (record.propertyName) {
                propertyNames.set(normalizeKey(record.propertyName), record.propertyName);
            }
        });

        return [...propertyNames.values()].sort((left, right) => left.localeCompare(right));
    }

    getKnownCategories() {
        const categories = new Map(
            this.getCleaningCategoryDefinitions().map((entry) => [entry.key, entry])
        );
        this.cleaningRecords.forEach((record) => {
            const rawCategory = normalizeLabel(record.category);
            const categoryKey = normalizeCleaningAhCategoryKey(record.categoryKey || rawCategory);
            if (categoryKey && categories.has(categoryKey)) {
                return;
            }

            if (rawCategory) {
                categories.set(`raw:${normalizeKey(rawCategory)}`, {
                    key: rawCategory,
                    label: rawCategory
                });
            }
        });

        return [...categories.values()].sort((left, right) => left.label.localeCompare(right.label));
    }

    getMonthOptions() {
        const monthKeys = new Set();
        this.cleaningRecords.forEach((record) => {
            if (record.monthKey) {
                monthKeys.add(record.monthKey);
            }
        });
        this.laundryRecords.forEach((record) => {
            if (record.monthKey) {
                monthKeys.add(record.monthKey);
            }
        });

        return [...monthKeys].sort((left, right) => left.localeCompare(right));
    }

    getStatsPropertySortOptions() {
        return [
            ["net-desc", this.tr("stats.sortOptions.netDesc")],
            ["net-asc", this.tr("stats.sortOptions.netAsc")],
            ["count-desc", this.tr("stats.sortOptions.countDesc")],
            ["count-asc", this.tr("stats.sortOptions.countAsc")],
            ["guest-desc", this.tr("stats.sortOptions.guestDesc")],
            ["guest-asc", this.tr("stats.sortOptions.guestAsc")],
            ["avg-net-desc", this.tr("stats.sortOptions.avgNetDesc")],
            ["avg-net-asc", this.tr("stats.sortOptions.avgNetAsc")],
            ["laundry-desc", this.tr("stats.sortOptions.laundryDesc")],
            ["laundry-asc", this.tr("stats.sortOptions.laundryAsc")],
            ["kg-desc", this.tr("stats.sortOptions.kgDesc")],
            ["kg-asc", this.tr("stats.sortOptions.kgAsc")],
            ["last-entry-desc", this.tr("stats.sortOptions.lastEntryDesc")],
            ["last-entry-asc", this.tr("stats.sortOptions.lastEntryAsc")],
            ["property-asc", this.tr("stats.sortOptions.propertyAsc")],
            ["property-desc", this.tr("stats.sortOptions.propertyDesc")]
        ];
    }

    getStatsCategoryOptions(summary) {
        return [
            {
                key: "",
                label: this.tr("stats.allCleaningTypes"),
                count: summary?.totals?.count || 0
            },
            ...(summary?.byCategory || []).map((entry) => ({
                key: entry.key || "",
                label: this.getCleaningCategoryLabel(entry.key || entry.label),
                count: entry.count || 0
            }))
        ];
    }

    getStatsScopedCleaningRecords(records = [], statsCategoryKey = "") {
        const normalizedCategoryKey = normalizeCleaningAhCategoryKey(statsCategoryKey);
        if (!statsCategoryKey) {
            return [...records];
        }

        if (!normalizedCategoryKey) {
            const rawCategoryKey = normalizeKey(statsCategoryKey);
            return records.filter((record) => {
                return normalizeKey(record.categoryKey || record.category) === rawCategoryKey;
            });
        }

        return records.filter((record) => {
            return normalizeCleaningAhCategoryKey(record.categoryKey || record.category) === normalizedCategoryKey;
        });
    }

    getStatsSelectedPropertyName(rows = []) {
        const propertyMap = new Map(
            rows.map((entry) => [normalizeKey(entry.label), entry.label])
        );
        const preferredValues = [
            this.selectedPropertyName,
            this.statsSelectedPropertyName
        ];

        for (const value of preferredValues) {
            const normalizedValue = normalizeKey(value);
            if (normalizedValue && propertyMap.has(normalizedValue)) {
                return propertyMap.get(normalizedValue) || "";
            }
        }

        return rows[0]?.label || "";
    }

    getLaundryLinkOptions(currentLinkedCleaningId = "", preferredPropertyName = "") {
        const normalizedPreferredProperty = normalizeKey(preferredPropertyName);
        return [...this.cleaningRecords]
            .filter((record) => {
                return record.id === currentLinkedCleaningId || roundCurrency(record.laundryAmount || 0) <= 0;
            })
            .sort((left, right) => {
                const leftMatchesProperty = normalizedPreferredProperty && normalizeKey(left.propertyName) === normalizedPreferredProperty;
                const rightMatchesProperty = normalizedPreferredProperty && normalizeKey(right.propertyName) === normalizedPreferredProperty;

                if (leftMatchesProperty !== rightMatchesProperty) {
                    return leftMatchesProperty ? -1 : 1;
                }

                return String(right.date || "").localeCompare(String(left.date || ""));
            });
    }

    getLinkedLaundryRecordsForCleaning(recordId) {
        if (!recordId) {
            return [];
        }

        return this.laundryRecords.filter((record) => record.linkedCleaningId === recordId);
    }

    getCleaningQuickLaundryDraft(record) {
        const existingDraft = this.cleaningLaundryQuickDrafts[record?.id || ""];
        return existingDraft
            ? { ...existingDraft }
            : this.createCleaningQuickLaundryDraft(record);
    }

    readCleaningQuickLaundryDraftFromContainer(container, recordId) {
        const record = this.cleaningRecords.find((entry) => entry.id === recordId) || { id: recordId };
        return this.createCleaningQuickLaundryDraft(record, {
            date: String(container?.querySelector('[name="date"]')?.value || "").trim(),
            kg: String(container?.querySelector('[name="kg"]')?.value || "").trim(),
            laundryRatePerKg: String(container?.querySelector('[name="laundryRatePerKg"]')?.value || "").trim(),
            notes: String(container?.querySelector('[name="notes"]')?.value || "").trim()
        });
    }

    getCleaningQuickLaundryActionLabel(record) {
        const linkedLaundryCount = this.getLinkedLaundryRecordsForCleaning(record?.id || "").length;
        if (linkedLaundryCount > 0 || roundCurrency(record?.effectiveLaundryAmount ?? record?.laundryAmount) > 0) {
            return this.tr("actions.addMoreLaundry");
        }

        return this.tr("actions.addLaundry");
    }

    getCleaningLinkLabel(record) {
        return `${this.formatDate(record.date)} · ${record.propertyName || this.tr("labels.unknown")} · ${this.getCleaningCategoryLabel(record.categoryKey || record.category)}`;
    }

    getSuggestedCleaningRecord(propertyName, { excludeRecordId = "", categoryKey = "" } = {}) {
        const normalizedPropertyName = normalizeKey(propertyName);
        const normalizedCategoryKey = normalizeCleaningAhCategoryKey(categoryKey);
        if (!normalizedPropertyName) {
            return null;
        }

        return this.cleaningRecords.find((record) => {
            if (!record || (excludeRecordId && record.id === excludeRecordId)) {
                return false;
            }

            if (normalizeKey(record.propertyName) !== normalizedPropertyName) {
                return false;
            }

            if (
                normalizedCategoryKey
                && normalizeCleaningAhCategoryKey(record.categoryKey || record.category) !== normalizedCategoryKey
            ) {
                return false;
            }

            return toOptionalNumber(record.guestAmount) !== null;
        }) || null;
    }

    getSuggestedPropertyGuestCleaningFee(propertyName, { categoryKey = "" } = {}) {
        const normalizedPropertyName = normalizeKey(propertyName);
        const normalizedCategoryKey = normalizeCleaningAhCategoryKey(categoryKey);
        if (!normalizedPropertyName || normalizedCategoryKey !== CLEANING_AH_CATEGORY_KEYS.checkout) {
            return null;
        }

        const property = this.findPropertyByName(propertyName);
        const guestCleaningFee = toOptionalNumber(property?.guestCleaningFee);
        return guestCleaningFee === null ? null : roundCurrency(guestCleaningFee);
    }

    getSuggestedCleaningGuestAmount(propertyName, options = {}) {
        const propertyFee = this.getSuggestedPropertyGuestCleaningFee(propertyName, options);
        if (propertyFee !== null) {
            return propertyFee;
        }

        const record = this.getSuggestedCleaningRecord(propertyName, options);
        const guestAmount = toOptionalNumber(record?.guestAmount);
        return guestAmount === null ? null : roundCurrency(guestAmount);
    }

    getSuggestedCleaningGuestAmountInput(propertyName, options = {}) {
        const suggestion = this.getSuggestedCleaningGuestAmount(propertyName, options);
        return suggestion === null ? "" : toInputNumber(suggestion);
    }

    getCleaningGuestAmountFieldState(draft = {}, options = {}) {
        const explicitInputValue = String(draft?.guestAmount || "").trim();
        const suggestedInputValue = options.enableSuggestion === false
            ? ""
            : this.getSuggestedCleaningGuestAmountInput(draft?.propertyName, {
                ...options,
                categoryKey: draft?.categoryKey || draft?.category || options.categoryKey || ""
            });
        const inputValue = explicitInputValue || suggestedInputValue;

        return {
            explicitInputValue,
            suggestedInputValue,
            inputValue,
            numericValue: toOptionalNumber(inputValue)
        };
    }

    getFilteredCleaningRecords() {
        const search = normalizeKey(this.searchQuery);
        return this.cleaningRecords.filter((record) => {
            if (this.selectedMonthKey && record.monthKey !== this.selectedMonthKey) {
                return false;
            }
            if (this.selectedPropertyName && normalizeKey(record.propertyName) !== normalizeKey(this.selectedPropertyName)) {
                return false;
            }
            if (
                this.selectedCategory
                && normalizeCleaningAhCategoryKey(record.categoryKey || record.category) !== normalizeCleaningAhCategoryKey(this.selectedCategory)
            ) {
                return false;
            }
            if (!search) {
                return true;
            }

            const haystack = [
                record.date,
                record.propertyName,
                record.category,
                this.getCleaningReservationSource(record),
                record.notes,
                record.sourceMonthLabel
            ].map(normalizeKey).join(" ");
            return haystack.includes(search);
        });
    }

    getFilteredStandaloneLaundryRecords() {
        const search = normalizeKey(this.searchQuery);
        return this.laundryRecords.filter((record) => {
            if (this.selectedMonthKey && record.monthKey !== this.selectedMonthKey) {
                return false;
            }
            if (this.selectedPropertyName && normalizeKey(record.propertyName) !== normalizeKey(this.selectedPropertyName)) {
                return false;
            }
            if (!search) {
                return true;
            }

            const haystack = [
                record.date,
                record.propertyName,
                record.notes
            ].map(normalizeKey).join(" ");
            return haystack.includes(search);
        });
    }

    getFilteredSpecialCleaningRecords() {
        const search = normalizeKey(this.searchQuery);
        return this.specialCleaningRecords.filter((record) => {
            if (this.selectedMonthKey && record.monthKey !== this.selectedMonthKey) {
                return false;
            }
            if (this.selectedPropertyName && normalizeKey(record.propertyName) !== normalizeKey(this.selectedPropertyName)) {
                return false;
            }
            if (!search) {
                return true;
            }

            const haystack = [
                record.date,
                record.propertyName,
                record.specialType,
                this.getSpecialCleaningTypeLabel(record.specialType),
                record.cost,
                record.description,
                record.notes
            ].map(normalizeKey).join(" ");
            return haystack.includes(search);
        });
    }

    getVisibleLaundryRegisterEntries(entries = []) {
        return filterLaundryRegisterEntries(entries, {
            filter: this.laundryRegisterFilter,
            sort: this.laundryRegisterSort
        });
    }

    getVisibleCleaningRegisterEntries(entries = []) {
        return filterCleaningRegisterEntries(entries, {
            filter: this.cleaningRegisterFilter,
            sort: this.cleaningRegisterSort
        });
    }

    getCleaningRegisterFilterOptions() {
        return [
            ["all", this.tr("cleanings.registerFilters.all")],
            ["with-laundry", this.tr("cleanings.registerFilters.withLaundry")],
            ["waiting-laundry", this.tr("cleanings.registerFilters.waitingLaundry")]
        ];
    }

    getCleaningRegisterSortOptions() {
        return [
            ["date-desc", this.tr("cleanings.registerSortOptions.dateDesc")],
            ["date-asc", this.tr("cleanings.registerSortOptions.dateAsc")],
            ["property-asc", this.tr("cleanings.registerSortOptions.propertyAsc")],
            ["property-desc", this.tr("cleanings.registerSortOptions.propertyDesc")],
            ["guest-desc", this.tr("cleanings.registerSortOptions.guestDesc")],
            ["guest-asc", this.tr("cleanings.registerSortOptions.guestAsc")],
            ["net-desc", this.tr("cleanings.registerSortOptions.netDesc")],
            ["net-asc", this.tr("cleanings.registerSortOptions.netAsc")]
        ];
    }

    getLaundryRegisterFilterOptions() {
        return [
            ["all", this.tr("laundryTab.registerFilters.all")],
            ["linked", this.tr("laundryTab.registerFilters.linked")],
            ["unlinked", this.tr("laundryTab.registerFilters.unlinked")]
        ];
    }

    getLaundryRegisterSortOptions() {
        return [
            ["date-desc", this.tr("laundryTab.registerSortOptions.dateDesc")],
            ["date-asc", this.tr("laundryTab.registerSortOptions.dateAsc")],
            ["property-asc", this.tr("laundryTab.registerSortOptions.propertyAsc")],
            ["property-desc", this.tr("laundryTab.registerSortOptions.propertyDesc")],
            ["kg-desc", this.tr("laundryTab.registerSortOptions.kgDesc")],
            ["kg-asc", this.tr("laundryTab.registerSortOptions.kgAsc")],
            ["amount-desc", this.tr("laundryTab.registerSortOptions.amountDesc")],
            ["amount-asc", this.tr("laundryTab.registerSortOptions.amountAsc")]
        ];
    }

    getLaundryBatchPreview(draft = this.laundryBatchDraft) {
        const laundryRatePerKg = toOptionalNumber(draft?.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg;

        return (draft?.rows || []).reduce((summary, row) => {
            const propertyName = normalizeLabel(row?.propertyName);
            const kg = toOptionalNumber(row?.kg);
            if (!propertyName || kg === null || kg <= 0) {
                return summary;
            }

            const record = createStandaloneLaundryRecord({
                date: draft?.date,
                propertyName,
                kg,
                laundryRatePerKg
            });

            return {
                count: summary.count + 1,
                kg: roundCurrency(summary.kg + record.kg),
                amount: roundCurrency(summary.amount + record.amount),
                laundryRatePerKg
            };
        }, {
            count: 0,
            kg: 0,
            amount: 0,
            laundryRatePerKg
        });
    }

    getCleaningBatchPreview(draft = this.cleaningBatchDraft) {
        const categoryKey = this.getCleaningCategoryKey(draft?.categoryKey || draft?.category);
        const categoryLabel = this.getCleaningCategoryLabel(categoryKey);
        const reservationSource = this.categoryUsesReservationSource(categoryKey)
            ? (draft?.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
            : CLEANING_AH_RESERVATION_SOURCES.direct;

        return (draft?.rows || []).reduce((summary, row) => {
            const propertyName = normalizeLabel(row?.propertyName);
            const guestAmountField = this.getCleaningGuestAmountFieldState({
                ...row,
                categoryKey
            });
            if (!propertyName || guestAmountField.numericValue === null || guestAmountField.numericValue < 0) {
                return summary;
            }

            const record = createCleaningAhRecord({
                date: draft?.date,
                propertyName,
                categoryKey,
                category: categoryLabel,
                reservationSource,
                guestAmount: guestAmountField.numericValue,
                laundryKg: toOptionalNumber(row?.laundryKg) || 0
            });

            return {
                count: summary.count + 1,
                guestAmount: roundCurrency(summary.guestAmount + record.guestAmount),
                platformCommission: roundCurrency(summary.platformCommission + record.platformCommission),
                vatAmount: roundCurrency(summary.vatAmount + record.vatAmount),
                totalToAhWithoutLaundry: roundCurrency(summary.totalToAhWithoutLaundry + record.totalToAhWithoutLaundry),
                laundryAmount: roundCurrency(summary.laundryAmount + record.laundryAmount),
                totalToAh: roundCurrency(summary.totalToAh + record.totalToAh)
            };
        }, {
            count: 0,
            guestAmount: 0,
            platformCommission: 0,
            vatAmount: 0,
            totalToAhWithoutLaundry: 0,
            laundryAmount: 0,
            totalToAh: 0
        });
    }

    applySuggestedGuestAmountToInput(input, suggestedAmount) {
        if (!input) {
            return;
        }

        const currentValue = String(input.value || "").trim();
        const previousSuggestedValue = String(input.dataset.autoSuggestedValue || "").trim();
        const currentNumeric = toOptionalNumber(currentValue);
        const previousSuggestedNumeric = toOptionalNumber(previousSuggestedValue);
        const matchesPreviousSuggestion = currentNumeric !== null
            && previousSuggestedNumeric !== null
            && roundCurrency(currentNumeric) === roundCurrency(previousSuggestedNumeric);

        if (suggestedAmount === null) {
            if (!currentValue || matchesPreviousSuggestion) {
                input.value = "";
            }
            delete input.dataset.autoSuggestedValue;
            return;
        }

        const suggestedValue = toInputNumber(roundCurrency(suggestedAmount));
        if (!currentValue || matchesPreviousSuggestion) {
            input.value = suggestedValue;
        }
        input.dataset.autoSuggestedValue = suggestedValue;
    }

    applyCleaningSuggestionToSingleForm() {
        if (this.editingCleaningId) {
            return;
        }

        const form = document.getElementById("cleaning-ah-cleaning-form");
        const propertyInput = form?.querySelector('[name="propertyName"]');
        const guestAmountInput = form?.querySelector('[name="guestAmount"]');
        const categoryInput = form?.querySelector('[name="categoryKey"]');
        if (!propertyInput || !guestAmountInput) {
            return;
        }

        const suggestion = this.getSuggestedCleaningGuestAmount(propertyInput.value, {
            categoryKey: categoryInput?.value || ""
        });
        this.applySuggestedGuestAmountToInput(guestAmountInput, suggestion);
    }

    applyCleaningSuggestionToBatchRow(rowElement) {
        const propertyInput = rowElement?.querySelector('[name="propertyName"]');
        const guestAmountInput = rowElement?.querySelector('[name="guestAmount"]');
        const categoryInput = document.querySelector('#cleaning-ah-cleaning-batch-form [name="categoryKey"]');
        if (!propertyInput || !guestAmountInput) {
            return;
        }

        const suggestion = this.getSuggestedCleaningGuestAmount(propertyInput.value, {
            categoryKey: categoryInput?.value || ""
        });
        this.applySuggestedGuestAmountToInput(guestAmountInput, suggestion);
    }

    renderCleaningEntryModeSwitcher() {
        if (this.editingCleaningId) {
            return "";
        }

        const modes = [
            ["single", this.tr("cleanings.entryModes.single")],
            ["batch", this.tr("cleanings.entryModes.batch")]
        ];

        return `
            <div class="mt-4 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                ${modes.map(([mode, label]) => `
                    <button
                        type="button"
                        data-cleaning-entry-mode="${mode}"
                        class="rounded-full px-3 py-1.5 text-sm font-medium transition ${this.cleaningEntryMode === mode ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"}"
                    >${escapeHtml(label)}</button>
                `).join("")}
            </div>
        `;
    }

    renderLaundryEntryModeSwitcher() {
        if (this.editingLaundryId) {
            return "";
        }

        const modes = [
            ["single", this.tr("laundryTab.entryModes.single")],
            ["batch", this.tr("laundryTab.entryModes.batch")]
        ];

        return `
            <div class="mt-4 inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
                ${modes.map(([mode, label]) => `
                    <button
                        type="button"
                        data-laundry-entry-mode="${mode}"
                        class="rounded-full px-3 py-1.5 text-sm font-medium transition ${this.laundryEntryMode === mode ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"}"
                    >${escapeHtml(label)}</button>
                `).join("")}
            </div>
        `;
    }

    render() {
        const root = document.getElementById("cleaning-ah-root");
        if (!root) return;

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
                    <div class="max-w-2xl">
                        <div class="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">${escapeHtml(this.tr("header.restrictedKicker"))}</div>
                        <h2 class="mt-3 text-2xl font-semibold text-slate-900">${escapeHtml(this.tr("header.restrictedTitle"))}</h2>
                        <p class="mt-3 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("header.restrictedBody"))}</p>
                    </div>
                </section>
            `;
            return;
        }

        const filteredCleanings = this.getFilteredCleaningRecords();
        const filteredStandaloneLaundry = this.getFilteredStandaloneLaundryRecords();
        const visibleSpecialCleaningEntries = this.getFilteredSpecialCleaningRecords();
        const cleaningSummary = summarizeCleaningAhRecords(filteredCleanings, filteredStandaloneLaundry);
        const derivedCleanings = cleaningSummary.records;
        const visibleCleaningRegisterEntries = this.getVisibleCleaningRegisterEntries(derivedCleanings);
        const laundrySummary = summarizeLaundryRecords(filteredCleanings, filteredStandaloneLaundry);
        const visibleLaundryRegisterEntries = this.getVisibleLaundryRegisterEntries(laundrySummary.entries);
        const statsCategoryOptions = this.getStatsCategoryOptions(cleaningSummary);
        if (
            this.statsCategoryKey
            && !statsCategoryOptions.some((entry) => entry.key === this.statsCategoryKey)
        ) {
            this.statsCategoryKey = "";
        }
        const statsScopedCleanings = this.getStatsScopedCleaningRecords(derivedCleanings, this.statsCategoryKey);
        const statsCleaningSummary = summarizeCleaningAhRecords(statsScopedCleanings, filteredStandaloneLaundry);
        const statsPropertyRows = sortCleaningAhPropertyRows(
            summarizeCleaningAhPropertyRows(statsCleaningSummary.records),
            this.statsPropertySort
        );
        const selectedStatsPropertyName = this.getStatsSelectedPropertyName(statsPropertyRows);
        const selectedStatsPropertyDetail = summarizeCleaningAhPropertyDetail(statsCleaningSummary.records, selectedStatsPropertyName);

        root.innerHTML = `
            ${this.renderStatusMessage()}
            <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">${escapeHtml(this.tr("formula.kicker"))}</div>
                    <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("formula.title"))}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("formula.body"))}</p>
                    ${this.activeTab === "stats" ? this.renderStatsHelpDisclosure() : ""}
                </div>
                <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    ${this.renderMetricCard(this.tr("metrics.checkOuts"), String(cleaningSummary.totals.count), "compact")}
                    ${this.renderMetricCard(this.tr("metrics.guestTotal"), this.formatCurrency(cleaningSummary.totals.guestAmount), "compact")}
                    ${this.renderMetricCard(this.tr("metrics.platformFees"), this.formatCurrency(cleaningSummary.totals.platformCommission), "compact")}
                    ${this.renderMetricCard(this.tr("metrics.vat"), this.formatCurrency(cleaningSummary.totals.vatAmount), "compact")}
                    ${this.renderMetricCard(this.tr("metrics.laundry"), this.formatCurrency(cleaningSummary.totals.laundryAmount), "compact")}
                    ${this.renderMetricCard(this.tr("metrics.netToAh"), this.formatCurrency(cleaningSummary.totals.totalToAh), "compact")}
                </div>
            </section>

            ${this.renderFilters()}
            ${this.renderTabBar()}
            ${this.renderActiveTab(
                visibleCleaningRegisterEntries,
                filteredStandaloneLaundry,
                statsCleaningSummary,
                laundrySummary,
                visibleLaundryRegisterEntries,
                visibleSpecialCleaningEntries,
                statsPropertyRows,
                statsCategoryOptions,
                selectedStatsPropertyName,
                selectedStatsPropertyDetail
            )}
            <datalist id="cleaning-ah-property-options">${this.getKnownPropertyNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
        `;

        this.bindUiEvents();
        this.updateCleaningPreview();
        this.updateCleaningBatchPreview();
        this.updateLaundryPreview();
        this.updateLaundryBatchPreview();
    }

    renderStatusMessage() {
        if (!this.statusMessage) {
            return "";
        }

        const toneClasses = {
            info: "border-sky-200 bg-sky-50 text-sky-900",
            success: "border-emerald-200 bg-emerald-50 text-emerald-900",
            error: "border-rose-200 bg-rose-50 text-rose-900"
        };

        return `
            <section class="rounded-2xl border px-4 py-3 text-sm ${toneClasses[this.statusTone] || toneClasses.info}">
                ${escapeHtml(this.statusMessage)}
            </section>
        `;
    }

    renderMetricCard(label, value, size = "default") {
        const sizeClasses = {
            default: {
                article: "px-4 py-3 min-h-[72px]",
                label: "text-sm leading-5",
                value: "text-lg"
            },
            compact: {
                article: "px-4 py-2.5 min-h-[60px]",
                label: "text-sm leading-5",
                value: "text-base sm:text-lg"
            }
        };
        const selectedSize = sizeClasses[size] || sizeClasses.default;

        return `
            <article class="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 ${selectedSize.article}">
                <div class="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <div class="min-w-0 font-medium text-slate-500 ${selectedSize.label}">${escapeHtml(label)}</div>
                    <div class="text-right font-semibold leading-none text-slate-900 tabular-nums whitespace-nowrap ${selectedSize.value}">${escapeHtml(value)}</div>
                </div>
            </article>
        `;
    }

    renderPreviewMetricCard(label, value, tone = "default") {
        const toneClasses = {
            default: "border-slate-200 bg-white",
            emphasis: "border-sky-200 bg-sky-50"
        };

        return `
            <article class="min-w-0 rounded-2xl border px-4 py-3 min-h-[72px] ${toneClasses[tone] || toneClasses.default}">
                <div class="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <div class="min-w-0 text-sm font-medium leading-5 text-slate-500">${escapeHtml(label)}</div>
                    <div class="text-right text-lg font-semibold leading-none text-slate-900 tabular-nums whitespace-nowrap">${escapeHtml(value)}</div>
                </div>
            </article>
        `;
    }

    renderTableActionButton({
        action,
        id,
        label,
        iconClass,
        tone = "default"
    }) {
        const toneClasses = {
            default: "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
            primary: "border-sky-200 bg-sky-50 text-sky-600 hover:border-sky-300 hover:bg-sky-100 hover:text-sky-800",
            accent: "border-indigo-200 bg-indigo-50 text-indigo-600 hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800",
            danger: "border-rose-200 bg-rose-50 text-rose-600 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800"
        };

        return `
            <button
                type="button"
                data-action="${escapeHtml(action)}"
                data-id="${escapeHtml(id || "")}"
                class="inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm transition ${toneClasses[tone] || toneClasses.default}"
                aria-label="${escapeHtml(label)}"
                title="${escapeHtml(label)}"
            >
                <i class="${escapeHtml(iconClass)}" aria-hidden="true"></i>
            </button>
        `;
    }

    renderFilters() {
        const monthOptions = this.getMonthOptions()
            .map((monthKey) => `<option value="${monthKey}" ${monthKey === this.selectedMonthKey ? "selected" : ""}>${this.formatMonthKey(monthKey)}</option>`)
            .join("");
        const propertyOptions = this.getFilterPropertyNames()
            .map((propertyName) => `<option value="${escapeHtml(propertyName)}" ${normalizeKey(propertyName) === normalizeKey(this.selectedPropertyName) ? "selected" : ""}>${escapeHtml(propertyName)}</option>`)
            .join("");
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === this.selectedCategory ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
            .join("");

        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("filters.search"))}</span>
                        <input id="cleaning-ah-search" type="search" class="mt-2 w-full" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}">
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("filters.month"))}</span>
                        <select id="cleaning-ah-month-filter" class="mt-2 w-full">
                            <option value="">${escapeHtml(this.tr("filters.allMonths"))}</option>
                            ${monthOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("filters.property"))}</span>
                        <select id="cleaning-ah-property-filter" class="mt-2 w-full">
                            <option value="">${escapeHtml(this.tr("filters.allProperties"))}</option>
                            ${propertyOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("filters.category"))}</span>
                        <select id="cleaning-ah-category-filter" class="mt-2 w-full">
                            <option value="">${escapeHtml(this.tr("filters.allCategories"))}</option>
                            ${categoryOptions}
                        </select>
                    </label>
                </div>
            </section>
        `;
    }

    renderTabBar() {
        const tabs = [
            ["stats", this.tr("tabs.stats")],
            ["cleanings", this.tr("tabs.cleanings")],
            ["laundry", this.tr("tabs.laundry")],
            ["special-cleanings", this.tr("tabs.specialCleanings")]
        ];

        return `
            <nav class="flex flex-wrap gap-2" aria-label="${escapeHtml(this.tr("tabs.ariaLabel"))}">
                ${tabs.map(([key, label]) => `
                    <button
                        type="button"
                        data-tab="${key}"
                        class="view-btn ${this.activeTab === key ? "active" : ""}"
                    >${escapeHtml(label)}</button>
                `).join("")}
            </nav>
        `;
    }

    renderActiveTab(
        visibleCleaningRegisterEntries,
        filteredStandaloneLaundry,
        cleaningSummary,
        laundrySummary,
        visibleLaundryRegisterEntries,
        visibleSpecialCleaningEntries,
        statsPropertyRows,
        statsCategoryOptions,
        selectedStatsPropertyName,
        selectedStatsPropertyDetail
    ) {
        if (this.activeTab === "cleanings") {
            return this.renderCleaningsTab(visibleCleaningRegisterEntries);
        }

        if (this.activeTab === "laundry") {
            return this.renderLaundryTab(filteredStandaloneLaundry, laundrySummary, visibleLaundryRegisterEntries);
        }

        if (this.activeTab === "special-cleanings") {
            return this.renderSpecialCleaningsTab(visibleSpecialCleaningEntries);
        }

        return this.renderStatsTab(
            cleaningSummary,
            statsPropertyRows,
            statsCategoryOptions,
            selectedStatsPropertyName,
            selectedStatsPropertyDetail
        );
    }

    renderStatsTab(cleaningSummary, statsPropertyRows, statsCategoryOptions, selectedStatsPropertyName, selectedStatsPropertyDetail) {
        return `
            <section class="space-y-6">
                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("dashboard.overviewKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("dashboard.overviewTitle"))}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("stats.overviewDescription"))}</p>
                        </div>
                        <div class="text-sm text-slate-500">${escapeHtml(this.getRecordsLabel(cleaningSummary.totals.count))}</div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-2">
                        ${this.renderStatsCategorySwitcher(statsCategoryOptions)}
                    </div>
                    <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                        ${this.renderMetricCard(this.tr("metrics.platformFees"), this.formatCurrency(cleaningSummary.totals.platformCommission))}
                        ${this.renderMetricCard(this.tr("metrics.vat"), this.formatCurrency(cleaningSummary.totals.vatAmount))}
                        ${this.renderMetricCard(this.tr("metrics.ahBeforeLaundry"), this.formatCurrency(cleaningSummary.totals.totalToAhWithoutLaundry))}
                        ${this.renderMetricCard(this.tr("metrics.avgNetPerCleaning"), this.formatCurrency(cleaningSummary.totals.averageTotalToAh))}
                        ${this.renderMetricCard(this.tr("metrics.avgKgPerCleaning"), this.formatNumber(cleaningSummary.totals.averageLaundryKgPerCleaning))}
                    </div>
                </section>
                <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[1.3fr_0.95fr]">
                    ${this.renderStatsComparisonBlock(statsPropertyRows, selectedStatsPropertyName)}
                    ${this.renderStatsPropertyFocus(selectedStatsPropertyDetail)}
                </section>
                <section class="grid grid-cols-1 gap-6 2xl:grid-cols-2">
                    ${this.renderFinancialSummaryTable(this.tr("stats.byMonth"), cleaningSummary.byMonth, [
                            [this.tr("tables.month"), (entry) => this.formatMonthKey(entry.label)],
                            [this.tr("tables.count"), (entry) => String(entry.count)],
                            [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                            [this.tr("tables.laundry"), (entry) => this.formatCurrency(entry.laundryAmount)],
                            [this.tr("tables.avgKg"), (entry) => this.formatNumber(entry.averageLaundryKgPerCleaning)],
                            [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                        ])}
                    ${this.renderFinancialSummaryTable(this.tr("stats.categories"), cleaningSummary.byCategory.slice(0, 8), [
                            [this.tr("tables.category"), (entry) => this.getCleaningCategoryLabel(entry.key || entry.label)],
                            [this.tr("tables.count"), (entry) => String(entry.count)],
                            [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                            [this.tr("tables.laundry"), (entry) => this.formatCurrency(entry.laundryAmount)],
                            [this.tr("tables.avgKg"), (entry) => this.formatNumber(entry.averageLaundryKgPerCleaning)],
                            [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                        ])}
                </section>
            </section>
        `;
    }

    renderStatsComparisonBlock(statsPropertyRows, selectedStatsPropertyName) {
        const sortOptions = this.getStatsPropertySortOptions()
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === this.statsPropertySort ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");
        const selectedPropertyOptions = statsPropertyRows
            .map((entry) => `<option value="${escapeHtml(entry.label)}" ${normalizeKey(entry.label) === normalizeKey(selectedStatsPropertyName) ? "selected" : ""}>${escapeHtml(entry.label)}</option>`)
            .join("");

        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">${escapeHtml(this.tr("stats.compareKicker"))}</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("stats.compareTitle"))}</h3>
                        <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("stats.compareDescription"))}</p>
                    </div>
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:min-w-[28rem]">
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.sortLabel"))}</span>
                            <select id="cleaning-ah-stats-property-sort" class="mt-2 w-full">
                                ${sortOptions}
                            </select>
                        </label>
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.focusLabel"))}</span>
                            <select id="cleaning-ah-stats-selected-property" class="mt-2 w-full" ${statsPropertyRows.length ? "" : "disabled"}>
                                ${selectedPropertyOptions}
                            </select>
                        </label>
                    </div>
                </div>
                <div class="mt-5 overflow-x-auto">
                    ${this.renderStatsComparisonTable(statsPropertyRows, selectedStatsPropertyName)}
                </div>
            </section>
        `;
    }

    renderStatsCategorySwitcher(options = []) {
        return options.map((entry) => `
            <button
                type="button"
                data-stats-category="${escapeHtml(entry.key)}"
                class="view-btn ${entry.key === this.statsCategoryKey ? "active" : ""}"
                title="${escapeHtml(this.getStatsCategoryHelpText(entry.key))}"
                aria-label="${escapeHtml(`${entry.label}: ${this.getStatsCategoryHelpText(entry.key)}`)}"
            >${escapeHtml(entry.label)} (${escapeHtml(String(entry.count || 0))})</button>
        `).join("");
    }

    getStatsCategoryHelpText(categoryKey = "") {
        if (!categoryKey) {
            return this.tr("stats.allTypesRule");
        }

        return this.getCleaningCategoryRuleText(categoryKey);
    }

    getStatsHelpSummaryText() {
        const parts = [
            this.tr("stats.helpDescription"),
            this.tr("stats.workflow.step1"),
            this.tr("stats.workflow.step2"),
            this.tr("stats.workflow.step3")
        ].filter(Boolean);

        return parts.join(" ");
    }

    renderStatsHelpDisclosure() {
        const metricItems = [
            ["platformFees", this.tr("stats.metricHelp.platformFees")],
            ["vat", this.tr("stats.metricHelp.vat")],
            ["ahBeforeLaundry", this.tr("stats.metricHelp.ahBeforeLaundry")],
            ["avgNetPerCleaning", this.tr("stats.metricHelp.avgNetPerCleaning")],
            ["avgKgPerCleaning", this.tr("stats.metricHelp.avgKgPerCleaning")]
        ];
        const categoryItems = [
            {
                label: this.tr("stats.allCleaningTypes"),
                description: this.tr("stats.allTypesRule")
            },
            ...this.getCleaningCategoryDefinitions().map((entry) => ({
                label: entry.label,
                description: this.getCleaningCategoryRuleText(entry.key)
            }))
        ];

        return `
            <details class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <summary class="cursor-pointer list-none text-sm font-semibold text-sky-700">
                    ${escapeHtml(this.tr("stats.helpTitle"))}
                </summary>
                <div class="mt-3 space-y-4 text-sm text-slate-600">
                    <p>${escapeHtml(this.tr("stats.helpDescription"))}</p>
                    <section>
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.workflowTitle"))}</div>
                        <ul class="mt-2 space-y-2">
                            <li>${escapeHtml(this.tr("stats.workflow.step1"))}</li>
                            <li>${escapeHtml(this.tr("stats.workflow.step2"))}</li>
                            <li>${escapeHtml(this.tr("stats.workflow.step3"))}</li>
                        </ul>
                    </section>
                    <section>
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.metricHelpTitle"))}</div>
                        <div class="mt-2 space-y-2">
                            ${metricItems.map(([metricKey, description]) => `
                                <p><span class="font-semibold text-slate-900">${escapeHtml(this.tr(`metrics.${metricKey}`))}:</span> ${escapeHtml(description)}</p>
                            `).join("")}
                        </div>
                    </section>
                    <section>
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.categoryRulesTitle"))}</div>
                        <div class="mt-2 space-y-2">
                            ${categoryItems.map((entry) => `
                                <p><span class="font-semibold text-slate-900">${escapeHtml(entry.label)}:</span> ${escapeHtml(entry.description)}</p>
                            `).join("")}
                        </div>
                    </section>
                </div>
            </details>
        `;
    }

    renderStatsComparisonTable(statsPropertyRows, selectedStatsPropertyName) {
        if (!statsPropertyRows.length) {
            return `<p class="text-sm text-slate-500">${escapeHtml(this.tr("stats.empty"))}</p>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.property"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.count"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.amount"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.laundry"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.kg"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.avgKg"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.net"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.avgNet"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.lastEntry"))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${statsPropertyRows.map((entry) => {
                        const isSelected = normalizeKey(entry.label) === normalizeKey(selectedStatsPropertyName);
                        return `
                            <tr class="border-b border-slate-100 ${isSelected ? "bg-sky-50" : ""}">
                                <td class="px-3 py-3 align-top text-sm">
                                    <button
                                        type="button"
                                        data-action="select-stats-property"
                                        data-property-name="${escapeHtml(entry.label)}"
                                        class="block w-full text-left font-semibold text-slate-900 hover:text-sky-700"
                                    >${escapeHtml(entry.label)}</button>
                                </td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(String(entry.count))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.guestAmount))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.laundryAmount))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatNumber(entry.laundryKg))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatNumber(entry.averageLaundryKgPerCleaning))}</td>
                                <td class="px-3 py-3 text-sm font-medium text-slate-900">${escapeHtml(this.formatCurrency(entry.totalToAh))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.averageTotalToAh))}</td>
                                <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(entry.lastEntryDate ? this.formatDate(entry.lastEntryDate) : "—")}</td>
                            </tr>
                        `;
                    }).join("")}
                </tbody>
            </table>
        `;
    }

    renderStatsPropertyFocus(detail) {
        if (!detail) {
            return `
                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("stats.focusKicker"))}</div>
                    <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("stats.focusTitle"))}</h3>
                    <p class="mt-3 text-sm text-slate-500">${escapeHtml(this.tr("stats.focusEmpty"))}</p>
                </section>
            `;
        }

        return `
            <section class="space-y-6">
                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">${escapeHtml(this.tr("stats.focusKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(detail.propertyName)}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("stats.focusDescription"))}</p>
                        </div>
                        <div class="text-sm text-slate-500">${escapeHtml(this.getRecordsLabel(detail.totals.count))}</div>
                    </div>
                    <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        ${this.renderMetricCard(this.tr("metrics.guestTotal"), this.formatCurrency(detail.totals.guestAmount))}
                        ${this.renderMetricCard(this.tr("metrics.netToAh"), this.formatCurrency(detail.totals.totalToAh))}
                        ${this.renderMetricCard(this.tr("metrics.avgNetPerCleaning"), this.formatCurrency(detail.totals.averageTotalToAh))}
                        ${this.renderMetricCard(this.tr("metrics.laundry"), this.formatCurrency(detail.totals.laundryAmount))}
                        ${this.renderMetricCard(this.tr("metrics.laundryKg"), this.formatNumber(detail.totals.laundryKg))}
                        ${this.renderMetricCard(this.tr("metrics.avgKgPerCleaning"), this.formatNumber(detail.totals.averageLaundryKgPerCleaning))}
                        ${this.renderMetricCard(this.tr("metrics.lastEntry"), detail.totals.lastEntryDate ? this.formatDate(detail.totals.lastEntryDate) : "—")}
                    </div>
                </section>
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByMonth"), detail.byMonth, [
                    [this.tr("tables.month"), (entry) => this.formatMonthKey(entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.laundry"), (entry) => this.formatCurrency(entry.laundryAmount)],
                    [this.tr("tables.avgKg"), (entry) => this.formatNumber(entry.averageLaundryKgPerCleaning)],
                    [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByCategory"), detail.byCategory, [
                    [this.tr("tables.category"), (entry) => this.getCleaningCategoryLabel(entry.key || entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                    [this.tr("tables.avgKg"), (entry) => this.formatNumber(entry.averageLaundryKgPerCleaning)],
                    [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByReservation"), detail.byReservationSource, [
                    [this.tr("tables.reservation"), (entry) => this.getReservationSourceLabel(entry.key || entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                    [this.tr("tables.avgKg"), (entry) => this.formatNumber(entry.averageLaundryKgPerCleaning)],
                    [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                ])}
                ${this.renderStatsRecentEntries(detail.recentEntries)}
            </section>
        `;
    }

    renderStatsRecentEntries(entries = []) {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(this.tr("stats.recentEntries"))}</h3>
                    <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(Math.min(entries.length, 6)))}</div>
                </div>
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-left">
                        <thead>
                            <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.date"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.category"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.reservation"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.amount"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.laundry"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.net"))}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${entries.length
                                ? entries.slice(0, 6).map((entry) => `
                                    <tr class="border-b border-slate-100">
                                        <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatDate(entry.date))}</td>
                                        <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.getCleaningCategoryLabel(entry.categoryKey || entry.category))}</td>
                                        <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.getReservationSourceLabel(this.getCleaningReservationSource(entry)))}</td>
                                        <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.guestAmount))}</td>
                                        <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.effectiveLaundryAmount ?? entry.laundryAmount))}</td>
                                        <td class="px-3 py-3 text-sm font-medium text-slate-900">${escapeHtml(this.formatCurrency(entry.effectiveTotalToAh ?? entry.totalToAh))}</td>
                                    </tr>
                                `).join("")
                                : `<tr><td colspan="6" class="px-3 py-4 text-sm text-slate-500">${escapeHtml(this.tr("tables.noData"))}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    renderCleaningsTab(filteredCleanings) {
        const draft = this.cleaningDraft;
        const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
        const categoryLabel = this.getCleaningCategoryLabel(categoryKey);
        const isBatchMode = !this.editingCleaningId && this.cleaningEntryMode === "batch";
        const guestAmountField = this.getCleaningGuestAmountFieldState(draft, {
            enableSuggestion: !this.editingCleaningId,
            excludeRecordId: this.editingCleaningId || "",
            categoryKey
        });
        const previewRecord = createCleaningAhRecord({
            date: draft.date,
            propertyName: draft.propertyName,
            categoryKey,
            category: categoryLabel,
            reservationSource: this.categoryUsesReservationSource(categoryKey)
                ? (draft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                : CLEANING_AH_RESERVATION_SOURCES.direct,
            guestAmount: guestAmountField.numericValue || 0,
            laundryKg: toOptionalNumber(draft.laundryKg) || 0,
            notes: draft.notes
        });
        const batchPreview = this.getCleaningBatchPreview();

        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(26rem,0.95fr)_minmax(0,1.35fr)]">
                <div class="space-y-6">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">${escapeHtml(this.tr("cleanings.entryKicker"))}</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.editingCleaningId ? this.tr("cleanings.editTitle") : isBatchMode ? this.tr("cleanings.batchTitle") : this.tr("cleanings.addTitle"))}</h3>
                                <p class="mt-2 text-sm text-slate-600">${escapeHtml(isBatchMode ? this.tr("cleanings.batchDescription") : this.tr("cleanings.description"))}</p>
                                ${this.renderCleaningEntryModeSwitcher()}
                            </div>
                            <div class="flex flex-wrap gap-3 xl:justify-end">
                                ${this.editingCleaningId ? `<button type="button" id="cleaning-ah-cancel-cleaning-edit" class="view-btn">${escapeHtml(this.tr("actions.cancelEdit"))}</button>` : ""}
                                <button type="submit" form="${isBatchMode ? "cleaning-ah-cleaning-batch-form" : "cleaning-ah-cleaning-form"}" class="view-btn active">${escapeHtml(this.editingCleaningId ? this.tr("actions.saveChanges") : isBatchMode ? this.tr("actions.saveCleaningBatch") : this.tr("actions.saveCleaning"))}</button>
                                <button type="button" id="${isBatchMode ? "cleaning-ah-reset-cleaning-batch-form" : "cleaning-ah-reset-cleaning-form"}" class="view-btn">${escapeHtml(this.tr("actions.reset"))}</button>
                            </div>
                        </div>
                        ${isBatchMode
                            ? this.renderCleaningBatchForm(batchPreview)
                            : this.renderCleaningSingleForm({
                                draft,
                                preview: previewRecord,
                                guestAmountField
                            })}
                    </section>
                    ${this.renderImportBlock()}
                </div>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("cleanings.storedKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("cleanings.storedTitle"))}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("cleanings.storedDescription"))}</p>
                        </div>
                        <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(filteredCleanings.length))}</div>
                    </div>
                    ${this.renderCleaningRegisterControls()}
                    <div class="mt-5 overflow-x-auto">
                        ${this.renderCleaningsTable(filteredCleanings)}
                    </div>
                </section>
            </section>
        `;
    }

    renderCleaningSingleForm({ draft, preview, guestAmountField }) {
        const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === categoryKey ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
            .join("");
        const reservationSourceOptions = [
            [CLEANING_AH_RESERVATION_SOURCES.platform, this.tr("reservationSources.platform")],
            [CLEANING_AH_RESERVATION_SOURCES.direct, this.tr("reservationSources.direct")]
        ];

        return `
            <form id="cleaning-ah-cleaning-form" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.date"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.property"))}</span>
                        <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.category"))}</span>
                        <select name="categoryKey" class="mt-1 w-full">
                            ${categoryOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.reservationSource"))}</span>
                        <select name="reservationSource" class="mt-1 w-full" ${this.categoryUsesReservationSource(categoryKey) ? "" : "disabled"}>
                            ${reservationSourceOptions.map(([value, label]) => `
                                <option value="${escapeHtml(value)}" ${draft.reservationSource === value ? "selected" : ""}>${escapeHtml(label)}</option>
                            `).join("")}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</span>
                        <input type="number" name="guestAmount" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(guestAmountField.inputValue)}" data-auto-suggested-value="${escapeHtml(guestAmountField.suggestedInputValue)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.kg"))}</span>
                        <input type="number" name="laundryKg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.laundryKg))}" placeholder="0">
                    </label>
                </div>
                <label class="block">
                    <span class="text-sm text-slate-600">${escapeHtml(t("common.notes"))}</span>
                    <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                </label>
                <p class="text-sm text-slate-500">${escapeHtml(this.getCleaningCategoryRuleText(categoryKey))}</p>
                <div id="cleaning-ah-cleaning-preview">
                    ${this.renderCleaningPreview(preview)}
                </div>
            </form>
        `;
    }

    renderCleaningBatchForm(preview) {
        const rows = this.cleaningBatchDraft.rows.length
            ? this.cleaningBatchDraft.rows
            : [this.createCleaningBatchRow()];
        const categoryKey = this.getCleaningCategoryKey(this.cleaningBatchDraft.categoryKey || this.cleaningBatchDraft.category);
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === categoryKey ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
            .join("");
        const reservationSourceOptions = [
            [CLEANING_AH_RESERVATION_SOURCES.platform, this.tr("reservationSources.platform")],
            [CLEANING_AH_RESERVATION_SOURCES.direct, this.tr("reservationSources.direct")]
        ];

        return `
            <form id="cleaning-ah-cleaning-batch-form" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("cleanings.batchDate"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(this.cleaningBatchDraft.date)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("cleanings.batchCategory"))}</span>
                        <select name="categoryKey" class="mt-1 w-full">
                            ${categoryOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.reservationSource"))}</span>
                        <select name="reservationSource" class="mt-1 w-full" ${this.categoryUsesReservationSource(categoryKey) ? "" : "disabled"}>
                            ${reservationSourceOptions.map(([value, label]) => `
                                <option value="${escapeHtml(value)}" ${this.cleaningBatchDraft.reservationSource === value ? "selected" : ""}>${escapeHtml(label)}</option>
                            `).join("")}
                        </select>
                    </label>
                </div>
                <div class="rounded-2xl border border-slate-200">
                    <div class="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.35fr)_140px_110px_minmax(0,1fr)_auto] md:gap-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.property"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.kg"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(t("common.notes"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 text-right">${escapeHtml(this.tr("tables.actions"))}</div>
                    </div>
                    <div class="divide-y divide-slate-200">
                        ${rows.map((row, index) => {
                            const guestAmountField = this.getCleaningGuestAmountFieldState({
                                ...row,
                                categoryKey
                            });
                            return `
                                <div class="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.35fr)_140px_110px_minmax(0,1fr)_auto] md:items-start" data-cleaning-batch-row="${escapeHtml(row.rowId)}">
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(this.tr("forms.property"))} ${index + 1}</span>
                                        <input type="text" name="propertyName" class="w-full" value="${escapeHtml(row.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}">
                                    </label>
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</span>
                                        <input type="number" name="guestAmount" class="w-full" step="0.01" min="0" value="${escapeHtml(guestAmountField.inputValue)}" data-auto-suggested-value="${escapeHtml(guestAmountField.suggestedInputValue)}" placeholder="0">
                                    </label>
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(this.tr("forms.kg"))}</span>
                                        <input type="number" name="laundryKg" class="w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(row.laundryKg))}" placeholder="0">
                                    </label>
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(t("common.notes"))}</span>
                                        <input type="text" name="notes" class="w-full" value="${escapeHtml(row.notes)}" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">
                                    </label>
                                    <div class="flex items-center justify-end md:pt-0.5">
                                        <button type="button" data-action="remove-cleaning-batch-row" data-row-id="${escapeHtml(row.rowId)}" class="text-sm text-rose-600 hover:text-rose-800">${escapeHtml(this.tr("actions.removeRow"))}</button>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm text-slate-500">${escapeHtml(this.getCleaningCategoryRuleText(categoryKey))}</p>
                    <button type="button" id="cleaning-ah-add-cleaning-batch-row" class="view-btn">${escapeHtml(this.tr("actions.addRow"))}</button>
                </div>
                <div id="cleaning-ah-cleaning-batch-preview">
                    ${this.renderCleaningBatchPreview(preview)}
                </div>
            </form>
        `;
    }

    renderLaundryTab(filteredStandaloneLaundry, laundrySummary, visibleLaundryRegisterEntries) {
        const draft = this.laundryDraft;
        const isBatchMode = !this.editingLaundryId && this.laundryEntryMode === "batch";
        const linkedCleaning = this.cleaningRecords.find((entry) => entry.id === draft.linkedCleaningId) || null;
        const singlePreview = createStandaloneLaundryRecord({
            date: draft.date,
            propertyName: linkedCleaning?.propertyName || draft.propertyName,
            linkedCleaningId: draft.linkedCleaningId,
            kg: toOptionalNumber(draft.kg) || 0,
            laundryRatePerKg: toOptionalNumber(draft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg,
            notes: draft.notes
        });
        const batchPreview = this.getLaundryBatchPreview();
        const linkOptions = this.getLaundryLinkOptions(draft.linkedCleaningId, linkedCleaning?.propertyName || draft.propertyName)
            .map((record) => `<option value="${escapeHtml(record.id || "")}" ${record.id === draft.linkedCleaningId ? "selected" : ""}>${escapeHtml(this.getCleaningLinkLabel(record))}</option>`)
            .join("");

        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(26rem,0.95fr)_minmax(0,1.35fr)]">
                <div class="space-y-6">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">${escapeHtml(this.tr("laundryTab.entryKicker"))}</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.editingLaundryId ? this.tr("laundryTab.editTitle") : isBatchMode ? this.tr("laundryTab.batchTitle") : this.tr("laundryTab.addTitle"))}</h3>
                                <p class="mt-2 text-sm text-slate-600">${escapeHtml(isBatchMode ? this.tr("laundryTab.batchDescription") : this.tr("laundryTab.description"))}</p>
                                <p class="mt-1 text-xs font-medium text-amber-700">${escapeHtml(this.tr("laundryTab.vatNote"))}</p>
                                ${this.renderLaundryEntryModeSwitcher()}
                            </div>
                            <div class="flex flex-wrap gap-3 xl:justify-end">
                                ${this.editingLaundryId ? `<button type="button" id="cleaning-ah-cancel-laundry-edit" class="view-btn">${escapeHtml(this.tr("actions.cancelEdit"))}</button>` : ""}
                                <button type="submit" form="${isBatchMode ? "cleaning-ah-laundry-batch-form" : "cleaning-ah-laundry-form"}" class="view-btn active">${escapeHtml(this.editingLaundryId ? this.tr("actions.saveChanges") : isBatchMode ? this.tr("actions.saveLaundryBatch") : this.tr("actions.saveLaundry"))}</button>
                                <button type="button" id="${isBatchMode ? "cleaning-ah-reset-laundry-batch-form" : "cleaning-ah-reset-laundry-form"}" class="view-btn">${escapeHtml(this.tr("actions.reset"))}</button>
                            </div>
                        </div>
                        ${isBatchMode
                            ? this.renderLaundryBatchForm(batchPreview)
                            : this.renderLaundrySingleForm({
                                draft,
                                linkedCleaning,
                                linkOptions,
                                preview: singlePreview
                            })}
                    </section>
                    ${this.renderLaundrySummaryBlock(laundrySummary)}
                </div>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("laundryTab.activityKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("laundryTab.activityTitle"))}</h3>
                        </div>
                        <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(visibleLaundryRegisterEntries.length))}</div>
                    </div>
                    ${this.renderLaundryRegisterControls()}
                    <div class="mt-5 overflow-x-auto">
                        ${this.renderLaundryTable(visibleLaundryRegisterEntries)}
                    </div>
                </section>
            </section>
        `;
    }

    renderLaundrySingleForm({ draft, linkedCleaning, linkOptions, preview }) {
        return `
            <form id="cleaning-ah-laundry-form" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.date"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                    </label>
                    <label class="block md:col-span-2 lg:col-span-3">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.linkedCleaning"))}</span>
                        <select name="linkedCleaningId" id="cleaning-ah-linked-cleaning" class="mt-1 w-full">
                            <option value="">${escapeHtml(this.tr("forms.noLinkedCleaning"))}</option>
                            ${linkOptions}
                        </select>
                        <div class="mt-1 text-xs text-slate-500">${escapeHtml(this.tr("forms.linkedCleaningHint"))}</div>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.property"))}</span>
                        <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(linkedCleaning?.propertyName || draft.propertyName)}" list="cleaning-ah-property-options" ${linkedCleaning ? "readonly" : ""} required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.kg"))}</span>
                        <input type="number" name="kg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.kg))}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.ratePerKg"))}</span>
                        <input type="number" name="laundryRatePerKg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.laundryRatePerKg))}" required>
                    </label>
                </div>
                <label class="block">
                    <span class="text-sm text-slate-600">${escapeHtml(t("common.notes"))}</span>
                    <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                </label>
                <div id="cleaning-ah-laundry-preview">
                    ${this.renderLaundryPreview(preview)}
                </div>
            </form>
        `;
    }

    renderLaundryBatchForm(preview) {
        const rows = this.laundryBatchDraft.rows.length
            ? this.laundryBatchDraft.rows
            : [this.createLaundryBatchRow()];

        return `
            <form id="cleaning-ah-laundry-batch-form" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("laundryTab.batchDate"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(this.laundryBatchDraft.date)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("laundryTab.batchRatePerKg"))}</span>
                        <input type="number" name="laundryRatePerKg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(this.laundryBatchDraft.laundryRatePerKg))}" required>
                    </label>
                </div>
                <div class="rounded-2xl border border-slate-200">
                    <div class="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 md:grid md:grid-cols-[minmax(0,1.35fr)_120px_minmax(0,1fr)_auto] md:gap-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.property"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.kg"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(t("common.notes"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 text-right">${escapeHtml(this.tr("tables.actions"))}</div>
                    </div>
                    <div class="divide-y divide-slate-200">
                        ${rows.map((row, index) => `
                            <div class="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[minmax(0,1.35fr)_120px_minmax(0,1fr)_auto] md:items-start" data-laundry-batch-row="${escapeHtml(row.rowId)}">
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(this.tr("forms.property"))} ${index + 1}</span>
                                    <input type="text" name="propertyName" class="w-full" value="${escapeHtml(row.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}">
                                </label>
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(this.tr("forms.kg"))}</span>
                                    <input type="number" name="kg" class="w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(row.kg))}" placeholder="0">
                                </label>
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 md:hidden">${escapeHtml(t("common.notes"))}</span>
                                    <input type="text" name="notes" class="w-full" value="${escapeHtml(row.notes)}" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">
                                </label>
                                <div class="flex items-center justify-end md:pt-0.5">
                                    <button type="button" data-action="remove-laundry-batch-row" data-row-id="${escapeHtml(row.rowId)}" class="text-sm text-rose-600 hover:text-rose-800">${escapeHtml(this.tr("actions.removeRow"))}</button>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <p class="text-sm text-slate-500">${escapeHtml(this.tr("laundryTab.batchHint"))}</p>
                    <button type="button" id="cleaning-ah-add-laundry-batch-row" class="view-btn">${escapeHtml(this.tr("actions.addRow"))}</button>
                </div>
                <div id="cleaning-ah-laundry-batch-preview">
                    ${this.renderLaundryBatchPreview(preview)}
                </div>
            </form>
        `;
    }

    renderSpecialCleaningsTab(records) {
        const typeOptions = this.getSpecialCleaningTypeOptions()
            .map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === this.specialCleaningDraft.specialType ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");

        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(24rem,0.9fr)_minmax(0,1.4fr)]">
                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-fuchsia-600">${escapeHtml(this.tr("specialCleanings.entryKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.editingSpecialCleaningId ? this.tr("specialCleanings.editTitle") : this.tr("specialCleanings.addTitle"))}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.description"))}</p>
                        </div>
                        <div class="flex flex-wrap gap-3 xl:justify-end">
                            ${this.editingSpecialCleaningId ? `<button type="button" id="cleaning-ah-cancel-special-cleaning-edit" class="view-btn">${escapeHtml(this.tr("actions.cancelEdit"))}</button>` : ""}
                            <button type="submit" form="cleaning-ah-special-cleaning-form" class="view-btn active">${escapeHtml(this.editingSpecialCleaningId ? this.tr("actions.saveChanges") : this.tr("actions.saveSpecialCleaning"))}</button>
                            <button type="button" id="cleaning-ah-reset-special-cleaning-form" class="view-btn">${escapeHtml(this.tr("actions.reset"))}</button>
                        </div>
                    </div>
                    <form id="cleaning-ah-special-cleaning-form" class="mt-5 space-y-4">
                        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label class="block">
                                <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.date"))}</span>
                                <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(this.specialCleaningDraft.date)}" required>
                            </label>
                            <label class="block">
                                <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.property"))}</span>
                                <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(this.specialCleaningDraft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                            </label>
                            <label class="block">
                                <span class="text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.typeLabel"))}</span>
                                <select name="specialType" class="mt-1 w-full">
                                    ${typeOptions}
                                </select>
                            </label>
                            <label class="block">
                                <span class="text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.costLabel"))}</span>
                                <input type="number" name="cost" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(this.specialCleaningDraft.cost))}" placeholder="0.00">
                                <div class="mt-1 text-xs text-slate-500">${escapeHtml(this.tr("specialCleanings.costHint"))}</div>
                            </label>
                            <label class="block">
                                <span class="text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.descriptionLabel"))}</span>
                                <input type="text" name="description" class="mt-1 w-full" value="${escapeHtml(this.specialCleaningDraft.description)}" placeholder="${escapeHtml(this.tr("specialCleanings.descriptionPlaceholder"))}">
                            </label>
                        </div>
                        <label class="block">
                            <span class="text-sm text-slate-600">${escapeHtml(t("common.notes"))}</span>
                            <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(this.specialCleaningDraft.notes)}</textarea>
                        </label>
                    </form>
                </section>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("specialCleanings.registerKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("specialCleanings.registerTitle"))}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.registerDescription"))}</p>
                        </div>
                        <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(records.length))}</div>
                    </div>
                    <div class="mt-5 overflow-x-auto">
                        ${this.renderSpecialCleaningsTable(records)}
                    </div>
                </section>
            </section>
        `;
    }

    renderSpecialCleaningsTable(records) {
        if (!records.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.empty"))}</div>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.date"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.property"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("specialCleanings.typeLabel"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("specialCleanings.costLabel"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("specialCleanings.descriptionLabel"))}</th>
                        <th class="px-3 py-2">${escapeHtml(t("common.notes"))}</th>
                        <th class="px-3 py-2 text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map((record) => `
                        <tr class="border-b border-slate-100">
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatDate(record.date))}</td>
                            <td class="px-3 py-3 text-sm font-medium text-slate-900">${escapeHtml(record.propertyName)}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.getSpecialCleaningTypeLabel(record.specialType))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.cost || 0))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(record.description || "—")}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(record.notes || "—")}</td>
                            <td class="px-3 py-3 text-right">
                                <div class="inline-flex flex-wrap justify-end gap-2">
                                    ${this.renderTableActionButton({
                                        action: "edit-special-cleaning",
                                        id: record.id,
                                        label: t("common.edit"),
                                        iconClass: "fas fa-pen",
                                        tone: "primary"
                                    })}
                                    ${this.renderTableActionButton({
                                        action: "delete-special-cleaning",
                                        id: record.id,
                                        label: t("common.delete"),
                                        iconClass: "fas fa-trash",
                                        tone: "danger"
                                    })}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    renderLaundryRegisterControls() {
        const filterOptions = this.getLaundryRegisterFilterOptions()
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${this.laundryRegisterFilter === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");
        const sortOptions = this.getLaundryRegisterSortOptions()
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${this.laundryRegisterSort === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");

        return `
            <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label class="block">
                    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("laundryTab.registerFilterLabel"))}</span>
                    <select id="cleaning-ah-laundry-register-filter" class="mt-2 w-full">
                        ${filterOptions}
                    </select>
                </label>
                <label class="block">
                    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("laundryTab.registerSortLabel"))}</span>
                    <select id="cleaning-ah-laundry-register-sort" class="mt-2 w-full">
                        ${sortOptions}
                    </select>
                </label>
            </div>
        `;
    }

    renderCleaningRegisterControls() {
        const filterOptions = this.getCleaningRegisterFilterOptions()
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${this.cleaningRegisterFilter === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");
        const sortOptions = this.getCleaningRegisterSortOptions()
            .map(([value, label]) => `<option value="${escapeHtml(value)}" ${this.cleaningRegisterSort === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
            .join("");

        return `
            <div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <label class="block">
                    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("cleanings.registerFilterLabel"))}</span>
                    <select id="cleaning-ah-cleaning-register-filter" class="mt-2 w-full">
                        ${filterOptions}
                    </select>
                </label>
                <label class="block">
                    <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("cleanings.registerSortLabel"))}</span>
                    <select id="cleaning-ah-cleaning-register-sort" class="mt-2 w-full">
                        ${sortOptions}
                    </select>
                </label>
            </div>
        `;
    }

    renderCleaningPreview(previewRecord) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("preview.title"))}</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard(this.tr("metrics.commission"), this.formatCurrency(previewRecord.platformCommission))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.vat"), this.formatCurrency(previewRecord.vatAmount))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.beforeLaundry"), this.formatCurrency(previewRecord.totalToAhWithoutLaundry))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.laundry"), this.formatCurrency(previewRecord.laundryAmount))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.currentNet"), this.formatCurrency(previewRecord.totalToAh), "emphasis")}
                </div>
            </div>
        `;
    }

    renderCleaningBatchPreview(preview) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("preview.title"))}</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard(this.tr("metrics.rows"), String(preview.count))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.guestTotal"), this.formatCurrency(preview.guestAmount))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.laundry"), this.formatCurrency(preview.laundryAmount))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.currentNet"), this.formatCurrency(preview.totalToAh), "emphasis")}
                </div>
            </div>
        `;
    }

    renderLaundryPreview(previewRecord) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("preview.title"))}</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard(this.tr("metrics.kg"), this.formatNumber(previewRecord.kg))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.ratePerKg"), this.formatCurrency(previewRecord.laundryRatePerKg))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.amount"), this.formatCurrency(previewRecord.amount), "emphasis")}
                </div>
            </div>
        `;
    }

    renderLaundryBatchPreview(preview) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("preview.title"))}</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard(this.tr("metrics.rows"), String(preview.count))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.kg"), this.formatNumber(preview.kg))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.amount"), this.formatCurrency(preview.amount), "emphasis")}
                </div>
            </div>
        `;
    }

    renderCleaningQuickLaundryEntry(record) {
        const draft = this.getCleaningQuickLaundryDraft(record);

        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-cleaning-laundry-entry="${escapeHtml(record.id || "")}">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-end">
                    <div class="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[150px_130px_140px_minmax(0,1fr)]">
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.date"))}</span>
                            <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                        </label>
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.kg"))}</span>
                            <input type="number" name="kg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.kg))}" required>
                        </label>
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.ratePerKg"))}</span>
                            <input type="number" name="laundryRatePerKg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.laundryRatePerKg))}" required>
                        </label>
                        <label class="block">
                            <span class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(t("common.notes"))}</span>
                            <input type="text" name="notes" class="mt-1 w-full" value="${escapeHtml(draft.notes)}" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">
                        </label>
                    </div>
                    <div class="flex items-center justify-end gap-3">
                        <button type="button" data-action="toggle-cleaning-laundry-entry" data-id="${escapeHtml(record.id || "")}" class="text-sm text-slate-500 hover:text-slate-700">${escapeHtml(t("common.cancel"))}</button>
                        <button type="button" data-action="save-cleaning-laundry" data-id="${escapeHtml(record.id || "")}" class="view-btn active">${escapeHtml(this.tr("actions.saveLaundry"))}</button>
                    </div>
                </div>
                <p class="mt-3 text-xs text-slate-500">${escapeHtml(this.tr("cleanings.quickLaundryHint"))}</p>
            </div>
        `;
    }

    renderLaundryQuickLinkControls(entry) {
        if (entry.source === "cleaning") {
            return "";
        }

        const isOpen = this.openLaundryLinkEditorId === entry.id;
        const actionLabel = isOpen
            ? t("common.cancel")
            : (entry.linkedCleaningId ? this.tr("actions.changeLink") : this.tr("actions.linkCleaning"));

        if (!isOpen) {
            return `
                <button type="button" data-action="toggle-laundry-link-editor" data-id="${escapeHtml(entry.id || "")}" class="mt-1 text-xs font-medium text-sky-600 hover:text-sky-800">
                    ${escapeHtml(actionLabel)}
                </button>
            `;
        }

        const linkOptions = this.getLaundryLinkOptions(entry.linkedCleaningId, entry.propertyName)
            .map((record) => `<option value="${escapeHtml(record.id || "")}" ${record.id === entry.linkedCleaningId ? "selected" : ""}>${escapeHtml(this.getCleaningLinkLabel(record))}</option>`)
            .join("");

        return `
            <div class="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2" data-laundry-link-controls>
                <label class="block">
                    <span class="sr-only">${escapeHtml(this.tr("tables.linkedCleaning"))}</span>
                    <select class="w-full text-xs" data-laundry-link-select>
                        <option value="">${escapeHtml(this.tr("forms.noLinkedCleaning"))}</option>
                        ${linkOptions}
                    </select>
                </label>
                <div class="mt-1.5 flex flex-wrap items-center justify-end gap-3">
                    <button type="button" data-action="toggle-laundry-link-editor" data-id="${escapeHtml(entry.id || "")}" class="text-xs font-medium text-slate-500 hover:text-slate-700">${escapeHtml(t("common.cancel"))}</button>
                    <button type="button" data-action="save-laundry-link" data-id="${escapeHtml(entry.id || "")}" class="text-xs font-medium text-sky-600 hover:text-sky-800">${escapeHtml(this.tr("actions.saveLink"))}</button>
                </div>
            </div>
        `;
    }

    renderImportBlock() {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">${escapeHtml(this.tr("import.kicker"))}</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("import.title"))}</h3>
                        <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("import.description"))}</p>
                    </div>
                    ${this.importPreview ? `<button type="button" id="cleaning-ah-clear-import" class="text-sm text-slate-500 hover:text-slate-900">${escapeHtml(this.tr("import.clearPreview"))}</button>` : ""}
                </div>
                <div class="mt-4 flex flex-col gap-4">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.csvFile"))}</span>
                        <input id="cleaning-ah-import-file" type="file" accept=".csv,text/csv" class="mt-1 block w-full text-sm text-slate-600">
                    </label>
                    ${this.renderImportPreview()}
                </div>
            </section>
        `;
    }

    renderImportPreview() {
        if (!this.importPreview) {
            return `
                <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                    ${escapeHtml(this.tr("import.empty"))}
                </div>
            `;
        }

        const previewRows = this.importPreview.newRecords.slice(0, 8)
            .map((record) => `
                <tr class="border-t border-slate-200">
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatDate(record.date))}</td>
                    <td class="px-3 py-2 text-sm font-medium text-slate-900">${escapeHtml(record.propertyName)}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.totalToAh))}</td>
                </tr>
            `)
            .join("");

        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("import.previewKicker"))}</div>
                        <h4 class="mt-1 text-lg font-semibold text-slate-900">${escapeHtml(this.importPreview.fileName)}</h4>
                        <p class="mt-1 text-sm text-slate-600">${escapeHtml(this.tr("import.summary", {
                            parsed: this.importPreview.parsedCount,
                            newRows: this.importPreview.newRecords.length,
                            duplicates: this.importPreview.duplicateCount,
                            warnings: this.importPreview.warningCount
                        }))}</p>
                    </div>
                    <button type="button" id="cleaning-ah-confirm-import" class="view-btn active" ${this.importPreview.newRecords.length ? "" : "disabled"}>${escapeHtml(this.getImportRowsLabel(this.importPreview.newRecords.length))}</button>
                </div>
                ${this.importPreview.warningCount ? `
                    <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        ${escapeHtml(this.tr("import.mismatchWarning", { count: this.importPreview.warningCount }))}
                    </div>
                ` : ""}
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-left">
                        <thead>
                            <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.date"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.property"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.category"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.guest"))}</th>
                                <th class="px-3 py-2">${escapeHtml(this.tr("tables.net"))}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${previewRows || `<tr><td colspan="5" class="px-3 py-4 text-sm text-slate-500">${escapeHtml(this.tr("import.noNewRows"))}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderCleaningsTable(records) {
        if (!records.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("cleanings.empty"))}</div>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.date"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.property"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.category"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.reservation"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.guest"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.laundry"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.net"))}</th>
                        <th class="px-3 py-2 text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map((record) => {
                        const isQuickLaundryEntryOpen = this.openCleaningLaundryEntryId === record.id;
                        return `
                        <tr class="border-b border-slate-100 align-top">
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatDate(record.date))}</td>
                            <td class="px-3 py-3">
                                <div class="text-sm font-medium text-slate-900">${escapeHtml(record.propertyName)}</div>
                                ${record.notes ? `<div class="mt-1 text-xs text-slate-500">${escapeHtml(record.notes)}</div>` : ""}
                                ${record.importWarnings?.length ? `<div class="mt-1 text-xs text-amber-600">${escapeHtml(this.getWarningsLabel(record.importWarnings.length))}</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.getReservationSourceLabel(this.getCleaningReservationSource(record)))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">
                                ${escapeHtml(this.formatCurrency(record.effectiveLaundryAmount ?? record.laundryAmount))}
                                ${record.linkedLaundryAmount ? `<div class="text-xs text-slate-400">${escapeHtml(this.tr("laundryState.linkedAmount", { amount: this.formatCurrency(record.linkedLaundryAmount) }))}</div>` : ""}
                                ${record.linkedLaundryCount ? `<div class="text-xs text-slate-400">${escapeHtml(this.getLinkedRowsLabel(record.linkedLaundryCount))}</div>` : ""}
                                ${!record.effectiveLaundryAmount ? `<div class="text-xs text-slate-400">${escapeHtml(this.tr("laundryState.waiting"))}</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-sm font-semibold text-slate-900">${escapeHtml(this.formatCurrency(record.effectiveTotalToAh ?? record.totalToAh))}</td>
                            <td class="px-3 py-3 text-right">
                                <div class="inline-flex flex-wrap justify-end gap-2">
                                    ${this.renderTableActionButton({
                                        action: "toggle-cleaning-laundry-entry",
                                        id: record.id,
                                        label: isQuickLaundryEntryOpen ? t("common.cancel") : this.getCleaningQuickLaundryActionLabel(record),
                                        iconClass: isQuickLaundryEntryOpen ? "fas fa-xmark" : "fas fa-plus",
                                        tone: "accent"
                                    })}
                                    ${this.renderTableActionButton({
                                        action: "edit-cleaning",
                                        id: record.id,
                                        label: t("common.edit"),
                                        iconClass: "fas fa-pen",
                                        tone: "primary"
                                    })}
                                    ${this.renderTableActionButton({
                                        action: "delete-cleaning",
                                        id: record.id,
                                        label: t("common.delete"),
                                        iconClass: "fas fa-trash",
                                        tone: "danger"
                                    })}
                                </div>
                            </td>
                        </tr>
                        ${isQuickLaundryEntryOpen ? `
                            <tr class="border-b border-slate-100">
                                <td colspan="8" class="px-3 pb-4 pt-0">
                                    ${this.renderCleaningQuickLaundryEntry(record)}
                                </td>
                            </tr>
                        ` : ""}
                    `;
                    }).join("")}
                </tbody>
            </table>
        `;
    }

    renderLaundryTable(entries) {
        if (!entries.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("laundryTab.empty"))}</div>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.date"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.property"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.linkedCleaning"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.kg"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.ratePerKg"))}</th>
                        <th class="px-3 py-2">${escapeHtml(this.tr("tables.amount"))}</th>
                        <th class="px-3 py-2 text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map((entry) => `
                        <tr class="border-b border-slate-100">
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatDate(entry.date))}</td>
                            <td class="px-3 py-3">
                                <div class="text-sm font-medium text-slate-900">${escapeHtml(entry.propertyName)}</div>
                                ${entry.notes ? `<div class="mt-1 text-xs text-slate-500">${escapeHtml(entry.notes)}</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">
                                ${entry.linkedCleaningId
                                    ? `${escapeHtml(this.formatDate(entry.linkedCleaningDate || ""))}${entry.linkedCleaningCategory ? `<div class="text-xs text-slate-400">${escapeHtml(entry.linkedCleaningCategory)}</div>` : ""}`
                                    : `<span class="text-slate-400">${escapeHtml(this.tr("laundryState.notLinked"))}</span>`}
                                ${this.renderLaundryQuickLinkControls(entry)}
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatNumber(entry.kg))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(entry.laundryRatePerKg))}</td>
                            <td class="px-3 py-3 text-sm font-semibold text-slate-900">${escapeHtml(this.formatCurrency(entry.amount))}</td>
                            <td class="px-3 py-3 text-right">
                                <div class="inline-flex flex-wrap justify-end gap-2">
                                    ${entry.linkedCleaningId ? this.renderTableActionButton({
                                        action: "open-cleaning-from-laundry",
                                        id: entry.linkedCleaningId || "",
                                        label: this.tr("actions.openCleaning"),
                                        iconClass: "fas fa-arrow-up-right-from-square",
                                        tone: "primary"
                                    }) : ""}
                                    ${entry.source !== "cleaning" ? this.renderTableActionButton({
                                        action: "edit-laundry",
                                        id: entry.id,
                                        label: t("common.edit"),
                                        iconClass: "fas fa-pen",
                                        tone: "primary"
                                    }) : ""}
                                    ${entry.source !== "cleaning" ? this.renderTableActionButton({
                                        action: "delete-laundry",
                                        id: entry.id,
                                        label: t("common.delete"),
                                        iconClass: "fas fa-trash",
                                        tone: "danger"
                                    }) : ""}
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    renderLaundrySummaryBlock(laundrySummary) {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("dashboard.laundryKicker"))}</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("dashboard.laundryTitle"))}</h3>
                    </div>
                    <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(laundrySummary.totals.count))}</div>
                </div>
                <div class="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    ${this.renderMetricCard(this.tr("metrics.kg"), this.formatNumber(laundrySummary.totals.kg))}
                    ${this.renderMetricCard(this.tr("metrics.amount"), this.formatCurrency(laundrySummary.totals.amount))}
                    ${this.renderMetricCard(this.tr("metrics.rows"), String(laundrySummary.totals.count))}
                </div>
                ${this.renderFinancialSummaryTable(this.tr("dashboard.laundryByMonth"), laundrySummary.byMonth, [
                    [this.tr("tables.month"), (entry) => this.formatMonthKey(entry.label)],
                    [this.tr("tables.rows"), (entry) => String(entry.count)],
                    [this.tr("tables.kg"), (entry) => this.formatNumber(entry.kg)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.amount)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("dashboard.laundryByProperty"), laundrySummary.byProperty.slice(0, 8), [
                    [this.tr("tables.property"), (entry) => entry.label],
                    [this.tr("tables.rows"), (entry) => String(entry.count)],
                    [this.tr("tables.kg"), (entry) => this.formatNumber(entry.kg)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.amount)]
                ])}
            </section>
        `;
    }

    renderFinancialSummaryTable(title, entries, columns) {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(title)}</h3>
                    <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(entries.length))}</div>
                </div>
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-left">
                        <thead>
                            <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                                ${columns.map(([label]) => `<th class="px-3 py-2">${escapeHtml(label)}</th>`).join("")}
                            </tr>
                        </thead>
                        <tbody>
                            ${entries.length
                                ? entries.map((entry) => `
                                    <tr class="border-b border-slate-100">
                                        ${columns.map(([, render]) => `<td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(render(entry))}</td>`).join("")}
                                    </tr>
                                `).join("")
                                : `<tr><td colspan="${columns.length}" class="px-3 py-4 text-sm text-slate-500">${escapeHtml(this.tr("tables.noData"))}</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    bindUiEvents() {
        document.querySelectorAll("[data-tab]").forEach((button) => {
            button.addEventListener("click", () => {
                this.activeTab = button.dataset.tab || "dashboard";
                this.render();
            });
        });

        document.querySelectorAll("[data-cleaning-entry-mode]").forEach((button) => {
            button.addEventListener("click", () => {
                const nextMode = button.dataset.cleaningEntryMode === "batch" ? "batch" : "single";
                if (nextMode === "single") {
                    this.cleaningEntryMode = "single";
                    this.render();
                    return;
                }

                this.editingCleaningId = null;
                this.cleaningDraft = this.createDefaultCleaningDraft();
                this.cleaningEntryMode = "batch";
                if (!this.cleaningBatchDraft.rows.length) {
                    this.cleaningBatchDraft = this.createDefaultCleaningBatchDraft();
                }
                this.render();
            });
        });

        document.querySelectorAll("[data-laundry-entry-mode]").forEach((button) => {
            button.addEventListener("click", () => {
                const nextMode = button.dataset.laundryEntryMode === "batch" ? "batch" : "single";
                if (nextMode === "single") {
                    this.laundryEntryMode = "single";
                    this.render();
                    return;
                }

                this.editingLaundryId = null;
                this.laundryDraft = this.createDefaultLaundryDraft();
                this.laundryEntryMode = "batch";
                if (!this.laundryBatchDraft.rows.length) {
                    this.laundryBatchDraft = this.createDefaultLaundryBatchDraft();
                }
                this.render();
            });
        });

        document.getElementById("cleaning-ah-search")?.addEventListener("input", (event) => {
            this.searchQuery = event.target.value || "";
            this.render();
        });
        document.getElementById("cleaning-ah-month-filter")?.addEventListener("change", (event) => {
            this.selectedMonthKey = event.target.value || "";
            this.render();
        });
        document.getElementById("cleaning-ah-property-filter")?.addEventListener("change", (event) => {
            this.selectedPropertyName = event.target.value || "";
            this.render();
        });
        document.getElementById("cleaning-ah-category-filter")?.addEventListener("change", (event) => {
            this.selectedCategory = event.target.value || "";
            this.render();
        });
        document.getElementById("cleaning-ah-stats-property-sort")?.addEventListener("change", (event) => {
            this.statsPropertySort = event.target.value || "net-desc";
            this.render();
        });
        document.getElementById("cleaning-ah-stats-selected-property")?.addEventListener("change", (event) => {
            this.statsSelectedPropertyName = event.target.value || "";
            this.render();
        });
        document.querySelectorAll("[data-stats-category]").forEach((button) => {
            button.addEventListener("click", () => {
                this.statsCategoryKey = button.dataset.statsCategory || "";
                this.render();
            });
        });
        document.querySelectorAll("[data-action='select-stats-property']").forEach((button) => {
            button.addEventListener("click", () => {
                this.statsSelectedPropertyName = button.dataset.propertyName || "";
                this.render();
            });
        });
        document.getElementById("cleaning-ah-cleaning-register-filter")?.addEventListener("change", (event) => {
            this.cleaningRegisterFilter = event.target.value || "all";
            this.render();
        });
        document.getElementById("cleaning-ah-cleaning-register-sort")?.addEventListener("change", (event) => {
            this.cleaningRegisterSort = event.target.value || "date-desc";
            this.render();
        });
        document.getElementById("cleaning-ah-laundry-register-filter")?.addEventListener("change", (event) => {
            this.laundryRegisterFilter = event.target.value || "all";
            this.render();
        });
        document.getElementById("cleaning-ah-laundry-register-sort")?.addEventListener("change", (event) => {
            this.laundryRegisterSort = event.target.value || "date-desc";
            this.render();
        });

        const cleaningForm = document.getElementById("cleaning-ah-cleaning-form");
        cleaningForm?.addEventListener("input", (event) => {
            if (event.target?.name === "categoryKey") {
                this.cleaningDraft = this.readCleaningDraftFromDom();
                this.render();
                return;
            }
            if (event.target?.name === "propertyName") {
                this.applyCleaningSuggestionToSingleForm();
            }
            this.cleaningDraft = this.readCleaningDraftFromDom();
            this.updateCleaningPreview();
        });
        cleaningForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveCleaningRecord();
        });
        document.getElementById("cleaning-ah-reset-cleaning-form")?.addEventListener("click", () => this.resetCleaningForm());
        document.getElementById("cleaning-ah-cancel-cleaning-edit")?.addEventListener("click", () => this.resetCleaningForm());

        const cleaningBatchForm = document.getElementById("cleaning-ah-cleaning-batch-form");
        cleaningBatchForm?.addEventListener("input", (event) => {
            if (event.target?.name === "categoryKey") {
                this.cleaningBatchDraft = this.readCleaningBatchDraftFromDom();
                this.render();
                return;
            }
            if (event.target?.name === "propertyName") {
                this.applyCleaningSuggestionToBatchRow(event.target.closest("[data-cleaning-batch-row]"));
            }
            this.cleaningBatchDraft = this.readCleaningBatchDraftFromDom();
            this.updateCleaningBatchPreview();
        });
        cleaningBatchForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveCleaningBatchRecords();
        });
        document.getElementById("cleaning-ah-add-cleaning-batch-row")?.addEventListener("click", () => {
            this.cleaningBatchDraft = this.readCleaningBatchDraftFromDom();
            this.cleaningBatchDraft = {
                ...this.cleaningBatchDraft,
                rows: [...this.cleaningBatchDraft.rows, this.createCleaningBatchRow()]
            };
            this.render();
        });
        document.getElementById("cleaning-ah-reset-cleaning-batch-form")?.addEventListener("click", () => this.resetCleaningBatchForm());
        document.querySelectorAll("[data-action='remove-cleaning-batch-row']").forEach((button) => {
            button.addEventListener("click", () => {
                this.cleaningBatchDraft = this.readCleaningBatchDraftFromDom();
                const remainingRows = this.cleaningBatchDraft.rows.filter((row) => row.rowId !== (button.dataset.rowId || ""));
                this.cleaningBatchDraft = {
                    ...this.cleaningBatchDraft,
                    rows: remainingRows.length ? remainingRows : [this.createCleaningBatchRow()]
                };
                this.render();
            });
        });

        const laundryForm = document.getElementById("cleaning-ah-laundry-form");
        laundryForm?.addEventListener("input", () => {
            this.laundryDraft = this.readLaundryDraftFromDom();
            this.updateLaundryPreview();
        });
        laundryForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveLaundryRecord();
        });
        document.getElementById("cleaning-ah-linked-cleaning")?.addEventListener("change", (event) => {
            const linkedCleaning = this.cleaningRecords.find((entry) => entry.id === (event.target.value || ""));
            if (linkedCleaning) {
                const propertyInput = document.querySelector('#cleaning-ah-laundry-form input[name="propertyName"]');
                if (propertyInput) {
                    propertyInput.value = linkedCleaning.propertyName || "";
                }
            }
            this.laundryDraft = this.readLaundryDraftFromDom();
            this.updateLaundryPreview();
        });
        document.getElementById("cleaning-ah-reset-laundry-form")?.addEventListener("click", () => this.resetLaundryForm());
        document.getElementById("cleaning-ah-cancel-laundry-edit")?.addEventListener("click", () => this.resetLaundryForm());

        const laundryBatchForm = document.getElementById("cleaning-ah-laundry-batch-form");
        laundryBatchForm?.addEventListener("input", () => {
            this.laundryBatchDraft = this.readLaundryBatchDraftFromDom();
            this.updateLaundryBatchPreview();
        });
        laundryBatchForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveLaundryBatchRecords();
        });
        document.getElementById("cleaning-ah-add-laundry-batch-row")?.addEventListener("click", () => {
            this.laundryBatchDraft = this.readLaundryBatchDraftFromDom();
            this.laundryBatchDraft = {
                ...this.laundryBatchDraft,
                rows: [...this.laundryBatchDraft.rows, this.createLaundryBatchRow()]
            };
            this.render();
        });
        document.getElementById("cleaning-ah-reset-laundry-batch-form")?.addEventListener("click", () => this.resetLaundryBatchForm());
        document.querySelectorAll("[data-action='remove-laundry-batch-row']").forEach((button) => {
            button.addEventListener("click", () => {
                this.laundryBatchDraft = this.readLaundryBatchDraftFromDom();
                const remainingRows = this.laundryBatchDraft.rows.filter((row) => row.rowId !== (button.dataset.rowId || ""));
                this.laundryBatchDraft = {
                    ...this.laundryBatchDraft,
                    rows: remainingRows.length ? remainingRows : [this.createLaundryBatchRow()]
                };
                this.render();
            });
        });

        const specialCleaningForm = document.getElementById("cleaning-ah-special-cleaning-form");
        specialCleaningForm?.addEventListener("input", () => {
            this.specialCleaningDraft = this.readSpecialCleaningDraftFromDom();
        });
        specialCleaningForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveSpecialCleaningRecord();
        });
        document.getElementById("cleaning-ah-reset-special-cleaning-form")?.addEventListener("click", () => this.resetSpecialCleaningForm());
        document.getElementById("cleaning-ah-cancel-special-cleaning-edit")?.addEventListener("click", () => this.resetSpecialCleaningForm());

        document.getElementById("cleaning-ah-import-file")?.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }

            await this.previewImportFile(file);
        });
        document.getElementById("cleaning-ah-confirm-import")?.addEventListener("click", () => this.commitImportPreview());
        document.getElementById("cleaning-ah-clear-import")?.addEventListener("click", () => {
            this.importPreview = null;
            this.render();
        });

        document.querySelectorAll("[data-action='edit-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.startEditingCleaning(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='delete-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.deleteCleaning(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='toggle-cleaning-laundry-entry']").forEach((button) => {
            button.addEventListener("click", () => {
                const recordId = button.dataset.id || "";
                if (!recordId) {
                    return;
                }

                if (this.openCleaningLaundryEntryId === recordId) {
                    this.openCleaningLaundryEntryId = "";
                    delete this.cleaningLaundryQuickDrafts[recordId];
                    this.render();
                    return;
                }

                const record = this.cleaningRecords.find((entry) => entry.id === recordId);
                if (!record) {
                    return;
                }

                this.openCleaningLaundryEntryId = recordId;
                this.cleaningLaundryQuickDrafts[recordId] = this.getCleaningQuickLaundryDraft(record);
                this.render();
            });
        });
        document.querySelectorAll("[data-cleaning-laundry-entry]").forEach((container) => {
            container.addEventListener("input", () => {
                const recordId = container.dataset.cleaningLaundryEntry || "";
                if (!recordId) {
                    return;
                }

                this.cleaningLaundryQuickDrafts[recordId] = this.readCleaningQuickLaundryDraftFromContainer(container, recordId);
            });
        });
        document.querySelectorAll("[data-action='save-cleaning-laundry']").forEach((button) => {
            button.addEventListener("click", () => {
                const container = button.closest("[data-cleaning-laundry-entry]");
                this.saveCleaningLaundryRecord(button.dataset.id || "", container);
            });
        });
        document.querySelectorAll("[data-action='edit-laundry']").forEach((button) => {
            button.addEventListener("click", () => this.startEditingLaundry(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='delete-laundry']").forEach((button) => {
            button.addEventListener("click", () => this.deleteLaundry(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='edit-special-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.startEditingSpecialCleaning(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='delete-special-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.deleteSpecialCleaning(button.dataset.id || ""));
        });
        document.querySelectorAll("[data-action='toggle-laundry-link-editor']").forEach((button) => {
            button.addEventListener("click", () => {
                const recordId = button.dataset.id || "";
                this.openLaundryLinkEditorId = this.openLaundryLinkEditorId === recordId ? "" : recordId;
                this.render();
            });
        });
        document.querySelectorAll("[data-action='save-laundry-link']").forEach((button) => {
            button.addEventListener("click", () => {
                const controls = button.closest("[data-laundry-link-controls]");
                const select = controls?.querySelector("[data-laundry-link-select]");
                this.saveLaundryLink(button.dataset.id || "", select?.value || "");
            });
        });
        document.querySelectorAll("[data-action='open-cleaning-from-laundry']").forEach((button) => {
            button.addEventListener("click", () => this.openCleaningFromLaundry(button.dataset.id || ""));
        });
    }

    readCleaningDraftFromDom() {
        const form = document.getElementById("cleaning-ah-cleaning-form");
        if (!form) {
            return { ...this.cleaningDraft };
        }

        const formData = new FormData(form);
        return {
            date: String(formData.get("date") || "").trim(),
            propertyName: normalizeLabel(formData.get("propertyName")),
            categoryKey: this.getCleaningCategoryKey(formData.get("categoryKey")),
            reservationSource: String(formData.get("reservationSource") || this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform).trim(),
            guestAmount: String(formData.get("guestAmount") || "").trim(),
            laundryKg: String(formData.get("laundryKg") || "").trim(),
            notes: String(formData.get("notes") || "").trim()
        };
    }

    readCleaningBatchDraftFromDom() {
        const form = document.getElementById("cleaning-ah-cleaning-batch-form");
        if (!form) {
            return {
                ...this.cleaningBatchDraft,
                rows: this.cleaningBatchDraft.rows.map((row) => ({ ...row }))
            };
        }

        const formData = new FormData(form);
        const rows = [...form.querySelectorAll("[data-cleaning-batch-row]")]
            .map((rowElement) => ({
                rowId: rowElement.dataset.cleaningBatchRow || this.createCleaningBatchRow().rowId,
                propertyName: normalizeLabel(rowElement.querySelector('[name="propertyName"]')?.value),
                guestAmount: String(rowElement.querySelector('[name="guestAmount"]')?.value || "").trim(),
                laundryKg: String(rowElement.querySelector('[name="laundryKg"]')?.value || "").trim(),
                notes: String(rowElement.querySelector('[name="notes"]')?.value || "").trim()
            }));

        return {
            date: String(formData.get("date") || "").trim(),
            categoryKey: this.getCleaningCategoryKey(formData.get("categoryKey")),
            reservationSource: String(formData.get("reservationSource") || this.cleaningBatchDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform).trim(),
            rows: rows.length ? rows : [this.createCleaningBatchRow()]
        };
    }

    readLaundryDraftFromDom() {
        const form = document.getElementById("cleaning-ah-laundry-form");
        if (!form) {
            return { ...this.laundryDraft };
        }

        const formData = new FormData(form);
        return {
            date: String(formData.get("date") || "").trim(),
            linkedCleaningId: String(formData.get("linkedCleaningId") || "").trim(),
            propertyName: normalizeLabel(formData.get("propertyName")),
            kg: String(formData.get("kg") || "").trim(),
            laundryRatePerKg: String(formData.get("laundryRatePerKg") || "").trim(),
            notes: String(formData.get("notes") || "").trim()
        };
    }

    readLaundryBatchDraftFromDom() {
        const form = document.getElementById("cleaning-ah-laundry-batch-form");
        if (!form) {
            return {
                ...this.laundryBatchDraft,
                rows: this.laundryBatchDraft.rows.map((row) => ({ ...row }))
            };
        }

        const formData = new FormData(form);
        const rows = [...form.querySelectorAll("[data-laundry-batch-row]")]
            .map((rowElement) => ({
                rowId: rowElement.dataset.laundryBatchRow || this.createLaundryBatchRow().rowId,
                propertyName: normalizeLabel(rowElement.querySelector('[name="propertyName"]')?.value),
                kg: String(rowElement.querySelector('[name="kg"]')?.value || "").trim(),
                notes: String(rowElement.querySelector('[name="notes"]')?.value || "").trim()
            }));

        return {
            date: String(formData.get("date") || "").trim(),
            laundryRatePerKg: String(formData.get("laundryRatePerKg") || "").trim(),
            rows: rows.length ? rows : [this.createLaundryBatchRow()]
        };
    }

    readSpecialCleaningDraftFromDom() {
        const form = document.getElementById("cleaning-ah-special-cleaning-form");
        if (!form) {
            return { ...this.specialCleaningDraft };
        }

        const formData = new FormData(form);
        const specialType = String(formData.get("specialType") || "other").trim();
        return {
            date: String(formData.get("date") || "").trim(),
            propertyName: normalizeLabel(formData.get("propertyName")),
            specialType: ["sofa", "mattress", "other"].includes(specialType) ? specialType : "other",
            cost: String(formData.get("cost") || "").trim(),
            description: String(formData.get("description") || "").trim(),
            notes: String(formData.get("notes") || "").trim()
        };
    }

    updateCleaningPreview() {
        const container = document.getElementById("cleaning-ah-cleaning-preview");
        if (!container) return;

        const guestAmountField = this.getCleaningGuestAmountFieldState(this.cleaningDraft, {
            enableSuggestion: !this.editingCleaningId,
            excludeRecordId: this.editingCleaningId || ""
        });
        const record = createCleaningAhRecord({
            date: this.cleaningDraft.date,
            propertyName: this.cleaningDraft.propertyName,
            categoryKey: this.getCleaningCategoryKey(this.cleaningDraft.categoryKey || this.cleaningDraft.category),
            category: this.getCleaningCategoryLabel(this.cleaningDraft.categoryKey || this.cleaningDraft.category),
            reservationSource: this.categoryUsesReservationSource(this.cleaningDraft.categoryKey || this.cleaningDraft.category)
                ? (this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                : CLEANING_AH_RESERVATION_SOURCES.direct,
            guestAmount: guestAmountField.numericValue || 0,
            laundryKg: toOptionalNumber(this.cleaningDraft.laundryKg) || 0,
            notes: this.cleaningDraft.notes
        });
        container.innerHTML = this.renderCleaningPreview(record);
    }

    updateCleaningBatchPreview() {
        const container = document.getElementById("cleaning-ah-cleaning-batch-preview");
        if (!container) return;

        const preview = this.getCleaningBatchPreview(this.readCleaningBatchDraftFromDom());
        container.innerHTML = this.renderCleaningBatchPreview(preview);
    }

    updateLaundryPreview() {
        const container = document.getElementById("cleaning-ah-laundry-preview");
        if (!container) return;

        const record = createStandaloneLaundryRecord({
            date: this.laundryDraft.date,
            propertyName: this.laundryDraft.propertyName,
            kg: toOptionalNumber(this.laundryDraft.kg) || 0,
            laundryRatePerKg: toOptionalNumber(this.laundryDraft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg,
            notes: this.laundryDraft.notes
        });
        container.innerHTML = this.renderLaundryPreview(record);
    }

    updateLaundryBatchPreview() {
        const container = document.getElementById("cleaning-ah-laundry-batch-preview");
        if (!container) return;

        const preview = this.getLaundryBatchPreview(this.readLaundryBatchDraftFromDom());
        container.innerHTML = this.renderLaundryBatchPreview(preview);
    }

    async saveCleaningRecord() {
        this.cleaningDraft = this.readCleaningDraftFromDom();
        const categoryKey = this.getCleaningCategoryKey(this.cleaningDraft.categoryKey || this.cleaningDraft.category);
        const guestAmountField = this.getCleaningGuestAmountFieldState(this.cleaningDraft, {
            enableSuggestion: !this.editingCleaningId,
            excludeRecordId: this.editingCleaningId || "",
            categoryKey
        });
        if (!this.cleaningDraft.date || !this.cleaningDraft.propertyName) {
            this.setStatus(this.tr("status.cleaningValidationError"), "error");
            this.render();
            return;
        }

        const existingCleaning = this.editingCleaningId
            ? (this.cleaningRecords.find((entry) => entry.id === this.editingCleaningId) || null)
            : null;
        const property = this.findPropertyByName(this.cleaningDraft.propertyName);
        const record = createCleaningAhRecord({
            date: this.cleaningDraft.date,
            propertyName: this.cleaningDraft.propertyName,
            propertyId: property?.id || "",
            categoryKey,
            category: this.getCleaningCategoryLabel(categoryKey),
            reservationSource: this.categoryUsesReservationSource(categoryKey)
                ? (this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                : CLEANING_AH_RESERVATION_SOURCES.direct,
            guestAmount: guestAmountField.numericValue || 0,
            laundryKg: toOptionalNumber(this.cleaningDraft.laundryKg) || 0,
            notes: this.cleaningDraft.notes,
            source: existingCleaning?.source || "manual"
        });

        const payload = {
            ...(existingCleaning || {}),
            ...record,
            updatedAt: new Date()
        };

        try {
            if (this.editingCleaningId) {
                await updateDoc(doc(this.db, "cleaningAhRecords", this.editingCleaningId), payload);
                this.setStatus(this.tr("status.cleaningUpdated"), "success");
            } else {
                await addDoc(this.getCleaningsCollectionRef(), {
                    ...payload,
                    createdAt: new Date()
                });
                this.setStatus(this.tr("status.cleaningSaved"), "success");
            }
            this.resetCleaningForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save cleaning:", error);
            this.setStatus(this.tr("status.cleaningSaveFailed"), "error");
            this.render();
        }
    }

    async saveCleaningBatchRecords() {
        this.cleaningBatchDraft = this.readCleaningBatchDraftFromDom();
        const categoryKey = this.getCleaningCategoryKey(this.cleaningBatchDraft.categoryKey || this.cleaningBatchDraft.category);
        const meaningfulRows = this.cleaningBatchDraft.rows.filter((row) => {
            return row.propertyName || row.guestAmount || row.laundryKg || row.notes;
        });
        const validRows = meaningfulRows.filter((row) => {
            const guestAmount = this.getCleaningGuestAmountFieldState({
                ...row,
                categoryKey
            }).numericValue;
            return row.propertyName && guestAmount !== null && guestAmount >= 0;
        });

        if (!this.cleaningBatchDraft.date || !validRows.length || validRows.length !== meaningfulRows.length) {
            this.setStatus(this.tr("status.cleaningBatchValidationError"), "error");
            this.render();
            return;
        }

        try {
            const collectionRef = this.getCleaningsCollectionRef();
            const batch = writeBatch(this.db);
            const now = new Date();

            validRows.forEach((row) => {
                const property = this.findPropertyByName(row.propertyName);
                const guestAmount = this.getCleaningGuestAmountFieldState({
                    ...row,
                    categoryKey
                }).numericValue || 0;
                const record = createCleaningAhRecord({
                    date: this.cleaningBatchDraft.date,
                    propertyName: row.propertyName,
                    propertyId: property?.id || "",
                    categoryKey,
                    category: this.getCleaningCategoryLabel(categoryKey),
                    reservationSource: this.categoryUsesReservationSource(categoryKey)
                        ? (this.cleaningBatchDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                        : CLEANING_AH_RESERVATION_SOURCES.direct,
                    guestAmount,
                    laundryKg: toOptionalNumber(row.laundryKg) || 0,
                    notes: row.notes,
                    source: "manual"
                });
                const recordRef = doc(collectionRef);
                batch.set(recordRef, {
                    ...record,
                    createdAt: now,
                    updatedAt: now
                });
            });

            await batch.commit();
            this.setStatus(this.tr("status.cleaningBatchSaved", { count: validRows.length }), "success");
            this.resetCleaningBatchForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save cleaning batch:", error);
            this.setStatus(this.tr("status.cleaningBatchSaveFailed"), "error");
            this.render();
        }
    }

    async saveCleaningLaundryRecord(recordId, container) {
        const cleaningRecord = this.cleaningRecords.find((entry) => entry.id === recordId);
        if (!recordId || !cleaningRecord || !container) {
            return;
        }

        const draft = this.readCleaningQuickLaundryDraftFromContainer(container, recordId);
        this.cleaningLaundryQuickDrafts[recordId] = draft;

        const kg = toOptionalNumber(draft.kg);
        if (!draft.date || kg === null || kg <= 0) {
            this.setStatus(this.tr("status.linkedLaundryValidationError"), "error");
            this.render();
            return;
        }

        const property = this.findPropertyByName(cleaningRecord.propertyName);
        const record = createStandaloneLaundryRecord({
            date: draft.date,
            linkedCleaningId: cleaningRecord.id,
            propertyName: cleaningRecord.propertyName,
            propertyId: property?.id || cleaningRecord.propertyId || "",
            kg,
            laundryRatePerKg: toOptionalNumber(draft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg,
            notes: draft.notes,
            source: "standalone"
        });

        try {
            await addDoc(this.getLaundryCollectionRef(), {
                ...record,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            this.openCleaningLaundryEntryId = "";
            delete this.cleaningLaundryQuickDrafts[recordId];
            this.setStatus(this.tr("status.laundrySaved"), "success");
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to save cleaning-linked laundry:", error);
            this.setStatus(this.tr("status.laundrySaveFailed"), "error");
            this.render();
        }
    }

    async saveLaundryRecord() {
        this.laundryDraft = this.readLaundryDraftFromDom();
        const existingLaundry = this.editingLaundryId
            ? (this.laundryRecords.find((entry) => entry.id === this.editingLaundryId) || null)
            : null;
        const linkedCleaning = this.cleaningRecords.find((entry) => entry.id === this.laundryDraft.linkedCleaningId) || null;
        const propertyName = linkedCleaning?.propertyName || this.laundryDraft.propertyName;
        if (!this.laundryDraft.date || !propertyName) {
            this.setStatus(this.tr("status.laundryValidationError"), "error");
            this.render();
            return;
        }
        const property = this.findPropertyByName(propertyName);
        const record = createStandaloneLaundryRecord({
            date: this.laundryDraft.date,
            linkedCleaningId: this.laundryDraft.linkedCleaningId,
            propertyName,
            propertyId: property?.id || "",
            kg: toOptionalNumber(this.laundryDraft.kg) || 0,
            laundryRatePerKg: toOptionalNumber(this.laundryDraft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg,
            notes: this.laundryDraft.notes,
            source: existingLaundry?.source || "standalone"
        });

        const payload = {
            ...(existingLaundry || {}),
            ...record,
            updatedAt: new Date()
        };

        try {
            if (this.editingLaundryId) {
                await updateDoc(doc(this.db, "cleaningAhLaundryRecords", this.editingLaundryId), payload);
                this.setStatus(this.tr("status.laundryUpdated"), "success");
            } else {
                await addDoc(this.getLaundryCollectionRef(), {
                    ...payload,
                    createdAt: new Date()
                });
                this.setStatus(this.tr("status.laundrySaved"), "success");
            }
            this.resetLaundryForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save laundry:", error);
            this.setStatus(this.tr("status.laundrySaveFailed"), "error");
            this.render();
        }
    }

    async saveLaundryBatchRecords() {
        this.laundryBatchDraft = this.readLaundryBatchDraftFromDom();
        const meaningfulRows = this.laundryBatchDraft.rows.filter((row) => {
            return row.propertyName || row.kg || row.notes;
        });
        const validRows = meaningfulRows.filter((row) => {
            const kg = toOptionalNumber(row.kg);
            return row.propertyName && kg !== null && kg > 0;
        });

        if (!this.laundryBatchDraft.date || !validRows.length || validRows.length !== meaningfulRows.length) {
            this.setStatus(this.tr("status.laundryBatchValidationError"), "error");
            this.render();
            return;
        }

        try {
            const collectionRef = this.getLaundryCollectionRef();
            const batch = writeBatch(this.db);
            const now = new Date();
            const laundryRatePerKg = toOptionalNumber(this.laundryBatchDraft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg;

            validRows.forEach((row) => {
                const property = this.findPropertyByName(row.propertyName);
                const record = createStandaloneLaundryRecord({
                    date: this.laundryBatchDraft.date,
                    propertyName: row.propertyName,
                    propertyId: property?.id || "",
                    kg: toOptionalNumber(row.kg) || 0,
                    laundryRatePerKg,
                    notes: row.notes,
                    source: "standalone"
                });
                const recordRef = doc(collectionRef);
                batch.set(recordRef, {
                    ...record,
                    createdAt: now,
                    updatedAt: now
                });
            });

            await batch.commit();
            this.setStatus(this.tr("status.laundryBatchSaved", { count: validRows.length }), "success");
            this.resetLaundryBatchForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save laundry batch:", error);
            this.setStatus(this.tr("status.laundryBatchSaveFailed"), "error");
            this.render();
        }
    }

    async saveLaundryLink(recordId, linkedCleaningId) {
        const existingLaundry = this.laundryRecords.find((entry) => entry.id === recordId);
        if (!recordId || !existingLaundry) {
            return;
        }

        const linkedCleaning = this.cleaningRecords.find((entry) => entry.id === linkedCleaningId) || null;
        const payload = {
            linkedCleaningId: linkedCleaning ? linkedCleaning.id : "",
            updatedAt: new Date()
        };

        if (linkedCleaning) {
            const property = this.findPropertyByName(linkedCleaning.propertyName);
            payload.propertyName = linkedCleaning.propertyName || existingLaundry.propertyName || "";
            payload.propertyId = property?.id || linkedCleaning.propertyId || existingLaundry.propertyId || "";
        }

        try {
            await updateDoc(doc(this.db, "cleaningAhLaundryRecords", recordId), payload);
            this.openLaundryLinkEditorId = "";
            this.setStatus(
                linkedCleaning
                    ? this.tr("status.laundryLinkSaved")
                    : this.tr("status.laundryLinkCleared"),
                "success"
            );
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to update laundry link:", error);
            this.setStatus(this.tr("status.laundryLinkSaveFailed"), "error");
            this.render();
        }
    }

    async saveSpecialCleaningRecord() {
        this.specialCleaningDraft = this.readSpecialCleaningDraftFromDom();
        const existingRecord = this.editingSpecialCleaningId
            ? (this.specialCleaningRecords.find((entry) => entry.id === this.editingSpecialCleaningId) || null)
            : null;

        if (!this.specialCleaningDraft.date || !this.specialCleaningDraft.propertyName) {
            this.setStatus(this.tr("status.specialCleaningValidationError"), "error");
            this.render();
            return;
        }

        const property = this.findPropertyByName(this.specialCleaningDraft.propertyName);
        const payload = {
            ...(existingRecord || {}),
            date: this.specialCleaningDraft.date,
            monthKey: this.specialCleaningDraft.date.slice(0, 7),
            propertyName: this.specialCleaningDraft.propertyName,
            propertyId: property?.id || existingRecord?.propertyId || "",
            specialType: this.specialCleaningDraft.specialType,
            cost: toOptionalNumber(this.specialCleaningDraft.cost) || 0,
            description: this.specialCleaningDraft.description,
            notes: this.specialCleaningDraft.notes,
            updatedAt: new Date()
        };

        try {
            if (this.editingSpecialCleaningId) {
                await updateDoc(doc(this.db, "cleaningAhSpecialCleaningRecords", this.editingSpecialCleaningId), payload);
                this.setStatus(this.tr("status.specialCleaningUpdated"), "success");
            } else {
                await addDoc(this.getSpecialCleaningCollectionRef(), {
                    ...payload,
                    createdAt: new Date()
                });
                this.setStatus(this.tr("status.specialCleaningSaved"), "success");
            }
            this.resetSpecialCleaningForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save special cleaning:", error);
            this.setStatus(this.tr("status.specialCleaningSaveFailed"), "error");
            this.render();
        }
    }

    async previewImportFile(file) {
        try {
            const text = await file.text();
            const parsed = parseCleaningAhCsv(text);
            const existingFingerprints = new Set(
                this.cleaningRecords.map((record) => record.fingerprint || createCleaningAhFingerprint(record))
            );
            const batchFingerprints = new Set();
            const newRecords = [];
            let duplicateCount = 0;

            parsed.records.forEach((record) => {
                if (existingFingerprints.has(record.fingerprint) || batchFingerprints.has(record.fingerprint)) {
                    duplicateCount += 1;
                    return;
                }

                batchFingerprints.add(record.fingerprint);
                newRecords.push(record);
            });

            this.importPreview = {
                fileName: file.name,
                batchId: `import-${Date.now()}`,
                parsedCount: parsed.records.length,
                duplicateCount,
                warningCount: parsed.records.filter((record) => record.importWarnings?.length).length,
                newRecords
            };

            this.setStatus(this.tr("status.csvPreviewReady", { count: parsed.records.length }), "info");
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to preview CSV:", error);
            this.setStatus(this.tr("status.csvPreviewFailed"), "error");
            this.render();
        }
    }

    async commitImportPreview() {
        if (!this.importPreview?.newRecords?.length) {
            this.setStatus(this.tr("status.noNewRowsToImport"), "info");
            this.render();
            return;
        }

        try {
            const collectionRef = this.getCleaningsCollectionRef();
            const now = new Date();
            const chunkSize = 400;
            for (let index = 0; index < this.importPreview.newRecords.length; index += chunkSize) {
                const batch = writeBatch(this.db);
                const chunk = this.importPreview.newRecords.slice(index, index + chunkSize);
                chunk.forEach((record) => {
                    const ref = doc(collectionRef);
                    batch.set(ref, {
                        ...record,
                        importBatchId: this.importPreview.batchId,
                        importFileName: this.importPreview.fileName,
                        createdAt: now,
                        updatedAt: now
                    });
                });
                await batch.commit();
            }

            this.importPreview = null;
            this.setStatus(this.tr("status.csvImportCompleted"), "success");
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to import CSV:", error);
            this.setStatus(this.tr("status.csvImportFailed"), "error");
            this.render();
        }
    }

    startEditingCleaning(recordId) {
        const record = this.cleaningRecords.find((entry) => entry.id === recordId);
        if (!record) {
            return;
        }

        this.activeTab = "cleanings";
        this.cleaningEntryMode = "single";
        this.editingCleaningId = record.id;
        this.openCleaningLaundryEntryId = "";
        delete this.cleaningLaundryQuickDrafts[record.id];
        this.cleaningDraft = {
            date: record.date || getTodayIsoDate(),
            propertyName: record.propertyName || "",
            categoryKey: this.getCleaningCategoryKey(record.categoryKey || record.category),
            reservationSource: this.getCleaningReservationSource(record),
            guestAmount: toInputNumber(record.guestAmount),
            laundryKg: toInputNumber(record.laundryKg ?? record.estimatedLaundryKg),
            notes: record.notes || ""
        };
        this.render();
    }

    startEditingLaundry(recordId) {
        const record = this.laundryRecords.find((entry) => entry.id === recordId);
        if (!record) {
            return;
        }

        this.activeTab = "laundry";
        this.laundryEntryMode = "single";
        this.editingLaundryId = record.id;
        this.laundryDraft = {
            date: record.date || getTodayIsoDate(),
            linkedCleaningId: record.linkedCleaningId || "",
            propertyName: record.propertyName || "",
            kg: toInputNumber(record.kg),
            laundryRatePerKg: toInputNumber(record.laundryRatePerKg ?? CLEANING_AH_DEFAULTS.laundryRatePerKg),
            notes: record.notes || ""
        };
        this.render();
    }

    startEditingSpecialCleaning(recordId) {
        const record = this.specialCleaningRecords.find((entry) => entry.id === recordId);
        if (!record) {
            return;
        }

        this.activeTab = "special-cleanings";
        this.editingSpecialCleaningId = record.id;
        this.specialCleaningDraft = {
            date: record.date || getTodayIsoDate(),
            propertyName: record.propertyName || "",
            specialType: record.specialType || "other",
            cost: toInputNumber(record.cost),
            description: record.description || record.details || "",
            notes: record.notes || ""
        };
        this.render();
    }

    openCleaningFromLaundry(recordId) {
        if (!recordId) {
            return;
        }

        this.startEditingCleaning(recordId);
    }

    async deleteCleaning(recordId) {
        const linkedLaundryRecords = this.laundryRecords.filter((entry) => entry.linkedCleaningId === recordId);
        const confirmationMessage = linkedLaundryRecords.length
            ? this.tr("confirm.deleteCleaningWithLinked", { count: linkedLaundryRecords.length })
            : this.tr("confirm.deleteCleaning");
        if (!recordId || !window.confirm(confirmationMessage)) {
            return;
        }

        try {
            const batch = writeBatch(this.db);
            batch.delete(doc(this.db, "cleaningAhRecords", recordId));
            linkedLaundryRecords.forEach((entry) => {
                batch.update(doc(this.db, "cleaningAhLaundryRecords", entry.id), {
                    linkedCleaningId: "",
                    updatedAt: new Date()
                });
            });
            await batch.commit();
            this.setStatus(
                linkedLaundryRecords.length
                    ? this.tr("status.cleaningDeletedWithLinked", { count: linkedLaundryRecords.length })
                    : this.tr("status.cleaningDeleted"),
                "success"
            );
            if (this.editingCleaningId === recordId) {
                this.resetCleaningForm();
                return;
            }
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to delete cleaning:", error);
            this.setStatus(this.tr("status.cleaningDeleteFailed"), "error");
            this.render();
        }
    }

    async deleteLaundry(recordId) {
        if (!recordId || !window.confirm(this.tr("confirm.deleteLaundry"))) {
            return;
        }

        try {
            await deleteDoc(doc(this.db, "cleaningAhLaundryRecords", recordId));
            this.setStatus(this.tr("status.laundryDeleted"), "success");
            if (this.editingLaundryId === recordId) {
                this.resetLaundryForm();
                return;
            }
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to delete laundry:", error);
            this.setStatus(this.tr("status.laundryDeleteFailed"), "error");
            this.render();
        }
    }

    async deleteSpecialCleaning(recordId) {
        if (!recordId || !window.confirm(this.tr("confirm.deleteSpecialCleaning"))) {
            return;
        }

        try {
            await deleteDoc(doc(this.db, "cleaningAhSpecialCleaningRecords", recordId));
            this.setStatus(this.tr("status.specialCleaningDeleted"), "success");
            if (this.editingSpecialCleaningId === recordId) {
                this.resetSpecialCleaningForm();
                return;
            }
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to delete special cleaning:", error);
            this.setStatus(this.tr("status.specialCleaningDeleteFailed"), "error");
            this.render();
        }
    }

    resetCleaningForm() {
        this.editingCleaningId = null;
        this.cleaningEntryMode = "single";
        this.openCleaningLaundryEntryId = "";
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.render();
    }

    resetCleaningBatchForm() {
        this.editingCleaningId = null;
        this.cleaningEntryMode = "batch";
        this.openCleaningLaundryEntryId = "";
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.cleaningBatchDraft = this.createDefaultCleaningBatchDraft();
        this.render();
    }

    resetLaundryForm() {
        this.editingLaundryId = null;
        this.laundryEntryMode = "single";
        this.laundryDraft = this.createDefaultLaundryDraft();
        this.render();
    }

    resetLaundryBatchForm() {
        this.editingLaundryId = null;
        this.laundryEntryMode = "batch";
        this.laundryDraft = this.createDefaultLaundryDraft();
        this.laundryBatchDraft = this.createDefaultLaundryBatchDraft();
        this.render();
    }

    resetSpecialCleaningForm() {
        this.editingSpecialCleaningId = null;
        this.specialCleaningDraft = this.createDefaultSpecialCleaningDraft();
        this.render();
    }

    setStatus(message, tone = "info") {
        this.statusMessage = message;
        this.statusTone = tone;
    }

    formatCurrency(value) {
        try {
            return new Intl.NumberFormat(this.getLocale(), {
                style: "currency",
                currency: "EUR"
            }).format(roundCurrency(value || 0));
        } catch {
            return `EUR ${roundCurrency(value || 0).toFixed(2)}`;
        }
    }

    formatNumber(value) {
        const numeric = roundCurrency(value || 0);
        if (!numeric) {
            return "0";
        }
        const fractionDigits = numeric % 1 === 0 ? 0 : 2;

        try {
            return new Intl.NumberFormat(this.getLocale(), {
                minimumFractionDigits: fractionDigits,
                maximumFractionDigits: 2
            }).format(numeric);
        } catch {
            return numeric.toFixed(fractionDigits);
        }
    }

    formatDate(dateValue) {
        const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return String(dateValue || "");
        }

        const candidate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        try {
            return new Intl.DateTimeFormat(this.getLocale(), {
                year: "numeric",
                month: "short",
                day: "numeric"
            }).format(candidate);
        } catch {
            return dateValue;
        }
    }

    formatMonthKey(monthKey) {
        const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
        if (!match) {
            return String(monthKey || "");
        }

        const candidate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
        try {
            return new Intl.DateTimeFormat(this.getLocale(), {
                year: "numeric",
                month: "long"
            }).format(candidate);
        } catch {
            return monthKey;
        }
    }
}
