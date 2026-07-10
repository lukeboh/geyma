import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, compare, toCsv } from '../js/match.js';

test('normalizeKey remove extensão, sufixos de cópia e edição', () => {
  assert.equal(normalizeKey('IMG_1234.HEIC'), 'img_1234');
  assert.equal(normalizeKey('IMG_1234.jpg'), 'img_1234');
  assert.equal(normalizeKey('IMG_1234 (2).jpg'), 'img_1234');
  assert.equal(normalizeKey('IMG_1234 copy.jpg'), 'img_1234');
  assert.equal(normalizeKey('IMG_1234-edited.jpg'), 'img_1234');
  assert.equal(normalizeKey('IMG_E1234.jpg'), 'img_1234');
  assert.equal(normalizeKey('ferias.praia.png'), 'ferias.praia');
});

function g(filename, createTime) {
  return { id: `g:${filename}`, filename, createTime, mimeType: 'image/jpeg', source: 'google' };
}

function a(filename, createTime) {
  return { id: `a:${filename}`, filename, path: filename, createTime, source: 'apple' };
}

test('compare classifica em ambos / só google / só apple', () => {
  const result = compare(
    [g('IMG_1.HEIC', '2024-01-01T10:00:00Z'), g('IMG_2.jpg', '2024-01-02T10:00:00Z')],
    [a('IMG_1.jpg', '2024-01-01T11:30:00Z'), a('IMG_3.jpg', '2024-01-03T10:00:00Z')],
  );
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].key, 'img_1');
  assert.deepEqual(result.onlyGoogle.map((i) => i.filename), ['IMG_2.jpg']);
  assert.deepEqual(result.onlyApple.map((i) => i.filename), ['IMG_3.jpg']);
  assert.equal(result.uncertain.length, 0);
});

test('mesmo nome com datas muito distantes vira incerto', () => {
  const result = compare(
    [g('IMG_1.jpg', '2020-01-01T00:00:00Z')],
    [a('IMG_1.jpg', '2024-06-15T00:00:00Z')],
  );
  assert.equal(result.matched.length, 0);
  assert.equal(result.uncertain.length, 1);
  assert.equal(result.onlyGoogle.length, 0);
  assert.equal(result.onlyApple.length, 0);
});

test('tolerância de fuso: até ±26h ainda é match', () => {
  const result = compare(
    [g('IMG_1.jpg', '2024-01-01T00:00:00Z')],
    [a('IMG_1.jpg', '2024-01-02T01:00:00Z')], // 25h depois
  );
  assert.equal(result.matched.length, 1);
});

test('data ausente/ilegível não impede o match por nome', () => {
  const result = compare(
    [g('IMG_1.jpg', '')],
    [a('IMG_1.jpg', '2024-01-01T00:00:00Z')],
  );
  assert.equal(result.matched.length, 1);
});

test('toCsv escapa aspas e inclui todas as categorias', () => {
  const result = compare(
    [g('so"google.jpg', '2024-01-01T00:00:00Z')],
    [a('soapple.jpg', '2024-01-01T00:00:00Z')],
  );
  const csv = toCsv(result);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], '"status","arquivo","data","origem","detalhes"');
  assert.ok(csv.includes('"so""google.jpg"'));
  assert.ok(csv.includes('"somente_apple"'));
});
