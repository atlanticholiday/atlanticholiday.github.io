import { describe, test, assert } from "../../../test-harness.js";
import {
  buildEmployeeUpdatePayload,
  createEmployeeRecord,
  getEmployeeStatusForDate,
  partitionEmployeesByArchiveStatus
} from "../../../../js/features/scheduling/employee-records.js";

describe("Employee records", () => {
  test("creates a normalized employee record with defaults", () => {
    const employee = createEmployeeRecord({
      name: "  Ana  ",
      staffNumber: " 42 ",
      workDays: ["5", "1", "1"],
      displayOrder: 3
    });

    assert.equal(employee.name, "Ana");
    assert.equal(employee.staffNumber, 42);
    assert.deepEqual(employee.workDays, [1, 5]);
    assert.equal(employee.displayOrder, 3);
    assert.equal(employee.isArchived, false);
    assert.equal(employee.shifts.default, "9:00-18:00");
    assert.equal(employee.vacationAdjustment, 0);
  });

  test("builds trimmed update payloads and keeps optional fields explicit", () => {
    const payload = buildEmployeeUpdatePayload({
      name: "  Ana  ",
      workDays: ["3", "1"],
      staffNumber: "",
      email: " ",
      phone: " 912345678 ",
      department: " Ops ",
      notes: "  ",
      defaultShift: " 08:00-16:00 ",
      vacationAdjustment: "4"
    });

    assert.equal(payload.name, "Ana");
    assert.deepEqual(payload.workDays, [1, 3]);
    assert.equal(payload.staffNumber, null);
    assert.equal(payload.email, null);
    assert.equal(payload.phone, "912345678");
    assert.equal(payload.department, "Ops");
    assert.equal(payload.notes, null);
    assert.equal(payload["shifts.default"], "08:00-16:00");
    assert.equal(payload.vacationAdjustment, 4);
  });

  test("partitions employees by archive status using stable sort rules", () => {
    const { activeEmployees, archivedEmployees } = partitionEmployeesByArchiveStatus([
      { id: "1", name: "Zoe", displayOrder: 2, isArchived: false },
      { id: "2", name: "Amy", displayOrder: 1, isArchived: false },
      { id: "3", name: "Bruno", isArchived: true },
      { id: "4", name: "Andre", isArchived: true }
    ]);

    assert.deepEqual(activeEmployees.map(({ id }) => id), ["2", "1"]);
    assert.deepEqual(archivedEmployees.map(({ id }) => id), ["4", "3"]);
  });

  test("excludes preset test accounts from employee partitions", () => {
    const { activeEmployees, archivedEmployees } = partitionEmployeesByArchiveStatus([
      { id: "1", name: "Ana", displayOrder: 1, isArchived: false, email: "ana@example.com" },
      { id: "2", name: "Test Admin", displayOrder: 2, isArchived: false, email: "test-admin@horario.test" },
      { id: "3", name: "Legacy Test", isArchived: true, notes: "Auto-created test employee account" },
      { id: "4", name: "Bruno", isArchived: true, email: "bruno@example.com" }
    ]);

    assert.deepEqual(activeEmployees.map(({ id }) => id), ["1"]);
    assert.deepEqual(archivedEmployees.map(({ id }) => id), ["4"]);
  });

  test("derives employee status from vacation, overrides, holidays, and schedule", () => {
    const standardEmployee = {
      workDays: [1, 2, 3, 4, 5],
      overrides: {},
      vacations: []
    };

    const employeeWithExceptions = {
      workDays: [1, 2, 3, 4, 5],
      overrides: { "2026-12-25": "Working" },
      vacations: [{ startDate: "2026-08-10", endDate: "2026-08-15" }]
    };

    assert.equal(
      getEmployeeStatusForDate(employeeWithExceptions, new Date(2026, 7, 12), {}),
      "On Vacation"
    );
    assert.equal(
      getEmployeeStatusForDate(employeeWithExceptions, new Date(2026, 11, 25), { "2026-12-25": "Christmas Day" }),
      "Working"
    );
    assert.equal(
      getEmployeeStatusForDate(standardEmployee, new Date(2026, 11, 25), { "2026-12-25": "Christmas Day" }),
      "Off"
    );
    assert.equal(
      getEmployeeStatusForDate(standardEmployee, new Date(2026, 11, 28), {}),
      "Working"
    );
    assert.equal(
      getEmployeeStatusForDate(standardEmployee, new Date(2026, 11, 27), {}),
      "Scheduled Off"
    );
  });
});
