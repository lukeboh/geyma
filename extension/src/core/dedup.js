// Deduplicação dentro de cada serviço (Google e iCloud). Não apaga nada: diz
// quais itens são a mesma foto, qual cópia manter e quais sobram.
//
// Evidências, da mais forte para a mais fraca:
// - mesma impressão digital do arquivo original (iCloud: resOriginalFingerprint;
//   Google: SHA-1 do original) = arquivo idêntico;
// - mesmo pHash (distância ≤ 10) = mesma imagem, mesmo com bytes diferentes;
// - vídeos: mesma duração (até 250 ms ou 1%) no mesmo segundo e dimensões;
// - mesmo segundo de captura e mesmas dimensões = só candidata (rajadas e
//   sequências também caem aqui), precisa de uma das duas anteriores.
import { hamming, SAME_MAX, DIFFERENT_MIN } from './phash.js';
import { ehVideo, DURACAO_TOL_MS, DURACAO_TOL_FRAC } from './video.js';

// duração de um vídeo: a do iCloud (durMs) ou a da listagem do Google (videoMs)
const durDe = (it) => (ehVideo(it) ? it.durMs || it.videoMs || null : null);
const mesmaDuracao = (x, y) => {
  const dx = durDe(x);
  const dy = durDe(y);
  return Boolean(dx && dy) && Math.abs(dx - dy) <= Math.max(DURACAO_TOL_MS, DURACAO_TOL_FRAC * Math.max(dx, dy));
};

const exactKey = (it) => it.fingerprint || it.sha1 || null;

/** Candidatas: itens do mesmo serviço com o mesmo segundo, as mesmas dimensões (em qualquer orientação) e o mesmo tipo (foto ou vídeo). */
export function candidateGroups(items) {
  const groups = new Map();
  for (const it of items) {
    if (!it.w || !it.h) continue;
    const k = `${Math.floor(it.ts / 1000)}|${Math.min(it.w, it.h)}x${Math.max(it.w, it.h)}|${ehVideo(it) ? 'v' : 'f'}`;
    let l = groups.get(k);
    if (!l) groups.set(k, (l = []));
    l.push(it);
  }
  return [...groups.values()].filter((l) => l.length > 1);
}

/** Grupos de arquivos idênticos (mesma impressão digital), em qualquer instante. */
export function exactGroups(items) {
  const groups = new Map();
  for (const it of items) {
    const k = exactKey(it);
    if (!k) continue;
    let l = groups.get(k);
    if (!l) groups.set(k, (l = []));
    l.push(it);
  }
  return [...groups.values()].filter((l) => l.length > 1);
}

/** Qual cópia manter: mais pixels, depois mais bytes, depois favorita, depois a mais antiga no serviço. */
export function pickKeeper(list) {
  return [...list].sort((x, y) => (y.w * y.h) - (x.w * x.h)
    || (y.size || 0) - (x.size || 0)
    || Number(Boolean(y.favorite)) - Number(Boolean(x.favorite))
    || (x.seenAt || 0) - (y.seenAt || 0)
    || String(x.id).localeCompare(String(y.id)))[0];
}

const same = (x, y) => {
  if (exactKey(x) && exactKey(x) === exactKey(y)) return 'identico';
  const d = hamming(x.phash, y.phash);
  if (d !== null && d <= SAME_MAX) return 'imagem';
  if (mesmaDuracao(x, y)) return 'duracao';
  return null;
};

/**
 * Analisa as duplicatas de um serviço.
 * @returns {{
 *   copies: Map<string, {keeper: string, evidence: 'identico'|'imagem'}>,
 *   grupos: number, copias: number, identicos: number,
 *   diferentes: number, incertos: number, pendentes: number, pendingIds: string[]
 * }}
 */
export function analyzeDuplicates(items) {
  const out = { copies: new Map(), grupos: 0, copias: 0, identicos: 0, diferentes: 0, incertos: 0, pendentes: 0, pendingIds: [] };
  const seen = new Set();
  const addClusters = (clusters) => {
    for (const cl of clusters) {
      if (cl.items.length < 2) continue;
      const keeper = pickKeeper(cl.items);
      let added = 0;
      for (const it of cl.items) {
        if (it === keeper || out.copies.has(it.id)) continue;
        const evidence = same(it, keeper) || cl.evidence;
        out.copies.set(it.id, { keeper: keeper.id, evidence });
        out.copias++;
        added++;
        if (evidence === 'identico') out.identicos++;
      }
      // um grupo já contado (ex.: idênticos que também caem no mesmo segundo) não conta de novo
      if (added) out.grupos++;
    }
  };

  // 1. arquivos idênticos, em qualquer instante
  for (const l of exactGroups(items)) {
    addClusters([{ items: l, evidence: 'identico' }]);
    for (const it of l) seen.add(it.id);
  }

  // 2. candidatas de mesmo segundo: agrupa pela imagem (ou impressão digital)
  for (const l of candidateGroups(items)) {
    const clusters = [];
    let uncertain = false;

    for (const it of l) {
      const home = clusters.find((cl) => cl.items.some((o) => same(o, it)));
      if (home) { home.items.push(it); continue; }

      // vídeo com duração: a duração já decidiu (diferente = outro vídeo)
      if (!it.phash && !durDe(it)) out.pendingIds.push(it.id);
      if (clusters.some((cl) => { const d = hamming(cl.items[0].phash, it.phash); return d !== null && d < DIFFERENT_MIN; })) uncertain = true;
      clusters.push({ items: [it], evidence: 'imagem' });
    }
    const before = out.copias;
    addClusters(clusters);
    if (out.copias > before || l.every((it) => out.copies.has(it.id) || clusters.some((cl) => cl.items.length > 1 && cl.items.includes(it)))) continue;
    if (l.some((it) => !it.phash && !durDe(it))) out.pendentes++;
    else if (uncertain) out.incertos++;
    else out.diferentes++;
  }
  out.pendingIds = [...new Set(out.pendingIds)].filter((id) => !out.copies.has(id));
  return out;
}

/** Espaço que as cópias ocupam (bytes conhecidos; o Google não informa tamanho). */
export function copiesBytes(items, copies) {
  let n = 0;
  for (const it of items) if (copies.has(it.id)) n += it.size || it.fileV?.bytes || 0;
  return n;
}
