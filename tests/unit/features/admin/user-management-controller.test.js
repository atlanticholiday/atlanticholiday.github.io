import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController } from "../../../../js/features/admin/user-management-controller.js";

function createFixture() {
  resetDom(`
    <ul id="user-list"></ul>
    <input id="new-user-email">
    <input id="new-user-password">
    <p id="create-user-error"></p>
    <button id="create-user-btn">Create</button>
    <input id="new-role-key">
    <input id="new-role-title">
    <p id="add-role-error"></p>
    <button id="add-role-btn">Add Role</button>
  `);
}

function flushAsyncWork() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("UserManagementController", () => {
  test("renders users with roles and updates role assignments from checkbox changes", async () => {
    createFixture();

    const setRolesCalls = [];
    const accessManager = {
      async listEmails() {
        return ["ana@example.com"];
      },
      async getRoles() {
        return ["manager"];
      },
      async setRoles(email, roles) {
        setRolesCalls.push({ email, roles });
      },
      async removeEmail() {
        throw new Error("removeEmail should not be called in this test");
      },
      async addEmail() {
        throw new Error("addEmail should not be called in this test");
      }
    };
    const roleManager = {
      async listRoles() {
        return [
          { key: "manager", title: "Manager" },
          { key: "ops", title: "Operations" }
        ];
      },
      async addRole() {
        throw new Error("addRole should not be called in this test");
      }
    };

    const controller = new UserManagementController({
      accessManager,
      roleManager,
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; } }
    });

    await controller.refreshUserList();

    const renderedItems = document.querySelectorAll("#user-list li");
    assert.equal(renderedItems.length, 1);
    assert.includes(renderedItems[0].textContent, "ana@example.com");
    assert.includes(renderedItems[0].textContent, "Reset Password");
    assert.includes(renderedItems[0].textContent, "Delete");

    const opsCheckbox = document.getElementById("role-ana@example.com-ops");
    opsCheckbox.checked = true;
    opsCheckbox.dispatchEvent(new Event("change"));
    await flushAsyncWork();

    assert.equal(setRolesCalls.length, 1);
    assert.equal(setRolesCalls[0].email, "ana@example.com");
    assert.deepEqual(setRolesCalls[0].roles, ["manager", "ops"]);
  });

  test("creates a user, clears the form, and refreshes the full admin list", async () => {
    createFixture();

    const createdUsers = [];
    const allowedEmails = [];
    const accessManager = {
      async listEmails() {
        return [...allowedEmails];
      },
      async getRoles() {
        return [];
      },
      async addEmail(email) {
        allowedEmails.push(email);
      },
      async setRoles() {},
      async removeEmail() {}
    };
    const roleManager = {
      async listRoles() {
        return [{ key: "ops", title: "Operations" }];
      },
      async addRole() {}
    };

    const controller = new UserManagementController({
      accessManager,
      roleManager,
      createAuthUser: async (email, password) => {
        createdUsers.push({ email, password });
      },
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; } }
    });

    document.getElementById("new-user-email").value = "new@example.com";
    document.getElementById("new-user-password").value = "secret";

    await controller.handleCreateUser();

    assert.equal(createdUsers.length, 1);
    assert.equal(createdUsers[0].email, "new@example.com");
    assert.equal(createdUsers[0].password, "secret");
    assert.equal(document.getElementById("new-user-email").value, "");
    assert.equal(document.getElementById("new-user-password").value, "");
    assert.equal(document.getElementById("create-user-error").textContent, "");

    const renderedItems = document.querySelectorAll("#user-list li");
    assert.equal(renderedItems.length, 1);
    assert.includes(renderedItems[0].textContent, "new@example.com");
    assert.includes(renderedItems[0].textContent, "Reset Password");
  });
});
