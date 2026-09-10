# Política de acesso dos colegas — self-service e horário de equipa

**Versão:** 1.3
**Data da decisão:** 10 de setembro de 2026

**Estado:** etapa 5 concluída e etapa 6 iniciada. As contas dos colegas usam `schedule_directory` para o horário mínimo da equipa e `employee_self_service/{employeeId}` para a sua ficha pessoal. Os documentos completos de `employees`, as notas diárias internas e os registos completos de férias/ausências ficam reservados a perfis autorizados de gestão.

## Objetivo

Aplicar o princípio do menor privilégio: cada colega consulta os seus próprios dados laborais e apenas a informação mínima dos restantes colegas que seja necessária para organizar o trabalho.

Esta política distingue três tipos de informação:

1. dados próprios disponíveis em self-service;
2. informação operacional mínima partilhada no horário da equipa;
3. informação reservada à gestão ou ao próprio titular.

## Dados próprios disponíveis em self-service

Uma conta pessoal ligada a um trabalhador pode consultar:

- nome profissional, número de colaborador, email e telefone guardados no seu perfil;
- departamento, cargo, data de admissão e tipo de vínculo guardados no seu perfil;
- horário previsto, dias de trabalho e alterações que lhe digam respeito;
- férias e ausências próprias, incluindo o estado do respetivo processo;
- marcações de entrada, pausa, regresso e saída;
- totais próprios de trabalho, pausas e trabalho suplementar;
- correções, justificações, vistos e estado de revisão dos seus registos.

Notas internas de gestão não são apresentadas automaticamente no self-service. O exercício do direito de acesso a outros dados pessoais continua a poder ser feito através do contacto de privacidade.

## Informação mínima visível no horário da equipa

Para cada colega e dia, os restantes trabalhadores podem consultar apenas:

- nome profissional;
- departamento, quando necessário para a organização da equipa;
- horário previsto de início e fim;
- estado operacional genérico: `Trabalha`, `Folga`, `Férias` ou `Ausente`;
- nota operacional geral apenas quando um responsável a marcar expressamente como visível para a equipa.

Estados detalhados como doença, ausência pessoal ou ausência injustificada são apresentados aos colegas apenas como `Ausente`.

## Informação que não é partilhada com outros colegas

- email, telefone, morada ou outros contactos pessoais;
- número de colaborador, UID de autenticação e ligações técnicas da conta;
- data de admissão, tipo de contrato ou outros elementos do vínculo;
- notas internas, avaliações ou observações da gestão;
- motivo, pedido, aprovação ou observações de férias e ausências;
- horas reais de entrada e saída, pausas e totais trabalhados;
- trabalho suplementar, respetivos totais, fundamentos e notas;
- correções, justificações, vistos e revisões de assiduidade;
- PIN, hash, salt, tentativas falhadas ou outros dados de autenticação.

## Perfis de acesso

| Perfil | Dados próprios | Horário mínimo da equipa | Dados completos da equipa | Alterações de gestão |
|---|---|---|---|---|
| Colega | Sim | Sim, apenas leitura | Não | Não |
| Gestor/RH autorizado | Sim | Sim | Sim, dentro das suas funções | Sim |
| Administrador | Sim | Sim | Sim | Sim |
| Tablet partilhado | Apenas após PIN e de forma temporária | Não | Não | Não |

## Regras para a implementação

- O horário de equipa deve usar uma coleção/projeção própria com os campos mínimos acima, em vez dos documentos completos de `employees`.
- O documento completo de cada trabalhador é reservado a perfis de gestão autorizados. O próprio trabalhador consulta uma projeção pessoal limitada, sem notas internas, dados de autenticação ou detalhes de outros colegas.
- Férias, ausências, assiduidade e trabalho suplementar devem manter detalhes privados separados do estado operacional partilhado.
- A interface e as regras do Firestore devem aplicar a mesma limitação; esconder elementos apenas no ecrã não é controlo de acesso suficiente.
- Qualquer novo campo deve ser privado por defeito. A partilha com a equipa exige finalidade operacional documentada.
- As projeções só podem ser reconciliadas depois de os dados de origem e destino serem confirmados pelo servidor, sem escritas locais pendentes.
- Um perfil pessoal arquivado é substituído por um marcador inativo sem dados pessoais; o documento-pai não é eliminado pelo cliente, para não deixar férias antigas órfãs e acessíveis numa futura reutilização do identificador.

## Estado das etapas 5 e 6

A etapa 5 fica concluída com três fontes separadas: `schedule_directory` apresenta apenas o estado operacional genérico; `vacation_records` mantém o registo completo reservado; e `employee_self_service/{employeeId}/vacation_records` apresenta ao titular apenas datas, tipo, estado e modo de contagem, sem notas ou metadados de gestão.

A etapa 6 começa com a nova área de leitura **Os meus dados** no relógio de ponto. Esta primeira versão apresenta a ficha profissional segura e as férias/ausências próprias. A evolução seguinte pode consolidar nessa área os saldos de férias, exportações pessoais e o fluxo para pedir correção de dados.
