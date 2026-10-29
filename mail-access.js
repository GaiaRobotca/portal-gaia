/* Firebase identity is required only for the protected mail coordination route. */
(function(root) {
  'use strict';
  const owner = 'gaia.robotica.uftm@gmail.com';
  const isOwner = user => user?.email?.toLowerCase() === owner && user.emailVerified === true;
  function createAccess(auth, providerFactory) {
    const denied = () => Object.assign(new Error('Conecte a conta Google do Gaia em "Conectar conta de envio".'), {code:'EMAIL_AUTH_REQUIRED'});
    async function requireUser() {
      let user = auth.currentUser;
      if (!user) user = await new Promise((resolve, reject) => {
        let unsubscribe, completed = false;
        unsubscribe = auth.onAuthStateChanged(value => {
          completed = true;
          resolve(value);
          if (unsubscribe) unsubscribe();
        }, () => reject(denied()));
        if (completed) unsubscribe();
      });
      if (!isOwner(user)) throw denied();
      return user;
    }
    async function connect() {
      const provider = providerFactory();
      provider.setCustomParameters({login_hint:owner, prompt:'select_account'});
      const result = await auth.signInWithPopup(provider);
      if (!isOwner(result.user)) { await auth.signOut(); throw denied(); }
      return result.user;
    }
    return {requireUser, connect};
  }
  if (typeof module === 'object') { module.exports = {owner, isOwner, createAccess}; return; }
  root.GaiaMailAccess = createAccess(firebase.auth(), () => new firebase.auth.GoogleAuthProvider());
  root.connectMailAccount = async () => {
    if (!CU?.isAdmin) return;
    try { await root.GaiaMailAccess.connect(); toast('Conta de envio Gaia conectada.'); }
    catch (error) { console.error('[email] code=EMAIL_AUTH_REQUIRED'); toast('Não foi possível conectar a conta Google do Gaia.', 'err'); }
  };
})(typeof window === 'undefined' ? globalThis : window);
