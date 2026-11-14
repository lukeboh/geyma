// Filtro da revisão, usado pelo painel e pela versão para celular.
import { suggestDecision } from './classify.js';

/**
 * @param rows linhas do cruzamento
 * @param f {cls, cat, dec, year, kind}: cls '' = todas, 'dupGoogle'/'dupIcloud' = cópias;
 *   dec 'sugestao' = sem marcação; kind 'foto'|'video'
 * @returns linhas filtradas, da mais recente para a mais antiga
 */
export function filterRows(rows, f = {}) {
  const { cls = '', cat = '', dec = '', year = '', kind = '' } = f;
  return rows.filter((r) => (cls === '' || (cls === 'dupGoogle' ? r.dup : cls === 'dupIcloud' ? r.dupIcloud : r.cls === cls))
    && (!cat || r.cat === cat)
    && (!dec || (dec === 'sugestao' ? !r.decision : r.decision === dec))
    && (!year || new Date(r.ts).getUTCFullYear() === Number(year))
    && (!kind || (kind === 'video') === Boolean(r.a?.video)))
    .sort((x, y) => y.ts - x.ts);
}

/** Contagem do que está em vigor (marcação do usuário ou sugestão) e de quantas o usuário marcou. */
export function decisionCounts(rows) {
  const counts = { pessoal: 0, pendente: 0, manter: 0, descartar: 0 };
  let decided = 0;
  for (const r of rows) {
    counts[r.decision || suggestDecision(r.cat)]++;
    if (r.decision) decided++;
  }
  return { counts, decided, total: rows.length };
}
