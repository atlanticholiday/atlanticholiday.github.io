import { describe, test, assert } from '../test-harness.js';

describe('Task workspace security rules', () => {
    test('limits colleague task reads to their linked staff assignment', async () => {
        const response = await fetch('../firestore.rules');
        assert.ok(response.ok, 'Failed to fetch firestore.rules');
        const rules = await response.text();
        const taskRules = rules.match(/match \/tasks\/\{taskId\} \{([\s\S]*?)\n    \}/)?.[1] || '';

        assert.includes(rules, 'taskAssignedToCurrentUser');
        assert.includes(rules, 'accessData().linkedEmployeeId in data.assigneeIds');
        assert.includes(rules, 'colleagueTaskUpdateAllowed');
        assert.includes(rules, 'request.resource.data.assigneeIds == resource.data.assigneeIds');
        assert.includes(rules, 'request.resource.data.departmentId == resource.data.departmentId');
        assert.includes(taskRules, 'allow read: if canReadTaskData(resource.data)');
        assert.includes(taskRules, 'allow delete: if privileged()');
    });

    test('allows task media only when the parent task is accessible', async () => {
        const response = await fetch('../storage.rules');
        assert.ok(response.ok, 'Failed to fetch storage.rules');
        const rules = await response.text();
        const attachmentRules = rules.match(/match \/task-attachments\/\{taskId\}\/\{fileName\} \{([\s\S]*?)\n    \}/)?.[1] || '';

        assert.includes(rules, 'function canAccessTask(taskId)');
        assert.includes(attachmentRules, 'allow read: if canAccessTask(taskId)');
        assert.includes(attachmentRules, 'request.resource.size < 100 * 1024 * 1024');
        assert.includes(attachmentRules, 'allowedTaskAttachmentType()');
    });
});
