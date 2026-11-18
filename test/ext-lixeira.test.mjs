// Lixeira (0.8): só o que o usuário marcou Descartar; cópias só com a melhor ficando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { podeIrParaLixeira, listaLixeira, registrarLixeira, resumoLixeira, csvLixeiraIcloud } from '../extension/src/core/lixeira.js';

const T = Date.UTC(2020, 0, 2, 3, 4, 5);

test('só vai o que o usuário marcou Descartar (a sugestão não basta)', () => {
  const r = { cls: 'soGoogle', cat: 'captura', g: { id: 'g:1' } };
  assert.equal(podeIrParaLixeira(r, 'google').ok, false);
  assert.equal(podeIrParaLixeira({ ...r, decision: 'pendente' }, 'google').ok, false);
  assert.equal(podeIrParaLixeira({ ...r, decision: 'descartar' }, 'google').ok, true);
  assert.equal(podeIrParaLixeira({ ...r, decision: 'descartar' }, 'icloud').ok, false, 'não está no iCloud');
});

test('cópia repetida: só com a cópia que fica presente e diferente', () => {
  const base = { cls: 'soGoogle', decision: 'descartar', g: { id: 'g:copia' }, dup: true };
  assert.equal(podeIrParaLixeira({ ...base, dupOf: { id: 'g:fica' } }, 'google').motivo, 'cópia repetida (a melhor fica)');
  assert.equal(podeIrParaLixeira({ ...base, dupOf: null }, 'google').ok, false);
  assert.equal(podeIrParaLixeira({ ...base, dupOf: { id: 'g:copia' } }, 'google').ok, false);
  const ic = { cls: 'soIcloud', decision: 'descartar', a: { id: 'a:c', name: 'IMG_1.HEIC', size: 2097152 }, dupIcloud: true, dupOfIcloud: { id: 'a:f' } };
  assert.equal(podeIrParaLixeira(ic, 'icloud').ok, true);
});

test('lista por lado, sem o que já está na lixeira; registro e resumo', () => {
  const rows = [
    { cls: 'ambos', ts: T, decision: 'descartar', a: { id: 'a:1', name: 'IMG_1.HEIC', size: 2097152 }, g: { id: 'g:1', key: '1' } },
    { cls: 'soGoogle', ts: T - 1, decision: 'manter', g: { id: 'g:2' } },
  ];
  let reg = {};
  let l = listaLixeira(rows, reg);
  assert.deepEqual(l.google.map((x) => x.id), ['g:1']);
  assert.deepEqual(l.icloud.map((x) => x.id), ['a:1']);
  reg = registrarLixeira(reg, 'g:1', 'google', { ok: true, ensaio: true }, 5);
  assert.equal(reg['g:1'].estado, 'ensaio');
  assert.equal(listaLixeira(rows, reg).google.length, 1, 'o ensaio não tira da lista');
  reg = registrarLixeira(reg, 'g:1', 'google', { ok: true }, 6);
  assert.equal(listaLixeira(rows, reg).google.length, 0);
  reg = registrarLixeira(reg, 'g:9', 'google', { ok: false, erro: 'x' }, 7);
  assert.deepEqual(resumoLixeira(reg, new Set(['g:9'])), { google: 1, icloud: 0, falhas: 1, sumiram: 1 });
  const csv = csvLixeiraIcloud(l.icloud);
  assert.match(csv, /"2020-01-02 03:04:05","IMG_1.HEIC","2.0","foto","marcada Descartar"/);
});
