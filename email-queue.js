/* Shared queue for notices, calendar, reviews and tests. No messages on load. */
(function(root) {
  'use strict';
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const validEmail = value => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalizeEmail(value));
  function createQueue({send, wait = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, interval = 1200}) {
    let tail = Promise.resolve(), lastStart = -Infinity, pending = 0;
    function enqueue(config, params) {
      const snapshot = {...config}, payload = {...params, to_email:normalizeEmail(params.to_email)};
      pending++;
      const job = tail.then(async () => {
        if (!snapshot.serviceId || !snapshot.templateId || !snapshot.publicKey) throw new Error('Configure Service ID, Template ID e Public Key.');
        if (!validEmail(payload.to_email)) throw new Error('E-mail ausente ou inválido.');
        for (let attempt = 0; ; attempt++) {
          await wait(Math.max(0, interval - (now() - lastStart)));
          lastStart = now();
          try { return await send(snapshot, payload); }
          catch (error) {
            // Only retry a definite rate-limit refusal, never an ambiguous timeout.
            if (Number(error.status) !== 429 || attempt >= 2) throw error;
            await wait(2000 * (attempt + 1));
          }
        }
      });
      tail = job.catch(() => {}).finally(() => { pending--; });
      return job;
    }
    return {enqueue, get pending() { return pending; }};
  }
  const api = {normalizeEmail, validEmail, createQueue};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GaiaEmail = api;
})(typeof window !== 'undefined' ? window : globalThis);
