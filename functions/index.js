'use strict';
const {initializeApp} = require('firebase-admin/app');
const {getDatabase} = require('firebase-admin/database');
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {onValueCreated} = require('firebase-functions/v2/database');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {defineSecret} = require('firebase-functions/params');
const {setGlobalOptions} = require('firebase-functions/v2');
const {createProviders, NAMES} = require('./providers');
const {EmailRouter, enqueue, normalize, authorize, statistics} = require('./core');
const {createFirebaseStore} = require('./firebase-store');
initializeApp();
setGlobalOptions({region:'us-central1', maxInstances:2, timeoutSeconds:120, memory:'256MiB'});
const credentials = defineSecret('EMAIL_PROVIDER_SECRETS');
const options = {secrets:[credentials]};
const root = () => getDatabase().ref('email_system');
const store = createFirebaseStore(root);
function check(request) {
  const emails = (process.env.EMAIL_ADMIN_EMAILS || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
  try { authorize(request.auth, emails); }
  catch { throw new HttpsError('permission-denied', 'Conecte a conta verificada autorizada para envio.'); }
}
async function runtime() {
  const saved = await store.get('config') || {};
  const order = (process.env.EMAIL_PROVIDER_ORDER || 'mailjet,smtp2go,resend,brevo,emailjs').split(',').map(s=>s.trim());
  const config = {order:saved.order || order, enabled:saved.enabled || {}};
  return {config, providers:createProviders(JSON.parse(credentials.value())), store,
    logger:entry => console.info(JSON.stringify({component:'email', ...entry}))};
}
async function protectLegacy(input) {
  if (input.category !== 'notice') return;
  const db = getDatabase();
  const notices = (await db.ref('gaia_v7/notices').get()).val() || [];
  const notice = Object.values(notices).find(n=>n?.id === input.entityId);
  if (!notice || notice.emailSent || Object.keys(notice.emailDelivery || {}).length)
    throw new HttpsError('failed-precondition', 'Migração bloqueada: aviso antigo ou com tentativas no fluxo legado. Confira os recibos antes de reenviar.');
  const route = await db.ref('gaia_notice_routes/' + input.entityId).transaction(old =>
    !old ? {provider:'backend', status:'reserved', updatedAt:Date.now()} : undefined);
  if (!route.committed && route.snapshot.val()?.provider !== 'backend')
    throw new HttpsError('failed-precondition', 'Aviso já pertence ao fluxo EmailJS/Gmail.');
}
exports.sendEmail = onCall(options, async request => {
  check(request);
  try {
    normalize(request.data); // Validate everything before reserving a legacy notice.
    await protectLegacy(request.data);
    return {deliveries:await enqueue(store, request.data)};
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    throw new HttpsError(['invalid-argument','already-exists'].includes(e.code) ? e.code : 'internal',
      e.code === 'already-exists' ? 'Entrega já registrada com outro conteúdo.' : 'Não foi possível registrar o envio. Confira os dados e o painel.');
  }
});
exports.processEmailQueue = onValueCreated({...options, ref:'/email_system/deliveries/{deliveryId}', retry:true}, async event => {
  const router = new EmailRouter(await runtime());
  await router.process(event.params.deliveryId);
});
exports.recoverEmailQueue = onSchedule({...options, schedule:'every 1 minutes', maxInstances:1}, async () => {
  const router = new EmailRouter(await runtime());
  const pending = (await root().child('deliveries').orderByChild('nextAttemptAt').startAt(0).endAt(Date.now()).limitToFirst(6).get()).val() || {};
  for (const id of Object.keys(pending)) {
    await router.process(id);
    await new Promise(resolve=>setTimeout(resolve,1200)); // Server pacing; never admits a new message.
  }
  const sending = (await root().child('deliveries').orderByChild('status').equalTo('sending').limitToFirst(50).get()).val() || {};
  for (const id of Object.keys(sending)) await router.recover(id);
});
exports.emailSystemStatus = onCall(options, async request => {
  check(request);
  const {config, providers} = await runtime();
  const circuits = await store.get('providers') || {};
  // Bound the report to this UTC month; retain older receipts permanently, outside this response.
  const start = Date.parse(new Date().toISOString().slice(0,7) + '-01T00:00:00Z');
  const records = (await root().child('deliveries').orderByChild('updatedAt').startAt(start).limitToLast(10000).get()).val() || {};
  const entries = Object.values(records);
  return {config, providers:NAMES.map(name=>({...providers[name].getStatus(), enabled:!!config.enabled[name], circuit:circuits[name] || null})),
    statistics:statistics(entries), truncated:entries.length === 10000,
    deliveries:entries.sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,200).map(d=>({id:d.id, noticeId:d.noticeId,
      to:d.to, toName:d.toName, category:d.category, provider:d.provider, providerMessageId:d.providerMessageId || null,
      status:d.status, error:d.error || null, attempts:d.attempts || [], updatedAt:d.updatedAt}))};
});
exports.configureEmailSystem = onCall(options, async request => {
  check(request);
  const {order, enabled, resetProvider} = request.data || {};
  if (!Array.isArray(order) || order.length !== NAMES.length || new Set(order).size !== NAMES.length ||
    order.some(n=>!NAMES.includes(n)) || !enabled || NAMES.some(n=>typeof enabled[n] !== 'boolean'))
    throw new HttpsError('invalid-argument', 'Informe todos os provedores e uma ordem sem repetições.');
  if (resetProvider && !NAMES.includes(resetProvider)) throw new HttpsError('invalid-argument', 'Provedor inválido.');
  await root().child('config').set({order, enabled, updatedAt:Date.now(), updatedBy:request.auth.uid});
  // Explicit operator action after fixing credentials/quota. Does not retry uncertain deliveries.
  if (resetProvider) await store.tx('providers/' + resetProvider, old => {
    if (old?.busyUntil > Date.now()) return;
    return {...old, manual:false, openUntil:0, status:'not_checked', updatedAt:Date.now()};
  });
  return {saved:true};
});
