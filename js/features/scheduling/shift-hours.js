export const PAID_SHIFT_LUNCH_THRESHOLD_HOURS = 6;
export const PAID_SHIFT_LUNCH_DEDUCTION_HOURS = 1;

export function getShiftDurationHours(shiftText) {
    if (!shiftText || typeof shiftText !== 'string') return null;

    const match = shiftText.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!match) return null;

    const [, startHour, startMinute, endHour, endMinute] = match;
    const start = (parseInt(startHour, 10) * 60) + parseInt(startMinute, 10);
    let end = (parseInt(endHour, 10) * 60) + parseInt(endMinute, 10);

    if (end < start) end += 24 * 60;

    return (end - start) / 60;
}

export function getPaidShiftHours(
    shiftText,
    {
        lunchThresholdHours = PAID_SHIFT_LUNCH_THRESHOLD_HOURS,
        lunchDeductionHours = PAID_SHIFT_LUNCH_DEDUCTION_HOURS
    } = {}
) {
    const totalHours = getShiftDurationHours(shiftText);
    if (!Number.isFinite(totalHours)) return null;

    if (totalHours < lunchThresholdHours) {
        return totalHours;
    }

    return Math.max(0, totalHours - lunchDeductionHours);
}
