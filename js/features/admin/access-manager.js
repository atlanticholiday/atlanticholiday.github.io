import { collection, doc, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { getEmailLookupKeys, getNormalizedEmailDisplay } from "../../shared/email.js";
import { normalizeAllowedApps } from "../../shared/app-access.js";

export class AccessManager {
    constructor(db, functionsInstance = null) {
        this.db = db;
        this.functionsInstance = functionsInstance;
        this.collectionPath = "allowedEmails";
    }

    async callProtectedFunction(name, data = {}) {
        if (!this.functionsInstance) {
            throw new Error('Protected access management is unavailable. Deploy and configure Firebase Functions first.');
        }

        const result = await httpsCallable(this.functionsInstance, name)(data);
        return result.data || {};
    }

    async getCurrentAccess() {
        const result = await this.callProtectedFunction('getMyAccess');
        return result.authorized ? result.access || null : null;
    }

    async listEmails() {
        const snapshot = await getDocs(collection(this.db, this.collectionPath));
        return snapshot.docs.map((docSnapshot) => docSnapshot.data().displayEmail || docSnapshot.id);
    }

    async getAccessEntry(email) {
        const keys = getEmailLookupKeys(email);

        for (const key of keys) {
            const snap = await getDoc(doc(this.db, this.collectionPath, key));
            if (!snap.exists()) {
                continue;
            }

            const data = snap.data();
            return {
                id: snap.id,
                email: data.displayEmail || snap.id,
                displayEmail: data.displayEmail || snap.id,
                roles: Array.isArray(data.roles) ? data.roles : [],
                allowedApps: normalizeAllowedApps(data.allowedApps),
                linkedEmployeeId: data.linkedEmployeeId || null,
                linkedEmployeeName: data.linkedEmployeeName || null,
                linkedEmployeeEmail: data.linkedEmployeeEmail || null,
                linkedEmployeeArchived: Boolean(data.linkedEmployeeArchived)
            };
        }

        return null;
    }

    async addEmail(email, { allowedApps } = {}) {
        const normalizedAllowedApps = normalizeAllowedApps(allowedApps);
        await this.callProtectedFunction('adminAddAccess', {
            email: getNormalizedEmailDisplay(email),
            allowedApps: normalizedAllowedApps || []
        });
    }

    async removeEmail(email) {
        await this.callProtectedFunction('adminRemoveAccess', {
            email: getNormalizedEmailDisplay(email)
        });
    }

    /**
     * Get roles assigned to an email
     * @returns Array of role keys
     */
    async getRoles(email) {
        const entry = await this.getAccessEntry(email);
        return entry?.roles || [];
    }

    async getAllowedApps(email) {
        const entry = await this.getAccessEntry(email);
        return entry?.allowedApps ?? null;
    }

    /**
     * Assign roles to an email
     * @param roles Array of role keys
     */
    async setRoles(email, roles) {
        await this.callProtectedFunction('adminSetRoles', {
            email: getNormalizedEmailDisplay(email),
            roles: Array.isArray(roles) ? roles : []
        });
    }

    async setAllowedApps(email, allowedApps) {
        const normalizedAllowedApps = normalizeAllowedApps(allowedApps) || [];
        await this.callProtectedFunction('adminSetAllowedApps', {
            email: getNormalizedEmailDisplay(email),
            allowedApps: normalizedAllowedApps
        });
    }

    async isEmailAllowed(email) {
        const keys = getEmailLookupKeys(email);
        for (const key of keys) {
            const snap = await getDoc(doc(this.db, this.collectionPath, key));
            if (snap.exists()) {
                return true;
            }
        }
        return false;
    }

    async syncEmployeeLink(email, employee = null) {
        await this.callProtectedFunction('adminSyncEmployeeLink', {
            email: getNormalizedEmailDisplay(email),
            employee: employee?.id ? {
                id: String(employee.id),
                name: String(employee.name || ''),
                email: getNormalizedEmailDisplay(employee.email || email),
                isArchived: Boolean(employee.isArchived)
            } : null
        });
    }
}
