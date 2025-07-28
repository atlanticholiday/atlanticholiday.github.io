import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Config } from './config.js';

export class EventManager {
    constructor(auth, dataManager, uiManager) {
        this.auth = auth;
        this.dataManager = dataManager;
        this.uiManager = uiManager;
    }

    setupLoginListeners() {
        const loginBtn = document.getElementById('login-btn');
        const emailInput = document.getElementById('email-address');
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('login-error');

        console.log('Setting up login listeners...');
        console.log('Login button found:', loginBtn);
        console.log('Email input found:', emailInput);
        console.log('Password input found:', passwordInput);

        loginBtn.addEventListener('click', () => {
            console.log('Login button clicked!');
            const email = emailInput.value;
            const password = passwordInput.value;
            console.log('Email:', email);
            console.log('Password length:', password.length);
            loginError.textContent = '';
            
            signInWithEmailAndPassword(this.auth, email, password)
                .then(() => {
                    console.log('Login successful!');
                })
                .catch(error => {
                    console.error('Login failed:', error.message);
                    loginError.textContent = "Login failed. Please check your email and password.";
                });
        });
        
        document.getElementById('start-fresh-btn').addEventListener('click', () => {
            setDoc(doc(this.dataManager.db, "employees/metadata"), { initialized: true });
            this.dataManager.listenForEmployeeChanges();
        });
    }

    setupAppEventListeners() {
        document.getElementById('add-employee-btn').addEventListener('click', () => this.addEmployee());
        document.getElementById('sign-out-btn').addEventListener('click', () => signOut(this.auth));
        document.getElementById('pdf-download-btn').addEventListener('click', () => {
            this.uiManager.pdfGenerator.generateTeamReportPDF(this.dataManager);
        });
        
        document.getElementById('prev-btn').addEventListener('click', () => {
            const currentView = this.dataManager.getCurrentView();
            const currentDate = this.dataManager.getCurrentDate();
            if (currentView === 'monthly') currentDate.setMonth(currentDate.getMonth() - 1);
            else if(currentView === 'yearly') currentDate.setFullYear(currentDate.getFullYear() - 1);
            this.dataManager.setCurrentDate(currentDate);
            this.uiManager.updateView();
        });
        
        document.getElementById('next-btn').addEventListener('click', () => {
            const currentView = this.dataManager.getCurrentView();
            const currentDate = this.dataManager.getCurrentDate();
            if (currentView === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1);
            else if (currentView === 'yearly') currentDate.setFullYear(currentDate.getFullYear() + 1);
            this.dataManager.setCurrentDate(currentDate);
            this.uiManager.updateView();
        });
        
        document.getElementById('monthly-view-btn').addEventListener('click', () => this.uiManager.switchView('monthly'));
        document.getElementById('yearly-view-btn').addEventListener('click', () => this.uiManager.switchView('yearly'));
        document.getElementById('madeira-holidays-view-btn').addEventListener('click', () => this.uiManager.switchView('madeira-holidays'));
        document.getElementById('vacation-view-btn').addEventListener('click', () => this.uiManager.switchView('vacation'));
        document.getElementById('reorder-view-btn').addEventListener('click', () => this.uiManager.switchView('reorder'));
        document.getElementById('history-view-btn').addEventListener('click', () => this.uiManager.switchView('history'));

        document.getElementById('calendar-grid').addEventListener('click', e => {
            const dayCell = e.target.closest('.day-cell');
            if (dayCell && dayCell.dataset.date) this.uiManager.showDayDetailsModal(dayCell.dataset.date);
        });

        document.getElementById('modal-close-btn').addEventListener('click', () => {
            document.getElementById('day-details-modal').classList.add('hidden');
            this.dataManager.setSelectedDateKey(null);
        });
        
        document.getElementById('modal-employee-list').addEventListener('change', e => {
            const { employeeId, dateKey } = e.target.dataset;
            if(e.target.matches('.status-radio')) {
                this.dataManager.handleStatusChange(employeeId, dateKey, e.target.value);
            } else if (e.target.matches('.extra-hours-input')) {
                this.dataManager.handleExtraHoursChange(employeeId, dateKey, e.target.value);
            } else if (e.target.matches('.extra-hours-note-input')) {
                this.dataManager.handleExtraHoursNotesChange(employeeId, dateKey, e.target.value);
            }
        });

        document.getElementById('employee-list').addEventListener('click', e => {
            const card = e.target.closest('.employee-card-main');
            const pdfBtn = e.target.closest('.individual-pdf-btn');
            const editBtn = e.target.closest('.edit-working-days-btn');

            if (card && card.dataset.employeeId && !e.target.closest('.edit-working-days-btn')) {
                this.uiManager.showEmployeeSummaryModal(card.dataset.employeeId);
            } else if (pdfBtn && pdfBtn.dataset.employeeId) {
                this.uiManager.pdfGenerator.generateIndividualReportPDF(pdfBtn.dataset.employeeId, this.dataManager);
            } else if (editBtn && editBtn.dataset.employeeId) {
                this.uiManager.showEditWorkingDaysModal(editBtn.dataset.employeeId);
            }
        });

        document.getElementById('employee-summary-close-btn').addEventListener('click', () => {
            document.getElementById('employee-summary-modal').classList.add('hidden');
        });

        // Edit working days modal event listeners
        document.getElementById('edit-working-days-close-btn').addEventListener('click', () => {
            document.getElementById('edit-working-days-modal').classList.add('hidden');
        });

        document.getElementById('edit-working-days-cancel-btn').addEventListener('click', () => {
            document.getElementById('edit-working-days-modal').classList.add('hidden');
        });

        document.getElementById('edit-working-days-save-btn').addEventListener('click', () => {
            const modal = document.getElementById('edit-working-days-modal');
            const employeeId = modal.dataset.employeeId;
            const selectedDays = Array.from(document.querySelectorAll('#edit-work-day-checkboxes input:checked')).map(cb => parseInt(cb.value));
            
            if (selectedDays.length === 0) {
                alert('Please select at least one working day.');
                return;
            }
            
            this.dataManager.handleUpdateWorkingDays(employeeId, selectedDays);
            modal.classList.add('hidden');
        });

        // Edit employee modal event listeners
        document.getElementById('edit-employee-close-btn').addEventListener('click', () => {
            document.getElementById('edit-employee-modal').classList.add('hidden');
        });

        document.getElementById('edit-employee-cancel-btn').addEventListener('click', () => {
            document.getElementById('edit-employee-modal').classList.add('hidden');
        });

        document.getElementById('edit-employee-save-btn').addEventListener('click', () => {
            this.saveEmployeeChanges();
        });

        document.getElementById('vacation-planner-container').addEventListener('click', e => {
            const scheduleBtn = e.target.closest('.schedule-vacation-btn');
            const deleteBtn = e.target.closest('.delete-vacation-btn');

            if (scheduleBtn) {
                const employeeId = scheduleBtn.dataset.employeeId;
                const startDate = document.getElementById(`vacation-start-${employeeId}`).value;
                const endDate = document.getElementById(`vacation-end-${employeeId}`).value;
                this.dataManager.handleScheduleVacation(employeeId, startDate, endDate);
            } else if (deleteBtn) {
                const { employeeId, vacationIndex } = deleteBtn.dataset;
                this.uiManager.showConfirmationModal('Delete Vacation', 'Are you sure you want to delete this vacation?', () => {
                    this.dataManager.handleDeleteVacation(employeeId, parseInt(vacationIndex));
                });
            }
        });
        
        const reorderContainer = document.getElementById('reorder-list-container');
        reorderContainer.addEventListener('click', e => {
            const archiveBtn = e.target.closest('.archive-btn');
            const editBtn = e.target.closest('.edit-employee-btn');
            
            if (editBtn) {
                const { employeeId } = editBtn.dataset;
                this.uiManager.showEditEmployeeModal(employeeId);
            } else if (archiveBtn) {
                const { employeeId, employeeName } = archiveBtn.dataset;
                this.uiManager.showConfirmationModal(
                    `Archive ${employeeName}?`,
                    'This will move them to the history tab. You can restore them later.',
                    () => this.dataManager.handleArchiveToggle(employeeId, true)
                );
            }
        });

        reorderContainer.addEventListener('dragstart', e => {
            if (e.target.classList.contains('draggable')) {
                e.target.classList.add('dragging');
            }
        });
        
        reorderContainer.addEventListener('dragend', e => {
             if (e.target.classList.contains('draggable')) {
                e.target.classList.remove('dragging');
                this.dataManager.saveNewOrder();
            }
        });
        
        reorderContainer.addEventListener('dragover', e => {
            e.preventDefault();
            const dragging = document.querySelector('.dragging');
            if (!dragging) return;
            
            const afterElement = this.getDragAfterElement(reorderContainer, e.clientY);
            const parent = dragging.parentNode;
            
            if (afterElement == null) {
                parent.appendChild(dragging);
            } else {
                parent.insertBefore(dragging, afterElement);
            }
        });

        document.getElementById('history-container').addEventListener('click', e => {
            const restoreBtn = e.target.closest('.restore-btn');
            const deleteBtn = e.target.closest('.delete-btn');
             if (restoreBtn) {
                const { employeeId, employeeName } = restoreBtn.dataset;
                this.uiManager.showConfirmationModal(
                    `Restore ${employeeName}?`,
                    'This will move them back to the active list.',
                    () => this.dataManager.handleArchiveToggle(employeeId, false)
                );
            } else if (deleteBtn) {
                const { employeeId, employeeName } = deleteBtn.dataset;
                this.uiManager.showConfirmationModal(
                    `Permanently Delete ${employeeName}?`,
                    'This action is irreversible. All data for this colleague will be lost forever.',
                    () => this.dataManager.handlePermanentDelete(employeeId)
                );
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
        
        await this.dataManager.addEmployee(name, staffNumber, workDays).catch(e => errorP.textContent = "Could not add.");
        nameInput.value = '';
        staffNumberInput.value = '';
        document.querySelectorAll('#work-day-checkboxes input').forEach(cb => cb.checked = false);
    }

    async saveEmployeeChanges() {
        const modal = document.getElementById('edit-employee-modal');
        const employeeId = modal.dataset.employeeId;
        const errorElement = document.getElementById('edit-employee-error');
        
        // Clear previous errors
        errorElement.textContent = '';
        
        // Gather form data
        const name = document.getElementById('edit-employee-name').value.trim();
        const staffNumber = document.getElementById('edit-employee-staff-number').value.trim();
        const email = document.getElementById('edit-employee-email').value.trim();
        const phone = document.getElementById('edit-employee-phone').value.trim();
        const department = document.getElementById('edit-employee-department').value.trim();
        const position = document.getElementById('edit-employee-position').value.trim();
        const hireDate = document.getElementById('edit-employee-hire-date').value.trim();
        const employmentType = document.getElementById('edit-employee-employment-type').value.trim();
        const defaultShift = document.getElementById('edit-employee-shift').value.trim();
        const notes = document.getElementById('edit-employee-notes').value.trim();
        
        // Validate required fields
        if (!name) {
            errorElement.textContent = 'Name is required.';
            return;
        }
        
        // Get selected working days
        const workDays = Array.from(document.querySelectorAll('#edit-employee-work-days input:checked')).map(cb => parseInt(cb.value));
        if (workDays.length === 0) {
            errorElement.textContent = 'Please select at least one working day.';
            return;
        }
        
        // Validate shift format if provided
        if (defaultShift && !/^[0-9]{1,2}:[0-9]{2}-[0-9]{1,2}:[0-9]{2}$/.test(defaultShift)) {
            errorElement.textContent = 'Shift time must be in format HH:MM-HH:MM (e.g., 9:00-17:30).';
            return;
        }
        
        // Validate email format if provided
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errorElement.textContent = 'Please enter a valid email address.';
            return;
        }
        
        // Prepare data for update
        const updatedData = {
            name,
            staffNumber,
            email,
            phone,
            department,
            position,
            hireDate,
            employmentType,
            defaultShift,
            notes,
            workDays
        };
        
        try {
            await this.dataManager.updateEmployee(employeeId, updatedData);
            modal.classList.add('hidden');
        } catch (error) {
            console.error('Failed to update employee:', error);
            errorElement.textContent = error.message || 'Failed to update colleague information.';
        }
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
} 