// Fotos e vídeos separados (0.9): o painel mostra um tipo por vez (ou os
// dois), no Inventário, na Proteção e na Revisão. O cruzamento já calcula os
// números de cada tipo (porTipo); a vista troca os números e as linhas.
import { ehVideo } from './normalize.js';

export const TIPOS = { foto: 'Fotos', video: 'Vídeos', '': 'Tudo' };

/** Tipo de uma linha do cruzamento (os dois lados de um par são do mesmo tipo). */
export const tipoDaLinha = (r) => (ehVideo(r?.a) || ehVideo(r?.g) ? 'video' : 'foto');

/** Tipo de um item do inventário. */
export const tipoDoItem = (it) => (ehVideo(it) ? 'video' : 'foto');

/** Separa o resultado do cruzamento ({pairs, soGoogle, soIcloud}) por tipo. */
export function separarPorTipo({ pairs, soGoogle, soIcloud }) {
  const out = { foto: { pairs: [], soGoogle: [], soIcloud: [] }, video: { pairs: [], soGoogle: [], soIcloud: [] } };
  for (const p of pairs) out[ehVideo(p.a) || ehVideo(p.g) ? 'video' : 'foto'].pairs.push(p);
  for (const g of soGoogle) out[tipoDoItem(g)].soGoogle.push(g);
  for (const a of soIcloud) out[tipoDoItem(a)].soIcloud.push(a);
  return out;
}

/** Divide uma lista de itens por tipo. */
export function itensPorTipo(items) {
  const out = { foto: [], video: [] };
  for (const it of items) out[tipoDoItem(it)].push(it);
  return out;
}

/**
 * Junta as análises de duplicatas de cada tipo (os grupos nunca misturam foto
 * e vídeo) no formato de analyzeDuplicates.
 */
export function juntarDuplicatas(...partes) {
  const out = { copies: new Map(), grupos: 0, copias: 0, identicos: 0, diferentes: 0, incertos: 0, pendentes: 0, pendingIds: [] };
  for (const d of partes) {
    for (const [k, v] of d.copies) out.copies.set(k, v);
    for (const k of ['grupos', 'copias', 'identicos', 'diferentes', 'incertos', 'pendentes']) out[k] += d[k] || 0;
    out.pendingIds.push(...d.pendingIds);
  }
  return out;
}

/**
 * Vista do cruzamento para um tipo: as linhas daquele tipo e os resumos
 * calculados para ele. tipo '' = tudo. Sem os resumos por tipo (cálculo
 * antigo), troca só as linhas.
 */
export function vistaPorTipo(d, tipo) {
  if (!d || !tipo) return d;
  const pt = d.porTipo?.[tipo] || {};
  return { ...d, ...pt, rows: d.rows.filter((r) => tipoDaLinha(r) === tipo), tipo };
}

/** Palavra para o tipo, no plural ou no singular. */
export const nomeDoTipo = (tipo, plural = true) => (tipo === 'video' ? (plural ? 'vídeos' : 'vídeo') : tipo === 'foto' ? (plural ? 'fotos' : 'foto') : (plural ? 'itens' : 'item'));

/** Resumo do inventário de um serviço para um tipo ({total, videos, byYear, byYearVideo, ...}). */
export function inventarioPorTipo(s, tipo) {
  if (!s || !tipo) return s;
  const byYearVideo = s.byYearVideo || {};
  if (tipo === 'video') return { ...s, total: s.videos || 0, byYear: { ...byYearVideo } };
  const byYear = {};
  for (const [y, n] of Object.entries(s.byYear || {})) { const f = n - (byYearVideo[y] || 0); if (f > 0) byYear[y] = f; }
  return { ...s, total: s.total - (s.videos || 0), byYear };
}
