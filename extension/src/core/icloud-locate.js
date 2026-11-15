// Localizar uma foto na grade do iCloud para renovar o link dela (as URLs da
// Apple expiram). A grade é ordenada por data, da mais antiga para a mais
// recente; a posição da foto é estimada pela ordem da data dela entre todas as
// do iCloud, e corrigida pelas datas que a grade de fato carregou.

/** Quantas datas da lista ordenada são menores que ts (busca binária). */
export function rankOf(sortedTs, ts) {
  let lo = 0;
  let hi = sortedTs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTs[mid] < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const clamp = (x) => Math.min(1, Math.max(0, x));

/** Posição inicial estimada (0 = topo, 1 = fim) para a data ts. */
export function estimateFrac(sortedTs, ts) {
  if (!sortedTs.length) return 0;
  return clamp(rankOf(sortedTs, ts) / Math.max(1, sortedTs.length - 1));
}

/**
 * Próxima posição depois de uma tentativa que carregou fotos de minTs a maxTs.
 * Se a foto ficou antes do que veio, sobe; se ficou depois, desce; a correção
 * é a diferença de ordem convertida em fração. Devolve null se a data já está
 * no intervalo carregado (não adianta mover).
 */
export function nextFrac(sortedTs, ts, current, minTs, maxTs) {
  const n = Math.max(1, sortedTs.length - 1);
  if (minTs == null || maxTs == null) return null;
  if (ts >= minTs && ts <= maxTs) return null;
  const alvo = rankOf(sortedTs, ts);
  const ref = ts < minTs ? rankOf(sortedTs, minTs) : rankOf(sortedTs, maxTs);
  // um pouco além do necessário, para a foto cair no meio do que a grade carrega
  const passo = (alvo - ref) / n;
  return clamp(current + passo * 1.15 + Math.sign(passo) * 0.0015);
}
