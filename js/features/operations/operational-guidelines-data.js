export const OPERATIONAL_GUIDELINE_RULES = [
    ["team-perspective", "Perspetiva de Equipa", "Use sempre o \"Nós\" (nossa equipa, vamos verificar). Nunca use o \"Eu\".", "Team Perspective", "Always use \"we\" (our team, we will check). Never use \"I\"."],
    ["friendly-opening", "Cordialidade", "Comece sempre com \"Olá [Primeiro Nome]\". Evite apelidos ou formalismos excessivos.", "Warm Opening", "Always start with \"Hello [First Name]\". Avoid surnames or overly formal language."],
    ["evidence-first", "Evidência", "Nunca envie manutenção sem pedir primeiro uma foto ou vídeo ao hóspede.", "Evidence First", "Never send maintenance before first asking the guest for a photo or video."],
    ["self-catering", "Expectativas", "Somos um alojamento self-catering. Fornecemos o essencial, não somos um hotel com reposição diária.", "Expectations", "We are self-catering accommodation. We provide the essentials, not daily hotel-style replenishment."]
].map(([id, title, text]) => ({ id, title, text }));

const RULE_TRANSLATIONS_EN = {
    "team-perspective": { title: "Team Perspective", text: "Always use \"we\" (our team, we will check). Never use \"I\"." },
    "friendly-opening": { title: "Warm Opening", text: "Always start with \"Hello [First Name]\". Avoid surnames or overly formal language." },
    "evidence-first": { title: "Evidence First", text: "Never send maintenance before first asking the guest for a photo or video." },
    "self-catering": { title: "Expectations", text: "We are self-catering accommodation. We provide the essentials, not daily hotel-style replenishment." }
};

export const OPERATIONAL_GUIDELINE_CONTACTS = [
    { id: "general-support", label: "Reservas e Apoio Geral", value: "+351 961 640 949" },
    { id: "day-emergency", label: "Urgências (09:00 - 18:00)", value: "+351 961 640 949" },
    { id: "evening-emergency", label: "Urgências (18:00 - 23:00)", value: "+351 926 614 444" }
];

const CONTACT_TRANSLATIONS_EN = {
    "general-support": "Reservations and General Support",
    "day-emergency": "Emergencies (09:00 - 18:00)",
    "evening-emergency": "Emergencies (18:00 - 23:00)"
};

const SECTION_ROWS = [
    ["emergency", "Protocolos de Emergência e Contactos", "Contactos principais e regra de chamada para urgências.", "Emergency Protocols and Contacts", "Main contacts and the calling rule for emergencies."],
    ["technical", "Resolução de Problemas Técnicos", "Primeira resposta para internet, energia, eletrodomésticos e equipamentos.", "Technical Troubleshooting", "First response for internet, power, appliances, and equipment."],
    ["logistics-consumables", "Logística e Consumíveis (Self-Catering)", "Reposições, roupa extra, lixo, sofá-cama e berço.", "Logistics and Consumables (Self-Catering)", "Replenishment, extra linen, trash, sofa beds, and cribs."],
    ["house-rules", "Regras da Casa e Conflitos", "Barulho, limpeza, insetos, chaves, animais, fumo e ameaças de review.", "House Rules and Conflicts", "Noise, cleaning, insects, keys, pets, smoking, and review threats."],
    ["timing-logistics", "Gestão de Prazos e Logística", "Late check-out, estacionamento, objetos esquecidos, encomendas e clima.", "Timing and Logistics", "Late check-out, parking, forgotten items, parcels, and weather."],
    ["maintenance-extras", "Manutenção e Serviços Extra", "Piscina, gás, jardineiro/piscineiro, internet profissional, danos e parceiros.", "Maintenance and Extra Services", "Pool, gas, garden/pool visits, professional internet needs, damage, and partners."]
];

const ITEM_ROWS = [
    ["emergency", "emergency-call", "I", "Urgência durante a estadia", "Peça sempre ao hóspede para ligar em vez de enviar mensagem.", "Olá [Nome]. Para conseguirmos ajudar mais rapidamente nesta situação, por favor ligue para a nossa equipa pelo contacto de urgência.", "urgência, emergência, ligar, contacto, telefone, ajuda, apoio", "Emergency during the stay", "Always ask the guest to call instead of sending a message.", "Hello [Name]. So we can help faster in this situation, please call our team using the emergency contact number.", "urgent, emergency, call, contact, phone, help, support"],
    ["technical", "wifi-slow", 1, "Wi-Fi lento ou sem sinal", "Pedir para reiniciar o router e verificar cabos.", "Olá [Nome]. Lamentamos a falha. Por favor, confirme se os cabos estão bem encaixados no router e desligue o aparelho da tomada por 10 segundos. Se não estabilizar, avise-nos.", "wifi, wi-fi, internet, router, sinal, lento, sem internet, cabos, nómada digital", "Slow Wi-Fi or no signal", "Ask the guest to restart the router and check the cables.", "Hello [Name]. We are sorry for the issue. Please check that the router cables are properly connected and unplug the device from the power socket for 10 seconds. If it does not stabilize, please let us know.", "wifi, wi-fi, internet, router, signal, slow, no internet, cables, digital nomad"],
    ["technical", "induction-locked", 2, "Placa de indução / fogão não liga", "Verificar bloqueio de crianças (cadeado).", "Olá [Nome]. Verifique se tem o símbolo de um cadeado iluminado e pressione esse botão por 3 segundos para desbloquear. Se persistir, envie-nos um vídeo do painel.", "placa, indução, fogão, cozinha, cadeado, bloqueado, crianças, não liga", "Induction hob / stove will not turn on", "Check the child lock symbol.", "Hello [Name]. Please check whether a lock symbol is lit and press that button for 3 seconds to unlock it. If the issue continues, please send us a video of the panel.", "hob, induction, stove, kitchen, lock, locked, child lock, will not turn on"],
    ["technical", "hot-water", 3, "Falta de água quente", "Verificar quadro elétrico e uso excessivo do termoacumulador.", "Olá [Nome]. Verifique se algum interruptor no quadro elétrico disparou. Sendo um termoacumulador, se tomaram vários banhos seguidos, pode demorar algum tempo a aquecer novamente.", "água quente, banho, fria, termoacumulador, quadro elétrico, disjuntor", "No hot water", "Check the electrical panel and possible heavy use of the water heater.", "Hello [Name]. Please check whether any switch in the electrical panel has tripped. As this is a water heater, if several showers were taken in a row, it may need some time to heat again.", "hot water, shower, cold, water heater, electrical panel, breaker"],
    ["technical", "appliance-fault", 4, "Eletrodoméstico avariado ou curto-circuito", "Pedir para desligar e não prometer prazos.", "Olá [Nome]. Por segurança, desligue o aparelho da tomada. Já reportámos à nossa equipa, que organizará a reparação ou substituição o mais brevemente possível.", "eletrodoméstico, avariado, curto, curto-circuito, tomada, reparação, substituição", "Broken appliance or short circuit", "Ask the guest to unplug it and do not promise exact repair times.", "Hello [Name]. For safety, please unplug the appliance from the power socket. We have already reported this to our team, who will organize repair or replacement as soon as possible.", "appliance, broken, fault, short circuit, socket, repair, replacement"],
    ["technical", "air-conditioning", 5, "Ar condicionado em modo errado ou com erro", "Verificar portas fechadas e modo Frio (floco de neve).", "Olá [Nome]. Garanta que portas e janelas estão fechadas. Verifique se o comando está no modo 'Frio' (floco de neve). Se vir o erro C4 63, desligue o disjuntor por 10 minutos.", "ar condicionado, ac, frio, calor, comando, floco de neve, C4 63, disjuntor", "Air conditioning mode issue or error", "Check that doors/windows are closed and that cooling mode is selected.", "Hello [Name]. Please make sure doors and windows are closed. Check that the remote is set to 'Cool' mode (snowflake symbol). If you see error C4 63, turn off the circuit breaker for 10 minutes.", "air conditioning, ac, cool, heat, remote, snowflake, C4 63, breaker"],
    ["technical", "tv-no-signal", 6, "TV sem sinal", "Verificar Source/Input e cabos HDMI.", "Olá [Nome]. Use o comando da TV e carregue no botão 'Source' ou 'Input'. Selecione HDMI 1 ou 2. Verifique se a box tem a luz acesa.", "tv, televisão, sem sinal, source, input, hdmi, box, comando", "TV has no signal", "Check Source/Input and HDMI cables.", "Hello [Name]. Please use the TV remote and press 'Source' or 'Input'. Select HDMI 1 or 2. Also check whether the TV box light is on.", "tv, television, no signal, source, input, hdmi, box, remote"],
    ["technical", "washing-machine-door", 7, "Máquina de lavar roupa não abre", "Aguardar 3 a 5 minutos após o ciclo.", "Olá [Nome]. A porta pode demorar entre 3 a 5 minutos a ouvir o 'clique' de desbloqueio após o fim do ciclo. Por favor, não force o puxador.", "máquina de lavar, roupa, porta, não abre, ciclo, clique, puxador", "Washing machine door will not open", "Wait 3 to 5 minutes after the cycle ends.", "Hello [Name]. The door can take 3 to 5 minutes after the cycle ends before you hear the unlocking click. Please do not force the handle.", "washing machine, laundry, door, will not open, cycle, click, handle"],
    ["technical", "power-outage", 8, "Falha de energia geral", "Confirmar se é da rede pública (EEM).", "Olá [Nome]. Trata-se de um corte de energia geral que está a afetar a zona. A equipa municipal já está a trabalhar na reparação. Agradecemos a paciência.", "energia, luz, apagão, eletricidade, EEM, corte, zona, sem luz", "General power outage", "Confirm whether it is a public grid outage.", "Hello [Name]. This is a general power outage affecting the area. The municipal team is already working on the repair. Thank you for your patience.", "power, electricity, outage, blackout, EEM, cut, area, no power"],
    ["logistics-consumables", "extra-consumables", 9, "Papel higiénico ou detergentes extra", "Relembrar regime self-catering.", "Olá [Nome]. Fornecemos um kit de boas-vindas para os primeiros dias. Bens de reposição devem ser adquiridos pelos hóspedes nos supermercados próximos.", "papel higiénico, detergente, extra, consumíveis, reposição, self-catering, supermercado", "Extra toilet paper or detergents", "Remind the guest that the stay is self-catering.", "Hello [Name]. We provide a welcome kit for the first days. Replenishment items should be purchased by guests at nearby supermarkets.", "toilet paper, detergent, extra, consumables, replenishment, self-catering, supermarket"],
    ["logistics-consumables", "extra-linen", 10, "Toalhas ou lençóis extra", "Informar taxa extra.", "Olá [Nome]. Caso deseje mudas extra, podemos organizar o serviço mediante uma taxa de lavandaria de [X€]. Confirme se deseja avançar.", "toalhas, lençóis, roupa, extra, lavandaria, taxa, mudas", "Extra towels or bed linen", "Inform the guest about the extra laundry fee.", "Hello [Name]. If you would like extra sets, we can organize the service for a laundry fee of [X€]. Please confirm if you would like to proceed.", "towels, linen, sheets, extra, laundry, fee, sets"],
    ["logistics-consumables", "trash-management", 11, "Gestão de lixo", "Indicar contentores na rua.", "Olá [Nome]. Para evitar odores e insetos, por favor deposite o lixo nos contentores públicos localizados na rua, mesmo ao lado do edifício.", "lixo, contentores, resíduos, odor, cheiro, insetos, rua", "Trash management", "Direct the guest to the street bins.", "Hello [Name]. To avoid odors and insects, please place the trash in the public bins located on the street, right beside the building.", "trash, garbage, bins, waste, odor, smell, insects, street"]
];

ITEM_ROWS.push(
    ["logistics-consumables", "sofa-bed", 12, "Sofá-cama não está feito", "Indicar localização da roupa.", "Olá [Nome]. A roupa de cama para o sofá encontra-se arrumada dentro do próprio sofá (ou no roupeiro). Deixamo-lo fechado para terem mais espaço durante o dia.", "sofá-cama, sofá, cama, roupa de cama, roupeiro, não está feito", "Sofa bed is not made", "Explain where the bedding is stored.", "Hello [Name]. The bedding for the sofa is stored inside the sofa itself (or in the wardrobe). We leave it closed so you have more space during the day.", "sofa bed, sofa, bed, bedding, wardrobe, not made"],
    ["logistics-consumables", "crib-safety", 13, "Berço e segurança", "Explicar normas pediátricas sem almofadas.", "Olá [Nome]. Por segurança pediátrica, os berços têm apenas um colchão firme e lençol. Não fornecemos almofadas ou edredões pesados para bebés.", "berço, bebé, almofada, edredão, criança, segurança, colchão", "Crib safety", "Explain pediatric safety rules and why pillows are not provided.", "Hello [Name]. For pediatric safety, cribs only include a firm mattress and sheet. We do not provide pillows or heavy duvets for babies.", "crib, baby, pillow, duvet, child, safety, mattress"],
    ["house-rules", "external-noise", 14, "Barulho exterior, obras ou vizinhos", "Responder com empatia sem assumir responsabilidade.", "Olá [Nome]. Lamentamos o ruído. Infelizmente, obras públicas ou ruídos do bairro ultrapassam o nosso controlo. Aconselhamos manter as janelas fechadas.", "barulho, ruído, obras, vizinhos, bairro, janelas, exterior", "External noise, construction, or neighbors", "Respond with empathy without accepting responsibility.", "Hello [Name]. We are sorry about the noise. Unfortunately, public works or neighborhood noise are outside our control. We recommend keeping the windows closed.", "noise, construction, works, neighbors, area, windows, outside"],
    ["house-rules", "cleaning-complaint", 15, "Queixa de limpeza no check-in", "Pedir fotos e enviar limpeza imediatamente.", "Olá [Nome]. Pedimos desculpa. Já enviámos as fotos à equipa. Podemos enviar alguém imediatamente para repassar a limpeza. Qual o melhor horário?", "limpeza, sujo, check-in, fotos, equipa, repassar, horário", "Cleaning complaint at check-in", "Ask for photos and send cleaning support immediately.", "Hello [Name]. We apologize. We have already sent the photos to the team. We can send someone immediately to review the cleaning. What time works best?", "cleaning, dirty, check-in, photos, team, reclean, time"],
    ["house-rules", "insects-nature", 16, "Insetos ou natureza na Madeira", "Normalizar lagartixas/formigas e enviar tratamento.", "Olá [Nome]. Devido ao clima tropical da ilha, o aparecimento de formigas ou lagartixas é comum e inofensivo. Enviaremos a equipa para aplicar tratamento.", "insetos, formigas, lagartixas, baratas, natureza, clima, tratamento", "Insects or nature in Madeira", "Normalize ants/geckos and send treatment.", "Hello [Name]. Due to the island's tropical climate, ants or geckos can appear and are common and harmless. We will send the team to apply treatment.", "insects, ants, geckos, cockroaches, nature, climate, treatment"],
    ["house-rules", "lost-keys", 17, "Perda de chaves", "Informar taxa de substituição de fechadura.", "Olá [Nome]. A perda de chaves implica a substituição da fechadura por segurança. Este serviço tem uma taxa de [X€]. Enviaremos alguém para vos dar acesso.", "chaves, perdeu, perdidas, fechadura, taxa, acesso", "Lost keys", "Inform the guest about the lock replacement fee.", "Hello [Name]. Losing keys requires replacing the lock for security reasons. This service has a fee of [X€]. We will send someone to give you access.", "keys, lost, lock, replacement, fee, access"],
    ["house-rules", "locked-out", 18, "Trancados de fora com chave por dentro", "Chamar serralheiro com custo suportado pelo hóspede.", "Olá [Nome]. Como a chave ficou por dentro, a nossa mestra não abre. Chamaremos um serralheiro especializado (custo suportado pelo hóspede).", "trancado, fora, chave por dentro, serralheiro, mestra, custo", "Locked out with the key inside", "Call a locksmith at the guest's cost.", "Hello [Name]. Since the key was left inside, our master key cannot open the door. We will call a specialized locksmith (cost supported by the guest).", "locked out, outside, key inside, locksmith, master key, cost"],
    ["house-rules", "undeclared-pet", 19, "Animal de estimação não declarado", "Confrontar e aplicar taxa de limpeza profunda.", "Olá [Nome]. Detetámos a presença de um animal. Como descrito nas regras, não são permitidos. Será aplicada uma taxa de limpeza profunda de [X€].", "animal, cão, gato, estimação, pet, não declarado, limpeza profunda", "Undeclared pet", "Address the issue and apply the deep-cleaning fee.", "Hello [Name]. We detected the presence of an animal. As described in the rules, pets are not allowed. A deep-cleaning fee of [X€] will be applied.", "animal, dog, cat, pet, undeclared, deep cleaning"],
    ["house-rules", "smoking-inside", 20, "Fumo no interior", "Avisar sobre taxa de purificação de ozono.", "Olá [Nome]. Notámos odor a tabaco. Relembramos que é proibido fumar no interior. Fumar acarreta uma taxa de purificação de [X€].", "fumo, fumar, tabaco, odor, interior, ozono, purificação", "Smoking inside", "Warn about the ozone purification fee.", "Hello [Name]. We noticed a tobacco smell. Please remember that smoking inside is prohibited. Smoking carries a purification fee of [X€].", "smoke, smoking, tobacco, smell, inside, ozone, purification"],
    ["house-rules", "review-extortion", 21, "Extorsão ou ameaça de má review", "Não ceder e reportar à plataforma.", "Olá [Nome]. Não permitimos a emissão de reembolsos sob ameaça de avaliações negativas. Resolveremos qualquer problema técnico, mas não cederemos a extorsão.", "review, avaliação, ameaça, reembolso, extorsão, plataforma", "Extortion or threat of a bad review", "Do not give in and report it to the platform.", "Hello [Name]. We do not issue refunds under threat of negative reviews. We will resolve any technical problem, but we will not give in to extortion.", "review, rating, threat, refund, extortion, platform"]
);

ITEM_ROWS.push(
    ["timing-logistics", "late-checkout", 22, "Late check-out de última hora", "Declinar se houver turnover no próprio dia.", "Olá [Nome]. Infelizmente temos novos hóspedes hoje. A equipa de limpeza precisa de iniciar o trabalho às 10:00. Agradecemos a vossa cooperação.", "late check-out, checkout tarde, sair mais tarde, turnover, limpeza, 10:00", "Last-minute late check-out", "Decline if there is same-day turnover.", "Hello [Name]. Unfortunately, we have new guests arriving today. The cleaning team needs to start work at 10:00. Thank you for your cooperation.", "late check-out, late checkout, leave later, turnover, cleaning, 10:00"],
    ["timing-logistics", "bags-in-garage", 23, "Malas no carro ou garagem antes da hora", "Declinar para dar espaço à limpeza.", "Olá [Nome]. A equipa de limpeza precisa do estacionamento para as carrinhas de material. Recomendamos o parque público próximo até às 16:00.", "malas, bagagem, carro, garagem, antes da hora, estacionamento, 16:00", "Bags in the car or garage before check-in time", "Decline so the cleaning team has space to work.", "Hello [Name]. The cleaning team needs the parking space for supply vans. We recommend using the nearby public car park until 16:00.", "bags, luggage, car, garage, before time, parking, 16:00"],
    ["timing-logistics", "parking-occupied", 24, "Lugar de estacionamento ocupado", "Pedir matrícula e contactar condomínio.", "Olá [Nome]. Lamentamos. Por favor, estacione temporariamente no exterior e envie-nos a matrícula do carro intruso para falarmos com o condomínio.", "estacionamento, nosso estacionamento, lugar, lugar ocupado, garagem, matrícula, condomínio, carro intruso", "Parking space occupied", "Ask for the license plate and contact the condominium.", "Hello [Name]. We are sorry. Please park temporarily outside and send us the license plate of the unauthorized car so we can speak with the condominium.", "parking, our parking, space, occupied, garage, license plate, condominium, unauthorized car"],
    ["timing-logistics", "lost-found", 25, "Lost & Found ou objetos esquecidos", "Cobrar custos de envio antecipadamente.", "Olá [Nome]. Procuraremos o objeto. Caso seja encontrado, os custos de embalagem e envio internacional devem ser pagos antecipadamente.", "lost found, objeto esquecido, perdido, envio, embalagem, internacional", "Lost & Found or forgotten items", "Charge shipping costs in advance.", "Hello [Name]. We will look for the item. If it is found, packaging and international shipping costs must be paid in advance.", "lost found, forgotten item, lost, shipping, packaging, international"],
    ["timing-logistics", "package-delivery", 26, "Receção de encomendas", "Desaconselhar vivamente.", "Olá [Nome]. Não recomendamos o envio de encomendas. Não temos receção e não garantimos a recolha após o check-out.", "encomenda, amazon, receção, entrega, correio, check-out", "Receiving parcels", "Strongly advise against parcel deliveries.", "Hello [Name]. We do not recommend sending parcels. We do not have reception and cannot guarantee collection after check-out.", "parcel, package, amazon, reception, delivery, mail, check-out"],
    ["timing-logistics", "weather-refund", 27, "Clima ou reembolso por chuva", "Sugerir microclimas e webcams.", "Olá [Nome]. Não fazemos reembolsos pelo clima. A Madeira tem microclimas: pode estar sol no Sul! Verifique as webcams locais para encontrar o sol.", "chuva, clima, tempo, reembolso, microclimas, webcams, sol", "Weather or refund request due to rain", "Suggest microclimates and webcams.", "Hello [Name]. We do not offer refunds due to weather. Madeira has microclimates: it may be sunny in the south! Please check local webcams to find the sun.", "rain, weather, refund, microclimates, webcams, sun"],
    ["maintenance-extras", "pool-heating", 28, "Piscina fria ou pedido de aquecimento", "Verificar preço e pedir pré-aviso.", "Olá [Nome]. O preço varia por propriedade. Precisamos de alguns dias de aviso para a água atingir a temperatura ideal. Verificaremos o custo para si.", "piscina, fria, aquecimento, temperatura, preço, pré-aviso", "Cold pool or pool-heating request", "Check the price and ask for advance notice.", "Hello [Name]. The price varies by property. We need a few days' notice for the water to reach the ideal temperature. We will check the cost for you.", "pool, cold, heating, temperature, price, advance notice"],
    ["maintenance-extras", "gas-bottle", 29, "Botija de gás vazia", "Indicar botija de reserva e redutor.", "Olá [Nome]. Verifique se há uma garrafa de reserva ao lado. Se sim, basta trocar o redutor. Se não se sentir confortável, enviaremos ajuda.", "gás, botija, garrafa, vazia, redutor, reserva", "Empty gas bottle", "Point out the spare bottle and regulator.", "Hello [Name]. Please check whether there is a spare bottle beside it. If so, simply change the regulator. If you are not comfortable doing this, we will send help.", "gas, bottle, empty, regulator, spare"],
    ["maintenance-extras", "surprise-maintenance", 30, "Visita surpresa de piscina ou jardim", "Explicar obrigatoriedade legal e discrição.", "Olá [Nome]. Lamentamos o susto. Estas manutenções químicas são obrigatórias por lei para a vossa segurança. O técnico será rápido e discreto.", "visita, surpresa, piscina, jardim, técnico, manutenção, lei", "Unexpected pool or garden visit", "Explain the legal requirement and discretion.", "Hello [Name]. We are sorry for the surprise. These chemical maintenance visits are legally required for your safety. The technician will be quick and discreet.", "visit, surprise, pool, garden, technician, maintenance, law"],
    ["maintenance-extras", "digital-nomad-internet", 31, "Internet para nómadas digitais", "Pedir Speed Test oficial.", "Olá [Nome]. Temos fibra de alta velocidade. Para despistar o problema com a operadora, envie-nos um print de speedtest.net, por favor.", "internet, nómada, digital, fibra, speedtest, operadora, velocidade", "Internet for digital nomads", "Ask for an official Speedtest result.", "Hello [Name]. We have high-speed fiber internet. To investigate the issue with the provider, please send us a screenshot from speedtest.net.", "internet, digital nomad, fiber, speedtest, provider, speed"],
    ["maintenance-extras", "accidental-damage", 32, "Dano acidental", "Desescalar e não cobrar pequenos itens.", "Olá [Nome]. Muito obrigado pela honestidade! Acidentes acontecem. Não se preocupe, não cobraremos este item. Aproveite as férias!", "dano, partiu, acidente, honestidade, cobrar, item", "Accidental damage", "De-escalate and do not charge for small items.", "Hello [Name]. Thank you very much for your honesty! Accidents happen. Do not worry, we will not charge for this item. Enjoy your holiday!", "damage, broken, accident, honesty, charge, item"],
    ["maintenance-extras", "car-rental-transfer", 33, "Aluguer de carro ou transfer", "Reencaminhar para parceiros.", "Olá [Nome]. Não temos recolha gratuita. Podemos partilhar os vossos contactos com os nossos parceiros de rent-a-car/transfer para receberem orçamentos.", "carro, aluguer, rent-a-car, transfer, aeroporto, parceiros, orçamentos", "Car rental or transfer", "Redirect to partners.", "Hello [Name]. We do not offer free pick-up. We can share your contact details with our rent-a-car/transfer partners so they can send you quotes.", "car, rental, rent-a-car, transfer, airport, partners, quotes"]
);

export const OPERATIONAL_GUIDELINE_SUGGESTIONS = [
    "O hóspede diz que o Wi-Fi está lento",
    "A placa mostra um cadeado",
    "Querem sair depois das 10:00",
    "O lugar de estacionamento está ocupado",
    "Encontraram formigas no apartamento",
    "Pedem mais toalhas e papel higiénico"
];

const SUGGESTIONS_EN = [
    "The guest says the Wi-Fi is slow",
    "The hob shows a lock symbol",
    "They want to leave after 10:00",
    "The parking space is occupied",
    "They found ants in the apartment",
    "They ask for more towels and toilet paper"
];

const splitKeywords = (value) => value.split(",").map((keyword) => keyword.trim()).filter(Boolean);

function itemFromRow(row, language = "pt") {
    const isEnglish = language === "en";
    return {
        sectionId: row[0],
        id: row[1],
        number: row[2],
        title: isEnglish ? row[7] : row[3],
        action: isEnglish ? row[8] : row[4],
        response: isEnglish ? row[9] : row[5],
        keywords: splitKeywords(isEnglish ? row[10] : row[6])
    };
}

function buildSections(language = "pt") {
    const isEnglish = language === "en";
    return SECTION_ROWS.map((row) => {
        const sectionId = row[0];
        return {
            id: sectionId,
            title: isEnglish ? row[3] : row[1],
            summary: isEnglish ? row[4] : row[2],
            items: ITEM_ROWS
                .filter((itemRow) => itemRow[0] === sectionId)
                .map((itemRow) => itemFromRow(itemRow, language))
        };
    });
}

export const OPERATIONAL_GUIDELINE_SECTIONS = buildSections("pt");

export function getLocalizedOperationalGuidelineRules(language = "pt") {
    if (language !== "en") {
        return OPERATIONAL_GUIDELINE_RULES;
    }

    return OPERATIONAL_GUIDELINE_RULES.map((rule) => ({
        ...rule,
        ...(RULE_TRANSLATIONS_EN[rule.id] || {})
    }));
}

export function getLocalizedOperationalGuidelineContacts(language = "pt") {
    if (language !== "en") {
        return OPERATIONAL_GUIDELINE_CONTACTS;
    }

    return OPERATIONAL_GUIDELINE_CONTACTS.map((contact) => ({
        ...contact,
        label: CONTACT_TRANSLATIONS_EN[contact.id] || contact.label
    }));
}

export function getLocalizedOperationalGuidelineSuggestions(language = "pt") {
    return language === "en" ? SUGGESTIONS_EN : OPERATIONAL_GUIDELINE_SUGGESTIONS;
}

export function localizeOperationalGuidelineSections(sections = OPERATIONAL_GUIDELINE_SECTIONS, language = "pt") {
    if (language !== "en") {
        return sections;
    }

    const englishSections = buildSections("en");
    const sectionsById = new Map(englishSections.map((section) => [section.id, section]));
    const itemsById = new Map(englishSections.flatMap((section) => {
        return section.items.map((item) => [item.id, item]);
    }));

    return sections.map((section) => {
        const translatedSection = sectionsById.get(section.id);
        return {
            ...section,
            title: translatedSection?.title || section.title,
            summary: translatedSection?.summary || section.summary,
            items: section.items.map((item) => {
                if (item.isCustom || item.isEdited) {
                    return item;
                }

                return {
                    ...item,
                    ...(itemsById.get(item.id) || {})
                };
            })
        };
    });
}
