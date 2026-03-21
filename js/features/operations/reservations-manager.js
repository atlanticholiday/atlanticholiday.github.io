// Add Firestore imports
import { collection, addDoc, onSnapshot, updateDoc, doc, query, where, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class ReservationsManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.subscribedData = [];       // persisted Firestore data
        this.loadedRecords = [];        // records loaded from XLSX file
        this.unsubscribe = null;
        this.currentDatasetName = '';
        this.changeHistory = [];        // Track changes for history tab
        this.autoSaveTimeout = null;    // Debounce auto-save
        this.currentSearchTerm = '';    // Search functionality
        this.currentSortColumn = null;  // Sorting functionality
        this.currentSortDirection = 'asc';
        
        // Restore backup from localStorage if exists
        try {
            const backup = localStorage.getItem('reservations_backup');
            if (backup) {
                const parsed = JSON.parse(backup);
                this.currentDatasetName = parsed.name || '';
                this.loadedRecords = parsed.records || [];
                this.changeHistory = parsed.changeHistory || [];
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
        // Restore UI from local backup if records exist
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            console.log('[ReservationsManager] Restoring UI from localStorage backup');
            // Update dataset name display
            const dsDisplay = document.getElementById('dataset-name-display');
            if (dsDisplay) dsDisplay.textContent = this.currentDatasetName;
            // Render selector and table for backup data
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

    // Auto-save with debounce
    scheduleAutoSave(recordId, field, value, oldValue) {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Track change in history
        this.addToChangeHistory(recordId, field, oldValue, value);
        
        this.autoSaveTimeout = setTimeout(async () => {
            try {
                if (recordId) {
                    await this.updateReservationField(recordId, field, value);
                    this.showSaveStatus('Auto-saved', 'success');
                }
            } catch (error) {
                console.error('Auto-save failed:', error);
                this.showSaveStatus('Auto-save failed', 'error');
            }
        }, 1000); // 1 second debounce
    }

    // Add change to history
    addToChangeHistory(recordId, field, oldValue, newValue) {
        if (oldValue === newValue) return;
        
        const change = {
            id: Date.now() + Math.random(),
            recordId,
            field,
            oldValue,
            newValue,
            timestamp: new Date().toISOString(),
            user: this.userId
        };
        
        this.changeHistory.unshift(change);
        
        // Keep only last 100 changes
        if (this.changeHistory.length > 100) {
            this.changeHistory = this.changeHistory.slice(0, 100);
        }
        
        // Update backup
        this.updateBackup();
        
        // Update history tab if visible
        if (document.querySelector('.history-tab.active')) {
            this.renderHistoryTab();
        }
    }

    // Show save status
    showSaveStatus(message, type = 'success') {
        let statusEl = document.getElementById('save-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'save-status';
            statusEl.className = 'fixed top-4 right-4 px-4 py-2 rounded-lg z-50 transition-all duration-300';
            document.body.appendChild(statusEl);
        }
        
        statusEl.textContent = message;
        statusEl.className = `fixed top-4 right-4 px-4 py-2 rounded-lg z-50 transition-all duration-300 ${
            type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`;
        
        setTimeout(() => {
            statusEl.style.opacity = '0';
            setTimeout(() => statusEl.remove(), 300);
        }, 2000);
    }

    // Update backup with change history
    updateBackup() {
        try {
            localStorage.setItem('reservations_backup', JSON.stringify({
                name: this.currentDatasetName,
                records: this.loadedRecords,
                changeHistory: this.changeHistory
            }));
        } catch (e) {
            console.warn('[ReservationsManager] Failed to update backup', e);
        }
    }

    // Enhanced renderTable with better styling and features
    renderTable() {
        console.log("[ReservationsManager] renderTable called");
        const container = document.getElementById('reservations-table');
        
        // Create enhanced container structure
        container.innerHTML = `
            <div class="reservations-table-enhanced">
                <div class="table-header">
                    <div class="table-controls">
                        <div class="tab-controls">
                            <button class="tab-btn active table-tab" data-tab="table">
                                <i class="fas fa-table mr-2"></i>Table View
                            </button>
                            <button class="tab-btn history-tab" data-tab="history">
                                <i class="fas fa-history mr-2"></i>Change History
                                <span class="history-badge">${this.changeHistory.length}</span>
                            </button>
                        </div>
                        <div class="table-actions">
                            <div class="search-container">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="table-search" placeholder="Search reservations..." class="search-input">
                            </div>
                            <button id="export-btn" class="action-btn">
                                <i class="fas fa-download mr-2"></i>Export
                            </button>
                        </div>
                    </div>
                </div>
                <div class="table-content">
                    <div id="table-view" class="tab-content active">
                        <div id="actual-table-container"></div>
                    </div>
                    <div id="history-view" class="tab-content">
                        <div id="history-container"></div>
                    </div>
                </div>
            </div>
        `;

        this.setupTabControls();
        this.setupSearchControls();
        this.renderTableContent();
    }

    // Setup tab controls
    setupTabControls() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                
                // Update active states
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(`${tabName}-view`).classList.add('active');
                
                if (tabName === 'history') {
                    this.renderHistoryTab();
                }
            });
        });
    }

    // Setup search controls
    setupSearchControls() {
        const searchInput = document.getElementById('table-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearchTerm = e.target.value.toLowerCase();
                this.renderTableContent();
            });
        }

        // Setup export button
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportData();
            });
        }
    }

    // Render actual table content
    renderTableContent() {
        const container = document.getElementById('actual-table-container');
        const sel = document.getElementById('reservations-week-select');
        const weekVal = sel ? sel.value : '';
        
        let rows;
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            // Show all loaded records, don't filter by week for uploaded data
            rows = [...this.loadedRecords];
            console.log('[ReservationsManager] Showing loaded records:', rows.length);
        } else {
            rows = this.subscribedData.filter(r => !weekVal || weekVal === 'all' || r._week === weekVal);
            console.log('[ReservationsManager] Showing filtered data:', rows.length);
        }

        // Show welcome message if no data at all
        if (this.loadedRecords.length === 0 && this.subscribedData.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-table empty-icon"></i>
                    <h3>Welcome to Weekly Reservations</h3>
                    <p>Upload an Excel file to get started, or your saved reservations will appear here.</p>
                </div>
            `;
            return;
        }

        // Apply search filter
        if (this.currentSearchTerm) {
            rows = rows.filter(row => 
                Object.values(row).some(value => 
                    String(value).toLowerCase().includes(this.currentSearchTerm)
                )
            );
        }

        // Apply sorting
        if (this.currentSortColumn) {
            rows = this.sortData([...rows], this.currentSortColumn, this.currentSortDirection);
        }

        if (rows.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times empty-icon"></i>
                    <h3>No reservations found</h3>
                    <p>Try adjusting your search or select a different week.</p>
                </div>
            `;
            return;
        }

        // Create enhanced table
        const tableWrapper = document.createElement('div');
        tableWrapper.className = 'table-wrapper';
        
        const table = document.createElement('table');
        table.className = 'enhanced-reservations-table';
        
        // Create header
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        
        const columns = Object.keys(rows[0]).filter(k => k !== '_week');
        columns.forEach((key, index) => {
            const th = document.createElement('th');
            th.style.width = this.getColumnWidth(key);
            th.innerHTML = `
                <div class="header-content" data-column="${key}">
                    <span class="header-text">${this.formatColumnName(key)}</span>
                    <div class="sort-icons">
                        <i class="fas fa-caret-up sort-up ${this.currentSortColumn === key && this.currentSortDirection === 'asc' ? 'active' : ''}"></i>
                        <i class="fas fa-caret-down sort-down ${this.currentSortColumn === key && this.currentSortDirection === 'desc' ? 'active' : ''}"></i>
                    </div>
                </div>
            `;
            th.addEventListener('click', () => this.sortTable(key));
            headerRow.appendChild(th);
        });

        // Create body with optimized rendering
        const tbody = table.createTBody();
        
        // Use document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        rows.forEach((record, rowIndex) => {
            const row = document.createElement('tr');
            row.className = 'table-row';
            
            columns.forEach(key => {
                const td = document.createElement('td');
                td.className = 'table-cell';
                td.style.width = this.getColumnWidth(key);
                
                const cellWrapper = document.createElement('div');
                cellWrapper.className = 'cell-wrapper';
                
                const input = document.createElement('input');
                input.type = this.getInputType(key);
                input.value = record[key] || '';
                input.className = 'cell-input';
                input.placeholder = this.getShortPlaceholder(key);
                
                // Use debounced event handling for better performance
                let inputTimeout;
                input.addEventListener('focus', () => {
                    input.dataset.originalValue = input.value;
                    cellWrapper.classList.add('focused');
                });
                
                input.addEventListener('blur', () => {
                    cellWrapper.classList.remove('focused');
                });
                
                input.addEventListener('input', () => {
                    cellWrapper.classList.add('modified');
                    
                    // Clear previous timeout
                    if (inputTimeout) clearTimeout(inputTimeout);
                    
                    // Debounce the auto-save for better performance
                    inputTimeout = setTimeout(() => {
                        const oldValue = input.dataset.originalValue || '';
                        this.scheduleAutoSave(record.id, key, input.value, oldValue);
                        
                        // Update local data
                        record[key] = input.value;
                    }, 500); // Increased debounce time
                });
                
                cellWrapper.appendChild(input);
                td.appendChild(cellWrapper);
                row.appendChild(td);
            });
            
            fragment.appendChild(row);
        });
        
        tbody.appendChild(fragment);

        tableWrapper.appendChild(table);
        container.innerHTML = '';
        container.appendChild(tableWrapper);
    }

    // Render history tab
    renderHistoryTab() {
        const container = document.getElementById('history-container');
        
        if (this.changeHistory.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-history empty-icon"></i>
                    <h3>No changes yet</h3>
                    <p>Changes to your reservations will appear here.</p>
                </div>
            `;
            return;
        }

        const historyList = document.createElement('div');
        historyList.className = 'history-list';
        
        this.changeHistory.forEach(change => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            const timeAgo = this.getTimeAgo(change.timestamp);
            
            historyItem.innerHTML = `
                <div class="history-header">
                    <div class="change-info">
                        <span class="field-name">${this.formatColumnName(change.field)}</span>
                        <span class="change-type">modified</span>
                    </div>
                    <span class="change-time">${timeAgo}</span>
                </div>
                <div class="history-content">
                    <div class="value-change">
                        <span class="old-value">${change.oldValue || '(empty)'}</span>
                        <i class="fas fa-arrow-right change-arrow"></i>
                        <span class="new-value">${change.newValue || '(empty)'}</span>
                    </div>
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
        
        container.innerHTML = '';
        container.appendChild(historyList);
    }

    // Utility functions
    formatColumnName(key) {
        return key.replace(/([A-Z])/g, ' $1')
                 .replace(/^./, str => str.toUpperCase())
                 .replace(/[-_]/g, ' ');
    }

    getInputType(key) {
        const lowerKey = key.toLowerCase();
        if (lowerKey.includes('email')) return 'email';
        if (lowerKey.includes('phone') || lowerKey.includes('tel')) return 'tel';
        if (lowerKey.includes('date') || lowerKey.includes('check')) return 'date';
        if (lowerKey.includes('price') || lowerKey.includes('cost') || lowerKey.includes('amount')) return 'number';
        return 'text';
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const changeDate = new Date(timestamp);
        const diffMs = now - changeDate;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return changeDate.toLocaleDateString();
    }

    // Get appropriate column width based on content type
    getColumnWidth(key) {
        const lowerKey = key.toLowerCase();
        
        // Date columns
        if (lowerKey.includes('date') || lowerKey.includes('check')) return '110px';
        
        // Time columns
        if (lowerKey.includes('time') || lowerKey.includes('hora')) return '80px';
        
        // Status columns
        if (lowerKey.includes('estado') || lowerKey.includes('status')) return '100px';
        
        // Name/location columns
        if (lowerKey.includes('nome') || lowerKey.includes('name') || lowerKey.includes('alojamento')) return '150px';
        
        // Property/room columns
        if (lowerKey.includes('voo') || lowerKey.includes('resp') || lowerKey.includes('cofre')) return '90px';
        
        // Default width
        return '120px';
    }

    // Get short placeholder text
    getShortPlaceholder(key) {
        const lowerKey = key.toLowerCase();
        
        if (lowerKey.includes('nome') || lowerKey.includes('name')) return 'Name';
        if (lowerKey.includes('estado') || lowerKey.includes('status')) return 'Status';
        if (lowerKey.includes('check')) return 'Date';
        if (lowerKey.includes('time') || lowerKey.includes('hora')) return 'Time';
        if (lowerKey.includes('voo')) return 'Flight';
        if (lowerKey.includes('resp')) return 'Person';
        if (lowerKey.includes('cofre')) return 'Safe';
        if (lowerKey.includes('chegada')) return 'Arrival';
        if (lowerKey.includes('alojamento')) return 'Property';
        
        return '';
    }

    sortTable(column) {
        if (this.currentSortColumn === column) {
            this.currentSortDirection = this.currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSortColumn = column;
            this.currentSortDirection = 'asc';
        }
        this.renderTableContent();
    }

    // Sort data array by column
    sortData(rows, column, direction) {
        return rows.sort((a, b) => {
            let aVal = a[column] || '';
            let bVal = b[column] || '';
            
            // Try to parse as numbers for numeric sorting
            const aNum = parseFloat(aVal);
            const bNum = parseFloat(bVal);
            
            if (!isNaN(aNum) && !isNaN(bNum)) {
                return direction === 'asc' ? aNum - bNum : bNum - aNum;
            }
            
            // Try to parse as dates
            const aDate = new Date(aVal);
            const bDate = new Date(bVal);
            
            if (!isNaN(aDate.getTime()) && !isNaN(bDate.getTime())) {
                return direction === 'asc' ? aDate - bDate : bDate - aDate;
            }
            
            // Default to string comparison
            aVal = String(aVal).toLowerCase();
            bVal = String(bVal).toLowerCase();
            
            if (direction === 'asc') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        });
    }

    // Export table data
    exportData() {
        const sel = document.getElementById('reservations-week-select');
        const weekVal = sel ? sel.value : '';
        
        let rows;
        if (this.loadedRecords.length > 0 && this.currentDatasetName) {
            rows = this.loadedRecords;
        } else {
            rows = this.subscribedData.filter(r => weekVal === 'all' || r._week === weekVal);
        }

        // Apply search filter
        if (this.currentSearchTerm) {
            rows = rows.filter(row => 
                Object.values(row).some(value => 
                    String(value).toLowerCase().includes(this.currentSearchTerm)
                )
            );
        }

        if (rows.length === 0) {
            alert('No data to export');
            return;
        }

        // Create CSV content
        const columns = Object.keys(rows[0]).filter(k => k !== '_week' && k !== 'id');
        const csvContent = [
            columns.map(col => this.formatColumnName(col)).join(','),
            ...rows.map(row => 
                columns.map(col => {
                    const value = row[col] || '';
                    // Escape quotes and wrap in quotes if contains comma
                    return value.toString().includes(',') 
                        ? `"${value.toString().replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ].join('\n');

        // Download CSV
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reservations_${weekVal || 'all'}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Update a field in Firestore
    async updateReservationField(id, field, value) {
        const ref = doc(this.db, 'reservations', id);
        await updateDoc(ref, { [field]: value });
    }
} 