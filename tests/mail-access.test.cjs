const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAccess,owner}=require('../mail-access.js');
test('only the verified sender can acquire the protected email route',async()=>{
  for(const user of [null,{email:owner,emailVerified:false},{email:'other@example.com',emailVerified:true}]){
    const auth={currentUser:user,onAuthStateChanged:cb=>{cb(user);return ()=>{};}};
    await assert.rejects(createAccess(auth).requireUser(),/Conecte a conta/);
  }
  const user={email:owner,emailVerified:true};
  assert.equal(await createAccess({currentUser:user}).requireUser(),user);
});
test('wrong Google account is disconnected and cannot authorize delivery',async()=>{
  let signedOut=0;
  const auth={signInWithPopup:async()=>({user:{email:'other@example.com',emailVerified:true}}),signOut:async()=>{signedOut++;}};
  const access=createAccess(auth,()=>({setCustomParameters:()=>{}}));
  await assert.rejects(access.connect(),/Conecte a conta/);
  assert.equal(signedOut,1);
});
