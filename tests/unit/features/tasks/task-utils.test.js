import { describe, test, assert } from '../../../test-harness.js';
import {
    TASK_STATUS,
    extractLinks,
    filterTasks,
    getDueDateState,
    groupTasksBySection,
    normalizeTaskRecord
} from '../../../../js/features/tasks/task-utils.js';

describe('Task utils', () => {
    test('normalizes task defaults and removes duplicate assignees', () => {
        const task = normalizeTaskRecord({
            title: '  Inspect apartment  ',
            assigneeIds: ['ana', 'ana', '', null],
            priority: 'unknown'
        });

        assert.equal(task.title, 'Inspect apartment');
        assert.deepEqual(task.assigneeIds, ['ana']);
        assert.equal(task.departmentId, 'general');
        assert.equal(task.status, TASK_STATUS.TODO);
        assert.equal(task.priority, 'normal');
    });

    test('filters personal department tasks and searches descriptions', () => {
        const tasks = [
            { title: 'Keys', description: 'Collect at reception', departmentId: 'front', assigneeIds: ['ana'] },
            { title: 'Laundry', description: 'Deliver sheets', departmentId: 'cleaning', assigneeIds: ['sofia'] },
            { title: 'Late check-in', description: 'Reception after 22:00', departmentId: 'front', assigneeIds: ['sofia'], status: 'done' }
        ];

        assert.equal(filterTasks(tasks, { departmentId: 'front' }).length, 2);
        assert.equal(filterTasks(tasks, { employeeId: 'sofia' }).length, 2);
        assert.equal(filterTasks(tasks, { query: 'reception' }).length, 2);
        assert.equal(filterTasks(tasks, { hideCompleted: true }).length, 2);
    });

    test('groups tasks by section and sorts overdue work before undated work', () => {
        const groups = groupTasksBySection([
            { title: 'Undated', section: 'Weekly' },
            { title: 'Sooner', section: 'Weekly', dueDate: '2026-08-30', priority: 'high' },
            { title: 'Another section', section: 'Requests' }
        ]);

        assert.equal(groups.length, 2);
        assert.equal(groups[0].name, 'Weekly');
        assert.equal(groups[0].tasks[0].title, 'Sooner');
        assert.equal(groups[1].name, 'Requests');
    });

    test('classifies due dates using local calendar dates', () => {
        const today = new Date(2026, 7, 29, 15, 0, 0);
        assert.equal(getDueDateState('2026-08-28', today), 'overdue');
        assert.equal(getDueDateState('2026-08-29', today), 'today');
        assert.equal(getDueDateState('2026-08-30', today), 'upcoming');
        assert.equal(getDueDateState('', today), 'none');
    });

    test('extracts unique safe-looking links from task text', () => {
        assert.deepEqual(
            extractLinks('See https://example.com/a, then https://example.com/a and http://example.org.'),
            ['https://example.com/a', 'http://example.org']
        );
    });
});
