import { Config } from '../../core/config.js';
import { t } from '../../core/i18n.js';

export class StaffManager {
    constructor(dataManager, uiManager, { documentRef = document, windowRef = window } = {}) {
        this.dataManager = dataManager;
        this.uiManager = uiManager;
        this.document = documentRef;
        this.window = windowRef;
        this.isHistoryView = false;
        this.searchQuery = '';
        this.sortMode = 'nameAsc';
        this.viewMode = this.loadViewMode();

        this.handleLanguageChange = this.handleLanguageChange.bind(this);

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupViewSwitcher();
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

        const searchInput = this.document.getElementById('staff-search-input');
        if (searchInput && searchInput.dataset.staffBound !== 'true') {
            searchInput.dataset.staffBound = 'true';
            searchInput.addEventListener('input', () => {
                this.searchQuery = searchInput.value;
                this.updateSearchControl();
                this.renderCurrentList();
            });
        }

        const clearSearchButton = this.document.getElementById('staff-search-clear');
        if (clearSearchButton && clearSearchButton.dataset.staffBound !== 'true') {
            clearSearchButton.dataset.staffBound = 'true';
            clearSearchButton.addEventListener('click', () => {
                this.searchQuery = '';
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.focus();
                }
                this.updateSearchControl();
                this.renderCurrentList();
            });
        }

        const sortSelect = this.document.getElementById('staff-sort-select');
        if (sortSelect && sortSelect.dataset.staffBound !== 'true') {
            sortSelect.dataset.staffBound = 'true';
            sortSelect.addEventListener('change', () => {
                this.sortMode = sortSelect.value;
                this.renderCurrentList();
            });
        }

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

    loadViewMode() {
        try {
            return this.window?.localStorage?.getItem('horario_staff_layout') || 'grid';
        } catch {
            return 'grid';
        }
    }

    setViewMode(mode) {
        this.viewMode = mode === 'table' ? 'table' : 'grid';
        try {
            this.window?.localStorage?.setItem('horario_staff_layout', this.viewMode);
        } catch {
            // ignore storage errors
        }

        const listContainer = this.document.getElementById('staff-list-container');
        const historyContainer = this.document.getElementById('history-list-container');
        const isTable = this.viewMode === 'table';

        listContainer?.classList.toggle('staff-list--table', isTable);
        historyContainer?.classList.toggle('staff-list--table', isTable);

        const gridBtn = this.document.getElementById('staff-view-grid-btn');
        const tableBtn = this.document.getElementById('staff-view-table-btn');

        if (gridBtn) {
            gridBtn.classList.toggle('is-active', !isTable);
            gridBtn.setAttribute('aria-pressed', !isTable ? 'true' : 'false');
        }
        if (tableBtn) {
            tableBtn.classList.toggle('is-active', isTable);
            tableBtn.setAttribute('aria-pressed', isTable ? 'true' : 'false');
        }
    }

    setupViewSwitcher() {
        const gridBtn = this.document.getElementById('staff-view-grid-btn');
        const tableBtn = this.document.getElementById('staff-view-table-btn');

        if (gridBtn && gridBtn.dataset.staffBound !== 'true') {
            gridBtn.dataset.staffBound = 'true';
            gridBtn.addEventListener('click', () => this.setViewMode('grid'));
        }
        if (tableBtn && tableBtn.dataset.staffBound !== 'true') {
            tableBtn.dataset.staffBound = 'true';
            tableBtn.addEventListener('click', () => this.setViewMode('table'));
        }

        this.setViewMode(this.viewMode);
    }

    render() {
        const listContainer = this.document.getElementById('staff-list-container');
        const historyContainer = this.document.getElementById('history-list-container');
        if (!listContainer || !historyContainer) return;

        this.ensureAddEmployeeFormReady();
        this.setupViewSwitcher();
        this.updateChrome();

        this.renderCurrentList();
    }

    renderCurrentList() {
        const listContainer = this.document.getElementById('staff-list-container');
        const historyContainer = this.document.getElementById('history-list-container');
        if (!listContainer || !historyContainer) return;

        listContainer.classList.toggle('hidden', this.isHistoryView);
        historyContainer.classList.toggle('hidden', !this.isHistoryView);
        listContainer.hidden = this.isHistoryView;
        historyContainer.hidden = !this.isHistoryView;

        if (this.isHistoryView) {
            this.renderHistoryList();
            return;
        }

        this.renderActiveList();
    }

    updateChrome() {
        this.updateSummaryCounts();
        this.updateViewButtons();
        this.updatePanelCopy();
        this.updateSearchControl();
    }

    updateSearchControl() {
        const searchInput = this.document.getElementById('staff-search-input');
        const clearSearchButton = this.document.getElementById('staff-search-clear');
        const hasQuery = Boolean(this.searchQuery.trim());

        if (searchInput && searchInput.value !== this.searchQuery) {
            searchInput.value = this.searchQuery;
        }
        clearSearchButton?.classList.toggle('hidden', !hasQuery);
    }

    updateSummaryCounts() {
        const activeEmployees = this.dataManager.getActiveEmployees?.() || [];
        const archivedEmployees = this.dataManager.getArchivedEmployees?.() || [];

        const activeCount = this.document.getElementById('staff-active-count');
        const archivedCount = this.document.getElementById('staff-archived-count');
        const totalCount = this.document.getElementById('staff-total-count');

        const activeCountStr = String(activeEmployees.length);
        const archivedCountStr = String(archivedEmployees.length);
        const totalCountStr = String(activeEmployees.length + archivedEmployees.length);

        if (activeCount) activeCount.textContent = activeCountStr;
        if (archivedCount) archivedCount.textContent = archivedCountStr;
        if (totalCount) totalCount.textContent = totalCountStr;

        const activeTabCount = this.document.getElementById('staff-active-tab-count');
        const archivedTabCount = this.document.getElementById('staff-archived-tab-count');
        if (activeTabCount) activeTabCount.textContent = activeCountStr;
        if (archivedTabCount) archivedTabCount.textContent = archivedCountStr;
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

    getAvatarTheme(name = '') {
        const themes = ['coral', 'indigo', 'emerald', 'amber', 'purple', 'sky', 'rose', 'teal'];
        let hash = 0;
        const str = String(name).trim();
        for (let i = 0; i < str.length; i++) {
            hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
        }
        return themes[hash % themes.length];
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

    normalizeSearchValue(value = '') {
        return String(value)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase()
            .trim();
    }

    filterEmployees(employees = []) {
        const query = this.normalizeSearchValue(this.searchQuery);
        const filteredEmployees = query ? employees.filter((employee) => {
            const searchableProfile = [
                employee.name,
                employee.staffNumber,
                employee.department,
                employee.position,
                employee.employmentType,
                employee.email,
                employee.phone,
                employee.personalPhone
            ].filter(Boolean).join(' ');

            return this.normalizeSearchValue(searchableProfile).includes(query);
        }) : employees;

        return this.sortEmployees(filteredEmployees);
    }

    getEmployeeDateValue(employee = {}) {
        const value = employee.hireDate || employee.createdAt;
        if (!value) return null;

        if (typeof value.toMillis === 'function') {
            return value.toMillis();
        }
        if (typeof value.toDate === 'function') {
            return value.toDate().getTime();
        }

        const timestamp = new Date(value).getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    sortEmployees(employees = []) {
        const direction = this.sortMode === 'nameDesc' || this.sortMode === 'newest' ? -1 : 1;
        const isChronological = this.sortMode === 'oldest' || this.sortMode === 'newest';

        return employees
            .map((employee, index) => ({ employee, index }))
            .sort((left, right) => {
                if (isChronological) {
                    const leftDate = this.getEmployeeDateValue(left.employee);
                    const rightDate = this.getEmployeeDateValue(right.employee);

                    if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
                        return (leftDate - rightDate) * direction;
                    }
                    if (leftDate !== null || rightDate !== null) {
                        return leftDate !== null ? -1 : 1;
                    }

                    const leftOrder = Number(left.employee.displayOrder ?? left.employee.staffNumber);
                    const rightOrder = Number(right.employee.displayOrder ?? right.employee.staffNumber);
                    if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
                        return (leftOrder - rightOrder) * direction;
                    }
                }

                const nameComparison = String(left.employee.name || '').localeCompare(
                    String(right.employee.name || ''),
                    undefined,
                    { sensitivity: 'base' }
                );
                return nameComparison ? nameComparison * direction : left.index - right.index;
            })
            .map(({ employee }) => employee);
    }

    renderStateMessage(container, { title, message, tone = 'muted' }) {
        const safeTitle = this.escapeHtml(title);
        const safeMessage = this.escapeHtml(message);
        const toneClass = tone === 'error' ? ' staff-state--error' : '';
        const iconSvg = tone === 'error'
            ? `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`
            : `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`;

        container.innerHTML = `
            <div class="staff-state${toneClass}">
                <div class="staff-state__icon">${iconSvg}</div>
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

        const filteredEmployees = this.filterEmployees(activeEmployees);
        if (filteredEmployees.length === 0) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.searchEmptyTitle', 'No colleagues found'),
                message: this.translate('staff.states.searchEmpty', 'Try another name, staff number, department, email, or phone number.')
            });
            return;
        }

        container.innerHTML = filteredEmployees.map((employee) => this.renderActiveCard(employee)).join('');
    }

    renderActiveCard(employee) {
        const name = this.escapeHtml(employee.name || '');
        const avatarTheme = this.getAvatarTheme(employee.name);
        const pills = [];

        if (employee.staffNumber) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--accent">${this.escapeHtml(`${this.translate('staff.staffNumber', 'Staff Number')} #${employee.staffNumber}`)}</span>`);
        }
        if (employee.department) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--dept">${this.escapeHtml(employee.department)}</span>`);
        }
        if (employee.position) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--pos">${this.escapeHtml(employee.position)}</span>`);
        }
        if (employee.employmentType) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--type">${this.escapeHtml(employee.employmentType)}</span>`);
        }

        if (!pills.length) {
            pills.push(`<span class="staff-meta-pill staff-meta-pill--muted">${this.escapeHtml(this.translate('staff.noMeta', 'No extra profile details yet'))}</span>`);
        }

        const contacts = [];
        if (employee.email) {
            contacts.push(`<a href="mailto:${this.escapeHtml(employee.email)}" class="staff-contact-link"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>${this.escapeHtml(employee.email)}</a>`);
        }
        if (employee.phone && employee.personalPhone) {
            const companyTag = this.translate('staff.phoneTypes.companyShort', 'Work');
            const personalTag = this.translate('staff.phoneTypes.personalShort', 'Personal');
            contacts.push(`<a href="tel:${this.escapeHtml(employee.phone)}" class="staff-contact-link"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>${this.escapeHtml(employee.phone)}</a> <span class="text-xs text-slate-500 font-medium">(${this.escapeHtml(companyTag)})</span>`);
            contacts.push(`<a href="tel:${this.escapeHtml(employee.personalPhone)}" class="staff-contact-link"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>${this.escapeHtml(employee.personalPhone)}</a> <span class="text-xs text-slate-500 font-medium">(${this.escapeHtml(personalTag)})</span>`);
        } else if (employee.phone) {
            contacts.push(`<a href="tel:${this.escapeHtml(employee.phone)}" class="staff-contact-link"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>${this.escapeHtml(employee.phone)}</a>`);
        } else if (employee.personalPhone) {
            const personalTag = this.translate('staff.phoneTypes.personalShort', 'Personal');
            contacts.push(`<a href="tel:${this.escapeHtml(employee.personalPhone)}" class="staff-contact-link"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>${this.escapeHtml(employee.personalPhone)}</a> <span class="text-xs text-slate-500 font-medium">(${this.escapeHtml(personalTag)})</span>`);
        }

        const contactMarkup = contacts.length
            ? `<div class="staff-contact">${contacts.map((item, index) => `${index ? '<span class="staff-contact-separator">/</span>' : ''}${item}`).join('')}</div>`
            : '';

        const normalizedDays = Array.isArray(employee.workDays)
            ? employee.workDays
                .map((day) => Number.parseInt(day, 10))
                .filter((day) => Number.isInteger(day))
            : [];

        const dayChips = [0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
            const dayName = this.getWeekdayLabel(dayIdx);
            const initial = dayName ? dayName.charAt(0).toUpperCase() : '';
            const isActive = normalizedDays.includes(dayIdx);
            return `<span class="staff-day-chip${isActive ? ' is-active' : ''}" title="${this.escapeHtml(dayName)}">${this.escapeHtml(initial)}</span>`;
        }).join('');

        return `
            <article class="staff-card">
                <div class="staff-identity">
                    <div class="staff-avatar staff-avatar--${this.escapeHtml(avatarTheme)}">${this.escapeHtml(this.getInitials(employee.name))}</div>
                    <div class="staff-copy">
                        <div class="staff-name-row">
                            <h3 class="staff-name">${name}</h3>
                        </div>
                        <div class="staff-meta-row">${pills.join('')}</div>
                        ${contactMarkup}
                        <div class="staff-schedule-block">
                            <div class="staff-days-visual" aria-hidden="true">${dayChips}</div>
                            <p class="staff-secondary-meta">
                                <strong>${this.escapeHtml(this.translate('staff.defaultDays', 'Default days'))}:</strong>
                                ${this.escapeHtml(this.formatWorkDays(employee.workDays))}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="staff-actions">
                    <button class="staff-button staff-button--secondary edit-employee-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        ${this.escapeHtml(this.translate('common.edit', 'Edit'))}
                    </button>
                    <button class="staff-button staff-button--warning archive-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>
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

        const filteredEmployees = this.filterEmployees(archivedEmployees);
        if (filteredEmployees.length === 0) {
            this.renderStateMessage(container, {
                title: this.translate('staff.states.searchEmptyTitle', 'No colleagues found'),
                message: this.translate('staff.states.searchEmpty', 'Try another name, staff number, department, email, or phone number.')
            });
            return;
        }

        container.innerHTML = filteredEmployees.map((employee) => this.renderHistoryCard(employee)).join('');
    }

    renderHistoryCard(employee) {
        const name = this.escapeHtml(employee.name || '');
        const archivedNote = this.escapeHtml(this.translate('staff.archivedNote', 'Archived record'));

        const normalizedDays = Array.isArray(employee.workDays)
            ? employee.workDays
                .map((day) => Number.parseInt(day, 10))
                .filter((day) => Number.isInteger(day))
            : [];

        const dayChips = [0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
            const dayName = this.getWeekdayLabel(dayIdx);
            const initial = dayName ? dayName.charAt(0).toUpperCase() : '';
            const isActive = normalizedDays.includes(dayIdx);
            return `<span class="staff-day-chip${isActive ? ' is-active' : ''}" title="${this.escapeHtml(dayName)}">${this.escapeHtml(initial)}</span>`;
        }).join('');

        return `
            <article class="staff-card staff-card--archived">
                <div class="staff-identity">
                    <div class="staff-avatar staff-avatar--archived">${this.escapeHtml(this.getInitials(employee.name))}</div>
                    <div class="staff-copy">
                        <div class="staff-name-row">
                            <h3 class="staff-name">${name}</h3>
                            <span class="staff-meta-pill staff-meta-pill--muted">${archivedNote}</span>
                        </div>
                        <div class="staff-schedule-block">
                            <div class="staff-days-visual" aria-hidden="true">${dayChips}</div>
                            <p class="staff-secondary-meta">
                                <strong>${this.escapeHtml(this.translate('staff.defaultDays', 'Default days'))}:</strong>
                                ${this.escapeHtml(this.formatWorkDays(employee.workDays))}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="staff-actions">
                    <button class="staff-button staff-button--success restore-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        ${this.escapeHtml(this.translate('staff.restore', 'Restore'))}
                    </button>
                    <button class="staff-button staff-button--danger delete-btn" data-employee-id="${this.escapeHtml(employee.id)}">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
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
