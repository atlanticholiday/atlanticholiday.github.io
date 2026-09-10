import { describe, test, assert } from '../test-harness.js';

describe('Attendance register security', () => {
    test('allows only fresh append-only attendance writes by the linked identity', async () => {
        const response = await fetch('../firestore.rules');
        assert.ok(response.ok, 'Failed to fetch firestore.rules');
        const rules = await response.text();
        const attendanceRules = rules.match(/match \/attendance_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const overtimeRules = rules.match(/match \/overtime_records\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const employeeRules = rules.match(/match \/employees\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const scheduleDirectoryRules = rules.match(/match \/schedule_directory\/\{employeeId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
        const dailyNoteRules = rules.match(/match \/daily_notes\/\{recordId\} \{([\s\S]*?)\n    \}/)?.[1] || '';
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
        assert.includes(scheduleDirectoryRules, "hasRole('employee') || hasLinkedEmployee()");
        assert.includes(scheduleDirectoryRules, "!hasRole('time-clock-station')");
        assert.includes(scheduleDirectoryRules, 'request.resource.data.keys().hasOnly');
        assert.includes(scheduleDirectoryRules, 'request.resource.data.updatedAtServer == request.time');
        assert.includes(scheduleDirectoryRules, "privileged() || hasApp('staff')");
        assert.ok(!employeeRules.includes('isOwnEmployeeDocument(employeeId)'));
        assert.includes(employeeRules, 'allow list: if privileged()');
        assert.ok(!employeeRules.includes("|| hasRole('employee')"));
        assert.ok(!dailyNoteRules.includes("hasRole('employee')"));
        assert.includes(rules, 'match /employee_self_service/{employeeId}');
        assert.includes(rules, 'match /vacation_records/{recordId}');
        assert.includes(rules, 'get(selfServiceProfilePath(employeeId)).data.active == true');
        assert.includes(rules, 'isOwnEmployeeDocument(employeeId) && resource.data.active == true');
        assert.includes(rules, 'validSelfServiceVacationBalance(data.vacationBalance)');
        assert.includes(rules, 'balance.remainingDays == balance.allowanceDays - balance.recordedDays');
        assert.includes(rules, 'match /employee_data_correction_requests/{requestId}');
        assert.includes(rules, 'allow create: if validSelfServiceCorrectionCreate()');
        assert.includes(rules, 'data.diff(resource.data).affectedKeys().hasOnly');
        assert.includes(rules, 'allow delete: if false');
        assert.includes(rules, '// Archive by replacing the profile with an inactive, PII-free tombstone.');
        assert.includes(rules, "data.keys().hasOnly([\n          'startDate', 'endDate', 'type', 'status'");
        assert.includes(credentialRules, 'request.auth.token.email == credentialEmail');
        assert.includes(credentialRules, 'allow list: if false');
    });

    test('keeps private schedule fields out of the colleague data path', async () => {
        const [mainResponse, dataManagerResponse, uiResponse, eventManagerResponse, personalDataResponse] = await Promise.all([
            fetch('../js/app/main.js'),
            fetch('../js/features/scheduling/data-manager.js'),
            fetch('../js/features/scheduling/ui-manager.js'),
            fetch('../js/features/scheduling/event-manager.js'),
            fetch('../js/features/scheduling/personal-data-self-service.js')
        ]);
        const mainSource = await mainResponse.text();
        const dataManagerSource = await dataManagerResponse.text();
        const uiSource = await uiResponse.text();
        const eventManagerSource = await eventManagerResponse.text();
        const personalDataSource = await personalDataResponse.text();

        assert.includes(mainSource, 'getScheduleDataAccessPlan');
        assert.includes(dataManagerSource, 'getEmployeeDirectoryCollectionName');
        assert.includes(dataManagerSource, 'getDocsFromServer(profileCollectionRef)');
        assert.includes(dataManagerSource, '!snapshot.metadata.hasPendingWrites');
        assert.includes(dataManagerSource, 'this.hasAuthoritativeEmployeeSnapshot && this.hasAuthoritativeVacationSnapshot');
        assert.includes(dataManagerSource, 'this.selfServiceProfile.active === true');
        assert.includes(dataManagerSource, 'this.selfServiceProfile?.active !== true');
        assert.includes(dataManagerSource, 'createSelfServiceCorrectionRequest');
        assert.includes(dataManagerSource, 'reviewSelfServiceCorrectionRequest');
        assert.includes(mainSource, 'listenForSelfServiceCorrectionRequests');
        assert.includes(uiSource, 'data-export-personal-data');
        assert.includes(uiSource, 'personal-data-correction-form');
        assert.includes(uiSource, 'data-personal-correction-review-form');
        assert.includes(eventManagerSource, 'createSelfServiceCorrectionRequest');
        assert.includes(eventManagerSource, 'reviewSelfServiceCorrectionRequest');
        assert.includes(personalDataSource, 'record?.employeeId === employeeId');
        assert.ok(!personalDataSource.includes('actorEmail: cleanText'));
        assert.includes(uiSource, 'dayDetailsPolicy.showDailyNote');
        assert.includes(uiSource, 'dayDetailsPolicy.showExtraHours');
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
        assert.includes(source, "timeClock.errors.permissionDenied");
    });

    test('separates daily, history, overtime, management, and configuration workspaces', async () => {
        const response = await fetch('../js/features/scheduling/ui-manager.js');
        assert.ok(response.ok, 'Failed to fetch scheduling UI manager');
        const source = await response.text();

        assert.includes(source, "'today',");
        assert.includes(source, "'history',");
        assert.includes(source, "['myData']");
        assert.includes(source, "['overtime']");
        assert.includes(source, "['management']");
        assert.includes(source, "['configuration']");
        assert.includes(source, 'data-time-clock-section');
        assert.includes(source, "sectionClass('today')");
        assert.includes(source, "sectionClass('history')");
        assert.includes(source, "sectionClass('myData')");
        assert.includes(source, "ownProfile?.vacationBalance?.schemaVersion === 1");
        assert.includes(source, "t('timeClock.myData.balanceTitle')");
        assert.includes(source, "sectionClass('overtime')");
    });
});
