import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    buildHeatedPoolPlan,
    summarizePoolProperties
} from './heated-pools-utils.js';

export class HeatedPoolsManager {
    constructor(db) {
        this.db = db || null;
        this.properties = [];
        this.plan = null;
        this.searchTerm = '';
        this.today = formatLocalDate(new Date());
        this.unsubscribe = null;
        this.initialized = false;
    }

    init() {
        if (!this.initialized) {
            this.initialized = true;
            this.bindEvents();
        }

        this.startListening();
        this.rebuildPlan();
        this.render();
    }

    setDatabase(db) {
        this.db = db || null;
        this.startListening();
    }

    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    getCollectionRef() {
        if (!this.db) return null;
        return collection(this.db, 'heatedPools');
    }

    startListening() {
        const ref = this.getCollectionRef();
        if (!ref || this.unsubscribe) {
            return;
        }

        this.unsubscribe = onSnapshot(ref, (snapshot) => {
            this.properties = snapshot.docs
                .map((entry) => this.normalizeProperty({ id: entry.id, ...entry.data() }))
                .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
            this.rebuildPlan();
            this.render();
        }, (error) => {
            console.error('[HeatedPools] listener failed:', error);
            this.showMessage('Could not load heated pool records.', 'error');
        });
    }

    bindEvents() {
        const todayInput = document.getElementById('heated-pools-today');
        const searchInput = document.getElementById('heated-pools-search');
        const propertyForm = document.getElementById('heated-pools-property-form');
        const reservationForm = document.getElementById('heated-pools-reservation-form');
        const helpButton = document.getElementById('heated-pools-help-btn');
        const helpCloseButton = document.getElementById('heated-pools-help-close-btn');
        const helpPanel = document.getElementById('heated-pools-help-panel');

        if (todayInput) {
            todayInput.value = this.today;
            todayInput.addEventListener('change', () => {
                this.today = todayInput.value || formatLocalDate(new Date());
                this.rebuildPlan();
                this.render();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.searchTerm = searchInput.value.toLowerCase().trim();
                this.render();
            });
        }

        if (propertyForm) {
            propertyForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.addProperty(new FormData(propertyForm)).then(() => {
                    propertyForm.reset();
                    this.showMessage('Property added.', 'success');
                }).catch((error) => {
                    console.error('[HeatedPools] add property failed:', error);
                    this.showMessage(error.message || 'Could not add property.', 'error');
                });
            });
        }

        if (reservationForm) {
            reservationForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.addReservation(new FormData(reservationForm)).then(() => {
                    reservationForm.reset();
                    this.showMessage('Reservation added.', 'success');
                }).catch((error) => {
                    console.error('[HeatedPools] add reservation failed:', error);
                    this.showMessage(error.message || 'Could not add reservation.', 'error');
                });
            });
        }

        if (helpButton && helpPanel) {
            helpButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleHelpPanel();
            });
        }

        if (helpCloseButton) {
            helpCloseButton.addEventListener('click', () => this.closeHelpPanel());
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeHelpPanel();
            }
        });

        document.addEventListener('click', (event) => {
            if (
                !helpPanel
                || helpPanel.classList.contains('hidden')
                || helpPanel.contains(event.target)
                || helpButton?.contains(event.target)
            ) {
                return;
            }
            this.closeHelpPanel();
        });
    }

    toggleHelpPanel() {
        const panel = document.getElementById('heated-pools-help-panel');
        const button = document.getElementById('heated-pools-help-btn');
        if (!panel) return;

        const shouldOpen = panel.classList.contains('hidden');
        panel.classList.toggle('hidden', !shouldOpen);
        button?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        if (shouldOpen) {
            sessionStorage.setItem('heated-pools:tutorial-opened', '1');
        }
    }

    closeHelpPanel() {
        const panel = document.getElementById('heated-pools-help-panel');
        const button = document.getElementById('heated-pools-help-btn');
        panel?.classList.add('hidden');
        button?.setAttribute('aria-expanded', 'false');
    }

    async addProperty(formData) {
        const propertyName = cleanText(formData.get('propertyName'));
        if (!propertyName) {
            throw new Error('Property name is required.');
        }

        const ref = this.getCollectionRef();
        if (!ref) {
            throw new Error('Database is not ready.');
        }

        await addDoc(ref, {
            propertyName,
            poolState: formData.get('poolState') || 'unknown',
            poolNote: cleanText(formData.get('poolNote')),
            lastChangeDate: formData.get('lastChangeDate') || null,
            chargeAmount: parseMoney(formData.get('chargeAmount')),
            ownerCostAmount: parseMoney(formData.get('ownerCostAmount')),
            heatUpDays: parsePositiveInteger(formData.get('heatUpDays'), 1),
            notes: splitNotes(formData.get('notes')),
            reservations: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    }

    async updateProperty(propertyId, updates) {
        if (!this.db || !propertyId) return;
        await updateDoc(doc(this.db, 'heatedPools', propertyId), {
            ...updates,
            updatedAt: serverTimestamp()
        });
    }

    async deleteProperty(propertyId) {
        if (!this.db || !propertyId) return;
        if (!confirm('Delete this heated pool property and its reservations?')) return;
        await deleteDoc(doc(this.db, 'heatedPools', propertyId));
    }

    async addReservation(formData) {
        const propertyId = formData.get('propertyId');
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property) {
            throw new Error('Choose a property first.');
        }

        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        if (!startDate || !endDate) {
            throw new Error('Start and end dates are required.');
        }
        if (endDate < startDate) {
            throw new Error('End date must be after the start date.');
        }

        const reservation = {
            id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            propertyName: property.propertyName,
            dateRange: `${formatShortDate(startDate)} - ${formatShortDate(endDate)}`,
            startDate,
            endDate,
            heatingRequested: formData.get('heatingRequested') === 'yes'
                ? true
                : formData.get('heatingRequested') === 'no'
                    ? false
                    : null,
            requestStatus: formData.get('heatingRequested') || 'blank',
            paymentStatus: formData.get('paymentStatus') || 'blank',
            avantioStatus: formData.get('avantioStatus') || 'blank',
            notes: cleanText(formData.get('reservationNotes'))
        };

        await this.updateProperty(property.id, {
            reservations: [...property.reservations, reservation]
                .sort((a, b) => a.startDate.localeCompare(b.startDate))
        });
    }

    async updateReservation(propertyId, reservationId, updates) {
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property) return;

        const reservations = property.reservations.map((reservation) => {
            if (reservation.id !== reservationId) {
                return reservation;
            }

            const next = {
                ...reservation,
                ...updates
            };
            next.dateRange = `${formatShortDate(next.startDate)} - ${formatShortDate(next.endDate)}`;
            return next;
        });

        await this.updateProperty(propertyId, { reservations });
    }

    async deleteReservation(propertyId, reservationId) {
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property) return;
        if (!confirm('Delete this reservation?')) return;

        await this.updateProperty(propertyId, {
            reservations: property.reservations.filter((reservation) => reservation.id !== reservationId)
        });
    }

    async completeTask(task) {
        const property = this.properties.find((entry) => entry.propertyName === task.propertyName);
        if (!property) return;

        if (task.type === 'turn_on') {
            await this.updateProperty(property.id, {
                poolState: 'on',
                lastChangeDate: this.today,
                poolNote: `Pool switched on ${formatShortDate(this.today)}`
            });
            return;
        }

        if (task.type === 'turn_off') {
            await this.updateProperty(property.id, {
                poolState: 'off',
                lastChangeDate: this.today,
                poolNote: `Pool switched off ${formatShortDate(this.today)}`
            });
            return;
        }

        if (task.type === 'payment_check') {
            await this.updateReservation(property.id, task.reservation.id, {
                paymentStatus: 'yes'
            });
        }
    }

    normalizeProperty(property) {
        return {
            id: property.id,
            propertyName: cleanText(property.propertyName || property.name),
            poolState: property.poolState || 'unknown',
            poolNote: cleanText(property.poolNote),
            lastChangeDate: property.lastChangeDate || null,
            chargeAmount: property.chargeAmount ?? null,
            ownerCostAmount: property.ownerCostAmount ?? null,
            heatUpDays: parsePositiveInteger(property.heatUpDays, 1),
            notes: Array.isArray(property.notes) ? property.notes.map(cleanText).filter(Boolean) : splitNotes(property.notes),
            reservations: Array.isArray(property.reservations)
                ? property.reservations.map((reservation) => ({
                    id: reservation.id || `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    propertyName: cleanText(property.propertyName || property.name),
                    dateRange: reservation.dateRange || `${formatShortDate(reservation.startDate)} - ${formatShortDate(reservation.endDate)}`,
                    startDate: reservation.startDate || '',
                    endDate: reservation.endDate || '',
                    heatingRequested: reservation.heatingRequested === true
                        ? true
                        : reservation.heatingRequested === false
                            ? false
                            : null,
                    requestStatus: reservation.requestStatus || statusFromBoolean(reservation.heatingRequested),
                    paymentStatus: reservation.paymentStatus || 'blank',
                    avantioStatus: reservation.avantioStatus || 'blank',
                    notes: cleanText(reservation.notes)
                })).filter((reservation) => reservation.startDate && reservation.endDate)
                : []
        };
    }

    rebuildPlan() {
        const planningProperties = this.properties.map((property) => ({
            ...property,
            notes: property.heatUpDays > 1
                ? [...property.notes, `${property.heatUpDays} days to heat`]
                : property.notes
        }));
        this.plan = buildHeatedPoolPlan(planningProperties, {
            today: this.today,
            horizonDays: 14
        });
    }

    render() {
        const emptyState = document.getElementById('heated-pools-empty');
        const workspace = document.getElementById('heated-pools-workspace');
        const propertySelect = document.getElementById('heated-pools-reservation-property');
        const planningDate = document.getElementById('heated-pools-planning-date-label');

        if (planningDate) {
            planningDate.textContent = formatDisplayDate(this.today);
        }

        if (propertySelect) {
            propertySelect.innerHTML = [
                '<option value="">Choose property</option>',
                ...this.properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.propertyName)}</option>`)
            ].join('');
        }

        if (!this.properties.length) {
            emptyState?.classList.remove('hidden');
            workspace?.classList.add('hidden');
            this.renderSummary();
            return;
        }

        emptyState?.classList.add('hidden');
        workspace?.classList.remove('hidden');
        this.renderSummary();
        this.renderTaskLanes();
        this.renderPropertyTable();
        this.renderReservationTable();
    }

    renderSummary() {
        const summary = summarizePoolProperties(this.properties);
        const plan = this.plan || buildHeatedPoolPlan([], { today: this.today });
        const summaryEl = document.getElementById('heated-pools-summary');
        if (!summaryEl) return;

        summaryEl.innerHTML = [
            createMetric('Properties', summary.properties),
            createMetric('Requests', summary.requested),
            createMetric('Overdue', plan.overdue.length, 'danger'),
            createMetric('Today', plan.todayTasks.length, 'warning'),
            createMetric('Pending payment', summary.pendingPayments, 'muted')
        ].join('');
    }

    renderTaskLanes() {
        const lanesEl = document.getElementById('heated-pools-task-lanes');
        if (!lanesEl) return;

        const lanes = [
            { title: 'Overdue', tasks: this.filterTasks(this.plan.overdue), tone: 'danger' },
            { title: 'Today', tasks: this.filterTasks(this.plan.todayTasks), tone: 'warning' },
            { title: 'Next 14 days', tasks: this.filterTasks(this.plan.upcoming), tone: 'info' }
        ];

        lanesEl.innerHTML = lanes.map((lane) => `
            <section class="heated-pools-lane heated-pools-lane--${lane.tone}">
                <div class="heated-pools-lane__header">
                    <h3>${escapeHtml(lane.title)}</h3>
                    <span>${lane.tasks.length}</span>
                </div>
                <div class="heated-pools-lane__body">
                    ${lane.tasks.length ? lane.tasks.map((task) => this.renderTask(task)).join('') : '<p class="heated-pools-muted">No actions in this lane.</p>'}
                </div>
            </section>
        `).join('');

        lanesEl.querySelectorAll('[data-task-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const task = this.plan.tasks.find((entry) => entry.id === button.dataset.taskId);
                if (!task) return;
                this.completeTask(task).catch((error) => {
                    console.error('[HeatedPools] complete task failed:', error);
                    this.showMessage('Could not complete task.', 'error');
                });
            });
        });
    }

    renderTask(task) {
        return `
            <article class="heated-pools-task">
                <div>
                    <p class="heated-pools-task__date">${formatDisplayDate(task.actionDate)}</p>
                    <h4>${escapeHtml(taskLabel(task))}</h4>
                    <p>${escapeHtml(task.propertyName)} - ${escapeHtml(task.reservation.dateRange)}</p>
                </div>
                <div class="heated-pools-task__meta">
                    <span>${escapeHtml(statusLabel(task.status))}</span>
                    ${task.poolNote ? `<small>${escapeHtml(task.poolNote)}</small>` : ''}
                    <button type="button" data-task-id="${escapeHtml(task.id)}" class="heated-pools-small-action">
                        ${task.type === 'payment_check' ? 'Mark paid' : 'Mark done'}
                    </button>
                </div>
            </article>
        `;
    }

    renderPropertyTable() {
        const body = document.getElementById('heated-pools-table-body');
        if (!body) return;

        const rows = this.properties
            .filter((property) => property.propertyName.toLowerCase().includes(this.searchTerm))
            .map((property) => {
                const nextReservation = findNextReservation(property, this.today);
                const nextTask = findNextTaskForProperty(this.plan.tasks, property.propertyName);
                return `
                    <tr data-property-id="${escapeHtml(property.id)}">
                        <td>
                            <strong>${escapeHtml(property.propertyName)}</strong>
                            ${property.notes.length ? `<small>${escapeHtml(property.notes.join(' | '))}</small>` : ''}
                        </td>
                        <td>
                            <select data-field="poolState" class="heated-pools-inline-input">
                                ${poolStateOptions(property.poolState)}
                            </select>
                        </td>
                        <td><input data-field="lastChangeDate" type="date" value="${escapeHtml(property.lastChangeDate || '')}" class="heated-pools-inline-input"></td>
                        <td><input data-field="heatUpDays" type="number" min="1" max="5" value="${escapeHtml(property.heatUpDays)}" class="heated-pools-inline-input"></td>
                        <td><input data-field="poolNote" value="${escapeHtml(property.poolNote || '')}" class="heated-pools-inline-input"></td>
                        <td>${nextReservation ? `${escapeHtml(nextReservation.dateRange)}<small>${escapeHtml(requestLabel(nextReservation))}</small>` : '-'}</td>
                        <td>${nextTask ? `${formatDisplayDate(nextTask.actionDate)}<small>${escapeHtml(taskLabel(nextTask))}</small>` : '-'}</td>
                        <td><button type="button" data-action="delete-property" class="heated-pools-danger-link">Delete</button></td>
                    </tr>
                `;
            });

        body.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="8" class="heated-pools-empty-row">No properties match the search.</td></tr>';

        body.querySelectorAll('[data-field]').forEach((input) => {
            input.addEventListener('change', () => {
                const row = input.closest('[data-property-id]');
                const propertyId = row?.dataset.propertyId;
                if (!propertyId) return;
                const field = input.dataset.field;
                const value = field === 'heatUpDays'
                    ? parsePositiveInteger(input.value, 1)
                    : cleanText(input.value);
                this.updateProperty(propertyId, { [field]: value || null }).catch((error) => {
                    console.error('[HeatedPools] update property failed:', error);
                    this.showMessage('Could not update property.', 'error');
                });
            });
        });

        body.querySelectorAll('[data-action="delete-property"]').forEach((button) => {
            button.addEventListener('click', () => {
                const propertyId = button.closest('[data-property-id]')?.dataset.propertyId;
                this.deleteProperty(propertyId).catch((error) => {
                    console.error('[HeatedPools] delete property failed:', error);
                    this.showMessage('Could not delete property.', 'error');
                });
            });
        });
    }

    renderReservationTable() {
        const body = document.getElementById('heated-pools-reservations-body');
        if (!body) return;

        const rows = this.properties
            .filter((property) => !this.searchTerm || property.propertyName.toLowerCase().includes(this.searchTerm))
            .flatMap((property) => property.reservations.map((reservation) => ({ property, reservation })))
            .filter(({ reservation }) => reservation.endDate >= addDays(this.today, -30))
            .sort((a, b) => a.reservation.startDate.localeCompare(b.reservation.startDate))
            .map(({ property, reservation }) => `
                <tr data-property-id="${escapeHtml(property.id)}" data-reservation-id="${escapeHtml(reservation.id)}">
                    <td><strong>${escapeHtml(property.propertyName)}</strong></td>
                    <td><input data-res-field="startDate" type="date" value="${escapeHtml(reservation.startDate)}" class="heated-pools-inline-input"></td>
                    <td><input data-res-field="endDate" type="date" value="${escapeHtml(reservation.endDate)}" class="heated-pools-inline-input"></td>
                    <td>
                        <select data-res-field="heatingRequested" class="heated-pools-inline-input">
                            ${booleanOptions(reservation.heatingRequested)}
                        </select>
                    </td>
                    <td>
                        <select data-res-field="paymentStatus" class="heated-pools-inline-input">
                            ${statusOptions(reservation.paymentStatus)}
                        </select>
                    </td>
                    <td>
                        <select data-res-field="avantioStatus" class="heated-pools-inline-input">
                            ${statusOptions(reservation.avantioStatus)}
                        </select>
                    </td>
                    <td><input data-res-field="notes" value="${escapeHtml(reservation.notes || '')}" class="heated-pools-inline-input"></td>
                    <td><button type="button" data-action="delete-reservation" class="heated-pools-danger-link">Delete</button></td>
                </tr>
            `);

        body.innerHTML = rows.length
            ? rows.join('')
            : '<tr><td colspan="8" class="heated-pools-empty-row">No active reservations yet.</td></tr>';

        body.querySelectorAll('[data-res-field]').forEach((input) => {
            input.addEventListener('change', () => {
                const row = input.closest('[data-property-id]');
                const propertyId = row?.dataset.propertyId;
                const reservationId = row?.dataset.reservationId;
                const field = input.dataset.resField;
                let value = input.value;

                if (field === 'heatingRequested') {
                    value = value === 'yes' ? true : value === 'no' ? false : null;
                }

                this.updateReservation(propertyId, reservationId, { [field]: value }).catch((error) => {
                    console.error('[HeatedPools] update reservation failed:', error);
                    this.showMessage('Could not update reservation.', 'error');
                });
            });
        });

        body.querySelectorAll('[data-action="delete-reservation"]').forEach((button) => {
            button.addEventListener('click', () => {
                const row = button.closest('[data-property-id]');
                this.deleteReservation(row?.dataset.propertyId, row?.dataset.reservationId).catch((error) => {
                    console.error('[HeatedPools] delete reservation failed:', error);
                    this.showMessage('Could not delete reservation.', 'error');
                });
            });
        });
    }

    filterTasks(tasks = []) {
        if (!this.searchTerm) {
            return tasks;
        }
        return tasks.filter((task) => task.propertyName.toLowerCase().includes(this.searchTerm));
    }

    showMessage(message, type = 'info') {
        const status = document.getElementById('heated-pools-status');
        if (!status) return;
        status.textContent = message;
        status.dataset.status = type;
    }
}

function createMetric(label, value, tone = 'default') {
    return `
        <div class="heated-pools-metric heated-pools-metric--${tone}">
            <span>${escapeHtml(label)}</span>
            <strong>${Number(value) || 0}</strong>
        </div>
    `;
}

function findNextReservation(property, today) {
    return property.reservations
        .filter((reservation) => reservation.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

function findNextTaskForProperty(tasks = [], propertyName) {
    return tasks.find((task) => task.propertyName === propertyName && ['overdue', 'today', 'upcoming', 'later'].includes(task.status)) || null;
}

function taskLabel(task) {
    if (task.type === 'turn_on') {
        return task.leadDays > 1 ? `Switch pool on (${task.leadDays} days before)` : 'Switch pool on';
    }
    if (task.type === 'turn_off') {
        return 'Switch pool off';
    }
    return 'Check heated pool payment';
}

function statusLabel(status) {
    if (status === 'overdue') return 'Overdue';
    if (status === 'today') return 'Due today';
    if (status === 'upcoming') return 'Upcoming';
    if (status === 'done') return 'Already done';
    return 'Later';
}

function poolStateOptions(current) {
    return [
        ['unknown', 'Unknown'],
        ['off', 'Off'],
        ['on', 'On'],
        ['always_on', 'Always on'],
        ['unavailable', 'Unavailable']
    ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function booleanOptions(current) {
    return [
        ['blank', 'Not filled'],
        ['yes', 'Yes'],
        ['no', 'No']
    ].map(([value, label]) => {
        const selected = value === 'yes'
            ? current === true
            : value === 'no'
                ? current === false
                : current === null;
        return `<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function statusOptions(current) {
    return [
        ['blank', 'Not filled'],
        ['yes', 'Yes'],
        ['no', 'No'],
        ['waiting', 'Waiting']
    ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function requestLabel(reservation) {
    if (reservation.heatingRequested === true) {
        return reservation.paymentStatus === 'yes' ? 'Requested and paid' : 'Requested, payment pending';
    }
    if (reservation.heatingRequested === false) {
        return 'No heating requested';
    }
    return 'Heating status not filled';
}

function statusFromBoolean(value) {
    if (value === true) return 'yes';
    if (value === false) return 'no';
    return 'blank';
}

function splitNotes(value) {
    return cleanText(value)
        .split(/\n|;/)
        .map(cleanText)
        .filter(Boolean);
}

function cleanText(value = '') {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseMoney(value) {
    const normalized = cleanText(value).replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function addDays(isoDate, days) {
    const date = new Date(`${isoDate}T00:00:00`);
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
    if (!value) return '';
    const [, month, day] = String(value).match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
    if (!month || !day) return value;
    return `${Number(day)}/${Number(month)}`;
}

function formatDisplayDate(value) {
    if (!value) return '-';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
