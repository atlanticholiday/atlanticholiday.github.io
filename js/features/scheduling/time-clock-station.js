function normalizeSearchValue(value) {
    return typeof value === 'string'
        ? value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .toLowerCase()
        : '';
}

function getEmployeeSearchText(employee = {}) {
    return normalizeSearchValue([
        employee?.name || '',
        employee?.staffNumber ?? '',
        employee?.department || '',
        employee?.position || ''
    ].join(' '));
}

export const ATTENDANCE_PIN_MIN_LENGTH = 6;
export const ATTENDANCE_PIN_MAX_LENGTH = 10;

export function normalizeAttendancePin(value = '') {
    return String(value ?? '')
        .replace(/\D/g, '')
        .slice(0, ATTENDANCE_PIN_MAX_LENGTH);
}

export function isAttendancePinReady(value = '') {
    const pin = normalizeAttendancePin(value);
    return pin.length >= ATTENDANCE_PIN_MIN_LENGTH && pin.length <= ATTENDANCE_PIN_MAX_LENGTH;
}

export function applyAttendancePinKey(currentValue = '', key = '') {
    const current = normalizeAttendancePin(currentValue);
    if (key === 'clear') return '';
    if (key === 'backspace') return current.slice(0, -1);
    if (/^\d$/.test(key)) return normalizeAttendancePin(`${current}${key}`);
    return current;
}

export function filterTimeClockStationEmployees(employees = [], query = '') {
    const tokens = normalizeSearchValue(query)
        .split(/\s+/)
        .filter(Boolean);

    if (!tokens.length) {
        return [...employees];
    }

    return employees.filter((employee) => {
        const searchText = getEmployeeSearchText(employee);
        return tokens.every((token) => searchText.includes(token));
    });
}

export function getTimeClockStationEmployeeInitials(name = '') {
    const words = typeof name === 'string'
        ? name.trim().split(/\s+/).filter(Boolean)
        : [];

    if (!words.length) {
        return '--';
    }

    const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('');
    return initials || '--';
}
