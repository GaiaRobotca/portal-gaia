import core from '../functions/core.js';
import adapter from '../functions/providers.js';
import {createD1Store} from './store.js';
import {verifyAdministrator} from './auth.js';
import {reserveNotice} from './legacy.js';
const {EmailRouter,enqueue,normalize} = core;
const {NAMES,createProviders} = adapter;
function response(data,status,origin) {
  return new Response(status === 204 ? null : JSON.stringify(data),{status,headers:{'Content-Type':'application/json', 'Cache-Control':'no-store',
    ...(origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type',
      'Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}});
}
async function runtime(env) {
  const store = createD1Store(env.DB), saved = await store.get('config') || {};
  return {store,config:{order:saved.order || (env.EMAIL_PROVIDER_ORDER || NAMES.join(',')).split(','), enabled:saved.enabled || {}},
    providers:createProviders(JSON.parse(env.EMAIL_PROVIDER_SECRETS || '{}')),
    logger:entry=>console.info(JSON.stringify({component:'email',...entry}))};
}
async function report(env, rt) {
  const month = Date.parse(new Date().toISOString().slice(0,7)+'-01T00:00:00Z');
  const day = Date.parse(new Date().toISOString().slice(0,10)+'T00:00:00Z');
  const grouped = await env.DB.prepare("SELECT status,provider,CASE WHEN updated_at >= ? THEN 1 ELSE 0 END AS today,COUNT(*) AS total FROM state WHERE kind = 'deliveries' AND updated_at >= ? GROUP BY status,provider,today").bind(day,month).all();
  const bucket = ()=>({accepted:0,delivered:0,failed:0,unknown:0,pending:0,sending:0,providers:{}});
  const stats = {timezone:'UTC',today:bucket(),month:bucket()};
  for (const g of grouped.results) for (const b of g.today?[stats.today,stats.month]:[stats.month]) {
    if (typeof b[g.status] === 'number') b[g.status] += g.total;
    if (g.provider && ['accepted','delivered'].includes(g.status)) b.providers[g.provider]=(b.providers[g.provider]||0)+g.total;
  }
  const rows = await env.DB.prepare("SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.noticeId') AS noticeId,json_extract(value,'$.to') AS 'to',json_extract(value,'$.toName') AS toName,json_extract(value,'$.category') AS category,status,provider,json_extract(value,'$.providerMessageId') AS providerMessageId,json_extract(value,'$.error') AS error,json_extract(value,'$.attempts') AS attempts,updated_at AS updatedAt FROM state WHERE kind='deliveries' AND updated_at >= ? ORDER BY updated_at DESC LIMIT 200").bind(month).all();
  return {config:rt.config,statistics:stats,truncated:false,processing:{maxRecipientsPerMinute:1},
    providers:await Promise.all(NAMES.map(async name=>({...rt.providers[name].getStatus(),enabled:!!rt.config.enabled[name],circuit:await rt.store.get('providers/'+name)}))),
    deliveries:rows.results.map(d=>({...d,attempts:JSON.parse(d.attempts || '[]')}))};
}
export default {
  async fetch(request,env) {
    const origin = request.headers.get('Origin');
    if (origin !== env.PORTAL_ORIGIN) return response({error:'origin_denied'},403);
    if (request.method === 'OPTIONS') return response({},204,origin);
    if (request.method !== 'POST') return response({error:'method_not_allowed'},405,origin);
    if (Number(request.headers.get('content-length')) > 100000) return response({error:'too_large'},413,origin);
    let identity;
    try { identity = await verifyAdministrator(request,env); }
    catch { return response({error:'unauthorized'},401,origin); }
    try {
      const text = await request.text();
      if (text.length > 100000) return response({error:'too_large'},413,origin);
      const data = JSON.parse(text), rt = await runtime(env), action = new URL(request.url).pathname;
      if (action === '/sendEmail') {
        normalize(data);
        // Stay within the free per-invocation database-query budget. The client chunks larger audiences.
        if (data.recipients.length > 15) return response({error:'maximum_15_recipients_per_request'},400,origin);
        await reserveNotice(data,identity.idToken,env);
        return response({deliveries:await enqueue(rt.store,data)},200,origin);
      }
      if (action === '/emailSystemStatus') return response(await report(env,rt),200,origin);
      if (action === '/configureEmailSystem') {
        const {order,enabled,resetProvider} = data;
        if (!Array.isArray(order) || order.length !== NAMES.length || new Set(order).size !== NAMES.length ||
          order.some(n=>!NAMES.includes(n)) || !enabled || NAMES.some(n=>typeof enabled[n] !== 'boolean') ||
          (resetProvider && !NAMES.includes(resetProvider))) return response({error:'invalid_configuration'},400,origin);
        await rt.store.tx('config',()=>({order,enabled,updatedAt:Date.now(),updatedBy:identity.auth.uid}));
        if (resetProvider) await rt.store.tx('providers/'+resetProvider,old=>old?.busyUntil>Date.now()?undefined:
          {...old,manual:false,openUntil:0,status:'not_checked',updatedAt:Date.now()});
        return response({saved:true},200,origin);
      }
      return response({error:'not_found'},404,origin);
    } catch { return response({error:'request_not_completed_check_receipts_before_retry'},409,origin); }
  },
  async scheduled(controller,env) {
    // One durable recipient per tick keeps the free CPU/query budget bounded. No new messages are admitted here.
    const rt = await runtime(env), router = new EmailRouter(rt);
    const pending = await env.DB.prepare("SELECT path FROM state WHERE kind='deliveries' AND status='pending' AND next_at <= ? ORDER BY next_at LIMIT 1").bind(Date.now()).first();
    if (pending) await router.process(pending.path.slice('deliveries/'.length));
    const stale = await env.DB.prepare("SELECT path FROM state WHERE kind='deliveries' AND status='sending' AND updated_at <= ? ORDER BY updated_at LIMIT 1").bind(Date.now()-600000).first();
    if (stale) await router.recover(stale.path.slice('deliveries/'.length));
  }
};
