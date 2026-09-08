# Conformidade do relógio de ponto — Portugal

Este diretório contém o dossier operacional para colocar o relógio de ponto em produção. O código ajuda a cumprir as obrigações, mas não substitui a organização interna, a afixação e envio do mapa, as cópias de segurança, nem a validação por advogado/consultor laboral.

## O que a aplicação passa a suportar

- registo individual de entrada, saída e início/fim de cada pausa;
- marcação aceite apenas junto da hora do servidor Firestore, apresentada em `Europe/Lisbon` e conservada também em UTC;
- turnos que terminam depois da meia-noite;
- histórico de correções manuais sem apagar o evento original, sempre com motivo e autor;
- revisão por responsável e trilho de auditoria;
- retenção indicada por cinco anos, escrita incremental e proibição de apagar o registo pelo browser;
- consulta limitada aos próprios registos para utilizadores ligados a um trabalhador;
- estação de tablet com PIN individual validado pelo Firebase Authentication numa sessão isolada e limitação automática de tentativas abusivas;
- exportação CSV e impressão semanal/mensal, incluindo trabalhadores arquivados;
- mapa semanal com os campos estruturais do artigo 215.º;
- registo separado de trabalho suplementar: autorização/fundamento, início, termo, visto do trabalhador, revisão e descanso compensatório.

## Implantação sem plano pago

1. Fazer cópia de segurança/exportação do Firestore atual.
2. Implantar as regras do Firestore.
3. Implantar o site.
4. Criar um utilizador de teste ligado a um trabalhador e testar entrada, pausa, regresso, saída, impressão e CSV.
5. Criar a conta exclusiva do tablet com apenas a função `time-clock-station`, iniciar sessão no tablet e configurar um PIN de teste.
6. Confirmar que o PIN errado é recusado, que o PIN correto regista a marcação e que a sessão principal do tablet continua ativa.
7. Preencher “Configuração legal do registo” na área de gestor.
8. Configurar os restantes PINs conforme a [política do tablet partilhado](POLITICA-PIN-TABLET.md).
9. Imprimir e afixar o mapa aplicável; na Madeira, enviar a cópia à Direção Regional do Trabalho com a antecedência exigida e guardar prova.

O fluxo normal de marcação e os PINs do tablet não usam Cloud Functions e são compatíveis com o plano gratuito Spark. A identidade técnica de cada PIN não recebe funções nem acesso geral: as regras permitem-lhe apenas consultar/criar o registo do trabalhador associado, sem apagar ou substituir marcações anteriores.

Para publicar as regras:

```powershell
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
