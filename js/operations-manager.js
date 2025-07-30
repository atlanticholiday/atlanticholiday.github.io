import { collection, addDoc, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
            console.log('Raw CSV lines:', lines.slice(0, 10)); // Debug first 10 lines
            
            // Handle multi-line headers by joining lines until we have proper header count
            let headerEndIndex = 0;
            let combinedHeader = '';
            
            // Look for the line that ends the header (has the expected number of commas/fields)
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                combinedHeader += lines[i];
                const headerFields = this.parseCSVLine(combinedHeader);
                
                // If we have 8-9 fields, this is likely our complete header
                if (headerFields.length >= 8) {
                    headerEndIndex = i;
                    break;
                }
                
                // Add space for multi-line continuation
                if (i < lines.length - 1) combinedHeader += ' ';
            }
            
            const headers = this.parseCSVLine(combinedHeader);
            console.log('Parsed headers:', headers);
            
            const operations = [];
            const errors = [];

            // Start parsing from after the header
            for (let i = headerEndIndex + 1; i < lines.length; i++) {
                try {
                    const line = lines[i];
                    if (!line.trim()) continue; // Skip empty lines
                    
                    console.log(`Parsing line ${i + 1}:`, line);
                    
                    // Parse CSV line handling quoted values and commas within quotes
                    const values = this.parseCSVLine(line);
                    console.log(`Parsed values for line ${i + 1}:`, values);
                    
                    if (values.length < 2) {
                        errors.push({
                            lineNumber: i + 1,
                            line: line,
                            error: `Insufficient data: found ${values.length} fields, expected at least 2`,
                            values: values,
                            suggestion: 'Check that the line has property name and access code separated by commas'
                        });
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
                        importedAt: new Date(),
                        originalLine: line // Keep original for debugging
                    };

                    // Clean up data
                    operation.accessCode = this.cleanAccessCode(operation.accessCode);
                    operation.heating = this.standardizeHeating(operation.heating);
                    operation.smartTV = this.standardizeSmartTV(operation.smartTV);
                    operation.dronePhotos = this.standardizeDronePhotos(operation.dronePhotos);
                    operation.wifiSpeed = this.parseWifiSpeed(operation.wifiSpeed);

                    if (operation.propertyName) {
                        operations.push(operation);
                    } else {
                        errors.push({
                            lineNumber: i + 1,
                            line: line,
                            error: 'Property name is empty',
                            values: values,
                            suggestion: 'Make sure the first field contains the property name'
                        });
                    }
                } catch (error) {
                    errors.push({
                        lineNumber: i + 1,
                        line: lines[i],
                        error: `Parsing error: ${error.message}`,
                        values: [],
                        suggestion: 'Check for malformed quotes or special characters'
                    });
                }
            }

            console.log(`Parsed ${operations.length} operations with ${errors.length} errors`);
            return { operations, errors };
        } catch (error) {
            return { 
                operations: [], 
                errors: [{ 
                    lineNumber: 0, 
                    line: '', 
                    error: `Failed to parse CSV: ${error.message}`,
                    values: [],
                    suggestion: 'Check that the file is a valid CSV format'
                }] 
            };
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
        
        // Show save buttons and status section when data is loaded
        if (operations.length > 0) {
            const saveBtn = document.getElementById('save-operations-btn');
            const linkBtn = document.getElementById('link-to-properties-btn');
            const statusSection = document.getElementById('operations-status-section');
            
            if (saveBtn) saveBtn.classList.remove('hidden');
            if (linkBtn) linkBtn.classList.remove('hidden');
            if (statusSection) statusSection.classList.remove('hidden');
            
            this.updateDataStatus('Session data loaded - not yet saved');
        }
    }

    updateDataStatus(status) {
        const statusText = document.getElementById('data-status-text');
        if (statusText) {
            statusText.textContent = status;
        }
    }

    async saveOperationsToDatabase() {
        if (!this.db || this.operationsData.length === 0) {
            showToast('No data to save or database not available', 'error');
            return;
        }

        try {
            const saveBtn = document.getElementById('save-operations-btn');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }

            // Save to Firebase operations collection
            console.log(`💾 [FIRESTORE READ] Starting to save ${this.operationsData.length} operations...`);
            const operationsRef = collection(this.db, "operations");
            
            let savedCount = 0;
            let totalQueryReads = 0;
            
            for (const operation of this.operationsData) {
                try {
                    // Check if this operation already exists
                    console.log(`🔍 [FIRESTORE READ] Querying for existing operation: ${operation.propertyName}`);
                    const existingQuery = await getDocs(query(
                        operationsRef, 
                        where("propertyName", "==", operation.propertyName),
                        where("userId", "==", this.userId)
                    ));
                    totalQueryReads += existingQuery.docs.length || 1;
                    console.log(`📊 [FIRESTORE READ] Query result: ${existingQuery.docs.length} docs (${totalQueryReads} total reads so far)`);

                    if (existingQuery.empty) {
                        // Save new operation
                        await addDoc(operationsRef, {
                            ...operation,
                            userId: this.userId,
                            savedAt: new Date(),
                            version: 1
                        });
                        savedCount++;
                    } else {
                        // Update existing operation
                        const docRef = existingQuery.docs[0].ref;
                        await updateDoc(docRef, {
                            ...operation,
                            userId: this.userId,
                            savedAt: new Date(),
                            version: (existingQuery.docs[0].data().version || 0) + 1
                        });
                        savedCount++;
                    }
                } catch (error) {
                    console.error(`Failed to save operation for ${operation.propertyName}:`, error);
                }
            }
            
            console.log(`💾 [FIRESTORE READ] Operations save completed - Total reads: ${totalQueryReads}`);

            this.updateDataStatus(`Saved to database (${savedCount} properties)`);
            
            // Update last saved time
            const lastSavedInfo = document.getElementById('last-saved-info');
            const lastSavedTime = document.getElementById('last-saved-time');
            if (lastSavedInfo && lastSavedTime) {
                lastSavedInfo.classList.remove('hidden');
                lastSavedTime.textContent = new Date().toLocaleString();
            }

            showToast(`Successfully saved ${savedCount} operational records!`);

        } catch (error) {
            console.error('Error saving operations:', error);
            showToast('Failed to save operational data', 'error');
            this.updateDataStatus('Save failed - still session data only');
        } finally {
            const saveBtn = document.getElementById('save-operations-btn');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `
                    <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Save to Database
                `;
            }
        }
    }

    async linkToProperties() {
        if (!this.operationsData.length) {
            showToast('No operational data to link', 'error');
            return;
        }

        try {
            const linkBtn = document.getElementById('link-to-properties-btn');
            if (linkBtn) {
                linkBtn.disabled = true;
                linkBtn.textContent = 'Linking...';
            }

            console.log(`💾 Processing ${this.operationsData.length} operations for property matching...`);
            
            // Get all properties from the shared collection
            console.log(`📋 [FIRESTORE READ] Reading all properties for operations matching...`);
            const propertiesRef = collection(this.db, "properties");
            const propertiesSnap = await getDocs(propertiesRef);
            const propertiesReadCount = propertiesSnap.docs.length || 1;
            console.log(`📋 [FIRESTORE READ] Properties query returned ${propertiesReadCount} reads`);
            
            const properties = propertiesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            let linkedCount = 0;
            const linkResults = [];

            for (const operation of this.operationsData) {
                // Try to find matching property by name (fuzzy matching)
                const matchedProperty = properties.find(prop => 
                    this.fuzzyMatch(prop.name, operation.propertyName)
                );

                if (matchedProperty) {
                    try {
                        // Update the property with operational data
                        const propertyRef = doc(this.db, "properties", matchedProperty.id);
                        await updateDoc(propertyRef, {
                            // Add operational fields
                            accessCode: operation.accessCode,
                            operationalFloor: operation.floor,
                            operationalParking: operation.parkingSpot,
                            operationalHeating: operation.heating,
                            operationalSmartTV: operation.smartTV,
                            operationalDronePhotos: operation.dronePhotos,
                            operationalWifiAirbnb: operation.wifiAirbnb,
                            operationalWifiSpeed: operation.wifiSpeed,
                            operationsLinkedAt: new Date(),
                            operationsSource: 'csv_import'
                        });

                        linkedCount++;
                        linkResults.push({
                            operationName: operation.propertyName,
                            propertyName: matchedProperty.name,
                            status: 'linked'
                        });
                    } catch (error) {
                        console.error(`Failed to link ${operation.propertyName}:`, error);
                        linkResults.push({
                            operationName: operation.propertyName,
                            propertyName: matchedProperty.name,
                            status: 'error'
                        });
                    }
                } else {
                    linkResults.push({
                        operationName: operation.propertyName,
                        propertyName: 'No match found',
                        status: 'unmatched'
                    });
                }
            }

            // Show results
            this.showLinkingResults(linkResults, linkedCount);

        } catch (error) {
            console.error('Error linking to properties:', error);
            showToast('Failed to link to properties', 'error');
        } finally {
            const linkBtn = document.getElementById('link-to-properties-btn');
            if (linkBtn) {
                linkBtn.disabled = false;
                linkBtn.innerHTML = `
                    <svg class="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Link to Properties
                `;
            }
        }
    }

    fuzzyMatch(str1, str2) {
        if (!str1 || !str2) return false;
        
        const normalize = (str) => str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const normalized1 = normalize(str1);
        const normalized2 = normalize(str2);
        
        // Exact match
        if (normalized1 === normalized2) return true;
        
        // Contains match
        if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) return true;
        
        // Similarity threshold (simple implementation)
        const similarity = this.calculateSimilarity(normalized1, normalized2);
        return similarity > 0.8;
    }

    calculateSimilarity(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = Array(str2.length + 1).fill().map(() => Array(str1.length + 1).fill(0));
        
        for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
        for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
        
        for (let j = 1; j <= str2.length; j++) {
            for (let i = 1; i <= str1.length; i++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[j][i] = Math.min(
                    matrix[j][i - 1] + 1,
                    matrix[j - 1][i] + 1,
                    matrix[j - 1][i - 1] + cost
                );
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    showLinkingResults(results, linkedCount) {
        const modal = this.createResultsModal(results, linkedCount);
        document.body.appendChild(modal);
        modal.classList.remove('hidden');
    }

    createResultsModal(results, linkedCount) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full flex items-center justify-center z-50 p-4';
        
        modal.innerHTML = `
            <div class="relative w-full max-w-2xl shadow-lg rounded-xl bg-white modal-content">
                <div class="p-5 border-b flex justify-between items-center">
                    <h3 class="text-xl font-medium text-gray-900">Property Linking Results</h3>
                    <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div class="p-5 max-h-96 overflow-y-auto">
                    <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded">
                        <div class="font-medium text-green-800">✅ Successfully linked ${linkedCount} properties</div>
                    </div>
                    <div class="space-y-2">
                        ${results.map(result => `
                            <div class="flex items-center justify-between p-2 rounded border ${
                                result.status === 'linked' ? 'bg-green-50 border-green-200' :
                                result.status === 'error' ? 'bg-red-50 border-red-200' :
                                'bg-yellow-50 border-yellow-200'
                            }">
                                <div class="flex-1">
                                    <div class="font-medium">${result.operationName}</div>
                                    <div class="text-sm text-gray-600">${result.propertyName}</div>
                                </div>
                                <div class="text-sm font-medium ${
                                    result.status === 'linked' ? 'text-green-600' :
                                    result.status === 'error' ? 'text-red-600' :
                                    'text-yellow-600'
                                }">
                                    ${result.status === 'linked' ? '✅ Linked' :
                                      result.status === 'error' ? '❌ Error' :
                                      '⚠️ No match'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="p-5 border-t flex justify-end">
                    <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
                        Close
                    </button>
                </div>
            </div>
        `;
        
        return modal;
    }

    renderOperations() {
        console.log(`🎨 Rendering operations: ${this.operationsData.length} total, ${this.filteredData.length} filtered`);
        
        // Apply filtering and sorting
        this.applyFilters();
        
        const operationsGrid = document.getElementById('operations-grid');
        const operationsTable = document.getElementById('operations-table');
        const noOperationsMessage = document.getElementById('no-operations-message');
        const operationsCountElement = document.getElementById('operations-count');
        
        console.log(`🎨 DOM elements found: grid=${!!operationsGrid}, table=${!!operationsTable}, message=${!!noOperationsMessage}`);

        // Update count
        if (operationsCountElement) {
            operationsCountElement.textContent = this.filteredData.length;
        }

        if (this.operationsData.length === 0) {
            console.log("⚠️ No operations found - showing no operations message");
            operationsGrid?.classList.add('hidden');
            operationsTable?.classList.add('hidden');
            noOperationsMessage?.classList.remove('hidden');
            
            // Hide save buttons and status when no data
            const saveBtn = document.getElementById('save-operations-btn');
            const linkBtn = document.getElementById('link-to-properties-btn');
            const statusSection = document.getElementById('operations-status-section');
            
            if (saveBtn) saveBtn.classList.add('hidden');
            if (linkBtn) linkBtn.classList.add('hidden');
            if (statusSection) statusSection.classList.add('hidden');
            
            return;
        }

        if (this.filteredData.length === 0) {
            console.log("⚠️ No filtered operations found - showing filtered message");
            operationsGrid?.classList.add('hidden');
            operationsTable?.classList.add('hidden');
            noOperationsMessage?.classList.remove('hidden');
            noOperationsMessage.innerHTML = `
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p class="text-lg">No properties match your filters</p>
                <p class="text-sm">Try adjusting your search or filter criteria</p>
            `;
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

        // Save operations button
        const saveOperationsBtn = document.getElementById('save-operations-btn');
        if (saveOperationsBtn) {
            saveOperationsBtn.addEventListener('click', () => {
                this.saveOperationsToDatabase();
            });
        }

        // Link to properties button
        const linkToPropertiesBtn = document.getElementById('link-to-properties-btn');
        if (linkToPropertiesBtn) {
            linkToPropertiesBtn.addEventListener('click', () => {
                this.linkToProperties();
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
                let errorHtml = '<div class="text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2">';
                errorHtml += '<h4 class="font-medium mb-2">Parsing Issues Found:</h4>';
                
                // Show first 5 errors in detail
                const errorsToShow = errors.slice(0, 5);
                errorsToShow.forEach(err => {
                    errorHtml += `<div class="mb-2 p-2 bg-white rounded border-l-4 border-yellow-400">`;
                    errorHtml += `<div class="font-medium">Line ${err.lineNumber}: ${err.error}</div>`;
                    if (err.values && err.values.length > 0) {
                        errorHtml += `<div class="text-sm">Found values: ${err.values.map(v => `"${v}"`).join(', ')}</div>`;
                    }
                    errorHtml += `<div class="text-sm italic">💡 ${err.suggestion}</div>`;
                    if (err.line) {
                        errorHtml += `<div class="text-xs text-gray-600 mt-1 font-mono bg-gray-100 p-1 rounded">${err.line.substring(0, 100)}${err.line.length > 100 ? '...' : ''}</div>`;
                    }
                    errorHtml += `</div>`;
                });
                
                if (errors.length > 5) {
                    errorHtml += `<div class="text-sm mt-2">... and ${errors.length - 5} more similar errors</div>`;
                }
                
                errorHtml += '</div>';
                errorElement.innerHTML = errorHtml;
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