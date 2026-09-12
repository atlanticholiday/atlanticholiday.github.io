import {
    normalizePmsCalendarDataset,
    normalizeCalendarEvent
} from './property-calendar-utils.js';
import {
    renderPropertyCalendar,
    showReservationModal
} from './property-calendar-view.js';

const STORAGE_KEY = 'horario_pms_calendar_data';

export class PropertyCalendarManager {
    constructor(db = null, userId = null, navigationManager = null) {
        this.db = db;
        this.userId = userId;
        this.navigationManager = navigationManager;

        const today = new Date();
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const y = startOfMonth.getFullYear();
        const m = String(startOfMonth.getMonth() + 1).padStart(2, '0');
        const d = String(startOfMonth.getDate()).padStart(2, '0');

        this.state = {
            properties: [],
            startDate: `${y}-${m}-${d}`,
            daysCount: 60,
            searchQuery: ''
        };

        this.initialized = false;
        this.loadFromStorage();
    }

    setNavigationManager(navManager) {
        this.navigationManager = navManager;
    }

    init() {
        const container = document.getElementById('property-calendar-page');
        if (!container) return;

        this.render();

        // Attempt to load fresh data from server endpoint if empty
        if (!this.state.properties.length) {
            this.loadFromServer();
        }
    }

    loadFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const normalized = normalizePmsCalendarDataset(parsed);
                if (normalized.properties?.length) {
                    this.state.properties = normalized.properties;
                }
            }
        } catch (err) {
            console.warn('[PropertyCalendarManager] Could not load from localStorage:', err);
        }
    }

    saveToStorage(dataset) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(dataset));
        } catch (err) {
            console.warn('[PropertyCalendarManager] Could not save to localStorage:', err);
        }
    }

    async loadFromServer() {
        try {
            const res = await fetch('/api/pms-calendar');
            if (res.ok) {
                const json = await res.json();
                if (json.ok && json.data) {
                    const normalized = normalizePmsCalendarDataset(json.data);
                    if (normalized.properties?.length) {
                        this.state.properties = normalized.properties;
                        this.saveToStorage(json.data);
                        this.render();
                    }
                }
            }
        } catch (err) {
            // Silently fall back if backend server is not running
            console.log('[PropertyCalendarManager] Local backend endpoint not reached, using cached data.');
        }
    }

    async handleFileSelect(file) {
        if (!file) return;

        try {
            if (/\.json$/i.test(file.name)) {
                const text = await file.text();
                const json = JSON.parse(text);
                const normalized = normalizePmsCalendarDataset(json);
                if (normalized.properties?.length) {
                    this.state.properties = normalized.properties;
                    this.saveToStorage(json);
                    this.render();
                    alert(`Loaded ${normalized.properties.length} accommodations from ${file.name}`);
                }
            } else if (/\.(xlsx?|csv)$/i.test(file.name) && window.XLSX) {
                const buffer = await file.arrayBuffer();
                const workbook = window.XLSX.read(buffer, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName]);
                const normalized = normalizePmsCalendarDataset(rows);
                if (normalized.properties?.length) {
                    this.state.properties = normalized.properties;
                    this.saveToStorage({ properties: normalized.properties });
                    this.render();
                    alert(`Imported ${normalized.properties.length} accommodations from ${file.name}`);
                }
            }
        } catch (err) {
            console.error('[PropertyCalendarManager] File load error:', err);
            alert(`Could not load file: ${err.message}`);
        }
    }

    handleSyncClick() {
        alert(
            'To synchronize directly with Avantio PMS, run in your terminal:\n\n' +
            'npm run pms:sync-calendar\n\n' +
            'This opens Microsoft Edge, logs into your PMS, fetches the tape chart calendar data, and updates your dashboard!'
        );
    }

    render() {
        const container = document.getElementById('property-calendar-page');
        if (!container) return;

        renderPropertyCalendar(container, {
            ...this.state,
            onDateChange: (newDate) => {
                this.state.startDate = newDate;
                this.render();
            },
            onSearchChange: (query) => {
                this.state.searchQuery = query;
                this.render();
            },
            onDaysCountChange: (days) => {
                this.state.daysCount = days;
                this.render();
            },
            onSyncClick: () => this.handleSyncClick(),
            onFileSelect: (file) => this.handleFileSelect(file),
            onReservationClick: (res, prop) => showReservationModal(container, res, prop)
        });

        const backBtn = container.querySelector('#pms-back-btn');
        if (backBtn && this.navigationManager) {
            backBtn.addEventListener('click', () => {
                this.navigationManager.showLandingPage();
            });
        }
    }
}
