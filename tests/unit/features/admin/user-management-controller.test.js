import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController } from "../../../../js/features/admin/user-management-controller.js";

function createFixture() {
  resetDom(`
    <div id="user-management-page"></div>
    <button id="user-management-menu-toggle-btn">Menu</button>
    <button id="user-management-menu-close-btn">Close</button>
    <button id="user-management-drawer-backdrop" hidden></button>
    <div id="access-preview-modal" class="hidden" aria-hidden="true">
      <button id="access-preview-backdrop">Backdrop</button>
      <button id="access-preview-close-btn">Close preview</button>
      <div id="access-preview-content"></div>
    </div>
    <aside id="user-management-drawer" aria-hidden="true">
      <div class="user-management-drawer-inner"></div>
    </aside>
    <button data-user-management-main-view-target="accounts">Users</button>
    <button data-user-management-main-view-target="colleagues">Colleagues</button>
    <section data-user-management-main-view="accounts"></section>
    <section data-user-management-main-view="colleagues" hidden></section>
    <button data-user-management-side-view-target="roles">Roles</button>
    <button data-user-management-side-view-target="rollout">Rollout</button>
    <section data-user-management-side-view="roles"></section>
    <section data-user-management-side-view="rollout" hidden></section>
    <input id="user-management-search">
    <select id="user-management-status-filter"><option value="all">All</option><option value="linked">Linked</option><option value="standalone">Standalone</option><option value="privileged">Privileged</option><option value="station">Station</option><option value="no-apps">No apps</option></select>
    <button id="open-create-user-btn">Add user</button>
    <span id="user-count"></span>
    <ul id="user-list"></ul>
    <p id="user-filter-summary"></p>
    <aside id="user-inspector">
      <div id="user-inspector-empty"></div>
      <div id="user-inspector-content"></div>
    </aside>
    <ul id="roles-list"></ul>
    <div id="access-link-overview"></div>
    <div id="create-user-modal" class="hidden" aria-hidden="true">
      <button id="create-user-backdrop">Backdrop</button>
      <button id="close-create-user-btn">Close</button>
      <button id="cancel-create-user-btn">Cancel</button>
    </div>
    <div id="set-password-modal" class="hidden" aria-hidden="true">
      <button id="set-password-backdrop">Backdrop</button>
      <button id="close-set-password-btn">Close</button>
      <span id="set-password-account-email"></span>
      <input id="set-user-password" type="password">
      <input id="confirm-user-password" type="password">
      <p id="set-password-error"></p>
      <button id="cancel-set-password-btn">Cancel</button>
      <button id="save-user-password-btn">Set password</button>
    </div>
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
  test("renders users with roles and app access, then updates both selections", async () => {
    createFixture();

    const setRolesCalls = [];
    const setAllowedAppsCalls = [];
    const syncEmployeeLinkCalls = [];
    const accessManager = {
      async listEmails() {
        return ["ana@example.com"];
      },
      async getRoles() {
        return ["employee"];
      },
      async getAllowedApps() {
        return [];
      },
      async syncEmployeeLink(email, employee) {
        syncEmployeeLinkCalls.push({ email, employee });
      },
      async setRoles(email, roles) {
        setRolesCalls.push({ email, roles });
      },
      async setAllowedApps(email, allowedApps) {
        setAllowedAppsCalls.push({ email, allowedApps });
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
          { key: "employee", title: "Employee" },
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
    assert.includes(document.getElementById("user-inspector-content").textContent, "Reset Password");
    assert.includes(document.getElementById("user-inspector-content").textContent, "Delete");

    const opsCheckbox = document.getElementById("inspector-role-ops");
    opsCheckbox.checked = true;
    opsCheckbox.dispatchEvent(new Event("change"));
    assert.equal(setRolesCalls.length, 0);

    const laundryCheckbox = document.getElementById("inspector-app-laundryLog");
    laundryCheckbox.checked = true;
    laundryCheckbox.dispatchEvent(new Event("change"));
    assert.equal(setAllowedAppsCalls.length, 0);

    document.getElementById("save-user-access-btn").click();
    await flushAsyncWork();
    await flushAsyncWork();

    assert.equal(setRolesCalls.length, 1);
    assert.equal(setRolesCalls[0].email, "ana@example.com");
    assert.deepEqual(setRolesCalls[0].roles, ["employee", "ops"]);
    assert.equal(setAllowedAppsCalls.length, 1);
    assert.equal(setAllowedAppsCalls[0].email, "ana@example.com");
    assert.deepEqual(setAllowedAppsCalls[0].allowedApps, ["laundryLog"]);
    assert.ok(syncEmployeeLinkCalls.length >= 1);
    assert.equal(syncEmployeeLinkCalls.at(-1).email, "ana@example.com");
    assert.equal(syncEmployeeLinkCalls.at(-1).employee.id, "emp-1");
    assert.includes(document.getElementById("roles-list").textContent, "Employee");
    assert.includes(document.getElementById("access-link-overview").textContent, "Self-service employee");
  });

  test("syncs stored employee links from matching staff emails during refresh", async () => {
    createFixture();

    const syncEmployeeLinkCalls = [];
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["example.employee+clock@gmail.com"];
        },
        async getRoles() {
          return ["employee"];
        },
        async getAllowedApps() {
          return [];
        },
        async syncEmployeeLink(email, employee) {
          syncEmployeeLinkCalls.push({ email, employee });
        },
        async setRoles() {},
        async setAllowedApps() {},
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
      getEmployees: () => [{ id: "emp-1", name: "Example Employee", email: "exampleemployee@gmail.com" }],
      windowRef: { alert() {}, confirm() { return true; } }
    });

    await controller.refreshUserList();

    assert.equal(syncEmployeeLinkCalls.length, 1);
    assert.equal(syncEmployeeLinkCalls[0].email, "example.employee+clock@gmail.com");
    assert.equal(syncEmployeeLinkCalls[0].employee.id, "emp-1");
  });

  test("filters the directory and opens the focused add-user dialog", async () => {
    createFixture();

    const users = {
      "ana@example.com": { roles: ["employee"], allowedApps: ["laundryLog"] },
      "manager@example.com": { roles: ["manager"], allowedApps: [] },
      "station@example.com": { roles: ["time-clock-station"], allowedApps: [] }
    };
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() { return Object.keys(users); },
        async getRoles(email) { return users[email].roles; },
        async getAllowedApps(email) { return users[email].allowedApps; },
        async syncEmployeeLink() {},
        async setRoles() {},
        async setAllowedApps() {},
        async removeEmail() {},
        async addEmail() {}
      },
      roleManager: {
        async listRoles() { return [{ key: "employee", title: "Employee" }, { key: "manager", title: "Manager" }]; },
        async addRole() {}
      },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [{ id: "emp-1", name: "Ana Silva", email: "ana@example.com" }],
      windowRef: { alert() {}, confirm() { return true; }, addEventListener() {} }
    });

    controller.init();
    await controller.refreshUserList();

    const search = document.getElementById("user-management-search");
    search.value = "manager";
    search.dispatchEvent(new Event("input"));
    assert.equal(document.querySelectorAll("#user-list .user-management-user-row").length, 1);
    assert.includes(document.getElementById("user-list").textContent, "manager@example.com");
    assert.includes(document.getElementById("user-filter-summary").textContent, "1 of 3");
    assert.includes(document.getElementById("user-inspector-content").textContent, "manager@example.com");

    search.value = "";
    search.dispatchEvent(new Event("input"));
    const filter = document.getElementById("user-management-status-filter");
    filter.value = "linked";
    filter.dispatchEvent(new Event("change"));
    assert.equal(document.querySelectorAll("#user-list .user-management-user-row").length, 1);
    assert.includes(document.getElementById("user-list").textContent, "Ana Silva");

    document.getElementById("open-create-user-btn").click();
    assert.equal(document.getElementById("create-user-modal").classList.contains("hidden"), false);
    document.getElementById("cancel-create-user-btn").click();
    assert.equal(document.getElementById("create-user-modal").classList.contains("hidden"), true);
  });

  test("previews the effective workspace and inside-app scope for a colleague", async () => {
    createFixture();
    const interactivePreviewCalls = [];
    document.getElementById("fixture").insertAdjacentHTML("beforeend", `
      <main id="landing-page">
        <section class="landing-category">
          <h3>Team &amp; Scheduling</h3>
          <div class="dashboard-grid">
            <button id="go-to-time-clock-btn" class="dashboard-card"><div class="card-body"><h3>Time Clock</h3><p>Clock in and out.</p></div></button>
            <button id="go-to-schedule-btn" class="dashboard-card"><div class="card-body"><h3 id="go-to-schedule-title">Work Schedule</h3><p id="go-to-schedule-description">Manager schedule.</p></div></button>
          </div>
        </section>
        <section class="landing-category">
          <h3>Reservations &amp; Guests</h3>
          <div class="dashboard-grid">
            <button id="go-to-reservations-btn" class="dashboard-card"><div class="card-body"><h3>Weekly Reservations</h3><p>Weekly guest work.</p></div></button>
            <button id="go-to-heated-pools-btn" class="dashboard-card"><div class="card-body"><h3>Heated Pools</h3><p>Pool heating tasks.</p></div></button>
          </div>
        </section>
        <section class="landing-category">
          <h3>Services &amp; Logistics</h3>
          <div class="dashboard-grid">
            <button id="go-to-laundry-log-btn" class="dashboard-card"><div class="card-body"><h3>Laundry Log</h3><p>Linen by property.</p></div></button>
          </div>
        </section>
        <div id="other-tools-grid"></div>
      </main>
    `);

    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["ana@example.com"];
        },
        async getRoles() {
          return ["employee"];
        },
        async getAllowedApps() {
          return ["laundryLog", "reservations"];
        },
        async syncEmployeeLink() {},
        async setRoles() {},
        async setAllowedApps() {},
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
      getEmployees: () => [{ id: "emp-1", name: "Ana", email: "ana@example.com" }],
      startInteractivePreview: (payload) => interactivePreviewCalls.push(payload),
      windowRef: { alert() {}, confirm() { return true; } }
    });

    await controller.refreshUserList();
    assert.includes(document.getElementById("user-inspector-content").textContent, "Heated Pools visible automatically");
    assert.includes(document.getElementById("inspector-preview-btn").textContent, "View as user");
    document.getElementById("inspector-preview-btn").click();

    const modal = document.getElementById("access-preview-modal");
    const previewText = document.getElementById("access-preview-content").textContent;
    assert.equal(modal.classList.contains("hidden"), false);
    assert.includes(previewText, "Ana");
    assert.includes(previewText, "Employee + selected apps");
    assert.includes(previewText, "Their landing screen");
    assert.includes(previewText, "Exact navigation preview");
    assert.includes(previewText, "Read-only monthly schedule");
    assert.includes(previewText, "Laundry Log");
    assert.includes(previewText, "Colleague workflow");
    assert.includes(previewText, "Own records only");
    assert.includes(previewText, "Heated Pools");
    assert.includes(previewText, "Access guide");
    assert.includes(previewText, "Manager / Supervisor");
    assert.includes(previewText, "No User Management");
    assert.includes(previewText, "restricted colleague views");
    assert.equal(document.querySelectorAll(".user-access-preview__dashboard-card").length, 5);
    assert.includes(previewText, "Explore their workspace");
    assert.ok(document.getElementById("start-interactive-access-preview-btn"));
    assert.ok(document.querySelector('[data-preview-button-id="go-to-time-clock-btn"]'));
    assert.ok(document.querySelector('[data-preview-button-id="go-to-schedule-btn"]'));
    assert.ok(document.querySelector('[data-preview-button-id="go-to-laundry-log-btn"]'));
    assert.ok(document.querySelector('[data-preview-button-id="go-to-reservations-btn"]'));
    assert.ok(document.querySelector('[data-preview-button-id="go-to-heated-pools-btn"]'));
    assert.equal(document.querySelector('[data-preview-button-id="go-to-user-management-btn"]'), null);
    assert.includes(
      document.querySelector('[data-preview-button-id="go-to-schedule-btn"]').textContent,
      "read-only mode"
    );
    assert.equal(document.querySelectorAll(".user-access-preview__guide-row").length, 5);
    assert.includes(
      document.querySelector(".user-access-preview__guide-row-current").textContent,
      "Employee"
    );

    const laundryDetails = Array.from(document.querySelectorAll(".user-access-preview__app"))
      .find((element) => element.textContent.includes("Laundry Log"));
    assert.ok(laundryDetails);
    assert.includes(laundryDetails.textContent, "Manager review and deletion controls are hidden");
    assert.equal(laundryDetails.open, false);
    laundryDetails.querySelector("summary").click();
    assert.equal(laundryDetails.open, true);

    document.querySelector('[data-preview-button-id="go-to-laundry-log-btn"]').click();
    assert.equal(interactivePreviewCalls.length, 1);
    assert.equal(interactivePreviewCalls[0].buttonId, "go-to-laundry-log-btn");
    assert.equal(interactivePreviewCalls[0].user.email, "ana@example.com");
    assert.equal(interactivePreviewCalls[0].linkedEmployee.id, "emp-1");
    assert.equal(modal.classList.contains("hidden"), true);
  });

  test("shows when a shared-station user bypasses the launcher", () => {
    createFixture();
    const controller = new UserManagementController({
      accessManager: {},
      roleManager: {},
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; } }
    });

    controller.openAccessPreview({
      email: "station@example.com",
      roles: ["time-clock-station"],
      allowedApps: ["laundryLog"]
    });

    const previewText = document.getElementById("access-preview-content").textContent;
    assert.includes(previewText, "Opens directly in Time Clock");
    assert.includes(previewText, "bypasses the app launcher");
    assert.equal(document.querySelectorAll(".user-access-preview__dashboard-card").length, 0);
    assert.equal(document.querySelector('[data-preview-button-id="go-to-laundry-log-btn"]'), null);
  });

  test("renders the access directory when employee-link synchronization is unavailable", async () => {
    createFixture();

    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (...args) => warnings.push(args);

    try {
      const controller = new UserManagementController({
        accessManager: {
          async listEmails() {
            return ["admin@example.com"];
          },
          async getRoles() {
            return ["admin"];
          },
          async getAllowedApps() {
            return [];
          },
          async syncEmployeeLink() {
            throw new Error("Function not found");
          },
          async setRoles() {},
          async setAllowedApps() {},
          async removeEmail() {},
          async addEmail() {}
        },
        roleManager: {
          async listRoles() {
            return [{ key: "admin", title: "Administrator" }];
          },
          async addRole() {}
        },
        createAuthUser: async () => {},
        sendPasswordReset: async () => {},
        getEmployees: () => [],
        windowRef: { alert() {}, confirm() { return true; } }
      });

      await controller.refreshUserList();

      const renderedItems = document.querySelectorAll("#user-list li");
      assert.equal(renderedItems.length, 1);
      assert.includes(renderedItems[0].textContent, "admin@example.com");
      assert.ok(warnings.some((warning) => {
        return String(warning[0]).includes("rendering the current access directory");
      }));
    } finally {
      console.warn = originalWarn;
    }
  });

  test("syncs preset role key and title dropdowns", () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: { async listEmails() { return []; }, async getRoles() { return []; }, async getAllowedApps() { return []; }, async setRoles() {}, async setAllowedApps() {}, async removeEmail() {}, async addEmail() {} },
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

  test("disables app access editing for privileged users", async () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["manager@example.com"];
        },
        async getRoles() {
          return ["manager"];
        },
        async getAllowedApps() {
          return ["laundryLog"];
        },
        async setRoles() {},
        async setAllowedApps() {},
        async removeEmail() {},
        async addEmail() {}
      },
      roleManager: { async listRoles() { return []; }, async addRole() {} },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {},
      windowRef: { alert() {}, confirm() { return true; } }
    });

    await controller.refreshUserList();

    assert.equal(document.getElementById("inspector-app-laundryLog").disabled, true);
  });

  test("switches the main workspace tabs and keeps drawer tool panels visible when selected", () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: { async listEmails() { return []; }, async getRoles() { return []; }, async getAllowedApps() { return []; }, async setRoles() {}, async setAllowedApps() {}, async removeEmail() {}, async addEmail() {} },
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

    document.querySelector('[data-user-management-side-view-target="rollout"]').click();

    assert.equal(document.getElementById("user-management-drawer").getAttribute("aria-hidden"), "false");
    assert.equal(document.querySelector('[data-user-management-side-view="roles"]').hidden, true);
    assert.equal(document.querySelector('[data-user-management-side-view="rollout"]').hidden, false);
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
      async getAllowedApps() {
        return [];
      },
      async addEmail(email) {
        allowedEmails.push(email);
      },
      async setRoles() {},
      async setAllowedApps() {},
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
    document.getElementById("new-user-password").value = "temporary-strong-password";

    await controller.handleCreateUser();

    assert.equal(createdUsers.length, 1);
    assert.equal(createdUsers[0].email, "new@example.com");
    assert.equal(createdUsers[0].password, "temporary-strong-password");
    assert.equal(document.getElementById("new-user-email").value, "");
    assert.equal(document.getElementById("new-user-password").value, "");
    assert.equal(document.getElementById("create-user-error").textContent, "");

    const renderedItems = document.querySelectorAll("#user-list li");
    assert.equal(renderedItems.length, 1);
    assert.includes(renderedItems[0].textContent, "new@example.com");
    assert.includes(document.getElementById("user-inspector-content").textContent, "Reset Password");
    assert.includes(document.getElementById("user-inspector-notice").textContent, "Access account created");
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
      async getAllowedApps() {
        return [];
      },
      async addEmail(email) {
        if (!allowedEmails.includes(email)) {
          allowedEmails.push(email);
        }
      },
      async setRoles() {},
      async setAllowedApps() {},
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
    document.getElementById("new-user-password").value = "temporary-strong-password";

    await controller.handleCreateUser();

    assert.deepEqual(allowedEmails, ["existing@example.com"]);
    assert.equal(document.getElementById("new-user-email").value, "");
    assert.equal(document.getElementById("new-user-password").value, "");
    assert.includes(document.getElementById("user-inspector-notice").textContent, "login already existed");
    assert.includes(document.getElementById("user-inspector-notice").textContent, "password was not changed");

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
        async getAllowedApps() {
          return [];
        },
        async setRoles() {},
        async setAllowedApps() {},
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
        return { delivery: "email" };
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

    const resetButton = document.querySelector("#user-inspector-account-actions .user-management-button-secondary");
    resetButton.click();
    await flushAsyncWork();

    assert.deepEqual(resetRequests, ["ana@example.com"]);
    assert.equal(alerts.length, 1);
    assert.includes(alerts[0], "Firebase accepted a password reset email request for ana@example.com.");
    assert.includes(alerts[0], "If nothing arrives, check spam/quarantine");
    assert.ok(!alerts[0].includes("Password reset email sent"));
  });

  test("lets an administrator set a password directly and requires matching values", async () => {
    createFixture();

    const passwordChanges = [];
    const alerts = [];
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["ana@example.com"];
        },
        async getRoles() {
          return [];
        },
        async getAllowedApps() {
          return [];
        },
        async setRoles() {},
        async setAllowedApps() {},
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
      setUserPassword: async (email, password) => {
        passwordChanges.push({ email, password });
      },
      sendPasswordReset: async () => {},
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

    controller.init();
    await controller.refreshUserList();

    document.querySelector('[data-user-action="set-password"]').click();
    assert.equal(document.getElementById("set-password-modal").classList.contains("hidden"), false);
    assert.equal(document.getElementById("set-password-account-email").textContent, "ana@example.com");

    document.getElementById("set-user-password").value = "a-secure-password";
    document.getElementById("confirm-user-password").value = "not-the-same-value";
    document.getElementById("save-user-password-btn").click();
    await flushAsyncWork();
    assert.equal(passwordChanges.length, 0);
    assert.includes(document.getElementById("set-password-error").textContent, "do not match");

    document.getElementById("confirm-user-password").value = "a-secure-password";
    document.getElementById("save-user-password-btn").click();
    await flushAsyncWork();

    assert.deepEqual(passwordChanges, [{ email: "ana@example.com", password: "a-secure-password" }]);
    assert.equal(document.getElementById("set-password-modal").classList.contains("hidden"), true);
    assert.deepEqual(alerts, ["Password updated. Existing sessions have been signed out."]);
  });

  test("shows generated reset links so admins are not blocked by email delivery", async () => {
    createFixture();

    const resetRequests = [];
    const prompts = [];
    const copiedLinks = [];
    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["ana@example.com"];
        },
        async getRoles() {
          return [];
        },
        async getAllowedApps() {
          return [];
        },
        async setRoles() {},
        async setAllowedApps() {},
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
        return {
          resetLink: "https://example.com/reset?code=abc123",
          delivery: "email"
        };
      },
      getEmployees: () => [],
      windowRef: {
        alert() {},
        confirm() {
          return true;
        },
        prompt(message, value) {
          prompts.push({ message, value });
        },
        navigator: {
          clipboard: {
            async writeText(value) {
              copiedLinks.push(value);
            }
          }
        }
      }
    });

    await controller.refreshUserList();

    const resetButton = document.querySelector("#user-inspector-account-actions .user-management-button-secondary");
    resetButton.click();
    await flushAsyncWork();

    assert.deepEqual(resetRequests, ["ana@example.com"]);
    assert.deepEqual(copiedLinks, ["https://example.com/reset?code=abc123"]);
    assert.equal(prompts.length, 1);
    assert.includes(prompts[0].message, "Firebase accepted a password reset email request for ana@example.com");
    assert.includes(prompts[0].message, "backup reset link was copied to the clipboard");
    assert.equal(prompts[0].value, "https://example.com/reset?code=abc123");
  });
});
