import { describe, test, assert } from "../../../test-harness.js";
import {
  applyAttendancePinKey,
  filterTimeClockStationEmployees,
  getTimeClockStationEmployeeInitials,
  isAttendancePinReady,
  normalizeAttendancePin
} from "../../../../js/features/scheduling/time-clock-station.js";

describe("Time clock station helpers", () => {
  test("filters colleagues by name, accents, and staff number", () => {
    const employees = [
      { id: "1", name: "Ana Silva", staffNumber: 14, department: "Cleaning" },
      { id: "2", name: "João Sousa", staffNumber: 28, department: "Laundry" },
      { id: "3", name: "Carla Mendes", staffNumber: 42, department: "Reception" }
    ];

    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "joao").map((employee) => employee.id),
      ["2"]
    );
    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "42").map((employee) => employee.id),
      ["3"]
    );
    assert.deepEqual(
      filterTimeClockStationEmployees(employees, "ana clean").map((employee) => employee.id),
      ["1"]
    );
  });

  test("returns concise initials for station cards", () => {
    assert.equal(getTimeClockStationEmployeeInitials("Ana Silva"), "AS");
    assert.equal(getTimeClockStationEmployeeInitials(" João "), "J");
    assert.equal(getTimeClockStationEmployeeInitials(""), "--");
  });

  test("normalizes PIN input and enforces the tablet length limits", () => {
    assert.equal(normalizeAttendancePin("12a 34-56"), "123456");
    assert.equal(normalizeAttendancePin("123456789012"), "1234567890");
    assert.equal(isAttendancePinReady("12345"), false);
    assert.equal(isAttendancePinReady("123456"), true);
    assert.equal(isAttendancePinReady("1234567890"), true);
  });

  test("applies number-pad keys without leaking non-numeric input", () => {
    assert.equal(applyAttendancePinKey("12345", "6"), "123456");
    assert.equal(applyAttendancePinKey("123456", "backspace"), "12345");
    assert.equal(applyAttendancePinKey("123456", "clear"), "");
    assert.equal(applyAttendancePinKey("123456", "x"), "123456");
  });
});
