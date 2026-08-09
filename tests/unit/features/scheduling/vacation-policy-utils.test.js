import { describe, test, assert } from "../../../test-harness.js";
import { buildVacationYearClosePlan } from "../../../../js/features/scheduling/vacation-policy-utils.js";

describe("vacation-policy-utils", () => {
  test("caps carry-over and preserves a pre-existing next-year allowance", () => {
    const plan = buildVacationYearClosePlan([
      {
        id: "e1",
        vacationAllowancesByYear: { "2027": 25 },
        vacations: [{ startDate: "2026-01-05", endDate: "2026-01-30" }]
      },
      {
        id: "e2",
        vacationAdjustment: 1,
        vacations: []
      }
    ], 2026, 5);

    assert.deepEqual(plan[0], {
      employeeId: "e1",
      carryOver: 2,
      previousAllowance: 25,
      nextAllowance: 27
    });
    assert.equal(plan[1].carryOver, 5);
    assert.equal(plan[1].previousAllowance, null);
    assert.equal(plan[1].nextAllowance, 28);
  });
});
