import { describe, test, assert } from "../../../test-harness.js";
import {
  buildVacationBoardRows,
  buildVacationBoardSummary,
  getVacationBoardDepartmentOptions,
  VACATION_BOARD_UNASSIGNED_DEPARTMENT
} from "../../../../js/features/scheduling/views/vacation-board-view-model.js";

describe("Vacation board view model", () => {
  const employees = [
    { id: "emp-1", name: "Ana", department: "Operations" },
    { id: "emp-2", name: "Bruno", department: "" },
    { id: "emp-3", name: "Carla", department: "Guest Care" }
  ];

  const vacationEntries = [
    {
      id: "vac-1",
      employeeId: "emp-1",
      employeeName: "Ana",
      employeeDepartment: "Operations",
      startDate: "2026-03-10",
      endDate: "2026-03-15"
    },
    {
      id: "vac-2",
      employeeId: "emp-2",
      employeeName: "Bruno",
      employeeDepartment: null,
      startDate: "2026-03-30",
      endDate: "2026-04-02"
    }
  ];

  test("collects sorted department options including unassigned colleagues", () => {
    assert.deepEqual(
      getVacationBoardDepartmentOptions(employees),
      ["Guest Care", "Operations", VACATION_BOARD_UNASSIGNED_DEPARTMENT]
    );
  });

  test("builds rows with month segments, counts, and active filters", () => {
    const rows = buildVacationBoardRows(employees, vacationEntries, 2026, {
      currentEmployeeId: "emp-2",
      today: new Date(2026, 2, 12)
    });

    assert.deepEqual(rows.map((row) => row.name), ["Bruno", "Ana", "Carla"]);
    assert.equal(rows[0].isCurrentUser, true);
    assert.equal(rows[1].awayToday, true);
    assert.equal(rows[1].totalBookedDays, 6);
    assert.equal(rows[1].monthSegments[2].segments[0].label, "10-15");
    assert.equal(rows[0].monthSegments[2].segments[0].label, "30-31");
    assert.equal(rows[0].monthSegments[3].segments[0].label, "1-2");

    const operationsOnly = buildVacationBoardRows(employees, vacationEntries, 2026, {
      department: "Operations",
      today: new Date(2026, 2, 12)
    });
    assert.deepEqual(operationsOnly.map((row) => row.name), ["Ana"]);

    const searchedRows = buildVacationBoardRows(employees, vacationEntries, 2026, {
      search: "guest",
      today: new Date(2026, 2, 12)
    });
    assert.deepEqual(searchedRows.map((row) => row.name), ["Carla"]);
  });

  test("builds summary metrics for the board sidebar", () => {
    const summary = buildVacationBoardSummary(employees, vacationEntries, 2026, {
      today: new Date(2026, 2, 1)
    });

    assert.equal(summary.awayTodayCount, 0);
    assert.equal(summary.plannedColleaguesCount, 2);
    assert.equal(summary.busiestMonthIndex, 2);
    assert.equal(summary.busiestMonthCount, 2);
    assert.equal(summary.nextDeparture.employeeId, "emp-1");
    assert.equal(summary.upcomingVacations.length, 2);
  });
});
