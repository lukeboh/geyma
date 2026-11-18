// Resumo do inventário mantido a cada gravação, para o painel abrir sem ler
// centenas de milhares de itens. É o mesmo formato de summarize() (normalize.js):
// { total, videos, byYearVideo, from, to, byYear }. Gravar um item já existente desconta a
// versão antiga e soma a nova. As datas extremas (from/to) só se alargam; o
// cruzamento completo refaz o resumo do zero e corrige qualquer desvio.

import { ehVideo } from './normalize.js';

export const emptySummary = () => ({ total: 0, videos: 0, from: null, to: null, byYear: {}, byYearVideo: {} });

/** Soma (sign = 1) ou desconta (sign = -1) um item no resumo, alterando-o. */
export function applyItem(s, it, sign = 1) {
  if (!it || typeof it.ts !== 'number') return s;
  const y = new Date(it.ts).getUTCFullYear();
  s.total += sign;
  const soma = (mapa) => { const n = (mapa[y] || 0) + sign; if (n > 0) mapa[y] = n; else delete mapa[y]; };
  soma(s.byYear);
  if (ehVideo(it)) { s.videos += sign; soma(s.byYearVideo ??= {}); }
  if (sign > 0) {
    if (s.from == null || it.ts < s.from) s.from = it.ts;
    if (s.to == null || it.ts > s.to) s.to = it.ts;
  }
  if (s.total <= 0) Object.assign(s, emptySummary());
  return s;
}

/**
 * Atualiza o resumo por serviço ({google, icloud}) com a troca de um item:
 * antes = registro gravado (ou undefined), depois = registro novo.
 */
export function applyChange(bySource, antes, depois) {
  for (const [it, sign] of [[antes, -1], [depois, 1]]) {
    if (!it?.source) continue;
    bySource[it.source] ??= emptySummary();
    applyItem(bySource[it.source], it, sign);
  }
  return bySource;
}
