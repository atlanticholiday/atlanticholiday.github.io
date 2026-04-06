export const PRIVILEGED_ROLE_KEYS = Object.freeze(['admin', 'manager', 'supervisor']);
export const EMPLOYEE_SELF_SERVICE_ROLE = 'employee';
export const TIME_CLOCK_STATION_ROLE = 'time-clock-station';
export const SELF_SERVICE_SCHEDULE_VIEWS = Object.freeze(['monthly']);

function normalizeRoleKey(role) {
    return typeof role === 'string' ? role.trim().toLowerCase() : '';
}

export function hasRole(roles = [], roleKey = '') {
    const normalizedRoleKey = normalizeRoleKey(roleKey);
    if (!normalizedRoleKey || !Array.isArray(roles)) {
        return false;
    }

    return roles.some((role) => normalizeRoleKey(role) === normalizedRoleKey);
}

export function hasAnyRole(roles = [], roleKeys = []) {
    if (!Array.isArray(roleKeys) || !roleKeys.length) {
        return false;
    }

    const allowedRoles = new Set(roleKeys.map((role) => normalizeRoleKey(role)).filter(Boolean));
    if (!allowedRoles.size || !Array.isArray(roles)) {
        return false;
    }

    return roles.some((role) => allowedRoles.has(normalizeRoleKey(role)));
}

export function hasPrivilegedRole(roles = []) {
    return hasAnyRole(roles, PRIVILEGED_ROLE_KEYS);
}

export function hasEmployeeSelfServiceRole(roles = []) {
    return hasRole(roles, EMPLOYEE_SELF_SERVICE_ROLE);
}

export function hasTimeClockStationRole(roles = []) {
    return hasRole(roles, TIME_CLOCK_STATION_ROLE);
}

export function isSelfServiceEmployeeUser(roles = [], { hasEmployeeLink = false } = {}) {
    return !hasPrivilegedRole(roles)
        && !hasTimeClockStationRole(roles)
        && (hasEmployeeSelfServiceRole(roles) || Boolean(hasEmployeeLink));
}

export function canAccessSelfServiceSchedule(roles = [], { hasEmployeeLink = false } = {}) {
    return hasPrivilegedRole(roles)
        || isSelfServiceEmployeeUser(roles, { hasEmployeeLink });
}

export function canAccessSharedVacationBoard(roles = [], { hasEmployeeLink = false } = {}) {
    return hasPrivilegedRole(roles);
}

export function isSharedVacationBoardOnlyUser(roles = [], { hasEmployeeLink = false } = {}) {
    return false;
}
