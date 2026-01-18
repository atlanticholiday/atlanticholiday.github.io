/**
 * Internationalization (i18n) Module
 * Supports English (en) and Portuguese (pt)
 */

class I18n {
    constructor() {
        this.translations = {};
        this.currentLang = 'en';
        this.fallbackLang = 'en';
        this.initialized = false;
    }

    /**
     * Initialize the i18n system
     * Detects browser language or loads from localStorage
     */
    async init() {
        // Check localStorage first, then browser preference
        const savedLang = localStorage.getItem('atlantic-holiday-lang');
        const browserLang = navigator.language.slice(0, 2);

        // Determine which language to use
        if (savedLang && ['en', 'pt'].includes(savedLang)) {
            this.currentLang = savedLang;
        } else if (browserLang === 'pt') {
            this.currentLang = 'pt';
        } else {
            this.currentLang = 'en';
        }

        // Load translations
        await this.loadTranslations(this.currentLang);
        if (this.currentLang !== this.fallbackLang) {
            await this.loadTranslations(this.fallbackLang);
        }

        this.initialized = true;
        this.updateUI();
        this.updateLanguageSwitcher();
    }

    /**
     * Load translation JSON file for a language
     */
    async loadTranslations(lang) {
        try {
            const response = await fetch(`locales/${lang}.json`);
            if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
            this.translations[lang] = await response.json();
        } catch (error) {
            console.warn(`Could not load translations for ${lang}:`, error);
            this.translations[lang] = {};
        }
    }

    /**
     * Get translation for a key
     * Supports nested keys like "schedule.header.title"
     */
    t(key, replacements = {}) {
        let value = this.getNestedValue(this.translations[this.currentLang], key);

        // Fallback to English if not found
        if (value === undefined && this.currentLang !== this.fallbackLang) {
            value = this.getNestedValue(this.translations[this.fallbackLang], key);
        }

        // Return key if no translation found
        if (value === undefined) {
            console.warn(`Missing translation for key: ${key}`);
            return key;
        }

        // Handle replacements like {{name}}
        Object.keys(replacements).forEach(placeholder => {
            value = value.replace(new RegExp(`{{${placeholder}}}`, 'g'), replacements[placeholder]);
        });

        return value;
    }

    /**
     * Get nested object value from dot notation key
     */
    getNestedValue(obj, key) {
        if (!obj) return undefined;
        return key.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, obj);
    }

    /**
     * Switch language
     */
    async setLanguage(lang) {
        if (!['en', 'pt'].includes(lang)) {
            console.warn(`Unsupported language: ${lang}`);
            return;
        }

        if (!this.translations[lang]) {
            await this.loadTranslations(lang);
        }

        this.currentLang = lang;
        localStorage.setItem('atlantic-holiday-lang', lang);
        this.updateUI();
        this.updateLanguageSwitcher();

        // Dispatch event for components that need to re-render
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    }

    /**
     * Get current language code
     */
    getCurrentLanguage() {
        return this.currentLang;
    }

    /**
     * Update all elements with data-i18n attribute
     */
    updateUI() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);

            // Handle different element types
            if (el.tagName === 'INPUT' && el.placeholder) {
                el.placeholder = translation;
            } else if (el.hasAttribute('data-i18n-attr')) {
                const attr = el.getAttribute('data-i18n-attr');
                el.setAttribute(attr, translation);
            } else {
                el.textContent = translation;
            }
        });

        // Update elements with data-i18n-title (for tooltips)
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            el.title = this.t(key);
        });
    }

    /**
     * Update language switcher button states
     */
    updateLanguageSwitcher() {
        const enBtn = document.getElementById('lang-en');
        const ptBtn = document.getElementById('lang-pt');

        if (enBtn && ptBtn) {
            enBtn.classList.toggle('active', this.currentLang === 'en');
            ptBtn.classList.toggle('active', this.currentLang === 'pt');
        }
    }

    /**
     * Setup language switcher event listeners
     */
    setupLanguageSwitcher() {
        const enBtn = document.getElementById('lang-en');
        const ptBtn = document.getElementById('lang-pt');

        if (enBtn) {
            enBtn.addEventListener('click', () => this.setLanguage('en'));
        }
        if (ptBtn) {
            ptBtn.addEventListener('click', () => this.setLanguage('pt'));
        }
    }
}

// Create singleton instance
const i18n = new I18n();

// Export for use in other modules
export { i18n };

// Also make available as global for inline scripts
window.i18n = i18n;

// Convenience function for getting translations
export function t(key, replacements = {}) {
    return i18n.t(key, replacements);
}
