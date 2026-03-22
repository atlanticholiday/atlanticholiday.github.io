import { buildEmployeeAccessOverview } from './access-linking.js';
import { canonicalizeEmail } from '../../shared/email.js';

const PRESET_ROLES = [
    { key: 'admin', title: 'Administrator' },
    { key: 'manager', title: 'Manager' },
    { key: 'supervisor', title: 'Supervisor' },
    { key: 'employee', title: 'Employee' }
];

const TEST_USER_PASSWORD = 'Test1234!';
const TEST_USER_PRESETS = [
    { key: 'admin', title: 'Administrator', email: 'test-admin@horario.test', employeeName: 'Test Admin' },
    { key: 'manager', title: 'Manager', email: 'test-manager@horario.test', employeeName: 'Test Manager' },
    { key: 'supervisor', title: 'Supervisor', email: 'test-supervisor@horario.test', employeeName: 'Test Supervisor' },
    { key: 'employee', title: 'Employee', email: 'test-employee@horario.test', employeeName: 'Test Employee' }
];

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
        this.setupRolePresetInputs();
        this.renderTestUserPresets();

        this.document.addEventListener('userManagementPageOpened', () => {
            this.refreshUserList().catch((error) => {
                console.error('Failed to refresh user management list:', error);
            });
        });

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

        this.renderUserList(users, roles);
        this.renderRolesList(roles);
        this.renderAccessOverview(buildEmployeeAccessOverview(employees, users));
    }

    renderUserList(users, roles) {
        const listElement = this.document.getElementById('user-list');
        if (!listElement) return;

        listElement.innerHTML = '';

        users.forEach((user) => {
            listElement.appendChild(this.createUserListItem(user, roles));
        });
    }

    renderRolesList(roles) {
        const listElement = this.document.getElementById('roles-list');
        if (!listElement) return;

        if (!roles.length) {
            listElement.innerHTML = '<li>No roles created yet. Choose a preset from the dropdowns below to add one.</li>';
            return;
        }

        listElement.innerHTML = roles.map((role) => `<li><strong>${role.key}</strong> - ${role.title}</li>`).join('');
    }

    renderAccessOverview(rows) {
        const container = this.document.getElementById('access-link-overview');
        if (!container) return;

        if (!rows.length) {
            container.innerHTML = '<div class="text-sm text-gray-500">No colleagues found yet.</div>';
            return;
        }

        const statusStyles = {
            'missing-email': 'bg-amber-100 text-amber-800',
            'missing-access': 'bg-rose-100 text-rose-800',
            'clock-only': 'bg-sky-100 text-sky-800',
            'privileged': 'bg-emerald-100 text-emerald-800'
        };

        container.innerHTML = rows.map((row) => `
            <article class="border border-gray-200 rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <div class="font-semibold text-gray-900">${row.employeeName}</div>
                    <div class="text-sm text-gray-600">${row.displayEmail || row.email || 'No email on staff record'}</div>
                    <div class="text-sm text-gray-500 mt-1">${row.helpText}</div>
                </div>
                <div class="sm:text-right">
                    <div class="inline-flex px-3 py-1 rounded-full text-xs font-semibold ${statusStyles[row.status] || 'bg-gray-100 text-gray-700'}">
                        ${row.label}
                    </div>
                    <div class="text-xs text-gray-500 mt-2">${row.roles.length ? `Roles: ${row.roles.join(', ')}` : 'Roles: none'}</div>
                </div>
            </article>
        `).join('');
    }

    renderTestUserPresets() {
        const listElement = this.document.getElementById('test-user-presets');
        if (listElement) {
            listElement.innerHTML = TEST_USER_PRESETS.map((preset) => `
                <li><strong>${preset.title}</strong> - ${preset.email}</li>
            `).join('');
        }

        const passwordElement = this.document.getElementById('test-user-password');
        if (passwordElement) {
            passwordElement.textContent = TEST_USER_PASSWORD;
        }
    }

    createUserListItem(user, roles) {
        const listItem = this.document.createElement('li');
        listItem.className = 'flex justify-between items-center mb-2';

        const emailLabel = this.document.createElement('span');
        emailLabel.textContent = user.email;

        const rolesContainer = this.document.createElement('span');
        rolesContainer.className = 'mx-4';
        roles.forEach((role) => {
            rolesContainer.appendChild(this.createRoleCheckbox(user.email, role, user.roles, rolesContainer));
        });

        const buttonGroup = this.document.createElement('span');
        buttonGroup.appendChild(this.createResetPasswordButton(user.email));
        buttonGroup.appendChild(this.createDeleteAccessButton(user.email));

        listItem.appendChild(emailLabel);
        listItem.appendChild(rolesContainer);
        listItem.appendChild(buttonGroup);

        return listItem;
    }

    createRoleCheckbox(email, role, selectedRoles, rolesContainer) {
        const wrapper = this.document.createElement('span');
        wrapper.className = 'inline-flex items-center mr-2';

        const checkbox = this.document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `role-${email}-${role.key}`;
        checkbox.value = role.key;
        checkbox.checked = selectedRoles.includes(role.key);
        checkbox.addEventListener('change', async () => {
            const nextRoles = Array.from(
                rolesContainer.querySelectorAll('input[type=checkbox]:checked')
            ).map((input) => input.value);

            await this.accessManager.setRoles(email, nextRoles);
        });

        const label = this.document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = role.key;

        wrapper.appendChild(checkbox);
        wrapper.appendChild(label);

        return wrapper;
    }

    createResetPasswordButton(email) {
        const button = this.document.createElement('button');
        button.textContent = 'Reset Password';
        button.className = 'text-sm text-blue-600 mr-2 hover:underline';
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
        button.textContent = 'Delete';
        button.className = 'text-sm text-red-600 hover:underline';
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
            await this.ensureEmployeeForAccess({
                name: preset.employeeName,
                email: preset.email,
                notes: `Auto-created test ${preset.key} account`
            });
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
