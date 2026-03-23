const DEFAULT_VACATION_STATUS = 'approved';
const DEFAULT_VACATION_VISIBILITY = 'team';

function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized || null;
}

function normalizeVacationDate(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function compareVacationEntries(left, right) {
    const startComparison = (left.startDate || '').localeCompare(right.startDate || '');
    if (startComparison !== 0) {
        return startComparison;
    }

    const endComparison = (left.endDate || '').localeCompare(right.endDate || '');
    if (endComparison !== 0) {
        return endComparison;
    }

    return (left.id || '').localeCompare(right.id || '');
}

export function getVacationRecordDocId(employeeId, startDate, endDate) {
    const normalizedEmployeeId = normalizeOptionalText(employeeId);
    const normalizedStartDate = normalizeVacationDate(startDate);
    const normalizedEndDate = normalizeVacationDate(endDate);

    if (!normalizedEmployeeId || !normalizedStartDate || !normalizedEndDate) {
        return null;
    }

    return `${encodeURIComponent(normalizedEmployeeId)}__${normalizedStartDate}__${normalizedEndDate}`;
}

export function normalizeVacationEntry(vacation = {}, { employeeId = null, id = null } = {}) {
    const normalizedEmployeeId = normalizeOptionalText(vacation.employeeId) || normalizeOptionalText(employeeId);
    const startDate = normalizeVacationDate(vacation.startDate);
    const endDate = normalizeVacationDate(vacation.endDate);

    if (!startDate || !endDate) {
        return null;
    }

    return {
        id: normalizeOptionalText(vacation.id) || normalizeOptionalText(id) || getVacationRecordDocId(normalizedEmployeeId, startDate, endDate),
        employeeId: normalizedEmployeeId,
        startDate,
        endDate,
        status: normalizeOptionalText(vacation.status) || DEFAULT_VACATION_STATUS,
        note: normalizeOptionalText(vacation.note),
        visibility: normalizeOptionalText(vacation.visibility) || DEFAULT_VACATION_VISIBILITY,
        source: normalizeOptionalText(vacation.source)
    };
}

export function createVacationRecord(entry = {}, { source = 'planner', visibility = DEFAULT_VACATION_VISIBILITY } = {}) {
    const normalizedEntry = normalizeVacationEntry({
        ...entry,
        source,
        visibility
    });

    if (!normalizedEntry?.employeeId || !normalizedEntry?.id) {
        return null;
    }

    return normalizedEntry;
}

export function toEmployeeVacationEntry(vacation = {}, employeeId = null) {
    const normalizedEntry = normalizeVacationEntry(vacation, { employeeId });
    if (!normalizedEntry) {
        return null;
    }

    return {
        id: normalizedEntry.id,
        startDate: normalizedEntry.startDate,
        endDate: normalizedEntry.endDate,
        status: normalizedEntry.status,
        note: normalizedEntry.note,
        visibility: normalizedEntry.visibility
    };
}

export function groupVacationRecordsByEmployee(records = []) {
    const recordsByEmployee = new Map();

    records.forEach((record) => {
        const normalizedRecord = normalizeVacationEntry(record);
        if (!normalizedRecord?.employeeId) {
            return;
        }

        const employeeEntries = recordsByEmployee.get(normalizedRecord.employeeId) || [];
        employeeEntries.push(toEmployeeVacationEntry(normalizedRecord, normalizedRecord.employeeId));
        employeeEntries.sort(compareVacationEntries);
        recordsByEmployee.set(normalizedRecord.employeeId, employeeEntries);
    });

    return recordsByEmployee;
}

export function mergeEmployeeVacations(legacyVacations = [], recordVacations = [], employeeId = null) {
    const mergedEntries = new Map();

    [...legacyVacations, ...recordVacations].forEach((vacation) => {
        const employeeVacation = toEmployeeVacationEntry(vacation, employeeId);
        if (!employeeVacation) {
            return;
        }

        const entryKey = employeeVacation.id || `${employeeVacation.startDate}__${employeeVacation.endDate}`;
        mergedEntries.set(entryKey, employeeVacation);
    });

    return [...mergedEntries.values()].sort(compareVacationEntries);
}

export function buildSharedVacationEntries(records = [], employees = []) {
    const employeesById = new Map(
        employees
            .filter((employee) => employee?.id)
            .map((employee) => [employee.id, employee])
    );

    return records
        .map((record) => {
            const normalizedRecord = normalizeVacationEntry(record);
            const employee = normalizedRecord?.employeeId ? employeesById.get(normalizedRecord.employeeId) : null;

            if (!normalizedRecord || !employee) {
                return null;
            }

            return {
                id: normalizedRecord.id,
                employeeId: employee.id,
                employeeName: employee.name || '',
                employeeDepartment: employee.department || null,
                startDate: normalizedRecord.startDate,
                endDate: normalizedRecord.endDate,
                status: normalizedRecord.status,
                note: normalizedRecord.note,
                visibility: normalizedRecord.visibility
            };
        })
        .filter(Boolean)
        .sort(compareVacationEntries);
}
