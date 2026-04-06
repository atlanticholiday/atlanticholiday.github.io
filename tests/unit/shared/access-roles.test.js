import { describe, test, assert } from "../../test-harness.js";
import {
  canAccessSelfServiceSchedule,
  canAccessSharedVacationBoard,
  hasEmployeeSelfServiceRole,
  hasPrivilegedRole,
  hasTimeClockStationRole,
  isSelfServiceEmployeeUser,
  isSharedVacationBoardOnlyUser,
  SELF_SERVICE_SCHEDULE_VIEWS,
  TIME_CLOCK_STATION_ROLE
} from "../../../js/shared/access-roles.js";

describe("Access roles", () => {
  test("detects privileged roles", () => {
    assert.equal(hasPrivilegedRole(["employee"]), false);
    assert.equal(hasPrivilegedRole(["manager"]), true);
  });

  test("detects the shared time clock station role", () => {
    assert.equal(hasTimeClockStationRole(["employee"]), false);
    assert.equal(hasTimeClockStationRole([TIME_CLOCK_STATION_ROLE]), true);
  });

  test("detects the employee self-service role", () => {
    assert.equal(hasEmployeeSelfServiceRole(["employee"]), true);
    assert.equal(hasEmployeeSelfServiceRole(["manager"]), false);
  });

  test("allows the work schedule for privileged or self-service employee users only", () => {
    assert.equal(canAccessSelfServiceSchedule(["manager"], { hasEmployeeLink: false }), true);
    assert.equal(canAccessSelfServiceSchedule(["employee"], { hasEmployeeLink: false }), true);
    assert.equal(canAccessSelfServiceSchedule([], { hasEmployeeLink: true }), true);
    assert.equal(canAccessSelfServiceSchedule([], { hasEmployeeLink: false }), false);
    assert.equal(canAccessSelfServiceSchedule([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });

  test("detects self-service employee mode", () => {
    assert.equal(isSelfServiceEmployeeUser(["employee"], { hasEmployeeLink: false }), true);
    assert.equal(isSelfServiceEmployeeUser([], { hasEmployeeLink: true }), true);
    assert.equal(isSelfServiceEmployeeUser(["manager"], { hasEmployeeLink: true }), false);
    assert.equal(isSelfServiceEmployeeUser([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });

  test("limits self-service schedule access to the monthly view", () => {
    assert.deepEqual(SELF_SERVICE_SCHEDULE_VIEWS, ["monthly"]);
  });

  test("allows the shared vacation board for privileged users only", () => {
    assert.equal(canAccessSharedVacationBoard(["manager"], { hasEmployeeLink: false }), true);
    assert.equal(canAccessSharedVacationBoard(["employee"], { hasEmployeeLink: true }), false);
    assert.equal(canAccessSharedVacationBoard(["employee"], { hasEmployeeLink: false }), false);
    assert.equal(canAccessSharedVacationBoard([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });

  test("disables the old vacation-board-only employee mode", () => {
    assert.equal(isSharedVacationBoardOnlyUser(["employee"], { hasEmployeeLink: true }), false);
    assert.equal(isSharedVacationBoardOnlyUser(["manager"], { hasEmployeeLink: true }), false);
    assert.equal(isSharedVacationBoardOnlyUser([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });
});
