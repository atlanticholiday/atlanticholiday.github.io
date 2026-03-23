import { describe, test, assert } from "../../../test-harness.js";
import { filterTimeClockStationEmployees, getTimeClockStationEmployeeInitials } from "../../../../js/features/scheduling/time-clock-station.js";

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
});
