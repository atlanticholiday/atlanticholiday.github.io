import { buildEmployeeAccessOverview } from './access-linking.js';
import { canonicalizeEmail } from '../../shared/email.js';
import { TIME_CLOCK_STATION_ROLE } from '../../shared/access-roles.js';
import { t } from '../../core/i18n.js';

const PRESET_ROLES = [
    { key: 'admin', title: 'Administrator' },
    { key: 'manager', title: 'Manager' },
    { key: 'supervisor', title: 'Supervisor' },
    { key: 'employee', title: 'Employee' },
    { key: TIME_CLOCK_STATION_ROLE, title: 'Time Clock Station' }
];

const TEST_USER_PASSWORD = 'Test1234!';
const TEST_USER_PRESETS = [
    { key: 'admin', title: 'Administrator', email: 'test-admin@horario.test' },
    { key: 'manager', title: 'Manager', email: 'test-manager@horario.test' },
    { key: 'supervisor', title: 'Supervisor', email: 'test-supervisor@horario.test' },
    { key: 'employee', title: 'Employee', email: 'test-employee@horario.test' }
];

const ROLE_UI_META = Object.freeze({
    admin: {
        tone: 'privileged',
        titleKey: 'userManagement.roles.admin.title',
        descriptionKey: 'userManagement.roles.admin.description'
    },
    manager: {
        tone: 'privileged',
        titleKey: 'userManagement.roles.manager.title',
        descriptionKey: 'userManagement.roles.manager.description'
    },
    supervisor: {
        tone: 'privileged',
        titleKey: 'userManagement.roles.supervisor.title',
        descriptionKey: 'userManagement.roles.supervisor.description'
    },
    employee: {
        tone: 'employee',
        titleKey: 'userManagement.roles.employee.title',
        descriptionKey: 'userManagement.roles.employee.description'
    },
    [TIME_CLOCK_STATION_ROLE]: {
        tone: 'station',
        titleKey: 'userManagement.roles.timeClockStation.title',
        descriptionKey: 'userManagement.roles.timeClockStation.description'
    }
});

export class UserManagementController {
    constructor({
        accessManager,
        roleManager,
        createAuthUser,
        sendPasswordReset,
        getEmployees = () => [],
        ensureEmployeeForAccess = async () => {},
        documentRef = document,
        windowRef = window
    }) {
        this.accessManager = accessManager;
        this.roleManager = roleManager;
        this.createAuthUser = createAuthUser;
        this.sendPasswordReset = sendPasswordReset;
        this.getEmployees = getEmployees;
        this.ensureEmployeeForAccess = ensureEmployeeForAccess;
        this.document = documentRef;
        this.window = windowRef;
    }

    init() {
        this.currentMainView = 'accounts';
        this.currentSideView = 'roles';
        this.isDrawerOpen = false;
        this.setupRolePresetInputs();
        this.setupMainViewNavigation();
        this.setupSideViewNavigation();
        this.setupDrawerControls();
        this.renderTestUserPresets();

        this.document.addEventListener('userManagementPageOpened', () => {
            this.setActiveMainView(this.currentMainView);
            this.setActiveSideView(this.currentSideView);
            this.refreshUserList().catch((error) => {
                console.error('Failed to refresh user management list:', error);
            });
        });

        if (typeof this.window?.addEventListener === 'function') {
            this.window.addEventListener('languageChanged', () => {
                this.renderStaticUserManagementCopy();
                this.renderFromCachedState();
            });
        }

        const createUserButton = this.document.getElementById('create-user-btn');
        if (createUserButton) {
            createUserButton.addEventListener('click', () => {
                this.handleCreateUser().catch((error) => {
                    this.setText('create-user-error', error.message || 'Failed to create user.');
                });
            });
        }

        const addRoleButton = this.document.getElementById('add-role-btn');
        if (addRoleButton) {
            addRoleButton.addEventListener('click', () => {
                this.handleAddRole().catch((error) => {
                    this.setText('add-role-error', error.message || 'Failed to add role.');
                });
            });
        }

        const createTestUsersButton = this.document.getElementById('create-test-users-btn');
        if (createTestUsersButton) {
            createTestUsersButton.addEventListener('click', () => {
                this.handleCreateTestUsers().catch((error) => {
                    this.setText('test-user-feedback', error.message || 'Failed to create test users.');
                });
            });
        }

        this.renderStaticUserManagementCopy();
        this.setActiveMainView(this.currentMainView);
        this.setActiveSideView(this.currentSideView);
        this.setDrawerOpen(false);
    }

    setupRolePresetInputs() {
        const keyInput = this.document.getElementById('new-role-key');
        const titleInput = this.document.getElementById('new-role-title');
        if (!keyInput || !titleInput) return;

        keyInput.addEventListener('change', () => {
            const selectedPreset = PRESET_ROLES.find((role) => role.key === keyInput.value);
            if (selectedPreset) {
                titleInput.value = selectedPreset.title;
            }
        });

        titleInput.addEventListener('change', () => {
            const selectedPreset = PRESET_ROLES.find((role) => role.title === titleInput.value);
            if (selectedPreset) {
                keyInput.value = selectedPreset.key;
            }
        });
    }

    setupSideViewNavigation() {
        const buttons = Array.from(this.document.querySelectorAll('[data-user-management-side-view-target]'));
        if (!buttons.length) {
            return;
        }

        buttons.forEach((button) => {
            if (button.dataset.userManagementSideViewBound === 'true') {
                return;
            }

            button.dataset.userManagementSideViewBound = 'true';
            button.addEventListener('click', () => {
                this.setActiveSideView(button.dataset.userManagementSideViewTarget || 'roles');
                this.revealActiveSideView();
            });
        });
    }

    setupMainViewNavigation() {
        const buttons = Array.from(this.document.querySelectorAll('[data-user-management-main-view-target]'));
        if (!buttons.length) {
            return;
        }

        buttons.forEach((button) => {
            if (button.dataset.userManagementMainViewBound === 'true') {
                return;
            }

            button.dataset.userManagementMainViewBound = 'true';
            button.addEventListener('click', () => {
                this.setActiveMainView(button.dataset.userManagementMainViewTarget || 'accounts');
            });
        });
    }

    setupDrawerControls() {
        const toggleButton = this.document.getElementById('user-management-menu-toggle-btn');
        const closeButton = this.document.getElementById('user-management-menu-close-btn');
        const backdrop = this.document.getElementById('user-management-drawer-backdrop');

        toggleButton?.addEventListener('click', () => {
            this.setDrawerOpen(!this.isDrawerOpen);
        });

        closeButton?.addEventListener('click', () => {
            this.setDrawerOpen(false);
        });

        backdrop?.addEventListener('click', () => {
            this.setDrawerOpen(false);
        });

        if (typeof this.window?.addEventListener === 'function') {
            this.window.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.isDrawerOpen) {
                    this.setDrawerOpen(false);
                }
            });
        }
    }

    setActiveSideView(view) {
        const panels = Array.from(this.document.querySelectorAll('[data-user-management-side-view]'));
        const nextView = panels.some((panel) => panel.dataset.userManagementSideView === view) ? view : 'roles';
        this.currentSideView = nextView;

        panels.forEach((panel) => {
            const isActive = panel.dataset.userManagementSideView === this.currentSideView;
            panel.classList.toggle('user-management-side-view-active', isActive);
            panel.hidden = !isActive;
        });

        this.document.querySelectorAll('[data-user-management-side-view-target]').forEach((button) => {
            const isActive = button.dataset.userManagementSideViewTarget === this.currentSideView;
            button.classList.toggle('user-management-menu-button-active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    setActiveMainView(view) {
        const panels = Array.from(this.document.querySelectorAll('[data-user-management-main-view]'));
        if (!panels.length) {
            return;
        }

        const nextView = panels.some((panel) => panel.dataset.userManagementMainView === view) ? view : 'accounts';
        this.currentMainView = nextView;

        panels.forEach((panel) => {
            const isActive = panel.dataset.userManagementMainView === this.currentMainView;
            panel.classList.toggle('user-management-main-view-active', isActive);
            panel.hidden = !isActive;
        });

        this.document.querySelectorAll('[data-user-management-main-view-target]').forEach((button) => {
            const isActive = button.dataset.userManagementMainViewTarget === this.currentMainView;
            button.classList.toggle('user-management-main-tab-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    }

    setDrawerOpen(isOpen) {
        this.isDrawerOpen = Boolean(isOpen);

        const page = this.document.getElementById('user-management-page');
        const drawer = this.document.getElementById('user-management-drawer');
        const toggleButton = this.document.getElementById('user-management-menu-toggle-btn');
        const backdrop = this.document.getElementById('user-management-drawer-backdrop');

        page?.classList.toggle('user-management-drawer-open', this.isDrawerOpen);
        if (drawer) {
            drawer.setAttribute('aria-hidden', this.isDrawerOpen ? 'false' : 'true');
        }
        if (toggleButton) {
            toggleButton.setAttribute('aria-expanded', this.isDrawerOpen ? 'true' : 'false');
        }
        if (backdrop) {
            backdrop.hidden = !this.isDrawerOpen;
        }
        if (this.isDrawerOpen) {
            this.revealActiveSideView({ behavior: 'auto' });
        }
    }

    revealActiveSideView({ behavior = 'smooth' } = {}) {
        const activePanel = this.document.querySelector('[data-user-management-side-view].user-management-side-view-active');
        if (!activePanel) {
            return;
        }

        if (typeof activePanel.scrollIntoView === 'function') {
            activePanel.scrollIntoView({ behavior, block: 'start' });
            return;
        }

        const drawerInner = this.document.querySelector('.user-management-drawer-inner');
        if (drawerInner) {
            drawerInner.scrollTop = 0;
        }
    }

    async refreshUserList() {
        const listElement = this.document.getElementById('user-list');
        if (!listElement) return;

        const [roles, emails] = await Promise.all([
            this.roleManager.listRoles(),
            this.accessManager.listEmails()
        ]);

        const users = await Promise.all(
            emails.map(async (email) => ({
                email,
                roles: await this.accessManager.getRoles(email)
            }))
        );
        const employees = await Promise.resolve(this.getEmployees());
        const employeesByEmail = new Map(
            employees
                .filter((employee) => canonicalizeEmail(employee?.email))
                .map((employee) => [canonicalizeEmail(employee.email), employee])
        );

        await Promise.all(
            users.map((user) => this.accessManager.syncEmployeeLink?.(
                user.email,
                employeesByEmail.get(canonicalizeEmail(user.email)) || null
            ))
        );

        this.lastUsers = users;
        this.lastRoles = roles;
        this.lastEmployees = employees;
        this.lastEmployeesByEmail = employeesByEmail;

        this.renderUserList(users, roles, employeesByEmail);
        this.renderRolesList(roles);
        this.renderAccessOverview(buildEmployeeAccessOverview(employees, users));
    }

    renderFromCachedState() {
        if (!this.lastUsers || !this.lastRoles || !this.lastEmployeesByEmail || !this.lastEmployees) {
            return;
        }

        this.renderUserList(this.lastUsers, this.lastRoles, this.lastEmployeesByEmail);
        this.renderRolesList(this.lastRoles);
        this.renderAccessOverview(buildEmployeeAccessOverview(this.lastEmployees, this.lastUsers));
    }

    renderUserList(users, roles, employeesByEmail = new Map()) {
        const listElement = this.document.getElementById('user-list');
        if (!listElement) return;

        listElement.innerHTML = '';

        const countElement = this.document.getElementById('user-count');
        if (countElement) {
            countElement.textContent = String(users.length);
        }

        if (!users.length) {
            listElement.innerHTML = `<li class="user-management-empty-state">${this.translate('userManagement.users.empty', 'No access accounts created yet.')}</li>`;
            return;
        }

        users
            .slice()
            .sort((left, right) => left.email.localeCompare(right.email))
            .forEach((user) => {
                const linkedEmployee = employeesByEmail.get(canonicalizeEmail(user.email)) || null;
                listElement.appendChild(this.createUserListItem(user, roles, linkedEmployee));
            });
    }

    renderRolesList(roles) {
        const listElement = this.document.getElementById('roles-list');
        if (!listElement) return;

        if (!roles.length) {
            listElement.innerHTML = `<li class="user-management-role-definition">${this.translate('userManagement.roles.empty', 'No roles created yet. Choose a preset from the dropdowns below to add one.')}</li>`;
            return;
        }

        const noteHtml = `
            <li class="user-management-role-note">
                <strong>${this.translate('userManagement.roles.noteTitle', 'Current permission model')}</strong>
                <span>${this.translate('userManagement.roles.noteBody', 'Admin, Manager, and Supervisor currently open the same privileged workspace in the app. Keep different names only if your team needs them operationally.')}</span>
            </li>
        `;

        listElement.innerHTML = noteHtml + roles.map((role) => `
            <li class="user-management-role-definition">
                <div>
                    <strong>${this.getRoleDisplayTitle(role)}</strong>
                    <p>${this.getRoleDescription(role)}</p>
                </div>
                <span class="user-management-role-key user-management-role-key-${this.getRoleTone(role)}">${role.key}</span>
            </li>
        `).join('');
    }

    renderAccessOverview(rows) {
        const container = this.document.getElementById('access-link-overview');
        if (!container) return;

        if (!rows.length) {
            container.innerHTML = `<div class="text-sm text-gray-500">${this.translate('userManagement.accessOverview.empty', 'No colleagues found yet.')}</div>`;
            return;
        }

        const statusStyles = {
            'missing-email': 'user-management-status-pill-warning',
            'missing-access': 'user-management-status-pill-danger',
            'clock-only': 'user-management-status-pill-info',
            'station': 'user-management-status-pill-station',
            'privileged': 'user-management-status-pill-success'
        };

        container.innerHTML = rows.map((row) => `
            <article class="user-management-overview-card">
                <div class="user-management-overview-header">
                    <div class="user-management-overview-main">
                        <div class="font-semibold text-gray-900">${row.employeeName}</div>
                        <div class="user-management-overview-email">${row.displayEmail || row.email || this.translate('userManagement.accessOverview.noStaffEmail', 'No email on staff record')}</div>
                    </div>
                    <div class="user-management-status-pill ${statusStyles[row.status] || ''}">
                        ${this.getAccessOverviewLabel(row)}
                    </div>
                </div>
                <div class="text-sm text-gray-500">${this.getAccessOverviewHelpText(row)}</div>
                <div class="text-xs text-gray-500">${row.roles.length ? `${this.translate('userManagement.accessOverview.rolesLabel', 'Roles')}: ${row.roles.map((role) => this.getRoleDisplayTitle({ key: role, title: role })).join(', ')}` : `${this.translate('userManagement.accessOverview.rolesLabel', 'Roles')}: ${this.translate('userManagement.accessOverview.noRoles', 'none')}`}</div>
            </article>
        `).join('');
    }

    renderTestUserPresets() {
        const listElement = this.document.getElementById('test-user-presets');
        if (listElement) {
            listElement.innerHTML = TEST_USER_PRESETS.map((preset) => `
                <li class="user-management-test-user-item">
                    <strong>${this.getRoleDisplayTitle(preset)}</strong>
                    <span>${preset.email}</span>
                </li>
            `).join('');
        }

        const passwordElement = this.document.getElementById('test-user-password');
        if (passwordElement) {
            passwordElement.textContent = TEST_USER_PASSWORD;
        }
    }

    createUserListItem(user, roles, linkedEmployee = null) {
        const listItem = this.document.createElement('li');
        listItem.className = 'user-management-user-card';

        const identity = this.document.createElement('div');
        identity.className = 'user-management-identity';

        const title = this.document.createElement('div');
        title.className = 'user-management-user-title';
        title.textContent = linkedEmployee?.name || this.formatEmailLabel(user.email);

        const emailLabel = this.document.createElement('div');
        emailLabel.className = 'user-management-user-email';
        emailLabel.textContent = user.email;

        const meta = this.document.createElement('div');
        meta.className = 'user-management-user-meta';
        meta.appendChild(this.createMetaPill(linkedEmployee ? 'Linked colleague' : 'Standalone access', linkedEmployee ? 'neutral' : 'warning'));
        if (user.email.endsWith('@horario.test')) {
            meta.appendChild(this.createMetaPill('Test account', 'accent'));
        }
        if (user.roles.includes(TIME_CLOCK_STATION_ROLE)) {
            meta.appendChild(this.createMetaPill('Shared station', 'info'));
        }

        identity.appendChild(title);
        identity.appendChild(emailLabel);
        identity.appendChild(meta);

        const rolesContainer = this.document.createElement('div');
        rolesContainer.className = 'user-management-role-grid';
        roles.forEach((role) => {
            rolesContainer.appendChild(this.createRoleCheckbox(user.email, role, user.roles, rolesContainer));
        });

        const buttonGroup = this.document.createElement('div');
        buttonGroup.className = 'user-management-action-group';
        buttonGroup.appendChild(this.createResetPasswordButton(user.email));
        buttonGroup.appendChild(this.createDeleteAccessButton(user.email));

        listItem.appendChild(identity);
        listItem.appendChild(rolesContainer);
        listItem.appendChild(buttonGroup);

        return listItem;
    }

    createRoleCheckbox(email, role, selectedRoles, rolesContainer) {
        const wrapper = this.document.createElement('div');
        wrapper.className = 'user-management-role-option';

        const checkbox = this.document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `role-${email}-${role.key}`;
        checkbox.value = role.key;
        checkbox.checked = selectedRoles.includes(role.key);
        checkbox.className = 'user-management-role-checkbox';
        checkbox.addEventListener('change', async () => {
            const nextRoles = Array.from(
                rolesContainer.querySelectorAll('input[type=checkbox]:checked')
            ).map((input) => input.value);

            await this.accessManager.setRoles(email, nextRoles);
        });

        const label = this.document.createElement('label');
        label.htmlFor = checkbox.id;
        label.className = 'user-management-role-label';
        label.textContent = this.getRoleDisplayTitle(role);

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);

        return wrapper;
    }

    createResetPasswordButton(email) {
        const button = this.document.createElement('button');
        button.textContent = this.translate('userManagement.users.resetPassword', 'Reset Password');
        button.className = 'user-management-button user-management-button-secondary';
        button.addEventListener('click', async () => {
            try {
                await this.sendPasswordReset(email);
                this.window.alert(`Password reset email sent to ${email}`);
            } catch (error) {
                console.error(error);
                this.window.alert(`Failed to send reset email: ${error.message}`);
            }
        });

        return button;
    }

    createDeleteAccessButton(email) {
        const button = this.document.createElement('button');
        button.textContent = this.translate('common.delete', 'Delete');
        button.className = 'user-management-button user-management-button-danger';
        button.addEventListener('click', async () => {
            if (!this.window.confirm(`Remove access for ${email}?`)) return;

            try {
                await this.accessManager.removeEmail(email);
                await this.refreshUserList();
            } catch (error) {
                console.error(error);
                this.window.alert(`Failed to remove user: ${error.message}`);
            }
        });

        return button;
    }

    renderStaticUserManagementCopy() {
        this.setText('create-test-users-btn', this.translate('userManagement.testUsers.createButton', 'Create Test Users'));
    }

    createMetaPill(text, tone = 'neutral') {
        const pill = this.document.createElement('span');
        pill.className = `user-management-meta-pill user-management-meta-pill-${tone}`;
        pill.textContent = text;
        return pill;
    }

    formatEmailLabel(email) {
        const [localPart = 'User'] = String(email || '').split('@');
        return localPart
            .split(/[._-]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ') || email;
    }

    getRoleDisplayTitle(role) {
        const roleKey = role?.key || '';
        const meta = ROLE_UI_META[roleKey];
        return meta ? this.translate(meta.titleKey, role?.title || roleKey) : (role?.title || roleKey);
    }

    getRoleDescription(role) {
        const roleKey = role?.key || '';
        const meta = ROLE_UI_META[roleKey];
        return meta ? this.translate(meta.descriptionKey, role?.title || roleKey) : role?.title || roleKey;
    }

    getRoleTone(role) {
        const roleKey = role?.key || '';
        return ROLE_UI_META[roleKey]?.tone || 'neutral';
    }

    getAccessOverviewLabel(row) {
        const keyByStatus = {
            'missing-email': 'userManagement.accessOverview.status.missingEmail',
            'missing-access': 'userManagement.accessOverview.status.missingAccess',
            'clock-only': 'userManagement.accessOverview.status.clockOnly',
            'station': 'userManagement.accessOverview.status.station',
            'privileged': 'userManagement.accessOverview.status.privileged'
        };

        return this.translate(keyByStatus[row.status] || 'userManagement.accessOverview.status.unknown', row.label || 'Unknown status');
    }

    getAccessOverviewHelpText(row) {
        const keyByStatus = {
            'missing-email': 'userManagement.accessOverview.help.missingEmail',
            'missing-access': 'userManagement.accessOverview.help.missingAccess',
            'clock-only': 'userManagement.accessOverview.help.clockOnly',
            'station': 'userManagement.accessOverview.help.station',
            'privileged': 'userManagement.accessOverview.help.privileged'
        };

        return this.translate(keyByStatus[row.status] || 'userManagement.accessOverview.help.unknown', row.helpText || 'Review this colleague record and assigned access.');
    }

    translate(key, fallback, replacements = {}) {
        const translated = t(key, replacements);
        return translated === key ? fallback : translated;
    }

    async handleCreateUser() {
        const emailInput = this.document.getElementById('new-user-email');
        const passwordInput = this.document.getElementById('new-user-password');
        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        this.setText('create-user-error', '');

        if (!email) {
            this.setText('create-user-error', 'Please enter a valid email address.');
            return;
        }

        if (!password) {
            this.setText('create-user-error', 'Please enter a password.');
            return;
        }

        await this.createAuthUser(email, password);
        await this.accessManager.addEmail(email);

        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        await this.refreshUserList();
    }

    async handleAddRole() {
        const keyInput = this.document.getElementById('new-role-key');
        const titleInput = this.document.getElementById('new-role-title');
        const key = keyInput?.value.trim();
        const title = titleInput?.value.trim();

        this.setText('add-role-error', '');

        if (!key || !title) {
            this.setText('add-role-error', 'Please specify both key and title.');
            return;
        }

        await this.roleManager.addRole(key, title);

        if (keyInput) keyInput.value = '';
        if (titleInput) titleInput.value = '';

        await this.refreshUserList();
    }

    async handleCreateTestUsers() {
        this.setText('test-user-feedback', '');

        for (const preset of TEST_USER_PRESETS) {
            await this.roleManager.addRole(preset.key, preset.title);

            try {
                await this.createAuthUser(preset.email, TEST_USER_PASSWORD);
            } catch (error) {
                if (error?.code !== 'auth/email-already-in-use') {
                    throw error;
                }
            }

            await this.accessManager.addEmail(preset.email);
            await this.accessManager.setRoles(preset.email, [preset.key]);
        }

        this.setText('test-user-feedback', `Test users ready. Shared password: ${TEST_USER_PASSWORD}`);
        await this.refreshUserList();
    }

    setText(elementId, value) {
        const element = this.document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }
}
