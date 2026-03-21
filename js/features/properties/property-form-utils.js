const ADVANCED_AMENITY_IDS = [
    'advanced-amenity-wifi',
    'advanced-amenity-pool',
    'advanced-amenity-garden',
    'advanced-amenity-balcony',
    'advanced-amenity-ac',
    'advanced-amenity-kitchen',
    'advanced-amenity-washing-machine',
    'advanced-amenity-sea-view'
];

function getElement(documentRef, id) {
    return documentRef?.getElementById(id) ?? null;
}

function getValue(documentRef, id) {
    return getElement(documentRef, id)?.value ?? '';
}

function setValue(documentRef, id, value) {
    const element = getElement(documentRef, id);
    if (element) {
        element.value = value ?? '';
    }
    return element;
}

function setText(documentRef, id, value) {
    const element = getElement(documentRef, id);
    if (element) {
        element.textContent = value ?? '';
    }
}

function parseInteger(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function parseNullableFloat(value) {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
}

function trimOrNull(value) {
    const trimmed = String(value ?? '').trim();
    return trimmed || null;
}

function parseSelectedType(selectedType, fallbackRoomsValue = '') {
    const normalizedType = String(selectedType ?? '').trim();
    const typologyMatch = normalizedType.match(/^([^-]+)-([TV]\d+)$/);

    if (typologyMatch) {
        const [, type, typology] = typologyMatch;
        return {
            type,
            typology,
            rooms: parseInteger(typology.slice(1), 0)
        };
    }

    return {
        type: normalizedType,
        rooms: parseInteger(fallbackRoomsValue, 0)
    };
}

function readCheckedAmenities(documentRef, amenityIds) {
    return amenityIds
        .map((id) => {
            const element = getElement(documentRef, id);
            return element?.checked ? id.replace(/^[^-]+-amenity-/, '') : null;
        })
        .filter(Boolean);
}

function assignCommonPropertyFields(target, fieldPrefix, documentRef) {
    const prefix = fieldPrefix ? `${fieldPrefix}-` : '';
    target.bathrooms = parseNullableFloat(getValue(documentRef, `${prefix}property-bathrooms`));
    target.floor = trimOrNull(getValue(documentRef, `${prefix}property-floor`));
    target.wifiSpeed = getValue(documentRef, `${prefix}property-wifi-speed`) || null;
    target.wifiAirbnb = getValue(documentRef, `${prefix}property-wifi-airbnb`) || 'no';
    target.parkingSpot = trimOrNull(getValue(documentRef, `${prefix}property-parking-spot`));
    target.parkingFloor = trimOrNull(getValue(documentRef, `${prefix}property-parking-floor`));
    target.energySource = getValue(documentRef, `${prefix}property-energy-source`) || null;
    target.smartTv = getValue(documentRef, `${prefix}property-smart-tv`) || 'no';
    return target;
}

export function syncRoomsInputForSelectedType(selectedType, roomsInput) {
    if (!roomsInput) {
        return;
    }

    const parsedType = parseSelectedType(selectedType, roomsInput.value);
    const hasDerivedRoomCount = Boolean(parsedType.typology);

    if (hasDerivedRoomCount) {
        roomsInput.value = String(parsedType.rooms);
        roomsInput.disabled = true;
        return;
    }

    roomsInput.disabled = false;
}

export function buildQuickPropertyDataFromForm(documentRef = document) {
    const selectedType = getValue(documentRef, 'property-type');
    const baseData = parseSelectedType(selectedType, getValue(documentRef, 'property-rooms'));

    return assignCommonPropertyFields(
        {
            name: getValue(documentRef, 'property-name').trim(),
            location: getValue(documentRef, 'property-location').trim(),
            ...baseData
        },
        '',
        documentRef
    );
}

export function copyQuickAddValuesToAdvancedForm(documentRef = document) {
    const fieldMappings = [
        ['property-name', 'advanced-property-name'],
        ['property-location', 'advanced-property-location'],
        ['property-type', 'advanced-property-type'],
        ['property-rooms', 'advanced-property-rooms']
    ];

    fieldMappings.forEach(([sourceId, targetId]) => {
        const sourceValue = getValue(documentRef, sourceId);
        if (sourceValue) {
            setValue(documentRef, targetId, sourceValue);
        }
    });

    syncRoomsInputForSelectedType(
        getValue(documentRef, 'advanced-property-type'),
        getElement(documentRef, 'advanced-property-rooms')
    );
}

export function buildAdvancedPropertyDataFromForm(documentRef = document) {
    const selectedType = getValue(documentRef, 'advanced-property-type');
    const baseData = parseSelectedType(selectedType, getValue(documentRef, 'advanced-property-rooms'));
    const propertyData = assignCommonPropertyFields(
        {
            name: getValue(documentRef, 'advanced-property-name').trim(),
            location: getValue(documentRef, 'advanced-property-location').trim(),
            ...baseData,
            status: getValue(documentRef, 'advanced-property-status') || 'available'
        },
        'advanced',
        documentRef
    );

    const amenities = readCheckedAmenities(documentRef, ADVANCED_AMENITY_IDS);
    if (amenities.length > 0) {
        propertyData.amenities = amenities;
    }

    return propertyData;
}

export function clearAdvancedPropertyForm(documentRef = document) {
    const defaultValues = {
        'advanced-property-name': '',
        'advanced-property-location': '',
        'advanced-property-type': '',
        'advanced-property-rooms': '',
        'advanced-property-bathrooms': '',
        'advanced-property-floor': '',
        'advanced-property-status': 'available',
        'advanced-property-wifi-speed': '',
        'advanced-property-wifi-airbnb': 'no',
        'advanced-property-parking-spot': '',
        'advanced-property-parking-floor': '',
        'advanced-property-energy-source': '',
        'advanced-property-smart-tv': 'no'
    };

    Object.entries(defaultValues).forEach(([fieldId, value]) => {
        setValue(documentRef, fieldId, value);
    });

    ADVANCED_AMENITY_IDS.forEach((fieldId) => {
        const element = getElement(documentRef, fieldId);
        if (element) {
            element.checked = false;
        }
    });

    syncRoomsInputForSelectedType('', getElement(documentRef, 'advanced-property-rooms'));
    setText(documentRef, 'advanced-property-error', '');
}
