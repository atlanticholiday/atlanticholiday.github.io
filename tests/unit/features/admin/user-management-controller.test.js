import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController } from "../../../../js/features/admin/user-management-controller.js";

function createFixture() {
  resetDom(`
    <div id="user-management-page"></div>
    <button id="user-management-menu-toggle-btn">Menu</button>
    <button id="user-management-menu-close-btn">Close</button>
    <button id="user-management-drawer-backdrop" hidden></button>
    <aside id="user-management-drawer" aria-hidden="true">
      <div class="user-management-drawer-inner"></div>
    </aside>
    <button data-user-management-main-view-target="accounts">Users</button>
    <button data-user-management-main-view-target="colleagues">Colleagues</button>
    <section data-user-management-main-view="accounts"></section>
    <section data-user-management-main-view="colleagues" hidden></section>
    <button data-user-management-side-view-target="roles">Roles</button>
    <button data-user-management-side-view-target="test-users">Tests</button>
    <button data-user-management-side-view-target="rollout">Rollout</button>
    <section data-user-management-side-view="roles"></section>
    <section data-user-management-side-view="test-users" hidden></section>
    <section data-user-management-side-view="rollout" hidden></section>
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

  test("switches the main workspace tabs and keeps drawer tool panels visible when selected", () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: { async listEmails() { return []; }, async getRoles() { return []; }, async setRoles() {}, async removeEmail() {}, async addEmail() {} },
      roleManager: { async listRoles() { return []; }, async addRole() {} },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; }, addEventListener() {} }
    });

    controller.init();

    const accountsPanel = document.querySelector('[data-user-management-main-view="accounts"]');
    const colleaguesPanel = document.querySelector('[data-user-management-main-view="colleagues"]');
    const colleaguesTab = document.querySelector('[data-user-management-main-view-target="colleagues"]');

    assert.equal(accountsPanel.hidden, false);
    assert.equal(colleaguesPanel.hidden, true);

    colleaguesTab.click();

    assert.equal(accountsPanel.hidden, true);
    assert.equal(colleaguesPanel.hidden, false);
    assert.equal(colleaguesTab.getAttribute("aria-selected"), "true");

    document.getElementById("user-management-menu-toggle-btn").click();
    assert.equal(document.getElementById("user-management-drawer").getAttribute("aria-hidden"), "false");

    document.querySelector('[data-user-management-side-view-target="test-users"]').click();

    assert.equal(document.getElementById("user-management-drawer").getAttribute("aria-hidden"), "false");
    assert.equal(document.querySelector('[data-user-management-side-view="roles"]').hidden, true);
    assert.equal(document.querySelector('[data-user-management-side-view="test-users"]').hidden, false);
  });

  test("creates preset test users without linking employee records", async () => {
    createFixture();

    const createdAuthUsers = [];
    const addedEmails = [];
    const assignedRoles = [];
    const ensuredEmployees = [];
    const syncEmployeeLinkCalls = [];

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
        },
        async syncEmployeeLink(email, employee) {
          syncEmployeeLinkCalls.push({ email, employee });
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
    assert.equal(ensuredEmployees.length, 0);
    assert.equal(syncEmployeeLinkCalls.length, 4);
    assert.ok(syncEmployeeLinkCalls.every((entry) => entry.employee === null));
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

  test("re-adds access when the auth login already exists", async () => {
    createFixture();

    const allowedEmails = [];
    const accessManager = {
      async listEmails() {
        return [...allowedEmails];
      },
      async getRoles() {
        return [];
      },
      async addEmail(email) {
        if (!allowedEmails.includes(email)) {
          allowedEmails.push(email);
        }
      },
      async setRoles() {},
      async removeEmail() {}
    };

    const controller = new UserManagementController({
      accessManager,
      roleManager: {
        async listRoles() {
          return [];
        },
        async addRole() {}
      },
      createAuthUser: async () => {
        const error = new Error("Email already in use");
        error.code = "auth/email-already-in-use";
        throw error;
      },
      sendPasswordReset: async () => {},
      getEmployees: () => [],
      windowRef: { alert() {}, confirm() { return true; } }
    });

    document.getElementById("new-user-email").value = "existing@example.com";
    document.getElementById("new-user-password").value = "secret";

    await controller.handleCreateUser();

    assert.deepEqual(allowedEmails, ["existing@example.com"]);
    assert.equal(document.getElementById("new-user-email").value, "");
    assert.equal(document.getElementById("new-user-password").value, "");
    assert.includes(
      document.getElementById("create-user-error").textContent,
      "already existed in Firebase Auth"
    );
    assert.includes(
      document.getElementById("create-user-error").textContent,
      "password entered here was not changed"
    );

    const renderedItems = document.querySelectorAll("#user-list li");
    assert.equal(renderedItems.length, 1);
    assert.includes(renderedItems[0].textContent, "existing@example.com");
  });

  test("requests a password reset without claiming delivery", async () => {
    createFixture();

    const resetRequests = [];
    const alerts = [];
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["ana@example.com"];
        },
        async getRoles() {
          return [];
        },
        async setRoles() {},
        async removeEmail() {},
        async addEmail() {}
      },
      roleManager: {
        async listRoles() {
          return [];
        },
        async addRole() {}
      },
      createAuthUser: async () => {},
      sendPasswordReset: async (email) => {
        resetRequests.push(email);
      },
      getEmployees: () => [],
      windowRef: {
        alert(message) {
          alerts.push(message);
        },
        confirm() {
          return true;
        }
      }
    });

    await controller.refreshUserList();

    const resetButton = document.querySelector("#user-list li .user-management-button-secondary");
    resetButton.click();
    await flushAsyncWork();

    assert.deepEqual(resetRequests, ["ana@example.com"]);
    assert.equal(alerts.length, 1);
    assert.includes(alerts[0], "Password reset requested for ana@example.com.");
    assert.includes(alerts[0], "If nothing arrives, check spam/quarantine");
    assert.ok(!alerts[0].includes("Password reset email sent"));
  });
});
