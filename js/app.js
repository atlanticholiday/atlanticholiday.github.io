import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
import { ReservationsManager } from './reservations-manager.js';
import { AccessManager } from './access-manager.js';
import { RoleManager } from './role-manager.js';
import { RnalManager } from './rnal-manager.js';
import { SafetyManager } from './safety-manager.js';
import { ChecklistsManager } from './checklists-manager.js';
import { VehiclesManager } from './vehicles-manager.js';
import { OwnersManager } from './owners-manager.js';
import { VisitsManager } from './visits-manager.js';
import { CleaningBillsManager } from './cleaning-bills-manager.js';

// --- GLOBAL VARIABLES & CONFIG ---
let db, auth, userId;
let unsubscribe = null;
let migrationCompleted = false; // Flag to prevent repeated migration

// Initialize managers
let dataManager, uiManager, pdfGenerator, holidayCalculator, eventManager, navigationManager, propertiesManager, operationsManager, reservationsManager, accessManager, roleManager, rnalManager, safetyManager, checklistsManager, vehiclesManager, ownersManager, visitsManager, cleaningBillsManager;

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
        // Initialize access manager for allowed email checks
        accessManager = new AccessManager(db);
        window.accessManager = accessManager;
        roleManager = new RoleManager(db);
        window.roleManager = roleManager;
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
        // Initialize Visits manager early so it can inject its page and landing button before nav listeners are wired
        visitsManager = new VisitsManager(db, userId);
        window.visitsManager = visitsManager;
        try { visitsManager.ensureDomScaffold?.(); } catch {}
        // Initialize Cleaning Bills manager early to inject page and landing button before nav listeners are wired
        cleaningBillsManager = new CleaningBillsManager();
        window.cleaningBillsManager = cleaningBillsManager;
        try { cleaningBillsManager.ensureDomScaffold?.(); } catch {}
        // Initialize Checklists manager (localStorage-backed + Firestore sync)
        checklistsManager = new ChecklistsManager(userId);
        window.checklistsManager = checklistsManager;
        // Provide Firestore DB so it can start syncing once user is set
        checklistsManager.setDatabase(db);
        // Initialize Vehicles manager (Firestore user-scoped)
        vehiclesManager = new VehiclesManager(db, userId);
        window.vehiclesManager = vehiclesManager;
        // Initialize Owners manager (shared owners collection)
        ownersManager = new OwnersManager(db, userId);
        window.ownersManager = ownersManager;
        
        // Initialize RNAL manager with error handling
        try {
            rnalManager = new RnalManager(db, userId);
        } catch (error) {
            console.warn('RNAL Manager initialization failed:', error);
            rnalManager = null;
        }

        // Setup login event listeners immediately
        eventManager.setupLoginListeners();
        
        // Setup navigation listeners (after Visits injected its button)
        navigationManager.setupNavigationListeners();
        
        // Setup global event listeners
        setupGlobalEventListeners();
        // Setup application event listeners for schedule page
        eventManager.setupAppEventListeners();
        
        // Render Checklists when page is opened
        document.addEventListener('checklistsPageOpened', () => {
            try { checklistsManager.render(); } catch (e) { console.warn('Checklists render failed:', e); }
        });
        // Vehicles page render is handled inside VehiclesManager on event, but keep a light touch hook if needed
        document.addEventListener('vehiclesPageOpened', () => {
            try { vehiclesManager?.render(); } catch (e) { console.warn('Vehicles render failed:', e); }
        });
        // Owners page render is handled inside OwnersManager on event, but keep a light touch hook if needed
        document.addEventListener('ownersPageOpened', () => {
            try { ownersManager?.render(); } catch (e) { console.warn('Owners render failed:', e); }
        });
        // Visits page render is also handled inside VisitsManager on event; keep a light touch hook
        document.addEventListener('visitsPageOpened', () => {
            try { visitsManager?.render(); } catch (e) { console.warn('Visits render failed:', e); }
        });
        // Cleaning Bills page render
        document.addEventListener('cleaningBillsPageOpened', () => {
            try { cleaningBillsManager?.render(); } catch (e) { console.warn('Cleaning Bills render failed:', e); }
        });

        // User Management Page: populate allowed emails list when opened
        document.addEventListener('userManagementPageOpened', async () => {
            // Fetch roles definitions
            const roles = await roleManager.listRoles();
            // Fetch user emails
            const emails = await accessManager.listEmails();
            const listEl = document.getElementById('user-list');
            if (listEl) {
                listEl.innerHTML = '';
                emails.forEach(async (email) => {
                    const userRoles = await accessManager.getRoles(email);
                    const li = document.createElement('li');
                    li.className = 'flex justify-between items-center mb-2';
                    // Roles checkboxes
                    const rolesContainer = document.createElement('span');
                    rolesContainer.className = 'mx-4';
                    roles.forEach(role => {
                        const cb = document.createElement('input');
                        cb.type = 'checkbox';
                        cb.id = `role-${email}-${role.key}`;
                        cb.value = role.key;
                        cb.checked = userRoles.includes(role.key);
                        cb.addEventListener('change', async () => {
                            const selected = Array.from(rolesContainer.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
                            await accessManager.setRoles(email, selected);
                        });
                        const lbl = document.createElement('label');
                        lbl.htmlFor = cb.id;
                        lbl.textContent = role.key;
                        rolesContainer.appendChild(cb);
                        rolesContainer.appendChild(lbl);
                    });
                    // Email text
                    const span = document.createElement('span');
                    span.textContent = email;
                    // Buttons container
                    const btnGroup = document.createElement('span');
                    // Reset password button
                    const resetBtn = document.createElement('button');
                    resetBtn.textContent = 'Reset Password';
                    resetBtn.className = 'text-sm text-blue-600 mr-2 hover:underline';
                    resetBtn.addEventListener('click', async () => {
                        try {
                            await sendPasswordResetEmail(auth, email);
                            alert(`Password reset email sent to ${email}`);
                        } catch (err) {
                            console.error(err);
                            alert(`Failed to send reset email: ${err.message}`);
                        }
                    });
                    // Delete user access button
                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = 'Delete';
                    deleteBtn.className = 'text-sm text-red-600 hover:underline';
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm(`Remove access for ${email}?`)) return;
                        try {
                            await accessManager.removeEmail(email);
                            // Refresh the list
                            document.dispatchEvent(new CustomEvent('userManagementPageOpened'));
                        } catch (err) {
                            console.error(err);
                            alert(`Failed to remove user: ${err.message}`);
                        }
                    });
                    btnGroup.appendChild(resetBtn);
                    btnGroup.appendChild(deleteBtn);
                    li.appendChild(span);
                    li.insertBefore(rolesContainer, btnGroup);
                    li.appendChild(btnGroup);
                    listEl.appendChild(li);
                });
            }
        });
        // Handle creation of new access entries
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', async () => {
                const emailInput = document.getElementById('new-user-email');
                const passwordInput = document.getElementById('new-user-password');
                const listEl = document.getElementById('user-list');
                const errorEl = document.getElementById('create-user-error');
                const email = emailInput?.value.trim();
                const password = passwordInput?.value;
                errorEl.textContent = '';
                if (!email) {
                    errorEl.textContent = 'Please enter a valid email address.';
                    return;
                }
                if (!password) {
                    errorEl.textContent = 'Please enter a password.';
                    return;
                }
                try {
                    // Create Auth user
                    await createUserWithEmailAndPassword(auth, email, password);
                    // Then add to Firestore allowed list
                    await accessManager.addEmail(email);
                    emailInput.value = '';
                    passwordInput.value = '';
                    const emails = await accessManager.listEmails();
                    if (listEl) {
                        listEl.innerHTML = '';
                        emails.forEach(e => {
                            const li = document.createElement('li');
                            li.textContent = e;
                            listEl.appendChild(li);
                        });
                    }
                } catch (err) {
                    errorEl.textContent = err.message;
                }
            });
        }
        // Handle creation of new role entries
        const addRoleBtn = document.getElementById('add-role-btn');
        if (addRoleBtn) {
            addRoleBtn.addEventListener('click', async () => {
                const keyInput = document.getElementById('new-role-key');
                const titleInput = document.getElementById('new-role-title');
                const errorEl = document.getElementById('add-role-error');
                const key = keyInput.value.trim();
                const title = titleInput.value.trim();
                errorEl.textContent = '';
                if (!key || !title) {
                    errorEl.textContent = 'Please specify both key and title.';
                    return;
                }
                try {
                    await roleManager.addRole(key, title);
                    keyInput.value = '';
                    titleInput.value = '';
                    // Refresh lists
                    document.dispatchEvent(new CustomEvent('userManagementPageOpened'));
                } catch (err) {
                    errorEl.textContent = err.message;
                }
            });
        }

        // Setup authentication listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Seed or verify allowed emails for access control
                let allow = true;
                try {
                    const emails = await accessManager.listEmails();
                    const userEmailKey = user.email.toLowerCase();
                    if (emails.length === 0) {
                        // First-time login: seed allowed list
                        await accessManager.addEmail(user.email);
                    } else if (!emails.includes(userEmailKey)) {
                        console.warn(`Access denied for user: ${user.email}`);
                        allow = false;
                    }
                } catch (err) {
                    // If Firestore check fails, allow login to avoid lockout
                    console.warn('AccessManager error, skipping email check:', err);
                }
                if (!allow) {
                    await signOut(auth);
                    document.getElementById('login-error').textContent = 'Access not granted';
                    return;
                }
                userId = user.uid;
                console.log(`🔐 [INITIALIZATION] User logged in: ${userId}`);
                // Bind user to Checklists manager for per-user persistence key
                if (checklistsManager) {
                    checklistsManager.setUser(userId);
                }
                // Bind user to Vehicles manager for per-user Firestore path
                if (vehiclesManager) {
                    vehiclesManager.setUser(userId);
                }
                // Bind user to Owners manager (for any user-scoped logic if added later)
                if (ownersManager) {
                    ownersManager.setUser(userId);
                }
                // Bind user to Visits manager (for per-user Firestore path)
                if (visitsManager) {
                    visitsManager.setUser(userId);
                }
                
                // Initialize properties manager for shared properties
                console.log(`📋 [INITIALIZATION] Creating PropertiesManager...`);
                propertiesManager = new PropertiesManager(db);
                window.propertiesManager = propertiesManager;
                
                console.log(`⚙️ [INITIALIZATION] Creating OperationsManager...`);
                operationsManager = new OperationsManager(db, userId); // Initialize operations manager
                console.log(`🔖 [INITIALIZATION] Creating ReservationsManager...`);
                reservationsManager = new ReservationsManager(db, userId);
                
                console.log(`🔥 [INITIALIZATION] Creating SafetyManager...`);
                safetyManager = new SafetyManager(db, propertiesManager);
                window.safetyManager = safetyManager;
                
                // Update RNAL manager with authenticated user credentials
                if (rnalManager) {
                    try {
                        rnalManager.setDatabase(db, userId);
                    } catch (error) {
                        console.warn('RNAL Manager update failed:', error);
                    }
                }
                
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
                if (checklistsManager) {
                    // Reset user to stop any Firestore sync
                    try { checklistsManager.setUser(null); } catch {}
                }
                if (vehiclesManager) {
                    try { vehiclesManager.stopListening(); vehiclesManager.setUser(null); } catch {}
                }
                if (ownersManager) {
                    try { ownersManager.stopListening(); ownersManager.setUser(null); } catch {}
                }
                if (visitsManager) {
                    try { visitsManager.stopListening(); visitsManager.setUser(null); } catch {}
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
        if (e.target.id === 'sign-out-btn' || e.target.id === 'landing-sign-out-btn' || e.target.id === 'properties-sign-out-btn' || e.target.id === 'operations-sign-out-btn' || e.target.id === 'reservations-sign-out-btn' || e.target.id === 'vehicles-sign-out-btn' || e.target.id === 'owners-sign-out-btn') {
            signOut(auth);
        }
    });
    // Also listen for custom navigation sign-out events
    document.addEventListener('signOutRequested', () => {
        signOut(auth);
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
            // Ensure schedule view toggle listeners are bound
            eventManager.setupAppEventListeners();
        }, 100); // Small delay to ensure DOM is ready
    });

    document.addEventListener('reservationsPageOpened', () => {
        if (reservationsManager) {
            console.log('Reservations page opened, initializing...');
            reservationsManager.initializeEventListeners();
        }
    });

    document.addEventListener('safetyPageOpened', () => {
        if (safetyManager) {
            console.log('Safety page opened, initializing...');
            safetyManager.initialize();
        }
    });

    // Handle opening property edit modal from safety dashboard
    document.addEventListener('openPropertyEdit', (event) => {
        const propertyId = event.detail.propertyId;
        if (propertiesManager && propertyId) {
            console.log('Opening property edit modal for:', propertyId);
            
            // Find the property
            const property = propertiesManager.properties.find(p => p.id === propertyId);
            if (property) {
                // Trigger the edit modal - this would normally be done by the properties manager
                // We'll dispatch an event that the properties page can listen for
                setTimeout(() => {
                    const editEvent = new CustomEvent('triggerPropertyEdit', { detail: { property } });
                    document.dispatchEvent(editEvent);
                }, 200);
            }
        }
    });

    // All Info page initializer
    document.addEventListener('allInfoPageOpened', () => initAllInfoUI());
    function initAllInfoUI() {
        const propertiesRaw = window.propertiesManager?.properties || [];
        const properties = [...propertiesRaw].sort((a,b)=> (a.name ?? '').localeCompare(b.name ?? '', undefined,{numeric:true,sensitivity:'base'}));
        const nav = document.getElementById('allinfo-nav');
        const content = document.getElementById('allinfo-content');
        if (!nav || !content) return;
        nav.innerHTML = '';
        content.innerHTML = '';
        const categories = [
            // Core basics
            { title: 'Basic Information', slug: 'basic-info-edit', fields: ['location','type','typology','rooms','bathrooms','floor'], icon: 'fas fa-info-circle' },
            { title: 'Maps & Location', slug: 'maps-location', fields: ['googleMapsLink','garbageLocationLink','garbageFloor'], icon: 'fas fa-map-marker-alt' },
            { title: 'Access & Parking', slug: 'access-parking', fields: ['keyBoxCode','parkingSpot','parkingFloor'], icon: 'fas fa-parking' },

            // Guest-facing content
            { title: 'Media & Content', slug: 'media-content', fields: ['checkinVideos','bookingDescriptionStatus','selfCheckinInstructions'], icon: 'fas fa-video' },
            { title: 'Google Drive', slug: 'google-drive', fields: ['googleDriveEnabled','googleDriveLink','scannedDocsLink'], icon: 'fab fa-google-drive' },
            { title: 'Recommendations', slug: 'recommendations', fields: ['recommendationsLink','recommendationsEditLink'], icon: 'fas fa-star' },
            { title: 'Frames', slug: 'frames', fields: ['wifiFrame','recommendationsFrame','investmentFrame'], icon: 'fas fa-border-all' },
            { title: 'Signage', slug: 'signage', fields: ['privateSign','noSmokingSign','noJunkMailSign','alAhSign','keysNotice','wcSign'], icon: 'fas fa-sign' },

            // Operations & utilities
            { title: 'Equipment', slug: 'equipment', fields: ['airConditioning','fans','heaters','crib','cribMattress','babyChair'], icon: 'fas fa-toolbox' },
            { title: 'Services & Extras', slug: 'services-extras', fields: ['breakfastBox','poolMaintenanceDay','poolMaintenanceNotes'], icon: 'fas fa-concierge-bell' },
            { title: 'Connectivity & Utilities', slug: 'connectivity-utilities', fields: ['wifiSpeed','internetProvider','energySource'], icon: 'fas fa-wifi' },

            // Platforms and compliance
            { title: 'Online Services', slug: 'online-services', fields: ['onlineComplaintBooksEnabled','onlineComplaintBooksEmail','onlineComplaintBooksPassword','airbnbLinksStatus'], icon: 'fas fa-globe' },
            { title: 'Legal & Compliance', slug: 'legal-compliance', fields: ['contractsStatus','complaintBooksStatus','statisticsStatus','sefStatus','touristTaxInstructions'], icon: 'fas fa-gavel' },
            { title: 'Safety Maintenance', slug: 'safety-maintenance', fields: ['fireExtinguisherExpiration','fireExtinguisherLocation','fireExtinguisherNotes','firstAidStatus','firstAidLastChecked','firstAidNotes'], icon: 'fas fa-shield-alt' },

            // Admin and building
            { title: 'Owner', slug: 'owner', fields: ['ownerFirstName','ownerLastName','ownerVatNumber','ownerPropertyAddress','ownerContact'], icon: 'fas fa-user-tie' },
            { title: 'Contacts', slug: 'contacts', fields: ['cleaningCompanyContact','cleaningCompanyPrice','accountingContact'], icon: 'fas fa-address-book' },
            { title: 'Condominium Information', slug: 'condominium-info', fields: ['condominiumName','condominiumEmail','condominiumPhone'], icon: 'fas fa-building' }
        ];
        // Category navigation buttons
        categories.forEach((cat, idx) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<i class="${cat.icon}"></i><span>${cat.title}</span>`;
            btn.className = 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100';
            btn.dataset.idx = idx; // store index for filtering
            if (idx === 0) btn.classList.add('bg-gray-100');
            btn.onclick = () => {
                Array.from(nav.children).forEach(c => c.classList.remove('bg-gray-100'));
                btn.classList.add('bg-gray-100');
                renderCategory(parseInt(btn.dataset.idx));
            };
            nav.appendChild(btn);
        });
        // Create search bars container for side-by-side layout
        const searchBarsContainer = document.createElement('div');
        searchBarsContainer.className = 'search-bars-container';
        
        // -------- Property filter input --------
        const filterWrapper = document.createElement('div');
        filterWrapper.className = 'flex-1';
        const propFilterLabel = document.createElement('label');
        propFilterLabel.textContent = 'Filter properties';
        propFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';
        const filterInput = document.createElement('input');
        filterInput.id = 'allinfo-filter';
        filterInput.type = 'text';
        filterInput.placeholder = 'Filter properties...';
        filterInput.className = 'px-3 py-2 border rounded-md w-full';
        filterWrapper.appendChild(propFilterLabel);
        filterWrapper.appendChild(filterInput);
        
        // -------- Category search field --------
        const catSearchWrapper = document.createElement('div');
        catSearchWrapper.id = 'allinfo-cat-search-wrapper';
        const catSearch = document.createElement('input');
        catSearch.id = 'allinfo-cat-search';
        catSearch.type = 'text';
        catSearch.placeholder = 'Search categories...';
        catSearchWrapper.appendChild(catSearch);
        
        // Add both search bars to the container
        searchBarsContainer.appendChild(filterWrapper);
        searchBarsContainer.appendChild(catSearchWrapper);
        
        // Insert the search container before the navigation
        nav.parentNode.insertBefore(searchBarsContainer, nav);
        
        // Attach filter to dedicated wrapper (for styling compatibility)
        const filterParent = document.getElementById('allinfo-filter-wrapper');
        if (filterParent) { 
            filterParent.innerHTML = ''; 
            filterParent.appendChild(searchBarsContainer); 
        }
        
        catSearch.addEventListener('input', e => {
            const term = e.target.value.toLowerCase();
            Array.from(nav.children).forEach(btn => {
                const idx = parseInt(btn.dataset.idx);
                const cat = categories[idx];
                const match = btn.textContent.toLowerCase().includes(term) ||
                              cat.fields.some(f => f.toLowerCase().includes(term));
                btn.style.display = match ? '' : 'none';
            });
            // auto-select first visible category if current active hidden
            if (!Array.from(nav.children).some(btn => btn.classList.contains('bg-gray-100') && btn.style.display !== 'none')) {
                const firstVisible = Array.from(nav.children).find(btn => btn.style.display !== 'none');
                if (firstVisible) firstVisible.click();
            }
        });
        // Table container
        const tableContainer = document.getElementById('allinfo-content');
        if (tableContainer) { tableContainer.innerHTML = ''; }
        // Sorting helper
        function sortTable(table, colIndex, asc) {
            const tbody = table.querySelector('tbody');
            Array.from(tbody.querySelectorAll('tr')).sort((a,b) => {
                const aCell = a.cells[colIndex];
                const bCell = b.cells[colIndex];
                const aSort = aCell?.dataset?.sort;
                const bSort = bCell?.dataset?.sort;
                if (aSort !== undefined || bSort !== undefined) {
                    const av = parseFloat(aSort ?? '0');
                    const bv = parseFloat(bSort ?? '0');
                    return asc ? (av - bv) : (bv - av);
                }
                const aText = aCell.textContent.trim();
                const bText = bCell.textContent.trim();
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
                th.onclick = () => {
                    const asc = !th.asc;
                    th.asc = asc;
                    // Remove previous sort classes
                    tr.querySelectorAll('th').forEach(t => t.classList.remove('asc', 'desc'));
                    // Apply new sort class for styling icon rotation/color
                    th.classList.add(asc ? 'asc' : 'desc');
                    sortTable(table, i, asc);
                };
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
                const eurFmt = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
                displayFields.forEach(key=>{
                    const td = document.createElement('td');
                    td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-700';
                    if (key === 'cleaningCompanyPrice') {
                        const val = parseFloat(prop[key]);
                        const isNum = Number.isFinite(val);
                        td.textContent = isNum ? eurFmt.format(val) : '';
                        if (isNum) td.dataset.sort = String(val);
                    } else {
                        td.textContent = prop[key] ?? '';
                    }
                    row.appendChild(td);
                });
                const actionTd=document.createElement('td'); actionTd.className='px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-4';
                [
                    { icon: 'fas fa-edit', cls: 'text-blue-600', fn: () => {
                        // Store the selected property in sessionStorage so the settings page can load it accurately
                        try {
                            sessionStorage.setItem('currentProperty', JSON.stringify(prop));
                        } catch (err) {
                            console.warn('Failed to store property in sessionStorage:', err);
                        }
                        window.location.href = `property-settings.html?propertyId=${prop.id}#section-${categories[idx].slug}`;
                    }, title: 'Edit' },
                    
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
            // Clear the safety flag if it was set
            editPropertyModal.dataset.fromSafety = 'false';
        });
    }

    if (editPropertyCancelBtn) {
        editPropertyCancelBtn.addEventListener('click', () => {
            editPropertyModal.classList.add('hidden');
            // Clear the safety flag if it was set
            editPropertyModal.dataset.fromSafety = 'false';
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
            // If opened from safety page, refresh safety tables
            const modal = document.getElementById('edit-property-modal');
            if (modal.dataset.fromSafety === 'true') {
                if (window.safetyManager) {
                    window.safetyManager.renderSafetyTables();
                }
                // Clear the flag
                modal.dataset.fromSafety = 'false';
            }
        });
    }

    // Close modal when clicking outside
    if (editPropertyModal) {
        editPropertyModal.addEventListener('click', (e) => {
            if (e.target === editPropertyModal) {
                editPropertyModal.classList.add('hidden');
                // Clear the safety flag if it was set
                editPropertyModal.dataset.fromSafety = 'false';
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
          window.location.href = `property-settings.html?propertyId=${propertyId}`;
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
        console.log('🔧 [EDIT PROPERTY] Called with propertyId:', propertyId);
        console.log('🔧 [EDIT PROPERTY] Available properties:', propertiesManager.properties?.length || 0);
        
        // Redirect to standalone settings page for full editing
        const property = propertiesManager.getPropertyById(propertyId);
        console.log('🔧 [EDIT PROPERTY] Found property:', property);
        
        if (property) {
            // Clear any existing property data first to avoid conflicts
            sessionStorage.removeItem('currentProperty');
            
            // Store the exact property with matching ID
            const propertyToStore = { ...property };
            sessionStorage.setItem('currentProperty', JSON.stringify(propertyToStore));
            console.log('🔧 [EDIT PROPERTY] ✅ Stored property in sessionStorage:', {
                id: propertyToStore.id,
                name: propertyToStore.name,
                stored: JSON.parse(sessionStorage.getItem('currentProperty'))
            });
            
            window.location.href = `property-settings.html?propertyId=${propertyId}`;
        } else {
            console.error('🔧 [EDIT PROPERTY] Property not found for ID:', propertyId);
            console.log('🔧 [EDIT PROPERTY] Available property IDs:', propertiesManager.properties?.map(p => p.id) || []);
            alert('Property not found. Please try again.');
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