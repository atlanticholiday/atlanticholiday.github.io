import {
    calculateEmployeeLeaveBalanceForYear,
    getAnnualVacationAllowance
} from './views/schedule-view-helpers.js';

export function buildVacationYearClosePlan(employees = [], year, carryOverLimit = 5, holidays = {}) {
    const normalizedYear = Number.parseInt(year, 10);
    const targetYear = normalizedYear + 1;
    const normalizedLimit = Math.max(0, Number.parseInt(carryOverLimit, 10) || 0);

    return employees.map((employee) => {
        const balance = calculateEmployeeLeaveBalanceForYear(employee, normalizedYear, holidays);
        const carryOver = Math.min(balance.unusedVacationDays, normalizedLimit);
        const previousValue = employee.vacationAllowancesByYear?.[String(targetYear)];
        const hasPreviousOverride = previousValue !== null
            && previousValue !== undefined
            && previousValue !== ''
            && Number.isFinite(Number(previousValue));
        const previousAllowance = hasPreviousOverride ? Number(previousValue) : null;
        const baseAllowance = hasPreviousOverride
            ? previousAllowance
            : getAnnualVacationAllowance({ ...employee, vacationAllowancesByYear: {} }, targetYear);

        return {
            employeeId: employee.id,
            carryOver,
            previousAllowance,
            nextAllowance: baseAllowance + carryOver
        };
    });
}
