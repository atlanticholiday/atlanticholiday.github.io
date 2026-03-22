const VALID_EVENT_TYPES = new Set(['clockIn', 'clockOut', 'breakStart', 'breakEnd']);
const VALID_REVIEW_STATUSES = new Set(['needs-attention', 'reviewed']);

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

function createEventId(eventType, occurredAt) {
    return `${eventType}-${occurredAt}-${Math.random().toString(36).slice(2, 8)}`;
}

function toMinutesBetween(startDateTime, endDateTime) {
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);
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
    const punches = Array.isArray(record.punches)
        ? record.punches
            .filter((punch) => VALID_EVENT_TYPES.has(punch?.type) && typeof punch?.occurredAt === 'string')
            .map((punch) => ({
                id: normalizeOptionalText(punch.id) || createEventId(punch.type, normalizeLocalDateTime(punch.occurredAt)),
                type: punch.type,
                occurredAt: normalizeLocalDateTime(punch.occurredAt),
                capturedAt: normalizeOptionalText(punch.capturedAt),
                source: punch.source === 'manual' ? 'manual' : 'web',
                actorUid: normalizeOptionalText(punch.actorUid),
                actorEmail: normalizeOptionalText(punch.actorEmail),
                note: normalizeOptionalText(punch.note)
            }))
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
        : [];

    return {
        employeeId: record.employeeId || null,
        employeeName: typeof record.employeeName === 'string' ? record.employeeName.trim() : '',
        dateKey: normalizeOptionalText(record.dateKey),
        punches,
        review: {
            status: normalizeReviewStatus(record.review?.status),
            note: normalizeOptionalText(record.review?.note),
            reviewedAt: normalizeOptionalText(record.review?.reviewedAt),
            reviewedBy: normalizeOptionalText(record.review?.reviewedBy)
        },
        createdAt: normalizeOptionalText(record.createdAt),
        updatedAt: normalizeOptionalText(record.updatedAt)
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
        capturedAt: normalizeOptionalText(eventInput.capturedAt) || new Date().toISOString(),
        source: eventInput.source === 'manual' ? 'manual' : 'web',
        actorUid: normalizeOptionalText(eventInput.actorUid),
        actorEmail: normalizeOptionalText(eventInput.actorEmail),
        note: normalizeOptionalText(eventInput.note)
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
    let isClockedIn = false;
    let isOnBreak = false;

    normalizedRecord.punches.forEach((punch) => {
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
    const punches = normalizedRecord.punches;
    const fallbackReference = punches[punches.length - 1]?.occurredAt || formatLocalDateTime();
    const effectiveReference = referenceDateTime ? normalizeLocalDateTime(referenceDateTime) : fallbackReference;

    let workedMinutes = 0;
    let breakMinutes = 0;
    let activeSessionStartedAt = null;
    let activeBreakStartedAt = null;
    let firstClockIn = null;
    let lastClockOut = null;

    punches.forEach((punch) => {
        if (punch.type === 'clockIn') {
            activeSessionStartedAt = punch.occurredAt;
            activeBreakStartedAt = null;
            firstClockIn = firstClockIn || punch.occurredAt;
        } else if (punch.type === 'breakStart' && activeSessionStartedAt && !activeBreakStartedAt) {
            workedMinutes += toMinutesBetween(activeSessionStartedAt, punch.occurredAt);
            activeBreakStartedAt = punch.occurredAt;
            activeSessionStartedAt = null;
        } else if (punch.type === 'breakEnd' && activeBreakStartedAt) {
            breakMinutes += toMinutesBetween(activeBreakStartedAt, punch.occurredAt);
            activeBreakStartedAt = null;
            activeSessionStartedAt = punch.occurredAt;
        } else if (punch.type === 'clockOut') {
            if (activeBreakStartedAt) {
                breakMinutes += toMinutesBetween(activeBreakStartedAt, punch.occurredAt);
                activeBreakStartedAt = null;
            } else if (activeSessionStartedAt) {
                workedMinutes += toMinutesBetween(activeSessionStartedAt, punch.occurredAt);
                activeSessionStartedAt = null;
            }

            lastClockOut = punch.occurredAt;
        }
    });

    if (activeBreakStartedAt) {
        breakMinutes += toMinutesBetween(activeBreakStartedAt, effectiveReference);
    } else if (activeSessionStartedAt) {
        workedMinutes += toMinutesBetween(activeSessionStartedAt, effectiveReference);
    }

    const actionState = getAttendanceActionState(normalizedRecord);

    return {
        ...actionState,
        workedMinutes,
        breakMinutes,
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
