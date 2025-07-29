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
            const propertyData = {
                name: document.getElementById('property-name').value,
                location: document.getElementById('property-location').value,
                type: document.getElementById('property-type').value,
                rooms: parseInt(document.getElementById('property-rooms').value) || 0,
                rating: parseInt(document.getElementById('property-rating').value) || 0,
                description: document.getElementById('property-description').value
            };
            
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