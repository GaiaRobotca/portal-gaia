# Caminho atual: backend gratuito

Pedro escolheu manter o Firebase Spark. Siga [Cloudflare Workers + D1](email-cloudflare-setup.md). As instruções Firebase Functions/Blaze abaixo são uma alternativa anterior, não a implantação autorizada.

# Configurar o novo Sistema de E-mail

Código preparado em 29/10/2026; não implantado nem ativado. Nenhum envio real foi feito durante esta reconstrução. A reserva Gmail anterior é independente e o erro de abertura do aplicativo privado continua sem solução confirmada. Esta implementação não depende dela.

## Escolha para o GAIA, sem domínio próprio

Comece somente com **Mailjet Free**: 6.000 e-mails/mês, até 200/dia, sujeito à aprovação e às restrições iniciais da conta. Cadastre a conta institucional Gaia e verifique o endereço individual. Isso não permite editar SPF/DKIM de gmail.com nem garante entrega: confira o remetente efetivo e a caixa de spam no teste manual. Se a conta exigir domínio ou a autenticação do remetente não funcionar adequadamente, obtenha um subdomínio autorizado da UFTM ou domínio próprio antes da ativação.

Reserva opcional: **SMTP2GO Free**, 1.000/mês, 200/dia; sem domínio verificado aplica-se também 25/hora, com fila interna. Resend só deve ser ativado após verificar um domínio controlado pelo GAIA. Brevo exige concluir a revisão dos termos e da configuração de domínio. EmailJS fica como legado; uma única conta existente, sem multiplicar cadastros gratuitos. Veja [pesquisa completa e custos](email-providers-research.md).

## Contas e remetentes

1. [Mailjet](https://www.mailjet.com/): crie uma conta Free ou use a institucional existente; confirme o cadastro, complete a aprovação de envio e verifique `gaia.robotica.uftm@gmail.com` em remetentes. Em configurações da conta/API, gere ou copie a API Key e Secret Key para o Secret Manager; ambas ficam fora do navegador. Não cole chaves no chat. [Guia oficial](https://dev.mailjet.com/docs/email-api/getting-started/send-first-email).
2. [SMTP2GO](https://www.smtp2go.com/): opcional. Verifique o endereço em Sending → Verified Senders → Single sender emails; crie uma API key com permissão para enviar. [Verificação oficial](https://support.smtp2go.com/hc/en-gb/articles/115004408567-Verified-Senders).
3. [Resend](https://resend.com/): futuro. Adicione domínio/subdomínio autorizado, publique os registros DNS fornecidos, espere a verificação e gere chave restrita a envio. O remetente de testes não equivale a autorização para enviar aos membros.
4. [Brevo](https://www.brevo.com/): futuro/opcional. Revise os termos atuais, confirme a conta, cadastre remetente, configure DKIM/DMARC conforme o painel e gere API key de transacionais. Use subdomínio próprio do provedor quando necessário; não presuma que compartilhar um domínio com outro serviço atende à orientação atual.
5. [EmailJS](https://www.emailjs.com/): use a conta existente. Habilite a opção de API não-browser/Node conforme o painel, obtenha Private Key, Service ID, Template ID e Public Key. O template deve aceitar `to_email`, `to_name`, `notice_title`, `notice_body`, `notice_type` e `portal_name`. A integração backend exige Private Key; não a exponha na antiga tela de configuração. Confirme a disponibilidade da opção no seu plano antes de habilitar.

Domínio futuro: peça ao responsável por DNS para criar um subdomínio de envio. Publique somente os registros exatos de cada painel. Nunca crie dois registros SPF no mesmo nome; mescle políticas conforme orientação do administrador e limite de DNS. DKIM de provedores diferentes usa seletores distintos. Publique uma única política DMARC por domínio, comece monitorando e avalie alinhamento antes de endurecer. Não altere MX do domínio institucional por tentativa. GitHub Pages serve arquivos; não concede controle do DNS de github.io nem uma caixa postal.

## Firebase e secrets

O Firebase já existe no portal (`portal-gaia-f5c93`), mas o plano de faturamento atual não foi verificado nesta reconstrução. Functions exige Blaze: Pedro precisa revisar/autorizar a vinculação de faturamento no console. Franquia gratuita não é promessa de conta zero. Crie alertas de orçamento; alertas não impedem cobranças. Não execute implantação enquanto essa decisão não estiver resolvida.

Use Node.js 22, Firebase CLI 15.34.2 e a conta com acesso administrativo ao projeto correto. Não crie arquivo de chave de service account. As funções usam a identidade do runtime.

```powershell
cd functions
npm ci --ignore-scripts
Copy-Item .env.example .env.portal-gaia-f5c93
# Revise EMAIL_ADMIN_EMAILS e a ordem no arquivo local.
cd ..
firebase login
firebase use portal-gaia-f5c93
firebase functions:secrets:set EMAIL_PROVIDER_SECRETS --project portal-gaia-f5c93
```

No prompt seguro do Secret Manager, forneça um JSON com a estrutura de `functions/provider-secrets.example.json`, substituindo somente os campos do provedor que já configurou. Remova os valores REPLACE; mantenha objetos não configurados vazios. O código começa com todos os provedores desabilitados. Não salve JSON real em arquivo versionado. Se precisar de arquivo local, use apenas `functions/provider-secrets.local.json` (ignorado pelo Git) e proteja/remova conforme sua política de segredos.

**Nomes de configuração:** `EMAIL_PROVIDER_SECRETS` (secret JSON), `EMAIL_ADMIN_EMAILS` e `EMAIL_PROVIDER_ORDER` (configuração do servidor). Campos privados no JSON: `mailjet.apiKey`, `mailjet.secretKey`, `smtp2go.apiKey`, `resend.apiKey`, `brevo.apiKey`, `emailjs.privateKey`. Campos restantes: `from`, `serviceId`, `templateId`, `publicKey`. Nenhuma chave privada deve entrar em index.html, localStorage, RTDB público ou GitHub Pages.

`EMAIL_ADMIN_EMAILS` começa com `gaia.robotica.uftm@gmail.com`; Firebase Auth deve ter Google habilitado e `gaiarobotca.github.io` autorizado. A conta deve ter email_verified=true. O login antigo do portal não autoriza chamadas ao backend. Não adicione outros administradores sem revisar sua autorização.

## Validação e implantação gradual

1. Execute `node --test tests/*.test.cjs` na raiz. São mocks; não acessam Firebase/EmailJS reais.
2. Em ambiente com Java e Node 22, execute `firebase emulators:exec --project demo-gaia-email --only database,auth "node --test tests/email-emulator.cjs"`. O teste exige emuladores locais e só usa provedores mock. Não substitua o projeto demo por produção.
3. Revise as regras antes de aplicar: `email_system` nega acesso direto aos browsers; as funções usam Admin SDK. As regras públicas preexistentes de `gaia_v7` foram mantidas para não quebrar o portal e continuam sendo uma vulnerabilidade separada; não use esse caminho para secrets, autorização ou recibos novos.
4. Confirme região/localização do RTDB e permissões do runtime. O código está em us-central1; mude a região de funções e frontend em conjunto se necessário. Faça backup das regras reais antes de publicar. O arquivo local preserva regras conhecidas, mas não prova que não houve mudanças concorrentes no console.
5. Depois da revisão de faturamento e das regras, implante conscientemente:

```powershell
firebase deploy --only database,functions:email --project portal-gaia-f5c93
```

6. Com todos os provedores ainda desabilitados, use uma prévia isolada do frontend com `email-backend-config.js` habilitado e faça login Google Gaia em Conectar conta de envio. O painel deve abrir; nenhuma consulta dispara e-mail. Nunca habilite um fork contra o backend real presumindo isolamento pelo nome do repositório.
7. Em Sistema de E-mail, revise a ordem, habilite somente Mailjet e salve. O botão de inspeção de configuração não envia. Para testar realmente, preencha um único endereço seu, escolha Mailjet e clique explicitamente em **Enviar um e-mail de teste**. Confira o recibo, o painel Mailjet e a caixa de entrada/spam. Resultado aceito não é entrega confirmada.
8. Só depois de testar o principal, configure e teste a reserva com a mesma cautela. Não provoque falhas reais nem envie aos membros para testar; os cenários de quota/timeout já usam mocks.
9. Antes do corte, reconcilie envios legados e feche sessões antigas. Desative o envio browser no EmailJS/rotacione credenciais públicas antigas para impedir clientes desatualizados de transmitir pelos caminhos de eventos e avaliações. Não reaproveite avisos com tentativas legadas: o backend bloqueia importação automática.
10. Habilite `enabled:true` no arquivo público `email-backend-config.js` e publique a versão revisada somente após concluir o corte. O pedido original exige revisão do PR; não fazer merge automático na main. A mera publicação do código não cria conta, credenciais ou Functions.
11. Publicação de aviso com checkbox de e-mail cria a fila; depois da confirmação de registro, pode fechar o navegador. Eventos/revisões explícitos também passam pelo backend com IDs estáveis. Confira falhas de admissão no painel; não faça reenvio cego.

## Operação

Mude a prioridade em Sistema de E-mail e Salvar ordem e habilitação. `EMAIL_PROVIDER_ORDER` é o valor inicial; a configuração salva no servidor passa a prevalecer. Desabilitar provedor evita novas tentativas, mas não cancela mensagens já aceitas por ele. Não habilite todos apenas porque existem adaptadores.

Uma quota explicitamente esgotada abre circuito até ação administrativa. Confirme no painel do serviço que a quota voltou ou corrija as credenciais; selecione o provedor e use Reabrir tentativa. Resultados unknown nunca são reenviados pelo scheduler ou por esse botão. Investigue o ID no painel do provedor; não apague recibos para forçar reenvio.

Não há endpoint de webhook nesta etapa; delivered não será produzido automaticamente. Confira bounces/complaints no provedor e remova/suprima o destinatário na lista aprovada antes de novos comunicados. Relatórios mostram UTC, último mês e até 200 recibos detalhados. Nenhum saldo restante é estimado.

Se precisar interromper: desabilite os provedores no servidor e preserve a fila. Não volte a enabled:false/browser EmailJS como estratégia para reenviar jobs em andamento. A chave de frontend é um corte de migração, não um seletor de fallback.
