import { i18n, t } from '../../core/i18n.js';
import { SCHEDULE_VIEWS } from './schedule-view-config.js';
import {
    calculateEmployeeLeaveUsageByTypeForYear,
    calculateVacationPlannerYearSummary
} from './views/schedule-view-helpers.js';

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export class ScheduleManager {
    constructor(dataManager, uiManager) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.vacationPlannerYear = null;
        this.vacationBalanceEditorEmployeeId = null;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add Employee Modal listeners removed - moved to StaffManager


        // Book Vacation Modal Listeners
        const bookVacationClose = document.getElementById('book-vacation-close-btn');
        const bookVacationCancel = document.getElementById('book-vacation-cancel-btn');
        const bookVacationSave = document.getElementById('book-vacation-save-btn');
        const bookVacationModal = document.getElementById('book-vacation-modal');
        const vacationTypeSelect = document.getElementById('vacation-type-select');
        const bookVacationDelete = document.getElementById('book-vacation-delete-btn');

        const closeBookVacationModal = () => {
            if (bookVacationModal) bookVacationModal.classList.add('hidden');
            document.getElementById('vacation-start-date').value = '';
            document.getElementById('vacation-end-date').value = '';
            if (vacationTypeSelect) vacationTypeSelect.value = 'vacation';
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
                newBtn.addEventListener('click', () => {
                    this.uiManager.switchView(view);
                    const menu = newBtn.closest('details');
                    if (menu) {
                        menu.open = false;
                        menu.querySelector('summary')?.focus();
                    }
                });
            }
        });
        document.getElementById('schedule-today-btn')?.addEventListener('click', () => {
            this.dataManager.setCurrentDate(new Date());
            this.uiManager.updateView();
        });
        document.querySelectorAll('.schedule-menu').forEach((menu) => {
            menu.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    menu.open = false;
                    menu.querySelector('summary')?.focus();
                }
            });
            menu.addEventListener('click', (event) => {
                if (event.target.closest('button')) {
                    menu.open = false;
                    menu.querySelector('summary')?.focus();
                }
            });
        });
        document.addEventListener('click', (event) => {
            document.querySelectorAll('.schedule-menu[open]').forEach((menu) => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });
    }

    // addEmployee method moved to StaffManager


    renderVacationPlanner() {
        const container = document.getElementById('vacation-planner-container');
        if (!container) return;

        const employees = this.dataManager.getActiveEmployees();
        const vacationEntries = this.dataManager.getSharedVacationEntries();
        const today = new Date();
        const todayKey = this.getLocalDateKey(new Date());
        const currentYear = today.getFullYear();
        const selectedYear = Number.isInteger(this.vacationPlannerYear)
            ? this.vacationPlannerYear
            : this.dataManager.getCurrentDate().getFullYear();
        this.vacationPlannerYear = selectedYear;
        const holidays = this.dataManager.getHolidaysForYear?.(selectedYear) || {};
        const summary = calculateVacationPlannerYearSummary(employees, selectedYear, today, holidays);
        const yearStart = `${selectedYear}-01-01`;
        const yearEnd = `${selectedYear}-12-31`;
        const yearEntries = vacationEntries
            .filter((vacation) => vacation.startDate <= yearEnd && vacation.endDate >= yearStart)
            .sort((left, right) => left.startDate.localeCompare(right.startDate));
        const availableYears = new Set([selectedYear, currentYear]);
        for (let offset = 0; offset < 5; offset += 1) {
            availableYears.add(currentYear - offset);
        }
        vacationEntries.forEach((vacation) => {
            availableYears.add(Number(vacation.startDate.slice(0, 4)));
            availableYears.add(Number(vacation.endDate.slice(0, 4)));
        });
        const yearOptions = [...availableYears]
            .filter(Number.isInteger)
            .sort((left, right) => right - left);
        const balanceRows = [...summary.rows].sort((left, right) => {
            const balanceComparison = left.vacationBalance - right.vacationBalance;
            return balanceComparison || left.name.localeCompare(right.name);
        });
        const events = yearEntries.map((vacation) => {
            const endPlusOne = new Date(vacation.endDate);
            endPlusOne.setDate(endPlusOne.getDate() + 1);
            const isAwayToday = vacation.startDate <= todayKey && vacation.endDate >= todayKey;
            const isFuture = vacation.startDate > todayKey;
            const status = isAwayToday ? 'away' : (isFuture ? 'planned' : 'taken');
            const employee = employees.find((item) => item.id === vacation.employeeId) || { vacations: [] };
            const workingDays = calculateEmployeeLeaveUsageByTypeForYear(
                { ...employee, vacations: [vacation] },
                selectedYear,
                today,
                holidays
            )[vacation.type || 'vacation'].recordedDays;

            return {
                title: `${vacation.employeeName} · ${workingDays}d`,
                start: vacation.startDate,
                end: endPlusOne.toISOString().split('T')[0],
                allDay: true,
                classNames: [`vacation-event--${status}`],
                extendedProps: {
                    employeeId: vacation.employeeId,
                    vacationId: vacation.id,
                    endDate: vacation.endDate
                }
            };
        });

        container.innerHTML = `
            <div class="vacation-planner-shell">
                <section class="vacation-planner-hero">
                    <div class="vacation-planner-intro">
                        <div class="vacation-planner-kicker">${t('schedule.views.vacationPlanner')}</div>
                        <h2>${t('schedule.vacation.title')}</h2>
                        <p>${t('schedule.vacation.subtitle')}</p>
                    </div>
                    <div class="vacation-planner-actions">
                        <div class="vacation-planner-year-control" aria-label="${escapeHtml(t('schedule.vacation.yearControl'))}">
                            <button type="button" data-vacation-year-step="-1" aria-label="${escapeHtml(t('schedule.board.previousYear'))}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"></path></svg>
                            </button>
                            <label>
                                <span class="sr-only">${t('schedule.vacation.yearControl')}</span>
                                <select id="vacation-planner-year-select">
                                    ${yearOptions.map((year) => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`).join('')}
                                </select>
                            </label>
                            <button type="button" data-vacation-year-step="1" aria-label="${escapeHtml(t('schedule.board.nextYear'))}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
                            </button>
                        </div>
                        <button id="main-book-vacation-btn" class="vacation-planner-primary-btn" type="button">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            ${t('schedule.vacation.bookNew')}
                        </button>
                    </div>
                </section>

                <section class="vacation-planner-summary" aria-label="${escapeHtml(t('schedule.vacation.yearSummary'))}">
                    ${this.renderVacationPlannerMetric(t('schedule.vacation.allowance'), summary.vacationAllowance, t('schedule.vacation.teamDays'))}
                    ${this.renderVacationPlannerMetric(t('schedule.vacation.taken'), summary.takenDays, t('schedule.vacation.weekdays'))}
                    ${this.renderVacationPlannerMetric(t('schedule.vacation.planned'), summary.plannedDays, t('schedule.vacation.weekdays'))}
                    ${this.renderVacationPlannerMetric(
                        t('schedule.vacation.remaining'),
                        summary.unusedVacationDays,
                        summary.overbookedDays > 0
                            ? t('schedule.vacation.overbookedSummary', { count: summary.overbookedDays })
                            : t('schedule.vacation.weekdays'),
                        summary.overbookedDays > 0 ? 'danger' : 'success'
                    )}
                </section>

                <div class="vacation-planner-grid">
                    <section class="vacation-balance-panel">
                        <div class="vacation-planner-section-heading">
                            <div>
                                <span>${selectedYear}</span>
                                <h3>${t('schedule.vacation.balanceTitle')}</h3>
                            </div>
                            <p>${t('schedule.vacation.weekdayNote')}</p>
                        </div>
                        <div class="vacation-balance-table-head" aria-hidden="true">
                            <span>${t('schedule.vacation.colleague')}</span>
                            <span>${t('schedule.vacation.taken')}</span>
                            <span>${t('schedule.vacation.planned')}</span>
                            <span>${t('schedule.vacation.remaining')}</span>
                            <span></span>
                        </div>
                        <div class="vacation-balance-list">
                            ${balanceRows.length ? balanceRows.map((row) => this.renderVacationBalanceRow(row, selectedYear)).join('') : `
                                <div class="vacation-planner-empty">${t('schedule.vacation.noColleagues')}</div>
                            `}
                        </div>
                    </section>
                    <section class="vacation-calendar-panel">
                        <div class="vacation-planner-section-heading vacation-calendar-heading">
                            <div>
                                <span>${selectedYear}</span>
                                <h3>${t('schedule.vacation.calendarTitle')}</h3>
                            </div>
                            <div class="vacation-planner-legend" aria-label="${escapeHtml(t('schedule.vacation.legendLabel'))}">
                                <span><i class="vacation-planner-legend__dot vacation-planner-legend__dot--taken"></i>${t('schedule.vacation.taken')}</span>
                                <span><i class="vacation-planner-legend__dot vacation-planner-legend__dot--planned"></i>${t('schedule.vacation.planned')}</span>
                                <span><i class="vacation-planner-legend__dot vacation-planner-legend__dot--away"></i>${t('schedule.vacation.awayToday')}</span>
                            </div>
                        </div>
                        <div id="vacation-calendar"></div>
                    </section>
                </div>

                <details class="vacation-records-panel">
                    <summary>
                        <div>
                            <span>${selectedYear}</span>
                            <h3>${t('schedule.vacation.recordsTitle')}</h3>
                        </div>
                        <strong>${yearEntries.length}</strong>
                    </summary>
                    <div id="vacation-list-view" class="vacation-records-list">
                            ${yearEntries.length ? yearEntries.map((vacation) => this.renderVacationRecord(vacation, selectedYear, today, holidays)).join('') : `
                            <div class="vacation-planner-empty">${t('schedule.vacation.noYearRecords')}</div>
                        `}
                    </div>
                </details>
            </div>
        `;

        document.getElementById('main-book-vacation-btn').addEventListener('click', () => this.openBookVacationModal());

        container.querySelectorAll('[data-vacation-year-step]').forEach((button) => {
            button.addEventListener('click', () => {
                this.vacationPlannerYear = selectedYear + Number(button.dataset.vacationYearStep);
                this.renderVacationPlanner();
            });
        });
        container.querySelector('#vacation-planner-year-select')?.addEventListener('change', (event) => {
            this.vacationPlannerYear = Number(event.target.value);
            this.renderVacationPlanner();
        });
        container.querySelectorAll('[data-edit-vacation-balance]').forEach((button) => {
            button.addEventListener('click', () => {
                this.vacationBalanceEditorEmployeeId = button.dataset.editVacationBalance;
                this.renderVacationPlanner();
            });
        });
        container.querySelector('[data-cancel-vacation-balance]')?.addEventListener('click', () => {
            this.vacationBalanceEditorEmployeeId = null;
            this.renderVacationPlanner();
        });
        container.querySelector('[data-reset-vacation-balance]')?.addEventListener('click', async (event) => {
            await this.handleVacationBalanceReset(event.currentTarget.dataset.resetVacationBalance, selectedYear);
        });
        container.querySelector('[data-vacation-balance-form]')?.addEventListener('submit', async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            await this.handleVacationBalanceSave(
                form.dataset.vacationBalanceForm,
                selectedYear,
                Number(form.dataset.recordedDays),
                form.querySelector('input')?.value
            );
        });

        if (typeof FullCalendar !== 'undefined') {
            const calendarEl = document.getElementById('vacation-calendar');
            const calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'dayGridMonth',
                initialDate: selectedYear === currentYear ? todayKey : `${selectedYear}-01-01`,
                validRange: {
                    start: `${selectedYear}-01-01`,
                    end: `${selectedYear + 1}-01-01`
                },
                firstDay: 1,
                headerToolbar: {
                    left: 'prev,next',
                    center: 'title',
                    right: 'dayGridMonth,listMonth'
                },
                events: events,
                selectable: true,
                displayEventTime: false,
                dayMaxEvents: 3,
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

        container.querySelectorAll('[data-open-vacation]').forEach((button) => {
            button.addEventListener('click', () => {
                const employeeId = button.dataset.employeeId;
                const vacationId = button.dataset.vacationId;
                const vacation = this.dataManager.getVacationRecordById(vacationId, { includeArchived: false });

                if (!employeeId || !vacation) return;
                this.openBookVacationModal(vacation.startDate, vacation.endDate, employeeId, vacationId);
            });
        });
    }

    renderVacationPlannerMetric(label, value, detail, tone = '') {
        return `
            <div class="vacation-planner-metric ${tone ? `vacation-planner-metric--${tone}` : ''}">
                <span>${label}</span>
                <strong>${value}</strong>
                <small>${detail}</small>
            </div>
        `;
    }

    renderVacationBalanceRow(row, year) {
        const balanceTone = row.vacationBalance < 0 ? 'is-overbooked' : (row.vacationBalance <= 5 ? 'is-low' : '');
        const isEditing = this.vacationBalanceEditorEmployeeId === row.id;

        return `
            <article class="vacation-balance-row ${balanceTone}">
                <div class="vacation-balance-row__main">
                    <div class="vacation-balance-row__person">
                        <strong>${escapeHtml(row.name)}</strong>
                        <span>${escapeHtml(row.department || t('schedule.board.unassignedDepartment'))}</span>
                    </div>
                    <span class="vacation-balance-row__number" data-label="${escapeHtml(t('schedule.vacation.taken'))}">${row.takenDays}</span>
                    <span class="vacation-balance-row__number" data-label="${escapeHtml(t('schedule.vacation.planned'))}">${row.plannedDays}</span>
                    <strong class="vacation-balance-row__balance" data-label="${escapeHtml(t('schedule.vacation.remaining'))}">${row.vacationBalance}</strong>
                    <button type="button" class="vacation-balance-edit" data-edit-vacation-balance="${escapeHtml(row.id)}">${t('schedule.vacation.editBalance')}</button>
                </div>
                ${isEditing ? `
                    <form class="vacation-balance-editor" data-vacation-balance-form="${escapeHtml(row.id)}" data-recorded-days="${row.recordedDays}">
                        <div>
                            <label for="vacation-balance-${escapeHtml(row.id)}">${t('schedule.vacation.daysRemainingForYear', { year })}</label>
                            <p>${t('schedule.vacation.balanceEditHint', { count: row.recordedDays })}</p>
                        </div>
                        <input id="vacation-balance-${escapeHtml(row.id)}" type="number" step="1" min="-${row.recordedDays}" value="${row.vacationBalance}" required>
                        <div class="vacation-balance-editor__actions">
                            <button type="submit">${t('common.save')}</button>
                            <button type="button" data-cancel-vacation-balance>${t('common.cancel')}</button>
                            ${row.hasYearlyOverride ? `<button type="button" data-reset-vacation-balance="${escapeHtml(row.id)}">${t('schedule.vacation.restoreDefault')}</button>` : ''}
                        </div>
                    </form>
                ` : ''}
            </article>
        `;
    }

    async handleVacationBalanceSave(employeeId, year, recordedDays, remainingValue) {
        const remainingDays = Number.parseInt(remainingValue, 10);
        if (!Number.isInteger(remainingDays) || remainingDays < -recordedDays) {
            alert(t('schedule.vacation.invalidBalance'));
            return;
        }

        try {
            await this.dataManager.handleVacationAllowanceForYearChange(employeeId, year, recordedDays + remainingDays);
            this.vacationBalanceEditorEmployeeId = null;
            this.renderVacationPlanner();
        } catch (error) {
            console.error(error);
            alert(t('schedule.vacation.balanceSaveFailed'));
        }
    }

    async handleVacationBalanceReset(employeeId, year) {
        try {
            await this.dataManager.handleVacationAllowanceForYearChange(employeeId, year, null);
            this.vacationBalanceEditorEmployeeId = null;
            this.renderVacationPlanner();
        } catch (error) {
            console.error(error);
            alert(t('schedule.vacation.balanceSaveFailed'));
        }
    }

    renderVacationRecord(vacation, year, referenceDate, holidays = {}) {
        const employee = this.dataManager.getEmployeeById?.(vacation.employeeId) || {};
        const usage = calculateEmployeeLeaveUsageByTypeForYear(
            { ...employee, vacations: [vacation] },
            year,
            referenceDate,
            holidays
        )[vacation.type || 'vacation'];
        const todayKey = this.getLocalDateKey(referenceDate);
        const statusKey = vacation.startDate > todayKey
            ? 'planned'
            : (vacation.endDate < todayKey ? 'taken' : 'awayToday');

        return `
            <button
                type="button"
                class="vacation-record"
                data-open-vacation
                data-employee-id="${escapeHtml(vacation.employeeId)}"
                data-vacation-id="${escapeHtml(vacation.id)}">
                <span class="vacation-record__status vacation-record__status--${statusKey}">${t(`schedule.vacation.${statusKey}`)}</span>
                <span class="vacation-record__person">${escapeHtml(vacation.employeeName)}</span>
                <span class="vacation-record__range">${this.formatVacationRange(vacation.startDate, vacation.endDate)}</span>
                <span class="vacation-record__days">${t('schedule.vacation.workingDayCount', { count: usage.recordedDays })}</span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>
            </button>
        `;
    }

    openBookVacationModal(startDateStr = '', endDateStr = '', employeeId = null, vacationId = null) {
        const modal = document.getElementById('book-vacation-modal');
        const select = document.getElementById('vacation-employee-select');
        const startInput = document.getElementById('vacation-start-date');
        const endInput = document.getElementById('vacation-end-date');
        const typeSelect = document.getElementById('vacation-type-select');
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
        if (typeSelect) typeSelect.value = 'vacation';
        saveBtn.textContent = t('schedule.vacation.scheduleBtn');
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (title) title.textContent = t('schedule.vacation.bookTitle');

        // Edit Mode
        if (employeeId && vacationId) {
            const vacation = this.dataManager.getVacationRecordById?.(vacationId, { includeArchived: false });
            modal.dataset.editing = 'true';
            modal.dataset.employeeId = employeeId;
            modal.dataset.vacationId = vacationId;
            select.value = employeeId;
            select.disabled = true; // Don't switch employee when editing specific vacation
            if (typeSelect) typeSelect.value = vacation?.type || 'vacation';
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
        const type = document.getElementById('vacation-type-select')?.value || 'vacation';

        if (!employeeId || !startDate || !endDate) {
            alert(t('schedule.vacation.selectDatesError'));
            return;
        }

        try {
            if (modal.dataset.editing === 'true') {
                const originalEmployeeId = modal.dataset.employeeId;
                const vacationId = modal.dataset.vacationId;
                // In case for some reason select value is different (though disabled), use original
                await this.dataManager.handleUpdateVacation(originalEmployeeId, vacationId, startDate, endDate, { type });
            } else {
                await this.dataManager.handleScheduleVacation(employeeId, startDate, endDate, { type });
            }

            modal.classList.add('hidden');
            this.renderVacationPlanner(); // Refresh view
            if (this.uiManager.currentView === 'vacation') {
                // Double ensure UI update if needed, but calling renderVacationPlanner directly updates the container.
            }
        } catch (e) {
            console.error(e);
            alert(e?.code === 'vacation-year-closed'
                ? t('vacationCenter.yearClosedError', { year: e.year })
                : t('schedule.vacation.saveFailed'));
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
                alert(e?.code === 'vacation-year-closed'
                    ? t('vacationCenter.yearClosedError', { year: e.year })
                    : t('schedule.vacation.deleteFailed'));
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
