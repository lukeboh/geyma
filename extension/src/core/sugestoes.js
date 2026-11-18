// Sugestões para parear à mão: para uma foto que ficou só no iCloud, as fotos
// que ficaram só no Google com as mesmas dimensões (ou giradas) e o instante
// próximo. O motor não pareia sozinho fora da tolerância de 1 s (e da
// passada por fuso); o usuário vê e decide com "São a mesma foto".
import { dimRelation } from './match.js';

const HORA = 3600000;

/**
 * @param a item do iCloud ({ts, w, h, diferenteDe?})
 * @param soGoogle itens do Google sem par ({id, ts, w, h})
 * @param {{janelaMs?: number, max?: number}} [o]
 * @returns itens do Google, do instante mais próximo para o mais distante
 */
export function sugestoesDoGoogle(a, soGoogle, { janelaMs = 36 * HORA, max = 6 } = {}) {
  if (!a?.w || !a?.h) return [];
  const recusadas = new Set(a.diferenteDe || []);
  return soGoogle
    .filter((g) => !recusadas.has(g.id) && Math.abs(g.ts - a.ts) <= janelaMs && dimRelation(a, g) === 'igual')
    .sort((x, y) => Math.abs(x.ts - a.ts) - Math.abs(y.ts - a.ts))
    .slice(0, max);
}
