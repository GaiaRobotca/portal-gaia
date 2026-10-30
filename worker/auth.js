import core from '../functions/core.js';
export async function verifyAdministrator(request, env, transport = fetch) {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match || !env.FIREBASE_WEB_API_KEY) throw new Error('unauthorized');
  const token = match[1];
  let payload;
  try { payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }
  catch { throw new Error('unauthorized'); }
  // Decoding is only an early constraint check. Google's authenticated lookup below validates the token.
  const now = Date.now()/1000;
  if (payload.aud !== env.FIREBASE_PROJECT_ID || payload.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID ||
    typeof payload.sub !== 'string' || !payload.sub || typeof payload.exp !== 'number' || payload.exp <= now ||
    typeof payload.iat !== 'number' || payload.iat > now + 30) throw new Error('unauthorized');
  const response = await transport('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY),
    {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken:token}), signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('unauthorized');
  const user = (await response.json()).users?.[0];
  if (!user || user.disabled || user.localId !== payload.sub) throw new Error('unauthorized');
  const auth = {uid:user.localId, token:{email:user.email, email_verified:user.emailVerified === true}};
  core.authorize(auth, (env.EMAIL_ADMIN_EMAILS || '').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean));
  return {auth, idToken:token};
}
