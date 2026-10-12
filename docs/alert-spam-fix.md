# Correcao de repeticao de alertas — 2026-10-12

Sintoma relatado: destinatarios recebem repetidamente mensagens do Portal.
Evidencia no original: checkAndFireAlerts era executada no login e a cada
3600000 ms; cada cliente enviava para todos os membros elegiveis, sem registro
global de entrega e sem exigir administrador. Fila por navegador apenas
espacava as mensagens. Isso explica uma fonte concreta de multiplicacao;
nao foram consultados logs privados do provedor para atribuir cada email.

Correcao: verificacao automatica so exibe lembretes locais, uma vez por
evento/data/antecedencia na sessao. Nao chama EmailJS nem fila. Checkbox de
email na criacao do evento inicia desmarcado e explicita envio imediato.
Aviso na pagina inicial comunica a correcao sem disparar email em massa.
Original e fork receberam a mesma contencao. Avisos manuais continuam.

TESTADO AUTOMATICAMENTE: 72 verificacoes por sessao, dez sessoes/abas,
administradores e membros; nenhum envio. Data nova e lista vazia tambem
cobertas, alem da suite existente de fila. Nao foram enviados emails reais.

Limite operacional: abas ja abertas com JavaScript antigo precisam ser
fechadas/recarregadas; publicar HTML nao cancela mensagens ja aceitas pelo
provedor ou filas antigas. Nao prometer cancelamento retroativo.
Lembretes agendados por email so devem retornar com um despachante central,
registro duravel por evento/destinatario e tratamento de resultado ambiguo.
Nao reativar broadcast em timers de navegadores.
