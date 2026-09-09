import { describe, test, assert } from '../test-harness.js';

describe('Attendance register security', () => {
    test('allows only fresh append-only attendance writes by the linked identity', async () => {
        const response = await fetch('../firestore.rules');
        assert.ok(response.ok, 'Failed to fetch firestore.rules');
        const rules = await response.text();
        const attendanceRules = rules.match(/match \/attendance_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const overtimeRules = rules.match(/match \/overtime_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const employeeRules = rules.match(/match \/employees\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const stationDirectoryRules = rules.match(/match \/attendance_station_directory\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const credentialRules = rules.match(/match \/attendance_credentials\/\{credentialEmail\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const pinRules = rules.match(/match \/attendance_pin_credentials\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';

        assert.includes(rules, 'data.employeeId == accessData().linkedEmployeeId');
        assert.includes(attendanceRules, 'isOwnAttendance(resource.data)');
        assert.includes(attendanceRules, 'validDirectAttendanceCreate(recordId)');
        assert.includes(attendanceRules, 'validPrivilegedAttendanceCreate(recordId)');
        assert.includes(attendanceRules, 'validDirectAttendanceAppend(recordId)');
        assert.includes(attendanceRules, 'validOwnAttendanceAttestation(recordId)');
        assert.includes(attendanceRules, 'allow delete: if false');
        assert.includes(attendanceRules, 'isCredentialAttendanceRecordId(recordId)');
        assert.includes(attendanceRules, 'isOwnAttendanceRecordId(recordId)');
        assert.includes(rules, 'request.resource.data.updatedAtServer == request.time');
        assert.includes(rules, 'event.occurredAtEpochMs >= request.time.toMillis() - 60000');
        assert.includes(overtimeRules, 'allow create: if validOvertimeCreate(recordId)');
        assert.includes(overtimeRules, 'allow update: if validOvertimeUpdate(recordId)');
        assert.includes(overtimeRules, 'allow delete: if false');
        assert.includes(pinRules, 'allow read, write: if false');
        assert.includes(rules, 'match /attendance_events/{eventId}');
        assert.includes(rules, 'allow update, delete: if false');
        assert.includes(rules, 'data.serverRecordedAt == request.time');
        assert.includes(rules, 'match /attendance_station_directory/{employeeId}');
        assert.ok(!employeeRules.includes("hasRole('time-clock-station')"));
        assert.ok(!stationDirectoryRules.includes("hasRole('time-clock-station')"));
        assert.ok(!attendanceRules.includes("hasRole('time-clock-station')"));
        assert.ok(!overtimeRules.includes("hasRole('time-clock-station')"));
        assert.includes(credentialRules, 'request.auth.token.email == credentialEmail');
        assert.includes(credentialRules, 'allow list: if false');
    });

    test('routes tablet punches through an isolated Firebase Authentication identity', async () => {
        const [mainResponse, sparkApiResponse] = await Promise.all([
            fetch('../js/app/main.js'),
            fetch('../js/features/scheduling/spark-attendance-api.js')
        ]);
        assert.ok(mainResponse.ok, 'Failed to fetch js/app/main.js');
        assert.ok(sparkApiResponse.ok, 'Failed to fetch Spark attendance API');
        const mainSource = await mainResponse.text();
        const sparkApiSource = await sparkApiResponse.text();

        assert.includes(mainSource, 'createSparkAttendanceApi({ db, auth })');
        assert.includes(mainSource, 'const needsTimeClockData = !isTimeClockStation');
        assert.ok(!mainSource.includes("httpsCallable(functionsInstance, 'addManualAttendanceCorrection')"));
        assert.ok(!mainSource.includes("httpsCallable(functionsInstance, 'authorizeOvertime')"));
        assert.includes(sparkApiSource, 'inMemoryPersistence');
        assert.includes(sparkApiSource, 'signInWithEmailAndPassword(');
        assert.includes(sparkApiSource, 'deriveCredentialPassword(pin)');
        assert.includes(sparkApiSource, 'deriveAttendanceCredentialEmail(normalizedPin)');
        assert.includes(sparkApiSource, 'identifyStationEmployee');
        assert.includes(sparkApiSource, "if (!/^\\d{6,10}$/.test(normalizedPin))");
        assert.includes(sparkApiSource, "canonicalEvent(transaction, db, actor");
        assert.includes(sparkApiSource, "action: 'manual-punch'");
        assert.includes(sparkApiSource, "action: 'worker-attested'");
        assert.includes(sparkApiSource, "action: 'authorized'");
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
