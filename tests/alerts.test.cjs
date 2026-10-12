const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('function checkAndFireAlerts()');
const end=html.indexOf('function renderAlertBanners(',start);
const code=html.slice(start,end);
function session(isAdmin,events){
  const notifications=[];
  const noSend=()=>assert.fail('An automatic reminder attempted an email');
  const context={CU:{isAdmin},ECFG:{configured:true},M:[{email:'member@example.com'}],
    dismissedAlerts:new Set(),getAlertEvents:()=>events,fmtDate:value=>value,
    toast:(...args)=>notifications.push(args),emailConfigured:()=>true,
    queuePortalEmail:noSend,sendEmails:noSend,emailjs:{send:noSend}};
  vm.createContext(context);vm.runInContext(code,context);
  return {context,notifications};
}
test('login, hourly polls, admins and multiple tabs never send automatic email',()=>{
  const events=[{id:'event1',title:'Encontro',date:'2026-10-13',alertDays:1}];
  for(const admin of [false,true])for(let tab=0;tab<5;tab++){
    const s=session(admin,events);
    for(let hour=0;hour<72;hour++)s.context.checkAndFireAlerts();
    assert.equal(s.notifications.length,1,'one in-portal toast per event/session');
  }
});
test('new event date has its own in-portal reminder and empty list is quiet',()=>{
  const events=[];const s=session(true,events);s.context.checkAndFireAlerts();
  assert.equal(s.notifications.length,0);
  events.push({id:'1',title:'Encontro',date:'2026-10-13',alertDays:1});
  s.context.checkAndFireAlerts();events[0].date='2026-10-14';s.context.checkAndFireAlerts();
  assert.equal(s.notifications.length,2);
});
test('event email is opt-in and correction notice is visible in the home page',()=>{
  const input=html.match(/<input[^>]*id="cal-email"[^>]*>/)[0];
  assert.doesNotMatch(input,/\bchecked\b/);
  assert.match(html,/id="alert-spam-fix-notice"/);
  assert.doesNotMatch(html,/Enviar e-mail para todos no dia do alerta/);
});
