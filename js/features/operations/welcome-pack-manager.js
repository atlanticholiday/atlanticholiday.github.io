import {
    formatWelcomePackCurrency,
    normalizeWelcomePackItem,
    normalizeWelcomePackLog,
    summarizeWelcomePackCart,
    summarizeWelcomePackInventory,
    summarizeWelcomePackLogs
} from './welcome-pack-utils.js';
import {
    calculatePurchaseLine,
    createPurchaseLine,
    matchPurchaseLinesToMaterials,
    parseWelcomePackInvoiceText,
    summarizePurchase
} from './welcome-pack-purchase-utils.js';
import { extractInvoiceFile, fingerprintInvoiceFile } from './welcome-pack-invoice-import.js';
import { i18n, t } from '../../core/i18n.js';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

const PT_WELCOME_PACK_TRANSLATIONS = {
    header: {
        title: 'Welcome Packs',
        subtitle: 'Compras, stock, packs e resultados num só fluxo'
    },
    hero: {
        kicker: 'Welcome Packs',
        title: '',
        body: 'Prepare o stock uma vez e, no dia a dia, registe os packs entregues e confirme os resultados.'
    },
    overview: {
        navLabel: 'Visão geral',
        navDescription: 'Perceba o que fazer agora e onde fica cada tarefa.',
        eyebrow: 'Ponto de partida',
        title: 'O seu fluxo de Welcome Packs',
        description: 'Use a preparação quando comprar ou configurar materiais. No trabalho diário, registe os packs entregues e termine nos resultados.',
        dailyLabel: 'Trabalho diário',
        dailyTitle: 'Para cada check-in',
        dailyDescription: 'Dois passos simples para registar e confirmar cada welcome pack.',
        setupLabel: 'Preparação',
        setupTitle: 'Quando compra ou altera um pack',
        setupDescription: 'Mantenha compras, stock e modelos atualizados para que os cálculos diários sejam automáticos.',
        statusLabel: 'Resumo atual',
        emptyHint: 'Ainda não há dados. Comece por registar uma compra ou adicionar materiais ao stock.',
        open: 'Abrir'
    },
    navigation: {
        daily: 'Operação diária',
        setup: 'Preparação e stock',
        help: 'Ajuda',
        guide: 'Como funciona',
        guideHint: 'Ver o percurso completo'
    },
    workflow: {
        materialCosts: {
            label: 'Materiais e stock',
            step: 'Passo 1',
            description: 'Adicione todos os materiais que compra e preencha stock, custo e referência de cobrança.'
        },
        propertyCharges: {
            label: 'Registar packs',
            step: 'Passo 2',
            description: 'Escolha a propriedade, adicione os materiais usados nesse pack e confirme o valor líquido realmente cobrado.'
        },
        calculations: {
            label: 'Resultados',
            step: 'Passo 3',
            description: 'Abra a vista de cálculos para confirmar automaticamente totais, IVA, lucro e desempenho por propriedade.'
        }
    },
    support: {
        label: 'Ferramentas de apoio',
        reservations: 'Próximas reservas',
        reservationsDescription: 'Veja os check-ins que precisam de welcome pack.',
        presets: 'Modelos de pack',
        presetsDescription: 'Guarde combinações de materiais que usa com frequência.'
    },
    help: {
        eyebrow: 'Guia rápido',
        title: 'Como funcionam os Welcome Packs',
        subtitle: 'Do registo ao resultado, sem saltar nenhum passo.',
        close: 'Fechar guia',
        intro: 'Há dois ritmos diferentes: a preparação do stock, feita quando compra materiais, e o trabalho diário de cada check-in.',
        startLabel: 'Percurso recomendado',
        nav: {
            workflow: 'Fluxo Normal',
            stats: 'Como Ler os Cálculos',
            inventory: 'Stock e Presets'
        },
        walkthrough: {
            purchases: { title: '1. Importar a fatura completa', body: 'Use a mesma importação para fruta, bebidas e todos os restantes materiais da fatura.' },
            inventory: { title: '2. Confirmar materiais e stock', body: 'Reveja quantidades, custo unitário e materiais com stock baixo.' },
            presets: { title: '3. Preparar modelos de pack', body: 'Crie um modelo para carregar rapidamente os materiais usados com frequência.' },
            log: { title: '4. Registar o pack entregue', body: 'Escolha a propriedade, indique os materiais usados e confirme o valor cobrado.' },
            dashboard: { title: '5. Confirmar os resultados', body: 'Consulte custos, valor cobrado, lucro e margem por propriedade.' }
        },
        openSection: 'Abrir esta área',
        sections: {
            workflow: {
                title: 'Fluxo Diário',
                steps: {
                    logPack: {
                        title: 'Registar um Pack',
                        body: 'Abra <strong>Registar packs</strong>, selecione a propriedade e a data, depois adicione os materiais usados ou carregue um preset como ponto de partida.'
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
        done: 'Fechar e começar'
    },
    reservations: {
        tabs: {
            upcoming: 'Reservas Futuras',
            settings: 'Definições das Propriedades'
        },
        upcoming: {
            title: 'Reservas Futuras',
            summary: '{{enabled}} de {{total}} propriedades têm Welcome Pack ativo',
            lastUpdated: 'Última atualização: {{time}}',
            syncNow: 'Sincronizar Agora',
            syncing: 'A sincronizar...',
            fetching: 'A procurar reservas...',
            syncErrorTitle: 'Erro ao sincronizar calendários',
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
        inclVat: '(líquido)',
        deleteTitle: 'Eliminar preset',
        empty: 'Ainda não existem presets.',
        deleteConfirm: 'Eliminar este preset?',
        modal: {
            title: 'Criar Novo Preset de Pack',
            namePlaceholder: 'Nome do Preset (ex.: Welcome Pack Gold)',
            selectItems: 'Selecionar Itens e Quantidades:',
            packTotal: 'Total do Pack:',
            emptySummary: 'Selecione itens para ver a composição do pack',
            summary: '{{items}} (Total líquido: {{amount}})',
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
            notConnected: 'Não ligado',
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
                airbnb: 'Airbnb: Calendário -> Definições de disponibilidade -> Exportar calendário',
                booking: 'Booking.com: Propriedade -> Calendário -> Sincronizar calendários',
                vrbo: 'VRBO: Calendário -> Importar/Exportar -> Exportar'
            },
            test: 'Testar URL',
            testing: 'A testar...',
            save: 'Guardar'
        },
        messages: {
            removeConfirm: 'Remover a ligação iCal de \"{{property}}\"?\n\nIsto vai parar a sincronização de reservas desta propriedade.',
            removeError: 'Erro ao remover a ligação iCal. Tente novamente.',
            enterUrl: 'Introduza primeiro uma URL',
            valid: 'A URL é válida. Os dados do calendário foram recebidos com sucesso.',
            invalid: 'A URL devolveu dados, mas não parece ter um formato iCal válido.',
            fetchFailed: 'Não foi possível obter a URL. Verifique se está correta e acessível.',
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
            reorderPointPlaceholder: 'Ponto de reposição',
            costLabel: 'Custo do Material (Líquido, sem IVA)',
            chargeLabel: 'Referência de Cobrança (Líquido, sem IVA)',
            confirm: 'Adicionar Material'
        },
        editMaterial: {
            title: 'Editar Material',
            namePlaceholder: 'Nome do Material',
            stockPlaceholder: 'Quantidade em Stock',
            reorderPointPlaceholder: 'Ponto de reposição',
            costLabel: 'Custo do Material (Líquido, sem IVA)',
            chargeLabel: 'Referência de Cobrança (Líquido, sem IVA)',
            confirm: 'Guardar Alterações'
        }
    },
    actions: {
        apply: 'Aplicar',
        exportCsv: 'Exportar CSV',
        editEntry: 'Editar registo',
        deleteEntry: 'Eliminar registo',
        cancelEdit: 'Cancelar edição',
        editMaterial: 'Editar material',
        deleteMaterial: 'Eliminar material',
        removeMaterial: 'Remover material',
        cancel: 'Cancelar',
        add: 'Adicionar'
    },
    dashboard: {
        lowStockTitle: 'O stock baixo precisa de atenção',
        lowStockBody: '{{count}} material(is) está(ão) quase a terminar: {{items}}.',
        openMaterialCosts: 'Abrir Custos dos Materiais',
        title: 'Lucro por período',
        description: 'Use o filtro de datas para ver quanto custaram os packs, quanto foi cobrado e quais propriedades tiveram melhor desempenho.',
        from: 'De',
        to: 'Até',
        metrics: {
            loggedCharges: 'Cobranças registadas',
            unitsUsed: '{{count}} unidades de material usadas',
            materialCost: 'Custo dos materiais',
            averagePerPack: 'Média de {{amount}} por pack',
            netCharged: 'Valor cobrado',
            vatCollected: 'IVA',
            amountCharged: 'Valor cobrado',
            netProfit: 'Lucro líquido',
            marginInPeriod: '{{margin}}% de margem neste período'
        },
        insights: {
            topProperty: 'Melhor propriedade por valor cobrado',
            topPropertyBody: '{{amount}} cobrados | {{profit}} lucro líquido',
            bestMargin: 'Melhor margem',
            bestMarginBody: '{{margin}}% de margem em {{packs}} pack(s)',
            bestDay: 'Dia com maior valor cobrado',
            bestDayBody: '{{amount}} cobrados em {{packs}} pack(s)',
            noData: 'Ainda sem dados'
        },
        chips: {
            currentStockValue: 'Valor atual do stock: {{amount}}',
            materialsInStock: 'Materiais em stock: {{count}}',
            lowStockMaterials: 'Materiais com stock baixo: {{count}}'
        },
        propertyPerformanceTitle: 'Desempenho por propriedade',
        propertyPerformanceDescription: 'Cada linha compara custo, valor cobrado e lucro líquido por propriedade.',
        trends: {
            title: 'Tendência recente de faturação',
            description: 'Veja os últimos sete dias ativos para perceber quando o valor cobrado e o lucro foram mais fortes.',
            packsCount: '{{count}} pack(s)',
            netProfit: 'Lucro líquido {{amount}}'
        },
        materials: {
            title: 'Materiais mais usados',
            description: 'Estes são os itens que mais consomem stock no período selecionado.',
            unitsUsed: '{{count}} unidades usadas',
            costUsed: 'Custo líquido {{amount}}',
            emptyTitle: 'Ainda não há consumo de materiais',
            emptyDescription: 'Assim que registar cobranças, os materiais mais usados aparecem aqui.'
        },
        table: {
            property: 'Propriedade',
            packs: 'Packs',
            netCharged: 'Cobrado',
            vat: 'IVA',
            cost: 'Custo',
            charged: 'Cobrado',
            profit: 'Lucro líquido',
            margin: 'Margem',
            lastCharge: 'Última cobrança',
            units: '{{count}} unidades'
        },
        emptyTitle: 'Não existem cobranças de welcome pack neste período',
        emptyDescription: 'Abra Cobranças por Propriedade para registar o primeiro pack e os cálculos aparecerão aqui automaticamente.',
        openPropertyCharges: 'Abrir Cobranças por Propriedade',
        recentChargesTitle: 'Cobranças recentes',
        recentChargesDescription: 'Veja o que foi cobrado em cada propriedade e ajuste registos antigos se algum valor estiver errado.',
        recentCostProfit: 'Custo {{cost}} | Lucro líquido {{profit}}',
        noChargesTitle: 'Ainda não existem cobranças registadas',
        noChargesDescription: 'Depois de adicionar uma cobrança em Cobranças por Propriedade, os últimos registos aparecerão aqui.',
        unknownProperty: 'Propriedade desconhecida'
    },
    inventory: {
        lowStockTitle: 'Alguns materiais precisam de reposição',
        lowStockBody: '{{items}}',
        title: 'Catálogo de materiais',
        description: 'Mantenha uma linha por material com o stock atual, o custo líquido para a Atlantic Holiday e a referência de cobrança usada num welcome pack.',
        addMaterial: 'Adicionar Material',
        metrics: {
            tracked: 'Materiais registados',
            lowStock: '{{count}} materiais com stock baixo',
            unitsInStock: 'Unidades em stock',
            unitsInStockDescription: 'Quantidade atual em todo o catálogo',
            stockCostValue: 'Valor do stock a custo',
            stockCostValueDescription: 'Baseado no custo líquido do material',
            projectedBilledValue: 'Valor de referência',
            potentialMargin: 'Referência atual {{amount}}'
        },
        table: {
            material: 'Material',
            stock: 'Stock',
            costPerUnit: 'Custo / unidade',
            chargePerUnit: 'Referência / unidade',
            vat: 'IVA',
            actions: 'Ações'
        },
        status: {
            needsRestock: 'Precisa de reposição em breve',
            ready: 'Pronto para usar nos packs'
        },
        emptyTitle: 'Ainda não existem materiais guardados',
        emptyDescription: 'Adicione o primeiro material para que Cobranças por Propriedade e Cálculos possam funcionar.'
    },
    log: {
        title: 'Registar uma cobrança por propriedade',
        editTitle: 'Editar cobrança por propriedade',
        description: 'Selecione a propriedade, escolha os materiais usados no pack e confirme o valor líquido realmente cobrado.',
        packSelectionTitle: '1. Tipo de Pack',
        packSelectionDesc: 'Escolha um modelo standard ou crie um pack personalizado.',
        destinationTitle: '2. Propriedade e Cobrança',
        destinationDesc: 'Indique a propriedade de destino, data e valor cobrado.',
        packContentsTitle: '3. Conteúdo do Pack',
        packContentsDesc: 'Materiais e quantidades incluídos neste pack.',
        customPack: 'Pack Personalizado',
        customPackDesc: 'Escolher materiais livres',
        addExtraMaterials: 'Adicionar Materiais',
        searchMaterials: 'Procurar materiais em stock...',
        noMaterialsInPack: 'Ainda não foram adicionados materiais a este pack.',
        allMaterials: 'Todos os Materiais',
        noPropertySelectedYet: 'Nenhuma propriedade selecionada',
        receiptSummary: 'Resumo',
        marginBadge: '{{margin}}% margem',
        entriesTitle: 'Registos de cobrança',
        entriesDescription: 'Adicione uma ou mais linhas com propriedade e data. Todas usam os mesmos materiais selecionados, mas cada linha pode ter a sua propriedade, data e valor cobrado.',
        entryLabel: 'Registo {{count}}',
        entrySummary: 'Custo dos materiais {{cost}} e lucro {{profit}}.',
        addEntry: 'Adicionar outro registo',
        removeEntry: 'Remover registo',
        fields: {
            property: 'Propriedade',
            propertyPlaceholder: 'Selecionar propriedade...',
            date: 'Data',
            quantity: 'Quantidade',
            chargedAmount: 'Valor líquido cobrado'
        },
        loadPreset: 'Carregar preset',
        loadPresetPlaceholder: 'Selecione um preset para carregar materiais...',
        loadPresetHelp: 'Os presets ajudam a lançar o pack normal antes de ajustar os materiais realmente usados.',
        materialsTitle: 'Materiais neste pack',
        materialsDescription: 'Adicione os materiais que foram realmente usados para esta propriedade. Cliques repetidos aumentam a quantidade.',
        materialInStock: '{{count}} em stock',
        materialCost: 'Custo {{amount}}',
        materialCharge: 'Referência {{amount}}',
        noMaterialsTitle: 'Ainda não existem materiais disponíveis',
        noMaterialsDescription: 'Abra primeiro Custos dos Materiais e adicione os materiais que podem ser usados num welcome pack.',
        summaryTitle: 'Resumo da cobrança',
        summaryDescription: 'O valor cobrado pode seguir o valor sugerido ou ser alterado manualmente se a propriedade tiver sido faturada de forma diferente.',
        history: {
            noPropertyTitle: 'Ainda não foi selecionada nenhuma propriedade',
            noPropertyDescription: 'Selecione uma propriedade para ver a última cobrança de welcome pack registada.',
            noPreviousCharge: 'Não foi encontrada nenhuma cobrança anterior de welcome pack para esta propriedade.',
            lastCharge: 'Última cobrança: {{amount}} em {{date}}.',
            costProfit: 'Custo dos materiais {{cost}} e lucro {{profit}}.'
        },
        noMaterialsSelected: 'Nenhum material selecionado',
        useSuggestedAmount: 'Usar valor sugerido',
        summary: {
            materialCost: 'Custo dos materiais',
            suggestedCharge: 'Valor sugerido',
            vat: 'IVA (22%)',
            actualCharge: 'Valor cobrado',
            profit: 'Lucro líquido'
        },
        updateCharge: 'Atualizar cobrança',
        saveCharge: 'Guardar cobrança',
        editHint: 'Ao atualizar uma cobrança existente, o stock antigo será reposto e as novas quantidades serão novamente descontadas.',
        saveHint: 'A área de cálculos será atualizada automaticamente depois de guardar {{count}} cobrança(s).',
        cart: {
            costCharge: '{{cost}} custo | {{charge}} referência',
            qty: 'Qtd',
            materialLines: '{{count}} linha(s) de material',
            units: '{{count}} unidade(s)',
            entries: '{{count}} cobrança(s)'
        }
    },
    states: {
        loading: 'A carregar Welcome Packs...',
        permissionDenied: 'O Welcome Packs não está disponível para esta conta. Verifique o nível de acesso e tente novamente.',
        permissionDeniedPrivileged: 'O acesso de administrador foi reconhecido, mas as permissões do servidor para esta funcionalidade ainda não estão ativas. Implemente as regras mais recentes do Firebase e tente novamente.',
        unauthenticated: 'Inicie sessão novamente para carregar o Welcome Packs.',
        unavailable: 'Não foi possível carregar o Welcome Packs agora. Tente novamente.',
        unavailableTitle: 'Welcome Packs indisponível'
    },
    messages: {
        selectProperty: 'Selecione uma propriedade',
        selectMaterial: 'Selecione pelo menos um material',
        chargeUpdated: 'Cobrança de welcome pack atualizada com sucesso.',
        chargeSaved: 'Cobrança de welcome pack guardada com sucesso.',
        saveFailed: 'Não foi possível guardar o pack. Tente novamente.',
        confirmDeleteCharge: 'Tem a certeza de que pretende eliminar esta cobrança? O stock será reposto.',
        fillAllMaterialFields: 'Preencha todos os campos corretamente.',
        confirmDeleteMaterial: 'Tem a certeza de que pretende eliminar este material?',
        noDataToExport: 'Não existem dados para exportar'
    },
    export: {
        date: 'Data',
        property: 'Propriedade',
        materials: 'Materiais',
        units: 'Unidades',
        materialCost: 'Custo dos Materiais',
        suggestedChargeNet: 'Cobrança Sugerida',
        suggestedCharge: 'Cobrança Sugerida',
        vat: 'IVA',
        chargedAmount: 'Valor Cobrado',
        profit: 'Lucro'
    }
};

export class WelcomePackManager {
    constructor(dataManager, { getUpcomingReservations = null, uploadInvoice = null } = {}) {
        this.dataManager = dataManager;
        this.getUpcomingReservations = getUpcomingReservations;
        this.uploadInvoice = uploadInvoice;
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        this.currentView = 'overview'; // overview, purchases, inventory, log, dashboard, reservations, presets
        this.cart = [];
        this.dashboardFilters = {
            startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0], // Last 30 days default
            endDate: new Date().toISOString().split('T')[0]
        };
        this.editingLogId = null;
        this.logEntries = [];
        this.activeLogEntryId = null;
        this.logEntrySequence = 0;
        this.purchaseDraft = null;
        this.purchaseFile = null;
        this.purchaseImportStatus = null;
        this.purchaseLineSequence = 0;
        this.cache = {
            logs: null,
            items: null,
            presets: null,
            properties: null,
            purchases: null
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
            case 'purchases':
                this.cache.purchases = this.dataManager.getWelcomePackPurchases
                    ? await this.dataManager.getWelcomePackPurchases()
                    : [];
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
                id: 'overview',
                label: this.tr('overview.navLabel'),
                eyebrow: this.tr('overview.eyebrow'),
                description: this.tr('overview.navDescription'),
                icon: 'fa-compass'
            },
            {
                id: 'log',
                label: this.tr('workflow.propertyCharges.label'),
                eyebrow: this.tr('navigation.daily'),
                description: this.tr('workflow.propertyCharges.description'),
                icon: 'fa-home'
            },
            {
                id: 'dashboard',
                label: this.tr('workflow.calculations.label'),
                eyebrow: this.tr('navigation.daily'),
                description: this.tr('workflow.calculations.description'),
                icon: 'fa-chart-line'
            }
        ];
    }

    getSupportViews() {
        return [
            {
                id: 'purchases',
                label: this.tr('purchases.navLabel'),
                eyebrow: this.tr('purchases.navEyebrow'),
                description: this.tr('purchases.navDescription'),
                icon: 'fa-receipt'
            },
            {
                id: 'inventory',
                label: this.tr('workflow.materialCosts.label'),
                eyebrow: this.tr('workflow.materialCosts.step'),
                description: this.tr('workflow.materialCosts.description'),
                icon: 'fa-box-open'
            },
            {
                id: 'presets',
                label: this.tr('support.presets'),
                eyebrow: this.tr('navigation.setup'),
                description: this.tr('support.presetsDescription'),
                icon: 'fa-layer-group'
            }
        ];
    }

    getCurrentViewMeta() {
        return [...this.getPrimaryViews(), ...this.getSupportViews()]
            .find((view) => view.id === this.currentView) || this.getPrimaryViews()[0];
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

    formatQuantity(value, unit = '') {
        const numeric = Number(value) || 0;
        const formatted = new Intl.NumberFormat(this.getLocale(), {
            minimumFractionDigits: 0,
            maximumFractionDigits: 3
        }).format(numeric);
        return unit ? `${formatted} ${unit}` : formatted;
    }

    createLogEntry(overrides = {}) {
        const entryId = overrides.id || `wp-log-entry-${Date.now()}-${++this.logEntrySequence}`;
        return {
            id: entryId,
            property: String(overrides.property || overrides.propertyName || '').trim(),
            date: String(overrides.date || new Date().toISOString().split('T')[0]).trim(),
            quantity: Number.parseInt(overrides.quantity || 1, 10) || 1,
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
                quantity: 1,
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
        } else if (field === 'quantity') {
            const qty = Number.parseInt(value, 10);
            entry.quantity = !Number.isNaN(qty) && qty > 0 ? qty : 1;
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
                    const isActive = this.activeLogEntryId === entry.id;
                    return `
                        <article class="welcome-pack-entry-card ${isActive ? 'is-active' : ''}" data-wp-log-entry-id="${entry.id}">
                            <div class="welcome-pack-entry-top">
                                <div class="welcome-pack-entry-tag">
                                    <i class="fas fa-location-dot text-rose-500"></i>
                                    <span>${this.logEntries.length > 1 ? this.tr('log.entryLabel', { count: index + 1 }) : this.tr('log.fields.property')}</span>
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="text-xs text-slate-500" data-wp-entry-summary="${entry.id}">${this.tr('log.entrySummary', {
                                        cost: this.formatCurrency(entrySummary.totals.totalCost),
                                        profit: this.formatCurrency(entrySummary.totals.profit)
                                    })}</div>
                                    ${!isEditing && this.logEntries.length > 1 ? `
                                    <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" data-wp-entry-remove="${entry.id}" title="${this.tr('log.removeEntry')}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                    ` : ''}
                                </div>
                            </div>
                            <div class="welcome-pack-entry-grid">
                                <div class="welcome-pack-input-group">
                                    <span>${this.tr('log.fields.property')}</span>
                                    <div class="welcome-pack-input-with-icon">
                                        <i class="fas fa-building welcome-pack-input-icon"></i>
                                        <input type="text" data-wp-entry-property="${entry.id}" list="wp-properties-list" placeholder="${this.tr('log.fields.propertyPlaceholder')}" value="${escapeHtml(entry.property)}">
                                    </div>
                                </div>
                                <div class="welcome-pack-input-group">
                                    <span>${this.tr('log.fields.date')}</span>
                                    <input type="date" data-wp-entry-date="${entry.id}" value="${entry.date}">
                                </div>
                                <div class="welcome-pack-input-group">
                                    <span>${this.tr('log.fields.quantity')}</span>
                                    <input type="number" data-wp-entry-quantity="${entry.id}" min="1" step="1" value="${entry.quantity || 1}">
                                </div>
                                <div class="welcome-pack-input-group">
                                    <span>${this.tr('log.fields.chargedAmount')}</span>
                                    <div class="welcome-pack-input-with-icon">
                                        <i class="fas fa-euro-sign welcome-pack-input-icon"></i>
                                        <input type="number" data-wp-entry-charge="${entry.id}" step="0.01" min="0" placeholder="0.00" value="${entry.chargedAmount}">
                                    </div>
                                </div>
                            </div>
                        </article>
                    `;
                }).join('')}
                ${!isEditing ? `
                <button type="button" id="wp-add-log-entry-btn" class="welcome-pack-secondary-button mt-1">
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

        container.querySelectorAll('[data-wp-entry-quantity]').forEach((input) => {
            input.addEventListener('focus', () => this.setActiveLogEntry(input.dataset.wpEntryQuantity));
            input.addEventListener('input', () => this.updateLogEntryField(input.dataset.wpEntryQuantity, 'quantity', input.value));
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
            card.classList.toggle('is-active', isActive);

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
                removeButton.style.display = this.logEntries.length > 1 ? '' : 'none';
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

        const maxNet = Math.max(...entries.map((entry) => entry.netRevenue), 1);
        return `
            <div class="space-y-3">
                ${entries.map((entry) => {
                    const width = Math.max(10, Math.round((entry.netRevenue / maxNet) * 100));
                    return `
                        <article class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div class="mb-2 flex items-center justify-between gap-3">
                                <div>
                                    <strong class="text-slate-900">${this.formatDisplayDate(entry.date)}</strong>
                                    <div class="text-sm text-slate-500">${this.tr('dashboard.trends.packsCount', { count: entry.count })}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-semibold text-slate-900">${this.formatCurrency(entry.netRevenue)}</div>
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
        const currentView = this.getCurrentViewMeta();

        container.innerHTML = `
            <div class="welcome-pack-shell">
                <aside class="welcome-pack-workspace-bar" aria-label="Welcome Packs">
                    <div class="welcome-pack-workspace-title">
                        <div class="welcome-pack-sidebar-heading">
                            <span class="welcome-pack-sidebar-mark" aria-hidden="true"><i class="fas fa-gift"></i></span>
                            <div>
                                <div class="welcome-pack-section-kicker">${this.tr('hero.kicker')}</div>
                                <h2>${this.tr('header.title')}</h2>
                            </div>
                        </div>
                        <p>${this.tr('hero.body')}</p>
                    </div>

                    <button type="button" class="welcome-pack-action-button welcome-pack-sidebar-action" data-wp-start-purchase>
                        <i class="fas fa-plus"></i><span>${this.tr('purchases.recordPurchase')}</span>
                    </button>

                    <div class="welcome-pack-sidebar-group">
                        <span class="welcome-pack-sidebar-label">${this.tr('navigation.daily')}</span>
                        <nav class="welcome-pack-side-nav" aria-label="${this.tr('navigation.daily')}">
                            ${primaryViews.map((view) => `
                                <button type="button" id="wp-${view.id}-btn" class="welcome-pack-side-nav-item ${this.currentView === view.id ? 'is-active' : ''}" data-wp-view="${view.id}" ${this.currentView === view.id ? 'aria-current="page"' : ''}>
                                    <span class="welcome-pack-side-nav-icon"><i class="fas ${view.icon}"></i></span>
                                    <span>${view.label}</span>
                                </button>
                            `).join('')}
                        </nav>
                    </div>

                    <div class="welcome-pack-sidebar-group">
                        <span class="welcome-pack-sidebar-label">${this.tr('navigation.setup')}</span>
                        <nav class="welcome-pack-side-nav" aria-label="${this.tr('navigation.setup')}">
                            ${supportViews.map((view) => `
                                <button type="button" id="wp-${view.id}-btn" class="welcome-pack-side-nav-item ${this.currentView === view.id ? 'is-active' : ''}" data-wp-view="${view.id}" ${this.currentView === view.id ? 'aria-current="page"' : ''}>
                                    <span class="welcome-pack-side-nav-icon"><i class="fas ${view.icon}"></i></span>
                                    <span>${view.label}</span>
                                </button>
                            `).join('')}
                        </nav>
                    </div>

                    <div class="welcome-pack-sidebar-help">
                        <span class="welcome-pack-sidebar-label">${this.tr('navigation.help')}</span>
                        <button type="button" class="welcome-pack-guide-button" data-wp-open-guide>
                            <span class="welcome-pack-side-nav-icon"><i class="fas fa-circle-question"></i></span>
                            <span><strong>${this.tr('navigation.guide')}</strong><small>${this.tr('navigation.guideHint')}</small></span>
                        </button>
                    </div>
                </aside>

                <main class="welcome-pack-main">
                    <header class="welcome-pack-view-header">
                        <div>
                            <div class="welcome-pack-section-kicker">${currentView.eyebrow}</div>
                            <h1>${currentView.label}</h1>
                            <p>${currentView.description}</p>
                        </div>
                        <button type="button" class="welcome-pack-secondary-button" data-wp-open-guide>
                            <i class="fas fa-circle-question"></i><span>${this.tr('navigation.guide')}</span>
                        </button>
                    </header>
                    <div id="wp-view-container"></div>
                </main>
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
        document.querySelectorAll('[data-wp-open-guide]').forEach((button) => {
            button.addEventListener('click', () => this.showHelpModal());
        });
        document.querySelector('[data-wp-start-purchase]')?.addEventListener('click', () => {
            this.currentView = 'purchases';
            this.startPurchaseDraft();
        });
    }

    renderLoadingState(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="welcome-pack-loading-state">
                <span class="welcome-pack-loading-dot" aria-hidden="true"></span>${this.tr('states.loading')}
            </div>
        `;
    }

    describeLoadError(error) {
        const code = typeof error?.code === 'string' ? error.code.toLowerCase() : '';
        const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';

        if (code.includes('permission-denied') || message.includes('insufficient permissions')) {
            if (this.dataManager?.hasPrivilegedRole?.()) {
                return this.tr('states.permissionDeniedPrivileged');
            }
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
            <div class="welcome-pack-empty-state welcome-pack-error-state">
                <span class="welcome-pack-empty-icon"><i class="fas fa-triangle-exclamation"></i></span>
                <h3>${this.tr('states.unavailableTitle')}</h3>
                <p>${this.describeLoadError(error)}</p>
            </div>
        `;
    }

    async renderCurrentView() {
        const container = document.getElementById('wp-view-container');
        if (!container) return;

        this.renderLoadingState(container);

        try {
            if (this.currentView === 'overview') await this.renderOverview(container);
            else if (this.currentView === 'purchases') await this.renderPurchases(container);
            else if (this.currentView === 'dashboard') await this.renderDashboard(container);
            else if (this.currentView === 'reservations') await this.renderReservations(container);
            else if (this.currentView === 'inventory') await this.renderInventory(container);
            else if (this.currentView === 'presets') await this.renderPresets(container);
            else if (this.currentView === 'log') await this.renderLogForm(container);
        } catch (error) {
            console.error('Failed to render Welcome Packs view:', error);
            this.renderErrorState(container, error);
        }
    }

    renderOverviewStep(view, number) {
        return `
            <button type="button" class="welcome-pack-overview-step" data-wp-overview-view="${view.id}">
                <span class="welcome-pack-overview-number">${number}</span>
                <span class="welcome-pack-overview-icon"><i class="fas ${view.icon}"></i></span>
                <span class="welcome-pack-overview-copy">
                    <strong>${view.label}</strong>
                    <small>${view.description}</small>
                </span>
                <span class="welcome-pack-overview-open">${this.tr('overview.open')} <i class="fas fa-arrow-right"></i></span>
            </button>
        `;
    }

    async renderOverview(container) {
        const [logs, items] = await Promise.all([
            this._fetchData('logs'),
            this._fetchData('items')
        ]);
        const logSummary = summarizeWelcomePackLogs(logs);
        const inventorySummary = summarizeWelcomePackInventory(items);
        const allViews = [...this.getPrimaryViews(), ...this.getSupportViews()];
        const byId = (id) => allViews.find((view) => view.id === id);
        const dailyViews = ['log', 'dashboard'].map(byId);
        const setupViews = ['purchases', 'inventory', 'presets'].map(byId);

        container.innerHTML = `
            <section class="welcome-pack-overview-intro">
                <div>
                    <p class="welcome-pack-section-kicker">${this.tr('overview.eyebrow')}</p>
                    <h2>${this.tr('overview.title')}</h2>
                    <p>${this.tr('overview.description')}</p>
                </div>
                <button type="button" class="welcome-pack-action-button" data-wp-overview-guide>
                    <i class="fas fa-play"></i><span>${this.tr('navigation.guide')}</span>
                </button>
            </section>

            <section class="welcome-pack-overview-status" aria-label="${this.tr('overview.statusLabel')}">
                ${this.renderWorkspaceMetric(this.tr('inventory.metrics.tracked'), String(inventorySummary.totals.materialCount))}
                ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.loggedCharges'), String(logSummary.totals.count))}
                ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.amountCharged'), this.formatCurrency(logSummary.totals.revenue))}
                ${this.renderWorkspaceMetric(this.tr('dashboard.metrics.netProfit'), this.formatCurrency(logSummary.totals.profit))}
            </section>

            ${inventorySummary.totals.materialCount === 0 && logSummary.totals.count === 0 ? `
                <p class="welcome-pack-overview-empty-hint"><i class="fas fa-lightbulb"></i>${this.tr('overview.emptyHint')}</p>
            ` : ''}

            <div class="welcome-pack-overview-columns">
                <section class="welcome-pack-overview-flow">
                    <div class="welcome-pack-overview-section-heading">
                        <span>${this.tr('overview.dailyLabel')}</span>
                        <h3>${this.tr('overview.dailyTitle')}</h3>
                        <p>${this.tr('overview.dailyDescription')}</p>
                    </div>
                    <div class="welcome-pack-overview-steps">
                        ${dailyViews.map((view, index) => this.renderOverviewStep(view, index + 1)).join('')}
                    </div>
                </section>

                <section class="welcome-pack-overview-flow">
                    <div class="welcome-pack-overview-section-heading">
                        <span>${this.tr('overview.setupLabel')}</span>
                        <h3>${this.tr('overview.setupTitle')}</h3>
                        <p>${this.tr('overview.setupDescription')}</p>
                    </div>
                    <div class="welcome-pack-overview-steps">
                        ${setupViews.map((view, index) => this.renderOverviewStep(view, index + 1)).join('')}
                    </div>
                </section>
            </div>
        `;

        container.querySelectorAll('[data-wp-overview-view]').forEach((button) => {
            button.addEventListener('click', () => this.setCurrentView(button.dataset.wpOverviewView, {
                resetEdit: button.dataset.wpOverviewView === 'log'
            }));
        });
        container.querySelector('[data-wp-overview-guide]')?.addEventListener('click', () => this.showHelpModal());
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
        const bestDay = [...logSummary.byDate].sort((left, right) => right.netRevenue - left.netRevenue)[0] || null;

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

                <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
                        <span>${this.tr('dashboard.metrics.amountCharged')}</span>
                        <strong>${this.formatCurrency(logSummary.totals.netRevenue)}</strong>
                        <small>${this.tr('dashboard.metrics.averagePerPack', { amount: this.formatCurrency(logSummary.totals.averageNetCharge) })}</small>
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
                            amount: this.formatCurrency(topProperty.netRevenue),
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
                            amount: this.formatCurrency(bestDay.netRevenue),
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
                                        <td>${this.formatCurrency(property.cost)}</td>
                                        <td>${this.formatCurrency(property.netRevenue)}</td>
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
                                    <strong>${this.formatCurrency(log.chargedAmountNet)}</strong>
                                    <span>${this.tr('dashboard.recentCostProfit', {
                                        cost: this.formatCurrency(log.totalCost),
                                        profit: this.formatCurrency(log.profit)
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

        const applyFiltersBtn = document.getElementById('wp-apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.onclick = () => {
                const start = document.getElementById('wp-stats-start')?.value;
                const end = document.getElementById('wp-stats-end')?.value;
                if (start && end) {
                    this.dashboardFilters = { startDate: start, endDate: end };
                    this.renderCurrentView();
                }
            };
        }

        const exportCsvBtn = document.getElementById('wp-export-csv');
        if (exportCsvBtn) {
            exportCsvBtn.onclick = () => this.exportToCSV(filteredLogs);
        }
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
        document.getElementById('wp-help-modal')?.remove();

        const steps = [
            ['purchases', 'fa-receipt'],
            ['inventory', 'fa-box-open'],
            ['presets', 'fa-layer-group'],
            ['log', 'fa-home'],
            ['dashboard', 'fa-chart-line']
        ];
        const modal = document.createElement('div');
        modal.id = 'wp-help-modal';
        modal.className = 'welcome-pack-guide-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'wp-help-title');
        modal.innerHTML = `
            <div class="welcome-pack-guide-dialog">
                <aside class="welcome-pack-guide-aside">
                    <span class="welcome-pack-guide-badge"><i class="fas fa-gift"></i></span>
                    <p class="welcome-pack-section-kicker">${this.tr('help.eyebrow')}</p>
                    <h2 id="wp-help-title">${this.tr('help.title')}</h2>
                    <p>${this.tr('help.subtitle')}</p>
                    <div class="welcome-pack-guide-note">
                        <i class="fas fa-lightbulb"></i>
                        <span>${this.tr('help.intro')}</span>
                    </div>
                </aside>
                <section class="welcome-pack-guide-content">
                    <header>
                        <div>
                            <span>${this.tr('help.startLabel')}</span>
                            <strong>${steps.length} ${this.getLocale() === 'pt-PT' ? 'passos' : 'steps'}</strong>
                        </div>
                        <button type="button" id="wp-help-close" class="welcome-pack-guide-close" aria-label="${this.tr('help.close')}">
                            <i class="fas fa-times"></i>
                        </button>
                    </header>
                    <div class="welcome-pack-guide-steps">
                        ${steps.map(([view, icon]) => `
                            <button type="button" class="welcome-pack-guide-step" data-wp-guide-view="${view}">
                                <span class="welcome-pack-guide-step-icon"><i class="fas ${icon}"></i></span>
                                <span>
                                    <strong>${this.tr(`help.walkthrough.${view}.title`)}</strong>
                                    <small>${this.tr(`help.walkthrough.${view}.body`)}</small>
                                </span>
                                <span class="welcome-pack-guide-step-action">${this.tr('help.openSection')} <i class="fas fa-arrow-right"></i></span>
                            </button>
                        `).join('')}
                    </div>
                    <footer>
                        <button type="button" id="wp-help-done-btn" class="welcome-pack-action-button">${this.tr('help.done')}</button>
                    </footer>
                </section>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('is-visible'));

        const close = () => {
            modal.classList.remove('is-visible');
            document.removeEventListener('keydown', handleKeydown);
            setTimeout(() => modal.remove(), 180);
        };
        const handleKeydown = (event) => {
            if (event.key === 'Escape') close();
        };

        modal.querySelector('#wp-help-close')?.addEventListener('click', close);
        modal.querySelector('#wp-help-done-btn')?.addEventListener('click', close);
        modal.addEventListener('click', (event) => {
            if (event.target === modal) close();
        });
        modal.querySelectorAll('[data-wp-guide-view]').forEach((button) => {
            button.addEventListener('click', () => {
                const view = button.dataset.wpGuideView;
                close();
                this.setCurrentView(view, { resetEdit: view === 'log' });
            });
        });
        document.addEventListener('keydown', handleKeydown);
        modal.querySelector('#wp-help-close')?.focus();
    }

    showLegacyHelpModal() {
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

        container.innerHTML = `
            <!-- Header with Sync Button -->
            <div class="flex justify-between items-center mb-6">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">${this.tr('reservations.upcoming.title')}</h3>
                    <p class="text-sm text-gray-500">${this.tr('reservations.upcoming.summary', { enabled: configuredCount, total: totalCount })}</p>
                </div>
                <div class="flex items-center gap-3">
                    <span id="wp-last-sync-label" class="text-xs text-gray-400 font-medium"></span>
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

        // Guest data is loaded on demand and kept in memory only for this view.
        this.syncAndDisplayReservations(false);
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
                                    <span class="font-medium text-gray-800">${escapeHtml(property.name || property.id)}</span>
                                    <span class="ml-2 text-xs text-green-600">
                                        <i class="fas fa-check-circle"></i> ${this.tr('reservations.settings.enabledBadge')}
                                    </span>
                                </div>
                                <button type="button" class="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                    data-wp-property-id="${escapeHtml(property.id)}" data-wp-property-enabled="false">
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

        this.bindPropertyToggleButtons(container);

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
                        <p>${escapeHtml(this.tr('reservations.search.noMatch', { query }))}</p>
                    </div>
                `;
                return;
            }

            resultsContainer.innerHTML = matches.map(property => `
                <div class="flex items-center justify-between p-3 hover:bg-gray-50 border-b border-gray-100 last:border-0">
                    <div class="flex-1">
                        <span class="font-medium text-gray-800">${escapeHtml(property.name || property.id)}</span>
                        ${property.welcomePackEnabled
                    ? `<span class="ml-2 inline-flex items-center gap-1 text-green-600 text-xs">
                                <i class="fas fa-check-circle"></i> ${this.tr('reservations.search.enabled')}
                              </span>`
                    : `<span class="ml-2 inline-flex items-center gap-1 text-gray-400 text-xs">
                                <i class="fas fa-times-circle"></i> ${this.tr('reservations.search.disabled')}
                              </span>`
                }
                    </div>
                    <button type="button" class="px-4 py-2 text-sm font-medium rounded-lg transition-colors
                        ${property.welcomePackEnabled
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-500 text-white hover:bg-green-600'
                }" data-wp-property-id="${escapeHtml(property.id)}" data-wp-property-enabled="${String(!property.welcomePackEnabled)}">
                        ${property.welcomePackEnabled
                    ? `<i class="fas fa-times mr-1"></i> ${this.tr('reservations.search.disable')}`
                    : `<i class="fas fa-check mr-1"></i> ${this.tr('reservations.search.enable')}`}
                    </button>
                </div>
            `).join('');
            this.bindPropertyToggleButtons(resultsContainer);

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

    createPurchaseDraft() {
        return summarizePurchase({
            mode: 'bulk',
            supplier: '',
            invoiceNumber: '',
            date: new Date().toISOString().split('T')[0],
            cardCredit: 0,
            cashPaid: '',
            lines: [createPurchaseLine({
                id: `wp-purchase-line-${++this.purchaseLineSequence}`
            })]
        });
    }

    startPurchaseDraft() {
        this.purchaseDraft = this.createPurchaseDraft();
        this.purchaseFile = null;
        this.purchaseImportStatus = null;
        void this.renderCurrentView();
    }

    cancelPurchaseDraft() {
        this.purchaseDraft = null;
        this.purchaseFile = null;
        this.purchaseImportStatus = null;
        void this.renderCurrentView();
    }

    async renderPurchases(container) {
        const [purchases, materials] = await Promise.all([
            this._fetchData('purchases'),
            this._fetchData('items')
        ]);

        if (this.purchaseDraft) {
            this.renderPurchaseDraft(container, materials);
            return;
        }

        const recentCutoff = new Date();
        recentCutoff.setDate(recentCutoff.getDate() - 30);
        const recentDate = recentCutoff.toISOString().split('T')[0];
        const recentPurchases = purchases.filter((purchase) => String(purchase.date || '') >= recentDate);
        const totals = recentPurchases.reduce((summary, purchase) => {
            summary.net += Number(purchase.totals?.inventoryCostNet) || 0;
            summary.gross += Number(purchase.totals?.gross) || 0;
            summary.deposits += Number(purchase.totals?.deposits) || 0;
            return summary;
        }, { net: 0, gross: 0, deposits: 0 });

        container.innerHTML = `
            <section class="welcome-pack-panel welcome-pack-purchase-overview">
                <div class="welcome-pack-panel-heading welcome-pack-panel-heading--row">
                    <div>
                        <p class="welcome-pack-section-kicker">${this.tr('purchases.kicker')}</p>
                        <h3>${this.tr('purchases.title')}</h3>
                        <p>${this.tr('purchases.description')}</p>
                    </div>
                    <div class="welcome-pack-toolbar-actions">
                        <input id="wp-invoice-file-input" class="sr-only" type="file" accept="application/pdf,image/*">
                        <button type="button" id="wp-import-invoice-btn" class="welcome-pack-action-button">
                            <i class="fas fa-file-arrow-up"></i>
                            <span>${this.tr('purchases.importInvoice')}</span>
                        </button>
                        <button type="button" id="wp-new-purchase-btn" class="welcome-pack-secondary-button">
                            <i class="fas fa-plus"></i>
                            <span>${this.tr('purchases.recordManually')}</span>
                        </button>
                    </div>
                </div>

                ${this.purchaseImportStatus ? `
                <div class="welcome-pack-import-progress" role="status">
                    <div><i class="fas fa-spinner fa-spin"></i><span>${escapeHtml(this.purchaseImportStatus.message || '')}</span></div>
                    <progress max="100" value="${Number(this.purchaseImportStatus.progress) || 0}"></progress>
                </div>
                ` : ''}

                <div class="welcome-pack-metric-grid">
                    <article class="welcome-pack-metric">
                        <span>${this.tr('purchases.metrics.last30Days')}</span>
                        <strong>${recentPurchases.length}</strong>
                        <small>${this.tr('purchases.metrics.purchasesRecorded')}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('purchases.metrics.inventoryCost')}</span>
                        <strong>${this.formatCurrency(totals.net)}</strong>
                        <small>${this.tr('purchases.metrics.netCost')}</small>
                    </article>
                    <article class="welcome-pack-metric">
                        <span>${this.tr('purchases.metrics.cashAndVat')}</span>
                        <strong>${this.formatCurrency(totals.gross)}</strong>
                        <small>${this.tr('purchases.metrics.includesDeposits', { amount: this.formatCurrency(totals.deposits) })}</small>
                    </article>
                </div>

                ${purchases.length ? `
                <div class="welcome-pack-table-wrap">
                    <table class="welcome-pack-table">
                        <thead><tr>
                            <th>${this.tr('purchases.table.date')}</th>
                            <th>${this.tr('purchases.table.supplier')}</th>
                            <th>${this.tr('purchases.table.invoice')}</th>
                            <th>${this.tr('purchases.table.materials')}</th>
                            <th>${this.tr('purchases.table.netCost')}</th>
                            <th>${this.tr('purchases.table.paid')}</th>
                            <th>${this.tr('purchases.table.source')}</th>
                        </tr></thead>
                        <tbody>
                            ${purchases.map((purchase) => `
                            <tr>
                                <td>${this.formatDisplayDate(purchase.date)}</td>
                                <td><strong>${escapeHtml(purchase.supplier || '-')}</strong></td>
                                <td>${escapeHtml(purchase.invoiceNumber || '-')}</td>
                                <td>${this.pluralize('purchases.materialCount', purchase.lines?.length || 0)}</td>
                                <td>${this.formatCurrency(purchase.totals?.inventoryCostNet || 0)}</td>
                                <td>${this.formatCurrency(purchase.cashPaid ?? purchase.totals?.gross ?? 0)}</td>
                                <td>${purchase.attachment?.url
                                    ? `<a class="welcome-pack-invoice-link" href="${escapeHtml(purchase.attachment.url)}" target="_blank" rel="noopener"><i class="fas fa-paperclip"></i>${escapeHtml(purchase.attachment.name || this.tr('purchases.openInvoice'))}</a>`
                                    : `<span>${escapeHtml(purchase.importMethod || this.tr('purchases.manual'))}</span>`}
                                </td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ` : `
                <div class="welcome-pack-empty-state">
                    <h4>${this.tr('purchases.emptyTitle')}</h4>
                    <p>${this.tr('purchases.emptyDescription')}</p>
                </div>`}
            </section>
        `;

        document.getElementById('wp-new-purchase-btn')?.addEventListener('click', () => this.startPurchaseDraft());
        const fileInput = document.getElementById('wp-invoice-file-input');
        document.getElementById('wp-import-invoice-btn')?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            if (file) void this.importPurchaseInvoice(file);
        });
    }

    renderPurchaseDraft(container, materials = []) {
        const draft = summarizePurchase(this.purchaseDraft);
        this.purchaseDraft = draft;
        const isImported = Boolean(draft.importMethod);

        container.innerHTML = `
            <section class="welcome-pack-panel welcome-pack-purchase-editor">
                <div class="welcome-pack-panel-heading welcome-pack-panel-heading--row">
                    <div>
                        <p class="welcome-pack-section-kicker">${isImported ? this.tr('purchases.reviewKicker') : this.tr('purchases.entryKicker')}</p>
                        <h3>${isImported ? this.tr('purchases.reviewTitle') : this.tr('purchases.entryTitle')}</h3>
                        <p>${isImported ? this.tr('purchases.reviewDescription') : this.tr('purchases.entryDescription')}</p>
                    </div>
                    <button type="button" id="wp-cancel-purchase-btn" class="welcome-pack-secondary-button">
                        <i class="fas fa-xmark"></i><span>${this.tr('actions.cancel')}</span>
                    </button>
                </div>

                ${isImported ? `
                <div class="welcome-pack-import-result">
                    <i class="fas ${draft.importMethod === 'ocr' ? 'fa-eye' : 'fa-file-lines'}"></i>
                    <div><strong>${escapeHtml(this.purchaseFile?.name || this.tr('purchases.importedInvoice'))}</strong>
                    <span>${this.tr(draft.importMethod === 'ocr' ? 'purchases.ocrReviewNotice' : 'purchases.pdfReviewNotice')}</span></div>
                </div>` : ''}

                <div class="welcome-pack-purchase-meta">
                    <label class="welcome-pack-field"><span>${this.tr('purchases.fields.supplier')}</span><input data-purchase-meta="supplier" value="${escapeHtml(draft.supplier)}" required></label>
                    <label class="welcome-pack-field"><span>${this.tr('purchases.fields.date')}</span><input data-purchase-meta="date" type="date" value="${escapeHtml(draft.date)}" required></label>
                    <label class="welcome-pack-field"><span>${this.tr('purchases.fields.invoiceNumber')}</span><input data-purchase-meta="invoiceNumber" value="${escapeHtml(draft.invoiceNumber)}"></label>
                    <label class="welcome-pack-field"><span>${this.tr('purchases.fields.cardCredit')}</span><input data-purchase-meta="cardCredit" type="number" min="0" step="0.01" value="${draft.cardCredit || 0}"></label>
                    <label class="welcome-pack-field"><span>${this.tr('purchases.fields.cashPaid')}</span><input data-purchase-meta="cashPaid" type="number" min="0" step="0.01" value="${draft.cashPaid ?? ''}"></label>
                </div>

                <div class="welcome-pack-purchase-grid-wrap">
                    <table class="welcome-pack-purchase-grid">
                        <thead><tr>
                            <th>${this.tr('purchases.fields.material')}</th>
                            <th>${this.tr('purchases.fields.bought')}</th>
                            <th>${this.tr('purchases.fields.unitsPerPack')}</th>
                            <th>${this.tr('purchases.fields.stockUnit')}</th>
                            <th>${this.tr('purchases.fields.unitPrice')}</th>
                            <th>${this.tr('purchases.fields.priceMode')}</th>
                            <th>${this.tr('purchases.fields.discount')}</th>
                            <th>${this.tr('purchases.fields.vat')}</th>
                            <th>${this.tr('purchases.fields.extraCost')}</th>
                            <th>${this.tr('purchases.fields.deposit')}</th>
                            <th>${this.tr('purchases.fields.result')}</th>
                            <th></th>
                        </tr></thead>
                        <tbody id="wp-purchase-lines">
                            ${draft.lines.map((line) => this.renderPurchaseLineRow(line, materials)).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="welcome-pack-purchase-editor-footer">
                    <button type="button" id="wp-add-purchase-line-btn" class="welcome-pack-secondary-button">
                        <i class="fas fa-plus"></i><span>${this.tr('purchases.addLine')}</span>
                    </button>
                    <div class="welcome-pack-purchase-totals">
                        <div><span>${this.tr('purchases.totals.stockAdded')}</span><strong id="wp-purchase-total-stock">${this.formatQuantity(draft.totals.stockQuantity)}</strong></div>
                        <div><span>${this.tr('purchases.totals.netCost')}</span><strong id="wp-purchase-total-net">${this.formatCurrency(draft.totals.inventoryCostNet)}</strong></div>
                        <div><span>${this.tr('purchases.totals.vat')}</span><strong id="wp-purchase-total-vat">${this.formatCurrency(draft.totals.vat)}</strong></div>
                        <div><span>${this.tr('purchases.totals.deposits')}</span><strong id="wp-purchase-total-deposits">${this.formatCurrency(draft.totals.deposits)}</strong></div>
                        <div class="is-total"><span>${this.tr('purchases.totals.invoiceTotal')}</span><strong id="wp-purchase-total-gross">${this.formatCurrency(draft.totals.gross)}</strong></div>
                    </div>
                    <button type="button" id="wp-save-purchase-btn" class="welcome-pack-action-button welcome-pack-purchase-save">
                        <i class="fas fa-check"></i><span>${this.tr('purchases.saveAndUpdateStock')}</span>
                    </button>
                </div>
            </section>
        `;

        container.querySelectorAll('[data-purchase-meta]').forEach((input) => {
            input.addEventListener('input', () => {
                const field = input.dataset.purchaseMeta;
                this.purchaseDraft[field] = field === 'cardCredit' || field === 'cashPaid'
                    ? input.value
                    : input.value.trim();
                if (field === 'cashPaid') this.purchaseDraft.cashPaidIsAutomatic = false;
                this.refreshPurchaseDraftTotals();
            });
        });
        container.querySelectorAll('[data-purchase-line-field]').forEach((input) => {
            input.addEventListener('input', () => this.updatePurchaseLineFromInput(input, materials));
            input.addEventListener('change', () => this.updatePurchaseLineFromInput(input, materials));
        });
        container.querySelectorAll('[data-remove-purchase-line]').forEach((button) => {
            button.addEventListener('click', () => {
                this.purchaseDraft.lines = this.purchaseDraft.lines.filter((line) => line.id !== button.dataset.removePurchaseLine);
                if (!this.purchaseDraft.lines.length) this.addPurchaseLine(false);
                else this.renderPurchaseDraft(container, materials);
            });
        });
        document.getElementById('wp-add-purchase-line-btn')?.addEventListener('click', () => this.addPurchaseLine());
        document.getElementById('wp-cancel-purchase-btn')?.addEventListener('click', () => this.cancelPurchaseDraft());
        document.getElementById('wp-save-purchase-btn')?.addEventListener('click', () => void this.savePurchaseDraft());
    }

    renderPurchaseLineRow(line, materials) {
        return `
            <tr data-purchase-line-id="${escapeHtml(line.id)}">
                <td class="welcome-pack-purchase-material-cell">
                    <select data-purchase-line-field="materialId">
                        <option value="">${this.tr('purchases.newMaterial')}</option>
                        ${materials.map((material) => `<option value="${escapeHtml(material.id)}" ${material.id === line.materialId ? 'selected' : ''}>${escapeHtml(material.name)}</option>`).join('')}
                    </select>
                    <input data-purchase-line-field="name" value="${escapeHtml(line.name)}" placeholder="${this.tr('purchases.materialPlaceholder')}">
                </td>
                <td><input data-purchase-line-field="purchaseQuantity" type="number" min="0" step="0.001" value="${line.purchaseQuantity}"></td>
                <td><input data-purchase-line-field="unitsPerPurchaseUnit" type="number" min="0.001" step="0.001" value="${line.unitsPerPurchaseUnit}"></td>
                <td><select data-purchase-line-field="stockUnit">
                    ${['unit', 'bottle', 'pack', 'kg', 'litre'].map((unit) => `<option value="${unit}" ${line.stockUnit === unit ? 'selected' : ''}>${this.tr(`purchases.units.${unit}`)}</option>`).join('')}
                </select></td>
                <td><input data-purchase-line-field="unitPrice" type="number" min="0" step="0.0001" value="${line.unitPrice}"></td>
                <td><select data-purchase-line-field="priceMode"><option value="net" ${line.priceMode === 'net' ? 'selected' : ''}>${this.tr('purchases.net')}</option><option value="gross" ${line.priceMode === 'gross' ? 'selected' : ''}>${this.tr('purchases.gross')}</option></select></td>
                <td><input data-purchase-line-field="discountPercent" type="number" min="0" max="100" step="0.01" value="${line.discountPercent}"></td>
                <td><select data-purchase-line-field="vatRate">${[0, 4, 12, 22].map((rate) => `<option value="${rate}" ${Number(line.vatRate) === rate ? 'selected' : ''}>${rate}%</option>`).join('')}</select></td>
                <td><input data-purchase-line-field="extraCostNet" type="number" min="0" step="0.01" value="${line.extraCostNet}"></td>
                <td><input data-purchase-line-field="recoverableDeposit" type="number" min="0" step="0.01" value="${line.recoverableDeposit}"></td>
                <td class="welcome-pack-purchase-result"><strong data-line-stock>${this.formatQuantity(line.stockQuantity, line.stockUnit)}</strong><span data-line-cost>${this.formatCurrency(line.unitCost)} / ${escapeHtml(line.stockUnit)}</span></td>
                <td><button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" data-remove-purchase-line="${escapeHtml(line.id)}" title="${this.tr('actions.removeMaterial')}"><i class="fas fa-trash-alt"></i></button></td>
            </tr>`;
    }

    updatePurchaseLineFromInput(input, materials) {
        const row = input.closest('[data-purchase-line-id]');
        const lineIndex = this.purchaseDraft.lines.findIndex((line) => line.id === row?.dataset.purchaseLineId);
        if (lineIndex < 0) return;
        const field = input.dataset.purchaseLineField;
        const numericFields = new Set(['purchaseQuantity', 'unitsPerPurchaseUnit', 'unitPrice', 'discountPercent', 'vatRate', 'extraCostNet', 'recoverableDeposit']);
        const updates = { [field]: numericFields.has(field) ? input.value : input.value.trim() };

        if (field === 'materialId' && input.value) {
            const material = materials.find((candidate) => candidate.id === input.value);
            if (material) {
                updates.name = material.name;
                updates.stockUnit = material.stockUnit || 'unit';
                row.querySelector('[data-purchase-line-field="name"]').value = material.name;
                row.querySelector('[data-purchase-line-field="stockUnit"]').value = updates.stockUnit;
            }
        }

        this.purchaseDraft.lines[lineIndex] = calculatePurchaseLine({
            ...this.purchaseDraft.lines[lineIndex],
            ...updates
        });
        this.refreshPurchaseDraftTotals();
    }

    refreshPurchaseDraftTotals() {
        this.purchaseDraft = summarizePurchase(this.purchaseDraft);
        this.purchaseDraft.lines.forEach((line) => {
            const row = document.querySelector(`[data-purchase-line-id="${line.id}"]`);
            if (!row) return;
            const stock = row.querySelector('[data-line-stock]');
            const cost = row.querySelector('[data-line-cost]');
            if (stock) stock.textContent = this.formatQuantity(line.stockQuantity, line.stockUnit);
            if (cost) cost.textContent = `${this.formatCurrency(line.unitCost)} / ${line.stockUnit}`;
        });
        const values = {
            'wp-purchase-total-stock': this.formatQuantity(this.purchaseDraft.totals.stockQuantity),
            'wp-purchase-total-net': this.formatCurrency(this.purchaseDraft.totals.inventoryCostNet),
            'wp-purchase-total-vat': this.formatCurrency(this.purchaseDraft.totals.vat),
            'wp-purchase-total-deposits': this.formatCurrency(this.purchaseDraft.totals.deposits),
            'wp-purchase-total-gross': this.formatCurrency(this.purchaseDraft.totals.gross)
        };
        Object.entries(values).forEach(([id, value]) => {
            const target = document.getElementById(id);
            if (target) target.textContent = value;
        });
    }

    addPurchaseLine(render = true) {
        this.purchaseDraft.lines.push(createPurchaseLine({ id: `wp-purchase-line-${++this.purchaseLineSequence}` }));
        if (render) void this.renderCurrentView();
    }

    async importPurchaseInvoice(file) {
        if (file.size > 10 * 1024 * 1024) {
            alert(this.tr('purchases.fileTooLarge'));
            return;
        }
        this.purchaseFile = file;
        this.purchaseImportStatus = { progress: 0, message: this.tr('purchases.importStarting') };
        void this.renderCurrentView();
        try {
            const [extracted, fingerprint] = await Promise.all([
                extractInvoiceFile(file, {
                    onProgress: (status) => {
                        this.purchaseImportStatus = status;
                        const progress = document.querySelector('.welcome-pack-import-progress progress');
                        const label = document.querySelector('.welcome-pack-import-progress span');
                        if (progress) progress.value = Number(status.progress) || 0;
                        if (label) label.textContent = status.message || '';
                    }
                }),
                fingerprintInvoiceFile(file)
            ]);
            const materials = await this._fetchData('items');
            const parsed = parseWelcomePackInvoiceText(extracted.text);
            this.purchaseDraft = summarizePurchase({
                ...parsed,
                id: `invoice-${fingerprint.slice(0, 32)}`,
                lines: matchPurchaseLinesToMaterials(parsed.lines, materials),
                importMethod: extracted.method,
                importFileName: file.name,
                fileFingerprint: fingerprint,
                attachment: {
                    name: file.name,
                    contentType: file.type || 'application/pdf',
                    size: file.size || 0,
                    status: this.uploadInvoice ? 'pending' : 'metadata-only'
                }
            });
            this.purchaseImportStatus = null;
            await this.renderCurrentView();
        } catch (error) {
            console.error('[WelcomePack] Invoice import failed:', error);
            this.purchaseImportStatus = null;
            this.purchaseFile = null;
            alert(this.tr('purchases.importFailed', { message: error?.message || String(error) }));
            await this.renderCurrentView();
        }
    }

    async savePurchaseDraft() {
        const purchase = summarizePurchase(this.purchaseDraft);
        const validLines = purchase.lines.filter((line) => line.name && line.stockQuantity > 0);
        if (!purchase.supplier || !purchase.date || !validLines.length) {
            alert(this.tr('purchases.validation'));
            return;
        }

        if (purchase.invoiceNumber) {
            const purchases = await this._fetchData('purchases');
            const supplierKey = purchase.supplier.trim().toLowerCase();
            const invoiceKey = purchase.invoiceNumber.trim().toLowerCase();
            const duplicate = purchases.some((existing) => (
                String(existing.supplier || '').trim().toLowerCase() === supplierKey
                && String(existing.invoiceNumber || '').trim().toLowerCase() === invoiceKey
            ));
            if (duplicate) {
                alert(this.tr('purchases.duplicate'));
                return;
            }
        }

        const saveButton = document.getElementById('wp-save-purchase-btn');
        if (saveButton) saveButton.disabled = true;
        try {
            const result = await this.dataManager.saveWelcomePackPurchase({
                ...purchase,
                id: purchase.id || `purchase-${crypto.randomUUID()}`,
                lines: validLines,
                importRawText: purchase.rawText || '',
                importMethod: purchase.importMethod || 'manual'
            });

            if (this.purchaseFile && this.uploadInvoice) {
                try {
                    const attachment = await this.uploadInvoice({ purchaseId: result.id, file: this.purchaseFile });
                    await this.dataManager.updateWelcomePackPurchase(result.id, { attachment: { ...attachment, status: 'ready' } });
                } catch (uploadError) {
                    console.error('[WelcomePack] Invoice attachment upload failed:', uploadError);
                    await this.dataManager.updateWelcomePackPurchase(result.id, {
                        attachment: { ...purchase.attachment, status: 'failed' }
                    });
                    alert(this.tr('purchases.savedUploadFailed'));
                }
            }

            this._invalidateCache(['items', 'purchases']);
            this.purchaseDraft = null;
            this.purchaseFile = null;
            alert(this.tr('purchases.saved'));
            await this.render();
        } catch (error) {
            console.error('[WelcomePack] Purchase save failed:', error);
            alert(error?.code === 'welcome-pack/duplicate-invoice'
                ? this.tr('purchases.duplicate')
                : this.tr('purchases.saveFailed'));
            if (saveButton) saveButton.disabled = false;
        }
    }

    bindPropertyToggleButtons(container) {
        container?.querySelectorAll?.('[data-wp-property-id]').forEach((button) => {
            button.addEventListener('click', () => {
                this.toggleWelcomePack(
                    button.dataset.wpPropertyId || '',
                    button.dataset.wpPropertyEnabled === 'true'
                );
            });
        });
    }


    /**
     * Search properties for iCal configuration
     */
    async searchPropertiesForIcal(query) {
        void query;
        const resultsContainer = document.getElementById('wp-ical-search-results');
        const emptyState = document.getElementById('wp-ical-search-empty');

        if (!resultsContainer) return;
        resultsContainer.classList.remove('hidden');
        emptyState?.classList.add('hidden');
        resultsContainer.innerHTML = `
            <div class="p-4 text-center text-amber-700 bg-amber-50">
                <i class="fas fa-shield-alt mr-2"></i>
                Browser-side calendar configuration is disabled. Ask an administrator to use the protected backend.
            </div>
        `;
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

            // 2. Fetch the minimum reservation fields through the protected backend.
            if (typeof this.getUpcomingReservations !== 'function') {
                throw new Error('The protected reservation service is unavailable.');
            }
            const result = await this.getUpcomingReservations({
                days: Math.min(31, Math.max(1, Number(this.reservationsDateFilter) || 7))
            });
            const allReservations = Array.isArray(result?.data?.reservations)
                ? result.data.reservations
                : [];

            // 3. Update the in-memory view only. Guest data is never written to browser storage.
            const now = new Date();

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
                        <p class="text-sm">The protected reservation service could not be reached.</p>
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
            const propertyName = String(reservation.propertyName || '');
            const guestName = String(reservation.guestName || '');
            const summary = String(reservation.summary || '');
            const portal = String(reservation.portal || '');
            const portalKey = portal.toLowerCase();

            html += `
            <div class="bg-white border ${isToday ? 'border-green-300 bg-green-50' : 'border-gray-200'} rounded-lg p-4 hover:shadow-md transition-shadow">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            ${isToday ? `<span class="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded">${this.tr('reservations.upcoming.badges.today')}</span>` : ''}
                            ${isTomorrow ? `<span class="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded">${this.tr('reservations.upcoming.badges.tomorrow')}</span>` : ''}
                            <span class="font-medium text-gray-800">${escapeHtml(propertyName)}</span>
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
                            ${guestName
                    ? `<span class="font-medium text-gray-700"><i class="fas fa-user mr-1"></i>${escapeHtml(guestName)}</span>`
                    : (summary && summary !== 'UNAVAILABLE')
                        ? `<span><i class="fas fa-user mr-1"></i>${escapeHtml(summary)}</span>`
                        : `<span class="text-gray-400"><i class="fas fa-lock mr-1"></i>${this.tr('reservations.upcoming.blockedReserved')}</span>`
                }
                            ${portal
                    ? `<span class="px-2 py-0.5 rounded text-xs font-medium ${portalKey.includes('airbnb') ? 'bg-red-100 text-red-700' :
                        portalKey.includes('booking') ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                    }">${escapeHtml(portal)}</span>`
                    : ''
                }
                        </div>

                    </div>
                    <button type="button" data-wp-reservation-property="${escapeHtml(propertyName)}"
                            class="px-3 py-2 bg-[#e94b5a] text-white text-sm rounded-lg hover:bg-[#d3414f] transition-colors flex items-center gap-1 ml-4">
                    <i class="fas fa-gift"></i> ${this.tr('reservations.upcoming.assignPack')}
                </button>
                    </div>
                </div>
            `;
        }

        html += '</div>';
        listContainer.innerHTML = html;
        listContainer.querySelectorAll('[data-wp-reservation-property]').forEach((button) => {
            button.addEventListener('click', () => {
                this.logPackForReservation(button.dataset.wpReservationProperty || '');
            });
        });
    }

    /**
     * Fetch and parse iCal data from a URL
     */
    async fetchAndParseIcal(icalUrl, propertyName) {
        void icalUrl;
        void propertyName;
        throw new Error('Browser-side iCal access is disabled. Calendar feeds must be fetched by a protected backend.');
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
        throw new Error('Public reservation feeds are disabled. Use the protected reservation service.');
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
        void propertyId;
        void propertyName;
        void currentUrl;
        alert('Browser-side calendar configuration is disabled. Ask an administrator to configure the protected backend feed.');
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
                    log.chargedAmountNet.toFixed(2),
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
                    <button id="wp-add-item-btn" class="welcome-pack-action-button">
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
            const isLowStock = (item.quantity || 0) <= (item.reorderPoint ?? 5);

            return `
                                <tr>
                                    <td>
                                        <strong>${item.name}</strong>
                                        <span>${isLowStock ? this.tr('inventory.status.needsRestock') : this.tr('inventory.status.ready')}</span>
                                    </td>
                                    <td>${this.formatQuantity(item.quantity || 0, item.stockUnit || 'unit')}</td>
                                    <td>${this.formatCurrency(item.costPrice)} / ${escapeHtml(item.stockUnit || 'unit')}</td>
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
            // Calculate total items count and net total
            const totalItemCount = preset.items.reduce((sum, i) => sum + (i.quantity || 1), 0);
            const totalNet = preset.items.reduce((sum, i) => {
                const qty = i.quantity || 1;
                return sum + ((i.sellPrice || 0) * qty);
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
                                    <span class="font-bold text-gray-800">${this.formatCurrency(totalNet)}</span>
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
            return `
                                <div class="flex items-center gap-3 p-2 bg-white rounded border border-gray-200 hover:border-gray-300 transition-colors wp-preset-item-row" data-item-id="${item.id}">
                                    <input type="checkbox" class="wp-preset-item-checkbox form-checkbox h-5 w-5 text-[#e94b5a] rounded focus:ring-[#e94b5a] cursor-pointer" 
                                        data-item='${JSON.stringify({ id: item.id, name: item.name, costPrice: item.costPrice, sellPrice: item.sellPrice, costVatRate: item.costVatRate || 22, sellVatRate: vatRate })}'>
                                    <div class="flex-1">
                                        <span class="font-medium text-gray-800">${item.name}</span>
                                        <span class="ml-2 px-1.5 py-0.5 text-xs rounded ${this.getVatBadgeClass(vatRate)}">${vatRate}%</span>
                                    </div>
                                    <div class="flex items-center gap-2">
                                        <span class="text-sm text-gray-500">${this.formatCurrency(item.sellPrice || 0)}</span>
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
            const summaryParts = [];

            rows.forEach(row => {
                const checkbox = row.querySelector('.wp-preset-item-checkbox');
                const qtyInput = row.querySelector('.wp-preset-item-qty');

                if (checkbox.checked) {
                    const itemData = JSON.parse(checkbox.dataset.item);
                    const qty = parseInt(qtyInput.value) || 1;

                    totalNet += itemData.sellPrice * qty;
                    summaryParts.push(`${qty}Ã— ${itemData.name}`);
                }
            });

            document.getElementById('wp-preset-total').textContent = this.formatCurrency(totalNet);
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
        this.presets = presets;
        this.catalogItems = items;
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
            <div class="welcome-pack-log-layout">
                <div class="welcome-pack-form-column">
                    <!-- Step 1: Pack Selection -->
                    <section class="welcome-pack-section-card">
                        <div class="welcome-pack-section-header welcome-pack-section-header--between">
                            <div class="flex items-center gap-3">
                                <div class="welcome-pack-step-badge">1</div>
                                <div>
                                    <h3 class="welcome-pack-section-title">${this.tr('log.packSelectionTitle')}</h3>
                                    <p class="welcome-pack-section-desc">${this.tr('log.packSelectionDesc')}</p>
                                </div>
                            </div>
                            ${isEditing ? `
                            <button type="button" class="welcome-pack-secondary-button" onclick="welcomePackManager.cancelEdit()" title="${this.tr('actions.cancelEdit')}">
                                <i class="fas fa-rotate-left"></i>
                                <span>${this.tr('actions.cancelEdit')}</span>
                            </button>
                            ` : ''}
                        </div>

                        <div class="welcome-pack-preset-grid" id="wp-preset-cards">
                            ${presets.map((preset) => {
                                const totalUnits = (preset.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 1), 0);
                                const isActive = this.selectedPresetId === preset.id;
                                return `
                                <button type="button" class="welcome-pack-preset-card ${isActive ? 'is-active' : ''}" data-wp-preset-card-id="${preset.id}">
                                    <div class="welcome-pack-preset-card-header">
                                        <span class="welcome-pack-preset-card-icon"><i class="fas fa-gift"></i></span>
                                        <strong class="welcome-pack-preset-card-name">${escapeHtml(preset.name)}</strong>
                                    </div>
                                    <div class="welcome-pack-preset-card-details">
                                        <span>${preset.items.length} ${this.tr('log.materialsCount', { count: preset.items.length })}</span>
                                        <span>•</span>
                                        <span>${totalUnits} ${this.tr('log.unitsCount', { count: totalUnits })}</span>
                                    </div>
                                    <div class="welcome-pack-preset-card-items">
                                        ${(preset.items || []).slice(0, 3).map((i) => `${i.quantity || 1}× ${i.name}`).join(', ')}${(preset.items || []).length > 3 ? '...' : ''}
                                    </div>
                                </button>
                                `;
                            }).join('')}
                            <button type="button" class="welcome-pack-preset-card ${this.selectedPresetId === 'custom' || (!this.selectedPresetId && this.cart.length > 0) ? 'is-active' : ''}" data-wp-preset-card-id="custom">
                                <div class="welcome-pack-preset-card-header">
                                    <span class="welcome-pack-preset-card-icon"><i class="fas fa-sliders"></i></span>
                                    <strong class="welcome-pack-preset-card-name">${this.tr('log.customPack')}</strong>
                                </div>
                                <div class="welcome-pack-preset-card-details">
                                    <span>${this.tr('log.customPackDesc')}</span>
                                </div>
                            </button>
                        </div>

                        <select id="wp-preset-select" class="hidden">
                            <option value="">${this.tr('log.loadPresetPlaceholder')}</option>
                            ${presets.map((preset) => `<option value='${JSON.stringify(preset.items)}'>${preset.name}</option>`).join('')}
                        </select>
                    </section>

                    <!-- Step 2: Destination & Billing -->
                    <section class="welcome-pack-section-card">
                        <div class="welcome-pack-section-header">
                            <div class="welcome-pack-step-badge">2</div>
                            <div>
                                <h3 class="welcome-pack-section-title">${this.tr('log.destinationTitle')}</h3>
                                <p class="welcome-pack-section-desc">${this.tr('log.destinationDesc')}</p>
                            </div>
                        </div>

                        <datalist id="wp-properties-list">
                            ${propertyOptions.map((property) => `<option value="${escapeHtml(property.label)}"></option>`).join('')}
                        </datalist>
                        <div id="wp-log-entries"></div>
                        <div id="wp-property-charge-history"></div>
                    </section>

                    <!-- Step 3: Pack Contents -->
                    <section class="welcome-pack-section-card">
                        <div class="welcome-pack-section-header welcome-pack-section-header--between">
                            <div class="flex items-center gap-3">
                                <div class="welcome-pack-step-badge">3</div>
                                <div>
                                    <h3 class="welcome-pack-section-title">${this.tr('log.packContentsTitle')}</h3>
                                    <p class="welcome-pack-section-desc">${this.tr('log.packContentsDesc')}</p>
                                </div>
                            </div>
                            <button type="button" class="welcome-pack-secondary-button" id="wp-toggle-catalog-btn">
                                <i class="fas fa-plus"></i>
                                <span>${this.tr('log.addExtraMaterials')}</span>
                            </button>
                        </div>

                        <div id="wp-pack-items-editor" class="welcome-pack-items-editor"></div>

                        <div id="wp-catalog-drawer" class="welcome-pack-catalog-drawer hidden">
                            <div class="flex items-center justify-between gap-3 mb-3">
                                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">${this.tr('log.allMaterials')}</span>
                                <input type="search" id="wp-catalog-search-input" class="welcome-pack-catalog-search" placeholder="${this.tr('log.searchMaterials')}">
                            </div>
                            ${items.length > 0 ? `
                            <div class="welcome-pack-catalog-grid" id="wp-catalog-items-grid">
                                ${items.map((item) => {
                                    const safeName = String(item.name || '').replace(/"/g, '&quot;');
                                    return `
                                    <div class="welcome-pack-catalog-card" data-catalog-item-name="${safeName.toLowerCase()}">
                                        <div class="min-w-0 pr-2">
                                            <strong class="block text-xs font-semibold text-slate-800 truncate">${escapeHtml(item.name)}</strong>
                                            <span class="text-[11px] text-slate-500">${this.formatCurrency(item.costPrice)} • ${this.formatQuantity(item.quantity || 0, item.stockUnit || 'unit')}</span>
                                        </div>
                                        <button type="button"
                                            class="welcome-pack-secondary-button wp-item-select-btn !py-1 !px-2.5 !text-xs shrink-0"
                                            data-id="${item.id}"
                                            data-name="${safeName}"
                                            data-cost="${item.costPrice}"
                                            data-unit="${escapeHtml(item.stockUnit || 'unit')}"
                                            data-cost-vat="${item.costVatRate || 22}"
                                            data-sell="0"
                                            data-sell-vat="22">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                            ` : `
                            <div class="welcome-pack-empty-state !py-4">
                                <p class="text-xs text-slate-500 mb-2">${this.tr('log.noMaterialsDescription')}</p>
                                <button type="button" id="wp-open-inventory-from-log-btn" class="welcome-pack-secondary-button text-xs">
                                    <i class="fas fa-box-open mr-1"></i>${this.tr('dashboard.openMaterialCosts')}
                                </button>
                            </div>
                            `}
                        </div>
                    </section>
                </div>

                <!-- Right Sidebar / Receipt Card -->
                <aside class="welcome-pack-receipt-panel">
                    <div class="welcome-pack-receipt-card">
                        <div class="welcome-pack-receipt-header">
                            <div class="welcome-pack-receipt-badge">
                                <i class="fas fa-receipt"></i>
                            </div>
                            <div class="min-w-0">
                                <h4>${this.tr('log.receiptSummary')}</h4>
                                <span class="text-xs text-slate-500 truncate block" id="wp-receipt-destination-preview">${this.tr('log.noPropertySelectedYet')}</span>
                            </div>
                        </div>

                        <div id="wp-cart-list" class="welcome-pack-receipt-items"></div>
                        <div id="wp-cart-meta" class="welcome-pack-chip-row mb-3"></div>

                        <div class="welcome-pack-receipt-divider"></div>

                        <div class="welcome-pack-receipt-totals">
                            <div class="welcome-pack-receipt-row">
                                <span>${this.tr('log.summary.materialCost')}</span>
                                <strong id="wp-total-cost">€0.00</strong>
                            </div>
                            <div class="welcome-pack-receipt-row">
                                <span>${this.tr('log.summary.actualCharge')}</span>
                                <strong id="wp-total-sell">€0.00</strong>
                            </div>
                            <div class="welcome-pack-receipt-row welcome-pack-receipt-row--profit">
                                <span>${this.tr('log.summary.profit')}</span>
                                <div class="text-right">
                                    <strong id="wp-total-profit">€0.00</strong>
                                    <div><span id="wp-profit-margin-badge" class="welcome-pack-profit-chip" style="display: none;"></span></div>
                                </div>
                            </div>
                        </div>

                        <button id="wp-save-log-btn" class="welcome-pack-save-button">
                            <i class="fas ${isEditing ? 'fa-floppy-disk' : 'fa-check'}"></i>
                            <span>${isEditing ? this.tr('log.updateCharge') : this.tr('log.saveCharge')}</span>
                        </button>

                        ${isEditing ? `
                        <p class="text-xs text-center text-amber-600 mt-3">${this.tr('log.editHint')}</p>
                        ` : `
                        <p class="text-xs text-center text-slate-400 mt-3" id="wp-log-save-hint">${this.tr('log.saveHint', { count: this.logEntries.length || 1 })}</p>
                        `}
                    </div>
                </aside>
            </div>
        `;

        this.logFormLogs = allLogs;
        this.editingLogCreatedAt = editingLog?.createdAt || null;

        if (isEditing && editingLog) {
            this.cart = editingLog.items.map((item) => normalizeWelcomePackItem(item));
            this.editingOriginalItems = editingLog.items.map((item) => normalizeWelcomePackItem(item));
        } else if (!this.cart || this.cart.length === 0) {
            this.cart = [];
            this.editingOriginalItems = null;
            if (presets.length > 0 && !this.selectedPresetId) {
                this.selectedPresetId = presets[0].id;
                this.cart = (presets[0].items || []).map((item) => normalizeWelcomePackItem(item));
            }
        }

        this.renderLogEntryRows();
        this.updateCartUI();
        this.refreshPropertyChargeHistory();

        container.querySelectorAll('[data-wp-preset-card-id]').forEach((btn) => {
            btn.onclick = () => this.selectPreset(btn.dataset.wpPresetCardId);
        });

        document.getElementById('wp-toggle-catalog-btn')?.addEventListener('click', () => {
            this.toggleCatalogDrawer();
        });

        document.getElementById('wp-catalog-search-input')?.addEventListener('input', (e) => {
            this.filterCatalog(e.target.value);
        });

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
                    stockUnit: button.dataset.unit || 'unit',
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

    selectPreset(presetId) {
        this.selectedPresetId = presetId;
        if (presetId === 'custom') {
            this.updateCartUI();
            this.updatePresetButtonsUI();
            return;
        }
        const preset = (this.presets || []).find((p) => String(p.id) === String(presetId));
        if (preset && Array.isArray(preset.items)) {
            this.cart = preset.items.map((item) => normalizeWelcomePackItem(item));
        }
        this.updateCartUI();
        this.updatePresetButtonsUI();
    }

    updatePresetButtonsUI() {
        document.querySelectorAll('[data-wp-preset-card-id]').forEach((card) => {
            const id = card.dataset.wpPresetCardId;
            const isActive = this.selectedPresetId === id || (!this.selectedPresetId && id === 'custom' && this.cart.length > 0);
            card.classList.toggle('is-active', Boolean(isActive));
        });
    }

    stepCartItemQuantity(index, delta) {
        if (!this.cart[index]) return;
        const current = Number.parseFloat(this.cart[index].quantity) || 1;
        const next = Math.max(0, current + delta);
        if (next === 0) {
            this.removeCartItem(index);
        } else {
            this.updateCartItemQuantity(index, next);
        }
    }

    toggleCatalogDrawer() {
        const drawer = document.getElementById('wp-catalog-drawer');
        const btn = document.getElementById('wp-toggle-catalog-btn');
        if (!drawer) return;
        const isHidden = drawer.classList.toggle('hidden');
        if (btn) {
            const span = btn.querySelector('span');
            const icon = btn.querySelector('i');
            if (span) span.textContent = isHidden ? this.tr('log.addExtraMaterials') : this.tr('actions.cancel');
            if (icon) icon.className = isHidden ? 'fas fa-plus' : 'fas fa-xmark';
        }
    }

    filterCatalog(query) {
        const term = String(query || '').trim().toLowerCase();
        document.querySelectorAll('#wp-catalog-items-grid .welcome-pack-catalog-card').forEach((card) => {
            const name = card.dataset.catalogItemName || '';
            card.style.display = !term || name.includes(term) ? '' : 'none';
        });
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
        const nextQuantity = Number.parseFloat(quantity);
        if (!Number.isFinite(nextQuantity) || nextQuantity <= 0) {
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
                <div class="welcome-pack-history-pill">
                    <i class="fas fa-info-circle text-slate-400"></i>
                    <span>${this.tr('log.history.noPropertyDescription')}</span>
                </div>
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
                <div class="welcome-pack-history-pill">
                    <i class="fas fa-info-circle text-slate-400"></i>
                    <span>${this.tr('log.history.noPreviousCharge')}</span>
                </div>
            `;
            return;
        }

        const latest = matchingLogs[0];
        historyContainer.innerHTML = `
            <div class="welcome-pack-history-pill">
                <i class="fas fa-clock-rotate-left text-amber-500"></i>
                <span><strong>${property}</strong>: ${this.tr('log.history.lastCharge', {
                    amount: this.formatCurrency(latest.chargedAmountNet),
                    date: this.formatDisplayDate(latest.date)
                })} (${this.tr('log.history.costProfit', {
                    cost: this.formatCurrency(latest.totalCost),
                    profit: this.formatCurrency(latest.profit)
                })})</span>
            </div>
        `;
    }

    updateCartUI() {
        const summary = this.getLogEntrySummary(this.getActiveLogEntry());

        // 1. Pack Items Editor (Step 3)
        const editor = document.getElementById('wp-pack-items-editor');
        if (editor) {
            if (summary.items.length === 0) {
                editor.innerHTML = `
                    <div class="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                        <i class="fas fa-box-open text-slate-300 text-2xl mb-2 block"></i>
                        <p class="text-xs text-slate-500">${this.tr('log.noMaterialsInPack')}</p>
                    </div>
                `;
            } else {
                editor.innerHTML = summary.items.map((item, index) => {
                    const lineCost = (Number(item.costPrice) || 0) * (Number(item.quantity) || 1);
                    return `
                        <div class="welcome-pack-item-row">
                            <div class="min-w-0">
                                <div class="welcome-pack-item-name truncate">${escapeHtml(item.name)}</div>
                                <div class="welcome-pack-item-cost">${this.formatCurrency(item.costPrice)} / ${escapeHtml(item.stockUnit || 'unit')}</div>
                            </div>
                            <div class="welcome-pack-item-qty-stepper">
                                <button type="button" onclick="welcomePackManager.stepCartItemQuantity(${index}, -1)" title="Decrease">
                                    <i class="fas fa-minus"></i>
                                </button>
                                <input type="number" min="0.001" step="any" value="${item.quantity || 1}" onchange="welcomePackManager.updateCartItemQuantity(${index}, this.value)">
                                <button type="button" onclick="welcomePackManager.stepCartItemQuantity(${index}, 1)" title="Increase">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                            <strong class="text-xs font-semibold text-slate-700">${this.formatCurrency(lineCost)}</strong>
                            <button type="button" class="welcome-pack-icon-button welcome-pack-icon-button--danger" onclick="welcomePackManager.removeCartItem(${index})" title="${this.tr('actions.removeMaterial')}">
                                <i class="fas fa-xmark"></i>
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }

        // 2. Receipt Items (Sidebar)
        const receiptList = document.getElementById('wp-cart-list');
        if (receiptList) {
            if (summary.items.length === 0) {
                receiptList.innerHTML = `<p class="text-xs text-slate-400 py-3 text-center">${this.tr('log.noMaterialsSelected')}</p>`;
            } else {
                receiptList.innerHTML = summary.items.map((item) => {
                    const lineCost = (Number(item.costPrice) || 0) * (Number(item.quantity) || 1);
                    return `
                        <div class="welcome-pack-receipt-item">
                            <span class="truncate pr-2">${item.quantity || 1}× ${escapeHtml(item.name)}</span>
                            <strong class="shrink-0">${this.formatCurrency(lineCost)}</strong>
                        </div>
                    `;
                }).join('');
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
        const totalSell = document.getElementById('wp-total-sell');
        const totalProfit = document.getElementById('wp-total-profit');
        if (totalCost) totalCost.textContent = this.formatCurrency(summary.totals.totalCost);
        if (totalSell) totalSell.textContent = this.formatCurrency(summary.totals.chargedAmountNet);
        if (totalProfit) totalProfit.textContent = this.formatCurrency(summary.totals.profit);

        const marginBadge = document.getElementById('wp-profit-margin-badge');
        if (marginBadge) {
            const margin = summary.totals.margin || 0;
            if (summary.totals.chargedAmountNet > 0) {
                marginBadge.textContent = this.tr('log.marginBadge', { margin });
                marginBadge.style.display = 'inline-flex';
            } else {
                marginBadge.style.display = 'none';
            }
        }

        const destinationPreview = document.getElementById('wp-receipt-destination-preview');
        if (destinationPreview) {
            const activeEntry = this.getActiveLogEntry();
            const prop = activeEntry?.property || '';
            if (prop) {
                destinationPreview.textContent = `${prop} • ${activeEntry.date || ''}`;
            } else {
                destinationPreview.textContent = this.tr('log.noPropertySelectedYet');
            }
        }

        const saveHint = document.getElementById('wp-log-save-hint');
        if (saveHint) {
            const totalQuantity = this.logEntries.reduce((sum, entry) => sum + (entry.quantity || 1), 0);
            saveHint.textContent = this.tr('log.saveHint', { count: totalQuantity });
        }

        this.refreshLogEntryCards();
        this.refreshPropertyChargeHistory();
        this.updatePresetButtonsUI();
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
                    chargedAmount: summary.totals.chargedAmountNet,
                    chargedAmountNet: summary.totals.chargedAmountNet,
                    chargedAmountGross: summary.totals.chargedAmountGross,
                    vatAmount: summary.totals.vatAmount,
                    totalSell: summary.totals.chargedAmountNet,
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
                const logsToSave = [];
                preparedEntries.forEach((entry) => {
                    const quantity = entry.quantity || 1;
                    const summary = this.getLogEntrySummary(entry);
                    
                    for (let i = 0; i < quantity; i++) {
                        logsToSave.push({
                            property: entry.property,
                            date: entry.date,
                            items: summary.items,
                            totalCost: summary.totals.totalCost,
                            suggestedSell: summary.totals.suggestedChargeNet,
                            suggestedSellGross: summary.totals.suggestedChargeGross,
                            chargedAmount: summary.totals.chargedAmountNet,
                            chargedAmountNet: summary.totals.chargedAmountNet,
                            chargedAmountGross: summary.totals.chargedAmountGross,
                            vatAmount: summary.totals.vatAmount,
                            totalSell: summary.totals.chargedAmountNet,
                            profit: summary.totals.profit,
                            manualCharge: entry.manualCharge,
                            chargeEntryMode: entry.manualCharge ? 'manual' : 'none',
                            createdAt: timestamp,
                            updatedAt: timestamp
                        });
                    }
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
                        <div class="grid grid-cols-2 gap-3">
                            <input type="number" id="wp-new-item-stock" placeholder="${this.tr('modals.addMaterial.stockPlaceholder')}" class="w-full p-2 border rounded" min="0" step="0.001">
                            <select id="wp-new-item-unit" class="w-full p-2 border rounded bg-white">
                                ${['unit', 'bottle', 'pack', 'kg', 'litre'].map((unit) => `<option value="${unit}">${this.tr(`purchases.units.${unit}`)}</option>`).join('')}
                            </select>
                        </div>
                        <input type="number" id="wp-new-item-reorder" placeholder="${this.tr('modals.addMaterial.reorderPointPlaceholder')}" class="w-full p-2 border rounded" min="0" step="0.001" value="5">
                        
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
            const stock = Number.parseFloat(document.getElementById('wp-new-item-stock').value) || 0;
            const stockUnit = document.getElementById('wp-new-item-unit').value || 'unit';
            const reorderPoint = Number.parseFloat(document.getElementById('wp-new-item-reorder').value) || 0;
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
                    stockUnit,
                    reorderPoint,
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
                        <div class="grid grid-cols-2 gap-3">
                            <input type="number" id="wp-edit-item-stock" value="${item.quantity || 0}" placeholder="${this.tr('modals.editMaterial.stockPlaceholder')}" class="w-full p-2 border rounded" min="0" step="0.001">
                            <select id="wp-edit-item-unit" class="w-full p-2 border rounded bg-white">
                                ${['unit', 'bottle', 'pack', 'kg', 'litre'].map((unit) => `<option value="${unit}" ${String(item.stockUnit || 'unit') === unit ? 'selected' : ''}>${this.tr(`purchases.units.${unit}`)}</option>`).join('')}
                            </select>
                        </div>
                        <input type="number" id="wp-edit-item-reorder" value="${item.reorderPoint ?? 5}" placeholder="${this.tr('modals.editMaterial.reorderPointPlaceholder')}" class="w-full p-2 border rounded" min="0" step="0.001">
                        
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
            const stockUnit = document.getElementById('wp-edit-item-unit').value || 'unit';
            const reorderPoint = Number.parseFloat(document.getElementById('wp-edit-item-reorder').value) || 0;
            const costPrice = parseFloat(document.getElementById('wp-edit-item-cost').value);
            const costVatRate = parseInt(document.getElementById('wp-edit-item-cost-vat').value) || 22;
            const sellPrice = Number.isFinite(item.sellPrice) ? item.sellPrice : 0;
            const sellVatRate = Number.isFinite(item.sellVatRate) ? item.sellVatRate : 22;

            if (name && !isNaN(costPrice)) {
                const costCalc = this.calculateVAT(costPrice, costVatRate);
                const sellCalc = this.calculateVAT(sellPrice, sellVatRate);

                await this.dataManager.updateWelcomePackItem(item.id, {
                    name,
                    quantity: Number.parseFloat(stock) || 0,
                    stockUnit,
                    reorderPoint,
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

