export const CLEANING_AH_DEFAULTS = Object.freeze({
    platformCommissionRate: 0.155,
    vatRate: 0.22,
    vatMode: 'extract',
    laundryRatePerKg: 2.6,
    suppliesCost: 0
});

export const CLEANING_AH_RESERVATION_SOURCES = Object.freeze({
    platform: 'platform',
    direct: 'direct'
});

const CSV_COLUMN_INDEXES = Object.freeze({
    date: 1,
    monthLabel: 2,
    propertyName: 3,
    category: 4,
    guestAmount: 5,
    platformCommission: 6,
    vatAmount: 7,
    totalToAhWithoutLaundry: 8,
    laundryAmount: 10,
    totalToAh: 11
});

function toFiniteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableFiniteNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

export function roundCurrency(value) {
    return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

export function parseEuroCurrency(value) {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? roundCurrency(value) : null;
    }

    const normalized = String(value || '')
        .replace(/\u00a0/g, '')
        .replace(/\u20ac/g, '')
        .replace(/\s+/g, '')
        .replace(/\.(?=\d{3}(?:,|$))/g, '')
        .replace(',', '.')
        .trim();

    if (!normalized || normalized === '-' || normalized === '--') {
        return null;
    }

    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? roundCurrency(parsed) : null;
}

export function parseDayFirstDate(value) {
    const match = String(value || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) {
        return '';
    }

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const year = Number.parseInt(match[3], 10);
    if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
        return '';
    }

    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (
        candidate.getUTCFullYear() !== year
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) {
        return '';
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getMonthKey(dateValue) {
    const normalized = String(dateValue || '').trim();
    const match = normalized.match(/^(\d{4})-(\d{2})-\d{2}$/);
    if (!match) {
        return '';
    }

    return `${match[1]}-${match[2]}`;
}

function normalizeLabel(value) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeAscii(value) {
    return normalizeLabel(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase();
}

function normalizeGroupingKey(value) {
    return normalizeLabel(value).toLocaleLowerCase();
}

function normalizeReservationSource(value) {
    return value === CLEANING_AH_RESERVATION_SOURCES.direct
        ? CLEANING_AH_RESERVATION_SOURCES.direct
        : CLEANING_AH_RESERVATION_SOURCES.platform;
}

function parseCsvRows(csvText) {
    const rows = [];
    const text = String(csvText || '').replace(/^\ufeff/, '');
    let currentCell = '';
    let currentRow = [];
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const nextCharacter = text[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                currentCell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (character === ',' && !inQuotes) {
            currentRow.push(currentCell);
            currentCell = '';
            continue;
        }

        if ((character === '\n' || character === '\r') && !inQuotes) {
            if (character === '\r' && nextCharacter === '\n') {
                index += 1;
            }
            currentRow.push(currentCell);
            rows.push(currentRow);
            currentRow = [];
            currentCell = '';
            continue;
        }

        currentCell += character;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
    }

    return rows;
}

export function computeCleaningAhAmounts(input = {}, defaults = CLEANING_AH_DEFAULTS) {
    const guestAmount = roundCurrency(toFiniteNumber(input.guestAmount, 0));
    const reservationSource = normalizeReservationSource(input.reservationSource);
    const platformCommissionRate = toFiniteNumber(
        reservationSource === CLEANING_AH_RESERVATION_SOURCES.direct ? 0 : input.platformCommissionRate,
        defaults.platformCommissionRate
    );
    const vatRate = toFiniteNumber(input.vatRate, defaults.vatRate);
    const vatMode = input.vatMode || defaults.vatMode || 'extract';
    const laundryRatePerKg = toFiniteNumber(
        input.laundryRatePerKg,
        defaults.laundryRatePerKg
    );
    const laundryKg = toNullableFiniteNumber(input.laundryKg);
    const suppliesCost = roundCurrency(toFiniteNumber(input.suppliesCost, defaults.suppliesCost));
    const explicitLaundryAmount = toNullableFiniteNumber(input.laundryAmount);

    const platformCommission = roundCurrency(guestAmount * platformCommissionRate);
    const vatAmount = roundCurrency(
        vatMode === 'flat'
            ? guestAmount * vatRate
            : guestAmount * (vatRate / (1 + vatRate))
    );
    const totalToAhWithoutLaundry = roundCurrency(guestAmount - platformCommission - vatAmount);
    const laundryAmount = roundCurrency(
        explicitLaundryAmount !== null
            ? explicitLaundryAmount
            : (laundryKg || 0) * laundryRatePerKg
    );
    const totalToAh = roundCurrency(totalToAhWithoutLaundry - laundryAmount - suppliesCost);
    const estimatedLaundryKg = laundryKg === null && laundryAmount > 0
        ? roundCurrency(laundryAmount / laundryRatePerKg)
        : null;

    return {
        guestAmount,
        reservationSource,
        platformCommissionRate,
        vatRate,
        vatMode,
        laundryRatePerKg,
        laundryKg,
        estimatedLaundryKg,
        suppliesCost,
        platformCommission,
        vatAmount,
        totalToAhWithoutLaundry,
        laundryAmount,
        totalToAh
    };
}

function buildValidationWarnings(importedValues, computedValues) {
    const comparisons = [
        ['platformCommissionMismatch', importedValues.platformCommission, computedValues.platformCommission],
        ['vatAmountMismatch', importedValues.vatAmount, computedValues.vatAmount],
        ['totalToAhWithoutLaundryMismatch', importedValues.totalToAhWithoutLaundry, computedValues.totalToAhWithoutLaundry],
        ['totalToAhMismatch', importedValues.totalToAh, computedValues.totalToAh]
    ];

    return comparisons
        .filter(([, importedValue]) => importedValue !== null)
        .filter(([, importedValue, computedValue]) => Math.abs(importedValue - computedValue) > 0.05)
        .map(([warning]) => warning);
}

export function createCleaningAhFingerprint(record = {}) {
    return [
        String(record.date || '').trim(),
        normalizeGroupingKey(record.propertyName),
        normalizeGroupingKey(record.category),
        roundCurrency(record.guestAmount || 0).toFixed(2),
        roundCurrency(record.laundryAmount || 0).toFixed(2),
        roundCurrency(record.totalToAh || 0).toFixed(2)
    ].join('|');
}

export function createCleaningAhRecord(input = {}, options = {}) {
    const defaults = { ...CLEANING_AH_DEFAULTS, ...(options.defaults || {}) };
    const preserveProvidedFinancials = Boolean(options.preserveProvidedFinancials);
    const date = String(input.date || '').trim();
    const monthKey = input.monthKey || getMonthKey(date);

    const importedValues = {
        platformCommission: toNullableFiniteNumber(input.platformCommission),
        vatAmount: toNullableFiniteNumber(input.vatAmount),
        totalToAhWithoutLaundry: toNullableFiniteNumber(input.totalToAhWithoutLaundry),
        totalToAh: toNullableFiniteNumber(input.totalToAh)
    };
    const inferredReservationSource = normalizeReservationSource(
        input.reservationSource || (
            importedValues.platformCommission !== null && importedValues.platformCommission === 0
                ? CLEANING_AH_RESERVATION_SOURCES.direct
                : CLEANING_AH_RESERVATION_SOURCES.platform
        )
    );
    const computedValues = computeCleaningAhAmounts({
        ...input,
        reservationSource: inferredReservationSource
    }, defaults);

    const finalFinancials = preserveProvidedFinancials
        ? {
            ...computedValues,
            platformCommission: importedValues.platformCommission ?? computedValues.platformCommission,
            vatAmount: importedValues.vatAmount ?? computedValues.vatAmount,
            totalToAhWithoutLaundry: importedValues.totalToAhWithoutLaundry ?? computedValues.totalToAhWithoutLaundry,
            totalToAh: importedValues.totalToAh ?? computedValues.totalToAh
        }
        : computedValues;

    const record = {
        date,
        monthKey,
        propertyName: normalizeLabel(input.propertyName),
        propertyId: normalizeLabel(input.propertyId),
        category: normalizeLabel(input.category) || 'Limpeza check-out',
        reservationSource: inferredReservationSource,
        source: input.source || 'manual',
        notes: normalizeLabel(input.notes),
        sourceMonthLabel: normalizeLabel(input.sourceMonthLabel),
        importBatchId: normalizeLabel(input.importBatchId),
        importRowNumber: Number.isInteger(input.importRowNumber) ? input.importRowNumber : null,
        ...finalFinancials
    };

    if (record.laundryKg === null && computedValues.estimatedLaundryKg !== null) {
        record.estimatedLaundryKg = computedValues.estimatedLaundryKg;
    }

    const warnings = preserveProvidedFinancials
        ? buildValidationWarnings(importedValues, computedValues)
        : [];
    if (warnings.length) {
        record.importWarnings = warnings;
    }

    record.fingerprint = createCleaningAhFingerprint(record);
    return record;
}

export function createStandaloneLaundryRecord(input = {}, defaults = CLEANING_AH_DEFAULTS) {
    const date = String(input.date || '').trim();
    const monthKey = input.monthKey || getMonthKey(date);
    const kg = roundCurrency(toFiniteNumber(input.kg, 0));
    const laundryRatePerKg = toFiniteNumber(
        input.laundryRatePerKg,
        defaults.laundryRatePerKg
    );
    const explicitAmount = toNullableFiniteNumber(input.amount);
    const amount = roundCurrency(explicitAmount !== null ? explicitAmount : kg * laundryRatePerKg);

    return {
        date,
        monthKey,
        propertyName: normalizeLabel(input.propertyName),
        propertyId: normalizeLabel(input.propertyId),
        linkedCleaningId: normalizeLabel(input.linkedCleaningId),
        kg,
        amount,
        laundryRatePerKg,
        notes: normalizeLabel(input.notes),
        source: input.source || 'manual'
    };
}

function findHeaderRowIndex(rows) {
    return rows.findIndex((row) => {
        const normalizedRow = row.map((cell) => normalizeAscii(cell));
        return normalizedRow[CSV_COLUMN_INDEXES.date] === 'data'
            && normalizedRow[CSV_COLUMN_INDEXES.category] === 'categoria'
            && normalizedRow[CSV_COLUMN_INDEXES.guestAmount] === 'valor'
            && normalizedRow[CSV_COLUMN_INDEXES.platformCommission] === 'plataforma'
            && normalizedRow[CSV_COLUMN_INDEXES.vatAmount] === 'iva';
    });
}

export function parseCleaningAhCsv(csvText, options = {}) {
    const defaults = { ...CLEANING_AH_DEFAULTS, ...(options.defaults || {}) };
    const rows = parseCsvRows(csvText);
    const headerRowIndex = findHeaderRowIndex(rows);
    if (headerRowIndex === -1) {
        return {
            records: [],
            warnings: ['headerRowNotFound']
        };
    }

    const records = [];
    const warnings = [];
    const dataRows = rows.slice(headerRowIndex + 1);

    dataRows.forEach((row, index) => {
        const rawDate = row[CSV_COLUMN_INDEXES.date];
        const propertyName = normalizeLabel(row[CSV_COLUMN_INDEXES.propertyName]);
        const category = normalizeLabel(row[CSV_COLUMN_INDEXES.category]);
        const hasMeaningfulData = row.some((cell) => normalizeLabel(cell) !== '');

        if (!hasMeaningfulData) {
            return;
        }

        const date = parseDayFirstDate(rawDate);
        if (!date || !propertyName) {
            return;
        }

        const record = createCleaningAhRecord({
            date,
            monthKey: getMonthKey(date),
            propertyName,
            category,
            guestAmount: parseEuroCurrency(row[CSV_COLUMN_INDEXES.guestAmount]) ?? 0,
            platformCommission: parseEuroCurrency(row[CSV_COLUMN_INDEXES.platformCommission]),
            vatAmount: parseEuroCurrency(row[CSV_COLUMN_INDEXES.vatAmount]),
            totalToAhWithoutLaundry: parseEuroCurrency(row[CSV_COLUMN_INDEXES.totalToAhWithoutLaundry]),
            laundryAmount: parseEuroCurrency(row[CSV_COLUMN_INDEXES.laundryAmount]) ?? 0,
            totalToAh: parseEuroCurrency(row[CSV_COLUMN_INDEXES.totalToAh]),
            source: 'import',
            importRowNumber: headerRowIndex + index + 2,
            sourceMonthLabel: normalizeLabel(row[CSV_COLUMN_INDEXES.monthLabel])
        }, {
            defaults,
            preserveProvidedFinancials: true
        });

        records.push(record);
        if (record.importWarnings?.length) {
            warnings.push(`${record.propertyName}:${record.importWarnings.join(',')}`);
        }
    });

    return { records, warnings };
}

function pushGroupedEntry(targetMap, key, label, record) {
    const existing = targetMap.get(key) || {
        key,
        label,
        count: 0,
        guestAmount: 0,
        platformCommission: 0,
        vatAmount: 0,
        totalToAhWithoutLaundry: 0,
        laundryAmount: 0,
        suppliesCost: 0,
        totalToAh: 0
    };

    existing.count += 1;
    existing.guestAmount = roundCurrency(existing.guestAmount + toFiniteNumber(record.guestAmount, 0));
    existing.platformCommission = roundCurrency(existing.platformCommission + toFiniteNumber(record.platformCommission, 0));
    existing.vatAmount = roundCurrency(existing.vatAmount + toFiniteNumber(record.vatAmount, 0));
    existing.totalToAhWithoutLaundry = roundCurrency(existing.totalToAhWithoutLaundry + toFiniteNumber(record.totalToAhWithoutLaundry, 0));
    existing.laundryAmount = roundCurrency(existing.laundryAmount + toFiniteNumber(record.effectiveLaundryAmount ?? record.laundryAmount, 0));
    existing.suppliesCost = roundCurrency(existing.suppliesCost + toFiniteNumber(record.suppliesCost, 0));
    existing.totalToAh = roundCurrency(existing.totalToAh + toFiniteNumber(record.effectiveTotalToAh ?? record.totalToAh, 0));

    targetMap.set(key, existing);
}

function sortSummaryEntries(entries, sortByLabelAscending = false) {
    return [...entries].sort((left, right) => {
        if (sortByLabelAscending) {
            return left.label.localeCompare(right.label);
        }

        if (right.totalToAh !== left.totalToAh) {
            return right.totalToAh - left.totalToAh;
        }

        if (right.count !== left.count) {
            return right.count - left.count;
        }

        return left.label.localeCompare(right.label);
    });
}

function buildLinkedLaundryMap(standaloneLaundryRecords = []) {
    const linkedLaundryMap = new Map();

    standaloneLaundryRecords.forEach((record) => {
        const linkedCleaningId = normalizeLabel(record.linkedCleaningId);
        if (!linkedCleaningId) {
            return;
        }

        const existing = linkedLaundryMap.get(linkedCleaningId) || {
            amount: 0,
            kg: 0,
            count: 0
        };
        existing.amount = roundCurrency(existing.amount + toFiniteNumber(record.amount, 0));
        existing.kg = roundCurrency(existing.kg + resolveLaundryKg(record));
        existing.count += 1;
        linkedLaundryMap.set(linkedCleaningId, existing);
    });

    return linkedLaundryMap;
}

export function deriveCleaningAhRecords(records = [], standaloneLaundryRecords = []) {
    const linkedLaundryMap = buildLinkedLaundryMap(standaloneLaundryRecords);

    return records.map((record) => {
        const inlineLaundryAmount = roundCurrency(toFiniteNumber(record.laundryAmount, 0));
        const linkedLaundry = linkedLaundryMap.get(record.id) || { amount: 0, kg: 0, count: 0 };
        const effectiveLaundryAmount = roundCurrency(inlineLaundryAmount + linkedLaundry.amount);
        const effectiveLaundryKg = roundCurrency(
            (inlineLaundryAmount > 0 ? resolveLaundryKg(record) : 0) + linkedLaundry.kg
        );
        const totalToAhWithoutLaundry = roundCurrency(
            toFiniteNumber(record.totalToAhWithoutLaundry, toFiniteNumber(record.totalToAh, 0))
        );
        const effectiveTotalToAh = roundCurrency(
            totalToAhWithoutLaundry - effectiveLaundryAmount - toFiniteNumber(record.suppliesCost, 0)
        );

        return {
            ...record,
            inlineLaundryAmount,
            linkedLaundryAmount: linkedLaundry.amount,
            linkedLaundryKg: linkedLaundry.kg,
            linkedLaundryCount: linkedLaundry.count,
            effectiveLaundryAmount,
            effectiveLaundryKg,
            effectiveTotalToAh
        };
    });
}

export function summarizeCleaningAhRecords(records = [], standaloneLaundryRecords = []) {
    const derivedRecords = deriveCleaningAhRecords(records, standaloneLaundryRecords);
    const monthGroups = new Map();
    const propertyGroups = new Map();
    const categoryGroups = new Map();

    const totals = {
        count: 0,
        guestAmount: 0,
        platformCommission: 0,
        vatAmount: 0,
        totalToAhWithoutLaundry: 0,
        laundryAmount: 0,
        suppliesCost: 0,
        totalToAh: 0,
        cleaningsWithLaundry: 0
    };

    derivedRecords.forEach((record) => {
        totals.count += 1;
        totals.guestAmount = roundCurrency(totals.guestAmount + toFiniteNumber(record.guestAmount, 0));
        totals.platformCommission = roundCurrency(totals.platformCommission + toFiniteNumber(record.platformCommission, 0));
        totals.vatAmount = roundCurrency(totals.vatAmount + toFiniteNumber(record.vatAmount, 0));
        totals.totalToAhWithoutLaundry = roundCurrency(totals.totalToAhWithoutLaundry + toFiniteNumber(record.totalToAhWithoutLaundry, 0));
        totals.laundryAmount = roundCurrency(totals.laundryAmount + toFiniteNumber(record.effectiveLaundryAmount, 0));
        totals.suppliesCost = roundCurrency(totals.suppliesCost + toFiniteNumber(record.suppliesCost, 0));
        totals.totalToAh = roundCurrency(totals.totalToAh + toFiniteNumber(record.effectiveTotalToAh, 0));
        if (toFiniteNumber(record.effectiveLaundryAmount, 0) > 0) {
            totals.cleaningsWithLaundry += 1;
        }

        pushGroupedEntry(monthGroups, record.monthKey || 'unknown', record.monthKey || 'Unknown', record);
        pushGroupedEntry(
            propertyGroups,
            normalizeGroupingKey(record.propertyName) || 'unknown',
            record.propertyName || 'Unknown',
            record
        );
        pushGroupedEntry(
            categoryGroups,
            normalizeGroupingKey(record.category) || 'unknown',
            record.category || 'Unknown',
            record
        );
    });

    totals.averageTotalToAh = totals.count
        ? roundCurrency(totals.totalToAh / totals.count)
        : 0;

    return {
        records: derivedRecords,
        totals,
        byMonth: sortSummaryEntries(monthGroups.values(), true),
        byProperty: sortSummaryEntries(propertyGroups.values()),
        byCategory: sortSummaryEntries(categoryGroups.values())
    };
}

function resolveLaundryKg(record) {
    const explicitKg = toNullableFiniteNumber(record.kg ?? record.laundryKg);
    if (explicitKg !== null) {
        return explicitKg;
    }

    const estimatedKg = toNullableFiniteNumber(record.estimatedLaundryKg);
    return estimatedKg !== null ? estimatedKg : 0;
}

export function summarizeLaundryRecords(cleaningRecords = [], standaloneLaundryRecords = []) {
    const cleaningsById = new Map(cleaningRecords.map((record) => [record.id, record]));
    const combinedEntries = [
        ...cleaningRecords
            .filter((record) => toFiniteNumber(record.laundryAmount, 0) > 0)
            .map((record) => ({
                id: record.id || '',
                date: record.date,
                monthKey: record.monthKey || getMonthKey(record.date),
                propertyName: record.propertyName,
                propertyId: record.propertyId || '',
                kg: resolveLaundryKg(record),
                amount: roundCurrency(record.laundryAmount),
                laundryRatePerKg: toFiniteNumber(record.laundryRatePerKg, CLEANING_AH_DEFAULTS.laundryRatePerKg),
                source: 'cleaning',
                category: record.category,
                linkedCleaningId: record.id || '',
                linkedCleaningDate: record.date || '',
                linkedCleaningCategory: record.category || '',
                notes: record.notes || ''
            })),
        ...standaloneLaundryRecords.map((record) => {
            const linkedCleaning = cleaningsById.get(record.linkedCleaningId);
            return {
                id: record.id || '',
                date: record.date,
                monthKey: record.monthKey || getMonthKey(record.date),
                propertyName: linkedCleaning?.propertyName || record.propertyName,
                propertyId: record.propertyId || '',
                kg: resolveLaundryKg(record),
                amount: roundCurrency(record.amount),
                laundryRatePerKg: toFiniteNumber(record.laundryRatePerKg, CLEANING_AH_DEFAULTS.laundryRatePerKg),
                source: record.source || 'manual',
                category: record.category || '',
                linkedCleaningId: linkedCleaning ? (record.linkedCleaningId || '') : '',
                linkedCleaningDate: linkedCleaning?.date || '',
                linkedCleaningCategory: linkedCleaning?.category || '',
                notes: record.notes || ''
            };
        })
    ].sort((left, right) => String(right.date).localeCompare(String(left.date)));

    const monthGroups = new Map();
    const propertyGroups = new Map();
    const totals = {
        count: 0,
        kg: 0,
        amount: 0
    };

    combinedEntries.forEach((entry) => {
        totals.count += 1;
        totals.kg = roundCurrency(totals.kg + resolveLaundryKg(entry));
        totals.amount = roundCurrency(totals.amount + toFiniteNumber(entry.amount, 0));

        const monthGroup = monthGroups.get(entry.monthKey) || {
            key: entry.monthKey,
            label: entry.monthKey,
            count: 0,
            kg: 0,
            amount: 0
        };
        monthGroup.count += 1;
        monthGroup.kg = roundCurrency(monthGroup.kg + resolveLaundryKg(entry));
        monthGroup.amount = roundCurrency(monthGroup.amount + toFiniteNumber(entry.amount, 0));
        monthGroups.set(entry.monthKey, monthGroup);

        const propertyKey = normalizeGroupingKey(entry.propertyName) || 'unknown';
        const propertyGroup = propertyGroups.get(propertyKey) || {
            key: propertyKey,
            label: entry.propertyName || 'Unknown',
            count: 0,
            kg: 0,
            amount: 0
        };
        propertyGroup.count += 1;
        propertyGroup.kg = roundCurrency(propertyGroup.kg + resolveLaundryKg(entry));
        propertyGroup.amount = roundCurrency(propertyGroup.amount + toFiniteNumber(entry.amount, 0));
        propertyGroups.set(propertyKey, propertyGroup);
    });

    return {
        totals,
        entries: combinedEntries,
        byMonth: [...monthGroups.values()].sort((left, right) => left.label.localeCompare(right.label)),
        byProperty: [...propertyGroups.values()].sort((left, right) => {
            if (right.amount !== left.amount) {
                return right.amount - left.amount;
            }

            return left.label.localeCompare(right.label);
        })
    };
}

function compareLaundryEntryDatesDescending(left, right) {
    return String(right.date || '').localeCompare(String(left.date || ''));
}

function compareLaundryEntryProperties(left, right) {
    return normalizeGroupingKey(left.propertyName).localeCompare(normalizeGroupingKey(right.propertyName));
}

function compareLaundryEntryNumbers(leftValue, rightValue) {
    return leftValue - rightValue;
}

export function filterLaundryRegisterEntries(entries = [], options = {}) {
    const filter = options.filter || 'all';
    const sort = options.sort || 'date-desc';

    const filteredEntries = entries.filter((entry) => {
        const hasLinkedCleaning = normalizeLabel(entry.linkedCleaningId) !== '';

        if (filter === 'linked') {
            return hasLinkedCleaning;
        }

        if (filter === 'unlinked') {
            return !hasLinkedCleaning;
        }

        return true;
    });

    return [...filteredEntries].sort((left, right) => {
        if (sort === 'date-asc') {
            return String(left.date || '').localeCompare(String(right.date || ''))
                || compareLaundryEntryProperties(left, right);
        }

        if (sort === 'property-asc') {
            return compareLaundryEntryProperties(left, right)
                || compareLaundryEntryDatesDescending(left, right);
        }

        if (sort === 'property-desc') {
            return compareLaundryEntryProperties(right, left)
                || compareLaundryEntryDatesDescending(left, right);
        }

        if (sort === 'kg-desc') {
            return compareLaundryEntryNumbers(toFiniteNumber(right.kg, 0), toFiniteNumber(left.kg, 0))
                || compareLaundryEntryDatesDescending(left, right);
        }

        if (sort === 'kg-asc') {
            return compareLaundryEntryNumbers(toFiniteNumber(left.kg, 0), toFiniteNumber(right.kg, 0))
                || compareLaundryEntryDatesDescending(left, right);
        }

        if (sort === 'amount-desc') {
            return compareLaundryEntryNumbers(toFiniteNumber(right.amount, 0), toFiniteNumber(left.amount, 0))
                || compareLaundryEntryDatesDescending(left, right);
        }

        if (sort === 'amount-asc') {
            return compareLaundryEntryNumbers(toFiniteNumber(left.amount, 0), toFiniteNumber(right.amount, 0))
                || compareLaundryEntryDatesDescending(left, right);
        }

        return compareLaundryEntryDatesDescending(left, right)
            || compareLaundryEntryProperties(left, right);
    });
}
