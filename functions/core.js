'use strict';
const {createHash, randomUUID} = require('node:crypto');
const {NAMES} = require('./providers');
const hash = v => createHash('sha256').update(v).digest('hex');
const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const validEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(s);
function authorize(auth, emails) {
  if (!auth?.uid || auth.token?.email_verified !== true || !emails.includes(auth.token.email?.toLowerCase()))
    throw Object.assign(new Error('Verified mail administrator required'), {code:'permission-denied'});
}
function normalize(input) {
  if (!input || !['notice','event','review','test'].includes(input.category) ||
    !/^[A-Za-z0-9_-]{1,120}$/.test(input.entityId || '') ||
    typeof input.subject !== 'string' || !input.subject.trim() || input.subject.length > 200 ||
    typeof input.text !== 'string' || !input.text.trim() || input.text.length > 20000 ||
    !Array.isArray(input.recipients) || !input.recipients.length || input.recipients.length > 100)
    throw Object.assign(new Error('Invalid message'), {code:'invalid-argument'});
  if (input.provider && (input.category !== 'test' || !NAMES.includes(input.provider)))
    throw Object.assign(new Error('Manual provider is restricted to tests'), {code:'invalid-argument'});
  if (input.category === 'test' && input.recipients.length !== 1) throw new Error('One test recipient required');
  const seen = new Set();
  return input.recipients.flatMap(r => {
    const to = String(r?.email || '').trim().toLowerCase();
    if (!validEmail(to)) throw Object.assign(new Error('Invalid recipient'), {code:'invalid-argument'});
    if (seen.has(to)) return [];
    seen.add(to);
    // Address-level identity also prevents two member records delivering twice to the same mailbox.
    const id = hash(input.category + ':' + input.entityId + ':' + to);
    return [{id, noticeId:input.entityId, memberId:String(r.id || '').slice(0,120), to,
      toName:String(r.name || '').slice(0,120), subject:input.subject.trim(), text:input.text,
      html:'<p>' + escape(input.text).replace(/\n/g,'<br>') + '</p>', category:input.category,
      metadata:{entityId:input.entityId}, requestedProvider:input.provider || null}];
  });
}
function fingerprint(m) { return hash(JSON.stringify([m.to, m.subject, m.text, m.requestedProvider])); }
async function enqueue(store, input, now = Date.now()) {
  const messages = normalize(input);
  const records = [];
  for (const m of messages) {
    const key = 'deliveries/' + m.id;
    const fp = fingerprint(m);
    const r = await store.tx(key, old => old ? undefined : {...m, fingerprint:fp, status:'pending', attempts:[],
      provider:null, providerMessageId:null, createdAt:now, updatedAt:now, nextAttemptAt:now});
    const value = r.value || await store.get(key);
    if (value.fingerprint !== fp) throw Object.assign(new Error('Existing delivery has different content'), {code:'already-exists'});
    records.push({id:m.id, status:value.status, duplicate:!r.committed});
  }
  return records;
}
class EmailRouter {
  constructor({store, providers, config, now = Date.now, logger = () => {}}) {
    Object.assign(this, {store, providers, config, now, logger});
  }
  async process(id) {
    const key = 'deliveries/' + id, token = randomUUID(), now = this.now();
    const claim = await this.store.tx(key, d => d?.status === 'pending' && d.nextAttemptAt <= now
      ? {...d, status:'sending', claim:token, updatedAt:now, nextAttemptAt:null} : undefined);
    if (!claim.committed) return;
    const message = claim.value;
    const finish = async (status, extra = {}) => {
      await this.store.tx(key, d => d?.claim === token && d.status === 'sending'
        ? {...d, nextAttemptAt:null, ...extra, status, updatedAt:this.now()} : undefined);
      this.logger({deliveryId:id, status, provider:extra.provider || null, code:extra.error || null});
    };
    const order = message.requestedProvider ? [message.requestedProvider] : this.config.order;
    let attempted = false;
    for (const name of order) {
      const provider = this.providers[name];
      if (!provider || !this.config.enabled[name] || !provider.getStatus().configured) continue;
      const start = this.now(), permit = randomUUID();
      const gate = await this.store.tx('providers/' + name, state => {
        const s = state || {};
        if (s.manual || s.openUntil > start || s.busyUntil > start || s.nextAllowedAt > start) return;
        return {...s, permit, busyUntil:start + 120000, nextAllowedAt:start + 1200, status:'probing'};
      });
      if (!gate.committed) continue;
      // Persist the attempt BEFORE submitting. A crash here becomes unknown, never an automatic retry.
      const recorded = await this.store.tx(key, d => d?.claim === token && d.status === 'sending'
        ? {...d, provider:name, updatedAt:start, attempts:[...(d.attempts || []),
          {id:permit, provider:name, status:'sending', createdAt:start}]} : undefined);
      if (!recorded.committed) return;
      attempted = true;
      let outcome;
      try { outcome = await provider.send(message); }
      catch { outcome = {status:'unknown', code:'adapter_uncertain'}; }
      if (!['accepted','rejected','failed','unknown'].includes(outcome?.status)) outcome = {status:'unknown', code:'adapter_uncertain'};
      const completedAt = this.now();
      // This durable result is also the crash-recovery evidence for safe, explicit rejections.
      await this.store.tx(key, d => d?.claim === token && d.status === 'sending'
        ? {...d, updatedAt:completedAt, attempts:d.attempts.map(a => a.id === permit ? {...a,
          status:outcome.status, code:outcome.code, completedAt, providerMessageId:outcome.providerMessageId || null} : a)} : undefined);
      await this.store.tx('providers/' + name, s => s?.permit === permit ? {...s, busyUntil:0,
        status:outcome.status === 'accepted' ? 'last_accepted' : 'unavailable',
        manual:outcome.circuit === 'manual' || outcome.status === 'failed',
        openUntil:outcome.status === 'accepted' ? 0 : completedAt + (outcome.cooldownMs || 300000),
        lastCode:outcome.code, updatedAt:completedAt,
        quota:{kind:outcome.code === 'quota_exceeded' ? 'known_exhausted' : 'unknown', remaining:outcome.code === 'quota_exceeded' ? 0 : null}}
        : undefined);
      if (outcome.status === 'accepted') return finish('accepted', {provider:name, providerMessageId:outcome.providerMessageId || null});
      if (outcome.status === 'unknown') return finish('unknown', {provider:name, error:outcome.code});
      if (outcome.status === 'failed') return finish('failed', {provider:name, error:outcome.code});
      // Only explicit, whitelisted rejection outcomes authorize trying a different provider.
      if (!['rate_limited','authentication','quota_exceeded','not_configured','unavailable_before_submit'].includes(outcome.code))
        return finish('unknown', {provider:name, error:'unclassified_rejection'});
    }
    return finish('pending', {nextAttemptAt:this.now() + 60000, error:attempted ? 'providers_rejected' : 'no_provider_available'});
  }
  async recover(id) {
    const now = this.now();
    return this.store.tx('deliveries/' + id, d => {
      if (d?.status !== 'sending' || d.updatedAt > now - 600000) return;
      const last = (d.attempts || []).at(-1);
      if (last?.status === 'accepted') return {...d, status:'accepted', providerMessageId:last.providerMessageId || null, updatedAt:now};
      // Recovery never guesses whether a crashed network operation was accepted.
      return {...d, status:'unknown', error:'worker_interrupted', updatedAt:now};
    });
  }
}
function statistics(records, now = Date.now()) {
  const current = new Date(now), day = current.toISOString().slice(0,10), month = day.slice(0,7);
  const bucket = () => ({accepted:0, delivered:0, failed:0, unknown:0, pending:0, sending:0, providers:{}});
  const today = bucket(), monthly = bucket();
  for (const d of records) {
    const date = new Date(d.updatedAt).toISOString();
    for (const [match, b] of [[date.startsWith(day),today], [date.startsWith(month),monthly]]) {
      if (!match) continue;
      if (d.status in b && typeof b[d.status] === 'number') b[d.status]++;
      if (['accepted','delivered'].includes(d.status) && d.provider) b.providers[d.provider] = (b.providers[d.provider] || 0) + 1;
    }
  }
  return {timezone:'UTC', today, month:monthly};
}
module.exports = {EmailRouter, enqueue, normalize, authorize, statistics, hash};
