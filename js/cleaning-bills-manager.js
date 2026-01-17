import { LOCATIONS, TRAVEL_FEES } from './locations.js';
export class CleaningBillsManager {
  constructor() {
    this.defaultKg = 8.5;
    this.pricePerKg = 1.90;
    this.type = 'T1';
    this.location = '';

    // Companies definition (id used in select; label must match cleaningCompanyContact value)
    this.COMPANIES = [
      { id: 'seletivo', label: 'Seletivo & Cristalino', propertyBased: false, laundryPriceKg: 1.90 },
      { id: 'thatsMaid', label: "That's Maid", propertyBased: true, laundryPriceKg: 2.10 },
      { id: 'mysticMarYam', label: 'Mystic/Mar Yam', propertyBased: true, laundryPriceKg: 1.90 },
      { id: 'sweetHomeMadeira', label: 'Sweet Home Madeira', propertyBased: true, laundryPriceKg: 1.90 },
      { id: 'fajaDoAmo', label: 'Fajã do Amo', propertyBased: true, laundryPriceKg: 1.90 },
      { id: 'owners', label: 'Owners', propertyBased: true, laundryPriceKg: 1.90 },
    ];

    // Preferences (last used company and property per company)
    const prefs = this.loadPrefs();
    // Backward-compat map of old values to ids
    const normalizeCompanyId = (val) => {
      if (!val) return 'seletivo';
      if (val === 'seletivo') return 'seletivo';
      if (val === 'thatsMaid' || val === "That's Maid") return 'thatsMaid';
      const known = this.COMPANIES.find(c => c.id === val || c.label === val);
      return known ? known.id : 'seletivo';
    };
    this.companyId = normalizeCompanyId(prefs.lastCompanyId);
    this.activePropertyId = prefs.lastPropertyByCompany?.[this.companyId] || '';
    // Legacy local per-property fallback prices
    this.thatsMaidPrices = this.loadThatsMaidPrices();
    // Set price per kg according to selected company
    this.pricePerKg = (this.getSelectedCompany()?.laundryPriceKg ?? 1.90);

    // Commission Calculator defaults (inside Cleaning Bills)
    this.totalPosted = 100.0; // gross amount shown on platform (VAT included)
    this.platformPct = 15.0;  // platform commission % of total posted
    this.vatPct = 22.0;       // VAT rate (%) to extract from total posted

    // Cleaning base fees
    this.CLEANING_FEES = {
      T0: 45.00,
      T1: 55.00,
      T2: 65.00,
      T3: 75.00,
      T4: 95.00,
      T5: 120.00,
      V1: 70.00,
      V2: 80.00,
      V3: 95.00,
      V4: 125.00,
      V5: 140.00,
      V6: 150.00,
    };

    // Travel fees are imported from locations.js as TRAVEL_FEES

    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.ensureDomScaffold(), 50);
      document.addEventListener('cleaningBillsPageOpened', () => {
        this.ensureDomScaffold();
        this.render();
      });
      // When properties data updates, re-render if current company is property-based
      document.addEventListener('propertiesDataUpdated', () => {
        const comp = this.getSelectedCompany();
        if (comp?.propertyBased) {
          const props = Array.isArray(window.propertiesManager?.properties) ? window.propertiesManager.properties : [];
          const norm = (s) => String(s || '').trim().toLowerCase();
          const labelNorm = norm(comp.label);
          const companyProps = props.filter(p => {
            const c = norm(p.cleaningCompanyContact);
            if (c === labelNorm) return true;
            if (comp.id === 'thatsMaid' && (c === 'thats maid')) return true;
            return false;
          });
          const activeProp = companyProps.find(p => p.id === this.activePropertyId) || companyProps[0] || null;
          const autoLoc = this.normalizeLocation(activeProp?.location);
          if (autoLoc) this.location = autoLoc;
          this.render();
        }
      });
    }
  }

  getSelectedCompany() {
    return this.COMPANIES.find(c => c.id === this.companyId) || this.COMPANIES[0];
  }

  // Normalize any incoming location to the canonical value in LOCATIONS (case-insensitive)
  normalizeLocation(name) {
    const s = String(name || '').trim();
    if (!s) return '';
    const lower = s.toLowerCase();
    const exact = LOCATIONS.find(loc => loc.toLowerCase() === lower);
    return exact || '';
  }

  loadPrefs() {
    try {
      return JSON.parse(localStorage.getItem('cleaningBillsPrefs') || '{}');
    } catch { return {}; }
  }
  savePrefs() {
    try {
      const prefs = this.loadPrefs();
      const updated = {
        ...prefs,
        lastCompanyId: this.companyId,
        lastPropertyByCompany: { ...(prefs.lastPropertyByCompany || {}), [this.companyId]: this.activePropertyId }
      };
      localStorage.setItem('cleaningBillsPrefs', JSON.stringify(updated));
    } catch { }
  }

  // ---------- DOM scaffold ----------
  ensureDomScaffold() {
    // Page container
    if (!document.getElementById('cleaning-bills-page')) {
      const page = document.createElement('div');
      page.id = 'cleaning-bills-page';
      page.className = 'hidden min-h-screen';
      page.innerHTML = `
        <div class="max-w-5xl mx-auto py-6 px-4">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <button id="back-to-landing-from-cleaning-bills-btn" class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>
              <h1 class="text-xl font-semibold text-gray-900">Cleaning Bills</h1>
            </div>
            <button id="cleaning-bills-sign-out-btn" class="text-sm text-red-600 hover:underline">Sign out</button>
          </div>
          <div id="cleaning-bills-root" class="glass-effect-strong p-4"></div>
        </div>`;
      const landing = document.getElementById('landing-page');
      if (landing && landing.parentElement) {
        landing.parentElement.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    }

    // Landing button card
    if (!document.getElementById('go-to-cleaning-bills-btn')) {
      // Prioritize Other Tools grid
      const otherToolsGrid = document.getElementById('other-tools-grid');
      let parent = otherToolsGrid;
      let refNode = null;

      // Fallback: Try to find an existing dashboard grid by locating the properties button
      if (!parent) {
        const propsBtn = document.getElementById('go-to-properties-btn');
        if (propsBtn && propsBtn.parentElement) {
          parent = propsBtn.parentElement;
        }
      }

      if (parent) {
        const card = document.createElement('button');
        card.id = 'go-to-cleaning-bills-btn';
        card.className = 'dashboard-card'; // Force standard class
        card.innerHTML = `
            <div class="card-icon bg-emerald-500/10 text-emerald-600">
             <span class="text-2xl">🧹</span>
            </div>
            <div class="card-body">
              <h3>Cleaning Bills</h3>
              <p>Calculate cleaning fees.</p>
            </div>
        `;

        // Try to match styling of sibling if possible
        const sibling = parent.querySelector('.dashboard-card');
        if (sibling) {
          card.className = sibling.className;
        }

        parent.appendChild(card);
      } else {
        const landing = document.getElementById('landing-page');
        if (landing) {
          const fallback = document.createElement('button');
          fallback.id = 'go-to-cleaning-bills-btn';
          fallback.className = 'dashboard-card px-4 py-3 border rounded bg-white hover:shadow';
          fallback.textContent = 'Cleaning Bills';
          landing.appendChild(fallback);
        }
      }
    }
  }

  // ---------- Rendering ----------
  render() {
    const root = document.getElementById('cleaning-bills-root');
    if (!root) return;

    // Resolve properties (for selected company filtering)
    const allProps = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    const comp = this.getSelectedCompany();
    const norm = (s) => String(s || '').trim().toLowerCase();
    const labelNorm = norm(comp.label);
    const selectedCompanyProps = comp.propertyBased
      ? allProps.filter(p => {
        const c = norm(p.cleaningCompanyContact);
        if (c === labelNorm) return true;
        // Legacy tolerance for That's Maid without apostrophe
        if (comp.id === 'thatsMaid' && (c === 'thats maid')) return true;
        return false;
      })
      : [];
    // Ensure selected property is valid if company is property-based
    if (comp.propertyBased) {
      const exists = selectedCompanyProps.some(p => p.id === this.activePropertyId);
      if (!exists) {
        this.activePropertyId = selectedCompanyProps[0]?.id || '';
      }
    }

    const typeOptions = Object.keys(this.CLEANING_FEES)
      .map(k => `<option value="${k}" ${k === this.type ? 'selected' : ''}>${k} — ${this.formatCurrency(this.CLEANING_FEES[k])}</option>`)
      .join('');

    // If a property is selected, auto-fill location from the property when none chosen yet
    const activeProp = selectedCompanyProps.find(p => p.id === this.activePropertyId) || selectedCompanyProps[0] || null;
    const autoLoc = this.normalizeLocation(activeProp?.location);
    if (!this.location && autoLoc) this.location = autoLoc;

    const locationOptions = [''].concat(LOCATIONS)
      .map(name => {
        const sel = name === this.location ? 'selected' : '';
        const label = name || 'Select location';
        return `<option value="${name}" ${sel}>${label}</option>`;
      })
      .join('');

    const companyOptions = this.COMPANIES
      .map(c => `<option value="${c.id}" ${this.companyId === c.id ? 'selected' : ''}>${c.label}</option>`)
      .join('');

    const selectedPrice = Number((activeProp?.cleaningCompanyPrice ?? this.thatsMaidPrices[this.activePropertyId] ?? 0) || 0);
    const propertyOptions = selectedCompanyProps.length
      ? selectedCompanyProps.map(p => `<option value="${p.id}" ${p.id === this.activePropertyId ? 'selected' : ''}>${p.name || p.displayName || p.id}</option>`).join('')
      : `<option value="">No properties found for ${comp.label}</option>`;

    root.innerHTML = `
      <div class="space-y-6">
        <!-- Cleaning Bills Calculator -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-2">Cleaning Calculator</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded bg-white/70 shadow">
              <h3 class="font-medium text-gray-800 mb-3">Inputs</h3>
              <div class="space-y-3">
                <label class="block">
                  <span class="text-sm text-gray-600">Cleaning Company</span>
                  <select id="cb-company" class="w-full">${companyOptions}</select>
                </label>
                ${!comp.propertyBased ? `
                <label class="block">
                  <span class="text-sm text-gray-600">Cleaning Type</span>
                  <select id="cb-type" class="w-full">${typeOptions}</select>
                </label>
                ` : `
                <label class="block">
                  <span class="text-sm text-gray-600">Property (${comp.label})</span>
                  <select id="cb-property" class="w-full">${propertyOptions}</select>
                </label>
                <label class="block">
                  <span class="text-sm text-gray-600">Cleaning price (per selected property)</span>
                  <input id="cb-company-price" type="number" step="0.01" min="0" class="w-full" value="${selectedPrice}" />
                </label>
                `}
                <label class="block">
                  <span class="text-sm text-gray-600">Travel Location</span>
                  <select id="cb-location" class="w-full">${locationOptions}</select>
                </label>
                <div class="grid grid-cols-2 gap-3">
                  <label class="block">
                    <span class="text-sm text-gray-600">Laundry (kg)</span>
                    <input id="cb-kg" type="number" step="0.1" min="0" class="w-full" value="${this.defaultKg}">
                  </label>
                  <label class="block">
                    <span class="text-sm text-gray-600">Price per kg</span>
                    <input id="cb-price-kg" type="number" step="0.01" min="0" class="w-full" value="${this.pricePerKg}">
                  </label>
                </div>
                <div class="flex gap-2">
                  <button id="cb-reset" class="view-btn">Reset</button>
                  <button id="cb-copy" class="view-btn">Copy Breakdown</button>
                </div>
              </div>
            </div>
            <div class="p-4 rounded bg-white/70 shadow">
              <h3 class="font-medium text-gray-800 mb-3">Breakdown</h3>
              <div id="cb-breakdown" class="text-sm text-gray-800"></div>
            </div>
          </div>
        </div>

        <!-- Commission Calculator (inside Cleaning Bills) -->
        <div>
          <h2 class="text-lg font-semibold text-gray-900 mb-2">Commission Calculator</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="p-4 rounded bg-white/70 shadow">
              <h3 class="font-medium text-gray-800 mb-3">Inputs</h3>
              <div class="space-y-3">
                <label class="block">
                  <span class="text-sm text-gray-600">Total posted on platform (gross, VAT included)</span>
                  <input id="cc-total" type="number" step="0.01" min="0" class="w-full" value="${this.totalPosted}">
                </label>
                <div class="grid grid-cols-2 gap-3">
                  <label class="block">
                    <span class="text-sm text-gray-600">Platform commission %</span>
                    <input id="cc-platform" type="number" step="0.01" min="0" class="w-full" value="${this.platformPct}">
                  </label>
                  <label class="block">
                    <span class="text-sm text-gray-600">VAT %</span>
                    <input id="cc-vat" type="number" step="0.01" min="0" class="w-full" value="${this.vatPct}">
                  </label>
                </div>
                <div class="flex gap-2">
                  <button id="cc-reset" class="view-btn">Reset</button>
                  <button id="cc-copy" class="view-btn">Copy Breakdown</button>
                </div>
                <p class="text-xs text-gray-500 mt-2">VAT is extracted from a VAT-inclusive total: VAT = Total × (VAT% / (1 + VAT%)).</p>
              </div>
            </div>
            <div class="p-4 rounded bg-white/70 shadow">
              <h3 class="font-medium text-gray-800 mb-3">Breakdown</h3>
              <div id="cc-breakdown" class="text-sm text-gray-800"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Bind inputs
    document.getElementById('cb-company')?.addEventListener('change', (e) => {
      this.companyId = e.target.value;
      // Update default price per kg when switching companies
      const compSel = this.getSelectedCompany();
      this.pricePerKg = compSel?.laundryPriceKg ?? 1.90;
      // Reset active property if needed
      if (compSel?.propertyBased) {
        this.activePropertyId = '';
      }
      this.savePrefs();
      this.render();
    });
    document.getElementById('cb-type')?.addEventListener('change', (e) => { this.type = e.target.value; this.updateBreakdown(); });
    document.getElementById('cb-property')?.addEventListener('change', (e) => {
      this.activePropertyId = e.target.value;
      // Update the price input for the selected property
      const priceInput = document.getElementById('cb-company-price');
      if (priceInput) {
        const props = Array.isArray(window.propertiesManager?.properties) ? window.propertiesManager.properties : [];
        const prop = props.find(p => p.id === this.activePropertyId);
        const price = Number((prop?.cleaningCompanyPrice ?? this.thatsMaidPrices[this.activePropertyId] ?? 0) || 0);
        priceInput.value = price;
      }
      // Auto-fill travel location from the property's location
      const props = Array.isArray(window.propertiesManager?.properties) ? window.propertiesManager.properties : [];
      const prop = props.find(p => p.id === this.activePropertyId);
      const propLoc = this.normalizeLocation(prop?.location);
      this.location = propLoc || '';
      const locSelect = document.getElementById('cb-location');
      if (locSelect) {
        locSelect.value = this.location || '';
      }
      this.savePrefs();
      this.updateBreakdown();
    });
    document.getElementById('cb-company-price')?.addEventListener('input', async (e) => {
      const val = parseFloat(e.target.value) || 0;
      if (this.activePropertyId) {
        // Persist locally as fallback
        this.thatsMaidPrices[this.activePropertyId] = val;
        this.saveThatsMaidPrices();
        // Persist to Firestore so it syncs with Property Settings and All Info
        try {
          await window.propertiesManager?.updateProperty?.(this.activePropertyId, { cleaningCompanyPrice: val });
        } catch (err) {
          console.warn('Failed to update cleaningCompanyPrice to Firestore:', err);
        }
      }
      this.updateBreakdown();
    });
    document.getElementById('cb-location')?.addEventListener('change', (e) => { this.location = e.target.value; this.updateBreakdown(); });
    document.getElementById('cb-kg')?.addEventListener('input', (e) => { this.defaultKg = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cb-price-kg')?.addEventListener('input', (e) => { this.pricePerKg = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cb-reset')?.addEventListener('click', () => { this.reset(); });
    document.getElementById('cb-copy')?.addEventListener('click', () => { this.copyBreakdown(); });

    this.updateBreakdown();

    // Commission inputs wiring
    document.getElementById('cc-total')?.addEventListener('input', (e) => { this.totalPosted = parseFloat(e.target.value) || 0; this.updateCommissionBreakdown(); });
    document.getElementById('cc-platform')?.addEventListener('input', (e) => { this.platformPct = parseFloat(e.target.value) || 0; this.updateCommissionBreakdown(); });
    document.getElementById('cc-vat')?.addEventListener('input', (e) => { this.vatPct = parseFloat(e.target.value) || 0; this.updateCommissionBreakdown(); });
    document.getElementById('cc-reset')?.addEventListener('click', () => this.resetCommission());
    document.getElementById('cc-copy')?.addEventListener('click', () => this.copyCommissionBreakdown());

    this.updateCommissionBreakdown();
  }

  // ---------- Logic ----------
  compute() {
    const kg = Number.isFinite(this.defaultKg) ? this.defaultKg : 0;
    const priceKg = Number.isFinite(this.pricePerKg) ? this.pricePerKg : 0;
    const laundry = kg * priceKg;
    const compNow = this.getSelectedCompany();
    const cleaning = compNow?.propertyBased
      ? (() => {
        const props = Array.isArray(window.propertiesManager?.properties) ? window.propertiesManager.properties : [];
        const prop = props.find(p => p.id === this.activePropertyId);
        const price = parseFloat(prop?.cleaningCompanyPrice);
        return Number.isFinite(price) ? price : (Number(this.thatsMaidPrices[this.activePropertyId]) || 0);
      })()
      : (this.CLEANING_FEES[this.type] || 0);
    const travel = this.location ? (TRAVEL_FEES[this.location] || 0) : 0;
    const total = laundry + cleaning + travel;
    return { kg, priceKg, laundry, cleaning, travel, total };
  }

  updateBreakdown() {
    const el = document.getElementById('cb-breakdown');
    if (!el) return;
    const { kg, priceKg, laundry, cleaning, travel, total } = this.compute();
    const locText = this.location ? `${this.location} — ${this.formatCurrency(travel)}` : 'No travel selected';
    // Resolve property name for display when using property-based companies
    const allProps = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    const propName = allProps.find(p => p.id === this.activePropertyId)?.name || this.activePropertyId || 'N/A';
    const compDisp = this.getSelectedCompany();
    const cleaningLine = (compDisp?.propertyBased)
      ? `Property: <strong>${propName}</strong> — Cleaning: <strong>${this.formatCurrency(cleaning)}</strong>`
      : `Cleaning type: <strong>${this.type}</strong> — ${this.formatCurrency(cleaning)}`;
    el.innerHTML = `
      <div class="space-y-1">
        <div>Company: <strong>${compDisp?.label || 'N/A'}</strong></div>
        <div>${cleaningLine}</div>
        <div>Laundry: <strong>${kg.toFixed(1)} kg</strong> × ${this.formatCurrency(priceKg)} = <strong>${this.formatCurrency(laundry)}</strong></div>
        <div>Travel: <strong>${locText}</strong></div>
        <hr class="my-2" />
        <div class="text-lg">Total: <strong>${this.formatCurrency(total)}</strong></div>
      </div>
    `;
  }

  reset() {
    this.companyId = 'seletivo';
    this.type = 'T1';
    this.location = '';
    this.defaultKg = 8.5;
    this.pricePerKg = this.getSelectedCompany()?.laundryPriceKg ?? 1.90;
    this.activePropertyId = '';
    this.savePrefs();
    this.render();
  }

  // ---------- Commission logic (inside Cleaning Bills) ----------
  computeCommission() {
    const total = Number.isFinite(this.totalPosted) ? this.totalPosted : 0;
    const pctPlat = (Number.isFinite(this.platformPct) ? this.platformPct : 0) / 100.0;
    const pctVat = (Number.isFinite(this.vatPct) ? this.vatPct : 0) / 100.0;
    const platformFee = total * pctPlat; // e.g., 15% of total posted
    const vat = total * (pctVat / (1.0 + pctVat)); // VAT extracted from gross
    const net = total - platformFee - vat;
    return { total, platformFee, vat, net, pctPlat, pctVat };
  }

  updateCommissionBreakdown() {
    const el = document.getElementById('cc-breakdown');
    if (!el) return;
    const { total, platformFee, vat, net, pctPlat, pctVat } = this.computeCommission();
    const expression = `${this.formatCurrency(total)} − ${this.formatCurrency(platformFee)} − ${this.formatCurrency(vat)} = ${this.formatCurrency(net)}`;
    el.innerHTML = `
      <div class="space-y-1">
        <div>Total posted: <strong>${this.formatCurrency(total)}</strong></div>
        <div>Platform (${(pctPlat * 100).toFixed(2)}%): <strong>${this.formatCurrency(platformFee)}</strong></div>
        <div>VAT extracted ${(pctVat * 100).toFixed(2)}%: <strong>${this.formatCurrency(vat)}</strong></div>
        <hr class="my-2" />
        <div class="text-sm text-gray-700">${expression}</div>
        <div class="text-lg">Net remaining: <strong>${this.formatCurrency(net)}</strong></div>
      </div>
    `;
  }

  resetCommission() {
    this.totalPosted = 100.0;
    this.platformPct = 15.0;
    this.vatPct = 22.0;
    this.render();
  }

  copyCommissionBreakdown() {
    const { total, platformFee, vat, net, pctPlat, pctVat } = this.computeCommission();
    const lines = [
      `Total posted: ${this.formatCurrency(total)}`,
      `Platform (${(pctPlat * 100).toFixed(2)}%): ${this.formatCurrency(platformFee)}`,
      `VAT extracted ${(pctVat * 100).toFixed(2)}%: ${this.formatCurrency(vat)}`,
      `Net remaining: ${this.formatCurrency(net)}`,
    ];
    const text = lines.join('\n');
    try {
      navigator.clipboard.writeText(text);
      alert('Breakdown copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Breakdown copied to clipboard');
    }
  }

  copyBreakdown() {
    const { kg, priceKg, laundry, cleaning, travel, total } = this.compute();
    const allProps = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    const propName = allProps.find(p => p.id === this.activePropertyId)?.name || this.activePropertyId || 'N/A';
    const compTxt = this.getSelectedCompany()?.label || 'N/A';
    const isPropBased = this.getSelectedCompany()?.propertyBased;
    const lines = [
      `Company: ${compTxt}`,
      isPropBased
        ? `Property: ${propName} — Cleaning: ${this.formatCurrency(cleaning)}`
        : `Cleaning type: ${this.type} — ${this.formatCurrency(cleaning)}`,
      `Laundry: ${kg.toFixed(1)} kg × ${this.formatCurrency(priceKg)} = ${this.formatCurrency(laundry)}`,
      `Travel: ${this.location || 'N/A'} ${this.location ? '— ' + this.formatCurrency(travel) : ''}`,
      `Total: ${this.formatCurrency(total)}`,
    ];
    const text = lines.join('\n');
    try {
      navigator.clipboard.writeText(text);
      alert('Breakdown copied to clipboard');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      alert('Breakdown copied to clipboard');
    }
  }

  formatCurrency(value) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value || 0);
    } catch {
      return `${(value || 0).toFixed(2)} €`;
    }
  }

  // ---------- Persistence helpers for That's Maid per-property prices ----------
  loadThatsMaidPrices() {
    try {
      const raw = localStorage.getItem('thatsMaidCleaningPrices');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  saveThatsMaidPrices() {
    try {
      localStorage.setItem('thatsMaidCleaningPrices', JSON.stringify(this.thatsMaidPrices || {}));
    } catch {
      // no-op
    }
  }
}
