// Qual versão grande pedir para cada lado, no visualizador.
// - Google: a base da miniatura aceita o tamanho pedido (=wN-hN, sem corte),
//   com a sessão do Google.
// - iCloud: a versão média (JPEG) do percurso, enquanto a URL não expira
//   (a Apple assina por algumas horas); depois, só a miniatura guardada.

export const ICLOUD_URL_VALIDA_MS = 4 * 60 * 60 * 1000;

export const googleGrande = (base, lado = 2400) => `${base}=w${lado}-h${lado}`;

/** URL da versão média do iCloud se ainda deve valer, senão null. */
export function icloudGrande(it, agora = Date.now()) {
  if (!it?.med || !it.thumbAt || agora - it.thumbAt > ICLOUD_URL_VALIDA_MS) return null;
  return it.med.replace('${f}', 'med.jpg');
}
