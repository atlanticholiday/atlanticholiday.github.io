import { i18n } from "../../core/i18n.js";
import { getAppAccessOptions } from "../../shared/app-access.js";

export const QUICK_SEARCH_PAGE_EVENTS = Object.freeze({
    allinfo: "allInfoPageOpened",
    airbnbReservationInvoices: "airbnbReservationInvoicesPageOpened",
    buildPlanner: "buildPlannerPageOpened",
    checklists: "checklistsPageOpened",
    cleaningAh: "cleaningAhPageOpened",
    cleaningBills: "cleaningBillsPageOpened",
    heatedPools: "heatedPoolsPageOpened",
    laundryLog: "laundryLogPageOpened",
    linenInventory: "linenInventoryPageOpened",
    nukiDoors: "nukiDoorsPageOpened",
    operationalGuidelines: "operationalGuidelinesPageOpened",
    operations: "operationsPageOpened",
    owners: "ownersPageOpened",
    properties: "propertiesPageOpened",
    reservations: "reservationsPageOpened",
    rnal: "rnalPageOpened",
    safety: "safetyPageOpened",
    schedule: "schedulePageOpened",
    staff: "staffPageOpened",
    timeClock: "timeClockPageOpened",
    userManagement: "userManagementPageOpened",
    vehicles: "vehiclesPageOpened",
    visits: "visitsPageOpened",
    welcomePacks: "welcomePacksPageOpened"
});

const COPY = {
    en: {
        trigger: "Search",
        title: "Quick Search",
        placeholder: "Search pages, properties, staff, protocols...",
        hint: "Press Enter to open. Esc closes.",
        empty: "No matching results",
        emptyHint: "Try a page name, property, team member, or guide topic.",
        page: "Page",
        property: "Property",
        staff: "Staff",
        guide: "Guide"
    },
    pt: {
        trigger: "Pesquisar",
        title: "Pesquisa rapida",
        placeholder: "Pesquisar paginas, propriedades, equipa, protocolos...",
        hint: "Enter abre. Esc fecha.",
        empty: "Nenhum resultado encontrado",
        emptyHint: "Tenta uma pagina, propriedade, colaborador ou topico do guia.",
        page: "Pagina",
        property: "Propriedade",
        staff: "Equipa",
        guide: "Guia"
    }
};

const CORE_PAGE_DEFINITIONS = Object.freeze([
    {
        id: "landing",
        pageName: "landing",
        title: "Dashboard",
        subtitle: "Home",
        keywords: ["home", "landing", "start", "menu"],
        priority: 95
    },
    {
        id: "operations",
        pageName: "operations",
        title: "Operations",
        subtitle: "Operations hub",
        keywords: ["tools", "operations", "hub"],
        priority: 86
    },
    {
        id: "schedule",
        pageName: "schedule",
        title: "Work Schedule",
        subtitle: "Scheduling",
        keywords: ["calendar", "monthly", "yearly", "team schedule"],
        priority: 84
    },
    {
        id: "time-clock",
        pageName: "timeClock",
        title: "Time Clock",
        subtitle: "Attendance",
        keywords: ["attendance", "clock in", "clock out", "breaks"],
        priority: 82
    },
    {
        id: "user-management",
        pageName: "userManagement",
        title: "User Management",
        subtitle: "Admin",
        keywords: ["users", "access", "roles", "accounts"],
        priority: 70
    }
]);

export function normalizeSearchText(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9@._\-\s]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function compactParts(parts = []) {
    return parts
        .map((part) => String(part ?? "").trim())
        .filter(Boolean);
}

function getPropertyKeywords(property = {}) {
    return compactParts([
        property.name,
        property.location,
        property.typology,
        property.type,
        property.status,
        property.floor,
        property.parkingSpot,
        property.parkingFloor,
        property.wifiSpeed,
        property.energySource,
        property.rooms != null ? `${property.rooms} bedrooms` : "",
        property.bathrooms != null ? `${property.bathrooms} bathrooms` : ""
    ]);
}

function getEmployeeKeywords(employee = {}) {
    return compactParts([
        employee.name,
        employee.email,
        employee.department,
        employee.role,
        employee.staffNumber,
        employee.defaultShift
    ]);
}

function safeTranslate(labelKey, fallbackLabel, translate) {
    if (typeof translate !== "function" || !labelKey) {
        return fallbackLabel;
    }

    try {
        const translated = translate(labelKey);
        return translated && translated !== labelKey ? translated : fallbackLabel;
    } catch {
        return fallbackLabel;
    }
}

export function buildQuickSearchItems({
    canOpenPage = () => true,
    dataManager = null,
    properties = [],
    guideItems = [],
    translate = null
} = {}) {
    const items = [];

    CORE_PAGE_DEFINITIONS.forEach((page) => {
        if (!canOpenPage(page.pageName)) {
            return;
        }

        items.push({
            ...page,
            type: "page",
            eventName: QUICK_SEARCH_PAGE_EVENTS[page.pageName],
            keywords: compactParts([page.title, page.subtitle, ...(page.keywords || [])])
        });
    });

    getAppAccessOptions().forEach((option) => {
        const title = safeTranslate(option.labelKey, option.fallbackLabel, translate);
        const canAccess = option.pageName
            ? canOpenPage(option.pageName)
            : Boolean(dataManager?.canAccessApp?.(option.key));

        if (!canAccess) {
            return;
        }

        items.push({
            id: `app-${option.key}`,
            type: "page",
            pageName: option.pageName || null,
            url: option.key === "inventory" ? "inventory.html" : null,
            eventName: option.pageName ? QUICK_SEARCH_PAGE_EVENTS[option.pageName] : null,
            title,
            subtitle: option.group === "more" ? "More tools" : "Apps",
            keywords: compactParts([title, option.key, option.fallbackLabel]),
            priority: option.group === "main" ? 78 : 64
        });
    });

    if (canOpenPage("properties")) {
        properties.forEach((property) => {
            if (!property?.id || !property?.name) {
                return;
            }

            const detailParts = compactParts([
                "Properties",
                property.location,
                property.typology || property.type
            ]);

            items.push({
                id: `property-${property.id}`,
                type: "property",
                propertyId: property.id,
                title: property.name,
                subtitle: detailParts.join(" - "),
                keywords: getPropertyKeywords(property),
                priority: 58
            });
        });
    }

    if (canOpenPage("staff")) {
        const employees = typeof dataManager?.getActiveEmployees === "function"
            ? dataManager.getActiveEmployees()
            : [];

        employees.forEach((employee) => {
            if (!employee?.id || !employee?.name) {
                return;
            }

            items.push({
                id: `staff-${employee.id}`,
                type: "staff",
                employeeId: employee.id,
                title: employee.name,
                subtitle: compactParts(["Staff", employee.department, employee.email]).join(" - "),
                keywords: getEmployeeKeywords(employee),
                priority: 54
            });
        });
    }

    if (canOpenPage("operationalGuidelines")) {
        guideItems.forEach((item) => {
            if (!item?.id || !item?.title) {
                return;
            }

            items.push({
                id: `guide-${item.id}`,
                type: "guide",
                guideItemId: item.id,
                title: item.title,
                subtitle: compactParts(["Operational Guide", item.sectionTitle, item.action]).join(" - "),
                keywords: compactParts([
                    item.title,
                    item.sectionTitle,
                    item.action,
                    item.response,
                    ...(item.keywords || [])
                ]),
                priority: 50
            });
        });
    }

    return items;
}

export function scoreQuickSearchItem(item, rawQuery = "") {
    const query = normalizeSearchText(rawQuery);
    const title = normalizeSearchText(item?.title);
    const subtitle = normalizeSearchText(item?.subtitle);
    const keywords = normalizeSearchText([...(item?.keywords || [])].join(" "));
    const haystack = normalizeSearchText([title, subtitle, keywords].join(" "));

    if (!query) {
        return item?.priority || 0;
    }

    const tokens = query.split(" ").filter(Boolean);
    if (!tokens.length || !tokens.every((token) => haystack.includes(token))) {
        return 0;
    }

    let score = item?.priority || 1;
    if (title === query) score += 120;
    if (title.startsWith(query)) score += 80;
    if (title.includes(query)) score += 55;
    if (subtitle.includes(query)) score += 25;
    if (keywords.includes(query)) score += 20;

    tokens.forEach((token) => {
        if (title.split(" ").some((part) => part.startsWith(token))) score += 8;
        if (keywords.split(" ").some((part) => part.startsWith(token))) score += 4;
    });

    return score;
}

export function searchQuickSearchItems(items = [], query = "", limit = 10) {
    return items
        .map((item, index) => ({
            item,
            index,
            score: scoreQuickSearchItem(item, query)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.index - right.index;
        })
        .slice(0, limit)
        .map((entry) => entry.item);
}

function getCopy() {
    return COPY[i18n?.getCurrentLanguage?.() === "pt" ? "pt" : "en"];
}

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export class QuickSearchManager {
    constructor({
        documentRef = document,
        windowRef = window,
        navigationManager = null,
        getDataManager = () => null,
        getPropertiesManager = () => null,
        getOperationalGuidelinesManager = () => null
    } = {}) {
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.navigationManager = navigationManager;
        this.getDataManager = getDataManager;
        this.getPropertiesManager = getPropertiesManager;
        this.getOperationalGuidelinesManager = getOperationalGuidelinesManager;
        this.enabled = false;
        this.isOpen = false;
        this.query = "";
        this.activeIndex = 0;
        this.results = [];
        this.bound = false;
    }

    init() {
        this.ensureDom();
        this.bindOpenButtons();
        if (this.bound) {
            return;
        }

        this.triggerButton?.addEventListener("click", () => this.open());
        this.overlay?.addEventListener("mousedown", (event) => {
            if (event.target === this.overlay) {
                this.close();
            }
        });
        this.input?.addEventListener("input", () => {
            this.query = this.input.value;
            this.activeIndex = 0;
            this.renderResults();
        });
        this.input?.addEventListener("keydown", (event) => this.handleInputKeydown(event));
        this.documentRef.addEventListener("keydown", (event) => this.handleGlobalKeydown(event));
        this.windowRef.addEventListener?.("languageChanged", () => this.renderShellCopy());
        this.bound = true;
        this.syncEnabledState();
    }

    bindOpenButtons() {
        this.openButtons = Array.from(this.documentRef.querySelectorAll("[data-quick-search-open]"));
        this.openButtons.forEach((button) => {
            if (button.dataset.quickSearchBound === "true") {
                return;
            }

            button.dataset.quickSearchBound = "true";
            button.addEventListener("click", () => this.open());
        });
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        this.syncEnabledState();
        if (!this.enabled) {
            this.close();
        }
    }

    ensureDom() {
        if (this.documentRef.getElementById("quick-search-overlay")) {
            this.overlay = this.documentRef.getElementById("quick-search-overlay");
            this.triggerButton = this.documentRef.getElementById("quick-search-trigger");
            this.input = this.documentRef.getElementById("quick-search-input");
            this.resultsList = this.documentRef.getElementById("quick-search-results");
            this.emptyState = this.documentRef.getElementById("quick-search-empty");
            return;
        }

        this.triggerButton = this.documentRef.createElement("button");
        this.triggerButton.id = "quick-search-trigger";
        this.triggerButton.type = "button";
        this.triggerButton.className = "quick-search-trigger";
        this.documentRef.body.appendChild(this.triggerButton);

        this.overlay = this.documentRef.createElement("div");
        this.overlay.id = "quick-search-overlay";
        this.overlay.className = "quick-search-overlay hidden";
        this.overlay.innerHTML = `
            <section class="quick-search-panel" role="dialog" aria-modal="true" aria-labelledby="quick-search-title">
                <div class="quick-search-header">
                    <div>
                        <p id="quick-search-title"></p>
                        <div class="quick-search-input-row">
                            <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                            <input id="quick-search-input" type="search" autocomplete="off" spellcheck="false">
                        </div>
                    </div>
                    <button type="button" class="quick-search-close" aria-label="Close search">&times;</button>
                </div>
                <div id="quick-search-results" class="quick-search-results" role="listbox"></div>
                <div id="quick-search-empty" class="quick-search-empty hidden"></div>
                <div class="quick-search-footer">
                    <span id="quick-search-hint"></span>
                    <span><kbd>Ctrl</kbd><kbd>K</kbd></span>
                </div>
            </section>
        `;
        this.documentRef.body.appendChild(this.overlay);

        this.input = this.documentRef.getElementById("quick-search-input");
        this.resultsList = this.documentRef.getElementById("quick-search-results");
        this.emptyState = this.documentRef.getElementById("quick-search-empty");
        this.overlay.querySelector(".quick-search-close")?.addEventListener("click", () => this.close());
        this.renderShellCopy();
    }

    renderShellCopy() {
        const copy = getCopy();
        if (this.triggerButton) {
            this.triggerButton.innerHTML = `
                <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                <span>${escapeHtml(copy.trigger)}</span>
                <kbd>Ctrl K</kbd>
            `;
            this.triggerButton.setAttribute("aria-label", copy.trigger);
            this.triggerButton.title = "Ctrl K";
        }
        this.bindOpenButtons();
        this.openButtons?.forEach((button) => {
            const label = button.querySelector("[data-quick-search-label]");
            if (label) {
                label.textContent = copy.trigger;
            }
            button.setAttribute("aria-label", copy.trigger);
            button.title = "Ctrl K";
        });
        const title = this.documentRef.getElementById("quick-search-title");
        const hint = this.documentRef.getElementById("quick-search-hint");
        if (title) title.textContent = copy.title;
        if (hint) hint.textContent = copy.hint;
        if (this.input) this.input.placeholder = copy.placeholder;
        this.renderResults();
    }

    syncEnabledState() {
        this.triggerButton?.classList.toggle("hidden", !this.enabled);
        this.openButtons?.forEach((button) => {
            button.classList.toggle("hidden", !this.enabled);
        });
    }

    handleGlobalKeydown(event) {
        const key = String(event.key || "").toLowerCase();
        if (key === "k" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.isOpen ? this.close() : this.open();
        }
    }

    handleInputKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
            return;
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            this.activeIndex = Math.min(this.activeIndex + 1, Math.max(this.results.length - 1, 0));
            this.renderResults();
            return;
        }

        if (event.key === "ArrowUp") {
            event.preventDefault();
            this.activeIndex = Math.max(this.activeIndex - 1, 0);
            this.renderResults();
            return;
        }

        if (event.key === "Enter") {
            event.preventDefault();
            const result = this.results[this.activeIndex];
            if (result) {
                this.openResult(result);
            }
        }
    }

    open() {
        if (!this.enabled) {
            return;
        }

        this.isOpen = true;
        this.query = "";
        this.activeIndex = 0;
        this.overlay?.classList.remove("hidden");
        if (this.input) {
            this.input.value = "";
            this.input.focus();
        }
        this.renderResults();
    }

    close() {
        this.isOpen = false;
        this.overlay?.classList.add("hidden");
        this.triggerButton?.focus?.();
    }

    getItems() {
        const operationalGuidelinesManager = this.getOperationalGuidelinesManager();
        const dataManager = this.getDataManager();
        return buildQuickSearchItems({
            canOpenPage: (pageName) => this.navigationManager?.canOpenPage?.(pageName) !== false,
            dataManager,
            properties: this.getPropertiesManager()?.properties || [],
            guideItems: operationalGuidelinesManager?.getItems?.() || [],
            translate: (key) => i18n?.t?.(key)
        });
    }

    renderResults() {
        if (!this.resultsList || !this.emptyState) {
            return;
        }

        const copy = getCopy();
        this.results = searchQuickSearchItems(this.getItems(), this.query, 10);
        this.activeIndex = Math.min(this.activeIndex, Math.max(this.results.length - 1, 0));

        this.resultsList.innerHTML = this.results.map((result, index) => {
            const activeClass = index === this.activeIndex ? " is-active" : "";
            return `
                <button type="button" class="quick-search-result${activeClass}" data-quick-search-index="${index}" role="option" aria-selected="${index === this.activeIndex ? "true" : "false"}">
                    <span class="quick-search-result-type">${escapeHtml(copy[result.type] || result.type)}</span>
                    <span class="quick-search-result-main">
                        <strong>${escapeHtml(result.title)}</strong>
                        <small>${escapeHtml(result.subtitle || "")}</small>
                    </span>
                </button>
            `;
        }).join("");

        this.resultsList.querySelectorAll("[data-quick-search-index]").forEach((button) => {
            const index = Number(button.dataset.quickSearchIndex) || 0;
            button.addEventListener("mouseenter", () => {
                this.setActiveResultIndex(index);
            });
            button.addEventListener("pointerdown", (event) => {
                event.preventDefault();
                this.openResultAtIndex(index);
            });
            button.addEventListener("click", () => {
                this.openResultAtIndex(index);
            });
        });

        const hasResults = this.results.length > 0;
        this.resultsList.classList.toggle("hidden", !hasResults);
        this.emptyState.classList.toggle("hidden", hasResults);
        if (!hasResults) {
            this.emptyState.innerHTML = `
                <strong>${escapeHtml(copy.empty)}</strong>
                <span>${escapeHtml(copy.emptyHint)}</span>
            `;
        }
    }

    setActiveResultIndex(index) {
        this.activeIndex = Math.max(0, Math.min(index, Math.max(this.results.length - 1, 0)));
        this.resultsList?.querySelectorAll("[data-quick-search-index]").forEach((button) => {
            const isActive = (Number(button.dataset.quickSearchIndex) || 0) === this.activeIndex;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-selected", isActive ? "true" : "false");
        });
    }

    openResultAtIndex(index) {
        const result = this.results[index];
        if (result) {
            this.openResult(result);
        }
    }

    openResult(result) {
        this.close();

        if (result.url) {
            this.windowRef.location.href = result.url;
            return;
        }

        if (result.type === "property" && result.propertyId) {
            this.documentRef.dispatchEvent(new CustomEvent("openPropertyEdit", {
                detail: { propertyId: result.propertyId }
            }));
            return;
        }

        if (result.type === "staff") {
            this.openPage("staff");
            return;
        }

        if (result.type === "guide") {
            const guideManager = this.getOperationalGuidelinesManager();
            if (guideManager) {
                guideManager.activeItemId = result.guideItemId;
                guideManager.query = result.title || "";
            }
            this.openPage("operationalGuidelines");
            return;
        }

        if (result.pageName) {
            this.openPage(result.pageName);
        }
    }

    openPage(pageName) {
        this.navigationManager?.showPage?.(pageName);
        const eventName = QUICK_SEARCH_PAGE_EVENTS[pageName];
        if (eventName) {
            this.documentRef.dispatchEvent(new CustomEvent(eventName));
        }
    }
}
