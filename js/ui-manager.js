import { Config } from './config.js';

export class UIManager {
    constructor(dataManager, holidayCalculator, pdfGenerator) {
        this.dataManager = dataManager;
        this.holidayCalculator = holidayCalculator;
        this.pdfGenerator = pdfGenerator;
        this.isStaffMode = false; // Staff read-only mode

        // Set up data change callback
        this.dataManager.setOnDataChangeCallback(() => {
            this.updateView();

            // Refresh day details modal if it's open
            if (document.getElementById('day-details-modal').classList.contains('hidden') === false) {
                this.showDayDetailsModal(this.dataManager.getSelectedDateKey());
            }
        });

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

        // Force re-initialization of holidays to ensure they're loaded
        this.dataManager.holidays[year] = this.dataManager.getHolidays(year);
        let currentYearHolidays = this.dataManager.holidays[year] || {};

        // Verify holidays are loaded
        if (Object.keys(currentYearHolidays).length === 0) {
            this.dataManager.holidays[year] = this.dataManager.getHolidays(year);
            currentYearHolidays = this.dataManager.holidays[year] || {};
        }

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
                indicatorsHtml += `<span class="bg-red-500 rounded-full w-2 h-2" title="${absentCount} Absent"></span>`;
            }
            if (vacationCount > 0) {
                indicatorsHtml += `<span class="bg-yellow-400 rounded-full w-2 h-2" title="${vacationCount} On Vacation"></span>`;
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
                    <div class="text-xs text-gray-500">working</div>
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
                    ${absentCount} Absent
                </span>`;
            }
            if (vacationCount > 0) {
                indicatorsHtml += `<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    ${vacationCount} Vacation
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
                    <span class="ml-1 text-sm">working</span>
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
                                <tr><th class="px-4 py-3">Month</th><th class="px-4 py-3">Worked</th><th class="px-4 py-3">Vacation</th><th class="px-4 py-3">Off</th><th class="px-4 py-3">Absent</th><th class="px-4 py-3">Extra Hours</th></tr>
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

        const monthName = this.dataManager.getCurrentDate().toLocaleString('default', { month: 'long' });

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
            if (summaryTitle) summaryTitle.textContent = "Monthly Summary";
            mainViews.calendar.classList.remove('hidden');
            mainViews.calendar.classList.add('md:grid');
            mainViews.calendarMobile.classList.remove('hidden');
            mainViews.calendarMobile.classList.add('md:hidden', 'block');
            this.renderCalendarGrid();
        } else if (currentView === 'yearly') {
            viewHeader.textContent = year;
            if (summaryTitle) summaryTitle.textContent = "Yearly Summary";
            mainViews.yearly.classList.remove('hidden');
            this.renderYearlySummary();
        } else if (currentView === 'madeira-holidays') {
            viewHeader.textContent = "Madeira Holidays";
            if (summaryTitle) summaryTitle.textContent = "Holiday List";
            mainViews.madeiraHolidays.classList.remove('hidden');
            this.renderMadeiraHolidays();
        } else if (currentView === 'vacation') {
            if (summaryTitle) summaryTitle.textContent = "Vacation Summary";
            mainViews.vacation.classList.remove('hidden');
            if (window.scheduleManager) {
                window.scheduleManager.renderVacationPlanner();
            }
        } else if (currentView === 'stats') {
            viewHeader.textContent = "Team Statistics";
            if (summaryTitle) summaryTitle.textContent = "Statistics";
            mainViews.stats.classList.remove('hidden');
            this.renderStats();
        }
    }

    switchView(view) {
        const currentView = this.dataManager.getCurrentView();
        const currentDate = this.dataManager.getCurrentDate();

        if (currentView === 'yearly' && view === 'monthly') {
            this.dataManager.setCurrentDate(new Date(this.dataManager.lastMonthlyDate.getTime()));
        } else if (currentView === 'monthly' && view === 'yearly') {
            this.dataManager.lastMonthlyDate = new Date(currentDate.getTime());
        }

        this.dataManager.setCurrentView(view);

        // Update button styles
        const buttons = [
            { id: 'monthly-view-btn', view: 'monthly' },
            { id: 'yearly-view-btn', view: 'yearly' },
            { id: 'madeira-holidays-view-btn', view: 'madeira-holidays' },
            { id: 'stats-view-btn', view: 'stats' },
            { id: 'vacation-view-btn', view: 'vacation' },
            { id: 'reorder-view-btn', view: 'reorder' },
            { id: 'history-view-btn', view: 'history' }
        ];

        buttons.forEach(btn => {
            const el = document.getElementById(btn.id);
            if (el) {
                if (btn.view === view) {
                    // Active state
                    el.classList.add('bg-white', 'text-gray-900', 'shadow-sm', 'active-segment');
                    el.classList.remove('text-gray-600', 'hover:text-gray-900');
                } else {
                    // Inactive state
                    el.classList.remove('bg-white', 'text-gray-900', 'shadow-sm', 'active-segment');
                    el.classList.add('text-gray-600', 'hover:text-gray-900');
                }
            }
        });

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
                    <h2 class="text-2xl font-bold text-gradient mb-3">Madeira Calendar</h2>
                    <p class="text-gray-600">Public holidays and cultural events in Madeira</p>
                </div>
                
                <!-- Tab Navigation -->
                <div class="flex border-b border-gray-200 mb-6">
                    <button class="madeira-tab-btn active px-6 py-3 text-sm font-medium border-b-2 border-yellow-500 text-yellow-600" data-tab="holidays">
                        Public Holidays
                    </button>
                    <button class="madeira-tab-btn px-6 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700" data-tab="events">
                        Cultural Events
                    </button>
                </div>

                <!-- Public Holidays Tab -->
                <div id="madeira-holidays-tab" class="madeira-tab-content">
                    <div class="mb-4">
                        <h3 class="text-xl font-semibold text-gradient mb-2">Official Public Holidays</h3>
                        <p class="text-sm text-gray-600 mb-4">On these days, all colleagues are automatically marked as not working</p>
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
                                    <strong>Automatic Holiday Management:</strong> On these days, all colleagues are automatically marked as not working. 
                                    You can manually override individual colleagues if needed.
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