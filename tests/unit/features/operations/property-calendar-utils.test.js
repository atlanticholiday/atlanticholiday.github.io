import { describe, test, assert } from "../../../test-harness.js";
import {
    normalizeDateString,
    normalizeCalendarEvent,
    normalizePmsCalendarDataset,
    generateDateTimeline,
    calculateReservationPlacement,
    filterProperties,
    calculateNights
} from "../../../../js/features/operations/property-calendar-utils.js";

describe("property-calendar-utils", () => {
    test("normalizeDateString parses YYYY-MM-DD and DD/MM/YYYY dates", () => {
        assert.equal(normalizeDateString("2026-09-10"), "2026-09-10");
        assert.equal(normalizeDateString("10/09/2026"), "2026-09-10");
        assert.equal(normalizeDateString("10-09-2026"), "2026-09-10");
        assert.equal(normalizeDateString(new Date(2026, 8, 10)), "2026-09-10");
        assert.equal(normalizeDateString(""), "");
    });

    test("calculateNights calculates duration correctly", () => {
        assert.equal(calculateNights("2026-09-10", "2026-09-15"), 5);
        assert.equal(calculateNights("2026-09-10", "2026-09-10"), 0);
        assert.equal(calculateNights("2026-09-15", "2026-09-10"), 0);
    });

    test("normalizeCalendarEvent handles different raw formats", () => {
        const raw = {
            id: "res-101",
            accommodationName: "A Casinha 4p/2r",
            guestFirstName: "Gustavo",
            guestLastName: "Celona",
            startDate: "2026-09-12",
            endDate: "2026-09-18",
            status: "Confirmed"
        };

        const event = normalizeCalendarEvent(raw);
        assert.equal(event.id, "res-101");
        assert.equal(event.propertyName, "A Casinha 4p/2r");
        assert.equal(event.guestName, "Gustavo Celona");
        assert.equal(event.checkIn, "2026-09-12");
        assert.equal(event.checkOut, "2026-09-18");
        assert.equal(event.nights, 6);
        assert.equal(event.status, "confirmed");
        assert.equal(event.isBlocked, false);
    });

    test("normalizeCalendarEvent flags blocked periods", () => {
        const raw = {
            propertyName: "Acanto Loft 4p/1r",
            checkIn: "2026-09-20",
            checkOut: "2026-09-25",
            status: "Blocked"
        };

        const event = normalizeCalendarEvent(raw);
        assert.equal(event.status, "blocked");
        assert.equal(event.isBlocked, true);
        assert.equal(event.guestName, "Blocked");
    });

    test("normalizePmsCalendarDataset groups and sorts properties", () => {
        const raw = [
            { propertyName: "Zeta Villa", checkIn: "2026-09-10", checkOut: "2026-09-12", guestName: "Guest Z" },
            { propertyName: "Alpha Suite", checkIn: "2026-09-11", checkOut: "2026-09-14", guestName: "Guest A" },
            { propertyName: "Alpha Suite", checkIn: "2026-09-16", checkOut: "2026-09-20", guestName: "Guest B" }
        ];

        const dataset = normalizePmsCalendarDataset(raw);
        assert.equal(dataset.properties.length, 2);
        assert.equal(dataset.properties[0].name, "Alpha Suite");
        assert.equal(dataset.properties[0].reservations.length, 2);
        assert.equal(dataset.properties[1].name, "Zeta Villa");
        assert.equal(dataset.properties[1].reservations.length, 1);
    });

    test("generateDateTimeline creates expected days array", () => {
        const timeline = generateDateTimeline("2026-09-10", 7);
        assert.equal(timeline.length, 7);
        assert.equal(timeline[0].dateKey, "2026-09-10");
        assert.equal(timeline[6].dateKey, "2026-09-16");
        assert.equal(timeline[0].day, 10);
        assert.equal(timeline[0].monthName, "September");
    });

    test("calculateReservationPlacement clamps reservation to visible window", () => {
        const timeline = generateDateTimeline("2026-09-10", 10); // 2026-09-10 to 2026-09-19

        // Fully inside
        const resInside = { checkIn: "2026-09-12", checkOut: "2026-09-15", guestName: "John" };
        const placement1 = calculateReservationPlacement(resInside, timeline);
        assert.equal(placement1.startIndex, 2);
        assert.equal(placement1.span, 3);
        assert.equal(placement1.clampedStart, false);
        assert.equal(placement1.clampedEnd, false);

        // Clamped start
        const resClampedStart = { checkIn: "2026-09-05", checkOut: "2026-09-13", guestName: "Alice" };
        const placement2 = calculateReservationPlacement(resClampedStart, timeline);
        assert.equal(placement2.startIndex, 0);
        assert.equal(placement2.span, 3);
        assert.equal(placement2.clampedStart, true);

        // Outside window (before)
        const resBefore = { checkIn: "2026-09-01", checkOut: "2026-09-08", guestName: "Bob" };
        assert.equal(calculateReservationPlacement(resBefore, timeline), null);

        // Outside window (after)
        const resAfter = { checkIn: "2026-09-25", checkOut: "2026-09-30", guestName: "Charlie" };
        assert.equal(calculateReservationPlacement(resAfter, timeline), null);
    });

    test("filterProperties filters by property name or guest name", () => {
        const properties = [
            { name: "Acqua Beach 6p/2r", reservations: [{ guestName: "Oscar" }] },
            { name: "Banana Lodge 6p/2r", reservations: [{ guestName: "Joshua" }] }
        ];

        assert.equal(filterProperties(properties, "beach").length, 1);
        assert.equal(filterProperties(properties, "joshua").length, 1);
        assert.equal(filterProperties(properties, "xyz").length, 0);
        assert.equal(filterProperties(properties, "").length, 2);
    });
});
