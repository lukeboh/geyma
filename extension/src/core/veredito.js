// Veredito do usuário sobre a identidade de um par: "são a mesma foto" ou
// "são fotos diferentes". Fica no item do iCloud e vale como evidência no
// cruzamento (match.js): mesmaQue força o par; diferenteDe tira o candidato.
// Só registra a decisão aqui; nada muda nos serviços.

const sem = (lista, id) => (lista || []).filter((x) => x !== id);

/** Campos a gravar no item do iCloud para o veredito tipo ('mesma' | 'diferente' | 'desfazer') sobre o item gId do Google. */
export function patchVeredito(a, gId, tipo, agora = Date.now()) {
  if (!a?.id || !String(a.id).startsWith('a:')) throw new Error('item do iCloud inválido');
  if (tipo !== 'desfazer' && !String(gId || '').startsWith('g:')) throw new Error('item do Google inválido');
  const diferenteDe = sem(a.diferenteDe, gId);
  if (tipo === 'mesma') return { id: a.id, mesmaQue: gId, diferenteDe, vereditoAt: agora };
  if (tipo === 'diferente') return { id: a.id, mesmaQue: a.mesmaQue === gId ? null : a.mesmaQue || null, diferenteDe: [...diferenteDe, gId], vereditoAt: agora };
  if (tipo === 'desfazer') {
    // sem gId: desfaz tudo o que o usuário disse sobre este item
    if (!gId) return { id: a.id, mesmaQue: null, diferenteDe: [], vereditoAt: agora };
    return { id: a.id, mesmaQue: a.mesmaQue === gId ? null : a.mesmaQue || null, diferenteDe, vereditoAt: agora };
  }
  throw new Error('veredito inválido');
}

/** O que o usuário já disse sobre o par a–g: 'mesma', 'diferente' ou null. */
export function vereditoDoPar(a, gId) {
  if (!a) return null;
  if (gId && a.mesmaQue === gId) return 'mesma';
  if (gId && a.diferenteDe?.includes(gId)) return 'diferente';
  return null;
}
