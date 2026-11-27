const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deliver}=require('../notice-mail.js');
const {validEmail,recipients,describeError}=require('../email-queue.js');

async function run(members, error, prior={}) {
  let notice={id:'test',team:'all',emailDelivery:prior};
  const calls=[];
  await deliver({notice,members,validEmail,
    update:async(id,change)=>{const next=change(notice);if(next)notice=next;},
    send:async member=>{calls.push(member.id);if(error)throw error;}});
  return {calls,deliveries:notice.emailDelivery};
}
test('normal members send once; missing, inactive and duplicate addresses are skipped',async()=>{
  const members=[{id:'a',email:' A@example.com '},{id:'b',email:null},
    {id:'c',email:'a@EXAMPLE.com'},{id:'d',email:'d@example.com',active:false}];
  const result=await run(members);
  assert.deepEqual(result.calls,['a']);
  assert.equal(result.deliveries.a.status,'sent');
  assert.equal(result.deliveries.b.status,'missing');
  assert.equal(result.deliveries.c.status,'duplicate');
  assert.equal(result.deliveries.d,undefined);
  assert.equal(recipients(members).length,1);
});
test('no eligible recipients means no provider calls',async()=>{
  for(const members of [[],[{id:'a',email:''}],[{id:'a',email:'a@example.com,b@example.com'}]]){
    assert.deepEqual((await run(members)).calls,[]);
  }
});
test('provider failure records a safe quota code; arbitrary response data is never persisted',async()=>{
  const r=await run([{id:'a',email:'a@example.com'}],{status:403,text:'Monthly request quota exceeded SECRET_SENTINEL'});
  assert.equal(r.deliveries.a.status,'failed');
  assert.equal(r.deliveries.a.errorCode,'EMAIL_MONTHLY_QUOTA');
  assert.doesNotMatch(JSON.stringify(r.deliveries),/SECRET_SENTINEL/);
  assert.equal(describeError({code:'EMAIL_CONFIG_MISSING'}).code,'EMAIL_CONFIG_MISSING');
});
test('uncertain send is blocked and a changed member ID cannot resend an accepted address',async()=>{
  const r=await run([{id:'a',email:'a@example.com'}],new Error('timeout'));
  assert.equal(r.deliveries.a.status,'unknown');
  const retry=await run([{id:'a',email:'a@example.com'},{id:'b',email:'a@example.com'}],null,r.deliveries);
  assert.deepEqual(retry.calls,[]);
});
test('database reservation failure stops before contacting the provider',async()=>{
  let calls=0;
  await assert.rejects(deliver({notice:{id:'test',team:'all'},members:[{id:'a',email:'a@example.com'}],
    validEmail,update:async()=>{throw Error('database denied');},send:async()=>{calls++;}}),/database denied/);
  assert.equal(calls,0);
});
