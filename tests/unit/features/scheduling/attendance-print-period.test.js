import { describe, test, assert } from "../../../test-harness.js";
import {
  getAttendancePrintRange,
  normalizeAttendancePrintMode,
  shiftAttendancePrintReferenceDate
} from "../../../../js/features/scheduling/attendance-print-period.js";

function toLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

describe("attendance print period helpers", () => {
  test("defaults invalid print modes to weekly", () => {
    assert.equal(normalizeAttendancePrintMode("quarter"), "week");
    assert.equal(normalizeAttendancePrintMode(), "week");
    assert.equal(normalizeAttendancePrintMode("month"), "month");
  });

  test("resolves weekly ranges from Monday to Sunday", () => {
    const { mode, startDate, endDate } = getAttendancePrintRange(new Date("2026-03-24T10:30:00"), "week");

    assert.equal(mode, "week");
    assert.equal(toLocalDateKey(startDate), "2026-03-23");
    assert.equal(toLocalDateKey(endDate), "2026-03-29");
  });

  test("resolves monthly ranges to the full calendar month", () => {
    const { mode, startDate, endDate } = getAttendancePrintRange(new Date("2026-02-18T08:15:00"), "month");

    assert.equal(mode, "month");
    assert.equal(toLocalDateKey(startDate), "2026-02-01");
    assert.equal(toLocalDateKey(endDate), "2026-02-28");
  });

  test("shifts weekly and monthly reference dates by one visible period", () => {
    const previousWeek = shiftAttendancePrintReferenceDate(new Date("2026-03-24T10:30:00"), "week", -1);
    const nextMonth = shiftAttendancePrintReferenceDate(new Date("2026-03-24T10:30:00"), "month", 1);

    assert.equal(toLocalDateKey(previousWeek), "2026-03-16");
    assert.equal(toLocalDateKey(nextMonth), "2026-04-01");
  });
});
