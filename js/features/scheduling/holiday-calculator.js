function calculateEaster(year) {
    const floor = Math.floor;
    const goldenNumber = year % 19;
    const century = floor(year / 100);
    const correction = (century - floor(century / 4) - floor((8 * century + 13) / 25) + 19 * goldenNumber + 15) % 30;
    const adjustedCorrection = correction - floor(correction / 28) * (1 - floor(29 / (correction + 1)) * floor((21 - goldenNumber) / 11));
    const weekdayCorrection = (year + floor(year / 4) + adjustedCorrection + 2 - century + floor(century / 4)) % 7;
    const epact = adjustedCorrection - weekdayCorrection;
    const month = 3 + floor((epact + 40) / 44);
    const day = epact + 28 - 31 * floor(month / 4);

    return new Date(year, month - 1, day);
}

function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function buildHolidayDefinitions(year) {
    const easter = calculateEaster(year);

    return [
        { m: 1, d: 1, name: "New Year's Day" },
        { date: addDays(easter, -47), name: 'Carnival Tuesday' },
        { date: addDays(easter, -2), name: 'Good Friday' },
        { date: easter, name: 'Easter Sunday' },
        { m: 4, d: 2, name: "Madeira's Autonomy Day" },
        { m: 4, d: 25, name: 'Freedom Day' },
        { m: 5, d: 1, name: 'Labour Day' },
        { date: addDays(easter, 60), name: 'Corpus Christi' },
        { m: 6, d: 10, name: 'Portugal Day' },
        { m: 7, d: 1, name: 'Madeira Day' },
        { m: 8, d: 15, name: 'Assumption of Mary' },
        { m: 8, d: 21, name: 'Funchal City Day' },
        { m: 10, d: 5, name: 'Republic Day' },
        { m: 11, d: 1, name: "All Saints' Day" },
        { m: 12, d: 1, name: 'Restoration of Independence' },
        { m: 12, d: 8, name: 'Immaculate Conception' },
        { m: 12, d: 25, name: 'Christmas Day' },
        { m: 12, d: 26, name: 'Boxing Day' }
    ];
}

export function getDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export class HolidayCalculator {
    constructor() {
        this.holidaysByYear = {};
    }

    preloadYears(years = []) {
        years.forEach((year) => this.ensureYear(year));
    }

    ensureYear(year) {
        if (!this.holidaysByYear[year]) {
            this.holidaysByYear[year] = this.buildHolidayMap(year);
        }

        return this.holidaysByYear[year];
    }

    getHolidays(year) {
        return this.ensureYear(year);
    }

    getHolidayName(date) {
        return this.getHolidays(date.getFullYear())[getDateKey(date)] || null;
    }

    getAllHolidays() {
        return { ...this.holidaysByYear };
    }

    buildHolidayMap(year) {
        const holidayMap = {};

        buildHolidayDefinitions(year).forEach((holiday) => {
            const date = holiday.date || new Date(year, holiday.m - 1, holiday.d);
            holidayMap[getDateKey(date)] = holiday.name;
        });

        return holidayMap;
    }
}
