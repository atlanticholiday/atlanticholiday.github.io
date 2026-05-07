const PROPERTY_TYPE_BY_PREFIX = {
    T: "apartment",
    V: "villa"
};

function normalizeHeader(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

function normalizeComparableText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

export function normalizePropertyTypology(value) {
    const normalized = String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

    const match = normalized.match(/^([TV])(\d+)$/);
    if (!match) {
        return null;
    }

    const [, prefix, roomText] = match;
    const rooms = Number.parseInt(roomText, 10);
    if (Number.isNaN(rooms) || rooms < 0 || rooms > 50) {
        return null;
    }

    return {
        typology: `${prefix}${rooms}`,
        type: PROPERTY_TYPE_BY_PREFIX[prefix],
        rooms
    };
}

function findHeaderMap(rows) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        const headers = new Map();

        row.forEach((cell, columnIndex) => {
            const key = normalizeHeader(cell);
            if (key) {
                headers.set(key, columnIndex);
            }
        });

        const nameIndex = headers.get("alojamento");
        const locationIndex = headers.get("localizacao");
        const typologyIndex = headers.get("tipologia");

        if (nameIndex !== undefined && locationIndex !== undefined && typologyIndex !== undefined) {
            return {
                rowIndex,
                columns: {
                    name: nameIndex,
                    location: locationIndex,
                    typology: typologyIndex
                }
            };
        }
    }

    return null;
}

export function parseAlojamentosRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const headerMap = findHeaderMap(safeRows);
    const properties = [];
    const errors = [];

    if (!headerMap) {
        return {
            properties,
            errors: [{
                lineNumber: 0,
                error: 'Could not find the required headers: "Alojamento", "Localização", "Tipologia".'
            }]
        };
    }

    safeRows.slice(headerMap.rowIndex + 1).forEach((row, index) => {
        const lineNumber = headerMap.rowIndex + index + 2;
        const name = String(row?.[headerMap.columns.name] ?? "").trim();
        const location = String(row?.[headerMap.columns.location] ?? "").trim();
        const rawTypology = String(row?.[headerMap.columns.typology] ?? "").trim();

        if (!name && !location && !rawTypology) {
            return;
        }

        if (!name || !location || !rawTypology) {
            errors.push({
                lineNumber,
                error: "Missing property name, location, or typology."
            });
            return;
        }

        const parsedTypology = normalizePropertyTypology(rawTypology);
        if (!parsedTypology) {
            errors.push({
                lineNumber,
                error: `Invalid typology "${rawTypology}". Use T0, T1, T2 or V1, V2, V3.`
            });
            return;
        }

        properties.push({
            name,
            location,
            ...parsedTypology,
            description: `${parsedTypology.typology} - ${parsedTypology.rooms === 0 ? "Studio" : `${parsedTypology.rooms} bedroom${parsedTypology.rooms > 1 ? "s" : ""}`}`,
            status: "available"
        });
    });

    return { properties, errors };
}

export function compareAlojamentosProperties(existingProperties = [], importedProperties = []) {
    const existingByName = new Map();

    existingProperties.forEach((property) => {
        const key = normalizeComparableText(property.name);
        if (key) {
            existingByName.set(key, property);
        }
    });

    const importedByName = new Map();
    const matched = [];
    const missingInApp = [];
    const differences = [];

    importedProperties.forEach((property) => {
        const key = normalizeComparableText(property.name);
        if (key) {
            importedByName.set(key, property);
        }

        const existing = existingByName.get(key);
        if (!existing) {
            missingInApp.push(property);
            return;
        }

        matched.push({ existing, imported: property });

        const fieldChanges = [];
        const existingLocation = normalizeComparableText(existing.location);
        const importedLocation = normalizeComparableText(property.location);
        const existingTypology = normalizeComparableText(existing.typology || existing.type);
        const importedTypology = normalizeComparableText(property.typology);

        if (existingLocation !== importedLocation) {
            fieldChanges.push({
                field: "location",
                existing: existing.location ?? "",
                imported: property.location ?? ""
            });
        }

        if (existingTypology !== importedTypology) {
            fieldChanges.push({
                field: "typology",
                existing: existing.typology || existing.type || "",
                imported: property.typology ?? ""
            });
        }

        if (fieldChanges.length > 0) {
            differences.push({
                name: property.name,
                existing,
                imported: property,
                fields: fieldChanges
            });
        }
    });

    const extraInApp = existingProperties.filter((property) => {
        const key = normalizeComparableText(property.name);
        return key && !importedByName.has(key);
    });

    return {
        matched,
        missingInApp,
        extraInApp,
        differences,
        totals: {
            existing: existingProperties.length,
            imported: importedProperties.length,
            matched: matched.length,
            missingInApp: missingInApp.length,
            extraInApp: extraInApp.length,
            differences: differences.length
        }
    };
}
