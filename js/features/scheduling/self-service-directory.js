import {
    getVacationRecordDocId,
    normalizeLeaveType,
    normalizeVacationDayCountMode,
    normalizeVacationEntry
} from './vacation-records.js';

export const SELF_SERVICE_PROFILE_SCHEMA_VERSION = 1;
export const SELF_SERVICE_VACATION_SCHEMA_VERSION = 1;

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SHIFT_PATTERN = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

function normalizeText(value, maxLength = 200) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().slice(0, maxLength);
    return normalized || null;
}

function normalizeStaffNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalized = Number.parseInt(value, 10);
    return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function normalizeWorkDays(workDays = []) {
    if (!Array.isArray(workDays)) return [];
    return [...new Set(workDays
        .map((day) => Number.parseInt(day, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
        .sort((left, right) => left - right);
}

function normalizeShifts(shifts = {}) {
    if (!shifts || typeof shifts !== 'object' || Array.isArray(shifts)) return {};
    return Object.fromEntries(Object.entries(shifts)
        .filter(([key, value]) => (key === 'default' || /^[0-6]$/.test(key)) && SHIFT_PATTERN.test(String(value || '').trim()))
        .map(([key, value]) => [key, String(value).trim().slice(0, 40)])
        .sort(([left], [right]) => left.localeCompare(right)));
}

export function buildSelfServiceProfileEntry(employee = {}) {
    const employeeId = normalizeText(employee.id, 300);
    const name = normalizeText(employee.name, 200);
    if (!employeeId || employeeId === 'metadata' || !name || employee.isArchived === true) return null;

    const hireDate = normalizeText(employee.hireDate, 10);
    return {
        id: employeeId,
        data: {
            employeeId,
            name,
            staffNumber: normalizeStaffNumber(employee.staffNumber),
            email: normalizeText(employee.email, 254),
            phone: normalizeText(employee.phone, 80),
            department: normalizeText(employee.department, 120),
            position: normalizeText(employee.position, 120),
            hireDate: hireDate && DATE_KEY_PATTERN.test(hireDate) ? hireDate : null,
            employmentType: normalizeText(employee.employmentType, 120),
            workDays: normalizeWorkDays(employee.workDays),
            shifts: normalizeShifts(employee.shifts),
            active: true,
            schemaVersion: SELF_SERVICE_PROFILE_SCHEMA_VERSION
        }
    };
}

export function buildSelfServiceProfileTombstone(employeeId) {
    const id = normalizeText(employeeId, 300);
    if (!id || id === 'metadata') return null;
    return {
        employeeId: id,
        name: 'Inactive profile',
        staffNumber: null,
        email: null,
        phone: null,
        department: null,
        position: null,
        hireDate: null,
        employmentType: null,
        workDays: [],
        shifts: {},
        active: false,
        schemaVersion: SELF_SERVICE_PROFILE_SCHEMA_VERSION
    };
}

export function buildSelfServiceVacationEntries(employees = []) {
    const entries = employees.flatMap((employee) => {
        const profile = buildSelfServiceProfileEntry(employee);
        if (!profile) return [];

        return (Array.isArray(employee.vacations) ? employee.vacations : [])
            .map((vacation) => normalizeVacationEntry(vacation, { employeeId: profile.id }))
            .filter((vacation) => vacation && vacation.endDate >= vacation.startDate)
            .map((vacation) => ({
                id: getVacationRecordDocId(profile.id, vacation.startDate, vacation.endDate),
                employeeId: profile.id,
                data: {
                    startDate: vacation.startDate,
                    endDate: vacation.endDate,
                    type: normalizeLeaveType(vacation.type),
                    status: normalizeText(vacation.status, 40) || 'approved',
                    dayCountMode: normalizeVacationDayCountMode(vacation.dayCountMode),
                    schemaVersion: SELF_SERVICE_VACATION_SCHEMA_VERSION
                }
            }));
    }).filter((entry) => entry.id);

    return [...new Map(entries.map((entry) => [`${entry.employeeId}/${entry.id}`, entry])).values()]
        .sort((left, right) => (
            left.employeeId.localeCompare(right.employeeId)
            || left.id.localeCompare(right.id)
        ));
}

export function buildSelfServiceDirectoryEntries(employees = []) {
    return {
        profiles: employees
            .map(buildSelfServiceProfileEntry)
            .filter(Boolean)
            .sort((left, right) => left.id.localeCompare(right.id)),
        vacations: buildSelfServiceVacationEntries(employees)
    };
}
