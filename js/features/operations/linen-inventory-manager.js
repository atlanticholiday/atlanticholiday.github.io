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
    createEmptyCustomLinenInventoryItems,
    createEmptyLinenInventoryItems,
    createLinenInventoryRecord,
    filterLinenInventoryRecords,
    LINEN_INVENTORY_GROUPS,
    summarizeLinenInventoryRecord,
    summarizeLinenInventoryRecords
} from "./linen-inventory-utils.js";

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

export class LinenInventoryManager {
    constructor(db, { getDataManager = null, getProperties = null } = {}) {
        this.db = db || null;
        this.getDataManager = typeof getDataManager === "function" ? getDataManager : () => null;
        this.readProperties = typeof getProperties === "function" ? getProperties : () => [];
        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.records = [];
        this.unsubscribe = null;
        this.editingRecordId = null;
        this.searchQuery = "";
        this.draft = this.createDefaultDraft();
        this.statusMessage = "";
        this.statusTone = "info";

        if (typeof window !== "undefined") {
            window.setTimeout(() => this.ensureDomScaffold(), 50);
            document.addEventListener("linenInventoryPageOpened", () => {
                this.ensureDomScaffold();
                this.startListening();
                this.render();
            });
            document.addEventListener("propertiesDataUpdated", () => {
                if (document.getElementById("linen-inventory-page")) {
                    this.render();
                }
            });
            window.addEventListener("languageChanged", this.handleLanguageChange);
        }
    }

    tr(key, replacements = {}) {
        return t(`linenInventory.${key}`, replacements);
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
            notes: "",
            countedDate: getTodayIsoDate(),
            ...overrides,
            items: createEmptyLinenInventoryItems(overrides.items),
            customItems: createEmptyCustomLinenInventoryItems(overrides.customItems)
        };
    }

    createDraftFromRecord(record = {}) {
        return this.createDefaultDraft({
            propertyId: record.propertyId || "",
            propertyName: record.propertyName || "",
            notes: record.notes || "",
            countedDate: record.countedDate || record.lastCountedAt || getTodayIsoDate(),
            items: createEmptyLinenInventoryItems(record.items),
            customItems: createEmptyCustomLinenInventoryItems(record.customItems)
        });
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.canAccessApp !== "function") {
            return true;
        }
        return Boolean(dataManager.canAccessApp("linenInventory"));
    }

    syncAccessVisibility() {
        const button = document.getElementById("go-to-linen-inventory-btn");
        if (button) {
            button.classList.toggle("hidden", !this.hasAccess());
        }
        if (document.getElementById("linen-inventory-page")) {
            this.render();
        }
    }

    updateStaticCopy() {
        const entries = [
            ["linen-inventory-back-label", t("common.back")],
            ["linen-inventory-header-kicker", this.tr("header.kicker")],
            ["linen-inventory-header-title", this.tr("header.title")],
            ["linen-inventory-header-subtitle", this.tr("header.subtitle")],
            ["linen-inventory-sign-out-btn", t("common.signOut")],
            ["linen-inventory-card-title", this.tr("header.title")],
            ["linen-inventory-card-description", this.tr("landing.description")]
        ];

        entries.forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    ensureDomScaffold() {
        if (!document.getElementById("linen-inventory-page")) {
            const page = document.createElement("div");
            page.id = "linen-inventory-page";
            page.className = "hidden min-h-screen bg-stone-50";
            page.innerHTML = `
                <div id="linen-inventory-shell" class="mx-auto w-full max-w-[1920px] px-4 py-6 xl:px-8 2xl:px-10">
                    <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div class="flex items-center gap-3">
                            <button id="back-to-landing-from-linen-inventory-btn" class="inline-flex items-center text-sm text-slate-600 hover:text-slate-900">
                                <svg class="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                                <span id="linen-inventory-back-label"></span>
                            </button>
                            <div>
                                <div id="linen-inventory-header-kicker" class="text-xs font-semibold uppercase tracking-[0.28em] text-rose-600"></div>
                                <h1 id="linen-inventory-header-title" class="text-2xl font-semibold text-slate-900"></h1>
                                <p id="linen-inventory-header-subtitle" class="mt-1 text-sm text-slate-600"></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 self-start md:self-auto">
                            <div class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm">
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="en" title="English">EN</button>
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="pt" title="Portugues">PT</button>
                            </div>
                            <button id="linen-inventory-sign-out-btn" class="text-sm text-red-600 hover:underline"></button>
                        </div>
                    </div>
                    <div id="linen-inventory-root" class="space-y-6"></div>
                </div>
            `;

            const landing = document.getElementById("landing-page");
            if (landing?.parentElement) {
                landing.parentElement.appendChild(page);
            } else {
                document.body.appendChild(page);
            }
        }

        if (!document.getElementById("go-to-linen-inventory-btn")) {
            const parent = document.getElementById("services-logistics-grid")
                || document.getElementById("go-to-laundry-log-btn")?.parentElement
                || document.getElementById("go-to-welcome-packs-btn")?.parentElement
                || document.getElementById("other-tools-grid");

            if (parent) {
                const card = document.createElement("button");
                card.id = "go-to-linen-inventory-btn";
                card.className = parent.querySelector(".dashboard-card")?.className || "dashboard-card";
                card.innerHTML = `
                    <div class="card-icon bg-rose-500/10 text-rose-600">
                        <i class="fas fa-boxes"></i>
                    </div>
                    <div class="card-body">
                        <h3 id="linen-inventory-card-title"></h3>
                        <p id="linen-inventory-card-description"></p>
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

    handleLanguageChange() {
        this.ensureDomScaffold();
        this.render();
    }

    getCollectionRef() {
        return this.db ? collection(this.db, "linenInventoryRecords") : null;
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
            console.error("[Linen Inventory] records listener failed:", error);
            this.setStatus(this.tr("messages.loadFailed"), "danger");
            this.render();
        });
    }

    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
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

    getFilteredRecords() {
        return filterLinenInventoryRecords(this.records, {
            query: this.searchQuery
        });
    }

    formatDate(dateValue) {
        if (!dateValue) {
            return "-";
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

    setStatus(message = "", tone = "info") {
        this.statusMessage = message;
        this.statusTone = tone;
    }

    scrollFormIntoView() {
        document.getElementById("linen-inventory-form-card")?.scrollIntoView?.({
            behavior: "smooth",
            block: "start"
        });
    }

    readDraftFromDom() {
        const propertyName = normalizeLabel(document.getElementById("linen-inventory-property-input")?.value || this.draft.propertyName);
        const matchedProperty = this.findPropertyByName(propertyName);
        const items = createEmptyLinenInventoryItems();

        document.querySelectorAll("[data-linen-item-key][data-linen-item-field]").forEach((input) => {
            const itemKey = input.dataset.linenItemKey;
            const field = input.dataset.linenItemField;
            if (!itemKey || !field || !items[itemKey]) {
                return;
            }
            items[itemKey][field] = Number(input.value || 0);
        });

        const customItemsByIndex = new Map();
        document.querySelectorAll("[data-linen-custom-index][data-linen-custom-field]").forEach((input) => {
            const index = Number(input.dataset.linenCustomIndex);
            const field = input.dataset.linenCustomField;
            if (!Number.isInteger(index) || index < 0 || !field) {
                return;
            }
            const customItem = customItemsByIndex.get(index) || { name: "", count: 0 };
            if (field === "name") {
                customItem.name = input.value || "";
            } else if (field === "count") {
                customItem.count = Number(input.value || 0);
            }
            customItemsByIndex.set(index, customItem);
        });

        return this.createDefaultDraft({
            propertyId: matchedProperty?.id || "",
            propertyName: matchedProperty?.name || propertyName,
            notes: document.getElementById("linen-inventory-notes-input")?.value || "",
            countedDate: document.getElementById("linen-inventory-counted-input")?.value || "",
            items,
            customItems: [...customItemsByIndex.keys()]
                .sort((left, right) => left - right)
                .map((index) => customItemsByIndex.get(index))
        });
    }

    findExistingPropertyRecord(draft) {
        const propertyId = normalizeLabel(draft.propertyId);
        const propertyName = normalizeKey(draft.propertyName);
        return this.records.find((record) => {
            if (this.editingRecordId && record.id === this.editingRecordId) {
                return false;
            }
            if (propertyId && normalizeLabel(record.propertyId) === propertyId) {
                return true;
            }
            return propertyName && normalizeKey(record.propertyName) === propertyName;
        }) || null;
    }

    async saveDraft() {
        const draft = this.readDraftFromDom();
        const summary = summarizeLinenInventoryRecord(draft);
        if (!draft.propertyName) {
            this.setStatus(this.tr("messages.propertyRequired"), "danger");
            this.render();
            return;
        }
        if (summary.countedUnits === 0) {
            this.setStatus(this.tr("messages.countRequired"), "danger");
            this.render();
            return;
        }

        const original = this.editingRecordId
            ? this.records.find((record) => record.id === this.editingRecordId) || null
            : this.findExistingPropertyRecord(draft);
        const payload = createLinenInventoryRecord({
            ...draft,
            createdAt: original?.createdAt || ""
        });

        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }

            if (this.editingRecordId || original?.id) {
                await updateDoc(doc(recordsRef, this.editingRecordId || original.id), payload);
                this.setStatus(this.tr("messages.updated"), "success");
            } else {
                await addDoc(recordsRef, payload);
                this.setStatus(this.tr("messages.saved"), "success");
            }

            this.editingRecordId = null;
            this.draft = this.createDefaultDraft();
            this.render();
        } catch (error) {
            console.error("[Linen Inventory] failed to save record:", error);
            this.setStatus(this.tr("messages.saveFailed"), "danger");
            this.render();
        }
    }

    startEditing(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target) {
            return;
        }
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
            console.error("[Linen Inventory] failed to delete record:", error);
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

    markCountedToday() {
        const draft = this.readDraftFromDom();
        draft.countedDate = getTodayIsoDate();
        this.draft = draft;
        this.render();
    }

    clearDate() {
        const draft = this.readDraftFromDom();
        draft.countedDate = "";
        this.draft = draft;
        this.render();
    }

    addCustomItem() {
        const draft = this.readDraftFromDom();
        draft.customItems.push({ name: "", count: 0 });
        this.draft = draft;
        this.render();
        window.requestAnimationFrame(() => {
            const nameInputs = document.querySelectorAll("[data-linen-custom-field='name']");
            nameInputs[nameInputs.length - 1]?.focus?.();
        });
    }

    removeCustomItem(index) {
        const draft = this.readDraftFromDom();
        if (index < 0 || index >= draft.customItems.length) {
            return;
        }
        draft.customItems.splice(index, 1);
        this.draft = draft;
        this.render();
    }

    clearCustomItemCount(index, field) {
        if (!field) {
            return;
        }
        const draft = this.readDraftFromDom();
        if (!draft.customItems?.[index]) {
            return;
        }
        draft.customItems[index][field] = 0;
        this.draft = draft;
        this.render();
    }

    clearItemCount(itemKey, field) {
        if (!itemKey || !field) {
            return;
        }
        const draft = this.readDraftFromDom();
        if (!draft.items?.[itemKey]) {
            return;
        }
        draft.items[itemKey][field] = 0;
        this.draft = draft;
        this.render();
    }

    clearFilters() {
        this.searchQuery = "";
        this.render();
    }

    handleRootClick(event) {
        const target = event.target.closest("[data-linen-action]");
        if (!target) {
            return;
        }

        const action = target.dataset.linenAction;
        const recordId = target.dataset.recordId || "";
        const itemKey = target.dataset.itemKey || "";
        const field = target.dataset.field || "";
        const customIndex = Number(target.dataset.customIndex);
        if (action === "save") return void this.saveDraft();
        if (action === "reset") return void this.resetDraft();
        if (action === "counted-today") return void this.markCountedToday();
        if (action === "clear-date") return void this.clearDate();
        if (action === "clear-count" && itemKey && field) return void this.clearItemCount(itemKey, field);
        if (action === "add-custom-item") return void this.addCustomItem();
        if (action === "remove-custom-item" && Number.isInteger(customIndex)) return void this.removeCustomItem(customIndex);
        if (action === "clear-custom-count" && Number.isInteger(customIndex) && field) return void this.clearCustomItemCount(customIndex, field);
        if (action === "edit" && recordId) return void this.startEditing(recordId);
        if (action === "delete" && recordId) return void this.deleteRecord(recordId);
        if (action === "clear-filters") return void this.clearFilters();
    }

    handleRootChange(event) {
        const target = event.target;
        if (target?.id === "linen-inventory-search-input") {
            this.searchQuery = target.value;
            this.render();
        }
    }

    bindRootEvents() {
        const root = document.getElementById("linen-inventory-root");
        if (!root || root.dataset.bound === "true") {
            return;
        }
        root.addEventListener("click", (event) => this.handleRootClick(event));
        root.addEventListener("change", (event) => this.handleRootChange(event));
        root.dataset.bound = "true";
    }

    renderMetricCard(label, value, accentClass) {
        return `
            <article class="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(label)}</div>
                <div class="mt-2 text-2xl font-semibold ${accentClass}">${escapeHtml(String(value))}</div>
            </article>
        `;
    }

    renderMetricsSection(totals) {
        return `
            <section class="grid gap-3 md:grid-cols-3">
                ${this.renderMetricCard(this.tr("stats.records"), totals.count, "text-slate-900")}
                ${this.renderMetricCard(this.tr("stats.countedUnits"), totals.countedUnits, "text-rose-700")}
                ${this.renderMetricCard(this.tr("stats.trackedItems"), totals.trackedItems, "text-sky-700")}
            </section>
        `;
    }

    renderStatusBadge(status) {
        const classNameByStatus = {
            empty: "border-slate-200 bg-slate-50 text-slate-700",
            counted: "border-emerald-200 bg-emerald-50 text-emerald-800"
        };

        return `
            <span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classNameByStatus[status] || classNameByStatus.empty}">
                ${escapeHtml(this.tr(`status.${status}`))}
            </span>
        `;
    }

    getLinenItemLabel(item) {
        if (item?.name) {
            return item.name;
        }
        if (item?.labelKey) {
            return this.tr(item.labelKey);
        }
        return this.tr("labels.customItemFallback");
    }

    renderCustomItemRow(item, index) {
        return `
            <div class="grid gap-3 rounded-xl border border-dashed border-rose-200 bg-rose-50/40 p-3 sm:grid-cols-[minmax(150px,1fr)_130px_auto]">
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.customItemName"))}
                    <input type="text" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="name" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(this.tr("form.customItemPlaceholder"))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                </label>
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.countShort"))}
                    <input type="number" min="0" inputmode="numeric" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="count" value="${escapeHtml(toInputNumber(item.count))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    <button type="button" data-linen-action="clear-custom-count" data-custom-index="${escapeHtml(String(index))}" data-field="count" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                </label>
                <button type="button" data-linen-action="remove-custom-item" data-custom-index="${escapeHtml(String(index))}" class="self-end rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">
                    ${escapeHtml(this.tr("actions.removeCustomItem"))}
                </button>
            </div>
        `;
    }

    renderSection(section, sectionSummary, items, customItems) {
        return `
            <section class="rounded-2xl border border-slate-200 bg-white p-4">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h3 class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr(section.labelKey))}</h3>
                        <div class="mt-1 text-xs text-slate-500">
                            ${escapeHtml(this.tr("summary.counted", { count: sectionSummary.count }))}
                        </div>
                    </div>
                    <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">${escapeHtml(this.tr("summary.items", { count: sectionSummary.itemCount }))}</span>
                </div>
                <div class="mt-3 divide-y divide-slate-100">
                    ${section.items.map((item) => {
                        const counts = items[item.key] || { count: 0 };
                        return `
                            <div class="grid gap-3 py-3 sm:grid-cols-[minmax(180px,1fr)_130px] sm:items-start">
                                <div class="text-sm font-medium text-slate-800">${escapeHtml(this.tr(item.labelKey))}</div>
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.countShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-linen-item-key="${escapeHtml(item.key)}" data-linen-item-field="count" value="${escapeHtml(toInputNumber(counts.count))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                    <button type="button" data-linen-action="clear-count" data-item-key="${escapeHtml(item.key)}" data-field="count" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                                </label>
                            </div>
                        `;
                    }).join("")}
                </div>
                ${section.key === "other" ? `
                    <div class="mt-4 space-y-3 border-t border-slate-100 pt-4">
                        <div class="flex items-center justify-between gap-3">
                            <div class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("labels.customItems"))}</div>
                            <button type="button" data-linen-action="add-custom-item" class="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100">${escapeHtml(this.tr("actions.addCustomItem"))}</button>
                        </div>
                        ${customItems.length ? customItems.map((item, index) => this.renderCustomItemRow(item, index)).join("") : `<p class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">${escapeHtml(this.tr("empty.customItems"))}</p>`}
                    </div>
                ` : ""}
            </section>
        `;
    }

    renderRecordCard(record) {
        const detail = record.summary.sectionSummaries
            .filter((section) => section.count > 0)
            .slice(0, 3)
            .map((section) => `${this.tr(section.labelKey)} ${section.count}`)
            .join(" - ");

        return `
            <article class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="text-base font-semibold text-slate-900">${escapeHtml(record.propertyName || this.tr("labels.unnamedProperty"))}</div>
                        <div class="mt-1 text-sm text-slate-500">${escapeHtml(record.countedDate ? this.tr("labels.countedOn", { date: this.formatDate(record.countedDate) }) : this.tr("labels.noDate"))}</div>
                    </div>
                    ${this.renderStatusBadge(record.status)}
                </div>
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div class="rounded-xl bg-slate-50 px-4 py-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.totalCounted"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.countedUnits))}</div>
                    </div>
                    <div class="rounded-xl bg-slate-50 px-4 py-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.trackedItems"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.trackedItems))}</div>
                    </div>
                </div>
                ${detail ? `<p class="mt-3 text-sm text-slate-600">${escapeHtml(detail)}</p>` : ""}
                ${record.notes ? `<p class="mt-2 text-sm text-slate-500">${escapeHtml(record.notes)}</p>` : ""}
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-linen-action="edit" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                        ${escapeHtml(this.tr("actions.edit"))}
                    </button>
                    <button type="button" data-linen-action="delete" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">
                        ${escapeHtml(this.tr("actions.delete"))}
                    </button>
                </div>
            </article>
        `;
    }

    renderForm({ draftSummary, propertyOptions }) {
        return `
            <article id="linen-inventory-form-card" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">${escapeHtml(this.tr("header.kicker"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.editingRecordId ? this.tr("views.editTitle") : this.tr("views.formTitle"))}</h2>
                        <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("form.helper"))}</p>
                    </div>
                    ${this.renderStatusBadge(draftSummary.status)}
                </div>
                <div class="mt-5 grid gap-4 md:grid-cols-2">
                    <label class="block text-sm font-medium text-slate-700">
                        ${escapeHtml(this.tr("labels.property"))}
                        <input id="linen-inventory-property-input" type="text" list="linen-inventory-property-list" value="${escapeHtml(this.draft.propertyName)}" placeholder="${escapeHtml(this.tr("form.propertyPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    </label>
                    <label class="block text-sm font-medium text-slate-700">
                        ${escapeHtml(this.tr("labels.countedDate"))}
                        <input id="linen-inventory-counted-input" type="date" value="${escapeHtml(this.draft.countedDate)}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                        <button type="button" data-linen-action="clear-date" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearDate"))}</button>
                    </label>
                </div>
                <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <div class="font-semibold text-slate-900">${escapeHtml(this.tr("summary.recordStatus"))}</div>
                    <div class="mt-2">${escapeHtml(this.tr("summary.counted", { count: draftSummary.countedUnits }))} - ${escapeHtml(this.tr("summary.items", { count: draftSummary.trackedItems }))}</div>
                </div>
                <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" data-linen-action="counted-today" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.markCountedToday"))}</button>
                    <button type="button" data-linen-action="add-custom-item" class="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 sm:w-auto">${escapeHtml(this.tr("actions.addCustomItem"))}</button>
                </div>
                <div class="mt-6 grid gap-4 2xl:grid-cols-2">
                    ${LINEN_INVENTORY_GROUPS.map((section) => {
                        const summary = draftSummary.sectionSummaries.find((entry) => entry.key === section.key) || { count: 0, itemCount: 0 };
                        return this.renderSection(section, summary, this.draft.items, this.draft.customItems);
                    }).join("")}
                </div>
                <label class="mt-6 block text-sm font-medium text-slate-700">
                    ${escapeHtml(this.tr("labels.notes"))}
                    <textarea id="linen-inventory-notes-input" rows="4" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                </label>
                <datalist id="linen-inventory-property-list">${propertyOptions.map((propertyName) => `<option value="${escapeHtml(propertyName)}"></option>`).join("")}</datalist>
                <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" data-linen-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.editingRecordId ? this.tr("actions.update") : this.tr("actions.save"))}</button>
                    <button type="button" data-linen-action="reset" class="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.reset"))}</button>
                </div>
            </article>
        `;
    }

    renderRecords({ records }) {
        return `
            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.recordsTitle"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.records", records.length))}</h2>
                    </div>
                    <div class="grid gap-3">
                        <label class="block text-sm font-medium text-slate-600">
                            ${escapeHtml(t("common.search"))}
                            <input id="linen-inventory-search-input" type="search" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                        </label>
                    </div>
                </div>
                <div class="mt-4"><button type="button" data-linen-action="clear-filters" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearFilters"))}</button></div>
                <div class="mt-6 space-y-4">
                    ${records.length ? records.map((record) => this.renderRecordCard(record)).join("") : `<p class="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("empty.records"))}</p>`}
                </div>
            </section>
        `;
    }

    render() {
        const root = document.getElementById("linen-inventory-root");
        if (!root) {
            return;
        }
        this.bindRootEvents();

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h2 class="text-xl font-semibold text-slate-900">${escapeHtml(this.tr("states.restrictedTitle"))}</h2>
                    <p class="mt-3 text-sm text-slate-600">${escapeHtml(this.tr("states.restrictedBody"))}</p>
                </section>
            `;
            return;
        }

        const totals = summarizeLinenInventoryRecords(this.records).totals;
        const records = this.getFilteredRecords();
        const propertyOptions = this.getKnownPropertyNames();
        const draftSummary = summarizeLinenInventoryRecord(this.draft);

        root.innerHTML = `
            ${this.statusMessage ? `<section class="rounded-xl border px-4 py-3 text-sm font-medium ${toneClass(this.statusTone)}">${escapeHtml(this.statusMessage)}</section>` : ""}
            ${this.renderMetricsSection(totals)}
            <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.38fr)] xl:items-start">
                ${this.renderForm({ draftSummary, propertyOptions })}
                ${this.renderRecords({ records })}
            </section>
        `;
    }
}
