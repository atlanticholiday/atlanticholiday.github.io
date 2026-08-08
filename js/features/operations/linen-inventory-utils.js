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

export const LINEN_INVENTORY_WORKFLOW_STATUSES = Object.freeze([
    "draft",
    "submitted",
    "needsCorrection",
    "approved",
    "archived"
]);

export const LINEN_INVENTORY_ISSUES = Object.freeze([
    "missing",
    "damaged"
]);

const WORKFLOW_STATUS_SET = new Set(LINEN_INVENTORY_WORKFLOW_STATUSES);
const ISSUE_SET = new Set(LINEN_INVENTORY_ISSUES);

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

function normalizeActor(actor = {}) {
    if (!actor || typeof actor !== "object") {
        return {};
    }
    return {
        uid: normalizeText(actor.uid),
        email: normalizeText(actor.email),
        name: normalizeText(actor.name)
    };
}

function normalizeIssue(value) {
    const issue = normalizeText(value);
    return ISSUE_SET.has(issue) ? issue : "";
}

function normalizeItem(rawValue = {}) {
    const count = normalizeItemCount(rawValue);
    const legacyPositiveCount = count > 0;
    return {
        count,
        checked: rawValue.checked === undefined
            ? legacyPositiveCount
            : Boolean(rawValue.checked),
        target: normalizeCount(rawValue.target),
        issue: normalizeIssue(rawValue.issue),
        note: normalizeText(rawValue.note)
    };
}

function normalizeWorkflowStatus(value, countStatus = "empty") {
    const status = normalizeText(value);
    if (WORKFLOW_STATUS_SET.has(status)) {
        return status;
    }
    if (status === "counted") {
        return "submitted";
    }
    if (status === "empty") {
        return "draft";
    }
    return countStatus === "counted" ? "submitted" : "draft";
}

export function getLinenInventoryWorkflowStatus(record = {}) {
    const countStatus = record.status === "counted" || Number(record.trackedItems || 0) > 0
        ? "counted"
        : "empty";
    return normalizeWorkflowStatus(record.workflowStatus || record.status, countStatus);
}

export function isLinenInventoryRecordEditableByColleague(record = {}, actorUid = "") {
    const ownerUid = normalizeText(record.createdBy?.uid);
    const currentUid = normalizeText(actorUid);
    const workflowStatus = getLinenInventoryWorkflowStatus(record);
    return Boolean(
        currentUid
        && ownerUid === currentUid
        && (workflowStatus === "draft" || workflowStatus === "needsCorrection")
    );
}

export function createEmptyBedroomLayout(overrides = []) {
    if (!Array.isArray(overrides)) {
        return [];
    }

    return overrides
        .map((bedroom) => {
            const beds = Array.isArray(bedroom?.beds) ? bedroom.beds : [];
            return {
                name: normalizeText(bedroom?.name),
                beds: beds
                    .map((bed) => ({
                        type: normalizeText(bed?.type),
                        size: normalizeText(bed?.size)
                    }))
                    .filter((bed) => bed.type || bed.size)
            };
        })
        .filter((bedroom) => bedroom.name || bedroom.beds.length > 0);
}

function normalizeBedroomCount(value) {
    const count = normalizeCount(value);
    return count > 0 ? count : 1;
}

export function createEmptyLinenInventorySections(overrides = {}) {
    const normalized = {};
    ITEM_GROUPS.forEach((group) => {
        normalized[group.key] = {
            bedroomCount: normalizeBedroomCount(overrides[group.key]?.bedroomCount),
            bedSize: normalizeText(overrides[group.key]?.bedSize || overrides[group.key]?.size),
            notApplicable: Boolean(overrides[group.key]?.notApplicable)
        };
    });
    return normalized;
}

function buildSearchText(record = {}) {
    return [
        record.propertyName,
        record.notes,
        record.reviewNote,
        record.countedDate,
        record.lastCountedAt,
        record.workflowStatus,
        record.createdBy?.name,
        record.createdBy?.email,
        record.submittedBy?.name,
        record.submittedBy?.email,
        record.reviewedBy?.name,
        record.reviewedBy?.email,
        ...(record.bedrooms || []).flatMap((bedroom) => [
            bedroom.name,
            ...(bedroom.beds || []).flatMap((bed) => [bed.type, bed.size])
        ]),
        ...Object.values(record.sections || {}).map((section) => section?.bedSize),
        ...Object.values(record.items || {}).flatMap((item) => [item?.issue, item?.note]),
        ...(record.customItems || []).flatMap((item) => [item?.name, item?.issue, item?.note])
    ]
        .map((value) => normalizeText(value).toLocaleLowerCase())
        .filter(Boolean)
        .join(" ");
}

export function createEmptyLinenInventoryItems(overrides = {}) {
    const normalized = {};
    ITEM_KEYS.forEach((itemKey) => {
        normalized[itemKey] = normalizeItem(overrides[itemKey] || {});
    });
    return normalized;
}

export function createEmptyLinenInventoryTargets(overrides = {}) {
    const normalized = {};
    if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        return normalized;
    }
    ITEM_KEYS.forEach((itemKey) => {
        const rawValue = overrides[itemKey];
        const target = normalizeCount(rawValue && typeof rawValue === "object" ? rawValue.target : rawValue);
        if (target > 0) {
            normalized[itemKey] = target;
        }
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
            ...normalizeItem(item || {})
        }))
        .filter((item) => item.name || item.checked || item.count > 0 || item.target > 0 || item.issue || item.note);
}

export function createEmptyLinenInventoryPhotos(overrides = []) {
    if (!Array.isArray(overrides)) {
        return [];
    }

    return overrides
        .map((photo) => ({
            name: normalizeText(photo?.name),
            path: normalizeText(photo?.path),
            url: normalizeText(photo?.url),
            uploadedAt: normalizeText(photo?.uploadedAt),
            uploadedBy: normalizeActor(photo?.uploadedBy)
        }))
        .filter((photo) => photo.path && photo.url);
}

export function summarizeLinenInventoryRecord(record = {}) {
    const items = createEmptyLinenInventoryItems(record.items);
    if (Object.prototype.hasOwnProperty.call(record, "targets")) {
        const targets = createEmptyLinenInventoryTargets(record.targets);
        Object.keys(items).forEach((itemKey) => {
            items[itemKey].target = Number(targets[itemKey] || 0);
        });
    }
    const customItems = createEmptyCustomLinenInventoryItems(record.customItems);
    const sections = createEmptyLinenInventorySections(record.sections);
    const sectionSummaries = LINEN_INVENTORY_GROUPS.map((group) => {
        let rows = group.items.map((item) => {
            const inventoryItem = items[item.key] || normalizeItem();
            return {
                key: item.key,
                labelKey: item.labelKey,
                ...inventoryItem,
                difference: inventoryItem.checked ? inventoryItem.count - inventoryItem.target : 0,
                shortage: inventoryItem.checked ? Math.max(0, inventoryItem.target - inventoryItem.count) : 0
            };
        });

        if (group.key === "other") {
            rows = [
                ...rows,
                ...customItems.map((item, index) => ({
                    key: `custom:${index}`,
                    custom: true,
                    name: item.name,
                    ...item,
                    difference: item.checked ? item.count - item.target : 0,
                    shortage: item.checked ? Math.max(0, item.target - item.count) : 0
                }))
            ];
        }

        const notApplicable = Boolean(sections[group.key]?.notApplicable);
        const requiredItemCount = rows.length;
        const completedItemCount = notApplicable
            ? requiredItemCount
            : rows.filter((row) => row.checked).length;

        return {
            key: group.key,
            labelKey: group.labelKey,
            bedroomCount: sections[group.key]?.bedroomCount || 1,
            bedSize: sections[group.key]?.bedSize || "",
            notApplicable,
            count: notApplicable ? 0 : rows.reduce((sum, row) => sum + (row.checked ? row.count : 0), 0),
            itemCount: notApplicable ? 0 : rows.filter((row) => row.checked).length,
            requiredItemCount,
            completedItemCount,
            shortageUnits: notApplicable ? 0 : rows.reduce((sum, row) => sum + row.shortage, 0),
            issueCount: notApplicable ? 0 : rows.filter((row) => row.issue).length,
            items: rows
        };
    });

    const countedUnits = sectionSummaries.reduce((sum, section) => sum + section.count, 0);
    const trackedItems = sectionSummaries.reduce((sum, section) => sum + section.itemCount, 0);
    const shortageUnits = sectionSummaries.reduce((sum, section) => sum + section.shortageUnits, 0);
    const issueCount = sectionSummaries.reduce((sum, section) => sum + section.issueCount, 0);
    const totalItems = sectionSummaries.reduce((sum, section) => sum + section.requiredItemCount, 0);
    const completedItems = sectionSummaries.reduce((sum, section) => sum + section.completedItemCount, 0);
    const remainingItems = Math.max(0, totalItems - completedItems);

    return {
        countedUnits,
        trackedItems,
        shortageUnits,
        issueCount,
        status: trackedItems > 0 ? "counted" : "empty",
        completion: {
            totalItems,
            completedItems,
            remainingItems,
            percent: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
            complete: totalItems > 0 && remainingItems === 0
        },
        sectionSummaries
    };
}

export function createLinenInventoryRecord(input = {}, { now = () => new Date().toISOString() } = {}) {
    const timestamp = now();
    const items = createEmptyLinenInventoryItems(input.items);
    const hasExplicitTargets = Object.prototype.hasOwnProperty.call(input, "targets");
    const targets = createEmptyLinenInventoryTargets(hasExplicitTargets ? input.targets : items);
    Object.keys(items).forEach((itemKey) => {
        items[itemKey].target = Number(targets[itemKey] || 0);
    });
    const normalizedRecord = {
        propertyId: normalizeText(input.propertyId),
        propertyName: normalizeText(input.propertyName),
        countedDate: normalizeText(input.countedDate || input.lastCountedAt),
        notes: normalizeText(input.notes),
        bedrooms: createEmptyBedroomLayout(input.bedrooms),
        sections: createEmptyLinenInventorySections(input.sections),
        items,
        targets,
        customItems: createEmptyCustomLinenInventoryItems(input.customItems),
        photos: createEmptyLinenInventoryPhotos(input.photos),
        createdBy: normalizeActor(input.createdBy),
        updatedBy: normalizeActor(input.updatedBy),
        submittedBy: normalizeActor(input.submittedBy),
        reviewedBy: normalizeActor(input.reviewedBy),
        reviewNote: normalizeText(input.reviewNote),
        createdAt: normalizeText(input.createdAt) || timestamp,
        updatedAt: timestamp,
        submittedAt: normalizeText(input.submittedAt),
        reviewedAt: normalizeText(input.reviewedAt),
        archivedAt: normalizeText(input.archivedAt)
    };
    const summary = summarizeLinenInventoryRecord(normalizedRecord);
    const workflowStatus = normalizeWorkflowStatus(input.workflowStatus || input.status, summary.status);

    return {
        ...normalizedRecord,
        lastCountedAt: normalizedRecord.countedDate,
        status: summary.status,
        workflowStatus,
        countedUnits: summary.countedUnits,
        trackedItems: summary.trackedItems,
        shortageUnits: summary.shortageUnits,
        issueCount: summary.issueCount,
        completionPercent: summary.completion.percent,
        searchText: buildSearchText({ ...normalizedRecord, workflowStatus })
    };
}

export function filterLinenInventoryRecords(records = [], filters = {}) {
    const query = normalizeText(filters.query).toLocaleLowerCase();
    const workflowStatus = normalizeText(filters.workflowStatus);
    const dateFrom = normalizeText(filters.dateFrom);
    const dateTo = normalizeText(filters.dateTo);

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
        .filter((record) => !workflowStatus || workflowStatus === "all" || record.workflowStatus === workflowStatus)
        .filter((record) => !dateFrom || String(record.countedDate || "") >= dateFrom)
        .filter((record) => !dateTo || String(record.countedDate || "") <= dateTo)
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
            trackedItems: decorated.reduce((sum, record) => sum + record.trackedItems, 0),
            pendingReview: decorated.filter((record) => record.workflowStatus === "submitted").length,
            needsCorrection: decorated.filter((record) => record.workflowStatus === "needsCorrection").length,
            approved: decorated.filter((record) => record.workflowStatus === "approved").length,
            shortageUnits: decorated.reduce((sum, record) => sum + Number(record.shortageUnits || 0), 0),
            issueCount: decorated.reduce((sum, record) => sum + Number(record.issueCount || 0), 0)
        }
    };
}
