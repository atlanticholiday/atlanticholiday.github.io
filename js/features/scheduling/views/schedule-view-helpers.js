import { i18n } from '../../../core/i18n.js';

export function getScheduleLocale() {
    return i18n.getCurrentLanguage() === 'pt' ? 'pt-PT' : 'en-GB';
}

export function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getUpcomingVacationEntries(dataManager, { includePast = false } = {}) {
    const todayKey = getLocalDateKey(new Date());
    return dataManager
        .getSharedVacationEntries()
        .filter((vacation) => includePast || vacation.endDate >= todayKey)
        .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

export function calculateEmployeeVacationDaysForYear(employee, year) {
    let vacationDays = 0;

    (employee.vacations || []).forEach((vacation) => {
        const start = new Date(`${vacation.startDate}T00:00:00`);
        const end = new Date(`${vacation.endDate}T00:00:00`);

        for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
            if (current.getFullYear() !== year) {
                continue;
            }

            const weekday = current.getDay();
            if (weekday !== 0 && weekday !== 6) {
                vacationDays += 1;
            }
        }
    });

    return vacationDays;
}

export function getAnnualVacationAllowance(employee) {
    const adjustment = Number(employee?.vacationAdjustment || 0);
    return 22 + (Number.isFinite(adjustment) ? adjustment : 0);
}

export function calculateEmployeeLeaveBalanceForYear(employee, year) {
    const vacationAllowance = getAnnualVacationAllowance(employee);
    const vacationDays = calculateEmployeeVacationDaysForYear(employee, year);
    const vacationBalance = vacationAllowance - vacationDays;

    return {
        vacationAllowance,
        vacationDays,
        vacationBalance,
        unusedVacationDays: Math.max(vacationBalance, 0)
    };
}

export function calculateEmployeeExtraHoursForYear(employee, year) {
    let extraHours = 0;

    Object.entries(employee.extraHours || {}).forEach(([dateKey, hours]) => {
        if (!dateKey.startsWith(String(year))) {
            return;
        }

        extraHours += Number.parseFloat(hours) || 0;
    });

    return extraHours;
}

export function calculateTeamStats(dataManager, year) {
    return dataManager.getActiveEmployees().map((employee) => {
        const {
            vacationAllowance,
            vacationDays,
            vacationBalance,
            unusedVacationDays
        } = calculateEmployeeLeaveBalanceForYear(employee, year);
        const previousYearBalance = calculateEmployeeLeaveBalanceForYear(employee, year - 1);
        const extraHours = calculateEmployeeExtraHoursForYear(employee, year);

        return {
            id: employee.id,
            name: employee.name,
            vacationAllowance,
            vacationDays,
            vacationBalance,
            unusedVacationDays,
            previousYearUnusedVacationDays: previousYearBalance.unusedVacationDays,
            extraHours
        };
    });
}

export function calculatePreviousYearLeaveStats(dataManager, currentYear, lookbackYears = 3) {
    const employees = dataManager.getActiveEmployees();

    return Array.from({ length: lookbackYears }, (_, index) => currentYear - index - 1).map((year) => {
        const employeeRows = employees.map((employee) => {
            const {
                vacationAllowance,
                vacationDays,
                vacationBalance,
                unusedVacationDays
            } = calculateEmployeeLeaveBalanceForYear(employee, year);

            return {
                id: employee.id,
                name: employee.name,
                vacationAllowance,
                vacationDays,
                vacationBalance,
                unusedVacationDays
            };
        });

        return {
            year,
            vacationAllowance: employeeRows.reduce((sum, row) => sum + row.vacationAllowance, 0),
            vacationDays: employeeRows.reduce((sum, row) => sum + row.vacationDays, 0),
            unusedVacationDays: employeeRows.reduce((sum, row) => sum + row.unusedVacationDays, 0),
            colleaguesWithUnusedDays: employeeRows.filter((row) => row.unusedVacationDays > 0).length,
            employeeRows
        };
    });
}

export function calculateYearlySummaryRows(dataManager, year) {
    const totals = { worked: 0, off: 0, absent: 0, vacation: 0, extraHours: 0 };
    const rows = Array.from({ length: 12 }, (_, monthIndex) => {
        const monthStats = { worked: 0, off: 0, absent: 0, vacation: 0, extraHours: 0 };
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day += 1) {
            const date = new Date(year, monthIndex, day);
            const dateKey = dataManager.getDateKey(date);

            dataManager.getActiveEmployees().forEach((employee) => {
                const status = dataManager.getEmployeeStatusForDate(employee, date);

                if (status === 'On Vacation') {
                    monthStats.vacation += 1;
                } else if (status === 'Working') {
                    monthStats.worked += 1;
                } else if (status === 'Absent') {
                    monthStats.absent += 1;
                } else {
                    monthStats.off += 1;
                }

                monthStats.extraHours += Number(employee.extraHours?.[dateKey] || 0);
            });
        }

        totals.worked += monthStats.worked;
        totals.off += monthStats.off;
        totals.absent += monthStats.absent;
        totals.vacation += monthStats.vacation;
        totals.extraHours += monthStats.extraHours;

        return {
            monthIndex,
            ...monthStats
        };
    });

    return { rows, totals };
}
