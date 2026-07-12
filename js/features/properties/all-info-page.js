import { LOCATIONS } from '../../shared/locations.js';
import { getEnumOptions } from '../../shared/enums.js';
import { i18n } from '../../core/i18n.js';
import { compareAlojamentosProperties, parseAhWorkbookImport, parseAlojamentosRows } from './property-import-utils.js';

const ALL_INFO_CATEGORIES = [
    { title: 'Basic Information', titlePt: 'Informação básica', slug: 'basic-info-edit', fields: ['location', 'type', 'typology', 'rooms', 'bathrooms', 'floor'], icon: 'fas fa-info-circle' },
    { title: 'Maps & Location', titlePt: 'Mapas e localização', slug: 'maps-location', fields: ['googleMapsLink', 'garbageLocationLink', 'garbageFloor'], icon: 'fas fa-map-marker-alt' },
    { title: 'Access & Parking', titlePt: 'Acesso e estacionamento', slug: 'access-parking', fields: ['keyBoxCode', 'parkingSpot', 'parkingFloor'], icon: 'fas fa-parking' },
    { title: 'Media & Content', titlePt: 'Media e conteúdo', slug: 'media-content', fields: ['checkinVideos', 'bookingDescriptionStatus', 'selfCheckinInstructions', 'dronePhotos'], icon: 'fas fa-video' },
    { title: 'Google Drive', titlePt: 'Google Drive', slug: 'google-drive', fields: ['googleDriveEnabled', 'googleDriveLink', 'scannedDocsLink'], icon: 'fab fa-google-drive' },
    { title: 'Recommendations', titlePt: 'Recomendações', slug: 'recommendations', fields: ['recommendationsLink', 'recommendationsEditLink'], icon: 'fas fa-star' },
    { title: 'Frames', titlePt: 'Molduras', slug: 'frames', fields: ['wifiFrame', 'recommendationsFrame', 'investmentFrame', 'homeGuide'], icon: 'fas fa-border-all' },
    { title: 'Signage', titlePt: 'Sinalética', slug: 'signage', fields: ['privateSign', 'noSmokingSign', 'noJunkMailSign', 'noiseSign', 'alAhSign', 'keysNotice', 'wcSign', 'signageNotes'], icon: 'fas fa-sign' },
    { title: 'Equipment', titlePt: 'Equipamento', slug: 'equipment', fields: ['airConditioning', 'fans', 'heaters', 'crib', 'cribMattress', 'babyChair', 'smartTv', 'coffeeMachine'], icon: 'fas fa-toolbox' },
    { title: 'Services & Extras', titlePt: 'Serviços e extras', slug: 'services-extras', fields: ['breakfastBox', 'poolMaintenanceDay', 'poolMaintenanceNotes'], icon: 'fas fa-concierge-bell' },
    { title: 'Connectivity & Utilities', titlePt: 'Internet e utilidades', slug: 'connectivity-utilities', fields: ['wifiSpeed', 'wifiAirbnb', 'internetProvider', 'energySource'], icon: 'fas fa-wifi' },
    { title: 'Online Services', titlePt: 'Serviços online', slug: 'online-services', fields: ['onlineComplaintBooksEnabled', 'onlineComplaintBooksEmail', 'onlineComplaintBooksPassword', 'airbnbLinksStatus'], icon: 'fas fa-globe' },
    { title: 'Legal & Compliance', titlePt: 'Legal e conformidade', slug: 'legal-compliance', fields: ['contractsStatus', 'complaintBooksStatus', 'statisticsStatus', 'sefStatus', 'touristTaxInstructions'], icon: 'fas fa-gavel' },
    { title: 'RNAL & Insurance', titlePt: 'RNAL e Seguro', slug: 'rnal-insurance', fields: ['rnalNumber', 'rnalHandledByUs', 'rnalDoneStatus', 'insuranceChargedStatus', 'insurancePlatformStatus', 'insuranceValidity', 'insuranceNotes', 'insuranceAccounting'], icon: 'fas fa-file-contract' },
    { title: 'Safety Maintenance', titlePt: 'Segurança e manutenção', slug: 'safety-maintenance', fields: ['fireExtinguisherExpiration', 'fireExtinguisherLocation', 'fireExtinguisherNotes', 'firstAidStatus', 'firstAidLastChecked', 'firstAidNotes'], icon: 'fas fa-shield-alt' },
    { title: 'Owner', titlePt: 'Proprietário', slug: 'owner', fields: ['ownerFirstName', 'ownerLastName', 'ownerVatNumber', 'ownerPropertyAddress', 'ownerContact'], icon: 'fas fa-user-tie' },
    { title: 'Accounting', titlePt: 'Contabilidade', slug: 'accounting', fields: ['accountingName', 'accountingPhone', 'accountingEmail', 'accountingContact'], icon: 'fas fa-file-invoice-dollar' },
    { title: 'Cleaning', titlePt: 'Limpeza', slug: 'contacts', fields: ['cleaningCompanyContact', 'cleaningCompanyPrice', 'guestCleaningFee'], icon: 'fas fa-broom' },
    { title: 'Condominium Information', titlePt: 'Informação do condomínio', slug: 'condominium-info', fields: ['condominiumName', 'condominiumEmail', 'condominiumPhone'], icon: 'fas fa-building' }
];

const IMPORTED_AH_CATEGORY_FIELDS = {
    'maps-location': ['googleMapsStatus', 'garbageLocationNotes', 'locationNotes'],
    'media-content': ['checkinVideoLinks', 'checkinVideoNotes', 'bookingDescriptionNewStatus', 'avantioDescriptionStatus', 'bookingDescriptionNotes'],
    recommendations: ['recommendationsStatus', 'recommendationsNotes'],
    'online-services': ['airbnbLinksNotes'],
    'legal-compliance': [
        'contractSignedStatus', 'contractScannedStatus', 'contractNotes',
        'sefStatisticsNotes',
        'touristTaxMunicipality', 'touristTaxPlatformStatus', 'touristTaxNotes',
        'propertyRegisterNumber', 'propertyRegisterAirbnbStatus', 'propertyRegisterBookingStatus', 'propertyRegisterBenefitsStatus'
    ]
};

ALL_INFO_CATEGORIES.forEach((category) => {
    const fields = IMPORTED_AH_CATEGORY_FIELDS[category.slug] || [];
    fields.forEach((field) => {
        if (!category.fields.includes(field)) {
            category.fields.push(field);
        }
    });
});

ALL_INFO_CATEGORIES.splice(ALL_INFO_CATEGORIES.length - 2, 0, {
    title: 'Keys & House Rules',
    titlePt: 'Chaves e regras',
    slug: 'keys-house-rules',
    fields: [
        'keysEntrance', 'keysHouse', 'keysRemote', 'keysOther', 'keysInventoryNotes',
        'houseRulesStatus', 'nearestHospitalLink', 'nearestHospitalHours', 'busStopLink', 'busScheduleLink', 'houseRulesNotes'
    ],
    icon: 'fas fa-key'
});

const COPY = {
    en: {
        propertyName: 'Property Name',
        filterProperties: 'Filter properties',
        filterPlaceholder: 'Filter properties...',
        rows: 'Rows',
        allRows: 'All rows',
        needsInfo: 'Needs info',
        complete: 'Complete',
        field: 'Field',
        allFields: 'All fields',
        searchCategories: 'Search categories...',
        workspace: {
            table: 'Table',
            missing: 'Missing data',
            compare: 'Alojamentos check',
            edit: 'Edit tools'
        },
        editToolsTitle: 'Choose an edit mode',
        editToolsBody: 'Use Bulk Edit for many properties, Sequential Edit for one-by-one review, or Accordion Edit for full category forms.',
        overview: {
            properties: 'properties',
            basicComplete: 'basic info complete',
            missingFields: 'missing fields',
            categoriesReview: 'categories need review'
        },
        missing: {
            eyebrow: 'Missing data',
            title: 'Quick fix queue',
            empty: 'No missing fields in this view.',
            summary: '{{count}} missing field{{plural}} found. Fill the values below and save one row or all filled rows.',
            more: 'Showing {{shown}} of {{total}}. Use the field filter to narrow this queue.',
            save: 'Save',
            saveFilled: 'Save filled',
            saving: 'Saving',
            saved: 'Saved',
            retry: 'Retry',
            noManager: 'No manager'
        },
        compare: {
            title: 'Alojamentos check',
            description: 'Upload the AH workbook to compare the Alojamentos sheet against the properties already in the app.',
            reading: 'Reading workbook...',
            parserError: 'Excel parser is not available. Reload the page and try again.',
            checked: 'Checked "{{sheet}}" from {{file}}. App currently has {{count}} properties.',
            unreadRows: '{{count}} workbook rows could not be read.',
            missingInApp: 'Missing in app',
            onlyInApp: 'Only in app',
            changedFields: 'Changed fields',
            noMissing: 'No missing properties',
            noExtra: 'No extra app properties',
            noChanged: 'No location or typology differences',
            error: 'Could not check this file: {{message}}',
            workbook: 'Workbook',
            matched: 'Matched',
            changed: 'Changed',
            importable: 'Ready to import',
            fieldUpdates: 'Empty fields',
            skippedExisting: 'Existing fields skipped',
            replacedExisting: 'Existing fields to replace',
            importMode: 'Import mode',
            fillEmptyMode: 'Fill empty fields only',
            replaceExistingMode: 'Replace existing fields',
            replaceWarning: 'Replace mode will overwrite fields that already have values in the app.',
            importedSheets: 'Sheets',
            importButton: 'Save import and report',
            replaceButton: 'Save replacements and report',
            saveReportButton: 'Save report',
            importing: 'Saving...',
            imported: 'Import saved and report stored.',
            replaced: 'Replacements saved and report stored.',
            reportSaved: 'Report stored.',
            reportOnlySaved: 'No property fields were changed. Report stored only.',
            propertyFieldsSaved: '{{count}} property field{{plural}} saved.',
            switchToReplace: 'No empty fields are available in this mode. Choose "Replace existing fields" if you want to write workbook values into existing app fields.',
            noUpdates: 'No empty fields found for the supported workbook sheets.',
            missingRows: 'Rows not matched to an app property',
            unsupportedColumns: 'Unsupported columns',
            reportHistory: 'Saved import reports',
            noReports: 'No saved import reports yet.',
            ptOnly: 'Property imports are only available in Portuguese mode because source files use Portuguese headers.',
            importFailed: 'Import failed: {{message}}'
        },
        table: {
            visibleOf: '{{visible}} visible of {{total}} properties',
            complete: 'complete',
            missingFields: 'missing fields',
            completeRows: 'complete rows',
            actions: 'Actions',
            missing: 'Missing',
            save: 'Save',
            saved: 'Saved',
            saving: 'Saving',
            retry: 'Retry',
            noManager: 'No manager',
            fullPage: 'Full page',
            select: 'Select',
            yes: 'Yes',
            no: 'No'
        }
    },
    pt: {
        propertyName: 'Alojamento',
        filterProperties: 'Filtrar alojamentos',
        filterPlaceholder: 'Filtrar alojamentos...',
        rows: 'Linhas',
        allRows: 'Todas',
        needsInfo: 'Com falta',
        complete: 'Completas',
        field: 'Campo',
        allFields: 'Todos os campos',
        searchCategories: 'Pesquisar categorias...',
        workspace: {
            table: 'Tabela',
            missing: 'Dados em falta',
            compare: 'Verificar Alojamentos',
            edit: 'Ferramentas de edição'
        },
        editToolsTitle: 'Escolha um modo de edição',
        editToolsBody: 'Use Edição em massa para vários alojamentos, Edição sequencial para rever um a um, ou Acordeão para formulários completos da categoria.',
        overview: {
            properties: 'alojamentos',
            basicComplete: 'info. básica completa',
            missingFields: 'campos em falta',
            categoriesReview: 'categorias a rever'
        },
        missing: {
            eyebrow: 'Dados em falta',
            title: 'Fila de correção rápida',
            empty: 'Não há campos em falta nesta vista.',
            summary: '{{count}} campo{{plural}} em falta encontrado{{plural}}. Preencha os valores abaixo e grave uma linha ou todas as linhas preenchidas.',
            more: 'A mostrar {{shown}} de {{total}}. Use o filtro de campo para reduzir a lista.',
            save: 'Guardar',
            saveFilled: 'Guardar preenchidos',
            saving: 'A guardar',
            saved: 'Guardado',
            retry: 'Tentar novamente',
            noManager: 'Sem gestor'
        },
        compare: {
            title: 'Verificar Alojamentos',
            description: 'Carregue o ficheiro AH para comparar a folha Alojamentos com os alojamentos já existentes na app.',
            reading: 'A ler o ficheiro...',
            parserError: 'O leitor de Excel não está disponível. Recarregue a página e tente novamente.',
            checked: 'Verificada a folha "{{sheet}}" de {{file}}. A app tem atualmente {{count}} alojamentos.',
            unreadRows: '{{count}} linhas do ficheiro não puderam ser lidas.',
            missingInApp: 'Em falta na app',
            onlyInApp: 'Só na app',
            changedFields: 'Campos diferentes',
            noMissing: 'Sem alojamentos em falta',
            noExtra: 'Sem alojamentos extra na app',
            noChanged: 'Sem diferenças de localização ou tipologia',
            error: 'Não foi possível verificar este ficheiro: {{message}}',
            workbook: 'Ficheiro',
            matched: 'Correspondem',
            changed: 'Diferentes',
            importable: 'Pronto para importar',
            fieldUpdates: 'Campos vazios',
            skippedExisting: 'Campos existentes ignorados',
            replacedExisting: 'Campos existentes a substituir',
            importMode: 'Modo de importacao',
            fillEmptyMode: 'Preencher apenas campos vazios',
            replaceExistingMode: 'Substituir campos existentes',
            replaceWarning: 'O modo substituir vai gravar por cima de campos que ja tem valores na app.',
            importedSheets: 'Folhas',
            importButton: 'Guardar importacao e relatorio',
            replaceButton: 'Guardar substituicoes e relatorio',
            saveReportButton: 'Guardar relatorio',
            importing: 'A guardar...',
            imported: 'Importacao guardada e relatorio arquivado.',
            replaced: 'Substituicoes guardadas e relatorio arquivado.',
            reportSaved: 'Relatorio guardado.',
            reportOnlySaved: 'Nenhum campo do alojamento foi alterado. Apenas o relatorio foi guardado.',
            propertyFieldsSaved: '{{count}} campo{{plural}} do alojamento guardado{{plural}}.',
            switchToReplace: 'Nao existem campos vazios neste modo. Escolha "Substituir campos existentes" se quiser gravar os valores do ficheiro nos campos existentes da app.',
            noUpdates: 'Nao foram encontrados campos vazios para as folhas suportadas.',
            missingRows: 'Linhas sem alojamento correspondente na app',
            unsupportedColumns: 'Colunas nao suportadas',
            reportHistory: 'Relatorios de importacao guardados',
            noReports: 'Ainda nao existem relatorios de importacao guardados.',
            ptOnly: 'A importacao de alojamentos so esta disponivel em portugues porque os ficheiros usam cabecalhos em portugues.',
            importFailed: 'Importacao falhou: {{message}}'
        },
        table: {
            visibleOf: '{{visible}} visíveis de {{total}} alojamentos',
            complete: 'completo',
            missingFields: 'campos em falta',
            completeRows: 'linhas completas',
            actions: 'Ações',
            missing: 'Em falta',
            save: 'Guardar',
            saved: 'Guardado',
            saving: 'A guardar',
            retry: 'Tentar',
            noManager: 'Sem gestor',
            fullPage: 'Página completa',
            select: 'Selecionar',
            yes: 'Sim',
            no: 'Não'
        }
    }
};

const FIELD_LABELS_PT = {
    location: 'Localização',
    type: 'Tipo',
    typology: 'Tipologia',
    rooms: 'Quartos',
    bathrooms: 'Casas de banho',
    floor: 'Andar',
    googleMapsLink: 'Link Google Maps',
    garbageLocationLink: 'Link do lixo',
    garbageFloor: 'Andar do lixo',
    keyBoxCode: 'Código da caixa',
    parkingSpot: 'Lugar de estacionamento',
    parkingFloor: 'Piso do estacionamento',
    checkinVideos: 'Vídeos de check-in',
    bookingDescriptionStatus: 'Estado da descrição Booking',
    selfCheckinInstructions: 'Instruções self check-in',
    googleDriveEnabled: 'Google Drive ativo',
    googleDriveLink: 'Link Google Drive',
    scannedDocsLink: 'Link documentos digitalizados',
    recommendationsLink: 'Link recomendações',
    recommendationsEditLink: 'Link editar recomendações',
    wifiFrame: 'Moldura Wi-Fi',
    recommendationsFrame: 'Moldura recomendações',
    investmentFrame: 'Moldura investimento',
    privateSign: 'Placa privado',
    noSmokingSign: 'Placa não fumar',
    noJunkMailSign: 'Placa publicidade',
    noiseSign: 'Placa do ruído',
    alAhSign: 'Placa AL/AH',
    keysNotice: 'Aviso chaves',
    wcSign: 'Placa WC',
    signageNotes: 'Notas sinalética',
    airConditioning: 'Ar condicionado',
    fans: 'Ventoinhas',
    heaters: 'Aquecedores',
    crib: 'Berço',
    cribMattress: 'Colchão berço',
    babyChair: 'Cadeira bebé',
    breakfastBox: 'Caixa pequeno-almoço',
    poolMaintenanceDay: 'Dia manutenção piscina',
    poolMaintenanceNotes: 'Notas manutenção piscina',
    wifiSpeed: 'Velocidade Wi-Fi',
    wifiAirbnb: 'Wi-Fi Airbnb',
    internetProvider: 'Fornecedor internet',
    energySource: 'Fonte de energia',
    onlineComplaintBooksEnabled: 'Livro reclamações online ativo',
    onlineComplaintBooksEmail: 'Email livro reclamações',
    onlineComplaintBooksPassword: 'Password livro reclamações',
    airbnbLinksStatus: 'Estado links Airbnb',
    contractsStatus: 'Estado contratos',
    complaintBooksStatus: 'Estado livro reclamações',
    statisticsStatus: 'Estado estatísticas',
    sefStatus: 'Estado SEF',
    touristTaxInstructions: 'Instruções taxa turística',
    fireExtinguisherExpiration: 'Validade extintor',
    fireExtinguisherLocation: 'Localização extintor',
    fireExtinguisherNotes: 'Notas extintor',
    firstAidStatus: 'Estado kit primeiros socorros',
    firstAidLastChecked: 'Última verificação kit',
    firstAidNotes: 'Notas kit primeiros socorros',
    ownerFirstName: 'Nome proprietário',
    ownerLastName: 'Apelido proprietário',
    ownerVatNumber: 'NIF proprietário',
    ownerPropertyAddress: 'Morada propriedade',
    ownerContact: 'Contacto proprietário',
    accountingName: 'Nome contabilidade',
    accountingPhone: 'Telefone contabilidade',
    accountingEmail: 'Email contabilidade',
    accountingContact: 'Contacto contabilidade',
    cleaningCompanyContact: 'Empresa limpeza',
    cleaningCompanyPrice: 'Preço limpeza',
    guestCleaningFee: 'Taxa limpeza hóspede',
    condominiumName: 'Nome condomínio',
    condominiumEmail: 'Email condomínio',
    condominiumPhone: 'Telefone condomínio',
    smartTv: 'Smart TV',
    coffeeMachine: 'Máquina de café',
    dronePhotos: 'Fotos de drone',
    homeGuide: 'Guia da casa'
};

Object.assign(FIELD_LABELS_PT, {
    googleMapsStatus: 'Estado Google Maps',
    garbageLocationNotes: 'Notas local do lixo',
    locationNotes: 'Notas localizacao',
    checkinVideoLinks: 'Links videos check-in',
    checkinVideoNotes: 'Notas videos check-in',
    bookingDescriptionNewStatus: 'Estado novas descricoes',
    avantioDescriptionStatus: 'Estado Avantio',
    bookingDescriptionNotes: 'Notas descricoes',
    recommendationsStatus: 'Estado recomendacoes',
    recommendationsNotes: 'Notas recomendacoes',
    airbnbLinksNotes: 'Notas Airbnb',
    contractSignedStatus: 'Contrato assinado',
    contractScannedStatus: 'Contrato digitalizado',
    contractNotes: 'Notas contrato',
    sefStatisticsNotes: 'Notas SEF/estatistica',
    touristTaxMunicipality: 'Concelho taxa turistica',
    touristTaxPlatformStatus: 'Estado plataforma taxa',
    touristTaxNotes: 'Notas taxa turistica',
    propertyRegisterNumber: 'Numero caderneta',
    propertyRegisterAirbnbStatus: 'Caderneta Airbnb',
    propertyRegisterBookingStatus: 'Caderneta Booking',
    propertyRegisterBenefitsStatus: 'Beneficios adicionais',
    rnalNumber: 'Numero AL/RNAL',
    rnalHandledByUs: 'RNAL feito por nos',
    rnalDoneStatus: 'RNAL concluido',
    insuranceChargedStatus: 'Seguro cobrado',
    insurancePlatformStatus: 'Seguro na plataforma',
    insuranceValidity: 'Validade seguro',
    insuranceNotes: 'Notas seguro',
    insuranceAccounting: 'Contabilidade seguro',
    keysEntrance: 'Chaves entrada',
    keysHouse: 'Chaves casa',
    keysRemote: 'Comando',
    keysOther: 'Outras chaves',
    keysInventoryNotes: 'Notas inventario chaves',
    houseRulesStatus: 'Estado regras casa',
    nearestHospitalLink: 'Unidade hospitalar',
    nearestHospitalHours: 'Horario hospital',
    busStopLink: 'Paragem autocarro',
    busScheduleLink: 'Horario autocarro',
    houseRulesNotes: 'Notas regras casa'
});

function activeLang() {
    return i18n?.getCurrentLanguage?.() === 'pt' ? 'pt' : 'en';
}

function copy(path, replacements = {}) {
    const table = COPY[activeLang()] || COPY.en;
    let value = path.split('.').reduce((entry, key) => entry?.[key], table)
        ?? path.split('.').reduce((entry, key) => entry?.[key], COPY.en)
        ?? path;

    Object.entries(replacements).forEach(([key, replacement]) => {
        value = value.replace(new RegExp(`{{${key}}}`, 'g'), replacement);
    });

    return value;
}

function getCategoryTitle(category) {
    return activeLang() === 'pt' ? (category.titlePt || category.title) : category.title;
}

function buildLabel(key) {
    if (key === 'name') {
        return copy('propertyName');
    }

    if (activeLang() === 'pt' && FIELD_LABELS_PT[key]) {
        return FIELD_LABELS_PT[key];
    }

    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());
}

// Old enum values that were stored for wifiSpeed before it became free-text.
// Treat them as effectively missing so the field is highlighted and re-importable.
const STALE_WIFI_SPEED_VALUES = new Set(['basic', 'standard', 'fast', 'very-fast', 'fiber']);

function isMissingValue(value, field = '') {
    if (value === undefined || value === null || String(value).trim() === '') return true;
    if (field === 'wifiSpeed' && STALE_WIFI_SPEED_VALUES.has(String(value).trim())) return true;
    return false;
}

function getCategoryStats(properties, category) {
    const fields = category?.fields ?? [];
    const totalFields = properties.length * fields.length;
    let missingFields = 0;
    let completeProperties = 0;

    properties.forEach((property) => {
        const missingForProperty = fields.filter((field) => isMissingValue(property[field], field)).length;
        missingFields += missingForProperty;
        if (missingForProperty === 0) {
            completeProperties += 1;
        }
    });

    return {
        completeFields: Math.max(totalFields - missingFields, 0),
        completeProperties,
        missingFields,
        totalFields,
        completion: totalFields > 0 ? Math.round(((totalFields - missingFields) / totalFields) * 100) : 100
    };
}

function propertyMatchesCategoryFilter(property, category, mode, fieldKey = '') {
    if (mode === 'all') {
        return true;
    }

    const fields = fieldKey ? [fieldKey] : category.fields;
    const missingCount = fields.filter((field) => isMissingValue(property[field], field)).length;

    if (mode === 'missing') {
        return missingCount > 0;
    }

    if (mode === 'complete') {
        return missingCount === 0;
    }

    return true;
}

function isNumericField(field) {
    return ['cleaningCompanyPrice', 'guestCleaningFee', 'rooms', 'bathrooms', 'checkinVideos'].includes(field);
}

function isBooleanField(field) {
    return false;
}

function isUrlField(field) {
    return /(Link|Url)$/i.test(field);
}

function normalizeHref(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '';
    }

    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
        const url = new URL(withProtocol);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (error) {
        return '';
    }
}

function normalizeInlineValue(input) {
    let value = input.value;

    if (input.tagName === 'INPUT' && input.type === 'number') {
        const numericValue = Number.parseFloat(value);
        return Number.isFinite(numericValue) ? numericValue : null;
    }

    if (input.tagName === 'SELECT' && input.dataset.boolean === 'true') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return '';
    }

    return value;
}

function createInlineFieldControl(documentRef, field, value) {
    const enumOptions = getEnumOptions(field);
    // Blank out stale wifiSpeed enum values so the free-text input shows the placeholder
    const resolvedValue = (field === 'wifiSpeed' && STALE_WIFI_SPEED_VALUES.has(String(value ?? '').trim()))
        ? ''
        : (value ?? '');
    const currentValue = resolvedValue;

    if (field === 'location') {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        [''].concat(LOCATIONS || []).forEach((location) => {
            const option = documentRef.createElement('option');
            option.value = location;
            option.textContent = location || 'Select location';
            option.selected = location === currentValue;
            select.appendChild(option);
        });
        return select;
    }

    if (isBooleanField(field)) {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        select.dataset.boolean = 'true';
        [
            ['', 'Select'],
            ['true', copy('table.yes')],
            ['false', copy('table.no')]
        ].forEach(([optionValue, label]) => {
            const option = documentRef.createElement('option');
            option.value = optionValue;
            option.textContent = label;
            option.selected = String(currentValue) === optionValue;
            select.appendChild(option);
        });
        return select;
    }

    if (enumOptions) {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        const blankOption = documentRef.createElement('option');
        blankOption.value = '';
        blankOption.textContent = copy('table.select');
        select.appendChild(blankOption);

        enumOptions.forEach((entry) => {
            const option = documentRef.createElement('option');
            option.value = entry.value;
            option.textContent = entry.label;
            option.selected = entry.value === currentValue;
            select.appendChild(option);
        });
        return select;
    }

    const input = documentRef.createElement('input');
    input.className = 'allinfo-inline-input';
    input.type = isNumericField(field) ? 'number' : (isUrlField(field) ? 'url' : 'text');
    if (input.type === 'number') {
        input.step = '0.01';
    }
    input.value = currentValue;
    input.placeholder = buildLabel(field);
    return input;
}

function appendInlineFieldControl(documentRef, cell, input, field) {
    if (!isUrlField(field) || input.tagName !== 'INPUT') {
        cell.appendChild(input);
        return;
    }

    const wrapper = documentRef.createElement('div');
    wrapper.className = 'allinfo-link-control';

    const openLink = documentRef.createElement('a');
    openLink.className = 'allinfo-link-open';
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.innerHTML = '<i class="fas fa-up-right-from-square"></i><span>Open</span>';

    const updateOpenLink = () => {
        const href = normalizeHref(input.value);
        if (href) {
            openLink.href = href;
            openLink.title = href;
            openLink.removeAttribute('aria-disabled');
            openLink.removeAttribute('tabindex');
        } else {
            openLink.removeAttribute('href');
            openLink.title = 'Add a link to open it';
            openLink.setAttribute('aria-disabled', 'true');
            openLink.setAttribute('tabindex', '-1');
        }
    };

    openLink.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!openLink.href) {
            event.preventDefault();
        }
    });
    input.addEventListener('input', updateOpenLink);
    input.addEventListener('change', updateOpenLink);
    updateOpenLink();

    wrapper.appendChild(input);
    wrapper.appendChild(openLink);
    cell.appendChild(wrapper);
}

function sortTable(table, columnIndex, ascending) {
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        return;
    }

    const getCellValue = (cell) => {
        const control = cell?.querySelector?.('input, select, textarea');
        if (control) {
            if (control.tagName === 'SELECT') {
                return control.selectedOptions?.[0]?.textContent?.trim() || control.value || '';
            }
            return control.value ?? '';
        }

        return cell?.textContent?.trim() ?? '';
    };

    Array.from(tbody.querySelectorAll('tr'))
        .sort((leftRow, rightRow) => {
            const leftCell = leftRow.cells[columnIndex];
            const rightCell = rightRow.cells[columnIndex];
            const leftSortValue = leftCell?.dataset?.sort;
            const rightSortValue = rightCell?.dataset?.sort;

            if (leftSortValue !== undefined || rightSortValue !== undefined) {
                const leftNumber = Number.parseFloat(leftSortValue ?? '0');
                const rightNumber = Number.parseFloat(rightSortValue ?? '0');
                return ascending ? leftNumber - rightNumber : rightNumber - leftNumber;
            }

            const leftText = getCellValue(leftCell);
            const rightText = getCellValue(rightCell);
            return ascending
                ? leftText.localeCompare(rightText, undefined, { numeric: true })
                : rightText.localeCompare(leftText, undefined, { numeric: true });
        })
        .forEach((row) => tbody.appendChild(row));
}

function createSearchBars(documentRef) {
    const searchBarsContainer = documentRef.createElement('div');
    searchBarsContainer.className = 'search-bars-container';

    const propertyFilterWrapper = documentRef.createElement('div');
    propertyFilterWrapper.className = 'allinfo-search-control flex-1';

    const propertyFilterLabel = documentRef.createElement('label');
    propertyFilterLabel.textContent = copy('filterProperties');
    propertyFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const propertyFilterInput = documentRef.createElement('input');
    propertyFilterInput.id = 'allinfo-filter';
    propertyFilterInput.type = 'text';
    propertyFilterInput.placeholder = copy('filterPlaceholder');
    propertyFilterInput.className = 'px-3 py-2 border rounded-md w-full';

    propertyFilterWrapper.appendChild(propertyFilterLabel);
    propertyFilterWrapper.appendChild(propertyFilterInput);

    const dataFilterWrapper = documentRef.createElement('div');
    dataFilterWrapper.className = 'allinfo-compact-control';

    const dataFilterLabel = documentRef.createElement('label');
    dataFilterLabel.textContent = copy('rows');
    dataFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const dataFilterSelect = documentRef.createElement('select');
    dataFilterSelect.id = 'allinfo-data-filter';
    dataFilterSelect.className = 'px-3 py-2 border rounded-md w-full';
    [
        ['all', copy('allRows')],
        ['missing', copy('needsInfo')],
        ['complete', copy('complete')]
    ].forEach(([value, label]) => {
        const option = documentRef.createElement('option');
        option.value = value;
        option.textContent = label;
        dataFilterSelect.appendChild(option);
    });

    dataFilterWrapper.appendChild(dataFilterLabel);
    dataFilterWrapper.appendChild(dataFilterSelect);

    const fieldFilterWrapper = documentRef.createElement('div');
    fieldFilterWrapper.className = 'allinfo-compact-control';

    const fieldFilterLabel = documentRef.createElement('label');
    fieldFilterLabel.textContent = copy('field');
    fieldFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const fieldFilterSelect = documentRef.createElement('select');
    fieldFilterSelect.id = 'allinfo-field-filter';
    fieldFilterSelect.className = 'px-3 py-2 border rounded-md w-full';

    fieldFilterWrapper.appendChild(fieldFilterLabel);
    fieldFilterWrapper.appendChild(fieldFilterSelect);

    searchBarsContainer.appendChild(propertyFilterWrapper);
    searchBarsContainer.appendChild(dataFilterWrapper);
    searchBarsContainer.appendChild(fieldFilterWrapper);

    return {
        searchBarsContainer,
        propertyFilterInput,
        dataFilterSelect,
        fieldFilterSelect
    };
}

function createMetric(documentRef, label, value, tone = 'gray') {
    const metric = documentRef.createElement('div');
    const toneClasses = {
        green: 'border-green-200 bg-green-50 text-green-700',
        orange: 'border-orange-200 bg-orange-50 text-orange-700',
        red: 'border-red-200 bg-red-50 text-red-700',
        blue: 'border-blue-200 bg-blue-50 text-blue-700',
        gray: 'border-gray-200 bg-gray-50 text-gray-700'
    };
    metric.className = `rounded-md border px-4 py-3 ${toneClasses[tone] || toneClasses.gray}`;

    const valueElement = documentRef.createElement('div');
    valueElement.className = 'text-2xl font-semibold leading-tight';
    valueElement.textContent = String(value);

    const labelElement = documentRef.createElement('div');
    labelElement.className = 'text-xs font-medium uppercase tracking-wide';
    labelElement.textContent = label;

    metric.appendChild(valueElement);
    metric.appendChild(labelElement);
    return metric;
}

function renderSimpleList(documentRef, container, title, items, renderItem, emptyText) {
    const section = documentRef.createElement('section');
    section.className = 'min-w-0';

    const heading = documentRef.createElement('h4');
    heading.className = 'text-sm font-semibold text-gray-900 mb-2';
    heading.textContent = title;
    section.appendChild(heading);

    const list = documentRef.createElement('div');
    list.className = 'max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100';

    if (items.length === 0) {
        const empty = documentRef.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500';
        empty.textContent = emptyText;
        list.appendChild(empty);
    } else {
        items.slice(0, 40).forEach((item) => {
            const row = documentRef.createElement('div');
            row.className = 'px-3 py-2 text-sm text-gray-700';
            row.textContent = renderItem(item);
            list.appendChild(row);
        });

        if (items.length > 40) {
            const more = documentRef.createElement('div');
            more.className = 'px-3 py-2 text-xs text-gray-500';
            more.textContent = `Showing 40 of ${items.length}`;
            list.appendChild(more);
        }
    }

    section.appendChild(list);
    container.appendChild(section);
}

const PROPERTY_IMPORT_REPORTS_KEY = 'propertyImportReports';

function getStoredPropertyImportReports(windowRef = window) {
    try {
        return JSON.parse(windowRef.localStorage?.getItem(PROPERTY_IMPORT_REPORTS_KEY) || '[]');
    } catch (error) {
        return [];
    }
}

function storePropertyImportReport(report, windowRef = window) {
    const reports = getStoredPropertyImportReports(windowRef);
    const nextReports = [report, ...reports].slice(0, 25);
    try {
        windowRef.localStorage?.setItem(PROPERTY_IMPORT_REPORTS_KEY, JSON.stringify(nextReports));
    } catch (error) {
        console.warn('Could not store property import report locally', error);
    }
    return nextReports;
}

function summarizeReportLine(report) {
    const date = report.savedAt ? new Date(report.savedAt).toLocaleString() : '';
    return `${date} - ${report.fileName || 'Workbook'} - ${report.mode} - ${report.totals?.fieldsToUpdate || 0} fields, ${report.totals?.missingInApp || 0} unmatched`;
}

function appendReportDetailList(documentRef, container, title, items, renderItem, emptyText) {
    const section = documentRef.createElement('div');
    section.className = 'mt-3';
    const heading = documentRef.createElement('div');
    heading.className = 'text-xs font-semibold uppercase text-gray-500 mb-1';
    heading.textContent = title;
    section.appendChild(heading);

    const list = documentRef.createElement('div');
    list.className = 'max-h-40 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100 bg-white';
    if (!items?.length) {
        const empty = documentRef.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500';
        empty.textContent = emptyText;
        list.appendChild(empty);
    } else {
        items.slice(0, 80).forEach((item) => {
            const row = documentRef.createElement('div');
            row.className = 'px-3 py-2 text-sm text-gray-700';
            row.textContent = renderItem(item);
            list.appendChild(row);
        });
    }
    section.appendChild(list);
    container.appendChild(section);
}

function buildPropertyImportReport({ file, mode, workbookImport, status, firestoreReportId = '', saveError = '' }) {
    return {
        id: `property-import-${Date.now()}`,
        savedAt: new Date().toISOString(),
        fileName: file?.name || '',
        mode,
        status,
        firestoreReportId,
        saveError,
        totals: workbookImport.totals,
        processedSheets: workbookImport.processedSheets,
        appliedChanges: workbookImport.appliedChanges,
        skippedExisting: workbookImport.skippedExisting,
        noChange: workbookImport.noChange,
        missingInApp: workbookImport.missingInApp,
        unsupportedColumns: workbookImport.unsupportedColumns,
        errors: workbookImport.errors
    };
}

function renderReportHistory(documentRef, container, windowRef = window) {
    const reports = getStoredPropertyImportReports(windowRef);
    const history = documentRef.createElement('div');
    history.className = 'rounded-lg border border-gray-200 bg-white p-4';
    const heading = documentRef.createElement('h4');
    heading.className = 'text-sm font-semibold text-gray-900 mb-2';
    heading.textContent = copy('compare.reportHistory');
    history.appendChild(heading);

    if (!reports.length) {
        const empty = documentRef.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500 rounded-md border border-gray-200';
        empty.textContent = copy('compare.noReports');
        history.appendChild(empty);
    } else {
        reports.forEach((report) => {
            const details = documentRef.createElement('details');
            details.className = 'rounded-md border border-gray-200 bg-gray-50 p-3 mb-2';
            const summary = documentRef.createElement('summary');
            summary.className = 'cursor-pointer text-sm font-medium text-gray-800';
            summary.textContent = summarizeReportLine(report);
            details.appendChild(summary);

            const meta = documentRef.createElement('div');
            meta.className = 'mt-2 text-xs text-gray-600';
            meta.textContent = `Status: ${report.status || '-'} | Firestore report: ${report.firestoreReportId || 'not saved'}${report.saveError ? ` | Save error: ${report.saveError}` : ''}`;
            details.appendChild(meta);

            appendReportDetailList(
                documentRef,
                details,
                'Saved / changed fields',
                report.appliedChanges,
                (entry) => `${entry.propertyName} - ${buildLabel(entry.field)}: ${entry.previousValue || '-'} -> ${entry.newValue || '-'} (${entry.sheet} row ${entry.rowNumber})`,
                'No property fields changed.'
            );
            appendReportDetailList(
                documentRef,
                details,
                'Skipped existing fields',
                report.skippedExisting,
                (entry) => `${entry.propertyName} - ${buildLabel(entry.field)} kept "${entry.existingValue || '-'}"; workbook had "${entry.workbookValue || '-'}"`,
                'No existing fields skipped.'
            );
            appendReportDetailList(
                documentRef,
                details,
                copy('compare.missingRows'),
                report.missingInApp,
                (entry) => `${entry.name} (${entry.sheet} row ${entry.rowNumber})`,
                copy('compare.noMissing')
            );
            appendReportDetailList(
                documentRef,
                details,
                copy('compare.unsupportedColumns'),
                report.unsupportedColumns,
                (entry) => `${entry.sheet}: ${entry.column}`,
                copy('compare.noChanged')
            );
            history.appendChild(details);
        });
    }
    container.appendChild(history);
}

function createAlojamentosCheckPanel({ documentRef, properties, onImportSaved = () => {} }) {
    const panel = documentRef.createElement('section');
    panel.className = 'mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm';
    const ptMode = activeLang() === 'pt';

    const header = documentRef.createElement('div');
    header.className = 'flex flex-col lg:flex-row lg:items-end justify-between gap-4';

    const copyBlock = documentRef.createElement('div');
    const title = documentRef.createElement('h3');
    title.className = 'text-base font-semibold text-gray-900';
    title.textContent = copy('compare.title');
    const description = documentRef.createElement('p');
    description.className = 'text-sm text-gray-600 mt-1';
    description.textContent = copy('compare.description');
    copyBlock.appendChild(title);
    copyBlock.appendChild(description);

    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.disabled = !ptMode;
    input.className = 'w-full lg:w-80 text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200';

    const clearWifiBtn = documentRef.createElement('button');
    clearWifiBtn.type = 'button';
    clearWifiBtn.className = 'px-4 py-2 border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 rounded-md text-sm font-medium transition-colors flex items-center gap-2';
    clearWifiBtn.innerHTML = ptMode
        ? '<i class="fas fa-trash-can"></i><span>Limpar Dados de WiFi</span>'
        : '<i class="fas fa-trash-can"></i><span>Clear WiFi Data</span>';
    clearWifiBtn.onclick = async () => {
        const manager = window.propertiesManager;
        if (!manager?.updatePropertiesBatchMixed) {
            alert('Properties manager not initialized.');
            return;
        }

        const confirmMsg = ptMode 
            ? 'Tem a certeza de que deseja limpar os campos "WiFi Speed" e "WiFi Airbnb" de todos os alojamentos? Isto permitirá importá-los novamente a partir do ficheiro Excel.'
            : 'Are you sure you want to clear the "WiFi Speed" and "WiFi Airbnb" fields for all properties? This will empty the fields so you can import them again from the Excel file.';

        if (!confirm(confirmMsg)) {
            return;
        }

        clearWifiBtn.disabled = true;
        clearWifiBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Clearing...</span>';

        const updates = properties.map((p) => ({
            id: p.id,
            updates: {
                wifiSpeed: '',
                wifiAirbnb: ''
            }
        }));

        try {
            await manager.updatePropertiesBatchMixed(updates);
            properties.forEach((p) => {
                p.wifiSpeed = '';
                p.wifiAirbnb = '';
            });

            const successMsg = ptMode
                ? 'Os campos de WiFi foram limpos com sucesso! Agora pode importar a folha Excel para os preencher.'
                : 'WiFi fields cleared successfully! You can now import the Excel sheet to populate them.';

            alert(successMsg);
            if (typeof onImportSaved === 'function') {
                onImportSaved();
            }
        } catch (error) {
            console.error('Failed to clear WiFi fields', error);
            const errorMsg = ptMode
                ? 'Erro ao limpar os campos de WiFi. Consulte a consola para obter detalhes.'
                : 'Failed to clear WiFi fields. See console for details.';
            alert(errorMsg);
        } finally {
            clearWifiBtn.disabled = false;
            clearWifiBtn.innerHTML = ptMode
                ? '<i class="fas fa-trash-can"></i><span>Limpar Dados de WiFi</span>'
                : '<i class="fas fa-trash-can"></i><span>Clear WiFi Data</span>';
        }
    };

    const actionContainer = documentRef.createElement('div');
    actionContainer.className = 'flex flex-wrap items-center gap-3 w-full lg:w-auto mt-2 lg:mt-0';
    actionContainer.appendChild(input);
    actionContainer.appendChild(clearWifiBtn);

    header.appendChild(copyBlock);
    header.appendChild(actionContainer);
    panel.appendChild(header);

    const result = documentRef.createElement('div');
    result.className = ptMode ? 'mt-4 hidden' : 'mt-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700';
    if (!ptMode) {
        result.textContent = copy('compare.ptOnly');
    }
    panel.appendChild(result);

    const reportHistoryContainer = documentRef.createElement('div');
    panel.appendChild(reportHistoryContainer);
    const refreshReportHistory = () => {
        reportHistoryContainer.innerHTML = '';
        renderReportHistory(documentRef, reportHistoryContainer);
    };
    refreshReportHistory();

    const renderError = (message) => {
        result.className = 'mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700';
        result.textContent = message;
    };

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            renderError(copy('compare.parserError'));
            return;
        }

        result.className = 'mt-4 text-sm text-gray-600';
        result.textContent = copy('compare.reading');

        try {
            const isCsv = /\.csv$/i.test(file.name);
            const workbook = isCsv
                ? XLSX.read(await file.text(), { type: 'string', cellDates: true })
                : XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
            const sheetRowsByName = Object.fromEntries(workbook.SheetNames.map((name) => [
                name,
                XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true })
            ]));
            const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'alojamentos')
                ?? workbook.SheetNames.find((name) => name.toLowerCase().includes('alojamentos'))
                ?? workbook.SheetNames[0];
            const rows = sheetRowsByName[sheetName] ?? [];
            const parsed = parseAlojamentosRows(rows);
            const comparison = compareAlojamentosProperties(properties, parsed.properties);

            result.className = 'mt-4 space-y-4';
            result.innerHTML = '';

            const metrics = documentRef.createElement('div');
            metrics.className = 'grid grid-cols-2 md:grid-cols-5 gap-3';
            metrics.appendChild(createMetric(documentRef, copy('compare.workbook'), comparison.totals.imported, 'blue'));
            metrics.appendChild(createMetric(documentRef, copy('compare.matched'), comparison.totals.matched, 'green'));
            metrics.appendChild(createMetric(documentRef, copy('compare.missingInApp'), comparison.totals.missingInApp, comparison.totals.missingInApp ? 'red' : 'gray'));
            metrics.appendChild(createMetric(documentRef, copy('compare.onlyInApp'), comparison.totals.extraInApp, comparison.totals.extraInApp ? 'orange' : 'gray'));
            metrics.appendChild(createMetric(documentRef, copy('compare.changed'), comparison.totals.differences, comparison.totals.differences ? 'orange' : 'gray'));
            result.appendChild(metrics);

            const source = documentRef.createElement('p');
            source.className = 'text-xs text-gray-500';
            source.textContent = copy('compare.checked', { sheet: sheetName, file: file.name, count: comparison.totals.existing });
            result.appendChild(source);

            if (parsed.errors.length > 0) {
                const warning = documentRef.createElement('div');
                warning.className = 'rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700';
                warning.textContent = copy('compare.unreadRows', { count: parsed.errors.length });
                result.appendChild(warning);
            }

            const lists = documentRef.createElement('div');
            lists.className = 'grid grid-cols-1 lg:grid-cols-3 gap-4';
            renderSimpleList(
                documentRef,
                lists,
                copy('compare.missingInApp'),
                comparison.missingInApp,
                (property) => `${property.name} - ${property.location} - ${property.typology}`,
                copy('compare.noMissing')
            );
            renderSimpleList(
                documentRef,
                lists,
                copy('compare.onlyInApp'),
                comparison.extraInApp,
                (property) => `${property.name} - ${property.location || ''} - ${property.typology || property.type || ''}`,
                copy('compare.noExtra')
            );
            renderSimpleList(
                documentRef,
                lists,
                copy('compare.changedFields'),
                comparison.differences,
                (entry) => `${entry.name}: ${entry.fields.map((field) => `${field.field} ${field.existing || '-'} -> ${field.imported || '-'}`).join(', ')}`,
                copy('compare.noChanged')
            );
            result.appendChild(lists);

            const importPanel = documentRef.createElement('div');
            importPanel.className = 'rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-3';

            const modeRow = documentRef.createElement('div');
            modeRow.className = 'flex flex-col md:flex-row md:items-end gap-3';
            const modeWrapper = documentRef.createElement('label');
            modeWrapper.className = 'block text-sm font-semibold text-blue-950';
            modeWrapper.textContent = copy('compare.importMode');
            const modeSelect = documentRef.createElement('select');
            modeSelect.className = 'mt-1 block w-full md:w-72 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm text-gray-800';
            [
                ['fill-empty', copy('compare.fillEmptyMode')],
                ['replace-existing', copy('compare.replaceExistingMode')]
            ].forEach(([value, label]) => {
                const option = documentRef.createElement('option');
                option.value = value;
                option.textContent = label;
                modeSelect.appendChild(option);
            });
            modeWrapper.appendChild(modeSelect);
            modeRow.appendChild(modeWrapper);

            const modeWarning = documentRef.createElement('p');
            modeWarning.className = 'hidden rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800';
            modeWarning.textContent = copy('compare.replaceWarning');
            modeRow.appendChild(modeWarning);
            importPanel.appendChild(modeRow);

            const importPreview = documentRef.createElement('div');
            importPreview.className = 'space-y-3';
            importPanel.appendChild(importPreview);

            const importButton = documentRef.createElement('button');
            importButton.type = 'button';
            importButton.className = 'inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
            importPanel.appendChild(importButton);

            let activeWorkbookImport = null;

            const renderImportPreview = () => {
                const replaceExisting = modeSelect.value === 'replace-existing';
                activeWorkbookImport = parseAhWorkbookImport(sheetRowsByName, properties, { overwriteExisting: replaceExisting });
                importPreview.innerHTML = '';
                modeWarning.classList.toggle('hidden', !replaceExisting);

                const importMetrics = documentRef.createElement('div');
                importMetrics.className = 'grid grid-cols-2 md:grid-cols-5 gap-3';
                importMetrics.appendChild(createMetric(documentRef, copy('compare.importedSheets'), activeWorkbookImport.totals.sheets, 'blue'));
                importMetrics.appendChild(createMetric(documentRef, copy('compare.importable'), activeWorkbookImport.totals.propertiesToUpdate, activeWorkbookImport.totals.propertiesToUpdate ? 'green' : 'gray'));
                importMetrics.appendChild(createMetric(documentRef, copy('compare.fieldUpdates'), activeWorkbookImport.totals.fieldsToUpdate, activeWorkbookImport.totals.fieldsToUpdate ? 'green' : 'gray'));
                importMetrics.appendChild(createMetric(
                    documentRef,
                    replaceExisting ? copy('compare.replacedExisting') : copy('compare.skippedExisting'),
                    replaceExisting ? activeWorkbookImport.totals.replacedExistingFields : activeWorkbookImport.totals.skippedExistingFields,
                    (replaceExisting ? activeWorkbookImport.totals.replacedExistingFields : activeWorkbookImport.totals.skippedExistingFields) ? 'orange' : 'gray'
                ));
                importMetrics.appendChild(createMetric(documentRef, copy('compare.missingRows'), activeWorkbookImport.totals.missingInApp, activeWorkbookImport.totals.missingInApp ? 'orange' : 'gray'));
                importPreview.appendChild(importMetrics);

                const importSummary = documentRef.createElement('p');
                importSummary.className = 'text-sm text-blue-900';
                importSummary.textContent = activeWorkbookImport.totals.fieldsToUpdate > 0
                    ? `${activeWorkbookImport.importedFields.map(buildLabel).join(', ')}`
                    : `${copy('compare.noUpdates')} ${!replaceExisting && activeWorkbookImport.totals.skippedExistingFields > 0 ? copy('compare.switchToReplace') : ''}`.trim();
                importPreview.appendChild(importSummary);

                const importLists = documentRef.createElement('div');
                importLists.className = 'grid grid-cols-1 lg:grid-cols-3 gap-4';
                renderSimpleList(
                    documentRef,
                    importLists,
                    copy('compare.importable'),
                    activeWorkbookImport.updates,
                    (entry) => `${entry.property.name}: ${entry.fields.map(buildLabel).join(', ')}`,
                    copy('compare.noUpdates')
                );
                renderSimpleList(
                    documentRef,
                    importLists,
                    copy('compare.missingRows'),
                    activeWorkbookImport.missingInApp,
                    (entry) => `${entry.name} (${entry.sheet} row ${entry.rowNumber})`,
                    copy('compare.noMissing')
                );
                renderSimpleList(
                    documentRef,
                    importLists,
                    copy('compare.unsupportedColumns'),
                    activeWorkbookImport.unsupportedColumns,
                    (entry) => `${entry.sheet}: ${entry.column}`,
                    copy('compare.noChanged')
                );
                importPreview.appendChild(importLists);

                importButton.disabled = false;
                const buttonLabel = activeWorkbookImport.updates.length === 0
                    ? copy('compare.saveReportButton')
                    : (replaceExisting ? copy('compare.replaceButton') : copy('compare.importButton'));
                importButton.innerHTML = `<i class="fas fa-save"></i><span>${buttonLabel}</span>`;
            };

            modeSelect.addEventListener('change', renderImportPreview);
            renderImportPreview();

            importButton.addEventListener('click', async () => {
                const manager = window.propertiesManager;
                const replaceExisting = modeSelect.value === 'replace-existing';
                const workbookImport = activeWorkbookImport;
                if (!workbookImport) {
                    return;
                }
                if (workbookImport.updates.length > 0 && !manager?.updatePropertiesBatchMixed && !manager?.updateProperty) {
                    renderError(copy('missing.noManager'));
                    return;
                }

                importButton.disabled = true;
                importButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${copy('compare.importing')}</span>`;

                try {
                    const items = workbookImport.updates.map((entry) => ({
                        id: entry.property.id,
                        updates: entry.updates
                    }));

                    if (items.length > 0) {
                        if (manager.updatePropertiesBatchMixed) {
                            await manager.updatePropertiesBatchMixed(items);
                        } else {
                            for (const item of items) {
                                await manager.updateProperty(item.id, item.updates);
                            }
                        }
                    }

                    workbookImport.updates.forEach((entry) => {
                        Object.assign(entry.property, entry.updates);
                    });
                    let firestoreReportId = '';
                    let saveError = '';
                    const report = buildPropertyImportReport({
                        file,
                        mode: replaceExisting ? 'replace-existing' : 'fill-empty',
                        workbookImport,
                        status: items.length > 0 ? 'saved-with-updates' : 'report-only'
                    });

                    try {
                        firestoreReportId = await manager?.savePropertyImportReport?.(report) || '';
                        report.firestoreReportId = firestoreReportId;
                    } catch (error) {
                        saveError = error.message || String(error);
                        report.saveError = saveError;
                    }
                    storePropertyImportReport(report);
                    refreshReportHistory();

                    const savedFieldCount = workbookImport.totals.fieldsToUpdate || 0;
                    const savedMessage = savedFieldCount === 0
                        ? copy('compare.reportOnlySaved')
                        : `${replaceExisting ? copy('compare.replaced') : copy('compare.imported')} ${copy('compare.propertyFieldsSaved', { count: savedFieldCount, plural: savedFieldCount === 1 ? '' : 's' })}`;
                    importButton.innerHTML = `<i class="fas fa-check"></i><span>${savedMessage}</span>`;
                    onImportSaved();
                } catch (error) {
                    console.error('AH workbook import failed', error);
                    importButton.disabled = false;
                    importButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('compare.importFailed', { message: error.message })}</span>`;
                }
            });
            result.appendChild(importPanel);
        } catch (error) {
            renderError(copy('compare.error', { message: error.message }));
        }
    });

    return panel;
}

function createMissingWorkbench({
    documentRef,
    properties,
    getActiveCategory,
    getActiveField,
    onSaved
}) {
    const panel = documentRef.createElement('section');
    panel.className = 'allinfo-missing-workbench';

    const header = documentRef.createElement('div');
    header.className = 'allinfo-missing-header';
    header.innerHTML = `
        <div>
            <div class="allinfo-category-eyebrow">${copy('missing.eyebrow')}</div>
            <h3>${copy('missing.title')}</h3>
        </div>
        <div class="allinfo-missing-actions">
            <button type="button" id="allinfo-save-filled-missing" class="allinfo-missing-save-all" disabled>
                <i class="fas fa-check-double"></i><span>${copy('missing.saveFilled')}</span>
            </button>
        </div>
    `;

    const body = documentRef.createElement('div');
    body.className = 'allinfo-missing-body';

    panel.appendChild(header);
    panel.appendChild(body);

    const getMissingItems = () => {
        const category = getActiveCategory();
        const activeField = getActiveField();
        const fields = activeField ? [activeField] : category.fields;
        const items = [];

        properties.forEach((property) => {
            fields.forEach((field) => {
                if (isMissingValue(property[field])) {
                    items.push({ property, field, category });
                }
            });
        });

        return items;
    };

    const updateSaveAllState = () => {
        const saveAllButton = panel.querySelector('#allinfo-save-filled-missing');
        const hasFilledValues = Array.from(panel.querySelectorAll('[data-missing-field]')).some((input) => (
            !isMissingValue(normalizeInlineValue(input))
        ));
        if (saveAllButton) {
            saveAllButton.disabled = !hasFilledValues;
        }
    };

    const saveInput = async (input, button) => {
        const propertyId = input.dataset.propertyId;
        const field = input.dataset.missingField;
        const property = properties.find((entry) => entry.id === propertyId);
        const value = normalizeInlineValue(input);

        if (!property || !field || isMissingValue(value)) {
            return false;
        }

        const manager = window.propertiesManager;
        if (!manager?.updateProperty) {
            button.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('missing.noManager')}</span>`;
            return false;
        }

        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${copy('missing.saving')}</span>`;

        try {
            await manager.updateProperty(property.id, { [field]: value });
            property[field] = value;
            button.innerHTML = `<i class="fas fa-check"></i><span>${copy('missing.saved')}</span>`;
            return true;
        } catch (error) {
            console.error('Missing value save failed', error);
            button.disabled = false;
            button.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('missing.retry')}</span>`;
            return false;
        }
    };

    const render = () => {
        const category = getActiveCategory();
        const items = getMissingItems();
        const shownItems = items.slice(0, 80);

        body.innerHTML = '';
        header.querySelector('h3').textContent = `${getCategoryTitle(category)} - ${copy('missing.title')}`;

        if (items.length === 0) {
            const empty = documentRef.createElement('div');
            empty.className = 'allinfo-missing-empty';
            empty.innerHTML = `<i class="fas fa-circle-check"></i><span>${copy('missing.empty')}</span>`;
            body.appendChild(empty);
            updateSaveAllState();
            return;
        }

        const summary = documentRef.createElement('div');
        summary.className = 'allinfo-missing-summary';
        summary.textContent = copy('missing.summary', { count: items.length, plural: items.length === 1 ? '' : 's' });
        body.appendChild(summary);

        const list = documentRef.createElement('div');
        list.className = 'allinfo-missing-list';

        shownItems.forEach(({ property, field }) => {
            const item = documentRef.createElement('div');
            item.className = 'allinfo-missing-item';

            const label = documentRef.createElement('div');
            label.className = 'allinfo-missing-label';
            label.innerHTML = `
                <strong>${property.name || 'Unnamed property'}</strong>
                <span>${buildLabel(field)}</span>
            `;

            const input = createInlineFieldControl(documentRef, field, '');
            input.dataset.propertyId = property.id;
            input.dataset.missingField = field;
            input.addEventListener('input', updateSaveAllState);
            input.addEventListener('change', updateSaveAllState);

            const saveButton = documentRef.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'allinfo-missing-save';
            saveButton.innerHTML = `<i class="fas fa-save"></i><span>${copy('missing.save')}</span>`;
            saveButton.addEventListener('click', async () => {
                const saved = await saveInput(input, saveButton);
                if (saved) {
                    onSaved?.();
                }
            });

            item.appendChild(label);
            item.appendChild(input);
            item.appendChild(saveButton);
            list.appendChild(item);
        });

        if (items.length > shownItems.length) {
            const more = documentRef.createElement('div');
            more.className = 'allinfo-missing-more';
            more.textContent = copy('missing.more', { shown: shownItems.length, total: items.length });
            list.appendChild(more);
        }

        body.appendChild(list);
        updateSaveAllState();
    };

    header.querySelector('#allinfo-save-filled-missing')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const inputs = Array.from(panel.querySelectorAll('[data-missing-field]'))
            .filter((input) => !isMissingValue(normalizeInlineValue(input)));

        if (inputs.length === 0) {
            return;
        }

        const manager = window.propertiesManager;
        if (!manager?.updatePropertiesBatchMixed) {
            button.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('missing.noManager')}</span>`;
            return;
        }

        const items = inputs.map((input) => ({
            id: input.dataset.propertyId,
            field: input.dataset.missingField,
            value: normalizeInlineValue(input)
        }));

        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${copy('missing.saving')}</span>`;

        try {
            await manager.updatePropertiesBatchMixed(items.map((item) => ({
                id: item.id,
                updates: { [item.field]: item.value }
            })));

            items.forEach((item) => {
                const property = properties.find((entry) => entry.id === item.id);
                if (property) {
                    property[item.field] = item.value;
                }
            });

            button.innerHTML = `<i class="fas fa-check"></i><span>${copy('missing.saved')}</span>`;
            onSaved?.();
        } catch (error) {
            console.error('Bulk missing value save failed', error);
            button.disabled = false;
            button.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('missing.retry')}</span>`;
        }
    });

    return { panel, render };
}

function renderCategoryTable({
    category,
    categoryIndex,
    properties,
    allProperties,
    filterState,
    documentRef,
    contentElement,
    onEditProperty
}) {
    const activeField = filterState.fieldKey || '';
    const categoryFields = activeField ? category.fields.filter((field) => field === activeField) : category.fields;
    const displayedFields = ['name', ...categoryFields];
    const stats = getCategoryStats(allProperties, category);
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'allinfo-table-shell overflow-x-auto';

    const categoryHeader = documentRef.createElement('div');
    categoryHeader.className = 'allinfo-category-header';
    categoryHeader.innerHTML = `
        <div>
            <div class="allinfo-category-eyebrow">${copy('table.visibleOf', { visible: properties.length, total: allProperties.length })}</div>
            <h3>${getCategoryTitle(category)}</h3>
        </div>
        <div class="allinfo-category-kpis">
            <div><strong>${stats.completion}%</strong><span>${copy('table.complete')}</span></div>
            <div><strong>${stats.missingFields}</strong><span>${copy('table.missingFields')}</span></div>
            <div><strong>${stats.completeProperties}</strong><span>${copy('table.completeRows')}</span></div>
        </div>
    `;
    wrapper.appendChild(categoryHeader);

    const table = documentRef.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 allinfo-data-table';

    const thead = documentRef.createElement('thead');
    thead.className = 'bg-gray-900 text-white';

    const headerRow = documentRef.createElement('tr');
    displayedFields.forEach((fieldKey, fieldIndex) => {
        const th = documentRef.createElement('th');
        th.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase cursor-pointer bg-gray-900';
        th.innerHTML = `<span>${buildLabel(fieldKey)}</span> <i class="fas fa-sort ml-1 text-gray-400"></i>`;
        th.onclick = () => {
            const ascending = !th.asc;
            th.asc = ascending;
            headerRow.querySelectorAll('th').forEach((cell) => cell.classList.remove('asc', 'desc'));
            th.classList.add(ascending ? 'asc' : 'desc');
            sortTable(table, fieldIndex, ascending);
        };
        headerRow.appendChild(th);
    });

    const actionsHeader = documentRef.createElement('th');
    actionsHeader.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider bg-gray-900';
    actionsHeader.textContent = copy('table.actions');
    headerRow.appendChild(actionsHeader);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = documentRef.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-gray-200';
    const currencyFormatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

    properties.forEach((property) => {
        const row = documentRef.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.dataset.propertyId = property.id ?? '';
        const rowState = {
            dirty: false,
            updates: {}
        };

        displayedFields.forEach((fieldKey) => {
            const td = documentRef.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-700';

            const missing = isMissingValue(property[fieldKey], fieldKey);
            if (fieldKey === 'name') {
                td.classList.add('allinfo-property-cell');
                td.textContent = property[fieldKey] ?? '';
            } else if (fieldKey === 'cleaningCompanyPrice' || fieldKey === 'guestCleaningFee') {
                const numericValue = Number.parseFloat(property[fieldKey]);
                const isNumeric = Number.isFinite(numericValue);
                if (isNumeric) {
                    td.dataset.sort = String(numericValue);
                }

                const input = createInlineFieldControl(documentRef, fieldKey, property[fieldKey]);
                input.dataset.field = fieldKey;
                input.setAttribute('aria-label', `${property.name || 'Property'} ${buildLabel(fieldKey)}`);
                if (missing) {
                    td.classList.add('allinfo-empty-cell');
                }
                input.addEventListener('input', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = `<i class="fas fa-save"></i><span>${copy('table.save')}</span>`;
                    }
                });
                appendInlineFieldControl(documentRef, td, input, fieldKey);
                td.dataset.display = isNumeric ? currencyFormatter.format(numericValue) : '';
            } else {
                const input = createInlineFieldControl(documentRef, fieldKey, property[fieldKey]);
                input.dataset.field = fieldKey;
                input.setAttribute('aria-label', `${property.name || 'Property'} ${buildLabel(fieldKey)}`);
                if (missing) {
                    td.classList.add('allinfo-empty-cell');
                }
                input.addEventListener('input', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = `<i class="fas fa-save"></i><span>${copy('table.save')}</span>`;
                    }
                });
                input.addEventListener('change', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = `<i class="fas fa-save"></i><span>${copy('table.save')}</span>`;
                    }
                });
                appendInlineFieldControl(documentRef, td, input, fieldKey);
            }

            row.appendChild(td);
        });

        const actionsCell = documentRef.createElement('td');
        actionsCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium';

        const saveButton = documentRef.createElement('button');
        saveButton.innerHTML = `<i class="fas fa-check"></i><span>${copy('table.saved')}</span>`;
        saveButton.className = 'allinfo-inline-save-btn';
        saveButton.title = `Save changes for ${property.name}`;
        saveButton.disabled = true;
        saveButton.onclick = async () => {
            if (!rowState.dirty || Object.keys(rowState.updates).length === 0) {
                return;
            }

            const manager = window.propertiesManager;
            if (!manager?.updateProperty) {
                saveButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('table.noManager')}</span>`;
                return;
            }

            const updates = { ...rowState.updates };
            saveButton.disabled = true;
            saveButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i><span>${copy('table.saving')}</span>`;

            try {
                await manager.updateProperty(property.id, updates);
                Object.assign(property, updates);
                rowState.dirty = false;
                rowState.updates = {};
                row.classList.remove('allinfo-row-dirty');
                row.querySelectorAll('.allinfo-empty-cell').forEach((cell) => {
                    const field = cell.querySelector('[data-field]')?.dataset.field;
                    if (field && !isMissingValue(property[field])) {
                        cell.classList.remove('allinfo-empty-cell');
                    }
                });
                saveButton.innerHTML = `<i class="fas fa-check"></i><span>${copy('table.saved')}</span>`;
                if (typeof onEditProperty === 'function') {
                    onEditProperty();
                }
            } catch (error) {
                console.error('Inline property save failed', error);
                saveButton.disabled = false;
                saveButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i><span>${copy('table.retry')}</span>`;
            }
        };
        actionsCell.appendChild(saveButton);

        const editButton = documentRef.createElement('button');
        editButton.innerHTML = `<i class="fas fa-external-link-alt"></i><span>${copy('table.fullPage')}</span>`;
        editButton.className = 'allinfo-row-edit-btn';
        editButton.title = `Open full settings for ${property.name}`;
        editButton.onclick = () => onEditProperty?.(property, category);
        actionsCell.appendChild(editButton);

        row.appendChild(actionsCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    const tableScroller = documentRef.createElement('div');
    tableScroller.className = 'allinfo-table-scroll';
    tableScroller.appendChild(table);
    wrapper.appendChild(tableScroller);
    contentElement.appendChild(wrapper);

    try {
        const event = new CustomEvent('allInfoCategoryRendered', {
            detail: { category, index: categoryIndex, properties, table }
        });
        documentRef.dispatchEvent(event);
    } catch (error) {
        // no-op
    }
}

export function initializeAllInfoPage({
    properties = [],
    documentRef = document,
    onEditProperty = () => {}
} = {}) {
    const navigationElement = documentRef.getElementById('allinfo-nav');
    const contentElement = documentRef.getElementById('allinfo-content');
    const filterWrapper = documentRef.getElementById('allinfo-filter-wrapper');

    if (!navigationElement || !contentElement || !filterWrapper) {
        return;
    }

    const sortedProperties = [...properties].sort((left, right) => (
        (left.name ?? '').localeCompare(right.name ?? '', undefined, { numeric: true, sensitivity: 'base' })
    ));

    navigationElement.innerHTML = '';
    contentElement.innerHTML = '';
    filterWrapper.innerHTML = '';

    const {
        searchBarsContainer,
        propertyFilterInput,
        dataFilterSelect,
        fieldFilterSelect
    } = createSearchBars(documentRef);

    const overview = documentRef.createElement('div');
    overview.className = 'allinfo-overview';

    const workspaceMenu = documentRef.createElement('div');
    workspaceMenu.className = 'allinfo-workspace-menu';
    const workspaceItems = [
        ['table', 'fas fa-table', copy('workspace.table')],
        ['missing', 'fas fa-list-check', copy('workspace.missing')],
        ['compare', 'fas fa-file-excel', copy('workspace.compare')],
        ['edit', 'fas fa-pen-to-square', copy('workspace.edit')]
    ];
    workspaceItems.forEach(([key, icon, label]) => {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.workspace = key;
        button.innerHTML = `<i class="${icon}"></i><span>${label}</span>`;
        if (key === 'table') {
            button.classList.add('active');
        }
        workspaceMenu.appendChild(button);
    });

    const comparePanel = documentRef.createElement('div');
    comparePanel.className = 'allinfo-workspace-panel hidden';
    comparePanel.appendChild(createAlojamentosCheckPanel({
        documentRef,
        properties: sortedProperties,
        onImportSaved: () => {
            updateOverview();
            renderCategory(filterState.activeCategoryIndex);
        }
    }));

    const missingPanel = documentRef.createElement('div');
    missingPanel.className = 'allinfo-workspace-panel hidden';

    const editToolsPanel = documentRef.createElement('div');
    editToolsPanel.className = 'allinfo-workspace-panel hidden';
    const editToolsIntro = documentRef.createElement('div');
    editToolsIntro.className = 'allinfo-edit-tools-intro';
    editToolsIntro.innerHTML = `
        <strong>${copy('editToolsTitle')}</strong>
        <span>${copy('editToolsBody')}</span>
    `;
    editToolsPanel.appendChild(editToolsIntro);

    filterWrapper.appendChild(workspaceMenu);
    filterWrapper.appendChild(searchBarsContainer);
    filterWrapper.appendChild(overview);
    filterWrapper.appendChild(comparePanel);
    filterWrapper.appendChild(missingPanel);
    filterWrapper.appendChild(editToolsPanel);

    const filterState = {
        activeCategoryIndex: 0,
        propertySearch: '',
        dataMode: 'all',
        fieldKey: '',
        workspace: 'table'
    };

    let missingWorkbench = null;

    const deactivateEditModes = () => {
        const bulkButton = documentRef.getElementById('allinfo-bulk-toggle-btn');
        if (bulkButton && window.AllInfoBulkEdit?.isActive?.()) {
            bulkButton.click();
        }

        const sequentialButton = documentRef.getElementById('allinfo-seq-toggle-btn');
        if (sequentialButton?.getAttribute('data-active') === 'true') {
            sequentialButton.click();
        }

        const accordionButton = documentRef.getElementById('allinfo-accordion-toggle-btn');
        if (accordionButton?.getAttribute('data-active') === 'true') {
            accordionButton.click();
        }
    };

    const updateWorkspace = () => {
        const active = filterState.workspace;
        if (active !== 'edit') {
            deactivateEditModes();
        }

        workspaceMenu.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('active', button.dataset.workspace === active);
        });

        const showCategoryControls = active !== 'compare';
        searchBarsContainer.classList.toggle('hidden', !showCategoryControls);
        navigationElement.classList.toggle('hidden', !showCategoryControls);
        overview.classList.toggle('hidden', active !== 'table');
        contentElement.classList.toggle('hidden', active === 'missing' || active === 'compare');
        missingPanel.classList.toggle('hidden', active !== 'missing');
        comparePanel.classList.toggle('hidden', active !== 'compare');
        editToolsPanel.classList.toggle('hidden', active !== 'edit');

        const actionsBar = documentRef.getElementById('allinfo-actions-bar');
        if (actionsBar && actionsBar.parentElement !== editToolsPanel) {
            editToolsPanel.appendChild(actionsBar);
        }
        actionsBar?.classList.toggle('hidden', active !== 'edit');

        if (active === 'missing') {
            missingWorkbench?.render();
        }
    };

    const updateBadges = () => {
        if (!navigationElement) return;
        Array.from(navigationElement.children).forEach((button, categoryIndex) => {
            const category = ALL_INFO_CATEGORIES[categoryIndex];
            if (!category) return;
            const stats = getCategoryStats(sortedProperties, category);
            const badge = button.querySelector('.allinfo-cat-badge');
            if (badge) {
                badge.textContent = stats.missingFields;
                badge.className = stats.missingFields > 0 ? 'allinfo-cat-badge needs-attention' : 'allinfo-cat-badge';
            }
        });
    };

    const updateOverview = () => {
        updateBadges();
        const categoriesWithMissing = ALL_INFO_CATEGORIES.filter((category) => (
            getCategoryStats(sortedProperties, category).missingFields > 0
        )).length;
        const totalMissing = ALL_INFO_CATEGORIES.reduce((sum, category) => (
            sum + getCategoryStats(sortedProperties, category).missingFields
        ), 0);
        const basicStats = getCategoryStats(sortedProperties, ALL_INFO_CATEGORIES[0]);

        overview.innerHTML = `
            <div class="allinfo-overview-item">
                <strong>${sortedProperties.length}</strong>
                <span>${copy('overview.properties')}</span>
            </div>
            <div class="allinfo-overview-item">
                <strong>${basicStats.completion}%</strong>
                <span>${copy('overview.basicComplete')}</span>
            </div>
            <div class="allinfo-overview-item ${totalMissing > 0 ? 'needs-attention' : ''}">
                <strong>${totalMissing}</strong>
                <span>${copy('overview.missingFields')}</span>
            </div>
            <div class="allinfo-overview-item ${categoriesWithMissing > 0 ? 'needs-attention' : ''}">
                <strong>${categoriesWithMissing}</strong>
                <span>${copy('overview.categoriesReview')}</span>
            </div>
        `;
    };

    const populateFieldFilter = (category) => {
        const currentValue = fieldFilterSelect.value;
        fieldFilterSelect.innerHTML = '';

        const allOption = documentRef.createElement('option');
        allOption.value = '';
        allOption.textContent = copy('allFields');
        fieldFilterSelect.appendChild(allOption);

        category.fields.forEach((field) => {
            const option = documentRef.createElement('option');
            option.value = field;
            option.textContent = buildLabel(field);
            fieldFilterSelect.appendChild(option);
        });

        fieldFilterSelect.value = category.fields.includes(currentValue) ? currentValue : '';
        filterState.fieldKey = fieldFilterSelect.value;
    };

    const renderCategory = (categoryIndex) => {
        filterState.activeCategoryIndex = categoryIndex;
        const category = ALL_INFO_CATEGORIES[categoryIndex];
        populateFieldFilter(category);

        const searchTerm = filterState.propertySearch.toLowerCase();
        const visibleProperties = sortedProperties.filter((property) => {
            const matchesText = !searchTerm || [
                property.name,
                property.location,
                property.typology,
                property.type,
                ...category.fields.map((field) => property[field])
            ].some((value) => String(value ?? '').toLowerCase().includes(searchTerm));

            return matchesText && propertyMatchesCategoryFilter(
                property,
                category,
                filterState.dataMode,
                filterState.fieldKey
            );
        });

        contentElement.innerHTML = '';
        renderCategoryTable({
            category,
            categoryIndex,
            properties: visibleProperties,
            allProperties: sortedProperties,
            filterState,
            documentRef,
            contentElement,
            onEditProperty: () => {
                updateOverview();
                const stats = getCategoryStats(sortedProperties, category);
                const kpiDivs = contentElement.querySelectorAll('.allinfo-category-kpis > div > strong');
                if (kpiDivs.length === 3) {
                    kpiDivs[0].textContent = `${stats.completion}%`;
                    kpiDivs[1].textContent = stats.missingFields;
                    kpiDivs[2].textContent = stats.completeProperties;
                }
            }
        });

        missingWorkbench?.render();
        updateWorkspace();
    };

    missingWorkbench = createMissingWorkbench({
        documentRef,
        properties: sortedProperties,
        getActiveCategory: () => ALL_INFO_CATEGORIES[filterState.activeCategoryIndex],
        getActiveField: () => filterState.fieldKey,
        onSaved: () => {
            updateOverview();
            renderCategory(filterState.activeCategoryIndex);
        }
    });
    missingPanel.appendChild(missingWorkbench.panel);

    workspaceMenu.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-workspace]');
        if (!button) {
            return;
        }

        filterState.workspace = button.dataset.workspace;
        updateWorkspace();
    });

    ALL_INFO_CATEGORIES.forEach((category, categoryIndex) => {
        const button = documentRef.createElement('button');
        const stats = getCategoryStats(sortedProperties, category);
        const badgeClass = stats.missingFields > 0 ? 'allinfo-cat-badge needs-attention' : 'allinfo-cat-badge';
        button.innerHTML = `<i class="${category.icon}"></i><span>${getCategoryTitle(category)}</span><strong class="${badgeClass}">${stats.missingFields}</strong>`;
        button.className = 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100';
        button.dataset.idx = String(categoryIndex);

        if (categoryIndex === 0) {
            button.classList.add('bg-gray-100');
        }

        button.onclick = () => {
            Array.from(navigationElement.children).forEach((entry) => entry.classList.remove('bg-gray-100'));
            button.classList.add('bg-gray-100');
            renderCategory(categoryIndex);
        };

        navigationElement.appendChild(button);
    });

    propertyFilterInput.addEventListener('input', (event) => {
        filterState.propertySearch = event.target.value.trim();
        renderCategory(filterState.activeCategoryIndex);
    });

    dataFilterSelect.addEventListener('change', (event) => {
        filterState.dataMode = event.target.value;
        renderCategory(filterState.activeCategoryIndex);
    });

    fieldFilterSelect.addEventListener('change', (event) => {
        filterState.fieldKey = event.target.value;
        renderCategory(filterState.activeCategoryIndex);
    });

    updateOverview();
    renderCategory(0);
    updateWorkspace();
}
