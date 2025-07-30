import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, deleteDoc, setLogLevel, getDoc, setDoc, updateDoc, deleteField, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { Config } from './config.js';
import { DataManager } from './data-manager.js';
import { UIManager } from './ui-manager.js';
import { PDFGenerator } from './pdf-generator.js';
import { HolidayCalculator } from './holiday-calculator.js';
import { EventManager } from './event-manager.js';
import { NavigationManager } from './navigation-manager.js';
import { PropertiesManager } from './properties-manager.js';
import { OperationsManager } from './operations-manager.js';

// --- GLOBAL VARIABLES & CONFIG ---
let db, auth, userId;
let unsubscribe = null;

// Initialize managers
let dataManager, uiManager, pdfGenerator, holidayCalculator, eventManager, navigationManager, propertiesManager, operationsManager;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = initializeApp(Config.firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        setLogLevel('error');
        
        // Initialize managers
        dataManager = new DataManager(db);
        holidayCalculator = new HolidayCalculator();
        pdfGenerator = new PDFGenerator();
        uiManager = new UIManager(dataManager, holidayCalculator, pdfGenerator);
        eventManager = new EventManager(auth, dataManager, uiManager);
        navigationManager = new NavigationManager();

        // Setup login event listeners immediately
        eventManager.setupLoginListeners();
        
        // Setup navigation listeners
        navigationManager.setupNavigationListeners();
        
        // Setup global event listeners
        setupGlobalEventListeners();

        // Setup authentication listener
        onAuthStateChanged(auth, user => {
            if (user) {
                userId = user.uid;
                // Initialize properties manager for shared properties
                propertiesManager = new PropertiesManager(db);
                operationsManager = new OperationsManager(db, userId); // Initialize operations manager
                navigationManager.showLandingPage();
                setupApp();
                
                // Auto-migrate properties from user-specific collections to shared collection
                checkAndMigrateUserProperties();
            } else {
                userId = null;
                navigationManager.showLoginPage();
                if (unsubscribe) unsubscribe(); 
                if (propertiesManager) {
                    propertiesManager.stopListening();
                    propertiesManager = null;
                }
                if (operationsManager) {
                    operationsManager.stopListening();
                    operationsManager = null;
                }
            }
        });

    } catch(error) {
        console.error("Firebase init failed:", error);
        document.getElementById('login-error').textContent = 'Could not connect to services.';
    }
});

function setupGlobalEventListeners() {
    // Sign out event listener
    document.addEventListener('click', (e) => {
        if (e.target.id === 'sign-out-btn' || e.target.id === 'landing-sign-out-btn' || e.target.id === 'properties-sign-out-btn' || e.target.id === 'operations-sign-out-btn') {
            signOut(auth);
        }
    });

    // Landing page navigation
    const goToPropertiesBtn = document.getElementById('go-to-properties-btn');
    const goToOperationsBtn = document.getElementById('go-to-operations-btn');
    const goToScheduleBtn = document.getElementById('go-to-schedule-btn');
    const backToLandingBtn = document.getElementById('back-to-landing-btn');
    const backToLandingFromOperationsBtn = document.getElementById('back-to-landing-from-operations-btn');
    const backToLandingFromScheduleBtn = document.getElementById('back-to-landing-from-schedule-btn');

    if (goToPropertiesBtn) {
        goToPropertiesBtn.addEventListener('click', () => {
            navigationManager.showPropertiesPage();
        });
    }

    if (goToOperationsBtn) {
        goToOperationsBtn.addEventListener('click', () => {
            navigationManager.showOperationsPage();
        });
    }

    if (goToScheduleBtn) {
        goToScheduleBtn.addEventListener('click', () => {
            navigationManager.showSchedulePage();
        });
    }

    if (backToLandingBtn) {
        backToLandingBtn.addEventListener('click', () => {
            navigationManager.showLandingPage();
        });
    }

    if (backToLandingFromOperationsBtn) {
        backToLandingFromOperationsBtn.addEventListener('click', () => {
            navigationManager.showLandingPage();
        });
    }

    if (backToLandingFromScheduleBtn) {
        backToLandingFromScheduleBtn.addEventListener('click', () => {
            navigationManager.showLandingPage();
        });
    }

    // Operations page event listeners
    document.addEventListener('operationsPageOpened', () => {
        if (operationsManager) {
            console.log('Operations page opened, initializing...');
            setTimeout(() => {
                try {
                    operationsManager.initializeEventListeners();
                } catch (error) {
                    console.error('Error initializing operations manager:', error);
                }
            }, 100);
        }
    });

    // Schedule page event listeners
    document.addEventListener('schedulePageOpened', () => {
        console.log('Schedule page opened, initializing...');
        setTimeout(() => {
            initializeScheduleApp();
        }, 100); // Small delay to ensure DOM is ready
    });

    // Properties management toggle buttons
    const quickAddToggleBtn = document.getElementById('quick-add-toggle-btn');
    const bulkImportToggleBtn = document.getElementById('bulk-import-toggle-btn');
    const filtersToggleBtn = document.getElementById('filters-toggle-btn');
    
    // Quick Add Section
    const quickAddSection = document.getElementById('quick-add-section');
    const quickAddCloseBtn = document.getElementById('quick-add-close-btn');
    
    if (quickAddToggleBtn && quickAddSection) {
        quickAddToggleBtn.addEventListener('click', () => {
            const isHidden = quickAddSection.classList.contains('hidden');
            
            // Hide other sections
            document.getElementById('bulk-import-section')?.classList.add('hidden');
            document.getElementById('filters-section')?.classList.add('hidden');
            
            // Toggle quick add section
            if (isHidden) {
                quickAddSection.classList.remove('hidden');
                quickAddToggleBtn.classList.add('bg-brand', 'text-white');
                quickAddToggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
            } else {
                quickAddSection.classList.add('hidden');
                quickAddToggleBtn.classList.remove('bg-brand', 'text-white');
                quickAddToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
            }
        });
    }
    
    if (quickAddCloseBtn && quickAddSection) {
        quickAddCloseBtn.addEventListener('click', () => {
            quickAddSection.classList.add('hidden');
            quickAddToggleBtn.classList.remove('bg-brand', 'text-white');
            quickAddToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
        });
    }
    
    // Bulk Import Section
    const bulkImportSection = document.getElementById('bulk-import-section');
    const bulkImportCloseBtn = document.getElementById('bulk-import-close-btn');
    
    if (bulkImportToggleBtn && bulkImportSection) {
        bulkImportToggleBtn.addEventListener('click', () => {
            const isHidden = bulkImportSection.classList.contains('hidden');
            
            // Hide other sections
            document.getElementById('quick-add-section')?.classList.add('hidden');
            document.getElementById('filters-section')?.classList.add('hidden');
            
            // Reset quick add button
            quickAddToggleBtn?.classList.remove('bg-brand', 'text-white');
            quickAddToggleBtn?.classList.add('bg-gray-100', 'text-gray-700');
            
            // Toggle bulk import section
            if (isHidden) {
                bulkImportSection.classList.remove('hidden');
                bulkImportToggleBtn.classList.add('bg-brand', 'text-white');
                bulkImportToggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
            } else {
                bulkImportSection.classList.add('hidden');
                bulkImportToggleBtn.classList.remove('bg-brand', 'text-white');
                bulkImportToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
            }
        });
    }
    
    if (bulkImportCloseBtn && bulkImportSection) {
        bulkImportCloseBtn.addEventListener('click', () => {
            bulkImportSection.classList.add('hidden');
            bulkImportToggleBtn.classList.remove('bg-brand', 'text-white');
            bulkImportToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
        });
    }
    
    // Filters Section
    const filtersSection = document.getElementById('filters-section');
    const filtersCloseBtn = document.getElementById('filters-close-btn');
    const filterCountBadge = document.getElementById('filter-count-badge');
    
    if (filtersToggleBtn && filtersSection) {
        filtersToggleBtn.addEventListener('click', () => {
            const isHidden = filtersSection.classList.contains('hidden');
            
            // Hide other sections
            document.getElementById('quick-add-section')?.classList.add('hidden');
            document.getElementById('bulk-import-section')?.classList.add('hidden');
            
            // Reset other buttons
            quickAddToggleBtn?.classList.remove('bg-brand', 'text-white');
            quickAddToggleBtn?.classList.add('bg-gray-100', 'text-gray-700');
            bulkImportToggleBtn?.classList.remove('bg-brand', 'text-white');
            bulkImportToggleBtn?.classList.add('bg-gray-100', 'text-gray-700');
            
            // Toggle filters section
            if (isHidden) {
                filtersSection.classList.remove('hidden');
                filtersToggleBtn.classList.add('bg-brand', 'text-white');
                filtersToggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
            } else {
                filtersSection.classList.add('hidden');
                filtersToggleBtn.classList.remove('bg-brand', 'text-white');
                filtersToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
            }
        });
    }
    
    if (filtersCloseBtn && filtersSection) {
        filtersCloseBtn.addEventListener('click', () => {
            filtersSection.classList.add('hidden');
            filtersToggleBtn.classList.remove('bg-brand', 'text-white');
            filtersToggleBtn.classList.add('bg-gray-100', 'text-gray-700');
        });
    }
    
    // Advanced Property Modal
    const advancedAddBtn = document.getElementById('advanced-add-btn');
    const advancedPropertyModal = document.getElementById('advanced-property-modal');
    const advancedPropertyCloseBtn = document.getElementById('advanced-property-close-btn');
    const advancedPropertyCancelBtn = document.getElementById('advanced-property-cancel-btn');
    const advancedPropertySaveBtn = document.getElementById('advanced-property-save-btn');
    
    if (advancedAddBtn && advancedPropertyModal) {
        advancedAddBtn.addEventListener('click', () => {
            // Copy values from quick add form to advanced form if they exist
            const quickName = document.getElementById('property-name')?.value;
            const quickLocation = document.getElementById('property-location')?.value;
            const quickType = document.getElementById('property-type')?.value;
            const quickRooms = document.getElementById('property-rooms')?.value;
            
            if (quickName) document.getElementById('advanced-property-name').value = quickName;
            if (quickLocation) document.getElementById('advanced-property-location').value = quickLocation;
            if (quickType) document.getElementById('advanced-property-type').value = quickType;
            if (quickRooms) document.getElementById('advanced-property-rooms').value = quickRooms;
            
            advancedPropertyModal.classList.remove('hidden');
        });
    }
    
    if (advancedPropertyCloseBtn && advancedPropertyModal) {
        advancedPropertyCloseBtn.addEventListener('click', () => {
            advancedPropertyModal.classList.add('hidden');
        });
    }
    
    if (advancedPropertyCancelBtn && advancedPropertyModal) {
        advancedPropertyCancelBtn.addEventListener('click', () => {
            advancedPropertyModal.classList.add('hidden');
        });
    }
    
    // Close modal when clicking outside
    if (advancedPropertyModal) {
        advancedPropertyModal.addEventListener('click', (e) => {
            if (e.target === advancedPropertyModal) {
                advancedPropertyModal.classList.add('hidden');
            }
        });
    }
    
    // Properties management event listeners
    const addPropertyBtn = document.getElementById('add-property-btn');

    if (addPropertyBtn) {
        addPropertyBtn.addEventListener('click', async () => {
            const selectedType = document.getElementById('property-type').value;
            let propertyData;

            // Parse the selected typology
            if (selectedType.includes('-T') || selectedType.includes('-V')) {
                // Portuguese typology format (apartment-T2, villa-V3, etc.)
                const [baseType, typology] = selectedType.split('-');
                const bedrooms = parseInt(typology.substring(1)); // Extract number from T2, V3 etc.
                
                propertyData = {
                    name: document.getElementById('property-name').value,
                    location: document.getElementById('property-location').value,
                    type: baseType,
                    typology: typology,
                    rooms: bedrooms, // Auto-set from typology
                    bathrooms: parseFloat(document.getElementById('property-bathrooms')?.value) || null,
                    floor: document.getElementById('property-floor')?.value?.trim() || null,
                    wifiSpeed: document.getElementById('property-wifi-speed')?.value || null,
                    wifiAirbnb: document.getElementById('property-wifi-airbnb')?.value || 'no',
                    parkingSpot: document.getElementById('property-parking-spot')?.value?.trim() || null,
                    parkingFloor: document.getElementById('property-parking-floor')?.value?.trim() || null,
                    energySource: document.getElementById('property-energy-source')?.value || null,
                    smartTv: document.getElementById('property-smart-tv')?.value || 'no'
                };
            } else {
                // Traditional property types (hotel, resort, etc.)
                propertyData = {
                    name: document.getElementById('property-name').value,
                    location: document.getElementById('property-location').value,
                    type: selectedType,
                    rooms: parseInt(document.getElementById('property-rooms').value) || 0,
                    bathrooms: parseFloat(document.getElementById('property-bathrooms')?.value) || null,
                    floor: document.getElementById('property-floor')?.value?.trim() || null,
                    wifiSpeed: document.getElementById('property-wifi-speed')?.value || null,
                    wifiAirbnb: document.getElementById('property-wifi-airbnb')?.value || 'no',
                    parkingSpot: document.getElementById('property-parking-spot')?.value?.trim() || null,
                    parkingFloor: document.getElementById('property-parking-floor')?.value?.trim() || null,
                    energySource: document.getElementById('property-energy-source')?.value || null,
                    smartTv: document.getElementById('property-smart-tv')?.value || 'no'
                };
            }
            
            const errors = propertiesManager.validatePropertyData(propertyData);
            const errorElement = document.getElementById('add-property-error');
            
            if (errors.length > 0) {
                errorElement.textContent = errors[0];
                return;
            }
            
            try {
                await propertiesManager.addProperty(propertyData);
                propertiesManager.clearForm();
                errorElement.textContent = '';
                
                // Close the quick add section after successful add
                document.getElementById('quick-add-section')?.classList.add('hidden');
                quickAddToggleBtn?.classList.remove('bg-brand', 'text-white');
                quickAddToggleBtn?.classList.add('bg-gray-100', 'text-gray-700');
            } catch (error) {
                errorElement.textContent = 'Failed to add property. Please try again.';
            }
        });
    }
    
    // Advanced Property Save
    if (advancedPropertySaveBtn) {
        advancedPropertySaveBtn.addEventListener('click', async () => {
            await saveAdvancedProperty();
        });
    }

    // Auto-populate bedroom count when typology is selected
    const propertyTypeSelect = document.getElementById('property-type');
    if (propertyTypeSelect) {
        propertyTypeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const roomsInput = document.getElementById('property-rooms');
            
            if (selectedType.includes('-T') || selectedType.includes('-V')) {
                // Extract bedroom count from typology (T2 = 2 bedrooms, V3 = 3 bedrooms)
                const typology = selectedType.split('-')[1];
                const bedrooms = parseInt(typology.substring(1));
                
                if (roomsInput && !isNaN(bedrooms)) {
                    roomsInput.value = bedrooms;
                    roomsInput.disabled = true; // Disable manual editing when typology is selected
                }
            } else {
                // Enable manual editing for traditional property types
                if (roomsInput) {
                    roomsInput.disabled = false;
                }
            }
        });
    }

    // Do the same for advanced property form
    const advancedPropertyTypeSelect = document.getElementById('advanced-property-type');
    if (advancedPropertyTypeSelect) {
        advancedPropertyTypeSelect.addEventListener('change', (e) => {
            const selectedType = e.target.value;
            const roomsInput = document.getElementById('advanced-property-rooms');
            
            if (selectedType.includes('-T') || selectedType.includes('-V')) {
                // Extract bedroom count from typology
                const typology = selectedType.split('-')[1];
                const bedrooms = parseInt(typology.substring(1));
                
                if (roomsInput && !isNaN(bedrooms)) {
                    roomsInput.value = bedrooms;
                    roomsInput.disabled = true;
                }
            } else {
                if (roomsInput) {
                    roomsInput.disabled = false;
                }
            }
        });
    }

    // Bulk import functionality (now moved to new section)
    const bulkPropertyInput = document.getElementById('bulk-property-input');
    const bulkPropertyCount = document.getElementById('bulk-property-count');
    const bulkAddPropertiesBtn = document.getElementById('bulk-add-properties-btn');
    const bulkAddPropertyError = document.getElementById('bulk-add-property-error');

    function updateBulkPropertyCount() {
        if (!bulkPropertyInput || !bulkPropertyCount) return;
        
        const inputText = bulkPropertyInput.value.trim();
        const lines = inputText.split('\n').filter(line => line.trim()).length;
        bulkPropertyCount.textContent = lines;
        
        if (bulkAddPropertiesBtn) {
            bulkAddPropertiesBtn.disabled = lines === 0;
        }
    }

    if (bulkPropertyInput) {
        bulkPropertyInput.addEventListener('input', updateBulkPropertyCount);
        updateBulkPropertyCount(); // Initial count
    }

    if (bulkAddPropertiesBtn) {
        const progressContainer = document.getElementById('bulk-import-progress');
        const progressBar = document.getElementById('bulk-import-progress-bar');
        const progressStatus = document.getElementById('bulk-import-status');
        const errorElement = document.getElementById('bulk-add-property-error');

        // Bulk import button
        bulkAddPropertiesBtn.addEventListener('click', async () => {
            const inputText = bulkPropertyInput.value.trim();
            if (!inputText) {
                errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">Please enter property data to import.</div>';
                return;
            }

            const { properties, errors } = propertiesManager.parseBulkPropertyData(inputText);
            
            if (errors.length > 0) {
                const errorMessages = errors.map(error => 
                    `Line ${error.lineNumber}: ${error.error}`
                ).join('<br>');
                errorElement.innerHTML = `<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">${errorMessages}</div>`;
                return;
            }

            if (properties.length === 0) {
                errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">No valid properties found to import.</div>';
                return;
            }

            // Clear previous errors and show progress
            errorElement.innerHTML = '';
            progressContainer.classList.remove('hidden');
            bulkAddPropertiesBtn.disabled = true;

            progressBar.style.width = '0%';
            progressStatus.textContent = 'Starting import...';

            try {
                const results = await propertiesManager.bulkAddProperties(properties, (progress) => {
                    progressBar.style.width = `${progress.percentage}%`;
                    progressStatus.textContent = `Importing properties... ${progress.completed}/${progress.total}`;
                });

                // Show completion status
                progressStatus.textContent = `Import complete! ${results.successful} properties added successfully.`;
                
                if (results.failed > 0) {
                    errorElement.innerHTML = `<div class="text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2">${results.failed} properties failed to import. Check console for details.</div>`;
                    console.error('Bulk import errors:', results.errors);
                }

                // Clear the form on successful import
                if (results.successful > 0) {
                    bulkPropertyInput.value = '';
                    updateBulkPropertyCount();
                }

                // Hide progress after 3 seconds
                setTimeout(() => {
                    progressContainer.classList.add('hidden');
                    bulkAddPropertiesBtn.disabled = false;
                }, 3000);

            } catch (error) {
                console.error('Bulk import failed:', error);
                errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">Bulk import failed. Please try again.</div>';
                progressContainer.classList.add('hidden');
                bulkAddPropertiesBtn.disabled = false;
            }
        });
    }

    // Edit Property Modal Event Listeners
    const editPropertyModal = document.getElementById('edit-property-modal');
    const editPropertyCloseBtn = document.getElementById('edit-property-close-btn');
    const editPropertyCancelBtn = document.getElementById('edit-property-cancel-btn');
    const editPropertySaveBtn = document.getElementById('edit-property-save-btn');

    if (editPropertyCloseBtn) {
        editPropertyCloseBtn.addEventListener('click', () => {
            editPropertyModal.classList.add('hidden');
        });
    }

    if (editPropertyCancelBtn) {
        editPropertyCancelBtn.addEventListener('click', () => {
            editPropertyModal.classList.add('hidden');
        });
    }

    if (editPropertySaveBtn) {
        editPropertySaveBtn.addEventListener('click', async () => {
            await savePropertyChanges();
        });
    }

    // Close modal when clicking outside
    if (editPropertyModal) {
        editPropertyModal.addEventListener('click', (e) => {
            if (e.target === editPropertyModal) {
                editPropertyModal.classList.add('hidden');
            }
        });
    }
    
    // Make functions globally available for onclick handlers
    window.editProperty = (propertyId) => {
        const property = propertiesManager.getPropertyById(propertyId);
        if (property) {
            populateEditModal(property);
            document.getElementById('edit-property-modal').classList.remove('hidden');
        }
    };
    
    window.deleteProperty = async (propertyId) => {
        if (confirm('Are you sure you want to delete this property?')) {
            try {
                await propertiesManager.deleteProperty(propertyId);
            } catch (error) {
                alert('Failed to delete property. Please try again.');
            }
        }
    };
}

async function saveAdvancedProperty() {
    const modal = document.getElementById('advanced-property-modal');
    const errorElement = document.getElementById('advanced-property-error');
    
    // Clear previous errors
    errorElement.textContent = '';
    
    // Gather form data
    const selectedType = document.getElementById('advanced-property-type').value;
    let propertyData;

    // Parse the selected typology
    if (selectedType.includes('-T') || selectedType.includes('-V')) {
        // Portuguese typology format (apartment-T2, villa-V3, etc.)
        const [baseType, typology] = selectedType.split('-');
        const bedrooms = parseInt(typology.substring(1)); // Extract number from T2, V3 etc.
        
        propertyData = {
            name: document.getElementById('advanced-property-name').value.trim(),
            location: document.getElementById('advanced-property-location').value.trim(),
            type: baseType,
            typology: typology,
            rooms: bedrooms // Auto-set from typology
        };
    } else {
        // Traditional property types (hotel, resort, etc.)
        propertyData = {
            name: document.getElementById('advanced-property-name').value.trim(),
            location: document.getElementById('advanced-property-location').value.trim(),
            type: selectedType,
            rooms: parseInt(document.getElementById('advanced-property-rooms').value) || 0
        };
    }

    // Add all the additional fields
    propertyData.bathrooms = parseFloat(document.getElementById('advanced-property-bathrooms').value) || null;
    propertyData.floor = document.getElementById('advanced-property-floor').value.trim() || null;
    propertyData.wifiSpeed = document.getElementById('advanced-property-wifi-speed').value || null;
    propertyData.wifiAirbnb = document.getElementById('advanced-property-wifi-airbnb').value || 'no';
    propertyData.parkingSpot = document.getElementById('advanced-property-parking-spot').value.trim() || null;
    propertyData.parkingFloor = document.getElementById('advanced-property-parking-floor').value.trim() || null;
    propertyData.energySource = document.getElementById('advanced-property-energy-source').value || null;
    propertyData.smartTv = document.getElementById('advanced-property-smart-tv').value || 'no';
    propertyData.status = document.getElementById('advanced-property-status').value || 'available';
    
    // Collect amenities
    const amenities = [];
    const amenityCheckboxes = [
        'advanced-amenity-wifi',
        'advanced-amenity-pool', 
        'advanced-amenity-garden',
        'advanced-amenity-balcony',
        'advanced-amenity-ac',
        'advanced-amenity-kitchen',
        'advanced-amenity-washing-machine',
        'advanced-amenity-sea-view'
    ];
    
    amenityCheckboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox && checkbox.checked) {
            amenities.push(id.replace('advanced-amenity-', ''));
        }
    });
    
    if (amenities.length > 0) {
        propertyData.amenities = amenities;
    }

    // Validate property data
    const errors = propertiesManager.validatePropertyData(propertyData);
    
    if (errors.length > 0) {
        errorElement.textContent = errors[0];
        return;
    }

    try {
        await propertiesManager.addProperty(propertyData);
        
        // Clear form and close modal
        clearAdvancedPropertyForm();
        modal.classList.add('hidden');
        
        // Success notification (optional)
        console.log('Property added successfully via advanced form');
        
    } catch (error) {
        console.error('Error adding property:', error);
        errorElement.textContent = 'Failed to add property. Please try again.';
    }
}

function clearAdvancedPropertyForm() {
    // Clear all form fields
    document.getElementById('advanced-property-name').value = '';
    document.getElementById('advanced-property-location').value = '';
    document.getElementById('advanced-property-type').value = '';
    document.getElementById('advanced-property-rooms').value = '';
    document.getElementById('advanced-property-bathrooms').value = '';
    document.getElementById('advanced-property-floor').value = '';
    document.getElementById('advanced-property-status').value = 'available';
    document.getElementById('advanced-property-wifi-speed').value = '';
    document.getElementById('advanced-property-wifi-airbnb').value = 'no';
    document.getElementById('advanced-property-parking-spot').value = '';
    document.getElementById('advanced-property-parking-floor').value = '';
    document.getElementById('advanced-property-energy-source').value = '';
    document.getElementById('advanced-property-smart-tv').value = 'no';
    
    // Clear amenity checkboxes
    const amenityCheckboxes = [
        'advanced-amenity-wifi',
        'advanced-amenity-pool', 
        'advanced-amenity-garden',
        'advanced-amenity-balcony',
        'advanced-amenity-ac',
        'advanced-amenity-kitchen',
        'advanced-amenity-washing-machine',
        'advanced-amenity-sea-view'
    ];
    
    amenityCheckboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.checked = false;
        }
    });
    
    // Clear error message
    document.getElementById('advanced-property-error').textContent = '';
}

function populateEditModal(property) {
    // Store the property ID for saving
    document.getElementById('edit-property-modal').dataset.propertyId = property.id;
    
    // Basic information
    document.getElementById('edit-property-name').value = property.name || '';
    document.getElementById('edit-property-location').value = property.location || '';
    
    // Set property type dropdown
    const typeSelect = document.getElementById('edit-property-type');
    if (property.typology && property.type) {
        // For Portuguese typology (T1, V2, etc.)
        typeSelect.value = `${property.type}-${property.typology}`;
    } else {
        // For other property types
        typeSelect.value = property.type || '';
    }
    
    document.getElementById('edit-property-rooms').value = property.rooms || '';
    document.getElementById('edit-property-bathrooms').value = property.bathrooms || '';
    document.getElementById('edit-property-floor').value = property.floor || '';
    document.getElementById('edit-property-wifi-speed').value = property.wifiSpeed || '';
    document.getElementById('edit-property-wifi-airbnb').value = property.wifiAirbnb || 'no';
    document.getElementById('edit-property-parking-spot').value = property.parkingSpot || '';
    document.getElementById('edit-property-parking-floor').value = property.parkingFloor || '';
    document.getElementById('edit-property-energy-source').value = property.energySource || '';
    document.getElementById('edit-property-smart-tv').value = property.smartTv || 'no';
    document.getElementById('edit-property-status').value = property.status || 'available';
    
    // Set amenities checkboxes
    const amenities = property.amenities || [];
    document.getElementById('edit-amenity-wifi').checked = amenities.includes('wifi');
    document.getElementById('edit-amenity-pool').checked = amenities.includes('pool');
    document.getElementById('edit-amenity-garden').checked = amenities.includes('garden');
    document.getElementById('edit-amenity-balcony').checked = amenities.includes('balcony');
    document.getElementById('edit-amenity-ac').checked = amenities.includes('ac');
    document.getElementById('edit-amenity-kitchen').checked = amenities.includes('kitchen');
    document.getElementById('edit-amenity-washing-machine').checked = amenities.includes('washing-machine');
    document.getElementById('edit-amenity-sea-view').checked = amenities.includes('sea-view');
    
    // Clear any previous errors
    document.getElementById('edit-property-error').textContent = '';
}

async function savePropertyChanges() {
    const modal = document.getElementById('edit-property-modal');
    const propertyId = modal.dataset.propertyId;
    const errorElement = document.getElementById('edit-property-error');
    
    // Clear previous errors
    errorElement.textContent = '';
    
    // Gather form data
    const selectedType = document.getElementById('edit-property-type').value;
    let propertyData;

    // Parse the selected typology
    if (selectedType.includes('-T') || selectedType.includes('-V')) {
        // Portuguese typology format (apartment-T2, villa-V3, etc.)
        const [baseType, typology] = selectedType.split('-');
        const bedrooms = parseInt(typology.substring(1)); // Extract number from T2, V3 etc.
        
        propertyData = {
            name: document.getElementById('edit-property-name').value.trim(),
            location: document.getElementById('edit-property-location').value.trim(),
            type: baseType,
            typology: typology,
            rooms: bedrooms // Auto-set from typology
        };
    } else {
        // Traditional property types (hotel, resort, etc.)
        propertyData = {
            name: document.getElementById('edit-property-name').value.trim(),
            location: document.getElementById('edit-property-location').value.trim(),
            type: selectedType,
            rooms: parseInt(document.getElementById('edit-property-rooms').value) || 0
        };
    }

    // Add all the additional fields
    propertyData.bathrooms = parseFloat(document.getElementById('edit-property-bathrooms').value) || null;
    propertyData.floor = document.getElementById('edit-property-floor').value.trim() || null;
    propertyData.wifiSpeed = document.getElementById('edit-property-wifi-speed').value || null;
    propertyData.wifiAirbnb = document.getElementById('edit-property-wifi-airbnb').value;
    propertyData.parkingSpot = document.getElementById('edit-property-parking-spot').value.trim() || null;
    propertyData.parkingFloor = document.getElementById('edit-property-parking-floor').value.trim() || null;
    propertyData.energySource = document.getElementById('edit-property-energy-source').value || null;
    propertyData.smartTv = document.getElementById('edit-property-smart-tv').value;
    propertyData.status = document.getElementById('edit-property-status').value;

    // Collect amenities
    const amenities = [];
    if (document.getElementById('edit-amenity-wifi').checked) amenities.push('wifi');
    if (document.getElementById('edit-amenity-pool').checked) amenities.push('pool');
    if (document.getElementById('edit-amenity-garden').checked) amenities.push('garden');
    if (document.getElementById('edit-amenity-balcony').checked) amenities.push('balcony');
    if (document.getElementById('edit-amenity-ac').checked) amenities.push('ac');
    if (document.getElementById('edit-amenity-kitchen').checked) amenities.push('kitchen');
    if (document.getElementById('edit-amenity-washing-machine').checked) amenities.push('washing-machine');
    if (document.getElementById('edit-amenity-sea-view').checked) amenities.push('sea-view');
    propertyData.amenities = amenities;

    // Validate
    const errors = propertiesManager.validatePropertyData(propertyData);
    if (errors.length > 0) {
        errorElement.textContent = errors[0]; // Show first error
        return;
    }

    try {
        await propertiesManager.updateProperty(propertyId, propertyData);
        modal.classList.add('hidden');
    } catch (error) {
        console.error('Error updating property:', error);
        errorElement.textContent = 'Failed to update property. Please try again.';
    }
}

async function setupApp() {
    if (unsubscribe) unsubscribe();
    
    // Setup app event listeners (but not login listeners - those are already set up)
    eventManager.setupAppEventListeners();
    
    // Initialize UI components
    uiManager.populateDayCheckboxes();
}

async function initializeScheduleApp() {
    try {
        console.log('🔄 Initializing schedule app...');
        
        if (!dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        const employeesSnap = await getDocs(dataManager.getEmployeesCollectionRef());
        const hasEmployees = employeesSnap.docs.some(doc => doc.id !== 'metadata');
        
        console.log(`📊 Found ${employeesSnap.docs.length} employee documents, hasEmployees: ${hasEmployees}`);
        
        if (!hasEmployees) {
            console.log('📝 No employees found, showing setup page');
            navigationManager.showSetupPage();
        } else {
            console.log('👥 Employees found, initializing main schedule app');
            
            // Start listening for employee changes
            dataManager.listenForEmployeeChanges();
            
            // Show the main app interface
            const loadingEl = document.getElementById('loading');
            const mainAppEl = document.getElementById('main-app');
            
            console.log(`🎯 DOM elements: loading=${!!loadingEl}, mainApp=${!!mainAppEl}`);
            
            if (loadingEl) loadingEl.classList.add('hidden');
            if (mainAppEl) mainAppEl.classList.remove('hidden');
            
            // Force UI refresh after a brief delay to ensure holidays are loaded
            setTimeout(() => {
                if (uiManager) {
                    console.log('🎨 Updating UI view');
                    uiManager.updateView();
                } else {
                    console.error('❌ UIManager not available');
                }
            }, 100);
        }
    } catch (error) {
        console.error('💥 Error initializing schedule app:', error);
        navigationManager.showSetupPage();
    }
}

// Auto-migration function for ALL user properties
async function checkAndMigrateUserProperties() {
    if (!db) {
        console.log("❌ Database not available for auto-migration");
        return;
    }
    
    try {
        console.log("🔍 Checking for properties to migrate from ALL user collections...");
        
        // Get all user documents to check for properties in any user collection
        const usersRef = collection(db, "users");
        const userSnapshots = await getDocs(usersRef);
        
        console.log(`👥 Found ${userSnapshots.docs.length} user collections to check`);
        
        let totalMigrated = 0;
        
        // Load existing properties once for duplicate checking
        const existingPropertiesRef = collection(db, "properties");
        const existingSnapshots = await getDocs(existingPropertiesRef);
        const existingProperties = existingSnapshots.docs.map(doc => doc.data());
        console.log(`  📊 Found ${existingProperties.length} existing properties in shared collection`);
        
        for (const userDoc of userSnapshots.docs) {
            const userIdToCheck = userDoc.id;
            
            try {
                // Check if this user has properties in their personal collection
                const userPropertiesRef = collection(db, `users/${userIdToCheck}/properties`);
                const propertySnapshots = await getDocs(userPropertiesRef);
                
                if (propertySnapshots.docs.length === 0) {
                    console.log(`  ✅ No properties found for user: ${userIdToCheck}`);
                    continue;
                }
                
                console.log(`  📋 Found ${propertySnapshots.docs.length} properties for user: ${userIdToCheck} - migrating...`);
                
                for (const propertyDoc of propertySnapshots.docs) {
                    try {
                        const propertyData = propertyDoc.data();
                        
                        // Check if this property was already migrated to avoid duplicates
                        const alreadyExists = existingProperties.some(existing => {
                            return existing.name === propertyData.name && 
                                   existing.location === propertyData.location &&
                                   existing.migratedFrom === userIdToCheck;
                        });
                        
                        if (alreadyExists) {
                            console.log(`    ⏭️  Property "${propertyData.name}" already migrated, skipping`);
                            continue;
                        }
                        
                        // Add to shared collection with migration metadata
                        await addDoc(collection(db, "properties"), {
                            ...propertyData,
                            migratedFrom: userIdToCheck,
                            migratedAt: new Date(),
                            autoMigrated: true
                        });
                        
                        totalMigrated++;
                        console.log(`    ✅ Auto-migrated: ${propertyData.name || 'Unnamed property'}`);
                        
                    } catch (error) {
                        console.error(`    ❌ Error auto-migrating property ${propertyDoc.id}:`, error);
                    }
                }
                
            } catch (error) {
                console.log(`  ⚠️  No properties collection for user ${userIdToCheck} or access denied`);
            }
        }
        
        if (totalMigrated > 0) {
            console.log(`🎉 Auto-migration complete! Migrated ${totalMigrated} properties total to shared collection`);
            
            // Refresh properties view if manager exists
            if (propertiesManager) {
                setTimeout(() => {
                    propertiesManager.listenForPropertyChanges();
                }, 500);
            }
        } else {
            console.log("✅ No new properties to migrate - all users are using shared collection");
        }
        
    } catch (error) {
        console.error("💥 Auto-migration failed:", error);
    }
}

// Property Migration Functions - Available globally
window.migratePropertiesToShared = async function() {
    if (!db) {
        console.error("❌ Database not initialized. Please log in first.");
        return;
    }
    
    console.log("🔄 Starting property migration to shared collection...");
    
    let totalMigrated = 0;
    let errors = [];
    
    try {
        // Get all user documents  
        const usersRef = collection(db, "users");
        const userSnapshots = await getDocs(usersRef);
        
        console.log(`📁 Found ${userSnapshots.docs.length} user collections`);
        
        for (const userDoc of userSnapshots.docs) {
            const userId = userDoc.id;
            console.log(`\n👤 Checking user: ${userId}`);
            
            try {
                // Get properties for this user
                const userPropertiesRef = collection(db, `users/${userId}/properties`);
                const propertySnapshots = await getDocs(userPropertiesRef);
                
                console.log(`  📋 Found ${propertySnapshots.docs.length} properties`);
                
                for (const propertyDoc of propertySnapshots.docs) {
                    try {
                        const propertyData = propertyDoc.data();
                        
                        // Add to shared collection
                        await addDoc(collection(db, "properties"), {
                            ...propertyData,
                            migratedFrom: userId,
                            migratedAt: new Date()
                        });
                        
                        totalMigrated++;
                        console.log(`  ✅ Migrated: ${propertyData.name}`);
                        
                    } catch (error) {
                        errors.push(`Error migrating property ${propertyDoc.id} from user ${userId}: ${error.message}`);
                        console.error(`  ❌ Error migrating property:`, error);
                    }
                }
                
            } catch (error) {
                console.log(`  ⚠️  No properties collection for user ${userId}`);
            }
        }
        
        console.log(`\n🎉 Migration complete!`);
        console.log(`✅ Total properties migrated: ${totalMigrated}`);
        
        if (errors.length > 0) {
            console.log(`❌ Errors encountered: ${errors.length}`);
            errors.forEach(error => console.error(error));
        }
        
        // Refresh the properties view
        if (propertiesManager) {
            console.log("🔄 Refreshing properties view...");
            propertiesManager.listenForPropertyChanges();
        }
        
        return { success: true, migrated: totalMigrated, errors };
        
    } catch (error) {
        console.error("💥 Migration failed:", error);
        return { success: false, error: error.message };
    }
};

// Check what properties would be migrated (dry run)
window.checkPropertiesForMigration = async function() {
    if (!db) {
        console.error("❌ Database not initialized. Please log in first.");
        return;
    }
    
    console.log("🔍 Checking properties for migration (dry run)...");
    
    let totalProperties = 0;
    const userProperties = {};
    
    try {
        const usersRef = collection(db, "users");
        const userSnapshots = await getDocs(usersRef);
        
        for (const userDoc of userSnapshots.docs) {
            const userId = userDoc.id;
            
            try {
                const userPropertiesRef = collection(db, `users/${userId}/properties`);
                const propertySnapshots = await getDocs(userPropertiesRef);
                
                if (propertySnapshots.docs.length > 0) {
                    userProperties[userId] = propertySnapshots.docs.map(doc => ({
                        id: doc.id,
                        name: doc.data().name,
                        location: doc.data().location
                    }));
                    totalProperties += propertySnapshots.docs.length;
                }
                
            } catch (error) {
                // User has no properties collection
            }
        }
        
        console.log(`📊 Migration Summary:`);
        console.log(`Total properties to migrate: ${totalProperties}`);
        console.log(`Users with properties:`, Object.keys(userProperties).length);
        
        Object.entries(userProperties).forEach(([userId, properties]) => {
            console.log(`\n👤 ${userId}: ${properties.length} properties`);
            properties.forEach(prop => console.log(`  - ${prop.name} (${prop.location})`));
        });
        
        return { totalProperties, userProperties };
        
    } catch (error) {
        console.error("Error checking properties:", error);
        return { error: error.message };
    }
};

// Force refresh properties view
window.refreshPropertiesView = function() {
    if (!propertiesManager) {
        console.error("❌ Properties manager not initialized. Please log in first.");
        return;
    }
    
    console.log("🔄 Force refreshing properties view...");
    propertiesManager.listenForPropertyChanges();
};

// Debug function to check shared properties collection directly
window.checkSharedProperties = async function() {
    if (!db) {
        console.error("❌ Database not initialized. Please log in first.");
        return;
    }
    
    console.log("🔍 Checking shared properties collection directly...");
    
    try {
        const sharedPropertiesRef = collection(db, "properties");
        const snapshot = await getDocs(sharedPropertiesRef);
        
        console.log(`📋 Found ${snapshot.docs.length} properties in shared collection:`);
        
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            console.log(`  ✅ ${data.name} - ${data.location} (ID: ${doc.id})`);
        });
        
        if (snapshot.docs.length === 0) {
            console.log("⚠️ No properties found in shared collection. Run migratePropertiesToShared() first.");
        }
        
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
    } catch (error) {
        console.error("❌ Error checking shared properties:", error);
        return { error: error.message };
    }
}; 