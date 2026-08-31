import { t } from '../../../core/i18n.js';
import { getScheduleLocale } from './schedule-view-helpers.js';

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
}

export function renderMonthlyCalendarView(uiManager) {
    const dataManager = uiManager.dataManager;
    const currentDate = dataManager.getCurrentDate();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    const locale = getScheduleLocale();
    const daySummaries = buildMonthDaySummaries(dataManager, year, month, locale);
    grid.innerHTML = '';
    getWeekdayLabels(locale).forEach((label) => {
        const heading = document.createElement('div');
        heading.className = 'schedule-weekday';
        heading.textContent = label;
        grid.appendChild(heading);
    });
    const firstDayIndex = getWeekdayOffset(new Date(year, month, 1));
    const appendPlaceholder = () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'schedule-day-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        grid.appendChild(placeholder);
    };
    for (let i = 0; i < firstDayIndex; i += 1) appendPlaceholder();
    daySummaries.forEach((summary) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = getDayClassName(summary);
        cell.dataset.date = summary.dateKey;
        cell.setAttribute('aria-label', getDayLabel(summary, locale));
        if (summary.isToday) cell.setAttribute('aria-current', 'date');
        cell.innerHTML = `
            <div class="schedule-day-cell__top">
                ${summary.isSkeletonCrew ? `<span class="schedule-day-alert">${t('schedule.calendar.understaffed')}</span>` : ''}
                <span class="schedule-day-cell__number">${summary.dayNumber}</span>
            </div>
            <div class="schedule-day-cell__body">${renderDayContent(summary)}</div>
        `;
        grid.appendChild(cell);
    });
    const trailingDays = (7 - ((firstDayIndex + daySummaries.length) % 7)) % 7;
    for (let i = 0; i < trailingDays; i += 1) appendPlaceholder();
    renderMonthlyCalendarMobileCards(uiManager, daySummaries);
}

export function renderMonthlyCalendarMobileCards(uiManager, providedSummaries = null) {
    const dataManager = uiManager.dataManager;
    const container = document.getElementById('calendar-mobile-cards');
    if (!container) return;
    const date = dataManager.getCurrentDate();
    const locale = getScheduleLocale();
    const summaries = providedSummaries || buildMonthDaySummaries(dataManager, date.getFullYear(), date.getMonth(), locale);
    container.innerHTML = summaries.map((summary) => `
        <button type="button" class="${getDayClassName(summary, true)}" data-date="${summary.dateKey}"
            aria-label="${escapeHtml(getDayLabel(summary, locale))}" ${summary.isToday ? 'aria-current="date"' : ''}>
            <span class="schedule-mobile-date">
                <span class="schedule-mobile-weekday">${summary.weekdayLabel}</span>
                <span class="schedule-day-cell__number">${summary.dayNumber}</span>
            </span>
            <span class="schedule-day-cell__body">
                ${renderDayContent(summary)}
                ${summary.isSkeletonCrew ? `<span class="schedule-day-alert">${t('schedule.calendar.understaffed')}</span>` : ''}
            </span>
            <span class="schedule-mobile-arrow" aria-hidden="true">›</span>
        </button>
    `).join('');
}

function renderDayContent(summary) {
    return `
        <span class="schedule-day-working"><strong>${summary.workingCount}</strong> ${t('schedule.calendar.working')}</span>
        ${summary.holidayName ? `<span class="schedule-day-holiday">${escapeHtml(summary.holidayName)}</span>` : ''}
        ${summary.isWeekend && !summary.holidayName ? `<span class="schedule-day-off">${t('schedule.legend.offWeekend')}</span>` : ''}
        ${summary.absentCount || summary.vacationCount ? `<span class="schedule-day-exceptions">
            ${summary.absentCount ? `<span class="schedule-day-absent">${summary.absentCount} ${t('schedule.calendar.absent')}</span>` : ''}
            ${summary.vacationCount ? `<span class="schedule-day-vacation">${summary.vacationCount} ${t('schedule.calendar.onVacation')}</span>` : ''}
        </span>` : ''}
        ${summary.dailyNote ? `<span class="schedule-day-note" title="${escapeHtml(summary.dailyNote)}">${escapeHtml(summary.dailyNote)}</span>` : ''}
    `;
}

function getDayClassName(summary, mobile = false) {
    return [mobile ? 'day-card' : 'day-cell', 'schedule-day-cell',
        summary.isWeekend ? 'schedule-day-cell--quiet' : '',
        summary.isToday ? 'schedule-day-cell--today' : ''].filter(Boolean).join(' ');
}

function getDayLabel(summary, locale) {
    const date = new Date(`${summary.dateKey}T12:00:00`);
    return [new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date),
        `${summary.workingCount} ${t('schedule.calendar.working')}`,
        summary.holidayName,
        summary.absentCount ? `${summary.absentCount} ${t('schedule.calendar.absent')}` : '',
        summary.vacationCount ? `${summary.vacationCount} ${t('schedule.calendar.onVacation')}` : '',
        summary.isSkeletonCrew ? t('schedule.calendar.understaffed') : '',
        summary.dailyNote].filter(Boolean).join(', ');
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
            isToday: dateKey === dataManager.getDateKey(new Date()),
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
