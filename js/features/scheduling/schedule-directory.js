export const SCHEDULE_DIRECTORY_SCHEMA_VERSION = 1;

const DEFAULT_SHIFT = '9:00-18:00';
const SHIFT_PATTERN = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeText(value, maxLength = 200) {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
}

function normalizeWorkDays(workDays = []) {
    if (!Array.isArray(workDays)) return [];
    return [...new Set(workDays
        .map((day) => Number.parseInt(day, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        .sort((left, right) => left - right);
}

function normalizeShifts(shifts = {}) {
    const normalized = {};
    if (shifts && typeof shifts === 'object' && !Array.isArray(shifts)) {
        Object.entries(shifts).forEach(([key, value]) => {
            if (key !== 'default' && !/^[0-6]$/.test(key)) return;
            const shift = normalizeText(value, 40);
            if (SHIFT_PATTERN.test(shift)) normalized[key] = shift;
        });
    }
    if (!normalized.default) normalized.default = DEFAULT_SHIFT;
    return Object.fromEntries(Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)));
}

export function normalizePublicScheduleStatus(value) {
    const status = normalizeText(value, 40).toLowerCase();
    if (!status) return null;
    if (status === 'working' || status === 'trabalha') return 'Working';
    if (status === 'off' || status === 'scheduled off' || status === 'folga') return 'Off';
    if (status === 'vacation' || status === 'on vacation' || status === 'férias' || status === 'ferias') return 'Vacation';
    return 'Absent';
}

function normalizeOverrides(overrides = {}) {
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return {};
    return Object.fromEntries(Object.entries(overrides)
        .filter(([dateKey, status]) => DATE_KEY_PATTERN.test(dateKey) && normalizePublicScheduleStatus(status))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dateKey, status]) => [dateKey, normalizePublicScheduleStatus(status)]));
}

function normalizeAvailabilityPeriods(vacations = []) {
    if (!Array.isArray(vacations)) return [];
    const periods = vacations
        .filter((entry) => {
            const workflowStatus = normalizeText(entry?.status, 40).toLowerCase();
            return !workflowStatus || workflowStatus === 'approved';
        })
        .map((entry) => {
            const startDate = normalizeText(entry?.startDate, 10);
            const endDate = normalizeText(entry?.endDate, 10);
            if (!DATE_KEY_PATTERN.test(startDate) || !DATE_KEY_PATTERN.test(endDate) || endDate < startDate) return null;
            return {
                startDate,
                endDate,
                status: normalizeText(entry?.type, 40).toLowerCase() === 'vacation' ? 'Vacation' : 'Absent'
            };
        })
        .filter(Boolean)
        .sort((left, right) => (
            left.startDate.localeCompare(right.startDate)
            || left.endDate.localeCompare(right.endDate)
            || left.status.localeCompare(right.status)
        ));

    return periods.filter((entry, index) => (
        index === 0 || JSON.stringify(entry) !== JSON.stringify(periods[index - 1])
    ));
}

export function buildScheduleDirectoryEntry(employee = {}) {
    const id = normalizeText(employee.id, 300);
    const name = normalizeText(employee.name, 200);
    if (!id || id === 'metadata' || !name || employee.isArchived === true) return null;

    return {
        id,
        data: {
            name,
            department: normalizeText(employee.department, 120) || null,
            workDays: normalizeWorkDays(employee.workDays),
            shifts: normalizeShifts(employee.shifts),
            overrides: normalizeOverrides(employee.overrides),
            availabilityPeriods: normalizeAvailabilityPeriods(employee.vacations),
            schemaVersion: SCHEDULE_DIRECTORY_SCHEMA_VERSION
        }
    };
}

export function buildScheduleDirectoryEntries(employees = []) {
    return employees
        .map(buildScheduleDirectoryEntry)
        .filter(Boolean)
        .sort((left, right) => left.id.localeCompare(right.id));
}
