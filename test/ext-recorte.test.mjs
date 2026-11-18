// Recorte e edição pelas miniaturas (0.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cinza, reduzir, ncc, acharDentro, recorteEntre, tamanhoPara, RECORTE_MIN } from '../extension/src/core/recorte.js';

// cena sintética sem repetição: manchas de tamanhos e posições sorteadas
function cena(w, h, semente = 1) {
  let s = semente * 7919;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  const manchas = Array.from({ length: 120 }, () => ({ x: rnd() * w, y: rnd() * h, r: 4 + rnd() * w / 12, v: rnd() * 200 - 100 }));
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 128;
    for (const m of manchas) v += m.v * Math.exp(-((x - m.x) ** 2 + (y - m.y) ** 2) / (2 * m.r * m.r));
    px[y * w + x] = v;
  }
  return { px, w, h };
}
const cortar = (img, x0, y0, w, h) => {
  const px = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px[y * w + x] = img.px[(y0 + y) * img.w + x0 + x];
  return { px, w, h };
};
const mini = (img) => { const t = tamanhoPara(img.w, img.h); return reduzir(img, t.w, t.h); };

test('cinza e redução por média', () => {
  assert.deepEqual([...cinza(Uint8ClampedArray.from([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1)].map(Math.round), [255, 0]);
  const r = reduzir({ px: Float32Array.from([0, 2, 4, 6]), w: 4, h: 1 }, 2, 1);
  assert.deepEqual([...r.px], [1, 5]);
  assert.deepEqual(tamanhoPara(4032, 3024), { w: 128, h: 96 });
});

test('correlação ignora brilho e contraste (edição de tom)', () => {
  const a = cena(64, 48);
  const b = { ...a, px: a.px.map((v) => v * 0.6 + 50) };
  assert.ok(ncc(a, b) > 0.999);
  assert.ok(ncc(a, cena(64, 48, 3)) < RECORTE_MIN);
});

test('acha o recorte do Google dentro da foto do iCloud', () => {
  const inteira = cena(400, 300);
  const pedaco = cortar(inteira, 120, 60, 200, 200); // quadrado, de outra proporção
  const r = recorteEntre(mini(inteira), mini(pedaco));
  assert.equal(r.cortada, 'google');
  assert.ok(r.ncc >= RECORTE_MIN, String(r.ncc));
  assert.ok(Math.abs(r.caixa.x - 0.3) < 0.05 && Math.abs(r.caixa.w - 0.5) < 0.06, JSON.stringify(r.caixa));
});

test('e o do iCloud dentro do Google; fotos diferentes não são recorte', () => {
  const inteira = cena(300, 400, 2);
  const pedaco = cortar(inteira, 30, 100, 240, 180);
  assert.equal(recorteEntre(mini(pedaco), mini(inteira)).cortada, 'icloud');
  assert.equal(recorteEntre(mini(cena(400, 300, 5)), mini(cortar(cena(400, 300, 7), 50, 50, 200, 200))), null);
});

test('acharDentro devolve a janela em frações', () => {
  const g = cena(128, 96, 4);
  const p = cortar(g, 32, 16, 64, 64);
  const r = acharDentro(g, p);
  assert.ok(r.ncc > 0.99, String(r.ncc));
  assert.deepEqual([r.x * 128, r.y * 96, r.w * 128, r.h * 96].map(Math.round), [32, 16, 64, 64]);
});

import { candidatosRecorte } from '../extension/src/core/recorte.js';
import { matchLibraries, estadoIdentidade } from '../extension/src/core/match.js';
import { placarIdentidade } from '../extension/src/core/placar.js';
import { melhorCopia } from '../extension/src/core/qualidade.js';

test('candidatos: mesmo segundo, proporções diferentes, ainda não conferidos', () => {
  const a = { id: 'a:1', ts: 10_400, w: 4032, h: 3024 };
  const gs = [
    { id: 'g:1', ts: 10_000, w: 2000, h: 2000, thumb: 'u1' }, // quadrada: candidata
    { id: 'g:2', ts: 10_000, w: 2016, h: 1512, thumb: 'u2' }, // mesma proporção: o cruzamento já viu
    { id: 'g:3', ts: 12_000, w: 2000, h: 2000, thumb: 'u3' }, // outro segundo
    { id: 'g:4', ts: 10_000, w: 2000, h: 2000, thumb: 'u4', video: true },
  ];
  assert.deepEqual(candidatosRecorte([a], gs).map((c) => c.gId), ['g:1']);
  assert.deepEqual(candidatosRecorte([{ ...a, semRecorte: ['g:1'] }], gs), []);
  assert.deepEqual(candidatosRecorte([{ ...a, recorte: { g: 'g:9' } }], gs), []);
  assert.deepEqual(candidatosRecorte([{ ...a, diferenteDe: ['g:1'] }], gs), []);
});

test('recorte achado vira par confirmado, com a cópia inteira como melhor', () => {
  const a = { id: 'a:1', ts: 10_400, w: 4032, h: 3024, phash: '0000000000000000', recorte: { g: 'g:1', cortada: 'google', ncc: 0.93 } };
  const g = { id: 'g:1', ts: 10_000, w: 2000, h: 2000, phash: 'ffffffffffffffff' };
  const { pairs, soGoogle, soIcloud } = matchLibraries([g], [a]);
  assert.equal(soGoogle.length + soIcloud.length, 0);
  const [p] = pairs;
  assert.equal(p.cls, 'ambos');
  assert.equal(p.rel, 'recorte');
  assert.equal(p.recorte, 'google');
  assert.equal(p.dist, null);
  assert.equal(estadoIdentidade(p), 'confirmada');
  // o usuário dizendo que são diferentes desfaz
  assert.equal(matchLibraries([g], [{ ...a, diferenteDe: ['g:1'] }]).pairs.length, 0);
  const r = { a: { id: 'a:1' }, g: { id: 'g:1' }, recorte: 'google', prova: { dt: 400, dist: null, rel: 'recorte', recorte: 0.93 } };
  assert.deepEqual(placarIdentidade(r).provas.map((x) => [x.k, x.pontos]), [['instante', 2], ['dimensoes', 0], ['imagem', 4]]);
  assert.match(placarIdentidade(r).provas[2].texto, /recorte da outra \(semelhança 0,93\)/);
  assert.deepEqual(melhorCopia({ cls: 'ambos', recorte: 'google', a: {}, g: {} }), { lado: 'icloud', icloud: ['googleRecortada'], google: [] });
  assert.deepEqual(melhorCopia({ cls: 'ambos', recorte: 'icloud', a: {}, g: {} }), { lado: 'google', icloud: [], google: ['icloudRecortada'] });
});

test('nas duas direções com folga, a cortada é a de menos pixels', () => {
  const inteira = cena(400, 300, 6);
  const quase = cortar(inteira, 4, 0, 392, 300);
  assert.equal(recorteEntre(mini(inteira), mini(quase), { a: 400 * 300, g: 392 * 300 }).cortada, 'google');
  assert.equal(recorteEntre(mini(quase), mini(inteira), { a: 392 * 300, g: 400 * 300 }).cortada, 'icloud');
});

import { edicaoEntre, candidatosEdicao, EDICAO_MIN } from '../extension/src/core/recorte.js';

test('edição: mesma imagem com outro tom; foto em sequência não passa', () => {
  const a = mini(cena(400, 300, 8));
  const tom = { ...a, px: a.px.map((v) => Math.min(255, v * 1.3 + 10)) };
  assert.ok(edicaoEntre(a, tom).ncc >= EDICAO_MIN);
  // a cena mexida (outro momento): parte da imagem muda
  const mexida = { ...a, px: a.px.map((v, i) => ((i % a.w) > a.w / 2 ? a.px[i - 9] ?? v : v)) };
  assert.equal(edicaoEntre(a, mexida), null);
  assert.equal(edicaoEntre(a, mini(cena(300, 400, 8))), null); // tamanhos diferentes
  // quase preta: a correlação mede ruído, não decide
  const escura = { ...a, px: a.px.map((v) => v / 40) };
  assert.equal(edicaoEntre(escura, { ...escura, px: escura.px.map((v) => v * 1.1) }), null);
});

test('par só parecido explicado como edição sai de "a confirmar"', () => {
  const A = (o) => ({ id: 'a:1', ts: 5000, w: 4032, h: 3024, phash: '0000000000000000', ...o });
  const g = { id: 'g:1', ts: 5000, w: 4032, h: 3024, phash: '0000000000007fff', thumb: 'u' }; // distância 15
  const antes = matchLibraries([g], [A()]).pairs[0];
  assert.equal(antes.parecida, true);
  assert.deepEqual(candidatosEdicao([antes]).map((c) => [c.aId, c.gId]), [['a:1', 'g:1']]);
  assert.deepEqual(candidatosEdicao([{ ...antes, a: A({ semEdicao: ['g:1'] }) }]), []);
  assert.deepEqual(candidatosEdicao([{ ...antes, g: { ...g, video: true } }]), []);
  const p = matchLibraries([g], [A({ edicao: { g: 'g:1', ncc: 0.97 } })]).pairs[0];
  assert.equal(p.parecida, undefined);
  assert.equal(p.versaoEditada, true);
  assert.equal(p.cls, 'ambos');
  assert.equal(estadoIdentidade(p), 'provavel');
  // edição achada para outra foto do Google não vale para esta
  assert.equal(matchLibraries([g], [A({ edicao: { g: 'g:2', ncc: 0.97 } })]).pairs[0].parecida, true);
  const r = { a: { id: 'a:1' }, g: { id: 'g:1' }, versaoEditada: true, prova: { dt: 0, dist: 15, rel: 'igual', edicao: 0.97 } };
  assert.match(placarIdentidade(r).provas.find((x) => x.k === 'imagem').texto, /uma foi editada \(semelhança 0,97\)/);
  assert.equal(placarIdentidade(r).pontos, 3 + 2 + 3);
});
