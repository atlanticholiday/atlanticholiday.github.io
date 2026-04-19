export const APP_ACCESS_OPTIONS = Object.freeze([
    {
        key: 'vehicles',
        buttonId: 'go-to-vehicles-btn',
        pageName: 'vehicles',
        labelKey: 'apps.vehicles',
        fallbackLabel: 'Vehicles',
        group: 'main'
    },
    {
        key: 'staff',
        buttonId: 'go-to-staff-btn',
        pageName: 'staff',
        labelKey: 'apps.staff',
        fallbackLabel: 'Staff',
        group: 'main'
    },
    {
        key: 'properties',
        buttonId: 'go-to-properties-btn',
        pageName: 'properties',
        labelKey: 'apps.properties',
        fallbackLabel: 'Properties',
        group: 'main'
    },
    {
        key: 'airbnbReservationInvoices',
        buttonId: 'go-to-airbnb-reservation-invoices-btn',
        pageName: 'airbnbReservationInvoices',
        labelKey: 'userManagement.appAccess.options.airbnbReservationInvoices',
        fallbackLabel: 'Airbnb VAT Invoices',
        group: 'main'
    },
    {
        key: 'welcomePacks',
        buttonId: 'go-to-welcome-packs-btn',
        pageName: 'welcomePacks',
        labelKey: 'apps.welcomePacks',
        fallbackLabel: 'Welcome Packs',
        group: 'main'
    },
    {
        key: 'laundryLog',
        buttonId: 'go-to-laundry-log-btn',
        pageName: 'laundryLog',
        labelKey: 'apps.laundryLog',
        fallbackLabel: 'Laundry Log',
        group: 'main'
    },
    {
        key: 'operationalGuidelines',
        buttonId: 'go-to-operational-guidelines-btn',
        pageName: 'operationalGuidelines',
        labelKey: 'userManagement.appAccess.options.operationalGuidelines',
        fallbackLabel: 'Operational Guide',
        group: 'main'
    },
    {
        key: 'allinfo',
        buttonId: 'go-to-allinfo-btn',
        pageName: 'allinfo',
        labelKey: 'userManagement.appAccess.options.allinfo',
        fallbackLabel: 'All Info',
        group: 'more'
    },
    {
        key: 'rnal',
        buttonId: 'go-to-rnal-btn',
        pageName: 'rnal',
        labelKey: 'userManagement.appAccess.options.rnal',
        fallbackLabel: 'RNAL',
        group: 'more'
    },
    {
        key: 'checklists',
        buttonId: 'go-to-checklists-btn',
        pageName: 'checklists',
        labelKey: 'userManagement.appAccess.options.checklists',
        fallbackLabel: 'Checklists',
        group: 'more'
    },
    {
        key: 'owners',
        buttonId: 'go-to-owners-btn',
        pageName: 'owners',
        labelKey: 'userManagement.appAccess.options.owners',
        fallbackLabel: 'Owners',
        group: 'more'
    },
    {
        key: 'safety',
        buttonId: 'go-to-safety-btn',
        pageName: 'safety',
        labelKey: 'userManagement.appAccess.options.safety',
        fallbackLabel: 'Safety',
        group: 'more'
    },
    {
        key: 'reservations',
        buttonId: 'go-to-reservations-btn',
        pageName: 'reservations',
        labelKey: 'userManagement.appAccess.options.reservations',
        fallbackLabel: 'Weekly Reservations',
        group: 'more'
    },
    {
        key: 'buildPlanner',
        buttonId: 'go-to-build-planner-btn',
        pageName: 'buildPlanner',
        labelKey: 'userManagement.appAccess.options.buildPlanner',
        fallbackLabel: 'Build Planner',
        group: 'more'
    },
    {
        key: 'inventory',
        buttonId: 'go-to-inventory-btn',
        labelKey: 'userManagement.appAccess.options.inventory',
        fallbackLabel: 'Inventory',
        group: 'more'
    },
    {
        key: 'cleaningAh',
        buttonId: 'go-to-cleaning-ah-btn',
        pageName: 'cleaningAh',
        labelKey: 'userManagement.appAccess.options.cleaningAh',
        fallbackLabel: 'Cleaning AH',
        group: 'more'
    }
]);

const APP_ACCESS_KEYS = new Set(APP_ACCESS_OPTIONS.map((option) => option.key));

export function getAppAccessOptions() {
    return [...APP_ACCESS_OPTIONS];
}

export function getAppAccessOption(appKey = '') {
    return APP_ACCESS_OPTIONS.find((option) => option.key === appKey) || null;
}

export function getAppAccessOptionByButtonId(buttonId = '') {
    return APP_ACCESS_OPTIONS.find((option) => option.buttonId === buttonId) || null;
}

export function getAppAccessOptionByPageName(pageName = '') {
    return APP_ACCESS_OPTIONS.find((option) => option.pageName === pageName) || null;
}

export function getAllAppAccessKeys() {
    return APP_ACCESS_OPTIONS.map((option) => option.key);
}

export function normalizeAllowedApps(allowedApps) {
    if (!Array.isArray(allowedApps)) {
        return null;
    }

    const normalized = [];
    const seen = new Set();

    allowedApps.forEach((appKey) => {
        const key = typeof appKey === 'string' ? appKey.trim() : '';
        if (!key || !APP_ACCESS_KEYS.has(key) || seen.has(key)) {
            return;
        }

        seen.add(key);
        normalized.push(key);
    });

    return normalized;
}

export function isKnownAppAccessKey(appKey = '') {
    return APP_ACCESS_KEYS.has(appKey);
}
