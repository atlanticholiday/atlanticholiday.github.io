import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class VehiclesManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId || null;
    this.vehicles = [];
    this.filtered = [];
    this.unsubscribe = null;

    // UI state
    this.currentCategoryFilter = '';
    this.searchQuery = '';
    this.sortKey = 'model';
    this.sortDir = 'asc';

    // Build UI skeleton when page opens
    document.addEventListener('vehiclesPageOpened', () => {
      this.render();
    });

    // Only start when both DB and user are available
    if (this.db && this.userId) {
      this.startListening();
    }
  }

  getCollectionRef() {
    if (!this.db || !this.userId) return null;
    return collection(this.db, `users/${this.userId}/vehicles`);
  }

  startListening() {
    const colRef = this.getCollectionRef();
    if (!colRef) return; // guard until ready
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onSnapshot(colRef, (snapshot) => {
      this.vehicles = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      console.info('[Vehicles] Snapshot size:', snapshot.size, 'userId:', this.userId);
      this.render();
    }, (err) => console.error('Vehicles listener error:', err));
  }

  stopListening() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  async addVehicle(vehicle) {
    const now = new Date();
    const colRef = this.getCollectionRef();
    if (!colRef) throw new Error('VehiclesManager not initialized with user/database');
    await addDoc(colRef, {
      category: vehicle.category || 'car',
      model: vehicle.model || '',
      plate: vehicle.plate || '',
      insurance: {
        company: vehicle.insurance?.company || '',
        policyName: vehicle.insurance?.policyName || '',
        expiryDate: vehicle.insurance?.expiryDate || null,
        driveUrl: vehicle.insurance?.driveUrl || ''
      },
      inspection: {
        expiryDate: vehicle.inspection?.expiryDate || null
      },
      maintenance: vehicle.maintenance || [], // [{date, description, cost, odometer, workshop}]
      notes: vehicle.notes || '',
      ownerUid: this.userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  async updateVehicle(id, updates) {
    if (!this.db || !this.userId) throw new Error('VehiclesManager not initialized with user/database');
    const ref = doc(this.db, `users/${this.userId}/vehicles`, id);
    await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() });
  }

  async deleteVehicle(id) {
    if (!confirm('Delete this vehicle?')) return;
    if (!this.db || !this.userId) { alert('Not signed in'); return; }
    try {
      const ref = doc(this.db, `users/${this.userId}/vehicles`, id);
      await deleteDoc(ref);
    } catch (err) {
      console.error('Failed to delete vehicle:', err);
      alert(`Failed to delete vehicle: ${err?.message || err}`);
    }
  }

  // UI helpers
  applyFilters() {
    const q = this.searchQuery.trim().toLowerCase();
    this.filtered = this.vehicles.filter(v => {
      const matchesCat = this.currentCategoryFilter ? (v.category === this.currentCategoryFilter) : true;
      const hay = `${v.model || ''} ${v.plate || ''} ${v.insurance?.company || ''}`.toLowerCase();
      const matchesSearch = q ? hay.includes(q) : true;
      return matchesCat && matchesSearch;
    });
    const factor = this.sortDir === 'asc' ? 1 : -1;
    this.filtered.sort((a,b) => {
      const ka = (a[this.sortKey] || '').toString().toLowerCase();
      const kb = (b[this.sortKey] || '').toString().toLowerCase();
      if (ka < kb) return -1 * factor;
      if (ka > kb) return 1 * factor;
      return 0;
    });
  }

  render() {
    const page = document.getElementById('vehicles-page');
    if (!page) return;

    // Ensure a root container exists
    let root = document.getElementById('vehicles-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vehicles-root';
      root.className = 'container mx-auto px-4 py-8 max-w-7xl';
      page.appendChild(root);
    }

    this.applyFilters();

    root.innerHTML = `
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 modal-content">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div class="flex gap-2">
            <button id="veh-toggle-add" class="btn-primary px-4 py-2 rounded-md hover-lift">
              <i class="fas fa-plus mr-2"></i>Add Vehicle
            </button>
          </div>
          <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div>
              <select id="veh-category-filter" class="p-3 border rounded-md focus-ring">
                <option value="">All categories</option>
                <option value="car">Car</option>
                <option value="moto">Moto</option>
                <option value="van">Van</option>
                <option value="scooter">Scooter</option>
              </select>
            </div>
            <div class="relative sm:w-80 w-full">
              <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input id="veh-search" placeholder="Search by model, plate, company..." class="pl-10 pr-4 py-3 border rounded-md focus-ring w-full" />
            </div>
          </div>
        </div>
        <div id="veh-add-box" class="hidden mt-4 border rounded-md p-4 bg-gray-50">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <select id="veh-add-category" class="p-3 border rounded-md focus-ring">
              <option value="car">Car</option>
              <option value="moto">Moto</option>
              <option value="van">Van</option>
              <option value="scooter">Scooter</option>
            </select>
            <input id="veh-add-model" class="p-3 border rounded-md focus-ring" placeholder="Model (e.g. Zoe)" />
            <input id="veh-add-plate" class="p-3 border rounded-md focus-ring" placeholder="Plate (e.g. BC-03-XU)" />
            <button id="veh-add-save" class="btn-primary px-4 py-2 rounded-md hover-lift"><i class="fas fa-save mr-2"></i>Save</button>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-md p-0 overflow-x-auto modal-content">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plate</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Insurance</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inspection</th>
              <th class="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody id="veh-tbody" class="bg-white divide-y divide-gray-200"></tbody>
        </table>
        <div id="veh-empty" class="hidden p-6 text-center text-gray-500">
          No vehicles yet. Use "Add Vehicle" to create one.
        </div>
      </div>
    `;

    // Fill table
    const tbody = root.querySelector('#veh-tbody');
    const empty = root.querySelector('#veh-empty');
    if (this.filtered.length === 0) {
      empty.classList.remove('hidden');
      tbody.innerHTML = '';
      console.info('[Vehicles] Render: no items after filter');
    } else {
      empty.classList.add('hidden');
      tbody.innerHTML = this.filtered.map(v => this.rowHtml(v)).join('');
      console.info('[Vehicles] Rendered rows:', this.filtered.length);
    }

    // Wire events
    root.querySelector('#veh-toggle-add').onclick = () => {
      root.querySelector('#veh-add-box').classList.toggle('hidden');
    };
    root.querySelector('#veh-add-save').onclick = async () => {
      const category = root.querySelector('#veh-add-category').value;
      const model = root.querySelector('#veh-add-model').value.trim();
      const plate = root.querySelector('#veh-add-plate').value.trim();
      if (!model || !plate) { alert('Please provide model and plate'); return; }
      try {
        await this.addVehicle({ category, model, plate });
        root.querySelector('#veh-add-model').value = '';
        root.querySelector('#veh-add-plate').value = '';
        root.querySelector('#veh-add-box').classList.add('hidden');
      } catch (err) {
        console.error('Failed to add vehicle:', err);
        alert(`Failed to add vehicle: ${err?.message || err}`);
      }
    };
    root.querySelector('#veh-category-filter').onchange = (e) => {
      this.currentCategoryFilter = e.target.value;
      this.render();
    };
    root.querySelector('#veh-search').oninput = (e) => {
      this.searchQuery = e.target.value;
      this.render();
    };

    // Row button events
    tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteVehicle(btn.dataset.id));
    });
    tbody.querySelectorAll('[data-action="open-insurance"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = this.vehicles.find(x => x.id === btn.dataset.id);
        const url = v?.insurance?.driveUrl;
        if (url) window.open(url, '_blank');
      });
    });
  }

  rowHtml(v) {
    const insurance = v.insurance || {};
    const insp = v.inspection || {};

    const insExpiry = this.formatDate(insurance.expiryDate);
    const inspExpiry = this.formatDate(insp.expiryDate);

    return `
      <tr>
        <td class="px-4 py-3 whitespace-nowrap">${this.badge(v.category)}</td>
        <td class="px-4 py-3 whitespace-nowrap">${v.model || ''}</td>
        <td class="px-4 py-3 whitespace-nowrap font-mono">${v.plate || ''}</td>
        <td class="px-4 py-3 whitespace-nowrap">
          <div class="text-sm">${insurance.company || ''} ${insurance.policyName ? `- ${insurance.policyName}` : ''}</div>
          <div class="text-xs">Expiry: ${insExpiry || '—'}</div>
          ${insurance.driveUrl ? `<button data-action="open-insurance" data-id="${v.id}" class="text-blue-600 text-xs hover:underline">Open policy</button>` : ''}
        </td>
        <td class="px-4 py-3 whitespace-nowrap">${this.expiryBadge(insp.expiryDate)}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          <button data-action="edit" data-id="${v.id}" class="text-sm text-brand hover:underline mr-3">Edit</button>
          <button data-action="delete" data-id="${v.id}" class="text-sm text-red-600 hover:underline">Delete</button>
        </td>
      </tr>
    `;
  }

  badge(cat) {
    const map = { car: 'bg-blue-100 text-blue-800', moto: 'bg-green-100 text-green-800', van: 'bg-purple-100 text-purple-800', scooter: 'bg-yellow-100 text-yellow-800' };
    const cls = map[cat] || 'bg-gray-100 text-gray-800';
    return `<span class="px-2 py-1 rounded-full text-xs ${cls}">${(cat || 'other')}</span>`;
  }

  expiryBadge(ts) {
    if (!ts) return '<span class="text-gray-500 text-sm">—</span>';
    const d = (ts?.toDate) ? ts.toDate() : new Date(ts);
    const days = Math.ceil((d - new Date()) / (1000*60*60*24));
    let cls = 'bg-green-100 text-green-800';
    let text = this.formatDate(ts);
    if (days <= 30 && days >= 0) { cls = 'bg-yellow-100 text-yellow-800'; }
    if (days < 0) { cls = 'bg-red-100 text-red-800'; }
    return `<span class="px-2 py-1 rounded-full text-xs ${cls}">${text}</span>`;
  }

  formatDate(ts) {
    if (!ts) return '';
    const d = (ts?.toDate) ? ts.toDate() : new Date(ts);
    return d.toISOString().slice(0,10);
  }

  // Auth/DB lifecycle helpers
  setDatabase(db) {
    this.db = db;
    // Restart listener if possible
    this.stopListening();
    if (this.db && this.userId) this.startListening();
  }

  setUser(userId) {
    this.userId = userId || null;
    // Restart listener to bind to user path
    this.stopListening();
    if (this.db && this.userId) this.startListening();
  }

  openEditModal(id) {
    const v = this.vehicles.find(x => x.id === id);
    if (!v) return;

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
    overlay.innerHTML = `
      <div class="bg-white w-full max-w-2xl rounded-lg shadow-lg p-6 modal-content">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold">Edit Vehicle</h3>
          <button id="veh-edit-close" class="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="text-xs text-gray-500">Category</label>
            <select id="veh-edit-category" class="w-full p-3 border rounded-md focus-ring">
              <option value="car">Car</option>
              <option value="moto">Moto</option>
              <option value="van">Van</option>
              <option value="scooter">Scooter</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500">Model</label>
            <input id="veh-edit-model" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Plate</label>
            <input id="veh-edit-plate" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Notes</label>
            <input id="veh-edit-notes" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div class="md:col-span-2 border-t pt-2"></div>
          <div>
            <label class="text-xs text-gray-500">Insurance Company</label>
            <input id="veh-ins-company" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Policy Name</label>
            <input id="veh-ins-policy" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Insurance Expiry</label>
            <input id="veh-ins-expiry" type="date" class="w-full p-3 border rounded-md focus-ring" />
          </div>
          <div>
            <label class="text-xs text-gray-500">Insurance Drive URL</label>
            <input id="veh-ins-url" class="w-full p-3 border rounded-md focus-ring" placeholder="https://drive.google.com/..." />
          </div>
          <div class="md:col-span-2 border-t pt-2"></div>
          <div>
            <label class="text-xs text-gray-500">Inspection Expiry</label>
            <input id="veh-insp-expiry" type="date" class="w-full p-3 border rounded-md focus-ring" />
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <button id="veh-edit-save" class="btn-primary px-4 py-2 rounded-md hover-lift"><i class="fas fa-save mr-2"></i>Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Populate
    overlay.querySelector('#veh-edit-category').value = v.category || 'car';
    overlay.querySelector('#veh-edit-model').value = v.model || '';
    overlay.querySelector('#veh-edit-plate').value = v.plate || '';
    overlay.querySelector('#veh-edit-notes').value = v.notes || '';
    overlay.querySelector('#veh-ins-company').value = v.insurance?.company || '';
    overlay.querySelector('#veh-ins-policy').value = v.insurance?.policyName || '';
    overlay.querySelector('#veh-ins-expiry').value = this.formatDate(v.insurance?.expiryDate) || '';
    overlay.querySelector('#veh-ins-url').value = v.insurance?.driveUrl || '';
    overlay.querySelector('#veh-insp-expiry').value = this.formatDate(v.inspection?.expiryDate) || '';

    overlay.querySelector('#veh-edit-close').onclick = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#veh-edit-save').onclick = async () => {
      const payload = {
        category: overlay.querySelector('#veh-edit-category').value,
        model: overlay.querySelector('#veh-edit-model').value.trim(),
        plate: overlay.querySelector('#veh-edit-plate').value.trim(),
        notes: overlay.querySelector('#veh-edit-notes').value.trim(),
        insurance: {
          company: overlay.querySelector('#veh-ins-company').value.trim(),
          policyName: overlay.querySelector('#veh-ins-policy').value.trim(),
          expiryDate: overlay.querySelector('#veh-ins-expiry').value ? new Date(overlay.querySelector('#veh-ins-expiry').value) : null,
          driveUrl: overlay.querySelector('#veh-ins-url').value.trim()
        },
        inspection: {
          expiryDate: overlay.querySelector('#veh-insp-expiry').value ? new Date(overlay.querySelector('#veh-insp-expiry').value) : null
        }
      };
      try {
        await this.updateVehicle(v.id, payload);
        overlay.remove();
      } catch (err) {
        console.error('Failed to save vehicle:', err);
        alert(`Failed to save vehicle: ${err?.message || err}`);
      }
    };
  }
}
