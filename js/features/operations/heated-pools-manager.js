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
    buildHeatedPoolPropertyDirectory,
    buildHeatedPoolPlan,
    HEATED_POOL_PROPERTY_NAMES,
    inferRemoteControlAvailable,
    summarizePoolProperties
} from './heated-pools-utils.js';
import { i18n, t } from '../../core/i18n.js';

export class HeatedPoolsManager {
    constructor(db, options = {}) {
        this.db = db || null;
        this.getDataManager = typeof options.getDataManager === 'function'
            ? options.getDataManager
            : () => null;
        this.getProperties = typeof options.getProperties === 'function'
            ? options.getProperties
            : () => [];
        this.properties = [];
        this.plan = null;
        this.searchTerm = '';
        this.activeView = 'status';
        this.initialViewResolved = false;
        this.hasReceivedSnapshot = false;
        this.historyPropertyId = '';
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
            this.hasReceivedSnapshot = true;
            this.properties = snapshot.docs
                .map((entry) => this.normalizeProperty({ id: entry.id, ...entry.data() }))
                .sort((a, b) => a.propertyName.localeCompare(b.propertyName));
            this.rebuildPlan();
            this.render();
        }, (error) => {
            console.error('[HeatedPools] listener failed:', error);
            this.showMessage(hp('messages.loadError', 'Could not load heated pool records.'), 'error');
        });
    }

    bindEvents() {
        const todayInput = document.getElementById('heated-pools-today');
        const searchInput = document.getElementById('heated-pools-search');
        const propertyForm = document.getElementById('heated-pools-property-form');
        const reservationForm = document.getElementById('heated-pools-reservation-form');
        const stateForm = document.getElementById('heated-pools-state-form');
        const historyProperty = document.getElementById('heated-pools-history-property');

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
                    this.closeDialogs();
                    this.showMessage(hp('messages.propertyAdded', 'Property added.'), 'success');
                }).catch((error) => {
                    console.error('[HeatedPools] add property failed:', error);
                    this.showMessage(error.message || hp('messages.propertyAddError', 'Could not add property.'), 'error');
                });
            });
        }

        if (reservationForm) {
            reservationForm.addEventListener('submit', (event) => {
                event.preventDefault();
                this.addReservation(new FormData(reservationForm)).then(() => {
                    reservationForm.reset();
                    this.closeDialogs();
                    this.showMessage(hp('messages.reservationAdded', 'Reservation added.'), 'success');
                }).catch((error) => {
                    console.error('[HeatedPools] add reservation failed:', error);
                    this.showMessage(error.message || hp('messages.reservationAddError', 'Could not add reservation.'), 'error');
                });
            });
        }

        if (stateForm) {
            stateForm.addEventListener('submit', (event) => {
                event.preventDefault();
                const formData = new FormData(stateForm);
                this.setPoolState(formData.get('propertyId'), formData.get('state'), {
                    reservationId: formData.get('reservationId'),
                    source: formData.get('source') || 'manual',
                    note: formData.get('stateNote')
                }).then((changed) => {
                    if (changed) this.closeDialogs();
                }).catch((error) => {
                    console.error('[HeatedPools] state change failed:', error);
                    this.showMessage(hp('messages.stateSaveError', 'Could not save the pool state.'), 'error');
                });
            });
        }

        if (historyProperty) {
            historyProperty.addEventListener('change', () => {
                this.historyPropertyId = historyProperty.value;
                this.renderHistory();
            });
        }

        document.querySelectorAll('[data-pool-view]').forEach((button) => {
            button.addEventListener('click', () => {
                this.initialViewResolved = true;
                this.switchView(button.dataset.poolView);
            });
        });

        document.querySelectorAll('[data-open-pool-dialog]').forEach((button) => {
            button.addEventListener('click', () => this.openDialog(button.dataset.openPoolDialog));
        });

        document.querySelectorAll('[data-close-pool-dialog]').forEach((button) => {
            button.addEventListener('click', () => this.closeDialogs());
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeDialogs();
        });

        document.addEventListener('propertiesDataUpdated', () => this.render());
        window.addEventListener('languageChanged', () => {
            this.render();
            this.showMessage(hp('autosave', 'Records save automatically.'), 'info');
        });
    }

    switchView(view) {
        if (!['status', 'reservations', 'tasks', 'history', 'settings'].includes(view)) return;
        this.activeView = view;
        document.querySelectorAll('[data-pool-view]').forEach((button) => {
            const active = button.dataset.poolView === view;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        document.querySelectorAll('[data-pool-panel]').forEach((panel) => {
            const active = panel.dataset.poolPanel === view;
            panel.classList.toggle('hidden', !active);
            panel.classList.toggle('is-active', active);
        });
    }

    openDialog(name) {
        const dialog = document.getElementById(`heated-pools-${name}-dialog`);
        if (!dialog) return;
        if (name === 'property') this.renderPropertyDirectoryOptions();
        dialog.classList.remove('hidden');
        document.body.classList.add('heated-pools-dialog-open');
        window.requestAnimationFrame(() => dialog.querySelector('select, input, textarea, button')?.focus());
    }

    closeDialogs() {
        document.querySelectorAll('.heated-pools-dialog').forEach((dialog) => dialog.classList.add('hidden'));
        document.body.classList.remove('heated-pools-dialog-open');
    }

    openStateDialog(propertyId, state, reservationId = '', source = 'manual') {
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property || !['on', 'off'].includes(state)) return;
        const form = document.getElementById('heated-pools-state-form');
        const summary = document.getElementById('heated-pools-state-summary');
        const reservationSelect = document.getElementById('heated-pools-state-reservation');
        if (!form || !summary || !reservationSelect) return;

        form.elements.propertyId.value = propertyId;
        form.elements.state.value = state;
        form.elements.source.value = source;
        form.elements.stateNote.value = '';
        summary.innerHTML = `<strong>${escapeHtml(property.propertyName)}</strong><span>${escapeHtml(poolStateLabel(property.poolState))} → ${escapeHtml(poolStateLabel(state))}</span>`;
        reservationSelect.innerHTML = reservationAssociationOptions(property, property.reservations.find((entry) => entry.id === reservationId) || findNextReservation(property, this.today));
        this.openDialog('state');
    }

    async addProperty(formData) {
        const propertyName = cleanText(formData.get('propertyName'));
        if (!propertyName) {
            throw new Error(hp('messages.propertyNameRequired', 'Property name is required.'));
        }
        const directoryEntry = this.getApprovedPropertyDirectory()
            .find((entry) => entry.name.toLowerCase() === propertyName.toLowerCase());
        if (!directoryEntry) {
            throw new Error(hp('messages.chooseApprovedProperty', 'Choose a property from the approved directory.'));
        }
        if (this.properties.some((entry) => entry.propertyName.toLowerCase() === propertyName.toLowerCase())) {
            throw new Error(hp('messages.propertyAlreadyConfigured', 'This property is already configured.'));
        }

        const ref = this.getCollectionRef();
        if (!ref) {
            throw new Error(hp('messages.databaseNotReady', 'Database is not ready.'));
        }

        const poolState = formData.get('poolState') || 'unknown';
        const now = new Date().toISOString();
        const operationalNotes = splitNotes(formData.get('notes'));
        const statusHistory = appendPoolStatusHistory([], {
            previousState: 'unknown',
            state: poolState,
            at: now,
            planningDate: this.today,
            source: 'property_created',
            note: operationalNotes.join('; '),
            actor: this.getCurrentActor()
        });

        await addDoc(ref, {
            propertyName,
            propertyDirectoryId: directoryEntry.id || null,
            poolState,
            poolNote: operationalNotes.join('; '),
            lastChangeDate: poolState === 'unknown' ? null : this.today,
            chargeAmount: parseMoney(formData.get('chargeAmount')),
            ownerCostAmount: parseMoney(formData.get('ownerCostAmount')),
            heatUpDays: parsePositiveInteger(formData.get('heatUpDays'), 1),
            remoteControlAvailable: formData.get('remoteControlAvailable') === 'yes',
            notes: operationalNotes,
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
        if (!confirm(hp('messages.confirmDeleteProperty', 'Delete this heated pool property and its reservations?'))) return;
        await deleteDoc(doc(this.db, 'heatedPools', propertyId));
    }

    getCurrentActor() {
        const dataManager = this.getDataManager();
        const context = dataManager?.getCurrentUserContext?.() || {};
        const employee = dataManager?.getCurrentUserEmployee?.() || context.linkedEmployee || {};
        return {
            uid: cleanText(context.uid),
            email: cleanText(context.email),
            name: cleanText(employee.name || context.email) || hp('common.colleague', 'Colleague')
        };
    }

    getApprovedPropertyDirectory() {
        return buildHeatedPoolPropertyDirectory(this.getProperties(), HEATED_POOL_PROPERTY_NAMES);
    }

    async setPoolState(propertyId, state, { reservationId = '', source = 'manual', note = '' } = {}) {
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property || !['on', 'off'].includes(state)) return false;
        const reservation = property.reservations.find((entry) => entry.id === reservationId) || null;
        const plannedTaskType = source === 'planned_task' && reservation
            ? state === 'on' ? 'turn_on' : 'turn_off'
            : '';
        const completedReservations = plannedTaskType
            ? updateReservationTaskActivity(
                property.reservations,
                reservation.id,
                'taskCompletions',
                plannedTaskType,
                this.createTaskActivity()
            )
            : property.reservations;

        if (property.poolState === state) {
            if (plannedTaskType) {
                await this.updateProperty(propertyId, { reservations: completedReservations });
                this.showMessage(hp('messages.taskCompleted', '{{property}} {{state}} task completed for {{reservation}}.', {
                    property: property.propertyName,
                    state: poolStateLabel(state),
                    reservation: reservation.dateRange
                }), 'success');
                return true;
            }
            this.showMessage(hp('messages.alreadyState', '{{property}} is already {{state}}.', {
                property: property.propertyName,
                state: poolStateLabel(state)
            }), 'info');
            return false;
        }

        const reservationSuffix = reservation
            ? hp('messages.forReservation', ' for {{reservation}}', { reservation: reservation.dateRange })
            : '';
        const defaultNote = hp(
            state === 'on' ? 'messages.defaultOnNote' : 'messages.defaultOffNote',
            state === 'on' ? 'Pool switched on {{date}}{{reservation}}' : 'Pool switched off {{date}}{{reservation}}',
            { date: formatShortDate(this.today), reservation: reservationSuffix }
        );
        const poolNote = cleanText(note) || defaultNote;
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
            statusHistory,
            ...(plannedTaskType ? { reservations: completedReservations } : {})
        });
        this.showMessage(hp('messages.markedState', '{{property}} marked {{state}}{{reservation}}.', {
            property: property.propertyName,
            state: poolStateLabel(state),
            reservation: reservationSuffix
        }), 'success');
        return true;
    }

    createTaskActivity() {
        return {
            at: new Date().toISOString(),
            planningDate: this.today,
            actor: this.getCurrentActor()
        };
    }

    async addReservation(formData) {
        const propertyId = formData.get('propertyId');
        const property = this.properties.find((entry) => entry.id === propertyId);
        if (!property) {
            throw new Error(hp('messages.choosePropertyFirst', 'Choose a property first.'));
        }

        const startDate = formData.get('startDate');
        const endDate = formData.get('endDate');
        if (!startDate || !endDate) {
            throw new Error(hp('messages.datesRequired', 'Start and end dates are required.'));
        }
        if (endDate < startDate) {
            throw new Error(hp('messages.endDateInvalid', 'End date must be after the start date.'));
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
        if (!confirm(hp('messages.confirmDeleteReservation', 'Delete this reservation?'))) return;

        await this.updateProperty(propertyId, {
            reservations: property.reservations.filter((reservation) => reservation.id !== reservationId)
        });
    }

    async completeTask(task) {
        const property = this.properties.find((entry) => entry.id === task.propertyId)
            || this.properties.find((entry) => entry.propertyName === task.propertyName);
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
                paymentStatus: 'yes',
                taskCompletions: {
                    ...task.reservation.taskCompletions,
                    payment_check: this.createTaskActivity()
                }
            });
            this.showMessage(hp('messages.paymentConfirmed', '{{property}} payment confirmed.', { property: property.propertyName }), 'success');
            return;
        }

        if (task.type === 'avantio_check') {
            await this.updateReservation(property.id, task.reservation.id, {
                avantioStatus: 'yes',
                taskCompletions: {
                    ...task.reservation.taskCompletions,
                    avantio_check: this.createTaskActivity()
                }
            });
            this.showMessage(hp('messages.avantioConfirmed', '{{property}} Avantio update confirmed.', { property: property.propertyName }), 'success');
        }
    }

    async claimTask(task) {
        const property = this.properties.find((entry) => entry.id === task.propertyId)
            || this.properties.find((entry) => entry.propertyName === task.propertyName);
        const reservation = property?.reservations.find((entry) => entry.id === task.reservation.id);
        if (!property || !reservation) return;

        const existingClaim = reservation.taskClaims?.[task.type];
        if (existingClaim?.actor?.uid || existingClaim?.actor?.email || existingClaim?.actor?.name) {
            this.showMessage(hp('messages.alreadyClaimed', '{{task}} is already claimed by {{name}}.', {
                task: taskLabel(task),
                name: actorLabel(existingClaim.actor)
            }), 'info');
            return;
        }

        await this.updateReservation(property.id, reservation.id, {
            taskClaims: {
                ...reservation.taskClaims,
                [task.type]: this.createTaskActivity()
            }
        });
        this.showMessage(hp('messages.taskClaimed', '{{task}} claimed for {{property}}.', {
            task: taskLabel(task),
            property: property.propertyName
        }), 'success');
    }

    normalizeProperty(property) {
        return {
            id: property.id,
            propertyName: cleanText(property.propertyName || property.name),
            propertyDirectoryId: cleanText(property.propertyDirectoryId),
            poolState: property.poolState || 'unknown',
            poolNote: cleanText(property.poolNote),
            lastChangeDate: property.lastChangeDate || null,
            chargeAmount: property.chargeAmount ?? null,
            ownerCostAmount: property.ownerCostAmount ?? null,
            heatUpDays: parsePositiveInteger(property.heatUpDays, 1),
            remoteControlAvailable: typeof property.remoteControlAvailable === 'boolean'
                ? property.remoteControlAvailable
                : inferRemoteControlAvailable(property.poolNote, property.notes),
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
                    notes: cleanText(reservation.notes),
                    taskClaims: normalizeTaskActivityMap(reservation.taskClaims),
                    taskCompletions: normalizeTaskActivityMap(reservation.taskCompletions)
                })).filter((reservation) => reservation.startDate && reservation.endDate)
                : []
        };
    }

    rebuildPlan() {
        const planningProperties = this.properties.map((property) => ({
            ...property,
            notes: property.notes
        }));
        this.plan = buildHeatedPoolPlan(planningProperties, {
            today: this.today,
            horizonDays: 14
        });
    }

    render() {
        const emptyState = document.getElementById('heated-pools-empty');
        const propertySelect = document.getElementById('heated-pools-reservation-property');

        if (propertySelect) {
            propertySelect.innerHTML = [
                `<option value="">${escapeHtml(hp('fields.chooseProperty', 'Choose property'))}</option>`,
                ...this.properties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.propertyName)}</option>`)
            ].join('');
        }

        emptyState?.classList.toggle('hidden', Boolean(this.properties.length));
        if (!this.initialViewResolved && this.hasReceivedSnapshot) {
            const dueCount = (this.plan?.overdue?.length || 0) + (this.plan?.todayTasks?.length || 0);
            this.activeView = dueCount > 0 ? 'tasks' : 'status';
            this.initialViewResolved = true;
        }
        this.renderNavigationCounts();
        this.renderTaskLanes();
        this.renderPropertyTable();
        this.renderReservationTable();
        this.renderHistory();
        this.renderSettings();
        this.renderPropertyDirectoryOptions();
        this.switchView(this.activeView);
    }

    renderNavigationCounts() {
        const summary = summarizePoolProperties(this.properties);
        const plan = this.plan || buildHeatedPoolPlan([], { today: this.today });
        const counts = {
            status: summary.properties,
            reservations: summary.reservations,
            tasks: plan.overdue.length + plan.todayTasks.length + plan.upcoming.length
        };
        Object.entries(counts).forEach(([key, value]) => {
            const target = document.querySelector(`[data-pool-count="${key}"]`);
            if (target) target.textContent = String(value);
        });
    }

    renderTaskLanes() {
        const lanesEl = document.getElementById('heated-pools-task-lanes');
        if (!lanesEl) return;

        const lanes = [
            { title: hp('tasks.lanes.overdue', 'Overdue'), tasks: this.filterTasks(this.plan.overdue), tone: 'danger' },
            { title: hp('tasks.lanes.today', 'Today'), tasks: this.filterTasks(this.plan.todayTasks), tone: 'warning' },
            { title: hp('tasks.lanes.next14', 'Next 14 days'), tasks: this.filterTasks(this.plan.upcoming), tone: 'info' }
        ];
        const completedTasks = this.filterTasks(this.plan.completed);
        if (completedTasks.length) {
            lanes.push({ title: hp('tasks.lanes.completed', 'Completed'), tasks: completedTasks, tone: 'success' });
        }

        lanesEl.innerHTML = lanes.map((lane) => `
            <section class="heated-pools-lane heated-pools-lane--${lane.tone}">
                <div class="heated-pools-lane__header">
                    <h3>${escapeHtml(lane.title)}</h3>
                    <span>${lane.tasks.length}</span>
                </div>
                <div class="heated-pools-lane__body">
                    ${lane.tasks.length ? lane.tasks.map((task) => this.renderTask(task)).join('') : `<p class="heated-pools-muted">${escapeHtml(hp('tasks.lanes.empty', 'No actions in this lane.'))}</p>`}
                </div>
            </section>
        `).join('');

        lanesEl.querySelectorAll('[data-task-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const task = this.plan.tasks.find((entry) => entry.id === button.dataset.taskId);
                if (!task) return;
                if (['payment_check', 'avantio_check'].includes(task.type)) {
                    this.completeTask(task).catch((error) => {
                        console.error('[HeatedPools] complete task failed:', error);
                        this.showMessage(hp('messages.completeTaskError', 'Could not complete task.'), 'error');
                    });
                    return;
                }
                const property = this.properties.find((entry) => entry.id === task.propertyId)
                    || this.properties.find((entry) => entry.propertyName === task.propertyName);
                if (property) this.openStateDialog(property.id, task.type === 'turn_on' ? 'on' : 'off', task.reservation.id, 'planned_task');
            });
        });

        lanesEl.querySelectorAll('[data-claim-task-id]').forEach((button) => {
            button.addEventListener('click', () => {
                const task = this.plan.tasks.find((entry) => entry.id === button.dataset.claimTaskId);
                if (!task) return;
                this.claimTask(task).catch((error) => {
                    console.error('[HeatedPools] claim task failed:', error);
                    this.showMessage(hp('messages.claimTaskError', 'Could not claim task.'), 'error');
                });
            });
        });
    }

    renderTask(task) {
        const instructions = taskInstructions(task);
        const completed = task.status === 'done';
        const activity = completed
            ? `<small class="heated-pools-task__activity heated-pools-task__activity--complete"><i class="fas fa-check" aria-hidden="true"></i>${escapeHtml(taskCompletionLabel(task.completion))}</small>`
            : task.claim
                ? `<small class="heated-pools-task__activity"><i class="fas fa-user" aria-hidden="true"></i>${escapeHtml(hp('tasks.claimedBy', 'Claimed by {{name}}', { name: actorLabel(task.claim.actor) }))}</small>`
                : `<button type="button" data-claim-task-id="${escapeHtml(task.id)}" class="heated-pools-claim-action"><i class="far fa-circle-user" aria-hidden="true"></i> ${escapeHtml(hp('tasks.actions.claim', 'Claim'))}</button>`;
        return `
            <article class="heated-pools-task ${completed ? 'heated-pools-task--complete' : ''}">
                <div class="heated-pools-task__content">
                    <p class="heated-pools-task__date">${formatDisplayDate(task.actionDate)}</p>
                    <h4>${escapeHtml(taskLabel(task))}</h4>
                    <p>${escapeHtml(task.propertyName)} - ${escapeHtml(task.reservation.dateRange)}</p>
                    ${instructions ? `<p class="heated-pools-task__instructions"><i class="fas fa-circle-info" aria-hidden="true"></i>${escapeHtml(instructions)}</p>` : ''}
                </div>
                <div class="heated-pools-task__meta">
                    <span>${escapeHtml(statusLabel(task.status))}</span>
                    ${activity}
                    ${completed ? '' : `<button type="button" data-task-id="${escapeHtml(task.id)}" class="heated-pools-small-action">${escapeHtml(taskActionLabel(task))}</button>`}
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
                const latestChange = property.statusHistory.at(-1) || null;
                return `
                    <article class="heated-pools-status-row" data-property-id="${escapeHtml(property.id)}">
                        <div class="heated-pools-status-row__property">
                            <div class="heated-pools-status-row__identity">
                                <h4>${escapeHtml(property.propertyName)}</h4>
                                <span class="heated-pools-remote-capability ${property.remoteControlAvailable ? 'is-available' : ''}">
                                    <i class="fas ${property.remoteControlAvailable ? 'fa-wifi' : 'fa-person-walking'}" aria-hidden="true"></i>
                                    ${escapeHtml(property.remoteControlAvailable ? hp('status.remote', 'Remote on/off') : hp('status.onsite', 'On-site only'))}
                                </span>
                            </div>
                            <span class="heated-pools-live-state heated-pools-live-state--${escapeHtml(property.poolState)}">
                                <i aria-hidden="true"></i>${escapeHtml(poolStateLabel(property.poolState))}
                            </span>
                        </div>
                        <div class="heated-pools-status-row__last">
                            <span>${escapeHtml(hp('status.lastChange', 'Last change'))}</span>
                            <strong>${latestChange ? escapeHtml(formatHistoryTime(latestChange.at)) : property.lastChangeDate ? escapeHtml(formatDisplayDate(property.lastChangeDate)) : escapeHtml(hp('status.notRecorded', 'Not recorded'))}</strong>
                            <small>${latestChange ? escapeHtml(hp('status.by', 'by {{name}}', { name: actorLabel(latestChange.actor) })) : escapeHtml(hp('status.noColleague', 'No colleague recorded'))}</small>
                        </div>
                        <div class="heated-pools-status-row__reservation">
                            <span>${escapeHtml(hp('status.nextReservation', 'Next reservation'))}</span>
                            <strong>${nextReservation ? escapeHtml(nextReservation.dateRange) : escapeHtml(hp('status.noneScheduled', 'None scheduled'))}</strong>
                            <small>${nextReservation ? escapeHtml(requestLabel(nextReservation)) : escapeHtml(hp('status.noGuestRequest', 'No guest request'))}</small>
                        </div>
                        <div class="heated-pools-status-row__actions heated-pools-power-actions" role="group" aria-label="${escapeHtml(hp('status.setStateLabel', 'Set {{property}} pool state', { property: property.propertyName }))}">
                            ${property.poolState !== 'on' ? `<button type="button" data-pool-state="on"><i class="fas fa-power-off" aria-hidden="true"></i> ${escapeHtml(hp('status.turnOn', 'Turn on'))}</button>` : ''}
                            ${property.poolState !== 'off' ? `<button type="button" data-pool-state="off">${escapeHtml(hp('status.turnOff', 'Turn off'))}</button>` : ''}
                        </div>
                    </article>
                `;
            });

        list.innerHTML = properties.length
            ? properties.join('')
            : `<p class="heated-pools-empty-row">${escapeHtml(hp('status.noMatches', 'No properties match the search.'))}</p>`;

        list.querySelectorAll('[data-pool-state]').forEach((button) => {
            button.addEventListener('click', () => {
                const propertyEl = button.closest('[data-property-id]');
                const propertyId = propertyEl?.dataset.propertyId;
                this.openStateDialog(propertyId, button.dataset.poolState);
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
                    <td><button type="button" data-action="delete-reservation" class="heated-pools-danger-link">${escapeHtml(hp('reservations.delete', 'Delete'))}</button></td>
                </tr>
            `);

        body.innerHTML = rows.length
            ? rows.join('')
            : `<tr><td colspan="8" class="heated-pools-empty-row">${escapeHtml(hp('reservations.empty', 'No active reservations yet.'))}</td></tr>`;

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
                    this.showMessage(hp('messages.reservationUpdateError', 'Could not update reservation.'), 'error');
                });
            });
        });

        body.querySelectorAll('[data-action="delete-reservation"]').forEach((button) => {
            button.addEventListener('click', () => {
                const row = button.closest('[data-property-id]');
                this.deleteReservation(row?.dataset.propertyId, row?.dataset.reservationId).catch((error) => {
                    console.error('[HeatedPools] delete reservation failed:', error);
                    this.showMessage(hp('messages.reservationDeleteError', 'Could not delete reservation.'), 'error');
                });
            });
        });
    }

    renderHistory() {
        const list = document.getElementById('heated-pools-history-list');
        const propertyFilter = document.getElementById('heated-pools-history-property');
        if (!list) return;

        if (propertyFilter) {
            propertyFilter.innerHTML = [
                `<option value="">${escapeHtml(hp('views.history.allProperties', 'All properties'))}</option>`,
                ...this.properties.map((property) => `<option value="${escapeHtml(property.id)}" ${property.id === this.historyPropertyId ? 'selected' : ''}>${escapeHtml(property.propertyName)}</option>`)
            ].join('');
        }

        const entries = this.properties
            .filter((property) => !this.historyPropertyId || property.id === this.historyPropertyId)
            .filter((property) => !this.searchTerm || property.propertyName.toLowerCase().includes(this.searchTerm))
            .flatMap((property) => property.statusHistory.map((entry) => ({ property, entry })))
            .sort((a, b) => b.entry.at.localeCompare(a.entry.at));

        list.innerHTML = entries.length ? entries.map(({ property, entry }) => `
            <article class="heated-pools-history-row">
                <i class="heated-pools-history__dot heated-pools-history__dot--${escapeHtml(entry.state)}" aria-hidden="true"></i>
                <div><strong>${escapeHtml(property.propertyName)}</strong><span>${escapeHtml(poolStateLabel(entry.previousState))} → ${escapeHtml(poolStateLabel(entry.state))}</span></div>
                <div><strong>${escapeHtml(formatHistoryTime(entry.at))}</strong><span>${escapeHtml(actorLabel(entry.actor))}</span></div>
                <div><strong>${escapeHtml(entry.reservation?.label
                    ? hp('history.reservation', 'Reservation {{label}}', { label: entry.reservation.label })
                    : hp('history.generalChange', 'General property change'))}</strong><span>${escapeHtml(localizeSystemNote(entry.note) || hp('history.noNote', 'No note'))}</span></div>
            </article>
        `).join('') : `<p class="heated-pools-empty-row">${escapeHtml(hp('history.empty', 'No state changes match these filters.'))}</p>`;
    }

    renderSettings() {
        const list = document.getElementById('heated-pools-settings-list');
        if (!list) return;
        list.innerHTML = this.properties.length ? this.properties.map((property) => `
            <article class="heated-pools-setting-row" data-property-id="${escapeHtml(property.id)}">
                <div><strong>${escapeHtml(property.propertyName)}</strong><span>${escapeHtml(poolStateLabel(property.poolState))}</span></div>
                <label><span>${escapeHtml(hp('fields.heatUpDays', 'Heat-up days'))}</span><input data-setting-field="heatUpDays" type="number" min="1" max="5" value="${escapeHtml(property.heatUpDays)}"></label>
                <label><span>${escapeHtml(hp('fields.guestCharge', 'Guest charge EUR'))}</span><input data-setting-field="chargeAmount" type="number" step="0.01" value="${escapeHtml(property.chargeAmount ?? '')}"></label>
                <label><span>${escapeHtml(hp('fields.ownerCost', 'Owner cost EUR'))}</span><input data-setting-field="ownerCostAmount" type="number" step="0.01" value="${escapeHtml(property.ownerCostAmount ?? '')}"></label>
                <label><span>${escapeHtml(hp('fields.remoteControl', 'Remote on/off'))}</span><select data-setting-field="remoteControlAvailable">${remoteControlOptions(property.remoteControlAvailable)}</select></label>
                <label class="heated-pools-setting-row__note"><span>${escapeHtml(hp('fields.taskInstructions', 'Task instructions'))}</span><input data-setting-field="poolNote" value="${escapeHtml(localizeSystemNote(property.poolNote || property.notes.join('; ')))}" placeholder="${escapeHtml(hp('fields.taskInstructionsPlaceholder', 'Remote control, access steps, owner contact...'))}"></label>
                <button type="button" data-action="delete-property" class="heated-pools-danger-link">${escapeHtml(hp('settings.remove', 'Remove'))}</button>
            </article>
        `).join('') : `<p class="heated-pools-empty-row">${escapeHtml(hp('settings.empty', 'No heated-pool properties configured yet.'))}</p>`;

        list.querySelectorAll('[data-setting-field]').forEach((input) => {
            input.addEventListener('change', () => {
                const propertyId = input.closest('[data-property-id]')?.dataset.propertyId;
                const field = input.dataset.settingField;
                const value = field === 'remoteControlAvailable'
                    ? input.value === 'yes'
                    : field === 'heatUpDays'
                    ? parsePositiveInteger(input.value, 1)
                    : ['chargeAmount', 'ownerCostAmount'].includes(field)
                        ? parseMoney(input.value)
                        : cleanText(input.value);
                const updates = field === 'poolNote'
                    ? { poolNote: value, notes: splitNotes(value) }
                    : { [field]: value ?? null };
                this.updateProperty(propertyId, updates).catch((error) => {
                    console.error('[HeatedPools] settings update failed:', error);
                    this.showMessage(hp('messages.settingsUpdateError', 'Could not update property settings.'), 'error');
                });
            });
        });

        list.querySelectorAll('[data-action="delete-property"]').forEach((button) => {
            button.addEventListener('click', () => {
                const propertyId = button.closest('[data-property-id]')?.dataset.propertyId;
                this.deleteProperty(propertyId).catch((error) => {
                    console.error('[HeatedPools] delete property failed:', error);
                    this.showMessage(hp('messages.propertyRemoveError', 'Could not remove property.'), 'error');
                });
            });
        });
    }

    renderPropertyDirectoryOptions() {
        const directory = this.getApprovedPropertyDirectory();
        const configured = new Set(this.properties.map((property) => property.propertyName.toLowerCase()));
        const available = directory.filter((entry) => !configured.has(entry.name.toLowerCase()));
        const select = document.getElementById('heated-pools-property-name');
        const list = document.getElementById('heated-pools-approved-list');

        if (select) {
            select.innerHTML = [
                `<option value="">${escapeHtml(directory.length
                    ? hp('fields.chooseProperty', 'Choose property')
                    : hp('directory.loading', 'Protected property directory is loading'))}</option>`,
                ...available.map((entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</option>`)
            ].join('');
            select.disabled = !available.length;
        }

        if (!list) return;
        const directoryNames = new Set(directory.map((entry) => entry.name.toLowerCase()));
        list.innerHTML = HEATED_POOL_PROPERTY_NAMES.map((name) => {
            const isConfigured = configured.has(name.toLowerCase());
            const isAvailable = directoryNames.has(name.toLowerCase());
            const label = isConfigured
                ? hp('directory.configured', 'Configured')
                : isAvailable
                    ? hp('directory.available', 'Available')
                    : hp('directory.missing', 'Not in property directory');
            return `<div class="heated-pools-approved-row"><span>${escapeHtml(name)}</span><small data-state="${isConfigured ? 'configured' : isAvailable ? 'available' : 'missing'}">${escapeHtml(label)}</small>${isAvailable && !isConfigured ? `<button type="button" data-add-approved-property="${escapeHtml(name)}">${escapeHtml(hp('directory.add', 'Add'))}</button>` : ''}</div>`;
        }).join('');

        list.querySelectorAll('[data-add-approved-property]').forEach((button) => {
            button.addEventListener('click', () => {
                this.openDialog('property');
                const propertyName = document.getElementById('heated-pools-property-name');
                if (propertyName) propertyName.value = button.dataset.addApprovedProperty;
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

function findNextReservation(property, today) {
    return property.reservations
        .filter((reservation) => reservation.endDate >= today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] || null;
}

function taskLabel(task) {
    if (task.type === 'turn_on') {
        return task.leadDays > 1
            ? hp('tasks.labels.switchOnAhead', 'Switch pool on ({{days}} days before)', { days: task.leadDays })
            : hp('tasks.labels.switchOn', 'Switch pool on');
    }
    if (task.type === 'turn_off') {
        return hp('tasks.labels.switchOff', 'Switch pool off');
    }
    if (task.type === 'avantio_check') {
        return hp('tasks.labels.confirmAvantio', 'Confirm Avantio update');
    }
    return hp('tasks.labels.checkPayment', 'Check heated pool payment');
}

function taskActionLabel(task) {
    if (task.type === 'payment_check') return hp('tasks.actions.confirmPaid', 'Confirm paid');
    if (task.type === 'avantio_check') return hp('tasks.actions.confirmAvantio', 'Confirm Avantio');
    return hp('tasks.actions.markDone', 'Mark done');
}

function taskInstructions(task) {
    const remoteInstruction = ['turn_on', 'turn_off'].includes(task.type) && task.remoteControlAvailable
        ? hp('tasks.remoteInstruction', 'Remote on/off available — no property visit needed')
        : '';
    return [...new Set([remoteInstruction, task.poolNote, ...(Array.isArray(task.notes) ? task.notes : [])]
        .map(cleanText)
        .map(localizeSystemNote)
        .filter(Boolean))]
        .join(' · ');
}

function taskCompletionLabel(activity) {
    const who = actorLabel(activity?.actor);
    const normalizedTime = normalizeDateTime(activity?.at);
    if (normalizedTime) {
        return hp('tasks.completedBy', 'Completed by {{name}} · {{date}}', {
            name: who,
            date: formatHistoryTime(normalizedTime)
        });
    }
    return activity?.legacy
        ? hp('tasks.previouslyCompleted', 'Previously completed')
        : hp('tasks.completedByNoDate', 'Completed by {{name}}', { name: who });
}

function statusLabel(status) {
    if (status === 'overdue') return hp('tasks.status.overdue', 'Overdue');
    if (status === 'today') return hp('tasks.status.today', 'Due today');
    if (status === 'upcoming') return hp('tasks.status.upcoming', 'Upcoming');
    if (status === 'done') return hp('tasks.status.done', 'Completed');
    return hp('tasks.status.later', 'Later');
}

function poolStateLabel(state) {
    const fallback = {
        on: 'ON',
        off: 'OFF',
        always_on: 'ALWAYS ON',
        unavailable: 'UNAVAILABLE',
        unknown: 'UNKNOWN'
    }[state] || 'UNKNOWN';
    return hp(`states.${state || 'unknown'}`, fallback);
}

function reservationAssociationOptions(property, selectedReservation = null) {
    return [
        `<option value="">${escapeHtml(hp('association.general', 'General change — no reservation'))}</option>`,
        ...property.reservations
            .slice()
            .sort((a, b) => b.startDate.localeCompare(a.startDate))
            .map((reservation) => {
                const requested = reservation.heatingRequested === true
                    ? ` · ${hp('association.heatingRequested', 'heating requested')}`
                    : '';
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

function normalizeTaskActivityMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.entries(value).reduce((activities, [taskType, activity]) => {
        const normalized = normalizeTaskActivity(activity);
        if (normalized) activities[taskType] = normalized;
        return activities;
    }, {});
}

function normalizeTaskActivity(activity) {
    if (!activity || typeof activity !== 'object') return null;
    const normalized = {
        at: normalizeDateTime(activity.at) || cleanText(activity.at),
        planningDate: cleanText(activity.planningDate),
        actor: {
            uid: cleanText(activity.actor?.uid),
            email: cleanText(activity.actor?.email),
            name: cleanText(activity.actor?.name || activity.actor?.email)
        }
    };
    return normalized.at || normalized.planningDate || normalized.actor.uid || normalized.actor.email || normalized.actor.name
        ? normalized
        : null;
}

function updateReservationTaskActivity(reservations, reservationId, bucket, taskType, activity) {
    return reservations.map((reservation) => reservation.id === reservationId
        ? {
            ...reservation,
            [bucket]: {
                ...(reservation[bucket] || {}),
                [taskType]: activity
            }
        }
        : reservation);
}

function renderStatusHistory(history = []) {
    if (!history.length) {
        return `<p class="heated-pools-history__empty">${escapeHtml(hp('history.noChanges', 'No changes yet. The first On/Off action will appear here.'))}</p>`;
    }
    return `
        <ol>
            ${history.slice().reverse().map((entry) => `
                <li>
                    <i class="heated-pools-history__dot heated-pools-history__dot--${escapeHtml(entry.state)}" aria-hidden="true"></i>
                    <div>
                        <strong>${escapeHtml(poolStateLabel(entry.previousState))} → ${escapeHtml(poolStateLabel(entry.state))}</strong>
                        <span>${escapeHtml(formatHistoryTime(entry.at))} · ${escapeHtml(actorLabel(entry.actor))}</span>
                        ${entry.reservation?.label
                            ? `<small>${escapeHtml(hp('history.reservation', 'Reservation {{label}}', { label: entry.reservation.label }))}</small>`
                            : `<small>${escapeHtml(hp('history.generalChange', 'General property change'))}</small>`}
                        ${entry.note ? `<p>${escapeHtml(localizeSystemNote(entry.note))}</p>` : ''}
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
    if (!normalized) return hp('history.unknownTime', 'Unknown time');
    return new Date(normalized).toLocaleString(i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function actorLabel(actor = {}) {
    return cleanText(actor.name || actor.email) || hp('common.colleague', 'Colleague');
}

function poolStateOptions(current) {
    return [
        ['unknown', poolStateLabel('unknown')],
        ['off', poolStateLabel('off')],
        ['on', poolStateLabel('on')],
        ['always_on', poolStateLabel('always_on')],
        ['unavailable', poolStateLabel('unavailable')]
    ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function booleanOptions(current) {
    return [
        ['blank', hp('options.notFilled', 'Not filled')],
        ['yes', hp('options.yes', 'Yes')],
        ['no', hp('options.no', 'No')]
    ].map(([value, label]) => {
        const selected = value === 'yes'
            ? current === true
            : value === 'no'
                ? current === false
                : current === null;
        return `<option value="${value}" ${selected ? 'selected' : ''}>${label}</option>`;
    }).join('');
}

function remoteControlOptions(current) {
    return [
        ['no', hp('fields.remoteNo', 'No — on-site only')],
        ['yes', hp('fields.remoteYes', 'Yes — available remotely')]
    ].map(([value, label]) => `<option value="${value}" ${Boolean(current) === (value === 'yes') ? 'selected' : ''}>${label}</option>`).join('');
}

function statusOptions(current) {
    return [
        ['blank', hp('options.notFilled', 'Not filled')],
        ['yes', hp('options.yes', 'Yes')],
        ['no', hp('options.no', 'No')],
        ['waiting', hp('options.waiting', 'Waiting')]
    ].map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('');
}

function requestLabel(reservation) {
    if (reservation.heatingRequested === true) {
        return reservation.paymentStatus === 'yes'
            ? hp('reservations.requestedPaid', 'Requested and paid')
            : hp('reservations.requestedPending', 'Requested, payment pending');
    }
    if (reservation.heatingRequested === false) {
        return hp('reservations.notRequested', 'No heating requested');
    }
    return hp('reservations.notFilled', 'Heating status not filled');
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

function localizeSystemNote(value = '') {
    const note = cleanText(value);
    if (!note) return '';

    const englishState = note.match(/^Pool switched (on|off) (\d{1,2}\/\d{1,2})(?: for (.+))?$/i);
    const portugueseState = note.match(/^Piscina (ligada|desligada) em (\d{1,2}\/\d{1,2})(?: para a reserva (.+))?$/i);
    const match = englishState || portugueseState;
    if (match) {
        const state = englishState
            ? match[1].toLowerCase()
            : match[1].toLowerCase() === 'ligada' ? 'on' : 'off';
        const reservation = match[3]
            ? hp('messages.forReservation', ' for {{reservation}}', { reservation: match[3] })
            : '';
        return hp(
            state === 'on' ? 'messages.defaultOnNote' : 'messages.defaultOffNote',
            state === 'on' ? 'Pool switched on {{date}}{{reservation}}' : 'Pool switched off {{date}}{{reservation}}',
            { date: match[2], reservation }
        );
    }

    const heatDays = note.match(/^(\d+) days? to heat$/i) || note.match(/^(\d+) dias? para aquecer$/i);
    if (heatDays) {
        return hp('tasks.heatDays', '{{days}} days to heat', { days: heatDays[1] });
    }

    return note;
}

function hp(key, fallback, replacements = {}) {
    const translationKey = `heatedPools.${key}`;
    const translated = t(translationKey, replacements);
    if (translated !== translationKey) return translated;

    return Object.entries(replacements).reduce(
        (value, [placeholder, replacement]) => value.replaceAll(`{{${placeholder}}}`, String(replacement)),
        fallback
    );
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
