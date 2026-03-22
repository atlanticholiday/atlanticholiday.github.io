import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController } from "../../../../js/features/admin/user-management-controller.js";

function createFixture() {
  resetDom(`
    <ul id="user-list"></ul>
    <ul id="test-user-presets"></ul>
    <strong id="test-user-password"></strong>
    <button id="create-test-users-btn">Create Test Users</button>
    <p id="test-user-feedback"></p>
    <ul id="roles-list"></ul>
    <div id="access-link-overview"></div>
    <input id="new-user-email">
    <input id="new-user-password">
    <p id="create-user-error"></p>
    <button id="create-user-btn">Create</button>
    <select id="new-role-key">
      <option value=""></option>
      <option value="admin">admin</option>
      <option value="manager">manager</option>
      <option value="supervisor">supervisor</option>
      <option value="employee">employee</option>
    </select>
    <select id="new-role-title">
      <option value=""></option>
      <option value="Administrator">Administrator</option>
      <option value="Manager">Manager</option>
      <option value="Supervisor">Supervisor</option>
      <option value="Employee">Employee</option>
    </select>
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
    const syncEmployeeLinkCalls = [];
    const accessManager = {
      async listEmails() {
        return ["ana@example.com"];
      },
      async getRoles() {
        return ["manager"];
      },
      async syncEmployeeLink(email, employee) {
        syncEmployeeLinkCalls.push({ email, employee });
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
      getEmployees: () => [{ id: "emp-1", name: "Ana", email: "ana@example.com" }],
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
    assert.equal(syncEmployeeLinkCalls.length, 1);
    assert.equal(syncEmployeeLinkCalls[0].email, "ana@example.com");
    assert.equal(syncEmployeeLinkCalls[0].employee.id, "emp-1");
    assert.includes(document.getElementById("roles-list").textContent, "manager");
    assert.includes(document.getElementById("access-link-overview").textContent, "Privileged access");
  });

  test("syncs stored employee links from matching staff emails during refresh", async () => {
    createFixture();

    const syncEmployeeLinkCalls = [];
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["nastassja.deaguiaratlantic+clock@gmail.com"];
        },
        async getRoles() {
          return ["employee"];
        },
        async syncEmployeeLink(email, employee) {
          syncEmployeeLinkCalls.push({ email, employee });
        },
        async setRoles() {},
        async removeEmail() {},
        async addEmail() {}
      },
      roleManager: {
        async listRoles() {
          return [{ key: "employee", title: "Employee" }];
        },
        async addRole() {}
      },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [{ id: "emp-1", name: "Nastassja", email: "nastassjadeaguiaratlantic@gmail.com" }],
      windowRef: { alert() {}, confirm() { return true; } }
    });

    await controller.refreshUserList();

    assert.equal(syncEmployeeLinkCalls.length, 1);
    assert.equal(syncEmployeeLinkCalls[0].email, "nastassja.deaguiaratlantic+clock@gmail.com");
    assert.equal(syncEmployeeLinkCalls[0].employee.id, "emp-1");
  });

  test("syncs preset role key and title dropdowns", () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: { async listEmails() { return []; }, async getRoles() { return []; }, async setRoles() {}, async removeEmail() {}, async addEmail() {} },
      roleManager: { async listRoles() { return []; }, async addRole() {} },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; } }
    });

    controller.init();

    const keySelect = document.getElementById("new-role-key");
    const titleSelect = document.getElementById("new-role-title");

    keySelect.value = "manager";
    keySelect.dispatchEvent(new Event("change"));
    assert.equal(titleSelect.value, "Manager");

    titleSelect.value = "Supervisor";
    titleSelect.dispatchEvent(new Event("change"));
    assert.equal(keySelect.value, "supervisor");
  });

  test("creates preset test users, assigns matching roles, and links employee records", async () => {
    createFixture();

    const createdAuthUsers = [];
    const addedEmails = [];
    const assignedRoles = [];
    const ensuredEmployees = [];

    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return addedEmails;
        },
        async getRoles(email) {
          const found = assignedRoles.find((entry) => entry.email === email);
          return found ? found.roles : [];
        },
        async setRoles(email, roles) {
          assignedRoles.push({ email, roles });
        },
        async removeEmail() {},
        async addEmail(email) {
          if (!addedEmails.includes(email)) {
            addedEmails.push(email);
          }
        }
      },
      roleManager: {
        async listRoles() {
          return [];
        },
        async addRole() {}
      },
      createAuthUser: async (email, password) => {
        createdAuthUsers.push({ email, password });
      },
      sendPasswordReset: async () => {},
      ensureEmployeeForAccess: async (payload) => {
        ensuredEmployees.push(payload);
      },
      windowRef: { alert() {}, confirm() { return true; } }
    });

    controller.init();
    await controller.handleCreateTestUsers();

    assert.equal(createdAuthUsers.length, 4);
    assert.equal(addedEmails.length, 4);
    assert.equal(assignedRoles.length, 4);
    assert.equal(ensuredEmployees.length, 4);
    assert.includes(document.getElementById("test-user-feedback").textContent, "Test users ready");
    assert.includes(document.getElementById("test-user-presets").textContent, "test-admin@horario.test");
    assert.equal(document.getElementById("test-user-password").textContent, "Test1234!");
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
      getEmployees: () => [{ id: "emp-1", name: "New User", email: "new@example.com" }],
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
