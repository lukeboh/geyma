// Worker do cruzamento: lê o inventário, cruza as bibliotecas e devolve o resumo
// e linhas compactas para a revisão, sem travar o painel.
import { getItemsBySource, getMeta } from './core/db.js';
import { classifyRow } from './core/classify.js';
import { matchLibraries, summarizeMatch, googleSameSecondGroups, partialUntil, analyzeGoogleDuplicates } from './core/match.js';

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

/** Itens do iCloud com miniatura e sem pHash em pares que a imagem decidiria (disputados ou reduzidos). */
function icloudPhashNeeded(pairs) {
  return pairs
    .filter((p) => (p.cls === 'confirmar' || p.cls === 'reduzida') && p.a.thumb && !p.a.phash)
    .map((p) => ({ id: p.a.id, url: p.a.thumb, at: p.a.thumbAt || 0 }));
}

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
    const scope = until ? google.filter((g) => g.ts <= until) : google;
    const dupGroups = googleSameSecondGroups(scope);
    const analysis = analyzeGoogleDuplicates(dupGroups);
    const extra = new Set(analysis.extraIds);
    const googleById = new Map(google.map((g) => [g.id, g]));
    const rows = [
      ...result.pairs.map((p) => row(p.cls, p.a, p.g, p.menor ? { menor: p.menor } : {})),
      ...result.soGoogle.map((g) => {
        if (!extra.has(g.id)) return row('soGoogle', null, g);
        const orig = googleById.get(analysis.extraOf[g.id]);
        return row('soGoogle', null, g, { dup: true, dupOf: orig ? { thumb: orig.thumb || null, key: orig.id.slice(2), w: orig.w, h: orig.h } : null });
      }),
      ...result.soIcloud.map((a) => row('soIcloud', a, null)),
    ];
    self.postMessage({
      ok: true,
      complete,
      until,
      summary,
      dup: {
        groups: dupGroups.length,
        extras: dupGroups.reduce((n, l) => n + l.length - 1, 0),
        confirmados: analysis.confirmados,
        extrasConfirmados: analysis.extrasConfirmados,
        diferentes: analysis.diferentes,
        incertos: analysis.incertos,
        pendentes: analysis.pendentes,
      },
      phashNeeded: phashNeeded(analysis.pendingIds, result.pairs, google),
      icloudPhashNeeded: icloudPhashNeeded(result.pairs),
      phashProgress: phashProgress ? { ...phashProgress.value, at: phashProgress.at } : null,
      counts: { google: google.length, icloud: icloud.length },
      rows,
    });
  } catch (err) {
    self.postMessage({ ok: false, reason: String(err.message || err) });
  }
};
