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
    buildReservationSummary,
    filterReservations,
    groupReservationsByDate,
    isPmsReservationHeader,
    isWeeklyReservationSheet,
    normalizePmsReservationRow,
    normalizeRawReservationDocument,
    normalizeReservationRow,
    normalizeText
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
        this.saveTimers = new Map();
        this.isClearingReservations = false;
        this.controlsBound = false;
        this.openReservationKeys = new Set();

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
                    <input type="file" id="reservations-file-input" accept=".xlsx,.xls" hidden>
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
            if (!/\.xlsx?$/i.test(file.name)) {
                this.showStatus('Please select a valid Excel workbook.', 'error');
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
            this.filters.week = 'all';
            this.filters.search = '';
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
        const arrayBuffer = await this.readFileAsArrayBuffer(file);
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellDates: true,
            cellText: false
        });

        const records = this.parseWorkbook(workbook, file.name);
        this.currentImportName = file.name.replace(/\.xlsx?$/i, '');
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
        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const matrix = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: '',
                raw: true
            });
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

        return records;
    }

    countWorkbookSheets(workbook) {
        return workbook.SheetNames.length;
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('Could not read file'));
            reader.readAsArrayBuffer(file);
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

        record[field] = value;
        const normalized = normalizeRawReservationDocument(record);
        Object.assign(record, normalized);

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

        container.innerHTML = `
            <div class="reservations-workspace-grid">
                <div class="reservations-workspace-main">
                    <section class="reservations-summary">
                        <div>
                            <p class="reservations-kicker">${escapeHtml(activeMode)}</p>
                            <h2>${summary.total} reservations</h2>
                        </div>
                        ${this.renderMetric('Today', summary.checkInsToday)}
                        ${this.renderMetric('Pool follow-up', summary.poolFollowUps)}
                        ${this.renderMetric('Online check-in pending', summary.sefWaiting)}
                        ${this.renderMetric('Missing arrival', summary.missingArrival)}
                        ${this.renderMetric('Long stays', summary.longStays)}
                    </section>
                    ${visibleRecords.length ? this.renderReservationGroups(grouped) : this.renderNoMatches()}
                </div>
                <aside class="reservations-workspace-side">
                    ${this.renderQuickAccess(sourceSummary)}
                </aside>
            </div>
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
                        ${issueCount ? this.renderChip(`${issueCount} issue${issueCount === 1 ? '' : 's'}`, 'bad') : ''}
                    </div>
                </summary>
                <div class="reservation-row__details">
                    <div class="reservation-edit-grid">
                        ${MANUAL_FIELDS.map((config) => this.renderManualField(config, record, recordKey)).join('')}
                    </div>
                    <div class="reservation-static-grid">
                        ${this.renderDetail('Reference', record.pmsReference || record.intermediaryReference || record.reference)}
                        ${this.renderDetail('Status', record.status)}
                        ${this.renderDetail('Dates', `${formatDisplayDate(record.checkIn)} - ${formatDisplayDate(record.checkOut)}${record.nightsCount ? ` / ${record.nightsCount} nights` : ''}`)}
                        ${this.renderDetail('Property', [record.propertyName, record.municipality].filter(Boolean).join(' / '))}
                        ${this.renderDetail('Guests', formatGuests(record))}
                        ${this.renderDetail('Guest contact', [record.phone, record.customerEmail].filter(Boolean).join(' / '))}
                        ${this.renderDetail('Portal', record.portal)}
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

    renderManualField(config, record, recordKey) {
        const value = record[config.field] ?? '';
        const common = `data-record-key="${escapeHtml(recordKey)}" data-reservation-field="${escapeHtml(config.field)}"`;
        const input = config.type === 'textarea'
            ? `<textarea ${common} placeholder="${escapeHtml(config.placeholder || '')}">${escapeHtml(value)}</textarea>`
            : config.type === 'select'
                ? `<select ${common}>${config.options.map((option) => `<option value="${escapeHtml(option)}" ${String(value) === option ? 'selected' : ''}>${escapeHtml(option || '-')}</option>`).join('')}</select>`
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
        record.poolPaidAmountValue !== null && record.poolPaidAmountValue !== undefined ? `${record.poolPaidAmountValue.toFixed(2)} EUR paid` : '',
        record.poolAvantioAmountValue !== null && record.poolAvantioAmountValue !== undefined ? `${record.poolAvantioAmountValue.toFixed(2)} EUR Avantio` : '',
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
    if (value === 'requested') return 'Pool requested';
    if (value === 'not-requested') return 'No pool';
    if (value === 'waiting') return 'Pool waiting';
    if (value === 'unavailable') return 'Pool unavailable';
    return 'Pool review';
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
