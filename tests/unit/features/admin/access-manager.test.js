import { describe, test, assert } from "../../../test-harness.js";
import { AccessManager } from "../../../../js/features/admin/access-manager.js";

describe("AccessManager", () => {
  function createManager(callableError) {
    const manager = Object.create(AccessManager.prototype);
    const directRemovals = [];
    manager.callProtectedFunction = async () => {
      throw callableError;
    };
    manager.removeEmailDirectly = async (email) => {
      directRemovals.push(email);
    };
    return { manager, directRemovals };
  }

  test("falls back to admin-protected Firestore deletion for internal callable failures", async () => {
    const { manager, directRemovals } = createManager({
      code: "functions/internal",
      message: "internal"
    });

    await manager.removeEmail("Marco.Bito@Example.com");

    assert.deepEqual(directRemovals, ["marco.bito@example.com"]);
  });

  test("does not bypass callable authorization failures", async () => {
    const originalError = {
      code: "functions/permission-denied",
      message: "Only administrators can remove access."
    };
    const { manager, directRemovals } = createManager(originalError);
    let receivedError = null;

    try {
      await manager.removeEmail("marco.bito@example.com");
    } catch (error) {
      receivedError = error;
    }

    assert.equal(receivedError, originalError);
    assert.deepEqual(directRemovals, []);
  });
});
