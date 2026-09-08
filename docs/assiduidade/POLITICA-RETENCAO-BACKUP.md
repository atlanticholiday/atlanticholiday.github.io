# Política de retenção e cópias de segurança

## Regra

Os documentos `attendance_records` e `overtime_records`, os seus eventos, correções, revisões e comprovativos são conservados por cinco anos. O campo `retainUntil` sinaliza a data mínima; não autoriza eliminação automática sem revisão.

## Arquivo verificável e cópias de segurança

- no primeiro dia útil de cada mês, um responsável descarrega em **Relógio de Ponto → Configuração → Arquivo mensal verificável** o JSON e o respetivo manifesto SHA-256 do mês anterior;
- o JSON e o manifesto são guardados em dois destinos separados, com pelo menos uma cópia fora do Firebase e acesso limitado;
- o hash apresentado pela aplicação é registado no controlo mensal e comparado com o manifesto descarregado;
- retenção suficiente para recuperar eliminação, corrupção ou erro operacional sem ultrapassar o prazo aprovado;
- acesso limitado a administradores designados e auditado;
- teste de restauro trimestral, registando data, responsável, coleção recuperada, tempo de recuperação e resultado;
- exportação mensal CSV por trabalhador e do trabalho suplementar para consulta humana, conservada junto do arquivo JSON canónico.

O plano gratuito não executa esta tarefa automaticamente. O cumprimento depende do procedimento mensal e da evidência assinada pelo responsável. A falta do arquivo de um mês deve ser tratada como incidente e corrigida de imediato enquanto os dados continuam disponíveis no Firestore.

O hash também pode ser verificado localmente, sem enviar os ficheiros a terceiros:

```powershell
npm run attendance:verify-archive -- .\arquivo-assiduidade_2026-09.json .\MANIFESTO-SHA256_2026-09.json
```

## Eliminação

Uma rotina futura só pode eliminar registos depois de `retainUntil`, desde que não exista litígio, inspeção, processo disciplinar, pedido de autoridade ou outra obrigação de conservação. Cada lote deve gerar relatório com intervalo temporal, identificadores, fundamento, aprovador e data.

## Continuidade

Se a aplicação ou rede falhar, usar folha de contingência com trabalhador, data, entrada, pausas, saída e assinatura. Um responsável introduz depois cada evento como correção manual, indicando “folha de contingência”, a referência do documento e o motivo. Conservar a folha original com a exportação do período.
