## Implantação selecionada: gratuita

Firebase permanece no Spark. Backend: Cloudflare Workers + D1. [Ativação atual](docs/email-cloudflare-setup.md). A opção Functions/Blaze abaixo é apenas alternativa; não implantar os dois backends. Acesso às contas e teste real ainda pendentes.


## Validacao de engenharia

[Checks offline e limites do backend](docs/engineering-status.md).

## Novo backend multi-provider (preparado; ativação pendente)

[Pesquisa oficial e custos](docs/email-providers-research.md),
[arquitetura](docs/email-architecture.md), [failover seguro](docs/email-failover.md)
e [configuração e migração](docs/email-setup.md).

Sem domínio próprio: Mailjet principal, SMTP2GO reserva, Resend futuro com domínio
verificado e EmailJS legado. Todos começam desabilitados. Firebase Functions
exige Blaze; não houve implantação nem ativação de faturamento nesta reconstrução.

Validação offline: `node --test tests/*.test.cjs`.
Emuladores e teste visual: veja o guia de configuração e o workflow de testes.

## Reserva Gmail anterior

[Auditoria e testes](docs/email-delivery-audit.md) e
[ativação da reserva Gmail privada](docs/gmail-fallback.md).
A reserva requer implantação e autorização Google; publicar os arquivos do
portal não a ativa. Eventos e avaliações continuam no EmailJS.
