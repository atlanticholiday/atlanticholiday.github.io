const InventoryManager = {
    // State
    beds: [],
    csvData: null,
    csvPath: 'assets/AL Essencials List - ENG - BASE.csv',

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadCSV(); // Attempt auto-load
        this.renderBedList();
    },

    cacheDOM() {
        this.dom = {
            // ... existing cached elements
            bedList: document.getElementById('bed-list'),
            // Re-caching to ensure I don't lose them if I didn't merge properly, but usually I just add to this.dom
            // Let's keep it clean
            addBedBtn: document.getElementById('add-bed-btn'),
            bedTypeSelect: document.getElementById('bed-type-select'),
            generateBtn: document.getElementById('generate-btn'),
            resultsContainer: document.getElementById('results-container'),
            resultsPlaceholder: document.getElementById('results-placeholder'),
            tableBody: document.getElementById('inventory-table-body'),
            csvWarning: document.getElementById('csv-warning'),
            csvUpload: document.getElementById('csv-upload'),
            inputs: {
                listName: document.getElementById('list-name'),
                guests: document.getElementById('guest-capacity'),
                bathrooms: document.getElementById('num-bathrooms')
            },
            exportBtn: document.getElementById('export-btn'),
            saveBtn: document.getElementById('save-list-btn'),
            summaryText: document.getElementById('summary-text'),

            // New Modal Elements
            savedListsModal: document.getElementById('saved-lists-modal'),
            savedListsContainer: document.getElementById('saved-lists-container'),
            closeSavedListsBtn: document.getElementById('close-saved-lists-btn'),
            loadSavedBtn: document.getElementById('load-saved-btn')
        };
    },

    bindEvents() {
        this.dom.addBedBtn.addEventListener('click', () => this.addBed());
        this.dom.generateBtn.addEventListener('click', () => this.generateList());
        this.dom.csvUpload.addEventListener('change', (e) => this.handleFileUpload(e));
        this.dom.exportBtn.addEventListener('click', () => this.exportToExcel());
        this.dom.saveBtn.addEventListener('click', () => this.saveList());

        // Modal Events
        this.dom.loadSavedBtn.addEventListener('click', () => this.openSavedLists());
        this.dom.closeSavedListsBtn.addEventListener('click', () => this.closeSavedLists());
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.savedListsModal) {
                this.closeSavedLists();
            }
        });
    },

    loadCSV() {
        // Try to fetch from assets first
        Papa.parse(this.csvPath, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                console.log("CSV Loaded via Path", results);
                if (results.data && results.data.length > 0) {
                    this.csvData = results.data;
                    this.dom.csvWarning.classList.add('hidden');
                } else {
                    this.showCSVWarning();
                }
            },
            error: (err) => {
                console.warn("Auto-load failed, waiting for upload", err);
                this.showCSVWarning();
            }
        });
    },

    showCSVWarning() {
        this.dom.csvWarning.classList.remove('hidden');
    },

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                console.log("CSV Loaded via Upload", results);
                this.csvData = results.data;
                this.dom.csvWarning.classList.add('hidden');
                alert("Configuration loaded successfully!");
            }
        });
    },

    addBed() {
        const type = this.dom.bedTypeSelect.value;
        const id = Date.now();
        this.beds.push({ id, type });
        this.renderBedList();
    },

    removeBed(id) {
        this.beds = this.beds.filter(b => b.id !== id);
        this.renderBedList();
    },

    renderBedList() {
        this.dom.bedList.innerHTML = '';
        if (this.beds.length === 0) {
            this.dom.bedList.innerHTML = '<div class="text-sm text-gray-500 text-center py-2 italic">No beds added yet.</div>';
            return;
        }

        this.beds.forEach(bed => {
            const div = document.createElement('div');
            div.className = 'flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-200';
            div.innerHTML = `
                <span class="text-sm font-medium text-gray-700">${bed.type}</span>
                <button class="text-red-500 hover:text-red-700 text-sm px-2" onclick="InventoryManager.removeBed(${bed.id})">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            this.dom.bedList.appendChild(div);
        });
    },

    generateList() {
        // Debugging: Re-fetch elements directly to ensure no caching issues
        const guestInput = document.getElementById('guest-capacity');
        const bathInput = document.getElementById('num-bathrooms');
        const guestVal = guestInput ? guestInput.value : 'null';
        const bathVal = bathInput ? bathInput.value : 'null';

        console.log("Direct Read - Guest:", guestVal, "Bath:", bathVal, "Beds:", this.beds.length);

        if (!this.csvData) {
            alert("Please upload the Configuration CSV first.");
            return;
        }

        const inputs = {
            guests: parseInt(guestVal) || 0,
            bathrooms: parseInt(bathVal) || 0,
            beds: this.beds // Access current state
        };

        // Temporary Debug Alert
        // alert(`Debug: Guests=${inputs.guests} (Raw: ${guestVal}), Beds=${inputs.beds.length}`);

        const inventory = this.calculateInventory(inputs);
        this.renderResults(inventory, inputs);
    },

    calculateInventory(inputs) {
        // Logic: Iterate over CSV rows.
        // Columns might be: "Item", "Category", "Base", "PerGuest", "PerBed_Single", "PerBed_Double", etc.
        // We need to guess the headers or make them dynamic.
        // Assumption based on "Ratios":
        // Quantity = Base + (PerGuest * guests) + (PerBath * baths) + sum(PerBedType * countBedType)

        // Helper to get float from row
        const getVal = (row, key) => {
            if (!row[key]) return 0;
            const val = parseFloat(row[key].replace(',', '.')); // Handle commas
            return isNaN(val) ? 0 : val;
        };

        return this.csvData.map(row => {
            let qty = 0;

            // 1. Base Quantity (e.g. "BaseQty" or just "Quantity" if static)
            // We look for columns like: "Base", "Per House", "Fixed"
            // Let's look for known keywords in keys
            const keys = Object.keys(row);

            // Base
            const baseKey = keys.find(k => /base|fixed|per house/i.test(k));
            if (baseKey) qty += getVal(row, baseKey);

            // Per Guest
            const guestKey = keys.find(k => /guest|pax/i.test(k));
            if (guestKey) qty += getVal(row, guestKey) * inputs.guests;

            // Per Bathroom
            const bathKey = keys.find(k => /bath|wc/i.test(k));
            if (bathKey) qty += getVal(row, bathKey) * inputs.bathrooms;

            // Per Bed Type
            // Check for columns specific to bed types found in our inputs
            // We need to standardize our Bed Type Select values to CSV headers or vice versa.
            // CSV might have: "Single Bed", "Double Bed" columns.
            inputs.beds.forEach(bed => {
                // Try to find a column that matches the bed type
                // e.g. bed.type = "Single" -> look for "Single" in header
                const bedKey = keys.find(k => k.toLowerCase().includes(bed.type.toLowerCase()));
                if (bedKey) {
                    qty += getVal(row, bedKey);
                }
            });

            // Round up? specific logic? usually ceil.
            qty = Math.ceil(qty);

            return {
                item: row['Item'] || row['Name'] || row['Description'] || 'Unknown Item',
                category: row['Category'] || row['Type'] || 'General',
                qty: qty
            };
        }).filter(i => i.qty > 0); // Only keep items with > 0 quantity
    },

    renderResults(inventory, inputs) {
        this.currentInventory = inventory; // Save for export
        this.dom.resultsPlaceholder.classList.add('hidden');
        this.dom.resultsContainer.classList.remove('hidden');
        this.dom.actionButtons.classList.remove('hidden'); // Show save/export buttons
        this.dom.saveBtn.classList.remove('hidden');
        this.dom.exportBtn.classList.remove('hidden');

        this.dom.summaryText.innerText = `${inputs.guests} Guests, ${inputs.beds.length} Beds, ${inputs.bathrooms} Bathrooms`;

        this.dom.tableBody.innerHTML = '';
        inventory.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${row.item}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${row.category}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-bold text-center bg-gray-50">${row.qty}</td>
            `;
            this.dom.tableBody.appendChild(tr);
        });
    },

    exportToExcel() {
        if (!this.currentInventory || this.currentInventory.length === 0) return;

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(this.currentInventory);
        XLSX.utils.book_append_sheet(wb, ws, "Essentials List");

        const listName = this.dom.inputs.listName.value || "Inventory";
        XLSX.writeFile(wb, `${listName}.xlsx`);
    },

    saveList() {
        const listName = this.dom.inputs.listName.value;
        if (!listName) {
            alert("Please enter a List Name to save.");
            return;
        }

        const data = {
            id: Date.now().toString(),
            name: listName,
            date: new Date().toISOString(),
            inputs: {
                guests: this.dom.inputs.guests.value,
                bathrooms: this.dom.inputs.bathrooms.value,
                beds: this.beds
            },
            inventory: this.currentInventory
        };

        // Uses standard localStorage for now, can move to DataManager if needed
        let savedLists = JSON.parse(localStorage.getItem('inventory_lists') || '[]');
        savedLists.push(data);
        localStorage.setItem('inventory_lists', JSON.stringify(savedLists));

        alert("List saved successfully!");
    },

    openSavedLists() {
        const savedLists = JSON.parse(localStorage.getItem('inventory_lists') || '[]');
        this.dom.savedListsContainer.innerHTML = '';

        if (savedLists.length === 0) {
            this.dom.savedListsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No saved lists found.</p>';
        } else {
            // Sort by date new to old
            savedLists.sort((a, b) => new Date(b.date) - new Date(a.date));

            savedLists.forEach(list => {
                const el = document.createElement('div');
                el.className = "flex justify-between items-center p-3 hover:bg-gray-50 border rounded-md cursor-pointer transition-colors";
                // Format Date
                const dateStr = new Date(list.date).toLocaleDateString() + ' ' + new Date(list.date).toLocaleTimeString();

                el.innerHTML = `
                    <div onclick="InventoryManager.loadList('${list.id}')" class="flex-1">
                        <h4 class="font-medium text-gray-800">${list.name}</h4>
                        <p class="text-xs text-gray-500">${dateStr} • ${list.inputs.guests} Guests, ${list.inputs.beds.length} Beds</p>
                    </div>
                    <button class="text-red-400 hover:text-red-600 p-2" onclick="InventoryManager.deleteList('${list.id}', event)">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                this.dom.savedListsContainer.appendChild(el);
            });
        }

        this.dom.savedListsModal.classList.remove('hidden');
    },

    closeSavedLists() {
        this.dom.savedListsModal.classList.add('hidden');
    },

    deleteList(id, event) {
        if (event) event.stopPropagation();
        if (!confirm("Are you sure you want to delete this list?")) return;

        let savedLists = JSON.parse(localStorage.getItem('inventory_lists') || '[]');
        savedLists = savedLists.filter(l => l.id !== id);
        localStorage.setItem('inventory_lists', JSON.stringify(savedLists));
        this.openSavedLists(); // Refresh
    },

    loadList(id) {
        const savedLists = JSON.parse(localStorage.getItem('inventory_lists') || '[]');
        const list = savedLists.find(l => l.id === id);
        if (!list) return;

        // Restore Inputs
        this.dom.inputs.listName.value = list.name;
        this.dom.inputs.guests.value = list.inputs.guests;
        this.dom.inputs.bathrooms.value = list.inputs.bathrooms;

        // Restore Beds
        this.beds = list.inputs.beds || [];
        this.renderBedList();

        // Restore Inventory Results if CSV is present, otherwise just inputs
        // It's better to re-calculate if we have the CSV, but if we saved the result, we can show it.
        // But for consistency and editing, let's just restore inputs and if CSV is loaded, User can click Generate.
        // OR we can display the saved result directly.

        if (list.inventory && list.inventory.length > 0) {
            this.renderResults(list.inventory, list.inputs);
        } else if (this.csvData) {
            // Auto-generate if we have logic
            this.generateList();
        }

        this.closeSavedLists();
    }
};
