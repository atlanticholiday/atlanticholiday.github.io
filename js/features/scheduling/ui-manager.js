import { Config } from '../../core/config.js';
import { i18n, t } from '../../core/i18n.js';
import { formatLocalDateTime, formatTimeLabel } from './attendance-records.js';
import { SCHEDULE_VIEWS } from './schedule-view-config.js';
import { filterTimeClockStationEmployees, getTimeClockStationEmployeeInitials } from './time-clock-station.js';
import { renderMadeiraReferenceView } from './views/madeira-reference-view.js';
import { renderMonthlyCalendarMobileCards, renderMonthlyCalendarView } from './views/monthly-schedule-view.js';
import { renderVacationBoardView } from './views/vacation-board-view.js';
import { getScheduleViewMeta, renderScheduleAccessBanner, renderScheduleWorkspaceSummary } from './views/schedule-shell-view.js';
import { renderStatsScheduleView } from './views/stats-schedule-view.js';
import { renderYearlySummaryView } from './views/yearly-schedule-view.js';

export class UIManager {
    constructor(dataManager, pdfGenerator) {
        this.dataManager = dataManager;
        this.pdfGenerator = pdfGenerator;
        this.isStaffMode = false; // Staff read-only mode
        this.liveClockTimer = null;
        this.currentTimesheetEmployeeId = null;
        this.timeClockStationPreviewEnabled = false;
        this.timeClockStationEmployeeId = null;
        this.timeClockStationSearch = '';
        this.timeClockStationFeedback = '';
        this.timeClockStationFeedbackTone = 'success';
        this.timeClockStationResetTimer = null;
        this.vacationBoardFilters = {
            search: '',
            department: 'all'
        };

        this.dataManager.subscribeToDataChanges(() => {
            this.updateView();
            this.renderTimeClockPage();

            // Refresh day details modal if it's open
            if (document.getElementById('day-details-modal').classList.contains('hidden') === false) {
                this.showDayDetailsModal(this.dataManager.getSelectedDateKey());
            }
        });

        this.startLiveClock();

    }

    startLiveClock() {
        if (this.liveClockTimer) {
            clearInterval(this.liveClockTimer);
        }

        this.liveClockTimer = setInterval(() => {
            const now = new Date();
            const currentTime = document.getElementById('time-clock-current-time');
            const currentDate = document.getElementById('time-clock-current-date');

            if (currentTime) {
                currentTime.textContent = now.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });
            }

            if (currentDate) {
                currentDate.textContent = now.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                });
            }

            document.querySelectorAll('[data-live-duration-start]').forEach((element) => {
                const startedAt = element.dataset.liveDurationStart;
                if (!startedAt) return;
                element.textContent = this.formatMinutesAsDuration(this.getMinutesBetween(startedAt, formatLocalDateTime(now)));
            });
        }, 1000);
    }

    getMinutesBetween(startDateTime, endDateTime) {
        const start = new Date(startDateTime);
        const end = new Date(endDateTime);
        return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
    }

    formatMinutesAsDuration(minutes) {
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return '00:00';
        }

        const safeMinutes = Math.max(0, Math.round(minutes));
        const hours = Math.floor(safeMinutes / 60);
        const remainder = safeMinutes % 60;
        return `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }

    populateDayCheckboxes() {
        const container = document.getElementById('work-day-checkboxes');
        if (!container) return;

        container.innerHTML = Config.DAYS_OF_WEEK.map((day, index) => `
            <label class="p-1 border rounded-md cursor-pointer">
                <input type="checkbox" value="${index}" class="sr-only work-day-checkbox">
                <span class="block p-1">${day}</span>
            </label>
        `).join('');
    }

    // Removed showSetupScreen - navigation is now handled by NavigationManager

    renderEmployeeList() {
        // Deprecated: Staff list moved to StaffManager on dedicated page.
    }

    renderCalendarGrid() {
        const month = this.dataManager.getCurrentDate().getMonth();
        const year = this.dataManager.getCurrentDate().getFullYear();
        const currentYearHolidays = this.dataManager.getHolidaysForYear(year);

        const grid = document.getElementById('calendar-grid');
        if (!grid) return;
        grid.innerHTML = '';
        Config.DAYS_OF_WEEK.forEach(day => grid.innerHTML += `<div class="text-center font-bold text-gray-500 text-sm">${day}</div>`);

        const firstDayIndex = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement('div'));

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = this.dataManager.getDateKey(date);
            const holidayName = currentYearHolidays[dateKey];
            const dailyNote = this.dataManager.getDailyNote(dateKey);

            const workingCount = this.dataManager.getActiveEmployees().filter(emp =>
                this.dataManager.getEmployeeStatusForDate(emp, date) === 'Working'
            ).length;

            // Skeleton Crew Check
            const threshold = this.dataManager.minStaffThreshold || 0;
            const isSkeletonCrew = threshold > 0 && workingCount < threshold && !holidayName;
            const skeletonClass = isSkeletonCrew ? 'border-red-400 bg-red-50' : '';
            const skeletonTextClass = isSkeletonCrew ? 'text-red-600' : 'text-green-600';
            const skeletonIcon = isSkeletonCrew ? '<span class="absolute top-1 right-1 text-red-500 text-xs" title="Understaffed">⚠</span>' : '';

            // Count absences and vacations
            let absentCount = 0;
            let vacationCount = 0;
            this.dataManager.getActiveEmployees().forEach(emp => {
                const status = this.dataManager.getEmployeeStatusForDate(emp, date);
                if (status === 'On Vacation' || status === 'Vacation') vacationCount++;
                else if (['Absent', 'Sick', 'Personal', 'Unjustified'].includes(status)) absentCount++;
            });

            const dayCell = document.createElement('div');
            // Add skeletonClass
            dayCell.className = `day-cell p-2 border rounded-lg flex flex-col items-center justify-center h-24 sm:h-28 relative ${skeletonClass}`;
            if ([0, 6].includes(date.getDay()) && !holidayName && !isSkeletonCrew) dayCell.classList.add('bg-gray-50');
            if (holidayName) {
                dayCell.classList.add('holiday');
                dayCell.title = holidayName;
            }

            dayCell.dataset.date = dateKey;

            // Indicators HTML
            let indicatorsHtml = '<div class="flex gap-1 mt-1 justify-center absolute bottom-2 left-0 right-0">';
            if (absentCount > 0) {
                indicatorsHtml += `<span class="bg-red-500 rounded-full w-2 h-2" title="${absentCount} ${t('schedule.calendar.absent')}"></span>`;
            }
            if (vacationCount > 0) {
                indicatorsHtml += `<span class="bg-yellow-400 rounded-full w-2 h-2" title="${vacationCount} ${t('schedule.calendar.onVacation')}"></span>`;
            }
            indicatorsHtml += '</div>';

            // Daily Note Icon
            const noteIconHtml = dailyNote
                ? `<div class="absolute top-1 left-2 text-blue-500" title="${dailyNote}">
                     <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                   </div>`
                : '';

            if (holidayName) {
                // Holiday day layout
                dayCell.innerHTML = `
                    ${noteIconHtml}
                    <div class="absolute top-1 right-1 text-yellow-600 text-sm" title="${holidayName}">★</div>
                    <div class="text-2xl font-bold text-gray-800 mb-1">${day}</div>
                    <div class="text-xs text-yellow-700 font-medium text-center px-1 py-0.5 bg-yellow-200 rounded max-w-full overflow-hidden"
                         style="font-size: 10px; line-height: 1.2;">
                        ${holidayName.length > 12 ? holidayName.substring(0, 10) + '...' : holidayName}
                    </div>
                    <div class="mt-1 flex items-center justify-center text-yellow-600">
                        <svg class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                        </svg>
                        <span class="text-lg font-bold">${workingCount}</span>
                    </div>
                    ${indicatorsHtml}
                `;
            } else {
                // Regular day layout  
                dayCell.innerHTML = `
                    ${noteIconHtml}
                    ${skeletonIcon}
                    <div class="text-lg font-semibold">${day}</div>
                    <div class="mt-2 flex items-center space-x-2 ${skeletonTextClass}">
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        <span class="text-xl font-bold">${workingCount}</span>
                    </div>
                    <div class="text-xs text-gray-500">${t('schedule.calendar.working')}</div>
                    ${indicatorsHtml}
                `;
            }
            grid.appendChild(dayCell);
        }

        // Render mobile cards
        this.renderCalendarMobileCards();
    }

    renderCalendarMobileCards() {
        const container = document.getElementById('calendar-mobile-cards');
        if (!container) return;

        container.innerHTML = '';
        const currentDate = this.dataManager.getCurrentDate();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const currentYearHolidays = this.dataManager.getHolidaysForYear(year);

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = this.dataManager.getDateKey(date);
            const holidayName = currentYearHolidays[dateKey];
            const dailyNote = this.dataManager.getDailyNote(dateKey);
            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

            const workingCount = this.dataManager.getActiveEmployees().filter(emp =>
                this.dataManager.getEmployeeStatusForDate(emp, date) === 'Working'
            ).length;

            // Skeleton Crew Check
            const threshold = this.dataManager.minStaffThreshold || 0;
            const isSkeletonCrew = threshold > 0 && workingCount < threshold && !holidayName;

            // Count absences and vacations
            let absentCount = 0;
            let vacationCount = 0;
            this.dataManager.getActiveEmployees().forEach(emp => {
                const status = this.dataManager.getEmployeeStatusForDate(emp, date);
                if (status === 'On Vacation' || status === 'Vacation') vacationCount++;
                else if (['Absent', 'Sick', 'Personal', 'Unjustified'].includes(status)) absentCount++;
            });

            const card = document.createElement('div');
            card.className = `day-card p-4 border rounded-lg bg-white ${isSkeletonCrew ? 'border-red-400 bg-red-50' : ''}`;
            if ([0, 6].includes(date.getDay()) && !holidayName && !isSkeletonCrew) {
                card.classList.add('bg-gray-50');
            }
            if (holidayName) {
                card.classList.add('border-yellow-400', 'bg-yellow-50');
            }
            card.dataset.date = dateKey;

            let indicatorsHtml = '';
            if (absentCount > 0) {
                indicatorsHtml += `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 mr-2">
                    ${absentCount} ${t('schedule.calendar.absent')}
                </span>`;
            }
            if (vacationCount > 0) {
                indicatorsHtml += `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    ${vacationCount} ${t('schedule.summary.vacation')}
                </span>`;
            }

            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <div class="text-sm text-gray-500">${dayName}</div>
                        <div class="text-2xl font-bold text-gray-900">${day}</div>
                    </div>
                    <div class="flex flex-col items-end">
                        ${holidayName ? `<span class="text-yellow-600 text-xl mb-1">★</span>` : ''}
                        ${isSkeletonCrew ? `<span class="text-red-500 text-xl">⚠</span>` : ''}
                        ${dailyNote ? `<span class="text-blue-500" title="${dailyNote}">📝</span>` : ''}
                    </div>
                </div>
                ${holidayName ? `<div class="text-sm font-medium text-yellow-700 mb-2">${holidayName}</div>` : ''}
                <div class="flex items-center ${isSkeletonCrew ? 'text-red-600' : 'text-green-600'}">
                    <svg class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                    </svg>
                    <span class="text-lg font-bold">${workingCount}</span>
                    <span class="ml-1 text-sm">${t('schedule.calendar.working')}</span>
                </div>
                ${indicatorsHtml ? `<div class="mt-3">${indicatorsHtml}</div>` : ''}
            `;

            container.appendChild(card);
        }
    }

    renderYearlySummary() {
        const year = this.dataManager.getCurrentDate().getFullYear();
        const container = document.getElementById('yearly-summary-container');
        if (!container) return;

        let tableHTML = `<div class="overflow-x-auto"><table class="w-full text-sm text-left">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr><th class="px-4 py-3">${t('schedule.summary.month')}</th><th class="px-4 py-3">${t('schedule.summary.worked')}</th><th class="px-4 py-3">${t('schedule.summary.vacation')}</th><th class="px-4 py-3">${t('schedule.summary.off')}</th><th class="px-4 py-3">${t('schedule.summary.absent')}</th><th class="px-4 py-3">${t('schedule.summary.extraHours')}</th></tr>
                            </thead><tbody>`;

        Config.MONTHS_OF_YEAR.forEach((monthName, monthIndex) => {
            let monthStats = { worked: 0, off: 0, absent: 0, vacation: 0, extraHours: 0 };
            const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, monthIndex, day);
                this.dataManager.getActiveEmployees().forEach(emp => {
                    const status = this.dataManager.getEmployeeStatusForDate(emp, date);
                    if (status === 'On Vacation') monthStats.vacation++;
                    else if (status === 'Working') monthStats.worked++;
                    else if (status === 'Absent') monthStats.absent++;
                    else monthStats.off++;

                    const dateKey = this.dataManager.getDateKey(date);
                    if (emp.extraHours && emp.extraHours[dateKey]) {
                        monthStats.extraHours += emp.extraHours[dateKey];
                    }
                });
            }
            tableHTML += `<tr class="border-b">
                            <td class="px-4 py-3 font-medium">${monthName}</td>
                            <td class="px-4 py-3 text-green-600 font-semibold">${monthStats.worked}</td>
                            <td class="px-4 py-3 text-yellow-600 font-semibold">${monthStats.vacation}</td>
                            <td class="px-4 py-3 text-blue-600 font-semibold">${monthStats.off}</td>
                            <td class="px-4 py-3 text-red-600 font-semibold">${monthStats.absent}</td>
                            <td class="px-4 py-3 text-purple-600 font-semibold">${monthStats.extraHours.toFixed(1)}</td>
                          </tr>`;
        });

        container.innerHTML = tableHTML + `</tbody></table></div>`;
    }

    showDayDetailsModal(dateKey) {
        this.dataManager.setSelectedDateKey(dateKey);
        const modal = document.getElementById('day-details-modal');
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        document.getElementById('modal-date-header').textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Add Daily Note Section
        const modalBody = document.querySelector('#day-details-modal .modal-content');
        let noteSection = document.getElementById('daily-note-section');
        if (!noteSection) {
            noteSection = document.createElement('div');
            noteSection.id = 'daily-note-section';
            noteSection.className = 'mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200';
            // Insert before employee list
            const employeeList = document.getElementById('modal-employee-list');
            modalBody.insertBefore(noteSection, employeeList);
        }

        const currentNote = this.dataManager.getDailyNote(dateKey);
        noteSection.innerHTML = `
            <label class="block text-sm font-medium text-yellow-800 mb-1">Daily Note (Visible to everyone)</label>
            <textarea id="daily-note-input" rows="2" class="w-full p-2 border border-yellow-300 rounded-md text-sm focus:ring-yellow-500 focus:border-yellow-500 bg-white" placeholder="Add a note for this day (e.g. 'Bank Holiday', 'VIP Arrival')...">${currentNote}</textarea>
        `;

        // Save note on change
        const noteInput = document.getElementById('daily-note-input');
        noteInput.addEventListener('change', () => {
            this.dataManager.saveDailyNote(dateKey, noteInput.value);
        });

        const listContainer = document.getElementById('modal-employee-list');
        listContainer.innerHTML = this.dataManager.getActiveEmployees().map(emp => {
            const onVacation = this.dataManager.isDateInVacation(date, emp.vacations);
            const isHoliday = (this.dataManager.getAllHolidays()[year] && this.dataManager.getAllHolidays()[year][dateKey]);
            const currentStatus = this.dataManager.getEmployeeStatusForDate(emp, date);
            const isScheduled = emp.workDays.includes(date.getDay());
            const defaultStatusText = isScheduled ? "Working" : "Off";
            let effectiveStatus = currentStatus;

            // If no override exists, use the default status based on schedule
            if (currentStatus === 'Scheduled Off' || (currentStatus === 'Working' && isScheduled && !emp.overrides[dateKey])) effectiveStatus = defaultStatusText;

            const radioButtons = Config.STATUS_OPTIONS.map(status => `
                <div>
                    <input type="radio" name="status-${emp.id}" id="status-${emp.id}-${status}" value="${status}" class="sr-only status-radio" 
                           ${status === effectiveStatus ? 'checked' : ''} 
                           ${onVacation ? 'disabled' : ''}
                           data-employee-id="${emp.id}" data-date-key="${dateKey}">
                    <label for="status-${emp.id}-${status}" class="inline-block px-3 py-1 border rounded-full text-sm cursor-pointer transition-colors ${onVacation ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : ''}">
                        ${status}
                    </label>
                </div>`).join('');

            const extraHours = (emp.extraHours && emp.extraHours[dateKey]) || '';
            const extraHoursNote = (emp.extraHoursNotes && emp.extraHoursNotes[dateKey]) || '';

            let statusText = '';
            if (onVacation) statusText = '<span class="text-blue-600 font-normal text-sm">(On Vacation)</span>';
            if (isHoliday) statusText = `<span class="text-yellow-600 font-normal text-sm">(Holiday: ${this.dataManager.getAllHolidays()[year][dateKey]})</span>`;

            return `
                <div class="p-4 rounded-lg ${onVacation ? 'bg-blue-50' : (isHoliday ? 'bg-yellow-50' : 'bg-gray-50')}">
                    <p class="font-medium mb-2">${emp.name} ${statusText}</p>
                    <div class="flex flex-wrap gap-2 items-center">${radioButtons}</div>
                    <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                         <div class="md:col-span-1">
                            <label class="text-sm font-medium text-gray-700">Extra Hours</label>
                            <input type="number" min="0" step="0.5"
                                   class="extra-hours-input mt-1 w-full p-2 border rounded-md focus:ring-1 focus:ring-brand"
                                   value="${extraHours}"
                                   data-employee-id="${emp.id}" data-date-key="${dateKey}">
                        </div>
                        <div class="md:col-span-2">
                            <label class="text-sm font-medium text-gray-700">Note</label>
                            <input type="text" placeholder="Reason for extra hours..."
                                   class="extra-hours-note-input mt-1 w-full p-2 border rounded-md focus:ring-1 focus:ring-brand"
                                   value="${extraHoursNote}"
                                   data-employee-id="${emp.id}" data-date-key="${dateKey}">
                        </div>
                    </div>
                </div>`;
        }).join('');
        modal.classList.remove('hidden');
    }

    showEmployeeSummaryModal(employeeId) {
        const emp = this.dataManager.getActiveEmployees().find(e => e.id === employeeId);
        if (!emp) return;

        const modal = document.getElementById('employee-summary-modal');
        const header = document.getElementById('employee-summary-header');
        const content = document.getElementById('employee-summary-content');

        const period = (this.dataManager.getCurrentView() === 'monthly') ?
            Config.MONTHS_OF_YEAR[this.dataManager.getCurrentDate().getMonth()] + " " + this.dataManager.getCurrentDate().getFullYear() :
            "Year " + this.dataManager.getCurrentDate().getFullYear();
        header.textContent = `${emp.name} - Summary for ${period}`;

        let detailsHTML = '<div class="space-y-2">';
        let hasEntries = false;

        const year = this.dataManager.getCurrentDate().getFullYear();
        const startMonth = this.dataManager.getCurrentView() === 'monthly' ? this.dataManager.getCurrentDate().getMonth() : 0;
        const endMonth = this.dataManager.getCurrentView() === 'monthly' ? this.dataManager.getCurrentDate().getMonth() : 11;

        for (let m = startMonth; m <= endMonth; m++) {
            const daysInMonth = new Date(year, m + 1, 0).getDate();
            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(year, m, d);
                const dateKey = this.dataManager.getDateKey(date);
                const hours = emp.extraHours ? emp.extraHours[dateKey] : null;
                const note = emp.extraHoursNotes ? emp.extraHoursNotes[dateKey] : null;

                if (hours || note) {
                    hasEntries = true;
                    detailsHTML += `
                        <div class="p-3 bg-gray-100 rounded-lg">
                            <p class="font-semibold">${date.toLocaleDateString()}</p>
                            ${hours ? `<p class="text-sm"><strong>Hours:</strong> ${hours}</p>` : ''}
                            ${note ? `<p class="text-sm text-gray-700"><strong>Note:</strong> ${note}</p>` : ''}
                        </div>
                    `;
                }
            }
        }

        if (!hasEntries) {
            detailsHTML += '<p class="text-center text-gray-500 italic">No extra hours or notes for this period.</p>';
        }
        detailsHTML += '</div>';
        content.innerHTML = detailsHTML;
        modal.classList.remove('hidden');
    }

    showEditWorkingDaysModal(employeeId) {
        const emp = this.dataManager.getActiveEmployees().find(e => e.id === employeeId);
        if (!emp) return;

        const modal = document.getElementById('edit-working-days-modal');
        const header = document.getElementById('edit-working-days-header');
        const container = document.getElementById('edit-work-day-checkboxes');

        header.textContent = `Edit Working Days - ${emp.name}`;

        // Populate checkboxes with current working days
        container.innerHTML = Config.DAYS_OF_WEEK.map((day, index) => `
            <label class="p-1 border rounded-md cursor-pointer">
                <input type="checkbox" value="${index}" class="sr-only work-day-checkbox" ${emp.workDays.includes(index) ? 'checked' : ''}>
                <span class="block p-1">${day}</span>
            </label>
        `).join('');

        // Store the employee ID for the save function
        modal.dataset.employeeId = employeeId;
        modal.classList.remove('hidden');
    }

    showEditEmployeeModal(employeeId) {
        const emp = this.dataManager.getActiveEmployees().find(e => e.id === employeeId);
        if (!emp) return;

        const modal = document.getElementById('edit-employee-modal');
        const header = document.getElementById('edit-employee-header');

        header.textContent = `Edit Colleague Information - ${emp.name}`;

        // Populate form fields with current employee data
        document.getElementById('edit-employee-name').value = emp.name || '';
        document.getElementById('edit-employee-staff-number').value = emp.staffNumber || '';
        document.getElementById('edit-employee-email').value = emp.email || '';
        document.getElementById('edit-employee-phone').value = emp.phone || '';
        document.getElementById('edit-employee-department').value = emp.department || '';
        document.getElementById('edit-employee-position').value = emp.position || '';
        document.getElementById('edit-employee-hire-date').value = emp.hireDate || '';
        document.getElementById('edit-employee-employment-type').value = emp.employmentType || '';
        document.getElementById('edit-employee-shift').value = (emp.shifts && emp.shifts.default) ? emp.shifts.default : '9:00-18:00';
        document.getElementById('edit-employee-notes').value = emp.notes || '';
        document.getElementById('edit-employee-vacation-adjustment').value = emp.vacationAdjustment || 0;

        // Populate Shift Dropdown if it exists (for editing) or create it if missing
        this.populateShiftDropdowns(emp.shifts?.default);


        // Populate working days checkboxes
        const workDaysContainer = document.getElementById('edit-employee-work-days');
        workDaysContainer.innerHTML = Config.DAYS_OF_WEEK.map((day, index) => `
            <label class="p-1 border rounded-md cursor-pointer">
                <input type="checkbox" value="${index}" class="sr-only work-day-checkbox" ${emp.workDays.includes(index) ? 'checked' : ''}>
                <span class="block p-1">${day}</span>
            </label>
        `).join('');

        // Clear any previous error messages
        document.getElementById('edit-employee-error').textContent = '';

        // Store the employee ID for the save function
        modal.dataset.employeeId = employeeId;
        modal.classList.remove('hidden');
    }

    renderShiftPresetsModal() {
        const thresholdInput = document.getElementById('min-staff-threshold');
        if (thresholdInput) {
            thresholdInput.value = this.dataManager.minStaffThreshold || 0;
        }

        const list = document.getElementById('shift-presets-list');
        if (!list) return;

        const presets = this.dataManager.shiftPresets || [];
        list.innerHTML = presets.length === 0
            ? '<li class="text-sm text-gray-500 italic text-center py-2">No presets added yet.</li>'
            : presets.map(p => `
            <li class="flex justify-between items-center bg-gray-50 p-2 rounded-md border text-sm">
                <div>
                    <span class="font-medium text-gray-800">${p.name}</span>
                    <span class="text-gray-500 text-xs ml-2">(${p.start} - ${p.end})</span>
                </div>
                <button class="delete-preset-btn text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors" data-id="${p.id}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </li>
        `).join('');
    }

    populateShiftDropdowns(currentShiftValue = null) {
        // Find shift inputs in both modals
        const shiftInputs = [
            document.getElementById('edit-employee-shift'),
            document.getElementById('new-employee-shift') // Assuming this ID for add modal
        ];

        shiftInputs.forEach(input => {
            if (!input) return;

            // Check if dropdown container already exists
            let container = input.parentElement.querySelector('.shift-preset-container');
            if (!container) {
                container = document.createElement('div');
                container.className = 'shift-preset-container mt-2 flex gap-2';
                input.parentElement.appendChild(container); // Append after input
            }

            // Populate dropdown
            const presets = this.dataManager.shiftPresets || [];

            // Create selector HTML
            container.innerHTML = `
                <select class="shift-preset-select w-full p-2 border rounded-md text-sm bg-gray-50 focus:ring-1 focus:ring-brand">
                    <option value="">Select a preset...</option>
                    ${presets.map(p => `<option value="${p.start}-${p.end}">${p.name} (${p.start}-${p.end})</option>`).join('')}
                    <option value="custom">Custom Shift...</option>
                </select>
            `;

            // Add listener to update input
            const select = container.querySelector('select');
            select.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val && val !== 'custom') {
                    input.value = val;
                } else if (val === 'custom') {
                    input.focus();
                }
            });
        });
    }

    updateView() {
        // Force holiday initialization before any rendering
        const year = this.dataManager.getCurrentDate().getFullYear();
        this.dataManager.ensureHolidaysForYear(year);

        // Also ensure adjacent years are loaded
        this.dataManager.ensureHolidaysForYear(year - 1);
        this.dataManager.ensureHolidaysForYear(year + 1);

        this.renderEmployeeList();

        const displayLocale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        const monthName = this.dataManager.getCurrentDate().toLocaleString(displayLocale, { month: 'long' });

        const viewHeader = document.getElementById('view-header');
        const summaryTitle = document.getElementById('summary-title');

        const mainViews = {
            calendar: document.getElementById('calendar-grid'),
            calendarMobile: document.getElementById('calendar-mobile-cards'),
            yearly: document.getElementById('yearly-summary-container'),
            madeiraHolidays: document.getElementById('madeira-holidays-container'),
            stats: document.getElementById('stats-container'),
            vacation: document.getElementById('vacation-planner-container')
        };

        // Hide all main content views first and clean up responsive classes
        Object.values(mainViews).forEach(v => {
            v.classList.add('hidden');
            v.classList.remove('md:grid', 'md:hidden', 'block', 'grid');
        });

        const currentView = this.dataManager.getCurrentView();
        const showSidePanel = ['monthly', 'yearly', 'vacation'].includes(currentView);
        const leftPanel = document.getElementById('schedule-side-panel');
        if (leftPanel) leftPanel.style.display = showSidePanel ? '' : 'none';

        // Center single-column views by adjusting grid template columns
        const gridContainer = document.querySelector('#main-app .grid');
        if (gridContainer) {
            const center = !showSidePanel;  // views with single column
            gridContainer.classList.toggle('justify-center', center);
            gridContainer.classList.toggle('justify-items-center', center);
            if (showSidePanel) {
                gridContainer.classList.add('lg:grid-cols-3');
                gridContainer.classList.remove('lg:grid-cols-1');
            } else {
                gridContainer.classList.add('lg:grid-cols-1');
                gridContainer.classList.remove('lg:grid-cols-3');
            }
        }
        // No longer need to hide summary-title separately as it is inside the side panel
        // document.getElementById('employee-list').style.display = showSidePanel ? '' : 'none'; // Inside side panel too

        // Only allow adding colleagues in the Reorder/List management view (Legacy check, maybe removable?)
        const addColleagueSection = document.getElementById('add-colleague-section');
        if (addColleagueSection) {
            addColleagueSection.style.display = 'none';
        }

        const showCalendarControls = ['monthly', 'yearly'].includes(currentView);
        document.getElementById('calendar-controls').style.display = showCalendarControls ? 'flex' : 'none';
        document.getElementById('pdf-download-btn').style.display = currentView === 'monthly' ? 'block' : 'none';

        if (currentView === 'monthly') {
            viewHeader.textContent = `${monthName} ${year}`;
            if (summaryTitle) summaryTitle.textContent = t('schedule.summary.monthly');
            mainViews.calendar.classList.remove('hidden');
            mainViews.calendar.classList.add('md:grid');
            mainViews.calendarMobile.classList.remove('hidden');
            mainViews.calendarMobile.classList.add('md:hidden', 'block');
            this.renderCalendarGrid();
        } else if (currentView === 'yearly') {
            viewHeader.textContent = year;
            if (summaryTitle) summaryTitle.textContent = t('schedule.summary.yearly');
            mainViews.yearly.classList.remove('hidden');
            this.renderYearlySummary();
        } else if (currentView === 'madeira-holidays') {
            viewHeader.textContent = t('schedule.views.madeiraHolidays');
            if (summaryTitle) summaryTitle.textContent = t('schedule.navigation.reference');
            mainViews.madeiraHolidays.classList.remove('hidden');
            this.renderMadeiraHolidays();
        } else if (currentView === 'vacation') {
            if (summaryTitle) summaryTitle.textContent = t('schedule.vacation.title');
            mainViews.vacation.classList.remove('hidden');
            if (window.scheduleManager) {
                window.scheduleManager.renderVacationPlanner();
            }
        } else if (currentView === 'stats') {
            viewHeader.textContent = t('schedule.stats.title');
            if (summaryTitle) summaryTitle.textContent = t('schedule.stats.title');
            mainViews.stats.classList.remove('hidden');
            this.renderStats();
        }
    }

    switchView(view) {
        if (this.isVacationBoardOnlyMode()) {
            view = 'vacation-board';
        }

        const currentView = this.dataManager.getCurrentView();
        const currentDate = this.dataManager.getCurrentDate();

        if (currentView === 'yearly' && view === 'monthly') {
            this.dataManager.setCurrentDate(new Date(this.dataManager.lastMonthlyDate.getTime()));
        } else if (currentView === 'monthly' && view === 'yearly') {
            this.dataManager.lastMonthlyDate = new Date(currentDate.getTime());
        }

        this.dataManager.setCurrentView(view);
        this.syncScheduleNavigationState(view);
        this.updateView();
    }

    showConfirmationModal(title, text, onConfirm) {
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('confirm-modal-title').textContent = title;
        document.getElementById('confirm-modal-text').textContent = text;
        modal.classList.remove('hidden');

        const confirmOk = document.getElementById('confirm-modal-ok-btn');
        const confirmCancel = document.getElementById('confirm-modal-cancel-btn');

        const okListener = () => {
            onConfirm();
            modal.classList.add('hidden');
            confirmOk.removeEventListener('click', okListener);
            confirmCancel.removeEventListener('click', cancelListener);
        };

        const cancelListener = () => {
            modal.classList.add('hidden');
            confirmOk.removeEventListener('click', okListener);
            confirmCancel.removeEventListener('click', cancelListener);
        };

        confirmOk.addEventListener('click', okListener);
        confirmCancel.addEventListener('click', cancelListener);
    }

    renderMadeiraHolidays() {
        const container = document.getElementById('madeira-holidays-container');

        const publicHolidays = [
            { name: "New Year's Day", date: "January 1" },
            { name: "Carnival Tuesday", date: "Variable (February/March)" },
            { name: "Good Friday", date: "Variable (March/April)" },
            { name: "Easter Sunday", date: "Variable (March/April)" },
            { name: "Madeira's Autonomy Day", date: "April 2", badge: "Regional" },
            { name: "Freedom Day", date: "April 25" },
            { name: "Labour Day", date: "May 1" },
            { name: "Corpus Christi", date: "Variable (May/June)" },
            { name: "Portugal Day", date: "June 10" },
            { name: "Madeira Day", date: "July 1", badge: "Regional" },
            { name: "Assumption of Mary", date: "August 15" },
            { name: "Funchal City Day", date: "August 21", badge: "Regional" },
            { name: "Republic Day", date: "October 5" },
            { name: "All Saints' Day", date: "November 1" },
            { name: "Restoration of Independence", date: "December 1" },
            { name: "Immaculate Conception", date: "December 8" },
            { name: "Christmas Day", date: "December 25" },
            { name: "Boxing Day", date: "December 26" }
        ];

        const culturalEvents = [
            { name: "Flower Festival", date: "April/May", description: "Celebrates spring with flower parades and the famous 'Wall of Hope'" },
            { name: "Atlantic Festival", date: "June (Saturdays)", description: "International fireworks competition at Funchal harbour" },
            { name: "Medieval Market (Machico)", date: "June 7-9", description: "Historic reenactment in Machico with period costumes and crafts" },
            { name: "Madeira Wine Rally", date: "August 1-3", description: "Motorsport event celebrating Madeira's automotive culture" },
            { name: "Wine Festival", date: "August 29 - September 15", description: "Celebrates Madeira's wine heritage with harvest activities and tastings" },
            { name: "Apple Festival (Santo da Serra)", date: "September", description: "Rural celebration of apple harvest and cider production" },
            { name: "Columbus Festival (Porto Santo)", date: "September 19-22", description: "Commemorates Christopher Columbus's time in the archipelago" },
            { name: "Senhor dos Milagres (Machico)", date: "October 9", description: "Important religious pilgrimage with candlelit processions" },
            { name: "Madeira Nature Festival", date: "October 1-6", description: "Celebrates the island's natural beauty and biodiversity" },
            { name: "Christmas Market & Illuminations", date: "December 1 - January 7", description: "Festive decorations and markets throughout Funchal" },
            { name: "New Year's Eve Fireworks", date: "December 31", description: "World-famous fireworks display, recognized by Guinness World Records" }
        ];

        container.innerHTML = `
            <div class="space-y-6">
                <div class="text-center mb-6">
                    <h2 class="text-2xl font-bold text-gradient mb-3">${t('schedule.madeira.title')}</h2>
                    <p class="text-gray-600">${t('schedule.madeira.subtitle')}</p>
                </div>
                
                <!-- Tab Navigation -->
                <div class="flex border-b border-gray-200 mb-6">
                    <button class="madeira-tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-yellow-500 text-yellow-600" data-tab="holidays">
                        ${t('schedule.madeira.publicHolidays')}
                    </button>
                    <button class="madeira-tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="events">
                        ${t('schedule.madeira.culturalEvents')}
                    </button>
                </div>

                <!-- Public Holidays Tab -->
                <div id="madeira-holidays-tab" class="madeira-tab-content">
                    <div class="mb-4">
                        <h3 class="text-xl font-semibold text-gradient mb-2">${t('schedule.madeira.official')}</h3>
                        <p class="text-sm text-gray-600 mb-4">${t('schedule.madeira.officialDesc')}</p>
                    </div>
                    
                    <div class="grid gap-3">
                        ${publicHolidays.map(holiday => `
                            <div class="bg-white rounded-lg p-4 shadow-sm border-l-4 border-yellow-500 flex justify-between items-center">
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
                                    <h4 class="text-lg font-medium text-gray-900">${holiday.name}</h4>
                                    ${holiday.badge ? `<span class="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-full">${holiday.badge}</span>` : ''}
                                </div>
                                <span class="text-sm font-semibold text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full">
                                    ${holiday.date}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg mt-6">
                        <div class="flex">
                            <div class="ml-3">
                                <p class="text-sm text-yellow-800">
                                    <strong>${t('schedule.madeira.autoManagement')}</strong> ${t('schedule.madeira.autoManagementDesc')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Cultural Events Tab -->
                <div id="madeira-events-tab" class="madeira-tab-content hidden">
                    <div class="mb-4">
                        <h3 class="text-xl font-semibold text-gradient mb-2">Cultural Events & Festivals</h3>
                        <p class="text-sm text-gray-600 mb-4">Major celebrations and festivals throughout the year (not public holidays)</p>
                    </div>
                    
                    <div class="grid gap-4">
                        ${culturalEvents.map(event => `
                            <div class="bg-white rounded-lg p-4 shadow-sm border-l-4 border-blue-500">
                                <div class="flex justify-between items-start mb-2">
                                    <h4 class="text-lg font-medium text-gray-900">${event.name}</h4>
                                    <span class="text-sm font-semibold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                                        ${event.date}
                                    </span>
                                </div>
                                <p class="text-gray-600 text-sm">${event.description}</p>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-lg mt-6">
                        <div class="flex">
                            <div class="ml-3">
                                <p class="text-sm text-blue-700">
                                    <strong>Note:</strong> These are cultural events and festivals, not official public holidays. 
                                    Colleagues may still be scheduled to work unless manually adjusted.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add tab switching functionality
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('madeira-tab-btn')) {
                const tabName = e.target.dataset.tab;

                // Update tab buttons
                container.querySelectorAll('.madeira-tab-btn').forEach(btn => {
                    btn.classList.remove('active', 'border-yellow-500', 'text-yellow-600');
                    btn.classList.add('border-transparent', 'text-gray-500');
                });
                e.target.classList.add('active', 'border-yellow-500', 'text-yellow-600');
                e.target.classList.remove('border-transparent', 'text-gray-500');

                // Update tab content
                container.querySelectorAll('.madeira-tab-content').forEach(content => {
                    content.classList.add('hidden');
                });
                document.getElementById(`madeira-${tabName}-tab`).classList.remove('hidden');
            }
        });
    }

    renderWeeklyRoster(startDate) {
        const container = document.getElementById('weekly-roster-content');
        if (!container) return;

        // Calculate Monday of the week
        const d = new Date(startDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        const monday = new Date(d.setDate(diff));

        // Update label
        const endOfWeek = new Date(monday);
        endOfWeek.setDate(monday.getDate() + 6);
        const label = document.getElementById('roster-week-label');
        if (label) {
            label.textContent = `${monday.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
        }

        // Build Table
        const employees = this.dataManager.getActiveEmployees();

        const days = [];
        for (let i = 0; i < 7; i++) {
            const current = new Date(monday);
            current.setDate(monday.getDate() + i);
            days.push(current);
        }

        let html = `
            <table class="w-full text-sm border-collapse border border-gray-300">
                <thead>
                    <tr class="bg-gray-100">
                        <th class="border border-gray-300 p-2 text-left">Colleague</th>
                        ${days.map(date => {
            const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
            const dayNum = date.getDate();
            const monthNum = date.getMonth() + 1;
            return `<th class="border border-gray-300 p-2 text-center">${weekday} ${dayNum}/${monthNum}</th>`;
        }).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        employees.forEach(emp => {
            html += `<tr>
                <td class="border border-gray-300 p-2 font-medium">${emp.name}</td>`;

            days.forEach(date => {
                const status = this.dataManager.getEmployeeStatusForDate(emp, date);
                let cellText = '';
                let cellClass = '';

                if (status === 'Working') {
                    cellText = (emp.shifts && emp.shifts.default) ? emp.shifts.default : '9:00-18:00';
                    cellClass = 'bg-white';
                } else if (status === 'Off') {
                    cellText = 'OFF';
                    cellClass = 'bg-gray-100 text-gray-400';
                } else if (status === 'On Vacation' || status === 'Vacation') {
                    cellText = 'Vacation';
                    cellClass = 'bg-yellow-100 text-yellow-800';
                } else {
                    cellText = status;
                    cellClass = 'bg-red-50 text-red-600';
                }

                html += `<td class="border border-gray-300 p-2 text-center ${cellClass}">${cellText}</td>`;
            });

            html += `</tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        // Save date for navigation
        this.currentRosterDate = monday;
    }

    getMondayForDate(startDate) {
        const d = new Date(startDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    formatWeekLabel(startDate, endDate) {
        return `${startDate.toLocaleDateString('en-GB')} - ${endDate.toLocaleDateString('en-GB')}`;
    }

    parseShiftHours(shiftText) {
        if (!shiftText || typeof shiftText !== 'string') return null;

        const match = shiftText.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
        if (!match) return null;

        const [, startHour, startMinute, endHour, endMinute] = match;
        const start = (parseInt(startHour, 10) * 60) + parseInt(startMinute, 10);
        let end = (parseInt(endHour, 10) * 60) + parseInt(endMinute, 10);
        if (end < start) end += 24 * 60;

        return (end - start) / 60;
    }

    formatDurationHours(hours) {
        if (!Number.isFinite(hours) || hours <= 0) return '--:--';
        const totalMinutes = Math.round(hours * 60);
        const hh = Math.floor(totalMinutes / 60);
        const mm = totalMinutes % 60;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    formatAttendanceEventLabel(eventType) {
        const labels = {
            clockIn: 'Clock in',
            clockOut: 'Clock out',
            breakStart: 'Start break',
            breakEnd: 'End break'
        };

        return labels[eventType] || eventType;
    }

    getAttendanceStatusCopy(summary) {
        if (!summary) {
            return {
                badge: 'Not linked',
                title: 'Ask an admin to link your employee email before using the time clock.',
                tone: 'bg-amber-100 text-amber-700 border-amber-200'
            };
        }

        if (summary.status === 'working') {
            return {
                badge: 'Clocked in',
                title: 'You are currently on shift.',
                tone: 'bg-emerald-100 text-emerald-700 border-emerald-200'
            };
        }

        if (summary.status === 'on-break') {
            return {
                badge: 'On break',
                title: 'Your break is active.',
                tone: 'bg-amber-100 text-amber-700 border-amber-200'
            };
        }

        return {
            badge: 'Clocked out',
            title: 'You are not currently clocked in.',
            tone: 'bg-slate-100 text-slate-700 border-slate-200'
        };
    }

    isTimeClockStationMode() {
        if (this.dataManager.isTimeClockStationUser()) {
            return true;
        }

        return this.timeClockStationPreviewEnabled && this.dataManager.hasPrivilegedRole();
    }

    canToggleTimeClockStationMode() {
        return this.dataManager.hasPrivilegedRole() && !this.dataManager.isTimeClockStationUser();
    }

    clearTimeClockStationResetTimer() {
        if (this.timeClockStationResetTimer) {
            clearTimeout(this.timeClockStationResetTimer);
            this.timeClockStationResetTimer = null;
        }
    }

    resetTimeClockStationState({ clearSearch = false, clearFeedback = true } = {}) {
        this.clearTimeClockStationResetTimer();
        this.timeClockStationEmployeeId = null;
        if (clearSearch) {
            this.timeClockStationSearch = '';
        }
        if (clearFeedback) {
            this.timeClockStationFeedback = '';
            this.timeClockStationFeedbackTone = 'success';
        }
    }

    setTimeClockMode(mode) {
        if (mode === 'station') {
            if (!this.dataManager.hasPrivilegedRole()) {
                return;
            }

            this.timeClockStationPreviewEnabled = true;
            this.resetTimeClockStationState({ clearSearch: false });
            this.renderTimeClockPage();
            return;
        }

        if (mode === 'self-service' && this.canToggleTimeClockStationMode()) {
            this.timeClockStationPreviewEnabled = false;
            this.resetTimeClockStationState({ clearSearch: false });
            this.renderTimeClockPage();
        }
    }

    setTimeClockStationSearch(query = '') {
        this.timeClockStationSearch = typeof query === 'string' ? query : '';
        this.renderTimeClockPage();

        requestAnimationFrame(() => {
            const searchInput = document.getElementById('time-clock-station-search');
            if (!searchInput) return;
            searchInput.focus();
            const cursorPosition = searchInput.value.length;
            if (typeof searchInput.setSelectionRange === 'function') {
                searchInput.setSelectionRange(cursorPosition, cursorPosition);
            }
        });
    }

    selectTimeClockStationEmployee(employeeId) {
        if (!employeeId) {
            return;
        }

        this.clearTimeClockStationResetTimer();
        this.timeClockStationEmployeeId = employeeId;
        this.timeClockStationFeedback = '';
        this.timeClockStationFeedbackTone = 'success';
        this.renderTimeClockPage();
    }

    clearTimeClockStationSelection() {
        this.resetTimeClockStationState({ clearSearch: false });
        this.renderTimeClockPage();
    }

    setTimeClockStationFeedback(message = '', tone = 'success') {
        this.clearTimeClockStationResetTimer();
        this.timeClockStationFeedback = message;
        this.timeClockStationFeedbackTone = tone === 'error' ? 'error' : 'success';
        this.renderTimeClockPage();
    }

    handleTimeClockStationAttendanceSaved(employeeId, actionLabel) {
        const employee = this.dataManager.resolveAttendanceEmployee(employeeId);
        const employeeName = employee?.name || 'selected colleague';
        this.timeClockStationFeedback = `${actionLabel} saved for ${employeeName}. Returning to the colleague list...`;
        this.timeClockStationFeedbackTone = 'success';
        this.renderTimeClockPage();
        this.scheduleTimeClockStationReset();
    }

    scheduleTimeClockStationReset(delayMs = 2500) {
        this.clearTimeClockStationResetTimer();
        this.timeClockStationResetTimer = setTimeout(() => {
            this.resetTimeClockStationState({ clearSearch: true });
            this.renderTimeClockPage();
        }, delayMs);
    }

    getTimeClockModeToggleMarkup(activeMode = 'self-service') {
        if (this.canToggleTimeClockStationMode()) {
            return `
                <div class="inline-flex items-center rounded-full bg-white/10 border border-white/10 p-1">
                    <button
                        type="button"
                        data-time-clock-mode="self-service"
                        class="px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeMode === 'self-service' ? 'bg-white text-slate-900' : 'text-slate-200 hover:text-white'}">
                        Self-service
                    </button>
                    <button
                        type="button"
                        data-time-clock-mode="station"
                        class="px-4 py-2 rounded-full text-sm font-medium transition-colors ${activeMode === 'station' ? 'bg-white text-slate-900' : 'text-slate-200 hover:text-white'}">
                        Station mode
                    </button>
                </div>
            `;
        }

        if (this.dataManager.isTimeClockStationUser()) {
            return `
                <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm text-slate-100">
                    <span class="inline-block h-2 w-2 rounded-full bg-emerald-300"></span>
                    Shared tablet station
                </div>
            `;
        }

        return '';
    }

    getTimeClockStationTileStatus(summary = null) {
        if (summary?.status === 'working') {
            return {
                badge: 'On shift',
                tone: 'bg-emerald-100 text-emerald-800',
                detail: 'Clocked in and working.'
            };
        }

        if (summary?.status === 'on-break') {
            return {
                badge: 'On break',
                tone: 'bg-amber-100 text-amber-800',
                detail: 'Break is active right now.'
            };
        }

        return {
            badge: 'Ready',
            tone: 'bg-slate-100 text-slate-700',
            detail: 'Tap to record the next attendance action.'
        };
    }

    renderTimeClockStationPage(container) {
        const now = new Date();
        const referenceDateTime = formatLocalDateTime(now);
        const employees = this.dataManager.getActiveEmployees();
        const filteredEmployees = filterTimeClockStationEmployees(employees, this.timeClockStationSearch);
        const selectedEmployee = employees.find((employee) => employee.id === this.timeClockStationEmployeeId) || null;
        if (this.timeClockStationEmployeeId && !selectedEmployee) {
            this.resetTimeClockStationState({ clearSearch: false });
        }

        const modeToggle = this.getTimeClockModeToggleMarkup('station');

        if (!selectedEmployee) {
            const employeeDirectoryMarkup = filteredEmployees.length
                ? filteredEmployees.map((employee) => {
                    const summary = this.dataManager.getAttendanceSummary(employee.id, now, { referenceDateTime });
                    const statusCopy = this.getTimeClockStationTileStatus(summary);
                    const staffMeta = [
                        employee.staffNumber ? `Staff #${employee.staffNumber}` : null,
                        employee.shifts?.default || null
                    ].filter(Boolean).join(' / ');

                    return `
                        <button
                            type="button"
                            data-time-clock-station-employee-id="${employee.id}"
                            class="group rounded-[28px] border border-slate-200 bg-slate-50/80 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-slate-400">
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-lg font-semibold text-white">
                                    ${getTimeClockStationEmployeeInitials(employee.name)}
                                </div>
                                <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusCopy.tone}">
                                    ${statusCopy.badge}
                                </span>
                            </div>
                            <div class="mt-8">
                                <div class="text-2xl font-semibold tracking-tight text-slate-900">${employee.name}</div>
                                <div class="mt-2 text-sm text-slate-500">${staffMeta || 'Active colleague'}</div>
                                <div class="mt-4 text-sm text-slate-600">${statusCopy.detail}</div>
                            </div>
                            <div class="mt-6 flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-400">
                                <span>${this.formatAttendanceEventLabel(summary?.primaryAction || 'clockIn')}</span>
                                <span>${this.formatMinutesAsDuration(summary?.workedMinutes || 0)}</span>
                            </div>
                        </button>
                    `;
                }).join('')
                : `
                    <div class="rounded-[28px] border border-dashed border-slate-300 bg-slate-50/70 px-6 py-12 text-center text-slate-500">
                        No colleagues matched that search. Try a different name or staff number.
                    </div>
                `;

            container.innerHTML = `
                <div class="space-y-6">
                    <section class="rounded-[36px] bg-[linear-gradient(135deg,#020617_0%,#0f172a_46%,#1e293b_100%)] text-white p-8 lg:p-10 shadow-xl overflow-hidden relative">
                        <div class="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_58%)] pointer-events-none"></div>
                        <div class="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                            <div class="max-w-3xl">
                                <div class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-slate-100">
                                    <span class="inline-block h-2 w-2 rounded-full bg-emerald-300"></span>
                                    Station mode
                                </div>
                                <div class="mt-6 text-xs uppercase tracking-[0.28em] text-slate-300">Digital Time Clock</div>
                                <h2 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Tap your name to continue</h2>
                                <p class="mt-4 max-w-2xl text-lg text-slate-300">
                                    Use the shared tablet to find a colleague, open the action panel, and save the next clock event in one tap.
                                </p>
                                <div class="mt-6">${modeToggle}</div>
                            </div>
                            <div class="rounded-[32px] border border-white/10 bg-white/8 px-6 py-5 backdrop-blur-sm">
                                <div class="text-xs uppercase tracking-[0.24em] text-slate-300">Current time</div>
                                <div id="time-clock-current-time" class="mt-3 text-5xl font-semibold tracking-tight">${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                <div id="time-clock-current-date" class="mt-2 text-slate-300">${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                            </div>
                        </div>
                    </section>

                    <div class="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                        <section class="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                            <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Directory</div>
                            <h3 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Find colleague</h3>
                            <p class="mt-2 text-sm text-slate-500">Search by name, staff number, department, or position. Only active colleagues appear in the shared station.</p>
                            <label class="mt-6 block">
                                <span class="sr-only">Search colleague</span>
                                <input
                                    id="time-clock-station-search"
                                    type="search"
                                    value="${this.timeClockStationSearch}"
                                    placeholder="Search name or staff #"
                                    class="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none">
                            </label>
                            <div class="mt-5 rounded-2xl bg-slate-900 px-4 py-4 text-white">
                                <div class="text-xs uppercase tracking-[0.24em] text-slate-300">Visible now</div>
                                <div class="mt-2 text-4xl font-semibold tracking-tight">${filteredEmployees.length}</div>
                                <div class="mt-1 text-sm text-slate-300">of ${employees.length} active colleagues</div>
                            </div>
                            <div class="mt-5 space-y-3 text-sm text-slate-600">
                                <div class="flex items-center justify-between">
                                    <span>On shift</span>
                                    <span class="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">Working</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span>On break</span>
                                    <span class="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Paused</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span>Ready</span>
                                    <span class="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Clock event</span>
                                </div>
                            </div>
                        </section>

                        <section class="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                            <div class="flex items-center justify-between gap-4">
                                <div>
                                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Colleagues</div>
                                    <h3 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Choose your user</h3>
                                </div>
                                <div class="text-sm text-slate-500">${filteredEmployees.length} shown</div>
                            </div>
                            <div class="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                                ${employeeDirectoryMarkup}
                            </div>
                        </section>
                    </div>
                </div>
            `;
            return;
        }

        const todaySummary = this.dataManager.getAttendanceSummary(selectedEmployee.id, now, { referenceDateTime });
        const todayRecord = this.dataManager.getAttendanceRecord(selectedEmployee.id, now);
        const tileStatus = this.getTimeClockStationTileStatus(todaySummary);
        const primaryAction = todaySummary?.primaryAction || 'clockIn';
        const secondaryAction = todaySummary?.secondaryAction || null;
        const feedbackClasses = this.timeClockStationFeedbackTone === 'error'
            ? 'text-rose-200'
            : 'text-emerald-200';
        const timeline = todaySummary?.punches?.length
            ? todaySummary.punches.map((punch) => `
                <li class="flex items-start justify-between gap-4 border-b border-slate-200 py-3 last:border-b-0">
                    <div>
                        <div class="font-medium text-slate-900">${this.formatAttendanceEventLabel(punch.type)}</div>
                        <div class="text-sm text-slate-500">${punch.note || 'Saved to the shared attendance log.'}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-semibold text-slate-900">${formatTimeLabel(punch.occurredAt)}</div>
                        <div class="mt-1 text-xs uppercase tracking-wide text-slate-400">${punch.source === 'station' ? 'Station' : 'Web'}</div>
                    </div>
                </li>
            `).join('')
            : '<li class="py-6 text-sm text-slate-500">No punches recorded yet today.</li>';

        container.innerHTML = `
            <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <section class="rounded-[36px] bg-[linear-gradient(135deg,#020617_0%,#0f172a_46%,#1e293b_100%)] text-white p-8 lg:p-10 shadow-xl overflow-hidden relative">
                    <div class="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.2),transparent_62%)] pointer-events-none"></div>
                    <div class="relative">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <button
                                type="button"
                                data-time-clock-station-clear-selection
                                class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/12">
                                <span aria-hidden="true">←</span>
                                Change colleague
                            </button>
                            ${modeToggle}
                        </div>
                        <div class="mt-8 inline-flex items-center gap-2 rounded-full border ${tileStatus.tone.replace('bg-', 'border-').replace('text-', 'text-')} bg-white/10 px-3 py-1 text-sm font-medium">
                            <span class="inline-block h-2 w-2 rounded-full bg-current"></span>
                            ${tileStatus.badge}
                        </div>
                        <div class="mt-6">
                            <div class="text-xs uppercase tracking-[0.28em] text-slate-300">Digital Time Clock</div>
                            <h2 class="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">${selectedEmployee.name}</h2>
                            <p class="mt-3 max-w-2xl text-lg text-slate-300">${tileStatus.detail}</p>
                            <p class="mt-2 text-sm text-slate-400">${selectedEmployee.staffNumber ? `Staff #${selectedEmployee.staffNumber}` : 'Shared tablet session'}</p>
                        </div>
                        <div class="mt-10">
                            <div id="time-clock-current-time" class="text-6xl font-semibold tracking-tight">${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            <div id="time-clock-current-date" class="mt-2 text-slate-300">${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                        </div>
                        <div class="mt-10 grid gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                data-time-clock-action="${primaryAction}"
                                data-time-clock-employee-id="${selectedEmployee.id}"
                                class="rounded-[28px] bg-white px-6 py-5 text-left text-slate-900 transition-colors hover:bg-slate-100">
                                <div class="text-xs uppercase tracking-[0.24em] text-slate-500">Primary action</div>
                                <div class="mt-2 text-2xl font-semibold">${this.formatAttendanceEventLabel(primaryAction)}</div>
                            </button>
                            ${secondaryAction ? `
                                <button
                                    type="button"
                                    data-time-clock-action="${secondaryAction}"
                                    data-time-clock-employee-id="${selectedEmployee.id}"
                                    class="rounded-[28px] border border-white/20 bg-white/8 px-6 py-5 text-left text-white transition-colors hover:bg-white/12">
                                    <div class="text-xs uppercase tracking-[0.24em] text-slate-300">Secondary action</div>
                                    <div class="mt-2 text-2xl font-semibold">${this.formatAttendanceEventLabel(secondaryAction)}</div>
                                </button>
                            ` : `
                                <div class="rounded-[28px] border border-white/12 bg-white/5 px-6 py-5 text-slate-300">
                                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Next step</div>
                                    <div class="mt-2 text-2xl font-semibold">No secondary action</div>
                                    <div class="mt-2 text-sm text-slate-400">Use the main button to record the next punch.</div>
                                </div>
                            `}
                        </div>
                        <p id="time-clock-feedback" class="mt-5 min-h-6 text-sm ${feedbackClasses}">
                            ${this.timeClockStationFeedback || 'Use one action only once. After a successful save, the station returns to the colleague list automatically.'}
                        </p>
                    </div>
                </section>

                <section class="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Today</div>
                    <h3 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Live summary</h3>
                    <div class="mt-6 grid grid-cols-2 gap-3">
                        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div class="text-sm text-slate-500">Worked</div>
                            <div class="mt-2 text-3xl font-semibold text-slate-900">${this.formatMinutesAsDuration(todaySummary?.workedMinutes || 0)}</div>
                        </div>
                        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div class="text-sm text-slate-500">Breaks</div>
                            <div class="mt-2 text-3xl font-semibold text-slate-900">${this.formatMinutesAsDuration(todaySummary?.breakMinutes || 0)}</div>
                        </div>
                        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div class="text-sm text-slate-500">First in</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">${formatTimeLabel(todaySummary?.firstClockIn)}</div>
                        </div>
                        <div class="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div class="text-sm text-slate-500">Last out</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">${formatTimeLabel(todaySummary?.lastClockOut)}</div>
                        </div>
                    </div>
                    ${(todaySummary?.activeSessionStartedAt || todaySummary?.activeBreakStartedAt) ? `
                        <div class="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                            <div class="text-sm text-emerald-700">${todaySummary?.activeBreakStartedAt ? 'Current break' : 'Current shift block'}</div>
                            <div class="mt-1 text-3xl font-semibold text-emerald-900" data-live-duration-start="${todaySummary.activeBreakStartedAt || todaySummary.activeSessionStartedAt}">
                                ${this.formatMinutesAsDuration(this.getMinutesBetween(todaySummary.activeBreakStartedAt || todaySummary.activeSessionStartedAt, referenceDateTime))}
                            </div>
                        </div>
                    ` : `
                        <div class="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                            No active shift block is open right now.
                        </div>
                    `}
                    <div class="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Single-block days of 06:00 or longer still auto-deduct 01:00 for lunch when no break punches are recorded.
                    </div>
                </section>

                <section class="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2">
                    <div class="flex items-center justify-between gap-4">
                        <div>
                            <div class="text-xs uppercase tracking-[0.24em] text-slate-400">Today&apos;s log</div>
                            <h3 class="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Punch timeline</h3>
                        </div>
                        ${todayRecord?.review?.status === 'needs-attention' ? '<span class="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Needs review</span>' : ''}
                    </div>
                    <ul class="mt-6">${timeline}</ul>
                </section>
            </div>
        `;
    }

    renderTimeClockPage() {
        const container = document.getElementById('time-clock-page-content');
        if (!container) return;

        if (this.isTimeClockStationMode()) {
            this.renderTimeClockStationPage(container);
            return;
        }
        this.renderSelfServiceTimeClockPage(container);
    }

    renderSelfServiceTimeClockPage(container) {

        const now = new Date();
        const referenceDateTime = formatLocalDateTime(now);
        const loginEmail = this.dataManager.getCurrentUserContext()?.email;
        const employee = this.dataManager.getCurrentUserEmployee();
        const todayRecord = employee ? this.dataManager.getAttendanceRecord(employee.id, now) : null;
        const todaySummary = employee
            ? this.dataManager.getCurrentUserAttendanceSummary(now, { referenceDateTime })
            : null;
        const weekSummary = employee
            ? this.dataManager.getCurrentUserWeekAttendanceSummary(this.getMondayForDate(now), { referenceDateTime })
            : null;
        const statusCopy = this.getAttendanceStatusCopy(todaySummary);
        const reviewQueue = this.dataManager.getAttendanceReviewQueue({ referenceDateTime }).slice(0, 6);
        const canManageAttendance = !this.dataManager.isClockOnlyUser();
        const isClockOnlyUser = this.dataManager.isClockOnlyUser();
        const canOpenVacationBoard = this.dataManager.canAccessVacationBoard();
        const primaryAction = todaySummary?.primaryAction || 'clockIn';
        const secondaryAction = todaySummary?.secondaryAction || null;
        const shouldShowSecondaryAction = Boolean(
            secondaryAction
            && (!isClockOnlyUser || todaySummary?.status === 'on-break')
        );
        const weekStart = this.getMondayForDate(now);
        const todayDateKey = this.dataManager.getDateKey(now);
        const schedulePreview = employee && !employee.isLinkedFallback
            ? Array.from({ length: 7 }, (_, offset) => {
                const current = new Date(weekStart);
                current.setDate(weekStart.getDate() + offset);
                return {
                    date: current,
                    planned: this.getPlannedTimesheetStatus(employee, current)
                };
            })
            : [];
        const historyRecords = employee
            ? this.dataManager.getAttendanceRecordsForEmployee(employee.id)
                .slice()
                .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
            : [];
        const adjustmentEmployeeOptions = this.dataManager.getActiveEmployees()
            .map((entry) => `<option value="${entry.id}">${entry.name}</option>`)
            .join('');
        const timeline = todaySummary?.punches?.length
            ? todaySummary.punches.map((punch) => {
                const sourceTag = punch.source === 'manual'
                    ? '<span class="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Manual</span>'
                    : '<span class="text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600 px-2 py-1 rounded-full">Web</span>';

                return `
                    <li class="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
                        <div>
                            <div class="font-medium text-slate-900">${this.formatAttendanceEventLabel(punch.type)}</div>
                            <div class="text-sm text-slate-500">${punch.note || 'Saved immediately to the attendance log.'}</div>
                        </div>
                        <div class="text-right shrink-0">
                            <div class="font-semibold text-slate-900">${formatTimeLabel(punch.occurredAt)}</div>
                            <div class="mt-1">${sourceTag}</div>
                        </div>
                    </li>
                `;
            }).join('')
            : '<li class="py-6 text-sm text-slate-500">No punches recorded yet today.</li>';
        const historyMarkup = historyRecords.length
            ? historyRecords.map((record) => {
                const summary = this.dataManager.getAttendanceSummary(
                    employee.id,
                    record.dateKey,
                    { referenceDateTime: record.dateKey === todayDateKey ? referenceDateTime : null }
                );
                const breakText = this.getBreakSummaryText(summary);
                const notesText = this.getAttendanceNotesText(record, summary);
                const punchTags = summary.punches.length
                    ? summary.punches.map((punch) => `
                        <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs">
                            <span class="font-medium">${this.formatAttendanceEventLabel(punch.type)}</span>
                            <span>${formatTimeLabel(punch.occurredAt)}</span>
                        </span>
                    `).join('')
                    : '<span class="text-sm text-slate-500">No punches recorded for this day.</span>';

                return `
                    <article class="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <div class="text-lg font-semibold text-slate-900">${new Date(`${record.dateKey}T00:00:00`).toLocaleDateString('en-GB', {
                                    weekday: 'long',
                                    day: '2-digit',
                                    month: 'long',
                                    year: 'numeric'
                                })}</div>
                                <div class="text-sm text-slate-500 mt-1">${summary.punches.length} attendance event(s)</div>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                ${summary.autoBreakMinutes ? '<span class="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Auto lunch deduction</span>' : ''}
                                ${record.review?.status === 'needs-attention' ? '<span class="px-3 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700">Needs review</span>' : ''}
                                ${record.review?.status === 'reviewed' ? '<span class="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Reviewed</span>' : ''}
                            </div>
                        </div>
                        <div class="grid gap-3 mt-5 md:grid-cols-4">
                            <div class="rounded-2xl bg-white border border-slate-200 p-4">
                                <div class="text-xs uppercase tracking-wide text-slate-400">First in</div>
                                <div class="mt-2 text-xl font-semibold text-slate-900">${formatTimeLabel(summary.firstClockIn)}</div>
                            </div>
                            <div class="rounded-2xl bg-white border border-slate-200 p-4">
                                <div class="text-xs uppercase tracking-wide text-slate-400">Last out</div>
                                <div class="mt-2 text-xl font-semibold text-slate-900">${formatTimeLabel(summary.lastClockOut)}</div>
                            </div>
                            <div class="rounded-2xl bg-white border border-slate-200 p-4">
                                <div class="text-xs uppercase tracking-wide text-slate-400">Worked</div>
                                <div class="mt-2 text-xl font-semibold text-slate-900">${this.formatMinutesAsDuration(summary.workedMinutes || 0)}</div>
                            </div>
                            <div class="rounded-2xl bg-white border border-slate-200 p-4">
                                <div class="text-xs uppercase tracking-wide text-slate-400">Break</div>
                                <div class="mt-2 text-xl font-semibold text-slate-900">${this.formatMinutesAsDuration(summary.breakMinutes || 0)}</div>
                            </div>
                        </div>
                        <div class="mt-4 text-sm text-slate-600">${breakText || 'No break recorded for this day.'}</div>
                        ${notesText ? `<div class="mt-3 text-sm text-slate-600">${notesText}</div>` : ''}
                        <div class="mt-4 flex flex-wrap gap-2">
                            ${punchTags}
                        </div>
                    </article>
                `;
            }).join('')
            : '<div class="rounded-3xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">No attendance history yet.</div>';

        const managerPanel = canManageAttendance ? `
            <section class="rounded-[28px] bg-white border border-slate-200 shadow-sm p-6 lg:col-span-2">
                <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                    <div class="flex-1">
                        <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">Manager Review</div>
                        <h3 class="text-2xl font-semibold text-slate-900">Exceptions and manual adjustments</h3>
                        <p class="text-slate-600 mt-2 max-w-2xl">Use this panel for missed punches, reconstructed entries, and days that still need review before export.</p>
                    </div>
                    <button id="open-attendance-print-from-clock-btn" class="px-4 py-2 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors">
                        Open Weekly Print View
                    </button>
                </div>
                <div class="grid gap-6 lg:grid-cols-[1fr_0.95fr] mt-8">
                    <div class="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                        <div class="flex items-center justify-between mb-4">
                            <div class="font-semibold text-slate-900">Needs attention</div>
                            <div class="text-sm text-slate-500">${reviewQueue.length} open</div>
                        </div>
                        <div id="attendance-review-list" class="space-y-3">
                            ${reviewQueue.length ? reviewQueue.map(({ record, summary }) => `
                                <article class="rounded-2xl bg-white border border-slate-200 p-4">
                                    <div class="flex items-start justify-between gap-4">
                                        <div>
                                            <div class="font-medium text-slate-900">${record.employeeName || 'Unknown colleague'}</div>
                                            <div class="text-sm text-slate-500">${record.dateKey}</div>
                                        </div>
                                        <button
                                            type="button"
                                            class="text-sm text-emerald-700 hover:text-emerald-800"
                                            data-attendance-review-employee-id="${record.employeeId}"
                                            data-attendance-review-date-key="${record.dateKey}">
                                            Mark reviewed
                                        </button>
                                    </div>
                                    <div class="mt-3 text-sm text-slate-600">
                                        ${summary.hasOpenSession ? 'Open session still needs confirmation.' : (record.review.note || 'Manual adjustment awaiting confirmation.')}
                                    </div>
                                    <div class="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                                        <span class="px-2 py-1 rounded-full bg-slate-100">Worked ${this.formatMinutesAsDuration(summary.workedMinutes)}</span>
                                        <span class="px-2 py-1 rounded-full bg-slate-100">Break ${this.formatMinutesAsDuration(summary.breakMinutes)}</span>
                                    </div>
                                </article>
                            `).join('') : '<div class="rounded-2xl bg-white border border-dashed border-slate-300 p-6 text-sm text-slate-500">No attendance exceptions right now.</div>'}
                        </div>
                    </div>
                    <div class="rounded-3xl border border-slate-200 bg-slate-50/70 p-5">
                        <div class="font-semibold text-slate-900 mb-2">Add manual event</div>
                        <p class="text-sm text-slate-500 mb-4">Use this only for missed punches or reviewed corrections. Every manual entry is flagged for review.</p>
                        <form id="attendance-adjustment-form" class="space-y-3">
                            <select id="attendance-adjustment-employee" class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900">
                                ${adjustmentEmployeeOptions}
                            </select>
                            <div class="grid grid-cols-2 gap-3">
                                <input id="attendance-adjustment-date" type="date" class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900" value="${this.dataManager.getDateKey(now)}">
                                <input id="attendance-adjustment-time" type="time" class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900" value="${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}">
                            </div>
                            <select id="attendance-adjustment-type" class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900">
                                <option value="clockIn">Clock in</option>
                                <option value="breakStart">Start break</option>
                                <option value="breakEnd">End break</option>
                                <option value="clockOut">Clock out</option>
                            </select>
                            <textarea id="attendance-adjustment-note" rows="3" class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900" placeholder="Reason for the correction"></textarea>
                            <button type="submit" class="w-full rounded-full bg-slate-900 text-white px-4 py-3 hover:bg-slate-800 transition-colors">Save Manual Event</button>
                            <p id="attendance-adjustment-feedback" class="text-sm text-slate-500 h-5"></p>
                        </form>
                    </div>
                </div>
            </section>
        ` : '';

        container.innerHTML = `
            <div class="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <section class="rounded-[32px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_52%,#334155_100%)] text-white p-8 shadow-xl overflow-hidden relative">
                    <div class="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.28),transparent_58%)] pointer-events-none"></div>
                    <div class="relative">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border ${statusCopy.tone} text-sm font-medium">
                            <span class="w-2 h-2 rounded-full bg-current"></span>
                            ${statusCopy.badge}
                        </div>
                        <div class="mt-6">
                            <div class="text-xs uppercase tracking-[0.28em] text-slate-300 mb-3">Digital Time Clock</div>
                            <h2 class="text-4xl font-semibold tracking-tight">${employee ? employee.name : 'Self-service attendance'}</h2>
                            <p class="mt-3 text-slate-300 max-w-xl">${statusCopy.title}</p>
                            <p class="mt-2 text-sm text-slate-400">Signed in as: ${loginEmail || 'unknown email'}</p>
                        </div>
                        <div class="mt-10">
                            <div id="time-clock-current-time" class="text-6xl font-semibold tracking-tight">${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            <div id="time-clock-current-date" class="mt-2 text-slate-300">${now.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
                        </div>
                        ${canOpenVacationBoard ? `
                            <div class="mt-8 flex flex-wrap items-center gap-3">
                                <button type="button" data-open-shared-vacation-board class="rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/16">
                                    ${t('schedule.board.timeClockCta')}
                                </button>
                                <p class="text-sm text-slate-300">${t('schedule.board.timeClockHint')}</p>
                            </div>
                        ` : ''}
                        ${employee ? `
                            <div class="mt-10 flex flex-wrap gap-3">
                                <button data-time-clock-action="${primaryAction}" class="rounded-full bg-white text-slate-900 px-6 py-3 font-semibold hover:bg-slate-100 transition-colors">
                                    ${this.formatAttendanceEventLabel(primaryAction)}
                                </button>
                                ${shouldShowSecondaryAction ? `
                                    <button data-time-clock-action="${secondaryAction}" class="rounded-full border border-white/30 text-white px-6 py-3 font-semibold hover:bg-white/10 transition-colors">
                                        ${this.formatAttendanceEventLabel(secondaryAction)}
                                    </button>
                                ` : ''}
                            </div>
                        ` : `
                            <div class="mt-10 rounded-3xl border border-white/15 bg-white/5 p-5 text-slate-200">
                                You can still use the manager review tools below, but employee self-service will stay locked until an active colleague profile is linked to your login email.
                            </div>
                        `}
                        <p id="time-clock-feedback" class="mt-4 text-sm text-slate-300 h-5"></p>
                    </div>
                </section>

                <section class="rounded-[32px] bg-white border border-slate-200 shadow-sm p-6">
                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">Today</div>
                    <h3 class="text-2xl font-semibold text-slate-900">Live summary</h3>
                    <div class="grid grid-cols-2 gap-3 mt-6">
                        <div class="rounded-3xl bg-slate-50 border border-slate-200 p-4">
                            <div class="text-sm text-slate-500">Worked</div>
                            <div class="mt-2 text-3xl font-semibold text-slate-900">${this.formatMinutesAsDuration(todaySummary?.workedMinutes || 0)}</div>
                        </div>
                        <div class="rounded-3xl bg-slate-50 border border-slate-200 p-4">
                            <div class="text-sm text-slate-500">Breaks</div>
                            <div class="mt-2 text-3xl font-semibold text-slate-900">${this.formatMinutesAsDuration(todaySummary?.breakMinutes || 0)}</div>
                        </div>
                        <div class="rounded-3xl bg-slate-50 border border-slate-200 p-4">
                            <div class="text-sm text-slate-500">First in</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">${formatTimeLabel(todaySummary?.firstClockIn)}</div>
                        </div>
                        <div class="rounded-3xl bg-slate-50 border border-slate-200 p-4">
                            <div class="text-sm text-slate-500">Last out</div>
                            <div class="mt-2 text-2xl font-semibold text-slate-900">${formatTimeLabel(todaySummary?.lastClockOut)}</div>
                        </div>
                    </div>
                    ${todaySummary?.activeSessionStartedAt || todaySummary?.activeBreakStartedAt ? `
                        <div class="mt-5 rounded-3xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                            <div class="text-sm text-emerald-700">${todaySummary?.activeBreakStartedAt ? 'Current break' : 'Current shift block'}</div>
                            <div class="mt-1 text-2xl font-semibold text-emerald-900" data-live-duration-start="${todaySummary.activeBreakStartedAt || todaySummary.activeSessionStartedAt}">
                                ${this.formatMinutesAsDuration(
                                    this.getMinutesBetween(todaySummary.activeBreakStartedAt || todaySummary.activeSessionStartedAt, referenceDateTime)
                                )}
                            </div>
                        </div>
                    ` : ''}
                    <div class="mt-6 rounded-3xl bg-slate-900 text-white p-5">
                        <div class="text-sm text-slate-300">This week</div>
                        <div class="mt-2 text-3xl font-semibold">${this.formatMinutesAsDuration(weekSummary?.workedMinutes || 0)}</div>
                        <div class="mt-1 text-slate-300">Worked across ${weekSummary?.daysWithPunches || 0} day(s)</div>
                    </div>
                    <div class="mt-5 rounded-3xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                        Single-block workdays of 06:00 or longer automatically deduct 01:00 for lunch when no break punches are recorded.
                    </div>
                </section>

                <section class="rounded-[28px] bg-white border border-slate-200 shadow-sm p-6">
                    <div class="flex items-center justify-between gap-4">
                        <div>
                            <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">Today&apos;s Log</div>
                            <h3 class="text-2xl font-semibold text-slate-900">Punch timeline</h3>
                        </div>
                        ${todayRecord?.review?.status === 'needs-attention' ? '<span class="px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Needs review</span>' : ''}
                    </div>
                    <ul class="mt-6">${timeline}</ul>
                </section>

                <section class="rounded-[28px] bg-white border border-slate-200 shadow-sm p-6">
                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">Weekly Snapshot</div>
                    <h3 class="text-2xl font-semibold text-slate-900">Attendance totals</h3>
                    <div class="space-y-4 mt-6">
                        <div class="flex items-center justify-between">
                            <span class="text-slate-600">Worked time</span>
                            <span class="font-semibold text-slate-900">${this.formatMinutesAsDuration(weekSummary?.workedMinutes || 0)}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-slate-600">Break time</span>
                            <span class="font-semibold text-slate-900">${this.formatMinutesAsDuration(weekSummary?.breakMinutes || 0)}</span>
                        </div>
                        <div class="flex items-center justify-between">
                            <span class="text-slate-600">Open sessions</span>
                            <span class="font-semibold text-slate-900">${weekSummary?.openSessions || 0}</span>
                        </div>
                    </div>
                    <div class="mt-6 rounded-3xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
                        The website stores clock-in, clock-out, breaks, and manual adjustments in a weekly register that managers can review or print when needed.
                    </div>
                </section>

                <section class="rounded-[28px] bg-white border border-slate-200 shadow-sm p-6 lg:col-span-2">
                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">This Week</div>
                    <h3 class="text-2xl font-semibold text-slate-900">Your planned schedule</h3>
                    <div class="grid gap-3 mt-6 md:grid-cols-2 xl:grid-cols-4">
                        ${schedulePreview.length ? schedulePreview.map((day) => `
                            <article class="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                                <div class="text-sm text-slate-500">${day.date.toLocaleDateString('en-GB', { weekday: 'long' })}</div>
                                <div class="text-lg font-semibold text-slate-900 mt-1">${day.date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}</div>
                                <div class="mt-3 text-sm text-slate-700">${day.planned}</div>
                            </article>
                        `).join('') : '<div class="text-sm text-slate-500">No linked colleague schedule available yet.</div>'}
                    </div>
                </section>

                <section class="rounded-[28px] bg-white border border-slate-200 shadow-sm p-6 lg:col-span-2">
                    <div class="text-xs uppercase tracking-[0.24em] text-slate-400 mb-2">History</div>
                    <h3 class="text-2xl font-semibold text-slate-900">All attendance history</h3>
                    <div class="space-y-4 mt-6">
                        ${historyMarkup}
                    </div>
                </section>

                ${managerPanel}
            </div>
        `;
    }

    getBreakIntervalsText(punches = []) {
        const intervals = [];
        let breakStart = null;

        punches.forEach((punch) => {
            if (punch.type === 'breakStart') {
                breakStart = punch.occurredAt;
            } else if ((punch.type === 'breakEnd' || punch.type === 'clockOut') && breakStart) {
                intervals.push(`${formatTimeLabel(breakStart)}-${formatTimeLabel(punch.occurredAt)}`);
                breakStart = null;
            }
        });

        return intervals.join(', ');
    }

    getBreakSummaryText(summary = null) {
        const intervals = this.getBreakIntervalsText(summary?.punches || []);
        if (intervals) {
            return intervals;
        }

        if (summary?.autoBreakMinutes) {
            return `Automatic lunch deduction (${this.formatMinutesAsDuration(summary.autoBreakMinutes)})`;
        }

        return '';
    }

    getAttendanceNotesText(record = null, summary = null) {
        if (!record && !summary) return '';

        const safeRecord = record || {};
        const notes = [];
        if (summary?.autoBreakMinutes) {
            notes.push(`Automatic lunch deduction applied: ${this.formatMinutesAsDuration(summary.autoBreakMinutes)}`);
        }

        if (safeRecord.review?.note) {
            notes.push(safeRecord.review.note);
        }

        (safeRecord.punches || [])
            .filter((punch) => punch.note)
            .forEach((punch) => {
                notes.push(`${this.formatAttendanceEventLabel(punch.type)}: ${punch.note}`);
            });

        return notes.join(' | ');
    }

    getPlannedTimesheetStatus(employee, date) {
        const status = this.dataManager.getEmployeeStatusForDate(employee, date);
        const holidayName = this.dataManager.getHolidaysForYear(date.getFullYear())[this.dataManager.getDateKey(date)];

        if (holidayName) return `Holiday: ${holidayName}`;
        if (status === 'Working') return (employee.shifts && employee.shifts.default) ? employee.shifts.default : '9:00-18:00';
        if (status === 'On Vacation' || status === 'Vacation') return 'Vacation';
        if (status === 'Scheduled Off' || status === 'Off') return 'Off';
        return status;
    }

    resolveSelectedTimesheetEmployee(employees = []) {
        if (!employees.length) {
            this.currentTimesheetEmployeeId = null;
            return null;
        }

        const selectedEmployee = employees.find((employee) => employee.id === this.currentTimesheetEmployeeId);
        if (selectedEmployee) {
            return selectedEmployee;
        }

        const currentUserEmployee = this.dataManager.getCurrentUserEmployee();
        const currentUserOption = currentUserEmployee
            ? employees.find((employee) => employee.id === currentUserEmployee.id)
            : null;
        const fallbackEmployee = currentUserOption || employees[0];
        this.currentTimesheetEmployeeId = fallbackEmployee.id;
        return fallbackEmployee;
    }

    renderWeeklyTimesheet(startDate) {
        const container = document.getElementById('timesheet-content');
        if (!container) return;

        const monday = this.getMondayForDate(startDate);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const label = document.getElementById('timesheet-week-label');
        if (label) {
            label.textContent = this.formatWeekLabel(monday, sunday);
        }

        this.currentTimesheetDate = monday;

        const employees = this.dataManager.getActiveEmployees();
        const employeeSelect = document.getElementById('timesheet-employee-select');
        if (employees.length === 0) {
            this.currentTimesheetEmployeeId = null;
            if (employeeSelect) {
                employeeSelect.innerHTML = '<option value="">Select colleague</option>';
                employeeSelect.value = '';
                employeeSelect.disabled = true;
            }
            container.innerHTML = `
                <div class="max-w-3xl mx-auto border rounded-xl p-8 text-center text-gray-600">
                    No colleagues found. Add staff before printing a time sheet.
                </div>
            `;
            return;
        }

        const selectedEmployee = this.resolveSelectedTimesheetEmployee(employees);
        if (employeeSelect) {
            employeeSelect.innerHTML = employees.map((employee) => `
                <option value="${employee.id}">${employee.name}</option>
            `).join('');
            employeeSelect.value = selectedEmployee?.id || '';
            employeeSelect.disabled = false;
        }

        if (!selectedEmployee) {
            container.innerHTML = `
                <div class="max-w-3xl mx-auto border rounded-xl p-8 text-center text-gray-600">
                    Select a colleague to open the time sheet print view.
                </div>
            `;
            return;
        }

        const employee = selectedEmployee;
        const days = [];
        let plannedWeeklyHours = 0;
        let recordedWeeklyMinutes = 0;

        for (let i = 0; i < 7; i++) {
            const current = new Date(monday);
            current.setDate(monday.getDate() + i);
            const dateKey = this.dataManager.getDateKey(current);

            const planned = this.getPlannedTimesheetStatus(employee, current);
            const plannedHours = this.parseShiftHours(planned);
            if (plannedHours) plannedWeeklyHours += plannedHours;

            const referenceDateTime = dateKey === this.dataManager.getDateKey(new Date())
                ? formatLocalDateTime(new Date())
                : null;
            const attendanceRecord = this.dataManager.getAttendanceRecord(employee.id, current);
            const attendanceSummary = this.dataManager.getAttendanceSummary(employee.id, current, { referenceDateTime });
            recordedWeeklyMinutes += attendanceSummary.workedMinutes || 0;

            const recordedHours = (attendanceSummary.workedMinutes || 0) / 60;
            const manualExtraHours = Number(employee.extraHours?.[dateKey] || 0);
            const calculatedExtraHours = Math.max(0, recordedHours - (plannedHours || 0));
            const extraHoursValue = manualExtraHours > 0 ? manualExtraHours : calculatedExtraHours;

            days.push({
                dateLabel: current.toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                }),
                planned,
                dailyHours: plannedHours ? this.formatDurationHours(plannedHours) : '',
                startTime: formatTimeLabel(attendanceSummary.firstClockIn),
                breakWindows: this.getBreakSummaryText(attendanceSummary),
                endTime: formatTimeLabel(attendanceSummary.lastClockOut),
                recordedHours: this.formatMinutesAsDuration(attendanceSummary.workedMinutes || 0),
                extraHours: extraHoursValue > 0 ? this.formatDurationHours(extraHoursValue) : '',
                notes: this.getAttendanceNotesText(attendanceRecord, attendanceSummary),
                proof: attendanceRecord?.punches?.length ? 'Digital log' : ''
            });
        }

        container.innerHTML = `
            <section class="timesheet-page max-w-7xl mx-auto mb-10 border border-gray-300 rounded-xl overflow-hidden">
                <div class="px-8 py-6 border-b bg-gray-50">
                    <div class="flex items-start justify-between gap-6">
                        <div>
                            <h2 class="text-2xl font-bold text-gray-900">Registo de tempos de trabalho</h2>
                            <p class="text-sm text-gray-600 mt-1">Artigo 202 do Codigo do Trabalho: inicio, termo, interrupcoes/intervalos, horas por dia e por semana, com visto/assinatura quando aplicavel.</p>
                        </div>
                        <div class="text-right text-sm text-gray-600">
                            <div>Semana</div>
                            <div class="font-semibold text-gray-900">${this.formatWeekLabel(monday, sunday)}</div>
                        </div>
                    </div>
                </div>

                <div class="px-8 py-6 space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div class="border rounded-lg p-3">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-1">Empregador / estabelecimento</div>
                            <div class="h-6 border-b border-dashed border-gray-400"></div>
                        </div>
                        <div class="border rounded-lg p-3">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-1">Atividade / local de trabalho</div>
                            <div class="h-6 border-b border-dashed border-gray-400"></div>
                        </div>
                        <div class="border rounded-lg p-3">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-1">Trabalhador</div>
                            <div class="font-semibold text-gray-900">${employee.name}</div>
                        </div>
                        <div class="border rounded-lg p-3">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-1">Numero / horario base previsto</div>
                            <div class="font-semibold text-gray-900">${employee.staffNumber ? employee.staffNumber : '-'} / ${employee.shifts?.default || '9:00-18:00'}</div>
                        </div>
                    </div>

                    <div class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                        Preencher com as horas reais de entrada, intervalos nao incluidos e saida. Para trabalho no exterior, recolher o visto/assinatura e manter o registo visado no prazo legal.
                    </div>

                    <div class="overflow-x-auto">
                        <table class="w-full text-sm border-collapse border border-gray-300">
                            <thead>
                                <tr class="bg-gray-100">
                                    <th class="border border-gray-300 p-2 text-left">Data</th>
                                    <th class="border border-gray-300 p-2 text-left">Planeado</th>
                                    <th class="border border-gray-300 p-2 text-left">Entrada</th>
                                    <th class="border border-gray-300 p-2 text-left">Intervalos nao incluidos</th>
                                    <th class="border border-gray-300 p-2 text-left">Saida</th>
                                    <th class="border border-gray-300 p-2 text-left">Total diario</th>
                                    <th class="border border-gray-300 p-2 text-left">Trabalho suplementar</th>
                                    <th class="border border-gray-300 p-2 text-left">Fundamento / observacoes</th>
                                    <th class="border border-gray-300 p-2 text-left">Assinatura / visto</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${days.map((day) => `
                                    <tr>
                                        <td class="border border-gray-300 p-2 font-medium">${day.dateLabel}</td>
                                        <td class="border border-gray-300 p-2">
                                            <div>${day.planned}</div>
                                            ${day.dailyHours ? `<div class="text-xs text-gray-500 mt-1">Previsto: ${day.dailyHours}</div>` : ''}
                                        </td>
                                        <td class="border border-gray-300 p-2 h-12">${day.startTime !== '--:--' ? day.startTime : ''}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.breakWindows}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.endTime !== '--:--' ? day.endTime : ''}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.recordedHours !== '00:00' ? day.recordedHours : ''}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.extraHours}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.notes}</td>
                                        <td class="border border-gray-300 p-2 h-12">${day.proof}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="border rounded-lg p-4">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-2">Resumo semanal</div>
                            <div class="flex justify-between text-sm">
                                <span>Total semanal previsto</span>
                                <span class="font-semibold">${this.formatDurationHours(plannedWeeklyHours)}</span>
                            </div>
                            <div class="flex justify-between text-sm mt-2">
                                <span>Total semanal registado</span>
                                <span class="font-semibold">${this.formatMinutesAsDuration(recordedWeeklyMinutes)}</span>
                            </div>
                        </div>
                        <div class="border rounded-lg p-4">
                            <div class="text-xs uppercase tracking-wide text-gray-500 mb-2">Assinaturas</div>
                            <div class="text-sm mb-4">Trabalhador (quando aplicavel): ____________________</div>
                            <div class="text-sm">Conferido por: __________________________________</div>
                        </div>
                    </div>

                    <div class="text-xs text-gray-500">
                        Conservar este registo durante 5 anos. Se houver trabalho suplementar, o respetivo fundamento deve ficar identificado no registo.
                    </div>
                </div>
            </section>
        `;
    }

    renderStats() {
        const container = document.getElementById('stats-container');
        if (!container) return;

        const employees = this.dataManager.getActiveEmployees();
        const year = this.dataManager.getCurrentDate().getFullYear();

        // Calculate stats
        const stats = employees.map(emp => {
            // Vacation Days
            let vacationDays = 0;
            if (emp.vacations) {
                emp.vacations.forEach(vac => {
                    const start = new Date(vac.startDate);
                    const end = new Date(vac.endDate);
                    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        if (d.getFullYear() === year) {
                            const day = d.getDay();
                            if (day !== 0 && day !== 6) vacationDays++;
                        }
                    }
                });
            }
            const vacationBalance = 22 - vacationDays;

            // Extra Hours
            let extraHours = 0;
            if (emp.extraHours) {
                Object.entries(emp.extraHours).forEach(([dateKey, hours]) => {
                    if (dateKey.startsWith(year)) {
                        extraHours += parseFloat(hours);
                    }
                });
            }

            return { name: emp.name, vacationDays, vacationBalance, extraHours };
        });

        // Store stats for export
        this.currentStats = stats;
        this.currentStatsYear = year;

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-lg p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-gray-800">Yearly Statistics (${year})</h3>
                    <button id="export-stats-csv-btn" class="btn-primary px-4 py-2 rounded-lg flex items-center gap-2 text-sm" style="background: linear-gradient(135deg, #e94b5a 0%, #d3414f 100%) !important; color: white !important;">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        Export Stats to CSV
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colleague</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Vacation Used</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Vacation Balance</th>
                                <th class="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Extra Hours</th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${stats.map(s => `
                                <tr>
                                    <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${s.name}</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center text-gray-500">${s.vacationDays} days</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center font-bold ${s.vacationBalance < 0 ? 'text-red-600' : 'text-green-600'}">${s.vacationBalance} days</td>
                                    <td class="px-6 py-4 whitespace-nowrap text-center font-bold ${s.extraHours > 0 ? 'text-green-600' : (s.extraHours < 0 ? 'text-red-600' : 'text-gray-500')}">${s.extraHours.toFixed(1)} h</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderCalendarGrid() {
        renderMonthlyCalendarView(this);
    }

    renderCalendarMobileCards() {
        renderMonthlyCalendarMobileCards(this);
    }

    renderYearlySummary() {
        renderYearlySummaryView(this);
    }

    renderMadeiraHolidays() {
        renderMadeiraReferenceView();
    }

    renderVacationBoard() {
        renderVacationBoardView(this);
    }

    isVacationBoardOnlyMode() {
        return this.dataManager.isVacationBoardOnlyUser();
    }

    syncScheduleNavigationState(activeView) {
        const limitedBoardMode = this.isVacationBoardOnlyMode();
        const buttons = [
            ...SCHEDULE_VIEWS,
            { id: 'reorder-view-btn', view: 'reorder' },
            { id: 'history-view-btn', view: 'history' }
        ];

        buttons.forEach((buttonConfig) => {
            const element = document.getElementById(buttonConfig.id);
            if (!element) {
                return;
            }

            const shouldHide = limitedBoardMode && buttonConfig.view !== 'vacation-board';
            element.classList.toggle('hidden', shouldHide);

            if (buttonConfig.view === activeView) {
                element.classList.add('bg-white', 'text-gray-900', 'shadow-sm', 'active-segment');
                element.classList.remove('text-gray-600', 'hover:text-gray-900');
            } else {
                element.classList.remove('bg-white', 'text-gray-900', 'shadow-sm', 'active-segment');
                element.classList.add('text-gray-600', 'hover:text-gray-900');
            }
        });

        const referenceGroup = document.getElementById('schedule-reference-group');
        referenceGroup?.classList.toggle('hidden', limitedBoardMode);

        const navigationSubtitle = document.getElementById('schedule-navigation-subtitle');
        if (navigationSubtitle) {
            navigationSubtitle.textContent = limitedBoardMode
                ? t('schedule.board.navigationSubtitle')
                : t('schedule.navigation.subtitle');
        }

        const helpButton = document.getElementById('schedule-help-btn');
        helpButton?.classList.toggle('hidden', limitedBoardMode);
    }

    updateView() {
        const limitedBoardMode = this.isVacationBoardOnlyMode();
        const currentView = limitedBoardMode ? 'vacation-board' : this.dataManager.getCurrentView();
        const currentDate = this.dataManager.getCurrentDate();
        const displayLocale = i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
        const viewMeta = getScheduleViewMeta(currentView);

        if (limitedBoardMode && this.dataManager.getCurrentView() !== 'vacation-board') {
            this.dataManager.setCurrentView('vacation-board');
        }

        this.dataManager.ensureHolidaysForYear(currentDate.getFullYear());
        this.dataManager.ensureHolidaysForYear(currentDate.getFullYear() - 1);
        this.dataManager.ensureHolidaysForYear(currentDate.getFullYear() + 1);
        this.renderEmployeeList();
        renderScheduleWorkspaceSummary(this.dataManager);
        renderScheduleAccessBanner(this.dataManager);
        this.syncScheduleNavigationState(currentView);

        const viewHeader = document.getElementById('view-header');
        const viewHeaderKicker = document.getElementById('view-header-kicker');
        const viewHeaderContext = document.getElementById('view-header-context');
        const calendarControls = document.getElementById('calendar-controls');
        const pdfDownloadButton = document.getElementById('pdf-download-btn');

        if (viewHeaderKicker) {
            viewHeaderKicker.textContent = t(viewMeta.titleKey);
        }
        if (viewHeaderContext) {
            viewHeaderContext.textContent = t(viewMeta.descriptionKey);
        }

        const mainViews = {
            calendar: document.getElementById('calendar-grid'),
            calendarMobile: document.getElementById('calendar-mobile-cards'),
            yearly: document.getElementById('yearly-summary-container'),
            vacationBoard: document.getElementById('vacation-board-container'),
            madeiraHolidays: document.getElementById('madeira-holidays-container'),
            stats: document.getElementById('stats-container'),
            vacation: document.getElementById('vacation-planner-container')
        };

        Object.values(mainViews).forEach((element) => {
            element?.classList.add('hidden');
        });
        mainViews.calendar?.classList.remove('md:grid');

        const addColleagueSection = document.getElementById('add-colleague-section');
        if (addColleagueSection) {
            addColleagueSection.style.display = 'none';
        }

        const showCalendarControls = ['monthly', 'yearly'].includes(currentView);
        calendarControls?.classList.toggle('hidden', !showCalendarControls);
        pdfDownloadButton?.classList.toggle('hidden', currentView !== 'monthly');

        if (currentView === 'monthly') {
            if (viewHeader) {
                viewHeader.textContent = new Intl.DateTimeFormat(displayLocale, {
                    month: 'long',
                    year: 'numeric'
                }).format(currentDate);
            }

            mainViews.calendar?.classList.remove('hidden');
            mainViews.calendar?.classList.add('md:grid');
            mainViews.calendarMobile?.classList.remove('hidden');
            this.renderCalendarGrid();
            return;
        }

        if (currentView === 'yearly') {
            if (viewHeader) {
                viewHeader.textContent = new Intl.DateTimeFormat(displayLocale, {
                    year: 'numeric'
                }).format(currentDate);
            }

            mainViews.yearly?.classList.remove('hidden');
            this.renderYearlySummary();
            return;
        }

        if (currentView === 'vacation-board') {
            if (viewHeader) {
                viewHeader.textContent = new Intl.DateTimeFormat(displayLocale, {
                    year: 'numeric'
                }).format(currentDate);
            }

            mainViews.vacationBoard?.classList.remove('hidden');
            this.renderVacationBoard();
            return;
        }

        if (currentView === 'madeira-holidays') {
            mainViews.madeiraHolidays?.classList.remove('hidden');
            this.renderMadeiraHolidays();
            return;
        }

        if (currentView === 'vacation') {
            mainViews.vacation?.classList.remove('hidden');
            window.scheduleManager?.renderVacationPlanner();
            return;
        }

        if (currentView === 'stats') {
            mainViews.stats?.classList.remove('hidden');
            this.renderStats();
        }
    }

    renderStats() {
        renderStatsScheduleView(this);
    }

    exportStatsToCSV() {
        if (!this.currentStats || !this.currentStatsYear) {
            console.warn('No stats data available for export');
            return;
        }

        // CSV Header
        let csv = 'Colleague,Vacation Used (days),Vacation Balance (days),Extra Hours\n';

        // CSV Rows
        this.currentStats.forEach(stat => {
            csv += `"${stat.name}",${stat.vacationDays},${stat.vacationBalance},${stat.extraHours.toFixed(1)}\n`;
        });

        // Create blob and download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `stats_${this.currentStatsYear}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    toggleStaffMode() {
        this.isStaffMode = !this.isStaffMode;

        // Update button label
        const label = document.getElementById('staff-mode-label');
        const btn = document.getElementById('toggle-staff-mode-btn');

        if (this.isStaffMode) {
            label.textContent = 'Admin View';
            btn.classList.remove('bg-purple-50', 'text-purple-600', 'border-purple-200');
            btn.classList.add('bg-green-50', 'text-green-600', 'border-green-200');

            // Show banner
            this.showStaffModeBanner();
        } else {
            label.textContent = 'Staff View';
            btn.classList.remove('bg-green-50', 'text-green-600', 'border-green-200');
            btn.classList.add('bg-purple-50', 'text-purple-600', 'border-purple-200');

            // Hide banner
            this.hideStaffModeBanner();
        }

        // Re-render current view
        this.updateView();
    }

    showStaffModeBanner() {
        let banner = document.getElementById('staff-mode-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'staff-mode-banner';
            banner.className = 'fixed top-0 left-0 right-0 bg-purple-600 text-white text-center py-2 px-4 z-50 shadow-lg';
            banner.innerHTML = `
                <div class="flex items-center justify-center gap-2">
                    <i class="fas fa-eye"></i>
                    <span class="font-semibold">STAFF VIEW MODE - Read Only</span>
                </div>
            `;
            document.body.appendChild(banner);
        }
        banner.classList.remove('hidden');
    }

    hideStaffModeBanner() {
        const banner = document.getElementById('staff-mode-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
    }

    /**
     * Show the Schedule Help/Tutorial Modal
     */
    showScheduleHelpModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('schedule-help-modal');
        if (existingModal) existingModal.remove();

        // Create modal content
        const modal = document.createElement('div');
        modal.id = 'schedule-help-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity opacity-0';

        // Trigger generic fade-in
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all scale-95 opacity-0" id="schedule-help-modal-inner">
                <!-- Header -->
                <div class="bg-gradient-to-r from-[#e94b5a] to-[#d3414f] p-6 flex justify-between items-center text-white">
                    <div>
                        <h2 class="text-2xl font-bold">Work Schedule Guide</h2>
                        <p class="text-red-100 opacity-90 text-sm mt-1">Learn how to use the schedule, manage staff, and plan vacations.</p>
                    </div>
                    <button id="schedule-help-close" class="text-white hover:bg-white/20 rounded-lg p-2 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        <!-- Nav Sidebar -->
                        <div class="md:col-span-1 space-y-2 sticky top-0">
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-red-200 text-red-700 font-bold flex items-center gap-3 transition-transform hover:translate-x-1" data-section="overview">
                                <span class="bg-red-100 text-red-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-home"></i></span>
                                Getting Started
                            </button>
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-red-600" data-section="monthly">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-calendar-alt"></i></span>
                                Monthly View
                            </button>
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-red-600" data-section="yearly">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-calendar"></i></span>
                                Yearly View
                            </button>
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-red-600" data-section="holidays">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-star"></i></span>
                                Madeira Holidays
                            </button>
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-red-600" data-section="stats">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-chart-bar"></i></span>
                                Statistics
                            </button>
                            <button class="schedule-help-nav w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-red-600" data-section="vacation">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"><i class="fas fa-umbrella-beach"></i></span>
                                Vacation Planner
                            </button>
                        </div>

                        <!-- Main Guide Content -->
                        <div class="md:col-span-2 space-y-6">
                            
                            <!-- SECTION: OVERVIEW -->
                            <div id="help-section-overview" class="schedule-help-section bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-home text-red-500"></i> Getting Started
                                </h3>
                                <p class="text-gray-600 mb-4">The Work Schedule helps you manage your team's availability, track working days, and plan vacations. Here's a quick overview of the main features:</p>
                                
                                <div class="space-y-4">
                                    <div class="flex gap-4 items-start">
                                        <div class="flex-shrink-0">
                                            <div class="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-calendar-alt"></i>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">View Tabs</h4>
                                            <p class="text-sm text-gray-600">Use the tabs at the top to switch between <strong>Monthly</strong>, <strong>Yearly</strong>, <strong>Madeira Holidays</strong>, <strong>Stats</strong>, and <strong>Vacation Planner</strong> views.</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4 items-start">
                                        <div class="flex-shrink-0">
                                            <div class="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-users"></i>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">Employee Sidebar</h4>
                                            <p class="text-sm text-gray-600">The left sidebar shows your team members. Click on any colleague to see their details, summary, or to edit their working days.</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4 items-start">
                                        <div class="flex-shrink-0">
                                            <div class="w-10 h-10 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center">
                                                <i class="fas fa-circle"></i>
                                            </div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">Color Legend</h4>
                                            <p class="text-sm text-gray-600"><span class="inline-block w-3 h-3 bg-green-600 rounded-full mr-1"></span> Working &nbsp; <span class="inline-block w-3 h-3 bg-yellow-600 rounded-full mr-1"></span> Holiday &nbsp; <span class="inline-block w-3 h-3 bg-gray-400 rounded-full mr-1"></span> Off/Weekend</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- SECTION: MONTHLY -->
                            <div id="help-section-monthly" class="schedule-help-section hidden bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-calendar-alt text-red-500"></i> Monthly View
                                </h3>
                                <p class="text-gray-600 mb-4">The Monthly View shows a calendar grid for the current month with each team member's status for every day.</p>
                                
                                <div class="space-y-4">
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📅 Reading the Calendar</h4>
                                        <ul class="text-sm text-gray-600 space-y-1 list-disc list-inside">
                                            <li>Each cell shows how many colleagues are working that day</li>
                                            <li>Click on any day to view/edit who is working</li>
                                            <li>Days with ★ indicate public holidays</li>
                                            <li>Weekends are shown in gray</li>
                                        </ul>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">🔄 Changing Status</h4>
                                        <p class="text-sm text-gray-600">Click on a day → In the popup, select a status for each colleague (Working, Off, Sick, etc.) → Changes save automatically.</p>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📄 Download PDF</h4>
                                        <p class="text-sm text-gray-600">Click the <strong>download icon</strong> (📥) in the calendar controls to generate a printable PDF report of the month.</p>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">🖨️ Weekly Roster</h4>
                                        <p class="text-sm text-gray-600">Click the <strong>print icon</strong> to view and print a weekly roster table showing shifts for each colleague.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- SECTION: YEARLY -->
                            <div id="help-section-yearly" class="schedule-help-section hidden bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-calendar text-red-500"></i> Yearly View
                                </h3>
                                <p class="text-gray-600 mb-4">Get a bird's-eye view of the entire year at a glance.</p>
                                
                                <div class="space-y-4">
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📊 Yearly Summary</h4>
                                        <ul class="text-sm text-gray-600 space-y-1 list-disc list-inside">
                                            <li>Shows a compact grid of all 12 months</li>
                                            <li>Each month displays total working days for the team</li>
                                            <li>Click on any month to jump to that month's detailed view</li>
                                        </ul>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">🔀 Navigation</h4>
                                        <p class="text-sm text-gray-600">Use the <strong>←</strong> and <strong>→</strong> arrows to move between years. The year is displayed in the header.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- SECTION: MADEIRA HOLIDAYS -->
                            <div id="help-section-holidays" class="schedule-help-section hidden bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-star text-yellow-500"></i> Madeira Holidays
                                </h3>
                                <p class="text-gray-600 mb-4">This section lists all official public holidays and cultural events specific to Madeira.</p>
                                
                                <div class="space-y-4">
                                    <div class="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
                                        <h4 class="font-bold text-yellow-800 mb-2">🌟 Public Holidays</h4>
                                        <p class="text-sm text-yellow-700">On official public holidays, all colleagues are <strong>automatically marked as not working</strong>. You can manually override individual colleagues if needed by clicking on the day in Monthly View.</p>
                                    </div>
                                    <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                                        <h4 class="font-bold text-blue-800 mb-2">🎭 Cultural Events</h4>
                                        <p class="text-sm text-blue-700">The "Cultural Events" tab shows festivals and celebrations that are <strong>not</strong> official holidays. Colleagues may still be scheduled to work on these days.</p>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📌 Regional Holidays</h4>
                                        <p class="text-sm text-gray-600">Holidays marked with a "Regional" badge (like Madeira Day on July 1) are specific to Madeira and may not apply elsewhere in Portugal.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- SECTION: STATS -->
                            <div id="help-section-stats" class="schedule-help-section hidden bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-chart-bar text-purple-500"></i> Team Statistics
                                </h3>
                                <p class="text-gray-600 mb-4">View detailed statistics for each team member over the year.</p>
                                
                                <div class="space-y-4">
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📈 Statistics Explained</h4>
                                        <ul class="text-sm text-gray-600 space-y-2">
                                            <li><strong>Vacation Used:</strong> Number of vacation days taken this year (weekdays only)</li>
                                            <li><strong>Vacation Balance:</strong> Remaining vacation days from the standard 22-day allowance. <span class="text-green-600">Green = positive</span>, <span class="text-red-600">Red = over limit</span></li>
                                            <li><strong>Extra Hours:</strong> Total overtime hours logged for the year</li>
                                        </ul>
                                    </div>
                                    <div class="bg-green-50 p-4 rounded-lg border-l-4 border-green-400">
                                        <h4 class="font-bold text-green-800 mb-2">📤 Export to CSV</h4>
                                        <p class="text-sm text-green-700">Click the <strong>"Export Stats to CSV"</strong> button to download a spreadsheet file with all the statistics. Perfect for HR reporting or payroll calculations.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- SECTION: VACATION PLANNER -->
                            <div id="help-section-vacation" class="schedule-help-section hidden bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-umbrella-beach text-blue-500"></i> Vacation Planner
                                </h3>
                                <p class="text-gray-600 mb-4">Plan and manage team vacations with an interactive calendar.</p>
                                
                                <div class="space-y-4">
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">📅 Calendar Display</h4>
                                        <p class="text-sm text-gray-600">The vacation planner shows a full calendar view with all booked vacations displayed as colored bars. Each colleague has a unique color for easy identification.</p>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">➕ Booking a Vacation</h4>
                                        <ol class="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                                            <li>Click and drag on the calendar to select a date range</li>
                                            <li>A booking modal will appear</li>
                                            <li>Select the colleague and confirm the dates</li>
                                            <li>Click "Book Vacation" to save</li>
                                        </ol>
                                    </div>
                                    <div class="bg-gray-50 p-4 rounded-lg">
                                        <h4 class="font-bold text-gray-800 mb-2">✏️ Editing/Deleting</h4>
                                        <p class="text-sm text-gray-600">Click on any existing vacation bar to view details. From there, you can edit the dates or delete the vacation entry.</p>
                                    </div>
                                    <div class="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
                                        <h4 class="font-bold text-blue-800 mb-2">💡 Tip</h4>
                                        <p class="text-sm text-blue-700">Vacation days are automatically reflected in the Monthly View and Stats. You don't need to manually mark vacation days in the calendar!</p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
                
                <!-- Footer -->
                <div class="p-4 bg-gray-100 border-t border-gray-200 text-center">
                    <button id="schedule-help-done-btn" class="bg-[#e94b5a] hover:bg-[#d3414f] text-white px-8 py-2 rounded-lg font-medium transition-colors">
                        Got it, thanks!
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Trigger inner scale animation
        setTimeout(() => {
            const inner = document.getElementById('schedule-help-modal-inner');
            inner.classList.remove('scale-95', 'opacity-0');
            inner.classList.add('scale-100', 'opacity-100');
        }, 50);

        // Section navigation
        modal.querySelectorAll('.schedule-help-nav').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const section = btn.dataset.section;

                // Update nav buttons
                modal.querySelectorAll('.schedule-help-nav').forEach(navBtn => {
                    navBtn.classList.remove('border-red-200', 'text-red-700', 'font-bold');
                    navBtn.classList.add('border-gray-200', 'text-gray-700', 'font-medium');
                    navBtn.querySelector('span').classList.remove('bg-red-100', 'text-red-600');
                    navBtn.querySelector('span').classList.add('bg-gray-100', 'text-gray-500');
                });
                btn.classList.remove('border-gray-200', 'text-gray-700', 'font-medium');
                btn.classList.add('border-red-200', 'text-red-700', 'font-bold');
                btn.querySelector('span').classList.remove('bg-gray-100', 'text-gray-500');
                btn.querySelector('span').classList.add('bg-red-100', 'text-red-600');

                // Show correct section
                modal.querySelectorAll('.schedule-help-section').forEach(sec => sec.classList.add('hidden'));
                document.getElementById(`help-section-${section}`).classList.remove('hidden');
            });
        });

        // Close handlers
        const close = () => {
            modal.classList.add('opacity-0');
            const inner = document.getElementById('schedule-help-modal-inner');
            inner.classList.remove('scale-100', 'opacity-100');
            inner.classList.add('scale-95', 'opacity-0');
            setTimeout(() => modal.remove(), 300);
        };
        document.getElementById('schedule-help-close').onclick = close;
        document.getElementById('schedule-help-done-btn').onclick = close;
        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
    }
} 
