import {
    collection,
    addDoc,
    doc,
    deleteDoc,
    getDocs,
    onSnapshot,
    query,
    where,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import {
    applyPoolControlsToReservations,
    buildReservationSummary,
    filterReservations,
    groupReservationsByDate,
    isPmsReservationHeader,
    isWeeklyReservationSheet,
    normalizePmsReservationRow,
    normalizeRawReservationDocument,
    normalizeReservationRow,
    normalizeText,
    parsePoolControlMatrix
} from './reservations-utils.js';

const ISSUE_OPTIONS = [
    ['all', 'All reservations'],
    ['pool', 'Pool follow-up'],
    ['keybox', 'Key boxes missing'],
    ['sef', 'Online check-in pending'],
    ['arrival', 'Missing arrival'],
    ['tax', 'Missing tax'],
    ['long-stays', 'Long stays'],
    ['owner', 'Owner stays'],
    ['invalid', 'Validation issues']
];

const MANUAL_FIELDS = [
    { field: 'arrivalInfo', label: 'Arrival info', type: 'text', placeholder: 'Flight arrival, already in Madeira...' },
    { field: 'flightNumber', label: 'Flight', type: 'text', placeholder: 'TP1685' },
    { field: 'checkInTime', label: 'Check-in hour', type: 'text', placeholder: '16h00' },
    { field: 'safeCode', label: 'Safe / keybox', type: 'text', placeholder: 'Code' },
    { field: 'firstMessageStatus', label: 'First message', type: 'select', options: ['', 'Enviada', 'Enviado', 'Criado', '-'] },
    { field: 'sefStatus', label: 'Online check-in', type: 'select', options: ['', 'À espera', 'Validado', 'Pendente'] },
    { field: 'heatedPool', label: 'Heated pool', type: 'select', options: ['', 'sim', 'não', 'pago', 'a espera', 'não respondeu', '???', 'n funciona'] },
    { field: 'poolPaidAmount', label: 'Pool paid', type: 'text', placeholder: 'Amount, paid, waiting...' },
    { field: 'poolAvantioAmount', label: 'Avantio pool', type: 'text', placeholder: 'Amount or note' },
    { field: 'touristTaxAmount', label: 'Tax value', type: 'text', placeholder: 'Auto: 2 EUR per guest/night, max 7 nights' },
    { field: 'touristTaxPaidBy', label: 'Tax paid by', type: 'text', placeholder: 'Airbnb, Booking, Transf...' },
    { field: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Operational notes' }
];

const MANUAL_FIELD_SECTIONS = [
    {
        title: 'Arrival and guest',
        fields: [
            { field: 'arrivalInfo', label: 'Arrival info', type: 'text', placeholder: 'Flight arrival, already in Madeira...' },
            { field: 'flightNumber', label: 'Flight', type: 'text', placeholder: 'TP1685' },
            { field: 'checkInTime', label: 'Check-in hour', type: 'text', placeholder: '16h00' },
            { field: 'safeCode', label: 'Safe / keybox', type: 'text', placeholder: 'Code' },
            { field: 'firstMessageStatus', label: 'First message', type: 'select', options: ['', 'Enviada', 'Enviado', 'Criado', '-'] },
            { field: 'sefStatus', label: 'Online check-in', type: 'select', options: ['', 'A espera', 'Validado', 'Pendente'] }
        ]
    },
    {
        title: 'Heated pool control',
        fields: [
            { field: 'heatedPool', label: 'Guest requested', type: 'select', options: ['', 'sim', 'nao', 'pago', 'a espera', 'nao respondeu', '???', 'n funciona'] },
            { field: 'poolChargeAmount', label: 'Guest charge', type: 'text', placeholder: 'Cobrar: 45 EUR' },
            { field: 'poolPaidAmount', label: 'Guest paid', type: 'text', placeholder: 'Sim, Nao, amount, waiting...' },
            { field: 'poolAvantioAmount', label: 'Avantio amount', type: 'text', placeholder: 'Avantio - 35 EUR' },
            { field: 'poolHeatingStatus', label: 'Heating status', type: 'select', options: ['', 'Pool on', 'Pool off', 'Always on', 'Remote on', 'Scheduled', 'Unavailable'] }
        ]
    },
    {
        title: 'Tax and notes',
        fields: [
            { field: 'touristTaxAmount', label: 'Tax value', type: 'text', placeholder: 'Auto: 2 EUR per guest/night, max 7 nights' },
            { field: 'touristTaxPaidBy', label: 'Tax paid by', type: 'text', placeholder: 'Airbnb, Booking, Transf...' },
            { field: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Operational notes' }
        ]
    }
];

export class ReservationsManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.savedRecords = [];
        this.importedRecords = [];
        this.currentImportName = '';
        this.unsubscribe = null;
        this.filters = {
            week: 'all',
            issue: 'all',
            search: ''
        };
        this.viewMode = 'reservations';
        this.saveTimers = new Map();
        this.isClearingReservations = false;
        this.controlsBound = false;
        this.openReservationKeys = new Set();
        this.lastParsedPoolControls = { propertySettings: [], reservationControls: [] };

        this.restoreLocalImport();
    }

    initializeEventListeners() {
        this.decorateControls();
        this.bindControls();
        this.subscribeToReservations();
        this.render();
    }

    decorateControls() {
        const controls = document.getElementById('reservations-controls');
        if (!controls || controls.dataset.enhanced === 'true') return;

        controls.dataset.enhanced = 'true';
        controls.className = 'reservations-ops-controls';
        controls.innerHTML = `
            <div class="reservations-ops-controls__grid">
                <label class="reservations-field">
                    <span>Week</span>
                    <select id="reservations-week-select">
                        <option value="all">All weeks</option>
                    </select>
                </label>
                <label class="reservations-field">
                    <span>Worklist</span>
                    <select id="reservations-issue-select">
                        ${ISSUE_OPTIONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
                    </select>
                </label>
                <label class="reservations-field reservations-field--search">
                    <span>Search</span>
                    <input id="reservations-search-input" type="search" placeholder="Guest, property, phone, flight">
                </label>
                <div class="reservations-actions">
                    <input type="file" id="reservations-file-input" accept=".xlsx,.xls,.csv" hidden>
                    <button id="load-reservations-btn" class="reservations-action reservations-action--primary" type="button">
                        <i class="fas fa-file-excel"></i>
                        Import workbook
                    </button>
                    <button id="save-reservations-week-btn" class="reservations-action" type="button" disabled>
                        <i class="fas fa-cloud-upload-alt"></i>
                        Save import
                    </button>
                </div>
            </div>
            <div class="reservations-view-tabs" role="tablist" aria-label="Reservation views">
                <button id="reservations-tab-all" class="is-active" type="button" data-reservations-view="reservations">
                    All reservations
                </button>
                <button id="reservations-tab-pools" type="button" data-reservations-view="pools">
                    Heated pools
                </button>
            </div>
            <div class="reservations-import-strip">
                <span id="dataset-name-display">No import loaded</span>
                <button id="edit-dataset-name-btn" type="button">Rename</button>
                    <button id="clear-reservations-import-btn" class="reservations-clear-import" type="button">Clear import</button>
                <span id="reservations-import-status"></span>
            </div>
        `;
    }

    bindControls() {
        if (this.controlsBound) return;

        const fileInput = document.getElementById('reservations-file-input');
        const uploadBtn = document.getElementById('load-reservations-btn');
        const saveBtn = document.getElementById('save-reservations-week-btn');
        const weekSelect = document.getElementById('reservations-week-select');
        const issueSelect = document.getElementById('reservations-issue-select');
        const searchInput = document.getElementById('reservations-search-input');
        const renameBtn = document.getElementById('edit-dataset-name-btn');
        const clearImportBtn = document.getElementById('clear-reservations-import-btn');
        const reservationsTable = document.getElementById('reservations-table');

        if (!fileInput || !uploadBtn || !saveBtn || !reservationsTable) return;

        this.controlsBound = true;

        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];
            if (!file) return;
            if (!/\.(xlsx?|csv)$/i.test(file.name)) {
                this.showStatus('Please select a valid Excel workbook or CSV file.', 'error');
                return;
            }

            try {
                await this.handleFileUpload(file);
            } catch (error) {
                console.error('Reservation import failed:', error);
                this.showStatus(`Import failed: ${error.message || error}`, 'error');
            } finally {
                fileInput.value = '';
            }
        });

        saveBtn.addEventListener('click', () => this.saveImportedRecords());
        weekSelect?.addEventListener('change', (event) => {
            this.filters.week = event.target.value || 'all';
            this.render();
        });
        issueSelect?.addEventListener('change', (event) => {
            this.filters.issue = event.target.value || 'all';
            this.render();
        });
        searchInput?.addEventListener('input', (event) => {
            this.filters.search = event.target.value || '';
            this.render();
        });
        renameBtn?.addEventListener('click', () => {
            const nextName = prompt('Import name:', this.currentImportName || 'Reservations import');
            if (!nextName) return;
            this.currentImportName = nextName.trim();
            this.updateImportUi();
            this.persistLocalImport();
        });
        clearImportBtn?.addEventListener('click', async () => {
            await this.clearImportPreview();
        });
        document.addEventListener('click', async (event) => {
            if (event.target?.id === 'clear-reservations-import-btn') {
                event.preventDefault();
                await this.clearImportPreview();
            }
        });

        reservationsTable.addEventListener('input', (event) => {
            const control = event.target.closest('[data-reservation-field]');
            if (!control) return;
            this.handleManualFieldChange(control);
        });
        reservationsTable.addEventListener('change', (event) => {
            const control = event.target.closest('[data-reservation-field]');
            if (!control) return;
            this.handleManualFieldChange(control);
        });
        reservationsTable.addEventListener('click', (event) => {
            const resetAction = event.target.closest('[data-reservations-reset-filters]');
            if (resetAction) {
                this.resetFilters();
                return;
            }

            const quickAction = event.target.closest('[data-reservations-quick-filter]');
            if (!quickAction) return;
            this.filters.issue = quickAction.dataset.reservationsQuickFilter || 'all';
            if (this.filters.issue === 'pool') this.viewMode = 'pools';
            this.filters.week = 'all';
            this.filters.search = '';
            this.render();
        });
        document.addEventListener('click', (event) => {
            const viewAction = event.target.closest('[data-reservations-view]');
            if (!viewAction) return;
            this.viewMode = viewAction.dataset.reservationsView === 'pools' ? 'pools' : 'reservations';
            if (this.viewMode === 'pools' && this.filters.issue === 'all') this.filters.issue = 'pool';
            if (this.viewMode === 'reservations' && this.filters.issue === 'pool') this.filters.issue = 'all';
            this.render();
        });
        reservationsTable.addEventListener('toggle', (event) => {
            const row = event.target.closest?.('.reservation-row[data-record-key]');
            if (!row) return;
            if (row.open) {
                this.openReservationKeys.add(row.dataset.recordKey);
            } else {
                this.openReservationKeys.delete(row.dataset.recordKey);
            }
        }, true);
    }

    subscribeToReservations() {
        if (!this.db || !this.userId || this.unsubscribe) return;
        const reservationsRef = collection(this.db, 'reservations');
        const reservationsQuery = query(reservationsRef, where('userId', '==', this.userId));
        this.unsubscribe = onSnapshot(reservationsQuery, (snapshot) => {
            if (this.isClearingReservations) return;
            this.savedRecords = snapshot.docs.map((entry) => normalizeRawReservationDocument({
                id: entry.id,
                ...entry.data()
            }));
            this.renderWeekOptions();
            this.render();
        }, (error) => {
            console.error('Reservations listener error:', error);
            this.showStatus('Could not load saved reservations.', 'error');
        });
    }

    async handleFileUpload(file) {
        this.showStatus('Reading workbook...');
        const isCsv = /\.csv$/i.test(file.name);
        const input = isCsv ? await this.readFileAsText(file) : await this.readFileAsArrayBuffer(file);
        const workbook = XLSX.read(input, {
            type: isCsv ? 'string' : 'array',
            cellDates: true,
            cellText: false
        });

        const records = this.parseWorkbook(workbook, file.name);
        const poolControlCount = this.lastParsedPoolControls.propertySettings.length + this.lastParsedPoolControls.reservationControls.length;
        if (!records.length && poolControlCount) {
            await this.applyPoolControlImport(file.name);
            return;
        }
        this.currentImportName = file.name.replace(/\.(xlsx?|csv)$/i, '');
        this.importedRecords = records;
        this.filters.week = 'all';
        this.filters.issue = records.some((record) => record.validationIssues.length) ? 'invalid' : 'all';
        this.persistLocalImport();
        this.renderWeekOptions();
        this.updateImportUi();
        this.render();
        this.showStatus(`Imported ${records.length} cleaned reservations from ${this.countWorkbookSheets(workbook)} sheet(s).`, 'success');

        if (records.length) {
            await this.saveImportedRecords({ automatic: true });
        }
    }

    parseWorkbook(workbook, importName = '') {
        const records = [];
        const poolControls = {
            propertySettings: [],
            reservationControls: []
        };
        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: '',
                raw: true
            });
            const parsedPoolControls = parsePoolControlMatrix(matrix);
            if (parsedPoolControls.propertySettings.length || parsedPoolControls.reservationControls.length) {
                poolControls.propertySettings.push(...parsedPoolControls.propertySettings);
                poolControls.reservationControls.push(...parsedPoolControls.reservationControls);
            }
            const pmsHeaderIndex = matrix.findIndex((row) => isPmsReservationHeader(row));

            if (pmsHeaderIndex >= 0) {
                const headers = matrix[pmsHeaderIndex].map(normalizeText);
                matrix.slice(pmsHeaderIndex + 1).forEach((values, index) => {
                    const row = objectFromHeaders(headers, values);
                    const normalized = normalizePmsReservationRow(row, {
                        sheetName,
                        rowNumber: pmsHeaderIndex + index + 2,
                        importName
                    });
                    if (normalized.checkIn && normalized.propertyName) {
                        records.push(normalized);
                    }
                });
                return;
            }

            if (isWeeklyReservationSheet(sheetName)) {
                const rows = XLSX.utils.sheet_to_json(sheet, {
                    defval: '',
                    raw: true
                });
                rows.forEach((row) => {
                    const normalized = normalizeReservationRow(row, {
                        sheetName,
                        rowNumber: Number(row.__rowNum__ || 0) + 1,
                        importName
                    });
                    if (normalized.checkIn && normalized.propertyName) {
                        records.push(normalized);
                    }
                });
            }
        });

        this.lastParsedPoolControls = poolControls;
        return applyPoolControlsToReservations(records, poolControls);
    }

    countWorkbookSheets(workbook) {
        return workbook.SheetNames.length;
    }

    async applyPoolControlImport(fileName) {
        const source = this.importedRecords.length ? this.importedRecords : this.savedRecords;
        if (!source.length) {
            this.showStatus('Pool control file read. Import or load weekly reservations before applying it.', 'info');
            return;
        }

        const merged = applyPoolControlsToReservations(source, this.lastParsedPoolControls);
        const changedRecords = merged.filter((record, index) => poolStorageChanged(source[index], record));

        if (!changedRecords.length) {
            this.showStatus('Pool control file read, but no matching reservations needed updates.', 'info');
            return;
        }

        if (this.importedRecords.length) {
            this.importedRecords = merged;
            this.currentImportName = this.currentImportName || fileName.replace(/\.(xlsx?|csv)$/i, '');
            this.persistLocalImport();
            this.render();
            this.showStatus(`Applied pool controls to ${changedRecords.length} imported reservations.`, 'success');
            return;
        }

        this.savedRecords = merged;
        this.render();

        if (!this.db || !this.userId) {
            this.showStatus(`Applied pool controls to ${changedRecords.length} reservations in this browser. Sign in to save them.`, 'info');
            return;
        }

        this.showStatus(`Saving pool controls on ${changedRecords.length} reservations...`, 'info');
        try {
            await Promise.all(changedRecords
                .filter((record) => record.id)
                .map((record) => updateDoc(doc(this.db, 'reservations', record.id), {
                    heatedPool: record.heatedPool || '',
                    poolChargeAmount: record.poolChargeAmount || '',
                    poolPaidAmount: record.poolPaidAmount || '',
                    poolAvantioAmount: record.poolAvantioAmount || '',
                    poolHeatingStatus: record.poolHeatingStatus || '',
                    poolTurnedOnAt: record.poolTurnedOnAt || '',
                    poolTurnedOffAt: record.poolTurnedOffAt || '',
                    poolNotes: record.poolNotes || '',
                    poolHistory: record.poolHistory || [],
                    poolStatus: record.poolStatus || '',
                    poolState: record.poolState || '',
                    poolPaymentState: record.poolPaymentState || '',
                    poolHeatingState: record.poolHeatingState || '',
                    poolChargeAmountValue: record.poolChargeAmountValue ?? null,
                    poolPaidAmountValue: record.poolPaidAmountValue ?? null,
                    poolAvantioAmountValue: record.poolAvantioAmountValue ?? null,
                    validationIssues: record.validationIssues || [],
                    updatedAt: serverTimestamp()
                })));
            this.showStatus(`Applied and saved pool controls from ${fileName}.`, 'success');
        } catch (error) {
            console.error('Pool control update failed:', error);
            this.showStatus(`Pool control save failed: ${error.message || error}`, 'error');
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Could not read file'));
            reader.readAsArrayBuffer(file);
        });
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Could not read file'));
            reader.readAsText(file, 'utf-8');
        });
    }

    async saveImportedRecords({ automatic = false } = {}) {
        if (!this.importedRecords.length) {
            this.showStatus('No imported reservations to save.', 'error');
            return;
        }
        if (!this.db || !this.userId) {
            this.showStatus(automatic
                ? 'Imported preview only. Sign in before saving reservations.'
                : 'Sign in before saving reservations.', 'error');
            return;
        }

        const saveBtn = document.getElementById('save-reservations-week-btn');
        await this.refreshSavedRecordsOnce();
        const existingFingerprints = new Set(this.savedRecords.map((record) => record.fingerprint).filter(Boolean));
        const nextFingerprints = new Set(existingFingerprints);
        const recordsToSave = [];

        for (const record of this.importedRecords) {
            const fingerprint = record.fingerprint || this.getRecordKey(record);
            if (fingerprint && nextFingerprints.has(fingerprint)) continue;
            if (fingerprint) nextFingerprints.add(fingerprint);
            recordsToSave.push(record);
        }

        if (!recordsToSave.length) {
            this.importedRecords = [];
            this.clearLocalImport();
            this.updateImportUi();
            this.render();
            this.showStatus('All imported reservations are already saved.', 'success');
            return;
        }

        if (saveBtn) saveBtn.disabled = true;
        this.showStatus(`${automatic ? 'Auto-saving' : 'Saving'} ${recordsToSave.length} reservations...`);

        try {
            const savedNow = [];
            for (const record of recordsToSave) {
                const savedRecord = {
                    ...record,
                    userId: this.userId,
                    importName: this.currentImportName || record.importName || 'Reservations import',
                    importedAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                };
                const docRef = await addDoc(collection(this.db, 'reservations'), savedRecord);
                savedNow.push(normalizeRawReservationDocument({
                    ...savedRecord,
                    id: docRef.id,
                    importedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }));
            }
            this.savedRecords = [
                ...this.savedRecords,
                ...savedNow.filter((record) => !existingFingerprints.has(record.fingerprint))
            ];
            this.importedRecords = [];
            this.clearLocalImport();
            this.updateImportUi();
            this.render();
            this.showStatus(`${automatic ? 'Import saved automatically' : 'Saved'} ${recordsToSave.length} new reservations.`, 'success');
        } catch (error) {
            console.error('Error saving reservations:', error);
            this.showStatus(`${automatic ? 'Auto-save failed' : 'Save failed'}: ${error.message || error}`, 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = this.importedRecords.length === 0;
        }
    }

    getVisibleRecords() {
        const source = this.importedRecords.length ? this.importedRecords : this.savedRecords;
        return filterReservations(source, this.filters);
    }

    handleManualFieldChange(control) {
        const recordKey = control.dataset.recordKey;
        const field = control.dataset.reservationField;
        const value = control.value;
        const source = this.importedRecords.length ? this.importedRecords : this.savedRecords;
        const record = source.find((entry) => this.getRecordKey(entry) === recordKey);
        if (!record || !field) return;

        const previousValue = record[field] ?? '';
        record[field] = value;
        const normalized = normalizeRawReservationDocument(record);
        Object.assign(record, normalized);
        if (isPoolField(field)) {
            record.poolHistory = buildPoolHistory(record.poolHistory, field, previousValue, value);
        }

        if (this.importedRecords.length) {
            this.persistLocalImport();
            this.showStatus('Import preview updated. Save import when ready.', 'info');
            return;
        }

        if (!record.id || !this.db) return;
        this.scheduleFieldSave(record, field, value);
    }

    scheduleFieldSave(record, field, value) {
        const recordId = record.id;
        const timerKey = `${recordId}:${field}`;
        if (this.saveTimers.has(timerKey)) {
            clearTimeout(this.saveTimers.get(timerKey));
        }

        this.showStatus('Saving manual change...');
        const timeoutId = setTimeout(async () => {
            try {
                await updateDoc(doc(this.db, 'reservations', recordId), {
                    [field]: value,
                    firstMessageState: record.firstMessageState || '',
                    sefState: record.sefState || '',
                    poolState: record.poolState || '',
                    poolPaymentState: record.poolPaymentState || '',
                    poolHeatingState: record.poolHeatingState || '',
                    poolTurnedOnAt: record.poolTurnedOnAt || '',
                    poolTurnedOffAt: record.poolTurnedOffAt || '',
                    poolNotes: record.poolNotes || '',
                    poolHistory: record.poolHistory || [],
                    poolChargeAmountValue: record.poolChargeAmountValue ?? null,
                    poolPaidAmountValue: record.poolPaidAmountValue ?? null,
                    poolAvantioAmountValue: record.poolAvantioAmountValue ?? null,
                    validationIssues: record.validationIssues || [],
                    updatedAt: serverTimestamp()
                });
                this.showStatus('Manual change saved.', 'success');
            } catch (error) {
                console.error('Manual reservation update failed:', error);
                this.showStatus(`Manual save failed: ${error.message || error}`, 'error');
            } finally {
                this.saveTimers.delete(timerKey);
            }
        }, 700);
        this.saveTimers.set(timerKey, timeoutId);
    }

    render() {
        this.captureOpenReservationRows();
        this.renderWeekOptions();
        this.updateImportUi();

        const container = document.getElementById('reservations-table');
        if (!container) return;

        container.className = 'reservations-workspace';
        const source = this.importedRecords.length ? this.importedRecords : this.savedRecords;
        if (!source.length) {
            container.innerHTML = this.renderEmptyState();
            return;
        }

        const visibleRecords = this.getVisibleRecords();
        const sourceSummary = buildReservationSummary(source);
        const summary = buildReservationSummary(visibleRecords);
        const grouped = groupReservationsByDate(visibleRecords);
        const activeMode = this.importedRecords.length ? 'Import preview' : 'Saved reservations';

        if (this.viewMode === 'pools') {
            const poolSource = filterReservations(source, {
                week: this.filters.week,
                search: this.filters.search,
                issue: 'all'
            });
            container.innerHTML = this.renderPoolsView(poolSource, activeMode);
            return;
        }

        container.innerHTML = `
            <div class="reservations-workspace-grid">
                <div class="reservations-workspace-main">
                    <section class="reservations-summary">
                        <div>
                            <p class="reservations-kicker">${escapeHtml(activeMode)}</p>
                            <h2>${summary.total} reservations</h2>
                        </div>
                        ${this.renderMetric('Today', summary.checkInsToday)}
                        ${this.renderMetric('Pool requests', summary.poolRequests)}
                        ${this.renderMetric('Heating on', summary.poolHeatingOn)}
                        ${this.renderMetric('Online check-in pending', summary.sefWaiting)}
                        ${this.renderMetric('Missing arrival', summary.missingArrival)}
                    </section>
                    ${visibleRecords.length ? this.renderReservationGroups(grouped) : this.renderNoMatches()}
                </div>
                <aside class="reservations-workspace-side">
                    ${this.renderQuickAccess(sourceSummary)}
                </aside>
            </div>
        `;
    }

    renderPoolsView(records, activeMode) {
        const poolRecords = this.getPoolRecords(records);
        const totalCharge = sumMoney(poolRecords, 'poolChargeAmountValue');
        const totalAvantio = sumMoney(poolRecords, 'poolAvantioAmountValue');
        const paidCount = poolRecords.filter((record) => record.poolPaymentState === 'paid').length;
        const heatingOnCount = poolRecords.filter((record) => record.poolHeatingState === 'on').length;

        return `
            <section class="reservations-pools-view">
                <div class="reservations-pools-view__header">
                    <div>
                        <p class="reservations-kicker">${escapeHtml(activeMode)}</p>
                        <h2>Heated pools</h2>
                        <p>One row per reservation for pool-capable properties. Changes save automatically.</p>
                    </div>
                    <div class="reservations-pools-view__stats">
                        ${this.renderPoolStat('Reservations', poolRecords.length)}
                        ${this.renderPoolStat('Paid', paidCount)}
                        ${this.renderPoolStat('Heating on', heatingOnCount)}
                        ${this.renderPoolStat('Charge', `${totalCharge.toFixed(2)} EUR`)}
                        ${this.renderPoolStat('Avantio', `${totalAvantio.toFixed(2)} EUR`)}
                    </div>
                </div>
                ${poolRecords.length ? this.renderPoolsTable(poolRecords) : this.renderPoolsEmpty()}
            </section>
        `;
    }

    getPoolRecords(records) {
        return records
            .filter((record) => record.poolChargeAmount
                || record.poolAvantioAmount
                || record.poolHeatingStatus
                || record.poolState === 'requested'
                || record.poolState === 'waiting'
                || record.poolPaymentState
                || record.poolHeatingState)
            .sort((a, b) => `${a.checkIn}${a.propertyName}${a.guestName}`.localeCompare(`${b.checkIn}${b.propertyName}${b.guestName}`));
    }

    renderPoolStat(label, value) {
        return `
            <div class="reservations-pool-stat">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `;
    }

    renderPoolsTable(records) {
        return `
            <div class="reservations-pools-table-wrap">
                <table class="reservations-pools-table">
                    <thead>
                        <tr>
                            <th>Reservation</th>
                            <th>Dates</th>
                            <th>Charge guest</th>
                            <th>Avantio</th>
                            <th>Requested</th>
                            <th>Paid</th>
                            <th>Pool</th>
                            <th>Turned on</th>
                            <th>Turned off</th>
                            <th>Notes</th>
                            <th>History</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map((record) => this.renderPoolTableRow(record)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderPoolTableRow(record) {
        const recordKey = this.getRecordKey(record);
        return `
            <tr>
                <td class="reservations-pools-table__identity">
                    <strong>${escapeHtml(record.propertyName || 'Unknown property')}</strong>
                    <span>${escapeHtml(record.guestName || 'Guest missing')}</span>
                    <small>${escapeHtml(record.portal || '')}</small>
                </td>
                <td>${escapeHtml(`${formatDisplayDate(record.checkIn)} - ${formatDisplayDate(record.checkOut)}`)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolChargeAmount', type: 'text', placeholder: '45 EUR' }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolAvantioAmount', type: 'text', placeholder: '35 EUR' }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'heatedPool', type: 'select', options: ['', 'sim', 'nao', 'a espera', 'pago', 'n funciona'] }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolPaidAmount', type: 'select', options: ['', 'Sim', 'Nao', 'A espera', 'Devolvido'] }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolHeatingStatus', type: 'select', options: ['', 'Pool on', 'Pool off', 'Always on', 'Remote on', 'Scheduled', 'Unavailable'] }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolTurnedOnAt', type: 'date' }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolTurnedOffAt', type: 'date' }, record, recordKey)}</td>
                <td>${this.renderPoolInlineField({ field: 'poolNotes', type: 'text', placeholder: 'Pool note' }, record, recordKey)}</td>
                <td>${this.renderPoolHistory(record)}</td>
            </tr>
        `;
    }

    renderPoolInlineField(config, record, recordKey) {
        const value = record[config.field] ?? '';
        const common = `data-record-key="${escapeHtml(recordKey)}" data-reservation-field="${escapeHtml(config.field)}"`;
        if (config.type === 'select') {
            const options = value && !config.options.includes(String(value)) ? [String(value), ...config.options] : config.options;
            return `<select class="reservations-pool-input" ${common}>${options.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === option ? 'selected' : ''}>${escapeHtml(option || '-')}</option>`).join('')}</select>`;
        }
        return `<input class="reservations-pool-input" ${common} type="${escapeHtml(config.type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(config.placeholder || '')}">`;
    }

    renderPoolHistory(record) {
        const history = Array.isArray(record.poolHistory) ? record.poolHistory.slice(-3).reverse() : [];
        if (!history.length) return '<span class="reservations-pool-history-empty">No changes</span>';
        return `
            <ul class="reservations-pool-history">
                ${history.map((entry) => `
                    <li>
                        <strong>${escapeHtml(poolFieldLabel(entry.field))}</strong>
                        <span>${escapeHtml(entry.next || '-')}</span>
                        <small>${escapeHtml(formatHistoryTime(entry.at))}</small>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    renderPoolsEmpty() {
        return `
            <section class="reservations-empty reservations-empty--small">
                <h2>No pool-capable reservation rows yet.</h2>
                <p>Import the Piscinas CSV after loading weekly reservations. The app will mark those properties as heated-pool capable and show them here.</p>
            </section>
        `;
    }

    renderQuickAccess(summary) {
        const items = [
            {
                issue: 'pool',
                label: 'Heated pools',
                value: summary.poolFollowUps,
                hint: 'Waiting, review, or payment missing'
            },
            {
                issue: 'keybox',
                label: 'Key boxes',
                value: summary.missingKeybox,
                hint: 'Missing safe or office keybox code'
            },
            {
                issue: 'tax',
                label: 'Taxes missing',
                value: summary.missingTax,
                hint: 'Tourist tax amount not filled'
            },
            {
                issue: 'long-stays',
                label: 'Long stays',
                value: summary.longStays,
                hint: '14 nights or more'
            }
        ];

        return `
            <section class="reservations-quick-access" aria-label="Quick access">
                <div class="reservations-quick-access__header">
                    <div>
                        <p class="reservations-kicker">Quick access</p>
                        <h2>Jump to the work that needs checking</h2>
                    </div>
                    <button type="button" data-reservations-reset-filters>Reset filters</button>
                </div>
                <div class="reservations-quick-access__actions">
                    ${items.map((item) => `
                        <button
                            class="reservations-quick-card ${this.filters.issue === item.issue ? 'is-active' : ''}"
                            type="button"
                            data-reservations-quick-filter="${escapeHtml(item.issue)}"
                        >
                            <span>${escapeHtml(item.label)}</span>
                            <strong>${item.value}</strong>
                            <small>${escapeHtml(item.hint)}</small>
                        </button>
                    `).join('')}
                </div>
            </section>
        `;
    }

    resetFilters() {
        this.filters.issue = 'all';
        this.filters.week = 'all';
        this.filters.search = '';
        this.render();
    }

    renderMetric(label, value) {
        return `
            <div class="reservations-metric">
                <span>${escapeHtml(label)}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    renderReservationGroups(groups) {
        return `
            <section class="reservations-list">
                ${groups.map((group) => `
                    <div class="reservations-day">
                        <div class="reservations-day__header">
                            <time>${escapeHtml(formatDisplayDate(group.date))}</time>
                            <span>${group.entries.length} ${group.entries.length === 1 ? 'reservation' : 'reservations'}</span>
                        </div>
                        <div class="reservations-day__rows">
                            ${group.entries.map((record) => this.renderReservationRow(record)).join('')}
                        </div>
                    </div>
                `).join('')}
            </section>
        `;
    }

    renderReservationRow(record) {
        const issueCount = record.validationIssues.length;
        const recordKey = this.getRecordKey(record);
        const isOpen = this.openReservationKeys.has(recordKey);
        return `
            <details class="reservation-row ${issueCount ? 'reservation-row--attention' : ''}" data-record-key="${escapeHtml(recordKey)}" ${isOpen ? 'open' : ''}>
                <summary>
                    <div class="reservation-row__main">
                        <strong>${escapeHtml(record.propertyName || 'Unknown property')}</strong>
                        <span>${escapeHtml(record.guestName || 'Guest missing')}</span>
                    </div>
                    <div class="reservation-row__timing">
                        <span>${escapeHtml(record.checkInTime || record.arrivalInfo || 'Arrival missing')}</span>
                        <span>${escapeHtml(record.checkOut ? `Out ${formatDisplayDate(record.checkOut)}` : 'Checkout missing')}</span>
                    </div>
                    <div class="reservation-row__chips">
                        ${this.renderChip(record.portal || 'No portal', 'neutral')}
                        ${this.renderChip(sefLabel(record.sefState), record.sefState === 'validated' ? 'good' : 'warn')}
                        ${this.renderChip(messageLabel(record.firstMessageState), record.firstMessageState === 'sent' ? 'good' : 'warn')}
                        ${record.poolState ? this.renderChip(poolLabel(record.poolState), record.poolState === 'requested' ? 'pool' : 'warn') : ''}
                        ${record.poolPaymentState ? this.renderChip(poolPaymentLabel(record.poolPaymentState), record.poolPaymentState === 'paid' ? 'good' : 'warn') : ''}
                        ${record.poolHeatingState ? this.renderChip(poolHeatingLabel(record.poolHeatingState), record.poolHeatingState === 'on' ? 'pool' : 'neutral') : ''}
                        ${issueCount ? this.renderChip(`${issueCount} issue${issueCount === 1 ? '' : 's'}`, 'bad') : ''}
                    </div>
                </summary>
                <div class="reservation-row__details">
                    ${this.renderPoolControl(record)}
                    ${this.renderManualSections(record, recordKey)}
                    <div class="reservation-static-grid">
                        ${this.renderDetail('Reference', record.pmsReference || record.intermediaryReference || record.reference)}
                        ${this.renderDetail('Status', record.status)}
                        ${this.renderDetail('Dates', `${formatDisplayDate(record.checkIn)} - ${formatDisplayDate(record.checkOut)}${record.nightsCount ? ` / ${record.nightsCount} nights` : ''}`)}
                        ${this.renderDetail('Property', [record.propertyName, record.municipality].filter(Boolean).join(' / '))}
                        ${this.renderDetail('Guests', formatGuests(record))}
                        ${this.renderDetail('Guest contact', [record.phone, record.customerEmail].filter(Boolean).join(' / '))}
                        ${this.renderDetail('Portal', record.portal)}
                        ${this.renderDetail('Pool control', formatPool(record))}
                        ${this.renderDetail('PMS value', formatMoney(record.totalWithTax, record.portal))}
                        ${this.renderTaxDetail(record)}
                        ${this.renderDetail('PMS comments', record.pmsNotes || record.pmsGuestComments)}
                    </div>
                    ${record.validationIssues.length ? `<div class="reservation-row__issues">${record.validationIssues.map((issue) => `<span>${escapeHtml(issueLabel(issue))}</span>`).join('')}</div>` : ''}
                </div>
            </details>
        `;
    }

    captureOpenReservationRows() {
        const container = document.getElementById('reservations-table');
        if (!container) return;

        container.querySelectorAll('.reservation-row[data-record-key]').forEach((row) => {
            if (row.open) {
                this.openReservationKeys.add(row.dataset.recordKey);
            } else {
                this.openReservationKeys.delete(row.dataset.recordKey);
            }
        });
    }

    renderPoolControl(record) {
        const price = record.poolChargeAmountValue !== null && record.poolChargeAmountValue !== undefined
            ? `${record.poolChargeAmountValue.toFixed(2)} EUR`
            : record.poolChargeAmount || '-';
        const paid = record.poolPaidAmountValue !== null && record.poolPaidAmountValue !== undefined
            ? `${record.poolPaidAmountValue.toFixed(2)} EUR`
            : record.poolPaidAmount || poolPaymentLabel(record.poolPaymentState);
        const avantio = record.poolAvantioAmountValue !== null && record.poolAvantioAmountValue !== undefined
            ? `${record.poolAvantioAmountValue.toFixed(2)} EUR`
            : record.poolAvantioAmount || '-';

        return `
            <section class="reservation-pool-control" aria-label="Heated pool control">
                <div>
                    <p class="reservations-kicker">Heated pool</p>
                    <h3>${escapeHtml(poolLabel(record.poolState || ''))}</h3>
                </div>
                <div class="reservation-pool-control__metrics">
                    ${this.renderPoolMetric('Charge', price)}
                    ${this.renderPoolMetric('Guest paid', paid || '-')}
                    ${this.renderPoolMetric('Avantio', avantio)}
                    ${this.renderPoolMetric('Heating', poolHeatingLabel(record.poolHeatingState) || record.poolHeatingStatus || '-')}
                </div>
            </section>
        `;
    }

    renderPoolMetric(label, value) {
        return `
            <div class="reservation-pool-metric">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || '-')}</strong>
            </div>
        `;
    }

    renderManualSections(record, recordKey) {
        return MANUAL_FIELD_SECTIONS.map((section) => `
            <section class="reservation-edit-section">
                <h3>${escapeHtml(section.title)}</h3>
                <div class="reservation-edit-grid">
                    ${section.fields.map((config) => this.renderManualField(config, record, recordKey)).join('')}
                </div>
            </section>
        `).join('');
    }

    renderManualField(config, record, recordKey) {
        const value = record[config.field] ?? '';
        const common = `data-record-key="${escapeHtml(recordKey)}" data-reservation-field="${escapeHtml(config.field)}"`;
        const selectOptions = config.type === 'select' && value && !config.options.includes(String(value))
            ? [String(value), ...config.options]
            : config.options;
        const input = config.type === 'textarea'
            ? `<textarea ${common} placeholder="${escapeHtml(config.placeholder || '')}">${escapeHtml(value)}</textarea>`
            : config.type === 'select'
                ? `<select ${common}>${selectOptions.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === option ? 'selected' : ''}>${escapeHtml(option || '-')}</option>`).join('')}</select>`
                : `<input ${common} type="${config.type}" value="${escapeHtml(value)}" placeholder="${escapeHtml(config.placeholder || '')}" ${config.type === 'number' ? 'step="0.01" min="0"' : ''}>`;

        return `
            <label class="reservation-manual-field ${config.type === 'textarea' ? 'reservation-manual-field--wide' : ''}">
                <span>${escapeHtml(config.label)}</span>
                ${input}
            </label>
        `;
    }

    renderChip(label, tone) {
        return `<span class="reservation-chip reservation-chip--${tone}">${escapeHtml(label)}</span>`;
    }

    renderDetail(label, value) {
        return `
            <div class="reservation-detail">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value || '-')}</strong>
            </div>
        `;
    }

    renderTaxDetail(record) {
        const taxValue = record.touristTaxDisplayAmountValue;
        const manualValue = record.touristTaxAmountValue;
        const calculatedValue = record.calculatedTouristTaxAmountValue;
        const source = manualValue !== null && manualValue !== undefined ? 'manual override' : 'calculated';
        const value = taxValue !== null && taxValue !== undefined
            ? `${taxValue.toFixed(2)} EUR (${source})${record.touristTaxPaidBy ? ` / ${record.touristTaxPaidBy}` : ''}`
            : record.touristTaxPaidBy || '-';
        const formula = calculatedValue !== null && calculatedValue !== undefined
            ? `Formula: 2 EUR x ${Number(record.adultsCount || 0) + Number(record.childrenCount || 0)} guests x ${Math.min(Number(record.nightsCount || 0), 7)} nights = ${calculatedValue.toFixed(2)} EUR.`
            : 'Formula: 2 EUR per person per night, capped at 7 nights.';
        const childNote = record.touristTaxNeedsChildAgeCheck
            ? '<em>CHECK CHILD AGES: children are counted as 13+ in this estimate. Children 12 and under do not pay tourist tax.</em>'
            : '';

        return `
            <div class="reservation-detail reservation-detail--wide reservation-detail--tax">
                <span>Tax value</span>
                <strong>${escapeHtml(value)}</strong>
                <small>${escapeHtml(formula)}</small>
                ${childNote}
            </div>
        `;
    }

    getRecordKey(record) {
        return record.id || record.fingerprint || `${record.sourceSheet}:${record.sourceRow}:${record.propertyName}:${record.guestName}`;
    }

    renderEmptyState() {
        return `
            <section class="reservations-empty">
                <p class="reservations-kicker">Reservations operations</p>
                <h2>Import the 2026 workbook to build the weekly worklist.</h2>
                <p>The importer reads every weekly tab, normalizes the PMS details, and highlights pool, SEF, arrival, tax, and long-stay follow-ups.</p>
            </section>
        `;
    }

    renderNoMatches() {
        return `
            <section class="reservations-empty reservations-empty--small">
                <h2>No reservations match these filters.</h2>
                <p>Clear the worklist filter or search term to return to the full import.</p>
            </section>
        `;
    }

    renderWeekOptions() {
        const select = document.getElementById('reservations-week-select');
        if (!select) return;
        const current = this.filters.week || 'all';
        const source = this.importedRecords.length ? this.importedRecords : this.savedRecords;
        const weeks = [...new Set(source.map((record) => record.week).filter(Boolean))].sort();
        select.innerHTML = [
            '<option value="all">All weeks</option>',
            ...weeks.map((week) => `<option value="${escapeHtml(week)}">${escapeHtml(week)}</option>`)
        ].join('');
        select.value = weeks.includes(current) ? current : 'all';
        this.filters.week = select.value;
    }

    updateImportUi() {
        const datasetDisplay = document.getElementById('dataset-name-display');
        const saveBtn = document.getElementById('save-reservations-week-btn');
        const issueSelect = document.getElementById('reservations-issue-select');
        const searchInput = document.getElementById('reservations-search-input');
        const allTab = document.getElementById('reservations-tab-all');
        const poolsTab = document.getElementById('reservations-tab-pools');

        if (datasetDisplay) {
            datasetDisplay.textContent = this.currentImportName
                ? `${this.currentImportName} (${this.importedRecords.length} unsaved)`
                : 'No import loaded';
        }
        if (saveBtn) saveBtn.disabled = this.importedRecords.length === 0;
        const clearBtn = document.getElementById('clear-reservations-import-btn');
        if (clearBtn) clearBtn.disabled = false;
        if (issueSelect) issueSelect.value = this.filters.issue;
        if (searchInput && searchInput.value !== this.filters.search) searchInput.value = this.filters.search;
        allTab?.classList.toggle('is-active', this.viewMode !== 'pools');
        poolsTab?.classList.toggle('is-active', this.viewMode === 'pools');
    }

    showStatus(message, type = 'info') {
        const status = document.getElementById('reservations-import-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.type = type;
    }

    persistLocalImport() {
        try {
            localStorage.setItem('reservations_import_preview', JSON.stringify({
                name: this.currentImportName,
                records: this.importedRecords
            }));
        } catch (error) {
            console.warn('[ReservationsManager] Could not persist import preview', error);
        }
    }

    restoreLocalImport() {
        try {
            const payload = JSON.parse(localStorage.getItem('reservations_import_preview') || 'null');
            if (!payload?.records?.length) return;
            this.currentImportName = normalizeText(payload.name);
            this.importedRecords = payload.records.map(normalizeRawReservationDocument);
        } catch (error) {
            console.warn('[ReservationsManager] Could not restore import preview', error);
        }
    }

    clearLocalImport() {
        this.currentImportName = '';
        const keysToRemove = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key && key.toLowerCase().startsWith('reservations')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
    }

    async clearImportPreview() {
        const savedCount = await this.countSavedReservationRecords();
        const importedCount = this.importedRecords.length;
        if (savedCount > 0) {
            const confirmed = window.confirm(
                `This will delete ${savedCount} saved reservation records from the database and clear ${importedCount} unsaved imported records. Continue?`
            );
            if (!confirmed) return;
        }

        if (savedCount > 0) {
            this.isClearingReservations = true;
            this.showStatus(`Deleting ${savedCount} saved reservations...`, 'info');
            try {
                await this.deleteSavedReservationRecords();
            } finally {
                this.isClearingReservations = false;
            }
        }

        this.importedRecords = [];
        this.savedRecords = [];
        this.currentImportName = '';
        this.filters.issue = 'all';
        this.filters.week = 'all';
        this.filters.search = '';
        this.clearLocalImport();
        const searchInput = document.getElementById('reservations-search-input');
        if (searchInput) searchInput.value = '';
        this.render();
        this.showStatus('Reservations cleared. You can import the PMS file now.', 'success');
        if (!this.unsubscribe) {
            this.subscribeToReservations();
        }
    }

    async countSavedReservationRecords() {
        if (!this.db || !this.userId) return this.savedRecords.length;
        const snapshot = await getDocs(this.getCurrentUserReservationsQuery());
        return snapshot.size;
    }

    async refreshSavedRecordsOnce() {
        if (!this.db || !this.userId) return;
        try {
            const snapshot = await getDocs(this.getCurrentUserReservationsQuery());
            this.savedRecords = snapshot.docs.map((entry) => normalizeRawReservationDocument({
                id: entry.id,
                ...entry.data()
            }));
        } catch (error) {
            console.warn('[ReservationsManager] Could not refresh saved reservations before saving import', error);
        }
    }

    async deleteSavedReservationRecords() {
        if (!this.db || !this.userId) return;
        this.unsubscribe?.();
        this.unsubscribe = null;

        let deletedCount = 0;
        while (true) {
            const snapshot = await getDocs(this.getCurrentUserReservationsQuery());
            if (snapshot.empty) break;

            const docs = snapshot.docs;
            for (let index = 0; index < docs.length; index += 25) {
                const chunk = docs.slice(index, index + 25);
                await Promise.all(chunk.map((entry) => deleteDoc(entry.ref)));
                deletedCount += chunk.length;
                this.showStatus(`Deleted ${deletedCount} saved reservations...`, 'info');
            }
        }
    }

    getCurrentUserReservationsQuery() {
        return query(collection(this.db, 'reservations'), where('userId', '==', this.userId));
    }

    stopListening() {
        this.saveTimers.forEach((timerId) => clearTimeout(timerId));
        this.saveTimers.clear();
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
}

function objectFromHeaders(headers, values) {
    return headers.reduce((record, header, index) => {
        if (header) record[header] = values[index] ?? '';
        return record;
    }, {});
}

function poolStorageChanged(before = {}, after = {}) {
    return [
        'heatedPool',
        'poolChargeAmount',
        'poolPaidAmount',
        'poolAvantioAmount',
        'poolHeatingStatus',
        'poolTurnedOnAt',
        'poolTurnedOffAt',
        'poolNotes',
        'poolHistory',
        'poolStatus',
        'poolState',
        'poolPaymentState',
        'poolHeatingState',
        'poolChargeAmountValue',
        'poolPaidAmountValue',
        'poolAvantioAmountValue'
    ].some((field) => (before[field] ?? null) !== (after[field] ?? null));
}

function isPoolField(field) {
    return [
        'heatedPool',
        'poolChargeAmount',
        'poolPaidAmount',
        'poolAvantioAmount',
        'poolHeatingStatus',
        'poolTurnedOnAt',
        'poolTurnedOffAt',
        'poolNotes'
    ].includes(field);
}

function buildPoolHistory(history, field, previous, next) {
    if (String(previous ?? '') === String(next ?? '')) return Array.isArray(history) ? history : [];
    return [
        ...(Array.isArray(history) ? history : []),
        {
            at: new Date().toISOString(),
            field,
            previous: String(previous ?? ''),
            next: String(next ?? '')
        }
    ].slice(-50);
}

function sumMoney(records, field) {
    return records.reduce((total, record) => total + (Number(record[field]) || 0), 0);
}

function poolFieldLabel(field) {
    return {
        heatedPool: 'Requested',
        poolChargeAmount: 'Charge',
        poolPaidAmount: 'Paid',
        poolAvantioAmount: 'Avantio',
        poolHeatingStatus: 'Pool',
        poolTurnedOnAt: 'Turned on',
        poolTurnedOffAt: 'Turned off',
        poolNotes: 'Notes'
    }[field] || field;
}

function formatHistoryTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDisplayDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', weekday: 'short' });
}

function formatGuests(record) {
    const adults = record.adultsCount ?? record.adults;
    const children = record.childrenCount ?? record.children;
    const nights = record.nightsCount ?? record.nights;
    return `${adults || 0} A / ${children || 0} C${nights ? ` / ${nights} nights` : ''}`;
}

function formatMoney(amount, paidBy) {
    if (amount === null || amount === undefined) return paidBy || '-';
    return `${amount.toFixed(2)} EUR${paidBy ? ` / ${paidBy}` : ''}`;
}

function formatPool(record) {
    const parts = [
        record.heatedPool,
        record.poolChargeAmountValue !== null && record.poolChargeAmountValue !== undefined ? `${record.poolChargeAmountValue.toFixed(2)} EUR charge` : '',
        record.poolPaidAmountValue !== null && record.poolPaidAmountValue !== undefined ? `${record.poolPaidAmountValue.toFixed(2)} EUR paid` : '',
        record.poolAvantioAmountValue !== null && record.poolAvantioAmountValue !== undefined ? `${record.poolAvantioAmountValue.toFixed(2)} EUR Avantio` : '',
        record.poolHeatingStatus,
        record.poolStatus
    ].filter(Boolean);
    return parts.join(' / ');
}

function sefLabel(value) {
    if (value === 'validated') return 'Online check-in valid';
    if (value === 'waiting') return 'Online check-in waiting';
    if (value === 'pending') return 'Online check-in pending';
    return 'Online check-in missing';
}

function messageLabel(value) {
    if (value === 'sent') return 'Message sent';
    if (value === 'created') return 'Message created';
    return 'Message missing';
}

function poolLabel(value) {
    if (!value) return 'No pool info';
    if (value === 'requested') return 'Pool requested';
    if (value === 'not-requested') return 'No pool';
    if (value === 'waiting') return 'Pool waiting';
    if (value === 'unavailable') return 'Pool unavailable';
    return 'Pool review';
}

function poolPaymentLabel(value) {
    if (value === 'paid') return 'Pool paid';
    if (value === 'not-paid') return 'Pool not paid';
    if (value === 'waiting') return 'Payment waiting';
    if (value === 'needs-review') return 'Payment review';
    return '';
}

function poolHeatingLabel(value) {
    if (value === 'on') return 'Heating on';
    if (value === 'off') return 'Heating off';
    if (value === 'scheduled') return 'Heating scheduled';
    if (value === 'unavailable') return 'Heating unavailable';
    if (value === 'needs-review') return 'Heating review';
    return '';
}

function issueLabel(issue) {
    return {
        'missing-property': 'Missing property',
        'missing-guest': 'Missing guest',
        'missing-check-in': 'Missing check-in',
        'missing-check-out': 'Missing check-out',
        'checkout-before-checkin': 'Checkout before check-in',
        'missing-portal': 'Missing portal',
        'missing-phone': 'Missing phone',
        'missing-first-message': 'Missing first message',
        'missing-sef': 'Missing online check-in',
        'missing-arrival': 'Missing arrival',
        'missing-keybox': 'Missing keybox',
        'pool-follow-up': 'Pool follow-up',
        'pool-payment-missing': 'Pool payment missing',
        'missing-tax': 'Missing tourist tax',
        'tax-child-age-check': 'Check child ages for tourist tax'
    }[issue] || issue;
}
