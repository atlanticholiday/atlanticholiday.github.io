import { doc, setDoc, onSnapshot, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class ChecklistsManager {
  constructor(userId = null) {
    this.userId = userId;
    this.storageKey = this._makeStorageKey(userId);
    this.state = this._loadState();
    // UI-only state (not persisted)
    this.collapsed = {};
    // Firestore sync state
    this.db = null;
    this._remoteUnsub = null;
    this._remoteSaveTimer = null;
    this._lastPushedJson = null;
    this._applyingRemote = false;
    // Sync status UI state
    this._syncStatus = 'Idle';
    this._syncEl = null;       // container badge
    this._syncDotEl = null;    // colored dot
    this._syncTextEl = null;   // status text
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this._setSyncStatus('Synced');
      });
      window.addEventListener('offline', () => {
        this._setSyncStatus('Offline');
      });
      if (window.navigator && window.navigator.onLine === false) {
        this._setSyncStatus('Offline');
      }
    }
    // Ensure projects structure and migrate old single-state if needed
    this._migrateStateIfNeeded();
  }

  setUser(userId) {
    // Stop any existing sync
    if (this._remoteUnsub) this._stopSync();
    this.userId = userId;
    this.storageKey = this._makeStorageKey(userId);
    this.state = this._loadState();
    this._migrateStateIfNeeded();
    if (this.db && this.userId) {
      this._startSync();
    }
  }

  _makeStorageKey(userId) {
    return `checklists:${userId || 'anon'}`;
  }

  _loadState() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to load checklist state:', e);
      return {};
    }
  }

  _saveState() {
    try {
      // Bump client-side updated timestamp
      this.state._updatedAtMs = Date.now();
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
      this._updateProgressSummary();
      // Queue remote sync if available
      this._queueRemoteSave();
    } catch (e) {
      console.warn('Failed to save checklist state:', e);
    }
  }

  _setSyncStatus(status) {
    this._syncStatus = status;
    // Update the badge if present
    if (this._syncEl) {
      const wrap = this._syncEl;
      const dot = this._syncDotEl;
      const text = this._syncTextEl;
      // Base container
      wrap.className = 'flex items-center gap-1 text-xs px-2 py-1 rounded-full border select-none';
      let containerCls = 'border-gray-200 text-gray-600';
      let dotCls = 'bg-gray-400';
      if (status === 'Saving...' || status === 'Pending...') {
        containerCls = 'border-yellow-200 text-yellow-800';
        dotCls = 'bg-yellow-500';
      } else if (status === 'Synced') {
        containerCls = 'border-green-200 text-green-700';
        dotCls = 'bg-green-500';
      } else if (status === 'Offline') {
        containerCls = 'border-gray-300 text-gray-600';
        dotCls = 'bg-gray-400';
      } else if (status === 'Error') {
        containerCls = 'border-red-200 text-red-700';
        dotCls = 'bg-red-500';
      } else if (status === 'Connecting...') {
        containerCls = 'border-blue-200 text-blue-700';
        dotCls = 'bg-blue-500';
      }
      wrap.className += ' ' + containerCls;
      if (dot) dot.className = 'inline-block w-2 h-2 rounded-full ' + dotCls;
      if (text) text.textContent = status.replace('...', '…');
      wrap.title = `Sync status: ${status}`;
    }
  }

  // Inject Firestore database and start sync if user is ready
  setDatabase(db) {
    if (this._remoteUnsub) this._stopSync();
    this.db = db;
    if (this.db && this.userId) {
      this._startSync();
    }
  }

  _firestoreDocRef() {
    if (!this.db || !this.userId) return null;
    // Store all checklist state in a single doc for the user
    return doc(this.db, 'users', this.userId, 'app', 'checklists');
  }

  _queueRemoteSave() {
    if (!this.db || !this.userId) return;
    if (this._applyingRemote) return; // don't echo remote updates back
    this._setSyncStatus('Saving...');
    if (this._remoteSaveTimer) clearTimeout(this._remoteSaveTimer);
    this._remoteSaveTimer = setTimeout(() => this._saveToFirestore(), 500);
  }

  async _saveToFirestore(force = false) {
    try {
      const ref = this._firestoreDocRef();
      if (!ref) return;
      const json = JSON.stringify(this.state || {});
      if (!force && this._lastPushedJson === json) return; // no changes
      this._lastPushedJson = json;
      this._setSyncStatus('Saving...');
      await setDoc(ref, {
        state: this.state,
        updatedAt: serverTimestamp(),
        updatedAtMs: Date.now(),
      }, { merge: true });
      this._setSyncStatus('Synced');
    } catch (err) {
      console.warn('Failed to sync checklist to Firestore:', err);
      this._setSyncStatus('Error');
    }
  }

  async _startSync() {
    try {
      const ref = this._firestoreDocRef();
      if (!ref) return;
      this._setSyncStatus('Connecting...');

      // Initial fetch and reconcile
      const snap = await getDoc(ref);
      const remote = snap.exists() ? (snap.data()?.state || null) : null;
      const remoteHasProjects = !!(remote && remote.projects && Object.keys(remote.projects).length > 0);
      if (remoteHasProjects) {
        this._applyingRemote = true;
        this.state = remote;
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        this._applyingRemote = false;
        this._updateProgressSummary();
        this._setSyncStatus('Synced');
      } else {
        // Push local as source of truth on first-time or empty remote
        await this._saveToFirestore(true);
      }

      // Subscribe for live updates
      this._remoteUnsub = onSnapshot(ref, (snapshot) => {
        const data = snapshot.data();
        const incoming = data?.state;
        if (!incoming) return;
        const incomingJson = JSON.stringify(incoming);
        if (this._lastPushedJson && incomingJson === this._lastPushedJson) return; // ignore our own write
        this._applyingRemote = true;
        this.state = incoming;
        localStorage.setItem(this.storageKey, JSON.stringify(this.state));
        this._applyingRemote = false;
        this._updateProgressSummary();
        const page = document.getElementById('checklists-page');
        if (page && !page.classList.contains('hidden')) {
          this.render();
        }
        this._setSyncStatus('Synced');
      }, (error) => {
        console.warn('Checklist Firestore subscription error:', error);
        this._setSyncStatus('Error');
      });
    } catch (err) {
      console.warn('Failed to start checklist sync:', err);
      this._setSyncStatus('Error');
    }
  }

  _stopSync() {
    try {
      if (this._remoteUnsub) {
        this._remoteUnsub();
        this._remoteUnsub = null;
      }
      if (this._remoteSaveTimer) {
        clearTimeout(this._remoteSaveTimer);
        this._remoteSaveTimer = null;
      }
    } catch {}
  }

  _ensureStateShape() {
    if (!this.state || typeof this.state !== 'object') this.state = {};
    if (!this.state.projects || typeof this.state.projects !== 'object') this.state.projects = {};
    if (!('activeProjectId' in this.state)) this.state.activeProjectId = null;
  }

  _migrateStateIfNeeded() {
    this._ensureStateShape();
    const looksLikeOld = this.state.property || this.state.cleaning;
    if (looksLikeOld) {
      // Wrap existing checks into a default project
      const defaultId = this._makeId('general');
      const checks = {};
      if (this.state.property) checks.property = this.state.property;
      if (this.state.cleaning) checks.cleaning = this.state.cleaning;
      this.state.projects[defaultId] = { id: defaultId, name: 'General', checks };
      this.state.activeProjectId = defaultId;
      // Remove legacy top-level keys
      delete this.state.property;
      delete this.state.cleaning;
      this._saveState();
    }
    // If still no project, create one sample to get started
    if (!this.state.activeProjectId || !this.state.projects[this.state.activeProjectId]) {
      const id = this._makeId('default');
      this.state.projects[id] = { id, name: 'New Property', checks: {} };
      this.state.activeProjectId = id;
      this._saveState();
    }
  }

  _makeId(name) {
    const slug = name.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'project';
    return `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  listProjects() {
    this._ensureStateShape();
    return Object.values(this.state.projects).sort((a, b) => a.name.localeCompare(b.name));
  }

  getActiveProject() {
    this._ensureStateShape();
    return this.state.projects[this.state.activeProjectId] || null;
  }

  setActiveProject(id) {
    if (!this.state.projects[id]) return;
    this.state.activeProjectId = id;
    this._saveState();
  }

  createProject(name) {
    const id = this._makeId(name || 'property');
    this.state.projects[id] = { id, name: name || 'Untitled Property', checks: {} };
    this.state.activeProjectId = id;
    this._saveState();
    return id;
  }

  renameProject(id, newName) {
    if (!this.state.projects[id]) return;
    this.state.projects[id].name = (newName || '').trim() || this.state.projects[id].name;
    this._saveState();
  }

  deleteProject(id) {
    if (!this.state.projects[id]) return;
    const isActive = this.state.activeProjectId === id;
    delete this.state.projects[id];
    if (isActive) {
      const remaining = Object.keys(this.state.projects);
      this.state.activeProjectId = remaining[0] || null;
    }
    // Ensure at least one project exists
    if (!this.state.activeProjectId) {
      const fallbackId = this._makeId('property');
      this.state.projects[fallbackId] = { id: fallbackId, name: 'New Property', checks: {} };
      this.state.activeProjectId = fallbackId;
    }
    this._saveState();
  }

  _data() {
    // Property Checklists categories and items per spec
    const property = [
      { title: 'Avantio', items: ['Tourist Tax', 'Contract', 'SEF'] },
      { title: 'Spreadsheets', items: ['Codes, etc.', 'QR Frames', 'Condominiums', 'Trash Can Location', 'Key Inventory'] },
      { title: 'Airbnb', items: ['Tourist Tax', 'Automatic Messages', 'Personalized Connection', 'Photographic Tour', 'Wi-Fi', 'Edit Listings - Arrival Guide 4:00 PM - 2:00 AM'] },
      { title: 'Booking', items: ['Automatic Messages', 'Profile and Accommodation Description', 'Finance - Bank Details Enter your IBAN and company name.', 'Property Layouts'] },
      { title: 'Enso', items: ['Listings - All Listings - Listing group (group by location)', 'Activate listing', 'My Profile - Connected Accounts - Airbnb - View Account - Peer Listings'] },
      { title: 'Google', items: ['Location', 'Photos', 'Recommendations'] },
      { title: 'Register', items: ['Tourist Tax', 'Statistics', 'RNAL Insurance'] },
    ];

    // Cleaning Checklists (placeholder for now)
    const cleaning = [
      { title: 'Standard Turnover (coming soon)', items: [] },
    ];

    return { property, cleaning };
  }

  _getChecks() {
    const active = this.getActiveProject();
    if (!active.checks) active.checks = {};
    return active.checks;
  }

  _calcProgress() {
    const { property, cleaning } = this._data();
    const allSections = [
      ...property.map(c => ({ section: 'property', ...c })),
      ...cleaning.map(c => ({ section: 'cleaning', ...c })),
    ];
    const checks = this._getChecks();
    let total = 0;
    let done = 0;
    allSections.forEach(({ section, title, items }) => {
      items.forEach((item) => {
        total += 1;
        if (checks?.[section]?.[title]?.[item]) done += 1;
      });
    });
    return { done, total };
  }

  _updateProgressSummary() {
    const el = document.getElementById('checklists-progress-summary');
    if (!el) return;
    const { done, total } = this._calcProgress();
    if (total === 0) {
      el.textContent = '';
    } else {
      const pct = Math.round((done / total) * 100);
      el.textContent = `${done}/${total} items completed (${pct}%)`;
    }
  }

  _ensurePath(section, category) {
    const checks = this._getChecks();
    if (!checks[section]) checks[section] = {};
    if (!checks[section][category]) checks[section][category] = {};
  }

  _toggleItem(section, category, item, checked) {
    this._ensurePath(section, category);
    const checks = this._getChecks();
    checks[section][category][item] = checked;
    this._saveState();
  }

  _categoryProgress(section, category, items) {
    const checks = this._getChecks();
    const statuses = items.map(i => (checks?.[section]?.[category]?.[i] ? 1 : 0));
    const done = statuses.reduce((a, b) => a + b, 0);
    const total = items.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // Duplicate the currently active project (including checks)
  duplicateActiveProject() {
    const active = this.getActiveProject();
    if (!active) return null;
    const cloneName = `Copy of ${active.name}`;
    const id = this._makeId(cloneName);
    // Deep clone checks to avoid reference copy
    const checks = JSON.parse(JSON.stringify(active.checks || {}));
    this.state.projects[id] = { id, name: cloneName, checks };
    this.state.activeProjectId = id;
    this._saveState();
    return id;
  }

  // Auto-create checklists from Properties list (if available)
  // It creates a project per property name if it doesn't already exist
  autoCreateFromProperties() {
    const propsMgr = window.propertiesManager;
    if (!propsMgr || !Array.isArray(propsMgr.properties)) {
      alert('Properties are not loaded yet. Please visit the Properties tab first.');
      return { created: 0, skipped: 0 };
    }
    const existingNames = new Set(this.listProjects().map(p => (p.name || '').trim().toLowerCase()));
    let created = 0;
    let skipped = 0;
    propsMgr.properties.forEach(p => {
      const pname = (p.name || '').trim();
      if (!pname) return;
      const key = pname.toLowerCase();
      if (existingNames.has(key)) {
        skipped += 1;
        return;
      }
      const id = this._makeId(pname);
      this.state.projects[id] = { id, name: pname, checks: {} };
      existingNames.add(key);
      created += 1;
    });
    // Do not switch active project automatically; just persist
    if (created > 0) this._saveState();
    return { created, skipped };
  }

  // Export the current project as a PDF (uses jsPDF and autoTable if available)
  exportActiveProjectAsPDF() {
    try {
      const proj = this.getActiveProject();
      if (!proj) {
        alert('No active checklist to export.');
        return;
      }
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF || !window.jspdf || typeof jsPDF !== 'function') {
        alert('PDF export library not found.');
        return;
      }
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const title = `Checklist - ${proj.name}`;
      doc.setFontSize(16);
      doc.text(title, 15, 18);

      const rows = [];
      const checks = this._getChecks();
      const { property, cleaning } = this._data();
      const allSections = [
        ...property.map(c => ({ section: 'Property', ...c })),
        ...cleaning.map(c => ({ section: 'Cleaning', ...c })),
      ];
      allSections.forEach(({ section, title, items }) => {
        items.forEach(item => {
          const checked = !!(checks?.[section.toLowerCase()]?.[title]?.[item]);
          rows.push([section, title, item, checked ? 'Done' : 'Pending']);
        });
      });

      const useAutoTable = !!doc.autoTable;
      if (useAutoTable) {
        doc.setFontSize(10);
        doc.autoTable({
          startY: 24,
          head: [['Section', 'Category', 'Item', 'Status']],
          body: rows,
          theme: 'striped',
          headStyles: { fillColor: [233, 75, 90], textColor: [255, 255, 255] },
          styles: { fontSize: 9 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
        });
      } else {
        // Fallback minimal rendering without autoTable
        let y = 24;
        doc.setFontSize(12);
        rows.slice(0, 40).forEach(r => {
          // Show first 40 rows if no autotable (to avoid overflow)
          doc.text(`${r[0]} | ${r[1]} | ${r[2]} | ${r[3]}`, 15, y);
          y += 6;
        });
        if (rows.length > 40) {
          doc.text(`...and ${rows.length - 40} more items`, 15, y + 4);
        }
      }

      const filename = `checklist-${proj.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF: ' + err.message);
    }
  }

  render() {
    const container = document.getElementById('checklists-content');
    if (!container) return;

    const { property, cleaning } = this._data();

    container.innerHTML = '';

    // Top toolbar: project selector and actions
    const topbar = document.createElement('div');
    topbar.className = 'flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4';

    const leftWrap = document.createElement('div');
    leftWrap.className = 'flex items-center gap-3';
    const lbl = document.createElement('label');
    lbl.className = 'text-sm text-gray-600';
    lbl.textContent = 'Property checklist:';
    const select = document.createElement('select');
    select.className = 'border rounded-md px-2 py-1 text-sm';
    const projects = this.listProjects();
    projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === this.state.activeProjectId) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      this.setActiveProject(select.value);
      this.render();
    });
    leftWrap.appendChild(lbl);
    leftWrap.appendChild(select);

    const rightWrap = document.createElement('div');
    rightWrap.className = 'flex items-center gap-2';
    // Sync status badge (subtle, to the left of actions)
    const syncWrap = document.createElement('span');
    const syncDot = document.createElement('span');
    const syncText = document.createElement('span');
    this._syncEl = syncWrap;
    this._syncDotEl = syncDot;
    this._syncTextEl = syncText;
    // Initialize current status styling/text
    this._setSyncStatus(this._syncStatus);
    syncWrap.appendChild(syncDot);
    syncWrap.appendChild(syncText);
    const newBtn = document.createElement('button');
    newBtn.className = 'text-sm btn-primary px-3 py-1 rounded-md';
    newBtn.textContent = 'New';
    newBtn.addEventListener('click', () => {
      const name = prompt('Property name');
      if (name && name.trim()) {
        this.createProject(name.trim());
        this.render();
      }
    });
    const renameBtn = document.createElement('button');
    renameBtn.className = 'text-sm text-blue-600 hover:underline';
    renameBtn.textContent = 'Rename';
    renameBtn.addEventListener('click', () => {
      const active = this.getActiveProject();
      if (!active) return;
      const name = prompt('New property name', active.name);
      if (name && name.trim()) {
        this.renameProject(active.id, name.trim());
        this.render();
      }
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'text-sm text-red-600 hover:underline';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => {
      const active = this.getActiveProject();
      if (!active) return;
      if (confirm(`Delete checklist for "${active.name}"? This cannot be undone.`)) {
        this.deleteProject(active.id);
        this.render();
      }
    });
    // Explicit Save button (even though autosave is enabled)
    const saveBtn = document.createElement('button');
    saveBtn.className = 'text-sm text-green-700 hover:underline';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => {
      this._saveState();
      // Force an immediate remote push when Save is explicitly clicked
      this._saveToFirestore(true);
      const old = saveBtn.textContent;
      saveBtn.textContent = 'Saved ✓';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = old;
        saveBtn.disabled = false;
      }, 1200);
    });
    // Duplicate current checklist
    const duplicateBtn = document.createElement('button');
    duplicateBtn.className = 'text-sm text-blue-600 hover:underline';
    duplicateBtn.textContent = 'Duplicate';
    duplicateBtn.addEventListener('click', () => {
      const id = this.duplicateActiveProject();
      if (id) this.render();
    });
    // Export active checklist to PDF
    const exportBtn = document.createElement('button');
    exportBtn.className = 'text-sm text-gray-700 hover:underline';
    exportBtn.textContent = 'Export PDF';
    exportBtn.addEventListener('click', () => this.exportActiveProjectAsPDF());
    // Auto-create checklists from properties
    const autoCreateBtn = document.createElement('button');
    autoCreateBtn.className = 'text-sm text-purple-700 hover:underline';
    autoCreateBtn.textContent = 'Auto-create from Properties';
    autoCreateBtn.addEventListener('click', () => {
      const res = this.autoCreateFromProperties();
      if (res) {
        let msg = `Created ${res.created}`;
        if (res.skipped) msg += `, skipped ${res.skipped} (already exist)`;
        alert(msg);
        if (res.created) this.render();
      }
    });
    // Place sync status first (left of buttons)
    rightWrap.appendChild(syncWrap);
    rightWrap.appendChild(newBtn);
    rightWrap.appendChild(renameBtn);
    rightWrap.appendChild(deleteBtn);
    rightWrap.appendChild(saveBtn);
    rightWrap.appendChild(duplicateBtn);
    rightWrap.appendChild(exportBtn);
    rightWrap.appendChild(autoCreateBtn);

    topbar.appendChild(leftWrap);
    topbar.appendChild(rightWrap);
    container.appendChild(topbar);

    // Render a section block
    const renderSection = (sectionKey, title, categories) => {
      const section = document.createElement('div');
      section.className = 'mb-8';

      const header = document.createElement('div');
      header.className = 'flex items-center justify-between mb-4';
      const h3 = document.createElement('h3');
      h3.className = 'text-lg font-semibold';
      h3.textContent = title;
      header.appendChild(h3);

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';
      const expandBtn = document.createElement('button');
      expandBtn.className = 'text-sm text-blue-600 hover:underline';
      expandBtn.textContent = 'Expand all';
      const collapseBtn = document.createElement('button');
      collapseBtn.className = 'text-sm text-blue-600 hover:underline';
      collapseBtn.textContent = 'Collapse all';
      const resetBtn = document.createElement('button');
      resetBtn.className = 'text-sm text-red-600 hover:underline';
      resetBtn.textContent = 'Reset progress';
      actions.appendChild(expandBtn);
      actions.appendChild(collapseBtn);
      actions.appendChild(resetBtn);
      header.appendChild(actions);
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';

      categories.forEach(cat => {
        const card = document.createElement('div');
        card.className = 'border rounded-lg p-4 bg-white shadow-sm';

        const catHeader = document.createElement('div');
        catHeader.className = 'flex items-center justify-between mb-3';
        const catTitle = document.createElement('h4');
        catTitle.className = 'font-medium';
        catTitle.textContent = cat.title;
        const prog = this._categoryProgress(sectionKey, cat.title, cat.items);
        const catProg = document.createElement('span');
        catProg.className = 'text-xs text-gray-500';
        catProg.textContent = prog.total ? `${prog.done}/${prog.total} (${prog.pct}%)` : '';
        // Collapse toggle
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'text-xs text-blue-600 hover:underline ml-2';
        toggleBtn.textContent = 'Collapse';
        const rightWrap = document.createElement('div');
        rightWrap.className = 'flex items-center gap-2';
        rightWrap.appendChild(catProg);
        rightWrap.appendChild(toggleBtn);
        catHeader.appendChild(catTitle);
        catHeader.appendChild(rightWrap);
        card.appendChild(catHeader);

        // Container for list (to collapse)
        const bodyWrap = document.createElement('div');
        bodyWrap.className = '';

        if (!cat.items.length) {
          const placeholder = document.createElement('div');
          placeholder.className = 'text-sm text-gray-500';
          placeholder.textContent = 'No items yet';
          bodyWrap.appendChild(placeholder);
        } else {
          const ul = document.createElement('ul');
          ul.className = 'space-y-2';
          cat.items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'flex items-start';
            const id = `${sectionKey}-${cat.title}-${item}`.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = id;
            cb.className = 'mt-1 mr-3 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500';
            cb.checked = !!(this._getChecks()?.[sectionKey]?.[cat.title]?.[item]);
            cb.addEventListener('change', () => {
              this._toggleItem(sectionKey, cat.title, item, cb.checked);
              // update category progress text
              const updated = this._categoryProgress(sectionKey, cat.title, cat.items);
              catProg.textContent = updated.total ? `${updated.done}/${updated.total} (${updated.pct}%)` : '';
            });
            const label = document.createElement('label');
            label.htmlFor = id;
            label.className = 'select-text cursor-pointer';
            label.textContent = item;
            li.appendChild(cb);
            li.appendChild(label);
            ul.appendChild(li);
          });
          bodyWrap.appendChild(ul);
        }

        // Setup collapse behavior
        let collapsed = false;
        const applyCollapse = () => {
          if (collapsed) {
            bodyWrap.classList.add('hidden');
            toggleBtn.textContent = 'Expand';
          } else {
            bodyWrap.classList.remove('hidden');
            toggleBtn.textContent = 'Collapse';
          }
        };
        toggleBtn.addEventListener('click', () => {
          collapsed = !collapsed;
          applyCollapse();
        });
        applyCollapse();

        card.appendChild(bodyWrap);
        grid.appendChild(card);
      });

      section.appendChild(grid);
      container.appendChild(section);

      // Section-level actions
      expandBtn.addEventListener('click', () => {
        section.querySelectorAll('button').forEach(btn => {
          if (btn.textContent === 'Expand') btn.click();
        });
      });
      collapseBtn.addEventListener('click', () => {
        section.querySelectorAll('button').forEach(btn => {
          if (btn.textContent === 'Collapse') btn.click();
        });
      });
      resetBtn.addEventListener('click', () => {
        if (!confirm(`Reset all progress in ${title}?`)) return;
        const checks = this._getChecks();
        if (checks[sectionKey]) delete checks[sectionKey];
        this._saveState();
        this.render();
      });
    };

    renderSection('property', 'Property Checklists', property);
    renderSection('cleaning', 'Cleaning Checklists', cleaning);

    this._updateProgressSummary();
  }
}
