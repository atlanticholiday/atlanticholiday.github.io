import { i18n, t } from './i18n.js';

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
        const views = ['monthly', 'yearly', 'madeira-holidays', 'stats', 'vacation'];
        views.forEach(view => {
            const btn = document.getElementById(`${view}-view-btn`);
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

        // 1. Header & Controls
        container.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-gradient">${t('schedule.vacation.title')}</h2>
                    <p class="text-gray-600">${t('schedule.vacation.subtitle')}</p>
                </div>
                <button id="main-book-vacation-btn" class="btn-primary shadow-lg hover-lift px-6 py-2 rounded-full flex items-center gap-2" style="background: linear-gradient(135deg, #e94b5a 0%, #d3414f 100%) !important; color: white !important;">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    ${t('schedule.vacation.bookNew')}
                </button>
            </div>
            <div id="vacation-calendar" class="bg-white rounded-xl shadow-lg p-4 min-h-[600px]"></div>
            <div class="mt-6">
                <h3 class="font-semibold text-lg mb-4">${t('schedule.vacation.upcomingList')}</h3>
                <div id="vacation-list-view" class="space-y-3"></div>
            </div>
        `;

        // 2. Setup Actions
        document.getElementById('main-book-vacation-btn').addEventListener('click', () => this.openBookVacationModal());

        // 3. Prepare Calendar Events
        const employees = this.dataManager.getActiveEmployees();
        const events = [];
        const employeeColors = {};

        // Generate consistent colors for employees
        const getEmployeeColor = (name) => {
            let hash = 0;
            for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
            const h = Math.abs(hash % 360);
            return `hsl(${h}, 70%, 45%)`;
        };

        employees.forEach(emp => {
            employeeColors[emp.id] = getEmployeeColor(emp.name);
            (emp.vacations || []).forEach((vac, idx) => {
                const endPlusOne = new Date(vac.endDate);
                endPlusOne.setDate(endPlusOne.getDate() + 1);
                events.push({
                    title: emp.name,
                    start: vac.startDate,
                    end: endPlusOne.toISOString().split('T')[0],
                    allDay: true,
                    backgroundColor: employeeColors[emp.id],
                    borderColor: 'transparent',
                    extendedProps: { employeeId: emp.id, vacationIndex: idx }
                });
            });
        });

        // 4. Initialize FullCalendar
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
                select: (info) => {
                    this.openBookVacationModal(info.startStr, info.endStr ? new Date(new Date(info.endStr).setDate(new Date(info.endStr).getDate() - 1)).toISOString().split('T')[0] : info.startStr);
                },
                eventClick: (info) => {
                    const { employeeId, vacationIndex } = info.event.extendedProps;

                    // Adjust end date back by 1 day because FullCalendar is exclusive on end dates for allDay events
                    const endDate = new Date(info.event.end);
                    endDate.setDate(endDate.getDate() - 1);

                    this.openBookVacationModal(
                        info.event.startStr,
                        endDate.toISOString().split('T')[0],
                        employeeId,
                        vacationIndex
                    );
                },
                height: 'auto'
            });
            calendar.render();
        }

        // 5. Render Simple List View (Optional but helpful)
        const listView = document.getElementById('vacation-list-view');
        // Sort all vacations by start date logic could go here
    }

    openBookVacationModal(startDateStr = '', endDateStr = '', employeeId = null, vacationIndex = null) {
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
        delete modal.dataset.vacationIndex;
        select.disabled = false;
        saveBtn.textContent = 'Schedule Vacation';
        if (deleteBtn) deleteBtn.classList.add('hidden');
        if (title) title.textContent = 'Book Vacation';

        // Edit Mode
        if (employeeId && vacationIndex !== null && vacationIndex !== undefined) {
            modal.dataset.editing = 'true';
            modal.dataset.employeeId = employeeId;
            modal.dataset.vacationIndex = vacationIndex;
            select.value = employeeId;
            select.disabled = true; // Don't switch employee when editing specific vacation
            saveBtn.textContent = 'Update Vacation';
            if (deleteBtn) deleteBtn.classList.remove('hidden');
            if (title) title.textContent = 'Edit Vacation';
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
            alert("Please select a colleague and dates.");
            return;
        }

        try {
            if (modal.dataset.editing === 'true') {
                const originalEmployeeId = modal.dataset.employeeId;
                const vacationIndex = parseInt(modal.dataset.vacationIndex);
                // In case for some reason select value is different (though disabled), use original
                await this.dataManager.handleUpdateVacation(originalEmployeeId, vacationIndex, startDate, endDate);
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
            alert("Failed to save vacation.");
        }
    }

    async handleDeleteVacation() {
        const modal = document.getElementById('book-vacation-modal');
        if (modal.dataset.editing !== 'true') return;

        const employeeId = modal.dataset.employeeId;
        const vacationIndex = parseInt(modal.dataset.vacationIndex);

        if (confirm("Are you sure you want to delete this vacation?")) {
            try {
                await this.dataManager.handleDeleteVacation(employeeId, vacationIndex);
                modal.classList.add('hidden');
                this.renderVacationPlanner();
            } catch (e) {
                console.error(e);
                alert("Failed to delete vacation.");
            }
        }
    }
}
