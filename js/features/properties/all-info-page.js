import { LOCATIONS } from '../../shared/locations.js';
import { getEnumOptions } from '../../shared/enums.js';
import { compareAlojamentosProperties, parseAlojamentosRows } from './property-import-utils.js';

const ALL_INFO_CATEGORIES = [
    { title: 'Basic Information', slug: 'basic-info-edit', fields: ['location', 'type', 'typology', 'rooms', 'bathrooms', 'floor'], icon: 'fas fa-info-circle' },
    { title: 'Maps & Location', slug: 'maps-location', fields: ['googleMapsLink', 'garbageLocationLink', 'garbageFloor'], icon: 'fas fa-map-marker-alt' },
    { title: 'Access & Parking', slug: 'access-parking', fields: ['keyBoxCode', 'parkingSpot', 'parkingFloor'], icon: 'fas fa-parking' },
    { title: 'Media & Content', slug: 'media-content', fields: ['checkinVideos', 'bookingDescriptionStatus', 'selfCheckinInstructions'], icon: 'fas fa-video' },
    { title: 'Google Drive', slug: 'google-drive', fields: ['googleDriveEnabled', 'googleDriveLink', 'scannedDocsLink'], icon: 'fab fa-google-drive' },
    { title: 'Recommendations', slug: 'recommendations', fields: ['recommendationsLink', 'recommendationsEditLink'], icon: 'fas fa-star' },
    { title: 'Frames', slug: 'frames', fields: ['wifiFrame', 'recommendationsFrame', 'investmentFrame'], icon: 'fas fa-border-all' },
    { title: 'Signage', slug: 'signage', fields: ['privateSign', 'noSmokingSign', 'noJunkMailSign', 'alAhSign', 'keysNotice', 'wcSign'], icon: 'fas fa-sign' },
    { title: 'Equipment', slug: 'equipment', fields: ['airConditioning', 'fans', 'heaters', 'crib', 'cribMattress', 'babyChair'], icon: 'fas fa-toolbox' },
    { title: 'Services & Extras', slug: 'services-extras', fields: ['breakfastBox', 'poolMaintenanceDay', 'poolMaintenanceNotes'], icon: 'fas fa-concierge-bell' },
    { title: 'Connectivity & Utilities', slug: 'connectivity-utilities', fields: ['wifiSpeed', 'internetProvider', 'energySource'], icon: 'fas fa-wifi' },
    { title: 'Online Services', slug: 'online-services', fields: ['onlineComplaintBooksEnabled', 'onlineComplaintBooksEmail', 'onlineComplaintBooksPassword', 'airbnbLinksStatus'], icon: 'fas fa-globe' },
    { title: 'Legal & Compliance', slug: 'legal-compliance', fields: ['contractsStatus', 'complaintBooksStatus', 'statisticsStatus', 'sefStatus', 'touristTaxInstructions'], icon: 'fas fa-gavel' },
    { title: 'Safety Maintenance', slug: 'safety-maintenance', fields: ['fireExtinguisherExpiration', 'fireExtinguisherLocation', 'fireExtinguisherNotes', 'firstAidStatus', 'firstAidLastChecked', 'firstAidNotes'], icon: 'fas fa-shield-alt' },
    { title: 'Owner', slug: 'owner', fields: ['ownerFirstName', 'ownerLastName', 'ownerVatNumber', 'ownerPropertyAddress', 'ownerContact'], icon: 'fas fa-user-tie' },
    { title: 'Accounting', slug: 'accounting', fields: ['accountingName', 'accountingPhone', 'accountingEmail', 'accountingContact'], icon: 'fas fa-file-invoice-dollar' },
    { title: 'Cleaning', slug: 'contacts', fields: ['cleaningCompanyContact', 'cleaningCompanyPrice', 'guestCleaningFee'], icon: 'fas fa-broom' },
    { title: 'Condominium Information', slug: 'condominium-info', fields: ['condominiumName', 'condominiumEmail', 'condominiumPhone'], icon: 'fas fa-building' }
];

function buildLabel(key) {
    return key === 'name'
        ? 'Property Name'
        : key.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());
}

function isMissingValue(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

function getCategoryStats(properties, category) {
    const fields = category?.fields ?? [];
    const totalFields = properties.length * fields.length;
    let missingFields = 0;
    let completeProperties = 0;

    properties.forEach((property) => {
        const missingForProperty = fields.filter((field) => isMissingValue(property[field])).length;
        missingFields += missingForProperty;
        if (missingForProperty === 0) {
            completeProperties += 1;
        }
    });

    return {
        completeFields: Math.max(totalFields - missingFields, 0),
        completeProperties,
        missingFields,
        totalFields,
        completion: totalFields > 0 ? Math.round(((totalFields - missingFields) / totalFields) * 100) : 100
    };
}

function propertyMatchesCategoryFilter(property, category, mode, fieldKey = '') {
    if (mode === 'all') {
        return true;
    }

    const fields = fieldKey ? [fieldKey] : category.fields;
    const missingCount = fields.filter((field) => isMissingValue(property[field])).length;

    if (mode === 'missing') {
        return missingCount > 0;
    }

    if (mode === 'complete') {
        return missingCount === 0;
    }

    return true;
}

function isNumericField(field) {
    return ['cleaningCompanyPrice', 'guestCleaningFee', 'wifiSpeed', 'rooms', 'bathrooms'].includes(field)
        || /price|fee|amount|count|number|kg|weight|speed|rooms|bathrooms/i.test(field);
}

function isBooleanField(field) {
    return /Enabled$/.test(field);
}

function normalizeInlineValue(input) {
    let value = input.value;

    if (input.tagName === 'INPUT' && input.type === 'number') {
        const numericValue = Number.parseFloat(value);
        return Number.isFinite(numericValue) ? numericValue : null;
    }

    if (input.tagName === 'SELECT' && input.dataset.boolean === 'true') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return '';
    }

    return value;
}

function createInlineFieldControl(documentRef, field, value) {
    const enumOptions = getEnumOptions(field);
    const currentValue = value ?? '';

    if (field === 'location') {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        [''].concat(LOCATIONS || []).forEach((location) => {
            const option = documentRef.createElement('option');
            option.value = location;
            option.textContent = location || 'Select location';
            option.selected = location === currentValue;
            select.appendChild(option);
        });
        return select;
    }

    if (isBooleanField(field)) {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        select.dataset.boolean = 'true';
        [
            ['', 'Select'],
            ['true', 'Yes'],
            ['false', 'No']
        ].forEach(([optionValue, label]) => {
            const option = documentRef.createElement('option');
            option.value = optionValue;
            option.textContent = label;
            option.selected = String(currentValue) === optionValue;
            select.appendChild(option);
        });
        return select;
    }

    if (enumOptions) {
        const select = documentRef.createElement('select');
        select.className = 'allinfo-inline-input';
        const blankOption = documentRef.createElement('option');
        blankOption.value = '';
        blankOption.textContent = 'Select';
        select.appendChild(blankOption);

        enumOptions.forEach((entry) => {
            const option = documentRef.createElement('option');
            option.value = entry.value;
            option.textContent = entry.label;
            option.selected = entry.value === currentValue;
            select.appendChild(option);
        });
        return select;
    }

    const input = documentRef.createElement('input');
    input.className = 'allinfo-inline-input';
    input.type = isNumericField(field) ? 'number' : 'text';
    if (input.type === 'number') {
        input.step = '0.01';
    }
    input.value = currentValue;
    input.placeholder = buildLabel(field);
    return input;
}

function sortTable(table, columnIndex, ascending) {
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        return;
    }

    const getCellValue = (cell) => {
        const control = cell?.querySelector?.('input, select, textarea');
        if (control) {
            if (control.tagName === 'SELECT') {
                return control.selectedOptions?.[0]?.textContent?.trim() || control.value || '';
            }
            return control.value ?? '';
        }

        return cell?.textContent?.trim() ?? '';
    };

    Array.from(tbody.querySelectorAll('tr'))
        .sort((leftRow, rightRow) => {
            const leftCell = leftRow.cells[columnIndex];
            const rightCell = rightRow.cells[columnIndex];
            const leftSortValue = leftCell?.dataset?.sort;
            const rightSortValue = rightCell?.dataset?.sort;

            if (leftSortValue !== undefined || rightSortValue !== undefined) {
                const leftNumber = Number.parseFloat(leftSortValue ?? '0');
                const rightNumber = Number.parseFloat(rightSortValue ?? '0');
                return ascending ? leftNumber - rightNumber : rightNumber - leftNumber;
            }

            const leftText = getCellValue(leftCell);
            const rightText = getCellValue(rightCell);
            return ascending
                ? leftText.localeCompare(rightText, undefined, { numeric: true })
                : rightText.localeCompare(leftText, undefined, { numeric: true });
        })
        .forEach((row) => tbody.appendChild(row));
}

function createSearchBars(documentRef) {
    const searchBarsContainer = documentRef.createElement('div');
    searchBarsContainer.className = 'search-bars-container';

    const propertyFilterWrapper = documentRef.createElement('div');
    propertyFilterWrapper.className = 'allinfo-search-control flex-1';

    const propertyFilterLabel = documentRef.createElement('label');
    propertyFilterLabel.textContent = 'Filter properties';
    propertyFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const propertyFilterInput = documentRef.createElement('input');
    propertyFilterInput.id = 'allinfo-filter';
    propertyFilterInput.type = 'text';
    propertyFilterInput.placeholder = 'Filter properties...';
    propertyFilterInput.className = 'px-3 py-2 border rounded-md w-full';

    propertyFilterWrapper.appendChild(propertyFilterLabel);
    propertyFilterWrapper.appendChild(propertyFilterInput);

    const dataFilterWrapper = documentRef.createElement('div');
    dataFilterWrapper.className = 'allinfo-compact-control';

    const dataFilterLabel = documentRef.createElement('label');
    dataFilterLabel.textContent = 'Rows';
    dataFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const dataFilterSelect = documentRef.createElement('select');
    dataFilterSelect.id = 'allinfo-data-filter';
    dataFilterSelect.className = 'px-3 py-2 border rounded-md w-full';
    [
        ['all', 'All rows'],
        ['missing', 'Needs info'],
        ['complete', 'Complete']
    ].forEach(([value, label]) => {
        const option = documentRef.createElement('option');
        option.value = value;
        option.textContent = label;
        dataFilterSelect.appendChild(option);
    });

    dataFilterWrapper.appendChild(dataFilterLabel);
    dataFilterWrapper.appendChild(dataFilterSelect);

    const fieldFilterWrapper = documentRef.createElement('div');
    fieldFilterWrapper.className = 'allinfo-compact-control';

    const fieldFilterLabel = documentRef.createElement('label');
    fieldFilterLabel.textContent = 'Field';
    fieldFilterLabel.className = 'block text-xs font-semibold uppercase text-gray-500 mb-1';

    const fieldFilterSelect = documentRef.createElement('select');
    fieldFilterSelect.id = 'allinfo-field-filter';
    fieldFilterSelect.className = 'px-3 py-2 border rounded-md w-full';

    fieldFilterWrapper.appendChild(fieldFilterLabel);
    fieldFilterWrapper.appendChild(fieldFilterSelect);

    const categorySearchWrapper = documentRef.createElement('div');
    categorySearchWrapper.id = 'allinfo-cat-search-wrapper';

    const categorySearchInput = documentRef.createElement('input');
    categorySearchInput.id = 'allinfo-cat-search';
    categorySearchInput.type = 'text';
    categorySearchInput.placeholder = 'Search categories...';

    categorySearchWrapper.appendChild(categorySearchInput);
    searchBarsContainer.appendChild(propertyFilterWrapper);
    searchBarsContainer.appendChild(dataFilterWrapper);
    searchBarsContainer.appendChild(fieldFilterWrapper);
    searchBarsContainer.appendChild(categorySearchWrapper);

    return {
        searchBarsContainer,
        propertyFilterInput,
        categorySearchInput,
        dataFilterSelect,
        fieldFilterSelect
    };
}

function createMetric(documentRef, label, value, tone = 'gray') {
    const metric = documentRef.createElement('div');
    const toneClasses = {
        green: 'border-green-200 bg-green-50 text-green-700',
        orange: 'border-orange-200 bg-orange-50 text-orange-700',
        red: 'border-red-200 bg-red-50 text-red-700',
        blue: 'border-blue-200 bg-blue-50 text-blue-700',
        gray: 'border-gray-200 bg-gray-50 text-gray-700'
    };
    metric.className = `rounded-md border px-4 py-3 ${toneClasses[tone] || toneClasses.gray}`;

    const valueElement = documentRef.createElement('div');
    valueElement.className = 'text-2xl font-semibold leading-tight';
    valueElement.textContent = String(value);

    const labelElement = documentRef.createElement('div');
    labelElement.className = 'text-xs font-medium uppercase tracking-wide';
    labelElement.textContent = label;

    metric.appendChild(valueElement);
    metric.appendChild(labelElement);
    return metric;
}

function renderSimpleList(documentRef, container, title, items, renderItem, emptyText) {
    const section = documentRef.createElement('section');
    section.className = 'min-w-0';

    const heading = documentRef.createElement('h4');
    heading.className = 'text-sm font-semibold text-gray-900 mb-2';
    heading.textContent = title;
    section.appendChild(heading);

    const list = documentRef.createElement('div');
    list.className = 'max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white divide-y divide-gray-100';

    if (items.length === 0) {
        const empty = documentRef.createElement('div');
        empty.className = 'px-3 py-2 text-sm text-gray-500';
        empty.textContent = emptyText;
        list.appendChild(empty);
    } else {
        items.slice(0, 40).forEach((item) => {
            const row = documentRef.createElement('div');
            row.className = 'px-3 py-2 text-sm text-gray-700';
            row.textContent = renderItem(item);
            list.appendChild(row);
        });

        if (items.length > 40) {
            const more = documentRef.createElement('div');
            more.className = 'px-3 py-2 text-xs text-gray-500';
            more.textContent = `Showing 40 of ${items.length}`;
            list.appendChild(more);
        }
    }

    section.appendChild(list);
    container.appendChild(section);
}

function createAlojamentosCheckPanel({ documentRef, properties }) {
    const panel = documentRef.createElement('section');
    panel.className = 'mb-5 rounded-lg border border-gray-200 bg-white p-4 shadow-sm';

    const header = documentRef.createElement('div');
    header.className = 'flex flex-col lg:flex-row lg:items-end justify-between gap-4';

    const copy = documentRef.createElement('div');
    const title = documentRef.createElement('h3');
    title.className = 'text-base font-semibold text-gray-900';
    title.textContent = 'Alojamentos check';
    const description = documentRef.createElement('p');
    description.className = 'text-sm text-gray-600 mt-1';
    description.textContent = 'Upload the AH workbook to compare the Alojamentos sheet against the properties already in the app.';
    copy.appendChild(title);
    copy.appendChild(description);

    const input = documentRef.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.className = 'w-full lg:w-80 text-sm text-gray-600 file:mr-3 file:px-4 file:py-2 file:rounded-md file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200';

    header.appendChild(copy);
    header.appendChild(input);
    panel.appendChild(header);

    const result = documentRef.createElement('div');
    result.className = 'mt-4 hidden';
    panel.appendChild(result);

    const renderError = (message) => {
        result.className = 'mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700';
        result.textContent = message;
    };

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;

        if (typeof XLSX === 'undefined') {
            renderError('Excel parser is not available. Reload the page and try again.');
            return;
        }

        result.className = 'mt-4 text-sm text-gray-600';
        result.textContent = 'Reading workbook...';

        try {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames.find((name) => name.trim().toLowerCase() === 'alojamentos')
                ?? workbook.SheetNames.find((name) => name.toLowerCase().includes('alojamentos'))
                ?? workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            const parsed = parseAlojamentosRows(rows);
            const comparison = compareAlojamentosProperties(properties, parsed.properties);

            result.className = 'mt-4 space-y-4';
            result.innerHTML = '';

            const metrics = documentRef.createElement('div');
            metrics.className = 'grid grid-cols-2 md:grid-cols-5 gap-3';
            metrics.appendChild(createMetric(documentRef, 'Workbook', comparison.totals.imported, 'blue'));
            metrics.appendChild(createMetric(documentRef, 'Matched', comparison.totals.matched, 'green'));
            metrics.appendChild(createMetric(documentRef, 'Missing in app', comparison.totals.missingInApp, comparison.totals.missingInApp ? 'red' : 'gray'));
            metrics.appendChild(createMetric(documentRef, 'Only in app', comparison.totals.extraInApp, comparison.totals.extraInApp ? 'orange' : 'gray'));
            metrics.appendChild(createMetric(documentRef, 'Changed', comparison.totals.differences, comparison.totals.differences ? 'orange' : 'gray'));
            result.appendChild(metrics);

            const source = documentRef.createElement('p');
            source.className = 'text-xs text-gray-500';
            source.textContent = `Checked "${sheetName}" from ${file.name}. App currently has ${comparison.totals.existing} properties.`;
            result.appendChild(source);

            if (parsed.errors.length > 0) {
                const warning = documentRef.createElement('div');
                warning.className = 'rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700';
                warning.textContent = `${parsed.errors.length} workbook rows could not be read.`;
                result.appendChild(warning);
            }

            const lists = documentRef.createElement('div');
            lists.className = 'grid grid-cols-1 lg:grid-cols-3 gap-4';
            renderSimpleList(
                documentRef,
                lists,
                'Missing in app',
                comparison.missingInApp,
                (property) => `${property.name} - ${property.location} - ${property.typology}`,
                'No missing properties'
            );
            renderSimpleList(
                documentRef,
                lists,
                'Only in app',
                comparison.extraInApp,
                (property) => `${property.name} - ${property.location || ''} - ${property.typology || property.type || ''}`,
                'No extra app properties'
            );
            renderSimpleList(
                documentRef,
                lists,
                'Changed fields',
                comparison.differences,
                (entry) => `${entry.name}: ${entry.fields.map((field) => `${field.field} ${field.existing || '-'} -> ${field.imported || '-'}`).join(', ')}`,
                'No location or typology differences'
            );
            result.appendChild(lists);
        } catch (error) {
            renderError(`Could not check this file: ${error.message}`);
        }
    });

    return panel;
}

function createMissingWorkbench({
    documentRef,
    properties,
    getActiveCategory,
    getActiveField,
    onSaved
}) {
    const panel = documentRef.createElement('section');
    panel.className = 'allinfo-missing-workbench';

    const header = documentRef.createElement('div');
    header.className = 'allinfo-missing-header';
    header.innerHTML = `
        <div>
            <div class="allinfo-category-eyebrow">Missing data</div>
            <h3>Quick fix queue</h3>
        </div>
        <div class="allinfo-missing-actions">
            <button type="button" id="allinfo-save-filled-missing" class="allinfo-missing-save-all" disabled>
                <i class="fas fa-check-double"></i><span>Save filled</span>
            </button>
        </div>
    `;

    const body = documentRef.createElement('div');
    body.className = 'allinfo-missing-body';

    panel.appendChild(header);
    panel.appendChild(body);

    const getMissingItems = () => {
        const category = getActiveCategory();
        const activeField = getActiveField();
        const fields = activeField ? [activeField] : category.fields;
        const items = [];

        properties.forEach((property) => {
            fields.forEach((field) => {
                if (isMissingValue(property[field])) {
                    items.push({ property, field, category });
                }
            });
        });

        return items;
    };

    const updateSaveAllState = () => {
        const saveAllButton = panel.querySelector('#allinfo-save-filled-missing');
        const hasFilledValues = Array.from(panel.querySelectorAll('[data-missing-field]')).some((input) => (
            !isMissingValue(normalizeInlineValue(input))
        ));
        if (saveAllButton) {
            saveAllButton.disabled = !hasFilledValues;
        }
    };

    const saveInput = async (input, button) => {
        const propertyId = input.dataset.propertyId;
        const field = input.dataset.missingField;
        const property = properties.find((entry) => entry.id === propertyId);
        const value = normalizeInlineValue(input);

        if (!property || !field || isMissingValue(value)) {
            return false;
        }

        const manager = window.propertiesManager;
        if (!manager?.updateProperty) {
            button.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>No manager</span>';
            return false;
        }

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving</span>';

        try {
            await manager.updateProperty(property.id, { [field]: value });
            property[field] = value;
            button.innerHTML = '<i class="fas fa-check"></i><span>Saved</span>';
            return true;
        } catch (error) {
            console.error('Missing value save failed', error);
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Retry</span>';
            return false;
        }
    };

    const render = () => {
        const category = getActiveCategory();
        const items = getMissingItems();
        const shownItems = items.slice(0, 80);

        body.innerHTML = '';
        header.querySelector('h3').textContent = `${category.title} quick fix queue`;

        if (items.length === 0) {
            const empty = documentRef.createElement('div');
            empty.className = 'allinfo-missing-empty';
            empty.innerHTML = '<i class="fas fa-circle-check"></i><span>No missing fields in this view.</span>';
            body.appendChild(empty);
            updateSaveAllState();
            return;
        }

        const summary = documentRef.createElement('div');
        summary.className = 'allinfo-missing-summary';
        summary.textContent = `${items.length} missing field${items.length === 1 ? '' : 's'} found. Fill the values below and save one row or all filled rows.`;
        body.appendChild(summary);

        const list = documentRef.createElement('div');
        list.className = 'allinfo-missing-list';

        shownItems.forEach(({ property, field }) => {
            const item = documentRef.createElement('div');
            item.className = 'allinfo-missing-item';

            const label = documentRef.createElement('div');
            label.className = 'allinfo-missing-label';
            label.innerHTML = `
                <strong>${property.name || 'Unnamed property'}</strong>
                <span>${buildLabel(field)}</span>
            `;

            const input = createInlineFieldControl(documentRef, field, '');
            input.dataset.propertyId = property.id;
            input.dataset.missingField = field;
            input.addEventListener('input', updateSaveAllState);
            input.addEventListener('change', updateSaveAllState);

            const saveButton = documentRef.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'allinfo-missing-save';
            saveButton.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
            saveButton.addEventListener('click', async () => {
                const saved = await saveInput(input, saveButton);
                if (saved) {
                    onSaved?.();
                }
            });

            item.appendChild(label);
            item.appendChild(input);
            item.appendChild(saveButton);
            list.appendChild(item);
        });

        if (items.length > shownItems.length) {
            const more = documentRef.createElement('div');
            more.className = 'allinfo-missing-more';
            more.textContent = `Showing ${shownItems.length} of ${items.length}. Use the field filter to narrow this queue.`;
            list.appendChild(more);
        }

        body.appendChild(list);
        updateSaveAllState();
    };

    header.querySelector('#allinfo-save-filled-missing')?.addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const inputs = Array.from(panel.querySelectorAll('[data-missing-field]'))
            .filter((input) => !isMissingValue(normalizeInlineValue(input)));

        if (inputs.length === 0) {
            return;
        }

        const manager = window.propertiesManager;
        if (!manager?.updatePropertiesBatchMixed) {
            button.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>No manager</span>';
            return;
        }

        const items = inputs.map((input) => ({
            id: input.dataset.propertyId,
            field: input.dataset.missingField,
            value: normalizeInlineValue(input)
        }));

        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving</span>';

        try {
            await manager.updatePropertiesBatchMixed(items.map((item) => ({
                id: item.id,
                updates: { [item.field]: item.value }
            })));

            items.forEach((item) => {
                const property = properties.find((entry) => entry.id === item.id);
                if (property) {
                    property[item.field] = item.value;
                }
            });

            button.innerHTML = '<i class="fas fa-check"></i><span>Saved</span>';
            onSaved?.();
        } catch (error) {
            console.error('Bulk missing value save failed', error);
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Retry</span>';
        }
    });

    return { panel, render };
}

function renderCategoryTable({
    category,
    categoryIndex,
    properties,
    allProperties,
    filterState,
    documentRef,
    contentElement,
    onEditProperty
}) {
    const activeField = filterState.fieldKey || '';
    const categoryFields = activeField ? category.fields.filter((field) => field === activeField) : category.fields;
    const displayedFields = ['name', ...categoryFields];
    const stats = getCategoryStats(allProperties, category);
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'allinfo-table-shell overflow-x-auto';

    const categoryHeader = documentRef.createElement('div');
    categoryHeader.className = 'allinfo-category-header';
    categoryHeader.innerHTML = `
        <div>
            <div class="allinfo-category-eyebrow">${properties.length} visible of ${allProperties.length} properties</div>
            <h3>${category.title}</h3>
        </div>
        <div class="allinfo-category-kpis">
            <div><strong>${stats.completion}%</strong><span>complete</span></div>
            <div><strong>${stats.missingFields}</strong><span>missing fields</span></div>
            <div><strong>${stats.completeProperties}</strong><span>complete rows</span></div>
        </div>
    `;
    wrapper.appendChild(categoryHeader);

    const table = documentRef.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200 allinfo-data-table';

    const thead = documentRef.createElement('thead');
    thead.className = 'bg-gray-900 text-white';

    const headerRow = documentRef.createElement('tr');
    displayedFields.forEach((fieldKey, fieldIndex) => {
        const th = documentRef.createElement('th');
        th.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase cursor-pointer bg-gray-900';
        th.innerHTML = `<span>${buildLabel(fieldKey)}</span> <i class="fas fa-sort ml-1 text-gray-400"></i>`;
        th.onclick = () => {
            const ascending = !th.asc;
            th.asc = ascending;
            headerRow.querySelectorAll('th').forEach((cell) => cell.classList.remove('asc', 'desc'));
            th.classList.add(ascending ? 'asc' : 'desc');
            sortTable(table, fieldIndex, ascending);
        };
        headerRow.appendChild(th);
    });

    const actionsHeader = documentRef.createElement('th');
    actionsHeader.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider bg-gray-900';
    actionsHeader.textContent = 'Actions';
    headerRow.appendChild(actionsHeader);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = documentRef.createElement('tbody');
    tbody.className = 'bg-white divide-y divide-gray-200';
    const currencyFormatter = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

    properties.forEach((property) => {
        const row = documentRef.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.dataset.propertyId = property.id ?? '';
        const rowState = {
            dirty: false,
            updates: {}
        };

        displayedFields.forEach((fieldKey) => {
            const td = documentRef.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-700';

            const missing = isMissingValue(property[fieldKey]);
            if (fieldKey === 'name') {
                td.classList.add('allinfo-property-cell');
                td.textContent = property[fieldKey] ?? '';
            } else if (fieldKey === 'cleaningCompanyPrice' || fieldKey === 'guestCleaningFee') {
                const numericValue = Number.parseFloat(property[fieldKey]);
                const isNumeric = Number.isFinite(numericValue);
                if (isNumeric) {
                    td.dataset.sort = String(numericValue);
                }

                const input = createInlineFieldControl(documentRef, fieldKey, property[fieldKey]);
                input.dataset.field = fieldKey;
                input.setAttribute('aria-label', `${property.name || 'Property'} ${buildLabel(fieldKey)}`);
                if (missing) {
                    td.classList.add('allinfo-empty-cell');
                }
                input.addEventListener('input', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
                    }
                });
                td.appendChild(input);
                td.dataset.display = isNumeric ? currencyFormatter.format(numericValue) : '';
            } else {
                const input = createInlineFieldControl(documentRef, fieldKey, property[fieldKey]);
                input.dataset.field = fieldKey;
                input.setAttribute('aria-label', `${property.name || 'Property'} ${buildLabel(fieldKey)}`);
                if (missing) {
                    td.classList.add('allinfo-empty-cell');
                }
                input.addEventListener('input', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
                    }
                });
                input.addEventListener('change', () => {
                    rowState.dirty = true;
                    rowState.updates[fieldKey] = normalizeInlineValue(input);
                    row.classList.add('allinfo-row-dirty');
                    const saveButton = row.querySelector('.allinfo-inline-save-btn');
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.innerHTML = '<i class="fas fa-save"></i><span>Save</span>';
                    }
                });
                td.appendChild(input);
            }

            row.appendChild(td);
        });

        const actionsCell = documentRef.createElement('td');
        actionsCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium';

        const saveButton = documentRef.createElement('button');
        saveButton.innerHTML = '<i class="fas fa-check"></i><span>Saved</span>';
        saveButton.className = 'allinfo-inline-save-btn';
        saveButton.title = `Save changes for ${property.name}`;
        saveButton.disabled = true;
        saveButton.onclick = async () => {
            if (!rowState.dirty || Object.keys(rowState.updates).length === 0) {
                return;
            }

            const manager = window.propertiesManager;
            if (!manager?.updateProperty) {
                saveButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>No manager</span>';
                return;
            }

            const updates = { ...rowState.updates };
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Saving</span>';

            try {
                await manager.updateProperty(property.id, updates);
                Object.assign(property, updates);
                rowState.dirty = false;
                rowState.updates = {};
                row.classList.remove('allinfo-row-dirty');
                row.querySelectorAll('.allinfo-empty-cell').forEach((cell) => {
                    const field = cell.querySelector('[data-field]')?.dataset.field;
                    if (field && !isMissingValue(property[field])) {
                        cell.classList.remove('allinfo-empty-cell');
                    }
                });
                saveButton.innerHTML = '<i class="fas fa-check"></i><span>Saved</span>';
            } catch (error) {
                console.error('Inline property save failed', error);
                saveButton.disabled = false;
                saveButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i><span>Retry</span>';
            }
        };
        actionsCell.appendChild(saveButton);

        const editButton = documentRef.createElement('button');
        editButton.innerHTML = '<i class="fas fa-external-link-alt"></i><span>Full page</span>';
        editButton.className = 'allinfo-row-edit-btn';
        editButton.title = `Open full settings for ${property.name}`;
        editButton.onclick = () => onEditProperty?.(property, category);
        actionsCell.appendChild(editButton);

        row.appendChild(actionsCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    const tableScroller = documentRef.createElement('div');
    tableScroller.className = 'allinfo-table-scroll';
    tableScroller.appendChild(table);
    wrapper.appendChild(tableScroller);
    contentElement.appendChild(wrapper);

    try {
        const event = new CustomEvent('allInfoCategoryRendered', {
            detail: { category, index: categoryIndex, properties, table }
        });
        documentRef.dispatchEvent(event);
    } catch (error) {
        // no-op
    }
}

export function initializeAllInfoPage({
    properties = [],
    documentRef = document,
    onEditProperty = () => {}
} = {}) {
    const navigationElement = documentRef.getElementById('allinfo-nav');
    const contentElement = documentRef.getElementById('allinfo-content');
    const filterWrapper = documentRef.getElementById('allinfo-filter-wrapper');

    if (!navigationElement || !contentElement || !filterWrapper) {
        return;
    }

    const sortedProperties = [...properties].sort((left, right) => (
        (left.name ?? '').localeCompare(right.name ?? '', undefined, { numeric: true, sensitivity: 'base' })
    ));

    navigationElement.innerHTML = '';
    contentElement.innerHTML = '';
    filterWrapper.innerHTML = '';

    const {
        searchBarsContainer,
        propertyFilterInput,
        categorySearchInput,
        dataFilterSelect,
        fieldFilterSelect
    } = createSearchBars(documentRef);

    const overview = documentRef.createElement('div');
    overview.className = 'allinfo-overview';

    const workspaceMenu = documentRef.createElement('div');
    workspaceMenu.className = 'allinfo-workspace-menu';
    const workspaceItems = [
        ['table', 'fas fa-table', 'Table'],
        ['missing', 'fas fa-list-check', 'Missing data'],
        ['compare', 'fas fa-file-excel', 'Alojamentos check'],
        ['edit', 'fas fa-pen-to-square', 'Edit tools']
    ];
    workspaceItems.forEach(([key, icon, label]) => {
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.dataset.workspace = key;
        button.innerHTML = `<i class="${icon}"></i><span>${label}</span>`;
        if (key === 'table') {
            button.classList.add('active');
        }
        workspaceMenu.appendChild(button);
    });

    const comparePanel = documentRef.createElement('div');
    comparePanel.className = 'allinfo-workspace-panel hidden';
    comparePanel.appendChild(createAlojamentosCheckPanel({ documentRef, properties: sortedProperties }));

    const missingPanel = documentRef.createElement('div');
    missingPanel.className = 'allinfo-workspace-panel hidden';

    const editToolsPanel = documentRef.createElement('div');
    editToolsPanel.className = 'allinfo-workspace-panel hidden';
    const editToolsIntro = documentRef.createElement('div');
    editToolsIntro.className = 'allinfo-edit-tools-intro';
    editToolsIntro.innerHTML = `
        <strong>Choose an edit mode</strong>
        <span>Use Bulk Edit for many properties, Sequential Edit for one-by-one review, or Accordion Edit for full category forms.</span>
    `;
    editToolsPanel.appendChild(editToolsIntro);

    filterWrapper.appendChild(workspaceMenu);
    filterWrapper.appendChild(searchBarsContainer);
    filterWrapper.appendChild(overview);
    filterWrapper.appendChild(comparePanel);
    filterWrapper.appendChild(missingPanel);
    filterWrapper.appendChild(editToolsPanel);

    const filterState = {
        activeCategoryIndex: 0,
        propertySearch: '',
        categorySearch: '',
        dataMode: 'all',
        fieldKey: '',
        workspace: 'table'
    };

    let missingWorkbench = null;

    const updateWorkspace = () => {
        const active = filterState.workspace;
        workspaceMenu.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('active', button.dataset.workspace === active);
        });

        const showCategoryControls = active !== 'compare';
        searchBarsContainer.classList.toggle('hidden', !showCategoryControls);
        navigationElement.classList.toggle('hidden', !showCategoryControls);
        overview.classList.toggle('hidden', active !== 'table');
        contentElement.classList.toggle('hidden', active === 'missing' || active === 'compare');
        missingPanel.classList.toggle('hidden', active !== 'missing');
        comparePanel.classList.toggle('hidden', active !== 'compare');
        editToolsPanel.classList.toggle('hidden', active !== 'edit');

        const actionsBar = documentRef.getElementById('allinfo-actions-bar');
        if (actionsBar && actionsBar.parentElement !== editToolsPanel) {
            editToolsPanel.appendChild(actionsBar);
        }
        actionsBar?.classList.toggle('hidden', active !== 'edit');

        if (active === 'missing') {
            missingWorkbench?.render();
        }
    };

    const updateOverview = () => {
        const categoriesWithMissing = ALL_INFO_CATEGORIES.filter((category) => (
            getCategoryStats(sortedProperties, category).missingFields > 0
        )).length;
        const totalMissing = ALL_INFO_CATEGORIES.reduce((sum, category) => (
            sum + getCategoryStats(sortedProperties, category).missingFields
        ), 0);
        const basicStats = getCategoryStats(sortedProperties, ALL_INFO_CATEGORIES[0]);

        overview.innerHTML = `
            <div class="allinfo-overview-item">
                <strong>${sortedProperties.length}</strong>
                <span>properties</span>
            </div>
            <div class="allinfo-overview-item">
                <strong>${basicStats.completion}%</strong>
                <span>basic info complete</span>
            </div>
            <div class="allinfo-overview-item ${totalMissing > 0 ? 'needs-attention' : ''}">
                <strong>${totalMissing}</strong>
                <span>missing fields</span>
            </div>
            <div class="allinfo-overview-item ${categoriesWithMissing > 0 ? 'needs-attention' : ''}">
                <strong>${categoriesWithMissing}</strong>
                <span>categories need review</span>
            </div>
        `;
    };

    const populateFieldFilter = (category) => {
        const currentValue = fieldFilterSelect.value;
        fieldFilterSelect.innerHTML = '';

        const allOption = documentRef.createElement('option');
        allOption.value = '';
        allOption.textContent = 'All fields';
        fieldFilterSelect.appendChild(allOption);

        category.fields.forEach((field) => {
            const option = documentRef.createElement('option');
            option.value = field;
            option.textContent = buildLabel(field);
            fieldFilterSelect.appendChild(option);
        });

        fieldFilterSelect.value = category.fields.includes(currentValue) ? currentValue : '';
        filterState.fieldKey = fieldFilterSelect.value;
    };

    const renderCategory = (categoryIndex) => {
        filterState.activeCategoryIndex = categoryIndex;
        const category = ALL_INFO_CATEGORIES[categoryIndex];
        populateFieldFilter(category);

        const searchTerm = filterState.propertySearch.toLowerCase();
        const visibleProperties = sortedProperties.filter((property) => {
            const matchesText = !searchTerm || [
                property.name,
                property.location,
                property.typology,
                property.type,
                ...category.fields.map((field) => property[field])
            ].some((value) => String(value ?? '').toLowerCase().includes(searchTerm));

            return matchesText && propertyMatchesCategoryFilter(
                property,
                category,
                filterState.dataMode,
                filterState.fieldKey
            );
        });

        contentElement.innerHTML = '';
        renderCategoryTable({
            category,
            categoryIndex,
            properties: visibleProperties,
            allProperties: sortedProperties,
            filterState,
            documentRef,
            contentElement,
            onEditProperty
        });

        missingWorkbench?.render();
        updateWorkspace();
    };

    missingWorkbench = createMissingWorkbench({
        documentRef,
        properties: sortedProperties,
        getActiveCategory: () => ALL_INFO_CATEGORIES[filterState.activeCategoryIndex],
        getActiveField: () => filterState.fieldKey,
        onSaved: () => {
            updateOverview();
            renderCategory(filterState.activeCategoryIndex);
        }
    });
    missingPanel.appendChild(missingWorkbench.panel);

    workspaceMenu.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-workspace]');
        if (!button) {
            return;
        }

        filterState.workspace = button.dataset.workspace;
        updateWorkspace();
    });

    ALL_INFO_CATEGORIES.forEach((category, categoryIndex) => {
        const button = documentRef.createElement('button');
        const stats = getCategoryStats(sortedProperties, category);
        const badgeClass = stats.missingFields > 0 ? 'allinfo-cat-badge needs-attention' : 'allinfo-cat-badge';
        button.innerHTML = `<i class="${category.icon}"></i><span>${category.title}</span><strong class="${badgeClass}">${stats.missingFields}</strong>`;
        button.className = 'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm hover:bg-gray-100';
        button.dataset.idx = String(categoryIndex);

        if (categoryIndex === 0) {
            button.classList.add('bg-gray-100');
        }

        button.onclick = () => {
            Array.from(navigationElement.children).forEach((entry) => entry.classList.remove('bg-gray-100'));
            button.classList.add('bg-gray-100');
            renderCategory(categoryIndex);
        };

        navigationElement.appendChild(button);
    });

    categorySearchInput.addEventListener('input', (event) => {
        const searchTerm = event.target.value.toLowerCase();
        filterState.categorySearch = searchTerm;

        Array.from(navigationElement.children).forEach((button) => {
            const categoryIndex = Number.parseInt(button.dataset.idx, 10);
            const category = ALL_INFO_CATEGORIES[categoryIndex];
            const matchesCategory = button.textContent.toLowerCase().includes(searchTerm)
                || category.fields.some((field) => field.toLowerCase().includes(searchTerm));
            button.style.display = matchesCategory ? '' : 'none';
        });

        const hasVisibleActiveButton = Array.from(navigationElement.children).some((button) => (
            button.classList.contains('bg-gray-100') && button.style.display !== 'none'
        ));

        if (!hasVisibleActiveButton) {
            const firstVisibleButton = Array.from(navigationElement.children).find((button) => button.style.display !== 'none');
            firstVisibleButton?.click();
        }
    });

    propertyFilterInput.addEventListener('input', (event) => {
        filterState.propertySearch = event.target.value.trim();
        renderCategory(filterState.activeCategoryIndex);
    });

    dataFilterSelect.addEventListener('change', (event) => {
        filterState.dataMode = event.target.value;
        renderCategory(filterState.activeCategoryIndex);
    });

    fieldFilterSelect.addEventListener('change', (event) => {
        filterState.fieldKey = event.target.value;
        renderCategory(filterState.activeCategoryIndex);
    });

    updateOverview();
    renderCategory(0);
    updateWorkspace();
}
