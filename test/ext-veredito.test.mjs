// "São a mesma foto / São fotos diferentes": o veredito do usuário vira evidência do cruzamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchVeredito, vereditoDoPar } from '../extension/src/core/veredito.js';
import { matchLibraries, googlePhashNeeded } from '../extension/src/core/match.js';

test('patch: mesma, diferente e desfazer', () => {
  const a = { id: 'a:1', diferenteDe: ['g:2'] };
  assert.deepEqual(patchVeredito(a, 'g:2', 'mesma', 5), { id: 'a:1', mesmaQue: 'g:2', diferenteDe: [], vereditoAt: 5 });
  assert.deepEqual(patchVeredito({ id: 'a:1', mesmaQue: 'g:1' }, 'g:1', 'diferente', 5), { id: 'a:1', mesmaQue: null, diferenteDe: ['g:1'], vereditoAt: 5 });
  assert.deepEqual(patchVeredito({ id: 'a:1', mesmaQue: 'g:1', diferenteDe: ['g:3'] }, 'g:1', 'desfazer', 5), { id: 'a:1', mesmaQue: null, diferenteDe: ['g:3'], vereditoAt: 5 });
  assert.deepEqual(patchVeredito({ id: 'a:1', mesmaQue: 'g:1', diferenteDe: ['g:3'] }, null, 'desfazer', 5), { id: 'a:1', mesmaQue: null, diferenteDe: [], vereditoAt: 5 });
  // diferente duas vezes não repete
  assert.deepEqual(patchVeredito({ id: 'a:1', diferenteDe: ['g:1'] }, 'g:1', 'diferente', 5).diferenteDe, ['g:1']);
  assert.throws(() => patchVeredito({ id: 'g:1' }, 'g:2', 'mesma'));
  assert.throws(() => patchVeredito({ id: 'a:1' }, 'a:2', 'mesma'));
  assert.throws(() => patchVeredito({ id: 'a:1' }, 'g:2', 'talvez'));
});

test('o que o usuário já disse sobre o par', () => {
  assert.equal(vereditoDoPar({ mesmaQue: 'g:1' }, 'g:1'), 'mesma');
  assert.equal(vereditoDoPar({ diferenteDe: ['g:1'] }, 'g:1'), 'diferente');
  assert.equal(vereditoDoPar({ mesmaQue: 'g:1' }, 'g:2'), null);
  assert.equal(vereditoDoPar(null, 'g:1'), null);
});

const T = 1700000000000;
const PH0 = '0000000000000000';
const PH14 = '0000000000003fff'; // distância 14 de PH0: só parecidas

test('"são a mesma foto" tira o par da dúvida', () => {
  // dois candidatos no mesmo segundo, imagens só parecidas: a confirmar
  const a = { id: 'a:1', ts: T + 300, w: 4032, h: 3024, phash: PH0 };
  const g1 = { id: 'g:1', ts: T, w: 4032, h: 3024, phash: PH14 };
  const g2 = { id: 'g:2', ts: T, w: 4032, h: 3024, phash: 'ffffffffffffffff' };
  const antes = matchLibraries([g1, g2], [a]);
  assert.equal(antes.pairs[0].cls, 'ambos');
  assert.equal(antes.pairs[0].parecida, true);
  const depois = matchLibraries([g1, g2], [{ ...a, mesmaQue: 'g:1' }]);
  assert.equal(depois.pairs[0].cls, 'ambos');
  assert.equal(depois.pairs[0].g.id, 'g:1');
  assert.equal(depois.pairs[0].confirmadoPeloUsuario, true);
  assert.ok(!depois.pairs[0].parecida);
  assert.ok(!depois.pairs[0].disputado);
});

test('"são a mesma foto" vence a imagem claramente diferente e a disputa', () => {
  const g = { id: 'g:1', ts: T, w: 4032, h: 3024, phash: 'ffffffffffffffff' };
  const a1 = { id: 'a:1', ts: T, w: 4032, h: 3024, phash: PH0, mesmaQue: 'g:1' };
  const a2 = { id: 'a:2', ts: T, w: 4032, h: 3024 };
  const r = matchLibraries([g], [a2, a1]);
  const p = r.pairs.find((x) => x.a.id === 'a:1');
  assert.equal(p.g.id, 'g:1');
  assert.equal(p.confirmadoPeloUsuario, true);
  assert.deepEqual(r.soIcloud.map((x) => x.id), ['a:2']);
});

test('"são a mesma foto" com o Google reduzido continua cópia reduzida, sem pedir conferência', () => {
  const a = { id: 'a:1', ts: T, w: 4032, h: 3024, mesmaQue: 'g:1' };
  const g = { id: 'g:1', ts: T, w: 2016, h: 1512 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs[0].cls, 'reduzida');
  assert.equal(r.pairs[0].menor, 'google');
  assert.deepEqual(googlePhashNeeded([], r.pairs, new Set()), []);
});

test('"são fotos diferentes" desfaz o par e cada uma fica do seu lado', () => {
  const a = { id: 'a:1', ts: T, w: 4032, h: 3024, diferenteDe: ['g:1'] };
  const g = { id: 'g:1', ts: T, w: 4032, h: 3024 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs.length, 0);
  assert.deepEqual(r.soIcloud.map((x) => x.id), ['a:1']);
  assert.deepEqual(r.soGoogle.map((x) => x.id), ['g:1']);
  // com outro candidato, ele fica com o outro
  const g2 = { id: 'g:2', ts: T + 500, w: 4032, h: 3024 };
  const r2 = matchLibraries([g, g2], [a]);
  assert.equal(r2.pairs[0].g.id, 'g:2');
});

test('veredito para uma foto do Google que sumiu é ignorado', () => {
  const a = { id: 'a:1', ts: T, w: 4032, h: 3024, mesmaQue: 'g:sumiu' };
  const g = { id: 'g:1', ts: T, w: 4032, h: 3024 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs[0].g.id, 'g:1');
  assert.ok(!r.pairs[0].confirmadoPeloUsuario);
});
