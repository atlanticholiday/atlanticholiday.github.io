import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, collection, doc, addDoc, onSnapshot, deleteDoc, setLogLevel, getDoc, setDoc, updateDoc, deleteField, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let migrationCompleted = false; // Flag to prevent repeated migration

// Initialize managers
let dataManager, uiManager, pdfGenerator, holidayCalculator, eventManager, navigationManager, propertiesManager, operationsManager;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const app = initializeApp(Config.firebaseConfig);
        db = getFirestore(app);
        // Enable offline data persistence to cache Firestore data across page reloads
        enableIndexedDbPersistence(db).catch(err => {
            if (err.code === 'failed-precondition') {
                console.warn('Offline persistence failed - multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Offline persistence not supported by this browser');
            }
        });
        auth = getAuth(app);
        // Persist auth session locally so refreshes use the saved session and avoid extra sign-ins
        await setPersistence(auth, browserLocalPersistence);
        setLogLevel('error');
        
        // Add global Firestore read tracking
        let globalReadCount = 0;
        console.log("🔍 [GLOBAL READ TRACKER] Initialized - tracking all Firestore reads");
        
        // Monitor Firebase console directly if possible
        if (typeof window !== 'undefined') {
            // Track any console network activity
            const originalFetch = window.fetch;
            window.fetch = async function(...args) {
                const url = args[0];
                if (typeof url === 'string' && url.includes('firestore')) {
                    console.log(`🌐 [NETWORK TRACKER] Firestore request to:`, url);
                }
                return originalFetch.apply(this, args);
            };
            
            // Track XMLHttpRequest as well
            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function(method, url, ...args) {
                if (typeof url === 'string' && url.includes('firestore')) {
                    console.log(`🌐 [XHR TRACKER] Firestore ${method} request to:`, url);
                }
                return originalXHR.apply(this, [method, url, ...args]);
            };
        }
        
        // Wrap getDocs to count reads
        const originalGetDocs = window.getDocs || getDocs;
        window.getDocsTracked = async function(query) {
            const result = await originalGetDocs(query);
            const readCount = result.docs.length || 1;
            globalReadCount += readCount;
            console.log(`📊 [GLOBAL READ TRACKER] getDocs called: +${readCount} reads (Total: ${globalReadCount})`);
            console.log(`📊 [GLOBAL READ TRACKER] getDocs source: ${result.metadata?.fromCache ? 'CACHE' : 'SERVER'}`);
            return result;
        };
        
        // Wrap onSnapshot to count reads
        const originalOnSnapshot = window.onSnapshot || onSnapshot;
        window.onSnapshotTracked = function(query, callback, errorCallback) {
            return originalOnSnapshot(query, (snapshot) => {
                const readCount = snapshot.docs.length || 1;
                globalReadCount += readCount;
                console.log(`📊 [GLOBAL READ TRACKER] onSnapshot triggered: +${readCount} reads (Total: ${globalReadCount})`);
                console.log(`📊 [GLOBAL READ TRACKER] Snapshot source: ${snapshot.metadata.fromCache ? 'CACHE' : 'SERVER'}`);
                callback(snapshot);
            }, errorCallback);
        };
        
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
                console.log(`🔐 [INITIALIZATION] User logged in: ${userId}`);
                
                // Initialize properties manager for shared properties
                console.log(`📋 [INITIALIZATION] Creating PropertiesManager...`);
                propertiesManager = new PropertiesManager(db);
                window.propertiesManager = propertiesManager;
                
                console.log(`⚙️ [INITIALIZATION] Creating OperationsManager...`);
                operationsManager = new OperationsManager(db, userId); // Initialize operations manager
                
                navigationManager.showLandingPage();
                setupApp();
                
                // OPTIMIZATION: Run migration AFTER properties have loaded to avoid duplicate reads
                console.log(`⏰ [OPTIMIZATION] Scheduling migration check after properties load...`);
                setTimeout(() => {
                    if (!migrationCompleted) {
                        console.log(`🔄 [MIGRATION] Running migration check after properties loaded...`);
                        checkAndMigrateUserProperties();
                        migrationCompleted = true;
                    }
                }, 2000); // Wait 2 seconds for properties to load
            } else {
                console.log(`🔐 [INITIALIZATION] User logged out`);
                userId = null;
                navigationManager.showLoginPage();
                if (unsubscribe) unsubscribe(); 
                if (propertiesManager) {
                    console.log(`📋 [CLEANUP] Stopping PropertiesManager...`);
                    propertiesManager.stopListening();
                    propertiesManager = null;
                }
                if (operationsManager) {
                    console.log(`⚙️ [CLEANUP] Stopping OperationsManager...`);
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
            // OPTIMIZATION: Only initialize if we don't already have employee data
            console.log('📅 [SCHEDULE PAGE] Checking if initialization needed...');
            if (!dataManager.activeEmployees || dataManager.activeEmployees.length === 0) {
                console.log('📅 [SCHEDULE PAGE] No employee data, running full initialization');
                initializeScheduleApp();
            } else {
                console.log('📅 [SCHEDULE PAGE] Employee data exists, skipping expensive initialization');
            }
        }, 100); // Small delay to ensure DOM is ready
    });

    // All Info page initializer
    document.addEventListener('allInfoPageOpened', () => initAllInfoUI());
    function initAllInfoUI() {
        const properties = window.propertiesManager?.properties || [];
        const nav = document.getElementById('allinfo-nav');
        const content = document.getElementById('allinfo-content');
        if (!nav || !content) return;
        nav.innerHTML = '';
        content.innerHTML = '';
        const categories = [
            { title: 'Basic Info', slug: 'basic-info', fields: ['location','type','typology','rooms','bathrooms','floor'], icon: 'fas fa-info-circle' },
            { title: 'Connectivity & Utilities', slug: 'connectivity-utilities', fields: ['wifiSpeed','energySource'], icon: 'fas fa-wifi' },
            { title: 'Access & Parking', slug: 'access-parking', fields: ['keyBoxCode','parkingSpot','parkingFloor'], icon: 'fas fa-parking' },
            { title: 'Equipment', slug: 'equipment', fields: ['airConditioning','fans','heaters','crib','cribMattress','babyChair'], icon: 'fas fa-toolbox' },
            { title: 'Frames', slug: 'frames', fields: ['wifiFrame','recommendationsFrame','investmentFrame'], icon: 'fas fa-border-all' },
            { title: 'Services & Extras', slug: 'services-extras', fields: ['breakfastBox'], icon: 'fas fa-concierge-bell' },
            { title: 'Signage', slug: 'signage', fields: ['privateSign','noSmokingSign','noJunkMailSign','alAhSign','keysNotice','wcSign'], icon: 'fas fa-sign' },
            { title: 'Condominium Info', slug: 'condominium-info', fields: ['condominiumName','condominiumEmail','condominiumPhone'], icon: 'fas fa-building' },
            { title: 'Media & Content', slug: 'media-content', fields: ['checkinVideos','bookingDescriptionStatus'], icon: 'fas fa-video' },
            { title: 'Google Drive', slug: 'google-drive', fields: ['googleDriveEnabled','googleDriveLink','scannedDocsLink'], icon: 'fab fa-google-drive' },
            { title: 'Recommendations', slug: 'recommendations', fields: ['recommendationsLink','recommendationsEditLink'], icon: 'fas fa-star' },
            { title: 'Legal & Compliance', slug: 'legal-compliance', fields: ['contractsStatus','complaintBooksStatus','statisticsStatus','sefStatus'], icon: 'fas fa-gavel' },
            { title: 'Online Services', slug: 'online-services', fields: ['onlineComplaintBooksEnabled','onlineComplaintBooksEmail','onlineComplaintBooksPassword','airbnbLinksStatus'], icon: 'fas fa-globe' }
        ];
        // Category navigation buttons
        categories.forEach((cat, idx) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<i class="${cat.icon} mr-2"></i>${cat.title}`;
            btn.className = 'flex items-center px-4 py-2 rounded hover:bg-gray-100';
            if (idx === 0) btn.classList.add('bg-gray-100');
            btn.onclick = () => {
                Array.from(nav.children).forEach((c,i) => c.classList.toggle('bg-gray-100', i === idx));
                renderCategory(idx);
            };
            nav.appendChild(btn);
        });
        // Filter input
        const filterWrapper = document.createElement('div'); filterWrapper.className = 'mb-4';
        const filterInput = document.createElement('input');
        filterInput.id = 'allinfo-filter'; filterInput.type = 'text';
        filterInput.placeholder = 'Filter properties...';
        filterInput.className = 'px-3 py-2 border rounded-md w-full';
        filterWrapper.appendChild(filterInput);
        // Attach filter to dedicated wrapper
        const filterParent = document.getElementById('allinfo-filter-wrapper');
        if (filterParent) { filterParent.innerHTML = ''; filterParent.appendChild(filterWrapper); }
        // Table container
        const tableContainer = document.getElementById('allinfo-content');
        if (tableContainer) { tableContainer.innerHTML = ''; }
        // Sorting helper
        function sortTable(table, colIndex, asc) {
            const tbody = table.querySelector('tbody');
            Array.from(tbody.querySelectorAll('tr')).sort((a,b) => {
                const aText = a.cells[colIndex].textContent.trim();
                const bText = b.cells[colIndex].textContent.trim();
                return asc
                    ? aText.localeCompare(bText, undefined, { numeric:true })
                    : bText.localeCompare(aText, undefined, { numeric:true });
            }).forEach(r => tbody.appendChild(r));
        }
        // Render table for a category
        function renderCategory(idx) {
            tableContainer.innerHTML = '';
            const cat = categories[idx];
            const displayFields = ['name', ...cat.fields];
            const wrap = document.createElement('div'); wrap.className = 'shadow overflow-x-auto border-b border-gray-200 sm:rounded-lg';
            const table = document.createElement('table'); table.className = 'min-w-full divide-y divide-gray-200';
            // Header with sticky sort icons
            const thead = document.createElement('thead');
            thead.className = 'bg-gray-900 text-white';
            const tr = document.createElement('tr');
            displayFields.forEach((key, i) => {
                const th = document.createElement('th');
                th.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer bg-gray-900';
                const label = key === 'name'
                    ? 'Property Name'
                    : key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                th.innerHTML = `${label} <i class="fas fa-sort ml-1 text-gray-400"></i>`;
                th.onclick = () => { const asc = !th.asc; th.asc = asc; sortTable(table, i, asc); };
                tr.appendChild(th);
            });
            const thA = document.createElement('th');
            thA.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider bg-gray-900';
            thA.textContent = 'Actions';
            tr.appendChild(thA);
            thead.appendChild(tr);
            table.appendChild(thead);
            // Body
            const tbody = document.createElement('tbody'); tbody.className='bg-white divide-y divide-gray-200';
            properties.forEach(prop=>{
                const row = document.createElement('tr'); row.className='hover:bg-gray-50';
                displayFields.forEach(key=>{ const td=document.createElement('td'); td.className='px-6 py-4 whitespace-nowrap text-sm text-gray-700'; td.textContent=prop[key]??''; row.appendChild(td); });
                const actionTd=document.createElement('td'); actionTd.className='px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-4';
                [
                    { icon: 'fas fa-edit', cls: 'text-blue-600', fn: () => window.location.href = `property-settings.html?id=${prop.id}#section-${categories[idx].slug}`, title: 'Edit' },
                    { icon: 'fas fa-eye', cls: 'text-green-600', fn: () => { sessionStorage.setItem('currentProperty', JSON.stringify(prop)); window.location.href = `property-settings.html?id=${prop.id}`; }, title: 'View' },
                    { icon: 'fas fa-file-pdf', cls: 'text-red-600', fn: () => console.log('PDF for', prop.id), title: 'Download PDF' }
                ].forEach(({ icon, cls, fn, title }) => {
                    const btn = document.createElement('button');
                    btn.innerHTML = `<i class="${icon}"></i>`;
                    btn.className = `${cls} hover:text-gray-800 px-2 py-1 rounded`;
                    btn.title = title;
                    btn.onclick = fn;
                    actionTd.appendChild(btn);
                });
                row.appendChild(actionTd);
                tbody.appendChild(row);
            });
            table.appendChild(tbody); wrap.appendChild(table); tableContainer.appendChild(wrap);
        }
        // Filter logic
        filterInput.addEventListener('input',e=>{const term=e.target.value.toLowerCase(); tableContainer.querySelectorAll('tbody tr').forEach(r=>{r.style.display=r.textContent.toLowerCase().includes(term)?'':'none';});});
        // Initial render
        renderCategory(0);
    }

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
            console.log('🔘 Save Changes button clicked');
            await savePropertyChanges();
            // Immediately re-render properties after update
            if (window.propertiesManager) {
                window.propertiesManager.renderProperties();
            }
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
    
    // Setup Edit Property modal tabs
    const basicTab = document.getElementById('edit-basic-tab');
    const advancedTab = document.getElementById('edit-advanced-tab');
    basicTab.addEventListener('click', () => {
      document.getElementById('edit-basic-section').classList.remove('hidden');
      document.getElementById('edit-advanced-section').classList.add('hidden');
      basicTab.classList.add('border-blue-500', 'text-black');
      advancedTab.classList.remove('border-blue-500', 'text-black');
    });
    advancedTab.addEventListener('click', () => {
      document.getElementById('edit-basic-section').classList.add('hidden');
      document.getElementById('edit-advanced-section').classList.remove('hidden');
      advancedTab.classList.add('border-blue-500', 'text-black');
      basicTab.classList.remove('border-blue-500', 'text-black');
    });

    // Manage Links & Credentials button
    const manageLinksBtn = document.getElementById('manage-links-btn');
    manageLinksBtn.addEventListener('click', () => {
      const propertyId = document.getElementById('edit-property-modal').dataset.propertyId;
      
      // Get the current property data from the properties manager
      if (window.propertiesManager && window.propertiesManager.properties) {
        const property = window.propertiesManager.properties.find(p => p.id === propertyId);
        if (property) {
          // Store the property data in sessionStorage for the settings page
          sessionStorage.setItem('currentProperty', JSON.stringify(property));
          window.location.href = `property-settings.html?id=${propertyId}`;
        } else {
          alert('Property not found. Please try again.');
        }
      } else {
        alert('Unable to load property data. Please try again.');
      }
    });

    // Add Property modal wizard logic
    let addWizardStep = 1;
    const totalAddSteps = 2;
    function showAddStep(step) {
      document.getElementById('add-wizard-step-1').classList.toggle('hidden', step !== 1);
      document.getElementById('add-wizard-step-2').classList.toggle('hidden', step !== 2);
      document.getElementById('advanced-back-btn').classList.toggle('hidden', step === 1);
      document.getElementById('advanced-next-btn').classList.toggle('hidden', step === totalAddSteps);
      document.getElementById('advanced-property-save-btn').classList.toggle('hidden', step !== totalAddSteps);
    }

    document.getElementById('advanced-next-btn').addEventListener('click', () => {
      if (addWizardStep < totalAddSteps) {
        addWizardStep++;
        showAddStep(addWizardStep);
      }
    });

    document.getElementById('advanced-back-btn').addEventListener('click', () => {
      if (addWizardStep > 1) {
        addWizardStep--;
        showAddStep(addWizardStep);
      }
    });

    // Reset wizard when opening add modal
    const advancedModal = document.getElementById('advanced-property-modal');
    advancedModal.addEventListener('transitionend', () => {
      if (!advancedModal.classList.contains('hidden')) {
        addWizardStep = 1;
        showAddStep(addWizardStep);
      }
    });
    
    // Make functions globally available for onclick handlers
    window.editProperty = (propertyId) => {
        // Redirect to standalone settings page for full editing
        const property = propertiesManager.getPropertyById(propertyId);
        if (property) {
            sessionStorage.setItem('currentProperty', JSON.stringify(property));
            window.location.href = `property-settings.html?id=${propertyId}`;
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
    // Populate latitude/longitude fields
    document.getElementById('edit-property-latitude').value = property.latitude ?? '';
    document.getElementById('edit-property-longitude').value = property.longitude ?? '';
    document.getElementById('edit-property-wifi-speed').value = property.wifiSpeed || '';
    document.getElementById('edit-property-wifi-airbnb').value = property.wifiAirbnb || 'no';
    document.getElementById('edit-property-parking-spot').value = property.parkingSpot || '';
    document.getElementById('edit-property-parking-floor').value = property.parkingFloor || '';
    document.getElementById('edit-property-energy-source').value = property.energySource || '';
    document.getElementById('edit-property-smart-tv').value = property.smartTv || 'no';
    document.getElementById('edit-property-status').value = property.status || 'available';
    document.getElementById('edit-property-key-box-code').value = property.keyBoxCode || '';
    document.getElementById('edit-property-air-conditioning').value = property.airConditioning || '';
    document.getElementById('edit-property-fans').value = property.fans || '';
    document.getElementById('edit-property-heaters').value = property.heaters || '';
    document.getElementById('edit-property-crib').value = property.crib || '';
    document.getElementById('edit-property-crib-mattress').value = property.cribMattress || '';
    document.getElementById('edit-property-baby-chair').value = property.babyChair || '';
    document.getElementById('edit-property-wifi-frame').value = property.wifiFrame || '';
    document.getElementById('edit-property-recommendations-frame').value = property.recommendationsFrame || '';
    document.getElementById('edit-property-investment-frame').value = property.investmentFrame || '';
    document.getElementById('edit-property-breakfast-box').value = property.breakfastInABox || '';
    document.getElementById('edit-property-private-sign').value = property.privateSign || '';
    document.getElementById('edit-property-no-smoking-sign').value = property.noSmokingSign || '';
    document.getElementById('edit-property-no-junk-mail-sign').value = property.noJunkMailSign || '';
    document.getElementById('edit-property-al-ah-sign').value = property.alAhSign || '';
    document.getElementById('edit-property-keys-notice').value = property.keysNotice || '';
    document.getElementById('edit-property-wc-sign').value = property.wcSign || '';
    document.getElementById('edit-property-condominium').value = property.condominiumName || '';
    document.getElementById('edit-property-condominium-email').value = property.condominiumEmail || '';
    document.getElementById('edit-property-condominium-phone').value = property.condominiumContact || '';
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
        const [baseType, typology] = selectedType.split('-');
        const bedrooms = parseInt(typology.substring(1));
        propertyData = {
            name: document.getElementById('edit-property-name').value.trim(),
            location: document.getElementById('edit-property-location').value.trim(),
            type: baseType,
            typology,
            rooms: bedrooms
        };
    } else {
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
    const latVal = parseFloat(document.getElementById('edit-property-latitude').value);
    propertyData.latitude = isNaN(latVal) ? null : latVal;
    const lngVal = parseFloat(document.getElementById('edit-property-longitude').value);
    propertyData.longitude = isNaN(lngVal) ? null : lngVal;
    propertyData.wifiSpeed = document.getElementById('edit-property-wifi-speed').value || null;
    propertyData.wifiAirbnb = document.getElementById('edit-property-wifi-airbnb').value;
    propertyData.parkingSpot = document.getElementById('edit-property-parking-spot').value.trim() || null;
    propertyData.parkingFloor = document.getElementById('edit-property-parking-floor').value.trim() || null;
    propertyData.energySource = document.getElementById('edit-property-energy-source').value || null;
    propertyData.smartTv = document.getElementById('edit-property-smart-tv').value;
    propertyData.keyBoxCode = document.getElementById('edit-property-key-box-code').value.trim() || null;
    propertyData.airConditioning = parseInt(document.getElementById('edit-property-air-conditioning').value) || 0;
    propertyData.fans = parseInt(document.getElementById('edit-property-fans').value) || 0;
    propertyData.heaters = parseInt(document.getElementById('edit-property-heaters').value) || 0;
    propertyData.crib = parseInt(document.getElementById('edit-property-crib').value) || 0;
    propertyData.cribMattress = parseInt(document.getElementById('edit-property-crib-mattress').value) || 0;
    propertyData.babyChair = parseInt(document.getElementById('edit-property-baby-chair').value) || 0;
    propertyData.wifiFrame = document.getElementById('edit-property-wifi-frame').value;
    propertyData.recommendationsFrame = document.getElementById('edit-property-recommendations-frame').value;
    propertyData.investmentFrame = document.getElementById('edit-property-investment-frame').value;
    propertyData.breakfastInABox = document.getElementById('edit-property-breakfast-box').value;
    propertyData.privateSign = document.getElementById('edit-property-private-sign').value;
    propertyData.noSmokingSign = document.getElementById('edit-property-no-smoking-sign').value;
    propertyData.noJunkMailSign = document.getElementById('edit-property-no-junk-mail-sign').value;
    propertyData.alAhSign = document.getElementById('edit-property-al-ah-sign').value;
    propertyData.keysNotice = document.getElementById('edit-property-keys-notice').value;
    propertyData.wcSign = document.getElementById('edit-property-wc-sign').value;
    propertyData.condominiumName = document.getElementById('edit-property-condominium').value.trim() || null;
    propertyData.condominiumEmail = document.getElementById('edit-property-condominium-email').value.trim() || null;
    propertyData.condominiumContact = document.getElementById('edit-property-condominium-phone').value.trim() || null;
    propertyData.status = document.getElementById('edit-property-status').value;

    // Collect amenities (if amenity checkboxes exist)
    const amenityIds = [
        'edit-amenity-wifi', 'edit-amenity-pool', 'edit-amenity-garden',
        'edit-amenity-balcony', 'edit-amenity-ac', 'edit-amenity-kitchen',
        'edit-amenity-washing-machine', 'edit-amenity-sea-view'
    ];
    const amenities = [];
    amenityIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.checked) {
            amenities.push(id.replace('edit-amenity-', ''));
        }
    });
    propertyData.amenities = amenities;

    // Validate
    const errors = propertiesManager.validatePropertyData(propertyData);
    if (errors.length > 0) {
        errorElement.textContent = errors[0];
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
    console.log(`🚀 [INITIALIZATION] setupApp() called`);
    try {
        if (!dataManager || !uiManager) {
            console.error('❌ [INITIALIZATION] Required managers not available:', { dataManager: !!dataManager, uiManager: !!uiManager });
            return;
        }
        
        console.log(`👥 [INITIALIZATION] Setting up employee data listener...`);
        // Set up data change callback and start listening
        dataManager.setOnDataChangeCallback(() => {
            console.log(`🔄 [DATA CHANGE] Employee data changed, updating UI`);
            if (uiManager) uiManager.updateView();
        });
        
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

        // Check for settings updates when returning from settings page
        if (sessionStorage.getItem('propertySettingsUpdated') === 'true') {
          const updatedProperty = sessionStorage.getItem('currentProperty');
          if (updatedProperty && window.propertiesManager) {
            try {
              const property = JSON.parse(updatedProperty);
              // Update the property in Firestore
              await window.propertiesManager.updateProperty(property.id, property);
              console.log('Property settings updated successfully');
            } catch (error) {
              console.error('Error updating property settings:', error);
            }
          }
          // Clear the session storage
          sessionStorage.removeItem('propertySettingsUpdated');
          sessionStorage.removeItem('currentProperty');
        }
    } catch (error) {
        console.error('💥 Error initializing schedule app:', error);
        navigationManager.showSetupPage();
    }
}

async function initializeScheduleApp() {
    try {
        console.log('🔄 [INITIALIZATION] Schedule app requested...');
        
        if (!dataManager) {
            console.error('❌ DataManager not available');
            return;
        }
        
        // OPTIMIZATION: Instead of doing a fresh getDocs, check if we already have employee data
        console.log('📊 [OPTIMIZATION] Using existing employee data from DataManager instead of fresh query');
        const hasEmployees = dataManager.activeEmployees && dataManager.activeEmployees.length > 0;
        
        console.log(`📊 [OPTIMIZATION] Found employees in memory: ${hasEmployees} (${dataManager.activeEmployees?.length || 0} active employees)`);
        
        if (!hasEmployees) {
            console.log('📝 No employees found, showing setup page');
            navigationManager.showSetupPage();
        } else {
            console.log('👥 Employees found, initializing main schedule app');
            
            // Start listening for employee changes if not already listening
            if (!dataManager.unsubscribe) {
                console.log('🔄 [OPTIMIZATION] Starting employee listener for first time');
                dataManager.listenForEmployeeChanges();
            } else {
                console.log('✅ [OPTIMIZATION] Employee listener already active');
            }
            
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
        console.log("🔍 [FIRESTORE READ TRACKING] Starting migration check...");
        let totalReads = 0;
        
        // OPTIMIZATION: Use PropertiesManager data instead of separate query
        console.log("📊 [OPTIMIZATION] Waiting for PropertiesManager to load data instead of separate query...");
        
        // Wait for properties manager to load data (max 3 seconds)
        let waitCount = 0;
        while ((!propertiesManager || !propertiesManager.properties || propertiesManager.properties.length === 0) && waitCount < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        
        if (propertiesManager && propertiesManager.properties) {
            const existingProperties = propertiesManager.properties;
            console.log(`📊 [OPTIMIZATION] Using existing PropertiesManager data: ${existingProperties.length} properties (0 additional reads)`);
            
            // If there are already 10+ properties, assume migration was completed
            if (existingProperties.length >= 10) {
                console.log(`✅ [FIRESTORE READ TRACKING] Migration skipped - ${existingProperties.length} properties exist, Total additional reads: ${totalReads}`);
                return;
            }
        } else {
            console.log("⚠️ [OPTIMIZATION] PropertiesManager data not available, falling back to direct query");
            // Fallback to original method if properties manager data isn't available
            console.log("📊 [FIRESTORE READ] Reading shared properties collection...");
            const existingPropertiesRef = collection(db, "properties");
            console.log("📊 [FIRESTORE READ] About to call getDocs on properties collection...");
            const existingSnapshots = await getDocs(existingPropertiesRef);
            const migrationReadCount = existingSnapshots.docs.length || 1;
            totalReads += migrationReadCount;
            console.log(`📊 [FIRESTORE READ] getDocs completed - ${migrationReadCount} reads from properties collection`);
            console.log(`📊 [FIRESTORE READ] Properties metadata:`, {
                fromCache: existingSnapshots.metadata?.fromCache,
                source: existingSnapshots.metadata?.fromCache ? 'CACHE' : 'SERVER'
            });
            const existingProperties = existingSnapshots.docs.map(doc => doc.data());
            console.log(`📊 [FIRESTORE READ] Found ${existingProperties.length} existing properties (${totalReads} reads so far)`);
            
            // If there are already 10+ properties, assume migration was completed
            if (existingProperties.length >= 10) {
                console.log(`✅ [FIRESTORE READ TRACKING] Migration skipped - ${existingProperties.length} properties exist, Total reads: ${totalReads}`);
                return;
            }
        }
        
        // Check if we have permission to read users collection first
        try {
            console.log("🔐 [PERMISSION CHECK] Testing access to users collection...");
            const usersRef = collection(db, "users");
            const testQuery = await getDocs(usersRef);
            console.log(`✅ [PERMISSION CHECK] Access granted to users collection`);
        } catch (permissionError) {
            console.log(`❌ [PERMISSION CHECK] No access to users collection, skipping migration:`, permissionError.message);
            console.log(`📊 [FIRESTORE READ TRACKING] Migration skipped due to permissions - Total reads: ${totalReads}`);
            return;
        }
        
        // Get all user documents to check for properties in any user collection
        console.log("👥 [FIRESTORE READ] Reading users collection...");
        const usersRef = collection(db, "users");
        const userSnapshots = await getDocs(usersRef);
        totalReads += userSnapshots.docs.length || 1; // Count reads
        
        console.log(`👥 [FIRESTORE READ] Found ${userSnapshots.docs.length} user collections (${totalReads} reads so far)`);
        
        // Limit the number of user collections checked to prevent excessive reads
        const maxUsersToCheck = 10;
        const usersToCheck = userSnapshots.docs.slice(0, maxUsersToCheck);
        
        if (userSnapshots.docs.length > maxUsersToCheck) {
            console.log(`⚠️ Limited migration check to first ${maxUsersToCheck} users to prevent excessive reads`);
        }
        
        let totalMigrated = 0;
        
        for (const userDoc of usersToCheck) {
            const userIdToCheck = userDoc.id;
            
            try {
                // Check if this user has properties in their personal collection
                console.log(`🔍 [FIRESTORE READ] Reading properties for user: ${userIdToCheck}`);
                const userPropertiesRef = collection(db, `users/${userIdToCheck}/properties`);
                const propertySnapshots = await getDocs(userPropertiesRef);
                totalReads += propertySnapshots.docs.length || 1; // Count reads
                
                console.log(`📋 [FIRESTORE READ] User ${userIdToCheck}: ${propertySnapshots.docs.length} properties (${totalReads} reads so far)`);
                
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

// Property Migration Functions - Available globally (DISABLED to prevent excessive reads)
window.migratePropertiesToShared = async function() {
    console.warn("⚠️ [MIGRATION DISABLED] This function has been disabled to prevent excessive Firestore reads.");
    console.warn("⚠️ If you need to migrate properties, please use the auto-migration feature that runs once per session.");
    return { success: false, error: "Migration disabled to prevent excessive reads" };
    
    /* COMMENTED OUT TO PREVENT EXCESSIVE READS
    if (!db) {
        console.error("❌ Database not initialized. Please log in first.");
        return;
    }
    
    console.log("🔄 Starting property migration to shared collection...");
    */
};

// Check what properties would be migrated (dry run) - DISABLED
window.checkPropertiesForMigration = async function() {
    console.warn("⚠️ [DRY RUN DISABLED] This function has been disabled to prevent excessive Firestore reads.");
    console.warn("⚠️ Use the console logs from auto-migration instead for information about migrations.");
    return { success: false, error: "Dry run disabled to prevent excessive reads" };
    
    /* COMMENTED OUT TO PREVENT EXCESSIVE READS
    if (!db) {
        console.error("❌ Database not initialized. Please log in first.");
        return;
    }
    
    console.log("🔍 Checking properties for migration (dry run)...");
    */
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