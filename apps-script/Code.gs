// No triggers, no public POST endpoint, no credentials in the portal.
const OWNER_ = 'gaia.robotica.uftm@gmail.com';
const DATABASE_ = 'https://portal-gaia-f5c93-default-rtdb.firebaseio.com';
const MAX_BATCH_ = 20;

// One controlled message to the owner; never sends to members or retries.
function sendSelfTest() {
  const props = PropertiesService.getScriptProperties();
  if (Session.getActiveUser().getEmail().toLowerCase() !== OWNER_ || Session.getEffectiveUser().getEmail().toLowerCase() !== OWNER_)
    throw Error('Entre com a conta Google do Gaia.');
  if (props.getProperty('SELF_TEST_ENABLED') !== 'true' || props.getProperty('self_test_v1'))
    throw Error('Teste desativado ou já executado.');
  props.setProperty('self_test_v1', 'sending');
  props.setProperty('SELF_TEST_ENABLED', 'false');
  try {
    MailApp.sendEmail({to:OWNER_, subject:'[GAIA] Verificação da reserva Gmail',
      body:'Teste técnico controlado da nova reserva de e-mail do Portal Gaia. Destinatário único: a própria conta Gaia. Nenhum aviso foi enviado aos membros.', name:'GAIA Robótica · UFTM'});
  } catch (error) { props.setProperty('self_test_v1', 'unknown'); throw Error('Resultado do teste incerto. Não repetir automaticamente.'); }
  props.setProperty('self_test_v1', 'sent');
  console.info('[email] selfTest=accepted recipients=1');
}

// Exposes only the public OAuth client identifier, never the access token.
function checkGoogleClient() {
  if (Session.getActiveUser().getEmail().toLowerCase() !== OWNER_) throw Error('Entre com a conta Google do Gaia.');
  let response;
  try { response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(ScriptApp.getOAuthToken()), {muteHttpExceptions:true}); }
  catch (error) { throw Error('Não foi possível verificar a identidade OAuth.'); }
  if (response.getResponseCode() !== 200) throw Error('A identidade OAuth foi recusada.');
  const info = JSON.parse(response.getContentText());
  const clientId = info.aud || info.audience || info.issued_to;
  if (typeof clientId !== 'string' || !/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId)) throw Error('Identificador de cliente indisponível.');
  const result = {clientId, emailScope:String(info.scope || '').includes('userinfo.email'), profileScope:String(info.scope || '').includes('userinfo.profile')};
  console.info('[email] googleClient=' + JSON.stringify(result));
  return result;
}

// Read-only deployment check. Never enables delivery or sends mail.
function checkDeployment() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (active !== OWNER_ || effective !== OWNER_) throw Error('Entre com a conta Google do Gaia.');
  const quota = MailApp.getRemainingDailyQuota();
  db_('gaia_notice_routes/deployment-check');
  const result = {ownerVerified:true, remainingRecipients:quota, privateRouteRead:true,
    enabled:PropertiesService.getScriptProperties().getProperty('ENABLED') === 'true'};
  console.info('[email] deployment=' + JSON.stringify(result));
  return result;
}

function authorize_() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (active !== OWNER_ || effective !== OWNER_) throw Error('Entre com a conta Google do Gaia.');
  if (PropertiesService.getScriptProperties().getProperty('ENABLED') !== 'true')
    throw Error('Reserva desativada. Conclua a validação de implantação antes de habilitar.');
}
function id_(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error('ID de aviso inválido.');
  return id;
}
let firebaseSession_;
function firebaseToken_() {
  if (firebaseSession_) return firebaseSession_;
  const key = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!key) throw Error('Configure FIREBASE_WEB_API_KEY nas propriedades privadas do script.');
  let response;
  try {
    response = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=' + encodeURIComponent(key), {
      method:'post', contentType:'application/json', muteHttpExceptions:true,
      payload:JSON.stringify({postBody:'access_token=' + encodeURIComponent(ScriptApp.getOAuthToken()) + '&providerId=google.com',
        requestUri:'https://portal-gaia-f5c93.firebaseapp.com', returnSecureToken:true})
    });
  } catch (error) { throw Error('Falha de conexão na autenticação Firebase. Nenhum token foi registrado.'); }
  if (response.getResponseCode() !== 200) {
    let reason = 'UNKNOWN';
    try {
      const reported = String(JSON.parse(response.getContentText()).error?.message || '').split(' : ')[0];
      if (['INVALID_IDP_RESPONSE','INVALID_OAUTH_CLIENT_ID','OPERATION_NOT_ALLOWED','CONFIGURATION_NOT_FOUND','API_KEY_INVALID','INVALID_CREDENTIAL','UNAUTHORIZED_DOMAIN','PROJECT_NOT_FOUND'].includes(reported)) reason = reported;
    } catch (error) { /* Never include a provider body in diagnostic output. */ }
    throw Error('Autenticação Firebase recusada (HTTP ' + response.getResponseCode() + ', ' + reason + '). Verifique o provedor Google.');
  }
  const result = JSON.parse(response.getContentText());
  if (result.email !== OWNER_ || result.emailVerified !== true || !result.idToken)
    throw Error('Identidade Firebase não autorizada para envio.');
  firebaseSession_ = result.idToken;
  return firebaseSession_;
}
function db_(path, method, value, etag) {
  const headers = {'X-Firebase-ETag': 'true'};
  if (etag !== undefined) headers['if-match'] = etag;
  const options = {method: method || 'get', headers: headers, muteHttpExceptions: true};
  if (value !== undefined) { options.contentType = 'application/json'; options.payload = JSON.stringify(value); }
  const token = firebaseToken_();
  let response;
  try { response = UrlFetchApp.fetch(DATABASE_ + '/' + path + '.json?auth=' + encodeURIComponent(token), options); }
  catch (error) { throw Error('Falha no acesso autenticado ao Firebase. Verifique configuração e conectividade; nenhum token foi registrado.'); }
  const code = response.getResponseCode();
  if (code === 412) return {conflict:true};
  if (code !== 200) {
    console.error('[email] provider=gmail status=failed code=EMAIL_DATABASE_ERROR http=' + code);
    throw Error('Firebase recusou a operação (HTTP ' + code + '). Nenhum token foi registrado.');
  }
  const all = response.getAllHeaders();
  const key = Object.keys(all).find(k => k.toLowerCase() === 'etag');
  return {value:JSON.parse(response.getContentText()), etag:key ? all[key] : undefined};
}
function update_(path, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = db_(path);
    if (!current.etag) throw Error('Firebase não retornou ETag. Operação cancelada.');
    const next = change(current.value);
    if (next === undefined) return false;
    if (!db_(path, 'put', next, current.etag).conflict) return true;
  }
  throw Error('Conflito de atualização. Confira o estado antes de tentar novamente.');
}
function hash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => (b & 255).toString(16).padStart(2, '0')).join('');
}
function address_(value) { return String(value || '').trim().toLowerCase(); }
function valid_(value) { return /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(value); }
function matches_(m, team) {
  if (!m || m.active === false) return false;
  if (team === 'all' || team === 'both') return true;
  if (team === 'adm') return m.isAdmin === true || m.team === 'adm';
  if (team === 'trainees') return m.isTrainee === true;
  return (Array.isArray(m.sectors) ? m.sectors : [m.team]).includes(team);
}
function candidates_(notice, members) {
  if (!notice || notice.deleted || !notice.emailRequested || !notice.title || !notice.body)
    throw Error('Aviso indisponível ou sem solicitação de e-mail.');
  const deliveries = notice.emailDelivery || {};
  const seen = new Set(Object.values(deliveries)
    .filter(d => ['sent','sending','unknown'].includes(d.status)).map(d => address_(d.address)));
  return members.filter(m => {
    if (!matches_(m, notice.team)) return false;
    const address = address_(m.email), d = deliveries[m.id];
    if (!valid_(address) || seen.has(address) || !d || d.status !== 'failed' ||
        address_(d.address) !== address || (d.provider && d.provider !== 'emailjs') ||
        !(d.errorCode === 'EMAIL_MONTHLY_QUOTA' || /monthly request quota exceeded/i.test(String(d.error || '')))) return false;
    seen.add(address);
    return true;
  }).map(m => ({id:m.id, name:String(m.name || ''), address:address_(m.email)}));
}
function load_(id) {
  id_(id);
  const notices = db_('gaia_v7/notices').value || [];
  const found = Object.entries(notices).filter(entry => entry[1] && entry[1].id === id);
  if (found.length !== 1) throw Error('Aviso não encontrado ou ID duplicado.');
  const notice = found[0][1];
  const members = Object.values(db_('gaia_v7/members').value || {}).filter(Boolean);
  return {notice:notice, candidates:candidates_(notice, members)};
}
function fingerprint_(data) {
  return hash_(JSON.stringify([data.notice.id, data.notice.title, data.notice.body, data.notice.team, data.candidates]));
}
function doGet(e) {
  authorize_();
  const template = HtmlService.createTemplateFromFile('Index');
  template.noticeId = id_(e && e.parameter && e.parameter.notice);
  return template.evaluate().setTitle('GAIA · Reserva Gmail');
}
function previewNotice(id) {
  authorize_();
  const data = load_(id);
  const props = PropertiesService.getScriptProperties();
  const candidates = data.candidates.filter(m => !props.getProperty('receipt_' + hash_(id + '/' + m.address)));
  return {id:id, title:data.notice.title, body:data.notice.body, candidates:candidates,
    quota:MailApp.getRemainingDailyQuota(), fingerprint:fingerprint_(data), batchLimit:MAX_BATCH_};
}
function record_(id, member, status, error) {
  update_('gaia_v7/notices', items => {
    const entry = Object.values(items || {}).find(n => n && n.id === id);
    if (!entry) throw Error('Aviso removido durante envio; confira os recibos privados.');
    entry.emailDelivery = entry.emailDelivery || {};
    const old = entry.emailDelivery[member.id] || {};
    entry.emailDelivery[member.id] = Object.assign({}, old, {
      name:member.name, address:member.address, status:status, provider:'apps-script',
      error:error || '', updatedAt:Date.now()
    });
    return items;
  });
}
function sendNotice(id, fingerprint) {
  authorize_();
  id_(id);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw Error('Outro envio Gmail está em andamento.');
  try {
    const data = load_(id);
    if (fingerprint !== fingerprint_(data)) throw Error('O aviso ou os destinatários mudaram. Atualize a prévia.');
    const props = PropertiesService.getScriptProperties();
    const pending = data.candidates.filter(m => !props.getProperty('receipt_' + hash_(id + '/' + m.address)));
    if (!pending.length) return {sent:0, message:'Nenhum destinatário elegível. Confira os resultados no portal.'};
    if (MailApp.getRemainingDailyQuota() < 1) throw Error('Cota Gmail indisponível. Nada foi enviado.');
    // The handoff is permanent. Updated portal clients cannot return this notice to EmailJS.
    const acquired = update_('gaia_notice_routes/' + id, current => {
      if (current && current.provider === 'emailjs' && current.status === 'sending') return;
      return {provider:'apps-script', status:'reserved', updatedAt:Date.now()};
    });
    if (!acquired) throw Error('EmailJS está em envio ou foi interrompido. Confira antes de transferir.');
    // Recheck after acquiring the route, since EmailJS could have finished during preview.
    if (fingerprint !== fingerprint_(load_(id))) throw Error('Estado mudou. Atualize a prévia; o aviso já está reservado ao Gmail.');
    let sent = 0;
    for (const member of pending.slice(0, MAX_BATCH_)) {
      if (MailApp.getRemainingDailyQuota() < 1) break;
      const key = 'receipt_' + hash_(id + '/' + member.address);
      // Private durable guard survives stale whole-collection writes from legacy portal code.
      // A crash after this point requires manual reconciliation, never automatic retry.
      props.setProperty(key, JSON.stringify({status:'sending', at:Date.now()}));
      record_(id, member, 'sending');
      try {
        MailApp.sendEmail({to:member.address, subject:String(data.notice.title),
          body:String(data.notice.body), name:'GAIA Robótica · UFTM'});
      } catch (error) {
        console.error('[email] provider=gmail status=unknown recipients=1');
        props.setProperty(key, JSON.stringify({status:'unknown', at:Date.now()}));
        record_(id, member, 'unknown', 'Resultado Gmail incerto. Conferir antes de qualquer reenvio.');
        throw Error('Envio interrompido com resultado incerto. Confira o registro; não reenviar automaticamente.');
      }
      props.setProperty(key, JSON.stringify({status:'sent', at:Date.now()}));
      record_(id, member, 'sent');
      console.info('[email] provider=gmail status=accepted recipients=1');
      sent++;
    }
    return {sent:sent, message:sent + ' aceitos pelo Gmail. Atualize a prévia para conferir os restantes.'};
  } finally { lock.releaseLock(); }
}
