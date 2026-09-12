import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const emulatorPort = Number.parseInt(process.argv[2] || '8080', 10);

function startServer() {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const filePath = path.normalize(path.join(rootDir, pathname));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const type = path.extname(filePath) === '.js' ? 'application/javascript' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

function firestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
  if (value && typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, firestoreValue(item)])) } };
  }
  return { stringValue: String(value) };
}

async function seed(collectionName, documentId, fields) {
  const url = `http://127.0.0.1:${emulatorPort}/v1/projects/demo-horario/databases/(default)/documents/${collectionName}/${documentId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, firestoreValue(value)])) })
  });
  if (!response.ok) throw new Error(`Failed to seed ${collectionName}/${documentId}: ${response.status} ${await response.text()}`);
}

await seed('userAccess', 'worker-uid', { active: true, roles: ['employee'], allowedApps: [], linkedEmployeeId: 'emp-1' });
await seed('userAccess', 'admin-uid', { active: true, roles: ['admin'], allowedApps: [], linkedEmployeeId: '' });
await seed('userAccess', 'staff-uid', { active: true, roles: ['employee'], allowedApps: ['staff'], linkedEmployeeId: 'emp-1' });
await seed('userAccess', 'vacation-uid', { active: true, roles: ['employee'], allowedApps: ['vacationCenter'], linkedEmployeeId: 'emp-1' });
await seed('userAccess', 'linked-uid', { active: true, roles: [], allowedApps: [], linkedEmployeeId: 'emp-1' });
await seed('userAccess', 'station-uid', { active: true, roles: ['time-clock-station'], allowedApps: [], linkedEmployeeId: '' });
await seed('employees', 'emp-1', { name: 'Worker', isArchived: false });
await seed('employees', 'emp-2', { name: 'Station Worker', isArchived: false });
await seed('employee_self_service', 'emp-1', {
  employeeId: 'emp-1', name: 'Worker', staffNumber: 1, email: 'worker@example.com', phone: null,
  department: 'Operations', position: 'Host', hireDate: '2024-01-08', employmentType: 'Permanent',
  workDays: [1, 2, 3, 4, 5], shifts: { default: '09:00-18:00' },
  vacationBalance: { year: 2026, allowanceDays: 22, takenDays: 5, plannedDays: 3, recordedDays: 8, remainingDays: 14, schemaVersion: 1 },
  active: true, schemaVersion: 1, updatedAtServer: ''
});
await seed('employee_self_service', 'emp-2', {
  employeeId: 'emp-2', name: 'Station Worker', staffNumber: 2, email: 'peer@example.com', phone: null,
  department: 'Operations', position: 'Host', hireDate: '2024-02-01', employmentType: 'Permanent',
  workDays: [1, 2, 3, 4, 5], shifts: { default: '09:00-18:00' },
  vacationBalance: { year: 2026, allowanceDays: 22, takenDays: 2, plannedDays: 0, recordedDays: 2, remainingDays: 20, schemaVersion: 1 },
  active: true, schemaVersion: 1, updatedAtServer: ''
});
await seed('employee_self_service/emp-1/vacation_records', 'emp-1__2026-09-14__2026-09-18', {
  startDate: '2026-09-14', endDate: '2026-09-18', type: 'vacation', status: 'approved',
  dayCountMode: 'workdays', schemaVersion: 1, updatedAtServer: ''
});
await seed('employee_self_service/emp-2/vacation_records', 'emp-2__2026-09-21__2026-09-25', {
  startDate: '2026-09-21', endDate: '2026-09-25', type: 'sick', status: 'approved',
  dayCountMode: 'workdays', schemaVersion: 1, updatedAtServer: ''
});
await seed('employee_data_correction_requests', 'own-correction-seeded', {
  employeeId: 'emp-1', requesterUid: 'worker-uid', category: 'profile', referenceDate: '2026-09-10',
  description: 'My phone number is incorrect.', status: 'submitted', resolutionNote: null,
  reviewedByUid: null, resolvedAtServer: null, createdAtServer: '', updatedAtServer: ''
});
await seed('employee_data_correction_requests', 'peer-correction-seeded', {
  employeeId: 'emp-2', requesterUid: 'peer-uid', category: 'attendance', referenceDate: '2026-09-09',
  description: 'A colleague correction request.', status: 'submitted', resolutionNote: null,
  reviewedByUid: null, resolvedAtServer: null, createdAtServer: '', updatedAtServer: ''
});
await seed('overtime_records', 'peer-overtime-seeded', { employeeId: 'emp-2', employeeName: 'Station Worker' });
await seed('vacation_records', 'own-vacation-seeded', {
  employeeId: 'emp-1', startDate: '2026-09-14', endDate: '2026-09-18',
  type: 'vacation', status: 'approved', note: 'Private own vacation note'
});
await seed('vacation_records', 'peer-vacation-seeded', {
  employeeId: 'emp-2', startDate: '2026-09-21', endDate: '2026-09-25',
  type: 'sick', status: 'approved', note: 'Private peer absence note'
});
await seed('attendance_credentials', 'clock-test@example.com', {
  email: 'clock-test@example.com', employeeId: 'emp-2', employeeName: 'Station Worker', active: true, createdAt: ''
});
await seed('attendance_station_directory', 'emp-1', {
  employeeId: 'emp-1', name: 'Worker', attendancePinConfigured: true,
  attendancePinLoginEmail: 'clock-test@example.com', isArchived: false,
  status: 'clocked-out', lastEventType: '', lastOccurredAtEpochMs: '', updatedAtServer: ''
});
await seed('attendance_station_directory', 'emp-2', {
  employeeId: 'emp-2', name: 'Station Worker', attendancePinConfigured: true,
  attendancePinLoginEmail: 'clock-test@example.com', isArchived: false,
  status: 'clocked-out', lastEventType: '', lastOccurredAtEpochMs: '', updatedAtServer: ''
});
await seed('taskDepartments', 'general', { name: 'General', order: 0 });
await seed('tasks', 'own-task', {
  title: 'Own task', assigneeIds: ['emp-1'], assigneeAccess: { 'worker@example.com': true, 'linked@example.com': true },
  assignees: [{ id: 'emp-1', name: 'Worker' }]
});
await seed('tasks', 'peer-task', {
  title: 'Peer task', assigneeIds: ['emp-2'], assigneeAccess: { 'peer@example.com': true },
  assignees: [{ id: 'emp-2', name: 'Station Worker' }]
});

const { chromium } = await import('playwright-core');
const { server, port } = await startServer();
try {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage();
  page.on('console', (message) => console.log(`Browser ${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => console.error(`Browser page error: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/tests/firestore-rules.html?firestorePort=${emulatorPort}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__firestoreRulesResult), null, { timeout: 420000 });
  const result = await page.evaluate(() => window.__firestoreRulesResult);
  await browser.close();
  if (!result.passed) throw new Error(result.error);
  console.log('PASS Firestore rules integration');
} finally {
  server.close();
}
