# Ativação da reserva Gmail — 28/10/2026

## Estado verificado

- Criado o projeto privado **GAIA Portal — Reserva Gmail privada**, na conta gaia.robotica.uftm@gmail.com. O projeto anterior de planilhas foi preservado.
- Implantação v1 criada em 28/10/2026, 22:53, execução como Gaia, acesso **Somente eu**. Nenhuma implantação pública foi criada.
- A execução real de checkDeployment confirmou a identidade Gaia, leitura da rota privada e 100 destinatários disponíveis antes do teste.
- Um único teste técnico foi enviado para a própria conta Gaia e confirmado na INBOX pela integração Gmail em 28/10/2026, 22:52. O recibo privado self_test_v1=sent impede repetição; SELF_TEST_ENABLED foi automaticamente desativado.
- ENABLED=true foi configurado após o teste. Nenhum aviso real foi enviado aos membros durante a ativação.
- A página privada falhou na sessão com duas contas. O responsável confirmou ter aberto o link no Codex; a validação em sessão contendo somente Gaia continua pendente.
- O frontend está no PR #1. Não presumir publicação do site apenas pela existência da branch.

## Bloqueios identificados e corrigidos

As regras inicialmente permitiam somente gaia_v7; a nova rota gaia_notice_routes era recusada ao cliente anônimo. O token OAuth de usuário do Apps Script recebeu HTTP 401. A conta Gaia não tem acesso ao Console desse projeto; a administração disponível está na conta de Pedro.

Após autorização específica, foram habilitados Google no Firebase Auth e a regra restrita de firebase-email-routes.rules.json. A rota permite somente o e-mail Gaia verificado; impede apagá-la ou devolvê-la ao EmailJS após transferência. As regras legadas de gaia_v7 foram preservadas. O domínio confirmado gaiarobotca.github.io foi autorizado para login. O contato de suporte é a conta administradora disponível no Console.

O servidor troca a identidade Google por Firebase ID token. A primeira troca retornou INVALID_IDP_RESPONSE; autorizar o identificador público do cliente OAuth deste script na configuração Google resolveu a recusa. A checagem real passou depois do vínculo. O identificador público do projeto fica em Script Properties; nenhuma chave de conta de serviço foi criada e nenhum token é registrado ou enviado ao portal.

## Validação

- 35 testes Node offline e integração do mural no Edge aprovados.
- Código carregado no editor conferido contra o preparado antes dos testes.
- Simulador Firebase: leitura anônima recusada; leitura Gaia verificada permitida; reserva válida permitida; gravação por outra conta recusada.
- Diagnóstico real de identidade/cota/leitura privada aprovado.
- Recebimento de uma mensagem na própria conta Gaia confirmado pela integração Gmail. Membros reais não foram usados como massa de teste.
- Interface Web em sessão com múltiplas contas: falhou. Não afirmar validação visual completa nem ampliar acesso para contornar a falha.

## Uso e recuperação

Depois da publicação do portal: recarregar abas antigas e usar **Conectar conta de envio** no mural, como administrador. Para avisos com recusa mensal explícita, abrir **Reserva Gmail**. A URL implantada já está no código; a configuração local pode substituí-la. Conferir conteúdo/data/destinatários e enviar lotes manuais de até 20. Eventos e avaliações continuam no EmailJS.

Se houver erro com duas contas Google, testar em janela privativa autenticada somente como Gaia. Se ainda falhar nessa condição, parar antes da publicação do frontend e investigar a implantação. O Google documenta que multi-login não é suportado em Apps Script. Não trocar para acesso público.

Recibos sending/unknown não devem ser apagados ou reenviados automaticamente. Para desativar, definir ENABLED=false. Não criar outro projeto para repetir envios: ele teria recibos independentes.

Limite de segurança anterior: gaia_v7 continua publicamente legível/escrevível conforme as regras preexistentes. A rota privada não representa migração completa de autenticação nem impede chamadas diretas ao EmailJS com a configuração pública existente.

## Links

- [Projeto privado](https://script.google.com/u/1/home/projects/1ldlWIxThNlTJwdun6hMacbXOIrDDqqs26kOcRBNPK0fIa8H9ELK12hsF/edit)
- [Aplicativo privado](https://script.google.com/macros/s/AKfycbwB32C6YuL9VazjnPxcDTkhbhgHEcSi_sISrncuGmemBcD6sQbNLzTk5WqYsc2JSUum/exec)
- [Recibo no Gmail](https://mail.google.com/mail/u/?authuser=gaia.robotica.uftm%40gmail.com#all/1a1855bb13b66a61)
- [PR #1](https://github.com/GaiaRobotca/portal-gaia/pull/1)
- [Firebase REST Auth](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-with-oauth-credential)
- [Limitação de múltiplas contas](https://developers.google.com/apps-script/guides/support/troubleshooting)