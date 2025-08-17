// All Info Bulk Edit Enhancements
// This module augments the All Property Info page with a per-tab Bulk Edit mode,
// without large HTML edits. It listens for the custom 'allInfoCategoryRendered'
// event dispatched by app.js, and injects UI + selection checkboxes.

(() => {
  const state = {
    active: false,
    selected: new Set(),
    currentCat: null,
    currentIdx: 0,
    lastProps: [],
    lastTable: null,
  };

  function ensureTopControls() {
    const wrap = document.getElementById('allinfo-filter-wrapper');
    if (!wrap) return;

    let toggle = document.getElementById('allinfo-bulk-toggle-btn');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'allinfo-bulk-toggle-btn';
      toggle.className = 'inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-800 border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition';
      toggle.innerHTML = '<i class="fas fa-layer-group"></i><span>Bulk Edit</span>';
      toggle.addEventListener('click', () => {
        state.active = !state.active;
        // Reset selection when toggling mode
        state.selected.clear();
        updateUI();
      });
      // Ensure a unified actions bar for all mode buttons
      let bar = document.getElementById('allinfo-actions-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'allinfo-actions-bar';
        bar.className = 'w-full flex flex-row flex-wrap items-center gap-2 justify-end mt-2';
        wrap.appendChild(bar);
      }
      bar.appendChild(toggle);
      // Enforce a consistent order of buttons
      const order = ['allinfo-bulk-toggle-btn','allinfo-seq-toggle-btn','allinfo-accordion-toggle-btn'];
      const btns = Array.from(bar.querySelectorAll('button[id$="-toggle-btn"]'));
      btns.sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id)).forEach(el => bar.appendChild(el));
    }

    const text = state.active ? 'Exit Bulk Edit' : 'Bulk Edit';
    const icon = state.active ? 'fas fa-times' : 'fas fa-layer-group';
    toggle.querySelector('span').textContent = text;
    toggle.querySelector('i').className = icon;
  }

  function ensureBulkPanel() {
    const container = document.getElementById('allinfo-content');
    if (!container) return null;

    let panel = document.getElementById('allinfo-bulk-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'allinfo-bulk-panel';
      panel.className = 'rounded-xl border border-gray-200 bg-white p-4 mb-4 shadow-sm hidden';
      container.prepend(panel);
    }

    // Build panel content for current category
    const cat = state.currentCat;
    if (!cat) return panel;

    const selectedCount = state.selected.size;
    panel.innerHTML = `
      <div class="flex flex-col gap-4">
        <div class="flex items-center justify-between">
          <div class="text-base font-semibold text-gray-900">
            Bulk Edit: <span class="underline decoration-blue-500/50 underline-offset-4">${cat.title}</span>
          </div>
          <div class="text-sm text-gray-600">
            Selected: <span id="bulk-selected-count" class="font-semibold text-gray-900">${selectedCount}</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="bulk-fields-grid"></div>
        <div class="flex items-center justify-end gap-2">
          <button id="bulk-cancel-btn" class="px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1">Cancel</button>
          <button id="bulk-apply-btn" class="px-4 py-2.5 rounded-lg btn-primary shadow-sm disabled:opacity-50" ${selectedCount === 0 ? 'disabled' : ''}>
            <i class="fas fa-check mr-1.5"></i> Apply to ${selectedCount} ${selectedCount === 1 ? 'property' : 'properties'}
          </button>
        </div>
      </div>
    `;

    // Build field rows
    const grid = panel.querySelector('#bulk-fields-grid');
    const numberKeys = new Set(['cleaningCompanyPrice', 'guestCleaningFee', 'wifiSpeed', 'rooms', 'bathrooms']);

    cat.fields.forEach((field) => {
      const isNumber = numberKeys.has(field) || /price|fee|amount|count|number|kg|weight|speed|rooms|bathrooms/i.test(field);
      const fieldId = `bulk-field-${field}`;
      const applyId = `bulk-apply-${field}`;
      const human = field === 'name' ? 'Property Name' : field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

      const item = document.createElement('div');
      item.className = 'p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition';
      item.innerHTML = `
        <label for="${fieldId}" class="text-xs font-medium text-gray-700">${human}</label>
        <input id="${fieldId}" type="${isNumber ? 'number' : 'text'}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" ${isNumber ? 'step="0.01"' : ''} placeholder="Set ${human}..." />
        <label class="text-xs text-gray-600 inline-flex items-center gap-2">
          <input id="${applyId}" type="checkbox" class="h-4 w-4 text-blue-600 border-gray-300 rounded"> Apply this field
        </label>
      `;
      grid.appendChild(item);
    });

    // Wire buttons
    panel.querySelector('#bulk-cancel-btn')?.addEventListener('click', () => {
      state.active = false;
      state.selected.clear();
      updateUI();
    });

    panel.querySelector('#bulk-apply-btn')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!window.propertiesManager) return;

      const updates = {};
      cat.fields.forEach((field) => {
        const apply = panel.querySelector(`#bulk-apply-${field}`);
        const input = panel.querySelector(`#bulk-field-${field}`);
        if (apply && apply.checked) {
          let val = input?.value ?? '';
          if (val === '' || val === null) {
            val = '';
          } else if (input?.type === 'number') {
            const num = parseFloat(val);
            val = Number.isFinite(num) ? num : null;
          }
          updates[field] = val;
        }
      });

      if (Object.keys(updates).length === 0) {
        alert('Please select at least one field to apply.');
        return;
      }

      const ids = Array.from(state.selected);
      if (ids.length === 0) {
        alert('Please select at least one property.');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Applying...';
      try {
        await window.propertiesManager.updatePropertiesBatch(ids, updates);
        // Basic feedback
        alert('Bulk update completed.');
        // Keep bulk mode enabled but clear selection and inputs
        state.selected.clear();
        // Clear inputs
        cat.fields.forEach((field) => {
          const apply = panel.querySelector(`#bulk-apply-${field}`);
          const input = panel.querySelector(`#bulk-field-${field}`);
          if (apply) apply.checked = false;
          if (input) input.value = '';
        });
        updateSelectedCount();
      } catch (err) {
        console.error('Bulk update failed', err);
        alert('Bulk update failed. Please try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = `Apply to ${ids.length} ${ids.length === 1 ? 'property' : 'properties'}`;
      }
    });

    panel.classList.toggle('hidden', !state.active);
    return panel;
  }

  function addSelectionColumn(table) {
    if (!table) return;

    // Ensure header select-all exists
    const theadTr = table.querySelector('thead tr');
    if (theadTr && !theadTr.querySelector('th.__bulk_select__')) {
      const th = document.createElement('th');
      th.className = 'sticky top-0 z-10 px-3 py-3 bg-white __bulk_select__';
      const selAll = document.createElement('input');
      selAll.type = 'checkbox';
      selAll.title = 'Select/Deselect all';
      selAll.addEventListener('change', () => {
        table.querySelectorAll('tbody input.__bulk_row_select__').forEach((cb) => {
          cb.checked = selAll.checked;
          const id = cb.dataset.id;
          if (!id) return;
          if (selAll.checked) state.selected.add(id); else state.selected.delete(id);
        });
        updateSelectedCount();
      });
      th.appendChild(selAll);
      // Append at end to avoid affecting existing column indices
      theadTr.appendChild(th);
    }

    // Tag each row with its property id and add a checkbox cell
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach((tr, i) => {
      if (tr.querySelector('td.__bulk_select__')) return;
      const td = document.createElement('td');
      td.className = 'px-3 py-2 __bulk_select__';

      const id = state.lastProps?.[i]?.id || tr.dataset.id || '';
      if (id) tr.dataset.id = id;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = '__bulk_row_select__';
      cb.dataset.id = id;
      cb.checked = state.selected.has(id);
      cb.addEventListener('change', () => {
        if (!cb.dataset.id) return;
        if (cb.checked) state.selected.add(cb.dataset.id); else state.selected.delete(cb.dataset.id);
        updateSelectedCount();
      });

      td.appendChild(cb);
      // Append at end to avoid affecting existing column indices used by sort handlers
      tr.appendChild(td);
    });
  }

  function removeSelectionColumn(table) {
    if (!table) return;
    table.querySelectorAll('th.__bulk_select__, td.__bulk_select__').forEach((el) => el.remove());
  }

  function updateSelectedCount() {
    const el = document.getElementById('bulk-selected-count');
    if (el) el.textContent = state.selected.size;

    const applyBtn = document.getElementById('bulk-apply-btn');
    if (applyBtn) {
      applyBtn.disabled = state.selected.size === 0;
      applyBtn.textContent = `Apply to ${state.selected.size} ${state.selected.size === 1 ? 'property' : 'properties'}`;
    }
  }

  function updateUI() {
    ensureTopControls();
    const panel = ensureBulkPanel();

    if (state.active) {
      if (state.lastTable) addSelectionColumn(state.lastTable);
    } else {
      if (panel) panel.classList.add('hidden');
      if (state.lastTable) removeSelectionColumn(state.lastTable);
    }
    updateSelectedCount();
  }

  // Main hook: listen for category render events
  document.addEventListener('allInfoCategoryRendered', (evt) => {
    const { category, index, properties, table } = evt.detail || {};
    state.currentCat = category;
    state.currentIdx = index;
    state.lastProps = Array.isArray(properties) ? properties : [];
    state.lastTable = table || null;

    // Reset selection when switching category
    state.selected.clear();

    // Make sure controls exist and reflect current mode
    ensureTopControls();
    ensureBulkPanel();

    if (state.active) {
      addSelectionColumn(state.lastTable);
    } else {
      removeSelectionColumn(state.lastTable);
    }
    updateSelectedCount();
  });

  // Expose minimal API if needed
  window.AllInfoBulkEdit = {
    isActive: () => state.active,
    onCategoryRendered: (cat, idx, properties, table) => {
      const event = new CustomEvent('allInfoCategoryRendered', { detail: { category: cat, index: idx, properties, table } });
      document.dispatchEvent(event);
    },
  };
})();
