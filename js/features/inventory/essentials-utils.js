export const DEFAULT_BED_SIZE_OPTIONS = Object.freeze([
    { id: "single-90", type: "single", size: "90x200cm", label: { en: "Single Bed", pt: "Cama individual" } },
    { id: "double-140", type: "double", size: "140x200cm", label: { en: "Double Bed", pt: "Cama de casal" } },
    { id: "double-150", type: "double", size: "150x200cm", label: { en: "Double Bed", pt: "Cama de casal" } },
    { id: "queen-160", type: "queen", size: "160x200cm", label: { en: "Queen Bed", pt: "Cama queen" } },
    { id: "king-180", type: "king", size: "180x200cm", label: { en: "King Bed", pt: "Cama king" } },
    { id: "sofa-bed", type: "sofaBed", size: "150x200cm", label: { en: "Sofa Bed", pt: "Sofa cama" } },
    { id: "cot", type: "cot", size: "Baby cot", label: { en: "Baby Cot", pt: "Berco" } },
    { id: "custom", type: "custom", size: "", label: { en: "Other size", pt: "Outro tamanho" } }
]);

export const DEFAULT_ESSENTIALS_TEMPLATE = Object.freeze({
    version: 1,
    title: {
        en: "AL Essentials List",
        pt: "Lista de Essenciais AL"
    },
    bedBedding: {
        categoryLabel: {
            en: "Bedding - {{size}}",
            pt: "Cama - {{size}}"
        },
        sofaCategoryLabel: {
            en: "Sofa bed - {{size}}",
            pt: "Sofa cama - {{size}}"
        },
        items: [
            {
                id: "mattress-protectors",
                label: { en: "Mattress Protectors", pt: "Protetores de colchao" },
                rule: { type: "perScopedBed", multiplier: 2 },
                comment: { en: "Changes per bed", pt: "Mudancas por cama" }
            },
            {
                id: "fitted-sheets",
                label: { en: "Fitted Sheets", pt: "Lencois ajustaveis" },
                rule: { type: "perScopedBed", multiplier: 3 },
                comment: { en: "Changes per bed", pt: "Mudancas por cama" }
            },
            {
                id: "flat-sheets",
                label: { en: "Flat Sheets", pt: "Lencois de cima" },
                rule: { type: "perScopedBed", multiplier: 3 },
                comment: { en: "Changes per bed", pt: "Mudancas por cama" }
            },
            {
                id: "duvets",
                label: { en: "Duvets", pt: "Edredoes" },
                rule: { type: "perScopedBed", multiplier: 2 },
                comment: { en: "Changes per bed", pt: "Mudancas por cama" }
            },
            {
                id: "duvet-covers",
                label: { en: "Duvet Covers", pt: "Capas de edredao" },
                rule: { type: "perScopedBed", multiplier: 3 },
                comment: { en: "Changes per bed", pt: "Mudancas por cama" }
            }
        ]
    },
    categories: [
        {
            id: "towels",
            label: { en: "Towels", pt: "Toalhas" },
            items: [
                { id: "bath-towel", label: { en: "Bath Towel", pt: "Toalha de banho" }, rule: { type: "perGuest", multiplier: 3 } },
                { id: "hand-towel", label: { en: "Hand Towel", pt: "Toalha de rosto" }, rule: { type: "perGuest", multiplier: 3 } },
                {
                    id: "pool-towel",
                    label: { en: "Pool Towel", pt: "Toalha de piscina" },
                    rule: { type: "condition", condition: "hasPool", whenTrue: { type: "perGuest", multiplier: 3 }, whenFalse: { type: "text", value: "-" } },
                    comment: { en: "Only if there is a pool", pt: "Apenas se houver piscina" }
                },
                { id: "bath-mat", label: { en: "Bath Mat", pt: "Tapete de banho" }, rule: { type: "perBathroom", multiplier: 3 } }
            ]
        },
        {
            id: "pillows",
            label: { en: "Pillows", pt: "Almofadas" },
            items: [
                { id: "rectangular-square-pillows", label: { en: "Rectangular or Square Pillows", pt: "Almofadas retangulares ou quadradas" }, rule: { type: "perGuest", multiplier: 1.5 } },
                { id: "pillow-protectors", label: { en: "Pillow Protectors", pt: "Protetores de almofada" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "pillowcases", label: { en: "Pillowcases/Covers", pt: "Fronhas/capas de almofada" }, rule: { type: "perGuest", multiplier: 3 } }
            ]
        },
        {
            id: "bedrooms",
            label: { en: "Bedrooms", pt: "Quartos" },
            items: [
                { id: "wooden-hangers", label: { en: "Wooden Hangers", pt: "Cabides de madeira" }, rule: { type: "text", value: "20 per room", valuePt: "20 por quarto" } },
                { id: "blackout-curtains", label: { en: "Blackout Curtains or Blinds", pt: "Cortinas blackout ou estores" }, rule: { type: "text", value: "-" }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "full-length-mirror", label: { en: "Full-Length Mirror", pt: "Espelho de corpo inteiro" }, rule: { type: "text", value: "1 per room", valuePt: "1 por quarto" }, comment: { en: "Optional", pt: "Opcional" } },
                { id: "extension-cord", label: { en: "Triple Plug Adapter or Extension Cord", pt: "Adaptador triplo ou extensao" }, rule: { type: "text", value: "2 per room", valuePt: "2 por quarto" } },
                { id: "decorative-throw", label: { en: "Decorative Throw Blanket", pt: "Manta decorativa" }, rule: { type: "text", value: "1 per room", valuePt: "1 por quarto" } },
                { id: "decorative-pillows", label: { en: "Decorative Pillows", pt: "Almofadas decorativas" }, rule: { type: "text", value: "2 per bed", valuePt: "2 por cama" }, comment: { en: "Ideal for photos", pt: "Ideal para fotografias" } },
                { id: "portable-fan", label: { en: "Portable Fan", pt: "Ventoinha portatil" }, rule: { type: "text", value: "1 per room", valuePt: "1 por quarto" }, comment: { en: "Optional", pt: "Opcional" } },
                { id: "portable-heater", label: { en: "Portable Heater", pt: "Aquecedor portatil" }, rule: { type: "text", value: "1 per room", valuePt: "1 por quarto" }, comment: { en: "Optional", pt: "Opcional" } },
                { id: "air-conditioning", label: { en: "Air Conditioning", pt: "Ar condicionado" }, rule: { type: "text", value: "1 per room", valuePt: "1 por quarto" }, comment: { en: "Optional", pt: "Opcional" } }
            ]
        },
        {
            id: "bathroom",
            label: { en: "Bathroom", pt: "Casa de banho" },
            items: [
                { id: "hair-dryer", label: { en: "Hair Dryer", pt: "Secador de cabelo" }, rule: { type: "perBathroom", multiplier: 1 } },
                { id: "toilet-brush", label: { en: "Toilet Brush", pt: "Piacaba" }, rule: { type: "perBathroom", multiplier: 1 } },
                { id: "trash-bin-bathroom", label: { en: "Trash Bin", pt: "Caixote do lixo" }, rule: { type: "perBathroom", multiplier: 1 } },
                { id: "plunger", label: { en: "Plunger", pt: "Desentupidor" }, rule: { type: "fixed", value: 1 } }
            ]
        },
        {
            id: "kitchen",
            label: { en: "Kitchen", pt: "Cozinha" },
            items: [
                { id: "recycling-bin", group: { en: "Waste", pt: "Lixo" }, label: { en: "Recycling Bin (blue, yellow, green)", pt: "Ecopontos (azul, amarelo, verde)" }, rule: { type: "fixed", value: 1 } },
                { id: "general-waste-bin", group: { en: "Waste", pt: "Lixo" }, label: { en: "Trash Bin for General Waste", pt: "Caixote para lixo indiferenciado" }, rule: { type: "fixed", value: 1 } },
                { id: "dinner-plates", group: { en: "Dishes and Plates", pt: "Pratos" }, label: { en: "Dinner Plates", pt: "Pratos rasos" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "soup-plates", group: { en: "Dishes and Plates", pt: "Pratos" }, label: { en: "Soup Plates", pt: "Pratos de sopa" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "dessert-plates", group: { en: "Dishes and Plates", pt: "Pratos" }, label: { en: "Dessert Plates", pt: "Pratos de sobremesa" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "cereal-bowls", group: { en: "Dishes and Plates", pt: "Pratos" }, label: { en: "Cereal Bowls", pt: "Tacas" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "serving-dishes", group: { en: "Dishes and Plates", pt: "Pratos" }, label: { en: "Serving Dishes", pt: "Travessas" }, rule: { type: "fixed", value: 2 } },
                { id: "juice-glasses", group: { en: "Glasses and Mugs", pt: "Copos e canecas" }, label: { en: "Juice Glasses", pt: "Copos de sumo" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "wine-glasses", group: { en: "Glasses and Mugs", pt: "Copos e canecas" }, label: { en: "Wine Glasses", pt: "Copos de vinho" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "tea-mugs", group: { en: "Glasses and Mugs", pt: "Copos e canecas" }, label: { en: "Tea Mugs", pt: "Canecas de cha" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "coffee-cups", group: { en: "Glasses and Mugs", pt: "Copos e canecas" }, label: { en: "Coffee Cups", pt: "Chavenas de cafe" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "forks", group: { en: "Cutlery", pt: "Talheres" }, label: { en: "Forks", pt: "Garfos" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "knives", group: { en: "Cutlery", pt: "Talheres" }, label: { en: "Knives", pt: "Facas" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "spoons", group: { en: "Cutlery", pt: "Talheres" }, label: { en: "Spoons", pt: "Colheres" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "teaspoons", group: { en: "Cutlery", pt: "Talheres" }, label: { en: "Teaspoons", pt: "Colheres de cha" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "small-cutting-board", group: { en: "Miscellaneous Utensils", pt: "Utensilios diversos" }, label: { en: "Small Cutting Board", pt: "Tabua de corte pequena" }, rule: { type: "fixed", value: 1 } },
                { id: "medium-cutting-board", group: { en: "Miscellaneous Utensils", pt: "Utensilios diversos" }, label: { en: "Medium Cutting Board", pt: "Tabua de corte media" }, rule: { type: "fixed", value: 1 } },
                { id: "kitchen-towels", group: { en: "Miscellaneous Utensils", pt: "Utensilios diversos" }, label: { en: "Kitchen Towel(s)", pt: "Panos de cozinha" }, rule: { type: "fixed", value: 5 } },
                { id: "corkscrew", group: { en: "Miscellaneous Utensils", pt: "Utensilios diversos" }, label: { en: "Corkscrew", pt: "Saca-rolhas" }, rule: { type: "fixed", value: 1 } },
                { id: "dish-drying-rack", group: { en: "Miscellaneous Utensils", pt: "Utensilios diversos" }, label: { en: "Dish Drying Rack", pt: "Escorredor de loica" }, rule: { type: "fixed", value: 1 } },
                { id: "medium-pot", group: { en: "Pots and Pans", pt: "Tachos e frigideiras" }, label: { en: "Medium Pot", pt: "Tacho medio" }, rule: { type: "fixed", value: 1 } },
                { id: "large-pot", group: { en: "Pots and Pans", pt: "Tachos e frigideiras" }, label: { en: "Large Pot", pt: "Tacho grande" }, rule: { type: "fixed", value: 1 } },
                { id: "medium-frying-pan", group: { en: "Pots and Pans", pt: "Tachos e frigideiras" }, label: { en: "Medium Frying Pan", pt: "Frigideira media" }, rule: { type: "fixed", value: 1 } },
                { id: "large-frying-pan", group: { en: "Pots and Pans", pt: "Tachos e frigideiras" }, label: { en: "Large Frying Pan", pt: "Frigideira grande" }, rule: { type: "fixed", value: 1 } },
                { id: "refrigerator", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Refrigerator", pt: "Frigorifico" }, rule: { type: "fixed", value: 1 } },
                { id: "freezer", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Freezer", pt: "Congelador" }, rule: { type: "fixed", value: 1 } },
                { id: "microwave", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Microwave", pt: "Micro-ondas" }, rule: { type: "fixed", value: 1 } },
                { id: "coffee-machine", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "'Dolce Gusto' Coffee Machine", pt: "Maquina de cafe 'Dolce Gusto'" }, rule: { type: "fixed", value: 1 } },
                { id: "kettle", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Electric Kettle", pt: "Chaleira eletrica" }, rule: { type: "fixed", value: 1 } },
                { id: "toaster", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Toaster", pt: "Torradeira" }, rule: { type: "fixed", value: 1 } },
                { id: "blender", group: { en: "Appliances", pt: "Eletrodomesticos" }, label: { en: "Blender", pt: "Liquidificadora" }, rule: { type: "fixed", value: 1 } }
            ]
        },
        {
            id: "laundry",
            label: { en: "Laundry", pt: "Lavandaria" },
            items: [
                { id: "washing-machine", label: { en: "Washing Machine", pt: "Maquina de lavar roupa" }, rule: { type: "fixed", value: 1 } },
                { id: "clothes-dryer", label: { en: "Clothes Dryer", pt: "Maquina de secar roupa" }, rule: { type: "fixed", value: 1 } },
                { id: "iron", label: { en: "Iron", pt: "Ferro de engomar" }, rule: { type: "fixed", value: 1 } },
                { id: "ironing-board", label: { en: "Ironing Board", pt: "Tabua de engomar" }, rule: { type: "fixed", value: 1 } },
                { id: "vacuum-cleaner", label: { en: "Vacuum Cleaner", pt: "Aspirador" }, rule: { type: "fixed", value: 1 } },
                { id: "laundry-basket", label: { en: "Laundry Basket", pt: "Cesto de roupa" }, rule: { type: "fixed", value: 1 } }
            ]
        },
        {
            id: "living-dining",
            label: { en: "Living/Dining Room", pt: "Sala de estar/jantar" },
            items: [
                { id: "internet", label: { en: "Internet", pt: "Internet" }, rule: { type: "fixed", value: 1 } },
                { id: "smart-tv", label: { en: "Smart TV", pt: "Smart TV" }, rule: { type: "fixed", value: 1 } },
                { id: "tablecloth", label: { en: "Tablecloth", pt: "Toalha de mesa" }, rule: { type: "fixed", value: 3 } },
                { id: "placemats", label: { en: "Placemats", pt: "Individuais de mesa" }, rule: { type: "perGuest", multiplier: 2 } },
                { id: "sofa-throws", label: { en: "Sofa Throws", pt: "Mantas de sofa" }, rule: { type: "fixed", value: 3 } }
            ]
        },
        {
            id: "others",
            label: { en: "Others", pt: "Outros" },
            items: [
                { id: "fire-extinguisher", label: { en: "Fire Extinguisher", pt: "Extintor" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "fire-blanket", label: { en: "Fire Blanket", pt: "Manta ignifuga" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "first-aid-kit", label: { en: "First Aid Kit", pt: "Kit de primeiros socorros" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "signage", label: { en: "Signage", pt: "Sinaletica" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "smoke-detector", label: { en: "Smoke Detector", pt: "Detetor de fumo" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "portable-crib", label: { en: "Portable Crib", pt: "Berco portatil" }, rule: { type: "condition", condition: "needsBabyItems", whenTrue: { type: "fixed", value: 1 }, whenFalse: { type: "text", value: "-" } }, comment: { en: "If needed", pt: "Se necessario" } },
                { id: "crib-mattress", label: { en: "Mattress for the Crib", pt: "Colchao para berco" }, rule: { type: "condition", condition: "needsBabyItems", whenTrue: { type: "fixed", value: 1 }, whenFalse: { type: "text", value: "-" } }, comment: { en: "If needed", pt: "Se necessario" } },
                { id: "baby-high-chair", label: { en: "Baby High Chair", pt: "Cadeira de bebe" }, rule: { type: "condition", condition: "needsBabyItems", whenTrue: { type: "fixed", value: 1 }, whenFalse: { type: "text", value: "-" } }, comment: { en: "If needed", pt: "Se necessario" } },
                { id: "bedding-storage", label: { en: "Furniture for Storing Bedding and Towels", pt: "Movel para guardar roupa de cama e toalhas" }, rule: { type: "fixed", value: 1 } }
            ]
        },
        {
            id: "documents",
            label: { en: "Documents", pt: "Documentos" },
            items: [
                { id: "house-guide-inspection", label: { en: "House Guide for Inspection", pt: "Guia da casa para inspeccao" }, rule: { type: "fixed", value: 1 } },
                { id: "liability-insurance", label: { en: "Liability Insurance", pt: "Seguro de responsabilidade civil" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } },
                { id: "complaints-book", label: { en: "Complaints Book", pt: "Livro de reclamacoes" }, rule: { type: "fixed", value: 1 }, comment: { en: "Legally required", pt: "Obrigatorio por lei" } }
            ],
            notes: {
                en: [
                    "Instruction manuals for all appliances should be available, as legally required.",
                    "Atlantic Holiday can share contacts for safety kits and insurance if needed.",
                    "The house guide will be provided before the City Council inspection.",
                    "The complaints book must be obtained from ACIF."
                ],
                pt: [
                    "Os manuais de instrucoes dos eletrodomesticos devem estar disponiveis, conforme exigido por lei.",
                    "A Atlantic Holiday pode partilhar contactos para kits de seguranca e seguros, se necessario.",
                    "O guia da casa sera fornecido antes da inspeccao da Camara Municipal.",
                    "O livro de reclamacoes deve ser obtido junto da ACIF."
                ]
            }
        }
    ]
});

export function cloneEssentialsTemplate(template = DEFAULT_ESSENTIALS_TEMPLATE) {
    return JSON.parse(JSON.stringify(template || DEFAULT_ESSENTIALS_TEMPLATE));
}

export function getLocalized(value, lang = "en", fallback = "") {
    if (value == null) return fallback;
    if (typeof value === "string" || typeof value === "number") return String(value);
    return value[lang] || value.en || value.pt || fallback;
}

export function sanitizeFilename(value = "Essentials List") {
    return String(value || "Essentials List")
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || "Essentials List";
}

export function normalizeEssentialsInputs(inputs = {}) {
    const beds = Array.isArray(inputs.beds) ? inputs.beds : [];
    return {
        listName: String(inputs.listName || "").trim(),
        propertyId: String(inputs.propertyId || "").trim(),
        propertyName: String(inputs.propertyName || inputs.listName || "").trim(),
        language: inputs.language === "pt" ? "pt" : "en",
        bedrooms: Math.max(0, Number.parseInt(inputs.bedrooms, 10) || 0),
        guests: Math.max(0, Number.parseInt(inputs.guests, 10) || 0),
        bathrooms: Math.max(0, Number.parseFloat(inputs.bathrooms) || 0),
        hasPool: Boolean(inputs.hasPool),
        needsBabyItems: Boolean(inputs.needsBabyItems),
        internalNotes: String(inputs.internalNotes || "").trim(),
        beds: beds.map((bed, index) => normalizeBed(bed, index)).filter((bed) => bed.size || bed.type === "cot")
    };
}

function normalizeBed(bed = {}, index = 0) {
    const preset = DEFAULT_BED_SIZE_OPTIONS.find((option) => option.id === bed.optionId) || null;
    const type = bed.type || preset?.type || "custom";
    const customSize = String(bed.customSize || "").trim();
    const size = customSize || bed.size || preset?.size || "";
    return {
        id: bed.id || `bed-${index + 1}`,
        optionId: bed.optionId || preset?.id || "custom",
        type,
        size,
        label: bed.label || getLocalized(preset?.label, "en", "Bed")
    };
}

export function validateEssentialsTemplate(template) {
    if (!template || typeof template !== "object") return ["Template must be an object."];
    const errors = [];
    if (!template.bedBedding?.items?.length) errors.push("Template needs bedBedding.items.");
    if (!Array.isArray(template.categories)) errors.push("Template needs a categories array.");
    (template.categories || []).forEach((category, index) => {
        if (!category.id) errors.push(`Category ${index + 1} is missing id.`);
        if (!Array.isArray(category.items)) errors.push(`Category ${category.id || index + 1} needs an items array.`);
    });
    return errors;
}

export function buildEssentialsList(inputs = {}, templateInput = DEFAULT_ESSENTIALS_TEMPLATE, ownerInventory = {}) {
    const context = normalizeEssentialsInputs(inputs);
    const template = cloneEssentialsTemplate(templateInput);
    const rows = [];
    const lang = context.language;

    groupBedsForBedding(context.beds).forEach((bedGroup) => {
        const labelTemplate = bedGroup.type === "sofaBed"
            ? template.bedBedding?.sofaCategoryLabel
            : template.bedBedding?.categoryLabel;
        const category = getLocalized(labelTemplate, lang, "Bedding - {{size}}").replace("{{size}}", bedGroup.size);
        (template.bedBedding?.items || []).forEach((item) => {
            rows.push(createRow({
                categoryId: `bedding-${bedGroup.key}`,
                category,
                item,
                context,
                lang,
                scope: { bedCount: bedGroup.count, size: bedGroup.size },
                ownerInventory
            }));
        });
    });

    (template.categories || []).forEach((category) => {
        const categoryLabel = getLocalized(category.label, lang, category.id || "Category");
        (category.items || []).forEach((item) => {
            rows.push(createRow({
                categoryId: category.id,
                category: categoryLabel,
                item,
                context,
                lang,
                ownerInventory
            }));
        });
    });

    return {
        id: inputs.id || "",
        createdAt: inputs.createdAt || null,
        updatedAt: inputs.updatedAt || null,
        inputs: context,
        templateSnapshot: template,
        rows,
        notes: collectNotes(template, lang)
    };
}

function groupBedsForBedding(beds = []) {
    const grouped = new Map();
    beds.filter((bed) => bed.type !== "cot").forEach((bed) => {
        const size = bed.size || "Custom size";
        const key = `${bed.type}-${size}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        if (!grouped.has(key)) grouped.set(key, { key, size, type: bed.type, count: 0 });
        grouped.get(key).count += 1;
    });
    return [...grouped.values()];
}

function createRow({ categoryId, category, item, context, lang, scope = {}, ownerInventory = {} }) {
    const ahQuantity = calculateRule(item.rule || { type: "text", value: "" }, context, scope, lang);
    const id = `${categoryId}:${item.id || slugify(getLocalized(item.label, lang, "item"))}:${scope.size || ""}`;
    const owner = ownerInventory[id] || {};
    return {
        id,
        categoryId,
        category,
        group: getLocalized(item.group, lang, ""),
        itemId: item.id || id,
        item: getLocalized(item.label, lang, item.id || "Item"),
        ahQuantity,
        ahComment: getLocalized(item.comment, lang, ""),
        ownerQty: owner.ownerQty || "",
        ownerBrand: owner.ownerBrand || "",
        ownerComments: owner.ownerComments || ""
    };
}

export function calculateRule(rule = {}, context = {}, scope = {}, lang = "en") {
    const ceil = (value) => Math.ceil(Math.max(0, Number(value) || 0));
    switch (rule.type) {
        case "fixed":
            return String(rule.value ?? "");
        case "perGuest":
            return String(ceil((context.guests || 0) * (Number(rule.multiplier) || 0)));
        case "perBedroom":
            return String(ceil((context.bedrooms || 0) * (Number(rule.multiplier) || 0)));
        case "perBathroom":
            return String(ceil((context.bathrooms || 0) * (Number(rule.multiplier) || 0)));
        case "perBed":
            return String(ceil((context.beds?.filter((bed) => bed.type !== "cot").length || 0) * (Number(rule.multiplier) || 0)));
        case "perScopedBed":
            return String(ceil((scope.bedCount || 0) * (Number(rule.multiplier) || 0)));
        case "condition": {
            const conditionMet = Boolean(context[rule.condition]);
            return calculateRule(conditionMet ? rule.whenTrue : rule.whenFalse, context, scope, lang);
        }
        case "text":
            return lang === "pt" && rule.valuePt ? String(rule.valuePt) : String(rule.value ?? "");
        default:
            return "";
    }
}

function collectNotes(template = {}, lang = "en") {
    return (template.categories || []).flatMap((category) => {
        const notes = category.notes;
        if (!notes) return [];
        const localized = Array.isArray(notes) ? notes : notes[lang] || notes.en || [];
        return localized.map((note) => ({
            category: getLocalized(category.label, lang, category.id),
            note
        }));
    });
}

function slugify(value = "") {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}
