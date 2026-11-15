// Cruzamento guardado: o painel mostra o último resultado na hora e recalcula
// em segundo plano só quando o inventário mudou. As marcações feitas depois do
// cálculo ficam numa lista curta (meta 'decisoesRecentes') e são aplicadas por
// cima do resultado guardado, sem precisar regravar centenas de MB.

/** Etapas do cálculo, na ordem, com o texto mostrado ao usuário. */
export const ETAPAS = [
  { k: 'ler', txt: 'lendo o inventário dos dois serviços' },
  { k: 'cruzar', txt: 'cruzando as bibliotecas' },
  { k: 'dupG', txt: 'procurando cópias repetidas no Google' },
  { k: 'dupA', txt: 'procurando cópias repetidas no iCloud' },
  { k: 'lista', txt: 'montando a lista de revisão' },
  { k: 'guardar', txt: 'guardando o resultado' },
  { k: 'fim', txt: 'pronto' },
];

export const textoEtapa = (k) => ETAPAS.find((e) => e.k === k)?.txt || k;

/** O cruzamento guardado ficou para trás? (o inventário mudou depois dele) */
export const desatualizado = (cache, versaoAtual) => Boolean(cache) && (cache.versao || 0) !== (versaoAtual || 0);

/**
 * Aplica às linhas as marcações feitas depois da leitura do cruzamento.
 * recentes = { id: { d: decisão|null, at } }. Devolve quantas linhas mudaram.
 */
export function aplicarDecisoes(rows, recentes, lidoEm) {
  if (!recentes) return 0;
  let n = 0;
  for (const r of rows) {
    for (const id of r.ids) {
      const x = recentes[id];
      if (x && x.at >= lidoEm) { r.decision = x.d; n++; break; }
    }
  }
  return n;
}

/** Junta marcações novas na lista e descarta as anteriores à última leitura do cruzamento. */
export function juntarDecisoes(recentes, novas, lidoAte = 0) {
  const out = {};
  for (const [id, x] of Object.entries(recentes || {})) if (x.at >= lidoAte) out[id] = x;
  return Object.assign(out, novas);
}
