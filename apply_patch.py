#!/usr/bin/env python3
"""
Portal Gaia — Google Drive Patch
Uso: python3 apply_patch.py index.html index_drive.html
"""
import sys, re

if len(sys.argv) < 3:
    print("Uso: python3 apply_patch.py index.html index_drive.html")
    sys.exit(1)

with open(sys.argv[1], encoding='utf-8') as f:
    html = f.read()

# ──────────────────────────────────────────────
# PATCH 1: Scripts Google no <head>
# ──────────────────────────────────────────────
OLD_EMAILJS = '<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>'
NEW_EMAILJS = (
    '<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>\n'
    '<script src="https://apis.google.com/js/api.js"></script>\n'
    '<script src="https://accounts.google.com/gsi/client" async defer></script>'
)
assert OLD_EMAILJS in html, "Patch 1 FALHOU: script emailjs não encontrado"
html = html.replace(OLD_EMAILJS, NEW_EMAILJS, 1)
print("✓ Patch 1: Scripts Google adicionados")

# ──────────────────────────────────────────────
# PATCH 2: CSS do Drive (antes dos scrollbar styles)
# ──────────────────────────────────────────────
CSS_ANCHOR = '::-webkit-scrollbar{width:4px}'
DRIVE_CSS = """
/* ═══ GOOGLE DRIVE INTEGRADO ═══ */
.drive-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.drive-breadcrumb{display:flex;align-items:center;gap:4px;flex:1;flex-wrap:wrap;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:7px 12px;font-size:12px}
.crumb{color:var(--dim);cursor:pointer;transition:.15s}.crumb:hover{color:var(--accent)}.crumb.active{color:var(--text);font-weight:500;cursor:default}.crumb-sep{color:var(--muted);font-size:10px}
.drive-auth-card{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:380px;gap:16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--rl);padding:48px 24px;text-align:center}
.drive-auth-icon{width:72px;height:72px;border-radius:18px;background:linear-gradient(135deg,rgba(26,143,255,.15),rgba(0,229,160,.12));border:1px solid rgba(26,143,255,.2);display:flex;align-items:center;justify-content:center;font-size:34px}
.drive-auth-title{font-family:'Syne',sans-serif;font-weight:800;font-size:18px}
.drive-auth-sub{font-size:13px;color:var(--dim);max-width:340px;line-height:1.6}
.btn-google{display:flex;align-items:center;gap:10px;padding:11px 24px;background:#fff;border:1px solid #ddd;border-radius:var(--r);color:#333;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;transition:.2s;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.btn-google:hover{box-shadow:0 4px 14px rgba(0,0,0,.18);transform:translateY(-1px)}
.google-logo{width:20px;height:20px;flex-shrink:0}
.drive-stats{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.drive-stat{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px 14px;font-size:11px;color:var(--dim)}
.drive-stat span{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;color:var(--text);display:block}
.view-toggle{display:flex;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:3px;gap:2px}
.view-btn{width:30px;height:30px;border-radius:6px;border:none;background:transparent;color:var(--dim);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:.15s}
.view-btn.on{background:var(--bg3);color:var(--text)}
.drive-search{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px 12px;color:var(--text);font-family:'DM Sans',sans-serif;font-size:12px;outline:none;width:200px;transition:.2s}
.drive-search:focus{border-color:rgba(99,210,255,.35);width:260px}
.drive-sort{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:8px 10px;color:var(--dim);font-family:'DM Sans',sans-serif;font-size:11px;outline:none;cursor:pointer}
.drive-upload-zone{border:1.5px dashed var(--border);border-radius:var(--rl);padding:18px;text-align:center;margin-bottom:14px;transition:.2s;cursor:pointer;background:transparent;display:none}
.drive-upload-zone.visible{display:block}.drive-upload-zone.dragover{border-color:var(--blue);background:rgba(26,143,255,.04)}.drive-upload-zone:hover{border-color:rgba(99,210,255,.4)}
.upload-list{margin-bottom:10px;display:flex;flex-direction:column;gap:6px}
.upload-item{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r)}
.upload-prog-bar{flex:1;height:4px;background:var(--bg3);border-radius:100px;overflow:hidden}
.upload-prog-fill{height:100%;background:linear-gradient(90deg,var(--blue),var(--green));border-radius:100px;transition:width .3s}
.upload-status{font-size:10px;font-weight:600;min-width:42px;text-align:right}
.drive-files-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.drive-file-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px;cursor:pointer;transition:.2s;position:relative;display:flex;flex-direction:column;gap:8px}
.drive-file-card:hover{border-color:rgba(255,255,255,.14);transform:translateY(-2px);box-shadow:0 8px 22px rgba(0,0,0,.2)}
.drive-file-card.folder{border-color:rgba(255,209,102,.2)}.drive-file-card.folder:hover{border-color:rgba(255,209,102,.4)}
.drive-file-icon{font-size:28px;line-height:1}
.drive-file-name{font-size:11px;font-weight:600;word-break:break-word;line-height:1.4}
.drive-file-meta{font-size:10px;color:var(--dim)}
.drive-file-actions{position:absolute;top:6px;right:6px;display:none;gap:4px}
.drive-file-card:hover .drive-file-actions{display:flex}
.drive-file-action-btn{width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;transition:.15s}
.btn-dld{background:rgba(26,143,255,.15);color:var(--blue)}.btn-dld:hover{background:rgba(26,143,255,.3)}
.btn-del-f{background:rgba(255,92,92,.1);color:var(--red)}.btn-del-f:hover{background:rgba(255,92,92,.22)}
.drive-files-list{display:flex;flex-direction:column;gap:4px}
.drive-list-row{display:flex;align-items:center;gap:11px;padding:9px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);cursor:pointer;transition:.15s}
.drive-list-row:hover{border-color:rgba(255,255,255,.12);background:var(--bg3)}
.drive-list-row .drive-file-icon{font-size:18px;flex-shrink:0}
.drive-list-name{flex:1;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.drive-list-size{font-family:'DM Mono',monospace;font-size:11px;color:var(--dim);min-width:60px;text-align:right}
.drive-list-date{font-size:11px;color:var(--muted);min-width:90px;text-align:right}
.drive-list-actions{display:flex;gap:5px;opacity:0;transition:.15s}
.drive-list-row:hover .drive-list-actions{opacity:1}
.drive-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--muted);padding:40px;text-align:center}
.drive-empty-icon{font-size:42px}
.drive-loading{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:var(--dim);font-size:13px;padding:60px}
.drive-preview-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);z-index:2000;align-items:center;justify-content:center;padding:20px}
.drive-preview-ov.on{display:flex;animation:fade .2s}
.drive-preview-box{background:var(--bg2);border:1px solid var(--border);border-radius:18px;max-width:900px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}
.drive-preview-hd{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0}
.drive-preview-title{font-family:'Syne',sans-serif;font-weight:700;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.drive-preview-body{flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:20px;min-height:300px}
.drive-preview-body iframe{width:100%;height:100%;min-height:500px;border:none;border-radius:var(--r)}
.drive-preview-body img{max-width:100%;max-height:70vh;border-radius:var(--r);object-fit:contain}
.drive-user-chip{display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(0,229,160,.06);border:1px solid rgba(0,229,160,.18);border-radius:100px;font-size:11px;color:var(--green)}
.drive-user-avatar{width:22px;height:22px;border-radius:50%}
"""
assert CSS_ANCHOR in html, "Patch 2 FALHOU: âncora de CSS não encontrada"
html = html.replace(CSS_ANCHOR, DRIVE_CSS + CSS_ANCHOR, 1)
print("✓ Patch 2: CSS do Drive adicionado")

# ──────────────────────────────────────────────
# PATCH 3: Substituir #pg-files por div vazio (renderizado via JS)
# ──────────────────────────────────────────────
OLD_PG_FILES_START = '    <div id="pg-files" class="pg">\n      <div class="ph">'
# Encontrar e substituir o bloco inteiro do pg-files
# Usamos regex para pegar o bloco completo
pattern = r'<div id="pg-files" class="pg">.*?(?=\n    <div id="pg-myprofile")'
match = re.search(pattern, html, re.DOTALL)
if match:
    html = html[:match.start()] + '<div id="pg-files" class="pg"></div>\n' + html[match.end():]
    print("✓ Patch 3: #pg-files substituído por div dinâmico")
else:
    print("⚠ Patch 3: Bloco pg-files não encontrado via regex, tentando método alternativo...")
    if 'id="pg-files"' in html:
        print("  (div encontrado mas padrão diferente — verifique manualmente)")
    else:
        print("  FALHOU: div pg-files não existe")

# ──────────────────────────────────────────────
# PATCH 4: Substituir openDrive() 
# ──────────────────────────────────────────────
OLD_OPEN_DRIVE = """function openDrive() {
  window.open('https://drive.google.com/drive/u/1/folders/1_noLzqhxAmdPNGzCcYRXO5ctYvkPZi-K', '_blank');
}"""
NEW_OPEN_DRIVE = """function openDrive() {
  goPage('files', el('nav-files'));
}"""
if OLD_OPEN_DRIVE in html:
    html = html.replace(OLD_OPEN_DRIVE, NEW_OPEN_DRIVE, 1)
    print("✓ Patch 4: openDrive() atualizado")
else:
    # Tentar versão alternativa de indentação
    OLD2 = "function openDrive() {\n  window.open('https://drive.google.com/drive/u/1/folders/1_noLzqhxAmdPNGzCcYRXO5ctYvkPZi-K', '_blank');\n}"
    if OLD2 in html:
        html = html.replace(OLD2, NEW_OPEN_DRIVE, 1)
        print("✓ Patch 4: openDrive() atualizado (alt)")
    else:
        print("⚠ Patch 4: openDrive() não encontrado exato — buscando via regex...")
        p = r"function openDrive\(\)\s*\{[^}]+\}"
        m = re.search(p, html)
        if m:
            html = html[:m.start()] + NEW_OPEN_DRIVE + html[m.end():]
            print("✓ Patch 4: openDrive() atualizado via regex")
        else:
            print("  FALHOU")

# ──────────────────────────────────────────────
# PATCH 5: renderPage — files: ()=>{}  →  files: renderDrivePage
# ──────────────────────────────────────────────
OLD_RENDER = "    files:      ()=>{},  // redireciona para Drive"
NEW_RENDER = "    files:      renderDrivePage,"
if OLD_RENDER in html:
    html = html.replace(OLD_RENDER, NEW_RENDER, 1)
    print("✓ Patch 5: renderPage.files atualizado")
else:
    OLD_RENDER2 = "    files:      ()=>{},"
    if OLD_RENDER2 in html:
        html = html.replace(OLD_RENDER2, NEW_RENDER, 1)
        print("✓ Patch 5: renderPage.files atualizado (alt)")
    else:
        p = r"files\s*:\s*\(\)\s*=>\s*\{\s*\}"
        m = re.search(p, html)
        if m:
            html = html[:m.start()] + "files: renderDrivePage" + html[m.end():]
            print("✓ Patch 5: renderPage.files atualizado via regex")
        else:
            print("⚠ Patch 5: não encontrado")

# ──────────────────────────────────────────────
# PATCH 6: Adicionar JS do Drive antes do </script> final
# ──────────────────────────────────────────────
DRIVE_JS_CODE = open('/home/claude/drive_js.txt').read()

CLOSE_SCRIPT = '</script>\n</body>\n</html>'
if CLOSE_SCRIPT in html:
    html = html.replace(CLOSE_SCRIPT, DRIVE_JS_CODE + '\n' + CLOSE_SCRIPT, 1)
    print("✓ Patch 6: JS do Drive inserido")
else:
    # tentar variações de espaçamento
    CLOSE_SCRIPT2 = '</script>\n</body>'
    if CLOSE_SCRIPT2 in html:
        html = html.replace(CLOSE_SCRIPT2, DRIVE_JS_CODE + '\n</script>\n</body>', 1)
        print("✓ Patch 6: JS do Drive inserido (alt)")
    else:
        print("⚠ Patch 6: fechamento não encontrado, tentando regex...")
        m = re.search(r'</script>\s*</body>\s*</html>', html)
        if m:
            html = html[:m.start()] + DRIVE_JS_CODE + '\n</script>\n</body>\n</html>'
            print("✓ Patch 6: JS do Drive inserido via regex")

# ── Salvar resultado ──
with open(sys.argv[2], 'w', encoding='utf-8') as f:
    f.write(html)
print("\n🎉 Patch aplicado com sucesso! →", sys.argv[2])
print("   Tamanho:", len(html), "chars")
