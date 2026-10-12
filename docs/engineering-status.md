# Validacao offline do Portal

Corrigida a fila para preservar rejeicoes null/undefined/texto do provedor,
sem substituir o erro por TypeError ao consultar status. Jobs seguintes
continuam. Testes Node verificam fila, espacamento, configuracao capturada,
retry 429 e ausencia de retry em falhas ambiguas. Nenhum e-mail real e enviado.

CRITICO: regras Firebase efetivamente implantadas e permissao por papel:
UNKNOWN. Exportar as regras e definir matriz usuario/recurso/operacao antes
de alterar o backend. A interface e a configuracao publica nao comprovam
autorizacao. Nao publicar credenciais de membros nem usar producao como fixture.
ALTO: testes no Firebase Emulator com contas sinteticas e recusas por papel.
MEDIO: separar modulos do index.html gradualmente, com regressao por fluxo.

Aceite futuro do backend: anonimo nao escreve; membro nao altera papeis;
administrador autorizado executa somente operacoes previstas. Detalhes
dependem da politica da equipe, ainda nao confirmada. O CI atual NAO testa
essas regras. Nao foi feito deploy de regras nem alteracao de dados reais.

Para entender esta implementacao: estude promises, serializacao de jobs,
retries e diferenca entre autenticacao e autorizacao. Desafio: simule 429
seguido de sucesso e compare com timeout sem repetir envio.

Referencia: https://firebase.google.com/docs/rules/unit-tests — usar
emuladores para regras; doubles JavaScript nao substituem esses testes.

No original GaiaRobotca, os seis pontos de envio do HTML e notice-mail.js
agora compartilham a mesma fila. Antes havia envios que contornavam o
espacamento; o fork pessoal ja centralizava os seus fluxos.
