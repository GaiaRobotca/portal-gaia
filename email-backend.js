(function(root) {
  'use strict';
  function createClient({enabled, call, requireUser, batchSize = 100}) {
    return {
      enabled,
      async sendNotice(message) {
        if (!enabled) throw new Error('Backend de e-mail ainda não ativado.');
        await requireUser();
        const deliveries = [];
        for (let offset = 0; offset < message.recipients.length; offset += batchSize) {
          const result = await call('sendEmail', {...message,recipients:message.recipients.slice(offset,offset+batchSize)});
          deliveries.push(...(result.deliveries || []));
        }
        return {deliveries};
      },
      async status() { await requireUser(); return call('emailSystemStatus', {}); },
      async configure(data) { await requireUser(); return call('configureEmailSystem', data); }
    };
  }
  if (typeof module === 'object') { module.exports = {createClient}; return; }
  const cfg = root.GAIA_EMAIL_BACKEND || {};
  root.GaiaEmailBackend = createClient({enabled:cfg.enabled === true,
    batchSize:cfg.transport === 'cloudflare' ? 15 : 100,
    requireUser:()=>root.GaiaMailAccess.requireUser(),
    call:async (name, data) => {
      if (cfg.transport !== 'cloudflare') return (await firebase.app().functions(cfg.region || 'us-central1').httpsCallable(name)(data)).data;
      if (!/^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev\/?$/.test(cfg.endpoint || '')) throw new Error('Endpoint do backend não configurado.');
      const user = await root.GaiaMailAccess.requireUser();
      const result = await fetch(cfg.endpoint.replace(/\/$/,'')+'/'+name,{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify(data)});
      if (!result.ok) throw new Error('Solicitação não concluída. Confira os recibos antes de repetir.');
      return result.json();
    }});
})(typeof window === 'undefined' ? globalThis : window);
