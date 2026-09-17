const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const context = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest(algorithm, value) {
      return [...crypto.createHash(algorithm).update(String(value), 'utf8').digest()]
        .map((byte) => byte > 127 ? byte - 256 : byte);
    }
  }
});
vm.runInContext(`${source}\n;globalThis.testExports = {
  getLaundryDisparities_,
  isLaundryMismatch_,
  createLaundryDisparityEmail_,
  normalizeLaundryRecipients_,
  laundryDeliveryPath_
};`, context);

const {
  getLaundryDisparities_,
  isLaundryMismatch_,
  createLaundryDisparityEmail_,
  normalizeLaundryRecipients_,
  laundryDeliveryPath_
} = context.testExports;

const pending = {
  id: 'record-1',
  propertyName: 'Atlantic View',
  deliveryDate: '2026-09-15',
  items: {
    bathTowel: { delivered: 4, received: 0 },
    pillowCases: { delivered: 2, received: 0 }
  }
};

const mismatched = {
  ...pending,
  receivedDate: '2026-09-17',
  receivedBy: { name: 'Rita' },
  items: {
    bathTowel: { delivered: 4, received: 3 },
    pillowCases: { delivered: 2, received: 3 }
  },
  customItems: [{ name: 'Beach <blanket>', delivered: 2, received: 1 }]
};

test('distinguishes pending, matching, and mismatched returns', () => {
  assert.equal(isLaundryMismatch_(pending, getLaundryDisparities_(pending)), false);
  assert.equal(isLaundryMismatch_(mismatched, getLaundryDisparities_(mismatched)), true);
  const matched = {
    ...mismatched,
    items: {
      bathTowel: { delivered: 4, received: 4 },
      pillowCases: { delivered: 2, received: 2 }
    },
    customItems: [{ name: 'Beach blanket', delivered: 2, received: 2 }]
  };
  assert.equal(isLaundryMismatch_(matched, getLaundryDisparities_(matched)), false);
});

test('lists exact missing and extra standard and custom items', () => {
  const disparities = getLaundryDisparities_(mismatched);
  assert.deepEqual(
    JSON.parse(JSON.stringify(disparities.map(({ name, missing, extra }) => ({ name, missing, extra })))),
    [
      { name: 'Toalha de banho', missing: 1, extra: 0 },
      { name: 'Fronha', missing: 0, extra: 1 },
      { name: 'Beach <blanket>', missing: 1, extra: 0 }
    ]
  );
});

test('builds a safe Portuguese alert email', () => {
  const record = { ...mismatched, propertyName: 'Villa <Ocean>\r\nBcc: bad@example.com' };
  const email = createLaundryDisparityEmail_(record, getLaundryDisparities_(record), ['admin@example.com']);
  assert.match(email.subject, /Villa <Ocean> Bcc:/);
  assert.doesNotMatch(email.subject, /[\r\n]/);
  assert.match(email.text, /Rita/);
  assert.match(email.text, /1 a mais/);
  assert.match(email.html, /Villa &lt;Ocean&gt;/);
  assert.match(email.html, /Beach &lt;blanket&gt;/);
  assert.doesNotMatch(email.html, /Beach <blanket>/);
});

test('normalizes recipients and creates a stable per-record delivery path', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(normalizeLaundryRecipients_([' ADMIN@example.com ', 'admin@example.com', 'bad']))),
    ['admin@example.com']
  );
  assert.equal(laundryDeliveryPath_('record-1'), laundryDeliveryPath_('record-1'));
  assert.notEqual(laundryDeliveryPath_('record-1'), laundryDeliveryPath_('record-2'));
});
