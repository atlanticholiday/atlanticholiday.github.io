import {
    buildAdvancedPropertyDataFromForm,
    buildQuickPropertyDataFromForm,
    clearAdvancedPropertyForm,
    copyQuickAddValuesToAdvancedForm,
    syncRoomsInputForSelectedType
} from './property-form-utils.js';
import { initializeAllInfoPage } from './all-info-page.js';

const DEFAULT_ACTIVE_CLASSES = ['bg-brand', 'text-white'];
const DEFAULT_INACTIVE_CLASSES = ['bg-gray-100', 'text-gray-700'];

export class PropertiesDashboardController {
    constructor({
        getPropertiesManager = () => null,
        documentRef = document,
        windowRef = window,
        sessionStorageRef = window.sessionStorage
    } = {}) {
        this.getPropertiesManager = getPropertiesManager;
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.sessionStorageRef = sessionStorageRef;
        this.initialized = false;
        this.addWizardStep = 1;
        this.totalAddSteps = 2;

        this.handleAllInfoPageOpened = this.handleAllInfoPageOpened.bind(this);
        this.handleOpenPropertyEdit = this.handleOpenPropertyEdit.bind(this);
        this.handleLanguageChanged = this.handleLanguageChanged.bind(this);
    }

    init() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.registerGlobalPropertyActions();
        this.bindPropertyPageEvents();
        this.bindSectionToggles();
        this.bindQuickAddActions();
        this.bindAdvancedModalActions();
        this.bindBulkImportActions();
    }

    get propertiesManager() {
        return this.getPropertiesManager?.() ?? null;
    }

    getElement(id) {
        return this.documentRef?.getElementById(id) ?? null;
    }

    getPropertyById(propertyId) {
        return this.propertiesManager?.getPropertyById?.(propertyId)
            ?? this.propertiesManager?.properties?.find((property) => property.id === propertyId)
            ?? null;
    }

    registerGlobalPropertyActions() {
        this.windowRef.editProperty = (propertyId) => {
            this.navigateToPropertySettings(propertyId);
        };

        this.windowRef.deleteProperty = async (propertyId) => {
            const shouldDelete = this.windowRef.confirm?.('Are you sure you want to delete this property?');
            if (!shouldDelete) {
                return;
            }

            try {
                await this.propertiesManager?.deleteProperty(propertyId);
            } catch (error) {
                this.windowRef.alert?.('Failed to delete property. Please try again.');
            }
        };
    }

    bindPropertyPageEvents() {
        this.documentRef.addEventListener('openPropertyEdit', this.handleOpenPropertyEdit);
        this.documentRef.addEventListener('allInfoPageOpened', this.handleAllInfoPageOpened);
        this.windowRef.addEventListener?.('languageChanged', this.handleLanguageChanged);
    }

    handleLanguageChanged() {
        const allInfoPage = this.getElement('allinfo-page');
        if (allInfoPage && !allInfoPage.classList.contains('hidden')) {
            this.handleAllInfoPageOpened();
        }
    }

    handleOpenPropertyEdit(event) {
        const propertyId = event?.detail?.propertyId;
        if (propertyId) {
            this.navigateToPropertySettings(propertyId);
        }
    }

    handleAllInfoPageOpened() {
        initializeAllInfoPage({
            documentRef: this.documentRef,
            properties: this.propertiesManager?.properties ?? [],
            onEditProperty: (property, category) => {
                this.navigateToPropertySettings(property.id, `#section-${category.slug}`);
            }
        });
    }

    setupToggleSection({
        toggleButtonId,
        sectionId,
        closeButtonId,
        sectionsToHide = [],
        buttonsToReset = []
    }) {
        const toggleButton = this.getElement(toggleButtonId);
        const section = this.getElement(sectionId);
        const closeButton = this.getElement(closeButtonId);

        if (!toggleButton || !section) {
            return;
        }

        const hideSection = () => {
            section.classList.add('hidden');
            toggleButton.classList.remove(...DEFAULT_ACTIVE_CLASSES);
            toggleButton.classList.add(...DEFAULT_INACTIVE_CLASSES);
        };

        toggleButton.addEventListener('click', () => {
            const willOpen = section.classList.contains('hidden');

            sectionsToHide.forEach((sectionToHideId) => {
                this.getElement(sectionToHideId)?.classList.add('hidden');
            });
            buttonsToReset.forEach((buttonId) => {
                const button = this.getElement(buttonId);
                button?.classList.remove(...DEFAULT_ACTIVE_CLASSES);
                button?.classList.add(...DEFAULT_INACTIVE_CLASSES);
            });

            if (willOpen) {
                section.classList.remove('hidden');
                toggleButton.classList.add(...DEFAULT_ACTIVE_CLASSES);
                toggleButton.classList.remove(...DEFAULT_INACTIVE_CLASSES);
                return;
            }

            hideSection();
        });

        closeButton?.addEventListener('click', hideSection);
    }

    bindSectionToggles() {
        this.setupToggleSection({
            toggleButtonId: 'quick-add-toggle-btn',
            closeButtonId: 'quick-add-close-btn',
            sectionId: 'quick-add-section',
            sectionsToHide: ['bulk-import-section', 'filters-section'],
            buttonsToReset: ['bulk-import-toggle-btn', 'filters-toggle-btn']
        });

        this.setupToggleSection({
            toggleButtonId: 'bulk-import-toggle-btn',
            closeButtonId: 'bulk-import-close-btn',
            sectionId: 'bulk-import-section',
            sectionsToHide: ['quick-add-section', 'filters-section'],
            buttonsToReset: ['quick-add-toggle-btn', 'filters-toggle-btn']
        });

        this.setupToggleSection({
            toggleButtonId: 'filters-toggle-btn',
            closeButtonId: 'filters-close-btn',
            sectionId: 'filters-section',
            sectionsToHide: ['quick-add-section', 'bulk-import-section'],
            buttonsToReset: ['quick-add-toggle-btn', 'bulk-import-toggle-btn']
        });
    }

    hideQuickAddSection() {
        this.getElement('quick-add-section')?.classList.add('hidden');
        const toggleButton = this.getElement('quick-add-toggle-btn');
        toggleButton?.classList.remove(...DEFAULT_ACTIVE_CLASSES);
        toggleButton?.classList.add(...DEFAULT_INACTIVE_CLASSES);
    }

    bindQuickAddActions() {
        this.getElement('add-property-btn')?.addEventListener('click', async () => {
            const propertiesManager = this.propertiesManager;
            if (!propertiesManager) {
                return;
            }

            const propertyData = buildQuickPropertyDataFromForm(this.documentRef);
            const errors = propertiesManager.validatePropertyData(propertyData);
            const errorElement = this.getElement('add-property-error');

            if (errors.length > 0) {
                if (errorElement) {
                    errorElement.textContent = errors[0];
                }
                return;
            }

            try {
                await propertiesManager.addProperty(propertyData);
                propertiesManager.clearForm();
                if (errorElement) {
                    errorElement.textContent = '';
                }
                this.hideQuickAddSection();
            } catch (error) {
                if (errorElement) {
                    errorElement.textContent = 'Failed to add property. Please try again.';
                }
            }
        });

        const propertyTypeSelect = this.getElement('property-type');
        const propertyRoomsInput = this.getElement('property-rooms');
        propertyTypeSelect?.addEventListener('change', (event) => {
            syncRoomsInputForSelectedType(event.target.value, propertyRoomsInput);
        });
    }

    showAdvancedWizardStep(step) {
        this.getElement('add-wizard-step-1')?.classList.toggle('hidden', step !== 1);
        this.getElement('add-wizard-step-2')?.classList.toggle('hidden', step !== 2);
        this.getElement('advanced-back-btn')?.classList.toggle('hidden', step === 1);
        this.getElement('advanced-next-btn')?.classList.toggle('hidden', step === this.totalAddSteps);
        this.getElement('advanced-property-save-btn')?.classList.toggle('hidden', step !== this.totalAddSteps);
    }

    openAdvancedPropertyModal() {
        clearAdvancedPropertyForm(this.documentRef);
        copyQuickAddValuesToAdvancedForm(this.documentRef);
        this.addWizardStep = 1;
        this.showAdvancedWizardStep(this.addWizardStep);
        this.getElement('advanced-property-modal')?.classList.remove('hidden');
    }

    closeAdvancedPropertyModal() {
        this.getElement('advanced-property-modal')?.classList.add('hidden');
    }

    bindAdvancedModalActions() {
        this.getElement('advanced-add-btn')?.addEventListener('click', () => {
            this.openAdvancedPropertyModal();
        });

        this.getElement('advanced-property-close-btn')?.addEventListener('click', () => {
            this.closeAdvancedPropertyModal();
        });

        this.getElement('advanced-property-cancel-btn')?.addEventListener('click', () => {
            this.closeAdvancedPropertyModal();
        });

        const advancedModal = this.getElement('advanced-property-modal');
        advancedModal?.addEventListener('click', (event) => {
            if (event.target === advancedModal) {
                this.closeAdvancedPropertyModal();
            }
        });

        const advancedTypeSelect = this.getElement('advanced-property-type');
        const advancedRoomsInput = this.getElement('advanced-property-rooms');
        advancedTypeSelect?.addEventListener('change', (event) => {
            syncRoomsInputForSelectedType(event.target.value, advancedRoomsInput);
        });

        this.getElement('advanced-next-btn')?.addEventListener('click', () => {
            if (this.addWizardStep < this.totalAddSteps) {
                this.addWizardStep += 1;
                this.showAdvancedWizardStep(this.addWizardStep);
            }
        });

        this.getElement('advanced-back-btn')?.addEventListener('click', () => {
            if (this.addWizardStep > 1) {
                this.addWizardStep -= 1;
                this.showAdvancedWizardStep(this.addWizardStep);
            }
        });

        this.getElement('advanced-property-save-btn')?.addEventListener('click', async () => {
            const propertiesManager = this.propertiesManager;
            if (!propertiesManager) {
                return;
            }

            const errorElement = this.getElement('advanced-property-error');
            if (errorElement) {
                errorElement.textContent = '';
            }

            const propertyData = buildAdvancedPropertyDataFromForm(this.documentRef);
            const errors = propertiesManager.validatePropertyData(propertyData);
            if (errors.length > 0) {
                if (errorElement) {
                    errorElement.textContent = errors[0];
                }
                return;
            }

            try {
                await propertiesManager.addProperty(propertyData);
                clearAdvancedPropertyForm(this.documentRef);
                this.closeAdvancedPropertyModal();
            } catch (error) {
                if (errorElement) {
                    errorElement.textContent = 'Failed to add property. Please try again.';
                }
            }
        });
    }

    bindBulkImportActions() {
        const bulkInput = this.getElement('bulk-property-input');
        const bulkCount = this.getElement('bulk-property-count');
        const bulkAddButton = this.getElement('bulk-add-properties-btn');

        const updateBulkCount = () => {
            if (!bulkInput || !bulkCount) {
                return;
            }

            const lineCount = bulkInput.value
                .split('\n')
                .filter((line) => line.trim())
                .length;

            bulkCount.textContent = String(lineCount);
            if (bulkAddButton) {
                bulkAddButton.disabled = lineCount === 0;
            }
        };

        bulkInput?.addEventListener('input', updateBulkCount);
        updateBulkCount();

        bulkAddButton?.addEventListener('click', async () => {
            const propertiesManager = this.propertiesManager;
            const errorElement = this.getElement('bulk-add-property-error');
            const progressContainer = this.getElement('bulk-import-progress');
            const progressBar = this.getElement('bulk-import-progress-bar');
            const progressStatus = this.getElement('bulk-import-status');
            const inputText = bulkInput?.value?.trim() ?? '';

            if (!propertiesManager) {
                return;
            }

            if (!inputText) {
                if (errorElement) {
                    errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">Please enter property data to import.</div>';
                }
                return;
            }

            const { properties, errors } = propertiesManager.parseBulkPropertyData(inputText);
            if (errors.length > 0) {
                if (errorElement) {
                    errorElement.innerHTML = `<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">${errors.map((error) => `Line ${error.lineNumber}: ${error.error}`).join('<br>')}</div>`;
                }
                return;
            }

            if (properties.length === 0) {
                if (errorElement) {
                    errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">No valid properties found to import.</div>';
                }
                return;
            }

            if (errorElement) {
                errorElement.innerHTML = '';
            }
            progressContainer?.classList.remove('hidden');
            bulkAddButton.disabled = true;

            if (progressBar) {
                progressBar.style.width = '0%';
            }
            if (progressStatus) {
                progressStatus.textContent = 'Starting import...';
            }

            try {
                const results = await propertiesManager.bulkAddProperties(properties, (progress) => {
                    if (progressBar) {
                        progressBar.style.width = `${progress.percentage}%`;
                    }
                    if (progressStatus) {
                        progressStatus.textContent = `Importing properties... ${progress.completed}/${progress.total}`;
                    }
                });

                if (progressStatus) {
                    progressStatus.textContent = `Import complete! ${results.successful} properties added successfully.`;
                }

                if (results.failed > 0 && errorElement) {
                    errorElement.innerHTML = `<div class="text-yellow-600 bg-yellow-50 border border-yellow-200 rounded p-2">${results.failed} properties failed to import. Check console for details.</div>`;
                }

                if (results.successful > 0 && bulkInput) {
                    bulkInput.value = '';
                    updateBulkCount();
                }

                this.windowRef.setTimeout(() => {
                    progressContainer?.classList.add('hidden');
                    bulkAddButton.disabled = false;
                }, 3000);
            } catch (error) {
                console.error('Bulk import failed:', error);
                if (errorElement) {
                    errorElement.innerHTML = '<div class="text-red-500 bg-red-50 border border-red-200 rounded p-2">Bulk import failed. Please try again.</div>';
                }
                progressContainer?.classList.add('hidden');
                bulkAddButton.disabled = false;
            }
        });
    }

    navigateToPropertySettings(propertyId, anchor = '') {
        const property = this.getPropertyById(propertyId);

        if (!property) {
            this.windowRef.alert?.('Property not found. Please try again.');
            return;
        }

        this.sessionStorageRef?.removeItem?.('currentProperty');
        this.sessionStorageRef?.setItem?.('currentProperty', JSON.stringify({ ...property }));
        this.windowRef.location.href = `property-settings.html?propertyId=${propertyId}${anchor}`;
    }
}
