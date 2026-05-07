import { i18n, t } from "../../core/i18n.js";

const STORAGE_KEY = "build-planner-statuses";

const STATUS_ORDER = ["notStarted", "ready", "inProgress", "done"];

const TRACKS = [
    {
        key: "foundations",
        title: { en: "Foundations", pt: "Fundacoes" },
        description: {
            en: "Replace fragile imports and spreadsheet dependencies with shared operational data.",
            pt: "Substitui importacoes frageis e dependencias de folhas por dados operacionais partilhados."
        }
    },
    {
        key: "operations",
        title: { en: "Operations", pt: "Operacoes" },
        description: {
            en: "Run daily short-rental work from one live board instead of scattered tools.",
            pt: "Executa o trabalho diario do alojamento local a partir de um painel vivo em vez de ferramentas soltas."
        }
    },
    {
        key: "finance",
        title: { en: "Finance", pt: "Financeiro" },
        description: {
            en: "Turn owner, supplier, and booking money flows into auditable system records.",
            pt: "Transforma fluxos financeiros de proprietarios, fornecedores e reservas em registos auditaveis no sistema."
        }
    },
    {
        key: "control",
        title: { en: "Control", pt: "Controlo" },
        description: {
            en: "Keep compliance, property knowledge, people operations, and access history in one place.",
            pt: "Mantem compliance, conhecimento do imovel, operacao de equipa e historico de acessos no mesmo sitio."
        }
    },
    {
        key: "growth",
        title: { en: "Growth", pt: "Crescimento" },
        description: {
            en: "Add external portals, route optimization, and AI support after the core workflow is stable.",
            pt: "Acrescenta portais externos, otimizacao de rotas e apoio com IA depois do fluxo principal estar estavel."
        }
    }
];

const ROADMAP_ITEMS = [
    {
        id: "pms-sync",
        order: 1,
        track: "foundations",
        title: "PMS Sync Layer",
        summary: "Pull reservations, cancellations, guest counts, channel source, and financial fields directly from your PMS instead of weekly file imports.",
        meaning: "This becomes the live reservation source of truth for the website. It should normalize PMS data into one predictable reservation record so the rest of the app can trust it.",
        beforeYouAsk: [
            "Confirm which PMS and channel data you want to sync first.",
            "Decide if sync is read-only at the start or if future write-back is needed.",
            "List the reservation fields that are still only in Google Sheets today."
        ],
        relatedApps: ["Weekly Reservations", "Properties", "Cleaning AH"]
    },
    {
        id: "task-engine",
        order: 2,
        track: "foundations",
        title: "Reservation-Centered Task Engine",
        summary: "Automatically create cleaning, inspection, laundry, welcome-pack, and follow-up tasks from each reservation lifecycle event.",
        meaning: "Instead of people manually deciding what needs to happen after every check-in and check-out, the system creates the work items, due times, and ownership rules for them.",
        beforeYouAsk: [
            "List the task types that should be created automatically from a reservation.",
            "Decide which tasks are mandatory and which are optional by property type.",
            "Say who should normally own each task type."
        ],
        relatedApps: ["Cleaning AH", "Welcome Packs", "Checklists", "Properties"]
    },
    {
        id: "arrivals-board",
        order: 3,
        track: "operations",
        title: "Arrivals and Departures Board",
        summary: "Show today, tomorrow, and same-day turnarounds with live readiness, blockers, and assignments in one operational board.",
        meaning: "This becomes the daily command center. Managers should be able to open one page and instantly see what is arriving, what is leaving, what is late, and what is at risk.",
        beforeYouAsk: [
            "Define which statuses matter most: clean, inspected, laundry pending, maintenance blocked, guest ready, and similar.",
            "Decide if the board should be by day only or also grouped by zone or assignee.",
            "List the biggest reasons a turnover currently fails or gets delayed."
        ],
        relatedApps: ["Weekly Reservations", "Cleaning AH", "Staff", "Properties"]
    },
    {
        id: "housekeeping-mobile",
        order: 4,
        track: "operations",
        title: "Housekeeping Mobile Workflow",
        summary: "Give cleaners and inspectors a mobile-first task view with checklists, photos, issue reporting, and offline-safe completion.",
        meaning: "This turns the app into a field tool instead of only an office dashboard. Cleaners should be able to open one task, follow the SOP, attach proof, and report issues without needing Sheets or WhatsApp for the core workflow.",
        beforeYouAsk: [
            "Say whether cleaners will use their own login, a shared station, or both.",
            "Choose the minimum data they must submit to complete a task.",
            "List the checklist steps that should be standardized first."
        ],
        relatedApps: ["Checklists", "Staff", "Time Clock", "Properties"]
    },
    {
        id: "maintenance-work-orders",
        order: 5,
        track: "operations",
        title: "Maintenance and Work Orders",
        summary: "Capture issues from cleaners, staff, or managers and turn them into prioritized work orders with ownership, notes, and cost history.",
        meaning: "This replaces maintenance tracking in chats and ad hoc notes. Each issue gets a lifecycle, owner, and record of what happened and what it cost.",
        beforeYouAsk: [
            "List the issue categories you want first: plumbing, internet, appliance, furniture, lock, and similar.",
            "Decide which issues block arrivals immediately and which can wait.",
            "Say if vendor assignment and quotes should be included in the first version."
        ],
        relatedApps: ["Properties", "Safety", "Owners"]
    },
    {
        id: "inventory-procurement",
        order: 6,
        track: "operations",
        title: "Inventory and Procurement",
        summary: "Track consumables, minimum stock, supplier reorder points, and property-level usage instead of separate stock sheets.",
        meaning: "This expands the current inventory helpers into a real operational supply flow. The system should know what exists, what is low, where it belongs, and what needs to be bought.",
        beforeYouAsk: [
            "Choose the first stock families to manage: linens, amenities, cleaning products, welcome-pack goods, and similar.",
            "Decide if stock should be tracked by property, by warehouse, or both.",
            "List the suppliers and pack sizes you already rely on most."
        ],
        relatedApps: ["Inventory", "Welcome Packs", "Properties"]
    },
    {
        id: "owner-statements",
        order: 7,
        track: "finance",
        title: "Owner Accounting and Statements",
        summary: "Generate owner ledgers, payout records, deductions, and monthly statements directly from system data.",
        meaning: "Owner reporting should stop depending on manually assembled spreadsheets. The app should produce a transparent ledger per owner and property, including revenue, costs, deductions, and payout status.",
        beforeYouAsk: [
            "Describe how owners are currently paid and what deductions must appear in a statement.",
            "List the documents or totals owners expect every period.",
            "Decide if the first version is internal-only or owner-visible."
        ],
        relatedApps: ["Owners", "Cleaning AH", "Properties"]
    },
    {
        id: "finance-reconciliation",
        order: 8,
        track: "finance",
        title: "Finance Reconciliation",
        summary: "Compare booking payouts, owner statements, cleaning costs, and bank-side numbers to detect mismatches automatically.",
        meaning: "This is the anti-spreadsheet control layer for money. It should flag gaps between what the PMS says, what the channel paid, what the owner received, and what your internal costs show.",
        beforeYouAsk: [
            "List the money sources you want to reconcile first: PMS export, Airbnb payout, bank records, internal statements, and similar.",
            "Decide whether imported bank files are acceptable for the first phase.",
            "Describe the most common mismatch that currently forces manual checking."
        ],
        relatedApps: ["Cleaning AH", "Owners", "Airbnb VAT Invoices"]
    },
    {
        id: "property-profitability",
        order: 9,
        track: "finance",
        title: "Property Profitability",
        summary: "Measure true margin by property and reservation after cleaning, laundry, fees, owner share, maintenance, and supplies.",
        meaning: "This converts financial activity into decision data. You should be able to see which properties make money, which ones are operationally expensive, and where margin is leaking.",
        beforeYouAsk: [
            "Say which cost categories must be included in the first profitability model.",
            "Decide if you want profitability per month, per stay, or both.",
            "List any property-level fixed costs that must be included."
        ],
        relatedApps: ["Cleaning AH", "Owners", "Properties", "Weekly Reservations"]
    },
    {
        id: "compliance-center",
        order: 10,
        track: "control",
        title: "Compliance Center",
        summary: "Track licenses, inspections, safety checks, insurance, and document expiries with reminders and audit history.",
        meaning: "This creates one trusted place for property compliance. Instead of relying on memory or scattered files, every regulated or recurring requirement gets an owner, due date, and record.",
        beforeYouAsk: [
            "List the compliance objects that matter first in Madeira: AL documents, insurance, extinguisher checks, first-aid checks, and similar.",
            "Decide what should trigger reminders.",
            "Say whether documents should be uploaded inside the app in phase one."
        ],
        relatedApps: ["Safety", "Properties", "RNAL"]
    },
    {
        id: "access-keys",
        order: 11,
        track: "control",
        title: "Access and Key Management",
        summary: "Store lock codes, rotations, physical key custody, and emergency-access history with audit trails.",
        meaning: "This brings access control into the system. The goal is to know which access method each property uses, who changed it, who has it, and when it should be rotated.",
        beforeYouAsk: [
            "List the access types you currently use: smart locks, keyboxes, physical keys, building codes, and similar.",
            "Decide which fields are sensitive enough to restrict to managers only.",
            "Say whether rotation history should be required in the first version."
        ],
        relatedApps: ["Operations", "Properties", "Safety"]
    },
    {
        id: "knowledge-base",
        order: 12,
        track: "control",
        title: "Property Knowledge Base",
        summary: "Turn all property know-how, SOPs, manuals, photos, and setup notes into searchable structured knowledge.",
        meaning: "This replaces the tribal knowledge problem. Property-specific instructions, welcome-pack rules, appliance notes, and one-off operational quirks should live in one structured place instead of chats and private memory.",
        beforeYouAsk: [
            "List the document or note types that are most painful to look up today.",
            "Decide whether information should be organized by property section, task type, or both.",
            "Say if photo attachments are needed in the first version."
        ],
        relatedApps: ["All Info", "Welcome Packs", "Properties", "Safety"]
    },
    {
        id: "people-ops",
        order: 13,
        track: "control",
        title: "People Ops and Payroll Export",
        summary: "Extend scheduling and time-clock data into payroll exports, overtime control, travel time, and staffing productivity.",
        meaning: "You already have scheduling and attendance foundations. This item turns them into payroll-ready and planning-ready outputs so staffing decisions rely on actual time and workload data.",
        beforeYouAsk: [
            "Describe the payroll outputs or summaries you need first.",
            "Decide whether travel time between properties should be tracked.",
            "List the attendance or staffing exceptions that currently need manual correction."
        ],
        relatedApps: ["Work Schedule", "Time Clock", "Staff"]
    },
    {
        id: "madeira-routing",
        order: 14,
        track: "growth",
        title: "Madeira Route Planning",
        summary: "Cluster tasks by zone and realistic travel time so field work reflects Madeira geography instead of flat calendar logic.",
        meaning: "Madeira operations are not generic city logistics. Task assignment should respect area, drive time, same-day turnovers, and practical route grouping for cleaners or inspectors.",
        beforeYouAsk: [
            "Define the zones you actually use in daily operations.",
            "Say which teams need routing first: cleaning, inspections, maintenance, or all.",
            "List the constraints that matter most: same-day urgency, area familiarity, vehicle type, and similar."
        ],
        relatedApps: ["Staff", "Vehicles", "Properties", "Cleaning AH"]
    },
    {
        id: "external-portals",
        order: 15,
        track: "growth",
        title: "Vendor and Owner Portals",
        summary: "Give external users a restricted view for tasks, statements, and updates without exposing the internal admin workspace.",
        meaning: "This lets cleaners, vendors, or owners interact with selected data safely. Instead of sending static files or screenshots, they get controlled visibility into the records that concern them.",
        beforeYouAsk: [
            "Choose which external user group should come first: owners, cleaners, laundry vendors, or maintenance suppliers.",
            "Define exactly what each external role must be able to see or update.",
            "Decide whether the first release is read-only or interactive."
        ],
        relatedApps: ["Owners", "Checklists", "Cleaning AH", "Staff"]
    },
    {
        id: "ai-search",
        order: 16,
        track: "growth",
        title: "AI Assistant and Global Search",
        summary: "Search across properties, tasks, documents, owners, and reservations, then add guided AI help for drafting, triage, and anomaly detection.",
        meaning: "This sits on top of the operational system once the structured data exists. It should help you find answers faster, draft repetitive outputs, and detect unusual cost or workflow patterns.",
        beforeYouAsk: [
            "Decide which search targets must exist first: properties, reservations, owners, tasks, and documents.",
            "List the assistant actions you value most: drafting emails, summarizing issues, finding missing data, and similar.",
            "Say which AI outputs must stay suggestion-only instead of auto-applying changes."
        ],
        relatedApps: ["Properties", "Owners", "Weekly Reservations", "Safety", "Welcome Packs"]
    },
    {
        id: "notification-center",
        order: 17,
        track: "control",
        title: "Notification Center",
        summary: "Collect overdue tasks, failed syncs, missing data, compliance risks, and urgent operational blockers in one alert stream.",
        meaning: "This is the system attention layer. Instead of discovering problems by accident, the app should surface what needs attention now and why it matters.",
        beforeYouAsk: [
            "List the alerts that would save you the most time if they were automatic.",
            "Decide which alerts are critical enough to show at the top level every day.",
            "Say whether alerts should stay inside the app first or also send email or WhatsApp later."
        ],
        relatedApps: ["Cleaning AH", "Safety", "Weekly Reservations", "Work Schedule"]
    },
    {
        id: "document-ingestion",
        order: 18,
        track: "finance",
        title: "Document Ingestion and OCR",
        summary: "Import invoices, contracts, and PDFs, extract key fields, and attach them to the correct owner, property, supplier, or reservation record.",
        meaning: "This turns uploaded documents into usable system records. It reduces manual retyping and makes later reconciliation, audits, and search much easier.",
        beforeYouAsk: [
            "Choose the first document families to support: invoices, owner contracts, supplier bills, and similar.",
            "List the key fields that must be extracted from each document type.",
            "Decide whether the first version should only store files or also parse and classify them."
        ],
        relatedApps: ["Owners", "Airbnb VAT Invoices", "Properties"]
    },
    {
        id: "audit-approvals",
        order: 19,
        track: "control",
        title: "Audit Trail and Approvals",
        summary: "Track who changed sensitive data and add approval flows for payouts, corrections, and finance-affecting actions.",
        meaning: "This is the trust and accountability layer. High-impact actions should leave a clear history and, when needed, require a second approval before they become final.",
        beforeYouAsk: [
            "List the actions that are sensitive enough to need audit logs or approvals.",
            "Decide which roles can approve which actions.",
            "Say whether read-only history is enough first or if approval workflow is needed immediately."
        ],
        relatedApps: ["Owners", "Cleaning AH", "User Management", "Time Clock"]
    },
    {
        id: "vendor-management",
        order: 20,
        track: "operations",
        title: "Vendor Management",
        summary: "Keep suppliers, technicians, laundry partners, and outsourced teams in one structured directory with rates, scope, and performance history.",
        meaning: "This makes external operators part of the system instead of side notes. You should know who you work with, what they do, how much they cost, and how reliable they are.",
        beforeYouAsk: [
            "List the external partner categories you want to manage first.",
            "Choose the minimum vendor fields you need: rate, area, specialty, response speed, and similar.",
            "Decide if vendor scoring or review history matters in the first phase."
        ],
        relatedApps: ["Owners", "Vehicles", "Cleaning AH", "Properties"]
    },
    {
        id: "background-jobs",
        order: 21,
        track: "foundations",
        title: "Background Jobs and Integration Workers",
        summary: "Move syncs, scheduled reminders, document processing, and nightly checks out of the browser into managed backend jobs.",
        meaning: "This is the reliability layer behind the app. Anything that must run on time or keep working when no one has the page open should live in background workers, not only in frontend code.",
        beforeYouAsk: [
            "List the workflows that must run automatically even when nobody is logged into the app.",
            "Decide which tasks are time-based, event-based, or manual-trigger only.",
            "Say whether the first version should only support scheduled syncs and reminders."
        ],
        relatedApps: ["Weekly Reservations", "Safety", "Owners", "Build Planner"]
    }
];

const ROADMAP_TRANSLATIONS_PT = {
    "pms-sync": {
        title: "Camada de Sincronizacao PMS",
        summary: "Trazer reservas, cancelamentos, numero de hospedes, canal e campos financeiros diretamente do PMS em vez de imports semanais.",
        meaning: "Isto passa a ser a fonte de verdade viva das reservas dentro do website. O objetivo e normalizar os dados do PMS para um registo de reserva previsivel em que o resto da app possa confiar.",
        beforeYouAsk: [
            "Confirma que PMS e que canais queres sincronizar primeiro.",
            "Decide se a primeira fase e so leitura ou se no futuro precisas de write-back.",
            "Lista os campos de reserva que ainda vivem apenas em Google Sheets."
        ],
        relatedApps: ["Reservas semanais", "Propriedades", "Cleaning AH"]
    },
    "task-engine": {
        title: "Motor de Tarefas por Reserva",
        summary: "Criar automaticamente tarefas de limpeza, inspecao, lavandaria, welcome pack e follow-up a partir do ciclo de vida de cada reserva.",
        meaning: "Em vez de a equipa decidir manualmente o que tem de acontecer em cada check-in e check-out, o sistema gera as tarefas, os prazos e as regras de atribuicao automaticamente.",
        beforeYouAsk: [
            "Lista os tipos de tarefa que devem nascer automaticamente de uma reserva.",
            "Decide quais tarefas sao obrigatorias e quais sao opcionais por tipo de propriedade.",
            "Diz quem deve ser o responsavel normal por cada tipo de tarefa."
        ],
        relatedApps: ["Cleaning AH", "Welcome Packs", "Checklists", "Propriedades"]
    },
    "arrivals-board": {
        title: "Painel de Chegadas e Saidas",
        summary: "Mostrar hoje, amanha e turnarounds no mesmo dia com estado de prontidao, bloqueios e atribuicoes num unico painel operacional.",
        meaning: "Isto passa a ser o centro de comando diario. Um manager deve conseguir abrir uma pagina e perceber logo o que chega, o que sai, o que esta atrasado e o que esta em risco.",
        beforeYouAsk: [
            "Define quais estados interessam mais: limpo, inspecionado, lavandaria pendente, bloqueado por manutencao, pronto para hospede, e semelhantes.",
            "Decide se o painel deve ser so por dia ou tambem agrupado por zona ou por responsavel.",
            "Lista as principais razoes pelas quais um turnaround falha ou atrasa hoje."
        ],
        relatedApps: ["Reservas semanais", "Cleaning AH", "Staff", "Propriedades"]
    },
    "housekeeping-mobile": {
        title: "Fluxo Mobile de Housekeeping",
        summary: "Dar a cleaners e inspetores uma vista mobile-first de tarefas com checklists, fotos, reporte de problemas e conclusao segura mesmo offline.",
        meaning: "Isto transforma a app numa ferramenta de campo e nao apenas num dashboard de escritorio. A equipa deve conseguir abrir uma tarefa, seguir o SOP, anexar prova e reportar problemas sem depender de Sheets ou WhatsApp para o fluxo principal.",
        beforeYouAsk: [
            "Diz se os cleaners vao usar login proprio, uma estacao partilhada, ou ambos.",
            "Escolhe os dados minimos que precisam de submeter para concluir uma tarefa.",
            "Lista os passos de checklist que queres normalizar primeiro."
        ],
        relatedApps: ["Checklists", "Staff", "Time Clock", "Propriedades"]
    },
    "maintenance-work-orders": {
        title: "Manutencao e Ordens de Trabalho",
        summary: "Captar problemas reportados por cleaners, staff ou managers e transforma-los em ordens de trabalho priorizadas com responsavel, notas e historico de custos.",
        meaning: "Isto substitui o acompanhamento de manutencao em chats e notas soltas. Cada problema passa a ter um ciclo de vida, um dono e um registo do que aconteceu e quanto custou.",
        beforeYouAsk: [
            "Lista as categorias de problema que queres primeiro: canalizacao, internet, eletrodomesticos, mobiliario, fechaduras, e semelhantes.",
            "Decide quais problemas bloqueiam chegadas imediatamente e quais podem esperar.",
            "Diz se atribuicao a fornecedor e pedidos de orcamento entram ja na primeira versao."
        ],
        relatedApps: ["Propriedades", "Safety", "Proprietarios"]
    },
    "inventory-procurement": {
        title: "Inventario e Compras",
        summary: "Controlar consumiveis, stock minimo, pontos de reposicao de fornecedores e uso por propriedade em vez de folhas de stock separadas.",
        meaning: "Isto expande os ajudantes atuais de inventario para um fluxo operacional real de abastecimento. O sistema deve saber o que existe, o que esta em falta, onde pertence e o que precisa de ser comprado.",
        beforeYouAsk: [
            "Escolhe as primeiras familias de stock a gerir: roupa, amenities, produtos de limpeza, itens de welcome pack, e semelhantes.",
            "Decide se o stock deve ser controlado por propriedade, por armazem, ou por ambos.",
            "Lista os fornecedores e formatos de compra em que mais confias hoje."
        ],
        relatedApps: ["Inventario", "Welcome Packs", "Propriedades"]
    },
    "owner-statements": {
        title: "Contabilidade e Mapas de Proprietarios",
        summary: "Gerar ledgers de proprietarios, registos de pagamento, deducoes e mapas mensais diretamente a partir dos dados do sistema.",
        meaning: "Os relatórios para proprietarios devem deixar de depender de folhas montadas manualmente. A app deve produzir um ledger transparente por proprietario e propriedade, com receitas, custos, deducoes e estado de pagamento.",
        beforeYouAsk: [
            "Descreve como os proprietarios sao pagos hoje e que deducoes devem aparecer num mapa.",
            "Lista os documentos ou totais que os proprietarios esperam em cada periodo.",
            "Decide se a primeira versao e apenas interna ou tambem visivel para o proprietario."
        ],
        relatedApps: ["Proprietarios", "Cleaning AH", "Propriedades"]
    },
    "finance-reconciliation": {
        title: "Reconciliacao Financeira",
        summary: "Comparar payouts de reservas, mapas de proprietarios, custos de limpeza e valores bancarios para detetar diferencas automaticamente.",
        meaning: "Esta e a camada anti-spreadsheet para dinheiro. Deve sinalizar falhas entre o que o PMS diz, o que o canal pagou, o que o proprietario recebeu e o que os custos internos mostram.",
        beforeYouAsk: [
            "Lista as fontes financeiras que queres reconciliar primeiro: export do PMS, payout da Airbnb, ficheiros do banco, mapas internos, e semelhantes.",
            "Decide se imports bancarios sao aceitaveis na primeira fase.",
            "Descreve qual e a discrepancia mais comum que hoje te obriga a verificar manualmente."
        ],
        relatedApps: ["Cleaning AH", "Proprietarios", "Faturas IVA Airbnb"]
    },
    "property-profitability": {
        title: "Rentabilidade por Propriedade",
        summary: "Medir a margem real por propriedade e por reserva depois de limpeza, lavandaria, comissoes, parte do proprietario, manutencao e consumiveis.",
        meaning: "Isto transforma atividade financeira em informacao de decisao. Deves conseguir ver que propriedades ganham dinheiro, quais sao caras de operar e onde a margem se esta a perder.",
        beforeYouAsk: [
            "Diz que categorias de custo sao obrigatorias no primeiro modelo de rentabilidade.",
            "Decide se queres rentabilidade por mes, por estadia, ou por ambos.",
            "Lista custos fixos por propriedade que tenham de entrar no calculo."
        ],
        relatedApps: ["Cleaning AH", "Proprietarios", "Propriedades", "Reservas semanais"]
    },
    "compliance-center": {
        title: "Centro de Compliance",
        summary: "Controlar licencas, inspecoes, verificacoes de seguranca, seguros e expiracao de documentos com lembretes e historico de auditoria.",
        meaning: "Isto cria um sitio de confianca para compliance da propriedade. Em vez de depender de memoria ou ficheiros espalhados, cada obrigacao regulatoria ou recorrente passa a ter responsavel, data e registo.",
        beforeYouAsk: [
            "Lista os objetos de compliance que interessam primeiro na Madeira: documentos AL, seguros, verificacoes de extintores, verificacoes de primeiros socorros, e semelhantes.",
            "Decide o que deve disparar lembretes.",
            "Diz se a primeira versao ja precisa de upload de documentos dentro da app."
        ],
        relatedApps: ["Safety", "Propriedades", "RNAL"]
    },
    "access-keys": {
        title: "Gestao de Acessos e Chaves",
        summary: "Guardar codigos de fechadura, rotacoes, custodia de chaves fisicas e historico de acessos de emergencia com trilho de auditoria.",
        meaning: "Isto traz o controlo de acessos para dentro do sistema. O objetivo e saber que metodo de acesso cada propriedade usa, quem o alterou, quem o possui e quando deve ser rodado.",
        beforeYouAsk: [
            "Lista os tipos de acesso que usas hoje: smart locks, keyboxes, chaves fisicas, codigos do predio, e semelhantes.",
            "Decide que campos sao sensiveis ao ponto de ficarem limitados a managers.",
            "Diz se o historico de rotacao deve ser obrigatorio desde a primeira versao."
        ],
        relatedApps: ["Operations", "Propriedades", "Safety"]
    },
    "knowledge-base": {
        title: "Base de Conhecimento por Propriedade",
        summary: "Transformar todo o know-how, SOPs, manuais, fotos e notas de setup das propriedades em conhecimento estruturado e pesquisavel.",
        meaning: "Isto resolve o problema de conhecimento tribal. Instrucoes especificas da propriedade, regras de welcome pack, notas de equipamentos e excecoes operacionais devem viver num unico sitio estruturado em vez de chats e memoria privada.",
        beforeYouAsk: [
            "Lista os tipos de documento ou nota que mais custam a encontrar hoje.",
            "Decide se a informacao deve ser organizada por secao da propriedade, por tipo de tarefa, ou por ambos.",
            "Diz se anexos com fotos sao necessarios na primeira versao."
        ],
        relatedApps: ["All Info", "Welcome Packs", "Propriedades", "Safety"]
    },
    "people-ops": {
        title: "People Ops e Exportacao para Payroll",
        summary: "Estender os dados de horarios e picagem para exportacoes de payroll, controlo de horas extra, tempo de deslocacao e produtividade da equipa.",
        meaning: "Ja tens a base de horarios e attendance. Este item transforma isso em outputs prontos para payroll e para planeamento, para que as decisoes de staffing usem tempo real e carga de trabalho real.",
        beforeYouAsk: [
            "Descreve que outputs de payroll ou resumos precisas primeiro.",
            "Decide se o tempo de deslocacao entre propriedades deve ser controlado.",
            "Lista as excecoes de attendance ou staffing que hoje precisam de correcao manual."
        ],
        relatedApps: ["Horario", "Time Clock", "Staff"]
    },
    "madeira-routing": {
        title: "Planeamento de Rotas na Madeira",
        summary: "Agrupar tarefas por zona e tempo realista de deslocacao para que o trabalho de campo reflita a geografia da Madeira em vez de logica plana de calendario.",
        meaning: "A operacao na Madeira nao e logistica urbana generica. A atribuicao de tarefas deve respeitar area, tempo de conducao, turnarounds no mesmo dia e agrupamentos praticos para cleaners ou inspetores.",
        beforeYouAsk: [
            "Define as zonas que realmente usas na operacao diaria.",
            "Diz que equipas precisam de routing primeiro: limpeza, inspecoes, manutencao, ou todas.",
            "Lista as restricoes que mais pesam: urgencia no mesmo dia, familiaridade com a area, tipo de viatura, e semelhantes."
        ],
        relatedApps: ["Staff", "Veiculos", "Propriedades", "Cleaning AH"]
    },
    "external-portals": {
        title: "Portais para Fornecedores e Proprietarios",
        summary: "Dar a utilizadores externos uma vista restrita de tarefas, mapas e updates sem expor o workspace interno de administracao.",
        meaning: "Isto permite que cleaners, fornecedores ou proprietarios interajam com dados selecionados de forma segura. Em vez de enviares ficheiros estaticos ou screenshots, recebem visibilidade controlada sobre os registos que lhes dizem respeito.",
        beforeYouAsk: [
            "Escolhe que grupo externo deve vir primeiro: proprietarios, cleaners, fornecedores de lavandaria ou manutencao.",
            "Define exatamente o que cada papel externo pode ver ou atualizar.",
            "Decide se a primeira versao e so leitura ou interativa."
        ],
        relatedApps: ["Proprietarios", "Checklists", "Cleaning AH", "Staff"]
    },
    "ai-search": {
        title: "Assistente IA e Pesquisa Global",
        summary: "Pesquisar propriedades, tarefas, documentos, proprietarios e reservas, e depois adicionar ajuda com IA para rascunhos, triagem e deteccao de anomalias.",
        meaning: "Isto fica por cima do sistema operacional quando os dados estruturados ja existem. Deve ajudar-te a encontrar respostas mais depressa, escrever saidas repetitivas e detetar padroes estranhos em custos ou fluxos.",
        beforeYouAsk: [
            "Decide que alvos de pesquisa tem de existir primeiro: propriedades, reservas, proprietarios, tarefas e documentos.",
            "Lista as acoes do assistente que mais valorizas: escrever emails, resumir problemas, encontrar dados em falta, e semelhantes.",
            "Diz que outputs da IA devem ficar apenas como sugestao em vez de alterar dados automaticamente."
        ],
        relatedApps: ["Propriedades", "Proprietarios", "Reservas semanais", "Safety", "Welcome Packs"]
    },
    "notification-center": {
        title: "Centro de Notificacoes",
        summary: "Juntar tarefas em atraso, syncs falhados, dados em falta, riscos de compliance e bloqueios operacionais urgentes numa unica linha de alertas.",
        meaning: "Esta e a camada de atencao do sistema. Em vez de descobrires problemas por acaso, a app deve mostrar o que precisa de atencao agora e porque e importante.",
        beforeYouAsk: [
            "Lista os alertas que mais tempo te poupariam se fossem automaticos.",
            "Decide que alertas sao criticos ao ponto de ficarem no topo todos os dias.",
            "Diz se os alertas devem ficar dentro da app primeiro ou se no futuro tambem devem ir por email ou WhatsApp."
        ],
        relatedApps: ["Cleaning AH", "Safety", "Reservas semanais", "Horario"]
    },
    "document-ingestion": {
        title: "Ingestao de Documentos e OCR",
        summary: "Importar faturas, contratos e PDFs, extrair campos-chave e anexar tudo ao proprietario, propriedade, fornecedor ou reserva correta.",
        meaning: "Isto transforma documentos carregados em registos utilizaveis do sistema. Reduz reescrita manual e facilita reconciliacao, auditoria e pesquisa mais tarde.",
        beforeYouAsk: [
            "Escolhe as primeiras familias de documentos a suportar: faturas, contratos de proprietario, contas de fornecedor, e semelhantes.",
            "Lista os campos-chave que precisam de ser extraidos de cada tipo de documento.",
            "Decide se a primeira versao deve apenas guardar ficheiros ou tambem classificar e extrair dados."
        ],
        relatedApps: ["Proprietarios", "Faturas IVA Airbnb", "Propriedades"]
    },
    "audit-approvals": {
        title: "Trilho de Auditoria e Aprovacoes",
        summary: "Registar quem alterou dados sensiveis e adicionar fluxos de aprovacao para pagamentos, correcoes e acoes com impacto financeiro.",
        meaning: "Esta e a camada de confianca e responsabilidade. Acoes de alto impacto devem deixar historico claro e, quando fizer sentido, exigir segunda aprovacao antes de ficarem finais.",
        beforeYouAsk: [
            "Lista as acoes que sao sensiveis ao ponto de precisarem de auditoria ou aprovacao.",
            "Decide que papeis podem aprovar que tipo de acoes.",
            "Diz se historico apenas de leitura chega para o inicio ou se ja precisas de workflow de aprovacao."
        ],
        relatedApps: ["Proprietarios", "Cleaning AH", "Gestao de utilizadores", "Time Clock"]
    },
    "vendor-management": {
        title: "Gestao de Fornecedores",
        summary: "Manter fornecedores, tecnicos, parceiros de lavandaria e equipas externas num diretorio estruturado com valores, ambito e historico de desempenho.",
        meaning: "Isto faz com que os operadores externos passem a fazer parte do sistema em vez de serem notas soltas. Deves saber com quem trabalhas, o que faz, quanto custa e quao fiavel e.",
        beforeYouAsk: [
            "Lista as categorias de parceiro externo que queres gerir primeiro.",
            "Escolhe os campos minimos de fornecedor: valor, area, especialidade, rapidez de resposta, e semelhantes.",
            "Decide se scoring ou historico de avaliacao interessam logo na primeira fase."
        ],
        relatedApps: ["Proprietarios", "Veiculos", "Cleaning AH", "Propriedades"]
    },
    "background-jobs": {
        title: "Jobs de Fundo e Workers de Integracao",
        summary: "Mover syncs, lembretes agendados, processamento de documentos e verificacoes noturnas do browser para jobs de backend geridos.",
        meaning: "Esta e a camada de fiabilidade por tras da app. Tudo o que precisa de correr a horas ou continuar a funcionar sem ninguem ter a pagina aberta deve viver em workers de fundo e nao apenas em frontend.",
        beforeYouAsk: [
            "Lista os fluxos que precisam de correr automaticamente mesmo quando ninguem esta com a app aberta.",
            "Decide que tarefas sao por tempo, por evento ou apenas manuais.",
            "Diz se a primeira versao pode limitar-se a syncs agendados e lembretes."
        ],
        relatedApps: ["Reservas semanais", "Safety", "Proprietarios", "Build Planner"]
    }
};

const UI_COPY = {
    en: {
        cardTitle: "Build Planner",
        cardDescription: "Future system ideas, recommended order, and copy-ready prompts for OpenCode.",
        headerKicker: "Roadmap",
        headerTitle: "Build Planner",
        headerSubtitle: "Keep future system upgrades inside the website, then ask for them only when you are ready.",
        heroEyebrow: "Pace-friendly roadmap",
        heroTitle: "Know what each future upgrade means before you ask me to build it.",
        heroBody: "This page keeps the long-term roadmap inside the app. Each idea explains the goal, what you should decide first, and gives you a prompt you can copy whenever you want me to plan or implement it.",
        statsTotal: "Ideas tracked",
        statsReady: "Ready to ask",
        statsInProgress: "In progress",
        statsDone: "Done",
        nextTitle: "Recommended next up",
        nextBody: "These are the highest-value unfinished items based on the current roadmap order.",
        orderTitle: "Recommended build order",
        orderBody: "The safest sequence is data first, then daily operations, then finance and control, then portals and AI.",
        howToTitle: "How to use this page",
        howToSteps: [
            "Choose one item and read the meaning first.",
            "Check the Before asking me list so you know what information to decide or gather.",
            "Copy the prompt and send it to me when you want planning, scoping, or implementation help."
        ],
        quickPromptsTitle: "Meta prompts you can use any time",
        quickPrompts: [
            {
                id: "choose-next",
                title: "Choose the next best item",
                description: "Use this when you want help deciding what has the highest ROI to build next.",
                prompt: "Open Build Planner and tell me which unfinished item has the highest ROI to build next for this Madeira short-rental company. Use the current codebase and existing tools as context."
            },
            {
                id: "scope-item",
                title: "Turn one item into a roadmap",
                description: "Use this when you want structure and MVP definition, but not implementation yet.",
                prompt: "Open Build Planner and turn [item] into a phased roadmap for this codebase. Keep it practical, explain the MVP first, and do not implement anything yet."
            },
            {
                id: "build-item",
                title: "Build the first version",
                description: "Use this when you want me to review the repo and actually implement the feature.",
                prompt: "Open Build Planner and build the first practical version of [item] inside this existing website. Start by reviewing the current related modules and keep the MVP focused."
            },
            {
                id: "gap-review",
                title: "Compare current app vs idea",
                description: "Use this when you want a gap analysis before deciding whether to build.",
                prompt: "Compare the current codebase against [item] from Build Planner and tell me what is already covered, what is missing, and what the smallest next step should be."
            }
        ],
        searchLabel: "Search roadmap",
        searchPlaceholder: "Search by title, summary, related app, or keyword",
        filterLabel: "Progress filter",
        emptyTitle: "No roadmap items match this filter.",
        emptyBody: "Try clearing the search or changing the progress filter.",
        meaningTitle: "What it means",
        beforeAskTitle: "Before asking me",
        sayNowTitle: "What you can say to me",
        relatedTitle: "Touches current apps",
        progressLabel: "Progress",
        planPromptLabel: "Copy planning prompt",
        buildPromptLabel: "Copy build prompt",
        quickPromptLabel: "Copy meta prompt",
        feedbackCopiedPlanning: "Planning prompt copied.",
        feedbackCopiedBuild: "Build prompt copied.",
        feedbackCopiedMeta: "Meta prompt copied.",
        feedbackCopyFailed: "Copy failed. Select the text manually and try again.",
        statusFilterAll: "All progress",
        trackLabel: "Track",
        statusLabels: {
            notStarted: "Not started",
            ready: "Ready to ask",
            inProgress: "In progress",
            done: "Done"
        },
        planPromptTemplate: "Open Build Planner and help me turn \"{{title}}\" into a practical MVP for this codebase. Review the current related modules, explain the smallest useful first release, and list the UI, data model, and test changes you would recommend before implementing it.",
        buildPromptTemplate: "Open Build Planner and build the first practical version of \"{{title}}\" inside this existing website. Review the current repo first, reuse related modules where possible, keep the MVP focused, and then implement the feature with the most relevant tests."
    },
    pt: {
        cardTitle: "Build Planner",
        cardDescription: "Ideias futuras do sistema, ordem recomendada e prompts prontos para o OpenCode.",
        headerKicker: "Roadmap",
        headerTitle: "Build Planner",
        headerSubtitle: "Guarda as futuras melhorias dentro do website e pede-as apenas quando estiveres pronto.",
        heroEyebrow: "Roadmap ao teu ritmo",
        heroTitle: "Percebe o que cada melhoria futura significa antes de me pedires para a construir.",
        heroBody: "Esta pagina guarda o roadmap de longo prazo dentro da app. Cada ideia explica o objetivo, o que deves decidir primeiro e da-te um prompt que podes copiar quando quiseres que eu planeie ou implemente.",
        statsTotal: "Ideias acompanhadas",
        statsReady: "Prontas para pedir",
        statsInProgress: "Em progresso",
        statsDone: "Concluidas",
        nextTitle: "Proximas recomendadas",
        nextBody: "Estas sao as ideias inacabadas com maior valor segundo a ordem atual do roadmap.",
        orderTitle: "Ordem recomendada de construcao",
        orderBody: "A sequencia mais segura e dados primeiro, depois operacao diaria, depois financeiro e controlo, e so depois portais e IA.",
        howToTitle: "Como usar esta pagina",
        howToSteps: [
            "Escolhe um item e le primeiro o significado.",
            "Verifica a lista Antes de me pedir para saberes que informacao tens de decidir ou reunir.",
            "Copia o prompt e envia-mo quando quiseres ajuda de planeamento, definicao ou implementacao."
        ],
        quickPromptsTitle: "Meta prompts que podes usar a qualquer momento",
        quickPrompts: [
            {
                id: "choose-next",
                title: "Escolher o proximo melhor item",
                description: "Usa isto quando quiseres ajuda para decidir o que tem maior ROI para construir a seguir.",
                prompt: "Abre o Build Planner e diz-me qual e o item inacabado com maior ROI para construir a seguir para esta empresa de alojamento local na Madeira. Usa o codebase atual e as ferramentas existentes como contexto."
            },
            {
                id: "scope-item",
                title: "Transformar um item em roadmap",
                description: "Usa isto quando quiseres estrutura e definicao de MVP, mas ainda sem implementacao.",
                prompt: "Abre o Build Planner e transforma [item] num roadmap por fases para este codebase. Mantem tudo pratico, explica primeiro o MVP e nao implementes nada ainda."
            },
            {
                id: "build-item",
                title: "Construir a primeira versao",
                description: "Usa isto quando quiseres que eu reveja o repo e implemente mesmo a funcionalidade.",
                prompt: "Abre o Build Planner e construi a primeira versao pratica de [item] dentro deste website existente. Comeca por rever os modulos atuais relacionados e mantem o MVP focado."
            },
            {
                id: "gap-review",
                title: "Comparar app atual vs ideia",
                description: "Usa isto quando quiseres uma analise de lacunas antes de decidir construir.",
                prompt: "Compara o codebase atual com [item] do Build Planner e diz-me o que ja esta coberto, o que falta e qual deve ser o proximo passo mais pequeno."
            }
        ],
        searchLabel: "Pesquisar roadmap",
        searchPlaceholder: "Pesquisa por titulo, resumo, app relacionada ou palavra-chave",
        filterLabel: "Filtro de progresso",
        emptyTitle: "Nenhum item do roadmap corresponde a este filtro.",
        emptyBody: "Tenta limpar a pesquisa ou mudar o filtro de progresso.",
        meaningTitle: "O que significa",
        beforeAskTitle: "Antes de me pedir",
        sayNowTitle: "O que me podes dizer",
        relatedTitle: "Toca nas apps atuais",
        progressLabel: "Progresso",
        planPromptLabel: "Copiar prompt de planeamento",
        buildPromptLabel: "Copiar prompt de construcao",
        quickPromptLabel: "Copiar meta prompt",
        feedbackCopiedPlanning: "Prompt de planeamento copiado.",
        feedbackCopiedBuild: "Prompt de construcao copiado.",
        feedbackCopiedMeta: "Meta prompt copiado.",
        feedbackCopyFailed: "A copia falhou. Seleciona o texto manualmente e tenta outra vez.",
        statusFilterAll: "Todo o progresso",
        trackLabel: "Area",
        statusLabels: {
            notStarted: "Por iniciar",
            ready: "Pronto para pedir",
            inProgress: "Em progresso",
            done: "Concluido"
        },
        planPromptTemplate: "Abre o Build Planner e ajuda-me a transformar \"{{title}}\" num MVP pratico para este codebase. Reve os modulos atuais relacionados, explica a primeira versao util e lista as alteracoes de UI, modelo de dados e testes que recomendarias antes de implementar.",
        buildPromptTemplate: "Abre o Build Planner e construi a primeira versao pratica de \"{{title}}\" dentro deste website existente. Reve primeiro o repo atual, reutiliza os modulos relacionados sempre que fizer sentido, mantem o MVP focado e depois implementa a funcionalidade com os testes mais relevantes."
    }
};

export class BuildPlannerManager {
    constructor({ documentRef = document, windowRef = window, storageRef = window.localStorage } = {}) {
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.storageRef = storageRef;
        this.initialized = false;
        this.feedbackTimeoutId = null;
        this.query = "";
        this.statusFilter = "all";
        this.statuses = this.loadStatuses();

        this.handleRootClick = this.handleRootClick.bind(this);
        this.handleRootInput = this.handleRootInput.bind(this);
        this.handlePageOpened = this.handlePageOpened.bind(this);
        this.handleLanguageChanged = this.handleLanguageChanged.bind(this);
    }

    init() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.bindRootEvents();
        this.documentRef.addEventListener("buildPlannerPageOpened", this.handlePageOpened);
        this.windowRef.addEventListener("languageChanged", this.handleLanguageChanged);
        this.syncChromeCopy();
        this.render();
    }

    handlePageOpened() {
        this.render();
    }

    handleLanguageChanged() {
        this.syncChromeCopy();
        this.render();
    }

    bindRootEvents() {
        const root = this.getRoot();
        if (!root || root.dataset.bound === "true") {
            return;
        }

        root.dataset.bound = "true";
        root.addEventListener("click", this.handleRootClick);
        root.addEventListener("input", this.handleRootInput);
        root.addEventListener("change", this.handleRootInput);
    }

    getRoot() {
        return this.documentRef.getElementById("build-planner-root");
    }

    getCurrentLanguage() {
        return i18n.getCurrentLanguage?.() === "pt" ? "pt" : "en";
    }

    getUiCopy() {
        return UI_COPY[this.getCurrentLanguage()] || UI_COPY.en;
    }

    loadStatuses() {
        try {
            const raw = this.storageRef?.getItem(STORAGE_KEY);
            if (!raw) {
                return {};
            }

            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (error) {
            console.warn("Failed to load build planner statuses:", error);
            return {};
        }
    }

    saveStatuses() {
        try {
            this.storageRef?.setItem(STORAGE_KEY, JSON.stringify(this.statuses));
        } catch (error) {
            console.warn("Failed to save build planner statuses:", error);
        }
    }

    getStatus(itemId) {
        const value = this.statuses[itemId];
        return STATUS_ORDER.includes(value) ? value : "notStarted";
    }

    setStatus(itemId, status) {
        if (!STATUS_ORDER.includes(status)) {
            return;
        }

        this.statuses[itemId] = status;
        this.saveStatuses();
        this.render();
    }

    syncChromeCopy() {
        const ui = this.getUiCopy();
        this.setText("build-planner-card-title", ui.cardTitle);
        this.setText("build-planner-card-description", ui.cardDescription);
        this.setText("build-planner-header-kicker", ui.headerKicker);
        this.setText("build-planner-page-title", ui.headerTitle);
        this.setText("build-planner-page-subtitle", ui.headerSubtitle);
        this.setText("build-planner-back-label", t("common.back"));
        this.setText("build-planner-sign-out-label", t("common.signOut"));
    }

    setText(elementId, value) {
        const element = this.documentRef.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    handleRootClick(event) {
        const copyPromptButton = event.target.closest("[data-copy-prompt]");
        if (copyPromptButton) {
            const itemId = copyPromptButton.getAttribute("data-item-id");
            const promptType = copyPromptButton.getAttribute("data-copy-prompt");
            const item = ROADMAP_ITEMS.find((entry) => entry.id === itemId);

            if (item) {
                const prompt = promptType === "build" ? this.buildImplementationPrompt(item) : this.buildPlanningPrompt(item);
                this.copyPrompt(prompt, promptType === "build" ? "build" : "planning");
            }
            return;
        }

        const quickPromptButton = event.target.closest("[data-copy-quick-prompt]");
        if (quickPromptButton) {
            const promptId = quickPromptButton.getAttribute("data-copy-quick-prompt");
            const prompt = this.getUiCopy().quickPrompts.find((entry) => entry.id === promptId)?.prompt;
            if (prompt) {
                this.copyPrompt(prompt, "meta");
            }
        }
    }

    handleRootInput(event) {
        const queryInput = event.target.closest("#build-planner-search");
        if (queryInput) {
            this.query = queryInput.value || "";
            this.render();
            return;
        }

        const filterInput = event.target.closest("#build-planner-status-filter");
        if (filterInput) {
            this.statusFilter = filterInput.value || "all";
            this.render();
            return;
        }

        const statusInput = event.target.closest("[data-item-status]");
        if (statusInput) {
            this.setStatus(statusInput.getAttribute("data-item-status"), statusInput.value);
        }
    }

    getTrack(trackKey) {
        return TRACKS.find((entry) => entry.key === trackKey) || TRACKS[0];
    }

    getTrackTitle(trackKey) {
        const track = this.getTrack(trackKey);
        return track.title[this.getCurrentLanguage()] || track.title.en;
    }

    getLocalizedItem(item) {
        if (this.getCurrentLanguage() !== "pt") {
            return item;
        }

        const localized = ROADMAP_TRANSLATIONS_PT[item.id];
        return localized ? { ...item, ...localized } : item;
    }

    getFilteredItems() {
        const query = this.query.trim().toLowerCase();

        return ROADMAP_ITEMS.filter((item) => {
            const localizedItem = this.getLocalizedItem(item);
            const status = this.getStatus(item.id);
            if (this.statusFilter !== "all" && status !== this.statusFilter) {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                localizedItem.title,
                localizedItem.summary,
                localizedItem.meaning,
                ...localizedItem.beforeYouAsk,
                ...localizedItem.relatedApps,
                this.getTrackTitle(localizedItem.track)
            ].join(" ").toLowerCase();

            return haystack.includes(query);
        });
    }

    getStatusCounts() {
        return ROADMAP_ITEMS.reduce((counts, item) => {
            const status = this.getStatus(item.id);
            counts.total += 1;
            counts[status] += 1;
            return counts;
        }, { total: 0, notStarted: 0, ready: 0, inProgress: 0, done: 0 });
    }

    getRecommendedItems() {
        return ROADMAP_ITEMS
            .filter((item) => this.getStatus(item.id) !== "done")
            .sort((left, right) => left.order - right.order)
            .slice(0, 4);
    }

    buildPlanningPrompt(item) {
        return this.getUiCopy().planPromptTemplate.replace("{{title}}", this.getLocalizedItem(item).title);
    }

    buildImplementationPrompt(item) {
        return this.getUiCopy().buildPromptTemplate.replace("{{title}}", this.getLocalizedItem(item).title);
    }

    async copyPrompt(text, tone) {
        const didCopy = await this.copyToClipboard(text);
        if (!didCopy) {
            this.showFeedback(this.getUiCopy().feedbackCopyFailed, "error");
            return;
        }

        const ui = this.getUiCopy();
        const message = tone === "build"
            ? ui.feedbackCopiedBuild
            : tone === "meta"
            ? ui.feedbackCopiedMeta
            : ui.feedbackCopiedPlanning;

        this.showFeedback(message, "success");
    }

    async copyToClipboard(value) {
        const clipboard = this.windowRef.navigator?.clipboard;
        if (clipboard?.writeText) {
            try {
                await clipboard.writeText(value);
                return true;
            } catch (error) {
                console.warn("Clipboard copy failed, trying fallback:", error);
            }
        }

        const textarea = this.documentRef.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "readonly");
        textarea.style.position = "fixed";
        textarea.style.top = "-1000px";
        textarea.style.left = "-1000px";
        this.documentRef.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        let copied = false;
        try {
            copied = this.documentRef.execCommand("copy");
        } catch (error) {
            console.warn("execCommand copy failed:", error);
            copied = false;
        } finally {
            textarea.remove();
        }

        return copied;
    }

    showFeedback(message, tone = "success") {
        const feedback = this.documentRef.getElementById("build-planner-feedback");
        if (!feedback) {
            return;
        }

        feedback.textContent = message;
        feedback.classList.remove("hidden", "build-planner-feedback-success", "build-planner-feedback-error");
        feedback.classList.add(tone === "success" ? "build-planner-feedback-success" : "build-planner-feedback-error");

        if (this.feedbackTimeoutId) {
            this.windowRef.clearTimeout(this.feedbackTimeoutId);
        }

        this.feedbackTimeoutId = this.windowRef.setTimeout(() => {
            feedback.classList.add("hidden");
        }, 2200);
    }

    escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;")
            .replaceAll("'", "&#39;");
    }

    renderStatusOptions(itemId) {
        const ui = this.getUiCopy();
        const currentStatus = this.getStatus(itemId);
        return STATUS_ORDER.map((status) => `
            <option value="${status}" ${currentStatus === status ? "selected" : ""}>${this.escapeHtml(ui.statusLabels[status])}</option>
        `).join("");
    }

    renderBeforeAskList(item) {
        return item.beforeYouAsk.map((entry) => `<li>${this.escapeHtml(entry)}</li>`).join("");
    }

    renderQuickPrompts() {
        const ui = this.getUiCopy();
        return ui.quickPrompts.map((prompt) => `
            <article class="build-planner-meta-card">
                <div class="build-planner-meta-card-top">
                    <div>
                        <h3>${this.escapeHtml(prompt.title)}</h3>
                        <p>${this.escapeHtml(prompt.description)}</p>
                    </div>
                    <button type="button" class="build-planner-copy-button" data-copy-quick-prompt="${this.escapeHtml(prompt.id)}">${this.escapeHtml(ui.quickPromptLabel)}</button>
                </div>
                <div class="build-planner-prompt-preview">${this.escapeHtml(prompt.prompt)}</div>
            </article>
        `).join("");
    }

    renderRecommendedList() {
        return this.getRecommendedItems().map((item) => {
            const localizedItem = this.getLocalizedItem(item);
            return `
            <article class="build-planner-next-item">
                <span class="build-planner-next-order">${String(localizedItem.order).padStart(2, "0")}</span>
                <div>
                    <h3>${this.escapeHtml(localizedItem.title)}</h3>
                    <p>${this.escapeHtml(localizedItem.summary)}</p>
                </div>
            </article>
        `;
        }).join("");
    }

    renderOrderRail() {
        return TRACKS.map((track) => `
            <article class="build-planner-order-step">
                <h3>${this.escapeHtml(track.title[this.getCurrentLanguage()] || track.title.en)}</h3>
                <p>${this.escapeHtml(track.description[this.getCurrentLanguage()] || track.description.en)}</p>
            </article>
        `).join("");
    }

    renderRoadmapItems() {
        const ui = this.getUiCopy();
        const visibleItems = this.getFilteredItems();

        if (!visibleItems.length) {
            return `
                <section class="build-planner-empty">
                    <h3>${this.escapeHtml(ui.emptyTitle)}</h3>
                    <p>${this.escapeHtml(ui.emptyBody)}</p>
                </section>
            `;
        }

        const grouped = TRACKS.map((track) => ({
            track,
            items: visibleItems.filter((item) => item.track === track.key)
        })).filter((entry) => entry.items.length > 0);

        return grouped.map(({ track, items }) => `
            <section class="build-planner-track-section">
                <div class="build-planner-section-heading">
                    <div>
                        <p class="build-planner-section-kicker">${this.escapeHtml(ui.trackLabel)}</p>
                        <h2>${this.escapeHtml(track.title[this.getCurrentLanguage()] || track.title.en)}</h2>
                    </div>
                    <p>${this.escapeHtml(track.description[this.getCurrentLanguage()] || track.description.en)}</p>
                </div>
                <div class="build-planner-item-list">
                    ${items.map((item) => {
                        const localizedItem = this.getLocalizedItem(item);
                        const status = this.getStatus(localizedItem.id);
                        const planningPrompt = this.buildPlanningPrompt(localizedItem);
                        return `
                            <article class="build-planner-item" data-track="${this.escapeHtml(localizedItem.track)}">
                                <header class="build-planner-item-top">
                                    <div class="build-planner-item-heading">
                                        <div class="build-planner-item-meta">
                                            <span class="build-planner-order-badge">${String(localizedItem.order).padStart(2, "0")}</span>
                                            <span class="build-planner-track-badge">${this.escapeHtml(this.getTrackTitle(localizedItem.track))}</span>
                                            <span class="build-planner-status-badge build-planner-status-badge--${this.escapeHtml(status)}">${this.escapeHtml(ui.statusLabels[status])}</span>
                                        </div>
                                        <h3>${this.escapeHtml(localizedItem.title)}</h3>
                                        <p>${this.escapeHtml(localizedItem.summary)}</p>
                                    </div>
                                    <label class="build-planner-progress-field">
                                        <span>${this.escapeHtml(ui.progressLabel)}</span>
                                        <select data-item-status="${this.escapeHtml(localizedItem.id)}">${this.renderStatusOptions(localizedItem.id)}</select>
                                    </label>
                                </header>
                                <div class="build-planner-item-grid">
                                    <section>
                                        <h4>${this.escapeHtml(ui.meaningTitle)}</h4>
                                        <p>${this.escapeHtml(localizedItem.meaning)}</p>
                                    </section>
                                    <section>
                                        <h4>${this.escapeHtml(ui.beforeAskTitle)}</h4>
                                        <ul class="build-planner-list">${this.renderBeforeAskList(localizedItem)}</ul>
                                    </section>
                                </div>
                                <section class="build-planner-prompt-section">
                                    <div class="build-planner-prompt-header">
                                        <h4>${this.escapeHtml(ui.sayNowTitle)}</h4>
                                        <button type="button" class="build-planner-copy-button" data-copy-prompt="plan" data-item-id="${this.escapeHtml(localizedItem.id)}">${this.escapeHtml(ui.planPromptLabel)}</button>
                                    </div>
                                    <div class="build-planner-prompt-preview">${this.escapeHtml(planningPrompt)}</div>
                                </section>
                                <footer class="build-planner-item-footer">
                                    <div class="build-planner-related">
                                        <span class="build-planner-footer-label">${this.escapeHtml(ui.relatedTitle)}</span>
                                        <div class="build-planner-chip-row">
                                            ${localizedItem.relatedApps.map((appName) => `<span class="build-planner-chip">${this.escapeHtml(appName)}</span>`).join("")}
                                        </div>
                                    </div>
                                    <button type="button" class="build-planner-secondary-button" data-copy-prompt="build" data-item-id="${this.escapeHtml(localizedItem.id)}">${this.escapeHtml(ui.buildPromptLabel)}</button>
                                </footer>
                            </article>
                        `;
                    }).join("")}
                </div>
            </section>
        `).join("");
    }

    render() {
        const root = this.getRoot();
        if (!root) {
            return;
        }

        const ui = this.getUiCopy();
        const counts = this.getStatusCounts();

        root.innerHTML = `
            <div class="build-planner-shell">
                <section class="build-planner-hero">
                    <div class="build-planner-hero-copy">
                        <p class="build-planner-kicker">${this.escapeHtml(ui.heroEyebrow)}</p>
                        <h1>${this.escapeHtml(ui.heroTitle)}</h1>
                        <p class="build-planner-hero-body">${this.escapeHtml(ui.heroBody)}</p>
                    </div>
                    <aside class="build-planner-stats-grid">
                        <article class="build-planner-stat"><span>${this.escapeHtml(ui.statsTotal)}</span><strong>${counts.total}</strong></article>
                        <article class="build-planner-stat"><span>${this.escapeHtml(ui.statsReady)}</span><strong>${counts.ready}</strong></article>
                        <article class="build-planner-stat"><span>${this.escapeHtml(ui.statsInProgress)}</span><strong>${counts.inProgress}</strong></article>
                        <article class="build-planner-stat"><span>${this.escapeHtml(ui.statsDone)}</span><strong>${counts.done}</strong></article>
                    </aside>
                </section>

                <p id="build-planner-feedback" class="build-planner-feedback hidden" aria-live="polite"></p>

                <section class="build-planner-grid">
                    <article class="build-planner-panel">
                        <div class="build-planner-panel-heading"><h2>${this.escapeHtml(ui.howToTitle)}</h2></div>
                        <ol class="build-planner-list build-planner-list-numbered">
                            ${ui.howToSteps.map((step) => `<li>${this.escapeHtml(step)}</li>`).join("")}
                        </ol>
                    </article>
                    <article class="build-planner-panel">
                        <div class="build-planner-panel-heading">
                            <h2>${this.escapeHtml(ui.nextTitle)}</h2>
                            <p>${this.escapeHtml(ui.nextBody)}</p>
                        </div>
                        <div class="build-planner-next-list">${this.renderRecommendedList()}</div>
                    </article>
                </section>

                <section class="build-planner-panel">
                    <div class="build-planner-panel-heading">
                        <h2>${this.escapeHtml(ui.orderTitle)}</h2>
                        <p>${this.escapeHtml(ui.orderBody)}</p>
                    </div>
                    <div class="build-planner-order-rail">${this.renderOrderRail()}</div>
                </section>

                <section class="build-planner-panel">
                    <div class="build-planner-panel-heading"><h2>${this.escapeHtml(ui.quickPromptsTitle)}</h2></div>
                    <div class="build-planner-meta-grid">${this.renderQuickPrompts()}</div>
                </section>

                <section class="build-planner-toolbar">
                    <label class="build-planner-search-field">
                        <span>${this.escapeHtml(ui.searchLabel)}</span>
                        <input id="build-planner-search" type="search" value="${this.escapeHtml(this.query)}" placeholder="${this.escapeHtml(ui.searchPlaceholder)}">
                    </label>
                    <label class="build-planner-filter-field">
                        <span>${this.escapeHtml(ui.filterLabel)}</span>
                        <select id="build-planner-status-filter">
                            <option value="all" ${this.statusFilter === "all" ? "selected" : ""}>${this.escapeHtml(ui.statusFilterAll)}</option>
                            ${STATUS_ORDER.map((status) => `<option value="${status}" ${this.statusFilter === status ? "selected" : ""}>${this.escapeHtml(ui.statusLabels[status])}</option>`).join("")}
                        </select>
                    </label>
                </section>

                ${this.renderRoadmapItems()}
            </div>
        `;
    }
}
