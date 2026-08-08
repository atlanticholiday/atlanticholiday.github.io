import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    where,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    deleteObject,
    getDownloadURL,
    ref as storageRef,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import { i18n, t } from "../../core/i18n.js";
import {
    createEmptyBedroomLayout,
    createEmptyCustomLinenInventoryItems,
    createEmptyLinenInventoryItems,
    createEmptyLinenInventoryPhotos,
    createEmptyLinenInventorySections,
    createEmptyLinenInventoryTargets,
    createLinenInventoryRecord,
    filterLinenInventoryRecords,
    getLinenInventoryWorkflowStatus,
    isLinenInventoryRecordEditableByColleague,
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

function toCountInput(item = {}) {
    return item.checked ? String(Number(item.count || 0)) : "";
}

function getSectionKeysWithCounts(items = {}, customItems = [], sections = {}) {
    const selected = new Set();
    LINEN_INVENTORY_GROUPS.forEach((section) => {
        if (
            section.items.some((item) => items[item.key]?.checked || Number(items[item.key]?.count || 0) > 0)
            || sections[section.key]?.notApplicable
            || sections[section.key]?.bedSize
        ) {
            selected.add(section.key);
        }
    });
    if (customItems.length) {
        selected.add("other");
    }
    return [...selected];
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
    constructor(db, {
        storage = null,
        getDataManager = null,
        getProperties = null,
        getPropertyDirectory = null
    } = {}) {
        this.db = db || null;
        this.storage = storage || null;
        this.getDataManager = typeof getDataManager === "function" ? getDataManager : () => null;
        this.readProperties = typeof getProperties === "function" ? getProperties : () => [];
        this.fetchPropertyDirectory = typeof getPropertyDirectory === "function"
            ? getPropertyDirectory
            : null;
        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.records = [];
        this.propertyDirectory = [];
        this.propertyDirectoryLoading = false;
        this.propertyDirectoryLoaded = false;
        this.unsubscribe = null;
        this.editingRecordId = null;
        this.editingRecordBase = null;
        this.reviewingRecordId = null;
        this.searchQuery = "";
        this.selectedWorkflowStatus = "all";
        this.selectedDateFrom = "";
        this.selectedDateTo = "";
        this.cleanerPropertyQuery = "";
        this.cleanerWorkspace = "count";
        this.cleanerExpandedSections = new Set(["doubleBed"]);
        this.cleanerDraftRestored = false;
        this.cleanerDraftStorageKey = "";
        this.submitReviewOpen = false;
        this.photoUploadInProgress = false;
        this.draft = this.createDefaultDraft();
        this.statusMessage = "";
        this.statusTone = "info";

        if (typeof window !== "undefined") {
            window.setTimeout(() => this.ensureDomScaffold(), 50);
            document.addEventListener("linenInventoryPageOpened", () => {
                this.ensureDomScaffold();
                this.startListening();
                this.ensurePropertyDirectory();
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
        const items = createEmptyLinenInventoryItems(overrides.items);
        const hasExplicitTargets = Object.prototype.hasOwnProperty.call(overrides, "targets");
        const targets = createEmptyLinenInventoryTargets(hasExplicitTargets ? overrides.targets : items);
        Object.keys(items).forEach((itemKey) => {
            items[itemKey].target = Number(targets[itemKey] || 0);
        });
        return {
            propertyId: "",
            propertyName: "",
            notes: "",
            countedDate: getTodayIsoDate(),
            ...overrides,
            bedrooms: createEmptyBedroomLayout(overrides.bedrooms),
            sections: createEmptyLinenInventorySections(overrides.sections),
            items,
            targets,
            customItems: createEmptyCustomLinenInventoryItems(overrides.customItems),
            photos: createEmptyLinenInventoryPhotos(overrides.photos),
            activeSections: Array.isArray(overrides.activeSections)
                ? [...new Set(overrides.activeSections)]
                : getSectionKeysWithCounts(
                    createEmptyLinenInventoryItems(overrides.items),
                    createEmptyCustomLinenInventoryItems(overrides.customItems),
                    createEmptyLinenInventorySections(overrides.sections)
                )
        };
    }

    createDraftFromRecord(record = {}) {
        const targetSource = Object.prototype.hasOwnProperty.call(record, "targets")
            ? { targets: record.targets }
            : {};
        return this.createDefaultDraft({
            propertyId: record.propertyId || "",
            propertyName: record.propertyName || "",
            notes: record.notes || "",
            countedDate: record.countedDate || record.lastCountedAt || getTodayIsoDate(),
            bedrooms: createEmptyBedroomLayout(record.bedrooms),
            sections: createEmptyLinenInventorySections(record.sections),
            items: createEmptyLinenInventoryItems(record.items),
            ...targetSource,
            customItems: createEmptyCustomLinenInventoryItems(record.customItems),
            photos: createEmptyLinenInventoryPhotos(record.photos),
            activeSections: Array.isArray(record.activeSections) ? record.activeSections : undefined
        });
    }

    hasAccess() {
        const dataManager = this.getDataManager();
        if (!dataManager || typeof dataManager.canAccessApp !== "function") {
            return true;
        }
        return Boolean(dataManager.canAccessApp("linenInventory"));
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
        return `horario:linen-inventory-draft:${encodeURIComponent(identity)}`;
    }

    ensureCleanerDraftRestored() {
        const storageKey = this.getCleanerDraftKey();
        if (this.cleanerDraftRestored && this.cleanerDraftStorageKey === storageKey) {
            return;
        }
        if (this.cleanerDraftStorageKey && this.cleanerDraftStorageKey !== storageKey) {
            this.draft = this.createDefaultDraft();
            this.editingRecordId = null;
            this.editingRecordBase = null;
        }
        this.cleanerDraftRestored = true;
        this.cleanerDraftStorageKey = storageKey;
        try {
            const saved = JSON.parse(window.localStorage?.getItem(storageKey) || "null");
            const savedAt = Date.parse(saved?.savedAt || "");
            const isRecent = Number.isFinite(savedAt) && Date.now() - savedAt < 7 * 24 * 60 * 60 * 1000;
            if (isRecent && saved?.draft?.propertyName) {
                this.draft = this.createDefaultDraft(saved.draft);
                this.editingRecordId = normalizeLabel(saved.editingRecordId);
                this.editingRecordBase = saved.editingRecordBase || null;
            }
        } catch {
            // Local recovery is best-effort and never blocks the live form.
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
                editingRecordId: this.editingRecordId,
                editingRecordBase: this.editingRecordBase,
                draft: this.draft
            }));
        } catch {
            // Keep counting when local storage is unavailable or full.
        }
    }

    clearCleanerDraft() {
        const storageKey = this.cleanerDraftStorageKey || this.getCleanerDraftKey();
        try {
            window.localStorage?.removeItem(storageKey);
        } catch {
            // No cleanup is required when local storage is unavailable.
        }
    }

    canEditRecord(record = {}) {
        if (this.isManagerView()) {
            return true;
        }
        return isLinenInventoryRecordEditableByColleague(record, this.getCurrentActor().uid);
    }

    canDeleteRecord() {
        return this.isManagerView();
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

        const actorUid = this.getCurrentActor().uid;
        const source = this.isCleanerView() && actorUid
            ? query(recordsRef, where("createdBy.uid", "==", actorUid))
            : recordsRef;

        this.unsubscribe = onSnapshot(source, (snapshot) => {
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
        this.records = [];
        this.propertyDirectory = [];
        this.propertyDirectoryLoaded = false;
        this.propertyDirectoryLoading = false;
        this.editingRecordId = null;
        this.editingRecordBase = null;
        this.reviewingRecordId = null;
        this.cleanerDraftRestored = false;
        this.cleanerDraftStorageKey = "";
        this.draft = this.createDefaultDraft();
    }

    async ensurePropertyDirectory() {
        if (
            !this.isCleanerView()
            || !this.fetchPropertyDirectory
            || this.propertyDirectoryLoaded
            || this.propertyDirectoryLoading
        ) {
            return this.propertyDirectory;
        }

        this.propertyDirectoryLoading = true;
        this.render();
        try {
            const response = await this.fetchPropertyDirectory();
            const properties = response?.data?.properties || response?.properties || [];
            this.propertyDirectory = Array.isArray(properties)
                ? properties
                    .map((property) => ({
                        id: normalizeLabel(property?.id),
                        name: normalizeLabel(property?.name)
                    }))
                    .filter((property) => property.id && property.name)
                : [];
            this.propertyDirectoryLoaded = true;
            return this.propertyDirectory;
        } catch (error) {
            console.error("[Linen Inventory] property directory failed:", error);
            this.setStatus(this.tr("messages.loadFailed"), "danger");
            return [];
        } finally {
            this.propertyDirectoryLoading = false;
            this.render();
        }
    }

    getProperties() {
        if (this.isCleanerView()) {
            return this.propertyDirectory;
        }
        const properties = this.readProperties();
        return Array.isArray(properties) ? properties : [];
    }

    getKnownPropertyOptions() {
        const options = new Map();
        this.getProperties().forEach((property) => {
            const name = normalizeLabel(
                property?.name
                || property?.displayName
                || property?.title
                || property?.reference
                || property?.code
            );
            if (name) {
                options.set(normalizeKey(name), {
                    id: normalizeLabel(property?.id),
                    name
                });
            }
        });
        return [...options.values()].sort((left, right) => left.name.localeCompare(right.name));
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
            query: this.searchQuery,
            workflowStatus: this.selectedWorkflowStatus,
            dateFrom: this.selectedDateFrom,
            dateTo: this.selectedDateTo
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
        const propertyId = normalizeLabel(document.getElementById("linen-inventory-property-id")?.value || matchedProperty?.id || this.draft.propertyId);
        const items = createEmptyLinenInventoryItems(this.draft.items);
        const sections = createEmptyLinenInventorySections(this.draft.sections);
        const activeSections = [...new Set([
            ...document.querySelectorAll("[data-linen-section-key]")
        ].map((section) => section.dataset.linenSectionKey).filter(Boolean))];

        document.querySelectorAll("[data-linen-item-key][data-linen-item-field]").forEach((input) => {
            const itemKey = input.dataset.linenItemKey;
            const field = input.dataset.linenItemField;
            if (!itemKey || !field || !items[itemKey]) {
                return;
            }
            if (field === "count") {
                items[itemKey].count = Number(input.value || 0);
                items[itemKey].checked = input.value !== "";
            } else if (field === "target") {
                items[itemKey].target = Number(input.value || 0);
            } else if (field === "issue") {
                items[itemKey].issue = input.value || "";
            } else if (field === "note") {
                items[itemKey].note = input.value || "";
            }
        });
        if (this.isManagerView()) {
            const activeSectionSet = new Set(activeSections);
            LINEN_INVENTORY_GROUPS
                .filter((section) => !activeSectionSet.has(section.key))
                .forEach((section) => {
                    section.items.forEach((item) => {
                        items[item.key] = createEmptyLinenInventoryItems()[item.key];
                    });
                });
        }

        document.querySelectorAll("[data-linen-section-key][data-linen-section-field]").forEach((input) => {
            const sectionKey = input.dataset.linenSectionKey;
            const field = input.dataset.linenSectionField;
            if (!sectionKey || !field || !sections[sectionKey]) {
                return;
            }
            if (field === "bedroomCount") {
                sections[sectionKey].bedroomCount = Number(input.value || 1);
            } else if (field === "bedSize") {
                sections[sectionKey].bedSize = input.value || "";
            }
        });

        const customItemsByIndex = new Map();
        document.querySelectorAll("[data-linen-custom-index][data-linen-custom-field]").forEach((input) => {
            const index = Number(input.dataset.linenCustomIndex);
            const field = input.dataset.linenCustomField;
            if (!Number.isInteger(index) || index < 0 || !field) {
                return;
            }
            const customItem = customItemsByIndex.get(index) || {
                name: "",
                count: 0,
                checked: false,
                target: 0,
                issue: "",
                note: ""
            };
            if (field === "name") {
                customItem.name = input.value || "";
            } else if (field === "count") {
                customItem.count = Number(input.value || 0);
                customItem.checked = input.value !== "";
            } else if (field === "target") {
                customItem.target = Number(input.value || 0);
            } else if (field === "issue") {
                customItem.issue = input.value || "";
            } else if (field === "note") {
                customItem.note = input.value || "";
            }
            customItemsByIndex.set(index, customItem);
        });

        const bedroomsByIndex = new Map();
        document.querySelectorAll("[data-linen-bedroom-index][data-linen-bedroom-field]").forEach((input) => {
            const index = Number(input.dataset.linenBedroomIndex);
            const field = input.dataset.linenBedroomField;
            if (!Number.isInteger(index) || index < 0 || !field) {
                return;
            }
            const bedroom = bedroomsByIndex.get(index) || { name: "", beds: [] };
            if (field === "name") {
                bedroom.name = input.value || "";
            }
            bedroomsByIndex.set(index, bedroom);
        });
        document.querySelectorAll("[data-linen-bedroom-index][data-linen-bed-index][data-linen-bed-field]").forEach((input) => {
            const bedroomIndex = Number(input.dataset.linenBedroomIndex);
            const bedIndex = Number(input.dataset.linenBedIndex);
            const field = input.dataset.linenBedField;
            if (!Number.isInteger(bedroomIndex) || bedroomIndex < 0 || !Number.isInteger(bedIndex) || bedIndex < 0 || !field) {
                return;
            }
            const bedroom = bedroomsByIndex.get(bedroomIndex) || { name: "", beds: [] };
            const bed = bedroom.beds[bedIndex] || { type: "", size: "" };
            if (field === "type" || field === "size") {
                bed[field] = input.value || "";
            }
            bedroom.beds[bedIndex] = bed;
            bedroomsByIndex.set(bedroomIndex, bedroom);
        });

        return this.createDefaultDraft({
            propertyId,
            propertyName: matchedProperty?.name || propertyName,
            notes: document.getElementById("linen-inventory-notes-input")?.value || "",
            countedDate: document.getElementById("linen-inventory-counted-input")?.value || "",
            items,
            sections,
            activeSections,
            bedrooms: [...bedroomsByIndex.keys()]
                .sort((left, right) => left - right)
                .map((index) => bedroomsByIndex.get(index)),
            customItems: [...customItemsByIndex.keys()]
                .sort((left, right) => left - right)
                .map((index) => customItemsByIndex.get(index)),
            photos: this.draft.photos
        });
    }

    syncDraftFromDomIfPresent() {
        if (document.getElementById("linen-inventory-property-input")) {
            this.draft = this.readDraftFromDom();
        }
    }

    buildAuditedPayload(draft, original = null, {
        workflowStatus = "draft",
        now = () => new Date().toISOString()
    } = {}) {
        const timestamp = now();
        const actor = this.getCurrentActor();
        const originalWorkflowStatus = original ? getLinenInventoryWorkflowStatus(original) : "";
        const isSubmitting = workflowStatus === "submitted";
        return createLinenInventoryRecord({
            ...draft,
            workflowStatus,
            createdAt: original?.createdAt || timestamp,
            createdBy: original?.createdBy?.uid ? original.createdBy : actor,
            updatedBy: actor,
            submittedAt: isSubmitting
                ? timestamp
                : original?.submittedAt || "",
            submittedBy: isSubmitting
                ? actor
                : original?.submittedBy || {},
            reviewedAt: original?.reviewedAt || "",
            reviewedBy: original?.reviewedBy || {},
            reviewNote: originalWorkflowStatus === "needsCorrection"
                ? original?.reviewNote || ""
                : original?.reviewNote || "",
            archivedAt: original?.archivedAt || ""
        }, {
            now: () => timestamp
        });
    }

    async saveDraft({ submit = false } = {}) {
        const draft = document.getElementById("linen-inventory-property-input")
            ? this.readDraftFromDom()
            : this.draft;
        const summary = summarizeLinenInventoryRecord(draft);
        if (!draft.propertyName) {
            this.setStatus(this.tr("messages.propertyRequired"), "danger");
            this.render();
            return;
        }
        if (this.isCleanerView() && !draft.propertyId) {
            this.setStatus(this.tr("messages.propertySelectionRequired"), "danger");
            this.render();
            return;
        }
        if (submit && summary.trackedItems === 0) {
            this.setStatus(this.tr("messages.countRequired"), "danger");
            this.render();
            return;
        }
        if (this.isManagerView() && summary.trackedItems === 0) {
            this.setStatus(this.tr("messages.countRequired"), "danger");
            this.render();
            return;
        }
        if (submit && !summary.completion.complete) {
            this.setStatus(this.tr("messages.incompleteCount", { count: summary.completion.remainingItems }), "danger");
            this.submitReviewOpen = false;
            this.render();
            return;
        }

        const original = this.editingRecordId
            ? this.records.find((record) => record.id === this.editingRecordId) || this.editingRecordBase
            : null;
        if (original && !this.canEditRecord(original)) {
            this.setStatus(this.tr("messages.recordLocked"), "danger");
            this.render();
            return;
        }
        const workflowStatus = submit
            ? "submitted"
            : this.isCleanerView()
                ? original && getLinenInventoryWorkflowStatus(original) === "needsCorrection"
                    ? "needsCorrection"
                    : "draft"
                : original
                    ? getLinenInventoryWorkflowStatus(original)
                    : "submitted";
        const payload = this.buildAuditedPayload(draft, original, {
            workflowStatus
        });

        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }

            if (this.editingRecordId) {
                await updateDoc(doc(recordsRef, this.editingRecordId), payload);
            } else {
                const created = await addDoc(recordsRef, payload);
                this.editingRecordId = created.id;
            }

            if (submit || this.isManagerView()) {
                this.editingRecordId = null;
                this.editingRecordBase = null;
                this.draft = this.createDefaultDraft();
                this.submitReviewOpen = false;
                this.clearCleanerDraft();
                if (this.isCleanerView()) {
                    this.cleanerWorkspace = "history";
                }
                this.setStatus(submit ? this.tr("messages.submitted") : this.tr("messages.saved"), "success");
            } else {
                this.draft = this.createDraftFromRecord(payload);
                this.editingRecordBase = { id: this.editingRecordId, ...payload };
                this.persistCleanerDraft();
                this.setStatus(this.tr("messages.draftSaved"), "success");
            }
            this.render();
        } catch (error) {
            console.error("[Linen Inventory] failed to save record:", error);
            this.setStatus(this.tr("messages.saveFailed"), "danger");
            this.render();
        }
    }

    openSubmitReview() {
        this.draft = this.readDraftFromDom();
        const summary = summarizeLinenInventoryRecord(this.draft);
        if (summary.trackedItems === 0) {
            this.setStatus(this.tr("messages.countRequired"), "danger");
            this.render();
            return;
        }
        if (!summary.completion.complete) {
            this.setStatus(this.tr("messages.incompleteCount", { count: summary.completion.remainingItems }), "danger");
            this.render();
            return;
        }
        this.setStatus("", "info");
        this.submitReviewOpen = true;
        this.persistCleanerDraft();
        this.render();
        window.scrollTo?.({ top: 0, behavior: "smooth" });
    }

    closeSubmitReview() {
        this.submitReviewOpen = false;
        this.render();
    }

    selectCleanerProperty(propertyId, propertyName) {
        const selected = this.getKnownPropertyOptions().find((property) => {
            return normalizeLabel(property.id) === normalizeLabel(propertyId)
                && normalizeKey(property.name) === normalizeKey(propertyName);
        });
        if (!selected) {
            return;
        }
        this.editingRecordId = null;
        this.editingRecordBase = null;
        this.draft = this.createDefaultDraft({
            propertyId: selected.id,
            propertyName: selected.name,
            activeSections: LINEN_INVENTORY_GROUPS.map((section) => section.key)
        });
        this.cleanerPropertyQuery = "";
        this.cleanerExpandedSections = new Set(["doubleBed"]);
        this.persistCleanerDraft();
        this.render();
    }

    changeCleanerProperty() {
        this.syncDraftFromDomIfPresent();
        this.draft.propertyId = "";
        this.draft.propertyName = "";
        this.editingRecordId = null;
        this.editingRecordBase = null;
        this.submitReviewOpen = false;
        this.persistCleanerDraft();
        this.render();
    }

    switchCleanerWorkspace(workspace) {
        if (workspace !== "count" && workspace !== "history") {
            return;
        }
        this.syncDraftFromDomIfPresent();
        this.persistCleanerDraft();
        this.cleanerWorkspace = workspace;
        this.submitReviewOpen = false;
        this.render();
    }

    startEditing(recordId) {
        const target = this.records.find((record) => record.id === recordId);
        if (!target || !this.canEditRecord(target)) {
            this.setStatus(this.tr("messages.recordLocked"), "danger");
            this.render();
            return;
        }
        this.editingRecordId = recordId;
        this.editingRecordBase = target;
        this.draft = this.createDraftFromRecord(this.getRecordWithEffectiveTargets(target));
        if (this.isCleanerView()) {
            this.draft.activeSections = LINEN_INVENTORY_GROUPS.map((section) => section.key);
            this.cleanerWorkspace = "count";
            this.persistCleanerDraft();
        }
        this.submitReviewOpen = false;
        this.setStatus("", "info");
        this.render();
        this.scrollFormIntoView();
    }

    async deleteRecord(recordId) {
        if (!this.canDeleteRecord()) {
            this.setStatus(this.tr("messages.deleteRestricted"), "danger");
            this.render();
            return;
        }
        if (!window.confirm(this.tr("confirm.delete"))) {
            return;
        }

        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) {
                throw new Error("Firestore is not available.");
            }
            const target = this.records.find((record) => record.id === recordId);
            await deleteDoc(doc(recordsRef, recordId));
            if (this.storage && target?.photos?.length) {
                await Promise.allSettled(target.photos
                    .filter((photo) => photo?.path)
                    .map((photo) => deleteObject(storageRef(this.storage, photo.path))));
            }
            if (this.editingRecordId === recordId) {
                this.editingRecordId = null;
                this.editingRecordBase = null;
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

    openAdminReview(recordId) {
        if (!this.isManagerView() || !this.records.some((record) => record.id === recordId)) {
            return;
        }
        this.reviewingRecordId = recordId;
        this.render();
        window.requestAnimationFrame(() => {
            document.getElementById("linen-admin-review-panel")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
    }

    closeAdminReview() {
        this.reviewingRecordId = null;
        this.render();
    }

    async setReviewStatus(recordId, workflowStatus) {
        if (!this.isManagerView() || (workflowStatus !== "approved" && workflowStatus !== "needsCorrection")) {
            return;
        }
        const target = this.records.find((record) => record.id === recordId);
        const reviewNote = normalizeLabel(document.getElementById("linen-admin-review-note")?.value || "");
        if (!target) {
            return;
        }
        if (workflowStatus === "needsCorrection" && !reviewNote) {
            this.setStatus(this.tr("messages.correctionNoteRequired"), "danger");
            this.render();
            return;
        }
        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) throw new Error("Firestore is not available.");
            const timestamp = new Date().toISOString();
            const effective = this.getRecordWithEffectiveTargets(target);
            const reviewed = createLinenInventoryRecord({
                ...effective,
                workflowStatus,
                reviewNote,
                reviewedAt: timestamp,
                reviewedBy: this.getCurrentActor(),
                updatedBy: this.getCurrentActor()
            }, {
                now: () => timestamp
            });
            await updateDoc(doc(recordsRef, recordId), reviewed);
            this.reviewingRecordId = null;
            this.setStatus(this.tr(workflowStatus === "approved" ? "messages.approved" : "messages.correctionRequested"), "success");
            this.render();
        } catch (error) {
            console.error("[Linen Inventory] failed to review record:", error);
            this.setStatus(this.tr("messages.reviewFailed"), "danger");
            this.render();
        }
    }

    async archiveRecord(recordId) {
        if (!this.isManagerView() || !window.confirm(this.tr("confirm.archive"))) {
            return;
        }
        try {
            const recordsRef = this.getCollectionRef();
            if (!recordsRef) throw new Error("Firestore is not available.");
            const timestamp = new Date().toISOString();
            await updateDoc(doc(recordsRef, recordId), {
                workflowStatus: "archived",
                archivedAt: timestamp,
                updatedAt: timestamp,
                updatedBy: this.getCurrentActor()
            });
            this.setStatus(this.tr("messages.archived"), "success");
            this.render();
        } catch (error) {
            console.error("[Linen Inventory] failed to archive record:", error);
            this.setStatus(this.tr("messages.archiveFailed"), "danger");
            this.render();
        }
    }

    resetDraft() {
        this.editingRecordId = null;
        this.editingRecordBase = null;
        this.draft = this.createDefaultDraft();
        this.submitReviewOpen = false;
        this.clearCleanerDraft();
        this.setStatus("", "info");
        this.render();
    }

    markCountedToday() {
        const draft = this.readDraftFromDom();
        draft.countedDate = getTodayIsoDate();
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    clearDate() {
        const draft = this.readDraftFromDom();
        draft.countedDate = "";
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    addCustomItem() {
        const draft = this.readDraftFromDom();
        draft.activeSections = [...new Set([...(draft.activeSections || []), "other"])];
        draft.customItems.push({ name: "", count: 0, checked: false, target: 0, issue: "", note: "" });
        this.draft = draft;
        this.persistCleanerDraft();
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
        this.persistCleanerDraft();
        this.render();
    }

    addSection(sectionKey) {
        if (!LINEN_INVENTORY_GROUPS.some((section) => section.key === sectionKey)) {
            return;
        }
        const draft = this.readDraftFromDom();
        draft.activeSections = [...new Set([...(draft.activeSections || []), sectionKey])];
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    removeSection(sectionKey) {
        const draft = this.readDraftFromDom();
        draft.activeSections = (draft.activeSections || []).filter((key) => key !== sectionKey);
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    addBedroom() {
        const draft = this.readDraftFromDom();
        draft.bedrooms.push({
            name: this.tr("labels.bedroomDefaultName", { number: draft.bedrooms.length + 1 }),
            beds: [{ type: "", size: "" }]
        });
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    removeBedroom(index) {
        const draft = this.readDraftFromDom();
        if (index < 0 || index >= draft.bedrooms.length) {
            return;
        }
        draft.bedrooms.splice(index, 1);
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    addBed(bedroomIndex) {
        const draft = this.readDraftFromDom();
        if (!draft.bedrooms?.[bedroomIndex]) {
            return;
        }
        draft.bedrooms[bedroomIndex].beds.push({ type: "", size: "" });
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    removeBed(bedroomIndex, bedIndex) {
        const draft = this.readDraftFromDom();
        if (!draft.bedrooms?.[bedroomIndex]?.beds?.[bedIndex]) {
            return;
        }
        draft.bedrooms[bedroomIndex].beds.splice(bedIndex, 1);
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
        if (field === "count") draft.customItems[index].checked = false;
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
        if (field === "count") draft.items[itemKey].checked = false;
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    adjustCleanerItemCount(itemKey, delta) {
        const draft = this.readDraftFromDom();
        if (!draft.items?.[itemKey] || !Number.isFinite(delta)) {
            return;
        }
        const current = draft.items[itemKey].checked ? Number(draft.items[itemKey].count || 0) : 0;
        draft.items[itemKey].count = Math.max(0, current + delta);
        draft.items[itemKey].checked = true;
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    adjustCleanerCustomCount(index, delta) {
        const draft = this.readDraftFromDom();
        if (!draft.customItems?.[index] || !Number.isFinite(delta)) {
            return;
        }
        const current = draft.customItems[index].checked ? Number(draft.customItems[index].count || 0) : 0;
        draft.customItems[index].count = Math.max(0, current + delta);
        draft.customItems[index].checked = true;
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    toggleSectionNotApplicable(sectionKey) {
        const draft = this.readDraftFromDom();
        if (!draft.sections?.[sectionKey]) {
            return;
        }
        draft.sections[sectionKey].notApplicable = !draft.sections[sectionKey].notApplicable;
        this.draft = draft;
        this.persistCleanerDraft();
        this.render();
    }

    async uploadPhotos(fileList) {
        const files = [...(fileList || [])].slice(0, 4);
        const actor = this.getCurrentActor();
        if (!this.storage || !actor.uid || !files.length) {
            this.setStatus(this.tr("messages.photoUnavailable"), "danger");
            this.render();
            return;
        }
        this.syncDraftFromDomIfPresent();
        this.photoUploadInProgress = true;
        this.render();
        try {
            for (const file of files) {
                if (!String(file.type || "").startsWith("image/") || Number(file.size || 0) > 5 * 1024 * 1024) {
                    throw new Error("invalid-photo");
                }
                const safeName = String(file.name || "photo.jpg")
                    .replace(/[^a-zA-Z0-9._-]+/g, "-")
                    .slice(-90);
                const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${safeName}`;
                const path = `linen-inventory/${actor.uid}/${fileName}`;
                const fileRef = storageRef(this.storage, path);
                await uploadBytes(fileRef, file, { contentType: file.type });
                const url = await getDownloadURL(fileRef);
                this.draft.photos = [
                    ...(this.draft.photos || []),
                    {
                        name: file.name || safeName,
                        path,
                        url,
                        uploadedAt: new Date().toISOString(),
                        uploadedBy: actor
                    }
                ];
            }
            this.persistCleanerDraft();
            this.setStatus(this.tr("messages.photoAdded"), "success");
        } catch (error) {
            console.error("[Linen Inventory] photo upload failed:", error);
            this.setStatus(this.tr(error?.message === "invalid-photo" ? "messages.photoInvalid" : "messages.photoFailed"), "danger");
        } finally {
            this.photoUploadInProgress = false;
            this.render();
        }
    }

    async removePhoto(index) {
        this.syncDraftFromDomIfPresent();
        const photo = this.draft.photos?.[index];
        if (!photo) return;
        try {
            if (this.storage && photo.path && this.isManagerView()) {
                await deleteObject(storageRef(this.storage, photo.path));
            }
            this.draft.photos.splice(index, 1);
            this.persistCleanerDraft();
            this.render();
        } catch (error) {
            console.error("[Linen Inventory] photo removal failed:", error);
            this.setStatus(this.tr("messages.photoRemoveFailed"), "danger");
            this.render();
        }
    }

    getRecordWithEffectiveTargets(record = {}) {
        const normalizedRecord = createLinenInventoryRecord(record, {
            now: () => normalizeLabel(record.updatedAt) || new Date(0).toISOString()
        });
        const ownItems = normalizedRecord.items;
        const ownTargets = normalizedRecord.targets;
        const hasOwnTargets = Object.keys(ownTargets).length > 0;
        if (hasOwnTargets) {
            return {
                ...record,
                items: ownItems,
                targets: ownTargets,
                summary: summarizeLinenInventoryRecord({ ...record, items: ownItems, targets: ownTargets })
            };
        }
        const propertyKey = normalizeLabel(record.propertyId) || normalizeKey(record.propertyName);
        const baseline = filterLinenInventoryRecords(this.records)
            .filter((candidate) => candidate.id !== record.id)
            .filter((candidate) => (normalizeLabel(candidate.propertyId) || normalizeKey(candidate.propertyName)) === propertyKey)
            .filter((candidate) => candidate.workflowStatus === "approved")
            .find((candidate) => Object.values(candidate.items || {}).some((item) => Number(item?.target || 0) > 0));
        if (!baseline) {
            return {
                ...record,
                items: ownItems,
                targets: ownTargets,
                summary: summarizeLinenInventoryRecord({ ...record, items: ownItems, targets: ownTargets })
            };
        }
        const baselineItems = createEmptyLinenInventoryItems(baseline.items);
        Object.keys(ownItems).forEach((itemKey) => {
            ownItems[itemKey].target = Number(baselineItems[itemKey]?.target || 0);
        });
        const effectiveTargets = createEmptyLinenInventoryTargets(ownItems);
        return {
            ...record,
            items: ownItems,
            targets: effectiveTargets,
            summary: summarizeLinenInventoryRecord({ ...record, items: ownItems, targets: effectiveTargets })
        };
    }

    exportFilteredRecords() {
        if (!this.isManagerView()) return;
        const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
        const rows = [[
            "Property",
            "Count date",
            "Submitted by",
            "Status",
            "Section",
            "Item",
            "Count",
            "Target",
            "Difference",
            "Issue",
            "Item note",
            "Record notes"
        ]];
        this.getFilteredRecords().forEach((record) => {
            const effective = this.getRecordWithEffectiveTargets(record);
            effective.summary.sectionSummaries.forEach((section) => {
                if (section.notApplicable) {
                    rows.push([
                        record.propertyName,
                        record.countedDate,
                        this.getActorLabel(record.submittedBy || record.createdBy),
                        record.workflowStatus,
                        this.tr(section.labelKey),
                        "N/A",
                        "",
                        "",
                        "",
                        "",
                        "",
                        record.notes
                    ]);
                    return;
                }
                section.items
                    .filter((item) => item.checked || item.target || item.issue || item.note)
                    .forEach((item) => rows.push([
                        record.propertyName,
                        record.countedDate,
                        this.getActorLabel(record.submittedBy || record.createdBy),
                        record.workflowStatus,
                        this.tr(section.labelKey),
                        this.getLinenItemLabel(item),
                        item.checked ? item.count : "",
                        item.target || "",
                        item.checked && item.target ? item.difference : "",
                        item.issue ? this.tr(`issues.${item.issue}`) : "",
                        item.note,
                        record.notes
                    ]));
            });
        });
        const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
        const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `linen-inventory-${getTodayIsoDate()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    clearFilters() {
        this.searchQuery = "";
        this.selectedWorkflowStatus = "all";
        this.selectedDateFrom = "";
        this.selectedDateTo = "";
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
        const sectionKey = target.dataset.sectionKey || "";
        const propertyId = target.dataset.propertyId || "";
        const propertyName = target.dataset.propertyName || "";
        const workspace = target.dataset.workspace || "";
        const delta = Number(target.dataset.delta);
        const photoIndex = Number(target.dataset.photoIndex);
        const customIndex = Number(target.dataset.customIndex);
        const bedroomIndex = Number(target.dataset.bedroomIndex);
        const bedIndex = Number(target.dataset.bedIndex);
        if (action === "save") return void this.saveDraft();
        if (action === "save-draft") return void this.saveDraft({ submit: false });
        if (action === "open-submit-review") return void this.openSubmitReview();
        if (action === "close-submit-review") return void this.closeSubmitReview();
        if (action === "confirm-submit") return void this.saveDraft({ submit: true });
        if (action === "cleaner-workspace" && workspace) return void this.switchCleanerWorkspace(workspace);
        if (action === "select-property" && propertyId && propertyName) return void this.selectCleanerProperty(propertyId, propertyName);
        if (action === "change-property") return void this.changeCleanerProperty();
        if (action === "adjust-count" && itemKey && Number.isFinite(delta)) return void this.adjustCleanerItemCount(itemKey, delta);
        if (action === "adjust-custom-count" && Number.isInteger(customIndex) && Number.isFinite(delta)) return void this.adjustCleanerCustomCount(customIndex, delta);
        if (action === "toggle-section-na" && sectionKey) return void this.toggleSectionNotApplicable(sectionKey);
        if (action === "remove-photo" && Number.isInteger(photoIndex)) return void this.removePhoto(photoIndex);
        if (action === "reset") return void this.resetDraft();
        if (action === "counted-today") return void this.markCountedToday();
        if (action === "clear-date") return void this.clearDate();
        if (action === "clear-count" && itemKey && field) return void this.clearItemCount(itemKey, field);
        if (action === "add-custom-item") return void this.addCustomItem();
        if (action === "remove-custom-item" && Number.isInteger(customIndex)) return void this.removeCustomItem(customIndex);
        if (action === "add-section" && sectionKey) return void this.addSection(sectionKey);
        if (action === "remove-section" && sectionKey) return void this.removeSection(sectionKey);
        if (action === "add-bedroom") return void this.addBedroom();
        if (action === "remove-bedroom" && Number.isInteger(bedroomIndex)) return void this.removeBedroom(bedroomIndex);
        if (action === "add-bed" && Number.isInteger(bedroomIndex)) return void this.addBed(bedroomIndex);
        if (action === "remove-bed" && Number.isInteger(bedroomIndex) && Number.isInteger(bedIndex)) return void this.removeBed(bedroomIndex, bedIndex);
        if (action === "clear-custom-count" && Number.isInteger(customIndex) && field) return void this.clearCustomItemCount(customIndex, field);
        if (action === "edit" && recordId) return void this.startEditing(recordId);
        if (action === "review" && recordId) return void this.openAdminReview(recordId);
        if (action === "close-review") return void this.closeAdminReview();
        if (action === "approve" && recordId) return void this.setReviewStatus(recordId, "approved");
        if (action === "request-correction" && recordId) return void this.setReviewStatus(recordId, "needsCorrection");
        if (action === "archive" && recordId) return void this.archiveRecord(recordId);
        if (action === "delete" && recordId) return void this.deleteRecord(recordId);
        if (action === "export") return void this.exportFilteredRecords();
        if (action === "clear-filters") return void this.clearFilters();
    }

    handleRootChange(event) {
        const target = event.target;
        if (target?.id === "linen-inventory-search-input") {
            this.searchQuery = target.value;
            this.render();
        } else if (target?.id === "linen-inventory-status-filter") {
            this.selectedWorkflowStatus = target.value || "all";
            this.render();
        } else if (target?.id === "linen-inventory-date-from") {
            this.selectedDateFrom = target.value || "";
            this.render();
        } else if (target?.id === "linen-inventory-date-to") {
            this.selectedDateTo = target.value || "";
            this.render();
        } else if (target?.id === "linen-inventory-photo-input") {
            void this.uploadPhotos(target.files);
        } else if (this.isCleanerView() && target?.matches?.("[data-linen-item-field], [data-linen-custom-field], [data-linen-section-field], #linen-inventory-counted-input, #linen-inventory-notes-input")) {
            this.draft = this.readDraftFromDom();
            this.persistCleanerDraft();
        }
    }

    handleRootInput(event) {
        const target = event.target;
        if (target?.id === "linen-cleaner-property-search") {
            const propertyQuery = normalizeKey(target.value);
            this.cleanerPropertyQuery = target.value;
            let visibleCount = 0;
            document.querySelectorAll("[data-linen-property-option]").forEach((option) => {
                const matches = propertyQuery && normalizeKey(option.dataset.propertyName).includes(propertyQuery);
                option.classList.toggle("hidden", !matches);
                if (matches) visibleCount += 1;
            });
            document.getElementById("linen-cleaner-property-prompt")?.classList.toggle("hidden", Boolean(propertyQuery));
            document.getElementById("linen-cleaner-property-empty")?.classList.toggle("hidden", !propertyQuery || visibleCount > 0);
            return;
        }
        if (this.isCleanerView() && target?.matches?.("[data-linen-item-field], [data-linen-custom-field], [data-linen-section-field], #linen-inventory-counted-input, #linen-inventory-notes-input")) {
            this.draft = this.readDraftFromDom();
            this.persistCleanerDraft();
        }
    }

    handleRootToggle(event) {
        const target = event.target;
        if (target?.dataset?.linenCleanerSection) {
            const sectionKey = target.dataset.linenCleanerSection;
            if (target.open) this.cleanerExpandedSections.add(sectionKey);
            else this.cleanerExpandedSections.delete(sectionKey);
        }
    }

    bindRootEvents() {
        const root = document.getElementById("linen-inventory-root");
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
        if (!this.statusMessage) return "";
        return `
            <section class="rounded-2xl border px-4 py-3 text-sm font-medium ${toneClass(this.statusTone)}" role="status" aria-live="polite">
                ${escapeHtml(this.statusMessage)}
            </section>
        `;
    }

    renderCleanerWorkspaceTabs() {
        const tabs = [
            { key: "count", label: this.tr("cleaner.countTab") },
            { key: "history", label: this.tr("cleaner.historyTab"), count: this.records.length }
        ];
        return `
            <nav class="grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1" aria-label="${escapeHtml(this.tr("cleaner.workspaceLabel"))}">
                ${tabs.map((tab) => {
                    const active = this.cleanerWorkspace === tab.key;
                    return `
                        <button type="button" data-linen-action="cleaner-workspace" data-workspace="${escapeHtml(tab.key)}" class="flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white text-slate-950 shadow-sm" : "text-slate-600 hover:text-slate-900"}">
                            <span>${escapeHtml(tab.label)}</span>
                            ${Number.isFinite(tab.count) ? `<span class="inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-xs ${active ? "bg-rose-600 text-white" : "bg-white/80 text-slate-700"}">${escapeHtml(String(tab.count))}</span>` : ""}
                        </button>
                    `;
                }).join("")}
            </nav>
        `;
    }

    renderCleanerPropertyPicker() {
        const options = this.getKnownPropertyOptions();
        const queryValue = normalizeKey(this.cleanerPropertyQuery);
        const visibleCount = options.filter((property) => queryValue && normalizeKey(property.name).includes(queryValue)).length;
        const loading = this.propertyDirectoryLoading;
        return `
            <section aria-labelledby="linen-cleaner-property-title">
                <div class="border-b border-slate-200 pb-5">
                    <div class="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">${escapeHtml(this.tr("cleaner.newCountKicker"))}</div>
                    <h2 id="linen-cleaner-property-title" class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.tr("cleaner.searchPropertyTitle"))}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.searchPropertyHint"))}</p>
                </div>
                <label class="mt-5 block">
                    <span class="sr-only">${escapeHtml(this.tr("cleaner.searchProperties"))}</span>
                    <span class="relative block">
                        <svg class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0z" /></svg>
                        <input id="linen-cleaner-property-search" type="search" value="${escapeHtml(this.cleanerPropertyQuery)}" placeholder="${escapeHtml(this.tr("cleaner.searchProperties"))}" autocomplete="off" class="min-h-14 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:cursor-wait disabled:bg-slate-50" ${loading ? "disabled" : ""}>
                    </span>
                </label>
                <p id="linen-cleaner-property-prompt" class="${queryValue ? "hidden " : ""}mt-5 text-center text-sm text-slate-500">${escapeHtml(this.tr(loading ? "cleaner.loadingProperties" : "cleaner.typeToSearch"))}</p>
                <div class="mt-4 divide-y divide-slate-100 border-y border-slate-200">
                    ${options.map((property) => {
                        const visible = queryValue && normalizeKey(property.name).includes(queryValue);
                        return `
                            <button type="button" data-linen-action="select-property" data-property-id="${escapeHtml(property.id)}" data-property-name="${escapeHtml(property.name)}" data-linen-property-option class="${visible ? "" : "hidden "}group flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left transition hover:text-rose-700 active:scale-[0.99]">
                                <span class="text-base font-semibold text-slate-900 group-hover:text-rose-700">${escapeHtml(property.name)}</span>
                                <svg class="h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        `;
                    }).join("")}
                </div>
                <p id="linen-cleaner-property-empty" class="${loading || !queryValue || visibleCount > 0 ? "hidden " : ""}mt-5 rounded-2xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.noProperties"))}</p>
            </section>
        `;
    }

    renderCleanerIssueFields({ itemKey = "", customIndex = null, item = {}, label = "" }) {
        const isCustom = Number.isInteger(customIndex);
        const attributes = isCustom
            ? `data-linen-custom-index="${escapeHtml(String(customIndex))}" data-linen-custom-field`
            : `data-linen-item-key="${escapeHtml(itemKey)}" data-linen-item-field`;
        return `
            <details class="pb-3 pl-1 pr-1">
                <summary class="flex min-h-10 cursor-pointer list-none items-center gap-2 text-xs font-semibold ${item.issue ? "text-amber-700" : "text-slate-500"}">
                    <span>${escapeHtml(item.issue ? this.tr(`issues.${item.issue}`) : this.tr("cleaner.reportIssue"))}</span>
                    ${item.note ? `<span class="truncate font-normal text-slate-500">${escapeHtml(item.note)}</span>` : ""}
                </summary>
                <div class="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                    <label class="text-xs font-semibold text-slate-600">
                        ${escapeHtml(this.tr("labels.issue"))}
                        <select ${attributes}="issue" aria-label="${escapeHtml(this.tr("cleaner.issueFor", { item: label }))}" class="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                            <option value="">${escapeHtml(this.tr("issues.none"))}</option>
                            <option value="missing" ${item.issue === "missing" ? "selected" : ""}>${escapeHtml(this.tr("issues.missing"))}</option>
                            <option value="damaged" ${item.issue === "damaged" ? "selected" : ""}>${escapeHtml(this.tr("issues.damaged"))}</option>
                        </select>
                    </label>
                    <label class="text-xs font-semibold text-slate-600">
                        ${escapeHtml(this.tr("labels.issueNote"))}
                        <input type="text" ${attributes}="note" value="${escapeHtml(item.note)}" placeholder="${escapeHtml(this.tr("cleaner.issueNotePlaceholder"))}" class="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                    </label>
                </div>
            </details>
        `;
    }

    renderCleanerCounter({ itemKey = "", customIndex = null, item = {}, label = "" }) {
        const isCustom = Number.isInteger(customIndex);
        const action = isCustom ? "adjust-custom-count" : "adjust-count";
        const targetAttributes = isCustom
            ? `data-custom-index="${escapeHtml(String(customIndex))}"`
            : `data-item-key="${escapeHtml(itemKey)}"`;
        const inputAttributes = isCustom
            ? `data-linen-custom-index="${escapeHtml(String(customIndex))}" data-linen-custom-field="count"`
            : `data-linen-item-key="${escapeHtml(itemKey)}" data-linen-item-field="count"`;
        return `
            <div class="border-b border-slate-100 last:border-b-0">
                <div class="flex min-h-16 items-center justify-between gap-3 py-2.5">
                    <div class="min-w-0 pr-2">
                        <div class="text-sm font-medium leading-5 text-slate-900">${escapeHtml(label)}</div>
                        <div class="mt-0.5 text-xs ${item.checked ? "text-emerald-700" : "text-slate-400"}">${escapeHtml(item.checked ? this.tr("cleaner.checked") : this.tr("cleaner.notChecked"))}</div>
                    </div>
                    <div class="flex shrink-0 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" data-linen-action="${action}" ${targetAttributes} data-delta="-1" aria-label="${escapeHtml(this.tr("cleaner.decrease", { item: label }))}" class="flex h-12 w-12 items-center justify-center text-2xl font-medium text-slate-600 transition hover:bg-slate-50 active:bg-slate-100">&minus;</button>
                        <input type="number" min="0" inputmode="numeric" aria-label="${escapeHtml(label)}" ${inputAttributes} value="${escapeHtml(toCountInput(item))}" placeholder="—" class="h-12 w-14 border-x border-slate-200 bg-slate-50 text-center text-base font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-inset focus:ring-rose-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none">
                        <button type="button" data-linen-action="${action}" ${targetAttributes} data-delta="1" aria-label="${escapeHtml(this.tr("cleaner.increase", { item: label }))}" class="flex h-12 w-12 items-center justify-center text-2xl font-medium text-rose-700 transition hover:bg-rose-50 active:bg-rose-100">+</button>
                    </div>
                </div>
                ${this.renderCleanerIssueFields({ itemKey, customIndex, item, label })}
            </div>
        `;
    }

    renderCleanerCustomItem(item, index) {
        const label = item.name || this.tr("labels.customItemFallback");
        return `
            <div class="rounded-2xl border border-rose-100 bg-rose-50/30 px-3 pt-3">
                <div class="flex items-center gap-2">
                    <input type="text" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="name" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(this.tr("form.customItemPlaceholder"))}" class="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">
                    <button type="button" data-linen-action="remove-custom-item" data-custom-index="${escapeHtml(String(index))}" aria-label="${escapeHtml(this.tr("actions.removeCustomItem"))}" class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-rose-700 transition hover:bg-rose-100"><svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                ${this.renderCleanerCounter({ customIndex: index, item, label })}
            </div>
        `;
    }

    renderCleanerSection(section, sectionSummary) {
        const sectionState = this.draft.sections?.[section.key] || {};
        const isOpen = this.cleanerExpandedSections.has(section.key);
        const notApplicable = Boolean(sectionState.notApplicable);
        return `
            <details data-linen-cleaner-section="${escapeHtml(section.key)}" data-linen-section-key="${escapeHtml(section.key)}" class="group border-b border-slate-200 py-1 last:border-b-0" ${isOpen ? "open" : ""}>
                <summary class="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-3">
                    <span>
                        <span class="block text-base font-semibold text-slate-950">${escapeHtml(this.tr(section.labelKey))}</span>
                        <span class="mt-1 block text-xs text-slate-500">${escapeHtml(notApplicable ? this.tr("cleaner.notApplicable") : this.tr("cleaner.sectionProgress", { complete: sectionSummary.completedItemCount, total: sectionSummary.requiredItemCount }))}</span>
                    </span>
                    <span class="flex items-center gap-3">
                        <span class="min-w-9 rounded-full px-2 py-1 text-center text-xs font-semibold ${notApplicable ? "bg-slate-100 text-slate-500" : sectionSummary.completedItemCount === sectionSummary.requiredItemCount ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}">${escapeHtml(notApplicable ? "N/A" : `${sectionSummary.completedItemCount}/${sectionSummary.requiredItemCount}`)}</span>
                        <svg class="h-5 w-5 text-slate-400 transition group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                    </span>
                </summary>
                <div class="pb-4">
                    <button type="button" data-linen-action="toggle-section-na" data-section-key="${escapeHtml(section.key)}" class="mb-3 min-h-10 rounded-full border px-4 py-2 text-xs font-semibold transition ${notApplicable ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}">${escapeHtml(notApplicable ? this.tr("cleaner.useSection") : this.tr("cleaner.markNotApplicable"))}</button>
                    ${notApplicable ? `<p class="rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.sectionSkipped"))}</p>` : `
                        ${(section.key === "doubleBed" || section.key === "singleBed") ? `
                            <details class="mb-3 rounded-xl bg-slate-50 px-3 py-1">
                                <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-600"><span>${escapeHtml(this.tr("cleaner.bedDetails"))}</span><span>${escapeHtml(sectionState.bedSize || "")}</span></summary>
                                <div class="grid gap-3 pb-3 pt-1 sm:grid-cols-2">
                                    <label class="text-xs font-semibold text-slate-600">${escapeHtml(this.tr("labels.bedroomCount"))}<input type="number" min="1" inputmode="numeric" data-linen-section-key="${escapeHtml(section.key)}" data-linen-section-field="bedroomCount" value="${escapeHtml(String(sectionState.bedroomCount || 1))}" class="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900"></label>
                                    <label class="text-xs font-semibold text-slate-600">${escapeHtml(this.tr("labels.bedSize"))}<input type="text" data-linen-section-key="${escapeHtml(section.key)}" data-linen-section-field="bedSize" value="${escapeHtml(sectionState.bedSize || "")}" placeholder="${escapeHtml(this.tr("form.bedSizePlaceholder"))}" class="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900"></label>
                                </div>
                            </details>
                        ` : ""}
                        <div>
                            ${section.items.map((definition) => this.renderCleanerCounter({
                                itemKey: definition.key,
                                item: this.draft.items?.[definition.key] || {},
                                label: this.tr(definition.labelKey)
                            })).join("")}
                        </div>
                        ${section.key === "other" ? `
                            <div class="mt-3 space-y-3">
                                ${(this.draft.customItems || []).map((item, index) => this.renderCleanerCustomItem(item, index)).join("")}
                                <button type="button" data-linen-action="add-custom-item" class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"><span class="text-lg">+</span><span>${escapeHtml(this.tr("actions.addCustomItem"))}</span></button>
                            </div>
                        ` : ""}
                    `}
                </div>
            </details>
        `;
    }

    renderPhotoFields({ readonly = false } = {}) {
        const photos = this.draft.photos || [];
        return `
            <div>
                <div class="text-sm font-semibold text-slate-800">${escapeHtml(this.tr("photos.title"))}</div>
                <p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(this.tr("photos.helper"))}</p>
                ${photos.length ? `<div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">${photos.map((photo, index) => `
                    <figure class="relative overflow-hidden rounded-xl bg-slate-100">
                        <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || this.tr("photos.photo"))}" class="aspect-square h-full w-full object-cover">
                        ${readonly ? "" : `<button type="button" data-linen-action="remove-photo" data-photo-index="${escapeHtml(String(index))}" aria-label="${escapeHtml(this.tr("photos.remove"))}" class="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-slate-950/75 text-white">&times;</button>`}
                    </figure>
                `).join("")}</div>` : ""}
                ${readonly ? "" : `
                    <label class="mt-3 flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700">
                        ${escapeHtml(this.photoUploadInProgress ? this.tr("photos.uploading") : this.tr("photos.add"))}
                        <input id="linen-inventory-photo-input" type="file" accept="image/*" capture="environment" multiple class="sr-only" ${this.photoUploadInProgress ? "disabled" : ""}>
                    </label>
                `}
            </div>
        `;
    }

    renderCleanerCountForm() {
        if (!this.draft.propertyName) return this.renderCleanerPropertyPicker();
        const summary = summarizeLinenInventoryRecord(this.draft);
        const canReview = summary.trackedItems > 0 && summary.completion.complete && !this.photoUploadInProgress;
        return `
            <section id="linen-cleaner-count-form" class="scroll-mt-6 pb-28">
                <input id="linen-inventory-property-id" type="hidden" value="${escapeHtml(this.draft.propertyId)}">
                <input id="linen-inventory-property-input" type="hidden" value="${escapeHtml(this.draft.propertyName)}">
                <div class="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
                    <div class="min-w-0">
                        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">${escapeHtml(this.editingRecordId ? this.tr("cleaner.editingCount") : this.tr("cleaner.countingAt"))}</div>
                        <h2 class="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.draft.propertyName)}</h2>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.formatDate(this.draft.countedDate))}</p>
                    </div>
                    <button type="button" data-linen-action="change-property" class="min-h-11 shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700">${escapeHtml(this.tr("cleaner.changeProperty"))}</button>
                </div>
                ${this.editingRecordId && this.records.find((record) => record.id === this.editingRecordId)?.reviewNote ? `<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><div class="font-semibold">${escapeHtml(this.tr("cleaner.correctionRequested"))}</div><p class="mt-1">${escapeHtml(this.records.find((record) => record.id === this.editingRecordId)?.reviewNote)}</p></div>` : ""}
                <div class="mt-6">
                    <div class="flex items-end justify-between gap-4">
                        <div><h3 class="text-lg font-semibold text-slate-950">${escapeHtml(this.tr("cleaner.countItems"))}</h3><p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.countItemsHint"))}</p></div>
                        <span class="shrink-0 text-sm font-semibold text-slate-700">${escapeHtml(`${summary.completion.completedItems}/${summary.completion.totalItems}`)}</span>
                    </div>
                    <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div class="h-full rounded-full bg-rose-600 transition-all" style="width:${escapeHtml(String(summary.completion.percent))}%"></div></div>
                    <div class="mt-4 border-y border-slate-200">${LINEN_INVENTORY_GROUPS.map((section) => this.renderCleanerSection(section, summary.sectionSummaries.find((entry) => entry.key === section.key))).join("")}</div>
                </div>
                <details class="mt-6 rounded-2xl bg-slate-100/80 px-4 py-1">
                    <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700"><span>${escapeHtml(this.tr("cleaner.notesAndPhotos"))}</span><svg class="h-5 w-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg></summary>
                    <div class="space-y-5 pb-4 pt-2">
                        <label class="block text-sm font-medium text-slate-700">${escapeHtml(this.tr("labels.countedDate"))}<input id="linen-inventory-counted-input" type="date" value="${escapeHtml(this.draft.countedDate)}" class="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900"></label>
                        <label class="block text-sm font-medium text-slate-700">${escapeHtml(this.tr("labels.notes"))}<textarea id="linen-inventory-notes-input" rows="3" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900">${escapeHtml(this.draft.notes)}</textarea></label>
                        ${this.renderPhotoFields()}
                    </div>
                </details>
                <div class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:sticky sm:inset-x-auto sm:bottom-3 sm:mt-6 sm:rounded-2xl sm:border">
                    <div class="mx-auto grid max-w-2xl grid-cols-[auto_1fr] gap-3">
                        <button type="button" data-linen-action="save-draft" class="min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">${escapeHtml(this.tr("cleaner.saveDraft"))}</button>
                        <button type="button" data-linen-action="open-submit-review" ${canReview ? "" : "disabled"} class="min-h-12 rounded-xl bg-rose-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500">${escapeHtml(canReview ? this.tr("cleaner.reviewCount", { count: summary.countedUnits }) : this.tr("cleaner.itemsRemaining", { count: summary.completion.remainingItems }))}</button>
                    </div>
                </div>
            </section>
        `;
    }

    renderCleanerSubmitReview() {
        const summary = summarizeLinenInventoryRecord(this.draft);
        return `
            <section class="pb-28">
                <button type="button" data-linen-action="close-submit-review" class="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><span>&larr;</span><span>${escapeHtml(this.tr("cleaner.backToCount"))}</span></button>
                <div class="mt-4 border-b border-slate-200 pb-5">
                    <div class="text-xs font-semibold uppercase tracking-[0.18em] text-rose-600">${escapeHtml(this.tr("cleaner.reviewKicker"))}</div>
                    <h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.draft.propertyName)}</h2>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.reviewHint"))}</p>
                </div>
                <dl class="mt-5 grid grid-cols-3 gap-3 border-b border-slate-200 pb-5 text-center">
                    <div><dt class="text-xs text-slate-500">${escapeHtml(this.tr("labels.totalCounted"))}</dt><dd class="mt-1 text-xl font-semibold text-slate-950">${escapeHtml(String(summary.countedUnits))}</dd></div>
                    <div><dt class="text-xs text-slate-500">${escapeHtml(this.tr("labels.trackedItems"))}</dt><dd class="mt-1 text-xl font-semibold text-slate-950">${escapeHtml(String(summary.trackedItems))}</dd></div>
                    <div><dt class="text-xs text-slate-500">${escapeHtml(this.tr("labels.issues"))}</dt><dd class="mt-1 text-xl font-semibold ${summary.issueCount ? "text-amber-700" : "text-emerald-700"}">${escapeHtml(String(summary.issueCount))}</dd></div>
                </dl>
                <div class="mt-5 divide-y divide-slate-100 border-y border-slate-200">${summary.sectionSummaries.map((section) => `
                    <div class="flex items-center justify-between gap-4 py-3"><span class="text-sm font-medium text-slate-700">${escapeHtml(this.tr(section.labelKey))}</span><span class="text-sm font-semibold text-slate-950">${escapeHtml(section.notApplicable ? this.tr("cleaner.notApplicable") : String(section.count))}</span></div>
                `).join("")}</div>
                ${this.draft.notes ? `<div class="mt-5"><h3 class="text-sm font-semibold text-slate-800">${escapeHtml(this.tr("labels.notes"))}</h3><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">${escapeHtml(this.draft.notes)}</p></div>` : ""}
                ${(this.draft.photos || []).length ? `<div class="mt-5">${this.renderPhotoFields({ readonly: true })}</div>` : ""}
                <div class="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:sticky sm:inset-x-auto sm:bottom-3 sm:mt-6 sm:rounded-2xl sm:border"><div class="mx-auto max-w-2xl"><button type="button" data-linen-action="confirm-submit" class="min-h-12 w-full rounded-xl bg-rose-600 px-5 py-3 text-base font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-rose-700">${escapeHtml(this.tr("cleaner.submitCount"))}</button></div></div>
            </section>
        `;
    }

    renderCleanerHistory() {
        const records = filterLinenInventoryRecords(this.records).filter((record) => record.workflowStatus !== "archived");
        return `
            <section aria-labelledby="linen-cleaner-history-title">
                <div class="border-b border-slate-200 pb-5"><div class="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">${escapeHtml(this.tr("cleaner.historyKicker"))}</div><h2 id="linen-cleaner-history-title" class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(this.tr("cleaner.historyTitle"))}</h2><p class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(this.tr("cleaner.historyHint"))}</p></div>
                ${records.length ? `<div class="divide-y divide-slate-200">${records.map((record) => `
                    <article class="py-5">
                        <div class="flex items-start justify-between gap-4"><div class="min-w-0"><h3 class="truncate text-lg font-semibold text-slate-950">${escapeHtml(record.propertyName)}</h3><p class="mt-1 text-sm text-slate-500">${escapeHtml(this.formatDate(record.countedDate))} · ${escapeHtml(this.tr("summary.counted", { count: record.countedUnits }))}</p></div>${this.renderWorkflowBadge(record.workflowStatus)}</div>
                        ${record.reviewNote ? `<p class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">${escapeHtml(record.reviewNote)}</p>` : ""}
                        ${this.canEditRecord(record) ? `<button type="button" data-linen-action="edit" data-record-id="${escapeHtml(record.id)}" class="mt-4 min-h-11 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700">${escapeHtml(record.workflowStatus === "needsCorrection" ? this.tr("cleaner.correctCount") : this.tr("actions.edit"))}</button>` : ""}
                    </article>
                `).join("")}</div>` : `<div class="py-12 text-center"><h3 class="text-lg font-semibold text-slate-950">${escapeHtml(this.tr("cleaner.noHistoryTitle"))}</h3><p class="mt-2 text-sm text-slate-500">${escapeHtml(this.tr("cleaner.noHistoryBody"))}</p></div>`}
            </section>
        `;
    }

    renderCleanerApp() {
        return `
            <div class="space-y-5">
                ${this.renderCleanerStatus()}
                ${this.renderCleanerWorkspaceTabs()}
                ${this.submitReviewOpen
                    ? this.renderCleanerSubmitReview()
                    : this.cleanerWorkspace === "history"
                        ? this.renderCleanerHistory()
                        : this.renderCleanerCountForm()}
            </div>
        `;
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
            <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-linen-admin-only>
                ${this.renderMetricCard(this.tr("stats.records"), totals.count, "text-slate-900")}
                ${this.renderMetricCard(this.tr("stats.pendingReview"), totals.pendingReview, "text-amber-700")}
                ${this.renderMetricCard(this.tr("stats.shortages"), totals.shortageUnits, "text-rose-700")}
                ${this.renderMetricCard(this.tr("stats.issues"), totals.issueCount, "text-sky-700")}
            </section>
        `;
    }

    renderWorkflowBadge(status) {
        const normalized = status || "draft";
        const classNameByStatus = {
            draft: "border-slate-200 bg-slate-50 text-slate-700",
            submitted: "border-amber-200 bg-amber-50 text-amber-800",
            needsCorrection: "border-rose-200 bg-rose-50 text-rose-800",
            approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
            archived: "border-slate-200 bg-slate-100 text-slate-500"
        };
        return `<span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${classNameByStatus[normalized] || classNameByStatus.draft}">${escapeHtml(this.tr(`workflow.${normalized}`))}</span>`;
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
            <div class="grid gap-3 rounded-xl border border-dashed border-rose-200 bg-rose-50/40 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_90px_90px_130px_minmax(150px,1fr)_auto] xl:items-end">
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.customItemName"))}
                    <input type="text" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="name" value="${escapeHtml(item.name)}" placeholder="${escapeHtml(this.tr("form.customItemPlaceholder"))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                </label>
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                    ${escapeHtml(this.tr("labels.countShort"))}
                    <input type="number" min="0" inputmode="numeric" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="count" value="${escapeHtml(toCountInput(item))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                </label>
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.target"))}<input type="number" min="0" inputmode="numeric" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="target" value="${escapeHtml(toInputNumber(item.target))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"></label>
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.issue"))}<select data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="issue" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"><option value="">${escapeHtml(this.tr("issues.none"))}</option><option value="missing" ${item.issue === "missing" ? "selected" : ""}>${escapeHtml(this.tr("issues.missing"))}</option><option value="damaged" ${item.issue === "damaged" ? "selected" : ""}>${escapeHtml(this.tr("issues.damaged"))}</option></select></label>
                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.issueNote"))}<input type="text" data-linen-custom-index="${escapeHtml(String(index))}" data-linen-custom-field="note" value="${escapeHtml(item.note)}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900"></label>
                <button type="button" data-linen-action="remove-custom-item" data-custom-index="${escapeHtml(String(index))}" class="self-end rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">
                    ${escapeHtml(this.tr("actions.removeCustomItem"))}
                </button>
            </div>
        `;
    }

    renderSectionPicker(activeSections) {
        const active = new Set(activeSections || []);
        const availableSections = LINEN_INVENTORY_GROUPS.filter((section) => !active.has(section.key));

        if (!availableSections.length) {
            return "";
        }

        return `
            <section class="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
                <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("sectionsPicker.title"))}</h3>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("sectionsPicker.helper"))}</p>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${availableSections.map((section) => `
                            <button type="button" data-linen-action="add-section" data-section-key="${escapeHtml(section.key)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100">${escapeHtml(this.tr(section.labelKey))}</button>
                        `).join("")}
                    </div>
                </div>
            </section>
        `;
    }

    renderSectionMeta(section, sectionSummary) {
        if (section.key !== "doubleBed" && section.key !== "singleBed") {
            return "";
        }

        return `
            <div class="flex flex-wrap items-end gap-2">
                <label class="block w-24 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    ${escapeHtml(this.tr("labels.bedroomCount"))}
                    <input type="number" min="1" inputmode="numeric" data-linen-section-key="${escapeHtml(section.key)}" data-linen-section-field="bedroomCount" value="${escapeHtml(toInputNumber(sectionSummary.bedroomCount) || "1")}" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                </label>
                <label class="block w-40 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                    ${escapeHtml(this.tr("labels.bedSize"))}
                    <input type="text" data-linen-section-key="${escapeHtml(section.key)}" data-linen-section-field="bedSize" value="${escapeHtml(sectionSummary.bedSize)}" placeholder="${escapeHtml(this.tr("form.bedSizePlaceholder"))}" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                </label>
            </div>
        `;
    }

    renderSection(section, sectionSummary, items, customItems) {
        return `
            <section data-linen-section-key="${escapeHtml(section.key)}" class="rounded-xl border border-slate-200 bg-white p-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div class="min-w-0 flex-1">
                        <div class="flex flex-wrap items-end gap-4">
                            <h3 class="pb-2 text-sm font-semibold text-slate-900">${escapeHtml(this.tr(section.labelKey))}</h3>
                            ${this.renderSectionMeta(section, sectionSummary)}
                        </div>
                        <div class="mt-1 text-xs text-slate-500">
                            ${escapeHtml(this.tr("summary.counted", { count: sectionSummary.count }))}
                        </div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">${escapeHtml(this.tr("summary.items", { count: sectionSummary.itemCount }))}</span>
                        <button type="button" data-linen-action="remove-section" data-section-key="${escapeHtml(section.key)}" class="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">${escapeHtml(this.tr("actions.removeSection"))}</button>
                    </div>
                </div>
                <div class="mt-2 divide-y divide-slate-100">
                    ${section.items.map((item) => {
                        const counts = items[item.key] || { count: 0, checked: false, target: 0, issue: "", note: "" };
                        return `
                            <div class="grid gap-2 py-3 sm:grid-cols-[minmax(180px,1fr)_90px_90px_130px] sm:items-end">
                                <div class="text-sm font-medium text-slate-800">${escapeHtml(this.tr(item.labelKey))}</div>
                                <label class="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.countShort"))}
                                    <input type="number" min="0" inputmode="numeric" data-linen-item-key="${escapeHtml(item.key)}" data-linen-item-field="count" value="${escapeHtml(toCountInput(counts))}" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                </label>
                                <label class="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">${escapeHtml(this.tr("labels.target"))}<input type="number" min="0" inputmode="numeric" data-linen-item-key="${escapeHtml(item.key)}" data-linen-item-field="target" value="${escapeHtml(toInputNumber(counts.target))}" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"></label>
                                <label class="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">${escapeHtml(this.tr("labels.issue"))}<select data-linen-item-key="${escapeHtml(item.key)}" data-linen-item-field="issue" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-slate-900"><option value="">${escapeHtml(this.tr("issues.none"))}</option><option value="missing" ${counts.issue === "missing" ? "selected" : ""}>${escapeHtml(this.tr("issues.missing"))}</option><option value="damaged" ${counts.issue === "damaged" ? "selected" : ""}>${escapeHtml(this.tr("issues.damaged"))}</option></select></label>
                                <label class="block text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500 sm:col-start-2 sm:col-span-3">${escapeHtml(this.tr("labels.issueNote"))}<input type="text" data-linen-item-key="${escapeHtml(item.key)}" data-linen-item-field="note" value="${escapeHtml(counts.note)}" class="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm normal-case tracking-normal text-slate-900"></label>
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

    renderBedroomLayout(bedrooms) {
        if (!bedrooms.length) {
            return "";
        }

        return `
            <section class="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div class="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("bedrooms.title"))}</h3>
                        <p class="mt-1 text-sm text-slate-500">${escapeHtml(this.tr("bedrooms.helper"))}</p>
                    </div>
                    <button type="button" data-linen-action="add-bedroom" class="w-full rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 sm:w-auto">${escapeHtml(this.tr("actions.addBedroom"))}</button>
                </div>
                <div class="mt-4 space-y-4">
                    ${bedrooms.map((bedroom, bedroomIndex) => `
                        <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div class="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_auto] sm:items-end">
                                <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                    ${escapeHtml(this.tr("labels.bedroomName"))}
                                    <input type="text" data-linen-bedroom-index="${escapeHtml(String(bedroomIndex))}" data-linen-bedroom-field="name" value="${escapeHtml(bedroom.name)}" placeholder="${escapeHtml(this.tr("form.bedroomPlaceholder", { number: bedroomIndex + 1 }))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                </label>
                                <button type="button" data-linen-action="remove-bedroom" data-bedroom-index="${escapeHtml(String(bedroomIndex))}" class="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">${escapeHtml(this.tr("actions.removeBedroom"))}</button>
                            </div>
                            <div class="mt-3 space-y-3">
                                ${(bedroom.beds || []).map((bed, bedIndex) => `
                                    <div class="grid gap-3 sm:grid-cols-[minmax(140px,1fr)_minmax(140px,1fr)_auto] sm:items-end">
                                        <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                            ${escapeHtml(this.tr("labels.bedType"))}
                                            <input type="text" data-linen-bedroom-index="${escapeHtml(String(bedroomIndex))}" data-linen-bed-index="${escapeHtml(String(bedIndex))}" data-linen-bed-field="type" value="${escapeHtml(bed.type)}" placeholder="${escapeHtml(this.tr("form.bedTypePlaceholder"))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                        </label>
                                        <label class="block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                                            ${escapeHtml(this.tr("labels.bedSize"))}
                                            <input type="text" data-linen-bedroom-index="${escapeHtml(String(bedroomIndex))}" data-linen-bed-index="${escapeHtml(String(bedIndex))}" data-linen-bed-field="size" value="${escapeHtml(bed.size)}" placeholder="${escapeHtml(this.tr("form.bedSizePlaceholder"))}" class="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                                        </label>
                                        <button type="button" data-linen-action="remove-bed" data-bedroom-index="${escapeHtml(String(bedroomIndex))}" data-bed-index="${escapeHtml(String(bedIndex))}" class="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">${escapeHtml(this.tr("actions.removeBed"))}</button>
                                    </div>
                                `).join("")}
                            </div>
                            <button type="button" data-linen-action="add-bed" data-bedroom-index="${escapeHtml(String(bedroomIndex))}" class="mt-3 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">${escapeHtml(this.tr("actions.addBed"))}</button>
                        </div>
                    `).join("")}
                </div>
            </section>
        `;
    }

    renderRecordCard(record) {
        const effective = this.getRecordWithEffectiveTargets(record);
        const detail = effective.summary.sectionSummaries
            .filter((section) => section.count > 0 || section.bedSize)
            .slice(0, 3)
            .map((section) => {
                const bedDetail = section.bedSize
                    ? ` (${section.bedroomCount} ${this.tr("labels.bedroomCount").toLocaleLowerCase()}: ${section.bedSize})`
                    : "";
                return `${this.tr(section.labelKey)} ${section.count}${bedDetail}`;
            })
            .join(" - ");
        const submittedBy = this.getActorLabel(record.submittedBy || record.createdBy) || this.tr("labels.unknownColleague");

        return `
            <article class="border-b border-slate-200 py-5 last:border-b-0" data-linen-admin-only>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <div class="text-base font-semibold text-slate-900">${escapeHtml(record.propertyName || this.tr("labels.unnamedProperty"))}</div>
                        <div class="mt-1 text-sm text-slate-500">${escapeHtml(record.countedDate ? this.tr("labels.countedOn", { date: this.formatDate(record.countedDate) }) : this.tr("labels.noDate"))} · ${escapeHtml(submittedBy)}</div>
                    </div>
                    ${this.renderWorkflowBadge(record.workflowStatus)}
                </div>
                <div class="mt-4 grid grid-cols-3 gap-3">
                    <div class="rounded-xl bg-slate-50 px-4 py-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.totalCounted"))}</div>
                        <div class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(String(record.countedUnits))}</div>
                    </div>
                    <div class="rounded-xl bg-slate-50 px-4 py-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.shortage"))}</div>
                        <div class="mt-2 text-xl font-semibold ${effective.summary.shortageUnits ? "text-rose-700" : "text-emerald-700"}">${escapeHtml(String(effective.summary.shortageUnits))}</div>
                    </div>
                    <div class="rounded-xl bg-slate-50 px-4 py-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${escapeHtml(this.tr("labels.issues"))}</div>
                        <div class="mt-2 text-xl font-semibold ${effective.summary.issueCount ? "text-amber-700" : "text-slate-900"}">${escapeHtml(String(effective.summary.issueCount))}</div>
                    </div>
                </div>
                ${detail ? `<p class="mt-3 text-sm text-slate-600">${escapeHtml(detail)}</p>` : ""}
                ${record.notes ? `<p class="mt-2 text-sm text-slate-500">${escapeHtml(record.notes)}</p>` : ""}
                ${record.reviewNote ? `<p class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900"><span class="font-semibold">${escapeHtml(this.tr("labels.reviewNote"))}:</span> ${escapeHtml(record.reviewNote)}</p>` : ""}
                <div class="mt-4 flex flex-wrap gap-2">
                    ${record.workflowStatus !== "archived" ? `<button type="button" data-linen-action="review" data-record-id="${escapeHtml(record.id)}" class="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700">${escapeHtml(this.tr("actions.review"))}</button>` : ""}
                    <button type="button" data-linen-action="edit" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                        ${escapeHtml(this.tr("actions.edit"))}
                    </button>
                    ${record.workflowStatus !== "archived" ? `<button type="button" data-linen-action="archive" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">${escapeHtml(this.tr("actions.archive"))}</button>` : ""}
                    <button type="button" data-linen-action="delete" data-record-id="${escapeHtml(record.id)}" class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100">
                        ${escapeHtml(this.tr("actions.delete"))}
                    </button>
                </div>
            </article>
        `;
    }

    renderAdminReviewPanel(record) {
        if (!record) return "";
        const effective = this.getRecordWithEffectiveTargets(record);
        const summary = effective.summary;
        const submittedBy = this.getActorLabel(record.submittedBy || record.createdBy) || this.tr("labels.unknownColleague");
        return `
            <section id="linen-admin-review-panel" class="scroll-mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" data-linen-admin-only>
                <div class="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                    <div><div class="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">${escapeHtml(this.tr("review.kicker"))}</div><h2 class="mt-2 text-2xl font-semibold tracking-tight text-slate-950">${escapeHtml(record.propertyName)}</h2><p class="mt-2 text-sm text-slate-500">${escapeHtml(this.tr("review.submittedBy", { name: submittedBy, date: this.formatDate(record.countedDate) }))}</p></div>
                    <div class="flex items-center gap-2">${this.renderWorkflowBadge(record.workflowStatus)}<button type="button" data-linen-action="close-review" class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500" aria-label="${escapeHtml(this.tr("actions.close"))}">&times;</button></div>
                </div>
                <div class="mt-5 grid grid-cols-3 gap-3 text-center"><div><div class="text-xs text-slate-500">${escapeHtml(this.tr("labels.totalCounted"))}</div><div class="mt-1 text-2xl font-semibold text-slate-950">${escapeHtml(String(summary.countedUnits))}</div></div><div><div class="text-xs text-slate-500">${escapeHtml(this.tr("labels.shortage"))}</div><div class="mt-1 text-2xl font-semibold ${summary.shortageUnits ? "text-rose-700" : "text-emerald-700"}">${escapeHtml(String(summary.shortageUnits))}</div></div><div><div class="text-xs text-slate-500">${escapeHtml(this.tr("labels.issues"))}</div><div class="mt-1 text-2xl font-semibold ${summary.issueCount ? "text-amber-700" : "text-slate-950"}">${escapeHtml(String(summary.issueCount))}</div></div></div>
                <div class="mt-6 divide-y divide-slate-200 border-y border-slate-200">${summary.sectionSummaries.map((section) => `
                    <div class="py-4"><div class="flex items-center justify-between gap-3"><h3 class="text-sm font-semibold text-slate-950">${escapeHtml(this.tr(section.labelKey))}</h3><span class="text-sm font-semibold text-slate-700">${escapeHtml(section.notApplicable ? this.tr("cleaner.notApplicable") : this.tr("summary.counted", { count: section.count }))}</span></div>
                    ${section.notApplicable ? "" : `<div class="mt-3 divide-y divide-slate-100">${section.items.filter((item) => item.checked || item.target || item.issue || item.note).map((item) => `
                        <div class="grid gap-2 py-2 text-sm sm:grid-cols-[minmax(160px,1fr)_70px_70px_80px]"><div><span class="font-medium text-slate-800">${escapeHtml(this.getLinenItemLabel(item))}</span>${item.note ? `<span class="mt-1 block text-xs text-slate-500">${escapeHtml(item.note)}</span>` : ""}</div><div><span class="block text-xs text-slate-400">${escapeHtml(this.tr("labels.countShort"))}</span>${escapeHtml(item.checked ? String(item.count) : "—")}</div><div><span class="block text-xs text-slate-400">${escapeHtml(this.tr("labels.target"))}</span>${escapeHtml(item.target ? String(item.target) : "—")}</div><div class="${item.shortage ? "font-semibold text-rose-700" : "text-slate-500"}">${item.issue ? escapeHtml(this.tr(`issues.${item.issue}`)) : item.shortage ? escapeHtml(`-${item.shortage}`) : ""}</div></div>
                    `).join("")}</div>`}</div>
                `).join("")}</div>
                ${record.notes ? `<div class="mt-5"><h3 class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("labels.notes"))}</h3><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">${escapeHtml(record.notes)}</p></div>` : ""}
                ${(record.photos || []).length ? `<div class="mt-5"><h3 class="text-sm font-semibold text-slate-900">${escapeHtml(this.tr("photos.title"))}</h3><div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">${record.photos.map((photo) => `<a href="${escapeHtml(photo.url)}" target="_blank" rel="noopener noreferrer" class="overflow-hidden rounded-xl bg-slate-100"><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || this.tr("photos.photo"))}" class="aspect-square h-full w-full object-cover"></a>`).join("")}</div></div>` : ""}
                <label class="mt-6 block text-sm font-semibold text-slate-700">${escapeHtml(this.tr("labels.reviewNote"))}<textarea id="linen-admin-review-note" rows="3" placeholder="${escapeHtml(this.tr("review.notePlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100">${escapeHtml(record.reviewNote || "")}</textarea></label>
                <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><button type="button" data-linen-action="approve" data-record-id="${escapeHtml(record.id)}" class="min-h-12 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700">${escapeHtml(this.tr("actions.approve"))}</button><button type="button" data-linen-action="request-correction" data-record-id="${escapeHtml(record.id)}" class="min-h-12 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100">${escapeHtml(this.tr("actions.requestCorrection"))}</button><button type="button" data-linen-action="edit" data-record-id="${escapeHtml(record.id)}" class="min-h-12 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700">${escapeHtml(this.tr("actions.editCounts"))}</button></div>
            </section>
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
                    <div class="mt-2">${escapeHtml(this.tr("summary.counted", { count: draftSummary.countedUnits }))} · ${escapeHtml(this.tr("summary.items", { count: draftSummary.trackedItems }))} · ${escapeHtml(this.tr("summary.shortage", { count: draftSummary.shortageUnits }))} · ${escapeHtml(this.tr("summary.issues", { count: draftSummary.issueCount }))}</div>
                </div>
                <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button type="button" data-linen-action="counted-today" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.markCountedToday"))}</button>
                    <button type="button" data-linen-action="add-bedroom" class="w-full rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">${escapeHtml(this.tr("actions.addBedroom"))}</button>
                </div>
                ${this.renderBedroomLayout(this.draft.bedrooms)}
                ${this.renderSectionPicker(this.draft.activeSections)}
                <div class="mt-6 grid gap-4 2xl:grid-cols-2">
                    ${LINEN_INVENTORY_GROUPS.filter((section) => (this.draft.activeSections || []).includes(section.key)).map((section) => {
                        const summary = draftSummary.sectionSummaries.find((entry) => entry.key === section.key) || { count: 0, itemCount: 0 };
                        return this.renderSection(section, summary, this.draft.items, this.draft.customItems);
                    }).join("")}
                </div>
                <label class="mt-6 block text-sm font-medium text-slate-700">
                    ${escapeHtml(this.tr("labels.notes"))}
                    <textarea id="linen-inventory-notes-input" rows="4" placeholder="${escapeHtml(this.tr("form.notesPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">${escapeHtml(this.draft.notes)}</textarea>
                </label>
                <div class="mt-6">${this.renderPhotoFields()}</div>
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
            <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" data-linen-admin-only>
                <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <div class="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">${escapeHtml(this.tr("views.recordsTitle"))}</div>
                        <h2 class="mt-2 text-xl font-semibold text-slate-900">${escapeHtml(this.trCount("counts.records", records.length))}</h2>
                    </div>
                    <button type="button" data-linen-action="export" class="min-h-11 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">${escapeHtml(this.tr("actions.export"))}</button>
                </div>
                <div class="mt-5 grid gap-3 md:grid-cols-3">
                    <div class="grid gap-3 md:col-span-3">
                        <label class="block text-sm font-medium text-slate-600">
                            ${escapeHtml(t("common.search"))}
                            <input id="linen-inventory-search-input" type="search" value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(this.tr("filters.searchPlaceholder"))}" class="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100">
                        </label>
                    </div>
                    <label class="block text-sm font-medium text-slate-600">${escapeHtml(this.tr("filters.status"))}<select id="linen-inventory-status-filter" class="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"><option value="all">${escapeHtml(this.tr("filters.allStatuses"))}</option>${["draft", "submitted", "needsCorrection", "approved", "archived"].map((status) => `<option value="${status}" ${this.selectedWorkflowStatus === status ? "selected" : ""}>${escapeHtml(this.tr(`workflow.${status}`))}</option>`).join("")}</select></label>
                    <label class="block text-sm font-medium text-slate-600">${escapeHtml(this.tr("filters.dateFrom"))}<input id="linen-inventory-date-from" type="date" value="${escapeHtml(this.selectedDateFrom)}" class="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"></label>
                    <label class="block text-sm font-medium text-slate-600">${escapeHtml(this.tr("filters.dateTo"))}<input id="linen-inventory-date-to" type="date" value="${escapeHtml(this.selectedDateTo)}" class="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900"></label>
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
        const cleanerView = this.isCleanerView();
        const shell = document.getElementById("linen-inventory-shell");
        if (shell) {
            shell.className = cleanerView
                ? "mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-6"
                : "mx-auto w-full max-w-[1920px] px-4 py-6 xl:px-8 2xl:px-10";
        }
        document.getElementById("linen-inventory-header-kicker")?.classList.toggle("hidden", cleanerView);
        document.getElementById("linen-inventory-header-subtitle")?.classList.toggle("hidden", cleanerView);

        if (!this.hasAccess()) {
            root.innerHTML = `
                <section class="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
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

        const totals = summarizeLinenInventoryRecords(this.records).totals;
        const records = this.getFilteredRecords();
        const propertyOptions = this.getKnownPropertyNames();
        const draftSummary = summarizeLinenInventoryRecord(this.draft);
        const reviewRecord = this.records.find((record) => record.id === this.reviewingRecordId) || null;

        root.innerHTML = `
            ${this.statusMessage ? `<section class="rounded-xl border px-4 py-3 text-sm font-medium ${toneClass(this.statusTone)}">${escapeHtml(this.statusMessage)}</section>` : ""}
            ${this.renderAdminReviewPanel(reviewRecord)}
            ${this.renderMetricsSection(totals)}
            <section class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.48fr)] xl:items-start">
                ${this.renderRecords({ records })}
                ${this.renderForm({ draftSummary, propertyOptions })}
            </section>
        `;
    }
}
