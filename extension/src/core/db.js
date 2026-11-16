// Inventário local da extensão (IndexedDB na origem da extensão).
import { applyChange } from './inv-summary.js';
import { juntarDecisoes } from './calc-cache.js';

const DB_NAME = 'geyma';
const DB_VERSION = 3;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'id' });
        items.createIndex('source', 'source');
        items.createIndex('ts', 'ts');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      // miniaturas do iCloud guardadas no notebook (as URLs da Apple expiram)
      if (!db.objectStoreNames.contains('thumbs')) db.createObjectStore('thumbs', { keyPath: 'id' });
      // resultados prontos (o último cruzamento), para o painel abrir na hora
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
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

// meta 'inventario' = { versao, resumo }: versao muda a cada gravação que afeta
// o cruzamento (o painel compara com a do cruzamento guardado); resumo é a
// contagem por serviço (inv-summary.js), null até o primeiro cruzamento.
function touchInventory(meta, change) {
  const req = meta.get('inventario');
  req.onsuccess = () => {
    const v = req.result?.value || { versao: 0, resumo: null };
    if (change && v.resumo) change(v.resumo);
    meta.put({ key: 'inventario', value: { ...v, versao: Date.now() }, at: Date.now() });
  };
}

const CAMPOS_CRUZAMENTO = ['source', 'ts', 'w', 'h', 'video', 'size', 'phash', 'filename', 'fileType', 'motionMs', 'extrasLidos', 'live', 'hidden', 'foraDoPercurso'];

/**
 * Grava itens mesclando com o registro existente: campos calculados depois
 * (como o pHash) sobrevivem a uma nova leitura, e seenAt guarda a primeira vez
 * em que o item foi visto. Mantém o resumo do inventário em dia.
 */
export function putItems(items) {
  const now = Date.now();
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(['items', 'meta'], 'readwrite');
    const store = t.objectStore('items');
    const trocas = [];
    let falta = items.length;
    const fim = () => {
      // links novos da Apple (a cada passada) não mudam o cruzamento
      const relevantes = trocas.filter(([a, d]) => !a || CAMPOS_CRUZAMENTO.some((k) => a[k] !== d[k]));
      if (relevantes.length) touchInventory(t.objectStore('meta'), (resumo) => { for (const [a, d] of relevantes) applyChange(resumo, a, d); });
    };
    for (const it of items) {
      const req = store.get(it.id);
      req.onsuccess = () => {
        const novo = { ...req.result, ...it, seenAt: req.result?.seenAt ?? now };
        store.put(novo);
        trocas.push([req.result, novo]);
        if (--falta === 0) fim();
      };
    }
    if (!items.length) resolve(0);
    t.oncomplete = () => resolve(items.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/**
 * Acrescenta campos a itens já existentes ([{id, ...campos}]); ignora ids
 * ausentes. versao: false para mudanças que não alteram o cruzamento (marcações).
 */
export function patchItems(patches, { versao = true } = {}) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(['items', 'meta'], 'readwrite');
    const store = t.objectStore('items');
    for (const p of patches) {
      const req = store.get(p.id);
      req.onsuccess = () => { if (req.result) store.put({ ...req.result, ...p }); };
    }
    if (versao && patches.length) touchInventory(t.objectStore('meta'));
    t.oncomplete = () => resolve(patches.length);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/**
 * Grava o resumo do inventário calculado do zero, se nada mudou desde a
 * leitura (versaoLida); senão a contagem incremental segue valendo.
 */
export function setInventorySummary(resumo, versaoLida) {
  return tx('meta', 'readwrite', (meta) => {
    const req = meta.get('inventario');
    req.onsuccess = () => {
      const v = req.result?.value || { versao: 0 };
      if ((v.versao || 0) === (versaoLida || 0)) meta.put({ key: 'inventario', value: { ...v, resumo }, at: Date.now() });
    };
  });
}

/**
 * Lista curta das marcações feitas depois do último cruzamento (calc-cache.js).
 * novas = { id: { d, at } }; lidoAte descarta as que o cruzamento já leu.
 */
export function registrarDecisoes(novas, lidoAte = 0) {
  return tx('meta', 'readwrite', (meta) => {
    const req = meta.get('decisoesRecentes');
    req.onsuccess = () => meta.put({ key: 'decisoesRecentes', value: juntarDecisoes(req.result?.value, novas, lidoAte), at: Date.now() });
  });
}

export function putCache(key, value) {
  return tx('cache', 'readwrite', (store) => { store.put(value, key); });
}

export function getCache(key) {
  return tx('cache', 'readonly', (store) => store.get(key)).then((r) => r ?? null);
}

/** Guarda miniaturas ([{id, blob}]). */
export function putThumbs(list) {
  return tx('thumbs', 'readwrite', (store) => {
    for (const t of list) store.put({ id: t.id, blob: t.blob, at: Date.now() });
    return list.length;
  });
}

/** Miniatura guardada de um item (Blob) ou null. */
export function getThumb(id) {
  return tx('thumbs', 'readonly', (store) => store.get(id)).then((r) => r?.blob || null);
}

/** Ids com miniatura guardada. */
export function thumbIds() {
  return tx('thumbs', 'readonly', (store) => store.getAllKeys());
}

export function getItem(id) {
  return tx('items', 'readonly', (store) => store.get(id)).then((r) => r || null);
}

/** Datas (ts) de todas as fotos do iCloud, em ordem, sem carregar os itens. */
export function icloudTsSorted() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const out = [];
    const t = db.transaction('items', 'readonly');
    t.objectStore('items').index('ts').openKeyCursor().onsuccess = (e) => {
      const c = e.target.result;
      if (!c) return;
      if (String(c.primaryKey).startsWith('a:')) out.push(c.key);
      c.continue();
    };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  }));
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
        const t = db.transaction(['items', 'meta'], 'readwrite');
        touchInventory(t.objectStore('meta'), (resumo) => { delete resumo[source]; });
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
