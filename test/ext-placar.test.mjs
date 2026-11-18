// Placar de identidade (0.4): provas e pontos de cada par.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placarIdentidade, textoPlacar } from '../extension/src/core/placar.js';
import { matchLibraries } from '../extension/src/core/match.js';

const par = (prova, extra = {}) => ({ a: { id: 'a:1' }, g: { id: 'g:1' }, prova, ...extra });
const ks = (pl) => pl.provas.map((x) => `${x.k}${x.pontos >= 0 ? '+' : ''}${x.pontos}`);

test('par forte: instante ao ms, dimensões, imagem e nome', () => {
  const pl = placarIdentidade(par({ dt: 0, dist: 3, rel: 'igual', nome: true }));
  assert.deepEqual(ks(pl), ['instante+3', 'dimensoes+2', 'imagem+4', 'nome+2']);
  assert.equal(pl.pontos, 11);
});

test('par fraco: mesmo segundo, imagem não comparada, outras candidatas', () => {
  const pl = placarIdentidade(par({ dt: 420, dist: null, rel: 'igual', cand: 3 }));
  assert.deepEqual(ks(pl), ['instante+2', 'dimensoes+2', 'imagem+0', 'disputa-2']);
  assert.equal(pl.pontos, 2);
});

test('quadro de Live Photo e versão editada contam pouco; só parecida, nada', () => {
  assert.equal(placarIdentidade(par({ dt: 0, dist: 15, rel: 'igual' }, { quadroDiferente: true })).provas[2].pontos, 1);
  assert.equal(placarIdentidade(par({ dt: 0, dist: 15, rel: 'igual' }, { versaoEditada: true })).provas[2].pontos, 1);
  assert.equal(placarIdentidade(par({ dt: 0, dist: 15, rel: 'igual' })).provas[2].pontos, 0);
  assert.equal(placarIdentidade(par({ dt: 0, dist: 30, rel: 'igual' })).provas[2].pontos, -4);
  // quadro muito diferente, mas do mesmo clique (mesmo nome, mesmo ms): desconta pouco
  const q = placarIdentidade(par({ dt: 0, dist: 28, rel: 'igual', nome: true }, { quadroDiferente: true }));
  assert.equal(q.provas[2].pontos, -1);
  assert.equal(q.pontos, 6);
});

test('fuso, cópia reduzida e decisão do usuário', () => {
  const pl = placarIdentidade(par({ dt: 3 * 3600e3, dist: 2, rel: 'reduzida' }, { fuso: 3 * 3600e3, menor: 'google', peloUsuario: true }));
  assert.deepEqual(ks(pl), ['usuario+10', 'instante+1', 'dimensoes+1', 'imagem+4']);
  assert.match(textoPlacar(pl), /^placar \+16: você disse.*menor no Google \(\+1\)/);
});

test('sem par ou sem provas: nada', () => {
  assert.equal(placarIdentidade({ a: { id: 'a:1' }, g: null, prova: { dt: 0 } }), null);
  assert.equal(placarIdentidade(par(undefined)), null);
  assert.equal(textoPlacar(null), '');
});

test('o cruzamento guarda as provas no par', () => {
  const a = { id: 'a:1', ts: 1000, w: 4032, h: 3024, phash: '0'.repeat(16) };
  const g = { id: 'g:1', ts: 1000, w: 4032, h: 3024, phash: '0'.repeat(15) + '1' };
  const [p] = matchLibraries([g], [a]).pairs;
  assert.deepEqual([p.dt, p.rel, p.dist], [0, 'igual', 1]);
});
