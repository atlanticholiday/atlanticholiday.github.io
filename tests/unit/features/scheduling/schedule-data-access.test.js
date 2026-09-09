import { describe, test, assert } from '../../../test-harness.js';
import {
  getEmployeeDirectoryCollectionName,
  getScheduleDataAccessPlan,
  getScheduleDayDetailsPolicy
} from '../../../../js/features/scheduling/schedule-data-access.js';

describe('Schedule data access', () => {
  test('routes each access mode to the narrowest employee directory', () => {
    assert.equal(getEmployeeDirectoryCollectionName({ isTimeClockStation: true }), 'attendance_station_directory');
    assert.equal(getEmployeeDirectoryCollectionName({ isLimitedScheduleUser: true }), 'schedule_directory');
    assert.equal(getEmployeeDirectoryCollectionName({
      isLimitedScheduleUser: true,
      canAccessPrivateEmployeeDirectory: true
    }), 'employees');
    assert.equal(getEmployeeDirectoryCollectionName(), 'employees');
  });

  test('does not subscribe a limited schedule account to private supporting data', () => {
    assert.deepEqual(getScheduleDataAccessPlan({
      canUseSchedule: true,
      isLimitedScheduleUser: true
    }), {
      loadVacationRecords: false,
      loadGlobalSettings: false,
      loadDailyNotes: false,
      loadShiftPresets: false
    });
  });

  test('preserves complete schedule data for management', () => {
    assert.deepEqual(getScheduleDataAccessPlan({ canUseSchedule: true }), {
      loadVacationRecords: true,
      loadGlobalSettings: true,
      loadDailyNotes: true,
      loadShiftPresets: true
    });
  });

  test('hides private day-detail fields only from limited schedule accounts', () => {
    assert.deepEqual(getScheduleDayDetailsPolicy({ isLimitedScheduleUser: true }), {
      showDailyNote: false,
      showExtraHours: false
    });
    assert.deepEqual(getScheduleDayDetailsPolicy(), {
      showDailyNote: true,
      showExtraHours: true
    });
  });
});
