import { collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

export class RoleManager {
    constructor(db, functionsInstance = null) {
        this.db = db;
        this.functionsInstance = functionsInstance;
        this.collectionPath = "roles";
    }

    async callProtectedFunction(name, data = {}) {
        if (!this.functionsInstance) {
            throw new Error('Protected role management is unavailable. Deploy and configure Firebase Functions first.');
        }

        const result = await httpsCallable(this.functionsInstance, name)(data);
        return result.data || {};
    }

    async listRoles() {
        const snapshot = await getDocs(collection(this.db, this.collectionPath));
        return snapshot.docs.map(doc => ({ key: doc.id, title: doc.data().title }));
    }

    async addRole(key, title) {
        await this.callProtectedFunction('adminSaveRole', { key, title });
    }

    async updateRole(key, title) {
        await this.callProtectedFunction('adminSaveRole', { key, title });
    }

    async removeRole(key) {
        await this.callProtectedFunction('adminDeleteRole', { key });
    }
}
