/* Shared queue for notices, calendar, reviews and tests. No messages on load. */
(function(root) {
  'use strict';
  const normalizeEmail = value => String(value || '').trim().toLowerCase();
  const validEmail = value => /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(normalizeEmail(value));
  const isMonthlyQuota = error => /monthly request quota exceeded/i.test(String(error?.text || error?.message || ''));
  function describeError(error) {
    const status = Number(error?.status) || 0;
    const text = String(error?.text || error?.message || '');
    let code = error?.code === 'EMAIL_CONFIG_MISSING' ? error.code : 'EMAIL_PROVIDER_ERROR';
    if (isMonthlyQuota(error)) code = 'EMAIL_MONTHLY_QUOTA';
    else if (status === 429) code = 'EMAIL_RATE_LIMIT';
    else if (status === 401 || /invalid.*public.?key|authentication|invalid_grant/i.test(text)) code = 'EMAIL_AUTH_ERROR';
    else if (/sender|from address|domain.*verif/i.test(text)) code = 'EMAIL_SENDER_ERROR';
    else if (error?.code === 'EMAIL_INVALID_RECIPIENT') code = error.code;
    else if (!status && code === 'EMAIL_PROVIDER_ERROR') code = 'EMAIL_RESULT_UNKNOWN';
    const messages = {
      EMAIL_CONFIG_MISSING: 'Configure Service ID, Template ID e Public Key.',
      EMAIL_MONTHLY_QUOTA: 'Cota mensal do EmailJS esgotada. Nos avisos, use a reserva Gmail após ativá-la.',
      EMAIL_RATE_LIMIT: 'Limite de velocidade do provedor atingido.',
      EMAIL_AUTH_ERROR: 'Autenticação recusada pelo serviço. Revise a conexão no EmailJS.',
      EMAIL_SENDER_ERROR: 'Remetente recusado. Revise o serviço e o template no EmailJS.',
      EMAIL_INVALID_RECIPIENT: 'E-mail ausente ou inválido.',
      EMAIL_PROVIDER_ERROR: 'O serviço recusou o envio. Confira o painel do EmailJS.',
      EMAIL_RESULT_UNKNOWN: 'Resultado incerto. Confira o provedor antes de reenviar.'
    };
    return {code, status, message:messages[code]};
  }
  function recipients(members) {
    const seen = new Set();
    return members.filter(member => {
      const address = normalizeEmail(member?.email);
      if (!member || member.active === false || !validEmail(address) || seen.has(address)) return false;
      seen.add(address);
      return true;
    });
  }
  function createQueue({send, wait = ms => new Promise(r => setTimeout(r, ms)), now = Date.now, interval = 1200}) {
    let tail = Promise.resolve(), lastStart = -Infinity, pending = 0;
    function enqueue(config, params) {
      const snapshot = {...config}, payload = {...params, to_email:normalizeEmail(params.to_email)};
      pending++;
      const job = tail.then(async () => {
        if (!snapshot.serviceId || !snapshot.templateId || !snapshot.publicKey) throw Object.assign(new Error('Configure Service ID, Template ID e Public Key.'), {code:'EMAIL_CONFIG_MISSING'});
        if (!validEmail(payload.to_email)) throw Object.assign(new Error('E-mail ausente ou inválido.'), {code:'EMAIL_INVALID_RECIPIENT'});
        for (let attempt = 0; ; attempt++) {
          await wait(Math.max(0, interval - (now() - lastStart)));
          lastStart = now();
          try { return await send(snapshot, payload); }
          catch (error) {
            // Only retry a definite rate-limit refusal, never an ambiguous timeout.
            if (isMonthlyQuota(error) || Number(error?.status) !== 429 || attempt >= 2) throw error;
            await wait(2000 * (attempt + 1));
          }
        }
      });
      tail = job.then(() => {
        console.info('[email] provider=emailjs status=accepted recipients=1');
      }, error => {
        const safe = describeError(error);
        console.error('[email] provider=emailjs status=failed recipients=1 code=' + safe.code + ' http=' + safe.status);
      }).finally(() => { pending--; });
      return job;
    }
    return {enqueue, get pending() { return pending; }};
  }
  const api = {normalizeEmail, validEmail, isMonthlyQuota, describeError, recipients, createQueue};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GaiaEmail = api;
})(typeof window !== 'undefined' ? window : globalThis);
