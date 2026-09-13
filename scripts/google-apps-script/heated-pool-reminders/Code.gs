const HEATED_POOL_PROJECT_ID = 'my-work-schedule-4dc10';
const HEATED_POOL_TIME_ZONE = 'Europe/Lisbon';
const HEATED_POOL_DEFAULT_RECIPIENT = 'info@atlanticholiday.net';
const HEATED_POOL_HANDLER = 'runHeatedPoolCheckoutReminders';
const HEATED_POOL_SETTINGS_PATH = 'heatedPoolSettings/notifications';

/**
 * Run this once from the Apps Script editor while signed in as the Workspace
 * mailbox that should send the reminders. Google will request authorization,
 * verify Firestore access, and install the daily 09:00-10:00 Lisbon trigger.
 */
function authorizeAndInstallHeatedPoolReminders() {
  listFirestoreCollection_('heatedPools');
  MailApp.getRemainingDailyQuota();
  removeHeatedPoolReminderTriggers_();
  ScriptApp.newTrigger(HEATED_POOL_HANDLER)
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .inTimezone(HEATED_POOL_TIME_ZONE)
    .create();
  console.log('Heated-pool checkout reminder installed.');
}

/** Read-only preview for tomorrow. This never sends an email. */
function previewTomorrowHeatedPoolReminders() {
  const targetDate = getLisbonDateKey_(1);
  const reminders = collectTomorrowReminders_(listFirestoreCollection_('heatedPools'), targetDate);
  console.log(JSON.stringify({ targetDate, reminders }, null, 2));
  return reminders;
}

/** Send one clearly labelled delivery test to the default mailbox. */
function sendHeatedPoolReminderTestEmail() {
  const subject = '[TESTE] Piscinas aquecidas — confirmação do envio automático';
  const text = [
    'Bom dia,',
    '',
    'Este é um teste do envio automático de lembretes das piscinas aquecidas.',
    'O teste foi enviado manualmente e não corresponde a uma reserva real.',
    '',
    'Nenhuma ação é necessária.',
    '',
    'Atlantic Holiday'
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;color:#1f2328;line-height:1.5;max-width:620px">',
    '<p>Bom dia,</p>',
    '<p>Este é um <strong>teste</strong> do envio automático de lembretes das piscinas aquecidas.</p>',
    '<p>O teste foi enviado manualmente e não corresponde a uma reserva real.</p>',
    '<p><strong>Nenhuma ação é necessária.</strong></p>',
    '<p>Atlantic Holiday</p>',
    '</div>'
  ].join('');

  MailApp.sendEmail({
    to: HEATED_POOL_DEFAULT_RECIPIENT,
    subject,
    body: text,
    htmlBody: html,
    name: 'Atlantic Holiday',
    replyTo: HEATED_POOL_DEFAULT_RECIPIENT
  });
  console.log(`Test email sent to ${HEATED_POOL_DEFAULT_RECIPIENT}.`);
}

/** Daily trigger entry point. */
function runHeatedPoolCheckoutReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Another heated-pool reminder run is already active.');
    return;
  }

  try {
    const targetDate = getLisbonDateKey_(1);
    const settings = getFirestoreDocument_(HEATED_POOL_SETTINGS_PATH, true) || {};
    const recipients = normalizeReminderRecipients_(settings.recipients);
    const reminders = collectTomorrowReminders_(listFirestoreCollection_('heatedPools'), targetDate);
    let sentCount = 0;
    let failedCount = 0;
    const failures = [];

    reminders.forEach((reminder) => {
      const deliveryId = sha256_(
        `${reminder.propertyId}|${reminder.reservationId}|${reminder.endDate}`
      );
      const deliveryPath = `heatedPoolReminderDeliveries/${deliveryId}`;
      const delivery = getFirestoreDocument_(deliveryPath, true) || {};
      if (delivery.status === 'sent') return;

      patchFirestoreDocument_(deliveryPath, {
        propertyId: reminder.propertyId,
        propertyName: reminder.propertyName,
        reservationId: reminder.reservationId,
        checkOutDate: reminder.endDate,
        recipients,
        status: 'sending',
        claimedAt: new Date(),
        attemptCount: Number(delivery.attemptCount || 0) + 1,
        deliveryMethod: 'google_apps_script'
      });

      try {
        const email = createReminderEmail_(reminder, recipients);
        MailApp.sendEmail({
          to: email.to.join(','),
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
          name: 'Atlantic Holiday',
          replyTo: HEATED_POOL_DEFAULT_RECIPIENT
        });
        patchFirestoreDocument_(deliveryPath, {
          status: 'sent',
          sentAt: new Date(),
          deliveryMethod: 'google_apps_script'
        });
        sentCount += 1;
      } catch (error) {
        failedCount += 1;
        failures.push(`${reminder.propertyName}: ${error.message || error}`);
        patchFirestoreDocument_(deliveryPath, {
          status: 'failed',
          failedAt: new Date(),
          error: String(error.message || error).slice(0, 1000),
          deliveryMethod: 'google_apps_script'
        });
      }
    });

    patchFirestoreDocument_(HEATED_POOL_SETTINGS_PATH, {
      recipients,
      reminderHour: 9,
      timeZone: HEATED_POOL_TIME_ZONE,
      lastRunAt: new Date(),
      lastRunTargetDate: targetDate,
      lastSentCount: sentCount,
      lastFailedCount: failedCount,
      deliveryMethod: 'google_apps_script'
    });

    if (failures.length) {
      throw new Error(`Heated-pool reminder failures: ${failures.join('; ')}`);
    }
  } finally {
    lock.releaseLock();
  }
}

/** Optional cleanup if the automation should ever be stopped. */
function removeHeatedPoolReminderAutomation() {
  const removed = removeHeatedPoolReminderTriggers_();
  console.log(`Removed ${removed} heated-pool reminder trigger(s).`);
}

function removeHeatedPoolReminderTriggers_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === HEATED_POOL_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return removed;
}

function collectTomorrowReminders_(properties, targetDate) {
  return properties.flatMap((property) => {
    if (property.poolState !== 'on') return [];
    const reservations = Array.isArray(property.reservations) ? property.reservations : [];
    return reservations
      .filter((reservation) => reservation.heatingRequested === true)
      .filter((reservation) => normalizeDateKey_(reservation.endDate) === targetDate)
      .map((reservation) => ({
        propertyId: cleanText_(property.id),
        propertyName: cleanText_(property.propertyName || property.name) || 'Alojamento',
        reservationId: cleanText_(reservation.id),
        startDate: normalizeDateKey_(reservation.startDate),
        endDate: targetDate,
        nextReservation: findNextReservation_(reservations, reservation)
      }));
  });
}

function findNextReservation_(reservations, currentReservation) {
  return reservations
    .filter((reservation) => reservation.id !== currentReservation.id)
    .filter((reservation) => normalizeDateKey_(reservation.startDate) >= normalizeDateKey_(currentReservation.endDate))
    .sort((left, right) => normalizeDateKey_(left.startDate).localeCompare(normalizeDateKey_(right.startDate)))
    .map((reservation) => ({
      id: cleanText_(reservation.id),
      startDate: normalizeDateKey_(reservation.startDate),
      endDate: normalizeDateKey_(reservation.endDate),
      heatingRequested: reservation.heatingRequested === true
    }))[0] || null;
}

function createReminderEmail_(reminder, recipients) {
  const checkOut = formatPortugueseDate_(reminder.endDate);
  const nextReservation = reminder.nextReservation
    ? `Próxima reserva: ${formatPortugueseDate_(reminder.nextReservation.startDate)} a ${formatPortugueseDate_(reminder.nextReservation.endDate)}${reminder.nextReservation.heatingRequested ? ' (com piscina aquecida)' : ''}.`
    : 'Não existe uma próxima reserva registada.';
  const subject = `Piscina aquecida — decisão para ${reminder.propertyName} (${checkOut})`;
  const text = [
    'Bom dia,',
    '',
    `A reserva de ${reminder.propertyName} termina amanhã, ${checkOut}.`,
    '',
    'A piscina pode ser desligada após o check-out ou deve permanecer ligada?',
    nextReservation,
    '',
    'Por favor, confirme a decisão com a equipa de operações.',
    '',
    'Atlantic Holiday'
  ].join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;color:#1f2328;line-height:1.5;max-width:620px">',
    '<p>Bom dia,</p>',
    `<p>A reserva de <strong>${escapeHtml_(reminder.propertyName)}</strong> termina amanhã, <strong>${escapeHtml_(checkOut)}</strong>.</p>`,
    '<p style="font-size:18px"><strong>A piscina pode ser desligada após o check-out ou deve permanecer ligada?</strong></p>',
    `<p>${escapeHtml_(nextReservation)}</p>`,
    '<p>Por favor, confirme a decisão com a equipa de operações.</p>',
    '<p>Atlantic Holiday</p>',
    '</div>'
  ].join('');
  return { to: recipients, subject, text, html };
}

function listFirestoreCollection_(collectionId) {
  const documents = [];
  let pageToken = '';
  do {
    const query = [`pageSize=100`];
    if (pageToken) query.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const response = firestoreFetch_(
      `${firestoreBaseUrl_()}/${encodeURIComponent(collectionId)}?${query.join('&')}`,
      { method: 'get' }
    );
    const payload = JSON.parse(response.getContentText() || '{}');
    (payload.documents || []).forEach((document) => {
      const id = document.name.split('/').pop();
      documents.push({ id, ...decodeFirestoreFields_(document.fields || {}) });
    });
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function getFirestoreDocument_(documentPath, allowMissing) {
  const response = firestoreFetch_(
    `${firestoreBaseUrl_()}/${encodeFirestorePath_(documentPath)}`,
    { method: 'get' },
    allowMissing
  );
  if (response.getResponseCode() === 404) return null;
  const document = JSON.parse(response.getContentText());
  return decodeFirestoreFields_(document.fields || {});
}

function patchFirestoreDocument_(documentPath, data) {
  const fieldMasks = Object.keys(data)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  firestoreFetch_(
    `${firestoreBaseUrl_()}/${encodeFirestorePath_(documentPath)}?${fieldMasks}`,
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ fields: encodeFirestoreFields_(data) })
    }
  );
}

function firestoreFetch_(url, options, allowMissing) {
  const response = UrlFetchApp.fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  if (status >= 200 && status < 300) return response;
  if (allowMissing && status === 404) return response;
  throw new Error(`Firestore request failed (${status}): ${response.getContentText().slice(0, 1000)}`);
}

function firestoreBaseUrl_() {
  return `https://firestore.googleapis.com/v1/projects/${HEATED_POOL_PROJECT_ID}/databases/(default)/documents`;
}

function encodeFirestorePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeFirestoreFields_(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue_(value)]));
}

function decodeFirestoreValue_(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue_);
  if ('mapValue' in value) return decodeFirestoreFields_(value.mapValue.fields || {});
  return null;
}

function encodeFirestoreFields_(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeFirestoreValue_(value)]));
}

function encodeFirestoreValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue_) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'object') return { mapValue: { fields: encodeFirestoreFields_(value) } };
  return { stringValue: String(value) };
}

function normalizeReminderRecipients_(values) {
  const source = Array.isArray(values) ? values : [values];
  const recipients = [...new Set(source
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    .slice(0, 20);
  return recipients.length ? recipients : [HEATED_POOL_DEFAULT_RECIPIENT];
}

function getLisbonDateKey_(offsetDays) {
  const localDate = Utilities.formatDate(new Date(), HEATED_POOL_TIME_ZONE, 'yyyy-MM-dd');
  const shifted = new Date(`${localDate}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays);
  return Utilities.formatDate(shifted, 'UTC', 'yyyy-MM-dd');
}

function normalizeDateKey_(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatPortugueseDate_(value) {
  const match = normalizeDateKey_(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function sha256_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((byte) => (`0${(byte + 256).toString(16)}`).slice(-2))
    .join('');
}

function cleanText_(value) {
  return typeof value === 'string' ? value.trim().slice(0, 300) : '';
}

function escapeHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
