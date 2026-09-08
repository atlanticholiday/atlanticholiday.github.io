import { describe, test, assert } from '../test-harness.js';

describe('Attendance register security', () => {
    test('allows only fresh append-only attendance writes by the linked identity', async () => {
        const response = await fetch('../firestore.rules');
        assert.ok(response.ok, 'Failed to fetch firestore.rules');
        const rules = await response.text();
        const attendanceRules = rules.match(/match \/attendance_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const overtimeRules = rules.match(/match \/overtime_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const pinRules = rules.match(/match \/attendance_pin_credentials\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';

        assert.includes(rules, 'data.employeeId == accessData().linkedEmployeeId');
        assert.includes(attendanceRules, 'isOwnAttendance(resource.data)');
        assert.includes(attendanceRules, 'allow create: if validDirectAttendanceCreate()');
        assert.includes(attendanceRules, 'allow update: if validDirectAttendanceAppend()');
        assert.includes(attendanceRules, 'allow delete: if false');
        assert.includes(attendanceRules, 'isCredentialAttendanceRecordId(recordId)');
        assert.includes(attendanceRules, 'isOwnAttendanceRecordId(recordId)');
        assert.includes(rules, 'request.resource.data.updatedAtServer == request.time');
        assert.includes(rules, 'event.occurredAtEpochMs >= request.time.toMillis() - 60000');
        assert.includes(overtimeRules, 'isOwnAttendance(resource.data)');
        assert.includes(overtimeRules, 'allow create, update, delete: if false');
        assert.includes(pinRules, 'allow read, write: if false');
    });

    test('routes tablet punches through an isolated Firebase Authentication identity', async () => {
        const [functionsResponse, mainResponse, sparkApiResponse] = await Promise.all([
            fetch('../functions/index.js'),
            fetch('../js/app/main.js'),
            fetch('../js/features/scheduling/spark-attendance-api.js')
        ]);
        assert.ok(functionsResponse.ok, 'Failed to fetch functions/index.js');
        assert.ok(mainResponse.ok, 'Failed to fetch js/app/main.js');
        assert.ok(sparkApiResponse.ok, 'Failed to fetch Spark attendance API');
        const functionsSource = await functionsResponse.text();
        const mainSource = await mainResponse.text();
        const sparkApiSource = await sparkApiResponse.text();

        assert.includes(functionsSource, 'exports.recordAttendancePunch = onCall');
        assert.includes(functionsSource, 'trustedServerTime: source !== "manual"');
        assert.includes(functionsSource, 'exports.authorizeOvertime = onCall');
        assert.includes(functionsSource, 'exports.validateOvertimeRecord = onCall');
        assert.includes(functionsSource, 'exports.setAttendancePin = onCall');
        assert.includes(functionsSource, 'exports.removeAttendancePin = onCall');
        assert.includes(functionsSource, 'timingSafeEqual(expectedHash, suppliedHash)');
        assert.includes(functionsSource, 'ATTENDANCE_PIN_MAX_ATTEMPTS = 5');
        assert.includes(mainSource, 'createSparkAttendanceApi({ db, auth })');
        assert.includes(sparkApiSource, 'inMemoryPersistence');
        assert.includes(sparkApiSource, 'signInWithEmailAndPassword(');
        assert.includes(sparkApiSource, 'deriveCredentialPassword(pin)');
        assert.includes(sparkApiSource, "if (!/^\\d{6,10}$/.test(normalizedPin))");
        assert.includes(sparkApiSource, "transaction.set(targetRef, createPunchRecord");
        assert.includes(sparkApiSource, "batch.set(doc(db, 'attendance_credentials', credentialEmail)");
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
