// Fotos em sequência no mesmo segundo (rajadas): a imagem resolve a disputa
// quando a candidata mais parecida ganha das outras com folga.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchLibraries, estadoIdentidade, rajadaResolvida, RAJADA_MARGEM } from '../extension/src/core/match.js';
import { placarIdentidade } from '../extension/src/core/placar.js';

// pHash de 64 bits em hexadecimal: n bits ligados a partir da posição ini
// (as candidatas do Google ficam em posições separadas, para não parecerem
// cópias repetidas umas das outras)
const ph = (bits, ini = 0) => (((1n << BigInt(bits)) - 1n) << BigInt(ini)).toString(16).padStart(16, '0');
const A = (o) => ({ id: 'a:1', ts: 5000, w: 4032, h: 3024, phash: ph(0), ...o });
const G = (id, bits, ini = 0) => ({ id, ts: 5000, w: 4032, h: 3024, phash: ph(bits, ini) });

test('a mais parecida com folga resolve a disputa: provável, não incerta', () => {
  const { pairs } = matchLibraries([G('g:1', 12), G('g:2', 12 + RAJADA_MARGEM, 40)], [A()]);
  const [p] = pairs;
  assert.equal(p.g.id, 'g:1');
  assert.deepEqual(p.rajada, { n: 2, margem: RAJADA_MARGEM });
  assert.equal(p.disputado, undefined);
  assert.equal(p.cls, 'ambos');
  assert.equal(estadoIdentidade(p), 'provavel');
});

test('sem folga suficiente, continua a confirmar', () => {
  const { pairs } = matchLibraries([G('g:1', 12), G('g:2', 12 + RAJADA_MARGEM - 1, 40)], [A()]);
  assert.equal(pairs[0].rajada, undefined);
  assert.equal(pairs[0].cls, 'confirmar');
  assert.equal(estadoIdentidade(pairs[0]), 'incerta');
});

test('outra foto do iCloud que quer a mesma do Google também precisa perder com folga', () => {
  // a:2 está a 14 de g:1: a folga de a:1 (12) sobre ela é só 2
  const icloud = [A(), A({ id: 'a:2', phash: ph(2, 12) })];
  const { pairs } = matchLibraries([G('g:1', 12), G('g:2', 40)], icloud);
  const p = pairs.find((x) => x.a.id === 'a:1');
  assert.equal(p.g.id, 'g:1');
  assert.equal(p.disputado, true);
  assert.equal(p.rajada, undefined);
});

test('candidata sem imagem para comparar: não resolve', () => {
  assert.equal(rajadaResolvida({ d: 5 }, [{ d: 5 }, { d: null }]), null);
  assert.equal(rajadaResolvida({ d: 5 }, [{ d: 5 }, { d: 30 }], [{ d: null }]), null);
  assert.equal(rajadaResolvida({ d: 17 }, [{ d: 17 }, { d: 40 }]), null); // longe demais
  const pk = { d: 5 };
  assert.deepEqual(rajadaResolvida(pk, [pk, { d: 30 }], [{ d: 20, melhor: 20 }]), { n: 2, margem: 15 });
  // rival perto, mas com uma opção bem melhor em outra foto: não disputa
  assert.deepEqual(rajadaResolvida(pk, [pk, { d: 30 }], [{ d: 9, melhor: 0 }]), { n: 2, margem: 25 });
  // rival perto e sem opção melhor: disputa
  assert.equal(rajadaResolvida(pk, [pk, { d: 30 }], [{ d: 7, melhor: 7 }]), null);
});

test('o placar mostra a rajada resolvida', () => {
  const r = { a: { id: 'a:1' }, g: { id: 'g:1' }, prova: { dt: 0, dist: 12, rel: 'igual', rajada: { n: 3, margem: 9 } } };
  const pl = placarIdentidade(r);
  assert.deepEqual(pl.provas.map((x) => x.k), ['instante', 'dimensoes', 'imagem', 'rajada']);
  assert.match(pl.provas[3].texto, /a mais parecida entre 3 fotos do Google no mesmo segundo \(folga de 9\)/);
});
