// Fotos e vídeos separados: vista por tipo, inventário por tipo, duplicatas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoDaLinha, separarPorTipo, itensPorTipo, juntarDuplicatas, vistaPorTipo, inventarioPorTipo, nomeDoTipo } from '../extension/src/core/tipo.js';
import { summarize } from '../extension/src/core/normalize.js';
import { applyChange } from '../extension/src/core/inv-summary.js';
import { filterRows } from '../extension/src/core/review.js';
import { proximosPassos } from '../extension/src/core/passos.js';
import { analyzeDuplicates } from '../extension/src/core/dedup.js';

const T2020 = Date.UTC(2020, 5, 1);
const T2021 = Date.UTC(2021, 5, 1);

test('tipo da linha: pelo lado que existir, e .m4v sem tipo conta como vídeo', () => {
  assert.equal(tipoDaLinha({ a: { video: true }, g: { video: true } }), 'video');
  assert.equal(tipoDaLinha({ a: null, g: { video: true } }), 'video');
  assert.equal(tipoDaLinha({ a: { filename: 'clipe.M4V' }, g: null }), 'video');
  assert.equal(tipoDaLinha({ a: { w: 1 }, g: null }), 'foto');
});

test('filtro da revisão por tipo pega os vídeos só do Google (sem lado do iCloud)', () => {
  const rows = [{ cls: 'soGoogle', ts: 1, a: null, g: { video: true } }, { cls: 'soGoogle', ts: 2, a: null, g: {} }];
  assert.equal(filterRows(rows, { kind: 'video' }).length, 1);
  assert.equal(filterRows(rows, { kind: 'foto' }).length, 1);
});

test('separa o resultado do cruzamento e os itens por tipo', () => {
  const r = separarPorTipo({ pairs: [{ a: { video: true }, g: { video: true } }, { a: {}, g: {} }], soGoogle: [{ video: true }], soIcloud: [{}, {}] });
  assert.equal(r.video.pairs.length, 1);
  assert.equal(r.foto.pairs.length, 1);
  assert.equal(r.video.soGoogle.length, 1);
  assert.equal(r.foto.soIcloud.length, 2);
  const i = itensPorTipo([{ video: true }, {}, { filename: 'a.mov' }]);
  assert.equal(i.video.length, 2);
  assert.equal(i.foto.length, 1);
});

test('duplicatas por tipo juntas dão o mesmo que a análise de tudo', () => {
  const it = (id, video, extra = {}) => ({ id, ts: T2020, w: 100, h: 200, video, phash: 'ffff0000ffff0000', ...extra });
  const items = [it('a', false), it('b', false), it('c', true, { durMs: 3000 }), it('d', true, { durMs: 3000 })];
  const t = itensPorTipo(items);
  const junto = juntarDuplicatas(analyzeDuplicates(t.foto), analyzeDuplicates(t.video));
  const tudo = analyzeDuplicates(items);
  assert.equal(junto.copias, tudo.copias);
  assert.equal(junto.grupos, tudo.grupos);
  assert.deepEqual([...junto.copies.keys()].sort(), [...tudo.copies.keys()].sort());
});

test('vista por tipo troca as linhas e os resumos; Tudo devolve o cruzamento inteiro', () => {
  const d = {
    rows: [{ a: { video: true }, g: { video: true } }, { a: {}, g: {} }, { a: null, g: {} }],
    summary: { totals: { ambos: 2 } },
    porTipo: { foto: { summary: { totals: { ambos: 1 } } }, video: { summary: { totals: { ambos: 1 } } } },
  };
  assert.equal(vistaPorTipo(d, ''), d);
  const v = vistaPorTipo(d, 'video');
  assert.equal(v.rows.length, 1);
  assert.equal(v.tipo, 'video');
  assert.equal(vistaPorTipo(d, 'foto').rows.length, 2);
  // sem os resumos por tipo (cálculo antigo), troca só as linhas
  assert.equal(vistaPorTipo({ rows: d.rows, summary: d.summary }, 'foto').summary, d.summary);
});

test('inventário por tipo: vídeos por ano, mantidos a cada gravação', () => {
  const items = [{ ts: T2020 }, { ts: T2020, video: true }, { ts: T2021, filename: 'x.m4v' }, { ts: T2021 }];
  const s = summarize(items);
  assert.equal(s.videos, 2);
  assert.deepEqual(s.byYearVideo, { 2020: 1, 2021: 1 });
  assert.deepEqual(inventarioPorTipo(s, 'video'), { ...s, total: 2, byYear: { 2020: 1, 2021: 1 } });
  assert.equal(inventarioPorTipo(s, 'foto').total, 2);
  assert.deepEqual(inventarioPorTipo(s, 'foto').byYear, { 2020: 1, 2021: 1 });
  assert.equal(inventarioPorTipo(s, ''), s);
  // gravação incremental: troca de um item soma e desconta os vídeos por ano
  const by = {};
  for (const it of items) applyChange(by, undefined, { ...it, source: 'icloud' });
  assert.deepEqual(by.icloud.byYearVideo, { 2020: 1, 2021: 1 });
  applyChange(by, { ...items[1], source: 'icloud' }, undefined);
  assert.deepEqual(by.icloud.byYearVideo, { 2021: 1 });
  assert.equal(by.icloud.videos, 1);
});

test('próximos passos seguem o tipo em vista', () => {
  const d = { rows: [], phashNeeded: [1], googleFileNeeded: [1], videoFileNeeded: [1, 2] };
  const ids = (t) => proximosPassos({ ...d, tipo: t }, { icloudConcluidoEm: 1, agora: 2 }).map((p) => p.id);
  assert.deepEqual(ids('video'), ['arquivosVideo']);
  assert.deepEqual(ids('foto'), ['conferirGoogle', 'arquivosGoogle']);
  assert.deepEqual(ids(undefined), ['conferirGoogle', 'arquivosGoogle', 'arquivosVideo']);
  assert.equal(nomeDoTipo('video'), 'vídeos');
  assert.equal(nomeDoTipo('foto', false), 'foto');
});
