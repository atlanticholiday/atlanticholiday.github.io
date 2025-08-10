import { collection, doc, onSnapshot, getDoc, addDoc, updateDoc, serverTimestamp, arrayUnion, arrayRemove, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Firestore schema proposal (implemented progressively):
// Collection: owners (shared)
//   doc: { id, displayName, ownerNumber, properties: [propertyId], notes, createdAt, updatedAt }
//   subcollection: secure
//     doc 'sensitive': {
//       payments: { source: 'Sheets'|'Avantio'|'Other', name, vat, iban, notes },
//       emails: [ { cc, subject, htmlBody } ],
//       updatedAt
//     }
export class OwnersManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId || null;
    this.owners = [];
    this.properties = [];
    this.filtered = [];
    this.unsubscribe = null;
    this.propsUnsub = null;

    this.searchQuery = '';
    this.selectedOwnerId = null;
    this.selectedSensitive = null; // cached secure doc
    this.activeDetailTab = 'payments';
    this.loadingSensitive = false;
    // Inline edit state
    this.editingPayments = false;
    this.paymentsDraft = null; // {source, name, vat, iban, notes}
    this.editingEmailIndex = null; // null when not editing; -1 for new
    this.emailDraft = null; // {cc, subject, htmlBody}

    document.addEventListener('ownersPageOpened', () => {
      this.render();
      // Start listening lazily if not started yet
      if (!this.unsubscribe) this.startListening();
      if (!this.propsUnsub) this.startPropsListening();
    });

    if (this.db) {
      // Defer listening until first open to minimize reads
    }
  }

  setUser(userId) {
    this.userId = userId;
  }

  setDatabase(db) {
    this.db = db;
  }

  getCollectionRef() {
    if (!this.db) return null;
    return collection(this.db, 'owners');
  }

  getPropertiesRef() {
    if (!this.db) return null;
    return collection(this.db, 'properties');
  }

  startListening() {
    const ref = this.getCollectionRef();
    if (!ref) return;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onSnapshot(ref, (snapshot) => {
      this.owners = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this.render();
    }, (err) => console.error('[Owners] listener error:', err));
  }

  startPropsListening() {
    const ref = this.getPropertiesRef();
    if (!ref) return;
    if (this.propsUnsub) this.propsUnsub();
    this.propsUnsub = onSnapshot(ref, (snapshot) => {
      this.properties = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      this.render();
    }, (err) => console.error('[Owners] properties listener error:', err));
  }

  stopListening() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    if (this.propsUnsub) { this.propsUnsub(); this.propsUnsub = null; }
  }

  applyFilters() {
    const q = this.searchQuery.trim().toLowerCase();
    this.filtered = this.owners.filter(o => {
      const props = (o.properties || []).join(' ');
      const hay = `${o.displayName || ''} ${o.ownerNumber || ''} ${props} ${o.notes || ''}`.toLowerCase();
      return q ? hay.includes(q) : true;
    });
  }

  async loadSensitive(ownerId) {
    if (!this.db || !ownerId) return null;
    try {
      this.loadingSensitive = true;
      // Re-render to show spinner
      const root = document.getElementById('owners-root');
      if (root) {
        // minimal non-blocking visual update
        root.querySelector('#owners-load-secure')?.setAttribute('disabled', 'true');
      }
      const ref = doc(this.db, `owners/${ownerId}/secure/sensitive`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        this.selectedSensitive = snap.data();
      } else {
        this.selectedSensitive = null;
      }
    } catch (e) {
      console.warn('[Owners] failed to load sensitive subdoc:', e);
      this.selectedSensitive = null;
    }
    this.loadingSensitive = false;
  }

  async ensureOwner(owner) {
    // Minimal helper to add a new owner
    const ref = this.getCollectionRef();
    if (!ref) throw new Error('Database not ready');
    const newRef = await addDoc(ref, {
      displayName: owner.displayName || '',
      ownerNumber: owner.ownerNumber || '',
      properties: owner.properties || [],
      notes: owner.notes || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return newRef.id;
  }

  async updateOwner(id, updates) {
    if (!this.db) throw new Error('Database not ready');
    const ownerRef = doc(this.db, 'owners', id);
    await updateDoc(ownerRef, { ...updates, updatedAt: serverTimestamp() });
  }

  ownerRowHtml(o) {
    const props = (o.properties || []).join(', ');
    return `
      <tr>
        <td class="px-4 py-3 text-sm text-gray-700">${o.ownerNumber || ''}</td>
        <td class="px-4 py-3 text-sm font-medium text-gray-900">${o.displayName || ''}</td>
        <td class="px-4 py-3 text-sm text-gray-500">${props}</td>
        <td class="px-4 py-3 text-right">
          <button data-action="select" data-id="${o.id}" class="text-blue-600 hover:underline text-sm">Open</button>
        </td>
      </tr>
    `;
  }

  ownerForProperty(p) {
    if (!p) return null;
    // Prefer direct ownerId on property
    const byId = p.ownerId ? (this.owners.find(o => o.id === p.ownerId) || null) : null;
    if (byId) return byId;
    // Fallback: look for owner referencing this property id
    const byList = this.owners.find(o => Array.isArray(o.properties) && o.properties.includes(p.id)) || null;
    return byList || null;
  }

  ownerOptionsHtml(currentId) {
    const owners = [...this.owners].sort((a,b) => (a.displayName || '').localeCompare(b.displayName || ''));
    const opts = [
      `<option value="" ${!currentId ? 'selected' : ''}>Unassigned</option>`,
      ...owners.map(o => `<option value="${o.id}" ${currentId === o.id ? 'selected' : ''}>${(o.displayName || '').replace(/</g,'&lt;')} ${o.ownerNumber ? '('+o.ownerNumber+')' : ''}</option>`),
      `<option value="__NEW__">+ Create new owner…</option>`
    ];
    return opts.join('');
  }

  async changePropertyOwner(propId, newOwnerId) {
    if (!this.db) return;
    const prop = this.properties.find(p => p.id === propId);
    if (!prop) return;
    const prevOwner = this.ownerForProperty(prop);
    const prevOwnerId = prevOwner ? prevOwner.id : (prop.ownerId || null);
    try {
      await updateDoc(doc(this.db, 'properties', propId), { ownerId: newOwnerId || null });
    } catch (e) {
      console.warn('[Owners] Failed to update property ownerId:', e);
      alert('Failed to set owner on property.');
      return;
    }
    if (prevOwnerId && prevOwnerId !== newOwnerId) {
      try {
        await updateDoc(doc(this.db, 'owners', prevOwnerId), { properties: arrayRemove(propId), updatedAt: serverTimestamp() });
      } catch (e) {
        console.warn('[Owners] non-fatal: failed to remove property from previous owner:', e);
      }
    }
    if (newOwnerId) {
      try {
        await updateDoc(doc(this.db, 'owners', newOwnerId), { properties: arrayUnion(propId), updatedAt: serverTimestamp() });
      } catch (e) {
        console.warn('[Owners] non-fatal: failed to add property to new owner:', e);
      }
    }
    this.render();
  }

  propertyRowHtml(p) {
    const title = p.displayName || p.name || p.title || p.reference || p.code || p.avantioId || p.id;
    const code = p.code || p.reference || p.avantioId || '';
    const owner = this.ownerForProperty(p);
    const currentOwnerId = owner ? owner.id : (p.ownerId || '');
    return `
      <tr>
        <td class="px-4 py-3 text-sm text-gray-700">${code}</td>
        <td class="px-4 py-3 text-sm font-medium text-gray-900">${title}</td>
        <td class="px-4 py-3 text-sm text-gray-600">
          <select class="owner-select border rounded px-2 py-1" data-prop-id="${p.id}">
            ${this.ownerOptionsHtml(currentOwnerId)}
          </select>
        </td>
        <td class="px-4 py-3 text-right"></td>
      </tr>
    `;
  }

  async createSensitive(ownerId) {
    if (!this.db || !ownerId) return;
    const ref = doc(this.db, `owners/${ownerId}/secure/sensitive`);
    await setDoc(ref, { payments: {}, emails: [], updatedAt: serverTimestamp() }, { merge: true });
  }

  async editPayments() {
    if (!this.selectedOwnerId) return;
    const p = this.selectedSensitive?.payments || {};
    this.editingPayments = true;
    this.paymentsDraft = { source: p.source || '', name: p.name || '', vat: p.vat || '', iban: p.iban || '', notes: p.notes || '' };
    this.render();
  }

  async savePayments() {
    if (!this.selectedOwnerId || !this.paymentsDraft) return;
    try {
      await setDoc(doc(this.db, `owners/${this.selectedOwnerId}/secure/sensitive`), {
        payments: { ...this.paymentsDraft },
        updatedAt: serverTimestamp()
      }, { merge: true });
      this.editingPayments = false;
      this.paymentsDraft = null;
      await this.loadSensitive(this.selectedOwnerId);
      this.render();
    } catch (e) {
      console.warn('[Owners] save payments failed:', e);
      alert('Could not save payments.');
    }
  }

  cancelPayments() {
    this.editingPayments = false;
    this.paymentsDraft = null;
    this.render();
  }

  async addEmail() {
    if (!this.selectedOwnerId) return;
    this.editingEmailIndex = -1;
    this.emailDraft = { cc: '', subject: '', htmlBody: '' };
    this.render();
  }

  async editEmail(index) {
    if (!this.selectedOwnerId) return;
    const curr = (this.selectedSensitive?.emails || [])[index] || { cc: '', subject: '', htmlBody: '' };
    this.editingEmailIndex = index;
    this.emailDraft = { cc: curr.cc || '', subject: curr.subject || '', htmlBody: curr.htmlBody || '' };
    this.render();
  }

  async saveEmail() {
    if (!this.selectedOwnerId || this.emailDraft == null || this.editingEmailIndex == null) return;
    const emails = Array.isArray(this.selectedSensitive?.emails) ? [...this.selectedSensitive.emails] : [];
    if (this.editingEmailIndex === -1) {
      emails.push({ ...this.emailDraft });
    } else {
      emails[this.editingEmailIndex] = { ...this.emailDraft };
    }
    try {
      await setDoc(doc(this.db, `owners/${this.selectedOwnerId}/secure/sensitive`), {
        emails,
        updatedAt: serverTimestamp()
      }, { merge: true });
      this.editingEmailIndex = null;
      this.emailDraft = null;
      await this.loadSensitive(this.selectedOwnerId);
      this.render();
    } catch (e) {
      console.warn('[Owners] save email failed:', e);
      alert('Could not save email.');
    }
  }

  cancelEmailEdit() {
    this.editingEmailIndex = null;
    this.emailDraft = null;
    this.render();
  }

  async deleteEmail(index) {
    if (!this.selectedOwnerId) return;
    if (!confirm('Delete this email template?')) return;
    const emails = Array.isArray(this.selectedSensitive?.emails) ? [...this.selectedSensitive.emails] : [];
    emails.splice(index, 1);
    try {
      await setDoc(doc(this.db, `owners/${this.selectedOwnerId}/secure/sensitive`), {
        emails,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await this.loadSensitive(this.selectedOwnerId);
      this.render();
    } catch (e) {
      console.warn('[Owners] delete email failed:', e);
      alert('Could not delete email.');
    }
  }

  async deleteOwner() {
    if (!this.selectedOwnerId) return;
    const ownerId = this.selectedOwnerId;
    const ok = confirm('Delete this owner? Properties assigned to this owner will be unassigned.');
    if (!ok) return;
    try {
      // Unassign properties pointing to this owner
      const affected = (this.properties || []).filter(p => p.ownerId === ownerId);
      for (const p of affected) {
        try { await updateDoc(doc(this.db, 'properties', p.id), { ownerId: null }); } catch (e) { console.warn('[Owners] unassign property failed:', e); }
      }
      // Delete secure doc if exists
      try { await deleteDoc(doc(this.db, `owners/${ownerId}/secure/sensitive`)); } catch(_) {}
      // Delete owner document
      await deleteDoc(doc(this.db, 'owners', ownerId));
      this.selectedOwnerId = null;
      this.selectedSensitive = null;
      this.render();
    } catch (e) {
      console.warn('[Owners] delete owner failed:', e);
      alert('Could not delete owner.');
    }
  }

  render() {
    const page = document.getElementById('owners-page');
    if (!page) return;

    let root = document.getElementById('owners-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'owners-root';
      root.className = 'container mx-auto px-4 py-8 max-w-7xl';
      page.appendChild(root);
    }

    this.applyFilters();

    const selected = this.owners.find(o => o.id === this.selectedOwnerId) || null;
    const sensitive = this.selectedSensitive;

    root.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white rounded-xl shadow-md p-6 modal-content">
          <div class="flex flex-col sm:flex-row justify-between gap-3 mb-4">
            <div class="relative sm:w-96 w-full">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input id="owners-search" placeholder="Search by name or number..." class="pl-10 pr-4 py-3 border rounded-md focus-ring w-full" value="${this.searchQuery}" />
            </div>
            <div>
              <button id="owners-add" class="btn-primary px-4 py-2 rounded-md hover-lift"><i class="fas fa-user-plus mr-2"></i>Add Owner</button>
            </div>
          </div>
          <div class="bg-white rounded-xl border overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No.</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Properties</th>
                  <th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody id="owners-tbody" class="bg-white divide-y divide-gray-200"></tbody>
            </table>
            <div id="owners-empty" class="hidden p-6 text-center text-gray-500">No owners yet.</div>
          </div>

          <div class="mt-8">
            <h3 class="text-md font-semibold mb-3">Properties</h3>
            <div class="bg-white rounded-xl border overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Property</th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                    <th class="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody id="properties-tbody" class="bg-white divide-y divide-gray-200"></tbody>
              </table>
              <div id="properties-empty" class="hidden p-6 text-center text-gray-500">No properties found.</div>
            </div>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-md p-6 modal-content">
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-lg font-semibold">Details</h3>
            <div class="flex items-center gap-2">
              ${sensitive ? `<span class="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800 border border-amber-200">Confidential</span>` : ''}
              ${selected ? `<button id="owners-delete" class="px-2 py-1 text-xs rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">Delete Owner</button>` : ''}
            </div>
          </div>
          ${selected ? `
          <div class="mb-4 grid grid-cols-2 gap-4">
            <div>
              <div class="text-sm text-gray-500">Owner Number</div>
              <div class="font-medium">${selected.ownerNumber || ''}</div>
            </div>
            <div>
              <div class="text-sm text-gray-500">Name</div>
              <div class="font-medium">${selected.displayName || ''}</div>
            </div>
          </div>
          <div class="mb-4 flex items-center gap-2">
            <button id="owners-load-secure" class="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200">Load Payments & Emails</button>
            ${sensitive ? `<span class="text-xs text-gray-500">Loaded</span>` : ''}
          </div>
          ${this.loadingSensitive ? `
            <div class="text-sm text-gray-500">Loading secure data…</div>
          ` : sensitive ? `
            <div class="border-b mb-4 flex gap-2">
              <button data-tab="payments" class="owners-tab px-3 py-2 text-sm rounded-t-md ${this.activeDetailTab === 'payments' ? 'bg-gray-100 font-medium' : 'text-gray-600 hover:bg-gray-50'}">Payments</button>
              <button data-tab="emails" class="owners-tab px-3 py-2 text-sm rounded-t-md ${this.activeDetailTab === 'emails' ? 'bg-gray-100 font-medium' : 'text-gray-600 hover:bg-gray-50'}">Property Emails</button>
            </div>
            ${this.activeDetailTab === 'payments' ? `
              ${this.editingPayments ? `
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Source</label>
                      <select id="pay-source" class="w-full border rounded px-2 py-1">
                        <option value="Sheets" ${((this.paymentsDraft?.source||'')==='Sheets')?'selected':''}>Sheets</option>
                        <option value="Avantio" ${((this.paymentsDraft?.source||'')==='Avantio')?'selected':''}>Avantio</option>
                        <option value="Other" ${((this.paymentsDraft?.source||'')==='Other')?'selected':''}>Other</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">Account Holder Name</label>
                      <input id="pay-name" class="w-full border rounded px-2 py-1" value="${(this.paymentsDraft?.name||'').replace(/"/g,'&quot;')}">
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">VAT</label>
                      <input id="pay-vat" class="w-full border rounded px-2 py-1" value="${(this.paymentsDraft?.vat||'').replace(/"/g,'&quot;')}">
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">IBAN</label>
                      <input id="pay-iban" class="w-full border rounded px-2 py-1" value="${(this.paymentsDraft?.iban||'').replace(/"/g,'&quot;')}">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">Important Notes</label>
                    <textarea id="pay-notes" rows="3" class="w-full border rounded px-2 py-1">${(this.paymentsDraft?.notes||'')}</textarea>
                  </div>
                  <div class="pt-2 flex gap-2">
                    <button id="owners-save-payments" class="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
                    <button id="owners-cancel-payments" class="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Cancel</button>
                  </div>
                </div>
              ` : `
                <div class="space-y-2">
                  <div class="text-sm text-gray-600">Source: ${sensitive.payments?.source || ''}</div>
                  <div class="text-sm">Name: ${sensitive.payments?.name || ''}</div>
                  <div class="text-sm flex items-center gap-2">VAT: <span>${sensitive.payments?.vat || ''}</span>
                    ${sensitive.payments?.vat ? `<button data-action="copy-payment" data-field="vat" class="text-blue-600 hover:underline text-xs">Copy</button>` : ''}
                  </div>
                  <div class="text-sm flex items-center gap-2">IBAN: <span>${sensitive.payments?.iban || ''}</span>
                    ${sensitive.payments?.iban ? `<button data-action\="copy-payment\" data-field\="iban" class\="text-blue-600 hover:underline text-xs">Copy</button>` : ''}
                  </div>
                  <div class="text-sm">Notes: ${sensitive.payments?.notes || ''}</div>
                  <div class="pt-2"><button id="owners-edit-payments" class="text-blue-600 hover:underline text-sm">Edit Payments</button></div>
                </div>
              `}
            ` : `
              ${this.editingEmailIndex !== null ? `
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3">
                    <div class="col-span-2">
                      <label class="block text-xs text-gray-500 mb-1">CC (comma separated)</label>
                      <input id="email-cc" class="w-full border rounded px-2 py-1" value="${(this.emailDraft?.cc||'').replace(/"/g,'&quot;')}">
                    </div>
                    <div class="col-span-2">
                      <label class="block text-xs text-gray-500 mb-1">Subject</label>
                      <input id="email-subject" class="w-full border rounded px-2 py-1" value="${(this.emailDraft?.subject||'').replace(/"/g,'&quot;')}">
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">HTML Body</label>
                    <textarea id="email-body" rows="8" class="w-full border rounded px-2 py-1">${(this.emailDraft?.htmlBody||'')}</textarea>
                  </div>
                  <div class="pt-2 flex gap-2">
                    <button id="owners-save-email" class="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
                    <button id="owners-cancel-email" class="px-3 py-1.5 text-sm rounded bg-gray-100 hover:bg-gray-200">Cancel</button>
                  </div>
                </div>
              ` : `
                <div>
                  <div class="mb-2"><button id="owners-add-email" class="text-blue-600 hover:underline text-sm">Add Email</button></div>
                  ${(sensitive.emails || []).length === 0 ? `<div class="text-sm text-gray-500">No email templates.</div>` : ''}
                  ${(sensitive.emails || []).map((e,i) => `
                    <div class="border rounded-md p-3 mb-3">
                      <div class="text-sm text-gray-600">CC: ${e.cc || ''} ${e.cc ? `<button data-action="copy-email-cc" data-index="${i}" class="ml-1 text-blue-600 hover:underline text-xs">Copy CC</button>` : ''}</div>
                      <div class="text-sm font-medium">${e.subject || ''} ${e.subject ? `<button data-action=\"copy-email-subject\" data-index=\"${i}\" class=\"ml-1 text-blue-600 hover:underline text-xs\">Copy Subject</button>` : ''}</div>
                      <div class="prose max-w-none text-sm bg-gray-50 p-2 rounded">
                        ${e.htmlBody || ''}
                      </div>
                      <div class="mt-2 flex gap-3 flex-wrap">
                        <button data-action="copy-email" data-index="${i}" class="text-blue-600 hover:underline text-sm">Copy HTML</button>
                        <button data-action="copy-email-text" data-index="${i}" class="text-blue-600 hover:underline text-sm">Copy Text</button>
                        <button data-action="edit-email" data-index="${i}" class="text-blue-600 hover:underline text-sm">Edit</button>
                        <button data-action="delete-email" data-index="${i}" class="text-red-600 hover:underline text-sm">Delete</button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            `}
          ` : `
            <div class="text-gray-500 text-sm">No secure data yet.</div>
            <div class="mt-2"><button id="owners-create-secure" class="text-blue-600 hover:underline text-sm">Create secure info</button></div>
          `}
          ` : `<div class="text-gray-500 text-sm">Select an owner to view details.</div>`}
        </div>
      </div>
    `;

    // Wire events
    const tbody = root.querySelector('#owners-tbody');
    const empty = root.querySelector('#owners-empty');
    if (this.filtered.length === 0) {
      empty.classList.remove('hidden');
      tbody.innerHTML = '';
    } else {
      empty.classList.add('hidden');
      tbody.innerHTML = this.filtered.map(o => this.ownerRowHtml(o)).join('');
    }

    // Render properties list
    const ptbody = root.querySelector('#properties-tbody');
    const pempty = root.querySelector('#properties-empty');
    if (ptbody && pempty) {
      if (!this.properties || this.properties.length === 0) {
        pempty.classList.remove('hidden');
        ptbody.innerHTML = '';
      } else {
        pempty.classList.add('hidden');
        ptbody.innerHTML = this.properties.map(p => this.propertyRowHtml(p)).join('');
      }
    }

    const searchEl = root.querySelector('#owners-search');
    if (searchEl) searchEl.oninput = (e) => { this.searchQuery = e.target.value; this.render(); };

    const addBtn = root.querySelector('#owners-add');
    if (addBtn) {
      addBtn.onclick = async () => {
        try {
          const displayName = (prompt('Owner Name (First Last):') || '').trim();
          if (!displayName) return;
          const ownerNumber = (prompt('Owner Number (optional):') || '').trim();
          await this.ensureOwner({ displayName, ownerNumber });
        } catch (e) {
          console.warn('[Owners] Add owner failed:', e);
          alert('Could not add owner.');
        }
      };
    }

    tbody.querySelectorAll('[data-action="select"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.selectedOwnerId = btn.dataset.id;
        this.selectedSensitive = null;
        this.activeDetailTab = 'payments';
        // reset edit states when switching owners
        this.editingPayments = false;
        this.paymentsDraft = null;
        this.editingEmailIndex = null;
        this.emailDraft = null;
        this.render();
      });
    });

    // Owner dropdown change handler per property
    root.querySelectorAll('select.owner-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const propId = sel.getAttribute('data-prop-id');
        let val = sel.value;
        if (val === '__NEW__') {
          try {
            const displayName = (prompt('New owner name (First Last):') || '').trim();
            if (!displayName) { sel.value = ''; return; }
            const ownerNumber = (prompt('Owner number (optional):') || '').trim();
            const newId = await this.ensureOwner({ displayName, ownerNumber });
            val = newId;
            // refresh options to include the newly created owner
            sel.innerHTML = this.ownerOptionsHtml(val);
          } catch (e) {
            console.warn('[Owners] quick-create owner failed:', e);
            alert('Could not create owner.');
            sel.value = '';
            return;
          }
        }
        await this.changePropertyOwner(propId, val || null);
      });
    });

    const loadBtn = root.querySelector('#owners-load-secure');
    if (loadBtn && this.selectedOwnerId) {
      loadBtn.onclick = async () => {
        await this.loadSensitive(this.selectedOwnerId);
        this.render();
      };
    }

    // Tabs
    root.querySelectorAll('.owners-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tab = btn.getAttribute('data-tab');
        if (!tab || (tab !== 'payments' && tab !== 'emails')) return;
        if (!this.selectedSensitive && this.selectedOwnerId) {
          await this.loadSensitive(this.selectedOwnerId);
        }
        this.activeDetailTab = tab;
        this.render();
      });
    });

    // Copy actions for payments
    root.querySelectorAll('[data-action="copy-payment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.getAttribute('data-field');
        const val = this.selectedSensitive?.payments?.[field] || '';
        if (!val) return;
        navigator.clipboard.writeText(String(val)).catch(() => {});
      });
    });

    // Copy actions for email extras
    root.querySelectorAll('[data-action="copy-email-cc"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const cc = this.selectedSensitive?.emails?.[idx]?.cc || '';
        if (!cc) return;
        navigator.clipboard.writeText(cc).catch(() => {});
      });
    });

    root.querySelectorAll('[data-action="copy-email-subject"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const subject = this.selectedSensitive?.emails?.[idx]?.subject || '';
        if (!subject) return;
        navigator.clipboard.writeText(subject).catch(() => {});
      });
    });

    root.querySelectorAll('[data-action="copy-email-text"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const html = this.selectedSensitive?.emails?.[idx]?.htmlBody || '';
        if (!html) return;
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const text = temp.textContent || temp.innerText || '';
        navigator.clipboard.writeText(text).catch(() => {});
      });
    });

    root.querySelectorAll('[data-action="copy-email"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.index);
        const html = this.selectedSensitive?.emails?.[idx]?.htmlBody || '';
        if (!html) return;
        // Copy as HTML to clipboard
        const type = 'text/html';
        const blob = new Blob([html], { type });
        const data = [new ClipboardItem({ [type]: blob })];
        navigator.clipboard.write(data).catch(() => {
          // Fallback to plain text if HTML copy not permitted
          navigator.clipboard.writeText(html);
        });
      });
    });

    // Create secure doc shortcut
    const createSecureBtn = root.querySelector('#owners-create-secure');
    if (createSecureBtn && this.selectedOwnerId) {
      createSecureBtn.onclick = async () => {
        try {
          await this.createSensitive(this.selectedOwnerId);
          await this.loadSensitive(this.selectedOwnerId);
          this.render();
        } catch (e) {
          console.warn('[Owners] create secure failed:', e);
          alert('Could not create secure info.');
        }
      };
    }

    // Edit payments button
    const editPaymentsBtn = root.querySelector('#owners-edit-payments');
    if (editPaymentsBtn) {
      editPaymentsBtn.onclick = async () => { await this.editPayments(); };
    }

    // Save/Cancel payments
    const savePaymentsBtn = root.querySelector('#owners-save-payments');
    if (savePaymentsBtn) {
      savePaymentsBtn.onclick = async () => {
        const srcEl = root.querySelector('#pay-source');
        const nameEl = root.querySelector('#pay-name');
        const vatEl = root.querySelector('#pay-vat');
        const ibanEl = root.querySelector('#pay-iban');
        const notesEl = root.querySelector('#pay-notes');
        this.paymentsDraft = {
          source: (srcEl?.value || '').trim(),
          name: (nameEl?.value || '').trim(),
          vat: (vatEl?.value || '').trim(),
          iban: (ibanEl?.value || '').trim(),
          notes: (notesEl?.value || '').trim(),
        };
        await this.savePayments();
      };
    }
    const cancelPaymentsBtn = root.querySelector('#owners-cancel-payments');
    if (cancelPaymentsBtn) {
      cancelPaymentsBtn.onclick = () => { this.cancelPayments(); };
    }

    // Add email button
    const addEmailBtn = root.querySelector('#owners-add-email');
    if (addEmailBtn) {
      addEmailBtn.onclick = async () => { await this.addEmail(); };
    }

    // Edit email links
    root.querySelectorAll('[data-action="edit-email"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        await this.editEmail(idx);
      });
    });

    // Delete email links
    root.querySelectorAll('[data-action="delete-email"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.index);
        await this.deleteEmail(idx);
      });
    });

    // Delete owner button
    const deleteOwnerBtn = root.querySelector('#owners-delete');
    if (deleteOwnerBtn) {
      deleteOwnerBtn.onclick = async () => { await this.deleteOwner(); };
    }

    // Save/Cancel email editing
    const saveEmailBtn = root.querySelector('#owners-save-email');
    if (saveEmailBtn) {
      saveEmailBtn.onclick = async () => {
        const ccEl = root.querySelector('#email-cc');
        const subjEl = root.querySelector('#email-subject');
        const bodyEl = root.querySelector('#email-body');
        this.emailDraft = {
          cc: (ccEl?.value || '').trim(),
          subject: (subjEl?.value || '').trim(),
          htmlBody: bodyEl?.value || ''
        };
        await this.saveEmail();
      };
    }
    const cancelEmailBtn = root.querySelector('#owners-cancel-email');
    if (cancelEmailBtn) {
      cancelEmailBtn.onclick = () => { this.cancelEmailEdit(); };
    }
  }
}
