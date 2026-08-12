import { t } from '../../core/i18n.js';

const DESTINATIONS = Object.freeze([
    { pageName: 'timeClock', buttonId: 'go-to-time-clock-btn', fallbackLabel: 'Time Clock', tone: 'slate' },
    { pageName: 'schedule', buttonId: 'go-to-schedule-btn', fallbackLabel: 'Work Schedule', tone: 'emerald' },
    { pageName: 'vacationCenter', buttonId: 'go-to-vacation-center-btn', fallbackLabel: 'Vacation Center', tone: 'sky' },
    { pageName: 'staff', buttonId: 'go-to-staff-btn', fallbackLabel: 'Staff', tone: 'violet' },
    { pageName: 'reservations', buttonId: 'go-to-reservations-btn', fallbackLabel: 'Weekly Reservations', tone: 'indigo' },
    { pageName: 'heatedPools', buttonId: 'go-to-heated-pools-btn', fallbackLabel: 'Heated Pools', tone: 'cyan' },
    { pageName: 'welcomePacks', buttonId: 'go-to-welcome-packs-btn', fallbackLabel: 'Welcome Packs', tone: 'rose' },
    { pageName: 'operationalGuidelines', buttonId: 'go-to-operational-guidelines-btn', fallbackLabel: 'Operational Guide', tone: 'amber' },
    { pageName: 'properties', buttonId: 'go-to-properties-btn', fallbackLabel: 'Properties', tone: 'blue' },
    { pageName: 'allinfo', buttonId: 'go-to-allinfo-btn', fallbackLabel: 'All Info', tone: 'blue' },
    { pageName: 'vehicles', buttonId: 'go-to-vehicles-btn', fallbackLabel: 'Vehicles', tone: 'orange' },
    { pageName: 'airbnbReservationInvoices', buttonId: 'go-to-airbnb-reservation-invoices-btn', fallbackLabel: 'Airbnb VAT Invoices', tone: 'rose' },
    { pageName: 'laundryLog', buttonId: 'go-to-laundry-log-btn', fallbackLabel: 'Laundry Log', tone: 'violet' },
    { pageName: 'linenInventory', buttonId: 'go-to-linen-inventory-btn', fallbackLabel: 'Linen Inventory', tone: 'violet' },
    { pageName: 'visits', buttonId: 'go-to-visits-btn', fallbackLabel: 'Visits', tone: 'emerald' },
    { pageName: 'cleaningAh', buttonId: 'go-to-cleaning-ah-btn', fallbackLabel: 'Cleaning AH', tone: 'cyan' },
    { pageName: 'cleaningBills', buttonId: 'go-to-cleaning-bills-btn', fallbackLabel: 'Cleaning Bills', tone: 'cyan' },
    { pageName: 'rnal', buttonId: 'go-to-rnal-btn', fallbackLabel: 'RNAL', tone: 'amber' },
    { pageName: 'checklists', buttonId: 'go-to-checklists-btn', fallbackLabel: 'Checklists', tone: 'emerald' },
    { pageName: 'owners', buttonId: 'go-to-owners-btn', fallbackLabel: 'Owners', tone: 'orange' },
    { pageName: 'safety', buttonId: 'go-to-safety-btn', fallbackLabel: 'Safety', tone: 'rose' },
    { pageName: 'userManagement', buttonId: 'go-to-user-management-btn', fallbackLabel: 'User Management', tone: 'slate' },
    { pageName: 'buildPlanner', buttonId: 'go-to-build-planner-btn', fallbackLabel: 'Build Planner', tone: 'amber' },
    { pageName: 'nukiDoors', buttonId: 'go-to-nuki-doors-btn', fallbackLabel: 'Nuki Doors', tone: 'slate' }
]);

const HEADER_ACTION_SELECTORS = [
    '.dashboard-header .header-right',
    '.vacation-center-page-header__actions',
    '.build-planner-header-actions',
    '.staff-header-actions',
    '.user-management-header-actions'
].join(',');

function translate(key, fallback) {
    const value = t(key);
    return value === key ? fallback : value;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function initials(label = '') {
    return label
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();
}

export class AppSwitcher {
    constructor({
        getCurrentPage,
        getRecentPages,
        canOpenPage,
        onNavigate,
        onClearRecent
    }) {
        this.getCurrentPage = getCurrentPage;
        this.getRecentPages = getRecentPages;
        this.canOpenPage = canOpenPage;
        this.onNavigate = onNavigate;
        this.onClearRecent = onClearRecent;
        this.panel = null;
        this.activeTrigger = null;
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleLanguageChanged = this.handleLanguageChanged.bind(this);
    }

    setup() {
        if (!document.getElementById('main-app')) return;

        this.ensurePanel();
        this.installTriggers();
        document.addEventListener('click', this.handleDocumentClick);
        document.addEventListener('keydown', this.handleKeydown);
        window.addEventListener('languageChanged', this.handleLanguageChanged);
    }

    ensurePanel() {
        const existing = document.getElementById('app-switcher-panel');
        if (existing) existing.remove();

        this.panel = document.createElement('aside');
        this.panel.id = 'app-switcher-panel';
        this.panel.className = 'app-switcher-panel';
        this.panel.hidden = true;
        this.panel.tabIndex = -1;
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'false');
        document.body.appendChild(this.panel);
        this.panel.addEventListener('click', (event) => this.handlePanelClick(event));
    }

    installTriggers() {
        document.querySelectorAll(HEADER_ACTION_SELECTORS).forEach((container) => {
            if (container.querySelector(':scope > [data-app-switcher-trigger]')) return;

            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'app-switcher-trigger';
            trigger.dataset.appSwitcherTrigger = '';
            trigger.setAttribute('aria-controls', 'app-switcher-panel');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.addEventListener('click', () => this.toggle(trigger));
            container.prepend(trigger);
        });
        this.updateTriggerLabels();
    }

    updateTriggerLabels() {
        const label = translate('appSwitcher.trigger', 'Apps');
        document.querySelectorAll('[data-app-switcher-trigger]').forEach((trigger) => {
            trigger.setAttribute('aria-label', translate('appSwitcher.openLabel', 'Open app switcher'));
            trigger.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="4" y="4" width="6" height="6" rx="1.5"></rect>
                    <rect x="14" y="4" width="6" height="6" rx="1.5"></rect>
                    <rect x="4" y="14" width="6" height="6" rx="1.5"></rect>
                    <rect x="14" y="14" width="6" height="6" rx="1.5"></rect>
                </svg>
                <span>${escapeHtml(label)}</span>
            `;
        });
    }

    getAvailableDestinations() {
        return DESTINATIONS.filter((destination) => {
            return document.getElementById(destination.buttonId)
                && this.canOpenPage(destination.pageName);
        });
    }

    getLabel(destination) {
        const landingButton = document.getElementById(destination.buttonId);
        const visibleLabel = landingButton?.querySelector('h3')?.textContent?.trim();
        return visibleLabel || destination.fallbackLabel;
    }

    renderDestination(destination, { recent = false } = {}) {
        const label = this.getLabel(destination);
        const isCurrent = destination.pageName === this.getCurrentPage();
        return `
            <button type="button" class="app-switcher-item${recent ? ' app-switcher-item--recent' : ''}${isCurrent ? ' is-current' : ''}"
                data-app-switcher-page="${escapeHtml(destination.pageName)}" ${isCurrent ? 'aria-current="page"' : ''}>
                <span class="app-switcher-item__mark app-switcher-item__mark--${destination.tone}" aria-hidden="true">${escapeHtml(initials(label))}</span>
                <span class="app-switcher-item__copy">
                    <strong>${escapeHtml(label)}</strong>
                    ${recent ? `<small>${escapeHtml(translate('appSwitcher.recentItem', 'Recently visited'))}</small>` : ''}
                </span>
                <svg class="app-switcher-item__arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6"></path></svg>
            </button>
        `;
    }

    render() {
        if (!this.panel) return;

        const destinations = this.getAvailableDestinations();
        const byPage = new Map(destinations.map((destination) => [destination.pageName, destination]));
        const recent = this.getRecentPages()
            .filter((pageName) => pageName !== this.getCurrentPage())
            .map((pageName) => byPage.get(pageName))
            .filter(Boolean)
            .slice(0, 10);

        this.panel.setAttribute('aria-label', translate('appSwitcher.title', 'Switch app'));
        this.panel.innerHTML = `
            <div class="app-switcher-panel__header">
                <div>
                    <strong>${escapeHtml(translate('appSwitcher.title', 'Switch app'))}</strong>
                    <span>${escapeHtml(translate('appSwitcher.subtitle', 'Jump back or open another workspace'))}</span>
                </div>
                <button type="button" class="app-switcher-close" data-app-switcher-close aria-label="${escapeHtml(translate('common.close', 'Close'))}">
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"></path></svg>
                </button>
            </div>
            <section class="app-switcher-section" aria-labelledby="app-switcher-recent-title">
                <div class="app-switcher-section__heading">
                    <h2 id="app-switcher-recent-title">${escapeHtml(translate('appSwitcher.recent', 'Recent'))}</h2>
                    ${recent.length ? `<button type="button" data-app-switcher-clear>${escapeHtml(translate('appSwitcher.clear', 'Clear'))}</button>` : ''}
                </div>
                <div class="app-switcher-recent-list">
                    ${recent.length
                        ? recent.map((destination) => this.renderDestination(destination, { recent: true })).join('')
                        : `<p class="app-switcher-empty">${escapeHtml(translate('appSwitcher.empty', 'Your recently visited apps will appear here.'))}</p>`}
                </div>
            </section>
            <section class="app-switcher-section app-switcher-section--all" aria-labelledby="app-switcher-all-title">
                <div class="app-switcher-section__heading">
                    <h2 id="app-switcher-all-title">${escapeHtml(translate('appSwitcher.allApps', 'All apps'))}</h2>
                </div>
                <div class="app-switcher-app-list">
                    ${destinations.map((destination) => this.renderDestination(destination)).join('')}
                </div>
            </section>
            <button type="button" class="app-switcher-dashboard-link" data-app-switcher-dashboard>
                <span>${escapeHtml(translate('appSwitcher.dashboard', 'Open all apps page'))}</span>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4l6 6-6 6"></path></svg>
            </button>
        `;
    }

    toggle(trigger) {
        if (!this.panel) return;
        if (!this.panel.hidden && this.activeTrigger === trigger) {
            this.close();
            return;
        }
        this.open(trigger);
    }

    open(trigger) {
        this.activeTrigger = trigger;
        this.render();
        this.panel.hidden = false;
        document.querySelectorAll('[data-app-switcher-trigger]').forEach((button) => {
            button.setAttribute('aria-expanded', button === trigger ? 'true' : 'false');
        });

        const rect = trigger.getBoundingClientRect();
        const panelWidth = Math.min(440, window.innerWidth - 24);
        const left = Math.max(12, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 12));
        this.panel.style.left = `${left}px`;
        this.panel.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 120)}px`;
        this.panel.focus({ preventScroll: true });
    }

    close({ restoreFocus = false } = {}) {
        if (!this.panel || this.panel.hidden) return;
        this.panel.hidden = true;
        document.querySelectorAll('[data-app-switcher-trigger]').forEach((button) => {
            button.setAttribute('aria-expanded', 'false');
        });
        if (restoreFocus) this.activeTrigger?.focus();
        this.activeTrigger = null;
    }

    refresh() {
        this.updateTriggerLabels();
        if (!this.panel?.hidden) this.render();
    }

    handlePanelClick(event) {
        if (event.target.closest('[data-app-switcher-close]')) {
            this.close({ restoreFocus: true });
            return;
        }

        if (event.target.closest('[data-app-switcher-clear]')) {
            this.onClearRecent();
            this.render();
            return;
        }

        if (event.target.closest('[data-app-switcher-dashboard]')) {
            this.close();
            this.onNavigate('landing');
            return;
        }

        const destinationButton = event.target.closest('[data-app-switcher-page]');
        if (!destinationButton) return;
        const destination = DESTINATIONS.find((item) => item.pageName === destinationButton.dataset.appSwitcherPage);
        if (!destination || destination.pageName === this.getCurrentPage()) return;
        this.close();
        this.onNavigate(destination.pageName, destination.buttonId);
    }

    handleDocumentClick(event) {
        if (this.panel?.hidden) return;
        if (event.target.closest('#app-switcher-panel, [data-app-switcher-trigger]')) return;
        this.close();
    }

    handleKeydown(event) {
        if (event.key === 'Escape' && !this.panel?.hidden) {
            event.preventDefault();
            this.close({ restoreFocus: true });
        }
    }

    handleLanguageChanged() {
        this.refresh();
    }
}
