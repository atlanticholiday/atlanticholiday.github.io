import { describe, test, assert } from "../../../test-harness.js";
import { resetDom } from "../../../test-utils.js";
import { UserManagementController, formatUserAgentSummary } from "../../../../js/features/admin/user-management-controller.js";

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
    <input id="new-user-email">
    <input id="new-user-password">
    <p id="create-user-error"></p>
    <button id="create-user-btn">Create</button>
    <select id="new-role-key"><option value=""></option></select>
    <select id="new-role-title"><option value=""></option></select>
    <button id="add-role-btn">Add Role</button>
  `);
}

describe("formatUserAgentSummary", () => {
  test("formats Windows Chrome user agent", () => {
    const summary = formatUserAgentSummary("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    assert.equal(summary, "Chrome · Windows");
  });

  test("formats macOS Safari user agent", () => {
    const summary = formatUserAgentSummary("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15");
    assert.equal(summary, "Safari · macOS");
  });

  test("formats iPhone Safari user agent", () => {
    const summary = formatUserAgentSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1");
    assert.equal(summary, "Safari · iPhone");
  });

  test("formats Windows Edge user agent", () => {
    const summary = formatUserAgentSummary("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0");
    assert.equal(summary, "Edge · Windows");
  });

  test("formats Linux Firefox user agent", () => {
    const summary = formatUserAgentSummary("Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0");
    assert.equal(summary, "Firefox · Linux");
  });

  test("handles null or empty user agent", () => {
    assert.equal(formatUserAgentSummary(null), "—");
    assert.equal(formatUserAgentSummary(""), "—");
  });
});

describe("UserManagementController - Security & Activity (IP Check)", () => {
  test("renders IP check, device, and recent login history in the User Inspector", async () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["admin@example.com"];
        },
        async getAccessEntry(email) {
          return {
            email,
            displayEmail: email,
            roles: ["admin"],
            allowedApps: [],
            lastLoginIp: "85.240.12.34",
            lastLoginAt: "2026-09-12T10:30:00",
            lastUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
            recentLogins: [
              {
                ip: "85.240.12.34",
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
                occurredAt: "2026-09-12T10:30:00"
              },
              {
                ip: "194.65.22.10",
                userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
                occurredAt: "2026-09-11T18:15:00"
              }
            ]
          };
        }
      },
      roleManager: {
        async listRoles() {
          return [{ key: "admin", title: "Administrator" }];
        }
      },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {}
    });

    controller.init();
    await controller.refreshUserList();

    const inspectorContent = document.getElementById("user-inspector-content");
    assert.ok(inspectorContent);

    // IP address rendered in inspector
    assert.includes(inspectorContent.textContent, "85.240.12.34");
    assert.includes(inspectorContent.textContent, "Security & Activity");
    assert.includes(inspectorContent.textContent, "Chrome · Windows");

    // IP lookup link
    const lookupLink = inspectorContent.querySelector(".user-management-ip-lookup-btn");
    assert.ok(lookupLink, "IP lookup link should exist");
    assert.equal(lookupLink.getAttribute("href"), "https://whatismyipaddress.com/ip/85.240.12.34");
    assert.equal(lookupLink.getAttribute("target"), "_blank");

    // Recent login session rows
    const sessionRows = inspectorContent.querySelectorAll(".user-management-login-session-row");
    assert.equal(sessionRows.length, 2, "Should render 2 recent login sessions");
    assert.includes(sessionRows[0].textContent, "85.240.12.34");
    assert.includes(sessionRows[0].textContent, "Chrome · Windows");
    assert.includes(sessionRows[1].textContent, "194.65.22.10");
    assert.includes(sessionRows[1].textContent, "Safari · iPhone");

    // Directory row contains inline IP
    const userRow = document.querySelector("#user-list .user-management-user-row");
    assert.ok(userRow);
    assert.includes(userRow.textContent, "85.240.12.34");
  });

  test("renders clean fallback when user has never logged in yet", async () => {
    createFixture();

    const controller = new UserManagementController({
      accessManager: {
        async listEmails() {
          return ["newuser@example.com"];
        },
        async getAccessEntry(email) {
          return {
            email,
            displayEmail: email,
            roles: ["employee"],
            allowedApps: [],
            lastLoginIp: null,
            lastLoginAt: null,
            lastUserAgent: null,
            recentLogins: []
          };
        }
      },
      roleManager: {
        async listRoles() {
          return [{ key: "employee", title: "Employee" }];
        }
      },
      createAuthUser: async () => {},
      sendPasswordReset: async () => {}
    });

    controller.init();
    await controller.refreshUserList();

    const inspectorContent = document.getElementById("user-inspector-content");
    assert.ok(inspectorContent);

    // Shows no IP recorded label
    assert.includes(inspectorContent.textContent, "No IP recorded yet");
    assert.equal(inspectorContent.querySelector(".user-management-ip-lookup-btn"), null);
    assert.equal(inspectorContent.querySelectorAll(".user-management-login-session-row").length, 0);
  });
});
