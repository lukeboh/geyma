// Placar de identidade (etapa 0.4): as provas de que um par do cruzamento é a
// mesma foto, cada uma com seus pontos, numa frase que dá para ler. Não
// decide nada (quem decide é o cruzamento, em match.js): explica a decisão
// e dá um número para ordenar e conferir os pares mais fracos primeiro.
// Módulo puro: roda no navegador e no Node (testes).

const SAME_MAX = 10;
const DIFFERENT_MIN = 22;

/**
 * @param r linha do cruzamento com o par: {peloUsuario, fuso, menor,
 *   quadroDiferente, versaoEditada, prova: {dt, dist, rel, nome, cand}}
 * @returns {{pontos: number, provas: {k: string, pontos: number, texto: string}[]} | null}
 */
export function placarIdentidade(r) {
  const p = r?.prova;
  if (!p || !r.a || !r.g) return null;
  const provas = [];
  const add = (k, pontos, texto) => provas.push({ k, pontos, texto });

  if (r.peloUsuario) add('usuario', 10, 'você disse que são a mesma foto');

  // instante
  if (r.fuso) add('instante', 1, 'mesmo horário local, com o fuso deslocado');
  else if (p.dt === 0) add('instante', 3, 'mesmo instante, ao milissegundo');
  else if (Number.isFinite(p.dt) && p.dt <= 1000) add('instante', 2, `mesmo segundo (${p.dt} ms de diferença)`);
  else if (Number.isFinite(p.dt)) add('instante', 0, `instantes diferentes (${Math.round(p.dt / 1000)} s)`);

  // dimensões
  if (p.rel === 'igual') add('dimensoes', 2, 'mesmas dimensões');
  else if (p.rel === 'reduzida') add('dimensoes', 1, `mesma proporção, ${r.menor === 'icloud' ? 'menor no iCloud' : 'menor no Google'}`);

  // imagem (pHash: distância de 0 a 64)
  if (p.dist === null || p.dist === undefined) add('imagem', 0, 'imagens ainda não comparadas');
  else if (p.dist <= SAME_MAX) add('imagem', 4, `imagens iguais (distância ${p.dist})`);
  else if (p.dist < DIFFERENT_MIN) {
    if (r.quadroDiferente) add('imagem', 1, `outro quadro do mesmo clique de uma Live Photo (distância ${p.dist})`);
    else if (r.versaoEditada) add('imagem', 1, `versão editada do mesmo arquivo (distância ${p.dist})`);
    else add('imagem', 0, `imagens só parecidas (distância ${p.dist})`);
  } else if (r.quadroDiferente) {
    // aceito pelo cruzamento por ser o mesmo clique (mesmo nome, mesmo milissegundo)
    add('imagem', -1, `outro quadro do mesmo clique, com a imagem bem diferente (distância ${p.dist})`);
  } else if (r.versaoEditada) {
    add('imagem', -1, `versão editada do mesmo arquivo, com a imagem bem diferente (distância ${p.dist})`);
  } else add('imagem', -4, `imagens diferentes (distância ${p.dist})`);

  if (p.nome) add('nome', 2, 'mesmo nome de arquivo');
  if (p.cand > 1) add('disputa', -2, `${p.cand} fotos do Google no mesmo segundo`);
  if (p.rajada) add('rajada', 1, `a mais parecida entre ${p.rajada.n} fotos do Google no mesmo segundo (folga de ${p.rajada.margem})`);

  return { pontos: provas.reduce((s, x) => s + x.pontos, 0), provas };
}

/** Frase curta do placar para o título do visualizador. */
export function textoPlacar(pl) {
  if (!pl) return '';
  const sinal = (n) => (n > 0 ? `+${n}` : String(n));
  return `placar ${sinal(pl.pontos)}: ${pl.provas.map((x) => `${x.texto} (${sinal(x.pontos)})`).join(', ')}`;
}
