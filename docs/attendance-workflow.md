# Presença e exportação Excel

## Diagnóstico e alterações

O portal é uma página estática. `index.html` concentra as telas e a sincronização com o
Firebase compat 10.8.1. EmailJS é usado em outros fluxos. Na revisão base
`f0fdc1608bba280a4bba6747bf12efe57b2e79fe`, o loop de 30 s e o loop iniciado no login
de 60 s executavam `flushSession`. Também havia uma segunda atualização do nó online
no loop de 30 s. Os listeners do nó raiz, de sessões e de usuários online chamavam
`renderCurrentPage()`. Na tela de presença, `renderAttendance()` redefinia a data e
recriava os checkboxes com `innerHTML`. O registro alterava os objetos locais, limpava
o formulário e chamava `save()` sem aguardar confirmação.

- `index.html` mantém um único heartbeat de 60 s e associa as seleções aos IDs dos membros.
  Atualizações reutilizam os controles, preservam o rascunho e renderizam o histórico apenas
  quando seu conteúdo muda.
- O registro usa uma transação com presença, saldo e lançamentos de hora. O botão fica
  bloqueado até a confirmação. Uma tentativa rejeitada preserva o rascunho e reutiliza
  sua chave se o conteúdo permanecer igual. Se a conexão cair com uma gravação em
  andamento, o SDK pode aguardar reconexão para determinar o resultado.
- `save()` grava apenas módulos alterados. Quando a alteração também inclui membros ou
  lançamentos de horas, aplica os campos editados à versão atual dos membros e agrega
  lançamentos dentro de uma transação. Ajustes manuais de horas usam o saldo da
  transação. Sessões, usuários online e histórico de presenças deixam de ser sobrescritos
  por gravações de outros módulos. Edições simultâneas da mesma coleção legada de tarefas
  ou avisos ainda podem concorrer entre si.
- `attendance.js` concentra o cálculo de datas, a transformação transacional e o relatório.
  A transação opera em `gaia_v7` para preservar o esquema com listas legadas. Isso envolve
  o nó inteiro na disputa de concorrência e requer homologação de permissões e volume.
- Foram adicionados testes unitários e um teste de navegador com dados fictícios. A
  [auditoria de segurança](attendance-security.md) documenta os limites do login atual.

## Como exportar

Entre como administrador, abra **Lista de Presença**, clique em **Gerar planilha** e
selecione o período. Para **Intervalo personalizado**, preencha as duas datas e clique
em **Baixar Excel (.xlsx)**.

Os períodos de 1, 6 e 12 meses vão da data equivalente no mês anterior até hoje em
Brasília, incluindo as duas datas. Se o dia não existe no mês inicial, usa-se o último dia
desse mês. Todo o histórico usa os limites dos registros válidos. Períodos vazios geram as
três abas com cabeçalhos e filtros. São incluídos no resumo os IDs com presença no período.
Novos registros guardam nome, setor e cargo dos participantes para preservar o histórico
após a saída da equipe. Quando um registro antigo só armazena nome e ID do ex-membro,
setor e cargo ficam vazios. Para membros ativos, a aba de resumo usa o cadastro atual.

O consolidado usa as presenças do período, elimina repetição de ID de participante em
cada registro e repetição de ID de registro. Registros criados separadamente têm IDs
distintos, inclusive quando as descrições coincidem. A exclusão da lista de presença
mantém o comportamento anterior de preservar as horas já creditadas no saldo geral.
O relatório deixa de contar o registro excluído.

O gerador é o bundle para navegador do [ExcelJS 4.4.0](https://www.npmjs.com/package/exceljs/v/4.4.0)
sob licença MIT, distribuído via jsDelivr com SHA-384 verificado. O código apenas grava
novas planilhas. A versão tem [aviso sobre esgotamento de memória na leitura de arquivos](https://github.com/advisories/GHSA-5pwm-xv7w-v3cm)
e [alertas de dependências do pacote Node](https://github.com/exceljs/exceljs/issues/3055).
O portal não importa arquivos Excel nem usa a API de arquivos do pacote Node.

## Validação isolada

```bash
node --test tests/*.test.cjs
npm install --prefix /tmp/gaia-attendance-tests playwright-core exceljs@4.4.0
/tmp/gaia-attendance-tests/node_modules/.bin/playwright-core install chromium
NODE_PATH=/tmp/gaia-attendance-tests/node_modules node tests/attendance.browser.cjs
```

Para usar Chromium já instalado, informe `GAIA_CHROMIUM=/caminho/do/chromium`.
`GAIA_EVIDENCE` escolhe o diretório das capturas e planilhas. `GAIA_REAL_TIME=1`
faz o cenário de espera usar cinco minutos de relógio real. Por padrão o teste executa
o relógio do navegador em modo acelerado. O teste bloqueia requisições externas
e simula os listeners e transações com um estado comum entre duas páginas.

| Cenário | Evidência |
| --- | --- |
| Espera de 30, 60, 120 e 300 s | Esperas executadas com relógio real e com relógio acelerado no Chromium. Data, descrição, horas, IDs selecionados, contador e identidade dos checkboxes preservados durante atualizações de sessão e avisos. |
| Marcar e desmarcar todos | Quatro selecionados na primeira ação e zero na seguinte. |
| Offline e falha de transação | Os campos permaneceram preenchidos sem conexão e após uma rejeição simulada. Nova tentativa manteve o ID anterior. |
| Confirmação, clique duplo e dois administradores | Duas gravações simultâneas válidas e dois registros. As horas de Ana passaram de 10 a 17, as de Bruno de 10 a 13. Três lançamentos de horas. |
| Períodos e consolidação | As cinco opções baixaram arquivos válidos, além de um personalizado vazio. Os dois limites do intervalo foram incluídos. O resumo preservou o ex-membro e ignorou o saldo acumulado. |
| Datas e horários | Fim de mês, ano bissexto, data inválida, intervalo invertido e virada de 02:59:59 para 03:00:00 UTC verificados. |
| Arquivo e interface | Seis planilhas foram reabertas com ExcelJS e regravadas pelo LibreOffice Calc. A comparação com openpyxl confirmou abas, filtros e conteúdo. Os tamanhos 1366×900 e 390×844 foram verificados no Chromium. |
| Papel de membro | Formulário e botão ocultos. Uma chamada à exportação pelo fluxo da interface encerra antes de carregar a biblioteca. |

Microsoft Excel e Google Sheets não foram abertos diretamente. Os testes de concorrência
no navegador usam um Firebase simulado. A concorrência também foi executada com
Firebase compat 10.8.1 e Realtime Database Emulator 4.11.2 no projeto fictício. Dois
clientes confirmaram suas transações, um terceiro atualizou o estado online e uma
nova tentativa com a mesma chave manteve dois registros e saldo final de 9 horas
(saldo inicial de 2, acréscimos de 3 e 4). As regras efetivamente implantadas precisam
de homologação antes da publicação.

Para reproduzir o teste do SDK, execute com Java e Firebase CLI em um diretório
temporário, fora do repositório. O teste fixa o endereço de loopback e o projeto demo.

```bash
npm install --prefix /tmp/gaia-attendance-tests firebase@10.8.1 firebase-tools
cd "$(mktemp -d)"
printf '%s\n' '{"database":{"rules":"local.rules.json"},"emulators":{"database":{"host":"127.0.0.1","port":9017},"ui":{"enabled":false}}}' > firebase.json
printf '%s\n' '{"rules":{".read":true,".write":true}}' > local.rules.json
NODE_PATH=/tmp/gaia-attendance-tests/node_modules \
  /tmp/gaia-attendance-tests/node_modules/.bin/firebase emulators:exec \
  --only database --project demo-gaia-attendance \
  'node /caminho/absoluto/portal-gaia/tests/attendance.emulator.cjs'
```

As regras abertas acima servem ao emulador local com dados sintéticos.

## Rollback

Se a alteração for publicada e precisar ser revertida, reverta o commit de merge
(`git revert -m 1 SHA_DO_MERGE`) ou o commit único de squash (`git revert SHA_DO_SQUASH`),
em uma branch de recuperação e abra um PR. Para uma integração por rebase, reverta os
commits da alteração do mais recente ao mais antigo. Não restaure snapshots do Firebase.
O esquema legado continua legível e os registros já confirmados não devem ser apagados.
A versão anterior reintroduz a gravação ampla do portal, portanto evite usá-la com
edições simultâneas enquanto analisa a causa do rollback.
