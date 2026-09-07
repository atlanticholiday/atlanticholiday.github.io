const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { randomUUID } = require("node:crypto");

initializeApp();
const auth = getAuth();
const firestore = getFirestore();

const PRIVILEGED_ROLE_KEYS = new Set(["admin", "manager", "supervisor"]);
const ATTENDANCE_EVENT_TYPES = new Set(["clockIn", "clockOut", "breakStart", "breakEnd"]);
const ATTENDANCE_REVIEW_STATUSES = new Set(["needs-attention", "reviewed"]);
const OVERTIME_LEGAL_BASES = new Set(["temporary-increase", "force-majeure", "prevent-serious-harm"]);
const PORTUGAL_TIME_ZONE = "Europe/Lisbon";
const ATTENDANCE_RETENTION_YEARS = 5;
const APP_ACCESS_KEYS = new Set([
  "vehicles",
  "staff",
  "vacationCenter",
  "properties",
  "airbnbReservationInvoices",
  "welcomePacks",
  "laundryLog",
  "linenInventory",
  "operationalGuidelines",
  "heatedPools",
  "allinfo",
  "rnal",
  "checklists",
  "owners",
  "safety",
  "reservations",
  "buildPlanner",
  "inventory",
  "cleaningAh"
]);

exports.recordAttendancePunch = onCall(async (request) => {
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const eventType = normalizeAttendanceEventType(request.data?.eventType);
  const actor = await requireAttendanceAccess(request, employeeId);
  const employee = await getActiveEmployee(employeeId);
  const now = new Date();
  const occurredAt = formatPortugalLocalDateTime(now);
  const todayKey = occurredAt.slice(0, 10);
  const previousDate = new Date(`${todayKey}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousKey = previousDate.toISOString().slice(0, 10);
  const todayRef = firestore.collection("attendance_records").doc(`${employeeId}_${todayKey}`);
  const previousRef = firestore.collection("attendance_records").doc(`${employeeId}_${previousKey}`);

  const result = await firestore.runTransaction(async (transaction) => {
    const [todaySnapshot, previousSnapshot] = await transaction.getAll(todayRef, previousRef);
    const todayRecord = todaySnapshot.exists ? todaySnapshot.data() : null;
    const previousRecord = previousSnapshot.exists ? previousSnapshot.data() : null;
    const todayState = getAttendanceActionState(todayRecord);
    const previousState = getAttendanceActionState(previousRecord);
    const todayOpen = todayState.status !== "clocked-out";
    const previousOpen = previousState.status !== "clocked-out";

    let targetRef = todayRef;
    let targetDateKey = todayKey;
    let baseRecord = todayRecord;
    let actionState = todayState;

    if (!todayOpen && previousOpen) {
      targetRef = previousRef;
      targetDateKey = previousKey;
      baseRecord = previousRecord;
      actionState = previousState;
    }

    const allowedActions = [actionState.primaryAction, actionState.secondaryAction].filter(Boolean);
    if (!allowedActions.includes(eventType)) {
      throw new HttpsError("failed-precondition", "This attendance action is not available right now.");
    }

    const source = actor.station ? "station" : "web";
    const event = createTrustedAttendanceEvent({
      eventType,
      occurredAt,
      occurredAtUtc: now.toISOString(),
      actor,
      source
    });
    const nextRecord = appendTrustedAttendanceEvent(baseRecord, {
      employeeId,
      employeeName: employee.name,
      dateKey: targetDateKey,
      event,
      now
    });
    transaction.set(targetRef, nextRecord);
    return { recordId: targetRef.id, event };
  });

  await writeAudit({
    email: actor.email,
    uid: actor.uid,
    event: "attendance_punch_recorded",
    employeeId,
    attendanceEventId: result.event.id,
    attendanceEventType: eventType
  });
  return result;
});

exports.addManualAttendanceCorrection = onCall(async (request) => {
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const dateKey = normalizeDateKey(request.data?.dateKey);
  const localTime = normalizeLocalTime(request.data?.localTime);
  const eventType = normalizeAttendanceEventType(request.data?.eventType);
  const reason = requireText(request.data?.reason, 8, 500, "A clear correction reason is required.");
  const actor = await requireAttendanceManager(request);
  const employee = await getEmployee(employeeId);
  const now = new Date();
  const occurredAt = `${dateKey}T${localTime}`;
  const recordRef = firestore.collection("attendance_records").doc(`${employeeId}_${dateKey}`);

  const result = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    const baseRecord = snapshot.exists ? snapshot.data() : null;
    const event = createTrustedAttendanceEvent({
      eventType,
      occurredAt,
      occurredAtUtc: null,
      actor,
      source: "manual",
      note: reason
    });
    const correction = {
      id: randomUUID(),
      type: "event-added",
      eventId: event.id,
      reason,
      actorUid: actor.uid,
      actorEmail: actor.email,
      recordedAt: now.toISOString(),
      status: "needs-attention"
    };
    const nextRecord = appendTrustedAttendanceEvent(baseRecord, {
      employeeId,
      employeeName: employee.name,
      dateKey,
      event,
      now,
      correction
    });
    transaction.set(recordRef, nextRecord);
    return { recordId: recordRef.id, event, correction };
  });

  await writeAudit({
    email: actor.email,
    uid: actor.uid,
    event: "attendance_correction_added",
    employeeId,
    correctionId: result.correction.id,
    reason
  });
  return result;
});

exports.voidAttendanceEvent = onCall(async (request) => {
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const dateKey = normalizeDateKey(request.data?.dateKey);
  const eventId = requireDocumentId(request.data?.eventId, "A valid attendance event is required.");
  const reason = requireText(request.data?.reason, 8, 500, "A clear void reason is required.");
  const actor = await requireAttendanceManager(request);
  const recordRef = firestore.collection("attendance_records").doc(`${employeeId}_${dateKey}`);
  const now = new Date();
  let correctionId = null;

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "The attendance record does not exist.");
    const record = snapshot.data() || {};
    if (!safeArray(record.punches).some((event) => event.id === eventId)) {
      throw new HttpsError("not-found", "The attendance event does not exist.");
    }
    if (safeArray(record.voidedEventIds).includes(eventId)) {
      throw new HttpsError("already-exists", "The attendance event is already voided.");
    }
    correctionId = randomUUID();
    const correction = {
      id: correctionId,
      type: "event-voided",
      eventId,
      reason,
      actorUid: actor.uid,
      actorEmail: actor.email,
      recordedAt: now.toISOString(),
      status: "needs-attention"
    };
    transaction.update(recordRef, {
      voidedEventIds: [...safeArray(record.voidedEventIds), eventId],
      corrections: [...safeArray(record.corrections), correction],
      workerAttestation: null,
      review: { status: "needs-attention", note: reason, reviewedAt: null, reviewedBy: null },
      updatedAt: now.toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    });
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: "attendance_event_voided", employeeId, dateKey, attendanceEventId: eventId, correctionId, reason });
  return { ok: true, correctionId };
});

exports.reviewAttendanceRecord = onCall(async (request) => {
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const dateKey = normalizeDateKey(request.data?.dateKey);
  const status = ATTENDANCE_REVIEW_STATUSES.has(request.data?.status)
    ? request.data.status
    : "reviewed";
  const note = requireText(request.data?.note || "Reviewed by a responsible person.", 3, 500, "A review note is required.");
  const actor = await requireAttendanceManager(request);
  const recordRef = firestore.collection("attendance_records").doc(`${employeeId}_${dateKey}`);
  const now = new Date();

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (!snapshot.exists) {
      throw new HttpsError("not-found", "The attendance record does not exist.");
    }
    const record = snapshot.data() || {};
    const reviewEntry = {
      id: randomUUID(),
      status,
      note,
      reviewedAt: now.toISOString(),
      reviewedByUid: actor.uid,
      reviewedBy: actor.email
    };
    transaction.set(recordRef, {
      ...record,
      review: {
        status,
        note,
        reviewedAt: reviewEntry.reviewedAt,
        reviewedBy: actor.email
      },
      reviewHistory: [...safeArray(record.reviewHistory), reviewEntry],
      updatedAt: now.toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    });
  });

  await writeAudit({ email: actor.email, uid: actor.uid, event: "attendance_record_reviewed", employeeId, dateKey, status });
  return { ok: true };
});

exports.attestAttendanceRecord = onCall(async (request) => {
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const dateKey = normalizeDateKey(request.data?.dateKey);
  const actor = await requireAttendanceAccess(request, employeeId);
  if (!actor.own) throw new HttpsError("permission-denied", "Only the worker can attest this attendance record.");
  const recordRef = firestore.collection("attendance_records").doc(`${employeeId}_${dateKey}`);
  const now = new Date();
  const attestation = {
    id: randomUUID(),
    status: "attested",
    workerUid: actor.uid,
    workerEmail: actor.email,
    attestedAt: now.toISOString()
  };
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "The attendance record does not exist.");
    const record = snapshot.data() || {};
    const effectivePunches = safeArray(record.punches).filter((event) => !safeArray(record.voidedEventIds).includes(event.id));
    if (!effectivePunches.length || getAttendanceActionState(record).status !== "clocked-out") {
      throw new HttpsError("failed-precondition", "Finish the work period before confirming the attendance record.");
    }
    transaction.update(recordRef, {
      workerAttestation: attestation,
      attestationHistory: [...safeArray(record.attestationHistory), attestation],
      updatedAt: now.toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    });
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: "attendance_worker_attested", employeeId, dateKey });
  return { ok: true };
});

exports.authorizeOvertime = onCall(async (request) => {
  const actor = await requireAttendanceManager(request);
  const employeeId = requireDocumentId(request.data?.employeeId, "A valid colleague is required.");
  const dateKey = normalizeDateKey(request.data?.dateKey);
  const reason = requireText(request.data?.reason, 8, 500, "The reason for overtime is required.");
  const legalBasis = OVERTIME_LEGAL_BASES.has(request.data?.legalBasis)
    ? request.data.legalBasis
    : "temporary-increase";
  const workplace = requireText(request.data?.workplace || "Usual workplace", 2, 300, "The workplace is required.");
  const compensationChoice = request.data?.compensationChoice === "rest" ? "rest" : "payment";
  const employee = await getActiveEmployee(employeeId);
  const now = new Date();
  const todayKey = formatPortugalLocalDateTime(now).slice(0, 10);
  if (dateKey < todayKey) {
    throw new HttpsError("failed-precondition", "Overtime must be authorized before it starts and cannot be backdated.");
  }
  const retentionDate = new Date(`${dateKey}T00:00:00Z`);
  retentionDate.setUTCFullYear(retentionDate.getUTCFullYear() + ATTENDANCE_RETENTION_YEARS);
  const recordRef = firestore.collection("overtime_records").doc();
  const authorization = {
    id: randomUUID(),
    event: "authorized",
    actorUid: actor.uid,
    actorEmail: actor.email,
    recordedAt: now.toISOString()
  };
  await recordRef.set({
    employeeId,
    employeeName: employee.name,
    dateKey,
    reason,
    legalBasis,
    workplace,
    compensationChoice,
    status: "authorized",
    authorizedAt: now.toISOString(),
    authorizedByUid: actor.uid,
    authorizedBy: actor.email,
    startEvent: null,
    endEvent: null,
    workerValidation: null,
    compensatoryRest: null,
    auditTrail: [authorization],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    updatedAtServer: FieldValue.serverTimestamp(),
    retainUntil: retentionDate.toISOString().slice(0, 10),
    schemaVersion: 1
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: "overtime_authorized", employeeId, overtimeRecordId: recordRef.id, reason });
  return { id: recordRef.id };
});

exports.recordOvertimePunch = onCall(async (request) => {
  const overtimeRecordId = requireDocumentId(request.data?.overtimeRecordId, "A valid overtime record is required.");
  const action = request.data?.action === "end" ? "end" : request.data?.action === "start" ? "start" : null;
  if (!action) throw new HttpsError("invalid-argument", "A valid overtime action is required.");
  const recordRef = firestore.collection("overtime_records").doc(overtimeRecordId);
  const initial = await recordRef.get();
  if (!initial.exists) throw new HttpsError("not-found", "The overtime record does not exist.");
  const actor = await requireAttendanceAccess(request, initial.data()?.employeeId);
  const now = new Date();
  const occurredAt = formatPortugalLocalDateTime(now);
  const event = createTrustedAttendanceEvent({
    eventType: action === "start" ? "overtimeStart" : "overtimeEnd",
    occurredAt,
    occurredAtUtc: now.toISOString(),
    actor,
    source: actor.station ? "station" : "web"
  });

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(recordRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "The overtime record does not exist.");
    const record = snapshot.data() || {};
    if (action === "start" && record.dateKey !== occurredAt.slice(0, 10)) {
      throw new HttpsError("failed-precondition", "Overtime can only start on its authorized date.");
    }
    if (action === "start" && (record.status !== "authorized" || record.startEvent)) {
      throw new HttpsError("failed-precondition", "This overtime period cannot be started.");
    }
    if (action === "end" && (!record.startEvent || record.endEvent)) {
      throw new HttpsError("failed-precondition", "This overtime period cannot be ended.");
    }
    const nextStatus = action === "start" ? "in-progress" : (actor.own ? "worker-validated" : "awaiting-worker-validation");
    const auditEntry = { id: randomUUID(), event: action === "start" ? "started" : "ended", actorUid: actor.uid, actorEmail: actor.email, recordedAt: now.toISOString() };
    transaction.update(recordRef, {
      [action === "start" ? "startEvent" : "endEvent"]: event,
      status: nextStatus,
      workerValidation: action === "end" && actor.own ? {
        status: "validated",
        workerUid: actor.uid,
        workerEmail: actor.email,
        validatedAt: now.toISOString()
      } : (record.workerValidation || null),
      auditTrail: [...safeArray(record.auditTrail), auditEntry],
      updatedAt: now.toISOString(),
      updatedAtServer: FieldValue.serverTimestamp()
    });
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: `overtime_${action}`, overtimeRecordId, employeeId: initial.data()?.employeeId });
  return { ok: true, event };
});

exports.validateOvertimeRecord = onCall(async (request) => {
  const overtimeRecordId = requireDocumentId(request.data?.overtimeRecordId, "A valid overtime record is required.");
  const recordRef = firestore.collection("overtime_records").doc(overtimeRecordId);
  const snapshot = await recordRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "The overtime record does not exist.");
  const record = snapshot.data() || {};
  const actor = await requireAttendanceAccess(request, record.employeeId);
  if (!actor.own) throw new HttpsError("permission-denied", "Only the worker can validate this overtime record.");
  if (!record.endEvent) throw new HttpsError("failed-precondition", "End the overtime period before validating it.");
  const now = new Date();
  const validation = { status: "validated", workerUid: actor.uid, workerEmail: actor.email, validatedAt: now.toISOString() };
  await recordRef.update({
    workerValidation: validation,
    status: "worker-validated",
    auditTrail: [...safeArray(record.auditTrail), { id: randomUUID(), event: "worker-validated", actorUid: actor.uid, actorEmail: actor.email, recordedAt: now.toISOString() }],
    updatedAt: now.toISOString(),
    updatedAtServer: FieldValue.serverTimestamp()
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: "overtime_worker_validated", overtimeRecordId, employeeId: record.employeeId });
  return { ok: true };
});

exports.reviewOvertimeRecord = onCall(async (request) => {
  const actor = await requireAttendanceManager(request);
  const overtimeRecordId = requireDocumentId(request.data?.overtimeRecordId, "A valid overtime record is required.");
  const note = requireText(request.data?.note || "Reviewed by a responsible person.", 3, 500, "A review note is required.");
  const restDate = request.data?.restDate ? normalizeDateKey(request.data.restDate) : null;
  const recordRef = firestore.collection("overtime_records").doc(overtimeRecordId);
  const snapshot = await recordRef.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "The overtime record does not exist.");
  const record = snapshot.data() || {};
  if (!record.endEvent) throw new HttpsError("failed-precondition", "The overtime period has not ended.");
  if (record.workerValidation?.status !== "validated") {
    throw new HttpsError("failed-precondition", "The worker must validate the overtime record before manager review.");
  }
  if (record.compensationChoice === "rest" && !restDate) {
    throw new HttpsError("failed-precondition", "Record the compensatory rest date before completing this review.");
  }
  const now = new Date();
  await recordRef.update({
    status: "reviewed",
    managerReview: { note, reviewedAt: now.toISOString(), reviewedByUid: actor.uid, reviewedBy: actor.email },
    compensatoryRest: restDate ? { dateKey: restDate, recordedAt: now.toISOString(), recordedBy: actor.email } : null,
    auditTrail: [...safeArray(record.auditTrail), { id: randomUUID(), event: "manager-reviewed", actorUid: actor.uid, actorEmail: actor.email, recordedAt: now.toISOString(), note }],
    updatedAt: now.toISOString(),
    updatedAtServer: FieldValue.serverTimestamp()
  });
  await writeAudit({ email: actor.email, uid: actor.uid, event: "overtime_reviewed", overtimeRecordId, employeeId: record.employeeId });
  return { ok: true };
});

exports.getMyAccess = onCall(async (request) => {
  const uid = request.auth?.uid;
  const email = normalizeRawEmail(request.auth?.token?.email);
  if (!uid || !email) {
    throw new HttpsError("unauthenticated", "Sign in before loading application access.");
  }

  if (email.endsWith("@horario.test")) {
    await firestore.collection("userAccess").doc(uid).delete().catch(() => {});
    return { authorized: false };
  }

  const accessEntry = await getAccessEntry(email);
  if (!accessEntry) {
    await firestore.collection("userAccess").doc(uid).delete().catch(() => {});
    return { authorized: false };
  }

  const access = sanitizeAccessEntry(accessEntry, email);
  await materializeUserAccess(uid, email, access);
  return { authorized: true, access };
});

exports.adminCreateAuthUser = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const password = String(request.data?.password || "");

  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }

  if (password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Temporary passwords must contain between 12 and 128 characters.");
  }

  try {
    const user = await auth.createUser({ email, password });
    await writeAudit({
      email: actor.email,
      event: "auth_user_created",
      targetEmail: email,
      targetUid: user.uid
    });
    return { uid: user.uid, email };
  } catch (error) {
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "A Firebase Authentication account already exists for this email.");
    }
    console.error("Failed to create Firebase Auth user:", error);
    throw new HttpsError("internal", "Firebase Authentication could not create this user.");
  }
});

exports.adminSetUserPassword = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const password = String(request.data?.password || "");

  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }

  if (password.length < 12 || password.length > 128) {
    throw new HttpsError("invalid-argument", "Passwords must contain between 12 and 128 characters.");
  }

  const targetAccessEntry = await getAccessEntry(email);
  if (!targetAccessEntry) {
    throw new HttpsError("not-found", "This email is not listed in User Management.");
  }

  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    await auth.revokeRefreshTokens(user.uid);
    await writeAudit({
      email: actor.email,
      event: "auth_user_password_changed",
      targetEmail: email,
      targetUid: user.uid
    });
    return { ok: true };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Firebase Auth login exists for this email address.");
    }
    if (error?.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "The new password does not meet Firebase password requirements.");
    }
    console.error("Failed to update Firebase Auth password:", error);
    throw new HttpsError("internal", "Firebase Authentication could not update this password.");
  }
});

exports.adminAddAccess = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  if (email.endsWith("@horario.test")) {
    throw new HttpsError("invalid-argument", "Production test-account domains are disabled.");
  }
  const allowedApps = normalizeAllowedApps(request.data?.allowedApps);
  await writeAccessEntry(email, {
    displayEmail: email,
    allowedApps,
    addedAt: FieldValue.serverTimestamp()
  });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "access_added", targetEmail: email });
  return { ok: true };
});

exports.adminRemoveAccess = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const db = firestore;
  const keys = getEmailLookupKeys(email);
  const canonicalEmail = canonicalizeEmail(email);
  const materializedAccess = await db
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  const batch = db.batch();
  keys.forEach((key) => batch.delete(db.collection("allowedEmails").doc(key)));
  materializedAccess.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();

  try {
    const user = await auth.getUserByEmail(email);
    await auth.revokeRefreshTokens(user.uid);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.warn("Could not revoke removed user's sessions:", error);
    }
  }

  await writeAudit({ email: actor.email, event: "access_removed", targetEmail: email });
  return { ok: true };
});

exports.adminSetRoles = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const roles = normalizeRoles(request.data?.roles);
  await writeAccessEntry(email, { displayEmail: email, roles });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "roles_changed", targetEmail: email, roles });
  return { ok: true };
});

exports.adminSetAllowedApps = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const allowedApps = normalizeAllowedApps(request.data?.allowedApps);
  await writeAccessEntry(email, { displayEmail: email, allowedApps });
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "apps_changed", targetEmail: email, allowedApps });
  return { ok: true };
});

exports.adminSyncEmployeeLink = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const email = requireValidEmail(request.data?.email);
  const employee = request.data?.employee;
  const patch = { displayEmail: email };

  if (employee?.id) {
    patch.linkedEmployeeId = String(employee.id).slice(0, 160);
    patch.linkedEmployeeName = String(employee.name || "").slice(0, 200);
    patch.linkedEmployeeEmail = normalizeRawEmail(employee.email || email);
    patch.linkedEmployeeArchived = Boolean(employee.isArchived);
  } else {
    patch.linkedEmployeeId = FieldValue.delete();
    patch.linkedEmployeeName = FieldValue.delete();
    patch.linkedEmployeeEmail = FieldValue.delete();
    patch.linkedEmployeeArchived = FieldValue.delete();
  }

  await writeAccessEntry(email, patch);
  await refreshMaterializedAccess(email);
  await writeAudit({ email: actor.email, event: "employee_link_changed", targetEmail: email });
  return { ok: true };
});

exports.adminSaveRole = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const key = normalizeRole(request.data?.key);
  const title = String(request.data?.title || "").trim().slice(0, 100);
  if (!key || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key) || !title) {
    throw new HttpsError("invalid-argument", "A valid role key and title are required.");
  }

  await firestore.collection("roles").doc(key).set({
    title,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await writeAudit({ email: actor.email, event: "role_saved", role: key });
  return { ok: true };
});

exports.adminDeleteRole = onCall(async (request) => {
  const actor = await requireAdminAccess(request);
  const key = normalizeRole(request.data?.key);
  if (!key || PRIVILEGED_ROLE_KEYS.has(key)) {
    throw new HttpsError("failed-precondition", "Built-in privileged roles cannot be deleted.");
  }

  await firestore.collection("roles").doc(key).delete();
  await writeAudit({ email: actor.email, event: "role_deleted", role: key });
  return { ok: true };
});

exports.getUpcomingGuestReservations = onCall(async (request) => {
  const access = await requireAppAccess(request, "welcomePacks");
  const days = Math.max(1, Math.min(31, Number.parseInt(request.data?.days, 10) || 7));
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);

  const snapshot = await firestore
    .collection("reservations")
    .where("checkIn", ">=", startKey)
    .where("checkIn", "<=", `${endKey}T23:59:59.999Z`)
    .limit(250)
    .get();

  const reservations = snapshot.docs.map((document) => {
    const data = document.data() || {};
    return {
      propertyName: cleanGuestField(data.propertyName, 200),
      checkIn: normalizeReservationDate(data.checkIn),
      checkOut: normalizeReservationDate(data.checkOut),
      portal: cleanGuestField(data.portal || data.channel || data.sourcePortal, 60)
    };
  }).filter((reservation) => reservation.propertyName && reservation.checkIn && reservation.checkOut);

  await firestore.collection("guestDataAccessAudit").add({
    actorUid: request.auth.uid,
    actorEmail: access.email,
    event: "upcoming_reservations_read",
    startDate: startKey,
    endDate: endKey,
    recordCount: reservations.length,
    createdAt: FieldValue.serverTimestamp()
  });

  return { reservations, startDate: startKey, endDate: endKey };
});

exports.getLinenInventoryPropertyDirectory = onCall(async (request) => {
  await requireAppAccess(request, "linenInventory");

  const snapshot = await firestore.collection("properties").get();
  const properties = snapshot.docs
    .map((document) => {
      const data = document.data() || {};
      const name = [
        data.name,
        data.displayName,
        data.title,
        data.reference,
        data.code,
        data.propertyName
      ]
        .map((value) => cleanGuestField(value, 200))
        .find(Boolean);

      return {
        id: String(document.id || "").slice(0, 160),
        name: name || ""
      };
    })
    .filter((property) => property.id && property.name)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { properties };
});

exports.createPasswordResetLink = onCall({ cors: true }, async (request) => {
  const access = await requireAdminAccess(request);
  const email = normalizeRawEmail(request.data?.email);

  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }

  const targetAccessEntry = await getAccessEntry(email);
  if (!targetAccessEntry) {
    throw new HttpsError("not-found", "This email is not listed in User Management.");
  }

  try {
    await auth.getUserByEmail(email);
    const resetLink = await auth.generatePasswordResetLink(email);
    await writeAudit({
      email: access.email,
      event: "password_reset_link_created",
      targetEmail: email
    });
    return { resetLink };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Firebase Auth login exists for this email address.");
    }

    console.error("Failed to create password reset link:", error);
    const mappedError = getPasswordResetLinkError(error);
    throw new HttpsError(mappedError.code, mappedError.message, {
      authCode: error?.code || null
    });
  }
});

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function requireDocumentId(value, message) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 160 || normalized.includes("/")) {
    throw new HttpsError("invalid-argument", message);
  }
  return normalized;
}

function normalizeDateKey(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "A valid attendance date is required.");
  }
  return normalized;
}

function normalizeLocalTime(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(normalized)) {
    throw new HttpsError("invalid-argument", "A valid local time is required.");
  }
  return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function normalizeAttendanceEventType(value) {
  if (!ATTENDANCE_EVENT_TYPES.has(value)) {
    throw new HttpsError("invalid-argument", "Unsupported attendance event type.");
  }
  return value;
}

function requireText(value, minLength, maxLength, message) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < minLength) {
    throw new HttpsError("invalid-argument", message);
  }
  return normalized.slice(0, maxLength);
}

function formatPortugalLocalDateTime(date) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: PORTUGAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function getAttendanceActionState(record) {
  const voidedEventIds = new Set(safeArray(record?.voidedEventIds));
  const punches = safeArray(record?.punches)
    .filter((punch) => ATTENDANCE_EVENT_TYPES.has(punch?.type) && typeof punch?.occurredAt === "string" && !voidedEventIds.has(punch.id))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  let isClockedIn = false;
  let isOnBreak = false;
  punches.forEach((punch) => {
    if (punch.type === "clockIn") {
      isClockedIn = true;
      isOnBreak = false;
    } else if (punch.type === "breakStart" && isClockedIn) {
      isOnBreak = true;
    } else if (punch.type === "breakEnd" && isClockedIn) {
      isOnBreak = false;
    } else if (punch.type === "clockOut" && isClockedIn) {
      isClockedIn = false;
      isOnBreak = false;
    }
  });
  if (!isClockedIn) return { status: "clocked-out", primaryAction: "clockIn", secondaryAction: null };
  if (isOnBreak) return { status: "on-break", primaryAction: "breakEnd", secondaryAction: "clockOut" };
  return { status: "working", primaryAction: "clockOut", secondaryAction: "breakStart" };
}

function createTrustedAttendanceEvent({ eventType, occurredAt, occurredAtUtc, actor, source, note = null }) {
  const capturedAt = new Date().toISOString();
  return {
    id: randomUUID(),
    type: eventType,
    occurredAt,
    occurredAtUtc,
    timeZone: PORTUGAL_TIME_ZONE,
    capturedAt,
    source,
    actorUid: actor.uid,
    actorEmail: actor.email,
    note: note || null,
    trustedServerTime: source !== "manual"
  };
}

function appendTrustedAttendanceEvent(baseRecord, { employeeId, employeeName, dateKey, event, now, correction = null }) {
  const createdAt = typeof baseRecord?.createdAt === "string" ? baseRecord.createdAt : now.toISOString();
  const retentionDate = new Date(`${dateKey}T00:00:00Z`);
  retentionDate.setUTCFullYear(retentionDate.getUTCFullYear() + ATTENDANCE_RETENTION_YEARS);
  const punches = [...safeArray(baseRecord?.punches), event]
    .sort((left, right) => String(left.occurredAt || "").localeCompare(String(right.occurredAt || "")));
  const corrections = correction
    ? [...safeArray(baseRecord?.corrections), correction]
    : safeArray(baseRecord?.corrections);
  return {
    ...(baseRecord || {}),
    employeeId,
    employeeName,
    dateKey,
    punches,
    corrections,
    workerAttestation: correction ? null : (baseRecord?.workerAttestation || null),
    attestationHistory: safeArray(baseRecord?.attestationHistory),
    review: correction
      ? { status: "needs-attention", note: correction.reason, reviewedAt: null, reviewedBy: null }
      : (baseRecord?.review || { status: null, note: null, reviewedAt: null, reviewedBy: null }),
    createdAt,
    updatedAt: now.toISOString(),
    updatedAtServer: FieldValue.serverTimestamp(),
    retainUntil: retentionDate.toISOString().slice(0, 10),
    schemaVersion: 2
  };
}

async function getEmployee(employeeId) {
  const snapshot = await firestore.collection("employees").doc(employeeId).get();
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "The colleague does not exist.");
  }
  const data = snapshot.data() || {};
  return { id: snapshot.id, name: String(data.name || "").trim().slice(0, 200), isArchived: Boolean(data.isArchived) };
}

async function getActiveEmployee(employeeId) {
  const employee = await getEmployee(employeeId);
  if (employee.isArchived) {
    throw new HttpsError("failed-precondition", "Archived colleagues cannot record new attendance.");
  }
  return employee;
}

async function requireAttendanceAccess(request, employeeId) {
  const access = await requireAuthenticatedAccess(request, "Sign in before recording attendance.");
  const roles = normalizeRoles(access.accessEntry?.roles);
  const allowedApps = normalizeAllowedApps(access.accessEntry?.allowedApps);
  const privileged = roles.some((role) => PRIVILEGED_ROLE_KEYS.has(role));
  const station = roles.includes("time-clock-station");
  const staff = allowedApps.includes("staff");
  const own = String(access.accessEntry?.linkedEmployeeId || "") === employeeId;
  if (!privileged && !staff && !station && !own) {
    throw new HttpsError("permission-denied", "You can only record your own attendance.");
  }
  return { uid: request.auth.uid, email: normalizeRawEmail(access.email), roles, privileged, staff, station, own };
}

async function requireAttendanceManager(request) {
  const access = await requireAuthenticatedAccess(request, "Sign in before correcting attendance.");
  const roles = normalizeRoles(access.accessEntry?.roles);
  const allowedApps = normalizeAllowedApps(access.accessEntry?.allowedApps);
  const privileged = roles.some((role) => PRIVILEGED_ROLE_KEYS.has(role));
  const staff = allowedApps.includes("staff");
  if (!privileged && !staff) {
    throw new HttpsError("permission-denied", "Only an authorized manager can correct attendance.");
  }
  return { uid: request.auth.uid, email: normalizeRawEmail(access.email), roles, privileged, staff, station: false, own: false };
}

async function requireAdminAccess(request) {
  const access = await requireAuthenticatedAccess(request, "Sign in before managing passwords.");
  const roles = Array.isArray(access.accessEntry?.roles) ? access.accessEntry.roles : [];
  const isAdmin = roles.some((role) => normalizeRole(role) === "admin");

  if (!isAdmin) {
    throw new HttpsError("permission-denied", "Only administrators can manage password reset links.");
  }

  return { email: access.email, roles };
}

async function requireAppAccess(request, appKey) {
  const access = await requireAuthenticatedAccess(request, "Sign in before accessing guest information.");
  const roles = normalizeRoles(access.accessEntry?.roles);
  const allowedApps = normalizeAllowedApps(access.accessEntry?.allowedApps);
  const privileged = roles.some((role) => PRIVILEGED_ROLE_KEYS.has(role));

  if (!access.accessEntry || (!privileged && !allowedApps.includes(appKey))) {
    throw new HttpsError("permission-denied", "This account does not have access to the requested application.");
  }

  return { email: access.email, roles, allowedApps, privileged };
}

async function requireAuthenticatedAccess(request, unauthenticatedMessage) {
  const email = request.auth?.token?.email;
  if (!email) {
    throw new HttpsError("unauthenticated", unauthenticatedMessage);
  }

  const accessEntry = await getAccessEntry(email);
  return { email, accessEntry };
}

async function getAccessEntry(email) {
  const db = firestore;
  for (const key of getEmailLookupKeys(email)) {
    const snapshot = await db.collection("allowedEmails").doc(key).get();
    if (snapshot.exists) {
      return snapshot.data() || {};
    }
  }
  return null;
}

function requireValidEmail(value) {
  const email = normalizeRawEmail(value);
  if (!email || !email.includes("@") || email.length > 254) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  return email;
}

function normalizeRoles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((role) => normalizeRole(role))
    .filter((role) => /^[a-z0-9][a-z0-9_-]{0,63}$/.test(role)))]
    .slice(0, 20);
}

function normalizeAllowedApps(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((app) => typeof app === "string" ? app.trim() : "")
    .filter((app) => APP_ACCESS_KEYS.has(app)))]
    .slice(0, APP_ACCESS_KEYS.size);
}

function sanitizeAccessEntry(entry, fallbackEmail) {
  const email = normalizeRawEmail(entry?.displayEmail || fallbackEmail);
  const access = {
    email,
    displayEmail: email,
    roles: normalizeRoles(entry?.roles),
    allowedApps: normalizeAllowedApps(entry?.allowedApps),
    linkedEmployeeId: entry?.linkedEmployeeId ? String(entry.linkedEmployeeId).slice(0, 160) : null,
    linkedEmployeeName: entry?.linkedEmployeeName ? String(entry.linkedEmployeeName).slice(0, 200) : null,
    linkedEmployeeEmail: normalizeRawEmail(entry?.linkedEmployeeEmail),
    linkedEmployeeArchived: Boolean(entry?.linkedEmployeeArchived)
  };
  return access;
}

async function writeAccessEntry(email, patch) {
  const [primaryKey] = getEmailLookupKeys(email);
  if (!primaryKey) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  await firestore.collection("allowedEmails").doc(primaryKey).set(patch, { merge: true });
}

async function materializeUserAccess(uid, email, accessEntry) {
  const sanitized = sanitizeAccessEntry(accessEntry, email);
  await firestore.collection("userAccess").doc(uid).set({
    ...sanitized,
    uid,
    emailCanonical: canonicalizeEmail(email),
    active: true,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

async function refreshMaterializedAccess(email) {
  const accessEntry = await getAccessEntry(email);
  if (!accessEntry) {
    await removeMaterializedAccess(email);
    return;
  }

  const canonicalEmail = canonicalizeEmail(email);
  const matching = await firestore
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  const knownUsers = new Map(matching.docs.map((document) => [document.id, document.data()?.email || email]));

  try {
    const authUser = await auth.getUserByEmail(email);
    knownUsers.set(authUser.uid, authUser.email || email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      console.warn("Could not look up Auth user while refreshing access:", error);
    }
  }

  await Promise.all([...knownUsers.entries()].map(([uid, userEmail]) => {
    return materializeUserAccess(uid, userEmail, accessEntry);
  }));
}

async function removeMaterializedAccess(email) {
  const canonicalEmail = canonicalizeEmail(email);
  if (!canonicalEmail) return;
  const snapshot = await firestore
    .collection("userAccess")
    .where("emailCanonical", "==", canonicalEmail)
    .get();
  if (snapshot.empty) return;
  const batch = firestore.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

function cleanGuestField(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeReservationDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getEmailLookupKeys(value) {
  const raw = normalizeRawEmail(value);
  const canonical = canonicalizeEmail(value);
  return [...new Set([canonical, raw].filter(Boolean))];
}

function normalizeRawEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : null;
}

function canonicalizeEmail(value) {
  const normalized = normalizeRawEmail(value);
  if (!normalized || !normalized.includes("@")) {
    return normalized;
  }

  const [localPart, domainPart] = normalized.split("@");
  if (!localPart || !domainPart) {
    return normalized;
  }

  if (domainPart === "gmail.com" || domainPart === "googlemail.com") {
    const plusIndex = localPart.indexOf("+");
    const trimmedLocal = plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
    return `${trimmedLocal.replace(/\./g, "")}@gmail.com`;
  }

  return normalized;
}

function normalizeRole(role) {
  return typeof role === "string" ? role.trim().toLowerCase() : "";
}

function getPasswordResetLinkError(error) {
  const code = error?.code || "";
  const knownFailures = new Set([
    "auth/invalid-email",
    "auth/invalid-continue-uri",
    "auth/unauthorized-continue-uri",
    "auth/missing-continue-uri",
    "auth/invalid-dynamic-link-domain"
  ]);

  if (knownFailures.has(code)) {
    return {
      code: "failed-precondition",
      message: `Firebase Auth rejected the password reset link settings (${code}).`
    };
  }

  return {
    code: "internal",
    message: "Firebase Auth could not create a password reset link. Check the function logs for the exact Admin SDK error."
  };
}

async function writeAudit(entry) {
  const collectionName = "securityAudit";
  try {
    await firestore.collection(collectionName).add({
      ...entry,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.warn(`Failed to write ${collectionName} entry:`, error);
  }
}
