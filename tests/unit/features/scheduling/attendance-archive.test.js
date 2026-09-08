import { describe, test, assert } from '../../../test-harness.js';
import {
  buildVerifiableAttendanceArchive,
  getArchivePeriodRange,
  normalizeArchivePeriod,
  sha256Hex
} from '../../../../js/features/scheduling/attendance-archive.js';

describe('Attendance verifiable archive', () => {
  test('derives the exact calendar range for a monthly archive', () => {
    assert.deepEqual(getArchivePeriodRange('2026-02'), {
      startDateKey: '2026-02-01',
      endDateKey: '2026-02-28'
    });
    assert.equal(normalizeArchivePeriod('2026-12'), '2026-12');
  });

  test('creates a deterministic SHA-256 manifest for the exported evidence', async () => {
    const archive = await buildVerifiableAttendanceArchive({
      periodKey: '2026-09',
      attendanceRecords: [{ id: 'emp-1_2026-09-08', dateKey: '2026-09-08', punches: [] }],
      overtimeRecords: [],
      canonicalEvents: [{ id: 'event-1', serverRecordedAt: { toDate: () => new Date('2026-09-08T08:00:00.000Z') } }],
      exportedAt: '2026-10-01T00:00:00.000Z'
    });

    assert.equal(archive.sha256.length, 64);
    assert.equal(await sha256Hex(archive.dataContent), archive.sha256);
    assert.includes(archive.manifestContent, archive.sha256);
    assert.includes(archive.dataContent, '2026-09-08T08:00:00.000Z');
  });
});
