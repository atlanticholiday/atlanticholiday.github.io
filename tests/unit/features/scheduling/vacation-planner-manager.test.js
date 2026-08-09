import { describe, test, assert } from "../../../test-harness.js";
import { ScheduleManager } from "../../../../js/features/scheduling/schedule-manager.js";

describe("Vacation planner manager", () => {
  test("saves an edited remaining balance as a year-specific allowance", async () => {
    document.body.innerHTML = '<div id="vacation-planner-container"></div>';

    const employee = {
      id: "e1",
      name: "Ana",
      department: "Operations",
      vacations: [{ id: "v1", startDate: "2026-01-05", endDate: "2026-01-09" }]
    };
    const allowanceUpdates = [];
    const dataManager = {
      getActiveEmployees: () => [employee],
      getSharedVacationEntries: () => [{
        id: "v1",
        employeeId: "e1",
        employeeName: "Ana",
        startDate: "2026-01-05",
        endDate: "2026-01-09"
      }],
      getCurrentDate: () => new Date(2026, 7, 8),
      getVacationRecordById: () => null,
      async handleVacationAllowanceForYearChange(employeeId, year, allowance) {
        allowanceUpdates.push({ employeeId, year, allowance });
        employee.vacationAllowancesByYear = { [year]: allowance };
      }
    };
    const manager = new ScheduleManager(dataManager, { currentView: "vacation" });

    manager.renderVacationPlanner();
    document.querySelector('[data-edit-vacation-balance="e1"]').click();
    const input = document.querySelector('[data-vacation-balance-form="e1"] input');
    input.value = "10";
    document.querySelector('[data-vacation-balance-form="e1"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(allowanceUpdates, [{ employeeId: "e1", year: 2026, allowance: 15 }]);
  });

  test("restores the default allowance for only the selected year", async () => {
    document.body.innerHTML = '<div id="vacation-planner-container"></div>';
    const employee = {
      id: "e1",
      name: "Ana",
      vacationAllowancesByYear: { "2026": 30 },
      vacations: []
    };
    const allowanceUpdates = [];
    const dataManager = {
      getActiveEmployees: () => [employee],
      getSharedVacationEntries: () => [],
      getCurrentDate: () => new Date(2026, 7, 8),
      getVacationRecordById: () => null,
      async handleVacationAllowanceForYearChange(employeeId, year, allowance) {
        allowanceUpdates.push({ employeeId, year, allowance });
        delete employee.vacationAllowancesByYear[String(year)];
      }
    };
    const manager = new ScheduleManager(dataManager, { currentView: "vacation" });

    manager.renderVacationPlanner();
    document.querySelector('[data-edit-vacation-balance="e1"]').click();
    document.querySelector('[data-reset-vacation-balance="e1"]').click();
    await Promise.resolve();
    await Promise.resolve();

    assert.deepEqual(allowanceUpdates, [{ employeeId: "e1", year: 2026, allowance: null }]);
  });
});
