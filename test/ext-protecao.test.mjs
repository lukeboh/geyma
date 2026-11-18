// Quais fotos pessoais estão nos dois lugares com a qualidade preservada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumoProtecao } from '../extension/src/core/protecao.js';

const par = (o = {}) => ({ cls: 'ambos', cat: 'pessoal', ident: 'provavel', a: { live: false }, g: { extrasLidos: true }, ...o });

test('conta só o que entra no envio, uma vez cada', () => {
  const s = resumoProtecao([
    par(),
    par({ ident: 'confirmada' }),
    par({ copiaGoogle: 'convertida' }),
    par({ cls: 'confirmar', ident: 'incerta' }),
    { cls: 'soIcloud', cat: 'pessoal', a: {} },
    { cls: 'soGoogle', cat: 'pessoal', g: {} },
    { cls: 'soGoogle', cat: 'pessoal', g: {}, dup: true },
    par({ cat: 'print' }),
    par({ cat: 'print', decision: 'manter' }),
    par({ decision: 'descartar' }),
  ]);
  assert.deepEqual(s, { total: 7, protegidas: 3, comPerda: 1, incertas: 1, soIcloud: 1, soGoogle: 1 });
});

test('linhas antigas sem o estado de identidade: "a confirmar" conta como incerta', () => {
  assert.equal(resumoProtecao([par({ ident: undefined, cls: 'confirmar' })]).incertas, 1);
  assert.equal(resumoProtecao([par({ ident: undefined })]).protegidas, 1);
});
