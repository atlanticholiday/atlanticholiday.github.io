import {
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import {
    canonicalizeEmail,
    getEmailLookupKeys,
    getNormalizedEmailDisplay,
    isProductionAccessEmail
} from "../../shared/email.js";
import { normalizeAllowedApps } from "../../shared/app-access.js";
import { isCallableUnavailableError } from "./firebase-function-utils.js";

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

    async getCurrentAccess(email) {
        const normalizedEmail = getNormalizedEmailDisplay(email);
        if (!isProductionAccessEmail(normalizedEmail)) {
            return null;
        }

        try {
            const result = await this.callProtectedFunction('getMyAccess');
            return result.authorized ? result.access || null : null;
        } catch (error) {
            console.warn(
                'Protected access verification is unavailable; checking the signed-in user allowlist record.',
                error
            );
            return this.getAccessEntry(normalizedEmail, { exact: true });
        }
    }

    async listEmails() {
        const snapshot = await getDocs(collection(this.db, this.collectionPath));
        return snapshot.docs.map((docSnapshot) => docSnapshot.data().displayEmail || docSnapshot.id);
    }

    async getAccessEntry(email, { exact = false } = {}) {
        const normalizedEmail = getNormalizedEmailDisplay(email);
        const keys = exact ? [normalizedEmail].filter(Boolean) : getEmailLookupKeys(email);

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
        const normalizedEmail = getNormalizedEmailDisplay(email);
        try {
            await this.callProtectedFunction('adminAddAccess', {
                email: normalizedEmail,
                allowedApps: normalizedAllowedApps || []
            });
        } catch (error) {
            if (!isCallableUnavailableError(error)) throw error;
            await setDoc(doc(this.db, this.collectionPath, canonicalizeEmail(normalizedEmail)), {
                displayEmail: normalizedEmail,
                allowedApps: normalizedAllowedApps || [],
                addedAt: serverTimestamp()
            }, { merge: true });
        }
    }

    async removeEmail(email) {
        const normalizedEmail = getNormalizedEmailDisplay(email);
        try {
            await this.callProtectedFunction('adminRemoveAccess', { email: normalizedEmail });
        } catch (error) {
            if (!isCallableUnavailableError(error)) throw error;

            const batch = writeBatch(this.db);
            getEmailLookupKeys(normalizedEmail).forEach((key) => {
                batch.delete(doc(this.db, this.collectionPath, key));
            });

            const materializedAccess = await getDocs(query(
                collection(this.db, 'userAccess'),
                where('emailCanonical', '==', canonicalizeEmail(normalizedEmail))
            ));
            materializedAccess.docs.forEach((documentSnapshot) => batch.delete(documentSnapshot.ref));
            await batch.commit();
        }
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
        const normalizedEmail = getNormalizedEmailDisplay(email);
        const normalizedRoles = Array.isArray(roles) ? roles : [];
        try {
            await this.callProtectedFunction('adminSetRoles', {
                email: normalizedEmail,
                roles: normalizedRoles
            });
        } catch (error) {
            if (!isCallableUnavailableError(error)) throw error;
            await setDoc(doc(this.db, this.collectionPath, canonicalizeEmail(normalizedEmail)), {
                displayEmail: normalizedEmail,
                roles: normalizedRoles
            }, { merge: true });
        }
    }

    async setAllowedApps(email, allowedApps) {
        const normalizedAllowedApps = normalizeAllowedApps(allowedApps) || [];
        const normalizedEmail = getNormalizedEmailDisplay(email);
        try {
            await this.callProtectedFunction('adminSetAllowedApps', {
                email: normalizedEmail,
                allowedApps: normalizedAllowedApps
            });
        } catch (error) {
            if (!isCallableUnavailableError(error)) throw error;
            await setDoc(doc(this.db, this.collectionPath, canonicalizeEmail(normalizedEmail)), {
                displayEmail: normalizedEmail,
                allowedApps: normalizedAllowedApps
            }, { merge: true });
        }
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
        const normalizedEmail = getNormalizedEmailDisplay(email);
        const normalizedEmployee = employee?.id ? {
                id: String(employee.id),
                name: String(employee.name || ''),
                email: getNormalizedEmailDisplay(employee.email || email),
                isArchived: Boolean(employee.isArchived)
            } : null;

        try {
            await this.callProtectedFunction('adminSyncEmployeeLink', {
                email: normalizedEmail,
                employee: normalizedEmployee
            });
        } catch (error) {
            if (!isCallableUnavailableError(error)) throw error;

            const employeeLinkPatch = normalizedEmployee ? {
                linkedEmployeeId: normalizedEmployee.id,
                linkedEmployeeName: normalizedEmployee.name,
                linkedEmployeeEmail: normalizedEmployee.email,
                linkedEmployeeArchived: normalizedEmployee.isArchived
            } : {
                linkedEmployeeId: deleteField(),
                linkedEmployeeName: deleteField(),
                linkedEmployeeEmail: deleteField(),
                linkedEmployeeArchived: deleteField()
            };

            await setDoc(doc(this.db, this.collectionPath, canonicalizeEmail(normalizedEmail)), {
                displayEmail: normalizedEmail,
                ...employeeLinkPatch
            }, { merge: true });
        }
    }
}
