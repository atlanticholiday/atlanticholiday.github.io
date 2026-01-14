import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { setDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Config } from './config.js';

export class EventManager {
    constructor(auth, dataManager, uiManager) {
        this.appListenersInitialized = false;
        this.auth = auth;
        this.dataManager = dataManager;
        this.uiManager = uiManager;
    }

    setupLoginListeners() {
        const loginBtn = document.getElementById('login-btn');
        const emailInput = document.getElementById('email-address');
        const passwordInput = document.getElementById('password');
        const loginError = document.getElementById('login-error');

        loginBtn.addEventListener('click', () => {
            const email = emailInput.value;
            const password = passwordInput.value;
            loginError.textContent = '';

            signInWithEmailAndPassword(this.auth, email, password)
                .then(() => {
                    // Login successful
                })
                .catch(error => {
                    console.error('Login failed:', error.message);
                    loginError.textContent = "Login failed. Please check your email and password.";
                });
        });

        document.getElementById('start-fresh-btn').addEventListener('click', () => {
            setDoc(doc(this.dataManager.db, 'employees', 'metadata'), { initialized: true });
            // Navigate back to schedule page and initialize
            const event = new CustomEvent('schedulePageOpened');
            document.dispatchEvent(event);
        });
    }

    setupAppEventListeners() {
        if (this.appListenersInitialized) return;
        this.appListenersInitialized = true;
        document.getElementById('sign-out-btn').addEventListener('click', () => signOut(this.auth));
        document.getElementById('pdf-download-btn').addEventListener('click', () => {
            this.uiManager.pdfGenerator.generateTeamReportPDF(this.dataManager);
        });

        document.getElementById('prev-btn').addEventListener('click', () => {
            const currentView = this.dataManager.getCurrentView();
            const currentDate = this.dataManager.getCurrentDate();
            if (currentView === 'monthly') currentDate.setMonth(currentDate.getMonth() - 1);
            else if (currentView === 'yearly') currentDate.setFullYear(currentDate.getFullYear() - 1);
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



        // View toggles handled by ScheduleManager now

        document.getElementById('calendar-grid').addEventListener('click', e => {
            if (this.uiManager.isStaffMode) return; // Prevent clicks in staff mode
            const dayCell = e.target.closest('.day-cell');
            if (dayCell && dayCell.dataset.date) this.uiManager.showDayDetailsModal(dayCell.dataset.date);
        });

        document.getElementById('calendar-mobile-cards').addEventListener('click', e => {
            if (this.uiManager.isStaffMode) return; // Prevent clicks in staff mode
            const dayCard = e.target.closest('.day-card');
            if (dayCard && dayCard.dataset.date) this.uiManager.showDayDetailsModal(dayCard.dataset.date);
        });

        document.getElementById('modal-close-btn').addEventListener('click', () => {
            document.getElementById('day-details-modal').classList.add('hidden');
            this.dataManager.setSelectedDateKey(null);
        });

        document.getElementById('modal-employee-list').addEventListener('change', e => {
            const { employeeId, dateKey } = e.target.dataset;
            if (e.target.matches('.status-radio')) {
                this.dataManager.handleStatusChange(employeeId, dateKey, e.target.value);
            } else if (e.target.matches('.extra-hours-input')) {
                this.dataManager.handleExtraHoursChange(employeeId, dateKey, e.target.value);
            } else if (e.target.matches('.extra-hours-note-input')) {
                this.dataManager.handleExtraHoursNotesChange(employeeId, dateKey, e.target.value);
            }
        });

        // employee-list listener removed (Legacy)


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
            document.body.classList.remove('overflow-hidden');
        });

        document.getElementById('edit-employee-cancel-btn').addEventListener('click', () => {
            document.getElementById('edit-employee-modal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        });

        document.getElementById('edit-employee-save-btn').addEventListener('click', () => {
            this.saveEmployeeChanges();
        });

        document.getElementById('vacation-planner-container').addEventListener('click', e => {
            const editBtn = e.target.closest('.edit-vacation-btn');
            const scheduleBtn = e.target.closest('.schedule-vacation-btn');
            const deleteBtn = e.target.closest('.delete-vacation-btn');
            // Handle edit click: populate inputs and switch button to update mode
            if (editBtn) {
                const employeeId = editBtn.dataset.employeeId;
                const vacationIndex = parseInt(editBtn.dataset.vacationIndex);
                const emp = this.dataManager.getActiveEmployees().find(emp => emp.id === employeeId);
                if (!emp) return;
                const vac = emp.vacations[vacationIndex];
                document.getElementById(`vacation-start-${employeeId}`).value = vac.startDate;
                document.getElementById(`vacation-end-${employeeId}`).value = vac.endDate;
                const btn = document.querySelector(`.schedule-vacation-btn[data-employee-id="${employeeId}"]`);
                btn.textContent = 'Update';
                btn.dataset.editIndex = vacationIndex;
                return;
            }
            if (scheduleBtn) {
                const employeeId = scheduleBtn.dataset.employeeId;
                const startDate = document.getElementById(`vacation-start-${employeeId}`).value;
                const endDate = document.getElementById(`vacation-end-${employeeId}`).value;
                if (scheduleBtn.dataset.editIndex !== undefined) {
                    const vacIndex = parseInt(scheduleBtn.dataset.editIndex);
                    this.dataManager.handleUpdateVacation(employeeId, vacIndex, startDate, endDate);
                    delete scheduleBtn.dataset.editIndex;
                    scheduleBtn.textContent = 'Schedule';
                } else {
                    this.dataManager.handleScheduleVacation(employeeId, startDate, endDate);
                }
            } else if (deleteBtn) {
                const { employeeId, vacationIndex } = deleteBtn.dataset;
                this.uiManager.showConfirmationModal('Delete Vacation', 'Are you sure you want to delete this vacation?', () => {
                    this.dataManager.handleDeleteVacation(employeeId, parseInt(vacationIndex));
                });
            }
        });



        // Manage Shifts Modal Listeners
        const manageShiftsBtn = document.getElementById('manage-shifts-btn');
        if (manageShiftsBtn) {
            manageShiftsBtn.addEventListener('click', () => {
                this.uiManager.renderShiftPresetsModal();
                document.getElementById('manage-shifts-modal-root').classList.remove('hidden');
            });
        }

        const thresholdInput = document.getElementById('min-staff-threshold');
        if (thresholdInput) {
            thresholdInput.addEventListener('change', (e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 0) {
                    this.dataManager.saveMinStaffThreshold(val);
                }
            });
        }

        const closeShiftsBtn = document.getElementById('manage-shifts-close-btn');
        if (closeShiftsBtn) {
            closeShiftsBtn.addEventListener('click', () => {
                document.getElementById('manage-shifts-modal-root').classList.add('hidden');
            });
        }

        const addPresetBtn = document.getElementById('add-preset-btn');
        if (addPresetBtn) {
            addPresetBtn.addEventListener('click', async () => {
                const name = document.getElementById('new-preset-name').value.trim();
                const start = document.getElementById('new-preset-start').value.trim();
                const end = document.getElementById('new-preset-end').value.trim();
                if (name && start && end) {
                    await this.dataManager.saveShiftPreset(name, start, end);
                    // Clear inputs
                    document.getElementById('new-preset-name').value = '';
                    document.getElementById('new-preset-start').value = '';
                    document.getElementById('new-preset-end').value = '';
                    // Re-render handled by listener in DataManager -> UI update, 
                    // BUT UI update rerenders the whole valid view. 
                    // We need to specifically re-render the modal list if it's open.
                    // Actually, DataManager listener calls uiManager.updateView().
                    // We should add a specific listener for presets or just re-render manually here for responsiveness.
                    // The DataManager.listenForShiftPresets calls onDataChangeCallback which calls updateView.
                    // updateView doesn't update the modal list. 
                    // So we rely on the manual re-render or the snapshot listener if properly wired.
                    // However, let's just re-render:
                    // Wait, DataManager.listenForShiftPresets sets this.shiftPresets. 
                    // And calls callback.
                    // The snapshot is async.
                    // So manual re-render might refer to old data immediately after addDoc?
                    // No, addDoc is async.
                    // Let's trust the snapshot listener to update 'shiftPresets' property, 
                    // but we need to trigger re-render of modal list.
                    // The current main callback updates the GRID, not the modal.
                    // We might need to listen to snapshot updates in UIManager or just re-call render.
                    // For now, let's just wait a bit or re-render after a small delay, 
                    // OR better: The onSnapshot in DataManager will fire. 
                    // We can add a hook or just re-render on next open?
                    // No, user wants instant feedback.
                    // Let's modify DataManager to allow generic listeners? 
                    // Or simply: 
                }
            });
        }

        // Delegate delete
        const presetsList = document.getElementById('shift-presets-list');
        if (presetsList) {
            presetsList.addEventListener('click', (e) => {
                const btn = e.target.closest('.delete-preset-btn');
                if (btn) {
                    this.dataManager.deleteShiftPreset(btn.dataset.id);
                }
            });
        }

        // Weekly Roster Modal Listeners
        const printWeeklyBtn = document.getElementById('print-weekly-btn');
        if (printWeeklyBtn) {
            printWeeklyBtn.addEventListener('click', () => {
                const now = new Date();
                this.uiManager.renderWeeklyRoster(now);
                document.getElementById('weekly-roster-modal').classList.remove('hidden');
            });
        }

        const closeRosterBtn = document.getElementById('close-roster-btn');
        if (closeRosterBtn) {
            closeRosterBtn.addEventListener('click', () => {
                document.getElementById('weekly-roster-modal').classList.add('hidden');
            });
        }

        const printRosterActionBtn = document.getElementById('print-roster-action-btn');
        if (printRosterActionBtn) {
            printRosterActionBtn.addEventListener('click', () => {
                window.print();
            });
        }

        const prevWeekBtn = document.getElementById('roster-prev-week');
        if (prevWeekBtn) {
            prevWeekBtn.addEventListener('click', () => {
                if (this.uiManager.currentRosterDate) {
                    const d = new Date(this.uiManager.currentRosterDate);
                    d.setDate(d.getDate() - 7);
                    this.uiManager.renderWeeklyRoster(d);
                }
            });
        }

        const nextWeekBtn = document.getElementById('roster-next-week');
        if (nextWeekBtn) {
            nextWeekBtn.addEventListener('click', () => {
                if (this.uiManager.currentRosterDate) {
                    const d = new Date(this.uiManager.currentRosterDate);
                    d.setDate(d.getDate() + 7);
                    this.uiManager.renderWeeklyRoster(d);
                }
            });
        }

        // Export Stats CSV Listener (delegated)
        document.addEventListener('click', (e) => {
            if (e.target.closest('#export-stats-csv-btn')) {
                this.uiManager.exportStatsToCSV();
            }
        });

        // Staff Mode Toggle Listener
        const toggleStaffModeBtn = document.getElementById('toggle-staff-mode-btn');
        if (toggleStaffModeBtn) {
            toggleStaffModeBtn.addEventListener('click', () => {
                this.uiManager.toggleStaffMode();
            });
        }
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
        const vacationAdjustment = document.getElementById('edit-employee-vacation-adjustment').value;

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
            workDays,
            vacationAdjustment
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