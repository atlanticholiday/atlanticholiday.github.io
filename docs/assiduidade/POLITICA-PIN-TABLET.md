# Política do PIN no tablet partilhado

## Finalidade

O PIN serve para atribuir cada marcação feita no tablet partilhado ao colega que selecionou o próprio nome. Não substitui a palavra-passe da conta do tablet e não deve ser usado para outros fins.

## Regras técnicas aplicadas

- cada colega ativo recebe um PIN pessoal de 6 a 10 algarismos;
- o PIN nunca é guardado em texto simples: o servidor conserva apenas um hash `scrypt` com salt aleatório;
- o browser e a conta do tablet não podem ler hashes, salts ou estado interno dos PINs;
- cada marcação da conta com função `time-clock-station` exige validação do PIN no servidor;
- após cinco tentativas incorretas, o PIN fica bloqueado durante cinco minutos;
- o PIN é apagado do ecrã após cada tentativa, depois de uma marcação e após inatividade;
- criar, substituir ou remover um PIN exige uma conta de administrador, gestor ou supervisor e gera um evento de auditoria.

## Procedimento operacional

1. O responsável cria um PIN diferente para cada colega em **Relógio de Ponto → Configuração → PINs dos colegas**.
2. O PIN é entregue diretamente ao titular e não é enviado em grupos, afixado ou guardado junto do tablet.
3. O colega deve escolher o próprio nome, tapar o teclado ao introduzir o código e confirmar a ação correta.
4. Suspeitas de divulgação, esquecimento ou uso por terceiro obrigam à substituição imediata do PIN.
5. Marcações indevidas são anuladas pelo fluxo de correção, com motivo e sem apagar o histórico.
6. O responsável revê periodicamente exceções e tentativas anormais no trilho de auditoria.

## Conta do tablet

A conta do dispositivo deve ter apenas a função **Estação de relógio de ponto (`time-clock-station`)**, sem colega associado e sem acesso a outras aplicações. Deve usar palavra-passe longa e exclusiva. Inicia-se a sessão uma vez no browser/PWA do tablet; não se grava a palavra-passe no código nem se partilha essa conta com computadores pessoais.

O tablet deve ter bloqueio de ecrã, atualizações automáticas, acesso físico controlado e modo de aplicação/quiosque quando o sistema operativo o permitir.
