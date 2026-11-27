const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright-core');
const ExcelJS = require('exceljs');
const { register, period } = require('../attendance.js');

const root = path.resolve(__dirname, '..');
const excelBundle = require.resolve('exceljs/dist/exceljs.min.js');
const output = process.env.GAIA_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'gaia-attendance-'));
fs.mkdirSync(output, { recursive: true });
const now = new Date('2026-12-01T02:55:00Z');
const legacy = { id: 'old', date: '2026-06-01', desc: '=1+1', hours: 3,
  members: ['former'], memberNames: ['Ex-membro fictício'], by: 'Admin A' };
const person = (id, name, isAdmin = false) => ({
  id, name, isAdmin, username: id, password: 'ficticia', team: 'estrutura', role: 'Membro',
  color: '#007A3F', hours: 10, metrics: {}
});
let data = {
  members: [person('a', 'Admin A', true), person('b', 'Admin B', true),
    person('m', 'Ana Fictícia'), person('n', 'Bruno Fictício')],
  attendance: [legacy], sessions: {}, online: {}
};
let nextKey = 0;
let commits = 0;
let heartbeatWrites = 0;
let fail = false;

// Read and write callbacks run in Chromium. The Node double owns the shared state,
// replays operations on the latest snapshot and sends that state to each client.
function installDouble(initial) {
  const listeners = new Map();
  let state = initial;
  let connected = true;
  const at = p => p === '.info/connected' ? connected :
    p.split('/').filter(Boolean).reduce((v, key) => v?.[key], state);
  const snap = p => ({ val: () => structuredClone(at(p)) });
  const emit = p => (listeners.get(p) || []).forEach(fn => fn(snap(p)));
  window.receive = value => { state = value; for (const p of listeners.keys()) emit(p); };
  window.setConnected = value => { connected = value; emit('.info/connected'); };
  window.firebase = { initializeApp() {}, database: () => ({ ref: makeRef }) };
  function makeRef(absolute = '') {
    const p = absolute.replace(/^gaia_v7\/?/, '');
    return {
      child: key => makeRef([p, key].filter(Boolean).join('/')),
      on(_event, fn) {
        if (!listeners.has(p)) listeners.set(p, []);
        listeners.get(p).push(fn);
        queueMicrotask(() => fn(snap(p)));
      },
      once(_event, fn) { return Promise.resolve().then(() => fn ? fn(snap(p)) : snap(p)); },
      push: () => ({ key: 'test-' + CU.id + '-' + (++window.sequence) }),
      onDisconnect: () => ({ update: async () => {} }),
      set: value => window.dbWrite(p, value, false),
      update: value => window.dbWrite(p, value, true),
      async transaction(fn) {
        const proposal = fn(structuredClone(state));
        if (!proposal) return { committed: false };
        const record = proposal.attendance.find(a => !state.attendance.some(b => b.id === a.id));
        return window.dbCommit(record);
      }
    };
  }
  window.sequence = 0;
}

async function run() {
  const launch = { args: ['--no-sandbox'], executablePath: process.env.GAIA_CHROMIUM };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ acceptDownloads: true, locale: 'pt-BR' });
  const pages = [];
  const sync = () => Promise.all(pages.map(p => p.evaluate(v => window.receive(v), data)));
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'gaia.test') {
      const file = path.join(root, url.pathname === '/' ? 'index.html' : path.basename(url.pathname));
      return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
    }
    if (url.href === 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js') {
      return route.fulfill({ path: excelBundle, contentType: 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.abort();
  });

  async function open(user, viewport) {
    const page = await context.newPage({ viewport });
    if (viewport) await page.setViewportSize(viewport);
    await page.clock.install({ time: now });
    await page.addInitScript(installDouble, data);
    await page.exposeBinding('dbWrite', async (_, key, value, merge) => {
      const [rootKey, uid] = key.split('/');
      assert.ok(['sessions', 'online'].includes(rootKey));
      if (rootKey === 'sessions') heartbeatWrites++;
      data[rootKey][uid] = merge ? { ...data[rootKey][uid], ...value } : value;
      await sync();
    });
    await page.exposeBinding('dbCommit', async (_, record) => {
      assert.ok(record);
      nextKey++;
      await new Promise(resolve => setTimeout(resolve, 35));
      if (fail) throw new Error('Conexão interrompida antes da confirmação');
      const updated = register(data, record);
      if (!updated) return { committed: false };
      if (updated !== data) commits++;
      data = updated;
      await sync();
      return { committed: true };
    });
    await page.goto('http://gaia.test/');
    pages.push(page);
    await page.locator('#li-user').fill(user);
    await page.locator('#li-pass').fill('ficticia');
    await page.evaluate(() => doLogin());
    await page.evaluate(() => goPage('attendance', el('nav-attendance')));
    return page;
  }

  const checks = page => page.locator('#att-members input');
  async function draft(page, activity, description, hours, selected) {
    await page.locator('#att-date').fill(activity);
    await page.locator('#att-desc').fill(description);
    await page.locator('#att-hrs').fill(String(hours));
    for (const i of selected) await checks(page).nth(i).check();
  }
  async function verifyDraft(page) {
    assert.equal(await page.locator('#att-date').inputValue(), '2026-11-29');
    assert.equal(await page.locator('#att-desc').inputValue(), 'Reunião fictícia');
    assert.equal(await page.locator('#att-hrs').inputValue(), '3');
    assert.equal(await page.locator('#att-members :checked').count(), 2);
    assert.equal(await page.locator('#att-count').textContent(), '2 selecionados');
    assert.ok(await page.evaluate(() => window.firstCheckbox === document.querySelector('#att-members input')));
  }

  try {
    console.log('Opening isolated desktop portal');
    const desktop = await open('a', { width: 1366, height: 900 });
    assert.equal(await desktop.locator('#att-date').inputValue(), '2026-11-30');
    await draft(desktop, '2026-11-29', 'Reunião fictícia', 3, [2, 3]);
    await desktop.evaluate(() => { window.firstCheckbox = document.querySelector('#att-members input'); });
    let elapsed = 0;
    for (const seconds of [30, 60, 120, 300]) {
      if (process.env.GAIA_REAL_TIME) {
        await new Promise(resolve => setTimeout(resolve, (seconds - elapsed) * 1000));
      } else {
        await desktop.clock.runFor((seconds - elapsed) * 1000);
      }
      data.online.b = { uid: 'b', ts: Date.now() };
      data.notices = [{ id: 'fake-' + seconds }];
      await sync();
      await verifyDraft(desktop);
      elapsed = seconds;
      console.log('Draft preserved at ' + seconds + ' seconds');
    }
    assert.equal(heartbeatWrites, 5);
    console.log('Draft retained through 30, 60, 120 and 300 seconds (' +
      (process.env.GAIA_REAL_TIME ? 'wall clock' : 'browser clock') + ')');
    await desktop.locator('#att-all').click();
    assert.equal(await desktop.locator('#att-members :checked').count(), 4);
    await desktop.locator('#att-all').click();
    assert.equal(await desktop.locator('#att-members :checked').count(), 0);
    await checks(desktop).nth(2).check();
    await checks(desktop).nth(3).check();
    await desktop.evaluate(() => window.setConnected(false));
    await desktop.locator('#att-save').click();
    await verifyDraft(desktop);
    assert.equal(nextKey, 0);
    await desktop.evaluate(() => window.setConnected(true));
    fail = true;
    await desktop.locator('#att-save').click();
    await desktop.waitForFunction(() => !el('att-save').disabled);
    await verifyDraft(desktop);
    assert.equal(nextKey, 1);
    const originalId = await desktop.evaluate(() => attAttempt.id);

    const mobile = await open('b', { width: 390, height: 844 });
    await draft(mobile, '2026-11-28', 'Reunião do outro administrador', 4, [2]);
    fail = false;
    await Promise.all([
      desktop.evaluate(() => Promise.all([saveAttendance(), saveAttendance()])),
      mobile.evaluate(() => saveAttendance())
    ]);
    assert.equal(nextKey, 3);
    assert.equal(commits, 2);
    assert.equal(data.members.find(m => m.id === 'm').hours, 17);
    assert.equal(data.members.find(m => m.id === 'n').hours, 13);
    assert.equal(data.attendance.filter(a => a.id === originalId).length, 1);
    assert.equal(data.hoursLog.length, 3);
    assert.equal(await desktop.locator('#att-desc').inputValue(), '');
    assert.equal(await desktop.locator('#att-members :checked').count(), 0);

    await desktop.locator('#att-export-toggle').click();
    for (const [kind, start, end, expected] of [
      ['1', null, null, 3], ['6', null, null, 4], ['12', null, null, 4],
      ['all', null, null, 4], ['custom', '2026-11-28', '2026-11-29', 3],
      ['custom', '2025-01-01', '2025-01-02', 0]
    ]) {
      await desktop.locator('#att-period').selectOption(kind);
      if (kind === 'custom') {
        await desktop.locator('#att-from').fill(start);
        await desktop.locator('#att-to').fill(end);
      }
      const current = new Date(await desktop.evaluate(() => Date.now()));
      const range = period(kind, start, end, data.attendance, current);
      const pending = desktop.waitForEvent('download');
      await desktop.locator('#att-download').click();
      const download = await pending;
      assert.equal(download.suggestedFilename(), `GAIA_Presencas_${range.start}_a_${range.end}.xlsx`);
      const file = path.join(output, download.suggestedFilename());
      await download.saveAs(file);
      const book = new ExcelJS.Workbook();
      await book.xlsx.readFile(file);
      assert.deepEqual(book.worksheets.map(s => s.name), ['Resumo de horas', 'Histórico detalhado', 'Resumo das atividades']);
      const detail = book.worksheets[1];
      assert.equal(detail.rowCount, expected + 1);
      assert.ok(book.worksheets.every(s => s.autoFilter));
      if (expected) assert.equal(typeof detail.getCell('E2').value, 'number');
      if (kind === 'all') {
        assert.equal(detail.getCell('B2').value, '=1+1');
        assert.equal(book.worksheets[0].getCell('F2').value, 7);
      }
    }
    await desktop.locator('#att-from').fill('2026-03-02');
    await desktop.locator('#att-to').fill('2026-03-01');
    await desktop.locator('#att-download').click();
    assert.match(await desktop.locator('#toast-c').textContent(), /intervalo válido/);

    for (const [page, name] of [[desktop, 'desktop'], [mobile, 'mobile']]) {
      if (page === mobile) await page.locator('#att-export-toggle').click();
      await page.locator('#att-period').selectOption('custom');
      await page.locator('#att-from').fill('2026-11-01');
      await page.locator('#att-to').fill('2026-11-30');
      assert.ok(await page.locator('#att-download').isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.locator('#att-download').focus();
      await page.evaluate(() => el('toast-c').replaceChildren());
      await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
    }
    const member = await open('m');
    assert.equal(await member.locator('#att-export-toggle').isVisible(), false);
    assert.equal(await member.locator('#att-form').isVisible(), false);
    await member.evaluate(() => exportAttendance());
    assert.equal(await member.evaluate(() => !!excelWriter), false);
    console.log('PASS: timer, Firebase updates, drafts, retry, simultaneous admins, XLSX and responsive UI.');
    console.log(output);
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
