const ITEM_GROUPS = [
    {
        key: "doubleBed",
        labelKey: "sections.doubleBed",
        items: [
            { key: "doubleMattressProtector", labelKey: "items.doubleMattressProtector" },
            { key: "doubleFittedSheet", labelKey: "items.doubleFittedSheet" },
            { key: "doubleTopSheet", labelKey: "items.doubleTopSheet" },
            { key: "doubleDuvet", labelKey: "items.doubleDuvet" },
            { key: "doubleDuvetCover", labelKey: "items.doubleDuvetCover" }
        ]
    },
    {
        key: "singleBed",
        labelKey: "sections.singleBed",
        items: [
            { key: "singleMattressProtector", labelKey: "items.singleMattressProtector" },
            { key: "singleFittedSheet", labelKey: "items.singleFittedSheet" },
            { key: "singleTopSheet", labelKey: "items.singleTopSheet" },
            { key: "singleDuvet", labelKey: "items.singleDuvet" },
            { key: "singleDuvetCover", labelKey: "items.singleDuvetCover" }
        ]
    },
    {
        key: "towels",
        labelKey: "sections.towels",
        items: [
            { key: "bathTowel", labelKey: "items.bathTowel" },
            { key: "faceTowel", labelKey: "items.faceTowel" },
            { key: "poolTowel", labelKey: "items.poolTowel" },
            { key: "bathMat", labelKey: "items.bathMat" }
        ]
    },
    {
        key: "pillows",
        labelKey: "sections.pillows",
        items: [
            { key: "pillows", labelKey: "items.pillows" },
            { key: "pillowProtectors", labelKey: "items.pillowProtectors" },
            { key: "pillowCases", labelKey: "items.pillowCases" }
        ]
    },
    {
        key: "other",
        labelKey: "sections.other",
        items: [
            { key: "kitchenTowels", labelKey: "items.kitchenTowels" },
            { key: "blankets", labelKey: "items.blankets" }
        ]
    }
];

const ITEM_KEYS = ITEM_GROUPS.flatMap((group) => group.items.map((item) => item.key));

export const LINEN_INVENTORY_GROUPS = Object.freeze(
    ITEM_GROUPS.map((group) => Object.freeze({
        ...group,
        items: Object.freeze(group.items.map((item) => Object.freeze({ ...item })))
    }))
);

function normalizeText(value) {
    return String(value || "").trim();
}

function normalizeCount(value) {
    if (value === null || value === undefined || value === "") {
        return 0;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }

    return Math.max(0, Math.round(numeric));
}

function normalizeItemCount(rawValue = {}) {
    if (rawValue.count !== undefined) return normalizeCount(rawValue.count);
    if (rawValue.counted !== undefined) return normalizeCount(rawValue.counted);
    if (rawValue.expected !== undefined) return normalizeCount(rawValue.expected);
    return normalizeCount(rawValue.setup) + normalizeCount(rawValue.spare);
}

function buildSearchText(record = {}) {
    return [
        record.propertyName,
        record.notes,
        record.countedDate,
        record.lastCountedAt,
        ...(record.customItems || []).map((item) => item.name)
    ]
        .map((value) => normalizeText(value).toLocaleLowerCase())
        .filter(Boolean)
        .join(" ");
}

export function createEmptyLinenInventoryItems(overrides = {}) {
    const normalized = {};
    ITEM_KEYS.forEach((itemKey) => {
        normalized[itemKey] = {
            count: normalizeItemCount(overrides[itemKey] || {})
        };
    });
    return normalized;
}

export function createEmptyCustomLinenInventoryItems(overrides = []) {
    if (!Array.isArray(overrides)) {
        return [];
    }

    return overrides
        .map((item) => ({
            name: normalizeText(item?.name),
            count: normalizeItemCount(item || {})
        }))
        .filter((item) => item.name || item.count > 0);
}

export function summarizeLinenInventoryRecord(record = {}) {
    const items = createEmptyLinenInventoryItems(record.items);
    const customItems = createEmptyCustomLinenInventoryItems(record.customItems);
    const sectionSummaries = LINEN_INVENTORY_GROUPS.map((group) => {
        let rows = group.items.map((item) => {
            const count = items[item.key]?.count || 0;
            return {
                key: item.key,
                labelKey: item.labelKey,
                count
            };
        });

        if (group.key === "other") {
            rows = [
                ...rows,
                ...customItems.map((item, index) => ({
                    key: `custom:${index}`,
                    custom: true,
                    name: item.name,
                    count: item.count
                }))
            ];
        }

        return {
            key: group.key,
            labelKey: group.labelKey,
            count: rows.reduce((sum, row) => sum + row.count, 0),
            itemCount: rows.filter((row) => row.count > 0).length,
            items: rows
        };
    });

    const countedUnits = sectionSummaries.reduce((sum, section) => sum + section.count, 0);
    const trackedItems = sectionSummaries.reduce((sum, section) => sum + section.itemCount, 0);

    return {
        countedUnits,
        trackedItems,
        status: countedUnits > 0 ? "counted" : "empty",
        sectionSummaries
    };
}

export function createLinenInventoryRecord(input = {}, { now = () => new Date().toISOString() } = {}) {
    const normalizedRecord = {
        propertyId: normalizeText(input.propertyId),
        propertyName: normalizeText(input.propertyName),
        countedDate: normalizeText(input.countedDate || input.lastCountedAt),
        notes: normalizeText(input.notes),
        items: createEmptyLinenInventoryItems(input.items),
        customItems: createEmptyCustomLinenInventoryItems(input.customItems),
        createdAt: normalizeText(input.createdAt) || now(),
        updatedAt: now()
    };
    const summary = summarizeLinenInventoryRecord(normalizedRecord);

    return {
        ...normalizedRecord,
        lastCountedAt: normalizedRecord.countedDate,
        status: summary.status,
        countedUnits: summary.countedUnits,
        trackedItems: summary.trackedItems,
        searchText: buildSearchText(normalizedRecord)
    };
}

export function filterLinenInventoryRecords(records = [], filters = {}) {
    const query = normalizeText(filters.query).toLocaleLowerCase();

    return records
        .map((record) => {
            const normalized = createLinenInventoryRecord(record, {
                now: () => normalizeText(record.updatedAt) || new Date(0).toISOString()
            });
            return {
                ...record,
                ...normalized,
                summary: summarizeLinenInventoryRecord(normalized)
            };
        })
        .filter((record) => !query || record.searchText.includes(query))
        .sort((left, right) => {
            const dateCompare = String(right.countedDate || "").localeCompare(String(left.countedDate || ""));
            if (dateCompare !== 0) return dateCompare;
            const propertyCompare = String(left.propertyName || "").localeCompare(String(right.propertyName || ""));
            if (propertyCompare !== 0) return propertyCompare;
            return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
        });
}

export function summarizeLinenInventoryRecords(records = []) {
    const decorated = filterLinenInventoryRecords(records);

    return {
        records: decorated,
        totals: {
            count: decorated.length,
            countedUnits: decorated.reduce((sum, record) => sum + record.countedUnits, 0),
            trackedItems: decorated.reduce((sum, record) => sum + record.trackedItems, 0)
        }
    };
}
