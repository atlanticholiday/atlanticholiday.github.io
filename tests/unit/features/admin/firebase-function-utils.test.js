import { describe, test, assert } from "../../../test-harness.js";
import {
  isCallableUnavailableError,
  shouldFallbackToClientPasswordReset
} from "../../../../js/features/admin/firebase-function-utils.js";

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

  test("falls back to the standard reset email for reset-link service failures", () => {
    assert.equal(shouldFallbackToClientPasswordReset({ code: "functions/internal" }), true);
    assert.equal(shouldFallbackToClientPasswordReset({ code: "functions/failed-precondition" }), true);
    assert.equal(shouldFallbackToClientPasswordReset({ code: "functions/unavailable" }), true);
    assert.equal(shouldFallbackToClientPasswordReset({ message: "Failed to fetch" }), true);
  });

  test("keeps authorization and account errors visible during password reset", () => {
    assert.equal(shouldFallbackToClientPasswordReset({ code: "functions/permission-denied" }), false);
    assert.equal(shouldFallbackToClientPasswordReset({ code: "functions/invalid-argument" }), false);
    assert.equal(shouldFallbackToClientPasswordReset({
      code: "functions/not-found",
      message: "No Firebase Auth login exists for this email address."
    }), false);
  });
});
