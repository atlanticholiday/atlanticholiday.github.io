/**
 * iCal Sync Manager for Welcome Pack Module
 * Handles parsing iCal feeds and extracting check-in information
 */
export class ICalSyncManager {
    constructor(db) {
        this.db = db;
        this.cachedEvents = new Map(); // propertyId -> events[]
        this.lastSync = null;
    }

    /**
     * Parse iCal data string into events array
     * @param {string} icalData - Raw iCal data
     * @returns {Array} Array of parsed events with check-in dates
     */
    parseICalData(icalData) {
        const events = [];

        if (!icalData || typeof icalData !== 'string') {
            console.warn('[ICalSync] Invalid iCal data provided');
            return events;
        }

        try {
            // Split into events
            const eventBlocks = icalData.split('BEGIN:VEVENT');

            for (let i = 1; i < eventBlocks.length; i++) {
                const block = eventBlocks[i].split('END:VEVENT')[0];

                const event = {
                    uid: this.extractField(block, 'UID'),
                    summary: this.extractField(block, 'SUMMARY'),
                    description: this.extractField(block, 'DESCRIPTION'),
                    dtstart: this.parseICalDate(this.extractField(block, 'DTSTART')),
                    dtend: this.parseICalDate(this.extractField(block, 'DTEND')),
                    location: this.extractField(block, 'LOCATION')
                };

                // Only include valid events with start dates
                if (event.dtstart) {
                    events.push(event);
                }
            }
        } catch (error) {
            console.error('[ICalSync] Error parsing iCal data:', error);
        }

        return events;
    }

    /**
     * Extract a field value from iCal block
     */
    extractField(block, fieldName) {
        // Handle different iCal formats (with and without parameters)
        const regex = new RegExp(`${fieldName}[^:]*:([^\\r\\n]+)`, 'i');
        const match = block.match(regex);

        if (match) {
            // Decode iCal escaped characters
            return match[1]
                .replace(/\\n/g, '\n')
                .replace(/\\,/g, ',')
                .replace(/\\;/g, ';')
                .replace(/\\\\/g, '\\')
                .trim();
        }
        return null;
    }

    /**
     * Parse iCal date format to JavaScript Date
     * Handles formats: YYYYMMDD, YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ
     */
    parseICalDate(dateStr) {
        if (!dateStr) return null;

        try {
            // Remove any timezone info like "VALUE=DATE:"
            const cleanDate = dateStr.replace(/VALUE=DATE:/i, '').trim();

            if (cleanDate.length === 8) {
                // YYYYMMDD format (all-day event)
                const year = parseInt(cleanDate.substring(0, 4));
                const month = parseInt(cleanDate.substring(4, 6)) - 1;
                const day = parseInt(cleanDate.substring(6, 8));
                return new Date(year, month, day);
            } else if (cleanDate.length >= 15) {
                // YYYYMMDDTHHmmss format
                const year = parseInt(cleanDate.substring(0, 4));
                const month = parseInt(cleanDate.substring(4, 6)) - 1;
                const day = parseInt(cleanDate.substring(6, 8));
                const hour = parseInt(cleanDate.substring(9, 11));
                const minute = parseInt(cleanDate.substring(11, 13));
                const second = parseInt(cleanDate.substring(13, 15));

                if (cleanDate.endsWith('Z')) {
                    return new Date(Date.UTC(year, month, day, hour, minute, second));
                }
                return new Date(year, month, day, hour, minute, second);
            }
        } catch (error) {
            console.warn('[ICalSync] Failed to parse date:', dateStr);
        }

        return null;
    }

    /**
     * Fetch iCal data from a URL (via CORS proxy if needed)
     * Note: Direct fetching from client-side may fail due to CORS
     */
    async fetchICalFromUrl(url) {
        try {
            // Try direct fetch first
            let response = await fetch(url);

            if (!response.ok) {
                // Try with CORS proxy
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                response = await fetch(proxyUrl);
            }

            if (response.ok) {
                return await response.text();
            }
        } catch (error) {
            console.error('[ICalSync] Failed to fetch iCal:', error);
        }

        return null;
    }

    /**
     * Get check-ins for a specific date
     * @param {Array} events - Parsed events array
     * @param {Date} date - Date to check (defaults to today)
     * @returns {Array} Events where check-in is on the specified date
     */
    getCheckInsForDate(events, date = new Date()) {
        const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        return events.filter(event => {
            if (!event.dtstart) return false;

            const eventDate = new Date(
                event.dtstart.getFullYear(),
                event.dtstart.getMonth(),
                event.dtstart.getDate()
            );

            return eventDate.getTime() === targetDate.getTime();
        });
    }

    /**
     * Get check-ins for today across all properties
     * @param {Array} propertiesWithIcal - Array of {id, name, icalUrl}
     * @returns {Promise<Array>} Array of {property, event} for today's check-ins
     */
    async getTodayCheckIns(propertiesWithIcal) {
        const today = new Date();
        const checkIns = [];

        for (const property of propertiesWithIcal) {
            if (!property.icalUrl) continue;

            try {
                const icalData = await this.fetchICalFromUrl(property.icalUrl);
                if (icalData) {
                    const events = this.parseICalData(icalData);
                    const todayEvents = this.getCheckInsForDate(events, today);

                    for (const event of todayEvents) {
                        checkIns.push({
                            property: {
                                id: property.id,
                                name: property.name
                            },
                            event: event,
                            guestName: this.extractGuestName(event.summary || event.description),
                            checkInDate: event.dtstart,
                            checkOutDate: event.dtend
                        });
                    }
                }
            } catch (error) {
                console.warn(`[ICalSync] Failed to get check-ins for ${property.name}:`, error);
            }
        }

        this.lastSync = new Date();
        return checkIns;
    }

    /**
     * Extract guest name from booking summary/description
     * Common formats: "Guest Name - Airbnb", "Booking: Guest Name", etc.
     */
    extractGuestName(text) {
        if (!text) return 'Guest';

        // Remove common prefixes/suffixes
        let name = text
            .replace(/Reserved|Blocked|Not available|Airbnb|Booking\.com/gi, '')
            .replace(/\s*-\s*/g, ' ')
            .replace(/\s*:\s*/g, ' ')
            .trim();

        // Take first reasonable part
        if (name.length > 50) {
            name = name.substring(0, 50) + '...';
        }

        return name || 'Guest';
    }

    /**
     * Check if any items in the pack will have insufficient stock
     * @param {Array} items - Pack items with quantities
     * @param {Array} inventory - Current inventory items
     * @returns {Array} Items with insufficient stock
     */
    checkStockAvailability(packItems, inventory) {
        const insufficientItems = [];

        for (const packItem of packItems) {
            const inventoryItem = inventory.find(i => i.id === packItem.id);
            const required = packItem.quantity || 1;
            const available = inventoryItem ? (inventoryItem.quantity || 0) : 0;

            if (available < required) {
                insufficientItems.push({
                    name: packItem.name,
                    required: required,
                    available: available,
                    shortage: required - available
                });
            }
        }

        return insufficientItems;
    }
}
