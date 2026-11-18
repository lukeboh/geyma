// Melhor cópia de cada foto nos dois serviços (etapa 0.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { melhorCopia, resumoQualidade, etiquetaQualidade, porqueQualidade } from '../extension/src/core/qualidade.js';
import { sendPlan } from '../extension/src/core/plan.js';
import { filterRows } from '../extension/src/core/review.js';

const par = (o = {}) => ({ cls: 'ambos', cat: 'pessoal', ts: 1, a: { live: false, video: false, ...o.a }, g: { extrasLidos: true, motionMs: null, ...o.g }, ...o, ...(o.a ? { a: { live: false, video: false, ...o.a } } : {}), ...(o.g ? { g: { extrasLidos: true, motionMs: null, ...o.g } } : {}) });

test('iguais quando nada distingue as cópias', () => {
  assert.deepEqual(melhorCopia(par()), { lado: 'iguais', icloud: [], google: [] });
  assert.equal(melhorCopia({ cls: 'soIcloud', a: {} }), null);
});

test('iCloud melhor: Google menor, convertido ou sem o movimento', () => {
  assert.deepEqual(melhorCopia(par({ cls: 'reduzida', menor: 'google' })).icloud, ['googleMenor']);
  assert.deepEqual(melhorCopia(par({ copiaGoogle: 'convertida' })).icloud, ['googleConvertida']);
  assert.deepEqual(melhorCopia(par({ a: { live: true } })).icloud, ['googleSemMovimento']);
  const tudo = melhorCopia(par({ cls: 'reduzida', menor: 'google', copiaGoogle: 'convertida', a: { live: true } }));
  assert.equal(tudo.lado, 'icloud');
  assert.equal(tudo.icloud.length, 3);
});

test('movimento só conta com a leitura do Google que traz esse dado, e nunca em vídeo', () => {
  assert.equal(melhorCopia(par({ a: { live: true }, g: { extrasLidos: false } })).lado, 'iguais');
  assert.equal(melhorCopia(par({ a: { live: true, video: true } })).lado, 'iguais');
  assert.equal(melhorCopia(par({ a: { live: true }, g: { motionMs: 1500 } })).lado, 'iguais');
});

test('Google melhor e misto', () => {
  assert.equal(melhorCopia(par({ cls: 'reduzida', menor: 'icloud' })).lado, 'google');
  assert.deepEqual(melhorCopia(par({ g: { motionMs: 1200 } })).google, ['icloudSemMovimento']);
  const m = melhorCopia(par({ cls: 'reduzida', menor: 'icloud', copiaGoogle: 'convertida' }));
  assert.equal(m.lado, 'misto');
  assert.equal(etiquetaQualidade(m), 'cada lado tem uma vantagem');
  assert.match(porqueQualidade(m), /iCloud guarda uma cópia menor/);
  assert.equal(etiquetaQualidade({ lado: 'iguais' }), null);
});

test('resumo conta lados e motivos', () => {
  const rows = [par(), par({ copiaGoogle: 'convertida' }), par({ cls: 'reduzida', menor: 'icloud' }), { cls: 'soGoogle', g: {} }];
  const s = resumoQualidade(rows);
  assert.equal(s.pares, 3);
  assert.equal(s.iguais, 1);
  assert.equal(s.icloud, 1);
  assert.equal(s.google, 1);
  assert.equal(s.motivos.googleConvertida, 1);
});

test('plano: reenvio ao Google só do que entra no envio e não é cópia repetida', () => {
  const p = sendPlan([
    par({ copiaGoogle: 'convertida' }),
    par({ a: { live: true } }),
    par({ copiaGoogle: 'convertida', cat: 'print' }),
    par({ copiaGoogle: 'convertida', dup: true }),
  ]);
  assert.equal(p.quality.n, 2);
  assert.equal(p.quality.googleConvertida, 1);
  assert.equal(p.quality.googleSemMovimento, 1);
});

test('filtro da revisão por lado da melhor cópia', () => {
  const rows = [par(), par({ ts: 2, copiaGoogle: 'convertida' }), par({ ts: 3, cls: 'reduzida', menor: 'icloud' })];
  for (const r of rows) r.melhor = melhorCopia(r);
  assert.deepEqual(filterRows(rows, { cls: 'melhorIcloud' }).map((r) => r.ts), [2]);
  assert.deepEqual(filterRows(rows, { cls: 'melhorGoogle' }).map((r) => r.ts), [3]);
  assert.equal(filterRows(rows, { cls: 'dupGoogle' }).length, 0);
});
