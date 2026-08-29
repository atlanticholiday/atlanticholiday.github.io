import { describe, test, assert } from "../../../test-harness.js";
import { buildEffectiveAccessPreview } from "../../../../js/features/admin/access-preview.js";

describe("Access preview", () => {
  test("shows full app and administration access for administrators", () => {
    const preview = buildEffectiveAccessPreview({ roles: ["admin"], allowedApps: [] });

    assert.equal(preview.accessLevel, "admin");
    assert.equal(preview.surfaces.userManagement, true);
    assert.equal(preview.surfaces.schedule, "full");
    assert.equal(preview.surfaces.tasks, "manager");
    assert.ok(preview.appKeys.includes("staff"));
    assert.ok(preview.appScopes.every((app) => app.scope === "manager"));
  });

  test("shows employee self-service plus scoped app permissions", () => {
    const preview = buildEffectiveAccessPreview({
      roles: ["employee"],
      allowedApps: ["laundryLog", "reservations"]
    }, { hasEmployeeLink: true });

    assert.equal(preview.accessLevel, "employee-with-apps");
    assert.equal(preview.surfaces.timeClock, "self-service");
    assert.equal(preview.surfaces.schedule, "monthly-readonly");
    assert.equal(preview.surfaces.tasks, "personal");
    assert.equal(preview.surfaces.userManagement, false);
    assert.ok(preview.appKeys.includes("heatedPools"));
    assert.equal(preview.appScopes.find((app) => app.key === "laundryLog").scope, "colleague-workflow");
    assert.equal(preview.appScopes.find((app) => app.key === "reservations").scope, "own-records");
  });

  test("station access overrides dashboard roles and apps", () => {
    const preview = buildEffectiveAccessPreview({
      roles: ["admin", "time-clock-station"],
      allowedApps: ["staff"]
    });

    assert.equal(preview.accessLevel, "station");
    assert.equal(preview.surfaces.timeClock, "station");
    assert.equal(preview.surfaces.userManagement, false);
    assert.equal(preview.surfaces.tasks, null);
    assert.deepEqual(preview.appKeys, []);
  });

  test("does not invent full access for a legacy account with no saved apps", () => {
    const preview = buildEffectiveAccessPreview({ roles: [], allowedApps: null });

    assert.equal(preview.accessLevel, "no-workspace");
    assert.deepEqual(preview.appKeys, []);
  });
});
