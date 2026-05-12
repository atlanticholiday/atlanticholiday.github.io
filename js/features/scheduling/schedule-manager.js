import { i18n, t } from '../../core/i18n.js';
import { SCHEDULE_VIEWS } from './schedule-view-config.js';

export class ScheduleManager {
    constructor(dataManager, uiManager) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add Employee Modal listeners removed - moved to StaffManager


        // Book Vacation Modal Listeners
        const bookVacationClose = document.getElementById('book-vacation-close-btn');
        const bookVacationCancel = document.getElementById('book-vacation-cancel-btn');
        const bookVacationSave = document.getElementById('book-vacation-save-btn');
        const bookVacationModal = document.getElementById('book-vacation-modal');
        const bookVacationDelete = document.getElementById('book-vacation-delete-btn');

        const closeBookVacationModal = () => {
            if (bookVacationModal) bookVacationModal.classList.add('hidden');
            document.getElementById('vacation-start-date').value = '';
            document.getElementById('vacation-end-date').value = '';
        };

        if (bookVacationClose) bookVacationClose.addEventListener('click', closeBookVacationModal);
        if (bookVacationCancel) bookVacationCancel.addEventListener('click', closeBookVacationModal);
        if (bookVacationDelete) bookVacationDelete.addEventListener('click', () => this.handleDeleteVacation());
        if (bookVacationSave) bookVacationSave.addEventListener('click', () => this.handleBookVacation());

        // View Toggles
        SCHEDULE_VIEWS.forEach(({ id, view }) => {
            const btn = document.getElementById(id);
            if (btn) {
                // Clone to remove old listeners
                const newBtn = btn.cloneNode(true);
                btn.replaceWith(newBtn);
                newBtn.addEventListener('click', () => this.uiManager.switchView(view));
            }
        });
    }

    // addEmployee method moved to StaffManager


    renderVacationPlanner() {
        const container = document.getElementById('vacation-planner-container');
        if (!container) return;

        const employees = this.dataManager.getActiveEmployees();
        const vacationEntries = this.dataManager.getSharedVacationEntries();
        const events = [];
        const employeeColors = {};
        const todayKey = this.getLocalDateKey(new Date());

        // Generate consistent colors for employees
        const getEmployeeColor = (name) => {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            const h = Math.abs(hash % 360);
            return `hsl(${h}, 70%, 45%)`;
        };

        employees.forEach(emp => {
            employeeColors[emp.id] = getEmployeeColor(emp.name);
        });

        vacationEntries.forEach((vacation) => {
            const endPlusOne = new Date(vacation.endDate);
            endPlusOne.setDate(endPlusOne.getDate() + 1);
            events.push({
                title: vacation.employeeName,
                start: vacation.startDate,
                end: endPlusOne.toISOString().split('T')[0],
                allDay: true,
                backgroundColor: employeeColors[vacation.employeeId],
                borderColor: 'transparent',
                extendedProps: {
                    employeeId: vacation.employeeId,
                    vacationId: vacation.id,
                    endDate: vacation.endDate
                }
            });
        });

        const upcomingVacations = vacationEntries
            .map((vacation) => ({
                ...vacation,
                employeeColor: employeeColors[vacation.employeeId]
            }))
            .filter((vacation) => vacation.endDate >= todayKey)
            .sort((left, right) => left.startDate.localeCompare(right.startDate));
        const awayTodayCount = vacationEntries.filter((vacation) => vacation.startDate <= todayKey && vacation.endDate >= todayKey).length;

        container.innerHTML = `
            <div class="vacation-planner-shell">
                <section class="vacation-planner-hero">
                    <div>
                        <div class="vacation-planner-kicker">${t('schedule.views.vacationPlanner')}</div>
                        <h2>${t('schedule.vacation.title')}</h2>
                        <p>${t('schedule.vacation.subtitle')}</p>
                    </div>
                    <div class="vacation-planner-actions">
                        <div class="vacation-planner-stat">
                            <span>${t('schedule.board.summaryAwayToday')}</span>
                            <strong>${awayTodayCount}</strong>
                        </div>
                        <div class="vacation-planner-stat">
                            <span>${t('schedule.board.upcomingLabel')}</span>
                            <strong>${upcomingVacations.length}</strong>
                        </div>
                        <button id="main-book-vacation-btn" class="vacation-planner-primary-btn" type="button">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            ${t('schedule.vacation.bookNew')}
                        </button>
                    </div>
                </section>
                <div class="vacation-planner-grid">
                    <section class="vacation-calendar-panel">
                        <div id="vacation-calendar"></div>
                    </section>
                    <aside class="vacation-upcoming-panel">
                        <div class="vacation-upcoming-heading">
                            <div>
                                <span>${t('schedule.board.upcomingLabel')}</span>
                                <h3>${t('schedule.vacation.upcomingList')}</h3>
                            </div>
                            <strong>${upcomingVacations.length}</strong>
                        </div>
                        <div id="vacation-list-view" class="vacation-list-view"></div>
                    </aside>
                </div>
            </div>
        `;

        document.getElementById('main-book-vacation-btn').addEventListener('click', () => this.openBookVacationModal());

        if (typeof FullCalendar !== 'undefined') {
            const calendarEl = document.getElementById('vacation-calendar');
            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,listMonth'
                },
                events: events,
                selectable: true,
                eventClassNames: ['vacation-event'],
                select: (info) => {
                    this.openBookVacationModal(info.startStr, info.endStr ? new Date(new Date(info.endStr).setDate(new Date(info.endStr).getDate() - 1)).toISOString().split('T')[0] : info.startStr);
                },
                eventClick: (info) => {
                    const { employeeId, vacationId, endDate } = info.event.extendedProps;

                    this.openBookVacationModal(
                        info.event.startStr,
                        endDate,
                        employeeId,
                        vacationId
                    );
                },
                height: 'auto'
            });
            calendar.render();
        }

        const listView = document.getElementById('vacation-list-view');
        if (listView) {
            if (!upcomingVacations.length) {
                listView.innerHTML = `
                    <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        ${t('schedule.vacation.noUpcoming')}
                    </div>
                `;
            } else {
                listView.innerHTML = upcomingVacations.map((vacation) => `
                    <button
                        type="button"
                        class="vacation-list-item"
                        data-open-vacation
                        data-employee-id="${vacation.employeeId}"
                        data-vacation-id="${vacation.id}">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div class="min-w-0">
                                <div class="flex items-center gap-3">
                                    <span class="h-3 w-3 shrink-0 rounded-full" style="background-color: ${vacation.employeeColor};"></span>
                                    <span class="truncate text-base font-semibold text-slate-900">${vacation.employeeName}</span>
                                </div>
                                <p class="mt-2 text-sm text-slate-600">${this.formatVacationRange(vacation.startDate, vacation.endDate)}</p>
                            </div>
                            <span class="inline-flex shrink-0 items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                                ${this.getVacationDurationLabel(vacation.startDate, vacation.endDate)}
                            </span>
                        </div>
                    </button>
                `).join('');

                listView.querySelectorAll('[data-open-vacation]').forEach((button) => {
                    button.addEventListener('click', () => {
                        const employeeId = button.dataset.employeeId;
                        const vacationId = button.dataset.vacationId;
                        const vacation = this.dataManager.getVacationRecordById(vacationId, { includeArchived: false });

                        if (!employeeId || !vacation) {
                            return;
                        }

                        this.openBookVacationModal(
                            vacation.startDate,
                            vacation.endDate,
                            employeeId,
                            vacationId
                        );
                    });
                });
            }
        }
    }

    openBookVacationModal(startDateStr = '', endDateStr = '', employeeId = null, vacationId = null) {
        const modal = document.getElementById('book-vacation-modal');
        const select = document.getElementById('vacation-employee-select');
        const startInput = document.getElementById('vacation-start-date');
        const endInput = document.getElementById('vacation-end-date');
        const saveBtn = document.getElementById('book-vacation-save-btn');
        const deleteBtn = document.getElementById('book-vacation-delete-btn');
        const title = modal.querySelector('h3');

        // Populate dropdown
        const employees = this.dataManager.getActiveEmployees();
        select.innerHTML = employees.map(emp => `<option value="${emp.id}">${emp.name}</option>`).join('');

        if (startDateStr) startInput.value = startDateStr;
        if (endDateStr) endInput.value = endDateStr;

        // Reset state
        modal.dataset.editing = 'false';
        delete modal.dataset.employeeId;
        delete modal.dataset.vacationId;
        select.disabled = false;
        saveBtn.textContent = t('schedule.vacation.scheduleBtn');
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (title) title.textContent = t('schedule.vacation.bookTitle');

        // Edit Mode
        if (employeeId && vacationId) {
            modal.dataset.editing = 'true';
            modal.dataset.employeeId = employeeId;
            modal.dataset.vacationId = vacationId;
            select.value = employeeId;
            select.disabled = true; // Don't switch employee when editing specific vacation
            saveBtn.textContent = t('schedule.vacation.updateBtn');
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (title) title.textContent = t('schedule.vacation.editTitle');
        }

        modal.classList.remove('hidden');
    }

    async handleBookVacation() {
        const modal = document.getElementById('book-vacation-modal');
        const select = document.getElementById('vacation-employee-select');
        const employeeId = select.value;
        const startDate = document.getElementById('vacation-start-date').value;
        const endDate = document.getElementById('vacation-end-date').value;

        if (!employeeId || !startDate || !endDate) {
            alert(t('schedule.vacation.selectDatesError'));
            return;
        }

        try {
            if (modal.dataset.editing === 'true') {
                const originalEmployeeId = modal.dataset.employeeId;
                const vacationId = modal.dataset.vacationId;
                // In case for some reason select value is different (though disabled), use original
                await this.dataManager.handleUpdateVacation(originalEmployeeId, vacationId, startDate, endDate);
            } else {
                await this.dataManager.handleScheduleVacation(employeeId, startDate, endDate);
            }

            modal.classList.add('hidden');
            this.renderVacationPlanner(); // Refresh view
            if (this.uiManager.currentView === 'vacation') {
                // Double ensure UI update if needed, but calling renderVacationPlanner directly updates the container.
            }
        } catch (e) {
            console.error(e);
            alert(t('schedule.vacation.saveFailed'));
        }
    }

    async handleDeleteVacation() {
        const modal = document.getElementById('book-vacation-modal');
        if (modal.dataset.editing !== 'true') return;

        const employeeId = modal.dataset.employeeId;
        const vacationId = modal.dataset.vacationId;

        if (confirm(t('schedule.vacation.confirmDelete'))) {
            try {
                await this.dataManager.handleDeleteVacation(employeeId, vacationId);
                modal.classList.add('hidden');
                this.renderVacationPlanner();
            } catch (e) {
                console.error(e);
                alert(t('schedule.vacation.deleteFailed'));
            }
        }
    }

    formatVacationRange(startDate, endDate) {
        const locale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        const dateFormat = new Intl.DateTimeFormat(locale, {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });

        return `${dateFormat.format(new Date(`${startDate}T00:00:00`))} - ${dateFormat.format(new Date(`${endDate}T00:00:00`))}`;
    }

    getVacationDurationLabel(startDate, endDate) {
        const duration = this.getInclusiveDayCount(startDate, endDate);
        if (duration === 1) {
            return t('schedule.vacation.durationSingle');
        }

        return t('schedule.vacation.durationPlural', { count: duration });
    }

    getInclusiveDayCount(startDate, endDate) {
        const start = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);
        return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    }

    getLocalDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}
