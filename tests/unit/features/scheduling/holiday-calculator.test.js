import { describe, test, assert } from "../../../test-harness.js";
import { HolidayCalculator, getDateKey } from "../../../../js/features/scheduling/holiday-calculator.js";

describe("HolidayCalculator", () => {
  test("formats date keys in yyyy-mm-dd", () => {
    assert.equal(getDateKey(new Date(2026, 0, 9)), "2026-01-09");
  });

  test("includes fixed and movable Madeira/Portugal holidays", () => {
    const calculator = new HolidayCalculator();
    const holidays = calculator.getHolidays(2026);

    assert.equal(holidays["2026-01-01"], "New Year's Day");
    assert.equal(holidays["2026-02-17"], "Carnival Tuesday");
    assert.equal(holidays["2026-04-03"], "Good Friday");
    assert.equal(holidays["2026-04-05"], "Easter Sunday");
    assert.equal(holidays["2026-06-04"], "Corpus Christi");
    assert.equal(holidays["2026-12-26"], "Boxing Day");
  });

  test("caches holiday maps per year", () => {
    const calculator = new HolidayCalculator();
    const first = calculator.getHolidays(2027);
    const second = calculator.getHolidays(2027);

    assert.equal(first, second);
  });
});
