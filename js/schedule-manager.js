export class ScheduleManager {
    constructor(dataManager, uiManager) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Add Employee Modal Triggers
        const openBtn = document.getElementById('open-add-employee-modal-btn');
        if (openBtn) {
            openBtn.addEventListener('click', () => {
                const modal = document.getElementById('add-employee-modal');
                if (modal) modal.classList.remove('hidden');
            });
        }

        // Add Employee Modal Close Handlers
        const closeBtn = document.getElementById('add-employee-close-btn');
        const cancelBtn = document.getElementById('add-employee-cancel-btn');
        const modal = document.getElementById('add-employee-modal');

        const closeModal = () => {
            if (modal) modal.classList.add('hidden');
            // Clear inputs
            document.getElementById('new-employee-name').value = '';
            document.getElementById('new-employee-staff-number').value = '';
            document.querySelectorAll('#work-day-checkboxes input').forEach(cb => cb.checked = false);
            document.getElementById('add-employee-error').textContent = '';
        };

        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Add Employee Action
        const addBtn = document.getElementById('add-employee-btn');
        if (addBtn) {
            // Remove existing listeners to avoid duplicates if possible, 
            // but since we are refactoring, we assume we control the init.
            // Using a named function bind or just a closure.
            addBtn.replaceWith(addBtn.cloneNode(true)); // Hack to clear old listeners from EventManager
            document.getElementById('add-employee-btn').addEventListener('click', () => this.addEmployee());
        }

        // View Toggles
        const views = ['monthly', 'yearly', 'madeira-holidays', 'vacation', 'reorder', 'history'];
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

    async addEmployee() {
        const nameInput = document.getElementById('new-employee-name');
        const staffNumberInput = document.getElementById('new-employee-staff-number');
        const errorP = document.getElementById('add-employee-error');
        errorP.textContent = '';

        const name = nameInput.value.trim();
        const staffNumber = staffNumberInput.value.trim();
        if (!name) { errorP.textContent = "Please enter a name."; return; }

        const workDays = Array.from(document.querySelectorAll('#work-day-checkboxes input:checked')).map(cb => parseInt(cb.value));
        if (workDays.length === 0) { errorP.textContent = "Please select at least one day."; return; }

        try {
            await this.dataManager.addEmployee(name, staffNumber, workDays);
            // Close modal on success
            document.getElementById('add-employee-modal').classList.add('hidden');
            nameInput.value = '';
            staffNumberInput.value = '';
            document.querySelectorAll('#work-day-checkboxes input').forEach(cb => cb.checked = false);
        } catch (e) {
            console.error(e);
            errorP.textContent = "Could not add colleague. Please try again.";
        }
    }
}
