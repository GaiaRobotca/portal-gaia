# Reserva Gmail privada para cota EmailJS

Problema: Pedro confirmou em 2026-10-28 que esgotou a cota EmailJS ao enviar para aproximadamente 30 pessoas. A implementação original desta decisão veio do fork, commit bbac6ec8485d82b32b7677103eb2c0eceee2969b.
[NÃO VERIFICADO] consumo atual da conta e entrega real. [INSPEÇÃO ESTÁTICA]
o portal usa login local, Firebase compartilhado e transações de avisos;
regras implantadas não estão disponíveis. Não é possível confiar em `CU.isAdmin`
como autorização de servidor.

Alternativas: aumentar plano EmailJS (custo recorrente); Resend (domínio
verificado e backend); endpoint Apps Script público (exigiria autenticação
robusta adicional); aplicativo Apps Script privado da conta remetente.

Decisão: aplicativo privado, acionado explicitamente no mural, sem troca
automática silenciosa. Preserva Gmail e GitHub Pages; evita expor a capacidade
de envio da conta. Usa MailApp em vez de GmailApp para não solicitar leitura
da caixa. A autorização Google e a implantação são pré-requisitos externos.

Critérios: simplicidade, remetente existente, ausência de segredos no cliente,
recuperação conservadora e teste offline. A reserva permanente por aviso
resolve a concorrência entre provedores nos clientes atualizados. Recibos
privados protegem o Gmail contra snapshots legados; `sending` nunca expira
automaticamente porque expiração não comprova que nada foi enviado.

Prioridades e roadmap:
- CRÍTICO antes de ativar: verificar regras reais, identidade/IAM da conta,
  acesso privado e atualização de todos os clientes que enviam avisos.
- ALTO: validar em banco isolado e destinatário controlado; só então produção.
- MÉDIO: substituir gravações integrais por operações por registro e migrar
  login para identidade verificável, permitindo futura reserva automática.
- BAIXO: métricas de cota e conciliação assistida de recibos privados.

Não se afirma entrega única garantida, segurança comprovada do banco ou
funcionamento em produção. Escopo atual: avisos; eventos, avaliações e outros
fluxos EmailJS permanecem sem reserva Gmail. Fontes e limites em
[references.md](../references.md) e [ativação](../gmail-fallback.md).
