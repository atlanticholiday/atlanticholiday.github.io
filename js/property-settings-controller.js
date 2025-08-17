import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { Config } from './config.js';
import { LOCATIONS } from './locations.js';

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

    // --- Helpers for canonical locations ---
    const normalizeLocation = (name) => {
        const s = String(name || '').trim();
        if (!s) return '';
        const lower = s.toLowerCase();
        const exact = LOCATIONS.find(loc => loc.toLowerCase() === lower);
        return exact || '';
    };

    // Rename the Contacts section to Cleaning in the UI without heavy HTML edits
    const ensureCleaningSectionHeader = () => {
        const section = document.getElementById('section-contacts');
        if (!section) return;
        const titleEl = section.querySelector('.section-title');
        if (titleEl) titleEl.textContent = 'Cleaning';
        const iconWrap = section.querySelector('.section-icon');
        if (iconWrap) {
            let iEl = iconWrap.querySelector('i');
            if (!iEl) {
                iEl = document.createElement('i');
                iconWrap.appendChild(iEl);
            }
            iEl.className = 'fas fa-broom';
        }
    };

    // Ensure a dedicated Accounting section exists in the form (avoids heavy HTML edits)
    const ensureAccountingSection = () => {
        const form = document.getElementById('property-settings-form');
        if (!form) return null;
        let section = document.getElementById('section-accounting');
        if (section) return section;

        // Build section scaffold
        section = document.createElement('div');
        section.id = 'section-accounting';
        section.className = 'form-section';
        section.innerHTML = `
          <div class="section-header">
            <div class="section-header-title">
              <div class="section-icon" style="background: linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%); color: #fff;">
                <i class="fas fa-file-invoice-dollar"></i>
              </div>
              <h2 class="section-title">Accounting</h2>
            </div>
          </div>
          <div class="form-grid"></div>
        `;

        // Insert before Contacts if available, otherwise before Condominium, else append
        const contacts = document.getElementById('section-contacts');
        const condo = document.getElementById('section-condominium-info');
        if (contacts && contacts.parentElement === form) {
            form.insertBefore(section, contacts);
        } else if (condo && condo.parentElement === form) {
            form.insertBefore(section, condo);
        } else {
            form.appendChild(section);
        }
        return section;
    };

    // Ensure Accounting fields exist, split into Name/Phone/Email/Notes and place under the Accounting section
    const ensureAccountingFields = () => {
        const form = document.getElementById('property-settings-form');
        if (!form) return;

        // Ensure the Accounting section scaffold exists
        const section = ensureAccountingSection();
        const targetGrid = section?.querySelector('.form-grid') || form;

        // If we already created the structured fields, skip
        if (document.getElementById('settings-accounting-name') &&
            document.getElementById('settings-accounting-phone') &&
            document.getElementById('settings-accounting-email') &&
            document.getElementById('settings-accounting-notes')) {
            return;
        }

        // Locate legacy textarea if present and repurpose as Notes
        const legacyTextarea = document.getElementById('settings-accounting-contact');
        let notesGroup;
        if (legacyTextarea) {
            // Adjust label/icon and id
            const group = legacyTextarea.closest('.form-group') || document.createElement('div');
            if (!group.classList.contains('form-group')) group.className = 'form-group';
            const label = group.querySelector('label.form-label') || document.createElement('label');
            label.className = 'form-label';
            label.innerHTML = '<i class="fas fa-sticky-note"></i> <span>Accounting Notes</span>';
            if (!label.parentElement) group.prepend(label);
            legacyTextarea.id = 'settings-accounting-notes';
            legacyTextarea.placeholder = 'Notes about accounting (optional)';
            notesGroup = group;
        } else if (!document.getElementById('settings-accounting-notes')) {
            // Create notes textarea if legacy not found
            notesGroup = document.createElement('div');
            notesGroup.className = 'form-group';
            notesGroup.innerHTML = `
                <label class="form-label">
                  <i class="fas fa-sticky-note"></i>
                  <span>Accounting Notes</span>
                </label>
                <textarea id="settings-accounting-notes" class="form-input" rows="3" placeholder="Notes about accounting (optional)"></textarea>
            `;
        }

        // Create Name, Phone, Email groups
        if (!document.getElementById('settings-accounting-name')) {
            const nameGroup = document.createElement('div');
            nameGroup.className = 'form-group';
            nameGroup.innerHTML = `
                <label class="form-label">
                  <i class="fas fa-user-tie"></i>
                  <span>Accounting Contact Name/Company</span>
                </label>
                <input id="settings-accounting-name" name="accountingName" type="text" class="form-input" placeholder="e.g. ABC Contabilidade" />
            `;
            targetGrid.appendChild(nameGroup);
        }

        if (!document.getElementById('settings-accounting-phone')) {
            const phoneGroup = document.createElement('div');
            phoneGroup.className = 'form-group';
            phoneGroup.innerHTML = `
                <label class="form-label">
                  <i class="fas fa-phone"></i>
                  <span>Accounting Phone</span>
                </label>
                <input id="settings-accounting-phone" name="accountingPhone" type="tel" class="form-input" placeholder="e.g. +351 912 345 678" />
            `;
            targetGrid.appendChild(phoneGroup);
        }

        if (!document.getElementById('settings-accounting-email')) {
            const emailGroup = document.createElement('div');
            emailGroup.className = 'form-group';
            emailGroup.innerHTML = `
                <label class="form-label">
                  <i class="fas fa-envelope"></i>
                  <span>Accounting Email</span>
                </label>
                <input id="settings-accounting-email" name="accountingEmail" type="email" class="form-input" placeholder="e.g. accounting@company.com" />
            `;
            targetGrid.appendChild(emailGroup);
        }

        if (notesGroup) {
            targetGrid.appendChild(notesGroup);
        }
    };

    // Apply quick UI adjustments immediately
    ensureCleaningSectionHeader();
    const ensureLocationField = () => {
        const el = document.getElementById('settings-location');
        if (!el) {
            console.warn('🔧 [PROPERTY SETTINGS] settings-location element not found');
            return;
        }
        let selectEl = el;
        if (el.tagName !== 'SELECT') {
            // Replace input/textarea with a select element to enforce canonical list
            const newSelect = document.createElement('select');
            newSelect.id = el.id;
            if (el.name) newSelect.name = el.name;
            newSelect.className = el.className || 'w-full';
            el.parentNode.replaceChild(newSelect, el);
            selectEl = newSelect;
        }
        // Populate options
        selectEl.innerHTML = '';
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = 'Select location';
        selectEl.appendChild(emptyOpt);
        for (const loc of LOCATIONS) {
            const opt = document.createElement('option');
            opt.value = loc;
            opt.textContent = loc;
            selectEl.appendChild(opt);
        }
    };

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
        condominiumPhone: 'settings-condominium-phone',

        // NEW: Contacts
        ownerContact: 'settings-owner-contact',
        cleaningCompanyContact: 'settings-cleaning-company-contact',
        cleaningCompanyPrice: 'settings-cleaning-company-price',
        // NEW: Pricing - Guest Cleaning Fee (charged on platform)
        guestCleaningFee: 'settings-guest-cleaning-fee',
        // Accounting (moved to Legal & Compliance)
        accountingName: 'settings-accounting-name',
        accountingPhone: 'settings-accounting-phone',
        accountingEmail: 'settings-accounting-email',
        // Backward-compatible: store legacy notes under accountingContact
        accountingContact: 'settings-accounting-notes',

        // NEW: Self Check-in (Media & Content)
        selfCheckinInstructions: 'settings-self-checkin-instructions',

        // NEW: Services & Extras - Pool/Jacuzzi Maintenance
        poolMaintenanceDay: 'settings-pool-maintenance-day',
        poolMaintenanceNotes: 'settings-pool-maintenance-notes',

        // NEW: Legal & Compliance - Tourist Tax
        touristTaxInstructions: 'settings-tourist-tax-instructions',

        // NEW: Connectivity & Utilities - Internet Provider
        internetProvider: 'settings-internet-provider',

        // NEW: Contacts - Owner Details
        ownerFirstName: 'settings-owner-first-name',
        ownerLastName: 'settings-owner-last-name',
        ownerVatNumber: 'settings-owner-vat-number',
        ownerPropertyAddress: 'settings-owner-property-address'
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
                if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
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

    // Ensure Guest Cleaning Fee field exists and is placed near cleaning company price
    const ensureGuestCleaningFeeField = () => {
        const form = document.getElementById('property-settings-form');
        if (!form) return;
        if (document.getElementById('settings-guest-cleaning-fee')) return; // already present
        const anchor = document.getElementById('settings-cleaning-company-price');
        // Prefer to insert inside the Basic Information grid to keep consistent layout
        const basicGrid = document.querySelector('#section-basic-info-edit .form-grid');
        // Build consistent form-group with icon and styled label
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `
            <label class="form-label">
              <i class="fas fa-broom"></i>
              <span>Guest Cleaning Fee (platform)</span>
            </label>
            <input id="settings-guest-cleaning-fee" name="guestCleaningFee" type="number" step="0.01" min="0" class="form-input" placeholder="e.g. 60.00" />
        `;
        if (anchor && anchor.parentElement && anchor.parentElement.parentElement) {
            // Insert right after the anchor's form-group if available
            anchor.parentElement.parentElement.insertAdjacentElement('afterend', group);
        } else if (basicGrid) {
            basicGrid.appendChild(group);
        } else {
            form.appendChild(group);
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
                // Ensure fields are present before populating
                ensureGuestCleaningFeeField();
                ensureAccountingFields();
                // Ensure the location field is a select with canonical options before populating values
                ensureLocationField();
                populatePage(propertyData);
                // Normalize and set canonical location selection if possible
                const locEl = document.getElementById('settings-location');
                if (locEl && locEl.tagName === 'SELECT') {
                    const canonical = normalizeLocation(propertyData.location);
                    if (canonical) {
                        locEl.value = canonical;
                    }
                }
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
            if (element && (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA')) {
                let value = element.value;
                // Convert numeric fields (allow decimals for prices)
                if (element.type === 'number' && value !== '') {
                    const parsed = parseFloat(value);
                    value = Number.isFinite(parsed) ? parsed : 0;
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

    // Prepare fields, then initial load
    ensureGuestCleaningFeeField();
    ensureAccountingFields();
    ensureLocationField();
    loadAndPopulate();
});
