'use strict';
function createFirebaseStore(root) {
  const refAt = path => (typeof root === 'function' ? root() : root).child(path);
  return {
    async get(path) { return (await refAt(path).get()).val(); },
    async tx(path, fn) {
      const ref = refAt(path);
      await ref.once('value');
      const r = await ref.transaction(fn, undefined, false);
      return {committed:r.committed, value:r.snapshot.val()};
    }
  };
}
module.exports = {createFirebaseStore};
