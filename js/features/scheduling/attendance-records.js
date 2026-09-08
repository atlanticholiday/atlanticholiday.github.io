const VALID_EVENT_TYPES = new Set(['clockIn', 'clockOut', 'breakStart', 'breakEnd']);
const VALID_REVIEW_STATUSES = new Set(['needs-attention', 'reviewed']);
const VALID_EVENT_SOURCES = new Set(['web', 'station', 'manual']);

function pad(value) {
    return String(value).padStart(2, '0');
}

function normalizeOptionalText(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized || null;
}

function normalizeLocalDateTime(value) {
    if (typeof value !== 'string') {
        throw new Error('Attendance event time is required');
    }

    const normalized = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
        throw new Error('Attendance event time must use local YYYY-MM-DDTHH:MM[:SS] format');
    }

    return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function normalizeReviewStatus(status) {
    if (!status) {
        return null;
    }

    return VALID_REVIEW_STATUSES.has(status) ? status : null;
}

function formatPortugalEpoch(epochMs) {
    const date = new Date(epochMs);
    if (!Number.isFinite(date.getTime())) return null;
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Lisbon',
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

function createEventId(eventType, occurredAt) {
    return `${eventType}-${occurredAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function toMinutesBetween(startDateTime, endDateTime) {
    const startValue = typeof startDateTime === 'object'
        ? (startDateTime?.occurredAtUtc || startDateTime?.occurredAt)
        : startDateTime;
    const endValue = typeof endDateTime === 'object'
        ? (endDateTime?.occurredAtUtc || endDateTime?.occurredAt)
        : endDateTime;
    const start = new Date(startValue);
    const end = new Date(endValue);
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatLocalDateTime(date = new Date()) {
    return [
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    ].join('T');
}

export function formatTimeLabel(localDateTime) {
    if (!localDateTime) return '--:--';
    return normalizeLocalDateTime(localDateTime).slice(11, 16);
}

export function createAttendanceRecord({ employeeId, employeeName = '', dateKey, createdAt = new Date().toISOString() }) {
    return {
        employeeId,
        employeeName: typeof employeeName === 'string' ? employeeName.trim() : '',
        dateKey,
        punches: [],
        voidedEventIds: [],
        corrections: [],
        review: {
            status: null,
            note: null,
            reviewedAt: null,
            reviewedBy: null
        },
        createdAt,
        updatedAt: createdAt
    };
}

export function normalizeAttendanceRecord(record = {}) {
    const safeRecord = record && typeof record === 'object' ? record : {};
    const punches = Array.isArray(safeRecord.punches)
        ? safeRecord.punches
            .filter((punch) => VALID_EVENT_TYPES.has(punch?.type) && typeof punch?.occurredAt === 'string')
            .map((punch) => {
                const trustedEpochMs = Number.isInteger(punch.occurredAtEpochMs)
                    ? punch.occurredAtEpochMs
                    : null;
                const trustedLocalTime = trustedEpochMs !== null ? formatPortugalEpoch(trustedEpochMs) : null;
                const occurredAt = trustedLocalTime || normalizeLocalDateTime(punch.occurredAt);
                return {
                id: normalizeOptionalText(punch.id) || createEventId(punch.type, occurredAt),
                type: punch.type,
                occurredAt,
                occurredAtUtc: trustedEpochMs !== null ? new Date(trustedEpochMs).toISOString() : normalizeOptionalText(punch.occurredAtUtc),
                occurredAtEpochMs: trustedEpochMs,
                timeZone: normalizeOptionalText(punch.timeZone),
                capturedAt: normalizeOptionalText(punch.capturedAt),
                source: VALID_EVENT_SOURCES.has(punch.source) ? punch.source : 'web',
                actorUid: normalizeOptionalText(punch.actorUid),
                actorEmail: normalizeOptionalText(punch.actorEmail),
                note: normalizeOptionalText(punch.note),
                trustedServerTime: punch.trustedServerTime === true && (trustedEpochMs !== null || Boolean(punch.occurredAtUtc)),
                canonicalEventId: normalizeOptionalText(punch.canonicalEventId)
            }})
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
        : [];

    return {
        employeeId: safeRecord.employeeId || null,
        employeeName: typeof safeRecord.employeeName === 'string' ? safeRecord.employeeName.trim() : '',
        dateKey: normalizeOptionalText(safeRecord.dateKey),
        punches,
        voidedEventIds: Array.isArray(safeRecord.voidedEventIds)
            ? [...new Set(safeRecord.voidedEventIds.filter((eventId) => typeof eventId === 'string' && eventId))]
            : [],
        corrections: Array.isArray(safeRecord.corrections)
            ? safeRecord.corrections.filter((correction) => correction && typeof correction === 'object').map((correction) => ({ ...correction }))
            : [],
        review: {
            status: normalizeReviewStatus(safeRecord.review?.status),
            note: normalizeOptionalText(safeRecord.review?.note),
            reviewedAt: normalizeOptionalText(safeRecord.review?.reviewedAt),
            reviewedBy: normalizeOptionalText(safeRecord.review?.reviewedBy)
        },
        createdAt: normalizeOptionalText(safeRecord.createdAt),
        updatedAt: normalizeOptionalText(safeRecord.updatedAt)
    };
}

export function appendAttendanceEvent(record, eventInput) {
    if (!VALID_EVENT_TYPES.has(eventInput?.type)) {
        throw new Error('Unsupported attendance event type');
    }

    const normalizedRecord = normalizeAttendanceRecord(record);
    const occurredAt = normalizeLocalDateTime(eventInput.occurredAt);
    const nextEvent = {
        id: normalizeOptionalText(eventInput.id) || createEventId(eventInput.type, occurredAt),
        type: eventInput.type,
        occurredAt,
        occurredAtUtc: normalizeOptionalText(eventInput.occurredAtUtc),
        timeZone: normalizeOptionalText(eventInput.timeZone),
        capturedAt: normalizeOptionalText(eventInput.capturedAt) || new Date().toISOString(),
        source: VALID_EVENT_SOURCES.has(eventInput.source) ? eventInput.source : 'web',
        actorUid: normalizeOptionalText(eventInput.actorUid),
        actorEmail: normalizeOptionalText(eventInput.actorEmail),
        note: normalizeOptionalText(eventInput.note),
        trustedServerTime: eventInput.trustedServerTime === true
    };

    const punches = [...normalizedRecord.punches, nextEvent].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    const nextReviewStatus = eventInput.source === 'manual'
        ? 'needs-attention'
        : normalizedRecord.review.status;

    return {
        employeeId: normalizedRecord.employeeId || eventInput.employeeId || null,
        employeeName: normalizedRecord.employeeName || (typeof eventInput.employeeName === 'string' ? eventInput.employeeName.trim() : ''),
        dateKey: normalizedRecord.dateKey || occurredAt.slice(0, 10),
        punches,
        voidedEventIds: normalizedRecord.voidedEventIds,
        corrections: normalizedRecord.corrections,
        review: {
            status: nextReviewStatus,
            note: nextReviewStatus === 'needs-attention'
                ? normalizeOptionalText(eventInput.note) || normalizedRecord.review.note
                : normalizedRecord.review.note,
            reviewedAt: normalizedRecord.review.reviewedAt,
            reviewedBy: normalizedRecord.review.reviewedBy
        },
        createdAt: normalizedRecord.createdAt || nextEvent.capturedAt,
        updatedAt: new Date().toISOString()
    };
}

export function setAttendanceReview(record, { status = null, note = null, reviewedAt = new Date().toISOString(), reviewedBy = null } = {}) {
    const normalizedRecord = normalizeAttendanceRecord(record);
    const nextStatus = normalizeReviewStatus(status);

    return {
        ...normalizedRecord,
        review: {
            status: nextStatus,
            note: normalizeOptionalText(note),
            reviewedAt: nextStatus ? reviewedAt : null,
            reviewedBy: nextStatus ? normalizeOptionalText(reviewedBy) : null
        },
        updatedAt: new Date().toISOString()
    };
}

export function getAttendanceActionState(record) {
    const normalizedRecord = normalizeAttendanceRecord(record);
    const voidedEventIds = new Set(normalizedRecord.voidedEventIds);
    let isClockedIn = false;
    let isOnBreak = false;

    normalizedRecord.punches.filter((punch) => !voidedEventIds.has(punch.id)).forEach((punch) => {
        if (punch.type === 'clockIn') {
            isClockedIn = true;
            isOnBreak = false;
        } else if (punch.type === 'breakStart' && isClockedIn) {
            isOnBreak = true;
        } else if (punch.type === 'breakEnd' && isClockedIn) {
            isOnBreak = false;
        } else if (punch.type === 'clockOut' && isClockedIn) {
            isClockedIn = false;
            isOnBreak = false;
        }
    });

    if (!isClockedIn) {
        return {
            status: 'clocked-out',
            primaryAction: 'clockIn',
            secondaryAction: null
        };
    }

    if (isOnBreak) {
        return {
            status: 'on-break',
            primaryAction: 'breakEnd',
            secondaryAction: 'clockOut'
        };
    }

    return {
        status: 'working',
        primaryAction: 'clockOut',
        secondaryAction: 'breakStart'
    };
}

export function summarizeAttendanceRecord(record, { referenceDateTime = null } = {}) {
    const normalizedRecord = normalizeAttendanceRecord(record);
    const voidedEventIds = new Set(normalizedRecord.voidedEventIds);
    const punches = normalizedRecord.punches.filter((punch) => !voidedEventIds.has(punch.id));
    const fallbackReference = punches[punches.length - 1]?.occurredAt || formatLocalDateTime();
    const effectiveReference = referenceDateTime ? normalizeLocalDateTime(referenceDateTime) : fallbackReference;

    let workedMinutes = 0;
    let breakMinutes = 0;
    let activeSessionStartedAt = null;
    let activeBreakStartedAt = null;
    let activeSessionPunch = null;
    let activeBreakPunch = null;
    let firstClockIn = null;
    let lastClockOut = null;

    punches.forEach((punch) => {
        if (punch.type === 'clockIn') {
            activeSessionStartedAt = punch.occurredAt;
            activeBreakStartedAt = null;
            activeSessionPunch = punch;
            activeBreakPunch = null;
            firstClockIn = firstClockIn || punch.occurredAt;
        } else if (punch.type === 'breakStart' && activeSessionStartedAt && !activeBreakStartedAt) {
            workedMinutes += toMinutesBetween(activeSessionPunch, punch);
            activeBreakStartedAt = punch.occurredAt;
            activeSessionStartedAt = null;
            activeBreakPunch = punch;
            activeSessionPunch = null;
        } else if (punch.type === 'breakEnd' && activeBreakStartedAt) {
            breakMinutes += toMinutesBetween(activeBreakPunch, punch);
            activeBreakStartedAt = null;
            activeSessionStartedAt = punch.occurredAt;
            activeBreakPunch = null;
            activeSessionPunch = punch;
        } else if (punch.type === 'clockOut') {
            if (activeBreakStartedAt) {
                breakMinutes += toMinutesBetween(activeBreakPunch, punch);
                activeBreakStartedAt = null;
                activeBreakPunch = null;
            } else if (activeSessionStartedAt) {
                workedMinutes += toMinutesBetween(activeSessionPunch, punch);
                activeSessionStartedAt = null;
                activeSessionPunch = null;
            }

            lastClockOut = punch.occurredAt;
        }
    });

    if (activeBreakStartedAt) {
        breakMinutes += toMinutesBetween(activeBreakPunch, effectiveReference);
    } else if (activeSessionStartedAt) {
        workedMinutes += toMinutesBetween(activeSessionPunch, effectiveReference);
    }

    const actionState = getAttendanceActionState(normalizedRecord);
    return {
        ...actionState,
        workedMinutes,
        breakMinutes,
        autoBreakMinutes: 0,
        firstClockIn,
        lastClockOut,
        activeSessionStartedAt,
        activeBreakStartedAt,
        hasOpenSession: Boolean(activeSessionStartedAt) || Boolean(activeBreakStartedAt),
        hasManualEntries: punches.some((punch) => punch.source === 'manual'),
        punches
    };
}

export function getWeeklyAttendanceSummary(records = [], { referenceDateTime = null } = {}) {
    const referenceDateKey = referenceDateTime ? normalizeLocalDateTime(referenceDateTime).slice(0, 10) : null;

    return records.reduce((summary, record) => {
        const recordReference = record?.dateKey === referenceDateKey ? referenceDateTime : null;
        const recordSummary = summarizeAttendanceRecord(record, { referenceDateTime: recordReference });
        summary.workedMinutes += recordSummary.workedMinutes;
        summary.breakMinutes += recordSummary.breakMinutes;
        summary.daysWithPunches += recordSummary.punches.length > 0 ? 1 : 0;
        summary.openSessions += recordSummary.hasOpenSession ? 1 : 0;
        return summary;
    }, {
        workedMinutes: 0,
        breakMinutes: 0,
        daysWithPunches: 0,
        openSessions: 0
    });
}

export function getAttendanceReviewQueue(records = [], { referenceDateTime = null } = {}) {
    return records
        .map((record) => {
            const summary = summarizeAttendanceRecord(record, { referenceDateTime });
            const normalizedRecord = normalizeAttendanceRecord(record);
            return {
                record: normalizedRecord,
                summary,
                needsAttention: summary.hasOpenSession || normalizedRecord.review.status === 'needs-attention'
            };
        })
        .filter((entry) => entry.needsAttention)
        .sort((left, right) => right.record.dateKey.localeCompare(left.record.dateKey));
}
