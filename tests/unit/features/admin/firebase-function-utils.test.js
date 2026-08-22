import { describe, test, assert } from "../../../test-harness.js";
import {
  isCallableUnavailableError,
  requestFirebasePasswordReset,
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

  test("sends a reset email after generating a verified backup link", async () => {
    const calls = [];
    const result = await requestFirebasePasswordReset({
      email: "ana@example.com",
      createResetLink: async (email) => {
        calls.push(["link", email]);
        return { resetLink: "https://example.com/reset" };
      },
      sendResetEmail: async (email) => {
        calls.push(["email", email]);
      }
    });

    assert.deepEqual(calls, [
      ["link", "ana@example.com"],
      ["email", "ana@example.com"]
    ]);
    assert.equal(result.delivery, "email");
    assert.equal(result.resetLink, "https://example.com/reset");
  });

  test("still sends the standard reset email when the link service is unavailable", async () => {
    const calls = [];
    const result = await requestFirebasePasswordReset({
      email: "ana@example.com",
      createResetLink: async () => {
        throw { code: "functions/unavailable" };
      },
      sendResetEmail: async (email) => {
        calls.push(email);
      }
    });

    assert.deepEqual(calls, ["ana@example.com"]);
    assert.equal(result.delivery, "email");
    assert.equal(result.resetLink, undefined);
  });

  test("keeps the backup link usable when Firebase rejects email delivery", async () => {
    const result = await requestFirebasePasswordReset({
      email: "ana@example.com",
      createResetLink: async () => ({ resetLink: "https://example.com/reset" }),
      sendResetEmail: async () => {
        throw { code: "auth/too-many-requests" };
      }
    });

    assert.equal(result.delivery, "failed");
    assert.equal(result.deliveryError, "auth/too-many-requests");
    assert.equal(result.resetLink, "https://example.com/reset");
  });
});
