import { describe, test, assert } from "../../../test-harness.js";
import { SCHEDULE_VIEWS } from "../../../../js/features/scheduling/schedule-view-config.js";

describe("Schedule view configuration", () => {
  test("keeps editable leave management out of Work Schedule", () => {
    assert.deepEqual(
      SCHEDULE_VIEWS.map(({ view }) => view),
      ["monthly", "yearly", "vacation-board", "stats", "madeira-holidays"]
    );
    assert.equal(SCHEDULE_VIEWS.some(({ id }) => id === "vacation-view-btn"), false);
  });
});
