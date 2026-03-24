export const MANUAL_ATTENDANCE_NOTE_MIN_LENGTH = 8;

export function normalizeManualAttendanceNote(note, { minLength = MANUAL_ATTENDANCE_NOTE_MIN_LENGTH } = {}) {
    const normalized = typeof note === 'string' ? note.trim() : '';
    if (normalized.length < minLength) {
        return null;
    }

    return normalized;
}

export function getAttendanceSyncStage({
    online = true,
    hasPendingWrites = false,
    fromCache = false,
    lastError = null
} = {}) {
    if (lastError) {
        return 'error';
    }

    if (!online) {
        return hasPendingWrites ? 'offline-pending' : 'offline';
    }

    if (hasPendingWrites) {
        return 'pending';
    }

    if (fromCache) {
        return 'cached';
    }

    return 'synced';
}
