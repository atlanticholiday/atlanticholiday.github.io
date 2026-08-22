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
    createEmptyCustomLaundryLogItems,
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
        return "border-emerald-300 bg-emerald-50 text-emerald-900";
    }
    if (tone === "danger") {
        return "border-rose-200 bg-rose-50 text-rose-800";
    }
    return "border-sky-200 bg-sky-50 text-sky-800";
}

function statusIcon(tone) {
    if (tone === "success") {
        return `
            <svg class="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
        `;
    }
    if (tone === "danger") {
        return `
            <svg class="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
        `;
    }
    return `
        <svg class="h-5 w-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" />
        </svg>
    `;
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
        this.entryFormExpanded = false;
        this.returnEditingRecordId = null;
        this.cleanerPropertyQuery = "";
        this.cleanerDraftRestored = false;
        this.cleanerDraftStorageKey = "";
        this.cleanerExpandedSections = new Set(["doubleBed", "towels"]);
        this.cleanerShowAllSections = new Set();
        this.cleanerCompactPreset = false;
        this.cleanerExtraPickerOpen = false;
        this.cleanerNotice = "";
        this.isSaving = false;
        this.draft = this.createDefaultDraft();
        this.statusMessage = "";
        this.statusTone = "info";
        this.statusDetails = null;

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
            ...overrides,
            items: createEmptyLaundryLogItems(overrides.items),
            customItems: createEmptyCustomLaundryLogItems(overrides.customItems)
        };
    }

    createDraftFromRecord(record = {}) {
        return this.createDefaultDraft({
            propertyId: record.propertyId || "",
            propertyName: record.propertyName || "",
            deliveryDate: record.deliveryDate || getTodayIsoDate(),
            receivedDate: record.receivedDate || "",
            notes: record.notes || "",
            items: createEmptyLaundryLogItems(record.items),
            customItems: createEmptyCustomLaundryLogItems(record.customItems)
        });
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.canAccessApp !== "function") {
            return true;
        }
        return Boolean(dataManager.canAccessApp("laundryLog"));
    }

    isManagerView() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.hasPrivilegedRole !== "function") {
            return true;
        }
        return Boolean(dataManager.hasPrivilegedRole());
    }

    isCleanerView() {
        return this.hasAccess() && !this.isManagerView();
    }

    getCurrentActor() {
        const dataManager = this.getDataManager();
        const context = dataManager?.getCurrentUserContext?.() || {};
        const employee = dataManager?.getCurrentUserEmployee?.() || context.linkedEmployee || {};
        return {
            uid: normalizeLabel(context.uid),
            email: normalizeLabel(context.email),
            name: normalizeLabel(employee.name || context.email)
        };
    }

    getActorLabel(actor = {}) {
        return normalizeLabel(actor?.name || actor?.email);
    }

    getCleanerDraftKey() {
        const actor = this.getCurrentActor();
        const identity = actor.uid || actor.email || "local";
        return `horario:laundry-log-draft:${encodeURIComponent(identity)}`;
    }

    ensureCleanerDraftRestored() {
        const storageKey = this.getCleanerDraftKey();
        if (this.cleanerDraftRestored && this.cleanerDraftStorageKey === storageKey) {
            return;
        }

        this.cleanerDraftRestored = true;
        this.cleanerDraftStorageKey = storageKey;
        try {
            const saved = JSON.parse(window.localStorage?.getItem(storageKey) || "null");
            const savedAt = Date.parse(saved?.savedAt || "");
            const isRecent = Number.isFinite(savedAt) && Date.now() - savedAt < 24 * 60 * 60 * 1000;
            if (isRecent && saved?.draft?.propertyName) {
                this.draft = this.createDefaultDraft(saved.draft);
                this.entryFormExpanded = true;
                this.cleanerCompactPreset = Boolean(saved.compactPreset);
            }
        } catch {
            // A saved phone draft is a convenience only; storage can be unavailable.
        }
    }

    persistCleanerDraft() {
        if (!this.isCleanerView()) {
            return;
        }
        const storageKey = this.cleanerDraftStorageKey || this.getCleanerDraftKey();
        this.cleanerDraftStorageKey = storageKey;
        try {
            window.localStorage?.setItem(storageKey, JSON.stringify({
                savedAt: new Date().toISOString(),
                draft: this.draft,
                compactPreset: this.cleanerCompactPreset
            }));
        } catch {
            // Keep the live form working when local storage is unavailable or full.
        }
    }

    clearCleanerDraft() {
        const storageKey = this.cleanerDraftStorageKey || this.getCleanerDraftKey();
        try {
            window.localStorage?.removeItem(storageKey);
        } catch {
            // No action is needed when local storage is unavailable.
        }
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
                <div id="laundry-log-shell" class="mx-auto w-full max-w-[1920px] px-4 py-6 xl:px-8 2xl:px-10">
                    <div id="laundry-log-header" class="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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
                        <div id="laundry-log-header-actions" class="flex items-center gap-3 self-start md:self-auto">
                            <div class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-1 py-1 shadow-sm">
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="en" title="English">EN</button>
                                <button type="button" class="lang-btn rounded px-2 py-1 text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="pt" title="Português">PT</button>
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
            const parent = document.getElementById("services-logistics-grid")
                || document.getElementById("go-to-welcome-packs-btn")?.parentElement
                || document.getElementById("go-to-properties-btn")?.parentElement
                || document.getElementById("other-tools-grid");

            if (parent) {
                const card = document.createElement("button");
                card.id = "go-to-laundry-log-btn";
                card.className = parent.querySelector(".dashboard-card")?.className || "dashboard-card";
                card.innerHTML = `
                    <div class="card-icon bg-rose-500/10 text-rose-600">
                        <i class="fas fa-tshirt"></i>
                    </div>
                    <div class="card-body">
                        <h3 id="laundry-log-card-title"></h3>
                        <p id="laundry-log-card-description"></p>
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

    getKnownPropertyOptions() {
        const propertyOptions = new Map();
        this.getProperties().forEach((property) => {
            const name = normalizeLabel(
                property?.name
                || property?.displayName
                || property?.title
                || property?.reference
                || property?.code
            );
            if (name) {
                propertyOptions.set(normalizeKey(name), {
                    id: normalizeLabel(property?.id),
                    name
                });
            }
        });
        this.records.forEach((record) => {
            const name = normalizeLabel(record.propertyName);
            const key = normalizeKey(name);
            if (key && !propertyOptions.has(key)) {
                propertyOptions.set(key, {
                    id: normalizeLabel(record.propertyId),
                    name
                });
            }
        });

        return [...propertyOptions.values()]
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    getRecentPropertyOptions(limit = 4) {
        const knownByName = new Map(
            this.getKnownPropertyOptions().map((property) => [normalizeKey(property.name), property])
        );
        const recent = [];
        const seen = new Set();
        filterLaundryLogRecords(this.records).forEach((record) => {
            const key = normalizeKey(record.propertyName);
            if (!key || seen.has(key) || recent.length >= limit) {
                return;
            }
            seen.add(key);
            recent.push(knownByName.get(key) || {
                id: normalizeLabel(record.propertyId),
                name: normalizeLabel(record.propertyName)
            });
        });
        return recent;
    }

    getLatestPropertyLoad(propertyName) {
        const propertyKey = normalizeKey(propertyName);
        if (!propertyKey) {
            return null;
        }
        return filterLaundryLogRecords(this.records)
            .find((record) => normalizeKey(record.propertyName) === propertyKey && record.deliveredUnits > 0)
            || null;
    }

    getCleanerPendingRecords() {
        return this.getFilteredRecords("all")
            .filter((record) => record.status === "pending" || record.status === "mismatch")
            .sort((left, right) => String(left.deliveryDate || "").localeCompare(String(right.deliveryDate || "")));
    }

    buildAuditedPayload(draft, original = null, { markReceived = false, now = () => new Date().toISOString() } = {}) {
        const timestamp = now();
        const actor = this.getCurrentActor();
        const payload = createLaundryLogRecord({
            ...draft,
            createdAt: original?.createdAt || timestamp
        }, {
            now: () => timestamp
        });
        const createdBy = original ? original.createdBy : actor;
        const sentBy = original ? (original.sentBy || original.createdBy) : actor;
        const receivedBy = markReceived
            ? actor
            : original?.receivedBy;

        return {
            ...payload,
            updatedBy: actor,
            ...(createdBy ? { createdBy } : {}),
            ...(sentBy ? { sentBy } : {}),
            sentAt: original?.sentAt || original?.createdAt || timestamp,
            ...(receivedBy ? { receivedBy } : {}),
            ...(markReceived
                ? { receivedAt: timestamp }
                : original?.receivedAt
                ? { receivedAt: original.receivedAt }
                : {})
        };
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
            .filter((record) => record.status === "pending")
            .slice(0, 5);
    }

    getReturnRecords() {
        return this.getFilteredRecords("all")
            .filter((record) => record.status === "pending");
    }

    getMismatchRecords() {
        return this.getFilteredRecords("mismatch");
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

    setStatus(message = "", tone = "info", details = null) {
        this.statusMessage = message;
        this.statusTone = tone;
        this.statusDetails = details;
    }

    setSaveControlsBusy(isBusy) {
        this.isSaving = Boolean(isBusy);
        document.querySelectorAll("[data-laundry-action='save']")
            .forEach((button) => {
                button.disabled = this.isSaving;
                button.classList.toggle("opacity-60", this.isSaving);
                button.classList.toggle("cursor-wait", this.isSaving);
            });
    }

    buildSavedStatusDetails(record = {}) {
        const items = createEmptyLaundryLogItems(record.items);
        const customItems = createEmptyCustomLaundryLogItems(record.customItems);
        const savedItems = [];

        LAUNDRY_LOG_GROUPS.forEach((group) => {
            group.items.forEach((item) => {
                const counts = items[item.key] || { delivered: 0, received: 0 };
                if (counts.delivered <= 0 && counts.received <= 0) {
                    return;
                }
                savedItems.push({
                    name: this.tr(item.labelKey),
                    delivered: counts.delivered,
                    received: counts.received
                });
            });
        });

        customItems.forEach((item) => {
            if (item.delivered <= 0 && item.received <= 0) {
                return;
            }
            savedItems.push({
                name: item.name || this.tr("labels.customItemFallback"),
                delivered: item.delivered,
                received: item.received
            });
        });

        return {
            propertyName: record.propertyName || "",
            deliveryDate: record.deliveryDate || "",
            receivedDate: record.receivedDate || "",
            notes: record.notes || "",
            items: savedItems
        };
    }

    scrollFormIntoView() {
        document.getElementById("laundry-log-form-card")?.scrollIntoView?.({
            behavior: "smooth",
            block: "start"
        });
    }

    scrollToSelector(selector) {
        window.requestAnimationFrame(() => {
            const element = document.querySelector(selector);
            element?.scrollIntoView?.({
                behavior: "smooth",
                block: "center"
            });
            element?.focus?.({ preventScroll: true });
        });
    }

    showValidationError(message, selector) {
        this.setStatus(message, "danger");
        this.entryFormExpanded = true;
        this.render();
        this.scrollToSelector(selector);
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
        const items = createEmptyLaundryLogItems(this.draft.items);

        document.querySelectorAll("[data-laundry-item-key][data-laundry-item-field]").forEach((input) => {
            const itemKey = input.dataset.laundryItemKey;
            const field = input.dataset.laundryItemField;
            if (!itemKey || !field || !items[itemKey]) {
                return;
            }
            items[itemKey][field] = Number(input.value || 0);
        });

        const customItemsByIndex = new Map(
            createEmptyCustomLaundryLogItems(this.draft.customItems)
                .map((item, index) => [index, { ...item }])
        );
        document.querySelectorAll("[data-laundry-custom-index][data-laundry-custom-field]").forEach((input) => {
            const index = Number(input.dataset.laundryCustomIndex);
            const field = input.dataset.laundryCustomField;
            if (!Number.isInteger(index) || index < 0 || !field) {
                return;
            }
            const customItem = customItemsByIndex.get(index) || { name: "", delivered: 0, received: 0 };
            if (field === "name") {
                customItem.name = input.value || "";
            } else if (field === "delivered" || field === "received") {
                customItem[field] = Number(input.value || 0);
            }
            customItemsByIndex.set(index, customItem);
        });

        return this.createDefaultDraft({
            propertyId: matchedProperty?.id || "",
            propertyName: matchedProperty?.name || propertyName,
            deliveryDate: document.getElementById("laundry-log-delivery-date-input")?.value || this.draft.deliveryDate,
            receivedDate: document.getElementById("laundry-log-received-date-input")?.value || "",
            notes: document.getElementById("laundry-log-notes-input")?.value || "",
            items,
            customItems: [...customItemsByIndex.keys()]
                .sort((left, right) => left - right)
                .map((index) => customItemsByIndex.get(index))
        });
    }

    async saveDraft() {
        if (this.isSaving) {
            return;
        }
        const draft = this.readDraftFromDom();
        const summary = summarizeLaundryLogRecord(draft);
        if (!draft.propertyName) {
            this.showValidationError(this.tr("messages.propertyRequired"), "#laundry-log-property-input");
            return;
        }
        if (!draft.deliveryDate) {
            this.showValidationError(this.tr("messages.deliveryDateRequired"), "#laundry-log-delivery-date-input");
            return;
        }
        if (summary.deliveredUnits === 0 && summary.receivedUnits === 0) {
            this.showValidationError(this.tr("messages.countRequired"), "[data-laundry-item-field='delivered']");
            return;
        }

        const original = this.editingRecordId
            ? this.records.find((record) => record.id === this.editingRecordId) || null
            : null;
        const isReturnUpdate = Boolean(this.returnEditingRecordId)
            || (!original?.receivedAt && summary.receivedStarted);
        const payload = this.buildAuditedPayload(draft, original, {
            markReceived: isReturnUpdate
        });
        const savedDetails = this.buildSavedStatusDetails(draft);

        try {
            this.setSaveControlsBusy(true);
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }

            if (this.editingRecordId) {
                await updateDoc(doc(recordsRef, this.editingRecordId), payload);
                this.records = this.records.map((record) => record.id === this.editingRecordId
                    ? { ...record, ...payload }
                    : record);
                this.setStatus(
                    isReturnUpdate && this.isCleanerView()
                        ? this.tr("cleaner.returnSaved")
                        : this.tr("messages.updated"),
                    "success",
                    savedDetails
                );
            } else {
                const savedRecord = await addDoc(recordsRef, payload);
                this.records = this.records.some((record) => record.id === savedRecord.id)
                    ? this.records.map((record) => record.id === savedRecord.id ? { ...record, ...payload } : record)
                    : [{ id: savedRecord.id, ...payload }, ...this.records];
                this.setStatus(this.tr("messages.saved"), "success", savedDetails);
            }

            this.editingRecordId = null;
            this.returnEditingRecordId = null;
            this.draft = this.createDefaultDraft();
            this.entryFormExpanded = false;
            this.cleanerNotice = "";
            if (isReturnUpdate && this.isCleanerView()) {
                this.cleanerDraftRestored = false;
                this.ensureCleanerDraftRestored();
            } else {
                this.clearCleanerDraft();
            }
            this.render();
            this.scrollToSelector("#laundry-log-status-message");
        } catch (error) {
            console.error("[Laundry Log] failed to save record:", error);
            this.setStatus(this.tr("messages.saveFailed"), "danger");
            this.render();
            this.scrollToSelector("#laundry-log-status-message");
        } finally {
            this.setSaveControlsBusy(false);
        }
    }

    startEditing(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target) {
            return;
        }
        this.activeWorkspace = "entry";
        this.editingRecordId = recordId;
        this.entryFormExpanded = true;
        this.draft = this.createDraftFromRecord(target);
        this.setStatus("", "info");
        this.render();
        this.scrollFormIntoView();
    }

    startReturnReview(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target) {
            return;
        }
        this.activeWorkspace = "returns";
        this.returnEditingRecordId = recordId;
        this.editingRecordId = recordId;
        this.draft = this.createDraftFromRecord(target);
        this.setStatus("", "info");
        this.render();
        this.scrollToSelector("#laundry-log-return-editor");
    }

    selectCleanerProperty(propertyId, propertyName) {
        const property = this.getKnownPropertyOptions().find((entry) => {
            return (propertyId && entry.id === propertyId)
                || normalizeKey(entry.name) === normalizeKey(propertyName);
        }) || {
            id: normalizeLabel(propertyId),
            name: normalizeLabel(propertyName)
        };
        if (!property.name) {
            return;
        }

        this.editingRecordId = null;
        this.returnEditingRecordId = null;
        this.entryFormExpanded = true;
        this.cleanerNotice = "";
        this.cleanerCompactPreset = false;
        this.cleanerShowAllSections.clear();
        this.draft = this.createDefaultDraft({
            propertyId: property.id,
            propertyName: property.name,
            deliveryDate: getTodayIsoDate()
        });
        this.persistCleanerDraft();
        this.render();
        this.scrollToSelector("#laundry-cleaner-send-form");
    }

    changeCleanerProperty() {
        const draft = this.readDraftFromDom();
        this.draft = this.createDefaultDraft({
            ...draft,
            propertyId: "",
            propertyName: ""
        });
        this.cleanerPropertyQuery = "";
        this.cleanerNotice = "";
        this.cleanerCompactPreset = false;
        this.cleanerShowAllSections.clear();
        this.persistCleanerDraft();
        this.render();
    }

    resetCleanerSend() {
        this.editingRecordId = null;
        this.returnEditingRecordId = null;
        this.entryFormExpanded = false;
        this.cleanerNotice = "";
        this.cleanerCompactPreset = false;
        this.cleanerShowAllSections.clear();
        this.draft = this.createDefaultDraft();
        this.clearCleanerDraft();
        this.setStatus("", "info");
        this.render();
    }

    applyLatestPropertyLoad() {
        const draft = this.readDraftFromDom();
        const previousLoad = this.getLatestPropertyLoad(draft.propertyName);
        if (!previousLoad) {
            return;
        }

        const previousItems = createEmptyLaundryLogItems(previousLoad.items);
        Object.values(previousItems).forEach((counts) => {
            counts.received = 0;
        });
        const previousCustomItems = createEmptyCustomLaundryLogItems(previousLoad.customItems)
            .map((item) => ({
                ...item,
                received: 0
            }));
        this.draft = this.createDefaultDraft({
            ...draft,
            deliveryDate: draft.deliveryDate || getTodayIsoDate(),
            items: previousItems,
            customItems: previousCustomItems
        });
        this.cleanerExpandedSections = new Set(
            summarizeLaundryLogRecord(this.draft).sectionSummaries
                .filter((section) => section.delivered > 0)
                .map((section) => section.key)
        );
        this.cleanerCompactPreset = true;
        this.cleanerShowAllSections.clear();
        this.cleanerNotice = this.tr("cleaner.previousLoadApplied", {
            date: this.formatDate(previousLoad.deliveryDate)
        });
        this.persistCleanerDraft();
        this.render();
    }

    showCleanerSectionItems(sectionKey) {
        if (!sectionKey) {
            return;
        }
        this.cleanerExpandedSections.add(sectionKey);
        this.cleanerShowAllSections.add(sectionKey);
        this.render();
    }

    adjustCleanerItemCount(itemKey, field, delta) {
        if (!itemKey || !["delivered", "received"].includes(field) || !Number.isFinite(delta)) {
            return;
        }
        const draft = this.readDraftFromDom();
        if (!draft.items?.[itemKey]) {
            return;
        }
        draft.items[itemKey][field] = Math.max(0, Number(draft.items[itemKey][field] || 0) + delta);
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    adjustCleanerCustomCount(index, field, delta) {
        if (!Number.isInteger(index) || index < 0 || !["delivered", "received"].includes(field) || !Number.isFinite(delta)) {
            return;
        }
        const draft = this.readDraftFromDom();
        if (!draft.customItems?.[index]) {
            return;
        }
        draft.customItems[index][field] = Math.max(0, Number(draft.customItems[index][field] || 0) + delta);
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    startCleanerReturnReview(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target) {
            return;
        }
        const draft = this.createDraftFromRecord(target);

        this.activeWorkspace = "returns";
        this.returnEditingRecordId = recordId;
        this.editingRecordId = recordId;
        this.cleanerExtraPickerOpen = false;
        this.draft = draft;
        this.cleanerExpandedSections = new Set(
            summarizeLaundryLogRecord(draft).sectionSummaries
                .filter((section) => section.delivered > 0)
                .map((section) => section.key)
        );
        this.setStatus("", "info");
        this.render();
        this.scrollToSelector("#laundry-cleaner-return-editor");
    }

    closeCleanerReturnReview() {
        this.editingRecordId = null;
        this.returnEditingRecordId = null;
        this.cleanerExtraPickerOpen = false;
        this.draft = this.createDefaultDraft();
        this.cleanerDraftRestored = false;
        this.ensureCleanerDraftRestored();
        this.setStatus("", "info");
        this.render();
    }

    toggleCleanerExtraPicker() {
        this.cleanerExtraPickerOpen = !this.cleanerExtraPickerOpen;
        this.render();
        if (this.cleanerExtraPickerOpen) {
            this.scrollToSelector("#laundry-cleaner-extra-picker");
        }
    }

    addCleanerReturnExtraItem() {
        const itemKey = document.getElementById("laundry-cleaner-extra-item-select")?.value || "";
        const group = LAUNDRY_LOG_GROUPS.find((section) => section.items.some((item) => item.key === itemKey));
        if (!itemKey || !group) {
            return;
        }
        const draft = this.readDraftFromDom();
        if (!draft.items?.[itemKey]) {
            return;
        }
        draft.items[itemKey].received = Math.max(1, Number(draft.items[itemKey].received || 0));
        this.draft = draft;
        this.cleanerExpandedSections.add(group.key);
        this.persistCleanerDraft();
        this.render();
        this.scrollToSelector(`[data-laundry-item-key='${itemKey}'][data-laundry-item-field='received']`);
    }

    addCleanerReturnCustomExtraItem() {
        const input = document.getElementById("laundry-cleaner-extra-custom-name");
        const name = normalizeLabel(input?.value);
        if (!name) {
            input?.focus?.();
            return;
        }
        const draft = this.readDraftFromDom();
        const existingItem = draft.customItems.find((item) => normalizeKey(item.name) === normalizeKey(name));
        if (existingItem) {
            existingItem.received = Math.max(1, Number(existingItem.received || 0) + 1);
        } else {
            draft.customItems.push({ name, delivered: 0, received: 1 });
        }
        this.draft = draft;
        this.cleanerExpandedSections.add("other");
        this.persistCleanerDraft();
        this.render();
        this.scrollToSelector("[data-laundry-cleaner-section='other']");
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
        this.returnEditingRecordId = null;
        this.entryFormExpanded = false;
        this.draft = this.createDefaultDraft();
        this.setStatus("", "info");
        this.render();
    }

    copyDeliveredToReceived() {
        const draft = this.readDraftFromDom();
        Object.values(draft.items).forEach((item) => {
            item.received = item.delivered;
        });
        draft.customItems.forEach((item) => {
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

    clearDate(field) {
        const draft = this.readDraftFromDom();
        if (field === "deliveryDate") {
            draft.deliveryDate = "";
        }
        if (field === "receivedDate") {
            draft.receivedDate = "";
        }
        this.draft = draft;
        this.render();
    }

    addCustomItem() {
        const draft = this.readDraftFromDom();
        draft.customItems.push({ name: "", delivered: 0, received: 0 });
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
        window.requestAnimationFrame(() => {
            const nameInputs = document.querySelectorAll("[data-laundry-custom-field='name']");
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
        this.persistCleanerDraft();
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
        this.persistCleanerDraft();
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
        this.persistCleanerDraft();
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

        if (this.isCleanerView() && this.returnEditingRecordId && nextWorkspace === "entry") {
            this.activeWorkspace = "entry";
            this.closeCleanerReturnReview();
            return;
        }
        this.syncDraftFromDomIfPresent();
        if (this.isCleanerView() && this.activeWorkspace === "entry") {
            this.persistCleanerDraft();
        }
        this.activeWorkspace = nextWorkspace;
        if (nextWorkspace !== "returns") {
            this.returnEditingRecordId = null;
        }
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
        const field = target.dataset.field || "";
        const itemKey = target.dataset.itemKey || "";
        const propertyId = target.dataset.propertyId || "";
        const propertyName = target.dataset.propertyName || "";
        const delta = Number(target.dataset.delta);
        const customIndex = Number(target.dataset.customIndex);
        if (action === "workspace" && workspace) return void this.switchWorkspace(workspace);
        if (action === "jump-section" && sectionKey) return void this.jumpToSection(sectionKey);
        if (action === "save") return void this.saveDraft();
        if (action === "reset") return void this.resetDraft();
        if (action === "select-property" && propertyName) return void this.selectCleanerProperty(propertyId, propertyName);
        if (action === "change-property") return void this.changeCleanerProperty();
        if (action === "cancel-cleaner-send") return void this.resetCleanerSend();
        if (action === "use-previous-load") return void this.applyLatestPropertyLoad();
        if (action === "show-section-items" && sectionKey) return void this.showCleanerSectionItems(sectionKey);
        if (action === "adjust-count" && itemKey && field && Number.isFinite(delta)) return void this.adjustCleanerItemCount(itemKey, field, delta);
        if (action === "adjust-custom-count" && Number.isInteger(customIndex) && field && Number.isFinite(delta)) return void this.adjustCleanerCustomCount(customIndex, field, delta);
        if (action === "toggle-extra-picker") return void this.toggleCleanerExtraPicker();
        if (action === "add-return-extra-item") return void this.addCleanerReturnExtraItem();
        if (action === "add-return-custom-extra") return void this.addCleanerReturnCustomExtraItem();
        if (action === "close-return-review") return void this.closeCleanerReturnReview();
        if (action === "copy-delivered") return void this.copyDeliveredToReceived();
        if (action === "received-today") return void this.setReceivedDateToToday();
        if (action === "clear-date" && field) return void this.clearDate(field);
        if (action === "clear-count" && itemKey && field) return void this.clearItemCount(itemKey, field);
        if (action === "add-custom-item") return void this.addCustomItem();
        if (action === "remove-custom-item" && Number.isInteger(customIndex)) return void this.removeCustomItem(customIndex);
        if (action === "clear-custom-count" && Number.isInteger(customIndex) && field) return void this.clearCustomItemCount(customIndex, field);
        if (action === "edit" && recordId) return void this.startEditing(recordId);
        if (action === "review-return" && recordId) {
            return void (this.isCleanerView()
                ? this.startCleanerReturnReview(recordId)
                : this.startReturnReview(recordId));
        }
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
        } else if (this.isCleanerView() && target?.matches?.("[data-laundry-item-field], [data-laundry-custom-field], #laundry-log-delivery-date-input, #laundry-log-notes-input")) {
            this.draft = this.readDraftFromDom();
            this.persistCleanerDraft();
        }
    }

    handleRootInput(event) {
        const target = event.target;
        if (target?.matches?.("[data-laundry-counter-input]")) {
            const numericValue = String(target.value || "").replace(/[^0-9]/g, "");
            if (target.value !== numericValue) {
                target.value = numericValue;
            }
        }
        if (target?.id === "laundry-cleaner-property-search") {
            const query = normalizeKey(target.value);
            this.cleanerPropertyQuery = target.value;
            let visibleCount = 0;
            document.querySelectorAll("[data-cleaner-property-option]").forEach((option) => {
                const matches = !query || normalizeKey(option.dataset.propertyName).includes(query);
                option.classList.toggle("hidden", !matches);
                if (matches) visibleCount += 1;
            });
            document.getElementById("laundry-cleaner-property-empty")?.classList.toggle("hidden", visibleCount > 0);
            return;
        }

        if (this.isCleanerView() && target?.matches?.("[data-laundry-item-field], [data-laundry-custom-field], #laundry-log-delivery-date-input, #laundry-log-notes-input")) {
            this.draft = this.readDraftFromDom();
            this.persistCleanerDraft();
        }
    }

    handleRootToggle(event) {
        const target = event.target;
        if (target?.id === "laundry-log-form-card") {
            this.entryFormExpanded = target.open;
        } else if (target?.dataset?.laundryCleanerSection) {
            const sectionKey = target.dataset.laundryCleanerSection;
            if (target.open) {
                this.cleanerExpandedSections.add(sectionKey);
            } else {
                this.cleanerExpandedSections.delete(sectionKey);
            }
        }
    }

    bindRootEvents() {
        const root = document.getElementById("laundry-log-root");
        if (!root || root.dataset.bound === "true") {
            return;
        }
        root.addEventListener("click", (event) => this.handleRootClick(event));
        root.addEventListener("change", (event) => this.handleRootChange(event));
        root.addEventListener("input", (event) => this.handleRootInput(event));
        root.addEventListener("toggle", (event) => this.handleRootToggle(event), true);
        root.dataset.bound = "true";
    }

    renderCleanerStatus() {
        if (!this.statusMessage) {
            return "";
        }
        return `
            <section id="laundry-log-status-message" class="rounded-2xl border px-4 py-3 text-sm font-medium ${toneClass(this.statusTone)}" role="status" aria-live="polite" tabindex="-1">
                <div class="flex items-center gap-3">
                    <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80">
                        ${statusIcon(this.statusTone)}
                    </span>
                    <span class="min-w-0 flex-1">${escapeHtml(this.statusMessage)}</span>
                </div>
            </section>
        `;
    }

    renderCleanerModeSwitch(pendingCount) {
        const tabs = [
            {
                key: "entry",
                label: this.tr("cleaner.sendTab"),
                count: null
            },
            {
                key: "returns",
                label: this.tr("cleaner.receiveTab"),
                count: pendingCount
            }
        ];
        return `
            <nav class="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1" aria-label="${escapeHtml(this.tr("cleaner.modeLabel"))}">
                ${tabs.map((tab) => {
                    const active = this.activeWorkspace === tab.key;
                    return `
                        <button
                            type="button"
                            role="tab"
                            aria-selected="${active ? "true" : "false"}"
                            data-laundry-action="workspace"
                            data-workspace="${escapeHtml(tab.key)}"
                            class="flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active
                                ? "bg-white text-slate-950 shadow-sm"
                                : "text-slate-600 hover:text-slate-900"}"
                        >
                            <span>${escapeHtml(tab.label)}</span>
                            ${tab.count !== null ? `<span class="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs ${active ? "bg-rose-600 text-white" : "bg-white/80 text-slate-700"}">${escapeHtml(String(tab.count))}</span>` : ""}
                        </button>
                    `;
                }).join("")}
            </nav>
        `;
    }

    renderCleanerPropertyButton(property, { recent = false } = {}) {
        const propertyQuery = normalizeKey(this.cleanerPropertyQuery);
        const isVisible = !propertyQuery || normalizeKey(property.name).includes(propertyQuery);
        return `
            <button
                type="button"
                data-laundry-action="select-property"
                data-property-id="${escapeHtml(property.id)}"
                data-property-name="${escapeHtml(property.name)}"
                data-cleaner-property-option="true"
                class="${isVisible ? "" : "hidden "}group flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition active:scale-[0.99] hover:border-rose-200 hover:bg-rose-50/40"
            >
                <span>
                    <span class="block text-base font-semibold text-slate-900">${escapeHtml(property.name)}</span>
                    ${recent ? `<span class="mt-0.5 block text-xs font-medium text-slate-500">${escapeHtml(this.tr("cleaner.usedRecently"))}</span>` : ""}
                </span>
                <svg class="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
            </button>
        `;
    }

    renderCleanerPropertyPicker() {
        const propertyOptions = this.getKnownPropertyOptions();
        const recentProperties = this.getRecentPropertyOptions();
        const recentKeys = new Set(recentProperties.map((property) => normalizeKey(property.name)));
        const otherProperties = propertyOptions.filter((property) => !recentKeys.has(normalizeKey(property.name)));
        const propertyQuery = normalizeKey(this.cleanerPropertyQuery);
        const hasVisibleProperty = propertyOptions.some((property) => {
            return !propertyQuery || normalizeKey(property.name).includes(propertyQuery);
        });
        return `
            <section aria-labelledby="laundry-cleaner-property-title">
                <div>
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">${escapeHtml(this.tr("cleaner.sendKicker"))}</div>
                    <h2 id="laundry-cleaner-property-title" class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.tr("cleaner.chooseProperty"))}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.choosePropertyHint"))}</p>
                </div>
                <label class="mt-5 block">
                    <span class="sr-only">${escapeHtml(this.tr("cleaner.searchProperties"))}</span>
                    <span class="relative block">
                        <svg class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" />
                        </svg>
                        <input id="laundry-cleaner-property-search" type="search" value="${escapeHtml(this.cleanerPropertyQuery)}" placeholder="${escapeHtml(this.tr("cleaner.searchProperties"))}" autocomplete="off" class="min-h-12 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100">
                    </span>
                </label>
                ${recentProperties.length ? `
                    <div class="mt-6">
                        <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("cleaner.recentProperties"))}</h3>
                        <div class="mt-3 grid gap-2">
                            ${recentProperties.map((property) => this.renderCleanerPropertyButton(property, { recent: true })).join("")}
                        </div>
                    </div>
                ` : ""}
                ${otherProperties.length ? `
                    <div class="mt-6">
                        <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("cleaner.allProperties"))}</h3>
                        <div class="mt-3 grid gap-2">
                            ${otherProperties.map((property) => this.renderCleanerPropertyButton(property)).join("")}
                        </div>
                    </div>
                ` : ""}
                <p id="laundry-cleaner-property-empty" class="${hasVisibleProperty ? "hidden " : ""}mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.noProperties"))}</p>
            </section>
        `;
    }

    renderCleanerCounter({ itemKey = "", customIndex = null, field, value, label, sentCount = null }) {
        const isCustom = Number.isInteger(customIndex);
        const action = isCustom ? "adjust-custom-count" : "adjust-count";
        const targetAttributes = isCustom
            ? `data-custom-index="${escapeHtml(String(customIndex))}"`
            : `data-item-key="${escapeHtml(itemKey)}"`;
        const inputAttributes = isCustom
            ? `data-laundry-custom-index="${escapeHtml(String(customIndex))}" data-laundry-custom-field="${escapeHtml(field)}"`
            : `data-laundry-item-key="${escapeHtml(itemKey)}" data-laundry-item-field="${escapeHtml(field)}"`;
        return `
            <div class="flex min-h-16 items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0">
                <div class="min-w-0 pr-2">
                    <div class="text-sm font-medium leading-5 text-slate-900">${escapeHtml(label)}</div>
                    ${sentCount !== null ? `<div class="mt-0.5 text-xs font-medium text-slate-500">${escapeHtml(this.tr("cleaner.sentCount", { count: sentCount }))}</div>` : ""}
                </div>
                <div class="laundry-cleaner-counter-control flex shrink-0 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <button type="button" data-laundry-action="${action}" ${targetAttributes} data-field="${escapeHtml(field)}" data-delta="-1" aria-label="${escapeHtml(this.tr("cleaner.decrease", { item: label }))}" class="flex h-12 w-11 shrink-0 items-center justify-center text-2xl font-medium text-slate-600 transition hover:bg-slate-50 active:bg-slate-100">&minus;</button>
                    <input type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-laundry-counter-input="true" aria-label="${escapeHtml(label)}" ${inputAttributes} value="${escapeHtml(String(value || 0))}" class="laundry-cleaner-counter-input h-12 w-11 shrink-0 border-x border-slate-200 bg-slate-50 p-0 text-center text-base font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-rose-200">
                    <button type="button" data-laundry-action="${action}" ${targetAttributes} data-field="${escapeHtml(field)}" data-delta="1" aria-label="${escapeHtml(this.tr("cleaner.increase", { item: label }))}" class="flex h-12 w-11 shrink-0 items-center justify-center text-2xl font-medium text-rose-700 transition hover:bg-rose-50 active:bg-rose-100">+</button>
                </div>
            </div>
        `;
    }

    renderCleanerCustomItem(item, index, mode = "send") {
        const field = mode === "return" ? "received" : "delivered";
        const label = item.name || this.tr("labels.customItemFallback");
        if (mode === "return") {
            return this.renderCleanerCounter({
                customIndex: index,
                field,
                value: item[field],
                label,
                sentCount: item.delivered
            });
        }
        return `
            <div class="rounded-2xl border border-rose-100 bg-rose-50/40 px-3 py-3">
                <div class="flex items-center gap-2">
                    <input type="text" data-laundry-custom-index="${escapeHtml(String(index))}" data-laundry-custom-field="name" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(this.tr("form.customItemPlaceholder"))}" class="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                    <button type="button" data-laundry-action="remove-custom-item" data-custom-index="${escapeHtml(String(index))}" aria-label="${escapeHtml(this.tr("actions.removeCustomItem"))}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-rose-700 transition hover:bg-rose-100">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div class="mt-2">
                    ${this.renderCleanerCounter({
                        customIndex: index,
                        field,
                        value: item[field],
                        label,
                        sentCount: null
                    })}
                </div>
            </div>
        `;
    }

    renderCleanerSection(section, sectionSummary, mode = "send") {
        const field = mode === "return" ? "received" : "delivered";
        const allRows = section.items.filter((item) => {
            const counts = this.draft.items?.[item.key] || { delivered: 0, received: 0 };
            return mode !== "return" || Number(counts.delivered || 0) > 0 || Number(counts.received || 0) > 0;
        });
        const compactPreset = mode === "send"
            && this.cleanerCompactPreset
            && !this.cleanerShowAllSections.has(section.key);
        const rows = compactPreset
            ? allRows.filter((item) => Number(this.draft.items?.[item.key]?.delivered || 0) > 0)
            : allRows;
        const hiddenRowCount = allRows.length - rows.length;
        const customItems = section.key === "other"
            ? this.draft.customItems
                .map((item, index) => ({ item, index }))
                .filter((entry) => mode !== "return" || entry.item.delivered > 0 || entry.item.received > 0)
            : [];
        if (mode === "return" && rows.length === 0 && customItems.length === 0) {
            return "";
        }
        const count = sectionSummary?.[field] || 0;
        const isOpen = this.cleanerExpandedSections.has(section.key)
            || (mode === "return" && sectionSummary?.delivered > 0);
        return `
            <details data-laundry-cleaner-section="${escapeHtml(section.key)}" class="border-b border-slate-200 py-1 last:border-b-0" ${isOpen ? "open" : ""}>
                <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3">
                    <span class="text-base font-semibold text-slate-950">${escapeHtml(this.tr(section.labelKey))}</span>
                    <span class="flex items-center gap-3">
                        <span class="min-w-7 rounded-full bg-slate-100 px-2 py-1 text-center text-xs font-semibold text-slate-600">${escapeHtml(String(count))}</span>
                        <svg class="h-5 w-5 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </span>
                </summary>
                <div class="pb-3">
                    ${rows.map((item) => {
                        const counts = this.draft.items[item.key] || { delivered: 0, received: 0 };
                        return this.renderCleanerCounter({
                            itemKey: item.key,
                            field,
                            value: counts[field],
                            label: this.tr(item.labelKey),
                            sentCount: mode === "return" ? counts.delivered : null
                        });
                    }).join("")}
                    ${customItems.length ? `<div class="mt-2 space-y-2">${customItems.map((entry) => this.renderCleanerCustomItem(entry.item, entry.index, mode)).join("")}</div>` : ""}
                    ${compactPreset && hiddenRowCount > 0 ? `
                        <button type="button" data-laundry-action="show-section-items" data-section-key="${escapeHtml(section.key)}" class="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">
                            <span class="text-lg">+</span>
                            <span>${escapeHtml(this.tr("cleaner.showMoreItems"))}</span>
                        </button>
                    ` : ""}
                    ${mode === "send" && section.key === "other" ? `
                        <button type="button" data-laundry-action="add-custom-item" class="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                            <span class="text-lg">+</span>
                            <span>${escapeHtml(this.tr("actions.addCustomItem"))}</span>
                        </button>
                    ` : ""}
                </div>
            </details>
        `;
    }

    renderCleanerExtraReturnPicker() {
        const availableGroups = LAUNDRY_LOG_GROUPS.map((section) => ({
            ...section,
            items: section.items.filter((item) => {
                const counts = this.draft.items?.[item.key] || { delivered: 0, received: 0 };
                return Number(counts.delivered || 0) === 0 && Number(counts.received || 0) === 0;
            })
        })).filter((section) => section.items.length > 0);

        return `
            <section id="laundry-cleaner-extra-picker" class="border-b border-slate-200 py-4">
                <button type="button" data-laundry-action="toggle-extra-picker" aria-label="${escapeHtml(this.tr("cleaner.addExtraLinen"))}" aria-expanded="${this.cleanerExtraPickerOpen ? "true" : "false"}" class="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50">
                    <span class="text-xl leading-none">+</span>
                    <span>${escapeHtml(this.tr("cleaner.addExtraLinen"))}</span>
                </button>
                ${this.cleanerExtraPickerOpen ? `
                    <div class="pt-4">
                        <p class="text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.extraLinenHint"))}</p>
                        ${availableGroups.length ? `
                            <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <label>
                                    <span class="sr-only">${escapeHtml(this.tr("cleaner.chooseExtraItem"))}</span>
                                    <select id="laundry-cleaner-extra-item-select" class="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                                        <option value="">${escapeHtml(this.tr("cleaner.chooseExtraItem"))}</option>
                                        ${availableGroups.map((section) => `
                                            <optgroup label="${escapeHtml(this.tr(section.labelKey))}">
                                                ${section.items.map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(this.tr(item.labelKey))}</option>`).join("")}
                                            </optgroup>
                                        `).join("")}
                                    </select>
                                </label>
                                <button type="button" data-laundry-action="add-return-extra-item" class="min-h-12 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition active:scale-[0.99] hover:bg-slate-800">${escapeHtml(this.tr("cleaner.addExtraItem"))}</button>
                            </div>
                        ` : `<p class="mt-3 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.allStandardItemsAdded"))}</p>`}
                        <div class="mt-4 border-t border-slate-200 pt-4">
                            <label class="text-sm font-semibold text-slate-700" for="laundry-cleaner-extra-custom-name">${escapeHtml(this.tr("cleaner.otherExtraItem"))}</label>
                            <div class="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                                <input id="laundry-cleaner-extra-custom-name" type="text" placeholder="${escapeHtml(this.tr("cleaner.otherExtraPlaceholder"))}" class="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                                <button type="button" data-laundry-action="add-return-custom-extra" class="min-h-12 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700">${escapeHtml(this.tr("cleaner.addExtraItem"))}</button>
                            </div>
                        </div>
                    </div>
                ` : ""}
            </section>
        `;
    }

    renderCleanerSendWorkspace() {
        if (!this.draft.propertyName) {
            return this.renderCleanerPropertyPicker();
        }

        const summary = summarizeLaundryLogRecord(this.draft);
        const previousLoad = this.getLatestPropertyLoad(this.draft.propertyName);
        return `
            <section id="laundry-cleaner-send-form" class="laundry-mobile-action-host scroll-mt-6">
                <input id="laundry-log-property-input" type="hidden" value="${escapeHtml(this.draft.propertyName)}">
                <div class="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                    <div class="min-w-0">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">${escapeHtml(this.tr("cleaner.sendingFrom"))}</div>
                        <h2 class="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.draft.propertyName)}</h2>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.formatDate(this.draft.deliveryDate))}</p>
                    </div>
                    <button type="button" data-laundry-action="change-property" class="min-h-11 shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700">${escapeHtml(this.tr("cleaner.changeProperty"))}</button>
                </div>
                ${previousLoad ? `
                    <button type="button" data-laundry-action="use-previous-load" class="mt-5 flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-left transition active:scale-[0.99] hover:bg-rose-50">
                        <span>
                            <span class="block text-sm font-semibold text-rose-900">${escapeHtml(this.tr("cleaner.usePreviousLoad"))}</span>
                            <span class="mt-1 block text-xs text-rose-700">${escapeHtml(this.tr("cleaner.previousLoadHint", { date: this.formatDate(previousLoad.deliveryDate), count: previousLoad.deliveredUnits }))}</span>
                        </span>
                        <svg class="h-5 w-5 shrink-0 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v6h6M20 20v-6h-6M5.64 18.36A9 9 0 0 0 18.36 5.64L20 7M4 17l1.64 1.36" /></svg>
                    </button>
                ` : ""}
                ${this.cleanerNotice ? `<p class="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">${escapeHtml(this.cleanerNotice)}</p>` : ""}
                <div class="mt-7">
                    <div class="flex items-end justify-between gap-4">
                        <div>
                            <h3 class="text-lg font-semibold text-slate-950">${escapeHtml(this.tr("cleaner.itemsGoingOut"))}</h3>
                            <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.itemsHint"))}</p>
                        </div>
                        <span class="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">${escapeHtml(this.tr("cleaner.itemTotal", { count: summary.deliveredUnits }))}</span>
                    </div>
                    <div class="mt-4 border-y border-slate-200">
                        ${LAUNDRY_LOG_GROUPS.map((section) => {
                            const sectionSummary = summary.sectionSummaries.find((entry) => entry.key === section.key);
                            return this.renderCleanerSection(section, sectionSummary, "send");
                        }).join("")}
                    </div>
                </div>
                <details class="mt-6 rounded-2xl bg-slate-100/80 px-4 py-1">
                    <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                        <span>${escapeHtml(this.tr("cleaner.moreOptions"))}</span>
                        <svg class="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </summary>
                    <div class="space-y-4 pb-4 pt-2">
                        <label class="block text-sm font-medium text-slate-700">
                            ${escapeHtml(this.tr("labels.deliveryDate"))}
                            <input id="laundry-log-delivery-date-input" type="date" value="${escapeHtml(this.draft.deliveryDate)}" class="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                        </label>
                        <label class="block text-sm font-medium text-slate-700">
                            ${escapeHtml(this.tr("labels.notes"))}
                            <textarea id="laundry-log-notes-input" rows="3" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                        </label>
                    </div>
                </details>
                <div class="laundry-mobile-action-bar border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:mt-6 sm:rounded-2xl sm:border">
                    <div class="mx-auto flex max-w-2xl items-center gap-3">
                        <button type="button" data-laundry-action="cancel-cleaner-send" class="min-h-12 rounded-xl px-3 text-sm font-semibold text-slate-500 transition hover:text-slate-900">${escapeHtml(this.tr("cleaner.cancel"))}</button>
                        <button type="button" data-laundry-action="save" ${summary.deliveredUnits === 0 ? "disabled" : ""} class="min-h-12 flex-1 rounded-xl bg-rose-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">
                            ${escapeHtml(this.tr("cleaner.saveHandoff", { count: summary.deliveredUnits }))}
                        </button>
                    </div>
                </div>
            </section>
        `;
    }

    getPendingDays(deliveryDate) {
        const delivered = new Date(`${deliveryDate || ""}T00:00:00`);
        const today = new Date(`${getTodayIsoDate()}T00:00:00`);
        if (Number.isNaN(delivered.getTime())) {
            return 0;
        }
        return Math.max(0, Math.floor((today.getTime() - delivered.getTime()) / 86400000));
    }

    renderCleanerPendingReturn(record) {
        const pendingDays = this.getPendingDays(record.deliveryDate);
        return `
            <article class="border-b border-slate-200 py-5 last:border-b-0">
                <div class="flex items-start justify-between gap-4">
                    <div class="min-w-0">
                        <h3 class="truncate text-lg font-semibold text-slate-950">${escapeHtml(record.propertyName || this.tr("labels.unnamedProperty"))}</h3>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.sentOn", { date: this.formatDate(record.deliveryDate) }))}</p>
                    </div>
                    <span class="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">${escapeHtml(pendingDays === 0
                        ? this.tr("cleaner.sentToday")
                        : this.tr("cleaner.pendingDays", { count: pendingDays }))}</span>
                </div>
                <div class="mt-3 text-sm font-medium text-slate-700">${escapeHtml(this.tr("cleaner.unitsSent", { count: record.deliveredUnits }))}</div>
                <div class="mt-4">
                    <button type="button" data-laundry-action="review-return" data-record-id="${escapeHtml(record.id)}" class="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-rose-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-rose-700">
                        <span>${escapeHtml(this.tr("cleaner.checkReceivedLinen"))}</span>
                        <svg class="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
            </article>
        `;
    }

    renderCleanerReturnEditor() {
        const target = this.records.find((record) => record.id === this.returnEditingRecordId);
        if (!target) {
            return "";
        }
        const summary = summarizeLaundryLogRecord(this.draft);
        return `
            <section id="laundry-cleaner-return-editor" class="laundry-mobile-action-host scroll-mt-6">
                <input id="laundry-log-property-input" type="hidden" value="${escapeHtml(this.draft.propertyName)}">
                <input id="laundry-log-delivery-date-input" type="hidden" value="${escapeHtml(this.draft.deliveryDate)}">
                <input id="laundry-log-received-date-input" type="hidden" value="${escapeHtml(this.draft.receivedDate || getTodayIsoDate())}">
                <textarea id="laundry-log-notes-input" class="hidden">${escapeHtml(this.draft.notes)}</textarea>
                <button type="button" data-laundry-action="close-return-review" class="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-950">
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
                    <span>${escapeHtml(this.tr("cleaner.backToReturns"))}</span>
                </button>
                <div class="mt-4 border-b border-slate-200 pb-5">
                    <div class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">${escapeHtml(this.tr("cleaner.checkReturnKicker"))}</div>
                    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.draft.propertyName)}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.checkReturnHint"))}</p>
                </div>
                <div class="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-slate-100 px-4 py-3">
                    <span class="text-sm font-medium text-slate-600">${escapeHtml(this.tr("cleaner.currentDifference"))}</span>
                    <span class="text-xl font-semibold ${summary.differenceUnits ? "text-rose-700" : "text-emerald-700"}">${escapeHtml(String(summary.differenceUnits))}</span>
                </div>
                <div class="mt-5 border-y border-slate-200">
                    ${LAUNDRY_LOG_GROUPS.map((section) => {
                        const sectionSummary = summary.sectionSummaries.find((entry) => entry.key === section.key);
                        return this.renderCleanerSection(section, sectionSummary, "return");
                    }).join("")}
                    ${this.renderCleanerExtraReturnPicker()}
                </div>
                <div class="mt-5">${this.renderReturnMismatchWarning(summary)}</div>
                <div class="laundry-mobile-action-bar border-t border-slate-200 bg-white/95 px-3 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:mt-6 sm:rounded-2xl sm:border">
                    <div class="mx-auto max-w-2xl">
                        <button type="button" data-laundry-action="save" class="min-h-12 w-full rounded-xl bg-rose-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-rose-700">${escapeHtml(this.tr("cleaner.saveReceivedLinen"))}</button>
                    </div>
                </div>
            </section>
        `;
    }

    renderCleanerReturnsWorkspace(pendingRecords) {
        if (this.returnEditingRecordId) {
            return this.renderCleanerReturnEditor();
        }
        return `
            <section aria-labelledby="laundry-cleaner-returns-title">
                <div class="border-b border-slate-200 pb-5">
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">${escapeHtml(this.tr("cleaner.receiveKicker"))}</div>
                    <h2 id="laundry-cleaner-returns-title" class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.tr("cleaner.receiveTitle"))}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.receiveHint"))}</p>
                </div>
                ${pendingRecords.length
                    ? `<div>${pendingRecords.map((record) => this.renderCleanerPendingReturn(record)).join("")}</div>`
                    : `<div class="py-12 text-center">
                        <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                        </span>
                        <h3 class="mt-4 text-lg font-semibold text-slate-950">${escapeHtml(this.tr("cleaner.noPendingTitle"))}</h3>
                        <p class="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">${escapeHtml(this.tr("cleaner.noPendingBody"))}</p>
                    </div>`}
            </section>
        `;
    }

    renderCleanerApp() {
        if (!["entry", "returns"].includes(this.activeWorkspace)) {
            this.activeWorkspace = "entry";
        }
        const pendingRecords = this.getCleanerPendingRecords();
        return `
            <div class="mx-auto max-w-2xl space-y-5">
                ${this.renderCleanerStatus()}
                ${this.renderCleanerModeSwitch(pendingRecords.length)}
                ${this.activeWorkspace === "returns"
                    ? this.renderCleanerReturnsWorkspace(pendingRecords)
                    : this.renderCleanerSendWorkspace()}
            </div>
        `;
    }

    renderMetricCard(label, value, accentClass) {
        return `
            <article class="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(label)}</div>
                <div class="mt-3 text-3xl font-semibold ${accentClass}">${escapeHtml(String(value))}</div>
            </article>
        `;
    }

    renderCompactMetricCard(label, value, accentClass) {
        return `
            <article class="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <div class="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">${escapeHtml(label)}</div>
                <div class="mt-2 text-2xl font-semibold ${accentClass}">${escapeHtml(String(value))}</div>
            </article>
        `;
    }

    renderMetricsSection(totals) {
        return `
            <details class="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm md:hidden">
                <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("stats.summaryToggle"))}</div>
                        <div class="mt-1 text-sm text-slate-600">${escapeHtml(this.tr("stats.summaryHint", { count: totals.count, pending: totals.pending }))}</div>
                    </div>
                    <span class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-700">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                    </span>
                </summary>
                <div class="mt-4 grid grid-cols-2 gap-3">
                    ${this.renderCompactMetricCard(this.tr("stats.totalRecords"), totals.count, "text-slate-900")}
                    ${this.renderCompactMetricCard(this.tr("stats.pending"), totals.pending, "text-amber-700")}
                    ${this.renderCompactMetricCard(this.tr("stats.matched"), totals.matched, "text-emerald-700")}
                    ${this.renderCompactMetricCard(this.tr("stats.unitsDelivered"), totals.deliveredUnits, "text-rose-700")}
                    ${this.renderCompactMetricCard(this.tr("stats.unitsReceived"), totals.receivedUnits, "text-sky-700")}
                </div>
            </details>
            <section class="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
                ${this.renderMetricCard(this.tr("stats.totalRecords"), totals.count, "text-slate-900")}
                ${this.renderMetricCard(this.tr("stats.pending"), totals.pending, "text-amber-700")}
                ${this.renderMetricCard(this.tr("stats.matched"), totals.matched, "text-emerald-700")}
                ${this.renderMetricCard(this.tr("stats.unitsDelivered"), totals.deliveredUnits, "text-rose-700")}
                ${this.renderMetricCard(this.tr("stats.unitsReceived"), totals.receivedUnits, "text-sky-700")}
            </section>
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

    renderStatusDetails() {
        if (!this.statusDetails || this.statusTone !== "success") {
            return "";
        }

        const detail = this.statusDetails;
        const metadata = [
            detail.propertyName ? [this.tr("labels.property"), detail.propertyName] : null,
            detail.deliveryDate ? [this.tr("labels.deliveryDate"), this.formatDate(detail.deliveryDate)] : null,
            detail.receivedDate ? [this.tr("labels.receivedDate"), this.formatDate(detail.receivedDate)] : null,
            detail.notes ? [this.tr("labels.notes"), detail.notes] : null
        ].filter(Boolean);

        const itemRows = Array.isArray(detail.items) ? detail.items : [];
        return `
            <div class="mt-4 rounded-2xl border border-emerald-200 bg-white/80 p-4 text-slate-800">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">${escapeHtml(this.tr("messages.savedDetailsTitle"))}</div>
                ${metadata.length ? `
                    <dl class="mt-3 grid gap-2 sm:grid-cols-2">
                        ${metadata.map(([label, value]) => `
                            <div>
                                <dt class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">${escapeHtml(label)}</dt>
                                <dd class="mt-1 text-sm font-semibold text-slate-900">${escapeHtml(value)}</dd>
                            </div>
                        `).join("")}
                    </dl>
                ` : ""}
                ${itemRows.length ? `
                    <div class="mt-4">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("messages.savedItemsTitle"))}</div>
                        <div class="mt-2 grid gap-2 md:grid-cols-2">
                            ${itemRows.map((item) => `
                                <div class="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div class="text-sm font-semibold text-slate-900">${escapeHtml(item.name)}</div>
                                    <div class="mt-1 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                                        ${item.delivered > 0 ? `<span class="rounded-full bg-white px-2 py-1">${escapeHtml(this.tr("summary.delivered", { count: item.delivered }))}</span>` : ""}
                                        ${item.received > 0 ? `<span class="rounded-full bg-white px-2 py-1">${escapeHtml(this.tr("summary.received", { count: item.received }))}</span>` : ""}
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                ` : ""}
            </div>
        `;
    }

    renderReturnMismatchWarning(summary = {}) {
        if (!summary.receivedStarted || !summary.mismatches?.length) {
            return "";
        }

        return `
            <section data-laundry-return-mismatch-warning="true" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <div class="font-semibold">${escapeHtml(this.tr("warnings.returnMismatchTitle"))}</div>
                <p class="mt-1 text-rose-800">${escapeHtml(this.tr("warnings.returnMismatchBody"))}</p>
                <div class="mt-3 grid gap-2 sm:grid-cols-2">
                    ${summary.mismatches.map((item) => `
                        <div class="rounded-xl border border-rose-200 bg-white/70 px-3 py-2">
                            <div class="font-semibold text-slate-900">${escapeHtml(this.getLaundryItemLabel(item))}</div>
                            <div class="mt-1 text-xs text-rose-800">${escapeHtml(this.tr("warnings.returnMismatchItem", {
                                delivered: item.delivered,
                                received: item.received,
                                missing: item.missing,
                                extra: item.extra
                            }))}</div>
                        </div>
                    `).join("")}
                </div>
            </section>
        `;
    }

    getLaundryItemLabel(item) {
        if (item?.name) {
            return item.name;
        }
        if (item?.labelKey) {
            return this.tr(item.labelKey);
        }
        return this.tr("labels.customItemFallback");
    }

    renderCustomItemRow(item, index, mode = "full") {
        const showDelivered = mode !== "return";
        const showReceived = mode !== "new";
        const columnsClass = showDelivered && showReceived
            ? "sm:grid-cols-[minmax(150px,1fr)_120px_120px_auto]"
            : "sm:grid-cols-[minmax(150px,1fr)_120px_auto]";
        return `
            <div class="grid gap-3 rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 p-3 ${columnsClass}">
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.customItemName"))}
                    <input type="text" data-laundry-custom-index="${escapeHtml(String(index))}" data-laundry-custom-field="name" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(this.tr("form.customItemPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    ${mode === "return" ? `<span class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold normal-case tracking-normal text-slate-700">${escapeHtml(this.tr("summary.delivered", { count: item.delivered }))}</span>` : ""}
                </label>
                ${showDelivered ? `
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.deliveredShort"))}
                    <input type="number" min="0" inputmode="numeric" data-laundry-custom-index="${escapeHtml(String(index))}" data-laundry-custom-field="delivered" value="${escapeHtml(toInputNumber(item.delivered))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    <button type="button" data-laundry-action="clear-custom-count" data-custom-index="${escapeHtml(String(index))}" data-field="delivered" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                </label>
                ` : ""}
                ${showReceived ? `
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.receivedShort"))}
                    <input type="number" min="0" inputmode="numeric" data-laundry-custom-index="${escapeHtml(String(index))}" data-laundry-custom-field="received" value="${escapeHtml(toInputNumber(item.received))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    <button type="button" data-laundry-action="clear-custom-count" data-custom-index="${escapeHtml(String(index))}" data-field="received" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                </label>
                ` : ""}
                <div class="flex items-end">
                    <button type="button" data-laundry-action="remove-custom-item" data-custom-index="${escapeHtml(String(index))}" class="w-full rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 sm:w-auto">${escapeHtml(this.tr("actions.removeCustomItem"))}</button>
                </div>
            </div>
        `;
    }

    renderSection(section, summary, items, customItems = [], mode = "full") {
        const showDelivered = mode !== "return";
        const showReceived = mode !== "new";
        const rowColumnsClass = showDelivered && showReceived
            ? "sm:grid-cols-[minmax(0,1fr)_120px_120px]"
            : "sm:grid-cols-[minmax(0,1fr)_120px]";
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
                            <div class="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 ${rowColumnsClass}">
                                <div class="text-sm font-medium text-slate-900">
                                    ${escapeHtml(this.tr(item.labelKey))}
                                    ${mode === "return" ? `<div class="mt-2"><span class="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">${escapeHtml(this.tr("summary.delivered", { count: counts.delivered }))}</span></div>` : ""}
                                </div>
                                ${showDelivered ? `
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.deliveredShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-laundry-item-key="${escapeHtml(item.key)}" data-laundry-item-field="delivered" value="${escapeHtml(toInputNumber(counts.delivered))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                    <button type="button" data-laundry-action="clear-count" data-item-key="${escapeHtml(item.key)}" data-field="delivered" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                                </label>
                                ` : ""}
                                ${showReceived ? `
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.receivedShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-laundry-item-key="${escapeHtml(item.key)}" data-laundry-item-field="received" value="${escapeHtml(toInputNumber(counts.received))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                    <button type="button" data-laundry-action="clear-count" data-item-key="${escapeHtml(item.key)}" data-field="received" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold normal-case tracking-normal text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearCount"))}</button>
                                </label>
                                ` : ""}
                            </div>
                        `;
                    }).join("")}
                    ${section.key === "other" ? `
                        <div class="rounded-2xl border border-rose-100 bg-white p-3">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <div class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("labels.customItems"))}</div>
                                    <p class="mt-1 text-xs text-slate-500">${escapeHtml(this.tr("form.customItemsHelper"))}</p>
                                </div>
                                <button type="button" data-laundry-action="add-custom-item" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">${escapeHtml(this.tr("actions.addCustomItem"))}</button>
                            </div>
                            <div class="mt-3 space-y-3">
                                ${customItems.length
                                    ? customItems.map((item, index) => this.renderCustomItemRow(item, index, mode)).join("")
                                    : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">${escapeHtml(this.tr("empty.customItems"))}</p>`}
                            </div>
                        </div>
                    ` : ""}
                </div>
            </details>
        `;
    }

    renderWorkspaceTabs() {
        const mismatchCount = filterLaundryLogRecords(this.records, {
            status: "mismatch",
            month: this.selectedMonth
        }).length;
        const tabs = [
            { key: "entry", label: this.tr("views.entryWorkspace") },
            { key: "returns", label: this.tr("views.returnsWorkspace") },
            { key: "mismatches", label: this.tr("views.mismatchesWorkspace"), count: mismatchCount, alert: mismatchCount > 0 },
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
                                ${tab.count ? `
                                    <span class="ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${active ? "bg-white text-rose-700" : "bg-rose-600 text-white"}">
                                        ${escapeHtml(String(tab.count))}
                                    </span>
                                ` : ""}
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
                <div class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-col">
                    ${LAUNDRY_LOG_GROUPS.map((section) => `
                        <button
                            type="button"
                            data-laundry-action="jump-section"
                            data-section-key="${escapeHtml(section.key)}"
                            class="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
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
            .map((item) => this.getLaundryItemLabel(item))
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
                <div class="mt-4">${this.renderReturnMismatchWarning(record.summary)}</div>
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-laundry-action="review-return" data-record-id="${escapeHtml(record.id)}" class="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700">
                        ${escapeHtml(this.tr("actions.review"))}
                    </button>
                </div>
            </article>
        `;
    }

    renderRecordCard(record) {
        const mismatchLines = record.summary.mismatches
            .slice(0, 4)
            .map((item) => `${this.getLaundryItemLabel(item)} (${item.delivered}/${item.received})`)
            .join(", ");
        const sentBy = this.getActorLabel(record.sentBy || record.createdBy);
        const receivedBy = this.getActorLabel(record.receivedBy);

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
                <div class="mt-4">${this.renderReturnMismatchWarning(record.summary)}</div>
                ${record.notes ? `<p class="mt-3 text-sm text-slate-600">${escapeHtml(record.notes)}</p>` : ""}
                ${sentBy || receivedBy ? `
                    <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        ${sentBy ? `<span><strong class="font-semibold text-slate-700">${escapeHtml(this.tr("labels.sentBy"))}:</strong> ${escapeHtml(sentBy)}</span>` : ""}
                        ${receivedBy ? `<span><strong class="font-semibold text-slate-700">${escapeHtml(this.tr("labels.receivedBy"))}:</strong> ${escapeHtml(receivedBy)}</span>` : ""}
                    </div>
                ` : ""}
                <div class="mt-4 flex flex-wrap gap-2">
                    <button type="button" data-laundry-action="edit" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                        ${escapeHtml(this.tr("actions.edit"))}
                    </button>
                    ${this.isManagerView() ? `
                        <button type="button" data-laundry-action="delete" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">
                            ${escapeHtml(this.tr("actions.delete"))}
                        </button>
                    ` : ""}
                </div>
            </article>
        `;
    }

    renderLegacyEntryWorkspace({ draftSummary, propertyOptions, pendingRecords, titleKey }) {
        return `
            <section class="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)]">
                ${this.renderSectionNavigator()}
                <div class="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.36fr)] 2xl:items-start">
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
                                <button type="button" data-laundry-action="clear-date" data-field="deliveryDate" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearDate"))}</button>
                            </label>
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.receivedDate"))}
                                <input id="laundry-log-received-date-input" type="date" value="${escapeHtml(this.draft.receivedDate)}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                <button type="button" data-laundry-action="clear-date" data-field="receivedDate" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearDate"))}</button>
                            </label>
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div class="font-semibold text-slate-900">${escapeHtml(this.tr("summary.recordStatus"))}</div>
                                <div class="mt-2">${escapeHtml(this.tr("summary.delivered", { count: draftSummary.deliveredUnits }))} · ${escapeHtml(this.tr("summary.received", { count: draftSummary.receivedUnits }))} · ${escapeHtml(this.tr("summary.variance", { count: draftSummary.differenceUnits }))}</div>
                            </div>
                        </div>
                        <div class="mt-5">${this.renderReturnMismatchWarning(draftSummary)}</div>
                        <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                            <button type="button" data-laundry-action="copy-delivered" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.copyDelivered"))}</button>
                            <button type="button" data-laundry-action="received-today" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.setReceivedToday"))}</button>
                            <button type="button" data-laundry-action="workspace" data-workspace="returns" class="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 sm:w-auto">${escapeHtml(this.tr("actions.openReturns"))}</button>
                        </div>
                        <div class="mt-6 grid gap-4 2xl:grid-cols-2">
                            ${LAUNDRY_LOG_GROUPS.map((section) => {
                                const summary = draftSummary.sectionSummaries.find((entry) => entry.key === section.key) || { delivered: 0, received: 0 };
                                return this.renderSection(section, summary, this.draft.items, this.draft.customItems);
                            }).join("")}
                        </div>
                        <label class="mt-6 block text-sm font-medium text-slate-700">
                            ${escapeHtml(this.tr("labels.notes"))}
                            <textarea id="laundry-log-notes-input" rows="4" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                        </label>
                        <datalist id="laundry-log-property-list">${propertyOptions.map((propertyName) => `<option value="${escapeHtml(propertyName)}"></option>`).join("")}</datalist>
                        <div class="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <button type="button" data-laundry-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.editingRecordId ? this.tr("actions.update") : this.tr("actions.save"))}</button>
                            <button type="button" data-laundry-action="reset" class="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.reset"))}</button>
                        </div>
                    </article>
                    <section class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6 2xl:sticky 2xl:top-24">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.pendingTitle"))}</div>
                                <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.pendingRecords", pendingRecords.length))}</h2>
                            </div>
                            <button type="button" data-laundry-action="workspace" data-workspace="returns" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.viewAllReturns"))}</button>
                        </div>
                        <div class="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-1">
                            ${pendingRecords.length ? pendingRecords.map((record) => this.renderPendingCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("empty.pending"))}</p>`}
                        </div>
                    </section>
                </div>
            </section>
        `;
    }

    renderEntryWorkspace({ draftSummary, propertyOptions, pendingRecords, titleKey }) {
        const isEditing = Boolean(this.editingRecordId);
        const formMode = isEditing ? "full" : "new";
        const formOpen = this.entryFormExpanded || isEditing;

        return `
            <section class="grid gap-6">
                <details id="laundry-log-form-card" class="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" ${formOpen ? "open" : ""}>
                        <summary class="flex cursor-pointer list-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div class="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">${escapeHtml(this.tr("header.kicker"))}</div>
                                <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.tr(titleKey))}</h2>
                                <p class="mt-2 text-sm text-slate-600">${escapeHtml(formOpen ? this.tr("form.helper") : this.tr("form.openHelper"))}</p>
                            </div>
                            <span class="inline-flex items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm">
                                ${escapeHtml(formOpen ? this.tr("actions.hideForm") : this.tr("actions.openForm"))}
                            </span>
                        </summary>
                        <div class="mt-5 grid gap-4 md:grid-cols-2">
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.property"))}
                                <input id="laundry-log-property-input" type="text" list="laundry-log-property-list" value="${escapeHtml(this.draft.propertyName)}" placeholder="${escapeHtml(this.tr("form.propertyPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                            </label>
                            <label class="block text-sm font-medium text-slate-700">
                                ${escapeHtml(this.tr("labels.deliveryDate"))}
                                <input id="laundry-log-delivery-date-input" type="date" value="${escapeHtml(this.draft.deliveryDate)}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                <button type="button" data-laundry-action="clear-date" data-field="deliveryDate" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearDate"))}</button>
                            </label>
                            ${isEditing ? `
                                <label class="block text-sm font-medium text-slate-700">
                                    ${escapeHtml(this.tr("labels.receivedDate"))}
                                    <input id="laundry-log-received-date-input" type="date" value="${escapeHtml(this.draft.receivedDate)}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                    <button type="button" data-laundry-action="clear-date" data-field="receivedDate" class="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50">${escapeHtml(this.tr("actions.clearDate"))}</button>
                                </label>
                            ` : ""}
                            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                                <div class="font-semibold text-slate-900">${escapeHtml(this.tr("summary.recordStatus"))}</div>
                                <div class="mt-2">${escapeHtml(this.tr("summary.delivered", { count: draftSummary.deliveredUnits }))} · ${escapeHtml(this.tr("summary.received", { count: draftSummary.receivedUnits }))} · ${escapeHtml(this.tr("summary.variance", { count: draftSummary.differenceUnits }))}</div>
                            </div>
                        </div>
                        <div class="mt-5">${this.renderReturnMismatchWarning(draftSummary)}</div>
                        ${isEditing ? `
                            <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                <button type="button" data-laundry-action="copy-delivered" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.copyDelivered"))}</button>
                                <button type="button" data-laundry-action="received-today" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.setReceivedToday"))}</button>
                                <button type="button" data-laundry-action="workspace" data-workspace="returns" class="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 sm:w-auto">${escapeHtml(this.tr("actions.openReturns"))}</button>
                            </div>
                        ` : ""}
                        <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                            <button type="button" data-laundry-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.editingRecordId ? this.tr("actions.update") : this.tr("actions.save"))}</button>
                            <button type="button" data-laundry-action="reset" class="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.reset"))}</button>
                        </div>
                        <div class="mt-6 grid gap-4 2xl:grid-cols-2">
                            ${LAUNDRY_LOG_GROUPS.map((section) => {
                                const summary = draftSummary.sectionSummaries.find((entry) => entry.key === section.key) || { delivered: 0, received: 0 };
                                return this.renderSection(section, summary, this.draft.items, this.draft.customItems, formMode);
                            }).join("")}
                        </div>
                        <label class="mt-6 block text-sm font-medium text-slate-700">
                            ${escapeHtml(this.tr("labels.notes"))}
                            <textarea id="laundry-log-notes-input" rows="4" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                        </label>
                        <datalist id="laundry-log-property-list">${propertyOptions.map((propertyName) => `<option value="${escapeHtml(propertyName)}"></option>`).join("")}</datalist>
                        <div class="sticky bottom-3 mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:flex-wrap">
                            <button type="button" data-laundry-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.editingRecordId ? this.tr("actions.update") : this.tr("actions.save"))}</button>
                            <button type="button" data-laundry-action="reset" class="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.reset"))}</button>
                        </div>
                </details>
                ${this.renderSectionNavigator()}
            </section>
        `;
    }

    renderReturnEditor() {
        if (!this.returnEditingRecordId || !this.editingRecordId) {
            return "";
        }

        const summary = summarizeLaundryLogRecord(this.draft);
        return `
            <section id="laundry-log-return-editor" class="scroll-mt-28 rounded-[28px] border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">${escapeHtml(this.tr("views.returnsTitle"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.draft.propertyName || this.tr("labels.unnamedProperty"))}</h2>
                        <p class="mt-2 text-sm text-slate-600">${escapeHtml(this.tr("form.returnHelper"))}</p>
                    </div>
                    ${this.renderStatusBadge(summary.status)}
                </div>
                <input id="laundry-log-property-input" type="hidden" value="${escapeHtml(this.draft.propertyName)}">
                <input id="laundry-log-delivery-date-input" type="hidden" value="${escapeHtml(this.draft.deliveryDate)}">
                <textarea id="laundry-log-notes-input" class="hidden">${escapeHtml(this.draft.notes)}</textarea>
                <div class="mt-5 grid gap-4 md:grid-cols-2">
                    <label class="block text-sm font-medium text-slate-700">
                        ${escapeHtml(this.tr("labels.receivedDate"))}
                        <input id="laundry-log-received-date-input" type="date" value="${escapeHtml(this.draft.receivedDate || getTodayIsoDate())}" class="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                    </label>
                    <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <div class="font-semibold text-slate-900">${escapeHtml(this.tr("summary.recordStatus"))}</div>
                        <div class="mt-2">${escapeHtml(this.tr("summary.delivered", { count: summary.deliveredUnits }))} · ${escapeHtml(this.tr("summary.received", { count: summary.receivedUnits }))} · ${escapeHtml(this.tr("summary.variance", { count: summary.differenceUnits }))}</div>
                    </div>
                </div>
                <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" data-laundry-action="copy-delivered" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.copyDelivered"))}</button>
                    <button type="button" data-laundry-action="received-today" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.setReceivedToday"))}</button>
                    <button type="button" data-laundry-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.tr("actions.update"))}</button>
                </div>
                <div class="mt-5">${this.renderReturnMismatchWarning(summary)}</div>
                <div class="mt-6 grid gap-4 2xl:grid-cols-2">
                    ${LAUNDRY_LOG_GROUPS.map((section) => {
                        const sectionSummary = summary.sectionSummaries.find((entry) => entry.key === section.key) || { delivered: 0, received: 0 };
                        return this.renderSection(section, sectionSummary, this.draft.items, this.draft.customItems, "return");
                    }).join("")}
                </div>
                <div class="sticky bottom-3 mt-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:flex-wrap">
                    <button type="button" data-laundry-action="save" class="w-full rounded-full bg-rose-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 sm:w-auto">${escapeHtml(this.tr("actions.update"))}</button>
                    <button type="button" data-laundry-action="reset" class="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.reset"))}</button>
                </div>
            </section>
        `;
    }

    renderReturnsWorkspace({ returnRecords, monthOptions, pendingRecords }) {
        return `
            <section class="grid gap-6">
                ${this.renderReturnEditor()}
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

    renderMismatchesWorkspace({ mismatchRecords, monthOptions }) {
        return `
            <section class="rounded-[28px] border border-rose-200 bg-white p-5 shadow-sm sm:p-6">
                <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-rose-600">${escapeHtml(this.tr("views.mismatchesTitle"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.mismatchRecords", mismatchRecords.length))}</h2>
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
                    ${mismatchRecords.length ? mismatchRecords.map((record) => this.renderRecordCard(record)).join("") : `<p class="rounded-2xl border border-dashed border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-700">${escapeHtml(this.tr("empty.mismatches"))}</p>`}
                </div>
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

        const cleanerView = this.isCleanerView();
        const page = document.getElementById("laundry-log-page");
        if (page) {
            page.dataset.cleanerView = String(cleanerView);
        }
        const shell = document.getElementById("laundry-log-shell");
        if (shell) {
            shell.className = cleanerView
                ? "mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6"
                : "mx-auto w-full max-w-[1920px] px-4 py-6 xl:px-8 2xl:px-10";
        }
        const pageHeader = document.getElementById("laundry-log-header");
        if (pageHeader) {
            pageHeader.className = cleanerView
                ? "mb-4 flex flex-wrap items-center justify-between gap-3"
                : "mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between";
        }
        document.getElementById("laundry-log-header-kicker")?.classList.toggle("hidden", cleanerView);
        document.getElementById("laundry-log-header-subtitle")?.classList.toggle("hidden", cleanerView);

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                    <h2 class="text-xl font-semibold text-slate-900">${escapeHtml(this.tr("states.restrictedTitle"))}</h2>
                    <p class="mt-3 text-sm text-slate-600">${escapeHtml(this.tr("states.restrictedBody"))}</p>
                </section>
            `;
            return;
        }

        if (cleanerView) {
            this.ensureCleanerDraftRestored();
            root.innerHTML = this.renderCleanerApp();
            return;
        }

        const totals = summarizeLaundryLogRecords(this.records).totals;
        const pendingRecords = this.getPendingRecords();
        const returnRecords = this.getReturnRecords();
        const mismatchRecords = this.getMismatchRecords();
        const completedRecords = this.getCompletedRecords();
        const propertyOptions = this.getKnownPropertyNames();
        const monthOptions = this.getMonthOptions();
        const draftSummary = summarizeLaundryLogRecord(this.draft);
        const titleKey = this.editingRecordId ? "views.editTitle" : "views.formTitle";

        root.innerHTML = `
            ${this.statusMessage ? `
                <section id="laundry-log-status-message" class="rounded-2xl border px-4 py-4 text-sm font-medium shadow-sm ${toneClass(this.statusTone)}" role="status" aria-live="polite" tabindex="-1">
                    <div class="flex items-start gap-3">
                        <span class="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80">
                            ${statusIcon(this.statusTone)}
                        </span>
                        <div>
                            <div class="text-base font-semibold">${escapeHtml(this.statusTone === "success" ? this.tr("messages.savedTitle") : this.statusTone === "danger" ? this.tr("messages.errorTitle") : this.tr("messages.noticeTitle"))}</div>
                            <div class="mt-1">${escapeHtml(this.statusMessage)}</div>
                            ${this.renderStatusDetails()}
                        </div>
                    </div>
                </section>
            ` : ""}
            ${this.renderMetricsSection(totals)}
            ${this.renderWorkspaceTabs()}
            ${this.activeWorkspace === "entry"
                ? this.renderEntryWorkspace({ draftSummary, propertyOptions, pendingRecords, titleKey })
                : this.activeWorkspace === "returns"
                ? this.renderReturnsWorkspace({ returnRecords, monthOptions, pendingRecords })
                : this.activeWorkspace === "mismatches"
                ? this.renderMismatchesWorkspace({ mismatchRecords, monthOptions })
                : this.renderCompletedWorkspace({ completedRecords, monthOptions })}
        `;
    }
}
