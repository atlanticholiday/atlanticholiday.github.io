import { Config } from './config.js';

export class UIManager {
    constructor(dataManager, holidayCalculator, pdfGenerator) {
        this.dataManager = dataManager;
        this.holidayCalculator = holidayCalculator;
        this.pdfGenerator = pdfGenerator;
        
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
        const listContainer = document.getElementById('employee-list');
        if (!listContainer) return;
        
        const activeEmployees = this.dataManager.getActiveEmployees();
        if (activeEmployees.length === 0) {
            listContainer.innerHTML = `<p class="text-gray-500 italic text-center">No active colleagues.</p>`;
            return;
        }
        
        const year = this.dataManager.getCurrentDate().getFullYear();
        const currentView = this.dataManager.getCurrentView();
        if (currentView === 'vacation') {
            const allHolidays = this.dataManager.getAllHolidays();
            listContainer.innerHTML = activeEmployees.map(emp => {
                let usedDays = 0;
                if (emp.vacations && emp.vacations.length > 0) {
                    emp.vacations.forEach(vac => {
                        let current = new Date(vac.startDate);
                        const end = new Date(vac.endDate);
                        while (current <= end) {
                            const dayIndex = current.getDay();
                            if (emp.workDays.includes(dayIndex)) {
                                const dateKey = this.dataManager.getDateKey(current);
                                const hols = allHolidays[current.getFullYear()] || {};
                                if (!hols[dateKey]) {
                                    usedDays++;
                                }
                            }
                            current.setDate(current.getDate() + 1);
                        }
                    });
                }
                let entitled = 22;
                if (emp.hireDate) {
                    const hire = new Date(emp.hireDate);
                    if (hire.getFullYear() === year) {
                        const startOfProration = hire;
                        const endOfYear = new Date(year, 11, 31);
                        const totalDays = Math.floor((endOfYear - new Date(year, 0, 1)) / MS_PER_DAY) + 1;
                        const remainingDays = Math.floor((endOfYear - startOfProration) / MS_PER_DAY) + 1;
                        entitled = Math.round(22 * (remainingDays / totalDays));
                    } else if (hire.getFullYear() > year) {
                        entitled = 0;
                    }
                }
                const remaining = entitled - usedDays;
                return `
                    <div class="stat-item bg-gray-100 p-4 rounded-lg mb-2">
                        <p class="font-semibold">${emp.name}</p>
                        <p class="text-sm">Used: ${usedDays} days</p>
                        <p class="text-sm">Remaining: ${remaining >= 0 ? remaining : 0} days</p>
                    </div>
                `;
            }).join('');
            return;
        }
        
        listContainer.innerHTML = activeEmployees.map(emp => {
            let stats = { worked: 0, off: 0, absent: 0, vacation: 0, extraHours: 0 };
            const currentView = this.dataManager.getCurrentView();
            const loopMonths = (currentView === 'yearly') ? 12 : 1;
            const startMonth = (currentView === 'yearly') ? 0 : this.dataManager.getCurrentDate().getMonth();

            for (let m = 0; m < loopMonths; m++) {
                const month = startMonth + m;
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(year, month, day);
                    const status = this.dataManager.getEmployeeStatusForDate(emp, date);

                    if (status === 'On Vacation') stats.vacation++;
                    else if (status === 'Working') stats.worked++;
                    else if (status === 'Absent') stats.absent++;
                    else stats.off++; 

                    const dateKey = this.dataManager.getDateKey(date);
                    if(emp.extraHours && emp.extraHours[dateKey]) {
                        stats.extraHours += emp.extraHours[dateKey];
                    }
                }
            }
            
            return `
                <div class="employee-card bg-gray-100 rounded-lg p-4 hover-lift">
                    <div class="employee-card-main" data-employee-id="${emp.id}">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1">
                                <p class="font-semibold text-lg text-gray-900 mb-1">${emp.name}</p>
                                <p class="text-sm text-gray-600">Default: ${emp.workDays.map(d => Config.DAYS_OF_WEEK[d]).join(', ')}</p>
                            </div>
                            <button class="edit-working-days-btn text-brand hover:text-brand-dark p-2 rounded-md hover:bg-brand-light transition-all hover-scale" title="Edit working days" data-employee-id="${emp.id}" data-employee-name="${emp.name}">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                            </button>
                        </div>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <p class="font-bold text-lg text-green-600">${stats.worked}</p>
                                <p class="text-xs text-gray-500">Worked</p>
                            </div>
                            <div class="stat-item">
                                <p class="font-bold text-lg text-yellow-600">${stats.vacation}</p>
                                <p class="text-xs text-gray-500">Vacation</p>
                            </div>

                            <div class="stat-item">
                                <p class="font-bold text-lg text-blue-600">${stats.off}</p>
                                <p class="text-xs text-gray-500">Off</p>
                            </div>
                            <div class="stat-item">
                                <p class="font-bold text-lg text-red-600">${stats.absent}</p>
                                <p class="text-xs text-gray-500">Absent</p>
                            </div>
                            <div class="stat-item">
                                <p class="font-bold text-lg text-purple-600">${stats.extraHours.toFixed(1)}</p>
                                <p class="text-xs text-gray-500">Extra Hours</p>
                            </div>
                        </div>
                    </div>
                    <button class="individual-pdf-btn mt-4 w-full text-sm bg-white border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 transition-all hover-lift flex items-center justify-center gap-2" data-employee-id="${emp.id}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Download Report
                    </button>
                </div>`;
        }).join('');
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
        if(!grid) return;
        grid.innerHTML = '';
        Config.DAYS_OF_WEEK.forEach(day => grid.innerHTML += `<div class="text-center font-bold text-gray-500 text-sm">${day}</div>`);
        
        const firstDayIndex = new Date(year, month, 1).getDay();
        for (let i = 0; i < firstDayIndex; i++) grid.appendChild(document.createElement('div'));
        
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = this.dataManager.getDateKey(date);
            const holidayName = currentYearHolidays[dateKey];
            

            
            const workingCount = this.dataManager.getActiveEmployees().filter(emp => 
                this.dataManager.getEmployeeStatusForDate(emp, date) === 'Working'
            ).length;
            
            const dayCell = document.createElement('div');
            dayCell.className = `day-cell p-2 border rounded-lg flex flex-col items-center justify-center h-24 sm:h-28 relative`;
            if ([0, 6].includes(date.getDay()) && !holidayName) dayCell.classList.add('bg-gray-50');
            if (holidayName) {
                dayCell.classList.add('holiday');
                dayCell.title = holidayName;
            }

            dayCell.dataset.date = dateKey;
            if (holidayName) {
                // Holiday day layout
                dayCell.innerHTML = `
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
                `;
            } else {
                // Regular day layout  
                dayCell.innerHTML = `
                    <div class="text-lg font-semibold">${day}</div>
                    <div class="mt-2 flex items-center space-x-2 text-green-600">
                        <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                        </svg>
                        <span class="text-xl font-bold">${workingCount}</span>
                    </div>
                    <div class="text-xs text-gray-500">working</div>
                `;
            }
            grid.appendChild(dayCell);
        }
    }
    
    renderYearlySummary() {
        const year = this.dataManager.getCurrentDate().getFullYear();
        const container = document.getElementById('yearly-summary-container');
        if(!container) return;
        
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
                    if(emp.extraHours && emp.extraHours[dateKey]) {
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

    renderVacationPlanner() {
        const container = document.getElementById('vacation-planner-container');
        if(!container) return;
        const employees = this.dataManager.getActiveEmployees();
        const holidayMapAll = this.dataManager.getAllHolidays();
        container.innerHTML = '<div class="space-y-6">' +
            employees.map(emp => {
                // sort and index vacations
                const indexedVacations = (emp.vacations || []).map((vac, idx) => ({ vac, idx }));
                indexedVacations.sort((a, b) => new Date(a.vac.startDate) - new Date(b.vac.startDate));
                const vacationsHTML = indexedVacations.length > 0
                    ? indexedVacations.map(({ vac, idx }) => {
                        const start = new Date(vac.startDate);
                        const end = new Date(vac.endDate);
                        // count business days excluding holidays
                        let daysCount = 0;
                        let curr = new Date(vac.startDate);
                        while (curr <= end) {
                            const day = curr.getDay();
                            const dateKey = this.dataManager.getDateKey(curr);
                            const hols = holidayMapAll[curr.getFullYear()] || {};
                            if (emp.workDays.includes(day) && !hols[dateKey]) {
                                daysCount++;
                            }
                            curr.setDate(curr.getDate() + 1);
                        }
                        return `
                    <div class="flex justify-between items-center bg-white p-2 rounded-md text-sm">
                        <span>${daysCount} day${daysCount!==1?'s':''}: ${start.toLocaleDateString()} - ${end.toLocaleDateString()}</span>
                        <div class="flex gap-2">
                          <button class="edit-vacation-btn text-blue-500 hover:text-blue-700" data-employee-id="${emp.id}" data-vacation-index="${idx}">Edit</button>
                          <button class="delete-vacation-btn text-red-500 hover:text-red-700" data-employee-id="${emp.id}" data-vacation-index="${idx}">Delete</button>
                        </div>
                    </div>`;
                    }).join('')
                    : '<p class="text-sm text-gray-500 italic">No vacations scheduled.</p>';
                return `
            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="font-bold text-lg">${emp.name}</h4>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 my-3">
                    <input type="date" id="vacation-start-${emp.id}" class="p-2 border rounded-md focus:ring-1 focus:ring-brand">
                    <input type="date" id="vacation-end-${emp.id}" class="p-2 border rounded-md focus:ring-1 focus:ring-brand">
                    <button class="schedule-vacation-btn bg-brand text-white p-2 rounded-md hover:bg-brand-dark" data-employee-id="${emp.id}">Schedule</button>
                </div>
                <div class="mt-4 space-y-2">
                    <h5 class="font-semibold text-sm">Scheduled Vacations:</h5>
                    ${vacationsHTML}
                </div>
            </div>`;
            }).join('') +
            '</div>';
    }
    
    renderReorderList() {
        const container = document.getElementById('reorder-list-container');
        if(!container) return;
        
        container.innerHTML = `<div class="space-y-2">${this.dataManager.getActiveEmployees().map(emp => `
            <div class="draggable bg-white p-4 rounded-lg shadow flex items-center" draggable="true" data-employee-id="${emp.id}">
                <svg class="w-5 h-5 text-gray-400 mr-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                <div class="flex-grow">
                    <div class="font-medium text-gray-900">${emp.name}</div>
                    <div class="text-sm text-gray-600">
                        ${emp.staffNumber ? `Staff #${emp.staffNumber}` : 'No staff number'}
                        ${emp.department ? ` • ${emp.department}` : ''}
                        ${emp.position ? ` • ${emp.position}` : ''}
                    </div>
                </div>
                <div class="flex items-center gap-2 ml-4">
                    <button class="edit-employee-btn text-blue-600 hover:text-blue-800 p-2 rounded-md hover:bg-blue-50 transition-all hover-scale" title="Edit ${emp.name}" data-employee-id="${emp.id}" data-employee-name="${emp.name}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </button>
                    <button class="archive-btn text-yellow-600 hover:text-yellow-800 p-2 rounded-md hover:bg-yellow-50 transition-all hover-scale" title="Archive ${emp.name}" data-employee-id="${emp.id}" data-employee-name="${emp.name}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                </button>
                </div>
            </div>
        `).join('')}</div><p class="text-center text-sm text-gray-500 mt-4">Drag and drop to reorder the list. Edit or archive colleagues as needed.</p>`;
    }
    
    renderHistoryList() {
        const container = document.getElementById('history-container');
        if(!container) return;
        
        const archivedEmployees = this.dataManager.getArchivedEmployees();
        if (archivedEmployees.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 italic">No colleagues in the archive.</p>`;
            return;
        }
        
        container.innerHTML = `<div class="space-y-2">${archivedEmployees.map(emp => `
            <div class="bg-white p-4 rounded-lg shadow flex items-center justify-between">
                <span class="font-medium text-gray-500">${emp.name}</span>
                <div class="flex items-center gap-4">
                     <button class="restore-btn text-green-600 hover:text-green-800 flex items-center gap-1 text-sm" title="Restore ${emp.name}" data-employee-id="${emp.id}" data-employee-name="${emp.name}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15l4 4 4-4M4 4h16v6a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"></path></svg>
                        <span>Restore</span>
                    </button>
                    <button class="delete-btn text-red-600 hover:text-red-800 flex items-center gap-1 text-sm" title="Permanently Delete ${emp.name}" data-employee-id="${emp.id}" data-employee-name="${emp.name}">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        <span>Delete</span>
                    </button>
                </div>
            </div>
        `).join('')}</div>`;
    }

    showDayDetailsModal(dateKey) {
        this.dataManager.setSelectedDateKey(dateKey);
        const modal = document.getElementById('day-details-modal');
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        document.getElementById('modal-date-header').textContent = date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        
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
            if(onVacation) statusText = '<span class="text-blue-600 font-normal text-sm">(On Vacation)</span>';
            if(isHoliday) statusText = `<span class="text-yellow-600 font-normal text-sm">(Holiday: ${this.dataManager.getAllHolidays()[year][dateKey]})</span>`;

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
            yearly: document.getElementById('yearly-summary-container'),
            madeiraHolidays: document.getElementById('madeira-holidays-container'),
            vacation: document.getElementById('vacation-planner-container'),
            reorder: document.getElementById('reorder-list-container'),
            history: document.getElementById('history-container')
        };

        // Hide all main content views first
        Object.values(mainViews).forEach(v => v.classList.add('hidden'));

        const currentView = this.dataManager.getCurrentView();
        const showSidePanel = ['monthly', 'yearly', 'vacation'].includes(currentView);
        document.getElementById('summary-title').style.display = showSidePanel ? '' : 'none';
        document.getElementById('employee-list').style.display = showSidePanel ? '' : 'none';
        document.getElementById('add-colleague-section').style.display = showSidePanel ? '' : 'none';

        const showCalendarControls = ['monthly', 'yearly'].includes(currentView);
        document.getElementById('calendar-controls').style.display = showCalendarControls ? 'flex' : 'none';
        document.getElementById('pdf-download-btn').style.display = currentView === 'monthly' ? 'block' : 'none';

        if (currentView === 'monthly') {
            viewHeader.textContent = `${monthName} ${year}`;
            summaryTitle.textContent = "Monthly Summary";
            mainViews.calendar.classList.remove('hidden');
            this.renderCalendarGrid();
        } else if (currentView === 'yearly') {
            viewHeader.textContent = year;
            summaryTitle.textContent = "Yearly Summary";
            mainViews.yearly.classList.remove('hidden');
            this.renderYearlySummary();
        } else if (currentView === 'madeira-holidays') {
            viewHeader.textContent = "Madeira Holidays";
            summaryTitle.textContent = "Holiday List";
            mainViews.madeiraHolidays.classList.remove('hidden');
            this.renderMadeiraHolidays();
        } else if (currentView === 'vacation') {
            summaryTitle.textContent = "Vacation Summary";
            mainViews.vacation.classList.remove('hidden');
            this.renderVacationPlanner();
        } else if (currentView === 'reorder') {
            mainViews.reorder.classList.remove('hidden');
            this.renderReorderList();
        } else if (currentView === 'history') {
            mainViews.history.classList.remove('hidden');
            this.renderHistoryList();
        }
    }
    
    switchView(view) {
        const currentView = this.dataManager.getCurrentView();
        const currentDate = this.dataManager.getCurrentDate();
        
        if(currentView === 'yearly' && view === 'monthly') {
           this.dataManager.setCurrentDate(new Date(this.dataManager.lastMonthlyDate.getTime()));
        } else if(currentView === 'monthly' && view === 'yearly') {
           this.dataManager.lastMonthlyDate = new Date(currentDate.getTime());
        }
        
        this.dataManager.setCurrentView(view);
        
        document.getElementById('monthly-view-btn').classList.toggle('active', view === 'monthly');
        document.getElementById('yearly-view-btn').classList.toggle('active', view === 'yearly');
        document.getElementById('madeira-holidays-view-btn').classList.toggle('active', view === 'madeira-holidays');
        document.getElementById('vacation-view-btn').classList.toggle('active', view === 'vacation');
        document.getElementById('reorder-view-btn').classList.toggle('active', view === 'reorder');
        document.getElementById('history-view-btn').classList.toggle('active', view === 'history');
        
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
            { name: "Epiphany", date: "January 6" },
            { name: "Good Friday", date: "Variable (March/April)" },
            { name: "Easter Sunday", date: "Variable (March/April)" },
            { name: "Madeira's Autonomy Day", date: "April 2", badge: "Regional" },
            { name: "Freedom Day", date: "April 25" },
            { name: "Labour Day", date: "May 1" },
            { name: "Portugal Day", date: "June 10" },
            { name: "Madeira Day", date: "July 1", badge: "Regional" },
            { name: "Assumption of Mary", date: "August 15" },
            { name: "Funchal Day", date: "August 21", badge: "Regional" },
            { name: "Republic Day", date: "October 5" },
            { name: "All Saints' Day", date: "November 1" },
            { name: "Restoration of Independence", date: "December 1" },
            { name: "Immaculate Conception", date: "December 8" },
            { name: "Christmas Day", date: "December 25" },
            { name: "Boxing Day", date: "December 26" }
        ];

        const culturalEvents = [
            { name: "Carnival", date: "February/March (variable)", description: "Vibrant celebration with parades, costumes, and samba music" },
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
} 