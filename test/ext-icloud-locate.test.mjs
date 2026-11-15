import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankOf, estimateFrac, nextFrac } from '../extension/src/core/icloud-locate.js';

const ts = Array.from({ length: 1001 }, (_, i) => i * 10); // 0, 10, ..., 10000

test('rankOf conta as datas menores', () => {
  assert.equal(rankOf(ts, 0), 0);
  assert.equal(rankOf(ts, 5), 1);
  assert.equal(rankOf(ts, 10000), 1000);
  assert.equal(rankOf(ts, 99999), 1001);
  assert.equal(rankOf([], 5), 0);
});

test('estimateFrac usa a ordem da data entre todas', () => {
  assert.equal(estimateFrac(ts, 0), 0);
  assert.equal(estimateFrac(ts, 5000), 0.5);
  assert.equal(estimateFrac(ts, 10000), 1);
  assert.equal(estimateFrac([], 10), 0);
});

test('nextFrac sobe quando a foto ficou antes do carregado e desce quando ficou depois', () => {
  const up = nextFrac(ts, 3000, 0.5, 4900, 5200);
  assert.ok(up < 0.5 && up < 0.3 && up > 0.25, String(up));
  const down = nextFrac(ts, 8000, 0.5, 4900, 5200);
  assert.ok(down > 0.5 && down > 0.8 && down <= 1, String(down));
});

test('nextFrac não move se a data já está no intervalo, e respeita os limites', () => {
  assert.equal(nextFrac(ts, 5000, 0.5, 4900, 5200), null);
  assert.equal(nextFrac(ts, 5000, 0.5, null, null), null);
  assert.equal(nextFrac(ts, 0, 0.01, 900, 1200), 0);
  assert.equal(nextFrac(ts, 10000, 0.99, 8000, 9000), 1);
});
