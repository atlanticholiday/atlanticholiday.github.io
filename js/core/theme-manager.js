(function () {
    'use strict';

    const STORAGE_KEY = 'atlantic-holiday-theme';
    const LIGHT_THEME = 'light';
    const DARK_THEME = 'dark';
    const THEMES = new Set([LIGHT_THEME, DARK_THEME]);

    const ICONS = {
        light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v1.5M12 19.5V21M4.22 4.22l1.06 1.06M18.72 18.72l1.06 1.06M3 12h1.5M19.5 12H21M4.22 19.78l1.06-1.06M18.72 5.28l1.06-1.06"/><circle cx="12" cy="12" r="4"/></svg>',
        dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.25 15.25A8.5 8.5 0 0 1 8.75 3.75a8.5 8.5 0 1 0 11.5 11.5Z"/></svg>'
    };

    function getStoredTheme() {
        try {
            const storedTheme = window.localStorage.getItem(STORAGE_KEY);
            return THEMES.has(storedTheme) ? storedTheme : LIGHT_THEME;
        } catch (error) {
            return LIGHT_THEME;
        }
    }

    function getTheme() {
        const currentTheme = document.documentElement.dataset.theme;
        return THEMES.has(currentTheme) ? currentTheme : LIGHT_THEME;
    }

    function getLabels(theme) {
        const isPortuguese = document.documentElement.lang.toLowerCase().startsWith('pt');
        const nextTheme = theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;

        if (isPortuguese) {
            return nextTheme === DARK_THEME
                ? { action: 'Ativar modo escuro', visible: 'Escuro' }
                : { action: 'Ativar modo claro', visible: 'Claro' };
        }

        return nextTheme === DARK_THEME
            ? { action: 'Switch to dark mode', visible: 'Dark' }
            : { action: 'Switch to light mode', visible: 'Light' };
    }

    function updateControls(theme) {
        const labels = getLabels(theme);
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.setAttribute('aria-label', labels.action);
            button.setAttribute('title', labels.action);
            button.setAttribute('aria-pressed', String(theme === DARK_THEME));
            button.innerHTML = `${ICONS[theme]}<span class="theme-toggle-label">${labels.visible}</span>`;
        });
    }

    function updateThemeColor(theme) {
        const themeColor = document.querySelector('meta[name="theme-color"]');
        if (themeColor) {
            themeColor.setAttribute('content', theme === DARK_THEME ? '#09090b' : '#ef6b79');
        }
    }

    function applyTheme(theme, { persist = false, animate = false } = {}) {
        const nextTheme = THEMES.has(theme) ? theme : LIGHT_THEME;

        if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.documentElement.classList.add('theme-transition');
            window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 260);
        }

        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.style.colorScheme = nextTheme;
        updateThemeColor(nextTheme);
        updateControls(nextTheme);

        if (persist) {
            try {
                window.localStorage.setItem(STORAGE_KEY, nextTheme);
            } catch (error) {
                // The visual preference still works when storage is unavailable.
            }
        }

        window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: nextTheme } }));
        return nextTheme;
    }

    function toggleTheme() {
        return applyTheme(getTheme() === DARK_THEME ? LIGHT_THEME : DARK_THEME, {
            persist: true,
            animate: true
        });
    }

    function createToggle({ floating = false } = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = floating ? 'theme-toggle theme-toggle-floating' : 'theme-toggle';
        button.dataset.themeToggle = '';
        button.addEventListener('click', toggleTheme);
        return button;
    }

    function mountControls() {
        const switchers = Array.from(new Set(document.querySelectorAll('.language-switcher, .inventory-lang-switcher')));

        switchers.forEach((switcher) => {
            if (!switcher.querySelector('[data-theme-toggle]')) {
                switcher.appendChild(createToggle());
            }
        });

        if (switchers.length === 0 && !document.querySelector('[data-theme-toggle]')) {
            document.body.appendChild(createToggle({ floating: true }));
        }

        updateControls(getTheme());
    }

    applyTheme(getStoredTheme());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountControls, { once: true });
    } else {
        mountControls();
    }

    window.addEventListener('languageChanged', () => updateControls(getTheme()));
    window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY && THEMES.has(event.newValue)) {
            applyTheme(event.newValue, { animate: true });
        }
    });

    window.ThemeManager = Object.freeze({
        applyTheme,
        getTheme,
        mountControls,
        toggleTheme
    });
}());
