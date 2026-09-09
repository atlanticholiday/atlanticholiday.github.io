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
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
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
await seed('userAccess', 'station-uid', { active: true, roles: ['time-clock-station'], allowedApps: [], linkedEmployeeId: '' });
await seed('employees', 'emp-1', { name: 'Worker', isArchived: false });
await seed('employees', 'emp-2', { name: 'Station Worker', isArchived: false });
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

const { chromium } = await import('playwright-core');
const { server, port } = await startServer();
try {
  const browser = await chromium.launch({ executablePath: edgePath, headless: true });
  const page = await browser.newPage();
  page.on('console', (message) => console.log(`Browser ${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => console.error(`Browser page error: ${error.message}`));
  await page.goto(`http://127.0.0.1:${port}/tests/firestore-rules.html?firestorePort=${emulatorPort}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__firestoreRulesResult), null, { timeout: 180000 });
  const result = await page.evaluate(() => window.__firestoreRulesResult);
  await browser.close();
  if (!result.passed) throw new Error(result.error);
  console.log('PASS Firestore rules integration');
} finally {
  server.close();
}
