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
            allinfo: 'allinfo-page',
            userManagement: 'user-management-page',
            rnal: 'rnal-page',
            safety: 'safety-page',
            checklists: 'checklists-page',
            vehicles: 'vehicles-page',
            owners: 'owners-page',
            visits: 'visits-page',
            visits: 'visits-page',
            cleaningBills: 'cleaning-bills-page',
            staff: 'staff-page',
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

    showUserManagementPage() {
        this.showPage('userManagement');
    }

    showRnalPage() {
        this.showPage('rnal');
    }

    showSafetyPage() {
        this.showPage('safety');
    }

    showChecklistsPage() {
        this.showPage('checklists');
        const event = new CustomEvent('checklistsPageOpened');
        document.dispatchEvent(event);
    }

    showVehiclesPage() {
        this.showPage('vehicles');
        const event = new CustomEvent('vehiclesPageOpened');
        document.dispatchEvent(event);
    }

    showOwnersPage() {
        this.showPage('owners');
        const event = new CustomEvent('ownersPageOpened');
        document.dispatchEvent(event);
    }

    showVisitsPage() {
        this.showPage('visits');
        const event = new CustomEvent('visitsPageOpened');
        document.dispatchEvent(event);
    }

    showCleaningBillsPage() {
        this.showPage('cleaningBills');
        const event = new CustomEvent('cleaningBillsPageOpened');
        document.dispatchEvent(event);
    }

    showCommissionCalculatorPage() {
        // Redirect legacy navigation to Cleaning Bills where the Commission Calculator now lives
        this.showPage('cleaningBills');
        const event = new CustomEvent('cleaningBillsPageOpened');
        document.dispatchEvent(event);
    }

    showStaffPage() {
        this.showPage('staff');
        const event = new CustomEvent('staffPageOpened');
        document.dispatchEvent(event);
    }

    getCurrentPage() {
        return this.currentPage;
    }

    setupNavigationListeners() {
        // Landing page navigation
        const goToPropertiesBtn = document.getElementById('go-to-properties-btn');
        const goToOperationsBtn = document.getElementById('go-to-operations-btn');
        const goToScheduleBtn = document.getElementById('go-to-schedule-btn');
        const goToChecklistsBtn = document.getElementById('go-to-checklists-btn');
        const goToVehiclesBtn = document.getElementById('go-to-vehicles-btn');
        const goToOwnersBtn = document.getElementById('go-to-owners-btn');
        const goToVisitsBtn = document.getElementById('go-to-visits-btn');
        const goToCleaningBillsBtn = document.getElementById('go-to-cleaning-bills-btn');
        const goToCommissionCalculatorBtn = document.getElementById('go-to-commission-calculator-btn');
        const goToStaffBtn = document.getElementById('go-to-staff-btn');

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

        if (goToChecklistsBtn) {
            goToChecklistsBtn.addEventListener('click', () => {
                this.showChecklistsPage();
                const event = new CustomEvent('checklistsPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToVehiclesBtn) {
            goToVehiclesBtn.addEventListener('click', () => {
                this.showVehiclesPage();
                const event = new CustomEvent('vehiclesPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToOwnersBtn) {
            goToOwnersBtn.addEventListener('click', () => {
                this.showOwnersPage();
                const event = new CustomEvent('ownersPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToVisitsBtn) {
            goToVisitsBtn.addEventListener('click', () => {
                this.showVisitsPage();
                const event = new CustomEvent('visitsPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToCleaningBillsBtn) {
            goToCleaningBillsBtn.addEventListener('click', () => {
                this.showCleaningBillsPage();
                const event = new CustomEvent('cleaningBillsPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToCommissionCalculatorBtn) {
            goToCommissionCalculatorBtn.addEventListener('click', () => {
                this.showCommissionCalculatorPage();
                const event = new CustomEvent('commissionCalculatorPageOpened');
                document.dispatchEvent(event);
            });
        }

        if (goToStaffBtn) {
            goToStaffBtn.addEventListener('click', () => {
                this.showStaffPage();
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
        // User Management navigation
        const goToUserManagementBtn = document.getElementById('go-to-user-management-btn');
        if (goToUserManagementBtn) {
            goToUserManagementBtn.addEventListener('click', () => {
                this.showUserManagementPage();
                const event = new CustomEvent('userManagementPageOpened');
                document.dispatchEvent(event);
            });
        }

        // RNAL navigation
        const goToRnalBtn = document.getElementById('go-to-rnal-btn');
        if (goToRnalBtn) {
            goToRnalBtn.addEventListener('click', () => {
                this.showRnalPage();
                const event = new CustomEvent('rnalPageOpened');
                document.dispatchEvent(event);
            });
        }

        // Safety navigation
        const goToSafetyBtn = document.getElementById('go-to-safety-btn');
        if (goToSafetyBtn) {
            goToSafetyBtn.addEventListener('click', () => {
                this.showSafetyPage();
                const event = new CustomEvent('safetyPageOpened');
                document.dispatchEvent(event);
            });
        }

        // Back buttons
        const backToLandingBtn = document.getElementById('back-to-landing-btn');
        const backToLandingFromReservationsBtn = document.getElementById('back-to-landing-from-reservations-btn');
        const backToLandingFromOperationsBtn = document.getElementById('back-to-landing-from-operations-btn');
        const backToLandingFromScheduleBtn = document.getElementById('back-to-landing-from-schedule-btn');
        const backToLandingFromChecklistsBtn = document.getElementById('back-to-landing-from-checklists-btn');
        const backToLandingFromVehiclesBtn = document.getElementById('back-to-landing-from-vehicles-btn');
        const backToLandingFromOwnersBtn = document.getElementById('back-to-landing-from-owners-btn');
        const backToLandingFromVisitsBtn = document.getElementById('back-to-landing-from-visits-btn');
        const backToLandingFromCleaningBillsBtn = document.getElementById('back-to-landing-from-cleaning-bills-btn');
        const backToLandingFromCommissionCalculatorBtn = document.getElementById('back-to-landing-from-commission-calculator-btn');

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

        if (backToLandingFromChecklistsBtn) {
            backToLandingFromChecklistsBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromVehiclesBtn) {
            backToLandingFromVehiclesBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromOwnersBtn) {
            backToLandingFromOwnersBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromVisitsBtn) {
            backToLandingFromVisitsBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromCleaningBillsBtn) {
            backToLandingFromCleaningBillsBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        if (backToLandingFromCommissionCalculatorBtn) {
            backToLandingFromCommissionCalculatorBtn.addEventListener('click', () => {
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
        // Back from User Management
        const backToLandingFromUserManagementBtn = document.getElementById('back-to-landing-from-user-management-btn');
        if (backToLandingFromUserManagementBtn) {
            backToLandingFromUserManagementBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Back from RNAL
        const backToLandingFromRnalBtn = document.getElementById('back-to-landing-from-rnal-btn');
        if (backToLandingFromRnalBtn) {
            backToLandingFromRnalBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Back from Safety
        const backToLandingFromSafetyBtn = document.getElementById('back-to-landing-from-safety-btn');
        if (backToLandingFromSafetyBtn) {
            backToLandingFromSafetyBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }

        // Sign out buttons
        const landingSignOutBtn = document.getElementById('landing-sign-out-btn');
        const propertiesSignOutBtn = document.getElementById('properties-sign-out-btn');
        const operationsSignOutBtn = document.getElementById('operations-sign-out-btn');
        const userManagementSignOutBtn = document.getElementById('user-management-sign-out-btn');
        const rnalSignOutBtn = document.getElementById('rnal-sign-out-btn');
        const safetySignOutBtn = document.getElementById('safety-sign-out-btn');
        const checklistsSignOutBtn = document.getElementById('checklists-sign-out-btn');
        const vehiclesSignOutBtn = document.getElementById('vehicles-sign-out-btn');
        const ownersSignOutBtn = document.getElementById('owners-sign-out-btn');
        const visitsSignOutBtn = document.getElementById('visits-sign-out-btn');
        const cleaningBillsSignOutBtn = document.getElementById('cleaning-bills-sign-out-btn');
        const commissionCalculatorSignOutBtn = document.getElementById('commission-calculator-sign-out-btn');
        const staffSignOutBtn = document.getElementById('staff-sign-out-btn');

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
        if (userManagementSignOutBtn) {
            userManagementSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }

        if (rnalSignOutBtn) {
            rnalSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }

        if (safetySignOutBtn) {
            safetySignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (checklistsSignOutBtn) {
            checklistsSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (ownersSignOutBtn) {
            ownersSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (vehiclesSignOutBtn) {
            vehiclesSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (visitsSignOutBtn) {
            visitsSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (cleaningBillsSignOutBtn) {
            cleaningBillsSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (commissionCalculatorSignOutBtn) {
            commissionCalculatorSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }
        if (staffSignOutBtn) {
            staffSignOutBtn.addEventListener('click', () => {
                const event = new CustomEvent('signOutRequested');
                document.dispatchEvent(event);
            });
        }

        // Back from Staff
        const backToLandingFromStaffBtn = document.getElementById('back-to-landing-from-staff-btn');
        if (backToLandingFromStaffBtn) {
            backToLandingFromStaffBtn.addEventListener('click', () => {
                this.showLandingPage();
            });
        }
    }


}