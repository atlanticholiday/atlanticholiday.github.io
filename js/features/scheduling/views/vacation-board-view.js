import { t } from '../../../core/i18n.js';
import { getScheduleLocale } from './schedule-view-helpers.js';
import {
    buildVacationBoardRows,
    buildVacationBoardSummary,
    getVacationBoardDepartmentOptions,
    VACATION_BOARD_ALL_DEPARTMENTS,
    VACATION_BOARD_UNASSIGNED_DEPARTMENT
} from './vacation-board-view-model.js';

function getInitials(name = '') {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'NA';
}

function formatRange(startDate, endDate, locale) {
    const formatter = new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: 'short'
    });

    return `${formatter.format(new Date(`${startDate}T00:00:00`))} - ${formatter.format(new Date(`${endDate}T00:00:00`))}`;
}

function renderMetric(label, value, accentClass = 'text-white') {
    return `
        <div class="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">${label}</div>
            <div class="mt-2 text-2xl font-semibold ${accentClass}">${value}</div>
        </div>
    `;
}

function renderDepartmentOptions(employees) {
    const options = getVacationBoardDepartmentOptions(employees);

    return [
        `<option value="${VACATION_BOARD_ALL_DEPARTMENTS}">${t('schedule.board.allDepartments')}</option>`,
        ...options.map((option) => {
            const label = option === VACATION_BOARD_UNASSIGNED_DEPARTMENT
                ? t('schedule.board.unassignedDepartment')
                : option;
            return `<option value="${option}">${label}</option>`;
        })
    ].join('');
}

export function renderVacationBoardView(uiManager) {
    const dataManager = uiManager.dataManager;
    const container = document.getElementById('vacation-board-container');
    if (!container) {
        return;
    }

    const currentDate = dataManager.getCurrentDate();
    const year = currentDate.getFullYear();
    const locale = getScheduleLocale();
    const employees = dataManager.getActiveEmployees();
    const vacationEntries = dataManager.getSharedVacationEntries();
    const currentEmployeeId = dataManager.getCurrentUserEmployee()?.id || null;
    const filters = uiManager.vacationBoardFilters || {
        search: '',
        department: VACATION_BOARD_ALL_DEPARTMENTS
    };
    const rows = buildVacationBoardRows(employees, vacationEntries, year, {
        ...filters,
        currentEmployeeId
    });
    const visibleEmployees = employees.filter((employee) => rows.some((row) => row.id === employee.id));
    const summary = buildVacationBoardSummary(visibleEmployees, vacationEntries, year);
    const currentMonth = new Date().getMonth();
    const isCurrentYear = year === new Date().getFullYear();

    container.innerHTML = `
        <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <section class="overflow-hidden rounded-[34px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                <div class="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,1)_0%,rgba(30,41,59,1)_55%,rgba(59,130,246,0.88)_100%)] px-5 py-6 text-white lg:flex lg:items-start lg:justify-between lg:px-6">
                    <div class="max-w-2xl">
                        <div class="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                            ${t('schedule.board.readOnly')}
                        </div>
                        <h3 class="mt-4 text-2xl font-semibold tracking-tight lg:text-3xl">${t('schedule.board.title')}</h3>
                        <p class="mt-3 max-w-xl text-sm leading-6 text-slate-200">${t('schedule.board.subtitle')}</p>
                    </div>
                    <div class="mt-5 flex items-center gap-2 lg:mt-0">
                        <button type="button" data-board-year-nav="prev" class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="${t('schedule.board.previousYear')}">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                            </svg>
                        </button>
                        <div class="min-w-[7rem] rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-lg font-semibold tracking-[0.08em] text-white">${year}</div>
                        <button type="button" data-board-year-nav="next" class="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="${t('schedule.board.nextYear')}">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="border-b border-slate-200 bg-slate-50/80 px-5 py-4 lg:px-6">
                    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px_auto]">
                        <label class="block">
                            <span class="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${t('schedule.board.searchLabel')}</span>
                            <input
                                id="vacation-board-search"
                                type="search"
                                value="${escapeAttribute(filters.search || '')}"
                                placeholder="${escapeAttribute(t('schedule.board.searchPlaceholder'))}"
                                class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400">
                        </label>
                        <label class="block">
                            <span class="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${t('schedule.board.departmentLabel')}</span>
                            <select id="vacation-board-department" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-colors focus:border-slate-400">
                                ${renderDepartmentOptions(employees)}
                            </select>
                        </label>
                        <div class="flex items-end">
                            <button type="button" id="vacation-board-clear-filters" class="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-100 lg:w-auto">
                                ${t('schedule.board.clearFilters')}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <div class="min-w-[1120px]">
                        <div class="grid grid-cols-[240px_repeat(12,minmax(72px,1fr))] border-b border-slate-200 bg-slate-950 text-white">
                            <div class="sticky left-0 z-10 border-r border-white/10 bg-slate-950 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">${t('schedule.board.colleagueColumn')}</div>
                            ${Array.from({ length: 12 }, (_, monthIndex) => {
                                const label = new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, monthIndex, 1));
                                const currentMonthClass = isCurrentYear && monthIndex === currentMonth
                                    ? 'bg-white/8 text-white'
                                    : 'text-slate-300';

                                return `
                                    <div class="border-r border-white/10 px-2 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] ${currentMonthClass}">
                                        ${label}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                        ${rows.length ? rows.map((row, rowIndex) => `
                            <div class="grid grid-cols-[240px_repeat(12,minmax(72px,1fr))] border-b border-slate-200/80 last:border-b-0">
                                <div class="sticky left-0 z-[1] border-r px-4 py-4 ${row.isCurrentUser ? 'border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,1)_0%,rgba(248,250,252,1)_100%)]' : `border-slate-200 ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}">
                                    <div class="flex items-start gap-3">
                                        <div class="flex h-11 w-11 items-center justify-center rounded-2xl ${row.isCurrentUser ? 'bg-sky-700' : 'bg-slate-950'} text-sm font-semibold text-white shadow-sm">${getInitials(row.name)}</div>
                                        <div class="min-w-0">
                                            <div class="flex items-center gap-2">
                                                <div class="truncate text-sm font-semibold text-slate-950">${row.name}</div>
                                                ${row.isCurrentUser ? `<span class="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">${t('schedule.board.youBadge')}</span>` : ''}
                                            </div>
                                            <div class="mt-1 text-xs text-slate-500">${row.department || t('schedule.board.unassignedDepartment')}</div>
                                            <div class="mt-3 flex flex-wrap gap-2">
                                                <span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">${row.totalBookedDays} ${t('schedule.board.daysBooked')}</span>
                                                ${row.awayToday ? `<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">${t('schedule.board.awayTodayBadge')}</span>` : ''}
                                                ${!row.totalBookedDays ? `<span class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">${t('schedule.board.availableBadge')}</span>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                ${row.monthSegments.map(({ monthIndex, segments }) => {
                                    const currentMonthCellClass = isCurrentYear && monthIndex === currentMonth
                                        ? (row.isCurrentUser ? 'bg-sky-50/70' : 'bg-slate-50/80')
                                        : (row.isCurrentUser ? 'bg-sky-50/35' : '');

                                    return `
                                        <div class="border-r border-slate-100 px-2 py-3 ${currentMonthCellClass}">
                                            <div class="min-h-[88px] space-y-2 rounded-[22px] ${segments.length ? (row.isCurrentUser ? 'bg-sky-50/80 px-2 py-2' : 'bg-rose-50/50 px-2 py-2') : ''}">
                                                ${segments.map((segment) => `
                                                    <div
                                                        title="${escapeAttribute(formatRange(segment.startDate, segment.endDate, locale))}"
                                                        class="rounded-2xl border ${row.isCurrentUser ? 'border-sky-200 text-sky-700' : 'border-rose-200 text-rose-700'} bg-white px-2.5 py-2 text-[11px] font-semibold shadow-sm">
                                                        <span class="opacity-80">${segment.continuesFromPrevious ? '&larr;' : ''}</span>${segment.label}<span class="opacity-80">${segment.continuesToNext ? '&rarr;' : ''}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `).join('') : `
                            <div class="px-6 py-16 text-center">
                                <div class="mx-auto max-w-md">
                                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">${t('schedule.board.readOnly')}</div>
                                    <h4 class="mt-3 text-2xl font-semibold text-slate-950">${t('schedule.board.emptyTitle')}</h4>
                                    <p class="mt-3 text-sm leading-6 text-slate-500">${t('schedule.board.emptyBody')}</p>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            </section>
            <aside class="space-y-5">
                <section class="rounded-[30px] bg-slate-950 px-5 py-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">${t('schedule.board.summaryLabel')}</div>
                    <div class="mt-4 space-y-4">
                        ${renderMetric(t('schedule.board.summaryAwayToday'), String(summary.awayTodayCount), 'text-white')}
                        ${renderMetric(t('schedule.board.summaryPlanned'), String(summary.plannedColleaguesCount), 'text-rose-200')}
                        ${renderMetric(
                            t('schedule.board.summaryPeakMonth'),
                            summary.busiestMonthCount > 0
                                ? `${new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, summary.busiestMonthIndex, 1))} (${summary.busiestMonthCount})`
                                : t('schedule.board.noPeakMonth'),
                            summary.busiestMonthCount > 0 ? 'text-sky-200' : 'text-slate-300'
                        )}
                        ${renderMetric(
                            t('schedule.board.summaryNextDeparture'),
                            summary.nextDeparture
                                ? formatRange(summary.nextDeparture.startDate, summary.nextDeparture.endDate, locale)
                                : t('schedule.board.noNextDeparture'),
                            summary.nextDeparture ? 'text-amber-200' : 'text-slate-300'
                        )}
                    </div>
                </section>
                <section class="rounded-[30px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${t('schedule.board.upcomingLabel')}</div>
                            <h4 class="mt-2 text-lg font-semibold text-slate-950">${t('schedule.board.upcomingTitle')}</h4>
                        </div>
                        <div class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">${summary.upcomingVacations.length}</div>
                    </div>
                    <p class="mt-3 text-sm leading-6 text-slate-500">${t('schedule.board.readOnlyNote')}</p>
                    <div class="mt-5 space-y-3">
                        ${summary.upcomingVacations.length ? summary.upcomingVacations.map((vacationEntry) => `
                            <div class="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                                <div class="flex items-center justify-between gap-3">
                                    <div class="min-w-0">
                                        <div class="truncate text-sm font-semibold text-slate-950">${vacationEntry.employeeName}</div>
                                        <div class="mt-1 text-xs text-slate-500">${vacationEntry.employeeDepartment || t('schedule.board.unassignedDepartment')}</div>
                                    </div>
                                    <div class="text-right text-xs font-semibold uppercase tracking-[0.14em] text-rose-600">
                                        ${formatRange(vacationEntry.startDate, vacationEntry.endDate, locale)}
                                    </div>
                                </div>
                            </div>
                        `).join('') : `
                            <div class="rounded-[22px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
                                ${t('schedule.board.noUpcoming')}
                            </div>
                        `}
                    </div>
                </section>
            </aside>
        </div>
    `;

    const searchInput = container.querySelector('#vacation-board-search');
    const departmentSelect = container.querySelector('#vacation-board-department');
    const clearFiltersButton = container.querySelector('#vacation-board-clear-filters');

    if (departmentSelect) {
        departmentSelect.value = filters.department || VACATION_BOARD_ALL_DEPARTMENTS;
        departmentSelect.addEventListener('change', () => {
            uiManager.vacationBoardFilters = {
                ...filters,
                department: departmentSelect.value
            };
            renderVacationBoardView(uiManager);
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            uiManager.vacationBoardFilters = {
                ...filters,
                search: searchInput.value
            };
            renderVacationBoardView(uiManager);
        });
    }

    clearFiltersButton?.addEventListener('click', () => {
        uiManager.vacationBoardFilters = {
            search: '',
            department: VACATION_BOARD_ALL_DEPARTMENTS
        };
        renderVacationBoardView(uiManager);
    });

    container.querySelectorAll('[data-board-year-nav]').forEach((button) => {
        button.addEventListener('click', () => {
            const direction = button.getAttribute('data-board-year-nav') === 'next' ? 1 : -1;
            dataManager.setCurrentDate(new Date(year + direction, currentDate.getMonth(), 1));
            uiManager.updateView();
        });
    });
}

function escapeAttribute(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
