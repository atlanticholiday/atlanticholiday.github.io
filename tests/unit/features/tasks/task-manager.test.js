import { describe, test, assert } from '../../../test-harness.js';
import { resetDom } from '../../../test-utils.js';
import { TaskManager } from '../../../../js/features/tasks/task-manager.js';

describe('TaskManager', () => {
    test('collapses the assignee picker after selecting a colleague', () => {
        resetDom('<div id="tasks-page"></div>');
        const employees = [
            { id: 'lucas', name: 'Lucas Abreu' },
            { id: 'andre', name: 'André Marques' }
        ];
        const manager = new TaskManager({
            db: null,
            dataManager: {
                hasPrivilegedRole: () => true,
                getCurrentUserEmployee: () => employees[0],
                getActiveEmployees: () => employees,
                subscribeToDataChanges: () => () => {}
            }
        });
        manager.user = { uid: 'manager', email: 'manager@example.com' };
        manager.init();
        manager.openTask();

        const trigger = document.querySelector('[data-task-action="toggle-assignee-picker"]');
        const picker = document.querySelector('[data-task-assignee-picker]');
        trigger.click();
        assert.equal(picker.hidden, false);

        const andre = document.querySelector('[data-task-assignee][value="andre"]');
        andre.checked = true;
        andre.dispatchEvent(new Event('change', { bubbles: true }));

        assert.equal(picker.hidden, true);
        assert.equal(trigger.getAttribute('aria-expanded'), 'false');
        assert.includes(document.querySelector('[data-task-assignee-summary]').textContent, 'André Marques');
    });

    test('queues attachments before a new task has a Firestore id', async () => {
        resetDom('<div id="tasks-page"></div>');
        let uploadCalls = 0;
        const manager = new TaskManager({
            db: null,
            dataManager: {
                hasPrivilegedRole: () => true,
                getCurrentUserEmployee: () => ({ id: 'lucas', name: 'Lucas Abreu' }),
                getActiveEmployees: () => [{ id: 'lucas', name: 'Lucas Abreu' }],
                subscribeToDataChanges: () => () => {}
            },
            uploadAttachment: async () => {
                uploadCalls += 1;
                return {};
            }
        });
        manager.user = { uid: 'manager', email: 'manager@example.com' };
        manager.init();
        manager.openTask();

        await manager.uploadFiles([new File(['photo'], 'arrival.jpg', { type: 'image/jpeg' })]);

        assert.equal(uploadCalls, 0);
        assert.equal(manager.pendingFiles.length, 1);
        assert.includes(document.querySelector('.task-attachments').textContent, 'arrival.jpg');
        assert.includes(document.querySelector('[data-task-upload-status]').textContent, 'will upload when the task is created');
    });
});
