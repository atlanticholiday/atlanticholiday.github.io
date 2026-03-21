import { collection, doc, addDoc, onSnapshot, deleteDoc, setDoc, updateDoc, deleteField, runTransaction, increment, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ChangeNotifier } from '../../shared/change-notifier.js';
import {
    buildEmployeeUpdatePayload,
    createEmployeeRecord,
    getEmployeeStatusForDate as resolveEmployeeStatusForDate,
    isDateInVacation as checkDateInVacation,
    partitionEmployeesByArchiveStatus
} from './employee-records.js';
import { HolidayCalculator, getDateKey } from './holiday-calculator.js';

export class DataManager {
    constructor(db, userId = null, holidayCalculator = new HolidayCalculator()) {
        this.db = db;
        this.userId = userId;
        this.activeEmployees = [];
        this.archivedEmployees = [];
        this.holidayCalculator = holidayCalculator;
        this.changeNotifier = new ChangeNotifier();
        this.currentDate = new Date();
        this.lastMonthlyDate = new Date();
        this.selectedDateKey = null;
        this.currentView = 'monthly';
        this.unsubscribe = null;
        this.unsubscribeNotes = null;
        this.dailyNotes = {};
        this.shiftPresets = [];
        this.minStaffThreshold = 0;
        this.unsubscribeShiftPresets = null;
        this.unsubscribeSettings = null;

        // Initialize holidays for current year immediately
        this.initializeHolidays();
    }

    setUserId(userId) {
        this.userId = userId;
    }

    initializeHolidays() {
        const currentYear = new Date().getFullYear();
        this.preloadHolidaysAroundYear(currentYear);
    }

    getEmployeesCollectionRef() {
        return collection(this.db, "employees");
    }

    preloadHolidaysAroundYear(year) {
        this.holidayCalculator.preloadYears([year - 1, year, year + 1]);
    }

    subscribeToDataChanges(callback) {
        return this.changeNotifier.subscribe(callback);
    }

    setOnDataChangeCallback(callback) {
        return this.subscribeToDataChanges(callback);
    }

    notifyDataChange() {
        this.changeNotifier.notify();
    }

    listenForEmployeeChanges() {
        this.unsubscribe = onSnapshot(this.getEmployeesCollectionRef(), (snapshot) => {
            const readCount = snapshot.docs.length || 1;
            console.log(`👥 [FIRESTORE READ] Employee listener triggered - ${readCount} reads from employees collection`);
            console.log(`👥 [FIRESTORE READ] Employee snapshot metadata:`, {
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites,
                docChanges: snapshot.docChanges().length,
                isFirstLoad: snapshot.docChanges().every(change => change.type === 'added')
            });

            const allEmployees = snapshot.docs
                .filter(doc => doc.id !== 'metadata')
                .map(doc => ({ id: doc.id, ...doc.data() }));

            console.log(`👥 [FIRESTORE READ] Processed ${allEmployees.length} employees (filtered out metadata doc)`);

            if (allEmployees.length === 0 && snapshot.docs.length <= 1) {
                // Dispatch event instead of directly showing setup screen
                const event = new CustomEvent('noEmployeesFound');
                document.dispatchEvent(event);
                return;
            }

            const { activeEmployees, archivedEmployees } = partitionEmployeesByArchiveStatus(allEmployees);
            this.activeEmployees = activeEmployees;
            this.archivedEmployees = archivedEmployees;
            this.preloadHolidaysAroundYear(this.currentDate.getFullYear());
            this.notifyDataChange();
        }, (error) => console.error("Error listening:", error));
    }

    listenForDailyNotes() {
        // Create a listener for the daily_notes collection
        const notesCollection = collection(this.db, "daily_notes");
        this.unsubscribeNotes = onSnapshot(notesCollection, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" || change.type === "modified") {
                    this.dailyNotes[change.doc.id] = change.doc.data().note;
                }
                if (change.type === "removed") {
                    delete this.dailyNotes[change.doc.id];
                }
            });
            this.notifyDataChange();
        }, (error) => console.error("Error listening for notes:", error));
    }

    listenForShiftPresets() {
        const presetsCollection = collection(this.db, "shift_presets");
        this.unsubscribeShiftPresets = onSnapshot(presetsCollection, (snapshot) => {
            const presets = [];
            snapshot.forEach((doc) => {
                presets.push({ id: doc.id, ...doc.data() });
            });
            this.shiftPresets = presets;
            this.notifyDataChange();
        }, (error) => console.error("Error listening for shift presets:", error));
    }

    listenForGlobalSettings() {
        // Global settings document
        const settingsDoc = doc(this.db, "settings", "global");
        this.unsubscribeSettings = onSnapshot(settingsDoc, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                this.minStaffThreshold = data.minStaffThreshold || 0;
            } else {
                this.minStaffThreshold = 0;
            }
            this.notifyDataChange();
        }, (error) => console.error("Error listening for settings:", error));
    }

    async saveShiftPreset(name, start, end) {
        await addDoc(collection(this.db, "shift_presets"), { name, start, end });
    }

    async deleteShiftPreset(id) {
        await deleteDoc(doc(this.db, "shift_presets", id));
    }

    async saveMinStaffThreshold(count) {
        const settingsRef = doc(this.db, "settings", "global");
        await setDoc(settingsRef, { minStaffThreshold: parseInt(count) }, { merge: true });
    }

    // Removed showSetupScreen - navigation is now handled by NavigationManager

    async addEmployee(name, staffNumber, workDays) {
        const newEmployeeData = createEmployeeRecord({
            name,
            staffNumber,
            workDays,
            displayOrder: this.activeEmployees.length
        });

        return await addDoc(this.getEmployeesCollectionRef(), newEmployeeData);
    }

    async handleStatusChange(employeeId, dateKey, newStatus) {
        const docRef = doc(this.db, "employees", employeeId);
        const fieldPath = `overrides.${dateKey}`;
        const updateData = { [fieldPath]: newStatus };
        await updateDoc(docRef, updateData).catch(e => console.error("Status update failed:", e));
    }

    async handleExtraHoursChange(employeeId, dateKey, hours) {
        const docRef = doc(this.db, "employees", employeeId);
        const fieldPath = `extraHours.${dateKey}`;
        const hoursValue = parseFloat(hours);
        const updateData = (isNaN(hoursValue) || hoursValue <= 0) ? { [fieldPath]: deleteField() } : { [fieldPath]: hoursValue };
        await updateDoc(docRef, updateData).catch(e => console.error("Extra hours update failed:", e));
    }

    async handleExtraHoursNotesChange(employeeId, dateKey, note) {
        const docRef = doc(this.db, "employees", employeeId);
        const fieldPath = `extraHoursNotes.${dateKey}`;
        const noteText = note.trim();
        const updateData = noteText ? { [fieldPath]: noteText } : { [fieldPath]: deleteField() };
        await updateDoc(docRef, updateData).catch(e => console.error("Extra hours note update failed:", e));
    }

    async saveDailyNote(dateKey, note) {
        const docRef = doc(this.db, "daily_notes", dateKey);
        if (!note || note.trim() === '') {
            await deleteDoc(docRef).catch(e => console.error("Failed to delete daily note:", e));
        } else {
            await setDoc(docRef, { note: note.trim() }).catch(e => console.error("Failed to save daily note:", e));
        }
    }

    getDailyNote(dateKey) {
        return this.dailyNotes[dateKey] || '';
    }

    async handleScheduleVacation(employeeId, startDate, endDate) {
        if (!startDate || !endDate || new Date(endDate) < new Date(startDate)) {
            alert("Please select a valid date range.");
            return;
        }
        const empDoc = this.activeEmployees.find(e => e.id === employeeId);
        if (!empDoc) return;

        const newVacation = { startDate, endDate };
        const updatedVacations = [...(empDoc.vacations || []), newVacation];

        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { vacations: updatedVacations }).catch(e => console.error("Failed to schedule vacation", e));
    }

    async handleDeleteVacation(employeeId, vacationIndex) {
        const empDoc = this.activeEmployees.find(e => e.id === employeeId);
        if (!empDoc || !empDoc.vacations) return;

        const updatedVacations = empDoc.vacations.filter((_, index) => index !== vacationIndex);

        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { vacations: updatedVacations }).catch(e => console.error("Failed to delete vacation", e));
    }
    // Add a method to update an existing vacation entry
    async handleUpdateVacation(employeeId, vacationIndex, startDate, endDate) {
        const empDoc = this.activeEmployees.find(e => e.id === employeeId);
        if (!empDoc) return;
        const updatedVacations = empDoc.vacations.map((vac, idx) =>
            idx === vacationIndex ? { startDate, endDate } : vac
        );
        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { vacations: updatedVacations }).catch(e => console.error("Failed to update vacation", e));
    }

    getEmployeeOrderFromDom() {
        return [...document.querySelectorAll('#reorder-list-container .draggable')]
            .map((element) => element.dataset.employeeId)
            .filter(Boolean);
    }

    async saveEmployeeOrder(reorderedIds = this.getEmployeeOrderFromDom()) {
        const updates = reorderedIds.map((id, index) => {
            const docRef = doc(this.db, "employees", id);
            return updateDoc(docRef, { displayOrder: index });
        });
        await Promise.all(updates).catch(e => console.error("Failed to save new order", e));
    }

    async saveNewOrder(reorderedIds) {
        return this.saveEmployeeOrder(reorderedIds);
    }

    async setEmployeeArchiveStatus(employeeId, isArchived) {
        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { isArchived }).catch(e => console.error("Archive update failed", e));
    }

    async archiveEmployee(employeeId) {
        return this.setEmployeeArchiveStatus(employeeId, true);
    }

    async restoreEmployee(employeeId) {
        return this.setEmployeeArchiveStatus(employeeId, false);
    }

    async handleArchiveToggle(employeeId, shouldArchive) {
        return this.setEmployeeArchiveStatus(employeeId, shouldArchive);
    }

    async deleteEmployee(employeeId) {
        const docRef = doc(this.db, "employees", employeeId);
        await deleteDoc(docRef).catch(e => console.error("Permanent delete failed:", e));
    }

    async handlePermanentDelete(employeeId) {
        return this.deleteEmployee(employeeId);
    }

    async handleUpdateWorkingDays(employeeId, newWorkDays) {
        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { workDays: newWorkDays }).catch(e => console.error("Working days update failed:", e));
    }

    async updateEmployee(employeeId, updatedData) {
        const docRef = doc(this.db, "employees", employeeId);
        const cleanData = buildEmployeeUpdatePayload(updatedData);

        await updateDoc(docRef, cleanData).catch(e => {
            console.error("Employee update failed:", e);
            throw e;
        });
    }

    async initializeDatabase() {
        await setDoc(doc(this.db, "employees", 'metadata'), { initialized: true });
        this.listenForEmployeeChanges();
        this.listenForDailyNotes();
    }

    getHolidays(year) {
        return this.holidayCalculator.getHolidays(year);
    }

    getDateKey(date) {
        return getDateKey(date);
    }

    isDateInVacation(date, vacations) {
        return checkDateInVacation(date, vacations);
    }

    getEmployeeStatusForDate(employee, date) {
        return resolveEmployeeStatusForDate(employee, date, this.getHolidaysForYear(date.getFullYear()));
    }

    // Getters for UI access
    getActiveEmployees() { return this.activeEmployees; }
    getArchivedEmployees() { return this.archivedEmployees; }
    getAllHolidays() { return this.holidayCalculator.getAllHolidays(); }
    getCurrentDate() { return this.currentDate; }
    getCurrentView() { return this.currentView; }
    getSelectedDateKey() { return this.selectedDateKey; }

    ensureHolidaysForYear(year) {
        return this.holidayCalculator.ensureYear(year);
    }

    getHolidaysForYear(year) {
        return this.holidayCalculator.getHolidays(year);
    }

    // Setters for UI updates
    setCurrentDate(date) {
        this.currentDate = date;
        this.preloadHolidaysAroundYear(date.getFullYear());
    }
    setCurrentView(view) { this.currentView = view; }
    setSelectedDateKey(key) { this.selectedDateKey = key; }

    // Welcome Pack Methods
    async getWelcomePackItems() {
        const querySnapshot = await getDocs(collection(this.db, "welcome_pack_items"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveWelcomePackItem(item) {
        await addDoc(collection(this.db, "welcome_pack_items"), { ...item, quantity: parseInt(item.quantity) || 0 });
    }

    async updateWelcomePackItem(id, data) {
        await updateDoc(doc(this.db, "welcome_pack_items", id), data);
    }

    async deleteWelcomePackItem(id) {
        await deleteDoc(doc(this.db, "welcome_pack_items", id));
    }

    async getWelcomePackLogs() {
        const querySnapshot = await getDocs(collection(this.db, "welcome_pack_logs"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async logWelcomePack(log) {
        await runTransaction(this.db, async (transaction) => {
            const newLogRef = doc(collection(this.db, "welcome_pack_logs"));
            transaction.set(newLogRef, log);

            // Deduct stock by quantity (default to 1 for backward compatibility)
            for (const item of log.items) {
                if (item.id) {
                    const qty = item.quantity || 1;
                    const itemRef = doc(this.db, "welcome_pack_items", item.id);
                    transaction.update(itemRef, { quantity: increment(-qty) });
                }
            }
        });
    }

    async deleteWelcomePackLog(logId, items) {
        await runTransaction(this.db, async (transaction) => {
            const logRef = doc(this.db, "welcome_pack_logs", logId);
            transaction.delete(logRef);

            // Restore stock by quantity
            for (const item of items) {
                if (item.id) {
                    const qty = item.quantity || 1;
                    const itemRef = doc(this.db, "welcome_pack_items", item.id);
                    transaction.update(itemRef, { quantity: increment(qty) });
                }
            }
        });
    }

    async updateWelcomePackLog(logId, oldItems, newLog) {
        await runTransaction(this.db, async (transaction) => {
            const logRef = doc(this.db, "welcome_pack_logs", logId);
            transaction.update(logRef, newLog);

            // Restore old stock by quantity
            for (const item of oldItems) {
                if (item.id) {
                    const qty = item.quantity || 1;
                    const itemRef = doc(this.db, "welcome_pack_items", item.id);
                    transaction.update(itemRef, { quantity: increment(qty) });
                }
            }

            // Deduct new stock by quantity
            for (const item of newLog.items) {
                if (item.id) {
                    const qty = item.quantity || 1;
                    const itemRef = doc(this.db, "welcome_pack_items", item.id);
                    transaction.update(itemRef, { quantity: increment(-qty) });
                }
            }
        });
    }


    async getWelcomePackPresets() {
        const querySnapshot = await getDocs(collection(this.db, "welcome_pack_presets"));
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async saveWelcomePackPreset(preset) {
        await addDoc(collection(this.db, "welcome_pack_presets"), preset);
    }

    async deleteWelcomePackPreset(id) {
        await deleteDoc(doc(this.db, "welcome_pack_presets", id));
    }

    // ==================== Properties Methods ====================

    /**
     * Get all properties from Firestore
     * @returns {Promise<Array>} Array of property objects with id
     */
    async getAllProperties() {
        try {
            const querySnapshot = await getDocs(collection(this.db, "properties"));
            return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error('[DataManager] Error fetching properties:', error);
            return [];
        }
    }

    /**
     * Update iCal URL for a property
     * @param {string} propertyId - The property ID
     * @param {string} icalUrl - The iCal URL (can be empty to remove)
     */
    async updatePropertyIcalUrl(propertyId, icalUrl) {
        try {
            const propertyRef = doc(this.db, "properties", propertyId);
            await updateDoc(propertyRef, {
                icalUrl: icalUrl || null,
                icalLastSync: null, // Reset last sync when URL changes
                updatedAt: new Date()
            });
            console.log(`[DataManager] Updated iCal URL for property ${propertyId}`);
        } catch (error) {
            console.error('[DataManager] Error updating property iCal URL:', error);
            throw error;
        }
    }

    /**
     * Update a property's welcome pack enabled status
     * @param {string} propertyId - The property ID
     * @param {boolean} enabled - Whether welcome pack is enabled
     */
    async updatePropertyWelcomePack(propertyId, enabled) {
        try {
            const propertyRef = doc(this.db, "properties", propertyId);
            await updateDoc(propertyRef, {
                welcomePackEnabled: enabled,
                updatedAt: new Date()
            });
            console.log(`[DataManager] Updated welcome pack status for property ${propertyId}: ${enabled}`);
        } catch (error) {
            console.error('[DataManager] Error updating property welcome pack:', error);
            throw error;
        }
    }
}
