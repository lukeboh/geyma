// Fotos editadas no iCloud: a versão atual vem do registro da foto (CPLAsset),
// o original do registro do arquivo (CPLMaster). Formato conferido no site em 17/11.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcloudQuery } from '../extension/src/core/normalize.js';
import { linkAtual, linkOriginal, icloudGrande, icloudOriginal, temOriginal, ICLOUD_URL_VALIDA_MS } from '../extension/src/core/viewer-src.js';
import { matchLibraries, relacaoDims, distImagem } from '../extension/src/core/match.js';
import { ThumbQueue } from '../extension/src/core/thumb-queue.js';

const F = '${f}';
const url = (k) => ({ value: { downloadURL: `https://cvws.icloud-content.com/B/${k}/${F}?o=1` } });
const master = { recordName: 'M1', recordType: 'CPLMaster', fields: { itemType: { value: 'public.heic' }, resOriginalWidth: { value: 4032 }, resOriginalHeight: { value: 3024 }, resJPEGThumbRes: url('mt'), resJPEGMedRes: url('mm') } };
const asset = { recordName: 'A1', recordType: 'CPLAsset', fields: { assetDate: { value: 1700000000123 }, masterRef: { value: { recordName: 'M1' } }, adjustmentRenderType: { value: 1 } } };
const editado = { ...asset, fields: { ...asset.fields, resJPEGThumbRes: url('at'), resJPEGMedRes: url('am'), resJPEGFullRes: url('af'), resJPEGFullWidth: { value: 3000 }, resJPEGFullHeight: { value: 2250 } } };

test('editada: miniatura e média da versão atual, original guardado à parte', () => {
  const [it] = parseIcloudQuery({ records: [master, editado] });
  assert.equal(it.thumb, `https://cvws.icloud-content.com/B/at/${F}?o=1`);
  assert.equal(it.med, `https://cvws.icloud-content.com/B/am/${F}?o=1`);
  assert.equal(it.full, `https://cvws.icloud-content.com/B/af/${F}?o=1`);
  assert.equal(it.thumbOrig, `https://cvws.icloud-content.com/B/mt/${F}?o=1`);
  assert.equal(it.medOrig, `https://cvws.icloud-content.com/B/mm/${F}?o=1`);
  assert.deepEqual([it.editW, it.editH], [3000, 2250]);
  assert.equal(it.edited, true);
  assert.ok(temOriginal(it));
});

test('sem edição: tudo do master, sem original à parte', () => {
  const [it] = parseIcloudQuery({ records: [master, { ...asset, fields: { ...asset.fields, adjustmentRenderType: { value: 0 } } }] });
  assert.equal(it.thumb, `https://cvws.icloud-content.com/B/mt/${F}?o=1`);
  assert.equal(it.med, `https://cvws.icloud-content.com/B/mm/${F}?o=1`);
  assert.equal(it.full, null);
  assert.equal(it.thumbOrig, null);
  assert.equal(it.editW, null);
  assert.ok(!temOriginal(it));
});

test('editada sem média própria: média do original, mas miniatura atual', () => {
  const semMed = { ...editado, fields: { ...editado.fields, resJPEGMedRes: undefined } };
  const [it] = parseIcloudQuery({ records: [master, semMed] });
  assert.equal(it.med, `https://cvws.icloud-content.com/B/mm/${F}?o=1`);
  assert.equal(it.thumb, `https://cvws.icloud-content.com/B/at/${F}?o=1`);
  assert.equal(linkAtual(it), `https://cvws.icloud-content.com/B/af/full.jpg?o=1`);
});

test('visualizador: versão cheia no notebook, média no celular, original da editada', () => {
  const [it] = parseIcloudQuery({ records: [master, editado] });
  assert.equal(linkAtual(it), 'https://cvws.icloud-content.com/B/af/full.jpg?o=1');
  assert.equal(linkAtual(it, { cheia: false }), 'https://cvws.icloud-content.com/B/am/med.jpg?o=1');
  assert.equal(linkOriginal(it), 'https://cvws.icloud-content.com/B/mm/med.jpg?o=1');
  assert.equal(linkOriginal({ thumbOrig: `https://x/${F}` }), 'https://x/thumb.jpg');
  assert.equal(linkOriginal({}), null);
  assert.equal(linkAtual({ full: `https://x/${F}` }, { cheia: false }), 'https://x/full.jpg');
  const agora = it.thumbAt;
  assert.equal(icloudOriginal(it, agora), 'https://cvws.icloud-content.com/B/mm/med.jpg?o=1');
  assert.equal(icloudGrande(it, agora + ICLOUD_URL_VALIDA_MS + 1), null);
  assert.equal(icloudOriginal(it, agora + ICLOUD_URL_VALIDA_MS + 1), null);
});

test('dimensões: a versão cortada também casa com o Google', () => {
  const a = { w: 4032, h: 3024, editW: 3000, editH: 3000 };
  assert.deepEqual(relacaoDims(a, { w: 3000, h: 3000 }), { rel: 'igual', dimsA: { w: 3000, h: 3000 } });
  assert.deepEqual(relacaoDims(a, { w: 1500, h: 1500 }), { rel: 'reduzida', dimsA: { w: 3000, h: 3000 } });
  assert.deepEqual(relacaoDims(a, { w: 4032, h: 3024 }), { rel: 'igual', dimsA: { w: 4032, h: 3024 } });
  assert.deepEqual(relacaoDims({ w: 10, h: 10 }, { w: 5, h: 7 }), { rel: null, dimsA: { w: 10, h: 10 } });
});

test('cruzamento: foto cortada no iPhone e guardada cortada no Google vira par', () => {
  const a = { id: 'a:1', ts: 1700000000123, w: 4032, h: 3024, editW: 3000, editH: 3000 };
  const g = { id: 'g:1', ts: 1700000000000, w: 3000, h: 3000 };
  const r = matchLibraries([g], [a]);
  assert.equal(r.pairs.length, 1);
  assert.equal(r.pairs[0].cls, 'ambos');
  const reduz = matchLibraries([{ ...g, w: 1000, h: 1000 }], [a]);
  assert.equal(reduz.pairs[0].cls, 'reduzida');
  assert.equal(reduz.pairs[0].menor, 'google');
});

test('pHash: vale a menor distância entre a versão atual e o original', () => {
  const g = { phash: '0000000000000000' };
  assert.equal(distImagem({ phash: 'ffffffffffffffff', phashOrig: '0000000000000001' }, g), 1);
  assert.equal(distImagem({ phash: '0000000000000003' }, g), 2);
  assert.equal(distImagem({ phashOrig: '0000000000000000' }, g), 0);
  assert.equal(distImagem({}, g), null);
  // Google guardou o original; a atual (editada) é outra imagem: continua confirmado
  const a = { id: 'a:1', ts: 1700000000123, w: 4032, h: 3024, phash: 'ffffffffffffffff', phashOrig: '0000000000000000' };
  const r = matchLibraries([{ id: 'g:1', ts: 1700000000000, w: 4032, h: 3024, phash: '0000000000000000' }], [a]);
  assert.equal(r.pairs[0].confirmadoPorImagem, true);
});

test('fila: editada baixa as duas versões para a impressão digital e troca a miniatura antiga', async () => {
  const calls = [];
  const saved = [];
  const q = new ThumbQueue({
    work: async (u, need, orig) => { calls.push([u, orig, need]); return { phash: 'h', ...(orig ? { phashOrig: 'o' } : {}), ...(need.keep ? { blob: 'b' } : {}) }; },
    save: async (b) => { saved.push(...b); },
  });
  q.setWanted(['a:1'], [], ['a:1', 'a:2', 'a:3']);
  q.offer([
    { id: 'a:1', thumb: `https://x/1a/${F}`, thumbOrig: `https://x/1m/${F}` },
    { id: 'a:2', thumb: `https://x/2a/${F}`, thumbOrig: `https://x/2m/${F}` },
    // sem edição: a miniatura guardada já é a certa
    { id: 'a:3', thumb: `https://x/3/${F}` },
  ]);
  await q.idle;
  assert.deepEqual(calls, [
    ['https://x/1a/thumb.jpg', 'https://x/1m/thumb.jpg', { phash: true, keep: true }],
    ['https://x/2a/thumb.jpg', 'https://x/2m/thumb.jpg', { phash: false, keep: true }],
  ]);
  assert.deepEqual(saved[0], { id: 'a:1', editada: true, phash: 'h', phashOrig: 'o', blob: 'b' });
});

test('localização: só a presença, nunca o conteúdo', () => {
  const comLocal = { ...asset, fields: { ...asset.fields, locationEnc: { value: 'QUJD' } } };
  const [it] = parseIcloudQuery({ records: [master, comLocal] });
  assert.equal(it.local, true);
  assert.ok(!JSON.stringify(it).includes('QUJD'));
  const [sem] = parseIcloudQuery({ records: [master, asset] });
  assert.equal(sem.local, false);
});
