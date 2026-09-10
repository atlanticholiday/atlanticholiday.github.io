import { describe, test, assert } from '../../../test-harness.js';
import {
  buildSelfServiceDirectoryEntries,
  buildSelfServiceProfileEntry,
  buildSelfServiceProfileTombstone,
  buildSelfServiceVacationBalance,
  buildSelfServiceVacationEntries
} from '../../../../js/features/scheduling/self-service-directory.js';

describe('Self-service directory', () => {
  test('projects only the personal profile fields intended for the employee', () => {
    const entry = buildSelfServiceProfileEntry({
      id: 'employee-1',
      name: ' Ana Silva ',
      staffNumber: '17',
      email: 'ana@example.com',
      phone: '+351 900 000 000',
      department: 'Operations',
      position: 'Host',
      hireDate: '2024-05-06',
      employmentType: 'Permanent',
      workDays: [5, 1, 1, 7],
      shifts: { default: '09:00-18:00', 1: '10:00-19:00', private: 'secret' },
      notes: 'private management note',
      extraHoursNotes: { '2026-09-09': 'private overtime note' },
      attendancePinHash: 'secret-hash'
    });

    assert.deepEqual(entry, {
      id: 'employee-1',
      data: {
        employeeId: 'employee-1',
        name: 'Ana Silva',
        staffNumber: 17,
        email: 'ana@example.com',
        phone: '+351 900 000 000',
        department: 'Operations',
        position: 'Host',
        hireDate: '2024-05-06',
        employmentType: 'Permanent',
        workDays: [1, 5],
        shifts: { 1: '10:00-19:00', default: '09:00-18:00' },
        vacationBalance: null,
        active: true,
        schemaVersion: 1
      }
    });
  });

  test('creates an inactive tombstone without retaining personal data', () => {
    assert.deepEqual(buildSelfServiceProfileTombstone('employee-1'), {
      employeeId: 'employee-1',
      name: 'Inactive profile',
      staffNumber: null,
      email: null,
      phone: null,
      department: null,
      position: null,
      hireDate: null,
      employmentType: null,
      workDays: [],
      shifts: {},
      vacationBalance: null,
      active: false,
      schemaVersion: 1
    });
  });

  test('uses the canonical vacation calculation for the personal yearly balance', () => {
    const employee = {
      id: 'employee-1',
      name: 'Ana Silva',
      workDays: [1, 2, 3, 4, 5],
      vacationAllowancesByYear: { 2026: 25 },
      vacations: [{
        startDate: '2026-09-01',
        endDate: '2026-09-05',
        type: 'vacation',
        dayCountMode: 'workdays'
      }]
    };
    const options = {
      year: 2026,
      referenceDate: new Date('2026-09-02T12:00:00'),
      holidays: { '2026-09-04': 'Municipal holiday' }
    };

    assert.deepEqual(buildSelfServiceVacationBalance(employee, options), {
      year: 2026,
      allowanceDays: 25,
      takenDays: 2,
      plannedDays: 1,
      recordedDays: 3,
      remainingDays: 22,
      schemaVersion: 1
    });
    assert.deepEqual(
      buildSelfServiceDirectoryEntries([employee], options).profiles[0].data.vacationBalance,
      buildSelfServiceVacationBalance(employee, options)
    );
  });

  test('projects own leave details without notes or management metadata', () => {
    const entries = buildSelfServiceVacationEntries([{
      id: 'employee-1',
      name: 'Ana Silva',
      vacations: [{
        id: 'private-source-id',
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        type: 'sick',
        status: 'approved',
        note: 'medical detail',
        visibility: 'management',
        source: 'manager',
        approvedBy: 'manager@example.com'
      }]
    }]);

    assert.deepEqual(entries, [{
      id: 'employee-1__2026-10-01__2026-10-05',
      employeeId: 'employee-1',
      data: {
        startDate: '2026-10-01',
        endDate: '2026-10-05',
        type: 'sick',
        status: 'approved',
        dayCountMode: 'workdays',
        schemaVersion: 1
      }
    }]);
    assert.ok(!Object.hasOwn(entries[0].data, 'note'));
    assert.ok(!Object.hasOwn(entries[0].data, 'approvedBy'));
  });

  test('excludes archived employees and invalid leave ranges', () => {
    const directory = buildSelfServiceDirectoryEntries([
      { id: 'active', name: 'Active', vacations: [{ startDate: 'invalid', endDate: '2026-01-02' }] },
      { id: 'archived', name: 'Archived', isArchived: true, vacations: [{ startDate: '2026-01-01', endDate: '2026-01-02' }] }
    ]);

    assert.deepEqual(directory.profiles.map((entry) => entry.id), ['active']);
    assert.deepEqual(directory.vacations, []);
  });
});
