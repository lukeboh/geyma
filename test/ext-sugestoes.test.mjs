// Sugestões do Google para parear à mão uma foto que ficou só no iCloud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sugestoesDoGoogle } from '../extension/src/core/sugestoes.js';

const H = 3600000;
const T = 1600000000000;

test('mesmas dimensões, dentro da janela, do mais próximo para o mais distante', () => {
  const a = { ts: T, w: 4032, h: 3024, diferenteDe: ['g:recusada'] };
  const g = [
    { id: 'g:longe', ts: T + 30 * H, w: 4032, h: 3024 },
    { id: 'g:perto', ts: T - 2 * H, w: 3024, h: 4032 },
    { id: 'g:fora', ts: T + 40 * H, w: 4032, h: 3024 },
    { id: 'g:outra', ts: T + H, w: 1000, h: 1000 },
    { id: 'g:reduzida', ts: T + H, w: 2016, h: 1512 },
    { id: 'g:recusada', ts: T + H, w: 4032, h: 3024 },
  ];
  assert.deepEqual(sugestoesDoGoogle(a, g).map((x) => x.id), ['g:perto', 'g:longe']);
  assert.deepEqual(sugestoesDoGoogle(a, g, { max: 1 }).map((x) => x.id), ['g:perto']);
  assert.deepEqual(sugestoesDoGoogle({ ts: T }, g), []);
});
