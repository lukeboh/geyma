// "O que fazer agora": próximos passos do usuário, com as contagens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proximosPassos } from '../extension/src/core/passos.js';

const DIA = 86400000;

test('lista só o que tem itens, na ordem', () => {
  const d = {
    phashNeeded: ['1', '2'],
    googleFileNeeded: [],
    icloudPhashNeeded: [{}],
    icloudPhashWanted: 0,
    rows: [{ ident: 'incerta', cat: 'pessoal' }, { ident: 'provavel', cat: 'print' }, { cat: 'print', decision: 'manter' }, { cat: 'print', dup: true }],
  };
  const p = proximosPassos(d, { icloudConcluidoEm: 1000, agora: 1000 + DIA });
  assert.deepEqual(p.map((x) => [x.id, x.n]), [['conferirGoogle', 2], ['conferirIcloud', 1], ['responderPares', 1], ['revisarPendentes', 1]]);
});

test('conferência do Google em andamento não aparece; percurso velho ou pendente aparece', () => {
  const d = { phashNeeded: ['1'], rows: [], icloudPhashWanted: 5 };
  assert.match(proximosPassos(d, { agora: 40 * DIA, ocupado: { google: true } })[0].texto, /ainda não foi percorrido/);
  const p = proximosPassos(d, { icloudConcluidoEm: 5 * DIA, agora: 40 * DIA, ocupado: { google: true } });
  assert.deepEqual(p.map((x) => [x.id, x.n]), [['percorrerIcloud', 1]]);
  assert.match(p[0].texto, /30 dias/);
  const q = proximosPassos({ rows: [], icloudPhashWanted: 5 }, { icloudConcluidoEm: 10 * DIA, agora: 11 * DIA });
  assert.deepEqual(q.map((x) => [x.id, x.n]), [['percorrerIcloud', 5]]);
  assert.deepEqual(proximosPassos({ rows: [] }, { icloudConcluidoEm: DIA, agora: 2 * DIA }), []);
});

test('envio: conta as fotos que podem ir e muda o texto depois do primeiro envio', () => {
  const rows = [
    { cls: 'soIcloud', cat: 'pessoal', a: { id: 'a:1' } },
    { cls: 'soIcloud', cat: 'pessoal', a: { id: 'a:2' } },
    { cls: 'soIcloud', cat: 'print', a: { id: 'a:3' } }, // Pendente: não vai
    { cls: 'soGoogle', cat: 'pessoal', g: { id: 'g:1' } },
    { cls: 'soGoogle', cat: 'pessoal', g: { id: 'g:2', video: true, fileV: { bytes: 400 * 1048576 } }, decision: 'descartar' }, // descartado: fica
  ];
  const sem = proximosPassos({ rows }, { icloudConcluidoEm: 1, agora: 2 }).find((x) => x.id === 'enviar');
  assert.equal(sem.n, 3);
  assert.match(sem.texto, /piloto de uma foto/);
  const com = proximosPassos({ rows }, { icloudConcluidoEm: 1, agora: 2, envio: { 'a:1': { estado: 'enviado' } } }).find((x) => x.id === 'enviar');
  assert.equal(com.n, 2);
  assert.match(com.texto, /em lotes/);
});
