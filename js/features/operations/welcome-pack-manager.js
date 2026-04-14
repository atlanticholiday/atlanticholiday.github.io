import {
    formatWelcomePackCurrency,
    normalizeWelcomePackItem,
    normalizeWelcomePackLog,
    summarizeWelcomePackCart,
    summarizeWelcomePackInventory,
    summarizeWelcomePackLogs
} from './welcome-pack-utils.js';
import { i18n, t } from '../../core/i18n.js';

const PT_WELCOME_PACK_TRANSLATIONS = {
    header: {
        title: 'Welcome Packs',
        subtitle: 'Acompanhar custos, cobranças por propriedade e lucro'
    },
    hero: {
        kicker: 'Welcome Packs',
        title: 'Acompanhe materiais, cobranças e lucro sem saltar entre separadores confusos.',
        body: 'O fluxo está dividido em três tarefas claras: definir custos dos materiais, registar o valor cobrado em cada propriedade e deixar a área de cálculos mostrar os totais e a margem.'
    },
    workflow: {
        materialCosts: {
            label: 'Custos dos Materiais',
            step: 'Passo 1',
            description: 'Adicione todos os materiais que compra e preencha stock, custo e referência de cobrança.'
        },
        propertyCharges: {
            label: 'Cobrancas por Propriedade',
            step: 'Passo 2',
            description: 'Escolha a propriedade, adicione os materiais usados nesse pack e confirme o valor líquido realmente cobrado.'
        },
        calculations: {
            label: 'Calculos',
            step: 'Passo 3',
            description: 'Abra a vista de cálculos para confirmar automaticamente totais, IVA, lucro e desempenho por propriedade.'
        }
    },
    support: {
        label: 'Ferramentas de apoio',
        reservations: 'Reservas',
        presets: 'Presets'
    },
    help: {
        title: 'Guia do Gestor de Welcome Packs',
        subtitle: 'Aprenda a gerir packs, reservas e stock.',
        nav: {
            workflow: 'Fluxo Normal',
            stats: 'Como Ler os Calculos',
            inventory: 'Stock e Presets'
        },
        sections: {
            workflow: {
                title: 'Fluxo Diário',
                steps: {
                    checkReservations: {
                        title: 'Verificar Reservas',
                        body: 'Abra <strong>Reservas</strong> para rever os próximos check-ins e ver que propriedades vão precisar de um welcome pack em breve.'
                    },
                    logPack: {
                        title: 'Registar um Pack',
                        body: 'Abra <strong>Cobranças por Propriedade</strong>, selecione a propriedade e a data, depois adicione os materiais usados ou carregue um preset como ponto de partida.'
                    },
                    saveMonitor: {
                        title: 'Guardar e Acompanhar',
                        body: 'Depois de guardar, o stock é atualizado e o custo, a cobrança e o lucro do pack aparecem automaticamente na área de cálculos.'
                    }
                }
            },
            stats: {
                title: 'Cálculos e Estatísticas',
                body: 'A vista de cálculos dá-lhe uma visão financeira do custo de cada pack, do valor cobrado e do desempenho de cada propriedade.',
                items: {
                    margin: {
                        label: 'Margem de Lucro:',
                        body: 'Calculada como <code>(Lucro / Valor Cobrado) * 100</code>. Uma margem mais alta significa que o welcome pack é mais rentável.'
                    },
                    trends: {
                        label: 'Vista por Propriedade:',
                        body: 'Use a tabela por propriedade e a lista de cobranças recentes para ver onde a margem é mais forte e corrigir registos antigos quando for preciso.'
                    }
                }
            },
            inventory: {
                title: 'Stock e Presets',
                cards: {
                    stock: {
                        title: 'Gerir Stock',
                        body: 'Use <strong>Custos dos Materiais</strong> para adicionar materiais, manter o stock atualizado e definir o custo habitual e o valor de referência de cada item.'
                    },
                    presets: {
                        title: 'Usar Presets',
                        body: 'Use <strong>Presets</strong> para guardar o seu welcome pack normal e registar cobranças recorrentes mais depressa.'
                    }
                }
            }
        },
        done: 'Percebi, obrigado!'
    },
    reservations: {
        tabs: {
            upcoming: 'Reservas Futuras',
            settings: 'Definicoes das Propriedades'
        },
        upcoming: {
            title: 'Reservas Futuras',
            summary: '{{enabled}} de {{total}} propriedades têm Welcome Pack ativo',
            lastUpdated: 'Última atualização: {{time}}',
            syncNow: 'Sincronizar Agora',
            syncing: 'A sincronizar...',
            fetching: 'A procurar reservas...',
            syncErrorTitle: 'Erro ao sincronizar calendarios',
            filters: {
                next7: 'Próximos 7 Dias',
                next15: 'Próximos 15 Dias',
                next30: 'Próximos 30 Dias',
                viewAll: 'Ver Tudo'
            },
            loading: 'A carregar reservas...',
            stats: {
                today: 'Check-ins Hoje',
                week: 'Esta Semana',
                nextDays: 'Próximos {{count}} Dias'
            },
            noEnabledTitle: 'Nenhuma propriedade tem welcome pack ativo',
            noEnabledBody: 'Abra Definições das Propriedades para ativar o acompanhamento de welcome packs nas suas propriedades.',
            configureProperties: 'Configurar Propriedades',
            noUpcomingTitle: 'Sem check-ins nos próximos {{count}} dias',
            noUpcomingBody: 'As reservas aparecem aqui quando existirem novas marcações.',
            noEnabledReservations: '(Não foram encontradas reservas para propriedades ativas)',
            badges: {
                today: 'CHECK-IN HOJE',
                tomorrow: 'CHECK-IN AMANHÃ'
            },
            labels: {
                checkIn: 'Check-in',
                checkOut: 'Check-out'
            },
            nights: {
                one: '{{count}} noite',
                other: '{{count}} noites'
            },
            blockedReserved: 'Bloqueado / Reservado',
            reserved: 'Reservado',
            assignPack: 'Atribuir Pack'
        },
        settings: {
            title: 'Propriedades com Welcome Pack',
            summary: '{{enabled}} de {{total}} propriedades têm Welcome Pack ativo',
            bannerTitle: 'Configure quais propriedades precisam de welcome pack',
            bannerBody: 'Procure uma propriedade abaixo e ative o acompanhamento do welcome pack. Só as propriedades ativas aparecem na lista de Reservas Futuras.',
            searchPlaceholder: 'Procure uma propriedade para ativar ou desativar...',
            startTyping: 'Comece a escrever para procurar uma propriedade',
            enabledListTitle: 'Propriedades com Welcome Pack Ativo ({{count}})',
            enabledBadge: 'Welcome Pack Ativo',
            emptyTitle: 'Ainda não existem propriedades com welcome pack ativo',
            emptyBody: 'Procure e ative propriedades acima.'
        },
        search: {
            loading: 'A procurar...',
            noMatch: 'Nenhuma propriedade encontrada para \"{{query}}\"',
            enabled: 'Ativo',
            disabled: 'Desativo',
            enable: 'Ativar',
            disable: 'Desativar',
            error: 'Erro ao procurar propriedades'
        },
        messages: {
            toggleError: 'Erro ao atualizar a propriedade. Tente novamente.'
        }
    },
    presets: {
        title: 'Presets de Pack',
        create: 'Criar Preset',
        itemCount: {
            one: '{{count}} item',
            other: '{{count}} itens'
        },
        moreItems: '+ {{count}} mais...',
        inclVat: '(incl. IVA)',
        deleteTitle: 'Eliminar preset',
        empty: 'Ainda não existem presets.',
        deleteConfirm: 'Eliminar este preset?',
        modal: {
            title: 'Criar Novo Preset de Pack',
            namePlaceholder: 'Nome do Preset (ex.: Welcome Pack Gold)',
            selectItems: 'Selecionar Itens e Quantidades:',
            packTotal: 'Total do Pack:',
            emptySummary: 'Selecione itens para ver a composição do pack',
            summary: '{{items}} (Liquido: {{amount}} + IVA)',
            save: 'Guardar Preset'
        },
        messages: {
            nameRequired: 'Introduza um nome para o preset',
            itemsRequired: 'Selecione pelo menos um item'
        }
    },
    ical: {
        search: {
            connected: 'Ligado',
            notConnected: 'Nao ligado',
            edit: 'Editar',
            add: 'Adicionar iCal'
        },
        modal: {
            title: 'Configurar URL iCal',
            property: 'Propriedade: <strong>{{property}}</strong>',
            urlLabel: 'URL iCal/ICS',
            urlPlaceholder: 'https://www.airbnb.com/calendar/ical/...',
            urlHelp: 'Encontre isto no seu channel manager (Airbnb, Booking.com, VRBO, etc.)',
            howToFind: 'Como encontrar a sua URL iCal:',
            providers: {
                airbnb: 'Airbnb: Calendario -> Definicoes de disponibilidade -> Exportar calendario',
                booking: 'Booking.com: Propriedade -> Calendario -> Sincronizar calendarios',
                vrbo: 'VRBO: Calendario -> Importar/Exportar -> Exportar'
            },
            test: 'Testar URL',
            testing: 'A testar...',
            save: 'Guardar'
        },
        messages: {
            removeConfirm: 'Remover a ligação iCal de \"{{property}}\"?\n\nIsto vai parar a sincronização de reservas desta propriedade.',
            removeError: 'Erro ao remover a ligação iCal. Tente novamente.',
            enterUrl: 'Introduza primeiro uma URL',
            valid: 'A URL e valida. Os dados do calendario foram recebidos com sucesso.',
            invalid: 'A URL devolveu dados, mas não parece ter um formato iCal válido.',
            fetchFailed: 'Nao foi possivel obter a URL. Verifique se esta correta e acessivel.',
            savedFallback: 'URL iCal guardada. A integração completa ainda precisa da atualização no DataManager.',
            saveFailed: 'Erro ao guardar a URL. Tente novamente.'
        }
    },
    modals: {
        vatPreview: '{{net}} + {{vat}} = {{gross}}',
        addMaterial: {
            title: 'Adicionar Material',
            namePlaceholder: 'Nome do Material',
            stockPlaceholder: 'Quantidade Inicial em Stock',
            costLabel: 'Custo do Material (Liquido, sem IVA)',
            chargeLabel: 'Referencia de Cobranca (Liquido, sem IVA)',
            confirm: 'Adicionar Material'
        },
        editMaterial: {
            title: 'Editar Material',
            namePlaceholder: 'Nome do Material',
            stockPlaceholder: 'Quantidade em Stock',
            costLabel: 'Custo do Material (Liquido, sem IVA)',
            chargeLabel: 'Referencia de Cobranca (Liquido, sem IVA)',
            confirm: 'Guardar Alteracoes'
        }
    },
    actions: {
        apply: 'Aplicar',
        exportCsv: 'Exportar CSV',
        editEntry: 'Editar registo',
        deleteEntry: 'Eliminar registo',
        cancelEdit: 'Cancelar edicao',
        editMaterial: 'Editar material',
        deleteMaterial: 'Eliminar material',
        removeMaterial: 'Remover material',
        cancel: 'Cancelar',
        add: 'Adicionar'
    },
    dashboard: {
        lowStockTitle: 'O stock baixo precisa de atencao',
        lowStockBody: '{{count}} material(is) esta(ao) quase a terminar: {{items}}.',
        openMaterialCosts: 'Abrir Custos dos Materiais',
        title: 'Lucro por periodo',
        description: 'Use o filtro de datas para ver quanto custaram os packs, quanto foi cobrado e quais propriedades tiveram melhor desempenho.',
        from: 'De',
        to: 'Ate',
        metrics: {
            loggedCharges: 'Cobranças registadas',
            unitsUsed: '{{count}} unidades de material usadas',
            materialCost: 'Custo dos materiais',
            averagePerPack: 'Média de {{amount}} por pack',
            netCharged: 'Valor líquido cobrado',
            vatCollected: 'IVA cobrado',
            amountCharged: 'Valor cobrado',
            netProfit: 'Lucro líquido',
            marginInPeriod: '{{margin}}% de margem neste período'
        },
        insights: {
            topProperty: 'Melhor propriedade por valor faturado',
            topPropertyBody: '{{amount}} faturados | {{profit}} lucro líquido',
            bestMargin: 'Melhor margem',
            bestMarginBody: '{{margin}}% de margem em {{packs}} pack(s)',
            bestDay: 'Dia com maior faturacao',
            bestDayBody: '{{amount}} faturados em {{packs}} pack(s)',
            noData: 'Ainda sem dados'
        },
        chips: {
            currentStockValue: 'Valor atual do stock: {{amount}}',
            materialsInStock: 'Materiais em stock: {{count}}',
            lowStockMaterials: 'Materiais com stock baixo: {{count}}'
        },
        propertyPerformanceTitle: 'Desempenho por propriedade',
        propertyPerformanceDescription: 'Cada linha compara custo, valor líquido, IVA, total faturado e lucro líquido por propriedade.',
        trends: {
            title: 'Tendencia recente de faturacao',
            description: 'Veja os ultimos sete dias ativos para perceber quando o total faturado e o lucro foram mais fortes.',
            packsCount: '{{count}} pack(s)',
            netProfit: 'Lucro líquido {{amount}}'
        },
        materials: {
            title: 'Materiais mais usados',
            description: 'Estes sao os itens que mais consomem stock no periodo selecionado.',
            unitsUsed: '{{count}} unidades usadas',
            costUsed: 'Custo líquido {{amount}}',
            emptyTitle: 'Ainda não há consumo de materiais',
            emptyDescription: 'Assim que registar cobrancas, os materiais mais usados aparecem aqui.'
        },
        table: {
            property: 'Propriedade',
            packs: 'Packs',
            netCharged: 'Líquido',
            vat: 'IVA',
            cost: 'Custo',
            charged: 'Total faturado',
            profit: 'Lucro líquido',
            margin: 'Margem',
            lastCharge: 'Última cobrança',
            units: '{{count}} unidades'
        },
        emptyTitle: 'Não existem cobranças de welcome pack neste período',
        emptyDescription: 'Abra Cobrancas por Propriedade para registar o primeiro pack e os calculos aparecerao aqui automaticamente.',
        openPropertyCharges: 'Abrir Cobrancas por Propriedade',
        recentChargesTitle: 'Cobrancas recentes',
        recentChargesDescription: 'Veja o que foi cobrado em cada propriedade e ajuste registos antigos se algum valor estiver errado.',
        recentCostProfit: 'Custo {{cost}} | IVA {{vat}} | Lucro líquido {{profit}}',
        noChargesTitle: 'Ainda não existem cobranças registadas',
        noChargesDescription: 'Depois de adicionar uma cobranca em Cobrancas por Propriedade, os ultimos registos aparecerao aqui.',
        unknownProperty: 'Propriedade desconhecida'
    },
    inventory: {
        lowStockTitle: 'Alguns materiais precisam de reposicao',
        lowStockBody: '{{items}}',
        title: 'Catalogo de materiais',
        description: 'Mantenha uma linha por material com o stock atual, o custo liquido para a Atlantic Holiday e a referencia de cobranca usada num welcome pack.',
        addMaterial: 'Adicionar Material',
        metrics: {
            tracked: 'Materiais registados',
            lowStock: '{{count}} materiais com stock baixo',
            unitsInStock: 'Unidades em stock',
            unitsInStockDescription: 'Quantidade atual em todo o catalogo',
            stockCostValue: 'Valor do stock a custo',
            stockCostValueDescription: 'Baseado no custo liquido do material',
            projectedBilledValue: 'Valor de referencia',
            potentialMargin: 'Referencia atual {{amount}}'
        },
        table: {
            material: 'Material',
            stock: 'Stock',
            costPerUnit: 'Custo / unidade',
            chargePerUnit: 'Referencia / unidade',
            vat: 'IVA',
            actions: 'Acoes'
        },
        status: {
            needsRestock: 'Precisa de reposicao em breve',
            ready: 'Pronto para usar nos packs'
        },
        emptyTitle: 'Ainda nao existem materiais guardados',
        emptyDescription: 'Adicione o primeiro material para que Cobrancas por Propriedade e Calculos possam funcionar.'
    },
    log: {
        title: 'Registar uma cobranca por propriedade',
        editTitle: 'Editar cobranca por propriedade',
        description: 'Selecione a propriedade, escolha os materiais usados no pack e confirme o valor liquido realmente cobrado.',
        entriesTitle: 'Registos de cobranca',
        entriesDescription: 'Adicione uma ou mais linhas com propriedade e data. Todas usam os mesmos materiais selecionados, mas cada linha pode ter a sua propriedade, data e valor cobrado.',
        entryLabel: 'Registo {{count}}',
        entrySummary: 'Custo dos materiais {{cost}} e lucro {{profit}}.',
        addEntry: 'Adicionar outro registo',
        removeEntry: 'Remover registo',
        fields: {
            property: 'Propriedade',
            propertyPlaceholder: 'Selecionar propriedade...',
            date: 'Data',
            chargedAmount: 'Valor liquido cobrado'
        },
        loadPreset: 'Carregar preset',
        loadPresetPlaceholder: 'Selecione um preset para carregar materiais...',
        loadPresetHelp: 'Os presets ajudam a lancar o pack normal antes de ajustar os materiais realmente usados.',
        materialsTitle: 'Materiais neste pack',
        materialsDescription: 'Adicione os materiais que foram realmente usados para esta propriedade. Cliques repetidos aumentam a quantidade.',
        materialInStock: '{{count}} em stock',
        materialCost: 'Custo {{amount}}',
        materialCharge: 'Referencia {{amount}}',
        noMaterialsTitle: 'Ainda nao existem materiais disponiveis',
        noMaterialsDescription: 'Abra primeiro Custos dos Materiais e adicione os materiais que podem ser usados num welcome pack.',
        summaryTitle: 'Resumo da cobranca',
        summaryDescription: 'O valor cobrado pode seguir o valor sugerido ou ser alterado manualmente se a propriedade tiver sido faturada de forma diferente.',
        history: {
            noPropertyTitle: 'Ainda nao foi selecionada nenhuma propriedade',
            noPropertyDescription: 'Selecione uma propriedade para ver a ultima cobranca de welcome pack registada.',
            noPreviousCharge: 'Nao foi encontrada nenhuma cobranca anterior de welcome pack para esta propriedade.',
            lastCharge: 'Ultima cobranca: {{amount}} em {{date}}.',
            costProfit: 'Custo dos materiais {{cost}} e lucro {{profit}}.'
        },
        noMaterialsSelected: 'Nenhum material selecionado',
        useSuggestedAmount: 'Usar valor sugerido',
        summary: {
            materialCost: 'Custo dos materiais',
            suggestedCharge: 'Total faturado sugerido',
            vat: 'IVA (22%)',
            actualCharge: 'Total faturado real',
            profit: 'Lucro liquido'
        },
        updateCharge: 'Atualizar cobranca',
        saveCharge: 'Guardar cobranca',
        editHint: 'Ao atualizar uma cobranca existente, o stock antigo sera reposto e as novas quantidades serao novamente descontadas.',
        saveHint: 'A area de calculos sera atualizada automaticamente depois de guardar {{count}} cobranca(s).',
        cart: {
            costCharge: '{{cost}} custo | {{charge}} referencia',
            qty: 'Qtd',
            materialLines: '{{count}} linha(s) de material',
            units: '{{count}} unidade(s)',
            entries: '{{count}} cobranca(s)'
        }
    },
    states: {
        loading: 'A carregar Welcome Packs...',
        permissionDenied: 'O Welcome Packs nao esta disponivel para esta conta. Verifique o nivel de acesso e tente novamente.',
        unauthenticated: 'Inicie sessao novamente para carregar o Welcome Packs.',
        unavailable: 'Nao foi possivel carregar o Welcome Packs agora. Tente novamente.',
        unavailableTitle: 'Welcome Packs indisponivel'
    },
    messages: {
        selectProperty: 'Selecione uma propriedade',
        selectMaterial: 'Selecione pelo menos um material',
        chargeUpdated: 'Cobranca de welcome pack atualizada com sucesso.',
        chargeSaved: 'Cobranca de welcome pack guardada com sucesso.',
        saveFailed: 'Nao foi possivel guardar o pack. Tente novamente.',
        confirmDeleteCharge: 'Tem a certeza de que pretende eliminar esta cobranca? O stock sera reposto.',
        fillAllMaterialFields: 'Preencha todos os campos corretamente.',
        confirmDeleteMaterial: 'Tem a certeza de que pretende eliminar este material?',
        noDataToExport: 'Nao existem dados para exportar'
    },
    export: {
        date: 'Data',
        property: 'Propriedade',
        materials: 'Materiais',
        units: 'Unidades',
        materialCost: 'Custo dos Materiais',
        suggestedChargeNet: 'Cobranca Liquida Sugerida',
        suggestedCharge: 'Cobranca Sugerida',
        vat: 'IVA',
        chargedAmount: 'Valor Cobrado',
        profit: 'Lucro'
    }
};

export class WelcomePackManager {
    constructor(dataManager) {
        this.dataManager = dataManager;
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        this.currentView = 'dashboard'; // dashboard, inventory, log, reservations, presets
        this.cart = [];
        this.dashboardFilters = {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Last 30 days default
            endDate: new Date().toISOString().split('T')[0]
        };
        this.editingLogId = null;
        this.logEntries = [];
        this.activeLogEntryId = null;
        this.logEntrySequence = 0;
        this.cache = {
            logs: null,
            items: null,
            presets: null,
            properties: null
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('languageChanged', this.handleLanguageChange);
        }
    }

    ensureWelcomePackTranslations() {
        if (!i18n.translations?.pt) {
            return;
        }

        i18n.translations.pt.welcomePack = {
            ...(i18n.translations.pt.welcomePack || {}),
            ...PT_WELCOME_PACK_TRANSLATIONS
        };
    }

    tr(key, replacements = {}) {
        this.ensureWelcomePackTranslations();
        return t(`welcomePack.${key}`, replacements);
    }

    pluralize(key, count, replacements = {}) {
        return this.tr(`${key}.${count === 1 ? 'one' : 'other'}`, {
            count,
            ...replacements
        });
    }

    getLocale() {
        const activeLanguage = i18n?.getCurrentLanguage?.() || i18n?.currentLang || 'en';
        return activeLanguage === 'pt' ? 'pt-PT' : 'en-US';
    }

    formatDisplayDate(dateValue) {
        if (!dateValue) return '-';
        const candidate = new Date(`${dateValue}T00:00:00`);
        return Number.isNaN(candidate.getTime())
            ? String(dateValue)
            : candidate.toLocaleDateString(this.getLocale());
    }

    formatCompactDate(dateValue) {
        if (!dateValue) return '-';
        const candidate = dateValue instanceof Date ? dateValue : new Date(dateValue);
        return Number.isNaN(candidate.getTime())
            ? String(dateValue)
            : candidate.toLocaleDateString(this.getLocale(), {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
    }

    formatDisplayTime(dateValue) {
        if (!dateValue) return '';
        const candidate = dateValue instanceof Date ? dateValue : new Date(dateValue);
        return Number.isNaN(candidate.getTime())
            ? ''
            : candidate.toLocaleTimeString(this.getLocale(), {
                hour: '2-digit',
                minute: '2-digit'
            });
    }

    handleLanguageChange() {
        if (document.getElementById('welcome-pack-content')) {
            this.render();
        }
    }

    async _fetchData(type) {
        if (this.cache[type]) return this.cache[type];

        switch (type) {
            case 'logs':
                this.cache.logs = await this.dataManager.getWelcomePackLogs();
                break;
            case 'items':
                this.cache.items = await this.dataManager.getWelcomePackItems();
                break;
            case 'presets':
                this.cache.presets = await this.dataManager.getWelcomePackPresets();
                break;
            case 'properties':
                this.cache.properties = this.dataManager.getAllProperties ? await this.dataManager.getAllProperties() : [];
                break;
        }
        return this.cache[type];
    }

    _invalidateCache(types) {
        if (Array.isArray(types)) {
            types.forEach(t => this.cache[t] = null);
        } else {
            this.cache[types] = null;
        }
    }

    init() {
        this.render();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Navigation events handled by main app.js or index.html
    }

    getPrimaryViews() {
        return [
            {
                id: 'inventory',
                label: this.tr('workflow.materialCosts.label'),
                eyebrow: this.tr('workflow.materialCosts.step'),
                description: this.tr('workflow.materialCosts.description'),
                icon: 'fa-box-open'
            },
            {
                id: 'log',
                label: this.tr('workflow.propertyCharges.label'),
                eyebrow: this.tr('workflow.propertyCharges.step'),
                description: this.tr('workflow.propertyCharges.description'),
                icon: 'fa-house-circle-check'
            },
            {
                id: 'dashboard',
                label: this.tr('workflow.calculations.label'),
                eyebrow: this.tr('workflow.calculations.step'),
                description: this.tr('workflow.calculations.description'),
                icon: 'fa-chart-line'
            }
        ];
    }

    getSupportViews() {
        return [
            {
                id: 'reservations',
                label: this.tr('support.reservations'),
                icon: 'fa-calendar-alt'
            },
            {
                id: 'presets',
                label: this.tr('support.presets'),
                icon: 'fa-layer-group'
            }
        ];
    }

    setCurrentView(view, { resetEdit = false } = {}) {
        if (resetEdit) {
            this.editingLogId = null;
        }
        this.currentView = view;
        this.render();
    }

    formatCurrency(value) {
        return formatWelcomePackCurrency(value);
    }

    createLogEntry(overrides = {}) {
        const entryId = overrides.id || `wp-log-entry-${Date.now()}-${++this.logEntrySequence}`;
        return {
            id: entryId,
            property: String(overrides.property || overrides.propertyName || '').trim(),
            date: String(overrides.date || new Date().toISOString().split('T')[0]).trim(),
            chargedAmount: overrides.chargedAmount === null || overrides.chargedAmount === undefined || overrides.chargedAmount === ''
                ? ''
                : String(overrides.chargedAmount),
            manualCharge: Boolean(overrides.manualCharge)
        };
    }

    ensureLogEntries({ isEditing = false, editingLog = null } = {}) {
        if (isEditing && editingLog) {
            this.logEntries = [this.createLogEntry({
                id: 'wp-log-entry-editing',
                property: editingLog.propertyName || editingLog.property,
                date: editingLog.date,
                chargedAmount: editingLog.chargedAmountNet.toFixed(2),
                manualCharge: true
            })];
            this.activeLogEntryId = this.logEntries[0].id;
            return;
        }

        if (!Array.isArray(this.logEntries) || this.logEntries.length === 0) {
            this.logEntries = [this.createLogEntry()];
        }

        if (!this.logEntries.some((entry) => entry.id === this.activeLogEntryId)) {
            this.activeLogEntryId = this.logEntries[0]?.id || null;
        }
    }

    getActiveLogEntry() {
        return this.logEntries.find((entry) => entry.id === this.activeLogEntryId) || this.logEntries[0] || null;
    }

    getLogEntrySummary(entry) {
        const manualChargeValue = entry?.manualCharge && entry?.chargedAmount !== ''
            ? Number.parseFloat(entry.chargedAmount)
            : null;
        return summarizeWelcomePackCart(this.cart, manualChargeValue);
    }

    setActiveLogEntry(entryId) {
        if (!this.logEntries.some((entry) => entry.id === entryId)) {
            return;
        }

        this.activeLogEntryId = entryId;
        this.refreshLogEntryCards();
        this.updateCartUI();
    }

    addLogEntry(overrides = {}) {
        const nextEntry = this.createLogEntry(overrides);
        this.logEntries.push(nextEntry);
        this.activeLogEntryId = nextEntry.id;
        this.renderLogEntryRows();
        this.updateCartUI();
    }

    removeLogEntry(entryId) {
        if (this.logEntries.length <= 1) {
            return;
        }

        this.logEntries = this.logEntries.filter((entry) => entry.id !== entryId);
        if (this.activeLogEntryId === entryId) {
            this.activeLogEntryId = this.logEntries[0]?.id || null;
        }

        this.renderLogEntryRows();
        this.updateCartUI();
    }

    updateLogEntryField(entryId, field, value) {
        const entry = this.logEntries.find((candidate) => candidate.id === entryId);
        if (!entry) {
            return;
        }

        if (field === 'chargedAmount') {
            entry.chargedAmount = value;
            entry.manualCharge = value !== '';
        } else if (field === 'property') {
            entry.property = String(value || '').trimStart();
        } else {
            entry[field] = value;
        }

        this.activeLogEntryId = entryId;
        this.refreshLogEntryCards();
        this.updateCartUI();
    }

    renderLogEntryRows() {
        const container = document.getElementById('wp-log-entries');
        if (!container) {
            return;
        }

        const isEditing = Boolean(this.editingLogId);
        container.innerHTML = `
            <div class="space-y-3">
                ${this.logEntries.map((entry, index) => {
                    const entrySummary = this.getLogEntrySummary(entry);
                    const rowClasses = this.activeLogEntryId === entry.id
                        ? 'border-sky-300 bg-sky-50/60 shadow-sm'
                        : 'border-slate-200 bg-white';
                    return `
                        <article class="rounded-2xl border p-4 transition ${rowClasses}" data-wp-log-entry-id="${entry.id}">
                            <div class="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">${this.tr('log.entryLabel', { count: index + 1 })}</div>
                                    <div class="text-sm text-slate-600" data-wp-entry-summary="${entry.id}">${this.tr('log.entrySummary', {
                                        cost: this.formatCurrency(entrySummary.totals.totalCost),
                                        profit: this.formatCurrency(entrySummary.totals.profit)
                                    })}</div>
                                </div>
                                ${!isEditing ? `
                                <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" data-wp-entry-remove="${entry.id}" title="${this.tr('log.removeEntry')}">
                                    <i class="fas fa-trash"></i>
                                </button>
                                ` : ''}
                            </div>
                            <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(160px,0.75fr)_minmax(180px,0.85fr)]">
                                <label class="welcome-pack-field">
                                    <span>${this.tr('log.fields.property')}</span>
                                    <input type="text" data-wp-entry-property="${entry.id}" list="wp-properties-list" placeholder="${this.tr('log.fields.propertyPlaceholder')}" value="${entry.property}">
                                </label>
                                <label class="welcome-pack-field">
                                    <span>${this.tr('log.fields.date')}</span>
                                    <input type="date" data-wp-entry-date="${entry.id}" value="${entry.date}">
                                </label>
                                <label class="welcome-pack-field">
                                    <span>${this.tr('log.fields.chargedAmount')}</span>
                                    <input type="number" data-wp-entry-charge="${entry.id}" step="0.01" min="0" value="${entry.chargedAmount}">
                                </label>
                            </div>
                        </article>
                    `;
                }).join('')}
                ${!isEditing ? `
                <button type="button" id="wp-add-log-entry-btn" class="welcome-pack-secondary-button">
                    <i class="fas fa-plus"></i>
                    <span>${this.tr('log.addEntry')}</span>
                </button>
                ` : ''}
            </div>
        `;

        container.querySelectorAll('[data-wp-log-entry-id]').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('input, button')) {
                    return;
                }
                this.setActiveLogEntry(card.dataset.wpLogEntryId);
            });
        });

        container.querySelectorAll('[data-wp-entry-property]').forEach((input) => {
            input.addEventListener('focus', () => this.setActiveLogEntry(input.dataset.wpEntryProperty));
            input.addEventListener('input', () => this.updateLogEntryField(input.dataset.wpEntryProperty, 'property', input.value));
        });

        container.querySelectorAll('[data-wp-entry-date]').forEach((input) => {
            input.addEventListener('focus', () => this.setActiveLogEntry(input.dataset.wpEntryDate));
            input.addEventListener('input', () => this.updateLogEntryField(input.dataset.wpEntryDate, 'date', input.value));
        });

        container.querySelectorAll('[data-wp-entry-charge]').forEach((input) => {
            input.addEventListener('focus', () => this.setActiveLogEntry(input.dataset.wpEntryCharge));
            input.addEventListener('input', () => this.updateLogEntryField(input.dataset.wpEntryCharge, 'chargedAmount', input.value));
        });

        container.querySelectorAll('[data-wp-entry-remove]').forEach((button) => {
            button.addEventListener('click', () => this.removeLogEntry(button.dataset.wpEntryRemove));
        });

        document.getElementById('wp-add-log-entry-btn')?.addEventListener('click', () => this.addLogEntry());
        this.refreshLogEntryCards();
    }

    refreshLogEntryCards() {
        this.logEntries.forEach((entry) => {
            const card = document.querySelector(`[data-wp-log-entry-id="${entry.id}"]`);
            if (!card) {
                return;
            }

            const isActive = this.activeLogEntryId === entry.id;
            card.classList.toggle('border-sky-300', isActive);
            card.classList.toggle('bg-sky-50/60', isActive);
            card.classList.toggle('shadow-sm', isActive);
            card.classList.toggle('border-slate-200', !isActive);
            card.classList.toggle('bg-white', !isActive);

            const summaryNode = card.querySelector(`[data-wp-entry-summary="${entry.id}"]`);
            if (summaryNode) {
                const summary = this.getLogEntrySummary(entry);
                summaryNode.textContent = this.tr('log.entrySummary', {
                    cost: this.formatCurrency(summary.totals.totalCost),
                    profit: this.formatCurrency(summary.totals.profit)
                });
            }

            const removeButton = card.querySelector(`[data-wp-entry-remove="${entry.id}"]`);
            if (removeButton) {
                removeButton.disabled = this.logEntries.length <= 1;
                removeButton.classList.toggle('opacity-50', this.logEntries.length <= 1);
                removeButton.classList.toggle('cursor-not-allowed', this.logEntries.length <= 1);
            }
        });
    }

    renderWorkspaceMetric(label, value) {
        return `
            <article class="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 min-h-[72px]">
                <div class="grid h-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
                    <div class="min-w-0 text-sm font-medium leading-5 text-slate-500">${label}</div>
                    <div class="text-right text-lg font-semibold leading-none text-slate-900 tabular-nums whitespace-nowrap">${value}</div>
                </div>
            </article>
        `;
    }

    renderInsightCard(title, value, caption) {
        return `
            <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${title}</div>
                <div class="mt-2 text-lg font-semibold text-slate-900">${value}</div>
                <div class="mt-1 text-sm leading-5 text-slate-600">${caption}</div>
            </article>
        `;
    }

    renderTrendRows(entries = []) {
        if (!entries.length) {
            return `
                <div class="welcome-pack-empty-state">
                    <h4>${this.tr('dashboard.noChargesTitle')}</h4>
                    <p>${this.tr('dashboard.noChargesDescription')}</p>
                </div>
            `;
        }

        const maxGross = Math.max(...entries.map((entry) => entry.grossRevenue), 1);
        return `
            <div class="space-y-3">
                ${entries.map((entry) => {
                    const width = Math.max(10, Math.round((entry.grossRevenue / maxGross) * 100));
                    return `
                        <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div class="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <strong class="text-slate-900">${this.formatDisplayDate(entry.date)}</strong>
                                    <div class="text-sm text-slate-500">${this.tr('dashboard.trends.packsCount', { count: entry.count })}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold text-slate-900">${this.formatCurrency(entry.grossRevenue)}</div>
                                    <div class="text-sm text-slate-500">${this.tr('dashboard.trends.netProfit', { amount: this.formatCurrency(entry.profit) })}</div>
                                </div>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200">
                                <div class="h-2 rounded-full bg-sky-500" style="width: ${width}%"></div>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderTopMaterials(entries = []) {
        if (!entries.length) {
            return `
                <div class="welcome-pack-empty-state">
                    <h4>${this.tr('dashboard.materials.emptyTitle')}</h4>
                    <p>${this.tr('dashboard.materials.emptyDescription')}</p>
                </div>
            `;
        }

        const maxUnits = Math.max(...entries.map((entry) => entry.units), 1);
        return `
            <div class="space-y-3">
                ${entries.map((entry) => {
                    const width = Math.max(12, Math.round((entry.units / maxUnits) * 100));
                    return `
                        <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div class="mb-2 flex items-center justify-between gap-3">
                                <strong class="text-slate-900">${entry.label}</strong>
                                <span class="text-sm font-medium text-slate-600">${this.tr('dashboard.materials.unitsUsed', { count: entry.units })}</span>
                            </div>
                            <div class="h-2 rounded-full bg-slate-200">
                                <div class="h-2 rounded-full bg-emerald-500" style="width: ${width}%"></div>
                            </div>
                            <div class="mt-2 text-sm text-slate-500">${this.tr('dashboard.materials.costUsed', { amount: this.formatCurrency(entry.totalCost) })}</div>
                        </article>
                    `;
                }).join('')}
            </div>
        `;
    }

    async render() {
        const container = document.getElementById('welcome-pack-content');
        if (!container) return;

        const primaryViews = this.getPrimaryViews();
        const supportViews = this.getSupportViews();
        let inventorySummary = summarizeWelcomePackInventory([]);
        let logSummary = summarizeWelcomePackLogs([]);

        try {
            const [logs, items] = await Promise.all([
                this._fetchData('logs'),
                this._fetchData('items')
            ]);
            inventorySummary = summarizeWelcomePackInventory(items);
            logSummary = summarizeWelcomePackLogs(logs);
        } catch (error) {
            console.warn('[WelcomePack] Failed to load workspace summary:', error);
        }

        container.innerHTML = `
            <div class="welcome-pack-shell">
                <section class="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                        <div class="w-full">
                            <div class="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">${this.tr('hero.kicker')}</div>
                            <h2 class="mt-2 text-2xl font-semibold text-slate-900">${this.tr('hero.title')}</h2>
                            <p class="mt-2 w-full text-sm leading-6 text-slate-600">${this.tr('hero.body')}</p>
                        </div>
                    </div>
                    <div class="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
                        ${primaryViews.map((view) => `
                            <button
                                type="button"
                                class="text-left rounded-2xl border ${this.currentView === view.id ? 'border-sky-200 bg-sky-50/70' : 'border-slate-200 bg-slate-50'} px-4 py-4 transition hover:-translate-y-0.5 hover:border-slate-300"
                                data-wp-view="${view.id}">
                                <div class="flex items-start gap-3">
                                    <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${this.currentView === view.id ? 'bg-sky-100 text-sky-700' : 'bg-white text-slate-600'}">
                                        <i class="fas ${view.icon}"></i>
                                    </span>
                                    <div class="min-w-0">
                                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] ${this.currentView === view.id ? 'text-sky-700' : 'text-slate-500'}">${view.eyebrow}</div>
                                        <h3 class="mt-1 text-base font-semibold text-slate-900">${view.label}</h3>
                                        <p class="mt-1 text-sm leading-6 text-slate-600">${view.description}</p>
                                    </div>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                    <div class="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        ${this.renderWorkspaceMetric(this.tr('inventory.metrics.tracked'), String(inventorySummary.totals.materialCount))}
                        ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.loggedCharges'), String(logSummary.totals.count))}
                        ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.amountCharged'), this.formatCurrency(logSummary.totals.revenue))}
                        ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.netProfit'), this.formatCurrency(logSummary.totals.profit))}
                    </div>
                </section>

                <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <nav class="flex flex-wrap gap-2" aria-label="Welcome Pack views">
                        ${primaryViews.map((view) => `
                            <button
                                type="button"
                                id="wp-${view.id}-btn"
                                class="view-btn ${this.currentView === view.id ? 'active' : ''}"
                                data-wp-view="${view.id}">
                                <i class="fas ${view.icon}"></i>
                                <span>${view.label}</span>
                            </button>
                        `).join('')}
                        </nav>
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${this.tr('support.label')}</span>
                            ${supportViews.map((view) => `
                            <button
                                type="button"
                                id="wp-${view.id}-btn"
                                class="view-btn ${this.currentView === view.id ? 'active' : ''}"
                                data-wp-view="${view.id}">
                                <i class="fas ${view.icon}"></i>
                                <span>${view.label}</span>
                            </button>
                        `).join('')}
                        </div>
                    </div>
                </section>
                <div id="wp-view-container" class="space-y-6"></div>
            </div>
        `;

        this.attachNavListeners();
        void this.renderCurrentView();
    }

    attachNavListeners() {
        document.querySelectorAll('[data-wp-view]').forEach((button) => {
            button.onclick = () => {
                const { wpView } = button.dataset;
                this.setCurrentView(wpView, { resetEdit: wpView === 'log' });
            };
        });
    }

    renderLoadingState(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
                ${this.tr('states.loading')}
            </div>
        `;
    }

    describeLoadError(error) {
        const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
        const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';

        if (code.includes('permission-denied') || message.includes('insufficient permissions')) {
            return this.tr('states.permissionDenied');
        }

        if (code.includes('unauthenticated') || message.includes('requires authentication')) {
            return this.tr('states.unauthenticated');
        }

        return this.tr('states.unavailable');
    }

    renderErrorState(container, error) {
        if (!container) return;
        container.innerHTML = `
            <div class="rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
                <h3 class="text-lg font-semibold text-rose-800">${this.tr('states.unavailableTitle')}</h3>
                <p class="mt-2 text-sm text-rose-700">${this.describeLoadError(error)}</p>
            </div>
        `;
    }

    async renderCurrentView() {
        const container = document.getElementById('wp-view-container');
        if (!container) return;

        this.renderLoadingState(container);

        try {
            if (this.currentView === 'dashboard') await this.renderDashboard(container);
            else if (this.currentView === 'reservations') await this.renderReservations(container);
            else if (this.currentView === 'inventory') await this.renderInventory(container);
            else if (this.currentView === 'presets') await this.renderPresets(container);
            else if (this.currentView === 'log') await this.renderLogForm(container);
        } catch (error) {
            console.error('Failed to render Welcome Packs view:', error);
            this.renderErrorState(container, error);
        }
    }


    async renderDashboard(container) {
        const logs = await this._fetchData('logs');
        const items = await this._fetchData('items');
        const logSummary = summarizeWelcomePackLogs(logs, this.dashboardFilters);
        const inventorySummary = summarizeWelcomePackInventory(items);
        const filteredLogs = logSummary.logs;
        const lowStockItems = inventorySummary.lowStockItems;
        const topProperty = logSummary.byProperty[0] || null;
        const strongestMarginProperty = [...logSummary.byProperty].sort((left, right) => right.margin - left.margin)[0] || null;
        const bestDay = [...logSummary.byDate].sort((left, right) => right.grossRevenue - left.grossRevenue)[0] || null;

        container.innerHTML = `
            ${lowStockItems.length > 0 ? `
            <section class="welcome-pack-inline-alert">
                <div class="welcome-pack-inline-alert-icon">
                    <i class="fas fa-triangle-exclamation"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3>${this.tr('dashboard.lowStockTitle')}</h3>
                    <p>
                        ${this.tr('dashboard.lowStockBody', {
                            count: lowStockItems.length,
                            items: lowStockItems.map((item) => `${item.name} (${item.quantity || 0})`).join(', ')
                        })}
                    </p>
                </div>
                <button type="button" id="wp-go-manage-stock-btn" class="welcome-pack-secondary-button">
                    <i class="fas fa-box-open"></i>
                    <span>${this.tr('dashboard.openMaterialCosts')}</span>
                </button>
            </section>
            ` : ''}

            <section class="welcome-pack-panel">
                <div class="welcome-pack-panel-heading welcome-pack-panel-heading--row">
                    <div>
                        <p class="welcome-pack-section-kicker">${this.tr('workflow.calculations.label')}</p>
                        <h3>${this.tr('dashboard.title')}</h3>
                        <p>${this.tr('dashboard.description')}</p>
                    </div>
                    <div class="welcome-pack-toolbar-actions">
                        <label class="welcome-pack-field">
                            <span>${this.tr('dashboard.from')}</span>
                            <input type="date" id="wp-stats-start" value="${this.dashboardFilters.startDate}">
                        </label>
                        <label class="welcome-pack-field">
                            <span>${this.tr('dashboard.to')}</span>
                            <input type="date" id="wp-stats-end" value="${this.dashboardFilters.endDate}">
                        </label>
                        <button type="button" id="wp-apply-filters" class="welcome-pack-nav-button is-active">
                            <i class="fas fa-filter"></i>
                            <span>${this.tr('actions.apply')}</span>
                        </button>
                        <button type="button" id="wp-export-csv" class="welcome-pack-secondary-button">
                            <i class="fas fa-file-csv"></i>
                            <span>${this.tr('actions.exportCsv')}</span>
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.loggedCharges')}</span>
                        <strong>${logSummary.totals.count}</strong>
                        <small>${this.tr('dashboard.metrics.unitsUsed', { count: logSummary.totals.units })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.materialCost')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.cost)}</strong>
                        <small>${this.tr('dashboard.metrics.averagePerPack', { amount: this.formatCurrency(logSummary.totals.averageCost) })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.netCharged')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.netRevenue)}</strong>
                        <small>${this.tr('dashboard.metrics.averagePerPack', { amount: this.formatCurrency(logSummary.totals.averageNetCharge) })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.vatCollected')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.vatCollected)}</strong>
                        <small>${this.tr('dashboard.metrics.averagePerPack', { amount: this.formatCurrency(logSummary.totals.averageVat) })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.amountCharged')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.grossRevenue)}</strong>
                        <small>${this.tr('dashboard.metrics.averagePerPack', { amount: this.formatCurrency(logSummary.totals.averageGrossCharge) })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('dashboard.metrics.netProfit')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.profit)}</strong>
                        <small>${this.tr('dashboard.metrics.marginInPeriod', { margin: logSummary.totals.margin.toFixed(1) })}</small>
                    </article>
                </div>

                <div class="welcome-pack-chip-row">
                    <span class="welcome-pack-chip">${this.tr('dashboard.chips.currentStockValue', { amount: this.formatCurrency(inventorySummary.totals.stockCostValue) })}</span>
                    <span class="welcome-pack-chip">${this.tr('dashboard.chips.materialsInStock', { count: inventorySummary.totals.stockUnits })}</span>
                    <span class="welcome-pack-chip">${this.tr('dashboard.chips.lowStockMaterials', { count: inventorySummary.totals.lowStockCount })}</span>
                </div>
            </section>

            <section class="grid grid-cols-1 gap-4 xl:grid-cols-3">
                ${this.renderInsightCard(
                    this.tr('dashboard.insights.topProperty'),
                    topProperty ? topProperty.label : this.tr('dashboard.insights.noData'),
                    topProperty
                        ? this.tr('dashboard.insights.topPropertyBody', {
                            amount: this.formatCurrency(topProperty.grossRevenue),
                            profit: this.formatCurrency(topProperty.profit)
                        })
                        : this.tr('dashboard.noChargesDescription')
                )}
                ${this.renderInsightCard(
                    this.tr('dashboard.insights.bestMargin'),
                    strongestMarginProperty ? strongestMarginProperty.label : this.tr('dashboard.insights.noData'),
                    strongestMarginProperty
                        ? this.tr('dashboard.insights.bestMarginBody', {
                            margin: strongestMarginProperty.margin.toFixed(1),
                            packs: strongestMarginProperty.count
                        })
                        : this.tr('dashboard.noChargesDescription')
                )}
                ${this.renderInsightCard(
                    this.tr('dashboard.insights.bestDay'),
                    bestDay ? this.formatDisplayDate(bestDay.date) : this.tr('dashboard.insights.noData'),
                    bestDay
                        ? this.tr('dashboard.insights.bestDayBody', {
                            amount: this.formatCurrency(bestDay.grossRevenue),
                            packs: bestDay.count
                        })
                        : this.tr('dashboard.noChargesDescription')
                )}
            </section>

            <div class="welcome-pack-grid">
                <section class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('dashboard.propertyPerformanceTitle')}</h3>
                        <p>${this.tr('dashboard.propertyPerformanceDescription')}</p>
                    </div>
                    ${logSummary.byProperty.length > 0 ? `
                    <div class="welcome-pack-table-wrap">
                        <table class="welcome-pack-table">
                            <thead>
                                <tr>
                                    <th>${this.tr('dashboard.table.property')}</th>
                                    <th>${this.tr('dashboard.table.packs')}</th>
                                    <th>${this.tr('dashboard.table.netCharged')}</th>
                                    <th>${this.tr('dashboard.table.vat')}</th>
                                    <th>${this.tr('dashboard.table.cost')}</th>
                                    <th>${this.tr('dashboard.table.charged')}</th>
                                    <th>${this.tr('dashboard.table.profit')}</th>
                                    <th>${this.tr('dashboard.table.margin')}</th>
                                    <th>${this.tr('dashboard.table.lastCharge')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${logSummary.byProperty.map((property) => `
                                    <tr>
                                        <td>
                                            <strong>${property.label}</strong>
                                            <span>${this.tr('dashboard.table.units', { count: property.units })}</span>
                                        </td>
                                        <td>${property.count}</td>
                                        <td>${this.formatCurrency(property.netRevenue)}</td>
                                        <td>${this.formatCurrency(property.vatCollected)}</td>
                                        <td>${this.formatCurrency(property.cost)}</td>
                                        <td>${this.formatCurrency(property.grossRevenue)}</td>
                                        <td>${this.formatCurrency(property.profit)}</td>
                                        <td>${property.margin.toFixed(1)}%</td>
                                        <td>${this.formatDisplayDate(property.lastDate)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    ` : `
                    <div class="welcome-pack-empty-state">
                        <h4>${this.tr('dashboard.emptyTitle')}</h4>
                        <p>${this.tr('dashboard.emptyDescription')}</p>
                        <button type="button" id="wp-open-log-from-empty-btn" class="welcome-pack-nav-button is-active">
                            <i class="fas fa-house-circle-check"></i>
                            <span>${this.tr('dashboard.openPropertyCharges')}</span>
                        </button>
                    </div>
                    `}
                </section>

                <section class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('dashboard.trends.title')}</h3>
                        <p>${this.tr('dashboard.trends.description')}</p>
                    </div>
                    ${this.renderTrendRows(logSummary.byDate.slice(-7).reverse())}
                </section>
            </div>

            <div class="welcome-pack-grid">
                <section class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('dashboard.materials.title')}</h3>
                        <p>${this.tr('dashboard.materials.description')}</p>
                    </div>
                    ${this.renderTopMaterials(logSummary.topMaterials)}
                </section>

                <section class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('dashboard.recentChargesTitle')}</h3>
                        <p>${this.tr('dashboard.recentChargesDescription')}</p>
                    </div>
                    <div class="welcome-pack-activity-list">
                        ${logSummary.recentLogs.slice(0, 10).map((log) => `
                            <article class="welcome-pack-activity-item">
                                <div>
                                    <strong>${log.propertyName || log.property || this.tr('dashboard.unknownProperty')}</strong>
                                    <span>${this.formatDisplayDate(log.date)}</span>
                                </div>
                                <div>
                                    <strong>${this.formatCurrency(log.chargedAmountGross)}</strong>
                                    <span>${this.tr('dashboard.recentCostProfit', {
                                        cost: this.formatCurrency(log.totalCost),
                                        profit: this.formatCurrency(log.profit),
                                        vat: this.formatCurrency(log.vatAmount)
                                    })}</span>
                                </div>
                                <div class="welcome-pack-activity-actions">
                                    <button type="button" class="welcome-pack-icon-button" onclick="welcomePackManager.editLog('${log.id}')" title="${this.tr('actions.editEntry')}">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" onclick="welcomePackManager.deleteLog('${log.id}')" title="${this.tr('actions.deleteEntry')}">
                                        <i class="fas fa-trash-alt"></i>
                                    </button>
                                </div>
                            </article>
                        `).join('') || `
                            <div class="welcome-pack-empty-state">
                                <h4>${this.tr('dashboard.noChargesTitle')}</h4>
                                <p>${this.tr('dashboard.noChargesDescription')}</p>
                            </div>
                        `}
                    </div>
                </section>
            </div>
        `;

        document.getElementById('wp-go-manage-stock-btn')?.addEventListener('click', () => {
            this.setCurrentView('inventory');
        });
        document.getElementById('wp-open-log-from-empty-btn')?.addEventListener('click', () => {
            this.setCurrentView('log', { resetEdit: true });
        });
        document.getElementById('wp-apply-filters').onclick = () => {
            const start = document.getElementById('wp-stats-start').value;
            const end = document.getElementById('wp-stats-end').value;
            if (start && end) {
                this.dashboardFilters = { startDate: start, endDate: end };
                this.renderCurrentView();
            }
        };

        document.getElementById('wp-export-csv').onclick = () => this.exportToCSV(filteredLogs);
    }

    /*
    initDashboardCharts(logs, allItems) {
        // Prepare Data

        // 1. Trend Data (Group by Month or Day)
        const dateGroups = {};
        logs.forEach(log => {
            const date = log.date;
            if (!dateGroups[date]) dateGroups[date] = { count: 0, profit: 0 };
            dateGroups[date].count++;
            dateGroups[date].profit += (log.profit || 0);
        });
        const trendLabels = Object.keys(dateGroups).sort();
        const trendCounts = trendLabels.map(date => dateGroups[date].count);
        const trendProfits = trendLabels.map(date => dateGroups[date].profit);

        // 2. Property Distribution Data
        const propertyGroups = {};
        logs.forEach(log => {
            const propName = log.propertyName || log.property;
            if (!propertyGroups[propName]) propertyGroups[propName] = 0;
            propertyGroups[propName]++;
        });
        const distLabels = Object.keys(propertyGroups);
        const distData = Object.values(propertyGroups);

        // 3. Top Items Used Data
        const itemCounts = {};
        logs.forEach(log => {
            log.items.forEach(item => {
                const itemName = item.name;
                if (!itemCounts[itemName]) itemCounts[itemName] = 0;
                itemCounts[itemName] += (item.qty || 1); // Assuming qty property, otherwise 1
            });
        });
        const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10
        const itemLabels = sortedItems.map(i => i[0]);
        const itemData = sortedItems.map(i => i[1]);
                        ${lowStockItems.map(item => `
                            <span class="inline-flex items-center gap-1 bg-white border border-amber-200 rounded-full px-3 py-1 text-sm">
                                <span class="font-medium text-amber-800">${item.name}</span>
                                <span class="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">${item.quantity || 0}</span>
                            </span>
                        `).join('')}
                    </div>
                </div>
                <button onclick="welcomePackManager.currentView='inventory'; welcomePackManager.render();" 
                    class="text-amber-700 hover:text-amber-900 font-medium text-sm whitespace-nowrap">
                    Manage Stock â†’
                </button>
            </div>
            ` : ''}


            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <!-- Date Filter Control -->
                <div class="md:col-span-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-wrap items-center gap-4">
                    <div class="flex items-center gap-2">
                        <span class="text-sm font-bold text-gray-700">Filter Date:</span>
                        <input type="date" id="wp-stats-start" value="${this.dashboardFilters.startDate}" class="border rounded p-1 text-sm">
                        <span class="text-gray-500">-</span>
                        <input type="date" id="wp-stats-end" value="${this.dashboardFilters.endDate}" class="border rounded p-1 text-sm">
                    </div>
                    <button id="wp-apply-filters" class="bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-gray-900">Apply</button>
                    <button id="wp-export-csv" class="ml-auto bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 flex items-center">
                        <i class="fas fa-file-csv mr-1"></i> Export CSV
                    </button>
                </div>

                <!-- KPI Cards -->
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
                    <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Packs Delivered</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The total number of welcome packs that have been logged as 'Delivered' within the selected date range."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">${totalPacks}</p>
                        </div>
                        <div class="p-2 bg-blue-50 text-blue-500 rounded-lg">
                            <i class="fas fa-box"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-gray-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                            <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Cost</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The sum of the cost price for all items included in the delivered packs. This represents your expense."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">â‚¬${totalCost.toFixed(2)}</p>
                        </div>
                         <div class="p-2 bg-gray-50 text-gray-500 rounded-lg">
                            <i class="fas fa-receipt"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                             <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Revenue</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="The total amount sold/charged for the welcome packs."></i>
                            </div>
                            <p class="text-3xl font-bold text-gray-800">â‚¬${totalRevenue.toFixed(2)}</p>
                        </div>
                         <div class="p-2 bg-green-50 text-green-500 rounded-lg">
                            <i class="fas fa-euro-sign"></i>
                        </div>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
                     <div class="flex justify-between items-start">
                        <div>
                             <div class="flex items-center gap-1 mb-1">
                                <h3 class="text-xs font-bold text-gray-400 uppercase tracking-wide">Total Profit (Margin)</h3>
                                <i class="fas fa-info-circle text-gray-300 text-xs cursor-help outline-none" data-tippy-content="Net profit (Revenue - Cost) and the profit margin percentage.<br>A margin above 30% is generally considered healthy (Green arrow)."></i>
                             </div>
                            <p class="text-3xl font-bold text-gray-800">â‚¬${totalProfit.toFixed(2)}</p>
                            <p class="text-sm ${profitMargin >= 30 ? 'text-green-600' : 'text-amber-600'} font-medium mt-1">
                                <i class="fas ${profitMargin >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${profitMargin.toFixed(1)}% Margin
                            </p>
                        </div>
                         <div class="p-2 bg-purple-50 text-purple-500 rounded-lg">
                            <i class="fas fa-chart-line"></i>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Charts Section -->
             <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Performance Trends</h3>
                        <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="Shows the daily profit (Green line) and number of packs delivered (Blue bars) over the selected period.<br>Useful for spotting busy days."></i>
                    </div>
                    <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-trend-chart"></canvas>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-lg font-bold text-gray-800">Distribution by Property</h3>
                        <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="Breakdown of how many packs were delivered to each property."></i>
                    </div>
                    <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-distribution-chart"></canvas>
                    </div>
                </div>
            </div>
            
             <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Top Items Chart (New) -->
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <div class="flex justify-between items-center mb-4">
                         <h3 class="text-lg font-bold text-gray-800">Top Items Used</h3>
                         <i class="fas fa-info-circle text-gray-400 cursor-help outline-none" data-tippy-content="The 10 most frequently used items in packs.<br>Helps you know what to restock."></i>
                    </div>
                     <div class="relative h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                         <canvas id="wp-items-chart"></canvas>
                    </div>
                </div>

                <!-- Recent Activity (Modified to fit) -->
                <div class="bg-white p-6 rounded-xl shadow-md">
                    <h3 class="text-lg font-bold text-gray-800 mb-4">Recent Activity</h3>
                    <div class="overflow-y-auto h-64 space-y-3 pr-2">
                        ${filteredLogs.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10).map(log => `
                            <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                                <div>
                                    <p class="font-medium text-gray-800">${log.propertyName || log.property}</p>
                                    <p class="text-xs text-gray-500">${new Date(log.date).toLocaleDateString()}</p>
                                </div>
                                <div class="text-right flex items-center gap-3">
                                    <div class="mr-2">
                                        <p class="font-bold text-green-600">+â‚¬${(log.profit || 0).toFixed(2)}</p>
                                        <p class="text-xs text-gray-500">${log.items.length} items</p>
                                    </div>
                                    <div class="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                        <button class="text-blue-500 hover:text-blue-700 p-1" onclick="welcomePackManager.editLog('${log.id}')" title="Edit Log">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="text-red-400 hover:text-red-600 p-1" onclick="welcomePackManager.deleteLog('${log.id}')" title="Delete Log">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `).join('') || '<p class="text-gray-500 text-center py-4">No packs logged yet.</p>'}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('wp-apply-filters').onclick = () => {
            const start = document.getElementById('wp-stats-start').value;
            const end = document.getElementById('wp-stats-end').value;
            if (start && end) {
                this.dashboardFilters = { startDate: start, endDate: end };
                this.render();
            }
        };

        document.getElementById('wp-export-csv').onclick = () => this.exportToCSV(filteredLogs);

        // Initialize Charts
        this.initDashboardCharts(filteredLogs, items);

        // Initialize Tooltips (Tippy.js)
        if (typeof tippy !== 'undefined') {
            tippy('[data-tippy-content]', {
                theme: 'light-border',
                animation: 'scale',
                allowHTML: true,
                maxWidth: 300
            });
        }
    }

    initDashboardCharts(logs, allItems) {
        // Prepare Data

        // 1. Trend Data (Group by Month or Day)
        const dateGroups = {};
        logs.forEach(log => {
            // Simple daily grouping for the selected range
            const date = log.date;
            if (!dateGroups[date]) dateGroups[date] = { count: 0, profit: 0 };
            dateGroups[date].count++;
            dateGroups[date].profit += (log.profit || 0);
        });

        const sortedDates = Object.keys(dateGroups).sort();
        const trendLabels = sortedDates; // formatted date could be better
        const trendCounts = sortedDates.map(d => dateGroups[d].count);
        const trendProfits = sortedDates.map(d => dateGroups[d].profit);

        // 2. Property Distribution
        const propStats = {};
        logs.forEach(log => {
            const propName = log.propertyName || log.property;
            if (!propStats[propName]) propStats[propName] = 0;
            propStats[propName]++;
        });
        const distLabels = Object.keys(propStats);
        const distData = Object.values(propStats);

        // 3. Top Items
        const itemCounts = {};
        logs.forEach(log => {
            log.items.forEach(item => {
                const itemName = item.name;
                if (!itemCounts[itemName]) itemCounts[itemName] = 0;
                itemCounts[itemName] += (item.qty || 1); // Assuming qty property, otherwise 1
            });
        });
        // Sort by count desc
        const sortedItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10); // Top 10
        const itemLabels = sortedItems.map(i => i[0]);
        const itemData = sortedItems.map(i => i[1]);


        // Render Charts using Chart.js
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js not loaded');
            return;
        }

        // --- Trend Chart ---
        const ctxTrend = document.getElementById('wp-trend-chart')?.getContext('2d');
        if (ctxTrend) {
            new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: trendLabels,
                    datasets: [
                        {
                            label: 'Profit (â‚¬)',
                            data: trendProfits,
                            backgroundColor: 'rgba(34, 197, 94, 0.5)', // Green
                            borderColor: 'rgba(34, 197, 94, 1)',
                            borderWidth: 1,
                            yAxisID: 'y',
                            type: 'line',
                            tension: 0.3
                        },
                        {
                            label: 'Packs Delivered',
                            data: trendCounts,
                            backgroundColor: 'rgba(59, 130, 246, 0.5)', // Blue
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            title: { display: true, text: 'Profit (â‚¬)' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            grid: { drawOnChartArea: false }, // only want the grid lines for one axis to show up
                            title: { display: true, text: 'Count' }
                        }
                    }
                }
            });
        }

        // --- Distribution Chart ---
        const ctxDist = document.getElementById('wp-distribution-chart')?.getContext('2d');
        if (ctxDist) {
            new Chart(ctxDist, {
                type: 'doughnut',
                data: {
                    labels: distLabels,
                    datasets: [{
                        data: distData,
                        backgroundColor: [
                            'rgba(233, 75, 90, 0.7)', // Brand Red
                            'rgba(59, 130, 246, 0.7)',
                            'rgba(34, 197, 94, 0.7)',
                            'rgba(245, 158, 11, 0.7)',
                            'rgba(168, 85, 247, 0.7)',
                            'rgba(236, 72, 153, 0.7)',
                            'rgba(99, 102, 241, 0.7)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }

        // --- Items Chart ---
        const ctxItems = document.getElementById('wp-items-chart')?.getContext('2d');
        if (ctxItems) {
            new Chart(ctxItems, {
                type: 'bar',
                data: {
                    labels: itemLabels,
                    datasets: [{
                        label: 'Quantity Used',
                        data: itemData,
                        backgroundColor: 'rgba(233, 75, 90, 0.6)',
                        borderColor: 'rgba(233, 75, 90, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y', // Horizontal bar chart
                }
            });
        }
    }

    */

    /**
     * Show the Help/Guide Modal
     */
    showHelpModal() {
        // Remove existing modal if any
        const existingModal = document.getElementById('wp-help-modal');
        if (existingModal) existingModal.remove();

        // Create modal content
        const modal = document.createElement('div');
        modal.id = 'wp-help-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity opacity-0';

        // Trigger generic fade-in
        setTimeout(() => modal.classList.remove('opacity-0'), 10);

        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transform transition-all scale-95 opacity-0" id="wp-help-modal-inner">
                <!-- Header -->
                <div class="bg-gradient-to-r from-blue-600 to-blue-700 p-6 flex justify-between items-center text-white">
                    <div>
                        <h2 class="text-2xl font-bold">${this.tr('help.title')}</h2>
                        <p class="text-blue-100 opacity-90 text-sm mt-1">${this.tr('help.subtitle')}</p>
                    </div>
                    <button id="wp-help-close" class="text-white hover:bg-white/20 rounded-lg p-2 transition-colors">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6 bg-gray-50">
                    
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        <!-- Nav Sidebar (Simple) -->
                        <div class="md:col-span-1 space-y-2 sticky top-0">
                            <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-blue-200 text-blue-700 font-bold flex items-center gap-3 transition-transform hover:translate-x-1" onclick="document.getElementById('help-section-workflow').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-blue-100 text-blue-600 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                                ${this.tr('help.nav.workflow')}
                            </button>
                            <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-blue-600" onclick="document.getElementById('help-section-dashboard').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                                ${this.tr('help.nav.stats')}
                            </button>
                             <button class="w-full text-left px-4 py-3 rounded-lg bg-white shadow-sm border border-gray-200 text-gray-700 font-medium flex items-center gap-3 transition-transform hover:translate-x-1 hover:text-blue-600" onclick="document.getElementById('help-section-inventory').scrollIntoView({behavior: 'smooth'})">
                                <span class="bg-gray-100 text-gray-500 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                                ${this.tr('help.nav.inventory')}
                            </button>
                        </div>

                        <!-- Main Guide Content -->
                        <div class="md:col-span-2 space-y-8">
                            
                            <!-- SECTION 1: WORKFLOW -->
                            <div id="help-section-workflow" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-tasks text-blue-500"></i> ${this.tr('help.sections.workflow.title')}
                                </h3>
                                <div class="space-y-4">
                                    <div class="flex gap-4">
                                        <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">1</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">${this.tr('help.sections.workflow.steps.checkReservations.title')}</h4>
                                            <p class="text-sm text-gray-600 mt-1">${this.tr('help.sections.workflow.steps.checkReservations.body')}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4">
                                         <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">2</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">${this.tr('help.sections.workflow.steps.logPack.title')}</h4>
                                            <p class="text-sm text-gray-600 mt-1">${this.tr('help.sections.workflow.steps.logPack.body')}</p>
                                        </div>
                                    </div>
                                    <div class="flex gap-4">
                                         <div class="flex-shrink-0 mt-1">
                                            <div class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">3</div>
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">${this.tr('help.sections.workflow.steps.saveMonitor.title')}</h4>
                                            <p class="text-sm text-gray-600 mt-1">${this.tr('help.sections.workflow.steps.saveMonitor.body')}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div id="help-section-dashboard" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-chart-pie text-purple-500"></i> ${this.tr('help.sections.stats.title')}
                                </h3>
                                <p class="text-sm text-gray-600 mb-4">${this.tr('help.sections.stats.body')}</p>
                                <ul class="space-y-3 text-sm">
                                    <li class="flex items-start gap-2">
                                        <span class="font-bold text-gray-700 min-w-[100px]">${this.tr('help.sections.stats.items.margin.label')}</span>
                                        <span class="text-gray-600">${this.tr('help.sections.stats.items.margin.body')}</span>
                                    </li>
                                    <li class="flex items-start gap-2">
                                        <span class="font-bold text-gray-700 min-w-[100px]">${this.tr('help.sections.stats.items.trends.label')}</span>
                                        <span class="text-gray-600">${this.tr('help.sections.stats.items.trends.body')}</span>
                                    </li>
                                </ul>
                            </div>

                             <!-- SECTION 3: INVENTORY -->
                            <div id="help-section-inventory" class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <h3 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                                    <i class="fas fa-boxes text-amber-500"></i> ${this.tr('help.sections.inventory.title')}
                                </h3>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div class="bg-amber-50 p-3 rounded-lg">
                                        <h4 class="font-bold text-amber-800 mb-1">${this.tr('help.sections.inventory.cards.stock.title')}</h4>
                                        <p class="text-xs text-amber-700">${this.tr('help.sections.inventory.cards.stock.body')}</p>
                                    </div>
                                    <div class="bg-green-50 p-3 rounded-lg">
                                        <h4 class="font-bold text-green-800 mb-1">${this.tr('help.sections.inventory.cards.presets.title')}</h4>
                                        <p class="text-xs text-green-700">${this.tr('help.sections.inventory.cards.presets.body')}</p>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
                
                <!-- Footer -->
                <div class="p-4 bg-gray-100 border-t border-gray-200 text-center">
                    <button id="wp-help-done-btn" class="bg-blue-600 text-white px-8 py-2 rounded-lg hover:bg-blue-700 font-medium transition-colors">
                        ${this.tr('help.done')}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Trigger inner scale animation
        setTimeout(() => {
            const inner = document.getElementById('wp-help-modal-inner');
            inner.classList.remove('scale-95', 'opacity-0');
            inner.classList.add('scale-100', 'opacity-100');
        }, 50);

        // Close handlers
        const close = () => {
            modal.classList.add('opacity-0'); // Fade out wrapper
            const inner = document.getElementById('wp-help-modal-inner');
            inner.classList.remove('scale-100', 'opacity-100');
            inner.classList.add('scale-95', 'opacity-0');
            setTimeout(() => modal.remove(), 300); // Remove after anim
        };
        document.getElementById('wp-help-close').onclick = close;
        document.getElementById('wp-help-done-btn').onclick = close;
        modal.onclick = (e) => {
            if (e.target === modal) close();
        };
    }


    /**
     * Render the Reservations view with two sub-tabs
     */
    async renderReservations(container) {
        // Default to 'upcoming' sub-tab if not set
        if (!this.reservationsSubTab) {
            this.reservationsSubTab = 'upcoming';
        }
        if (!this.reservationsDateFilter) {
            this.reservationsDateFilter = 7; // Default: 7 days
        }

        container.innerHTML = `
            <!-- Sub-Tab Navigation -->
            <div class="bg-white rounded-xl shadow-md mb-6 overflow-hidden">
                <div class="flex border-b border-gray-200">
                    <button id="wp-subtab-upcoming" class="flex-1 px-6 py-4 text-center font-medium transition-colors ${this.reservationsSubTab === 'upcoming'
                ? 'text-[#e94b5a] border-b-2 border-[#e94b5a] bg-red-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}">
                        <i class="fas fa-calendar-alt mr-2"></i>
                        ${this.tr('reservations.tabs.upcoming')}
                    </button>
                    <button id="wp-subtab-settings" class="flex-1 px-6 py-4 text-center font-medium transition-colors ${this.reservationsSubTab === 'settings'
                ? 'text-[#e94b5a] border-b-2 border-[#e94b5a] bg-red-50'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}">
                        <i class="fas fa-cog mr-2"></i>
                        ${this.tr('reservations.tabs.settings')}
                    </button>
                </div>
                
                <!-- Sub-Tab Content -->
                <div id="wp-subtab-content" class="p-6">
                    <!-- Content will be inserted based on active tab -->
                </div>
            </div>
        `;

        // Set up sub-tab listeners
        document.getElementById('wp-subtab-upcoming').onclick = () => {
            this.reservationsSubTab = 'upcoming';
            this.renderReservations(container);
        };
        document.getElementById('wp-subtab-settings').onclick = () => {
            this.reservationsSubTab = 'settings';
            this.renderReservations(container);
        };

        // Render the appropriate sub-tab content
        const contentContainer = document.getElementById('wp-subtab-content');
        if (this.reservationsSubTab === 'upcoming') {
            await this.renderUpcomingReservations(contentContainer);
        } else {
            await this.renderPropertySettings(contentContainer);
        }
    }


    /**
     * Render Upcoming Reservations sub-tab (View Only)
     */
    async renderUpcomingReservations(container) {
        // Get stats
        let configuredCount = 0;
        let totalCount = 0;
        let properties = [];
        try {
            properties = await this._fetchData('properties');
            totalCount = properties.length;
            configuredCount = properties.filter(p => p.welcomePackEnabled).length;
        } catch (e) {
            console.warn('[WelcomePack] Could not fetch properties:', e);
        }

        const filterDays = this.reservationsDateFilter;

        // Load cached last sync time
        const lastSync = localStorage.getItem('wp_last_sync');
        const lastSyncText = lastSync
            ? this.tr('reservations.upcoming.lastUpdated', { time: this.formatDisplayTime(lastSync) })
            : '';

        container.innerHTML = `
            <!-- Header with Sync Button -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${this.tr('reservations.upcoming.title')}</h3>
                    <p class="text-sm text-gray-500">${this.tr('reservations.upcoming.summary', { enabled: configuredCount, total: totalCount })}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span id="wp-last-sync-label" class="text-xs text-gray-400 font-medium">${lastSyncText}</span>
                    <button id="wp-sync-reservations-btn" style="background-color: #ef4444 !important; color: white !important;" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm">
                        <i class="fas fa-sync-alt"></i> ${this.tr('reservations.upcoming.syncNow')}
                    </button>
                </div>
            </div>

            <!-- Date Filter Buttons -->
            <div class="flex flex-wrap gap-2 mb-6">
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 7
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="7" style="${filterDays === 7 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    ${this.tr('reservations.upcoming.filters.next7')}
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 15
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="15" style="${filterDays === 15 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    ${this.tr('reservations.upcoming.filters.next15')}
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 30
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="30" style="${filterDays === 30 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    ${this.tr('reservations.upcoming.filters.next30')}
                </button>
                <button class="wp-date-filter px-4 py-2 rounded-lg font-medium transition-colors ${filterDays === 365
                ? 'bg-red-500 text-white'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}" data-days="365" style="${filterDays === 365 ? 'background-color: #ef4444 !important; color: white !important;' : ''}">
                    ${this.tr('reservations.upcoming.filters.viewAll')}
                </button>
            </div>

            <!-- Reservations List -->
            <div id="wp-reservations-list" class="space-y-3">
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-circle-notch fa-spin text-3xl text-gray-300 mb-4"></i>
                    <p class="text-lg font-medium mb-2">${this.tr('reservations.upcoming.loading')}</p>
                </div>
            </div>

            <!-- Quick Stats -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">${this.tr('reservations.upcoming.stats.today')}</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-today-count">â€”</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">${this.tr('reservations.upcoming.stats.week')}</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-week-count">â€”</p>
                </div>
                <div class="bg-gray-50 rounded-lg p-4 text-center">
                    <p class="text-sm text-gray-500">${this.tr('reservations.upcoming.stats.nextDays', { count: filterDays })}</p>
                    <p class="text-2xl font-bold text-gray-800" id="wp-period-count">â€”</p>
                </div>
            </div>
        `;

        // Event listeners
        document.getElementById('wp-sync-reservations-btn').onclick = () => this.syncAndDisplayReservations(false); // Manual sync

        document.querySelectorAll('.wp-date-filter').forEach(btn => {
            btn.onclick = () => {
                this.reservationsDateFilter = parseInt(btn.dataset.days);
                this.renderReservations(document.getElementById('wp-view-container'));
            };
        });

        // AUTO-SYNC LOGIC
        // 1. Try to load from cache immediately
        const cachedData = localStorage.getItem('wp_reservations');
        if (cachedData) {
            try {
                const parsedData = JSON.parse(cachedData);
                // Render with cached data immediately
                this.displayReservationsList(parsedData, properties);
            } catch (e) {
                console.error('Error parsing cached reservations', e);
            }
        } else {
            // If no cache, standard loading state is already in HTML
        }

        // 2. Trigger background sync
        // Pass 'true' for isBackground to avoid showing the loading spinner if cache exists
        this.syncAndDisplayReservations(!!cachedData);
    }

    /**
     * Render iCal Connections sub-tab (Settings)
     */
    /**
     * Render Property Settings sub-tab - Enable/disable welcome pack for properties
     */
    async renderPropertySettings(container) {
        let properties = [];
        let enabledCount = 0;
        try {
            properties = await this._fetchData('properties');
            enabledCount = properties.filter(p => p.welcomePackEnabled).length;
        } catch (e) {
            console.warn('[WelcomePack] Could not fetch properties:', e);
        }

        container.innerHTML = `
            <!-- Header -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${this.tr('reservations.settings.title')}</h3>
                    <p class="text-sm text-gray-500">${this.tr('reservations.settings.summary', { enabled: enabledCount, total: properties.length })}</p>
                </div>
            </div>

            <!-- Info Banner -->
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div class="flex items-start gap-3">
                    <i class="fas fa-info-circle text-blue-500 text-lg mt-0.5"></i>
                    <div>
                        <p class="text-sm text-blue-800 font-medium">${this.tr('reservations.settings.bannerTitle')}</p>
                        <p class="text-sm text-blue-700 mt-1">
                            ${this.tr('reservations.settings.bannerBody')}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Search Input -->
            <div class="relative mb-4">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <i class="fas fa-search text-gray-400"></i>
                </div>
                <input type="text" id="wp-property-settings-search" 
                    placeholder="${this.tr('reservations.settings.searchPlaceholder')}" 
                    class="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg"
                    autocomplete="off">
            </div>
            
            <!-- Search Results -->
            <div id="wp-property-settings-results" class="border border-gray-200 rounded-lg overflow-hidden hidden mb-6">
                <!-- Results will be inserted here -->
            </div>
            
            <!-- Empty State / Instructions -->
            <div id="wp-property-settings-empty" class="text-center py-8 text-gray-500 mb-6">
                <i class="fas fa-building text-4xl text-gray-300 mb-3"></i>
                <p>${this.tr('reservations.settings.startTyping')}</p>
            </div>

            <!-- Enabled Properties List -->
            <div class="border-t border-gray-200 pt-6">
                <h4 class="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">
                    <i class="fas fa-gift text-[#e94b5a] mr-2"></i>
                    ${this.tr('reservations.settings.enabledListTitle', { count: enabledCount })}
                </h4>
                
                ${enabledCount > 0 ? `
                    <div class="space-y-2">
                        ${properties.filter(p => p.welcomePackEnabled).map(property => `
                            <div class="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-lg">
                                <div class="flex-1">
                                    <span class="font-medium text-gray-800">${property.name || property.id}</span>
                                    <span class="ml-2 text-xs text-green-600">
                                        <i class="fas fa-check-circle"></i> ${this.tr('reservations.settings.enabledBadge')}
                                    </span>
                                </div>
                                <button class="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                    onclick="welcomePackManager.toggleWelcomePack('${property.id}', false)">
                                    <i class="fas fa-times mr-1"></i> ${this.tr('reservations.search.disable')}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="text-center py-6 text-gray-400 bg-gray-50 rounded-lg">
                        <i class="fas fa-gift text-3xl mb-2 opacity-50"></i>
                        <p>${this.tr('reservations.settings.emptyTitle')}</p>
                        <p class="text-sm">${this.tr('reservations.settings.emptyBody')}</p>
                    </div>
                `}
            </div>
        `;

        // Property search with debounce
        let searchTimeout = null;
        document.getElementById('wp-property-settings-search').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();

            if (query.length < 2) {
                document.getElementById('wp-property-settings-results').classList.add('hidden');
                document.getElementById('wp-property-settings-empty').classList.remove('hidden');
                return;
            }

            searchTimeout = setTimeout(() => this.searchPropertiesForSettings(query), 300);
        });
    }

    /**
     * Search properties for welcome pack settings
     */
    async searchPropertiesForSettings(query) {
        const resultsContainer = document.getElementById('wp-property-settings-results');
        const emptyState = document.getElementById('wp-property-settings-empty');

        if (!resultsContainer) return;

        // Show loading
        resultsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                <i class="fas fa-circle-notch fa-spin mr-2"></i> ${this.tr('reservations.search.loading')}
            </div>
        `;

        try {
            const properties = await this._fetchData('properties');
            const lowerQuery = query.toLowerCase();

            // Filter properties by name
            const matches = properties.filter(p =>
                (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
                (p.id && p.id.toLowerCase().includes(lowerQuery))
            ).slice(0, 10); // Limit to 10 results

            if (matches.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-4 text-center text-gray-500">
                        <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
                        <p>${this.tr('reservations.search.noMatch', { query })}</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = matches.map(property => `
                <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <div class="flex-1">
                        <span class="font-medium text-gray-800">${property.name || property.id}</span>
                        ${property.welcomePackEnabled
                    ? `<span class="ml-2 inline-flex items-center gap-1 text-green-600 text-xs">
                                <i class="fas fa-check-circle"></i> ${this.tr('reservations.search.enabled')}
                              </span>`
                    : `<span class="ml-2 inline-flex items-center gap-1 text-gray-400 text-xs">
                                <i class="fas fa-times-circle"></i> ${this.tr('reservations.search.disabled')}
                              </span>`
                }
                    </div>
                    <button class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${property.welcomePackEnabled
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }"
                        onclick="welcomePackManager.toggleWelcomePack('${property.id}', ${!property.welcomePackEnabled})">
                        ${property.welcomePackEnabled
                    ? `<i class="fas fa-times mr-1"></i> ${this.tr('reservations.search.disable')}`
                    : `<i class="fas fa-check mr-1"></i> ${this.tr('reservations.search.enable')}`}
                    </button>
                </div>
            `).join('');

        } catch (error) {
            console.error('[WelcomePack] Error searching properties:', error);
            resultsContainer.innerHTML = `
                <div class="p-4 text-center text-red-500">
                    <i class="fas fa-exclamation-circle mr-2"></i> ${this.tr('reservations.search.error')}
                </div>
            `;
        }
    }

    /**
     * Toggle welcome pack enabled/disabled for a property
     */
    async toggleWelcomePack(propertyId, enabled) {
        try {
            await this.dataManager.updatePropertyWelcomePack(propertyId, enabled);
            this._invalidateCache('properties');
            this.renderReservations(document.getElementById('wp-view-container'));
        } catch (error) {
            console.error('[WelcomePack] Error toggling welcome pack:', error);
            alert(this.tr('reservations.messages.toggleError'));
        }
    }


    /**
     * Search properties for iCal configuration
     */
    async searchPropertiesForIcal(query) {
        const resultsContainer = document.getElementById('wp-ical-search-results');
        const emptyState = document.getElementById('wp-ical-search-empty');

        if (!resultsContainer) return;

        // Show loading
        resultsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="p-4 text-center text-gray-500">
                <i class="fas fa-circle-notch fa-spin mr-2"></i> ${this.tr('reservations.search.loading')}
            </div>
        `;

        try {
            const properties = await this._fetchData('properties');
            const lowerQuery = query.toLowerCase();

            // Filter properties by name
            const matches = properties.filter(p =>
                (p.name && p.name.toLowerCase().includes(lowerQuery)) ||
                (p.id && p.id.toLowerCase().includes(lowerQuery))
            ).slice(0, 10); // Limit to 10 results

            if (matches.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="p-4 text-center text-gray-500">
                        <i class="fas fa-search text-gray-300 text-2xl mb-2"></i>
                        <p>${this.tr('reservations.search.noMatch', { query })}</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = matches.map(property => `
                <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <div class="flex-1">
                        <span class="font-medium text-gray-800">${property.name || property.id}</span>
                        ${property.icalUrl
                    ? `<span class="ml-2 inline-flex items-center gap-1 text-green-600 text-xs">
                                <i class="fas fa-check-circle"></i> ${this.tr('ical.search.connected')}
                              </span>`
                    : `<span class="ml-2 inline-flex items-center gap-1 text-gray-400 text-xs">
                                <i class="fas fa-times-circle"></i> ${this.tr('ical.search.notConnected')}
                              </span>`
                }
                    </div>
                    <button class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${property.icalUrl
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-[#e94b5a] text-white hover:bg-[#d3414f]'
                }"
                        onclick="welcomePackManager.showIcalConfigModal('${property.id}', '${(property.name || '').replace(/'/g, "\\'")}', '${(property.icalUrl || '').replace(/'/g, "\\'")}')">
                        ${property.icalUrl
                    ? `<i class="fas fa-edit mr-1"></i> ${this.tr('ical.search.edit')}`
                    : `<i class="fas fa-plus mr-1"></i> ${this.tr('ical.search.add')}`}
                    </button>
                </div>
            `).join('');

        } catch (error) {
            console.error('[WelcomePack] Error searching properties:', error);
            resultsContainer.innerHTML = `
                <div class="p-4 text-center text-red-500">
                    <i class="fas fa-exclamation-circle mr-2"></i> ${this.tr('reservations.search.error')}
                </div>
            `;
        }
    }

    /**
     * Remove iCal URL from a property
     */
    async removeIcalUrl(propertyId, propertyName) {
        if (!confirm(this.tr('ical.messages.removeConfirm', { property: propertyName }))) {
            return;
        }

        try {
            await this.dataManager.updatePropertyIcalUrl(propertyId, '');
            this._invalidateCache('properties');
            this.renderReservations(document.getElementById('wp-view-container'));
        } catch (error) {
            console.error('[WelcomePack] Error removing iCal URL:', error);
            alert(this.tr('ical.messages.removeError'));
        }
    }

    /**
     * Sync calendars and display reservations list
     */
    /**
     * Sync reservations from configured sources and update the display
     * @param {boolean} isBackground - If true, run silently without showing loading spinner
     */
    async syncAndDisplayReservations(isBackground = false) {
        const listContainer = document.getElementById('wp-reservations-list');
        const syncBtn = document.getElementById('wp-sync-reservations-btn');
        const lastSyncLabel = document.getElementById('wp-last-sync-label');

        if (!listContainer) return;

        // Show loading state only if not background sync
        if (!isBackground && syncBtn) {
            syncBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${this.tr('reservations.upcoming.syncing')}`;
            syncBtn.disabled = true;

            listContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-circle-notch fa-spin text-4xl text-gray-400 mb-4"></i>
                    <p class="text-lg">${this.tr('reservations.upcoming.fetching')}</p>
                </div>
            `;
        }

        try {
            // 1. Fetch Properties
            let properties = [];
            try {
                properties = await this._fetchData('properties');
            } catch (e) {
                console.warn('[WelcomePack] Could not fetch properties:', e);
            }

            // 2. Fetch Reservations (Google Sheets)
            const allReservations = [];
            try {
                const sheetsReservations = await this.fetchGoogleSheetsReservations();
                allReservations.push(...sheetsReservations);
                console.log(`[WelcomePack] Fetched ${sheetsReservations.length} reservations from Google Sheets`);
            } catch (error) {
                console.error('[WelcomePack] Error fetching from Google Sheets:', error);
            }

            // 3. Cache Data & Timestamp
            localStorage.setItem('wp_reservations', JSON.stringify(allReservations));
            const now = new Date();
            localStorage.setItem('wp_last_sync', now.toISOString());

            // 4. Update UI
            if (lastSyncLabel) {
                lastSyncLabel.textContent = this.tr('reservations.upcoming.lastUpdated', {
                    time: this.formatDisplayTime(now)
                });
            }

            this.displayReservationsList(allReservations, properties);

        } catch (error) {
            console.error('[WelcomePack] Error syncing reservations:', error);
            if (!isBackground) {
                listContainer.innerHTML = `
                    <div class="text-center py-12 text-red-500">
                        <i class="fas fa-exclamation-triangle text-5xl mb-4"></i>
                        <p class="text-lg font-medium">${this.tr('reservations.upcoming.syncErrorTitle')}</p>
                        <p class="text-sm">${error.message}</p>
                    </div>
                `;
            }
        } finally {
            // Reset button state
            if (syncBtn) {
                syncBtn.innerHTML = `<i class="fas fa-sync-alt"></i> ${this.tr('reservations.upcoming.syncNow')}`;
                syncBtn.disabled = false;
            }
        }
    }

    /**
     * Render the list of reservations based on current data and filters
     */
    displayReservationsList(allReservations, properties) {
        const listContainer = document.getElementById('wp-reservations-list');
        if (!listContainer) return;

        // Get enabled property names for filtering
        const enabledProperties = properties.filter(p => p.welcomePackEnabled);
        const enabledPropertyNames = enabledProperties.map(p => (p.name || p.id).toLowerCase());

        // Filter to only show reservations for welcome-pack-enabled properties
        const enabledReservations = allReservations.filter(r => {
            const propertyName = (r.propertyName || '').toLowerCase();
            return enabledPropertyNames.some(enabled =>
                propertyName.includes(enabled) || enabled.includes(propertyName)
            );
        });

        // 1. Check if ANY properties are enabled
        if (enabledProperties.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-gift text-5xl text-amber-400 mb-4"></i>
                    <p class="text-lg font-medium text-gray-700 mb-2">${this.tr('reservations.upcoming.noEnabledTitle')}</p>
                    <p class="text-sm text-gray-500 mb-4">${this.tr('reservations.upcoming.noEnabledBody')}</p>
                    <button onclick="welcomePackManager.reservationsSubTab='settings'; welcomePackManager.renderReservations(document.getElementById('wp-view-container'));"
                        class="px-4 py-2 bg-[#e94b5a] text-white rounded-lg hover:bg-[#d3414f] transition-colors">
                        <i class="fas fa-cog mr-2"></i> ${this.tr('reservations.upcoming.configureProperties')}
                    </button>
                </div>
            `;
            return;
        }

        // 2. Filter by date range
        const filterDays = this.reservationsDateFilter || 7;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + filterDays);

        const filteredReservations = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn >= today && checkIn <= endDate;
        }).sort((a, b) => new Date(a.checkIn) - new Date(b.checkIn));

        // 3. Update Stats
        const todayStr = today.toISOString().split('T')[0];
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + 7);

        const todayCount = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn.toISOString().split('T')[0] === todayStr;
        }).length;

        const weekCount = enabledReservations.filter(r => {
            const checkIn = new Date(r.checkIn);
            return checkIn >= today && checkIn <= weekEnd;
        }).length;

        const todayEl = document.getElementById('wp-today-count');
        const weekEl = document.getElementById('wp-week-count');
        const periodEl = document.getElementById('wp-period-count');

        if (todayEl) todayEl.textContent = todayCount.toString();
        if (weekEl) weekEl.textContent = weekCount.toString();
        if (periodEl) periodEl.textContent = filteredReservations.length.toString();


        // 4. Render List
        if (filteredReservations.length === 0) {
            listContainer.innerHTML = `
                <div class="text-center py-12 text-gray-500">
                    <i class="fas fa-calendar-check text-4xl text-gray-300 mb-3"></i>
                    <p class="text-lg font-medium text-gray-600">${this.tr('reservations.upcoming.noUpcomingTitle', { count: filterDays })}</p>
                    <p class="text-sm mt-1">${this.tr('reservations.upcoming.noUpcomingBody')}</p>
                    ${enabledReservations.length === 0 ? `<p class="text-xs text-amber-500 mt-2">${this.tr('reservations.upcoming.noEnabledReservations')}</p>` : ''}
                </div>
            `;
            return;
        }

        let html = '<div class="space-y-3">';

        for (const reservation of filteredReservations) {
            const checkInDate = new Date(reservation.checkIn);
            const checkOutDate = new Date(reservation.checkOut);
            const isToday = checkInDate.toISOString().split('T')[0] === todayStr;
            const isTomorrow = checkInDate.toISOString().split('T')[0] === new Date(today.getTime() + 86400000).toISOString().split('T')[0];
            const nights = Math.round((checkOutDate - checkInDate) / (1000 * 60 * 60 * 24));

            html += `
            <div class="bg-white border ${isToday ? 'border-green-300 bg-green-50' : 'border-gray-200'} rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            ${isToday ? `<span class="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded">${this.tr('reservations.upcoming.badges.today')}</span>` : ''}
                            ${isTomorrow ? `<span class="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded">${this.tr('reservations.upcoming.badges.tomorrow')}</span>` : ''}
                            <span class="font-medium text-gray-800">${reservation.propertyName}</span>
                        </div>
                        <div class="text-sm text-gray-600 mb-2 grid grid-cols-2 gap-2">
                            <div>
                                <p class="text-xs text-gray-400 uppercase">${this.tr('reservations.upcoming.labels.checkIn')}</p>
                                <p class="font-medium flex items-center gap-1">
                                    <i class="fas fa-sign-in-alt text-green-500"></i>
                                    ${this.formatCompactDate(checkInDate)}
                                </p>
                            </div>
                            <div>
                                <p class="text-xs text-gray-400 uppercase">${this.tr('reservations.upcoming.labels.checkOut')}</p>
                                <p class="font-medium flex items-center gap-1">
                                    <i class="fas fa-sign-out-alt text-red-500"></i>
                                    ${this.formatCompactDate(checkOutDate)}
                                </p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 text-xs text-gray-500">
                            <span class="bg-gray-100 px-2 py-1 rounded">${this.pluralize('reservations.upcoming.nights', nights)}</span>
                            ${reservation.guestName
                    ? `<span class="font-medium text-gray-700"><i class="fas fa-user mr-1"></i>${reservation.guestName}</span>`
                    : (reservation.summary && reservation.summary !== 'UNAVAILABLE')
                        ? `<span><i class="fas fa-user mr-1"></i>${reservation.summary}</span>`
                        : `<span class="text-gray-400"><i class="fas fa-lock mr-1"></i>${this.tr('reservations.upcoming.blockedReserved')}</span>`
                }
                            ${reservation.portal
                    ? `<span class="px-2 py-0.5 rounded text-xs font-medium ${reservation.portal.toLowerCase().includes('airbnb') ? 'bg-red-100 text-red-700' :
                        reservation.portal.toLowerCase().includes('booking') ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                    }">${reservation.portal}</span>`
                    : ''
                }
                        </div>

                    </div>
                    <button onclick="welcomePackManager.logPackForReservation('${reservation.propertyName.replace(/'/g, "\\'")}')"
                            class="px-3 py-2 bg-[#e94b5a] text-white text-sm rounded-lg hover:bg-[#d3414f] transition-colors flex items-center gap-1 ml-4">
                    <i class="fas fa-gift"></i> ${this.tr('reservations.upcoming.assignPack')}
                </button>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        listContainer.innerHTML = html;
    }

    /**
     * Fetch and parse iCal data from a URL
     */
    async fetchAndParseIcal(icalUrl, propertyName) {
        // Use CORS proxy for cross-origin requests
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(icalUrl)}`;

        let response;
        try {
            // Try direct fetch first
            response = await fetch(icalUrl);
            if (!response.ok) throw new Error('Direct fetch failed');
        } catch (e) {
            // Fall back to CORS proxy
            console.log(`[WelcomePack] Using CORS proxy for ${propertyName}`);
            response = await fetch(proxyUrl);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch calendar: ${response.status}`);
        }

        const icalText = await response.text();
        return this.parseIcalData(icalText, propertyName);
    }

    /**
     * Parse iCal text data into reservation objects
     */
    parseIcalData(icalText, propertyName) {
        const reservations = [];

        // Split into events
        const events = icalText.split('BEGIN:VEVENT');

        for (let i = 1; i < events.length; i++) {
            const eventBlock = events[i].split('END:VEVENT')[0];

            // Extract DTSTART
            const dtStartMatch = eventBlock.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
            // Extract DTEND
            const dtEndMatch = eventBlock.match(/DTEND(?:;VALUE=DATE)?:(\d{8})/);
            // Extract SUMMARY
            const summaryMatch = eventBlock.match(/SUMMARY:(.+?)(?:\r?\n|\r)/);

            if (dtStartMatch && dtEndMatch) {
                const startStr = dtStartMatch[1];
                const endStr = dtEndMatch[1];

                // Parse dates (format: YYYYMMDD)
                const checkIn = new Date(
                    parseInt(startStr.substring(0, 4)),
                    parseInt(startStr.substring(4, 6)) - 1,
                    parseInt(startStr.substring(6, 8))
                );

                const checkOut = new Date(
                    parseInt(endStr.substring(0, 4)),
                    parseInt(endStr.substring(4, 6)) - 1,
                    parseInt(endStr.substring(6, 8))
                );

                reservations.push({
                    propertyName: propertyName,
                    checkIn: checkIn.toISOString(),
                    checkOut: checkOut.toISOString(),
                    summary: summaryMatch ? summaryMatch[1].trim() : this.tr('reservations.upcoming.reserved')
                });
            }
        }

        return reservations;
    }

    /**
     * Fetch reservations from Google Apps Script Web App
     * The script automatically aggregates all sheets and returns JSON
     */
    async fetchGoogleSheetsReservations() {
        const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyvIkBDhwZ3MxOW8aQUlD5qx3UV9l8wS-dMg8PcixJIrJ7-eXAid6vo6stchkBNfGpA/exec';

        try {
            const response = await fetch(APPS_SCRIPT_URL);

            if (!response.ok) {
                throw new Error(`Script returned status: ${response.status}`);
            }

            const reservations = await response.json();
            return reservations;

        } catch (error) {
            console.error('[WelcomePack] Error fetching from Apps Script:', error);
            return [];
        }
    }




    /**
     * Quick action to log a pack for a reservation
     */
    logPackForReservation(propertyName) {
        this.logEntries = [this.createLogEntry({ property: propertyName })];
        this.activeLogEntryId = this.logEntries[0].id;
        this.setCurrentView('log', { resetEdit: true });
    }




    /**
     * Show modal to configure iCal URL for a property
     */
    showIcalConfigModal(propertyId, propertyName, currentUrl) {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-ical-config-modal">
                <div class="relative p-5 border w-[500px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-2">${this.tr('ical.modal.title')}</h3>
                    <p class="text-sm text-gray-600 mb-4">${this.tr('ical.modal.property', { property: propertyName || propertyId })}</p>
                    
                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">${this.tr('ical.modal.urlLabel')}</label>
                            <input type="url" id="wp-ical-url-input" value="${currentUrl}" 
                                placeholder="${this.tr('ical.modal.urlPlaceholder')}" 
                                class="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <p class="text-xs text-gray-500 mt-1">
                                ${this.tr('ical.modal.urlHelp')}
                            </p>
                        </div>
                        
                        <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p class="text-sm text-blue-800"><i class="fas fa-info-circle mr-2"></i>${this.tr('ical.modal.howToFind')}</p>
                            <ul class="text-xs text-blue-700 mt-2 space-y-1 ml-4">
                                <li>${this.tr('ical.modal.providers.airbnb')}</li>
                                <li>${this.tr('ical.modal.providers.booking')}</li>
                                <li>${this.tr('ical.modal.providers.vrbo')}</li>
                            </ul>
                        </div>
                        
                        <div class="flex justify-end gap-2">
                            <button id="wp-ical-cancel-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">${this.tr('actions.cancel')}</button>
                            <button id="wp-ical-test-btn" class="px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">${this.tr('ical.modal.test')}</button>
                            <button id="wp-ical-save-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">${this.tr('ical.modal.save')}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('wp-ical-cancel-btn').onclick = () => {
            document.getElementById('wp-ical-config-modal').remove();
        };

        document.getElementById('wp-ical-test-btn').onclick = async () => {
            const url = document.getElementById('wp-ical-url-input').value.trim();
            if (!url) {
                alert(this.tr('ical.messages.enterUrl'));
                return;
            }

            const btn = document.getElementById('wp-ical-test-btn');
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${this.tr('ical.modal.testing')}`;
            btn.disabled = true;

            try {
                // Try to fetch the URL
                const response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
                const text = await response.text();

                if (text.includes('BEGIN:VCALENDAR')) {
                    alert(this.tr('ical.messages.valid'));
                } else {
                    alert(this.tr('ical.messages.invalid'));
                }
            } catch (error) {
                alert(this.tr('ical.messages.fetchFailed'));
            } finally {
                btn.innerHTML = this.tr('ical.modal.test');
                btn.disabled = false;
            }
        };

        document.getElementById('wp-ical-save-btn').onclick = async () => {
            const url = document.getElementById('wp-ical-url-input').value.trim();

            try {
                // Save iCal URL to property (you'll need to add this method to DataManager)
                if (this.dataManager.updatePropertyIcalUrl) {
                    await this.dataManager.updatePropertyIcalUrl(propertyId, url);
                } else {
                    // Fallback: store in a separate collection
                    console.warn('[WelcomePack] updatePropertyIcalUrl not available, storing separately');
                    // For now, just close and show message
                    alert(this.tr('ical.messages.savedFallback'));
                }

                this._invalidateCache('properties');
                document.getElementById('wp-ical-config-modal').remove();
                this.render();
            } catch (error) {
                console.error('[WelcomePack] Error saving iCal URL:', error);
                alert(this.tr('ical.messages.saveFailed'));
            }
        };
    }


    exportToCSV(logs) {
        if (!logs || logs.length === 0) {
            alert(this.tr('messages.noDataToExport'));
            return;
        }

        const normalizedLogs = logs.map((log) => normalizeWelcomePackLog(log));
        const headers = [
            this.tr('export.date'),
            this.tr('export.property'),
            this.tr('export.materials'),
            this.tr('export.units'),
            this.tr('export.materialCost'),
            this.tr('export.suggestedChargeNet'),
            this.tr('export.suggestedCharge'),
            this.tr('export.vat'),
            this.tr('export.chargedAmount'),
            this.tr('export.profit')
        ];
        const csvContent = [
            headers.join(','),
            ...normalizedLogs.map((log) => {
                const itemNames = log.items.map((item) => `${item.quantity || 1}x ${item.name}`).join('; ');
                return [
                    log.date,
                    `"${log.propertyName || log.property}"`,
                    `"${itemNames}"`,
                    log.totalUnits,
                    log.totalCost.toFixed(2),
                    log.suggestedSellNet.toFixed(2),
                    log.suggestedSellGross.toFixed(2),
                    log.vatAmount.toFixed(2),
                    log.chargedAmount.toFixed(2),
                    log.profit.toFixed(2)
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `welcome_packs_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    async renderInventory(container) {
        const items = await this._fetchData('items');
        const inventorySummary = summarizeWelcomePackInventory(items);
        const lowStockItems = inventorySummary.lowStockItems;

        container.innerHTML = `
            ${lowStockItems.length > 0 ? `
            <section class="welcome-pack-inline-alert">
                <div class="welcome-pack-inline-alert-icon">
                    <i class="fas fa-triangle-exclamation"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3>${this.tr('inventory.lowStockTitle')}</h3>
                    <p>${this.tr('inventory.lowStockBody', {
                        items: lowStockItems.map((item) => `${item.name} (${item.quantity || 0})`).join(', ')
                    })}</p>
                </div>
            </section>
            ` : ''}

            <section class="welcome-pack-panel">
                <div class="welcome-pack-panel-heading welcome-pack-panel-heading--row">
                    <div>
                        <p class="welcome-pack-section-kicker">${this.tr('workflow.materialCosts.label')}</p>
                        <h3>${this.tr('inventory.title')}</h3>
                        <p>${this.tr('inventory.description')}</p>
                    </div>
                    <button id="wp-add-item-btn" class="welcome-pack-nav-button is-active">
                        <i class="fas fa-plus"></i>
                        <span>${this.tr('inventory.addMaterial')}</span>
                    </button>
                </div>

                <div class="welcome-pack-metric-grid">
                    <article class="welcome-pack-metric">
                        <span>${this.tr('inventory.metrics.tracked')}</span>
                        <strong>${inventorySummary.totals.materialCount}</strong>
                        <small>${this.tr('inventory.metrics.lowStock', { count: inventorySummary.totals.lowStockCount })}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('inventory.metrics.unitsInStock')}</span>
                        <strong>${inventorySummary.totals.stockUnits}</strong>
                        <small>${this.tr('inventory.metrics.unitsInStockDescription')}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('inventory.metrics.stockCostValue')}</span>
                        <strong>${this.formatCurrency(inventorySummary.totals.stockCostValue)}</strong>
                        <small>${this.tr('inventory.metrics.stockCostValueDescription')}</small>
                    </article>
                </div>

                ${inventorySummary.items.length > 0 ? `
                <div class="welcome-pack-table-wrap">
                    <table class="welcome-pack-table">
                        <thead>
                            <tr>
                                <th>${this.tr('inventory.table.material')}</th>
                                <th>${this.tr('inventory.table.stock')}</th>
                                <th>${this.tr('inventory.table.costPerUnit')}</th>
                                <th>${this.tr('inventory.table.vat')}</th>
                                <th>${this.tr('inventory.table.actions')}</th>
                            </tr>
                        </thead>
                        <tbody id="wp-inventory-list">
                            ${inventorySummary.items.map((item) => {
            const isLowStock = (item.quantity || 0) < 5;

            return `
                                <tr>
                                    <td>
                                        <strong>${item.name}</strong>
                                        <span>${isLowStock ? this.tr('inventory.status.needsRestock') : this.tr('inventory.status.ready')}</span>
                                    </td>
                                    <td>${item.quantity || 0}</td>
                                    <td>${this.formatCurrency(item.costPrice)}</td>
                                    <td>${item.costVatRate || 22}%</td>
                                    <td>
                                        <div class="welcome-pack-action-row">
                                            <button type="button" class="welcome-pack-icon-button" onclick="welcomePackManager.editItem('${item.id}')" title="${this.tr('actions.editMaterial')}">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" onclick="welcomePackManager.deleteItem('${item.id}')" title="${this.tr('actions.deleteMaterial')}">
                                                <i class="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
        }).join('')}
                        </tbody>
                    </table>
                </div>
                ` : `
                <div class="welcome-pack-empty-state">
                    <h4>${this.tr('inventory.emptyTitle')}</h4>
                    <p>${this.tr('inventory.emptyDescription')}</p>
                </div>
                `}
            </section>
        `;

        document.getElementById('wp-add-item-btn').onclick = () => this.showAddItemModal();
    }

    async renderPresets(container) {

        const presets = await this._fetchData('presets');

        container.innerHTML = `
            <div class="bg-white rounded-xl shadow-md p-6">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-lg font-bold text-gray-800">${this.tr('presets.title')}</h3>
                    <button id="wp-add-preset-btn" class="bg-[#e94b5a] hover:bg-[#d3414f] text-white px-4 py-2 rounded-lg transition-colors shadow-sm flex items-center">
                        <i class="fas fa-plus mr-2"></i> ${this.tr('presets.create')}
                    </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${presets.map(preset => {
            // Calculate total items count and total price with VAT
            const totalItemCount = preset.items.reduce((sum, i) => sum + (i.quantity || 1), 0);
            const totalGross = preset.items.reduce((sum, i) => {
                const qty = i.quantity || 1;
                const vatRate = i.sellVatRate || 22;
                const itemGross = i.sellPrice * (1 + vatRate / 100);
                return sum + (itemGross * qty);
            }, 0);

            return `
                        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow relative group bg-gray-50">
                            <h4 class="font-bold text-gray-800 mb-2">${preset.name}</h4>
                            <p class="text-sm text-gray-600 mb-3">${this.pluralize('presets.itemCount', totalItemCount)}</p>
                            <ul class="text-sm text-gray-500 space-y-1 mb-4">
                                ${preset.items.slice(0, 4).map(i => `<li>â€¢ ${i.quantity && i.quantity > 1 ? `${i.quantity}Ã— ` : ''}${i.name}</li>`).join('')}
                                ${preset.items.length > 4 ? `<li class="text-gray-400">${this.tr('presets.moreItems', { count: preset.items.length - 4 })}</li>` : ''}
                            </ul>
                            <div class="flex justify-between items-center mt-auto border-t border-gray-200 pt-3">
                                <div>
                                    <span class="font-bold text-gray-800">${this.formatCurrency(totalGross)}</span>
                                    <span class="text-xs text-gray-500 ml-1">${this.tr('presets.inclVat')}</span>
                                </div>
                                <button class="text-red-400 hover:text-red-600 p-1" onclick="welcomePackManager.deletePreset('${preset.id}')" title="${this.tr('presets.deleteTitle')}">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
        }).join('') || `<p class="col-span-3 text-center text-gray-500 py-8">${this.tr('presets.empty')}</p>`}
                </div>
            </div>
        `;

        document.getElementById('wp-add-preset-btn').onclick = () => this.showAddPresetModal();
    }


    async deletePreset(id) {
        if (confirm(this.tr('presets.deleteConfirm'))) {
            await this.dataManager.deleteWelcomePackPreset(id);
            this._invalidateCache('presets');
            this.render();
        }
    }

    async showAddPresetModal() {
        const items = await this._fetchData('items');

        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-add-preset-modal">
                <div class="relative p-5 border w-[550px] shadow-lg rounded-xl bg-white max-h-[85vh] flex flex-col">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">${this.tr('presets.modal.title')}</h3>
                    
                    <input type="text" id="wp-preset-name" placeholder="${this.tr('presets.modal.namePlaceholder')}" class="w-full p-2 border rounded mb-4">
                    
                    <div class="bg-gray-50 p-3 rounded-lg border mb-4 flex-1 overflow-hidden flex flex-col">
                        <p class="text-sm font-bold text-gray-700 mb-2">${this.tr('presets.modal.selectItems')}</p>
                        <div class="flex-1 overflow-y-auto space-y-2 pr-1">
                            ${items.map(item => {
            const vatRate = item.sellVatRate || 22;
            const sellGross = item.sellGross || (item.sellPrice * (1 + vatRate / 100));
            return `
                                <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors wp-preset-item-row" data-item-id="${item.id}">
                                    <input type="checkbox" class="wp-preset-item-checkbox form-checkbox h-5 w-5 text-[#e94b5a] rounded focus:ring-[#e94b5a] cursor-pointer" 
                                        data-item='${JSON.stringify({ id: item.id, name: item.name, costPrice: item.costPrice, sellPrice: item.sellPrice, costVatRate: item.costVatRate || 22, sellVatRate: vatRate })}'>
                                    <div class="flex-1">
                                        <span class="font-medium text-gray-800">${item.name}</span>
                                        <span class="ml-2 px-1.5 py-0.5 text-xs rounded ${this.getVatBadgeClass(vatRate)}">${vatRate}%</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm text-gray-500">${this.formatCurrency(sellGross)}</span>
                                        <span class="text-gray-400">Ã—</span>
                                        <input type="number" class="wp-preset-item-qty w-16 p-1.5 border rounded text-center text-sm" 
                                            value="1" min="1" max="99" disabled>
                                    </div>
                                </div>
                            `;
        }).join('')}
                        </div>
                    </div>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <div class="flex justify-between items-center">
                            <span class="text-sm font-medium text-blue-800">${this.tr('presets.modal.packTotal')}</span>
                            <span id="wp-preset-total" class="text-lg font-bold text-blue-900">${this.formatCurrency(0)}</span>
                        </div>
                        <div id="wp-preset-summary" class="text-xs text-blue-700 mt-1">${this.tr('presets.modal.emptySummary')}</div>
                    </div>

                    <div class="flex justify-end gap-2">
                        <button id="wp-cancel-preset-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">${this.tr('actions.cancel')}</button>
                        <button id="wp-save-preset-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">${this.tr('presets.modal.save')}</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Enable/disable quantity input based on checkbox
        const updateTotals = () => {
            const rows = document.querySelectorAll('.wp-preset-item-row');
            let totalNet = 0;
            let totalGross = 0;
            const summaryParts = [];

            rows.forEach(row => {
                const checkbox = row.querySelector('.wp-preset-item-checkbox');
                const qtyInput = row.querySelector('.wp-preset-item-qty');

                if (checkbox.checked) {
                    const itemData = JSON.parse(checkbox.dataset.item);
                    const qty = parseInt(qtyInput.value) || 1;
                    const vatRate = itemData.sellVatRate || 22;
                    const itemGross = itemData.sellPrice * (1 + vatRate / 100);

                    totalNet += itemData.sellPrice * qty;
                    totalGross += itemGross * qty;
                    summaryParts.push(`${qty}Ã— ${itemData.name}`);
                }
            });

            document.getElementById('wp-preset-total').textContent = this.formatCurrency(totalGross);
            document.getElementById('wp-preset-summary').textContent = summaryParts.length > 0
                ? this.tr('presets.modal.summary', { items: summaryParts.join(', '), amount: this.formatCurrency(totalNet) })
                : this.tr('presets.modal.emptySummary');
        };

        document.querySelectorAll('.wp-preset-item-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function () {
                const row = this.closest('.wp-preset-item-row');
                const qtyInput = row.querySelector('.wp-preset-item-qty');
                qtyInput.disabled = !this.checked;
                if (this.checked) {
                    qtyInput.focus();
                    qtyInput.select();
                }
                updateTotals();
            });
        });

        document.querySelectorAll('.wp-preset-item-qty').forEach(input => {
            input.addEventListener('input', updateTotals);
            input.addEventListener('change', updateTotals);
        });

        document.getElementById('wp-cancel-preset-btn').onclick = () => document.getElementById('wp-add-preset-modal').remove();
        document.getElementById('wp-save-preset-btn').onclick = async () => {
            const name = document.getElementById('wp-preset-name').value;
            const rows = document.querySelectorAll('.wp-preset-item-row');

            if (!name) {
                alert(this.tr('presets.messages.nameRequired'));
                return;
            }

            const selectedItems = [];
            rows.forEach(row => {
                const checkbox = row.querySelector('.wp-preset-item-checkbox');
                const qtyInput = row.querySelector('.wp-preset-item-qty');

                if (checkbox.checked) {
                    const itemData = JSON.parse(checkbox.dataset.item);
                    selectedItems.push({
                        ...itemData,
                        quantity: parseInt(qtyInput.value) || 1
                    });
                }
            });

            if (selectedItems.length === 0) {
                alert(this.tr('presets.messages.itemsRequired'));
                return;
            }

            await this.dataManager.saveWelcomePackPreset({
                name,
                items: selectedItems,
                createdAt: new Date().toISOString()
            });

            this._invalidateCache('presets');
            document.getElementById('wp-add-preset-modal').remove();
            this.render();
        };
    }


    async renderLogForm(container) {
        const items = (await this._fetchData('items')).map((item) => normalizeWelcomePackItem(item));
        const presets = await this._fetchData('presets');
        const allLogs = (await this._fetchData('logs')).map((log) => normalizeWelcomePackLog(log));
        let properties = [];
        try {
            properties = await this._fetchData('properties');
        } catch (e) {
            console.warn('Could not fetch properties:', e);
        }

        const isEditing = !!this.editingLogId;
        const editingLog = isEditing ? normalizeWelcomePackLog(await this._getLogById(this.editingLogId)) : null;
        this.ensureLogEntries({ isEditing, editingLog });
        const propertyOptions = Array.from(
            new Map(
                properties
                    .map((property) => {
                        const label = String(property?.name || property?.id || '').trim();
                        if (!label) {
                            return null;
                        }
                        return [label.toLowerCase(), {
                            label,
                            enabled: Boolean(property?.welcomePackEnabled)
                        }];
                    })
                    .filter(Boolean)
            ).values()
        ).sort((left, right) => {
            if (left.enabled !== right.enabled) {
                return Number(right.enabled) - Number(left.enabled);
            }
            return left.label.localeCompare(right.label);
        });
        this.propertyOptions = propertyOptions;

        container.innerHTML = `
            <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] gap-6">
                <section class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading welcome-pack-panel-heading--row">
                        <div>
                            <p class="welcome-pack-section-kicker">${this.tr('workflow.propertyCharges.label')}</p>
                            <h3>${isEditing ? this.tr('log.editTitle') : this.tr('log.title')}</h3>
                            <p>${this.tr('log.description')}</p>
                        </div>
                        ${isEditing ? `
                        <button type="button" class="welcome-pack-secondary-button" onclick="welcomePackManager.cancelEdit()" title="${this.tr('actions.cancelEdit')}">
                            <i class="fas fa-rotate-left"></i>
                            <span>${this.tr('actions.cancelEdit')}</span>
                        </button>
                        ` : ''}
                    </div>

                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('log.entriesTitle')}</h3>
                        <p>${this.tr('log.entriesDescription')}</p>
                    </div>

                    <datalist id="wp-properties-list">
                        ${propertyOptions.map((property) => `<option value="${property.label}"></option>`).join('')}
                    </datalist>
                    <div id="wp-log-entries" class="mb-6"></div>

                    ${!isEditing ? `
                    <div class="welcome-pack-support-card">
                        <label class="welcome-pack-field">
                            <span>${this.tr('log.loadPreset')}</span>
                            <select id="wp-preset-select">
                                <option value="">${this.tr('log.loadPresetPlaceholder')}</option>
                                ${presets.map((preset) => `<option value='${JSON.stringify(preset.items)}'>${preset.name} (${preset.items.length} items)</option>`).join('')}
                            </select>
                        </label>
                        <p>${this.tr('log.loadPresetHelp')}</p>
                    </div>
                    ` : ''}

                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('log.materialsTitle')}</h3>
                        <p>${this.tr('log.materialsDescription')}</p>
                    </div>

                    ${items.length > 0 ? `
                    <div class="welcome-pack-catalog-list">
                        ${items.map((item) => {
            const safeName = String(item.name || '').replace(/"/g, '&quot;');
            return `
                            <article class="welcome-pack-catalog-item ${item.quantity < 5 ? 'is-low-stock' : ''}">
                                <div>
                                    <strong>${item.name}</strong>
                                    <span>${this.tr('log.materialInStock', { count: item.quantity || 0 })}</span>
                                </div>
                                <div>
                                    <span>${this.tr('log.materialCost', { amount: this.formatCurrency(item.costPrice) })}</span>
                                </div>
                                <button type="button"
                                    class="welcome-pack-secondary-button wp-item-select-btn"
                                    data-id="${item.id}"
                                    data-name="${safeName}"
                                    data-cost="${item.costPrice}"
                                    data-cost-vat="${item.costVatRate || 22}"
                                    data-sell="0"
                                    data-sell-vat="22">
                                    <i class="fas fa-plus"></i>
                                    <span>${this.tr('actions.add')}</span>
                                </button>
                            </article>
                            `;
        }).join('')}
                    </div>
                    ` : `
                    <div class="welcome-pack-empty-state">
                        <h4>${this.tr('log.noMaterialsTitle')}</h4>
                        <p>${this.tr('log.noMaterialsDescription')}</p>
                        <button type="button" id="wp-open-inventory-from-log-btn" class="welcome-pack-nav-button is-active">
                            <i class="fas fa-box-open"></i>
                            <span>${this.tr('dashboard.openMaterialCosts')}</span>
                        </button>
                    </div>
                    `}
                </section>

                <aside class="welcome-pack-panel">
                    <div class="welcome-pack-panel-heading">
                        <h3>${this.tr('log.summaryTitle')}</h3>
                        <p>${this.tr('log.summaryDescription')}</p>
                    </div>

                    <div id="wp-property-charge-history" class="welcome-pack-support-card">
                        <strong>${this.tr('log.history.noPropertyTitle')}</strong>
                        <p>${this.tr('log.history.noPropertyDescription')}</p>
                    </div>

                    <div id="wp-cart-list" class="welcome-pack-cart-list">
                        <p class="text-sm text-gray-500">${this.tr('log.noMaterialsSelected')}</p>
                    </div>

                    <div id="wp-cart-meta" class="welcome-pack-chip-row"></div>

                    <div class="welcome-pack-summary-stack">
                        <div class="welcome-pack-summary-row">
                            <span>${this.tr('log.summary.materialCost')}</span>
                            <strong id="wp-total-cost">€0.00</strong>
                        </div>
                        <div class="welcome-pack-summary-row">
                            <span>${this.tr('log.summary.vat')}</span>
                            <strong id="wp-total-vat">€0.00</strong>
                        </div>
                        <div class="welcome-pack-summary-row">
                            <span>${this.tr('log.summary.actualCharge')}</span>
                            <strong id="wp-total-sell">€0.00</strong>
                        </div>
                        <div class="welcome-pack-summary-row">
                            <span>${this.tr('log.summary.profit')}</span>
                            <strong id="wp-total-profit">€0.00</strong>
                        </div>
                    </div>

                    <button id="wp-save-log-btn" class="welcome-pack-nav-button is-active welcome-pack-nav-button--full">
                        <i class="fas ${isEditing ? 'fa-floppy-disk' : 'fa-check'}"></i>
                        <span>${isEditing ? this.tr('log.updateCharge') : this.tr('log.saveCharge')}</span>
                    </button>

                    ${isEditing ? `
                    <p class="text-xs text-amber-600">${this.tr('log.editHint')}</p>
                    ` : `
                    <p class="text-xs text-gray-500" id="wp-log-save-hint">${this.tr('log.saveHint', { count: this.logEntries.length || 1 })}</p>
                    `}
                </aside>
            </div>
        `;

        this.logFormLogs = allLogs;
        this.editingLogCreatedAt = editingLog?.createdAt || null;

        if (isEditing && editingLog) {
            this.cart = editingLog.items.map((item) => normalizeWelcomePackItem(item));
            this.editingOriginalItems = editingLog.items.map((item) => normalizeWelcomePackItem(item));
        } else {
            this.cart = [];
            this.editingOriginalItems = null;
        }

        this.renderLogEntryRows();
        this.updateCartUI();
        this.refreshPropertyChargeHistory();

        document.getElementById('wp-open-inventory-from-log-btn')?.addEventListener('click', () => {
            this.setCurrentView('inventory');
        });

        const presetSelect = document.getElementById('wp-preset-select');
        if (presetSelect) {
            presetSelect.onchange = (event) => {
                if (event.target.value) {
                    this.loadItemsIntoCart(JSON.parse(event.target.value));
                    event.target.value = '';
                }
            };
        }

        container.querySelectorAll('.wp-item-select-btn').forEach((button) => {
            button.onclick = () => {
                this.addItemToCart({
                    id: button.dataset.id,
                    name: button.dataset.name,
                    quantity: 1,
                    costPrice: Number.parseFloat(button.dataset.cost) || 0,
                    sellPrice: Number.parseFloat(button.dataset.sell) || 0,
                    costVatRate: Number.parseFloat(button.dataset.costVat) || 22,
                    sellVatRate: Number.parseFloat(button.dataset.sellVat) || 22
                });
            };
        });

        const saveButton = document.getElementById('wp-save-log-btn');
        if (saveButton) {
            saveButton.onclick = () => this.saveLog();
        }
    }

    addItemToCart(item) {
        const normalizedItem = normalizeWelcomePackItem(item);
        const existingIndex = this.cart.findIndex((entry) => entry.id && entry.id === normalizedItem.id);

        if (existingIndex >= 0) {
            this.cart[existingIndex] = normalizeWelcomePackItem({
                ...this.cart[existingIndex],
                quantity: (this.cart[existingIndex].quantity || 1) + (normalizedItem.quantity || 1)
            });
        } else {
            this.cart.push(normalizedItem);
        }

        this.updateCartUI();
    }

    loadItemsIntoCart(items = []) {
        items.forEach((item) => this.addItemToCart(item));
    }

    updateCartItemQuantity(index, quantity) {
        const nextQuantity = Number.parseInt(quantity, 10);
        if (!Number.isInteger(nextQuantity) || nextQuantity <= 0) {
            this.removeCartItem(index);
            return;
        }

        if (!this.cart[index]) {
            return;
        }

        this.cart[index] = normalizeWelcomePackItem({
            ...this.cart[index],
            quantity: nextQuantity
        });
        this.updateCartUI();
    }

    removeCartItem(index) {
        this.cart.splice(index, 1);
        this.updateCartUI();
    }

    async _getLogById(id) {
        const logs = await this._fetchData('logs');
        return logs.find((log) => log.id === id);
    }

    cancelEdit() {
        this.editingLogId = null;
        this.currentView = 'dashboard';
        this.render();
    }

    refreshPropertyChargeHistory() {
        const historyContainer = document.getElementById('wp-property-charge-history');
        const property = String(this.getActiveLogEntry()?.property || '').trim();
        if (!historyContainer) {
            return;
        }

        if (!property) {
            historyContainer.innerHTML = `
                <strong>${this.tr('log.history.noPropertyTitle')}</strong>
                <p>${this.tr('log.history.noPropertyDescription')}</p>
            `;
            return;
        }

        const propertyKey = property.toLowerCase();
        const matchingLogs = (this.logFormLogs || [])
            .filter((log) => {
                const label = String(log.propertyName || log.property || '').trim().toLowerCase();
                return label === propertyKey && log.id !== this.editingLogId;
            })
            .sort((left, right) => `${right.date || ''}`.localeCompare(`${left.date || ''}`));

        if (matchingLogs.length === 0) {
            historyContainer.innerHTML = `
                <strong>${property}</strong>
                <p>${this.tr('log.history.noPreviousCharge')}</p>
            `;
            return;
        }

        const latest = matchingLogs[0];
        historyContainer.innerHTML = `
            <strong>${property}</strong>
            <p>${this.tr('log.history.lastCharge', {
                amount: this.formatCurrency(latest.chargedAmount),
                date: this.formatDisplayDate(latest.date)
            })}</p>
            <p>${this.tr('log.history.costProfit', {
                cost: this.formatCurrency(latest.totalCost),
                profit: this.formatCurrency(latest.profit)
            })}</p>
        `;
    }

    updateCartUI() {
        const list = document.getElementById('wp-cart-list');
        const summary = this.getLogEntrySummary(this.getActiveLogEntry());

        if (list) {
            if (summary.items.length === 0) {
                list.innerHTML = `<p class="text-sm text-gray-500">${this.tr('log.noMaterialsSelected')}</p>`;
            } else {
                list.innerHTML = summary.items.map((item, index) => `
                    <article class="welcome-pack-cart-item">
                        <div>
                            <strong>${item.name}</strong>
                            <span>${this.tr('log.cart.costCharge', {
                                cost: this.formatCurrency(item.costPrice),
                                charge: this.formatCurrency(item.sellPrice)
                            })}</span>
                        </div>
                        <div class="welcome-pack-cart-controls">
                            <label>
                                <span>${this.tr('log.cart.qty')}</span>
                                <input type="number" min="1" step="1" value="${item.quantity || 1}" onchange="welcomePackManager.updateCartItemQuantity(${index}, this.value)" title="${this.tr('log.cart.qty')}">
                            </label>
                            <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" onclick="welcomePackManager.removeCartItem(${index})" title="${this.tr('actions.removeMaterial')}">
                                <i class="fas fa-xmark"></i>
                            </button>
                        </div>
                    </article>
                `).join('');
            }
        }

        const cartMeta = document.getElementById('wp-cart-meta');
        if (cartMeta) {
            cartMeta.innerHTML = `
                <span class="welcome-pack-chip">${this.tr('log.cart.materialLines', { count: summary.totals.totalLines })}</span>
                <span class="welcome-pack-chip">${this.tr('log.cart.units', { count: summary.totals.totalUnits })}</span>
            `;
        }

        const totalCost = document.getElementById('wp-total-cost');
        const totalVat = document.getElementById('wp-total-vat');
        const totalSell = document.getElementById('wp-total-sell');
        const totalProfit = document.getElementById('wp-total-profit');
        if (totalCost) totalCost.textContent = this.formatCurrency(summary.totals.totalCost);
        if (totalVat) totalVat.textContent = this.formatCurrency(summary.totals.vatAmount);
        if (totalSell) totalSell.textContent = this.formatCurrency(summary.totals.chargedAmountGross);
        if (totalProfit) totalProfit.textContent = this.formatCurrency(summary.totals.profit);
        const saveHint = document.getElementById('wp-log-save-hint');
        if (saveHint) {
            saveHint.textContent = this.tr('log.saveHint', { count: this.logEntries.length || 1 });
        }
        this.refreshLogEntryCards();
        this.refreshPropertyChargeHistory();
    }

    async saveLog() {
        const preparedEntries = this.logEntries.map((entry) => ({
            ...entry,
            property: String(entry.property || '').trim(),
            date: String(entry.date || '').trim() || new Date().toISOString().split('T')[0]
        }));

        if (preparedEntries.some((entry) => !entry.property)) {
            alert(this.tr('messages.selectProperty'));
            return;
        }
        if (this.cart.length === 0) {
            alert(this.tr('messages.selectMaterial'));
            return;
        }

        try {
            if (this.editingLogId) {
                const editingEntry = preparedEntries[0];
                const summary = this.getLogEntrySummary(editingEntry);
                const logData = {
                    property: editingEntry.property,
                    date: editingEntry.date,
                    items: summary.items,
                    totalCost: summary.totals.totalCost,
                    suggestedSell: summary.totals.suggestedChargeNet,
                    suggestedSellGross: summary.totals.suggestedChargeGross,
                    chargedAmount: summary.totals.chargedAmountGross,
                    chargedAmountNet: summary.totals.chargedAmountNet,
                    chargedAmountGross: summary.totals.chargedAmountGross,
                    vatAmount: summary.totals.vatAmount,
                    totalSell: summary.totals.chargedAmountGross,
                    profit: summary.totals.profit,
                    manualCharge: editingEntry.manualCharge,
                    chargeEntryMode: editingEntry.manualCharge ? 'manual' : 'none',
                    createdAt: this.editingLogCreatedAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                await this.dataManager.updateWelcomePackLog(this.editingLogId, this.editingOriginalItems, logData);
                alert(this.tr('messages.chargeUpdated'));
                this.editingLogId = null;
                this.editingOriginalItems = null;
                this.editingLogCreatedAt = null;
            } else {
                const timestamp = new Date().toISOString();
                const logsToSave = preparedEntries.map((entry) => {
                    const summary = this.getLogEntrySummary(entry);
                    return {
                        property: entry.property,
                        date: entry.date,
                        items: summary.items,
                        totalCost: summary.totals.totalCost,
                        suggestedSell: summary.totals.suggestedChargeNet,
                        suggestedSellGross: summary.totals.suggestedChargeGross,
                        chargedAmount: summary.totals.chargedAmountGross,
                        chargedAmountNet: summary.totals.chargedAmountNet,
                        chargedAmountGross: summary.totals.chargedAmountGross,
                        vatAmount: summary.totals.vatAmount,
                        totalSell: summary.totals.chargedAmountGross,
                        profit: summary.totals.profit,
                        manualCharge: entry.manualCharge,
                        chargeEntryMode: entry.manualCharge ? 'manual' : 'none',
                        createdAt: timestamp,
                        updatedAt: timestamp
                    };
                });

                if (logsToSave.length > 1 && typeof this.dataManager.logWelcomePackBatch === 'function') {
                    await this.dataManager.logWelcomePackBatch(logsToSave);
                } else {
                    for (const logData of logsToSave) {
                        await this.dataManager.logWelcomePack(logData);
                    }
                }
                alert(this.tr('messages.chargeSaved'));
                this.logEntries = [this.createLogEntry()];
                this.activeLogEntryId = this.logEntries[0].id;
            }
            this._invalidateCache(['logs', 'items']);
            this.currentView = 'dashboard';
            this.render();
        } catch (error) {
            console.error('Error saving pack:', error);
            alert(this.tr('messages.saveFailed'));
        }
    }

    async deleteLog(id) {
        if (confirm(this.tr('messages.confirmDeleteCharge'))) {
            const logs = await this._fetchData('logs');
            const log = logs.find(l => l.id === id);
            if (log) {
                await this.dataManager.deleteWelcomePackLog(id, log.items);
                this._invalidateCache(['logs', 'items']);
                this.render();
            }
        }
    }

    async editLog(id) {
        this.editingLogId = id;
        this.setCurrentView('log');
    }

    // Helper function to calculate VAT
    calculateVAT(netPrice, vatRate) {
        const net = parseFloat(netPrice) || 0;
        const rate = parseFloat(vatRate) || 22;
        const vatAmount = net * (rate / 100);
        const grossPrice = net + vatAmount;
        return { net, vatAmount, grossPrice, rate };
    }

    // Helper to get VAT rate badge color
    getVatBadgeClass(vatRate) {
        const rate = parseInt(vatRate) || 22;
        if (rate === 4) return 'bg-green-100 text-green-700';
        if (rate === 12) return 'bg-yellow-100 text-yellow-700';
        return 'bg-blue-100 text-blue-700'; // 22%
    }

    showAddItemModal() {
        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-add-item-modal">
                <div class="relative p-5 border w-[420px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">${this.tr('modals.addMaterial.title')}</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-new-item-name" placeholder="${this.tr('modals.addMaterial.namePlaceholder')}" class="w-full p-2 border rounded">
                        <input type="number" id="wp-new-item-stock" placeholder="${this.tr('modals.addMaterial.stockPlaceholder')}" class="w-full p-2 border rounded" min="0">
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">${this.tr('modals.addMaterial.costLabel')}</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-new-item-cost" placeholder="Net Price (\u20AC)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-new-item-cost-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4">4% (Reduced)</option>
                                    <option value="12">12% (Intermediate)</option>
                                    <option value="22" selected>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-cost-vat-preview" class="mt-2 text-sm text-gray-600 hidden">
                                <!-- VAT preview will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="flex justify-end gap-2 mt-4">
                            <button id="wp-cancel-add-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">${this.tr('actions.cancel')}</button>
                            <button id="wp-confirm-add-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">${this.tr('modals.addMaterial.confirm')}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // VAT calculation preview function
        const updateVatPreview = (inputId, vatSelectId, previewId) => {
            const netPrice = parseFloat(document.getElementById(inputId).value) || 0;
            const vatRate = parseInt(document.getElementById(vatSelectId).value) || 22;
            const preview = document.getElementById(previewId);

            if (netPrice > 0) {
                const { vatAmount, grossPrice } = this.calculateVAT(netPrice, vatRate);
                preview.innerHTML = this.tr('modals.vatPreview', {
                    net: `<span class="text-gray-500">${this.formatCurrency(netPrice)}</span>`,
                    vat: `<span class="text-orange-600">${this.formatCurrency(vatAmount)} ${this.tr('inventory.table.vat')}</span>`,
                    gross: `<span class="font-bold text-gray-800">${this.formatCurrency(grossPrice)}</span>`
                });
                preview.classList.remove('hidden');
            } else {
                preview.classList.add('hidden');
            }
        };

        // Attach VAT preview listeners
        ['wp-new-item-cost', 'wp-new-item-cost-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-new-item-cost', 'wp-new-item-cost-vat', 'wp-cost-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-new-item-cost', 'wp-new-item-cost-vat', 'wp-cost-vat-preview'));
        });

        document.getElementById('wp-cancel-add-btn').onclick = () => document.getElementById('wp-add-item-modal').remove();
        document.getElementById('wp-confirm-add-btn').onclick = async () => {
            const name = document.getElementById('wp-new-item-name').value;
            const stock = parseInt(document.getElementById('wp-new-item-stock').value) || 0;
            const costPrice = parseFloat(document.getElementById('wp-new-item-cost').value);
            const costVatRate = parseInt(document.getElementById('wp-new-item-cost-vat').value) || 22;
            const sellPrice = 0;
            const sellVatRate = 22;

            if (name && !isNaN(costPrice)) {
                const costCalc = this.calculateVAT(costPrice, costVatRate);
                const sellCalc = this.calculateVAT(sellPrice, sellVatRate);

                await this.dataManager.saveWelcomePackItem({
                    name,
                    quantity: stock,
                    costPrice: costPrice,           // Net cost
                    costVatRate: costVatRate,       // VAT rate for cost
                    costGross: costCalc.grossPrice, // Gross cost (calculated)
                    sellPrice: sellPrice,           // Net sell
                    sellVatRate: sellVatRate,       // VAT rate for sell
                    sellGross: sellCalc.grossPrice  // Gross sell (calculated)
                });
                this._invalidateCache('items');
                document.getElementById('wp-add-item-modal').remove();
                this.render(); // Refresh list
            } else {
                alert(this.tr('messages.fillAllMaterialFields'));
            }
        };
    }

    async editItem(id) {
        const items = await this._fetchData('items');
        const item = items.find(i => i.id === id);
        if (item) {
            this.showEditItemModal(item);
        }
    }

    showEditItemModal(item) {
        // Get current VAT rates or default to 22%
        const currentCostVat = item.costVatRate || 22;
        const currentSellVat = item.sellVatRate || 22;

        const modalHtml = `
            <div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center" id="wp-edit-item-modal">
                <div class="relative p-5 border w-[420px] shadow-lg rounded-xl bg-white">
                    <h3 class="text-lg font-bold text-gray-900 mb-4">${this.tr('modals.editMaterial.title')}</h3>
                    <div class="space-y-4">
                        <input type="text" id="wp-edit-item-name" value="${item.name}" placeholder="${this.tr('modals.editMaterial.namePlaceholder')}" class="w-full p-2 border rounded">
                        <input type="number" id="wp-edit-item-stock" value="${item.quantity || 0}" placeholder="${this.tr('modals.editMaterial.stockPlaceholder')}" class="w-full p-2 border rounded" min="0">
                        
                        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <p class="text-xs font-semibold text-gray-600 mb-2 uppercase">${this.tr('modals.editMaterial.costLabel')}</p>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="number" id="wp-edit-item-cost" value="${item.costPrice}" placeholder="Net Price (\u20AC)" step="0.01" min="0" class="w-full p-2 border rounded">
                                <select id="wp-edit-item-cost-vat" class="w-full p-2 border rounded bg-white">
                                    <option value="4" ${currentCostVat === 4 ? 'selected' : ''}>4% (Reduced)</option>
                                    <option value="12" ${currentCostVat === 12 ? 'selected' : ''}>12% (Intermediate)</option>
                                    <option value="22" ${currentCostVat === 22 ? 'selected' : ''}>22% (Standard)</option>
                                </select>
                            </div>
                            <div id="wp-edit-cost-vat-preview" class="mt-2 text-sm text-gray-600">
                                <!-- VAT preview will be inserted here -->
                            </div>
                        </div>
                        
                        <div class="flex justify-end gap-2 mt-4">
                            <button id="wp-cancel-edit-btn" class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">${this.tr('actions.cancel')}</button>
                            <button id="wp-confirm-edit-btn" class="px-4 py-2 bg-[#e94b5a] text-white rounded hover:bg-[#d3414f]">${this.tr('modals.editMaterial.confirm')}</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // VAT calculation preview function
        const updateVatPreview = (inputId, vatSelectId, previewId) => {
            const netPrice = parseFloat(document.getElementById(inputId).value) || 0;
            const vatRate = parseInt(document.getElementById(vatSelectId).value) || 22;
            const preview = document.getElementById(previewId);

            if (netPrice > 0) {
                const { vatAmount, grossPrice } = this.calculateVAT(netPrice, vatRate);
                preview.innerHTML = this.tr('modals.vatPreview', {
                    net: `<span class="text-gray-500">${this.formatCurrency(netPrice)}</span>`,
                    vat: `<span class="text-orange-600">${this.formatCurrency(vatAmount)} ${this.tr('inventory.table.vat')}</span>`,
                    gross: `<span class="font-bold text-gray-800">${this.formatCurrency(grossPrice)}</span>`
                });
            } else {
                preview.innerHTML = '';
            }
        };

        // Attach VAT preview listeners
        ['wp-edit-item-cost', 'wp-edit-item-cost-vat'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview'));
            document.getElementById(id).addEventListener('change', () => updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview'));
        });

        // Initial preview update
        updateVatPreview('wp-edit-item-cost', 'wp-edit-item-cost-vat', 'wp-edit-cost-vat-preview');

        document.getElementById('wp-cancel-edit-btn').onclick = () => document.getElementById('wp-edit-item-modal').remove();
        document.getElementById('wp-confirm-edit-btn').onclick = async () => {
            const name = document.getElementById('wp-edit-item-name').value;
            const stock = document.getElementById('wp-edit-item-stock').value;
            const costPrice = parseFloat(document.getElementById('wp-edit-item-cost').value);
            const costVatRate = parseInt(document.getElementById('wp-edit-item-cost-vat').value) || 22;
            const sellPrice = Number.isFinite(item.sellPrice) ? item.sellPrice : 0;
            const sellVatRate = Number.isFinite(item.sellVatRate) ? item.sellVatRate : 22;

            if (name && !isNaN(costPrice)) {
                const costCalc = this.calculateVAT(costPrice, costVatRate);
                const sellCalc = this.calculateVAT(sellPrice, sellVatRate);

                await this.dataManager.updateWelcomePackItem(item.id, {
                    name,
                    quantity: parseInt(stock) || 0,
                    costPrice: costPrice,
                    costVatRate: costVatRate,
                    costGross: costCalc.grossPrice,
                    sellPrice: sellPrice,
                    sellVatRate: sellVatRate,
                    sellGross: sellCalc.grossPrice
                });
                this._invalidateCache('items');
                document.getElementById('wp-edit-item-modal').remove();
                this.renderCurrentView(); // Refresh list
            } else {
                alert(this.tr('messages.fillAllMaterialFields'));
            }
        };

    }

    async deleteItem(id) {
        if (confirm(this.tr('messages.confirmDeleteMaterial'))) {
            await this.dataManager.deleteWelcomePackItem(id);
            this._invalidateCache('items');
            this.render();
        }
    }

}

