const test = require('node:test');
const assert = require('node:assert/strict');
const { today, validDate, period, register, report } = require('../attendance.js');

test('Brasília date, calendar month clamping and inclusive custom bounds', () => {
  assert.equal(today(new Date('2026-12-01T02:59:59Z')), '2026-11-30');
  assert.equal(today(new Date('2026-12-01T03:00:00Z')), '2026-12-01');
  const now = new Date('2024-03-31T12:00:00Z');
  for (const [kind, start] of [['1', '2024-02-29'], ['6', '2023-09-30'], ['12', '2023-03-31']]) {
    assert.deepEqual(period(kind, null, null, [], now), { start, end: '2024-03-31' });
  }
  assert.equal(validDate('2025-02-29'), false);
  assert.throws(() => period('custom', '2026-06-02', '2026-06-01', []));
  assert.throws(() => period('custom', '2026-02-31', '2026-03-01', []));
  assert.deepEqual(period('all', null, null, [{ date: 'invalid' }, { date: '2021-01-01' }]),
    { start: '2021-01-01', end: '2021-01-01' });
});

test('atomic attendance writes compose and repeating the same key is idempotent', () => {
  const base = {
    members: [{ id: 'a', name: 'Admin A', isAdmin: true }, { id: 'b', name: 'Admin B', isAdmin: true },
      { id: 'm', name: 'Membro', hours: 10, team: 'estrutura' }],
    sessions: { a: { ts: 3 } }, online: { b: { ts: 5 } }
  };
  const first = { id: 'r1', date: '2026-11-15', hours: 2, members: ['m', 'm'], byId: 'a' };
  const second = { ...first, id: 'r2', byId: 'b', hours: 3 };
  const afterFirst = register(base, first);
  assert.equal(register(afterFirst, first), afterFirst);
  const committed = register(afterFirst, second);
  assert.equal(base.members[2].hours, 10);
  assert.equal(committed.members[2].hours, 15);
  assert.deepEqual(committed.hoursLog.map(l => [l.attendanceId, l.delta]), [['r1', 2], ['r2', 3]]);
  assert.equal(committed.attendance[0].participants[0].team, 'estrutura');
  assert.deepEqual(committed.sessions, base.sessions);
  assert.deepEqual(committed.online, base.online);
  assert.equal(register(committed, { ...first, byId: 'm' }), undefined);
  assert.equal(register(committed, { ...second, id: 'r3', members: ['deleted'] }), undefined);
});

test('report counts distinct IDs and records, includes legacy attendees and excludes other dates', () => {
  const a = { id: 'one', date: '2026-06-01', hours: 3, members: ['x', 'y', 'x'],
    memberNames: ['Ana', 'Ana', 'Ana'], by: 'Admin' };
  const b = { ...a, id: 'two', date: '2026-06-30', hours: 2, members: ['x'] };
  const outside = { ...a, id: 'old', date: '2026-05-31' };
  const roster = [{ id: 'x', name: 'Ana', hours: 999, team: 'eletronica' }];
  const bounds = { start: '2026-06-01', end: '2026-06-30' };
  const data = report([a, a, b, outside], roster, bounds, x => x.toUpperCase());
  assert.deepEqual(data.summary.map(m => m.slice(0, 6)),
    [['Ana', 'x', 'ELETRONICA', '', 2, 5], ['Ana', 'y', '', '', 1, 3]]);
  assert.deepEqual(data.activities.map(a => a.slice(2, 5)), [[3, 2, 6], [2, 1, 2]]);
  assert.equal(data.details.length, 3);
  assert.deepEqual(report([outside], roster, bounds, String), { summary: [], details: [], activities: [] });
});
