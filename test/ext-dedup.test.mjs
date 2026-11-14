import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDuplicates, candidateGroups, exactGroups, pickKeeper, copiesBytes } from '../extension/src/core/dedup.js';

const T = Date.UTC(2016, 5, 1, 12, 0, 0);
const P1 = 'ffffffffffffffff';
const P1b = 'fffffffffffffffe';
const P2 = '0000000000000000';
const it = (id, o = {}) => ({ id, ts: T, w: 4032, h: 3024, ...o });

test('candidatas: mesmo segundo e mesmas dimensões, em qualquer orientação', () => {
  const g = candidateGroups([it('a'), it('b', { w: 3024, h: 4032, ts: T + 900 }), it('c', { ts: T + 1000 }), it('d', { w: 100, h: 100 })]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].map((x) => x.id), ['a', 'b']);
});

test('arquivos idênticos pela impressão digital, em qualquer instante', () => {
  const g = exactGroups([it('a', { fingerprint: 'F' }), it('b', { fingerprint: 'F', ts: T + 864e5 }), it('c', { fingerprint: 'G' })]);
  assert.equal(g.length, 1);
  assert.equal(g[0].length, 2);
});

test('mantém a melhor cópia: mais pixels, depois mais bytes', () => {
  assert.equal(pickKeeper([it('a', { w: 2048, h: 1536 }), it('b')]).id, 'b');
  assert.equal(pickKeeper([it('a', { size: 100 }), it('b', { size: 900 })]).id, 'b');
});

test('idênticos são cópias confirmadas sem precisar de pHash', () => {
  const r = analyzeDuplicates([it('a', { fingerprint: 'F', size: 10 }), it('b', { fingerprint: 'F', size: 10, ts: T + 5e6 })]);
  assert.equal(r.copias, 1);
  assert.equal(r.identicos, 1);
  assert.equal([...r.copies.values()][0].evidence, 'identico');
});

test('mesmo segundo: pHash separa cópia de foto em sequência', () => {
  const r = analyzeDuplicates([
    it('a', { phash: P1, size: 900 }), it('b', { phash: P1b, size: 500 }), // mesma imagem
    it('c', { ts: T + 7000, phash: P1 }), it('d', { ts: T + 7000, phash: P2 }), // fotos diferentes
  ]);
  assert.equal(r.copias, 1);
  assert.deepEqual(r.copies.get('b'), { keeper: 'a', evidence: 'imagem' });
  assert.equal(r.diferentes, 1);
});

test('candidatas sem pHash ficam pendentes e entram na lista para conferir', () => {
  const r = analyzeDuplicates([it('a', { phash: P1 }), it('b')]);
  assert.equal(r.copias, 0);
  assert.equal(r.pendentes, 1);
  assert.deepEqual(r.pendingIds, ['b']);
});

test('espaço ocupado pelas cópias', () => {
  const items = [it('a', { fingerprint: 'F', size: 10 }), it('b', { fingerprint: 'F', size: 7 })];
  const r = analyzeDuplicates(items);
  assert.equal(copiesBytes(items, r.copies), 7);
});

test('idênticos no mesmo segundo contam um grupo só', () => {
  const r = analyzeDuplicates([it('a', { fingerprint: 'F' }), it('b', { fingerprint: 'F' })]);
  assert.equal(r.grupos, 1);
  assert.equal(r.copias, 1);
  assert.equal(r.diferentes + r.incertos + r.pendentes, 0);
});
