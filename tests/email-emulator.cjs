'use strict';
// Run ONLY through Firebase emulators:exec --project demo-gaia-email --only database,auth.
if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST?.startsWith('127.0.0.1:') ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw Error('Local emulators are required');
const {test,after} = require('node:test');
const assert = require('node:assert/strict');
const runtimeRequire = require('node:module').createRequire(require.resolve('../functions/package.json'));
const {initializeApp,deleteApp} = runtimeRequire('firebase-admin/app');
const {getDatabase} = runtimeRequire('firebase-admin/database');
const {getAuth} = runtimeRequire('firebase-admin/auth');
const {EmailRouter,enqueue} = require('../functions/core');
const {createFirebaseStore} = require('../functions/firebase-store');
const app=initializeApp({projectId:'demo-gaia-email',databaseURL:'https://demo-gaia-email-default-rtdb.firebaseio.com'});
const db=getDatabase(app),auth=getAuth(app),store=createFirebaseStore(db.ref('email_system'));
after(()=>deleteApp(app));
test('real RTDB transactions deduplicate ten concurrent clients and workers',async()=>{
  const input={category:'test',entityId:'emulator-message',subject:'Synthetic',text:'Offline only',recipients:[{email:'test@example.org'}]};
  const records=await Promise.all(Array.from({length:10},()=>enqueue(store,input)));
  let sends=0;
  const router=new EmailRouter({store,config:{order:['mock'],enabled:{mock:true}},providers:{mock:{getStatus:()=>({configured:true}),
    send:async()=>{sends++;return {status:'accepted',code:'accepted',providerMessageId:'mock-1'};}}}});
  await Promise.all(records.map(r=>router.process(r[0].id)));
  assert.equal(sends,1);assert.equal((await store.get('deliveries/'+records[0][0].id)).status,'accepted');
});
async function token(email) {
  const user=await auth.createUser({email,emailVerified:true});
  const custom=await auth.createCustomToken(user.uid);
  const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=synthetic',
    {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});
  assert.equal(r.status,200);return (await r.json()).idToken;
}
async function request(path,method='GET',body,credential) {
  return fetch('http://'+process.env.FIREBASE_DATABASE_EMULATOR_HOST+'/'+path+'.json?ns=demo-gaia-email-default-rtdb'+(credential?'&auth='+encodeURIComponent(credential):''),
    {method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
test('rules deny browser queue access, allow legacy owner route and block backend takeover',async()=>{
  const owner=await token('gaia.robotica.uftm@gmail.com'),other=await token('other@example.org');
  for (const credential of [undefined,owner,other]) {
    assert.equal((await request('email_system','GET',null,credential)).status,401);
    assert.equal((await request('email_system/deliveries/forged','PUT',{status:'pending'},credential)).status,401);
  }
  const legacy={provider:'emailjs',status:'sending',updatedAt:1};
  assert.equal((await request('gaia_notice_routes/owner','PUT',legacy,owner)).status,200);
  assert.equal((await request('gaia_notice_routes/other','PUT',legacy,other)).status,401);
  await db.ref('gaia_notice_routes/backend').set({provider:'backend',status:'reserved',updatedAt:1});
  assert.equal((await request('gaia_notice_routes/backend','PUT',legacy,owner)).status,401);
  assert.equal((await request('gaia_notice_routes/backend','PUT',{provider:'apps-script',status:'reserved',updatedAt:2},owner)).status,401);
});
