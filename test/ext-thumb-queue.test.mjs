import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThumbQueue, thumbUrl } from '../extension/src/core/thumb-queue.js';

const F = '${f}';

test('só baixa os itens que precisam de algo, com miniatura, uma vez cada', async () => {
  const calls = [];
  const saved = [];
  const q = new ThumbQueue({
    concurrency: 2, batch: 2,
    work: async (url, need) => { calls.push([url, need]); return need.phash ? { phash: 'h' } : {}; },
    save: async (b) => { saved.push(...b); },
  });
  q.setWanted(['a:1', 'a:2', 'a:3'], []);
  q.offer([
    { id: 'a:1', thumb: `https://x/1/${F}` },
    { id: 'a:2', thumb: `https://x/2/${F}`, phash: 'ja' },
    { id: 'a:3', thumb: null },
    { id: 'a:4', thumb: `https://x/4/${F}` },
  ]);
  q.offer([{ id: 'a:1', thumb: `https://x/1/${F}` }]);
  await q.idle;
  assert.deepEqual(calls, [['https://x/1/thumb.jpg', { phash: true, keep: false }]]);
  assert.deepEqual(saved, [{ id: 'a:1', phash: 'h' }]);
  assert.deepEqual(q.stats(), { done: 1, kept: 0, failed: 0, expired: 0, queued: 0 });
});

test('uma descarga serve à impressão digital e à miniatura guardada', async () => {
  const calls = [];
  const saved = [];
  const q = new ThumbQueue({
    work: async (url, need) => { calls.push(need); return { ...(need.phash ? { phash: 'h' } : {}), ...(need.keep ? { blob: 'b' } : {}) }; },
    save: async (b) => { saved.push(...b); },
  });
  q.setWanted(['a:1'], ['a:1', 'a:2']);
  q.offer([{ id: 'a:1', thumb: `https://x/1/${F}` }, { id: 'a:2', thumb: `https://x/2/${F}`, phash: 'ja' }]);
  await q.idle;
  assert.deepEqual(calls, [{ phash: true, keep: true }, { phash: false, keep: true }]);
  assert.deepEqual(saved, [{ id: 'a:1', phash: 'h', blob: 'b' }, { id: 'a:2', blob: 'b' }]);
  assert.equal(q.stats().kept, 2);
  assert.equal(q.stats().done, 1);
});

test('respeita a concorrência, grava em lotes e conta URLs expiradas', async () => {
  let active = 0, peak = 0;
  const saves = [];
  const q = new ThumbQueue({
    concurrency: 3, batch: 4,
    work: async (u) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (u.includes('/x9/')) { const e = new Error('410'); e.status = 410; throw e; }
      return { phash: 'h' };
    },
    save: async (b) => { saves.push(b.length); },
  });
  const ids = Array.from({ length: 10 }, (_, i) => `a:${i}`);
  q.setWanted(ids);
  q.offer(ids.map((id, i) => ({ id, thumb: `https://c/x${i}/${F}` })));
  await q.idle;
  assert.equal(peak, 3);
  assert.equal(q.done, 9);
  assert.equal(q.expired, 1);
  assert.equal(saves.reduce((s, n) => s + n, 0), 9);
});

test('thumbUrl troca o marcador do nome do arquivo', () => {
  assert.equal(thumbUrl(`https://cvws.icloud-content.com/B/abc/${F}?o=1`), 'https://cvws.icloud-content.com/B/abc/thumb.jpg?o=1');
});
