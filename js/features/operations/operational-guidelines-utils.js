import { OPERATIONAL_GUIDELINE_SECTIONS } from "./operational-guidelines-data.js";

const STOP_WORDS = new Set([
    "a", "ao", "aos", "as", "com", "da", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os",
    "para", "por", "que", "se", "um", "uma", "the", "is", "it", "to", "with"
]);

const SYNONYMS = new Map([
    ["net", "internet"],
    ["wifi", "wi-fi"],
    ["wireless", "wi-fi"],
    ["fogao", "fogão"],
    ["placa", "indução"],
    ["luz", "energia"],
    ["eletricidade", "energia"],
    ["televisao", "tv"],
    ["comando", "remote"],
    ["frigorifico", "eletrodoméstico"],
    ["barata", "insetos"],
    ["bicho", "insetos"],
    ["formiga", "formigas"],
    ["lagartixa", "lagartixas"],
    ["reviews", "review"],
    ["avaliacao", "avaliação"],
    ["chave", "chaves"],
    ["checkout", "check-out"],
    ["checkin", "check-in"],
    ["mala", "malas"],
    ["bagagem", "malas"],
    ["parque", "estacionamento"],
    ["chuva", "clima"],
    ["tempo", "clima"],
    ["aquecida", "aquecimento"],
    ["gas", "gás"],
    ["taxi", "transfer"],
    ["uber", "transfer"]
]);

export function normalizeGuidelineText(value = "") {
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9€]+/g, " ")
        .trim();
}

export function getOperationalGuidelineItems(sections = OPERATIONAL_GUIDELINE_SECTIONS) {
    return sections.flatMap((section) => {
        return section.items.map((item) => ({
            ...item,
            sectionId: section.id,
            sectionTitle: section.title
        }));
    });
}

function cloneSections(sections = OPERATIONAL_GUIDELINE_SECTIONS) {
    return sections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({ ...item, keywords: [...(item.keywords || [])] }))
    }));
}

export function buildOperationalGuidelineSections({
    baseSections = OPERATIONAL_GUIDELINE_SECTIONS,
    protocols = [],
    deletedIds = []
} = {}) {
    const sections = cloneSections(baseSections);
    const deleted = new Set(deletedIds || []);

    sections.forEach((section) => {
        section.items = section.items.filter((item) => !deleted.has(item.id));
    });

    const ensureSection = (sectionId, sectionTitle) => {
        let section = sections.find((entry) => entry.id === sectionId);
        if (!section) {
            section = {
                id: sectionId || "custom",
                title: sectionTitle || "Protocolos personalizados",
                summary: "Protocolos adicionados pela equipa.",
                items: []
            };
            sections.push(section);
        }
        return section;
    };

    protocols.forEach((protocol) => {
        if (!protocol?.id || deleted.has(protocol.id)) {
            return;
        }

        sections.forEach((section) => {
            section.items = section.items.filter((item) => item.id !== protocol.id);
        });

        const section = ensureSection(protocol.sectionId || "custom", protocol.sectionTitle || "Protocolos personalizados");
        section.items.push({
            id: protocol.id,
            number: protocol.number || "Novo",
            title: protocol.title || "Novo protocolo",
            action: protocol.action || "",
            response: protocol.response || "",
            keywords: Array.isArray(protocol.keywords) ? protocol.keywords : [],
            isCustom: Boolean(protocol.isCustom),
            isEdited: Boolean(protocol.isEdited)
        });
    });

    return sections.filter((section) => section.items.length > 0);
}

export function tokenizeGuidelineQuery(query = "") {
    const normalized = normalizeGuidelineText(query);
    if (!normalized) {
        return [];
    }

    const tokens = normalized
        .split(/\s+/)
        .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

    return Array.from(new Set(tokens.flatMap((token) => {
        const synonym = SYNONYMS.get(token);
        return synonym ? [token, normalizeGuidelineText(synonym)] : [token];
    })));
}

function scoreItem(item, normalizedQuery, tokens) {
    const title = normalizeGuidelineText(item.title);
    const action = normalizeGuidelineText(item.action);
    const response = normalizeGuidelineText(item.response);
    const section = normalizeGuidelineText(item.sectionTitle);
    const keywords = normalizeGuidelineText((item.keywords || []).join(" "));
    const haystack = `${title} ${action} ${response} ${section} ${keywords}`;

    let score = 0;

    if (normalizedQuery && haystack.includes(normalizedQuery)) {
        score += 60;
    }

    tokens.forEach((token) => {
        if (title.includes(token)) score += 18;
        if (keywords.includes(token)) score += 14;
        if (action.includes(token)) score += 9;
        if (response.includes(token)) score += 5;
        if (section.includes(token)) score += 4;
    });

    return score;
}

export function searchOperationalGuidelines(query, options = {}) {
    const items = getOperationalGuidelineItems(options.sections);
    const normalizedQuery = normalizeGuidelineText(query);
    const tokens = tokenizeGuidelineQuery(query);

    if (!normalizedQuery || !tokens.length) {
        return items.map((item) => ({ ...item, score: 0 }));
    }

    return items
        .map((item) => ({ ...item, score: scoreItem(item, normalizedQuery, tokens) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || Number(a.number) - Number(b.number));
}

export function findOperationalGuidelineById(id, sections = OPERATIONAL_GUIDELINE_SECTIONS) {
    return getOperationalGuidelineItems(sections).find((item) => item.id === id) || null;
}
