/**
 * Pure utility functions for the PMS Multi-Property Calendar (Tape Chart).
 */

export const PMS_STATUS_CONFIG = {
    confirmed: { label: 'Confirmed', colorClass: 'pms-bar--confirmed' },
    paid: { label: 'Paid', colorClass: 'pms-bar--paid' },
    'pre-booking': { label: 'Pre-booking', colorClass: 'pms-bar--prebooking' },
    owner: { label: 'Owner booking', colorClass: 'pms-bar--owner' },
    blocked: { label: 'Blocked', colorClass: 'pms-bar--blocked' },
    stop_sales: { label: 'Stop Sales', colorClass: 'pms-bar--stopsales' },
    under_request: { label: 'Under Request', colorClass: 'pms-bar--request' },
    default: { label: 'Reserved', colorClass: 'pms-bar--default' }
};

/**
 * Normalizes a date value into YYYY-MM-DD string.
 */
export function normalizeDateString(dateVal) {
    if (!dateVal) return '';
    if (typeof dateVal === 'string') {
        const match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) return `${match[1]}-${match[2]}-${match[3]}`;

        // Handle DD/MM/YYYY or DD-MM-YYYY
        const dmyMatch = dateVal.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (dmyMatch) {
            const day = dmyMatch[1].padStart(2, '0');
            const month = dmyMatch[2].padStart(2, '0');
            const year = dmyMatch[3];
            return `${year}-${month}-${day}`;
        }
    }

    const d = new Date(dateVal);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Normalizes raw reservation / calendar block objects into a unified schema.
 */
export function normalizeCalendarEvent(raw = {}) {
    const checkIn = normalizeDateString(raw.checkIn || raw.startDate || raw.start || raw.arrivalDate || raw.date_from || '');
    const checkOut = normalizeDateString(raw.checkOut || raw.endDate || raw.end || raw.departureDate || raw.date_to || '');

    let guestName = String(
        raw.guestName ||
        (raw.guestFirstName ? `${raw.guestFirstName} ${raw.guestLastName || ''}` : '') ||
        raw.clientName ||
        raw.guest ||
        raw.name ||
        ''
    ).replace(/\s+/g, ' ').trim();

    const rawStatus = String(raw.status || raw.state || raw.type || '').toLowerCase();
    let status = 'confirmed';
    let isBlocked = false;

    if (/block|bloq/i.test(rawStatus) || raw.isBlocked) {
        status = 'blocked';
        isBlocked = true;
        if (!guestName) guestName = 'Blocked';
    } else if (/owner|propriet/i.test(rawStatus)) {
        status = 'owner';
        if (!guestName) guestName = 'Owner Stay';
    } else if (/paid|pago/i.test(rawStatus)) {
        status = 'paid';
    } else if (/pre|pend/i.test(rawStatus)) {
        status = 'pre-booking';
    } else if (/stop/i.test(rawStatus)) {
        status = 'stop_sales';
        isBlocked = true;
    } else if (/request/i.test(rawStatus)) {
        status = 'under_request';
    }

    const nights = Math.max(1, calculateNights(checkIn, checkOut));

    return {
        id: String(raw.id || raw.reference || raw.reservationId || `${checkIn}_${guestName}`),
        propertyId: String(raw.propertyId || raw.accommodationId || raw.accommodation_id || ''),
        propertyName: String(raw.propertyName || raw.accommodationName || raw.property || '').trim(),
        guestName: guestName || 'Guest',
        checkIn,
        checkOut,
        nights,
        status,
        isBlocked,
        portal: String(raw.portal || raw.source || raw.channel || '').trim()
    };
}

/**
 * Calculates number of nights between checkIn and checkOut.
 */
export function calculateNights(checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const start = new Date(`${checkIn}T12:00:00Z`);
    const end = new Date(`${checkOut}T12:00:00Z`);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return 0;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Normalizes full PMS payload into a structured calendar dataset:
 * {
 *   properties: [{ id, name, reservations: [] }]
 * }
 */
export function normalizePmsCalendarDataset(raw) {
    if (!raw) return { properties: [] };

    // If raw already has properties array
    if (Array.isArray(raw.properties)) {
        const propertyMap = new Map();
        raw.properties.forEach((p) => {
            const propName = String(p.name || p.propertyName || '').trim();
            if (!propName) return;
            const propId = String(p.id || propName);
            const events = (p.reservations || p.bookings || p.events || []).map(normalizeCalendarEvent);
            propertyMap.set(propName, {
                id: propId,
                name: propName,
                reservations: events
            });
        });

        const sortedProperties = Array.from(propertyMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        );
        return { properties: sortedProperties };
    }

    // If raw is an array of reservations or bookings
    const items = Array.isArray(raw) ? raw : (raw.reservations || raw.events || raw.data || []);
    const propertyMap = new Map();

    items.forEach((item) => {
        const normalized = normalizeCalendarEvent(item);
        if (!normalized.propertyName || !normalized.checkIn) return;

        if (!propertyMap.has(normalized.propertyName)) {
            propertyMap.set(normalized.propertyName, {
                id: normalized.propertyId || normalized.propertyName,
                name: normalized.propertyName,
                reservations: []
            });
        }
        propertyMap.get(normalized.propertyName).reservations.push(normalized);
    });

    const sortedProperties = Array.from(propertyMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );

    return { properties: sortedProperties };
}

/**
 * Generates an array of date objects starting from a startDate for count days.
 */
export function generateDateTimeline(startDate, count = 30) {
    const base = new Date(`${normalizeDateString(startDate)}T12:00:00Z`);
    if (Number.isNaN(base.getTime())) return [];

    const days = [];
    const weekdayShort = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const weekdaySingle = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const todayStr = normalizeDateString(new Date());

    for (let i = 0; i < count; i += 1) {
        const current = new Date(base);
        current.setUTCDate(base.getUTCDate() + i);

        const year = current.getUTCFullYear();
        const month = current.getUTCMonth();
        const day = current.getUTCDate();
        const dayOfWeek = current.getUTCDay(); // 0 is Sun, 6 is Sat
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        days.push({
            dateKey,
            year,
            month,
            monthName: monthNames[month],
            day,
            dayOfWeek,
            dayLetter: weekdaySingle[dayOfWeek],
            dayShort: weekdayShort[dayOfWeek],
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            isToday: dateKey === todayStr,
            index: i
        });
    }

    return days;
}

/**
 * Computes the placement of a reservation inside the active date timeline.
 * Returns null if the reservation does not intersect the date range.
 */
export function calculateReservationPlacement(reservation, timeline) {
    if (!reservation?.checkIn || !reservation?.checkOut || !timeline?.length) return null;

    const windowStart = timeline[0].dateKey;
    const windowEnd = timeline[timeline.length - 1].dateKey;

    // Check if reservation is completely outside window
    if (reservation.checkOut <= windowStart || reservation.checkIn > windowEnd) {
        return null;
    }

    // Find start column index
    let startIndex = timeline.findIndex((d) => d.dateKey === reservation.checkIn);
    let clampedStart = false;
    if (startIndex < 0) {
        if (reservation.checkIn < windowStart) {
            startIndex = 0;
            clampedStart = true;
        } else {
            return null;
        }
    }

    // Find end column index (checkOut is departure day)
    let endIndex = timeline.findIndex((d) => d.dateKey === reservation.checkOut);
    let clampedEnd = false;
    if (endIndex < 0) {
        if (reservation.checkOut > windowEnd) {
            endIndex = timeline.length;
            clampedEnd = true;
        } else {
            return null;
        }
    }

    const span = Math.max(1, endIndex - startIndex);

    return {
        ...reservation,
        startIndex,
        span,
        clampedStart,
        clampedEnd
    };
}

/**
 * Filter properties by query string.
 */
export function filterProperties(properties = [], query = '') {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return properties;

    return properties.filter((p) => {
        const matchesName = p.name.toLowerCase().includes(q);
        if (matchesName) return true;

        // Also check if any guest matches
        return p.reservations?.some((r) =>
            r.guestName.toLowerCase().includes(q)
        );
    });
}
