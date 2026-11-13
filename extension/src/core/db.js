// Inventário local da extensão (IndexedDB na origem da extensão).
const DB_NAME = 'geyma';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const items = db.createObjectStore('items', { keyPath: 'id' });
      items.createIndex('source', 'source');
      items.createIndex('ts', 'ts');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const result = fn(t.objectStore(store));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

/** Grava itens; mantém o primeiro registro de quando o item foi visto. */
export function putItems(items) {
  const now = Date.now();
  return tx('items', 'readwrite', (store) => {
    for (const it of items) store.put({ ...it, seenAt: now });
    return items.length;
  });
}

export function countBySource(source) {
  return tx('items', 'readonly', (store) => store.index('source').count(source));
}

export function getItemsBySource(source) {
  return tx('items', 'readonly', (store) => store.index('source').getAll(source));
}

export function setMeta(key, value) {
  return tx('meta', 'readwrite', (store) => store.put({ key, value, at: Date.now() }));
}

export function getMeta(key) {
  return tx('meta', 'readonly', (store) => store.get(key)).then((r) => r || null);
}

export function clearSource(source) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction('items', 'readwrite');
        const idx = t.objectStore('items').index('source');
        idx.openCursor(IDBKeyRange.only(source)).onsuccess = (e) => {
          const c = e.target.result;
          if (c) { c.delete(); c.continue(); }
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
      }),
  );
}
