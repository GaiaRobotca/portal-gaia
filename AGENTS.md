# Portal GAIA

index.html concentra a interface; email-queue.js centraliza envios. Nao
executar testes contra Firebase/EmailJS reais. Usar doubles offline.
Fork e original podem apontar ao mesmo backend; isolamento nao decorre do
nome do repositorio. Regras de seguranca do backend nao foram verificadas.
Validar com node --test tests/email.test.cjs. Preservar a limitacao de retry
a recusas 429; falha ambigua nao autoriza reenviar automaticamente.
Definition of Done: regressao offline, sintaxe, documentacao e nenhuma
alegacao de controle de acesso baseada apenas na interface.

Nao disparar email automaticamente em login, sincronizacao ou timers.
Regressao antispam: node --test tests/*.test.cjs. Ver docs/alert-spam-fix.md.

Reserva Gmail: apps-script/ e docs/gmail-fallback.md. Implantacao MYSELF,
sem envio no GET, sem endpoint publico e sem tokens no navegador. Preservar
rota permanente por aviso, recibos privados e bloqueio de resultados incertos.
Auditoria de cotas e escopo: docs/email-delivery-audit.md.

Novo backend: functions/, email-backend*.js, email-admin.js e docs/email-setup.md.
API privada via Firebase Auth; email_system nega acesso direto do browser.
Nao ativar provedores ou enviar testes reais durante desenvolvimento.
Preservar unknown como terminal automatico; HTTP 503 generico nao autoriza failover.
Teste de integracao: somente demo-gaia-email com emuladores e provedores mock.
