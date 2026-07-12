const DATE_RANGE_PATTERN = /(\d{1,2})\s*\/+\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*\/+\s*(\d{1,2})/;
const DATE_PATTERN = /(\d{1,2})\s*\/+\s*(\d{1,2})/;
const MONEY_PATTERN = /(\d+(?:[,.]\d{1,2})?)/;
const YES_VALUES = new Set(['sim', 'yes', 'y']);
const NO_VALUES = new Set(['nao', 'não', 'no', 'n']);

export function parseCsvLine(line = '') {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const nextChar = line[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values;
}

export function parseCsvRows(csvContent = '') {
    return String(csvContent)
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((line) => parseCsvLine(line));
}

export function parseHeatedPoolsCsv(csvContent = '', options = {}) {
    const rows = parseCsvRows(csvContent);
    const year = Number(options.year) || extractYear(options.fileName) || new Date().getFullYear();
    const properties = [];
    const warnings = [];

    rows.forEach((row, rowIndex) => {
        if (!row.some((cell) => normalizeText(cell).toLowerCase() === 'alojamentos')) {
            return;
        }

        const propertyRowIndex = rowIndex + 1;
        const pricingRowIndex = rowIndex + 2;
        const poolStateRowIndex = rowIndex + 3;
        const propertyRow = rows[propertyRowIndex] || [];
        const pricingRow = rows[pricingRowIndex] || [];
        const poolStateRow = rows[poolStateRowIndex] || [];
        const nextSectionIndex = findNextSectionIndex(rows, rowIndex + 1);
        const dataRows = rows.slice(poolStateRowIndex + 1, nextSectionIndex);
        const blockStarts = collectBlockStarts(propertyRow, pricingRow, poolStateRow);

        blockStarts.forEach((block, blockIndex) => {
            const nextStart = blockStarts[blockIndex + 1]?.columnIndex ?? maxRowLength(rows);
            const blockEnd = nextStart - 1;
            const property = parsePropertyBlock({
                propertyName: block.name,
                startColumn: block.columnIndex,
                endColumn: blockEnd,
                pricingRow,
                poolStateRow,
                dataRows,
                year,
                sectionIndex: properties.length
            });

            if (property.reservations.length || property.notes.length || property.poolNote || property.chargeAmount !== null) {
                properties.push(property);
            } else {
                warnings.push(`No heated pool data found for ${block.name}`);
            }
        });
    });

    const mergedProperties = mergeDuplicateProperties(properties);

    return {
        year,
        properties: mergedProperties,
        warnings,
        summary: summarizePoolProperties(mergedProperties)
    };
}

export function buildHeatedPoolPlan(properties = [], options = {}) {
    const today = parseIsoDate(options.today) || startOfDay(new Date());
    const horizonDays = Number.isFinite(options.horizonDays) ? options.horizonDays : 14;
    const tasks = [];

    properties.forEach((property) => {
        property.reservations.forEach((reservation) => {
            if (reservation.heatingRequested !== true) {
                return;
            }

            const leadDays = resolveLeadDays(property);
            const switchOnDate = addDays(parseIsoDate(reservation.startDate), -leadDays);
            const switchOffDate = parseIsoDate(reservation.endDate);

            if (property.poolState !== 'always_on') {
                tasks.push(createPoolTask({
                    type: 'turn_on',
                    actionDate: switchOnDate,
                    today,
                    property,
                    reservation,
                    leadDays,
                    horizonDays
                }));
                tasks.push(createPoolTask({
                    type: 'turn_off',
                    actionDate: switchOffDate,
                    today,
                    property,
                    reservation,
                    leadDays: 0,
                    horizonDays
                }));
            }

            if (reservation.paymentStatus !== 'yes' || reservation.avantioStatus === 'waiting') {
                tasks.push(createPoolTask({
                    type: 'payment_check',
                    actionDate: parseIsoDate(reservation.startDate),
                    today,
                    property,
                    reservation,
                    leadDays: 0,
                    horizonDays
                }));
            }
        });
    });

    const sortedTasks = tasks
        .filter((task) => task.visibility !== 'past-done')
        .sort((a, b) => {
            if (a.actionDate !== b.actionDate) {
                return a.actionDate.localeCompare(b.actionDate);
            }
            return a.propertyName.localeCompare(b.propertyName);
        });

    return {
        today: formatDate(today),
        tasks: sortedTasks,
        overdue: sortedTasks.filter((task) => task.status === 'overdue'),
        todayTasks: sortedTasks.filter((task) => task.status === 'today'),
        upcoming: sortedTasks.filter((task) => task.status === 'upcoming'),
        later: sortedTasks.filter((task) => task.status === 'later'),
        completed: sortedTasks.filter((task) => task.status === 'done')
    };
}

export function summarizePoolProperties(properties = []) {
    const reservations = properties.flatMap((property) => property.reservations);
    const requested = reservations.filter((reservation) => reservation.heatingRequested === true);
    const pendingPayments = requested.filter((reservation) => reservation.paymentStatus !== 'yes');

    return {
        properties: properties.length,
        reservations: reservations.length,
        requested: requested.length,
        pendingPayments: pendingPayments.length,
        alwaysOn: properties.filter((property) => property.poolState === 'always_on').length,
        unavailable: properties.filter((property) => property.poolState === 'unavailable').length
    };
}

function mergeDuplicateProperties(properties = []) {
    const byName = new Map();

    properties.forEach((property) => {
        const key = normalizeForCompare(property.propertyName);
        const existing = byName.get(key);
        if (!existing) {
            byName.set(key, {
                ...property,
                notes: [...property.notes],
                reservations: [...property.reservations]
            });
            return;
        }

        existing.chargeAmount = existing.chargeAmount ?? property.chargeAmount;
        existing.ownerCostAmount = existing.ownerCostAmount ?? property.ownerCostAmount;
        existing.poolNote = existing.poolNote || property.poolNote;
        existing.lastChangeDate = existing.lastChangeDate || property.lastChangeDate;
        if (existing.poolState === 'unknown' && property.poolState !== 'unknown') {
            existing.poolState = property.poolState;
        }
        existing.notes = uniqueValues([...existing.notes, ...property.notes]);
        existing.reservations = [...existing.reservations, ...property.reservations]
            .sort((a, b) => a.startDate.localeCompare(b.startDate));
    });

    return [...byName.values()];
}

function parsePropertyBlock({ propertyName, startColumn, endColumn, pricingRow, poolStateRow, dataRows, year, sectionIndex }) {
    const pricingCells = getBlockCells(pricingRow, startColumn, endColumn);
    const poolNote = normalizeText(poolStateRow[startColumn] || firstMeaningfulCell(getBlockCells(poolStateRow, startColumn, endColumn)));
    const state = parsePoolState(poolNote, year);
    const reservations = [];
    const notes = [];

    dataRows.forEach((row, rowOffset) => {
        const cells = getBlockCells(row, startColumn, endColumn).map(normalizeText);
        const absoluteRow = rowOffset + 1;
        const dateCellIndex = cells.findIndex((cell) => DATE_RANGE_PATTERN.test(cell));

        if (dateCellIndex >= 0) {
            const reservation = parseReservationRow({
                cells,
                dateCellIndex,
                year,
                propertyName,
                rowNumber: absoluteRow
            });
            if (reservation) {
                reservations.push(reservation);
            }
            return;
        }

        const note = cells
            .filter((cell) => cell && !isYesNo(cell))
            .join(' ')
            .trim();
        if (note) {
            notes.push(note);
        }
    });

    return {
        id: `pool_${sectionIndex}_${slugify(propertyName)}`,
        propertyName,
        chargeAmount: parseMoneyValue(pricingCells.find((cell) => normalizeText(cell).toLowerCase().includes('cobrar'))),
        ownerCostAmount: parseMoneyValue(pricingCells.find((cell) => normalizeText(cell).toLowerCase().includes('avantio'))),
        poolNote,
        poolState: state.poolState,
        lastChangeDate: state.lastChangeDate,
        notes: uniqueValues(notes),
        reservations
    };
}

function collectBlockStarts(propertyRow = [], pricingRow = [], poolStateRow = []) {
    const starts = [];
    const usedColumns = new Set();

    propertyRow.forEach((cell, columnIndex) => {
        const name = normalizeText(cell);
        if (!name) {
            return;
        }
        starts.push({ name, columnIndex });
        usedColumns.add(columnIndex);
    });

    pricingRow.forEach((cell, columnIndex) => {
        const name = normalizeText(cell);
        if (
            !name
            || usedColumns.has(columnIndex)
            || !normalizeText(poolStateRow[columnIndex])
            || !looksLikePropertyName(name)
        ) {
            return;
        }

        starts.push({ name, columnIndex });
        usedColumns.add(columnIndex);
    });

    return starts.sort((a, b) => a.columnIndex - b.columnIndex);
}

function parseReservationRow({ cells, dateCellIndex, year, propertyName, rowNumber }) {
    const dateCell = cells[dateCellIndex];
    const range = parseDateRange(dateCell, year);
    if (!range) {
        return null;
    }

    const requestStatus = normalizeStatus(cells[dateCellIndex - 1]);
    const paymentStatus = normalizeStatus(cells[dateCellIndex + 1]);
    const avantioStatus = normalizeStatus(cells[dateCellIndex + 2]);
    const rowNotes = [
        cells[dateCellIndex + 3],
        ...cells.filter((cell, index) => {
            return index !== dateCellIndex
                && index !== dateCellIndex - 1
                && index !== dateCellIndex + 1
                && index !== dateCellIndex + 2
                && cell
                && !isYesNo(cell)
                && !DATE_RANGE_PATTERN.test(cell);
        })
    ].filter(Boolean);

    return {
        id: `${slugify(propertyName)}_${rowNumber}_${range.startDate}_${range.endDate}`,
        propertyName,
        dateRange: range.label,
        startDate: range.startDate,
        endDate: range.endDate,
        heatingRequested: requestStatus === 'yes' ? true : requestStatus === 'no' ? false : null,
        requestStatus,
        paymentStatus,
        avantioStatus,
        notes: uniqueValues(rowNotes).join(' ')
    };
}

function createPoolTask({ type, actionDate, today, property, reservation, leadDays, horizonDays }) {
    const completed = isTaskComplete(type, property, actionDate);
    const daysUntil = differenceInDays(actionDate, today);
    let status = 'later';
    let visibility = 'visible';

    if (completed) {
        status = 'done';
        visibility = daysUntil < 0 ? 'past-done' : 'visible';
    } else if (daysUntil < 0) {
        status = 'overdue';
    } else if (daysUntil === 0) {
        status = 'today';
    } else if (daysUntil <= horizonDays) {
        status = 'upcoming';
    }

    return {
        id: `${type}_${property.id}_${reservation.id}`,
        type,
        status,
        visibility,
        actionDate: formatDate(actionDate),
        daysUntil,
        propertyName: property.propertyName,
        reservation,
        leadDays,
        poolState: property.poolState,
        poolNote: property.poolNote,
        notes: property.notes
    };
}

function isTaskComplete(type, property, actionDate) {
    if (type === 'turn_on') {
        return property.poolState === 'on' || property.poolState === 'always_on';
    }

    const lastChangeDate = parseIsoDate(property.lastChangeDate);
    if (!lastChangeDate) {
        return false;
    }

    if (type === 'turn_off') {
        return property.poolState === 'off' && lastChangeDate >= actionDate;
    }

    return false;
}

function parsePoolState(note = '', year) {
    const normalized = normalizeForCompare(note);
    const dateMatch = note.match(DATE_PATTERN);
    const lastChangeDate = dateMatch
        ? formatDate(new Date(year, Number(dateMatch[2]) - 1, Number(dateMatch[1])))
        : null;

    if (normalized.includes('sempre ligada')) {
        return { poolState: 'always_on', lastChangeDate };
    }
    if (normalized.includes('nao funciona') || normalized.includes('não funciona')) {
        return { poolState: 'unavailable', lastChangeDate };
    }
    if (normalized.includes('deslig')) {
        return { poolState: 'off', lastChangeDate };
    }
    if (normalized.includes('ligad')) {
        return { poolState: 'on', lastChangeDate };
    }
    return { poolState: 'unknown', lastChangeDate };
}

function parseDateRange(value = '', year) {
    const match = normalizeText(value).match(DATE_RANGE_PATTERN);
    if (!match) {
        return null;
    }

    const startDay = Number(match[1]);
    const startMonth = Number(match[2]);
    const endDay = Number(match[3]);
    const endMonth = Number(match[4]);
    const start = new Date(year, startMonth - 1, startDay);
    let endYear = year;

    if (endMonth < startMonth) {
        endYear += 1;
    }

    const end = new Date(endYear, endMonth - 1, endDay);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }

    return {
        label: `${startDay}/${startMonth} - ${endDay}/${endMonth}`,
        startDate: formatDate(start),
        endDate: formatDate(end)
    };
}

function resolveLeadDays(property) {
    const configuredLeadDays = Number.parseInt(property?.heatUpDays, 10);
    if (Number.isFinite(configuredLeadDays) && configuredLeadDays > 0) {
        return configuredLeadDays;
    }

    const noteText = [property.poolNote, ...property.notes].join(' ').toLowerCase();
    if (/\b2\s*(dias|days)\b|dois\s+dias|two\s+days/.test(noteText)) {
        return 2;
    }
    return 1;
}

function normalizeStatus(value = '') {
    const normalized = normalizeForCompare(value);
    if (YES_VALUES.has(normalized)) {
        return 'yes';
    }
    if (NO_VALUES.has(normalized)) {
        return 'no';
    }
    if (normalized.includes('espera')) {
        return 'waiting';
    }
    return normalized ? 'unknown' : 'blank';
}

function isYesNo(value = '') {
    const normalized = normalizeForCompare(value);
    return YES_VALUES.has(normalized) || NO_VALUES.has(normalized) || normalized.includes('espera');
}

function extractYear(fileName = '') {
    const match = String(fileName).match(/\b(20\d{2})\b/);
    return match ? Number(match[1]) : null;
}

function findNextSectionIndex(rows, startIndex) {
    for (let index = startIndex; index < rows.length; index += 1) {
        if (rows[index].some((cell) => normalizeText(cell).toLowerCase() === 'alojamentos')) {
            return index;
        }
    }
    return rows.length;
}

function maxRowLength(rows) {
    return rows.reduce((max, row) => Math.max(max, row.length), 0);
}

function getBlockCells(row = [], startColumn, endColumn) {
    return row.slice(startColumn, endColumn + 1);
}

function firstMeaningfulCell(cells = []) {
    return cells.find((cell) => normalizeText(cell)) || '';
}

function parseMoneyValue(value = '') {
    const match = normalizeText(value).match(MONEY_PATTERN);
    if (!match) {
        return null;
    }
    return Number(match[1].replace(',', '.'));
}

function looksLikePropertyName(value = '') {
    const normalized = normalizeForCompare(value);
    return Boolean(normalized)
        && !normalized.startsWith('cobrar')
        && !normalized.startsWith('avantio')
        && normalized !== 'pago'
        && normalized !== 'pago?'
        && normalized !== 'sim'
        && normalized !== 'nao'
        && !MONEY_PATTERN.test(normalized);
}

const MOJIBAKE_TEXT_REPLACEMENTS = [
    ['N\u00c3\u00a3o', 'Não'],
    ['\u00c3\u20ac', 'À'],
    ['\u00c3\u00a1', 'á'],
    ['\u00c3\u00a2', 'â'],
    ['\u00c3\u00a9', 'é'],
    ['\u00c3\u00aa', 'ê'],
    ['\u00c3\u00ad', 'í'],
    ['\u00c3\u00b3', 'ó'],
    ['\u00c3\u00b5', 'õ'],
    ['\u00c3\u00ba', 'ú'],
    ['\u00c3\u00a7', 'ç'],
    ['\u00e2\u201a\u00ac', '€']
];

function normalizeText(value = '') {
    let normalized = String(value);
    MOJIBAKE_TEXT_REPLACEMENTS.forEach(([broken, fixed]) => {
        normalized = normalized.replaceAll(broken, fixed);
    });
    return normalized
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeForCompare(value = '') {
    return normalizeText(value)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function slugify(value = '') {
    return normalizeForCompare(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'property';
}

function uniqueValues(values = []) {
    const seen = new Set();
    return values
        .map(normalizeText)
        .filter((value) => {
            if (!value || seen.has(value)) {
                return false;
            }
            seen.add(value);
            return true;
        });
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function differenceInDays(date, baseDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((startOfDay(date) - startOfDay(baseDate)) / msPerDay);
}

function parseIsoDate(value) {
    if (!value) {
        return null;
    }
    if (value instanceof Date) {
        return startOfDay(value);
    }
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        return null;
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
