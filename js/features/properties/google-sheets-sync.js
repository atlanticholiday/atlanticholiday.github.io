const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function cleanCell(value, maxLength = 200) {
    return typeof value === 'string'
        ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
        : '';
}

export function parseGoogleSheetPropertyRows(rows = []) {
    const properties = [];
    const errors = [];
    const seenNames = new Set();

    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
        const values = Array.isArray(row) ? row : [];
        const name = cleanCell(values[0]);
        const location = cleanCell(values[1]);
        const typology = cleanCell(values[2], 20).toUpperCase().replace(/\s+/g, '');

        if (!name && !location && !typology) return;

        const typologyMatch = typology.match(/^([TV])(\d{1,2})$/);
        if (!name || !location || !typologyMatch) {
            errors.push(`Row ${index + 3}: expected name, location, and a typology such as T2 or V3.`);
            return;
        }

        const normalizedName = name.toLocaleLowerCase('pt-PT');
        if (seenNames.has(normalizedName)) {
            errors.push(`Row ${index + 3}: duplicate property name "${name}".`);
            return;
        }
        seenNames.add(normalizedName);

        const rooms = Number.parseInt(typologyMatch[2], 10);
        properties.push({
            name,
            location,
            typology,
            type: typologyMatch[1] === 'T' ? 'apartment' : 'villa',
            rooms
        });
    });

    return { properties, errors };
}

function requestGoogleAccessToken(clientId) {
    const oauth = globalThis.google?.accounts?.oauth2;
    if (!oauth?.initTokenClient) {
        throw new Error('Google authorization is still loading. Please try again.');
    }

    return new Promise((resolve, reject) => {
        const tokenClient = oauth.initTokenClient({
            client_id: clientId,
            scope: SHEETS_READONLY_SCOPE,
            include_granted_scopes: true,
            callback: (response) => {
                if (response?.error || !response?.access_token) {
                    reject(new Error(response?.error_description || response?.error || 'Google authorization was not completed.'));
                    return;
                }
                resolve(response.access_token);
            },
            error_callback: (error) => {
                const message = error?.type === 'popup_closed'
                    ? 'Google authorization was cancelled.'
                    : 'The Google authorization window could not be opened.';
                reject(new Error(message));
            }
        });

        tokenClient.requestAccessToken();
    });
}

export async function fetchGoogleSheetProperties({ clientId, spreadsheetId, range }) {
    const normalizedClientId = cleanCell(clientId, 300);
    const normalizedSpreadsheetId = cleanCell(spreadsheetId, 200);
    const normalizedRange = cleanCell(range, 200);

    if (!normalizedClientId || !normalizedSpreadsheetId || !normalizedRange) {
        throw new Error('Google Sheets sync is not configured.');
    }

    const accessToken = await requestGoogleAccessToken(normalizedClientId);
    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(normalizedSpreadsheetId)}/values/${encodeURIComponent(normalizedRange)}?majorDimension=ROWS`;
    const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
    });

    if (!response.ok) {
        let detail = '';
        try {
            const payload = await response.json();
            detail = cleanCell(payload?.error?.message, 300);
        } catch {
            // Keep the user-facing fallback below.
        }
        throw new Error(detail || `Google Sheets returned ${response.status}.`);
    }

    const payload = await response.json();
    return parseGoogleSheetPropertyRows(payload?.values || []);
}
