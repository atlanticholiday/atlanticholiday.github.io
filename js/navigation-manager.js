export class NavigationManager {
    constructor() {
        this.currentPage = null;
        this.pages = {
            landing: 'landing-page',
            properties: 'properties-page',
            operations: 'operations-page',
            schedule: 'app-content',
            reservations: 'reservations-page',
            login: 'login-screen',
            setup: 'setup-screen',
            allinfo: 'allinfo-page'
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

    showOperationsPage() {
        this.showPage('operations');
    }

    showSchedulePage() {
        this.showPage('schedule');
    }

    showReservationsPage() {
        this.showPage('reservations');
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
        const goToOperationsBtn = document.getElementById('go-to-operations-btn');
        const goToScheduleBtn = document.getElementById('go-to-schedule-btn');
        
        if (goToPropertiesBtn) {
            goToPropertiesBtn.addEventListener('click', () => {
                this.showPropertiesPage();
                // Trigger properties page initialization if needed
                const event = new CustomEvent('propertiesPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToOperationsBtn) {
            goToOperationsBtn.addEventListener('click', () => {
                this.showOperationsPage();
                // Trigger operations page initialization if needed
                const event = new CustomEvent('operationsPageOpened');
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

        // All Info navigation
        const goToAllInfoBtn = document.getElementById('go-to-allinfo-btn');
        if (goToAllInfoBtn) {
            goToAllInfoBtn.addEventListener('click', () => {
                this.showPage('allinfo');
                const event = new CustomEvent('allInfoPageOpened');
                document.dispatchEvent(event);
            });
        }

        // Reservations navigation
        const goToReservationsBtn = document.getElementById('go-to-reservations-btn');
        if (goToReservationsBtn) {
            goToReservationsBtn.addEventListener('click', () => {
                this.showReservationsPage();
                const event = new CustomEvent('reservationsPageOpened');
                document.dispatchEvent(event);
            });
        }

        // Back buttons
        const backToLandingBtn = document.getElementById('back-to-landing-btn');
        const backToLandingFromReservationsBtn = document.getElementById('back-to-landing-from-reservations-btn');
        const backToLandingFromOperationsBtn = document.getElementById('back-to-landing-from-operations-btn');
        const backToLandingFromScheduleBtn = document.getElementById('back-to-landing-from-schedule-btn');
        
        if (backToLandingFromReservationsBtn) {
            backToLandingFromReservationsBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingBtn) {
            backToLandingBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromOperationsBtn) {
            backToLandingFromOperationsBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromScheduleBtn) {
            backToLandingFromScheduleBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Back from All Info
        const backToLandingFromAllInfoBtn = document.getElementById('back-to-landing-from-allinfo-btn');
        if (backToLandingFromAllInfoBtn) {
            backToLandingFromAllInfoBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Sign out buttons
        const landingSignOutBtn = document.getElementById('landing-sign-out-btn');
        const propertiesSignOutBtn = document.getElementById('properties-sign-out-btn');
        const operationsSignOutBtn = document.getElementById('operations-sign-out-btn');
        
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

        if (operationsSignOutBtn) {
            operationsSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
    }
} 