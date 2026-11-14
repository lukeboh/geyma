// Guarda o andamento de uma leitura sem perder a posição: avisos sem posição
// (como "aguardando a aba") mantêm a última fração lida, para o "Continuar de
// onde parou" retomar dali.
export function mergeProgress(prev, next) {
  if (next?.frac == null && prev?.frac != null && next?.state !== 'concluido') return { ...next, frac: prev.frac };
  return next;
}
