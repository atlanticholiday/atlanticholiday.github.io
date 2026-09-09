# Política de acesso dos colegas — self-service e horário de equipa

**Versão:** 1.1
**Data da decisão:** 9 de setembro de 2026

**Estado:** etapa 4 concluída e etapa 5 iniciada. As contas dos colegas usam a projeção mínima `schedule_directory`; os documentos completos de `employees` só podem ser lidos pelo próprio titular ou por perfis de gestão autorizados. As notas diárias internas e os registos detalhados de férias/ausências deixaram de poder ser consultados por contas comuns de colegas.

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
- O documento completo de cada trabalhador deve ser legível apenas pelo próprio trabalhador ligado e por perfis de gestão autorizados.
- Férias, ausências, assiduidade e trabalho suplementar devem manter detalhes privados separados do estado operacional partilhado.
- A interface e as regras do Firestore devem aplicar a mesma limitação; esconder elementos apenas no ecrã não é controlo de acesso suficiente.
- Qualquer novo campo deve ser privado por defeito. A partilha com a equipa exige finalidade operacional documentada.

## Próxima etapa

O estado operacional genérico de férias/ausências já é partilhado através de `schedule_directory`, sem motivo, nota ou dados de aprovação. A coleção detalhada `vacation_records` fica reservada à gestão, ao Staff autorizado e a contas com acesso ao Centro de Férias.

Para concluir a etapa 5, falta criar uma projeção individual segura para o self-service. Essa projeção permitirá ao colega consultar apenas as suas próprias férias/ausências e respetivo estado, sem receber notas internas de gestão.
