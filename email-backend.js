(function(root) {
  'use strict';
  function createClient({enabled, call, requireUser}) {
    return {
      enabled,
      async sendNotice(message) {
        if (!enabled) throw new Error('Backend de e-mail ainda não ativado.');
        await requireUser();
        return call('sendEmail', message);
      },
      async status() { await requireUser(); return call('emailSystemStatus', {}); },
      async configure(data) { await requireUser(); return call('configureEmailSystem', data); }
    };
  }
  if (typeof module === 'object') { module.exports = {createClient}; return; }
  const cfg = root.GAIA_EMAIL_BACKEND || {};
  root.GaiaEmailBackend = createClient({enabled:cfg.enabled === true,
    requireUser:()=>root.GaiaMailAccess.requireUser(),
    call:async (name, data) => (await firebase.app().functions(cfg.region || 'us-central1').httpsCallable(name)(data)).data});
})(typeof window === 'undefined' ? globalThis : window);
