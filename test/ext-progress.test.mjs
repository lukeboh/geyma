import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProgress } from '../extension/src/core/progress.js';

test('aviso sem posição mantém a última fração lida', () => {
  const prev = { task: 'icloud', state: 'lendo', frac: 0.12 };
  assert.deepEqual(mergeProgress(prev, { task: 'icloud', state: 'aguardando', reason: 'aba oculta' }), { task: 'icloud', state: 'aguardando', reason: 'aba oculta', frac: 0.12 });
});

test('posição nova substitui a antiga; sem anterior fica como veio', () => {
  assert.equal(mergeProgress({ frac: 0.12 }, { state: 'lendo', frac: 0.2 }).frac, 0.2);
  assert.deepEqual(mergeProgress(undefined, { state: 'ocupado' }), { state: 'ocupado' });
});
