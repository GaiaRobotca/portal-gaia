// Optional browser integration test. Every network request is intercepted.
const {chromium}=require('../functions/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch(process.env.GAIA_BROWSER==='chromium'?{headless:true}:{channel:'msedge',headless:true});
  try {
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const member={id:'m1',name:'Admin Teste',username:'Admin',password:'test',email:'member@example.com',team:'adm',isAdmin:true,avatar:'AT',color:'#1a8fff',role:'Admin',hours:0,pts:0,skills:[],metrics:{}};
      const store={gaia_v7:{members:[member],emailConfig:{serviceId:'fake',templateId:'fake',publicKey:'fake',configured:true}}};
      const read=p=>p.split('/').reduce((o,k)=>o?.[k],store)??null;
      const write=(p,v)=>{const keys=p.split('/');let o=store;for(const k of keys.slice(0,-1))o=o[k]??={};o[keys.at(-1)]=v;};
      const ref=p=>({child:k=>ref(p+'/'+k),on:(ev,fn)=>setTimeout(()=>fn({val:()=>read(p)}),1),
        once:async()=>({val:()=>read(p)}),set:async v=>write(p,v),update:async v=>write(p,{...read(p),...v}),
        onDisconnect:()=>({update:()=>{}}),transaction:async fn=>{const v=fn(read(p));if(v!==undefined)write(p,v);return {committed:v!==undefined,snapshot:{val:()=>read(p)}};}});
      window.firebase={initializeApp:()=>({}),database:()=>({ref})};
      window.firebase.auth=()=>({currentUser:{email:'gaia.robotica.uftm@gmail.com',emailVerified:true}});
      window.emailCalls=0;window.emailjs={send:async()=>{emailCalls++;throw {status:403,text:'Monthly request quota exceeded'};}};
      window.opened=[];window.open=(...args)=>{opened.push(args);};
    });
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      const allowed={'/':'index.html','/email-queue.js':'email-queue.js','/mail-access.js':'mail-access.js','/notice-mail.js':'notice-mail.js','/email-backend.js':'email-backend.js','/email-admin.js':'email-admin.js'};
      const file=url.hostname==='gaia.test'?allowed[url.pathname]:undefined;
      return route.fulfill({contentType:file?.endsWith('.html')?'text/html':'application/javascript',body:file?fs.readFileSync(path.join(__dirname,'..',file)) : ''});
    });
    await page.addInitScript(()=>{
      window.backendCalls=[];
      const names=['mailjet','smtp2go','resend','brevo','emailjs'];
      const bucket={accepted:0,delivered:0,failed:0,unknown:0,pending:0,providers:{}};
      window.firebase.app=()=>({functions:()=>({httpsCallable:name=>async payload=>{
        backendCalls.push({name,payload});
        if(name==='emailSystemStatus')return {data:{config:{order:names,enabled:{mailjet:true}},
          providers:names.map(name=>({name,configured:name==='mailjet',enabled:name==='mailjet'})),
          statistics:{today:bucket,month:bucket},deliveries:[{toName:'<img src=x onerror=alert(1)>',to:'test@example.org',
            category:'notice',noticeId:'synthetic',provider:'mailjet',status:'unknown',attempts:[]}]}};
        return {data:{deliveries:[{id:'synthetic',status:'pending'}]}};
      }})});
    });
    await page.route('**/email-backend-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.GAIA_EMAIL_BACKEND={enabled:true};'}));
    await page.goto('https://gaia.test');
    await page.waitForFunction(()=>typeof M!=='undefined'&&M.length===1);
    await page.fill('#li-user','Admin');await page.fill('#li-pass','test');
    await page.evaluate(()=>{doLogin();goPage('notices');});
    assert.equal(await page.evaluate(()=>emailCalls),0);
    await page.evaluate(()=>goPage('emailsystem'));
    await page.getByRole('button',{name:'Enviar um e-mail de teste',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>backendCalls.filter(c=>c.name==='sendEmail').length),0);
    assert.equal(await page.locator('#email-system-content img').count(),0);
    await page.fill('#email-test-to','admin@example.org');
    await page.selectOption('#email-test-provider','mailjet');
    await page.getByRole('button',{name:'Enviar um e-mail de teste',exact:true}).click();
    await page.waitForFunction(()=>backendCalls.some(c=>c.name==='sendEmail'));
    assert.equal(await page.evaluate(()=>backendCalls.find(c=>c.name==='sendEmail').payload.recipients.length),1);
    await page.evaluate(async()=>{goPage('notices');el('no-title').value='Synthetic notice';el('no-body').value='Synthetic content';
      el('no-team').value='all';el('no-email').checked=true;await publishNotice();});
    assert.equal(await page.evaluate(()=>backendCalls.filter(c=>c.name==='sendEmail').length),2);
    assert.equal(await page.evaluate(()=>emailCalls),0);
    await page.evaluate(()=>goPage('emailsystem'));
    await page.getByRole('button',{name:'Enviar um e-mail de teste',exact:true}).waitFor();
    fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('pg-emailsystem')).opacity==='1');
    await page.screenshot({path:path.join(__dirname,'../test-results/email-system.png'),fullPage:true});
    await page.reload();await page.waitForFunction(()=>typeof M!=='undefined'&&M.length===1);
    assert.equal(await page.evaluate(()=>backendCalls.filter(c=>c.name==='sendEmail').length),0);
    assert.equal(await page.evaluate(()=>emailCalls),0);assert.deepEqual(errors,[]);
    console.log('PASS: offline browser dashboard, escaping, single-recipient test, backend admission, login/reload silence');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
