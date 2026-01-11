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
    const colRef = this.getCollectionRef();
    if (!colRef) throw new Error('VehiclesManager not initialized with user/database');
    await addDoc(colRef, {
      category: vehicle.category || 'car',
      model: vehicle.model || '',
      plate: vehicle.plate || '',
      fuelType: vehicle.fuelType || 'gasoline', // added
      year: vehicle.year || new Date().getFullYear(), // added
      insurance: {
        company: vehicle.insurance?.company || '',
        policyName: vehicle.insurance?.policyName || '',
        expiryDate: vehicle.insurance?.expiryDate || null,
        driveUrl: vehicle.insurance?.driveUrl || ''
      },
      inspection: {
        expiryDate: vehicle.inspection?.expiryDate || null,
        driveUrl: vehicle.inspection?.driveUrl || ''
      },
      maintenance: [], // [{id, date, title, cost, odometer, workshop, notes}]
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
    if (!confirm('Are you sure you want to delete this vehicle? This action cannot be undone.')) return;
    if (!this.db || !this.userId) { alert('Not signed in'); return; }
    try {
      const ref = doc(this.db, `users/${this.userId}/vehicles`, id);
      await deleteDoc(ref);
    } catch (err) {
      console.error('Failed to delete vehicle:', err);
      alert(`Failed to delete vehicle: ${err?.message || err}`);
    }
  }

  async addMaintenanceRecord(vehicleId, record) {
    if (!this.db || !this.userId) throw new Error('VehiclesManager not initialized');
    const v = this.vehicles.find(x => x.id === vehicleId);
    if (!v) return;

    const newRecord = {
      id: 'maint_' + Date.now(),
      date: record.date || new Date().toISOString(),
      title: record.title || 'Service',
      cost: parseFloat(record.cost) || 0,
      odometer: parseInt(record.odometer) || 0,
      workshop: record.workshop || '',
      notes: record.notes || ''
    };

    const updatedMaintenance = [...(v.maintenance || []), newRecord];
    await this.updateVehicle(vehicleId, { maintenance: updatedMaintenance });
  }

  async deleteMaintenanceRecord(vehicleId, recordId) {
    if (!confirm("Delete this maintenance record?")) return;
    const v = this.vehicles.find(x => x.id === vehicleId);
    if (!v) return;
    const updatedMaintenance = (v.maintenance || []).filter(r => r.id !== recordId);
    await this.updateVehicle(vehicleId, { maintenance: updatedMaintenance });
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

    // Sort
    this.filtered.sort((a, b) => {
      // specialized sort for inspection/insurance expiry needed? for now keep generic
      const va = (a[this.sortKey] || '').toString().toLowerCase();
      const vb = (b[this.sortKey] || '').toString().toLowerCase();
      if (this.sortDir === 'asc') return va.localeCompare(vb);
      return vb.localeCompare(va);
    });
  }

  getStats() {
    const total = this.vehicles.length;
    const now = new Date();
    let expiringSoon = 0;
    let totalMaintenanceCost = 0;

    this.vehicles.forEach(v => {
      // Check insurance
      if (v.insurance?.expiryDate) {
        const d = (v.insurance.expiryDate.toDate ? v.insurance.expiryDate.toDate() : new Date(v.insurance.expiryDate));
        const days = (d - now) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days <= 30) expiringSoon++;
      }
      // Check inspection
      if (v.inspection?.expiryDate) {
        const d = (v.inspection.expiryDate.toDate ? v.inspection.expiryDate.toDate() : new Date(v.inspection.expiryDate));
        const days = (d - now) / (1000 * 60 * 60 * 24);
        if (days >= 0 && days <= 30) expiringSoon++;
      }

      if (v.maintenance && Array.isArray(v.maintenance)) {
        v.maintenance.forEach(m => totalMaintenanceCost += (m.cost || 0));
      }
    });

    return { total, expiringSoon, totalMaintenanceCost };
  }

  render() {
    const page = document.getElementById('vehicles-page');
    if (!page) return;

    // Ensure a root container exists
    let root = document.getElementById('vehicles-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vehicles-root';
      root.className = 'container mx-auto px-4 py-8 max-w-7xl space-y-8';
      page.innerHTML = ''; // clear any old stuff
      page.appendChild(root);
    }

    this.applyFilters();
    const stats = this.getStats();

    root.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
          <div class="flex items-center gap-4">
              <button id="veh-back-btn" class="group p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full transition-colors">
                  <div class="w-8 h-8 flex items-center justify-center rounded-full group-hover:bg-gray-100 transition-colors">
                      <i class="fas fa-arrow-left text-lg"></i>
                  </div>
              </button>
              <div>
                  <h1 class="text-2xl font-bold text-gray-900">Vehicles</h1>
                  <p class="text-sm text-gray-500">Fleet Management</p>
              </div>
          </div>
      </div>

      <!-- Dashboard Stats -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
              <div class="flex items-center justify-between mb-4">
                  <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-car text-xl"></i></div>
                  <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">Fleet</span>
              </div>
              <h3 class="text-3xl font-bold mb-1">${stats.total}</h3>
              <p class="text-blue-100 text-sm">Total Vehicles</p>
          </div>
          
          <div class="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
              <div class="flex items-center justify-between mb-4">
                  <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-exclamation-triangle text-xl"></i></div>
                  <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">Action Needed</span>
              </div>
              <h3 class="text-3xl font-bold mb-1">${stats.expiringSoon}</h3>
              <p class="text-amber-100 text-sm">Expiring Soon (30 days)</p>
          </div>
          
          <div class="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
              <div class="flex items-center justify-between mb-4">
                  <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-tools text-xl"></i></div>
                  <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">Costs</span>
              </div>
              <h3 class="text-3xl font-bold mb-1">${stats.totalMaintenanceCost.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</h3>
              <p class="text-emerald-100 text-sm">Total Maintenance Invested</p>
          </div>
      </div>

      <!-- Controls -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-4 z-10 backdrop-blur-xl bg-white/90">
         <div class="flex flex-col lg:flex-row gap-4 justify-between items-center">
             <div class="flex gap-2 w-full lg:w-auto">
                 <button id="veh-btn-add" class="flex-1 lg:flex-none btn-primary px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all">
                     <i class="fas fa-plus mr-2"></i>New Vehicle
                 </button>
             </div>
             
             <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                 <div class="relative group">
                     <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand transition-colors"></i>
                     <input id="veh-search" 
                            value="${this.searchQuery}"
                            placeholder="Search fleet..." 
                            class="pl-10 pr-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-brand rounded-lg w-full sm:w-64 transition-all outline-none" 
                     />
                 </div>
                 <select id="veh-filter-cat" class="px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-brand rounded-lg outline-none cursor-pointer">
                     <option value="">All Categories</option>
                     <option value="car" ${this.currentCategoryFilter === 'car' ? 'selected' : ''}>Cars</option>
                     <option value="moto" ${this.currentCategoryFilter === 'moto' ? 'selected' : ''}>Motorcycles</option>
                     <option value="van" ${this.currentCategoryFilter === 'van' ? 'selected' : ''}>Vans</option>
                     <option value="scooter" ${this.currentCategoryFilter === 'scooter' ? 'selected' : ''}>Scooters</option>
                 </select>
             </div>
         </div>
      </div>

      <!-- Grid -->
      <div id="veh-grid" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-20"></div>
      
      <!-- Empty State -->
      <div id="veh-empty" class="hidden flex flex-col items-center justify-center py-20 text-center">
          <div class="bg-gray-100 p-6 rounded-full mb-4">
              <i class="fas fa-car text-4xl text-gray-300"></i>
          </div>
          <h3 class="text-lg font-medium text-gray-900">No vehicles found</h3>
          <p class="text-gray-500 mt-1">Try adjusting your filters or add a new vehicle.</p>
      </div>
    `;

    // Render Grid Items
    const grid = root.querySelector('#veh-grid');
    const empty = root.querySelector('#veh-empty');
    if (this.filtered.length === 0) {
      empty.classList.remove('hidden');
    } else {
      grid.innerHTML = this.filtered.map(v => this.renderCard(v)).join('');
      // Re-attach event listeners for card actions
      this.attachCardEvents(grid);
    }

    // Wire main controls
    root.querySelector('#veh-btn-add').onclick = () => this.openEditModal(); // no ID means add
    root.querySelector('#veh-search').oninput = (e) => { this.searchQuery = e.target.value; this.render(); };
    root.querySelector('#veh-filter-cat').onchange = (e) => { this.currentCategoryFilter = e.target.value; this.render(); };

    // Wire Back Button
    root.querySelector('#veh-back-btn').onclick = () => {
      document.getElementById('vehicles-page').classList.add('hidden');
      document.getElementById('landing-page').classList.remove('hidden');
    };
  }

  renderCard(v) {
    const insExp = v.insurance?.expiryDate ? this.getDateStatus(v.insurance.expiryDate) : null;
    const inspExp = v.inspection?.expiryDate ? this.getDateStatus(v.inspection.expiryDate) : null;

    const badgeCls = {
      car: 'bg-blue-50 text-blue-700 border-blue-100',
      moto: 'bg-orange-50 text-orange-700 border-orange-100',
      van: 'bg-purple-50 text-purple-700 border-purple-100',
      scooter: 'bg-teal-50 text-teal-700 border-teal-100'
    }[v.category] || 'bg-gray-50 text-gray-700 border-gray-100';

    return `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
          <div class="p-5">
              <div class="flex justify-between items-start mb-4">
                  <div>
                      <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border mb-2 ${badgeCls}">
                          ${v.category}
                      </span>
                      <h3 class="text-xl font-bold text-gray-900">${v.model}</h3>
                      <div class="text-sm text-gray-500 font-mono mt-0.5"><i class="fas fa-fingerprint mr-1.5 opacity-50"></i>${v.plate}</div>
                  </div>
                  <div class="flex gap-1">
                      <button data-action="edit" data-id="${v.id}" class="p-2 text-gray-400 hover:text-brand hover:bg-brand/5 rounded-full transition-colors">
                          <i class="fas fa-pen"></i>
                      </button>
                      <button data-action="delete" data-id="${v.id}" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                          <i class="fas fa-trash"></i>
                      </button>
                  </div>
              </div>
              
              <div class="space-y-3 mt-4">
                  <!-- Insurance -->
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm border border-gray-100">
                              <i class="fas fa-shield-alt"></i>
                          </div>
                          <div>
                              <p class="font-medium text-gray-900">Insurance</p>
                              <p class="text-xs text-gray-500">${v.insurance?.company || 'Not set'}</p>
                          </div>
                      </div>
                      ${insExp ? `<span class="px-2 py-1 rounded text-xs font-medium ${insExp.cls}">${insExp.text}</span>` : '<span class="text-gray-400 text-xs">—</span>'}
                  </div>

                  <!-- Inspection -->
                  <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
                      <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-purple-600 shadow-sm border border-gray-100">
                              <i class="fas fa-clipboard-check"></i>
                          </div>
                          <div>
                              <p class="font-medium text-gray-900">Inspection</p>
                              <p class="text-xs text-gray-500">IPO / MOT</p>
                          </div>
                      </div>
                      ${inspExp ? `<span class="px-2 py-1 rounded text-xs font-medium ${inspExp.cls}">${inspExp.text}</span>` : '<span class="text-gray-400 text-xs">—</span>'}
                  </div>
              </div>
          </div>
          
          <!-- Footer Actions -->
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
              <button data-action="logs" data-id="${v.id}" class="text-gray-600 hover:text-brand font-medium flex items-center transition-colors">
                  <i class="fas fa-wrench mr-2"></i>Maintenance (${(v.maintenance || []).length})
              </button>
              ${v.insurance?.driveUrl ? `
                  <a href="${v.insurance.driveUrl}" target="_blank" class="text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors">
                      <i class="fas fa-external-link-alt mr-2"></i>Docs
                  </a>
              ` : ''}
          </div>
      </div>
      `;
  }

  attachCardEvents(parent) {
    parent.querySelectorAll('[data-action="edit"]').forEach(b => b.addEventListener('click', () => this.openEditModal(b.dataset.id)));
    parent.querySelectorAll('[data-action="delete"]').forEach(b => b.addEventListener('click', () => this.deleteVehicle(b.dataset.id)));
    parent.querySelectorAll('[data-action="logs"]').forEach(b => b.addEventListener('click', () => this.openMaintenanceModal(b.dataset.id)));
  }

  getDateStatus(ts) {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = Math.ceil((d - now) / (1000 * 60 * 60 * 24));

    const dateStr = d.toLocaleDateString('pt-PT');

    if (diff < 0) return { text: 'Expired', cls: 'bg-red-100 text-red-700' };
    if (diff <= 30) return { text: 'Expires soon', cls: 'bg-amber-100 text-amber-700' };
    return { text: dateStr, cls: 'bg-green-100 text-green-700' };
  }

  formatDateForInput(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toISOString().split('T')[0];
  }

  // Modals
  openEditModal(id = null) {
    const isEdit = !!id;
    const v = isEdit ? this.vehicles.find(x => x.id === id) : {};

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/30';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden fade-in-up">
            <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 class="text-lg font-bold text-gray-900">${isEdit ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
                <button id="modal-close" class="text-gray-400 hover:text-gray-600 transition-colors"><i class="fas fa-times text-xl"></i></button>
            </div>
            
            <div class="p-6 max-h-[80vh] overflow-y-auto">
                <form id="veh-form" class="space-y-6">
                    <!-- Basics -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Category</label>
                            <select name="category" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all">
                                <option value="car">Car</option>
                                <option value="moto">Motorcycle</option>
                                <option value="van">Van</option>
                                <option value="scooter">Scooter</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Model</label>
                            <input name="model" required class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" placeholder="e.g. Renault Zoe" />
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">License Plate</label>
                            <input name="plate" required class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all font-mono" placeholder="AA-00-BB" />
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Fuel Type</label>
                            <select name="fuel" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all">
                                <option value="gasoline">Gasoline</option>
                                <option value="diesel">Diesel</option>
                                <option value="electric">Electric</option>
                                <option value="hybrid">Hybrid</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="border-t border-gray-100 my-2"></div>
                    
                    <!-- Insurance -->
                    <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-500"></i> Insurance Details</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="ins_company" placeholder="Insurance Company" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
                        <input name="ins_policy" placeholder="Policy Number" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
                        <div>
                            <label class="text-xs text-gray-400 block mb-1">Expiry Date</label>
                            <input name="ins_expiry" type="date" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
                        </div>
                         <input name="ins_url" placeholder="Google Drive Link (Policy)" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
                    </div>

                    <div class="border-t border-gray-100 my-2"></div>
                    
                    <!-- Inspection -->
                    <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-clipboard-check text-purple-500"></i> Inspection</h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                            <label class="text-xs text-gray-400 block mb-1">Next Inspection</label>
                            <input name="insp_expiry" type="date" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
                        </div>
                    </div>
                    
                    <div class="border-t border-gray-100 my-2"></div>
                    
                    <!-- Notes -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes</label>
                        <textarea name="notes" rows="2" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all resize-none"></textarea>
                    </div>

                </form>
            </div>
            
            <div class="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                <button type="button" id="modal-cancel" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancel</button>
                <button type="button" id="modal-save" class="btn-primary px-6 py-2 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">Save Vehicle</button>
            </div>
        </div>
      `;

    document.body.appendChild(modal);

    // Populate if edit
    const f = modal.querySelector('form');
    if (isEdit) {
      f.category.value = v.category || 'car';
      f.model.value = v.model || '';
      f.plate.value = v.plate || '';
      f.fuel.value = v.fuelType || 'gasoline';
      f.ins_company.value = v.insurance?.company || '';
      f.ins_policy.value = v.insurance?.policyName || '';
      f.ins_expiry.value = this.formatDateForInput(v.insurance?.expiryDate);
      f.ins_url.value = v.insurance?.driveUrl || '';
      f.insp_expiry.value = this.formatDateForInput(v.inspection?.expiryDate);
      f.notes.value = v.notes || '';
    }

    const close = () => modal.remove();
    modal.querySelector('#modal-close').onclick = close;
    modal.querySelector('#modal-cancel').onclick = close;

    modal.querySelector('#modal-save').onclick = async () => {
      const payload = {
        category: f.category.value,
        model: f.model.value,
        plate: f.plate.value,
        fuelType: f.fuel.value,
        insurance: {
          company: f.ins_company.value,
          policyName: f.ins_policy.value,
          expiryDate: f.ins_expiry.value ? new Date(f.ins_expiry.value) : null,
          driveUrl: f.ins_url.value
        },
        inspection: {
          expiryDate: f.insp_expiry.value ? new Date(f.insp_expiry.value) : null
        },
        notes: f.notes.value
      };

      try {
        if (isEdit) await this.updateVehicle(id, payload);
        else await this.addVehicle(payload);
        close();
      } catch (e) {
        alert('Error saving vehicle: ' + e.message);
      }
    };

    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  openMaintenanceModal(vehicleId) {
    const v = this.vehicles.find(x => x.id === vehicleId);
    if (!v) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/30';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
            <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                   <h3 class="text-xl font-bold text-gray-900">Maintenance Log</h3>
                   <p class="text-sm text-gray-500">${v.model} (${v.plate})</p>
                </div>
                <button id="maint-close" class="text-gray-400 hover:text-gray-600 transition-colors"><i class="fas fa-times text-2xl"></i></button>
            </div>
            
            <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
                <!-- List -->
                <div class="w-full md:w-2/3 border-r border-gray-100 overflow-y-auto p-0">
                    <div id="maint-list" class="divide-y divide-gray-100">
                        <!-- Items go here -->
                    </div>
                    <div id="maint-empty" class="hidden flex flex-col items-center justify-center h-64 text-center">
                        <div class="bg-gray-50 p-4 rounded-full mb-3"><i class="fas fa-clipboard-list text-gray-300 text-3xl"></i></div>
                        <p class="text-gray-500">No records yet.</p>
                    </div>
                </div>
                
                <!-- Add New -->
                <div class="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto">
                    <h4 class="font-bold text-gray-800 mb-4">Add Record</h4>
                    <form id="maint-form" class="space-y-4">
                        <input name="title" required placeholder="Service Type (e.g. Oil Change)" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
                        <div class="grid grid-cols-2 gap-3">
                             <input name="date" type="date" required class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" value="${new Date().toISOString().split('T')[0]}" />
                             <input name="cost" type="number" step="0.01" placeholder="Cost (€)" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
                        </div>
                        <input name="odometer" type="number" placeholder="Odometer (km)" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
                        <input name="workshop" placeholder="Workshop / Provider" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
                        <textarea name="notes" rows="3" placeholder="Additional notes..." class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none resize-none"></textarea>
                        
                        <button type="submit" class="w-full btn-primary py-3 rounded-lg shadow-sm hover:shadow-md transition-all">Add Record</button>
                    </form>
                </div>
            </div>
        </div>
      `;

    document.body.appendChild(modal);

    const renderList = () => {
      const list = modal.querySelector('#maint-list');
      const empty = modal.querySelector('#maint-empty');
      // re-fetch latest vehicle data to ensure sync
      const currentV = this.vehicles.find(x => x.id === vehicleId);
      const logs = (currentV && currentV.maintenance) ? currentV.maintenance : [];

      // Sort by date desc
      logs.sort((a, b) => new Date(b.date) - new Date(a.date));

      if (logs.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');

      list.innerHTML = logs.map(l => `
             <div class="p-4 hover:bg-gray-50 transition-colors group">
                 <div class="flex justify-between items-start mb-1">
                     <h5 class="font-semibold text-gray-900">${l.title}</h5>
                     <span class="font-mono text-sm font-medium text-gray-600">${parseFloat(l.cost).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })}</span>
                 </div>
                 <div class="flex items-center gap-4 text-xs text-gray-500 mb-2">
                     <span><i class="far fa-calendar mr-1"></i>${l.date}</span>
                     ${l.odometer ? `<span><i class="fas fa-tachometer-alt mr-1"></i>${l.odometer} km</span>` : ''}
                     ${l.workshop ? `<span><i class="fas fa-store mr-1"></i>${l.workshop}</span>` : ''}
                 </div>
                 ${l.notes ? `<p class="text-xs text-gray-600 bg-white p-2 border border-gray-100 rounded">${l.notes}</p>` : ''}
                 <div class="mt-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                     <button class="text-red-500 text-xs hover:underline del-btn" data-id="${l.id}">Delete</button>
                 </div>
             </div>
          `).join('');

      list.querySelectorAll('.del-btn').forEach(b => {
        b.onclick = async () => {
          await this.deleteMaintenanceRecord(vehicleId, b.dataset.id);
          renderList();
          this.render(); // update background stats
        };
      });
    };

    renderList();

    modal.querySelector('#maint-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      const rec = {
        title: f.title.value,
        date: f.date.value,
        cost: f.cost.value,
        odometer: f.odometer.value,
        workshop: f.workshop.value,
        notes: f.notes.value
      };

      try {
        await this.addMaintenanceRecord(vehicleId, rec);
        f.reset();
        f.date.value = new Date().toISOString().split('T')[0]; // reset date to today
        renderList();
        this.render(); // update background stats
      } catch (err) {
        alert(err.message);
      }
    };

    const close = () => modal.remove();
    modal.querySelector('#maint-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
  }

  // Auth/DB lifecycle helpers
  setDatabase(db) {
    this.db = db;
    this.stopListening();
    if (this.db && this.userId) this.startListening();
  }

  setUser(userId) {
    this.userId = userId || null;
    this.stopListening();
    if (this.db && this.userId) this.startListening();
  }
}
