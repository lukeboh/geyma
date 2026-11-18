// Envio em lote (0.7): uma fila guardada (meta 'envioLote'), enviada uma por
// vez, que pode ser pausada, retomada depois (inclusive com o painel fechado
// e reaberto) e que para no primeiro erro. Retomar depois de um erro tenta o
// mesmo item de novo.

export const TAMANHOS_LOTE = [10, 50, 200, 1000];

/** Lote novo, a enviar ao destino ('google' | 'icloud'). ids = itens de origem. */
export function novoLote(destino, ids, agora = Date.now()) {
  return { destino, ids: [...ids], feitos: 0, pulados: 0, estado: 'rodando', erro: null, criadoEm: agora, atualizadoEm: agora };
}

/** Próximo item a enviar, ou null quando acabou. */
export const proximoDoLote = (l) => (l && l.feitos < l.ids.length ? l.ids[l.feitos] : null);

/** Quantos faltam. */
export const restamNoLote = (l) => (l ? l.ids.length - l.feitos : 0);

/**
 * Registra o resultado do item atual. res = {ok: true} | {ok: true, pulado: true}
 * (já tinha ido) | {ok: false, erro}. Erro: o lote para nele.
 */
export function registrarNoLote(l, res, agora = Date.now()) {
  const out = { ...l, atualizadoEm: agora };
  if (!res?.ok) return { ...out, estado: 'erro', erro: res?.erro || 'erro desconhecido' };
  out.feitos++;
  if (res.pulado) out.pulados++;
  if (out.feitos >= out.ids.length) out.estado = 'concluido';
  return out;
}

export const pausarLote = (l, agora = Date.now()) => (l?.estado === 'rodando' ? { ...l, estado: 'pausado', atualizadoEm: agora } : l);
export const pararLote = (l, agora = Date.now()) => (l && !['concluido', 'parado'].includes(l.estado) ? { ...l, estado: 'parado', atualizadoEm: agora } : l);

/** Retoma um lote pausado, interrompido ou parado por erro (tenta o mesmo item de novo). */
export function retomarLote(l, agora = Date.now()) {
  if (!l || !['pausado', 'erro', 'rodando'].includes(l.estado) || !restamNoLote(l)) return l;
  return { ...l, estado: 'rodando', erro: null, atualizadoEm: agora };
}

/** O lote ainda tem o que fazer (pode ser retomado)? */
export const loteAberto = (l) => Boolean(l && ['rodando', 'pausado', 'erro'].includes(l.estado) && restamNoLote(l));
