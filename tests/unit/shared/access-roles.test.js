import { describe, test, assert } from "../../test-harness.js";
import {
  canAccessSharedVacationBoard,
  hasPrivilegedRole,
  hasTimeClockStationRole,
  isSharedVacationBoardOnlyUser,
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

  test("allows the shared vacation board for privileged or linked employee users only", () => {
    assert.equal(canAccessSharedVacationBoard(["manager"], { hasEmployeeLink: false }), true);
    assert.equal(canAccessSharedVacationBoard(["employee"], { hasEmployeeLink: true }), true);
    assert.equal(canAccessSharedVacationBoard(["employee"], { hasEmployeeLink: false }), false);
    assert.equal(canAccessSharedVacationBoard([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });

  test("detects employee-only vacation board mode", () => {
    assert.equal(isSharedVacationBoardOnlyUser(["employee"], { hasEmployeeLink: true }), true);
    assert.equal(isSharedVacationBoardOnlyUser(["manager"], { hasEmployeeLink: true }), false);
    assert.equal(isSharedVacationBoardOnlyUser([TIME_CLOCK_STATION_ROLE], { hasEmployeeLink: true }), false);
  });
});
