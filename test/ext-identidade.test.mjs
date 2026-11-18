// Certeza de que um par é a mesma foto: confirmada, provável ou incerta (etapa 0.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoIdentidade, matchLibraries, summarizeMatch } from '../extension/src/core/match.js';
import { filterRows } from '../extension/src/core/review.js';

const a = { ts: 1700000000123 };
const g = { ts: 1700000000000 };

test('confirmada: você, a imagem ou o mesmo arquivo no mesmo instante', () => {
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g, confirmadoPeloUsuario: true }), 'confirmada');
  assert.equal(estadoIdentidade({ cls: 'reduzida', a, g, confirmadoPorImagem: true }), 'confirmada');
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g: { ts: a.ts }, mesmoNome: true }), 'confirmada');
  // mesmo nome, mas o Google sem milissegundos: provável
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g, mesmoNome: true }), 'provavel');
});

test('incerta: a confirmar, só parecida, disputa ou reduzida sem imagem', () => {
  assert.equal(estadoIdentidade({ cls: 'confirmar', a, g }), 'incerta');
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g, parecida: true }), 'incerta');
  assert.equal(estadoIdentidade({ cls: 'reduzida', a, g }), 'incerta');
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g, disputado: true }), 'incerta');
});

test('provável: metadados batem sem outra candidata', () => {
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g }), 'provavel');
  assert.equal(estadoIdentidade({ cls: 'ambos', a, g, quadroDiferente: true }), 'provavel');
});

test('resumo do cruzamento conta a certeza dos pares', () => {
  const T = 1700000000000;
  const r = matchLibraries(
    [{ id: 'g:1', ts: T, w: 10, h: 20 }, { id: 'g:2', ts: T + 5000, w: 10, h: 20 }, { id: 'g:3', ts: T + 9000, w: 5, h: 10 }],
    [{ id: 'a:1', ts: T, w: 10, h: 20, mesmaQue: 'g:1' }, { id: 'a:2', ts: T + 5000, w: 20, h: 10 }, { id: 'a:3', ts: T + 9000, w: 10, h: 20 }],
  );
  assert.deepEqual(summarizeMatch(r).identidade, { confirmada: 1, provavel: 1, incerta: 1 });
});

test('filtro da revisão pela certeza', () => {
  const rows = [{ ts: 1, ident: 'confirmada' }, { ts: 2, ident: 'incerta' }, { ts: 3, cls: 'soGoogle' }];
  assert.deepEqual(filterRows(rows, { cls: 'idIncerta' }).map((r) => r.ts), [2]);
  assert.deepEqual(filterRows(rows, { cls: 'idConfirmada' }).map((r) => r.ts), [1]);
  assert.equal(filterRows(rows, { cls: 'idProvavel' }).length, 0);
});
