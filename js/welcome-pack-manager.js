export class WelcomePackManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.currentView = 'dashboard'; // dashboard, inventory, log, presets
        this.cart = []; // Array of items currently in the new pack
        this.dashboardFilters = {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Last 30 days default
            endDate: new Date().toISOString().split('T')[0]
        };
        this.editingLogId = null; // Track if we are editing a log
        this.cache = {
            logs: null,
            items: null,
            presets: null,
            properties: null
        };
    }

    async _fetchData(type) {
        if (this.cache[type]) return this.cache[type];

        switch (type) {
            case 'logs':
                this.cache.logs = await this.dataManager.getWelcomePackLogs();
                break;
            case 'items':
                this.cache.items = await this.dataManager.getWelcomePackItems();
                break;
            case 'presets':
                this.cache.presets = await this.dataManager.getWelcomePackPresets();
                break;
            case 'properties':
                this.cache.properties = this.dataManager.getAllProperties ? await this.dataManager.getAllProperties() : [];
                break;
        }
        return this.cache[type];
    }

    _invalidateCache(types) {
        if (Array.isArray(types)) {
            types.forEach(t => this.cache[t] = null);
        } else {
            this.cache[types] = null;
        }
    }

    init() {
        this.render();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Navigation events handled by main app.js or index.html
    }

    render() {
        const container = document.getElementById('welcome-pack-content');
        if (!container) return;

        container.innerHTML = `
            <div class="mb-6 flex justify-between items-center">
                <h2 class="text-2xl font-bold text-gray-800">Welcome Packs</h2>
                <div class="flex gap-2">
                    <button id="wp-dashboard-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'dashboard' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Dashboard</button>
                    <button id="wp-log-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'log' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Log Pack</button>
                    <button id="wp-presets-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'presets' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Presets</button>
                    <button id="wp-inventory-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'inventory' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Inventory</button>
                </div>
            </div>
            <div id="wp-view-container"></div>
        `;

        this.attachNavListeners();
        this.renderCurrentView();
    }

    attachNavListeners() {
        document.getElementById('wp-dashboard-btn').onclick = () => { this.currentView = 'dashboard'; this.render(); };
        document.getElementById('wp-log-btn').onclick = () => { this.editingLogId = null; this.currentView = 'log'; this.render(); };
        document.getElementById('wp-presets-btn').onclick = () => { this.currentView = 'presets'; this.render(); };
        document.getElementById('wp-inventory-btn').onclick = () => { this.currentView = 'inventory'; this.render(); };
    }

    renderCurrentView() {
        const container = document.getElementById('wp-view-container');
        if (this.currentView === 'dashboard') this.renderDashboard(container);
        else if (this.currentView === 'inventory') this.renderInventory(container);
        else if (this.currentView === 'presets') this.renderPresets(container);
        else if (this.currentView === 'log') this.renderLogForm(container);
    }

    async renderDashboard(container) {
        const logs = await this._fetchData('logs');
        const items = await this._fetchData('items');

        // Filter logs
        const filteredLogs = logs.filter(log => {
            const logDate = log.date; // already YYYY-MM-DD
            return logDate >= this.dashboardFilters.startDate && logDate <= this.dashboardFilters.endDate;
        });

        // Calculate stats
        const totalPacks = filteredLogs.length;
        const totalRevenue = filteredLogs.reduce((sum, log) => sum + (log.totalSell || 0), 0);
        const totalProfit = filteredLogs.reduce((sum, log) => sum + (log.profit || 0), 0);

        // Group by property
        const propertyStats = {};
        filteredLogs.forEach(log => {
            if (!propertyStats[log.property]) propertyStats[log.property] = 0;
            propertyStats[log.property]++;
        });

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <!-- Date Filter Control -->
                <div class="md:col-span-3 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-gray-700">Filter Date:</span>
                        <input type="date" id="wp-stats-start" value="${this.dashboardFilters.startDate}" class="border rounded p-1 text-sm">
                        <span class="text-gray-500">-</span>
                        <input type="date" id="wp-stats-end" value="${this.dashboardFilters.endDate}" class="border rounded p-1 text-sm">
                    </div>
                    <button id="wp-apply-filters" class="bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-gray-900">Apply</button>
                    <button id="wp-export-csv" class="ml-auto bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center">
                        <i class="fas fa-file-csv mr-1"></i> Export CSV
                    </button>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
                    <h3 class="text-sm font-medium text-gray-500 mb-1">Total Packs Left</h3>
                    <p class="text-3xl font-bold text-gray-800">${totalPacks}</p>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
                    <h3 class="text-sm font-medium text-gray-500 mb-1">Total Revenue</h3>
                    <p class="text-3xl font-bold text-gray-800">€${totalRevenue.toFixed(2)}</p>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
                    <h3 class="text-sm font-medium text-gray-500 mb-1">Total Profit</h3>
                    <p class="text-3xl font-bold text-gray-800">€${totalProfit.toFixed(2)}</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Recent Activity</h3>
                    <div class="overflow-y-auto max-h-80 space-y-3">
                        ${filteredLogs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(log => `
                            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                                <div>
                                    <p class="font-medium text-gray-800">${log.propertyName || log.property}</p>
                                    <p class="text-xs text-gray-500">${new Date(log.date).toLocaleDateString()}</p>
                                </div>
                                <div class="text-right flex items-center gap-3">
                                    <div class="mr-2">
                                        <p class="font-bold text-green-600">+€${(log.profit || 0).toFixed(2)}</p>
                                        <p class="text-xs text-gray-500">${log.items.length} items</p>
                                    </div>
                                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button class="text-blue-500 hover:text-blue-700 p-1" onclick="welcomePackManager.editLog('${log.id}')" title="Edit Log">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-red-400 hover:text-red-600 p-1" onclick="welcomePackManager.deleteLog('${log.id}')" title="Delete Log">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('') || '<p class="text-gray-500 text-center py-4">No packs logged yet.</p>'}
                    </div>
                </div>

                <div class="bg-white p-6 rounded-xl shadow-md">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Packs by Property</h3>
                    <div class="overflow-y-auto max-h-80 space-y-2">
                        ${Object.entries(propertyStats).sort((a, b) => b[1] - a[1]).map(([name, count]) => `
                            <div class="flex justify-between items-center p-2 border-b last:border-0 border-gray-100">
                                <span class="text-gray-700">${name}</span>
                                <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm font-medium">${count}</span>
                            </div>
                        `).join('') || '<p class="text-gray-500 text-center py-4">No data available.</p>'}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('wp-apply-filters').onclick = () => {
            const start = document.getElementById('wp-stats-start').value;
            const end = document.getElementById('wp-stats-end').value;
            if (start && end) {
                this.dashboardFilters = { startDate: start, endDate: end };
                this.render();
            }
        };

        document.getElementById('wp-export-csv').onclick = () => this.exportToCSV(filteredLogs);
    }

    exportToCSV(logs) {
        if (!logs || logs.length === 0) {
            alert('No data to export');
            return;
        }

        const headers = ['Date', 'Property', 'Items', 'Total Cost', 'Total Sell', 'Profit'];
        const csvContent = [
            headers.join(','),
            ...logs.map(log => {
                const itemNames = log.items.map(i => i.name).join('; ');
                return [
                    log.date,
                    `"${log.property}"`,
                    `"${itemNames}"`,
                    log.totalCost.toFixed(2),
                    log.totalSell.toFixed(2),
                    log.profit.toFixed(2)
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `welcome_packs_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    async renderInventory(container) {
        const items = await this._fetchData('items');

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-bold text-gray-800">Items Inventory</h3>
                    <button id="wp-add-item-btn" class="bg-[#e94b5a] hover:bg-[#d3414f] text-white px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center">
                        <i class="fas fa-plus mr-2"></i> Add Item
                    </button>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="text-gray-500 border-b border-gray-200">
                                <th class="py-3 font-medium">Item Name</th>
                                <th class="py-3 font-medium">Stock</th>
                                <th class="py-3 font-medium">Cost Price</th>
                                <th class="py-3 font-medium">Sell Price</th>
                                <th class="py-3 font-medium">Profit</th>
                                <th class="py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="wp-inventory-list">
                            ${items.map(item => `
                                <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                    <td class="py-3 text-gray-800 font-medium">${item.name}</td>
                                    <td class="py-3">
                                        <span class="px-2 py-1 rounded text-xs font-bold ${item.quantity < 5 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
                                            ${item.quantity || 0}
                                        </span>
                                    </td>
                                    <td class="py-3 text-gray-600">€${parseFloat(item.costPrice).toFixed(2)}</td>
                                    <td class="py-3 text-gray-600">€${parseFloat(item.sellPrice).toFixed(2)}</td>
                                    <td class="py-3 text-green-600 font-medium">+€${(item.sellPrice - item.costPrice).toFixed(2)}</td>
                                    <td class="py-3 text-right">
                                        <button class="text-blue-500 hover:text-blue-700 p-1 mr-2" onclick="welcomePackManager.editItem('${item.id}')">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-red-400 hover:text-red-600 transition-colors p-2" onclick="welcomePackManager.deleteItem('${item.id}')">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${items.length === 0 ? '<p class="text-center text-gray-500 py-8">No items in inventory. Add one to get started.</p>' : ''}
                </div>
            </div>
        `;

        document.getElementById('wp-add-item-btn').onclick = () => this.showAddItemModal();

        // The original delete listener was for a custom event.
        // The new delete button calls `welcomePackManager.deleteItem` directly.
        // So, the custom event listener is no longer needed if all delete calls are direct.
        // If there are other places dispatching 'wp-delete-item', this listener should remain.
        // For now, I'll assume the inline onclick replaces the need for this specific listener.
        // If `welcomePackManager` is not globally available, the inline onclicks will fail.
        // A better approach would be to attach event listeners dynamically after rendering.
        // For this change, I'll follow the user's provided `onclick` structure.
    }

    async renderPresets(container) {
        const presets = await this._fetchData('presets');

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-bold text-gray-800">Pack Presets</h3>
                    <button id="wp-add-preset-btn" class="bg-[#e94b5a] hover:bg-[#d3414f] text-white px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center">
                        <i class="fas fa-plus mr-2"></i> Create Preset
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${presets.map(preset => `
                        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group bg-gray-50">
                            <h4 class="font-bold text-gray-800 mb-2">${preset.name}</h4>
                            <p class="text-sm text-gray-600 mb-3">${preset.items.length} items</p>
                            <ul class="text-sm text-gray-500 space-y-1 mb-4">
                                ${preset.items.slice(0, 3).map(i => `<li>• ${i.name}</li>`).join('')}
                                ${preset.items.length > 3 ? `<li>+ ${preset.items.length - 3} more...</li>` : ''}
                            </ul>
                            <div class="flex justify-between items-center mt-auto border-t border-gray-200 pt-3">
                                <span class="font-bold text-gray-800">€${preset.items.reduce((sum, i) => sum + i.sellPrice, 0).toFixed(2)}</span>
                                <button class="text-red-400 hover:text-red-600 p-1" onclick="welcomePackManager.deletePreset('${preset.id}')">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `).join('') || '<p class="col-span-3 text-center text-gray-500 py-8">No presets created.</p>'}
                </div>
            </div>
        `;

        document.getElementById('wp-add-preset-btn').onclick = () => this.showAddPresetModal();
    }

    async deletePreset(id) {
        if (confirm('Delete this preset?')) {
            await this.dataManager.deleteWelcomePackPreset(id);
            this._invalidateCache('presets');
            this.render();
        }
    }

    async showAddPresetModal() {
        const items = await this._fetchData('items');

        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-add-preset-modal">
                <div class="relative p-5 border w-[500px] shadow-lg rounded-xl bg-white max-h-[80vh] flex flex-col">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Create New Preset</h3>
                    
                    <input type="text" id="wp-preset-name" placeholder="Preset Name (e.g. Standard Arrival)" class="w-full p-2 border rounded mb-4">
                    
                    <div class="bg-gray-50 p-2 rounded border mb-4">
                        <p class="text-sm font-bold text-gray-700 mb-2">Select Items for Bundle:</p>
                        <div class="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                            ${items.map(item => `
                                <label class="flex items-center space-x-2 text-sm cursor-pointer p-1 hover:bg-gray-100 rounded">
                                    <input type="checkbox" class="wp-preset-item-checkbox form-checkbox h-4 w-4 text-[#e94b5a] rounded focus:ring-[#e94b5a]" 
                                        value='${JSON.stringify({ id: item.id, name: item.name, costPrice: item.costPrice, sellPrice: item.sellPrice })}'>
                                    <span>${item.name}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 mt-auto">
                        <button id="wp-cancel-preset-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                        <button id="wp-save-preset-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Save Preset</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('wp-cancel-preset-btn').onclick = () => document.getElementById('wp-add-preset-modal').remove();
        document.getElementById('wp-save-preset-btn').onclick = async () => {
            const name = document.getElementById('wp-preset-name').value;
            const checkboxes = document.querySelectorAll('.wp-preset-item-checkbox:checked');

            if (!name) {
                alert('Please enter a preset name');
                return;
            }
            if (checkboxes.length === 0) {
                alert('Please select at least one item');
                return;
            }

            const selectedItems = Array.from(checkboxes).map(cb => JSON.parse(cb.value));

            await this.dataManager.saveWelcomePackPreset({
                name,
                items: selectedItems,
                createdAt: new Date().toISOString()
            });

            this._invalidateCache('presets');
            document.getElementById('wp-add-preset-modal').remove();
            this.render();
        };
    }

    async renderLogForm(container) {
        const items = await this._fetchData('items');
        const presets = await this._fetchData('presets');
        let properties = [];
        try {
            properties = await this._fetchData('properties');
        } catch (e) {
            console.warn('Could not fetch properties:', e);
        }

        const isEditing = !!this.editingLogId;
        const editingLog = isEditing ? await this._getLogById(this.editingLogId) : null;

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Left: Form -->
                <div class="lg:col-span-2 bg-white rounded-xl shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-bold text-gray-800">${isEditing ? 'Edit Log Entry' : 'Log New Welcome Pack'}</h3>
                        ${isEditing ? `<button class="text-sm text-gray-500 hover:text-gray-700 underline" onclick="welcomePackManager.cancelEdit()">Cancel Edit</button>` : ''}
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Property</label>
                            <input type="text" id="wp-log-property" list="wp-properties-list" 
                                class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#e94b5a] focus:border-transparent" 
                                placeholder="Select Property..." value="${editingLog ? (editingLog.propertyName || editingLog.property) : ''}">
                            <datalist id="wp-properties-list">
                                ${properties.map(p => `<option value="${p.name}"></option>`).join('')}
                            </datalist> 
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input type="date" id="wp-log-date" 
                                class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#e94b5a] focus:border-transparent" 
                                value="${editingLog ? editingLog.date : new Date().toISOString().split('T')[0]}">
                        </div>
                    </div>

                    ${!isEditing ? `
                    <div class="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Load Preset</label>
                        <select id="wp-preset-select" class="w-full p-2 border border-gray-300 rounded-lg">
                            <option value="">Select a preset to load items...</option>
                            ${presets.map(p => `<option value='${JSON.stringify(p.items)}'>${p.name} (${p.items.length} items)</option>`).join('')}
                        </select>
                    </div>
                    ` : ''}

                    <div class="mb-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">Select Items</label>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-60 overflow-y-auto p-2 border border-gray-100 rounded-lg bg-gray-50">
                            ${items.map(item => `
                                <button class="wp-item-select-btn flex flex-col items-center justify-center p-3 bg-white border border-gray-200 rounded-lg hover:border-[#e94b5a] hover:shadow-sm transition-all relative overflow-hidden" 
                                    data-id="${item.id}" data-name="${item.name}" data-cost="${item.costPrice}" data-sell="${item.sellPrice}">
                                    <span class="font-medium text-gray-800 text-sm z-10 relative">${item.name}</span>
                                    <span class="text-xs text-gray-600 z-10 relative">€${parseFloat(item.sellPrice).toFixed(2)}</span>
                                    ${item.quantity < 5 ? `<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500" title="Low Stock"></span>` : ''}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Right: Summary -->
                <div class="bg-white rounded-xl shadow-md p-6 h-fit">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Pack Summary</h3>
                    <div id="wp-cart-list" class="space-y-2 mb-4 max-h-60 overflow-y-auto">
                        <p class="text-gray-500 text-sm text-center py-4">No items selected</p>
                    </div>
                    
                    <div class="border-t border-gray-200 pt-4 space-y-2">
                        <div class="flex justify-between text-sm text-gray-600">
                            <span>Total Cost:</span>
                            <span id="wp-total-cost">€0.00</span>
                        </div>
                        <div class="flex justify-between text-lg font-bold text-gray-800">
                            <span>Total Sell Price:</span>
                            <span id="wp-total-sell">€0.00</span>
                        </div>
                        <div class="flex justify-between text-sm text-green-600 font-medium">
                            <span>Estimated Profit:</span>
                            <span id="wp-total-profit">€0.00</span>
                        </div>
                    </div>

                    <button id="wp-save-log-btn" class="w-full mt-6 bg-[#e94b5a] hover:bg-[#d3414f] text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed">
                        ${isEditing ? 'Update Log' : 'Save Log'}
                    </button>
                    ${isEditing ? `
                     <div class="mt-2 text-center">
                        <p class="text-xs text-amber-600"><i class="fas fa-exclamation-triangle mr-1"></i> Updating will adjust stock differences.</p>
                     </div>
                    ` : ''}
                </div>
            </div>
        `;

        // Initialize cart if editing
        if (isEditing && editingLog) {
            this.cart = [...editingLog.items];
            // Store original items for diffing logic in saveLog
            this.editingOriginalItems = [...editingLog.items];
        } else {
            this.cart = [];
        }
        this.updateCartUI();

        // Preset Listener
        const presetSelect = document.getElementById('wp-preset-select');
        if (presetSelect) {
            presetSelect.onchange = (e) => {
                if (e.target.value) {
                    const newItems = JSON.parse(e.target.value);
                    this.cart = [...this.cart, ...newItems];
                    this.updateCartUI();
                    e.target.value = ""; // Reset dropdown
                }
            };
        }

        // Item selection logic
        container.querySelectorAll('.wp-item-select-btn').forEach(btn => {
            btn.onclick = () => {
                const item = {
                    id: btn.dataset.id,
                    name: btn.dataset.name,
                    costPrice: parseFloat(btn.dataset.cost),
                    sellPrice: parseFloat(btn.dataset.sell)
                };
                this.cart.push(item);
                this.updateCartUI();
            };
        });

        document.getElementById('wp-save-log-btn').onclick = () => this.saveLog();
    }

    async _getLogById(id) {
        const logs = await this._fetchData('logs');
        return logs.find(l => l.id === id);
    }

    cancelEdit() {
        this.editingLogId = null;
        this.currentView = 'dashboard';
        this.render();
    }

    updateCartUI() {
        const list = document.getElementById('wp-cart-list');
        if (this.cart.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No items selected</p>';
        } else {
            list.innerHTML = this.cart.map((item, index) => `
                <div class="flex justify-between items-center bg-gray-50 p-2 rounded">
                    <span class="text-sm font-medium text-gray-700">${item.name}</span>
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-gray-500">€${item.sellPrice.toFixed(2)}</span>
                        <button class="text-red-400 hover:text-red-600" onclick="document.dispatchEvent(new CustomEvent('wp-remove-cart-item', {detail: ${index}}))">×</button>
                    </div>
                </div>
            `).join('');
        }

        // Add remove listener
        if (!this._cartRemoveListenerAttached) {
            document.addEventListener('wp-remove-cart-item', (e) => {
                this.cart.splice(e.detail, 1);
                this.updateCartUI();
            });
            this._cartRemoveListenerAttached = true;
        }

        // Update totals
        const totalCost = this.cart.reduce((sum, item) => sum + item.costPrice, 0);
        const totalSell = this.cart.reduce((sum, item) => sum + item.sellPrice, 0);
        const totalProfit = totalSell - totalCost;

        document.getElementById('wp-total-cost').textContent = `€${totalCost.toFixed(2)}`;
        document.getElementById('wp-total-sell').textContent = `€${totalSell.toFixed(2)}`;
        document.getElementById('wp-total-profit').textContent = `€${totalProfit.toFixed(2)}`;
    }

    async saveLog() {
        const property = document.getElementById('wp-log-property').value;
        const date = document.getElementById('wp-log-date').value;

        if (!property) {
            alert('Please select a property');
            return;
        }
        if (this.cart.length === 0) {
            alert('Please select at least one item');
            return;
        }

        const totalCost = this.cart.reduce((sum, item) => sum + item.costPrice, 0);
        const totalSell = this.cart.reduce((sum, item) => sum + item.sellPrice, 0);

        const logData = {
            property,
            date,
            items: this.cart,
            totalCost,
            totalSell,
            profit: totalSell - totalCost,
            createdAt: new Date().toISOString()
        };

        try {
            if (this.editingLogId) {
                // Update existing log
                await this.dataManager.updateWelcomePackLog(this.editingLogId, this.editingOriginalItems, logData);
                alert('Welcome Pack updated successfully!');
                this.editingLogId = null;
                this.editingOriginalItems = null;
            } else {
                // Create new log
                await this.dataManager.logWelcomePack(logData);
                alert('Welcome Pack logged successfully!');
            }
            this._invalidateCache(['logs', 'items']);
            this.currentView = 'dashboard';
            this.render();
        } catch (error) {
            console.error('Error saving pack:', error);
            alert('Failed to save pack. Please try again.');
        }
    }

    async deleteLog(id) {
        if (confirm('Are you sure you want to delete this log? Stock will be restored.')) {
            const logs = await this._fetchData('logs');
            const log = logs.find(l => l.id === id);
            if (log) {
                await this.dataManager.deleteWelcomePackLog(id, log.items);
                this._invalidateCache(['logs', 'items']);
                this.render();
            }
        }
    }

    async editLog(id) {
        this.editingLogId = id;
        this.currentView = 'log';
        this.render();
    }

    showAddItemModal() {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-add-item-modal">
                <div class="relative p-5 border w-96 shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Add New Item</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-new-item-name" placeholder="Item Name" class="w-full p-2 border rounded">
                        <input type="number" id="wp-new-item-stock" placeholder="Initial Stock Quantity" class="w-full p-2 border rounded">
                        <input type="number" id="wp-new-item-cost" placeholder="Cost Price (€)" step="0.01" class="w-full p-2 border rounded">
                        <input type="number" id="wp-new-item-sell" placeholder="Sell Price (€)" step="0.01" class="w-full p-2 border rounded">
                        <div class="flex justify-end gap-2 mt-4">
                            <button id="wp-cancel-add-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                            <button id="wp-confirm-add-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Add Item</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('wp-cancel-add-btn').onclick = () => document.getElementById('wp-add-item-modal').remove();
        document.getElementById('wp-confirm-add-btn').onclick = async () => {
            const name = document.getElementById('wp-new-item-name').value;
            const stock = parseInt(document.getElementById('wp-new-item-stock').value) || 0;
            const costPrice = parseFloat(document.getElementById('wp-new-item-cost').value);
            const sellPrice = parseFloat(document.getElementById('wp-new-item-sell').value);

            if (name && !isNaN(costPrice) && !isNaN(sellPrice)) {
                await this.dataManager.saveWelcomePackItem({
                    name,
                    quantity: stock,
                    costPrice,
                    sellPrice
                });
                this._invalidateCache('items');
                document.getElementById('wp-add-item-modal').remove();
                this.render(); // Refresh list
            } else {
                alert('Please fill all fields correctly');
            }
        };
    }

    async editItem(id) {
        const items = await this._fetchData('items');
        const item = items.find(i => i.id === id);
        if (item) {
            this.showEditItemModal(item);
        }
    }

    showEditItemModal(item) {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-edit-item-modal">
                <div class="relative p-5 border w-96 shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Item</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-edit-item-name" value="${item.name}" placeholder="Item Name" class="w-full p-2 border rounded">
                        <input type="number" id="wp-edit-item-stock" value="${item.quantity || 0}" placeholder="Stock Quantity" class="w-full p-2 border rounded">
                        <div class="grid grid-cols-2 gap-3">
                            <input type="number" id="wp-edit-item-cost" value="${item.costPrice}" placeholder="Cost Price (€)" step="0.01" class="w-full p-2 border rounded">
                            <input type="number" id="wp-edit-item-sell" value="${item.sellPrice}" placeholder="Sell Price (€)" step="0.01" class="w-full p-2 border rounded">
                        </div>
                        <div class="flex justify-end gap-2 mt-4">
                            <button id="wp-cancel-edit-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                            <button id="wp-confirm-edit-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('wp-cancel-edit-btn').onclick = () => document.getElementById('wp-edit-item-modal').remove();
        document.getElementById('wp-confirm-edit-btn').onclick = async () => {
            const name = document.getElementById('wp-edit-item-name').value;
            const stock = document.getElementById('wp-edit-item-stock').value;
            const costPrice = parseFloat(document.getElementById('wp-edit-item-cost').value);
            const sellPrice = parseFloat(document.getElementById('wp-edit-item-sell').value);

            if (name && !isNaN(costPrice) && !isNaN(sellPrice)) {
                await this.dataManager.updateWelcomePackItem(item.id, {
                    name,
                    quantity: parseInt(stock) || 0,
                    costPrice,
                    sellPrice
                });
                this._invalidateCache('items');
                document.getElementById('wp-edit-item-modal').remove();
                this.renderCurrentView(); // Refresh list
            } else {
                alert('Please fill out all fields correctly.');
            }
        };
    }

    async deleteItem(id) {
        if (confirm('Are you sure you want to delete this item?')) {
            await this.dataManager.deleteWelcomePackItem(id);
            this._invalidateCache('items');
            this.render();
        }
    }
}


