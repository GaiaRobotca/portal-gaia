// Optional browser integration test. Every network request is intercepted.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
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
      window.emailCalls=0;window.emailjs={send:async()=>{emailCalls++;throw {status:403,text:'Monthly request quota exceeded'};}};
      window.opened=[];window.open=(...args)=>{opened.push(args);};
    });
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      const allowed={'/':'index.html','/email-queue.js':'email-queue.js','/notice-mail.js':'notice-mail.js'};
      const file=url.hostname==='gaia.test'?allowed[url.pathname]:undefined;
      return route.fulfill({contentType:file?.endsWith('.html')?'text/html':'application/javascript',body:file?fs.readFileSync(path.join(__dirname,'..',file)) : ''});
    });
    await page.goto('https://gaia.test');
    await page.waitForFunction(()=>typeof M!=='undefined'&&M.length===1);
    await page.fill('#li-user','Admin');await page.fill('#li-pass','test');
    await page.evaluate(()=>{doLogin();goPage('notices');});
    assert.equal(await page.evaluate(()=>emailCalls),0);
    await page.evaluate(()=>{el('no-title').value='Aviso sintético';el('no-body').value='Teste sem envio real';el('no-team').value='all';el('no-email').checked=true;});
    await page.evaluate(()=>publishNotice());
    assert.equal(await page.evaluate(()=>emailCalls),1);
    assert.equal(await page.evaluate(()=>NOT[0].emailDelivery.m1.status),'failed');
    assert.equal(await page.getByRole('button',{name:'Reserva Gmail',exact:true}).count(),1);
    page.once('dialog',dialog=>dialog.accept('https://script.google.com/macros/s/SYNTHETIC_DEPLOYMENT/exec'));
    await page.getByRole('button',{name:'Configurar reserva Gmail',exact:true}).click();
    await page.getByRole('button',{name:'Reserva Gmail',exact:true}).click();
    const opened=await page.evaluate(()=>opened);
    assert.equal(opened.length,1);assert.match(opened[0][0],/\/exec\?notice=n/);
    assert.doesNotMatch(opened[0][0],/member|example.com|Teste/);
    await page.evaluate(async()=>{await firebase.database().ref('gaia_notice_routes/'+NOT[0].id).set({provider:'apps-script',status:'reserved'});});
    await page.getByRole('button',{name:'Enviar pendentes',exact:true}).click();
    assert.equal(await page.evaluate(()=>emailCalls),1);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(__dirname,'../test-results/gmail-fallback.png'),fullPage:true});
    console.log('PASS: quota notice, Gmail configuration/button, ID-only handoff, primary blocked, no automatic send. External network mocked.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
