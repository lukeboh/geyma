// Plano de envio (prévia da etapa 0.7): o que seria copiado em cada sentido com
// as marcações em vigor. Só entra o que está como Pessoal ou Manter; Pendente e
// Descartar ficam retidos; cópias repetidas (de qualquer lado) não contam.
import { suggestDecision } from './classify.js';
import { melhorCopia } from './qualidade.js';

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
 * Espaço que um conjunto de linhas ocupa em cada serviço: o do iCloud é o
 * tamanho real dos originais; o do Google, estimado pela resolução (o Google
 * não informa o tamanho, salvo quando a ficha do arquivo foi lida).
 * @returns {{icloud: number, google: number, googleEstimado: boolean}}
 */
export function espacoDasLinhas(rows, bpp = 0.35) {
  let icloud = 0;
  let google = 0;
  let estimado = false;
  for (const r of rows) {
    if (r.a?.size) icloud += r.a.size;
    if (r.g) {
      if (r.g.file?.bytes && !r.g.video) google += r.g.file.bytes;
      else if (r.g.w && r.g.h) { google += r.g.w * r.g.h * bpp; estimado = true; }
    }
  }
  return { icloud, google, googleEstimado: estimado };
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
    // pares em que o iCloud guarda a melhor cópia: reenviar o original ao Google
    quality: { n: 0, googleMenor: 0, googleConvertida: 0, googleSemMovimento: 0 },
    bpp,
  };
  for (const r of rows) {
    const goes = SENDABLE.has(effectiveDecision(r));
    if (r.cls === 'soIcloud' && !r.dupIcloud) {
      if (!goes) { plan.toGoogle.held++; continue; }
      plan.toGoogle.n++;
      plan.toGoogle.bytes += r.a.size || 0;
      if (r.a.video) { plan.toGoogle.videos++; plan.toGoogle.videoBytes += r.a.size || 0; }
    } else if (r.cls === 'soGoogle' && !r.dup) {
      if (!goes) { plan.toIcloud.held++; continue; }
      plan.toIcloud.n++;
      plan.toIcloud.bytes += (r.g.w || 0) * (r.g.h || 0) * bpp;
    } else if (goes && r.a && r.g) {
      const m = r.melhor || melhorCopia(r);
      if (m?.icloud.length && !r.dup && !r.dupIcloud) {
        plan.quality.n++;
        for (const k of m.icloud) plan.quality[k]++;
      }
    }
  }
  return plan;
}
