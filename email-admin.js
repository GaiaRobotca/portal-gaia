(function(root) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  let current;
  const labels = {accepted:'Aceito pelo provedor', delivered:'Entrega confirmada', pending:'Na fila', sending:'Processando',
    unknown:'Resultado incerto. Verifique o provedor antes de reenviar.', failed:'Falha'};
  root.renderEmailSystem = async function() {
    const box = document.getElementById('email-system-content');
    if (!CU?.isAdmin) { box.textContent = 'Acesso administrativo necessário.'; return; }
    if (!root.GaiaEmailBackend.enabled) {
      box.textContent = 'Backend ainda não ativado. A implantação, as credenciais e a migração precisam ser concluídas conforme docs/email-setup.md.';
      return;
    }
    box.textContent = 'Consultando configuração e recibos…';
    try {
      current = await root.GaiaEmailBackend.status();
      const stats = b=>`${b.accepted} aceitos · ${b.delivered} entregas confirmadas · ${b.failed} falhas · ${b.unknown} incertos · ${b.pending} na fila`;
      box.innerHTML = `<p>Horário das estatísticas: UTC. Aceitação pela API não confirma caixa de entrada.</p>
        ${current.processing ? `<p>Fila gratuita: processamento inicial de até ${esc(current.processing.maxRecipientsPerMinute)} destinatário por minuto. Você pode fechar o navegador após a confirmação de registro de todos os destinatários.</p>` : ''}
        <p>Hoje: ${esc(stats(current.statistics.today))}</p><p>Este mês: ${esc(stats(current.statistics.month))}</p>
        <p>Hoje por provedor: ${esc(JSON.stringify(current.statistics.today.providers))}</p>
        ${current.truncated ? '<p>Relatório parcial: limite de 10.000 registros atingido.</p>' : ''}
        <label class="lbl">Ordem dos provedores (separados por vírgula)</label>
        <input id="email-provider-order" value="${esc(current.config.order.join(','))}">
        <p>${current.config.order.map((n,i)=>`${i+1}: ${esc(n)}`).join(' → ')}</p>
        <table><thead><tr><th>Provedor</th><th>Estado observado</th><th>Cota</th><th>Habilitado</th></tr></thead><tbody>
        ${current.providers.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.configured ? esc(p.circuit?.status || 'Configurado; API ainda não testada') : 'Credenciais ausentes'}</td>
          <td>${esc(p.circuit?.quota?.kind || 'Desconhecida')}</td><td><input type="checkbox" data-email-provider="${esc(p.name)}" ${p.enabled?'checked':''}></td></tr>`).join('')}</tbody></table>
        <p><button class="btn btn-sm" onclick="saveEmailSystem()">Salvar ordem e habilitação</button>
        <button class="btn btn-sm" onclick="renderEmailSystem()">Atualizar / Testar provedores (configuração)</button></p>
        <label class="lbl">Destinatário do teste manual (apenas um endereço)</label><input id="email-test-to" type="email">
        <label class="lbl">Provedor para o teste</label><select id="email-test-provider"><option value="">Automático</option>
          ${current.providers.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('')}</select>
        <p><button class="btn btn-blue btn-sm" onclick="testBackendEmail()">Enviar um e-mail de teste</button>
        <button class="btn btn-sm" onclick="resetEmailCircuit()">Reabrir tentativa do provedor selecionado</button></p>
        <p>Reabra o circuito somente após corrigir credenciais ou confirmar a renovação da cota. Isso não reenvia resultados incertos.</p>
        <details><summary>Últimos 200 recibos deste mês, por destinatário</summary>
        ${current.deliveries.map(d=>`<p>${esc(d.toName)} · ${esc(d.to)} · ${esc(d.category)} / ${esc(d.noticeId)}<br>
          ${esc(d.provider || 'A escolher')} · ${esc(labels[d.status] || d.status)} · ID: ${esc(d.providerMessageId || 'Não fornecido')}<br>
          ${esc(d.attempts.map(a=>a.provider+': '+a.status+' '+(a.code||'')).join(' → '))}</p>`).join('')}</details>`;
    } catch { box.textContent = 'Não foi possível consultar. Conecte a conta de envio autorizada e confira a implantação.'; }
  };
  function configuration() {
    return {order:document.getElementById('email-provider-order').value.split(',').map(s=>s.trim()),
      enabled:Object.fromEntries(Array.from(document.querySelectorAll('[data-email-provider]')).map(n=>[n.dataset.emailProvider,n.checked]))};
  }
  root.saveEmailSystem = async () => {
    try { await root.GaiaEmailBackend.configure(configuration()); toast('Configuração salva.'); await root.renderEmailSystem(); }
    catch { toast('Não foi possível salvar. Confira a ordem, sem repetições.', 'err'); }
  };
  root.resetEmailCircuit = async () => {
    const resetProvider = document.getElementById('email-test-provider').value;
    if (!resetProvider) return toast('Selecione um provedor.', 'warn');
    try { await root.GaiaEmailBackend.configure({...configuration(), resetProvider}); await root.renderEmailSystem(); }
    catch { toast('Não foi possível reabrir o circuito.', 'err'); }
  };
  root.testBackendEmail = async () => {
    const email = document.getElementById('email-test-to').value.trim();
    if (!GaiaEmail.validEmail(email)) return toast('Informe um endereço de teste válido.', 'err');
    try {
      await root.GaiaEmailBackend.sendNotice({category:'test', entityId:crypto.randomUUID(),
        provider:document.getElementById('email-test-provider').value || undefined,
        subject:'[GAIA] Teste manual do sistema de e-mail', text:'Teste solicitado explicitamente pelo administrador do Portal GAIA.',
        recipients:[{email, name:'Teste GAIA', id:'test'}]});
      toast('Teste registrado na fila. Consulte o recibo após atualizar.');
    } catch { toast('Teste não registrado. Confira a conta de envio e o backend.', 'err'); }
  };
})(window);
