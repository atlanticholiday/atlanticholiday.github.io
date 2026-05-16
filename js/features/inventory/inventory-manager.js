import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
    buildEssentialsList,
    cloneEssentialsTemplate,
    DEFAULT_BED_SIZE_OPTIONS,
    DEFAULT_ESSENTIALS_TEMPLATE,
    getLocalized,
    sanitizeFilename,
    validateEssentialsTemplate
} from "./essentials-utils.js";

const LOCAL_TEMPLATE_KEY = "inventory:essentialsTemplate";
const LOCAL_LISTS_KEY = "inventory:essentialsLists";
const TEMPLATE_DOC_PATH = ["inventoryEssentials", "template"];
const LISTS_COLLECTION = "essentialsLists";

const COPY = {
    en: {
        csvDisabled: "Essentials are now generated from the editable app template. No Excel or CSV input is required.",
        assignProperty: "Assign to property",
        noProperty: "Manual / no property",
        exportLanguage: "Export language",
        bedrooms: "Bedrooms",
        propertyFeatures: "Property features",
        hasPool: "Has pool",
        needsBabyItems: "Needs baby items",
        internalNotes: "Internal notes",
        customSize: "Custom size",
        saveTemplate: "Save template",
        resetTemplate: "Reset default",
        templateTitle: "Essentials template",
        templateHelp: "Admins can edit categories, translations, quantities, comments and rule types as JSON. New lists use the current template; saved lists keep their own snapshot.",
        ownerInventoryTitle: "Owner inventory",
        ownerQty: "Owner Qty.",
        ownerBrand: "Brand",
        ownerComments: "Owner Comments",
        ahQty: "AH Qty.",
        ahComments: "AH Comments",
        category: "Category",
        item: "Item",
        save: "Save",
        exportExcel: "Excel",
        exportPdfList: "PDF List",
        exportPdfInventory: "PDF List + Inventory",
        newList: "New",
        generated: "Generated",
        saved: "Essentials list saved.",
        savedLocal: "Saved locally. Sign in through the dashboard to save it in the shared database.",
        templateSaved: "Template saved.",
        templateSavedLocal: "Template saved locally.",
        templateInvalid: "Template is invalid:",
        noGeneratedList: "Generate a list first.",
        noSavedLists: "No saved Essentials lists found.",
        deleteConfirm: "Delete this Essentials list?",
        loadFailed: "Could not load shared Essentials data.",
        pdfMissing: "PDF export library did not load. Refresh and try again.",
        excelMissing: "Excel exporter did not load. Refresh and try again.",
        ready: "Ready to generate",
        readyHelp: "Enter property details and add beds to calculate the owner list."
    },
    pt: {
        csvDisabled: "Os essenciais agora sao gerados a partir do modelo editavel da app. Nao e necessario Excel ou CSV.",
        assignProperty: "Associar ao alojamento",
        noProperty: "Manual / sem alojamento",
        exportLanguage: "Idioma do ficheiro",
        bedrooms: "Quartos",
        propertyFeatures: "Caracteristicas",
        hasPool: "Tem piscina",
        needsBabyItems: "Precisa de artigos de bebe",
        internalNotes: "Notas internas",
        customSize: "Tamanho personalizado",
        saveTemplate: "Guardar modelo",
        resetTemplate: "Repor padrao",
        templateTitle: "Modelo de essenciais",
        templateHelp: "Admins podem editar categorias, traducoes, quantidades, comentarios e regras em JSON. Novas listas usam o modelo atual; listas guardadas mantem o seu snapshot.",
        ownerInventoryTitle: "Inventario do proprietario",
        ownerQty: "Qtd. proprietario",
        ownerBrand: "Marca",
        ownerComments: "Comentarios do proprietario",
        ahQty: "Qtd. AH",
        ahComments: "Comentarios AH",
        category: "Categoria",
        item: "Item",
        save: "Guardar",
        exportExcel: "Excel",
        exportPdfList: "PDF Lista",
        exportPdfInventory: "PDF Lista + Inventario",
        newList: "Novo",
        generated: "Gerado",
        saved: "Lista de essenciais guardada.",
        savedLocal: "Guardado localmente. Entre pelo dashboard para guardar na base de dados partilhada.",
        templateSaved: "Modelo guardado.",
        templateSavedLocal: "Modelo guardado localmente.",
        templateInvalid: "Modelo invalido:",
        noGeneratedList: "Gere uma lista primeiro.",
        noSavedLists: "Nao existem listas de essenciais guardadas.",
        deleteConfirm: "Apagar esta lista de essenciais?",
        loadFailed: "Nao foi possivel carregar dados partilhados de essenciais.",
        pdfMissing: "O exportador PDF nao carregou. Atualize e tente novamente.",
        excelMissing: "O exportador Excel nao carregou. Atualize e tente novamente.",
        ready: "Pronto para gerar",
        readyHelp: "Introduza os detalhes do alojamento e adicione camas para calcular a lista para o proprietario."
    }
};

export const InventoryManager = {
    beds: [],
    db: null,
    properties: [],
    records: [],
    currentRecord: null,
    currentList: null,
    template: cloneEssentialsTemplate(),
    unsubscribe: [],
    statusTimer: null,

    init() {
        this.cacheDOM();
        this.upgradeEssentialsLayout();
        this.loadLocalTemplate();
        this.loadLocalRecords();
        this.bindEvents();
        this.renderBedOptions();
        this.renderBedList();
        this.renderSavedButtonState();
        this.renderTemplateEditor();
        this.renderPlaceholderCopy();
    },

    cacheDOM() {
        this.dom = {
            bedList: document.getElementById("bed-list"),
            addBedBtn: document.getElementById("add-bed-btn"),
            bedTypeSelect: document.getElementById("bed-type-select"),
            generateBtn: document.getElementById("generate-btn"),
            resultsContainer: document.getElementById("results-container"),
            resultsPlaceholder: document.getElementById("results-placeholder"),
            tableBody: document.getElementById("inventory-table-body"),
            csvWarning: document.getElementById("csv-warning"),
            csvUpload: document.getElementById("csv-upload"),
            exportBtn: document.getElementById("export-btn"),
            saveBtn: document.getElementById("save-list-btn"),
            summaryText: document.getElementById("summary-text"),
            actionButtons: document.getElementById("action-buttons"),
            savedListsModal: document.getElementById("saved-lists-modal"),
            savedListsContainer: document.getElementById("saved-lists-container"),
            closeSavedListsBtn: document.getElementById("close-saved-lists-btn"),
            loadSavedBtn: document.getElementById("load-saved-btn"),
            inputs: {
                listName: document.getElementById("list-name"),
                guests: document.getElementById("guest-capacity"),
                bathrooms: document.getElementById("num-bathrooms")
            }
        };
    },

    upgradeEssentialsLayout() {
        if (this.dom.csvWarning) {
            this.dom.csvWarning.className = "bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded-md shadow-sm";
            this.dom.csvWarning.innerHTML = `<p class="text-sm text-blue-800">${this.tr("csvDisabled")}</p>`;
            this.dom.csvWarning.classList.remove("hidden");
        }
        this.dom.csvUpload?.remove();

        const detailsBody = this.dom.inputs.listName?.closest(".space-y-4");
        if (detailsBody && !document.getElementById("property-select")) {
            detailsBody.insertAdjacentHTML("beforeend", `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${this.tr("assignProperty")}</label>
                    <select id="property-select" class="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-light focus:border-brand transition-all text-sm">
                        <option value="">${this.tr("noProperty")}</option>
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">${this.tr("bedrooms")}</label>
                        <input type="number" id="num-bedrooms" min="0" value="1" class="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-light focus:border-brand transition-all text-sm">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">${this.tr("exportLanguage")}</label>
                        <select id="essentials-language" class="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-light focus:border-brand transition-all text-sm">
                            <option value="en">English</option>
                            <option value="pt">Portugues</option>
                        </select>
                    </div>
                </div>
                <fieldset class="rounded-lg border border-gray-200 p-3">
                    <legend class="px-1 text-xs font-semibold uppercase text-gray-500">${this.tr("propertyFeatures")}</legend>
                    <label class="mt-2 flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" id="has-pool" class="rounded border-gray-300 text-brand focus:ring-brand">
                        ${this.tr("hasPool")}
                    </label>
                    <label class="mt-2 flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" id="needs-baby-items" class="rounded border-gray-300 text-brand focus:ring-brand">
                        ${this.tr("needsBabyItems")}
                    </label>
                </fieldset>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${this.tr("internalNotes")}</label>
                    <textarea id="internal-notes" rows="2" class="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-light focus:border-brand transition-all text-sm"></textarea>
                </div>
            `);
        }

        const bedControls = this.dom.bedTypeSelect?.closest(".flex");
        if (bedControls && !document.getElementById("custom-bed-size")) {
            bedControls.insertAdjacentHTML("afterend", `
                <input type="text" id="custom-bed-size" placeholder="${this.tr("customSize")} (e.g. 135x190cm)"
                    class="hidden mt-3 w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-light focus:border-brand transition-all text-sm">
            `);
        }

        if (this.dom.actionButtons && !document.getElementById("export-pdf-list-btn")) {
            this.dom.actionButtons.insertAdjacentHTML("beforeend", `
                <button id="new-list-btn" class="hidden text-sm px-4 py-2 bg-white hover:bg-gray-50 text-slate-700 border border-slate-200 rounded-md transition-colors">
                    <i class="fas fa-plus mr-1"></i> ${this.tr("newList")}
                </button>
                <button id="export-pdf-list-btn" class="hidden text-sm px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-md transition-colors shadow-sm">
                    <i class="fas fa-file-pdf mr-1"></i> ${this.tr("exportPdfList")}
                </button>
                <button id="export-pdf-inventory-btn" class="hidden text-sm px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors shadow-sm">
                    <i class="fas fa-clipboard-check mr-1"></i> ${this.tr("exportPdfInventory")}
                </button>
            `);
        }
        if (this.dom.exportBtn) this.dom.exportBtn.innerHTML = `<i class="fas fa-file-excel mr-1"></i> ${this.tr("exportExcel")}`;
        if (this.dom.saveBtn) this.dom.saveBtn.innerHTML = `<i class="fas fa-save mr-1"></i> ${this.tr("save")}`;

        const table = this.dom.tableBody?.closest("table");
        const headRow = table?.querySelector("thead tr");
        if (headRow) {
            headRow.innerHTML = `
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("category")}</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("item")}</th>
                <th class="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("ahQty")}</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("ownerQty")}</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("ownerBrand")}</th>
                <th class="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">${this.tr("ownerComments")}</th>
            `;
        }

        const panel = document.getElementById("essentials-panel");
        if (panel && !document.getElementById("essentials-template-panel")) {
            panel.insertAdjacentHTML("beforeend", `
                <section id="essentials-template-panel" class="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h2 class="text-lg font-semibold text-slate-900">${this.tr("templateTitle")}</h2>
                            <p class="mt-1 max-w-3xl text-sm text-slate-500">${this.tr("templateHelp")}</p>
                        </div>
                        <div class="flex gap-2">
                            <button id="reset-template-btn" type="button" class="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${this.tr("resetTemplate")}</button>
                            <button id="save-template-btn" type="button" class="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">${this.tr("saveTemplate")}</button>
                        </div>
                    </div>
                    <textarea id="essentials-template-editor" spellcheck="false" class="mt-4 h-80 w-full rounded-lg border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light"></textarea>
                    <div id="essentials-status" class="mt-3 min-h-6 text-sm text-slate-500"></div>
                </section>
            `);
        }

        this.dom.propertySelect = document.getElementById("property-select");
        this.dom.bedrooms = document.getElementById("num-bedrooms");
        this.dom.language = document.getElementById("essentials-language");
        this.dom.hasPool = document.getElementById("has-pool");
        this.dom.needsBabyItems = document.getElementById("needs-baby-items");
        this.dom.internalNotes = document.getElementById("internal-notes");
        this.dom.customBedSize = document.getElementById("custom-bed-size");
        this.dom.templateEditor = document.getElementById("essentials-template-editor");
        this.dom.saveTemplateBtn = document.getElementById("save-template-btn");
        this.dom.resetTemplateBtn = document.getElementById("reset-template-btn");
        this.dom.status = document.getElementById("essentials-status");
        this.dom.newListBtn = document.getElementById("new-list-btn");
        this.dom.exportPdfListBtn = document.getElementById("export-pdf-list-btn");
        this.dom.exportPdfInventoryBtn = document.getElementById("export-pdf-inventory-btn");
    },

    bindEvents() {
        this.dom.addBedBtn?.addEventListener("click", () => this.addBed());
        this.dom.generateBtn?.addEventListener("click", () => this.generateList());
        this.dom.exportBtn?.addEventListener("click", () => this.exportToExcel());
        this.dom.exportPdfListBtn?.addEventListener("click", () => this.exportToPdf(false));
        this.dom.exportPdfInventoryBtn?.addEventListener("click", () => this.exportToPdf(true));
        this.dom.newListBtn?.addEventListener("click", () => this.startNewList());
        this.dom.saveBtn?.addEventListener("click", () => this.saveCurrentRecord());
        this.dom.loadSavedBtn?.addEventListener("click", () => this.openSavedLists());
        this.dom.closeSavedListsBtn?.addEventListener("click", () => this.closeSavedLists());
        this.dom.saveTemplateBtn?.addEventListener("click", () => this.saveTemplateFromEditor());
        this.dom.resetTemplateBtn?.addEventListener("click", () => this.resetTemplate());
        this.dom.bedTypeSelect?.addEventListener("change", () => this.toggleCustomSize());
        this.dom.propertySelect?.addEventListener("change", () => this.applySelectedProperty());
        this.dom.language?.addEventListener("change", () => this.refreshCurrentList());
        this.dom.tableBody?.addEventListener("input", (event) => this.handleOwnerInventoryInput(event));
        window.addEventListener("click", (event) => {
            if (event.target === this.dom.savedListsModal) this.closeSavedLists();
        });
    },

    tr(key) {
        const lang = this.dom?.language?.value === "pt" ? "pt" : "en";
        return COPY[lang]?.[key] || COPY.en[key] || key;
    },

    connectFirestore(db) {
        if (!db || this.db === db) return;
        this.db = db;
        this.stopListening();
        this.startListening();
    },

    disconnectFirestore() {
        this.stopListening();
        this.db = null;
        this.loadLocalTemplate();
        this.loadLocalRecords();
        this.renderPropertyOptions();
    },

    stopListening() {
        this.unsubscribe.forEach((stop) => {
            try { stop(); } catch (error) { console.warn("[Essentials] unsubscribe failed:", error); }
        });
        this.unsubscribe = [];
    },

    startListening() {
        if (!this.db) return;
        const templateRef = doc(this.db, ...TEMPLATE_DOC_PATH);
        this.unsubscribe.push(onSnapshot(templateRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.data();
                this.template = cloneEssentialsTemplate(data.template || DEFAULT_ESSENTIALS_TEMPLATE);
                this.renderTemplateEditor();
            }
        }, (error) => this.setStatus(`${this.tr("loadFailed")} ${error.message}`, "danger")));

        this.unsubscribe.push(onSnapshot(collection(this.db, LISTS_COLLECTION), (snapshot) => {
            this.records = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
            this.renderSavedButtonState();
        }, (error) => this.setStatus(`${this.tr("loadFailed")} ${error.message}`, "danger")));

        this.unsubscribe.push(onSnapshot(collection(this.db, "properties"), (snapshot) => {
            this.properties = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
            this.renderPropertyOptions();
        }, (error) => this.setStatus(`${this.tr("loadFailed")} ${error.message}`, "danger")));
    },

    loadLocalTemplate() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOCAL_TEMPLATE_KEY) || "null");
            this.template = saved ? cloneEssentialsTemplate(saved) : cloneEssentialsTemplate(DEFAULT_ESSENTIALS_TEMPLATE);
        } catch (error) {
            console.warn("[Essentials] local template failed:", error);
            this.template = cloneEssentialsTemplate(DEFAULT_ESSENTIALS_TEMPLATE);
        }
        this.renderTemplateEditor();
    },

    loadLocalRecords() {
        try {
            const saved = JSON.parse(localStorage.getItem(LOCAL_LISTS_KEY) || "[]");
            this.records = Array.isArray(saved) ? saved : [];
        } catch (error) {
            console.warn("[Essentials] local lists failed:", error);
            this.records = [];
        }
        this.renderSavedButtonState();
    },

    saveLocalRecords() {
        localStorage.setItem(LOCAL_LISTS_KEY, JSON.stringify(this.records));
    },

    renderBedOptions() {
        if (!this.dom.bedTypeSelect) return;
        this.dom.bedTypeSelect.innerHTML = DEFAULT_BED_SIZE_OPTIONS.map((option) => {
            const label = `${getLocalized(option.label, "en", option.id)}${option.size ? ` (${option.size})` : ""}`;
            return `<option value="${option.id}">${this.escapeHtml(label)}</option>`;
        }).join("");
    },

    toggleCustomSize() {
        const isCustom = this.dom.bedTypeSelect?.value === "custom";
        this.dom.customBedSize?.classList.toggle("hidden", !isCustom);
        if (isCustom) this.dom.customBedSize?.focus();
    },

    addBed() {
        const option = DEFAULT_BED_SIZE_OPTIONS.find((entry) => entry.id === this.dom.bedTypeSelect?.value) || DEFAULT_BED_SIZE_OPTIONS[0];
        const customSize = this.dom.customBedSize?.value.trim() || "";
        this.beds.push({
            id: `bed-${Date.now()}-${this.beds.length}`,
            optionId: option.id,
            type: option.type,
            size: option.id === "custom" ? customSize : option.size,
            customSize
        });
        if (this.dom.customBedSize) this.dom.customBedSize.value = "";
        this.renderBedList();
    },

    removeBed(id) {
        this.beds = this.beds.filter((bed) => bed.id !== id);
        this.renderBedList();
        this.refreshCurrentList();
    },

    renderBedList() {
        if (!this.dom.bedList) return;
        this.dom.bedList.innerHTML = "";
        if (this.beds.length === 0) {
            this.dom.bedList.innerHTML = '<div class="text-sm text-gray-500 text-center py-2 italic">No beds added yet.</div>';
            return;
        }
        this.beds.forEach((bed) => {
            const option = DEFAULT_BED_SIZE_OPTIONS.find((entry) => entry.id === bed.optionId);
            const label = `${getLocalized(option?.label, "en", "Bed")} ${bed.size ? `- ${bed.size}` : ""}`;
            const div = document.createElement("div");
            div.className = "flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-200";
            div.innerHTML = `
                <span class="text-sm font-medium text-gray-700">${this.escapeHtml(label)}</span>
                <button class="text-red-500 hover:text-red-700 text-sm px-2" type="button" data-remove-bed="${this.escapeHtml(bed.id)}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            div.querySelector("[data-remove-bed]")?.addEventListener("click", () => this.removeBed(bed.id));
            this.dom.bedList.appendChild(div);
        });
    },

    readInputs() {
        const property = this.properties.find((entry) => entry.id === this.dom.propertySelect?.value);
        return {
            listName: this.dom.inputs.listName?.value || property?.name || "",
            propertyId: this.dom.propertySelect?.value || "",
            propertyName: property?.name || this.dom.inputs.listName?.value || "",
            language: this.dom.language?.value || "en",
            bedrooms: this.dom.bedrooms?.value || 0,
            guests: this.dom.inputs.guests?.value || 0,
            bathrooms: this.dom.inputs.bathrooms?.value || 0,
            hasPool: Boolean(this.dom.hasPool?.checked),
            needsBabyItems: Boolean(this.dom.needsBabyItems?.checked),
            internalNotes: this.dom.internalNotes?.value || "",
            beds: this.beds
        };
    },

    generateList() {
        const inputs = this.readInputs();
        if (!inputs.listName) {
            inputs.listName = "Essentials List";
            if (this.dom.inputs.listName) this.dom.inputs.listName.value = inputs.listName;
        }
        const existingInventory = this.currentRecord?.ownerInventory || {};
        const list = buildEssentialsList(inputs, this.template, existingInventory);
        const id = this.currentRecord?.id || `essentials-${Date.now()}`;
        this.currentRecord = {
            id,
            name: inputs.listName,
            propertyId: inputs.propertyId,
            inputs: list.inputs,
            templateSnapshot: cloneEssentialsTemplate(this.template),
            ownerInventory: this.buildOwnerInventoryFromRows(list.rows),
            updatedAt: new Date().toISOString()
        };
        this.currentList = list;
        this.renderResults();
    },

    startNewList() {
        this.currentRecord = null;
        this.currentList = null;
        this.beds = [];
        this.applyInputs({
            listName: "",
            propertyId: "",
            language: "en",
            bedrooms: 1,
            guests: 2,
            bathrooms: 1,
            hasPool: false,
            needsBabyItems: false,
            internalNotes: "",
            beds: []
        });
        if (this.dom.tableBody) this.dom.tableBody.innerHTML = "";
        this.dom.resultsContainer?.classList.add("hidden");
        this.dom.resultsPlaceholder?.classList.remove("hidden");
        [this.dom.saveBtn, this.dom.exportBtn, this.dom.newListBtn, this.dom.exportPdfListBtn, this.dom.exportPdfInventoryBtn].forEach((button) => button?.classList.add("hidden"));
        this.renderPlaceholderCopy();
        this.dom.inputs.listName?.focus();
    },

    refreshCurrentList() {
        if (!this.currentRecord) return;
        this.generateList();
    },

    buildOwnerInventoryFromRows(rows = []) {
        const ownerInventory = {};
        rows.forEach((row) => {
            ownerInventory[row.id] = {
                ownerQty: row.ownerQty || "",
                ownerBrand: row.ownerBrand || "",
                ownerComments: row.ownerComments || ""
            };
        });
        return ownerInventory;
    },

    renderResults() {
        if (!this.currentList) return;
        this.dom.resultsPlaceholder?.classList.add("hidden");
        this.dom.resultsContainer?.classList.remove("hidden");
        this.dom.actionButtons?.classList.remove("hidden");
        [this.dom.saveBtn, this.dom.exportBtn, this.dom.newListBtn, this.dom.exportPdfListBtn, this.dom.exportPdfInventoryBtn].forEach((button) => button?.classList.remove("hidden"));
        const inputs = this.currentList.inputs;
        if (this.dom.summaryText) {
            this.dom.summaryText.textContent = `${inputs.guests} Guests, ${inputs.beds.length} Beds, ${inputs.bathrooms} Bathrooms`;
        }
        if (!this.dom.tableBody) return;
        this.dom.tableBody.innerHTML = "";
        let lastCategory = "";
        this.currentList.rows.forEach((row) => {
            const showCategory = row.category !== lastCategory;
            lastCategory = row.category;
            const tr = document.createElement("tr");
            tr.className = showCategory ? "border-t-2 border-slate-200" : "";
            tr.innerHTML = `
                <td class="px-4 py-3 align-top text-sm font-semibold text-slate-800">${showCategory ? this.escapeHtml(row.category) : ""}</td>
                <td class="px-4 py-3 align-top text-sm text-slate-800">
                    ${row.group ? `<div class="text-xs font-semibold uppercase tracking-wide text-slate-400">${this.escapeHtml(row.group)}</div>` : ""}
                    <div>${this.escapeHtml(row.item)}</div>
                    ${row.ahComment ? `<div class="mt-1 text-xs text-slate-500">${this.escapeHtml(row.ahComment)}</div>` : ""}
                </td>
                <td class="px-4 py-3 align-top text-center text-sm font-bold text-slate-900 bg-slate-50">${this.escapeHtml(row.ahQuantity)}</td>
                <td class="px-4 py-3 align-top"><input class="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm" data-owner-field="ownerQty" data-row-id="${this.escapeHtml(row.id)}" value="${this.escapeHtml(row.ownerQty)}"></td>
                <td class="px-4 py-3 align-top"><input class="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm" data-owner-field="ownerBrand" data-row-id="${this.escapeHtml(row.id)}" value="${this.escapeHtml(row.ownerBrand)}"></td>
                <td class="px-4 py-3 align-top"><input class="w-56 rounded-md border border-slate-200 px-2 py-1 text-sm" data-owner-field="ownerComments" data-row-id="${this.escapeHtml(row.id)}" value="${this.escapeHtml(row.ownerComments)}"></td>
            `;
            this.dom.tableBody.appendChild(tr);
        });
    },

    handleOwnerInventoryInput(event) {
        const input = event.target.closest("[data-owner-field]");
        if (!input || !this.currentRecord || !this.currentList) return;
        const rowId = input.dataset.rowId;
        const field = input.dataset.ownerField;
        this.currentRecord.ownerInventory = this.currentRecord.ownerInventory || {};
        this.currentRecord.ownerInventory[rowId] = this.currentRecord.ownerInventory[rowId] || {};
        this.currentRecord.ownerInventory[rowId][field] = input.value;
        const row = this.currentList.rows.find((entry) => entry.id === rowId);
        if (row) row[field] = input.value;
    },

    async saveCurrentRecord() {
        if (!this.currentRecord || !this.currentList) {
            alert(this.tr("noGeneratedList"));
            return;
        }
        const payload = {
            ...this.currentRecord,
            name: this.currentList.inputs.listName,
            propertyId: this.currentList.inputs.propertyId,
            inputs: this.currentList.inputs,
            templateSnapshot: this.currentRecord.templateSnapshot || cloneEssentialsTemplate(this.template),
            ownerInventory: this.currentRecord.ownerInventory || {},
            updatedAt: new Date().toISOString()
        };
        if (this.db) {
            await setDoc(doc(this.db, LISTS_COLLECTION, payload.id), {
                ...payload,
                updatedAt: serverTimestamp()
            }, { merge: true });
            this.setStatus(this.tr("saved"), "success");
        } else {
            this.records = [payload, ...this.records.filter((record) => record.id !== payload.id)];
            this.saveLocalRecords();
            this.renderSavedButtonState();
            this.setStatus(this.tr("savedLocal"), "info");
        }
    },

    openSavedLists() {
        if (!this.dom.savedListsContainer) return;
        this.dom.savedListsContainer.innerHTML = "";
        if (this.records.length === 0) {
            this.dom.savedListsContainer.innerHTML = `<p class="text-gray-500 text-center py-4">${this.tr("noSavedLists")}</p>`;
        } else {
            this.records
                .slice()
                .sort((a, b) => new Date(b.updatedAt?.toDate?.() || b.updatedAt || 0) - new Date(a.updatedAt?.toDate?.() || a.updatedAt || 0))
                .forEach((record) => {
                    const date = this.formatDate(record.updatedAt);
                    const item = document.createElement("div");
                    item.className = "flex justify-between items-center p-3 hover:bg-gray-50 border rounded-md cursor-pointer transition-colors";
                    item.innerHTML = `
                        <div class="flex-1" data-load-list="${this.escapeHtml(record.id)}">
                            <h4 class="font-medium text-gray-800">${this.escapeHtml(record.name || record.inputs?.listName || "Essentials List")}</h4>
                            <p class="text-xs text-gray-500">${this.escapeHtml(date)} - ${this.escapeHtml(record.inputs?.guests || 0)} Guests, ${this.escapeHtml(record.inputs?.beds?.length || 0)} Beds</p>
                        </div>
                        <button class="text-red-400 hover:text-red-600 p-2" data-delete-list="${this.escapeHtml(record.id)}">
                            <i class="fas fa-trash"></i>
                        </button>
                    `;
                    item.querySelector("[data-load-list]")?.addEventListener("click", () => this.loadList(record.id));
                    item.querySelector("[data-delete-list]")?.addEventListener("click", (event) => {
                        event.stopPropagation();
                        this.deleteList(record.id);
                    });
                    this.dom.savedListsContainer.appendChild(item);
                });
        }
        this.dom.savedListsModal?.classList.remove("hidden");
    },

    closeSavedLists() {
        this.dom.savedListsModal?.classList.add("hidden");
    },

    async deleteList(id) {
        if (!confirm(this.tr("deleteConfirm"))) return;
        if (this.db) {
            await deleteDoc(doc(this.db, LISTS_COLLECTION, id));
        } else {
            this.records = this.records.filter((record) => record.id !== id);
            this.saveLocalRecords();
            this.openSavedLists();
        }
    },

    loadList(id) {
        const record = this.records.find((entry) => entry.id === id);
        if (!record) return;
        this.currentRecord = {
            ...record,
            ownerInventory: record.ownerInventory || {}
        };
        this.applyInputs(record.inputs || {});
        const template = record.templateSnapshot || this.template;
        this.currentList = buildEssentialsList(record.inputs || {}, template, record.ownerInventory || {});
        this.renderResults();
        this.closeSavedLists();
    },

    applyInputs(inputs = {}) {
        if (this.dom.inputs.listName) this.dom.inputs.listName.value = inputs.listName || inputs.propertyName || "";
        if (this.dom.inputs.guests) this.dom.inputs.guests.value = inputs.guests ?? 0;
        if (this.dom.inputs.bathrooms) this.dom.inputs.bathrooms.value = inputs.bathrooms ?? 0;
        if (this.dom.bedrooms) this.dom.bedrooms.value = inputs.bedrooms ?? 0;
        if (this.dom.propertySelect) this.dom.propertySelect.value = inputs.propertyId || "";
        if (this.dom.language) this.dom.language.value = inputs.language || "en";
        if (this.dom.hasPool) this.dom.hasPool.checked = Boolean(inputs.hasPool);
        if (this.dom.needsBabyItems) this.dom.needsBabyItems.checked = Boolean(inputs.needsBabyItems);
        if (this.dom.internalNotes) this.dom.internalNotes.value = inputs.internalNotes || "";
        this.beds = Array.isArray(inputs.beds) ? inputs.beds : [];
        this.renderBedList();
    },

    renderPropertyOptions() {
        if (!this.dom.propertySelect) return;
        const selected = this.dom.propertySelect.value;
        const options = [`<option value="">${this.tr("noProperty")}</option>`].concat(
            this.properties
                .slice()
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((property) => `<option value="${this.escapeHtml(property.id)}">${this.escapeHtml(property.name || property.id)}</option>`)
        );
        this.dom.propertySelect.innerHTML = options.join("");
        if (selected && this.properties.some((property) => property.id === selected)) this.dom.propertySelect.value = selected;
    },

    applySelectedProperty() {
        const property = this.properties.find((entry) => entry.id === this.dom.propertySelect?.value);
        if (!property) return;
        if (this.dom.inputs.listName) this.dom.inputs.listName.value = property.name || "";
        if (this.dom.bedrooms && property.rooms != null) this.dom.bedrooms.value = property.rooms;
        if (this.dom.inputs.bathrooms && property.bathrooms != null) this.dom.inputs.bathrooms.value = property.bathrooms;
    },

    renderSavedButtonState() {
        if (!this.dom.loadSavedBtn) return;
        const count = this.records.length;
        this.dom.loadSavedBtn.innerHTML = `<i class="fas fa-history mr-1"></i> Saved Lists${count ? ` (${count})` : ""}`;
    },

    renderTemplateEditor() {
        if (this.dom?.templateEditor) {
            this.dom.templateEditor.value = JSON.stringify(this.template, null, 2);
        }
    },

    async saveTemplateFromEditor() {
        try {
            const parsed = JSON.parse(this.dom.templateEditor?.value || "{}");
            const errors = validateEssentialsTemplate(parsed);
            if (errors.length) {
                this.setStatus(`${this.tr("templateInvalid")} ${errors.join(" ")}`, "danger");
                return;
            }
            this.template = cloneEssentialsTemplate(parsed);
            if (this.db) {
                await setDoc(doc(this.db, ...TEMPLATE_DOC_PATH), {
                    template: this.template,
                    updatedAt: serverTimestamp()
                }, { merge: true });
                this.setStatus(this.tr("templateSaved"), "success");
            } else {
                localStorage.setItem(LOCAL_TEMPLATE_KEY, JSON.stringify(this.template));
                this.setStatus(this.tr("templateSavedLocal"), "info");
            }
            this.refreshCurrentList();
        } catch (error) {
            this.setStatus(`${this.tr("templateInvalid")} ${error.message}`, "danger");
        }
    },

    resetTemplate() {
        this.template = cloneEssentialsTemplate(DEFAULT_ESSENTIALS_TEMPLATE);
        this.renderTemplateEditor();
        this.refreshCurrentList();
    },

    exportToExcel() {
        if (!this.currentList) {
            alert(this.tr("noGeneratedList"));
            return;
        }
        if (!window.XLSX) {
            alert(this.tr("excelMissing"));
            return;
        }
        const rows = this.buildWorkbookRows(true);
        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        ws["!cols"] = [
            { wch: 22 },
            { wch: 38 },
            { wch: 12 },
            { wch: 28 },
            { wch: 12 },
            { wch: 20 },
            { wch: 34 }
        ];
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, "Essentials List");
        window.XLSX.writeFile(wb, `${this.baseFilename()}.xlsx`);
    },

    async exportToPdf(includeInventory = false) {
        if (!this.currentList) {
            alert(this.tr("noGeneratedList"));
            return;
        }
        const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
        if (!jsPDF) {
            alert(this.tr("pdfMissing"));
            return;
        }
        const docPdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
        const lang = this.currentList.inputs.language;
        const accent = [233, 75, 90];
        const logo = await this.loadLogoDataUrl();
        const logoWidth = 46;
        const logoHeight = 12.3;
        if (logo) docPdf.addImage(logo, "PNG", 14, 11.5, logoWidth, logoHeight);
        docPdf.setTextColor(20, 24, 35);
        docPdf.setFontSize(18);
        docPdf.text(getLocalized(this.currentList.templateSnapshot.title, lang, "AL Essentials List"), logo ? 66 : 14, 20);
        docPdf.setFontSize(11);
        docPdf.setTextColor(90, 98, 110);
        docPdf.text(this.currentList.inputs.listName || "Property", logo ? 66 : 14, 27);
        docPdf.setDrawColor(...accent);
        docPdf.setLineWidth(0.6);
        docPdf.line(14, 34, 196, 34);

        const detailLabels = lang === "pt"
            ? ["Quartos", "Capacidade", "Casas de banho", "Camas"]
            : ["Bedrooms", "Capacity", "Bathrooms", "Beds"];
        const details = [
            [detailLabels[0], this.currentList.inputs.bedrooms],
            [detailLabels[1], this.currentList.inputs.guests],
            [detailLabels[2], this.currentList.inputs.bathrooms],
            [detailLabels[3], this.currentList.inputs.beds.map((bed) => bed.size).filter(Boolean).join(", ") || "-"]
        ];
        docPdf.autoTable?.({
            startY: 39,
            body: details,
            theme: "plain",
            styles: { fontSize: 9, cellPadding: 1.5 },
            columnStyles: { 0: { fontStyle: "bold", textColor: [90, 98, 110], cellWidth: 26 }, 1: { cellWidth: 150 } }
        });

        let y = docPdf.lastAutoTable?.finalY ? docPdf.lastAutoTable.finalY + 6 : 58;
        this.groupRowsByCategory(this.currentList.rows).forEach((section) => {
            if (y > 250) {
                docPdf.addPage();
                y = 18;
            }
            docPdf.setFillColor(...accent);
            docPdf.setTextColor(255, 255, 255);
            docPdf.setFontSize(11);
            docPdf.roundedRect(14, y, 182, 7, 2, 2, "F");
            docPdf.text(section.category, 16, y + 5);
            y += 8;
            const head = includeInventory
                ? [
                    [
                        {
                            content: lang === "pt" ? "Essenciais Atlantic Holiday" : "Atlantic Holiday Essentials",
                            colSpan: 3,
                            styles: { fillColor: [255, 241, 242], textColor: [159, 18, 57], halign: "center", fontStyle: "bold" }
                        },
                        {
                            content: lang === "pt" ? "Inventario do proprietario - preencher a mao" : "Owner Inventory - fill by hand",
                            colSpan: 3,
                            styles: { fillColor: [233, 75, 90], textColor: [255, 255, 255], halign: "center", fontStyle: "bold" }
                        }
                    ],
                    lang === "pt" ? ["Item", "Qtd. AH", "Comentarios AH", "Qtd. Proprietario", "Marca", "Comentarios"] : ["Item", "AH Qty.", "AH Comments", "Owner Qty.", "Brand", "Owner Comments"]
                ]
                : [lang === "pt" ? ["Item", "Qtd. AH", "Comentarios AH"] : ["Item", "AH Qty.", "AH Comments"]];
            const body = section.rows.map((row) => includeInventory
                ? [this.rowItemLabel(row), row.ahQuantity, row.ahComment, "", "", ""]
                : [this.rowItemLabel(row), row.ahQuantity, row.ahComment]);
            if (docPdf.autoTable) {
                docPdf.autoTable({
                    startY: y,
                    head,
                    body,
                    theme: "grid",
                    styles: { fontSize: 8, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1, minCellHeight: includeInventory ? 7 : 0 },
                    headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: "bold" },
                    columnStyles: includeInventory
                        ? { 0: { cellWidth: 45 }, 1: { cellWidth: 16, halign: "center" }, 2: { cellWidth: 29 }, 3: { cellWidth: 18 }, 4: { cellWidth: 26 }, 5: { cellWidth: 48 } }
                        : { 0: { cellWidth: 96 }, 1: { cellWidth: 22, halign: "center" }, 2: { cellWidth: 64 } },
                    margin: { left: 14, right: 14 },
                    didDrawCell: (data) => {
                        if (!includeInventory || data.section === "head" && data.row.index === 0) return;
                        if (data.column.index === 2) {
                            const x = data.cell.x + data.cell.width;
                            docPdf.setDrawColor(...accent);
                            docPdf.setLineWidth(0.35);
                            docPdf.line(x, data.cell.y, x, data.cell.y + data.cell.height);
                        }
                    }
                });
                y = docPdf.lastAutoTable.finalY + 6;
            }
        });

        if (this.currentList.notes.length) {
            if (y > 235) {
                docPdf.addPage();
                y = 18;
            }
            docPdf.setTextColor(15, 23, 42);
            docPdf.setFontSize(12);
            docPdf.text(lang === "pt" ? "Notas" : "Notes", 14, y);
            y += 6;
            docPdf.setFontSize(9);
            this.currentList.notes.forEach(({ note }) => {
                const lines = docPdf.splitTextToSize(`- ${note}`, 180);
                docPdf.text(lines, 14, y);
                y += lines.length * 4.5;
            });
        }

        docPdf.save(`${this.baseFilename()}${includeInventory ? " - Inventory Form" : ""}.pdf`);
    },

    buildWorkbookRows(includeInventory = true) {
        const lang = this.currentList.inputs.language;
        const labels = lang === "pt"
            ? {
                accommodation: "Alojamento",
                value: "Valor",
                bedrooms: "Numero de quartos",
                capacity: "Capacidade",
                bathrooms: "Casas de banho",
                beds: "Camas",
                category: "Categoria",
                items: "Items",
                ahQty: "Qtd. AH",
                ahComments: "Comentarios AH",
                ownerQty: "Qtd. Proprietario",
                brand: "Marca",
                ownerComments: "Comentarios do proprietario",
                notes: "Notas"
            }
            : {
                accommodation: "Accommodation",
                value: "Value",
                bedrooms: "Number of Bedrooms",
                capacity: "Capacity",
                bathrooms: "Full Bathrooms",
                beds: "Beds",
                category: "Category",
                items: "Items",
                ahQty: "AH Qty.",
                ahComments: "AH Comments",
                ownerQty: "Owner Qty.",
                brand: "Brand",
                ownerComments: "Owner Comments",
                notes: "Notes"
            };
        const rows = [
            ["Atlantic Holiday"],
            [getLocalized(this.currentList.templateSnapshot.title, lang, "AL Essentials List")],
            [this.currentList.inputs.listName],
            [],
            [labels.accommodation, labels.value],
            [labels.bedrooms, this.currentList.inputs.bedrooms],
            [labels.capacity, this.currentList.inputs.guests],
            [labels.bathrooms, this.currentList.inputs.bathrooms],
            [labels.beds, this.currentList.inputs.beds.map((bed) => bed.size).filter(Boolean).join(", ")],
            []
        ];
        this.groupRowsByCategory(this.currentList.rows).forEach((section) => {
            rows.push([section.category]);
            rows.push(includeInventory
                ? [labels.category, labels.items, labels.ahQty, labels.ahComments, labels.ownerQty, labels.brand, labels.ownerComments]
                : [labels.category, labels.items, labels.ahQty, labels.ahComments]);
            section.rows.forEach((row) => {
                rows.push(includeInventory
                    ? [row.group, row.item, row.ahQuantity, row.ahComment, row.ownerQty, row.ownerBrand, row.ownerComments]
                    : [row.group, row.item, row.ahQuantity, row.ahComment]);
            });
            rows.push([]);
        });
        if (this.currentList.notes.length) {
            rows.push([labels.notes]);
            this.currentList.notes.forEach(({ note }) => rows.push([note]));
        }
        return rows;
    },

    groupRowsByCategory(rows = []) {
        const groups = [];
        rows.forEach((row) => {
            let group = groups[groups.length - 1];
            if (!group || group.category !== row.category) {
                group = { category: row.category, rows: [] };
                groups.push(group);
            }
            group.rows.push(row);
        });
        return groups;
    },

    rowItemLabel(row) {
        return row.group ? `${row.group} - ${row.item}` : row.item;
    },

    baseFilename() {
        const name = this.currentList?.inputs?.listName || "Property";
        return sanitizeFilename(`Essentials List - ${name}`);
    },

    async loadLogoDataUrl() {
        return new Promise((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = 720;
                    canvas.height = 192;
                    const context = canvas.getContext("2d");
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/png"));
                } catch (error) {
                    resolve(null);
                }
            };
            image.onerror = () => resolve(null);
            image.src = "assets/atlantic-holiday-logo.svg";
        });
    },

    setStatus(message, tone = "info") {
        if (!this.dom.status) return;
        const toneClass = {
            success: "text-emerald-700",
            danger: "text-red-700",
            info: "text-slate-600"
        }[tone] || "text-slate-600";
        this.dom.status.className = `mt-3 min-h-6 text-sm ${toneClass}`;
        this.dom.status.textContent = message;
        clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => {
            if (this.dom.status) this.dom.status.textContent = "";
        }, 5000);
    },

    renderPlaceholderCopy() {
        if (!this.dom.resultsPlaceholder) return;
        const title = this.dom.resultsPlaceholder.querySelector(".text-lg");
        const help = this.dom.resultsPlaceholder.querySelector(".text-sm");
        if (title) title.textContent = this.tr("ready");
        if (help) help.textContent = this.tr("readyHelp");
    },

    formatDate(value) {
        const date = value?.toDate?.() || (value ? new Date(value) : null);
        if (!date || Number.isNaN(date.getTime())) return "";
        return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    },

    escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

if (typeof window !== "undefined") {
    window.InventoryManager = InventoryManager;
}
