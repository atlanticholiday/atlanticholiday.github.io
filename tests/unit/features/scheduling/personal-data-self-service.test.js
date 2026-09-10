import { describe, test, assert } from '../../../test-harness.js';
import {
  buildPersonalDataExport,
  buildPersonalYearSummary,
  getPersonalDataYears,
  normalizeCorrectionRequestInput
} from '../../../../js/features/scheduling/personal-data-self-service.js';

const attendanceRecord = (employeeId, dateKey) => ({
  id: `${employeeId}_${dateKey}`,
  employeeId,
  dateKey,
  punches: [
    { id: 'in', type: 'clockIn', occurredAt: `${dateKey}T09:00:00`, source: 'web', actorEmail: 'private@example.com' },
    { id: 'out', type: 'clockOut', occurredAt: `${dateKey}T17:00:00`, source: 'web', actorEmail: 'private@example.com' }
  ],
  corrections: [],
  voidedEventIds: [],
  review: { status: 'reviewed', note: 'Confirmed', reviewedBy: 'manager@example.com' }
});

describe('Personal data self-service', () => {
  test('builds a yearly summary using only the linked employee records', () => {
    const summary = buildPersonalYearSummary({
      employeeId: 'employee-1',
      year: 2026,
      attendanceRecords: [attendanceRecord('employee-1', '2026-09-10'), attendanceRecord('employee-2', '2026-09-10')],
      overtimeRecords: [
        { employeeId: 'employee-1', dateKey: '2026-09-10', status: 'manager-reviewed', startEvent: { occurredAt: '2026-09-10T18:00:00' }, endEvent: { occurredAt: '2026-09-10T19:30:00' } },
        { employeeId: 'employee-2', dateKey: '2026-09-10', status: 'in-progress' }
      ],
      vacations: [{ startDate: '2026-10-01', endDate: '2026-10-02', type: 'vacation' }],
      correctionRequests: [
        { employeeId: 'employee-1', referenceDate: '2026-09-10', status: 'submitted' },
        { employeeId: 'employee-2', referenceDate: '2026-09-10', status: 'submitted' }
      ]
    });

    assert.equal(summary.attendance.workedMinutes, 480);
    assert.equal(summary.attendance.daysWithRecords, 1);
    assert.equal(summary.overtime.completedMinutes, 90);
    assert.equal(summary.overtime.recordCount, 1);
    assert.equal(summary.leave.vacationCount, 1);
    assert.deepEqual(summary.corrections, { total: 1, open: 1 });
  });

  test('exports only allowlisted own fields and strips other identities', () => {
    const exported = buildPersonalDataExport({
      employeeId: 'employee-1',
      profile: { employeeId: 'employee-1', name: 'Ana', notes: 'internal', shifts: {}, workDays: [] },
      vacations: [
        { id: 'own-leave', employeeId: 'employee-1', startDate: '2026-10-01', endDate: '2026-10-02', type: 'vacation' },
        { id: 'peer-leave', employeeId: 'employee-2', startDate: '2026-11-01', endDate: '2026-11-02', type: 'vacation' }
      ],
      attendanceRecords: [attendanceRecord('employee-1', '2026-09-10'), attendanceRecord('employee-2', '2026-09-10')],
      overtimeRecords: [{ employeeId: 'employee-2', dateKey: '2026-09-10', authorizedBy: 'manager@example.com' }],
      correctionRequests: [{ employeeId: 'employee-1', description: 'Correct my phone', status: 'submitted', reviewedByUid: 'manager-uid' }],
      generatedAt: new Date('2026-09-10T12:00:00Z')
    });

    assert.equal(exported.attendanceRecords.length, 1);
    assert.equal(exported.overtimeRecords.length, 0);
    assert.deepEqual(exported.vacations.map((entry) => entry.id), ['own-leave']);
    assert.ok(!Object.hasOwn(exported.profile, 'notes'));
    assert.ok(!Object.hasOwn(exported.attendanceRecords[0].punches[0], 'actorEmail'));
    assert.ok(!Object.hasOwn(exported.correctionRequests[0], 'reviewedByUid'));
    assert.equal(exported.generatedAt, '2026-09-10T12:00:00.000Z');
  });

  test('normalizes correction requests and rejects short descriptions', () => {
    assert.deepEqual(normalizeCorrectionRequestInput({
      category: 'profile',
      referenceDate: '2026-09-10',
      description: '  My phone number is incorrect.  '
    }), {
      category: 'profile',
      referenceDate: '2026-09-10',
      description: 'My phone number is incorrect.'
    });
    let rejectedShortDescription = false;
    try {
      normalizeCorrectionRequestInput({ description: 'short' });
    } catch (error) {
      rejectedShortDescription = error?.code === 'correction-description-too-short';
    }
    assert.ok(rejectedShortDescription, 'Expected a short correction description to be rejected');
  });

  test('lists the current and recorded years in descending order', () => {
    assert.deepEqual(getPersonalDataYears({
      currentYear: 2026,
      attendanceRecords: [{ dateKey: '2024-01-02' }],
      overtimeRecords: [{ dateKey: '2025-04-01' }],
      vacations: [{ startDate: '2023-12-30', endDate: '2024-01-03' }],
      correctionRequests: [{ referenceDate: '2022-06-01' }]
    }), [2026, 2025, 2024, 2023, 2022]);
  });
});
