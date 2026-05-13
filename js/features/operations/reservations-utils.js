export const RESERVATION_SYSTEM_SHEETS = new Set([
    'Piscinas',
    'Manutenções',
    'Manutencoes',
    'Preset',
    'Reservas Longas Ativas',
    'Taxas'
]);

export const RESERVATION_COLUMNS = [
    ['status', 'Estado'],
    ['checkIn', 'In'],
    ['propertyName', 'Nome alojamento'],
    ['arrivalInfo', 'Chegada Voo'],
    ['flightNumber', 'Voo'],
    ['safeCode', 'Cofre'],
    ['checkInTime', 'Hora in'],
    ['heatedPool', 'Piscina Aq.'],
    ['poolPaidAmount', 'Pago'],
    ['poolAvantioAmount', 'Avantio'],
    ['infoStatus', 'Info'],
    ['firstMessageStatus', '1ª Mensagem'],
    ['phone', 'Número'],
    ['notes', 'Notas'],
    ['checkOut', 'Out'],
    ['adults', 'A'],
    ['children', 'C'],
    ['guestName', 'Nome'],
    ['guestFirstName', 'Cliente: Nome'],
    ['guestLastName', 'Cliente: Sobrenomes'],
    ['portal', 'Portal'],
    ['sefStatus', 'SEF'],
    ['nights', 'Noites'],
    ['touristTaxAmount', 'Taxa'],
    ['touristTaxPaidBy', 'Tax Paga?'],
    ['municipality', 'Concelho'],
    ['responsible', 'Resp.'],
    ['checkInPerson', 'Check-in'],
    ['asanaStatus', 'Asana Status'],
    ['poolStatus', 'Status Piscina']
];

export const PMS_COLUMN_MAP = {
    reference: 'Referência',
    bookingDate: 'Data',
    status: 'Estado',
    checkIn: 'Data de check-in',
    checkInTime: 'Hora entrada',
    checkOut: 'Data de check-out',
    checkOutTime: 'Hora saída',
    nights: 'noites',
    rentWithTax: 'Aluguer com imposto',
    totalWithTax: 'Total da reserva com imposto',
    paymentAmount: 'Pagamento',
    pendingAmount: 'Pendente',
    adults: 'Adultos',
    children: 'Crianças',
    babies: 'Bebés',
    propertyName: 'Nome alojamento',
    propertyId: 'id alojamento',
    building: 'Edifício',
    municipality: 'Localidade',
    customerId: 'Cliente: Id cliente',
    guestFirstName: 'Cliente: Nome',
    guestLastName: 'Cliente: Sobrenomes',
    phone: 'Cliente: Telefone',
    alternatePhone: 'Cliente: Telefone alternativo 1',
    customerEmail: 'Cliente: E-mail',
    stayGuestFirstName: 'Hóspede: Nome',
    stayGuestLastName: 'Hóspede: Sobrenomes',
    guestCountry: 'Hóspede: País',
    guestEmail: 'Hóspede: E-mail',
    guestLanguage: 'Hóspede: Idioma do cliente',
    portal: 'Portal',
    intermediaryReference: 'Referência intermediário',
    pmsInternalComments: 'Os meus comentários',
    pmsGuestComments: 'Comentários para o cliente',
    pmsCheckinComments: 'Comentários check-in/check-out',
    pmsOwnerComments: 'Comentario proprietario',
    invoiceStatus: 'Fatura',
    invoiceDate: 'Data de fatura',
    invoiceTotal: 'Total da fatura',
    attendedBy: 'Atendido por',
    onlineCheckinStatus: 'Estado check-in online',
    history: 'Histórico',
    sourceWebsite: 'Website de origem',
    cancellationPolicy: 'Condição de cancelamento'
};

const TRUE_POOL_VALUES = new Set(['sim', 's', 'yes', 'pago', 'paid', 'aquecida']);
const FALSE_POOL_VALUES = new Set(['nao', 'não', 'no', 'n', '-', 'nao quer', 'não quer', 'nao funciona', 'não funciona']);
const WAITING_POOL_VALUES = new Set(['???', '?', 'a espera', 'à espera', 'espera', 'nao respondeu', 'não respondeu', 'nao responde', 'não responde']);

export function normalizeSheetName(value) {
    return String(value || '').trim();
}

export function isWeeklyReservationSheet(sheetName) {
    const normalized = normalizeSheetName(sheetName);
    if (!normalized || RESERVATION_SYSTEM_SHEETS.has(normalized)) return false;
    return /\d/.test(normalized);
}

export function isPmsReservationHeader(headers) {
    const normalizedHeaders = new Set((headers || []).map(normalizeText));
    return normalizedHeaders.has(PMS_COLUMN_MAP.reference)
        && normalizedHeaders.has(PMS_COLUMN_MAP.checkIn)
        && normalizedHeaders.has(PMS_COLUMN_MAP.propertyName)
        && normalizedHeaders.has(PMS_COLUMN_MAP.portal);
}

export function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizeLookupText(value) {
    return normalizeText(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = String(value)
        .replace(/\s/g, '')
        .replace(/[€]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseReservationDate(value, fallbackYear = 2026) {
    if (!value) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return formatDate(value);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return formatDate(new Date(1899, 11, 30 + value));
    }

    const text = normalizeText(value);
    if (!text) return '';
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);

    const dateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        let year = dateMatch[3] ? Number(dateMatch[3]) : fallbackYear;
        if (year < 100) year += 2000;
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
            return formatDate(date);
        }
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? '' : formatDate(parsed);
}

export function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getIsoWeek(dateValue) {
    const dateText = parseReservationDate(dateValue);
    if (!dateText) return '';
    const date = new Date(`${dateText}T00:00:00Z`);
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
    return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function normalizePortal(value) {
    const text = normalizeText(value);
    const lookup = normalizeLookupText(text);
    if (!lookup) return '';
    if (lookup.includes('airbnb')) return 'Airbnb';
    if (lookup.includes('booking')) return 'Booking';
    if (lookup.includes('atlantic')) return 'Atlantic';
    if (lookup.includes('hometogo')) return 'Hometogo';
    if (lookup.includes('homeaway')) return 'HomeAway';
    if (lookup.includes('travelstaytion')) return 'TravelStaytion';
    if (lookup.includes('holidu')) return 'Holidu';
    if (lookup.includes('vrbo')) return 'Vrbo';
    return text;
}

export function normalizeMessageStatus(value) {
    const text = normalizeText(value);
    const lookup = normalizeLookupText(text);
    if (!lookup || lookup === '-') return '';
    if (lookup.startsWith('enviad')) return 'sent';
    if (lookup.startsWith('criad')) return 'created';
    return text;
}

export function normalizeSefStatus(value) {
    const text = normalizeText(value);
    const lookup = normalizeLookupText(text);
    if (!lookup) return '';
    if (lookup.includes('validado')) return 'validated';
    if (lookup.includes('espera')) return 'waiting';
    if (lookup.includes('pendente')) return 'pending';
    return text;
}

export function normalizePoolStatus(value) {
    const text = normalizeText(value);
    const lookup = normalizeLookupText(text);
    if (!lookup) return '';
    if (TRUE_POOL_VALUES.has(lookup)) return 'requested';
    if (FALSE_POOL_VALUES.has(lookup)) return 'not-requested';
    if (WAITING_POOL_VALUES.has(lookup)) return 'waiting';
    if (lookup.includes('funciona')) return 'unavailable';
    return 'needs-review';
}

export function calculateTouristTaxAmount(record = {}) {
    const adults = Math.max(0, parseNumber(record.adults ?? record.adultsCount) || 0);
    const children = Math.max(0, parseNumber(record.children ?? record.childrenCount) || 0);
    const nights = parseNumber(record.nights ?? record.nightsCount);
    if (nights === null) return null;

    const taxableNights = Math.min(Math.max(0, nights), 7);
    return (adults + children) * taxableNights * 2;
}

export function makeReservationFingerprint(record) {
    return [
        record.propertyName,
        record.checkIn,
        record.checkOut,
        record.guestName,
        record.portal
    ].map((part) => normalizeLookupText(part)).join('|');
}

export function normalizeReservationRow(row, context = {}) {
    const fallbackYear = context.fallbackYear || 2026;
    const record = {};
    RESERVATION_COLUMNS.forEach(([field, header]) => {
        record[field] = normalizeText(row[header]);
    });

    Object.assign(record, deriveReservationFields({
        ...record,
        sourceSheet: context.sheetName || record.sourceSheet || '',
        sourceRow: context.rowNumber || record.sourceRow || '',
        importName: context.importName || record.importName || '',
        sourceType: context.sourceType || record.sourceType || 'weekly-sheet'
    }, fallbackYear));

    return record;
}

export function normalizePmsReservationRow(row, context = {}) {
    const fallbackYear = context.fallbackYear || 2026;
    const get = (field) => normalizeText(row[PMS_COLUMN_MAP[field]]);
    const guestFirstName = get('stayGuestFirstName') || get('guestFirstName');
    const guestLastName = get('stayGuestLastName') || get('guestLastName');
    const pmsNotes = [
        get('pmsInternalComments'),
        get('pmsCheckinComments'),
        get('pmsOwnerComments')
    ].filter(Boolean).join(' / ');

    const record = {
        sourceType: 'pms-export',
        sourceSheet: context.sheetName || '',
        sourceRow: context.rowNumber || '',
        importName: context.importName || '',
        pmsReference: get('reference'),
        intermediaryReference: get('intermediaryReference'),
        bookingDate: parseReservationDate(get('bookingDate'), fallbackYear),
        status: get('status'),
        checkIn: parseReservationDate(get('checkIn'), fallbackYear),
        checkInTime: get('checkInTime'),
        checkOut: parseReservationDate(get('checkOut'), fallbackYear),
        checkOutTime: get('checkOutTime'),
        propertyName: get('propertyName'),
        propertyId: get('propertyId'),
        building: get('building'),
        municipality: get('municipality'),
        adults: get('adults'),
        children: get('children'),
        babies: get('babies'),
        guestFirstName,
        guestLastName,
        guestName: normalizeText(`${guestFirstName} ${guestLastName}`),
        phone: get('phone') || get('alternatePhone'),
        customerEmail: get('customerEmail') || get('guestEmail'),
        guestCountry: get('guestCountry'),
        guestLanguage: get('guestLanguage'),
        portal: get('portal'),
        sefStatus: get('onlineCheckinStatus'),
        nights: get('nights'),
        totalWithTax: parseNumber(get('totalWithTax')),
        paymentAmount: parseNumber(get('paymentAmount')),
        pendingAmount: parseNumber(get('pendingAmount')),
        sourceWebsite: get('sourceWebsite'),
        cancellationPolicy: get('cancellationPolicy'),
        pmsNotes,
        pmsGuestComments: get('pmsGuestComments'),
        invoiceStatus: get('invoiceStatus'),
        invoiceDate: parseReservationDate(get('invoiceDate'), fallbackYear),
        invoiceTotal: parseNumber(get('invoiceTotal')),
        attendedBy: get('attendedBy'),
        history: get('history'),
        arrivalInfo: '',
        flightNumber: '',
        safeCode: '',
        heatedPool: '',
        poolPaidAmount: '',
        poolAvantioAmount: '',
        infoStatus: '',
        firstMessageStatus: '',
        notes: '',
        touristTaxAmount: '',
        touristTaxPaidBy: '',
        responsible: '',
        checkInPerson: '',
        asanaStatus: '',
        poolStatus: ''
    };

    return deriveReservationFields(record, fallbackYear);
}

export function deriveReservationFields(record, fallbackYear = 2026) {
    const manualTouristTaxAmount = parseNumber(record.touristTaxAmount);
    const calculatedTouristTaxAmount = calculateTouristTaxAmount(record);
    const derived = {
        ...record,
        status: normalizeText(record.status),
        checkIn: parseReservationDate(record.checkIn, fallbackYear),
        checkOut: parseReservationDate(record.checkOut, fallbackYear),
        portal: normalizePortal(record.portal),
        firstMessageState: normalizeMessageStatus(record.firstMessageStatus),
        sefState: normalizeSefStatus(record.sefStatus),
        poolState: normalizePoolStatus(record.heatedPool || record.poolStatus),
        poolPaidAmountValue: parseNumber(record.poolPaidAmount),
        poolAvantioAmountValue: parseNumber(record.poolAvantioAmount),
        touristTaxAmountValue: manualTouristTaxAmount,
        calculatedTouristTaxAmountValue: calculatedTouristTaxAmount,
        touristTaxDisplayAmountValue: manualTouristTaxAmount ?? calculatedTouristTaxAmount,
        adultsCount: parseNumber(record.adults),
        childrenCount: parseNumber(record.children),
        babiesCount: parseNumber(record.babies),
        nightsCount: parseNumber(record.nights)
    };
    derived.touristTaxNeedsChildAgeCheck = Number(derived.childrenCount || 0) > 0;
    derived.week = getIsoWeek(derived.checkIn);
    derived.fingerprint = makeReservationFingerprint(derived);
    derived.validationIssues = getReservationIssues(derived);
    return derived;
}

export function getReservationIssues(record) {
    const issues = [];
    if (!record.propertyName) issues.push('missing-property');
    if (!record.guestName) issues.push('missing-guest');
    if (!record.checkIn) issues.push('missing-check-in');
    if (!record.checkOut) issues.push('missing-check-out');
    if (record.checkIn && record.checkOut && record.checkOut < record.checkIn) issues.push('checkout-before-checkin');
    if (!record.portal) issues.push('missing-portal');
    if (!record.phone) issues.push('missing-phone');
    if (!record.firstMessageState) issues.push('missing-first-message');
    if (!record.sefState) issues.push('missing-sef');
    if (!record.arrivalInfo && !record.checkInTime) issues.push('missing-arrival');
    if (!record.safeCode) issues.push('missing-keybox');
    if (record.poolState === 'waiting' || record.poolState === 'needs-review') issues.push('pool-follow-up');
    if (record.heatedPool && record.poolState === 'requested' && record.poolPaidAmountValue === null) issues.push('pool-payment-missing');
    if (record.touristTaxDisplayAmountValue === null && normalizeLookupText(record.status) !== 'de proprietario') issues.push('missing-tax');
    if (record.touristTaxNeedsChildAgeCheck) issues.push('tax-child-age-check');
    return issues;
}

export function normalizeRawReservationDocument(record) {
    if (record?.checkIn && record?.propertyName) {
        return deriveReservationFields(record);
    }
    return normalizeReservationRow(record || {}, {
        sheetName: record?.sourceSheet || record?._week || '',
        rowNumber: record?.sourceRow || '',
        importName: record?.importName || record?.datasetName || ''
    });
}

export function buildReservationSummary(records) {
    const total = records.length;
    const checkInsToday = countByPredicate(records, (record) => record.checkIn === todayIso());
    const poolFollowUps = countByPredicate(records, (record) => record.validationIssues.includes('pool-follow-up') || record.validationIssues.includes('pool-payment-missing'));
    const sefWaiting = countByPredicate(records, (record) => record.sefState === 'waiting' || record.sefState === 'pending' || !record.sefState);
    const missingArrival = countByPredicate(records, (record) => record.validationIssues.includes('missing-arrival'));
    const missingKeybox = countByPredicate(records, (record) => record.validationIssues.includes('missing-keybox'));
    const missingTax = countByPredicate(records, (record) => record.validationIssues.includes('missing-tax'));
    const ownerStays = countByPredicate(records, (record) => normalizeLookupText(record.status).includes('proprietario'));
    const longStays = countByPredicate(records, (record) => Number(record.nightsCount || 0) >= 14);
    return { total, checkInsToday, poolFollowUps, sefWaiting, missingArrival, missingKeybox, missingTax, ownerStays, longStays };
}

export function countByPredicate(records, predicate) {
    return records.reduce((count, record) => count + (predicate(record) ? 1 : 0), 0);
}

export function todayIso() {
    return new Date().toISOString().slice(0, 10);
}

export function groupReservationsByDate(records) {
    const groups = new Map();
    records.forEach((record) => {
        const key = record.checkIn || 'No check-in date';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(record);
    });
    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, entries]) => ({
            date,
            entries: entries.sort((a, b) => `${a.propertyName}${a.guestName}`.localeCompare(`${b.propertyName}${b.guestName}`))
        }));
}

export function filterReservations(records, filters = {}) {
    const search = normalizeLookupText(filters.search);
    return records.filter((record) => {
        if (filters.week && filters.week !== 'all' && record.week !== filters.week) return false;
        if (filters.issue && filters.issue !== 'all') {
            if (filters.issue === 'pool' && !record.validationIssues.some((issue) => issue.startsWith('pool-'))) return false;
            if (filters.issue === 'keybox' && !record.validationIssues.includes('missing-keybox')) return false;
            if (filters.issue === 'sef' && record.sefState === 'validated') return false;
            if (filters.issue === 'arrival' && !record.validationIssues.includes('missing-arrival')) return false;
            if (filters.issue === 'tax' && !record.validationIssues.includes('missing-tax')) return false;
            if (filters.issue === 'long-stays' && Number(record.nightsCount || 0) < 14) return false;
            if (filters.issue === 'owner' && !normalizeLookupText(record.status).includes('proprietario')) return false;
            if (filters.issue === 'invalid' && record.validationIssues.length === 0) return false;
        }
        if (!search) return true;
        return [
            record.propertyName,
            record.guestName,
            record.portal,
            record.phone,
            record.notes,
            record.arrivalInfo,
            record.flightNumber
        ].some((value) => normalizeLookupText(value).includes(search));
    });
}
