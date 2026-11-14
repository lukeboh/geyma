// Plano de envio (prévia da etapa 0.7): o que seria copiado em cada sentido com
// as marcações em vigor. Só entra o que está como Pessoal ou Manter; Pendente e
// Descartar ficam retidos; cópias repetidas do Google não contam.
import { suggestDecision } from './classify.js';

export const SENDABLE = new Set(['pessoal', 'manter']);

/** Marcação em vigor de uma linha do cruzamento: a do usuário ou a sugestão. */
export const effectiveDecision = (r) => r.decision || suggestDecision(r.cat);

/** Bytes por pixel das fotos do iCloud, para estimar o tamanho dos itens do Google. */
export function bytesPerPixel(rows, fallback = 0.35) {
  let px = 0;
  let bytes = 0;
  for (const r of rows) if (r.a && !r.a.video && r.a.size && r.a.w && r.a.h) { px += r.a.w * r.a.h; bytes += r.a.size; }
  return px ? bytes / px : fallback;
}

/**
 * @param rows linhas do cruzamento ({cls, cat, decision, dup, menor, a:{size,w,h,video}, g:{w,h}})
 * @returns {{toGoogle, toIcloud, quality, bpp}}
 */
export function sendPlan(rows) {
  const bpp = bytesPerPixel(rows);
  const plan = {
    toGoogle: { n: 0, bytes: 0, held: 0, videos: 0, videoBytes: 0 },
    toIcloud: { n: 0, bytes: 0, held: 0 },
    quality: { n: 0 },
    bpp,
  };
  for (const r of rows) {
    const goes = SENDABLE.has(effectiveDecision(r));
    if (r.cls === 'soIcloud') {
      if (!goes) { plan.toGoogle.held++; continue; }
      plan.toGoogle.n++;
      plan.toGoogle.bytes += r.a.size || 0;
      if (r.a.video) { plan.toGoogle.videos++; plan.toGoogle.videoBytes += r.a.size || 0; }
    } else if (r.cls === 'soGoogle' && !r.dup) {
      if (!goes) { plan.toIcloud.held++; continue; }
      plan.toIcloud.n++;
      plan.toIcloud.bytes += (r.g.w || 0) * (r.g.h || 0) * bpp;
    } else if (r.cls === 'reduzida' && r.menor === 'google' && goes) {
      plan.quality.n++;
    }
  }
  return plan;
}
