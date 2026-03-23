export const VACATION_BOARD_ALL_DEPARTMENTS = 'all';
export const VACATION_BOARD_UNASSIGNED_DEPARTMENT = '__unassigned__';

function toDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeSearchValue(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeDepartmentValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const normalized = value.trim();
    return normalized || null;
}

function parseDate(dateKey) {
    return new Date(`${dateKey}T00:00:00`);
}

function overlapsYear(vacationEntry, year) {
    return vacationEntry.startDate <= `${year}-12-31` && vacationEntry.endDate >= `${year}-01-01`;
}

function countDaysWithinYear(vacationEntry, year) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    const start = new Date(Math.max(parseDate(vacationEntry.startDate).getTime(), yearStart.getTime()));
    const end = new Date(Math.min(parseDate(vacationEntry.endDate).getTime(), yearEnd.getTime()));

    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function getMonthSegment(vacationEntry, year, monthIndex) {
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const vacationStart = parseDate(vacationEntry.startDate);
    const vacationEnd = parseDate(vacationEntry.endDate);

    if (vacationEnd < monthStart || vacationStart > monthEnd) {
        return null;
    }

    const visibleStart = new Date(Math.max(vacationStart.getTime(), monthStart.getTime()));
    const visibleEnd = new Date(Math.min(vacationEnd.getTime(), monthEnd.getTime()));
    const startsEarlier = vacationStart < monthStart;
    const endsLater = vacationEnd > monthEnd;

    return {
        id: vacationEntry.id,
        startDay: visibleStart.getDate(),
        endDay: visibleEnd.getDate(),
        label: visibleStart.getDate() === visibleEnd.getDate()
            ? String(visibleStart.getDate())
            : `${visibleStart.getDate()}-${visibleEnd.getDate()}`,
        continuesFromPrevious: startsEarlier,
        continuesToNext: endsLater,
        startDate: vacationEntry.startDate,
        endDate: vacationEntry.endDate
    };
}

function compareVacationEntries(left, right) {
    const startComparison = left.startDate.localeCompare(right.startDate);
    if (startComparison !== 0) {
        return startComparison;
    }

    const endComparison = left.endDate.localeCompare(right.endDate);
    if (endComparison !== 0) {
        return endComparison;
    }

    return (left.employeeName || '').localeCompare(right.employeeName || '');
}

export function getVacationBoardDepartmentOptions(employees = []) {
    const departments = new Set();
    let hasUnassignedDepartment = false;

    employees.forEach((employee) => {
        const department = normalizeDepartmentValue(employee?.department);
        if (department) {
            departments.add(department);
        } else {
            hasUnassignedDepartment = true;
        }
    });

    const options = [...departments].sort((left, right) => left.localeCompare(right));
    if (hasUnassignedDepartment) {
        options.push(VACATION_BOARD_UNASSIGNED_DEPARTMENT);
    }

    return options;
}

export function buildVacationBoardRows(employees = [], vacationEntries = [], year, {
    search = '',
    department = VACATION_BOARD_ALL_DEPARTMENTS,
    currentEmployeeId = null,
    today = new Date()
} = {}) {
    const normalizedSearch = normalizeSearchValue(search);
    const todayKey = toDateKey(today);

    return employees
        .filter((employee) => {
            const employeeDepartment = normalizeDepartmentValue(employee?.department);
            const matchesDepartment = department === VACATION_BOARD_ALL_DEPARTMENTS
                || (department === VACATION_BOARD_UNASSIGNED_DEPARTMENT
                    ? !employeeDepartment
                    : employeeDepartment === department);

            if (!matchesDepartment) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const searchableValue = `${employee?.name || ''} ${employeeDepartment || ''}`.toLowerCase();
            return searchableValue.includes(normalizedSearch);
        })
        .map((employee) => {
            const employeeVacations = vacationEntries
                .filter((vacationEntry) => vacationEntry.employeeId === employee.id && overlapsYear(vacationEntry, year))
                .sort(compareVacationEntries);
            const nextVacation = employeeVacations.find((vacationEntry) => vacationEntry.endDate >= todayKey) || null;

            return {
                id: employee.id,
                name: employee.name || '',
                department: normalizeDepartmentValue(employee.department),
                isCurrentUser: Boolean(currentEmployeeId) && employee.id === currentEmployeeId,
                awayToday: employeeVacations.some((vacationEntry) => vacationEntry.startDate <= todayKey && vacationEntry.endDate >= todayKey),
                totalBookedDays: employeeVacations.reduce((sum, vacationEntry) => sum + countDaysWithinYear(vacationEntry, year), 0),
                upcomingCount: employeeVacations.filter((vacationEntry) => vacationEntry.endDate >= todayKey).length,
                nextVacation,
                monthSegments: Array.from({ length: 12 }, (_, monthIndex) => ({
                    monthIndex,
                    segments: employeeVacations
                        .map((vacationEntry) => getMonthSegment(vacationEntry, year, monthIndex))
                        .filter(Boolean)
                }))
            };
        })
        .sort((left, right) => {
            if (left.isCurrentUser !== right.isCurrentUser) {
                return left.isCurrentUser ? -1 : 1;
            }

            if (left.awayToday !== right.awayToday) {
                return left.awayToday ? -1 : 1;
            }

            if (left.totalBookedDays !== right.totalBookedDays) {
                return right.totalBookedDays - left.totalBookedDays;
            }

            if (left.nextVacation?.startDate && right.nextVacation?.startDate) {
                const nextVacationComparison = left.nextVacation.startDate.localeCompare(right.nextVacation.startDate);
                if (nextVacationComparison !== 0) {
                    return nextVacationComparison;
                }
            }

            if (left.nextVacation?.startDate) {
                return -1;
            }

            if (right.nextVacation?.startDate) {
                return 1;
            }

            return left.name.localeCompare(right.name);
        });
}

export function buildVacationBoardSummary(employees = [], vacationEntries = [], year, { today = new Date() } = {}) {
    const todayKey = toDateKey(today);
    const relevantEmployeeIds = new Set(employees.map((employee) => employee.id));
    const relevantVacations = vacationEntries
        .filter((vacationEntry) => relevantEmployeeIds.has(vacationEntry.employeeId) && overlapsYear(vacationEntry, year))
        .sort(compareVacationEntries);

    const busiestMonths = Array.from({ length: 12 }, (_, monthIndex) => {
        const employeeIds = new Set(
            relevantVacations
                .filter((vacationEntry) => getMonthSegment(vacationEntry, year, monthIndex))
                .map((vacationEntry) => vacationEntry.employeeId)
        );

        return {
            monthIndex,
            count: employeeIds.size
        };
    });

    const busiestMonth = busiestMonths.reduce((best, current) => {
        if (current.count > best.count) {
            return current;
        }
        return best;
    }, { monthIndex: 0, count: 0 });

    return {
        awayTodayCount: new Set(
            relevantVacations
                .filter((vacationEntry) => vacationEntry.startDate <= todayKey && vacationEntry.endDate >= todayKey)
                .map((vacationEntry) => vacationEntry.employeeId)
        ).size,
        plannedColleaguesCount: new Set(relevantVacations.map((vacationEntry) => vacationEntry.employeeId)).size,
        busiestMonthIndex: busiestMonth.monthIndex,
        busiestMonthCount: busiestMonth.count,
        nextDeparture: relevantVacations.find((vacationEntry) => vacationEntry.startDate >= todayKey) || null,
        upcomingVacations: relevantVacations.filter((vacationEntry) => vacationEntry.endDate >= todayKey).slice(0, 6)
    };
}
