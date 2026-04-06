import { canonicalizeEmail, getNormalizedEmailDisplay } from '../../shared/email.js';
import { PRIVILEGED_ROLE_KEYS, hasTimeClockStationRole } from '../../shared/access-roles.js';

function normalizeName(value) {
    return typeof value === 'string' ? value.trim() : '';
}

export function buildEmployeeAccessOverview(employees = [], users = [], privilegedRoles = PRIVILEGED_ROLE_KEYS) {
    const privilegedRoleSet = new Set(privilegedRoles);
    const usersByEmail = new Map(
        users
            .filter((user) => canonicalizeEmail(user?.email))
            .map((user) => [canonicalizeEmail(user.email), user])
    );

    return employees
        .map((employee) => {
            const email = canonicalizeEmail(employee?.email);
            const displayEmail = getNormalizedEmailDisplay(employee?.email);
            const matchedUser = email ? usersByEmail.get(email) : null;
            const roles = Array.isArray(matchedUser?.roles) ? matchedUser.roles : [];
            const station = hasTimeClockStationRole(roles);
            const privileged = roles.some((role) => privilegedRoleSet.has(role));

            if (!email) {
                return {
                    employeeId: employee?.id || null,
                    employeeName: normalizeName(employee?.name) || 'Unnamed colleague',
                    email: null,
                    displayEmail: null,
                    roles: [],
                    status: 'missing-email',
                    label: 'Missing staff email',
                    helpText: 'Add the same email the colleague will use to sign in.'
                };
            }

            if (!matchedUser) {
                return {
                    employeeId: employee?.id || null,
                    employeeName: normalizeName(employee?.name) || 'Unnamed colleague',
                    email,
                    displayEmail,
                    roles: [],
                    status: 'missing-access',
                    label: 'No app access',
                    helpText: 'Create access for this email in User Management.'
                };
            }

            if (station) {
                return {
                    employeeId: employee?.id || null,
                    employeeName: normalizeName(employee?.name) || 'Unnamed colleague',
                    email,
                    displayEmail,
                    roles,
                    status: 'station',
                    label: 'Shared station',
                    helpText: 'This login opens the shared tablet picker so any colleague can clock in or out.'
                };
            }

            if (privileged) {
                return {
                    employeeId: employee?.id || null,
                    employeeName: normalizeName(employee?.name) || 'Unnamed colleague',
                    email,
                    displayEmail,
                    roles,
                    status: 'privileged',
                    label: 'Privileged access',
                    helpText: 'This user keeps manager/admin visibility.'
                };
            }

            return {
                employeeId: employee?.id || null,
                employeeName: normalizeName(employee?.name) || 'Unnamed colleague',
                email,
                displayEmail,
                roles,
                status: 'clock-only',
                label: 'Self-service employee',
                helpText: 'This user opens only the time clock and the read-only work schedule.'
            };
        })
        .sort((left, right) => left.employeeName.localeCompare(right.employeeName));
}
