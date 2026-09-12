import { describe, test, assert } from "../../../test-harness.js";
import {
    calculateChecklistProgress,
    calculatePropertyInventory,
    createDefaultChecklist,
    FRONT_DESK_COLLEAGUES,
    getInitialProperties,
    INITIAL_NEW_PROPERTIES,
    normalizeProperty
} from "../../../../js/features/properties/new-properties-utils.js";

describe("New Properties Utils", () => {
    test("calculatePropertyInventory calculates standard 1-bedroom 2-guest quantities", () => {
        const inv = calculatePropertyInventory({
            bedrooms: 1,
            bathrooms: 1,
            capacity: 2,
            beds: [{ type: "queen", size: "160x200cm", count: 1 }]
        });

        assert.equal(inv.bedrooms, 1);
        assert.equal(inv.bathrooms, 1);
        assert.equal(inv.capacity, 2);
        assert.equal(inv.regularBedsCount, 1);

        const bedroomCat = inv.categories.find(c => c.id === "bedroom");
        assert.ok(bedroomCat, "Bedroom category exists");
        assert.equal(bedroomCat.items.find(i => i.id === "cabides").qty, 20); // 20 per room
        assert.equal(bedroomCat.items.find(i => i.id === "espelho_corpo").qty, 1);
        assert.equal(bedroomCat.items.find(i => i.id === "ficha_tripla").qty, 2); // 2 per room
        assert.equal(bedroomCat.items.find(i => i.id === "almofadas_decorativas").qty, 2); // 2 per bed

        const bathroomCat = inv.categories.find(c => c.id === "bathroom");
        assert.ok(bathroomCat, "Bathroom category exists");
        assert.equal(bathroomCat.items.find(i => i.id === "secador_cabelo").qty, 1);
        assert.equal(bathroomCat.items.find(i => i.id === "escova_sanita").qty, 1);
        assert.equal(bathroomCat.items.find(i => i.id === "desentupidor").qty, 1);

        const kitchenCat = inv.categories.find(c => c.id === "kitchen");
        assert.ok(kitchenCat, "Kitchen category exists");
        assert.equal(kitchenCat.items.find(i => i.id === "pratos_rasos").qty, 4); // 2 * capacity (min 4)
        assert.equal(kitchenCat.items.find(i => i.id === "garfos").qty, 4);
        assert.equal(kitchenCat.items.find(i => i.id === "panos_cozinha").qty, 5);

        const linensCat = inv.categories.find(c => c.id === "linens");
        assert.ok(linensCat, "Linens category exists");
        assert.equal(linensCat.items.find(i => i.id === "protetor_colchao").qty, 2); // 2 per bed
        assert.equal(linensCat.items.find(i => i.id === "lencol_ajustavel").qty, 3); // 3 per bed
        assert.equal(linensCat.items.find(i => i.id === "edredao").qty, 2); // 2 per bed
        assert.equal(linensCat.items.find(i => i.id === "toalha_banho").qty, 6); // 3 per guest
        assert.equal(linensCat.items.find(i => i.id === "tapete_banho").qty, 3); // 3 per bathroom
    });

    test("calculatePropertyInventory dynamically adjusts when bedrooms, bathrooms, capacity and beds increase", () => {
        const inv = calculatePropertyInventory({
            bedrooms: 3,
            bathrooms: 2,
            capacity: 6,
            beds: [
                { type: "king", size: "180x200cm", count: 1 },
                { type: "queen", size: "160x200cm", count: 1 },
                { type: "single", size: "90x200cm", count: 2 }
            ]
        });

        assert.equal(inv.regularBedsCount, 4); // 1 + 1 + 2

        const bedroomCat = inv.categories.find(c => c.id === "bedroom");
        assert.equal(bedroomCat.items.find(i => i.id === "cabides").qty, 60); // 3 * 20
        assert.equal(bedroomCat.items.find(i => i.id === "ficha_tripla").qty, 6); // 3 * 2
        assert.equal(bedroomCat.items.find(i => i.id === "almofadas_decorativas").qty, 8); // 4 beds * 2

        const bathroomCat = inv.categories.find(c => c.id === "bathroom");
        assert.equal(bathroomCat.items.find(i => i.id === "secador_cabelo").qty, 2); // 2 bathrooms
        assert.equal(bathroomCat.items.find(i => i.id === "escova_sanita").qty, 2);

        const kitchenCat = inv.categories.find(c => c.id === "kitchen");
        assert.equal(kitchenCat.items.find(i => i.id === "pratos_rasos").qty, 12); // 6 guests * 2
        assert.equal(kitchenCat.items.find(i => i.id === "garfos").qty, 12);
        assert.equal(kitchenCat.items.find(i => i.id === "copos_vinho").qty, 12);

        const linensCat = inv.categories.find(c => c.id === "linens");
        assert.equal(linensCat.items.find(i => i.id === "protetor_colchao").qty, 8); // 4 beds * 2
        assert.equal(linensCat.items.find(i => i.id === "lencol_ajustavel").qty, 12); // 4 beds * 3
        assert.equal(linensCat.items.find(i => i.id === "toalha_banho").qty, 18); // 6 guests * 3
        assert.equal(linensCat.items.find(i => i.id === "tapete_banho").qty, 6); // 2 bathrooms * 3
        assert.equal(linensCat.items.find(i => i.id === "almofadas_dormir").qty, 9); // ceil(6 * 1.5)
    });

    test("calculatePropertyInventory ignores cots for regular bed linens", () => {
        const inv = calculatePropertyInventory({
            bedrooms: 2,
            bathrooms: 1,
            capacity: 4,
            beds: [
                { type: "queen", size: "160x200cm", count: 1 },
                { type: "cot", size: "60x120cm", count: 1 }
            ]
        });

        assert.equal(inv.regularBedsCount, 1);
        assert.equal(inv.totalBedsCount, 2);

        const linensCat = inv.categories.find(c => c.id === "linens");
        assert.equal(linensCat.items.find(i => i.id === "protetor_colchao").qty, 2); // only 1 regular bed * 2
    });

    test("calculateChecklistProgress computes percentage accurately", () => {
        const checklist = createDefaultChecklist();
        const initial = calculateChecklistProgress(checklist);
        assert.equal(initial.completed, 0);
        assert.equal(initial.percent, 0);
        assert.ok(initial.total > 10, "Template has more than 10 onboarding tasks");

        // Mark first 3 tasks done
        checklist[0].tasks[0].done = true;
        checklist[0].tasks[1].done = true;
        checklist[1].tasks[0].done = true;

        const updated = calculateChecklistProgress(checklist);
        assert.equal(updated.completed, 3);
        assert.equal(updated.percent, Math.round((3 / updated.total) * 100));
    });

    test("INITIAL_NEW_PROPERTIES contains 42 properties across 3 pipeline groups", () => {
        assert.equal(INITIAL_NEW_PROPERTIES.length, 42);

        const inProgress = INITIAL_NEW_PROPERTIES.filter(p => p.status === "in_progress");
        const waiting = INITIAL_NEW_PROPERTIES.filter(p => p.status === "waiting");
        const completed = INITIAL_NEW_PROPERTIES.filter(p => p.status === "completed");

        assert.equal(inProgress.length, 18, "18 properties in progress");
        assert.equal(waiting.length, 4, "4 properties waiting");
        assert.equal(completed.length, 20, "20 completed properties");

        const sunnyStay = INITIAL_NEW_PROPERTIES.find(p => p.name === "Sunny Stay Atlantic Gardens");
        assert.ok(sunnyStay, "Sunny Stay Atlantic Gardens is present");
        assert.equal(sunnyStay.empresaLimpeza, "Powa Washing");
        assert.equal(sunnyStay.quadrosWifi, "Em Falta");
    });

    test("getInitialProperties normalizes and syncs initial pipeline tasks with checklist", () => {
        const properties = getInitialProperties();
        assert.equal(properties.length, 42);

        const sunnyStay = properties.find(p => p.name === "Sunny Stay Atlantic Gardens");
        assert.ok(sunnyStay);
        assert.equal(sunnyStay.pipeline.limpeza.empresaLimpeza, "Powa Washing");

        // Sets completos was "Sim", so chaves_sets should be marked done
        const chavesGroup = sunnyStay.checklist.find(g => g.area === "Chaves");
        assert.ok(chavesGroup);
        const setsTask = chavesGroup.tasks.find(t => t.id === "chaves_sets");
        assert.ok(setsTask);
        assert.equal(setsTask.done, true);
    });

    test("FRONT_DESK_COLLEAGUES associates real staff members and excludes André / João placeholder", () => {
        assert.ok(FRONT_DESK_COLLEAGUES.includes("André Marques"), "André Marques is in Front Desk staff");
        assert.ok(FRONT_DESK_COLLEAGUES.includes("João Pinto"), "João Pinto is in Front Desk staff");
        assert.ok(FRONT_DESK_COLLEAGUES.includes("Marta Camacho"), "Marta Camacho is in Front Desk staff");
        assert.ok(FRONT_DESK_COLLEAGUES.includes("Celso Ferreira"), "Celso Ferreira is in Front Desk staff");
        assert.ok(!FRONT_DESK_COLLEAGUES.includes("André / João"), "Placeholder André / João is excluded from staff directory");

        const merlot = INITIAL_NEW_PROPERTIES.find(p => p.name === "Merlot Apartment");
        assert.ok(merlot);
        assert.equal(merlot.collaborator, "André Marques", "Merlot Apartment is associated with André Marques");

        const sunnyStay = INITIAL_NEW_PROPERTIES.find(p => p.name === "Sunny Stay Atlantic Gardens");
        assert.ok(sunnyStay);
        assert.equal(sunnyStay.collaborator, "João Pinto", "Sunny Stay is associated with João Pinto");

        const checklist = createDefaultChecklist();
        const alojGroup = checklist.find(g => g.area === "Alojamento");
        assert.ok(alojGroup);
        assert.ok(alojGroup.tasks.every(t => t.responsible !== "André / João"), "Lodging tasks do not have André / João placeholder");

        // Normalizing legacy property with 'André / João' cleanly migrates
        const legacyProp = normalizeProperty({ name: "Merlot Apartment", collaborator: "André / João" });
        assert.equal(legacyProp.collaborator, "André Marques", "Legacy André / João placeholder migrates to André Marques");
    });
});
