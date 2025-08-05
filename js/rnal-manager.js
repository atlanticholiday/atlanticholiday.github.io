export class RnalManager {
    constructor() {
        this.processedDataCache = null;
        this.init();
    }

    init() {
        // Initialize event listeners when the page is opened
        document.addEventListener('rnalPageOpened', () => {
            this.setupEventListeners();
            this.populateDropdown();
        });
    }

    setupEventListeners() {
        // --- DOM Element References ---
        const dropZone = document.getElementById('rnal-drop-zone');
        const fileInput = document.getElementById('rnal-file-input');
        const fileNameDisplay = document.getElementById('rnal-file-name');
        const saveSection = document.getElementById('rnal-save-section');
        const tableNameInput = document.getElementById('rnal-table-name-input');
        const saveTableBtn = document.getElementById('rnal-save-table-btn');
        const savedTablesDropdown = document.getElementById('saved-tables-dropdown');
        const loadTableBtn = document.getElementById('load-table-btn');
        const deleteTableBtn = document.getElementById('delete-table-btn');
        const outputSection = document.getElementById('rnal-output-section');
        const tableHead = document.getElementById('rnal-table-head');
        const tableBody = document.getElementById('rnal-table-body');
        const searchInput = document.getElementById('rnal-search-input');
        const currentTableTitle = document.getElementById('rnal-current-table-title');

        // --- File Drop and Select Logic ---
        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());
            dropZone.addEventListener('dragover', (e) => { 
                e.preventDefault(); 
                dropZone.style.borderColor = '#3b82f6';
                dropZone.style.backgroundColor = '#eff6ff';
            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.style.borderColor = '#cbd5e1';
                dropZone.style.backgroundColor = '';
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#cbd5e1';
                dropZone.style.backgroundColor = '';
                const files = e.dataTransfer.files;
                if (files.length) this.handleFile(files[0]);
            });
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length) this.handleFile(e.target.files[0]);
            });
        }

        // --- Save, Load, Delete Logic ---
        if (saveTableBtn) {
            saveTableBtn.addEventListener('click', () => {
                const name = tableNameInput?.value.trim();
                if (!name) {
                    alert('Por favor, insira um nome para a tabela.');
                    return;
                }
                if (!this.processedDataCache) {
                    alert('Não há dados processados para guardar. Por favor, carregue um ficheiro primeiro.');
                    return;
                }
                this.saveData(name, this.processedDataCache);
                if (tableNameInput) tableNameInput.value = '';
                if (saveSection) saveSection.classList.add('hidden');
                this.processedDataCache = null;
                if (fileNameDisplay) fileNameDisplay.textContent = '';
            });
        }

        if (loadTableBtn) {
            loadTableBtn.addEventListener('click', () => {
                const name = savedTablesDropdown?.value;
                if (!name) {
                    alert('Por favor, selecione uma tabela para carregar.');
                    return;
                }
                const data = this.loadData(name);
                if (data) {
                    this.displayTable(data, name);
                }
            });
        }

        if (deleteTableBtn) {
            deleteTableBtn.addEventListener('click', () => {
                const name = savedTablesDropdown?.value;
                if (!name) {
                    alert('Por favor, selecione uma tabela para apagar.');
                    return;
                }
                if (confirm(`Tem a certeza que quer apagar a tabela "${name}"?`)) {
                    this.deleteData(name);
                }
            });
        }

        // --- Search Filter Logic ---
        if (searchInput && tableBody) {
            searchInput.addEventListener('keyup', () => {
                const searchTerm = searchInput.value.toLowerCase();
                const rows = tableBody.getElementsByTagName('tr');
                let resultsFound = false;
                for (const row of rows) {
                    const rowText = row.textContent.toLowerCase();
                    if (rowText.includes(searchTerm)) {
                        row.style.display = '';
                        resultsFound = true;
                    } else {
                        row.style.display = 'none';
                    }
                }
                const noResults = document.getElementById('rnal-no-results');
                if (noResults) {
                    noResults.style.display = resultsFound ? 'none' : 'block';
                }
            });
        }
    }

    handleFile(file) {
        const fileNameDisplay = document.getElementById('rnal-file-name');
        const saveSection = document.getElementById('rnal-save-section');
        
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = e.target.result;
            let jsonData;
            try {
                if (file.name.endsWith('.csv')) {
                    const parsed = Papa.parse(data, { header: true, skipEmptyLines: true });
                    jsonData = parsed.data;
                } else {
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    jsonData = XLSX.utils.sheet_to_json(worksheet);
                }
                this.processedDataCache = jsonData; // Cache the data
                this.displayTable(jsonData, 'Ficheiro Carregado Recentemente');
                if (saveSection) saveSection.classList.remove('hidden');
            } catch (error) {
                alert('Erro ao processar o ficheiro. Verifique o formato.');
                console.error(error);
            }
        };
        reader.onerror = () => alert('Erro ao ler o ficheiro.');
        if (file.name.endsWith('.csv')) {
            reader.readAsText(file);
        } else {
            reader.readAsBinaryString(file);
        }
    }

    saveData(name, data) {
        const savedTables = this.getSavedTables();
        savedTables[name] = data;
        localStorage.setItem('rnal_tables', JSON.stringify(savedTables));
        alert(`Tabela "${name}" guardada com sucesso!`);
        this.populateDropdown();
    }

    loadData(name) {
        const savedTables = this.getSavedTables();
        return savedTables[name] || null;
    }

    deleteData(name) {
        const savedTables = this.getSavedTables();
        delete savedTables[name];
        localStorage.setItem('rnal_tables', JSON.stringify(savedTables));
        alert(`Tabela "${name}" apagada.`);
        this.populateDropdown();
        const outputSection = document.getElementById('rnal-output-section');
        if (outputSection) outputSection.classList.add('hidden');
    }

    getSavedTables() {
        return JSON.parse(localStorage.getItem('rnal_tables')) || {};
    }

    populateDropdown() {
        const savedTablesDropdown = document.getElementById('saved-tables-dropdown');
        if (!savedTablesDropdown) return;

        const savedTables = this.getSavedTables();
        savedTablesDropdown.innerHTML = '<option value="">Selecione uma tabela guardada...</option>';
        for (const name in savedTables) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            savedTablesDropdown.appendChild(option);
        }
    }

    displayTable(data, title) {
        const requiredHeaders = [
            'Email enviado', 'Data do registo', 'Contacto Email', 'Titular Qualidade', 
            'Nome do Alojamento', 'Nº de registo', 'Notas', 'Modalidade', 
            'Nº Utentes', 'Nº Quartos', 'Localização (Endereço)', 'Localização (Código postal)', 
            'Localização (Concelho)', 'Nome do Titular da Exploração', 'Contribuinte'
        ];
        
        const tableHead = document.getElementById('rnal-table-head');
        const tableBody = document.getElementById('rnal-table-body');
        const currentTableTitle = document.getElementById('rnal-current-table-title');
        const outputSection = document.getElementById('rnal-output-section');
        
        if (!data || data.length === 0) {
            alert('Não foram encontrados dados no ficheiro.');
            return;
        }

        if (tableHead) tableHead.innerHTML = '';
        if (tableBody) tableBody.innerHTML = '';
        if (currentTableTitle) currentTableTitle.textContent = title;

        // Create header row
        if (tableHead) {
            const headerRow = document.createElement('tr');
            requiredHeaders.forEach(headerText => {
                const th = document.createElement('th');
                th.scope = 'col';
                th.className = 'px-6 py-3';
                th.textContent = headerText;
                if (headerText.toLowerCase().includes('endereço')) {
                    th.style.minWidth = '250px';
                }
                headerRow.appendChild(th);
            });
            tableHead.appendChild(headerRow);
        }

        // Create data rows
        if (tableBody) {
            data.forEach(item => {
                const dataRow = document.createElement('tr');
                dataRow.className = 'hover:bg-gray-50';
                requiredHeaders.forEach(header => {
                    const td = document.createElement('td');
                    td.className = 'px-6 py-4 whitespace-normal';
                    if (header === 'Email enviado') {
                        td.innerHTML = `<div class="flex justify-center"><input type="checkbox" class="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"></div>`;
                    } else {
                        const key = Object.keys(item).find(k => k.toLowerCase().trim() === header.toLowerCase().trim());
                        let cellValue = key ? item[key] : '';
                        if (typeof cellValue === 'number' && header.toLowerCase().includes('data')) {
                           cellValue = new Date(Math.round((cellValue - 25569) * 86400 * 1000)).toLocaleDateString('pt-PT');
                        }
                        td.textContent = cellValue || '';
                    }
                    dataRow.appendChild(td);
                });
                tableBody.appendChild(dataRow);
            });
        }
        
        if (outputSection) outputSection.classList.remove('hidden');
    }
} 