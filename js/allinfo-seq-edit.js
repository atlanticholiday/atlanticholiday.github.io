// All Info Sequential Edit Enhancements
// Provides a fast, in-page sequential editor for the active category, with Prev/Next navigation.
// Avoids large HTML edits by hooking into the 'allInfoCategoryRendered' event from app.js.
import { LOCATIONS } from './locations.js';
import { getEnumOptions } from './enums.js';

(() => {
  const state = {
    active: false,
    currentIdx: 0,
    properties: [],
    category: null,
    table: null,
  };

  function ensureTopControls() {
    const wrap = document.getElementById('allinfo-filter-wrapper');
    if (!wrap) return;

    let btn = document.getElementById('allinfo-seq-toggle-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'allinfo-seq-toggle-btn';
      btn.className = 'inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-800 border border-gray-300 shadow-sm ml-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition';
      btn.innerHTML = '<i class="fas fa-arrows-turn-to-dots"></i><span>Sequential Edit</span>';
      btn.addEventListener('click', () => {
        state.active = !state.active;
        // If Bulk Edit is active, turn it off for clarity
        try {
          const bulkBtn = document.getElementById('allinfo-bulk-toggle-btn');
          if (bulkBtn && window.AllInfoBulkEdit?.isActive?.()) bulkBtn.click();
        } catch (e) { /* no-op */ }
        updateUI();
      });

      // Insert near the right side similar to bulk button approach
      let bar = document.getElementById('allinfo-actions-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'allinfo-actions-bar';
        bar.className = 'w-full flex flex-row flex-wrap items-center gap-2 justify-end mt-2';
        wrap.appendChild(bar);
      }
      bar.appendChild(btn);
      // Enforce a consistent order of buttons
      const order = ['allinfo-bulk-toggle-btn','allinfo-seq-toggle-btn','allinfo-accordion-toggle-btn'];
      const btns = Array.from(bar.querySelectorAll('button[id$="-toggle-btn"]'));
      btns.sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id)).forEach(el => bar.appendChild(el));
    }

    const text = state.active ? 'Exit Sequential' : 'Sequential Edit';
    const icon = state.active ? 'fas fa-times' : 'fas fa-arrows-turn-to-dots';
    btn.querySelector('span').textContent = text;
    btn.querySelector('i').className = icon;
    btn.setAttribute('data-active', state.active ? 'true' : 'false');
  }

  function ensurePanel() {
    const container = document.getElementById('allinfo-content');
    if (!container) return null;

    let panel = document.getElementById('allinfo-seq-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'allinfo-seq-panel';
      panel.className = 'rounded-xl border border-gray-200 bg-white p-4 mb-4 shadow-sm hidden';
      container.prepend(panel);
    }

    const total = state.properties.length;
    const idx = Math.min(Math.max(state.currentIdx, 0), Math.max(total - 1, 0));
    const prop = state.properties[idx] || {};

    // Build fields grid for current category
    const cat = state.category;
    const numberKeys = new Set(['cleaningCompanyPrice','guestCleaningFee','wifiSpeed','rooms','bathrooms']);
    const isTextarea = (key) => /instructions|notes|description|how|steps|comments|details/i.test(key);

    const fieldsHtml = (cat?.fields || []).map((field) => {
      const human = field === 'name' ? 'Property Name' : field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      const val = prop?.[field] ?? '';
      if (isTextarea(field)) {
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
            <textarea id="seq-field-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]" placeholder="Edit ${human}...">${val || ''}</textarea>
          </div>
        `;
      }
      // Constrained select for Cleaning Company Contact
      // Constrained select for Cleaning Company Contact
      if (field === 'cleaningCompanyContact') {
        const companies = (window.cleaningBillsManager?.COMPANIES || []).map(c => c.label);
        if (companies.length > 0) {
          const norm = (s) => String(s || '').trim().toLowerCase();
          const options = [''].concat(companies)
            .map(label => {
              const isSel = (label === val) || (label === "That's Maid" && norm(val) === 'thats maid');
              const l = label || 'Select company';
              return `<option value="${label}" ${isSel ? 'selected' : ''}>${l}</option>`;
            })
            .join('');
          return `
            <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
              <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
              <select id="seq-field-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
            </div>
          `;
        }
        // Fallback to text input if companies not available
      }
      // Constrained select for Location
      if (field === 'location') {
        const options = [''].concat(LOCATIONS || [])
          .map(loc => `<option value="${loc}" ${loc === val ? 'selected' : ''}>${loc || 'Select location'}</option>`) 
          .join('');
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
            <select id="seq-field-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
          </div>
        `;
      }
      // Yes/No select for boolean-like fields (ending with Enabled)
      if (/Enabled$/.test(field)) {
        const current = typeof val === 'boolean' ? String(val) : '';
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
            <select id="seq-field-${field}" data-boolean="true" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="" ${current===''?'selected':''}>Select</option>
              <option value="true" ${current==='true'?'selected':''}>Yes</option>
              <option value="false" ${current==='false'?'selected':''}>No</option>
            </select>
          </div>
        `;
      }
      // Enumerated selects from shared enums
      const enumOpts = getEnumOptions(field);
      if (enumOpts) {
        const options = ['']
          .concat(enumOpts.map(o => o.value))
          .map(v => `<option value="${v}" ${v === val ? 'selected' : ''}>${v || 'Select'}</option>`)
          .join('');
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
            <select id="seq-field-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
          </div>
        `;
      }
      const isNumber = numberKeys.has(field) || /price|fee|amount|count|number|kg|weight|speed|rooms|bathrooms/i.test(field);
      const typeAttr = isNumber ? 'number' : 'text';
      const stepAttr = isNumber ? ' step="0.01"' : '';
      const v = typeof val === 'number' ? String(val) : (val ?? '');
      return `
        <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
          <label class="text-xs font-medium text-gray-700" for="seq-field-${field}">${human}</label>
          <input id="seq-field-${field}" type="${typeAttr}"${stepAttr} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" value="${(v ?? '').toString().replace(/"/g,'&quot;')}" placeholder="Edit ${human}..." />
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <div class="text-base font-semibold text-gray-900">Sequential Edit: <span class="underline decoration-blue-500/50 underline-offset-4">${cat?.title || ''}</span></div>
        <div class="text-sm text-gray-600">${idx + 1} / ${total} — <span class="font-semibold text-gray-900">${prop?.name || ''}</span></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="seq-fields-grid">${fieldsHtml}</div>
      <div class="flex items-center justify-between mt-4">
        <div class="flex items-center gap-2">
          <button id="seq-prev-btn" class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 shadow-sm"><i class="fas fa-chevron-left"></i><span>Prev</span></button>
          <button id="seq-next-btn" class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 shadow-sm"><span>Next</span><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="flex items-center gap-2">
          <button id="seq-cancel-btn" class="px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 shadow-sm">Close</button>
          <button id="seq-save-btn" class="px-4 py-2.5 rounded-lg btn-secondary shadow-sm"><i class="fas fa-save mr-1.5"></i> Save</button>
          <button id="seq-save-next-btn" class="px-4 py-2.5 rounded-lg btn-primary shadow-sm"><i class="fas fa-check mr-1.5"></i> Save & Next</button>
        </div>
      </div>
    `;

    // Wire buttons
    panel.querySelector('#seq-cancel-btn')?.addEventListener('click', () => {
      state.active = false;
      updateUI();
    });

    panel.querySelector('#seq-prev-btn')?.addEventListener('click', () => {
      if (state.currentIdx > 0) {
        state.currentIdx -= 1;
        ensurePanel();
        highlightActiveRow();
      }
    });

    panel.querySelector('#seq-next-btn')?.addEventListener('click', () => {
      if (state.currentIdx < total - 1) {
        state.currentIdx += 1;
        ensurePanel();
        highlightActiveRow();
      }
    });

    async function saveCurrent() {
      const cat = state.category;
      if (!cat || !window.propertiesManager) return;
      const current = state.properties[state.currentIdx];
      if (!current) return;

      // Collect values
      const updates = {};
      cat.fields.forEach((field) => {
        const el = panel.querySelector(`#seq-field-${field}`);
        if (!el) return;
        let val = el.value;
        if (el.tagName === 'INPUT' && el.type === 'number') {
          const num = parseFloat(val);
          val = Number.isFinite(num) ? num : null;
        } else if (el.tagName === 'SELECT' && el.dataset?.boolean === 'true') {
          if (val === 'true') val = true; else if (val === 'false') val = false; else val = '';
        }
        updates[field] = val;
      });
      const btn = panel.querySelector('#seq-save-btn');
      const btn2 = panel.querySelector('#seq-save-next-btn');
      btn.disabled = true; btn2.disabled = true;
      const oldText = btn.textContent; const oldText2 = btn2.textContent;
      btn.textContent = 'Saving...'; btn2.textContent = 'Saving...';
      try {
        await window.propertiesManager.updateProperty(current.id, updates);
        btn.textContent = 'Saved'; btn2.textContent = 'Saved';
        setTimeout(() => { btn.textContent = oldText; btn2.textContent = oldText2; }, 600);
      } catch (err) {
        console.error('Sequential save failed', err);
        alert('Save failed. Please try again.');
      } finally {
        btn.disabled = false; btn2.disabled = false;
      }
    }

    panel.querySelector('#seq-save-btn')?.addEventListener('click', saveCurrent);

    panel.querySelector('#seq-save-next-btn')?.addEventListener('click', async () => {
      await saveCurrent();
      if (state.currentIdx < total - 1) {
        state.currentIdx += 1;
        ensurePanel();
        highlightActiveRow();
      }
    });

    panel.classList.toggle('hidden', !state.active);
    return panel;
  }

  function updateUI() {
    ensureTopControls();
    const panel = ensurePanel();
    if (!state.active && panel) panel.classList.add('hidden');

    // Add row-click to jump to that property when in sequential mode
    if (state.table) {
      const rows = Array.from(state.table.querySelectorAll('tbody tr'));
      rows.forEach((tr, i) => {
        tr.classList.remove('__seq_click_bound__');
        if (state.active) {
          tr.classList.add('__seq_click_bound__');
          tr.addEventListener('click', onRowClickOnce, { once: true });
        }
      });
      highlightActiveRow();
    }
  }

  function onRowClickOnce(e) {
    if (!state.table) return;
    const rows = Array.from(state.table.querySelectorAll('tbody tr'));
    const idx = rows.indexOf(e.currentTarget);
    if (idx >= 0) {
      state.currentIdx = idx;
      ensurePanel();
      highlightActiveRow();
    }
  }

  function highlightActiveRow() {
    if (!state.table) return;
    const rows = Array.from(state.table.querySelectorAll('tbody tr'));
    rows.forEach((tr, i) => {
      tr.classList.toggle('bg-blue-50', state.active && i === state.currentIdx);
    });
  }

  document.addEventListener('allInfoCategoryRendered', (evt) => {
    const { category, index, properties, table } = evt.detail || {};
    state.category = category;
    state.properties = Array.isArray(properties) ? properties : [];
    state.table = table || null;

    // Keep current selection if the same property still exists; otherwise reset index
    const currentId = state.properties[state.currentIdx]?.id;
    if (currentId) {
      const newIdx = state.properties.findIndex(p => p.id === currentId);
      if (newIdx >= 0) state.currentIdx = newIdx;
    } else {
      state.currentIdx = 0;
    }

    ensureTopControls();
    ensurePanel();
    updateUI();
  });
})();
