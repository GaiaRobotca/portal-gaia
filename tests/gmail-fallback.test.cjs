const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const path=require('node:path');
const {createQueue}=require('../email-queue.js');
const source=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(options={}) {
  const member={id:'m1',name:'Pessoa Teste',email:'member@example.com',team:'adm',active:true};
  const notice={id:'notice1',title:'Aviso de teste',body:'Conteúdo de teste',team:'all',emailRequested:true,
    emailDelivery:{m1:{address:member.email,status:'failed',error:'Monthly request quota exceeded',attempts:3}}};
  const database={'gaia_v7/notices':[notice],'gaia_v7/members':[member]};
  const versions={},properties={ENABLED:'true'},sent=[],requests=[];
  let quota=options.quota ?? 100, lock=true;
  const context={
    Session:{getActiveUser:()=>({getEmail:()=>options.user ?? 'gaia.robotica.uftm@gmail.com'}),getEffectiveUser:()=>({getEmail:()=> 'gaia.robotica.uftm@gmail.com'})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]??null,setProperty:(k,v)=>{properties[k]=v;}})},
    ScriptApp:{getOAuthToken:()=> 'synthetic-token'},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(algorithm,text)=>[...crypto.createHash(algorithm).update(text).digest()]},
    LockService:{getScriptLock:()=>({tryLock:()=>lock,releaseLock:()=>{}})},
    MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:message=>{if(options.sendError)throw Error('Simulated timeout');sent.push(copy(message));quota--; }},
    UrlFetchApp:{fetch:(url,request)=>{
      requests.push({url,request});
      assert.equal(request.headers.Authorization,'Bearer synthetic-token');
      const p=new URL(url).pathname.slice(1,-5), v=versions[p]||0;
      let code=200;
      if(request.method==='put') {
        if(options.conflict || request.headers['if-match']!==String(v)) code=412;
        else {database[p]=JSON.parse(request.payload);versions[p]=v+1;}
      }
      return {getResponseCode:()=>options.httpError||code,getAllHeaders:()=>({ETag:String(versions[p]||0)}),getContentText:()=>JSON.stringify(database[p]??null)};
    }}
  };
  vm.createContext(context);vm.runInContext(source,context);
  return {context,database,properties,sent,requests,member,notice,setLock:v=>{lock=v;}};
}
test('preview does not send; Gmail accepts once and permanent route prevents returning to primary',()=>{
  const f=fixture(),p=f.context.previewNotice('notice1');
  assert.equal(p.candidates.length,1);assert.equal(f.sent.length,0);
  assert.equal(f.context.sendNotice(p.id,p.fingerprint).sent,1);
  assert.equal(f.sent[0].to,'member@example.com');
  assert.equal(f.database['gaia_notice_routes/notice1'].provider,'apps-script');
  assert.equal(f.database['gaia_v7/notices'][0].emailDelivery.m1.provider,'apps-script');
  const again=f.context.previewNotice('notice1');
  assert.equal(f.context.sendNotice(again.id,again.fingerprint).sent,0);
  assert.equal(f.sent.length,1);
});
test('private receipt survives a stale portal snapshot restoring the old failure',()=>{
  const f=fixture(),old=copy(f.database['gaia_v7/notices']),p=f.context.previewNotice('notice1');
  f.context.sendNotice(p.id,p.fingerprint);
  f.database['gaia_v7/notices']=old;
  const p2=f.context.previewNotice('notice1');
  assert.equal(p2.candidates.length,0);
  f.context.sendNotice(p2.id,p2.fingerprint);assert.equal(f.sent.length,1);
});
test('missing identity, wrong identity, disabled deployment and bad ID fail closed',()=>{
  for(const user of ['', 'other@example.com'])assert.throws(()=>fixture({user}).context.previewNotice('notice1'),/conta Google/);
  const f=fixture();delete f.properties.ENABLED;
  assert.throws(()=>f.context.previewNotice('notice1'),/desativada/);
  assert.throws(()=>fixture().context.previewNotice('../members'),/inválido/);
});
test('unknown results, non-quota failures, changed email and inactive members are excluded',()=>{
  for(const status of ['sent','sending','unknown','duplicate','missing']){
    const f=fixture();f.notice.emailDelivery.m1.status=status;
    assert.equal(f.context.previewNotice('notice1').candidates.length,0);
  }
  for(const mutate of [f=>f.notice.emailDelivery.m1.error='Timeout',f=>f.member.email='changed@example.com',f=>f.member.active=false,f=>f.notice.emailDelivery.m1.provider='apps-script']){
    const f=fixture();mutate(f);assert.equal(f.context.previewNotice('notice1').candidates.length,0);
  }
});
test('deduplicates addresses and protects already accepted addresses under another member ID',()=>{
  const f=fixture();f.database['gaia_v7/members'].push({...f.member,id:'m2'});
  f.notice.emailDelivery.m2={...f.notice.emailDelivery.m1};
  assert.equal(f.context.previewNotice('notice1').candidates.length,1);
  f.notice.emailDelivery.m2.status='sent';
  assert.equal(f.context.previewNotice('notice1').candidates.length,0);
});
test('quota exhaustion, primary lock, script lock, denied Firebase and CAS conflict never send',()=>{
  for(const options of [{quota:0},{conflict:true},{httpError:403}]){
    const f=fixture(options);
    assert.throws(()=>{const p=f.context.previewNotice('notice1');f.context.sendNotice(p.id,p.fingerprint);});
    assert.equal(f.sent.length,0);
  }
  const f=fixture(),p=f.context.previewNotice('notice1');
  f.database['gaia_notice_routes/notice1']={provider:'emailjs',status:'sending'};
  assert.throws(()=>f.context.sendNotice(p.id,p.fingerprint),/EmailJS/);
  f.setLock(false);assert.throws(()=>f.context.sendNotice(p.id,p.fingerprint),/andamento/);
  assert.equal(f.sent.length,0);
});
test('changed preview blocks send and ambiguous Gmail failure blocks subsequent retry',()=>{
  const f=fixture(),p=f.context.previewNotice('notice1');f.notice.body='Changed';
  assert.throws(()=>f.context.sendNotice(p.id,p.fingerprint),/mudaram/);assert.equal(f.sent.length,0);
  const g=fixture({sendError:true}),q=g.context.previewNotice('notice1');
  assert.throws(()=>g.context.sendNotice(q.id,q.fingerprint),/incerto/);
  assert.equal(g.database['gaia_v7/notices'][0].emailDelivery.m1.status,'unknown');
  assert.equal(g.context.previewNotice('notice1').candidates.length,0);
});
test('monthly quota refusal is not retried even when provider reports 429',async()=>{
  let calls=0;
  const q=createQueue({wait:async()=>{},send:async()=>{calls++;throw {status:429,text:'Monthly request quota exceeded'};}});
  await assert.rejects(q.enqueue({serviceId:'test',templateId:'test',publicKey:'test'},{to_email:'member@example.com'}));
  assert.equal(calls,1);
});
test('server HTML scripts parse, output uses textContent and deployment is owner-only',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../apps-script/Index.html'),'utf8');
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.doesNotMatch(html,/innerHTML/);
  const nodes=new Map();let previews=0;
  const chain={withFailureHandler:()=>chain,withSuccessHandler:()=>chain,
    previewNotice:()=>{previews++;},sendNotice:()=>assert.fail('page load must never send')};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{
    document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{value:'notice1'});return nodes.get(id);}},
    google:{script:{run:chain}}
  });
  assert.equal(previews,1);
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../apps-script/appsscript.json')));
  assert.equal(manifest.webapp.access,'MYSELF');
});
test('updated portal refuses a Gmail handoff or an unfinished primary batch before sending',async()=>{
  const code=fs.readFileSync(path.join(__dirname,'../notice-mail.js'),'utf8');
  for(const route of [{provider:'apps-script',status:'reserved'},{provider:'emailjs',status:'sending'}]) {
    let sends=0;
    const c={CU:{isAdmin:true},ECFG:{serviceId:'test',templateId:'test',publicKey:'test'},
      NOT:[{id:'notice1'}],M:[],Date,
      GaiaEmail:require('../email-queue.js'),portalEmailQueue:{enqueue:()=>{sends++;}},
      firebase:{database:()=>({ref:()=>({transaction:async fn=>({committed:fn(route)!==undefined})})})},
      document:{getElementById:()=>null},addEventListener:()=>{}};
    c.window=c;vm.createContext(c);vm.runInContext(code,c);c.renderNotices=()=>{};
    await assert.rejects(c.sendNoticeMail('notice1'),/transferido ao Gmail/);assert.equal(sends,0);
  }
});
test('Gmail batch respects 20 recipients and leaves remaining failures for explicit continuation',()=>{
  const f=fixture();f.database['gaia_v7/members']=[];f.notice.emailDelivery={};
  for(let i=0;i<30;i++){
    const m={id:'m'+i,name:'Synthetic '+i,email:'test'+i+'@example.com',team:'adm'};
    f.database['gaia_v7/members'].push(m);
    f.notice.emailDelivery[m.id]={address:m.email,status:'failed',error:'Monthly request quota exceeded'};
  }
  const p=f.context.previewNotice('notice1');assert.equal(f.context.sendNotice(p.id,p.fingerprint).sent,20);
  const p2=f.context.previewNotice('notice1');assert.equal(p2.candidates.length,10);
  assert.equal(f.context.sendNotice(p2.id,p2.fingerprint).sent,10);
  assert.equal(new Set(f.sent.map(m=>m.to)).size,30);
  assert.ok(f.sent.every(m=>!m.cc && !m.bcc && !m.to.includes(',')));
});

test('sanitized monthly quota code is eligible and malformed recipient lists never send',()=>{
  const f=fixture();f.notice.emailDelivery.m1.error='Cota mensal esgotada';
  f.notice.emailDelivery.m1.errorCode='EMAIL_MONTHLY_QUOTA';
  assert.equal(f.context.previewNotice('notice1').candidates.length,1);
  for(const address of ['',null,'bad','one@example.com,two@example.com','one@example.com;two@example.com']){
    f.member.email=address;
    assert.equal(f.context.previewNotice('notice1').candidates.length,0);
  }
});
