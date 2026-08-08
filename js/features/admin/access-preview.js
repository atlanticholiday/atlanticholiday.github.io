import { getAllAppAccessKeys, normalizeAllowedApps } from '../../shared/app-access.js';
import {
    hasEmployeeSelfServiceRole,
    hasPrivilegedRole,
    hasRole,
    hasTimeClockStationRole
} from '../../shared/access-roles.js';

const COLLEAGUE_APP_SCOPES = Object.freeze({
    laundryLog: 'colleague-workflow',
    linenInventory: 'colleague-workflow',
    nukiDoors: 'operator-only',
    reservations: 'own-records',
    rnal: 'own-records'
});

export function buildEffectiveAccessPreview(user = {}, { hasEmployeeLink = false } = {}) {
    const roles = Array.isArray(user?.roles) ? [...user.roles] : [];
    const isStation = hasTimeClockStationRole(roles);
    const isPrivileged = !isStation && hasPrivilegedRole(roles);
    const isAdmin = isPrivileged && hasRole(roles, 'admin');
    const isSelfService = !isStation
        && !isPrivileged
        && (hasEmployeeSelfServiceRole(roles) || Boolean(hasEmployeeLink));

    let appKeys = [];
    if (isPrivileged) {
        appKeys = getAllAppAccessKeys();
    } else if (!isStation) {
        appKeys = normalizeAllowedApps(user?.allowedApps) || [];
        if (appKeys.includes('reservations') && !appKeys.includes('heatedPools')) {
            appKeys.push('heatedPools');
        }
    }

    let accessLevel = 'no-workspace';
    if (isStation) accessLevel = 'station';
    else if (isAdmin) accessLevel = 'admin';
    else if (isPrivileged) accessLevel = 'manager';
    else if (isSelfService) accessLevel = appKeys.length ? 'employee-with-apps' : 'employee';
    else if (appKeys.length) accessLevel = 'app-only';

    return {
        accessLevel,
        roles,
        appKeys,
        isAdmin,
        isPrivileged,
        isSelfService,
        isStation,
        surfaces: {
            timeClock: isStation ? 'station' : (isPrivileged ? 'manager' : (isSelfService ? 'self-service' : null)),
            schedule: isPrivileged ? 'full' : (isSelfService ? 'monthly-readonly' : null),
            userManagement: isAdmin
        },
        appScopes: appKeys.map((key) => ({
            key,
            scope: isPrivileged ? 'manager' : (COLLEAGUE_APP_SCOPES[key] || 'standard')
        }))
    };
}
