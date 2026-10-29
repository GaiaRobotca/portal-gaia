# Reserva Gmail para avisos

Implementação do fork de 2026-10-16, adaptada e revalidada no original em 2026-10-28. **Não ativada em produção.**
Remetente solicitado: `gaia.robotica.uftm@gmail.com`.

## Comportamento

O EmailJS continua principal. Quando um aviso apresenta recusas explícitas
`Monthly request quota exceeded`, o administrador abre **Reserva Gmail** no
mural. A página privada do Apps Script consulta o aviso e os membros no
Firebase, mostra conteúdo, destinatários elegíveis e cota. Só o botão
**Enviar pendentes pelo Gmail** envia, em lotes de até 20 destinatários.
Abrir, atualizar, fazer login e sincronizar não enviam mensagens.

Esta primeira versão exige uma ação na conta Google do Gaia. Não é failover
automático: o login atual do portal não comprova identidade para um servidor.
Não há endpoint público de envio, senha Gmail, chave privada ou token no site.

Somente membros ativos do setor, com endereço válido igual ao da tentativa
anterior, status `failed` e erro mensal específico do EmailJS são elegíveis.
Endereços repetidos são eliminados. `sent`, `sending`, `unknown`, falhas de
rede e outros erros não são reenviados. Cadastros sem endereço válido
precisam ser corrigidos separadamente; este recurso não inventa endereços.

## Concorrência e registros

- `gaia_notice_routes/<noticeId>` reserva o aviso para um provedor. O portal
  atualizado reserva `emailjs/sending` antes do lote e libera para `idle` ao
  terminar. Se a aba morrer, a reserva permanece bloqueada para conciliação.
- O Apps Script adquire essa rota por ETag/If-Match, recusando um lote EmailJS
  ativo. A transferência para `apps-script` é permanente para aquele aviso.
  Não apagar a rota para tentar novamente pelo EmailJS.
- O Apps Script usa um lock e recibos privados em Script Properties, indexados
  pelo SHA-256 de aviso/endereço. Grava `sending` antes de chamar MailApp,
  `sent` após aceite, ou `unknown` se a chamada falhar. Não armazena o corpo
  do aviso nos recibos. Um recibo existente bloqueia repetição.
- `gaia_v7/notices/*/emailDelivery` recebe o provedor e resultado para o mural,
  com atualização condicional da coleção. Falha de persistência posterior
  não autoriza novo envio: o recibo privado permanece.
- A prévia possui impressão digital de conteúdo e candidatos, revalidada
  depois da transferência. Alterações exigem nova prévia.

Limites: não há garantia absoluta de entrega única; uma interrupção entre
reserva e envio pode deixar mensagem não enviada bloqueada. A preferência é
não duplicar. Aceite MailApp/EmailJS não comprova entrega na caixa de entrada.
Os recibos privados não devem ser apagados sem conciliação. Script Properties
tem armazenamento finito; ao esgotá-lo, a reserva falha antes de enviar.

## Ativação — conta do Gaia

1. Revisar e publicar a versão atualizada de `notice-mail.js` e
   `email-queue.js` junto com o portal. Fechar/recarregar abas antigas antes
   de ativar a reserva. O fork e o site original não são a mesma implantação.
2. Confirmar as regras reais do Firebase e a autorização dos administradores
   em `gaia_notice_routes` e `gaia_v7/notices`. **UNKNOWN neste trabalho.**
   Não tornar o banco público para fazer a integração funcionar. O código
   atual do portal usa uma identidade apenas local; implantar autenticação
   Firebase e regras por papel é uma etapa separada se necessária.
3. Na conta Google do Gaia, criar **um único** projeto Apps Script privado.
   Copiar `apps-script/Code.gs` para `Code`, `apps-script/Index.html` para
   `Index` e habilitar a edição do manifesto para copiar `appsscript.json`.
   Nenhum projeto Google foi criado automaticamente por este trabalho.
4. Autorizar os escopos declarados: envio de e-mail (MailApp, sem leitura da
   caixa), chamadas HTTP, identificação do usuário e acesso ao Firebase.
   O token OAuth fica no servidor, no cabeçalho Authorization. A conta precisa
   já ter permissão apropriada no projeto Firebase. Em caso de HTTP 401/403,
   parar e revisar a configuração com o responsável pelo projeto; não ampliar
   permissões indiscriminadamente. Compatibilidade OAuth/IAM real: NÃO TESTADA.
5. Implantar como aplicativo da Web, **executar como eu**, acesso
   **somente eu**, usando `gaia.robotica.uftm@gmail.com`. O manifesto declara
   `MYSELF` e o servidor também exige usuário ativo e efetivo iguais ao
   remetente. Identidade vazia é recusada. Não publicar para "qualquer pessoa".
6. Manter `ENABLED` ausente nas Script Properties até concluir as verificações
   acima. Depois, definir `ENABLED=true`. Para desativar, definir `false`.
7. Copiar a URL `/exec`. No mural, usar **Configurar reserva Gmail**. Essa URL
   fica apenas neste navegador; não é segredo nem concede acesso à conta.
8. Validar primeiro em uma implantação de testes com banco isolado e
   destinatários controlados. Ajustar `DATABASE_` nessa implantação de teste.
   Só depois usar a instância de produção. Nunca usar os membros reais como
   massa de teste nem criar falsos erros de cota em avisos reais.
9. No aviso real, abrir **Reserva Gmail**, conferir data e conteúdo (um aviso
   de reunião passada pode estar obsoleto), verificar os destinatários e
   clicar em enviar. Atualizar a prévia para continuar além de 20 destinatários.

O dono da conta precisa realizar a autorização Google. Não compartilhar senha,
tokens ou recibos privados no GitHub. Não compartilhar a conta como método
de conceder acesso a outros administradores; isso exige um fluxo de identidade
próprio em trabalho posterior.

## Recuperação

Não liberar automaticamente `sending`/`unknown`, nem resetar tentativas.
Conferir registros disponíveis do provedor e a operação interrompida. Se não
for possível comprovar ausência de envio, manter bloqueado. Uma falha ao
registrar no mural pode coexistir com `sent` nos recibos privados. Nunca usar
apenas o mural para decidir apagar um recibo. Não criar outro projeto Apps
Script para repetir o lote: cada projeto teria registros separados.

Abas antigas ignoram a nova rota. O salvamento geral legado ainda escreve a
coleção inteira de avisos; pode reverter a exibição de um resultado. Os recibos
privados evitam repetição pelo Gmail, e a rota separada impede reenvio pelo
portal atualizado. Isso não corrige as regras Firebase nem clientes antigos.

## Validação e estudo

TESTADO AUTOMATICAMENTE: `node --test tests/*.test.cjs` (serviços simulados).
Resultado local: 29 testes aprovados em 2026-10-28.
Casos: autorização, cota, conflito ETag, lock, prévia alterada, deduplicação,
falha ambígua, recibo sobrevivendo a snapshot antigo, 30 destinatários em lotes de 20 + 10 e bloqueio
do EmailJS após transferência. Nenhum teste chama serviços externos reais.

TESTADO AUTOMATICAMENTE EM NAVEGADOR: `node tests/gmail-browser.cjs`,
Microsoft Edge via Playwright, aprovado. Todas as requisições interceptadas:
publicação sintética com recusa de cota, configuração da URL, abertura com
apenas ID e bloqueio do EmailJS após transferência. Captura inspecionada em
`test-results/gmail-fallback.png` (artefato local ignorado pelo Git).
Requer `npm install --no-save --package-lock=false playwright` e Edge.

NÃO TESTADO: autorização Google, IAM/regras Firebase implantadas, envio e
recebimento reais, cota efetiva e publicação no site original.

Para entender esta implementação: a rota decide quem pode tentar o envio;
o recibo decide se uma tentativa pode ser repetida. Estude ETag, exclusão mútua,
OAuth e operações não atômicas entre banco e provedor de e-mail. Desafio:
interromper um teste após `sending` e explicar por que repetir seria arriscado.

Referências verificadas em [references.md](references.md).
