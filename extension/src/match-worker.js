// Worker do cruzamento: lê o inventário, cruza as bibliotecas e devolve o resumo
// e linhas compactas para a revisão, sem travar o painel.
import { getItemsBySource, getMeta } from './core/db.js';
import { matchLibraries, summarizeMatch, googleSameSecondGroups, partialUntil, analyzeGoogleDuplicates } from './core/match.js';

const row = (cls, a, g, extra = {}) => ({
  cls,
  ts: (a || g).ts,
  a: a && { name: a.filename, w: a.w, h: a.h, size: a.size, type: a.fileType, video: a.video },
  g: g && { w: g.w, h: g.h },
  ...extra,
});

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
    const rows = [
      ...result.pairs.map((p) => row(p.cls, p.a, p.g, p.menor ? { menor: p.menor } : {})),
      ...result.soGoogle.map((g) => row('soGoogle', null, g, extra.has(g.id) ? { dup: true } : {})),
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
      phashNeeded: analysis.pendingIds.map((id) => id.slice(2)),
      phashProgress: phashProgress?.value || null,
      counts: { google: google.length, icloud: icloud.length },
      rows,
    });
  } catch (err) {
    self.postMessage({ ok: false, reason: String(err.message || err) });
  }
};
