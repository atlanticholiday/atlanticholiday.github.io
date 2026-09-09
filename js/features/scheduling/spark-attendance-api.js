import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    inMemoryPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    collection,
    deleteField,
    doc,
    getDoc,
    getFirestore,
    runTransaction,
    serverTimestamp,
    updateDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { Config } from '../../core/config.js';
import { canonicalizeEmail } from '../../shared/email.js';
import { getAttendanceActionState } from './attendance-records.js';

const PORTUGAL_TIME_ZONE = 'Europe/Lisbon';
const ATTENDANCE_RETENTION_YEARS = 5;
const CREDENTIAL_APP_NAME = 'attendance-pin-credentials';

function safeArray(value) {
    return Array.isArray(value) ? value : [];
}

function createId() {
    return globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatPortugalLocalDateTime(date = new Date()) {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: PORTUGAL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}`;
}

function addRetentionDate(dateKey) {
    const retentionDate = new Date(`${dateKey}T00:00:00Z`);
    retentionDate.setUTCFullYear(retentionDate.getUTCFullYear() + ATTENDANCE_RETENTION_YEARS);
    return retentionDate.toISOString().slice(0, 10);
}

function createPunchRecord(baseRecord, { employee, dateKey, event, now }) {
    return {
        ...(baseRecord || {}),
        employeeId: employee.id,
        employeeName: baseRecord?.employeeName || String(employee.name || '').trim().slice(0, 200),
        dateKey,
        punches: [...safeArray(baseRecord?.punches), event]
            .sort((left, right) => Number(left.occurredAtEpochMs || Date.parse(left.occurredAtUtc || left.occurredAt || 0))
                - Number(right.occurredAtEpochMs || Date.parse(right.occurredAtUtc || right.occurredAt || 0))),
        corrections: safeArray(baseRecord?.corrections),
        voidedEventIds: safeArray(baseRecord?.voidedEventIds),
        workerAttestation: baseRecord?.workerAttestation || null,
        attestationHistory: safeArray(baseRecord?.attestationHistory),
        reviewHistory: safeArray(baseRecord?.reviewHistory),
        review: baseRecord?.review || { status: null, note: null, reviewedAt: null, reviewedBy: null },
        createdAt: typeof baseRecord?.createdAt === 'string' ? baseRecord.createdAt : now.toISOString(),
        updatedAt: now.toISOString(),
        updatedAtServer: serverTimestamp(),
        retainUntil: baseRecord?.retainUntil || addRetentionDate(dateKey),
        schemaVersion: 3
    };
}

function actorFromUser(user) {
    if (!user?.uid || !user?.email) {
        const error = new Error('attendance-auth-required');
        error.code = 'attendance/auth-required';
        throw error;
    }
    return {
        uid: user.uid,
        email: canonicalizeEmail(user.email)
    };
}

function requireText(value, minLength, maxLength, code) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized.length < minLength || normalized.length > maxLength) {
        const error = new Error(code);
        error.code = `attendance/${code}`;
        throw error;
    }
    return normalized;
}

function requireDateKey(value) {
    const normalized = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        const error = new Error('invalid-date');
        error.code = 'attendance/invalid-date';
        throw error;
    }
    return normalized;
}

function requireAttendanceEventType(value) {
    if (!['clockIn', 'clockOut', 'breakStart', 'breakEnd'].includes(value)) {
        const error = new Error('invalid-event-type');
        error.code = 'attendance/invalid-event-type';
        throw error;
    }
    return value;
}

function requireLocalTime(value) {
    const normalized = String(value || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(normalized)) {
        const error = new Error('invalid-local-time');
        error.code = 'attendance/invalid-local-time';
        throw error;
    }
    return normalized.length === 5 ? `${normalized}:00` : normalized;
}

function canonicalEvent(transaction, targetDb, actor, input) {
    const eventRef = doc(collection(targetDb, 'attendance_events'));
    transaction.set(eventRef, {
        id: eventRef.id,
        recordId: input.recordId,
        employeeId: input.employeeId,
        dateKey: input.dateKey,
        category: input.category,
        action: input.action,
        eventType: input.eventType || null,
        targetEventId: input.targetEventId || null,
        reason: input.reason || null,
        source: input.source,
        actorUid: actor.uid,
        actorEmail: actor.email,
        occurredAt: input.occurredAt || null,
        occurredAtEpochMs: Number.isInteger(input.occurredAtEpochMs) ? input.occurredAtEpochMs : null,
        serverRecordedAt: serverTimestamp(),
        schemaVersion: 1
    });
    return eventRef.id;
}

function createAttendanceEvent({ type, occurredAt, occurredAtUtc = null, now, actor, source, note = null, canonicalEventId }) {
    return {
        id: createId(),
        type,
        occurredAt,
        occurredAtUtc,
        occurredAtEpochMs: source === 'manual' ? null : now.getTime(),
        timeZone: PORTUGAL_TIME_ZONE,
        capturedAt: now.toISOString(),
        source,
        actorUid: actor.uid,
        actorEmail: actor.email,
        note,
        trustedServerTime: source !== 'manual',
        canonicalEventId
    };
}

function createCorrection({ type, eventId, reason, actor, now, canonicalEventId }) {
    return {
        id: createId(),
        type,
        eventId,
        reason,
        actorUid: actor.uid,
        actorEmail: actor.email,
        recordedAt: now.toISOString(),
        status: 'needs-attention',
        canonicalEventId
    };
}

function buildRecordWithCorrection(baseRecord, { employee, dateKey, event, correction, now, canonicalEventId }) {
    const next = createPunchRecord(baseRecord, { employee, dateKey, event, now });
    return {
        ...next,
        corrections: [...safeArray(baseRecord?.corrections), correction],
        workerAttestation: null,
        review: { status: 'needs-attention', note: correction.reason, reviewedAt: null, reviewedBy: null },
        reviewHistory: safeArray(baseRecord?.reviewHistory),
        lastCanonicalEventId: canonicalEventId
    };
}

function resolveAttendanceTarget({ todayRef, previousRef, todayKey, previousKey, todayRecord, previousRecord, eventType }) {
    const todayState = getAttendanceActionState(todayRecord);
    const previousState = getAttendanceActionState(previousRecord);
    const usePrevious = todayState.status === 'clocked-out' && previousState.status !== 'clocked-out';
    const target = usePrevious
        ? { targetRef: previousRef, targetDateKey: previousKey, baseRecord: previousRecord, actionState: previousState }
        : { targetRef: todayRef, targetDateKey: todayKey, baseRecord: todayRecord, actionState: todayState };
    const allowedActions = [target.actionState.primaryAction, target.actionState.secondaryAction].filter(Boolean);
    if (!allowedActions.includes(eventType)) {
        const error = new Error('attendance-action-unavailable');
        error.code = 'attendance/action-unavailable';
        throw error;
    }
    return target;
}

async function recordPunchWithIdentity(db, user, employee, eventType, source) {
    requireAttendanceEventType(eventType);
    const actor = actorFromUser(user);
    const now = new Date();
    const occurredAt = formatPortugalLocalDateTime(now);
    const todayKey = occurredAt.slice(0, 10);
    const previousKey = formatPortugalLocalDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)).slice(0, 10);
    const todayRef = doc(db, 'attendance_records', `${employee.id}_${todayKey}`);
    const previousRef = doc(db, 'attendance_records', `${employee.id}_${previousKey}`);
    const directoryRef = doc(db, 'attendance_station_directory', employee.id);
    const result = await runTransaction(db, async (transaction) => {
        const [todaySnapshot, previousSnapshot] = await Promise.all([
            transaction.get(todayRef),
            transaction.get(previousRef)
        ]);
        const todayRecord = todaySnapshot.exists() ? todaySnapshot.data() : null;
        const previousRecord = previousSnapshot.exists() ? previousSnapshot.data() : null;
        const { targetRef, targetDateKey, baseRecord } = resolveAttendanceTarget({
            todayRef, previousRef, todayKey, previousKey, todayRecord, previousRecord, eventType
        });
        const pendingEventId = createId();
        const canonicalEventId = canonicalEvent(transaction, db, actor, {
            recordId: targetRef.id, employeeId: employee.id, dateKey: targetDateKey,
            category: 'attendance', action: 'punch', eventType, targetEventId: pendingEventId,
            source, occurredAt, occurredAtEpochMs: now.getTime()
        });
        const event = createAttendanceEvent({
            type: eventType,
            occurredAt,
            occurredAtUtc: now.toISOString(),
            now,
            actor,
            source,
            canonicalEventId
        });
        event.id = pendingEventId;
        const nextRecord = {
            ...createPunchRecord(baseRecord, {
            employee,
            dateKey: targetDateKey,
            event,
            now
            }),
            lastCanonicalEventId: canonicalEventId
        };
        transaction.set(targetRef, nextRecord);
        return { recordId: targetRef.id, event, record: nextRecord, status: getAttendanceActionState(nextRecord).status };
    });
    if (employee.attendancePinConfigured) {
        await updateDoc(directoryRef, {
            status: result.status,
            lastEventType: eventType,
            lastOccurredAtEpochMs: now.getTime(),
            updatedAtServer: serverTimestamp()
        }).catch(() => {});
    }
    return result;
}

function deriveCredentialPassword(pin) {
    return `Ponto!${String(pin || '')}!AtlanticHoliday#2026`;
}

function requireValidPin(pin) {
    const normalizedPin = String(pin || '');
    if (!/^\d{6,10}$/.test(normalizedPin)) {
        const error = new Error('attendance-invalid-pin-format');
        error.code = 'attendance/invalid-pin-format';
        throw error;
    }
    return normalizedPin;
}

export async function deriveAttendanceCredentialEmail(pin) {
    const normalizedPin = requireValidPin(pin);
    const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`atlantic-holiday-attendance:${normalizedPin}`)
    );
    const hex = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
    return `clock-${hex.slice(0, 40)}@my-work-schedule-4dc10.firebaseapp.com`;
}

export function createSparkAttendanceApi({ db, auth }) {
    const credentialApp = initializeApp(Config.firebaseConfig, CREDENTIAL_APP_NAME);
    const credentialAuth = getAuth(credentialApp);
    const credentialDb = getFirestore(credentialApp);
    const persistenceReady = setPersistence(credentialAuth, inMemoryPersistence);

    function clearPreviousCredential(batch, employee, replacementEmail = null) {
        const previousEmail = canonicalizeEmail(employee?.attendancePinLoginEmail || '');
        if (!previousEmail || previousEmail === canonicalizeEmail(replacementEmail || '')) return;
        batch.delete(doc(db, 'attendance_credentials', previousEmail));
    }

    return {
        async identifyStationEmployee({ pin }) {
            const normalizedPin = requireValidPin(pin);
            const credentialEmail = await deriveAttendanceCredentialEmail(normalizedPin);
            await persistenceReady;
            try {
                await signInWithEmailAndPassword(
                    credentialAuth,
                    credentialEmail,
                    deriveCredentialPassword(normalizedPin)
                );
                const credentialSnapshot = await getDoc(doc(credentialDb, 'attendance_credentials', credentialEmail));
                if (!credentialSnapshot.exists() || credentialSnapshot.data()?.active !== true) {
                    const error = new Error('attendance-invalid-pin');
                    error.code = 'attendance/invalid-pin';
                    throw error;
                }
                const credentialData = credentialSnapshot.data();
                const employeeId = String(credentialData.employeeId || '');
                const directorySnapshot = await getDoc(doc(credentialDb, 'attendance_station_directory', employeeId));
                if (!directorySnapshot.exists() || directorySnapshot.data()?.isArchived === true) {
                    const error = new Error('attendance-employee-not-found');
                    error.code = 'attendance/employee-not-found';
                    throw error;
                }
                const directoryData = directorySnapshot.data();
                return {
                    employee: {
                        id: employeeId,
                        employeeId,
                        name: String(directoryData.name || credentialData.employeeName || '').slice(0, 200),
                        attendancePinConfigured: true,
                        attendancePinLoginEmail: credentialEmail,
                        isArchived: false,
                        status: directoryData.status || 'clocked-out',
                        lastEventType: directoryData.lastEventType || null,
                        lastOccurredAtEpochMs: directoryData.lastOccurredAtEpochMs || null
                    }
                };
            } finally {
                await signOut(credentialAuth).catch(() => {});
            }
        },

        async recordPunch({ employee, employeeId, eventType, source = 'web', pin = null }) {
            if (!employee?.id || employee.id !== employeeId) {
                throw new Error('attendance-employee-not-found');
            }

            if (source !== 'station') {
                const user = auth.currentUser;
                if (!user) throw new Error('attendance-auth-required');
                return recordPunchWithIdentity(db, user, employee, eventType, 'web');
            }

            const credentialEmail = canonicalizeEmail(employee.attendancePinLoginEmail || '');
            if (!credentialEmail || !employee.attendancePinConfigured) {
                const error = new Error('attendance-pin-not-configured');
                error.code = 'attendance/pin-not-configured';
                throw error;
            }

            const normalizedPin = requireValidPin(pin);
            await persistenceReady;
            try {
                const credential = await signInWithEmailAndPassword(
                    credentialAuth,
                    credentialEmail,
                    deriveCredentialPassword(normalizedPin)
                );
                return await recordPunchWithIdentity(credentialDb, credential.user, employee, eventType, 'station');
            } finally {
                await signOut(credentialAuth).catch(() => {});
            }
        },

        async addCorrection({ employee, employeeId, dateKey, eventType, localTime, reason }) {
            if (!employee?.id || employee.id !== employeeId) throw new Error('attendance-employee-not-found');
            const actor = actorFromUser(auth.currentUser);
            const normalizedDateKey = requireDateKey(dateKey);
            const normalizedTime = requireLocalTime(localTime);
            const normalizedType = requireAttendanceEventType(eventType);
            const normalizedReason = requireText(reason, 8, 500, 'invalid-reason');
            const now = new Date();
            const recordRef = doc(db, 'attendance_records', `${employeeId}_${normalizedDateKey}`);

            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                const baseRecord = snapshot.exists() ? snapshot.data() : null;
                const eventId = createId();
                const occurredAt = `${normalizedDateKey}T${normalizedTime}`;
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id,
                    employeeId,
                    dateKey: normalizedDateKey,
                    category: 'attendance',
                    action: 'manual-punch',
                    eventType: normalizedType,
                    targetEventId: eventId,
                    reason: normalizedReason,
                    source: 'manual',
                    occurredAt
                });
                const event = createAttendanceEvent({
                    type: normalizedType,
                    occurredAt,
                    now,
                    actor,
                    source: 'manual',
                    note: normalizedReason,
                    canonicalEventId
                });
                event.id = eventId;
                const correction = createCorrection({
                    type: 'event-added',
                    eventId,
                    reason: normalizedReason,
                    actor,
                    now,
                    canonicalEventId
                });
                const nextRecord = buildRecordWithCorrection(baseRecord, {
                    employee,
                    dateKey: normalizedDateKey,
                    event,
                    correction,
                    now,
                    canonicalEventId
                });
                transaction.set(recordRef, nextRecord);
                return { recordId: recordRef.id, event, correction };
            });
        },

        async voidEvent({ employeeId, dateKey, eventId, reason }) {
            const actor = actorFromUser(auth.currentUser);
            const normalizedDateKey = requireDateKey(dateKey);
            const normalizedReason = requireText(reason, 8, 500, 'invalid-reason');
            const recordRef = doc(db, 'attendance_records', `${employeeId}_${normalizedDateKey}`);
            const now = new Date();

            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('attendance-record-not-found');
                const record = snapshot.data() || {};
                if (!safeArray(record.punches).some((event) => event.id === eventId)) throw new Error('attendance-event-not-found');
                if (safeArray(record.voidedEventIds).includes(eventId)) throw new Error('attendance-event-already-voided');
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id,
                    employeeId,
                    dateKey: normalizedDateKey,
                    category: 'attendance',
                    action: 'event-voided',
                    targetEventId: eventId,
                    reason: normalizedReason,
                    source: 'manual'
                });
                const correction = createCorrection({
                    type: 'event-voided', eventId, reason: normalizedReason, actor, now, canonicalEventId
                });
                transaction.update(recordRef, {
                    voidedEventIds: [...safeArray(record.voidedEventIds), eventId],
                    corrections: [...safeArray(record.corrections), correction],
                    workerAttestation: null,
                    review: { status: 'needs-attention', note: normalizedReason, reviewedAt: null, reviewedBy: null },
                    updatedAt: now.toISOString(),
                    updatedAtServer: serverTimestamp(),
                    lastCanonicalEventId: canonicalEventId
                });
                return { ok: true, correctionId: correction.id };
            });
        },

        async reviewRecord({ employeeId, dateKey, status = 'reviewed', note = 'Revisto pelo responsável.' }) {
            const actor = actorFromUser(auth.currentUser);
            const normalizedDateKey = requireDateKey(dateKey);
            const normalizedStatus = ['needs-attention', 'reviewed'].includes(status) ? status : 'reviewed';
            const normalizedNote = requireText(note || 'Revisto pelo responsável.', 3, 500, 'invalid-review-note');
            const recordRef = doc(db, 'attendance_records', `${employeeId}_${normalizedDateKey}`);
            const now = new Date();

            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('attendance-record-not-found');
                const record = snapshot.data() || {};
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id,
                    employeeId,
                    dateKey: normalizedDateKey,
                    category: 'attendance',
                    action: 'manager-reviewed',
                    reason: normalizedNote,
                    source: 'manual'
                });
                const reviewEntry = {
                    id: createId(), status: normalizedStatus, note: normalizedNote,
                    reviewedAt: now.toISOString(), reviewedByUid: actor.uid,
                    reviewedBy: actor.email, canonicalEventId
                };
                transaction.update(recordRef, {
                    review: { status: normalizedStatus, note: normalizedNote, reviewedAt: reviewEntry.reviewedAt, reviewedBy: actor.email },
                    reviewHistory: [...safeArray(record.reviewHistory), reviewEntry],
                    updatedAt: now.toISOString(),
                    updatedAtServer: serverTimestamp(),
                    lastCanonicalEventId: canonicalEventId
                });
                return { ok: true };
            });
        },

        async attestRecord({ employeeId, dateKey }) {
            const actor = actorFromUser(auth.currentUser);
            const normalizedDateKey = requireDateKey(dateKey);
            const recordRef = doc(db, 'attendance_records', `${employeeId}_${normalizedDateKey}`);
            const now = new Date();

            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('attendance-record-not-found');
                const record = snapshot.data() || {};
                const effectivePunches = safeArray(record.punches).filter((event) => !safeArray(record.voidedEventIds).includes(event.id));
                if (!effectivePunches.length || getAttendanceActionState(record).status !== 'clocked-out') {
                    throw new Error('attendance-period-not-finished');
                }
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id,
                    employeeId,
                    dateKey: normalizedDateKey,
                    category: 'attendance',
                    action: 'worker-attested',
                    source: 'web'
                });
                const attestation = {
                    id: createId(), status: 'attested', workerUid: actor.uid,
                    workerEmail: actor.email, attestedAt: now.toISOString(), canonicalEventId
                };
                transaction.update(recordRef, {
                    workerAttestation: attestation,
                    attestationHistory: [...safeArray(record.attestationHistory), attestation],
                    updatedAt: now.toISOString(),
                    updatedAtServer: serverTimestamp(),
                    lastCanonicalEventId: canonicalEventId
                });
                return { ok: true };
            });
        },

        async authorizeOvertime({ employee, employeeId, dateKey, reason, legalBasis, workplace, compensationChoice }) {
            if (!employee?.id || employee.id !== employeeId) throw new Error('attendance-employee-not-found');
            const actor = actorFromUser(auth.currentUser);
            const normalizedDateKey = requireDateKey(dateKey);
            const normalizedReason = requireText(reason, 8, 500, 'invalid-reason');
            const normalizedWorkplace = requireText(workplace || 'Local de trabalho habitual', 2, 300, 'invalid-workplace');
            const normalizedBasis = ['temporary-increase', 'force-majeure', 'prevent-serious-harm'].includes(legalBasis)
                ? legalBasis : 'temporary-increase';
            const normalizedCompensation = compensationChoice === 'rest' ? 'rest' : 'payment';
            const now = new Date();
            if (normalizedDateKey < formatPortugalLocalDateTime(now).slice(0, 10)) throw new Error('overtime-cannot-be-backdated');
            const recordRef = doc(collection(db, 'overtime_records'));
            const batch = writeBatch(db);
            const canonicalEventId = canonicalEvent(batch, db, actor, {
                recordId: recordRef.id, employeeId, dateKey: normalizedDateKey,
                category: 'overtime', action: 'authorized', reason: normalizedReason, source: 'manual'
            });
            const authorization = {
                id: createId(), event: 'authorized', actorUid: actor.uid, actorEmail: actor.email,
                recordedAt: now.toISOString(), canonicalEventId
            };
            batch.set(recordRef, {
                employeeId, employeeName: String(employee.name || '').trim().slice(0, 200), dateKey: normalizedDateKey,
                reason: normalizedReason, legalBasis: normalizedBasis, workplace: normalizedWorkplace,
                compensationChoice: normalizedCompensation, status: 'authorized', authorizedAt: now.toISOString(),
                authorizedByUid: actor.uid, authorizedBy: actor.email, startEvent: null, endEvent: null,
                workerValidation: null, managerReview: null, compensatoryRest: null, auditTrail: [authorization],
                createdAt: now.toISOString(), updatedAt: now.toISOString(), updatedAtServer: serverTimestamp(),
                retainUntil: addRetentionDate(normalizedDateKey), schemaVersion: 2, lastCanonicalEventId: canonicalEventId
            });
            await batch.commit();
            return { id: recordRef.id };
        },

        async recordOvertimePunch({ overtimeRecordId, action, linkedEmployeeId = null }) {
            const actor = actorFromUser(auth.currentUser);
            if (!['start', 'end'].includes(action)) throw new Error('invalid-overtime-action');
            const recordRef = doc(db, 'overtime_records', String(overtimeRecordId || ''));
            const now = new Date();
            const occurredAt = formatPortugalLocalDateTime(now);

            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('overtime-record-not-found');
                const record = snapshot.data() || {};
                if (action === 'start' && record.dateKey !== occurredAt.slice(0, 10)) throw new Error('overtime-wrong-date');
                if (action === 'start' && (record.status !== 'authorized' || record.startEvent)) throw new Error('overtime-action-unavailable');
                if (action === 'end' && (!record.startEvent || record.endEvent)) throw new Error('overtime-action-unavailable');
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id, employeeId: record.employeeId, dateKey: record.dateKey,
                    category: 'overtime', action: action === 'start' ? 'started' : 'ended',
                    eventType: action === 'start' ? 'overtimeStart' : 'overtimeEnd', source: 'web',
                    occurredAt, occurredAtEpochMs: now.getTime()
                });
                const event = createAttendanceEvent({
                    type: action === 'start' ? 'overtimeStart' : 'overtimeEnd', occurredAt,
                    occurredAtUtc: now.toISOString(), now, actor, source: 'web', canonicalEventId
                });
                const actorOwnsRecord = linkedEmployeeId === record.employeeId;
                const nextStatus = action === 'start'
                    ? 'in-progress'
                    : (actorOwnsRecord ? 'worker-validated' : 'awaiting-worker-validation');
                const validation = action === 'end' && actorOwnsRecord ? {
                    status: 'validated', workerUid: actor.uid, workerEmail: actor.email,
                    validatedAt: now.toISOString(), canonicalEventId
                } : (record.workerValidation || null);
                transaction.update(recordRef, {
                    [action === 'start' ? 'startEvent' : 'endEvent']: event,
                    status: nextStatus,
                    workerValidation: validation,
                    auditTrail: [...safeArray(record.auditTrail), {
                        id: createId(), event: action === 'start' ? 'started' : 'ended', actorUid: actor.uid,
                        actorEmail: actor.email, recordedAt: now.toISOString(), canonicalEventId
                    }],
                    updatedAt: now.toISOString(), updatedAtServer: serverTimestamp(), lastCanonicalEventId: canonicalEventId
                });
                return { ok: true, event };
            });
        },

        async validateOvertimeRecord({ overtimeRecordId }) {
            const actor = actorFromUser(auth.currentUser);
            const recordRef = doc(db, 'overtime_records', String(overtimeRecordId || ''));
            const now = new Date();
            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('overtime-record-not-found');
                const record = snapshot.data() || {};
                if (!record.endEvent) throw new Error('overtime-period-not-finished');
                if (record.workerValidation?.status === 'validated') throw new Error('overtime-already-validated');
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id, employeeId: record.employeeId, dateKey: record.dateKey,
                    category: 'overtime', action: 'worker-validated', source: 'web'
                });
                const validation = {
                    status: 'validated', workerUid: actor.uid, workerEmail: actor.email,
                    validatedAt: now.toISOString(), canonicalEventId
                };
                transaction.update(recordRef, {
                    workerValidation: validation, status: 'worker-validated',
                    auditTrail: [...safeArray(record.auditTrail), {
                        id: createId(), event: 'worker-validated', actorUid: actor.uid,
                        actorEmail: actor.email, recordedAt: now.toISOString(), canonicalEventId
                    }],
                    updatedAt: now.toISOString(), updatedAtServer: serverTimestamp(), lastCanonicalEventId: canonicalEventId
                });
                return { ok: true };
            });
        },

        async reviewOvertimeRecord({ overtimeRecordId, note, restDate = null }) {
            const actor = actorFromUser(auth.currentUser);
            const normalizedNote = requireText(note || 'Revisto pelo responsável.', 3, 500, 'invalid-review-note');
            const normalizedRestDate = restDate ? requireDateKey(restDate) : null;
            const recordRef = doc(db, 'overtime_records', String(overtimeRecordId || ''));
            const now = new Date();
            return runTransaction(db, async (transaction) => {
                const snapshot = await transaction.get(recordRef);
                if (!snapshot.exists()) throw new Error('overtime-record-not-found');
                const record = snapshot.data() || {};
                if (!record.endEvent) throw new Error('overtime-period-not-finished');
                if (record.workerValidation?.status !== 'validated') throw new Error('overtime-worker-validation-required');
                if (record.compensationChoice === 'rest' && !normalizedRestDate) throw new Error('overtime-rest-date-required');
                const canonicalEventId = canonicalEvent(transaction, db, actor, {
                    recordId: recordRef.id, employeeId: record.employeeId, dateKey: record.dateKey,
                    category: 'overtime', action: 'manager-reviewed', reason: normalizedNote, source: 'manual'
                });
                transaction.update(recordRef, {
                    status: 'reviewed',
                    managerReview: { note: normalizedNote, reviewedAt: now.toISOString(), reviewedByUid: actor.uid, reviewedBy: actor.email, canonicalEventId },
                    compensatoryRest: normalizedRestDate ? { dateKey: normalizedRestDate, recordedAt: now.toISOString(), recordedBy: actor.email } : null,
                    auditTrail: [...safeArray(record.auditTrail), {
                        id: createId(), event: 'manager-reviewed', actorUid: actor.uid, actorEmail: actor.email,
                        recordedAt: now.toISOString(), note: normalizedNote, canonicalEventId
                    }],
                    updatedAt: now.toISOString(), updatedAtServer: serverTimestamp(), lastCanonicalEventId: canonicalEventId
                });
                return { ok: true };
            });
        },

        async setPin({ employee, employeeId, pin }) {
            if (!employee?.id || employee.id !== employeeId) {
                throw new Error('attendance-employee-not-found');
            }
            const normalizedPin = requireValidPin(pin);
            await persistenceReady;
            const credentialEmail = await deriveAttendanceCredentialEmail(normalizedPin);
            let credential = null;
            let createdCredential = false;
            try {
                if (canonicalizeEmail(employee.attendancePinLoginEmail || '') === credentialEmail) {
                    credential = await signInWithEmailAndPassword(
                        credentialAuth,
                        credentialEmail,
                        deriveCredentialPassword(normalizedPin)
                    );
                } else {
                    credential = await createUserWithEmailAndPassword(
                        credentialAuth,
                        credentialEmail,
                        deriveCredentialPassword(normalizedPin)
                    );
                    createdCredential = true;
                }
                const batch = writeBatch(db);
                clearPreviousCredential(batch, employee, credentialEmail);
                batch.set(doc(db, 'attendance_credentials', credentialEmail), {
                    email: credentialEmail,
                    employeeId: employee.id,
                    employeeName: String(employee.name || '').slice(0, 200),
                    active: true,
                    createdAt: serverTimestamp()
                });
                batch.set(doc(db, 'employees', employee.id), {
                    attendancePinConfigured: true,
                    attendancePinLoginEmail: credentialEmail,
                    attendancePinUpdatedAt: new Date().toISOString()
                }, { merge: true });
                batch.set(doc(db, 'attendance_station_directory', employee.id), {
                    employeeId: employee.id,
                    name: String(employee.name || '').trim().slice(0, 200),
                    attendancePinConfigured: true,
                    attendancePinLoginEmail: credentialEmail,
                    isArchived: false,
                    status: 'clocked-out',
                    lastEventType: null,
                    lastOccurredAtEpochMs: null,
                    updatedAtServer: serverTimestamp()
                }, { merge: true });
                await batch.commit();
                return { employeeId, configured: true };
            } catch (error) {
                if (createdCredential && credential?.user) await deleteUser(credential.user).catch(() => {});
                throw error;
            } finally {
                await signOut(credentialAuth).catch(() => {});
            }
        },

        async removePin({ employee, employeeId }) {
            if (!employee?.id || employee.id !== employeeId) {
                throw new Error('attendance-employee-not-found');
            }
            const batch = writeBatch(db);
            clearPreviousCredential(batch, employee);
            batch.set(doc(db, 'employees', employee.id), {
                attendancePinConfigured: false,
                attendancePinLoginEmail: deleteField(),
                attendancePinUpdatedAt: new Date().toISOString()
            }, { merge: true });
            batch.delete(doc(db, 'attendance_station_directory', employee.id));
            await batch.commit();
            return { employeeId, configured: false };
        }
    };
}
