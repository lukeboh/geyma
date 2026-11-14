// Worker do cruzamento: lê o inventário, cruza as bibliotecas e devolve o resumo
// e linhas compactas para a revisão, sem travar o painel.
import { getItemsBySource, getMeta } from './core/db.js';
import { classifyRow } from './core/classify.js';
import { matchLibraries, summarizeMatch, partialUntil } from './core/match.js';
import { analyzeDuplicates, candidateGroups, copiesBytes } from './core/dedup.js';

const row = (cls, a, g, extra = {}) => {
  const { cat, reasons } = classifyRow(a, g);
  return {
    cls,
    ts: (a || g).ts,
    ids: [a?.id, g?.id].filter(Boolean),
    cat,
    why: reasons.join('; '),
    decision: a?.decision || g?.decision || null,
    a: a && { name: a.filename, w: a.w, h: a.h, size: a.size, type: a.fileType, video: a.video, thumb: a.thumb || null, thumbAt: a.thumbAt || null },
    g: g && { w: g.w, h: g.h, thumb: g.thumb || null, key: g.id.slice(2) },
    ...extra,
  };
};

/** Itens do Google sem pHash que ajudariam a decidir: grupos de duplicatas e candidatos de pares disputados. */
function phashNeeded(pendingIds, pairs, google) {
  const hasHash = new Set(google.filter((g) => g.phash).map((g) => g.id));
  const need = new Set(pendingIds);
  for (const p of pairs) for (const id of p.candidatos || []) if (!hasHash.has(id)) need.add(id);
  return [...need].map((id) => id.slice(2));
}

/** Itens do iCloud com miniatura e sem pHash que a imagem decidiria: pares disputados ou reduzidos e candidatas a duplicata. */
function icloudPhashNeeded(pairs, dupPending, icloudById) {
  const need = new Map();
  for (const p of pairs) {
    if ((p.cls === 'confirmar' || p.cls === 'reduzida') && p.a.thumb && !p.a.phash) need.set(p.a.id, p.a);
  }
  for (const id of dupPending) { const a = icloudById.get(id); if (a?.thumb && !a.phash) need.set(id, a); }
  return [...need.values()].map((a) => ({ id: a.id, url: a.thumb, at: a.thumbAt || 0 }));
}

/** Resumo de duplicatas de um serviço para o painel. */
const dupSummary = (items, d) => ({
  candidatos: candidateGroups(items).length,
  grupos: d.grupos,
  copias: d.copias,
  identicos: d.identicos,
  diferentes: d.diferentes,
  incertos: d.incertos,
  pendentes: d.pendentes,
  bytes: copiesBytes(items, d.copies),
});

/** Miniatura da cópia a manter, para mostrar ao lado da cópia na revisão. */
const keeperInfo = (it, side) => it && { thumb: it.thumb || null, key: side === 'google' ? it.id.slice(2) : null, side, w: it.w, h: it.h };

self.onmessage = async () => {
  try {
    const [google, icloud, progress, completed, counts, phashProgress] = await Promise.all([
      getItemsBySource('google'),
      getItemsBySource('icloud'),
      getMeta('icloudProgress'),
      getMeta('icloudCompleted'),
      getMeta('icloudCounts'),
      getMeta('phashProgress'),
    ]);
    // percurso concluído alguma vez, ou inventário do tamanho do total oficial da Apple
    const appleTotal = counts?.value?.CPLAssetByAssetDateWithoutHiddenOrDeleted;
    const complete = Boolean(completed) || progress?.value?.state === 'concluido' || Boolean(appleTotal && icloud.length >= appleTotal);
    const until = complete ? null : partialUntil(icloud);
    const result = matchLibraries(google, icloud, { until: until ?? Infinity });
    const summary = summarizeMatch(result);
    const scopeG = until ? google.filter((g) => g.ts <= until) : google;
    const scopeA = until ? icloud.filter((x) => x.ts <= until) : icloud;
    const dupG = analyzeDuplicates(scopeG);
    const dupA = analyzeDuplicates(scopeA);
    const googleById = new Map(google.map((g) => [g.id, g]));
    const icloudById = new Map(icloud.map((x) => [x.id, x]));
    // marca a linha como cópia (de um lado ou dos dois) e traz a cópia a manter
    const dupInfo = (a, g) => {
      const extra = {};
      const cg = g && dupG.copies.get(g.id);
      const ca = a && dupA.copies.get(a.id);
      if (cg) { extra.dup = true; extra.dupOf = keeperInfo(googleById.get(cg.keeper), 'google'); extra.dupEvidence = cg.evidence; }
      if (ca) { extra.dupIcloud = true; extra.dupOfIcloud = keeperInfo(icloudById.get(ca.keeper), 'icloud'); extra.dupEvidenceIcloud = ca.evidence; }
      return extra;
    };
    const rows = [
      ...result.pairs.map((p) => row(p.cls, p.a, p.g, { ...(p.menor ? { menor: p.menor } : {}), ...dupInfo(p.a, p.g) })),
      ...result.soGoogle.map((g) => row('soGoogle', null, g, dupInfo(null, g))),
      ...result.soIcloud.map((x) => row('soIcloud', x, null, dupInfo(x, null))),
    ];
    self.postMessage({
      ok: true,
      complete,
      until,
      summary,
      dup: { google: dupSummary(scopeG, dupG), icloud: dupSummary(scopeA, dupA) },
      phashNeeded: phashNeeded(dupG.pendingIds, result.pairs, google),
      icloudPhashNeeded: icloudPhashNeeded(result.pairs, dupA.pendingIds, icloudById),
      phashProgress: phashProgress ? { ...phashProgress.value, at: phashProgress.at } : null,
      counts: { google: google.length, icloud: icloud.length },
      rows,
    });
  } catch (err) {
    self.postMessage({ ok: false, reason: String(err.message || err) });
  }
};
