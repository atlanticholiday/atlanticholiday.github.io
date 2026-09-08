function normalizeArchiveValue(value) {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value?.toDate === 'function') return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(normalizeArchiveValue);
    if (typeof value === 'object') {
        return Object.keys(value)
            .sort()
            .reduce((result, key) => {
                result[key] = normalizeArchiveValue(value[key]);
                return result;
            }, {});
    }
    return String(value);
}

export function normalizeArchivePeriod(periodKey) {
    const normalized = String(periodKey || '').trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
        throw new Error('Attendance archive period must use YYYY-MM format');
    }
    return normalized;
}

export function getArchivePeriodRange(periodKey) {
    const normalized = normalizeArchivePeriod(periodKey);
    const [year, month] = normalized.split('-').map(Number);
    const end = new Date(Date.UTC(year, month, 0));
    return {
        startDateKey: `${normalized}-01`,
        endDateKey: end.toISOString().slice(0, 10)
    };
}

export async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function buildVerifiableAttendanceArchive({
    periodKey,
    attendanceRecords = [],
    overtimeRecords = [],
    canonicalEvents = [],
    exportedAt = new Date().toISOString()
}) {
    const period = normalizeArchivePeriod(periodKey);
    const payload = normalizeArchiveValue({
        schema: 'atlantic-holiday-attendance-archive/v1',
        period,
        exportedAt,
        counts: {
            attendanceRecords: attendanceRecords.length,
            overtimeRecords: overtimeRecords.length,
            canonicalEvents: canonicalEvents.length
        },
        attendanceRecords,
        overtimeRecords,
        canonicalEvents
    });
    const dataContent = `${JSON.stringify(payload, null, 2)}\n`;
    const dataHash = await sha256Hex(dataContent);
    const dataFilename = `arquivo-assiduidade_${period}.json`;
    const manifest = normalizeArchiveValue({
        schema: 'atlantic-holiday-attendance-manifest/v1',
        period,
        createdAt: exportedAt,
        algorithm: 'SHA-256',
        files: [{ name: dataFilename, sha256: dataHash, bytes: new TextEncoder().encode(dataContent).length }],
        instructions: 'Guardar este manifesto separadamente. Para comprovar integridade, recalcular SHA-256 do ficheiro JSON e comparar com o valor registado.'
    });
    return {
        dataFilename,
        dataContent,
        manifestFilename: `MANIFESTO-SHA256_${period}.json`,
        manifestContent: `${JSON.stringify(manifest, null, 2)}\n`,
        sha256: dataHash
    };
}
