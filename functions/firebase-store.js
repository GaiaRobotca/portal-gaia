'use strict';
function createFirebaseStore(root) {
  const refAt = path => (typeof root === 'function' ? root() : root).child(path);
  return {
    async get(path) { return (await refAt(path).get()).val(); },
    async tx(path, fn) {
      const ref = refAt(path);
      const observer = () => {};
      // A one-shot read alone can be evicted before a conditional transaction starts.
      // Keep a listener attached so a cold cache is not mistaken for a missing delivery.
      ref.on('value', observer);
      try {
        await ref.once('value');
        const r = await ref.transaction(fn, undefined, false);
        return {committed:r.committed, value:r.snapshot.val()};
      } finally { ref.off('value', observer); }
    }
  };
}
module.exports = {createFirebaseStore};
