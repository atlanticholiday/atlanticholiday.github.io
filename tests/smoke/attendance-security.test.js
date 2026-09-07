import { describe, test, assert } from '../test-harness.js';

describe('Attendance register security', () => {
    test('blocks browser writes and limits self-service reads to the linked worker', async () => {
        const response = await fetch('../firestore.rules');
        assert.ok(response.ok, 'Failed to fetch firestore.rules');
        const rules = await response.text();
        const attendanceRules = rules.match(/match \/attendance_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const overtimeRules = rules.match(/match \/overtime_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const pinRules = rules.match(/match \/attendance_pin_credentials\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';

        assert.includes(rules, 'data.employeeId == accessData().linkedEmployeeId');
        assert.includes(attendanceRules, 'isOwnAttendance(resource.data)');
        assert.includes(attendanceRules, 'allow create, update, delete: if false');
        assert.includes(overtimeRules, 'isOwnAttendance(resource.data)');
        assert.includes(overtimeRules, 'allow create, update, delete: if false');
        assert.includes(pinRules, 'allow read, write: if false');
    });

    test('routes attendance mutations through protected callable functions', async () => {
        const [functionsResponse, mainResponse] = await Promise.all([
            fetch('../functions/index.js'),
            fetch('../js/app/main.js')
        ]);
        assert.ok(functionsResponse.ok, 'Failed to fetch functions/index.js');
        assert.ok(mainResponse.ok, 'Failed to fetch js/app/main.js');
        const functionsSource = await functionsResponse.text();
        const mainSource = await mainResponse.text();

        assert.includes(functionsSource, 'exports.recordAttendancePunch = onCall');
        assert.includes(functionsSource, 'trustedServerTime: source !== "manual"');
        assert.includes(functionsSource, 'exports.authorizeOvertime = onCall');
        assert.includes(functionsSource, 'exports.validateOvertimeRecord = onCall');
        assert.includes(functionsSource, 'exports.setAttendancePin = onCall');
        assert.includes(functionsSource, 'exports.removeAttendancePin = onCall');
        assert.includes(functionsSource, 'timingSafeEqual(expectedHash, suppliedHash)');
        assert.includes(functionsSource, 'ATTENDANCE_PIN_MAX_ATTEMPTS = 5');
        assert.includes(mainSource, "httpsCallable(functionsInstance, 'recordAttendancePunch')");
        assert.includes(mainSource, "httpsCallable(functionsInstance, 'setAttendancePin')");
    });

    test('shows an actionable message when the protected Firebase service is not deployed', async () => {
        const response = await fetch('../js/features/scheduling/data-manager.js');
        assert.ok(response.ok, 'Failed to fetch scheduling data manager');
        const source = await response.text();

        assert.includes(source, "['internal', 'not-found', 'unavailable', 'unimplemented']");
        assert.includes(source, "timeClock.errors.secureServiceNotDeployed");
    });

    test('separates daily, history, overtime, management, and configuration workspaces', async () => {
        const response = await fetch('../js/features/scheduling/ui-manager.js');
        assert.ok(response.ok, 'Failed to fetch scheduling UI manager');
        const source = await response.text();

        assert.includes(source, "'today',");
        assert.includes(source, "'history',");
        assert.includes(source, "['overtime']");
        assert.includes(source, "['management']");
        assert.includes(source, "['configuration']");
        assert.includes(source, 'data-time-clock-section');
        assert.includes(source, "sectionClass('today')");
        assert.includes(source, "sectionClass('history')");
        assert.includes(source, "sectionClass('overtime')");
    });
});
