const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const GaiaEmail=require('../email-queue.js');
const GaiaNoticeMail=require('../notice-mail.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.match(/function saveCalEvent\(\) \{[\s\S]*?(?=\nfunction deleteCalEvent)/)[0];
async function fixture(members,{reject=false,admin=true}={}) {
  const sent=[],toasts=[],values={'cal-title':'Synthetic event','cal-date':'2026-11-01',
    'cal-time':'','cal-alert-days':'0','cal-alert-team':'all','cal-desc':'Synthetic body','cal-type':'reuniao'};
  const nodes=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]));
  nodes['cal-email']={checked:true};
  const c={CU:{isAdmin:admin,name:'Synthetic admin'},M:members,CAL:[],
    ECFG:{serviceId:'test',templateId:'test',publicKey:'test'},GaiaEmail,GaiaNoticeMail,
    el:id=>nodes[id],toast:(message,type)=>toasts.push({message,type}),save:()=>{},closeModal:()=>{},
    queuePortalEmail:async(s,t,p)=>{sent.push(p);if(reject)throw {status:403,text:'Monthly request quota exceeded'};}};
  vm.runInNewContext(code+'\nsaveCalEvent();',c);
  await new Promise(resolve=>setImmediate(resolve));
  return {sent,toasts,events:c.CAL};
}
test('manual calendar action sends individually to unique active valid recipients',async()=>{
  const r=await fixture([{email:'a@example.com',name:'A'},{email:'A@EXAMPLE.com',name:'Duplicate'},
    {email:'',name:'Missing'},{email:'b@example.com',name:'Inactive',active:false}]);
  assert.equal(r.sent.length,1);
  assert.equal(r.events.length,1);
  assert.ok(r.toasts.some(t=>t.message.includes('1 e-mails aceitos')));
});
test('calendar quota failure is visible without losing the saved event',async()=>{
  const r=await fixture([{email:'a@example.com',name:'A'}],{reject:true});
  assert.equal(r.events.length,1);
  assert.ok(r.toasts.some(t=>t.type==='warn' && t.message.includes('Cota mensal')));
});
test('empty calendar audience is explicit; unauthorized action cannot send or save',async()=>{
  const empty=await fixture([{email:null,name:'Missing'}]);
  assert.equal(empty.sent.length,0);
  assert.ok(empty.toasts.some(t=>t.message.includes('nenhum e-mail válido')));
  const denied=await fixture([{email:'a@example.com',name:'A'}],{admin:false});
  assert.equal(denied.sent.length,0);
  assert.equal(denied.events.length,0);
});
