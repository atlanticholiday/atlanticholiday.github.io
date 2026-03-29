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
    CLEANING_AH_DEFAULTS,
    CLEANING_AH_RESERVATION_SOURCES,
    createCleaningAhFingerprint,
    createCleaningAhRecord,
    createStandaloneLaundryRecord,
    parseCleaningAhCsv,
    roundCurrency,
    summarizeCleaningAhRecords,
    summarizeLaundryRecords
} from "./cleaning-ah-utils.js";

const DEFAULT_CLEANING_CATEGORY = "Limpeza check-out";
const DEFAULT_CATEGORY_OPTIONS = Object.freeze([
    DEFAULT_CLEANING_CATEGORY,
    "Limpeza Check-out",
    "Primeira Limpeza",
    "Limpeza Check-out e Contagem das roupas",
    "Limpeza Check-out e Realizacao de Inventario",
    "Limpeza check-out - proprietarios",
    "Continuacao da Limpeza do Check-out"
]);

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

        this.cleaningRecords = [];
        this.laundryRecords = [];
        this.cleaningUnsubscribe = null;
        this.laundryUnsubscribe = null;

        this.activeTab = "dashboard";
        this.searchQuery = "";
        this.selectedMonthKey = "";
        this.selectedPropertyName = "";
        this.selectedCategory = "";

        this.editingCleaningId = null;
        this.editingLaundryId = null;
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.laundryDraft = this.createDefaultLaundryDraft();

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
        }
    }

    createDefaultCleaningDraft() {
        return {
            date: getTodayIsoDate(),
            propertyName: "",
            category: DEFAULT_CLEANING_CATEGORY,
            reservationSource: CLEANING_AH_RESERVATION_SOURCES.platform,
            guestAmount: "",
            notes: ""
        };
    }

    createDefaultLaundryDraft() {
        return {
            date: getTodayIsoDate(),
            linkedCleaningId: "",
            propertyName: "",
            kg: "",
            notes: ""
        };
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.hasPrivilegedRole !== "function") {
            return true;
        }

        return Boolean(dataManager.hasPrivilegedRole());
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
                                Back
                            </button>
                            <div>
                                <div class="text-xs uppercase tracking-[0.28em] text-sky-600 font-semibold">Finance</div>
                                <h1 class="text-2xl font-semibold text-slate-900">Cleaning AH</h1>
                                <p class="text-sm text-slate-600 mt-1">Track checkout revenue, laundry costs, and quick stats in one place.</p>
                            </div>
                        </div>
                        <button id="cleaning-ah-sign-out-btn" class="text-sm text-red-600 hover:underline">Sign out</button>
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
                        <span class="text-2xl">AH</span>
                    </div>
                    <div class="card-body">
                        <h3>Cleaning AH</h3>
                        <p>Checkout revenue, laundry, and importable stats.</p>
                    </div>
                `;
                parent.appendChild(card);
            }
        }

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

    startListening() {
        const cleaningsRef = this.getCleaningsCollectionRef();
        const laundryRef = this.getLaundryCollectionRef();
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

        return [...propertyNames.values()].sort((left, right) => left.localeCompare(right));
    }

    getKnownCategories() {
        const categories = new Map(DEFAULT_CATEGORY_OPTIONS.map((entry) => [normalizeKey(entry), entry]));
        this.cleaningRecords.forEach((record) => {
            const label = normalizeLabel(record.category);
            if (label) {
                categories.set(normalizeKey(label), label);
            }
        });

        return [...categories.values()].sort((left, right) => left.localeCompare(right));
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

    getLaundryLinkOptions(currentLinkedCleaningId = "") {
        return [...this.cleaningRecords]
            .filter((record) => {
                return record.id === currentLinkedCleaningId || roundCurrency(record.laundryAmount || 0) <= 0;
            })
            .sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
    }

    getCleaningLinkLabel(record) {
        return `${this.formatDate(record.date)} · ${record.propertyName || "Unknown"} · ${record.category || DEFAULT_CLEANING_CATEGORY}`;
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
            if (this.selectedCategory && normalizeKey(record.category) !== normalizeKey(this.selectedCategory)) {
                return false;
            }
            if (!search) {
                return true;
            }

            const haystack = [
                record.date,
                record.propertyName,
                record.category,
                record.reservationSource,
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

    render() {
        const root = document.getElementById("cleaning-ah-root");
        if (!root) return;

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-3xl border border-rose-200 bg-white p-8 shadow-sm">
                    <div class="max-w-2xl">
                        <div class="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600">Restricted</div>
                        <h2 class="mt-3 text-2xl font-semibold text-slate-900">Cleaning AH is manager-only.</h2>
                        <p class="mt-3 text-sm leading-6 text-slate-600">This page stores company revenue data, so it is only visible to admins and managers.</p>
                    </div>
                </section>
            `;
            return;
        }

        const filteredCleanings = this.getFilteredCleaningRecords();
        const filteredStandaloneLaundry = this.getFilteredStandaloneLaundryRecords();
        const cleaningSummary = summarizeCleaningAhRecords(filteredCleanings, filteredStandaloneLaundry);
        const derivedCleanings = cleaningSummary.records;
        const laundrySummary = summarizeLaundryRecords(filteredCleanings, filteredStandaloneLaundry);

        root.innerHTML = `
            ${this.renderStatusMessage()}
            <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div class="max-w-2xl">
                    <div class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Formula</div>
                    <h2 class="mt-2 text-xl font-semibold text-slate-900">Fast entry with one revenue rule.</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">Platform reservations use 15.5% commission and 22% extracted VAT. Direct reservations set platform commission to zero. Laundry still links later at 2.10 EUR per kg.</p>
                </div>
                <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    ${this.renderMetricCard("Check-outs", String(cleaningSummary.totals.count))}
                    ${this.renderMetricCard("Guest total", this.formatCurrency(cleaningSummary.totals.guestAmount))}
                    ${this.renderMetricCard("Platform fees", this.formatCurrency(cleaningSummary.totals.platformCommission))}
                    ${this.renderMetricCard("VAT", this.formatCurrency(cleaningSummary.totals.vatAmount))}
                    ${this.renderMetricCard("Laundry", this.formatCurrency(cleaningSummary.totals.laundryAmount))}
                    ${this.renderMetricCard("Net to AH", this.formatCurrency(cleaningSummary.totals.totalToAh))}
                </div>
            </section>

            ${this.renderFilters()}
            ${this.renderTabBar()}
            ${this.renderActiveTab(derivedCleanings, filteredStandaloneLaundry, cleaningSummary, laundrySummary)}
            <datalist id="cleaning-ah-property-options">${this.getKnownPropertyNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
            <datalist id="cleaning-ah-category-options">${this.getKnownCategories().map((category) => `<option value="${escapeHtml(category)}"></option>`).join("")}</datalist>
        `;

        this.bindUiEvents();
        this.updateCleaningPreview();
        this.updateLaundryPreview();
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

    renderMetricCard(label, value) {
        return `
            <article class="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 min-h-[72px]">
                <div class="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <div class="min-w-0 text-sm font-medium leading-5 text-slate-500">${escapeHtml(label)}</div>
                    <div class="text-right text-lg font-semibold leading-none text-slate-900 tabular-nums whitespace-nowrap">${escapeHtml(value)}</div>
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

    renderFilters() {
        const monthOptions = this.getMonthOptions()
            .map((monthKey) => `<option value="${monthKey}" ${monthKey === this.selectedMonthKey ? "selected" : ""}>${this.formatMonthKey(monthKey)}</option>`)
            .join("");
        const propertyOptions = this.getKnownPropertyNames()
            .map((propertyName) => `<option value="${escapeHtml(propertyName)}" ${normalizeKey(propertyName) === normalizeKey(this.selectedPropertyName) ? "selected" : ""}>${escapeHtml(propertyName)}</option>`)
            .join("");
        const categoryOptions = this.getKnownCategories()
            .map((category) => `<option value="${escapeHtml(category)}" ${normalizeKey(category) === normalizeKey(this.selectedCategory) ? "selected" : ""}>${escapeHtml(category)}</option>`)
            .join("");

        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Search</span>
                        <input id="cleaning-ah-search" type="search" class="mt-2 w-full" value="${escapeHtml(this.searchQuery)}" placeholder="Property, category, notes">
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Month</span>
                        <select id="cleaning-ah-month-filter" class="mt-2 w-full">
                            <option value="">All months</option>
                            ${monthOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Property</span>
                        <select id="cleaning-ah-property-filter" class="mt-2 w-full">
                            <option value="">All properties</option>
                            ${propertyOptions}
                        </select>
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Category</span>
                        <select id="cleaning-ah-category-filter" class="mt-2 w-full">
                            <option value="">All categories</option>
                            ${categoryOptions}
                        </select>
                    </label>
                </div>
            </section>
        `;
    }

    renderTabBar() {
        const tabs = [
            ["dashboard", "Dashboard"],
            ["cleanings", "Cleanings"],
            ["laundry", "Laundry"]
        ];

        return `
            <nav class="flex flex-wrap gap-2" aria-label="Cleaning AH tabs">
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

    renderActiveTab(derivedCleanings, filteredStandaloneLaundry, cleaningSummary, laundrySummary) {
        if (this.activeTab === "cleanings") {
            return this.renderCleaningsTab(derivedCleanings);
        }

        if (this.activeTab === "laundry") {
            return this.renderLaundryTab(filteredStandaloneLaundry, laundrySummary);
        }

        return this.renderDashboardTab(cleaningSummary, laundrySummary);
    }

    renderDashboardTab(cleaningSummary, laundrySummary) {
        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[1.5fr_1fr]">
                <div class="space-y-6">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Overview</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">Revenue snapshot</h3>
                            </div>
                            <div class="text-sm text-slate-500">${cleaningSummary.totals.count} records</div>
                        </div>
                        <div class="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                            ${this.renderMetricCard("Platform fees", this.formatCurrency(cleaningSummary.totals.platformCommission))}
                            ${this.renderMetricCard("VAT", this.formatCurrency(cleaningSummary.totals.vatAmount))}
                            ${this.renderMetricCard("AH before laundry", this.formatCurrency(cleaningSummary.totals.totalToAhWithoutLaundry))}
                            ${this.renderMetricCard("Avg net / cleaning", this.formatCurrency(cleaningSummary.totals.averageTotalToAh))}
                        </div>
                    </section>
                    ${this.renderFinancialSummaryTable("By month", cleaningSummary.byMonth, [
                        ["Month", (entry) => this.formatMonthKey(entry.label)],
                        ["Count", (entry) => String(entry.count)],
                        ["Guest", (entry) => this.formatCurrency(entry.guestAmount)],
                        ["Laundry", (entry) => this.formatCurrency(entry.laundryAmount)],
                        ["Net", (entry) => this.formatCurrency(entry.totalToAh)]
                    ])}
                    ${this.renderFinancialSummaryTable("Top properties", cleaningSummary.byProperty.slice(0, 8), [
                        ["Property", (entry) => entry.label],
                        ["Count", (entry) => String(entry.count)],
                        ["Guest", (entry) => this.formatCurrency(entry.guestAmount)],
                        ["Net", (entry) => this.formatCurrency(entry.totalToAh)]
                    ])}
                </div>
                <div class="space-y-6">
                    ${this.renderFinancialSummaryTable("Categories", cleaningSummary.byCategory.slice(0, 8), [
                        ["Category", (entry) => entry.label],
                        ["Count", (entry) => String(entry.count)],
                        ["Net", (entry) => this.formatCurrency(entry.totalToAh)]
                    ])}
                    ${this.renderLaundrySummaryBlock(laundrySummary)}
                </div>
            </section>
        `;
    }

    renderCleaningsTab(filteredCleanings) {
        const draft = this.cleaningDraft;
        const previewRecord = createCleaningAhRecord({
            date: draft.date,
            propertyName: draft.propertyName,
            category: draft.category || DEFAULT_CLEANING_CATEGORY,
            reservationSource: draft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform,
            guestAmount: toOptionalNumber(draft.guestAmount) || 0,
            notes: draft.notes
        });

        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(26rem,0.95fr)_minmax(0,1.35fr)]">
                <div class="space-y-6">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600">Quick entry</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">${this.editingCleaningId ? "Edit cleaning" : "Add cleaning"}</h3>
                                <p class="mt-2 text-sm text-slate-600">Save the checkout first. Laundry can be linked later from the Laundry tab when the kilograms arrive.</p>
                            </div>
                            ${this.editingCleaningId ? `<button type="button" id="cleaning-ah-cancel-cleaning-edit" class="text-sm text-slate-500 hover:text-slate-900">Cancel edit</button>` : ""}
                        </div>
                        <form id="cleaning-ah-cleaning-form" class="mt-5 space-y-4">
                            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label class="block">
                                    <span class="text-sm text-slate-600">Date</span>
                                    <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Property</span>
                                    <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(draft.propertyName)}" list="cleaning-ah-property-options" placeholder="Type or pick a property" required>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Category</span>
                                    <input type="text" name="category" class="mt-1 w-full" value="${escapeHtml(draft.category || DEFAULT_CLEANING_CATEGORY)}" list="cleaning-ah-category-options" required>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Reservation source</span>
                                    <select name="reservationSource" class="mt-1 w-full">
                                        <option value="platform" ${draft.reservationSource !== CLEANING_AH_RESERVATION_SOURCES.direct ? "selected" : ""}>Platform</option>
                                        <option value="direct" ${draft.reservationSource === CLEANING_AH_RESERVATION_SOURCES.direct ? "selected" : ""}>Direct</option>
                                    </select>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Guest amount</span>
                                    <input type="number" name="guestAmount" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.guestAmount))}" required>
                                </label>
                            </div>
                            <label class="block">
                                <span class="text-sm text-slate-600">Notes</span>
                                <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="Optional note">${escapeHtml(draft.notes)}</textarea>
                            </label>
                            <div id="cleaning-ah-cleaning-preview">
                                ${this.renderCleaningPreview(previewRecord)}
                            </div>
                            <div class="flex flex-wrap gap-3">
                                <button type="submit" class="view-btn active">${this.editingCleaningId ? "Save changes" : "Save cleaning"}</button>
                                <button type="button" id="cleaning-ah-reset-cleaning-form" class="view-btn">Reset</button>
                            </div>
                        </form>
                    </section>
                    ${this.renderImportBlock()}
                </div>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Stored data</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">Cleanings</h3>
                        </div>
                        <div class="text-sm text-slate-500">${filteredCleanings.length} rows</div>
                    </div>
                    <div class="mt-5 overflow-x-auto">
                        ${this.renderCleaningsTable(filteredCleanings)}
                    </div>
                </section>
            </section>
        `;
    }

    renderLaundryTab(filteredStandaloneLaundry, laundrySummary) {
        const draft = this.laundryDraft;
        const linkedCleaning = this.cleaningRecords.find((entry) => entry.id === draft.linkedCleaningId) || null;
        const preview = createStandaloneLaundryRecord({
            date: draft.date,
            propertyName: linkedCleaning?.propertyName || draft.propertyName,
            linkedCleaningId: draft.linkedCleaningId,
            kg: toOptionalNumber(draft.kg) || 0,
            notes: draft.notes
        });
        const linkOptions = this.getLaundryLinkOptions(draft.linkedCleaningId)
            .map((record) => `<option value="${escapeHtml(record.id || "")}" ${record.id === draft.linkedCleaningId ? "selected" : ""}>${escapeHtml(this.getCleaningLinkLabel(record))}</option>`)
            .join("");

        return `
            <section class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(26rem,0.95fr)_minmax(0,1.35fr)]">
                <div class="space-y-6">
                    <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Standalone laundry</div>
                                <h3 class="mt-1 text-xl font-semibold text-slate-900">${this.editingLaundryId ? "Edit laundry record" : "Add laundry record"}</h3>
                                <p class="mt-2 text-sm text-slate-600">Use this when laundry needs to be tracked separately from a checkout cleaning. Amount is calculated automatically as kilograms multiplied by 2.10 EUR.</p>
                            </div>
                            ${this.editingLaundryId ? `<button type="button" id="cleaning-ah-cancel-laundry-edit" class="text-sm text-slate-500 hover:text-slate-900">Cancel edit</button>` : ""}
                        </div>
                        <form id="cleaning-ah-laundry-form" class="mt-5 space-y-4">
                            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <label class="block">
                                    <span class="text-sm text-slate-600">Date</span>
                                    <input type="date" name="date" class="mt-1 w-full" value="${escapeHtml(draft.date)}" required>
                                </label>
                                <label class="block md:col-span-2">
                                    <span class="text-sm text-slate-600">Linked cleaning</span>
                                    <select name="linkedCleaningId" id="cleaning-ah-linked-cleaning" class="mt-1 w-full">
                                        <option value="">No linked cleaning</option>
                                        ${linkOptions}
                                    </select>
                                    <div class="mt-1 text-xs text-slate-500">Link the laundry to an earlier cleaning so the final net revenue updates when the kg arrives.</div>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Property</span>
                                    <input type="text" name="propertyName" class="mt-1 w-full" value="${escapeHtml(linkedCleaning?.propertyName || draft.propertyName)}" list="cleaning-ah-property-options" ${linkedCleaning ? "readonly" : ""} required>
                                </label>
                                <label class="block">
                                    <span class="text-sm text-slate-600">Kg</span>
                                    <input type="number" name="kg" class="mt-1 w-full" step="0.01" min="0" value="${escapeHtml(toInputNumber(draft.kg))}" required>
                                </label>
                            </div>
                            <label class="block">
                                <span class="text-sm text-slate-600">Notes</span>
                                <textarea name="notes" class="mt-1 w-full min-h-[92px]" placeholder="Optional note">${escapeHtml(draft.notes)}</textarea>
                            </label>
                            <div id="cleaning-ah-laundry-preview">
                                ${this.renderLaundryPreview(preview)}
                            </div>
                            <div class="flex flex-wrap gap-3">
                                <button type="submit" class="view-btn active">${this.editingLaundryId ? "Save changes" : "Save laundry"}</button>
                                <button type="button" id="cleaning-ah-reset-laundry-form" class="view-btn">Reset</button>
                            </div>
                        </form>
                    </section>
                    ${this.renderLaundrySummaryBlock(laundrySummary)}
                </div>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Laundry activity</div>
                            <h3 class="mt-1 text-xl font-semibold text-slate-900">Combined laundry register</h3>
                        </div>
                        <div class="text-sm text-slate-500">${laundrySummary.entries.length} rows</div>
                    </div>
                    <div class="mt-5 overflow-x-auto">
                        ${this.renderLaundryTable(laundrySummary.entries, filteredStandaloneLaundry)}
                    </div>
                </section>
            </section>
        `;
    }

    renderCleaningPreview(previewRecord) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard("Type", previewRecord.reservationSource === CLEANING_AH_RESERVATION_SOURCES.direct ? "Direct" : "Platform")}
                    ${this.renderPreviewMetricCard("Commission", this.formatCurrency(previewRecord.platformCommission))}
                    ${this.renderPreviewMetricCard("VAT", this.formatCurrency(previewRecord.vatAmount))}
                    ${this.renderPreviewMetricCard("Before laundry", this.formatCurrency(previewRecord.totalToAhWithoutLaundry))}
                    ${this.renderPreviewMetricCard("Laundry pending", this.formatCurrency(0))}
                    ${this.renderPreviewMetricCard("Current net", this.formatCurrency(previewRecord.totalToAhWithoutLaundry), "emphasis")}
                </div>
            </div>
        `;
    }

    renderLaundryPreview(previewRecord) {
        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preview</div>
                <div class="mt-3 grid grid-cols-1 gap-3">
                    ${this.renderPreviewMetricCard("Kg", this.formatNumber(previewRecord.kg))}
                    ${this.renderPreviewMetricCard("Rate", this.formatCurrency(CLEANING_AH_DEFAULTS.laundryRatePerKg))}
                    ${this.renderPreviewMetricCard("Amount", this.formatCurrency(previewRecord.amount), "emphasis")}
                </div>
            </div>
        `;
    }

    renderImportBlock() {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-start justify-between gap-4">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Import</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">Import historical CSV</h3>
                        <p class="mt-2 text-sm text-slate-600">Import the existing checkout sheet, skip duplicates by fingerprint, and review mismatches before saving.</p>
                    </div>
                    ${this.importPreview ? `<button type="button" id="cleaning-ah-clear-import" class="text-sm text-slate-500 hover:text-slate-900">Clear preview</button>` : ""}
                </div>
                <div class="mt-4 flex flex-col gap-4">
                    <label class="block">
                        <span class="text-sm text-slate-600">CSV file</span>
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
                    Select a CSV file to preview how many rows will be imported and how many will be skipped as duplicates.
                </div>
            `;
        }

        const previewRows = this.importPreview.newRecords.slice(0, 8)
            .map((record) => `
                <tr class="border-t border-slate-200">
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatDate(record.date))}</td>
                    <td class="px-3 py-2 text-sm font-medium text-slate-900">${escapeHtml(record.propertyName)}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(record.category)}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                    <td class="px-3 py-2 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.totalToAh))}</td>
                </tr>
            `)
            .join("");

        return `
            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Import preview</div>
                        <h4 class="mt-1 text-lg font-semibold text-slate-900">${escapeHtml(this.importPreview.fileName)}</h4>
                        <p class="mt-1 text-sm text-slate-600">${this.importPreview.parsedCount} parsed, ${this.importPreview.newRecords.length} new, ${this.importPreview.duplicateCount} duplicates skipped, ${this.importPreview.warningCount} warnings.</p>
                    </div>
                    <button type="button" id="cleaning-ah-confirm-import" class="view-btn active" ${this.importPreview.newRecords.length ? "" : "disabled"}>Import ${this.importPreview.newRecords.length} rows</button>
                </div>
                ${this.importPreview.warningCount ? `
                    <div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        ${this.importPreview.warningCount} rows have formula mismatches. They will still be imported with the sheet values preserved.
                    </div>
                ` : ""}
                <div class="mt-4 overflow-x-auto">
                    <table class="min-w-full text-left">
                        <thead>
                            <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                                <th class="px-3 py-2">Date</th>
                                <th class="px-3 py-2">Property</th>
                                <th class="px-3 py-2">Category</th>
                                <th class="px-3 py-2">Guest</th>
                                <th class="px-3 py-2">Net</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${previewRows || `<tr><td colspan="5" class="px-3 py-4 text-sm text-slate-500">No new rows to import.</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderCleaningsTable(records) {
        if (!records.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">No cleaning records match the current filters.</div>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">Date</th>
                        <th class="px-3 py-2">Property</th>
                        <th class="px-3 py-2">Category</th>
                        <th class="px-3 py-2">Reservation</th>
                        <th class="px-3 py-2">Guest</th>
                        <th class="px-3 py-2">Laundry</th>
                        <th class="px-3 py-2">Net</th>
                        <th class="px-3 py-2">Source</th>
                        <th class="px-3 py-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${records.map((record) => `
                        <tr class="border-b border-slate-100 align-top">
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatDate(record.date))}</td>
                            <td class="px-3 py-3">
                                <div class="text-sm font-medium text-slate-900">${escapeHtml(record.propertyName)}</div>
                                ${record.notes ? `<div class="mt-1 text-xs text-slate-500">${escapeHtml(record.notes)}</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(record.category)}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">
                                <span class="inline-flex rounded-full px-2 py-1 text-xs font-medium ${record.reservationSource === CLEANING_AH_RESERVATION_SOURCES.direct ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800"}">
                                    ${escapeHtml(record.reservationSource === CLEANING_AH_RESERVATION_SOURCES.direct ? "Direct" : "Platform")}
                                </span>
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatCurrency(record.guestAmount))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">
                                ${escapeHtml(this.formatCurrency(record.effectiveLaundryAmount ?? record.laundryAmount))}
                                ${record.linkedLaundryAmount ? `<div class="text-xs text-slate-400">linked: ${escapeHtml(this.formatCurrency(record.linkedLaundryAmount))}</div>` : ""}
                                ${record.linkedLaundryCount ? `<div class="text-xs text-slate-400">${escapeHtml(String(record.linkedLaundryCount))} linked row(s)</div>` : ""}
                                ${!record.effectiveLaundryAmount ? `<div class="text-xs text-slate-400">waiting for laundry</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-sm font-semibold text-slate-900">${escapeHtml(this.formatCurrency(record.effectiveTotalToAh ?? record.totalToAh))}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">
                                <span class="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">${escapeHtml(record.source || "manual")}</span>
                                ${record.importWarnings?.length ? `<div class="mt-1 text-xs text-amber-600">${record.importWarnings.length} warning(s)</div>` : ""}
                            </td>
                            <td class="px-3 py-3 text-right">
                                <div class="inline-flex flex-wrap justify-end gap-2">
                                    <button type="button" data-action="edit-cleaning" data-id="${escapeHtml(record.id || "")}" class="text-sm text-sky-600 hover:text-sky-800">Edit</button>
                                    <button type="button" data-action="delete-cleaning" data-id="${escapeHtml(record.id || "")}" class="text-sm text-rose-600 hover:text-rose-800">Delete</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    renderLaundryTable(entries) {
        if (!entries.length) {
            return `<div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">No laundry records match the current filters.</div>`;
        }

        return `
            <table class="min-w-full text-left">
                <thead>
                    <tr class="border-b border-slate-200 text-xs uppercase tracking-[0.16em] text-slate-500">
                        <th class="px-3 py-2">Date</th>
                        <th class="px-3 py-2">Property</th>
                        <th class="px-3 py-2">Linked cleaning</th>
                        <th class="px-3 py-2">Source</th>
                        <th class="px-3 py-2">Kg</th>
                        <th class="px-3 py-2">Amount</th>
                        <th class="px-3 py-2 text-right">Actions</th>
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
                                    : `<span class="text-slate-400">Not linked</span>`}
                            </td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(entry.source)}</td>
                            <td class="px-3 py-3 text-sm text-slate-600">${escapeHtml(this.formatNumber(entry.kg))}</td>
                            <td class="px-3 py-3 text-sm font-semibold text-slate-900">${escapeHtml(this.formatCurrency(entry.amount))}</td>
                            <td class="px-3 py-3 text-right">
                                <div class="inline-flex flex-wrap justify-end gap-2">
                                    ${entry.linkedCleaningId ? `<button type="button" data-action="open-cleaning-from-laundry" data-id="${escapeHtml(entry.linkedCleaningId || "")}" class="text-sm text-sky-600 hover:text-sky-800">Open cleaning</button>` : ""}
                                    ${entry.source !== "cleaning" ? `<button type="button" data-action="edit-laundry" data-id="${escapeHtml(entry.id || "")}" class="text-sm text-sky-600 hover:text-sky-800">Edit</button>` : ""}
                                    ${entry.source !== "cleaning" ? `<button type="button" data-action="delete-laundry" data-id="${escapeHtml(entry.id || "")}" class="text-sm text-rose-600 hover:text-rose-800">Delete</button>` : ""}
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
                        <div class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Laundry</div>
                        <h3 class="mt-1 text-xl font-semibold text-slate-900">Laundry totals</h3>
                    </div>
                    <div class="text-sm text-slate-500">${laundrySummary.totals.count} rows</div>
                </div>
                <div class="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                    ${this.renderMetricCard("Kg", this.formatNumber(laundrySummary.totals.kg))}
                    ${this.renderMetricCard("Amount", this.formatCurrency(laundrySummary.totals.amount))}
                    ${this.renderMetricCard("Rows", String(laundrySummary.totals.count))}
                </div>
                ${this.renderFinancialSummaryTable("Laundry by month", laundrySummary.byMonth, [
                    ["Month", (entry) => this.formatMonthKey(entry.label)],
                    ["Rows", (entry) => String(entry.count)],
                    ["Kg", (entry) => this.formatNumber(entry.kg)],
                    ["Amount", (entry) => this.formatCurrency(entry.amount)]
                ])}
                ${this.renderFinancialSummaryTable("Laundry by property", laundrySummary.byProperty.slice(0, 8), [
                    ["Property", (entry) => entry.label],
                    ["Rows", (entry) => String(entry.count)],
                    ["Kg", (entry) => this.formatNumber(entry.kg)],
                    ["Amount", (entry) => this.formatCurrency(entry.amount)]
                ])}
            </section>
        `;
    }

    renderFinancialSummaryTable(title, entries, columns) {
        return `
            <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold text-slate-900">${escapeHtml(title)}</h3>
                    <div class="text-sm text-slate-500">${entries.length} rows</div>
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
                                : `<tr><td colspan="${columns.length}" class="px-3 py-4 text-sm text-slate-500">No data for the current filters.</td></tr>`}
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

        const cleaningForm = document.getElementById("cleaning-ah-cleaning-form");
        cleaningForm?.addEventListener("input", () => {
            this.cleaningDraft = this.readCleaningDraftFromDom();
            this.updateCleaningPreview();
        });
        cleaningForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveCleaningRecord();
        });
        document.getElementById("cleaning-ah-reset-cleaning-form")?.addEventListener("click", () => this.resetCleaningForm());
        document.getElementById("cleaning-ah-cancel-cleaning-edit")?.addEventListener("click", () => this.resetCleaningForm());

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
            category: normalizeLabel(formData.get("category")) || DEFAULT_CLEANING_CATEGORY,
            reservationSource: String(formData.get("reservationSource") || CLEANING_AH_RESERVATION_SOURCES.platform).trim(),
            guestAmount: String(formData.get("guestAmount") || "").trim(),
            notes: String(formData.get("notes") || "").trim()
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
            notes: String(formData.get("notes") || "").trim()
        };
    }

    updateCleaningPreview() {
        const container = document.getElementById("cleaning-ah-cleaning-preview");
        if (!container) return;

        const record = createCleaningAhRecord({
            date: this.cleaningDraft.date,
            propertyName: this.cleaningDraft.propertyName,
            category: this.cleaningDraft.category || DEFAULT_CLEANING_CATEGORY,
            reservationSource: this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform,
            guestAmount: toOptionalNumber(this.cleaningDraft.guestAmount) || 0,
            notes: this.cleaningDraft.notes
        });
        container.innerHTML = this.renderCleaningPreview(record);
    }

    updateLaundryPreview() {
        const container = document.getElementById("cleaning-ah-laundry-preview");
        if (!container) return;

        const record = createStandaloneLaundryRecord({
            date: this.laundryDraft.date,
            propertyName: this.laundryDraft.propertyName,
            kg: toOptionalNumber(this.laundryDraft.kg) || 0,
            notes: this.laundryDraft.notes
        });
        container.innerHTML = this.renderLaundryPreview(record);
    }

    async saveCleaningRecord() {
        this.cleaningDraft = this.readCleaningDraftFromDom();
        if (!this.cleaningDraft.date || !this.cleaningDraft.propertyName) {
            this.setStatus("Date and property are required for a cleaning record.", "error");
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
            category: this.cleaningDraft.category || DEFAULT_CLEANING_CATEGORY,
            reservationSource: this.cleaningDraft.reservationSource || CLEANING_AH_RESERVATION_SOURCES.platform,
            guestAmount: toOptionalNumber(this.cleaningDraft.guestAmount) || 0,
            laundryAmount: existingCleaning?.laundryAmount ?? 0,
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
                this.setStatus("Cleaning record updated.", "success");
            } else {
                await addDoc(this.getCleaningsCollectionRef(), {
                    ...payload,
                    createdAt: new Date()
                });
                this.setStatus("Cleaning record saved.", "success");
            }
            this.resetCleaningForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save cleaning:", error);
            this.setStatus("Cleaning record could not be saved.", "error");
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
            this.setStatus("Date and property are required for a laundry record.", "error");
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
                this.setStatus("Laundry record updated.", "success");
            } else {
                await addDoc(this.getLaundryCollectionRef(), {
                    ...payload,
                    createdAt: new Date()
                });
                this.setStatus("Laundry record saved.", "success");
            }
            this.resetLaundryForm();
        } catch (error) {
            console.error("[Cleaning AH] failed to save laundry:", error);
            this.setStatus("Laundry record could not be saved.", "error");
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

            this.setStatus(`${parsed.records.length} CSV rows parsed. Review the preview before importing.`, "info");
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to preview CSV:", error);
            this.setStatus("CSV preview failed. Check the file format and try again.", "error");
            this.render();
        }
    }

    async commitImportPreview() {
        if (!this.importPreview?.newRecords?.length) {
            this.setStatus("There are no new rows to import.", "info");
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
            this.setStatus("CSV import completed.", "success");
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to import CSV:", error);
            this.setStatus("CSV import failed while saving to Firestore.", "error");
            this.render();
        }
    }

    startEditingCleaning(recordId) {
        const record = this.cleaningRecords.find((entry) => entry.id === recordId);
        if (!record) {
            return;
        }

        this.activeTab = "cleanings";
        this.editingCleaningId = record.id;
        this.cleaningDraft = {
            date: record.date || getTodayIsoDate(),
            propertyName: record.propertyName || "",
            category: record.category || DEFAULT_CLEANING_CATEGORY,
            reservationSource: record.reservationSource || (roundCurrency(record.platformCommission || 0) === 0 ? CLEANING_AH_RESERVATION_SOURCES.direct : CLEANING_AH_RESERVATION_SOURCES.platform),
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
        this.editingLaundryId = record.id;
        this.laundryDraft = {
            date: record.date || getTodayIsoDate(),
            linkedCleaningId: record.linkedCleaningId || "",
            propertyName: record.propertyName || "",
            kg: toInputNumber(record.kg),
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
        if (!recordId || !window.confirm("Delete this cleaning record?")) {
            return;
        }

        try {
            await deleteDoc(doc(this.db, "cleaningAhRecords", recordId));
            this.setStatus("Cleaning record deleted.", "success");
            if (this.editingCleaningId === recordId) {
                this.resetCleaningForm();
                return;
            }
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to delete cleaning:", error);
            this.setStatus("Cleaning record could not be deleted.", "error");
            this.render();
        }
    }

    async deleteLaundry(recordId) {
        if (!recordId || !window.confirm("Delete this laundry record?")) {
            return;
        }

        try {
            await deleteDoc(doc(this.db, "cleaningAhLaundryRecords", recordId));
            this.setStatus("Laundry record deleted.", "success");
            if (this.editingLaundryId === recordId) {
                this.resetLaundryForm();
                return;
            }
            this.render();
        } catch (error) {
            console.error("[Cleaning AH] failed to delete laundry:", error);
            this.setStatus("Laundry record could not be deleted.", "error");
            this.render();
        }
    }

    resetCleaningForm() {
        this.editingCleaningId = null;
        this.cleaningDraft = this.createDefaultCleaningDraft();
        this.render();
    }

    resetLaundryForm() {
        this.editingLaundryId = null;
        this.laundryDraft = this.createDefaultLaundryDraft();
        this.render();
    }

    setStatus(message, tone = "info") {
        this.statusMessage = message;
        this.statusTone = tone;
    }

    formatCurrency(value) {
        try {
            return new Intl.NumberFormat(undefined, {
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
        return numeric.toFixed(numeric % 1 === 0 ? 0 : 2);
    }

    formatDate(dateValue) {
        const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return String(dateValue || "");
        }

        const candidate = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        try {
            return new Intl.DateTimeFormat(undefined, {
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
            return new Intl.DateTimeFormat(undefined, {
                year: "numeric",
                month: "long"
            }).format(candidate);
        } catch {
            return monthKey;
        }
    }
}
