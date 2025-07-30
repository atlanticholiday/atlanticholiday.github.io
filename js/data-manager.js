import { collection, doc, addDoc, onSnapshot, deleteDoc, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Config } from './config.js';

export class DataManager {
    constructor(db, userId = null) {
        this.db = db;
        this.userId = userId;
        this.activeEmployees = [];
        this.archivedEmployees = [];
        this.holidays = {};
        this.currentDate = new Date();
        this.lastMonthlyDate = new Date();
        this.selectedDateKey = null;
        this.currentView = 'monthly';
        this.unsubscribe = null;
        this.onDataChangeCallback = null;
        
        // Initialize holidays for current year immediately
        this.initializeHolidays();
    }

    setUserId(userId) {
        this.userId = userId;
    }

    initializeHolidays() {
        const currentYear = new Date().getFullYear();
        
        // Initialize holidays for current year and adjacent years
        this.holidays[currentYear - 1] = this.getHolidays(currentYear - 1);
        this.holidays[currentYear] = this.getHolidays(currentYear);
        this.holidays[currentYear + 1] = this.getHolidays(currentYear + 1);
    }

    getEmployeesCollectionRef() {
        return collection(this.db, "employees");
    }

    setOnDataChangeCallback(callback) {
        this.onDataChangeCallback = callback;
    }

    listenForEmployeeChanges() {
        this.unsubscribe = onSnapshot(this.getEmployeesCollectionRef(), (snapshot) => {
            const allEmployees = snapshot.docs
                .filter(doc => doc.id !== 'metadata')
                .map(doc => ({ id: doc.id, ...doc.data() }));
            
            if (allEmployees.length === 0 && snapshot.docs.length <= 1) { 
                // Dispatch event instead of directly showing setup screen
                const event = new CustomEvent('noEmployeesFound');
                document.dispatchEvent(event);
                return;
            }

            this.activeEmployees = allEmployees.filter(emp => !emp.isArchived);
            this.archivedEmployees = allEmployees.filter(emp => emp.isArchived);

            this.activeEmployees.sort((a, b) => (a.displayOrder ?? Infinity) - (b.displayOrder ?? Infinity));
            this.archivedEmployees.sort((a, b) => a.name.localeCompare(b.name));
            
            const year = this.currentDate.getFullYear();
            if (!this.holidays[year]) this.holidays[year] = this.getHolidays(year);
            if (!this.holidays[year+1]) this.holidays[year+1] = this.getHolidays(year+1);
            if (!this.holidays[year-1]) this.holidays[year-1] = this.getHolidays(year-1);

            if (this.onDataChangeCallback) {
                this.onDataChangeCallback();
            }
        }, (error) => console.error("Error listening:", error));
    }

    // Removed showSetupScreen - navigation is now handled by NavigationManager

    async addEmployee(name, staffNumber, workDays) {
        const newEmployeeData = { 
            name, 
            staffNumber: staffNumber || null,
            workDays, 
            displayOrder: this.activeEmployees.length,
            isArchived: false,
            shifts: { default: '9:00-18:00' },
            overrides: {}, 
            extraHours: {}, 
            extraHoursNotes: {}, 
            vacations: [],
            // Additional fields for employee information
            email: null,
            phone: null,
            department: null,
            position: null,
            hireDate: null,
            employmentType: null,
            notes: null
        };
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
    
    async saveNewOrder() {
        const reorderedIds = [...document.querySelectorAll('#reorder-list-container .draggable')].map(el => el.dataset.employeeId);
        const updates = reorderedIds.map((id, index) => {
            const docRef = doc(this.db, "employees", id);
            return updateDoc(docRef, { displayOrder: index });
        });
        await Promise.all(updates).catch(e => console.error("Failed to save new order", e));
    }

    async handleArchiveToggle(employeeId, shouldArchive) {
        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { isArchived: shouldArchive }).catch(e => console.error("Archive update failed", e));
    }

    async handlePermanentDelete(employeeId) {
        const docRef = doc(this.db, "employees", employeeId);
        await deleteDoc(docRef).catch(e => console.error("Permanent delete failed:", e));
    }

    async handleUpdateWorkingDays(employeeId, newWorkDays) {
        const docRef = doc(this.db, "employees", employeeId);
        await updateDoc(docRef, { workDays: newWorkDays }).catch(e => console.error("Working days update failed:", e));
    }

    async updateEmployee(employeeId, updatedData) {
        const docRef = doc(this.db, "employees", employeeId);
        
        // Validate required fields
        if (!updatedData.name || updatedData.name.trim() === '') {
            throw new Error('Name is required');
        }
        
        // Clean up the data - remove empty strings and set appropriate defaults
        const cleanData = {};
        
        // Required fields
        cleanData.name = updatedData.name.trim();
        cleanData.workDays = updatedData.workDays || [];
        
        // Optional fields - only include if they have values
        if (updatedData.staffNumber && updatedData.staffNumber.trim() !== '') {
            cleanData.staffNumber = parseInt(updatedData.staffNumber.trim()) || null;
        }
        if (updatedData.email && updatedData.email.trim() !== '') {
            cleanData.email = updatedData.email.trim();
        }
        if (updatedData.phone && updatedData.phone.trim() !== '') {
            cleanData.phone = updatedData.phone.trim();
        }
        if (updatedData.department && updatedData.department.trim() !== '') {
            cleanData.department = updatedData.department.trim();
        }
        if (updatedData.position && updatedData.position.trim() !== '') {
            cleanData.position = updatedData.position.trim();
        }
        if (updatedData.hireDate && updatedData.hireDate.trim() !== '') {
            cleanData.hireDate = updatedData.hireDate.trim();
        }
        if (updatedData.employmentType && updatedData.employmentType.trim() !== '') {
            cleanData.employmentType = updatedData.employmentType.trim();
        }
        if (updatedData.notes && updatedData.notes.trim() !== '') {
            cleanData.notes = updatedData.notes.trim();
        }
        
        // Handle shifts object
        if (updatedData.defaultShift && updatedData.defaultShift.trim() !== '') {
            cleanData.shifts = { default: updatedData.defaultShift.trim() };
        }
        
        await updateDoc(docRef, cleanData).catch(e => {
            console.error("Employee update failed:", e);
            throw e;
        });
    }

    async initializeDatabase() {
        await setDoc(doc(this.db, "employees", 'metadata'), { initialized: true });
        this.listenForEmployeeChanges();
    }

    getHolidays(year) {
        function getEaster(year) {
            const f = Math.floor, G = year % 19, C = f(year / 100), H = (C - f(C / 4) - f((8 * C + 13) / 25) + 19 * G + 15) % 30, I = H - f(H / 28) * (1 - f(29 / (H + 1)) * f((21 - G) / 11)), J = (year + f(year / 4) + I + 2 - C + f(C / 4)) % 7, L = I - J, month = 3 + f((L + 40) / 44), day = L + 28 - 31 * f(month / 4);
            return new Date(year, month - 1, day);
        }

        const easter = getEaster(year);
        const holidays = [
            { m: 1, d: 1, name: "New Year's Day" },
            { m: 1, d: 6, name: "Epiphany" },
            { date: new Date(easter.getTime() - 2 * 86400000), name: "Good Friday" },
            { date: easter, name: "Easter Sunday" },
            { m: 4, d: 2, name: "Madeira's Autonomy Day" },
            { m: 4, d: 25, name: "Freedom Day" },
            { m: 5, d: 1, name: "Labour Day" },
            { m: 6, d: 10, name: "Portugal Day" },
            { m: 7, d: 1, name: "Madeira Day" },
            { m: 8, d: 15, name: "Assumption of Mary" },
            { m: 8, d: 21, name: "Funchal Day" },
            { m: 10, d: 5, name: "Republic Day" },
            { m: 11, d: 1, name: "All Saints' Day" },
            { m: 12, d: 1, name: "Restoration of Independence" },
            { m: 12, d: 8, name: "Immaculate Conception" },
            { m: 12, d: 25, name: "Christmas Day" },
            { m: 12, d: 26, name: "Boxing Day" }
        ];

        const holidayMap = {};
        holidays.forEach(h => {
            const date = h.date || new Date(year, h.m - 1, h.d);
            const key = this.getDateKey(date);
            holidayMap[key] = h.name;
        });
        
        return holidayMap;
    }

    getDateKey(date) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return key;
    }

    isDateInVacation(date, vacations) {
        if (!vacations || vacations.length === 0) return false;
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()); 
        for (const vac of vacations) {
            const startDate = new Date(vac.startDate);
            const endDate = new Date(vac.endDate);
            if (checkDate >= startDate && checkDate <= endDate) return true;
        }
        return false;
    }

    getEmployeeStatusForDate(employee, date) {
        const dateKey = this.getDateKey(date);
        const currentYearHolidays = this.holidays[date.getFullYear()] || {};
        const isHoliday = currentYearHolidays[dateKey];

        if (this.isDateInVacation(date, employee.vacations)) return 'On Vacation';
        if (employee.overrides && employee.overrides[dateKey]) return employee.overrides[dateKey];
        
        // On holidays, default to 'Off' unless overridden
        if (isHoliday) return 'Off';
        
        return employee.workDays.includes(date.getDay()) ? 'Working' : 'Scheduled Off';
    }

    // Getters for UI access
    getActiveEmployees() { return this.activeEmployees; }
    getArchivedEmployees() { return this.archivedEmployees; }
    getAllHolidays() { return this.holidays; }
    getCurrentDate() { return this.currentDate; }
    getCurrentView() { return this.currentView; }
    getSelectedDateKey() { return this.selectedDateKey; }

    ensureHolidaysForYear(year) {
        if (!this.holidays[year]) {
            this.holidays[year] = this.getHolidays(year);
        }
    }

    // Setters for UI updates
    setCurrentDate(date) { this.currentDate = date; }
    setCurrentView(view) { this.currentView = view; }
    setSelectedDateKey(key) { this.selectedDateKey = key; }
} 