export function createD1Store(db) {
  return {
    async get(path) {
      const row = await db.prepare('SELECT value FROM state WHERE path = ?').bind(path).first();
      return row ? JSON.parse(row.value) : null;
    },
    async tx(path, fn) {
      for (let retry = 0; retry < 6; retry++) {
        const old = await db.prepare('SELECT value, version FROM state WHERE path = ?').bind(path).first();
        const current = old ? JSON.parse(old.value) : null;
        const next = fn(current);
        if (next === undefined) return {committed:false, value:current};
        const result = old
          ? await db.prepare('UPDATE state SET value = ?, version = version + 1 WHERE path = ? AND version = ?')
            .bind(JSON.stringify(next),path,old.version).run()
          : await db.prepare('INSERT INTO state(path,value,version) VALUES(?,?,1) ON CONFLICT(path) DO NOTHING')
            .bind(path,JSON.stringify(next)).run();
        if (result.meta.changes === 1) return {committed:true, value:next};
      }
      throw new Error('Concurrent update; retry admission with the same delivery identity');
    }
  };
}
