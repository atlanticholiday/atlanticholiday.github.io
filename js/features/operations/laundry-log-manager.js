import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { i18n, t } from "../../core/i18n.js";
import {
    createEmptyLaundryLogItems,
    createLaundryLogRecord,
    filterLaundryLogRecords,
    LAUNDRY_LOG_GROUPS,
    summarizeLaundryLogRecord,
    summarizeLaundryLogRecords
} from "./laundry-log-utils.js";

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

function getTodayIsoDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function toInputNumber(value) {
    return value === null || value === undefined || value === 0 ? "" : String(value);
}

function toneClass(tone) {
    if (tone === "success") {
        return "border-emerald-200 bg-emerald-50 text-emerald-800";
    }
    if (tone === "danger") {
        return "border-rose-200 bg-rose-50 text-rose-800";
    }
    return "border-sky-200 bg-sky-50 text-sky-800";
}

export class LaundryLogManager {
    constructor(db, { getDataManager = null, getProperties = null } = {}) {
        this.db = db || null;
        this.getDataManager = typeof getDataManager === "function" ? getDataManager : () => null;
        this.readProperties = typeof getProperties === "function" ? getProperties : () => [];
        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.records = [];
        this.unsubscribe = null;
        this.editingRecordId = null;
        this.activeWorkspace = "entry";
        this.searchQuery = "";
        this.selectedStatus = "all";
        this.selectedMonth = "all";
        this.draft = this.createDefaultDraft();
        this.statusMessage = "";
        this.statusTone = "info";

        if (typeof window !== "undefined") {
            window.setTimeout(() => this.ensureDomScaffold(), 50);
            document.addEventListener("laundryLogPageOpened", () => {
                this.ensureDomScaffold();
                this.startListening();
                this.render();
            });
            document.addEventListener("propertiesDataUpdated", () => {
                if (document.getElementById("laundry-log-page")) {
                    this.render();
                }
            });
            window.addEventListener("languageChanged", this.handleLanguageChange);
        }
    }

    tr(key, replacements = {}) {
        return t(`laundryLog.${key}`, replacements);
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

    createDefaultDraft(overrides = {}) {
        return {
            propertyId: "",
            propertyName: "",
            deliveryDate: getTodayIsoDate(),
            receivedDate: "",
            notes: "",
            items: createEmptyLaundryLogItems(),
            ...overrides
        };
    }

    createDraftFromRecord(record = {}) {
        return this.createDefaultDraft({
            propertyId: record.propertyId || "",
            propertyName: record.propertyName || "",
            deliveryDate: record.deliveryDate || getTodayIsoDate(),
            receivedDate: record.receivedDate || "",
            notes: record.notes || "",
            items: createEmptyLaundryLogItems(record.items)
        });
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.isTimeClockStationUser !== "function") {
            return true;
        }
        return !dataManager.isTimeClockStationUser();
    }

    syncAccessVisibility() {
        const button = document.getElementById("go-to-laundry-log-btn");
        if (button) {
            button.classList.toggle("hidden", !this.hasAccess());
        }
        if (document.getElementById("laundry-log-page")) {
            this.render();
        }
    }

    updateStaticCopy() {
        const entries = [
            ["laundry-log-back-label", t("common.back")],
            ["laundry-log-header-kicker", this.tr("header.kicker")],
            ["laundry-log-header-title", this.tr("header.title")],
            ["laundry-log-header-subtitle", this.tr("header.subtitle")],
            ["laundry-log-sign-out-btn", t("common.signOut")],
            ["laundry-log-card-title", this.tr("header.title")],
            ["laundry-log-card-description", this.tr("landing.description")]
        ];

        entries.forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    ensureDomScaffold() {
        if (!document.getElementById("laundry-log-page")) {
            const page = document.createElement("div");
            page.id = "laundry-log-page";
            page.className = "hidden min-h-screen bg-stone-50";
            page.innerHTML = `
                <div id="laundry-log-shell" class="mx-auto w-full max-w-[1500px] px-4 py-6 xl:px-6 2xl:px-8">
                    <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div class="flex items-center gap-3">
                            <button id="back-to-landing-from-laundry-log-btn" class="inline-flex items-center text-sm text-slate-600 hover:text-slate-900">
                                <svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                                <span id="laundry-log-back-label"></span>
                            </button>
                            <div>
                                <div id="laundry-log-header-kicker" class="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600"></div>
                                <h1 id="laundry-log-header-title" class="text-2xl font-semibold text-slate-900"></h1>
                                <p id="laundry-log-header-subtitle" class="mt-1 text-sm text-slate-600"></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 self-start md:self-auto">
                            <div class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm">
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="en" title="English">EN</button>
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="pt" title="Portugues">PT</button>
                            </div>
                            <button id="laundry-log-sign-out-btn" class="text-sm text-red-600 hover:underline"></button>
                        </div>
                    </div>
                    <div id="laundry-log-root" class="space-y-6"></div>
                </div>
            `;

            const landing = document.getElementById("landing-page");
            if (landing?.parentElement) {
                landing.parentElement.appendChild(page);
            } else {
                document.body.appendChild(page);
            }
        }

        if (!document.getElementById("go-to-laundry-log-btn")) {
            const parent = document.getElementById("go-to-welcome-packs-btn")?.parentElement
                || document.getElementById("go-to-properties-btn")?.parentElement
                || document.getElementById("other-tools-grid");

            if (parent) {
                const card = document.createElement("button");
                card.id = "go-to-laundry-log-btn";
                card.className = parent.querySelector(".dashboard-card")?.className || "dashboard-card";
                card.innerHTML = `
                    <div class="card-icon bg-rose-500/10 text-rose-600">
                        <span class="text-2xl">LL</span>
                    </div>
                    <div class="card-body">
                        <h3 id="laundry-log-card-title"></h3>
                        <p id="laundry-log-card-description"></p>
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

    handleLanguageChange() {
        this.ensureDomScaffold();
        this.render();
    }

    getCollectionRef() {
        return this.db ? collection(this.db, "laundryHandoffRecords") : null;
    }

    startListening() {
        const recordsRef = this.getCollectionRef();
        if (!recordsRef || this.unsubscribe) {
            return;
        }

        this.unsubscribe = onSnapshot(recordsRef, (snapshot) => {
            this.records = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
            this.render();
        }, (error) => {
            console.error("[Laundry Log] records listener failed:", error);
            this.setStatus(this.tr("messages.loadFailed"), "danger");
            this.render();
        });
    }

    getProperties() {
        const properties = this.readProperties();
        return Array.isArray(properties) ? properties : [];
    }

    findPropertyByName(propertyName) {
        const normalized = normalizeKey(propertyName);
        if (!normalized) {
            return null;
        }

        return this.getProperties().find((property) => {
            const candidates = [
                property?.name,
                property?.displayName,
                property?.title,
                property?.reference,
                property?.code
            ].filter(Boolean);
            return candidates.some((candidate) => normalizeKey(candidate) === normalized);
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
        this.records.forEach((record) => {
            const label = normalizeLabel(record.propertyName);
            if (label) {
                propertyNames.set(normalizeKey(label), label);
            }
        });

        return [...propertyNames.values()].sort((left, right) => left.localeCompare(right));
    }

    getMonthOptions() {
        const monthKeys = new Set();
        this.records.forEach((record) => {
            const monthKey = record.monthKey || String(record.deliveryDate || "").slice(0, 7);
            if (monthKey) {
                monthKeys.add(monthKey);
            }
        });

        return [...monthKeys]
            .sort((left, right) => right.localeCompare(left))
            .map((monthKey) => ({
                value: monthKey,
                label: this.formatMonthLabel(monthKey)
            }));
    }

    getFilteredRecords(status = "all") {
        return filterLaundryLogRecords(this.records, {
            query: this.searchQuery,
            status,
            month: this.selectedMonth
        });
    }

    getPendingRecords() {
        return this.getFilteredRecords("all")
            .filter((record) => record.status !== "matched")
            .slice(0, 5);
    }

    getReturnRecords() {
        return this.getFilteredRecords("all")
            .filter((record) => record.status !== "matched");
    }

    getCompletedRecords() {
        return this.getFilteredRecords("matched");
    }

    formatDate(dateValue) {
        if (!dateValue) {
            return "—";
        }

        const date = new Date(`${dateValue}T00:00:00`);
        if (Number.isNaN(date.getTime())) {
            return dateValue;
        }

        return new Intl.DateTimeFormat(this.getLocale(), {
            day: "numeric",
            month: "short",
            year: "numeric"
        }).format(date);
    }

    formatMonthLabel(monthKey) {
        const [year, month] = String(monthKey || "").split("-").map(Number);
        if (!year || !month) {
            return monthKey;
        }

        return new Intl.DateTimeFormat(this.getLocale(), {
            month: "long",
            year: "numeric"
        }).format(new Date(year, month - 1, 1));
    }

    setStatus(message = "", tone = "info") {
        this.statusMessage = message;
        this.statusTone = tone;
    }

    scrollFormIntoView() {
        document.getElementById("laundry-log-form-card")?.scrollIntoView?.({
            behavior: "smooth",
            block: "start"
        });
    }

    syncDraftFromDomIfPresent() {
        if (!document.getElementById("laundry-log-property-input")) {
            return;
        }
        this.draft = this.readDraftFromDom();
    }

    readDraftFromDom() {
        const propertyName = normalizeLabel(document.getElementById("laundry-log-property-input")?.value || this.draft.propertyName);
        const matchedProperty = this.findPropertyByName(propertyName);
        const items = createEmptyLaundryLogItems();

        document.querySelectorAll("[data-laundry-item-key][data-laundry-item-field]").forEach((input) => {
            const itemKey = input.dataset.laundryItemKey;
            const field = input.dataset.laundryItemField;
            if (!itemKey || !field || !items[itemKey]) {
                return;
            }
            items[itemKey][field] = Number(input.value || 0);
        });

        return this.createDefaultDraft({
            propertyId: matchedProperty?.id || "",
            propertyName: matchedProperty?.name || propertyName,
            deliveryDate: document.getElementById("laundry-log-delivery-date-input")?.value || this.draft.deliveryDate,
            receivedDate: document.getElementById("laundry-log-received-date-input")?.value || "",
            notes: document.getElementById("laundry-log-notes-input")?.value || "",
            items
        });
    }

    async saveDraft() {
        const draft = this.readDraftFromDom();
        const summary = summarizeLaundryLogRecord(draft);
        if (!draft.propertyName) {
            this.setStatus(this.tr("messages.propertyRequired"), "danger");
            this.render();
            return;
        }
        if (!draft.deliveryDate) {
            this.setStatus(this.tr("messages.deliveryDateRequired"), "danger");
            this.render();
            return;
        }
        if (summary.deliveredUnits === 0 && summary.receivedUnits === 0) {
            this.setStatus(this.tr("messages.countRequired"), "danger");
            this.render();
            return;
        }

        const original = this.editingRecordId
            ? this.records.find((record) => record.id === this.editingRecordId) || null
            : null;
        const payload = createLaundryLogRecord({
            ...draft,
            createdAt: original?.createdAt || ""
        });

        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }

            if (this.editingRecordId) {
                await updateDoc(doc(recordsRef, this.editingRecordId), payload);
                this.setStatus(this.tr("messages.updated"), "success");
            } else {
                await addDoc(recordsRef, payload);
                this.setStatus(this.tr("messages.saved"), "success");
            }

            this.editingRecordId = null;
            this.draft = this.createDefaultDraft();
            this.render();
        } catch (error) {
            console.error("[Laundry Log] failed to save record:", error);
            this.setStatus(this.tr("messages.saveFailed"), "danger");
            this.render();
        }
    }

    startEditing(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target) {
            return;
        }
        this.activeWorkspace = "entry";
        this.editingRecordId = recordId;
        this.draft = this.createDraftFromRecord(target);
        this.setStatus("", "info");
        this.render();
        this.scrollFormIntoView();
    }

    async deleteRecord(recordId) {
        if (!window.confirm(this.tr("confirm.delete"))) {
            return;
        }

        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }
            await deleteDoc(doc(recordsRef, recordId));
            if (this.editingRecordId === recordId) {
                this.editingRecordId = null;
                this.draft = this.createDefaultDraft();
            }
            this.setStatus(this.tr("messages.deleted"), "success");
            this.render();
        } catch (error) {
            console.error("[Laundry Log] failed to delete record:", error);
            this.setStatus(this.tr("messages.deleteFailed"), "danger");
            this.render();
        }
    }

    resetDraft() {
        this.editingRecordId = null;
        this.draft = this.createDefaultDraft();
        this.setStatus("", "info");
        this.render();
    }

    copyDeliveredToReceived() {
        const draft = this.readDraftFromDom();
        Object.values(draft.items).forEach((item) => {
            item.received = item.delivered;
        });
        draft.receivedDate = draft.receivedDate || getTodayIsoDate();
        this.draft = draft;
        this.render();
    }

    setReceivedDateToToday() {
        const draft = this.readDraftFromDom();
        draft.receivedDate = getTodayIsoDate();
        this.draft = draft;
        this.render();
    }

    clearFilters() {
        this.searchQuery = "";
        this.selectedStatus = "all";
        this.selectedMonth = "all";
        this.render();
    }

    switchWorkspace(nextWorkspace) {
        if (!nextWorkspace || this.activeWorkspace === nextWorkspace) {
            return;
        }

        this.syncDraftFromDomIfPresent();
        this.activeWorkspace = nextWorkspace;
        this.render();
    }

    jumpToSection(sectionKey) {
        if (!sectionKey) {
            return;
        }

        this.syncDraftFromDomIfPresent();
        if (this.activeWorkspace !== "entry") {
            this.activeWorkspace = "entry";
            this.render();
        }

        window.requestAnimationFrame(() => {
            document.getElementById(`laundry-log-section-${sectionKey}`)?.scrollIntoView?.({
                behavior: "smooth",
                block: "start"
            });
        });
    }

    handleRootClick(event) {
        const target = event.target.closest("[data-laundry-action]");
        if (!target) {
            return;
        }

        const action = target.dataset.laundryAction;
        const recordId = target.dataset.recordId || "";
        const workspace = target.dataset.workspace || "";
        const sectionKey = target.dataset.sectionKey || "";
        if (action === "workspace" && workspace) return void this.switchWorkspace(workspace);
        if (action === "jump-section" && sectionKey) return void this.jumpToSection(sectionKey);
        if (action === "save") return void this.saveDraft();
        if (action === "reset") return void this.resetDraft();
        if (action === "copy-delivered") return void this.copyDeliveredToReceived();
        if (action === "received-today") return void this.setReceivedDateToToday();
        if (action === "edit" && recordId) return void this.startEditing(recordId);
        if (action === "delete" && recordId) return void this.deleteRecord(recordId);
        if (action === "clear-filters") return void this.clearFilters();
    }

    handleRootChange(event) {
        const target = event.target;
        if (target?.id === "laundry-log-search-input") {
            this.searchQuery = target.value;
            this.render();
        } else if (target?.id === "laundry-log-status-filter") {
            this.selectedStatus = target.value || "all";
            this.render();
        } else if (target?.id === "laundry-log-month-filter") {
            this.selectedMonth = target.value || "all";
            this.render();
        }
    }

    bindRootEvents() {
        const root = document.getElementById("laundry-log-root");
        if (!root || root.dataset.bound === "true") {
            return;
        }
        root.addEventListener("click", (event) => this.handleRootClick(event));
        root.addEventListener("change", (event) => this.handleRootChange(event));
        root.dataset.bound = "true";
    }

    renderMetricCard(label, value, accentClass) {
        return `
            <article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(label)}</div>
                <div class="mt-3 text-3xl font-semibold ${accentClass}">${escapeHtml(String(value))}</div>
            </article>
        `;
    }

    renderStatusBadge(status) {
        const classNameByStatus = {
            pending: "border-amber-200 bg-amber-50 text-amber-800",
            matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
            mismatch: "border-rose-200 bg-rose-50 text-rose-800"
        };

        return `
            <span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classNameByStatus[status] || classNameByStatus.pending}">
                ${escapeHtml(this.tr(`status.${status}`))}
            </span>
        `;
    }

    renderSection(section, summary, items) {
        return `
            <details id="laundry-log-section-${escapeHtml(section.key)}" class="scroll-mt-28 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm" open>
                <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                        <div class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr(section.labelKey))}</div>
                        <div class="mt-1 text-xs text-slate-500">
                            ${escapeHtml(this.tr("summary.delivered", { count: summary.delivered }))}
                            &nbsp;·&nbsp;
                            ${escapeHtml(this.tr("summary.received", { count: summary.received }))}
                        </div>
                    </div>
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">${escapeHtml(String(summary.delivered - summary.received))}</span>
                </summary>
                <div class="mt-4 space-y-3">
                    ${section.items.map((item) => {
                        const counts = items[item.key] || { delivered: 0, received: 0 };
                        return `
                            <div class="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
                                <div class="text-sm font-medium text-slate-900">${escapeHtml(this.tr(item.labelKey))}</div>
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.deliveredShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-laundry-item-key="${escapeHtml(item.key)}" data-laundry-item-field="delivered" value="${escapeHtml(toInputNumber(counts.delivered))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                </label>
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.receivedShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-laundry-item-key="${escapeHtml(item.key)}" data-laundry-item-field="received" value="${escapeHtml(toInputNumber(counts.received))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                </label>
                            </div>
                        `;
                    }).join("")}
                </div>
            </details>
        `;
    }

    renderWorkspaceTabs() {
        const tabs = [
            { key: "entry", label: this.tr("views.entryWorkspace") },
            { key: "returns", label: this.tr("views.returnsWorkspace") },
            { key: "completed", label: this.tr("views.completedWorkspace") }
        ];

        return `
            <section class="rounded-[28px] border border-slate-200 bg-white p-3 shadow-sm">
                <div class="flex flex-wrap gap-2">
                    ${tabs.map((tab) => {
                        const active = this.activeWorkspace === tab.key;
                        return `
                            <button
                                type="button"
                                data-laundry-action="workspace"
                                data-workspace="${escapeHtml(tab.key)}"
                                class="rounded-full px-4 py-2 text-sm font-medium transition ${active
                                    ? "bg-rose-600 text-white shadow-sm"
                                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"}"
                            >
                                ${escapeHtml(tab.label)}
                            </button>
                        `;
                    }).join("")}
                </div>
            </section>
        `;
    }

    renderSectionNavigator() {
        return `
            <aside class="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-24">
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.sectionNavTitle"))}</div>
                <div class="mt-4 flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
                    ${LAUNDRY_LOG_GROUPS.map((section) => `
                        <button
                            type="button"
                            data-laundry-action="jump-section"
                            data-section-key="${escapeHtml(section.key)}"
                            class="whitespace-nowrap rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                        >
                            ${escapeHtml(this.tr(section.labelKey))}
                        </button>
                    `).join("")}
                </div>
            </aside>
        `;
    }

    renderPendingCard(record) {
        const mismatchNames = record.summary.mismatches
            .slice(0, 3)
            .map((item) => this.tr(item.labelKey))
            .join(", ");

        return `
            <article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="text-sm font-semibold text-slate-900">${escapeHtml(record.propertyName || this.tr("labels.unnamedProperty"))}</div>
                        <div class="mt-1 text-xs text-slate-500">${escapeHtml(this.formatDate(record.deliveryDate))}</div>
                    </div>
                    ${this.renderStatusBadge(record.status)}
                </div>
                <div class="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
                    <div class="rounded-2xl bg-slate-50 px-3 py-2">
                        <div class="font-semibold text-slate-900">${escapeHtml(String(record.deliveredUnits))}</div>
                        <div>${escapeHtml(this.tr("labels.deliveredShort"))}</div>
                    </div>
                    <div class="rounded-2xl bg-slate-50 px-3 py-2">
                        <div class="font-semibold text-slate-900">${escapeHtml(String(record.receivedUnits))}</div>
                        <div>${escapeHtml(this.tr("labels.receivedShort"))}</div>
                    </div>
                    <div class="rounded-2xl bg-slate-50 px-3 py-2">
                        <div class="font-semibold text-slate-900">${escapeHtml(String(record.differenceUnits))}</div>
                        <div>${escapeHtml(this.tr("labels.varianceShort"))}</div>
                    </div>
                </div>
                ${mismatchNames ? `<p class="mt-3 text-sm text-rose-700">${escapeHtml(mismatchNames)}</p>` : ""}
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-laundry-action="edit" data-record-id="${escapeHtml(record.id)}" class="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700">
                        ${escapeHtml(this.tr("actions.review"))}
                    </button>
                </div>
            </article>
        `;
    }

    renderRecordCard(record) {
        const mismatchLines = record.summary.mismatches
            .slice(0, 4)
            .map((item) => `${this.tr(item.labelKey)} (${item.delivered}/${item.received})`)
            .join(", ");

        return `
            <article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="text-base font-semibold text-slate-900">${escapeHtml(record.propertyName || this.tr("labels.unnamedProperty"))}</div>
                        <div class="mt-1 text-sm text-slate-500">
                            ${escapeHtml(this.tr("labels.deliveryDate"))}: ${escapeHtml(this.formatDate(record.deliveryDate))}
                            &nbsp;·&nbsp;
                            ${escapeHtml(this.tr("labels.receivedDate"))}: ${escapeHtml(record.receivedDate ? this.formatDate(record.receivedDate) : this.tr("labels.notReturned"))}
                        </div>
                    </div>
                    ${this.renderStatusBadge(record.status)}
                </div>
                <div class="mt-4 grid gap-3 sm:grid-cols-3">
                    <div class="rounded-2xl bg-slate-50 px-4 py-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.deliveredShort"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.deliveredUnits))}</div>
                    </div>
                    <div class="rounded-2xl bg-slate-50 px-4 py-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.receivedShort"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.receivedUnits))}</div>
                    </div>
                    <div class="rounded-2xl bg-slate-50 px-4 py-3">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.varianceShort"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.differenceUnits))}</div>
                    </div>
                </div>
                ${mismatchLines ? `<p class="mt-4 text-sm text-rose-700">${escapeHtml(mismatchLines)}</p>` : ""}
                ${record.notes ? `<p class="mt-3 text-sm text-slate-600">${escapeHtml(record.notes)}</p>` : ""}
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-laundry-action="edit" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                        ${escapeHtml(this.tr("actions.edit"))}
                    </button>
                    <button type="button" data-laundry-action="delete" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">
                        ${escapeHtml(this.tr("actions.delete"))}
                    </button>
                </div>
            </article>
        `;
    }

    renderEntryWorkspace({ draftSummary, propertyOptions, pendingRecords, titleKey }) {
        return `
            <section class="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
                ${this.renderSectionNavigator()}
                <div class="space-y-6">
                    <article id="laundry-log-form-card" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">${escapeHtml(this.tr("header.kicker"))}</div>
                                <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.tr(titleKey))}</h2>
                                <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("form.helper"))}</p>
                            </div>
                            ${this.renderStatusBadge(draftSummary.status)}
                        </div>
                        <div class="mt-5 grid gap-4 md:grid-cols-2">
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.property"))}
                                <input id="laundry-log-property-input" type="text" list="laundry-log-property-list" value="${escapeHtml(this.draft.propertyName)}" placeholder="${escapeHtml(this.tr("form.propertyPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                            </label>
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.deliveryDate"))}
                                <input id="laundry-log-delivery-date-input" type="date" value="${escapeHtml(this.draft.deliveryDate)}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                            </label>
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.receivedDate"))}
                                <input id="laundry-log-received-date-input" type="date" value="${escapeHtml(this.draft.receivedDate)}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                            </label>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div class="font-semibold text-slate-900">${escapeHtml(this.tr("summary.recordStatus"))}</div>
                                <div class="mt-2">${escapeHtml(this.tr("summary.delivered", { count: draftSummary.deliveredUnits }))} · ${escapeHtml(this.tr("summary.received", { count: draftSummary.receivedUnits }))} · ${escapeHtml(this.tr("summary.variance", { count: draftSummary.differenceUnits }))}</div>
                            </div>
                        </div>
                        <div class="mt-5 flex flex-wrap gap-2">
                            <button type="button" data-laundry-action="copy-delivered" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.copyDelivered"))}</button>
                            <button type="button" data-laundry-action="received-today" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.setReceivedToday"))}</button>
                            <button type="button" data-laundry-action="workspace" data-workspace="returns" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">${escapeHtml(this.tr("actions.openReturns"))}</button>
                        </div>
                        <div class="mt-6 space-y-4">
                            ${LAUNDRY_LOG_GROUPS.map((section) => {
                                const summary = draftSummary.sectionSummaries.find((entry) => entry.key === section.key) || { delivered: 0, received: 0 };
                                return this.renderSection(section, summary, this.draft.items);
                            }).join("")}
                        </div>
                        <label class="mt-6 block text-sm font-medium text-slate-700">
                            ${escapeHtml(this.tr("labels.notes"))}
                            <textarea id="laundry-log-notes-input" rows="4" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                        </label>
                        <datalist id="laundry-log-property-list">${propertyOptions.map((propertyName) => `<option value="${escapeHtml(propertyName)}"></option>`).join("")}</datalist>
                        <div class="mt-6 flex flex-wrap gap-3">
                            <button type="button" data-laundry-action="save" class="rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700">${escapeHtml(this.editingRecordId ? this.tr("actions.update") : this.tr("actions.save"))}</button>
                            <button type="button" data-laundry-action="reset" class="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.reset"))}</button>
                        </div>
                    </article>
                    <section class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.pendingTitle"))}</div>
                                <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.pendingRecords", pendingRecords.length))}</h2>
                            </div>
                            <button type="button" data-laundry-action="workspace" data-workspace="returns" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.viewAllReturns"))}</button>
                        </div>
                        <div class="mt-5 grid gap-4 lg:grid-cols-2">
                            ${pendingRecords.length ? pendingRecords.map((record) => this.renderPendingCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("empty.pending"))}</p>`}
                        </div>
                    </section>
                </div>
            </section>
        `;
    }

    renderReturnsWorkspace({ returnRecords, monthOptions, pendingRecords }) {
        return `
            <section class="grid gap-6">
                <section class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.returnsTitle"))}</div>
                            <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.returnRecords", returnRecords.length))}</h2>
                        </div>
                        <button type="button" data-laundry-action="workspace" data-workspace="entry" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.backToEntry"))}</button>
                    </div>
                    <div class="mt-5 grid gap-4 lg:grid-cols-3">
                        ${returnRecords.length ? returnRecords.map((record) => this.renderPendingCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500 lg:col-span-3">${escapeHtml(this.tr("empty.returns"))}</p>`}
                    </div>
                </section>
                <section class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.pendingTitle"))}</div>
                            <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.pendingRecords", pendingRecords.length))}</h2>
                        </div>
                        <div class="grid gap-3 sm:grid-cols-2">
                            <label class="block text-sm font-medium text-slate-600">
                                ${escapeHtml(t("common.search"))}
                                <input id="laundry-log-search-input" type="search" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                            </label>
                            <label class="block text-sm font-medium text-slate-600">
                                ${escapeHtml(this.tr("filters.month"))}
                                <select id="laundry-log-month-filter" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                    <option value="all" ${this.selectedMonth === "all" ? "selected" : ""}>${escapeHtml(this.tr("filters.allMonths"))}</option>
                                    ${monthOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${this.selectedMonth === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
                                </select>
                            </label>
                        </div>
                    </div>
                    <div class="mt-4"><button type="button" data-laundry-action="clear-filters" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearFilters"))}</button></div>
                    <div class="mt-6 space-y-4">
                        ${pendingRecords.length ? pendingRecords.map((record) => this.renderRecordCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("empty.pending"))}</p>`}
                    </div>
                </section>
            </section>
        `;
    }

    renderCompletedWorkspace({ completedRecords, monthOptions }) {
        return `
            <section class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.completedTitle"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.completedRecords", completedRecords.length))}</h2>
                    </div>
                    <div class="grid gap-3 sm:grid-cols-2">
                        <label class="block text-sm font-medium text-slate-600">
                            ${escapeHtml(t("common.search"))}
                            <input id="laundry-log-search-input" type="search" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                        </label>
                        <label class="block text-sm font-medium text-slate-600">
                            ${escapeHtml(this.tr("filters.month"))}
                            <select id="laundry-log-month-filter" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                <option value="all" ${this.selectedMonth === "all" ? "selected" : ""}>${escapeHtml(this.tr("filters.allMonths"))}</option>
                                ${monthOptions.map((option) => `<option value="${escapeHtml(option.value)}" ${this.selectedMonth === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
                            </select>
                        </label>
                    </div>
                </div>
                <div class="mt-4 flex flex-wrap gap-3">
                    <button type="button" data-laundry-action="clear-filters" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearFilters"))}</button>
                    <button type="button" data-laundry-action="workspace" data-workspace="returns" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.openReturns"))}</button>
                </div>
                <div class="mt-6 space-y-4">
                    ${completedRecords.length ? completedRecords.map((record) => this.renderRecordCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("empty.completed"))}</p>`}
                </div>
            </section>
        `;
    }

    render() {
        const root = document.getElementById("laundry-log-root");
        if (!root) {
            return;
        }
        this.bindRootEvents();

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h2 class="text-xl font-semibold text-slate-900">${escapeHtml(this.tr("states.restrictedTitle"))}</h2>
                    <p class="mt-3 text-sm text-slate-600">${escapeHtml(this.tr("states.restrictedBody"))}</p>
                </section>
            `;
            return;
        }

        const totals = summarizeLaundryLogRecords(this.records).totals;
        const pendingRecords = this.getPendingRecords();
        const returnRecords = this.getReturnRecords();
        const completedRecords = this.getCompletedRecords();
        const propertyOptions = this.getKnownPropertyNames();
        const monthOptions = this.getMonthOptions();
        const draftSummary = summarizeLaundryLogRecord(this.draft);
        const titleKey = this.editingRecordId ? "views.editTitle" : "views.formTitle";

        root.innerHTML = `
            ${this.statusMessage ? `<section class="rounded-2xl border px-4 py-3 text-sm font-medium ${toneClass(this.statusTone)}">${escapeHtml(this.statusMessage)}</section>` : ""}
            <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                ${this.renderMetricCard(this.tr("stats.totalRecords"), totals.count, "text-slate-900")}
                ${this.renderMetricCard(this.tr("stats.pending"), totals.pending, "text-amber-700")}
                ${this.renderMetricCard(this.tr("stats.matched"), totals.matched, "text-emerald-700")}
                ${this.renderMetricCard(this.tr("stats.unitsDelivered"), totals.deliveredUnits, "text-rose-700")}
                ${this.renderMetricCard(this.tr("stats.unitsReceived"), totals.receivedUnits, "text-sky-700")}
            </section>
            ${this.renderWorkspaceTabs()}
            ${this.activeWorkspace === "entry"
                ? this.renderEntryWorkspace({ draftSummary, propertyOptions, pendingRecords, titleKey })
                : this.activeWorkspace === "returns"
                ? this.renderReturnsWorkspace({ returnRecords, monthOptions, pendingRecords })
                : this.renderCompletedWorkspace({ completedRecords, monthOptions })}
        `;
    }
}
