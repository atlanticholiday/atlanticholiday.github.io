import { describe, test, assert } from "../../../test-harness.js";
import { AccessManager } from "../../../../js/features/admin/access-manager.js";

describe("AccessManager", () => {
  function createManager(callableError) {
    const manager = Object.create(AccessManager.prototype);
    const directRemovals = [];
    const directUpdates = [];
    const directAdds = [];
    const directLinks = [];
    manager.callProtectedFunction = async () => {
      throw callableError;
    };
    manager.removeEmailDirectly = async (email) => {
      directRemovals.push(email);
    };
    manager.setAccessFieldsDirectly = async (email, patch) => {
      directUpdates.push({ email, patch });
    };
    manager.addEmailDirectly = async (email, allowedApps) => {
      directAdds.push({ email, allowedApps });
    };
    manager.syncEmployeeLinkDirectly = async (email, employee) => {
      directLinks.push({ email, employee });
    };
    return { manager, directRemovals, directUpdates, directAdds, directLinks };
  }

  test("falls back to Firestore when adding access returns internal on Spark", async () => {
    const { manager, directAdds } = createManager({ code: "functions/internal", message: "internal" });

    await manager.addEmail("Ana.Silva@Example.com", { allowedApps: ["staff"] });

    assert.deepEqual(directAdds, [{
      email: "ana.silva@example.com",
      allowedApps: ["staff"]
    }]);
  });

  test("falls back to Firestore when employee-link sync returns internal on Spark", async () => {
    const { manager, directLinks } = createManager({ code: "internal", message: "internal" });

    await manager.syncEmployeeLink("Ana.Silva@Example.com", {
      id: "employee-1",
      name: "Ana Silva",
      email: "Ana.Silva@Example.com",
      isArchived: false
    });

    assert.deepEqual(directLinks, [{
      email: "ana.silva@example.com",
      employee: {
        id: "employee-1",
        name: "Ana Silva",
        email: "ana.silva@example.com",
        isArchived: false
      }
    }]);
  });

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

  test("falls back to admin-protected Firestore writes when saving roles returns internal", async () => {
    const { manager, directUpdates } = createManager({
      code: "functions/internal",
      message: "internal"
    });

    await manager.setRoles("Ana.Silva@Example.com", ["employee", "ops"]);

    assert.deepEqual(directUpdates, [{
      email: "ana.silva@example.com",
      patch: { roles: ["employee", "ops"] }
    }]);
  });

  test("falls back to admin-protected Firestore writes when saving apps returns internal", async () => {
    const { manager, directUpdates } = createManager({
      code: "internal",
      message: "internal"
    });

    await manager.setAllowedApps("Ana.Silva@Example.com", ["laundryLog", "inventory"]);

    assert.deepEqual(directUpdates, [{
      email: "ana.silva@example.com",
      patch: { allowedApps: ["laundryLog", "inventory"] }
    }]);
  });

  test("does not bypass callable authorization failures when saving access", async () => {
    const originalError = {
      code: "functions/permission-denied",
      message: "Only administrators can manage access."
    };
    const { manager, directUpdates } = createManager(originalError);
    let receivedError = null;

    try {
      await manager.setRoles("ana.silva@example.com", ["employee"]);
    } catch (error) {
      receivedError = error;
    }

    assert.equal(receivedError, originalError);
    assert.deepEqual(directUpdates, []);
  });
});
