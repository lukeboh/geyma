import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ThumbQueue, thumbUrl } from '../extension/src/core/thumb-queue.js';

test('só baixa os itens desejados, com miniatura, sem pHash e uma vez cada', async () => {
  const urls = [];
  const saved = [];
  const q = new ThumbQueue({ concurrency: 2, batch: 2, hash: async (u) => { urls.push(u); return 'h' + u.length; }, save: async (b) => { saved.push(...b); } });
  q.setWanted(['a:1', 'a:2', 'a:3']);
  q.offer([
    { id: 'a:1', thumb: 'https://x/1/${f}' },
    { id: 'a:2', thumb: 'https://x/2/${f}', phash: 'ja' },
    { id: 'a:3', thumb: null },
    { id: 'a:4', thumb: 'https://x/4/${f}' },
  ]);
  q.offer([{ id: 'a:1', thumb: 'https://x/1/${f}' }]);
  await q.idle;
  assert.deepEqual(urls, ['https://x/1/thumb.jpg']);
  assert.deepEqual(saved.map((s) => s.id), ['a:1']);
  assert.deepEqual(q.stats(), { done: 1, failed: 0, expired: 0, queued: 0 });
});

test('respeita a concorrência, grava em lotes e conta URLs expiradas', async () => {
  let active = 0, peak = 0;
  const saves = [];
  const q = new ThumbQueue({
    concurrency: 3, batch: 4,
    hash: async (u) => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      if (u.includes('/x9/')) { const e = new Error('410'); e.status = 410; throw e; }
      return 'h';
    },
    save: async (b) => { saves.push(b.length); },
  });
  const ids = Array.from({ length: 10 }, (_, i) => `a:${i}`);
  q.setWanted(ids);
  q.offer(ids.map((id, i) => ({ id, thumb: `https://c/x${i}/\${f}` })));
  await q.idle;
  assert.equal(peak, 3);
  assert.equal(q.done, 9);
  assert.equal(q.expired, 1);
  assert.equal(saves.reduce((s, n) => s + n, 0), 9);
  assert.ok(saves.every((n) => n <= 4 + 3));
});

test('thumbUrl troca o marcador do nome do arquivo', () => {
  assert.equal(thumbUrl('https://cvws.icloud-content.com/B/abc/${f}?o=1'), 'https://cvws.icloud-content.com/B/abc/thumb.jpg?o=1');
});
