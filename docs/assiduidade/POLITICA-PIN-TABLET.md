# Política do PIN no tablet partilhado

## Finalidade

O PIN serve para identificar o colega e atribuir cada marcação feita no tablet partilhado sem apresentar um diretório de trabalhadores. Não substitui a palavra-passe da conta do tablet e não deve ser usado para outros fins.

## Regras técnicas aplicadas

- cada colega ativo recebe um PIN pessoal e único de 6 a 10 algarismos;
- o PIN nunca é guardado em texto simples pela aplicação nem no Firestore; a credencial é verificada pelo Firebase Authentication;
- o browser e a conta principal do tablet não podem ler qualquer verificador da palavra-passe;
- cada PIN corresponde a uma identidade técnica sem funções da aplicação e associada, nas regras do Firestore, a um único colega;
- cada marcação abre uma sessão de autenticação isolada, mantida apenas em memória, valida o PIN, grava a marcação permitida e termina essa sessão sem encerrar a conta principal do tablet;
- o Firebase Authentication limita automaticamente tentativas abusivas; quando esse limite é atingido, a aplicação pede para aguardar alguns minutos;
- as regras só aceitam uma nova marcação com hora próxima da hora do servidor, preservam todas as marcações anteriores e nunca permitem apagá-las pelo browser;
- a conta principal do tablet não pode consultar o diretório, perfis ou registos dos colegas; só depois de validar o PIN a identidade técnica lê o seu próprio mapeamento e a sua entrada mínima do diretório;
- o PIN é apagado do ecrã após cada tentativa, depois de uma marcação e após inatividade;
- criar, substituir ou remover um PIN exige uma conta de administrador, gestor ou supervisor e atualiza a data de configuração no perfil do colega.

## Procedimento operacional

1. O responsável cria um PIN diferente para cada colega em **Relógio de Ponto → Configuração → PINs dos colegas**.
2. O PIN é entregue diretamente ao titular e não é enviado em grupos, afixado ou guardado junto do tablet.
3. O colega introduz apenas o próprio PIN, confirma o nome apresentado e escolhe a ação correta. Nunca vê a lista ou os registos dos restantes colegas.
4. Suspeitas de divulgação, esquecimento ou uso por terceiro obrigam à substituição imediata do PIN.
5. Marcações indevidas são anuladas pelo fluxo de correção, com motivo e sem apagar o histórico.
6. O responsável revê periodicamente exceções e tentativas anormais no trilho de auditoria.

## Migração para identificação apenas por PIN

Os PINs criados antes desta versão usavam um identificador técnico aleatório e exigiam a escolha prévia do nome. Um responsável deve voltar a guardar um PIN único para cada colega após a atualização. O PIN pode manter os mesmos algarismos, desde que não esteja atribuído a outra pessoa. Até ser novamente guardado, o código antigo não permite identificação no novo ecrã privado.

## Conta do tablet

A conta do dispositivo deve ter apenas a função **Estação de relógio de ponto (`time-clock-station`)**, sem colega associado e sem acesso a outras aplicações. Deve usar palavra-passe longa e exclusiva. Inicia-se a sessão uma vez no browser/PWA do tablet; não se grava a palavra-passe no código nem se partilha essa conta com computadores pessoais.

O tablet deve ter bloqueio de ecrã, atualizações automáticas, acesso físico controlado e modo de aplicação/quiosque quando o sistema operativo o permitir.
