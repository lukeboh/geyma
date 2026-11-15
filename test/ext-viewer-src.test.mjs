import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleGrande, icloudGrande, ICLOUD_URL_VALIDA_MS } from '../extension/src/core/viewer-src.js';

const F = '${f}';

test('Google: pede a foto grande pela base, sem corte', () => {
  assert.equal(googleGrande('https://lh3.googleusercontent.com/pw/x'), 'https://lh3.googleusercontent.com/pw/x=w2400-h2400');
  assert.equal(googleGrande('https://lh3.googleusercontent.com/pw/x', 1200), 'https://lh3.googleusercontent.com/pw/x=w1200-h1200');
});

test('iCloud: versão média só enquanto a URL vale', () => {
  const agora = 10 * ICLOUD_URL_VALIDA_MS;
  const it = { med: `https://cvws.icloud-content.com/B/m/${F}?o=1`, thumbAt: agora - 1000 };
  assert.equal(icloudGrande(it, agora), 'https://cvws.icloud-content.com/B/m/med.jpg?o=1');
  assert.equal(icloudGrande({ ...it, thumbAt: agora - ICLOUD_URL_VALIDA_MS - 1 }, agora), null);
  assert.equal(icloudGrande({ thumbAt: agora }, agora), null);
  assert.equal(icloudGrande(null, agora), null);
});
