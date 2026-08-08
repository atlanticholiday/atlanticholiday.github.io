import { buildEmployeeAccessOverview } from './access-linking.js';
import { buildEffectiveAccessPreview } from './access-preview.js';
import { canonicalizeEmail } from '../../shared/email.js';
import { PRIVILEGED_ROLE_KEYS, TIME_CLOCK_STATION_ROLE } from '../../shared/access-roles.js';
import { t } from '../../core/i18n.js';
import { getAllAppAccessKeys, getAppAccessOptions, normalizeAllowedApps } from '../../shared/app-access.js';

const PRESET_ROLES = [
    { key: 'admin', title: 'Administrator' },
    { key: 'manager', title: 'Manager' },
    { key: 'supervisor', title: 'Supervisor' },
    { key: 'employee', title: 'Employee' },
    { key: TIME_CLOCK_STATION_ROLE, title: 'Time Clock Station' }
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

const PRIVILEGED_ROLE_SET = new Set(PRIVILEGED_ROLE_KEYS);

function isEmailAlreadyInUseError(error) {
    return error?.code === 'auth/email-already-in-use'
        || error?.code === 'functions/already-exists'
        || error?.code === 'already-exists';
}

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
        this.selectedUserEmail = null;
        this.directorySearchQuery = '';
        this.directoryStatusFilter = 'all';
        this.inspectorDraft = null;
        this.inspectorNotice = '';
        this.isCreateUserOpen = false;
    }

    init() {
        this.currentMainView = 'accounts';
        this.currentSideView = 'roles';
        this.isDrawerOpen = false;
        this.previewState = null;
        this.selectedUserEmail = null;
        this.directorySearchQuery = '';
        this.directoryStatusFilter = 'all';
        this.inspectorDraft = null;
        this.inspectorNotice = '';
        this.isCreateUserOpen = false;
        this.setupRolePresetInputs();
        this.setupMainViewNavigation();
        this.setupSideViewNavigation();
        this.setupDrawerControls();
        this.setupPreviewControls();
        this.setupDirectoryControls();
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
                this.renderAccessPreview();
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

        this.renderStaticUserManagementCopy();
        this.setActiveMainView(this.currentMainView);
        this.setActiveSideView(this.currentSideView);
        this.setDrawerOpen(false);
        this.setCreateUserOpen(false);
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
                if (event.key === 'Escape' && this.previewState) {
                    this.closeAccessPreview();
                    return;
                }
                if (event.key === 'Escape' && this.isCreateUserOpen) {
                    this.setCreateUserOpen(false);
                    return;
                }
                if (event.key === 'Escape' && this.document.getElementById('user-management-page')?.classList.contains('user-management-inspector-open')) {
                    this.setInspectorOpen(false);
                    return;
                }
                if (event.key === 'Escape' && this.isDrawerOpen) {
                    this.setDrawerOpen(false);
                }
            });
        }
    }

    setupPreviewControls() {
        this.document.getElementById('access-preview-close-btn')?.addEventListener('click', () => {
            this.closeAccessPreview();
        });
        this.document.getElementById('access-preview-backdrop')?.addEventListener('click', () => {
            this.closeAccessPreview();
        });
    }

    setupDirectoryControls() {
        const searchInput = this.document.getElementById('user-management-search');
        const statusFilter = this.document.getElementById('user-management-status-filter');

        searchInput?.addEventListener('input', () => {
            this.directorySearchQuery = searchInput.value.trim().toLocaleLowerCase();
            this.renderFromCachedState();
        });
        statusFilter?.addEventListener('change', () => {
            this.directoryStatusFilter = statusFilter.value || 'all';
            this.renderFromCachedState();
        });

        this.document.getElementById('open-create-user-btn')?.addEventListener('click', () => {
            this.setCreateUserOpen(true);
        });
        ['close-create-user-btn', 'cancel-create-user-btn', 'create-user-backdrop'].forEach((id) => {
            this.document.getElementById(id)?.addEventListener('click', () => {
                this.setCreateUserOpen(false);
            });
        });
        ['new-user-email', 'new-user-password'].forEach((id) => {
            this.document.getElementById(id)?.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.document.getElementById('create-user-btn')?.click();
                }
            });
        });
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

    setCreateUserOpen(isOpen) {
        this.isCreateUserOpen = Boolean(isOpen);
        const modal = this.document.getElementById('create-user-modal');
        modal?.classList.toggle('hidden', !this.isCreateUserOpen);
        modal?.setAttribute('aria-hidden', this.isCreateUserOpen ? 'false' : 'true');
        this.document.body?.classList.toggle('overflow-hidden', this.isCreateUserOpen);

        if (this.isCreateUserOpen) {
            this.setText('create-user-error', '');
            this.document.getElementById('new-user-email')?.focus?.();
        }
    }

    setInspectorOpen(isOpen) {
        const page = this.document.getElementById('user-management-page');
        page?.classList.toggle('user-management-inspector-open', Boolean(isOpen));
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
            emails.map(async (email) => {
                if (typeof this.accessManager.getAccessEntry === 'function') {
                    const entry = await this.accessManager.getAccessEntry(email);
                    if (entry) {
                        return {
                            email: entry.email || email,
                            roles: Array.isArray(entry.roles) ? entry.roles : [],
                            allowedApps: entry.allowedApps ?? null
                        };
                    }
                }

                return {
                    email,
                    roles: await this.accessManager.getRoles(email),
                    allowedApps: typeof this.accessManager.getAllowedApps === 'function'
                        ? await this.accessManager.getAllowedApps(email)
                        : null
                };
            })
        );
        const employees = await Promise.resolve(this.getEmployees());
        const employeesByEmail = new Map(
            employees
                .filter((employee) => canonicalizeEmail(employee?.email))
                .map((employee) => [canonicalizeEmail(employee.email), employee])
        );

        const employeeLinkSyncResults = await Promise.allSettled(
            users.map((user) => this.accessManager.syncEmployeeLink?.(
                user.email,
                employeesByEmail.get(canonicalizeEmail(user.email)) || null
            ))
        );

        const failedEmployeeLinkSyncs = employeeLinkSyncResults.filter((result) => result.status === 'rejected');
        if (failedEmployeeLinkSyncs.length) {
            console.warn(
                `Failed to sync ${failedEmployeeLinkSyncs.length} employee access link(s); rendering the current access directory without synced links.`,
                failedEmployeeLinkSyncs.map((result) => result.reason)
            );
        }

        this.lastUsers = users;
        this.lastRoles = roles;
        this.lastEmployees = employees;
        this.lastEmployeesByEmail = employeesByEmail;

        this.renderUserList(users, roles, employeesByEmail);
        this.renderRolesList(roles);
        this.renderAccessOverview(buildEmployeeAccessOverview(employees, users));

        if (this.previewState) {
            const previewUser = users.find((user) => canonicalizeEmail(user.email) === canonicalizeEmail(this.previewState.user.email));
            if (previewUser) {
                this.previewState = {
                    user: previewUser,
                    linkedEmployee: employeesByEmail.get(canonicalizeEmail(previewUser.email)) || null
                };
                this.renderAccessPreview();
            } else {
                this.closeAccessPreview();
            }
        }
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
            this.selectedUserEmail = null;
            this.inspectorDraft = null;
            listElement.innerHTML = `<li class="user-management-empty-state">${this.translate('userManagement.users.empty', 'No access accounts created yet.')}</li>`;
            this.updateDirectoryFilterSummary(0, 0);
            this.renderUserInspector();
            return;
        }

        const filteredUsers = users
            .slice()
            .sort((left, right) => left.email.localeCompare(right.email))
            .filter((user) => this.matchesDirectoryFilters(
                user,
                employeesByEmail.get(canonicalizeEmail(user.email)) || null
            ));

        const selectedStillExists = users.some((user) => canonicalizeEmail(user.email) === canonicalizeEmail(this.selectedUserEmail));
        if (!selectedStillExists) {
            this.selectedUserEmail = (filteredUsers[0] || users[0])?.email || null;
            this.inspectorDraft = null;
        } else {
            const selectedIsVisible = filteredUsers.some((user) => canonicalizeEmail(user.email) === canonicalizeEmail(this.selectedUserEmail));
            if (!selectedIsVisible && filteredUsers.length && !this.inspectorDraft?.dirty) {
                this.selectedUserEmail = filteredUsers[0].email;
                this.inspectorDraft = null;
                this.inspectorNotice = '';
            }
        }

        if (!filteredUsers.length) {
            listElement.innerHTML = `<li class="user-management-empty-state">${this.translate('userManagement.directory.noResults', 'No users match this search or filter.')}</li>`;
        } else {
            filteredUsers.forEach((user) => {
                const linkedEmployee = employeesByEmail.get(canonicalizeEmail(user.email)) || null;
                listElement.appendChild(this.createUserListItem(user, roles, linkedEmployee));
            });
        }

        this.updateDirectoryFilterSummary(filteredUsers.length, users.length);
        this.renderUserInspector();
    }

    matchesDirectoryFilters(user, linkedEmployee = null) {
        const query = this.directorySearchQuery || '';
        if (query) {
            const searchableText = [
                user.email,
                linkedEmployee?.name,
                ...(Array.isArray(user.roles) ? user.roles : [])
            ].filter(Boolean).join(' ').toLocaleLowerCase();
            if (!searchableText.includes(query)) return false;
        }

        const filter = this.directoryStatusFilter || 'all';
        if (filter === 'all') return true;

        const preview = buildEffectiveAccessPreview(user, { hasEmployeeLink: Boolean(linkedEmployee) });
        if (filter === 'linked') return Boolean(linkedEmployee);
        if (filter === 'standalone') return !linkedEmployee;
        if (filter === 'privileged') return preview.isPrivileged;
        if (filter === 'station') return preview.isStation;
        if (filter === 'no-apps') return preview.appScopes.length === 0;
        return true;
    }

    updateDirectoryFilterSummary(visibleCount, totalCount) {
        const summary = this.document.getElementById('user-filter-summary');
        if (!summary) return;
        summary.textContent = visibleCount === totalCount
            ? this.translate('userManagement.directory.summaryAll', `${totalCount} accounts`, { count: totalCount })
            : this.translate('userManagement.directory.summaryFiltered', `${visibleCount} of ${totalCount} accounts`, { visible: visibleCount, total: totalCount });
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
            'app-access': 'user-management-status-pill-info',
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
                <div class="text-xs text-gray-500">${this.translate('userManagement.accessOverview.appsLabel', 'Apps')}: ${this.getAccessOverviewAppsText(row)}</div>
            </article>
        `).join('');
    }

    createUserListItem(user, roles, linkedEmployee = null) {
        const listItem = this.document.createElement('li');
        const isSelected = canonicalizeEmail(user.email) === canonicalizeEmail(this.selectedUserEmail);
        const preview = buildEffectiveAccessPreview(user, { hasEmployeeLink: Boolean(linkedEmployee) });
        const statusLabel = linkedEmployee
            ? this.translate('userManagement.directory.status.linked', 'Linked')
            : this.translate('userManagement.directory.status.standalone', 'Standalone');
        const appsLabel = preview.isPrivileged
            ? this.translate('userManagement.appAccess.allShort', 'All')
            : (preview.isStation ? '—' : String(preview.appScopes.length));

        listItem.className = `user-management-user-row ${isSelected ? 'user-management-user-row-selected' : ''}`;

        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'user-management-user-row-button';
        button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        button.innerHTML = `
            <span class="user-management-user-cell">
                <strong>${this.escapeHtml(linkedEmployee?.name || this.formatEmailLabel(user.email))}</strong>
                <small>${this.escapeHtml(user.email)}</small>
            </span>
            <span class="user-management-table-cell user-management-profile-cell">${this.escapeHtml(this.getPreviewLevelLabel(preview.accessLevel))}</span>
            <span class="user-management-table-cell user-management-app-count-cell">${this.escapeHtml(appsLabel)}</span>
            <span class="user-management-table-cell user-management-status-cell"><span class="user-management-directory-status ${linkedEmployee ? 'is-linked' : 'is-standalone'}">${this.escapeHtml(statusLabel)}</span></span>
            <svg class="user-management-row-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 18 6-6-6-6" />
            </svg>
        `;
        button.addEventListener('click', () => {
            this.selectedUserEmail = user.email;
            this.inspectorDraft = null;
            this.inspectorNotice = '';
            this.renderUserList(this.lastUsers || [], this.lastRoles || roles, this.lastEmployeesByEmail || new Map());
            this.setInspectorOpen(true);
        });

        listItem.appendChild(button);

        return listItem;
    }

    renderUserInspector() {
        const container = this.document.getElementById('user-inspector-content');
        const emptyState = this.document.getElementById('user-inspector-empty');
        if (!container || !emptyState) return;

        const user = (this.lastUsers || []).find((candidate) => canonicalizeEmail(candidate.email) === canonicalizeEmail(this.selectedUserEmail));
        if (!user) {
            container.innerHTML = '';
            emptyState.hidden = false;
            return;
        }

        emptyState.hidden = true;
        const linkedEmployee = this.lastEmployeesByEmail?.get(canonicalizeEmail(user.email)) || null;
        if (!this.inspectorDraft || canonicalizeEmail(this.inspectorDraft.email) !== canonicalizeEmail(user.email)) {
            this.inspectorDraft = {
                email: user.email,
                roles: Array.isArray(user.roles) ? [...user.roles] : [],
                allowedApps: normalizeAllowedApps(user.allowedApps) || [],
                dirty: false
            };
        }

        const draftUser = {
            ...user,
            roles: [...this.inspectorDraft.roles],
            allowedApps: [...this.inspectorDraft.allowedApps]
        };
        const preview = buildEffectiveAccessPreview(draftUser, { hasEmployeeLink: Boolean(linkedEmployee) });
        const appAccessState = this.getUserAppAccessState(draftUser, linkedEmployee);
        const displayName = linkedEmployee?.name || this.formatEmailLabel(user.email);
        const roleMarkup = (this.lastRoles || []).map((role) => `
            <div class="user-management-inspector-option">
                <input id="inspector-role-${this.escapeHtml(role.key)}" type="checkbox" value="${this.escapeHtml(role.key)}" data-inspector-role ${this.inspectorDraft.roles.includes(role.key) ? 'checked' : ''}>
                <label for="inspector-role-${this.escapeHtml(role.key)}">
                    <span>${this.escapeHtml(this.getRoleDisplayTitle(role))}</span>
                    <small>${this.escapeHtml(this.getRoleDescription(role))}</small>
                </label>
            </div>
        `).join('');
        const appMarkup = getAppAccessOptions().map((appOption) => `
            <div class="user-management-app-option">
                <input id="inspector-app-${this.escapeHtml(appOption.key)}" type="checkbox" value="${this.escapeHtml(appOption.key)}" data-inspector-app ${appAccessState.selectedApps.includes(appOption.key) ? 'checked' : ''} ${appAccessState.editable ? '' : 'disabled'}>
                <label for="inspector-app-${this.escapeHtml(appOption.key)}">${this.escapeHtml(this.getAppLabel(appOption))}</label>
            </div>
        `).join('');
        const appCountLabel = preview.isPrivileged
            ? this.translate('userManagement.appAccess.all', 'All dashboard apps')
            : this.translate('userManagement.inspector.appCount', `${preview.appScopes.length} dashboard apps`, { count: preview.appScopes.length });
        const implicitReservationNote = appAccessState.editable
            && this.inspectorDraft.allowedApps.includes('reservations')
            && !this.inspectorDraft.allowedApps.includes('heatedPools')
            ? this.translate('userManagement.inspector.reservationsNote', 'Weekly Reservations also makes Heated Pools visible automatically.')
            : '';
        const appNotes = [appAccessState.note, implicitReservationNote].filter(Boolean);

        container.innerHTML = `
            <div class="user-management-inspector-header">
                <div class="user-management-inspector-identity">
                    <p class="user-management-eyebrow">${this.escapeHtml(this.translate('userManagement.inspector.eyebrow', 'Selected account'))}</p>
                    <h3>${this.escapeHtml(displayName)}</h3>
                    <p>${this.escapeHtml(user.email)}</p>
                </div>
                <button id="close-user-inspector-btn" type="button" class="user-management-icon-button user-management-inspector-close" aria-label="${this.escapeHtml(this.translate('userManagement.inspector.close', 'Close user editor'))}">
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
                <div class="user-management-inspector-summary">
                    <span>${this.escapeHtml(this.getPreviewLevelLabel(preview.accessLevel))}</span>
                    <small>${this.escapeHtml(appCountLabel)}</small>
                </div>
            </div>

            <section class="user-management-inspector-section">
                <div class="user-management-inspector-section-head">
                    <div>
                        <h4>${this.escapeHtml(this.translate('userManagement.inspector.profileTitle', 'Profile'))}</h4>
                        <p>${this.escapeHtml(this.translate('userManagement.inspector.profileDescription', 'Profiles control the core workspace and whether all apps are granted automatically.'))}</p>
                    </div>
                </div>
                <div class="user-management-inspector-role-list">${roleMarkup}</div>
            </section>

            <section class="user-management-inspector-section">
                <div class="user-management-inspector-section-head">
                    <div>
                        <h4>${this.escapeHtml(this.translate('userManagement.appAccess.title', 'App access'))}</h4>
                        <p>${this.escapeHtml(this.translate('userManagement.inspector.appsDescription', 'Choose only the operational apps this account needs.'))}</p>
                    </div>
                </div>
                <div class="user-management-inspector-app-list">${appMarkup}</div>
                ${appNotes.map((note) => `<p class="user-management-inspector-note">${this.escapeHtml(note)}</p>`).join('')}
            </section>

            <div class="user-management-inspector-savebar">
                <div>
                    <span class="user-management-save-state ${this.inspectorDraft.dirty ? 'is-dirty' : ''}">${this.escapeHtml(this.inspectorDraft.dirty ? this.translate('userManagement.inspector.unsaved', 'Unsaved changes') : this.translate('userManagement.inspector.saved', 'Access is up to date'))}</span>
                    <small id="user-inspector-notice" aria-live="polite">${this.escapeHtml(this.inspectorNotice || '')}</small>
                </div>
                <div class="user-management-inspector-primary-actions">
                    <button id="inspector-preview-btn" type="button" class="user-management-secondary-action">${this.escapeHtml(this.translate('userManagement.preview.button', 'Preview access'))}</button>
                    <button id="save-user-access-btn" type="button" class="user-management-primary-action" ${this.inspectorDraft.dirty ? '' : 'disabled'}>${this.escapeHtml(this.translate('userManagement.inspector.save', 'Save changes'))}</button>
                </div>
            </div>

            <section class="user-management-account-actions">
                <div>
                    <h4>${this.escapeHtml(this.translate('userManagement.inspector.loginTitle', 'Login access'))}</h4>
                    <p>${this.escapeHtml(linkedEmployee ? this.translate('userManagement.inspector.linkedStatus', 'Linked to a colleague record.') : this.translate('userManagement.inspector.standaloneStatus', 'Standalone login; no matching colleague email.'))}</p>
                </div>
                <div id="user-inspector-account-actions"></div>
            </section>
        `;

        container.querySelectorAll('[data-inspector-role]').forEach((input) => {
            input.addEventListener('change', () => {
                this.inspectorDraft.roles = Array.from(container.querySelectorAll('[data-inspector-role]:checked')).map((checkbox) => checkbox.value);
                this.inspectorDraft.dirty = true;
                this.inspectorNotice = '';
                this.renderUserInspector();
            });
        });
        container.querySelectorAll('[data-inspector-app]').forEach((input) => {
            input.addEventListener('change', () => {
                this.inspectorDraft.allowedApps = Array.from(container.querySelectorAll('[data-inspector-app]:checked')).map((checkbox) => checkbox.value);
                this.inspectorDraft.dirty = true;
                this.inspectorNotice = '';
                this.renderUserInspector();
            });
        });
        container.querySelector('#close-user-inspector-btn')?.addEventListener('click', () => this.setInspectorOpen(false));
        container.querySelector('#save-user-access-btn')?.addEventListener('click', () => {
            this.handleSaveSelectedUser().catch((error) => {
                console.error('Failed to save selected user:', error);
            });
        });
        container.querySelector('#inspector-preview-btn')?.addEventListener('click', (event) => {
            this.openAccessPreview(draftUser, linkedEmployee, event.currentTarget);
        });

        const accountActions = container.querySelector('#user-inspector-account-actions');
        accountActions?.appendChild(this.createResetPasswordButton(user.email));
        accountActions?.appendChild(this.createDeleteAccessButton(user.email));
    }

    async handleSaveSelectedUser() {
        if (!this.inspectorDraft?.dirty) return;
        const user = (this.lastUsers || []).find((candidate) => canonicalizeEmail(candidate.email) === canonicalizeEmail(this.inspectorDraft.email));
        if (!user) return;

        const linkedEmployee = this.lastEmployeesByEmail?.get(canonicalizeEmail(user.email)) || null;
        const nextUser = {
            ...user,
            roles: [...this.inspectorDraft.roles],
            allowedApps: [...this.inspectorDraft.allowedApps]
        };
        const nextAppState = this.getUserAppAccessState(nextUser, linkedEmployee);
        const saveButton = this.document.getElementById('save-user-access-btn');
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = this.translate('userManagement.inspector.saving', 'Saving…');
        }

        try {
            await this.accessManager.setRoles(user.email, nextUser.roles);
            if (nextAppState.editable) {
                await this.accessManager.setAllowedApps(user.email, nextUser.allowedApps);
            }
            this.inspectorDraft = null;
            this.inspectorNotice = this.translate('userManagement.inspector.savedNotice', 'Changes saved.');
            await this.refreshUserList();
        } catch (error) {
            this.inspectorNotice = error?.message || this.translate('userManagement.inspector.saveFailed', 'Changes could not be saved.');
            this.renderUserInspector();
            this.window.alert(`${this.translate('userManagement.inspector.saveFailed', 'Changes could not be saved.')}: ${error.message}`);
            throw error;
        }
    }

    createPreviewAccessButton(user, linkedEmployee = null) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.textContent = this.translate('userManagement.preview.button', 'Preview Access');
        button.className = 'user-management-button user-management-button-preview';
        button.addEventListener('click', () => {
            this.openAccessPreview(user, linkedEmployee, button);
        });
        return button;
    }

    createRoleCheckbox(user, role, rolesContainer) {
        return this.createSelectionChip({
            id: `role-${user.email}-${role.key}`,
            value: role.key,
            checked: user.roles.includes(role.key),
            label: this.getRoleDisplayTitle(role),
            onChange: async () => {
                const nextRoles = Array.from(
                    rolesContainer.querySelectorAll('input[type=checkbox]:checked')
                ).map((input) => input.value);

                await this.accessManager.setRoles(user.email, nextRoles);
                await this.refreshUserList();
            }
        });
    }

    createAppCheckbox(user, appOption, appsContainer, appAccessState) {
        return this.createSelectionChip({
            id: `app-${user.email}-${appOption.key}`,
            value: appOption.key,
            checked: appAccessState.selectedApps.includes(appOption.key),
            label: this.getAppLabel(appOption),
            disabled: !appAccessState.editable,
            onChange: async () => {
                const nextAllowedApps = Array.from(
                    appsContainer.querySelectorAll('input[type=checkbox]:checked')
                ).map((input) => input.value);

                await this.accessManager.setAllowedApps(user.email, nextAllowedApps);
                await this.refreshUserList();
            }
        });
    }

    createAccessHeading(text) {
        const heading = this.document.createElement('h3');
        heading.className = 'user-management-access-heading';
        heading.textContent = text;
        return heading;
    }

    createSelectionChip({ id, value, checked = false, label, disabled = false, onChange = async () => {} }) {
        const wrapper = this.document.createElement('div');
        wrapper.className = 'user-management-role-option';

        const checkbox = this.document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        checkbox.value = value;
        checkbox.checked = checked;
        checkbox.disabled = disabled;
        checkbox.className = 'user-management-role-checkbox';
        checkbox.addEventListener('change', async () => {
            try {
                await onChange();
            } catch (error) {
                console.error('Failed to update user access selection:', error);
                await this.refreshUserList();
                this.window.alert(`Failed to save changes: ${error.message}`);
            }
        });

        const labelElement = this.document.createElement('label');
        labelElement.htmlFor = checkbox.id;
        labelElement.className = 'user-management-role-label';
        labelElement.textContent = label;
        if (disabled) {
            labelElement.classList.add('user-management-role-label-disabled');
        }

        wrapper.appendChild(checkbox);
        wrapper.appendChild(labelElement);

        return wrapper;
    }

    getUserAppAccessState(user, linkedEmployee = null) {
        const roles = Array.isArray(user?.roles) ? user.roles : [];
        const explicitAllowedApps = normalizeAllowedApps(user?.allowedApps);
        const hasEmployeeLink = Boolean(linkedEmployee);
        const isPrivileged = roles.some((role) => PRIVILEGED_ROLE_SET.has(role));
        const isStation = roles.includes(TIME_CLOCK_STATION_ROLE);
        const isSelfServiceUser = roles.includes('employee') || hasEmployeeLink;

        if (isPrivileged) {
            return {
                editable: false,
                selectedApps: getAllAppAccessKeys(),
                note: this.translate('userManagement.appAccess.privilegedNote', 'Privileged roles keep full app access.')
            };
        }

        if (isStation) {
            return {
                editable: false,
                selectedApps: [],
                note: this.translate('userManagement.appAccess.stationNote', 'Shared station logins do not use dashboard app access.')
            };
        }

        if (explicitAllowedApps !== null) {
            return {
                editable: true,
                selectedApps: explicitAllowedApps,
                note: explicitAllowedApps.length
                    ? ''
                    : this.translate('userManagement.appAccess.emptyNote', 'No extra apps selected. This colleague keeps only time clock and self-service schedule access.')
            };
        }

        if (isSelfServiceUser) {
            return {
                editable: true,
                selectedApps: [],
                note: this.translate('userManagement.appAccess.emptyNote', 'No extra apps selected. This colleague keeps only time clock and self-service schedule access.')
            };
        }

        return {
            editable: true,
            selectedApps: [],
            note: this.translate('userManagement.appAccess.legacyNote', 'No apps are selected for this older login. Choose only the apps this person needs.')
        };
    }

    getAppLabel(appOption) {
        return this.translate(appOption.labelKey, appOption.fallbackLabel);
    }

    getAccessOverviewAppsText(row) {
        if (row.status === 'privileged') {
            return this.translate('userManagement.appAccess.all', 'All dashboard apps');
        }

        if (row.status === 'station') {
            return this.translate('userManagement.appAccess.stationSummary', 'Shared station only');
        }

        if (!Array.isArray(row.allowedApps) || row.allowedApps.length === 0) {
            return this.translate('userManagement.appAccess.none', 'No extra apps');
        }

        return row.allowedApps
            .map((appKey) => {
                const appOption = getAppAccessOptions().find((option) => option.key === appKey);
                return appOption ? this.getAppLabel(appOption) : appKey;
            })
            .join(', ');
    }

    createResetPasswordButton(email) {
        const button = this.document.createElement('button');
        button.textContent = this.translate('userManagement.users.resetPassword', 'Reset Password');
        button.className = 'user-management-button user-management-button-secondary';
        button.addEventListener('click', async () => {
            try {
                const result = await this.sendPasswordReset(email);
                await this.presentPasswordResetResult(email, result);
            } catch (error) {
                console.error(error);
                this.window.alert(`Failed to create password reset link: ${this.getPasswordResetErrorMessage(error)}`);
            }
        });

        return button;
    }

    async presentPasswordResetResult(email, result = {}) {
        const resetLink = typeof result?.resetLink === 'string' ? result.resetLink : '';

        if (resetLink) {
            let copied = false;
            const clipboard = this.window?.navigator?.clipboard;
            if (typeof clipboard?.writeText === 'function') {
                try {
                    await clipboard.writeText(resetLink);
                    copied = true;
                } catch (error) {
                    console.warn('Failed to copy password reset link:', error);
                }
            }

            const message = copied
                ? `Password reset link created for ${email}. It was copied to the clipboard. Send this link to the user so they can choose a new password.`
                : `Password reset link created for ${email}. Copy this link and send it to the user so they can choose a new password.`;

            if (typeof this.window.prompt === 'function') {
                this.window.prompt(message, resetLink);
                return;
            }

            this.window.alert(`${message}\n\n${resetLink}`);
            return;
        }

        this.window.alert(
            `Password reset requested for ${email}. `
            + `If this address is a Firebase email/password login and delivery is working, the email should arrive soon. `
            + `If nothing arrives, check spam/quarantine and verify the account plus email templates in Firebase Authentication.`
        );
    }

    getPasswordResetErrorMessage(error) {
        const authCode = error?.details?.authCode || error?.customData?._tokenResponse?.error?.message || '';
        if (authCode && (!error?.message || error.message === 'internal')) {
            return `Firebase Auth rejected the request (${authCode}).`;
        }

        if (error?.message) {
            return error.message;
        }

        return 'Unknown error.';
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

    openAccessPreview(user, linkedEmployee = null, triggerElement = null) {
        this.previewTriggerElement = triggerElement;
        this.previewState = { user, linkedEmployee };
        this.renderAccessPreview();

        const modal = this.document.getElementById('access-preview-modal');
        modal?.classList.remove('hidden');
        modal?.setAttribute('aria-hidden', 'false');
        this.document.body?.classList.add('overflow-hidden');
        this.document.getElementById('access-preview-close-btn')?.focus?.();
    }

    closeAccessPreview() {
        const modal = this.document.getElementById('access-preview-modal');
        modal?.classList.add('hidden');
        modal?.setAttribute('aria-hidden', 'true');
        this.document.body?.classList.remove('overflow-hidden');
        this.previewState = null;

        const triggerElement = this.previewTriggerElement;
        this.previewTriggerElement = null;
        triggerElement?.focus?.();
    }

    renderAccessPreview() {
        const container = this.document.getElementById('access-preview-content');
        if (!container || !this.previewState) return;

        const { user, linkedEmployee } = this.previewState;
        const preview = buildEffectiveAccessPreview(user, {
            hasEmployeeLink: Boolean(linkedEmployee)
        });
        const displayName = linkedEmployee?.name || this.formatEmailLabel(user.email);
        const roleSummary = preview.roles.length
            ? preview.roles.map((role) => this.getRoleDisplayTitle({ key: role, title: role })).join(', ')
            : this.translate('userManagement.preview.noRole', 'No role assigned');
        const surfaces = this.getPreviewSurfaces(preview);
        const appRows = preview.appScopes.map(({ key, scope }) => {
            const appOption = getAppAccessOptions().find((option) => option.key === key);
            const appLabel = appOption ? this.getAppLabel(appOption) : key;
            return `
                <details class="user-access-preview__app">
                    <summary class="user-access-preview__app-summary">
                        <span class="user-access-preview__app-name">${this.escapeHtml(appLabel)}</span>
                        <span class="user-access-preview__scope ${scope === 'manager' ? 'user-access-preview__scope-manager' : ''}">${this.escapeHtml(this.getPreviewScopeLabel(scope))}</span>
                    </summary>
                    <p class="user-access-preview__app-detail">${this.escapeHtml(this.getPreviewAppDetail(key, scope))}</p>
                </details>
            `;
        }).join('');

        container.innerHTML = `
            <div class="user-access-preview__identity">
                <div>
                    <div class="user-access-preview__name">${this.escapeHtml(displayName)}</div>
                    <div class="user-access-preview__email">${this.escapeHtml(user.email)}</div>
                    <div class="user-access-preview__email">${this.escapeHtml(this.translate('userManagement.preview.rolesLabel', 'Roles'))}: ${this.escapeHtml(roleSummary)}</div>
                </div>
                <span class="user-access-preview__level">${this.escapeHtml(this.getPreviewLevelLabel(preview.accessLevel))}</span>
            </div>

            <section class="user-access-preview__section">
                <div class="user-access-preview__section-head">
                    <h3 class="user-access-preview__section-title">${this.escapeHtml(this.translate('userManagement.preview.coreTitle', 'Core workspace'))}</h3>
                    <span class="user-access-preview__section-meta">${this.escapeHtml(this.translate('userManagement.preview.coreMeta', 'Visible immediately after sign-in'))}</span>
                </div>
                ${surfaces.length ? `<div class="user-access-preview__surface-list">${surfaces.join('')}</div>` : `<div class="user-access-preview__empty">${this.escapeHtml(this.translate('userManagement.preview.noCoreAccess', 'No time clock, schedule, or administration workspace is currently assigned.'))}</div>`}
            </section>

            <section class="user-access-preview__section">
                <div class="user-access-preview__section-head">
                    <h3 class="user-access-preview__section-title">${this.escapeHtml(this.translate('userManagement.preview.appsTitle', 'Dashboard apps'))}</h3>
                    <span class="user-access-preview__section-meta">${this.escapeHtml(this.translate('userManagement.preview.appsCount', `${preview.appScopes.length} visible`, { count: preview.appScopes.length }))} · ${this.escapeHtml(this.translate('userManagement.preview.expandHint', 'Select an app for details'))}</span>
                </div>
                ${appRows ? `<div class="user-access-preview__app-list">${appRows}</div>` : `<div class="user-access-preview__empty">${this.escapeHtml(this.translate('userManagement.preview.noApps', 'No dashboard apps selected.'))}</div>`}
            </section>

            ${this.getAccessGuideMarkup(preview)}

            <p class="user-access-preview__note">${this.escapeHtml(this.translate('userManagement.preview.note', 'This is a read-only permission preview. It does not sign in as the colleague or change their access.'))}</p>
        `;
    }

    getAccessGuideMarkup(preview) {
        const activeGuideRow = preview.accessLevel === 'admin'
            ? 'admin'
            : (preview.accessLevel === 'manager'
                ? 'privileged'
                : (preview.accessLevel === 'station'
                    ? 'station'
                    : (['employee', 'employee-with-apps'].includes(preview.accessLevel) ? 'employee' : 'app-only')));
        const rows = [
            {
                key: 'admin',
                title: this.translate('userManagement.preview.guide.roles.admin.title', 'Administrator'),
                core: this.translate('userManagement.preview.guide.roles.admin.core', 'Team time clock, full schedule, and User Management.'),
                apps: this.translate('userManagement.preview.guide.roles.admin.apps', 'Every app with its privileged view where one exists.')
            },
            {
                key: 'privileged',
                title: this.translate('userManagement.preview.guide.roles.privileged.title', 'Manager / Supervisor'),
                core: this.translate('userManagement.preview.guide.roles.privileged.core', 'Team time clock and full schedule. No User Management.'),
                apps: this.translate('userManagement.preview.guide.roles.privileged.apps', 'Every app with its privileged view where one exists.')
            },
            {
                key: 'employee',
                title: this.translate('userManagement.preview.guide.roles.employee.title', 'Employee'),
                core: this.translate('userManagement.preview.guide.roles.employee.core', 'Own time clock and read-only monthly schedule when linked to a colleague.'),
                apps: this.translate('userManagement.preview.guide.roles.employee.apps', 'Only selected apps; restricted colleague views apply in supported apps.')
            },
            {
                key: 'station',
                title: this.translate('userManagement.preview.guide.roles.station.title', 'Time Clock Station'),
                core: this.translate('userManagement.preview.guide.roles.station.core', 'Shared colleague picker for clock-in and clock-out only.'),
                apps: this.translate('userManagement.preview.guide.roles.station.apps', 'No dashboard apps. This profile overrides other roles and app selections.')
            },
            {
                key: 'app-only',
                title: this.translate('userManagement.preview.guide.roles.appOnly.title', 'Selected apps only'),
                core: this.translate('userManagement.preview.guide.roles.appOnly.core', 'No time clock or schedule without an Employee role or colleague link.'),
                apps: this.translate('userManagement.preview.guide.roles.appOnly.apps', 'Only selected apps, using the same restricted scopes as an employee.')
            }
        ];
        const currentLabel = this.translate('userManagement.preview.guide.current', 'Current');
        const profileColumn = this.translate('userManagement.preview.guide.columns.profile', 'Profile');
        const coreColumn = this.translate('userManagement.preview.guide.columns.core', 'Core workspace');
        const appsColumn = this.translate('userManagement.preview.guide.columns.apps', 'Dashboard apps');
        const rowMarkup = rows.map((row) => `
            <div class="user-access-preview__guide-row ${row.key === activeGuideRow ? 'user-access-preview__guide-row-current' : ''}">
                <div class="user-access-preview__guide-role">
                    <strong>${this.escapeHtml(row.title)}</strong>
                    ${row.key === activeGuideRow ? `<span>${this.escapeHtml(currentLabel)}</span>` : ''}
                </div>
                <p data-label="${this.escapeHtml(coreColumn)}">${this.escapeHtml(row.core)}</p>
                <p data-label="${this.escapeHtml(appsColumn)}">${this.escapeHtml(row.apps)}</p>
            </div>
        `).join('');

        return `
            <section class="user-access-preview__section user-access-preview__guide-section">
                <div class="user-access-preview__section-head">
                    <div>
                        <h3 class="user-access-preview__section-title">${this.escapeHtml(this.translate('userManagement.preview.guide.title', 'Access guide'))}</h3>
                        <p class="user-access-preview__guide-intro">${this.escapeHtml(this.translate('userManagement.preview.guide.description', 'Compare the profiles. App badges above describe what changes inside each selected app.'))}</p>
                    </div>
                </div>
                <div class="user-access-preview__guide-table">
                    <div class="user-access-preview__guide-head" aria-hidden="true">
                        <span>${this.escapeHtml(profileColumn)}</span>
                        <span>${this.escapeHtml(coreColumn)}</span>
                        <span>${this.escapeHtml(appsColumn)}</span>
                    </div>
                    ${rowMarkup}
                </div>
                <p class="user-access-preview__guide-footnote">${this.escapeHtml(this.translate('userManagement.preview.guide.footnote', 'Most apps currently have one operational view. Laundry Log, Linen Inventory, Nuki Doors, Weekly Reservations, and RNAL change what users can do according to profile.'))}</p>
            </section>
        `;
    }

    getPreviewSurfaces(preview) {
        const surfaces = [];
        if (preview.surfaces.timeClock) {
            surfaces.push(this.createPreviewSurfaceMarkup(
                this.translate('userManagement.preview.surfaces.timeClock', 'Time Clock'),
                this.getPreviewSurfaceDetail('timeClock', preview.surfaces.timeClock)
            ));
        }
        if (preview.surfaces.schedule) {
            surfaces.push(this.createPreviewSurfaceMarkup(
                this.translate('userManagement.preview.surfaces.schedule', 'Work Schedule'),
                this.getPreviewSurfaceDetail('schedule', preview.surfaces.schedule)
            ));
        }
        if (preview.surfaces.userManagement) {
            surfaces.push(this.createPreviewSurfaceMarkup(
                this.translate('userManagement.preview.surfaces.userManagement', 'User Management'),
                this.translate('userManagement.preview.surfaceDetails.userManagement', 'Can manage accounts, roles, and app access.')
            ));
        }
        return surfaces;
    }

    createPreviewSurfaceMarkup(name, detail) {
        return `
            <div class="user-access-preview__surface">
                <div>
                    <div class="user-access-preview__surface-name">${this.escapeHtml(name)}</div>
                    <div class="user-access-preview__surface-detail">${this.escapeHtml(detail)}</div>
                </div>
            </div>
        `;
    }

    getPreviewSurfaceDetail(surface, mode) {
        const details = {
            'timeClock:station': ['userManagement.preview.surfaceDetails.station', 'Shared colleague picker for clock-in and clock-out.'],
            'timeClock:manager': ['userManagement.preview.surfaceDetails.managerClock', 'Team attendance, review, and correction tools.'],
            'timeClock:self-service': ['userManagement.preview.surfaceDetails.selfClock', 'Own clock-in, breaks, clock-out, and attendance history.'],
            'schedule:full': ['userManagement.preview.surfaceDetails.fullSchedule', 'Full schedule views, planning, and vacation tools.'],
            'schedule:monthly-readonly': ['userManagement.preview.surfaceDetails.monthlySchedule', 'Read-only monthly schedule for the linked colleague.']
        };
        const [key, fallback] = details[`${surface}:${mode}`] || ['', mode];
        return key ? this.translate(key, fallback) : fallback;
    }

    getPreviewScopeLabel(scope) {
        const scopes = {
            manager: ['userManagement.preview.scopes.manager', 'Full management'],
            standard: ['userManagement.preview.scopes.standard', 'Standard app access'],
            'colleague-workflow': ['userManagement.preview.scopes.colleagueWorkflow', 'Colleague workflow'],
            'operator-only': ['userManagement.preview.scopes.operatorOnly', 'Operator access'],
            'own-records': ['userManagement.preview.scopes.ownRecords', 'Own records only']
        };
        const [key, fallback] = scopes[scope] || scopes.standard;
        return this.translate(key, fallback);
    }

    getPreviewAppDetail(appKey, scope) {
        const specialDetails = {
            laundryLog: {
                manager: ['userManagement.preview.appDetails.laundryLog.manager', 'Can review the team log and use manager controls, including deletion.'],
                'colleague-workflow': ['userManagement.preview.appDetails.laundryLog.colleague', 'Can record colleague entries. Manager review and deletion controls are hidden.']
            },
            linenInventory: {
                manager: ['userManagement.preview.appDetails.linenInventory.manager', 'Can review team submissions and use manager controls, including deletion.'],
                'colleague-workflow': ['userManagement.preview.appDetails.linenInventory.colleague', 'Can submit inventory entries. Manager review and deletion controls are hidden.']
            },
            nukiDoors: {
                manager: ['userManagement.preview.appDetails.nukiDoors.manager', 'Can use door operations and privileged configuration or management controls.'],
                'operator-only': ['userManagement.preview.appDetails.nukiDoors.operator', 'Can use available door operations. Configuration and management controls are hidden.']
            },
            reservations: {
                manager: ['userManagement.preview.appDetails.reservations.manager', 'Can view and work with all reservation records.'],
                'own-records': ['userManagement.preview.appDetails.reservations.own', 'Can create and view only reservation records attributed to this account. Heated Pools is also shown automatically.']
            },
            rnal: {
                manager: ['userManagement.preview.appDetails.rnal.manager', 'Can view and work with all RNAL records.'],
                'own-records': ['userManagement.preview.appDetails.rnal.own', 'Can create and view only RNAL records attributed to this account.']
            },
            heatedPools: {
                standard: ['userManagement.preview.appDetails.heatedPools.standard', 'Opens the standard Heated Pools workspace. It is also granted automatically with Weekly Reservations.']
            },
            staff: {
                standard: ['userManagement.preview.appDetails.staff.standard', 'Opens the Staff operational workspace. This does not grant access to User Management.']
            }
        };
        const [key, fallback] = specialDetails[appKey]?.[scope]
            || (scope === 'manager'
                ? ['userManagement.preview.appDetails.generic.manager', 'Opens the app for team operations. This app currently has no separate manager-only view.']
                : ['userManagement.preview.appDetails.generic.standard', 'Opens the app’s standard operational workspace. This app currently has no separate colleague and manager views.']);
        return this.translate(key, fallback);
    }

    getPreviewLevelLabel(accessLevel) {
        const levels = {
            admin: ['userManagement.preview.levels.admin', 'Administrator'],
            manager: ['userManagement.preview.levels.manager', 'Privileged manager'],
            station: ['userManagement.preview.levels.station', 'Shared station'],
            employee: ['userManagement.preview.levels.employee', 'Employee self-service'],
            'employee-with-apps': ['userManagement.preview.levels.employeeWithApps', 'Employee + selected apps'],
            'app-only': ['userManagement.preview.levels.appOnly', 'Selected apps only'],
            'no-workspace': ['userManagement.preview.levels.noWorkspace', 'No workspace assigned']
        };
        const [key, fallback] = levels[accessLevel] || levels['no-workspace'];
        return this.translate(key, fallback);
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    renderStaticUserManagementCopy() {
        // Static copy is rendered through data-i18n attributes.
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
            'app-access': 'userManagement.accessOverview.status.appAccess',
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
            'app-access': 'userManagement.accessOverview.help.appAccess',
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
        let reusedExistingAuthUser = false;

        this.setText('create-user-error', '');

        if (!email) {
            this.setText('create-user-error', 'Please enter a valid email address.');
            return;
        }

        if (!password || password.length < 12) {
            this.setText('create-user-error', 'Use a temporary password with at least 12 characters.');
            return;
        }

        try {
            await this.createAuthUser(email, password);
        } catch (error) {
            if (!isEmailAlreadyInUseError(error)) {
                throw error;
            }

            reusedExistingAuthUser = true;
        }

        await this.accessManager.addEmail(email, { allowedApps: [] });

        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        this.selectedUserEmail = email;
        this.inspectorDraft = null;
        this.inspectorNotice = reusedExistingAuthUser
            ? this.translate('userManagement.create.existingNotice', 'This login already existed. Access was restored, but its password was not changed.')
            : this.translate('userManagement.create.createdNotice', 'Access account created. Assign a profile and apps, then save.');
        await this.refreshUserList();
        this.setCreateUserOpen(false);
        this.setInspectorOpen(true);
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
