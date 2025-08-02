// Add Firestore imports
import { collection, addDoc, onSnapshot, updateDoc, doc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class ReservationsManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.subscribedData = [];       // persisted Firestore data
        this.loadedRecords = [];        // records loaded from XLSX file
        this.unsubscribe = null;
        this.currentDatasetName = '';
        // Restore backup from localStorage if exists
        try {
            const backup = localStorage.getItem('reservations_backup');
            if (backup) {
                const parsed = JSON.parse(backup);
                this.currentDatasetName = parsed.name || '';
                this.loadedRecords = parsed.records || [];
                console.log('[ReservationsManager] Loaded backup from localStorage', this.currentDatasetName, this.loadedRecords.length);
            }
        } catch (e) {
            console.warn('[ReservationsManager] Failed to parse local backup', e);
        }
    }
    // Compute ISO week string (YYYY-Www) from date string
    getWeekNumber(dateStr) {
        // Return null for empty or invalid date strings
        if (!dateStr) return null;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = target.getUTCDay() || 7;
        target.setUTCDate(target.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
        return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2,'0')}`;
    }
    // Populate week select options based on both persisted and loaded data
    renderWeekOptions() {
        console.log("[ReservationsManager] renderWeekOptions called");
        const select = document.getElementById('reservations-week-select');
        if (!select) return;
        // If records just loaded from the current upload, show dataset name only
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            select.innerHTML = '';
            const opt = document.createElement('option');
            opt.value = this.currentDatasetName;
            opt.textContent = this.currentDatasetName;
            select.appendChild(opt);
            return;
        }
        // Initialize with a disabled placeholder; actual weeks populated after user selection
        select.innerHTML = '<option value="" disabled selected>Select a Week</option>';
        const allWeeks = [];
        this.subscribedData.forEach(r => { if (r._week) allWeeks.push(r._week); });
        this.loadedRecords.forEach(r => { if (r._week) allWeeks.push(r._week); });
        const weeks = [...new Set(allWeeks)].sort();
        console.log("[ReservationsManager] Available weeks:", weeks);
        weeks.forEach(w => {
            const opt = document.createElement('option'); opt.value = w; opt.textContent = w;
            select.appendChild(opt);
        });
    }
    // Listen for saved reservations in Firestore
    subscribeToReservations() {
        const colRef = collection(this.db, 'reservations');
        const q = query(colRef, where('userId', '==', this.userId));
        // Initial fetch fallback to retrieve persisted data via HTTP
        getDocs(q).then(snapshot => {
            this.subscribedData = snapshot.docs.map(d => {
                const rec = { id: d.id, ...d.data() };
                // Determine date string for week auto-detection
                let weekDateStr = rec['Check-in'] || rec['check-in'] || rec.checkIn || '';
                if (!weekDateStr) {
                    for (const [key, value] of Object.entries(rec)) {
                        const dVal = new Date(value);
                        if (value && !isNaN(dVal.getTime())) {
                            weekDateStr = value;
                            console.log('[ReservationsManager] Auto-detected date field from column', key, 'value', value);
                            break;
                        }
                    }
                }
                rec._week = this.getWeekNumber(weekDateStr);
                return rec;
            });
            this.renderWeekOptions();
            this.renderTable();
        }).catch(error => console.error('Error fetching reservations via getDocs:', error));
        this.unsubscribe = onSnapshot(q, snapshot => {
            this.subscribedData = snapshot.docs.map(d => {
                const rec = { id: d.id, ...d.data() };
                // Determine date string for week auto-detection
                let weekDateStr = rec['Check-in'] || rec['check-in'] || rec.checkIn || '';
                if (!weekDateStr) {
                    for (const [key, value] of Object.entries(rec)) {
                        const dVal = new Date(value);
                        if (value && !isNaN(dVal.getTime())) {
                            weekDateStr = value;
                            console.log('[ReservationsManager] Auto-detected date field from column', key, 'value', value);
                            break;
                        }
                    }
                }
                rec._week = this.getWeekNumber(weekDateStr);
                return rec;
            });
            this.renderWeekOptions();
            this.renderTable();
        }, error => console.error('Reservations listener error:', error));
    }

    // Read binary file as ArrayBuffer for XLSX parsing
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // Load and parse only XLSX files, storing to loadedRecords
    async handleFileUpload(file) {
        console.log("[ReservationsManager] handleFileUpload called with file:", file && file.name);
        const arrayBuffer = await this.readFileAsArrayBuffer(file);
        console.log("[ReservationsManager] ArrayBuffer loaded, size:", arrayBuffer.byteLength);
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        console.log("[ReservationsManager] Workbook sheets:", workbook.SheetNames);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        console.log("[ReservationsManager] Parsed records count:", records.length);
        // Compute week and store in loadedRecords
        this.loadedRecords = records.map(rec => {
            // Determine date string for week auto-detection
            let weekDateStr = rec['Check-in'] || rec.checkIn || rec['check-in'] || '';
            if (!weekDateStr) {
                for (const [key, value] of Object.entries(rec)) {
                    const dVal = new Date(value);
                    if (value && !isNaN(dVal.getTime())) {
                        weekDateStr = value;
                        console.log('[ReservationsManager] Auto-detected date field from column', key, 'value', value);
                        break;
                    }
                }
            }
            rec._week = this.getWeekNumber(weekDateStr);
            return rec;
        });
        // Save backup to localStorage to persist across reload
        try {
            localStorage.setItem('reservations_backup', JSON.stringify({ name: this.currentDatasetName, records: this.loadedRecords }));
            console.log('[ReservationsManager] Saved backup to localStorage');
        } catch (e) {
            console.warn('[ReservationsManager] Failed to save backup to localStorage', e);
        }
        this.renderWeekOptions();
        // Automatically select the first available week to show a preview immediately
        const select = document.getElementById('reservations-week-select');
        if (select && select.options.length > 1) {
            select.value = select.options[1].value;
        }
        this.renderTable();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('reservations-file-input');
        const uploadBtn = document.getElementById('load-reservations-btn');
        uploadBtn.addEventListener('click', () => {
            console.log("[ReservationsManager] Upload button clicked");
            const name = prompt('Enter a name for this import batch:');
            console.log("[ReservationsManager] Dataset name entered:", name);
            if (!name) {
                console.log("[ReservationsManager] Dataset name missing, aborting upload");
                alert('Dataset name is required before uploading.');
                return;
            }
            this.currentDatasetName = name;
            fileInput.click();
        });
        fileInput.addEventListener('change', async () => {
            console.log("[ReservationsManager] File input change event triggered");
            const file = fileInput.files[0];
            console.log("[ReservationsManager] Selected file:", file && file.name);
            if (!file || !file.name.match(/\.xls[x]?$/i)) {
                console.log("[ReservationsManager] Invalid file or extension", file && file.name);
                alert('Please select a valid Excel (.xlsx or .xls) file.');
                return;
            }
            try {
                await this.handleFileUpload(file);
                // Attempt to auto-save to Firestore
                console.log(`[ReservationsManager] Auto-saving ${this.loadedRecords.length} uploaded records`);
                const savedRecords = [];
                for (const rec of this.loadedRecords) {
                    try {
                        const docRef = await addDoc(collection(this.db, 'reservations'), { userId: this.userId, ...rec });
                        rec.id = docRef.id;
                        this.subscribedData.push(rec);
                        savedRecords.push(rec);
                    } catch (e) {
                        console.warn('[ReservationsManager] Firestore write failed for record, keeping in local backup', e);
                    }
                }
                console.log(`[ReservationsManager] Auto-saved ${savedRecords.length} records to Firestore`);
                // Remove savedRecords from backup
                const remaining = this.loadedRecords.filter(r => !savedRecords.includes(r));
                this.loadedRecords = remaining;
                if (savedRecords.length === this.loadedRecords.length + savedRecords.length) {
                    // All records saved, clear backup
                    localStorage.removeItem('reservations_backup');
                    console.log('[ReservationsManager] Cleared localStorage backup after successful save');
                } else {
                    // Some records remain, update backup
                    localStorage.setItem('reservations_backup', JSON.stringify({ name: this.currentDatasetName, records: this.loadedRecords }));
                    console.log('[ReservationsManager] Updated localStorage backup with remaining records');
                }
                // Ensure subscription to Firestore persisted data
                if (!this.unsubscribe) {
                    this.subscribeToReservations();
                }
                // Re-render with persisted and local data
                this.renderWeekOptions();
                this.renderTable();
            } catch (error) {
                console.log("[ReservationsManager] Error in handleFileUpload or auto-save:", error);
                console.error('File upload error:', error);
                alert('Failed to load reservations: ' + (error.message || error));
            }
        });
        // Allow editing the dataset name
        const editNameBtn = document.getElementById('edit-dataset-name-btn');
        if (editNameBtn) {
            editNameBtn.addEventListener('click', () => {
                const newName = prompt('Edit dataset name:', this.currentDatasetName);
                if (newName) {
                    this.currentDatasetName = newName;
                    const dsDisplay = document.getElementById('dataset-name-display');
                    if (dsDisplay) dsDisplay.textContent = newName;
                }
            });
        }
        // If backup loadedRecords exist (e.g., after refresh), render them immediately
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            console.log('[ReservationsManager] Rendering backup records on page init');
            const dsDisplay = document.getElementById('dataset-name-display');
            if (dsDisplay) dsDisplay.textContent = this.currentDatasetName;
            this.renderWeekOptions();
            this.renderTable();
        }
        const saveBtn = document.getElementById('save-reservations-week-btn');
        saveBtn.addEventListener('click', async () => {
            const sel = document.getElementById('reservations-week-select');
            const weekVal = sel ? sel.value : 'all';
            const toSave = this.loadedRecords.filter(r => weekVal === 'all' || r._week === weekVal);
            if (toSave.length === 0) {
                alert('No records to save for selected week.');
                return;
            }
            try {
                for (const rec of toSave) {
                    const docRef = await addDoc(collection(this.db, 'reservations'), { userId: this.userId, ...rec });
                    rec.id = docRef.id;
                    this.subscribedData.push(rec);
                }
                alert(`Saved ${toSave.length} reservations.`);
                this.loadedRecords = [];
                this.renderWeekOptions();
                this.renderTable();
            } catch (e) {
                console.error('Error saving reservations:', e);
                alert('Error saving reservations: ' + (e.message || e));
            }
        });
        const weekSelect = document.getElementById('reservations-week-select');
        if (weekSelect) {
            weekSelect.addEventListener('change', () => {
                // On first valid week selection, start listening for persisted reservations
                if (!this.unsubscribe) {
                    this.subscribeToReservations();
                }
                this.renderTable();
            });
        }
        // Subscription delayed until after user selects a week
    }

    renderTable() {
        console.log("[ReservationsManager] renderTable called");
        const container = document.getElementById('reservations-table');
        container.innerHTML = '';
        const sel = document.getElementById('reservations-week-select');
        const weekVal = sel ? sel.value : '';
        console.log("[ReservationsManager] Selected week value:", weekVal);
        let rows;
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            // Display all loaded records for the selected dataset
            rows = this.loadedRecords;
            console.log("[ReservationsManager] Displaying loadedRecords rows count:", rows.length);
            if (rows.length === 0) {
                container.innerHTML = '<p>No preview data for selected dataset.</p>';
                return;
            }
        } else {
            rows = this.subscribedData.filter(r => weekVal === 'all' || r._week === weekVal);
            console.log("[ReservationsManager] Using subscribedData rows count:", rows.length);
            if (rows.length === 0) {
                container.innerHTML = '<p>No reservations to display.</p>';
                return;
            }
        }
        const table = document.createElement('table');
        table.className = 'min-w-full bg-white';
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        // Use keys from first row
        Object.keys(rows[0]).filter(k => k !== '_week').forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            th.className = 'px-4 py-2 text-left text-sm font-medium text-gray-600 uppercase tracking-wider';
            headerRow.appendChild(th);
        });
        const tbody = table.createTBody();
        rows.forEach(record => {
            const row = tbody.insertRow();
            Object.entries(record).forEach(([key, value]) => {
                if (key === '_week') return;
                const td = row.insertCell();
                const inp = document.createElement('input');
                inp.value = value;
                inp.className = 'px-2 py-1 border rounded text-sm w-full';
                inp.addEventListener('change', () => {
                    if (record.id) this.updateReservationField(record.id, key, inp.value);
                });
                td.appendChild(inp);
            });
        });
        container.appendChild(table);
    }

    // Update a field in Firestore
    async updateReservationField(id, field, value) {
        const ref = doc(this.db, 'reservations', id);
        await updateDoc(ref, { [field]: value });
    }
} 