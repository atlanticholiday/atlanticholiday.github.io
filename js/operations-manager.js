export class OperationsManager {
    constructor(db, userId) {
        this.db = db;
        this.userId = userId;
        this.operationsData = [];
        this.filteredData = [];
        this.currentView = 'cards'; // 'cards' or 'table'
        this.currentSearch = '';
        
        // Event listeners will be initialized when operations page is opened
        console.log('Operations manager created for user:', userId);
    }

    parseCSVFile(csvContent) {
        try {
            const lines = csvContent.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            
            console.log('CSV Headers:', headers);
            
            const operations = [];
            const errors = [];

            for (let i = 1; i < lines.length; i++) {
                try {
                    const line = lines[i];
                    if (!line.trim()) continue; // Skip empty lines
                    
                    // Parse CSV line handling quoted values and commas within quotes
                    const values = this.parseCSVLine(line);
                    
                    if (values.length < 2) {
                        errors.push(`Line ${i + 1}: Insufficient data`);
                        continue;
                    }

                    const operation = {
                        id: `op_${Date.now()}_${i}`,
                        propertyName: values[0]?.trim() || '',
                        accessCode: values[1]?.trim() || '',
                        floor: values[2]?.trim() || '',
                        parkingSpot: values[3]?.trim() || '',
                        heating: values[4]?.trim() || '',
                        smartTV: values[5]?.trim() || '',
                        dronePhotos: values[6]?.trim() || '',
                        wifiAirbnb: values[7]?.trim() || '',
                        wifiSpeed: values[8]?.trim() || '',
                        importedAt: new Date()
                    };

                    // Clean up data
                    operation.accessCode = this.cleanAccessCode(operation.accessCode);
                    operation.heating = this.standardizeHeating(operation.heating);
                    operation.smartTV = this.standardizeSmartTV(operation.smartTV);
                    operation.dronePhotos = this.standardizeDronePhotos(operation.dronePhotos);
                    operation.wifiSpeed = this.parseWifiSpeed(operation.wifiSpeed);

                    if (operation.propertyName) {
                        operations.push(operation);
                    }
                } catch (error) {
                    errors.push(`Line ${i + 1}: ${error.message}`);
                }
            }

            return { operations, errors };
        } catch (error) {
            return { operations: [], errors: [`Failed to parse CSV: ${error.message}`] };
        }
    }

    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    // Escaped quote
                    current += '"';
                    i++; // Skip next quote
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // End of field
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        // Add the last field
        values.push(current);
        
        return values;
    }

    cleanAccessCode(code) {
        if (!code) return '';
        
        // Remove common prefixes and clean up
        return code
            .replace(/^(código|code|key|🔑)\s*:?\s*/i, '')
            .replace(/[\n\r]/g, ' ')
            .trim();
    }

    standardizeHeating(heating) {
        if (!heating) return '';
        
        const lower = heating.toLowerCase();
        if (lower.includes('gas') || lower.includes('gás')) return 'Gas';
        if (lower.includes('electric') || lower.includes('eletric')) return 'Electric';
        return heating;
    }

    standardizeSmartTV(tv) {
        if (!tv) return '';
        
        const lower = tv.toLowerCase();
        if (lower === 'sim' || lower === 'yes' || lower === 'y') return 'Yes';
        if (lower === 'não' || lower === 'no' || lower === 'n') return 'No';
        if (lower.includes('?')) return 'Unknown';
        return tv;
    }

    standardizeDronePhotos(photos) {
        if (!photos) return '';
        
        const lower = photos.toLowerCase();
        if (lower === 'sim' || lower === 'yes') return 'Available';
        if (lower === 'não' || lower === 'no') return 'Not Available';
        if (lower.includes('falta') || lower.includes('missing')) return 'Missing';
        if (lower.includes('publicar') || lower.includes('publish')) return 'Need to Publish';
        return photos;
    }

    parseWifiSpeed(speed) {
        if (!speed) return '';
        
        // Extract numerical value and unit
        const match = speed.match(/(\d+)\s*(mbps|mb|gbps|gb)/i);
        if (match) {
            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            
            if (unit.includes('gb')) {
                return `${value * 1000} Mbps`;
            }
            return `${value} Mbps`;
        }
        
        return speed;
    }

    loadOperationsData(operations) {
        this.operationsData = operations;
        this.filteredData = [...operations];
        this.renderOperations();
    }

    renderOperations() {
        console.log(`🎨 Rendering operations: ${this.operationsData.length} total, ${this.filteredData.length} filtered`);
        
        this.applyFilters();
        
        const operationsGrid = document.getElementById('operations-grid');
        const operationsTable = document.getElementById('operations-table');
        const noOperationsMessage = document.getElementById('no-operations-message');
        const operationsCountElement = document.getElementById('operations-count');
        
        // Update count
        if (operationsCountElement) {
            operationsCountElement.textContent = this.filteredData.length;
        }

        if (this.filteredData.length === 0) {
            operationsGrid?.classList.add('hidden');
            operationsTable?.classList.add('hidden');
            noOperationsMessage?.classList.remove('hidden');
            return;
        }

        noOperationsMessage?.classList.add('hidden');

        // Show the appropriate view
        if (this.currentView === 'table') {
            operationsGrid?.classList.add('hidden');
            operationsTable?.classList.remove('hidden');
            this.renderTableView();
        } else {
            operationsTable?.classList.add('hidden');
            operationsGrid?.classList.remove('hidden');
            this.renderCardView();
        }
    }

    renderCardView() {
        const operationsGrid = document.getElementById('operations-grid');
        if (!operationsGrid) return;

        operationsGrid.innerHTML = this.filteredData.map(operation => this.createOperationCard(operation)).join('');
    }

    createOperationCard(operation) {
        // Determine card styling based on completeness
        const hasAccessCode = operation.accessCode && operation.accessCode !== '';
        const cardClass = hasAccessCode ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50';
        
        return `
            <div class="bg-white border ${cardClass} rounded-lg p-6 hover:shadow-lg transition-shadow operation-card">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-2">${operation.propertyName}</h3>
                        ${operation.accessCode ? `
                        <div class="bg-blue-50 border border-blue-200 rounded-md p-3 mb-3">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-blue-900">Access Code:</span>
                                <button onclick="copyToClipboard('${operation.accessCode}', this)" class="text-blue-600 hover:text-blue-800 text-xs" title="Copy to clipboard">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                </button>
                            </div>
                            <div class="text-blue-800 font-mono text-lg mt-1">${operation.accessCode}</div>
                        </div>
                        ` : '<div class="text-yellow-600 text-sm mb-3">⚠️ No access code available</div>'}
                    </div>
                </div>
                
                <!-- Property Details Grid -->
                <div class="bg-gray-50 rounded-lg p-4 mb-4">
                    <div class="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        ${operation.floor ? `
                        <div class="flex items-center">
                            <span class="text-gray-500 min-w-0 truncate">Floor:</span>
                            <span class="ml-2 font-medium">${operation.floor}</span>
                        </div>
                        ` : ''}
                        ${operation.parkingSpot ? `
                        <div class="flex items-center">
                            <span class="text-gray-500 min-w-0 truncate">Parking:</span>
                            <span class="ml-2 font-medium">${operation.parkingSpot}</span>
                        </div>
                        ` : ''}
                        ${operation.heating ? `
                        <div class="flex items-center">
                            <span class="text-gray-500 min-w-0 truncate">Heating:</span>
                            <span class="ml-2 font-medium">${operation.heating}</span>
                        </div>
                        ` : ''}
                        ${operation.smartTV ? `
                        <div class="flex items-center">
                            <span class="text-gray-500 min-w-0 truncate">Smart TV:</span>
                            <span class="ml-2 font-medium">${operation.smartTV}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <!-- Tech & Features -->
                <div class="space-y-2 text-sm">
                    ${operation.wifiSpeed ? `
                    <div class="flex items-center justify-between">
                        <span>📶 WiFi: ${operation.wifiSpeed}</span>
                        ${operation.wifiAirbnb ? `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">${operation.wifiAirbnb}</span>` : ''}
                    </div>
                    ` : ''}
                    
                    ${operation.dronePhotos ? `
                    <div class="flex items-center">
                        <span>📸 Drone Photos: ${operation.dronePhotos}</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="pt-3 mt-4 border-t border-gray-100 text-xs text-gray-500">
                    Imported ${operation.importedAt.toLocaleDateString()}
                </div>
            </div>
        `;
    }

    renderTableView() {
        const tableBody = document.getElementById('operations-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = this.filteredData.map(operation => {
            const hasAccessCode = operation.accessCode && operation.accessCode !== '';
            const rowClass = hasAccessCode ? '' : 'bg-yellow-50';
            
            return `
                <tr class="hover:bg-gray-50 transition-colors ${rowClass}">
                    <td class="px-4 py-3 border-b">
                        <div class="font-medium text-gray-900">${operation.propertyName}</div>
                    </td>
                    <td class="px-4 py-3 border-b">
                        ${operation.accessCode ? `
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-sm bg-blue-50 px-2 py-1 rounded">${operation.accessCode}</span>
                            <button onclick="copyToClipboard('${operation.accessCode}', this)" class="text-blue-600 hover:text-blue-800" title="Copy">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                            </button>
                        </div>
                        ` : '<span class="text-yellow-600 text-sm">Not available</span>'}
                    </td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900 mobile-hide">${operation.floor || '-'}</td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900 mobile-hide">${operation.parkingSpot || '-'}</td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900 mobile-hide">${operation.heating || '-'}</td>
                    <td class="px-4 py-3 border-b text-sm text-center">${operation.smartTV || '-'}</td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900">${operation.wifiSpeed || '-'}</td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900 mobile-hide">${operation.dronePhotos || '-'}</td>
                </tr>
            `;
        }).join('');
    }

    applyFilters() {
        let filtered = [...this.operationsData];

        // Apply search filter
        if (this.currentSearch) {
            filtered = filtered.filter(operation => 
                operation.propertyName.toLowerCase().includes(this.currentSearch) ||
                operation.accessCode.toLowerCase().includes(this.currentSearch) ||
                operation.floor.toLowerCase().includes(this.currentSearch) ||
                operation.parkingSpot.toLowerCase().includes(this.currentSearch)
            );
        }

        this.filteredData = filtered;
    }

    initializeEventListeners() {
        // Check if we're on the operations page before initializing
        const operationsPage = document.getElementById('operations-page');
        if (!operationsPage || operationsPage.classList.contains('hidden')) {
            console.log('Operations page not active, skipping event listener initialization');
            return;
        }

        // CSV Import Toggle
        const csvImportToggleBtn = document.getElementById('csv-import-toggle-btn');
        const csvImportSection = document.getElementById('csv-import-section');
        const csvImportCloseBtn = document.getElementById('csv-import-close-btn');
        
        if (csvImportToggleBtn && csvImportSection) {
            csvImportToggleBtn.addEventListener('click', () => {
                const isHidden = csvImportSection.classList.contains('hidden');
                if (isHidden) {
                    csvImportSection.classList.remove('hidden');
                    csvImportToggleBtn.classList.add('bg-brand', 'text-white');
                    csvImportToggleBtn.classList.remove('btn-primary');
                } else {
                    csvImportSection.classList.add('hidden');
                    csvImportToggleBtn.classList.remove('bg-brand', 'text-white');
                    csvImportToggleBtn.classList.add('btn-primary');
                }
            });
        }
        
        if (csvImportCloseBtn && csvImportSection) {
            csvImportCloseBtn.addEventListener('click', () => {
                csvImportSection.classList.add('hidden');
                csvImportToggleBtn?.classList.remove('bg-brand', 'text-white');
                csvImportToggleBtn?.classList.add('btn-primary');
            });
        }

        // CSV File Input
        const csvFileInput = document.getElementById('csv-file-input');
        const processCsvBtn = document.getElementById('process-csv-btn');
        
        if (csvFileInput) {
            csvFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const statusElement = document.getElementById('csv-import-status');
                
                if (file) {
                    statusElement.textContent = `File selected: ${file.name}`;
                    if (processCsvBtn) processCsvBtn.disabled = false;
                } else {
                    statusElement.textContent = 'No file selected';
                    if (processCsvBtn) processCsvBtn.disabled = true;
                }
            });
        }

        if (processCsvBtn) {
            processCsvBtn.addEventListener('click', () => {
                this.handleCSVUpload();
            });
        }

        // Search
        const searchInput = document.getElementById('operations-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value.toLowerCase().trim();
                this.renderOperations();
            });
        }

        // View toggles
        const cardViewBtn = document.getElementById('ops-card-view-btn');
        const tableViewBtn = document.getElementById('ops-table-view-btn');
        
        if (cardViewBtn) {
            cardViewBtn.addEventListener('click', () => {
                this.currentView = 'cards';
                cardViewBtn.classList.add('active');
                tableViewBtn?.classList.remove('active');
                this.renderOperations();
            });
        }
        
        if (tableViewBtn) {
            tableViewBtn.addEventListener('click', () => {
                this.currentView = 'table';
                tableViewBtn.classList.add('active');
                cardViewBtn?.classList.remove('active');
                this.renderOperations();
            });
        }

        // Refresh button
        const refreshBtn = document.getElementById('operations-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.renderOperations();
            });
        }
    }

    async handleCSVUpload() {
        const fileInput = document.getElementById('csv-file-input');
        const statusElement = document.getElementById('csv-import-status');
        const errorElement = document.getElementById('csv-import-error');
        const progressContainer = document.getElementById('csv-import-progress');
        const progressBar = document.getElementById('csv-import-progress-bar');
        
        if (!fileInput.files[0]) {
            errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">Please select a CSV file.</div>';
            return;
        }

        const file = fileInput.files[0];
        
        try {
            statusElement.textContent = 'Reading file...';
            progressContainer?.classList.remove('hidden');
            progressBar.style.width = '20%';
            
            const csvContent = await this.readFileAsText(file);
            
            statusElement.textContent = 'Parsing CSV data...';
            progressBar.style.width = '60%';
            
            const { operations, errors } = this.parseCSVFile(csvContent);
            
            if (errors.length > 0) {
                const errorMessages = errors.slice(0, 5).join('<br>');
                const moreErrors = errors.length > 5 ? `<br>... and ${errors.length - 5} more errors` : '';
                errorElement.innerHTML = `<div class="text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2">
                    Some parsing errors occurred:<br>${errorMessages}${moreErrors}
                </div>`;
            } else {
                errorElement.innerHTML = '';
            }
            
            statusElement.textContent = 'Loading operational data...';
            progressBar.style.width = '90%';
            
            this.loadOperationsData(operations);
            
            statusElement.textContent = `Successfully imported ${operations.length} properties`;
            progressBar.style.width = '100%';
            
            // Hide progress after delay
            setTimeout(() => {
                progressContainer?.classList.add('hidden');
            }, 2000);
            
        } catch (error) {
            console.error('CSV import failed:', error);
            errorElement.innerHTML = `<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">
                Failed to process CSV file: ${error.message}
            </div>`;
            progressContainer?.classList.add('hidden');
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    stopListening() {
        // Currently no active listeners to stop, but keeping this for consistency
        // with PropertiesManager pattern
        console.log('Operations manager stopped listening');
    }
}

// Simple toast notification function
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded-md text-white text-sm font-medium transition-all duration-300 transform ${
        type === 'error' ? 'bg-red-500' : 'bg-green-500'
    }`;
    toast.textContent = message;
    toast.style.transform = 'translateY(-100px)';
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateY(0)';
    }, 100);
    
    // Remove after delay
    setTimeout(() => {
        toast.style.transform = 'translateY(-100px)';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// Make copy function globally available
window.copyToClipboard = function(text, buttonElement) {
    navigator.clipboard.writeText(text).then(() => {
        // Add visual feedback
        const button = buttonElement || (window.event && window.event.target.closest('button'));
        if (button) {
            const originalHTML = button.innerHTML;
            button.innerHTML = `
                <svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
            `;
            button.classList.add('copy-success');
            
            setTimeout(() => {
                button.innerHTML = originalHTML;
                button.classList.remove('copy-success');
            }, 1500);
        }
        
        console.log('Copied to clipboard:', text);
        
        // Show toast notification
        showToast('Access code copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        showToast('Failed to copy access code', 'error');
    });
}; 