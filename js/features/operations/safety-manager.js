import { collection, doc, addDoc, onSnapshot, deleteDoc, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class SafetyManager {
    constructor(db, propertiesManager) {
        this.db = db;
        this.propertiesManager = propertiesManager;
        this.properties = [];
        this.currentEditingItem = null;
        this.currentEditingType = null;
        
        // Sorting state
        this.extinguisherSortField = 'name';
        this.extinguisherSortDirection = 'asc';
        this.kitSortField = 'name';
        this.kitSortDirection = 'asc';
        
        this.initializeEventListeners();
    }

    async initialize() {
        console.log('🔥 [SAFETY MANAGER] Initializing SafetyManager...');
        
        // Load properties and render safety data
        await this.loadProperties();
        this.renderSafetyTables();
        
        // Listen for property changes to update safety data
        if (this.propertiesManager) {
            this.listenForPropertyChanges();
        }
    }

    async loadProperties() {
        try {
            if (this.propertiesManager && this.propertiesManager.properties) {
                this.properties = this.propertiesManager.properties;
            } else {
                // Fallback: load properties directly from database
                const propertiesRef = collection(this.db, "properties");
                const snapshot = await getDocs(propertiesRef);
                this.properties = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
            }
            console.log(`🏢 [SAFETY MANAGER] Loaded ${this.properties.length} properties`);
        } catch (error) {
            console.error('Error loading properties for safety manager:', error);
            this.properties = [];
        }
    }

    listenForPropertyChanges() {
        // Listen to property manager's property changes
        if (this.propertiesManager) {
            // Override the properties whenever they change
            const originalCallback = this.propertiesManager.onDataChangeCallback;
            this.propertiesManager.onDataChangeCallback = () => {
                this.properties = this.propertiesManager.properties;
                this.renderSafetyTables();
                if (originalCallback) originalCallback();
            };
        }
    }

    renderSafetyTables() {
        this.renderExtinguisherTable();
        this.renderKitTable();
    }

    renderExtinguisherTable() {
        const table = document.getElementById('extinguishersTable');
        const searchInput = document.getElementById('searchExtinguishers');
        if (!table || !searchInput) return;

        const filter = searchInput.value.toLowerCase();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const threeMonthsFromNow = new Date();
        threeMonthsFromNow.setMonth(today.getMonth() + 3);

        // Show ALL properties, filter by search term, and apply sorting
        const filteredData = this.properties
            .filter(property => {
                const propertyName = (property.name || property.propertyName || '').toLowerCase();
                const location = (property.fireExtinguisherLocation || '').toLowerCase();
                
                return propertyName.includes(filter) || location.includes(filter);
            })
            .sort(this.getSortFunction(this.extinguisherSortField, this.extinguisherSortDirection));

        table.innerHTML = '';
        if (filteredData.length === 0) {
            table.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No properties found matching your search.</td></tr>`;
            return;
        }

        filteredData.forEach(property => {
            const expDateStr = property.fireExtinguisherExpiration;
            let rowClass = 'bg-gray-50';
            let formattedDate = '';
            let hasData = false;

            if (expDateStr && expDateStr !== '-') {
                const expDate = new Date(expDateStr);
                if (!isNaN(expDate.getTime())) {
                    formattedDate = expDate.toLocaleDateString();
                    hasData = true;
                    if (expDate < today) rowClass = 'bg-red-200';
                    else if (expDate < threeMonthsFromNow) rowClass = 'bg-yellow-200';
                    else rowClass = 'bg-green-200';
                }
            }

            // If no safety data exists, show as gray/neutral
            if (!hasData && !property.fireExtinguisherLocation && !property.fireExtinguisherNotes) {
                rowClass = 'bg-gray-100';
                formattedDate = 'No data';
            }

            const tr = document.createElement('tr');
            tr.className = `${rowClass} transition-colors duration-200`;
            tr.innerHTML = `
                <td class="px-4 py-3 text-sm font-medium text-gray-900">${property.name || property.propertyName || ''}</td>
                <td class="px-4 py-3 text-sm">${formattedDate}</td>
                <td class="px-4 py-3 text-sm">${property.fireExtinguisherLocation || 'Not set'}</td>
                <td class="px-4 py-3 text-sm">${property.fireExtinguisherNotes || 'No notes'}</td>
                <td class="px-4 py-3 text-sm text-center space-x-2">
                    <button class="edit-btn text-blue-600 hover:text-blue-800 transition-colors" data-id="${property.id}" data-type="extinguisher">Edit</button>
                    ${hasData ? '<button class="delete-btn text-red-600 hover:text-red-800 transition-colors" data-id="' + property.id + '" data-type="extinguisher">Clear</button>' : ''}
                </td>
            `;
            table.appendChild(tr);
        });
    }

    renderKitTable() {
        const table = document.getElementById('kitsTable');
        const searchInput = document.getElementById('searchKits');
        if (!table || !searchInput) return;

        const filter = searchInput.value.toLowerCase();
        
        // Show ALL properties, filter by search term, and apply sorting
        const filteredData = this.properties
            .filter(property => {
                const propertyName = (property.name || property.propertyName || '').toLowerCase();
                
                return propertyName.includes(filter);
            })
            .sort(this.getSortFunction(this.kitSortField, this.kitSortDirection));

        table.innerHTML = '';
        if (filteredData.length === 0) {
            table.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No properties found matching your search.</td></tr>`;
            return;
        }
        
        filteredData.forEach(property => {
            const status = (property.firstAidStatus || '').toLowerCase().trim();
            let rowClass = 'bg-gray-50';
            let hasData = false;

            if (status) {
                hasData = true;
                if (status === 'complete' || status === 'completo') rowClass = 'bg-green-200';
                else rowClass = 'bg-yellow-200';
            } else if (property.firstAidLastChecked || property.firstAidNotes) {
                hasData = true;
                rowClass = 'bg-yellow-200';
            } else {
                // No data exists
                rowClass = 'bg-gray-100';
            }

            let formattedDate = '';
            if (property.firstAidLastChecked) {
                const checkDate = new Date(property.firstAidLastChecked);
                if (!isNaN(checkDate.getTime())) {
                    formattedDate = checkDate.toLocaleDateString();
                }
            }

            const tr = document.createElement('tr');
            tr.className = `${rowClass} transition-colors duration-200`;
            tr.innerHTML = `
                <td class="px-4 py-3 text-sm font-medium text-gray-900">${property.name || property.propertyName || ''}</td>
                <td class="px-4 py-3 text-sm">${property.firstAidStatus || 'No data'}</td>
                <td class="px-4 py-3 text-sm">${formattedDate || 'Not checked'}</td>
                <td class="px-4 py-3 text-sm">${property.firstAidNotes || 'No notes'}</td>
                <td class="px-4 py-3 text-sm text-center space-x-2">
                    <button class="edit-btn text-blue-600 hover:text-blue-800 transition-colors" data-id="${property.id}" data-type="kit">Edit</button>
                    ${hasData ? '<button class="delete-btn text-red-600 hover:text-red-800 transition-colors" data-id="' + property.id + '" data-type="kit">Clear</button>' : ''}
                </td>
            `;
            table.appendChild(tr);
        });
    }

    initializeEventListeners() {
        // Search functionality
        document.addEventListener('keyup', (e) => {
            if (e.target.id === 'searchExtinguishers') {
                this.renderExtinguisherTable();
            } else if (e.target.id === 'searchKits') {
                this.renderKitTable();
            }
        });

        // Edit and delete buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('edit-btn')) {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;
                this.openPropertyEditModal(id);
            } else if (e.target.classList.contains('delete-btn')) {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;
                this.showDeleteConfirmation(id, type);
            }
        });

        // Sorting functionality
        document.addEventListener('click', (e) => {
            const sortHeader = e.target.closest('[data-sort]');
            if (sortHeader) {
                const sortField = sortHeader.dataset.sort;
                const table = sortHeader.closest('table');
                
                if (table.querySelector('#extinguishersTable')) {
                    this.handleSort('extinguisher', sortField);
                } else if (table.querySelector('#kitsTable')) {
                    this.handleSort('kit', sortField);
                }
            }
        });

        // Modal event listeners
        document.addEventListener('click', (e) => {
            if (e.target.id === 'safetyModalClose' || e.target.id === 'safetyModalCancel') {
                this.hideModal();
            } else if (e.target.id === 'safetyConfirmCancel') {
                this.hideConfirmModal();
            } else if (e.target.id === 'safetyConfirmOk') {
                this.confirmDelete();
            }
        });

        // Form submission
        document.addEventListener('submit', (e) => {
            if (e.target.id === 'safetyForm') {
                e.preventDefault();
                this.handleFormSubmit();
            }
        });
    }



    openPropertyEditModal(propertyId) {
        // Find the property and navigate to property settings page
        const property = this.properties.find(p => p.id === propertyId);
        if (property && window.propertiesManager) {
            // Store the property data in sessionStorage for the settings page
            sessionStorage.setItem('currentProperty', JSON.stringify(property));
            
            // Navigate to property settings page
            window.location.href = `property-settings.html?propertyId=${propertyId}`;
        } else {
            console.error('Property not found or propertiesManager not available');
        }
    }



    async handleFormSubmit() {
        // This method is simplified since we're now using the property edit modal
        this.hideModal();
    }

    showDeleteConfirmation(id, type) {
        this.currentEditingItem = id;
        this.currentEditingType = type;
        
        const modal = document.getElementById('safetyConfirmModal');
        const message = document.getElementById('safetyConfirmMessage');
        
        message.textContent = `Are you sure you want to clear the ${type === 'extinguisher' ? 'fire extinguisher' : 'first aid kit'} data for this property?`;
        modal.classList.remove('hidden');
    }

    async confirmDelete() {
        if (!this.currentEditingItem || !this.currentEditingType) return;

        try {
            let updateData = {};
            
            if (this.currentEditingType === 'extinguisher') {
                updateData = {
                    fireExtinguisherExpiration: null,
                    fireExtinguisherLocation: null,
                    fireExtinguisherNotes: null
                };
            } else {
                updateData = {
                    firstAidStatus: null,
                    firstAidLastChecked: null,
                    firstAidNotes: null
                };
            }

            await this.propertiesManager.updateProperty(this.currentEditingItem, updateData);
            console.log(`🗑️ [SAFETY MANAGER] Cleared ${this.currentEditingType} data for property:`, this.currentEditingItem);
            this.hideConfirmModal();
            this.renderSafetyTables();
        } catch (error) {
            console.error('Error clearing safety data:', error);
            alert('Error clearing data. Please try again.');
        }
    }

    hideModal() {
        document.getElementById('safetyEntryModal').classList.add('hidden');
        this.currentEditingItem = null;
        this.currentEditingType = null;
    }

    hideConfirmModal() {
        document.getElementById('safetyConfirmModal').classList.add('hidden');
        this.currentEditingItem = null;
        this.currentEditingType = null;
    }

    handleSort(type, field) {
        if (type === 'extinguisher') {
            if (this.extinguisherSortField === field) {
                this.extinguisherSortDirection = this.extinguisherSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.extinguisherSortField = field;
                this.extinguisherSortDirection = 'asc';
            }
            this.renderExtinguisherTable();
        } else if (type === 'kit') {
            if (this.kitSortField === field) {
                this.kitSortDirection = this.kitSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.kitSortField = field;
                this.kitSortDirection = 'asc';
            }
            this.renderKitTable();
        }
    }

    getSortFunction(field, direction) {
        return (a, b) => {
            let valueA, valueB;
            
            switch (field) {
                case 'name':
                    valueA = (a.name || a.propertyName || '').toLowerCase();
                    valueB = (b.name || b.propertyName || '').toLowerCase();
                    break;
                case 'expiration':
                    valueA = a.fireExtinguisherExpiration || '';
                    valueB = b.fireExtinguisherExpiration || '';
                    break;
                case 'location':
                    valueA = (a.fireExtinguisherLocation || '').toLowerCase();
                    valueB = (b.fireExtinguisherLocation || '').toLowerCase();
                    break;
                case 'notes':
                    valueA = (a.fireExtinguisherNotes || '').toLowerCase();
                    valueB = (b.fireExtinguisherNotes || '').toLowerCase();
                    break;
                case 'status':
                    valueA = (a.firstAidStatus || '').toLowerCase();
                    valueB = (b.firstAidStatus || '').toLowerCase();
                    break;
                case 'lastChecked':
                    valueA = a.firstAidLastChecked || '';
                    valueB = b.firstAidLastChecked || '';
                    break;
                default:
                    valueA = '';
                    valueB = '';
            }
            
            if (direction === 'asc') {
                return valueA.localeCompare(valueB);
            } else {
                return valueB.localeCompare(valueA);
            }
        };
    }

    cleanup() {
        // No cleanup needed since we're listening to property changes through PropertiesManager
    }
} 