import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeDoArquivo, fichaDoCabecalho, radical, mesmoNome, copiaNoGoogle } from '../extension/src/core/google-file.js';

const h = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });

test('ficha do cabeçalho do download (caso real: JPEG convertido de uma Live Photo)', () => {
  const f = fichaDoCabecalho(h({ 'content-type': 'image/jpeg', 'content-length': '185601', 'content-disposition': 'attachment;filename="IMG_8437.jpg"' }), 5);
  assert.deepEqual(f, { tipo: 'image/jpeg', formato: 'JPEG', bytes: 185601, nome: 'IMG_8437.jpg', at: 5 });
});

test('nome do arquivo com filename* e acentos', () => {
  assert.equal(nomeDoArquivo("attachment; filename*=UTF-8''F%C3%A9rias.HEIC"), 'Férias.HEIC');
  assert.equal(nomeDoArquivo(null), null);
});

test('radical ignora extensão e sufixos de cópia', () => {
  assert.equal(radical('IMG_8437.HEIC'), 'img_8437');
  assert.equal(radical('IMG_8437 (1).jpg'), 'img_8437');
  assert.equal(radical('IMG_8437-edited.jpg'), 'img_8437');
  assert.equal(mesmoNome({ filename: 'IMG_8437.HEIC' }, { nome: 'IMG_8437.jpg' }), true);
  assert.equal(mesmoNome({ filename: 'IMG_8437.HEIC' }, { nome: 'IMG_8438.jpg' }), false);
  assert.equal(mesmoNome({ filename: null }, { nome: 'x.jpg' }), false);
});

test('cópia no Google: original ou convertida', () => {
  const a = { fileType: 'public.heic' };
  assert.equal(copiaNoGoogle(a, { file: { formato: 'HEIC' } }), 'original');
  assert.equal(copiaNoGoogle(a, { file: { formato: 'JPEG' } }), 'convertida');
  assert.equal(copiaNoGoogle(a, {}), null);
  // HEIF do Google = HEIC do iPhone
  assert.equal(copiaNoGoogle(a, { file: { formato: 'HEIF' } }), 'original');
  // vídeo: a ficha é da capa, não do arquivo
  assert.equal(copiaNoGoogle({ fileType: 'com.apple.quicktime-movie', video: true }, { file: { formato: 'JPEG' } }), null);
});
