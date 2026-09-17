const LAUNDRY_PROJECT_ID = 'my-work-schedule-4dc10';
const LAUNDRY_DEFAULT_RECIPIENT = 'info@atlanticholiday.net';
const LAUNDRY_HANDLER = 'runLaundryDisparityAlerts';
const LAUNDRY_SETTINGS_PATH = 'laundryLogSettings/notifications';
const LAUNDRY_RECORDS_COLLECTION = 'laundryHandoffRecords';
const LAUNDRY_DELIVERIES_COLLECTION = 'laundryDisparityAlertDeliveries';

const LAUNDRY_ITEM_LABELS = Object.freeze({
  doubleMattressProtector: 'Resguardo de colchão',
  doubleFittedSheet: 'Lençol de baixo',
  doubleTopSheet: 'Lençol de cima',
  doubleDuvet: 'Edredão',
  doubleDuvetCover: 'Capa de edredão',
  singleMattressProtector: 'Resguardo de colchão individual',
  singleFittedSheet: 'Lençol de baixo individual',
  singleTopSheet: 'Lençol de cima individual',
  singleDuvet: 'Edredão individual',
  singleDuvetCover: 'Capa de edredão individual',
  bathTowel: 'Toalha de banho',
  faceTowel: 'Toalha de rosto',
  poolTowel: 'Toalha de piscina',
  bathMat: 'Tapete de banho',
  pillows: 'Almofada',
  pillowProtectors: 'Protetor de almofada',
  pillowCases: 'Fronha',
  kitchenTowels: 'Pano de cozinha',
  blankets: 'Manta'
});

/**
 * Run once from Apps Script. Current disparities are marked as the baseline, so
 * only disparities that appear after installation generate email.
 */
function authorizeAndInstallLaundryDisparityAlerts() {
  const records = listLaundryFirestoreCollection_(LAUNDRY_RECORDS_COLLECTION);
  MailApp.getRemainingDailyQuota();
  baselineLaundryDisparities_(records);
  removeLaundryDisparityAlertTriggers_();
  ScriptApp.newTrigger(LAUNDRY_HANDLER)
    .timeBased()
    .everyMinutes(5)
    .create();
  console.log(`Laundry disparity alerts installed. Baselined ${records.length} record(s).`);
}

/** Read-only preview. It never writes Firestore and never sends email. */
function previewLaundryDisparityAlerts() {
  const records = listLaundryFirestoreCollection_(LAUNDRY_RECORDS_COLLECTION);
  const deliveriesByRecordId = indexLaundryDeliveriesByRecordId_();
  const newAlerts = records.flatMap((record) => {
    const disparities = getLaundryDisparities_(record);
    if (!isLaundryMismatch_(record, disparities)) return [];
    const delivery = deliveriesByRecordId[record.id] || {};
    return delivery.mismatchActive === true ? [] : [{
      recordId: record.id,
      propertyName: cleanLaundryText_(record.propertyName) || 'Alojamento sem nome',
      disparities
    }];
  });
  console.log(JSON.stringify(newAlerts, null, 2));
  return newAlerts;
}

/** Sends one clearly labelled test email to the configured recipient list. */
function sendLaundryDisparityAlertTestEmail() {
  const settings = getLaundryFirestoreDocument_(LAUNDRY_SETTINGS_PATH, true) || {};
  const recipients = normalizeLaundryRecipients_(settings.recipients);
  MailApp.sendEmail({
    to: recipients.join(','),
    subject: '[TESTE] Lavandaria — alerta de diferença',
    body: 'Este é um teste do alerta automático de diferenças da lavandaria. Nenhuma ação é necessária.',
    htmlBody: '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5"><h2>Teste do alerta de lavandaria</h2><p>O envio automático está configurado.</p><p><strong>Nenhuma ação é necessária.</strong></p></div>',
    name: 'Atlantic Holiday',
    replyTo: LAUNDRY_DEFAULT_RECIPIENT
  });
  console.log(`Test email sent to ${recipients.join(', ')}.`);
}

/** Five-minute trigger entry point. */
function runLaundryDisparityAlerts() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    console.log('Another laundry disparity run is already active.');
    return;
  }

  try {
    const settings = getLaundryFirestoreDocument_(LAUNDRY_SETTINGS_PATH, true) || {};
    if (settings.enabled === false) return;
    const recipients = normalizeLaundryRecipients_(settings.recipients);
    const records = listLaundryFirestoreCollection_(LAUNDRY_RECORDS_COLLECTION);
    const deliveriesByRecordId = indexLaundryDeliveriesByRecordId_();
    let sentCount = 0;
    const failures = [];

    records.forEach((record) => {
      const disparities = getLaundryDisparities_(record);
      const mismatchActive = isLaundryMismatch_(record, disparities);
      const deliveryPath = laundryDeliveryPath_(record.id);
      const delivery = deliveriesByRecordId[record.id] || {};

      if (!mismatchActive) {
        if (delivery.mismatchActive === true) {
          patchLaundryFirestoreDocument_(deliveryPath, {
            recordId: record.id,
            propertyName: cleanLaundryText_(record.propertyName),
            mismatchActive: false,
            status: 'resolved',
            resolvedAt: new Date(),
            deliveryMethod: 'google_apps_script'
          });
        }
        return;
      }
      if (delivery.mismatchActive === true) return;

      patchLaundryFirestoreDocument_(deliveryPath, {
        recordId: record.id,
        propertyName: cleanLaundryText_(record.propertyName),
        recipients,
        mismatchActive: false,
        status: 'sending',
        claimedAt: new Date(),
        attemptCount: Number(delivery.attemptCount || 0) + 1,
        deliveryMethod: 'google_apps_script'
      });

      try {
        const email = createLaundryDisparityEmail_(record, disparities, recipients);
        MailApp.sendEmail({
          to: email.to.join(','),
          subject: email.subject,
          body: email.text,
          htmlBody: email.html,
          name: 'Atlantic Holiday',
          replyTo: LAUNDRY_DEFAULT_RECIPIENT
        });
        patchLaundryFirestoreDocument_(deliveryPath, {
          mismatchActive: true,
          status: 'sent',
          sentAt: new Date(),
          lastMismatchSignature: laundryMismatchSignature_(record, disparities),
          deliveryMethod: 'google_apps_script'
        });
        sentCount += 1;
      } catch (error) {
        failures.push(`${record.propertyName || record.id}: ${error.message || error}`);
        patchLaundryFirestoreDocument_(deliveryPath, {
          mismatchActive: false,
          status: 'failed',
          failedAt: new Date(),
          error: String(error.message || error).slice(0, 1000),
          deliveryMethod: 'google_apps_script'
        });
      }
    });

    patchLaundryFirestoreDocument_(LAUNDRY_SETTINGS_PATH, {
      recipients,
      enabled: settings.enabled !== false,
      checkIntervalMinutes: 5,
      lastRunAt: new Date(),
      lastSentCount: sentCount,
      lastFailedCount: failures.length,
      deliveryMethod: 'google_apps_script'
    });

    if (failures.length) throw new Error(`Laundry disparity alert failures: ${failures.join('; ')}`);
  } finally {
    lock.releaseLock();
  }
}

function removeLaundryDisparityAlertAutomation() {
  const removed = removeLaundryDisparityAlertTriggers_();
  console.log(`Removed ${removed} laundry disparity trigger(s).`);
}

function removeLaundryDisparityAlertTriggers_() {
  let removed = 0;
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === LAUNDRY_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });
  return removed;
}

function baselineLaundryDisparities_(records) {
  const deliveriesByRecordId = indexLaundryDeliveriesByRecordId_();
  records.forEach((record) => {
    const disparities = getLaundryDisparities_(record);
    const mismatchActive = isLaundryMismatch_(record, disparities);
    if (!mismatchActive || deliveriesByRecordId[record.id]) return;
    const deliveryPath = laundryDeliveryPath_(record.id);
    patchLaundryFirestoreDocument_(deliveryPath, {
      recordId: record.id,
      propertyName: cleanLaundryText_(record.propertyName),
      mismatchActive,
      status: mismatchActive ? 'baseline' : 'idle',
      baselinedAt: new Date(),
      lastMismatchSignature: mismatchActive ? laundryMismatchSignature_(record, disparities) : '',
      deliveryMethod: 'google_apps_script'
    });
  });
}

function indexLaundryDeliveriesByRecordId_() {
  return Object.fromEntries(
    listLaundryFirestoreCollection_(LAUNDRY_DELIVERIES_COLLECTION)
      .filter((delivery) => cleanLaundryText_(delivery.recordId))
      .map((delivery) => [cleanLaundryText_(delivery.recordId), delivery])
  );
}

function getLaundryDisparities_(record) {
  const standardItems = Object.keys(record.items || {}).map((key) => ({
    key,
    name: LAUNDRY_ITEM_LABELS[key] || key,
    delivered: normalizeLaundryCount_(record.items[key] && record.items[key].delivered),
    received: normalizeLaundryCount_(record.items[key] && record.items[key].received)
  }));
  const customItems = (Array.isArray(record.customItems) ? record.customItems : []).map((item, index) => ({
    key: `custom:${index}`,
    name: cleanLaundryText_(item && item.name) || 'Outro artigo',
    delivered: normalizeLaundryCount_(item && item.delivered),
    received: normalizeLaundryCount_(item && item.received)
  }));
  return standardItems.concat(customItems)
    .filter((item) => (item.delivered > 0 || item.received > 0) && item.delivered !== item.received)
    .map((item) => ({
      ...item,
      missing: Math.max(item.delivered - item.received, 0),
      extra: Math.max(item.received - item.delivered, 0)
    }));
}

function isLaundryMismatch_(record, disparities) {
  const standardReceived = Object.keys(record.items || {})
    .some((key) => normalizeLaundryCount_(record.items[key] && record.items[key].received) > 0);
  const customReceived = (Array.isArray(record.customItems) ? record.customItems : [])
    .some((item) => normalizeLaundryCount_(item && item.received) > 0);
  const receivedStarted = Boolean(cleanLaundryText_(record.receivedDate)) || standardReceived || customReceived;
  return receivedStarted && disparities.length > 0;
}

function createLaundryDisparityEmail_(record, disparities, recipients) {
  const propertyName = cleanLaundryText_(record.propertyName) || 'Alojamento sem nome';
  const missingUnits = disparities.reduce((sum, item) => sum + item.missing, 0);
  const extraUnits = disparities.reduce((sum, item) => sum + item.extra, 0);
  const receivedBy = cleanLaundryText_((record.receivedBy && (record.receivedBy.name || record.receivedBy.email)) || '');
  const summary = [
    missingUnits ? `${missingUnits} em falta` : '',
    extraUnits ? `${extraUnits} a mais` : ''
  ].filter(Boolean).join(' · ');
  const differenceText = disparities.map((item) => {
    const difference = item.missing ? `${item.missing} em falta` : `${item.extra} a mais`;
    return `${item.name}: enviado ${item.delivered}, recebido ${item.received} — ${difference}`;
  });
  const rows = disparities.map((item) => {
    const difference = item.missing ? `${item.missing} em falta` : `${item.extra} a mais`;
    const color = item.missing ? '#be123c' : '#0369a1';
    return `<tr><td style="padding:10px 12px;border-top:1px solid #e5e7eb">${escapeLaundryHtml_(item.name)}</td><td style="padding:10px 12px;border-top:1px solid #e5e7eb;text-align:center">${item.delivered}</td><td style="padding:10px 12px;border-top:1px solid #e5e7eb;text-align:center">${item.received}</td><td style="padding:10px 12px;border-top:1px solid #e5e7eb;font-weight:600;color:${color}">${escapeLaundryHtml_(difference)}</td></tr>`;
  }).join('');
  const text = [
    'Foi registada uma nova diferença na lavandaria.',
    '',
    `Alojamento: ${propertyName}`,
    `Roupa enviada: ${formatLaundryDate_(record.deliveryDate)}`,
    `Recolha conferida: ${formatLaundryDate_(record.receivedDate)}`,
    receivedBy ? `Conferido por: ${receivedBy}` : '',
    `Resumo: ${summary}`,
    '',
    ...differenceText,
    '',
    'Abra o Registo de Lavandaria e consulte a secção Diferenças.'
  ].filter((line) => line !== '').join('\n');
  const html = [
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5;max-width:680px">',
    '<p style="margin:0 0 6px;color:#be123c;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">Registo de Lavandaria</p>',
    `<h1 style="margin:0 0 18px;font-size:24px;color:#111827">Nova diferença em ${escapeLaundryHtml_(propertyName)}</h1>`,
    '<p>Uma recolha foi conferida e as quantidades não coincidem com a roupa enviada.</p>',
    `<p><strong>Roupa enviada:</strong> ${escapeLaundryHtml_(formatLaundryDate_(record.deliveryDate))}<br><strong>Recolha conferida:</strong> ${escapeLaundryHtml_(formatLaundryDate_(record.receivedDate))}${receivedBy ? `<br><strong>Conferido por:</strong> ${escapeLaundryHtml_(receivedBy)}` : ''}</p>`,
    `<p style="font-size:18px"><strong>${escapeLaundryHtml_(summary)}</strong></p>`,
    '<table style="width:100%;border-collapse:collapse;margin:18px 0"><thead><tr style="background:#f8fafc"><th style="padding:10px 12px;text-align:left">Artigo</th><th style="padding:10px 12px">Enviado</th><th style="padding:10px 12px">Recebido</th><th style="padding:10px 12px;text-align:left">Diferença</th></tr></thead>',
    `<tbody>${rows}</tbody></table>`,
    '<p>Abra o <strong>Registo de Lavandaria</strong> e consulte a secção <strong>Diferenças</strong>.</p>',
    '</div>'
  ].join('');
  return { to: recipients, subject: `Lavandaria — diferença em ${propertyName}`, text, html };
}

function laundryMismatchSignature_(record, disparities) {
  return sha256Laundry_(`${record.id}|${disparities.map((item) => `${item.key}:${item.delivered}:${item.received}`).join('|')}`);
}

function laundryDeliveryPath_(recordId) {
  return `${LAUNDRY_DELIVERIES_COLLECTION}/${sha256Laundry_(recordId)}`;
}

function listLaundryFirestoreCollection_(collectionId) {
  const documents = [];
  let pageToken = '';
  do {
    const query = ['pageSize=100'];
    if (pageToken) query.push(`pageToken=${encodeURIComponent(pageToken)}`);
    const response = laundryFirestoreFetch_(
      `${laundryFirestoreBaseUrl_()}/${encodeURIComponent(collectionId)}?${query.join('&')}`,
      { method: 'get' }
    );
    const payload = JSON.parse(response.getContentText() || '{}');
    (payload.documents || []).forEach((document) => {
      const id = document.name.split('/').pop();
      documents.push({ id, ...decodeLaundryFirestoreFields_(document.fields || {}) });
    });
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  return documents;
}

function getLaundryFirestoreDocument_(documentPath, allowMissing) {
  const response = laundryFirestoreFetch_(
    `${laundryFirestoreBaseUrl_()}/${encodeLaundryFirestorePath_(documentPath)}`,
    { method: 'get' },
    allowMissing
  );
  if (response.getResponseCode() === 404) return null;
  const document = JSON.parse(response.getContentText());
  return decodeLaundryFirestoreFields_(document.fields || {});
}

function patchLaundryFirestoreDocument_(documentPath, data) {
  const fieldMasks = Object.keys(data)
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  laundryFirestoreFetch_(
    `${laundryFirestoreBaseUrl_()}/${encodeLaundryFirestorePath_(documentPath)}?${fieldMasks}`,
    {
      method: 'patch',
      contentType: 'application/json',
      payload: JSON.stringify({ fields: encodeLaundryFirestoreFields_(data) })
    }
  );
}

function laundryFirestoreFetch_(url, options, allowMissing) {
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

function laundryFirestoreBaseUrl_() {
  return `https://firestore.googleapis.com/v1/projects/${LAUNDRY_PROJECT_ID}/databases/(default)/documents`;
}

function encodeLaundryFirestorePath_(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function decodeLaundryFirestoreFields_(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeLaundryFirestoreValue_(value)]));
}

function decodeLaundryFirestoreValue_(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeLaundryFirestoreValue_);
  if ('mapValue' in value) return decodeLaundryFirestoreFields_(value.mapValue.fields || {});
  return null;
}

function encodeLaundryFirestoreFields_(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encodeLaundryFirestoreValue_(value)]));
}

function encodeLaundryFirestoreValue_(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeLaundryFirestoreValue_) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'object') return { mapValue: { fields: encodeLaundryFirestoreFields_(value) } };
  return { stringValue: String(value) };
}

function normalizeLaundryRecipients_(values) {
  const source = Array.isArray(values) ? values : [values];
  const recipients = [...new Set(source
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((email) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    .slice(0, 20);
  return recipients.length ? recipients : [LAUNDRY_DEFAULT_RECIPIENT];
}

function normalizeLaundryCount_(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function formatLaundryDate_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '—');
}

function sha256Laundry_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((byte) => (`0${(byte + 256).toString(16)}`).slice(-2))
    .join('');
}

function cleanLaundryText_(value) {
  return typeof value === 'string' ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, 300) : '';
}

function escapeLaundryHtml_(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
