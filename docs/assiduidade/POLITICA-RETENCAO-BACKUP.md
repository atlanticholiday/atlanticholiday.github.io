# Política de retenção e cópias de segurança

## Regra

Os documentos `attendance_records` e `overtime_records`, os seus eventos, correções, revisões e comprovativos são conservados por cinco anos. O campo `retainUntil` sinaliza a data mínima; não autoriza eliminação automática sem revisão.

## Cópias de segurança

- exportação automática diária do Firestore para um destino separado e cifrado;
- retenção suficiente para recuperar eliminação, corrupção ou erro operacional sem ultrapassar o prazo aprovado;
- acesso limitado a administradores designados e auditado;
- teste de restauro trimestral, registando data, responsável, coleção recuperada, tempo de recuperação e resultado;
- exportação mensal CSV por trabalhador e do trabalho suplementar, guardada em arquivo de escrita única ou acompanhada por hash e controlo de versões.

## Eliminação

Uma rotina futura só pode eliminar registos depois de `retainUntil`, desde que não exista litígio, inspeção, processo disciplinar, pedido de autoridade ou outra obrigação de conservação. Cada lote deve gerar relatório com intervalo temporal, identificadores, fundamento, aprovador e data.

## Continuidade

Se a aplicação ou rede falhar, usar folha de contingência com trabalhador, data, entrada, pausas, saída e assinatura. Um responsável introduz depois cada evento como correção manual, indicando “folha de contingência”, a referência do documento e o motivo. Conservar a folha original com a exportação do período.
