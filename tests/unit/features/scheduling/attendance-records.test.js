import { describe, test, assert } from "../../../test-harness.js";
import {
  appendAttendanceEvent,
  createAttendanceRecord,
  formatLocalDateTime,
  getAttendanceActionState,
  getAttendanceReviewQueue,
  getWeeklyAttendanceSummary,
  setAttendanceReview,
  summarizeAttendanceRecord
} from "../../../../js/features/scheduling/attendance-records.js";

describe("Attendance records", () => {
  test("creates and appends normalized attendance events", () => {
    const record = createAttendanceRecord({
      employeeId: "emp-1",
      employeeName: "Ana",
      dateKey: "2026-03-23",
      createdAt: "2026-03-23T08:55:00.000Z"
    });

    const updated = appendAttendanceEvent(record, {
      type: "clockIn",
      occurredAt: "2026-03-23T09:00",
      actorEmail: "ana@example.com"
    });

    assert.equal(updated.employeeId, "emp-1");
    assert.equal(updated.dateKey, "2026-03-23");
    assert.equal(updated.punches.length, 1);
    assert.equal(updated.punches[0].occurredAt, "2026-03-23T09:00:00");
    assert.equal(updated.punches[0].actorEmail, "ana@example.com");
  });

  test("derives clock actions from the punch sequence", () => {
    let record = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    assert.equal(getAttendanceActionState(record).primaryAction, "clockIn");

    record = appendAttendanceEvent(record, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });
    assert.deepEqual(getAttendanceActionState(record), {
      status: "working",
      primaryAction: "clockOut",
      secondaryAction: "breakStart"
    });

    record = appendAttendanceEvent(record, { type: "breakStart", occurredAt: "2026-03-23T12:30:00" });
    assert.deepEqual(getAttendanceActionState(record), {
      status: "on-break",
      primaryAction: "breakEnd",
      secondaryAction: "clockOut"
    });
  });

  test("summarizes worked and break minutes with open sessions", () => {
    let record = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    record = appendAttendanceEvent(record, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });
    record = appendAttendanceEvent(record, { type: "breakStart", occurredAt: "2026-03-23T12:00:00" });
    record = appendAttendanceEvent(record, { type: "breakEnd", occurredAt: "2026-03-23T12:30:00" });
    record = appendAttendanceEvent(record, { type: "clockOut", occurredAt: "2026-03-23T17:00:00" });

    const summary = summarizeAttendanceRecord(record);
    assert.equal(summary.workedMinutes, 450);
    assert.equal(summary.breakMinutes, 30);
    assert.equal(summary.firstClockIn, "2026-03-23T09:00:00");
    assert.equal(summary.lastClockOut, "2026-03-23T17:00:00");
    assert.equal(summary.hasOpenSession, false);
  });

  test("automatically deducts one lunch hour for a closed single-block full day with no break punches", () => {
    let record = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    record = appendAttendanceEvent(record, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });
    record = appendAttendanceEvent(record, { type: "clockOut", occurredAt: "2026-03-23T18:00:00" });

    const summary = summarizeAttendanceRecord(record);
    assert.equal(summary.workedMinutes, 480);
    assert.equal(summary.breakMinutes, 60);
    assert.equal(summary.autoBreakMinutes, 60);
  });

  test("does not auto-deduct lunch for short or split days", () => {
    let shortDay = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    shortDay = appendAttendanceEvent(shortDay, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });
    shortDay = appendAttendanceEvent(shortDay, { type: "clockOut", occurredAt: "2026-03-23T13:00:00" });

    let splitDay = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-24" });
    splitDay = appendAttendanceEvent(splitDay, { type: "clockIn", occurredAt: "2026-03-24T09:00:00" });
    splitDay = appendAttendanceEvent(splitDay, { type: "clockOut", occurredAt: "2026-03-24T12:00:00" });
    splitDay = appendAttendanceEvent(splitDay, { type: "clockIn", occurredAt: "2026-03-24T13:00:00" });
    splitDay = appendAttendanceEvent(splitDay, { type: "clockOut", occurredAt: "2026-03-24T18:00:00" });

    const shortSummary = summarizeAttendanceRecord(shortDay);
    const splitSummary = summarizeAttendanceRecord(splitDay);

    assert.equal(shortSummary.workedMinutes, 240);
    assert.equal(shortSummary.breakMinutes, 0);
    assert.equal(shortSummary.autoBreakMinutes, 0);
    assert.equal(splitSummary.workedMinutes, 480);
    assert.equal(splitSummary.breakMinutes, 0);
    assert.equal(splitSummary.autoBreakMinutes, 0);
  });

  test("treats a missing attendance record as an empty day", () => {
    const summary = summarizeAttendanceRecord(null, {
      referenceDateTime: "2026-03-23T10:00:00"
    });

    assert.equal(summary.status, "clocked-out");
    assert.equal(summary.primaryAction, "clockIn");
    assert.equal(summary.punches.length, 0);
    assert.equal(summary.workedMinutes, 0);
    assert.equal(summary.breakMinutes, 0);
    assert.equal(summary.hasOpenSession, false);
  });

  test("flags records needing review from open sessions or manager adjustments", () => {
    let openRecord = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    openRecord = appendAttendanceEvent(openRecord, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });

    let adjustedRecord = createAttendanceRecord({ employeeId: "emp-2", employeeName: "Bruno", dateKey: "2026-03-22" });
    adjustedRecord = appendAttendanceEvent(adjustedRecord, {
      type: "clockIn",
      occurredAt: "2026-03-22T09:00:00",
      source: "manual",
      note: "Late entry reconstructed"
    });

    const queue = getAttendanceReviewQueue([adjustedRecord, openRecord], {
      referenceDateTime: "2026-03-23T18:00:00"
    });

    assert.equal(queue.length, 2);
    assert.equal(queue[0].record.dateKey, "2026-03-23");
    assert.equal(queue[1].record.review.status, "needs-attention");
  });

  test("supports review status updates and weekly totals", () => {
    let monday = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-23" });
    monday = appendAttendanceEvent(monday, { type: "clockIn", occurredAt: "2026-03-23T09:00:00" });
    monday = appendAttendanceEvent(monday, { type: "clockOut", occurredAt: "2026-03-23T17:00:00" });

    let tuesday = createAttendanceRecord({ employeeId: "emp-1", employeeName: "Ana", dateKey: "2026-03-24" });
    tuesday = appendAttendanceEvent(tuesday, { type: "clockIn", occurredAt: "2026-03-24T09:30:00" });
    tuesday = appendAttendanceEvent(tuesday, { type: "clockOut", occurredAt: "2026-03-24T16:30:00" });

    const reviewed = setAttendanceReview(monday, {
      status: "reviewed",
      note: "Checked by manager",
      reviewedBy: "manager@example.com",
      reviewedAt: "2026-03-23T18:10:00.000Z"
    });

    const weeklySummary = getWeeklyAttendanceSummary([reviewed, tuesday]);

    assert.equal(reviewed.review.status, "reviewed");
    assert.equal(reviewed.review.note, "Checked by manager");
    assert.equal(reviewed.review.reviewedBy, "manager@example.com");
    assert.equal(weeklySummary.workedMinutes, 780);
    assert.equal(weeklySummary.breakMinutes, 120);
    assert.equal(weeklySummary.daysWithPunches, 2);
  });

  test("formats local timestamps for live punches", () => {
    const value = formatLocalDateTime(new Date(2026, 2, 23, 9, 5, 7));
    assert.equal(value, "2026-03-23T09:05:07");
  });
});
