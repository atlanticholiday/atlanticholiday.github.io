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
    calculateAverageRemainingPerCleaning,
    createCleaningAhFingerprint,
    createCleaningAhRecord,
    createStandaloneLaundryRecord,
    filterCleaningRegisterEntries,
    filterLaundryRegisterEntries,
    getCleaningAhCategoryConfig,
    normalizeCleaningAhCategoryKey,
    parseCleaningAhCsv,
    resolveLaundryAmount,
    roundCurrency,
    deriveCleaningAhRecords,
    summarizeCleaningAhRecords,
    summarizeCleaningAhPropertyDetail,
    summarizeCleaningAhPropertyRows,
    summarizeLaundryRecords,
    sortCleaningAhPropertyRows,
    combineCleaningAndLaundryMonthlySummaries,
    combineCleaningAndLaundryPropertySummaries
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

function normalizeDateKey(value) {
    return String(value || "").trim();
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

function parseIsoDateToUtc(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }

    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function toIsoDateKey(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toISOString().slice(0, 10);
}

function addDaysIsoDate(value, days) {
    const date = parseIsoDateToUtc(value);
    if (!date) {
        return getTodayIsoDate();
    }

    date.setUTCDate(date.getUTCDate() + days);
    return toIsoDateKey(date);
}

function getMondayFirstWeekStart(value) {
    const date = parseIsoDateToUtc(value) || parseIsoDateToUtc(getTodayIsoDate());
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    date.setUTCDate(date.getUTCDate() + mondayOffset);
    return toIsoDateKey(date);
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

        this.tabFilters = new Map();
        this.activeTab = "cleanings";
        this.statsCategoryKey = "";
        this.statsPropertySort = "net-desc";
        this.statsSelectedPropertyName = "";
        this.statsDetailPropertyName = "";
        this.statsPropertyScrollPosition = null;
        this.statsViewMode = "month";
        this.activeDrawer = null;
        this.collapsedSections = new Set();
        this.calendarDate = getTodayIsoDate();
        this.cleaningRegisterFilter = "all";
        this.cleaningRegisterSort = "date-desc";
        this.registerQueueSort = localStorage.getItem("cleaningAhRegisterQueueSort") || "oldest";
        this.registerQueueCompact = localStorage.getItem("cleaningAhRegisterQueueCompact") === "true";
        this.fastRegisterDuplicateWarning = false;
        this.laundryRegisterFilter = "all";
        this.laundryRegisterSort = "date-desc";
        this.calendarModalMode = "";
        this.heatmapDetailModal = null;
        this.exportModalActive = false;

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
        this.focusAfterRender = "";

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

    get activeTab() {
        return this._activeTab;
    }

    set activeTab(tab) {
        if (tab === this._activeTab) return;
        // All tab switches, including edit shortcuts, preserve each tab's filters.
        if (this._activeTab) {
            this.tabFilters.set(this._activeTab, {
                searchQuery: this.searchQuery,
                selectedMonthKey: this.selectedMonthKey,
                selectedPropertyName: this.selectedPropertyName,
                selectedCategory: this.selectedCategory
            });
        }
        this._activeTab = tab;
        Object.assign(this, this.tabFilters.get(tab) || {
            searchQuery: "",
            selectedMonthKey: "",
            selectedPropertyName: "",
            selectedCategory: ""
        });
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
            notes: ""
        };
    }

    createCleaningBatchRow(overrides = {}) {
        return {
            rowId: `cleaning-batch-row-${this.nextCleaningBatchRowId += 1}`,
            propertyName: "",
            guestAmount: "",
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
            propertyName: "",
            quantity: "",
            kg: "",
            amount: "",
            laundryRatePerKg: String(CLEANING_AH_DEFAULTS.laundryRatePerKg),
            notes: ""
        };
    }

    createLaundryBatchRow(overrides = {}) {
        return {
            rowId: `laundry-batch-row-${this.nextLaundryBatchRowId += 1}`,
            propertyName: "",
            quantity: "",
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
            page.className = "hidden min-h-screen bg-[#fafbfc]";
            page.innerHTML = `
                <div class="border-b border-[#e1e4e8] bg-white">
                    <div class="mx-auto flex max-w-[2400px] flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between xl:px-8 2xl:px-10">
                        <div class="flex items-center gap-3.5">
                            <button id="back-to-landing-from-cleaning-ah-btn" class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                                <span id="cleaning-ah-back-label"></span>
                            </button>
                            <div class="h-5 w-px bg-slate-200"></div>
                            <div class="cleaning-ah-project-badge">
                                <i class="fas fa-broom"></i>
                            </div>
                            <div>
                                <div id="cleaning-ah-header-kicker" class="text-[10px] uppercase font-bold tracking-wider text-[#ef5b6c]"></div>
                                <h1 id="cleaning-ah-header-title" class="text-xl font-bold tracking-tight text-slate-900"></h1>
                                <p id="cleaning-ah-header-subtitle" class="text-xs text-slate-500 font-medium"></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 self-start sm:self-auto">
                            <div class="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                                <button type="button" class="lang-btn rounded-lg px-2.5 py-1 text-xs font-semibold transition-all hover:bg-white hover:shadow-sm" data-lang-option="en" title="English">EN</button>
                                <button type="button" class="lang-btn rounded-lg px-2.5 py-1 text-xs font-semibold transition-all hover:bg-white hover:shadow-sm" data-lang-option="pt" title="Português">PT</button>
                            </div>
                            <button id="cleaning-ah-sign-out-btn" class="text-xs font-medium text-slate-500 hover:text-rose-600 transition"></button>
                        </div>
                    </div>
                </div>
                <div id="cleaning-ah-shell" class="mx-auto w-full max-w-[2400px] px-4 py-6 xl:px-8 2xl:px-10">
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
            shell.className = "mx-auto w-full max-w-[2400px] px-4 py-6 xl:px-8 2xl:px-10";
        }

        if (!document.getElementById("go-to-cleaning-ah-btn")) {
            const parent = document.getElementById("services-logistics-grid")
                || document.getElementById("go-to-properties-btn")?.parentElement
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
                parent.closest(".landing-category")?.classList.remove("hidden");
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
                this.repairMissingLaundryAmounts(snapshot.docs, "amount");
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

    async repairMissingLaundryAmounts(snapshotDocs = [], amountField = "amount") {
        if (!this.db || !Array.isArray(snapshotDocs) || !snapshotDocs.length) {
            return;
        }

        const patches = snapshotDocs
            .map((entry) => {
                const record = { id: entry.id, ...entry.data() };
                const kg = toOptionalNumber(record.kg);
                const savedAmount = toOptionalNumber(record[amountField]);
                if (kg === null || kg <= 0 || (savedAmount !== null && savedAmount > 0)) {
                    return null;
                }

                const laundryRatePerKg = toOptionalNumber(record.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg;
                const amount = roundCurrency(kg * laundryRatePerKg);
                if (amount <= 0) {
                    return null;
                }

                const patch = {
                    [amountField]: amount,
                    laundryRatePerKg,
                    updatedAt: new Date()
                };

                return { ref: entry.ref, patch };
            })
            .filter(Boolean);

        if (!patches.length) {
            return;
        }

        try {
            const chunkSize = 400;
            for (let index = 0; index < patches.length; index += chunkSize) {
                const batch = writeBatch(this.db);
                patches.slice(index, index + chunkSize).forEach(({ ref, patch }) => {
                    batch.update(ref, patch);
                });
                await batch.commit();
            }
        } catch (error) {
            console.error("[Cleaning AH] failed to repair missing laundry amounts:", error);
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

    getDuplicateCleaningRecord(candidate = {}, excludeRecordId = "") {
        const date = normalizeDateKey(candidate.date);
        const propertyName = normalizeKey(candidate.propertyName);
        const categoryKey = this.getCleaningCategoryKey(candidate.categoryKey || candidate.category);
        if (!date || !propertyName || !categoryKey) {
            return null;
        }

        return this.cleaningRecords.find((record) => {
            if (!record || (excludeRecordId && record.id === excludeRecordId)) {
                return false;
            }

            return normalizeDateKey(record.date) === date
                && normalizeKey(record.propertyName) === propertyName
                && this.getCleaningCategoryKey(record.categoryKey || record.category) === categoryKey;
        }) || null;
    }

    getDuplicateLaundryRecord(candidate = {}, excludeRecordId = "") {
        const date = normalizeDateKey(candidate.date);
        const propertyName = normalizeKey(candidate.propertyName);
        if (!date || !propertyName) {
            return null;
        }

        return this.laundryRecords.find((record) => {
            if (!record || (excludeRecordId && record.id === excludeRecordId)) {
                return false;
            }

            return normalizeDateKey(record.date) === date
                && normalizeKey(record.propertyName) === propertyName;
        }) || null;
    }

    confirmDuplicateCleaning(candidate, excludeRecordId = "") {
        const duplicate = this.getDuplicateCleaningRecord(candidate, excludeRecordId);
        if (!duplicate) {
            return true;
        }

        const shouldSaveAnyway = window.confirm(this.tr("confirm.duplicateCleaning", {
            property: duplicate.propertyName || candidate.propertyName,
            date: this.formatDate(duplicate.date || candidate.date)
        }));
        if (!shouldSaveAnyway) {
            this.startEditingCleaning(duplicate.id);
        }
        return shouldSaveAnyway;
    }

    confirmDuplicateLaundry(candidate, excludeRecordId = "") {
        const duplicate = this.getDuplicateLaundryRecord(candidate, excludeRecordId);
        if (!duplicate) {
            return true;
        }

        const shouldSaveAnyway = window.confirm(this.tr("confirm.duplicateLaundry", {
            property: duplicate.propertyName || candidate.propertyName,
            date: this.formatDate(duplicate.date || candidate.date)
        }));
        if (!shouldSaveAnyway) {
            this.startEditingLaundry(duplicate.id);
        }
        return shouldSaveAnyway;
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
            ["all", this.tr("cleanings.registerFilters.all")]
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
            ["all", this.tr("laundryTab.registerFilters.all")]
        ];
    }

    getLaundryRegisterSortOptions() {
        return [
            ["date-desc", this.tr("laundryTab.registerSortOptions.dateDesc")],
            ["date-asc", this.tr("laundryTab.registerSortOptions.dateAsc")],
            ["property-asc", this.tr("laundryTab.registerSortOptions.propertyAsc")],
            ["property-desc", this.tr("laundryTab.registerSortOptions.propertyDesc")],
            ["quantity-desc", this.tr("laundryTab.registerSortOptions.quantityDesc") || "Highest quantity"],
            ["quantity-asc", this.tr("laundryTab.registerSortOptions.quantityAsc") || "Lowest quantity"],
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
            const quantity = toOptionalNumber(row?.quantity);
            if (!propertyName || ((kg === null || kg <= 0) && (quantity === null || quantity <= 0))) {
                return summary;
            }

            const record = createStandaloneLaundryRecord({
                date: draft?.date,
                propertyName,
                quantity,
                kg: kg || 0,
                laundryRatePerKg
            });

            return {
                count: summary.count + 1,
                quantity: summary.quantity + (record.quantity || 0),
                kg: roundCurrency(summary.kg + record.kg),
                amount: roundCurrency(summary.amount + record.amount),
                laundryRatePerKg
            };
        }, {
            count: 0,
            quantity: 0,
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
                guestAmount: guestAmountField.numericValue
            });

            return {
                count: summary.count + 1,
                guestAmount: roundCurrency(summary.guestAmount + record.guestAmount),
                platformCommission: roundCurrency(summary.platformCommission + record.platformCommission),
                vatAmount: roundCurrency(summary.vatAmount + record.vatAmount),
                totalToAhWithoutLaundry: roundCurrency(summary.totalToAhWithoutLaundry + record.totalToAhWithoutLaundry),
                totalToAh: roundCurrency(summary.totalToAh + record.totalToAh)
            };
        }, {
            count: 0,
            guestAmount: 0,
            platformCommission: 0,
            vatAmount: 0,
            totalToAhWithoutLaundry: 0,
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

    applyCleaningSuggestionToForm(form, { skipWhenEditing = false } = {}) {
        if (skipWhenEditing && this.editingCleaningId) {
            return;
        }

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

    applyCleaningSuggestionToSingleForm() {
        this.applyCleaningSuggestionToForm(document.getElementById("cleaning-ah-cleaning-form"), {
            skipWhenEditing: true
        });
    }

    applyCleaningSuggestionToFastForm() {
        this.applyCleaningSuggestionToForm(document.getElementById("cleaning-ah-fast-register-form"));
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
        const propertyDialogScrollTop = document.getElementById("cleaning-ah-property-stats-body")?.scrollTop || 0;

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
        const laundrySummary = summarizeLaundryRecords(filteredStandaloneLaundry);
        const visibleLaundryRegisterEntries = this.getVisibleLaundryRegisterEntries(laundrySummary.entries);
        const statsCategoryOptions = this.getStatsCategoryOptions(cleaningSummary);
        if (
            this.activeTab === "stats"
            && this.statsCategoryKey
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

        const allDerivedCleanings = deriveCleaningAhRecords(this.cleaningRecords, this.laundryRecords);

        root.innerHTML = `
            ${this.renderStatusMessage()}
            ${this.renderTabBar()}
            ${this.renderActiveTab(
                visibleCleaningRegisterEntries,
                derivedCleanings,
                filteredStandaloneLaundry,
                statsCleaningSummary,
                laundrySummary,
                visibleLaundryRegisterEntries,
                visibleSpecialCleaningEntries,
                statsPropertyRows,
                statsCategoryOptions,
                selectedStatsPropertyName,
                selectedStatsPropertyDetail,
                allDerivedCleanings
            )}
            ${this.renderSlideOverDrawer()}
            ${this.renderHeatmapDetailModal(statsCleaningSummary.records)}
            ${this.renderExportReportModal(statsCleaningSummary.records, laundrySummary)}
            ${this.activeTab === "stats" ? this.renderStatsPropertyModal(statsCleaningSummary, laundrySummary) : ""}
            <datalist id="cleaning-ah-property-options">${this.getKnownPropertyNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
        `;

        this.bindUiEvents();
        this.bindStatsPropertyModal(propertyDialogScrollTop);
        this.updateCleaningPreview();
        this.updateCleaningBatchPreview();
        this.updateLaundryPreview();
        this.updateLaundryBatchPreview();
        if (this.focusAfterRender) {
            document.getElementById(this.focusAfterRender)?.focus();
            this.focusAfterRender = "";
        }
    }

    renderSlideOverDrawer() {
        if (!this.activeDrawer) {
            return `<div class="cleaning-detail-overlay" data-action="close-drawer"></div><aside class="cleaning-detail" data-cleaning-detail aria-hidden="true"></aside>`;
        }

        const { type, id } = this.activeDrawer;
        const isEditing = Boolean(id);

        if (type === "cleaning") {
            const draft = this.cleaningDraft;
            const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
            const categoryOptions = this.getKnownCategories()
                .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === categoryKey ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
                .join("");
            const isPlatform = (draft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform) === CLEANING_AH_RESERVATION_SOURCES.platform;
            const guestAmountNum = Number(draft.guestAmount) || 0;
            const commission = isPlatform ? roundCurrency(guestAmountNum * 0.155) : 0;
            const vat = isPlatform ? roundCurrency((guestAmountNum - commission) * 0.22 / 1.22) : roundCurrency(guestAmountNum * 0.22 / 1.22);
            const netAh = roundCurrency(guestAmountNum - commission - vat);

            return `
                <div class="cleaning-detail-overlay is-open" data-action="close-drawer"></div>
                <aside class="cleaning-detail is-open" data-cleaning-detail aria-hidden="false">
                    <div class="cleaning-detail__topbar">
                        <h3>${isEditing ? escapeHtml(this.tr("cleanings.editTitle") || "Detalhes da Limpeza") : escapeHtml(this.tr("cleanings.addTitle") || "Nova Limpeza")}</h3>
                        <div class="cleaning-detail__actions">
                            ${isEditing ? `
                                <button type="button" class="cleaning-detail__close-btn text-rose-600 hover:bg-rose-50" data-action="drawer-delete-cleaning" data-id="${escapeHtml(id)}" title="${escapeHtml(t("common.delete"))}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ""}
                            <button type="button" class="cleaning-detail__close-btn" data-action="close-drawer" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <form id="cleaning-ah-drawer-cleaning-form" class="cleaning-detail__scroll space-y-5">
                        <div class="cleaning-detail__metadata">
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.property"))}</label>
                                <input type="text" name="propertyName" class="cleaning-metadata-input" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.cleaningDate"))}</label>
                                <input type="date" name="date" class="cleaning-metadata-input" value="${escapeHtml(draft.date)}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.category"))}</label>
                                <select name="categoryKey" class="cleaning-metadata-select">
                                    ${categoryOptions}
                                </select>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.reservationSource"))}</label>
                                <select name="reservationSource" class="cleaning-metadata-select" ${this.categoryUsesReservationSource(categoryKey) ? "" : "disabled"}>
                                    <option value="platform" ${draft.reservationSource === "platform" ? "selected" : ""}>${escapeHtml(this.tr("reservationSources.platform"))}</option>
                                    <option value="direct" ${draft.reservationSource === "direct" ? "selected" : ""}>${escapeHtml(this.tr("reservationSources.direct"))}</option>
                                </select>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</label>
                                <input type="number" name="guestAmount" class="cleaning-metadata-input" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.guestAmount))}" placeholder="0.00" required>
                            </div>
                        </div>

                        <!-- Live Calculation Card -->
                        <div class="cleaning-detail__live-calc">
                            <h4>${escapeHtml(this.tr("formula.title") || "Cálculo Líquido AH")}</h4>
                            <div class="cleaning-detail__live-calc-grid">
                                <div class="cleaning-calc-box">
                                    <small>${escapeHtml(this.tr("metrics.platformFees"))}</small>
                                    <strong class="text-rose-600">-${escapeHtml(this.formatCurrency(commission))}</strong>
                                </div>
                                <div class="cleaning-calc-box">
                                    <small>${escapeHtml(this.tr("metrics.vat"))}</small>
                                    <strong class="text-rose-600">-${escapeHtml(this.formatCurrency(vat))}</strong>
                                </div>
                                <div class="cleaning-calc-box bg-emerald-50 border-emerald-200">
                                    <small class="text-emerald-800">${escapeHtml(this.tr("metrics.netToAh"))}</small>
                                    <strong class="text-emerald-700">${escapeHtml(this.formatCurrency(netAh))}</strong>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-slate-600 mb-1">${escapeHtml(t("common.notes"))}</label>
                            <textarea name="notes" class="cleaning-detail__textarea" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                        </div>
                    </form>
                    <div class="cleaning-detail__footer">
                        <button type="button" class="cleaning-btn-secondary text-xs" data-action="close-drawer">${escapeHtml(this.tr("actions.cancelEdit") || "Cancelar")}</button>
                        <button type="submit" form="cleaning-ah-drawer-cleaning-form" class="cleaning-btn-create">${escapeHtml(this.tr("actions.saveCleaning") || "Guardar")}</button>
                    </div>
                </aside>
            `;
        }

        if (type === "laundry") {
            const draft = this.laundryDraft;
            const quantity = Number(draft.quantity) || 1;
            const kg = Number(draft.kg) || 0;
            const rate = Number(draft.laundryRatePerKg) || CLEANING_AH_DEFAULTS.laundryRatePerKg;
            const total = roundCurrency(kg > 0 ? kg * rate : quantity * rate);

            return `
                <div class="cleaning-detail-overlay is-open" data-action="close-drawer"></div>
                <aside class="cleaning-detail is-open" data-cleaning-detail aria-hidden="false">
                    <div class="cleaning-detail__topbar">
                        <h3>${isEditing ? "Detalhes da Lavandaria" : "Nova Lavandaria"}</h3>
                        <div class="cleaning-detail__actions">
                            ${isEditing ? `
                                <button type="button" class="cleaning-detail__close-btn text-rose-600 hover:bg-rose-50" data-action="drawer-delete-laundry" data-id="${escapeHtml(id)}" title="${escapeHtml(t("common.delete"))}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ""}
                            <button type="button" class="cleaning-detail__close-btn" data-action="close-drawer" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <form id="cleaning-ah-drawer-laundry-form" class="cleaning-detail__scroll space-y-5">
                        <div class="cleaning-detail__metadata">
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.property"))}</label>
                                <input type="text" name="propertyName" class="cleaning-metadata-input" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("tables.laundryReceivedDate"))}</label>
                                <input type="date" name="date" class="cleaning-metadata-input" value="${escapeHtml(draft.date)}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("tables.quantity") || "Quantidade")}</label>
                                <input type="number" name="quantity" class="cleaning-metadata-input" min="1" step="1" value="${escapeHtml(draft.quantity || "1")}">
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("metrics.kg"))}</label>
                                <input type="number" name="kg" class="cleaning-metadata-input" min="0" step="0.01" value="${escapeHtml(toInputNumber(draft.kg))}" placeholder="0.00">
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("tables.ratePerKg"))}</label>
                                <input type="number" name="laundryRatePerKg" class="cleaning-metadata-input" min="0" step="0.01" value="${escapeHtml(toInputNumber(draft.laundryRatePerKg))}" placeholder="2.30">
                            </div>
                        </div>

                        <!-- Total Expense Box -->
                        <div class="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                            <div>
                                <small class="text-xs font-semibold uppercase tracking-wider text-rose-700">Despesa Total de Lavandaria</small>
                                <div class="text-xl font-bold text-rose-800">${escapeHtml(this.formatCurrency(total))}</div>
                            </div>
                            <i class="fas fa-tshirt text-2xl text-rose-300"></i>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-slate-600 mb-1">${escapeHtml(t("common.notes"))}</label>
                            <textarea name="notes" class="cleaning-detail__textarea" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                        </div>
                    </form>
                    <div class="cleaning-detail__footer">
                        <button type="button" class="cleaning-btn-secondary text-xs" data-action="close-drawer">${escapeHtml(this.tr("actions.cancelEdit") || "Cancelar")}</button>
                        <button type="submit" form="cleaning-ah-drawer-laundry-form" class="cleaning-btn-create">${escapeHtml(this.tr("actions.saveLaundry") || "Guardar")}</button>
                    </div>
                </aside>
            `;
        }

        if (type === "special") {
            const draft = this.specialCleaningDraft;
            const typeOptions = this.getSpecialCleaningTypeOptions()
                .map(([key, label]) => `<option value="${escapeHtml(key)}" ${key === draft.specialType ? "selected" : ""}>${escapeHtml(label)}</option>`)
                .join("");

            return `
                <div class="cleaning-detail-overlay is-open" data-action="close-drawer"></div>
                <aside class="cleaning-detail is-open" data-cleaning-detail aria-hidden="false">
                    <div class="cleaning-detail__topbar">
                        <h3>${isEditing ? escapeHtml(this.tr("specialCleanings.editTitle") || "Detalhes da Limpeza Especial") : escapeHtml(this.tr("specialCleanings.addTitle") || "Nova Limpeza Especial")}</h3>
                        <div class="cleaning-detail__actions">
                            ${isEditing ? `
                                <button type="button" class="cleaning-detail__close-btn text-rose-600 hover:bg-rose-50" data-action="drawer-delete-special" data-id="${escapeHtml(id)}" title="${escapeHtml(t("common.delete"))}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ""}
                            <button type="button" class="cleaning-detail__close-btn" data-action="close-drawer" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <form id="cleaning-ah-drawer-special-form" class="cleaning-detail__scroll space-y-5">
                        <div class="cleaning-detail__metadata">
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.property"))}</label>
                                <input type="text" name="propertyName" class="cleaning-metadata-input" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("forms.date"))}</label>
                                <input type="date" name="date" class="cleaning-metadata-input" value="${escapeHtml(draft.date)}" required>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("specialCleanings.typeLabel"))}</label>
                                <select name="specialType" class="cleaning-metadata-select">
                                    ${typeOptions}
                                </select>
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("specialCleanings.costLabel"))}</label>
                                <input type="number" name="cost" class="cleaning-metadata-input" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.cost))}" placeholder="0.00">
                            </div>
                            <div class="cleaning-metadata-field">
                                <label>${escapeHtml(this.tr("specialCleanings.descriptionLabel"))}</label>
                                <input type="text" name="description" class="cleaning-metadata-input" value="${escapeHtml(draft.description)}" placeholder="${escapeHtml(this.tr("specialCleanings.descriptionPlaceholder"))}">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold text-slate-600 mb-1">${escapeHtml(t("common.notes"))}</label>
                            <textarea name="notes" class="cleaning-detail__textarea" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                        </div>
                    </form>
                    <div class="cleaning-detail__footer">
                        <button type="button" class="cleaning-btn-secondary text-xs" data-action="close-drawer">${escapeHtml(this.tr("actions.cancelEdit") || "Cancelar")}</button>
                        <button type="submit" form="cleaning-ah-drawer-special-form" class="cleaning-btn-create">${escapeHtml(this.tr("actions.saveSpecialCleaning") || "Guardar")}</button>
                    </div>
                </aside>
            `;
        }

        return "";
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
            <section class="flex flex-wrap items-center justify-end gap-2">
                <div class="relative flex items-center">
                    <i class="fas fa-search absolute left-3 text-xs text-slate-400" aria-hidden="true"></i>
                    <input id="cleaning-ah-search" type="search" class="cleaning-search-input" value="${escapeHtml(this.searchQuery)}" aria-label="${escapeHtml(this.tr("filters.searchPlaceholder"))}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}">
                </div>
                <select id="cleaning-ah-month-filter" class="cleaning-select-filter" aria-label="${escapeHtml(this.tr("tables.month"))}">
                    <option value="">${escapeHtml(this.tr("filters.allMonths"))}</option>
                    ${monthOptions}
                </select>
                <select id="cleaning-ah-property-filter" class="cleaning-select-filter" aria-label="${escapeHtml(this.tr("tables.property"))}">
                    <option value="">${escapeHtml(this.tr("filters.allProperties"))}</option>
                    ${propertyOptions}
                </select>
                <select id="cleaning-ah-category-filter" class="cleaning-select-filter" aria-label="${escapeHtml(this.tr("tables.category"))}">
                    <option value="">${escapeHtml(this.tr("filters.allCategories"))}</option>
                    ${categoryOptions}
                </select>
            </section>
        `;
    }

    renderTabBar(overdueCount = 0) {
        const tabs = [
            ["cleanings", this.tr("tabs.cleanings")],
            ["laundry", this.tr("tabs.laundry")],
            ["special-cleanings", this.tr("tabs.specialCleanings")],
            ["stats", this.tr("tabs.stats")],
            ["calendar", this.tr("tabs.calendar")],
            ["register", this.tr("tabs.register")]
        ];

        return `
            <nav class="cleaning-view-tabs" aria-label="${escapeHtml(this.tr("tabs.ariaLabel"))}">
                ${tabs.map(([key, label]) => {
                    const isRegister = key === "register";
                    const badge = isRegister && overdueCount > 0
                        ? `<span class="tab-badge" aria-label="${escapeHtml(String(overdueCount))} overdue">${escapeHtml(String(overdueCount))}</span>`
                        : "";
                    const isActive = this.activeTab === key;
                    return `
                        <button
                            type="button"
                            data-tab="${key}"
                            class="cleaning-view-tab ${isActive ? "is-active" : ""}"
                        >${escapeHtml(label)}${badge}</button>
                    `;
                }).join("")}
            </nav>
        `;
    }

    renderActiveTab(
        visibleCleaningRegisterEntries,
        calendarCleaningEntries,
        filteredStandaloneLaundry,
        cleaningSummary,
        laundrySummary,
        visibleLaundryRegisterEntries,
        visibleSpecialCleaningEntries,
        statsPropertyRows,
        statsCategoryOptions,
        selectedStatsPropertyName,
        selectedStatsPropertyDetail,
        allDerivedCleanings
    ) {
        if (this.activeTab === "register") {
            return this.renderRegisterTab(visibleCleaningRegisterEntries, allDerivedCleanings);
        }

        if (this.activeTab === "calendar") {
            return this.renderCalendarTab(calendarCleaningEntries);
        }

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
            selectedStatsPropertyDetail,
            laundrySummary,
            cleaningSummary.records
        );
    }

    getCalendarWeekDays(anchorDate = this.calendarDate) {
        const weekStart = getMondayFirstWeekStart(anchorDate || getTodayIsoDate());
        return Array.from({ length: 7 }, (_, index) => {
            const date = addDaysIsoDate(weekStart, index);
            const parsed = parseIsoDateToUtc(date);
            const weekday = new Intl.DateTimeFormat(this.getLocale(), { weekday: "short", timeZone: "UTC" }).format(parsed);
            const dayNumber = new Intl.DateTimeFormat(this.getLocale(), { day: "numeric", timeZone: "UTC" }).format(parsed);
            return {
                date,
                weekday,
                dayNumber,
                isToday: date === getTodayIsoDate()
            };
        });
    }

    getCalendarRangeLabel(days = this.getCalendarWeekDays()) {
        const first = days[0]?.date;
        const last = days[days.length - 1]?.date;
        if (!first || !last) {
            return "";
        }

        const formatter = new Intl.DateTimeFormat(this.getLocale(), {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC"
        });
        return `${formatter.format(parseIsoDateToUtc(first))} - ${formatter.format(parseIsoDateToUtc(last))}`;
    }

    getCalendarRecordsByDate(records = []) {
        return records.reduce((groups, record) => {
            const date = normalizeDateKey(record.date);
            if (!date) {
                return groups;
            }

            const existing = groups.get(date) || [];
            existing.push(record);
            groups.set(date, existing);
            return groups;
        }, new Map());
    }

    openCalendarCleaningModal({ recordId = "", date = "" } = {}) {
        if (recordId) {
            const record = this.cleaningRecords.find((entry) => entry.id === recordId);
            if (!record) {
                return;
            }

            this.editingCleaningId = record.id;
            this.cleaningDraft = {
                date: record.date || getTodayIsoDate(),
                propertyName: record.propertyName || "",
                categoryKey: this.getCleaningCategoryKey(record.categoryKey || record.category),
                reservationSource: this.getCleaningReservationSource(record),
                guestAmount: toInputNumber(record.guestAmount),
                notes: record.notes || ""
            };
            this.calendarModalMode = "edit";
            this.render();
            return;
        }

        this.editingCleaningId = null;
        this.cleaningEntryMode = "single";
        this.cleaningDraft = {
            ...this.createDefaultCleaningDraft(),
            date: date || this.calendarDate || getTodayIsoDate()
        };
        this.calendarModalMode = "add";
        this.render();
    }

    closeCalendarCleaningModal() {
        this.calendarModalMode = "";
        this.editingCleaningId = null;
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.render();
    }

    renderCalendarTab(records = []) {
        const days = this.getCalendarWeekDays();
        const recordsByDate = this.getCalendarRecordsByDate(records);
        const weekRecordCount = days.reduce((count, day) => count + (recordsByDate.get(day.date)?.length || 0), 0);

        return `
            <section class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div class="flex flex-col gap-4 border-b border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("calendar.kicker"))}</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.getCalendarRangeLabel(days))}</h3>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <button type="button" data-action="calendar-prev-week" class="view-btn">${escapeHtml(this.tr("calendar.previous"))}</button>
                        <button type="button" data-action="calendar-today" class="view-btn">${escapeHtml(this.tr("calendar.today"))}</button>
                        <button type="button" data-action="calendar-next-week" class="view-btn">${escapeHtml(this.tr("calendar.next"))}</button>
                        <span class="ml-0 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 lg:ml-2">${escapeHtml(this.getRowsLabel(weekRecordCount))}</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-7 lg:divide-x lg:divide-y-0">
                    ${days.map((day) => this.renderCalendarDayColumn(day, recordsByDate.get(day.date) || [])).join("")}
                </div>
            </section>
            ${this.renderCalendarCleaningModal()}
        `;
    }

    renderCalendarCleaningModal() {
        if (!this.calendarModalMode) {
            return "";
        }

        const draft = this.cleaningDraft;
        const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
        const guestAmountField = this.getCleaningGuestAmountFieldState(draft, {
            enableSuggestion: !this.editingCleaningId,
            excludeRecordId: this.editingCleaningId || "",
            categoryKey
        });
        const previewRecord = createCleaningAhRecord({
            date: draft.date,
            propertyName: draft.propertyName,
            categoryKey,
            category: this.getCleaningCategoryLabel(categoryKey),
            reservationSource: this.categoryUsesReservationSource(categoryKey)
                ? (draft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                : CLEANING_AH_RESERVATION_SOURCES.direct,
            guestAmount: guestAmountField.numericValue || 0,
            notes: draft.notes
        });

        return `
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="cleaning-ah-calendar-modal-title">
                <section class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
                    <div class="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">${escapeHtml(this.tr("calendar.modalKicker"))}</div>
                            <h3 id="cleaning-ah-calendar-modal-title" class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.calendarModalMode === "edit" ? this.tr("calendar.editTitle") : this.tr("calendar.addTitle"))}</h3>
                        </div>
                        <button type="button" data-action="close-calendar-cleaning-modal" class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900" aria-label="${escapeHtml(t("common.cancel"))}">
                            <i class="fas fa-xmark" aria-hidden="true"></i>
                        </button>
                    </div>
                    <div class="px-5 pb-5">
                        ${this.renderCleaningSingleForm({
                            draft,
                            preview: previewRecord,
                            guestAmountField,
                            formId: "cleaning-ah-calendar-cleaning-form",
                            previewId: "cleaning-ah-calendar-cleaning-preview"
                        })}
                        <div class="mt-5 flex flex-wrap justify-end gap-3">
                            <button type="button" data-action="close-calendar-cleaning-modal" class="view-btn">${escapeHtml(t("common.cancel"))}</button>
                            <button type="submit" form="cleaning-ah-calendar-cleaning-form" class="view-btn active">${escapeHtml(this.calendarModalMode === "edit" ? this.tr("actions.saveChanges") : this.tr("actions.saveCleaning"))}</button>
                        </div>
                    </div>
                </section>
            </div>
        `;
    }

    renderCalendarDayColumn(day, records = []) {
        const sortedRecords = [...records].sort((left, right) => {
            return normalizeKey(left.propertyName).localeCompare(normalizeKey(right.propertyName));
        });

        return `
            <section class="min-h-[28rem] bg-slate-50/60">
                <header class="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(day.weekday)}</div>
                            <div class="mt-1 text-2xl font-semibold ${day.isToday ? "text-rose-600" : "text-slate-950"}">${escapeHtml(day.dayNumber)}</div>
                        </div>
                        <div class="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">${escapeHtml(String(sortedRecords.length))}</div>
                    </div>
                </header>
                <div class="space-y-2 px-2 py-3">
                    ${sortedRecords.length
                        ? sortedRecords.map((record, index) => this.renderCalendarCleaningChip(record, index + 1)).join("")
                        : `<div class="px-2 py-4 text-sm text-slate-400">${escapeHtml(this.tr("calendar.emptyDay"))}</div>`}
                    <button type="button" data-action="open-calendar-add-cleaning" data-date="${escapeHtml(day.date)}" class="mt-2 flex w-full items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900">
                        <span aria-hidden="true" class="mr-1 text-lg leading-none">+</span>${escapeHtml(this.tr("calendar.addCleaning"))}
                    </button>
                </div>
            </section>
        `;
    }

    getCalendarChipClasses(record = {}) {
        return "border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50";
    }

    renderCalendarCleaningChip(record, index) {
        return `
            <button type="button" data-action="open-calendar-edit-cleaning" data-id="${escapeHtml(record.id || "")}" class="group flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${this.getCalendarChipClasses(record)}">
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">${escapeHtml(String(index))}</span>
                <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-slate-900">${escapeHtml(record.propertyName || this.tr("labels.unknown"))}</span>
                    <span class="block truncate text-xs text-slate-500">${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))} · ${escapeHtml(this.formatCurrency(record.guestAmount))}</span>
                </span>
            </button>
        `;
    }

    renderRegisterTab(derivedCleanings, allDerivedCleanings = []) {
        const newestFirst = this.registerQueueSort === "newest";
        const sortedCleanings = [...derivedCleanings].sort((left, right) => {
            if (newestFirst) {
                return String(right.date || "").localeCompare(String(left.date || ""))
                    || normalizeKey(left.propertyName).localeCompare(normalizeKey(right.propertyName));
            }
            return String(left.date || "").localeCompare(String(right.date || ""))
                || normalizeKey(left.propertyName).localeCompare(normalizeKey(right.propertyName));
        });
        const quickCards = this.dedupeFastRegisterCards(sortedCleanings).slice(0, 30);

        const sortOptions = [
            ["oldest", this.tr("register.queueSortOldest")],
            ["newest", this.tr("register.queueSortNewest")]
        ];

        const compactToggleIcon = this.registerQueueCompact ? "fa-table-cells" : "fa-list";
        const compactToggleLabel = this.registerQueueCompact
            ? this.tr("register.queueExpandedView")
            : this.tr("register.queueCompactView");

        return `
            <div class="space-y-6">
                <section class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(28rem,0.82fr)_minmax(0,1.55fr)] 2xl:grid-cols-[minmax(34rem,0.78fr)_minmax(0,1.75fr)]">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm self-start xl:sticky xl:top-4">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">${escapeHtml(this.tr("register.entryKicker"))}</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("register.entryTitle"))}</h3>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("register.entryDescription"))}</p>
                        </div>
                        ${this.renderFastRegisterForm()}
                    </section>

                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("register.queueKicker"))}</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("register.queueTitle"))}</h3>
                                <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("register.queueDescription"))}</p>
                            </div>
                            <div class="flex flex-col items-end gap-2">
                                <div class="flex items-center gap-2">
                                    <div class="text-sm text-slate-500">${escapeHtml(this.getRowsLabel(quickCards.length))}</div>
                                    <button type="button" data-action="toggle-register-compact" class="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 transition" title="${escapeHtml(compactToggleLabel)}">
                                        <i class="fas ${compactToggleIcon} text-xs"></i>
                                    </button>
                                </div>
                                <div class="flex items-center gap-1 rounded-full bg-slate-100 p-1">
                                    ${sortOptions.map(([value, label]) => `
                                        <button
                                            type="button"
                                            data-action="set-register-queue-sort"
                                            data-sort="${escapeHtml(value)}"
                                            class="rounded-full px-3 py-1 text-xs font-medium transition ${this.registerQueueSort === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}"
                                        >${escapeHtml(label)}</button>
                                    `).join("")}
                                </div>
                            </div>
                        </div>
                        <div class="mt-5 ${this.registerQueueCompact ? "flex flex-col gap-1" : "grid grid-cols-1 gap-3 2xl:grid-cols-2"}">
                            ${quickCards.length
                                ? quickCards.map((record) => this.renderRegisterQueueCard(record)).join("")
                                : `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("register.emptyQueue"))}</div>`}
                        </div>
                    </section>
                </section>
            </div>
        `;
    }

    dedupeFastRegisterCards(records) {
        const seen = new Set();
        return records.filter((record) => {
            const key = record.id || `${record.date}|${record.propertyName}|${record.categoryKey || record.category}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    renderFastRegisterForm() {
        const draft = this.cleaningDraft;
        const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
        const guestAmountField = this.getCleaningGuestAmountFieldState(draft, {
            enableSuggestion: true,
            categoryKey
        });
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === categoryKey ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
            .join("");
        const reservationSourceOptions = [
            [CLEANING_AH_RESERVATION_SOURCES.platform, this.tr("reservationSources.platform")],
            [CLEANING_AH_RESERVATION_SOURCES.direct, this.tr("reservationSources.direct")]
        ];

        return `
            <form id="cleaning-ah-fast-register-form" class="mt-5 space-y-4">
                ${this.fastRegisterDuplicateWarning ? `
                    <div class="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                        <i class="fas fa-triangle-exclamation mt-0.5 shrink-0"></i>
                        <span>${escapeHtml(this.tr("register.duplicateWarning"))}</span>
                    </div>
                ` : ""}
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.cleaningDate"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.property"))}</span>
                        <input id="cleaning-ah-fast-property" type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
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
                    <label class="block md:col-span-2">
                        <span class="text-sm text-slate-600">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</span>
                        <input type="number" name="guestAmount" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(guestAmountField.inputValue)}" data-auto-suggested-value="${escapeHtml(guestAmountField.suggestedInputValue)}" required>
                    </label>
                </div>
                <label class="block">
                    <span class="text-sm text-slate-600">${escapeHtml(t("common.notes"))}</span>
                    <textarea name="notes" class="mt-1 w-full min-h-[76px]" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                </label>
                <div class="flex flex-wrap justify-end gap-3">
                    <button type="button" id="cleaning-ah-fast-reset" class="view-btn">${escapeHtml(this.tr("actions.reset"))}</button>
                    <button type="submit" data-save-mode="single" class="view-btn">${escapeHtml(this.tr("actions.saveCleaning"))}</button>
                    <button type="submit" data-save-mode="next" class="view-btn active">${escapeHtml(this.tr("actions.saveAndNext"))}</button>
                </div>
            </form>
        `;
    }

    renderRegisterQueueCard(record) {
        const compact = this.registerQueueCompact;

        if (compact) {
            return `
                <article class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-semibold text-slate-900">${escapeHtml(record.propertyName)}</div>
                        <div class="truncate text-xs text-slate-500">${escapeHtml(this.formatDate(record.date))} · ${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))} · ${escapeHtml(this.formatCurrency(record.guestAmount))}</div>
                    </div>
                    <div class="flex shrink-0 items-center gap-1.5">
                        <span class="text-xs font-semibold text-emerald-700">${escapeHtml(this.formatCurrency(record.totalToAh))}</span>
                        ${this.renderTableActionButton({ action: "prefill-fast-form", id: record.id, label: this.tr("actions.fillForm"), iconClass: "fas fa-arrow-left", tone: "primary" })}
                        ${this.renderTableActionButton({ action: "edit-cleaning", id: record.id, label: t("common.edit"), iconClass: "fas fa-pen", tone: "primary" })}
                        ${this.renderTableActionButton({ action: "delete-cleaning", id: record.id, label: t("common.delete"), iconClass: "fas fa-trash", tone: "danger" })}
                    </div>
                </article>
            `;
        }

        return `
            <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="text-sm font-semibold text-slate-900">${escapeHtml(record.propertyName)}</div>
                        <div class="mt-1 text-xs text-slate-500">${escapeHtml(this.formatDate(record.date))} · ${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))}</div>
                    </div>
                    <span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">${escapeHtml(this.formatCurrency(record.totalToAh))}</span>
                </div>
                ${record.notes ? `<div class="mt-2 text-xs text-slate-500">${escapeHtml(record.notes)}</div>` : ""}
                <div class="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div class="text-xs text-slate-500">${escapeHtml(this.tr("tables.guest"))}</div>
                        <div class="font-semibold text-slate-900">${escapeHtml(this.formatCurrency(record.guestAmount))}</div>
                    </div>
                    <div class="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <div class="text-xs text-slate-500">${escapeHtml(this.tr("tables.net"))}</div>
                        <div class="font-semibold text-slate-900">${escapeHtml(this.formatCurrency(record.totalToAh))}</div>
                    </div>
                </div>
                <div class="mt-3 flex flex-wrap justify-end gap-2">
                    ${this.renderTableActionButton({
                        action: "prefill-fast-form",
                        id: record.id,
                        label: this.tr("actions.fillForm"),
                        iconClass: "fas fa-arrow-left",
                        tone: "primary"
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
            </article>
        `;
    }

    openStatsProperty(propertyName) {
        const root = document.getElementById("cleaning-ah-root");
        if (!root || !propertyName) return;
        this.statsDetailPropertyName = propertyName;
        this.statsPropertyScrollPosition = { left: window.scrollX, top: window.scrollY };
        const cleanings = this.getStatsScopedCleaningRecords(this.getFilteredCleaningRecords(), this.statsCategoryKey);
        root.insertAdjacentHTML("beforeend", this.renderStatsPropertyModal(
            summarizeCleaningAhRecords(cleanings),
            summarizeLaundryRecords(this.getFilteredStandaloneLaundryRecords())
        ));
        this.bindStatsPropertyModal();
    }

    closeStatsProperty() {
        const propertyName = this.statsDetailPropertyName;
        this.statsDetailPropertyName = "";
        const dialog = document.getElementById("cleaning-ah-property-stats-dialog");
        dialog?.close();
        dialog?.remove();
        [...document.querySelectorAll("[data-action='open-stats-property']")]
            .find((button) => button.dataset.propertyName === propertyName)?.focus({ preventScroll: true });
        if (this.statsPropertyScrollPosition) {
            window.scrollTo({ ...this.statsPropertyScrollPosition, behavior: "instant" });
            this.statsPropertyScrollPosition = null;
        }
    }

    bindStatsPropertyModal(scrollTop = 0) {
        const dialog = document.getElementById("cleaning-ah-property-stats-dialog");
        if (!dialog) return;
        dialog.querySelector("[data-action='close-stats-property']").addEventListener("click", () => this.closeStatsProperty());
        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            this.closeStatsProperty();
        });
        dialog.addEventListener("click", (event) => {
            if (event.target !== dialog) return;
            const bounds = dialog.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
                this.closeStatsProperty();
            }
        });
        dialog.showModal();
        document.getElementById("cleaning-ah-property-stats-body").scrollTop = scrollTop;
    }

    renderStatsPropertyModal(cleaningSummary, laundrySummary) {
        const propertyName = this.statsDetailPropertyName;
        if (!propertyName) return "";
        const matchesProperty = (record) => normalizeKey(record.propertyName || "Unknown") === normalizeKey(propertyName);
        const propertyCleanings = summarizeCleaningAhRecords((cleaningSummary.records || []).filter(matchesProperty));
        const propertyLaundry = summarizeLaundryRecords((laundrySummary.entries || []).filter(matchesProperty));
        const combinedMonthly = combineCleaningAndLaundryMonthlySummaries(propertyCleanings.byMonth, propertyLaundry.byMonth);
        const finalNet = roundCurrency(propertyCleanings.totals.totalToAh - propertyLaundry.totals.amount);

        return `
            <dialog id="cleaning-ah-property-stats-dialog" class="cleaning-ah-property-dialog" aria-labelledby="cleaning-ah-property-stats-title">
                <div class="cleaning-ah-property-dialog__header flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div class="min-w-0">
                        <div class="cleaning-ah-card-kicker">${escapeHtml(this.tr("stats.focusKicker"))}</div>
                        <h2 id="cleaning-ah-property-stats-title" class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(propertyName)}</h2>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("stats.focusDescription"))}</p>
                    </div>
                    <button type="button" autofocus data-action="close-stats-property" aria-label="${escapeHtml(t("common.close"))}" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div id="cleaning-ah-property-stats-body" class="cleaning-ah-property-dialog__body space-y-5 p-5">
                    ${this.renderStatsSummaryCards(propertyCleanings, propertyLaundry)}
                    ${this.renderStatsViewContent(combinedMonthly, [], propertyCleanings, propertyLaundry, finalNet, [], "month")}
                </div>
            </dialog>
        `;
    }

    formatAverageRemainingPerCleaning(finalNetEarnings, cleaningCount) {
        const average = calculateAverageRemainingPerCleaning(finalNetEarnings, cleaningCount);
        return average === null ? "—" : this.formatCurrency(average);
    }

    renderStatsSummaryCards(cleaningSummary, laundrySummary) {
        const cleaningsNet = cleaningSummary.totals.totalToAh || 0;
        const laundryExpenses = laundrySummary.totals.amount || 0;
        const finalNet = roundCurrency(cleaningsNet - laundryExpenses);
        return `
                <!-- 1. Asana 3-Card Summary (The Bottom Line) -->
                <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <!-- Cleanings Card -->
                    <div class="cleaning-ah-card flex flex-col justify-between">
                        <div class="flex items-center justify-between">
                            <span class="cleaning-ah-card-kicker">${escapeHtml(this.tr("stats.cleaningsTitle"))}</span>
                            <span class="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">${escapeHtml(this.getRecordsLabel(cleaningSummary.totals.count))}</span>
                        </div>
                        <div class="my-3">
                            <div class="cleaning-ah-card-value">${escapeHtml(this.formatCurrency(cleaningsNet))}</div>
                            <div class="mt-1 text-xs text-slate-500 font-medium">${escapeHtml(this.tr("metrics.netToAh"))}</div>
                        </div>
                        <div class="border-t border-[#e1e4e8] pt-2.5 text-xs text-slate-500 space-y-1">
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("metrics.guestTotal"))}:</span> <span class="font-semibold text-slate-700">${escapeHtml(this.formatCurrency(cleaningSummary.totals.guestAmount))}</span></div>
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("metrics.platformFees"))} + ${escapeHtml(this.tr("metrics.vat"))}:</span> <span class="font-semibold text-slate-700">-${escapeHtml(this.formatCurrency(cleaningSummary.totals.platformCommission + cleaningSummary.totals.vatAmount))}</span></div>
                        </div>
                    </div>

                    <!-- Laundry Card -->
                    <div class="cleaning-ah-card flex flex-col justify-between">
                        <div class="flex items-center justify-between">
                            <span class="cleaning-ah-card-kicker">${escapeHtml(this.tr("stats.laundryTitle"))}</span>
                            <span class="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700">${escapeHtml(String(laundrySummary.totals.count))} ${escapeHtml(this.tr("tables.rows") || "rows")}</span>
                        </div>
                        <div class="my-3">
                            <div class="cleaning-ah-card-value text-rose-600">${escapeHtml(this.formatCurrency(laundryExpenses))}</div>
                            <div class="mt-1 text-xs text-slate-500 font-medium">${escapeHtml(this.tr("metrics.laundryExpenses"))}</div>
                        </div>
                        <div class="border-t border-[#e1e4e8] pt-2.5 text-xs text-slate-500 space-y-1">
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("metrics.quantity"))}:</span> <span class="font-semibold text-slate-700">${escapeHtml(String(laundrySummary.totals.quantity || 0))} items</span></div>
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("metrics.kg"))}:</span> <span class="font-semibold text-slate-700">${escapeHtml(this.formatNumber(laundrySummary.totals.kg))} kg</span></div>
                        </div>
                    </div>

                    <!-- Final Profit Card (Everything Together) -->
                    <div class="cleaning-ah-card cleaning-ah-card--profit flex flex-col justify-between">
                        <div class="flex items-center justify-between">
                            <span class="cleaning-ah-card-kicker text-emerald-800">${escapeHtml(this.tr("stats.everythingTogetherTitle"))}</span>
                            <span class="rounded-full bg-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">${escapeHtml(this.tr("metrics.finalNetProfit"))}</span>
                        </div>
                        <div class="my-3">
                            <div class="cleaning-ah-card-value ${finalNet >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatCurrency(finalNet))}</div>
                            <div class="mt-1 text-xs font-semibold text-emerald-800">${escapeHtml(this.tr("metrics.cleaningsNet"))} − ${escapeHtml(this.tr("metrics.laundryExpenses"))}</div>
                        </div>
                        <div class="border-t border-emerald-200/80 pt-2.5 text-xs text-emerald-950 space-y-1">
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("tabs.cleanings"))}:</span> <span class="font-bold text-emerald-900">+${escapeHtml(this.formatCurrency(cleaningsNet))}</span></div>
                            <div class="flex justify-between"><span>${escapeHtml(this.tr("tabs.laundry"))}:</span> <span class="font-bold text-rose-700">-${escapeHtml(this.formatCurrency(laundryExpenses))}</span></div>
                            <div class="mt-2 flex items-baseline justify-between gap-3 border-t border-emerald-200/80 pt-2" title="${escapeHtml(this.tr("stats.metricHelp.avgRemainingPerCleaning"))}">
                                <span>${escapeHtml(this.tr("metrics.avgRemainingPerCleaning"))}:</span>
                                <strong data-cleaning-average-remaining class="shrink-0 text-base ${finalNet >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatAverageRemainingPerCleaning(finalNet, cleaningSummary.totals.count))}</strong>
                            </div>
                        </div>
                    </div>
                </div>
        `;
    }

    renderStatsTab(cleaningSummary, statsPropertyRows, statsCategoryOptions, selectedStatsPropertyName, selectedStatsPropertyDetail, laundrySummary = {}, allStatsRecords = []) {
        const laundryByMonth = laundrySummary.byMonth || [];
        const cleaningsNet = cleaningSummary.totals.totalToAh || 0;
        const laundryExpenses = laundrySummary.totals.amount || 0;
        const finalNet = roundCurrency(cleaningsNet - laundryExpenses);
        const combinedMonthly = combineCleaningAndLaundryMonthlySummaries(cleaningSummary.byMonth, laundryByMonth);
        const combinedByProperty = combineCleaningAndLaundryPropertySummaries(cleaningSummary.byProperty, laundrySummary.byProperty || []);

        return `
            <section class="space-y-5">
                ${this.renderFilters()}
                ${this.renderStatsSummaryCards(cleaningSummary, laundrySummary)}

                <!-- 2. Asana Segmented View Switcher & Export Actions -->
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
                    <div class="cleaning-ah-segmented-control">
                        <button type="button" data-action="set-stats-view-mode" data-mode="month"
                            class="${this.statsViewMode === "month" ? "is-active" : ""}">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${escapeHtml(this.tr("stats.byMonth"))}</span>
                        </button>
                        <button type="button" data-action="set-stats-view-mode" data-mode="property"
                            class="${this.statsViewMode === "property" ? "is-active" : ""}">
                            <i class="fas fa-building"></i>
                            <span>${escapeHtml(this.tr("stats.topProperties"))}</span>
                        </button>
                        <button type="button" data-action="set-stats-view-mode" data-mode="heatmap"
                            class="${this.statsViewMode === "heatmap" ? "is-active" : ""}">
                            <i class="fas fa-th"></i>
                            <span>${escapeHtml(this.tr("stats.heatmapTitle"))}</span>
                        </button>
                    </div>

                    <button type="button" data-action="open-export-modal" class="cleaning-ah-btn-primary">
                        <i class="fas fa-file-export"></i>
                        <span>${escapeHtml(this.tr("stats.exportReport"))}</span>
                    </button>
                </div>

                <!-- 3. Dynamic View Content (By Month / By Property / Heatmap) -->
                ${this.renderStatsViewContent(combinedMonthly, combinedByProperty, cleaningSummary, laundrySummary, finalNet, allStatsRecords)}
            </section>
        `;
    }

    renderStatsViewContent(combinedMonthly, combinedByProperty, cleaningSummary, laundrySummary, finalNet, allStatsRecords, viewMode = this.statsViewMode) {
        if (viewMode === "heatmap") {
            return this.renderPropertyMonthHeatmap(allStatsRecords);
        }

        if (viewMode === "property") {
            return `
                <div class="cleaning-ah-table-container">
                    <div class="px-5 py-4 border-b border-[#e1e4e8] bg-white">
                        <h4 class="text-sm font-bold text-slate-900">${escapeHtml(this.tr("stats.topProperties"))}</h4>
                        <p class="text-xs text-slate-500 mt-0.5">Performance statement ranked by net revenue per property.</p>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="cleaning-ah-table">
                            <thead>
                                <tr>
                                    <th class="text-left">${escapeHtml(this.tr("tables.property"))}</th>
                                    <th class="text-right">${escapeHtml(this.tr("metrics.cleaningsNet"))}</th>
                                    <th class="text-right">${escapeHtml(this.tr("metrics.laundryExpenses"))}</th>
                                    <th class="text-right font-bold text-slate-900">${escapeHtml(this.tr("metrics.finalNetProfit"))}</th>
                                    <th class="text-right" title="${escapeHtml(this.tr("stats.metricHelp.avgRemainingPerCleaning"))}">${escapeHtml(this.tr("metrics.avgRemainingPerCleaning"))}</th>
                                    <th class="text-right">${escapeHtml(this.tr("tabs.cleanings"))}</th>
                                    <th class="text-right">${escapeHtml(this.tr("tabs.laundry"))} (kg)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${combinedByProperty.map((row) => `
                                    <tr>
                                        <td class="font-semibold text-slate-900"><button type="button" data-action="open-stats-property" data-property-name="${escapeHtml(row.label)}" aria-label="${escapeHtml(`${this.tr("stats.focusTitle")}: ${row.label}`)}" class="block w-full cursor-pointer rounded text-left text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600">${escapeHtml(row.label)}</button></td>
                                        <td class="text-right font-medium text-slate-800">${escapeHtml(this.formatCurrency(row.cleaningsNetToAh))}</td>
                                        <td class="text-right font-medium text-rose-600">${row.laundryAmount > 0 ? escapeHtml(this.formatCurrency(row.laundryAmount)) : "—"}</td>
                                        <td class="text-right font-bold ${row.finalNetEarnings >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatCurrency(row.finalNetEarnings))}</td>
                                        <td class="text-right font-semibold">${escapeHtml(this.formatAverageRemainingPerCleaning(row.finalNetEarnings, row.cleaningsCount))}</td>
                                        <td class="text-right text-xs text-slate-500">${escapeHtml(String(row.cleaningsCount))}</td>
                                        <td class="text-right text-xs text-slate-500">${row.laundryKg > 0 ? escapeHtml(this.formatNumber(row.laundryKg) + " kg") : "—"}</td>
                                    </tr>
                                `).join("")}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td>${escapeHtml(this.tr("tables.total"))}</td>
                                    <td class="text-right">${escapeHtml(this.formatCurrency(cleaningSummary.totals.totalToAh))}</td>
                                    <td class="text-right text-rose-600">${escapeHtml(this.formatCurrency(laundrySummary.totals.amount))}</td>
                                    <td class="text-right text-base font-extrabold ${finalNet >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatCurrency(finalNet))}</td>
                                    <td class="text-right font-semibold">${escapeHtml(this.formatAverageRemainingPerCleaning(finalNet, cleaningSummary.totals.count))}</td>
                                    <td class="text-right text-xs">${escapeHtml(String(cleaningSummary.totals.count))}</td>
                                    <td class="text-right text-xs">${escapeHtml(this.formatNumber(laundrySummary.totals.kg))} kg</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `;
        }

        // Default: By Month
        return `
            <div class="cleaning-ah-table-container">
                <div class="px-5 py-4 border-b border-[#e1e4e8] bg-white">
                    <h4 class="text-sm font-bold text-slate-900">${escapeHtml(this.tr("stats.consolidatedByMonthTitle"))}</h4>
                    <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(this.tr("stats.consolidatedByMonthDescription"))}</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="cleaning-ah-table">
                        <thead>
                            <tr>
                                <th class="text-left">${escapeHtml(this.tr("tables.month"))}</th>
                                <th class="text-right">${escapeHtml(this.tr("metrics.cleaningsNet"))}</th>
                                <th class="text-right">${escapeHtml(this.tr("metrics.laundryExpenses"))}</th>
                                <th class="text-right font-bold text-slate-900">${escapeHtml(this.tr("metrics.finalNetProfit"))}</th>
                                <th class="text-right" title="${escapeHtml(this.tr("stats.metricHelp.avgRemainingPerCleaning"))}">${escapeHtml(this.tr("metrics.avgRemainingPerCleaning"))}</th>
                                    <th class="text-right">${escapeHtml(this.tr("tabs.cleanings"))}</th>
                                <th class="text-right">${escapeHtml(this.tr("tabs.laundry"))} (kg)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${combinedMonthly.map((row) => `
                                <tr>
                                    <td class="font-semibold text-slate-900">${escapeHtml(this.formatMonthKey(row.label))}</td>
                                    <td class="text-right font-medium text-slate-800">${escapeHtml(this.formatCurrency(row.cleaningsNetToAh))}</td>
                                    <td class="text-right font-medium text-rose-600">${row.laundryAmount > 0 ? escapeHtml(this.formatCurrency(row.laundryAmount)) : "—"}</td>
                                    <td class="text-right font-bold ${row.finalNetEarnings >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatCurrency(row.finalNetEarnings))}</td>
                                    <td class="text-right font-semibold">${escapeHtml(this.formatAverageRemainingPerCleaning(row.finalNetEarnings, row.cleaningsCount))}</td>
                                        <td class="text-right text-xs text-slate-500">${escapeHtml(String(row.cleaningsCount))}</td>
                                    <td class="text-right text-xs text-slate-500">${row.laundryKg > 0 ? escapeHtml(this.formatNumber(row.laundryKg) + " kg") : "—"}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>${escapeHtml(this.tr("tables.total"))}</td>
                                <td class="text-right">${escapeHtml(this.formatCurrency(cleaningSummary.totals.totalToAh))}</td>
                                <td class="text-right text-rose-600">${escapeHtml(this.formatCurrency(laundrySummary.totals.amount))}</td>
                                <td class="text-right text-base font-extrabold ${finalNet >= 0 ? "text-emerald-700" : "text-rose-600"}">${escapeHtml(this.formatCurrency(finalNet))}</td>
                                <td class="text-right font-semibold">${escapeHtml(this.formatAverageRemainingPerCleaning(finalNet, cleaningSummary.totals.count))}</td>
                                    <td class="text-right text-xs">${escapeHtml(String(cleaningSummary.totals.count))}</td>
                                <td class="text-right text-xs">${escapeHtml(this.formatNumber(laundrySummary.totals.kg))} kg</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    }

    renderPropertyMonthHeatmap(records = []) {
        if (!records.length) return "";
        const cellMap = {};
        const propertyTotals = {};
        const monthsSet = new Set();

        records.forEach((record) => {
            const prop = record.propertyName || "Unknown";
            const month = (record.date || "").slice(0, 7);
            if (!month) return;

            monthsSet.add(month);
            if (!cellMap[prop]) cellMap[prop] = {};
            cellMap[prop][month] = (cellMap[prop][month] || 0) + 1;
            propertyTotals[prop] = (propertyTotals[prop] || 0) + 1;
        });

        const sortedMonths = [...monthsSet].sort();
        const sortedProperties = Object.keys(propertyTotals).sort((a, b) => propertyTotals[b] - propertyTotals[a]);

        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="mb-4">
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(this.tr("stats.heatmapKicker"))}</div>
                    <h3 class="mt-1 text-xl font-semibold text-slate-900">${escapeHtml(this.tr("stats.heatmapTitle"))}</h3>
                    <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("stats.heatmapDescription"))}</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-xs">
                        <thead>
                            <tr class="border-b border-slate-200">
                                <th class="py-2 pr-4 text-left font-semibold uppercase tracking-wider text-slate-500">${escapeHtml(this.tr("tables.property"))}</th>
                                ${sortedMonths.map((m) => `<th class="px-2 py-2 text-center font-semibold text-slate-600">${escapeHtml(m.slice(5))}</th>`).join("")}
                                <th class="py-2 pl-4 text-right font-semibold uppercase tracking-wider text-slate-500">${escapeHtml(this.tr("tables.total"))}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            ${sortedProperties.map((prop) => `
                                <tr class="hover:bg-slate-50">
                                    <td class="py-2 pr-4 font-medium text-slate-900">${escapeHtml(prop)}</td>
                                    ${sortedMonths.map((m) => {
                                        const count = cellMap[prop]?.[m] || 0;
                                        return `<td class="px-2 py-2 text-center"><button type="button" data-action="open-heatmap-detail" data-property="${escapeHtml(prop)}" data-month="${escapeHtml(m)}" class="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg transition ${count > 0 ? "bg-indigo-100 font-semibold text-indigo-800 hover:bg-indigo-200" : "text-slate-300"}">${escapeHtml(String(count))}</button></td>`;
                                    }).join("")}
                                    <td class="py-2 pl-4 text-right font-semibold text-slate-900">${escapeHtml(String(propertyTotals[prop] || 0))}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </section>
        `;
    }

    renderHeatmapDetailModal(records = []) {
        if (!this.heatmapDetailModal) return "";

        const { propertyName, monthKey } = this.heatmapDetailModal;
        const filtered = records.filter((r) => {
            return (r.propertyName || "Unknown") === propertyName
                && (r.date || "").slice(0, 7) === monthKey;
        });

        const totalGuest = filtered.reduce((sum, r) => sum + (r.guestAmount || 0), 0);
        const totalCommission = filtered.reduce((sum, r) => sum + (r.platformCommission || 0), 0);
        const totalVat = filtered.reduce((sum, r) => sum + (r.vatAmount || 0), 0);
        const totalNet = filtered.reduce((sum, r) => sum + (r.effectiveTotalToAh ?? r.totalToAh ?? 0), 0);

        return `
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true" data-action="close-heatmap-detail">
                <div class="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xl transition-all" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">${escapeHtml(this.tr("stats.heatmapDetailKicker"))}</div>
                            <h3 class="mt-1 text-lg font-semibold text-slate-900">
                                ${escapeHtml(propertyName)} &ndash; ${escapeHtml(this.formatMonthKey(monthKey))}
                            </h3>
                        </div>
                        <button type="button" data-action="close-heatmap-detail" class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="mt-4 overflow-y-auto pr-1">
                        <table class="w-full border-collapse text-left text-xs">
                            <thead>
                                <tr class="border-b border-slate-100 font-semibold uppercase tracking-wider text-slate-500">
                                    <th class="py-2.5 px-3">${escapeHtml(this.tr("tables.date"))}</th>
                                    <th class="py-2.5 px-3">${escapeHtml(this.tr("tables.category"))}</th>
                                    <th class="py-2.5 px-3">${escapeHtml(this.tr("tables.source"))}</th>
                                    <th class="py-2.5 px-3 text-right">${escapeHtml(this.tr("tables.amount"))}</th>
                                    <th class="py-2.5 px-3 text-right">${escapeHtml(this.tr("metrics.platformFees"))}</th>
                                    <th class="py-2.5 px-3 text-right">${escapeHtml(this.tr("metrics.vat"))}</th>
                                    <th class="py-2.5 px-3 text-right">${escapeHtml(this.tr("tables.net"))}</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 text-slate-700">
                                ${filtered.map((record) => {
                                    const sourceLabel = record.reservationSource === "platform" ? this.tr("reservationSources.platform") : this.tr("reservationSources.direct");
                                    const netVal = record.effectiveTotalToAh ?? record.totalToAh ?? 0;
                                    return `
                                        <tr class="hover:bg-slate-50/50">
                                            <td class="py-2.5 px-3 font-medium text-slate-900">${escapeHtml(record.date)}</td>
                                            <td class="py-2.5 px-3">${escapeHtml(this.getCleaningCategoryLabel(record.categoryKey || record.category))}</td>
                                            <td class="py-2.5 px-3">${escapeHtml(sourceLabel)}</td>
                                            <td class="py-2.5 px-3 text-right">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                                            <td class="py-2.5 px-3 text-right">${escapeHtml(this.formatCurrency(record.platformCommission))}</td>
                                            <td class="py-2.5 px-3 text-right">${escapeHtml(this.formatCurrency(record.vatAmount))}</td>
                                            <td class="py-2.5 px-3 text-right font-semibold text-slate-900">${escapeHtml(this.formatCurrency(netVal))}</td>
                                        </tr>
                                    `;
                                }).join("")}
                            </tbody>
                            <tfoot>
                                <tr class="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                                    <td class="py-2.5 px-3" colspan="3">${escapeHtml(this.tr("tables.total"))} (${filtered.length})</td>
                                    <td class="py-2.5 px-3 text-right">${escapeHtml(this.formatCurrency(totalGuest))}</td>
                                    <td class="py-2.5 px-3 text-right text-slate-700">${escapeHtml(this.formatCurrency(totalCommission))}</td>
                                    <td class="py-2.5 px-3 text-right text-slate-700">${escapeHtml(this.formatCurrency(totalVat))}</td>
                                    <td class="py-2.5 px-3 text-right text-emerald-700">${escapeHtml(this.formatCurrency(totalNet))}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    renderExportReportModal(records = [], laundrySummary = {}) {
        if (!this.exportModalActive) return "";

        const monthsSet = new Set();
        records.forEach((r) => {
            const m = (r.date || "").slice(0, 7);
            if (m) monthsSet.add(m);
        });
        const laundryByMonth = laundrySummary.byMonth || [];
        laundryByMonth.forEach((e) => {
            if (e.label) monthsSet.add(e.label);
        });
        const uniqueMonths = [...monthsSet].sort().reverse();

        return `
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" role="dialog" aria-modal="true" data-action="close-export-modal">
                <div class="relative flex w-full max-w-md flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-xl transition-all" onclick="event.stopPropagation()">
                    <div class="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">${escapeHtml(this.tr("stats.exportKicker"))}</div>
                            <h3 class="mt-1 text-lg font-semibold text-slate-900">${escapeHtml(this.tr("stats.exportTitle"))}</h3>
                        </div>
                        <button type="button" data-action="close-export-modal" class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="mt-4">
                        <p class="text-sm text-slate-600">${escapeHtml(this.tr("stats.exportDescription"))}</p>
                        
                        <label class="mt-4 block">
                            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("stats.exportSelectMonth"))}</span>
                            <select id="cleaning-ah-export-month-select" class="mt-2 w-full rounded-xl border border-slate-200 p-2 text-sm font-medium text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                ${uniqueMonths.map((m) => `
                                    <option value="${escapeHtml(m)}">${escapeHtml(this.formatMonthKey(m))}</option>
                                `).join("")}
                            </select>
                        </label>
                    </div>

                    <div class="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                        <button type="button" data-action="close-export-modal" class="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition">
                            ${escapeHtml(this.tr("actions.cancel"))}
                        </button>
                        <button type="button" data-action="generate-pdf-report" class="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm transition active:scale-95">
                            <i class="fas fa-download mr-1.5"></i>
                            ${escapeHtml(this.tr("stats.exportDownloadBtn"))}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    exportMonthReportAsPDF(monthKey) {
        const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
        if (!jsPDF) {
            this.setStatus(this.tr("status.pdfLibraryNotFound") || "PDF library not loaded.", "error");
            return;
        }

        const cleanings = deriveCleaningAhRecords(this.cleaningRecords, this.laundryRecords)
            .filter((r) => (r.date || "").slice(0, 7) === monthKey)
            .sort((a, b) => String(a.date || "").localeCompare(String(a.date || "")));

        const standaloneLaundry = this.laundryRecords
            .filter((r) => (r.date || "").slice(0, 7) === monthKey)
            .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));

        if (cleanings.length === 0 && standaloneLaundry.length === 0) {
            this.setStatus(this.tr("status.noDataForSelectedMonth") || "No data available for the selected month.", "info");
            return;
        }

        const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const monthName = this.formatMonthKey(monthKey);

        const brandColor = [79, 70, 229]; // Indigo-600
        const darkSlate = [15, 23, 42]; // Slate-900

        const drawHeaderFooter = (data) => {
            const pageCount = doc.internal.getNumberOfPages();
            
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.5);
            doc.line(15, 20, 195, 20);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(brandColor[0], brandColor[1], brandColor[2]);
            doc.text("ATLANTIC HOLIDAY", 15, 15);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text(`Financial Summary Report - ${monthName}`, 70, 15);
            doc.text(`Generated: ${new Date().toLocaleDateString()}`, 195, 15, { align: "right" });

            doc.line(15, 282, 195, 282);
            doc.text(`Page ${pageCount}`, 195, 287, { align: "right" });
            doc.text("Confidential - Internal Operations Document", 15, 287);
        };

        doc.setFont("helvetica", "bold");
        doc.setFontSize(22);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.text(`Month-End Summary: ${monthName}`, 15, 32);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text("Operational review and financial performance analysis for cleanings and standalone laundry services.", 15, 38);

        const grossGuest = cleanings.reduce((sum, c) => sum + (c.guestAmount || 0), 0);
        const fees = cleanings.reduce((sum, c) => sum + (c.platformCommission || 0), 0);
        const vat = cleanings.reduce((sum, c) => sum + (c.vatAmount || 0), 0);
        const netAhCleanings = cleanings.reduce((sum, c) => sum + (c.effectiveTotalToAh ?? c.totalToAh ?? 0), 0);
        const standaloneLaundryAmt = standaloneLaundry.reduce((sum, l) => sum + (l.amount || 0), 0);
        const standaloneLaundryKg = standaloneLaundry.reduce((sum, l) => sum + (l.kg || 0), 0);

        const finalNetAh = roundCurrency(netAhCleanings - standaloneLaundryAmt);

        const highlightsHead = [["Metric", "Value"]];
        const highlightsBody = [
            ["Total Cleanings", String(cleanings.length)],
            ["Gross Bookings Revenue", this.formatCurrency(grossGuest)],
            ["Platform Commission Fees", this.formatCurrency(fees)],
            ["VAT Liabilities (Estimated)", this.formatCurrency(vat)],
            ["Net AH Cleanings Revenue", this.formatCurrency(netAhCleanings)],
            ["Standalone Laundry Weight", `${this.formatNumber(standaloneLaundryKg)} kg`],
            ["Standalone Laundry Expenses", this.formatCurrency(standaloneLaundryAmt)],
            ["Final Net AH Profit (Cleanings - Laundry)", this.formatCurrency(finalNetAh)]
        ];

        doc.autoTable({
            startY: 45,
            head: highlightsHead,
            body: highlightsBody,
            theme: "striped",
            headStyles: { fillColor: brandColor, textColor: [255, 255, 255] },
            bodyStyles: { fontSize: 9 },
            columnStyles: {
                0: { fontStyle: "bold", width: 70 },
                1: { align: "right", fontStyle: "bold" }
            },
            margin: { left: 15, right: 15 },
            didDrawPage: drawHeaderFooter
        });

        let nextY = doc.lastAutoTable.finalY + 12;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
        doc.text("Cleanings Revenue by Property", 15, nextY);

        const propertyGroups = {};
        cleanings.forEach((c) => {
            const prop = c.propertyName || "Unknown";
            if (!propertyGroups[prop]) {
                propertyGroups[prop] = { count: 0, guestAmount: 0, platformCommission: 0, vatAmount: 0, netToAh: 0 };
            }
            propertyGroups[prop].count++;
            propertyGroups[prop].guestAmount += (c.guestAmount || 0);
            propertyGroups[prop].platformCommission += (c.platformCommission || 0);
            propertyGroups[prop].vatAmount += (c.vatAmount || 0);
            propertyGroups[prop].netToAh += (c.effectiveTotalToAh ?? c.totalToAh ?? 0);
        });

        const propertyRows = Object.entries(propertyGroups).map(([name, data]) => {
            return [
                name,
                String(data.count),
                this.formatCurrency(data.guestAmount),
                this.formatCurrency(data.platformCommission),
                this.formatCurrency(data.vatAmount),
                this.formatCurrency(data.netToAh)
            ];
        });

        doc.autoTable({
            startY: nextY + 4,
            head: [["Property", "Cleanings", "Gross Rev", "Platform Fees", "VAT", "Net AH"]],
            body: propertyRows,
            theme: "striped",
            headStyles: { fillColor: brandColor, textColor: [255, 255, 255] },
            bodyStyles: { fontSize: 8 },
            columnStyles: {
                0: { fontStyle: "bold" },
                1: { align: "right" },
                2: { align: "right" },
                3: { align: "right" },
                4: { align: "right" },
                5: { align: "right", fontStyle: "bold" }
            },
            margin: { left: 15, right: 15 },
            didDrawPage: drawHeaderFooter
        });

        nextY = doc.lastAutoTable.finalY + 12;

        if (nextY > 230) {
            doc.addPage();
            nextY = 32;
        }

        if (standaloneLaundry.length > 0) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(darkSlate[0], darkSlate[1], darkSlate[2]);
            doc.text("Standalone Laundry Log", 15, nextY);

            const laundryRows = standaloneLaundry.map((l) => [
                l.date,
                l.propertyName || "Unknown",
                String(l.quantity ?? 1),
                this.formatNumber(l.kg),
                this.formatCurrency(l.laundryRatePerKg || 2.30),
                this.formatCurrency(l.amount),
                l.notes || ""
            ]);

            doc.autoTable({
                startY: nextY + 4,
                head: [["Date", "Property", "Qty", "Weight (Kg)", "Rate / Kg", "Amount", "Notes"]],
                body: laundryRows,
                theme: "striped",
                headStyles: { fillColor: [14, 116, 144], textColor: [255, 255, 255] },
                bodyStyles: { fontSize: 8 },
                columnStyles: {
                    0: { fontStyle: "bold" },
                    2: { align: "right" },
                    3: { align: "right" },
                    4: { align: "right" },
                    5: { align: "right", fontStyle: "bold" }
                },
                margin: { left: 15, right: 15 },
                didDrawPage: drawHeaderFooter
            });
        }

        const filename = `financial-report-${monthKey}.pdf`;
        doc.save(filename);
        this.setStatus(`Report generated successfully: ${filename}`, "success");
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
                    <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        ${this.renderMetricCard(this.tr("metrics.guestTotal"), this.formatCurrency(detail.totals.guestAmount))}
                        ${this.renderMetricCard(this.tr("metrics.netToAh"), this.formatCurrency(detail.totals.totalToAh))}
                        ${this.renderMetricCard(this.tr("metrics.avgNetPerCleaning"), this.formatCurrency(detail.totals.averageTotalToAh))}
                        ${this.renderMetricCard(this.tr("metrics.lastEntry"), detail.totals.lastEntryDate ? this.formatDate(detail.totals.lastEntryDate) : "—")}
                    </div>
                </section>
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByMonth"), detail.byMonth, [
                    [this.tr("tables.month"), (entry) => this.formatMonthKey(entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                    [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByCategory"), detail.byCategory, [
                    [this.tr("tables.category"), (entry) => this.getCleaningCategoryLabel(entry.key || entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
                    [this.tr("tables.net"), (entry) => this.formatCurrency(entry.totalToAh)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("stats.focusByReservation"), detail.byReservationSource, [
                    [this.tr("tables.reservation"), (entry) => this.getReservationSourceLabel(entry.key || entry.label)],
                    [this.tr("tables.count"), (entry) => String(entry.count)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.guestAmount)],
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

    groupCleaningsByMonth(records = []) {
        const map = new Map();
        records.forEach((record) => {
            const monthKey = record.monthKey || (record.date ? record.date.slice(0, 7) : "unknown");
            if (!map.has(monthKey)) {
                map.set(monthKey, { monthKey, records: [], netSum: 0, guestSum: 0 });
            }
            const group = map.get(monthKey);
            group.records.push(record);
            group.netSum = roundCurrency(group.netSum + (record.effectiveTotalToAh ?? record.totalToAh ?? 0));
            group.guestSum = roundCurrency(group.guestSum + (record.guestAmount ?? 0));
        });
        return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }

    groupLaundryByMonth(records = []) {
        const map = new Map();
        records.forEach((record) => {
            const monthKey = record.monthKey || (record.date ? record.date.slice(0, 7) : "unknown");
            if (!map.has(monthKey)) {
                map.set(monthKey, { monthKey, records: [], amountSum: 0, kgSum: 0, qtySum: 0 });
            }
            const group = map.get(monthKey);
            group.records.push(record);
            group.amountSum = roundCurrency(group.amountSum + (record.amount || 0));
            group.kgSum = roundCurrency(group.kgSum + (record.kg || 0));
            group.qtySum += (record.quantity || 1);
        });
        return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }

    groupSpecialCleaningsByMonth(records = []) {
        const map = new Map();
        records.forEach((record) => {
            const monthKey = record.monthKey || (record.date ? record.date.slice(0, 7) : "unknown");
            if (!map.has(monthKey)) {
                map.set(monthKey, { monthKey, records: [], costSum: 0 });
            }
            const group = map.get(monthKey);
            group.records.push(record);
            group.costSum = roundCurrency(group.costSum + (record.cost || 0));
        });
        return Array.from(map.values()).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
    }

    openCleaningDrawer(recordId = null, defaults = {}) {
        if (recordId) {
            const record = this.cleaningRecords.find((r) => r.id === recordId);
            if (record) {
                this.editingCleaningId = record.id;
                this.cleaningDraft = {
                    id: record.id,
                    date: record.date || getTodayIsoDate(),
                    propertyName: record.propertyName || "",
                    categoryKey: this.getCleaningCategoryKey(record.categoryKey || record.category),
                    reservationSource: this.getCleaningReservationSource(record),
                    guestAmount: toInputNumber(record.guestAmount),
                    notes: record.notes || ""
                };
                this.activeDrawer = { type: "cleaning", id: record.id };
                this.render();
                return;
            }
        }
        this.editingCleaningId = null;
        this.cleaningDraft = {
            ...this.createDefaultCleaningDraft(),
            date: defaults.date || (defaults.month ? `${defaults.month}-01` : getTodayIsoDate()),
            propertyName: defaults.propertyName || ""
        };
        this.activeDrawer = { type: "cleaning", id: null };
        this.render();
    }

    openLaundryDrawer(recordId = null, defaults = {}) {
        if (recordId) {
            const record = this.laundryRecords.find((r) => r.id === recordId);
            if (record) {
                this.editingLaundryId = record.id;
                this.laundryDraft = {
                    id: record.id,
                    date: record.date || getTodayIsoDate(),
                    propertyName: record.propertyName || "",
                    quantity: String(record.quantity ?? 1),
                    kg: toInputNumber(record.kg),
                    laundryRatePerKg: toInputNumber(record.laundryRatePerKg || this.getLaundryRateForProperty(record.propertyName)),
                    notes: record.notes || ""
                };
                this.activeDrawer = { type: "laundry", id: record.id };
                this.render();
                return;
            }
        }
        this.editingLaundryId = null;
        this.laundryDraft = {
            ...this.createDefaultLaundryDraft(),
            date: defaults.date || (defaults.month ? `${defaults.month}-01` : getTodayIsoDate()),
            propertyName: defaults.propertyName || ""
        };
        this.activeDrawer = { type: "laundry", id: null };
        this.render();
    }

    openSpecialCleaningDrawer(recordId = null, defaults = {}) {
        if (recordId) {
            const record = this.specialCleaningRecords.find((r) => r.id === recordId);
            if (record) {
                this.editingSpecialCleaningId = record.id;
                this.specialCleaningDraft = {
                    id: record.id,
                    date: record.date || getTodayIsoDate(),
                    propertyName: record.propertyName || "",
                    specialType: record.specialType || "deep",
                    cost: toInputNumber(record.cost),
                    description: record.description || "",
                    notes: record.notes || ""
                };
                this.activeDrawer = { type: "special", id: record.id };
                this.render();
                return;
            }
        }
        this.editingSpecialCleaningId = null;
        this.specialCleaningDraft = {
            ...this.createDefaultSpecialCleaningDraft(),
            date: defaults.date || (defaults.month ? `${defaults.month}-01` : getTodayIsoDate()),
            propertyName: defaults.propertyName || ""
        };
        this.activeDrawer = { type: "special", id: null };
        this.render();
    }

    closeDrawer() {
        this.activeDrawer = null;
        this.editingCleaningId = null;
        this.editingLaundryId = null;
        this.editingSpecialCleaningId = null;
        this.render();
    }

    renderCleaningsTab(filteredCleanings) {
        const groups = this.groupCleaningsByMonth(filteredCleanings);
        const isBatchMode = this.cleaningEntryMode === "batch";

        return `
            <div class="space-y-4">
                <!-- Asana Action Toolbar -->
                <div class="cleaning-action-toolbar">
                    <div class="cleaning-toolbar-left">
                        <button type="button" data-action="open-cleaning-drawer" class="cleaning-btn-create">
                            <i class="fas fa-plus"></i>
                            <span>${escapeHtml(this.tr("cleanings.addTitle") || "Adicionar limpeza")}</span>
                        </button>
                        <button type="button" data-action="toggle-cleaning-batch-view" class="cleaning-btn-secondary text-xs">
                            <i class="fas ${isBatchMode ? "fa-list" : "fa-layer-group"} mr-1.5"></i>
                            <span>${isBatchMode ? "Ver como Lista" : "Entrada em Lote"}</span>
                        </button>
                    </div>
                    <div class="cleaning-toolbar-right">
                        <div class="relative flex items-center">
                            <i class="fas fa-search absolute left-3 text-xs text-slate-400"></i>
                            <input id="cleaning-ah-search" type="search" class="cleaning-search-input" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}">
                        </div>
                        <select id="cleaning-ah-month-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allMonths"))}</option>
                            ${this.getMonthOptions().map((m) => `<option value="${m}" ${m === this.selectedMonthKey ? "selected" : ""}>${this.formatMonthKey(m)}</option>`).join("")}
                        </select>
                        <select id="cleaning-ah-property-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allProperties"))}</option>
                            ${this.getFilterPropertyNames().map((p) => `<option value="${escapeHtml(p)}" ${normalizeKey(p) === normalizeKey(this.selectedPropertyName) ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
                        </select>
                        <select id="cleaning-ah-category-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allCategories"))}</option>
                            ${this.getKnownCategories().map((c) => `<option value="${escapeHtml(c.key)}" ${c.key === this.selectedCategory ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
                        </select>
                    </div>
                </div>

                ${isBatchMode ? `
                    <div class="p-6 bg-white border border-[#e1e4e8] rounded-2xl shadow-sm">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h3 class="text-base font-bold text-slate-900">${escapeHtml(this.tr("cleanings.batchTitle"))}</h3>
                                <p class="text-xs text-slate-500">${escapeHtml(this.tr("cleanings.batchDescription"))}</p>
                            </div>
                            <button type="submit" form="cleaning-ah-cleaning-batch-form" class="cleaning-btn-create">${escapeHtml(this.tr("actions.saveCleaningBatch"))}</button>
                        </div>
                        ${this.renderCleaningBatchForm(this.getCleaningBatchPreview())}
                    </div>
                ` : `
                    <div class="cleaning-list-container border border-[#e1e4e8] rounded-2xl overflow-hidden shadow-sm">
                        ${this.renderAsanaCleaningsList(groups, filteredCleanings)}
                    </div>
                `}

                ${this.renderImportBlock()}
            </div>
        `;
    }

    renderAsanaCleaningsList(groups, allFiltered = []) {
        if (!allFiltered.length) {
            return `
                <div class="p-12 text-center text-slate-500">
                    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 text-lg">
                        <i class="fas fa-broom"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-800">${escapeHtml(this.tr("cleanings.empty"))}</h3>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Clique em "+ Adicionar limpeza" para registar a primeira limpeza nesta vista.</p>
                </div>
            `;
        }

        return `
            <div class="cleaning-list-table">
                ${groups.map((group) => {
                    const isCollapsed = this.collapsedSections.has(group.monthKey);
                    return `
                        <div class="cleaning-section ${isCollapsed ? "is-collapsed" : ""}">
                            <div class="cleaning-section__heading" data-action="toggle-section" data-section="${escapeHtml(group.monthKey)}">
                                <span class="cleaning-section__toggle">
                                    <i class="fas fa-chevron-down"></i>
                                </span>
                                <h2>${escapeHtml(this.formatMonthKey(group.monthKey))}</h2>
                                <div class="cleaning-section__meta">
                                    <span>${escapeHtml(this.getRecordsLabel(group.records.length))}</span>
                                    <span>·</span>
                                    <span>${escapeHtml(this.tr("metrics.netToAh"))}: <strong>${escapeHtml(this.formatCurrency(group.netSum))}</strong></span>
                                </div>
                            </div>
                            <div class="cleaning-section__content">
                                <div class="cleaning-list__columns">
                                    <span>#</span>
                                    <span>${escapeHtml(this.tr("tables.property"))}</span>
                                    <span>${escapeHtml(this.tr("tables.date"))}</span>
                                    <span>${escapeHtml(this.tr("tables.category"))}</span>
                                    <span>${escapeHtml(this.tr("tables.reservation"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.guest"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.net"))}</span>
                                    <span></span>
                                </div>
                                ${group.records.map((record) => this.renderAsanaCleaningRow(record)).join("")}
                                <button type="button" class="cleaning-add-row" data-action="open-cleaning-drawer" data-month="${escapeHtml(group.monthKey)}">
                                    <i class="fas fa-plus"></i>
                                    <span>${escapeHtml(this.tr("cleanings.addTitle") || "Adicionar limpeza...")}</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    renderAsanaCleaningRow(record) {
        const catKey = this.getCleaningCategoryKey(record.categoryKey || record.category);
        const isPlatform = this.getCleaningReservationSource(record) === "platform";
        const pillClass = catKey === "check_out"
            ? "cleaning-pill--checkout"
            : catKey === "owner"
            ? "cleaning-pill--owner"
            : "cleaning-pill--direct";

        return `
            <article class="cleaning-row" data-action="open-cleaning-drawer" data-id="${escapeHtml(record.id)}">
                <span>
                    <button type="button" class="cleaning-check-btn" data-action="open-cleaning-drawer" data-id="${escapeHtml(record.id)}" title="Ver detalhes">
                        <i class="fas fa-check"></i>
                    </button>
                </span>
                <span>
                    <strong class="font-semibold text-slate-900 truncate">${escapeHtml(record.propertyName)}</strong>
                    ${record.notes ? `<small class="text-slate-400 ml-2 truncate font-normal">(${escapeHtml(record.notes)})</small>` : ""}
                </span>
                <span class="text-xs text-slate-500 font-medium whitespace-nowrap">
                    ${escapeHtml(this.formatDate(record.date))}
                </span>
                <span>
                    <span class="cleaning-pill ${pillClass}">${escapeHtml(this.getCleaningCategoryLabel(catKey))}</span>
                </span>
                <span>
                    <span class="cleaning-pill ${isPlatform ? "cleaning-pill--platform" : "cleaning-pill--direct"}">${escapeHtml(this.getReservationSourceLabel(this.getCleaningReservationSource(record)))}</span>
                </span>
                <span class="text-right text-xs font-medium text-slate-600">
                    ${escapeHtml(this.formatCurrency(record.guestAmount))}
                </span>
                <span class="text-right font-bold text-slate-900">
                    ${escapeHtml(this.formatCurrency(record.effectiveTotalToAh ?? record.totalToAh))}
                </span>
                <span class="text-right">
                    <button type="button" class="text-slate-400 hover:text-slate-700" data-action="open-cleaning-drawer" data-id="${escapeHtml(record.id)}">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                </span>
            </article>
        `;
    }

    renderCleaningSingleForm({ draft, preview, guestAmountField, formId = "cleaning-ah-cleaning-form", previewId = "cleaning-ah-cleaning-preview", extraContent = "" }) {
        const categoryKey = this.getCleaningCategoryKey(draft.categoryKey || draft.category);
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category.key)}" ${category.key === categoryKey ? "selected" : ""}>${escapeHtml(category.label)}</option>`)
            .join("");
        const reservationSourceOptions = [
            [CLEANING_AH_RESERVATION_SOURCES.platform, this.tr("reservationSources.platform")],
            [CLEANING_AH_RESERVATION_SOURCES.direct, this.tr("reservationSources.direct")]
        ];

        return `
            <form id="${escapeHtml(formId)}" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.cleaningDate"))}</span>
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
                    <label class="block md:col-span-2">
                        <span class="text-sm text-slate-600">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</span>
                        <input type="number" name="guestAmount" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(guestAmountField.inputValue)}" data-auto-suggested-value="${escapeHtml(guestAmountField.suggestedInputValue)}" required>
                    </label>
                </div>
                <label class="block">
                    <span class="text-sm text-slate-600">${escapeHtml(t("common.notes"))}</span>
                    <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">${escapeHtml(draft.notes)}</textarea>
                </label>
                <p class="text-sm text-slate-500">${escapeHtml(this.getCleaningCategoryRuleText(categoryKey))}</p>
                <div id="${escapeHtml(previewId)}">
                    ${this.renderCleaningPreview(preview)}
                </div>
                ${extraContent}
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
                    <div class="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid lg:grid-cols-[minmax(16rem,1.35fr)_150px_minmax(14rem,1fr)_auto] lg:gap-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.property"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</div>
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
                                <div class="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(16rem,1.35fr)_150px_minmax(14rem,1fr)_auto] lg:items-start" data-cleaning-batch-row="${escapeHtml(row.rowId)}">
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(this.tr("forms.property"))} ${index + 1}</span>
                                        <input type="text" name="propertyName" class="w-full" value="${escapeHtml(row.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}">
                                    </label>
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(this.getCleaningAmountLabel(categoryKey))}</span>
                                        <input type="number" name="guestAmount" class="w-full" step="0.01" min="0" value="${escapeHtml(guestAmountField.inputValue)}" data-auto-suggested-value="${escapeHtml(guestAmountField.suggestedInputValue)}" placeholder="0">
                                    </label>
                                    <label class="block">
                                        <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(t("common.notes"))}</span>
                                        <input type="text" name="notes" class="w-full" value="${escapeHtml(row.notes)}" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">
                                    </label>
                                    <div class="flex items-center justify-end lg:pt-0.5">
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
        const groups = this.groupLaundryByMonth(filteredStandaloneLaundry);
        const isBatchMode = this.laundryEntryMode === "batch";

        return `
            <div class="space-y-4">
                <!-- Asana Action Toolbar -->
                <div class="cleaning-action-toolbar">
                    <div class="cleaning-toolbar-left">
                        <button type="button" data-action="open-laundry-drawer" class="cleaning-btn-create">
                            <i class="fas fa-plus"></i>
                            <span>${escapeHtml(this.tr("laundryTab.addTitle") || "Adicionar lavandaria")}</span>
                        </button>
                        <button type="button" data-action="toggle-laundry-batch-view" class="cleaning-btn-secondary text-xs">
                            <i class="fas ${isBatchMode ? "fa-list" : "fa-layer-group"} mr-1.5"></i>
                            <span>${isBatchMode ? "Ver como Lista" : "Entrada em Lote"}</span>
                        </button>
                    </div>
                    <div class="cleaning-toolbar-right">
                        <div class="relative flex items-center">
                            <i class="fas fa-search absolute left-3 text-xs text-slate-400"></i>
                            <input id="cleaning-ah-search" type="search" class="cleaning-search-input" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}">
                        </div>
                        <select id="cleaning-ah-month-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allMonths"))}</option>
                            ${this.getMonthOptions().map((m) => `<option value="${m}" ${m === this.selectedMonthKey ? "selected" : ""}>${this.formatMonthKey(m)}</option>`).join("")}
                        </select>
                        <select id="cleaning-ah-property-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allProperties"))}</option>
                            ${this.getFilterPropertyNames().map((p) => `<option value="${escapeHtml(p)}" ${normalizeKey(p) === normalizeKey(this.selectedPropertyName) ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
                        </select>
                    </div>
                </div>

                ${isBatchMode ? `
                    <div class="p-6 bg-white border border-[#e1e4e8] rounded-2xl shadow-sm">
                        <div class="flex items-center justify-between mb-4">
                            <div>
                                <h3 class="text-base font-bold text-slate-900">${escapeHtml(this.tr("laundryTab.batchTitle"))}</h3>
                                <p class="text-xs text-slate-500">${escapeHtml(this.tr("laundryTab.batchDescription"))}</p>
                            </div>
                            <button type="submit" form="cleaning-ah-laundry-batch-form" class="cleaning-btn-create">${escapeHtml(this.tr("actions.saveLaundryBatch"))}</button>
                        </div>
                        ${this.renderLaundryBatchForm(this.getLaundryBatchPreview())}
                    </div>
                ` : `
                    <div class="cleaning-list-container border border-[#e1e4e8] rounded-2xl overflow-hidden shadow-sm">
                        ${this.renderAsanaLaundryList(groups, filteredStandaloneLaundry)}
                    </div>
                `}

                ${this.renderLaundrySummaryBlock(laundrySummary)}
            </div>
        `;
    }

    renderAsanaLaundryList(groups, allFiltered = []) {
        if (!allFiltered.length) {
            return `
                <div class="p-12 text-center text-slate-500">
                    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 text-lg">
                        <i class="fas fa-tshirt"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-800">${escapeHtml(this.tr("laundryTab.empty"))}</h3>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Clique em "+ Adicionar lavandaria" para registar despesas de lavandaria.</p>
                </div>
            `;
        }

        return `
            <div class="cleaning-list-table">
                ${groups.map((group) => {
                    const isCollapsed = this.collapsedSections.has(`laundry-${group.monthKey}`);
                    return `
                        <div class="cleaning-section ${isCollapsed ? "is-collapsed" : ""}">
                            <div class="cleaning-section__heading" data-action="toggle-section" data-section="laundry-${escapeHtml(group.monthKey)}">
                                <span class="cleaning-section__toggle">
                                    <i class="fas fa-chevron-down"></i>
                                </span>
                                <h2>${escapeHtml(this.formatMonthKey(group.monthKey))}</h2>
                                <div class="cleaning-section__meta">
                                    <span>${escapeHtml(String(group.records.length))} registos</span>
                                    <span>·</span>
                                    <span>${escapeHtml(this.formatNumber(group.kgSum))} kg</span>
                                    <span>·</span>
                                    <span>Despesa: <strong class="text-rose-600">${escapeHtml(this.formatCurrency(group.amountSum))}</strong></span>
                                </div>
                            </div>
                            <div class="cleaning-section__content">
                                <div class="cleaning-list__columns" style="grid-template-columns: 44px minmax(220px, 2fr) 110px 100px 100px 100px 130px 60px;">
                                    <span>#</span>
                                    <span>${escapeHtml(this.tr("tables.property"))}</span>
                                    <span>${escapeHtml(this.tr("tables.date"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.quantity") || "Qty")}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.kg"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.ratePerKg"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("tables.amount"))}</span>
                                    <span></span>
                                </div>
                                ${group.records.map((record) => this.renderAsanaLaundryRow(record)).join("")}
                                <button type="button" class="cleaning-add-row" data-action="open-laundry-drawer" data-month="${escapeHtml(group.monthKey)}">
                                    <i class="fas fa-plus"></i>
                                    <span>${escapeHtml(this.tr("laundryTab.addTitle") || "Adicionar lavandaria...")}</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    renderAsanaLaundryRow(record) {
        return `
            <article class="cleaning-row" style="grid-template-columns: 44px minmax(220px, 2fr) 110px 100px 100px 100px 130px 60px;" data-action="open-laundry-drawer" data-id="${escapeHtml(record.id)}">
                <span>
                    <button type="button" class="cleaning-check-btn" data-action="open-laundry-drawer" data-id="${escapeHtml(record.id)}" title="Ver detalhes">
                        <i class="fas fa-check"></i>
                    </button>
                </span>
                <span>
                    <strong class="font-semibold text-slate-900 truncate">${escapeHtml(record.propertyName)}</strong>
                    ${record.notes ? `<small class="text-slate-400 ml-2 truncate font-normal">(${escapeHtml(record.notes)})</small>` : ""}
                </span>
                <span class="text-xs text-slate-500 font-medium whitespace-nowrap">
                    ${escapeHtml(this.formatDate(record.date))}
                </span>
                <span class="text-right text-xs font-semibold text-slate-700">
                    ${escapeHtml(String(record.quantity ?? 1))}
                </span>
                <span class="text-right text-xs text-slate-600">
                    ${escapeHtml(this.formatNumber(record.kg))} kg
                </span>
                <span class="text-right text-xs text-slate-600">
                    ${escapeHtml(this.formatCurrency(record.laundryRatePerKg))}
                </span>
                <span class="text-right font-bold text-rose-600">
                    ${escapeHtml(this.formatCurrency(record.amount))}
                </span>
                <span class="text-right">
                    <button type="button" class="text-slate-400 hover:text-slate-700" data-action="open-laundry-drawer" data-id="${escapeHtml(record.id)}">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                </span>
            </article>
        `;
    }

    renderLaundrySingleForm({ draft, preview }) {
        return `
            <form id="cleaning-ah-laundry-form" class="mt-5 space-y-4">
                <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.laundryReceivedDate"))}</span>
                        <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.property"))}</span>
                        <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.quantity") || "Quantity")}</span>
                        <input type="number" name="quantity" class="mt-1 w-full" step="1" min="0" value="${escapeHtml(toInputNumber(draft.quantity))}" placeholder="1">
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.kg"))}</span>
                        <input type="number" name="kg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.kg))}" placeholder="0">
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.ratePerKg"))}</span>
                        <input type="number" name="laundryRatePerKg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.laundryRatePerKg))}" required>
                    </label>
                    <label class="block">
                        <span class="text-sm text-slate-600">${escapeHtml(this.tr("forms.amount"))}</span>
                        <input type="number" name="amount" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.amount))}" placeholder="0.00">
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
                    <div class="hidden border-b border-slate-200 bg-slate-50 px-4 py-3 lg:grid lg:grid-cols-[minmax(14rem,1.2fr)_100px_110px_minmax(12rem,1fr)_auto] lg:gap-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.property"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.quantity") || "Qty")}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(this.tr("forms.kg"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(t("common.notes"))}</div>
                        <div class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 text-right">${escapeHtml(this.tr("tables.actions"))}</div>
                    </div>
                    <div class="divide-y divide-slate-200">
                        ${rows.map((row, index) => `
                            <div class="grid grid-cols-1 gap-3 px-4 py-4 lg:grid-cols-[minmax(14rem,1.2fr)_100px_110px_minmax(12rem,1fr)_auto] lg:items-start" data-laundry-batch-row="${escapeHtml(row.rowId)}">
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(this.tr("forms.property"))} ${index + 1}</span>
                                    <input type="text" name="propertyName" class="w-full" value="${escapeHtml(row.propertyName)}" list="cleaning-ah-property-options" placeholder="${escapeHtml(this.tr("forms.propertyPlaceholder"))}">
                                </label>
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(this.tr("forms.quantity") || "Qty")}</span>
                                    <input type="number" name="quantity" class="w-full" step="1" min="0" value="${escapeHtml(toInputNumber(row.quantity))}" placeholder="1">
                                </label>
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(this.tr("forms.kg"))}</span>
                                    <input type="number" name="kg" class="w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(row.kg))}" placeholder="0">
                                </label>
                                <label class="block">
                                    <span class="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 lg:hidden">${escapeHtml(t("common.notes"))}</span>
                                    <input type="text" name="notes" class="w-full" value="${escapeHtml(row.notes)}" placeholder="${escapeHtml(this.tr("forms.notesPlaceholder"))}">
                                </label>
                                <div class="flex items-center justify-end lg:pt-0.5">
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

    renderCleaningPreview(previewRecord) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("preview.title"))}</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard(this.tr("metrics.commission"), this.formatCurrency(previewRecord.platformCommission))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.vat"), this.formatCurrency(previewRecord.vatAmount))}
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
                    ${this.renderPreviewMetricCard(this.tr("metrics.quantity") || "Quantity", String(previewRecord.quantity || 0))}
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
                    ${this.renderPreviewMetricCard(this.tr("metrics.quantity") || "Quantity", String(preview.quantity || 0))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.kg"), this.formatNumber(preview.kg))}
                    ${this.renderPreviewMetricCard(this.tr("metrics.amount"), this.formatCurrency(preview.amount), "emphasis")}
                </div>
            </div>
        `;
    }

    renderCleaningInlineEditRow(record) {
        const categoryKey = this.getCleaningCategoryKey(this.cleaningDraft.categoryKey || this.cleaningDraft.category);
        const guestAmountField = this.getCleaningGuestAmountFieldState(this.cleaningDraft, {
            enableSuggestion: false,
            excludeRecordId: this.editingCleaningId || "",
            categoryKey
        });
        const previewRecord = createCleaningAhRecord({
            date: this.cleaningDraft.date,
            propertyName: this.cleaningDraft.propertyName,
            categoryKey,
            category: this.getCleaningCategoryLabel(categoryKey),
            reservationSource: this.categoryUsesReservationSource(categoryKey)
                ? (this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform)
                : CLEANING_AH_RESERVATION_SOURCES.direct,
            guestAmount: guestAmountField.numericValue || 0,
            notes: this.cleaningDraft.notes
        });

        return `
            <tr class="border-b border-slate-100">
                <td colspan="7" class="px-3 pb-4 pt-0">
                    <div class="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">${escapeHtml(this.tr("cleanings.editTitle"))}</div>
                                <div class="mt-1 text-sm font-medium text-slate-900">${escapeHtml(record.propertyName || "")}</div>
                            </div>
                            <div class="flex flex-wrap gap-3">
                                <button type="button" id="cleaning-ah-cancel-inline-cleaning-edit" class="view-btn">${escapeHtml(this.tr("actions.cancelEdit"))}</button>
                                <button type="submit" form="cleaning-ah-inline-cleaning-form" class="view-btn active">${escapeHtml(this.tr("actions.saveChanges"))}</button>
                            </div>
                        </div>
                        ${this.renderCleaningSingleForm({
                            draft: this.cleaningDraft,
                            preview: previewRecord,
                            guestAmountField,
                            formId: "cleaning-ah-inline-cleaning-form",
                            previewId: "cleaning-ah-inline-cleaning-preview"
                        })}
                    </div>
                </td>
            </tr>
        `;
    }

    renderCleaningsTable(records) {
        if (!records.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("cleanings.empty"))}</div>`;
        }

        return `
            <div class="cleaning-ah-table-container">
                <table class="cleaning-ah-table">
                    <thead>
                        <tr>
                            <th class="text-left">${escapeHtml(this.tr("tables.date"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("tables.property"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("tables.category"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("tables.reservation"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.guest"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.net"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map((record) => {
                            const isInlineCleaningEditOpen = this.editingCleaningId === record.id;
                            const catKey = this.getCleaningCategoryKey(record.categoryKey || record.category);
                            const pillClass = catKey === "check_out"
                                ? "cleaning-ah-pill--checkout"
                                : catKey === "owner"
                                ? "cleaning-ah-pill--owner"
                                : "cleaning-ah-pill--direct";
                            return `
                            <tr>
                                <td class="text-xs text-slate-500 font-medium whitespace-nowrap">${escapeHtml(this.formatDate(record.date))}</td>
                                <td>
                                    <div class="font-semibold text-slate-900">${escapeHtml(record.propertyName)}</div>
                                    ${record.notes ? `<div class="mt-0.5 text-xs text-slate-400">${escapeHtml(record.notes)}</div>` : ""}
                                    ${record.importWarnings?.length ? `<div class="mt-0.5 text-xs text-amber-600">${escapeHtml(this.getWarningsLabel(record.importWarnings.length))}</div>` : ""}
                                </td>
                                <td><span class="cleaning-ah-pill ${pillClass}">${escapeHtml(this.getCleaningCategoryLabel(catKey))}</span></td>
                                <td><span class="cleaning-ah-pill ${this.getCleaningReservationSource(record) === "platform" ? "cleaning-ah-pill--platform" : "cleaning-ah-pill--direct"}">${escapeHtml(this.getReservationSourceLabel(this.getCleaningReservationSource(record)))}</span></td>
                                <td class="text-right text-xs font-medium text-slate-600">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                                <td class="text-right font-bold text-slate-900">${escapeHtml(this.formatCurrency(record.effectiveTotalToAh ?? record.totalToAh))}</td>
                                <td class="text-right whitespace-nowrap">
                                    <div class="inline-flex justify-end gap-1.5">
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
                            ${isInlineCleaningEditOpen ? this.renderCleaningInlineEditRow(record) : ""}
                        `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderLaundryTable(entries) {
        if (!entries.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("laundryTab.empty"))}</div>`;
        }

        return `
            <div class="cleaning-ah-table-container">
                <table class="cleaning-ah-table">
                    <thead>
                        <tr>
                            <th class="text-left">${escapeHtml(this.tr("tables.laundryReceivedDate"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("tables.property"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.quantity") || "Qty")}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.kg"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.ratePerKg"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.amount"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map((entry) => `
                            <tr>
                                <td class="text-xs text-slate-500 font-medium whitespace-nowrap">${escapeHtml(this.formatDate(entry.date))}</td>
                                <td>
                                    <div class="font-semibold text-slate-900">${escapeHtml(entry.propertyName)}</div>
                                    ${entry.notes ? `<div class="mt-0.5 text-xs text-slate-400">${escapeHtml(entry.notes)}</div>` : ""}
                                </td>
                                <td class="text-right text-xs font-semibold text-slate-700">${escapeHtml(String(entry.quantity ?? 1))}</td>
                                <td class="text-right text-xs text-slate-600">${escapeHtml(this.formatNumber(entry.kg))} kg</td>
                                <td class="text-right text-xs text-slate-600">${escapeHtml(this.formatCurrency(entry.laundryRatePerKg))}</td>
                                <td class="text-right font-bold text-rose-600">${escapeHtml(this.formatCurrency(entry.amount))}</td>
                                <td class="text-right whitespace-nowrap">
                                    <div class="inline-flex justify-end gap-1.5">
                                        ${this.renderTableActionButton({
                                            action: "edit-laundry",
                                            id: entry.id,
                                            label: t("common.edit"),
                                            iconClass: "fas fa-pen",
                                            tone: "primary"
                                        })}
                                        ${this.renderTableActionButton({
                                            action: "delete-laundry",
                                            id: entry.id,
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
            </div>
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
                <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                    ${this.renderMetricCard(this.tr("metrics.quantity") || "Quantity", String(laundrySummary.totals.quantity || 0))}
                    ${this.renderMetricCard(this.tr("metrics.kg"), this.formatNumber(laundrySummary.totals.kg))}
                    ${this.renderMetricCard(this.tr("metrics.amount"), this.formatCurrency(laundrySummary.totals.amount))}
                    ${this.renderMetricCard(this.tr("metrics.rows"), String(laundrySummary.totals.count))}
                </div>
                ${this.renderFinancialSummaryTable(this.tr("dashboard.laundryByMonth"), laundrySummary.byMonth, [
                    [this.tr("tables.month"), (entry) => this.formatMonthKey(entry.label)],
                    [this.tr("tables.quantity") || "Qty", (entry) => String(entry.quantity || 0)],
                    [this.tr("tables.rows"), (entry) => String(entry.count)],
                    [this.tr("tables.kg"), (entry) => this.formatNumber(entry.kg)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.amount)]
                ])}
                ${this.renderFinancialSummaryTable(this.tr("dashboard.laundryByProperty"), laundrySummary.byProperty.slice(0, 8), [
                    [this.tr("tables.property"), (entry) => entry.label],
                    [this.tr("tables.quantity") || "Qty", (entry) => String(entry.quantity || 0)],
                    [this.tr("tables.rows"), (entry) => String(entry.count)],
                    [this.tr("tables.kg"), (entry) => this.formatNumber(entry.kg)],
                    [this.tr("tables.amount"), (entry) => this.formatCurrency(entry.amount)]
                ])}
            </section>
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

    renderSpecialCleaningsTab(records) {
        const groups = this.groupSpecialCleaningsByMonth(records);

        return `
            <div class="space-y-4">
                <!-- Asana Action Toolbar -->
                <div class="cleaning-action-toolbar">
                    <div class="cleaning-toolbar-left">
                        <button type="button" data-action="open-special-drawer" class="cleaning-btn-create">
                            <i class="fas fa-plus"></i>
                            <span>${escapeHtml(this.tr("specialCleanings.addTitle") || "Adicionar limpeza especial")}</span>
                        </button>
                        <span class="text-xs text-slate-500 hidden sm:inline">${escapeHtml(this.tr("specialCleanings.costHint"))}</span>
                    </div>
                    <div class="cleaning-toolbar-right">
                        <div class="relative flex items-center">
                            <i class="fas fa-search absolute left-3 text-xs text-slate-400"></i>
                            <input id="cleaning-ah-search" type="search" class="cleaning-search-input" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}">
                        </div>
                        <select id="cleaning-ah-month-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allMonths"))}</option>
                            ${this.getMonthOptions().map((m) => `<option value="${m}" ${m === this.selectedMonthKey ? "selected" : ""}>${this.formatMonthKey(m)}</option>`).join("")}
                        </select>
                        <select id="cleaning-ah-property-filter" class="cleaning-select-filter">
                            <option value="">${escapeHtml(this.tr("filters.allProperties"))}</option>
                            ${this.getFilterPropertyNames().map((p) => `<option value="${escapeHtml(p)}" ${normalizeKey(p) === normalizeKey(this.selectedPropertyName) ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
                        </select>
                    </div>
                </div>

                <div class="cleaning-list-container border border-[#e1e4e8] rounded-2xl overflow-hidden shadow-sm">
                    ${this.renderAsanaSpecialCleaningsList(groups, records)}
                </div>
            </div>
        `;
    }

    renderAsanaSpecialCleaningsList(groups, allFiltered = []) {
        if (!allFiltered.length) {
            return `
                <div class="p-12 text-center text-slate-500">
                    <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 text-lg">
                        <i class="fas fa-sparkles"></i>
                    </div>
                    <h3 class="text-sm font-bold text-slate-800">${escapeHtml(this.tr("specialCleanings.empty"))}</h3>
                    <p class="text-xs text-slate-400 mt-1 max-w-sm mx-auto">Clique em "+ Adicionar limpeza especial" para registar limpezas profundas ou extraordinárias.</p>
                </div>
            `;
        }

        return `
            <div class="cleaning-list-table">
                ${groups.map((group) => {
                    const isCollapsed = this.collapsedSections.has(`special-${group.monthKey}`);
                    return `
                        <div class="cleaning-section ${isCollapsed ? "is-collapsed" : ""}">
                            <div class="cleaning-section__heading" data-action="toggle-section" data-section="special-${escapeHtml(group.monthKey)}">
                                <span class="cleaning-section__toggle">
                                    <i class="fas fa-chevron-down"></i>
                                </span>
                                <h2>${escapeHtml(this.formatMonthKey(group.monthKey))}</h2>
                                <div class="cleaning-section__meta">
                                    <span>${escapeHtml(String(group.records.length))} registos</span>
                                    <span>·</span>
                                    <span>Custo total: <strong class="text-slate-900">${escapeHtml(this.formatCurrency(group.costSum))}</strong></span>
                                </div>
                            </div>
                            <div class="cleaning-section__content">
                                <div class="cleaning-list__columns" style="grid-template-columns: 44px minmax(200px, 2fr) 110px 140px 120px minmax(180px, 2fr) 60px;">
                                    <span>#</span>
                                    <span>${escapeHtml(this.tr("tables.property"))}</span>
                                    <span>${escapeHtml(this.tr("tables.date"))}</span>
                                    <span>${escapeHtml(this.tr("specialCleanings.typeLabel"))}</span>
                                    <span class="text-right">${escapeHtml(this.tr("specialCleanings.costLabel"))}</span>
                                    <span>${escapeHtml(this.tr("specialCleanings.descriptionLabel"))}</span>
                                    <span></span>
                                </div>
                                ${group.records.map((record) => this.renderAsanaSpecialCleaningRow(record)).join("")}
                                <button type="button" class="cleaning-add-row" data-action="open-special-drawer" data-month="${escapeHtml(group.monthKey)}">
                                    <i class="fas fa-plus"></i>
                                    <span>${escapeHtml(this.tr("specialCleanings.addTitle") || "Adicionar limpeza especial...")}</span>
                                </button>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>
        `;
    }

    renderAsanaSpecialCleaningRow(record) {
        return `
            <article class="cleaning-row" style="grid-template-columns: 44px minmax(200px, 2fr) 110px 140px 120px minmax(180px, 2fr) 60px;" data-action="open-special-drawer" data-id="${escapeHtml(record.id)}">
                <span>
                    <button type="button" class="cleaning-check-btn" data-action="open-special-drawer" data-id="${escapeHtml(record.id)}" title="Ver detalhes">
                        <i class="fas fa-check"></i>
                    </button>
                </span>
                <span>
                    <strong class="font-semibold text-slate-900 truncate">${escapeHtml(record.propertyName)}</strong>
                    ${record.notes ? `<small class="text-slate-400 ml-2 truncate font-normal">(${escapeHtml(record.notes)})</small>` : ""}
                </span>
                <span class="text-xs text-slate-500 font-medium whitespace-nowrap">
                    ${escapeHtml(this.formatDate(record.date))}
                </span>
                <span>
                    <span class="cleaning-pill cleaning-pill--direct">${escapeHtml(this.getSpecialCleaningTypeLabel(record.specialType))}</span>
                </span>
                <span class="text-right font-bold text-slate-900">
                    ${escapeHtml(this.formatCurrency(record.cost))}
                </span>
                <span class="text-xs text-slate-600 truncate">
                    ${escapeHtml(record.description || "—")}
                </span>
                <span class="text-right">
                    <button type="button" class="text-slate-400 hover:text-slate-700" data-action="open-special-drawer" data-id="${escapeHtml(record.id)}">
                        <i class="fas fa-pen text-xs"></i>
                    </button>
                </span>
            </article>
        `;
    }

    renderSpecialCleaningsTable(records) {
        if (!records.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">${escapeHtml(this.tr("specialCleanings.empty"))}</div>`;
        }

        return `
            <div class="cleaning-ah-table-container">
                <table class="cleaning-ah-table">
                    <thead>
                        <tr>
                            <th class="text-left">${escapeHtml(this.tr("tables.date"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("tables.property"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("specialCleanings.typeLabel"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("specialCleanings.costLabel"))}</th>
                            <th class="text-left">${escapeHtml(this.tr("specialCleanings.descriptionLabel"))}</th>
                            <th class="text-left">${escapeHtml(t("common.notes"))}</th>
                            <th class="text-right">${escapeHtml(this.tr("tables.actions"))}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map((record) => `
                            <tr>
                                <td class="text-xs text-slate-500 font-medium whitespace-nowrap">${escapeHtml(this.formatDate(record.date))}</td>
                                <td class="font-semibold text-slate-900">${escapeHtml(record.propertyName)}</td>
                                <td><span class="cleaning-ah-pill cleaning-ah-pill--checkout">${escapeHtml(this.getSpecialCleaningTypeLabel(record.specialType))}</span></td>
                                <td class="text-right font-bold text-slate-900">${escapeHtml(this.formatCurrency(record.cost || 0))}</td>
                                <td class="text-xs text-slate-600">${escapeHtml(record.description || "—")}</td>
                                <td class="text-xs text-slate-500">${escapeHtml(record.notes || "—")}</td>
                                <td class="text-right whitespace-nowrap">
                                    <div class="inline-flex justify-end gap-1.5">
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
            </div>
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

        document.querySelectorAll("[data-action='calendar-prev-week']").forEach((button) => {
            button.addEventListener("click", () => {
                this.calendarDate = addDaysIsoDate(this.calendarDate, -7);
                this.render();
            });
        });
        document.querySelectorAll("[data-action='calendar-next-week']").forEach((button) => {
            button.addEventListener("click", () => {
                this.calendarDate = addDaysIsoDate(this.calendarDate, 7);
                this.render();
            });
        });
        document.querySelectorAll("[data-action='calendar-today']").forEach((button) => {
            button.addEventListener("click", () => {
                this.calendarDate = getTodayIsoDate();
                this.render();
            });
        });
        document.querySelectorAll("[data-action='open-calendar-add-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.openCalendarCleaningModal({
                date: button.dataset.date || getTodayIsoDate()
            }));
        });
        document.querySelectorAll("[data-action='open-calendar-edit-cleaning']").forEach((button) => {
            button.addEventListener("click", () => this.openCalendarCleaningModal({
                recordId: button.dataset.id || ""
            }));
        });
        document.querySelectorAll("[data-action='close-calendar-cleaning-modal']").forEach((button) => {
            button.addEventListener("click", () => this.closeCalendarCleaningModal());
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
            this.focusAfterRender = "cleaning-ah-search";
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
        document.querySelectorAll("[data-action='open-stats-property']").forEach((button) => {
            button.addEventListener("click", () => {
                this.openStatsProperty(button.dataset.propertyName || "");
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
        document.querySelectorAll("[data-action='set-register-queue-sort']").forEach((button) => {
            button.addEventListener("click", () => {
                this.registerQueueSort = button.dataset.sort || "oldest";
                localStorage.setItem("cleaningAhRegisterQueueSort", this.registerQueueSort);
                this.render();
            });
        });
        document.querySelector("[data-action='toggle-register-compact']")?.addEventListener("click", () => {
            this.registerQueueCompact = !this.registerQueueCompact;
            localStorage.setItem("cleaningAhRegisterQueueCompact", String(this.registerQueueCompact));
            this.render();
        });
        document.querySelectorAll("[data-action='prefill-fast-form']").forEach((button) => {
            button.addEventListener("click", () => {
                const id = button.dataset.id;
                const allDerived = deriveCleaningAhRecords(this.cleaningRecords, this.laundryRecords);
                const record = allDerived.find((r) => r.id === id) || this.cleaningRecords.find((r) => r.id === id);
                if (!record) return;
                this.cleaningDraft = {
                    ...this.cleaningDraft,
                    date: record.date || this.cleaningDraft.date,
                    propertyName: record.propertyName || "",
                    categoryKey: record.categoryKey || record.category || DEFAULT_CLEANING_CATEGORY_KEY,
                    reservationSource: record.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform
                };
                this.render();
                this.applyCleaningSuggestionToFastForm();
                document.getElementById("cleaning-ah-fast-register-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
        });

        const fastRegisterForm = document.getElementById("cleaning-ah-fast-register-form");
        fastRegisterForm?.addEventListener("input", (event) => {
            if (event.target?.name === "propertyName") {
                this.applyCleaningSuggestionToFastForm();
            }
            this.cleaningDraft = this.readCleaningDraftFromForm(fastRegisterForm);
            const draft = this.cleaningDraft;
            if (draft.date && draft.propertyName) {
                const normProp = normalizeKey(draft.propertyName);
                this.fastRegisterDuplicateWarning = this.cleaningRecords.some(
                    (r) => r.date === draft.date && normalizeKey(r.propertyName) === normProp
                );
            } else {
                this.fastRegisterDuplicateWarning = false;
            }
            if (event.target?.name === "categoryKey" || event.target?.name === "propertyName" || event.target?.name === "date") {
                this.render();
            }
        });
        fastRegisterForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.cleaningDraft = this.readCleaningDraftFromForm(fastRegisterForm);
            const submitter = event.submitter;
            this.saveCleaningRecord({
                keepContext: submitter?.dataset?.saveMode === "next"
            });
        });
        document.getElementById("cleaning-ah-fast-reset")?.addEventListener("click", () => {
            this.cleaningDraft = this.createDefaultCleaningDraft();
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

        const calendarCleaningForm = document.getElementById("cleaning-ah-calendar-cleaning-form");
        calendarCleaningForm?.addEventListener("input", (event) => {
            if (event.target?.name === "categoryKey") {
                this.cleaningDraft = this.readCleaningDraftFromForm(calendarCleaningForm);
                this.render();
                return;
            }
            if (event.target?.name === "propertyName") {
                this.applyCleaningSuggestionToForm(calendarCleaningForm);
            }
            this.cleaningDraft = this.readCleaningDraftFromForm(calendarCleaningForm);
            this.updateCleaningPreview("cleaning-ah-calendar-cleaning-preview");
        });
        calendarCleaningForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.cleaningDraft = this.readCleaningDraftFromForm(calendarCleaningForm);
            this.saveCleaningRecord();
        });

        const inlineCleaningForm = document.getElementById("cleaning-ah-inline-cleaning-form");
        inlineCleaningForm?.addEventListener("input", (event) => {
            if (event.target?.name === "categoryKey") {
                this.cleaningDraft = this.readCleaningDraftFromForm(inlineCleaningForm);
                this.render();
                return;
            }
            this.cleaningDraft = this.readCleaningDraftFromForm(inlineCleaningForm);
            this.updateCleaningPreview("cleaning-ah-inline-cleaning-preview");
        });
        inlineCleaningForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.cleaningDraft = this.readCleaningDraftFromForm(inlineCleaningForm);
            this.saveCleaningRecord();
        });
        document.getElementById("cleaning-ah-cancel-inline-cleaning-edit")?.addEventListener("click", () => this.resetCleaningForm());

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
        laundryForm?.addEventListener("change", (event) => {
            if (event.target?.name === "propertyName" || event.target?.name === "date") {
                this.laundryDraft = this.readLaundryDraftFromDom();
                this.render();
            }
        });
        laundryForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveLaundryRecord();
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
        document.querySelectorAll("[data-action='open-heatmap-detail']").forEach((button) => {
            button.addEventListener("click", () => {
                this.heatmapDetailModal = {
                    propertyName: button.dataset.property || "",
                    monthKey: button.dataset.month || ""
                };
                this.render();
            });
        });
        document.querySelectorAll("[data-action='close-heatmap-detail']").forEach((element) => {
            element.addEventListener("click", () => {
                this.heatmapDetailModal = null;
                this.render();
            });
        });
        document.querySelectorAll("[data-action='set-stats-view-mode']").forEach((button) => {
            button.addEventListener("click", () => {
                this.statsViewMode = button.dataset.mode || "month";
                this.render();
            });
        });
        document.querySelectorAll("[data-action='open-export-modal']").forEach((button) => {
            button.addEventListener("click", () => {
                this.exportModalActive = true;
                this.render();
            });
        });
        document.querySelectorAll("[data-action='close-export-modal']").forEach((element) => {
            element.addEventListener("click", () => {
                this.exportModalActive = false;
                this.render();
            });
        });
        document.querySelectorAll("[data-action='generate-pdf-report']").forEach((button) => {
            button.addEventListener("click", () => {
                const select = document.getElementById("cleaning-ah-export-month-select");
                if (select) {
                    const monthKey = select.value;
                    this.exportMonthReportAsPDF(monthKey);
                }
                this.exportModalActive = false;
                this.render();
            });
        });

        document.querySelectorAll("[data-action='open-cleaning-drawer']").forEach((button) => {
            button.addEventListener("click", () => this.openCleaningDrawer(button.dataset.id || null, { month: button.dataset.month }));
        });
        document.querySelectorAll("[data-action='open-laundry-drawer']").forEach((button) => {
            button.addEventListener("click", () => this.openLaundryDrawer(button.dataset.id || null, { month: button.dataset.month }));
        });
        document.querySelectorAll("[data-action='open-special-drawer']").forEach((button) => {
            button.addEventListener("click", () => this.openSpecialCleaningDrawer(button.dataset.id || null, { month: button.dataset.month }));
        });
        document.querySelectorAll("[data-action='close-drawer']").forEach((element) => {
            element.addEventListener("click", () => this.closeDrawer());
        });
        document.querySelectorAll("[data-action='toggle-section']").forEach((element) => {
            element.addEventListener("click", () => {
                const s = element.dataset.section;
                if (this.collapsedSections.has(s)) {
                    this.collapsedSections.delete(s);
                } else {
                    this.collapsedSections.add(s);
                }
                this.render();
            });
        });
        document.querySelectorAll("[data-action='toggle-cleaning-batch-view']").forEach((button) => {
            button.addEventListener("click", () => {
                this.cleaningEntryMode = this.cleaningEntryMode === "batch" ? "single" : "batch";
                this.render();
            });
        });
        document.querySelectorAll("[data-action='toggle-laundry-batch-view']").forEach((button) => {
            button.addEventListener("click", () => {
                this.laundryEntryMode = this.laundryEntryMode === "batch" ? "single" : "batch";
                this.render();
            });
        });
        document.getElementById("cleaning-ah-drawer-cleaning-form")?.addEventListener("input", (event) => {
            this.cleaningDraft = this.readCleaningDraftFromForm(event.currentTarget);
            this.updateCleaningDrawerLiveCalc();
        });
        document.getElementById("cleaning-ah-drawer-cleaning-form")?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.cleaningDraft = this.readCleaningDraftFromForm(event.currentTarget);
            this.saveCleaningRecord();
            this.closeDrawer();
        });
        document.getElementById("cleaning-ah-drawer-laundry-form")?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.laundryDraft = this.readLaundryDraftFromDom();
            this.saveLaundryRecord();
            this.closeDrawer();
        });
        document.getElementById("cleaning-ah-drawer-special-form")?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.specialCleaningDraft = this.readSpecialCleaningDraftFromDom();
            this.saveSpecialCleaningRecord();
            this.closeDrawer();
        });
        document.querySelectorAll("[data-action='drawer-delete-cleaning']").forEach((button) => {
            button.addEventListener("click", () => {
                this.deleteCleaning(button.dataset.id || "");
                this.closeDrawer();
            });
        });
        document.querySelectorAll("[data-action='drawer-delete-laundry']").forEach((button) => {
            button.addEventListener("click", () => {
                this.deleteLaundry(button.dataset.id || "");
                this.closeDrawer();
            });
        });
        document.querySelectorAll("[data-action='drawer-delete-special']").forEach((button) => {
            button.addEventListener("click", () => {
                this.deleteSpecialCleaning(button.dataset.id || "");
                this.closeDrawer();
            });
        });
    }

    updateCleaningDrawerLiveCalc() {
        const form = document.getElementById("cleaning-ah-drawer-cleaning-form");
        if (!form) return;
        const draft = this.readCleaningDraftFromForm(form);
        const isPlatform = (draft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform) === CLEANING_AH_RESERVATION_SOURCES.platform;
        const guestAmountNum = Number(draft.guestAmount) || 0;
        const commission = isPlatform ? roundCurrency(guestAmountNum * 0.155) : 0;
        const vat = isPlatform ? roundCurrency((guestAmountNum - commission) * 0.22 / 1.22) : roundCurrency(guestAmountNum * 0.22 / 1.22);
        const netAh = roundCurrency(guestAmountNum - commission - vat);

        const card = form.querySelector(".cleaning-detail__live-calc");
        if (card) {
            card.innerHTML = `
                <h4>${escapeHtml(this.tr("formula.title") || "Cálculo Líquido AH")}</h4>
                <div class="cleaning-detail__live-calc-grid">
                    <div class="cleaning-calc-box">
                        <small>${escapeHtml(this.tr("metrics.platformFees"))}</small>
                        <strong class="text-rose-600">-${escapeHtml(this.formatCurrency(commission))}</strong>
                    </div>
                    <div class="cleaning-calc-box">
                        <small>${escapeHtml(this.tr("metrics.vat"))}</small>
                        <strong class="text-rose-600">-${escapeHtml(this.formatCurrency(vat))}</strong>
                    </div>
                    <div class="cleaning-calc-box bg-emerald-50 border-emerald-200">
                        <small class="text-emerald-800">${escapeHtml(this.tr("metrics.netToAh"))}</small>
                        <strong class="text-emerald-700">${escapeHtml(this.formatCurrency(netAh))}</strong>
                    </div>
                </div>
            `;
        }
    }

    readCleaningDraftFromDom() {
        const form = document.getElementById("cleaning-ah-drawer-cleaning-form")
            || document.getElementById("cleaning-ah-inline-cleaning-form")
            || document.getElementById("cleaning-ah-calendar-cleaning-form")
            || document.getElementById("cleaning-ah-fast-register-form")
            || document.getElementById("cleaning-ah-cleaning-form");
        return this.readCleaningDraftFromForm(form);
    }

    readCleaningDraftFromForm(form) {
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
        const form = document.getElementById("cleaning-ah-drawer-laundry-form")
            || document.getElementById("cleaning-ah-laundry-form");
        if (!form) {
            return { ...this.laundryDraft };
        }

        const formData = new FormData(form);
        return {
            date: String(formData.get("date") || "").trim(),
            propertyName: normalizeLabel(formData.get("propertyName")),
            quantity: String(formData.get("quantity") || "1").trim(),
            kg: String(formData.get("kg") || "").trim(),
            amount: String(formData.get("amount") || "").trim(),
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
                quantity: String(rowElement.querySelector('[name="quantity"]')?.value || "1").trim(),
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
        const form = document.getElementById("cleaning-ah-drawer-special-form")
            || document.getElementById("cleaning-ah-special-cleaning-form");
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

    updateCleaningPreview(containerId = "cleaning-ah-cleaning-preview") {
        const container = document.getElementById(containerId);
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
            quantity: toOptionalNumber(this.laundryDraft.quantity) ?? 1,
            kg: toOptionalNumber(this.laundryDraft.kg) || 0,
            amount: toOptionalNumber(this.laundryDraft.amount),
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

    async saveCleaningRecord({ keepContext = false } = {}) {
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
            notes: this.cleaningDraft.notes,
            source: existingCleaning?.source || "manual"
        });

        if (!this.editingCleaningId && !this.confirmDuplicateCleaning(record)) {
            return;
        }

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
            if (this.calendarModalMode) {
                this.calendarModalMode = "";
                this.editingCleaningId = null;
                this.cleaningDraft = this.createDefaultCleaningDraft();
                this.activeTab = "calendar";
                this.render();
            } else if (keepContext && !this.editingCleaningId) {
                this.resetCleaningFormForNext(this.cleaningDraft);
            } else {
                this.resetCleaningForm();
            }
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
            return row.propertyName || row.guestAmount || row.notes;
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

        const duplicateRows = validRows.filter((row) => this.getDuplicateCleaningRecord({
            date: this.cleaningBatchDraft.date,
            propertyName: row.propertyName,
            categoryKey
        }));
        if (duplicateRows.length && !window.confirm(this.tr("confirm.duplicateCleaningBatch", { count: duplicateRows.length }))) {
            this.setStatus(this.tr("status.duplicateSaveCancelled"), "info");
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

    async saveLaundryRecord() {
        this.laundryDraft = this.readLaundryDraftFromDom();
        const existingLaundry = this.editingLaundryId
            ? (this.laundryRecords.find((entry) => entry.id === this.editingLaundryId) || null)
            : null;
        const propertyName = this.laundryDraft.propertyName;
        const quantity = toOptionalNumber(this.laundryDraft.quantity) ?? 1;
        const kg = toOptionalNumber(this.laundryDraft.kg);
        const amount = toOptionalNumber(this.laundryDraft.amount);
        if (!this.laundryDraft.date || !propertyName || ((kg === null || kg <= 0) && (amount === null || amount <= 0))) {
            this.setStatus(this.tr("status.laundryValidationError"), "error");
            this.render();
            return;
        }
        const property = this.findPropertyByName(propertyName);
        const record = createStandaloneLaundryRecord({
            date: this.laundryDraft.date,
            propertyName,
            propertyId: property?.id || "",
            quantity,
            kg: kg || 0,
            amount,
            laundryRatePerKg: toOptionalNumber(this.laundryDraft.laundryRatePerKg) ?? CLEANING_AH_DEFAULTS.laundryRatePerKg,
            notes: this.laundryDraft.notes,
            source: existingLaundry?.source || "standalone"
        });

        if (!this.editingLaundryId && !this.confirmDuplicateLaundry(record)) {
            return;
        }

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

        const duplicateRows = validRows.filter((row) => this.getDuplicateLaundryRecord({
            date: this.laundryBatchDraft.date,
            propertyName: row.propertyName
        }));
        if (duplicateRows.length && !window.confirm(this.tr("confirm.duplicateLaundryBatch", { count: duplicateRows.length }))) {
            this.setStatus(this.tr("status.duplicateSaveCancelled"), "info");
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
                    quantity: toOptionalNumber(row.quantity) ?? 1,
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
        this.cleaningDraft = {
            date: record.date || getTodayIsoDate(),
            propertyName: record.propertyName || "",
            categoryKey: this.getCleaningCategoryKey(record.categoryKey || record.category),
            reservationSource: this.getCleaningReservationSource(record),
            guestAmount: toInputNumber(record.guestAmount),
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
            propertyName: record.propertyName || "",
            quantity: toInputNumber(record.quantity ?? 1),
            kg: toInputNumber(record.kg),
            amount: toInputNumber(record.amount),
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

    async deleteCleaning(recordId) {
        if (!recordId || !window.confirm(this.tr("confirm.deleteCleaning"))) {
            return;
        }

        try {
            await deleteDoc(doc(this.db, "cleaningAhRecords", recordId));
            this.setStatus(this.tr("status.cleaningDeleted"), "success");
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
        this.calendarModalMode = "";
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.render();
    }

    resetCleaningFormForNext(previousDraft = {}) {
        this.editingCleaningId = null;
        this.cleaningEntryMode = "single";
        this.openCleaningLaundryEntryId = "";
        this.calendarModalMode = "";
        this.cleaningDraft = {
            ...this.createDefaultCleaningDraft(),
            date: previousDraft.date || getTodayIsoDate(),
            categoryKey: this.getCleaningCategoryKey(previousDraft.categoryKey || previousDraft.category),
            reservationSource: previousDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform
        };
        this.activeTab = "register";
        this.focusAfterRender = "cleaning-ah-fast-property";
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
