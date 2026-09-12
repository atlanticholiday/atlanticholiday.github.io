/**
 * New Properties Onboarding Utility Functions and Constants
 * Atlantic Holiday
 */

export const BED_TYPES = Object.freeze([
    { id: 'single', label: 'Single Bed (90x200)', labelPt: 'Cama Individual (90x200)', defaultSize: '90x200cm' },
    { id: 'double', label: 'Double Bed (140x200)', labelPt: 'Cama de Casal (140x200)', defaultSize: '140x200cm' },
    { id: 'queen', label: 'Queen Bed (160x200)', labelPt: 'Cama Queen (160x200)', defaultSize: '160x200cm' },
    { id: 'king', label: 'King Bed (180x200)', labelPt: 'Cama King (180x200)', defaultSize: '180x200cm' },
    { id: 'sofaBed', label: 'Sofa Bed', labelPt: 'Sofá Cama', defaultSize: '140x200cm' },
    { id: 'cot', label: 'Baby Cot', labelPt: 'Berço Bebé', defaultSize: '60x120cm' }
]);

export const DEFAULT_CHECKLIST_TEMPLATE = Object.freeze([
    {
        area: 'Chaves',
        areaPt: 'Chaves',
        tasks: [
            { id: 'chaves_sets', title: 'Sets completos (1 clientes, 1 limpeza, 1 escritório)', responsible: 'Front Desk', done: false, notes: '' },
            { id: 'chaves_comandos', title: 'Comandos de Garagem', responsible: 'Front Desk', done: false, notes: '' }
        ]
    },
    {
        area: 'Alojamento',
        areaPt: 'Alojamento',
        tasks: [
            { id: 'aloj_fotos', title: 'Fotos do Alojamento', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_video_hospedes', title: 'Vídeo Hóspedes', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_testar_equipamentos', title: 'Testar equipamentos (Microondas, Fogão, etc…)', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_inventario', title: 'Inventário do alojamento', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_kit_seguranca', title: 'Kit de segurança (Placa de AL, Sinalização, Extintor)', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_validade_extintor', title: 'Validade do Extintor', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_cofre_chaves', title: 'Cofre de Chaves', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_wifi', title: 'Nome e Password Wifi', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_quadro_wifi', title: 'Quadro de Wifi e Recomendações', responsible: 'André / João', done: false, notes: '' },
            { id: 'aloj_armario_roupa', title: 'Armário da Roupa', responsible: 'André / João', done: false, notes: '' }
        ]
    },
    {
        area: 'Limpeza',
        areaPt: 'Limpeza',
        tasks: [
            { id: 'limpeza_primeira', title: '1ª Limpeza Geral', responsible: 'Front Desk / Lucas', done: false, notes: '' },
            { id: 'limpeza_video', title: 'Vídeo limpeza', responsible: 'Front Desk / Lucas', done: false, notes: '' },
            { id: 'limpeza_chaves_entregues', title: 'Chaves entregues à empresa', responsible: 'Front Desk / Lucas', done: false, notes: '' }
        ]
    },
    {
        area: 'Contrato & Escritório',
        areaPt: 'Contrato & Escritório',
        tasks: [
            { id: 'contrato_dados', title: 'Dados do Proprietário recolhidos', responsible: 'Lucas / Ana', done: false, notes: '' },
            { id: 'contrato_enviado', title: 'Contrato enviado ao dono', responsible: 'Lucas / Ana', done: false, notes: '' },
            { id: 'contrato_assinado', title: 'Contrato assinado', responsible: 'Lucas / Ana', done: false, notes: '' },
            { id: 'escritorio_nome_quadro', title: 'Nome no Quadro de Chaves', responsible: 'Front Desk', done: false, notes: '' },
            { id: 'escritorio_chaveiros', title: 'Chaveiros identificados', responsible: 'Front Desk', done: false, notes: '' }
        ]
    },
    {
        area: 'Notas Extra',
        areaPt: 'Notas Extra',
        tasks: [
            { id: 'notas_observacoes', title: 'Observações e Requisitos Especiais', responsible: 'Equipa', done: false, notes: '' }
        ]
    }
]);

/**
 * Calculates dynamic inventory quantities based on:
 * - bedrooms (Quartos)
 * - bathrooms (Casas de banho completas / Toaletes)
 * - capacity (Capacidade de hóspedes)
 * - beds (Lista de camas configuradas)
 */
export function calculatePropertyInventory({
    bedrooms = 1,
    bathrooms = 1,
    capacity = 2,
    beds = [{ type: 'double', size: '140x200cm', count: 1 }]
} = {}) {
    const numBedrooms = Math.max(0, parseInt(bedrooms, 10) || 0);
    const numBathrooms = Math.max(0, parseFloat(bathrooms) || 0);
    const numCapacity = Math.max(1, parseInt(capacity, 10) || 1);

    const safeBeds = Array.isArray(beds) ? beds : [];
    const regularBedsCount = safeBeds
        .filter(b => b && b.type !== 'cot')
        .reduce((sum, b) => sum + (parseInt(b.count, 10) || 1), 0);
    const totalBedsCount = safeBeds.reduce((sum, b) => sum + (parseInt(b.count, 10) || 1), 0);

    const guestMultiplier = Math.max(4, numCapacity * 2);

    const categories = [
        {
            id: 'bedroom',
            name: 'Quarto (Bedrooms)',
            namePt: 'Quarto',
            items: [
                { id: 'cabides', name: 'Cabides de Madeira', namePt: 'Cabides de Madeira', qty: numBedrooms * 20, rule: '20 por quarto', comments: '' },
                { id: 'blackout', name: 'Cortinas ou estores blackout', namePt: 'Cortinas ou estores blackout', qty: numBedrooms > 0 ? numBedrooms : 1, rule: '1 por quarto', comments: 'Obrigatório por lei' },
                { id: 'espelho_corpo', name: 'Espelho de corpo inteiro', namePt: 'Espelho de corpo inteiro', qty: numBedrooms, rule: '1 por quarto', comments: 'Opcional' },
                { id: 'ficha_tripla', name: 'Ficha tripla ou extensão', namePt: 'Ficha tripla ou extensão', qty: numBedrooms * 2, rule: '2 por quarto', comments: '' },
                { id: 'manta_decorativa', name: 'Manta decorativa', namePt: 'Manta decorativa', qty: numBedrooms, rule: '1 por quarto', comments: '' },
                { id: 'almofadas_decorativas', name: 'Almofadas decorativas', namePt: 'Almofadas decorativas', qty: regularBedsCount * 2, rule: '2 por cama', comments: 'Ideal para fotos' },
                { id: 'ventoinha_portatil', name: 'Ventoinha portátil', namePt: 'Ventoinha portátil', qty: numBedrooms, rule: '1 por quarto', comments: 'Opcional' },
                { id: 'aquecedor_portatil', name: 'Aquecedor portátil', namePt: 'Aquecedor portátil', qty: numBedrooms, rule: '1 por quarto', comments: 'Opcional' },
                { id: 'ar_condicionado', name: 'Ar condicionado', namePt: 'Ar condicionado', qty: numBedrooms, rule: '1 por quarto', comments: 'Opcional' }
            ]
        },
        {
            id: 'bathroom',
            name: 'Casa de banho (Bathrooms & Toilets)',
            namePt: 'Casa de banho',
            items: [
                { id: 'secador_cabelo', name: 'Secador de Cabelo', namePt: 'Secador de Cabelo', qty: Math.max(1, Math.ceil(numBathrooms)), rule: '1 por casa de banho', comments: '' },
                { id: 'escova_sanita', name: 'Escova para a sanita', namePt: 'Escova para a sanita', qty: Math.max(1, Math.ceil(numBathrooms)), rule: '1 por casa de banho', comments: '' },
                { id: 'balde_lixo_wc', name: 'Balde do lixo', namePt: 'Balde do lixo', qty: Math.max(1, Math.ceil(numBathrooms)), rule: '1 por casa de banho', comments: '' },
                { id: 'desentupidor', name: 'Desentupidor', namePt: 'Desentupidor', qty: 1, rule: '1 fixo', comments: '' }
            ]
        },
        {
            id: 'kitchen',
            name: 'Cozinha (Kitchen)',
            namePt: 'Cozinha',
            items: [
                // Resíduos
                { id: 'ecoponto', group: 'Resíduos', name: 'Ecoponto (azul, amarelo, verde)', namePt: 'Ecoponto (azul, amarelo, verde)', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei' },
                { id: 'balde_lixo_comum', group: 'Resíduos', name: 'Balde para lixo comum', namePt: 'Balde para lixo comum', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei' },
                // Louça e Pratos
                { id: 'pratos_rasos', group: 'Louça e Pratos', name: 'Pratos rasos', namePt: 'Pratos rasos', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'pratos_fundos', group: 'Louça e Pratos', name: 'Pratos fundos', namePt: 'Pratos fundos', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'pratos_sobremesa', group: 'Louça e Pratos', name: 'Pratos de sobremesa', namePt: 'Pratos de sobremesa', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'tigelas_cereal', group: 'Louça e Pratos', name: 'Tigelas para cereal', namePt: 'Tigelas para cereal', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'travessas', group: 'Louça e Pratos', name: 'Travessas', namePt: 'Travessas', qty: 2, rule: '2 tamanhos diferentes', comments: 'Diferentes tamanhos' },
                // Copos e Canecas
                { id: 'copos_sumo', group: 'Copos e Canecas', name: 'Copos de sumo', namePt: 'Copos de sumo', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'copos_vinho', group: 'Copos e Canecas', name: 'Copos de vinho', namePt: 'Copos de vinho', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'canecas_cha', group: 'Copos e Canecas', name: 'Canecas de chá', namePt: 'Canecas de chá', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'chavenas_cafe', group: 'Copos e Canecas', name: 'Chávena de café', namePt: 'Chávena de café', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                // Talheres
                { id: 'garfos', group: 'Talheres', name: 'Garfos', namePt: 'Garfos', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'facas', group: 'Talheres', name: 'Facas', namePt: 'Facas', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'colheres', group: 'Talheres', name: 'Colheres', namePt: 'Colheres', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'colheres_cha', group: 'Talheres', name: 'Colheres de chá', namePt: 'Colheres de chá', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                { id: 'colheres_cafe', group: 'Talheres', name: 'Colheres de café', namePt: 'Colheres de café', qty: guestMultiplier, rule: '2 por hóspede (min 4)', comments: '' },
                // Utensílios Diversos
                { id: 'tabua_pequena', group: 'Utensílios Diversos', name: 'Tábua de cozinha pequena', namePt: 'Tábua de cozinha pequena', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'tabua_media', group: 'Utensílios Diversos', name: 'Tábua de cozinha média', namePt: 'Tábua de cozinha média', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'fruteira', group: 'Utensílios Diversos', name: 'Fruteira de metal', namePt: 'Fruteira de metal', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'saladeira', group: 'Utensílios Diversos', name: 'Saladeira (cerâmica ou vidro)', namePt: 'Saladeira (cerâmica ou vidro)', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'panos_cozinha', group: 'Utensílios Diversos', name: 'Pano(s) de cozinha', namePt: 'Pano(s) de cozinha', qty: 5, rule: '5 fixo', comments: '' },
                { id: 'luva_cozinha', group: 'Utensílios Diversos', name: 'Luva de cozinha', namePt: 'Luva de cozinha', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'ralador', group: 'Utensílios Diversos', name: 'Ralador', namePt: 'Ralador', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'coador', group: 'Utensílios Diversos', name: 'Coador', namePt: 'Coador', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'descanso_panelas', group: 'Utensílios Diversos', name: 'Descanso para panelas quentes', namePt: 'Descanso para panelas quentes', qty: 2, rule: '2 fixo', comments: '' },
                { id: 'jarra_medidora', group: 'Utensílios Diversos', name: 'Jarra medidora', namePt: 'Jarra medidora', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'saca_rolhas', group: 'Utensílios Diversos', name: 'Saca-rolhas', namePt: 'Saca-rolhas', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'descascador_legumes', group: 'Utensílios Diversos', name: 'Descascador de legumes', namePt: 'Descascador de legumes', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'espremedor', group: 'Utensílios Diversos', name: 'Espremedor', namePt: 'Espremedor', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'afiador_facas', group: 'Utensílios Diversos', name: 'Afiador de facas', namePt: 'Afiador de facas', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'escorredor_loica', group: 'Utensílios Diversos', name: 'Escorredor de loiça', namePt: 'Escorredor de loiça', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'escorredor_comida', group: 'Utensílios Diversos', name: 'Escorredor de comida', namePt: 'Escorredor de comida', qty: 1, rule: '1 fixo', comments: '' },
                // Panelas e Frigideiras
                { id: 'panela_media', group: 'Panelas e frigideiras', name: 'Panela média', namePt: 'Panela média', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'panela_grande', group: 'Panelas e frigideiras', name: 'Panela grande', namePt: 'Panela grande', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'frigideira_media', group: 'Panelas e frigideiras', name: 'Frigideira média', namePt: 'Frigideira média', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'frigideira_grande', group: 'Panelas e frigideiras', name: 'Frigideira grande', namePt: 'Frigideira grande', qty: 1, rule: '1 fixo', comments: '' },
                // Eletrodomésticos
                { id: 'frigorifico', group: 'Eletrodomésticos', name: 'Frigorífico', namePt: 'Frigorífico', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'congelador', group: 'Eletrodomésticos', name: 'Congelador', namePt: 'Congelador', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'microondas', group: 'Eletrodomésticos', name: 'Micro-ondas', namePt: 'Micro-ondas', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'fogao_placa', group: 'Eletrodomésticos', name: 'Fogão ou placa', namePt: 'Fogão ou placa', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'forno', group: 'Eletrodomésticos', name: 'Forno', namePt: 'Forno', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'maquina_loica', group: 'Eletrodomésticos', name: 'Máquina de lavar loiça', namePt: 'Máquina de lavar loiça', qty: 1, rule: '1 fixo', comments: 'Opcional' },
                { id: 'maquina_cafe', group: 'Eletrodomésticos', name: 'Máquina de café "Dolce Gusto"', namePt: 'Máquina de café "Dolce Gusto"', qty: 1, rule: '1 fixo', comments: 'Ou Nespresso ou Delta Q.' },
                { id: 'chaleira_eletrica', group: 'Eletrodomésticos', name: 'Chaleira elétrica', namePt: 'Chaleira elétrica', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'torradeira', group: 'Eletrodomésticos', name: 'Torradeira', namePt: 'Torradeira', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'liquidificadora', group: 'Eletrodomésticos', name: 'Liquidificadora', namePt: 'Liquidificadora', qty: 1, rule: '1 fixo', comments: 'Opcional' }
            ]
        },
        {
            id: 'laundry',
            name: 'Lavandaria (Laundry)',
            namePt: 'Lavandaria',
            items: [
                { id: 'maquina_roupa', name: 'Máquina de lavar roupa', namePt: 'Máquina de lavar roupa', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'maquina_secar', name: 'Máquina de secar roupa', namePt: 'Máquina de secar roupa', qty: 1, rule: '1 fixo', comments: 'Opcional' },
                { id: 'ferro_engomar', name: 'Ferro de engomar', namePt: 'Ferro de engomar', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'tabua_engomar', name: 'Tábua de engomar', namePt: 'Tábua de engomar', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'molas_roupa', name: 'Molas para roupa', namePt: 'Molas para roupa', qty: 1, rule: '1 conjunto', comments: 'Recomendado 24 ou mais' },
                { id: 'estendal', name: 'Estendal', namePt: 'Estendal', qty: 1, rule: '1 fixo', comments: '' },
                { id: 'aspirador', name: 'Aspirador', namePt: 'Aspirador', qty: 1, rule: '1 fixo', comments: 'Opcional' },
                { id: 'cesto_roupa', name: 'Cesto para roupa suja', namePt: 'Cesto para roupa suja', qty: 1, rule: '1 fixo', comments: 'Opcional' }
            ]
        },
        {
            id: 'living_room',
            name: 'Sala de estar/jantar (Living & Dining)',
            namePt: 'Sala de estar/jantar',
            items: [
                { id: 'internet', name: 'Internet Wi-Fi', namePt: 'Internet Wi-Fi', qty: 1, rule: '1 fixo', comments: 'Recomendado 500Mbps ou superior' },
                { id: 'smart_tv', name: 'Smart TV', namePt: 'Smart TV', qty: 1, rule: '1 fixo', comments: 'Recomendado 55\'\' polegadas ou superior' },
                { id: 'toalha_mesa', name: 'Toalha de mesa', namePt: 'Toalha de mesa', qty: 3, rule: '3 fixo', comments: 'Opcional' },
                { id: 'bases_pratos', name: 'Bases para os pratos', namePt: 'Bases para os pratos', qty: Math.max(4, numCapacity), rule: '1 por hóspede (min 4)', comments: '' },
                { id: 'mantas_sofa', name: 'Mantas para sofá', namePt: 'Mantas para sofá', qty: 3, rule: '3 fixo', comments: '' }
            ]
        },
        {
            id: 'other_safety',
            name: 'Outros & Segurança (Safety & Essentials)',
            namePt: 'Outros & Segurança',
            items: [
                { id: 'extintor', name: 'Extintor de Incêndio', namePt: 'Extintor de Incêndio', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei (Kit de segurança)' },
                { id: 'manta_incendio', name: 'Manta de Incêndio', namePt: 'Manta de Incêndio', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei (Kit de segurança)' },
                { id: 'primeiros_socorros', name: 'Caixa de primeiros socorros', namePt: 'Caixa de primeiros socorros', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei (Kit de segurança)' },
                { id: 'sinalizacao', name: 'Sinalização de Emergência', namePt: 'Sinalização de Emergência', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei (Kit de segurança)' },
                { id: 'detetor_fumo', name: 'Detetor de fumo', namePt: 'Detetor de fumo', qty: 1, rule: '1 fixo', comments: 'Opcional' },
                { id: 'berco_portatil', name: 'Berço portátil', namePt: 'Berço portátil', qty: 1, rule: '1 fixo', comments: 'Recomendado' },
                { id: 'colchao_berco', name: 'Colchão para o berço', namePt: 'Colchão para o berço', qty: 1, rule: '1 fixo', comments: 'Recomendado' },
                { id: 'cadeira_refeicao_bebe', name: 'Cadeira de refeição para bebé', namePt: 'Cadeira de refeição para bebé', qty: 1, rule: '1 fixo', comments: 'Recomendado' },
                { id: 'movel_roupas_cama', name: 'Móvel para guardar roupas de cama e toalhas', namePt: 'Móvel para guardar roupas de cama e toalhas', qty: 1, rule: '1 fixo', comments: 'Recomendado' }
            ]
        },
        {
            id: 'documents',
            name: 'Documentos (Documents)',
            namePt: 'Documentos',
            items: [
                { id: 'livro_reclamacoes', name: 'Livro de reclamações', namePt: 'Livro de reclamações', qty: 1, rule: '1 fixo', comments: 'Obrigatório por lei' }
            ]
        },
        {
            id: 'linens',
            name: 'Roupas de Cama e Toalhas (Linens & Bedding Sets)',
            namePt: 'Roupas de Cama e Toalhas',
            items: [
                // Bedding rules (scaled by configured beds)
                { id: 'protetor_colchao', name: 'Protetores de colchão', namePt: 'Protetores de colchão', qty: regularBedsCount * 2, rule: '2 por cama', comments: 'Mudanças por cama' },
                { id: 'lencol_ajustavel', name: 'Lençóis ajustáveis (de baixo)', namePt: 'Lençóis ajustáveis', qty: regularBedsCount * 3, rule: '3 por cama', comments: 'Mudanças por cama' },
                { id: 'lencol_cima', name: 'Lençóis de cima', namePt: 'Lençóis de cima', qty: regularBedsCount * 3, rule: '3 por cama', comments: 'Mudanças por cama' },
                { id: 'edredao', name: 'Edredões', namePt: 'Edredões', qty: regularBedsCount * 2, rule: '2 por cama', comments: 'Mudanças por cama' },
                { id: 'capa_edredao', name: 'Capas de edredão', namePt: 'Capas de edredão', qty: regularBedsCount * 3, rule: '3 por cama', comments: 'Mudanças por cama' },
                // Towels (scaled by guests and bathrooms)
                { id: 'toalha_banho', name: 'Toalhas de banho', namePt: 'Toalhas de banho', qty: numCapacity * 3, rule: '3 por hóspede', comments: '' },
                { id: 'toalha_rosto', name: 'Toalhas de rosto', namePt: 'Toalhas de rosto', qty: numCapacity * 3, rule: '3 por hóspede', comments: '' },
                { id: 'tapete_banho', name: 'Tapetes de banho', namePt: 'Tapetes de banho', qty: Math.max(1, Math.ceil(numBathrooms)) * 3, rule: '3 por casa de banho', comments: '' },
                // Pillows (scaled by guests)
                { id: 'almofadas_dormir', name: 'Almofadas de dormir (retangulares/quadradas)', namePt: 'Almofadas de dormir', qty: Math.ceil(numCapacity * 1.5), rule: '1.5 por hóspede', comments: '' },
                { id: 'protetores_almofada', name: 'Protetores de almofada', namePt: 'Protetores de almofada', qty: numCapacity * 2, rule: '2 por hóspede', comments: '' },
                { id: 'fronhas_almofada', name: 'Fronhas / capas de almofada', namePt: 'Fronhas de almofada', qty: numCapacity * 3, rule: '3 por hóspede', comments: '' }
            ]
        }
    ];

    return {
        bedrooms: numBedrooms,
        bathrooms: numBathrooms,
        capacity: numCapacity,
        regularBedsCount,
        totalBedsCount,
        categories
    };
}

/**
 * Calculates completion percentage and task stats for a property checklist.
 */
export function calculateChecklistProgress(checklist = []) {
    let total = 0;
    let completed = 0;

    (checklist || []).forEach(areaGroup => {
        (areaGroup.tasks || []).forEach(task => {
            total += 1;
            if (task.done) completed += 1;
        });
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
}

/**
 * Clones the default checklist template for a property.
 */
export function createDefaultChecklist() {
    return JSON.parse(JSON.stringify(DEFAULT_CHECKLIST_TEMPLATE));
}

/**
 * Maps raw property data from the CSV table into a rich property record.
 */
export function normalizeProperty(raw = {}, index = 0) {
    const id = raw.id || `prop_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
    const name = String(raw.name || `New Property ${index + 1}`).trim();
    const status = raw.status === 'completed' ? 'completed' : raw.status === 'waiting' ? 'waiting' : 'in_progress';
    const bedrooms = Math.max(0, parseInt(raw.bedrooms, 10) || 1);
    const bathrooms = Math.max(1, parseFloat(raw.bathrooms) || 1);
    const capacity = Math.max(1, parseInt(raw.capacity, 10) || 2);

    const beds = Array.isArray(raw.beds) && raw.beds.length > 0
        ? raw.beds.map((b, i) => ({
            id: b.id || `bed_${i + 1}`,
            type: b.type || 'double',
            size: b.size || '140x200cm',
            count: Math.max(1, parseInt(b.count, 10) || 1)
        }))
        : [{ id: 'bed_1', type: 'double', size: '140x200cm', count: 1 }];

    const checklist = Array.isArray(raw.checklist) && raw.checklist.length > 0
        ? raw.checklist
        : createDefaultChecklist();

    const pipeline = {
        contrato: {
            responsavel: 'Lucas / Ana',
            dados: raw.pipeline?.contrato?.dados || raw.dados || '',
            enviadoAoDono: raw.pipeline?.contrato?.enviadoAoDono || raw.enviadoAoDono || '',
            assinado: raw.pipeline?.contrato?.assinado || raw.assinado || ''
        },
        escritorio: {
            responsavel: 'Front Desk',
            nomeNoQuadro: raw.pipeline?.escritorio?.nomeNoQuadro || raw.nomeNoQuadro || '',
            chaveiros: raw.pipeline?.escritorio?.chaveiros || raw.chaveiros || '',
            quadrosWifi: raw.pipeline?.escritorio?.quadrosWifi || raw.quadrosWifi || ''
        },
        chaves: {
            responsavel: 'Front Desk',
            setsCompletos: raw.pipeline?.chaves?.setsCompletos || raw.setsCompletos || '',
            comandosGaragem: raw.pipeline?.chaves?.comandosGaragem || raw.comandosGaragem || ''
        },
        alojamento: {
            responsavel: 'André / João',
            fotos: raw.pipeline?.alojamento?.fotos || raw.fotos || '',
            videoHospedes: raw.pipeline?.alojamento?.videoHospedes || raw.videoHospedes || '',
            testarEquipamentos: raw.pipeline?.alojamento?.testarEquipamentos || raw.testarEquipamentos || '',
            inventarioAlojamento: raw.pipeline?.alojamento?.inventarioAlojamento || raw.inventarioAlojamento || '',
            kitSeguranca: raw.pipeline?.alojamento?.kitSeguranca || raw.kitSeguranca || '',
            validadeExtintor: raw.pipeline?.alojamento?.validadeExtintor || raw.validadeExtintor || '',
            cofreChaves: raw.pipeline?.alojamento?.cofreChaves || raw.cofreChaves || '',
            armarioRoupa: raw.pipeline?.alojamento?.armarioRoupa || raw.armarioRoupa || ''
        },
        limpeza: {
            responsavel: 'Front Desk / Lucas',
            primeiraLimpeza: raw.pipeline?.limpeza?.primeiraLimpeza || raw.primeiraLimpeza || '',
            videoLimpeza: raw.pipeline?.limpeza?.videoLimpeza || raw.videoLimpeza || '',
            empresaLimpeza: raw.pipeline?.limpeza?.empresaLimpeza || raw.empresaLimpeza || '',
            chavesEntregues: raw.pipeline?.limpeza?.chavesEntregues || raw.chavesEntregues || ''
        },
        notas: raw.pipeline?.notas || raw.notas || ''
    };

    // If pipeline data was provided, sync with checklist
    if (pipeline.contrato.assinado && /sim|feito|ok/i.test(pipeline.contrato.assinado)) {
        markTaskDone(checklist, 'contrato_assinado', true, pipeline.contrato.assinado);
    }
    if (pipeline.escritorio.nomeNoQuadro && /sim|feito|ok/i.test(pipeline.escritorio.nomeNoQuadro)) {
        markTaskDone(checklist, 'escritorio_nome_quadro', true, pipeline.escritorio.nomeNoQuadro);
    }
    if (pipeline.escritorio.chaveiros && /sim|feito|ok/i.test(pipeline.escritorio.chaveiros)) {
        markTaskDone(checklist, 'escritorio_chaveiros', true, pipeline.escritorio.chaveiros);
    }
    if (pipeline.chaves.setsCompletos && /sim|feito|ok/i.test(pipeline.chaves.setsCompletos)) {
        markTaskDone(checklist, 'chaves_sets', true, pipeline.chaves.setsCompletos);
    }
    if (pipeline.alojamento.fotos && /sim|feito|ok/i.test(pipeline.alojamento.fotos)) {
        markTaskDone(checklist, 'aloj_fotos', true, pipeline.alojamento.fotos);
    }
    if (pipeline.alojamento.videoHospedes && /sim|feito|ok/i.test(pipeline.alojamento.videoHospedes)) {
        markTaskDone(checklist, 'aloj_video_hospedes', true, pipeline.alojamento.videoHospedes);
    }
    if (pipeline.alojamento.testarEquipamentos && /sim|feito|ok/i.test(pipeline.alojamento.testarEquipamentos)) {
        markTaskDone(checklist, 'aloj_testar_equipamentos', true, pipeline.alojamento.testarEquipamentos);
    }
    if (pipeline.limpeza.primeiraLimpeza && /sim|feita|feito|ok/i.test(pipeline.limpeza.primeiraLimpeza)) {
        markTaskDone(checklist, 'limpeza_primeira', true, pipeline.limpeza.primeiraLimpeza);
    }
    if (pipeline.limpeza.videoLimpeza && /sim|feito|ok/i.test(pipeline.limpeza.videoLimpeza)) {
        markTaskDone(checklist, 'limpeza_video', true, pipeline.limpeza.videoLimpeza);
    }
    if (pipeline.limpeza.chavesEntregues && /sim|feito|ok/i.test(pipeline.limpeza.chavesEntregues)) {
        markTaskDone(checklist, 'limpeza_chaves_entregues', true, pipeline.limpeza.chavesEntregues);
    }

    return {
        id,
        name,
        status,
        date: raw.date || new Date().toISOString().split('T')[0],
        collaborator: raw.collaborator || 'André / João',
        bedrooms,
        bathrooms,
        capacity,
        beds,
        pipeline,
        checklist,
        inventoryCustom: raw.inventoryCustom || {}, // key -> { verifiedQty, brand, status, comments }
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

function markTaskDone(checklist, taskId, done, notes = '') {
    for (const group of checklist) {
        for (const t of group.tasks) {
            if (t.id === taskId) {
                t.done = done;
                if (notes && !t.notes) t.notes = notes;
                return;
            }
        }
    }
}

/**
 * Pre-populated dataset of the 42 properties from user CSV data
 */
export const INITIAL_NEW_PROPERTIES = Object.freeze([
    // --- EM CURSO / IN PROGRESS (18 properties) ---
    {
        name: 'Merlot Apartment',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        nomeNoQuadro: 'Sim',
        collaborator: 'André / João',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Sunny Stay Atlantic Gardens',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        assinado: 'Sim',
        nomeNoQuadro: 'Sim',
        chaveiros: 'Sim',
        quadrosWifi: 'Em Falta',
        setsCompletos: 'Sim',
        comandosGaragem: '3 (Clientes, Lim. AH, Powa)',
        fotos: 'Sim',
        videoHospedes: 'Sim',
        testarEquipamentos: 'Sim',
        validadeExtintor: 'Sim',
        cofreChaves: 'S - Caixa de Correio',
        armarioRoupa: 'Baixo da Cama',
        primeiraLimpeza: 'Sim',
        videoLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        collaborator: 'André / João',
        bedrooms: 2,
        bathrooms: 2,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Skyline Garden',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Apartamento Palmeira',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        assinado: 'Sim',
        empresaLimpeza: "That's Maid",
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'double', size: '140x200cm', count: 1 }]
    },
    {
        name: 'Star Lodge',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        empresaLimpeza: 'Sr. Luís',
        bedrooms: 3,
        bathrooms: 2,
        capacity: 6,
        beds: [{ type: 'king', size: '180x200cm', count: 1 }, { type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Azure Oasis Madeira',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        nomeNoQuadro: 'Sim',
        fotos: 'Nodal',
        bedrooms: 2,
        bathrooms: 2,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'double', size: '140x200cm', count: 1 }]
    },
    {
        name: 'Sky & Sea(Faial)',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        assinado: 'Falta nós assinarmos',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'double', size: '140x200cm', count: 2 }]
    },
    {
        name: 'Cica Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Cravo Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Estrelícia Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Orquídea Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Proteia Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Rosa Studio',
        status: 'in_progress',
        dados: 'Sim',
        primeiraLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing',
        bedrooms: 1,
        bathrooms: 1,
        capacity: 2,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'White Bougainvillea',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'HUI YUAN Villa',
        status: 'in_progress',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        setsCompletos: 'Sim',
        empresaLimpeza: 'Sparkle & Shine',
        primeiraLimpeza: 'Sim',
        notas: '2 alojamentos',
        bedrooms: 4,
        bathrooms: 3,
        capacity: 8,
        beds: [{ type: 'king', size: '180x200cm', count: 2 }, { type: 'single', size: '90x200cm', count: 4 }]
    },
    {
        name: 'Villa Focus',
        status: 'in_progress',
        dados: 'Sim',
        bedrooms: 3,
        bathrooms: 2,
        capacity: 6,
        beds: [{ type: 'queen', size: '160x200cm', count: 2 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Chez Agostinha',
        status: 'in_progress',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'double', size: '140x200cm', count: 2 }]
    },
    {
        name: 'Villa Luna',
        status: 'in_progress',
        dados: 'Sim',
        bedrooms: 3,
        bathrooms: 2,
        capacity: 6,
        beds: [{ type: 'king', size: '180x200cm', count: 1 }, { type: 'queen', size: '160x200cm', count: 2 }]
    },

    // --- À ESPERA / WAITING (4 properties) ---
    {
        name: 'Quinta da Ribeira Encantada',
        status: 'waiting',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        assinado: 'Sim',
        bedrooms: 3,
        bathrooms: 2,
        capacity: 6,
        beds: [{ type: 'queen', size: '160x200cm', count: 2 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Chalé da Serra',
        status: 'waiting',
        dados: 'Sim',
        enviadoAoDono: 'Sim',
        nomeNoQuadro: 'Sim',
        chaveiros: 'Sim',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'double', size: '140x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Quinta A Lealdade',
        status: 'waiting',
        bedrooms: 4,
        bathrooms: 3,
        capacity: 8,
        beds: [{ type: 'king', size: '180x200cm', count: 2 }, { type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Ocean Breeze Apartments',
        status: 'waiting',
        bedrooms: 2,
        bathrooms: 1,
        capacity: 4,
        beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },

    // --- CONCLUÍDOS / COMPLETED (20 properties) ---
    {
        name: "Lara's Apartment",
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: 'Feito', videoLimpeza: 'Enviado',
        empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Coastal Garden Apartment',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: '26/5 e 27/5', videoLimpeza: 'Enviado',
        empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Pearl of Madeira',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: 'Por acabar', videoLimpeza: 'Enviado',
        empresaLimpeza: 'Seletivo & Cristalino', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 2, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Villa Vista Atântica',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Feita', empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 3, bathrooms: 2, capacity: 6, beds: [{ type: 'king', size: '180x200cm', count: 1 }, { type: 'queen', size: '160x200cm', count: 2 }]
    },
    {
        name: 'Starfish Apartment',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Sim', empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 1, bathrooms: 1, capacity: 2, beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Casa Barranca',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: '26/5', videoLimpeza: 'Enviado',
        empresaLimpeza: 'Sr. Luís', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'double', size: '140x200cm', count: 2 }]
    },
    {
        name: "Bella's Place Apartment",
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Não', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: 'Sim', videoLimpeza: 'Sim',
        empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'The Elements of Savoy',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Nós', empresaLimpeza: 'Powa Washing', chavesEntregues: 'Sim',
        bedrooms: 1, bathrooms: 1, capacity: 2, beds: [{ type: 'king', size: '180x200cm', count: 1 }]
    },
    {
        name: 'Infinity Blue Apartment',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Heliodoro',
        primeiraLimpeza: 'Heliodoro', empresaLimpeza: 'Heliodoro', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 2, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 2 }]
    },
    {
        name: 'Recanto do Sol',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Não', testarEquipamentos: 'Nodal', inventarioAlojamento: 'Não', primeiraLimpeza: 'Feito', videoLimpeza: 'Enviado',
        empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'double', size: '140x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Apartamento Calçada Encantada',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Sim', inventarioAlojamento: 'Sim', primeiraLimpeza: 'Feito', videoLimpeza: 'Sim',
        empresaLimpeza: 'Powa Washing', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Azure Atlantic Horizon',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        fotos: 'Sim', videoHospedes: 'Sim', testarEquipamentos: 'Nodal', inventarioAlojamento: 'Sim', primeiraLimpeza: 'Sim', videoLimpeza: 'Sim',
        empresaLimpeza: "That's Maid",
        bedrooms: 3, bathrooms: 2, capacity: 6, beds: [{ type: 'king', size: '180x200cm', count: 1 }, { type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Casa Saudade',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Heliodoro',
        inventarioAlojamento: 'Sim', kitSeguranca: 'Sim', empresaLimpeza: 'Seletivo & Cristalino',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'double', size: '140x200cm', count: 2 }]
    },
    {
        name: 'Porlamar III',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Sim', setsCompletos: 'Sim',
        testarEquipamentos: 'Sim', primeiraLimpeza: 'Sim',
        bedrooms: 1, bathrooms: 1, capacity: 2, beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'The Belle Vie',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', quadrosWifi: 'Heliodoro',
        primeiraLimpeza: 'Heliodoro', empresaLimpeza: 'Heliodoro', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 2, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 2 }]
    },
    {
        name: 'Bay Secret Apartment',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Finalizada', empresaLimpeza: 'Powa Washing', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'double', size: '140x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    },
    {
        name: 'Aurora Atlantic Apart',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Sim', empresaLimpeza: "That's Maid", chavesEntregues: 'Sim',
        bedrooms: 1, bathrooms: 1, capacity: 2, beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'Casa Emília',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Sim', empresaLimpeza: 'Seletivo & Cristalino', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'double', size: '140x200cm', count: 2 }]
    },
    {
        name: 'Atlantica - Lazareto',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Não é necessário', chaveiros: 'Não é necessário', setsCompletos: 'Código',
        primeiraLimpeza: 'Falta fazer', empresaLimpeza: 'Seletivo & Cristalino', chavesEntregues: 'Sim',
        bedrooms: 1, bathrooms: 1, capacity: 2, beds: [{ type: 'queen', size: '160x200cm', count: 1 }]
    },
    {
        name: 'The Blue Atlantic Apart',
        status: 'completed',
        dados: 'Sim', enviadoAoDono: 'Sim', assinado: 'Sim', nomeNoQuadro: 'Sim', chaveiros: 'Sim', setsCompletos: 'Sim',
        primeiraLimpeza: 'Feita', empresaLimpeza: 'Seletivo & Cristalino', chavesEntregues: 'Sim',
        bedrooms: 2, bathrooms: 1, capacity: 4, beds: [{ type: 'queen', size: '160x200cm', count: 1 }, { type: 'single', size: '90x200cm', count: 2 }]
    }
]);

/**
 * Generates initial properties array ready for storage.
 */
export function getInitialProperties() {
    return INITIAL_NEW_PROPERTIES.map((raw, index) => normalizeProperty(raw, index));
}
