import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterRows, decisionCounts } from '../extension/src/core/review.js';

const T = (y) => Date.UTC(y, 5, 1);
const rows = [
  { cls: 'soIcloud', cat: 'print', decision: null, ts: T(2020), a: { video: false } },
  { cls: 'soGoogle', cat: 'pessoal', decision: 'manter', ts: T(2015), dup: true, g: {} },
  { cls: 'ambos', cat: 'pessoal', decision: null, ts: T(2018), a: { video: true }, dupIcloud: true },
];

test('filtra por situação, cópias, categoria, marcação, ano e tipo', () => {
  assert.equal(filterRows(rows).length, 3);
  assert.equal(filterRows(rows, { cls: 'soIcloud' }).length, 1);
  assert.equal(filterRows(rows, { cls: 'dupGoogle' })[0].cls, 'soGoogle');
  assert.equal(filterRows(rows, { cls: 'dupIcloud' })[0].cls, 'ambos');
  assert.equal(filterRows(rows, { cat: 'pessoal' }).length, 2);
  assert.equal(filterRows(rows, { dec: 'sugestao' }).length, 2);
  assert.equal(filterRows(rows, { dec: 'manter' }).length, 1);
  assert.equal(filterRows(rows, { year: '2018' }).length, 1);
  assert.equal(filterRows(rows, { kind: 'video' }).length, 1);
  assert.equal(filterRows(rows, { kind: 'foto' }).length, 2);
});

test('mais recentes primeiro', () => {
  assert.deepEqual(filterRows(rows).map((r) => new Date(r.ts).getUTCFullYear()), [2020, 2018, 2015]);
});

test('contagem do que está em vigor', () => {
  const c = decisionCounts(rows);
  assert.equal(c.decided, 1);
  assert.deepEqual(c.counts, { pessoal: 1, pendente: 1, manter: 1, descartar: 0 });
});
