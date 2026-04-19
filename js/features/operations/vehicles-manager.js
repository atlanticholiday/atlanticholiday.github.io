import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { i18n, t } from "../../core/i18n.js";

export class VehiclesManager {
  constructor(db, userId) {
    this.db = db;
    this.userId = userId || null;
    this.vehicles = [];
    this.filtered = [];
    this.unsubscribe = null;

    this.currentCategoryFilter = '';
    this.searchQuery = '';
    this.sortKey = 'model';
    this.sortDir = 'asc';
    this.handleLanguageChange = this.handleLanguageChange.bind(this);

    document.addEventListener('vehiclesPageOpened', () => {
      this.render();
    });
    window.addEventListener('languageChanged', this.handleLanguageChange);

    if (this.db && this.userId) {
      this.startListening();
    }
  }

  tr(key, replacements = {}) {
    return t(`vehicles.${key}`, replacements);
  }

  getLocale() {
    const activeLanguage = i18n?.getCurrentLanguage?.() || i18n?.currentLang || 'en';
    return activeLanguage === 'pt' ? 'pt-PT' : 'en-US';
  }

  getCollectionRef() {
    if (!this.db || !this.userId) return null;
    return collection(this.db, `users/${this.userId}/vehicles`);
  }

  getCategoryLabel(category) {
    return this.tr(`categories.${category || 'car'}`);
  }

  getFuelLabel(fuelType) {
    return this.tr(`fuelTypes.${fuelType || 'gasoline'}`);
  }

  getRelativeExpiryLabel(daysUntilExpiry) {
    if (daysUntilExpiry < 0) return this.tr('dateStatus.expired');
    if (daysUntilExpiry <= 30) return this.tr('dateStatus.expiresSoon');
    return null;
  }

  handleLanguageChange() {
    const page = document.getElementById('vehicles-page');
    if (page && !page.classList.contains('hidden')) {
      this.render();
    }
  }

  startListening() {
    const colRef = this.getCollectionRef();
    if (!colRef) return;
    if (this.unsubscribe) this.unsubscribe();
    this.unsubscribe = onSnapshot(colRef, (snapshot) => {
      this.vehicles = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
      fuelType: vehicle.fuelType || 'gasoline',
      year: vehicle.year || new Date().getFullYear(),
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
      maintenance: [],
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
    if (!confirm(this.tr('messages.confirmDeleteVehicle'))) return;
    if (!this.db || !this.userId) {
      alert(this.tr('messages.notSignedIn'));
      return;
    }
    try {
      const ref = doc(this.db, `users/${this.userId}/vehicles`, id);
      await deleteDoc(ref);
    } catch (err) {
      console.error('Failed to delete vehicle:', err);
      alert(this.tr('messages.deleteVehicleFailed', { message: err?.message || err }));
    }
  }

  async addMaintenanceRecord(vehicleId, record) {
    if (!this.db || !this.userId) throw new Error('VehiclesManager not initialized');
    const vehicle = this.vehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) return;

    const newRecord = {
      id: `maint_${Date.now()}`,
      date: record.date || new Date().toISOString(),
      title: record.title || this.tr('maintenance.defaultTitle'),
      cost: parseFloat(record.cost) || 0,
      odometer: parseInt(record.odometer, 10) || 0,
      workshop: record.workshop || '',
      notes: record.notes || ''
    };

    const updatedMaintenance = [...(vehicle.maintenance || []), newRecord];
    await this.updateVehicle(vehicleId, { maintenance: updatedMaintenance });
  }

  async deleteMaintenanceRecord(vehicleId, recordId) {
    if (!confirm(this.tr('messages.confirmDeleteMaintenance'))) return;
    const vehicle = this.vehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) return;
    const updatedMaintenance = (vehicle.maintenance || []).filter((record) => record.id !== recordId);
    await this.updateVehicle(vehicleId, { maintenance: updatedMaintenance });
  }

  applyFilters() {
    const query = this.searchQuery.trim().toLowerCase();
    this.filtered = this.vehicles.filter((vehicle) => {
      const matchesCat = this.currentCategoryFilter ? vehicle.category === this.currentCategoryFilter : true;
      const haystack = `${vehicle.model || ''} ${vehicle.plate || ''} ${vehicle.insurance?.company || ''}`.toLowerCase();
      const matchesSearch = query ? haystack.includes(query) : true;
      return matchesCat && matchesSearch;
    });

    this.filtered.sort((left, right) => {
      const leftValue = (left[this.sortKey] || '').toString().toLowerCase();
      const rightValue = (right[this.sortKey] || '').toString().toLowerCase();
      if (this.sortDir === 'asc') return leftValue.localeCompare(rightValue);
      return rightValue.localeCompare(leftValue);
    });
  }

  getStats() {
    const total = this.vehicles.length;
    const now = new Date();
    let expiringSoon = 0;
    let totalMaintenanceCost = 0;

    this.vehicles.forEach((vehicle) => {
      if (vehicle.insurance?.expiryDate) {
        const insuranceDate = vehicle.insurance.expiryDate.toDate
          ? vehicle.insurance.expiryDate.toDate()
          : new Date(vehicle.insurance.expiryDate);
        const insuranceDays = (insuranceDate - now) / (1000 * 60 * 60 * 24);
        if (insuranceDays >= 0 && insuranceDays <= 30) expiringSoon++;
      }

      if (vehicle.inspection?.expiryDate) {
        const inspectionDate = vehicle.inspection.expiryDate.toDate
          ? vehicle.inspection.expiryDate.toDate()
          : new Date(vehicle.inspection.expiryDate);
        const inspectionDays = (inspectionDate - now) / (1000 * 60 * 60 * 24);
        if (inspectionDays >= 0 && inspectionDays <= 30) expiringSoon++;
      }

      if (Array.isArray(vehicle.maintenance)) {
        vehicle.maintenance.forEach((record) => {
          totalMaintenanceCost += record.cost || 0;
        });
      }
    });

    return { total, expiringSoon, totalMaintenanceCost };
  }

  render() {
    const page = document.getElementById('vehicles-page');
    if (!page) return;

    let root = document.getElementById('vehicles-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'vehicles-root';
      root.className = 'container mx-auto px-4 py-8 max-w-7xl space-y-8';
      page.innerHTML = '';
      page.appendChild(root);
    }

    this.applyFilters();
    const stats = this.getStats();

    root.innerHTML = `
      <div class="flex items-center justify-between mb-8">
        <div class="flex items-center gap-4">
          <button id="veh-back-btn" class="group p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-full transition-colors">
            <div class="w-8 h-8 flex items-center justify-center rounded-full group-hover:bg-gray-100 transition-colors">
              <i class="fas fa-arrow-left text-lg"></i>
            </div>
          </button>
          <div>
            <h1 class="text-2xl font-bold text-gray-900">${this.tr('header.title')}</h1>
            <p class="text-sm text-gray-500">${this.tr('header.subtitle')}</p>
          </div>
        </div>
        <div class="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white/90 px-1 py-1 shadow-sm">
          <button type="button" class="lang-btn px-2 py-1 rounded text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="en" title="English">EN</button>
          <button type="button" class="lang-btn px-2 py-1 rounded text-sm font-medium transition-all hover:bg-gray-100" data-lang-option="pt" title="Português">PT</button>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
          <div class="flex items-center justify-between mb-4">
            <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-car text-xl"></i></div>
            <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">${this.tr('stats.fleetBadge')}</span>
          </div>
          <h3 class="text-3xl font-bold mb-1">${stats.total}</h3>
          <p class="text-blue-100 text-sm">${this.tr('stats.totalVehicles')}</p>
        </div>

        <div class="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
          <div class="flex items-center justify-between mb-4">
            <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-exclamation-triangle text-xl"></i></div>
            <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">${this.tr('stats.actionNeededBadge')}</span>
          </div>
          <h3 class="text-3xl font-bold mb-1">${stats.expiringSoon}</h3>
          <p class="text-amber-100 text-sm">${this.tr('stats.expiringSoon')}</p>
        </div>

        <div class="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg transform hover:scale-[1.02] transition-transform">
          <div class="flex items-center justify-between mb-4">
            <div class="bg-white/20 p-3 rounded-lg"><i class="fas fa-tools text-xl"></i></div>
            <span class="text-xs font-medium bg-white/20 px-2 py-1 rounded">${this.tr('stats.costsBadge')}</span>
          </div>
          <h3 class="text-3xl font-bold mb-1">${stats.totalMaintenanceCost.toLocaleString(this.getLocale(), { style: 'currency', currency: 'EUR' })}</h3>
          <p class="text-emerald-100 text-sm">${this.tr('stats.totalMaintenance')}</p>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sticky top-4 z-10 backdrop-blur-xl bg-white/90">
        <div class="flex flex-col lg:flex-row gap-4 justify-between items-center">
          <div class="flex gap-2 w-full lg:w-auto">
            <button id="veh-btn-add" class="flex-1 lg:flex-none btn-primary px-6 py-2.5 rounded-lg shadow-sm hover:shadow-md transition-all">
              <i class="fas fa-plus mr-2"></i>${this.tr('actions.newVehicle')}
            </button>
          </div>

          <div class="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <div class="relative group">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-brand transition-colors"></i>
              <input
                id="veh-search"
                value="${this.searchQuery}"
                placeholder="${this.tr('filters.searchPlaceholder')}"
                class="pl-10 pr-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-brand rounded-lg w-full sm:w-64 transition-all outline-none"
              />
            </div>
            <select id="veh-filter-cat" class="px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white border focus:border-brand rounded-lg outline-none cursor-pointer">
              <option value="">${this.tr('filters.allCategories')}</option>
              <option value="car" ${this.currentCategoryFilter === 'car' ? 'selected' : ''}>${this.getCategoryLabel('car')}</option>
              <option value="moto" ${this.currentCategoryFilter === 'moto' ? 'selected' : ''}>${this.getCategoryLabel('moto')}</option>
              <option value="van" ${this.currentCategoryFilter === 'van' ? 'selected' : ''}>${this.getCategoryLabel('van')}</option>
              <option value="scooter" ${this.currentCategoryFilter === 'scooter' ? 'selected' : ''}>${this.getCategoryLabel('scooter')}</option>
            </select>
          </div>
        </div>
      </div>

      <div id="veh-grid" class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-20"></div>

      <div id="veh-empty" class="hidden flex flex-col items-center justify-center py-20 text-center">
        <div class="bg-gray-100 p-6 rounded-full mb-4">
          <i class="fas fa-car text-4xl text-gray-300"></i>
        </div>
        <h3 class="text-lg font-medium text-gray-900">${this.tr('empty.title')}</h3>
        <p class="text-gray-500 mt-1">${this.tr('empty.description')}</p>
      </div>
    `;

    const grid = root.querySelector('#veh-grid');
    const empty = root.querySelector('#veh-empty');
    if (this.filtered.length === 0) {
      empty.classList.remove('hidden');
    } else {
      grid.innerHTML = this.filtered.map((vehicle) => this.renderCard(vehicle)).join('');
      this.attachCardEvents(grid);
    }

    root.querySelector('#veh-btn-add').onclick = () => this.openEditModal();
    root.querySelector('#veh-search').oninput = (event) => {
      this.searchQuery = event.target.value;
      this.render();
    };
    root.querySelector('#veh-filter-cat').onchange = (event) => {
      this.currentCategoryFilter = event.target.value;
      this.render();
    };
    root.querySelector('#veh-back-btn').onclick = () => {
      document.getElementById('vehicles-page').classList.add('hidden');
      document.getElementById('landing-page').classList.remove('hidden');
    };

    i18n.setupLanguageSwitcher?.();
    i18n.updateLanguageSwitcher?.();
  }

  renderCard(vehicle) {
    const insuranceExpiry = vehicle.insurance?.expiryDate ? this.getDateStatus(vehicle.insurance.expiryDate) : null;
    const inspectionExpiry = vehicle.inspection?.expiryDate ? this.getDateStatus(vehicle.inspection.expiryDate) : null;

    const badgeCls = {
      car: 'bg-blue-50 text-blue-700 border-blue-100',
      moto: 'bg-orange-50 text-orange-700 border-orange-100',
      van: 'bg-purple-50 text-purple-700 border-purple-100',
      scooter: 'bg-teal-50 text-teal-700 border-teal-100'
    }[vehicle.category] || 'bg-gray-50 text-gray-700 border-gray-100';

    return `
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow group">
        <div class="p-5">
          <div class="flex justify-between items-start mb-4">
            <div>
              <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border mb-2 ${badgeCls}">
                ${this.getCategoryLabel(vehicle.category)}
              </span>
              <h3 class="text-xl font-bold text-gray-900">${vehicle.model}</h3>
              <div class="text-sm text-gray-500 font-mono mt-0.5"><i class="fas fa-fingerprint mr-1.5 opacity-50"></i>${vehicle.plate}</div>
            </div>
            <div class="flex gap-1">
              <button data-action="edit" data-id="${vehicle.id}" class="p-2 text-gray-400 hover:text-brand hover:bg-brand/5 rounded-full transition-colors">
                <i class="fas fa-pen"></i>
              </button>
              <button data-action="delete" data-id="${vehicle.id}" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>

          <div class="space-y-3 mt-4">
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-blue-600 shadow-sm border border-gray-100">
                  <i class="fas fa-shield-alt"></i>
                </div>
                <div>
                  <p class="font-medium text-gray-900">${this.tr('sections.insurance')}</p>
                  <p class="text-xs text-gray-500">${vehicle.insurance?.company || this.tr('labels.notSet')}</p>
                </div>
              </div>
              ${insuranceExpiry
                ? `<span class="px-2 py-1 rounded text-xs font-medium ${insuranceExpiry.cls}">${insuranceExpiry.text}</span>`
                : `<span class="text-gray-400 text-xs">${this.tr('labels.notAvailable')}</span>`}
            </div>

            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-purple-600 shadow-sm border border-gray-100">
                  <i class="fas fa-clipboard-check"></i>
                </div>
                <div>
                  <p class="font-medium text-gray-900">${this.tr('sections.inspection')}</p>
                  <p class="text-xs text-gray-500">${this.tr('labels.inspectionHint')}</p>
                </div>
              </div>
              ${inspectionExpiry
                ? `<span class="px-2 py-1 rounded text-xs font-medium ${inspectionExpiry.cls}">${inspectionExpiry.text}</span>`
                : `<span class="text-gray-400 text-xs">${this.tr('labels.notAvailable')}</span>`}
            </div>
          </div>
        </div>

        <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center text-sm">
          <button data-action="logs" data-id="${vehicle.id}" class="text-gray-600 hover:text-brand font-medium flex items-center transition-colors">
            <i class="fas fa-wrench mr-2"></i>${this.tr('maintenance.buttonLabel', { count: (vehicle.maintenance || []).length })}
          </button>
          ${vehicle.insurance?.driveUrl ? `
            <a href="${vehicle.insurance.driveUrl}" target="_blank" class="text-blue-600 hover:text-blue-700 font-medium flex items-center transition-colors">
              <i class="fas fa-external-link-alt mr-2"></i>${this.tr('actions.docs')}
            </a>
          ` : ''}
        </div>
      </div>
    `;
  }

  attachCardEvents(parent) {
    parent.querySelectorAll('[data-action="edit"]').forEach((button) => {
      button.addEventListener('click', () => this.openEditModal(button.dataset.id));
    });
    parent.querySelectorAll('[data-action="delete"]').forEach((button) => {
      button.addEventListener('click', () => this.deleteVehicle(button.dataset.id));
    });
    parent.querySelectorAll('[data-action="logs"]').forEach((button) => {
      button.addEventListener('click', () => this.openMaintenanceModal(button.dataset.id));
    });
  }

  getDateStatus(timestamp) {
    if (!timestamp) return null;
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    const relativeLabel = this.getRelativeExpiryLabel(diff);

    if (diff < 0) return { text: relativeLabel, cls: 'bg-red-100 text-red-700' };
    if (diff <= 30) return { text: relativeLabel, cls: 'bg-amber-100 text-amber-700' };
    return {
      text: date.toLocaleDateString(this.getLocale()),
      cls: 'bg-green-100 text-green-700'
    };
  }

  formatDateForInput(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toISOString().split('T')[0];
  }

  openEditModal(id = null) {
    const isEdit = Boolean(id);
    const vehicle = isEdit ? this.vehicles.find((entry) => entry.id === id) : {};

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/30';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden fade-in-up">
        <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 class="text-lg font-bold text-gray-900">${isEdit ? this.tr('modal.editTitle') : this.tr('modal.addTitle')}</h3>
          <button id="modal-close" class="text-gray-400 hover:text-gray-600 transition-colors"><i class="fas fa-times text-xl"></i></button>
        </div>

        <div class="p-6 max-h-[80vh] overflow-y-auto">
          <form id="veh-form" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${this.tr('form.category')}</label>
                <select name="category" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all">
                  <option value="car">${this.getCategoryLabel('car')}</option>
                  <option value="moto">${this.getCategoryLabel('moto')}</option>
                  <option value="van">${this.getCategoryLabel('van')}</option>
                  <option value="scooter">${this.getCategoryLabel('scooter')}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${this.tr('form.model')}</label>
                <input name="model" required class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" placeholder="${this.tr('form.modelPlaceholder')}" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${this.tr('form.licensePlate')}</label>
                <input name="plate" required class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all font-mono" placeholder="${this.tr('form.licensePlatePlaceholder')}" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${this.tr('form.fuelType')}</label>
                <select name="fuel" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all">
                  <option value="gasoline">${this.getFuelLabel('gasoline')}</option>
                  <option value="diesel">${this.getFuelLabel('diesel')}</option>
                  <option value="electric">${this.getFuelLabel('electric')}</option>
                  <option value="hybrid">${this.getFuelLabel('hybrid')}</option>
                </select>
              </div>
            </div>

            <div class="border-t border-gray-100 my-2"></div>

            <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-shield-alt text-blue-500"></i> ${this.tr('form.insuranceDetails')}</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input name="ins_company" placeholder="${this.tr('form.insuranceCompany')}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
              <input name="ins_policy" placeholder="${this.tr('form.policyNumber')}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
              <div>
                <label class="text-xs text-gray-400 block mb-1">${this.tr('form.expiryDate')}</label>
                <input name="ins_expiry" type="date" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
              </div>
              <input name="ins_url" placeholder="${this.tr('form.policyLink')}" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
            </div>

            <div class="border-t border-gray-100 my-2"></div>

            <h4 class="text-sm font-bold text-gray-900 flex items-center gap-2"><i class="fas fa-clipboard-check text-purple-500"></i> ${this.tr('form.inspection')}</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="text-xs text-gray-400 block mb-1">${this.tr('form.nextInspection')}</label>
                <input name="insp_expiry" type="date" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all" />
              </div>
            </div>

            <div class="border-t border-gray-100 my-2"></div>

            <div>
              <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">${this.tr('form.notes')}</label>
              <textarea name="notes" rows="2" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-brand outline-none transition-all resize-none"></textarea>
            </div>
          </form>
        </div>

        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button type="button" id="modal-cancel" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors">${t('common.cancel')}</button>
          <button type="button" id="modal-save" class="btn-primary px-6 py-2 rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5">${this.tr('actions.saveVehicle')}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('form');
    if (isEdit) {
      form.category.value = vehicle.category || 'car';
      form.model.value = vehicle.model || '';
      form.plate.value = vehicle.plate || '';
      form.fuel.value = vehicle.fuelType || 'gasoline';
      form.ins_company.value = vehicle.insurance?.company || '';
      form.ins_policy.value = vehicle.insurance?.policyName || '';
      form.ins_expiry.value = this.formatDateForInput(vehicle.insurance?.expiryDate);
      form.ins_url.value = vehicle.insurance?.driveUrl || '';
      form.insp_expiry.value = this.formatDateForInput(vehicle.inspection?.expiryDate);
      form.notes.value = vehicle.notes || '';
    }

    const close = () => modal.remove();
    modal.querySelector('#modal-close').onclick = close;
    modal.querySelector('#modal-cancel').onclick = close;

    modal.querySelector('#modal-save').onclick = async () => {
      const payload = {
        category: form.category.value,
        model: form.model.value,
        plate: form.plate.value,
        fuelType: form.fuel.value,
        insurance: {
          company: form.ins_company.value,
          policyName: form.ins_policy.value,
          expiryDate: form.ins_expiry.value ? new Date(form.ins_expiry.value) : null,
          driveUrl: form.ins_url.value
        },
        inspection: {
          expiryDate: form.insp_expiry.value ? new Date(form.insp_expiry.value) : null
        },
        notes: form.notes.value
      };

      try {
        if (isEdit) await this.updateVehicle(id, payload);
        else await this.addVehicle(payload);
        close();
      } catch (error) {
        alert(this.tr('messages.saveVehicleFailed', { message: error.message }));
      }
    };

    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
  }

  openMaintenanceModal(vehicleId) {
    const vehicle = this.vehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-sm bg-black/30';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-fade-in-up">
        <div class="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h3 class="text-xl font-bold text-gray-900">${this.tr('maintenance.title')}</h3>
            <p class="text-sm text-gray-500">${vehicle.model} (${vehicle.plate})</p>
          </div>
          <button id="maint-close" class="text-gray-400 hover:text-gray-600 transition-colors"><i class="fas fa-times text-2xl"></i></button>
        </div>

        <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div class="w-full md:w-2/3 border-r border-gray-100 overflow-y-auto p-0">
            <div id="maint-list" class="divide-y divide-gray-100"></div>
            <div id="maint-empty" class="hidden flex flex-col items-center justify-center h-64 text-center">
              <div class="bg-gray-50 p-4 rounded-full mb-3"><i class="fas fa-clipboard-list text-gray-300 text-3xl"></i></div>
              <p class="text-gray-500">${this.tr('maintenance.empty')}</p>
            </div>
          </div>

          <div class="w-full md:w-1/3 bg-gray-50 p-6 overflow-y-auto">
            <h4 class="font-bold text-gray-800 mb-4">${this.tr('maintenance.addRecord')}</h4>
            <form id="maint-form" class="space-y-4">
              <input name="title" required placeholder="${this.tr('maintenance.serviceTypePlaceholder')}" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
              <div class="grid grid-cols-2 gap-3">
                <input name="date" type="date" required class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" value="${new Date().toISOString().split('T')[0]}" />
                <input name="cost" type="number" step="0.01" placeholder="${this.tr('maintenance.costPlaceholder')}" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
              </div>
              <input name="odometer" type="number" placeholder="${this.tr('maintenance.odometerPlaceholder')}" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
              <input name="workshop" placeholder="${this.tr('maintenance.workshopPlaceholder')}" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none" />
              <textarea name="notes" rows="3" placeholder="${this.tr('maintenance.notesPlaceholder')}" class="w-full p-3 bg-white border border-gray-200 rounded-lg focus:border-brand outline-none resize-none"></textarea>

              <button type="submit" class="w-full btn-primary py-3 rounded-lg shadow-sm hover:shadow-md transition-all">${this.tr('maintenance.addRecord')}</button>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const renderList = () => {
      const list = modal.querySelector('#maint-list');
      const empty = modal.querySelector('#maint-empty');
      const currentVehicle = this.vehicles.find((entry) => entry.id === vehicleId);
      const logs = currentVehicle?.maintenance ? [...currentVehicle.maintenance] : [];

      logs.sort((left, right) => new Date(right.date) - new Date(left.date));

      if (logs.length === 0) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      list.innerHTML = logs.map((log) => `
        <div class="p-4 hover:bg-gray-50 transition-colors group">
          <div class="flex justify-between items-start mb-1">
            <h5 class="font-semibold text-gray-900">${log.title}</h5>
            <span class="font-mono text-sm font-medium text-gray-600">${parseFloat(log.cost).toLocaleString(this.getLocale(), { style: 'currency', currency: 'EUR' })}</span>
          </div>
          <div class="flex items-center gap-4 text-xs text-gray-500 mb-2">
            <span><i class="far fa-calendar mr-1"></i>${new Date(log.date).toLocaleDateString(this.getLocale())}</span>
            ${log.odometer ? `<span><i class="fas fa-tachometer-alt mr-1"></i>${log.odometer} ${this.tr('maintenance.kmUnit')}</span>` : ''}
            ${log.workshop ? `<span><i class="fas fa-store mr-1"></i>${log.workshop}</span>` : ''}
          </div>
          ${log.notes ? `<p class="text-xs text-gray-600 bg-white p-2 border border-gray-100 rounded">${log.notes}</p>` : ''}
          <div class="mt-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
            <button class="text-red-500 text-xs hover:underline del-btn" data-id="${log.id}">${t('common.delete')}</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.del-btn').forEach((button) => {
        button.onclick = async () => {
          await this.deleteMaintenanceRecord(vehicleId, button.dataset.id);
          renderList();
          this.render();
        };
      });
    };

    renderList();

    modal.querySelector('#maint-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const record = {
        title: form.title.value,
        date: form.date.value,
        cost: form.cost.value,
        odometer: form.odometer.value,
        workshop: form.workshop.value,
        notes: form.notes.value
      };

      try {
        await this.addMaintenanceRecord(vehicleId, record);
        form.reset();
        form.date.value = new Date().toISOString().split('T')[0];
        renderList();
        this.render();
      } catch (error) {
        alert(error.message);
      }
    };

    const close = () => modal.remove();
    modal.querySelector('#maint-close').onclick = close;
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
  }

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
