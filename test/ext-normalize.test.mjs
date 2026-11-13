import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEnc,
  parseGoogleBatchText,
  parseIcloudQuery,
  parseIcloudCounts,
  summarize,
} from '../extension/src/core/normalize.js';

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// Resposta sintética no formato do batchexecute do Google Fotos.
function googleBatch(items, cursor) {
  const payload = JSON.stringify([items, cursor, 'x']);
  const line = JSON.stringify([['wrb.fr', 'lcxiM', payload, null, null, null, 'generic']]);
  return `)]}'\n\n${line.length}\n${line}\n57\n[["di",120],["af.httprm",119,"0",1]]\n`;
}
const SHA = 'a'.repeat(27);
const gItem = (key, ts, w, h, extra = {}) => [
  key,
  ['https://photos.fife.usercontent.google.com/pw/x', w, h, null, null, null, null, null, [3], [1]],
  ts,
  extra.sha ?? SHA,
  extra.tz ?? -10800000,
  ts + 1000,
  null,
  [],
  2,
  { 15: 1 },
];

test('parseGoogleBatchText extrai itens normalizados e o cursor', () => {
  const text = googleBatch([gItem('AF1QipA', 1700000000000, 4032, 3024), gItem('AF1QipB', 1700000005000, 1080, 1920)], 'CURSOR123');
  const { items, cursor } = parseGoogleBatchText(text);
  assert.equal(cursor, 'CURSOR123');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { id: 'g:AF1QipA', source: 'google', ts: 1700000000000, tzOffset: -10800000, w: 4032, h: 3024, sha1: SHA });
});

test('parseGoogleBatchText sem cursor e sem linha de dados', () => {
  assert.equal(parseGoogleBatchText(googleBatch([gItem('AF1QipC', 1, 10, 10)], null)).cursor, null);
  assert.deepEqual(parseGoogleBatchText(')]}\'\n\n12\n[["di",1]]'), { items: [], cursor: null });
});

test('sha1 do Google só é aceito com 27 caracteres', () => {
  const { items } = parseGoogleBatchText(googleBatch([gItem('AF1QipD', 1, 10, 10, { sha: 'curto' })], null));
  assert.equal(items[0].sha1, null);
});

// Resposta sintética de CPLAssetAndMaster... do iCloud.
function icloudResponse() {
  const master = (name, extra) => ({
    recordName: name,
    recordType: 'CPLMaster',
    fields: {
      itemType: { value: extra.type },
      resOriginalWidth: { value: extra.w },
      resOriginalHeight: { value: extra.h },
      resOriginalFileSize: { value: extra.size },
      resOriginalFingerprint: { value: 'FP' + name },
      filenameEnc: { value: b64(extra.name) },
    },
  });
  const asset = (name, masterName, ts, extra = {}) => ({
    recordName: name,
    recordType: 'CPLAsset',
    fields: {
      masterRef: { value: { recordName: masterName } },
      assetDate: { value: ts },
      timeZoneOffset: { value: -10800 },
      adjustmentRenderType: { value: extra.edited ? 4 : 0 },
      assetSubtypeV2: { value: extra.subtype ?? 0 },
      burstFlags: { value: 0 },
      isFavorite: { value: extra.fav ? 1 : 0 },
    },
  });
  return {
    records: [
      master('M1', { type: 'public.heic', w: 4032, h: 3024, size: 2500000, name: 'IMG_0001.HEIC' }),
      asset('A1', 'M1', 1700000000000, { edited: true, fav: true }),
      master('M2', { type: 'com.apple.quicktime-movie', w: 1920, h: 1080, size: 50000000, name: 'IMG_0002.MOV' }),
      asset('A2', 'M2', 1700000100000),
      asset('A3', 'M-ausente', 1700000200000),
    ],
  };
}

test('parseIcloudQuery junta asset e master e ignora asset sem master', () => {
  const items = parseIcloudQuery(icloudResponse());
  assert.equal(items.length, 2);
  const [photo, video] = items;
  assert.equal(photo.id, 'a:A1');
  assert.equal(photo.filename, 'IMG_0001.HEIC');
  assert.equal(photo.w, 4032);
  assert.equal(photo.tzOffset, -10800000);
  assert.equal(photo.edited, true);
  assert.equal(photo.favorite, true);
  assert.equal(photo.video, false);
  assert.equal(video.video, true);
  assert.equal(video.size, 50000000);
});

test('decodeEnc aceita texto e recusa binário', () => {
  assert.equal(decodeEnc(b64('Foto de família.jpg')), 'Foto de família.jpg');
  assert.equal(decodeEnc(Buffer.from([0xff, 0x00, 0x13]).toString('base64')), null);
  assert.equal(decodeEnc(''), null);
  assert.equal(decodeEnc(undefined), null);
});

test('parseIcloudCounts associa índices e totais', () => {
  const request = JSON.stringify({
    query: {
      recordType: 'HyperionIndexCountLookup',
      filterBy: [{ fieldName: 'indexCountID', fieldValue: { value: ['CPLAssetInSmartAlbumByAssetDate:Video', 'CPLAssetInSmartAlbumByAssetDate:Screenshot'] } }],
    },
  });
  const json = { records: [{ fields: { itemCount: { value: 10 } } }, { fields: { itemCount: { value: 3 } } }] };
  assert.deepEqual(parseIcloudCounts(request, json), [['Video', 10], ['Screenshot', 3]]);
  assert.deepEqual(parseIcloudCounts('não é json', json), []);
});

test('summarize conta por ano e vídeos', () => {
  const s = summarize([
    { ts: Date.UTC(2023, 0, 1), video: false },
    { ts: Date.UTC(2023, 5, 1), video: true },
    { ts: Date.UTC(2024, 0, 1), video: false },
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.videos, 1);
  assert.deepEqual(s.byYear, { 2023: 2, 2024: 1 });
  assert.equal(s.from, Date.UTC(2023, 0, 1));
  assert.deepEqual(summarize([]), { total: 0, videos: 0, from: null, to: null, byYear: {} });
});
