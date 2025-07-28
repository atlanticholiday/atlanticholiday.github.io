import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, onSnapshot, deleteDoc, setLogLevel, getDoc, setDoc, updateDoc, deleteField, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { Config } from './config.js';
import { DataManager } from './data-manager.js';
import { UIManager } from './ui-manager.js';
import { PDFGenerator } from './pdf-generator.js';
import { HolidayCalculator } from './holiday-calculator.js';
import { EventManager } from './event-manager.js';

// --- GLOBAL VARIABLES & CONFIG ---
let db, auth, userId;
let unsubscribe = null;

// Initialize managers
let dataManager, uiManager, pdfGenerator, holidayCalculator, eventManager;

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

        // Setup login event listeners immediately
        eventManager.setupLoginListeners();

        // Setup authentication listener
        onAuthStateChanged(auth, user => {
            const loginScreen = document.getElementById('login-screen');
            const setupScreen = document.getElementById('setup-screen');
            const appContent = document.getElementById('app-content');
            
            if (user) {
                userId = user.uid;
                loginScreen.classList.add('hidden');
                appContent.classList.remove('hidden');
                document.getElementById('loading').classList.remove('hidden');
                document.getElementById('main-app').classList.add('hidden');
                setupScreen.classList.add('hidden');
                setupApp();
            } else {
                userId = null;
                loginScreen.classList.remove('hidden');
                appContent.classList.add('hidden');
                setupScreen.classList.add('hidden');
                if (unsubscribe) unsubscribe(); 
            }
        });

    } catch(error) {
        console.error("Firebase init failed:", error);
        document.getElementById('login-error').textContent = 'Could not connect to services.';
    }
});

async function setupApp() {
    if (unsubscribe) unsubscribe();
    
    // Setup app event listeners (but not login listeners - those are already set up)
    eventManager.setupAppEventListeners();
    
    // Initialize UI components
    uiManager.populateDayCheckboxes();

    const employeesSnap = await getDocs(dataManager.getEmployeesCollectionRef());
    const hasEmployees = employeesSnap.docs.some(doc => doc.id !== 'metadata');
    
    if (!hasEmployees) {
        uiManager.showSetupScreen();
    } else {
        dataManager.listenForEmployeeChanges();
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        // Force UI refresh after a brief delay to ensure holidays are loaded
        setTimeout(() => {
            uiManager.updateView();
        }, 100);
    }
} 