import { collection, doc, addDoc, onSnapshot, deleteDoc, setDoc, updateDoc, deleteField, runTransaction, increment, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { t } from '../../core/i18n.js';
import { ChangeNotifier } from '../../shared/change-notifier.js';
import {
    buildEmployeeUpdatePayload,
    createEmployeeRecord,
    getEmployeeStatusForDate as resolveEmployeeStatusForDate,
    isDateInVacation as checkDateInVacation,
    partitionEmployeesByArchiveStatus
} from './employee-records.js';
import {
    buildSharedVacationEntries,
    createVacationRecord,
    getVacationRecordDocId,
    groupVacationRecordsByEmployee,
    mergeEmployeeVacations,
    normalizeVacationEntry,
    toEmployeeVacationEntry
} from './vacation-records.js';
import {
    appendAttendanceEvent,
    createAttendanceRecord,
    formatLocalDateTime,
    getAttendanceActionState,
    getAttendanceReviewQueue,
    getWeeklyAttendanceSummary,
    setAttendanceReview,
    summarizeAttendanceRecord
} from './attendance-records.js';
import { HolidayCalculator, getDateKey } from './holiday-calculator.js';
import { canonicalizeEmail } from '../../shared/email.js';
import {
    canAccessSelfServiceSchedule,
    canAccessSharedVacationBoard,
    hasPrivilegedRole,
    isSelfServiceEmployeeUser,
    SELF_SERVICE_SCHEDULE_VIEWS,
    hasTimeClockStationRole,
    isSharedVacationBoardOnlyUser
} from '../../shared/access-roles.js';
import { normalizeAllowedApps } from '../../shared/app-access.js';
import { normalizeManualAttendanceNote } from './time-clock-controls.js';

export class DataManager {
    constructor(db, userId = null, holidayCalculator = new HolidayCalculator()) {
        this.db = db;
        this.userId = userId;
        this.rawActiveEmployees = [];
        this.rawArchivedEmployees = [];
        this.activeEmployees = [];
        this.archivedEmployees = [];
        this.hasLoadedEmployees = false;
        this.employeeLoadError = null;
        this.vacationRecords = [];
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
        this.unsubscribeAttendance = null;
        this.unsubscribeVacationRecords = null;
        this.attendanceRecords = {};
        this.hasLoadedVacationRecords = false;
        this.isSyncingLegacyVacationRecords = false;
        this.attendanceSyncState = {
            online: this.getBrowserOnlineStatus(),
            fromCache: false,
            hasPendingWrites: false,
            lastError: null,
            lastSnapshotAt: null,
            lastSuccessfulSyncAt: null
        };
        this.currentUserContext = {
            uid: null,
            email: null,
            emailCanonical: null,
            roles: [],
            allowedApps: null,
            linkedEmployee: null
        };

        this.bindBrowserConnectivityListeners();

        // Initialize holidays for current year immediately
        this.initializeHolidays();
    }

    setUserId(userId) {
        this.userId = userId;
    }

    setCurrentUserContext({ uid = null, email = null, roles = [], allowedApps = null, linkedEmployee = null } = {}) {
        this.currentUserContext = {
            uid,
            email: typeof email === 'string' ? email.trim().toLowerCase() : null,
            emailCanonical: canonicalizeEmail(email),
            roles: Array.isArray(roles) ? roles : [],
            allowedApps: normalizeAllowedApps(allowedApps),
            linkedEmployee: linkedEmployee?.id ? {
                id: linkedEmployee.id,
                name: linkedEmployee.name || '',
                email: typeof linkedEmployee.email === 'string' ? linkedEmployee.email.trim().toLowerCase() : null,
                isArchived: Boolean(linkedEmployee.isArchived)
            } : null
        };
        this.notifyDataChange();
    }

    clearCurrentUserContext() {
        this.setCurrentUserContext();
    }

    resetSessionState() {
        this.rawActiveEmployees = [];
        this.rawArchivedEmployees = [];
        this.activeEmployees = [];
        this.archivedEmployees = [];
        this.hasLoadedEmployees = false;
        this.employeeLoadError = null;
        this.vacationRecords = [];
        this.attendanceRecords = {};
        this.dailyNotes = {};
        this.shiftPresets = [];
        this.minStaffThreshold = 0;
        this.selectedDateKey = null;
        this.hasLoadedVacationRecords = false;
        this.attendanceSyncState = {
            online: this.getBrowserOnlineStatus(),
            fromCache: false,
            hasPendingWrites: false,
            lastError: null,
            lastSnapshotAt: null,
            lastSuccessfulSyncAt: null
        };
        this.notifyDataChange();
    }

    initializeHolidays() {
        const currentYear = new Date().getFullYear();
        this.preloadHolidaysAroundYear(currentYear);
    }

    getEmployeesCollectionRef() {
        return collection(this.db, "employees");
    }

    getAttendanceCollectionRef() {
        return collection(this.db, "attendance_records");
    }

    getVacationRecordsCollectionRef() {
        return collection(this.db, "vacation_records");
    }

    preloadHolidaysAroundYear(year) {
        this.holidayCalculator.preloadYears([year - 1, year, year + 1]);
    }

    getBrowserOnlineStatus() {
        if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
            return true;
        }

        return navigator.onLine;
    }

    bindBrowserConnectivityListeners() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
            return;
        }

        window.addEventListener('online', () => {
            this.updateAttendanceSyncState({
                online: true,
                lastError: null
            });
            this.notifyDataChange();
        });

        window.addEventListener('offline', () => {
            this.updateAttendanceSyncState({
                online: false
            });
            this.notifyDataChange();
        });
    }

    subscribeToDataChanges(callback) {
        return this.changeNotifier.subscribe(callback);
    }

    setOnDataChangeCallback(callback) {
        return this.subscribeToDataChanges(callback);
    }

    updateAttendanceSyncState(partialState = {}) {
        this.attendanceSyncState = {
            ...this.attendanceSyncState,
            ...partialState
        };
    }

    getAttendanceSyncState() {
        return { ...this.attendanceSyncState };
    }

    notifyDataChange() {
        this.changeNotifier.notify();
    }

    listenForEmployeeChanges() {
        this.employeeLoadError = null;
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

            this.hasLoadedEmployees = true;
            this.employeeLoadError = null;

            if (allEmployees.length === 0 && snapshot.docs.length <= 1) {
                // Dispatch event instead of directly showing setup screen
                const event = new CustomEvent('noEmployeesFound');
                document.dispatchEvent(event);
                return;
            }

            const { activeEmployees, archivedEmployees } = partitionEmployeesByArchiveStatus(allEmployees);
            this.rawActiveEmployees = activeEmployees;
            this.rawArchivedEmployees = archivedEmployees;
            this.rebuildEmployeesFromSources();
            this.syncLegacyVacationRecords().catch((error) => console.error("Failed to sync legacy vacation records", error));
        }, (error) => {
            this.hasLoadedEmployees = false;
            this.employeeLoadError = error;
            this.notifyDataChange();
            console.error("Error listening:", error);
        });
    }

    listenForVacationRecordChanges() {
        this.unsubscribeVacationRecords = onSnapshot(this.getVacationRecordsCollectionRef(), (snapshot) => {
            this.vacationRecords = snapshot.docs
                .map((recordDoc) => normalizeVacationEntry({ id: recordDoc.id, ...recordDoc.data() }))
                .filter(Boolean);
            this.hasLoadedVacationRecords = true;
            this.rebuildEmployeesFromSources();
            this.syncLegacyVacationRecords().catch((error) => console.error("Failed to sync legacy vacation records", error));
        }, (error) => console.error("Error listening for vacation records:", error));
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

    listenForAttendanceChanges() {
        this.unsubscribeAttendance = onSnapshot(this.getAttendanceCollectionRef(), { includeMetadataChanges: true }, (snapshot) => {
            const nextAttendanceRecords = { ...this.attendanceRecords };

            snapshot.docChanges().forEach((change) => {
                if (change.type === "removed") {
                    delete nextAttendanceRecords[change.doc.id];
                    return;
                }

                nextAttendanceRecords[change.doc.id] = {
                    id: change.doc.id,
                    ...change.doc.data()
                };
            });

            const snapshotAt = new Date().toISOString();
            this.attendanceRecords = nextAttendanceRecords;
            this.updateAttendanceSyncState({
                online: this.getBrowserOnlineStatus(),
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites,
                lastError: null,
                lastSnapshotAt: snapshotAt,
                lastSuccessfulSyncAt: (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites)
                    ? snapshotAt
                    : this.attendanceSyncState.lastSuccessfulSyncAt
            });
            this.notifyDataChange();
        }, (error) => {
            this.updateAttendanceSyncState({
                online: this.getBrowserOnlineStatus(),
                fromCache: true,
                hasPendingWrites: false,
                lastError: error?.message || 'attendance-sync-error'
            });
            this.notifyDataChange();
            console.error("Error listening for attendance:", error);
        });
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

    async addEmployee(name, staffNumber, workDays, { vacationAdjustment = 0 } = {}) {
        const newEmployeeData = createEmployeeRecord({
            name,
            staffNumber,
            workDays,
            displayOrder: this.activeEmployees.length,
            vacationAdjustment
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

    rebuildEmployeesFromSources() {
        const vacationRecordsByEmployee = groupVacationRecordsByEmployee(this.vacationRecords);
        const mergeEmployee = (employee) => ({
            ...employee,
            vacations: mergeEmployeeVacations(
                employee.vacations || [],
                vacationRecordsByEmployee.get(employee.id) || [],
                employee.id
            )
        });

        this.activeEmployees = this.rawActiveEmployees.map(mergeEmployee);
        this.archivedEmployees = this.rawArchivedEmployees.map(mergeEmployee);
        this.preloadHolidaysAroundYear(this.currentDate.getFullYear());
        this.notifyDataChange();
    }

    getEmployeeById(employeeId) {
        return this.activeEmployees.find((employee) => employee.id === employeeId)
            || this.archivedEmployees.find((employee) => employee.id === employeeId)
            || null;
    }

    serializeEmployeeVacations(vacations = [], employeeId = null) {
        return vacations
            .map((vacation) => toEmployeeVacationEntry(vacation, employeeId))
            .filter(Boolean)
            .map((vacation) => ({
                id: vacation.id,
                startDate: vacation.startDate,
                endDate: vacation.endDate
            }));
    }

    findEmployeeVacationIndex(employee, vacationReference) {
        if (!employee || !Array.isArray(employee.vacations) || employee.vacations.length === 0) {
            return -1;
        }

        if (Number.isInteger(vacationReference)) {
            return vacationReference >= 0 && vacationReference < employee.vacations.length
                ? vacationReference
                : -1;
        }

        const requestedId = typeof vacationReference === 'string'
            ? vacationReference.trim()
            : normalizeVacationEntry(vacationReference, { employeeId: employee.id })?.id;

        if (requestedId) {
            return employee.vacations.findIndex((vacation) => {
                return toEmployeeVacationEntry(vacation, employee.id)?.id === requestedId;
            });
        }

        return -1;
    }

    createVacationRecordPayload(vacationRecord, source = 'planner') {
        return {
            employeeId: vacationRecord.employeeId,
            startDate: vacationRecord.startDate,
            endDate: vacationRecord.endDate,
            status: vacationRecord.status,
            visibility: vacationRecord.visibility,
            note: vacationRecord.note,
            source
        };
    }

    async syncLegacyVacationRecords() {
        if (!this.hasLoadedVacationRecords || this.isSyncingLegacyVacationRecords) {
            return;
        }

        const employees = [...this.rawActiveEmployees, ...this.rawArchivedEmployees];
        if (!employees.length) {
            return;
        }

        const existingRecordIds = new Set(
            this.vacationRecords
                .map((record) => record?.id || getVacationRecordDocId(record?.employeeId, record?.startDate, record?.endDate))
                .filter(Boolean)
        );

        const recordsToBackfill = employees.flatMap((employee) => {
            return (employee.vacations || [])
                .map((vacation) => createVacationRecord({
                    employeeId: employee.id,
                    startDate: vacation?.startDate,
                    endDate: vacation?.endDate
                }, { source: 'employee-doc' }))
                .filter((record) => record && !existingRecordIds.has(record.id));
        });

        if (!recordsToBackfill.length) {
            return;
        }

        this.isSyncingLegacyVacationRecords = true;

        try {
            await Promise.all(recordsToBackfill.map((record) => {
                const recordRef = doc(this.db, "vacation_records", record.id);
                return setDoc(recordRef, this.createVacationRecordPayload(record, 'employee-doc'), { merge: true });
            }));
        } finally {
            this.isSyncingLegacyVacationRecords = false;
        }
    }

    async handleScheduleVacation(employeeId, startDate, endDate) {
        if (!this.isValidVacationRange(startDate, endDate)) {
            alert(t('schedule.vacation.invalidRangeError'));
            return;
        }
        const empDoc = this.getEmployeeById(employeeId);
        if (!empDoc) return;

        const vacationRecord = createVacationRecord({ employeeId, startDate, endDate }, { source: 'planner' });
        if (!vacationRecord) {
            return;
        }

        const updatedVacations = mergeEmployeeVacations(
            empDoc.vacations || [],
            [vacationRecord],
            employeeId
        );

        const employeeRef = doc(this.db, "employees", employeeId);
        const vacationRecordRef = doc(this.db, "vacation_records", vacationRecord.id);
        await Promise.all([
            updateDoc(employeeRef, { vacations: this.serializeEmployeeVacations(updatedVacations, employeeId) }),
            setDoc(vacationRecordRef, this.createVacationRecordPayload(vacationRecord), { merge: true })
        ]).catch(e => console.error("Failed to schedule vacation", e));
    }

    async handleDeleteVacation(employeeId, vacationReference) {
        const empDoc = this.getEmployeeById(employeeId);
        if (!empDoc || !empDoc.vacations) return;

        const vacationIndex = this.findEmployeeVacationIndex(empDoc, vacationReference);
        if (vacationIndex < 0) {
            return;
        }

        const vacationToDelete = toEmployeeVacationEntry(empDoc.vacations[vacationIndex], employeeId);
        const updatedVacations = empDoc.vacations.filter((_, index) => index !== vacationIndex);

        const employeeRef = doc(this.db, "employees", employeeId);
        const writes = [
            updateDoc(employeeRef, { vacations: this.serializeEmployeeVacations(updatedVacations, employeeId) })
        ];

        if (vacationToDelete?.id) {
            writes.push(deleteDoc(doc(this.db, "vacation_records", vacationToDelete.id)));
        }

        await Promise.all(writes).catch(e => console.error("Failed to delete vacation", e));
    }
    // Add a method to update an existing vacation entry
    async handleUpdateVacation(employeeId, vacationReference, startDate, endDate) {
        if (!this.isValidVacationRange(startDate, endDate)) {
            alert(t('schedule.vacation.invalidRangeError'));
            return;
        }

        const empDoc = this.getEmployeeById(employeeId);
        if (!empDoc) return;

        const vacationIndex = this.findEmployeeVacationIndex(empDoc, vacationReference);
        if (vacationIndex < 0) {
            return;
        }

        const previousVacation = toEmployeeVacationEntry(empDoc.vacations[vacationIndex], employeeId);
        if (!previousVacation) {
            return;
        }

        const updatedVacation = createVacationRecord({
            employeeId,
            startDate,
            endDate,
            status: previousVacation.status,
            note: previousVacation.note,
            visibility: previousVacation.visibility
        }, { source: 'planner', visibility: previousVacation.visibility || 'team' });

        if (!updatedVacation) {
            return;
        }

        const updatedVacations = empDoc.vacations.map((vacation, index) => {
            return index === vacationIndex ? updatedVacation : vacation;
        });

        const employeeRef = doc(this.db, "employees", employeeId);
        const writes = [
            updateDoc(employeeRef, { vacations: this.serializeEmployeeVacations(updatedVacations, employeeId) }),
            setDoc(
                doc(this.db, "vacation_records", updatedVacation.id),
                this.createVacationRecordPayload(updatedVacation),
                { merge: true }
            )
        ];

        if (previousVacation.id && previousVacation.id !== updatedVacation.id) {
            writes.push(deleteDoc(doc(this.db, "vacation_records", previousVacation.id)));
        }

        await Promise.all(writes).catch(e => console.error("Failed to update vacation", e));
    }

    isValidVacationRange(startDate, endDate) {
        if (!startDate || !endDate) {
            return false;
        }

        return new Date(`${endDate}T00:00:00`) >= new Date(`${startDate}T00:00:00`);
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
        this.listenForVacationRecordChanges();
        this.listenForDailyNotes();
        this.listenForAttendanceChanges();
    }

    stopRealtimeListeners() {
        [
            this.unsubscribe,
            this.unsubscribeNotes,
            this.unsubscribeShiftPresets,
            this.unsubscribeSettings,
            this.unsubscribeAttendance,
            this.unsubscribeVacationRecords
        ].forEach((unsubscribe) => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });

        this.unsubscribe = null;
        this.unsubscribeNotes = null;
        this.unsubscribeShiftPresets = null;
        this.unsubscribeSettings = null;
        this.unsubscribeAttendance = null;
        this.unsubscribeVacationRecords = null;
    }

    getCurrentUserContext() {
        return this.currentUserContext;
    }

    getCurrentUserRoles() {
        return this.currentUserContext.roles || [];
    }

    getCurrentUserAllowedApps() {
        return this.currentUserContext.allowedApps;
    }

    getEmployeeLoadError() {
        return this.employeeLoadError;
    }

    hasLoadedEmployeeDirectory() {
        return this.hasLoadedEmployees;
    }

    hasPrivilegedRole() {
        return hasPrivilegedRole(this.getCurrentUserRoles());
    }

    isTimeClockStationUser() {
        return hasTimeClockStationRole(this.getCurrentUserRoles());
    }

    getCurrentUserEmployee() {
        const linkedEmployeeId = this.currentUserContext.linkedEmployee?.id;
        if (linkedEmployeeId) {
            const matchedActiveEmployee = this.activeEmployees.find((employee) => employee?.id === linkedEmployeeId);
            if (matchedActiveEmployee) {
                return matchedActiveEmployee;
            }

            const matchedArchivedEmployee = this.archivedEmployees.find((employee) => employee?.id === linkedEmployeeId);
            if (matchedArchivedEmployee) {
                return null;
            }
        }

        const currentEmail = this.currentUserContext.emailCanonical;
        if (currentEmail) {
            const matchedActiveEmployee = this.activeEmployees.find((employee) => {
                return canonicalizeEmail(employee?.email) === currentEmail;
            });
            if (matchedActiveEmployee) {
                return matchedActiveEmployee;
            }

            const matchedArchivedEmployee = this.archivedEmployees.find((employee) => {
                return canonicalizeEmail(employee?.email) === currentEmail;
            });
            if (matchedArchivedEmployee) {
                return null;
            }
        }

        const linkedEmployee = this.currentUserContext.linkedEmployee;
        if (linkedEmployee?.id && !linkedEmployee.isArchived) {
            return {
                id: linkedEmployee.id,
                name: linkedEmployee.name || 'Linked colleague',
                email: linkedEmployee.email || this.currentUserContext.email,
                isLinkedFallback: true
            };
        }

        return null;
    }

    isClockOnlyUser() {
        return isSelfServiceEmployeeUser(this.getCurrentUserRoles(), {
            hasEmployeeLink: Boolean(this.getCurrentUserEmployee())
        });
    }

    hasAnyGrantedAppAccess() {
        if (this.isTimeClockStationUser()) {
            return false;
        }

        if (this.hasPrivilegedRole()) {
            return true;
        }

        const allowedApps = this.getCurrentUserAllowedApps();
        if (Array.isArray(allowedApps)) {
            return allowedApps.length > 0;
        }

        return !this.isClockOnlyUser();
    }

    canAccessApp(appKey = '') {
        if (!appKey || this.isTimeClockStationUser()) {
            return false;
        }

        if (this.hasPrivilegedRole()) {
            return true;
        }

        const allowedApps = this.getCurrentUserAllowedApps();
        if (Array.isArray(allowedApps)) {
            return allowedApps.includes(appKey);
        }

        return !this.isClockOnlyUser();
    }

    canAccessWorkSchedule() {
        return canAccessSelfServiceSchedule(this.getCurrentUserRoles(), {
            hasEmployeeLink: Boolean(this.getCurrentUserEmployee())
        });
    }

    isScheduleOnlyUser() {
        return this.isClockOnlyUser();
    }

    getAllowedScheduleViews() {
        return this.isScheduleOnlyUser()
            ? [...SELF_SERVICE_SCHEDULE_VIEWS]
            : [];
    }

    canAccessVacationBoard() {
        return canAccessSharedVacationBoard(this.getCurrentUserRoles(), {
            hasEmployeeLink: Boolean(this.getCurrentUserEmployee())
        });
    }

    isVacationBoardOnlyUser() {
        return isSharedVacationBoardOnlyUser(this.getCurrentUserRoles(), {
            hasEmployeeLink: Boolean(this.getCurrentUserEmployee())
        });
    }

    getAttendanceDocId(employeeId, dateKey) {
        return `${employeeId}_${dateKey}`;
    }

    getAttendanceRecord(employeeId, date) {
        if (!employeeId || !date) {
            return null;
        }

        const dateKey = typeof date === 'string' ? date : this.getDateKey(date);
        return this.attendanceRecords[this.getAttendanceDocId(employeeId, dateKey)] || null;
    }

    getAttendanceRecordsForEmployee(employeeId) {
        if (!employeeId) {
            return [];
        }

        return Object.values(this.attendanceRecords)
            .filter((record) => record.employeeId === employeeId)
            .sort((left, right) => left.dateKey.localeCompare(right.dateKey));
    }

    getAttendanceRecordsForEmployeeWeek(employeeId, startDate) {
        const monday = new Date(startDate);
        monday.setHours(0, 0, 0, 0);

        return Array.from({ length: 7 }, (_, offset) => {
            const current = new Date(monday);
            current.setDate(monday.getDate() + offset);
            return this.getAttendanceRecord(employeeId, current);
        });
    }

    getAttendanceSummary(employeeId, date, { referenceDateTime = null } = {}) {
        return summarizeAttendanceRecord(this.getAttendanceRecord(employeeId, date), { referenceDateTime });
    }

    getCurrentUserAttendanceSummary(date = new Date(), { referenceDateTime = null } = {}) {
        const employee = this.getCurrentUserEmployee();
        if (!employee) {
            return null;
        }

        return this.getAttendanceSummary(employee.id, date, { referenceDateTime });
    }

    getCurrentUserWeekAttendanceSummary(startDate, { referenceDateTime = null } = {}) {
        const employee = this.getCurrentUserEmployee();
        if (!employee) {
            return null;
        }

        return this.getEmployeeWeekAttendanceSummary(employee.id, startDate, { referenceDateTime });
    }

    getEmployeeWeekAttendanceSummary(employeeId, startDate, { referenceDateTime = null } = {}) {
        const records = this.getAttendanceRecordsForEmployeeWeek(employeeId, startDate);
        return getWeeklyAttendanceSummary(records, { referenceDateTime });
    }

    getAttendanceReviewQueue({ referenceDateTime = null } = {}) {
        return getAttendanceReviewQueue(Object.values(this.attendanceRecords), { referenceDateTime });
    }

    resolveAttendanceEmployee(employeeId) {
        if (!employeeId) {
            return null;
        }

        const matchedEmployee = this.activeEmployees.find((entry) => entry.id === employeeId)
            || this.archivedEmployees.find((entry) => entry.id === employeeId);

        if (matchedEmployee) {
            return matchedEmployee;
        }

        const linkedEmployee = this.currentUserContext.linkedEmployee;
        if (linkedEmployee?.id === employeeId && !linkedEmployee.isArchived) {
            return {
                id: linkedEmployee.id,
                name: linkedEmployee.name || '',
                email: linkedEmployee.email || this.currentUserContext.email
            };
        }

        return null;
    }

    async saveAttendanceEvent(employeeId, eventInput) {
        const employee = this.resolveAttendanceEmployee(employeeId);

        if (!employee) {
            throw new Error(t('timeClock.errors.employeeNotFound'));
        }

        const dateKey = eventInput.dateKey || eventInput.occurredAt.slice(0, 10);
        const docRef = doc(this.db, "attendance_records", this.getAttendanceDocId(employeeId, dateKey));

        await runTransaction(this.db, async (transaction) => {
            const recordSnapshot = await transaction.get(docRef);
            const baseRecord = recordSnapshot.exists()
                ? { id: recordSnapshot.id, ...recordSnapshot.data() }
                : createAttendanceRecord({
                    employeeId,
                    employeeName: employee.name || '',
                    dateKey
                });

            const nextRecord = appendAttendanceEvent(baseRecord, {
                ...eventInput,
                employeeId,
                employeeName: employee.name || ''
            });

            transaction.set(docRef, nextRecord);
        });
    }

    async recordAttendanceForEmployee(employeeId, eventType, { source = 'web', occurredAt = formatLocalDateTime() } = {}) {
        const employee = this.resolveAttendanceEmployee(employeeId);
        if (!employee) {
            throw new Error(t('timeClock.errors.employeeNotFound'));
        }

        const dateKey = occurredAt.slice(0, 10);
        const currentRecord = this.getAttendanceRecord(employee.id, dateKey);
        const actionState = getAttendanceActionState(currentRecord);
        const allowedActions = [actionState.primaryAction, actionState.secondaryAction].filter(Boolean);

        if (!allowedActions.includes(eventType)) {
            throw new Error(t('timeClock.errors.actionUnavailable'));
        }

        await this.saveAttendanceEvent(employee.id, {
            type: eventType,
            occurredAt,
            dateKey,
            source,
            actorUid: this.currentUserContext.uid,
            actorEmail: this.currentUserContext.email
        });
    }

    async recordCurrentUserAttendance(eventType) {
        const employee = this.getCurrentUserEmployee();
        if (!employee) {
            throw new Error(t('timeClock.errors.loginNotLinked', {
                email: this.currentUserContext.email || 'unknown'
            }));
        }

        await this.recordAttendanceForEmployee(employee.id, eventType, { source: 'web' });
    }

    async addManualAttendanceEvent(employeeId, dateKey, eventType, localTime, note = '') {
        if (!employeeId || !dateKey || !eventType || !localTime) {
            throw new Error(t('timeClock.errors.manualFieldsRequired'));
        }

        if (!this.currentUserContext.uid && !this.currentUserContext.email) {
            throw new Error(t('timeClock.feedback.manualActorRequired'));
        }

        const normalizedNote = normalizeManualAttendanceNote(note);
        if (!normalizedNote) {
            throw new Error(t('timeClock.feedback.manualReasonRequired'));
        }

        await this.saveAttendanceEvent(employeeId, {
            type: eventType,
            occurredAt: `${dateKey}T${localTime.length === 5 ? `${localTime}:00` : localTime}`,
            dateKey,
            source: 'manual',
            actorUid: this.currentUserContext.uid,
            actorEmail: this.currentUserContext.email,
            note: normalizedNote
        });
    }

    async setAttendanceRecordReview(employeeId, dateKey, { status = null, note = null } = {}) {
        const employee = this.activeEmployees.find((entry) => entry.id === employeeId)
            || this.archivedEmployees.find((entry) => entry.id === employeeId);

        if (!employee) {
            throw new Error(t('timeClock.errors.reviewEmployeeNotFound'));
        }

        const docRef = doc(this.db, "attendance_records", this.getAttendanceDocId(employeeId, dateKey));

        await runTransaction(this.db, async (transaction) => {
            const recordSnapshot = await transaction.get(docRef);
            const baseRecord = recordSnapshot.exists()
                ? { id: recordSnapshot.id, ...recordSnapshot.data() }
                : createAttendanceRecord({
                    employeeId,
                    employeeName: employee.name || '',
                    dateKey
                });

            const nextRecord = setAttendanceReview(baseRecord, {
                status,
                note,
                reviewedBy: this.currentUserContext.email,
                reviewedAt: new Date().toISOString()
            });

            transaction.set(docRef, nextRecord);
        });
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

    getVacationRecords() {
        return [...this.vacationRecords];
    }

    getSharedVacationEntries({ includeArchived = false } = {}) {
        const employees = includeArchived
            ? [...this.activeEmployees, ...this.archivedEmployees]
            : [...this.activeEmployees];

        const collectionEntries = buildSharedVacationEntries(this.vacationRecords, employees);
        const fallbackEntries = employees.flatMap((employee) => {
            return (employee.vacations || []).map((vacation) => {
                const employeeVacation = toEmployeeVacationEntry(vacation, employee.id);
                if (!employeeVacation) {
                    return null;
                }

                return {
                    id: employeeVacation.id,
                    employeeId: employee.id,
                    employeeName: employee.name || '',
                    employeeDepartment: employee.department || null,
                    startDate: employeeVacation.startDate,
                    endDate: employeeVacation.endDate,
                    status: employeeVacation.status,
                    note: employeeVacation.note,
                    visibility: employeeVacation.visibility
                };
            });
        }).filter(Boolean);

        const mergedEntries = new Map();
        fallbackEntries.forEach((entry) => {
            mergedEntries.set(entry.id || `${entry.employeeId}__${entry.startDate}__${entry.endDate}`, entry);
        });
        collectionEntries.forEach((entry) => {
            mergedEntries.set(entry.id || `${entry.employeeId}__${entry.startDate}__${entry.endDate}`, entry);
        });

        return [...mergedEntries.values()].sort((left, right) => {
            const startComparison = left.startDate.localeCompare(right.startDate);
            if (startComparison !== 0) {
                return startComparison;
            }

            const endComparison = left.endDate.localeCompare(right.endDate);
            if (endComparison !== 0) {
                return endComparison;
            }

            return (left.employeeName || '').localeCompare(right.employeeName || '');
        });
    }

    getVacationRecordById(recordId, { includeArchived = true } = {}) {
        if (typeof recordId !== 'string' || !recordId.trim()) {
            return null;
        }

        return this.getSharedVacationEntries({ includeArchived }).find((record) => record.id === recordId.trim()) || null;
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

    async logWelcomePackBatch(logs) {
        const normalizedLogs = Array.isArray(logs) ? logs.filter(Boolean) : [];
        if (!normalizedLogs.length) {
            return;
        }

        await runTransaction(this.db, async (transaction) => {
            const stockAdjustments = new Map();

            normalizedLogs.forEach((log) => {
                const newLogRef = doc(collection(this.db, "welcome_pack_logs"));
                transaction.set(newLogRef, log);

                (Array.isArray(log.items) ? log.items : []).forEach((item) => {
                    if (!item?.id) {
                        return;
                    }

                    const qty = item.quantity || 1;
                    stockAdjustments.set(item.id, (stockAdjustments.get(item.id) || 0) - qty);
                });
            });

            stockAdjustments.forEach((quantityDelta, itemId) => {
                const itemRef = doc(this.db, "welcome_pack_items", itemId);
                transaction.update(itemRef, { quantity: increment(quantityDelta) });
            });
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
