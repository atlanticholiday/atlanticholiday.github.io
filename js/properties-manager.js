import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class PropertiesManager {
    constructor(db) {
        console.log(`📋 [INITIALIZATION] PropertiesManager constructor called`);
        this.db = db;
        this.properties = [];
        this.filteredProperties = [];
        this.unsubscribe = null;
        
        // Filter and sort state
        this.currentSort = 'name-asc';
        this.currentSearch = '';
        this.currentTypeFilter = '';
        this.currentBedroomsFilter = '';
        this.currentDataFilter = '';
        this.currentWifiSpeedFilter = '';
        this.currentEnergySourceFilter = '';
        this.currentView = 'cards'; // 'cards' or 'table'
        this.tableSortColumn = '';
        this.tableSortDirection = 'asc';
        
        // Initialize event listeners after DOM is loaded
        setTimeout(() => this.initializeEventListeners(), 100);
        
        // Start listening for property changes immediately
        console.log(`📋 [INITIALIZATION] Starting property listener from constructor`);
        this.listenForPropertyChanges();
    }

    getPropertiesCollectionRef() {
        return collection(this.db, "properties");
    }

    async addProperty(propertyData) {
        try {
            const docRef = await addDoc(this.getPropertiesCollectionRef(), {
                ...propertyData,
                createdAt: new Date(),
                updatedAt: new Date()
            });
            return docRef.id;
        } catch (error) {
            console.error('Error adding property:', error);
            throw error;
        }
    }

    async updateProperty(propertyId, updates) {
        try {
            const propertyRef = doc(this.db, "properties", propertyId);
            await updateDoc(propertyRef, {
                ...updates,
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating property:', error);
            throw error;
        }
    }

    async deleteProperty(propertyId) {
        try {
            const propertyRef = doc(this.db, "properties", propertyId);
            await deleteDoc(propertyRef);
        } catch (error) {
            console.error('Error deleting property:', error);
            throw error;
        }
    }

    listenForPropertyChanges() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        console.log("🔄 [FIRESTORE READ] Starting to listen for property changes in shared collection...");
        this.unsubscribe = onSnapshot(this.getPropertiesCollectionRef(), (snapshot) => {
            const readCount = snapshot.docs.length || 1;
            console.log(`📋 [FIRESTORE READ] Properties listener triggered - ${readCount} reads from shared collection`);
            console.log(`📋 [FIRESTORE READ] Properties snapshot metadata:`, {
                fromCache: snapshot.metadata.fromCache,
                hasPendingWrites: snapshot.metadata.hasPendingWrites,
                docChanges: snapshot.docChanges().length,
                isFirstLoad: snapshot.docChanges().every(change => change.type === 'added')
            });
            
            this.properties = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Log properties for debugging
            if (this.properties.length > 0) {
                console.log("📋 Properties loaded:", this.properties.map(p => `${p.name} (${p.location})`));
            } else {
                console.log("⚠️ No properties found in shared collection");
            }
            
            // Initialize filtered properties on first load
            if (this.filteredProperties.length === 0) {
                this.filteredProperties = [...this.properties];
            }
            this.renderProperties();
        }, (error) => {
            console.error("❌ Error listening for property changes:", error);
        });
    }

    stopListening() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
    }

    renderProperties() {
        console.log(`🎨 Rendering properties: ${this.properties.length} total, ${this.filteredProperties.length} filtered`);
        
        // Apply filtering and sorting
        this.applyFiltersAndSort();
        
        const propertiesGrid = document.getElementById('properties-grid');
        const propertiesTable = document.getElementById('properties-table');
        const noPropertiesMessage = document.getElementById('no-properties-message');
        const propertyCountElement = document.getElementById('property-count');
        const filteredCountElement = document.getElementById('filtered-count');
        
        console.log(`🎨 DOM elements found: grid=${!!propertiesGrid}, table=${!!propertiesTable}, message=${!!noPropertiesMessage}`);

        // Update property counts
        if (propertyCountElement) {
            propertyCountElement.textContent = this.properties.length;
        }
        if (filteredCountElement) {
            filteredCountElement.textContent = this.filteredProperties.length;
        }

        // Show/hide filters active indicator
        const filtersActiveIndicator = document.getElementById('filters-active-indicator');
        const hasActiveFilters = this.currentSearch || this.currentTypeFilter || this.currentBedroomsFilter || this.currentDataFilter || this.currentWifiSpeedFilter || this.currentEnergySourceFilter;
        if (filtersActiveIndicator) {
            if (hasActiveFilters) {
                filtersActiveIndicator.classList.remove('hidden');
            } else {
                filtersActiveIndicator.classList.add('hidden');
            }
        }

        if (this.properties.length === 0) {
            console.log("⚠️ No properties found - showing no properties message");
            propertiesGrid.classList.add('hidden');
            propertiesTable.classList.add('hidden');
            document.getElementById('properties-list')?.classList.add('hidden');
            noPropertiesMessage.classList.remove('hidden');
            return;
        }

        if (this.filteredProperties.length === 0) {
            console.log("⚠️ No filtered properties found - showing filtered message");
            propertiesGrid.classList.add('hidden');
            propertiesTable.classList.add('hidden');
            document.getElementById('properties-list')?.classList.add('hidden');
            noPropertiesMessage.classList.remove('hidden');
            noPropertiesMessage.innerHTML = `
                <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <p class="text-lg">No properties match your filters</p>
                <p class="text-sm">Try adjusting your search or filter criteria</p>
            `;
            return;
        }

        noPropertiesMessage.classList.add('hidden');
        // Reset no properties message for when properties exist
        noPropertiesMessage.innerHTML = `
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m5 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a1 1 0 011-1h1a1 1 0 011 1v2m-4 0h4" />
            </svg>
            <p class="text-lg">No properties added yet</p>
            <p class="text-sm">Add your first property using the "Quick Add Property" button above</p>
        `;

        // Show the appropriate view
        if (this.currentView === 'table') {
            propertiesGrid.classList.add('hidden');
            document.getElementById('properties-list')?.classList.add('hidden');
            propertiesTable.classList.remove('hidden');
            this.renderTableView();
        } else if (this.currentView === 'list') {
            propertiesGrid.classList.add('hidden');
            propertiesTable.classList.add('hidden');
            const propertiesList = document.getElementById('properties-list');
            if (propertiesList) {
                propertiesList.classList.remove('hidden');
                this.renderListView();
            }
        } else if (this.currentView === 'map') {
            propertiesGrid.classList.add('hidden');
            propertiesTable.classList.add('hidden');
            document.getElementById('properties-list')?.classList.add('hidden');
            document.getElementById('properties-map-list')?.classList.remove('hidden');
            this.renderMapListView();
        } else {
            propertiesTable.classList.add('hidden');
            document.getElementById('properties-list')?.classList.add('hidden');
            document.getElementById('properties-map-list')?.classList.add('hidden');
            propertiesGrid.classList.remove('hidden');
            propertiesGrid.innerHTML = this.filteredProperties.map(property => this.createPropertyCard(property)).join('');
        }
    }

    createPropertyCard(property) {
        const displayType = property.typology || property.type;

        // Simplified property card: only name, location, typology, and date added
        return `
            <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow property-card">
                <div class="flex justify-between items-start mb-4">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 mb-1">${property.name}</h3>
                        <p class="text-sm text-gray-600 mb-2">${property.location}</p>
                        <span class="text-xs text-blue-600 uppercase px-3 py-1 bg-blue-50 rounded-full font-medium">${displayType}</span>
                    </div>
                    <div class="flex flex-col gap-2">
                        <button onclick="editProperty('${property.id}')" class="text-blue-600 hover:text-blue-800 text-sm" title="Edit Property">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                        <button onclick="deleteProperty('${property.id}')" class="text-red-600 hover:text-red-800 text-sm" title="Delete Property">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="pt-3 mt-4 border-t border-gray-100 text-xs text-gray-500">
                    Added ${new Date(property.createdAt?.toDate?.() || property.createdAt).toLocaleDateString()}
                </div>
            </div>
        `;
    }

    renderTableView() {
        const tableBody = document.getElementById('properties-table-body');
        
        // Apply table-specific sorting if set
        let tableData = [...this.filteredProperties];
        if (this.tableSortColumn) {
            tableData.sort((a, b) => this.compareTableColumns(a, b, this.tableSortColumn, this.tableSortDirection));
        }
        
        tableBody.innerHTML = tableData.map(property => {
            const displayType = property.typology || property.type;
            
            // Format values for table display
            const floor = property.floor || '-';
            const parking = property.parkingSpot 
                ? `${property.parkingSpot}${property.parkingFloor ? ` (${property.parkingFloor})` : ''}`
                : '-';
            
            const wifiSpeed = property.wifiSpeed 
                ? property.wifiSpeed.charAt(0).toUpperCase() + property.wifiSpeed.slice(1)
                : '-';
            
            const wifiAirbnb = property.wifiAirbnb === 'yes' 
                ? '✓' 
                : property.wifiAirbnb === 'featured' 
                ? '⭐' 
                : '-';
            
            const energy = property.energySource 
                ? property.energySource.charAt(0).toUpperCase() + property.energySource.slice(1)
                : '-';
            
            const smartTv = property.smartTv === 'yes' 
                ? '✓' 
                : property.smartTv === 'multiple' 
                ? '✓✓' 
                : '-';
            
            const status = property.status || 'available';
            const statusClass = {
                'available': 'text-green-600 bg-green-50',
                'occupied': 'text-blue-600 bg-blue-50',
                'maintenance': 'text-yellow-600 bg-yellow-50',
                'renovation': 'text-orange-600 bg-orange-50',
                'inactive': 'text-gray-600 bg-gray-50'
            }[status] || 'text-green-600 bg-green-50';
            
            // Check if property has missing information
            const hasMissingInfo = this.hasIncompleteData(property);
            const rowClass = hasMissingInfo ? 'bg-red-50' : '';
            
            return `
                <tr class="hover:bg-gray-50 transition-colors ${rowClass}">
                    <td class="px-4 py-3 border-b">
                        <div class="font-medium text-gray-900">${property.name}</div>
                        <div class="text-sm text-gray-500">${property.location}</div>
                        ${property.bathrooms ? `<div class="text-xs text-gray-400">${property.bathrooms} bath${property.bathrooms !== 1 ? 's' : ''}</div>` : ''}
                    </td>
                    <td class="px-4 py-3 border-b">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-blue-800 bg-blue-100">
                            ${displayType}
                        </span>
                        <div class="text-xs text-gray-500 mt-1">${property.rooms === 0 ? 'Studio' : `${property.rooms || 0} bed${(property.rooms || 0) !== 1 ? 's' : ''}`}</div>
                    </td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900">${floor}</td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900">${parking}</td>
                    <td class="px-4 py-3 border-b">
                        <div class="text-sm text-gray-900">${wifiSpeed}</div>
                        ${wifiAirbnb !== '-' ? `<div class="text-xs text-blue-600">Airbnb ${wifiAirbnb}</div>` : ''}
                    </td>
                    <td class="px-4 py-3 border-b text-sm text-gray-900">${energy}</td>
                    <td class="px-4 py-3 border-b text-sm text-center">${smartTv}</td>
                    <td class="px-4 py-3 border-b">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
                            ${status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                    </td>
                    <td class="px-4 py-3 border-b">
                        <div class="flex items-center gap-2">
                            <button onclick="editProperty('${property.id}')" class="text-blue-600 hover:text-blue-800 text-sm p-1" title="Edit Property">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button onclick="deleteProperty('${property.id}')" class="text-red-600 hover:text-red-800 text-sm p-1" title="Delete Property">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    renderListView() {
        const listContainer = document.getElementById('properties-list');
        
        // Apply table-specific sorting if set
        let listData = [...this.filteredProperties];
        if (this.tableSortColumn) {
            listData.sort((a, b) => this.compareTableColumns(a, b, this.tableSortColumn, this.tableSortDirection));
        }
        
        listContainer.innerHTML = listData.map(property => {
            const displayType = property.typology || property.type;
            
            // Status badge with appropriate colors
            const getStatusBadge = (status) => {
                const statusConfig = {
                    'available': { color: 'green', text: 'Available' },
                    'occupied': { color: 'blue', text: 'Occupied' },
                    'maintenance': { color: 'yellow', text: 'Maintenance' },
                    'renovation': { color: 'orange', text: 'Renovation' },
                    'inactive': { color: 'gray', text: 'Inactive' }
                };
                const config = statusConfig[status] || statusConfig['available'];
                return `<span class="text-xs text-${config.color}-600 px-2 py-1 bg-${config.color}-50 rounded-full font-medium">${config.text}</span>`;
            };

            // Format bedroom display
            const bedroomDisplay = property.rooms === 0 ? 'Studio' : `${property.rooms || 0} bed${(property.rooms || 0) !== 1 ? 's' : ''}`;
            
            // Format additional details
            const details = [];
            if (property.bathrooms) details.push(`${property.bathrooms} bath${property.bathrooms !== 1 ? 's' : ''}`);
            if (property.floor) details.push(`Floor: ${property.floor}`);
            if (property.parkingSpot) details.push(`Parking: ${property.parkingSpot}`);
            
            // Tech features
            const techFeatures = [];
            if (property.wifiSpeed) {
                const wifiLabels = {
                    'basic': 'Basic WiFi',
                    'standard': 'Standard WiFi',
                    'fast': 'Fast WiFi',
                    'very-fast': 'Very Fast WiFi',
                    'fiber': 'Fiber WiFi'
                };
                techFeatures.push(wifiLabels[property.wifiSpeed] || 'WiFi');
            }
            if (property.energySource) {
                const energyLabels = {
                    'electric': 'Electric',
                    'gas': 'Gas',
                    'mixed': 'Mixed Energy',
                    'solar': 'Solar',
                    'heat-pump': 'Heat Pump'
                };
                techFeatures.push(energyLabels[property.energySource]);
            }
            if (property.smartTv === 'yes') techFeatures.push('Smart TV');
            if (property.smartTv === 'multiple') techFeatures.push('Multiple TVs');
            
            // Check if property has missing information
            const hasMissingInfo = this.hasIncompleteData(property);
            const rowClass = hasMissingInfo ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200';
            
            return `
                <div class="border ${rowClass} rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div class="flex items-center justify-between">
                        <!-- Left: Main Property Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-3 mb-2">
                                <h3 class="text-lg font-semibold text-gray-900 truncate">${property.name}</h3>
                                <span class="text-xs text-blue-600 uppercase px-2 py-1 bg-blue-50 rounded-full font-medium flex-shrink-0">${displayType}</span>
                                ${getStatusBadge(property.status || 'available')}
                            </div>
                            
                            <div class="flex items-center gap-4 text-sm text-gray-600 mb-2">
                                <span class="flex items-center">
                                    <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    ${property.location}
                                </span>
                                
                                <span class="flex items-center">
                                    <svg class="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 15V9" />
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 15V9" />
                                    </svg>
                                    ${bedroomDisplay}
                                </span>
                                
                                ${details.length > 0 ? `<span class="text-gray-400">•</span><span>${details.join(' • ')}</span>` : ''}
                            </div>
                            
                            ${techFeatures.length > 0 ? `
                            <div class="flex flex-wrap gap-2">
                                ${techFeatures.map(feature => `<span class="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">${feature}</span>`).join('')}
                            </div>
                            ` : ''}
                        </div>
                        
                        <!-- Right: Actions -->
                        <div class="flex items-center gap-2 ml-4 flex-shrink-0">
                            <button onclick="editProperty('${property.id}')" class="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition-colors" title="Edit Property">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                            </button>
                            <button onclick="deleteProperty('${property.id}')" class="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition-colors" title="Delete Property">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                        Added ${new Date(property.createdAt?.toDate?.() || property.createdAt).toLocaleDateString()}
                    </div>
                </div>
            `;
        }).join('');
    }

    compareTableColumns(a, b, column, direction) {
        let valueA, valueB;
        
        switch (column) {
            case 'name':
                valueA = a.name?.toLowerCase() || '';
                valueB = b.name?.toLowerCase() || '';
                break;
            case 'type':
                valueA = (a.typology || a.type)?.toLowerCase() || '';
                valueB = (b.typology || b.type)?.toLowerCase() || '';
                break;
            case 'floor':
                valueA = a.floor?.toLowerCase() || 'zzz'; // Put empty values at end
                valueB = b.floor?.toLowerCase() || 'zzz';
                break;
            case 'parking':
                valueA = a.parkingSpot?.toLowerCase() || 'zzz';
                valueB = b.parkingSpot?.toLowerCase() || 'zzz';
                break;
            case 'wifi':
                const wifiOrder = { 'fiber': 5, 'very-fast': 4, 'fast': 3, 'standard': 2, 'basic': 1, '': 0 };
                valueA = wifiOrder[a.wifiSpeed] || 0;
                valueB = wifiOrder[b.wifiSpeed] || 0;
                return direction === 'asc' ? valueA - valueB : valueB - valueA;
            case 'energy':
                valueA = a.energySource?.toLowerCase() || 'zzz';
                valueB = b.energySource?.toLowerCase() || 'zzz';
                break;
            case 'smarttv':
                const tvOrder = { 'multiple': 2, 'yes': 1, 'no': 0 };
                valueA = tvOrder[a.smartTv] || 0;
                valueB = tvOrder[b.smartTv] || 0;
                return direction === 'asc' ? valueA - valueB : valueB - valueA;
            case 'status':
                valueA = a.status?.toLowerCase() || 'available';
                valueB = b.status?.toLowerCase() || 'available';
                break;
            default:
                return 0;
        }
        
        if (valueA < valueB) return direction === 'asc' ? -1 : 1;
        if (valueA > valueB) return direction === 'asc' ? 1 : -1;
        return 0;
    }

    hasIncompleteData(property) {
        // Check for missing essential operational data
        const requiredFields = [
            property.floor,
            property.wifiSpeed,
            property.energySource
        ];
        
        // Also check if parking info is partially missing
        const hasPartialParking = (property.parkingSpot && !property.parkingFloor) || 
                                 (!property.parkingSpot && property.parkingFloor);
        
        // Consider data incomplete if any required field is missing or parking info is partial
        return requiredFields.some(field => !field || field.trim() === '') || hasPartialParking;
    }

    updateTableSortIndicators() {
        // Reset all sort indicators
        const headers = document.querySelectorAll('[data-sort]');
        headers.forEach(header => {
            const svg = header.querySelector('svg');
            svg.className = 'w-4 h-4 text-gray-400';
            svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />';
        });
        
        // Set active sort indicator
        if (this.tableSortColumn) {
            const activeHeader = document.querySelector(`[data-sort="${this.tableSortColumn}"]`);
            if (activeHeader) {
                const svg = activeHeader.querySelector('svg');
                svg.className = 'w-4 h-4 text-brand';
                
                if (this.tableSortDirection === 'asc') {
                    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />';
                } else {
                    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />';
                }
            }
        }
    }

    clearForm() {
        document.getElementById('property-name').value = '';
        document.getElementById('property-location').value = '';
        document.getElementById('property-type').value = '';
        document.getElementById('property-rooms').value = '';
        
        // These fields might not exist in quick add form, so check before clearing
        const bathroomsField = document.getElementById('property-bathrooms');
        if (bathroomsField) bathroomsField.value = '';
        
        const floorField = document.getElementById('property-floor');
        if (floorField) floorField.value = '';
        
        const wifiSpeedField = document.getElementById('property-wifi-speed');
        if (wifiSpeedField) wifiSpeedField.value = '';
        
        const wifiAirbnbField = document.getElementById('property-wifi-airbnb');
        if (wifiAirbnbField) wifiAirbnbField.value = 'no';
        
        const parkingSpotField = document.getElementById('property-parking-spot');
        if (parkingSpotField) parkingSpotField.value = '';
        
        const parkingFloorField = document.getElementById('property-parking-floor');
        if (parkingFloorField) parkingFloorField.value = '';
        
        const energySourceField = document.getElementById('property-energy-source');
        if (energySourceField) energySourceField.value = '';
        
        const smartTvField = document.getElementById('property-smart-tv');
        if (smartTvField) smartTvField.value = 'no';
        
        document.getElementById('add-property-error').textContent = '';
    }

    validatePropertyData(data) {
        const errors = [];

        if (!data.name?.trim()) {
            errors.push('Property name is required');
        }
        if (!data.location?.trim()) {
            errors.push('Location is required');
        }
        if (!data.type) {
            errors.push('Property type is required');
        }
        
        // Validate property type
        const validTypes = ['apartment', 'villa', 'hotel', 'resort', 'aparthotel', 'guesthouse'];
        if (!validTypes.includes(data.type)) {
            errors.push(`Invalid property type "${data.type}". Must be one of: ${validTypes.join(', ')}`);
        }
        
        if (data.rooms && (data.rooms < 0 || data.rooms > 50)) {
            errors.push('Number of bedrooms must be between 0 and 50');
        }

        return errors;
    }

    getPropertyById(propertyId) {
        return this.properties.find(p => p.id === propertyId);
    }

    parseBulkPropertyData(inputText) {
        const lines = inputText.trim().split('\n').filter(line => line.trim());
        const properties = [];
        const errors = [];

        lines.forEach((line, index) => {
            const lineNumber = index + 1;
            const parts = line.split(',').map(part => part.trim());
            
            if (parts.length < 3) {
                errors.push({
                    lineNumber,
                    line: line,
                    error: 'Invalid format. Expected: Property Name, Location, Typology',
                    suggestion: 'Make sure you have exactly 3 parts separated by commas'
                });
                return;
            }

            const [name, location, typology, ...extra] = parts;
            
            // Parse Portuguese property typology (T1, T2, V1, V2, etc.)
            const typologyUpper = typology.toUpperCase();
            const typologyMatch = typologyUpper.match(/^([TV])(\d+)$/);
            
            if (!typologyMatch) {
                errors.push({
                    lineNumber,
                    line: line,
                    error: `Invalid typology "${typology}"`,
                    suggestion: 'Use format T0-T9 for apartments or V0-V9 for houses/villas'
                });
                return;
            }

            const [, typeCode, bedroomCount] = typologyMatch;
            const bedrooms = parseInt(bedroomCount);
            
            if (bedrooms < 0 || bedrooms > 9) {
                errors.push({
                    lineNumber,
                    line: line,
                    error: `Invalid bedroom count "${bedroomCount}"`,
                    suggestion: 'Use numbers 0-9 (T0, T1, T2... or V0, V1, V2...)'
                });
                return;
            }

            // Convert typology to property type and set bedroom count
            let propertyType, displayType;
            if (typeCode === 'T') {
                propertyType = 'apartment';
                displayType = `T${bedrooms}`;
            } else { // V
                propertyType = 'villa';
                displayType = `V${bedrooms}`;
            }

            const propertyData = {
                name: name,
                location: location,
                type: propertyType,
                typology: displayType, // Store the original typology
                rooms: bedrooms, // Set bedrooms from typology
                description: `${displayType} - ${bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`}` // Auto-generate description
            };

            // Validate the property data
            const validationErrors = this.validatePropertyData(propertyData);
            if (validationErrors.length > 0) {
                validationErrors.forEach(error => {
                    errors.push({
                        lineNumber,
                        line: line,
                        error: error,
                        suggestion: 'Check that the property name and location are not empty'
                    });
                });
                return;
            }

            properties.push(propertyData);
        });

        return { properties, errors };
    }

    async bulkAddProperties(properties, onProgress = () => {}) {
        const results = {
            successful: 0,
            failed: 0,
            errors: []
        };

        for (let i = 0; i < properties.length; i++) {
            try {
                await this.addProperty(properties[i]);
                results.successful++;
            } catch (error) {
                results.failed++;
                results.errors.push(`Failed to add "${properties[i].name}": ${error.message}`);
            }
            
            // Call progress callback
            onProgress({
                completed: i + 1,
                total: properties.length,
                percentage: Math.round(((i + 1) / properties.length) * 100)
            });
        }

        return results;
    }

    initializeEventListeners() {
        // Search input
        const searchInput = document.getElementById('property-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.currentSearch = e.target.value.toLowerCase().trim();
                
                // Add visual feedback for active search
                if (this.currentSearch) {
                    searchInput.classList.add('ring-2', 'ring-blue-500', 'border-blue-500');
                } else {
                    searchInput.classList.remove('ring-2', 'ring-blue-500', 'border-blue-500');
                }
                
                this.renderProperties();
            });
        }

        // Sort dropdown
        const sortSelect = document.getElementById('property-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.currentSort = e.target.value;
                this.renderProperties();
            });
        }

        // Type filter
        const typeFilter = document.getElementById('property-type-filter');
        if (typeFilter) {
            typeFilter.addEventListener('change', (e) => {
                this.currentTypeFilter = e.target.value;
                this.renderProperties();
            });
        }

        // Bedrooms filter
        const bedroomsFilter = document.getElementById('property-bedrooms-filter');
        if (bedroomsFilter) {
            bedroomsFilter.addEventListener('change', (e) => {
                this.currentBedroomsFilter = e.target.value;
                this.renderProperties();
            });
        }

        // Data completeness filter
        const dataFilter = document.getElementById('property-data-filter');
        if (dataFilter) {
            dataFilter.addEventListener('change', (e) => {
                this.currentDataFilter = e.target.value;
                this.renderProperties();
            });
        }

        // WiFi speed filter (in expanded filters section)
        const wifiSpeedFilter = document.getElementById('property-wifi-speed');
        if (wifiSpeedFilter) {
            wifiSpeedFilter.addEventListener('change', (e) => {
                this.currentWifiSpeedFilter = e.target.value;
                this.renderProperties();
            });
        }

        // Energy source filter (in expanded filters section)
        const energySourceFilter = document.getElementById('property-energy-source');
        if (energySourceFilter) {
            energySourceFilter.addEventListener('change', (e) => {
                this.currentEnergySourceFilter = e.target.value;
                this.renderProperties();
            });
        }

        // View toggle buttons
        const cardViewBtn = document.getElementById('card-view-btn');
        const listViewBtn = document.getElementById('list-view-btn');
        const tableViewBtn = document.getElementById('table-view-btn');
        const mapViewBtn = document.getElementById('map-view-btn');
        
        if (cardViewBtn) {
            cardViewBtn.addEventListener('click', () => {
                this.currentView = 'cards';
                cardViewBtn.classList.add('active');
                listViewBtn?.classList.remove('active');
                tableViewBtn?.classList.remove('active');
                this.renderProperties();
            });
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => {
                this.currentView = 'list';
                listViewBtn.classList.add('active');
                cardViewBtn?.classList.remove('active');
                tableViewBtn?.classList.remove('active');
                this.renderProperties();
            });
        }
        
        if (tableViewBtn) {
            tableViewBtn.addEventListener('click', () => {
                this.currentView = 'table';
                tableViewBtn.classList.add('active');
                cardViewBtn?.classList.remove('active');
                listViewBtn?.classList.remove('active');
                this.renderProperties();
                this.updateTableSortIndicators();
            });
        }
        if (mapViewBtn) {
            mapViewBtn.addEventListener('click', () => {
                this.currentView = 'map';
                mapViewBtn.classList.add('active');
                cardViewBtn?.classList.remove('active');
                listViewBtn?.classList.remove('active');
                tableViewBtn?.classList.remove('active');
                this.renderProperties();
            });
        }

        // Table column sorting
        const tableHeaders = document.querySelectorAll('[data-sort]');
        tableHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const sortColumn = header.dataset.sort;
                
                // Toggle sort direction if clicking the same column
                if (this.tableSortColumn === sortColumn) {
                    this.tableSortDirection = this.tableSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    this.tableSortColumn = sortColumn;
                    this.tableSortDirection = 'asc';
                }
                
                // Update visual indicators
                this.updateTableSortIndicators();
                
                // Re-render table if currently showing
                if (this.currentView === 'table') {
                    this.renderTableView();
                }
            });
        });

        // Clear filters button
        const clearFiltersBtn = document.getElementById('clear-filters-btn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }
    }

    applyFiltersAndSort() {
        // Start with all properties
        let filtered = [...this.properties];

        // Apply search filter
        if (this.currentSearch) {
            filtered = filtered.filter(property => 
                property.name.toLowerCase().includes(this.currentSearch) ||
                property.location.toLowerCase().includes(this.currentSearch) ||
                (property.description && property.description.toLowerCase().includes(this.currentSearch))
            );
        }

        // Apply type filter
        if (this.currentTypeFilter) {
            if (this.currentTypeFilter === 'apartment') {
                filtered = filtered.filter(property => property.type === 'apartment');
            } else if (this.currentTypeFilter === 'villa') {
                filtered = filtered.filter(property => property.type === 'villa');
            } else if (this.currentTypeFilter === 'other') {
                filtered = filtered.filter(property => 
                    property.type !== 'apartment' && property.type !== 'villa'
                );
            }
        }

        // Apply bedrooms filter
        if (this.currentBedroomsFilter) {
            if (this.currentBedroomsFilter === '5+') {
                filtered = filtered.filter(property => (property.rooms || 0) >= 5);
            } else {
                const bedroomCount = parseInt(this.currentBedroomsFilter);
                filtered = filtered.filter(property => (property.rooms || 0) === bedroomCount);
            }
        }

        // Apply data completeness filter
        if (this.currentDataFilter) {
            if (this.currentDataFilter === 'complete') {
                filtered = filtered.filter(property => !this.hasIncompleteData(property));
            } else if (this.currentDataFilter === 'missing') {
                filtered = filtered.filter(property => this.hasIncompleteData(property));
            }
        }

        // Apply WiFi speed filter
        if (this.currentWifiSpeedFilter) {
            filtered = filtered.filter(property => property.wifiSpeed === this.currentWifiSpeedFilter);
        }

        // Apply energy source filter
        if (this.currentEnergySourceFilter) {
            filtered = filtered.filter(property => property.energySource === this.currentEnergySourceFilter);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            switch (this.currentSort) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'location-asc':
                    return a.location.localeCompare(b.location);
                case 'location-desc':
                    return b.location.localeCompare(a.location);
                case 'typology-asc':
                    return this.compareTypology(a.typology || a.type, b.typology || b.type);
                case 'typology-desc':
                    return this.compareTypology(b.typology || b.type, a.typology || a.type);
                case 'rooms-asc':
                    return (a.rooms || 0) - (b.rooms || 0);
                case 'rooms-desc':
                    return (b.rooms || 0) - (a.rooms || 0);
                case 'date-newest':
                    return new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt);
                case 'date-oldest':
                    return new Date(a.createdAt?.toDate?.() || a.createdAt) - new Date(b.createdAt?.toDate?.() || b.createdAt);
                default:
                    return 0;
            }
        });

        this.filteredProperties = filtered;
    }

    compareTypology(a, b) {
        // Extract typology information for proper sorting
        const getTypologyOrder = (typology) => {
            if (!typology) return { prefix: 'z', number: 999 };
            
            const match = typology.toUpperCase().match(/^([TV])(\d+)$/);
            if (match) {
                return {
                    prefix: match[1], // T or V
                    number: parseInt(match[2])
                };
            }
            
            // For other property types, sort them after T and V
            return { prefix: 'z', number: 0 };
        };

        const orderA = getTypologyOrder(a);
        const orderB = getTypologyOrder(b);

        // First sort by prefix (T comes before V, both come before others)
        if (orderA.prefix !== orderB.prefix) {
            return orderA.prefix.localeCompare(orderB.prefix);
        }

        // Then sort by number
        return orderA.number - orderB.number;
    }

    clearAllFilters() {
        // Reset all filter values
        this.currentSearch = '';
        this.currentTypeFilter = '';
        this.currentBedroomsFilter = '';
        this.currentDataFilter = '';
        this.currentWifiSpeedFilter = '';
        this.currentEnergySourceFilter = '';
        
        // Reset form elements
        const searchInput = document.getElementById('property-search');
        if (searchInput) {
            searchInput.value = '';
            searchInput.classList.remove('ring-2', 'ring-blue-500', 'border-blue-500');
        }
        
        const typeFilter = document.getElementById('property-type-filter');
        if (typeFilter) typeFilter.value = '';
        
        const bedroomsFilter = document.getElementById('property-bedrooms-filter');
        if (bedroomsFilter) bedroomsFilter.value = '';
        
        const dataFilter = document.getElementById('property-data-filter');
        if (dataFilter) dataFilter.value = '';
        
        const wifiSpeedFilter = document.getElementById('property-wifi-speed');
        if (wifiSpeedFilter) wifiSpeedFilter.value = '';
        
        const energySourceFilter = document.getElementById('property-energy-source');
        if (energySourceFilter) energySourceFilter.value = '';
        
        // Re-render with cleared filters
        this.renderProperties();
    }

    // Render split List & Map view of properties
    renderMapListView() {
        const listPane = document.getElementById('properties-list-pane');
        const mapPane = document.getElementById('properties-map-pane');
        if (!listPane || !mapPane) return;
        // Populate list pane
        listPane.innerHTML = this.filteredProperties.map(property => `
            <div class="p-4 border-b cursor-pointer property-list-item" data-id="${property.id}">
                <div class="flex items-center mb-1">
                    ${property.latitude && property.longitude ? `<span class="text-blue-600 mr-2" title="Pinned on map">📍</span>` : ``}
                    <h4 class="font-semibold text-gray-900">${property.name}</h4>
                </div>
                <p class="text-sm text-gray-600">${property.location}</p>
                <p class="text-xs text-gray-500">${property.typology || property.type}</p>
                <p class="text-xs text-gray-400">Added ${new Date(property.createdAt?.toDate?.() || property.createdAt).toLocaleDateString()}</p>
            </div>
        `).join('');
        // Initialize map on first load
        if (!this.map) {
            this.map = L.map('properties-map-pane').setView([0, 0], 2);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(this.map);
        }
        // Clear existing markers
        if (this.mapMarkers) {
            this.mapMarkers.forEach(m => this.map.removeLayer(m));
        }
        this.mapMarkers = [];
        const bounds = [];
        this.filteredProperties.forEach(property => {
            if (property.latitude && property.longitude) {
                const marker = L.marker([property.latitude, property.longitude]).addTo(this.map);
                marker.bindPopup(`<strong>${property.name}</strong><br/>${property.location}`);
                this.mapMarkers.push(marker);
                bounds.push([property.latitude, property.longitude]);
            }
        });
        // Adjust map view to fit markers
        if (bounds.length) {
            this.map.fitBounds(bounds, { padding: [50, 50] });
        }
        // Center map on list item click
        document.querySelectorAll('.property-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.dataset.id;
                const prop = this.filteredProperties.find(p => p.id === id);
                if (prop && prop.latitude && prop.longitude) {
                    this.map.setView([prop.latitude, prop.longitude], 12);
                }
            });
        });
    }
} 