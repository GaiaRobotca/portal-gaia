const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createQueue,validEmail,normalizeEmail}=require('../email-queue.js');
test('inline JavaScript parses',()=>{
  const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(match[1]);
  assert.equal((html.match(/emailjs\.send\(/g)||[]).length,1,'all sends must use the central queue');
});
test('email validation and normalization',()=>{
  assert.equal(normalizeEmail(' USER@UFTM.EDU.BR '),'user@uftm.edu.br');
  for(const input of ['',null,'foo','foo@','foo@bar','one@test.com,two@test.com','<a@b.com>'])assert.equal(validEmail(input),false);
  assert.equal(validEmail('first.last+gaia@uftm.edu.br'),true);
});
const config={serviceId:'service',templateId:'template',publicKey:'public'};
test('concurrent calls are spaced, preserve recipient and capture config',async()=>{
  let clock=0;const calls=[];
  const queue=createQueue({now:()=>clock,wait:async ms=>{clock+=ms;},send:async(c,p)=>{calls.push({time:clock,c,p});}});
  const c={...config};
  const jobs=[' A@test.com ','b@test.com','c@test.com'].map(to_email=>queue.enqueue(c,{to_email}));
  c.serviceId='changed';await Promise.all(jobs);
  assert.deepEqual(calls.map(x=>x.time),[0,1200,2400]);
  assert.deepEqual(calls.map(x=>x.p.to_email),['a@test.com','b@test.com','c@test.com']);
  assert.ok(calls.every(x=>x.c.serviceId==='service'));
});
test('429 retries are bounded and failures do not stop later recipients',async()=>{
  let clock=0;const calls=[];
  const queue=createQueue({now:()=>clock,wait:async ms=>{clock+=ms;},send:async(c,p)=>{
    calls.push(p.to_email);if(p.to_email==='bad@test.com')throw {status:429};
  }});
  const results=await Promise.allSettled(['bad@test.com','good@test.com'].map(to_email=>queue.enqueue(config,{to_email})));
  assert.deepEqual(calls,['bad@test.com','bad@test.com','bad@test.com','good@test.com']);
  assert.deepEqual(results.map(r=>r.status),['rejected','fulfilled']);
});
test('missing configuration, invalid address and ambiguous network failures are not sent or retried',async()=>{
  let count=0;const queue=createQueue({wait:async()=>{},send:async()=>{count++;throw new Error('Network');}});
  await assert.rejects(queue.enqueue({}, {to_email:'x@test.com'}));
  await assert.rejects(queue.enqueue(config, {to_email:'invalid'}));
  await assert.rejects(queue.enqueue(config, {to_email:'x@test.com'}));
  assert.equal(count,1);
});

test('non-object provider rejection is preserved and later jobs continue',async()=>{
  for(const failure of [null,undefined,'offline']) {
    let calls=0;
    const queue=createQueue({wait:async()=>{},send:async()=>{if(++calls===1)throw failure;return 'ok';}});
    const results=await Promise.allSettled([queue.enqueue(config,{to_email:'a@test.com'}),queue.enqueue(config,{to_email:'b@test.com'})]);
    assert.equal(results[0].reason,failure);
    assert.equal(results[1].value,'ok');
    assert.equal(calls,2);
  }
});
