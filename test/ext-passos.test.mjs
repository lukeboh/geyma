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
