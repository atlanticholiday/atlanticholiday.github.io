const PROPERTY_TYPE_BY_PREFIX = {
    T: "apartment",
    V: "villa"
};

const PROPERTY_NAME_HEADERS = new Set(["alojamento", "alojamentos", "propriedade", "property"]);

function normalizeHeader(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[ºª]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeComparableText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function normalizeSheetName(value) {
    return normalizeHeader(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function cellText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
    }

    return String(value).trim();
}

function normalizeImportedStatus(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (["sim", "feito", "colocado", "atualizada", "actualizada", "complete", "completed"].includes(normalized)) return "yes";
    if (["nao", "em falta", "a faltar", "falta", "missing"].includes(normalized)) return "missing";
    if (["pedido", "pedido na plataforma", "requested"].includes(normalized)) return "requested";
    if (["antigo", "old"].includes(normalized)) return "old";
    if (normalized.includes("nao e necessario") || normalized.includes("nao necessario")) return "not-necessary";
    return text;
}

function normalizeYesNo(value) {
    const status = normalizeImportedStatus(value);
    if (status === "yes") return "yes";
    if (status === "missing") return "no";
    return status;
}

function normalizeSignageStatus(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (normalized === "sim") return "yes";
    if (normalized === "nao") return "no";
    if (normalized.includes("nao e preciso") || normalized.includes("nao preciso") || normalized.includes("nao necessario")) return "not-necessary";
    if (normalized.includes("falta verificar") || normalized.includes("verificar")) return "needs-checking";
    if (normalized.includes("autoriz")) return "authorized";
    return text;
}

function normalizeFrameStatus(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (["colocado", "sim"].includes(normalized)) return "placed";
    if (["nao", "nao coloquei"].includes(normalized)) return "no";
    if (normalized.includes("falta levar") || normalized.includes("feito")) return "done";
    if (["verificar"].includes(normalized)) return "check";
    if (normalized.includes("nao se aplica") || normalized.includes("nao e preciso") || normalized.includes("nao necessario")) return "not-applicable";
    return text;
}

function normalizeDronePhotosStatus(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (["sim"].includes(normalized)) return "yes";
    if (["nao"].includes(normalized)) return "no";
    if (normalized.includes("falta publicar") || normalized.includes("falta")) return "needs-publishing";
    return text;
}

function normalizeInvestmentFrame(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (["sim"].includes(normalized)) return "yes";
    if (["nao"].includes(normalized)) return "no";
    if (normalized.includes("nao colocar") || normalized.includes("nao se aplica") || normalized.includes("nao e necessario") || normalized.includes("nao necessario")) return "do-not-place";
    return text;
}

function normalizeEnergySource(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);

    if (!normalized) return "";
    if (normalized.includes("eletricidade") || normalized.includes("eletrica") || normalized.includes("eletrico")) return "electric";
    if (["gas"].includes(normalized)) return "gas";
    if (normalized.includes("solar")) return "solar";
    if (normalized.includes("bomba de calor") || normalized.includes("heat pump")) return "heat-pump";
    if (normalized.includes("misto") || normalized.includes("mixed")) return "mixed";
    return text;
}

function normalizePlatformStatus(value) {
    const status = normalizeImportedStatus(value);
    if (status === "yes") return "on-platform";
    if (status === "missing") return "missing";
    return status;
}

function normalizeContractStatus(value, row = {}) {
    const status = normalizeImportedStatus(value);
    const signedStatus = normalizeImportedStatus(row["assinado"]);

    if (status === "old") return "old";
    if (status === "not-necessary") return "not-necessary";
    if (status === "yes" && signedStatus !== "missing") return "signed";
    if (status === "missing" || signedStatus === "missing") return "missing-signature";
    return status;
}

function normalizeComplaintBookLocation(value) {
    const text = cellText(value);
    const normalized = normalizeHeader(text);
    if (!normalized) return "";
    if (normalized === "escritorio") return "in-office";
    if (["em falta", "a faltar", "nao"].includes(normalized)) return "missing";
    return text;
}

function excelSerialDateToIso(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return "";
    }

    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + numeric * 86400000);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function normalizeDateValue(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
    }

    if (typeof value === "number") {
        return excelSerialDateToIso(value);
    }

    const text = cellText(value);
    if (!text) return "";

    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }

    return text;
}

function firstUrl(value) {
    const text = cellText(value);
    const match = text.match(/https?:\/\/\S+/i);
    return match ? match[0] : "";
}

function joinNonEmpty(values) {
    return values.map(cellText).filter(Boolean).join("\n");
}

function countCheckinVideos(row) {
    const rawStatus = cellText(row["video de check in"]);
    const statusMatch = rawStatus.match(/\d+/);
    if (statusMatch) {
        return Number.parseInt(statusMatch[0], 10);
    }

    const linkCount = CHECKIN_VIDEO_LINK_KEYS.filter((key) => cellText(row[key])).length;
    if (linkCount > 0) {
        return linkCount;
    }

    return normalizeImportedStatus(rawStatus) === "yes" ? 1 : "";
}

function asRowObjects(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const headerIndex = safeRows.findIndex((row) => Array.isArray(row) && row.some((cell) => PROPERTY_NAME_HEADERS.has(normalizeHeader(cell))));

    if (headerIndex < 0) {
        return [];
    }

    const headers = (safeRows[headerIndex] ?? []).map(normalizeHeader);
    return safeRows.slice(headerIndex + 1).map((row, index) => {
        const object = { __rowNumber: headerIndex + index + 2 };
        headers.forEach((header, columnIndex) => {
            if (header) {
                object[header] = row?.[columnIndex] ?? "";
            }
        });
        object.__propertyName = cellText(
            object["alojamento"] ?? object["alojamentos"] ?? object["propriedade"] ?? object["property"]
        );
        return object;
    }).filter((row) => row.__propertyName);
}

function applyField(updates, field, value) {
    if (value === undefined || value === null) {
        return;
    }

    const textValue = typeof value === "string" ? value.trim() : "";
    if (/^#(REF|VALUE|DIV\/0|N\/A|NAME|NULL|NUM)!?$/i.test(textValue) || textValue === "System.Xml.XmlElement") {
        return;
    }

    if (typeof value === "string" && !value.trim()) {
        return;
    }

    if (value === "") {
        return;
    }

    updates[field] = value;
}

function isEmptyImportTarget(value, field = "") {
    if (value === undefined || value === null || String(value).trim() === "") return true;
    if (field === "wifiSpeed" || field === "wifiAirbnb") {
        return true;
    }
    return false;
}

function buildUpdatesFromRow(row, mappings) {
    const updates = {};
    mappings.forEach((mapping) => {
        applyField(updates, mapping.field, mapping.value(row));
    });
    return updates;
}

function findHeaderInfo(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const headerIndex = safeRows.findIndex((row) => Array.isArray(row) && row.some((cell) => PROPERTY_NAME_HEADERS.has(normalizeHeader(cell))));

    if (headerIndex < 0) {
        return null;
    }

    const headers = (safeRows[headerIndex] ?? []).map((header, columnIndex) => ({
        key: normalizeHeader(header),
        label: cellText(header),
        columnIndex
    })).filter((header) => header.key);

    return { headerIndex, headers };
}

function resolveColumnMappings(sheetMapping, headerInfo) {
    const mappedFields = new Set();
    const mappings = [];
    const sheetSpecificSourceKeys = new Set();

    (sheetMapping?.fields || []).forEach((mapping) => {
        mappings.push(mapping);
        mappedFields.add(mapping.field);
        const source = String(mapping.value || "");
        [...source.matchAll(/row\["([^"]+)"\]/g)].forEach((match) => {
            sheetSpecificSourceKeys.add(normalizeHeader(match[1]));
        });
    });

    const supportedColumns = new Set();
    const unsupportedColumns = [];

    headerInfo.headers.forEach((header) => {
        if (PROPERTY_NAME_HEADERS.has(header.key) || sheetSpecificSourceKeys.has(header.key)) {
            supportedColumns.add(header.label || header.key);
            return;
        }

        const genericMapping = GENERIC_PORTUGUESE_COLUMN_MAPPINGS[header.key];
        if (genericMapping) {
            supportedColumns.add(header.label || header.key);
            if (!mappedFields.has(genericMapping.field)) {
                mappings.push(genericMapping);
                mappedFields.add(genericMapping.field);
            }
            return;
        }

        unsupportedColumns.push(header.label || header.key);
    });

    return {
        mappings,
        supportedColumns: [...supportedColumns],
        unsupportedColumns
    };
}

const CHECKIN_VIDEO_LINK_KEYS = [
    "link dos videos",
    "link dos videos 2",
    "link dos videos 3",
    "link dos videos 4",
    "link dos videos 5"
];

const AH_WORKBOOK_SHEET_MAPPINGS = [
    {
        sheet: "placas",
        fields: [
            { field: "privateSign", value: (row) => normalizeSignageStatus(row["placa private"]) },
            { field: "noSmokingSign", value: (row) => normalizeSignageStatus(row["placa proibido fumar"]) },
            { field: "noJunkMailSign", value: (row) => normalizeSignageStatus(row["placa nao publicidade"]) },
            { field: "noiseSign", value: (row) => normalizeSignageStatus(row["placa do ruido"]) },
            { field: "alAhSign", value: (row) => normalizeSignageStatus(row["placa al ah"]) },
            { field: "keysNotice", value: (row) => normalizeSignageStatus(row["aviso das chaves"]) },
            { field: "wcSign", value: (row) => normalizeSignageStatus(row["placa wc"]) },
            { field: "signageNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "videos check in",
        fields: [
            { field: "checkinVideos", value: countCheckinVideos },
            { field: "googleDriveEnabled", value: (row) => normalizeYesNo(row["google drive"]) },
            { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
            { field: "checkinVideoNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "recomendacoes",
        fields: [
            { field: "recommendationsLink", value: (row) => firstUrl(row["link das recomendacoes"]) || row["link das recomendacoes"] },
            { field: "recommendationsEditLink", value: (row) => firstUrl(row["links recomendacoes para editar"]) || row["links recomendacoes para editar"] },
            { field: "recommendationsStatus", value: (row) => normalizeImportedStatus(row["feito"]) },
            { field: "recommendationsNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "contratos",
        fields: [
            { field: "contractsStatus", value: (row) => normalizeContractStatus(row["feito"], row) },
            { field: "contractSignedStatus", value: (row) => normalizeYesNo(row["assinado"]) },
            { field: "contractScannedStatus", value: (row) => normalizeYesNo(row["digitalizado"]) },
            { field: "contractNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "localizacoes",
        fields: [
            { field: "googleMapsLink", value: (row) => firstUrl(row["localizacao no google maps"]) || row["localizacao no google maps"] },
            { field: "googleMapsStatus", value: (row) => normalizeImportedStatus(row["no google maps"]) },
            { field: "garbageLocationLink", value: (row) => firstUrl(row["local do lixo"]) },
            { field: "garbageLocationNotes", value: (row) => firstUrl(row["local do lixo"]) ? "" : row["local do lixo"] },
            { field: "locationNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "descricoes",
        fields: [
            { field: "bookingDescriptionStatus", value: (row) => normalizeImportedStatus(row["descricoes na booking"]) },
            { field: "bookingDescriptionNewStatus", value: (row) => normalizeImportedStatus(row["novas descricoes"]) },
            { field: "avantioDescriptionStatus", value: (row) => normalizeImportedStatus(row["colocado na avantio"]) },
            { field: "bookingDescriptionNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "livros reclamacoes",
        fields: [
            { field: "complaintBooksStatus", value: (row) => normalizeComplaintBookLocation(row["livros de reclamacoes"]) },
            { field: "onlineComplaintBooksEnabled", value: (row) => normalizeYesNo(row["livros de reclamacoes online"]) },
            { field: "onlineComplaintBooksEmail", value: (row) => row["conta"] },
            { field: "onlineComplaintBooksPassword", value: (row) => row["password"] }
        ]
    },
    {
        sheet: "sef estatistica",
        fields: [
            { field: "statisticsStatus", value: (row) => normalizePlatformStatus(row["estatistica"]) },
            { field: "sefStatus", value: (row) => normalizePlatformStatus(row["sef"]) },
            { field: "sefStatisticsNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "taxas",
        fields: [
            { field: "touristTaxMunicipality", value: (row) => row["concelho"] },
            { field: "touristTaxPlatformStatus", value: (row) => normalizeImportedStatus(row["registado na plataforma"]) },
            { field: "touristTaxNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "caderneta predial",
        fields: [
            { field: "propertyRegisterNumber", value: (row) => row["n caderneta"] ?? row["no caderneta"] },
            { field: "propertyRegisterAirbnbStatus", value: (row) => normalizeImportedStatus(row["airbnb"]) },
            { field: "propertyRegisterBookingStatus", value: (row) => normalizeImportedStatus(row["booking"]) },
            { field: "propertyRegisterBenefitsStatus", value: (row) => normalizeImportedStatus(row["beneficios adicionais"]) }
        ]
    },
    {
        sheet: "inventario de chaves",
        fields: [
            { field: "keysEntrance", value: (row) => row["chaves da entrada"] },
            { field: "keysHouse", value: (row) => row["chaves da casa"] },
            { field: "keysRemote", value: (row) => row["comando"] },
            { field: "keysOther", value: (row) => row["outras"] },
            { field: "keysInventoryNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "airbnb",
        fields: [
            { field: "airbnbLinksStatus", value: (row) => normalizeYesNo(row["ligacoes personalizadas airbnb"]) },
            { field: "airbnbLinksNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "regras da casa",
        fields: [
            { field: "houseRulesStatus", value: (row) => normalizeImportedStatus(row["feito"]) },
            { field: "nearestHospitalLink", value: (row) => firstUrl(row["unidade hospitalar mais proxima"]) || row["unidade hospitalar mais proxima"] },
            { field: "nearestHospitalHours", value: (row) => row["horario"] },
            { field: "busStopLink", value: (row) => firstUrl(row["paragem de autocarro"]) || row["paragem de autocarro"] },
            { field: "busScheduleLink", value: (row) => firstUrl(row["horario do autocarro"]) || row["hórario do autocarro"] || row["horário do autocarro"] },
            { field: "houseRulesNotes", value: (row) => row["notas"] }
        ]
    },
    {
        sheet: "seguro rnal 2026",
        fields: [
            { field: "rnalNumber", value: (row) => row["n al"] ?? row["no al"] },
            { field: "rnalHandledByUs", value: (row) => normalizeYesNo(row["feito por nos"]) },
            { field: "rnalDoneStatus", value: (row) => normalizeYesNo(row["se feito por nos ja esta feito"]) },
            { field: "insuranceChargedStatus", value: (row) => normalizeYesNo(row["colocado para cobrar"]) },
            { field: "insurancePlatformStatus", value: (row) => normalizePlatformStatus(row["na plataforma"]) },
            { field: "insuranceValidity", value: (row) => normalizeDateValue(row["validade"]) },
            { field: "insuranceNotes", value: (row) => row["notas"] },
            { field: "insuranceAccounting", value: (row) => row["contabilidade"] }
        ]
    },
    {
        sheet: "ac ventoinhas aquecedores",
        fields: [
            { field: "airConditioning", value: (row) => cellText(row["ar condicionado"]) },
            { field: "fans", value: (row) => cellText(row["ventoinha"]) },
            { field: "heaters", value: (row) => cellText(row["aquecedor"]) },
        ]
    },
    {
        sheet: "baby cots e baby chairs",
        fields: [
            { field: "crib", value: (row) => normalizeYesNo(row["baby cot"]) },
            { field: "cribMattress", value: (row) => normalizeYesNo(row["matress"]) },
            { field: "babyChair", value: (row) => normalizeYesNo(row["baby chair"]) },
        ]
    },
    {
        sheet: "condominios",
        fields: [
            { field: "condominiumName", value: (row) => cellText(row["condominio"]) },
            { field: "condominiumEmail", value: (row) => cellText(row["email condominio"]) },
            { field: "condominiumPhone", value: (row) => cellText(row["n condominio"]) },
        ]
    },
    {
        sheet: "extintores",
        fields: [
            { field: "fireExtinguisherExpiration", value: (row) => cellText(row["data de validade 2024"]) },
            { field: "fireExtinguisherLocation", value: (row) => cellText(row["localidade"]) },
            { field: "fireExtinguisherNotes", value: (row) => cellText(row["notas"]) },
        ]
    },
    {
        sheet: "kit 1 s socorros",
        fields: [
            { field: "firstAidStatus", value: (row) => cellText(row["estado"]) },
            { field: "firstAidLastChecked", value: (row) => cellText(row["ultima verificacao"]) },
            { field: "firstAidNotes", value: (row) => cellText(row["notas"]) },
        ]
    },
    {
        sheet: "quadros v2",
        fields: [
            { field: "wifiFrame", value: (row) => normalizeFrameStatus(row["quadro wifi"]) },
            { field: "recommendationsFrame", value: (row) => normalizeFrameStatus(row["quadro recomendacoes"]) },
            { field: "investmentFrame", value: (row) => normalizeInvestmentFrame(row["quadro investimento"]) },
            { field: "breakfastBox", value: (row) => normalizeYesNo(row["breakfast in a box"]) },
            { field: "homeGuide", value: (row) => normalizeFrameStatus(row["guia da casa"]) },
        ]
    },
    {
        sheet: "codigos andar smarttv aquecimento da agua wifi",
        fields: [
            { field: "keyBoxCode", value: (row) => cellText(row["codigo para entrar na propriedade"]) },
            { field: "floor", value: (row) => cellText(row["andar do alojamento"]) },
            { field: "parkingSpot", value: (row) => cellText(row["parking spot"]) },
            { field: "energySource", value: (row) => normalizeEnergySource(row["aquecimento da agua gas ou eletricidade"]) },
            { field: "smartTv", value: (row) => normalizeDronePhotosStatus(row["smart tv"]) },
            { field: "wifiSpeed", value: (row) => cellText(row["wifi speed"]) },
            { field: "wifiAirbnb", value: (row) => normalizeYesNo(row["wifi airbnb"]) },
            { field: "coffeeMachine", value: (row) => cellText(row["maquina de cafe"]) },
            { field: "dronePhotos", value: (row) => normalizeDronePhotosStatus(row["fotos de drone"]) },
        ]
    }
];

const GENERIC_PORTUGUESE_COLUMN_MAPPINGS = {
    "video de check in": { field: "checkinVideos", value: countCheckinVideos },
    "google drive": { field: "googleDriveEnabled", value: (row) => normalizeYesNo(row["google drive"]) },
    "link dos videos": { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
    "link dos videos 2": { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
    "link dos videos 3": { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
    "link dos videos 4": { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
    "link dos videos 5": { field: "checkinVideoLinks", value: (row) => joinNonEmpty(CHECKIN_VIDEO_LINK_KEYS.map((key) => row[key])) },
    "link das recomendacoes": { field: "recommendationsLink", value: (row) => firstUrl(row["link das recomendacoes"]) || row["link das recomendacoes"] },
    "links recomendacoes para editar": { field: "recommendationsEditLink", value: (row) => firstUrl(row["links recomendacoes para editar"]) || row["links recomendacoes para editar"] },
    "localizacao no google maps": { field: "googleMapsLink", value: (row) => firstUrl(row["localizacao no google maps"]) || row["localizacao no google maps"] },
    "no google maps": { field: "googleMapsStatus", value: (row) => normalizeImportedStatus(row["no google maps"]) },
    "local do lixo": { field: "garbageLocationLink", value: (row) => firstUrl(row["local do lixo"]) },
    "descricoes na booking": { field: "bookingDescriptionStatus", value: (row) => normalizeImportedStatus(row["descricoes na booking"]) },
    "novas descricoes": { field: "bookingDescriptionNewStatus", value: (row) => normalizeImportedStatus(row["novas descricoes"]) },
    "colocado na avantio": { field: "avantioDescriptionStatus", value: (row) => normalizeImportedStatus(row["colocado na avantio"]) },
    "livros de reclamacoes": { field: "complaintBooksStatus", value: (row) => normalizeComplaintBookLocation(row["livros de reclamacoes"]) },
    "livros de reclamacoes online": { field: "onlineComplaintBooksEnabled", value: (row) => normalizeYesNo(row["livros de reclamacoes online"]) },
    "conta": { field: "onlineComplaintBooksEmail", value: (row) => row["conta"] },
    "password": { field: "onlineComplaintBooksPassword", value: (row) => row["password"] },
    "estatistica": { field: "statisticsStatus", value: (row) => normalizePlatformStatus(row["estatistica"]) },
    "sef": { field: "sefStatus", value: (row) => normalizePlatformStatus(row["sef"]) },
    "concelho": { field: "touristTaxMunicipality", value: (row) => row["concelho"] },
    "registado na plataforma": { field: "touristTaxPlatformStatus", value: (row) => normalizeImportedStatus(row["registado na plataforma"]) },
    "n caderneta": { field: "propertyRegisterNumber", value: (row) => row["n caderneta"] },
    "n al": { field: "rnalNumber", value: (row) => row["n al"] },
    "validade": { field: "insuranceValidity", value: (row) => normalizeDateValue(row["validade"]) },
    "chaves da entrada": { field: "keysEntrance", value: (row) => row["chaves da entrada"] },
    "chaves da casa": { field: "keysHouse", value: (row) => row["chaves da casa"] },
    "comando": { field: "keysRemote", value: (row) => row["comando"] },
    "outras": { field: "keysOther", value: (row) => row["outras"] },
    "unidade hospitalar mais proxima": { field: "nearestHospitalLink", value: (row) => firstUrl(row["unidade hospitalar mais proxima"]) || row["unidade hospitalar mais proxima"] },
    "horario": { field: "nearestHospitalHours", value: (row) => row["horario"] },
    "paragem de autocarro": { field: "busStopLink", value: (row) => firstUrl(row["paragem de autocarro"]) || row["paragem de autocarro"] },
    "horario do autocarro": { field: "busScheduleLink", value: (row) => firstUrl(row["horario do autocarro"]) || row["horario do autocarro"] },
    "ligacoes personalizadas airbnb": { field: "airbnbLinksStatus", value: (row) => normalizeYesNo(row["ligacoes personalizadas airbnb"]) },
    "placa private": { field: "privateSign", value: (row) => normalizeSignageStatus(row["placa private"]) },
    "placa proibido fumar": { field: "noSmokingSign", value: (row) => normalizeSignageStatus(row["placa proibido fumar"]) },
    "placa nao publicidade": { field: "noJunkMailSign", value: (row) => normalizeSignageStatus(row["placa nao publicidade"]) },
    "placa do ruido": { field: "noiseSign", value: (row) => normalizeSignageStatus(row["placa do ruido"]) },
    "placa al ah": { field: "alAhSign", value: (row) => normalizeSignageStatus(row["placa al ah"]) },
    "aviso das chaves": { field: "keysNotice", value: (row) => normalizeSignageStatus(row["aviso das chaves"]) },
    "placa wc": { field: "wcSign", value: (row) => normalizeSignageStatus(row["placa wc"]) },
    // AC / Ventoinhas / Aquecedores
    "ar condicionado": { field: "airConditioning", value: (row) => cellText(row["ar condicionado"]) },
    "ventoinha": { field: "fans", value: (row) => cellText(row["ventoinha"]) },
    "aquecedor": { field: "heaters", value: (row) => cellText(row["aquecedor"]) },
    // Baby equipment
    "baby cot": { field: "crib", value: (row) => normalizeYesNo(row["baby cot"]) },
    "matress": { field: "cribMattress", value: (row) => normalizeYesNo(row["matress"]) },
    "baby chair": { field: "babyChair", value: (row) => normalizeYesNo(row["baby chair"]) },
    // Condominiums
    "condominio": { field: "condominiumName", value: (row) => cellText(row["condominio"]) },
    "email condominio": { field: "condominiumEmail", value: (row) => cellText(row["email condominio"]) },
    "n condominio": { field: "condominiumPhone", value: (row) => cellText(row["n condominio"]) },
    // Fire extinguishers
    "data de validade 2024": { field: "fireExtinguisherExpiration", value: (row) => cellText(row["data de validade 2024"]) },
    "localidade": { field: "fireExtinguisherLocation", value: (row) => cellText(row["localidade"]) },
    // First aid
    "estado": { field: "firstAidStatus", value: (row) => cellText(row["estado"]) },
    "ultima verificacao": { field: "firstAidLastChecked", value: (row) => cellText(row["ultima verificacao"]) },
    // Frames / Quadros
    "quadro wifi": { field: "wifiFrame", value: (row) => normalizeFrameStatus(row["quadro wifi"]) },
    "quadro recomendacoes": { field: "recommendationsFrame", value: (row) => normalizeFrameStatus(row["quadro recomendacoes"]) },
    "quadro investimento": { field: "investmentFrame", value: (row) => normalizeInvestmentFrame(row["quadro investimento"]) },
    "breakfast in a box": { field: "breakfastBox", value: (row) => normalizeYesNo(row["breakfast in a box"]) },
    "guia da casa": { field: "homeGuide", value: (row) => normalizeFrameStatus(row["guia da casa"]) },
    // Codes / Wifi sheet
    "codigo para entrar na propriedade": { field: "keyBoxCode", value: (row) => cellText(row["codigo para entrar na propriedade"]) },
    "andar do alojamento": { field: "floor", value: (row) => cellText(row["andar do alojamento"]) },
    "parking spot": { field: "parkingSpot", value: (row) => cellText(row["parking spot"]) },
    "aquecimento da agua gas ou eletricidade": { field: "energySource", value: (row) => normalizeEnergySource(row["aquecimento da agua gas ou eletricidade"]) },
    "smart tv": { field: "smartTv", value: (row) => normalizeDronePhotosStatus(row["smart tv"]) },
    "wifi speed": { field: "wifiSpeed", value: (row) => cellText(row["wifi speed"]) },
    "wifi airbnb": { field: "wifiAirbnb", value: (row) => normalizeYesNo(row["wifi airbnb"]) },
    "maquina de cafe": { field: "coffeeMachine", value: (row) => cellText(row["maquina de cafe"]) },
    "fotos de drone": { field: "dronePhotos", value: (row) => normalizeDronePhotosStatus(row["fotos de drone"]) }
};

export function normalizePropertyTypology(value) {
    const normalized = String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "");

    const match = normalized.match(/^([TV])(\d+)$/);
    if (!match) {
        return null;
    }

    const [, prefix, roomText] = match;
    const rooms = Number.parseInt(roomText, 10);
    if (Number.isNaN(rooms) || rooms < 0 || rooms > 50) {
        return null;
    }

    return {
        typology: `${prefix}${rooms}`,
        type: PROPERTY_TYPE_BY_PREFIX[prefix],
        rooms
    };
}

function findHeaderMap(rows) {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        const headers = new Map();

        row.forEach((cell, columnIndex) => {
            const key = normalizeHeader(cell);
            if (key) {
                headers.set(key, columnIndex);
            }
        });

        const nameIndex = headers.get("alojamento") ?? headers.get("alojamentos");
        const locationIndex = headers.get("localizacao");
        const typologyIndex = headers.get("tipologia");

        if (nameIndex !== undefined) {
            return {
                rowIndex,
                columns: {
                    name: nameIndex,
                    location: locationIndex,
                    typology: typologyIndex
                }
            };
        }
    }

    return null;
}

export function parseAlojamentosRows(rows) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const headerMap = findHeaderMap(safeRows);
    const properties = [];
    const errors = [];

    if (!headerMap) {
        return {
            properties,
            errors: [{
                lineNumber: 0,
                error: 'Could not find the required header: "Alojamento".'
            }]
        };
    }

    safeRows.slice(headerMap.rowIndex + 1).forEach((row, index) => {
        const lineNumber = headerMap.rowIndex + index + 2;
        const hasLocationColumn = headerMap.columns.location !== undefined;
        const hasTypologyColumn = headerMap.columns.typology !== undefined;
        const name = String(row?.[headerMap.columns.name] ?? "").trim();
        const location = hasLocationColumn ? String(row?.[headerMap.columns.location] ?? "").trim() : "";
        const rawTypology = hasTypologyColumn ? String(row?.[headerMap.columns.typology] ?? "").trim() : "";

        if (!name && !location && !rawTypology) {
            return;
        }

        if (!name || (hasLocationColumn && !location) || (hasTypologyColumn && !rawTypology)) {
            errors.push({
                lineNumber,
                error: "Missing property name, location, or typology."
            });
            return;
        }

        const parsedTypology = hasTypologyColumn ? normalizePropertyTypology(rawTypology) : {};
        if (hasTypologyColumn && !parsedTypology) {
            errors.push({
                lineNumber,
                error: `Invalid typology "${rawTypology}". Use T0, T1, T2 or V1, V2, V3.`
            });
            return;
        }

        properties.push({
            name,
            ...(hasLocationColumn ? { location } : {}),
            ...parsedTypology,
            ...(hasTypologyColumn ? {
                description: `${parsedTypology.typology} - ${parsedTypology.rooms === 0 ? "Studio" : `${parsedTypology.rooms} bedroom${parsedTypology.rooms > 1 ? "s" : ""}`}`
            } : {}),
            status: "available"
        });
    });

    return { properties, errors };
}

export function compareAlojamentosProperties(existingProperties = [], importedProperties = []) {
    const existingByName = new Map();

    existingProperties.forEach((property) => {
        const key = normalizeComparableText(property.name);
        if (key) {
            existingByName.set(key, property);
        }
    });

    const importedByName = new Map();
    const matched = [];
    const missingInApp = [];
    const differences = [];

    importedProperties.forEach((property) => {
        const key = normalizeComparableText(property.name);
        if (key) {
            importedByName.set(key, property);
        }

        const existing = existingByName.get(key);
        if (!existing) {
            missingInApp.push(property);
            return;
        }

        matched.push({ existing, imported: property });

        const fieldChanges = [];
        const existingLocation = normalizeComparableText(existing.location);
        const importedLocation = normalizeComparableText(property.location);
        const existingTypology = normalizeComparableText(existing.typology || existing.type);
        const importedTypology = normalizeComparableText(property.typology);

        if (Object.hasOwn(property, "location") && existingLocation !== importedLocation) {
            fieldChanges.push({
                field: "location",
                existing: existing.location ?? "",
                imported: property.location ?? ""
            });
        }

        if (Object.hasOwn(property, "typology") && existingTypology !== importedTypology) {
            fieldChanges.push({
                field: "typology",
                existing: existing.typology || existing.type || "",
                imported: property.typology ?? ""
            });
        }

        if (fieldChanges.length > 0) {
            differences.push({
                name: property.name,
                existing,
                imported: property,
                fields: fieldChanges
            });
        }
    });

    const extraInApp = existingProperties.filter((property) => {
        const key = normalizeComparableText(property.name);
        return key && !importedByName.has(key);
    });

    return {
        matched,
        missingInApp,
        extraInApp,
        differences,
        totals: {
            existing: existingProperties.length,
            imported: importedProperties.length,
            matched: matched.length,
            missingInApp: missingInApp.length,
            extraInApp: extraInApp.length,
            differences: differences.length
        }
    };
}

export function parseAhWorkbookImport(sheetRowsByName = {}, existingProperties = [], options = {}) {
    const overwriteExisting = options?.overwriteExisting === true;
    const normalizedSheets = new Map();
    Object.entries(sheetRowsByName || {}).forEach(([sheetName, rows]) => {
        normalizedSheets.set(normalizeSheetName(sheetName), { sheetName, rows });
    });

    const existingByName = new Map();
    existingProperties.forEach((property) => {
        const key = normalizeComparableText(property.name);
        if (key) {
            existingByName.set(key, property);
        }
    });

    const updateByPropertyId = new Map();
    const missingByName = new Map();
    const importedSheets = [];
    const importedFields = new Set();
    const processedSheets = [];
    const unsupportedColumns = [];
    const skippedExisting = [];
    const noChange = [];
    const appliedChanges = [];
    const errors = [];
    let parsedRows = 0;
    let matchedRows = 0;
    let skippedExistingFields = 0;
    let replacedExistingFields = 0;

    normalizedSheets.forEach((sheetEntry, normalizedSheetName) => {
        const sheetMapping = AH_WORKBOOK_SHEET_MAPPINGS.find((mapping) => mapping.sheet === normalizedSheetName) || null;
        const headerInfo = findHeaderInfo(sheetEntry.rows);
        if (!headerInfo) {
            processedSheets.push({
                sheetName: sheetEntry.sheetName,
                importedRows: 0,
                supportedColumns: [],
                unsupportedColumns: [],
                status: "skipped",
                reason: "No Alojamento/Propriedade column found."
            });
            return;
        }

        const resolvedMappings = resolveColumnMappings(sheetMapping, headerInfo);
        const rowObjects = asRowObjects(sheetEntry.rows);
        if (resolvedMappings.mappings.length === 0) {
            processedSheets.push({
                sheetName: sheetEntry.sheetName,
                importedRows: rowObjects.length,
                supportedColumns: resolvedMappings.supportedColumns,
                unsupportedColumns: resolvedMappings.unsupportedColumns,
                status: "skipped",
                reason: "No supported Portuguese columns found."
            });
            resolvedMappings.unsupportedColumns.forEach((column) => {
                unsupportedColumns.push({ sheet: sheetEntry.sheetName, column });
            });
            return;
        }

        importedSheets.push(sheetEntry.sheetName);
        resolvedMappings.unsupportedColumns.forEach((column) => {
            unsupportedColumns.push({ sheet: sheetEntry.sheetName, column });
        });
        processedSheets.push({
            sheetName: sheetEntry.sheetName,
            importedRows: rowObjects.length,
            supportedColumns: resolvedMappings.supportedColumns,
            unsupportedColumns: resolvedMappings.unsupportedColumns,
            status: "processed",
            reason: ""
        });

        rowObjects.forEach((row) => {
            parsedRows += 1;
            const updates = buildUpdatesFromRow(row, resolvedMappings.mappings);
            if (Object.keys(updates).length === 0) {
                return;
            }

            const property = existingByName.get(normalizeComparableText(row.__propertyName));
            if (!property) {
                missingByName.set(normalizeComparableText(row.__propertyName), {
                    name: row.__propertyName,
                    sheet: sheetEntry.sheetName,
                    rowNumber: row.__rowNumber
                });
                return;
            }

            matchedRows += 1;
            const currentEntry = updateByPropertyId.get(property.id) || {
                property,
                updates: {},
                fields: new Set(),
                sheets: new Set()
            };

            Object.entries(updates).forEach(([field, value]) => {
                if (!isEmptyImportTarget(property[field], field)) {
                    if (!overwriteExisting) {
                        skippedExistingFields += 1;
                        skippedExisting.push({
                            propertyId: property.id,
                            propertyName: property.name,
                            field,
                            existingValue: property[field],
                            workbookValue: value,
                            sheet: sheetEntry.sheetName,
                            rowNumber: row.__rowNumber
                        });
                        return;
                    }

                    if (normalizeComparableText(property[field]) === normalizeComparableText(value)) {
                        noChange.push({
                            propertyId: property.id,
                            propertyName: property.name,
                            field,
                            value,
                            sheet: sheetEntry.sheetName,
                            rowNumber: row.__rowNumber
                        });
                        return;
                    }

                    replacedExistingFields += 1;
                    currentEntry.updates[field] = value;
                    currentEntry.fields.add(field);
                    currentEntry.sheets.add(sheetEntry.sheetName);
                    importedFields.add(field);
                    const change = {
                        action: "replace",
                        propertyId: property.id,
                        propertyName: property.name,
                        field,
                        previousValue: property[field],
                        newValue: value,
                        sheet: sheetEntry.sheetName,
                        rowNumber: row.__rowNumber
                    };
                    currentEntry.changes = currentEntry.changes || [];
                    currentEntry.changes.push(change);
                    appliedChanges.push(change);
                    return;
                }

                if (normalizeComparableText(value)) {
                    currentEntry.updates[field] = value;
                    currentEntry.fields.add(field);
                    currentEntry.sheets.add(sheetEntry.sheetName);
                    importedFields.add(field);
                    const change = {
                        action: "fill",
                        propertyId: property.id,
                        propertyName: property.name,
                        field,
                        previousValue: property[field] ?? "",
                        newValue: value,
                        sheet: sheetEntry.sheetName,
                        rowNumber: row.__rowNumber
                    };
                    currentEntry.changes = currentEntry.changes || [];
                    currentEntry.changes.push(change);
                    appliedChanges.push(change);
                }
            });

            updateByPropertyId.set(property.id, currentEntry);
        });
    });

    const updates = [...updateByPropertyId.values()]
        .filter((entry) => Object.keys(entry.updates).length > 0)
        .map((entry) => ({
            property: entry.property,
            updates: entry.updates,
            fields: [...entry.fields],
            sheets: [...entry.sheets],
            changes: entry.changes || []
        }));

    return {
        updates,
        missingInApp: [...missingByName.values()],
        importedSheets,
        importedFields: [...importedFields].sort(),
        processedSheets,
        unsupportedColumns,
        skippedExisting,
        noChange,
        appliedChanges,
        errors,
        totals: {
            sheets: importedSheets.length,
            processedSheets: processedSheets.filter((sheet) => sheet.status === "processed").length,
            skippedSheets: processedSheets.filter((sheet) => sheet.status === "skipped").length,
            parsedRows,
            matchedRows,
            propertiesToUpdate: updates.length,
            fieldsToUpdate: updates.reduce((total, entry) => total + Object.keys(entry.updates).length, 0),
            skippedExistingFields,
            replacedExistingFields,
            unsupportedColumns: unsupportedColumns.length,
            noChangeFields: noChange.length,
            missingInApp: missingByName.size
        }
    };
}
