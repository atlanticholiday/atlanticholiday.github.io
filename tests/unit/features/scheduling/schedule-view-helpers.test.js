import { describe, test, assert } from "../../../test-harness.js";
import {
  calculateEmployeeLeaveBalanceForYear,
  calculateEmployeeLeaveUsageByTypeForYear,
  calculateEmployeeVacationDaysForYear,
  calculateEmployeeVacationUsageForYear,
  calculatePreviousYearLeaveStats,
  calculateTeamStats,
  calculateVacationPlannerYearSummary
} from "../../../../js/features/scheduling/views/schedule-view-helpers.js";

describe("schedule-view-helpers", () => {
  test("calculates yearly leave allowance, used weekdays, and remaining days", () => {
    const employee = {
      id: "e1",
      name: "Alex",
      vacationAdjustment: 3,
      vacations: [
        { startDate: "2026-01-05", endDate: "2026-01-09" },
        { startDate: "2026-02-07", endDate: "2026-02-08" }
      ]
    };

    const balance = calculateEmployeeLeaveBalanceForYear(employee, 2026);

    assert.equal(balance.vacationAllowance, 25);
    assert.equal(balance.vacationDays, 5);
    assert.equal(balance.vacationBalance, 20);
    assert.equal(balance.unusedVacationDays, 20);
  });

  test("uses a year-specific allowance without changing other years", () => {
    const employee = {
      vacationAdjustment: 2,
      vacationAllowancesByYear: { "2025": 18, "2026": 27 },
      vacations: [{ startDate: "2026-01-05", endDate: "2026-01-09" }]
    };

    assert.equal(calculateEmployeeLeaveBalanceForYear(employee, 2025).vacationAllowance, 18);
    assert.equal(calculateEmployeeLeaveBalanceForYear(employee, 2026).vacationAllowance, 27);
    assert.equal(calculateEmployeeLeaveBalanceForYear(employee, 2026).vacationBalance, 22);
    assert.equal(calculateEmployeeLeaveBalanceForYear(employee, 2024).vacationAllowance, 24);

    const summary = calculateVacationPlannerYearSummary([employee], 2026, new Date("2026-08-08T12:00:00"));
    assert.equal(summary.rows[0].hasYearlyOverride, true);
  });

  test("adds start allowance and previous year unused days to team stats", () => {
    const employees = [
      {
        id: "e1",
        name: "Alex",
        vacationAdjustment: 2,
        vacations: [
          { startDate: "2025-03-03", endDate: "2025-03-07" },
          { startDate: "2026-04-06", endDate: "2026-04-10" }
        ],
        extraHours: { "2026-04-10": 2.5 }
      }
    ];

    const dataManager = {
      getActiveEmployees() {
        return employees;
      }
    };

    const [stat] = calculateTeamStats(dataManager, 2026);

    assert.equal(stat.vacationAllowance, 24);
    assert.equal(stat.vacationDays, 5);
    assert.equal(stat.vacationBalance, 19);
    assert.equal(stat.previousYearUnusedVacationDays, 19);
    assert.equal(stat.extraHours, 2.5);
  });

  test("summarizes unused vacation days for previous years", () => {
    const employees = [
      {
        id: "e1",
        name: "Alex",
        vacationAdjustment: 0,
        vacations: [{ startDate: "2025-05-05", endDate: "2025-05-09" }]
      },
      {
        id: "e2",
        name: "Sam",
        vacationAdjustment: 1,
        vacations: [{ startDate: "2025-06-02", endDate: "2025-06-13" }]
      }
    ];

    const dataManager = {
      getActiveEmployees() {
        return employees;
      }
    };

    const [year2025] = calculatePreviousYearLeaveStats(dataManager, 2026, 1);

    assert.equal(year2025.year, 2025);
    assert.equal(year2025.vacationAllowance, 45);
    assert.equal(year2025.vacationDays, 15);
    assert.equal(year2025.unusedVacationDays, 30);
    assert.equal(year2025.colleaguesWithUnusedDays, 2);
  });

  test("separates taken and future booked weekdays", () => {
    const employee = {
      vacations: [
        { startDate: "2026-01-05", endDate: "2026-01-09" },
        { startDate: "2026-09-07", endDate: "2026-09-11" }
      ]
    };

    const usage = calculateEmployeeVacationUsageForYear(employee, 2026, new Date("2026-08-08T12:00:00"));

    assert.deepEqual(usage, { takenDays: 5, plannedDays: 5, recordedDays: 10 });
  });

  test("does not double count overlapping vacation records", () => {
    const employee = {
      vacations: [
        { startDate: "2026-03-02", endDate: "2026-03-06" },
        { startDate: "2026-03-05", endDate: "2026-03-09" }
      ]
    };

    assert.equal(calculateEmployeeVacationDaysForYear(employee, 2026), 6);
  });

  test("excludes public holidays and follows each colleague's working week", () => {
    const employee = {
      workDays: [4, 5],
      vacations: [{ startDate: "2026-01-01", endDate: "2026-01-02" }]
    };

    assert.equal(calculateEmployeeVacationDaysForYear(employee, 2026, {
      "2026-01-01": "New Year's Day"
    }), 1);
  });

  test("keeps non-vacation absence types out of the vacation balance", () => {
    const employee = {
      vacations: [
        { startDate: "2026-01-05", endDate: "2026-01-05", type: "vacation" },
        { startDate: "2026-01-06", endDate: "2026-01-06", type: "sick" },
        { startDate: "2026-01-07", endDate: "2026-01-07", type: "training" }
      ]
    };

    assert.equal(calculateEmployeeVacationDaysForYear(employee, 2026), 1);
    const usage = calculateEmployeeLeaveUsageByTypeForYear(employee, 2026, new Date("2026-12-31T12:00:00"));
    assert.equal(usage.vacation.recordedDays, 1);
    assert.equal(usage.sick.recordedDays, 1);
    assert.equal(usage.training.recordedDays, 1);
  });

  test("expires only the carry-over that was not used before its deadline", () => {
    const employee = {
      vacationAllowancesByYear: { "2027": 27 },
      vacationCarryOverByYear: { "2027": 5 },
      vacationCarryOverExpiryByYear: { "2027": "2027-03-31" },
      vacations: [{ startDate: "2027-03-01", endDate: "2027-03-02" }]
    };

    const balance = calculateEmployeeLeaveBalanceForYear(employee, 2027, {}, new Date("2027-04-01T12:00:00"));
    assert.equal(balance.vacationAllowance, 24);
    assert.equal(balance.expiredCarryOver, 3);
    assert.equal(balance.vacationBalance, 22);
  });

  test("builds planner totals without letting overbooking hide another colleague's remaining days", () => {
    const summary = calculateVacationPlannerYearSummary([
      {
        id: "e1",
        name: "Alex",
        vacations: [{ startDate: "2025-01-06", endDate: "2025-02-07" }]
      },
      {
        id: "e2",
        name: "Sam",
        vacations: [{ startDate: "2025-06-02", endDate: "2025-06-06" }]
      }
    ], 2025, new Date("2026-08-08T12:00:00"));

    assert.equal(summary.vacationAllowance, 44);
    assert.equal(summary.recordedDays, 30);
    assert.equal(summary.unusedVacationDays, 17);
    assert.equal(summary.overbookedDays, 3);
    assert.equal(summary.colleaguesOverbooked, 1);
  });
});
