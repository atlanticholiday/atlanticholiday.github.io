export class CleaningBillsManager {
  constructor() {
    this.defaultKg = 8.5;
    this.pricePerKg = 1.90;
    this.type = 'T1';
    this.location = '';

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

    // Travel fees
    this.TRAVEL_FEES = {
      'Água de Pena': 18.00,
      'Arco da Calheta': 22.00,
      'Arco de São Jorge': 30.00,
      'Calheta': 19.00,
      'Câmara de Lobos': 5.00,
      'Caniçal': 22.00,
      'Caniço': 11.00,
      'Fajã da Ovelha': 27.00,
      'Funchal': 5.00,
      'Gaula': 15.00,
      'Ilha': 37.00,
      'Machico': 20.00,
      'Madalena do Mar': 13.00,
      'Paul Do Mar': 31.00,
      'Ponta Delgada': 23.00,
      'Ponta do Sol': 13.00,
      'Porto Moniz': 31.00,
      'Porto novo': 15.00,
      'Ribeira Brava': 8.00,
      'Ribeira da Janela': 37.00,
      'Santa Cruz': 16.00,
      'Santa do Porto Moniz': 33.00,
      'Santana': 33.00,
      'São Jorge': 34.00,
      'São Vicente': 20.00,
    };

    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.ensureDomScaffold(), 50);
      document.addEventListener('cleaningBillsPageOpened', () => {
        this.ensureDomScaffold();
        this.render();
      });
    }
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
      const propsBtn = document.getElementById('go-to-properties-btn');
      if (propsBtn && propsBtn.parentElement) {
        const parent = propsBtn.parentElement;
        const card = document.createElement('button');
        card.id = 'go-to-cleaning-bills-btn';
        card.className = propsBtn.className || 'dashboard-card';
        card.innerHTML = propsBtn.innerHTML || '<span class="text-base">Cleaning Bills</span>';
        try {
          const textNode = card.querySelector('h3, span, .title');
          if (textNode) textNode.textContent = 'Cleaning Bills';
          else card.textContent = 'Cleaning Bills';
        } catch {}
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

    const typeOptions = Object.keys(this.CLEANING_FEES)
      .map(k => `<option value="${k}" ${k===this.type?'selected':''}>${k} — ${this.formatCurrency(this.CLEANING_FEES[k])}</option>`)
      .join('');

    const locations = Object.keys(this.TRAVEL_FEES);
    const locationOptions = [''].concat(locations)
      .map(name => `<option value="${name}">${name || 'Select location'}</option>`)
      .join('');

    root.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="p-4 rounded bg-white/70 shadow">
            <h2 class="font-medium text-gray-800 mb-3">Inputs</h2>
            <div class="space-y-3">
              <label class="block">
                <span class="text-sm text-gray-600">Cleaning Type</span>
                <select id="cb-type" class="w-full">${typeOptions}</select>
              </label>
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
            <h2 class="font-medium text-gray-800 mb-3">Breakdown</h2>
            <div id="cb-breakdown" class="text-sm text-gray-800"></div>
          </div>
        </div>
      </div>
    `;

    // Bind inputs
    document.getElementById('cb-type')?.addEventListener('change', (e) => { this.type = e.target.value; this.updateBreakdown(); });
    document.getElementById('cb-location')?.addEventListener('change', (e) => { this.location = e.target.value; this.updateBreakdown(); });
    document.getElementById('cb-kg')?.addEventListener('input', (e) => { this.defaultKg = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cb-price-kg')?.addEventListener('input', (e) => { this.pricePerKg = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cb-reset')?.addEventListener('click', () => { this.reset(); });
    document.getElementById('cb-copy')?.addEventListener('click', () => { this.copyBreakdown(); });

    this.updateBreakdown();
  }

  // ---------- Logic ----------
  compute() {
    const kg = Number.isFinite(this.defaultKg) ? this.defaultKg : 0;
    const priceKg = Number.isFinite(this.pricePerKg) ? this.pricePerKg : 0;
    const laundry = kg * priceKg;
    const cleaning = this.CLEANING_FEES[this.type] || 0;
    const travel = this.location ? (this.TRAVEL_FEES[this.location] || 0) : 0;
    const total = laundry + cleaning + travel;
    return { kg, priceKg, laundry, cleaning, travel, total };
  }

  updateBreakdown() {
    const el = document.getElementById('cb-breakdown');
    if (!el) return;
    const { kg, priceKg, laundry, cleaning, travel, total } = this.compute();
    const locText = this.location ? `${this.location} — ${this.formatCurrency(travel)}` : 'No travel selected';
    el.innerHTML = `
      <div class="space-y-1">
        <div>Cleaning type: <strong>${this.type}</strong> — ${this.formatCurrency(cleaning)}</div>
        <div>Laundry: <strong>${kg.toFixed(1)} kg</strong> × ${this.formatCurrency(priceKg)} = <strong>${this.formatCurrency(laundry)}</strong></div>
        <div>Travel: <strong>${locText}</strong></div>
        <hr class="my-2" />
        <div class="text-lg">Total: <strong>${this.formatCurrency(total)}</strong></div>
      </div>
    `;
  }

  reset() {
    this.type = 'T1';
    this.location = '';
    this.defaultKg = 8.5;
    this.pricePerKg = 1.90;
    this.render();
  }

  copyBreakdown() {
    const { kg, priceKg, laundry, cleaning, travel, total } = this.compute();
    const lines = [
      `Cleaning type: ${this.type} — ${this.formatCurrency(cleaning)}`,
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
}
