import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dimRelation, matchLibraries, summarizeMatch, googleSameSecondGroups, partialUntil } from '../extension/src/core/match.js';

const g = (id, ts, w, h) => ({ id: `g:${id}`, source: 'google', ts, w, h });
const a = (id, ts, w, h) => ({ id: `a:${id}`, source: 'icloud', ts, w, h });
const T = Date.UTC(2018, 5, 1, 12, 0, 0);

test('dimensões iguais, giradas, reduzidas e incompatíveis', () => {
  assert.equal(dimRelation({ w: 4032, h: 3024 }, { w: 4032, h: 3024 }), 'igual');
  assert.equal(dimRelation({ w: 4032, h: 3024 }, { w: 3024, h: 4032 }), 'igual');
  assert.equal(dimRelation({ w: 4032, h: 3024 }, { w: 2048, h: 1536 }), 'reduzida');
  assert.equal(dimRelation({ w: 4032, h: 3024 }, { w: 1536, h: 2048 }), 'reduzida');
  assert.equal(dimRelation({ w: 4032, h: 3024 }, { w: 1920, h: 1080 }), null);
  assert.equal(dimRelation({ w: null, h: 3024 }, { w: 4032, h: 3024 }), null);
});

test('Google sem milissegundos casa com o iCloud dentro de 1 s', () => {
  const r = matchLibraries([g(1, T, 4032, 3024)], [a(1, T + 807, 3024, 4032)]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].cls, 'ambos');
  const longe = matchLibraries([g(1, T, 4032, 3024)], [a(1, T + 1500, 4032, 3024)]);
  assert.equal(longe.pairs.length, 0);
  assert.equal(longe.soGoogle.length, 1);
  assert.equal(longe.soIcloud.length, 1);
});

test('cópia reduzida indica o lado menor', () => {
  const r = matchLibraries([g(1, T, 2048, 1536)], [a(1, T, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'reduzida');
  assert.equal(r.pairs[0].menor, 'google');
});

test('dois candidatos no mesmo segundo viram "a confirmar", um para um', () => {
  const google = [g(1, T, 4032, 3024), g(2, T, 4032, 3024)];
  const icloud = [a(1, T + 100, 4032, 3024), a(2, T + 300, 4032, 3024)];
  const r = matchLibraries(google, icloud);
  assert.equal(r.pairs.length, 2);
  assert.ok(r.pairs.every((p) => p.cls === 'confirmar'));
  assert.equal(new Set(r.pairs.map((p) => p.g.id)).size, 2);
});

test('duplicata no Google sobra como "só no Google" e aparece no grupo', () => {
  const google = [g(1, T, 4032, 3024), g(2, T, 3024, 4032), g(3, T + 5000, 4032, 3024)];
  const r = matchLibraries(google, [a(1, T, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'confirmar');
  assert.equal(r.soGoogle.length, 2);
  const groups = googleSameSecondGroups(google);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].length, 2);
});

test('cruzamento parcial ignora os dois lados depois do limite', () => {
  const r = matchLibraries([g(1, T, 10, 10), g(2, T + 864e5, 10, 10)], [a(1, T, 10, 10), a(2, T + 2 * 864e5, 10, 10)], { until: T + 1000 });
  assert.equal(r.pairs.length, 1);
  assert.equal(r.soGoogle.length, 0);
  assert.equal(r.soIcloud.length, 0);
});

test('resumo por classe e por ano', () => {
  const r = matchLibraries([g(1, T, 4032, 3024), g(2, Date.UTC(2010, 0, 1), 10, 10)], [a(1, T, 4032, 3024), a(2, Date.UTC(2019, 0, 1), 10, 10)]);
  const s = summarizeMatch(r);
  assert.deepEqual(s.totals, { ambos: 1, confirmar: 0, reduzida: 0, soGoogle: 1, soIcloud: 1 });
  assert.equal(s.byYear[2018].ambos, 1);
  assert.equal(s.byYear[2010].soGoogle, 1);
  assert.equal(s.byYear[2019].soIcloud, 1);
});

test('limite parcial pelo percentil 99 ignora os recentes capturados no início', () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ ts: i }));
  items.push(...Array.from({ length: 5 }, () => ({ ts: 1e12 })));
  assert.ok(partialUntil(items) < 1000);
  assert.equal(partialUntil(items.slice(0, 10)), null);
});

// pHash: 'f'*16 e um bit de diferença = mesma imagem; '0'*16 = outra imagem
const P1 = 'ffffffffffffffff';
const P1b = 'fffffffffffffffe';
const P2 = '0000000000000000';
const withHash = (item, phash) => ({ ...item, phash });

test('candidatos que são a mesma imagem deixam de ser disputa', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1), withHash(g(2, T, 4032, 3024), P1b)];
  const r = matchLibraries(google, [a(1, T + 200, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'ambos');
  assert.equal(r.pairs[0].duplicatasNoGoogle, 1);
});

test('candidatos com imagens diferentes continuam a confirmar', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1), withHash(g(2, T, 4032, 3024), P2)];
  const r = matchLibraries(google, [a(1, T + 200, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'confirmar');
});

test('sem pHash calculado, o par continua a confirmar', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1), g(2, T, 4032, 3024)];
  const r = matchLibraries(google, [a(1, T + 200, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'confirmar');
});

test('duplicatas do Google classificadas pelo pHash', async () => {
  const { analyzeGoogleDuplicates } = await import('../extension/src/core/match.js');
  const groups = [
    [withHash(g(1, T, 1, 1), P1), withHash(g(2, T, 1, 1), P1b), withHash(g(3, T, 1, 1), P1)], // 2 extras
    [withHash(g(4, T, 1, 1), P1), withHash(g(5, T, 1, 1), P2)], // fotos diferentes
    [withHash(g(6, T, 1, 1), P1), g(7, T, 1, 1)], // falta hash
    [withHash(g(8, T, 1, 1), 'ffffffffffff0000'), withHash(g(9, T, 1, 1), P1)], // distância 16: incerto
  ];
  const r = analyzeGoogleDuplicates(groups);
  assert.equal(r.confirmados, 1);
  assert.equal(r.extrasConfirmados, 2);
  assert.equal(r.diferentes, 1);
  assert.equal(r.pendentes, 1);
  assert.deepEqual(r.pendingIds, ['g:7']);
  assert.equal(r.incertos, 1);
});
