import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class RoleManager {
    constructor(db) {
        this.db = db;
        this.collectionPath = "roles";
    }

    async listRoles() {
        const snapshot = await getDocs(collection(this.db, this.collectionPath));
        return snapshot.docs.map(doc => ({ key: doc.id, title: doc.data().title }));
    }

    async addRole(key, title) {
        await setDoc(doc(this.db, this.collectionPath, key), { title: title, createdAt: new Date() });
    }

    async updateRole(key, title) {
        await updateDoc(doc(this.db, this.collectionPath, key), { title: title });
    }

    async removeRole(key) {
        await deleteDoc(doc(this.db, this.collectionPath, key));
    }
} 