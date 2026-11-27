const assert = require('node:assert/strict');
const firebase = require('firebase/compat/app');
require('firebase/compat/database');
const { register } = require('../attendance.js');

// The fake demo project and loopback address are fixed to keep this off production.
const projectId = 'demo-gaia-attendance';
const apps = ['first', 'second', 'viewer'].map(name => firebase.initializeApp({
  projectId, databaseURL: `https://${projectId}.firebaseio.com`
}, name));
const databases = apps.map(app => {
  const db = app.database();
  db.useEmulator('127.0.0.1', 9017);
  return db.ref('att-test-' + process.pid);
});

async function run() {
  const [a, b, observer] = databases;
  await observer.set({
    members: [{ id: 'a', isAdmin: true, name: 'Admin A' },
      { id: 'b', isAdmin: true, name: 'Admin B' }, { id: 'm', name: 'Membro', hours: 2 }],
    sessions: { a: { todaySeconds: 60 } }, online: { b: { ts: 60 } }
  });
  // Mimic the portal's root subscription before attempting the write.
  a.on('value', () => {});
  b.on('value', () => {});
  await Promise.all([a.once('value'), b.once('value')]);
  const record = { id: 'attendance-a', byId: 'a', date: '2026-11-27', desc: 'A', hours: 3, members: ['m'] };
  const other = { ...record, id: 'attendance-b', byId: 'b', desc: 'B', hours: 4 };
  const apply = (ref, r) => ref.transaction(state => register(state, r), undefined, false);
  const [first, second] = await Promise.all([apply(a, record), apply(b, other),
    observer.child('online/b').update({ ts: 120 })]);
  assert.ok(first.committed && second.committed);
  assert.ok((await apply(a, record)).committed);
  const result = (await observer.once('value')).val();
  assert.equal(result.members[2].hours, 9);
  assert.equal(result.attendance.length, 2);
  assert.equal(result.hoursLog.length, 2);
  assert.deepEqual(new Set(result.hoursLog.map(log => log.attendanceId)), new Set([record.id, other.id]));
  assert.equal(result.sessions.a.todaySeconds, 60);
  assert.equal(result.online.b.ts, 120);
  console.log('PASS: Firebase compat SDK + Realtime Database emulator, two concurrent administrators and idempotent retry.');
}

const deadline = setTimeout(() => {
  console.error('Timed out waiting for the local Firebase emulator.');
  process.exit(1);
}, 20000);
run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(apps.map(app => app.delete()));
  clearTimeout(deadline);
});
