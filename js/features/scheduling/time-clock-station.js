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
