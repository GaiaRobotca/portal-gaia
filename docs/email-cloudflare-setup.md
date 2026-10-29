# Ativação gratuita: Cloudflare Workers + D1

Escolha explícita de Pedro em 29/10/2026: manter Firebase Spark e adaptar para backend gratuito. Esta é a implantação selecionada. A opção Firebase Functions anterior permanece como alternativa técnica não implantada; **não executar o upgrade Blaze nem a implantação Functions do guia antigo**.

## Estado verificado

- Firebase console: projeto portal-gaia-f5c93 no Spark, sem faturamento por uso habilitado.
- Cloudflare: acesso ainda pendente. O login Google apresentou erro 400 no navegador do usuário; a causa não foi determinada. A alternativa preparada é cadastrar/entrar por e-mail no próprio site, sem reutilizar URLs temporárias de consentimento Google.
- Mailjet: acesso/cadastro e verificação do remetente ainda pendentes. Nenhuma conta nova, credencial real ou envio real foi criado por esta adaptação.
- Código do Worker compila; D1 local e workerd passam nos testes sintéticos. Isso não comprova entrega real ou consumo de CPU em produção.

## Arquitetura selecionada

Portal → Firebase Auth (identidade) → Worker autenticado → fila privada D1 → Cron → EmailRouter compartilhado → Mailjet/reserva.

O Firebase mantém o portal e sua identidade no Spark. O novo Worker não usa service account e não precisa de Admin SDK em produção. Valida o token do usuário com o endpoint oficial accounts:lookup do Google, confirma projeto/issuer/expiração e o perfil verificado autorizado; o token recebido não é armazenado no D1. A chave pública web do Firebase é configuração, não uma credencial de envio privada. Cada admissão de aviso usa o token somente para consultar e reservar a rota protegida no Firebase com ETag/if-match; nenhuma senha é enviada ao Worker.

A fila, tentativas, circuitos e recibos ficam no D1, sem endpoint público de leitura. Todas as rotas HTTP exigem Origin exata do portal e autorização Firebase. O backend compartilha o núcleo e os provedores já testados em functions/core.js e functions/providers.js. A alternativa Functions não deve ser implantada junto: os dois armazenamentos não podem competir pelo mesmo aviso.

## Limites e custo

Fontes oficiais verificadas: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [Google accounts.lookup](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/lookup), [Firebase REST auth](https://firebase.google.com/docs/database/rest/auth).

Workers Free: 100.000 solicitações/dia e 10 ms de CPU por invocação. D1 Free: 5 milhões de linhas lidas/dia, 100.000 escritas/dia, 5 GB totais de armazenamento; outros limites por banco também se aplicam. Ao exceder cotas gratuitas o serviço pode recusar operações; não haverá upgrade automático. Não adicionar assinatura paga nem cartão para esta implantação. Latência de rede não é CPU, mas CPU real ainda está NOT_MEASURED e precisa ser observada após ativação.

Para manter o primeiro dispatcher conservador, o cron tenta até **um destinatário por minuto**. Um aviso para 35 endereços pode levar aproximadamente 35 minutos, mais atrasos de quota/provedor. O limite poderá ser revisto com medição real, não com promessa de throughput. O painel informa essa capacidade. Chamadas de admissão são divididas em até 15 destinatários para respeitar o orçamento de consultas por invocação. Fechar o navegador só é seguro após a confirmação de admissão de todos; se interromper antes, repetir a mesma identidade completa a fila sem duplicar o que já foi registrado.

## Etapas que Pedro conclui diretamente

1. Entre ou cadastre a conta institucional em [Cloudflare](https://dash.cloudflare.com/sign-up), preferindo e-mail caso o SSO Google continue com erro 400. Se já existir conta, use recuperação em vez de duplicar cadastro. Crie a senha, confirme o e-mail e aceite os termos diretamente no site. Não envie senha ou códigos pelo chat. Mantenha Workers Free.
2. Entre/crie conta Free em [Mailjet](https://app.mailjet.com/signup), confirme o endereço institucional e complete a aprovação do remetente. Mesmas regras de senha/termos. Não crie contas múltiplas para ampliar cotas.
3. Avise quando as duas contas estiverem abertas. A configuração técnica e o teste único para gaia.robotica.uftm@gmail.com já foram solicitados pelo usuário; não há autorização para testes em massa.

## Implantação técnica após acesso às contas

Na pasta worker/, use o Wrangler fixado no package-lock. Login via CLI necessita da autorização OAuth da conta; não copiar tokens ou URLs temporárias entre sessões de navegador.

```powershell
cd worker
npm ci --ignore-scripts
npx wrangler login
npx wrangler d1 create gaia-email
```

Copie o ID público de banco retornado para database_id em wrangler.jsonc. Se gaia-email já existir, reutilize o banco correto; não criar outro sem verificar sua finalidade. Aplique a migration somente no banco escolhido:

```powershell
npx wrangler d1 migrations apply gaia-email --remote
npx wrangler secret put EMAIL_PROVIDER_SECRETS
npx wrangler secret put FIREBASE_WEB_API_KEY
npx wrangler deploy
```

EMAIL_PROVIDER_SECRETS recebe o JSON da estrutura functions/provider-secrets.example.json, somente com as credenciais reais que já verificou; provedores restantes vazios. FIREBASE_WEB_API_KEY recebe a chave pública do projeto já usada pelo Firebase web. Não colocar secrets no wrangler.jsonc, frontend, RTDB público, README ou GitHub. Se precisar de valores locais, .dev.vars é ignorado. Nunca transmitir chave do Mailjet ao navegador. Se a chave Firebase tiver restrição de origem que impeça lookup server-side, revisar uma chave apropriada para Identity Toolkit; não desativar proteções existentes por tentativa.

Antes de admitir avisos reais, revisar e aplicar a mudança mínima de firebase-email-routes.rules.json: a conta Gaia verificada pode criar o marcador backend; depois disso a rota é imutável para browsers/Apps Script. Preserve quaisquer regras concorrentes do console. Não sobrescrever o banco nem apagar dados. Teste de regras ocorre no emulador; a alteração real depende da etapa de implantação, não foi alegada como já aplicada nesta adaptação.

Copie a URL HTTPS workers.dev retornada para endpoint em email-backend-config.js, mantenha transport:'cloudflare' e só habilite enabled:true após revisar a migração. Use uma prévia controlada do frontend antes de alterar a versão publicada. A API permite somente PORTAL_ORIGIN; para teste isolado, configurar uma origem de prévia explicitamente no Worker de teste, não liberar '*' em produção.

No painel, conecte Gaia, consulte status (sem enviar), habilite somente Mailjet e clique explicitamente em Enviar um e-mail de teste com destino gaia.robotica.uftm@gmail.com. Aguarde o cron, confira providerMessageId, painel Mailjet e caixa de entrada/spam. Aceito não é entregue. Resultados unknown nunca são reenviados automaticamente. Não simular quota provocando falha real.

Após aprovação do teste, reconciliar EmailJS/Gmail legados, fechar abas antigas e retirar credenciais públicas antigas de envio browser antes de publicar o corte. Avisos com tentativas antigas não são importados automaticamente. O PR continua sujeito à revisão; o pedido original de não fazer merge automático na main permanece.

## Testes reproduzíveis sem contas reais

```powershell
node --test tests/*.test.cjs
npm ci --ignore-scripts --prefix worker
npm run build --prefix worker
node --test tests/worker-email.test.mjs
node tests/email-backend-browser.cjs
```

Os testes D1 usam Miniflare/workerd local e nenhum provedor real. A versão Miniflare é a mesma dependência oficial do Wrangler fixado; sua API de compatibilidade V4 é convertida explicitamente. O build é dry-run, não implantação. A assinatura JWT não é confiada por simples decodificação: o teste confirma que somente a resposta autenticada do Google determina o perfil. Testes específicos de Cloudflare ficam no job free-worker do CI.
