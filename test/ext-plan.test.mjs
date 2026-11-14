import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendPlan, bytesPerPixel, effectiveDecision } from '../extension/src/core/plan.js';

const icl = (o) => ({ cls: 'soIcloud', cat: 'pessoal', decision: null, a: { size: 1000, w: 10, h: 10, video: false }, ...o });
const goo = (o) => ({ cls: 'soGoogle', cat: 'pessoal', decision: null, g: { w: 10, h: 10 }, ...o });

test('marcação em vigor: a do usuário ou a sugestão', () => {
  assert.equal(effectiveDecision({ cat: 'print', decision: null }), 'pendente');
  assert.equal(effectiveDecision({ cat: 'print', decision: 'manter' }), 'manter');
  assert.equal(effectiveDecision({ cat: 'pessoal', decision: null }), 'pessoal');
});

test('só Pessoal e Manter entram; Pendente e Descartar ficam retidos', () => {
  const p = sendPlan([
    icl(),
    icl({ cat: 'print' }),
    icl({ decision: 'descartar' }),
    icl({ cat: 'internet', decision: 'manter', a: { size: 5000, w: 10, h: 10, video: true } }),
  ]);
  assert.equal(p.toGoogle.n, 2);
  assert.equal(p.toGoogle.held, 2);
  assert.equal(p.toGoogle.bytes, 6000);
  assert.equal(p.toGoogle.videos, 1);
  assert.equal(p.toGoogle.videoBytes, 5000);
});

test('Google → iCloud ignora cópias repetidas e estima o tamanho por pixel', () => {
  const rows = [icl({ cls: 'ambos', a: { size: 200, w: 10, h: 10 } }), goo(), goo({ dup: true }), goo({ cat: 'print' })];
  const p = sendPlan(rows);
  assert.equal(p.bpp, 2);
  assert.equal(p.toIcloud.n, 1);
  assert.equal(p.toIcloud.held, 1);
  assert.equal(p.toIcloud.bytes, 200);
});

test('reenvio de original quando o Google guarda a cópia menor', () => {
  const p = sendPlan([{ cls: 'reduzida', menor: 'google', cat: 'pessoal', a: { size: 1, w: 1, h: 1 } }, { cls: 'reduzida', menor: 'icloud', cat: 'pessoal', a: { size: 1, w: 1, h: 1 } }]);
  assert.equal(p.quality.n, 1);
});

test('sem fotos do iCloud usa o valor padrão de bytes por pixel', () => {
  assert.equal(bytesPerPixel([], 0.35), 0.35);
});
