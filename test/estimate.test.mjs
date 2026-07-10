import test from 'node:test';
import assert from 'node:assert/strict';
import {
  averageSize,
  buildPlans,
  estimateSeconds,
  formatDuration,
  formatBytes,
  DEFAULT_AVG_PHOTO_BYTES,
} from '../js/estimate.js';

const MB = 1024 * 1024;

test('averageSize ignora registros sem tamanho', () => {
  assert.equal(averageSize([{ size: 2 * MB }, { size: 4 * MB }, { size: 0 }, {}]), 3 * MB);
  assert.equal(averageSize([]), null);
  assert.equal(averageSize([{}]), null);
});

test('buildPlans usa tamanhos reais da Apple e média para o Google', () => {
  const result = {
    onlyGoogle: [{ filename: 'g1.jpg' }, { filename: 'g2.jpg' }],
    onlyApple: [{ filename: 'a1.jpg', size: 5 * MB }, { filename: 'a2.jpg', size: 0 }],
  };
  const appleRecords = [{ size: 2 * MB }, { size: 4 * MB }];
  const plans = buildPlans(result, appleRecords);

  assert.equal(plans.toApple.count, 2);
  assert.equal(plans.toApple.bytes, 2 * 3 * MB); // média = 3 MB
  assert.equal(plans.toApple.estimated, true);

  assert.equal(plans.toGoogle.count, 2);
  assert.equal(plans.toGoogle.bytes, 5 * MB + 3 * MB); // real + média p/ tamanho ausente
});

test('buildPlans sem amostra Apple usa o tamanho padrão por foto', () => {
  const plans = buildPlans({ onlyGoogle: [{}], onlyApple: [] }, []);
  assert.equal(plans.toApple.bytes, DEFAULT_AVG_PHOTO_BYTES);
});

test('estimateSeconds usa o gargalo dominante', () => {
  // 100 fotos de 1 MB a 10 MB/s = 10 s por banda; a 2 fotos/s = 50 s por taxa
  assert.equal(estimateSeconds({ count: 100, bytes: 100 * MB }, 10, 2), 50);
  // banda dominando: 10 fotos de 100 MB a 1 MB/s = 1000 s; taxa daria 5 s
  assert.equal(estimateSeconds({ count: 10, bytes: 1000 * MB }, 1, 2), 1000);
  assert.equal(estimateSeconds({ count: 0, bytes: 0 }, 10, 2), 0);
});

test('formatDuration cobre segundos, minutos, horas e dias', () => {
  assert.equal(formatDuration(0), 'nada a copiar');
  assert.equal(formatDuration(0.4), '< 1 s');
  assert.equal(formatDuration(45), '45 s');
  assert.equal(formatDuration(90), '1 min 30 s');
  assert.equal(formatDuration(3600), '1 h');
  assert.equal(formatDuration(7260), '2 h 1 min');
  assert.equal(formatDuration(60 * 60 * 50), '2 d 2 h');
});

test('formatBytes usa unidades binárias com vírgula pt-BR', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1536), '1,5 KB');
  assert.equal(formatBytes(3.5 * MB), '3,5 MB');
  assert.equal(formatBytes(2.5 * 1024 * MB), '2,5 GB');
});
