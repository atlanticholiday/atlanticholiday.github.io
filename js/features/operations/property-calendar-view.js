import {
    generateDateTimeline,
    calculateReservationPlacement,
    filterProperties,
    PMS_STATUS_CONFIG
} from './property-calendar-utils.js';

export function renderPropertyCalendar(container, state) {
    if (!container) return;

    const {
        properties = [],
        startDate,
        daysCount = 60,
        searchQuery = '',
        onDateChange,
        onSearchChange,
        onDaysCountChange,
        onSyncClick,
        onFileSelect,
        onReservationClick
    } = state;

    const timeline = generateDateTimeline(startDate, daysCount);
    const filteredProps = filterProperties(properties, searchQuery);

    // Calculate month labels for toolbar
    const startMonth = timeline[0] ? `${timeline[0].monthName} ${timeline[0].year}` : '';
    const endMonth = timeline[timeline.length - 1] ? `${timeline[timeline.length - 1].monthName} ${timeline[timeline.length - 1].year}` : '';
    const dateRangeLabel = startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`;

    const cellWidth = 44; // match CSS px width

    container.innerHTML = `
        <div class="pms-calendar-page">
            <!-- Header Toolbar -->
            <header class="pms-header-bar">
                <div class="pms-title-group">
                    <button id="pms-back-btn" class="pms-btn" title="Back to Landing">
                        <i class="fas fa-arrow-left"></i>
                    </button>
                    <h1>Property Calendar</h1>
                    <span class="pms-badge-count">${filteredProps.length} accommodations</span>
                </div>

                <div class="pms-toolbar">
                    <div class="pms-search-box">
                        <i class="fas fa-search pms-search-icon"></i>
                        <input type="search" id="pms-search-input" placeholder="Search accommodation or guest..." value="${escapeHtml(searchQuery)}">
                    </div>

                    <div class="pms-nav-group">
                        <button id="pms-prev-btn" title="Previous month"><i class="fas fa-chevron-left"></i></button>
                        <button id="pms-today-btn">Today</button>
                        <button id="pms-next-btn" title="Next month"><i class="fas fa-chevron-right"></i></button>
                    </div>

                    <span class="pms-current-date-label">${dateRangeLabel}</span>

                    <select id="pms-days-select" class="pms-btn">
                        <option value="14" ${daysCount === 14 ? 'selected' : ''}>14 days</option>
                        <option value="30" ${daysCount === 30 ? 'selected' : ''}>30 days</option>
                        <option value="60" ${daysCount === 60 ? 'selected' : ''}>60 days</option>
                        <option value="90" ${daysCount === 90 ? 'selected' : ''}>90 days</option>
                    </select>

                    <input type="file" id="pms-file-input" accept=".json,.xlsx,.xls,.csv" hidden>
                    <button id="pms-upload-btn" class="pms-btn" title="Import JSON or Excel">
                        <i class="fas fa-file-import"></i> Load File
                    </button>
                    <button id="pms-sync-btn" class="pms-btn pms-btn--primary" title="Sync with PMS via local runner">
                        <i class="fas fa-sync-alt"></i> Sync PMS
                    </button>
                </div>
            </header>

            <!-- Legend Bar -->
            <div class="pms-legend-bar">
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#f97316"></span> Pre-booking</span>
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#22c55e"></span> Confirmed</span>
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#15803d"></span> Paid</span>
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#0284c7"></span> Owner booking</span>
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#ef4444"></span> Blocked</span>
                <span class="pms-legend-item"><span class="pms-legend-dot" style="background:#eab308"></span> Under Request</span>
            </div>

            <!-- Tape Chart Container -->
            <div class="pms-chart-container" id="pms-chart-container">
                ${filteredProps.length === 0 ? `
                    <div class="pms-empty-state">
                        <i class="fas fa-calendar-times"></i>
                        <p class="text-lg font-semibold">No accommodations found</p>
                        <p class="text-sm">Click "Sync PMS" or "Load File" to populate the calendar.</p>
                    </div>
                ` : `
                    <div class="pms-chart-table">
                        <!-- Header Row -->
                        <div class="pms-timeline-header-wrap">
                            <div class="pms-col-prop-header">Accommodation</div>
                            <div class="pms-days-track">
                                ${timeline.map((day) => `
                                    <div class="pms-day-header ${day.isWeekend ? 'pms-day-header--weekend' : ''} ${day.isToday ? 'pms-day-header--today' : ''}"
                                         title="${day.dateKey} (${day.monthName})">
                                        <span class="pms-day-header__letter">${day.dayLetter}</span>
                                        <span class="pms-day-header__num">${String(day.day).padStart(2, '0')}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Rows for each accommodation -->
                        ${filteredProps.map((prop) => `
                            <div class="pms-prop-row" data-property-id="${escapeHtml(prop.id)}">
                                <div class="pms-col-prop-cell" title="${escapeHtml(prop.name)}">
                                    ${escapeHtml(prop.name)}
                                </div>
                                <div class="pms-days-track">
                                    <!-- Day background cells -->
                                    ${timeline.map((day) => `
                                        <div class="pms-day-cell ${day.isWeekend ? 'pms-day-cell--weekend' : ''} ${day.isToday ? 'pms-day-cell--today' : ''}"></div>
                                    `).join('')}

                                    <!-- Reservation Bars -->
                                    ${(prop.reservations || []).map((res) => {
                                        const placement = calculateReservationPlacement(res, timeline);
                                        if (!placement) return '';

                                        const leftPx = placement.startIndex * cellWidth + 2;
                                        const widthPx = placement.span * cellWidth - 4;
                                        const config = PMS_STATUS_CONFIG[res.status] || PMS_STATUS_CONFIG.default;

                                        return `
                                            <div class="pms-bar ${config.colorClass}"
                                                 style="left:${leftPx}px; width:${widthPx}px;"
                                                 data-reservation-id="${escapeHtml(res.id)}"
                                                 data-prop-name="${escapeHtml(prop.name)}"
                                                 title="${escapeHtml(res.guestName)} | ${res.checkIn} → ${res.checkOut} (${res.nights} nights)">
                                                <span class="pms-bar-guest">
                                                    <i class="fas fa-user-circle"></i>
                                                    ${escapeHtml(res.guestName)}
                                                </span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;

    // Bind Event Listeners
    const searchInput = container.querySelector('#pms-search-input');
    if (searchInput && onSearchChange) {
        let debounceTimer = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => onSearchChange(e.target.value), 250);
        });
    }

    const prevBtn = container.querySelector('#pms-prev-btn');
    if (prevBtn && onDateChange) {
        prevBtn.addEventListener('click', () => {
            const cur = new Date(`${startDate}T12:00:00Z`);
            cur.setUTCMonth(cur.getUTCMonth() - 1);
            onDateChange(cur.toISOString().slice(0, 10));
        });
    }

    const nextBtn = container.querySelector('#pms-next-btn');
    if (nextBtn && onDateChange) {
        nextBtn.addEventListener('click', () => {
            const cur = new Date(`${startDate}T12:00:00Z`);
            cur.setUTCMonth(cur.getUTCMonth() + 1);
            onDateChange(cur.toISOString().slice(0, 10));
        });
    }

    const todayBtn = container.querySelector('#pms-today-btn');
    if (todayBtn && onDateChange) {
        todayBtn.addEventListener('click', () => {
            onDateChange(new Date().toISOString().slice(0, 10));
        });
    }

    const daysSelect = container.querySelector('#pms-days-select');
    if (daysSelect && onDaysCountChange) {
        daysSelect.addEventListener('change', (e) => {
            onDaysCountChange(Number.parseInt(e.target.value, 10));
        });
    }

    const uploadBtn = container.querySelector('#pms-upload-btn');
    const fileInput = container.querySelector('#pms-file-input');
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files?.[0];
            if (file && onFileSelect) onFileSelect(file);
        });
    }

    const syncBtn = container.querySelector('#pms-sync-btn');
    if (syncBtn && onSyncClick) {
        syncBtn.addEventListener('click', () => onSyncClick());
    }

    // Reservation Bar Clicks
    const chartContainer = container.querySelector('#pms-chart-container');
    if (chartContainer) {
        chartContainer.addEventListener('click', (e) => {
            const bar = e.target.closest('.pms-bar');
            if (bar && onReservationClick) {
                const resId = bar.dataset.reservationId;
                const propName = bar.dataset.propName;
                const prop = properties.find((p) => p.name === propName);
                const res = prop?.reservations?.find((r) => r.id === resId);
                if (res) onReservationClick(res, prop);
            }
        });
    }
}

export function showReservationModal(container, reservation, property) {
    const existing = document.getElementById('pms-reservation-modal');
    if (existing) existing.remove();

    const config = PMS_STATUS_CONFIG[reservation.status] || PMS_STATUS_CONFIG.default;

    const modal = document.createElement('div');
    modal.id = 'pms-reservation-modal';
    modal.className = 'pms-modal-backdrop';
    modal.innerHTML = `
        <div class="pms-modal">
            <div class="pms-modal-header">
                <div class="pms-modal-title">${escapeHtml(reservation.guestName)}</div>
                <button class="pms-modal-close" id="pms-modal-close-btn">&times;</button>
            </div>
            <div class="pms-modal-body">
                <div class="pms-detail-row">
                    <span class="pms-detail-label">Accommodation:</span>
                    <span class="pms-detail-value">${escapeHtml(property?.name || reservation.propertyName)}</span>
                </div>
                <div class="pms-detail-row">
                    <span class="pms-detail-label">Check-in:</span>
                    <span class="pms-detail-value">${reservation.checkIn}</span>
                </div>
                <div class="pms-detail-row">
                    <span class="pms-detail-label">Check-out:</span>
                    <span class="pms-detail-value">${reservation.checkOut}</span>
                </div>
                <div class="pms-detail-row">
                    <span class="pms-detail-label">Length of stay:</span>
                    <span class="pms-detail-value">${reservation.nights} night(s)</span>
                </div>
                <div class="pms-detail-row">
                    <span class="pms-detail-label">Status:</span>
                    <span class="pms-detail-value" style="text-transform:capitalize">${config.label}</span>
                </div>
                ${reservation.portal ? `
                    <div class="pms-detail-row">
                        <span class="pms-detail-label">Channel:</span>
                        <span class="pms-detail-value">${escapeHtml(reservation.portal)}</span>
                    </div>
                ` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeBtn = modal.querySelector('#pms-modal-close-btn');
    const dismiss = () => modal.remove();
    closeBtn?.addEventListener('click', dismiss);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) dismiss();
    });
}

function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}
