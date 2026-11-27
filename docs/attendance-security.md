# Controle de acesso ao histórico de presença

A interface exibe a exportação e o registro apenas para contas com `CU.isAdmin`. A transação
também confirma se o ID do administrador ainda consta como tal na lista de membros.
Essas verificações ocorrem no navegador e protegem o fluxo normal da interface.

O login atual compara credenciais presentes nos dados carregados pelo cliente. Há suporte
a comparação direta de senha e um fallback legado de senha fixa. O portal também lê
`gaia_v7` por inteiro para alimentar suas telas. O repositório não contém as regras
implantadas que permitiriam verificar a proteção efetiva dessa leitura ou da gravação.
Nenhuma regra, credencial ou base de produção foi acessada nos testes.

Para atender autorização no servidor, a implantação precisa de uma identidade autenticada
pelo Firebase, um papel administrativo atribuído por fonte confiável e regras que neguem
o acesso ao histórico e às operações administrativas a contas sem permissão. A leitura ampla
deve ser substituída por leituras por caminho, porque a permissão na raiz é herdada pelos
descendentes. Como a transação atual atravessa três coleções do esquema legado, a implantação
desse controle deve preferir uma operação de servidor autenticada para a gravação atômica,
ou uma estrutura dedicada que permita regras restritas. A homologação dessas regras exige
um projeto isolado e testes autenticados de administrador e membro comum.

A planilha contém apenas dados necessários à participação. A biblioteca de Excel é carregada
sob demanda, com versão fixa e verificação de integridade, e recebe os dados localmente.

Referências

- [Regras de segurança do Firebase Realtime Database](https://firebase.google.com/docs/database/security?hl=pt-br)
- [Herança das permissões de leitura e gravação](https://firebase.google.com/docs/database/security/core-syntax)
