/**
 * New Properties Manager - Asana App Style Controller
 * Atlantic Holiday
 */

import {
    BED_TYPES,
    calculateChecklistProgress,
    calculatePropertyInventory,
    createDefaultChecklist,
    getInitialProperties,
    normalizeProperty
} from './new-properties-utils.js';

const STORAGE_KEY = 'atlantic_holiday_new_properties_data_v1';

export class NewPropertiesManager {
    constructor({ containerId = 'new-properties-app', storage = window.localStorage } = {}) {
        this.containerId = containerId;
        this.storage = storage;
        this.properties = [];
        this.selectedPropertyId = null;
        this.activeView = 'board'; // 'board' | 'list' | 'inventory'
        this.activeDrawerTab = 'checklist'; // 'checklist' | 'inventory' | 'pipeline'
        this.statusFilter = 'all';
        this.searchQuery = '';
        this.lang = 'pt'; // Default to Portuguese for onboarding team
        this.sidebarMobileOpen = false;
        this.bound = false;
    }

    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) return;

        this.loadProperties();
        this.detectLanguage();
        this.bindEvents();
        this.render();

        // Check if URL has a propertyId parameter
        const urlParams = new URLSearchParams(window.location.search);
        const propId = urlParams.get('propertyId');
        if (propId) {
            const found = this.properties.find(p => p.id === propId || p.name.toLowerCase() === propId.toLowerCase());
            if (found) {
                this.selectedPropertyId = found.id;
                this.render();
            }
        }
    }

    detectLanguage() {
        const storedLang = this.storage?.getItem('preferred_language') || this.storage?.getItem('language');
        if (storedLang === 'en' || storedLang === 'pt') {
            this.lang = storedLang;
        }
    }

    setLanguage(newLang) {
        this.lang = newLang === 'en' ? 'en' : 'pt';
        this.storage?.setItem('preferred_language', this.lang);
        if (typeof document !== 'undefined') {
            document.documentElement.lang = this.lang;
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: this.lang } }));
        }
        this.render();
    }

    loadProperties() {
        try {
            const raw = this.storage?.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    this.properties = parsed.map((p, i) => normalizeProperty(p, i));
                    return;
                }
            }
        } catch (e) {
            console.warn('[NewProperties] Error reading storage, loading defaults:', e);
        }

        // Initialize with default 42 properties
        this.properties = getInitialProperties();
        this.saveProperties();
    }

    saveProperties() {
        try {
            this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.properties));
        } catch (e) {
            console.error('[NewProperties] Failed to save properties to storage:', e);
        }
    }

    bindEvents() {
        if (this.bound) return;
        this.bound = true;

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            // Ctrl+K / Cmd+K focus search
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('asana-search-input');
                searchInput?.focus();
            }
            // Escape closes drawer
            if (e.key === 'Escape' && this.selectedPropertyId) {
                this.closeDrawer();
            }
        });
    }

    getSelectedProperty() {
        if (!this.selectedPropertyId) return null;
        return this.properties.find(p => p.id === this.selectedPropertyId) || null;
    }

    getFilteredProperties() {
        let list = [...this.properties];

        if (this.statusFilter !== 'all') {
            list = list.filter(p => p.status === this.statusFilter);
        }

        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.collaborator && p.collaborator.toLowerCase().includes(q)) ||
                (p.pipeline?.limpeza?.empresaLimpeza && p.pipeline.limpeza.empresaLimpeza.toLowerCase().includes(q))
            );
        }

        return list;
    }

    // --- RENDER METHODS ---

    render() {
        if (!this.container) return;

        const isPt = this.lang === 'pt';
        const filtered = this.getFilteredProperties();
        const selected = this.getSelectedProperty();

        const counts = {
            all: this.properties.length,
            in_progress: this.properties.filter(p => p.status === 'in_progress').length,
            waiting: this.properties.filter(p => p.status === 'waiting').length,
            completed: this.properties.filter(p => p.status === 'completed').length
        };

        this.container.innerHTML = `
            <div class="asana-layout">
                <!-- SIDEBAR -->
                <aside class="asana-sidebar ${this.sidebarMobileOpen ? 'mobile-open' : ''}">
                    <div class="asana-sidebar__brand">
                        <div class="asana-sidebar__logo">
                            <i class="fas fa-hotel"></i>
                        </div>
                        <div>
                            <div class="asana-sidebar__title">${isPt ? 'Novos Alojamentos' : 'New Properties'}</div>
                            <div class="asana-sidebar__subtitle">Atlantic Holiday</div>
                        </div>
                    </div>

                    <div class="asana-sidebar__nav">
                        <div class="asana-nav-section-title">${isPt ? 'Geral' : 'Overview'}</div>
                        <button type="button" class="asana-nav-item ${this.statusFilter === 'all' ? 'active' : ''}" data-action="filter-status" data-status="all">
                            <div class="asana-nav-item__left">
                                <i class="fas fa-layer-group text-slate-400"></i>
                                <span>${isPt ? 'Todos os Alojamentos' : 'All Properties'}</span>
                            </div>
                            <span class="asana-nav-item__badge">${counts.all}</span>
                        </button>

                        <div class="asana-nav-section-title">${isPt ? 'Pipeline' : 'Pipeline'}</div>
                        <button type="button" class="asana-nav-item ${this.statusFilter === 'in_progress' ? 'active' : ''}" data-action="filter-status" data-status="in_progress">
                            <div class="asana-nav-item__left">
                                <i class="fas fa-circle-half-stroke text-amber-400"></i>
                                <span>${isPt ? 'Em Curso' : 'In Progress'}</span>
                            </div>
                            <span class="asana-nav-item__badge">${counts.in_progress}</span>
                        </button>

                        <button type="button" class="asana-nav-item ${this.statusFilter === 'waiting' ? 'active' : ''}" data-action="filter-status" data-status="waiting">
                            <div class="asana-nav-item__left">
                                <i class="fas fa-hourglass-half text-purple-400"></i>
                                <span>${isPt ? 'À Espera' : 'Waiting / Pending'}</span>
                            </div>
                            <span class="asana-nav-item__badge">${counts.waiting}</span>
                        </button>

                        <button type="button" class="asana-nav-item ${this.statusFilter === 'completed' ? 'active' : ''}" data-action="filter-status" data-status="completed">
                            <div class="asana-nav-item__left">
                                <i class="fas fa-check-circle text-emerald-400"></i>
                                <span>${isPt ? 'Concluídos' : 'Completed'}</span>
                            </div>
                            <span class="asana-nav-item__badge">${counts.completed}</span>
                        </button>
                    </div>

                    <div class="asana-sidebar__footer">
                        <a href="index.html">
                            <i class="fas fa-arrow-left"></i>
                            <span>${isPt ? 'Voltar ao Portal' : 'Back to Team Hub'}</span>
                        </a>
                    </div>
                </aside>

                <!-- WORKSPACE -->
                <main class="asana-workspace">
                    <!-- TOPBAR -->
                    <header class="asana-topbar">
                        <div class="flex items-center gap-3">
                            <button type="button" class="md:hidden text-gray-600 p-2" data-action="toggle-mobile-sidebar">
                                <i class="fas fa-bars text-lg"></i>
                            </button>
                            <div class="asana-topbar__search">
                                <i class="fas fa-search search-icon"></i>
                                <input type="text" id="asana-search-input" placeholder="${isPt ? 'Pesquisar alojamento, equipa...' : 'Search properties, team...'}" value="${this.escapeHtml(this.searchQuery)}" />
                                <kbd>Ctrl K</kbd>
                            </div>
                        </div>

                        <div class="asana-topbar__actions">
                            <div class="inventory-lang-switcher" title="${isPt ? 'Idioma e Tema' : 'Language & Theme'}">
                                <button type="button" class="lang-btn ${isPt ? 'active' : ''}" data-action="set-lang" data-lang="pt">PT</button>
                                <button type="button" class="lang-btn ${!isPt ? 'active' : ''}" data-action="set-lang" data-lang="en">EN</button>
                            </div>

                            <button type="button" class="btn-asana-secondary" data-action="export-all-xlsx" title="${isPt ? 'Exportar para Excel' : 'Export all properties to Excel'}">
                                <i class="fas fa-file-excel text-emerald-600"></i>
                                <span class="hidden sm:inline">${isPt ? 'Exportar Tudo' : 'Export Excel'}</span>
                            </button>

                            <button type="button" class="btn-asana-primary" data-action="open-new-property-modal">
                                <i class="fas fa-plus"></i>
                                <span>${isPt ? 'Novo Alojamento' : 'Add Property'}</span>
                            </button>
                        </div>
                    </header>

                    <!-- PROJECT HEADER & VIEW TABS -->
                    <div class="asana-project-header">
                        <div class="asana-project-header__top">
                            <div class="asana-project-header__title">
                                <span class="w-8 h-8 rounded-lg bg-red-100 text-brand flex items-center justify-center text-sm font-bold shadow-xs">
                                    <i class="fas fa-clipboard-check"></i>
                                </span>
                                <div>
                                    <h1 class="text-xl font-bold text-gray-900">${isPt ? 'Onboarding de Novos Alojamentos' : 'New Property Onboarding'}</h1>
                                    <p class="text-xs font-medium text-gray-500">${isPt ? 'Checklist de entrada, inventário essencial calculado e pipeline' : 'Onboarding checklist, essentials inventory calculator & pipeline'}</p>
                                </div>
                            </div>
                        </div>

                        <div class="asana-view-tabs">
                            <button type="button" class="asana-view-tab ${this.activeView === 'board' ? 'active' : ''}" data-action="switch-view" data-view="board">
                                <i class="fas fa-columns"></i>
                                <span>${isPt ? 'Quadro (Board)' : 'Board'}</span>
                            </button>
                            <button type="button" class="asana-view-tab ${this.activeView === 'list' ? 'active' : ''}" data-action="switch-view" data-view="list">
                                <i class="fas fa-list-ul"></i>
                                <span>${isPt ? 'Lista / Pipeline' : 'List / Pipeline'}</span>
                            </button>
                            <button type="button" class="asana-view-tab ${this.activeView === 'inventory' ? 'active' : ''}" data-action="switch-view" data-view="inventory">
                                <i class="fas fa-boxes-stacked"></i>
                                <span>${isPt ? 'Inventário Geral' : 'Master Inventory'}</span>
                            </button>
                        </div>
                    </div>

                    <!-- CANVAS AREA -->
                    <div class="asana-canvas">
                        ${this.renderViewContent(filtered, isPt)}
                    </div>
                </main>
            </div>

            <!-- ASANA DETAIL DRAWER (Property Workspace) -->
            ${this.renderPropertyDrawer(selected, isPt)}

            <!-- NEW PROPERTY MODAL -->
            <div id="new-property-modal" class="hidden fixed inset-0 bg-gray-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                    <div class="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                        <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <i class="fas fa-plus-circle text-brand"></i>
                            <span>${isPt ? 'Adicionar Novo Alojamento' : 'Add New Property'}</span>
                        </h3>
                        <button type="button" class="text-gray-400 hover:text-gray-600 p-1" data-action="close-modal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <form id="new-property-form" class="space-y-4">
                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Nome do Alojamento' : 'Property Name'} *</label>
                            <input type="text" id="modal-prop-name" required placeholder="e.g. Ocean View Apartment" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" />
                        </div>

                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Quartos' : 'Bedrooms'}</label>
                                <input type="number" id="modal-prop-bedrooms" min="0" value="2" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" />
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Casas de Banho' : 'Bathrooms'}</label>
                                <input type="number" id="modal-prop-bathrooms" min="1" step="0.5" value="1" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" />
                            </div>
                            <div>
                                <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Capacidade' : 'Capacity'}</label>
                                <input type="number" id="modal-prop-capacity" min="1" value="4" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" />
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Estado Inicial' : 'Initial Status'}</label>
                            <select id="modal-prop-status" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none bg-white">
                                <option value="in_progress">${isPt ? 'Em Curso' : 'In Progress'}</option>
                                <option value="waiting">${isPt ? 'À Espera' : 'Waiting / Pending'}</option>
                                <option value="completed">${isPt ? 'Concluído' : 'Completed'}</option>
                            </select>
                        </div>

                        <div>
                            <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Colaborador Responsável' : 'Responsible Collaborator'}</label>
                            <input type="text" id="modal-prop-collab" value="André / João" class="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none" />
                        </div>

                        <div class="flex justify-end gap-2 pt-3 border-t border-gray-100">
                            <button type="button" class="btn-asana-secondary" data-action="close-modal">${isPt ? 'Cancelar' : 'Cancel'}</button>
                            <button type="submit" class="btn-asana-primary">${isPt ? 'Criar Alojamento' : 'Create Property'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.bindDynamicEvents();

        if (typeof document !== 'undefined') {
            document.querySelectorAll('.theme-toggle-floating').forEach((el) => el.remove());
            if (window.ThemeManager?.mountControls) {
                window.ThemeManager.mountControls();
            }
        }
    }

    renderViewContent(properties, isPt) {
        if (this.activeView === 'board') {
            return this.renderBoardView(properties, isPt);
        } else if (this.activeView === 'list') {
            return this.renderListView(properties, isPt);
        } else {
            return this.renderMasterInventoryView(properties, isPt);
        }
    }

    renderBoardView(properties, isPt) {
        const columns = [
            {
                id: 'waiting',
                title: isPt ? 'À Espera' : 'Waiting / Pending',
                color: 'purple',
                icon: 'fa-hourglass-half',
                items: properties.filter(p => p.status === 'waiting')
            },
            {
                id: 'in_progress',
                title: isPt ? 'Em Curso' : 'In Progress',
                color: 'amber',
                icon: 'fa-circle-half-stroke',
                items: properties.filter(p => p.status === 'in_progress')
            },
            {
                id: 'completed',
                title: isPt ? 'Concluídos' : 'Completed',
                color: 'emerald',
                icon: 'fa-check-circle',
                items: properties.filter(p => p.status === 'completed')
            }
        ];

        return `
            <div class="asana-board">
                ${columns.map(col => `
                    <div class="asana-column" data-status="${col.id}">
                        <div class="asana-column__header">
                            <div class="asana-column__title">
                                <i class="fas ${col.icon} text-${col.color}-500"></i>
                                <span>${col.title}</span>
                            </div>
                            <span class="asana-column__count">${col.items.length}</span>
                        </div>

                        <div class="asana-column__cards">
                            ${col.items.map(prop => this.renderPropertyCard(prop, isPt)).join('')}
                            ${col.items.length === 0 ? `
                                <div class="text-center py-8 text-gray-400 text-xs italic">
                                    ${isPt ? 'Nenhum alojamento nesta coluna' : 'No properties in this stage'}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderPropertyCard(property, isPt) {
        const progress = calculateChecklistProgress(property.checklist);
        const bedCount = (property.beds || []).reduce((sum, b) => sum + (parseInt(b.count, 10) || 1), 0);
        const cleaner = property.pipeline?.limpeza?.empresaLimpeza || '';

        return `
            <div class="asana-card" data-action="open-property" data-id="${property.id}">
                <div class="asana-card__header">
                    <div class="asana-card__title">${this.escapeHtml(property.name)}</div>
                    <span class="text-xs text-gray-400"><i class="fas fa-chevron-right"></i></span>
                </div>

                <div class="asana-card__specs">
                    <span class="asana-spec-badge" title="${isPt ? 'Quartos' : 'Bedrooms'}">
                        <i class="fas fa-door-open text-gray-500"></i>
                        <span>${property.bedrooms} ${isPt ? 'q.' : 'bed'}</span>
                    </span>
                    <span class="asana-spec-badge" title="${isPt ? 'Casas de banho / Toaletes' : 'Bathrooms / Toilets'}">
                        <i class="fas fa-bath text-gray-500"></i>
                        <span>${property.bathrooms} WC</span>
                    </span>
                    <span class="asana-spec-badge" title="${isPt ? 'Capacidade' : 'Capacity'}">
                        <i class="fas fa-users text-gray-500"></i>
                        <span>${property.capacity} ${isPt ? 'pax' : 'guests'}</span>
                    </span>
                    <span class="asana-spec-badge" title="${isPt ? 'Camas' : 'Beds'}">
                        <i class="fas fa-bed text-gray-500"></i>
                        <span>${bedCount} ${isPt ? 'camas' : 'beds'}</span>
                    </span>
                </div>

                <div class="asana-card__progress">
                    <div class="asana-progress-bar">
                        <div class="asana-progress-bar__fill" style="width: ${progress.percent}%"></div>
                    </div>
                    <span>${progress.percent}%</span>
                </div>

                <div class="asana-card__footer">
                    <div>
                        <i class="fas fa-user-circle text-gray-400 mr-1"></i>
                        <span>${this.escapeHtml(property.collaborator || 'André / João')}</span>
                    </div>
                    ${cleaner ? `
                        <div class="asana-card__cleaner" title="${isPt ? 'Empresa de Limpeza' : 'Cleaning Company'}">
                            <i class="fas fa-broom mr-1"></i>${this.escapeHtml(cleaner)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderListView(properties, isPt) {
        return `
            <div class="asana-table-container">
                <table class="asana-table">
                    <thead>
                        <tr>
                            <th>${isPt ? 'Alojamento' : 'Property'}</th>
                            <th>${isPt ? 'Estado' : 'Status'}</th>
                            <th>${isPt ? 'Quartos / WC / Pax' : 'Specs'}</th>
                            <th>${isPt ? 'Checklist Entrada' : 'Checklist Progress'}</th>
                            <th>${isPt ? 'Empresa de Limpeza' : 'Cleaning Partner'}</th>
                            <th>${isPt ? 'Responsável' : 'Collaborator'}</th>
                            <th class="text-right">${isPt ? 'Ações' : 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${properties.map(p => {
                            const progress = calculateChecklistProgress(p.checklist);
                            const cleaner = p.pipeline?.limpeza?.empresaLimpeza || '—';
                            return `
                                <tr data-action="open-property" data-id="${p.id}">
                                    <td class="font-semibold text-gray-900">${this.escapeHtml(p.name)}</td>
                                    <td>
                                        <span class="asana-status-pill" data-status="${p.status}">
                                            <i class="fas fa-circle text-[8px]"></i>
                                            <span>${p.status === 'completed' ? (isPt ? 'Concluído' : 'Completed') : p.status === 'waiting' ? (isPt ? 'À Espera' : 'Waiting') : (isPt ? 'Em Curso' : 'In Progress')}</span>
                                        </span>
                                    </td>
                                    <td class="text-xs text-gray-600">
                                        ${p.bedrooms} q. · ${p.bathrooms} WC · ${p.capacity} pax
                                    </td>
                                    <td>
                                        <div class="flex items-center gap-2 max-w-[140px]">
                                            <div class="asana-progress-bar">
                                                <div class="asana-progress-bar__fill" style="width: ${progress.percent}%"></div>
                                            </div>
                                            <span class="text-xs font-bold text-gray-700">${progress.percent}%</span>
                                        </div>
                                    </td>
                                    <td class="text-xs font-medium text-gray-700">${this.escapeHtml(cleaner)}</td>
                                    <td class="text-xs text-gray-600">${this.escapeHtml(p.collaborator || 'André / João')}</td>
                                    <td class="text-right">
                                        <button type="button" class="btn-asana-secondary py-1 px-2 text-xs" data-action="open-property" data-id="${p.id}">
                                            <i class="fas fa-arrow-right"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderMasterInventoryView(properties, isPt) {
        return `
            <div class="space-y-6">
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                        <h3 class="text-sm font-bold text-blue-900">${isPt ? 'Visão Geral do Inventário de Novos Alojamentos' : 'New Properties Master Inventory Overview'}</h3>
                        <p class="text-xs text-blue-700 mt-1">${isPt ? 'Selecione qualquer alojamento para ver e ajustar a lista de essenciais calculada dinamicamente.' : 'Select any property to view and customize its dynamically calculated essentials inventory.'}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${properties.map(p => {
                        const inv = calculatePropertyInventory(p);
                        const totalItems = inv.categories.reduce((acc, cat) => acc + cat.items.length, 0);
                        return `
                            <div class="bg-white rounded-xl border border-gray-200 p-5 shadow-xs hover:shadow-md transition-shadow cursor-pointer" data-action="open-property-inventory" data-id="${p.id}">
                                <div class="flex items-start justify-between mb-2">
                                    <h4 class="font-bold text-gray-900">${this.escapeHtml(p.name)}</h4>
                                    <span class="asana-status-pill" data-status="${p.status}">
                                        ${p.status === 'completed' ? (isPt ? 'Concluído' : 'Completed') : p.status === 'waiting' ? (isPt ? 'À Espera' : 'Waiting') : (isPt ? 'Em Curso' : 'In Progress')}
                                    </span>
                                </div>
                                <div class="text-xs text-gray-500 mb-3">
                                    ${p.bedrooms} ${isPt ? 'Quartos' : 'Bedrooms'} · ${p.bathrooms} ${isPt ? 'Casas de banho' : 'Bathrooms'} · ${p.capacity} ${isPt ? 'Pessoas' : 'Guests'} · ${inv.totalBedsCount} ${isPt ? 'Camas' : 'Beds'}
                                </div>
                                <div class="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                                    <span class="text-gray-600"><strong>${totalItems}</strong> ${isPt ? 'itens calculados' : 'calculated items'}</span>
                                    <button type="button" class="text-brand font-semibold hover:underline flex items-center gap-1">
                                        <span>${isPt ? 'Ver Inventário' : 'View Inventory'}</span>
                                        <i class="fas fa-chevron-right text-[10px]"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // --- PROPERTY DETAIL WORKSPACE (DRAWER) ---

    renderPropertyDrawer(property, isPt) {
        if (!property) {
            return `<div id="asana-property-drawer-overlay" class="asana-drawer-overlay"></div>`;
        }

        const inv = calculatePropertyInventory(property);
        const progress = calculateChecklistProgress(property.checklist);

        return `
            <div id="asana-property-drawer-overlay" class="asana-drawer-overlay open">
                <div class="asana-drawer" id="asana-property-drawer">
                    <!-- TOOLBAR -->
                    <div class="asana-drawer__toolbar">
                        <div class="flex items-center gap-3">
                            <button type="button" class="btn-asana-secondary text-xs flex items-center gap-2 ${property.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : ''}" data-action="toggle-complete-property" data-id="${property.id}">
                                <i class="fas ${property.status === 'completed' ? 'fa-check-circle text-emerald-600' : 'fa-check text-gray-400'}"></i>
                                <span>${property.status === 'completed' ? (isPt ? 'Concluído' : 'Completed') : (isPt ? 'Marcar Concluído' : 'Mark Completed')}</span>
                            </button>

                            <select class="text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-300 bg-white" data-action="change-property-status" data-id="${property.id}">
                                <option value="waiting" ${property.status === 'waiting' ? 'selected' : ''}>${isPt ? 'À Espera' : 'Waiting / Pending'}</option>
                                <option value="in_progress" ${property.status === 'in_progress' ? 'selected' : ''}>${isPt ? 'Em Curso' : 'In Progress'}</option>
                                <option value="completed" ${property.status === 'completed' ? 'selected' : ''}>${isPt ? 'Concluído' : 'Completed'}</option>
                            </select>
                        </div>

                        <div class="flex items-center gap-2">
                            <button type="button" class="btn-asana-secondary text-xs text-red-600 hover:bg-red-50" data-action="delete-property" data-id="${property.id}" title="${isPt ? 'Eliminar' : 'Delete'}">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                            <button type="button" class="text-gray-400 hover:text-gray-700 p-2 text-base" data-action="close-drawer">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <!-- BODY -->
                    <div class="asana-drawer__body">
                        <!-- PROPERTY TITLE -->
                        <div>
                            <input type="text" class="asana-drawer__title-input" value="${this.escapeHtml(property.name)}" data-action="update-property-name" data-id="${property.id}" placeholder="${isPt ? 'Nome do Alojamento' : 'Property Name'}" />
                            <div class="flex items-center gap-4 text-xs text-gray-500 mt-2 px-1">
                                <div><i class="fas fa-user-circle mr-1"></i> ${this.escapeHtml(property.collaborator || 'André / João')}</div>
                                <div><i class="fas fa-calendar-alt mr-1"></i> ${property.date || '—'}</div>
                            </div>
                        </div>

                        <!-- SPECS CONFIGURATOR CARD (Bedrooms, Bathrooms, Capacity, Beds) -->
                        <div class="asana-specs-card">
                            <div class="flex items-center justify-between">
                                <span class="text-xs font-bold uppercase tracking-wider text-gray-700">
                                    <i class="fas fa-sliders-h text-brand mr-1"></i> ${isPt ? 'Configuração do Alojamento (Ajusta o Inventário)' : 'Capacity & Specs (Adjusts Inventory)'}
                                </span>
                                <span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    ${property.bedrooms} ${isPt ? 'Quartos' : 'Beds'} · ${property.bathrooms} WC · ${property.capacity} ${isPt ? 'Pessoas' : 'Guests'} · ${inv.totalBedsCount} ${isPt ? 'Camas' : 'Beds'}
                                </span>
                            </div>

                            <div class="asana-specs-grid">
                                <!-- Bedrooms -->
                                <div>
                                    <label class="asana-stepper-label">${isPt ? 'Nº de Quartos' : 'Bedrooms'}</label>
                                    <div class="asana-stepper">
                                        <button type="button" data-action="step-bedrooms" data-id="${property.id}" data-delta="-1"><i class="fas fa-minus"></i></button>
                                        <input type="number" readonly value="${property.bedrooms}" />
                                        <button type="button" data-action="step-bedrooms" data-id="${property.id}" data-delta="1"><i class="fas fa-plus"></i></button>
                                    </div>
                                </div>

                                <!-- Bathrooms / Toilets -->
                                <div>
                                    <label class="asana-stepper-label">${isPt ? 'Casas de Banho / WC' : 'Bathrooms / WC'}</label>
                                    <div class="asana-stepper">
                                        <button type="button" data-action="step-bathrooms" data-id="${property.id}" data-delta="-1"><i class="fas fa-minus"></i></button>
                                        <input type="number" readonly value="${property.bathrooms}" />
                                        <button type="button" data-action="step-bathrooms" data-id="${property.id}" data-delta="1"><i class="fas fa-plus"></i></button>
                                    </div>
                                </div>

                                <!-- People Capacity -->
                                <div>
                                    <label class="asana-stepper-label">${isPt ? 'Capacidade (Pessoas)' : 'Guest Capacity'}</label>
                                    <div class="asana-stepper">
                                        <button type="button" data-action="step-capacity" data-id="${property.id}" data-delta="-1"><i class="fas fa-minus"></i></button>
                                        <input type="number" readonly value="${property.capacity}" />
                                        <button type="button" data-action="step-capacity" data-id="${property.id}" data-delta="1"><i class="fas fa-plus"></i></button>
                                    </div>
                                </div>
                            </div>

                            <!-- Beds Breakdown -->
                            <div>
                                <label class="asana-stepper-label">${isPt ? 'Configuração de Camas' : 'Bed Types & Setup'}</label>
                                <div class="asana-beds-container">
                                    ${(property.beds || []).map((bed, idx) => `
                                        <div class="asana-bed-chip">
                                            <i class="fas fa-bed text-gray-500"></i>
                                            <span>${this.formatBedLabel(bed, isPt)}</span>
                                            <button type="button" class="remove-bed" data-action="remove-bed" data-id="${property.id}" data-index="${idx}" title="${isPt ? 'Remover cama' : 'Remove bed'}">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    `).join('')}

                                    <!-- Add Bed Button / Dropdown -->
                                    <div class="inline-flex items-center gap-1">
                                        <select id="drawer-add-bed-select" class="text-xs p-1.5 border border-gray-300 rounded-lg bg-white">
                                            ${BED_TYPES.map(b => `<option value="${b.id}">${isPt ? b.labelPt : b.label}</option>`).join('')}
                                        </select>
                                        <button type="button" class="btn-asana-secondary py-1 px-2.5 text-xs" data-action="add-bed" data-id="${property.id}">
                                            <i class="fas fa-plus"></i> ${isPt ? 'Adicionar Cama' : 'Add Bed'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="asana-recalc-banner">
                                <i class="fas fa-wand-magic-sparkles"></i>
                                <span>${isPt ? 'O inventário de essenciais, pratos, toalhas e lençóis recalcula automaticamente com base nestes números.' : 'Inventory quantities, dishes, towels and linens automatically adjust based on these values.'}</span>
                            </div>
                        </div>

                        <!-- DRAWER TABS -->
                        <div class="asana-drawer-tabs">
                            <button type="button" class="asana-drawer-tab ${this.activeDrawerTab === 'checklist' ? 'active' : ''}" data-action="switch-drawer-tab" data-tab="checklist">
                                <i class="fas fa-clipboard-check"></i>
                                <span>${isPt ? 'Checklist de Entrada' : 'Onboarding Checklist'} (${progress.percent}%)</span>
                            </button>
                            <button type="button" class="asana-drawer-tab ${this.activeDrawerTab === 'inventory' ? 'active' : ''}" data-action="switch-drawer-tab" data-tab="inventory">
                                <i class="fas fa-boxes-stacked"></i>
                                <span>${isPt ? 'Inventário de Essenciais' : 'Essentials Inventory'}</span>
                            </button>
                            <button type="button" class="asana-drawer-tab ${this.activeDrawerTab === 'pipeline' ? 'active' : ''}" data-action="switch-drawer-tab" data-tab="pipeline">
                                <i class="fas fa-key"></i>
                                <span>${isPt ? 'Chaves & Pipeline' : 'Keys & Pipeline'}</span>
                            </button>
                        </div>

                        <!-- TAB CONTENT: CHECKLIST -->
                        ${this.activeDrawerTab === 'checklist' ? this.renderDrawerChecklist(property, isPt) : ''}

                        <!-- TAB CONTENT: INVENTORY -->
                        ${this.activeDrawerTab === 'inventory' ? this.renderDrawerInventory(property, inv, isPt) : ''}

                        <!-- TAB CONTENT: PIPELINE & LOGISTICS -->
                        ${this.activeDrawerTab === 'pipeline' ? this.renderDrawerPipeline(property, isPt) : ''}
                    </div>
                </div>
            </div>
        `;
    }

    renderDrawerChecklist(property, isPt) {
        const checklist = property.checklist || [];

        return `
            <div class="space-y-6">
                ${checklist.map(group => `
                    <div class="asana-checklist-group">
                        <div class="asana-checklist-group__header">
                            <i class="fas fa-folder-open text-gray-400"></i>
                            <span>${isPt ? (group.areaPt || group.area) : group.area}</span>
                        </div>

                        <div class="space-y-1">
                            ${group.tasks.map(task => `
                                <div class="asana-checklist-item ${task.done ? 'done' : ''}">
                                    <button type="button" class="asana-check-btn ${task.done ? 'checked' : ''}" data-action="toggle-task" data-id="${property.id}" data-task="${task.id}" title="${isPt ? 'Marcar tarefa' : 'Toggle task'}">
                                        <i class="fas fa-check"></i>
                                    </button>

                                    <div class="asana-checklist-item__content">
                                        <div class="asana-checklist-item__title">${this.escapeHtml(task.title)}</div>
                                        <div class="asana-checklist-item__meta">
                                            <span class="asana-checklist-item__resp">${this.escapeHtml(task.responsible || 'Equipa')}</span>
                                            <input type="text" class="asana-checklist-item__notes" value="${this.escapeHtml(task.notes || '')}" placeholder="${isPt ? '+ Adicionar observações...' : '+ Add notes...'}" data-action="update-task-notes" data-id="${property.id}" data-task="${task.id}" />
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderDrawerInventory(property, inv, isPt) {
        const custom = property.inventoryCustom || {};

        return `
            <div class="space-y-6">
                <div class="flex items-center justify-between pb-2">
                    <div>
                        <h4 class="text-sm font-bold text-gray-900">${isPt ? 'Inventário Calculado de Essenciais' : 'Calculated Essentials Inventory'}</h4>
                        <p class="text-xs text-gray-500">${isPt ? 'Quantidades calculadas automaticamente segundo o padrão Atlantic Holiday.' : 'Quantities calculated automatically based on Atlantic Holiday standards.'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" class="btn-asana-secondary py-1.5 px-3 text-xs" data-action="export-property-xlsx" data-id="${property.id}">
                            <i class="fas fa-file-excel text-emerald-600 mr-1"></i> ${isPt ? 'Exportar Excel' : 'Export Excel'}
                        </button>
                    </div>
                </div>

                ${inv.categories.map(cat => `
                    <div class="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                        <div class="asana-inventory-category-title flex items-center justify-between">
                            <span>${isPt ? (cat.namePt || cat.name) : cat.name}</span>
                            <span class="text-xs font-semibold text-gray-500">${cat.items.length} ${isPt ? 'itens' : 'items'}</span>
                        </div>

                        <table class="asana-inventory-table">
                            <thead>
                                <tr>
                                    <th>${isPt ? 'Item' : 'Item'}</th>
                                    <th class="text-center w-24">${isPt ? 'Qtd AH' : 'AH Qty'}</th>
                                    <th class="text-center w-28">${isPt ? 'Qtd Real' : 'Actual Qty'}</th>
                                    <th class="w-32">${isPt ? 'Marca' : 'Brand'}</th>
                                    <th class="w-28">${isPt ? 'Estado' : 'Status'}</th>
                                    <th>${isPt ? 'Observações' : 'Comments'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cat.items.map(item => {
                                    const rec = custom[item.id] || {};
                                    return `
                                        <tr>
                                            <td>
                                                <div class="font-semibold text-gray-900">${isPt ? item.namePt : item.name}</div>
                                                ${item.rule ? `<div class="text-[10px] text-gray-400 italic">${item.rule}</div>` : ''}
                                            </td>
                                            <td class="text-center">
                                                <span class="asana-qty-badge">${item.qty}</span>
                                            </td>
                                            <td class="text-center">
                                                <input type="number" min="0" value="${rec.verifiedQty !== undefined ? rec.verifiedQty : item.qty}" class="w-16 px-2 py-1 text-center border border-gray-300 rounded text-xs focus:border-brand outline-none" data-action="update-inv-rec" data-id="${property.id}" data-item="${item.id}" data-field="verifiedQty" />
                                            </td>
                                            <td>
                                                <input type="text" value="${this.escapeHtml(rec.brand || '')}" placeholder="—" class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:border-brand outline-none" data-action="update-inv-rec" data-id="${property.id}" data-item="${item.id}" data-field="brand" />
                                            </td>
                                            <td>
                                                <select class="w-full px-1 py-1 border border-gray-300 rounded text-xs focus:border-brand outline-none bg-white" data-action="update-inv-rec" data-id="${property.id}" data-item="${item.id}" data-field="status">
                                                    <option value="ok" ${rec.status === 'ok' ? 'selected' : ''}>OK</option>
                                                    <option value="missing" ${rec.status === 'missing' ? 'selected' : ''}>${isPt ? 'Em Falta' : 'Missing'}</option>
                                                    <option value="damaged" ${rec.status === 'damaged' ? 'selected' : ''}>${isPt ? 'Danificado' : 'Damaged'}</option>
                                                    <option value="na" ${rec.status === 'na' ? 'selected' : ''}>N/A</option>
                                                </select>
                                            </td>
                                            <td>
                                                <input type="text" value="${this.escapeHtml(rec.comments || item.comments || '')}" placeholder="${isPt ? 'Comentários...' : 'Comments...'}" class="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:border-brand outline-none" data-action="update-inv-rec" data-id="${property.id}" data-item="${item.id}" data-field="comments" />
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderDrawerPipeline(property, isPt) {
        const pipe = property.pipeline || {};

        return `
            <div class="space-y-6">
                <!-- Chaves e Cofres -->
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                        <i class="fas fa-key text-amber-500"></i> ${isPt ? 'Chaves, Cofre e Garagem' : 'Keys, Safe & Garage'}
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Sets completos' : 'Complete sets'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.chaves?.setsCompletos || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="chaves" data-field="setsCompletos" placeholder="1 clientes, 1 limpeza, 1 escritório" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Comandos de Garagem' : 'Garage Remotes'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.chaves?.comandosGaragem || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="chaves" data-field="comandosGaragem" placeholder="Quantidade e locais" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Cofre de Chaves' : 'Key Safe Box'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.alojamento?.cofreChaves || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="alojamento" data-field="cofreChaves" placeholder="Localização e código" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Armário da Roupa' : 'Linen Wardrobe'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.alojamento?.armarioRoupa || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="alojamento" data-field="armarioRoupa" placeholder="Localização" />
                        </div>
                    </div>
                </div>

                <!-- Limpeza -->
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                        <i class="fas fa-broom text-blue-500"></i> ${isPt ? 'Limpeza & Entregas' : 'Cleaning & Delivery'}
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Empresa de Limpeza' : 'Cleaning Company'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.limpeza?.empresaLimpeza || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="limpeza" data-field="empresaLimpeza" placeholder="Powa Washing, That's Maid, etc." />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? '1ª Limpeza Geral' : '1st Deep Clean'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.limpeza?.primeiraLimpeza || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="limpeza" data-field="primeiraLimpeza" placeholder="Sim / Data / Feito" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Vídeo de Limpeza' : 'Cleaning Video'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.limpeza?.videoLimpeza || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="limpeza" data-field="videoLimpeza" placeholder="Sim / Enviado" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Chaves Entregues' : 'Keys Delivered to Cleaner'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.limpeza?.chavesEntregues || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="limpeza" data-field="chavesEntregues" placeholder="Sim / Não" />
                        </div>
                    </div>
                </div>

                <!-- Wi-Fi & Recomendações -->
                <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <h4 class="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-2">
                        <i class="fas fa-wifi text-emerald-500"></i> ${isPt ? 'Wi-Fi & Quadros' : 'Wi-Fi & Boards'}
                    </h4>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Quadros Wi-Fi / Recomendações' : 'Wi-Fi / Recommendations Boards'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.escritorio?.quadrosWifi || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="escritorio" data-field="quadrosWifi" placeholder="Sim / Em Falta" />
                        </div>
                        <div>
                            <label class="block text-gray-500 mb-1">${isPt ? 'Validade do Extintor' : 'Extinguisher Expiry'}</label>
                            <input type="text" value="${this.escapeHtml(pipe.alojamento?.validadeExtintor || '')}" class="w-full p-2 border border-gray-300 rounded-lg bg-white" data-action="update-pipe" data-id="${property.id}" data-section="alojamento" data-field="validadeExtintor" placeholder="Data de validade" />
                        </div>
                    </div>
                </div>

                <!-- Notas Extra -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-600 mb-1">${isPt ? 'Notas & Observações Gerais' : 'General Notes'}</label>
                    <textarea rows="3" class="w-full p-3 border border-gray-300 rounded-lg text-xs outline-none focus:border-brand" data-action="update-pipe-notas" data-id="${property.id}" placeholder="${isPt ? 'Informações relevantes sobre este novo alojamento...' : 'Add relevant notes about this property...'}">${this.escapeHtml(pipe.notas || '')}</textarea>
                </div>
            </div>
        `;
    }

    // --- INTERACTION & EVENT HANDLERS ---

    bindDynamicEvents() {
        // Search input
        const searchInput = document.getElementById('asana-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                const filtered = this.getFilteredProperties();
                const isPt = this.lang === 'pt';
                const canvas = this.container.querySelector('.asana-canvas');
                if (canvas) {
                    canvas.innerHTML = this.renderViewContent(filtered, isPt);
                }
            });
        }

        // New property form submission
        const newForm = document.getElementById('new-property-form');
        if (newForm) {
            newForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const name = document.getElementById('modal-prop-name')?.value;
                const bedrooms = parseInt(document.getElementById('modal-prop-bedrooms')?.value, 10) || 1;
                const bathrooms = parseFloat(document.getElementById('modal-prop-bathrooms')?.value) || 1;
                const capacity = parseInt(document.getElementById('modal-prop-capacity')?.value, 10) || 2;
                const status = document.getElementById('modal-prop-status')?.value || 'in_progress';
                const collaborator = document.getElementById('modal-prop-collab')?.value || 'André / João';

                const newProp = normalizeProperty({
                    name,
                    bedrooms,
                    bathrooms,
                    capacity,
                    status,
                    collaborator
                });

                this.properties.unshift(newProp);
                this.saveProperties();
                this.selectedPropertyId = newProp.id;
                this.render();
            });
        }

        // Click delegation on container
        this.container.onclick = (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;
            const id = target.dataset.id;

            switch (action) {
                case 'filter-status':
                    this.statusFilter = target.dataset.status;
                    this.render();
                    break;
                case 'switch-view':
                    this.activeView = target.dataset.view;
                    this.render();
                    break;
                case 'set-lang':
                    this.setLanguage(target.dataset.lang || (this.lang === 'pt' ? 'en' : 'pt'));
                    break;
                case 'toggle-lang':
                    this.setLanguage(this.lang === 'pt' ? 'en' : 'pt');
                    break;
                case 'toggle-mobile-sidebar':
                    this.sidebarMobileOpen = !this.sidebarMobileOpen;
                    this.render();
                    break;
                case 'open-property':
                case 'open-property-inventory':
                    if (id) {
                        this.selectedPropertyId = id;
                        if (action === 'open-property-inventory') {
                            this.activeDrawerTab = 'inventory';
                        }
                        this.render();
                    }
                    break;
                case 'close-drawer':
                    this.closeDrawer();
                    break;
                case 'switch-drawer-tab':
                    this.activeDrawerTab = target.dataset.tab;
                    this.render();
                    break;
                case 'open-new-property-modal':
                    document.getElementById('new-property-modal')?.classList.remove('hidden');
                    document.getElementById('modal-prop-name')?.focus();
                    break;
                case 'close-modal':
                    document.getElementById('new-property-modal')?.classList.add('hidden');
                    break;
                case 'step-bedrooms': {
                    const delta = parseInt(target.dataset.delta, 10) || 0;
                    this.updateSpecs(id, { bedroomsDelta: delta });
                    break;
                }
                case 'step-bathrooms': {
                    const delta = parseFloat(target.dataset.delta) || 0;
                    this.updateSpecs(id, { bathroomsDelta: delta });
                    break;
                }
                case 'step-capacity': {
                    const delta = parseInt(target.dataset.delta, 10) || 0;
                    this.updateSpecs(id, { capacityDelta: delta });
                    break;
                }
                case 'add-bed': {
                    const select = document.getElementById('drawer-add-bed-select');
                    const bedType = select?.value || 'double';
                    this.addBed(id, bedType);
                    break;
                }
                case 'remove-bed': {
                    const idx = parseInt(target.dataset.index, 10);
                    this.removeBed(id, idx);
                    break;
                }
                case 'toggle-task': {
                    const taskId = target.dataset.task;
                    this.toggleTask(id, taskId);
                    break;
                }
                case 'toggle-complete-property':
                    this.toggleCompleteProperty(id);
                    break;
                case 'delete-property':
                    this.deleteProperty(id);
                    break;
                case 'export-property-xlsx':
                    this.exportPropertyXlsx(id);
                    break;
                case 'export-all-xlsx':
                    this.exportAllXlsx();
                    break;
            }
        };

        // Change delegation for selects / inputs in drawer
        this.container.onchange = (e) => {
            const target = e.target;
            const action = target.dataset.action;
            const id = target.dataset.id;

            if (action === 'change-property-status') {
                const prop = this.properties.find(p => p.id === id);
                if (prop) {
                    prop.status = target.value;
                    this.saveProperties();
                    this.render();
                }
            } else if (action === 'update-inv-rec') {
                const item = target.dataset.item;
                const field = target.dataset.field;
                this.updateInventoryItem(id, item, field, target.value);
            } else if (action === 'update-pipe') {
                const section = target.dataset.section;
                const field = target.dataset.field;
                const prop = this.properties.find(p => p.id === id);
                if (prop && prop.pipeline && prop.pipeline[section]) {
                    prop.pipeline[section][field] = target.value;
                    this.saveProperties();
                }
            }
        };

        // Input delegation for debounced updates
        this.container.oninput = (e) => {
            const target = e.target;
            const action = target.dataset.action;
            const id = target.dataset.id;

            if (action === 'update-property-name') {
                const prop = this.properties.find(p => p.id === id);
                if (prop) {
                    prop.name = target.value;
                    this.saveProperties();
                }
            } else if (action === 'update-task-notes') {
                const taskId = target.dataset.task;
                this.updateTaskNotes(id, taskId, target.value);
            } else if (action === 'update-pipe-notas') {
                const prop = this.properties.find(p => p.id === id);
                if (prop && prop.pipeline) {
                    prop.pipeline.notas = target.value;
                    this.saveProperties();
                }
            }
        };
    }

    closeDrawer() {
        this.selectedPropertyId = null;
        this.render();
    }

    updateSpecs(propertyId, { bedroomsDelta = 0, bathroomsDelta = 0, capacityDelta = 0 }) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        if (bedroomsDelta) {
            prop.bedrooms = Math.max(0, prop.bedrooms + bedroomsDelta);
        }
        if (bathroomsDelta) {
            prop.bathrooms = Math.max(1, prop.bathrooms + bathroomsDelta);
        }
        if (capacityDelta) {
            prop.capacity = Math.max(1, prop.capacity + capacityDelta);
        }

        this.saveProperties();
        this.render();
    }

    addBed(propertyId, bedType) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        if (!Array.isArray(prop.beds)) {
            prop.beds = [];
        }

        const preset = BED_TYPES.find(b => b.id === bedType);
        prop.beds.push({
            id: `bed_${Date.now()}`,
            type: bedType,
            size: preset?.defaultSize || '140x200cm',
            count: 1
        });

        this.saveProperties();
        this.render();
    }

    removeBed(propertyId, index) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop || !Array.isArray(prop.beds)) return;

        prop.beds.splice(index, 1);
        this.saveProperties();
        this.render();
    }

    toggleTask(propertyId, taskId) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        for (const group of prop.checklist || []) {
            for (const task of group.tasks || []) {
                if (task.id === taskId) {
                    task.done = !task.done;
                    this.saveProperties();
                    this.render();
                    return;
                }
            }
        }
    }

    updateTaskNotes(propertyId, taskId, notes) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        for (const group of prop.checklist || []) {
            for (const task of group.tasks || []) {
                if (task.id === taskId) {
                    task.notes = notes;
                    this.saveProperties();
                    return;
                }
            }
        }
    }

    updateInventoryItem(propertyId, itemId, field, value) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        if (!prop.inventoryCustom) prop.inventoryCustom = {};
        if (!prop.inventoryCustom[itemId]) prop.inventoryCustom[itemId] = {};

        prop.inventoryCustom[itemId][field] = value;
        this.saveProperties();
    }

    toggleCompleteProperty(propertyId) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        prop.status = prop.status === 'completed' ? 'in_progress' : 'completed';
        this.saveProperties();
        this.render();
    }

    deleteProperty(propertyId) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop) return;

        const isPt = this.lang === 'pt';
        const msg = isPt
            ? `Tem a certeza que deseja eliminar "${prop.name}"?`
            : `Are you sure you want to delete "${prop.name}"?`;

        if (window.confirm(msg)) {
            this.properties = this.properties.filter(p => p.id !== propertyId);
            this.saveProperties();
            this.closeDrawer();
        }
    }

    formatBedLabel(bed, isPt) {
        const preset = BED_TYPES.find(b => b.id === bed.type);
        const name = preset ? (isPt ? preset.labelPt : preset.label) : (bed.type || 'Bed');
        const count = bed.count && bed.count > 1 ? `${bed.count}x ` : '';
        return `${count}${name}`;
    }

    exportPropertyXlsx(propertyId) {
        const prop = this.properties.find(p => p.id === propertyId);
        if (!prop || typeof window.XLSX === 'undefined') {
            alert(this.lang === 'pt' ? 'Exportação para Excel indisponível' : 'Excel export unavailable');
            return;
        }

        const inv = calculatePropertyInventory(prop);
        const rows = [
            ['Atlantic Holiday - Inventário de Essenciais'],
            ['Alojamento:', prop.name],
            ['Quartos:', prop.bedrooms, 'Casas de Banho:', prop.bathrooms, 'Capacidade:', prop.capacity],
            ['Data:', prop.date || '', 'Colaborador:', prop.collaborator || ''],
            [],
            ['Categoria', 'Item', 'Regra / Multiplicador', 'Qtd AH (Calculada)', 'Qtd Real Verificada', 'Marca', 'Estado', 'Comentários']
        ];

        const custom = prop.inventoryCustom || {};

        inv.categories.forEach(cat => {
            cat.items.forEach(item => {
                const rec = custom[item.id] || {};
                rows.push([
                    this.lang === 'pt' ? (cat.namePt || cat.name) : cat.name,
                    this.lang === 'pt' ? item.namePt : item.name,
                    item.rule || '',
                    item.qty,
                    rec.verifiedQty !== undefined ? rec.verifiedQty : item.qty,
                    rec.brand || '',
                    rec.status || 'OK',
                    rec.comments || item.comments || ''
                ]);
            });
        });

        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
        const filename = `${prop.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Inventario.xlsx`;
        window.XLSX.writeFile(wb, filename);
    }

    exportAllXlsx() {
        if (typeof window.XLSX === 'undefined') {
            alert(this.lang === 'pt' ? 'Exportação para Excel indisponível' : 'Excel export unavailable');
            return;
        }

        const rows = [
            ['Atlantic Holiday - Pipeline de Novos Alojamentos'],
            ['Alojamento', 'Estado', 'Quartos', 'Casas de Banho', 'Capacidade', 'Colaborador', 'Progresso Checklist', 'Empresa de Limpeza', 'Chaves', 'Notas']
        ];

        this.properties.forEach(p => {
            const prog = calculateChecklistProgress(p.checklist);
            rows.push([
                p.name,
                p.status,
                p.bedrooms,
                p.bathrooms,
                p.capacity,
                p.collaborator || '',
                `${prog.percent}%`,
                p.pipeline?.limpeza?.empresaLimpeza || '',
                p.pipeline?.chaves?.setsCompletos || '',
                p.pipeline?.notas || ''
            ]);
        });

        const ws = window.XLSX.utils.aoa_to_sheet(rows);
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, ws, 'Novos Alojamentos');
        window.XLSX.writeFile(wb, 'AtlanticHoliday_Novos_Alojamentos.xlsx');
    }

    escapeHtml(value = '') {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
}
