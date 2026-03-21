import { describe, test, assert } from "../test-harness.js";
import { WelcomePackManager } from "../../js/welcome-pack-manager.js";

describe("WelcomePackManager", () => {
  test("calculates VAT from a net amount", () => {
    const manager = new WelcomePackManager({});
    const result = manager.calculateVAT(10, 22);

    assert.equal(result.net, 10);
    assert.equal(result.vatAmount, 2.2);
    assert.equal(result.grossPrice, 12.2);
    assert.equal(result.rate, 22);
  });

  test("parses iCal reservations into check-in and check-out dates", () => {
    const manager = new WelcomePackManager({});
    const ical = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260321",
      "DTEND;VALUE=DATE:20260325",
      "SUMMARY:Booking.com - Guest One",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260401",
      "DTEND;VALUE=DATE:20260405",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\n");

    const reservations = manager.parseIcalData(ical, "Sea Breeze");

    assert.equal(reservations.length, 2);
    assert.equal(reservations[0].propertyName, "Sea Breeze");
    assert.match(reservations[0].checkIn, /^2026-03-21T00:00:00/);
    assert.match(reservations[0].checkOut, /^2026-03-25T00:00:00/);
    assert.equal(reservations[0].summary, "Booking.com - Guest One");
    assert.equal(reservations[1].summary, "Reserved");
  });

  test("invalidates either one cache bucket or an array of buckets", () => {
    const manager = new WelcomePackManager({});
    manager.cache.logs = [1];
    manager.cache.items = [2];
    manager.cache.presets = [3];

    manager._invalidateCache("logs");
    manager._invalidateCache(["items", "presets"]);

    assert.equal(manager.cache.logs, null);
    assert.equal(manager.cache.items, null);
    assert.equal(manager.cache.presets, null);
  });
});
