export function normalizeAttendancePrintMode(mode = 'week') {
    return mode === 'month' ? 'month' : 'week';
}

export function getAttendancePrintRange(referenceDate = new Date(), mode = 'week') {
    const normalizedMode = normalizeAttendancePrintMode(mode);
    const safeReferenceDate = new Date(referenceDate);
    safeReferenceDate.setHours(0, 0, 0, 0);

    if (normalizedMode === 'month') {
        const startDate = new Date(safeReferenceDate.getFullYear(), safeReferenceDate.getMonth(), 1);
        const endDate = new Date(safeReferenceDate.getFullYear(), safeReferenceDate.getMonth() + 1, 0);
        return { mode: normalizedMode, startDate, endDate };
    }

    const day = safeReferenceDate.getDay();
    const diff = safeReferenceDate.getDate() - day + (day === 0 ? -6 : 1);
    const startDate = new Date(safeReferenceDate);
    startDate.setDate(diff);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    return { mode: normalizedMode, startDate, endDate };
}

export function shiftAttendancePrintReferenceDate(referenceDate = new Date(), mode = 'week', direction = 1) {
    const normalizedMode = normalizeAttendancePrintMode(mode);
    const step = Number.isFinite(direction) && direction !== 0 ? Math.sign(direction) : 1;
    const { startDate } = getAttendancePrintRange(referenceDate, normalizedMode);

    if (normalizedMode === 'month') {
        return new Date(startDate.getFullYear(), startDate.getMonth() + step, 1);
    }

    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + (step * 7));
    return nextDate;
}
