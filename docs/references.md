# Referências — reserva Gmail (fontes da implementação de 2026-10-16; cotas, MailApp, Web Apps e autenticação REST reconsultados em 2026-10-28)

## Google Apps Script

- [Cotas](https://developers.google.com/apps-script/guides/services/quotas):
  documenta 100 destinatários/dia para contas pessoais e limites de execução
  e armazenamento. Aplicação: consultar cota a cada envio e limitar lotes.
  Limite: documentação não demonstra saldo real nem entrega; valores podem mudar.
- [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app):
  envio e consulta de cota sem acesso à caixa de entrada. Aplicação: remetente
  autorizado e menor escopo que GmailApp. Retorno não comprova recebimento.
- [Aplicativos Web](https://developers.google.com/apps-script/guides/web) e
  [manifesto](https://developers.google.com/apps-script/manifest/web-app-api-executable):
  execução como implantador e acesso MYSELF. Aplicação: página privada e
  chamadas google.script.run, sem endpoint POST público. Validar implantação real.
- [Session](https://developers.google.com/apps-script/reference/base/session):
  identidade pode estar vazia conforme execução/autorização; o código recusa
  esse caso. Não usar apenas identidade efetiva como identidade do visitante.
- [LockService](https://developers.google.com/apps-script/reference/lock/lock-service):
  exclusão mútua no mesmo projeto. Não coordena dois projetos Apps Script.
- [ScriptApp](https://developers.google.com/apps-script/reference/script/script-app):
  token OAuth do usuário efetivo; permanece no servidor, nunca devolvido ao cliente.

## Firebase e EmailJS

- [REST authentication](https://firebase.google.com/docs/database/rest/auth):
  cabeçalho Bearer e escopos firebase.database/userinfo.email. Requer autorização
  apropriada no projeto; este trabalho não comprovou IAM nem regras existentes.
- [REST conditional writes](https://firebase.google.com/docs/database/rest/save-data):
  ETag/If-Match e recusa HTTP 412. Aplicação: aquisição de rota e atualização
  de recibos sem sobrescrever uma edição entre leitura e gravação. Não torna
  atômicos o envio de e-mail e a gravação no banco.
- [EmailJS send](https://www.emailjs.com/docs/sdk/send/) e
  [cotas](https://www.emailjs.com/pricing/): limite por segundo é diferente
  de cota mensal. Aplicação: preservar retry limitado de 429, exceto quando
  há recusa mensal explícita. Nenhum teste usa EmailJS real.

Reprodução: `node --test tests/*.test.cjs`, doubles de MailApp, UrlFetchApp,
Session, Script Properties, Firebase e EmailJS. Não houve experimento com
infraestrutura ou destinatários reais. Hardware: não aplicável.
