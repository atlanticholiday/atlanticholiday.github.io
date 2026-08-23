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
    appendPoolStatusHistory,
    buildHeatedPoolPlan,
    summarizePoolProperties
} from './heated-pools-utils.js';

export class HeatedPoolsManager {
    constructor(db, options = {}) {
        this.db = db || null;
        this.getDataManager = typeof options.getDataManager === 'function'
            ? options.getDataManager
            : () => null;
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

        const poolState = formData.get('poolState') || 'unknown';
        const now = new Date().toISOString();
        const statusHistory = appendPoolStatusHistory([], {
            previousState: 'unknown',
            state: poolState,
            at: now,
            planningDate: this.today,
            source: 'property_created',
            note: cleanText(formData.get('poolNote')),
            actor: this.getCurrentActor()
        });

        await addDoc(ref, {
            propertyName,
            poolState,
            poolNote: cleanText(formData.get('poolNote')),
            lastChangeDate: poolState === 'unknown' ? null : this.today,
            chargeAmount: parseMoney(formData.get('chargeAmount')),
            ownerCostAmount: parseMoney(formData.get('ownerCostAmount')),
            heatUpDays: parsePositiveInteger(formData.get('heatUpDays'), 1),
            notes: splitNotes(formData.get('notes')),
            reservations: [],
            statusHistory,
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

    getCurrentActor() {
        const dataManager = this.getDataManager();
        const context = dataManager?.getCurrentUserContext?.() || {};
        const employee = dataManager?.getCurrentUserEmployee?.() || context.linkedEmployee || {};
        return {
            uid: cleanText(context.uid),
            email: cleanText(context.email),
            name: cleanText(employee.name || context.email) || 'Colleague'
        };
    }

    async setPoolState(propertyId, state, { reservationId = '', source = 'manual' } = {}) {
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property || !['on', 'off'].includes(state)) return false;
        if (property.poolState === state) {
            this.showMessage(`${property.propertyName} is already ${state.toUpperCase()}.`, 'info');
            return false;
        }

        const reservation = property.reservations.find((entry) => entry.id === reservationId) || null;
        const actionLabel = state === 'on' ? 'switched on' : 'switched off';
        const reservationSuffix = reservation ? ` for ${reservation.dateRange}` : '';
        const poolNote = `Pool ${actionLabel} ${formatShortDate(this.today)}${reservationSuffix}`;
        const statusHistory = appendPoolStatusHistory(property.statusHistory, {
            previousState: property.poolState,
            state,
            at: new Date().toISOString(),
            planningDate: this.today,
            source,
            note: poolNote,
            actor: this.getCurrentActor(),
            reservation: reservation ? { id: reservation.id, label: reservation.dateRange } : null
        });

        await this.updateProperty(propertyId, {
            poolState: state,
            lastChangeDate: this.today,
            poolNote,
            statusHistory
        });
        this.showMessage(`${property.propertyName} marked ${state.toUpperCase()}${reservationSuffix}.`, 'success');
        return true;
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
            await this.setPoolState(property.id, 'on', {
                reservationId: task.reservation.id,
                source: 'planned_task'
            });
            return;
        }

        if (task.type === 'turn_off') {
            await this.setPoolState(property.id, 'off', {
                reservationId: task.reservation.id,
                source: 'planned_task'
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
            statusHistory: normalizeStatusHistory(property.statusHistory),
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
        const list = document.getElementById('heated-pools-property-status-list');
        if (!list) return;

        const properties = this.properties
            .filter((property) => property.propertyName.toLowerCase().includes(this.searchTerm))
            .map((property) => {
                const nextReservation = findNextReservation(property, this.today);
                const nextTask = findNextTaskForProperty(this.plan.tasks, property.propertyName);
                const latestChange = property.statusHistory.at(-1) || null;
                return `
                    <article class="heated-pools-property" data-property-id="${escapeHtml(property.id)}">
                        <div class="heated-pools-property__identity">
                            <div>
                                <p class="heated-pools-property__label">Current physical state</p>
                                <h4>${escapeHtml(property.propertyName)}</h4>
                            </div>
                            <span class="heated-pools-live-state heated-pools-live-state--${escapeHtml(property.poolState)}">
                                <i aria-hidden="true"></i>${escapeHtml(poolStateLabel(property.poolState))}
                            </span>
                        </div>

                        <div class="heated-pools-property__action">
                            <label>
                                <span>Associate this change with a reservation</span>
                                <select data-status-reservation class="heated-pools-inline-input">
                                    ${reservationAssociationOptions(property, nextReservation)}
                                </select>
                            </label>
                            <div class="heated-pools-power-actions" role="group" aria-label="Set ${escapeHtml(property.propertyName)} pool state">
                                <button type="button" data-pool-state="on" ${property.poolState === 'on' ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
                                    <i class="fas fa-power-off" aria-hidden="true"></i> Turn on
                                </button>
                                <button type="button" data-pool-state="off" ${property.poolState === 'off' ? 'disabled aria-pressed="true"' : 'aria-pressed="false"'}>
                                    Turn off
                                </button>
                            </div>
                            <p class="heated-pools-last-change">
                                ${latestChange
                                    ? `${escapeHtml(formatHistoryTime(latestChange.at))} by ${escapeHtml(actorLabel(latestChange.actor))}${latestChange.reservation?.label ? ` · ${escapeHtml(latestChange.reservation.label)}` : ''}`
                                    : property.lastChangeDate
                                        ? `Last recorded ${escapeHtml(formatDisplayDate(property.lastChangeDate))}`
                                        : 'No state changes recorded yet'}
                            </p>
                        </div>

                        <div class="heated-pools-property__context">
                            <div>
                                <span>Next reservation</span>
                                <strong>${nextReservation ? escapeHtml(nextReservation.dateRange) : 'None scheduled'}</strong>
                                <small>${nextReservation ? escapeHtml(requestLabel(nextReservation)) : 'Add a reservation request below'}</small>
                            </div>
                            <div>
                                <span>Next action</span>
                                <strong>${nextTask ? escapeHtml(formatDisplayDate(nextTask.actionDate)) : 'No action due'}</strong>
                                <small>${nextTask ? escapeHtml(taskLabel(nextTask)) : 'The plan is up to date'}</small>
                            </div>
                        </div>

                        <details class="heated-pools-property__details">
                            <summary>Settings & history <span>${property.statusHistory.length} changes</span></summary>
                            <div class="heated-pools-property__details-body">
                                <div class="heated-pools-property__settings">
                                    <label><span>Heat-up days</span><input data-field="heatUpDays" type="number" min="1" max="5" value="${escapeHtml(property.heatUpDays)}" class="heated-pools-inline-input"></label>
                                    <label><span>Guest charge EUR</span><input data-field="chargeAmount" type="number" step="0.01" value="${escapeHtml(property.chargeAmount ?? '')}" class="heated-pools-inline-input"></label>
                                    <label><span>Owner cost EUR</span><input data-field="ownerCostAmount" type="number" step="0.01" value="${escapeHtml(property.ownerCostAmount ?? '')}" class="heated-pools-inline-input"></label>
                                    <label class="heated-pools-property__settings-wide"><span>Operational note</span><input data-field="poolNote" value="${escapeHtml(property.poolNote || '')}" class="heated-pools-inline-input"></label>
                                </div>
                                <div class="heated-pools-history">
                                    <h5>State history</h5>
                                    ${renderStatusHistory(property.statusHistory)}
                                </div>
                                <button type="button" data-action="delete-property" class="heated-pools-danger-link">Delete property and reservations</button>
                            </div>
                        </details>
                    </article>
                `;
            });

        list.innerHTML = properties.length
            ? properties.join('')
            : '<p class="heated-pools-empty-row">No properties match the search.</p>';

        list.querySelectorAll('[data-pool-state]').forEach((button) => {
            button.addEventListener('click', () => {
                const propertyEl = button.closest('[data-property-id]');
                const propertyId = propertyEl?.dataset.propertyId;
                const reservationId = propertyEl?.querySelector('[data-status-reservation]')?.value || '';
                button.disabled = true;
                this.setPoolState(propertyId, button.dataset.poolState, { reservationId }).catch((error) => {
                    button.disabled = false;
                    console.error('[HeatedPools] state change failed:', error);
                    this.showMessage('Could not save the pool state.', 'error');
                });
            });
        });

        list.querySelectorAll('[data-field]').forEach((input) => {
            input.addEventListener('change', () => {
                const row = input.closest('[data-property-id]');
                const propertyId = row?.dataset.propertyId;
                if (!propertyId) return;
                const field = input.dataset.field;
                const value = field === 'heatUpDays'
                    ? parsePositiveInteger(input.value, 1)
                    : ['chargeAmount', 'ownerCostAmount'].includes(field)
                        ? parseMoney(input.value)
                    : cleanText(input.value);
                this.updateProperty(propertyId, { [field]: value || null }).catch((error) => {
                    console.error('[HeatedPools] update property failed:', error);
                    this.showMessage('Could not update property.', 'error');
                });
            });
        });

        list.querySelectorAll('[data-action="delete-property"]').forEach((button) => {
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

function poolStateLabel(state) {
    return {
        on: 'ON',
        off: 'OFF',
        always_on: 'ALWAYS ON',
        unavailable: 'UNAVAILABLE',
        unknown: 'UNKNOWN'
    }[state] || 'UNKNOWN';
}

function reservationAssociationOptions(property, selectedReservation = null) {
    return [
        '<option value="">General change — no reservation</option>',
        ...property.reservations
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate))
            .map((reservation) => {
                const requested = reservation.heatingRequested === true ? ' · heating requested' : '';
                return `<option value="${escapeHtml(reservation.id)}" ${reservation.id === selectedReservation?.id ? 'selected' : ''}>${escapeHtml(reservation.dateRange)}${requested}</option>`;
            })
    ].join('');
}

function normalizeStatusHistory(history) {
    if (!Array.isArray(history)) return [];
    return history.map((entry) => ({
        id: cleanText(entry?.id),
        previousState: cleanText(entry?.previousState) || 'unknown',
        state: cleanText(entry?.state) || 'unknown',
        at: normalizeDateTime(entry?.at),
        planningDate: cleanText(entry?.planningDate),
        source: cleanText(entry?.source) || 'manual',
        note: cleanText(entry?.note),
        actor: {
            uid: cleanText(entry?.actor?.uid),
            email: cleanText(entry?.actor?.email),
            name: cleanText(entry?.actor?.name || entry?.actor?.email)
        },
        reservation: {
            id: cleanText(entry?.reservation?.id),
            label: cleanText(entry?.reservation?.label)
        }
    })).filter((entry) => entry.at && entry.state);
}

function renderStatusHistory(history = []) {
    if (!history.length) {
        return '<p class="heated-pools-history__empty">No changes yet. The first On/Off action will appear here.</p>';
    }
    return `
        <ol>
            ${history.slice().reverse().map((entry) => `
                <li>
                    <i class="heated-pools-history__dot heated-pools-history__dot--${escapeHtml(entry.state)}" aria-hidden="true"></i>
                    <div>
                        <strong>${escapeHtml(poolStateLabel(entry.previousState))} → ${escapeHtml(poolStateLabel(entry.state))}</strong>
                        <span>${escapeHtml(formatHistoryTime(entry.at))} · ${escapeHtml(actorLabel(entry.actor))}</span>
                        ${entry.reservation?.label ? `<small>Reservation ${escapeHtml(entry.reservation.label)}</small>` : '<small>General property change</small>'}
                        ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}
                    </div>
                </li>
            `).join('')}
        </ol>
    `;
}

function normalizeDateTime(value) {
    if (typeof value?.toDate === 'function') {
        return value.toDate().toISOString();
    }
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
        return new Date(value).toISOString();
    }
    return '';
}

function formatHistoryTime(value) {
    const normalized = normalizeDateTime(value);
    if (!normalized) return 'Unknown time';
    return new Date(normalized).toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function actorLabel(actor = {}) {
    return cleanText(actor.name || actor.email) || 'Colleague';
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
