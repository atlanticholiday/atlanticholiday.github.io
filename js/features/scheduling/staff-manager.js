import { Config } from '../../core/config.js';
import { t } from '../../core/i18n.js';

export class StaffManager {
    constructor(dataManager, uiManager, { documentRef = document, windowRef = window } = {}) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.document = documentRef;
        this.window = windowRef;
        this.isHistoryView = false;

        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.ensureAddEmployeeFormReady();
        this.updateChrome();
    }

    setupEventListeners() {
        this.document.querySelectorAll('[data-staff-view-target]').forEach((button) => {
            if (button.dataset.staffViewBound === 'true') {
                return;
            }

            button.dataset.staffViewBound = 'true';
            button.addEventListener('click', () => {
                this.isHistoryView = button.dataset.staffViewTarget === 'history';
                this.render();
            });
        });

        this.dataManager.subscribeToDataChanges(() => {
            if (this.isPageVisible()) {
                this.render();
                return;
            }

            this.updateSummaryCounts();
        });

        this.window.addEventListener?.('languageChanged', this.handleLanguageChange);

        const container = this.document.getElementById('staff-page');
        if (container) {
            container.addEventListener('click', (event) => {
                const target = event.target.closest('button');
                if (!target) return;

                if (target.classList.contains('edit-employee-btn')) {
                    this.uiManager?.showEditEmployeeModal?.(target.dataset.employeeId);
                } else if (target.classList.contains('archive-btn')) {
                    this.handleArchive(target.dataset.employeeId);
                } else if (target.classList.contains('restore-btn')) {
                    this.handleRestore(target.dataset.employeeId);
                } else if (target.classList.contains('delete-btn')) {
                    this.handleDelete(target.dataset.employeeId);
                }
            });
        }

        this.setupAddEmployeeListeners();
    }

    setupAddEmployeeListeners() {
        const openBtn = this.document.getElementById('open-add-employee-modal-btn');
        if (openBtn && openBtn.dataset.staffBound !== 'true') {
            openBtn.dataset.staffBound = 'true';
            openBtn.addEventListener('click', () => {
                this.ensureAddEmployeeFormReady();

                const modal = this.document.getElementById('add-employee-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                }
            });
        }

        const closeBtn = this.document.getElementById('add-employee-close-btn');
        const cancelBtn = this.document.getElementById('add-employee-cancel-btn');

        if (closeBtn && closeBtn.dataset.staffBound !== 'true') {
            closeBtn.dataset.staffBound = 'true';
            closeBtn.addEventListener('click', () => this.closeAddEmployeeModal());
        }

        if (cancelBtn && cancelBtn.dataset.staffBound !== 'true') {
            cancelBtn.dataset.staffBound = 'true';
            cancelBtn.addEventListener('click', () => this.closeAddEmployeeModal());
        }

        const addBtn = this.document.getElementById('add-employee-btn');
        if (addBtn && addBtn.dataset.staffBound !== 'true') {
            addBtn.dataset.staffBound = 'true';
            addBtn.addEventListener('click', () => this.addEmployee());
        }
    }

    handleLanguageChange() {
        this.ensureAddEmployeeFormReady();

        if (this.isPageVisible()) {
            this.render();
        } else {
            this.updateChrome();
        }
    }

    isPageVisible() {
        const staffPage = this.document.getElementById('staff-page');
        return Boolean(staffPage && !staffPage.classList.contains('hidden'));
    }

    ensureAddEmployeeFormReady() {
        this.uiManager?.populateDayCheckboxes?.();
    }

    resetAddEmployeeForm() {
        const nameInput = this.document.getElementById('new-employee-name');
        const staffNumInput = this.document.getElementById('new-employee-staff-number');
        const vacationAdjustmentInput = this.document.getElementById('new-employee-vacation-adjustment');
        const errorElement = this.document.getElementById('add-employee-error');

        if (nameInput) nameInput.value = '';
        if (staffNumInput) staffNumInput.value = '';
        if (vacationAdjustmentInput) vacationAdjustmentInput.value = '0';
        if (errorElement) errorElement.textContent = '';

        this.document.querySelectorAll('#work-day-checkboxes input').forEach((checkbox) => {
            checkbox.checked = false;
        });
    }

    closeAddEmployeeModal() {
        const modal = this.document.getElementById('add-employee-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        this.resetAddEmployeeForm();
    }

    async addEmployee() {
        const nameInput = this.document.getElementById('new-employee-name');
        const staffNumberInput = this.document.getElementById('new-employee-staff-number');
        const vacationAdjustmentInput = this.document.getElementById('new-employee-vacation-adjustment');
        const errorElement = this.document.getElementById('add-employee-error');

        if (errorElement) errorElement.textContent = '';

        const name = nameInput?.value.trim() || '';
        const staffNumber = staffNumberInput?.value.trim() || '';
        const vacationAdjustment = vacationAdjustmentInput?.value.trim() || '0';

        if (!name) {
            if (errorElement) {
                errorElement.textContent = this.translate('staff.validation.nameRequired', 'Please enter a name.');
            }
            return;
        }

        const workDays = Array.from(this.document.querySelectorAll('#work-day-checkboxes input:checked'))
            .map((checkbox) => Number.parseInt(checkbox.value, 10))
            .filter((day) => Number.isInteger(day));

        if (workDays.length === 0) {
            if (errorElement) {
                errorElement.textContent = this.translate('staff.validation.workDaysRequired', 'Please select at least one day.');
            }
            return;
        }

        try {
            await this.dataManager.addEmployee(name, staffNumber, workDays, { vacationAdjustment });
            this.closeAddEmployeeModal();
            this.render();
        } catch (error) {
            console.error(error);
            if (errorElement) {
                errorElement.textContent = this.translate('staff.validation.addFailed', 'Could not add colleague. Please try again.');
            }
        }
    }

    render() {
        const listContainer = this.document.getElementById('staff-list-container');
        const historyContainer = this.document.getElementById('history-list-container');
        if (!listContainer || !historyContainer) return;

        this.ensureAddEmployeeFormReady();
        this.updateChrome();

        if (this.isHistoryView) {
            listContainer.classList.add('hidden');
            historyContainer.classList.remove('hidden');
            this.renderHistoryList();
            return;
        }

        listContainer.classList.remove('hidden');
        historyContainer.classList.add('hidden');
        this.renderActiveList();
    }

    updateChrome() {
        this.updateSummaryCounts();
        this.updateViewButtons();
        this.updatePanelCopy();
    }

    updateSummaryCounts() {
        const activeEmployees = this.dataManager.getActiveEmployees?.() || [];
        const archivedEmployees = this.dataManager.getArchivedEmployees?.() || [];

        const activeCount = this.document.getElementById('staff-active-count');
        const archivedCount = this.document.getElementById('staff-archived-count');
        const totalCount = this.document.getElementById('staff-total-count');

        if (activeCount) activeCount.textContent = String(activeEmployees.length);
        if (archivedCount) archivedCount.textContent = String(archivedEmployees.length);
        if (totalCount) totalCount.textContent = String(activeEmployees.length + archivedEmployees.length);
    }

    updateViewButtons() {
        const activeBtn = this.document.getElementById('staff-active-view-btn');
        const historyBtn = this.document.getElementById('staff-history-view-btn');

        const activeSelected = !this.isHistoryView;
        const historySelected = this.isHistoryView;

        if (activeBtn) {
            activeBtn.classList.toggle('staff-view-tab-active', activeSelected);
            activeBtn.setAttribute('aria-selected', activeSelected ? 'true' : 'false');
        }

        if (historyBtn) {
            historyBtn.classList.toggle('staff-view-tab-active', historySelected);
            historyBtn.setAttribute('aria-selected', historySelected ? 'true' : 'false');
        }
    }

    updatePanelCopy() {
        const panelEyebrow = this.document.getElementById('staff-panel-eyebrow');
        const panelTitle = this.document.getElementById('staff-panel-title');
        const panelDescription = this.document.getElementById('staff-panel-description');
        const panelChip = this.document.getElementById('staff-panel-chip');
        const copy = this.getPanelCopy();

        if (panelEyebrow) panelEyebrow.textContent = copy.eyebrow;
        if (panelTitle) panelTitle.textContent = copy.title;
        if (panelDescription) panelDescription.textContent = copy.description;
        if (panelChip) {
            panelChip.textContent = copy.chip;
            panelChip.classList.toggle('staff-panel-chip--history', this.isHistoryView);
        }
    }

    getPanelCopy() {
        if (this.isHistoryView) {
            return {
                eyebrow: this.translate('staff.panels.archive.eyebrow', 'Archived directory'),
                title: this.translate('staff.panels.archive.title', 'Archived colleagues'),
                description: this.translate('staff.panels.archive.description', 'Restore former colleagues or permanently remove records that should no longer stay in the archive.'),
                chip: this.translate('staff.views.archive', 'Archive')
            };
        }

        return {
            eyebrow: this.translate('staff.panels.active.eyebrow', 'Live directory'),
            title: this.translate('staff.panels.active.title', 'Active colleagues'),
            description: this.translate('staff.panels.active.description', 'Review default schedules and update colleague profiles before changing the live roster.'),
            chip: this.translate('staff.views.active', 'Active')
        };
    }

    translate(key, fallback, replacements = {}) {
        const translated = t(key, replacements);
        return translated === key ? fallback : translated;
    }

    escapeHtml(value = '') {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    getInitials(name = '') {
        const parts = String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);

        if (!parts.length) {
            return '?';
        }

        return parts.map((part) => part.charAt(0).toUpperCase()).join('');
    }

    getWeekdayLabel(index) {
        return this.translate(`days.short.${index}`, Config.DAYS_OF_WEEK[index] || '');
    }

    formatWorkDays(workDays = []) {
        const normalizedDays = Array.isArray(workDays)
            ? workDays
                .map((day) => Number.parseInt(day, 10))
                .filter((day) => Number.isInteger(day))
            : [];

        if (!normalizedDays.length) {
            return this.translate('staff.noDefaultDays', 'No default days set');
        }

        return normalizedDays.map((day) => this.getWeekdayLabel(day)).join(', ');
    }

    renderStateMessage(container, { title, message, tone = 'muted' }) {
        const safeTitle = this.escapeHtml(title);
        const safeMessage = this.escapeHtml(message);
        const toneClass = tone === 'error' ? ' staff-state--error' : '';

        container.innerHTML = `
            <div class="staff-state${toneClass}">
                <p class="staff-state__title">${safeTitle}</p>
                <p class="staff-state__copy">${safeMessage}</p>
            </div>
        `;
    }

    renderActiveList() {
        const container = this.document.getElementById('staff-list-container');
        if (!container) return;

        const loadError = this.dataManager.getEmployeeLoadError?.();
        if (loadError) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.loadErrorTitle', 'Directory unavailable'),
                message: this.translate('staff.states.activeLoadError', 'Staff could not be loaded for this account. Check your access and try again.'),
                tone: 'error'
            });
            return;
        }

        if (!this.dataManager.hasLoadedEmployeeDirectory?.()) {
            this.renderStateMessage(container, {
                title: this.translate('common.loading', 'Loading...'),
                message: this.translate('staff.states.activeLoading', 'Loading colleagues...')
            });
            return;
        }

        const activeEmployees = this.dataManager.getActiveEmployees();
        if (activeEmployees.length === 0) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.activeEmptyTitle', 'No active colleagues'),
                message: this.translate('staff.states.activeEmpty', 'Add a colleague to start building the live staff directory.')
            });
            return;
        }

        container.innerHTML = activeEmployees.map((employee) => this.renderActiveCard(employee)).join('');
    }

    renderActiveCard(employee) {
        const name = this.escapeHtml(employee.name || '');
        const pills = [];

        if (employee.staffNumber) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--accent">${this.escapeHtml(`${this.translate('staff.staffNumber', 'Staff Number')} #${employee.staffNumber}`)}</span>`);
        }
        if (employee.department) {
            pills.push(`<span class="staff-meta-pill">${this.escapeHtml(employee.department)}</span>`);
        }
        if (employee.position) {
            pills.push(`<span class="staff-meta-pill">${this.escapeHtml(employee.position)}</span>`);
        }
        if (employee.employmentType) {
            pills.push(`<span class="staff-meta-pill">${this.escapeHtml(employee.employmentType)}</span>`);
        }

        if (!pills.length) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--muted">${this.escapeHtml(this.translate('staff.noMeta', 'No extra profile details yet'))}</span>`);
        }

        const contacts = [];
        if (employee.email) {
            contacts.push(this.escapeHtml(employee.email));
        }
        if (employee.phone) {
            contacts.push(this.escapeHtml(employee.phone));
        }

        const contactMarkup = contacts.length
            ? `<p class="staff-contact">${contacts.map((item, index) => `${index ? '<span class="staff-contact-separator">/</span>' : ''}${item}`).join('')}</p>`
            : '';

        return `
            <article class="staff-card">
                <div class="staff-identity">
                    <div class="staff-avatar">${this.escapeHtml(this.getInitials(employee.name))}</div>
                    <div class="staff-copy">
                        <div class="staff-name-row">
                            <h3 class="staff-name">${name}</h3>
                        </div>
                        <div class="staff-meta-row">${pills.join('')}</div>
                        ${contactMarkup}
                        <p class="staff-secondary-meta">
                            <strong>${this.escapeHtml(this.translate('staff.defaultDays', 'Default days'))}:</strong>
                            ${this.escapeHtml(this.formatWorkDays(employee.workDays))}
                        </p>
                    </div>
                </div>
                <div class="staff-actions">
                    <button class="staff-button staff-button--secondary edit-employee-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        ${this.escapeHtml(this.translate('common.edit', 'Edit'))}
                    </button>
                    <button class="staff-button staff-button--warning archive-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        ${this.escapeHtml(this.translate('staff.archive', 'Archive'))}
                    </button>
                </div>
            </article>
        `;
    }

    renderHistoryList() {
        const container = this.document.getElementById('history-list-container');
        if (!container) return;

        const loadError = this.dataManager.getEmployeeLoadError?.();
        if (loadError) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.loadErrorTitle', 'Directory unavailable'),
                message: this.translate('staff.states.archiveLoadError', 'Staff history could not be loaded for this account.'),
                tone: 'error'
            });
            return;
        }

        if (!this.dataManager.hasLoadedEmployeeDirectory?.()) {
            this.renderStateMessage(container, {
                title: this.translate('common.loading', 'Loading...'),
                message: this.translate('staff.states.archiveLoading', 'Loading archived colleagues...')
            });
            return;
        }

        const archivedEmployees = this.dataManager.getArchivedEmployees();
        if (archivedEmployees.length === 0) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.archiveEmptyTitle', 'No archived colleagues'),
                message: this.translate('staff.states.archiveEmpty', 'Archived records will appear here once a colleague is removed from the live directory.')
            });
            return;
        }

        container.innerHTML = archivedEmployees.map((employee) => this.renderHistoryCard(employee)).join('');
    }

    renderHistoryCard(employee) {
        const name = this.escapeHtml(employee.name || '');
        const archivedNote = this.escapeHtml(this.translate('staff.archivedNote', 'Archived record'));

        return `
            <article class="staff-card staff-card--archived">
                <div class="staff-identity">
                    <div class="staff-avatar staff-avatar--archived">${this.escapeHtml(this.getInitials(employee.name))}</div>
                    <div class="staff-copy">
                        <div class="staff-name-row">
                            <h3 class="staff-name">${name}</h3>
                            <span class="staff-meta-pill staff-meta-pill--muted">${archivedNote}</span>
                        </div>
                        <p class="staff-secondary-meta">
                            <strong>${this.escapeHtml(this.translate('staff.defaultDays', 'Default days'))}:</strong>
                            ${this.escapeHtml(this.formatWorkDays(employee.workDays))}
                        </p>
                    </div>
                </div>
                <div class="staff-actions">
                    <button class="staff-button staff-button--success restore-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        ${this.escapeHtml(this.translate('staff.restore', 'Restore'))}
                    </button>
                    <button class="staff-button staff-button--danger delete-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        ${this.escapeHtml(this.translate('common.delete', 'Delete'))}
                    </button>
                </div>
            </article>
        `;
    }

    async handleArchive(id) {
        const confirmed = this.window.confirm?.(
            this.translate('staff.archiveConfirm', 'Are you sure you want to archive this colleague?')
        );
        if (confirmed === false) {
            return;
        }

        try {
            await this.dataManager.archiveEmployee(id);
        } catch (error) {
            console.error(error);
            this.window.alert?.(this.translate('staff.archiveFailed', 'Failed to archive colleague.'));
        }
    }

    async handleRestore(id) {
        try {
            await this.dataManager.restoreEmployee(id);
            this.render();
        } catch (error) {
            console.error(error);
            this.window.alert?.(this.translate('staff.restoreFailed', 'Failed to restore colleague.'));
        }
    }

    async handleDelete(id) {
        const confirmed = this.window.confirm?.(
            this.translate('staff.deletePermanentConfirm', 'Are you sure you want to permanently delete this colleague? This cannot be undone.')
        );
        if (confirmed === false) {
            return;
        }

        try {
            await this.dataManager.deleteEmployee(id);
            this.render();
        } catch (error) {
            console.error(error);
            this.window.alert?.(this.translate('staff.deleteFailed', 'Failed to delete colleague.'));
        }
    }
}
