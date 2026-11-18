// Resposta à pergunta central (critério da etapa 0.6): quais fotos pessoais
// estão guardadas nos dois lugares, com a qualidade preservada.
// Conta as fotos que entram no envio (marcação em vigor Pessoal ou Manter),
// uma vez cada: cópias repetidas dentro de um serviço não contam.
import { SENDABLE, effectiveDecision } from './plan.js';
import { melhorCopia } from './qualidade.js';

/**
 * @param rows linhas do cruzamento
 * @returns {{total, protegidas, comPerda, incertas, soIcloud, soGoogle}}
 *   protegidas: nos dois, a mesma foto (confirmada ou provável), sem perda;
 *   comPerda: nos dois, mas um lado guarda uma cópia pior (menor, convertida,
 *   sem o movimento): o par existe, a melhor cópia só está num lugar;
 *   incertas: par ainda a confirmar; soIcloud/soGoogle: num lugar só.
 */
export function resumoProtecao(rows) {
  const out = { total: 0, protegidas: 0, comPerda: 0, incertas: 0, soIcloud: 0, soGoogle: 0 };
  for (const r of rows) {
    if (r.dup || r.dupIcloud || !SENDABLE.has(effectiveDecision(r))) continue;
    out.total++;
    if (r.cls === 'soIcloud') out.soIcloud++;
    else if (r.cls === 'soGoogle') out.soGoogle++;
    else if (r.ident === 'incerta' || (!r.ident && r.cls === 'confirmar')) out.incertas++;
    else {
      const m = r.melhor || melhorCopia(r);
      if (m && m.lado !== 'iguais') out.comPerda++;
      else out.protegidas++;
    }
  }
  return out;
}
