// Fotos com o instante deslocado por fuso horário (etapa 0.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLibraries, parearPorFuso, estadoIdentidade, googlePhashNeeded, deslocamentoDeFuso } from '../extension/src/core/match.js';

const H = 3600000;
const T = 1500000000000;
const PH = '0000000000000000';

test('mesma hora local, instante diferente: par a confirmar por fuso', () => {
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 4032, h: 3024 };
  // o Google guardou a mesma hora local com fuso zero
  const g = { id: 'g:1', ts: T - 3 * H, tzOffset: 0, w: 3024, h: 4032 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs.length, 1);
  const p = r.pairs[0];
  assert.equal(p.fuso, true);
  assert.equal(p.cls, 'confirmar');
  assert.equal(p.deslocamentoMs, -3 * H);
  assert.equal(estadoIdentidade(p), 'incerta');
  assert.deepEqual(r.soIcloud, []);
  assert.deepEqual(r.soGoogle, []);
  // o Google precisa da impressão digital para decidir
  assert.deepEqual(googlePhashNeeded([], r.pairs, new Set()), ['1']);
});

test('hora local de um lado guardada como UTC no outro', () => {
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  const g = { id: 'g:1', ts: T - 3 * H, tzOffset: null, w: 10, h: 20 };
  assert.equal(parearPorFuso([a], [g]).pairs.length, 1);
  const a2 = { id: 'a:2', ts: T, tzOffset: null, w: 10, h: 20 };
  const g2 = { id: 'g:2', ts: T + 2 * H, tzOffset: -2 * H, w: 10, h: 20 };
  assert.equal(parearPorFuso([a2], [g2]).pairs.length, 1);
});

test('a imagem decide: igual confirma, diferente desfaz', () => {
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20, phash: PH };
  const igual = parearPorFuso([a], [{ id: 'g:1', ts: T - 3 * H, tzOffset: 0, w: 10, h: 20, phash: '0000000000000001' }]);
  assert.equal(igual.pairs[0].cls, 'ambos');
  assert.equal(igual.pairs[0].confirmadoPorImagem, true);
  const dif = parearPorFuso([a], [{ id: 'g:1', ts: T - 3 * H, tzOffset: 0, w: 10, h: 20, phash: 'ffffffffffffffff' }]);
  assert.equal(dif.pairs.length, 0);
  assert.deepEqual(dif.restantes.map((x) => x.id), ['a:1']);
});

test('sem par: dimensões diferentes, dois candidatos, recusado pelo usuário ou sem fuso guardado', () => {
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  const g = (id, o = {}) => ({ id, ts: T - 3 * H, tzOffset: 0, w: 10, h: 20, ...o });
  assert.equal(parearPorFuso([a], [g('g:1', { w: 5, h: 10 })]).pairs.length, 0);
  assert.equal(parearPorFuso([a], [g('g:1'), g('g:2')]).pairs.length, 0);
  assert.equal(parearPorFuso([{ ...a, diferenteDe: ['g:1'] }], [g('g:1')]).pairs.length, 0);
  assert.equal(parearPorFuso([{ ...a, tzOffset: null }], [g('g:1', { tzOffset: null })]).pairs.length, 0);
});

test('só deslocamentos que um fuso explica', () => {
  assert.ok(deslocamentoDeFuso(3 * H));
  assert.ok(deslocamentoDeFuso(-3 * H - 1000));
  assert.ok(deslocamentoDeFuso(5.75 * H));
  assert.ok(!deslocamentoDeFuso(60000));
  assert.ok(!deslocamentoDeFuso(0.55 * H));
  assert.ok(!deslocamentoDeFuso(15 * H));
  // fuso estranho guardado numa foto antiga: deslocamento quebrado, sem par
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  assert.equal(parearPorFuso([a], [{ id: 'g:1', ts: T - 3 * H + 33 * 60000, tzOffset: -33 * 60000, w: 10, h: 20 }]).pairs.length, 0);
});

test('um candidato do Google serve a uma foto do iCloud só', () => {
  const a1 = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  const a2 = { id: 'a:2', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  const r = parearPorFuso([a1, a2], [{ id: 'g:1', ts: T - 3 * H, tzOffset: 0, w: 10, h: 20 }]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.restantes.length, 1);
});

test('a primeira passada continua valendo antes do fuso', () => {
  const a = { id: 'a:1', ts: T, tzOffset: -3 * H, w: 10, h: 20 };
  const r = matchLibraries([{ id: 'g:0', ts: T, w: 10, h: 20 }, { id: 'g:1', ts: T - 3 * H, tzOffset: 0, w: 10, h: 20 }], [a]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].g.id, 'g:0');
  assert.ok(!r.pairs[0].fuso);
  assert.deepEqual(r.soGoogle.map((g) => g.id), ['g:1']);
});
