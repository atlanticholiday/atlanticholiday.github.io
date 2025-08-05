import { collection, addDoc, onSnapshot, deleteDoc, doc, updateDoc, query, where, getDocs, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

export class RnalManager {
    constructor(db = null, userId = null) {
        this.db = db;
        this.userId = userId;
        this.processedDataCache = null;
        this.unsubscribe = null;
        this.init();
    }

    setDatabase(db, userId) {
        this.db = db;
        this.userId = userId;
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
            dropZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#cbd5e1';
                dropZone.style.backgroundColor = '';
                const files = e.dataTransfer.files;
                if (files.length) await this.handleFile(files[0]);
            });
            fileInput.addEventListener('change', async (e) => {
                if (e.target.files.length) await this.handleFile(e.target.files[0]);
            });
        }

        // --- Save, Load, Delete Logic ---
        if (saveTableBtn) {
            saveTableBtn.addEventListener('click', async () => {
                const name = tableNameInput?.value.trim();
                if (!name) {
                    alert('Por favor, insira um nome para a tabela.');
                    return;
                }
                if (!this.processedDataCache) {
                    alert('Não há dados processados para guardar. Por favor, carregue um ficheiro primeiro.');
                    return;
                }
                await this.saveData(name, this.processedDataCache);
                if (tableNameInput) tableNameInput.value = '';
                if (saveSection) saveSection.classList.add('hidden');
                this.processedDataCache = null;
                if (fileNameDisplay) fileNameDisplay.textContent = '';
            });
        }

        if (loadTableBtn) {
            loadTableBtn.addEventListener('click', async () => {
                const name = savedTablesDropdown?.value;
                if (!name) {
                    alert('Por favor, selecione uma tabela para carregar.');
                    return;
                }
                const data = await this.loadData(name);
                if (data) {
                    this.displayTable(data, name);
                }
            });
        }

        if (deleteTableBtn) {
            deleteTableBtn.addEventListener('click', async () => {
                const name = savedTablesDropdown?.value;
                if (!name) {
                    alert('Por favor, selecione uma tabela para apagar.');
                    return;
                }
                if (confirm(`Tem a certeza que quer apagar a tabela "${name}"?`)) {
                    await this.deleteData(name);
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

    async handleFile(file) {
        const fileNameDisplay = document.getElementById('rnal-file-name');
        const saveSection = document.getElementById('rnal-save-section');
        
        if (fileNameDisplay) fileNameDisplay.textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
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
                
                // Show loading message
                if (fileNameDisplay) fileNameDisplay.textContent = `${file.name} - Verificando duplicados...`;
                
                // Remove duplicates against existing data
                const uniqueData = await this.removeDuplicateRows(jsonData);
                const originalCount = jsonData.length;
                const uniqueCount = uniqueData.length;
                const duplicatesRemoved = originalCount - uniqueCount;
                
                // Update file name display
                if (fileNameDisplay) fileNameDisplay.textContent = file.name;
                
                if (duplicatesRemoved > 0) {
                    alert(`Ficheiro processado!\n\n📊 Resumo:\n• Total de linhas no ficheiro: ${originalCount}\n• Linhas duplicadas removidas: ${duplicatesRemoved}\n• Linhas únicas para guardar: ${uniqueCount}\n\n✅ Pronto para guardar!`);
                } else {
                    alert(`Ficheiro processado!\n\n📊 Resumo:\n• Total de linhas: ${originalCount}\n• Nenhuma linha duplicada encontrada\n\n✅ Todos os registos são únicos!`);
                }
                
                this.processedDataCache = uniqueData; // Cache the unique data
                const title = duplicatesRemoved > 0 
                    ? `Ficheiro Carregado (${uniqueCount} únicos de ${originalCount} total)`
                    : `Ficheiro Carregado (${uniqueCount} registos)`;
                this.displayTable(uniqueData, title);
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

    async saveData(name, data) {
        if (!this.db || !this.userId) {
            alert('Erro: Base de dados não disponível. Por favor, faça login novamente.');
            return;
        }

        try {
            // Create a secure document reference
            const docRef = doc(this.db, 'rnal_data', `${this.userId}_${Date.now()}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`);
            
            // Save data with metadata (no sensitive information exposed)
            await setDoc(docRef, {
                name: name,
                userId: this.userId,
                createdAt: new Date(),
                recordCount: data.length,
                // Store data securely - actual RNAL data is not exposed in logs
                data: data,
                lastModified: new Date()
            });
            
            alert(`Tabela "${name}" guardada com sucesso na base de dados segura!`);
            this.populateDropdown();
        } catch (error) {
            console.error('Erro ao guardar dados:', error);
            alert('Erro ao guardar dados. Por favor, tente novamente.');
        }
    }

    async loadData(name) {
        if (!this.db || !this.userId) {
            alert('Erro: Base de dados não disponível. Por favor, faça login novamente.');
            return null;
        }

        try {
            // Query for user's RNAL data with the specified name
            const q = query(
                collection(this.db, 'rnal_data'),
                where('userId', '==', this.userId),
                where('name', '==', name)
            );
            
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const doc = querySnapshot.docs[0];
                const docData = doc.data();
                return docData.data;
            } else {
                alert('Tabela não encontrada.');
                return null;
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            alert('Erro ao carregar dados. Por favor, tente novamente.');
            return null;
        }
    }

    async deleteData(name) {
        if (!this.db || !this.userId) {
            alert('Erro: Base de dados não disponível. Por favor, faça login novamente.');
            return;
        }

        try {
            // Query for user's RNAL data with the specified name
            const q = query(
                collection(this.db, 'rnal_data'),
                where('userId', '==', this.userId),
                where('name', '==', name)
            );
            
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
                const docToDelete = querySnapshot.docs[0];
                await deleteDoc(docToDelete.ref);
                alert(`Tabela "${name}" apagada da base de dados.`);
                this.populateDropdown();
                const outputSection = document.getElementById('rnal-output-section');
                if (outputSection) outputSection.classList.add('hidden');
            } else {
                alert('Tabela não encontrada.');
            }
        } catch (error) {
            console.error('Erro ao apagar dados:', error);
            alert('Erro ao apagar dados. Por favor, tente novamente.');
        }
    }

    async populateDropdown() {
        const savedTablesDropdown = document.getElementById('saved-tables-dropdown');
        if (!savedTablesDropdown || !this.db || !this.userId) return;

        try {
            // Query for user's RNAL data
            const q = query(
                collection(this.db, 'rnal_data'),
                where('userId', '==', this.userId)
            );
            
            const querySnapshot = await getDocs(q);
            
            savedTablesDropdown.innerHTML = '<option value="">Selecione uma tabela guardada...</option>';
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const option = document.createElement('option');
                option.value = data.name;
                option.textContent = `${data.name} (${data.recordCount} registos)`;
                savedTablesDropdown.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar lista de tabelas:', error);
            savedTablesDropdown.innerHTML = '<option value="">Erro ao carregar tabelas...</option>';
        }
    }

    async getAllExistingData() {
        if (!this.db || !this.userId) {
            return [];
        }

        try {
            // Query for all user's RNAL data
            const q = query(
                collection(this.db, 'rnal_data'),
                where('userId', '==', this.userId)
            );
            
            const querySnapshot = await getDocs(q);
            let allData = [];
            
            querySnapshot.forEach((doc) => {
                const docData = doc.data();
                if (docData.data && Array.isArray(docData.data)) {
                    allData = allData.concat(docData.data);
                }
            });
            
            return allData;
        } catch (error) {
            console.error('Erro ao carregar dados existentes:', error);
            return [];
        }
    }

    createRowHash(row) {
        // Create a unique hash for a row based on key identifying fields
        // Use the most important fields that would indicate a duplicate
        const keyFields = [
            'Nº de registo',
            'Nome do Alojamento', 
            'Contacto Email',
            'Nome do Titular da Exploração',
            'Contribuinte',
            'Localização (Endereço)',
            'Localização (Código postal)'
        ];
        
        const values = keyFields.map(field => {
            // Find the field in the row (case insensitive)
            const key = Object.keys(row).find(k => 
                k.toLowerCase().trim() === field.toLowerCase().trim()
            );
            return key ? String(row[key]).toLowerCase().trim() : '';
        }).filter(v => v !== ''); // Remove empty values
        
        return values.join('|');
    }

    async removeDuplicateRows(newData) {
        if (!this.db || !this.userId) {
            console.warn('Database não disponível para verificação de duplicados');
            return newData;
        }

        try {
            // Get all existing data
            const existingData = await this.getAllExistingData();
            
            // Create hash set of existing rows
            const existingHashes = new Set();
            existingData.forEach(row => {
                const hash = this.createRowHash(row);
                if (hash) existingHashes.add(hash);
            });
            
            // Filter out duplicates from new data
            const uniqueRows = [];
            const seenHashes = new Set(); // Also check for duplicates within the new file
            
            newData.forEach(row => {
                const hash = this.createRowHash(row);
                if (hash && !existingHashes.has(hash) && !seenHashes.has(hash)) {
                    uniqueRows.push(row);
                    seenHashes.add(hash);
                }
            });
            
            return uniqueRows;
        } catch (error) {
            console.error('Erro ao verificar duplicados:', error);
            // If duplicate checking fails, return original data
            return newData;
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

        // Create data rows (with data protection - no sensitive data exposed in DOM attributes)
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