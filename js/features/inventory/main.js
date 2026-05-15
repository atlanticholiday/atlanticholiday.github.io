import { InventoryManager } from './inventory-manager.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { enableIndexedDbPersistence, getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { Config } from "../../core/config.js";
import { i18n } from "../../core/i18n.js";
import { PlenoHotelManager } from "./plenohotel-manager.js";

document.addEventListener('DOMContentLoaded', async () => {
    await i18n.init();
    i18n.setupLanguageSwitcher();
    updateInventoryStaticCopy();
    InventoryManager.init();
    setupInventoryTabs();
    setupPlenoHotel();
    window.addEventListener("languageChanged", () => {
        updateInventoryStaticCopy();
        window.plenoHotelManager?.render?.();
    });
});

const INVENTORY_STATIC_COPY = {
    en: {
        savedLists: "Saved Lists",
        kicker: "Inventory",
        title: "Essentials and PlenoHotel",
        essentialsTab: "Essentials generator",
        plenoHotelTab: "PlenoHotel"
    },
    pt: {
        savedLists: "Listas guardadas",
        kicker: "Inventário",
        title: "Essenciais e PlenoHotel",
        essentialsTab: "Gerador de essenciais",
        plenoHotelTab: "PlenoHotel"
    }
};

function getInventoryLang() {
    return i18n.getCurrentLanguage?.() === "pt" ? "pt" : "en";
}

function updateInventoryStaticCopy() {
    const copy = INVENTORY_STATIC_COPY[getInventoryLang()];
    const savedLists = document.getElementById("load-saved-btn");
    const kicker = document.querySelector("main > div:first-child p");
    const title = document.querySelector("main > div:first-child h1");
    const essentialsTab = document.getElementById("inventory-tab-essentials");
    const plenoHotelTab = document.getElementById("inventory-tab-plenohotel");
    if (savedLists) savedLists.innerHTML = `<i class="fas fa-history mr-1"></i> ${copy.savedLists}`;
    if (kicker) kicker.textContent = copy.kicker;
    if (title) title.textContent = copy.title;
    if (essentialsTab) essentialsTab.textContent = copy.essentialsTab;
    if (plenoHotelTab) plenoHotelTab.textContent = copy.plenoHotelTab;
}

function setupInventoryTabs() {
    const tabs = [...document.querySelectorAll("[data-inventory-tab]")];
    const panels = [...document.querySelectorAll("[data-inventory-panel]")];
    const showPanel = (name) => {
        tabs.forEach((tab) => {
            const active = tab.dataset.inventoryTab === name;
            tab.classList.toggle("bg-white", active);
            tab.classList.toggle("text-slate-900", active);
            tab.classList.toggle("shadow-sm", active);
        });
        panels.forEach((panel) => {
            panel.classList.toggle("hidden", panel.dataset.inventoryPanel !== name);
        });
        localStorage.setItem("inventory:activeTab", name);
    };

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => showPanel(tab.dataset.inventoryTab));
    });
    showPanel(localStorage.getItem("inventory:activeTab") || "essentials");
}

function setupPlenoHotel() {
    let db = null;
    let storage = null;
    try {
        const app = initializeApp(Config.firebaseConfig);
        db = getFirestore(app);
        storage = getStorage(app);
        enableIndexedDbPersistence(db).catch(() => {});
        const auth = getAuth(app);
        onAuthStateChanged(auth, (user) => {
            if (!window.plenoHotelManager) {
                window.plenoHotelManager = new PlenoHotelManager(user ? db : null, user ? storage : null);
                window.plenoHotelManager.init();
            }
        });
        window.setTimeout(() => {
            if (!window.plenoHotelManager) {
                window.plenoHotelManager = new PlenoHotelManager(null, null);
                window.plenoHotelManager.init();
            }
        }, 1200);
    } catch (error) {
        console.warn("[Inventory] Firebase initialization failed:", error);
        window.plenoHotelManager = new PlenoHotelManager(null);
        window.plenoHotelManager.init();
    }
}
