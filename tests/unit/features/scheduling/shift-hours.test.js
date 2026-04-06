import { describe, test, assert } from "../../../test-harness.js";
import {
  getPaidShiftHours,
  getShiftDurationHours
} from "../../../../js/features/scheduling/shift-hours.js";

describe("shift hour helpers", () => {
  test("parses raw shift duration including overnight ranges", () => {
    assert.equal(getShiftDurationHours("9:00-18:00"), 9);
    assert.equal(getShiftDurationHours("22:00-06:00"), 8);
  });

  test("deducts a lunch hour from paid time for shifts of six hours or more", () => {
    assert.equal(getPaidShiftHours("9:00-18:00"), 8);
    assert.equal(getPaidShiftHours("08:00-14:00"), 5);
    assert.equal(getPaidShiftHours("08:00-13:00"), 5);
  });

  test("returns null for non-shift values", () => {
    assert.equal(getShiftDurationHours("Holiday"), null);
    assert.equal(getPaidShiftHours(""), null);
  });
});
