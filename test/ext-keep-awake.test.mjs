import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldKeepAwake } from '../extension/src/core/keep-awake.js';

test('tela acesa enquanto alguma leitura roda ou espera a aba voltar', () => {
  assert.equal(shouldKeepAwake({ icloud: 'lendo' }), true);
  assert.equal(shouldKeepAwake({ icloud: 'aguardando', google: 'concluido' }), true);
  assert.equal(shouldKeepAwake({ phash: 'lendo' }), true);
});

test('solta a tela quando tudo terminou, parou ou deu erro', () => {
  assert.equal(shouldKeepAwake({}), false);
  assert.equal(shouldKeepAwake(undefined), false);
  assert.equal(shouldKeepAwake({ icloud: 'concluido', google: 'parado', phash: 'erro' }), false);
});
