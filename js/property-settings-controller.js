import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Config } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔧 [PROPERTY SETTINGS] Page loaded, initializing...');
    
    // Initialize Firebase with v11 syntax
    const app = initializeApp(Config.firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);

    // Get propertyId from URL - support both 'propertyId' and 'id' parameters
    const urlParams = new URLSearchParams(window.location.search);
    const propertyId = urlParams.get('propertyId') || urlParams.get('id');

    console.log('🔧 [PROPERTY SETTINGS] Property ID from URL:', propertyId);

    if (!propertyId) {
        console.error('🔧 [PROPERTY SETTINGS] No propertyId found in URL. Cannot load settings.');
        displayPropertyIdError();
        return;
    }

    const settingsForm = document.getElementById('property-settings-form');
    const saveButton = document.getElementById('save-settings');

    // --- Comprehensive mapping from DB keys to form element IDs ---
    const SETTINGS_MAP = {
        // Basic Info (editable fields)
        name: 'settings-property-name',
        location: 'settings-location',
        type: 'settings-type',
        typology: 'settings-typology',
        rooms: 'settings-rooms',
        bathrooms: 'settings-bathrooms',
        floor: 'settings-floor',
        
        // Basic Info (display only - for the top info section)
        nameDisplay: 'property-name-display',
        locationDisplay: 'property-location-display',
        typeDisplay: 'property-type-display',

        // Maps & Location
        googleMapsLink: 'settings-google-maps-link',
        garbageLocationLink: 'settings-garbage-location-link',
        garbageFloor: 'settings-garbage-floor',
        
        // Media & Content
        checkinVideos: 'settings-checkin-videos',
        bookingDescriptionStatus: 'settings-booking-description-status',

        // Google Drive
        googleDriveEnabled: 'settings-google-drive-enabled',
        googleDriveLink: 'settings-google-drive-link',
        scannedDocsLink: 'settings-scanned-docs-link',

        // Recommendations
        recommendationsLink: 'settings-recommendations-link',
        recommendationsEditLink: 'settings-recommendations-edit-link',

        // Legal & Compliance
        contractsStatus: 'settings-contracts-status',
        complaintBooksStatus: 'settings-complaint-books-status',
        statisticsStatus: 'settings-statistics-status',
        sefStatus: 'settings-sef-status',

        // Online Services
        onlineComplaintBooksEnabled: 'settings-online-complaint-books-enabled',
        onlineComplaintBooksEmail: 'settings-online-complaint-books-email',
        onlineComplaintBooksPassword: 'settings-online-complaint-books-password',
        airbnbLinksStatus: 'settings-airbnb-links-status',

        // Connectivity & Utilities
        wifiSpeed: 'settings-wifi-speed',
        energySource: 'settings-energy-source',

        // Access & Parking
        keyBoxCode: 'settings-key-box-code',
        parkingSpot: 'settings-parking-spot',
        parkingFloor: 'settings-parking-floor',

        // Equipment
        airConditioning: 'settings-air-conditioning',
        fans: 'settings-fans',
        heaters: 'settings-heaters',
        crib: 'settings-crib',
        cribMattress: 'settings-crib-mattress',
        babyChair: 'settings-baby-chair',

        // Frames
        wifiFrame: 'settings-wifi-frame',
        recommendationsFrame: 'settings-recommendations-frame',
        investmentFrame: 'settings-investment-frame',

        // Services & Extras
        breakfastBox: 'settings-breakfast-box',

        // Safety Maintenance
        fireExtinguisherExpiration: 'settings-fire-extinguisher-expiration',
        fireExtinguisherLocation: 'settings-fire-extinguisher-location',
        fireExtinguisherNotes: 'settings-fire-extinguisher-notes',
        firstAidStatus: 'settings-first-aid-status',
        firstAidLastChecked: 'settings-first-aid-last-checked',
        firstAidNotes: 'settings-first-aid-notes',

        // Signage
        privateSign: 'settings-private-sign',
        noSmokingSign: 'settings-no-smoking-sign',
        noJunkMailSign: 'settings-no-junk-mail-sign',
        alAhSign: 'settings-al-ah-sign',
        keysNotice: 'settings-keys-notice',
        wcSign: 'settings-wc-sign',

        // Condominium Info
        condominiumName: 'settings-condominium',
        condominiumEmail: 'settings-condominium-email',
        condominiumPhone: 'settings-condominium-phone'
    };

    // Function to populate the entire page from a single property object
    const populatePage = (propertyData) => {
        if (!propertyData) {
            console.error(`🔧 [PROPERTY SETTINGS] No data found for propertyId: ${propertyId}`);
            alert('Could not load property data. Please check the property ID.');
            return;
        }

        console.log('🔧 [PROPERTY SETTINGS] Populating page with property data:', propertyData);

        // Populate all fields based on the map
        for (const dbKey in SETTINGS_MAP) {
            const elementId = SETTINGS_MAP[dbKey];
            const element = document.getElementById(elementId);

            if (element) {
                const value = propertyData[dbKey];
                // Handle display divs vs input/select fields
                if (element.tagName === 'INPUT' || element.tagName === 'SELECT') {
                    if (value !== undefined && value !== null) {
                        element.value = value;
                    } else {
                        element.value = ''; // Clear if no data
                    }
                } else { // It's a div or other display element
                    element.textContent = value || 'Not specified';
                }
            } else {
                console.warn(`🔧 [PROPERTY SETTINGS] Element with ID '${elementId}' not found for DB key '${dbKey}'.`);
            }
        }

        // Also populate the display fields at the top with the basic info
        const displayMappings = {
            name: 'property-name-display',
            location: 'property-location-display',
            type: 'property-type-display'
        };

        for (const [key, displayId] of Object.entries(displayMappings)) {
            const displayElement = document.getElementById(displayId);
            if (displayElement) {
                let value = propertyData[key];
                // For type display, prefer typology over type if available
                if (key === 'type') {
                    value = propertyData.typology || propertyData.type;
                }
                displayElement.textContent = value || 'Not specified';
            }
        }
    };

    const loadAndPopulate = async () => {
        try {
            console.log(`🔧 [PROPERTY SETTINGS] Loading property data for ID: ${propertyId}`);
            
            // Try to get data from sessionStorage first (if passed from main app)
            let propertyData = null;
            const sessionDataKey = 'currentProperty';
            const sessionData = sessionStorage.getItem(sessionDataKey);
            
            console.log('🔧 [PROPERTY SETTINGS] SessionStorage data:', sessionData);
            
            if (sessionData) {
                try {
                    const parsed = JSON.parse(sessionData);
                    console.log('🔧 [PROPERTY SETTINGS] Parsed sessionStorage data:', parsed);
                    
                    // IMPORTANT: Check if the sessionStorage property matches the URL propertyId
                    if (parsed && parsed.id === propertyId) {
                        propertyData = parsed;
                        console.log('🔧 [PROPERTY SETTINGS] ✅ SessionStorage property ID matches URL - using sessionStorage data');
                    } else {
                        console.warn('🔧 [PROPERTY SETTINGS] ⚠️ SessionStorage property ID does not match URL:', {
                            sessionId: parsed?.id,
                            urlPropertyId: propertyId
                        });
                        // Clear stale sessionStorage data
                        sessionStorage.removeItem(sessionDataKey);
                    }
                } catch (e) {
                    console.warn('🔧 [PROPERTY SETTINGS] Failed to parse sessionStorage data:', e);
                    sessionStorage.removeItem(sessionDataKey);
                }
            }

            // If no valid sessionStorage data, wait for authentication and then load from Firestore
            if (!propertyData) {
                console.log('🔧 [PROPERTY SETTINGS] No valid sessionStorage data, waiting for authentication...');
                
                // Wait for auth state to be determined
                const user = await new Promise((resolve) => {
                    const unsubscribe = onAuthStateChanged(auth, (user) => {
                        unsubscribe();
                        resolve(user);
                    });
                });

                if (user) {
                    console.log('🔧 [PROPERTY SETTINGS] User authenticated, loading from Firestore...');
                    const docRef = doc(db, 'properties', propertyId);
                    const docSnap = await getDoc(docRef);
                    
                    if (docSnap.exists()) {
                        propertyData = { id: docSnap.id, ...docSnap.data() };
                        console.log('🔧 [PROPERTY SETTINGS] ✅ Loaded property data from Firestore:', propertyData);
                    } else {
                        console.error('🔧 [PROPERTY SETTINGS] Property not found in Firestore');
                    }
                } else {
                    console.error('🔧 [PROPERTY SETTINGS] User not authenticated');
                    alert('You must be logged in to edit properties. Please log in and try again.');
                    window.location.href = 'index.html';
                    return;
                }
            }

            // If still no data, try localStorage as last resort
            if (!propertyData) {
                console.log('🔧 [PROPERTY SETTINGS] No Firestore data, trying localStorage...');
                const properties = JSON.parse(localStorage.getItem('firestore_properties') || '[]');
                propertyData = properties.find(p => p.id === propertyId);
                if (propertyData) {
                    console.log('🔧 [PROPERTY SETTINGS] ✅ Loaded property data from localStorage:', propertyData);
                }
            }

            if (propertyData) {
                populatePage(propertyData);
                // Store property ID for form submission
                const propertyIdInput = document.getElementById('settings-property-id');
                if (propertyIdInput) propertyIdInput.value = propertyId;
            } else {
                console.error('🔧 [PROPERTY SETTINGS] Property not found in any data source');
                alert('Property not found. Please make sure the property exists and you have permission to access it.');
            }
        } catch (error) {
            console.error("🔧 [PROPERTY SETTINGS] Error loading property data:", error);
            alert("An error occurred while loading property data: " + error.message);
        }
    };

    const saveSettings = async (e) => {
        e.preventDefault();
        const updates = {};
        
        // Collect data only from input/select fields
        for (const dbKey in SETTINGS_MAP) {
            const elementId = SETTINGS_MAP[dbKey];
            const element = document.getElementById(elementId);
            if (element && (element.tagName === 'INPUT' || element.tagName === 'SELECT')) {
                let value = element.value;
                // Convert numeric fields
                if (element.type === 'number' && value !== '') {
                    value = parseInt(value) || 0;
                }
                updates[dbKey] = value;
            }
        }

        try {
            console.log('🔧 [PROPERTY SETTINGS] Saving updates:', updates);
            
            // Use Firestore update to avoid overwriting the entire property object
            const docRef = doc(db, 'properties', propertyId);
            await updateDoc(docRef, updates);
            
            console.log('🔧 [PROPERTY SETTINGS] ✅ Settings saved successfully');
            alert('Settings saved successfully!');
            
            // Update sessionStorage if it exists
            const sessionData = sessionStorage.getItem('currentProperty');
            if (sessionData) {
                try {
                    const currentProperty = JSON.parse(sessionData);
                    const updatedProperty = { ...currentProperty, ...updates };
                    sessionStorage.setItem('currentProperty', JSON.stringify(updatedProperty));
                    sessionStorage.setItem('propertySettingsUpdated', 'true');
                    console.log('🔧 [PROPERTY SETTINGS] Updated sessionStorage with new data');
                } catch (e) {
                    console.warn('🔧 [PROPERTY SETTINGS] Failed to update sessionStorage:', e);
                }
            }
        } catch (error) {
            console.error("🔧 [PROPERTY SETTINGS] Error saving settings:", error);
            alert('Error saving settings: ' + error.message);
        }
    };

    // Function to display error when propertyId is missing
    function displayPropertyIdError() {
        document.getElementById('property-name-display').textContent = 'Error: No property ID provided';
        document.getElementById('property-location-display').textContent = 'Please check the URL';
        document.getElementById('property-type-display').textContent = 'Cannot load property';
    }

    if (saveButton) {
        saveButton.addEventListener('click', saveSettings);
    }

    // Also handle form submission
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }

    // Initial load
    loadAndPopulate();
});
