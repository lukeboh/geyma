// Camada de persistência: tudo fica no IndexedDB do navegador.
// Stores:
//   settings     — chave/valor (clientId etc.)
//   googlePhotos — metadados importados do Google Fotos (Picker API)
//   applePhotos  — metadados lidos da pasta local do iCloud Fotos

const DB_NAME = 'geyma';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
      if (!db.objectStoreNames.contains('googlePhotos')) {
        db.createObjectStore('googlePhotos', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('applePhotos')) {
        db.createObjectStore('applePhotos', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSetting(key) {
  const db = await open();
  return promisify(tx(db, 'settings', 'readonly').get(key));
}

export async function setSetting(key, value) {
  const db = await open();
  return promisify(tx(db, 'settings', 'readwrite').put(value, key));
}

export async function putAll(storeName, records) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    for (const record of records) store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAll(storeName) {
  const db = await open();
  return promisify(tx(db, storeName, 'readonly').getAll());
}

export async function count(storeName) {
  const db = await open();
  return promisify(tx(db, storeName, 'readonly').count());
}

export async function clearStore(storeName) {
  const db = await open();
  return promisify(tx(db, storeName, 'readwrite').clear());
}

export async function clearAll() {
  await Promise.all(['settings', 'googlePhotos', 'applePhotos'].map(clearStore));
}
