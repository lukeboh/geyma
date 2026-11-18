// Vídeos (etapa 0.9): identidade pela duração, qualidade pela ficha do
// arquivo do Google e o resumo para o painel. Módulo puro: roda no navegador
// e no Node (testes).
//
// Medido em 18/11/2026 em 339 pares de vídeo da biblioteca real (duração do
// iCloud, CPLAsset.duration, × a da listagem do Google):
// - a maioria bate com até 50 ms de diferença; clipes curtos de câmeras
//   antigas, com até 200 ms (o Google mede só a trilha de vídeo);
// - câmera lenta (gravada a 120 ou 240 quadros por segundo): o Google conta o
//   tempo de reprodução, 4 a 4,5 vezes o do iCloud;
// - dois vídeos no mesmo segundo, com as mesmas dimensões, estavam com os
//   pares trocados: a duração desfaz a troca.
// Ficha do arquivo do Google (`=dv`, só o cabeçalho): em 22 de 24 pares, o
// arquivo idêntico ao original do iCloud, byte a byte; nos outros 2, bem
// menor com as mesmas dimensões.

import { ehVideo } from './normalize.js';

export { ehVideo };

// diferença aceita como "mesma duração": 250 ms ou 1%, o que for maior
export const DURACAO_TOL_MS = 250;
export const DURACAO_TOL_FRAC = 0.01;
// acima disto, durações diferentes: meio segundo ou 5%, o que for maior
export const DURACAO_DIF_MS = 500;
export const DURACAO_DIF_FRAC = 0.05;
// câmera lenta: gravada a partir de 100 quadros por segundo
export const LENTA_FPS = 100;

/**
 * Relação entre as durações de um vídeo do iCloud ({durMs, fps}) e um do
 * Google ({videoMs}): 'igual', 'lenta' (câmera lenta: o Google mede o tempo
 * de reprodução), 'proxima' (nem igual, nem claramente diferente),
 * 'diferente' ou null (falta a duração de um lado).
 */
export function relacaoDuracao(a, g) {
  const da = a?.durMs;
  const dg = g?.videoMs;
  if (!da || !dg) return null;
  const d = Math.abs(dg - da);
  if (d <= Math.max(DURACAO_TOL_MS, DURACAO_TOL_FRAC * da)) return 'igual';
  if (a.fps >= LENTA_FPS && dg / da >= 2 && dg / da <= 10) return 'lenta';
  if (d > Math.max(DURACAO_DIF_MS, DURACAO_DIF_FRAC * da)) return 'diferente';
  return 'proxima';
}

/** A duração confirma o par? */
export const duracaoBate = (rel) => rel === 'igual' || rel === 'lenta';

/** Duração para ler: "8 s", "1 min 05 s", "1 h 02 min". */
export function textoDuracao(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return ms < 10000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

// cópia do Google do mesmo tamanho do original: até 1% de diferença (o
// Google pode reescrever metadados); bem menor: abaixo de 90%
const MESMO_ARQUIVO = 0.01;
export const LIMIAR_RECOMPRESSAO_VIDEO = 0.9;

const mesmasDims = (a, g) => Boolean(a?.w && g?.w) && ((a.w === g.w && a.h === g.h) || (a.w === g.h && a.h === g.w));

/**
 * Como o Google guarda este vídeo, pela ficha do arquivo (`=dv`, fileV):
 * 'original' (arquivo do mesmo tamanho do original do iCloud),
 * 'recomprimida' (mesmas dimensões, arquivo bem menor, mesma duração),
 * 'reduzida' (dimensões menores: economia de espaço do Google),
 * 'aparada' (mais curto: o vídeo foi cortado), 'indisponivel' (o Google não
 * serve mais o arquivo do vídeo, só a capa) ou null (sem ficha ou sem como
 * dizer).
 */
export function copiaVideoNoGoogle(a, g) {
  const f = g?.fileV;
  if (f?.indisponivel) return ehVideo(a) ? 'indisponivel' : null;
  if (!f?.bytes || !a?.size || !ehVideo(a)) return null;
  const r = f.bytes / a.size;
  if (Math.abs(r - 1) <= MESMO_ARQUIVO) return 'original';
  if (relacaoDuracao(a, g) === 'diferente' && g.videoMs < a.durMs) return 'aparada';
  if (r >= LIMIAR_RECOMPRESSAO_VIDEO) return null;
  if (!mesmasDims(a, g)) return a.w * a.h > g.w * g.h ? 'reduzida' : null;
  return 'recomprimida';
}

/**
 * Itens do Google cuja ficha do vídeo ajuda: pares de vídeo sem ficha
 * (qualidade e nome do arquivo); primeiro os que também ajudam na
 * identidade (a confirmar, durações diferentes ou sem duração do iCloud).
 * Depois, os vídeos só do Google: o nome classifica (WhatsApp, câmera) e o
 * tamanho diz se o vídeo pode ir ao iCloud pelo site.
 */
export function videoFileNeeded(pairs, soGoogle = []) {
  const primeiro = [];
  const depois = [];
  for (const p of pairs) {
    if (!p.g.video || !ehVideo(p.a) || p.g.fileV || !p.g.thumb) continue;
    (p.cls !== 'ambos' || !duracaoBate(p.duracao) ? primeiro : depois).push({ id: p.g.id, url: p.g.thumb, v: true });
  }
  const sos = soGoogle.filter((g) => g.video && !g.fileV && g.thumb).map((g) => ({ id: g.id, url: g.thumb, v: true }));
  return [...primeiro, ...depois, ...sos];
}

/**
 * Vídeo curto do Google no mesmo instante de uma Live Photo do iCloud: é o
 * movimento da Live Photo enviado à parte (como vídeo), não um vídeo novo.
 * @returns {Map<string, string>} id do Google -> id da Live Photo do iCloud
 */
export const MOVIMENTO_MAX_MS = 4000;
export function movimentosDeLive(soGoogle, icloud) {
  const porSeg = new Map();
  for (const a of icloud) {
    if (ehVideo(a) || !(a.live || a.subtype === 2)) continue;
    const s = Math.floor(a.ts / 1000);
    if (!porSeg.has(s)) porSeg.set(s, a);
  }
  const out = new Map();
  for (const g of soGoogle) {
    if (!g.video || !g.videoMs || g.videoMs > MOVIMENTO_MAX_MS) continue;
    const s = Math.floor(g.ts / 1000);
    const a = porSeg.get(s) || porSeg.get(s - 1) || porSeg.get(s + 1);
    if (a && Math.abs(a.ts - g.ts) <= 1000) out.set(g.id, a.id);
  }
  return out;
}

/**
 * Resumo dos vídeos para o painel, a partir das linhas do cruzamento.
 * Durações em ms; bytes do iCloud (o original) e do Google (a ficha, quando lida).
 */
export function resumoVideos(rows) {
  const lado = () => ({ n: 0, ms: 0, semDuracao: 0, bytes: 0 });
  const out = {
    pares: lado(), soIcloud: lado(), soGoogle: lado(),
    identidade: { confirmada: 0, provavel: 0, incerta: 0 },
    duracao: { igual: 0, lenta: 0, proxima: 0, diferente: 0, semDuracao: 0 },
    copia: { original: 0, recomprimida: 0, reduzida: 0, aparada: 0, indisponivel: 0, semFicha: 0 },
    // vídeos só do Google cujo arquivo o Google não serve mais (só a capa)
    soGoogleIndisponivel: 0,
    melhorIcloud: 0, melhorGoogle: 0, movimentoLive: 0, misturados: 0,
  };
  const somar = (l, ms, bytes) => { l.n++; if (ms) l.ms += ms; else l.semDuracao++; l.bytes += bytes || 0; };
  for (const r of rows) {
    const av = r.a?.video;
    const gv = r.g?.video;
    if (!av && !gv) continue;
    if (r.a && r.g) {
      if (Boolean(av) !== Boolean(gv)) { out.misturados++; continue; }
      somar(out.pares, r.a.durMs || r.g.videoMs, r.a.size);
      if (r.ident) out.identidade[r.ident]++;
      out.duracao[r.duracao || 'semDuracao']++;
      if (r.copiaGoogle && r.copiaGoogle in out.copia) out.copia[r.copiaGoogle]++;
      else if (!r.g.fileV) out.copia.semFicha++;
      if (r.melhor?.icloud?.length) out.melhorIcloud++;
      if (r.melhor?.google?.length) out.melhorGoogle++;
    } else if (r.a) {
      somar(out.soIcloud, r.a.durMs, r.a.size);
    } else {
      somar(out.soGoogle, r.g.videoMs, r.g.fileV?.bytes);
      if (r.movimentoDe) out.movimentoLive++;
      if (r.g.fileV?.indisponivel) out.soGoogleIndisponivel++;
    }
  }
  return out;
}
