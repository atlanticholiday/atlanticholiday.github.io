import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence, collection, doc, addDoc, onSnapshot, deleteDoc, setLogLevel, getDoc, setDoc, updateDoc, deleteField, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { Config } from '../core/config.js';
import { i18n } from '../core/i18n.js';
import { AccessManager } from '../features/admin/access-manager.js';
import { RoleManager } from '../features/admin/role-manager.js';
import { UserManagementController } from '../features/admin/user-management-controller.js';
import { ChecklistsManager } from '../features/operations/checklists-manager.js';
import { CleaningBillsManager } from '../features/operations/cleaning-bills-manager.js';
import { CommissionCalculatorManager } from '../features/operations/commission-calculator-manager.js';
import { OperationsManager } from '../features/operations/operations-manager.js';
import { OwnersManager } from '../features/operations/owners-manager.js';
import { ReservationsManager } from '../features/operations/reservations-manager.js';
import { RnalManager } from '../features/operations/rnal-manager.js';
import { SafetyManager } from '../features/operations/safety-manager.js';
import { VehiclesManager } from '../features/operations/vehicles-manager.js';
import { VisitsManager } from '../features/operations/visits-manager.js';
import { WelcomePackManager } from '../features/operations/welcome-pack-manager.js';
import '../features/properties/allinfo-bulk-edit.js';
import '../features/properties/allinfo-seq-edit.js';
import '../features/properties/allinfo-accordion-edit.js';
import { PropertiesManager } from '../features/properties/properties-manager.js';
import { PropertiesDashboardController } from '../features/properties/properties-dashboard-controller.js';
import { checkAndMigrateUserProperties, registerPropertyMigrationDebugTools } from '../features/properties/property-migration-tools.js';
import { DataManager } from '../features/scheduling/data-manager.js';
import { EventManager } from '../features/scheduling/event-manager.js';
import { HolidayCalculator } from '../features/scheduling/holiday-calculator.js';
import { NavigationManager } from '../features/scheduling/navigation-manager.js';
import { PDFGenerator } from '../features/scheduling/pdf-generator.js';
import { ScheduleManager } from '../features/scheduling/schedule-manager.js';
import { StaffManager } from '../features/scheduling/staff-manager.js';
import { UIManager } from '../features/scheduling/ui-manager.js';
import { canonicalizeEmail } from '../shared/email.js';

// --- GLOBAL VARIABLES & CONFIG ---
let db, auth, userId;
let unsubscribe = null;
let migrationCompleted = false; // Flag to prevent repeated migration
let timeClockAutoOpenedForUser = false;
let unsubscribePendingAccessLinkSync = null;
let pendingMigrationTimeoutId = null;

// Initialize managers
let dataManager, uiManager, pdfGenerator, eventManager, navigationManager, propertiesManager, propertyDashboardController, operationsManager, reservationsManager, accessManager, roleManager, rnalManager, safetyManager, checklistsManager, vehiclesManager, ownersManager, visitsManager, cleaningBillsManager, welcomePackManager, commissionCalculatorManager, scheduleManager, staffManager;

async function createSecondaryAuthUser(email, password) {
    const secondaryAppName = `secondary-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const secondaryApp = initializeApp(Config.firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        await createUserWithEmailAndPassword(secondaryAuth, email, password);
        await signOut(secondaryAuth).catch(() => {});
    } finally {
        await deleteApp(secondaryApp).catch(() => {});
    }
}

async function ensureEmployeeForAccess({ name, email, notes = '' } = {}) {
    if (!dataManager || !name || !email) {
        return null;
    }

    const normalizedEmail = canonicalizeEmail(email);
    const existingEmployee = dataManager.getActiveEmployees().find((employee) => {
        return canonicalizeEmail(employee?.email) === normalizedEmail;
    });

    if (existingEmployee) {
        await accessManager?.syncEmployeeLink?.(email, existingEmployee).catch((error) => {
            console.warn('Failed to sync existing employee access link:', error);
        });
        return existingEmployee;
    }

    const createdEmployee = await dataManager.addEmployee(name, '', [1, 2, 3, 4, 5]);
    await dataManager.updateEmployee(createdEmployee.id, {
        name,
        workDays: [1, 2, 3, 4, 5],
        staffNumber: '',
        email,
        notes,
        defaultShift: '9:00-18:00'
    });

    await accessManager?.syncEmployeeLink?.(email, {
        id: createdEmployee.id,
        name,
        email,
        isArchived: false
    }).catch((error) => {
        console.warn('Failed to sync created employee access link:', error);
    });

    return createdEmployee;
}

async function syncEmployeeAccessLinks() {
    if (!accessManager || !dataManager?.hasPrivilegedRole?.()) {
        return;
    }

    const users = await accessManager.listEmails().catch((error) => {
        console.warn('Failed to list access emails for employee-link sync:', error);
        return [];
    });
    if (!users.length) {
        return;
    }

    const employeesByEmail = new Map();
    [
        ...dataManager.getArchivedEmployees(),
        ...dataManager.getActiveEmployees()
    ].forEach((employee) => {
        const normalizedEmail = canonicalizeEmail(employee?.email);
        if (normalizedEmail) {
            employeesByEmail.set(normalizedEmail, employee);
        }
    });

    await Promise.all(users.map((email) => {
        return accessManager.syncEmployeeLink(
            email,
            employeesByEmail.get(canonicalizeEmail(email)) || null
        );
    }));
}

function scheduleInitialEmployeeAccessLinkSync() {
    if (!dataManager || !accessManager) {
        return;
    }

    unsubscribePendingAccessLinkSync?.();
    unsubscribePendingAccessLinkSync = null;

    const attemptSync = async () => {
        if (!dataManager.hasPrivilegedRole()) {
            return false;
        }

        const hasEmployees = dataManager.getActiveEmployees().length > 0 || dataManager.getArchivedEmployees().length > 0;
        if (!hasEmployees) {
            return false;
        }

        await syncEmployeeAccessLinks();
        return true;
    };

    const finalizeSyncAttempt = () => {
        attemptSync()
            .then((didSync) => {
                if (didSync && unsubscribePendingAccessLinkSync) {
                    unsubscribePendingAccessLinkSync();
                    unsubscribePendingAccessLinkSync = null;
                }
            })
            .catch((error) => {
                console.warn('Failed to sync stored employee access links:', error);
            });
    };

    unsubscribePendingAccessLinkSync = dataManager.subscribeToDataChanges(finalizeSyncAttempt);
    finalizeSyncAttempt();
}

function syncAccessModeUi() {
    if (!dataManager) return;

    const employee = dataManager.getCurrentUserEmployee();
    const clockOnlyMode = dataManager.isClockOnlyUser();
    const stationMode = dataManager.isTimeClockStationUser();
    const boardOnlyMode = dataManager.isVacationBoardOnlyUser();
    const canAccessVacationBoard = dataManager.canAccessVacationBoard();
    const limitedTimeClockMode = clockOnlyMode || stationMode;
    const landingPage = document.getElementById('landing-page');
    if (landingPage) {
        landingPage.dataset.accessMode = stationMode ? 'station' : (clockOnlyMode ? 'clock-only' : 'manager');
    }

    const dashboardButtons = [
        'go-to-schedule-btn',
        'go-to-vehicles-btn',
        'go-to-welcome-packs-btn',
        'go-to-staff-btn',
        'go-to-properties-btn',
        'go-to-allinfo-btn',
        'go-to-rnal-btn',
        'go-to-checklists-btn',
        'go-to-owners-btn',
        'go-to-safety-btn',
        'go-to-reservations-btn',
        'go-to-user-management-btn',
        'go-to-inventory-btn'
    ];

    dashboardButtons.forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (button) {
            const shouldHide = buttonId === 'go-to-schedule-btn'
                ? (stationMode || (!canAccessVacationBoard && limitedTimeClockMode))
                : limitedTimeClockMode;
            button.classList.toggle('hidden', shouldHide);
        }
    });

    const scheduleButton = document.getElementById('go-to-schedule-btn');
    const scheduleButtonTitle = document.getElementById('go-to-schedule-title');
    const scheduleButtonDescription = document.getElementById('go-to-schedule-description');
    if (scheduleButtonTitle) {
        scheduleButtonTitle.textContent = boardOnlyMode ? 'Vacation Board' : 'Work Schedule';
    }
    if (scheduleButtonDescription) {
        scheduleButtonDescription.textContent = boardOnlyMode
            ? 'Check team vacations in a read-only board.'
            : 'Plan staff schedules and holidays.';
    }
    if (scheduleButton) {
        scheduleButton.dataset.accessMode = boardOnlyMode ? 'vacation-board' : 'full';
    }

    const moreToolsToggle = document.getElementById('toggle-more-tools-btn');
    const moreToolsSection = document.getElementById('more-tools-section');
    if (moreToolsToggle) {
        moreToolsToggle.classList.toggle('hidden', limitedTimeClockMode);
    }
    if (moreToolsSection && limitedTimeClockMode) {
        moreToolsSection.classList.add('hidden');
    }

    const heroTitle = document.getElementById('landing-hero-title') || document.querySelector('#landing-page .hero-title');
    const heroSubtitle = document.getElementById('landing-hero-subtitle') || document.querySelector('#landing-page .hero-subtitle');
    if (heroTitle) {
        heroTitle.textContent = stationMode
            ? 'Shared time clock station'
            : clockOnlyMode
            ? (employee ? `${employee.name}, clock in for your shift` : 'Clock in and out for your shift')
            : 'Welcome to your operations hub';
    }
    if (heroSubtitle) {
        heroSubtitle.textContent = stationMode
            ? 'Use the shared tablet picker to select any colleague and record shifts, breaks, and clock-out times.'
            : clockOnlyMode
            ? 'Use the digital time clock to record shifts, breaks, and check the team vacation board before planning leave.'
            : 'Manage properties, schedules, safety and more, all in one beautiful place.';
    }

    const timeClockBackButton = document.getElementById('back-to-landing-from-time-clock-btn');
    if (timeClockBackButton) {
        timeClockBackButton.classList.toggle('hidden', limitedTimeClockMode);
    }

    const scheduleBackButton = document.getElementById('back-to-landing-from-schedule-btn');
    if (scheduleBackButton) {
        scheduleBackButton.dataset.targetPage = boardOnlyMode ? 'timeClock' : 'landing';
        scheduleBackButton.title = boardOnlyMode ? 'Back to time clock' : 'Back to landing';
    }

    if (limitedTimeClockMode && navigationManager && !timeClockAutoOpenedForUser) {
        navigationManager.showTimeClockPage();
        timeClockAutoOpenedForUser = true;
    }
}

function routeCurrentUserAccess() {
    if (!navigationManager || !dataManager) return;

    if (dataManager.isClockOnlyUser() || dataManager.isTimeClockStationUser()) {
        navigationManager.showTimeClockPage();
        timeClockAutoOpenedForUser = true;
        return;
    }

    if (!navigationManager.getCurrentPage() || navigationManager.getCurrentPage() === 'login') {
        navigationManager.showLandingPage();
    }
}

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

        // Initialize i18n (internationalization) system
        await i18n.init();
        i18n.setupLanguageSwitcher();


        // Add global Firestore read tracking
        let globalReadCount = 0;
        console.log("🔍 [GLOBAL READ TRACKER] Initialized - tracking all Firestore reads");

        // Monitor Firebase console directly if possible
        if (typeof window !== 'undefined') {
            // Track any console network activity
            const originalFetch = window.fetch;
            window.fetch = async function (...args) {
                const url = args[0];
                if (typeof url === 'string' && url.includes('firestore')) {
                    console.log(`🌐 [NETWORK TRACKER] Firestore request to:`, url);
                }
                return originalFetch.apply(this, args);
            };

            // Track XMLHttpRequest as well
            const originalXHR = window.XMLHttpRequest.prototype.open;
            window.XMLHttpRequest.prototype.open = function (method, url, ...args) {
                if (typeof url === 'string' && url.includes('firestore')) {
                    console.log(`🌐 [XHR TRACKER] Firestore ${method} request to:`, url);
                }
                return originalXHR.apply(this, [method, url, ...args]);
            };
        }

        // Wrap getDocs to count reads
        const originalGetDocs = window.getDocs || getDocs;
        window.getDocsTracked = async function (query) {
            const result = await originalGetDocs(query);
            const readCount = result.docs.length || 1;
            globalReadCount += readCount;
            console.log(`📊 [GLOBAL READ TRACKER] getDocs called: +${readCount} reads (Total: ${globalReadCount})`);
            console.log(`📊 [GLOBAL READ TRACKER] getDocs source: ${result.metadata?.fromCache ? 'CACHE' : 'SERVER'}`);
            return result;
        };

        // Wrap onSnapshot to count reads
        const originalOnSnapshot = window.onSnapshot || onSnapshot;
        window.onSnapshotTracked = function (query, callback, errorCallback) {
            return originalOnSnapshot(query, (snapshot) => {
                const readCount = snapshot.docs.length || 1;
                globalReadCount += readCount;
                console.log(`📊 [GLOBAL READ TRACKER] onSnapshot triggered: +${readCount} reads (Total: ${globalReadCount})`);
                console.log(`📊 [GLOBAL READ TRACKER] Snapshot source: ${snapshot.metadata.fromCache ? 'CACHE' : 'SERVER'}`);
                callback(snapshot);
            }, errorCallback);
        };

        const holidayCalculator = new HolidayCalculator();

        // Initialize DataManager
        dataManager = new DataManager(db, auth.currentUser ? auth.currentUser.uid : null, holidayCalculator);
        window.dataManager = dataManager; // For debugging
        dataManager.subscribeToDataChanges(() => {
            syncAccessModeUi();
        });

        // Initialize PDF Generator
        pdfGenerator = new PDFGenerator();

        // Initialize Managers
        uiManager = new UIManager(dataManager, pdfGenerator);

        window.uiManager = uiManager;

        eventManager = new EventManager(auth, dataManager, uiManager);
        navigationManager = new NavigationManager();
        propertyDashboardController = new PropertiesDashboardController({
            getPropertiesManager: () => propertiesManager
        });
        window.propertyDashboardController = propertyDashboardController;

        operationsManager = new OperationsManager(db);
        reservationsManager = new ReservationsManager(db);
        rnalManager = new RnalManager(db);
        safetyManager = new SafetyManager(db);

        // Initialize Welcome Pack Manager (Correctly placed)
        welcomePackManager = new WelcomePackManager(dataManager);
        window.welcomePackManager = welcomePackManager;


        scheduleManager = new ScheduleManager(dataManager, uiManager);
        window.scheduleManager = scheduleManager;
        try {
            staffManager = new StaffManager(dataManager, uiManager);
            window.staffManager = staffManager;
        } catch (error) {
            console.error('Failed to initialize StaffManager:', error);
        }
        // Initialize Visits manager early so it can inject its page and landing button before nav listeners are wired
        visitsManager = new VisitsManager(db, userId); // Reverted to original
        window.visitsManager = visitsManager;
        try { visitsManager.ensureDomScaffold?.(); } catch { }
        // Initialize Cleaning Bills manager early to inject page and landing button before nav listeners are wired
        cleaningBillsManager = new CleaningBillsManager(); // Reverted to original
        window.cleaningBillsManager = cleaningBillsManager;
        try { cleaningBillsManager.ensureDomScaffold?.(); } catch { }
        // Initialize Commission Calculator early to inject page and landing button before nav listeners are wired
        commissionCalculatorManager = new CommissionCalculatorManager();
        window.commissionCalculatorManager = commissionCalculatorManager;
        try { commissionCalculatorManager.ensureDomScaffold?.(); } catch { }
        // Initialize Checklists manager (localStorage-backed + Firestore sync)
        checklistsManager = new ChecklistsManager(userId); // Reverted to original
        window.checklistsManager = checklistsManager;
        // Provide Firestore DB so it can start syncing once user is set
        checklistsManager.setDatabase(db);
        // Initialize Vehicles manager (Firestore user-scoped)
        vehiclesManager = new VehiclesManager(db, userId);
        window.vehiclesManager = vehiclesManager;
        // Initialize Owners manager (shared owners collection)
        ownersManager = new OwnersManager(db, userId);
        window.ownersManager = ownersManager;
        // Initialize Welcome Pack manager
        // welcomePackManager = new WelcomePackManager(dataManager); // Already initialized above
        // window.welcomePackManager = welcomePackManager;

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

        registerPropertyMigrationDebugTools({
            db,
            getPropertiesManager: () => propertiesManager,
            firestore: { collection, getDocs },
            windowRef: window
        });

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

        // Listen for language changes and refresh the current view
        window.addEventListener('languageChanged', () => {
            try {
                // Refresh current view to update dynamic content
                if (uiManager && typeof uiManager.updateView === 'function') {
                    uiManager.updateView();
                }
            } catch (e) { console.warn('Language change refresh failed:', e); }
        });

        const userManagementController = new UserManagementController({
            accessManager,
            roleManager,
            createAuthUser: (email, password) => createSecondaryAuthUser(email, password),
            sendPasswordReset: (email) => sendPasswordResetEmail(auth, email),
            getEmployees: () => dataManager?.getActiveEmployees?.() || [],
            ensureEmployeeForAccess: (payload) => ensureEmployeeForAccess(payload)
        });
        userManagementController.init();

        // Setup authentication listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Allow all authenticated Firebase Auth users
                // If you want to require verified emails, uncomment below:
                // if (!user.emailVerified) {
                //     await signOut(auth);
                //     document.getElementById('login-error').textContent = 'Please verify your email.';
                //     return;
                // }
                userId = user.uid;
                console.log(`🔐 [INITIALIZATION] User logged in: ${userId}`);
                timeClockAutoOpenedForUser = false;
                const accessEntry = user.email
                    ? await accessManager.getAccessEntry(user.email).catch((error) => {
                        console.warn('Failed to load access entry for current user:', error);
                        return null;
                    })
                    : null;
                dataManager.setCurrentUserContext({
                    uid: user.uid,
                    email: user.email,
                    roles: accessEntry?.roles || [],
                    linkedEmployee: accessEntry?.linkedEmployeeId ? {
                        id: accessEntry.linkedEmployeeId,
                        name: accessEntry.linkedEmployeeName || '',
                        email: accessEntry.linkedEmployeeEmail || user.email,
                        isArchived: Boolean(accessEntry.linkedEmployeeArchived)
                    } : null
                });
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
                if (!propertiesManager) {
                    propertiesManager = new PropertiesManager(db);
                    window.propertiesManager = propertiesManager;
                }

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
                scheduleInitialEmployeeAccessLinkSync();
                syncAccessModeUi();
                routeCurrentUserAccess();

                // OPTIMIZATION: Run migration AFTER properties have loaded to avoid duplicate reads
                console.log(`⏰ [OPTIMIZATION] Scheduling migration check after properties load...`);
                if (pendingMigrationTimeoutId) {
                    clearTimeout(pendingMigrationTimeoutId);
                }
                pendingMigrationTimeoutId = setTimeout(() => {
                    if (!migrationCompleted) {
                        console.log(`🔄 [MIGRATION] Running migration check after properties loaded...`);
                        checkAndMigrateUserProperties({
                            db,
                            getPropertiesManager: () => propertiesManager,
                            firestore: { collection, getDocs, addDoc }
                        });
                        migrationCompleted = true;
                    }
                    pendingMigrationTimeoutId = null;
                }, 2000); // Wait 2 seconds for properties to load
            } else {
                console.log(`🔐 [INITIALIZATION] User logged out`);
                userId = null;
                timeClockAutoOpenedForUser = false;
                if (pendingMigrationTimeoutId) {
                    clearTimeout(pendingMigrationTimeoutId);
                    pendingMigrationTimeoutId = null;
                }
                unsubscribePendingAccessLinkSync?.();
                unsubscribePendingAccessLinkSync = null;
                dataManager?.clearCurrentUserContext?.();
                dataManager?.stopRealtimeListeners?.();
                dataManager?.resetSessionState?.();
                navigationManager.showLoginPage();
                if (unsubscribe) unsubscribe();
                if (propertiesManager) {
                    console.log(`📋 [CLEANUP] Stopping PropertiesManager...`);
                    propertiesManager.stopListening();
                    propertiesManager = null;
                    delete window.propertiesManager;
                }
                if (operationsManager) {
                    console.log(`⚙️ [CLEANUP] Stopping OperationsManager...`);
                    operationsManager.stopListening();
                    operationsManager = null;
                }
                if (checklistsManager) {
                    // Reset user to stop any Firestore sync
                    try { checklistsManager.setUser(null); } catch { }
                }
                if (vehiclesManager) {
                    try { vehiclesManager.stopListening(); vehiclesManager.setUser(null); } catch { }
                }
                if (ownersManager) {
                    try { ownersManager.stopListening(); ownersManager.setUser(null); } catch { }
                }
                if (visitsManager) {
                    try { visitsManager.stopListening(); visitsManager.setUser(null); } catch { }
                }
            }
        });

    } catch (error) {
        console.error("Firebase init failed:", error);
        let msg = 'Could not connect to services.';

        if (window.location.protocol === 'file:') {
            msg = 'Security Error: You are opening this file directly. Please use a local server (e.g., "Live Server" in VS Code) to run this application.';
        } else if (error.message) {
            msg += ` Error: ${error.message}`;
        }

        const loginError = document.getElementById('login-error');
        if (loginError) {
            loginError.textContent = msg;
            loginError.classList.add('text-red-600', 'font-bold');
        }
    }
});

function setupGlobalEventListeners() {
    // Sign out event listener
    document.addEventListener('click', (e) => {
        if (e.target.closest('#sign-out-btn, #landing-sign-out-btn, #properties-sign-out-btn, #operations-sign-out-btn, #reservations-sign-out-btn, #vehicles-sign-out-btn, #owners-sign-out-btn, #welcome-sign-out-btn, #time-clock-sign-out-btn')) {
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

    const goToWelcomePacksBtn = document.getElementById('go-to-welcome-packs-btn');
    if (goToWelcomePacksBtn) {
        goToWelcomePacksBtn.addEventListener('click', () => {
            // Manual navigation for new welcome pack app
            document.getElementById('landing-page').classList.add('hidden');
            document.getElementById('welcome-packs-page').classList.remove('hidden');
            if (welcomePackManager) {
                welcomePackManager.init();
            }
        });
    }

    const backToLandingFromWelcomeBtn = document.getElementById('back-to-landing-from-welcome-btn');
    if (backToLandingFromWelcomeBtn) {
        backToLandingFromWelcomeBtn.addEventListener('click', () => {
            document.getElementById('welcome-packs-page').classList.add('hidden');
            navigationManager.showLandingPage();
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
            if (backToLandingFromScheduleBtn.dataset.targetPage === 'timeClock') {
                navigationManager.showTimeClockPage();
                document.dispatchEvent(new CustomEvent('timeClockPageOpened'));
                return;
            }

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
            if (dataManager?.isVacationBoardOnlyUser?.()) {
                dataManager.setCurrentView('vacation-board');
            }
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

            // Initialize Schedule Manager (New)
            if (!scheduleManager) {
                console.log('📅 [SCHEDULE PAGE] Initializing ScheduleManager');
                scheduleManager = new ScheduleManager(dataManager, uiManager);
            }

            // Ensure work day selection checkboxes are rendered for the Add Colleague form
            try { uiManager.populateDayCheckboxes(); } catch (e) { console.warn('Failed to populate day checkboxes:', e); }

            // Setup Schedule Help button
            const scheduleHelpBtn = document.getElementById('schedule-help-btn');
            if (scheduleHelpBtn) {
                scheduleHelpBtn.onclick = () => {
                    if (uiManager && typeof uiManager.showScheduleHelpModal === 'function') {
                        uiManager.showScheduleHelpModal();
                    }
                };
            }
        }, 100); // Small delay to ensure DOM is ready
    });

    document.addEventListener('timeClockPageOpened', () => {
        setTimeout(() => {
            uiManager?.renderTimeClockPage?.();
        }, 50);
    });

    document.addEventListener('openSharedVacationBoardRequested', () => {
        if (!dataManager?.canAccessVacationBoard?.()) {
            return;
        }

        dataManager.setCurrentView('vacation-board');
        navigationManager.showSchedulePage();
        document.dispatchEvent(new CustomEvent('schedulePageOpened'));
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

    document.addEventListener('staffPageOpened', () => {
        if (staffManager) {
            staffManager.render();
        }
    });

    propertyDashboardController?.init();
}

async function setupApp() {
    console.log(`🚀 [INITIALIZATION] setupApp() called`);
    try {
        if (!dataManager || !uiManager) {
            console.error('❌ [INITIALIZATION] Required managers not available:', { dataManager: !!dataManager, uiManager: !!uiManager });
            return;
        }

        console.log(`👥 [INITIALIZATION] Setting up employee data listener...`);
        // Subscribe additional UI work that should happen after shared data updates
        dataManager.subscribeToDataChanges(() => {
            console.log(`🔄 [DATA CHANGE] Employee data changed, updating UI`);
            if (uiManager) {
                // Ensure Shift Presets Modal list is updated if open
                uiManager.renderShiftPresetsModal();
            }
        });

        dataManager.listenForEmployeeChanges();
        dataManager.listenForVacationRecordChanges();
        dataManager.listenForDailyNotes();
        dataManager.listenForShiftPresets();
        dataManager.listenForGlobalSettings();
        dataManager.listenForAttendanceChanges();

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
                dataManager.listenForVacationRecordChanges();
                dataManager.listenForDailyNotes();
                dataManager.listenForShiftPresets();
                dataManager.listenForGlobalSettings();
                dataManager.listenForAttendanceChanges();
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

