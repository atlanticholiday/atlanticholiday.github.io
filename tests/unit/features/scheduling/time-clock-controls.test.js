import { describe, test, assert } from "../../../test-harness.js";
import {
  MANUAL_ATTENDANCE_NOTE_MIN_LENGTH,
  getAttendanceSyncStage,
  normalizeManualAttendanceNote
} from "../../../../js/features/scheduling/time-clock-controls.js";

describe("time clock controls", () => {
  test("normalizes manual attendance notes and rejects short reasons", () => {
    assert.equal(normalizeManualAttendanceNote("  missed punch at desk  "), "missed punch at desk");
    assert.equal(normalizeManualAttendanceNote("short"), null);
    assert.equal(normalizeManualAttendanceNote("", { minLength: 1 }), null);
    assert.equal(normalizeManualAttendanceNote("x".repeat(MANUAL_ATTENDANCE_NOTE_MIN_LENGTH)), "x".repeat(MANUAL_ATTENDANCE_NOTE_MIN_LENGTH));
  });

  test("derives the correct sync stage from attendance sync state", () => {
    assert.equal(getAttendanceSyncStage({ online: true, fromCache: false, hasPendingWrites: false }), "synced");
    assert.equal(getAttendanceSyncStage({ online: true, fromCache: true, hasPendingWrites: false }), "cached");
    assert.equal(getAttendanceSyncStage({ online: true, fromCache: true, hasPendingWrites: true }), "pending");
    assert.equal(getAttendanceSyncStage({ online: false, fromCache: true, hasPendingWrites: false }), "offline");
    assert.equal(getAttendanceSyncStage({ online: false, fromCache: true, hasPendingWrites: true }), "offline-pending");
    assert.equal(getAttendanceSyncStage({ online: true, lastError: "boom" }), "error");
  });
});
