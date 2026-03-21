export class CommissionCalculatorManager {
  constructor() {
    // Defaults
    this.totalPosted = 100.0; // gross amount shown on platform (VAT included)
    this.platformPct = 15.0;  // platform commission % of total posted
    this.vatPct = 22.0;       // VAT rate (%) to extract from total posted

    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.ensureDomScaffold(), 50);
      document.addEventListener('commissionCalculatorPageOpened', () => {
        this.ensureDomScaffold();
        this.render();
      });
    }
  }

  ensureDomScaffold() {
    // Page container
    if (!document.getElementById('commission-calculator-page')) {
      const page = document.createElement('div');
      page.id = 'commission-calculator-page';
      page.className = 'hidden min-h-screen';
      page.innerHTML = `
        <div class="max-w-5xl mx-auto py-6 px-4">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <button id="back-to-landing-from-commission-calculator-btn" class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>
              <h1 class="text-xl font-semibold text-gray-900">Commission Calculator</h1>
            </div>
            <button id="commission-calculator-sign-out-btn" class="text-sm text-red-600 hover:underline">Sign out</button>
          </div>
          <div id="commission-calculator-root" class="glass-effect-strong p-4"></div>
        </div>`;
      const landing = document.getElementById('landing-page');
      if (landing && landing.parentElement) {
        landing.parentElement.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    }

    // Landing button card
    if (!document.getElementById('go-to-commission-calculator-btn')) {
      const propsBtn = document.getElementById('go-to-properties-btn');
      if (propsBtn && propsBtn.parentElement) {
        const parent = propsBtn.parentElement;
        const card = document.createElement('button');
        card.id = 'go-to-commission-calculator-btn';
        card.className = propsBtn.className || 'dashboard-card';
        card.innerHTML = propsBtn.innerHTML || '<span class="text-base">Commission Calculator</span>';
        try {
          const textNode = card.querySelector('h3, span, .title');
          if (textNode) textNode.textContent = 'Commission Calculator';
          else card.textContent = 'Commission Calculator';
        } catch {}
        parent.appendChild(card);
      } else {
        const landing = document.getElementById('landing-page');
        if (landing) {
          const fallback = document.createElement('button');
          fallback.id = 'go-to-commission-calculator-btn';
          fallback.className = 'dashboard-card px-4 py-3 border rounded bg-white hover:shadow';
          fallback.textContent = 'Commission Calculator';
          landing.appendChild(fallback);
        }
      }
    }
  }

  render() {
    const root = document.getElementById('commission-calculator-root');
    if (!root) return;

    root.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded bg-white/70 shadow">
          <h2 class="font-medium text-gray-800 mb-3">Inputs</h2>
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
          <h2 class="font-medium text-gray-800 mb-3">Breakdown</h2>
          <div id="cc-breakdown" class="text-sm text-gray-800"></div>
        </div>
      </div>
    `;

    document.getElementById('cc-total')?.addEventListener('input', (e) => { this.totalPosted = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cc-platform')?.addEventListener('input', (e) => { this.platformPct = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cc-vat')?.addEventListener('input', (e) => { this.vatPct = parseFloat(e.target.value) || 0; this.updateBreakdown(); });
    document.getElementById('cc-reset')?.addEventListener('click', () => this.reset());
    document.getElementById('cc-copy')?.addEventListener('click', () => this.copyBreakdown());

    this.updateBreakdown();
  }

  compute() {
    const total = Number.isFinite(this.totalPosted) ? this.totalPosted : 0;
    const pctPlat = (Number.isFinite(this.platformPct) ? this.platformPct : 0) / 100.0;
    const pctVat = (Number.isFinite(this.vatPct) ? this.vatPct : 0) / 100.0;

    const platformFee = total * pctPlat; // 15% of total posted
    // VAT extracted from VAT-inclusive total: VAT = total * r / (1 + r)
    const vat = total * (pctVat / (1.0 + pctVat));
    const net = total - platformFee - vat;
    return { total, platformFee, vat, net, pctPlat, pctVat };
  }

  updateBreakdown() {
    const el = document.getElementById('cc-breakdown');
    if (!el) return;
    const { total, platformFee, vat, net, pctPlat, pctVat } = this.compute();
    const expression = `${this.formatCurrency(total)} − ${this.formatCurrency(platformFee)} − ${this.formatCurrency(vat)} = ${this.formatCurrency(net)}`;
    el.innerHTML = `
      <div class="space-y-1">
        <div>Total posted: <strong>${this.formatCurrency(total)}</strong></div>
        <div>Platform (${(pctPlat*100).toFixed(2)}%): <strong>${this.formatCurrency(platformFee)}</strong></div>
        <div>VAT extracted ${(pctVat*100).toFixed(2)}%: <strong>${this.formatCurrency(vat)}</strong></div>
        <hr class="my-2" />
        <div class="text-sm text-gray-700">${expression}</div>
        <div class="text-lg">Net remaining: <strong>${this.formatCurrency(net)}</strong></div>
      </div>
    `;
  }

  reset() {
    this.totalPosted = 100.0;
    this.platformPct = 15.0;
    this.vatPct = 22.0;
    this.render();
  }

  copyBreakdown() {
    const { total, platformFee, vat, net, pctPlat, pctVat } = this.compute();
    const lines = [
      `Total posted: ${this.formatCurrency(total)}`,
      `Platform (${(pctPlat*100).toFixed(2)}%): ${this.formatCurrency(platformFee)}`,
      `VAT extracted ${(pctVat*100).toFixed(2)}%: ${this.formatCurrency(vat)}`,
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

  formatCurrency(value) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value || 0);
    } catch {
      return `${(value || 0).toFixed(2)} €`;
    }
  }
}
