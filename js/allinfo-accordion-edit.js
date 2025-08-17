// All Info Accordion (All-Open) Edit Mode
// Renders all properties' forms for the active category inline on All Property Info page.
// Hooks into 'allInfoCategoryRendered' from app.js, avoids large HTML edits.
import { LOCATIONS } from './locations.js';
import { getEnumOptions } from './enums.js';

(() => {
  const state = {
    active: false,
    category: null,
    properties: [],
    table: null,
    tableWrap: null,
    container: null,
  };

  function ensureTopControls() {
    const wrap = document.getElementById('allinfo-filter-wrapper');
    if (!wrap) return;

    let btn = document.getElementById('allinfo-accordion-toggle-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'allinfo-accordion-toggle-btn';
      btn.className = 'inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 text-sm font-medium text-gray-800 border border-gray-300 shadow-sm ml-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 transition';
      btn.innerHTML = '<i class="fas fa-list"></i><span>Accordion Edit</span>';
      btn.addEventListener('click', () => {
        state.active = !state.active;
        // Turn off Bulk and Sequential when enabling Accordion for clarity
        try {
          const bulkBtn = document.getElementById('allinfo-bulk-toggle-btn');
          if (bulkBtn && window.AllInfoBulkEdit?.isActive?.()) bulkBtn.click();
        } catch (e) { /* no-op */ }
        try {
          const seqBtn = document.getElementById('allinfo-seq-toggle-btn');
          if (seqBtn && seqBtn.getAttribute('data-active') === 'true') seqBtn.click();
        } catch (e) { /* no-op */ }
        updateUI();
      });

      // Place near other controls
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

    btn.setAttribute('data-active', state.active ? 'true' : 'false');
    const text = state.active ? 'Exit Accordion' : 'Accordion Edit';
    const icon = state.active ? 'fas fa-times' : 'fas fa-list';
    btn.querySelector('span').textContent = text;
    btn.querySelector('i').className = icon;
  }

  function buildAccordion() {
    const content = document.getElementById('allinfo-content');
    if (!content) return null;

    let wrap = document.getElementById('allinfo-accordion-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'allinfo-accordion-wrap';
      wrap.className = 'space-y-3';
      content.prepend(wrap);
    }

    const cat = state.category;
    const props = state.properties || [];
    const numberKeys = new Set(['cleaningCompanyPrice','guestCleaningFee','rooms','bathrooms']);
    const isTextarea = (key) => /instructions|notes|description|how|steps|comments|details/i.test(key);

    function fieldControl(prop, field) {
      const val = prop?.[field] ?? '';
      const human = field === 'name' ? 'Property Name' : field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      if (isTextarea(field)) {
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
            <textarea id="acc-${prop.id}-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]" placeholder="Edit ${human}...">${val || ''}</textarea>
          </div>
        `;
      }
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
              <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
              <select id="acc-${prop.id}-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
            </div>
          `;
        }
        // Fallback continues to input below
      }
      // Constrained select for Location
      if (field === 'location') {
        const options = [''].concat(LOCATIONS || [])
          .map(loc => `<option value="${loc}" ${loc === val ? 'selected' : ''}>${loc || 'Select location'}</option>`) 
          .join('');
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
            <select id="acc-${prop.id}-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
          </div>
        `;
      }
      // Yes/No select for boolean-like fields (ending with Enabled)
      if (/Enabled$/.test(field)) {
        const current = typeof val === 'boolean' ? String(val) : '';
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
            <select id="acc-${prop.id}-${field}" data-boolean="true" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
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
        const options = ["<option value=\"\">Select</option>"]
          .concat(enumOpts.map(o => `<option value="${o.value}" ${o.value === val ? 'selected' : ''}>${o.label}</option>`))
          .join('');
        return `
          <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
            <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
            <select id="acc-${prop.id}-${field}" class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">${options}</select>
          </div>
        `;
      }
      const isNumber = numberKeys.has(field) || /price|fee|amount|count|number|kg|weight|speed|rooms|bathrooms/i.test(field);
      const typeAttr = isNumber ? 'number' : 'text';
      const stepAttr = isNumber ? ' step="0.01"' : '';
      const v = typeof val === 'number' ? String(val) : (val ?? '');
      return `
        <div class="p-4 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100/50 flex flex-col gap-2 transition">
          <label class="text-xs font-medium text-gray-700" for="acc-${prop.id}-${field}">${human}</label>
          <input id="acc-${prop.id}-${field}" type="${typeAttr}"${stepAttr} class="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" value="${(v ?? '').toString().replace(/"/g,'&quot;')}" placeholder="Edit ${human}..." />
        </div>
      `;
    }

    // Header controls
    const headerControls = `
      <div class="flex items-center justify-between mb-3">
        <div class="text-sm text-gray-700">Editing category: <span class="font-semibold text-gray-900">${cat?.title || ''}</span> — <span>${props.length}</span> accommodations</div>
        <div class="flex items-center gap-2">
          <button id="acc-expand-all" class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 shadow-sm"><i class="fas fa-chevron-down"></i><span>Expand All</span></button>
          <button id="acc-collapse-all" class="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-white hover:bg-gray-50 border border-gray-300 shadow-sm"><i class="fas fa-chevron-up"></i><span>Collapse All</span></button>
          <button id="acc-save-all" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg btn-primary shadow-sm"><i class="fas fa-check"></i><span>Save All</span></button>
        </div>
      </div>
    `;

    wrap.innerHTML = headerControls + props.map((prop, idx) => {
      const fieldsHtml = (cat?.fields || []).map(f => fieldControl(prop, f)).join('');
      return `
        <details class="bg-white border border-gray-200 rounded-lg overflow-hidden" data-id="${prop.id}" open>
          <summary class="cursor-pointer select-none px-4 py-3 bg-gray-50 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-gray-900">${prop.name || ''}</span>
              <span class="text-xs text-gray-500">${prop.location || ''}</span>
            </div>
            <div class="text-xs text-gray-500">${idx + 1} / ${props.length}</div>
          </summary>
          <div class="p-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${fieldsHtml}</div>
            <div class="flex items-center justify-end gap-2 mt-4">
              <button class="acc-save inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg btn-secondary shadow-sm" data-id="${prop.id}"><i class=\"fas fa-save\"></i><span>Save</span></button>
            </div>
          </div>
        </details>
      `;
    }).join('');

    // Wire header controls
    wrap.querySelector('#acc-expand-all')?.addEventListener('click', () => {
      wrap.querySelectorAll('details').forEach(d => d.open = true);
    });
    wrap.querySelector('#acc-collapse-all')?.addEventListener('click', () => {
      wrap.querySelectorAll('details').forEach(d => d.open = false);
    });

    async function collectUpdatesFor(id) {
      const cat = state.category;
      const updates = {};
      (cat?.fields || []).forEach((field) => {
        const el = wrap.querySelector(`#acc-${id}-${field}`);
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
      return updates;
    }

    // Wire per-item save
    wrap.querySelectorAll('.acc-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!window.propertiesManager) return;
        const id = btn.getAttribute('data-id');
        const updates = await collectUpdatesFor(id);
        const old = btn.textContent;
        btn.textContent = 'Saving...';
        btn.disabled = true;
        try {
          await window.propertiesManager.updateProperty(id, updates);
          btn.textContent = 'Saved';
          setTimeout(() => btn.textContent = old, 800);
        } catch (e) {
          console.error('Save failed', e);
          alert('Save failed. Please try again.');
          btn.textContent = old;
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Wire Save All
    wrap.querySelector('#acc-save-all')?.addEventListener('click', async (e) => {
      if (!window.propertiesManager) return;
      const btn = e.currentTarget;
      const items = await Promise.all((state.properties || []).map(async (p) => ({ id: p.id, updates: await collectUpdatesFor(p.id) })));
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = 'Saving...';
      try {
        await window.propertiesManager.updatePropertiesBatchMixed(items);
        btn.textContent = 'Saved All';
        setTimeout(() => btn.textContent = old, 1000);
      } catch (err) {
        console.error('Save All failed', err);
        alert('Save All failed. Please try again.');
        btn.textContent = old;
      } finally {
        btn.disabled = false;
      }
    });

    return wrap;
  }

  function updateUI() {
    ensureTopControls();
    const content = document.getElementById('allinfo-content');
    if (!content) return;

    let acc = document.getElementById('allinfo-accordion-wrap');
    if (state.active) {
      // Hide table wrapper
      if (state.table) {
        const wrap = state.table.closest('div');
        state.tableWrap = wrap || state.table.parentElement;
        if (state.tableWrap) state.tableWrap.style.display = 'none';
      }
      acc = buildAccordion();
      if (acc) acc.style.display = '';
    } else {
      // Show table; remove accordion
      if (state.tableWrap) state.tableWrap.style.display = '';
      if (acc) acc.remove();
    }
  }

  document.addEventListener('allInfoCategoryRendered', (evt) => {
    const { category, properties, table } = evt.detail || {};
    state.category = category;
    state.properties = Array.isArray(properties) ? properties : [];
    state.table = table || null;

    ensureTopControls();
    updateUI();
  });
})();
