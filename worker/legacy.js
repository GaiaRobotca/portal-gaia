export async function reserveNotice(input, idToken, env, transport = fetch) {
  if (input.category !== 'notice') return;
  const base = env.FIREBASE_DATABASE_URL;
  if (!/^https:\/\/[a-z0-9-]+\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/.test(base || '')) throw new Error('invalid_database');
  // ID token is forwarded only to the configured Firebase host, never persisted or logged.
  const url = path => base + '/' + path + '.json?auth=' + encodeURIComponent(idToken);
  const notices = await transport(url('gaia_v7/notices'), {signal:AbortSignal.timeout(10000)});
  if (!notices.ok) throw new Error('legacy_read_failed');
  const notice = Object.values(await notices.json() || {}).find(n=>n?.id === input.entityId);
  if (!notice || notice.emailSent || Object.keys(notice.emailDelivery || {}).length) throw new Error('legacy_delivery_requires_review');
  const routeUrl = url('gaia_notice_routes/' + input.entityId);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await transport(routeUrl, {headers:{'X-Firebase-ETag':'true'}, signal:AbortSignal.timeout(10000)});
    if (!r.ok) throw new Error('legacy_route_unavailable');
    const route = await r.json();
    if (route?.provider === 'backend') return;
    if (route) throw new Error('legacy_route_owned');
    const etag = r.headers.get('etag');
    if (!etag) throw new Error('legacy_etag_missing');
    const saved = await transport(routeUrl, {method:'PUT',headers:{'Content-Type':'application/json','if-match':etag},
      body:JSON.stringify({provider:'backend',status:'reserved',updatedAt:Date.now()}),signal:AbortSignal.timeout(10000)});
    if (saved.ok) return;
    if (saved.status !== 412) throw new Error('legacy_route_rejected');
  }
  throw new Error('legacy_route_conflict');
}
