// Motor de identidade: cruza o inventário do Google Fotos com o do iCloud Fotos
// usando só metadados (instante de captura e dimensões). Funções puras.
//
// Regras, medidas na prova de acesso e no inventário real:
// - O Google guarda o instante quase sempre sem milissegundos (truncado ou
//   arredondado); o iCloud guarda com milissegundos. Por isso o instante é
//   comparado com tolerância de 1 s.
// - As dimensões podem vir trocadas (orientação EXIF): largura × altura de um
//   lado igual a altura × largura do outro conta como a mesma foto.
// - Mesma proporção com área diferente = cópia reduzida (perda de qualidade de
//   um dos lados).
// - Mais de um candidato no mesmo segundo (rajadas, duplicatas) = par provável,
//   que precisa de confirmação visual (pHash) antes de qualquer decisão.

export const TOLERANCE_MS = 1000;

export const CLASSES = {
  ambos: 'Em ambos',
  confirmar: 'Em ambos, a confirmar',
  reduzida: 'Cópia reduzida',
  soGoogle: 'Só no Google',
  soIcloud: 'Só no iCloud',
};

/** Relação entre as dimensões de dois itens: 'igual', 'reduzida' ou null. */
export function dimRelation(a, b) {
  if (!a.w || !a.h || !b.w || !b.h) return null;
  if ((a.w === b.w && a.h === b.h) || (a.w === b.h && a.h === b.w)) return 'igual';
  const ra = a.w / a.h;
  const rb = b.w / b.h;
  const same = (x, y) => Math.abs(x - y) / Math.max(x, y) < 0.01;
  if (same(ra, rb) || same(ra, 1 / rb)) return 'reduzida';
  return null;
}

/**
 * Cruza as duas bibliotecas.
 * @param {Array} google itens normalizados do Google ({id, ts, w, h, ...})
 * @param {Array} icloud itens normalizados do iCloud
 * @param {{until?: number}} opts until: só considera itens até este instante
 *   (para cruzar enquanto o iCloud ainda está sendo lido)
 * @returns {{pairs: Array, soGoogle: Array, soIcloud: Array}}
 *   pairs: {a, g, cls: 'ambos'|'confirmar'|'reduzida', menor?: 'google'|'icloud', dt}
 */
export function matchLibraries(google, icloud, opts = {}) {
  const until = opts.until ?? Infinity;
  const G = google.filter((g) => g.ts <= until);
  const A = icloud.filter((a) => a.ts <= until);

  // índice do Google por segundo
  const bySec = new Map();
  for (const g of G) {
    const s = Math.floor(g.ts / 1000);
    let l = bySec.get(s);
    if (!l) bySec.set(s, (l = []));
    l.push(g);
  }
  const candidatesOf = (a) => {
    const s = Math.floor(a.ts / 1000);
    const out = [];
    for (const k of [s - 1, s, s + 1]) {
      for (const g of bySec.get(k) || []) {
        const dt = Math.abs(g.ts - a.ts);
        if (dt > TOLERANCE_MS) continue;
        const rel = dimRelation(a, g);
        if (rel) out.push({ g, rel, dt });
      }
    }
    // melhor primeiro: dimensões iguais, depois menor diferença de instante
    out.sort((x, y) => (x.rel === y.rel ? x.dt - y.dt : x.rel === 'igual' ? -1 : 1));
    return out;
  };

  const cands = new Map(); // id do iCloud -> candidatos
  const demand = new Map(); // id do Google -> quantos itens do iCloud o querem
  for (const a of A) {
    const c = candidatesOf(a);
    cands.set(a.id, c);
    for (const { g } of c) demand.set(g.id, (demand.get(g.id) || 0) + 1);
  }

  // atribuição um-para-um: primeiro os casos sem disputa, depois os demais
  const order = [...A].sort((x, y) => cands.get(x.id).length - cands.get(y.id).length || x.ts - y.ts);
  const usedG = new Set();
  const pairs = [];
  const soIcloud = [];
  for (const a of order) {
    const c = cands.get(a.id);
    const pick = c.find(({ g }) => !usedG.has(g.id));
    if (!pick) { soIcloud.push(a); continue; }
    usedG.add(pick.g.id);
    const disputed = c.length > 1 || demand.get(pick.g.id) > 1;
    const pair = { a, g: pick.g, dt: pick.dt };
    if (pick.rel === 'reduzida') {
      pair.cls = 'reduzida';
      pair.menor = a.w * a.h < pick.g.w * pick.g.h ? 'icloud' : 'google';
    } else {
      pair.cls = disputed ? 'confirmar' : 'ambos';
    }
    if (disputed) pair.disputado = true;
    pairs.push(pair);
  }
  const soGoogle = G.filter((g) => !usedG.has(g.id));
  return { pairs, soGoogle, soIcloud };
}

/** Itens do Google com outro item no mesmo segundo e mesmas dimensões: possível duplicata. */
export function googleSameSecondGroups(google) {
  const groups = new Map();
  for (const g of google) {
    const k = `${Math.floor(g.ts / 1000)}|${Math.min(g.w, g.h)}x${Math.max(g.w, g.h)}`;
    let l = groups.get(k);
    if (!l) groups.set(k, (l = []));
    l.push(g);
  }
  return [...groups.values()].filter((l) => l.length > 1);
}

/** Resumo do cruzamento: totais por classe e por ano (ano UTC da captura). */
export function summarizeMatch({ pairs, soGoogle, soIcloud }) {
  const totals = { ambos: 0, confirmar: 0, reduzida: 0, soGoogle: soGoogle.length, soIcloud: soIcloud.length };
  const reduzidaMenor = { google: 0, icloud: 0 };
  const byYear = {};
  const bump = (ts, cls) => {
    const y = new Date(ts).getUTCFullYear();
    byYear[y] ??= { ambos: 0, confirmar: 0, reduzida: 0, soGoogle: 0, soIcloud: 0 };
    byYear[y][cls]++;
  };
  for (const p of pairs) {
    totals[p.cls]++;
    if (p.cls === 'reduzida') reduzidaMenor[p.menor]++;
    bump(p.a.ts, p.cls);
  }
  for (const g of soGoogle) bump(g.ts, 'soGoogle');
  for (const a of soIcloud) bump(a.ts, 'soIcloud');
  return { totals, reduzidaMenor, byYear };
}

/** Limite do trecho já lido do iCloud enquanto o percurso não termina. */
export function partialUntil(icloud) {
  if (icloud.length < 100) return null;
  const ts = icloud.map((a) => a.ts).sort((x, y) => x - y);
  // a captura passiva traz alguns itens recentes logo no início; o percentil 99
  // marca o ponto até onde a grade foi percorrida em ordem
  return ts[Math.floor(ts.length * 0.99)];
}
