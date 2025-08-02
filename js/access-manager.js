import { collection, doc, getDoc, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class AccessManager {
    constructor(db) {
        this.db = db;
        this.collectionPath = "allowedEmails";
    }

    async listEmails() {
        const snapshot = await getDocs(collection(this.db, this.collectionPath));
        return snapshot.docs.map(doc => doc.id);
    }

    async addEmail(email) {
        const key = email.toLowerCase();
        await setDoc(doc(this.db, this.collectionPath, key), { addedAt: new Date() });
    }

    async removeEmail(email) {
        const key = email.toLowerCase();
        await deleteDoc(doc(this.db, this.collectionPath, key));
    }

    async isEmailAllowed(email) {
        const key = email.toLowerCase();
        const snap = await getDoc(doc(this.db, this.collectionPath, key));
        return snap.exists();
    }
} 