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

export const LAUNDRY_LOG_GROUPS = Object.freeze(
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

function buildSearchText(record = {}) {
    return [
        record.propertyName,
        record.deliveryDate,
        record.receivedDate,
        record.notes
    ]
        .map((value) => normalizeText(value).toLocaleLowerCase())
        .filter(Boolean)
        .join(" ");
}

export function createEmptyLaundryLogItems(overrides = {}) {
    const normalized = {};
    ITEM_KEYS.forEach((itemKey) => {
        const rawValue = overrides[itemKey] || {};
        normalized[itemKey] = {
            delivered: normalizeCount(rawValue.delivered),
            received: normalizeCount(rawValue.received)
        };
    });
    return normalized;
}

export function summarizeLaundryLogRecord(record = {}) {
    const items = createEmptyLaundryLogItems(record.items);
    const sectionSummaries = LAUNDRY_LOG_GROUPS.map((group) => {
        const rows = group.items.map((item) => {
            const counts = items[item.key];
            return {
                key: item.key,
                labelKey: item.labelKey,
                delivered: counts.delivered,
                received: counts.received,
                difference: counts.delivered - counts.received
            };
        });

        return {
            key: group.key,
            labelKey: group.labelKey,
            delivered: rows.reduce((sum, row) => sum + row.delivered, 0),
            received: rows.reduce((sum, row) => sum + row.received, 0),
            items: rows
        };
    });

    const mismatches = sectionSummaries
        .flatMap((section) => section.items)
        .filter((item) => (item.delivered > 0 || item.received > 0) && item.delivered !== item.received)
        .map((item) => ({
            key: item.key,
            labelKey: item.labelKey,
            delivered: item.delivered,
            received: item.received,
            missing: Math.max(item.delivered - item.received, 0),
            extra: Math.max(item.received - item.delivered, 0)
        }));

    const deliveredUnits = sectionSummaries.reduce((sum, section) => sum + section.delivered, 0);
    const receivedUnits = sectionSummaries.reduce((sum, section) => sum + section.received, 0);
    const receivedStarted = Boolean(normalizeText(record.receivedDate)) || receivedUnits > 0;
    const differenceUnits = mismatches.reduce((sum, mismatch) => {
        return sum + Math.abs(mismatch.delivered - mismatch.received);
    }, 0);

    let status = "pending";
    if (receivedStarted) {
        status = mismatches.length > 0 ? "mismatch" : "matched";
    }

    return {
        deliveredUnits,
        receivedUnits,
        differenceUnits,
        receivedStarted,
        status,
        mismatches,
        sectionSummaries
    };
}

export function createLaundryLogRecord(input = {}, { now = () => new Date().toISOString() } = {}) {
    const normalizedRecord = {
        propertyId: normalizeText(input.propertyId),
        propertyName: normalizeText(input.propertyName),
        deliveryDate: normalizeText(input.deliveryDate),
        receivedDate: normalizeText(input.receivedDate),
        notes: normalizeText(input.notes),
        items: createEmptyLaundryLogItems(input.items),
        createdAt: normalizeText(input.createdAt) || now(),
        updatedAt: now()
    };

    const summary = summarizeLaundryLogRecord(normalizedRecord);

    return {
        ...normalizedRecord,
        monthKey: normalizedRecord.deliveryDate.slice(0, 7),
        status: summary.status,
        deliveredUnits: summary.deliveredUnits,
        receivedUnits: summary.receivedUnits,
        differenceUnits: summary.differenceUnits,
        mismatchItemKeys: summary.mismatches.map((item) => item.key),
        searchText: buildSearchText(normalizedRecord)
    };
}

export function filterLaundryLogRecords(records = [], filters = {}) {
    const query = normalizeText(filters.query).toLocaleLowerCase();
    const statusFilter = normalizeText(filters.status);
    const monthFilter = normalizeText(filters.month);

    return records
        .map((record) => {
            const normalized = createLaundryLogRecord(record, {
                now: () => normalizeText(record.updatedAt) || new Date(0).toISOString()
            });
            const summary = summarizeLaundryLogRecord(normalized);
            return {
                ...record,
                ...normalized,
                summary
            };
        })
        .filter((record) => {
            if (statusFilter && statusFilter !== "all" && record.status !== statusFilter) {
                return false;
            }

            if (monthFilter && monthFilter !== "all" && record.monthKey !== monthFilter) {
                return false;
            }

            if (query && !record.searchText.includes(query)) {
                return false;
            }

            return true;
        })
        .sort((left, right) => {
            const dateCompare = String(right.deliveryDate || "").localeCompare(String(left.deliveryDate || ""));
            if (dateCompare !== 0) {
                return dateCompare;
            }

            return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
        });
}

export function summarizeLaundryLogRecords(records = []) {
    const decorated = filterLaundryLogRecords(records);

    return {
        records: decorated,
        totals: {
            count: decorated.length,
            pending: decorated.filter((record) => record.status === "pending").length,
            matched: decorated.filter((record) => record.status === "matched").length,
            mismatch: decorated.filter((record) => record.status === "mismatch").length,
            deliveredUnits: decorated.reduce((sum, record) => sum + record.deliveredUnits, 0),
            receivedUnits: decorated.reduce((sum, record) => sum + record.receivedUnits, 0)
        }
    };
}
