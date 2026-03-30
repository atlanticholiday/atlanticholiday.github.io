import { t } from '../../../core/i18n.js';
import { getScheduleLocale } from './schedule-view-helpers.js';

export function renderMonthlyCalendarView(uiManager) {
    const dataManager = uiManager.dataManager;
    const currentDate = dataManager.getCurrentDate();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const grid = document.getElementById('calendar-grid');
    if (!grid) {
        return;
    }

    const locale = getScheduleLocale();
    const daySummaries = buildMonthDaySummaries(dataManager, year, month, locale);
    grid.innerHTML = '';

    getWeekdayLabels(locale).forEach((label) => {
        const heading = document.createElement('div');
        heading.className = 'px-2 pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400';
        heading.textContent = label;
        grid.appendChild(heading);
    });

    const firstDayIndex = getWeekdayOffset(new Date(year, month, 1));
    for (let i = 0; i < firstDayIndex; i += 1) {
        grid.appendChild(document.createElement('div'));
    }

    daySummaries.forEach((summary) => {
        const dayCell = document.createElement('button');
        dayCell.type = 'button';
        dayCell.className = getDayCellClassName(summary);
        dayCell.dataset.date = summary.dateKey;
        dayCell.title = getDayCellTitle(summary);
        dayCell.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="text-[11px] font-semibold uppercase tracking-[0.16em] ${summary.isHoliday ? 'text-amber-700' : 'text-slate-400'}">${summary.weekdayLabel}</div>
                    <div class="mt-2 text-3xl font-semibold ${summary.isHoliday ? 'text-amber-950' : 'text-slate-950'}">${summary.dayNumber}</div>
                </div>
                <div class="flex items-center gap-2">
                    ${summary.dailyNote ? `
                        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-white/90 text-sky-600 shadow-sm" title="${summary.dailyNote}">
                            ${getNoteIconMarkup()}
                        </span>
                    ` : ''}
                    ${summary.isSkeletonCrew ? `
                        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-600 shadow-sm" title="${t('schedule.calendar.understaffed')}">
                            ${getAlertIconMarkup()}
                        </span>
                    ` : ''}
                    <span class="inline-flex min-w-[3rem] items-center justify-center rounded-full px-3 py-1 text-sm font-semibold ${summary.isSkeletonCrew ? 'bg-rose-600 text-white' : 'bg-slate-950 text-white'}">
                        ${summary.workingCount}
                    </span>
                </div>
            </div>
            <div class="mt-5 flex-1">
                ${summary.holidayName ? `
                    <div class="inline-flex items-center rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                        ${t('schedule.legend.holiday')}
                    </div>
                    <div class="mt-3 text-sm font-medium text-amber-900">${truncateText(summary.holidayName, 32)}</div>
                ` : `
                    <div class="text-sm font-medium text-slate-700">${summary.isWeekend ? t('schedule.legend.offWeekend') : t('schedule.calendar.working')}</div>
                    <div class="mt-2 text-xs text-slate-500">${t('schedule.viewDescriptions.monthlyShort')}</div>
                `}
            </div>
            <div class="mt-5 flex flex-wrap gap-2">
                ${summary.absentCount > 0 ? `<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">${summary.absentCount} ${t('schedule.calendar.absent')}</span>` : ''}
                ${summary.vacationCount > 0 ? `<span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">${summary.vacationCount} ${t('schedule.calendar.onVacation')}</span>` : ''}
                ${summary.absentCount === 0 && summary.vacationCount === 0 ? `<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">${t('schedule.workspace.clearDay')}</span>` : ''}
            </div>
        `;

        grid.appendChild(dayCell);
    });

    renderMonthlyCalendarMobileCards(uiManager, daySummaries);
}

export function renderMonthlyCalendarMobileCards(uiManager, providedSummaries = null) {
    const dataManager = uiManager.dataManager;
    const container = document.getElementById('calendar-mobile-cards');
    if (!container) {
        return;
    }

    const currentDate = dataManager.getCurrentDate();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const locale = getScheduleLocale();
    const daySummaries = providedSummaries || buildMonthDaySummaries(dataManager, year, month, locale);

    container.innerHTML = daySummaries.map((summary) => `
        <button
            type="button"
            class="${getMobileDayCardClassName(summary)}"
            data-date="${summary.dateKey}"
            title="${getDayCellTitle(summary)}">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] ${summary.isHoliday ? 'text-amber-700' : 'text-slate-400'}">${summary.weekdayLabel}</div>
                    <div class="mt-2 text-3xl font-semibold ${summary.isHoliday ? 'text-amber-950' : 'text-slate-950'}">${summary.dayNumber}</div>
                </div>
                <div class="flex items-center gap-2">
                    ${summary.dailyNote ? `<span class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-white/90 text-sky-600 shadow-sm">${getNoteIconMarkup()}</span>` : ''}
                    ${summary.isSkeletonCrew ? `<span class="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-200 bg-white/90 text-rose-600 shadow-sm">${getAlertIconMarkup()}</span>` : ''}
                    <span class="inline-flex min-w-[3rem] items-center justify-center rounded-full px-3 py-1 text-sm font-semibold ${summary.isSkeletonCrew ? 'bg-rose-600 text-white' : 'bg-slate-950 text-white'}">${summary.workingCount}</span>
                </div>
            </div>
            <div class="mt-4 text-left">
                <div class="text-sm font-medium ${summary.isHoliday ? 'text-amber-900' : 'text-slate-700'}">
                    ${summary.holidayName ? truncateText(summary.holidayName, 64) : (summary.isWeekend ? t('schedule.legend.offWeekend') : t('schedule.calendar.working'))}
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                    ${summary.absentCount > 0 ? `<span class="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">${summary.absentCount} ${t('schedule.calendar.absent')}</span>` : ''}
                    ${summary.vacationCount > 0 ? `<span class="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">${summary.vacationCount} ${t('schedule.calendar.onVacation')}</span>` : ''}
                    ${summary.absentCount === 0 && summary.vacationCount === 0 ? `<span class="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">${t('schedule.workspace.clearDay')}</span>` : ''}
                </div>
            </div>
        </button>
    `).join('');
}

function buildMonthDaySummaries(dataManager, year, month, locale) {
    const currentYearHolidays = dataManager.getHolidaysForYear(year);
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: daysInMonth }, (_, index) => {
        const dayNumber = index + 1;
        const date = new Date(year, month, dayNumber);
        const dateKey = dataManager.getDateKey(date);
        const holidayName = currentYearHolidays[dateKey];
        const dailyNote = dataManager.getDailyNote(dateKey);
        const workingCount = dataManager.getActiveEmployees().filter((employee) => {
            return dataManager.getEmployeeStatusForDate(employee, date) === 'Working';
        }).length;

        let absentCount = 0;
        let vacationCount = 0;
        dataManager.getActiveEmployees().forEach((employee) => {
            const status = dataManager.getEmployeeStatusForDate(employee, date);
            if (status === 'On Vacation' || status === 'Vacation') {
                vacationCount += 1;
            } else if (['Absent', 'Sick', 'Personal', 'Unjustified'].includes(status)) {
                absentCount += 1;
            }
        });

        const threshold = dataManager.minStaffThreshold || 0;
        const isSkeletonCrew = threshold > 0 && workingCount < threshold && !holidayName;

        return {
            dateKey,
            dayNumber,
            holidayName,
            dailyNote,
            workingCount,
            absentCount,
            vacationCount,
            isSkeletonCrew,
            isHoliday: Boolean(holidayName),
            isWeekend: [0, 6].includes(date.getDay()),
            weekdayLabel: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
        };
    });
}

function getWeekdayLabels(locale) {
    return Array.from({ length: 7 }, (_, index) => {
        return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2024, 0, 1 + index));
    });
}

function getWeekdayOffset(date) {
    return (date.getDay() + 6) % 7;
}

function getDayCellClassName(summary) {
    if (summary.isHoliday) {
        return 'day-cell group relative flex min-h-[9rem] flex-col overflow-hidden rounded-[26px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1)_0%,rgba(254,243,199,0.8)_100%)] px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md';
    }

    if (summary.isSkeletonCrew) {
        return 'day-cell group relative flex min-h-[9rem] flex-col overflow-hidden rounded-[26px] border border-rose-200 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(255,241,242,1)_100%)] px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md';
    }

    if (summary.isWeekend) {
        return 'day-cell group relative flex min-h-[9rem] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-slate-50/90 px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md';
    }

    return 'day-cell group relative flex min-h-[9rem] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md';
}

function getMobileDayCardClassName(summary) {
    if (summary.isHoliday) {
        return 'day-card w-full rounded-[24px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1)_0%,rgba(254,243,199,0.8)_100%)] px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md';
    }

    if (summary.isSkeletonCrew) {
        return 'day-card w-full rounded-[24px] border border-rose-200 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(255,241,242,1)_100%)] px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md';
    }

    if (summary.isWeekend) {
        return 'day-card w-full rounded-[24px] border border-slate-200 bg-slate-50/90 px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md';
    }

    return 'day-card w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md';
}

function getDayCellTitle(summary) {
    if (summary.holidayName) {
        return summary.holidayName;
    }

    if (summary.dailyNote) {
        return summary.dailyNote;
    }

    return `${summary.workingCount} ${t('schedule.calendar.working')}`;
}

function truncateText(value, maxLength) {
    if (!value || value.length <= maxLength) {
        return value || '';
    }

    return `${value.slice(0, maxLength - 1)}...`;
}

function getNoteIconMarkup() {
    return `
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M4 3.75A1.75 1.75 0 0 1 5.75 2h5.19c.464 0 .909.184 1.237.513l2.31 2.31c.329.328.513.773.513 1.237v8.19A1.75 1.75 0 0 1 13.25 16H5.75A1.75 1.75 0 0 1 4 14.25v-10.5Zm6 .75v2.25c0 .414.336.75.75.75H13.5L10 4.5Z" />
        </svg>
    `;
}

function getAlertIconMarkup() {
    return `
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l5.58 9.92c.75 1.334-.213 2.981-1.742 2.981H4.42c-1.53 0-2.492-1.647-1.742-2.98l5.58-9.921ZM11 7a1 1 0 1 0-2 0v3a1 1 0 0 0 2 0V7Zm-1 7a1.25 1.25 0 1 0 0-2.5A1.25 1.25 0 0 0 10 14Z" clip-rule="evenodd" />
        </svg>
    `;
}
