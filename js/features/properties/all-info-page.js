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

function sortTable(table, columnIndex, ascending) {
    const tbody = table.querySelector('tbody');
    if (!tbody) {
        return;
    }

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

            const leftText = leftCell?.textContent?.trim() ?? '';
            const rightText = rightCell?.textContent?.trim() ?? '';
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
    propertyFilterWrapper.className = 'flex-1';

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

    const categorySearchWrapper = documentRef.createElement('div');
    categorySearchWrapper.id = 'allinfo-cat-search-wrapper';

    const categorySearchInput = documentRef.createElement('input');
    categorySearchInput.id = 'allinfo-cat-search';
    categorySearchInput.type = 'text';
    categorySearchInput.placeholder = 'Search categories...';

    categorySearchWrapper.appendChild(categorySearchInput);
    searchBarsContainer.appendChild(propertyFilterWrapper);
    searchBarsContainer.appendChild(categorySearchWrapper);

    return { searchBarsContainer, propertyFilterInput, categorySearchInput };
}

function renderCategoryTable({
    category,
    categoryIndex,
    properties,
    documentRef,
    contentElement,
    onEditProperty
}) {
    const displayedFields = ['name', ...category.fields];
    const wrapper = documentRef.createElement('div');
    wrapper.className = 'shadow overflow-x-auto border-b border-gray-200 sm:rounded-lg';

    const table = documentRef.createElement('table');
    table.className = 'min-w-full divide-y divide-gray-200';

    const thead = documentRef.createElement('thead');
    thead.className = 'bg-gray-900 text-white';

    const headerRow = documentRef.createElement('tr');
    displayedFields.forEach((fieldKey, fieldIndex) => {
        const th = documentRef.createElement('th');
        th.className = 'sticky top-0 z-10 px-6 py-3 text-left text-xs font-medium uppercase tracking-wider cursor-pointer bg-gray-900';
        th.innerHTML = `${buildLabel(fieldKey)} <i class="fas fa-sort ml-1 text-gray-400"></i>`;
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

        displayedFields.forEach((fieldKey) => {
            const td = documentRef.createElement('td');
            td.className = 'px-6 py-4 whitespace-nowrap text-sm text-gray-700';

            if (fieldKey === 'cleaningCompanyPrice' || fieldKey === 'guestCleaningFee') {
                const numericValue = Number.parseFloat(property[fieldKey]);
                const isNumeric = Number.isFinite(numericValue);
                td.textContent = isNumeric ? currencyFormatter.format(numericValue) : '';
                if (isNumeric) {
                    td.dataset.sort = String(numericValue);
                }
            } else {
                td.textContent = property[fieldKey] ?? '';
            }

            row.appendChild(td);
        });

        const actionsCell = documentRef.createElement('td');
        actionsCell.className = 'px-6 py-4 whitespace-nowrap text-sm font-medium flex gap-4';

        const editButton = documentRef.createElement('button');
        editButton.innerHTML = '<i class="fas fa-edit"></i>';
        editButton.className = 'text-blue-600 hover:text-gray-800 px-2 py-1 rounded';
        editButton.title = 'Edit';
        editButton.onclick = () => onEditProperty?.(property, category);
        actionsCell.appendChild(editButton);

        const pdfButton = documentRef.createElement('button');
        pdfButton.innerHTML = '<i class="fas fa-file-pdf"></i>';
        pdfButton.className = 'text-red-600 hover:text-gray-800 px-2 py-1 rounded';
        pdfButton.title = 'Download PDF';
        pdfButton.onclick = () => console.log('PDF for', property.id);
        actionsCell.appendChild(pdfButton);

        row.appendChild(actionsCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrapper.appendChild(table);
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

    const { searchBarsContainer, propertyFilterInput, categorySearchInput } = createSearchBars(documentRef);
    filterWrapper.appendChild(searchBarsContainer);

    const renderCategory = (categoryIndex) => {
        contentElement.innerHTML = '';
        renderCategoryTable({
            category: ALL_INFO_CATEGORIES[categoryIndex],
            categoryIndex,
            properties: sortedProperties,
            documentRef,
            contentElement,
            onEditProperty
        });
    };

    ALL_INFO_CATEGORIES.forEach((category, categoryIndex) => {
        const button = documentRef.createElement('button');
        button.innerHTML = `<i class="${category.icon}"></i><span>${category.title}</span>`;
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
        const searchTerm = event.target.value.toLowerCase();
        contentElement.querySelectorAll('tbody tr').forEach((row) => {
            row.style.display = row.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        });
    });

    renderCategory(0);
}
