import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getDownloadURL,
    ref as storageRef,
    uploadBytes
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import {
    createMailtoUrl,
    createPlenoHotelEmail,
    filterPlenoHotelRecords,
    formatCurrency,
    getRecordIdForName,
    mergePlenoHotelRecords,
    normalizePlenoHotelRecord,
    parseBedSizes,
    parseMoney,
    parsePlenoHotelWorkbook,
    parseSpreadsheetDate,
    PLENOHOTEL_STATUS_LABELS,
    PLENOHOTEL_WORKFLOW_STAGES,
    summarizePlenoHotelRecords
} from "./plenohotel-utils.js";
import { i18n } from "../../core/i18n.js";

const PLENOHOTEL_COPY = {
    en: {
        statusLabels: {
            yes: "Yes",
            no: "No",
            partial: "Partial",
            later: "Later",
            ask: "Ask",
            pending: "Pending",
            unknown: "Unknown"
        },
        stages: {
            notNeeded: "No action",
            needsQuestion: "Needs question",
            waitingAuthorization: "Waiting authorization",
            needsQuote: "Needs quote/order",
            waitingDelivery: "Waiting delivery",
            waitingBilling: "Waiting billing",
            complete: "Complete"
        },
        reminders: {
            confirmNeed: "Confirm if linen/towels are needed.",
            collectBeds: "Collect bed sizes.",
            askOwner: "Ask the owner for authorization.",
            sendQuote: "Send quote request to PlenoHotel.",
            followDelivery: "Follow up delivery with PlenoHotel.",
            chargeOwner: "Charge the owner, including commission.",
            setCommission: "Set commission before charging the owner."
        },
        messages: {
            firestoreUnavailable: "Firestore is not available on this page. Open from the authenticated dashboard and try again.",
            propertyRequired: "Property name is required.",
            saved: "PlenoHotel record saved.",
            savedLocal: "Record saved in local preview mode.",
            savedAddAnother: "Record saved. New blank property ready.",
            deleted: "Record deleted.",
            deleteFailed: "Could not delete this record.",
            saveFailed: "Could not save this record.",
            loadFailed: "Could not load PlenoHotel records from Firestore.",
            parserMissing: "The Excel parser did not load. Refresh and try again.",
            noRows: "No PlenoHotel rows were found in that workbook.",
            importedLocal: "Imported locally, but Firestore is unavailable so the app source of truth was not updated.",
            imported: "Imported {{count}} PlenoHotel records.",
            importFailed: "Could not import that workbook.",
            uploadNeedsAuth: "File upload needs an authenticated dashboard session. Paste a shared link instead for now.",
            saveNameBeforeAttach: "Save the property name before attaching files.",
            quotationAttached: "Quotation attached.",
            invoiceAttached: "Invoice attached.",
            uploadFailed: "Could not upload that attachment. Check Firebase Storage permissions or paste a shared link.",
            exporterMissing: "The Excel exporter did not load. Refresh and try again.",
            copied: "Email copied to clipboard.",
            copyFailed: "Could not copy email."
        },
        ui: {
            heading: "PlenoHotel",
            sync: "{{total}} properties tracked. {{waiting}} waiting to be charged to owners.",
            localMode: "Local preview mode. Sign in through the dashboard to update the shared source of truth.",
            addManual: "Add manually",
            importWorkbook: "Import workbook",
            export: "Export",
            propertyTracker: "Property tracker",
            trackerDescription: "Shared PlenoHotel status by property name.",
            workflowQueue: "Workflow queue",
            workflowDescription: "Filter properties by their current PlenoHotel stage.",
            allProperties: "All properties",
            searchPlaceholder: "Search property, quote, notes",
            allStages: "All stages",
            noRecords: "No PlenoHotel records match the current filters.",
            addPropertyManual: "Add a property manually",
            property: "Property",
            stage: "Stage",
            quote: "Quote",
            bedSizesColumn: "Bed sizes",
            ownerCharge: "Owner charge",
            noLocation: "No location",
            reminderSingle: "reminder",
            reminderPlural: "reminders",
            noQuote: "No quote",
            entries: "entries",
            missing: "Missing",
            needBedSizes: "Need bed sizes",
            commissionTracked: "Commission tracked",
            manualEntry: "Manual entry",
            manualHelp: "Start here to add a PlenoHotel property without importing a spreadsheet.",
            delete: "Delete",
            saveRecord: "Save record",
            saveAddAnother: "Save & add another",
            prepareEmail: "Prepare email",
            hideEmailTools: "Hide email tools",
            formSectionsHelp: "Open the section you need. Collapsed sections keep their saved values.",
            noOpenReminders: "No open reminders for this property.",
            reminders: "Reminders",
            propertyAndBeds: "Property and beds",
            propertyName: "Property name",
            location: "Location",
            bedSizesOnePerLine: "Bed sizes, one per line",
            bedPlaceholder: "Use one line per bed type or room.\nStart with quantity, then mattress size in centimeters.\n\nExamples:\n1 - 160x200cm\n2 - 90x200cm\n1 - 140x200cm sofa bed\n\nIf sizes are not known yet, leave this empty or partial and keep \"Bed sizes known?\" as Pending, Partial, Ask, or Unknown.",
            workflow: "Workflow",
            needed: "Needed?",
            ownerAsked: "Owner asked?",
            authorized: "Authorized?",
            bedSizesKnown: "Bed sizes known?",
            bought: "Bought?",
            quoteApproved: "Quote approved?",
            delivered: "Delivered?",
            chargedOwner: "Charged to owner?",
            quoteAndNotes: "Quote and notes",
            emailSent: "Email sent",
            quoteDate: "Quote date",
            quoteNumber: "Quote number",
            purchaseDate: "Purchase date",
            quoteNotes: "Quote notes",
            internalNotes: "Internal notes",
            ownerChargeAndCommission: "Owner charge and commission",
            plenoSubtotal: "PlenoHotel subtotal",
            commissionPercent: "Commission %",
            commissionAmount: "Commission amount",
            totalToChargeOwner: "Total to charge owner",
            quotationsAndInvoices: "Quotations and invoices",
            quotationLinks: "Quotation links",
            quotationLinksPlaceholder: "Paste Google Drive or email attachment links",
            invoiceLinks: "Invoice links",
            uploadQuotation: "Upload quotation",
            uploadInvoice: "Upload invoice",
            invoiceReference: "PlenoHotel invoice reference",
            emailPreparation: "Email preparation",
            generate: "Generate",
            supplierEmail: "Supplier email",
            ownerEmail: "Owner email",
            requestQuote: "Request quote from PlenoHotel",
            askOwnerAuthorization: "Ask owner authorization",
            followUpDelivery: "Follow up delivery",
            to: "To",
            subject: "Subject",
            copyEmail: "Copy email",
            openMailApp: "Open mail app",
            optionalEmail: "Optional. Use this only when you need to draft a message.",
            openEmailTools: "Open email tools"
        }
    },
    pt: {
        statusLabels: {
            yes: "Sim",
            no: "N\u00e3o",
            partial: "Parcial",
            later: "Mais tarde",
            ask: "Perguntar",
            pending: "Pendente",
            unknown: "Desconhecido"
        },
        stages: {
            notNeeded: "Sem a\u00e7\u00e3o",
            needsQuestion: "Confirmar necessidade",
            waitingAuthorization: "A aguardar autoriza\u00e7\u00e3o",
            needsQuote: "Pedir or\u00e7amento/encomendar",
            waitingDelivery: "A aguardar entrega",
            waitingBilling: "A aguardar cobran\u00e7a",
            complete: "Conclu\u00eddo"
        },
        reminders: {
            confirmNeed: "Confirmar se s\u00e3o necess\u00e1rias roupas de cama/toalhas.",
            collectBeds: "Recolher tamanhos das camas.",
            askOwner: "Pedir autoriza\u00e7\u00e3o ao propriet\u00e1rio.",
            sendQuote: "Enviar pedido de or\u00e7amento \u00e0 PlenoHotel.",
            followDelivery: "Fazer seguimento da entrega com a PlenoHotel.",
            chargeOwner: "Cobrar ao propriet\u00e1rio, incluindo a comiss\u00e3o.",
            setCommission: "Definir a comiss\u00e3o antes de cobrar ao propriet\u00e1rio."
        },
        messages: {
            firestoreUnavailable: "O Firestore n\u00e3o est\u00e1 dispon\u00edvel nesta p\u00e1gina. Abra a partir do painel autenticado e tente novamente.",
            propertyRequired: "O nome do alojamento \u00e9 obrigat\u00f3rio.",
            saved: "Registo PlenoHotel guardado.",
            savedLocal: "Registo guardado em modo de pr\u00e9-visualiza\u00e7\u00e3o local.",
            savedAddAnother: "Registo guardado. Novo alojamento em branco pronto.",
            deleted: "Registo eliminado.",
            deleteFailed: "N\u00e3o foi poss\u00edvel eliminar este registo.",
            saveFailed: "N\u00e3o foi poss\u00edvel guardar este registo.",
            loadFailed: "N\u00e3o foi poss\u00edvel carregar os registos PlenoHotel do Firestore.",
            parserMissing: "O leitor de Excel n\u00e3o carregou. Atualize a p\u00e1gina e tente novamente.",
            noRows: "N\u00e3o foram encontradas linhas PlenoHotel neste ficheiro.",
            importedLocal: "Importado localmente, mas o Firestore n\u00e3o est\u00e1 dispon\u00edvel, por isso a fonte de verdade da app n\u00e3o foi atualizada.",
            imported: "{{count}} registos PlenoHotel importados.",
            importFailed: "N\u00e3o foi poss\u00edvel importar esse ficheiro.",
            uploadNeedsAuth: "O carregamento de ficheiros precisa de uma sess\u00e3o autenticada. Por agora, cole um link partilhado.",
            saveNameBeforeAttach: "Guarde o nome do alojamento antes de anexar ficheiros.",
            quotationAttached: "Or\u00e7amento anexado.",
            invoiceAttached: "Fatura anexada.",
            uploadFailed: "N\u00e3o foi poss\u00edvel carregar esse anexo. Verifique as permiss\u00f5es do Firebase Storage ou cole um link partilhado.",
            exporterMissing: "O exportador de Excel n\u00e3o carregou. Atualize a p\u00e1gina e tente novamente.",
            copied: "Email copiado para a \u00e1rea de transfer\u00eancia.",
            copyFailed: "N\u00e3o foi poss\u00edvel copiar o email."
        },
        ui: {
            heading: "PlenoHotel",
            sync: "{{total}} alojamentos registados. {{waiting}} a aguardar cobran\u00e7a ao propriet\u00e1rio.",
            localMode: "Modo de pr\u00e9-visualiza\u00e7\u00e3o local. Inicie sess\u00e3o pelo painel para atualizar a fonte de verdade partilhada.",
            addManual: "Adicionar manualmente",
            importWorkbook: "Importar ficheiro",
            export: "Exportar",
            propertyTracker: "Acompanhamento por alojamento",
            trackerDescription: "Estado PlenoHotel partilhado por nome do alojamento.",
            workflowQueue: "Fila de trabalho",
            workflowDescription: "Filtre os alojamentos pelo estado atual PlenoHotel.",
            allProperties: "Todos os alojamentos",
            searchPlaceholder: "Pesquisar alojamento, or\u00e7amento, notas",
            allStages: "Todos os estados",
            noRecords: "Nenhum registo PlenoHotel corresponde aos filtros atuais.",
            addPropertyManual: "Adicionar alojamento manualmente",
            property: "Alojamento",
            stage: "Estado",
            quote: "Or\u00e7amento",
            bedSizesColumn: "Tamanhos das camas",
            ownerCharge: "Cobran\u00e7a ao propriet\u00e1rio",
            noLocation: "Sem localiza\u00e7\u00e3o",
            reminderSingle: "lembrete",
            reminderPlural: "lembretes",
            noQuote: "Sem or\u00e7amento",
            entries: "entradas",
            missing: "Em falta",
            needBedSizes: "Faltam tamanhos das camas",
            commissionTracked: "Comiss\u00e3o registada",
            manualEntry: "Entrada manual",
            manualHelp: "Comece aqui para adicionar um alojamento PlenoHotel sem importar uma folha de c\u00e1lculo.",
            delete: "Eliminar",
            saveRecord: "Guardar registo",
            saveAddAnother: "Guardar e adicionar outro",
            prepareEmail: "Preparar email",
            hideEmailTools: "Ocultar ferramentas de email",
            formSectionsHelp: "Abra apenas a sec\u00e7\u00e3o que precisa. As sec\u00e7\u00f5es fechadas mant\u00eam os valores guardados.",
            noOpenReminders: "Sem lembretes em aberto para este alojamento.",
            reminders: "Lembretes",
            propertyAndBeds: "Alojamento e camas",
            propertyName: "Nome do alojamento",
            location: "Localiza\u00e7\u00e3o",
            bedSizesOnePerLine: "Tamanhos das camas, um por linha",
            bedPlaceholder: "Use uma linha por tipo de cama ou quarto.\nComece pela quantidade e depois o tamanho do colch\u00e3o em cent\u00edmetros.\n\nExemplos:\n1 - 160x200cm\n2 - 90x200cm\n1 - sof\u00e1-cama 140x200cm\n\nSe ainda n\u00e3o souber os tamanhos, deixe vazio ou parcial e mantenha \"Tamanhos das camas conhecidos?\" como Pendente, Parcial, Perguntar ou Desconhecido.",
            workflow: "Fluxo de trabalho",
            needed: "Necess\u00e1rio?",
            ownerAsked: "Propriet\u00e1rio questionado?",
            authorized: "Autorizado?",
            bedSizesKnown: "Tamanhos das camas conhecidos?",
            bought: "Comprado?",
            quoteApproved: "Or\u00e7amento aprovado?",
            delivered: "Entregue?",
            chargedOwner: "Cobrado ao propriet\u00e1rio?",
            quoteAndNotes: "Or\u00e7amento e notas",
            emailSent: "Email enviado",
            quoteDate: "Data do or\u00e7amento",
            quoteNumber: "N.\u00ba do or\u00e7amento",
            purchaseDate: "Data da compra",
            quoteNotes: "Notas do or\u00e7amento",
            internalNotes: "Notas internas",
            ownerChargeAndCommission: "Cobran\u00e7a ao propriet\u00e1rio e comiss\u00e3o",
            plenoSubtotal: "Subtotal PlenoHotel",
            commissionPercent: "Comiss\u00e3o %",
            commissionAmount: "Valor da comiss\u00e3o",
            totalToChargeOwner: "Total a cobrar ao propriet\u00e1rio",
            quotationsAndInvoices: "Or\u00e7amentos e faturas",
            quotationLinks: "Links dos or\u00e7amentos",
            quotationLinksPlaceholder: "Cole links do Google Drive ou anexos de email",
            invoiceLinks: "Links das faturas",
            uploadQuotation: "Carregar or\u00e7amento",
            uploadInvoice: "Carregar fatura",
            invoiceReference: "Refer\u00eancia da fatura PlenoHotel",
            emailPreparation: "Prepara\u00e7\u00e3o de email",
            generate: "Gerar",
            supplierEmail: "Email do fornecedor",
            ownerEmail: "Email do propriet\u00e1rio",
            requestQuote: "Pedir or\u00e7amento \u00e0 PlenoHotel",
            askOwnerAuthorization: "Pedir autoriza\u00e7\u00e3o ao propriet\u00e1rio",
            followUpDelivery: "Fazer seguimento da entrega",
            to: "Para",
            subject: "Assunto",
            copyEmail: "Copiar email",
            openMailApp: "Abrir app de email",
            optionalEmail: "Opcional. Use apenas quando precisar de preparar uma mensagem.",
            openEmailTools: "Abrir ferramentas de email"
        }
    }
};

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function statusOptions(selected, labels = PLENOHOTEL_STATUS_LABELS) {
    return Object.entries(PLENOHOTEL_STATUS_LABELS)
        .map(([value]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${labels[value] || value}</option>`)
        .join("");
}

function stageToneClass(stageKey) {
    const tone = PLENOHOTEL_WORKFLOW_STAGES[stageKey]?.tone || "slate";
    const classes = {
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        orange: "border-orange-200 bg-orange-50 text-orange-800",
        sky: "border-sky-200 bg-sky-50 text-sky-800",
        indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
        rose: "border-rose-200 bg-rose-50 text-rose-800",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
        slate: "border-slate-200 bg-slate-50 text-slate-700"
    };
    return classes[tone] || classes.slate;
}

function todayIsoDate() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function linesToLinks(value) {
    return String(value || "")
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url) => ({ url, label: url }));
}

function linksToLines(links) {
    return Array.isArray(links) ? links.map((link) => link.url || link.label || "").filter(Boolean).join("\n") : "";
}

function bedSizesToText(bedSizes) {
    return Array.isArray(bedSizes) ? bedSizes.map((entry) => entry.raw).filter(Boolean).join("\n") : "";
}

export class PlenoHotelManager {
    constructor(db = null, storage = null) {
        this.db = db;
        this.storage = storage;
        this.records = [];
        this.unsubscribe = null;
        this.query = "";
        this.stage = "all";
        this.selectedId = null;
        this.statusMessage = "";
        this.statusTone = "info";
        this.supplierEmail = localStorage.getItem("plenohotel:supplierEmail") || "";
        this.emailComposerOpen = false;
        this.localStorageKey = "plenohotel:localRecords";
    }

    init() {
        this.root = document.getElementById("plenohotel-root");
        if (!this.root) return;
        this.bindEvents();
        this.startListening();
        this.render();
    }

    getLang() {
        return i18n.getCurrentLanguage?.() === "pt" ? "pt" : "en";
    }

    tr(section, key, replacements = {}) {
        let value = PLENOHOTEL_COPY[this.getLang()]?.[section]?.[key]
            || PLENOHOTEL_COPY.en?.[section]?.[key]
            || key;
        Object.entries(replacements).forEach(([placeholder, replacement]) => {
            value = value.replaceAll(`{{${placeholder}}}`, replacement);
        });
        return value;
    }

    stageLabel(stageKey) {
        return this.tr("stages", stageKey);
    }

    statusLabel(statusKey) {
        return this.tr("statusLabels", statusKey);
    }

    getLocalizedReminders(record = {}) {
        const reminders = [];
        const stage = PLENOHOTEL_WORKFLOW_STAGES[record.workflowStage] || PLENOHOTEL_WORKFLOW_STAGES.needsQuestion;
        if (stage.key === "needsQuestion") reminders.push(this.tr("reminders", "confirmNeed"));
        if (record.bedSizesKnownStatus !== "yes" || !record.bedSizes?.length) reminders.push(this.tr("reminders", "collectBeds"));
        if (stage.key === "waitingAuthorization") reminders.push(this.tr("reminders", "askOwner"));
        if (stage.key === "needsQuote") reminders.push(this.tr("reminders", "sendQuote"));
        if (stage.key === "waitingDelivery") reminders.push(this.tr("reminders", "followDelivery"));
        if (stage.key === "waitingBilling") reminders.push(this.tr("reminders", "chargeOwner"));
        if (record.plenoSubtotal > 0 && record.commissionAmount <= 0) reminders.push(this.tr("reminders", "setCommission"));
        return reminders;
    }

    getCollectionRef() {
        return this.db ? collection(this.db, "plenoHotelRecords") : null;
    }

    startListening() {
        const recordsRef = this.getCollectionRef();
        if (!recordsRef || this.unsubscribe) {
            if (!recordsRef) {
                this.loadLocalRecords();
            }
            return;
        }

        this.unsubscribe = onSnapshot(recordsRef, (snapshot) => {
            this.records = snapshot.docs.map((entry) => normalizePlenoHotelRecord({
                id: entry.id,
                ...entry.data()
            }));
            if (!this.selectedId && this.records.length) {
                this.selectedId = filterPlenoHotelRecords(this.records, {
                    query: this.query,
                    stage: this.stage
                })[0]?.id || this.records[0].id;
            }
            this.render();
        }, (error) => {
            console.error("[PlenoHotel] listener failed:", error);
            this.setStatus(this.tr("messages", "loadFailed"), "danger");
        });
    }

    bindEvents() {
        this.root.addEventListener("input", (event) => {
            if (event.target.id === "plenohotel-search") {
                this.query = event.target.value;
                this.renderRecordsOnly();
            }
        });

        this.root.addEventListener("change", (event) => {
            if (event.target.id === "plenohotel-stage-filter") {
                this.stage = event.target.value;
                this.render();
                return;
            }
            if (event.target.id === "plenohotel-import") {
                this.handleImport(event.target.files?.[0]);
                event.target.value = "";
                return;
            }
            if (event.target.id === "plenohotel-quote-upload") {
                this.handleAttachmentUpload(event.target.files?.[0], "quote");
                event.target.value = "";
                return;
            }
            if (event.target.id === "plenohotel-invoice-upload") {
                this.handleAttachmentUpload(event.target.files?.[0], "invoice");
                event.target.value = "";
            }
        });

        this.root.addEventListener("click", (event) => {
            const action = event.target.closest("[data-plenohotel-action]")?.dataset.plenohotelAction;
            const rowId = event.target.closest("[data-record-id]")?.dataset.recordId;
            if (!action && rowId) {
                this.selectedId = rowId;
                this.render();
                return;
            }

            if (action === "new") this.createNewDraft();
            if (action === "stage") this.setStage(event.target.closest("[data-plenohotel-stage]")?.dataset.plenohotelStage || "all");
            if (action === "save") this.saveSelectedRecord();
            if (action === "save-add") this.saveSelectedRecord({ addAnother: true });
            if (action === "delete") this.deleteSelectedRecord();
            if (action === "export") this.exportRecords();
            if (action === "toggle-email") this.toggleEmailComposer();
            if (action === "generate-email") this.generateEmail();
            if (action === "copy-email") this.copyEmail();
            if (action === "open-email") this.openEmail();
        });
    }

    setStatus(message, tone = "info") {
        this.statusMessage = message;
        this.statusTone = tone;
        this.render();
    }

    setStage(stage) {
        this.stage = stage || "all";
        const firstMatch = filterPlenoHotelRecords(this.records, {
            query: this.query,
            stage: this.stage
        })[0];
        if (firstMatch && !this.records.some((record) => record.id === this.selectedId && (this.stage === "all" || record.workflowStage === this.stage))) {
            this.selectedId = firstMatch.id;
        }
        this.render();
    }

    getSelectedRecord() {
        return this.records.find((record) => record.id === this.selectedId) || null;
    }

    createNewDraft() {
        const id = `new-${Date.now()}`;
        this.records = [
            this.createBlankRecord(id),
            ...this.records.filter((record) => !record.id?.startsWith("new-"))
        ];
        this.selectedId = id;
        this.emailComposerOpen = false;
        this.render();
    }

    loadLocalRecords() {
        try {
            const parsed = JSON.parse(localStorage.getItem(this.localStorageKey) || "[]");
            this.records = Array.isArray(parsed) ? parsed.map(normalizePlenoHotelRecord) : [];
            this.selectedId = this.records[0]?.id || null;
        } catch (error) {
            console.warn("[PlenoHotel] local records failed to load:", error);
            this.records = [];
            this.selectedId = null;
        }
    }

    saveLocalRecords() {
        try {
            const saved = this.records.filter((record) => !record.id?.startsWith("new-"));
            localStorage.setItem(this.localStorageKey, JSON.stringify(saved));
        } catch (error) {
            console.warn("[PlenoHotel] local records failed to save:", error);
        }
    }

    async upsertRecord(record) {
        if (!this.db) {
            this.setStatus(this.tr("messages", "firestoreUnavailable"), "danger");
            return;
        }
        const normalized = normalizePlenoHotelRecord(record);
        const id = normalized.id.startsWith("new-") ? getRecordIdForName(normalized.propertyName) : normalized.id;
        const savedRecord = normalizePlenoHotelRecord({ ...normalized, id });
        const ref = doc(this.db, "plenoHotelRecords", id);
        await setDoc(ref, {
            ...savedRecord,
            updatedAt: serverTimestamp()
        }, { merge: true });
        this.selectedId = id;
        this.records = [
            savedRecord,
            ...this.records.filter((entry) => entry.id !== normalized.id && entry.id !== id)
        ];
    }

    readFormRecord() {
        const form = this.root.querySelector("#plenohotel-detail-form");
        if (!form) return null;
        const get = (name) => form.elements[name]?.value || "";
        const current = this.getSelectedRecord() || {};
        const subtotal = parseMoney(get("plenoSubtotal"));
        const commissionRate = Number(get("commissionRate")) || 0;
        const commissionAmount = get("commissionAmount")
            ? parseMoney(get("commissionAmount"))
            : subtotal * (commissionRate / 100);

        return normalizePlenoHotelRecord({
            ...current,
            propertyName: get("propertyName"),
            location: get("location"),
            needStatus: get("needStatus"),
            askedStatus: get("askedStatus"),
            authorizationStatus: get("authorizationStatus"),
            bedSizesKnownStatus: get("bedSizesKnownStatus"),
            boughtStatus: get("boughtStatus"),
            approvedStatus: get("approvedStatus"),
            deliveredStatus: get("deliveredStatus"),
            chargedStatus: get("chargedStatus"),
            purchaseDate: get("purchaseDate"),
            emailSentDate: get("emailSentDate"),
            quoteNumber: get("quoteNumber"),
            quoteDate: get("quoteDate"),
            quoteNotes: get("quoteNotes"),
            plenoHotelInvoice: get("plenoHotelInvoice"),
            extraNotes: get("extraNotes"),
            internalNotes: get("internalNotes"),
            supplierEmail: get("supplierEmail"),
            ownerEmail: get("ownerEmail"),
            plenoSubtotal: subtotal,
            commissionRate,
            commissionAmount,
            ownerChargeTotal: get("ownerChargeTotal") ? parseMoney(get("ownerChargeTotal")) : subtotal + commissionAmount,
            bedSizes: parseBedSizes(get("bedSizes").split(/\n+/)),
            quoteLinks: linesToLinks(get("quoteLinks")),
            invoiceLinks: linesToLinks(get("invoiceLinks"))
        });
    }

    async saveSelectedRecord({ addAnother = false } = {}) {
        try {
            const record = this.readFormRecord();
            if (!record?.propertyName) {
                this.setStatus(this.tr("messages", "propertyRequired"), "danger");
                return;
            }
            this.supplierEmail = record.supplierEmail || "";
            localStorage.setItem("plenohotel:supplierEmail", this.supplierEmail);
            if (this.db) {
                await this.upsertRecord(record);
            } else {
                const id = record.id?.startsWith("new-") ? getRecordIdForName(record.propertyName) : record.id;
                const savedRecord = normalizePlenoHotelRecord({ ...record, id });
                this.records = [
                    savedRecord,
                    ...this.records.filter((entry) => entry.id !== record.id && entry.id !== id)
                ];
                this.selectedId = id;
                this.saveLocalRecords();
            }

            if (addAnother) {
                this.statusMessage = this.tr("messages", "savedAddAnother");
                this.statusTone = "success";
                this.createNewDraft();
                return;
            }

            this.setStatus(this.db ? this.tr("messages", "saved") : this.tr("messages", "savedLocal"), "success");
        } catch (error) {
            console.error("[PlenoHotel] save failed:", error);
            this.setStatus(this.tr("messages", "saveFailed"), "danger");
        }
    }

    async deleteSelectedRecord() {
        const record = this.getSelectedRecord();
        if (!record) return;
        if (!confirm(`Delete ${record.propertyName}?`)) return;
        try {
            if (this.db && !record.id.startsWith("new-")) {
                await deleteDoc(doc(this.db, "plenoHotelRecords", record.id));
            }
            this.records = this.records.filter((entry) => entry.id !== record.id);
            if (!this.db) this.saveLocalRecords();
            this.selectedId = this.records[0]?.id || null;
            this.setStatus(this.tr("messages", "deleted"), "success");
        } catch (error) {
            console.error("[PlenoHotel] delete failed:", error);
            this.setStatus(this.tr("messages", "deleteFailed"), "danger");
        }
    }

    toggleEmailComposer() {
        this.emailComposerOpen = !this.emailComposerOpen;
        this.render();
    }

    async handleImport(file) {
        if (!file) return;
        if (typeof XLSX === "undefined") {
            this.setStatus(this.tr("messages", "parserMissing"), "danger");
            return;
        }
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
            const imported = parsePlenoHotelWorkbook(workbook, {
                defaultYear: new Date().getFullYear()
            });
            if (!imported.length) {
                this.setStatus(this.tr("messages", "noRows"), "danger");
                return;
            }
            if (!this.db) {
                this.records = imported;
                this.selectedId = imported[0].id;
                this.saveLocalRecords();
                this.setStatus(this.tr("messages", "importedLocal"), "danger");
                return;
            }

            const existingById = new Map(this.records.map((record) => [record.id, record]));
            await Promise.all(imported.map((record) => {
                const merged = existingById.has(record.id)
                    ? mergePlenoHotelRecords(existingById.get(record.id), record)
                    : record;
                return setDoc(doc(this.db, "plenoHotelRecords", merged.id), {
                    ...normalizePlenoHotelRecord(merged),
                    importedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }));
            this.selectedId = imported[0].id;
            this.setStatus(this.tr("messages", "imported", { count: imported.length }), "success");
        } catch (error) {
            console.error("[PlenoHotel] import failed:", error);
            this.setStatus(this.tr("messages", "importFailed"), "danger");
        }
    }

    async handleAttachmentUpload(file, type) {
        if (!file) return;
        if (!this.db || !this.storage) {
            this.setStatus(this.tr("messages", "uploadNeedsAuth"), "danger");
            return;
        }

        try {
            const record = this.readFormRecord();
            if (!record?.propertyName) {
                this.setStatus(this.tr("messages", "saveNameBeforeAttach"), "danger");
                return;
            }
            const id = record.id.startsWith("new-") ? getRecordIdForName(record.propertyName) : record.id;
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
            const path = `plenohotel/${id}/${type}s/${Date.now()}-${safeName}`;
            const fileRef = storageRef(this.storage, path);
            await uploadBytes(fileRef, file, {
                contentType: file.type || "application/octet-stream"
            });
            const url = await getDownloadURL(fileRef);
            const link = {
                label: file.name,
                url,
                storagePath: path,
                uploadedAt: new Date().toISOString()
            };
            const updated = normalizePlenoHotelRecord({
                ...record,
                id,
                quoteLinks: type === "quote" ? [...(record.quoteLinks || []), link] : record.quoteLinks,
                invoiceLinks: type === "invoice" ? [...(record.invoiceLinks || []), link] : record.invoiceLinks
            });
            await this.upsertRecord(updated);
            this.setStatus(type === "quote" ? this.tr("messages", "quotationAttached") : this.tr("messages", "invoiceAttached"), "success");
        } catch (error) {
            console.error("[PlenoHotel] attachment upload failed:", error);
            this.setStatus(this.tr("messages", "uploadFailed"), "danger");
        }
    }

    exportRecords() {
        if (typeof XLSX === "undefined") {
            this.setStatus(this.tr("messages", "exporterMissing"), "danger");
            return;
        }
        const rows = this.records.map((record) => normalizePlenoHotelRecord(record)).map((record) => ({
            [this.tr("ui", "property")]: record.propertyName,
            [this.tr("ui", "location")]: record.location,
            [this.tr("ui", "stage")]: this.stageLabel(record.workflowStage),
            [this.tr("ui", "needed")]: this.statusLabel(record.needStatus),
            [this.tr("ui", "ownerAsked")]: this.statusLabel(record.askedStatus),
            [this.tr("ui", "authorized")]: this.statusLabel(record.authorizationStatus),
            [this.tr("ui", "bedSizesColumn")]: bedSizesToText(record.bedSizes),
            [this.tr("ui", "quoteNumber")]: record.quoteNumber,
            [this.tr("ui", "quoteDate")]: record.quoteDate,
            [this.tr("ui", "quoteApproved")]: this.statusLabel(record.approvedStatus),
            [this.tr("ui", "delivered")]: this.statusLabel(record.deliveredStatus),
            [this.tr("ui", "chargedOwner")]: this.statusLabel(record.chargedStatus),
            [this.tr("ui", "plenoSubtotal")]: record.plenoSubtotal,
            [this.tr("ui", "commissionAmount")]: record.commissionAmount,
            [this.tr("ui", "totalToChargeOwner")]: record.ownerChargeTotal,
            [this.tr("ui", "quotationLinks")]: linksToLines(record.quoteLinks),
            [this.tr("ui", "invoiceLinks")]: linksToLines(record.invoiceLinks),
            [this.tr("ui", "internalNotes")]: [record.quoteNotes, record.extraNotes, record.internalNotes].filter(Boolean).join("\n")
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, "PlenoHotel");
        XLSX.writeFile(wb, `PlenoHotel-${todayIsoDate()}.xlsx`);
    }

    generateEmail() {
        const record = this.readFormRecord() || this.getSelectedRecord();
        if (!record) return;
        const template = this.root.querySelector("#plenohotel-email-template")?.value || "quoteRequest";
        const email = createPlenoHotelEmail(record, template);
        const to = this.root.querySelector("#plenohotel-email-to");
        const subject = this.root.querySelector("#plenohotel-email-subject");
        const body = this.root.querySelector("#plenohotel-email-body");
        if (to) to.value = email.to;
        if (subject) subject.value = email.subject;
        if (body) body.value = email.body;
    }

    copyEmail() {
        const body = this.root.querySelector("#plenohotel-email-body")?.value || "";
        const subject = this.root.querySelector("#plenohotel-email-subject")?.value || "";
        navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`)
            .then(() => this.setStatus(this.tr("messages", "copied"), "success"))
            .catch(() => this.setStatus(this.tr("messages", "copyFailed"), "danger"));
    }

    openEmail() {
        const email = {
            to: this.root.querySelector("#plenohotel-email-to")?.value || "",
            subject: this.root.querySelector("#plenohotel-email-subject")?.value || "",
            body: this.root.querySelector("#plenohotel-email-body")?.value || ""
        };
        window.location.href = createMailtoUrl(email);
    }

    renderRecordsOnly() {
        const container = this.root.querySelector("#plenohotel-records-list");
        if (container) {
            container.innerHTML = this.renderRecordsTable();
        }
    }

    render() {
        if (!this.root) return;
        const summary = summarizePlenoHotelRecords(this.records);
        const selected = this.getSelectedRecord() || this.createBlankRecord();
        this.root.innerHTML = `
            <div class="space-y-4">
                ${this.renderToolbar(summary)}
                ${this.renderStatus()}
                <div class="grid items-start gap-4 xl:grid-cols-[260px_minmax(420px,0.9fr)_minmax(540px,1fr)] 2xl:grid-cols-[280px_minmax(520px,0.95fr)_minmax(700px,1fr)]">
                    <aside class="min-w-0 xl:sticky xl:top-24">
                        ${this.renderWorkflowNav(summary)}
                    </aside>
                    <section class="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                        <div class="flex flex-col gap-3 border-b border-slate-200 p-4">
                            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <h2 class="text-base font-semibold text-slate-900">${this.tr("ui", "propertyTracker")}</h2>
                                    <p class="text-sm text-slate-500">${this.tr("ui", "trackerDescription")}</p>
                                </div>
                            </div>
                            <div class="flex flex-col gap-2 sm:flex-row">
                                <input id="plenohotel-search" value="${escapeHtml(this.query)}" placeholder="${escapeHtml(this.tr("ui", "searchPlaceholder"))}"
                                    class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light">
                                <select id="plenohotel-stage-filter"
                                    class="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-light xl:hidden">
                                    <option value="all" ${this.stage === "all" ? "selected" : ""}>${this.tr("ui", "allStages")}</option>
                                    ${Object.values(PLENOHOTEL_WORKFLOW_STAGES).sort((a, b) => a.order - b.order).map((stage) => `
                                        <option value="${stage.key}" ${this.stage === stage.key ? "selected" : ""}>${this.stageLabel(stage.key)}</option>
                                    `).join("")}
                                </select>
                            </div>
                        </div>
                        <div id="plenohotel-records-list">
                            ${this.renderRecordsTable()}
                        </div>
                    </section>
                    <aside class="min-w-0 xl:sticky xl:top-24">
                        ${this.renderDetailPanel(selected, { isBlank: !this.getSelectedRecord() })}
                    </aside>
                </div>
            </div>
        `;
    }

    renderToolbar(summary) {
        const syncCopy = this.db
            ? this.tr("ui", "sync", { total: summary.total, waiting: summary.waitingOwnerCharge })
            : this.tr("ui", "localMode");
        return `
            <div class="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 class="text-xl font-semibold text-slate-950">${this.tr("ui", "heading")}</h2>
                    <p class="mt-1 text-sm text-slate-600">${syncCopy}</p>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" data-plenohotel-action="new"
                        style="background-color: #e94b5a; color: white;"
                        class="inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold shadow-sm hover:opacity-90">
                        <i class="fas fa-pen mr-2"></i>${this.tr("ui", "addManual")}
                    </button>
                    <label class="inline-flex cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <i class="fas fa-file-import mr-2 text-slate-500"></i>
                        ${this.tr("ui", "importWorkbook")}
                        <input id="plenohotel-import" type="file" accept=".xlsx,.xls,.csv" class="sr-only">
                    </label>
                    <button type="button" data-plenohotel-action="export"
                        class="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        <i class="fas fa-file-excel mr-2 text-emerald-600"></i>${this.tr("ui", "export")}
                    </button>
                </div>
            </div>
        `;
    }

    renderStatus() {
        if (!this.statusMessage) return "";
        const classes = this.statusTone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : this.statusTone === "danger"
            ? "border-rose-200 bg-rose-50 text-rose-800"
            : "border-sky-200 bg-sky-50 text-sky-800";
        return `<div class="rounded-md border px-4 py-3 text-sm ${classes}">${escapeHtml(this.statusMessage)}</div>`;
    }

    renderWorkflowNav(summary) {
        const allActive = this.stage === "all";
        const allClass = allActive
            ? "border-brand bg-rose-50 text-brand shadow-sm"
            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50";
        const stageItems = Object.values(PLENOHOTEL_WORKFLOW_STAGES)
            .sort((a, b) => a.order - b.order)
            .map((stage) => `
                <button type="button" data-plenohotel-action="stage" data-plenohotel-stage="${stage.key}"
                    class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition ${this.stage === stage.key ? `${stageToneClass(stage.key)} shadow-sm` : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}">
                    <span class="min-w-0 text-sm font-medium">${this.stageLabel(stage.key)}</span>
                    <span class="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-700">${summary.stages[stage.key] || 0}</span>
                </button>
            `).join("");

        return `
            <div class="rounded-lg border border-slate-200 bg-white p-3">
                <div class="px-1 pb-3">
                    <h2 class="text-sm font-semibold text-slate-950">${this.tr("ui", "workflowQueue")}</h2>
                    <p class="mt-1 text-xs leading-5 text-slate-500">${this.tr("ui", "workflowDescription")}</p>
                </div>
                <button type="button" data-plenohotel-action="stage" data-plenohotel-stage="all"
                    class="mb-2 flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition ${allClass}">
                    <span class="text-sm font-semibold">${this.tr("ui", "allProperties")}</span>
                    <span class="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold text-slate-700">${summary.total}</span>
                </button>
                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                    ${stageItems}
                </div>
                <div class="mt-4 border-t border-slate-200 pt-4">
                    <div class="grid grid-cols-2 gap-3 xl:grid-cols-1 2xl:grid-cols-2">
                        <div>
                            <div class="text-xl font-semibold text-slate-950">${summary.needsBedSizes}</div>
                            <div class="text-xs font-medium text-slate-500">${this.tr("ui", "needBedSizes")}</div>
                        </div>
                        <div>
                            <div class="text-xl font-semibold text-slate-950">${formatCurrency(summary.totalCommission)}</div>
                            <div class="text-xs font-medium text-slate-500">${this.tr("ui", "commissionTracked")}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderRecordsTable() {
        const records = filterPlenoHotelRecords(this.records, {
            query: this.query,
            stage: this.stage
        });
        if (!records.length) {
            return `
                <div class="p-8 text-center">
                    <div class="text-sm font-medium text-slate-700">${this.tr("ui", "noRecords")}</div>
                    <button type="button" data-plenohotel-action="new"
                        style="background-color: #e94b5a; color: white;"
                        class="mt-4 inline-flex items-center rounded-md px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90">
                        <i class="fas fa-pen mr-2"></i>${this.tr("ui", "addPropertyManual")}
                    </button>
                </div>
            `;
        }

        return `
            <div class="max-h-[calc(100vh-260px)] min-h-[420px] divide-y divide-slate-100 overflow-auto">
                ${records.map((record) => this.renderRecordRow(record)).join("")}
            </div>
        `;
    }

    renderRecordRow(record) {
        const selected = record.id === this.selectedId;
        const reminders = this.getLocalizedReminders(record);
        const stage = PLENOHOTEL_WORKFLOW_STAGES[record.workflowStage] || PLENOHOTEL_WORKFLOW_STAGES.needsQuestion;
        const propertyName = record.propertyName || this.tr("ui", "manualEntry");
        return `
            <button type="button" data-record-id="${escapeHtml(record.id)}"
                class="block w-full px-4 py-3 text-left transition ${selected ? "bg-rose-50/80 ring-1 ring-inset ring-rose-200" : "hover:bg-slate-50"}">
                <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                        <div class="truncate font-medium text-slate-950">${escapeHtml(propertyName)}</div>
                        <div class="mt-0.5 truncate text-xs text-slate-500">${escapeHtml(record.location || this.tr("ui", "noLocation"))}${reminders.length ? ` · ${reminders.length} ${reminders.length === 1 ? this.tr("ui", "reminderSingle") : this.tr("ui", "reminderPlural")}` : ""}</div>
                    </div>
                    <span class="shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${stageToneClass(stage.key)}">${this.stageLabel(stage.key)}</span>
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <div class="font-medium text-slate-500">${this.tr("ui", "quote")}</div>
                        <div class="mt-0.5 truncate text-slate-800">${escapeHtml(record.quoteNumber || this.tr("ui", "noQuote"))}</div>
                    </div>
                    <div>
                        <div class="font-medium text-slate-500">${this.tr("ui", "bedSizesColumn")}</div>
                        <div class="mt-0.5 text-slate-800">${record.bedSizes.length ? `${record.bedSizes.length} ${this.tr("ui", "entries")}` : this.tr("ui", "missing")}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-medium text-slate-500">${this.tr("ui", "ownerCharge")}</div>
                        <div class="mt-0.5 font-semibold text-slate-950">${record.ownerChargeTotal ? formatCurrency(record.ownerChargeTotal) : "-"}</div>
                    </div>
                </div>
            </button>
        `;
    }

    createBlankRecord(id = `new-${Date.now()}`) {
        return normalizePlenoHotelRecord({
            id,
            propertyName: "",
            needStatus: "yes",
            askedStatus: "unknown",
            authorizationStatus: "unknown",
            bedSizesKnownStatus: "unknown",
            boughtStatus: "unknown",
            approvedStatus: "unknown",
            deliveredStatus: "unknown",
            chargedStatus: "unknown",
            supplierEmail: this.supplierEmail
        });
    }

    renderDetailPanel(record, { isBlank = false } = {}) {
        const normalized = normalizePlenoHotelRecord(record);
        const stage = PLENOHOTEL_WORKFLOW_STAGES[normalized.workflowStage];
        return `
            <div class="space-y-4">
                <form id="plenohotel-detail-form" class="rounded-lg border border-slate-200 bg-white">
                    <div class="border-b border-slate-200 p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <span class="inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${stageToneClass(stage.key)}">${this.stageLabel(stage.key)}</span>
                                <h2 class="mt-2 text-lg font-semibold text-slate-950">${escapeHtml(normalized.propertyName || this.tr("ui", "manualEntry"))}</h2>
                                ${isBlank ? `<p class="mt-1 text-sm text-slate-500">${this.tr("ui", "manualHelp")}</p>` : ""}
                            </div>
                            ${isBlank ? "" : `<button type="button" data-plenohotel-action="delete" class="text-sm text-rose-600 hover:underline">${this.tr("ui", "delete")}</button>`}
                        </div>
                        <div class="mt-4 grid gap-2">
                            <button type="button" data-plenohotel-action="save"
                                style="background-color: #e94b5a; color: white;"
                                class="rounded-md px-4 py-2 text-sm font-semibold shadow-sm hover:opacity-90">
                                ${this.tr("ui", "saveRecord")}
                            </button>
                            <div class="grid gap-2 sm:grid-cols-2">
                                <button type="button" data-plenohotel-action="save-add"
                                    class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    ${this.tr("ui", "saveAddAnother")}
                                </button>
                                <button type="button" data-plenohotel-action="toggle-email"
                                    class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    ${this.emailComposerOpen ? this.tr("ui", "hideEmailTools") : this.tr("ui", "prepareEmail")}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="space-y-3 p-4">
                        <p class="text-xs leading-5 text-slate-500">${this.tr("ui", "formSectionsHelp")}</p>
                        ${this.renderDetailSection(this.tr("ui", "propertyAndBeds"), this.renderIdentityFields(normalized), { open: true })}
                        ${this.renderDetailSection(this.tr("ui", "workflow"), this.renderStatusFields(normalized), { open: true })}
                        ${this.renderDetailSection(this.tr("ui", "quoteAndNotes"), this.renderQuoteFields(normalized))}
                        ${this.renderDetailSection(this.tr("ui", "ownerChargeAndCommission"), this.renderCommissionFields(normalized))}
                        ${this.renderDetailSection(this.tr("ui", "quotationsAndInvoices"), this.renderAttachmentFields(normalized))}
                        ${this.emailComposerOpen
                            ? this.renderDetailSection(this.tr("ui", "emailPreparation"), this.renderEmailComposer(normalized), { open: true })
                            : this.renderEmailCollapsed()}
                    </div>
                </form>
            </div>
        `;
    }

    renderDetailSection(title, body, { open = false } = {}) {
        return `
            <details class="plenohotel-detail-section rounded-md border border-slate-200 bg-white" ${open ? "open" : ""}>
                <summary class="flex cursor-pointer items-center justify-between gap-3 px-3 py-3 text-sm font-semibold text-slate-950">
                    <span>${title}</span>
                    <i class="fas fa-chevron-down plenohotel-detail-chevron text-xs text-slate-400 transition-transform"></i>
                </summary>
                <div class="border-t border-slate-100 p-3">
                    ${body}
                </div>
            </details>
        `;
    }

    renderIdentityFields(record) {
        return `
            <section class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "propertyName")}</span>
                        <input name="propertyName" value="${escapeHtml(record.propertyName)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "location")}</span>
                        <input name="location" value="${escapeHtml(record.location)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                </div>
                <label class="text-sm">
                    <span class="mb-1 block text-slate-600">${this.tr("ui", "bedSizesOnePerLine")}</span>
                    <textarea name="bedSizes" rows="8" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="${escapeHtml(this.tr("ui", "bedPlaceholder"))}">${escapeHtml(bedSizesToText(record.bedSizes))}</textarea>
                </label>
            </section>
        `;
    }

    renderStatusFields(record) {
        const fields = [
            ["needStatus", this.tr("ui", "needed")],
            ["askedStatus", this.tr("ui", "ownerAsked")],
            ["authorizationStatus", this.tr("ui", "authorized")],
            ["bedSizesKnownStatus", this.tr("ui", "bedSizesKnown")],
            ["boughtStatus", this.tr("ui", "bought")],
            ["approvedStatus", this.tr("ui", "quoteApproved")],
            ["deliveredStatus", this.tr("ui", "delivered")],
            ["chargedStatus", this.tr("ui", "chargedOwner")]
        ];
        return `
            <section class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    ${fields.map(([name, label]) => `
                        <label class="text-sm">
                            <span class="mb-1 block text-slate-600">${label}</span>
                            <select name="${name}" class="w-full rounded-md border border-slate-300 px-3 py-2">${statusOptions(record[name], PLENOHOTEL_COPY[this.getLang()].statusLabels)}</select>
                        </label>
                    `).join("")}
                </div>
            </section>
        `;
    }

    renderQuoteFields(record) {
        return `
            <section class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "emailSent")}</span>
                        <input name="emailSentDate" type="date" value="${escapeHtml(parseSpreadsheetDate(record.emailSentDate))}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "quoteDate")}</span>
                        <input name="quoteDate" type="date" value="${escapeHtml(parseSpreadsheetDate(record.quoteDate))}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "quoteNumber")}</span>
                        <input name="quoteNumber" value="${escapeHtml(record.quoteNumber)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "purchaseDate")}</span>
                        <input name="purchaseDate" type="date" value="${escapeHtml(parseSpreadsheetDate(record.purchaseDate))}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                </div>
                <label class="text-sm">
                    <span class="mb-1 block text-slate-600">${this.tr("ui", "quoteNotes")}</span>
                    <textarea name="quoteNotes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2">${escapeHtml(record.quoteNotes)}</textarea>
                </label>
                <label class="text-sm">
                    <span class="mb-1 block text-slate-600">${this.tr("ui", "internalNotes")}</span>
                    <textarea name="internalNotes" rows="2" class="w-full rounded-md border border-slate-300 px-3 py-2">${escapeHtml([record.extraNotes, record.internalNotes].filter(Boolean).join("\n"))}</textarea>
                </label>
            </section>
        `;
    }

    renderCommissionFields(record) {
        return `
            <section class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "plenoSubtotal")}</span>
                        <input name="plenoSubtotal" type="number" step="0.01" value="${record.plenoSubtotal || ""}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "commissionPercent")}</span>
                        <input name="commissionRate" type="number" step="0.01" value="${record.commissionRate || ""}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "commissionAmount")}</span>
                        <input name="commissionAmount" type="number" step="0.01" value="${record.commissionAmount || ""}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "totalToChargeOwner")}</span>
                        <input name="ownerChargeTotal" type="number" step="0.01" value="${record.ownerChargeTotal || ""}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                </div>
            </section>
        `;
    }

    renderAttachmentFields(record) {
        return `
            <section class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "quotationLinks")}</span>
                        <textarea name="quoteLinks" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2" placeholder="${this.tr("ui", "quotationLinksPlaceholder")}">${escapeHtml(linksToLines(record.quoteLinks))}</textarea>
                        <span class="mt-2 inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            <i class="fas fa-paperclip mr-2"></i>${this.tr("ui", "uploadQuotation")}
                            <input id="plenohotel-quote-upload" type="file" class="sr-only">
                        </span>
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "invoiceLinks")}</span>
                        <textarea name="invoiceLinks" rows="3" class="w-full rounded-md border border-slate-300 px-3 py-2">${escapeHtml(linksToLines(record.invoiceLinks))}</textarea>
                        <span class="mt-2 inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            <i class="fas fa-paperclip mr-2"></i>${this.tr("ui", "uploadInvoice")}
                            <input id="plenohotel-invoice-upload" type="file" class="sr-only">
                        </span>
                    </label>
                </div>
                <label class="text-sm">
                    <span class="mb-1 block text-slate-600">${this.tr("ui", "invoiceReference")}</span>
                    <input name="plenoHotelInvoice" value="${escapeHtml(record.plenoHotelInvoice)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                </label>
            </section>
        `;
    }

    renderEmailComposer(record) {
        return `
            <section class="space-y-3">
                <div class="flex justify-end">
                    <button type="button" data-plenohotel-action="generate-email" class="text-sm font-medium text-brand hover:underline">${this.tr("ui", "generate")}</button>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "supplierEmail")}</span>
                        <input name="supplierEmail" value="${escapeHtml(record.supplierEmail || this.supplierEmail)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                    <label class="text-sm">
                        <span class="mb-1 block text-slate-600">${this.tr("ui", "ownerEmail")}</span>
                        <input name="ownerEmail" value="${escapeHtml(record.ownerEmail)}" class="w-full rounded-md border border-slate-300 px-3 py-2">
                    </label>
                </div>
                <select id="plenohotel-email-template" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                    <option value="quoteRequest">${this.tr("ui", "requestQuote")}</option>
                    <option value="ownerAuthorization">${this.tr("ui", "askOwnerAuthorization")}</option>
                    <option value="deliveryFollowUp">${this.tr("ui", "followUpDelivery")}</option>
                </select>
                <input id="plenohotel-email-to" placeholder="${this.tr("ui", "to")}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <input id="plenohotel-email-subject" placeholder="${this.tr("ui", "subject")}" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <textarea id="plenohotel-email-body" rows="7" class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"></textarea>
                <div class="grid gap-2 sm:grid-cols-2">
                    <button type="button" data-plenohotel-action="copy-email" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${this.tr("ui", "copyEmail")}</button>
                    <button type="button" data-plenohotel-action="open-email" class="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">${this.tr("ui", "openMailApp")}</button>
                </div>
            </section>
        `;
    }

    renderEmailCollapsed() {
        return `
            <section class="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-sm font-semibold text-slate-900">${this.tr("ui", "emailPreparation")}</h3>
                        <p class="mt-1 text-sm text-slate-500">${this.tr("ui", "optionalEmail")}</p>
                    </div>
                    <button type="button" data-plenohotel-action="toggle-email"
                        class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        ${this.tr("ui", "openEmailTools")}
                    </button>
                </div>
            </section>
        `;
    }
}
