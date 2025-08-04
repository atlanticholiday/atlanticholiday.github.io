import { Config } from './config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(Config.firebaseConfig);
    }
    const db = firebase.database();

    // Get propertyId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const propertyId = urlParams.get('propertyId');

    if (!propertyId) {
        console.error("No propertyId found in URL. Cannot load settings.");
        displayPropertyIdError();
        return;
        return;
    }

    const settingsForm = document.getElementById('property-settings-form');
    const saveButton = document.getElementById('save-settings');

    // --- Comprehensive mapping from DB keys to form element IDs ---
    const SETTINGS_MAP = {
        // Basic Info (handled separately but can be saved)
        name: 'property-name-display', // Note: This is a div, not an input
        location: 'property-location-display',
        type: 'property-type-display',

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
        heaters: 'settings-heaters'
    };

    // Function to populate the entire page from a single property object
    const populatePage = (propertyData) => {
        if (!propertyData) {
            console.error(`No data found in DB for propertyId: ${propertyId}`);
            alert('Could not load property data. Please check the property ID.');
            return;
        }

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
                    element.textContent = value || 'N/A';
                }
            } else {
                console.warn(`Element with ID '${elementId}' not found for DB key '${dbKey}'.`);
            }
        }
    };

    const loadAndPopulate = () => {
        const propertyRef = db.ref(`properties/${propertyId}`);

        propertyRef.once('value').then(snapshot => {
            populatePage(snapshot.val());
        }).catch(error => {
            console.error("Error loading property data:", error);
            alert("An error occurred while loading property data.");
        });
        
        const propertyIdInput = document.getElementById('settings-property-id');
        if(propertyIdInput) propertyIdInput.value = propertyId;
    };

    const saveSettings = (e) => {
        e.preventDefault();
        const updates = {};
        
        // Collect data only from input/select fields
        for (const dbKey in SETTINGS_MAP) {
            const elementId = SETTINGS_MAP[dbKey];
            const element = document.getElementById(elementId);
            if (element && (element.tagName === 'INPUT' || element.tagName === 'SELECT')) {
                updates[dbKey] = element.value;
            }
        }

        // Use 'update' to avoid overwriting the entire property object
        db.ref(`properties/${propertyId}`).update(updates)
            .then(() => {
                alert('Settings saved successfully!');
            })
            .catch((error) => {
                console.error("Error saving settings: ", error);
                alert('Error saving settings.');
            });
    };

    if (saveButton) {
        saveButton.addEventListener('click', saveSettings);
    }

    // Initial load
    loadAndPopulate();
});
