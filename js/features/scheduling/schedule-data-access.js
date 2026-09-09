export function getEmployeeDirectoryCollectionName({
    isTimeClockStation = false,
    isLimitedScheduleUser = false,
    canAccessPrivateEmployeeDirectory = false
} = {}) {
    if (isTimeClockStation) return 'attendance_station_directory';
    if (isLimitedScheduleUser && !canAccessPrivateEmployeeDirectory) return 'schedule_directory';
    return 'employees';
}

export function getScheduleDataAccessPlan({
    canUseSchedule = false,
    canUseVacationCenter = false,
    isLimitedScheduleUser = false
} = {}) {
    const canUseManagementScheduleData = Boolean(canUseSchedule && !isLimitedScheduleUser);

    return {
        loadVacationRecords: Boolean(canUseVacationCenter || canUseManagementScheduleData),
        loadGlobalSettings: Boolean(canUseVacationCenter || canUseManagementScheduleData),
        loadDailyNotes: canUseManagementScheduleData,
        loadShiftPresets: canUseManagementScheduleData
    };
}

export function getScheduleDayDetailsPolicy({ isLimitedScheduleUser = false } = {}) {
    return {
        showDailyNote: !isLimitedScheduleUser,
        showExtraHours: !isLimitedScheduleUser
    };
}
