import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phashFromGray, grayFromRgba, hamming } from '../extension/src/core/phash.js';

// gerado com imagehash (Python): mesmo caminho a partir da matriz de cinza 32×32
const fixtures = JSON.parse(readFileSync(new URL('./fixtures-phash.json', import.meta.url)));

test('pHash igual ao da biblioteca imagehash', () => {
  for (const f of fixtures) assert.equal(phashFromGray(Float64Array.from(f.gray)), f.hash);
});

test('brilho uniforme não muda o pHash; imagens diferentes ficam longe', () => {
  const [grad, r1, r2] = fixtures.map((f) => Float64Array.from(f.gray));
  const brighter = grad.map((v) => v + 30);
  assert.equal(hamming(phashFromGray(grad), phashFromGray(brighter)), 0);
  assert.ok(hamming(phashFromGray(r1), phashFromGray(r2)) >= 22);
});

test('cinza a partir de RGBA com os pesos do Pillow', () => {
  const rgba = new Uint8ClampedArray(32 * 32 * 4).fill(255);
  rgba[0] = 255; rgba[1] = 0; rgba[2] = 0;
  const g = grayFromRgba(rgba);
  assert.equal(g[0], 76.245);
  assert.equal(g[1], 255);
});

test('distância de Hamming', () => {
  assert.equal(hamming('0000000000000000', 'ffffffffffffffff'), 64);
  assert.equal(hamming('0000000000000001', '0000000000000000'), 1);
  assert.equal(hamming(null, 'ff'), null);
});
