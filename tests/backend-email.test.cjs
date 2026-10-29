'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EmailRouter, enqueue, normalize, authorize, statistics} = require('../functions/core');
const {createProviders} = require('../functions/providers');
const {createClient} = require('../email-backend');
class Store {
  data = {};
  async get(k) { return structuredClone(this.data[k] || null); }
  async tx(k, fn) {
    const next = fn(structuredClone(this.data[k] || null));
    if (next === undefined) return {committed:false, value:await this.get(k)};
    this.data[k] = structuredClone(next);
    return {committed:true, value:structuredClone(next)};
  }
}
const input = (id='n1', email='a@example.org') => ({category:'notice', entityId:id, subject:'Synthetic notice', text:'Synthetic body',
  recipients:[{id:'m1', email, name:'Synthetic member'}]});

test('Mailjet refuses Gmail From before submission; Brevo preserves replies when sender is rewritten',async()=>{
  let calls=0,body;
  const transport=async(_url,options)=>{calls++;body=JSON.parse(options.body);return new Response(JSON.stringify({messageId:'synthetic-brevo-id'}),{status:201});};
  const providers=createProviders({mailjet:{apiKey:'synthetic',secretKey:'synthetic',from:' GAIA@gmail.com '},
    brevo:{apiKey:'synthetic',from:'gaia@gmail.com'}},transport);
  const message=normalize(input())[0];
  assert.deepEqual(await providers.mailjet.send(message),{status:'failed',code:'sender_domain_authentication_required'});
  assert.equal(calls,0);
  assert.equal((await providers.brevo.send(message)).status,'accepted');
  assert.equal(body.replyTo.email,'gaia@gmail.com');
  assert.equal(calls,1);
});
async function fixture(outcomes={}, shared) {
  let time = 1000000000;
  const store = shared || new Store(), calls = [];
  const providers = Object.fromEntries(['resend','brevo','smtp2go'].map(name=>[name, {
    getStatus:()=>({configured:true}), send:async m=>{calls.push({name,id:m.id});
      const value = outcomes[name] || {status:'accepted', code:'accepted', providerMessageId:name+'-receipt'};
      return typeof value === 'function' ? value(m) : value; }}]));
  const router = new EmailRouter({store, providers, now:()=>time, config:{order:['resend','brevo','smtp2go'],
    enabled:{resend:true,brevo:true,smtp2go:true}}});
  const add = async id => (await enqueue(store,input(id),time))[0].id;
  return {store,calls,router,add,advance:ms=>time+=ms};
}
test('primary acceptance calls only primary and stores provider receipt',async()=>{
  const f=await fixture(),id=await f.add('one'); await f.router.process(id);
  assert.deepEqual(f.calls.map(x=>x.name),['resend']);
  assert.equal((await f.store.get('deliveries/'+id)).providerMessageId,'resend-receipt');
  assert.equal((await f.store.get('deliveries/'+id)).status,'accepted');
});
test('quota opens persistent circuit; next member skips primary across router instances',async()=>{
  const f=await fixture({resend:{status:'rejected',code:'quota_exceeded',circuit:'manual'}});
  await f.router.process(await f.add('one')); f.advance(2000);
  const next=await fixture({},f.store); next.advance(2000); await next.router.process(await next.add('two'));
  assert.deepEqual(f.calls.map(x=>x.name),['resend','brevo']);
  assert.deepEqual(next.calls.map(x=>x.name),['brevo']);
  assert.equal((await f.store.get('providers/resend')).manual,true);
});
test('two explicit rejections reach third provider',async()=>{
  const f=await fixture({resend:{status:'rejected',code:'authentication',circuit:'manual'},brevo:{status:'rejected',code:'rate_limited'}});
  await f.router.process(await f.add('one'));
  assert.deepEqual(f.calls.map(x=>x.name),['resend','brevo','smtp2go']);
});
test('ambiguous timeout stops all failover and all automatic retries',async()=>{
  const f=await fixture({resend:()=>{throw Error('socket reset');}}),id=await f.add('one');
  await f.router.process(id); f.advance(9999999); await f.router.process(id); await f.router.recover(id);
  assert.equal((await f.store.get('deliveries/'+id)).status,'unknown');
  assert.equal(f.calls.length,1);
});
test('ten concurrent submissions and dispatchers create one delivery and one network submission',async()=>{
  const f=await fixture(); const all=await Promise.all(Array.from({length:10},()=>f.add('one')));
  assert.equal(new Set(all).size,1);
  await Promise.all(all.map(id=>f.router.process(id)));
  assert.equal(f.calls.length,1);
});
test('same address in two member records is deduplicated; content mutation cannot reuse identity',async()=>{
  const store=new Store(),p=input(); p.recipients.push({id:'m2',email:'A@EXAMPLE.ORG'});
  assert.equal((await enqueue(store,p)).length,1);
  await assert.rejects(enqueue(store,{...p,text:'Modified body'}),{code:'already-exists'});
});
test('all providers unavailable preserves pending; recovery of interrupted worker is unknown',async()=>{
  const f=await fixture(); f.router.config.enabled={}; const id=await f.add('one'); await f.router.process(id);
  assert.equal((await f.store.get('deliveries/'+id)).status,'pending'); assert.equal(f.calls.length,0);
  await f.store.tx('deliveries/'+id,d=>({...d,status:'sending',updatedAt:0,attempts:[{status:'sending'}]}));
  await f.router.recover(id); assert.equal((await f.store.get('deliveries/'+id)).status,'unknown');
});
test('acceptance survives crash before final status commit without sending again',async()=>{
  const f=await fixture(),id=await f.add('one');
  const tx=f.store.tx.bind(f.store); let failed=false;
  f.store.tx=async(k,fn)=>tx(k,d=>{const n=fn(d);if(n?.status==='accepted'&&!failed){failed=true;throw Error('storage down');}return n;});
  await assert.rejects(f.router.process(id)); f.advance(700000); await f.router.recover(id); await f.router.process(id);
  assert.equal((await f.store.get('deliveries/'+id)).status,'accepted'); assert.equal(f.calls.length,1);
});
test('policy/invalid rejection and unrecognized errors do not switch providers',async()=>{
  for (const outcome of [{status:'failed',code:'permission_or_policy_rejected'},{status:'rejected',code:'not_documented'}]) {
    const f=await fixture({resend:outcome}),id=await f.add('one');await f.router.process(id);assert.equal(f.calls.length,1);
  }
});
test('manual provider choice restricted to one-recipient tests; authenticated verified owner required',()=>{
  assert.throws(()=>normalize({...input(),provider:'resend'}));
  assert.throws(()=>normalize({...input(),category:'test',recipients:[...input().recipients,...input().recipients]}));
  assert.throws(()=>authorize({uid:'x',token:{email:'admin@example.org',email_verified:false}},['admin@example.org']));
  assert.throws(()=>authorize({uid:'x',token:{email:'other@example.org',email_verified:true}},['admin@example.org']));
  authorize({uid:'x',token:{email:'admin@example.org',email_verified:true}},['admin@example.org']);
});
test('loading client, login, status checks and reload do not enqueue or send',async()=>{
  const calls=[]; const deps={enabled:true,requireUser:async()=>({}),call:async(n,p)=>{calls.push(n);return {};}};
  const a=createClient(deps),b=createClient(deps);assert.equal(calls.length,0);
  await deps.requireUser();await a.status();await b.status();assert.deepEqual(calls,['emailSystemStatus','emailSystemStatus']);
  await a.sendNotice(input());assert.equal(calls.at(-1),'sendEmail');
});
test('statistics distinguish acceptance, confirmed delivery, failure and unknown',()=>{
  const now=Date.now();const s=statistics(['accepted','delivered','failed','unknown'].map(status=>({status,provider:'resend',updatedAt:now})),now);
  assert.equal(s.today.accepted,1);assert.equal(s.today.delivered,1);assert.equal(s.today.unknown,1);assert.equal(s.today.providers.resend,2);
});
test('HTTP adapter contracts: five success receipts, exactly one request each',async()=>{
  const bodies={resend:{id:'r1'},brevo:{messageId:'b1'},smtp2go:{data:{succeeded:1,failed:0,email_id:'s1'}},mailjet:{Messages:[{Status:'success',To:[{MessageID:123}]}]},emailjs:'OK'};
  const c={apiKey:'SYNTHETIC',secretKey:'SYNTHETIC',from:'gaia@example.org',serviceId:'s',templateId:'t',publicKey:'p',privateKey:'private'};
  for (const name of Object.keys(bodies)) {
    const calls=[];const providers=createProviders({[name]:c},async(url,options)=>{calls.push({url,options});return new Response(typeof bodies[name]==='string'?bodies[name]:JSON.stringify(bodies[name]),{status:200});});
    const m=normalize(input())[0];const r=await providers[name].send(m);
    assert.equal(r.status,'accepted',name);assert.equal(calls.length,1);assert.equal(JSON.parse(calls[0].options.body).to?.length || 1,1);
  }
});
test('adapter treats 503, missing receipt and lost connection as unknown; 429 rejection honors cooldown',async()=>{
  const c={resend:{apiKey:'synthetic',from:'a@example.org'}};
  for (const [status,body,expected] of [[503,{},'unknown'],[200,{},'unknown'],[429,{},'rejected'],[429,{name:'daily_quota_exceeded'},'rejected'],[403,{},'failed']]) {
    const p=createProviders(c,async()=>new Response(JSON.stringify(body),{status,headers:{'retry-after':'120'}}));
    const r=await p.resend.send(normalize(input())[0]); assert.equal(r.status,expected);
    if(status===429&&!body.name)assert.equal(r.cooldownMs,120000);
    if(body.name)assert.equal(r.code,'quota_exceeded');
  }
});
test('disabled or unconfigured provider makes no HTTP call; EmailJS quota is explicit and permanent',async()=>{
  let count=0;const p=createProviders({},async()=>{count++;return new Response('OK');});
  assert.equal((await p.resend.send(normalize(input())[0])).code,'not_configured');assert.equal(count,0);
  const q=createProviders({emailjs:{serviceId:'s',templateId:'t',publicKey:'p',privateKey:'private'}},async()=>new Response('Monthly request quota exceeded',{status:403}));
  assert.equal((await q.emailjs.send(normalize(input())[0])).code,'quota_exceeded');
});
test('Mailjet suspension is not an authentication failover; Brevo explicit insufficient credit is a rejection',async()=>{
  const c={mailjet:{apiKey:'synthetic',secretKey:'synthetic',from:'a@example.org'},brevo:{apiKey:'synthetic',from:'a@example.org'}};
  const suspended=createProviders(c,async()=>new Response(JSON.stringify({ErrorCode:'mj-0001'}),{status:401}));
  assert.equal((await suspended.mailjet.send(normalize(input())[0])).status,'failed');
  const exhausted=createProviders(c,async()=>new Response(JSON.stringify({code:'not_enough_credits'}),{status:400}));
  assert.equal((await exhausted.brevo.send(normalize(input())[0])).code,'quota_exceeded');
});
test('free backend client chunks audiences with stable identities and no calls on load',async()=>{
  const calls=[];const client=createClient({enabled:true,batchSize:15,requireUser:async()=>({}),
    call:async(name,payload)=>{calls.push(payload);return {deliveries:payload.recipients.map(r=>({id:r.email,status:'pending'}))};}});
  assert.equal(calls.length,0);
  const message={...input(),recipients:Array.from({length:31},(_,i)=>({email:'member'+i+'@example.org'}))};
  assert.equal((await client.sendNotice(message)).deliveries.length,31);
  assert.deepEqual(calls.map(c=>c.recipients.length),[15,15,1]);
  assert.ok(calls.every(c=>c.entityId===message.entityId));
});
