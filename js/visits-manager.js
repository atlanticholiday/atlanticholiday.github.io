import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class VisitsManager {
  constructor(db, userId) {
    this.db = db || null;
    this.userId = userId || null;
    this.activePropertyId = null;
    // Restore last month if available
    const savedMonth = (() => { try { return localStorage.getItem('visits:lastMonthKey'); } catch { return null; } })();
    this.monthKey = savedMonth || this.getMonthKey(new Date());
    this.days = [];
    this.unsubscribe = null;
    this.subTab = 'schedule'; // 'schedule' | 'summary' | 'daily'
    this.bulkDay = (() => { try { const n = parseInt(localStorage.getItem('visits:bulkDay')||'',10); return Number.isInteger(n) ? n : new Date().getDate(); } catch { return new Date().getDate(); } })();
    this._dailyRows = [];
    this._dailyBaseline = new Map();
    // Daily view preferences
    this.dailyCompact = (() => { try { return localStorage.getItem('visits:dailyCompact') === '1'; } catch { return false; } })();
    this.dailyCols = (() => { try { const n = parseInt(localStorage.getItem('visits:dailyCols')||'1',10); return [1,2,3].includes(n) ? n : 1; } catch { return 1; } })();

    // Try to restore last selection
    try {
      const saved = localStorage.getItem('visits:lastProperty');
      if (saved) this.activePropertyId = saved;
    } catch {}

    // Ensure DOM scaffold shortly after load
    if (typeof window !== 'undefined') {
      window.setTimeout(() => this.ensureDomScaffold(), 50);
      // Re-render when page opens
      document.addEventListener('visitsPageOpened', () => {
        this.ensureDomScaffold();
        this.render();
      });
      // Re-render when properties data changes (e.g., initial load completes)
      document.addEventListener('propertiesDataUpdated', () => {
        // Only re-render if page exists; rendering when hidden is OK (cheap)
        if (document.getElementById('visits-page')) {
          this.render();
        }

      });
    }
  }

  setUser(userId) {
    this.userId = userId || null;
    // Refresh subscription if property selected
    this.subscribeToMonth();
  }

  setDatabase(db) {
    this.db = db || null;
  }

  // ---------- Firestore helpers ----------
  monthDocRef() {
    if (!this.db || !this.userId || !this.activePropertyId || !this.monthKey) return null;
    return doc(this.db, `users/${this.userId}/properties/${this.activePropertyId}/visits/${this.monthKey}`);
  }

  async loadOnce() {
    const ref = this.monthDocRef();
    if (!ref) return;
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        this.days = Array.isArray(data.days) ? data.days.slice().sort((a,b) => a - b) : [];
      } else {
        this.days = [];
      }
    } catch (e) {
      console.warn('[Visits] loadOnce failed:', e);
      this.days = [];
    }
  }

  subscribeToMonth() {
    // Stop previous
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
    const ref = this.monthDocRef();
    if (!ref) {
      // No active user/db/property/month yet — do not recurse into render()
      // Just clear days and render the (empty) calendar.
      this.days = [];
      this.renderCalendar();
      return;
    }
    this.unsubscribe = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        this.days = Array.isArray(data.days) ? data.days.slice().sort((a,b) => a - b) : [];
      } else {
        this.days = [];
      }
      this.renderCalendar();
    }, (err) => console.warn('[Visits] listener error:', err));
  }

  stopListening() {
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
  }

  // ---------- UI scaffold ----------
  ensureDomScaffold() {
    // Page container
    if (!document.getElementById('visits-page')) {
      const page = document.createElement('div');
      page.id = 'visits-page';
      page.className = 'hidden min-h-screen';
      page.innerHTML = `
        <div class="max-w-6xl mx-auto py-6 px-4">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <button id="back-to-landing-from-visits-btn" class="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center">
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                Back
              </button>
              <h1 class="text-xl font-semibold text-gray-900">Visits</h1>
            </div>
            <button id="visits-sign-out-btn" class="text-sm text-red-600 hover:underline">Sign out</button>
          </div>
          <div id="visits-root" class="glass-effect-strong p-4"></div>
        </div>`;
      // Append near other pages
      const landing = document.getElementById('landing-page');
      if (landing && landing.parentElement) {
        landing.parentElement.appendChild(page);
      } else {
        document.body.appendChild(page);
      }
    }

    // Landing button card
    if (!document.getElementById('go-to-visits-btn')) {
      // Try to find an existing dashboard grid by locating the properties button
      const propsBtn = document.getElementById('go-to-properties-btn');
      if (propsBtn && propsBtn.parentElement) {
        const parent = propsBtn.parentElement;
        const card = document.createElement('button');
        card.id = 'go-to-visits-btn';
        card.className = propsBtn.className || 'dashboard-card';
        card.innerHTML = propsBtn.innerHTML || '<span class="text-base">Visits</span>';
        // If we cloned innerHTML, change label to Visits if we can
        try {
          const textNode = card.querySelector('h3, span, .title');
          if (textNode) textNode.textContent = 'Visits';
          else card.textContent = 'Visits';
        } catch {}
        parent.appendChild(card);
      } else {
        // Fallback: append a simple link inside landing page
        const landing = document.getElementById('landing-page');
        if (landing) {
          const fallback = document.createElement('button');
          fallback.id = 'go-to-visits-btn';
          fallback.className = 'dashboard-card px-4 py-3 border rounded bg-white hover:shadow';
          fallback.textContent = 'Visits';
          landing.appendChild(fallback);
        }
      }
    }
  }

  // ---------- Rendering ----------
  getMonthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  getMonthMeta(year, monthIndex) {
    // monthIndex: 0-11
    const first = new Date(year, monthIndex, 1);
    const firstWeekday = first.getDay(); // 0 Sunday ... 6 Saturday
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return { firstWeekday, daysInMonth };
  }

  changeMonth(delta) {
    const [y, m] = this.monthKey.split('-').map(n => parseInt(n, 10));
    const d = new Date(y, m - 1 + delta, 1);
    this.monthKey = this.getMonthKey(d);
    try { localStorage.setItem('visits:lastMonthKey', this.monthKey); } catch {}
    this.subscribeToMonth();
    this.renderHeader();
  }

  setProperty(propId) {
    this.activePropertyId = propId || null;
    try { localStorage.setItem('visits:lastProperty', this.activePropertyId || ''); } catch {}
    this.subscribeToMonth();
    this.renderHeader();
  }

  render() {
    this.ensureDomScaffold();
    const root = document.getElementById('visits-root');
    if (!root) return;

    const properties = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];

    // Ensure a valid selected property
    const hasActive = this.activePropertyId && properties.some(p => p.id === this.activePropertyId);
    if (!hasActive && properties.length) {
      this.activePropertyId = properties[0].id;
      try { localStorage.setItem('visits:lastProperty', this.activePropertyId); } catch {}
      this.subscribeToMonth();
    }

    // Sub-navigation inside Visits (segmented control)
    root.innerHTML = `
      <div class="mb-4">
        <nav class="visits-tabs flex gap-2 flex-wrap" aria-label="Tabs">
          <button id="visits-tab-schedule" class="view-btn ${this.subTab === 'schedule' ? 'active' : ''}">Schedule</button>
          <button id="visits-tab-summary" class="view-btn ${this.subTab === 'summary' ? 'active' : ''}">Summary</button>
          <button id="visits-tab-daily" class="view-btn ${this.subTab === 'daily' ? 'active' : ''}">Daily</button>
        </nav>
      </div>
      <div id="visits-content"></div>
    `;

    // Bind sub-tab switching
    document.getElementById('visits-tab-schedule')?.addEventListener('click', () => { this.subTab = 'schedule'; this.render(); });
    document.getElementById('visits-tab-summary')?.addEventListener('click', () => { this.subTab = 'summary'; this.render(); });
    document.getElementById('visits-tab-daily')?.addEventListener('click', () => { this.subTab = 'daily'; this.render(); });

    const content = document.getElementById('visits-content');
    if (!content) return;
    if (this.subTab === 'schedule') {
      content.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <label class="text-xs uppercase tracking-wide text-gray-500">Property</label>
            <select id="visits-property-select" class="w-56"></select>
          </div>
          <div class="flex items-center gap-2">
            <button id="visits-prev-month" class="view-btn">Prev</button>
            <button id="visits-today" class="view-btn">Today</button>
            <button id="visits-next-month" class="view-btn">Next</button>
            <div id="visits-month-label" class="status-indicator ml-2"></div>
          </div>
          <div class="flex items-center gap-2">
            <button id="visits-export-csv" class="view-btn">Export CSV</button>
            <button id="visits-export-pdf" class="view-btn">Export PDF</button>
          </div>
        </div>
        <div id="visits-calendar" class="calendar-mini"></div>
      `;
      // populate select options after injection
      const selHtml = `${properties.map(p => `<option value="${p.id}" ${p.id === this.activePropertyId ? 'selected' : ''}>${(p.name || p.displayName || p.title || p.code || p.reference || p.id)}</option>`).join('')}`;
      const selEl = document.getElementById('visits-property-select');
      if (selEl) selEl.innerHTML = selHtml;

      // Bind controls for schedule
      const sel = document.getElementById('visits-property-select');
      if (sel) sel.addEventListener('change', (e) => this.setProperty(e.target.value));
      document.getElementById('visits-prev-month')?.addEventListener('click', () => this.changeMonth(-1));
      document.getElementById('visits-next-month')?.addEventListener('click', () => this.changeMonth(1));
      document.getElementById('visits-today')?.addEventListener('click', () => {
        const mk = this.getMonthKey(new Date());
        if (this.monthKey !== mk) {
          this.monthKey = mk;
          try { localStorage.setItem('visits:lastMonthKey', this.monthKey); } catch {}
          this.subscribeToMonth();
        }
        this.renderHeader();
        if (this.subTab === 'schedule') this.renderCalendar();
      });
      document.getElementById('visits-export-csv')?.addEventListener('click', () => this.exportCsv());
      document.getElementById('visits-export-pdf')?.addEventListener('click', () => this.exportPdf());

      // Initial header + subscribe
      this.renderHeader();
      this.subscribeToMonth();
      this.renderCalendar();
    } else if (this.subTab === 'summary') {
      // Summary view
      content.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <button id="visits-prev-month" class="view-btn">Prev</button>
            <button id="visits-today" class="view-btn">Today</button>
            <button id="visits-next-month" class="view-btn">Next</button>
            <div id="visits-month-label" class="status-indicator ml-2"></div>
          </div>
          <div class="flex items-center gap-2">
            <button id="visits-summary-refresh" class="view-btn">Refresh</button>
            <button id="visits-summary-export" class="view-btn">Export CSV</button>
          </div>
        </div>
        <div id="visits-summary-body" class="text-sm"></div>
      `;

      document.getElementById('visits-prev-month')?.addEventListener('click', () => { this.changeMonth(-1); if (this.subTab==='summary') this.loadAndRenderSummary(); });
      document.getElementById('visits-next-month')?.addEventListener('click', () => { this.changeMonth(1); if (this.subTab==='summary') this.loadAndRenderSummary(); });
      document.getElementById('visits-today')?.addEventListener('click', () => {
        const mk = this.getMonthKey(new Date());
        if (this.monthKey !== mk) {
          this.monthKey = mk;
          try { localStorage.setItem('visits:lastMonthKey', this.monthKey); } catch {}
        }
        this.renderHeader();
        if (this.subTab==='summary') this.loadAndRenderSummary();
      });
      document.getElementById('visits-summary-refresh')?.addEventListener('click', () => this.loadAndRenderSummary());
      document.getElementById('visits-summary-export')?.addEventListener('click', () => this.exportSummaryCsv());

      this.renderHeader();
      this.loadAndRenderSummary();
    } else if (this.subTab === 'daily') {
      // Bulk daily marking view
      const [y, m] = this.monthKey.split('-').map(n => parseInt(n, 10));
      const daysInMonth = new Date(y, m, 0).getDate();
      if (this.bulkDay < 1 || this.bulkDay > daysInMonth) this.bulkDay = Math.min(Math.max(1, this.bulkDay||1), daysInMonth);
      const dayOptions = Array.from({length: daysInMonth}, (_,i) => i+1)
        .map(d => `<option value="${d}" ${d===this.bulkDay?'selected':''}>${d}</option>`).join('');
      content.innerHTML = `
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2 flex-wrap">
            <button id="visits-prev-month" class="view-btn">Prev</button>
            <button id="visits-today" class="view-btn">Today</button>
            <button id="visits-next-month" class="view-btn">Next</button>
            <div id="visits-month-label" class="status-indicator ml-2"></div>
            <label class="ml-2 text-xs uppercase tracking-wide text-gray-500">Day</label>
            <select id="visits-daily-day" class="w-24">${dayOptions}</select>
            <input id="visits-daily-filter" placeholder="Filter properties" class="ml-2 w-64" />
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <label class="inline-flex items-center text-sm text-gray-700"><input type="checkbox" id="visits-daily-compact" class="mr-1" ${this.dailyCompact?'checked':''}/>Compact</label>
            <select id="visits-daily-cols" class="w-24">
              <option value="1" ${this.dailyCols===1?'selected':''}>1 col</option>
              <option value="2" ${this.dailyCols===2?'selected':''}>2 cols</option>
              <option value="3" ${this.dailyCols===3?'selected':''}>3 cols</option>
            </select>
            <button id="visits-daily-select-all" class="view-btn">Select All (filtered)</button>
            <button id="visits-daily-clear-all" class="view-btn">Clear All (filtered)</button>
            <button id="visits-daily-save" class="btn-primary">Save</button>
          </div>
        </div>
        <div id="visits-daily-body" class="text-sm"></div>
      `;

      document.getElementById('visits-prev-month')?.addEventListener('click', () => { this.changeMonth(-1); if (this.subTab==='daily') this.loadAndRenderDaily(); });
      document.getElementById('visits-next-month')?.addEventListener('click', () => { this.changeMonth(1); if (this.subTab==='daily') this.loadAndRenderDaily(); });
      document.getElementById('visits-today')?.addEventListener('click', () => {
        const mk = this.getMonthKey(new Date());
        if (this.monthKey !== mk) {
          this.monthKey = mk;
          try { localStorage.setItem('visits:lastMonthKey', this.monthKey); } catch {}
        }
        this.renderHeader();
        if (this.subTab==='daily') this.loadAndRenderDaily();
      });
      document.getElementById('visits-daily-day')?.addEventListener('change', (e) => { this.bulkDay = parseInt(e.target.value,10)||1; try { localStorage.setItem('visits:bulkDay', String(this.bulkDay)); } catch {}; this.loadAndRenderDaily(); });
      document.getElementById('visits-daily-filter')?.addEventListener('input', (e) => this.renderDailyRows(e.target.value));
      document.getElementById('visits-daily-compact')?.addEventListener('change', (e) => { this.dailyCompact = !!e.target.checked; try { localStorage.setItem('visits:dailyCompact', this.dailyCompact ? '1' : '0'); } catch {}; this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||''); });
      document.getElementById('visits-daily-cols')?.addEventListener('change', (e) => { const n = parseInt(e.target.value,10)||1; this.dailyCols = [1,2,3].includes(n)?n:1; try { localStorage.setItem('visits:dailyCols', String(this.dailyCols)); } catch {}; this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||''); });
      document.getElementById('visits-daily-select-all')?.addEventListener('click', () => {
        const ft = (document.getElementById('visits-daily-filter')?.value||'').toLowerCase();
        this._dailyRows.filter(r => r.name.toLowerCase().includes(ft)).forEach(r => { r.visited = true; r._changed = (r.visited !== r._baseline); });
        this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||'');
      });
      document.getElementById('visits-daily-clear-all')?.addEventListener('click', () => {
        const ft = (document.getElementById('visits-daily-filter')?.value||'').toLowerCase();
        this._dailyRows.filter(r => r.name.toLowerCase().includes(ft)).forEach(r => { r.visited = false; r._changed = (r.visited !== r._baseline); });
        this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||'');
      });
      document.getElementById('visits-daily-save')?.addEventListener('click', () => this.saveDailyChanges());

      this.renderHeader();
      this.loadAndRenderDaily();
    }
  }

  renderHeader() {
    const label = document.getElementById('visits-month-label');
    if (!label) return;
    const [y, m] = this.monthKey.split('-').map(n => parseInt(n, 10));
    const monthName = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    label.textContent = monthName;
  }

  async loadAndRenderSummary() {
    const body = document.getElementById('visits-summary-body');
    if (!body) return;
    const properties = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    if (!this.userId || !this.db) {
      body.innerHTML = '<div class="text-gray-500">No user/database context.</div>';
      return;
    }
    body.innerHTML = '<div class="text-gray-500">Loading...</div>';
    const [y, m] = this.monthKey.split('-').map(n => parseInt(n, 10));
    const dayCount = new Date(y, m, 0).getDate();
    const fetches = properties.map(async (p) => {
      const ref = doc(this.db, `users/${this.userId}/properties/${p.id}/visits/${this.monthKey}`);
      try {
        const snap = await getDoc(ref);
        const days = snap.exists() && Array.isArray(snap.data().days) ? snap.data().days : [];
        return { id: p.id, name: (p.name || p.displayName || p.title || p.code || p.reference || p.id), count: days.length, days: days.sort((a,b)=>a-b) };
      } catch {
        return { id: p.id, name: (p.name || p.displayName || p.title || p.code || p.reference || p.id), count: 0, days: [] };
      }
    });
    const rows = await Promise.all(fetches);
    rows.sort((a,b) => a.name.localeCompare(b.name));
    const totalVisitedDays = rows.reduce((acc, r) => acc + r.count, 0);
    const html = `
      <div class="mb-2 text-gray-700">Properties: ${rows.length} • Total marks this month: ${totalVisitedDays}</div>
      <div class="overflow-auto glass-effect-strong">
        <table class="visits-table min-w-full text-left text-sm">
          <thead>
            <tr>
              <th class="px-3 py-2">Property</th>
              <th class="px-3 py-2">Count</th>
              <th class="px-3 py-2">Days</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td class="px-3 py-2 whitespace-nowrap">${r.name}</td>
                <td class="px-3 py-2">${r.count}</td>
                <td class="px-3 py-2">${r.days.join(', ')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    body.innerHTML = html;
    // Cache summary rows for export
    this._summaryRows = rows;
  }

  exportSummaryCsv() {
    const rows = Array.isArray(this._summaryRows) ? this._summaryRows : [];
    const csvRows = [['Property','Month','Count','Days']].concat(
      rows.map(r => [r.name, this.monthKey, String(r.count), r.days.join(',')])
    );
    const csv = csvRows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `visits-summary-${this.monthKey}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  async loadAndRenderDaily() {
    const body = document.getElementById('visits-daily-body');
    if (!body) return;
    const properties = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    if (!this.userId || !this.db) {
      body.innerHTML = '<div class="text-gray-500">No user/database context.</div>';
      return;
    }
    body.innerHTML = '<div class="text-gray-500">Loading...</div>';
    // Fetch all month docs and compute visited flag for selected day
    const fetches = properties.map(async (p) => {
      const ref = doc(this.db, `users/${this.userId}/properties/${p.id}/visits/${this.monthKey}`);
      try {
        const snap = await getDoc(ref);
        const days = snap.exists() && Array.isArray(snap.data().days) ? snap.data().days : [];
        const visited = days.includes(this.bulkDay);
        return { id: p.id, name: (p.name || p.displayName || p.title || p.code || p.reference || p.id), visited };
      } catch {
        return { id: p.id, name: (p.name || p.displayName || p.title || p.code || p.reference || p.id), visited: false };
      }
    });
    const rows = await Promise.all(fetches);
    rows.sort((a,b) => a.name.localeCompare(b.name));
    // Baseline for change detection
    this._dailyRows = rows.map(r => ({ ...r, _baseline: r.visited, _changed: false }));
    this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||'');
  }

  renderDailyRows(filterText) {
    const body = document.getElementById('visits-daily-body');
    if (!body) return;
    const ft = (filterText||'').toLowerCase();
    const rows = this._dailyRows.filter(r => r.name.toLowerCase().includes(ft));
    const selectedCount = rows.filter(r => r.visited).length;
    const changedCount = rows.filter(r => r._changed).length;
    const statusBar = `
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs text-gray-600">Day ${this.bulkDay} • Visible: ${rows.length} • Selected: ${selectedCount} • Changed: ${changedCount}</div>
        <div class="flex items-center gap-2">
          <button id="visits-daily-reset" class="view-btn">Reset (filtered)</button>
        </div>
      </div>
    `;
    let html = '';
    if (this.dailyCompact || this.dailyCols > 1) {
      const colsClass = this.dailyCols === 3 ? 'grid-cols-3' : (this.dailyCols === 2 ? 'grid-cols-2' : 'grid-cols-1');
      html = `
        ${statusBar}
        <div class="grid ${colsClass} gap-1">
          ${rows.map((r) => `
            <label class="flex items-center gap-2 border rounded px-2 py-1 text-xs bg-white hover:bg-gray-50 truncate" title="${r.name}">
              <input type="checkbox" data-id="${r.id}" ${r.visited?'checked':''}>
              <span class="truncate">${r.name}${r._changed? ' <span class=\"text-[10px] text-amber-600\">(changed)</span>':''}</span>
            </label>
          `).join('')}
        </div>
      `;
      body.innerHTML = html;
    } else {
      html = `
        ${statusBar}
        <div class="overflow-auto glass-effect-strong">
          <table class="visits-table min-w-full text-left text-sm">
            <thead>
              <tr>
                <th class="px-2 py-1">Visited</th>
                <th class="px-2 py-1">Property</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr>
                  <td class="px-2 py-1"><input type="checkbox" data-id="${r.id}" ${r.visited?'checked':''}></td>
                  <td class="px-2 py-1 whitespace-nowrap truncate" title="${r.name}">${r.name}${r._changed? ' <span class=\"text-xs text-amber-600\">(changed)</span>':''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
      body.innerHTML = html;
    }
    body.querySelectorAll('input[type="checkbox"][data-id]')?.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-id');
        const row = this._dailyRows.find(x => x.id === id);
        if (row) {
          row.visited = !!e.target.checked;
          row._changed = (row.visited !== row._baseline);
          // Update label with (changed)
          this.renderDailyRows(filterText);
        }
      });
    });
    document.getElementById('visits-daily-reset')?.addEventListener('click', () => {
      const ft2 = (filterText||'').toLowerCase();
      this._dailyRows.filter(r => r.name.toLowerCase().includes(ft2)).forEach(r => {
        r.visited = !!r._baseline;
        r._changed = false;
      });
      this.renderDailyRows(filterText);
    });
  }

  async saveDailyChanges() {
    if (!this.db || !this.userId) return;
    const changed = this._dailyRows.filter(r => r._changed);
    if (changed.length === 0) {
      alert('No changes to save.');
      return;
    }
    try {
      const batch = writeBatch(this.db);
      changed.forEach(r => {
        const ref = doc(this.db, `users/${this.userId}/properties/${r.id}/visits/${this.monthKey}`);
        if (r.visited) {
          batch.set(ref, { month: this.monthKey, updatedAt: serverTimestamp(), days: arrayUnion(this.bulkDay) }, { merge: true });
        } else {
          batch.set(ref, { updatedAt: serverTimestamp(), days: arrayRemove(this.bulkDay) }, { merge: true });
        }
      });
      await batch.commit();
      alert('Saved');
      // Reset baseline and change flags
      this._dailyRows.forEach(r => { r._baseline = r.visited; r._changed = false; });
      this.renderDailyRows(document.getElementById('visits-daily-filter')?.value||'');
    } catch (e) {
      console.warn('[Visits] saveDailyChanges failed:', e);
      alert('Failed to save changes');
    }
  }

  renderCalendar() {
    const cal = document.getElementById('visits-calendar');
    if (!cal) return;
    const [y, m] = this.monthKey.split('-').map(n => parseInt(n, 10));
    const { firstWeekday, daysInMonth } = this.getMonthMeta(y, m - 1);

    const weekdays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    let html = '';
    html += `<div class="grid grid-cols-7 gap-1 text-[11px] text-gray-500 uppercase tracking-wide mb-1">${weekdays.map(d => `<div class=\"text-center py-1\">${d}</div>`).join('')}</div>`;

    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push('');
    for (let d = 1; d <= daysInMonth; d++) cells.push(String(d));
    while (cells.length % 7 !== 0) cells.push('');

    html += '<div class="grid grid-cols-7 gap-1">';
    const selected = new Set(this.days || []);
    cells.forEach((txt) => {
      if (!txt) {
        html += `<div class="h-9 md:h-10 border border-transparent"></div>`;
      } else {
        const day = parseInt(txt, 10);
        const isOn = selected.has(day);
        const dt = new Date(y, m - 1, day);
        const w = dt.getDay();
        const isWeekend = (w === 0 || w === 6);
        const today = new Date();
        const isToday = (today.getFullYear() === y && (today.getMonth()+1) === m && today.getDate() === day);
        const base = 'day-cell h-9 md:h-10 text-sm flex items-center justify-center';
        const classes = [base];
        if (isOn) classes.push('selected');
        if (isWeekend) classes.push('weekend');
        if (isToday) classes.push('today');
        html += `<button class="${classes.join(' ')}" data-day="${day}">${day}</button>`;
      }
    });
    html += '</div>';

    cal.innerHTML = html;

    // Bind day clicks
    cal.querySelectorAll('button[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        const day = parseInt(btn.getAttribute('data-day'), 10);
        this.toggleDay(day);
      });
    });
  }

  async toggleDay(day) {
    const ref = this.monthDocRef();
    if (!ref) return;
    if (!Number.isInteger(day) || day < 1 || day > 31) return;

    const isSelected = (this.days || []).includes(day);
    try {
      if (isSelected) {
        await setDoc(ref, { updatedAt: serverTimestamp(), days: arrayRemove(day) }, { merge: true });
      } else {
        await setDoc(ref, { month: this.monthKey, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), days: arrayUnion(day) }, { merge: true });
      }
    } catch (e) {
      console.warn('[Visits] toggleDay failed:', e);
      alert('Failed to update visit');
    }
  }

  // ---------- Export ----------
  exportCsv() {
    const properties = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    const prop = properties.find(p => p.id === this.activePropertyId);
    const propName = prop?.name || prop?.displayName || prop?.title || prop?.code || prop?.reference || this.activePropertyId || '';
    const days = (this.days || []).slice().sort((a,b) => a - b).join(',');
    const rows = [
      ['Property', 'Month', 'Days'],
      [propName, this.monthKey, days]
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visits-${propName}-${this.monthKey}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  exportPdf() {
    // Use jsPDF if available; otherwise, fallback to CSV alert
    if (!window.jspdf && !window.jsPDF) {
      alert('PDF export requires jsPDF to be loaded. Use CSV export instead.');
      return;
    }
    const jsPDF = window.jsPDF || window.jspdf.jsPDF;
    const docx = new jsPDF();
    const properties = Array.isArray(window.propertiesManager?.properties)
      ? window.propertiesManager.properties
      : [];
    const prop = properties.find(p => p.id === this.activePropertyId);
    const propName = prop?.name || prop?.displayName || prop?.title || prop?.code || prop?.reference || this.activePropertyId || '';

    docx.setFontSize(14);
    docx.text(`Visits - ${propName}`, 14, 18);
    docx.setFontSize(11);
    docx.text(`Month: ${this.monthKey}`, 14, 26);
    const days = (this.days || []).slice().sort((a,b) => a - b).join(', ');
    docx.text(`Days: ${days || '(none)'}`, 14, 36);

    docx.save(`visits-${propName}-${this.monthKey}.pdf`);
  }
}
