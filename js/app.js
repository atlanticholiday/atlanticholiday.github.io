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

// --- GLOBAL VARIABLES & CONFIG ---
let db, auth, userId;
let unsubscribe = null;

// Initialize managers
let dataManager, uiManager, pdfGenerator, holidayCalculator, eventManager, navigationManager, propertiesManager;

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
                // Update dataManager with userId
                dataManager.setUserId(userId);
                // Initialize properties manager with user context
                propertiesManager = new PropertiesManager(db, userId);
                navigationManager.showLandingPage();
                setupApp();
            } else {
                userId = null;
                navigationManager.showLoginPage();
                if (unsubscribe) unsubscribe(); 
                if (propertiesManager) {
                    propertiesManager.stopListening();
                    propertiesManager = null;
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
    document.addEventListener('signOutRequested', () => {
        signOut(auth);
    });
    
    // Properties page opened event listener
    document.addEventListener('propertiesPageOpened', () => {
        if (propertiesManager) {
            propertiesManager.listenForPropertyChanges();
        }
    });
    
    // Schedule page opened event listener
    document.addEventListener('schedulePageOpened', async () => {
        try {
            navigationManager.showSchedulePage();
            await initializeScheduleApp();
        } catch (error) {
            console.error('Error opening schedule page:', error);
            navigationManager.showSetupPage();
        }
    });
    
    // No employees found event listener
    document.addEventListener('noEmployeesFound', () => {
        navigationManager.showSetupPage();
    });
    
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
                    rating: parseInt(document.getElementById('property-rating').value) || 0,
                    description: document.getElementById('property-description').value || `${typology} - ${bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`}`
                };
            } else {
                // Traditional property types (hotel, resort, etc.)
                propertyData = {
                    name: document.getElementById('property-name').value,
                    location: document.getElementById('property-location').value,
                    type: selectedType,
                    rooms: parseInt(document.getElementById('property-rooms').value) || 0,
                    rating: parseInt(document.getElementById('property-rating').value) || 0,
                    description: document.getElementById('property-description').value
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
            } catch (error) {
                errorElement.textContent = 'Failed to add property. Please try again.';
            }
        });
    }

    // Auto-populate bedroom count when typology is selected
    const propertyTypeSelect = document.getElementById('property-type');
    const propertyRoomsInput = document.getElementById('property-rooms');
    const propertyDescriptionInput = document.getElementById('property-description');

    if (propertyTypeSelect && propertyRoomsInput) {
        propertyTypeSelect.addEventListener('change', () => {
            const selectedValue = propertyTypeSelect.value;
            
            if (selectedValue.includes('-T') || selectedValue.includes('-V')) {
                // Extract bedroom count from typology (T2 -> 2, V3 -> 3)
                const [, typology] = selectedValue.split('-');
                const bedrooms = parseInt(typology.substring(1));
                
                propertyRoomsInput.value = bedrooms;
                propertyRoomsInput.readOnly = true;
                propertyRoomsInput.classList.add('bg-gray-100');
                
                // Auto-generate description if empty
                if (!propertyDescriptionInput.value.trim()) {
                    propertyDescriptionInput.value = `${typology} - ${bedrooms === 0 ? 'Studio' : `${bedrooms} bedroom${bedrooms > 1 ? 's' : ''}`}`;
                }
            } else {
                // For traditional property types, allow manual entry
                propertyRoomsInput.readOnly = false;
                propertyRoomsInput.classList.remove('bg-gray-100');
                if (propertyDescriptionInput.value.match(/^[TV]\d+ - (\d+ bedrooms?|Studio)$/)) {
                    propertyDescriptionInput.value = '';
                }
            }
        });
    }

    // Tab switching for property forms
    const singleAddTab = document.getElementById('single-add-tab');
    const bulkAddTab = document.getElementById('bulk-add-tab');
    const singleAddForm = document.getElementById('single-add-form');
    const bulkAddForm = document.getElementById('bulk-add-form');

    if (singleAddTab && bulkAddTab && singleAddForm && bulkAddForm) {
        singleAddTab.addEventListener('click', () => {
            singleAddTab.classList.remove('bg-gray-200', 'text-gray-700');
            singleAddTab.classList.add('bg-brand', 'text-white');
            bulkAddTab.classList.remove('bg-brand', 'text-white');
            bulkAddTab.classList.add('bg-gray-200', 'text-gray-700');
            
            singleAddForm.classList.remove('hidden');
            bulkAddForm.classList.add('hidden');
        });

        bulkAddTab.addEventListener('click', () => {
            bulkAddTab.classList.remove('bg-gray-200', 'text-gray-700');
            bulkAddTab.classList.add('bg-brand', 'text-white');
            singleAddTab.classList.remove('bg-brand', 'text-white');
            singleAddTab.classList.add('bg-gray-200', 'text-gray-700');
            
            bulkAddForm.classList.remove('hidden');
            singleAddForm.classList.add('hidden');
        });
    }

    // Bulk property input handling
    const bulkPropertyInput = document.getElementById('bulk-property-input');
    const bulkPropertyCount = document.getElementById('bulk-property-count');
    const bulkAddPropertiesBtn = document.getElementById('bulk-add-properties-btn');

    if (bulkPropertyInput && bulkPropertyCount && bulkAddPropertiesBtn) {
        // Update property count as user types
        const updateBulkPropertyCount = () => {
            const inputText = bulkPropertyInput.value.trim();
            const errorElement = document.getElementById('bulk-add-property-error');
            
            if (!inputText) {
                bulkPropertyCount.textContent = '0';
                bulkAddPropertiesBtn.disabled = true;
                errorElement.innerHTML = '';
                return;
            }

            const { properties, errors } = propertiesManager.parseBulkPropertyData(inputText);
            bulkPropertyCount.textContent = properties.length.toString();
            bulkAddPropertiesBtn.disabled = properties.length === 0;
            
            // Clear errors when typing (show them only on submit)
            if (errors.length === 0) {
                errorElement.innerHTML = '';
            }
        };

        bulkPropertyInput.addEventListener('input', updateBulkPropertyCount);
        bulkPropertyInput.addEventListener('paste', () => {
            setTimeout(updateBulkPropertyCount, 10); // Small delay to allow paste to complete
        });

        // Function to display bulk import errors in a user-friendly way
        const displayBulkImportErrors = (errors) => {
            const errorElement = document.getElementById('bulk-add-property-error');
            const maxErrorsToShow = 5; // Show max 5 errors to avoid overwhelming the user
            
            if (errors.length === 1) {
                const error = errors[0];
                errorElement.innerHTML = `
                    <div class="bg-red-50 border border-red-200 rounded-md p-3 mt-2">
                        <div class="text-sm">
                            <strong class="text-red-800">Line ${error.lineNumber}:</strong> 
                            <span class="text-red-700">${error.error}</span>
                        </div>
                        <div class="text-xs text-red-600 mt-1 font-mono bg-red-100 p-2 rounded">
                            "${error.line}"
                        </div>
                        <div class="text-xs text-red-600 mt-1">
                            💡 ${error.suggestion}
                        </div>
                    </div>
                `;
            } else {
                const errorsToShow = errors.slice(0, maxErrorsToShow);
                const remainingErrors = errors.length - maxErrorsToShow;
                
                let errorHtml = `<div class="bg-red-50 border border-red-200 rounded-md p-3 mt-2">
                    <div class="text-sm font-medium text-red-800 mb-2">
                        Found ${errors.length} error${errors.length > 1 ? 's' : ''}:
                    </div>`;
                
                errorsToShow.forEach(error => {
                    errorHtml += `
                        <div class="mb-3 pb-2 border-b border-red-200 last:border-b-0">
                            <div class="text-sm">
                                <strong class="text-red-800">Line ${error.lineNumber}:</strong> 
                                <span class="text-red-700">${error.error}</span>
                            </div>
                            <div class="text-xs text-red-600 mt-1 font-mono bg-red-100 p-2 rounded">
                                "${error.line}"
                            </div>
                            <div class="text-xs text-red-600 mt-1">
                                💡 ${error.suggestion}
                            </div>
                        </div>
                    `;
                });
                
                if (remainingErrors > 0) {
                    errorHtml += `
                        <div class="text-xs text-red-600 mt-2 text-center">
                            ... and ${remainingErrors} more error${remainingErrors > 1 ? 's' : ''}. Fix the above errors first.
                        </div>
                    `;
                }
                
                errorHtml += '</div>';
                errorElement.innerHTML = errorHtml;
            }
        };

        // Bulk import button
        bulkAddPropertiesBtn.addEventListener('click', async () => {
            const inputText = bulkPropertyInput.value.trim();
            const errorElement = document.getElementById('bulk-add-property-error');
            const progressContainer = document.getElementById('bulk-import-progress');
            const progressBar = document.getElementById('bulk-import-progress-bar');
            const progressStatus = document.getElementById('bulk-import-status');

            if (!inputText) {
                errorElement.innerHTML = '<div class="text-red-500">Please enter property data to import.</div>';
                return;
            }

            const { properties, errors } = propertiesManager.parseBulkPropertyData(inputText);

            if (errors.length > 0) {
                displayBulkImportErrors(errors);
                return;
            }

            if (properties.length === 0) {
                errorElement.innerHTML = '<div class="text-red-500">No valid properties found to import.</div>';
                return;
            }

            // Show progress and disable button
            errorElement.innerHTML = '';
            bulkAddPropertiesBtn.disabled = true;
            progressContainer.classList.remove('hidden');
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
    
    // Make functions globally available for onclick handlers
    window.editProperty = (propertyId) => {
        const property = propertiesManager.getPropertyById(propertyId);
        if (property) {
            // TODO: Implement edit modal
            alert('Edit functionality coming soon!');
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

async function setupApp() {
    if (unsubscribe) unsubscribe();
    
    // Setup app event listeners (but not login listeners - those are already set up)
    eventManager.setupAppEventListeners();
    
    // Initialize UI components
    uiManager.populateDayCheckboxes();
}

async function initializeScheduleApp() {
    try {
        // Ensure dataManager has the correct userId
        if (!dataManager.userId && userId) {
            dataManager.setUserId(userId);
        }
        
        const employeesSnap = await getDocs(dataManager.getEmployeesCollectionRef());
        const hasEmployees = employeesSnap.docs.some(doc => doc.id !== 'metadata');
        
        if (!hasEmployees) {
            navigationManager.showSetupPage();
        } else {
            // Start listening for employee changes
            dataManager.listenForEmployeeChanges();
            
            // Show the main app interface
            const loadingEl = document.getElementById('loading');
            const mainAppEl = document.getElementById('main-app');
            
            if (loadingEl) loadingEl.classList.add('hidden');
            if (mainAppEl) mainAppEl.classList.remove('hidden');
            
            // Force UI refresh after a brief delay to ensure holidays are loaded
            setTimeout(() => {
                uiManager.updateView();
            }, 100);
        }
    } catch (error) {
        console.error('Error initializing schedule app:', error);
        navigationManager.showSetupPage();
    }
} 