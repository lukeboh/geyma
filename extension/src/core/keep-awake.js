// Impede o notebook de dormir enquanto uma leitura está rodando (a tela pode
// apagar e bloquear normalmente; o percurso do iCloud usa a emulação de foco).
// Usa o pedido de energia do próprio Chrome e o solta quando nada está rodando.

const ATIVOS = new Set(['lendo', 'aguardando', 'ocupado']);

/** Recebe o último estado de cada tarefa ({ icloud: 'lendo', ... }) e diz se a tela deve ficar acesa. */
export function shouldKeepAwake(states) {
  return Object.values(states || {}).some((s) => ATIVOS.has(s));
}
