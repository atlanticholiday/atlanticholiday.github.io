const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_RECIPIENT,
  collectCheckoutReminders,
  createCheckoutReminderEmail,
  getPortugalDateKey,
  normalizeReminderRecipients
} = require("./heated-pool-reminders");

test("defaults, validates, deduplicates, and normalizes recipients", () => {
  assert.deepEqual(normalizeReminderRecipients([]), [DEFAULT_RECIPIENT]);
  assert.deepEqual(normalizeReminderRecipients([
    " INFO@AtlanticHoliday.net ",
    "ops@example.com",
    "ops@example.com",
    "invalid"
  ]), ["info@atlanticholiday.net", "ops@example.com"]);
});

test("calculates the Lisbon calendar day without DST-sensitive arithmetic", () => {
  assert.equal(getPortugalDateKey(new Date("2026-03-28T23:30:00Z"), 1), "2026-03-29");
  assert.equal(getPortugalDateKey(new Date("2026-10-24T23:30:00Z"), 1), "2026-10-26");
});

test("finds only active heated-pool reservations checking out on the target day", () => {
  const reminders = collectCheckoutReminders([
    {
      id: "dream-house",
      propertyName: "Dream House",
      poolState: "on",
      reservations: [
        { id: "current", startDate: "2026-09-14", endDate: "2026-09-21", heatingRequested: true },
        { id: "next", startDate: "2026-09-21", endDate: "2026-09-25", heatingRequested: true }
      ]
    },
    {
      id: "pool-off",
      propertyName: "Pool already off",
      poolState: "off",
      reservations: [{ id: "ignored", endDate: "2026-09-21", heatingRequested: true }]
    }
  ], "2026-09-21");

  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].propertyName, "Dream House");
  assert.equal(reminders[0].nextReservation.id, "next");
});

test("builds a decision email without allowing property HTML into the message", () => {
  const email = createCheckoutReminderEmail({
    propertyName: "Villa <Ocean>",
    endDate: "2026-09-21",
    nextReservation: null
  }, ["info@atlanticholiday.net"]);
  assert.match(email.subject, /Villa <Ocean>/);
  assert.match(email.text, /pode ser desligada/);
  assert.match(email.html, /Villa &lt;Ocean&gt;/);
  assert.doesNotMatch(email.html, /Villa <Ocean>/);
});
