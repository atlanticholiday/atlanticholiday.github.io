import { normalizeAllowedApps } from './app-access.js';
import { hasPrivilegedRole } from './access-roles.js';

export function isApprovedAccessEntry(accessEntry) {
    return Boolean(accessEntry && typeof accessEntry === 'object');
}

export function getAccessEntryRoles(accessEntry) {
    return isApprovedAccessEntry(accessEntry) && Array.isArray(accessEntry.roles)
        ? accessEntry.roles
        : [];
}

export function getAccessEntryApps(accessEntry) {
    if (!isApprovedAccessEntry(accessEntry)) {
        return [];
    }

    return normalizeAllowedApps(accessEntry.allowedApps) || [];
}

export function canAccessApplication(accessEntry, appKey = '') {
    if (!isApprovedAccessEntry(accessEntry) || !appKey) {
        return false;
    }

    if (hasPrivilegedRole(getAccessEntryRoles(accessEntry))) {
        return true;
    }

    const allowedApps = getAccessEntryApps(accessEntry);
    if (appKey === 'heatedPools' && allowedApps.includes('reservations')) {
        return true;
    }

    return allowedApps.includes(appKey);
}
