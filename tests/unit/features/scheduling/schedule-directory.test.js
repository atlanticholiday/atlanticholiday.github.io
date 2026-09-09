import { describe, test, assert } from '../../../test-harness.js';
import {
  buildScheduleDirectoryEntries,
  buildScheduleDirectoryEntry,
  normalizePublicScheduleStatus
} from '../../../../js/features/scheduling/schedule-directory.js';

describe('Schedule directory projection', () => {
  test('keeps only the minimum operational schedule fields', () => {
    const entry = buildScheduleDirectoryEntry({
      id: 'employee-1',
      name: '  Ana Silva  ',
      department: ' Limpeza ',
      staffNumber: 17,
      email: 'ana@example.com',
      phone: '910000000',
      hireDate: '2024-01-02',
      employmentType: 'full-time',
      notes: 'private note',
      workDays: [5, 1, 1, 8],
      shifts: { default: '08:00-16:00', 1: '09:00-17:00', private: 'secret' },
      overrides: {
        '2026-09-10': 'Sick',
        '2026-09-11': 'Personal',
        invalid: 'Working'
      },
      vacations: [{
        startDate: '2026-10-01', endDate: '2026-10-05', type: 'vacation', status: 'approved',
        note: 'private vacation reason', approvedBy: 'manager@example.com'
      }],
      extraHours: { '2026-09-10': 2 },
      extraHoursNotes: { '2026-09-10': 'private overtime reason' }
    });

    assert.deepEqual(entry, {
      id: 'employee-1',
      data: {
        name: 'Ana Silva',
        department: 'Limpeza',
        workDays: [1, 5],
        shifts: { 1: '09:00-17:00', default: '08:00-16:00' },
        overrides: {
          '2026-09-10': 'Absent',
          '2026-09-11': 'Absent'
        },
        availabilityPeriods: [{ startDate: '2026-10-01', endDate: '2026-10-05', status: 'Vacation' }],
        schemaVersion: 1
      }
    });
    assert.equal(JSON.stringify(entry).includes('ana@example.com'), false);
    assert.equal(JSON.stringify(entry).includes('private'), false);
  });

  test('collapses detailed absence reasons into a generic status', () => {
    assert.equal(normalizePublicScheduleStatus('Working'), 'Working');
    assert.equal(normalizePublicScheduleStatus('Scheduled Off'), 'Off');
    assert.equal(normalizePublicScheduleStatus('On Vacation'), 'Vacation');
    assert.equal(normalizePublicScheduleStatus('Sick'), 'Absent');
    assert.equal(normalizePublicScheduleStatus('Unjustified'), 'Absent');
  });

  test('excludes archived and invalid employees and pending leave', () => {
    const entries = buildScheduleDirectoryEntries([
      { id: 'active', name: 'Active', workDays: [], vacations: [{ startDate: '2026-09-20', endDate: '2026-09-21', status: 'pending' }] },
      { id: 'archived', name: 'Archived', isArchived: true },
      { id: 'missing-name', name: '' }
    ]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].id, 'active');
    assert.deepEqual(entries[0].data.availabilityPeriods, []);
  });
});
