// Qual versão grande pedir para cada lado, no visualizador.
// - Google: a base da miniatura aceita o tamanho pedido (=wN-hN, sem corte),
//   com a sessão do Google.
// - iCloud: enquanto a URL não expira (a Apple assina por algumas horas), a
//   foto como está agora: numa editada, a versão cheia em JPEG já editada
//   (full) ou a média; nas demais, a média. O original de uma editada fica em
//   medOrig/thumbOrig. Depois que expira, só a miniatura guardada (ou um link
//   novo, pedido ao percurso).

export const ICLOUD_URL_VALIDA_MS = 4 * 60 * 60 * 1000;

export const googleGrande = (base, lado = 2400) => `${base}=w${lado}-h${lado}`;

const valeAinda = (it, agora) => Boolean(it?.thumbAt) && agora - it.thumbAt <= ICLOUD_URL_VALIDA_MS;

/**
 * Melhor imagem grande da versão atual a partir dos links (de um item ou de
 * uma renovação), sem olhar a validade. cheia: aceita a versão cheia (pesada;
 * o celular prefere a média).
 */
export function linkAtual(l, { cheia = true } = {}) {
  if (!l) return null;
  if (cheia && l.full) return l.full.replace('${f}', 'full.jpg');
  if (l.med) return l.med.replace('${f}', 'med.jpg');
  if (!cheia && l.full) return l.full.replace('${f}', 'full.jpg');
  return null;
}

/** Imagem grande do original de uma foto editada (a média; senão a miniatura). */
export function linkOriginal(l) {
  if (!l) return null;
  if (l.medOrig) return l.medOrig.replace('${f}', 'med.jpg');
  if (l.thumbOrig) return l.thumbOrig.replace('${f}', 'thumb.jpg');
  return null;
}

/** URL da versão grande (atual) do iCloud se ainda deve valer, senão null. */
export function icloudGrande(it, agora = Date.now(), opcoes = {}) {
  return valeAinda(it, agora) ? linkAtual(it, opcoes) : null;
}

/** URL do original de uma editada, se ainda deve valer, senão null. */
export function icloudOriginal(it, agora = Date.now()) {
  return valeAinda(it, agora) ? linkOriginal(it) : null;
}

/** A foto foi editada no iCloud e o inventário já conhece as duas versões. */
export const temOriginal = (it) => Boolean(it?.thumbOrig || it?.medOrig);
