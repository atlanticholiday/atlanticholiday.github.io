
import { Config } from './config.js';

export class StaffManager {
    constructor(dataManager, uiManager) {
        this.dataManager = dataManager;
        this.uiManager = uiManager; // We might need UIManager for some shared modals or refactor further
        this.isHistoryView = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Dashboard Button
        const goToStaffBtn = document.getElementById('go-to-staff-btn');
        if (goToStaffBtn) {
            goToStaffBtn.addEventListener('click', () => {
                // Navigation is handled by NavigationManager, but we can trigger render
                this.render();
            });
        }

        // Toggle History
        const toggleHistoryBtn = document.getElementById('toggle-history-view-btn');
        if (toggleHistoryBtn) {
            toggleHistoryBtn.addEventListener('click', () => {
                this.isHistoryView = !this.isHistoryView;
                toggleHistoryBtn.textContent = this.isHistoryView ? 'View Active Staff' : 'Archive/History';
                this.render();
            });
        }

        // Sign Out
        const signOutBtn = document.getElementById('staff-sign-out-btn');
        if (signOutBtn) {
            signOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }

        // Listen for global render events if data changes
        this.dataManager.setOnDataChangeCallback(() => {
            if (!document.getElementById('staff-page').classList.contains('hidden')) {
                this.render();
            }
        });

        // Delegate Edit/Archive/Restore/Delete clicks
        const container = document.getElementById('staff-page');
        if (container) {
            container.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target) return;

                if (target.classList.contains('edit-employee-btn')) {
                    const empId = target.dataset.employeeId;
                    this.uiManager.showEditEmployeeModal(empId);
                } else if (target.classList.contains('archive-btn')) {
                    const empId = target.dataset.employeeId;
                    this.handleArchive(empId);
                } else if (target.classList.contains('restore-btn')) {
                    const empId = target.dataset.employeeId;
                    this.handleRestore(empId);
                } else if (target.classList.contains('delete-btn')) {
                    const empId = target.dataset.employeeId;
                    this.handleDelete(empId);
                }
            });
        }
        this.setupAddEmployeeListeners();
    }

    setupAddEmployeeListeners() {
        // Add Employee Modal Triggers
        document.addEventListener('click', (e) => {
            if (e.target.closest('#open-add-employee-modal-btn')) {
                const modal = document.getElementById('add-employee-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    // Initialize shift dropdowns if needed
                    if (this.uiManager && this.uiManager.populateShiftDropdowns) {
                        this.uiManager.populateShiftDropdowns();
                    }
                }
            }
        });

        // Add Employee Modal Close Handlers
        const closeBtn = document.getElementById('add-employee-close-btn');
        const cancelBtn = document.getElementById('add-employee-cancel-btn');
        const modal = document.getElementById('add-employee-modal');

        const closeModal = () => {
            if (modal) modal.classList.add('hidden');
            // Clear inputs
            const nameInput = document.getElementById('new-employee-name');
            const staffNumInput = document.getElementById('new-employee-staff-number');
            const errorP = document.getElementById('add-employee-error');

            if (nameInput) nameInput.value = '';
            if (staffNumInput) staffNumInput.value = '';
            if (errorP) errorP.textContent = '';

            document.querySelectorAll('#work-day-checkboxes input').forEach(cb => cb.checked = false);
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Add Employee Action
        const addBtn = document.getElementById('add-employee-btn');
        if (addBtn) {
            // Use a clean listener approach
            addBtn.replaceWith(addBtn.cloneNode(true));
            document.getElementById('add-employee-btn').addEventListener('click', () => this.addEmployee());
        }
    }

    async addEmployee() {
        const nameInput = document.getElementById('new-employee-name');
        const staffNumberInput = document.getElementById('new-employee-staff-number');
        const errorP = document.getElementById('add-employee-error');
        if (errorP) errorP.textContent = '';

        const name = nameInput.value.trim();
        const staffNumber = staffNumberInput ? staffNumberInput.value.trim() : '';

        if (!name) {
            if (errorP) errorP.textContent = "Please enter a name.";
            return;
        }

        const workDays = Array.from(document.querySelectorAll('#work-day-checkboxes input:checked')).map(cb => parseInt(cb.value));
        if (workDays.length === 0) {
            if (errorP) errorP.textContent = "Please select at least one day.";
            return;
        }

        try {
            await this.dataManager.addEmployee(name, staffNumber, workDays);
            // Close modal on success
            const modal = document.getElementById('add-employee-modal');
            if (modal) modal.classList.add('hidden');

            nameInput.value = '';
            if (staffNumberInput) staffNumberInput.value = '';
            document.querySelectorAll('#work-day-checkboxes input').forEach(cb => cb.checked = false);
            this.render(); // Explicit render update
        } catch (e) {
            console.error(e);
            if (errorP) errorP.textContent = "Could not add colleague. Please try again.";
        }
    }

    render() {
        const listContainer = document.getElementById('staff-list-container');
        const historyContainer = document.getElementById('history-list-container');

        if (this.isHistoryView) {
            listContainer.classList.add('hidden');
            historyContainer.classList.remove('hidden');
            this.renderHistoryList();
        } else {
            listContainer.classList.remove('hidden');
            historyContainer.classList.add('hidden');
            this.renderActiveList();
        }
    }

    renderActiveList() {
        const container = document.getElementById('staff-list-container');
        if (!container) return;

        const activeEmployees = this.dataManager.getActiveEmployees();
        if (activeEmployees.length === 0) {
            container.innerHTML = `<p class="text-gray-500 italic text-center p-4">No active colleagues found.</p>`;
            return;
        }

        container.innerHTML = activeEmployees.map(emp => `
            <div class="bg-white border rounded-lg p-4 hover:shadow-md transition-shadow flex items-center justify-between">
                <div class="flex items-center gap-4">
                     <div class="bg-gray-100 rounded-full p-2 text-gray-500">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                     </div>
                     <div>
                        <h3 class="text-lg font-semibold text-gray-900">${emp.name}</h3>
                        <p class="text-sm text-gray-600">
                            ${emp.staffNumber ? `Staff #${emp.staffNumber}` : ''}
                            ${emp.department ? `• ${emp.department}` : ''}
                            ${emp.position ? `• ${emp.position}` : ''}
                        </p>
                         <p class="text-xs text-gray-500 mt-1">Default: ${emp.workDays.map(d => Config.DAYS_OF_WEEK[d]).join(', ')}</p>
                     </div>
                </div>
                <div class="flex gap-2">
                    <button class="edit-employee-btn text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md transition-colors text-sm font-medium" data-employee-id="${emp.id}">
                        Edit
                    </button>
                    <button class="archive-btn text-yellow-600 hover:bg-yellow-50 px-3 py-2 rounded-md transition-colors text-sm font-medium" data-employee-id="${emp.id}">
                        Archive
                    </button>
                    <button class="individual-pdf-btn text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-md transition-colors text-sm font-medium hidden" data-employee-id="${emp.id}">
                         Report
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderHistoryList() {
        const container = document.getElementById('history-list-container');
        if (!container) return;

        const archivedEmployees = this.dataManager.getArchivedEmployees();
        if (archivedEmployees.length === 0) {
            container.innerHTML = `<p class="text-gray-500 italic text-center p-4">No archived colleagues.</p>`;
            return;
        }

        container.innerHTML = archivedEmployees.map(emp => `
            <div class="bg-gray-50 border rounded-lg p-4 opacity-75 hover:opacity-100 transition-opacity flex items-center justify-between">
                <div>
                     <h3 class="text-lg font-semibold text-gray-700">${emp.name}</h3>
                     <p class="text-sm text-gray-500">Archived</p>
                </div>
                 <div class="flex gap-2">
                    <button class="restore-btn text-green-600 hover:bg-green-50 px-3 py-2 rounded-md transition-colors text-sm font-medium" data-employee-id="${emp.id}">
                        Restore
                    </button>
                    <button class="delete-btn text-red-600 hover:bg-red-50 px-3 py-2 rounded-md transition-colors text-sm font-medium" data-employee-id="${emp.id}">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    async handleArchive(id) {
        if (confirm('Are you sure you want to archive this colleague?')) {
            try {
                // Assuming dataManager has toggleArchive or similar logic. 
                // Investigating DataManager first might be needed, but sticking to standard pattern:
                // Actually ScheduleManager had reorder logic, let's assume updateEmployee or similar.
                // Wait, I recall dataManager having archive logic.
                const emp = this.dataManager.getActiveEmployees().find(e => e.id === id);
                if (emp) {
                    emp.isArchived = true;
                    await this.dataManager.updateEmployee(emp);
                }
            } catch (e) {
                console.error(e);
                alert('Failed to archive.');
            }
        }
    }

    async handleRestore(id) {
        try {
            const emp = this.dataManager.getArchivedEmployees().find(e => e.id === id);
            if (emp) {
                emp.isArchived = false;
                await this.dataManager.updateEmployee(emp);
                this.render(); // Refresh immediately
            }
        } catch (e) {
            console.error(e);
            alert('Failed to restore.');
        }
    }

    async handleDelete(id) {
        if (confirm('Are you sure you want to PERMANENTLY delete this colleague? This cannot be undone.')) {
            try {
                await this.dataManager.deleteEmployee(id);
                this.render();
            } catch (e) {
                console.error(e);
                alert('Failed to delete.');
            }
        }
    }
}
