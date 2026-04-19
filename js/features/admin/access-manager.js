import { collection, doc, getDoc, getDocs, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getEmailLookupKeys, getNormalizedEmailDisplay } from "../../shared/email.js";
import { normalizeAllowedApps } from "../../shared/app-access.js";

export class AccessManager {
    constructor(db) {
        this.db = db;
        this.collectionPath = "allowedEmails";
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
        const [primaryKey] = getEmailLookupKeys(email);
        const payload = {
            addedAt: new Date(),
            displayEmail: getNormalizedEmailDisplay(email)
        };

        if (normalizedAllowedApps !== null) {
            payload.allowedApps = normalizedAllowedApps;
        }

        await setDoc(doc(this.db, this.collectionPath, primaryKey), payload, { merge: true });
    }

    async removeEmail(email) {
        const keys = getEmailLookupKeys(email);
        await Promise.all(keys.map((key) => deleteDoc(doc(this.db, this.collectionPath, key))));
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
        const [primaryKey] = getEmailLookupKeys(email);
        await setDoc(doc(this.db, this.collectionPath, primaryKey), {
            roles,
            displayEmail: getNormalizedEmailDisplay(email)
        }, { merge: true });
    }

    async setAllowedApps(email, allowedApps) {
        const normalizedAllowedApps = normalizeAllowedApps(allowedApps) || [];
        const [primaryKey] = getEmailLookupKeys(email);
        await setDoc(doc(this.db, this.collectionPath, primaryKey), {
            allowedApps: normalizedAllowedApps,
            displayEmail: getNormalizedEmailDisplay(email)
        }, { merge: true });
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
        const [primaryKey] = getEmailLookupKeys(email);
        const payload = {
            displayEmail: getNormalizedEmailDisplay(email)
        };

        if (employee?.id) {
            payload.linkedEmployeeId = employee.id;
            payload.linkedEmployeeName = employee.name || '';
            payload.linkedEmployeeEmail = getNormalizedEmailDisplay(employee.email || email);
            payload.linkedEmployeeArchived = Boolean(employee.isArchived);
        } else {
            payload.linkedEmployeeId = deleteField();
            payload.linkedEmployeeName = deleteField();
            payload.linkedEmployeeEmail = deleteField();
            payload.linkedEmployeeArchived = deleteField();
        }

        await setDoc(doc(this.db, this.collectionPath, primaryKey), payload, { merge: true });
    }
} 
