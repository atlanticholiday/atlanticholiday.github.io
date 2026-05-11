import { describe, test, assert } from "../../../test-harness.js";
import {
  calculateEmployeeLeaveBalanceForYear,
  calculatePreviousYearLeaveStats,
  calculateTeamStats
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
});
