export const TASK_STATUS = Object.freeze({
    TODO: 'todo',
    IN_PROGRESS: 'inProgress',
    DONE: 'done'
});

export const TASK_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

const PRIORITY_RANK = Object.freeze({ urgent: 0, high: 1, normal: 2, low: 3 });

function stringValue(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeTaskRecord(task = {}) {
    const assigneeIds = Array.isArray(task.assigneeIds)
        ? [...new Set(task.assigneeIds.map((id) => stringValue(id)).filter(Boolean))]
        : [];
    const assignees = Array.isArray(task.assignees)
        ? task.assignees
            .filter((assignee) => assignee && typeof assignee === 'object')
            .map((assignee) => ({
                id: stringValue(assignee.id),
                name: stringValue(assignee.name, 'Colleague')
            }))
            .filter((assignee) => assignee.id)
        : [];
    const status = Object.values(TASK_STATUS).includes(task.status) ? task.status : TASK_STATUS.TODO;
    const priority = TASK_PRIORITIES.includes(task.priority) ? task.priority : 'normal';

    return {
        ...task,
        title: stringValue(task.title, 'Untitled task'),
        description: typeof task.description === 'string' ? task.description : '',
        departmentId: stringValue(task.departmentId, 'general'),
        departmentName: stringValue(task.departmentName, 'General'),
        section: stringValue(task.section, 'General'),
        status,
        priority,
        dueDate: stringValue(task.dueDate),
        assigneeIds,
        assignees,
        attachments: Array.isArray(task.attachments) ? task.attachments.filter(Boolean) : [],
        createdAt: stringValue(task.createdAt),
        updatedAt: stringValue(task.updatedAt)
    };
}

export function compareTasks(leftTask, rightTask) {
    const left = normalizeTaskRecord(leftTask);
    const right = normalizeTaskRecord(rightTask);
    const leftDone = left.status === TASK_STATUS.DONE ? 1 : 0;
    const rightDone = right.status === TASK_STATUS.DONE ? 1 : 0;
    if (leftDone !== rightDone) return leftDone - rightDone;

    const leftDue = left.dueDate || '9999-12-31';
    const rightDue = right.dueDate || '9999-12-31';
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);

    const priorityDifference = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
}

export function groupTasksBySection(tasks = []) {
    const groups = new Map();
    tasks.map(normalizeTaskRecord).sort(compareTasks).forEach((task) => {
        const section = task.section || 'General';
        if (!groups.has(section)) groups.set(section, []);
        groups.get(section).push(task);
    });
    return [...groups.entries()].map(([name, sectionTasks]) => ({ name, tasks: sectionTasks }));
}

export function filterTasks(tasks = [], {
    departmentId = '',
    employeeId = '',
    query = '',
    hideCompleted = false
} = {}) {
    const normalizedQuery = stringValue(query).toLocaleLowerCase();
    return tasks.map(normalizeTaskRecord).filter((task) => {
        if (departmentId && task.departmentId !== departmentId) return false;
        if (employeeId && !task.assigneeIds.includes(employeeId)) return false;
        if (hideCompleted && task.status === TASK_STATUS.DONE) return false;
        if (!normalizedQuery) return true;
        const haystack = [
            task.title,
            task.description,
            task.departmentName,
            task.section,
            ...task.assignees.map((assignee) => assignee.name)
        ].join(' ').toLocaleLowerCase();
        return haystack.includes(normalizedQuery);
    });
}

export function getDueDateState(dueDate, today = new Date()) {
    const normalized = stringValue(dueDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return 'none';
    const todayKey = [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0')
    ].join('-');
    if (normalized < todayKey) return 'overdue';
    if (normalized === todayKey) return 'today';
    return 'upcoming';
}

export function extractLinks(text = '') {
    const matches = String(text).match(/https?:\/\/[^\s<]+/gi) || [];
    return [...new Set(matches.map((url) => url.replace(/[),.;!?]+$/, '')))];
}

export function isPreviewableAttachment(attachment = {}) {
    const contentType = stringValue(attachment.contentType).toLocaleLowerCase();
    return contentType.startsWith('image/') || contentType.startsWith('video/');
}

export function initials(name = '') {
    return String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || '?';
}
