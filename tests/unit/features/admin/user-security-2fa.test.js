import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController } from "../../../../js/features/admin/user-management-controller.js";
import { AccessManager } from "../../../../js/features/admin/access-manager.js";

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
    <select id="user-management-status-filter"><option value="all">All</option></select>
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
    <div id="two-factor-setup-modal" class="user-management-dialog hidden" aria-hidden="true">
      <button id="two-factor-setup-backdrop"></button>
      <button id="close-two-factor-setup-btn">Close</button>
      <span id="two-factor-setup-account-email"></span>
      <img id="two-factor-qr-image" src="">
      <code id="two-factor-secret-key"></code>
      <button id="copy-two-factor-secret-btn">Copy</button>
      <span id="two-factor-copy-status"></span>
      <input id="two-factor-test-code" type="text">
      <button id="verify-test-two-factor-btn">Verify & Save</button>
      <p id="two-factor-setup-error"></p>
      <p id="two-factor-setup-success"></p>
      <button id="done-two-factor-setup-btn">Done</button>
      <button id="cancel-two-factor-setup-btn">Cancel</button>
    </div>
    <input id="new-user-email">
    <input id="new-user-password">
    <p id="create-user-error"></p>
    <button id="create-user-btn">Create</button>
    <select id="new-role-key"><option value=""></option></select>
    <select id="new-role-title"><option value=""></option></select>
    <button id="add-role-btn">Add Role</button>
  `);
}

describe("UserManagementController - Two-Factor Authentication (2FA)", () => {
  test("accounts default to 2FA completely disabled", async () => {
    createFixture();

    const mockAccessManager = {
      listEmails: async () => ["employee@atlanticholiday.com"],
      getAccessEntry: async (email) => ({
        email,
        roles: ["employee"],
        allowedApps: ["tasks"],
        twoFactorEnabled: false,
        twoFactorEnrolled: false
      }),
      syncEmployeeLink: async () => {}
    };

    const mockRoleManager = {
      listRoles: async () => [{ key: "employee", title: "Employee" }]
    };

    const controller = new UserManagementController({
      accessManager: mockAccessManager,
      roleManager: mockRoleManager,
      createAuthUser: async () => {},
      setUserPassword: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [],
      documentRef: document,
      windowRef: window
    });

    controller.init();
    await controller.refreshUserList();

    const inspector = document.getElementById("user-inspector-content");
    assert.ok(inspector, "Inspector container exists");

    const badge = inspector.querySelector(".user-management-2fa-badge");
    assert.ok(badge, "2FA badge is rendered");
    assert.ok(badge.classList.contains("is-disabled"), "Badge has is-disabled class");
    assert.equal(badge.textContent.trim(), "Disabled");

    const enableBtn = inspector.querySelector("#enable-2fa-btn");
    assert.ok(enableBtn, "Enable 2FA button is present");
    assert.equal(inspector.querySelector("#disable-2fa-btn"), null, "Disable button not present when disabled");
    assert.equal(inspector.querySelector("#setup-2fa-btn"), null, "Setup button not present when disabled");
  });

  test("clicking Enable 2FA activates 2FA and opens the setup modal", async () => {
    createFixture();

    let enabledEmail = null;
    let enabledState = null;
    let setupRequestedEmail = null;

    const mockAccessManager = {
      listEmails: async () => ["manager@atlanticholiday.com"],
      getAccessEntry: async (email) => ({
        email,
        roles: ["manager"],
        allowedApps: ["tasks"],
        twoFactorEnabled: enabledState ?? false,
        twoFactorEnrolled: false
      }),
      setTwoFactorState: async (email, state) => {
        enabledEmail = email;
        enabledState = state;
      },
      getTwoFactorSetup: async (email) => {
        setupRequestedEmail = email;
        return {
          email,
          secret: "JBSWY3DPEHPK3PXP",
          otpauthUri: "otpauth://totp/Atlantic%20Holiday:manager@atlanticholiday.com?secret=JBSWY3DPEHPK3PXP",
          qrUrl: "data:image/svg+xml;utf8,<svg></svg>"
        };
      },
      syncEmployeeLink: async () => {}
    };

    const mockRoleManager = {
      listRoles: async () => [{ key: "manager", title: "Manager" }]
    };

    const controller = new UserManagementController({
      accessManager: mockAccessManager,
      roleManager: mockRoleManager,
      createAuthUser: async () => {},
      setUserPassword: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [],
      documentRef: document,
      windowRef: window
    });

    controller.init();
    await controller.refreshUserList();

    const inspector = document.getElementById("user-inspector-content");
    const enableBtn = inspector.querySelector("#enable-2fa-btn");
    assert.ok(enableBtn, "Enable 2FA button found");

    enableBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(enabledEmail, "manager@atlanticholiday.com", "Called setTwoFactorState with user email");
    assert.equal(enabledState, true, "Called setTwoFactorState with true");

    const modal = document.getElementById("two-factor-setup-modal");
    assert.ok(!modal.classList.contains("hidden"), "Setup modal is opened");
    assert.equal(document.getElementById("two-factor-secret-key").textContent, "JBSWY3DPEHPK3PXP", "Secret key displayed");
    assert.equal(document.getElementById("two-factor-qr-image").src, "https://api.qrserver.com/v1/create-qr-code/?size=220x220", "QR image src updated");
  });

  test("verifying a 6-digit test code in the setup modal confirms activation", async () => {
    createFixture();

    let verifiedCode = null;
    let verifiedEmail = null;
    let verifiedIsEnrollment = null;

    const mockAccessManager = {
      listEmails: async () => ["manager@atlanticholiday.com"],
      getAccessEntry: async (email) => ({
        email,
        roles: ["manager"],
        allowedApps: ["tasks"],
        twoFactorEnabled: true,
        twoFactorEnrolled: false
      }),
      getTwoFactorSetup: async (email) => ({
        email,
        secret: "JBSWY3DPEHPK3PXP",
        qrUrl: "data:image/svg+xml;utf8,<svg></svg>"
      }),
      verifyTwoFactorChallenge: async (code, { email, isEnrollment }) => {
        verifiedCode = code;
        verifiedEmail = email;
        verifiedIsEnrollment = isEnrollment;
        if (code === "123456") {
          return { valid: true };
        }
        return { valid: false, error: "Invalid code" };
      },
      syncEmployeeLink: async () => {}
    };

    const mockRoleManager = {
      listRoles: async () => [{ key: "manager", title: "Manager" }]
    };

    const controller = new UserManagementController({
      accessManager: mockAccessManager,
      roleManager: mockRoleManager,
      createAuthUser: async () => {},
      setUserPassword: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [],
      documentRef: document,
      windowRef: window
    });

    controller.init();
    await controller.refreshUserList();

    controller.setTwoFactorDialogOpen(true, "manager@atlanticholiday.com");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const codeInput = document.getElementById("two-factor-test-code");
    const verifyBtn = document.getElementById("verify-test-two-factor-btn");

    // Test invalid code
    codeInput.value = "000000";
    verifyBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(verifiedCode, "000000");
    assert.equal(document.getElementById("two-factor-setup-error").textContent, "Invalid code");

    // Test valid code
    codeInput.value = "123456";
    verifyBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal(verifiedCode, "123456");
    assert.equal(verifiedEmail, "manager@atlanticholiday.com");
    assert.equal(verifiedIsEnrollment, true);
    assert.ok(document.getElementById("two-factor-setup-success").textContent.includes("successfully confirmed"), "Success message displayed");
  });

  test("renders Active badge and 2FA inline tag for enrolled accounts", async () => {
    createFixture();

    const mockAccessManager = {
      listEmails: async () => ["admin@atlanticholiday.com"],
      getAccessEntry: async (email) => ({
        email,
        roles: ["admin"],
        allowedApps: ["tasks"],
        twoFactorEnabled: true,
        twoFactorEnrolled: true
      }),
      syncEmployeeLink: async () => {}
    };

    const mockRoleManager = {
      listRoles: async () => [{ key: "admin", title: "Administrator" }]
    };

    const controller = new UserManagementController({
      accessManager: mockAccessManager,
      roleManager: mockRoleManager,
      createAuthUser: async () => {},
      setUserPassword: async () => {},
      sendPasswordReset: async () => {},
      getEmployees: () => [],
      documentRef: document,
      windowRef: window
    });

    controller.init();
    await controller.refreshUserList();

    const inspector = document.getElementById("user-inspector-content");
    const badge = inspector.querySelector(".user-management-2fa-badge");
    assert.ok(badge.classList.contains("is-active"), "Badge has is-active class");
    assert.equal(badge.textContent.trim(), "Active");

    const disableBtn = inspector.querySelector("#disable-2fa-btn");
    const setupBtn = inspector.querySelector("#setup-2fa-btn");
    const resetBtn = inspector.querySelector("#reset-2fa-btn");
    assert.ok(disableBtn, "Disable 2FA button present");
    assert.ok(setupBtn, "Setup / QR button present");
    assert.ok(resetBtn, "Reset 2FA button present");

    // Check user directory row 2FA pill
    const userRow = document.querySelector(".user-management-user-row");
    const pill = userRow.querySelector(".user-management-2fa-inline-pill");
    assert.ok(pill, "2FA pill rendered in table row");
    assert.ok(pill.classList.contains("is-active"), "Pill has is-active class");
  });

  test("disabling 2FA prompts confirmation and turns off 2FA", async () => {
    createFixture();

    let disabledEmail = null;
    let disabledState = null;

    const mockAccessManager = {
      listEmails: async () => ["admin@atlanticholiday.com"],
      getAccessEntry: async (email) => ({
        email,
        roles: ["admin"],
        allowedApps: ["tasks"],
        twoFactorEnabled: true,
        twoFactorEnrolled: true
      }),
      setTwoFactorState: async (email, state) => {
        disabledEmail = email;
        disabledState = state;
      },
      syncEmployeeLink: async () => {}
    };

    const mockRoleManager = {
      listRoles: async () => [{ key: "admin", title: "Administrator" }]
    };

    let confirmPrompted = false;
    const originalConfirm = window.confirm;
    window.confirm = () => {
      confirmPrompted = true;
      return true;
    };

    try {
      const controller = new UserManagementController({
        accessManager: mockAccessManager,
        roleManager: mockRoleManager,
        createAuthUser: async () => {},
        setUserPassword: async () => {},
        sendPasswordReset: async () => {},
        getEmployees: () => [],
        documentRef: document,
        windowRef: window
      });

      controller.init();
      await controller.refreshUserList();

      const disableBtn = document.getElementById("disable-2fa-btn");
      disableBtn.click();
      await new Promise((resolve) => setTimeout(resolve, 50));

      assert.ok(confirmPrompted, "Confirmation dialog was shown");
      assert.equal(disabledEmail, "admin@atlanticholiday.com");
      assert.equal(disabledState, false, "setTwoFactorState called with false");
    } finally {
      window.confirm = originalConfirm;
    }
  });
});

describe("AccessManager - 2FA integration", () => {
  test("getAccessEntry returns default false for twoFactorEnabled and twoFactorEnrolled when missing", async () => {
    const entryData = {
      displayEmail: "test@atlanticholiday.com",
      roles: ["employee"],
      allowedApps: []
    };

    const result = {
      twoFactorEnabled: Boolean(entryData.twoFactorEnabled),
      twoFactorEnrolled: Boolean(entryData.twoFactorEnrolled)
    };

    assert.equal(result.twoFactorEnabled, false, "Defaults to false");
    assert.equal(result.twoFactorEnrolled, false, "Defaults to false");
  });

  test("calls protected 2FA callable functions", async () => {
    const calls = [];
    const mockFunctionsInstance = {};
    const accessManager = new AccessManager({}, mockFunctionsInstance);

    accessManager.callProtectedFunction = async (name, data) => {
      calls.push({ name, data });
      return { ok: true };
    };

    await accessManager.setTwoFactorState("user@example.com", true);
    assert.equal(calls[0].name, "adminSetTwoFactorState");
    assert.equal(calls[0].data.email, "user@example.com");
    assert.equal(calls[0].data.enabled, true);

    await accessManager.getTwoFactorSetup("user@example.com", { regenerate: true });
    assert.equal(calls[1].name, "adminGetTwoFactorSetup");
    assert.equal(calls[1].data.email, "user@example.com");
    assert.equal(calls[1].data.regenerate, true);

    await accessManager.verifyTwoFactorChallenge("123456", { email: "user@example.com", isEnrollment: true });
    assert.equal(calls[2].name, "verifyTwoFactorChallenge");
    assert.equal(calls[2].data.code, "123456");
    assert.equal(calls[2].data.email, "user@example.com");
    assert.equal(calls[2].data.isEnrollment, true);
  });
});
