const DEFAULT_VAT_RATE = 22;

function toFiniteNumber(value, fallback = 0) {
    if (typeof value === 'string') {
        const compact = value.trim().replace(/\s/g, '');
        const normalized = compact.includes(',')
            ? compact.replace(/\./g, '').replace(',', '.')
            : compact;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundPurchaseValue(value, precision = 4) {
    const factor = 10 ** precision;
    return Math.round((toFiniteNumber(value, 0) + Number.EPSILON) * factor) / factor;
}

export function createPurchaseLine(overrides = {}) {
    return calculatePurchaseLine({
        id: overrides.id || `purchase-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        materialId: String(overrides.materialId || '').trim(),
        name: String(overrides.name || '').trim(),
        category: String(overrides.category || '').trim(),
        purchaseQuantity: overrides.purchaseQuantity ?? overrides.quantity ?? 1,
        unitsPerPurchaseUnit: overrides.unitsPerPurchaseUnit ?? 1,
        stockUnit: String(overrides.stockUnit || overrides.unit || 'unit').trim() || 'unit',
        unitPrice: overrides.unitPrice ?? 0,
        priceMode: overrides.priceMode === 'gross' ? 'gross' : 'net',
        discountPercent: overrides.discountPercent ?? 0,
        discountAmount: overrides.discountAmount ?? 0,
        vatRate: overrides.vatRate ?? DEFAULT_VAT_RATE,
        extraCostNet: overrides.extraCostNet ?? 0,
        recoverableDeposit: overrides.recoverableDeposit ?? 0,
        sourceCode: String(overrides.sourceCode || '').trim(),
        sourceDescription: String(overrides.sourceDescription || '').trim()
    });
}

export function calculatePurchaseLine(line = {}) {
    const purchaseQuantity = Math.max(0, toFiniteNumber(line.purchaseQuantity ?? line.quantity, 0));
    const unitsPerPurchaseUnit = Math.max(0.0001, toFiniteNumber(line.unitsPerPurchaseUnit, 1));
    const stockQuantity = roundPurchaseValue(purchaseQuantity * unitsPerPurchaseUnit, 4);
    const unitPrice = Math.max(0, toFiniteNumber(line.unitPrice, 0));
    const discountPercent = Math.min(100, Math.max(0, toFiniteNumber(line.discountPercent, 0)));
    const discountAmount = Math.max(0, toFiniteNumber(line.discountAmount, 0));
    const vatRate = Math.max(0, toFiniteNumber(line.vatRate, DEFAULT_VAT_RATE));
    const extraCostNet = Math.max(0, toFiniteNumber(line.extraCostNet, 0));
    const recoverableDeposit = Math.max(0, toFiniteNumber(line.recoverableDeposit, 0));
    const priceMode = line.priceMode === 'gross' ? 'gross' : 'net';
    const baseAmount = purchaseQuantity * unitPrice;
    const discountedAmount = Math.max(0, baseAmount * (1 - (discountPercent / 100)) - discountAmount);
    const merchandiseNet = priceMode === 'gross'
        ? discountedAmount / (1 + (vatRate / 100))
        : discountedAmount;
    const inventoryCostTotal = merchandiseNet + extraCostNet;
    const vatAmount = inventoryCostTotal * (vatRate / 100);
    const lineGross = inventoryCostTotal + vatAmount + recoverableDeposit;
    const roundedInventoryCostTotal = roundPurchaseValue(inventoryCostTotal, 2);

    return {
        ...line,
        purchaseQuantity: roundPurchaseValue(purchaseQuantity, 4),
        unitsPerPurchaseUnit: roundPurchaseValue(unitsPerPurchaseUnit, 4),
        stockQuantity,
        unitPrice: roundPurchaseValue(unitPrice, 5),
        discountPercent: roundPurchaseValue(discountPercent, 2),
        discountAmount: roundPurchaseValue(discountAmount, 2),
        vatRate: roundPurchaseValue(vatRate, 2),
        extraCostNet: roundPurchaseValue(extraCostNet, 2),
        recoverableDeposit: roundPurchaseValue(recoverableDeposit, 2),
        priceMode,
        merchandiseNet: roundPurchaseValue(merchandiseNet, 2),
        inventoryCostTotal: roundedInventoryCostTotal,
        vatAmount: roundPurchaseValue(vatAmount, 2),
        lineGross: roundPurchaseValue(lineGross, 2),
        unitCost: stockQuantity > 0
            ? roundPurchaseValue(roundedInventoryCostTotal / stockQuantity, 4)
            : 0
    };
}

export function summarizePurchase(purchase = {}) {
    const lines = (Array.isArray(purchase.lines) ? purchase.lines : [])
        .map((line) => calculatePurchaseLine(line));
    const totals = lines.reduce((summary, line) => {
        summary.stockQuantity += line.stockQuantity;
        summary.inventoryCostNet += line.inventoryCostTotal;
        summary.vat += line.vatAmount;
        summary.deposits += line.recoverableDeposit;
        summary.gross += line.lineGross;
        return summary;
    }, {
        stockQuantity: 0,
        inventoryCostNet: 0,
        vat: 0,
        deposits: 0,
        gross: 0
    });

    Object.keys(totals).forEach((key) => {
        totals[key] = roundPurchaseValue(totals[key], key === 'stockQuantity' ? 4 : 2);
    });

    const cardCredit = Math.max(0, toFiniteNumber(purchase.cardCredit, 0));
    const cashPaidIsAutomatic = purchase.cashPaidIsAutomatic === true
        || purchase.cashPaid === ''
        || purchase.cashPaid === null
        || purchase.cashPaid === undefined;
    const cashPaid = cashPaidIsAutomatic
        ? roundPurchaseValue(Math.max(0, totals.gross - cardCredit), 2)
        : roundPurchaseValue(Math.max(0, toFiniteNumber(purchase.cashPaid, 0)), 2);

    return {
        ...purchase,
        supplier: String(purchase.supplier || '').trim(),
        invoiceNumber: String(purchase.invoiceNumber || '').trim(),
        date: String(purchase.date || '').trim(),
        lines,
        cardCredit: roundPurchaseValue(cardCredit, 2),
        cashPaid,
        cashPaidIsAutomatic,
        totals
    };
}

export function calculateWeightedAverageCost({ currentQuantity = 0, currentUnitCost = 0, addedQuantity = 0, addedUnitCost = 0 } = {}) {
    const existingQuantity = Math.max(0, toFiniteNumber(currentQuantity, 0));
    const incomingQuantity = Math.max(0, toFiniteNumber(addedQuantity, 0));
    const combinedQuantity = existingQuantity + incomingQuantity;

    if (combinedQuantity <= 0) return 0;

    return roundPurchaseValue(
        ((existingQuantity * Math.max(0, toFiniteNumber(currentUnitCost, 0)))
            + (incomingQuantity * Math.max(0, toFiniteNumber(addedUnitCost, 0))))
        / combinedQuantity,
        4
    );
}

function normalizeInvoiceText(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function invoiceLines(text) {
    return normalizeInvoiceText(text)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function parseDateToIso(value) {
    const match = String(value || '').match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})|(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
    if (!match) return '';
    if (match[1]) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    return `${match[6]}-${match[5].padStart(2, '0')}-${match[4].padStart(2, '0')}`;
}

function matchMoneyAfter(text, label) {
    const match = normalizeInvoiceText(text).match(new RegExp(`${label}[^\\d]*([\\d.]+[.,]\\d{2})`, 'i'));
    return match ? toFiniteNumber(match[1], 0) : 0;
}

function matchInvoiceTotal(text) {
    const normalized = normalizeInvoiceText(text);
    const totalMatch = normalized.match(/Total\s*\(\s*EUR\s*\)\s*([\d.]+[.,]\d{2})/i);
    return totalMatch ? toFiniteNumber(totalMatch[1], 0) : matchMoneyAfter(normalized, 'Total');
}

function parseContinente(text) {
    const lines = invoiceLines(text);
    const normalized = normalizeInvoiceText(text);
    const items = [];
    const invoiceMatch = normalized.match(/Nro:\s*([^\n]+?)\s+(\d{2}[/.]\d{2}[/.]20\d{2})/i);

    lines.forEach((line, index) => {
        if (!/^\([A-Z]\)\s+/i.test(line)) return;
        const quantityLine = lines.slice(index + 1, index + 3)
            .find((candidate) => /\d+[.,]\d+\s+X\s+\d+[.,]\d+\s+\d+[.,]\d{2}/i.test(candidate));
        if (!quantityLine) return;
        const match = quantityLine.match(/(\d+[.,]\d+)\s+X\s+(\d+[.,]\d+)\s+(\d+[.,]\d{2})/i);
        if (!match) return;
        const description = line.replace(/^\([A-Z]\)\s+/i, '').trim();
        items.push(createPurchaseLine({
            name: description.replace(/\s+KG$/i, '').trim(),
            category: 'fruit',
            purchaseQuantity: toFiniteNumber(match[1], 0),
            unitsPerPurchaseUnit: 1,
            stockUnit: 'kg',
            unitPrice: toFiniteNumber(match[2], 0),
            priceMode: 'gross',
            vatRate: 4,
            sourceDescription: description
        }));
    });

    return summarizePurchase({
        supplier: 'Continente',
        invoiceNumber: invoiceMatch?.[1]?.trim() || '',
        date: parseDateToIso(invoiceMatch?.[2] || normalized),
        cardCredit: matchMoneyAfter(normalized, 'Desconto Cart[aã]o Utilizado'),
        cashPaid: matchMoneyAfter(normalized, 'TOTAL A PAGAR'),
        importProfile: 'continente',
        lines: items
    });
}

function parseChabom(text) {
    const lines = invoiceLines(text);
    const normalized = normalizeInvoiceText(text);
    const items = [];
    const itemPattern = /^(\S+)\s+(.+?)\s+(\S+)\s+(\d+[.,]\d{4})\s+UN\s+(\d+[.,]\d{5})\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/i;

    lines.forEach((line, index) => {
        const match = line.match(itemPattern);
        if (!match) return;
        let itemName = match[2].trim();
        const nextLine = String(lines[index + 1] || '').trim();
        if (itemName.endsWith('-') && /^\d+\s*GRS$/i.test(nextLine)) itemName = `${itemName} ${nextLine}`;
        if (/-\s*\d+$/i.test(itemName)) itemName = `${itemName} GRS`;
        items.push(createPurchaseLine({
            name: itemName,
            purchaseQuantity: toFiniteNumber(match[4], 0),
            unitsPerPurchaseUnit: 1,
            stockUnit: 'unit',
            unitPrice: toFiniteNumber(match[5], 0),
            discountPercent: toFiniteNumber(match[6], 0),
            priceMode: 'net',
            vatRate: toFiniteNumber(match[7], 22),
            sourceCode: match[1],
            sourceDescription: itemName
        }));
    });

    return summarizePurchase({
        supplier: 'Chábom',
        invoiceNumber: normalized.match(/Fatura\s+FT\s+([^\s]+)\s/i)?.[1] || '',
        date: parseDateToIso(normalized.match(/Data\s+(20\d{2}-\d{2}-\d{2})/i)?.[1] || normalized),
        cashPaid: matchInvoiceTotal(normalized),
        importProfile: 'chabom',
        lines: items
    });
}

function findNearbyQuantityLine(lines, index, vatRate) {
    const candidates = lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 4));
    const pattern = new RegExp(`(?:^|\\s)(\\d{2,4})(?:[.,]00)?\\s+${vatRate}%?\\s+10\\s+(\\d+[.,]\\d{2})(?:$|\\s)`, 'i');
    for (const candidate of candidates) {
        const match = candidate.match(pattern);
        if (match) return { quantity: toFiniteNumber(match[1], 0), gross: toFiniteNumber(match[2], 0) };
    }
    return null;
}

function parseCoral(text) {
    const lines = invoiceLines(text);
    const normalized = normalizeInvoiceText(text);
    const items = [];
    const atcudInvoiceNumber = normalized.match(/ATCUD[^\n]*-(\d{5,8})/i)?.[1] || '';
    const printedInvoiceNumber = normalized.match(/FR\s+(\d+\/\d+)/i)?.[1] || '';

    lines.forEach((line, index) => {
        const isWater = /AGUA\s+ATLANTIDA/i.test(line);
        const isBrisa = /BRISA\s+MARACUJA/i.test(line);
        if (!isWater && !isBrisa) return;
        const vatRate = isWater ? 12 : 22;
        const numeric = findNearbyQuantityLine(lines, index, vatRate);
        const nearbyLines = lines.slice(index, Math.min(lines.length, index + 4));
        const depositMatch = nearbyLines.join(' ').match(/VOLTA\s+(\d{2,4})(?:[.,]00)?\s+0[^\d]{0,3}0\s+(\d+[.,]\d{2})/i);
        const quantity = depositMatch ? toFiniteNumber(depositMatch[1], 0) : numeric?.quantity;
        const deposit = depositMatch ? toFiniteNumber(depositMatch[2], 0) : roundPurchaseValue((quantity || 0) * 0.1, 2);
        if (!quantity || !numeric?.gross) return;
        items.push(createPurchaseLine({
            name: isWater ? 'Água Atlântida' : 'Brisa Maracujá',
            category: 'drinks',
            purchaseQuantity: quantity,
            unitsPerPurchaseUnit: 1,
            stockUnit: 'bottle',
            unitPrice: numeric.gross / quantity,
            priceMode: 'gross',
            vatRate,
            recoverableDeposit: deposit,
            sourceDescription: line
        }));
    });

    return summarizePurchase({
        supplier: 'Loja Coral',
        invoiceNumber: atcudInvoiceNumber
            ? `FR 1/${atcudInvoiceNumber}`
            : printedInvoiceNumber
                ? `FR ${printedInvoiceNumber}`
            : '',
        date: parseDateToIso(normalized.match(/Data:\s*([^\s]+)/i)?.[1] || normalized),
        cashPaid: matchMoneyAfter(normalized, 'Total'),
        importProfile: 'coral',
        lines: items
    });
}

function parseHenriques(text) {
    const lines = invoiceLines(text);
    const normalized = normalizeInvoiceText(text);
    const lots = [];

    lines.forEach((line) => {
        if (!/AQ\s+Medium\s+Rich/i.test(line)) return;
        const numbers = [...line.matchAll(/\d+[.,]\d+/g)].map((match) => toFiniteNumber(match[0], 0));
        const quantity = numbers.find((value) => value >= 100 && value < 1000);
        const unitPrice = numbers.find((value) => value >= 3 && value < 4);
        const discountPercent = numbers.find((value) => value === 15) || 15;
        if (quantity && unitPrice) lots.push({ quantity, unitPrice, discountPercent });
    });

    const totalQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const merchandiseNet = lots.reduce((sum, lot) => sum + (lot.quantity * lot.unitPrice * (1 - lot.discountPercent / 100)), 0);
    const iec = matchMoneyAfter(normalized, 'IEC\\/Outras Contribui[cç][oõ]es');
    const item = totalQuantity > 0 ? createPurchaseLine({
        name: 'Madeira wine 37.5cl Medium Rich',
        category: 'drinks',
        purchaseQuantity: totalQuantity,
        unitsPerPurchaseUnit: 1,
        stockUnit: 'bottle',
        unitPrice: merchandiseNet / totalQuantity,
        priceMode: 'net',
        vatRate: 22,
        extraCostNet: iec,
        sourceDescription: 'Gfa/Bt 37,5cl AQ Medium Rich'
    }) : null;

    return summarizePurchase({
        supplier: 'Henriques & Henriques',
        invoiceNumber: normalized.match(/Fatura\s+FT\s+([^\s]+)/i)?.[1] || '',
        date: parseDateToIso(normalized.match(/Data\s+(20\d{2}-\d{2}-\d{2})/i)?.[1] || normalized),
        cashPaid: matchInvoiceTotal(normalized),
        importProfile: 'henriques',
        lines: item ? [item] : []
    });
}

export function parseWelcomePackInvoiceText(text) {
    const normalized = normalizeInvoiceText(text);
    const upper = normalized.toUpperCase();
    let purchase;

    if (upper.includes('CONTINENTE') || upper.includes('MODELO CONTINENTE')) {
        purchase = parseContinente(normalized);
    } else if (upper.includes('CHÁBOM') || upper.includes('CHABOM')) {
        purchase = parseChabom(normalized);
    } else if (upper.includes('MISTURA GLACIAR') || upper.includes('LOJA CORAL')) {
        purchase = parseCoral(normalized);
    } else if (upper.includes('HENRIQUES E HENRIQUES') || upper.includes('HENRIQUES & HENRIQUES')) {
        purchase = parseHenriques(normalized);
    } else {
        purchase = summarizePurchase({
            supplier: '',
            invoiceNumber: '',
            date: parseDateToIso(normalized),
            importProfile: 'generic',
            lines: []
        });
    }

    return {
        ...purchase,
        rawText: normalized.slice(0, 50000),
        confidence: purchase.lines.length > 0 ? 'review' : 'manual'
    };
}

export function normalizeMaterialMatchKey(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function matchPurchaseLinesToMaterials(lines = [], materials = []) {
    const materialIndex = new Map(materials.map((material) => [
        normalizeMaterialMatchKey(material.name),
        material
    ]));

    return lines.map((line) => {
        const exact = materialIndex.get(normalizeMaterialMatchKey(line.name));
        return exact ? { ...line, materialId: exact.id, stockUnit: exact.stockUnit || line.stockUnit } : line;
    });
}
