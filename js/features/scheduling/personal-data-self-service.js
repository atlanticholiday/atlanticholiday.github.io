import { summarizeAttendanceRecord } from './attendance-records.js';

export const PERSONAL_DATA_EXPORT_SCHEMA_VERSION = 1;
export const CORRECTION_REQUEST_CATEGORIES = Object.freeze([
    'profile',
    'attendance',
    'vacation',
    'overtime',
    'other'
]);
export const CORRECTION_REQUEST_STATUSES = Object.freeze([
    'submitted',
    'in-review',
    'resolved',
    'rejected'
]);

function cleanText(value, maxLength = 2000) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function normalizeDateKey(value) {
    const normalized = cleanText(value, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeYear(value, fallback = new Date().getFullYear()) {
    const year = Number.parseInt(value, 10);
    return Number.isInteger(year) && year >= 1900 && year <= 9999 ? year : fallback;
}

function timestampToIso(value) {
    if (!value) return null;
    const date = typeof value?.toDate === 'function'
        ? value.toDate()
        : value instanceof Date
            ? value
            : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function eventMinutes(startEvent, endEvent) {
    const start = timestampToIso(startEvent?.occurredAtUtc || startEvent?.occurredAt);
    const end = timestampToIso(endEvent?.occurredAtUtc || endEvent?.occurredAt);
    if (!start || !end) return 0;
    return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function safePunch(punch = {}) {
    return {
        id: cleanText(punch.id, 300) || null,
        type: cleanText(punch.type, 40) || null,
        occurredAt: cleanText(punch.occurredAt, 40) || null,
        occurredAtUtc: cleanText(punch.occurredAtUtc, 40) || null,
        timeZone: cleanText(punch.timeZone, 80) || null,
        source: cleanText(punch.source, 40) || null,
        trustedServerTime: punch.trustedServerTime === true,
        note: cleanText(punch.note, 500) || null,
        voided: punch.voided === true
    };
}

function safeAttendanceRecord(record = {}) {
    const voidedIds = new Set(Array.isArray(record.voidedEventIds) ? record.voidedEventIds : []);
    return {
        id: cleanText(record.id, 300) || null,
        dateKey: normalizeDateKey(record.dateKey),
        punches: (Array.isArray(record.punches) ? record.punches : []).map((punch) => ({
            ...safePunch(punch),
            voided: voidedIds.has(punch?.id)
        })),
        corrections: (Array.isArray(record.corrections) ? record.corrections : []).map((entry) => ({
            id: cleanText(entry?.id, 300) || null,
            eventId: cleanText(entry?.eventId, 300) || null,
            action: cleanText(entry?.action, 80) || null,
            reason: cleanText(entry?.reason, 1000) || null,
            requestedAt: cleanText(entry?.requestedAt, 40) || null
        })),
        review: {
            status: cleanText(record.review?.status, 40) || null,
            note: cleanText(record.review?.note, 1000) || null,
            reviewedAt: cleanText(record.review?.reviewedAt, 40) || null
        },
        workerAttestation: record.workerAttestation ? {
            status: cleanText(record.workerAttestation.status, 40) || null,
            attestedAt: cleanText(record.workerAttestation.attestedAt, 40) || null
        } : null,
        retainUntil: normalizeDateKey(record.retainUntil)
    };
}

function safeOvertimeRecord(record = {}) {
    return {
        id: cleanText(record.id, 300) || null,
        dateKey: normalizeDateKey(record.dateKey),
        status: cleanText(record.status, 60) || null,
        reason: cleanText(record.reason, 500) || null,
        legalBasis: cleanText(record.legalBasis, 120) || null,
        compensationChoice: cleanText(record.compensationChoice, 80) || null,
        workplace: cleanText(record.workplace, 300) || null,
        startEvent: record.startEvent ? safePunch(record.startEvent) : null,
        endEvent: record.endEvent ? safePunch(record.endEvent) : null,
        durationMinutes: eventMinutes(record.startEvent, record.endEvent),
        workerValidation: record.workerValidation ? {
            status: cleanText(record.workerValidation.status, 60) || null,
            note: cleanText(record.workerValidation.note, 1000) || null
        } : null,
        retainUntil: normalizeDateKey(record.retainUntil)
    };
}

export function normalizeCorrectionRequestInput(input = {}) {
    const category = CORRECTION_REQUEST_CATEGORIES.includes(input.category)
        ? input.category
        : 'other';
    const description = cleanText(input.description, 2000);
    if (description.length < 10) {
        const error = new Error('correction-description-too-short');
        error.code = 'correction-description-too-short';
        throw error;
    }
    return {
        category,
        referenceDate: normalizeDateKey(input.referenceDate),
        description
    };
}

export function getPersonalDataYears({
    attendanceRecords = [],
    overtimeRecords = [],
    vacations = [],
    correctionRequests = [],
    currentYear = new Date().getFullYear()
} = {}) {
    const years = new Set([normalizeYear(currentYear)]);
    const addDateYear = (value) => {
        const dateKey = normalizeDateKey(value);
        if (dateKey) years.add(Number(dateKey.slice(0, 4)));
    };
    attendanceRecords.forEach((record) => addDateYear(record?.dateKey));
    overtimeRecords.forEach((record) => addDateYear(record?.dateKey));
    vacations.forEach((entry) => {
        addDateYear(entry?.startDate);
        addDateYear(entry?.endDate);
    });
    correctionRequests.forEach((entry) => {
        addDateYear(entry?.referenceDate);
        const createdAt = timestampToIso(entry?.createdAtServer);
        if (createdAt) addDateYear(createdAt.slice(0, 10));
    });
    return [...years].sort((left, right) => right - left);
}

export function buildPersonalYearSummary({
    employeeId,
    year,
    attendanceRecords = [],
    overtimeRecords = [],
    vacations = [],
    correctionRequests = []
} = {}) {
    const normalizedYear = normalizeYear(year);
    const yearPrefix = `${normalizedYear}-`;
    const ownAttendance = attendanceRecords.filter((record) => (
        record?.employeeId === employeeId && String(record?.dateKey || '').startsWith(yearPrefix)
    ));
    const attendance = ownAttendance.reduce((summary, record) => {
        const recordSummary = summarizeAttendanceRecord(record);
        summary.workedMinutes += recordSummary.workedMinutes;
        summary.breakMinutes += recordSummary.breakMinutes;
        summary.daysWithRecords += recordSummary.punches.length ? 1 : 0;
        summary.openSessions += recordSummary.hasOpenSession ? 1 : 0;
        return summary;
    }, { workedMinutes: 0, breakMinutes: 0, daysWithRecords: 0, openSessions: 0 });
    const ownOvertime = overtimeRecords.filter((record) => (
        record?.employeeId === employeeId && String(record?.dateKey || '').startsWith(yearPrefix)
    ));
    const overtimeMinutes = ownOvertime.reduce((total, record) => (
        total + eventMinutes(record.startEvent, record.endEvent)
    ), 0);
    const ownVacations = vacations.filter((entry) => (
        String(entry?.startDate || '').startsWith(yearPrefix)
        || String(entry?.endDate || '').startsWith(yearPrefix)
    ));
    const ownRequests = correctionRequests.filter((entry) => {
        if (entry?.employeeId !== employeeId) return false;
        const createdAt = timestampToIso(entry.createdAtServer);
        return String(entry.referenceDate || createdAt || '').startsWith(yearPrefix);
    });

    return {
        year: normalizedYear,
        attendance,
        overtime: {
            recordCount: ownOvertime.length,
            completedMinutes: overtimeMinutes,
            openCount: ownOvertime.filter((record) => !['resolved', 'rejected', 'manager-reviewed'].includes(record.status)).length
        },
        leave: {
            recordCount: ownVacations.length,
            vacationCount: ownVacations.filter((entry) => entry.type === 'vacation').length,
            absenceCount: ownVacations.filter((entry) => entry.type !== 'vacation').length
        },
        corrections: {
            total: ownRequests.length,
            open: ownRequests.filter((entry) => ['submitted', 'in-review'].includes(entry.status)).length
        }
    };
}

export function buildPersonalDataExport({
    employeeId,
    profile = null,
    vacations = [],
    attendanceRecords = [],
    overtimeRecords = [],
    correctionRequests = [],
    generatedAt = new Date()
} = {}) {
    const ownAttendance = attendanceRecords
        .filter((record) => record?.employeeId === employeeId)
        .map(safeAttendanceRecord)
        .sort((left, right) => String(left.dateKey || '').localeCompare(String(right.dateKey || '')));
    const ownOvertime = overtimeRecords
        .filter((record) => record?.employeeId === employeeId)
        .map(safeOvertimeRecord)
        .sort((left, right) => String(left.dateKey || '').localeCompare(String(right.dateKey || '')));
    const safeVacations = vacations
        .filter((entry) => !entry?.employeeId || entry.employeeId === employeeId)
        .map((entry) => ({
        id: cleanText(entry?.id, 300) || null,
        startDate: normalizeDateKey(entry?.startDate),
        endDate: normalizeDateKey(entry?.endDate),
        type: cleanText(entry?.type, 60) || null,
        status: cleanText(entry?.status, 60) || null,
        dayCountMode: cleanText(entry?.dayCountMode, 40) || null
        }));
    const safeRequests = correctionRequests
        .filter((entry) => entry?.employeeId === employeeId)
        .map((entry) => ({
            id: cleanText(entry.id, 300) || null,
            category: cleanText(entry.category, 60) || null,
            referenceDate: normalizeDateKey(entry.referenceDate),
            description: cleanText(entry.description, 2000),
            status: cleanText(entry.status, 60) || null,
            resolutionNote: cleanText(entry.resolutionNote, 2000) || null,
            createdAt: timestampToIso(entry.createdAtServer),
            updatedAt: timestampToIso(entry.updatedAtServer),
            resolvedAt: timestampToIso(entry.resolvedAtServer)
        }));
    const safeProfile = profile?.employeeId === employeeId ? {
        employeeId,
        name: cleanText(profile.name, 200),
        staffNumber: profile.staffNumber ?? null,
        email: cleanText(profile.email, 254) || null,
        phone: cleanText(profile.phone, 80) || null,
        department: cleanText(profile.department, 120) || null,
        position: cleanText(profile.position, 120) || null,
        hireDate: normalizeDateKey(profile.hireDate),
        employmentType: cleanText(profile.employmentType, 120) || null,
        workDays: Array.isArray(profile.workDays) ? [...profile.workDays] : [],
        shifts: profile.shifts && typeof profile.shifts === 'object' ? { ...profile.shifts } : {},
        vacationBalance: profile.vacationBalance ? { ...profile.vacationBalance } : null
    } : null;

    return {
        schemaVersion: PERSONAL_DATA_EXPORT_SCHEMA_VERSION,
        generatedAt: timestampToIso(generatedAt),
        employeeId,
        profile: safeProfile,
        vacations: safeVacations,
        attendanceRecords: ownAttendance,
        overtimeRecords: ownOvertime,
        correctionRequests: safeRequests
    };
}
