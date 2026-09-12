import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  buildVacation2026BackupSnapshot,
  buildVacation2026UpdatePlan,
  VACATION_2026_SOURCE_ROWS,
  VACATION_2026_UPDATE_ID,
  VACATION_2026_UPDATE_YEAR
} from '../../js/features/scheduling/vacation-2026-update.js';
import {
  createVacationRecord,
  mergeEmployeeVacations,
  normalizeVacationEntry,
  toEmployeeVacationEntry
} from '../../js/features/scheduling/vacation-records.js';

const PROJECT_ID = 'my-work-schedule-4dc10';
const APPLY = process.argv.includes('--apply');
const projectArgument = process.argv.find((value) => value.startsWith('--project='));
if (projectArgument && projectArgument.slice('--project='.length) !== PROJECT_ID) {
  throw new Error(`Refusing to use an unexpected project: ${projectArgument}`);
}

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const accessToken = config?.tokens?.access_token;
if (!accessToken) throw new Error('Firebase CLI access token is unavailable. Run a Firebase CLI command to refresh the login.');

const databaseRoot = `projects/${PROJECT_ID}/databases/(default)/documents`;
const apiRoot = `https://firestore.googleapis.com/v1/${databaseRoot}`;

function decode(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, encode(entry)])
        )
      }
    };
  }
  return { stringValue: String(value) };
}

function encodeFields(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, encode(value)])
  );
}

function documentId(name = '') {
  return decodeURIComponent(name.split('/').pop() || '');
}

function documentName(collectionName, id) {
  return `${databaseRoot}/${collectionName}/${id}`;
}

async function requestJson(url, options = {}, { allowMissing = false } = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore REST ${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function getDocument(collectionName, id) {
  const raw = await requestJson(`${apiRoot}/${collectionName}/${id}`, {}, { allowMissing: true });
  return raw ? { id: documentId(raw.name), ...decodeFields(raw.fields) } : null;
}

async function listCollection(collectionName) {
  const documents = [];
  let pageToken = '';
  do {
    const url = new URL(`${apiRoot}/${collectionName}`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const raw = await requestJson(url);
    documents.push(...(raw.documents || []).map((entry) => ({
      id: documentId(entry.name),
      ...decodeFields(entry.fields)
    })));
    pageToken = raw.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function splitOutsideYear(vacation, employeeId, year) {
  const normalized = normalizeVacationEntry(vacation, { employeeId });
  if (!normalized) return [];
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  if (normalized.type !== 'vacation' || normalized.endDate < yearStart || normalized.startDate > yearEnd) {
    return [normalized];
  }
  const segments = [];
  if (normalized.startDate < yearStart) {
    segments.push(createVacationRecord({
      employeeId: normalized.employeeId,
      startDate: normalized.startDate,
      endDate: `${year - 1}-12-31`,
      type: normalized.type,
      status: normalized.status,
      note: normalized.note,
      visibility: normalized.visibility,
      dayCountMode: normalized.dayCountMode
    }, { source: normalized.source || 'planner', visibility: normalized.visibility }));
  }
  if (normalized.endDate > yearEnd) {
    segments.push(createVacationRecord({
      employeeId: normalized.employeeId,
      startDate: `${year + 1}-01-01`,
      endDate: normalized.endDate,
      type: normalized.type,
      status: normalized.status,
      note: normalized.note,
      visibility: normalized.visibility,
      dayCountMode: normalized.dayCountMode
    }, { source: normalized.source || 'planner', visibility: normalized.visibility }));
  }
  return segments.filter(Boolean);
}

function serializeEmployeeVacations(vacations, employeeId) {
  return vacations
    .map((vacation) => toEmployeeVacationEntry(vacation, employeeId))
    .filter(Boolean)
    .map((vacation) => ({
      id: vacation.id,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      type: vacation.type,
      status: vacation.status,
      note: vacation.note,
      visibility: vacation.visibility,
      source: vacation.source,
      dayCountMode: vacation.dayCountMode
    }));
}

function vacationRecordPayload(record) {
  return {
    employeeId: record.employeeId,
    startDate: record.startDate,
    endDate: record.endDate,
    type: record.type,
    status: record.status,
    visibility: record.visibility,
    note: record.note,
    source: record.source || VACATION_2026_UPDATE_ID,
    dayCountMode: record.dayCountMode
  };
}

function rangesForEmployee(records, employeeId) {
  return records
    .filter((record) => (
      record.employeeId === employeeId
      && record.type === 'vacation'
      && record.startDate >= '2026-01-01'
      && record.endDate <= '2026-12-31'
    ))
    .map((record) => [record.startDate, record.endDate])
    .sort((left, right) => left.join('|').localeCompare(right.join('|')));
}

async function loadState() {
  const [settings, employees, vacationRecords] = await Promise.all([
    getDocument('settings', 'global'),
    listCollection('employees'),
    listCollection('vacation_records')
  ]);
  return { settings, employees, vacationRecords };
}

function prepare(state) {
  const plan = buildVacation2026UpdatePlan(state.employees);
  if (plan.unmatched.length || plan.ambiguous.length || plan.items.length !== VACATION_2026_SOURCE_ROWS.length) {
    throw new Error(`Unsafe employee match: ${JSON.stringify({ unmatched: plan.unmatched, ambiguous: plan.ambiguous, matched: plan.items.length })}`);
  }
  const matchedEmployeeIds = new Set(plan.items.map((item) => item.employee.id));
  const recordsToReplace = state.vacationRecords.filter((record) => (
    matchedEmployeeIds.has(record.employeeId)
    && record.type === 'vacation'
    && record.startDate <= `${VACATION_2026_UPDATE_YEAR}-12-31`
    && record.endDate >= `${VACATION_2026_UPDATE_YEAR}-01-01`
  ));
  const replacementRecords = new Map();
  const importedRecordsByEmployee = new Map();
  recordsToReplace.forEach((record) => {
    splitOutsideYear(record, record.employeeId, VACATION_2026_UPDATE_YEAR)
      .forEach((segment) => replacementRecords.set(segment.id, segment));
  });
  plan.items.forEach((item) => {
    const imported = item.ranges.map(({ startDate, endDate }) => createVacationRecord({
      employeeId: item.employee.id,
      startDate,
      endDate,
      type: 'vacation',
      dayCountMode: 'calendar'
    }, { source: VACATION_2026_UPDATE_ID })).filter(Boolean);
    importedRecordsByEmployee.set(item.employee.id, imported);
    imported.forEach((record) => replacementRecords.set(record.id, record));
  });
  const deleteIds = recordsToReplace
    .map((record) => record.id)
    .filter((id) => !replacementRecords.has(id));
  const estimatedWrites = deleteIds.length + replacementRecords.size + plan.items.length + 2;
  if (estimatedWrites > 500) throw new Error(`Migration requires ${estimatedWrites} writes; limit is 500.`);
  return { plan, recordsToReplace, replacementRecords, importedRecordsByEmployee, deleteIds, estimatedWrites };
}

function updateWrite(collectionName, id, data, fieldPaths = null) {
  const write = {
    update: { name: documentName(collectionName, id), fields: encodeFields(data) }
  };
  if (fieldPaths) write.updateMask = { fieldPaths };
  return write;
}

function buildWrites(state, prepared, createdAt) {
  const backup = buildVacation2026BackupSnapshot({
    plan: prepared.plan,
    recordsToReplace: prepared.recordsToReplace,
    previousUpdateRecord: state.settings?.vacationDataUpdates?.[VACATION_2026_UPDATE_ID] || null,
    createdAt
  });
  const writes = [updateWrite('vacation_migration_backups', VACATION_2026_UPDATE_ID, backup)];
  prepared.deleteIds.forEach((id) => writes.push({ delete: documentName('vacation_records', id) }));
  prepared.replacementRecords.forEach((record) => {
    writes.push(updateWrite('vacation_records', record.id, vacationRecordPayload(record)));
  });
  prepared.plan.items.forEach((item) => {
    const preserved = (item.employee.vacations || [])
      .flatMap((vacation) => splitOutsideYear(vacation, item.employee.id, VACATION_2026_UPDATE_YEAR));
    const merged = mergeEmployeeVacations(
      preserved,
      prepared.importedRecordsByEmployee.get(item.employee.id) || [],
      item.employee.id
    );
    writes.push(updateWrite('employees', item.employee.id, {
      vacations: serializeEmployeeVacations(merged, item.employee.id),
      vacationAllowancesByYear: {
        ...(item.employee.vacationAllowancesByYear || {}),
        [VACATION_2026_UPDATE_YEAR]: item.openingAllowance
      },
      vacationUsageAdjustmentsByYear: {
        ...(item.employee.vacationUsageAdjustmentsByYear || {}),
        [VACATION_2026_UPDATE_YEAR]: item.usageAdjustment
      },
      vacationLifetimeBaseline: {
        throughYear: VACATION_2026_UPDATE_YEAR,
        totalEntitlement: item.sourceRow.totalEntitlement,
        usedBeforeYear: item.sourceRow.usedThrough2025,
        source: VACATION_2026_UPDATE_ID
      }
    }, [
      'vacations',
      'vacationAllowancesByYear',
      'vacationUsageAdjustmentsByYear',
      'vacationLifetimeBaseline'
    ]));
  });
  const updateRecord = {
    applied: true,
    appliedAt: createdAt,
    year: VACATION_2026_UPDATE_YEAR,
    employeeCount: prepared.plan.items.length,
    source: VACATION_2026_UPDATE_ID
  };
  writes.push(updateWrite('settings', 'global', {
    vacationDataUpdates: {
      ...(state.settings?.vacationDataUpdates || {}),
      [VACATION_2026_UPDATE_ID]: updateRecord
    }
  }, ['vacationDataUpdates']));
  return { writes, backup, updateRecord };
}

async function verify(prepared) {
  const state = await loadState();
  const applied = state.settings?.vacationDataUpdates?.[VACATION_2026_UPDATE_ID];
  const backup = await getDocument('vacation_migration_backups', VACATION_2026_UPDATE_ID);
  const employeeById = new Map(state.employees.map((employee) => [employee.id, employee]));
  const failures = [];
  if (!applied?.applied || applied.employeeCount !== prepared.plan.items.length) failures.push('settings marker');
  if (backup?.employeeCount !== prepared.plan.items.length) failures.push('rollback backup');
  prepared.plan.items.forEach((item) => {
    const employee = employeeById.get(item.employee.id);
    const expectedRanges = item.ranges
      .map(({ startDate, endDate }) => [startDate, endDate])
      .sort((left, right) => left.join('|').localeCompare(right.join('|')));
    const actualRanges = rangesForEmployee(state.vacationRecords, item.employee.id);
    if (JSON.stringify(actualRanges) !== JSON.stringify(expectedRanges)) failures.push(`${item.sourceRow.name}: vacation records`);
    if (employee?.vacationAllowancesByYear?.['2026'] !== item.openingAllowance) failures.push(`${item.sourceRow.name}: allowance`);
    if (employee?.vacationUsageAdjustmentsByYear?.['2026'] !== item.usageAdjustment) failures.push(`${item.sourceRow.name}: adjustment`);
    if (employee?.vacationLifetimeBaseline?.source !== VACATION_2026_UPDATE_ID) failures.push(`${item.sourceRow.name}: baseline`);
  });
  if (failures.length) throw new Error(`Post-migration verification failed: ${failures.join(', ')}`);
  return {
    appliedAt: applied.appliedAt,
    employeeCount: applied.employeeCount,
    backupEmployeeCount: backup.employeeCount,
    backupVacationRecordCount: backup.vacationRecordCount,
    vacationRecordsInCollection: state.vacationRecords.length,
    verificationFailures: 0
  };
}

const state = await loadState();
const existingMarker = state.settings?.vacationDataUpdates?.[VACATION_2026_UPDATE_ID];
if (existingMarker?.applied) {
  console.log(JSON.stringify({ mode: 'already-applied', update: existingMarker }, null, 2));
  process.exit(0);
}
const prepared = prepare(state);
const createdAt = new Date().toISOString();
const { writes, backup, updateRecord } = buildWrites(state, prepared, createdAt);
const report = {
  mode: APPLY ? 'apply' : 'dry-run',
  projectId: PROJECT_ID,
  updateId: VACATION_2026_UPDATE_ID,
  matchedEmployees: prepared.plan.items.length,
  unmatched: prepared.plan.unmatched,
  ambiguous: prepared.plan.ambiguous,
  recordsToReplace: prepared.recordsToReplace.length,
  recordsToDelete: prepared.deleteIds.length,
  replacementRecords: prepared.replacementRecords.size,
  estimatedWrites: writes.length
};
if (!APPLY) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const localBackupDir = path.join(process.cwd(), 'backups');
await fs.mkdir(localBackupDir, { recursive: true });
const localBackupPath = path.join(localBackupDir, `vacation-2026-${createdAt.replaceAll(':', '-')}.json`);
await fs.writeFile(localBackupPath, `${JSON.stringify({ report, backup }, null, 2)}\n`, { flag: 'wx' });
await requestJson(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`, {
  method: 'POST',
  body: JSON.stringify({ writes })
});
const verification = await verify(prepared);
console.log(JSON.stringify({ ...report, localBackupPath, updateRecord, verification }, null, 2));
