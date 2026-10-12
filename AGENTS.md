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
