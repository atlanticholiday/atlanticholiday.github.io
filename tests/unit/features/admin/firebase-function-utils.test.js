import { describe, test, assert } from "../../../test-harness.js";
import { isCallableUnavailableError } from "../../../../js/features/admin/firebase-function-utils.js";

describe("Firebase function fallback", () => {
  test("recognizes missing and unavailable callable backends", () => {
    assert.equal(isCallableUnavailableError({ code: "functions/not-found" }), true);
    assert.equal(isCallableUnavailableError({ code: "functions/unavailable" }), true);
    assert.equal(isCallableUnavailableError({ message: "Failed to fetch" }), true);
  });

  test("does not bypass callable authorization or validation failures", () => {
    assert.equal(isCallableUnavailableError({ code: "functions/permission-denied" }), false);
    assert.equal(isCallableUnavailableError({ code: "functions/invalid-argument" }), false);
    assert.equal(isCallableUnavailableError({ code: "functions/internal" }), false);
  });
});
