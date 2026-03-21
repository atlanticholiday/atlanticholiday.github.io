export class UserManagementController {
    constructor({
        accessManager,
        roleManager,
        createAuthUser,
        sendPasswordReset,
        documentRef = document,
        windowRef = window
    }) {
        this.accessManager = accessManager;
        this.roleManager = roleManager;
        this.createAuthUser = createAuthUser;
        this.sendPasswordReset = sendPasswordReset;
        this.document = documentRef;
        this.window = windowRef;
    }

    init() {
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

        this.renderUserList(users, roles);
    }

    renderUserList(users, roles) {
        const listElement = this.document.getElementById('user-list');
        if (!listElement) return;

        listElement.innerHTML = '';

        users.forEach((user) => {
            listElement.appendChild(this.createUserListItem(user, roles));
        });
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

    setText(elementId, value) {
        const element = this.document.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }
}
