import { i18n, t } from '../../core/i18n.js';
import {
    calculateEmployeeLeaveBalanceForYear,
    calculateEmployeeVacationUsageForYear,
    calculateVacationPlannerYearSummary,
    getLocalDateKey
} from './views/schedule-view-helpers.js';

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInitials(name = '') {
    return String(name)
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || '—';
}

function getEndExclusive(dateKey) {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + 1);
    return getLocalDateKey(date);
}

export class VacationCenterManager {
    constructor(dataManager, {
        scheduleManager = null,
        documentRef = document,
        now = () => new Date()
    } = {}) {
        this.dataManager = dataManager;
        this.scheduleManager = scheduleManager;
        this.documentRef = documentRef;
        this.now = now;
        this.currentYear = this.now().getFullYear();
        this.currentView = 'balances';
        this.selectedEmployeeId = null;
        this.searchQuery = '';
        this.editingBalance = false;
        this.calendar = null;
        this.initialized = false;
        this.unsubscribeDataChanges = null;

        this.handlePageOpened = () => this.render();
        this.handleLanguageChanged = () => {
            if (this.isVisible()) this.render();
        };
        this.handleClick = (event) => this.onClick(event);
        this.handleChange = (event) => this.onChange(event);
        this.handleInput = (event) => this.onInput(event);
        this.handleSubmit = (event) => this.onSubmit(event);
    }

    init() {
        if (this.initialized) return;

        const root = this.getRoot();
        if (!root) return;

        this.initialized = true;
        root.addEventListener('click', this.handleClick);
        root.addEventListener('change', this.handleChange);
        root.addEventListener('input', this.handleInput);
        root.addEventListener('submit', this.handleSubmit);
        this.documentRef.addEventListener('vacationCenterPageOpened', this.handlePageOpened);
        window.addEventListener('languageChanged', this.handleLanguageChanged);
        this.unsubscribeDataChanges = this.dataManager.subscribeToDataChanges?.(() => {
            if (this.isVisible()) this.render();
        });
    }

    getRoot() {
        return this.documentRef.getElementById('vacation-center-root');
    }

    isVisible() {
        const page = this.documentRef.getElementById('vacation-center-page');
        return Boolean(page && !page.classList.contains('hidden'));
    }

    getEmployees() {
        return [...(this.dataManager.getActiveEmployees?.() || [])]
            .sort((left, right) => (left.name || '').localeCompare(right.name || ''));
    }

    getVacationEntries() {
        return this.dataManager.getSharedVacationEntries?.() || [];
    }

    getYearOptions(entries) {
        const years = new Set([this.currentYear, this.now().getFullYear()]);
        for (let offset = 0; offset < 5; offset += 1) {
            years.add(this.now().getFullYear() - offset);
        }
        entries.forEach((entry) => {
            years.add(Number(String(entry.startDate).slice(0, 4)));
            years.add(Number(String(entry.endDate).slice(0, 4)));
        });
        return [...years].filter(Number.isInteger).sort((left, right) => right - left);
    }

    render() {
        const root = this.getRoot();
        if (!root) return;

        this.calendar?.destroy?.();
        this.calendar = null;

        const employees = this.getEmployees();
        const entries = this.getVacationEntries();
        const summary = calculateVacationPlannerYearSummary(employees, this.currentYear, this.now());

        if (!employees.some((employee) => employee.id === this.selectedEmployeeId)) {
            this.selectedEmployeeId = employees[0]?.id || null;
        }

        root.innerHTML = `
            <div class="vacation-center-workspace">
                <section class="vacation-center-toolbar">
                    <nav class="vacation-center-view-switch" aria-label="${escapeHtml(t('vacationCenter.viewLabel'))}">
                        <button type="button" data-vc-view="balances" class="${this.currentView === 'balances' ? 'is-active' : ''}">${t('vacationCenter.balancesView')}</button>
                        <button type="button" data-vc-view="calendar" class="${this.currentView === 'calendar' ? 'is-active' : ''}">${t('vacationCenter.calendarView')}</button>
                    </nav>
                    <div class="vacation-center-toolbar__actions">
                        <div class="vacation-center-year-control">
                            <button type="button" data-vc-year-step="-1" aria-label="${escapeHtml(t('schedule.board.previousYear'))}">←</button>
                            <label>
                                <span class="sr-only">${t('schedule.vacation.yearControl')}</span>
                                <select data-vc-year-select>
                                    ${this.getYearOptions(entries).map((year) => `<option value="${year}" ${year === this.currentYear ? 'selected' : ''}>${year}</option>`).join('')}
                                </select>
                            </label>
                            <button type="button" data-vc-year-step="1" aria-label="${escapeHtml(t('schedule.board.nextYear'))}">→</button>
                        </div>
                        <button type="button" class="vacation-center-book" data-vc-book>
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"></path></svg>
                            ${t('schedule.vacation.bookNew')}
                        </button>
                    </div>
                </section>

                <section class="vacation-center-totals" aria-label="${escapeHtml(t('schedule.vacation.yearSummary'))}">
                    ${this.renderTotal(t('schedule.vacation.allowance'), summary.vacationAllowance)}
                    ${this.renderTotal(t('schedule.vacation.taken'), summary.takenDays)}
                    ${this.renderTotal(t('schedule.vacation.planned'), summary.plannedDays)}
                    ${this.renderTotal(t('schedule.vacation.remaining'), summary.unusedVacationDays, summary.overbookedDays > 0 ? 'warning' : 'positive')}
                </section>

                ${this.currentView === 'calendar'
                    ? this.renderCalendarWorkspace(entries)
                    : this.renderBalancesWorkspace(employees, entries, summary.rows)}
            </div>
        `;

        if (this.currentView === 'calendar') {
            this.renderCalendar(entries);
        } else {
            this.applyRosterFilter(this.searchQuery);
        }
    }

    renderTotal(label, value, tone = '') {
        return `
            <div class="vacation-center-total ${tone ? `vacation-center-total--${tone}` : ''}">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    renderBalancesWorkspace(employees, entries, rows) {
        const selectedEmployee = employees.find((employee) => employee.id === this.selectedEmployeeId) || null;
        const selectedRow = rows.find((row) => row.id === this.selectedEmployeeId) || null;

        return `
            <div class="vacation-center-balances">
                <section class="vacation-center-roster" aria-label="${escapeHtml(t('vacationCenter.colleagueList'))}">
                    <div class="vacation-center-roster__heading">
                        <div>
                            <span>${t('vacationCenter.teamLabel')}</span>
                            <h2>${t('vacationCenter.colleagueList')}</h2>
                        </div>
                        <strong>${employees.length}</strong>
                    </div>
                    <label class="vacation-center-search">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
                        <span class="sr-only">${t('common.search')}</span>
                        <input type="search" data-vc-search value="${escapeHtml(this.searchQuery)}" placeholder="${escapeHtml(t('vacationCenter.searchPlaceholder'))}">
                    </label>
                    <div class="vacation-center-roster__list">
                        ${rows.map((row) => this.renderRosterRow(row)).join('') || `<p class="vacation-center-empty">${t('schedule.vacation.noColleagues')}</p>`}
                    </div>
                    <p class="vacation-center-no-results hidden" data-vc-no-results>${t('vacationCenter.noSearchResults')}</p>
                </section>
                <aside class="vacation-center-inspector">
                    ${selectedEmployee && selectedRow
                        ? this.renderInspector(selectedEmployee, selectedRow, entries)
                        : `<div class="vacation-center-empty">${t('vacationCenter.selectColleague')}</div>`}
                </aside>
            </div>
        `;
    }

    renderRosterRow(row) {
        const searchText = `${row.name || ''} ${row.department || ''}`.toLowerCase();
        const tone = row.vacationBalance < 0 ? 'danger' : (row.vacationBalance <= 5 ? 'warning' : 'positive');
        return `
            <button
                type="button"
                class="vacation-center-person ${row.id === this.selectedEmployeeId ? 'is-selected' : ''}"
                data-vc-select-employee="${escapeHtml(row.id)}"
                data-vc-search-text="${escapeHtml(searchText)}">
                <span class="vacation-center-avatar">${escapeHtml(getInitials(row.name))}</span>
                <span class="vacation-center-person__copy">
                    <strong>${escapeHtml(row.name)}</strong>
                    <small>${escapeHtml(row.department || t('schedule.board.unassignedDepartment'))}</small>
                </span>
                <span class="vacation-center-person__balance vacation-center-person__balance--${tone}">
                    <strong>${row.vacationBalance}</strong>
                    <small>${t('schedule.vacation.leftShort')}</small>
                </span>
            </button>
        `;
    }

    renderInspector(employee, row, entries) {
        const history = Array.from({ length: 4 }, (_, index) => {
            const year = this.currentYear - index;
            const balance = calculateEmployeeLeaveBalanceForYear(employee, year);
            return { year, ...balance };
        });
        const selectedEntries = entries
            .filter((entry) => entry.employeeId === employee.id)
            .filter((entry) => entry.startDate <= `${this.currentYear}-12-31` && entry.endDate >= `${this.currentYear}-01-01`)
            .sort((left, right) => left.startDate.localeCompare(right.startDate));
        const tone = row.vacationBalance < 0 ? 'danger' : (row.vacationBalance <= 5 ? 'warning' : 'positive');

        return `
            <div class="vacation-center-inspector__head">
                <span class="vacation-center-avatar vacation-center-avatar--large">${escapeHtml(getInitials(employee.name))}</span>
                <div>
                    <span>${escapeHtml(employee.department || t('schedule.board.unassignedDepartment'))}</span>
                    <h2>${escapeHtml(employee.name)}</h2>
                </div>
            </div>

            <section class="vacation-center-balance-focus vacation-center-balance-focus--${tone}">
                <div>
                    <span>${t('vacationCenter.remainingInYear', { year: this.currentYear })}</span>
                    <strong>${row.vacationBalance}</strong>
                    <small>${t('schedule.vacation.weekdays')}</small>
                </div>
                <button type="button" data-vc-edit-balance>${t('schedule.vacation.editBalance')}</button>
            </section>

            ${this.editingBalance ? this.renderBalanceEditor(row) : ''}

            <dl class="vacation-center-person-metrics">
                <div><dt>${t('schedule.vacation.allowance')}</dt><dd>${row.vacationAllowance}</dd></div>
                <div><dt>${t('schedule.vacation.taken')}</dt><dd>${row.takenDays}</dd></div>
                <div><dt>${t('schedule.vacation.planned')}</dt><dd>${row.plannedDays}</dd></div>
            </dl>

            <section class="vacation-center-history">
                <div class="vacation-center-section-title">
                    <span>${t('vacationCenter.historyLabel')}</span>
                    <h3>${t('vacationCenter.yearHistory')}</h3>
                </div>
                <div class="vacation-center-history__rows">
                    ${history.map((item) => `
                        <button type="button" data-vc-history-year="${item.year}">
                            <strong>${item.year}</strong>
                            <span>${item.vacationDays} ${t('schedule.vacation.usedShort')}</span>
                            <span>${item.vacationBalance} ${t('schedule.vacation.leftShort')}</span>
                        </button>
                    `).join('')}
                </div>
            </section>

            <section class="vacation-center-person-leave">
                <div class="vacation-center-section-title">
                    <span>${this.currentYear}</span>
                    <h3>${t('vacationCenter.recordedLeave')}</h3>
                </div>
                <div class="vacation-center-person-leave__list">
                    ${selectedEntries.length ? selectedEntries.map((entry) => `
                        <button type="button" data-vc-open-vacation="${escapeHtml(entry.id)}" data-employee-id="${escapeHtml(entry.employeeId)}">
                            <span>${this.formatRange(entry.startDate, entry.endDate)}</span>
                            <strong>${calculateEmployeeVacationUsageForYear({ vacations: [entry] }, this.currentYear, this.now()).recordedDays}d</strong>
                        </button>
                    `).join('') : `<p>${t('schedule.vacation.noYearRecords')}</p>`}
                </div>
            </section>
        `;
    }

    renderBalanceEditor(row) {
        return `
            <form class="vacation-center-balance-editor" data-vc-balance-form data-recorded-days="${row.recordedDays}">
                <label for="vacation-center-balance-input">${t('schedule.vacation.daysRemainingForYear', { year: this.currentYear })}</label>
                <div>
                    <input id="vacation-center-balance-input" type="number" min="-${row.recordedDays}" step="1" value="${row.vacationBalance}" required>
                    <button type="submit">${t('common.save')}</button>
                    <button type="button" data-vc-cancel-balance>${t('common.cancel')}</button>
                </div>
                <p>${t('schedule.vacation.balanceEditHint', { count: row.recordedDays })}</p>
                ${row.hasYearlyOverride ? `<button type="button" class="vacation-center-reset" data-vc-reset-balance>${t('schedule.vacation.restoreDefault')}</button>` : ''}
            </form>
        `;
    }

    renderCalendarWorkspace() {
        return `
            <section class="vacation-center-calendar-workspace">
                <div class="vacation-center-calendar-heading">
                    <div>
                        <span>${this.currentYear}</span>
                        <h2>${t('vacationCenter.teamCalendar')}</h2>
                    </div>
                    <div class="vacation-center-legend">
                        <span><i class="is-taken"></i>${t('schedule.vacation.taken')}</span>
                        <span><i class="is-planned"></i>${t('schedule.vacation.planned')}</span>
                        <span><i class="is-away"></i>${t('schedule.vacation.awayToday')}</span>
                    </div>
                </div>
                <div id="vacation-center-calendar"></div>
            </section>
        `;
    }

    renderCalendar(entries) {
        if (typeof FullCalendar === 'undefined') return;

        const todayKey = getLocalDateKey(this.now());
        const yearEntries = entries.filter((entry) => (
            entry.startDate <= `${this.currentYear}-12-31` && entry.endDate >= `${this.currentYear}-01-01`
        ));
        const events = yearEntries.map((entry) => {
            const status = entry.startDate <= todayKey && entry.endDate >= todayKey
                ? 'away'
                : (entry.startDate > todayKey ? 'planned' : 'taken');
            return {
                title: entry.employeeName,
                start: entry.startDate,
                end: getEndExclusive(entry.endDate),
                allDay: true,
                classNames: [`vacation-center-event--${status}`],
                extendedProps: {
                    employeeId: entry.employeeId,
                    vacationId: entry.id,
                    endDate: entry.endDate
                }
            };
        });
        const calendarElement = this.documentRef.getElementById('vacation-center-calendar');
        this.calendar = new FullCalendar.Calendar(calendarElement, {
            initialView: 'dayGridMonth',
            initialDate: this.currentYear === this.now().getFullYear() ? todayKey : `${this.currentYear}-01-01`,
            validRange: { start: `${this.currentYear}-01-01`, end: `${this.currentYear + 1}-01-01` },
            firstDay: 1,
            selectable: true,
            displayEventTime: false,
            dayMaxEvents: 4,
            headerToolbar: { left: 'prev,next', center: 'title', right: 'dayGridMonth,listMonth' },
            events,
            select: (info) => {
                const endDate = new Date(`${info.endStr}T00:00:00`);
                endDate.setDate(endDate.getDate() - 1);
                this.scheduleManager?.openBookVacationModal(info.startStr, getLocalDateKey(endDate));
            },
            eventClick: (info) => {
                const { employeeId, vacationId, endDate } = info.event.extendedProps;
                this.scheduleManager?.openBookVacationModal(info.event.startStr, endDate, employeeId, vacationId);
            },
            height: 'auto'
        });
        this.calendar.render();
    }

    onClick(event) {
        const viewButton = event.target.closest('[data-vc-view]');
        if (viewButton) {
            this.currentView = viewButton.dataset.vcView;
            this.editingBalance = false;
            this.render();
            return;
        }

        const yearStepButton = event.target.closest('[data-vc-year-step]');
        if (yearStepButton) {
            this.currentYear += Number(yearStepButton.dataset.vcYearStep);
            this.editingBalance = false;
            this.render();
            return;
        }

        const historyYearButton = event.target.closest('[data-vc-history-year]');
        if (historyYearButton) {
            this.currentYear = Number(historyYearButton.dataset.vcHistoryYear);
            this.editingBalance = false;
            this.render();
            return;
        }

        const employeeButton = event.target.closest('[data-vc-select-employee]');
        if (employeeButton) {
            this.selectedEmployeeId = employeeButton.dataset.vcSelectEmployee;
            this.editingBalance = false;
            this.render();
            return;
        }

        if (event.target.closest('[data-vc-book]')) {
            this.scheduleManager?.openBookVacationModal();
            return;
        }

        if (event.target.closest('[data-vc-edit-balance]')) {
            this.editingBalance = true;
            this.render();
            return;
        }

        if (event.target.closest('[data-vc-cancel-balance]')) {
            this.editingBalance = false;
            this.render();
            return;
        }

        if (event.target.closest('[data-vc-reset-balance]')) {
            this.resetBalance();
            return;
        }

        const vacationButton = event.target.closest('[data-vc-open-vacation]');
        if (vacationButton) {
            const vacation = this.dataManager.getVacationRecordById?.(vacationButton.dataset.vcOpenVacation, { includeArchived: false });
            if (vacation) {
                this.scheduleManager?.openBookVacationModal(
                    vacation.startDate,
                    vacation.endDate,
                    vacationButton.dataset.employeeId,
                    vacation.id
                );
            }
        }
    }

    onChange(event) {
        if (event.target.matches('[data-vc-year-select]')) {
            this.currentYear = Number(event.target.value);
            this.editingBalance = false;
            this.render();
        }
    }

    onInput(event) {
        if (!event.target.matches('[data-vc-search]')) return;
        this.searchQuery = event.target.value;
        this.applyRosterFilter(this.searchQuery);
    }

    onSubmit(event) {
        if (!event.target.matches('[data-vc-balance-form]')) return;
        event.preventDefault();
        const input = event.target.querySelector('input');
        this.saveBalance(Number(event.target.dataset.recordedDays), input?.value);
    }

    applyRosterFilter(query) {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        let visibleCount = 0;
        this.getRoot()?.querySelectorAll('[data-vc-search-text]').forEach((row) => {
            const isVisible = !normalizedQuery || row.dataset.vcSearchText.includes(normalizedQuery);
            row.classList.toggle('hidden', !isVisible);
            if (isVisible) visibleCount += 1;
        });
        this.getRoot()?.querySelector('[data-vc-no-results]')?.classList.toggle('hidden', visibleCount !== 0);
    }

    async saveBalance(recordedDays, remainingValue) {
        const remainingDays = Number.parseInt(remainingValue, 10);
        if (!Number.isInteger(remainingDays) || remainingDays < -recordedDays || !this.selectedEmployeeId) {
            alert(t('schedule.vacation.invalidBalance'));
            return;
        }
        try {
            const allowance = recordedDays + remainingDays;
            await this.dataManager.handleVacationAllowanceForYearChange(this.selectedEmployeeId, this.currentYear, allowance);
            const employee = this.dataManager.getEmployeeById?.(this.selectedEmployeeId);
            if (employee) {
                employee.vacationAllowancesByYear = { ...(employee.vacationAllowancesByYear || {}), [this.currentYear]: allowance };
            }
            this.editingBalance = false;
            this.render();
        } catch (error) {
            console.error(error);
            alert(t('schedule.vacation.balanceSaveFailed'));
        }
    }

    async resetBalance() {
        if (!this.selectedEmployeeId) return;
        try {
            await this.dataManager.handleVacationAllowanceForYearChange(this.selectedEmployeeId, this.currentYear, null);
            const employee = this.dataManager.getEmployeeById?.(this.selectedEmployeeId);
            if (employee?.vacationAllowancesByYear) {
                delete employee.vacationAllowancesByYear[String(this.currentYear)];
            }
            this.editingBalance = false;
            this.render();
        } catch (error) {
            console.error(error);
            alert(t('schedule.vacation.balanceSaveFailed'));
        }
    }

    formatRange(startDate, endDate) {
        const locale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        const formatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
        return `${formatter.format(new Date(`${startDate}T00:00:00`))} – ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
    }
}
