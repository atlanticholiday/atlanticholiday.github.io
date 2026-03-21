import { getDateKey } from './holiday-calculator.js';

const DEFAULT_SHIFT = '9:00-18:00';

function normalizeRequiredName(name) {
    const normalized = typeof name === 'string' ? name.trim() : '';
    if (!normalized) {
        throw new Error('Name is required');
    }
    return normalized;
}

function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized || null;
}

function normalizeOptionalInteger(value, fallback = null) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    const normalized = Number.parseInt(String(value).trim(), 10);
    return Number.isNaN(normalized) ? fallback : normalized;
}

function normalizeWorkDays(workDays) {
    if (!Array.isArray(workDays)) {
        return [];
    }

    const normalizedDays = workDays
        .map((day) => Number.parseInt(day, 10))
        .filter((day) => Number.isInteger(day));

    return [...new Set(normalizedDays)].sort((left, right) => left - right);
}

function normalizeEmployeeName(name) {
    return typeof name === 'string' ? name : '';
}

export function createEmployeeRecord({ name, staffNumber = null, workDays = [], displayOrder = 0 }) {
    return {
        name: normalizeRequiredName(name),
        staffNumber: normalizeOptionalInteger(staffNumber, null),
        workDays: normalizeWorkDays(workDays),
        displayOrder,
        isArchived: false,
        shifts: { default: DEFAULT_SHIFT },
        overrides: {},
        extraHours: {},
        extraHoursNotes: {},
        vacations: [],
        email: null,
        phone: null,
        department: null,
        position: null,
        hireDate: null,
        employmentType: null,
        notes: null,
        vacationAdjustment: 0
    };
}

export function buildEmployeeUpdatePayload(updatedData = {}) {
    const payload = {
        name: normalizeRequiredName(updatedData.name),
        workDays: normalizeWorkDays(updatedData.workDays),
        staffNumber: normalizeOptionalInteger(updatedData.staffNumber, null),
        email: normalizeOptionalText(updatedData.email),
        phone: normalizeOptionalText(updatedData.phone),
        department: normalizeOptionalText(updatedData.department),
        position: normalizeOptionalText(updatedData.position),
        hireDate: normalizeOptionalText(updatedData.hireDate),
        employmentType: normalizeOptionalText(updatedData.employmentType),
        notes: normalizeOptionalText(updatedData.notes),
        vacationAdjustment: normalizeOptionalInteger(updatedData.vacationAdjustment, 0)
    };

    const defaultShift = normalizeOptionalText(updatedData.defaultShift);
    if (defaultShift) {
        payload['shifts.default'] = defaultShift;
    }

    return payload;
}

export function partitionEmployeesByArchiveStatus(employees = []) {
    const activeEmployees = [];
    const archivedEmployees = [];

    for (const employee of employees) {
        if (employee?.isArchived) {
            archivedEmployees.push(employee);
        } else {
            activeEmployees.push(employee);
        }
    }

    activeEmployees.sort((left, right) => (left.displayOrder ?? Infinity) - (right.displayOrder ?? Infinity));
    archivedEmployees.sort((left, right) => normalizeEmployeeName(left.name).localeCompare(normalizeEmployeeName(right.name)));

    return { activeEmployees, archivedEmployees };
}

export function isDateInVacation(date, vacations = []) {
    if (!Array.isArray(vacations) || vacations.length === 0) {
        return false;
    }

    const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return vacations.some((vacation) => {
        if (!vacation?.startDate || !vacation?.endDate) {
            return false;
        }

        const startDate = new Date(vacation.startDate);
        const endDate = new Date(vacation.endDate);
        return checkDate >= startDate && checkDate <= endDate;
    });
}

export function getEmployeeStatusForDate(employee, date, holidaysForYear = {}) {
    const dateKey = getDateKey(date);

    if (isDateInVacation(date, employee?.vacations)) return 'On Vacation';
    if (employee?.overrides && employee.overrides[dateKey]) return employee.overrides[dateKey];
    if (holidaysForYear[dateKey]) return 'Off';

    return Array.isArray(employee?.workDays) && employee.workDays.includes(date.getDay())
        ? 'Working'
        : 'Scheduled Off';
}
