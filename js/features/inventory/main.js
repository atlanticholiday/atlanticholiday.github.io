import { InventoryManager } from './inventory-manager.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { clearIndexedDbPersistence, getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { Config } from "../../core/config.js";
import { i18n } from "../../core/i18n.js";
import { AccessManager } from "../admin/access-manager.js";
import { canAccessApplication } from "../../shared/access-control.js";
import { PlenoHotelManager } from "./plenohotel-manager.js";

document.addEventListener('DOMContentLoaded', async () => {
    clearLegacyOperationalCache();
    await i18n.init();
    i18n.setupLanguageSwitcher();
    updateInventoryStaticCopy();

    try {
        const services = await authorizeInventoryAccess();
        if (!services) return;

        InventoryManager.init();
        InventoryManager.connectFirestore(services.db);
        setupInventoryTabs();
        window.plenoHotelManager = new PlenoHotelManager(services.db, services.storage);
        window.plenoHotelManager.init();

        window.addEventListener("languageChanged", () => {
            updateInventoryStaticCopy();
            window.plenoHotelManager?.render?.();
        });
    } catch (error) {
        console.error('[Inventory] Secure initialization failed:', error);
        InventoryManager.disconnectFirestore();
        redirectToMain('inventoryUnavailable');
    }
});

function clearLegacyOperationalCache() {
    [
        'inventory:essentialsLists',
        'inventory:essentialsTemplate',
        'plenohotel:localRecords',
        'plenohotel:supplierEmail',
        'firestore_properties'
    ].forEach((key) => localStorage.removeItem(key));
    sessionStorage.removeItem('currentProperty');
}

async function authorizeInventoryAccess() {
    const app = initializeApp(Config.firebaseConfig);
    const db = getFirestore(app);
    await clearIndexedDbPersistence(db).catch((error) => {
        if (error?.code !== 'failed-precondition' && error?.code !== 'unimplemented') {
            console.warn('[Inventory] Could not clear the previous Firestore browser cache:', error);
        }
    });

    const auth = getAuth(app);
    const user = await waitForAuthState(auth);
    if (!user) {
        redirectToMain('loginRequired');
        return null;
    }

    const accessManager = new AccessManager(db, getFunctions(app));
    const accessEntry = await accessManager.getCurrentAccess(user.email).catch((error) => {
        console.error('[Inventory] Access verification failed:', error);
        return null;
    });

    if (!accessEntry) {
        await signOut(auth).catch(() => {});
        redirectToMain('accessDenied');
        return null;
    }

    if (!canAccessApplication(accessEntry, 'inventory')) {
        redirectToMain('inventoryAccessDenied');
        return null;
    }

    return { db, storage: getStorage(app) };
}

function waitForAuthState(auth) {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

function redirectToMain(reason) {
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('reason', reason);
    window.location.replace(url.toString());
}

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
