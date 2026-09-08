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
    deleteField,
    doc,
    getFirestore,
    runTransaction,
    serverTimestamp,
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
        review: baseRecord?.review || { status: null, note: null, reviewedAt: null, reviewedBy: null },
        createdAt: typeof baseRecord?.createdAt === 'string' ? baseRecord.createdAt : now.toISOString(),
        updatedAt: now.toISOString(),
        updatedAtServer: serverTimestamp(),
        retainUntil: baseRecord?.retainUntil || addRetentionDate(dateKey),
        schemaVersion: 3
    };
}

async function recordPunchWithIdentity(db, user, employee, eventType, source) {
    const now = new Date();
    const occurredAt = formatPortugalLocalDateTime(now);
    const todayKey = occurredAt.slice(0, 10);
    const previousKey = formatPortugalLocalDateTime(new Date(now.getTime() - 24 * 60 * 60 * 1000)).slice(0, 10);
    const todayRef = doc(db, 'attendance_records', `${employee.id}_${todayKey}`);
    const previousRef = doc(db, 'attendance_records', `${employee.id}_${previousKey}`);

    return runTransaction(db, async (transaction) => {
        const [todaySnapshot, previousSnapshot] = await Promise.all([
            transaction.get(todayRef),
            transaction.get(previousRef)
        ]);
        const todayRecord = todaySnapshot.exists() ? todaySnapshot.data() : null;
        const previousRecord = previousSnapshot.exists() ? previousSnapshot.data() : null;
        const todayState = getAttendanceActionState(todayRecord);
        const previousState = getAttendanceActionState(previousRecord);

        let targetRef = todayRef;
        let targetDateKey = todayKey;
        let baseRecord = todayRecord;
        let actionState = todayState;
        if (todayState.status === 'clocked-out' && previousState.status !== 'clocked-out') {
            targetRef = previousRef;
            targetDateKey = previousKey;
            baseRecord = previousRecord;
            actionState = previousState;
        }

        const allowedActions = [actionState.primaryAction, actionState.secondaryAction].filter(Boolean);
        if (!allowedActions.includes(eventType)) {
            const error = new Error('attendance-action-unavailable');
            error.code = 'attendance/action-unavailable';
            throw error;
        }

        const event = {
            id: createId(),
            type: eventType,
            occurredAt,
            occurredAtUtc: now.toISOString(),
            occurredAtEpochMs: now.getTime(),
            timeZone: PORTUGAL_TIME_ZONE,
            capturedAt: now.toISOString(),
            source,
            actorUid: user.uid,
            actorEmail: String(user.email || '').toLowerCase(),
            note: null,
            trustedServerTime: true
        };
        transaction.set(targetRef, createPunchRecord(baseRecord, {
            employee,
            dateKey: targetDateKey,
            event,
            now
        }));
        return { recordId: targetRef.id, event };
    });
}

function createCredentialEmail() {
    return `clock-${createId().replaceAll('-', '')}@my-work-schedule-4dc10.firebaseapp.com`.toLowerCase();
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

export function createSparkAttendanceApi({ db, auth }) {
    const credentialApp = initializeApp(Config.firebaseConfig, CREDENTIAL_APP_NAME);
    const credentialAuth = getAuth(credentialApp);
    const credentialDb = getFirestore(credentialApp);
    const persistenceReady = setPersistence(credentialAuth, inMemoryPersistence);

    function clearPreviousCredential(batch, employee) {
        const previousEmail = canonicalizeEmail(employee?.attendancePinLoginEmail || '');
        if (!previousEmail) return;
        batch.delete(doc(db, 'attendance_credentials', previousEmail));
    }

    return {
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

        async setPin({ employee, employeeId, pin }) {
            if (!employee?.id || employee.id !== employeeId) {
                throw new Error('attendance-employee-not-found');
            }
            const normalizedPin = requireValidPin(pin);
            await persistenceReady;
            const credentialEmail = createCredentialEmail();
            let credential = null;
            try {
                credential = await createUserWithEmailAndPassword(
                    credentialAuth,
                    credentialEmail,
                    deriveCredentialPassword(normalizedPin)
                );
                const batch = writeBatch(db);
                clearPreviousCredential(batch, employee);
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
                await batch.commit();
                return { employeeId, configured: true };
            } catch (error) {
                if (credential?.user) await deleteUser(credential.user).catch(() => {});
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
            await batch.commit();
            return { employeeId, configured: false };
        }
    };
}
