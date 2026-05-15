export const PLENOHOTEL_STATUS_LABELS = {
    yes: "Yes",
    no: "No",
    partial: "Partial",
    later: "Later",
    ask: "Ask",
    pending: "Pending",
    unknown: "Unknown"
};

export const PLENOHOTEL_WORKFLOW_STAGES = {
    notNeeded: {
        key: "notNeeded",
        label: "No action",
        tone: "slate",
        order: 70
    },
    needsQuestion: {
        key: "needsQuestion",
        label: "Needs question",
        tone: "amber",
        order: 10
    },
    waitingAuthorization: {
        key: "waitingAuthorization",
        label: "Waiting authorization",
        tone: "orange",
        order: 20
    },
    needsQuote: {
        key: "needsQuote",
        label: "Needs quote/order",
        tone: "sky",
        order: 30
    },
    waitingDelivery: {
        key: "waitingDelivery",
        label: "Waiting delivery",
        tone: "indigo",
        order: 40
    },
    waitingBilling: {
        key: "waitingBilling",
        label: "Waiting billing",
        tone: "rose",
        order: 50
    },
    complete: {
        key: "complete",
        label: "Complete",
        tone: "emerald",
        order: 60
    }
};

const YES_VALUES = new Set(["sim", "yes", "y", "approved", "aprovado", "comprado", "entregue"]);
const NO_VALUES = new Set(["nao", "não", "no", "n", "-", "nao aprovado", "não aprovado", "nao e para avancar", "não é para avançar"]);

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}

export function normalizeLabel(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeRecordKey(value) {
    const normalized = normalizeText(value)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || "unnamed";
}

export function hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) - hash) + text.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

export function getRecordIdForName(propertyName) {
    const key = normalizeRecordKey(propertyName);
    return `${key}-${hashString(propertyName).slice(0, 6)}`;
}

export function normalizeBooleanStatus(value) {
    const raw = normalizeLabel(value);
    const normalized = normalizeText(raw);
    if (!normalized) return "unknown";
    if (YES_VALUES.has(normalized) || normalized.startsWith("sim ")) return "yes";
    if (NO_VALUES.has(normalized) || normalized.startsWith("nao ") || normalized.startsWith("não ")) return "no";
    if (normalized.includes("faltar") || normalized.includes("alterac")) return "partial";
    if (normalized.includes("setembro") || normalized.includes("julho") || normalized.includes("mais para a frente") || normalized.includes("cedo")) return "later";
    if (normalized.includes("perguntar") || normalized.includes("verificar") || normalized.includes("questionar")) return "ask";
    return "pending";
}

export function parseSpreadsheetDate(value, { defaultYear = new Date().getFullYear() } = {}) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }

    if (typeof value === "number" && Number.isFinite(value)) {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const date = new Date(excelEpoch + value * 86400000);
        return date.toISOString().slice(0, 10);
    }

    const text = String(value).trim();
    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric > 1000) {
        return parseSpreadsheetDate(numeric, { defaultYear });
    }

    const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
    if (match) {
        const day = String(parseInt(match[1], 10)).padStart(2, "0");
        const month = String(parseInt(match[2], 10)).padStart(2, "0");
        let year = match[3] ? parseInt(match[3], 10) : defaultYear;
        if (year < 100) year += 2000;
        return `${year}-${month}-${day}`;
    }

    return text;
}

export function parseMoney(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value || "")
        .replace(/\s/g, "")
        .replace(/[€$£]/g, "");
    if (!text) return 0;
    const decimalComma = text.includes(",") && (!text.includes(".") || text.lastIndexOf(",") > text.lastIndexOf("."));
    const normalized = decimalComma
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCurrency(value, locale = "pt-PT") {
    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR"
    }).format(Number(value) || 0);
}

export function parseBedSizeEntry(value) {
    const raw = normalizeLabel(value);
    if (!raw) return null;

    const quantityMatch = raw.match(/(?:^|\s)(\d+)\s*(?:-|x|un|unidade|unidades)?/i);
    const sizeMatch = raw.match(/(\d{2,3})\s*x\s*(\d{2,3})/i);
    const trailingQuantityMatch = raw.match(/-\s*(\d+)\s*$/);
    const quantity = trailingQuantityMatch
        ? parseInt(trailingQuantityMatch[1], 10)
        : quantityMatch
        ? parseInt(quantityMatch[1], 10)
        : 1;

    return {
        raw,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        width: sizeMatch ? parseInt(sizeMatch[1], 10) : null,
        length: sizeMatch ? parseInt(sizeMatch[2], 10) : null
    };
}

export function parseBedSizes(values = []) {
    return values
        .map(parseBedSizeEntry)
        .filter(Boolean);
}

function readCell(row, candidates) {
    for (const candidate of candidates) {
        if (row[candidate] !== undefined && row[candidate] !== null && row[candidate] !== "") {
            return row[candidate];
        }
    }
    return "";
}

function cleanSheetRows(rows = []) {
    return rows
        .map((row) => {
            const cleaned = {};
            Object.entries(row || {}).forEach(([key, value]) => {
                const label = normalizeLabel(key);
                if (label) cleaned[label] = value;
            });
            return cleaned;
        })
        .filter((row) => Object.values(row).some((value) => normalizeLabel(value)));
}

export function createRecordFromLinenRow(row, options = {}) {
    const propertyName = normalizeLabel(readCell(row, ["Alojamento", "Property", "Propriedade"]));
    if (!propertyName) return null;

    const bedValues = [
        readCell(row, ["Tamanho das camas"]),
        row.__EMPTY,
        row.__EMPTY_1,
        row.__EMPTY_2,
        row.__EMPTY_3
    ];
    const needRaw = readCell(row, ["Necessário?", "Necessario?"]);
    const askedRaw = readCell(row, ["Questionado?"]);
    const authorizationRaw = readCell(row, ["Autorização?", "Autorizacao?"]);
    const bedSizesKnownRaw = readCell(row, ["Temos tamanhos das camas?"]);
    const boughtRaw = readCell(row, ["Comprado?"]);

    return normalizePlenoHotelRecord({
        id: getRecordIdForName(propertyName),
        propertyName,
        location: normalizeLabel(readCell(row, ["Localização", "Localizacao", "Location"])),
        needStatus: normalizeBooleanStatus(needRaw),
        needRaw: normalizeLabel(needRaw),
        askedStatus: normalizeBooleanStatus(askedRaw),
        authorizationStatus: normalizeBooleanStatus(authorizationRaw),
        bedSizesKnownStatus: normalizeBooleanStatus(bedSizesKnownRaw),
        boughtStatus: normalizeBooleanStatus(boughtRaw),
        purchaseDate: parseSpreadsheetDate(readCell(row, ["Data da compra"]), options),
        plenoHotelInvoice: normalizeLabel(readCell(row, ["Fatura PlenoHotel"])),
        bedSizes: parseBedSizes(bedValues),
        source: "linen-sheet"
    });
}

export function createQuoteFromRow(row, options = {}) {
    const propertyName = normalizeLabel(readCell(row, ["Referência(email)", "Referencia(email)", "Reference", "Property"]));
    if (!propertyName) return null;

    return normalizePlenoHotelRecord({
        id: getRecordIdForName(propertyName),
        propertyName,
        emailSentDate: parseSpreadsheetDate(readCell(row, ["Data do envio do email"]), options),
        quoteNumber: normalizeLabel(readCell(row, ["Nº Orçamento", "No Orçamento", "N Orçamento"])),
        quoteDate: parseSpreadsheetDate(readCell(row, ["Data do orçamento", "Data do orcamento"]), options),
        quoteNotes: normalizeLabel(readCell(row, ["Notas"])),
        approvedStatus: normalizeBooleanStatus(readCell(row, ["Aprovado"])),
        deliveredStatus: normalizeBooleanStatus(readCell(row, ["Entregue"])),
        chargedStatus: normalizeBooleanStatus(readCell(row, ["Cobrado"])),
        extraNotes: [
            normalizeLabel(readCell(row, ["Coluna 1"])),
            normalizeLabel(readCell(row, ["Coluna 2"]))
        ].filter(Boolean).join("\n"),
        source: "quote-sheet"
    });
}

export function mergePlenoHotelRecords(left = {}, right = {}) {
    const merged = { ...left, ...right };
    merged.bedSizes = right.bedSizes?.length ? right.bedSizes : (left.bedSizes || []);
    merged.quoteLinks = [
        ...(Array.isArray(left.quoteLinks) ? left.quoteLinks : []),
        ...(Array.isArray(right.quoteLinks) ? right.quoteLinks : [])
    ].filter((link, index, links) => {
        const url = normalizeLabel(link?.url);
        return url && links.findIndex((entry) => normalizeLabel(entry?.url) === url) === index;
    });
    merged.invoiceLinks = [
        ...(Array.isArray(left.invoiceLinks) ? left.invoiceLinks : []),
        ...(Array.isArray(right.invoiceLinks) ? right.invoiceLinks : [])
    ].filter((link, index, links) => {
        const url = normalizeLabel(link?.url);
        return url && links.findIndex((entry) => normalizeLabel(entry?.url) === url) === index;
    });
    return normalizePlenoHotelRecord(merged);
}

export function normalizePlenoHotelRecord(record = {}) {
    const propertyName = normalizeLabel(record.propertyName);
    const subtotal = parseMoney(record.plenoSubtotal);
    const commissionRate = Number(record.commissionRate) || 0;
    const commissionAmount = record.commissionAmount !== undefined && record.commissionAmount !== ""
        ? parseMoney(record.commissionAmount)
        : subtotal * (commissionRate / 100);
    const ownerChargeTotal = record.ownerChargeTotal !== undefined && record.ownerChargeTotal !== ""
        ? parseMoney(record.ownerChargeTotal)
        : subtotal + commissionAmount;

    const normalized = {
        id: record.id || getRecordIdForName(propertyName || "PlenoHotel record"),
        propertyName,
        location: normalizeLabel(record.location),
        needStatus: record.needStatus || "unknown",
        needRaw: normalizeLabel(record.needRaw),
        askedStatus: record.askedStatus || "unknown",
        authorizationStatus: record.authorizationStatus || "unknown",
        bedSizesKnownStatus: record.bedSizesKnownStatus || (record.bedSizes?.length ? "yes" : "unknown"),
        boughtStatus: record.boughtStatus || "unknown",
        purchaseDate: normalizeLabel(record.purchaseDate),
        emailSentDate: normalizeLabel(record.emailSentDate),
        quoteNumber: normalizeLabel(record.quoteNumber),
        quoteDate: normalizeLabel(record.quoteDate),
        quoteNotes: normalizeLabel(record.quoteNotes),
        approvedStatus: record.approvedStatus || "unknown",
        deliveredStatus: record.deliveredStatus || "unknown",
        chargedStatus: record.chargedStatus || "unknown",
        plenoHotelInvoice: normalizeLabel(record.plenoHotelInvoice),
        extraNotes: normalizeLabel(record.extraNotes),
        internalNotes: normalizeLabel(record.internalNotes),
        supplierEmail: normalizeLabel(record.supplierEmail),
        ownerEmail: normalizeLabel(record.ownerEmail),
        plenoSubtotal: subtotal,
        commissionRate,
        commissionAmount,
        ownerChargeTotal,
        bedSizes: Array.isArray(record.bedSizes) ? record.bedSizes.map((entry) => ({
            raw: normalizeLabel(entry.raw || `${entry.quantity || 1} - ${entry.width || ""}x${entry.length || ""}`),
            quantity: Number(entry.quantity) || 1,
            width: entry.width === null || entry.width === undefined || entry.width === "" ? null : Number(entry.width),
            length: entry.length === null || entry.length === undefined || entry.length === "" ? null : Number(entry.length)
        })) : [],
        quoteLinks: Array.isArray(record.quoteLinks) ? record.quoteLinks : [],
        invoiceLinks: Array.isArray(record.invoiceLinks) ? record.invoiceLinks : [],
        source: record.source || "manual"
    };

    normalized.workflowStage = getWorkflowStage(normalized).key;
    return normalized;
}

export function getWorkflowStage(record = {}) {
    const need = record.needStatus || "unknown";
    if (need === "no") return PLENOHOTEL_WORKFLOW_STAGES.notNeeded;
    if (need === "ask" || need === "unknown" || need === "pending") return PLENOHOTEL_WORKFLOW_STAGES.needsQuestion;
    if (need === "later") return PLENOHOTEL_WORKFLOW_STAGES.needsQuestion;
    if (record.authorizationStatus !== "yes") return PLENOHOTEL_WORKFLOW_STAGES.waitingAuthorization;
    if (!record.quoteNumber && record.boughtStatus !== "yes") return PLENOHOTEL_WORKFLOW_STAGES.needsQuote;
    if (record.deliveredStatus !== "yes" && record.boughtStatus !== "yes") return PLENOHOTEL_WORKFLOW_STAGES.waitingDelivery;
    if (record.chargedStatus !== "yes") return PLENOHOTEL_WORKFLOW_STAGES.waitingBilling;
    return PLENOHOTEL_WORKFLOW_STAGES.complete;
}

export function getRecordReminders(record = {}) {
    const reminders = [];
    const stage = getWorkflowStage(record);
    if (stage.key === "needsQuestion") reminders.push("Confirm if linen/towels are needed.");
    if (record.bedSizesKnownStatus !== "yes" || !record.bedSizes?.length) reminders.push("Collect bed sizes.");
    if (stage.key === "waitingAuthorization") reminders.push("Ask the owner for authorization.");
    if (stage.key === "needsQuote") reminders.push("Send quote request to PlenoHotel.");
    if (stage.key === "waitingDelivery") reminders.push("Follow up delivery with PlenoHotel.");
    if (stage.key === "waitingBilling") reminders.push("Charge the owner, including commission.");
    if (record.plenoSubtotal > 0 && record.commissionAmount <= 0) reminders.push("Set commission before charging the owner.");
    return reminders;
}

export function summarizePlenoHotelRecords(records = []) {
    const normalized = records.map(normalizePlenoHotelRecord);
    const stages = Object.fromEntries(Object.keys(PLENOHOTEL_WORKFLOW_STAGES).map((key) => [key, 0]));
    let needsBedSizes = 0;
    let waitingOwnerCharge = 0;
    let totalOwnerCharge = 0;
    let totalCommission = 0;

    normalized.forEach((record) => {
        stages[record.workflowStage] = (stages[record.workflowStage] || 0) + 1;
        if (record.bedSizesKnownStatus !== "yes" || !record.bedSizes.length) needsBedSizes += 1;
        if (record.workflowStage === "waitingBilling") waitingOwnerCharge += 1;
        totalOwnerCharge += record.ownerChargeTotal || 0;
        totalCommission += record.commissionAmount || 0;
    });

    return {
        total: normalized.length,
        stages,
        needsBedSizes,
        waitingOwnerCharge,
        totalOwnerCharge,
        totalCommission
    };
}

export function filterPlenoHotelRecords(records = [], { query = "", stage = "all" } = {}) {
    const normalizedQuery = normalizeText(query);
    return records
        .map(normalizePlenoHotelRecord)
        .filter((record) => stage === "all" || record.workflowStage === stage)
        .filter((record) => {
            if (!normalizedQuery) return true;
            return [
                record.propertyName,
                record.location,
                record.quoteNumber,
                record.quoteNotes,
                record.extraNotes,
                record.internalNotes
            ].some((value) => normalizeText(value).includes(normalizedQuery));
        })
        .sort((left, right) => {
            const leftStage = PLENOHOTEL_WORKFLOW_STAGES[left.workflowStage]?.order || 99;
            const rightStage = PLENOHOTEL_WORKFLOW_STAGES[right.workflowStage]?.order || 99;
            if (leftStage !== rightStage) return leftStage - rightStage;
            return left.propertyName.localeCompare(right.propertyName);
        });
}

export function parsePlenoHotelWorkbook(workbook, options = {}) {
    if (!workbook?.SheetNames || !workbook?.Sheets) {
        return [];
    }

    const quoteSheetName = workbook.SheetNames.find((name) => normalizeText(name).includes("orcamento") || normalizeText(name).includes("orçamento"));
    const linenSheetName = workbook.SheetNames.find((name) => normalizeText(name).includes("roupas") || normalizeText(name).includes("alojamento"));
    const byId = new Map();

    const addRecord = (record) => {
        if (!record) return;
        const existing = byId.get(record.id);
        byId.set(record.id, existing ? mergePlenoHotelRecords(existing, record) : normalizePlenoHotelRecord(record));
    };

    if (linenSheetName) {
        const rows = cleanSheetRows(XLSX.utils.sheet_to_json(workbook.Sheets[linenSheetName], { defval: "", range: 1 }));
        rows.map((row) => createRecordFromLinenRow(row, options)).forEach(addRecord);
    }

    if (quoteSheetName) {
        const rows = cleanSheetRows(XLSX.utils.sheet_to_json(workbook.Sheets[quoteSheetName], { defval: "", range: 1 }));
        rows.map((row) => createQuoteFromRow(row, options)).forEach(addRecord);
    }

    return [...byId.values()];
}

export function createPlenoHotelEmail(record = {}, template = "quoteRequest") {
    const normalized = normalizePlenoHotelRecord(record);
    const bedLines = normalized.bedSizes.length
        ? normalized.bedSizes.map((entry) => `- ${entry.raw}`).join("\n")
        : "- Bed sizes to confirm";
    const notes = [normalized.quoteNotes, normalized.internalNotes].filter(Boolean).join("\n");

    if (template === "ownerAuthorization") {
        return {
            to: normalized.ownerEmail || "",
            subject: `Autorização para roupas - ${normalized.propertyName}`,
            body: [
                "Olá,",
                "",
                `Para prepararmos o alojamento ${normalized.propertyName}, precisamos de confirmar a autorização para avançar com a compra de roupa de cama e toalhas.`,
                normalized.ownerChargeTotal ? `Valor previsto a cobrar ao proprietário: ${formatCurrency(normalized.ownerChargeTotal)}.` : "",
                "",
                "Pode confirmar se pretende que avancemos?",
                "",
                "Obrigado."
            ].filter(Boolean).join("\n")
        };
    }

    if (template === "deliveryFollowUp") {
        return {
            to: normalized.supplierEmail || "",
            subject: `Seguimento entrega ${normalized.quoteNumber || normalized.propertyName}`,
            body: [
                "Bom dia,",
                "",
                `Podem confirmar o estado da entrega do orçamento ${normalized.quoteNumber || ""} para ${normalized.propertyName}?`,
                "",
                "Obrigado."
            ].join("\n")
        };
    }

    return {
        to: normalized.supplierEmail || "",
        subject: `Pedido de orçamento - ${normalized.propertyName}`,
        body: [
            "Bom dia,",
            "",
            `Podem enviar orçamento para roupa de cama e toalhas para o alojamento ${normalized.propertyName}?`,
            "",
            "Tamanhos das camas:",
            bedLines,
            notes ? `\nNotas:\n${notes}` : "",
            "",
            "Obrigado."
        ].filter(Boolean).join("\n")
    };
}

export function createMailtoUrl(email) {
    const to = encodeURIComponent(email.to || "");
    const subject = encodeURIComponent(email.subject || "");
    const body = encodeURIComponent(email.body || "");
    return `mailto:${to}?subject=${subject}&body=${body}`;
}
