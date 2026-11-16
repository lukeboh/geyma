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
  assert.deepEqual(r.extraOf, { 'g:2': 'g:1', 'g:3': 'g:1' });
  assert.equal(r.incertos, 1);
});

test('par disputado informa os candidatos do Google', () => {
  const google = [g(1, T, 4032, 3024), g(2, T + 900, 4032, 3024)];
  const r = matchLibraries(google, [a(1, T + 400, 4032, 3024)]);
  assert.equal(r.pairs[0].cls, 'confirmar');
  assert.deepEqual([...r.pairs[0].candidatos].sort(), ['g:1', 'g:2']);
  const unico = matchLibraries([g(1, T, 4032, 3024)], [a(1, T, 4032, 3024)]);
  assert.equal(unico.pairs[0].candidatos, undefined);
});

test('pHash do iCloud escolhe o candidato certo numa rajada', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1), withHash(g(2, T, 4032, 3024), P2)];
  const r = matchLibraries(google, [withHash(a(1, T + 300, 4032, 3024), '0000000000000001')]);
  assert.equal(r.pairs[0].g.id, 'g:2');
  assert.equal(r.pairs[0].cls, 'ambos');
  assert.equal(r.pairs[0].confirmadoPorImagem, true);
});

test('pHash do iCloud diferente de todos os candidatos: só no iCloud', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1)];
  const r = matchLibraries(google, [withHash(a(1, T, 4032, 3024), P2)]);
  assert.equal(r.pairs.length, 0);
  assert.equal(r.soIcloud.length, 1);
  assert.equal(r.soGoogle.length, 1);
});

test('duas cópias da mesma foto no iCloud e uma no Google: ambas em ambos', () => {
  const google = [withHash(g(1, T, 4032, 3024), P1)];
  const icloud = [withHash(a(1, T, 4032, 3024), P1), withHash(a(2, T + 10, 4032, 3024), P1b)];
  const r = matchLibraries(google, icloud);
  assert.equal(r.pairs.length, 2);
  assert.ok(r.pairs.every((p) => p.cls === 'ambos'));
  assert.equal(r.pairs.filter((p) => p.duplicataNoIcloud).length, 1);
});

import { googlePhashNeeded } from '../extension/src/core/match.js';

test('cópia reduzida sem a imagem conferida entra na conferência do Google', () => {
  // mesmo instante e mesma proporção (uma girada), mas sem pHash no Google: caso real de Live Photo com quadro trocado
  const ts = Date.UTC(2023, 11, 22, 3, 21, 46, 592);
  const a = { id: 'a:1', ts, w: 5712, h: 4284, phash: 'ca7a3d0d0e2392f3' };
  const g = { id: 'g:K', ts, w: 1280, h: 1706 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs[0].cls, 'reduzida');
  assert.ok(!r.pairs[0].confirmadoPorImagem);
  assert.deepEqual(googlePhashNeeded([], r.pairs, new Set()), ['K']);
  assert.deepEqual(googlePhashNeeded([], r.pairs, new Set(['g:K'])), []);
});

test('com o pHash do Google, imagens diferentes desfazem a cópia reduzida', () => {
  const ts = Date.UTC(2023, 11, 22, 3, 21, 46, 592);
  const a = { id: 'a:1', ts, w: 5712, h: 4284, phash: 'ca7a3d0d0e2392f3' };
  const g = { id: 'g:K', ts, w: 1280, h: 1706, phash: '35a5c2f2f1dc6d0c' };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs.length, 0);
  assert.equal(r.soIcloud.length, 1);
  assert.equal(r.soGoogle.length, 1);
});

test('imagens só parecidas (zona cinzenta) viram "a confirmar", não cópia reduzida', () => {
  // caso real: distância 14 entre dois quadros da mesma Live Photo
  const ts = Date.UTC(2023, 11, 22, 3, 21, 46, 592);
  const a = { id: 'a:1', ts, w: 5712, h: 4284, phash: 'ca7a3d0d0e2392f3' };
  const g = { id: 'g:K', ts, w: 1280, h: 1706, phash: '8978374c06339bf9' };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs[0].cls, 'confirmar');
  assert.equal(r.pairs[0].parecida, true);
  assert.equal(r.pairs[0].menor, 'google');
});

import { mesmoClique, isLive } from '../extension/src/core/match.js';

test('Live Photo: quadro diferente do mesmo clique continua sendo a mesma foto', () => {
  const ts = Date.UTC(2023, 11, 22, 3, 21, 46, 592);
  const a = { id: 'a:1', ts, w: 5712, h: 4284, subtype: 2, edited: true, phash: 'ca7a3d0d0e2392f3' };
  // imagem só parecida (14) e imagem bem diferente: as duas ficam no par
  for (const ph of ['8978374c06339bf9', '35a5c2f2f1dc6d0c']) {
    const r = matchLibraries([{ id: 'g:K', ts, w: 1280, h: 1706, phash: ph }], [a]);
    assert.equal(r.pairs.length, 1, ph);
    assert.equal(r.pairs[0].cls, 'reduzida');
    assert.equal(r.pairs[0].quadroDiferente, true);
    assert.equal(summarizeMatch(r).quadroDiferente, 1);
  }
});

test('mesmoClique exige Live Photo e o mesmo instante', () => {
  const ts = Date.UTC(2020, 0, 1, 10, 0, 0, 345);
  const live = { ts, subtype: 2 };
  assert.equal(isLive(live), true);
  assert.equal(isLive({ subtype: 0 }), false);
  assert.equal(isLive({ subtype: 2, live: false }), false);
  assert.equal(mesmoClique(live, { ts }), true);
  assert.equal(mesmoClique(live, { ts: ts + 1 }), false);
  // Google sem milissegundos: o mesmo segundo vale só com um candidato
  assert.equal(mesmoClique(live, { ts: ts - 345 }), true);
  assert.equal(mesmoClique(live, { ts: ts - 345 }, 2), false);
  assert.equal(mesmoClique({ ts }, { ts }), false);
});

test('fora de Live Photo, imagem diferente no mesmo instante continua separada', () => {
  const ts = Date.UTC(2023, 11, 22, 3, 21, 46, 592);
  const r = matchLibraries([{ id: 'g:K', ts, w: 1280, h: 1706, phash: '35a5c2f2f1dc6d0c' }], [{ id: 'a:1', ts, w: 5712, h: 4284, subtype: 0, phash: 'ca7a3d0d0e2392f3' }]);
  assert.equal(r.pairs.length, 0);
});

test('mesmo nome de arquivo no mesmo instante: versão editada, não fotos diferentes', () => {
  const ts = Date.UTC(2022, 5, 1, 12, 0, 0, 120);
  const a = { id: 'a:1', ts, w: 4032, h: 3024, subtype: 0, filename: 'IMG_1234.HEIC', fileType: 'public.heic', phash: 'ca7a3d0d0e2392f3' };
  const g = { id: 'g:K', ts, w: 4032, h: 3024, phash: '35a5c2f2f1dc6d0c', file: { formato: 'JPEG', nome: 'IMG_1234.jpg' } };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].versaoEditada, true);
  assert.equal(summarizeMatch(r).copia.convertida, 1);
  assert.equal(summarizeMatch(r).copia.convertidaCheia, 1);
});

test('Live Photos: conta movimento no Google só quando a leitura trouxe o dado', () => {
  const ts = Date.UTC(2021, 0, 1, 0, 0, 0, 1);
  const A = [0, 1, 2].map((i) => ({ id: `a:${i}`, ts: ts + i * 5000, w: 4032, h: 3024, subtype: 2 }));
  const G = [
    { id: 'g:0', ts, w: 4032, h: 3024, extrasLidos: true, motionMs: 2798 },
    { id: 'g:1', ts: ts + 5000, w: 4032, h: 3024, extrasLidos: true },
    { id: 'g:2', ts: ts + 10000, w: 4032, h: 3024 },
  ];
  assert.deepEqual(summarizeMatch(matchLibraries(G, A)).live, { total: 3, comMovimento: 1, semMovimento: 1, naoLido: 1 });
});

import { paraCruzar } from '../extension/src/core/match.js';

test('fotos ocultas do iCloud ficam fora do cruzamento e do envio', () => {
  const ts = Date.UTC(2024, 0, 1);
  const icloud = [{ id: 'a:1', ts, w: 10, h: 10 }, { id: 'a:2', ts: ts + 9000, w: 10, h: 10, hidden: true }];
  const A = paraCruzar(icloud);
  assert.deepEqual(A.map((x) => x.id), ['a:1']);
  const r = matchLibraries([], A);
  assert.deepEqual(r.soIcloud.map((x) => x.id), ['a:1']);
});

import { naoVistosNoPercurso } from '../extension/src/core/match.js';

test('percurso completo: o que ele não viu fica de fora; se faltar muito, não marca nada', () => {
  const inicio = 1000;
  const vistos = Array.from({ length: 200 }, (_, i) => ({ id: `a:v${i}`, thumbAt: 1500, seenAt: 10 }));
  const items = [...vistos, { id: 'a:oculta', thumbAt: 900, seenAt: 800 }, { id: 'a:ja-marcada', hidden: true, thumbAt: 1 }, { id: 'a:nova', thumbAt: 1200, seenAt: 1200 }];
  assert.deepEqual(naoVistosNoPercurso(items, inicio), ['a:oculta']);
  // percurso que pulou metade: suspeito, nada é marcado
  const metade = vistos.map((x, i) => (i % 2 ? { ...x, thumbAt: 1 } : x));
  assert.equal(naoVistosNoPercurso(metade, inicio), null);
  assert.deepEqual(paraCruzar([{ id: 'a:1' }, { id: 'a:2', foraDoPercurso: 5 }, { id: 'a:3', hidden: true }]).map((x) => x.id), ['a:1']);
});
