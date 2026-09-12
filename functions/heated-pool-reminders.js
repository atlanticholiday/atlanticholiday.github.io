const DEFAULT_RECIPIENT = "info@atlanticholiday.net";

function normalizeReminderRecipients(values, { useDefault = true } = {}) {
  const source = Array.isArray(values) ? values : [values];
  const recipients = [...new Set(source
    .map((value) => typeof value === "string" ? value.trim().toLowerCase() : "")
    .filter((email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    .slice(0, 20);
  return recipients.length || !useDefault ? recipients : [DEFAULT_RECIPIENT];
}

function getPortugalDateKey(date = new Date(), offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const shifted = new Date(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day) + offsetDays,
    12
  ));
  return shifted.toISOString().slice(0, 10);
}

function collectCheckoutReminders(properties = [], targetDate) {
  return properties.flatMap((property) => {
    if (property?.poolState !== "on") return [];
    const reservations = Array.isArray(property.reservations) ? property.reservations : [];
    return reservations
      .filter((reservation) => reservation?.heatingRequested === true)
      .filter((reservation) => normalizeDateKey(reservation.endDate) === targetDate)
      .map((reservation) => ({
        propertyId: cleanText(property.id),
        propertyName: cleanText(property.propertyName || property.name) || "Alojamento",
        reservationId: cleanText(reservation.id),
        startDate: normalizeDateKey(reservation.startDate),
        endDate: targetDate,
        nextReservation: findNextReservation(reservations, reservation)
      }));
  });
}

function findNextReservation(reservations, currentReservation) {
  return reservations
    .filter((reservation) => reservation?.id !== currentReservation?.id)
    .filter((reservation) => normalizeDateKey(reservation?.startDate) >= normalizeDateKey(currentReservation?.endDate))
    .sort((a, b) => normalizeDateKey(a.startDate).localeCompare(normalizeDateKey(b.startDate)))
    .map((reservation) => ({
      id: cleanText(reservation.id),
      startDate: normalizeDateKey(reservation.startDate),
      endDate: normalizeDateKey(reservation.endDate),
      heatingRequested: reservation.heatingRequested === true
    }))[0] || null;
}

function createCheckoutReminderEmail(reminder, recipients) {
  const checkOut = formatPortugueseDate(reminder.endDate);
  const nextReservationText = reminder.nextReservation
    ? `Próxima reserva: ${formatPortugueseDate(reminder.nextReservation.startDate)} a ${formatPortugueseDate(reminder.nextReservation.endDate)}${reminder.nextReservation.heatingRequested ? " (com piscina aquecida)" : ""}.`
    : "Não existe uma próxima reserva registada.";
  const subject = `Piscina aquecida — decisão para ${reminder.propertyName} (${checkOut})`;
  const text = [
    "Bom dia,",
    "",
    `A reserva de ${reminder.propertyName} termina amanhã, ${checkOut}.`,
    "",
    "A piscina pode ser desligada após o check-out ou deve permanecer ligada?",
    nextReservationText,
    "",
    "Por favor, confirme a decisão com a equipa de operações.",
    "",
    "Atlantic Holiday"
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;color:#1f2328;line-height:1.5;max-width:620px">
      <p>Bom dia,</p>
      <p>A reserva de <strong>${escapeHtml(reminder.propertyName)}</strong> termina amanhã, <strong>${escapeHtml(checkOut)}</strong>.</p>
      <p style="font-size:18px"><strong>A piscina pode ser desligada após o check-out ou deve permanecer ligada?</strong></p>
      <p>${escapeHtml(nextReservationText)}</p>
      <p>Por favor, confirme a decisão com a equipa de operações.</p>
      <p>Atlantic Holiday</p>
    </div>`;
  return { to: normalizeReminderRecipients(recipients), subject, text, html };
}

function normalizeDateKey(value) {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function formatPortugueseDate(value) {
  const match = normalizeDateKey(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  DEFAULT_RECIPIENT,
  collectCheckoutReminders,
  createCheckoutReminderEmail,
  getPortugalDateKey,
  normalizeReminderRecipients
};
