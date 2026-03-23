import { describe, test, assert } from "../../../test-harness.js";
import {
  buildSharedVacationEntries,
  createVacationRecord,
  getVacationRecordDocId,
  groupVacationRecordsByEmployee,
  mergeEmployeeVacations
} from "../../../../js/features/scheduling/vacation-records.js";

describe("Vacation records", () => {
  test("creates deterministic shared vacation record ids", () => {
    const record = createVacationRecord({
      employeeId: "emp-1",
      startDate: "2026-08-10",
      endDate: "2026-08-15"
    });

    assert.equal(record.id, getVacationRecordDocId("emp-1", "2026-08-10", "2026-08-15"));
    assert.equal(record.status, "approved");
    assert.equal(record.visibility, "team");
  });

  test("groups vacation records by employee and keeps them sorted", () => {
    const recordsByEmployee = groupVacationRecordsByEmployee([
      {
        employeeId: "emp-1",
        startDate: "2026-09-03",
        endDate: "2026-09-05"
      },
      {
        employeeId: "emp-1",
        startDate: "2026-08-10",
        endDate: "2026-08-12"
      },
      {
        employeeId: "emp-2",
        startDate: "2026-07-01",
        endDate: "2026-07-02"
      }
    ]);

    assert.deepEqual(
      recordsByEmployee.get("emp-1").map((entry) => entry.startDate),
      ["2026-08-10", "2026-09-03"]
    );
    assert.deepEqual(
      recordsByEmployee.get("emp-2").map((entry) => entry.endDate),
      ["2026-07-02"]
    );
  });

  test("merges legacy employee vacations with shared records without duplicates", () => {
    const sharedRecord = createVacationRecord({
      employeeId: "emp-1",
      startDate: "2026-08-10",
      endDate: "2026-08-12"
    });

    const mergedVacations = mergeEmployeeVacations(
      [
        { startDate: "2026-08-10", endDate: "2026-08-12" },
        { startDate: "2026-09-15", endDate: "2026-09-18" }
      ],
      [
        sharedRecord,
        createVacationRecord({
          employeeId: "emp-1",
          startDate: "2026-10-01",
          endDate: "2026-10-03"
        })
      ],
      "emp-1"
    );

    assert.deepEqual(
      mergedVacations.map((entry) => `${entry.startDate}:${entry.endDate}`),
      [
        "2026-08-10:2026-08-12",
        "2026-09-15:2026-09-18",
        "2026-10-01:2026-10-03"
      ]
    );
    assert.equal(mergedVacations[0].id, sharedRecord.id);
  });

  test("builds sanitized shared entries for colleague-facing vacation views", () => {
    const entries = buildSharedVacationEntries(
      [
        {
          id: "vac-1",
          employeeId: "emp-1",
          startDate: "2026-08-10",
          endDate: "2026-08-12",
          note: " Summer break "
        },
        {
          id: "vac-2",
          employeeId: "missing-employee",
          startDate: "2026-09-01",
          endDate: "2026-09-02"
        }
      ],
      [
        { id: "emp-1", name: "Ana", department: "Operations" }
      ]
    );

    assert.equal(entries.length, 1);
    assert.equal(entries[0].employeeName, "Ana");
    assert.equal(entries[0].employeeDepartment, "Operations");
    assert.equal(entries[0].note, "Summer break");
  });
});
