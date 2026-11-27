import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {createD1Store} from '../worker/store.js';
import {verifyAdministrator} from '../worker/auth.js';
import {reserveNotice} from '../worker/legacy.js';
import worker from '../worker/index.js';
import core from '../functions/core.js';
const runtimeRequire=createRequire(new URL('../worker/package.json',import.meta.url));
const {Miniflare,convertV4MiniflareOptions}=runtimeRequire('miniflare');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("offline");}}',d1Databases:{DB:'gaia-email-test'}}));
after(()=>mf.dispose());
let db;
async function database(){
  if(!db){db=await mf.getD1Database('DB');for(const sql of readFileSync(new URL('../worker/migrations/0001_email.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await db.prepare(sql).run();}
  return db;
}
const input=id=>({category:'test',entityId:id,subject:'Synthetic',text:'Offline only',recipients:[{email:'test@example.org',name:'Synthetic'}]});
const token=(extra={})=>'e30.'+Buffer.from(JSON.stringify({aud:'demo-gaia',iss:'https://securetoken.google.com/demo-gaia',sub:'owner',
  exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),...extra})).toString('base64url')+'.synthetic';
const authEnv={FIREBASE_WEB_API_KEY:'synthetic',FIREBASE_PROJECT_ID:'demo-gaia',EMAIL_ADMIN_EMAILS:'owner@example.org'};
test('real local D1 atomic CAS preserves one admission and send under ten concurrent workers',async()=>{
  const store=createD1Store(await database());
  const all=await Promise.all(Array.from({length:10},()=>core.enqueue(store,input('d1-concurrency'))));
  assert.equal(new Set(all.map(r=>r[0].id)).size,1);
  let sent=0;
  const router=new core.EmailRouter({store,config:{order:['mock'],enabled:{mock:true}},providers:{mock:{getStatus:()=>({configured:true}),
    send:async()=>{sent++;return {status:'accepted',code:'accepted',providerMessageId:'local-mock'};}}}});
  await Promise.all(all.map(r=>router.process(r[0].id)));
  assert.equal(sent,1);assert.equal((await store.get('deliveries/'+all[0][0].id)).providerMessageId,'local-mock');
});
test('Firebase identity is validated by Google lookup, not untrusted JWT email claims',async()=>{
  const request=t=>new Request('https://worker.test',{headers:{Authorization:'Bearer '+t}});
  let calls=0;
  const lookup=async()=>{calls++;return Response.json({users:[{localId:'owner',email:'owner@example.org',emailVerified:true}]});};
  await verifyAdministrator(request(token()),authEnv,lookup);assert.equal(calls,1);
  await assert.rejects(verifyAdministrator(request(token({aud:'other'})),authEnv,lookup));assert.equal(calls,1);
  await assert.rejects(verifyAdministrator(request(token()),authEnv,async()=>Response.json({users:[{localId:'owner',email:'other@example.org',emailVerified:true}]})));
  await assert.rejects(verifyAdministrator(request(token()),authEnv,async()=>Response.json({users:[{localId:'owner',email:'owner@example.org',emailVerified:false}]})));
  await assert.rejects(verifyAdministrator(request(token()),authEnv,async()=>Response.json({}, {status:400})));
});
test('legacy route uses ETag CAS and never takes an existing EmailJS/Gmail route',async()=>{
  const env={FIREBASE_DATABASE_URL:'https://demo-gaia-default-rtdb.firebaseio.com'};
  const notice={...input('notice1'),category:'notice'};
  let writes=0;
  const transport=async(url,options)=>{
    if(url.includes('gaia_v7'))return Response.json([{id:'notice1',emailDelivery:{}}]);
    if(options.method==='PUT'){writes++;assert.equal(options.headers['if-match'],'"synthetic-etag"');return Response.json({});}
    return Response.json(null,{headers:{etag:'"synthetic-etag"'}});
  };
  await reserveNotice(notice,'synthetic-token',env,transport);assert.equal(writes,1);
  await assert.rejects(reserveNotice(notice,'synthetic-token',env,async(url)=>url.includes('gaia_v7')?Response.json([{id:'notice1'}]):Response.json({provider:'apps-script'})));
});
test('worker HTTP CORS, owner auth, configuration, queue and cron acceptance use no real services',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    if(String(url).startsWith('https://identitytoolkit.googleapis.com/'))return Response.json({users:[{localId:'owner',email:'owner@example.org',emailVerified:true}]});
    if(String(url)==='https://api.mailjet.com/v3.1/send')return Response.json({Messages:[{Status:'success',To:[{MessageID:123}]}]});
    throw Error('Unexpected outbound request in offline test');
  };
  try {
    const env={...authEnv,DB:await database(),PORTAL_ORIGIN:'https://gaia.test',EMAIL_PROVIDER_SECRETS:JSON.stringify({mailjet:{apiKey:'synthetic',secretKey:'synthetic',from:'owner@example.org'}})};
    const request=(action,data,origin='https://gaia.test',auth=true)=>new Request('https://worker.test/'+action,{method:'POST',
      headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token()}:{})},body:JSON.stringify(data)});
    assert.equal((await worker.fetch(request('emailSystemStatus',{},'https://other.test'),env)).status,403);
    assert.equal((await worker.fetch(request('emailSystemStatus',{},'https://gaia.test',false),env)).status,401);
    assert.equal((await worker.fetch(new Request('https://worker.test',{method:'OPTIONS',headers:{Origin:'https://gaia.test'}}),env)).status,204);
    const names=['mailjet','smtp2go','resend','brevo','emailjs'];
    assert.equal((await worker.fetch(request('configureEmailSystem',{order:names,enabled:Object.fromEntries(names.map(n=>[n,n==='mailjet']))}),env)).status,200);
    const admitted=await worker.fetch(request('sendEmail',input('http-cron')),env);assert.equal(admitted.status,200);
    const id=(await admitted.json()).deliveries[0].id;
    await worker.scheduled({},env);
    assert.equal((await createD1Store(env.DB).get('deliveries/'+id)).status,'accepted');
    const result=await worker.fetch(request('emailSystemStatus',{}),env);assert.equal(result.status,200);
    const report=await result.json();assert.ok(report.statistics.today.accepted>=1);
    assert.ok(report.deliveries.some(d=>d.id===id&&d.providerMessageId==='123'));
  } finally {globalThis.fetch=originalFetch;}
});
test('built Cloudflare bundle starts in workerd and serves CORS without secrets or network',async()=>{
  const compiled = new Miniflare(convertV4MiniflareOptions({modules:true,name:'compiled-gaia',
    scriptPath:new URL('../worker/.wrangler/build/index.js',import.meta.url).pathname.replace(/^\/([A-Z]:)/,'$1'),
    compatibilityDate:'2026-10-29',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'compiled-gaia'},bindings:{PORTAL_ORIGIN:'https://gaia.test'}}));
  try {
    assert.equal((await compiled.dispatchFetch('https://worker.test/',{method:'OPTIONS',headers:{Origin:'https://gaia.test'}})).status,204);
    assert.equal((await compiled.dispatchFetch('https://worker.test/',{method:'POST',headers:{Origin:'https://other.test'}})).status,403);
  } finally {await compiled.dispose();}
});
test('actual browser transport sends Firebase token only to configured workers.dev and chunks without load-time sends',async()=>{
  const calls=[];
  const root={GAIA_EMAIL_BACKEND:{enabled:true,transport:'cloudflare',endpoint:'https://gaia-email.synthetic.workers.dev'},
    GaiaMailAccess:{requireUser:async()=>({getIdToken:async()=>'synthetic-id-token'})}};
  const context={window:root,fetch:async(url,options)=>{
    calls.push({url,options});const payload=JSON.parse(options.body);
    return Response.json({deliveries:(payload.recipients||[]).map(r=>({id:r.email,status:'pending'}))});
  }};
  vm.runInNewContext(readFileSync(new URL('../email-backend.js',import.meta.url),'utf8'),context);
  assert.equal(calls.length,0);
  await root.GaiaEmailBackend.sendNotice({...input('transport'),recipients:Array.from({length:31},(_,i)=>({email:`m${i}@example.org`}))});
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.url==='https://gaia-email.synthetic.workers.dev/sendEmail'&&c.options.headers.Authorization==='Bearer synthetic-id-token'));
  assert.deepEqual(calls.map(c=>JSON.parse(c.options.body).recipients.length),[15,15,1]);
});
