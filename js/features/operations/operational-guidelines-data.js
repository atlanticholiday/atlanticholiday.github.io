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
    ["technical", "wifi-slow", 1, "Wi-Fi lento ou sem sinal", "Enviar passos de reinício, cabos e teste de ligação.", "Olá [Nome]. Lamentamos a falha no Wi-Fi. Para tentarmos resolver rapidamente, pedimos por favor que faça estes passos:\n\n1. Confirme se o router está ligado à corrente e se os cabos estão bem encaixados, especialmente o cabo de energia e o cabo de internet.\n2. Desligue o router da tomada, aguarde 30 segundos e volte a ligar.\n3. Aguarde 3 a 5 minutos para o router reiniciar completamente. Durante este tempo, as luzes podem piscar ou apagar temporariamente.\n4. Depois, tente ligar novamente ao Wi-Fi, garantindo que está a usar a rede e a palavra-passe indicadas nas instruções do apartamento.\n5. Se estiver ligado mas lento, aproxime-se do router e teste novamente. Paredes grossas ou muitos equipamentos ligados podem reduzir o sinal.\n\nSe continuar sem funcionar, envie-nos por favor uma fotografia do router com as luzes visíveis e, se possível, uma captura de ecrã do erro que aparece no telemóvel/computador. Assim conseguimos perceber se é falta de sinal, palavra-passe, cabo ou falha da operadora.", "wifi, wi-fi, internet, router, sinal, lento, sem internet, cabos, nómada digital", "Slow Wi-Fi or no signal", "Send restart, cable, and connection test steps.", "Hello [Name]. We are sorry about the Wi-Fi issue. To try to fix it quickly, could you please follow these steps:\n\n1. Check that the router is connected to power and that the cables are firmly plugged in, especially the power cable and internet cable.\n2. Unplug the router from the power socket, wait 30 seconds, and plug it back in.\n3. Wait 3 to 5 minutes for the router to restart fully. During this time, the lights may flash or turn off temporarily.\n4. Then try connecting to the Wi-Fi again, making sure you are using the network name and password shown in the apartment instructions.\n5. If it connects but is slow, please move closer to the router and test again. Thick walls or many connected devices can reduce the signal.\n\nIf it still does not work, please send us a photo of the router with the lights visible and, if possible, a screenshot of the error shown on your phone/computer. This helps us understand whether it is a signal, password, cable, or provider issue.", "wifi, wi-fi, internet, router, signal, slow, no internet, cables, digital nomad"],
    ["technical", "induction-locked", 2, "Placa de indução / fogão não liga", "Enviar passos para desbloquear, confirmar panela e reiniciar a placa.", "Olá [Nome]. Vamos tentar desbloquear a placa/fogão. Por favor, siga estes passos:\n\n1. Verifique se existe um símbolo de cadeado iluminado no painel. Se existir, mantenha pressionado o botão do cadeado durante 3 a 5 segundos até desaparecer.\n2. Se não encontrar o botão do cadeado, tente manter pressionado o botão de ligar/desligar durante alguns segundos.\n3. Confirme que está a usar uma panela/frigideira compatível com indução. Algumas placas não aquecem se a panela não for adequada ou se estiver muito pequena para a zona escolhida.\n4. Coloque a panela no centro da zona de aquecimento antes de selecionar a potência.\n5. Se o painel não responder, desligue a placa no quadro elétrico durante 1 minuto e volte a ligar, apenas se o conseguir fazer em segurança.\n\nSe continuar bloqueada ou aparecer um erro, envie-nos por favor um vídeo curto do painel enquanto tenta ligar. Assim conseguimos identificar o símbolo/erro e orientar melhor.", "placa, indução, fogão, cozinha, cadeado, bloqueado, crianças, não liga", "Induction hob / stove will not turn on", "Send unlock, pan check, and hob reset steps.", "Hello [Name]. Let us try to unlock the hob/stove. Please follow these steps:\n\n1. Check whether there is a lock symbol lit on the control panel. If there is, press and hold the lock button for 3 to 5 seconds until it disappears.\n2. If you cannot find the lock button, try pressing and holding the on/off button for a few seconds.\n3. Please confirm that you are using an induction-compatible pan. Some hobs will not heat if the pan is not suitable or is too small for the selected cooking zone.\n4. Place the pan in the center of the cooking zone before selecting the power level.\n5. If the panel does not respond, turn the hob off at the electrical panel for 1 minute and then turn it back on, only if you can do this safely.\n\nIf it is still locked or an error appears, please send us a short video of the panel while you try to turn it on. This helps us identify the symbol/error and guide you better.", "hob, induction, stove, kitchen, lock, locked, child lock, will not turn on"],
    ["technical", "hot-water", 3, "Falta de água quente", "Enviar passos para quadro elétrico, termoacumulador e tempo de recuperação.", "Olá [Nome]. Lamentamos a situação com a água quente. Por favor, tente estes passos:\n\n1. Confirme se a água fria funciona normalmente nas torneiras. Isto ajuda a perceber se o problema é geral ou apenas da água quente.\n2. Verifique no quadro elétrico se algum disjuntor/interruptor está desligado ou em posição diferente dos restantes. Se estiver, volte a ligar apenas se o conseguir fazer em segurança.\n3. Se a casa tiver termoacumulador, pode acontecer a água quente esgotar após vários banhos seguidos. Nesse caso, normalmente é necessário aguardar 30 a 60 minutos para aquecer novamente.\n4. Teste a água quente em mais do que uma torneira, por exemplo cozinha e casa de banho.\n5. Certifique-se de que a torneira está totalmente virada para o lado quente e deixe correr durante 1 a 2 minutos.\n\nSe continuar sem água quente depois destes passos, envie-nos por favor uma fotografia do quadro elétrico e diga-nos se a água sai fria em todas as torneiras ou apenas numa divisão. Assim conseguimos acionar a solução correta mais rapidamente.", "água quente, banho, fria, termoacumulador, quadro elétrico, disjuntor", "No hot water", "Send electrical panel, water heater, and recovery-time steps.", "Hello [Name]. We are sorry about the hot water issue. Please try these steps:\n\n1. Confirm whether cold water is working normally from the taps. This helps us understand whether the issue is general or only with hot water.\n2. Check the electrical panel to see whether any breaker/switch is off or in a different position from the others. If so, turn it back on only if you can do this safely.\n3. If the property has a water heater, the hot water may run out after several showers in a row. In that case, it usually needs 30 to 60 minutes to heat again.\n4. Test hot water from more than one tap, for example kitchen and bathroom.\n5. Make sure the tap is fully turned to the hot side and let it run for 1 to 2 minutes.\n\nIf there is still no hot water after these steps, please send us a photo of the electrical panel and tell us whether the water is cold from all taps or only in one room. This helps us arrange the correct solution faster.", "hot water, shower, cold, water heater, electrical panel, breaker"],
    ["technical", "appliance-fault", 4, "Eletrodoméstico avariado ou curto-circuito", "Enviar passos de segurança, isolamento do aparelho e recolha de evidência.", "Olá [Nome]. Por segurança, pedimos por favor que não continue a usar esse aparelho até confirmarmos a situação.\n\n1. Desligue o aparelho no botão, se for possível fazê-lo em segurança.\n2. Retire a ficha da tomada. Se houver cheiro a queimado, faíscas, fumo ou água perto da tomada, não toque no aparelho e afaste-se.\n3. Se o aparelho fez disparar a eletricidade, deixe-o desligado e não volte a ligá-lo.\n4. Verifique se outros equipamentos na mesma divisão continuam a funcionar. Isto ajuda a perceber se o problema é do aparelho ou da tomada/circuito.\n5. Envie-nos por favor uma fotografia do aparelho, da tomada e, se aparecer algum código ou luz de erro, uma fotografia/vídeo desse detalhe.\n\nA nossa equipa vai analisar e organizar a reparação ou substituição o mais rapidamente possível. Enquanto isso, por favor mantenha o aparelho desligado.", "eletrodoméstico, avariado, curto, curto-circuito, tomada, reparação, substituição", "Broken appliance or short circuit", "Send safety, appliance isolation, and evidence collection steps.", "Hello [Name]. For safety, please do not continue using this appliance until we confirm the situation.\n\n1. Turn the appliance off using its button, if it is safe to do so.\n2. Unplug it from the power socket. If there is a burning smell, sparks, smoke, or water near the socket, please do not touch the appliance and move away from it.\n3. If the appliance caused the electricity to trip, please keep it unplugged and do not plug it in again.\n4. Check whether other equipment in the same room is still working. This helps us understand whether the issue is with the appliance or the socket/circuit.\n5. Please send us a photo of the appliance, the socket, and, if any code or error light appears, a photo/video of that detail.\n\nOur team will review this and organize repair or replacement as quickly as possible. In the meantime, please keep the appliance unplugged.", "appliance, broken, fault, short circuit, socket, repair, replacement"],
    ["technical", "air-conditioning", 5, "Ar condicionado em modo errado ou com erro", "Enviar passos para modo, comando, portas/janelas, filtros e reset seguro.", "Olá [Nome]. Vamos tentar resolver o ar condicionado. Por favor, siga estes passos:\n\n1. Feche portas e janelas para o equipamento conseguir arrefecer/aquecer corretamente.\n2. No comando, confirme o modo selecionado: para frio deve estar no símbolo de floco de neve ou 'Cool'; para quente deve estar no símbolo de sol ou 'Heat'.\n3. Defina a temperatura alguns graus abaixo da temperatura ambiente se quer arrefecer, ou acima se quer aquecer.\n4. Confirme se o comando tem pilhas e se aparece informação no ecrã. Aponte o comando diretamente para a unidade interior e carregue em ligar.\n5. Aguarde 3 a 5 minutos. Alguns equipamentos demoram um pouco antes de começar a sair ar frio/quente.\n6. Se aparecer o erro C4 63 ou se a unidade não responder, desligue o disjuntor do ar condicionado durante 10 minutos e volte a ligar, apenas se o conseguir fazer em segurança.\n\nSe continuar sem funcionar, envie-nos por favor uma fotografia do comando, da unidade interior e do erro apresentado. Se puder, envie também um vídeo curto a mostrar o que acontece quando carrega no botão de ligar.", "ar condicionado, ac, frio, calor, comando, floco de neve, C4 63, disjuntor", "Air conditioning mode issue or error", "Send mode, remote, doors/windows, filters, and safe reset steps.", "Hello [Name]. Let us try to fix the air conditioning. Please follow these steps:\n\n1. Close doors and windows so the unit can cool/heat properly.\n2. On the remote, check the selected mode: for cooling it should show the snowflake symbol or 'Cool'; for heating it should show the sun symbol or 'Heat'.\n3. Set the temperature a few degrees below the room temperature if you want cooling, or above it if you want heating.\n4. Check that the remote has batteries and that information appears on its screen. Point the remote directly at the indoor unit and press power.\n5. Wait 3 to 5 minutes. Some units take a little time before cold/warm air starts coming out.\n6. If error C4 63 appears or the unit does not respond, turn off the air-conditioning breaker for 10 minutes and turn it back on, only if you can do this safely.\n\nIf it still does not work, please send us a photo of the remote, the indoor unit, and the error shown. If possible, also send a short video showing what happens when you press the power button.", "air conditioning, ac, cool, heat, remote, snowflake, C4 63, breaker"],
    ["technical", "tv-no-signal", 6, "TV sem sinal", "Enviar passos para fonte HDMI, box, cabos e reinício.", "Olá [Nome]. Vamos tentar recuperar o sinal da TV. Por favor, faça estes passos:\n\n1. Confirme se a TV está ligada e se a box/equipamento de TV também está ligado à corrente.\n2. Verifique se o cabo HDMI está bem encaixado na TV e na box. Se estiver solto, encaixe novamente.\n3. No comando da TV, carregue em 'Source', 'Input' ou no botão com símbolo de entrada.\n4. Experimente selecionar HDMI 1, HDMI 2 ou a entrada onde a box está ligada. Aguarde alguns segundos em cada opção.\n5. Se a box tiver uma luz, confirme se está acesa. Se estiver apagada, desligue a box da tomada durante 30 segundos e volte a ligar.\n6. Depois de reiniciar a box, aguarde 2 a 3 minutos antes de testar novamente.\n\nSe continuar sem sinal, envie-nos por favor uma fotografia da parte de trás/lateral da TV onde está ligado o HDMI e uma fotografia do ecrã com a mensagem de erro. Assim conseguimos orientar a entrada correta.", "tv, televisão, sem sinal, source, input, hdmi, box, comando", "TV has no signal", "Send HDMI source, TV box, cable, and restart steps.", "Hello [Name]. Let us try to restore the TV signal. Please follow these steps:\n\n1. Confirm that the TV is turned on and that the TV box/device is also connected to power.\n2. Check that the HDMI cable is firmly connected to both the TV and the box. If it is loose, plug it in again.\n3. On the TV remote, press 'Source', 'Input', or the button with the input symbol.\n4. Try selecting HDMI 1, HDMI 2, or the input where the box is connected. Wait a few seconds on each option.\n5. If the box has a light, check whether it is on. If it is off, unplug the box from the power socket for 30 seconds and plug it back in.\n6. After restarting the box, wait 2 to 3 minutes before testing again.\n\nIf there is still no signal, please send us a photo of the back/side of the TV where the HDMI cable is connected and a photo of the screen showing the error message. This helps us guide you to the correct input.", "tv, television, no signal, source, input, hdmi, box, remote"],
    ["technical", "washing-machine-door", 7, "Máquina de lavar roupa não abre", "Enviar passos de espera, drenagem, energia e segurança da porta.", "Olá [Nome]. A porta da máquina pode ficar bloqueada por segurança durante alguns minutos após o ciclo. Por favor, tente estes passos:\n\n1. Aguarde 5 minutos após o fim do programa. Muitas máquinas só desbloqueiam depois de arrefecer ou terminar a drenagem.\n2. Confirme se ainda existe água dentro do tambor. Se houver água, selecione o programa 'Drain', 'Spin' ou 'Centrifugação/Escoar', se disponível.\n3. Depois desse programa terminar, aguarde novamente alguns minutos até ouvir o clique de desbloqueio.\n4. Não force o puxador, porque pode partir o fecho da porta.\n5. Se o painel estiver bloqueado ou sem resposta, desligue a máquina da tomada durante 2 minutos e volte a ligar.\n\nSe a porta continuar bloqueada, envie-nos por favor uma fotografia do painel e diga-nos se há água dentro da máquina ou algum código de erro. Assim conseguimos ajudar sem danificar o equipamento.", "máquina de lavar, roupa, porta, não abre, ciclo, clique, puxador", "Washing machine door will not open", "Send waiting, draining, power, and door-safety steps.", "Hello [Name]. The washing-machine door can stay locked for safety for a few minutes after the cycle finishes. Please try these steps:\n\n1. Wait 5 minutes after the program ends. Many machines only unlock after cooling down or finishing drainage.\n2. Check whether there is still water inside the drum. If there is water, select the 'Drain', 'Spin', or drain/spin program, if available.\n3. After that program finishes, wait a few more minutes until you hear the unlocking click.\n4. Please do not force the handle, as this can break the door lock.\n5. If the panel is locked or not responding, unplug the machine from the power socket for 2 minutes and plug it back in.\n\nIf the door is still locked, please send us a photo of the panel and tell us whether there is water inside the machine or any error code. This helps us assist without damaging the appliance.", "washing machine, laundry, door, will not open, cycle, click, handle"],
    ["technical", "power-outage", 8, "Falha de energia geral", "Enviar passos para confirmar quadro elétrico, zona afetada e segurança.", "Olá [Nome]. Lamentamos a falha de eletricidade. Para percebermos se é algo dentro do apartamento ou uma falha geral da zona, pedimos por favor que verifique o seguinte:\n\n1. Confirme se a eletricidade falhou em todo o apartamento ou apenas numa divisão/tomada.\n2. Veja se as luzes das áreas comuns, elevador ou edifícios vizinhos também estão sem energia. Isto pode indicar corte geral da rede.\n3. Se for seguro, verifique o quadro elétrico do apartamento e veja se algum disjuntor está desligado ou diferente dos restantes. Se estiver, volte a ligar apenas uma vez.\n4. Se o disjuntor voltar a disparar, não tente novamente. Pode haver um equipamento ou circuito com problema.\n5. Desligue equipamentos de maior consumo, como forno, placa, aquecedor ou máquina de lavar, e aguarde a nossa orientação.\n\nSe a zona também estiver sem energia, normalmente trata-se de uma falha da rede elétrica e teremos de aguardar a reposição pela entidade responsável. Envie-nos por favor uma fotografia do quadro elétrico e diga-nos se os vizinhos/áreas comuns também estão sem luz.", "energia, luz, apagão, eletricidade, EEM, corte, zona, sem luz", "General power outage", "Send steps to check the electrical panel, affected area, and safety.", "Hello [Name]. We are sorry about the power issue. To understand whether this is inside the apartment or a wider area outage, could you please check the following:\n\n1. Confirm whether the power is out in the whole apartment or only in one room/socket.\n2. Check whether the common areas, elevator, or nearby buildings also have no power. This may indicate a general grid outage.\n3. If it is safe, check the apartment's electrical panel and see whether any breaker is off or in a different position from the others. If so, turn it back on only once.\n4. If the breaker trips again, please do not try again. There may be an appliance or circuit issue.\n5. Unplug high-consumption equipment such as the oven, hob, heater, or washing machine, and wait for our guidance.\n\nIf the area is also without power, it is usually a grid outage and we need to wait for the responsible utility to restore service. Please send us a photo of the electrical panel and tell us whether neighbors/common areas are also without power.", "power, electricity, outage, blackout, EEM, cut, area, no power"],
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

const TECHNICAL_VISUALS = {
    "wifi-slow": {
        src: "assets/operational-guide/wifi-router.png",
        alt: "Router com cabos ligados e luzes visiveis",
        caption: "Peca ao hospede para verificar os cabos e as luzes do router antes de enviar fotografia.",
        altEn: "Router with connected cables and visible lights",
        captionEn: "Ask the guest to check the router cables and lights before sending a photo."
    },
    "induction-locked": {
        src: "assets/operational-guide/induction-hob.png",
        alt: "Placa de inducao com simbolo de bloqueio e panela adequada",
        caption: "Ajuda o hospede a identificar o bloqueio e a confirmar se a panela e compativel.",
        altEn: "Induction hob with lock symbol and suitable pan",
        captionEn: "Helps the guest identify the lock and confirm whether the pan is compatible."
    },
    "hot-water": {
        src: "assets/operational-guide/hot-water-tap.png",
        alt: "Torneira com misturadora virada para agua quente",
        caption: "Mostra como testar a agua quente numa torneira antes de reportar.",
        altEn: "Tap with mixer handle turned to hot water",
        captionEn: "Shows how to test hot water from a tap before reporting back."
    },
    "appliance-fault": {
        src: "assets/operational-guide/appliance-unplugged.png",
        alt: "Eletrodomestico desligado da tomada em seguranca",
        caption: "Reforca que o aparelho deve ficar desligado ate a equipa confirmar a situacao.",
        altEn: "Appliance safely unplugged from the socket",
        captionEn: "Reinforces that the appliance should stay unplugged until the team confirms the situation."
    },
    "air-conditioning": {
        src: "assets/operational-guide/air-conditioning.png",
        alt: "Ar condicionado e comando a distancia",
        caption: "Ajuda o hospede a verificar modo, temperatura, pilhas e resposta da unidade.",
        altEn: "Air conditioner and remote control",
        captionEn: "Helps the guest check mode, temperature, batteries, and unit response."
    },
    "tv-no-signal": {
        src: "assets/operational-guide/tv-hdmi.png",
        alt: "Cabo HDMI ligado a televisao e box",
        caption: "Mostra o tipo de ligacao HDMI que o hospede deve confirmar.",
        altEn: "HDMI cable connected to television and TV box",
        captionEn: "Shows the HDMI connection the guest should confirm."
    },
    "washing-machine-door": {
        src: "assets/operational-guide/washing-machine-door.png",
        alt: "Maquina de lavar com porta fechada e painel visivel",
        caption: "Ajuda a explicar bloqueio de porta, drenagem e codigos no painel.",
        altEn: "Washing machine with closed door and visible panel",
        captionEn: "Helps explain door lock, draining, and panel error codes."
    },
    "power-outage": {
        src: "assets/operational-guide/electrical-panel.png",
        alt: "Quadro eletrico com disjuntores visiveis",
        caption: "Mostra ao hospede o tipo de quadro eletrico que deve fotografar e verificar em seguranca.",
        altEn: "Electrical panel with visible breakers",
        captionEn: "Shows the guest the kind of electrical panel to photograph and check safely."
    }
};

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
    const visual = TECHNICAL_VISUALS[row[1]];
    return {
        sectionId: row[0],
        id: row[1],
        number: row[2],
        title: isEnglish ? row[7] : row[3],
        action: isEnglish ? row[8] : row[4],
        response: isEnglish ? row[9] : row[5],
        keywords: splitKeywords(isEnglish ? row[10] : row[6]),
        visual: visual
            ? {
                src: visual.src,
                alt: isEnglish ? visual.altEn : visual.alt,
                caption: isEnglish ? visual.captionEn : visual.caption
            }
            : null
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
