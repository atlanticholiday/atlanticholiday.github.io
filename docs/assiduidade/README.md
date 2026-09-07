# Conformidade do relógio de ponto — Portugal

Este diretório contém o dossier operacional para colocar o relógio de ponto em produção. O código ajuda a cumprir as obrigações, mas não substitui a organização interna, a afixação e envio do mapa, as cópias de segurança, nem a validação por advogado/consultor laboral.

## O que a aplicação passa a suportar

- registo individual de entrada, saída e início/fim de cada pausa;
- hora confiável do servidor em `Europe/Lisbon`, conservando também UTC;
- turnos que terminam depois da meia-noite;
- histórico de correções manuais sem apagar o evento original, sempre com motivo e autor;
- revisão por responsável e trilho de auditoria;
- retenção indicada por cinco anos e bloqueio de escrita/apagamento direto pelo browser;
- consulta limitada aos próprios registos para utilizadores ligados a um trabalhador;
- estação de tablet com PIN individual validado no servidor, bloqueio de tentativas e credenciais inacessíveis ao browser;
- exportação CSV e impressão semanal/mensal, incluindo trabalhadores arquivados;
- mapa semanal com os campos estruturais do artigo 215.º;
- registo separado de trabalho suplementar: autorização/fundamento, início, termo, visto do trabalhador, revisão e descanso compensatório.

## Ordem obrigatória de implantação

1. Fazer cópia de segurança/exportação do Firestore atual.
2. Implantar primeiro as Cloud Functions.
3. Confirmar que as funções respondem num ambiente de teste.
4. Implantar as regras do Firestore; a partir desse momento o browser deixa de escrever diretamente nos registos.
5. Implantar o site.
6. Criar um utilizador de teste ligado a um trabalhador e testar entrada, pausa, regresso, saída, correção, impressão e CSV.
7. Preencher “Configuração legal do registo” na área de gestor.
8. Criar a conta exclusiva do tablet com apenas a função `time-clock-station` e configurar os PINs conforme a [política do tablet partilhado](POLITICA-PIN-TABLET.md).
9. Imprimir e afixar o mapa aplicável; na Madeira, enviar a cópia à Direção Regional do Trabalho com a antecedência exigida e guardar prova.

Não inverter os passos 2 e 4: se as regras forem implantadas antes das funções, o registo de ponto fica temporariamente indisponível.

Com a configuração Firebase atual, os dois primeiros comandos são:

```powershell
firebase deploy --only functions
firebase deploy --only firestore:rules
```

O `firebase.json` deste repositório ainda não define uma secção `hosting`; a publicação do site deve seguir o mecanismo que já é usado pela empresa, ou essa configuração deve ser adicionada e testada antes de publicar.

## Fontes oficiais principais

- [Código do Trabalho, artigo 202.º — registo dos tempos de trabalho](https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475-175393762)
- [Código do Trabalho, artigos 215.º e 216.º — mapa e afixação](https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475-56411491)
- [Código do Trabalho, artigo 231.º — trabalho suplementar](https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2009-34546475-46725175)
- [Decreto Legislativo Regional n.º 39/2012/M](https://files.dre.pt/gratuitos/1s/2012/12/24700.pdf)
- [CNPD — biometria e assiduidade](https://www.cnpd.pt/organizacoes/areas-tematicas/biometria/)

Revisão da pesquisa: 7 de setembro de 2026. A versão consolidada do Diário da República adverte que não substitui a consulta dos atos publicados.
