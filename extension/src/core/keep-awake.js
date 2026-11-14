// Mantém a tela do notebook acordada enquanto uma leitura está rodando.
// O percurso do iCloud só anda com a aba visível; se a tela apagar ou
// bloquear por inatividade, ele para. Usa o pedido de energia do próprio
// Chrome (o mesmo de um vídeo em reprodução) e o solta quando nada está rodando.

const ATIVOS = new Set(['lendo', 'aguardando', 'ocupado']);

/** Recebe o último estado de cada tarefa ({ icloud: 'lendo', ... }) e diz se a tela deve ficar acesa. */
export function shouldKeepAwake(states) {
  return Object.values(states || {}).some((s) => ATIVOS.has(s));
}
