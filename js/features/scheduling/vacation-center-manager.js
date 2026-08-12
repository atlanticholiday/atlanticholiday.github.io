import { i18n, t } from '../../core/i18n.js';
import {
    calculateEmployeeLeaveBalanceForYear,
    calculateEmployeeLeaveUsageByTypeForYear,
    calculateVacationPlannerYearSummary,
    getLocalDateKey
} from './views/schedule-view-helpers.js';
import { LEAVE_TYPES, normalizeLeaveType } from './vacation-records.js';

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
        this.calendarDepartment = 'all';
        this.calendarEmployee = 'all';
        this.calendarLeaveType = 'all';
        this.showYearPolicy = false;
        this.showAllYearsTotal = false;
        this.editingBalance = false;
        this.calendar = null;
        this.hasRendered = false;
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

    getEmployeeEntranceYear(employee) {
        const entranceYear = Number(String(employee?.hireDate || '').slice(0, 4));
        return Number.isInteger(entranceYear) && entranceYear >= 1900
            ? entranceYear
            : null;
    }

    getEmployeeLatestYear(employee, entries = []) {
        const years = [this.now().getFullYear()];
        entries
            .filter((entry) => entry.employeeId === employee?.id)
            .forEach((entry) => {
                years.push(Number(String(entry.startDate).slice(0, 4)));
                years.push(Number(String(entry.endDate).slice(0, 4)));
            });
        [
            employee?.vacationAllowancesByYear,
            employee?.vacationCarryOverByYear,
            employee?.vacationCarryOverExpiryByYear
        ].forEach((yearlyValues) => {
            Object.keys(yearlyValues || {}).forEach((year) => years.push(Number(year)));
        });
        return Math.max(...years.filter(Number.isInteger));
    }

    getEmployeeYearBounds(employee, entries = []) {
        const entranceYear = this.getEmployeeEntranceYear(employee);
        const latestYear = this.getEmployeeLatestYear(employee, entries);
        const recordedYears = [
            ...entries
                .filter((entry) => entry.employeeId === employee?.id)
                .flatMap((entry) => [
                    Number(String(entry.startDate).slice(0, 4)),
                    Number(String(entry.endDate).slice(0, 4))
                ]),
            ...Object.keys(employee?.vacationAllowancesByYear || {}).map(Number),
            ...Object.keys(employee?.vacationCarryOverByYear || {}).map(Number)
        ].filter(Number.isInteger);
        const earliestRecordedYear = recordedYears.length
            ? Math.min(...recordedYears)
            : this.now().getFullYear();
        return {
            startYear: Math.min(entranceYear ?? earliestRecordedYear, latestYear),
            endYear: latestYear
        };
    }

    getEmployeeAllYearsSummary(employee, entries = []) {
        const { startYear, endYear } = this.getEmployeeYearBounds(employee, entries);
        let usedDays = 0;
        let remainingDays = 0;
        let closedYears = 0;

        for (let year = startYear; year <= endYear; year += 1) {
            const balance = calculateEmployeeLeaveBalanceForYear(
                employee,
                year,
                this.dataManager.getHolidaysForYear?.(year) || {},
                this.now()
            );
            usedDays += balance.vacationDays;
            if (this.dataManager.isVacationYearClosed?.(year)) {
                closedYears += 1;
            } else {
                remainingDays += balance.vacationBalance;
            }
        }

        return { startYear, endYear, usedDays, remainingDays, closedYears };
    }

    render() {
        const root = this.getRoot();
        if (!root) return;

        this.calendar?.destroy?.();
        this.calendar = null;

        const employees = this.getEmployees();
        const entries = this.getVacationEntries();
        const holidays = this.dataManager.getHolidaysForYear?.(this.currentYear) || {};
        const summary = calculateVacationPlannerYearSummary(employees, this.currentYear, this.now(), holidays);
        const yearPolicy = this.dataManager.getVacationYearPolicy?.(this.currentYear) || null;

        if (!employees.some((employee) => employee.id === this.selectedEmployeeId)) {
            this.selectedEmployeeId = employees[0]?.id || null;
        }

        root.innerHTML = `
            <div class="vacation-center-workspace ${this.hasRendered ? '' : 'is-entering'}">
                <section class="vacation-center-toolbar">
                    <nav class="vacation-center-view-switch" aria-label="${escapeHtml(t('vacationCenter.viewLabel'))}">
                        <button type="button" data-vc-view="balances" class="${this.currentView === 'balances' ? 'is-active' : ''}">${t('vacationCenter.balancesView')}</button>
                        <button type="button" data-vc-view="calendar" class="${this.currentView === 'calendar' ? 'is-active' : ''}">${t('vacationCenter.calendarView')}</button>
                        <button type="button" data-vc-view="reports" class="${this.currentView === 'reports' ? 'is-active' : ''}">${t('vacationCenter.reportsView')}</button>
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
                        <button type="button" class="vacation-center-settings-button ${this.showYearPolicy ? 'is-active' : ''}" data-vc-toggle-policy>${t('vacationCenter.yearSettings')}</button>
                    </div>
                </section>

                <section class="vacation-center-totals" aria-label="${escapeHtml(t('schedule.vacation.yearSummary'))}">
                    ${this.renderTotal(t('schedule.vacation.allowance'), summary.vacationAllowance)}
                    ${this.renderTotal(t('schedule.vacation.taken'), summary.takenDays)}
                    ${this.renderTotal(t('schedule.vacation.planned'), summary.plannedDays)}
                    ${this.renderTotal(t('schedule.vacation.remaining'), summary.unusedVacationDays, summary.overbookedDays > 0 ? 'warning' : 'positive')}
                </section>

                ${this.showYearPolicy ? this.renderYearPolicyPanel(yearPolicy) : ''}

                ${this.currentView === 'calendar'
                    ? this.renderCalendarWorkspace(employees, entries)
                    : (this.currentView === 'reports'
                        ? this.renderReportsWorkspace(employees, summary, holidays, yearPolicy)
                        : this.renderBalancesWorkspace(employees, entries, summary.rows, holidays))}
            </div>
        `;

        if (this.currentView === 'calendar') {
            this.renderCalendar(entries, employees, holidays);
        } else {
            this.applyRosterFilter(this.searchQuery);
        }
        this.hasRendered = true;
    }

    renderTotal(label, value, tone = '') {
        return `
            <div class="vacation-center-total ${tone ? `vacation-center-total--${tone}` : ''}">
                <span>${label}</span>
                <strong>${value}</strong>
            </div>
        `;
    }

    renderYearPolicyPanel(policy) {
        const targetYear = this.currentYear + 1;
        const defaultExpiry = `${targetYear}-03-31`;
        if (policy?.closed) {
            const totalCarried = Object.values(policy.carriedOverByEmployee || {})
                .reduce((sum, value) => sum + (Number(value) || 0), 0);
            return `
                <section class="vacation-center-policy vacation-center-policy--closed">
                    <div>
                        <span class="vacation-center-policy__status">${t('vacationCenter.yearClosed')}</span>
                        <strong>${t('vacationCenter.closedYearSummary', {
                            year: this.currentYear,
                            count: totalCarried,
                            targetYear: policy.targetYear || targetYear
                        })}</strong>
                        <small>${t('vacationCenter.carryOverExpires', { date: this.formatDate(policy.expiryDate) })}</small>
                    </div>
                    <button type="button" data-vc-reopen-year>${t('vacationCenter.reopenYear')}</button>
                </section>
            `;
        }

        return `
            <form class="vacation-center-policy" data-vc-close-year-form>
                <div>
                    <span class="vacation-center-policy__status">${t('vacationCenter.yearOpen')}</span>
                    <strong>${t('vacationCenter.closeYearDescription', { year: this.currentYear, targetYear })}</strong>
                </div>
                <label>
                    <span>${t('vacationCenter.carryOverLimit')}</span>
                    <input type="number" name="carryOverLimit" min="0" max="30" step="1" value="${policy?.carryOverLimit ?? 5}">
                </label>
                <label>
                    <span>${t('vacationCenter.expiryDate')}</span>
                    <input type="date" name="expiryDate" value="${escapeHtml(policy?.expiryDate || defaultExpiry)}" min="${targetYear}-01-01" max="${targetYear}-12-31">
                </label>
                <button type="submit">${t('vacationCenter.closeYear')}</button>
            </form>
        `;
    }

    renderBalancesWorkspace(employees, entries, rows, holidays = {}) {
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
                        ? this.renderInspector(selectedEmployee, selectedRow, entries, holidays)
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

    renderInspector(employee, row, entries, holidays = {}) {
        const entranceYear = this.getEmployeeEntranceYear(employee);
        const latestYear = this.getEmployeeLatestYear(employee, entries);
        const allYears = this.getEmployeeAllYearsSummary(employee, entries);
        const history = Array.from({ length: 4 }, (_, index) => {
            const year = this.currentYear - index;
            const balance = calculateEmployeeLeaveBalanceForYear(
                employee,
                year,
                this.dataManager.getHolidaysForYear?.(year) || {}
            );
            return { year, ...balance };
        }).filter(({ year }) => entranceYear === null || year >= entranceYear);
        const canShowPreviousYear = entranceYear === null || this.currentYear > entranceYear;
        const canShowNextYear = this.currentYear < latestYear;
        const selectedEntries = entries
            .filter((entry) => entry.employeeId === employee.id)
            .filter((entry) => entry.startDate <= `${this.currentYear}-12-31` && entry.endDate >= `${this.currentYear}-01-01`)
            .sort((left, right) => left.startDate.localeCompare(right.startDate));
        const tone = row.vacationBalance < 0 ? 'danger' : (row.vacationBalance <= 5 ? 'warning' : 'positive');
        const yearClosed = this.dataManager.isVacationYearClosed?.(this.currentYear);

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
                <button type="button" data-vc-edit-balance ${yearClosed ? 'disabled' : ''}>${yearClosed ? t('vacationCenter.yearClosed') : t('schedule.vacation.editBalance')}</button>
            </section>

            ${this.editingBalance ? this.renderBalanceEditor(row) : ''}

            <dl class="vacation-center-person-metrics">
                <div><dt>${t('schedule.vacation.allowance')}</dt><dd>${row.vacationAllowance}</dd></div>
                <div><dt>${t('schedule.vacation.taken')}</dt><dd>${row.takenDays}</dd></div>
                <div><dt>${t('schedule.vacation.planned')}</dt><dd>${row.plannedDays}</dd></div>
            </dl>

            <section class="vacation-center-history">
                <div class="vacation-center-section-title vacation-center-history__heading">
                    <div>
                        <span>${t('vacationCenter.historyLabel')}</span>
                        <h3>${t('vacationCenter.yearHistory')}</h3>
                    </div>
                    <div class="vacation-center-history__controls">
                        <button type="button" class="vacation-center-history__total-toggle ${this.showAllYearsTotal ? 'is-active' : ''}" data-vc-toggle-all-years aria-expanded="${this.showAllYearsTotal ? 'true' : 'false'}">${t('vacationCenter.allYears')}</button>
                        <button type="button" class="vacation-center-history__step" data-vc-history-step="-1" aria-label="${escapeHtml(t('schedule.board.previousYear'))}" ${canShowPreviousYear ? '' : 'disabled'}>â†</button>
                        <button type="button" class="vacation-center-history__step" data-vc-history-step="1" aria-label="${escapeHtml(t('schedule.board.nextYear'))}" ${canShowNextYear ? '' : 'disabled'}>â†’</button>
                    </div>
                </div>
                ${this.showAllYearsTotal ? `
                    <div class="vacation-center-history__total vacation-center-history__total--${allYears.remainingDays < 0 ? 'danger' : 'positive'}" data-vc-all-years-summary>
                        <div class="vacation-center-history__total-scope">
                            <span>${t('vacationCenter.allYears')}</span>
                            <strong>${t('vacationCenter.allYearsRange', { startYear: allYears.startYear, endYear: allYears.endYear })}</strong>
                        </div>
                        <dl>
                            <div><dt>${t('vacationCenter.totalUsed')}</dt><dd>${allYears.usedDays}</dd></div>
                            <div><dt>${t('vacationCenter.totalRemaining')}</dt><dd>${allYears.remainingDays}</dd></div>
                        </dl>
                        ${allYears.closedYears > 0 ? `<p>${t('vacationCenter.closedYearsExcluded')}</p>` : ''}
                    </div>
                ` : ''}
                <div class="vacation-center-history__rows" style="--vacation-history-columns: ${Math.max(1, history.length)}">
                    ${history.map((item) => `
                        <button type="button" data-vc-history-year="${item.year}" ${item.year === this.currentYear ? 'class="is-current" aria-current="true"' : ''}>
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
                            <span><i class="vacation-center-type-dot vacation-center-type-dot--${normalizeLeaveType(entry.type)}"></i>${this.formatRange(entry.startDate, entry.endDate)} · ${t(`schedule.vacation.types.${normalizeLeaveType(entry.type)}`)}</span>
                            <strong>${calculateEmployeeLeaveUsageByTypeForYear(
                                { ...employee, vacations: [entry] },
                                this.currentYear,
                                this.now(),
                                holidays
                            )[normalizeLeaveType(entry.type)].recordedDays}d</strong>
                        </button>
                    `).join('') : `<p>${t('schedule.vacation.noYearRecords')}</p>`}
                </div>
            </section>
        `;
    }

    renderSelectedInspector() {
        if (this.currentView !== 'balances') return;

        const inspector = this.getRoot()?.querySelector('.vacation-center-inspector');
        if (!inspector) return;

        const employees = this.getEmployees();
        const entries = this.getVacationEntries();
        const holidays = this.dataManager.getHolidaysForYear?.(this.currentYear) || {};
        const employee = employees.find((item) => item.id === this.selectedEmployeeId) || null;
        const row = calculateVacationPlannerYearSummary(employees, this.currentYear, this.now(), holidays).rows
            .find((item) => item.id === this.selectedEmployeeId) || null;

        inspector.innerHTML = employee && row
            ? this.renderInspector(employee, row, entries, holidays)
            : `<div class="vacation-center-empty">${t('vacationCenter.selectColleague')}</div>`;
    }

    selectEmployee(employeeId) {
        if (!employeeId || employeeId === this.selectedEmployeeId) return;

        this.selectedEmployeeId = employeeId;
        this.showAllYearsTotal = false;
        this.editingBalance = false;
        this.getRoot()?.querySelectorAll('[data-vc-select-employee]').forEach((button) => {
            button.classList.toggle('is-selected', button.dataset.vcSelectEmployee === employeeId);
        });
        this.renderSelectedInspector();
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

    renderCalendarWorkspace(employees) {
        const departments = [...new Set(employees.map((employee) => employee.department).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right));
        return `
            <section class="vacation-center-calendar-workspace">
                <div class="vacation-center-calendar-heading">
                    <div>
                        <span>${this.currentYear}</span>
                        <h2>${t('vacationCenter.teamCalendar')}</h2>
                    </div>
                    <div class="vacation-center-calendar-actions">
                        <button type="button" data-vc-print-calendar>${t('vacationCenter.printCalendar')}</button>
                    </div>
                </div>
                <div class="vacation-center-calendar-filters">
                    <label><span>${t('vacationCenter.departmentFilter')}</span><select data-vc-calendar-department>
                        <option value="all">${t('vacationCenter.allDepartments')}</option>
                        ${departments.map((department) => `<option value="${escapeHtml(department)}" ${department === this.calendarDepartment ? 'selected' : ''}>${escapeHtml(department)}</option>`).join('')}
                    </select></label>
                    <label><span>${t('vacationCenter.colleagueFilter')}</span><select data-vc-calendar-employee>
                        <option value="all">${t('vacationCenter.allColleagues')}</option>
                        ${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === this.calendarEmployee ? 'selected' : ''}>${escapeHtml(employee.name)}</option>`).join('')}
                    </select></label>
                    <label><span>${t('schedule.vacation.absenceType')}</span><select data-vc-calendar-type>
                        <option value="all">${t('vacationCenter.allAbsenceTypes')}</option>
                        ${LEAVE_TYPES.map((type) => `<option value="${type}" ${type === this.calendarLeaveType ? 'selected' : ''}>${t(`schedule.vacation.types.${type}`)}</option>`).join('')}
                    </select></label>
                    <div class="vacation-center-calendar-coverage" aria-live="polite">
                        <span><strong data-vc-coverage-colleagues>0</strong>${t('vacationCenter.colleaguesAway')}</span>
                        <span><strong data-vc-coverage-days>0</strong>${t('vacationCenter.leaveDays')}</span>
                        <span><strong data-vc-coverage-records>0</strong>${t('vacationCenter.records')}</span>
                    </div>
                </div>
                <div class="vacation-center-type-legend">
                    ${LEAVE_TYPES.map((type) => `<span><i class="vacation-center-type-dot vacation-center-type-dot--${type}"></i>${t(`schedule.vacation.types.${type}`)}</span>`).join('')}
                </div>
                <div id="vacation-center-calendar"></div>
            </section>
        `;
    }

    getFilteredCalendarEntries(entries) {
        return entries.filter((entry) => {
            if (this.calendarEmployee !== 'all' && entry.employeeId !== this.calendarEmployee) return false;
            if (this.calendarDepartment !== 'all' && entry.employeeDepartment !== this.calendarDepartment) return false;
            if (this.calendarLeaveType !== 'all' && normalizeLeaveType(entry.type) !== this.calendarLeaveType) return false;
            return entry.startDate <= `${this.currentYear}-12-31` && entry.endDate >= `${this.currentYear}-01-01`;
        });
    }

    renderCalendar(entries, employees, holidays = {}) {
        if (typeof FullCalendar === 'undefined') return;

        const todayKey = getLocalDateKey(this.now());
        const yearEntries = this.getFilteredCalendarEntries(entries);
        const events = yearEntries.map((entry) => {
            const status = entry.startDate <= todayKey && entry.endDate >= todayKey
                ? 'away'
                : (entry.startDate > todayKey ? 'planned' : 'taken');
            return {
                title: `${entry.employeeName} · ${t(`schedule.vacation.types.${normalizeLeaveType(entry.type)}`)}`,
                start: entry.startDate,
                end: getEndExclusive(entry.endDate),
                allDay: true,
                classNames: [
                    `vacation-center-event--${status}`,
                    `vacation-center-event--type-${normalizeLeaveType(entry.type)}`
                ],
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
            datesSet: (info) => this.updateCalendarCoverage(
                info.view?.currentStart || info.start,
                info.view?.currentEnd || info.end,
                yearEntries,
                employees,
                holidays
            ),
            height: 'auto'
        });
        this.calendar.render();
    }

    updateCalendarCoverage(periodStart, periodEnd, entries, employees, holidays = {}) {
        const startKey = getLocalDateKey(periodStart);
        const inclusiveEnd = new Date(periodEnd);
        inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
        const endKey = getLocalDateKey(inclusiveEnd);
        const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
        const colleagues = new Set();
        let leaveDays = 0;
        let records = 0;

        entries.forEach((entry) => {
            if (entry.endDate < startKey || entry.startDate > endKey) return;
            records += 1;
            colleagues.add(entry.employeeId);
            leaveDays += this.countEntryWorkingDays(entry, employeesById.get(entry.employeeId), startKey, endKey, holidays);
        });

        const root = this.getRoot();
        const values = {
            '[data-vc-coverage-colleagues]': colleagues.size,
            '[data-vc-coverage-days]': leaveDays,
            '[data-vc-coverage-records]': records
        };
        Object.entries(values).forEach(([selector, value]) => {
            const element = root?.querySelector(selector);
            if (element) element.textContent = String(value);
        });
    }

    countEntryWorkingDays(entry, employee = {}, startKey, endKey, holidays = {}) {
        const rangeStart = entry.startDate > startKey ? entry.startDate : startKey;
        const rangeEnd = entry.endDate < endKey ? entry.endDate : endKey;
        const configuredDays = Array.isArray(employee?.workDays) && employee.workDays.length
            ? new Set(employee.workDays.map(Number))
            : new Set([1, 2, 3, 4, 5]);
        let count = 0;
        for (let date = new Date(`${rangeStart}T00:00:00`); date <= new Date(`${rangeEnd}T00:00:00`); date.setDate(date.getDate() + 1)) {
            const dateKey = getLocalDateKey(date);
            if (configuredDays.has(date.getDay()) && !holidays?.[dateKey]) count += 1;
        }
        return count;
    }

    getReportRows(employees, summary, holidays = {}) {
        return summary.rows.map((row) => {
            const employee = employees.find((item) => item.id === row.id) || {};
            const leaveUsage = calculateEmployeeLeaveUsageByTypeForYear(employee, this.currentYear, this.now(), holidays);
            return {
                name: row.name,
                department: row.department || t('schedule.board.unassignedDepartment'),
                allowance: row.vacationAllowance,
                taken: row.takenDays,
                booked: row.plannedDays,
                remaining: row.vacationBalance,
                carryOver: Number(employee.vacationCarryOverByYear?.[String(this.currentYear)] || 0),
                carryOverExpiry: employee.vacationCarryOverExpiryByYear?.[String(this.currentYear)] || '',
                sick: leaveUsage.sick.recordedDays,
                unpaid: leaveUsage.unpaid.recordedDays,
                parental: leaveUsage.parental.recordedDays,
                training: leaveUsage.training.recordedDays,
                compensatory: leaveUsage.compensatory.recordedDays
            };
        });
    }

    renderReportsWorkspace(employees, summary, holidays, yearPolicy) {
        const rows = this.getReportRows(employees, summary, holidays);
        return `
            <section class="vacation-center-reports">
                <div class="vacation-center-reports__heading">
                    <div><span>${this.currentYear}</span><h2>${t('vacationCenter.reportsTitle')}</h2><p>${t('vacationCenter.reportsDescription')}</p></div>
                    <div><button type="button" data-vc-export-excel>${t('vacationCenter.exportExcel')}</button><button type="button" data-vc-export-pdf>${t('vacationCenter.exportPdf')}</button></div>
                </div>
                <div class="vacation-center-report-table-wrap">
                    <table class="vacation-center-report-table">
                        <thead><tr><th>${t('schedule.vacation.colleague')}</th><th>${t('vacationCenter.departmentFilter')}</th><th>${t('schedule.vacation.allowance')}</th><th>${t('schedule.vacation.taken')}</th><th>${t('schedule.vacation.planned')}</th><th>${t('schedule.vacation.remaining')}</th><th>${t('vacationCenter.carryOver')}</th><th>${t('schedule.vacation.types.sick')}</th><th>${t('vacationCenter.otherLeave')}</th></tr></thead>
                        <tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.department)}</td><td>${row.allowance}</td><td>${row.taken}</td><td>${row.booked}</td><td class="${row.remaining < 0 ? 'is-negative' : ''}">${row.remaining}</td><td>${row.carryOver}${row.carryOverExpiry ? `<small>${t('vacationCenter.untilDate', { date: this.formatDate(row.carryOverExpiry) })}</small>` : ''}</td><td>${row.sick}</td><td>${row.unpaid + row.parental + row.training + row.compensatory}</td></tr>`).join('')}</tbody>
                    </table>
                </div>
                ${yearPolicy?.closed ? `<p class="vacation-center-report-note">${t('vacationCenter.reportClosedYear')}</p>` : ''}
            </section>
        `;
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

        const historyStepButton = event.target.closest('[data-vc-history-step]');
        if (historyStepButton) {
            const employee = this.getEmployees().find((item) => item.id === this.selectedEmployeeId) || null;
            const entranceYear = this.getEmployeeEntranceYear(employee);
            const latestYear = this.getEmployeeLatestYear(employee, this.getVacationEntries());
            const nextYear = this.currentYear + Number(historyStepButton.dataset.vcHistoryStep);
            if ((entranceYear !== null && nextYear < entranceYear) || nextYear > latestYear) return;
            this.currentYear = nextYear;
            this.editingBalance = false;
            this.render();
            return;
        }

        if (event.target.closest('[data-vc-toggle-all-years]')) {
            this.showAllYearsTotal = !this.showAllYearsTotal;
            this.renderSelectedInspector();
            return;
        }

        const employeeButton = event.target.closest('[data-vc-select-employee]');
        if (employeeButton) {
            this.selectEmployee(employeeButton.dataset.vcSelectEmployee);
            return;
        }

        if (event.target.closest('[data-vc-book]')) {
            this.scheduleManager?.openBookVacationModal();
            return;
        }

        if (event.target.closest('[data-vc-toggle-policy]')) {
            this.showYearPolicy = !this.showYearPolicy;
            this.render();
            return;
        }

        if (event.target.closest('[data-vc-reopen-year]')) {
            this.reopenYear();
            return;
        }

        if (event.target.closest('[data-vc-export-excel]')) {
            this.exportReportToExcel();
            return;
        }

        if (event.target.closest('[data-vc-export-pdf]')) {
            this.exportReportToPdf();
            return;
        }

        if (event.target.closest('[data-vc-print-calendar]')) {
            window.print();
            return;
        }

        if (event.target.closest('[data-vc-edit-balance]')) {
            this.editingBalance = true;
            this.renderSelectedInspector();
            return;
        }

        if (event.target.closest('[data-vc-cancel-balance]')) {
            this.editingBalance = false;
            this.renderSelectedInspector();
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
            return;
        }

        if (event.target.matches('[data-vc-calendar-department]')) {
            this.calendarDepartment = event.target.value;
            this.render();
            return;
        }

        if (event.target.matches('[data-vc-calendar-employee]')) {
            this.calendarEmployee = event.target.value;
            this.render();
            return;
        }

        if (event.target.matches('[data-vc-calendar-type]')) {
            this.calendarLeaveType = event.target.value;
            this.render();
        }
    }

    onInput(event) {
        if (!event.target.matches('[data-vc-search]')) return;
        this.searchQuery = event.target.value;
        this.applyRosterFilter(this.searchQuery);
    }

    onSubmit(event) {
        if (event.target.matches('[data-vc-balance-form]')) {
            event.preventDefault();
            const input = event.target.querySelector('input');
            this.saveBalance(Number(event.target.dataset.recordedDays), input?.value);
            return;
        }

        if (event.target.matches('[data-vc-close-year-form]')) {
            event.preventDefault();
            const formData = new FormData(event.target);
            this.closeYear(formData.get('carryOverLimit'), formData.get('expiryDate'));
        }
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
            alert(error?.code === 'vacation-year-closed'
                ? t('vacationCenter.yearClosedError', { year: error.year })
                : t('schedule.vacation.balanceSaveFailed'));
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
            alert(error?.code === 'vacation-year-closed'
                ? t('vacationCenter.yearClosedError', { year: error.year })
                : t('schedule.vacation.balanceSaveFailed'));
        }
    }

    async closeYear(carryOverLimit, expiryDate) {
        if (!confirm(t('vacationCenter.closeYearConfirm', { year: this.currentYear }))) return;
        try {
            await this.dataManager.closeVacationYear(this.currentYear, { carryOverLimit, expiryDate });
            this.render();
        } catch (error) {
            console.error(error);
            alert(t('vacationCenter.yearPolicySaveFailed'));
        }
    }

    async reopenYear() {
        if (!confirm(t('vacationCenter.reopenYearConfirm', { year: this.currentYear }))) return;
        try {
            await this.dataManager.reopenVacationYear(this.currentYear);
            this.render();
        } catch (error) {
            console.error(error);
            alert(t('vacationCenter.yearPolicySaveFailed'));
        }
    }

    getCurrentReportRows() {
        const employees = this.getEmployees();
        const holidays = this.dataManager.getHolidaysForYear?.(this.currentYear) || {};
        const summary = calculateVacationPlannerYearSummary(employees, this.currentYear, this.now(), holidays);
        return this.getReportRows(employees, summary, holidays);
    }

    exportReportToExcel() {
        if (!window.XLSX) {
            alert(t('vacationCenter.exportUnavailable'));
            return;
        }
        const rows = this.getCurrentReportRows().map((row) => ({
            [t('schedule.vacation.colleague')]: row.name,
            [t('vacationCenter.departmentFilter')]: row.department,
            [t('schedule.vacation.allowance')]: row.allowance,
            [t('schedule.vacation.taken')]: row.taken,
            [t('schedule.vacation.planned')]: row.booked,
            [t('schedule.vacation.remaining')]: row.remaining,
            [t('vacationCenter.carryOver')]: row.carryOver,
            [t('vacationCenter.expiryDate')]: row.carryOverExpiry,
            [t('schedule.vacation.types.sick')]: row.sick,
            [t('schedule.vacation.types.unpaid')]: row.unpaid,
            [t('schedule.vacation.types.parental')]: row.parental,
            [t('schedule.vacation.types.training')]: row.training,
            [t('schedule.vacation.types.compensatory')]: row.compensatory
        }));
        const worksheet = window.XLSX.utils.json_to_sheet(rows);
        worksheet['!cols'] = [{ wch: 26 }, { wch: 20 }, ...Array(11).fill({ wch: 14 })];
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, String(this.currentYear));
        window.XLSX.writeFile(workbook, `Atlantic-Holiday-Leave-${this.currentYear}.xlsx`);
    }

    exportReportToPdf() {
        const JsPdf = window.jspdf?.jsPDF || window.jsPDF;
        if (!JsPdf) {
            alert(t('vacationCenter.exportUnavailable'));
            return;
        }
        const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const rows = this.getCurrentReportRows();
        doc.setFillColor(233, 75, 90);
        doc.rect(0, 0, 297, 24, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('Atlantic Holiday', 14, 10);
        doc.setFontSize(10);
        doc.text(`${t('vacationCenter.reportsTitle')} · ${this.currentYear}`, 14, 17);
        doc.autoTable({
            startY: 30,
            head: [[
                t('schedule.vacation.colleague'), t('vacationCenter.departmentFilter'),
                t('schedule.vacation.allowance'), t('schedule.vacation.taken'),
                t('schedule.vacation.planned'), t('schedule.vacation.remaining'),
                t('vacationCenter.carryOver'), t('schedule.vacation.types.sick'),
                t('vacationCenter.otherLeave')
            ]],
            body: rows.map((row) => [
                row.name, row.department, row.allowance, row.taken, row.booked,
                row.remaining, row.carryOver, row.sick,
                row.unpaid + row.parental + row.training + row.compensatory
            ]),
            headStyles: { fillColor: [233, 75, 90], textColor: 255 },
            alternateRowStyles: { fillColor: [248, 250, 252] },
            styles: { fontSize: 8 }
        });
        doc.save(`Atlantic-Holiday-Leave-${this.currentYear}.pdf`);
    }

    formatDate(dateKey) {
        if (!dateKey) return '—';
        const locale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' })
            .format(new Date(`${dateKey}T00:00:00`));
    }

    formatRange(startDate, endDate) {
        const locale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        const formatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' });
        return `${formatter.format(new Date(`${startDate}T00:00:00`))} – ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
    }
}
