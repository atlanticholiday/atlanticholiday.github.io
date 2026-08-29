import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    updateDoc,
    where
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';
import { t } from '../../core/i18n.js';
import {
    TASK_PRIORITIES,
    TASK_STATUS,
    extractLinks,
    filterTasks,
    getDueDateState,
    groupTasksBySection,
    initials,
    isPreviewableAttachment,
    normalizeTaskRecord
} from './task-utils.js';

const DEPARTMENT_COLORS = ['#8b5cf6', '#f59e0b', '#ef5b6c', '#22a06b', '#3b82f6', '#a855f7', '#0ea5e9', '#eab308'];

function translate(key, fallback, replacements = {}) {
    const value = t(key, replacements);
    return value && value !== key ? value : fallback;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function nowIso() {
    return new Date().toISOString();
}

function formatFileSize(size = 0) {
    const bytes = Number(size) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeUrl(value = '') {
    try {
        const url = new URL(String(value));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch {
        return '';
    }
}

function icon(name, className = '') {
    const paths = {
        back: '<path d="M15 18l-6-6 6-6"/>',
        menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
        board: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="10" rx="1"/>',
        files: '<path d="M4 4h6l2 3h8v13H4z"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
        paperclip: '<path d="m21 11-8.5 8.5a6 6 0 0 1-8.5-8.5l9-9a4 4 0 0 1 5.5 5.5l-9 9a2 2 0 0 1-3-3l8.5-8.5"/>',
        message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
        x: '<path d="M6 6l12 12M18 6 6 18"/>',
        trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
        upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v4h16v-4"/>',
        external: '<path d="M14 3h7v7M10 14 21 3M21 14v6H4V3h6"/>',
        chevron: '<path d="m9 18 6-6-6-6"/>',
        tasks: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 8 1.5 1.5L12 7M14 9h3M8 14l1.5 1.5L12 13M14 15h3"/>'
    };
    return `<svg class="${escapeHtml(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export class TaskManager {
    constructor({ db, dataManager, uploadAttachment, deleteAttachment, rootId = 'tasks-page' }) {
        this.db = db;
        this.dataManager = dataManager;
        this.uploadAttachment = uploadAttachment;
        this.deleteAttachment = deleteAttachment;
        this.rootId = rootId;
        this.user = null;
        this.tasks = [];
        this.departments = [];
        this.selectedScope = 'my';
        this.selectedDepartmentId = '';
        this.view = 'list';
        this.searchQuery = '';
        this.hideCompleted = false;
        this.selectedTaskId = null;
        this.pendingFiles = [];
        this.comments = [];
        this.unsubscribeTasks = null;
        this.unsubscribeDepartments = null;
        this.unsubscribeComments = null;
        this.unsubscribeData = null;
        this.started = false;
        this.bound = false;
    }

    init() {
        this.root = document.getElementById(this.rootId);
        if (!this.root || this.bound) return;
        this.bound = true;
        this.root.innerHTML = this.shellTemplate();
        this.root.addEventListener('click', (event) => this.handleClick(event));
        this.root.addEventListener('input', (event) => this.handleInput(event));
        this.root.addEventListener('change', (event) => this.handleChange(event));
        window.addEventListener('languageChanged', () => this.render());
        this.unsubscribeData = this.dataManager?.subscribeToDataChanges?.(() => {
            if (this.started) this.render();
        });
        this.render();
    }

    setUser(user) {
        this.stopListening();
        this.user = user?.uid ? { uid: user.uid, email: user.email || '' } : null;
        this.tasks = [];
        this.comments = [];
        this.selectedTaskId = null;
        this.pendingFiles = [];
        this.started = false;
        this.render();
    }

    open() {
        this.init();
        if (!this.user || this.started) {
            this.render();
            return;
        }
        this.started = true;
        this.startListening();
    }

    stopListening() {
        [this.unsubscribeTasks, this.unsubscribeDepartments, this.unsubscribeComments].forEach((unsubscribe) => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        this.unsubscribeTasks = null;
        this.unsubscribeDepartments = null;
        this.unsubscribeComments = null;
    }

    startListening() {
        if (!this.user) return;
        this.unsubscribeDepartments = onSnapshot(collection(this.db, 'taskDepartments'), (snapshot) => {
            this.departments = snapshot.docs
                .map((entry) => ({ id: entry.id, ...entry.data() }))
                .sort((left, right) => (left.order || 0) - (right.order || 0) || String(left.name).localeCompare(String(right.name)));
            if (!this.selectedDepartmentId && this.selectedScope === 'department' && this.departments[0]) {
                this.selectedDepartmentId = this.departments[0].id;
            }
            this.render();
        }, (error) => this.showError(error));

        const employee = this.getCurrentEmployee();
        const taskCollection = collection(this.db, 'tasks');
        if (!this.isManager() && !employee?.id) {
            this.tasks = [];
            this.render();
            return;
        }
        const taskQuery = this.isManager()
            ? taskCollection
            : query(taskCollection, where('assigneeIds', 'array-contains', employee.id));
        this.unsubscribeTasks = onSnapshot(taskQuery, (snapshot) => {
            this.tasks = snapshot.docs.map((entry) => normalizeTaskRecord({ id: entry.id, ...entry.data() }));
            this.render();
            if (this.selectedTaskId && !this.tasks.some((task) => task.id === this.selectedTaskId)) {
                this.closeTask();
            }
        }, (error) => this.showError(error));
    }

    isManager() {
        return Boolean(this.dataManager?.hasPrivilegedRole?.());
    }

    getCurrentEmployee() {
        return this.dataManager?.getCurrentUserEmployee?.() || null;
    }

    canCreateTask() {
        return Boolean(this.user && (this.isManager() || this.getCurrentEmployee()?.id));
    }

    canEditTask(task) {
        const employeeId = this.getCurrentEmployee()?.id;
        return this.isManager() || Boolean(employeeId && task?.assigneeIds?.includes(employeeId));
    }

    shellTemplate() {
        return `
            <div class="task-app">
                <button class="task-mobile-scrim" type="button" data-task-action="toggle-sidebar" aria-label="Close menu"></button>
                <aside class="task-sidebar" aria-label="Task navigation">
                    <div class="task-sidebar__brand">
                        <span class="task-sidebar__logo">${icon('tasks')}</span>
                        <div><strong>Atlantic Tasks</strong><small>${translate('tasks.workspace', 'Team workspace')}</small></div>
                        <button type="button" class="task-icon-button task-sidebar__mobile-close" data-task-action="toggle-sidebar" aria-label="${escapeHtml(translate('common.close', 'Close'))}">${icon('x')}</button>
                    </div>
                    <nav class="task-sidebar__nav">
                        <button type="button" data-task-action="select-my" data-task-scope="my">
                            <span class="task-nav-icon task-nav-icon--my">${icon('check')}</span>
                            <span>${translate('tasks.myTasks', 'My tasks')}</span>
                            <strong data-task-my-count>0</strong>
                        </button>
                    </nav>
                    <div class="task-sidebar__section-heading">
                        <span>${translate('tasks.departments', 'Departments')}</span>
                        <button type="button" data-task-action="add-department" aria-label="${escapeHtml(translate('tasks.addDepartment', 'Add department'))}">${icon('plus')}</button>
                    </div>
                    <nav class="task-sidebar__departments" data-task-departments></nav>
                    <div class="task-sidebar__footer">
                        <button type="button" data-task-action="back">${icon('back')}<span>${translate('tasks.allApps', 'All apps')}</span></button>
                        <button type="button" data-task-action="sign-out">${icon('external')}<span>${translate('common.signOut', 'Sign out')}</span></button>
                    </div>
                </aside>
                <main class="task-workspace">
                    <header class="task-topbar">
                        <button type="button" class="task-icon-button task-mobile-menu" data-task-action="toggle-sidebar" aria-label="Open menu">${icon('menu')}</button>
                        <label class="task-global-search">
                            ${icon('search')}
                            <input type="search" data-task-search placeholder="${escapeHtml(translate('tasks.search', 'Search tasks'))}" autocomplete="off">
                            <kbd>Ctrl K</kbd>
                        </label>
                        <div class="task-topbar__actions">
                            <button type="button" class="task-create-button" data-task-action="new-task">${icon('plus')}<span>${translate('tasks.newTask', 'New task')}</span></button>
                            <span class="task-user-avatar" data-task-current-avatar>?</span>
                        </div>
                    </header>
                    <section class="task-project-header" data-task-project-header></section>
                    <nav class="task-view-tabs" aria-label="Task views">
                        <button type="button" data-task-action="set-view" data-view="list">${icon('list')}<span>${translate('tasks.list', 'List')}</span></button>
                        <button type="button" data-task-action="set-view" data-view="board">${icon('board')}<span>${translate('tasks.board', 'Board')}</span></button>
                        <button type="button" data-task-action="set-view" data-view="files">${icon('files')}<span>${translate('tasks.files', 'Files')}</span></button>
                    </nav>
                    <div class="task-toolbar">
                        <label><input type="checkbox" data-task-hide-completed> <span>${translate('tasks.hideCompleted', 'Hide completed')}</span></label>
                        <span data-task-result-count></span>
                    </div>
                    <section class="task-canvas" data-task-canvas aria-live="polite"></section>
                </main>
                <aside class="task-detail" data-task-detail aria-hidden="true"></aside>
                <div class="task-toast" data-task-toast role="status"></div>
            </div>
        `;
    }

    render() {
        if (!this.root || !this.bound) return;
        this.renderSidebar();
        this.renderHeader();
        this.renderCanvas();
        const avatar = this.root.querySelector('[data-task-current-avatar]');
        const employee = this.getCurrentEmployee();
        if (avatar) {
            avatar.textContent = initials(employee?.name || this.user?.email || 'User');
            avatar.title = employee?.name || this.user?.email || '';
        }
        const newTaskButton = this.root.querySelector('[data-task-action="new-task"]');
        if (newTaskButton) newTaskButton.disabled = !this.canCreateTask();
    }

    renderSidebar() {
        const container = this.root.querySelector('[data-task-departments]');
        if (!container) return;
        const myCount = this.tasks.filter((task) => task.assigneeIds.includes(this.getCurrentEmployee()?.id)).length;
        const count = this.root.querySelector('[data-task-my-count]');
        if (count) count.textContent = String(myCount);
        const myButton = this.root.querySelector('[data-task-scope="my"]');
        myButton?.classList.toggle('is-active', this.selectedScope === 'my');

        const visibleDepartments = this.getDepartmentsForUi();
        container.innerHTML = visibleDepartments.map((department, index) => {
            const departmentCount = this.tasks.filter((task) => task.departmentId === department.id).length;
            const isActive = this.selectedScope === 'department' && this.selectedDepartmentId === department.id;
            return `
                <button type="button" class="${isActive ? 'is-active' : ''}" data-task-action="select-department" data-department-id="${escapeHtml(department.id)}">
                    <span class="task-department-mark" style="--department-color:${escapeHtml(department.color || DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length])}">${initials(department.name)}</span>
                    <span>${escapeHtml(department.name || translate('tasks.unnamedDepartment', 'Unnamed'))}</span>
                    <strong>${departmentCount}</strong>
                </button>
            `;
        }).join('');
        const addButton = this.root.querySelector('[data-task-action="add-department"]');
        if (addButton) addButton.hidden = !this.isManager();
    }

    getSelectedDepartment() {
        return this.getDepartmentsForUi().find((department) => department.id === this.selectedDepartmentId) || null;
    }

    getDepartmentsForUi() {
        const departments = [...this.departments];
        if (!departments.some((department) => department.id === 'general')) {
            departments.unshift({ id: 'general', name: translate('tasks.general', 'General'), color: '#8b5cf6', order: -1 });
        }
        return departments;
    }

    renderHeader() {
        const header = this.root.querySelector('[data-task-project-header]');
        if (!header) return;
        const employee = this.getCurrentEmployee();
        const department = this.getSelectedDepartment();
        const isMyTasks = this.selectedScope === 'my';
        const title = isMyTasks ? translate('tasks.myTasks', 'My tasks') : (department?.name || translate('tasks.departments', 'Departments'));
        const subtitle = isMyTasks
            ? translate('tasks.myTasksSubtitle', 'Everything assigned to you, across every department.')
            : translate('tasks.departmentSubtitle', 'Plan, assign and follow the department’s work.');
        const color = isMyTasks ? '#ef5b6c' : (department?.color || '#8b5cf6');
        header.innerHTML = `
            <div class="task-project-heading">
                <span class="task-project-icon" style="--project-color:${escapeHtml(color)}">${isMyTasks ? icon('check') : escapeHtml(initials(title))}</span>
                <div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
            </div>
            ${!isMyTasks && this.isManager() && department && department.id !== 'general' ? `<button type="button" class="task-quiet-button task-delete-department" data-task-action="delete-department" data-department-id="${escapeHtml(department.id)}">${icon('trash')}<span>${translate('tasks.deleteDepartment', 'Delete department')}</span></button>` : ''}
        `;
        this.root.querySelectorAll('[data-task-action="set-view"]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.view === this.view);
        });
    }

    getVisibleTasks() {
        const employee = this.getCurrentEmployee();
        return filterTasks(this.tasks, {
            departmentId: this.selectedScope === 'department' ? this.selectedDepartmentId : '',
            employeeId: this.selectedScope === 'my' ? employee?.id || '__unlinked__' : '',
            query: this.searchQuery,
            hideCompleted: this.hideCompleted
        });
    }

    renderCanvas() {
        const canvas = this.root.querySelector('[data-task-canvas]');
        if (!canvas) return;
        const visibleTasks = this.getVisibleTasks();
        const resultCount = this.root.querySelector('[data-task-result-count]');
        if (resultCount) resultCount.textContent = translate('tasks.taskCount', `${visibleTasks.length} tasks`, { count: visibleTasks.length });

        if (!this.getCurrentEmployee() && !this.isManager()) {
            canvas.innerHTML = this.emptyTemplate('link');
            return;
        }
        if (!visibleTasks.length) {
            canvas.innerHTML = this.emptyTemplate(this.searchQuery ? 'search' : 'tasks');
            return;
        }
        if (this.view === 'board') canvas.innerHTML = this.boardTemplate(visibleTasks);
        else if (this.view === 'files') canvas.innerHTML = this.filesTemplate(visibleTasks);
        else canvas.innerHTML = this.listTemplate(visibleTasks);
    }

    emptyTemplate(kind) {
        const copy = {
            link: [translate('tasks.linkRequired', 'Link this login to a colleague'), translate('tasks.linkRequiredDescription', 'An administrator needs to connect your access account to your staff profile before personal tasks can appear.')],
            search: [translate('tasks.noSearchResults', 'No matching tasks'), translate('tasks.noSearchResultsDescription', 'Try another word or clear the search.')],
            tasks: [translate('tasks.emptyTitle', 'A clear workspace'), translate('tasks.emptyDescription', 'Create the first task here, add a due date, and assign it to a colleague.')]
        }[kind];
        return `<div class="task-empty"><span>${icon(kind === 'search' ? 'search' : 'tasks')}</span><h2>${escapeHtml(copy[0])}</h2><p>${escapeHtml(copy[1])}</p>${kind === 'tasks' && this.canCreateTask() ? `<button type="button" data-task-action="new-task">${icon('plus')}${translate('tasks.newTask', 'New task')}</button>` : ''}</div>`;
    }

    listTemplate(tasks) {
        return `<div class="task-list">
            <div class="task-list__columns"><span>${translate('tasks.taskName', 'Task')}</span><span>${translate('tasks.assignee', 'Assignee')}</span><span>${translate('tasks.dueDate', 'Due date')}</span><span>${translate('tasks.priority', 'Priority')}</span></div>
            ${groupTasksBySection(tasks).map((group) => `
                <section class="task-section">
                    <div class="task-section__heading"><span>${icon('chevron')}</span><h2>${escapeHtml(group.name)}</h2><small>${group.tasks.length}</small></div>
                    ${group.tasks.map((task) => this.taskRowTemplate(task)).join('')}
                    ${this.canCreateTask() ? `<button type="button" class="task-add-row" data-task-action="new-task" data-section="${escapeHtml(group.name)}">${icon('plus')}<span>${translate('tasks.addTask', 'Add task')}</span></button>` : ''}
                </section>
            `).join('')}
        </div>`;
    }

    taskRowTemplate(task) {
        const dueState = task.status === TASK_STATUS.DONE ? 'done' : getDueDateState(task.dueDate);
        return `<article class="task-row ${task.status === TASK_STATUS.DONE ? 'is-done' : ''}" data-task-action="open-task" data-task-id="${escapeHtml(task.id)}" tabindex="0">
            <span class="task-row__title"><button type="button" class="task-complete-button" data-task-action="toggle-task" data-task-id="${escapeHtml(task.id)}" aria-label="${escapeHtml(translate('tasks.toggleComplete', 'Toggle complete'))}">${task.status === TASK_STATUS.DONE ? icon('check') : ''}</button><strong>${escapeHtml(task.title)}</strong>${task.attachments.length ? `<small>${icon('paperclip')}${task.attachments.length}</small>` : ''}</span>
            <span class="task-row__assignees">${this.assigneesTemplate(task.assignees)}</span>
            <span class="task-row__due task-due--${dueState}">${task.dueDate ? `${icon('calendar')}${escapeHtml(this.formatDate(task.dueDate))}` : '—'}</span>
            <span><em class="task-priority task-priority--${escapeHtml(task.priority)}">${escapeHtml(this.priorityLabel(task.priority))}</em></span>
        </article>`;
    }

    boardTemplate(tasks) {
        const columns = [
            [TASK_STATUS.TODO, translate('tasks.todo', 'To do')],
            [TASK_STATUS.IN_PROGRESS, translate('tasks.inProgress', 'In progress')],
            [TASK_STATUS.DONE, translate('tasks.done', 'Done')]
        ];
        return `<div class="task-board">${columns.map(([status, label]) => {
            const columnTasks = tasks.filter((task) => task.status === status);
            return `<section class="task-board__column task-board__column--${status}"><header><span></span><h2>${escapeHtml(label)}</h2><small>${columnTasks.length}</small></header><div>${columnTasks.map((task) => `<article data-task-action="open-task" data-task-id="${escapeHtml(task.id)}" tabindex="0"><div><button type="button" class="task-complete-button" data-task-action="toggle-task" data-task-id="${escapeHtml(task.id)}">${task.status === TASK_STATUS.DONE ? icon('check') : ''}</button><strong>${escapeHtml(task.title)}</strong></div><p>${escapeHtml(task.description || translate('tasks.noDescription', 'No description'))}</p><footer><span>${this.assigneesTemplate(task.assignees)}</span><time class="task-due--${getDueDateState(task.dueDate)}">${task.dueDate ? escapeHtml(this.formatDate(task.dueDate)) : ''}</time></footer></article>`).join('') || `<p class="task-board__empty">${translate('tasks.noTasksHere', 'No tasks here')}</p>`}</div></section>`;
        }).join('')}</div>`;
    }

    filesTemplate(tasks) {
        const files = tasks.flatMap((task) => task.attachments.map((attachment) => ({ ...attachment, taskId: task.id, taskTitle: task.title })));
        if (!files.length) return this.emptyTemplate('tasks').replace(translate('tasks.emptyTitle', 'A clear workspace'), translate('tasks.noFiles', 'No files yet'));
        return `<div class="task-files-grid">${files.map((file) => {
            const url = safeUrl(file.url);
            const preview = isPreviewableAttachment(file) && String(file.contentType).startsWith('image/')
                ? `<img src="${escapeHtml(url)}" alt="">`
                : `<span>${icon(String(file.contentType).startsWith('video/') ? 'files' : 'paperclip')}</span>`;
            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><div class="task-file-preview">${preview}</div><strong>${escapeHtml(file.name || 'File')}</strong><small>${escapeHtml(file.taskTitle)} · ${formatFileSize(file.size)}</small></a>`;
        }).join('')}</div>`;
    }

    assigneesTemplate(assignees = []) {
        if (!assignees.length) return `<span class="task-unassigned">${translate('tasks.unassigned', 'Unassigned')}</span>`;
        return `<span class="task-avatar-stack">${assignees.slice(0, 3).map((assignee) => `<i title="${escapeHtml(assignee.name)}">${escapeHtml(initials(assignee.name))}</i>`).join('')}${assignees.length > 3 ? `<b>+${assignees.length - 3}</b>` : ''}</span><span class="task-assignee-name">${escapeHtml(assignees[0].name)}${assignees.length > 1 ? ` +${assignees.length - 1}` : ''}</span>`;
    }

    openTask(taskId = null, defaults = {}) {
        const task = taskId ? this.tasks.find((entry) => entry.id === taskId) : null;
        if (taskId && !task) return;
        this.selectedTaskId = taskId;
        this.pendingFiles = [];
        this.comments = [];
        if (taskId) this.listenForComments(taskId);
        this.renderDetail(task || {
            id: '',
            title: '',
            description: '',
            departmentId: this.selectedScope === 'department' ? this.selectedDepartmentId : (this.getCurrentEmployee()?.department || 'general'),
            departmentName: this.getSelectedDepartment()?.name || translate('tasks.general', 'General'),
            section: defaults.section || translate('tasks.general', 'General'),
            status: TASK_STATUS.TODO,
            priority: 'normal',
            dueDate: '',
            assigneeIds: this.isManager() ? [] : [this.getCurrentEmployee()?.id].filter(Boolean),
            assignees: this.isManager() ? [] : [{ id: this.getCurrentEmployee()?.id, name: this.getCurrentEmployee()?.name }].filter((entry) => entry.id),
            attachments: []
        });
    }

    renderDetail(task) {
        const panel = this.root.querySelector('[data-task-detail]');
        if (!panel) return;
        const normalized = normalizeTaskRecord(task);
        const canEdit = !normalized.id ? this.canCreateTask() : this.canEditTask(normalized);
        const employees = this.dataManager?.getActiveEmployees?.() || [];
        const links = extractLinks(normalized.description);
        panel.innerHTML = `
            <div class="task-detail__topbar">
                <button type="button" class="task-complete-main ${normalized.status === TASK_STATUS.DONE ? 'is-done' : ''}" data-task-action="detail-toggle" ${canEdit ? '' : 'disabled'}>${icon('check')}<span>${normalized.status === TASK_STATUS.DONE ? translate('tasks.completed', 'Completed') : translate('tasks.markComplete', 'Mark complete')}</span></button>
                <div>${normalized.id && this.isManager() ? `<button type="button" class="task-icon-button" data-task-action="delete-task" aria-label="${escapeHtml(translate('common.delete', 'Delete'))}">${icon('trash')}</button>` : ''}<button type="button" class="task-icon-button" data-task-action="close-detail" aria-label="${escapeHtml(translate('common.close', 'Close'))}">${icon('x')}</button></div>
            </div>
            <div class="task-detail__scroll">
                <input class="task-detail__title" data-task-field="title" value="${escapeHtml(normalized.id ? normalized.title : '')}" placeholder="${escapeHtml(translate('tasks.taskTitlePlaceholder', 'Task name'))}" ${canEdit ? '' : 'disabled'}>
                <div class="task-detail__metadata">
                    <div class="task-metadata-field task-assignee-field">
                        <span>${translate('tasks.assignee', 'Assignee')}</span>
                        <div class="task-assignee-control" data-task-assignee-control>
                            <button type="button" class="task-assignee-trigger" data-task-action="toggle-assignee-picker" aria-expanded="false" ${this.isManager() ? '' : 'disabled'}>
                                <span data-task-assignee-summary>${this.assigneeSummaryTemplate(normalized.assignees)}</span>
                                ${icon('chevron')}
                            </button>
                            <div class="task-assignee-picker" data-task-assignee-picker hidden>${employees.map((employee) => `<label><input type="checkbox" data-task-assignee value="${escapeHtml(employee.id)}" ${normalized.assigneeIds.includes(employee.id) ? 'checked' : ''} ${this.isManager() ? '' : 'disabled'}><i>${escapeHtml(initials(employee.name))}</i><span>${escapeHtml(employee.name)}</span></label>`).join('') || `<p>${translate('tasks.noColleagues', 'No colleagues available')}</p>`}</div>
                        </div>
                    </div>
                    <label><span>${translate('tasks.dueDate', 'Due date')}</span><input type="date" data-task-field="dueDate" value="${escapeHtml(normalized.dueDate)}" ${canEdit ? '' : 'disabled'}></label>
                    <label><span>${translate('tasks.department', 'Department')}</span><select data-task-field="departmentId" ${this.isManager() ? '' : 'disabled'}>${this.departmentOptions(normalized.departmentId)}</select></label>
                    <label><span>${translate('tasks.section', 'Section')}</span><input data-task-field="section" value="${escapeHtml(normalized.section)}" ${canEdit ? '' : 'disabled'}></label>
                    <label><span>${translate('tasks.priority', 'Priority')}</span><select data-task-field="priority" ${canEdit ? '' : 'disabled'}>${TASK_PRIORITIES.map((priority) => `<option value="${priority}" ${priority === normalized.priority ? 'selected' : ''}>${escapeHtml(this.priorityLabel(priority))}</option>`).join('')}</select></label>
                    <label><span>${translate('common.status', 'Status')}</span><select data-task-field="status" ${canEdit ? '' : 'disabled'}><option value="todo" ${normalized.status === 'todo' ? 'selected' : ''}>${translate('tasks.todo', 'To do')}</option><option value="inProgress" ${normalized.status === 'inProgress' ? 'selected' : ''}>${translate('tasks.inProgress', 'In progress')}</option><option value="done" ${normalized.status === 'done' ? 'selected' : ''}>${translate('tasks.done', 'Done')}</option></select></label>
                </div>
                <section class="task-detail__section"><h2>${translate('tasks.description', 'Description')}</h2><textarea data-task-field="description" placeholder="${escapeHtml(translate('tasks.descriptionPlaceholder', 'Add details, instructions, or paste a link…'))}" ${canEdit ? '' : 'disabled'}>${escapeHtml(normalized.description)}</textarea>${links.length ? `<div class="task-detail__links">${links.map((link) => `<a href="${escapeHtml(safeUrl(link))}" target="_blank" rel="noopener noreferrer">${icon('external')}<span>${escapeHtml(link)}</span></a>`).join('')}</div>` : ''}</section>
                <section class="task-detail__section"><div class="task-detail__section-heading"><h2>${translate('tasks.attachments', 'Attachments')}</h2>${canEdit ? `<button type="button" data-task-action="attach-file">${icon('paperclip')}${translate('tasks.addAttachment', 'Add')}</button><input type="file" data-task-file-input multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" hidden>` : ''}</div><div class="task-attachments">${this.attachmentsTemplate(normalized, canEdit)}</div><p class="task-upload-status" data-task-upload-status></p></section>
                ${normalized.id ? `<section class="task-detail__section task-comments"><h2>${translate('tasks.activity', 'Activity')}</h2><div data-task-comments>${this.commentsTemplate()}</div>${this.user ? `<div class="task-comment-box"><span>${escapeHtml(initials(this.getCurrentEmployee()?.name || this.user.email))}</span><textarea data-task-comment placeholder="${escapeHtml(translate('tasks.commentPlaceholder', 'Write a comment…'))}"></textarea><button type="button" data-task-action="add-comment">${translate('tasks.comment', 'Comment')}</button></div>` : ''}</section>` : ''}
            </div>
            <footer class="task-detail__footer"><span data-task-save-status></span><button type="button" class="task-save-button" data-task-action="save-task" ${canEdit ? '' : 'disabled'}>${normalized.id ? translate('common.save', 'Save') : translate('tasks.createTask', 'Create task')}</button></footer>
        `;
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        this.root.querySelector('.task-app')?.classList.add('has-detail-open');
        setTimeout(() => panel.querySelector('[data-task-field="title"]')?.focus(), 20);
    }

    departmentOptions(selectedId) {
        const departments = this.getDepartmentsForUi();
        return departments.map((department) => `<option value="${escapeHtml(department.id)}" ${department.id === selectedId ? 'selected' : ''}>${escapeHtml(department.name)}</option>`).join('');
    }

    assigneeSummaryTemplate(assignees = []) {
        if (!assignees.length) {
            return `<span class="task-assignee-summary-empty">${translate('tasks.unassigned', 'Unassigned')}</span>`;
        }
        const visibleNames = assignees.slice(0, 2).map((assignee) => assignee.name).join(', ');
        return `<span class="task-assignee-summary-avatars">${assignees.slice(0, 3).map((assignee) => `<i>${escapeHtml(initials(assignee.name))}</i>`).join('')}</span><span class="task-assignee-summary-name">${escapeHtml(visibleNames)}${assignees.length > 2 ? ` +${assignees.length - 2}` : ''}</span>`;
    }

    updateAssigneeSummary() {
        const panel = this.root?.querySelector('[data-task-detail]');
        const summary = panel?.querySelector('[data-task-assignee-summary]');
        if (!summary) return;
        const selectedIds = Array.from(panel.querySelectorAll('[data-task-assignee]:checked')).map((input) => input.value);
        const assignees = (this.dataManager?.getActiveEmployees?.() || [])
            .filter((employee) => selectedIds.includes(employee.id))
            .map((employee) => ({ id: employee.id, name: employee.name }));
        summary.innerHTML = this.assigneeSummaryTemplate(assignees);
    }

    closeAssigneePicker() {
        const picker = this.root?.querySelector('[data-task-assignee-picker]');
        const trigger = this.root?.querySelector('[data-task-action="toggle-assignee-picker"]');
        if (picker) picker.hidden = true;
        trigger?.setAttribute('aria-expanded', 'false');
    }

    attachmentsTemplate(task, canEdit) {
        const savedAttachments = task.attachments.map((attachment, index) => {
            const url = safeUrl(attachment.url);
            let preview = `<span class="task-attachment__file">${icon('paperclip')}</span>`;
            if (String(attachment.contentType).startsWith('image/')) preview = `<img src="${escapeHtml(url)}" alt="">`;
            else if (String(attachment.contentType).startsWith('video/')) preview = `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`;
            return `<article class="task-attachment"><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${preview}<span><strong>${escapeHtml(attachment.name || 'File')}</strong><small>${formatFileSize(attachment.size)}</small></span></a>${canEdit ? `<button type="button" data-task-action="remove-attachment" data-attachment-index="${index}" aria-label="${escapeHtml(translate('common.delete', 'Delete'))}">${icon('x')}</button>` : ''}</article>`;
        }).join('');
        const pendingAttachments = !task.id ? this.pendingFiles.map((file, index) => `
            <article class="task-attachment task-attachment--pending">
                <div class="task-attachment__pending">${icon('upload')}<span><strong>${escapeHtml(file.name || 'File')}</strong><small>${formatFileSize(file.size)} · ${translate('tasks.readyToUpload', 'Ready to upload')}</small></span></div>
                <button type="button" data-task-action="remove-pending-attachment" data-pending-index="${index}" aria-label="${escapeHtml(translate('common.delete', 'Delete'))}">${icon('x')}</button>
            </article>
        `).join('') : '';
        if (!savedAttachments && !pendingAttachments) {
            return `<p class="task-no-attachments">${translate('tasks.noAttachments', 'Add photos, videos, PDFs, or documents.')}</p>`;
        }
        return savedAttachments + pendingAttachments;
    }

    listenForComments(taskId) {
        if (typeof this.unsubscribeComments === 'function') this.unsubscribeComments();
        this.unsubscribeComments = onSnapshot(collection(this.db, 'tasks', taskId, 'comments'), (snapshot) => {
            this.comments = snapshot.docs
                .map((entry) => ({ id: entry.id, ...entry.data() }))
                .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
            const container = this.root?.querySelector('[data-task-comments]');
            if (container) container.innerHTML = this.commentsTemplate();
        }, (error) => this.showError(error));
    }

    commentsTemplate() {
        if (!this.comments.length) return `<p class="task-comments__empty">${translate('tasks.noActivity', 'No comments yet.')}</p>`;
        return this.comments.map((comment) => `<article class="task-comment"><span>${escapeHtml(initials(comment.authorName || comment.authorEmail))}</span><div><header><strong>${escapeHtml(comment.authorName || comment.authorEmail || 'Colleague')}</strong><time>${escapeHtml(this.formatDateTime(comment.createdAt))}</time></header><p>${escapeHtml(comment.body || '').replaceAll('\n', '<br>')}</p></div></article>`).join('');
    }

    closeTask() {
        this.selectedTaskId = null;
        if (typeof this.unsubscribeComments === 'function') this.unsubscribeComments();
        this.unsubscribeComments = null;
        const panel = this.root?.querySelector('[data-task-detail]');
        panel?.classList.remove('is-open');
        panel?.setAttribute('aria-hidden', 'true');
        this.root?.querySelector('.task-app')?.classList.remove('has-detail-open');
    }

    async saveTask() {
        const panel = this.root.querySelector('[data-task-detail]');
        const current = this.selectedTaskId ? this.tasks.find((task) => task.id === this.selectedTaskId) : null;
        const title = panel.querySelector('[data-task-field="title"]')?.value.trim();
        if (!title) {
            this.toast(translate('tasks.titleRequired', 'Add a task name first.'), 'error');
            panel.querySelector('[data-task-field="title"]')?.focus();
            return;
        }
        const departmentId = panel.querySelector('[data-task-field="departmentId"]')?.value || 'general';
        const department = this.departments.find((entry) => entry.id === departmentId);
        const employees = this.dataManager?.getActiveEmployees?.() || [];
        const assigneeIds = Array.from(panel.querySelectorAll('[data-task-assignee]:checked')).map((input) => input.value);
        const assignees = employees.filter((employee) => assigneeIds.includes(employee.id)).map((employee) => ({ id: employee.id, name: employee.name }));
        const status = panel.querySelector('[data-task-field="status"]')?.value || TASK_STATUS.TODO;
        const payload = {
            title,
            description: panel.querySelector('[data-task-field="description"]')?.value || '',
            departmentId,
            departmentName: department?.name || translate('tasks.general', 'General'),
            section: panel.querySelector('[data-task-field="section"]')?.value.trim() || translate('tasks.general', 'General'),
            priority: panel.querySelector('[data-task-field="priority"]')?.value || 'normal',
            dueDate: panel.querySelector('[data-task-field="dueDate"]')?.value || '',
            status,
            assigneeIds,
            assignees,
            updatedAt: nowIso(),
            updatedBy: this.actor(),
            completedAt: status === TASK_STATUS.DONE ? (current?.completedAt || nowIso()) : ''
        };
        const button = panel.querySelector('[data-task-action="save-task"]');
        if (button) button.disabled = true;
        try {
            if (current) {
                await updateDoc(doc(this.db, 'tasks', current.id), payload);
                this.toast(translate('tasks.saved', 'Task saved.'));
            } else {
                const queuedFiles = [...this.pendingFiles];
                const created = await addDoc(collection(this.db, 'tasks'), {
                    ...payload,
                    attachments: [],
                    createdAt: nowIso(),
                    createdBy: this.actor()
                });
                this.selectedTaskId = created.id;
                const attachments = [];
                let failedUploads = 0;
                const uploadStatus = panel.querySelector('[data-task-upload-status]');
                for (let index = 0; index < queuedFiles.length; index += 1) {
                    if (uploadStatus) {
                        uploadStatus.textContent = translate('tasks.uploading', `Uploading ${index + 1} of ${queuedFiles.length}…`, { current: index + 1, total: queuedFiles.length });
                    }
                    try {
                        attachments.push(await this.uploadFileForTask(created.id, queuedFiles[index], index));
                    } catch (error) {
                        failedUploads += 1;
                        console.error('Task attachment upload failed:', error);
                    }
                }
                if (attachments.length) {
                    await updateDoc(doc(this.db, 'tasks', created.id), {
                        attachments,
                        updatedAt: nowIso(),
                        updatedBy: this.actor()
                    });
                }
                this.pendingFiles = [];
                this.toast(translate('tasks.created', 'Task created.'));
                this.closeTask();
                if (failedUploads) {
                    this.toast(translate('tasks.createdWithUploadErrors', 'Task created, but one or more files could not be uploaded.'), 'error');
                }
            }
        } catch (error) {
            this.showError(error);
        } finally {
            if (button) button.disabled = false;
        }
    }

    async toggleTask(taskId, forcedStatus = null) {
        const task = this.tasks.find((entry) => entry.id === taskId);
        if (!task || !this.canEditTask(task)) return;
        const status = forcedStatus || (task.status === TASK_STATUS.DONE ? TASK_STATUS.TODO : TASK_STATUS.DONE);
        try {
            await updateDoc(doc(this.db, 'tasks', task.id), {
                status,
                completedAt: status === TASK_STATUS.DONE ? nowIso() : '',
                updatedAt: nowIso(),
                updatedBy: this.actor()
            });
        } catch (error) {
            this.showError(error);
        }
    }

    async addDepartment() {
        if (!this.isManager()) return;
        const name = window.prompt(translate('tasks.departmentPrompt', 'Department name'))?.trim();
        if (!name) return;
        try {
            const department = await addDoc(collection(this.db, 'taskDepartments'), {
                name,
                color: DEPARTMENT_COLORS[this.departments.length % DEPARTMENT_COLORS.length],
                order: this.departments.length,
                createdAt: nowIso(),
                createdBy: this.actor()
            });
            this.selectedScope = 'department';
            this.selectedDepartmentId = department.id;
            this.toast(translate('tasks.departmentCreated', 'Department created.'));
        } catch (error) {
            this.showError(error);
        }
    }

    async deleteDepartment(departmentId) {
        if (!this.isManager()) return;
        const hasTasks = this.tasks.some((task) => task.departmentId === departmentId);
        if (hasTasks) {
            this.toast(translate('tasks.departmentHasTasks', 'Move or delete this department’s tasks first.'), 'error');
            return;
        }
        if (!window.confirm(translate('tasks.deleteDepartmentConfirm', 'Delete this empty department?'))) return;
        try {
            await deleteDoc(doc(this.db, 'taskDepartments', departmentId));
            this.selectedScope = 'my';
            this.selectedDepartmentId = '';
        } catch (error) {
            this.showError(error);
        }
    }

    async deleteTask() {
        const task = this.tasks.find((entry) => entry.id === this.selectedTaskId);
        if (!task || !this.isManager() || !window.confirm(translate('tasks.deleteTaskConfirm', 'Delete this task permanently?'))) return;
        try {
            await Promise.all(task.attachments.map((attachment) => this.deleteAttachment?.(attachment.storagePath).catch(() => {})));
            await deleteDoc(doc(this.db, 'tasks', task.id));
            this.closeTask();
            this.toast(translate('tasks.deleted', 'Task deleted.'));
        } catch (error) {
            this.showError(error);
        }
    }

    async uploadFiles(files) {
        const task = this.tasks.find((entry) => entry.id === this.selectedTaskId);
        const availableSlots = Math.max(0, 10 - (task?.attachments?.length || 0) - this.pendingFiles.length);
        const accepted = Array.from(files).slice(0, availableSlots).filter((file) => {
            if (file.size <= 100 * 1024 * 1024) return true;
            this.toast(translate('tasks.fileTooLarge', `${file.name} is larger than 100 MB.`), 'error');
            return false;
        });
        if (!task && !this.selectedTaskId) {
            this.pendingFiles.push(...accepted);
            const container = this.root.querySelector('.task-attachments');
            if (container) container.innerHTML = this.attachmentsTemplate({ id: '', attachments: [] }, true);
            const pendingStatus = this.root.querySelector('[data-task-upload-status]');
            if (pendingStatus && accepted.length) pendingStatus.textContent = translate('tasks.attachmentsQueued', 'Files are ready and will upload when the task is created.');
            return;
        }
        if (!task || !this.canEditTask(task)) return;
        const status = this.root.querySelector('[data-task-upload-status]');
        for (let index = 0; index < accepted.length; index += 1) {
            const file = accepted[index];
            if (status) status.textContent = translate('tasks.uploading', `Uploading ${index + 1} of ${accepted.length}…`, { current: index + 1, total: accepted.length });
            try {
                const attachment = await this.uploadFileForTask(task.id, file, index);
                const attachments = [...task.attachments, attachment];
                await updateDoc(doc(this.db, 'tasks', task.id), { attachments, updatedAt: nowIso(), updatedBy: this.actor() });
                task.attachments = attachments;
                this.renderDetail(task);
            } catch (error) {
                this.showError(error);
            }
        }
        const currentStatus = this.root.querySelector('[data-task-upload-status]');
        if (currentStatus) currentStatus.textContent = '';
    }

    async uploadFileForTask(taskId, file, index = 0) {
        const uploaded = await this.uploadAttachment({ taskId, file });
        return {
            id: crypto.randomUUID?.() || `${Date.now()}-${index}`,
            name: file.name,
            contentType: file.type || 'application/octet-stream',
            size: file.size,
            url: uploaded.url,
            storagePath: uploaded.storagePath,
            uploadedAt: nowIso(),
            uploadedBy: this.actor()
        };
    }

    removePendingAttachment(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.pendingFiles.length) return;
        this.pendingFiles.splice(index, 1);
        const container = this.root.querySelector('.task-attachments');
        if (container) container.innerHTML = this.attachmentsTemplate({ id: '', attachments: [] }, true);
        const status = this.root.querySelector('[data-task-upload-status]');
        if (status) status.textContent = this.pendingFiles.length
            ? translate('tasks.attachmentsQueued', 'Files are ready and will upload when the task is created.')
            : '';
    }

    async removeAttachment(index) {
        const task = this.tasks.find((entry) => entry.id === this.selectedTaskId);
        const attachment = task?.attachments?.[index];
        if (!task || !attachment || !this.canEditTask(task)) return;
        const attachments = task.attachments.filter((_, attachmentIndex) => attachmentIndex !== index);
        try {
            await updateDoc(doc(this.db, 'tasks', task.id), { attachments, updatedAt: nowIso(), updatedBy: this.actor() });
            await this.deleteAttachment?.(attachment.storagePath).catch(() => {});
            task.attachments = attachments;
            this.renderDetail(task);
        } catch (error) {
            this.showError(error);
        }
    }

    async addComment() {
        const input = this.root.querySelector('[data-task-comment]');
        const body = input?.value.trim();
        if (!this.selectedTaskId || !body) return;
        try {
            await addDoc(collection(this.db, 'tasks', this.selectedTaskId, 'comments'), {
                body,
                createdAt: nowIso(),
                authorUid: this.user.uid,
                authorEmail: this.user.email,
                authorEmployeeId: this.getCurrentEmployee()?.id || '',
                authorName: this.getCurrentEmployee()?.name || this.user.email
            });
            input.value = '';
        } catch (error) {
            this.showError(error);
        }
    }

    actor() {
        return {
            uid: this.user?.uid || '',
            email: this.user?.email || '',
            employeeId: this.getCurrentEmployee()?.id || '',
            name: this.getCurrentEmployee()?.name || this.user?.email || ''
        };
    }

    handleClick(event) {
        const target = event.target.closest('[data-task-action]');
        if (!target) {
            if (!event.target.closest('[data-task-assignee-control]')) this.closeAssigneePicker();
            return;
        }
        const action = target.dataset.taskAction;
        if (action === 'back') document.dispatchEvent(new CustomEvent('tasksBackRequested'));
        else if (action === 'sign-out') document.dispatchEvent(new CustomEvent('signOutRequested'));
        else if (action === 'toggle-sidebar') this.root.querySelector('.task-app')?.classList.toggle('is-sidebar-open');
        else if (action === 'select-my') { this.selectedScope = 'my'; this.selectedDepartmentId = ''; this.closeMobileSidebar(); this.render(); }
        else if (action === 'select-department') { this.selectedScope = 'department'; this.selectedDepartmentId = target.dataset.departmentId; this.closeMobileSidebar(); this.render(); }
        else if (action === 'set-view') { this.view = target.dataset.view; this.render(); }
        else if (action === 'toggle-assignee-picker') {
            const picker = this.root.querySelector('[data-task-assignee-picker]');
            if (!picker) return;
            picker.hidden = !picker.hidden;
            target.setAttribute('aria-expanded', String(!picker.hidden));
        }
        else if (action === 'new-task') this.openTask(null, { section: target.dataset.section });
        else if (action === 'open-task') this.openTask(target.dataset.taskId);
        else if (action === 'toggle-task') { event.stopPropagation(); this.toggleTask(target.dataset.taskId); }
        else if (action === 'detail-toggle') {
            const task = this.tasks.find((entry) => entry.id === this.selectedTaskId);
            if (task) this.toggleTask(task.id);
            else {
                const statusSelect = this.root.querySelector('[data-task-field="status"]');
                if (statusSelect) statusSelect.value = statusSelect.value === TASK_STATUS.DONE ? TASK_STATUS.TODO : TASK_STATUS.DONE;
            }
        }
        else if (action === 'close-detail') this.closeTask();
        else if (action === 'save-task') this.saveTask();
        else if (action === 'delete-task') this.deleteTask();
        else if (action === 'add-department') this.addDepartment();
        else if (action === 'delete-department') this.deleteDepartment(target.dataset.departmentId);
        else if (action === 'attach-file') this.root.querySelector('[data-task-file-input]')?.click();
        else if (action === 'remove-attachment') this.removeAttachment(Number(target.dataset.attachmentIndex));
        else if (action === 'remove-pending-attachment') this.removePendingAttachment(Number(target.dataset.pendingIndex));
        else if (action === 'add-comment') this.addComment();
    }

    handleInput(event) {
        if (event.target.matches('[data-task-search]')) {
            this.searchQuery = event.target.value;
            this.renderCanvas();
        }
    }

    handleChange(event) {
        if (event.target.matches('[data-task-hide-completed]')) {
            this.hideCompleted = event.target.checked;
            this.renderCanvas();
        } else if (event.target.matches('[data-task-file-input]')) {
            this.uploadFiles(event.target.files);
            event.target.value = '';
        } else if (event.target.matches('[data-task-assignee]')) {
            this.updateAssigneeSummary();
            this.closeAssigneePicker();
        }
    }

    closeMobileSidebar() {
        this.root.querySelector('.task-app')?.classList.remove('is-sidebar-open');
    }

    formatDate(dateKey) {
        if (!dateKey) return '';
        const date = new Date(`${dateKey}T12:00:00`);
        if (Number.isNaN(date.getTime())) return dateKey;
        return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { day: 'numeric', month: 'short' }).format(date);
    }

    formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
    }

    priorityLabel(priority) {
        const labels = {
            low: translate('tasks.priorityLow', 'Low'),
            normal: translate('tasks.priorityNormal', 'Normal'),
            high: translate('tasks.priorityHigh', 'High'),
            urgent: translate('tasks.priorityUrgent', 'Urgent')
        };
        return labels[priority] || labels.normal;
    }

    toast(message, tone = 'success') {
        const toast = this.root?.querySelector('[data-task-toast]');
        if (!toast) return;
        toast.textContent = message;
        toast.dataset.tone = tone;
        toast.classList.add('is-visible');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
    }

    showError(error) {
        console.error('Task workspace error:', error);
        const code = String(error?.code || '');
        const message = code.includes('permission-denied')
            ? translate('tasks.permissionError', 'You do not have permission to do that.')
            : translate('tasks.genericError', 'Something went wrong. Please try again.');
        this.toast(message, 'error');
    }
}
