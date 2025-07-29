export class NavigationManager {
    constructor() {
        this.currentPage = null;
        this.pages = {
            landing: 'landing-page',
            properties: 'properties-page',
            schedule: 'app-content',
            login: 'login-screen',
            setup: 'setup-screen'
        };
    }

    showPage(pageName) {
        // Hide all pages
        Object.values(this.pages).forEach(pageId => {
            const page = document.getElementById(pageId);
            if (page) {
                page.classList.add('hidden');
            }
        });

        // Show the requested page
        const targetPage = document.getElementById(this.pages[pageName]);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            this.currentPage = pageName;
        }
    }

    showLandingPage() {
        this.showPage('landing');
    }

    showPropertiesPage() {
        this.showPage('properties');
    }

    showSchedulePage() {
        this.showPage('schedule');
    }

    showLoginPage() {
        this.showPage('login');
    }

    showSetupPage() {
        this.showPage('setup');
    }

    getCurrentPage() {
        return this.currentPage;
    }

    setupNavigationListeners() {
        // Landing page navigation
        const goToPropertiesBtn = document.getElementById('go-to-properties-btn');
        const goToScheduleBtn = document.getElementById('go-to-schedule-btn');
        
        if (goToPropertiesBtn) {
            goToPropertiesBtn.addEventListener('click', () => {
                this.showPropertiesPage();
                // Trigger properties page initialization if needed
                const event = new CustomEvent('propertiesPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToScheduleBtn) {
            goToScheduleBtn.addEventListener('click', () => {
                this.showSchedulePage();
                // Trigger schedule page initialization if needed
                const event = new CustomEvent('schedulePageOpened');
                document.dispatchEvent(event);
            });
        }

        // Back buttons
        const backToLandingBtn = document.getElementById('back-to-landing-btn');
        const backToLandingFromScheduleBtn = document.getElementById('back-to-landing-from-schedule-btn');
        
        if (backToLandingBtn) {
            backToLandingBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromScheduleBtn) {
            backToLandingFromScheduleBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Sign out buttons
        const landingSignOutBtn = document.getElementById('landing-sign-out-btn');
        const propertiesSignOutBtn = document.getElementById('properties-sign-out-btn');
        
        if (landingSignOutBtn) {
            landingSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }

        if (propertiesSignOutBtn) {
            propertiesSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
    }
} 