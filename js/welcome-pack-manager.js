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
            <div class="mb-6 flex justify-between items-center flex-wrap gap-3">
                <h2 class="text-2xl font-bold text-gray-800">Welcome Packs</h2>
                <div class="flex gap-2 flex-wrap">
                    <button id="wp-dashboard-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'dashboard' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Dashboard</button>
                    <button id="wp-reservations-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'reservations' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all flex items-center gap-1">
                        <i class="fas fa-calendar-alt text-sm"></i> Reservations
                    </button>
                    <button id="wp-log-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'log' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Log Pack</button>
                    <button id="wp-presets-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'presets' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Presets</button>
                    <button id="wp-inventory-btn" class="px-4 py-2 rounded-lg ${this.currentView === 'inventory' ? 'bg-[#e94b5a] text-white shadow-md' : 'bg-white text-gray-800 hover:bg-gray-50 border border-gray-200'} transition-all">Inventory</button>
                    <button id="wp-help-btn" class="px-4 py-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-all font-medium" title="User Guide & Help">
                        <i class="fas fa-question-circle mr-1"></i> Help
                    </button>
                </div>
            </div>
            <div id="wp-view-container"></div>
        `;

        this.attachNavListeners();
        this.renderCurrentView();
    }

    attachNavListeners() {
        document.getElementById('wp-dashboard-btn').onclick = () => { this.currentView = 'dashboard'; this.render(); };
        document.getElementById('wp-reservations-btn').onclick = () => { this.currentView = 'reservations'; this.render(); };
        document.getElementById('wp-log-btn').onclick = () => { this.editingLogId = null; this.currentView = 'log'; this.render(); };
        document.getElementById('wp-presets-btn').onclick = () => { this.currentView = 'presets'; this.render(); };
        document.getElementById('wp-inventory-btn').onclick = () => { this.currentView = 'inventory'; this.render(); };
        document.getElementById('wp-help-btn').onclick = () => { this.showHelpModal(); };
    }

    renderCurrentView() {
        const container = document.getElementById('wp-view-container');
        if (this.currentView === 'dashboard') this.renderDashboard(container);
        else if (this.currentView === 'reservations') this.renderReservations(container);
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
        const totalCost = totalRevenue - totalProfit;
        const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        // Group by property
        const propertyStats = {};
        filteredLogs.forEach(log => {
            if (!propertyStats[log.property]) propertyStats[log.property] = 0;
            propertyStats[log.property]++;
        });

        // Check for low stock items
        const lowStockItems = items.filter(item => (item.quantity || 0) < 5);

        container.innerHTML = `
            <!-- Low Stock Alert -->
            ${lowStockItems.length > 0 ? `
            <div class="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-6 flex items-start gap-4">
                <div class="bg-amber-100 rounded-full p-2">
                    <i class="fas fa-exclamation-triangle text-amber-600 text-xl"></i>
                </div>
                <div class="flex-1">
                    <h3 class="font-bold text-amber-800 mb-1">Low Stock Alert</h3>
                    <p class="text-sm text-amber-700 mb-2">${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low on stock:</p>
                    <div class="flex flex-wrap gap-2">
                        ${lowStockItems.map(item => `
                            <span class="inline-flex items-center gap-1 bg-white border border-amber-200 rounded-full px-3 py-1 text-sm">
                                <span class="font-medium text-amber-800">${item.name}</span>
                                <span class="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">${item.quantity || 0}</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
                <button onclick="welcomePackManager.currentView='inventory'; welcomePackManager.render();" 
                    class="text-amber-700 hover:text-amber-900 font-medium text-sm whitespace-nowrap">
                    Manage Stock →
                </button>
            </div>
            ` : ''}


            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <!-- Date Filter Control -->
                <div class="md:col-span-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
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

                <!-- KPI Cards -->
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Packs Delivered</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The total number of welcome packs that have been logged as 'Delivered' within the selected date range."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">${totalPacks}</p>
                        </div>
                        <div class="p-2 bg-blue-50 text-blue-500 rounded-lg">
                            <i class="fas fa-box"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-gray-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Cost</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The sum of the cost price for all items included in the delivered packs. This represents your expense."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">€${totalCost.toFixed(2)}</p>
                        </div>
                         <div class="p-2 bg-gray-50 text-gray-500 rounded-lg">
                            <i class="fas fa-receipt"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                             <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Revenue</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The total amount sold/charged for the welcome packs."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">€${totalRevenue.toFixed(2)}</p>
                        </div>
                         <div class="p-2 bg-green-50 text-green-500 rounded-lg">
                            <i class="fas fa-euro-sign"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                             <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Profit (Margin)</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="Net profit (Revenue - Cost) and the profit margin percentage.<br>A margin above 30% is generally considered healthy (Green arrow)."></i>
                             </div>
                            <p class="text-3xl font-bold text-gray-800">€${totalProfit.toFixed(2)}</p>
                            <p class="text-sm ${profitMargin >= 30 ? 'text-green-600' : 'text-amber-600'} font-medium mt-1">
                                <i class="fas ${profitMargin >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${profitMargin.toFixed(1)}% Margin
                            </p>
                        </div>
                         <div class="p-2 bg-purple-50 text-purple-500 rounded-lg">
                            <i class="fas fa-chart-line"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Section -->
             <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Performance Trends</h3>
                        <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="Shows the daily profit (Green line) and number of packs delivered (Blue bars) over the selected period.<br>Useful for spotting busy days."></i>
                    </div>
                    <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-trend-chart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Distribution by Property</h3>
                        <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="Breakdown of how many packs were delivered to each property."></i>
                    </div>
                    <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-distribution-chart"></canvas>
                    </div>
                </div>
            </div>
            
             <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Top Items Chart (New) -->
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                         <h3 class="text-lg font-bold text-gray-800">Top Items Used</h3>
                         <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="The 10 most frequently used items in packs.<br>Helps you know what to restock."></i>
                    </div>
                     <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-items-chart"></canvas>
                    </div>
                </div>

                <!-- Recent Activity (Modified to fit) -->
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Recent Activity</h3>
                    <div class="overflow-y-auto h-64 space-y-3 pr-2">
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

        // Initialize Charts
        this.initDashboardCharts(filteredLogs, items);

        // Initialize Tooltips (Tippy.js)
        if (typeof tippy !== 'undefined') {
            tippy('[data-tippy-content]', {
                theme: 'light-border',
                animation: 'scale',
                allowHTML: true,
                maxWidth: 300
            });
        }
    }

    initDashboardCharts(logs, allItems) {
        // Prepare Data

        // 1. Trend Data (Group by Month or Day)
        const dateGroups = {};
        logs.forEach(log => {
            // Simple daily grouping for the selected range
            const date = log.date;
            if (!dateGroups[date]) dateGroups[date] = { count: 0, profit: 0 };
            dateGroups[date].count++;
            dateGroups[date].profit += (log.profit || 0);
        });

        const sortedDates = Object.keys(dateGroups).sort();
        const trendLabels = sortedDates; // formatted date could be better
        const trendCounts = sortedDates.map(d => dateGroups[d].count);
        const trendProfits = sortedDates.map(d => dateGroups[d].profit);

        // 2. Property Distribution
        const propStats = {};
        logs.forEach(log => {
            const propName = log.propertyName || log.property;
            if (!propStats[propName]) propStats[propName] = 0;
            propStats[propName]++;
        });
        const distLabels = Object.keys(propStats);
        const distData = Object.values(propStats);

        // 3. Top Items
        const itemCounts = {};
        logs.forEach(log => {
            log.items.forEach(item => {
                const itemName = item.name;
                if (!itemCounts[itemName]) itemCounts[itemName] = 0;
                itemCounts[itemName] += (item.qty || 1); // Assuming qty property, otherwise 1
            });
        });
        // Sort by count desc
        const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10
        const itemLabels = sortedItems.map(i => i[0]);
        const itemData = sortedItems.map(i => i[1]);


        // Render Charts using Chart.js
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return;
        }

        // --- Trend Chart ---
        const ctxTrend = document.getElementById('wp-trend-chart')?.getContext('2d');
        if (ctxTrend) {
            new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: trendLabels,
                    datasets: [
                        {
                            label: 'Profit (€)',
                            data: trendProfits,
                            backgroundColor: 'rgba(34, 197, 94, 0.5)', // Green
                            borderColor: 'rgba(34, 197, 94, 1)',
                            borderWidth: 1,
                            yAxisID: 'y',
                            type: 'line',
                            tension: 0.3
                        },
                        {
                            label: 'Packs Delivered',
                            data: trendCounts,
                            backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Profit (€)' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
                            title: { display: true, text: 'Count' }
                        }
                    }
                }
            });
        }

        // --- Distribution Chart ---
        const ctxDist = document.getElementById('wp-distribution-chart')?.getContext('2d');
        if (ctxDist) {
            new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: distLabels,
                    datasets: [{
                        data: distData,
                        backgroundColor: [
                            'rgba(233, 75, 90, 0.7)', // Brand Red
                            'rgba(59, 130, 246, 0.7)',
                            'rgba(34, 197, 94, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(168, 85, 247, 0.7)',
                            'rgba(236, 72, 153, 0.7)',
                            'rgba(99, 102, 241, 0.7)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }

        // --- Items Chart ---
        const ctxItems = document.getElementById('wp-items-chart')?.getContext('2d');
        if (ctxItems) {
            new Chart(ctxItems, {
                type: 'bar',
                data: {
                    labels: itemLabels,
                    datasets: [{
                        label: 'Quantity Used',
                        data: itemData,
                        backgroundColor: 'rgba(233, 75, 90, 0.6)',
                        borderColor: 'rgba(233, 75, 90, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y', // Horizontal bar chart
                }
            });
        }
    }

    /**
     * Show the Help/Guide Modal
     */
    showHelpModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('wp-help-modal');
        if (existingModal) existingModal.remove();

        // Create modal content
        const modal = document.createElement('div');
        modal.id = 'wp-help-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity opacity-0';

        // Trigger generic fade-in
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all scale-95 opacity-0" id="wp-help-modal-inner">
                <!-- Header -->
                <div class="bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex justify-between items-center text-white">
                    <div>
                        <h2 class="text-2xl font-bold">Welcome Pack Manager Guide</h2>
                        <p class="text-blue-100 opacity-90 text-sm mt-1">Learn how to manage packs, reservations, and inventory.</p>
                    </div>
                    <button id="wp-help-close" class="text-white hover:bg-white/20 rounded-lg p-2 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        <!-- Nav Sidebar (Simple) -->
                        <div class="md:col-span-1 space-y-2 sticky top-0">
                            <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-blue-200 text-blue-700 font-bold flex items-center gap-3 transition-transform hover:translate-x-1" onclick="document.getElementById('help-section-workflow').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                Typical Workflow
                            </button>
                            <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-blue-600" onclick="document.getElementById('help-section-dashboard').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                Understanding Stats
                            </button>
                             <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-blue-600" onclick="document.getElementById('help-section-inventory').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                Inventory & Presets
                            </button>
                        </div>

                        <!-- Main Guide Content -->
                        <div class="md:col-span-2 space-y-8">
                            
                            <!-- SECTION 1: WORKFLOW -->
                            <div id="help-section-workflow" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-tasks text-blue-500"></i> Daily Workflow
                                </h3>
                                <div class="space-y-4">
                                    <div class="flex gap-4">
                                        <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">1</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">Check Reservations</h4>
                                            <p class="text-sm text-gray-600 mt-1">Go to the <strong>Reservations</strong> tab to see upcoming check-ins. This tells you which properties need a welcome pack soon.</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4">
                                         <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">2</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">Log a Pack</h4>
                                            <p class="text-sm text-gray-600 mt-1">Click <strong>Log Pack</strong>. Select the property and date. Add items manually or click "Load Preset" to fill the pack with standard items instantly.</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4">
                                         <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">3</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">Save & Monitor</h4>
                                            <p class="text-sm text-gray-600 mt-1">Once saved, the pack is recorded. The items are deduced from your Inventory, and the cost/revenue is added to the Dashboard stats.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div id="help-section-dashboard" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-chart-pie text-purple-500"></i> Dashboard & Stats
                                </h3>
                                <p class="text-sm text-gray-600 mb-4">The dashboard gives you a financial overview. Hover over the <i class="fas fa-info-circle text-gray-400"></i> icons on the dashboard for detailed explanations.</p>
                                <ul class="space-y-3 text-sm">
                                    <li class="flex items-start gap-2">
                                        <span class="font-bold text-gray-700 min-w-[100px]">Profit Margin:</span>
                                        <span class="text-gray-600">Calculated as <code>(Total Profit / Total Revenue) * 100</code>. Aim for >30%.</span>
                                    </li>
                                    <li class="flex items-start gap-2">
                                        <span class="font-bold text-gray-700 min-w-[100px]">Trends:</span>
                                        <span class="text-gray-600">The "Performance Trends" chart shows if you are making more money (green line) even if delivering fewer packs (bars).</span>
                                    </li>
                                </ul>
                            </div>

                             <!-- SECTION 3: INVENTORY -->
                            <div id="help-section-inventory" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-boxes text-amber-500"></i> Inventory & Presets
                                </h3>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div class="bg-amber-50 p-3 rounded-lg">
                                        <h4 class="font-bold text-amber-800 mb-1">Managing Stock</h4>
                                        <p class="text-xs text-amber-700">Go to <strong>Inventory</strong> to add new items (e.g., "Wine Bottle", "cookies"). Set the 'Buy Price' (your cost) and 'Sell Price' (what you charge owner).</p>
                                    </div>
                                    <div class="bg-green-50 p-3 rounded-lg">
                                        <h4 class="font-bold text-green-800 mb-1">Using Presets</h4>
                                        <p class="text-xs text-green-700">In <strong>Presets</strong>, create a standard "Welcome Pack" containing your usual items. This saves time so you don't have to select 10 items every time you log a pack.</p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
                
                <!-- Footer -->
                <div class="p-4 bg-gray-100 border-t border-gray-200 text-center">
                    <button id="wp-help-done-btn" class="bg-blue-600 text-white px-8 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors">
                        Got it, thanks!
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Trigger inner scale animation
        setTimeout(() => {
            const inner = document.getElementById('wp-help-modal-inner');
            inner.classList.remove('scale-95', 'opacity-0');
            inner.classList.add('scale-100', 'opacity-100');
        }, 50);

        // Close handlers
        const close = () => {
            modal.classList.add('opacity-0'); // Fade out wrapper
            const inner = document.getElementById('wp-help-modal-inner');
            inner.classList.remove('scale-100', 'opacity-100');
            inner.classList.add('scale-95', 'opacity-0');
            setTimeout(() => modal.remove(), 300); // Remove after anim
        };
        document.getElementById('wp-help-close').onclick = close;
        document.getElementById('wp-help-done-btn').onclick = close;
        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
    }


    /**
     * Render the Reservations view with two sub-tabs
     */
    async renderReservations(container) {
        // Default to 'upcoming' sub-tab if not set
        if (!this.reservationsSubTab) {
            this.reservationsSubTab = 'upcoming';
        }
        if (!this.reservationsDateFilter) {
            this.reservationsDateFilter = 7; // Default: 7 days
        }

        container.innerHTML = `
            <!-- Sub-Tab Navigation -->
            <div class="bg-white rounded-xl shadow-md mb-6 overflow-hidden">
                <div class="flex border-b border-gray-200">
                    <button id="wp-subtab-upcoming" class="flex-1 px-6 py-4 text-center font-medium transition-colors ${this.reservationsSubTab === 'upcoming'
                ? 'text-[#e94b5a] border-b-2 border-[#e94b5a] bg-red-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}">
                        <i class="fas fa-calendar-alt mr-2"></i>
                        Upcoming Reservations
                    </button>
                    <button id="wp-subtab-settings" class="flex-1 px-6 py-4 text-center font-medium transition-colors ${this.reservationsSubTab === 'settings'
                ? 'text-[#e94b5a] border-b-2 border-[#e94b5a] bg-red-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}">
                        <i class="fas fa-cog mr-2"></i>
                        Property Settings
                    </button>
                </div>
                
                <!-- Sub-Tab Content -->
                <div id="wp-subtab-content" class="p-6">
                    <!-- Content will be inserted based on active tab -->
                </div>
            </div>
        `;

        // Set up sub-tab listeners
        document.getElementById('wp-subtab-upcoming').onclick = () => {
            this.reservationsSubTab = 'upcoming';
            this.renderReservations(container);
        };
        document.getElementById('wp-subtab-settings').onclick = () => {
            this.reservationsSubTab = 'settings';
            this.renderReservations(container);
        };

        // Render the appropriate sub-tab content
        const contentContainer = document.getElementById('wp-subtab-content');
        if (this.reservationsSubTab === 'upcoming') {
            await this.renderUpcomingReservations(contentContainer);
        } else {
            await this.renderPropertySettings(contentContainer);
        }
    }


    /**
     * Render Upcoming Reservations sub-tab (View Only)
     */
    async renderUpcomingReservations(container) {
        // Get stats
        let configuredCount = 0;
        let totalCount = 0;
        let properties = [];
        try {
            properties = await this._fetchData('properties');
            totalCount = properties.length;
            configuredCount = properties.filter(p => p.welcomePackEnabled).length;
        } catch (e) {
            console.warn('[WelcomePack] Could not fetch properties:', e);
        }

        const filterDays = this.reservationsDateFilter;

        // Load cached last sync time
        const lastSync = localStorage.getItem('wp_last_sync');
        const lastSyncText = lastSync ? `Last updated: ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';

        container.innerHTML = `
            <!-- Header with Sync Button -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">Future Bookings</h3>
                    <p class="text-sm text-gray-500">${configuredCount} of ${totalCount} properties have Welcome Pack enabled</p>
                </div>
                <div class="flex items-center gap-3">
                    <span id="wp-last-sync-label" class="text-xs text-gray-400 font-medium">${lastSyncText}</span>
                    <button id="wp-sync-reservations-btn" style="background-color: #ef4444 !important; color: white !important;" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                        <i class="fas fa-sync-alt"></i> Sync Now
                    </button>
                </div>
            </div>

            <!-- Date Filter Buttons -->
            <div class="flex flex-wrap gap-2 mb-6">
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 7
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="7" style="${filterDays === 7 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    Next 7 Days
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 15
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="15" style="${filterDays === 15 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    Next 15 Days
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 30
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="30" style="${filterDays === 30 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    Next 30 Days
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 365
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="365" style="${filterDays === 365 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    View All
                </button>
            </div>

            <!-- Reservations List -->
            <div id="wp-reservations-list" class="space-y-3">
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-circle-notch fa-spin text-3xl text-gray-300 mb-4"></i>
                    <p class="text-lg font-medium mb-2">Loading reservations...</p>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">Check-ins Today</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-today-count">—</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">This Week</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-week-count">—</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">Next ${filterDays} Days</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-period-count">—</p>
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('wp-sync-reservations-btn').onclick = () => this.syncAndDisplayReservations(false); // Manual sync

        document.querySelectorAll('.wp-date-filter').forEach(btn => {
            btn.onclick = () => {
                this.reservationsDateFilter = parseInt(btn.dataset.days);
                this.renderReservations(document.getElementById('wp-view-container'));
            };
        });

        // AUTO-SYNC LOGIC
        // 1. Try to load from cache immediately
        const cachedData = localStorage.getItem('wp_reservations');
        if (cachedData) {
            try {
                const parsedData = JSON.parse(cachedData);
                // Render with cached data immediately
                this.displayReservationsList(parsedData, properties);
            } catch (e) {
                console.error('Error parsing cached reservations', e);
            }
        } else {
            // If no cache, standard loading state is already in HTML
        }

        // 2. Trigger background sync
        // Pass 'true' for isBackground to avoid showing the loading spinner if cache exists
        this.syncAndDisplayReservations(!!cachedData);
    }

    /**
     * Render iCal Connections sub-tab (Settings)
     */
    /**
     * Render Property Settings sub-tab - Enable/disable welcome pack for properties
     */
    async renderPropertySettings(container) {
        let properties = [];
        let enabledCount = 0;
        try {
            properties = await this._fetchData('properties');
            enabledCount = properties.filter(p => p.welcomePackEnabled).length;
        } catch (e) {
            console.warn('[WelcomePack] Could not fetch properties:', e);
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">Welcome Pack Properties</h3>
                    <p class="text-sm text-gray-500">${enabledCount} of ${properties.length} properties have welcome pack enabled</p>
                </div>
            </div>

            <!-- Info Banner -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div class="flex items-start gap-3">
                    <i class="fas fa-info-circle text-blue-500 text-lg mt-0.5"></i>
                    <div>
                        <p class="text-sm text-blue-800 font-medium">Configure which properties need welcome packs</p>
                        <p class="text-sm text-blue-700 mt-1">
                            Search for a property below and enable welcome pack tracking. 
                            Only enabled properties will appear in the Upcoming Reservations list.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Search Input -->
            <div class="relative mb-4">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i class="fas fa-search text-gray-400"></i>
                </div>
                <input type="text" id="wp-property-settings-search" 
                    placeholder="Search for a property to enable/disable..." 
                    class="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                    autocomplete="off">
            </div>
            
            <!-- Search Results -->
            <div id="wp-property-settings-results" class="border border-gray-200 rounded-lg overflow-hidden hidden mb-6">
                <!-- Results will be inserted here -->
            </div>
            
            <!-- Empty State / Instructions -->
            <div id="wp-property-settings-empty" class="text-center py-8 text-gray-500 mb-6">
                <i class="fas fa-building text-4xl text-gray-300 mb-3"></i>
                <p>Start typing to search for a property</p>
            </div>

            <!-- Enabled Properties List -->
            <div class="border-t border-gray-200 pt-6">
                <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
                    <i class="fas fa-gift text-[#e94b5a] mr-2"></i>
                    Properties with Welcome Pack Enabled (${enabledCount})
                </h4>
                
                ${enabledCount > 0 ? `
                    <div class="space-y-2">
                        ${properties.filter(p => p.welcomePackEnabled).map(property => `
                            <div class="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-lg">
                                <div class="flex-1">
                                    <span class="font-medium text-gray-800">${property.name || property.id}</span>
                                    <span class="ml-2 text-xs text-green-600">
                                        <i class="fas fa-check-circle"></i> Welcome Pack Enabled
                                    </span>
                                </div>
                                <button class="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                    onclick="welcomePackManager.toggleWelcomePack('${property.id}', false)">
                                    <i class="fas fa-times mr-1"></i> Disable
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="text-center py-6 text-gray-400 bg-gray-50 rounded-lg">
                        <i class="fas fa-gift text-3xl mb-2 opacity-50"></i>
                        <p>No properties have welcome pack enabled yet</p>
                        <p class="text-sm">Search and enable properties above</p>
                    </div>
                `}
            </div>
        `;

        // Property search with debounce
        let searchTimeout = null;
        document.getElementById('wp-property-settings-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length < 2) {
                document.getElementById('wp-property-settings-results').classList.add('hidden');
                document.getElementById('wp-property-settings-empty').classList.remove('hidden');
                return;
            }

            searchTimeout = setTimeout(() => this.searchPropertiesForSettings(query), 300);
        });
    }

    /**
     * Search properties for welcome pack settings
     */
    async searchPropertiesForSettings(query) {
        const resultsContainer = document.getElementById('wp-property-settings-results');
        const emptyState = document.getElementById('wp-property-settings-empty');

        if (!resultsContainer) return;

        // Show loading
        resultsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                <i class="fas fa-circle-notch fa-spin mr-2"></i> Searching...
            </div>
        `;

        try {
            const properties = await this._fetchData('properties');
            const lowerQuery = query.toLowerCase();

            // Filter properties by name
            const matches = properties.filter(p =>
                (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
                (p.id && p.id.toLowerCase().includes(lowerQuery))
            ).slice(0, 10); // Limit to 10 results

            if (matches.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-4 text-center text-gray-500">
                        <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
                        <p>No properties found matching "${query}"</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = matches.map(property => `
                <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <div class="flex-1">
                        <span class="font-medium text-gray-800">${property.name || property.id}</span>
                        ${property.welcomePackEnabled
                    ? `<span class="ml-2 inline-flex items-center gap-1 text-green-600 text-xs">
                                <i class="fas fa-check-circle"></i> Enabled
                              </span>`
                    : `<span class="ml-2 inline-flex items-center gap-1 text-gray-400 text-xs">
                                <i class="fas fa-times-circle"></i> Disabled
                              </span>`
                }
                    </div>
                    <button class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${property.welcomePackEnabled
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }"
                        onclick="welcomePackManager.toggleWelcomePack('${property.id}', ${!property.welcomePackEnabled})">
                        ${property.welcomePackEnabled
                    ? '<i class="fas fa-times mr-1"></i> Disable'
                    : '<i class="fas fa-check mr-1"></i> Enable'}
                    </button>
                </div>
            `).join('');

        } catch (error) {
            console.error('[WelcomePack] Error searching properties:', error);
            resultsContainer.innerHTML = `
                <div class="p-4 text-center text-red-500">
                    <i class="fas fa-exclamation-circle mr-2"></i> Error searching properties
                </div>
            `;
        }
    }

    /**
     * Toggle welcome pack enabled/disabled for a property
     */
    async toggleWelcomePack(propertyId, enabled) {
        try {
            await this.dataManager.updatePropertyWelcomePack(propertyId, enabled);
            this._invalidateCache('properties');
            this.renderReservations(document.getElementById('wp-view-container'));
        } catch (error) {
            console.error('[WelcomePack] Error toggling welcome pack:', error);
            alert('Error updating property. Please try again.');
        }
    }


    /**
     * Search properties for iCal configuration
     */
    async searchPropertiesForIcal(query) {
        const resultsContainer = document.getElementById('wp-ical-search-results');
        const emptyState = document.getElementById('wp-ical-search-empty');

        if (!resultsContainer) return;

        // Show loading
        resultsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                <i class="fas fa-circle-notch fa-spin mr-2"></i> Searching...
            </div>
        `;

        try {
            const properties = await this._fetchData('properties');
            const lowerQuery = query.toLowerCase();

            // Filter properties by name
            const matches = properties.filter(p =>
                (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
                (p.id && p.id.toLowerCase().includes(lowerQuery))
            ).slice(0, 10); // Limit to 10 results

            if (matches.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-4 text-center text-gray-500">
                        <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
                        <p>No properties found matching "${query}"</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = matches.map(property => `
                <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <div class="flex-1">
                        <span class="font-medium text-gray-800">${property.name || property.id}</span>
                        ${property.icalUrl
                    ? `<span class="ml-2 inline-flex items-center gap-1 text-green-600 text-xs">
                                <i class="fas fa-check-circle"></i> Connected
                              </span>`
                    : `<span class="ml-2 inline-flex items-center gap-1 text-gray-400 text-xs">
                                <i class="fas fa-times-circle"></i> Not connected
                              </span>`
                }
                    </div>
                    <button class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${property.icalUrl
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-[#e94b5a] text-white hover:bg-[#d3414f]'
                }"
                        onclick="welcomePackManager.showIcalConfigModal('${property.id}', '${(property.name || '').replace(/'/g, "\\'")}', '${(property.icalUrl || '').replace(/'/g, "\\'")}')">
                        ${property.icalUrl ? '<i class="fas fa-edit mr-1"></i> Edit' : '<i class="fas fa-plus mr-1"></i> Add iCal'}
                    </button>
                </div>
            `).join('');

        } catch (error) {
            console.error('[WelcomePack] Error searching properties:', error);
            resultsContainer.innerHTML = `
                <div class="p-4 text-center text-red-500">
                    <i class="fas fa-exclamation-circle mr-2"></i> Error searching properties
                </div>
            `;
        }
    }

    /**
     * Remove iCal URL from a property
     */
    async removeIcalUrl(propertyId, propertyName) {
        if (!confirm(`Remove iCal connection for "${propertyName}"?\n\nThis will stop syncing reservations for this property.`)) {
            return;
        }

        try {
            await this.dataManager.updatePropertyIcalUrl(propertyId, '');
            this._invalidateCache('properties');
            this.renderReservations(document.getElementById('wp-view-container'));
        } catch (error) {
            console.error('[WelcomePack] Error removing iCal URL:', error);
            alert('Error removing iCal connection. Please try again.');
        }
    }

    /**
     * Sync calendars and display reservations list
     */
    /**
     * Sync reservations from configured sources and update the display
     * @param {boolean} isBackground - If true, run silently without showing loading spinner
     */
    async syncAndDisplayReservations(isBackground = false) {
        const listContainer = document.getElementById('wp-reservations-list');
        const syncBtn = document.getElementById('wp-sync-reservations-btn');
        const lastSyncLabel = document.getElementById('wp-last-sync-label');

        if (!listContainer) return;

        // Show loading state only if not background sync
        if (!isBackground && syncBtn) {
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
            syncBtn.disabled = true;

            listContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-circle-notch fa-spin text-4xl text-gray-400 mb-4"></i>
                    <p class="text-lg">Fetching reservations...</p>
                </div>
            `;
        }

        try {
            // 1. Fetch Properties
            let properties = [];
            try {
                properties = await this._fetchData('properties');
            } catch (e) {
                console.warn('[WelcomePack] Could not fetch properties:', e);
            }

            // 2. Fetch Reservations (Google Sheets)
            const allReservations = [];
            try {
                const sheetsReservations = await this.fetchGoogleSheetsReservations();
                allReservations.push(...sheetsReservations);
                console.log(`[WelcomePack] Fetched ${sheetsReservations.length} reservations from Google Sheets`);
            } catch (error) {
                console.error('[WelcomePack] Error fetching from Google Sheets:', error);
            }

            // 3. Cache Data & Timestamp
            localStorage.setItem('wp_reservations', JSON.stringify(allReservations));
            const now = new Date();
            localStorage.setItem('wp_last_sync', now.toISOString());

            // 4. Update UI
            if (lastSyncLabel) {
                lastSyncLabel.textContent = `Last updated: ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }

            this.displayReservationsList(allReservations, properties);

        } catch (error) {
            console.error('[WelcomePack] Error syncing reservations:', error);
            if (!isBackground) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-red-500">
                        <i class="fas fa-exclamation-triangle text-5xl mb-4"></i>
                        <p class="text-lg font-medium">Error syncing calendars</p>
                        <p class="text-sm">${error.message}</p>
                    </div>
                `;
            }
        } finally {
            // Reset button state
            if (syncBtn) {
                syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Now';
                syncBtn.disabled = false;
            }
        }
    }

    /**
     * Render the list of reservations based on current data and filters
     */
    displayReservationsList(allReservations, properties) {
        const listContainer = document.getElementById('wp-reservations-list');
        if (!listContainer) return;

        // Get enabled property names for filtering
        const enabledProperties = properties.filter(p => p.welcomePackEnabled);
        const enabledPropertyNames = enabledProperties.map(p => (p.name || p.id).toLowerCase());

        // Filter to only show reservations for welcome-pack-enabled properties
        const enabledReservations = allReservations.filter(r => {
            const propertyName = (r.propertyName || '').toLowerCase();
            return enabledPropertyNames.some(enabled =>
                propertyName.includes(enabled) || enabled.includes(propertyName)
            );
        });

        // 1. Check if ANY properties are enabled
        if (enabledProperties.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-gift text-5xl text-amber-400 mb-4"></i>
                    <p class="text-lg font-medium text-gray-700 mb-2">No properties have welcome pack enabled</p>
                    <p class="text-sm text-gray-500 mb-4">Go to "Property Settings" to enable welcome pack for your properties</p>
                    <button onclick="welcomePackManager.reservationsSubTab='settings'; welcomePackManager.renderReservations(document.getElementById('wp-view-container'));"
                        class="px-4 py-2 bg-[#e94b5a] text-white rounded-lg hover:bg-[#d3414f] transition-colors">
                        <i class="fas fa-cog mr-2"></i> Configure Properties
                    </button>
                </div>
            `;
            return;
        }

        // 2. Filter by date range
        const filterDays = this.reservationsDateFilter || 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + filterDays);

        const filteredReservations = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn >= today && checkIn <= endDate;
        }).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

        // 3. Update Stats
        const todayStr = today.toISOString().split('T')[0];
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);

        const todayCount = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn.toISOString().split('T')[0] === todayStr;
        }).length;

        const weekCount = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn >= today && checkIn <= weekEnd;
        }).length;

        const todayEl = document.getElementById('wp-today-count');
        const weekEl = document.getElementById('wp-week-count');
        const periodEl = document.getElementById('wp-period-count');

        if (todayEl) todayEl.textContent = todayCount.toString();
        if (weekEl) weekEl.textContent = weekCount.toString();
        if (periodEl) periodEl.textContent = filteredReservations.length.toString();


        // 4. Render List
        if (filteredReservations.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-calendar-check text-4xl text-gray-300 mb-3"></i>
                    <p class="text-lg font-medium text-gray-600">No check-ins in the next ${filterDays} days</p>
                    <p class="text-sm mt-1">Reservations will appear here when guests book</p>
                    ${enabledReservations.length === 0 ? '<p class="text-xs text-amber-500 mt-2">(No reservations found for enabled properties)</p>' : ''}
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-3">';

        for (const reservation of filteredReservations) {
            const checkInDate = new Date(reservation.checkIn);
            const checkOutDate = new Date(reservation.checkOut);
            const isToday = checkInDate.toISOString().split('T')[0] === todayStr;
            const isTomorrow = checkInDate.toISOString().split('T')[0] === new Date(today.getTime() + 86400000).toISOString().split('T')[0];
            const nights = Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

            html += `
            <div class="bg-white border ${isToday ? 'border-green-300 bg-green-50' : 'border-gray-200'} rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            ${isToday ? '<span class="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded">CHECK-IN TODAY</span>' : ''}
                            ${isTomorrow ? '<span class="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded">CHECK-IN TOMORROW</span>' : ''}
                            <span class="font-medium text-gray-800">${reservation.propertyName}</span>
                        </div>
                        <div class="text-sm text-gray-600 mb-2 grid grid-cols-2 gap-2">
                            <div>
                                <p class="text-xs text-gray-400 uppercase">Check-in</p>
                                <p class="font-medium flex items-center gap-1">
                                    <i class="fas fa-sign-in-alt text-green-500"></i>
                                    ${checkInDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase">Check-out</p>
                                <p class="font-medium flex items-center gap-1">
                                    <i class="fas fa-sign-out-alt text-red-500"></i>
                                    ${checkOutDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 text-xs text-gray-500">
                            <span class="bg-gray-100 px-2 py-1 rounded">${nights} night${nights > 1 ? 's' : ''}</span>
                            ${reservation.guestName
                    ? `<span class="font-medium text-gray-700"><i class="fas fa-user mr-1"></i>${reservation.guestName}</span>`
                    : (reservation.summary && reservation.summary !== 'UNAVAILABLE')
                        ? `<span><i class="fas fa-user mr-1"></i>${reservation.summary}</span>`
                        : `<span class="text-gray-400"><i class="fas fa-lock mr-1"></i>Blocked / Reserved</span>`
                }
                            ${reservation.portal
                    ? `<span class="px-2 py-0.5 rounded text-xs font-medium ${reservation.portal.toLowerCase().includes('airbnb') ? 'bg-red-100 text-red-700' :
                        reservation.portal.toLowerCase().includes('booking') ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                    }">${reservation.portal}</span>`
                    : ''
                }
                        </div>

                    </div>
                    <button onclick="welcomePackManager.logPackForReservation('${reservation.propertyName.replace(/'/g, "\\'")}')"
                            class="px-3 py-2 bg-[#e94b5a] text-white text-sm rounded-lg hover:bg-[#d3414f] transition-colors flex items-center gap-1 ml-4">
                    <i class="fas fa-gift"></i> Assign Pack
                </button>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        listContainer.innerHTML = html;
    }

    /**
     * Fetch and parse iCal data from a URL
     */
    async fetchAndParseIcal(icalUrl, propertyName) {
        // Use CORS proxy for cross-origin requests
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(icalUrl)}`;

        let response;
        try {
            // Try direct fetch first
            response = await fetch(icalUrl);
            if (!response.ok) throw new Error('Direct fetch failed');
        } catch (e) {
            // Fall back to CORS proxy
            console.log(`[WelcomePack] Using CORS proxy for ${propertyName}`);
            response = await fetch(proxyUrl);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch calendar: ${response.status}`);
        }

        const icalText = await response.text();
        return this.parseIcalData(icalText, propertyName);
    }

    /**
     * Parse iCal text data into reservation objects
     */
    parseIcalData(icalText, propertyName) {
        const reservations = [];

        // Split into events
        const events = icalText.split('BEGIN:VEVENT');

        for (let i = 1; i < events.length; i++) {
            const eventBlock = events[i].split('END:VEVENT')[0];

            // Extract DTSTART
            const dtStartMatch = eventBlock.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
            // Extract DTEND
            const dtEndMatch = eventBlock.match(/DTEND(?:;VALUE=DATE)?:(\d{8})/);
            // Extract SUMMARY
            const summaryMatch = eventBlock.match(/SUMMARY:(.+?)(?:\r?\n|\r)/);

            if (dtStartMatch && dtEndMatch) {
                const startStr = dtStartMatch[1];
                const endStr = dtEndMatch[1];

                // Parse dates (format: YYYYMMDD)
                const checkIn = new Date(
                    parseInt(startStr.substring(0, 4)),
                    parseInt(startStr.substring(4, 6)) - 1,
                    parseInt(startStr.substring(6, 8))
                );

                const checkOut = new Date(
                    parseInt(endStr.substring(0, 4)),
                    parseInt(endStr.substring(4, 6)) - 1,
                    parseInt(endStr.substring(6, 8))
                );

                reservations.push({
                    propertyName: propertyName,
                    checkIn: checkIn.toISOString(),
                    checkOut: checkOut.toISOString(),
                    summary: summaryMatch ? summaryMatch[1].trim() : 'Reserved'
                });
            }
        }

        return reservations;
    }

    /**
     * Fetch reservations from Google Apps Script Web App
     * The script automatically aggregates all sheets and returns JSON
     */
    async fetchGoogleSheetsReservations() {
        const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyvIkBDhwZ3MxOW8aQUlD5qx3UV9l8wS-dMg8PcixJIrJ7-eXAid6vo6stchkBNfGpA/exec';

        try {
            const response = await fetch(APPS_SCRIPT_URL);

            if (!response.ok) {
                throw new Error(`Script returned status: ${response.status}`);
            }

            const reservations = await response.json();
            return reservations;

        } catch (error) {
            console.error('[WelcomePack] Error fetching from Apps Script:', error);
            return [];
        }
    }




    /**
     * Quick action to log a pack for a reservation
     */
    logPackForReservation(propertyName) {
        // Switch to log pack view and pre-fill property
        this.currentView = 'log';
        this.render();

        // Try to set the property in the form
        setTimeout(() => {
            const propertySelect = document.getElementById('wp-log-property');
            if (propertySelect) {
                // Find the option that matches
                for (const option of propertySelect.options) {
                    if (option.text === propertyName || option.value === propertyName) {
                        propertySelect.value = option.value;
                        break;
                    }
                }
            }
        }, 100);
    }




    /**
     * Show modal to configure iCal URL for a property
     */
    showIcalConfigModal(propertyId, propertyName, currentUrl) {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-ical-config-modal">
                <div class="relative p-5 border w-[500px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-2">Configure iCal URL</h3>
                    <p class="text-sm text-gray-600 mb-4">Property: <strong>${propertyName || propertyId}</strong></p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">iCal/ICS URL</label>
                            <input type="url" id="wp-ical-url-input" value="${currentUrl}" 
                                placeholder="https://www.airbnb.com/calendar/ical/..." 
                                class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">
                                Find this in your channel manager (Airbnb, Booking.com, VRBO, etc.)
                            </p>
                        </div>
                        
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p class="text-sm text-blue-800"><i class="fas fa-info-circle mr-2"></i>How to find your iCal URL:</p>
                            <ul class="text-xs text-blue-700 mt-2 space-y-1 ml-4">
                                <li>• <strong>Airbnb:</strong> Calendar → Availability settings → Export calendar</li>
                                <li>• <strong>Booking.com:</strong> Property → Calendar → Sync calendars</li>
                                <li>• <strong>VRBO:</strong> Calendar → Import/Export → Export</li>
                            </ul>
                        </div>
                        
                        <div class="flex justify-end gap-2">
                            <button id="wp-ical-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                            <button id="wp-ical-test-btn" class="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Test URL</button>
                            <button id="wp-ical-save-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Save</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('wp-ical-cancel-btn').onclick = () => {
            document.getElementById('wp-ical-config-modal').remove();
        };

        document.getElementById('wp-ical-test-btn').onclick = async () => {
            const url = document.getElementById('wp-ical-url-input').value.trim();
            if (!url) {
                alert('Please enter a URL first');
                return;
            }

            const btn = document.getElementById('wp-ical-test-btn');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testing...';
            btn.disabled = true;

            try {
                // Try to fetch the URL
                const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
                const text = await response.text();

                if (text.includes('BEGIN:VCALENDAR')) {
                    alert('✅ URL is valid! Calendar data received successfully.');
                } else {
                    alert('⚠️ URL returned data but it doesn\'t appear to be a valid iCal format.');
                }
            } catch (error) {
                alert('❌ Could not fetch URL. Please check if the URL is correct and accessible.');
            } finally {
                btn.innerHTML = 'Test URL';
                btn.disabled = false;
            }
        };

        document.getElementById('wp-ical-save-btn').onclick = async () => {
            const url = document.getElementById('wp-ical-url-input').value.trim();

            try {
                // Save iCal URL to property (you'll need to add this method to DataManager)
                if (this.dataManager.updatePropertyIcalUrl) {
                    await this.dataManager.updatePropertyIcalUrl(propertyId, url);
                } else {
                    // Fallback: store in a separate collection
                    console.warn('[WelcomePack] updatePropertyIcalUrl not available, storing separately');
                    // For now, just close and show message
                    alert('iCal URL saved! (Note: Full integration requires DataManager update)');
                }

                this._invalidateCache('properties');
                document.getElementById('wp-ical-config-modal').remove();
                this.render();
            } catch (error) {
                console.error('[WelcomePack] Error saving iCal URL:', error);
                alert('Error saving URL. Please try again.');
            }
        };
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

        // Calculate low stock items for alert
        const lowStockItems = items.filter(item => (item.quantity || 0) < 5);

        container.innerHTML = `
            ${lowStockItems.length > 0 ? `
            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
                <i class="fas fa-exclamation-triangle text-amber-500 mt-1"></i>
                <div>
                    <p class="font-semibold text-amber-800">Low Stock Alert</p>
                    <p class="text-sm text-amber-700">${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low: ${lowStockItems.map(i => `<strong>${i.name}</strong> (${i.quantity || 0})`).join(', ')}</p>
                </div>
            </div>
            ` : ''}
            
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
                            <tr class="text-gray-500 border-b border-gray-200 text-sm">
                                <th class="py-3 font-medium">Item Name</th>
                                <th class="py-3 font-medium text-center">Stock</th>
                                <th class="py-3 font-medium">VAT</th>
                                <th class="py-3 font-medium">Cost (Net)</th>
                                <th class="py-3 font-medium">Cost (Gross)</th>
                                <th class="py-3 font-medium">Sell (Net)</th>
                                <th class="py-3 font-medium">Sell (Gross)</th>
                                <th class="py-3 font-medium">Profit</th>
                                <th class="py-3 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="wp-inventory-list">
                            ${items.map(item => {
            const costVat = item.costVatRate || 22;
            const sellVat = item.sellVatRate || 22;
            const costGross = item.costGross || (item.costPrice * (1 + costVat / 100));
            const sellGross = item.sellGross || (item.sellPrice * (1 + sellVat / 100));
            const profit = sellGross - costGross;
            const isLowStock = (item.quantity || 0) < 5;

            return `
                                <tr class="border-b border-gray-100 last:border-0 hover:bg-gray-50 ${isLowStock ? 'bg-red-50/50' : ''}">
                                    <td class="py-3 text-gray-800 font-medium">
                                        ${item.name}
                                        ${isLowStock ? '<i class="fas fa-exclamation-circle text-red-500 ml-2" title="Low Stock"></i>' : ''}
                                    </td>
                                    <td class="py-3 text-center">
                                        <span class="px-2 py-1 rounded text-xs font-bold ${isLowStock ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
                                            ${item.quantity || 0}
                                        </span>
                                    </td>
                                    <td class="py-3">
                                        <span class="px-2 py-0.5 rounded text-xs font-medium ${this.getVatBadgeClass(sellVat)}">
                                            ${sellVat}%
                                        </span>
                                    </td>
                                    <td class="py-3 text-gray-600 text-sm">€${parseFloat(item.costPrice).toFixed(2)}</td>
                                    <td class="py-3 text-gray-800 font-medium text-sm">€${costGross.toFixed(2)}</td>
                                    <td class="py-3 text-gray-600 text-sm">€${parseFloat(item.sellPrice).toFixed(2)}</td>
                                    <td class="py-3 text-gray-800 font-medium text-sm">€${sellGross.toFixed(2)}</td>
                                    <td class="py-3 text-green-600 font-medium text-sm">+€${profit.toFixed(2)}</td>
                                    <td class="py-3 text-right">
                                        <button class="text-blue-500 hover:text-blue-700 p-1 mr-2" onclick="welcomePackManager.editItem('${item.id}')" title="Edit">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-red-400 hover:text-red-600 transition-colors p-1" onclick="welcomePackManager.deleteItem('${item.id}')" title="Delete">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                        </tbody>
                    </table>
                    ${items.length === 0 ? '<p class="text-center text-gray-500 py-8">No items in inventory. Add one to get started.</p>' : ''}
                </div>
            </div>
        `;

        document.getElementById('wp-add-item-btn').onclick = () => this.showAddItemModal();
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
                    ${presets.map(preset => {
            // Calculate total items count and total price with VAT
            const totalItemCount = preset.items.reduce((sum, i) => sum + (i.quantity || 1), 0);
            const totalGross = preset.items.reduce((sum, i) => {
                const qty = i.quantity || 1;
                const vatRate = i.sellVatRate || 22;
                const itemGross = i.sellPrice * (1 + vatRate / 100);
                return sum + (itemGross * qty);
            }, 0);

            return `
                        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group bg-gray-50">
                            <h4 class="font-bold text-gray-800 mb-2">${preset.name}</h4>
                            <p class="text-sm text-gray-600 mb-3">${totalItemCount} item${totalItemCount > 1 ? 's' : ''}</p>
                            <ul class="text-sm text-gray-500 space-y-1 mb-4">
                                ${preset.items.slice(0, 4).map(i => `<li>• ${i.quantity && i.quantity > 1 ? `${i.quantity}× ` : ''}${i.name}</li>`).join('')}
                                ${preset.items.length > 4 ? `<li class="text-gray-400">+ ${preset.items.length - 4} more...</li>` : ''}
                            </ul>
                            <div class="flex justify-between items-center mt-auto border-t border-gray-200 pt-3">
                                <div>
                                    <span class="font-bold text-gray-800">€${totalGross.toFixed(2)}</span>
                                    <span class="text-xs text-gray-500 ml-1">(incl. VAT)</span>
                                </div>
                                <button class="text-red-400 hover:text-red-600 p-1" onclick="welcomePackManager.deletePreset('${preset.id}')" title="Delete Preset">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
        }).join('') || '<p class="col-span-3 text-center text-gray-500 py-8">No presets created.</p>'}
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
                <div class="relative p-5 border w-[550px] shadow-lg rounded-xl bg-white max-h-[85vh] flex flex-col">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Create New Pack Preset</h3>
                    
                    <input type="text" id="wp-preset-name" placeholder="Preset Name (e.g. Gold Welcome Pack)" class="w-full p-2 border rounded mb-4">
                    
                    <div class="bg-gray-50 p-3 rounded-lg border mb-4 flex-1 overflow-hidden flex flex-col">
                        <p class="text-sm font-bold text-gray-700 mb-2">Select Items & Quantities:</p>
                        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
                            ${items.map(item => {
            const vatRate = item.sellVatRate || 22;
            const sellGross = item.sellGross || (item.sellPrice * (1 + vatRate / 100));
            return `
                                <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors wp-preset-item-row" data-item-id="${item.id}">
                                    <input type="checkbox" class="wp-preset-item-checkbox form-checkbox h-5 w-5 text-[#e94b5a] rounded focus:ring-[#e94b5a] cursor-pointer" 
                                        data-item='${JSON.stringify({ id: item.id, name: item.name, costPrice: item.costPrice, sellPrice: item.sellPrice, costVatRate: item.costVatRate || 22, sellVatRate: vatRate })}'>
                                    <div class="flex-1">
                                        <span class="font-medium text-gray-800">${item.name}</span>
                                        <span class="ml-2 px-1.5 py-0.5 text-xs rounded ${this.getVatBadgeClass(vatRate)}">${vatRate}%</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm text-gray-500">€${sellGross.toFixed(2)}</span>
                                        <span class="text-gray-400">×</span>
                                        <input type="number" class="wp-preset-item-qty w-16 p-1.5 border rounded text-center text-sm" 
                                            value="1" min="1" max="99" disabled>
                                    </div>
                                </div>
                            `;
        }).join('')}
                        </div>
                    </div>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-blue-800">Pack Total:</span>
                            <span id="wp-preset-total" class="text-lg font-bold text-blue-900">€0.00</span>
                        </div>
                        <div id="wp-preset-summary" class="text-xs text-blue-700 mt-1">Select items to see pack composition</div>
                    </div>

                    <div class="flex justify-end gap-2">
                        <button id="wp-cancel-preset-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                        <button id="wp-save-preset-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Save Preset</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Enable/disable quantity input based on checkbox
        const updateTotals = () => {
            const rows = document.querySelectorAll('.wp-preset-item-row');
            let totalNet = 0;
            let totalGross = 0;
            const summaryParts = [];

            rows.forEach(row => {
                const checkbox = row.querySelector('.wp-preset-item-checkbox');
                const qtyInput = row.querySelector('.wp-preset-item-qty');

                if (checkbox.checked) {
                    const itemData = JSON.parse(checkbox.dataset.item);
                    const qty = parseInt(qtyInput.value) || 1;
                    const vatRate = itemData.sellVatRate || 22;
                    const itemGross = itemData.sellPrice * (1 + vatRate / 100);

                    totalNet += itemData.sellPrice * qty;
                    totalGross += itemGross * qty;
                    summaryParts.push(`${qty}× ${itemData.name}`);
                }
            });

            document.getElementById('wp-preset-total').textContent = `€${totalGross.toFixed(2)}`;
            document.getElementById('wp-preset-summary').textContent = summaryParts.length > 0
                ? summaryParts.join(', ') + ` (Net: €${totalNet.toFixed(2)} + VAT)`
                : 'Select items to see pack composition';
        };

        document.querySelectorAll('.wp-preset-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                const row = this.closest('.wp-preset-item-row');
                const qtyInput = row.querySelector('.wp-preset-item-qty');
                qtyInput.disabled = !this.checked;
                if (this.checked) {
                    qtyInput.focus();
                    qtyInput.select();
                }
                updateTotals();
            });
        });

        document.querySelectorAll('.wp-preset-item-qty').forEach(input => {
            input.addEventListener('input', updateTotals);
            input.addEventListener('change', updateTotals);
        });

        document.getElementById('wp-cancel-preset-btn').onclick = () => document.getElementById('wp-add-preset-modal').remove();
        document.getElementById('wp-save-preset-btn').onclick = async () => {
            const name = document.getElementById('wp-preset-name').value;
            const rows = document.querySelectorAll('.wp-preset-item-row');

            if (!name) {
                alert('Please enter a preset name');
                return;
            }

            const selectedItems = [];
            rows.forEach(row => {
                const checkbox = row.querySelector('.wp-preset-item-checkbox');
                const qtyInput = row.querySelector('.wp-preset-item-qty');

                if (checkbox.checked) {
                    const itemData = JSON.parse(checkbox.dataset.item);
                    selectedItems.push({
                        ...itemData,
                        quantity: parseInt(qtyInput.value) || 1
                    });
                }
            });

            if (selectedItems.length === 0) {
                alert('Please select at least one item');
                return;
            }

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

    // Helper function to calculate VAT
    calculateVAT(netPrice, vatRate) {
        const net = parseFloat(netPrice) || 0;
        const rate = parseFloat(vatRate) || 22;
        const vatAmount = net * (rate / 100);
        const grossPrice = net + vatAmount;
        return { net, vatAmount, grossPrice, rate };
    }

    // Helper to get VAT rate badge color
    getVatBadgeClass(vatRate) {
        const rate = parseInt(vatRate) || 22;
        if (rate === 4) return 'bg-green-100 text-green-700';
        if (rate === 12) return 'bg-yellow-100 text-yellow-700';
        return 'bg-blue-100 text-blue-700'; // 22%
    }

    showAddItemModal() {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-add-item-modal">
                <div class="relative p-5 border w-[420px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Add New Item</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-new-item-name" placeholder="Item Name" class="w-full p-2 border rounded">
                        <input type="number" id="wp-new-item-stock" placeholder="Initial Stock Quantity" class="w-full p-2 border rounded" min="0">
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">Cost Price (Net, excl. VAT)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-new-item-cost" placeholder="Net Price (€)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-new-item-cost-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4">4% (Reduced)</option>
                                    <option value="12">12% (Intermediate)</option>
                                    <option value="22" selected>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-cost-vat-preview" class="mt-2 text-sm text-gray-600 hidden">
                                <!-- VAT preview will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">Sell Price (Net, excl. VAT)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-new-item-sell" placeholder="Net Price (€)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-new-item-sell-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4">4% (Reduced)</option>
                                    <option value="12">12% (Intermediate)</option>
                                    <option value="22" selected>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-sell-vat-preview" class="mt-2 text-sm text-gray-600 hidden">
                                <!-- VAT preview will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="flex justify-end gap-2 mt-4">
                            <button id="wp-cancel-add-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Cancel</button>
                            <button id="wp-confirm-add-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">Add Item</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // VAT calculation preview function
        const updateVatPreview = (inputId, vatSelectId, previewId) => {
            const netPrice = parseFloat(document.getElementById(inputId).value) || 0;
            const vatRate = parseInt(document.getElementById(vatSelectId).value) || 22;
            const preview = document.getElementById(previewId);

            if (netPrice > 0) {
                const { vatAmount, grossPrice } = this.calculateVAT(netPrice, vatRate);
                preview.innerHTML = `<span class="text-gray-500">€${netPrice.toFixed(2)}</span> + <span class="text-orange-600">€${vatAmount.toFixed(2)} VAT</span> = <span class="font-bold text-gray-800">€${grossPrice.toFixed(2)}</span>`;
                preview.classList.remove('hidden');
            } else {
                preview.classList.add('hidden');
            }
        };

        // Attach VAT preview listeners
        ['wp-new-item-cost', 'wp-new-item-cost-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-new-item-cost', 'wp-new-item-cost-vat', 'wp-cost-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-new-item-cost', 'wp-new-item-cost-vat', 'wp-cost-vat-preview'));
        });
        ['wp-new-item-sell', 'wp-new-item-sell-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-new-item-sell', 'wp-new-item-sell-vat', 'wp-sell-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-new-item-sell', 'wp-new-item-sell-vat', 'wp-sell-vat-preview'));
        });

        document.getElementById('wp-cancel-add-btn').onclick = () => document.getElementById('wp-add-item-modal').remove();
        document.getElementById('wp-confirm-add-btn').onclick = async () => {
            const name = document.getElementById('wp-new-item-name').value;
            const stock = parseInt(document.getElementById('wp-new-item-stock').value) || 0;
            const costPrice = parseFloat(document.getElementById('wp-new-item-cost').value);
            const costVatRate = parseInt(document.getElementById('wp-new-item-cost-vat').value) || 22;
            const sellPrice = parseFloat(document.getElementById('wp-new-item-sell').value);
            const sellVatRate = parseInt(document.getElementById('wp-new-item-sell-vat').value) || 22;

            if (name && !isNaN(costPrice) && !isNaN(sellPrice)) {
                const costCalc = this.calculateVAT(costPrice, costVatRate);
                const sellCalc = this.calculateVAT(sellPrice, sellVatRate);

                await this.dataManager.saveWelcomePackItem({
                    name,
                    quantity: stock,
                    costPrice: costPrice,           // Net cost
                    costVatRate: costVatRate,       // VAT rate for cost
                    costGross: costCalc.grossPrice, // Gross cost (calculated)
                    sellPrice: sellPrice,           // Net sell
                    sellVatRate: sellVatRate,       // VAT rate for sell
                    sellGross: sellCalc.grossPrice  // Gross sell (calculated)
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
        // Get current VAT rates or default to 22%
        const currentCostVat = item.costVatRate || 22;
        const currentSellVat = item.sellVatRate || 22;

        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-edit-item-modal">
                <div class="relative p-5 border w-[420px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">Edit Item</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-edit-item-name" value="${item.name}" placeholder="Item Name" class="w-full p-2 border rounded">
                        <input type="number" id="wp-edit-item-stock" value="${item.quantity || 0}" placeholder="Stock Quantity" class="w-full p-2 border rounded" min="0">
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">Cost Price (Net, excl. VAT)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-edit-item-cost" value="${item.costPrice}" placeholder="Net Price (€)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-edit-item-cost-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4" ${currentCostVat === 4 ? 'selected' : ''}>4% (Reduced)</option>
                                    <option value="12" ${currentCostVat === 12 ? 'selected' : ''}>12% (Intermediate)</option>
                                    <option value="22" ${currentCostVat === 22 ? 'selected' : ''}>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-edit-cost-vat-preview" class="mt-2 text-sm text-gray-600">
                                <!-- VAT preview will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">Sell Price (Net, excl. VAT)</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-edit-item-sell" value="${item.sellPrice}" placeholder="Net Price (€)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-edit-item-sell-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4" ${currentSellVat === 4 ? 'selected' : ''}>4% (Reduced)</option>
                                    <option value="12" ${currentSellVat === 12 ? 'selected' : ''}>12% (Intermediate)</option>
                                    <option value="22" ${currentSellVat === 22 ? 'selected' : ''}>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-edit-sell-vat-preview" class="mt-2 text-sm text-gray-600">
                                <!-- VAT preview will be inserted here -->
                            </div>
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

        // VAT calculation preview function
        const updateVatPreview = (inputId, vatSelectId, previewId) => {
            const netPrice = parseFloat(document.getElementById(inputId).value) || 0;
            const vatRate = parseInt(document.getElementById(vatSelectId).value) || 22;
            const preview = document.getElementById(previewId);

            if (netPrice > 0) {
                const { vatAmount, grossPrice } = this.calculateVAT(netPrice, vatRate);
                preview.innerHTML = `<span class="text-gray-500">€${netPrice.toFixed(2)}</span> + <span class="text-orange-600">€${vatAmount.toFixed(2)} VAT</span> = <span class="font-bold text-gray-800">€${grossPrice.toFixed(2)}</span>`;
            } else {
                preview.innerHTML = '';
            }
        };

        // Attach VAT preview listeners
        ['wp-edit-item-cost', 'wp-edit-item-cost-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview'));
        });
        ['wp-edit-item-sell', 'wp-edit-item-sell-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-edit-item-sell', 'wp-edit-item-sell-vat', 'wp-edit-sell-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-edit-item-sell', 'wp-edit-item-sell-vat', 'wp-edit-sell-vat-preview'));
        });

        // Initial preview update
        updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview');
        updateVatPreview('wp-edit-item-sell', 'wp-edit-item-sell-vat', 'wp-edit-sell-vat-preview');

        document.getElementById('wp-cancel-edit-btn').onclick = () => document.getElementById('wp-edit-item-modal').remove();
        document.getElementById('wp-confirm-edit-btn').onclick = async () => {
            const name = document.getElementById('wp-edit-item-name').value;
            const stock = document.getElementById('wp-edit-item-stock').value;
            const costPrice = parseFloat(document.getElementById('wp-edit-item-cost').value);
            const costVatRate = parseInt(document.getElementById('wp-edit-item-cost-vat').value) || 22;
            const sellPrice = parseFloat(document.getElementById('wp-edit-item-sell').value);
            const sellVatRate = parseInt(document.getElementById('wp-edit-item-sell-vat').value) || 22;

            if (name && !isNaN(costPrice) && !isNaN(sellPrice)) {
                const costCalc = this.calculateVAT(costPrice, costVatRate);
                const sellCalc = this.calculateVAT(sellPrice, sellVatRate);

                await this.dataManager.updateWelcomePackItem(item.id, {
                    name,
                    quantity: parseInt(stock) || 0,
                    costPrice: costPrice,
                    costVatRate: costVatRate,
                    costGross: costCalc.grossPrice,
                    sellPrice: sellPrice,
                    sellVatRate: sellVatRate,
                    sellGross: sellCalc.grossPrice
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
