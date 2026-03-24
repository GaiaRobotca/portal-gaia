# 🚀 Portal Gaia — Google Drive Integrado

## Como aplicar

### Opção A — Script automático (recomendado)
1. Coloque este arquivo na mesma pasta do seu `index.html`
2. Execute:
   ```bash
   python3 apply_patch.py index.html index_drive.html
   ```
3. Substitua seu `index.html` pelo `index_drive.html` gerado
4. Faça push para o GitHub

### Opção B — Manual
Aplique as 6 mudanças do `apply_patch.py` manualmente no seu `index.html`

---

## ⚙️ Configuração no Google Cloud Console (OBRIGATÓRIO)

Acesse https://console.cloud.google.com → projeto **portal-gaia-491214**

### 1. Ativar APIs
- **APIs & Services → Library**
  - Ative: **Google Drive API** ✅
  - Ative: **Identity and Access Management (IAM) API** ✅

### 2. Configurar o OAuth Client
- **APIs & Services → Credentials → seu OAuth 2.0 Client ID**
- Em **Authorized JavaScript origins** adicione:
  ```
  https://gaiarobotca.github.io
  ```
- Em **Authorized redirect URIs** já deve ter:
  ```
  https://gaiarobotca.github.io/portal-gaia/
  ```
- Clique **Save**

### 3. OAuth Consent Screen
- **APIs & Services → OAuth consent screen**
- Adicione cada e-mail da equipe em **Test users**
  (enquanto o app não estiver "publicado")
- Ou clique em **Publish App** para não precisar de whitelist

### 4. Permissões da pasta no Drive
- Abra a pasta do projeto no Drive
- Compartilhe com cada membro que vai usar o portal
  (pode ser qualquer conta Google, não precisa ser @uftm.edu.br)

---

## 🎯 Funcionalidades implementadas

| Funcionalidade | Descrição |
|---|---|
| Login Google | OAuth 2.0 seguro, popup, sem expor secrets |
| Listagem | Mostra todos os arquivos da pasta raiz |
| Navegação | Entra em subpastas com breadcrumb |
| Busca | Filtro por nome em tempo real |
| Ordenação | Por nome, data ou tamanho |
| Vista grade/lista | Toggle entre os dois modos |
| Upload | Drag & drop ou seletor de arquivos com barra de progresso |
| Download | Arquivos normais + exportação automática de Google Docs/Sheets/Slides para Office |
| Visualização | Preview inline de imagens e Google Docs (embed) |
| Exclusão | Somente administradores, move para lixeira |
| Multi-conta | Mostra quem está logado, permite trocar de conta |

---

## 🔒 Segurança

- O `client_secret` **nunca** vai para o frontend (não é necessário nesse fluxo)
- Usamos o fluxo **OAuth 2.0 Implicit / Token** via `google.accounts.oauth2`
- Apenas membros com conta Google autorizada no Console acessam o Drive
- O token expira automaticamente (1h) e pode ser renovado sem intervenção

