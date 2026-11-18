// Envio contínuo do que é novo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CICLO_MS, continuoPadrao, cicloDevido, filaContinua, googleAte, inicioDoDia, paginaAntiga } from '../extension/src/core/continuo.js';

const DIA = 86400000;
const desde = Date.UTC(2026, 10, 1);

test('ciclo: só ligado, e a cada CICLO_MS', () => {
  const c = continuoPadrao(desde + 5000);
  assert.equal(c.desde, desde);
  assert.equal(cicloDevido(c, desde), false);
  const on = { ...c, ativo: true };
  assert.equal(cicloDevido(on, desde), true, 'ligado e nunca rodou');
  assert.equal(cicloDevido({ ...on, ultimoCiclo: desde }, desde + CICLO_MS - 1), false);
  assert.equal(cicloDevido({ ...on, ultimoCiclo: desde }, desde + CICLO_MS), true);
  assert.equal(googleAte(on), desde - DIA);
  assert.equal(inicioDoDia(desde + 3600000), desde);
});

test('fila: novos, num serviço só, que podem ir e não foram; mais antigos primeiro', () => {
  const A = (id, ts, extra = {}) => ({ cls: 'soIcloud', ts, cat: 'pessoal', a: { id }, g: null, ...extra });
  const G = (id, ts, extra = {}) => ({ cls: 'soGoogle', ts, cat: 'pessoal', a: null, g: { id }, ...extra });
  const rows = [
    A('a:2', desde + 2 * DIA),
    A('a:1', desde + DIA),
    A('a:velha', desde - 1),
    A('a:lixo', desde + DIA, { cat: 'captura' }),
    A('a:foi', desde + DIA),
    G('g:1', desde + DIA),
    G('g:dup', desde + DIA, { dup: true }),
    { cls: 'ambos', ts: desde + DIA, cat: 'pessoal', a: { id: 'a:x' }, g: { id: 'g:x' }, melhor: { icloud: ['googleMenor'], google: [] } },
  ];
  const cfg = { ...continuoPadrao(desde), ativo: true };
  const f = filaContinua(rows, cfg, { 'a:foi': { estado: 'enviado' } });
  assert.deepEqual(f.google.map((r) => r.a.id), ['a:1', 'a:2']);
  assert.deepEqual(f.icloud.map((r) => r.g.id), ['g:1']);
  assert.deepEqual(filaContinua(rows, { ...cfg, icloud: false }).icloud, []);
});

test('leitura das novidades do Google para na primeira página antiga', () => {
  assert.equal(paginaAntiga([desde - 5, desde - 10], desde), true);
  assert.equal(paginaAntiga([desde + 5, desde - 10], desde), false);
  assert.equal(paginaAntiga([desde - 5], 0), false);
});
