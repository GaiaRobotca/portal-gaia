# Auditoria de envio de e-mail — 28/10/2026

## Diagnóstico e evidências

Base auditada: `GaiaRobotca/portal-gaia`, `main` em
`f0fdc1608bba280a4bba6747bf12efe57b2e79fe`. Checkout de trabalho isolado do
fork local de Pedro. Causa operacional informada diretamente por Pedro:
**cota de envio do EmailJS esgotada**, com aproximadamente 30 destinatários.
O saldo, plano contratado, data de renovação e logs privados do provedor são
UNKNOWN: não houve acesso autenticado ao painel nem chamada de envio real.

O plano gratuito publicado pelo EmailJS permite 200 requisições mensais.
Com 30 envios individuais por aviso, seis avisos consomem 180 requisições;
o sétimo excede 200, desconsiderando testes e avaliações. Esse cálculo explica
a incompatibilidade de capacidade; não representa medição da conta Gaia.

Não foi identificado um commit que comprovadamente causou o esgotamento.
`git log`, `git diff` e `git blame` mostram falhas de diagnóstico anteriores:
eventos e avaliações descartavam rejeições com `catch(()=>{})`; o teste de
configuração mostrava apenas “Erro ao enviar”. O commit `f0fdc16` desativou
lembretes automáticos em login/timers para conter spam. Essa proteção permanece.
O histórico anterior é uma possível fonte de consumo, não prova da composição
da cota atual. Nenhuma troca de SDK ou atualização de dependências foi necessária.

## Inventário

| Componente | Estado verificado no código/histórico |
| --- | --- |
| Framework/frontend | HTML, CSS e JavaScript; interface concentrada em `index.html` |
| Backend/banco | Firebase Realtime Database, namespace `gaia_v7`; nenhuma função de aplicação implantável encontrada |
| Autenticação | Comparação local com cadastro de membros; não usa Firebase Auth; papel local não comprova autorização do servidor |
| Provedor atual | EmailJS Browser SDK major 3 via CDN; API HTTPS; fila em `email-queue.js` |
| Deploy | GitHub Pages; workflow `pages build and deployment` concluído com sucesso para o commit base em 12/10 |
| CI | `.github/workflows/tests.yml`, Node 22, testes offline |
| Server actions/APIs próprias/webhooks/cron | Não encontrados no repositório base |
| Jobs | Fila de Promises no navegador; não é uma fila durável de servidor |
| SMTP/Edge/Node runtime de produção | Não aplicáveis ao frontend estático atual |
| Drive | `drive_js.txt` contém integração Google Drive; não envia e-mail |

Não foram encontrados fluxos de e-mail próprios para cadastro, boas-vindas,
cursos, convites ou recuperação de senha. Trainees e setores são filtros de
destinatários dos avisos/eventos. Os arquivos do repositório não permitem
excluir integrações externas que não estejam versionadas.

## Fluxos completos

1. **Avisos**: administrador publica no mural → `notice-mail.js` substitui as
   funções legadas de publicação/renderização do HTML → transação Firebase
   persiste aviso → filtro de membros ativos/setor, validação e deduplicação →
   reserva por destinatário → fila central → `emailjs.send` → comprovante
   `emailDelivery` → resumo no mural. A fila envia individualmente a cada
   destinatário e mantém intervalo de 1,2 s. Falhas de rede não geram retry;
   somente 429 transitório permite até duas novas tentativas.
2. **Evento manual**: administrador marca envio imediato → `saveCalEvent` →
   membros ativos do setor, endereços válidos e únicos → mesma fila/template →
   EmailJS. Agora os erros aparecem no portal. Criar evento e aceitar e-mail
   são operações independentes; não há comprovante durável para esse fluxo.
3. **Avaliação de tarefa**: administrador aprova/devolve → `reviewSub` → membro
   responsável → mesma fila/template → EmailJS → erro visível se falhar.
   A avaliação continua salva mesmo quando o e-mail falha.
4. **Teste de configuração**: `testEmail` → endereço do usuário atual → fila →
   aceite ou mensagem com código seguro de falha.
5. **Lembretes agendados**: somente notificações locais; nenhum envio em login,
   sincronização ou timer. Não foram reativados.

`publishNotice`/`renderNotices` legados permanecem no HTML por compatibilidade,
mas são substituídos pelo script carregado ao final. Há uma única chamada
ativa a `emailjs.send`, compartilhada por todos os fluxos.

## Configuração, remetente e segurança

O repositório base não tem `package.json`, `.env.example`, configuração SMTP
ou leitura de variáveis de ambiente. EmailJS usa `emailConfig.serviceId`,
`templateId`, `publicKey` no Firebase. A chave pública EmailJS é projetada
para navegador; nenhuma chave privada foi adicionada. O campo `configured`
não comprova conectividade: a fila também valida os três campos exigidos.

Remetente, reply-to, destinatário do template e conexão Gmail são configurados
no painel EmailJS, não no código. Estado atual: UNKNOWN. O template deve usar
`{{to_email}}`, `{{notice_title}}`, `{{notice_body}}` e `{{to_name}}`; conferir
que não há CC/BCC fixos no painel. Não foi inventado domínio nem remetente.
O Apps Script usa a identidade Google existente `gaia.robotica.uftm@gmail.com`;
`MailApp` envia como a conta implantadora e não exige senha SMTP no portal.

As regras Firebase efetivamente implantadas e o IAM da conta são UNKNOWN.
Não foram lidos cadastros privados, alteradas regras ou adicionadas rotas
públicas. Guardas da interface são defesa adicional, não autenticação de
servidor. A nova aplicação Gmail é privada (`MYSELF`), verifica identidade
ativa/efetiva e começa desabilitada. O token OAuth permanece no servidor.

## Correção e alternativa

- Reserva Gmail para **avisos com recusa explícita por cota mensal**. Portada
  do fork `Pedronsjaja/portal-gaia`, commit
  `bbac6ec8485d82b32b7677103eb2c0eceee2969b`, preservando a autoria no Git de
  origem e registrando a proveniência aqui. Não foi copiada a segunda fila
  do fork: o original continua com uma única fila global.
- Página privada consulta aviso/membros no servidor, mostra prévia e saldo e
  envia individualmente em lotes máximos de 20. Para 30 pessoas: 20 + 10,
  mediante duas ações explícitas e nova prévia entre elas.
- Rota permanente por aviso coordena EmailJS/Gmail; recibos privados, lock e
  escrita condicional evitam repetição após snapshot antigo ou falha ambígua.
- Erros EmailJS recebem códigos seguros, incluindo configuração, autenticação,
  remetente, cota mensal, rate limit e resultado desconhecido. Logs não incluem
  destinatários, conteúdo, chaves ou resposta arbitrária do provedor.
- Erros de eventos/avaliações/teste deixaram de ser descartados. Calendário
  agora remove duplicatas e membros inativos. Avisos não reenviam um endereço
  já aceito/incerto mesmo que apareça com outro ID de membro.

O Apps Script pessoal tem limite publicado de 100 destinatários/dia;
Google Workspace tem outro limite. A aplicação consulta o saldo efetivo,
não presume 100 disponíveis. A cota reinicia 24 h após a primeira requisição,
conforme documentação; outros limites Google também se aplicam.

**Escopo parcial explícito**: a reserva cobre avisos; eventos, avaliações e
teste permanecem EmailJS. Não há troca automática global de provedor.
Se for necessário ultrapassar 100 destinatários/dia ou automatizar todos os
fluxos, será necessário backend com identidade verificável e provedor
transacional; isso não foi introduzido nesta correção restrita.

## Validação

| Verificação | Resultado |
| --- | --- |
| `node --test tests/*.test.cjs` | PASS — 29 testes offline |
| `node tests/gmail-browser.cjs` | PASS — Edge headless, requisições interceptadas |
| `node --check email-queue.js` e `node --check notice-mail.js` | PASS |
| Parse dos scripts HTML e Apps Script | PASS — coberto pelos testes |
| `git diff --check` | PASS |
| npm install/lint/typecheck/build | NÃO APLICÁVEL — sem package.json/scripts/build |
| Google OAuth, Firebase IAM/regras, envio/recebimento reais | BLOQUEADO — dependem da implantação/autorização da conta Gaia |

Playwright já estava disponível no fork local e foi reutilizado apenas como
ferramenta de teste (`NODE_PATH=E:\GitHub\portal-gaia\node_modules`); nenhuma
dependência foi adicionada ao portal. Captura local inspecionada:
`test-results/gmail-fallback.png`, ignorada pelo Git. Casos incluem lista
normal, endereço ausente/duplicado/inválido, configuração ausente, recusa do
provedor, zero destinatários, 30 pessoas, limite de cota, identidade recusada,
falha de banco, conflito de atualização e resultado incerto.

## Ativação pendente

Seguir [gmail-fallback.md](gmail-fallback.md). Antes de ativar: publicar o PR
após revisão; recarregar clientes antigos; confirmar permissões Firebase;
implantar **um único** projeto privado como a conta Gaia; autorizar Google;
validar em banco isolado com destinatário controlado; então habilitar
`ENABLED=true` e configurar a URL `/exec` no mural. Não reenviar aviso antigo
sem conferir conteúdo, data e comprovantes.

Não houve merge, publicação do site, criação de projeto Google, envio real ou
mudança de permissão. A implementação está testada offline; a restauração em
produção ainda não está comprovada.

Fontes: [EmailJS pricing](https://www.emailjs.com/pricing/),
[EmailJS REST send](https://www.emailjs.com/docs/rest-api/send/),
[Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas),
[MailApp](https://developers.google.com/apps-script/reference/mail/mail-app),
[Web Apps](https://developers.google.com/apps-script/guides/web),
[Firebase REST auth](https://firebase.google.com/docs/database/rest/auth).
