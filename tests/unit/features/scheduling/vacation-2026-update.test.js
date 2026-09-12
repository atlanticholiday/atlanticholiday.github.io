import { describe, test, assert } from "../../../test-harness.js";
import {
  buildVacation2026BackupSnapshot,
  buildVacation2026UpdatePlan,
  countCalendarDaysInRanges,
  VACATION_2026_SOURCE_ROWS
} from "../../../../js/features/scheduling/vacation-2026-update.js";
import { calculateEmployeeLeaveBalanceForYear } from "../../../../js/features/scheduling/views/schedule-view-helpers.js";

describe("Vacation 2026 update", () => {
  test("reconciles every source total with the marked calendar dates", () => {
    assert.equal(VACATION_2026_SOURCE_ROWS.length, 18);

    VACATION_2026_SOURCE_ROWS.forEach((row) => {
      const markedDays = countCalendarDaysInRanges(row.ranges);
      const adjustedDays = markedDays + Number(row.usageAdjustment || 0);
      assert.equal(adjustedDays, row.reported2026Days, row.name);
      assert.equal(
        row.totalEntitlement - row.usedThrough2025 - row.reported2026Days,
        row.remaining,
        row.name
      );
    });

    assert.deepEqual(
      VACATION_2026_SOURCE_ROWS.reduce((totals, row) => ({
        entitlement: totals.entitlement + row.totalEntitlement,
        usedThrough2025: totals.usedThrough2025 + row.usedThrough2025,
        usedIn2026: totals.usedIn2026 + row.reported2026Days,
        remaining: totals.remaining + row.remaining
      }), { entitlement: 0, usedThrough2025: 0, usedIn2026: 0, remaining: 0 }),
      { entitlement: 726, usedThrough2025: 185, usedIn2026: 270, remaining: 271 }
    );
  });

  test("matches colleagues by staff number and falls back to normalized names", () => {
    const employees = VACATION_2026_SOURCE_ROWS.map((row, index) => ({
      id: `employee-${index}`,
      name: index === 1 ? "Andre Marques" : row.name,
      staffNumber: index === 1 ? null : Number(row.code.match(/^\d+/)[0])
    }));
    const plan = buildVacation2026UpdatePlan(employees);

    assert.equal(plan.items.length, 18);
    assert.deepEqual(plan.unmatched, []);
    assert.deepEqual(plan.ambiguous, []);
    assert.equal(plan.items[1].employee.name, "Andre Marques");
    assert.equal(plan.items[0].openingAllowance, 74);
  });

  test("matches the confirmed full names when newer profiles have no staff number", () => {
    const confirmedNames = new Map([
      [30, "Sofia Beatriz Cardoso Gonçalves"],
      [31, "Ruben Alexandre Teixeira Gouveia"],
      [33, "Bárbara Alexandra Mendonça Batista"]
    ]);
    const employees = VACATION_2026_SOURCE_ROWS.map((row, index) => {
      const staffNumber = Number(row.code.match(/^\d+/)[0]);
      return {
        id: `employee-${index}`,
        name: confirmedNames.get(staffNumber) || row.name,
        staffNumber: confirmedNames.has(staffNumber) ? null : staffNumber
      };
    });
    const plan = buildVacation2026UpdatePlan(employees);

    assert.equal(plan.items.length, 18);
    assert.deepEqual(plan.unmatched, []);
    assert.deepEqual(plan.ambiguous, []);
  });

  test("produces the stated remaining balance in the Vacation Center", () => {
    VACATION_2026_SOURCE_ROWS.forEach((row) => {
      const employee = {
        vacationAllowancesByYear: { "2026": row.totalEntitlement - row.usedThrough2025 },
        vacationUsageAdjustmentsByYear: { "2026": Number(row.usageAdjustment || 0) },
        vacations: row.ranges.map(([startDate, endDate]) => ({
          startDate,
          endDate,
          dayCountMode: "calendar"
        }))
      };
      const balance = calculateEmployeeLeaveBalanceForYear(employee, 2026);

      assert.equal(balance.vacationDays, row.reported2026Days, row.name);
      assert.equal(balance.vacationBalance, row.remaining, row.name);
    });
  });

  test("does not produce a partial plan silently when a colleague is missing", () => {
    const plan = buildVacation2026UpdatePlan([]);

    assert.equal(plan.items.length, 0);
    assert.equal(plan.unmatched.length, 18);
  });

  test("builds a minimal rollback snapshot before changing production data", () => {
    const employee = {
      id: "employee-30",
      name: "Sofia Beatriz Cardoso Gonçalves",
      staffNumber: 30,
      vacations: [{ startDate: "2025-12-29", endDate: "2026-01-02" }],
      vacationAllowancesByYear: { "2026": 22 },
      vacationUsageAdjustmentsByYear: { "2026": 1 },
      vacationLifetimeBaseline: { throughYear: 2025, totalEntitlement: 44 }
    };
    const snapshot = buildVacation2026BackupSnapshot({
      plan: { items: [{ employee }] },
      recordsToReplace: [{
        id: "record-1",
        employeeId: employee.id,
        startDate: "2026-01-01",
        endDate: "2026-01-02",
        type: "vacation",
        note: "Existing approved leave"
      }],
      previousUpdateRecord: { applied: false },
      createdAt: "2026-09-12T09:00:00.000Z"
    });

    assert.equal(snapshot.updateId, "calendar-2026-v2");
    assert.equal(snapshot.employeeCount, 1);
    assert.equal(snapshot.vacationRecordCount, 1);
    assert.equal(snapshot.employees[0].vacationAllowancesByYear["2026"], 22);
    assert.equal(snapshot.vacationRecords[0].note, "Existing approved leave");
    assert.deepEqual(snapshot.previousUpdateRecord, { applied: false });
  });
});
