import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySummary, applyItem, applyChange } from '../extension/src/core/inv-summary.js';
import { summarize } from '../extension/src/core/normalize.js';

const ts = (y, m = 0) => Date.UTC(y, m, 1);

test('somar item a item dá o mesmo que summarize', () => {
  const items = [{ ts: ts(2020) }, { ts: ts(2020, 5), video: true }, { ts: ts(2015) }];
  const s = emptySummary();
  for (const it of items) applyItem(s, it);
  assert.deepEqual(s, summarize(items));
});

test('regravar um item não conta duas vezes e acompanha a mudança', () => {
  const by = {};
  const a = { source: 'icloud', ts: ts(2019) };
  applyChange(by, undefined, a);
  applyChange(by, a, { ...a, phash: 'x' });
  assert.equal(by.icloud.total, 1);
  applyChange(by, a, { ...a, ts: ts(2021), video: true });
  assert.deepEqual(by.icloud.byYear, { 2021: 1 });
  assert.equal(by.icloud.videos, 1);
});

test('separa por serviço e zera quando o último sai', () => {
  const by = {};
  const g = { source: 'google', ts: ts(2010) };
  applyChange(by, undefined, g);
  applyChange(by, undefined, { source: 'icloud', ts: ts(2011) });
  assert.equal(by.google.total, 1);
  assert.equal(by.icloud.total, 1);
  applyChange(by, g, undefined);
  assert.deepEqual(by.google, emptySummary());
});

import { aplicarDecisoes, juntarDecisoes, desatualizado } from '../extension/src/core/calc-cache.js';

test('marcações feitas depois do cálculo valem sobre o cruzamento guardado', () => {
  const rows = [{ ids: ['a:1', 'g:1'], decision: null }, { ids: ['g:2'], decision: 'manter' }, { ids: ['a:3'], decision: null }];
  const recentes = { 'g:1': { d: 'pessoal', at: 200 }, 'g:2': { d: null, at: 300 }, 'a:3': { d: 'descartar', at: 50 } };
  assert.equal(aplicarDecisoes(rows, recentes, 100), 2);
  assert.deepEqual(rows.map((r) => r.decision), ['pessoal', null, null]);
});

test('juntarDecisoes descarta as já lidas pelo cruzamento e mantém as novas', () => {
  const r = juntarDecisoes({ x: { d: 'a', at: 10 }, y: { d: 'b', at: 90 } }, { z: { d: 'c', at: 95 } }, 50);
  assert.deepEqual(Object.keys(r).sort(), ['y', 'z']);
});

test('desatualizado compara a versão do inventário', () => {
  assert.equal(desatualizado(null, 5), false);
  assert.equal(desatualizado({ versao: 5 }, 5), false);
  assert.equal(desatualizado({ versao: 5 }, 7), true);
});
