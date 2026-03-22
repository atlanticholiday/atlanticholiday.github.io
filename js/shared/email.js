function normalizeRawEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : null;
}

export function canonicalizeEmail(value) {
    const normalized = normalizeRawEmail(value);
    if (!normalized || !normalized.includes('@')) {
        return normalized;
    }

    const [localPart, domainPart] = normalized.split('@');
    if (!localPart || !domainPart) {
        return normalized;
    }

    if (domainPart === 'gmail.com' || domainPart === 'googlemail.com') {
        const plusIndex = localPart.indexOf('+');
        const trimmedLocal = plusIndex >= 0 ? localPart.slice(0, plusIndex) : localPart;
        const canonicalLocal = trimmedLocal.replace(/\./g, '');
        return `${canonicalLocal}@gmail.com`;
    }

    return normalized;
}

export function getEmailLookupKeys(value) {
    const raw = normalizeRawEmail(value);
    const canonical = canonicalizeEmail(value);
    return [...new Set([canonical, raw].filter(Boolean))];
}

export function getNormalizedEmailDisplay(value) {
    return normalizeRawEmail(value);
}
