// Pasta local (0.10): leitura do EXIF/mvhd e cruzamento com os dois serviços.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exifJpeg, posicaoExifHeic, exifDoItemHeic, mvhd, normalizarLocal, cruzarLocal, resumoLocal, ehMidia, pastaIgnorada, csvLocal } from '../extension/src/core/local.js';

// ---------- montagem de arquivos sintéticos ----------

/** TIFF big-endian com DateTimeOriginal, SubSec, OffsetTimeOriginal e dimensões no IFD do EXIF. */
function tiff({ data = '2024:03:10 14:22:05', sub = '123', fuso = '-03:00', w = 4032, h = 3024 } = {}) {
  const entradas = [];
  const extra = [];
  const base = 8 + 2 + 12 + 4; // cabeçalho + IFD0 (1 entrada)
  const nExif = 5;
  let livre = base + 2 + nExif * 12 + 4;
  const asc = (tag, s) => {
    const bytes = [...Buffer.from(`${s}\0`, 'latin1')];
    if (bytes.length <= 4) { entradas.push([tag, 2, bytes.length, [...bytes, 0, 0, 0, 0].slice(0, 4)]); return; }
    entradas.push([tag, 2, bytes.length, u32(livre)]);
    extra.push(...bytes);
    livre += bytes.length;
  };
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  asc(0x9003, data);
  asc(0x9011, fuso);
  asc(0x9291, sub);
  entradas.push([0xa002, 4, 1, u32(w)]);
  entradas.push([0xa003, 4, 1, u32(h)]);
  const out = [0x4d, 0x4d, 0, 42, ...u32(8), 0, 1, 0x87, 0x69, 0, 4, ...u32(1), ...u32(base), ...u32(0), 0, nExif];
  for (const [tag, tipo, n, v] of entradas) out.push(tag >> 8, tag & 255, 0, tipo, ...u32(n), ...v);
  out.push(...u32(0), ...extra);
  return Uint8Array.from(out);
}

function jpeg(t, sof = { w: 4032, h: 3024 }) {
  const app1 = [...Buffer.from('Exif\0\0', 'latin1'), ...t];
  const len = app1.length + 2;
  const sofSeg = [0xff, 0xc0, 0, 17, 8, sof.h >> 8, sof.h & 255, sof.w >> 8, sof.w & 255, 3, ...new Array(9).fill(0)];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 255, ...app1, ...sofSeg, 0xff, 0xda, 0, 2]);
}

const box = (tipo, corpo) => {
  const n = 8 + corpo.length;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...Buffer.from(tipo, 'latin1'), ...corpo];
};
const u16 = (n) => [(n >> 8) & 255, n & 255];
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** HEIC mínimo: ftyp, meta (iinf com hvc1 e Exif, iloc) e o item Exif em mdat. */
function heic(t) {
  const exif = [...u32(6), ...Buffer.from('Exif\0\0', 'latin1'), ...t];
  const infe = (id, tipo) => box('infe', [2, 0, 0, 0, ...u16(id), 0, 0, ...Buffer.from(tipo, 'latin1'), 0]);
  const iinf = box('iinf', [0, 0, 0, 0, ...u16(2), ...infe(1, 'hvc1'), ...infe(2, 'Exif')]);
  const montar = (offExif) => {
    const iloc = box('iloc', [0, 0, 0, 0, 0x44, 0x00, ...u16(2),
      ...u16(1), ...u16(0), ...u16(1), ...u32(0), ...u32(10),
      ...u16(2), ...u16(0), ...u16(1), ...u32(offExif), ...u32(exif.length)]);
    const meta = box('meta', [0, 0, 0, 0, ...iinf, ...iloc]);
    const ftyp = box('ftyp', [...Buffer.from('heic', 'latin1'), 0, 0, 0, 0, ...Buffer.from('mif1heic', 'latin1')]);
    return [...ftyp, ...meta];
  };
  const cab = montar(0);
  const off = cab.length + 8;
  return { bytes: Uint8Array.from([...montar(off), ...box('mdat', exif)]), off, len: exif.length };
}

// ---------- leitura ----------

test('EXIF de JPEG: hora local, subsegundos, fuso e dimensões', () => {
  const e = exifJpeg(jpeg(tiff()));
  assert.equal(e.wall, Date.UTC(2024, 2, 10, 14, 22, 5, 123));
  assert.equal(e.tzOffset, -3 * 3600000);
  assert.deepEqual([e.w, e.h], [4032, 3024]);
});

test('JPEG sem EXIF: dimensões do quadro', () => {
  const sem = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 100, 0, 200, 3, ...new Array(9).fill(0), 0xff, 0xda]);
  const e = exifJpeg(sem);
  assert.equal(e.wall, null);
  assert.deepEqual([e.w, e.h], [200, 100]);
  assert.equal(exifJpeg(Uint8Array.from([1, 2, 3, 4])), null);
});

test('HEIC: acha o item Exif pela caixa meta e lê a data', () => {
  const h = heic(tiff({ data: '2023:12:31 23:59:58', sub: '5', fuso: '+01:00' }));
  const pos = posicaoExifHeic(h.bytes);
  assert.deepEqual(pos, { inicio: h.off, tamanho: h.len });
  const e = exifDoItemHeic(h.bytes.subarray(pos.inicio, pos.inicio + pos.tamanho));
  assert.equal(e.wall, Date.UTC(2023, 11, 31, 23, 59, 58, 500));
  assert.equal(e.tzOffset, 3600000);
});

test('MOV/MP4: instante (desde 1904) e duração pelo mvhd', () => {
  const seg = (Date.UTC(2022, 5, 1, 12, 0, 0) - Date.UTC(1904, 0, 1)) / 1000;
  const corpo = [0, 0, 0, 0, ...u32(seg), ...u32(seg), ...u32(600), ...u32(600 * 12), ...new Array(80).fill(0)];
  const moov = Uint8Array.from(box('moov', box('mvhd', corpo)));
  const m = mvhd(moov.buffer);
  assert.equal(m.ts, Date.UTC(2022, 5, 1, 12, 0, 0));
  assert.equal(m.durMs, 12000);
});

test('arquivos e pastas que entram no inventário', () => {
  assert.ok(ehMidia('IMG_0001.HEIC'));
  assert.ok(ehMidia('video.mov'));
  assert.ok(!ehMidia('notas.txt'));
  assert.ok(!ehMidia('._IMG_0001.JPG'));
  assert.ok(pastaIgnorada('@eaDir'));
  assert.ok(pastaIgnorada('#recycle'));
  assert.ok(!pastaIgnorada('2024'));
});

// ---------- cruzamento ----------

const T = Date.UTC(2024, 2, 10, 17, 22, 5, 123); // instante (UTC) da foto de 14:22:05 em -03:00
const F = -3 * 3600000;
const arq = (path, size = 2_000_000) => ({ path, name: path.split('/').pop(), size, lastModified: Date.UTC(2025, 0, 1) });

test('normaliza: com fuso dá o instante; sem fuso, só a hora local; sem EXIF, a data do arquivo', () => {
  const com = normalizarLocal(arq('a/IMG_1.JPG'), { wall: T + F, tzOffset: F, w: 4032, h: 3024 });
  assert.equal(com.ts, T);
  assert.equal(com.tsFonte, 'exif');
  const sem = normalizarLocal(arq('a/IMG_2.JPG'), { wall: T + F, tzOffset: null, w: 4032, h: 3024 });
  assert.equal(sem.tsFonte, 'exif-local');
  const nada = normalizarLocal(arq('a/print.png'), null);
  assert.equal(nada.tsFonte, 'arquivo');
  const vid = normalizarLocal(arq('a/clip.mov'), { ts: T, durMs: 3000 });
  assert.equal(vid.video, true);
  assert.equal(vid.durMs, 3000);
  const r = resumoLocal([com, sem, nada, vid]);
  assert.equal(r.semData, 1);
  assert.equal(r.videos, 1);
});

test('cruza a pasta com o Google e o iCloud', () => {
  const g = [
    { id: 'g:1', source: 'google', ts: T - 123, tzOffset: F, w: 4032, h: 3024 }, // Google sem milissegundos
    { id: 'g:2', source: 'google', ts: T + 3600000, tzOffset: F, w: 3024, h: 4032 },
    { id: 'g:9', source: 'google', ts: T + 7200000, tzOffset: F, w: 100, h: 100 },
  ];
  const a = [
    { id: 'a:1', source: 'icloud', ts: T, tzOffset: F, w: 4032, h: 3024, filename: 'IMG_1.HEIC', size: 2_500_000 },
    { id: 'a:3', source: 'icloud', ts: T + 999999, tzOffset: F, w: 10, h: 10, filename: 'IMG_3.HEIC', size: 1_234_567 },
  ];
  const local = [
    normalizarLocal(arq('2024/IMG_1.HEIC', 2_500_000), { wall: T + F, tzOffset: F, w: 4032, h: 3024 }), // nos dois
    normalizarLocal(arq('2024/IMG_2.JPG'), { wall: T + F + 3600000, tzOffset: null, w: 4032, h: 3024 }), // girada, sem fuso: só Google
    normalizarLocal(arq('2024/IMG_3.HEIC', 1_234_567), null), // sem EXIF, mas nome e tamanho do iCloud
    normalizarLocal(arq('2024/IMG_4.JPG'), { wall: T + F + 5000, tzOffset: F, w: 4032, h: 3024 }), // em nenhum
    normalizarLocal(arq('2024/print.png'), null), // sem data
    normalizarLocal(arq('2024/IMG_5.JPG'), { wall: T + F + 7200000, tzOffset: F, w: 4032, h: 3024 }), // mesmo segundo, dimensões incompatíveis
  ];
  const { linhas, resumo } = cruzarLocal(local, g, a);
  assert.deepEqual(linhas.map((x) => x.cls), ['tres', 'soGoogle', 'soIcloud', 'soPasta', 'semData', 'soPasta']);
  assert.equal(linhas[0].provaA, 'arquivo');
  assert.equal(linhas[0].provaG, 'instante');
  assert.equal(linhas[2].a.id, 'a:3');
  assert.equal(resumo.tres, 1);
  assert.equal(resumo.soPasta, 2);
  assert.equal(resumo.semData, 1);
  assert.equal(resumo.porArquivo, 2);
  // no período da pasta: g:9 ficou sem cópia na pasta; os dois do iCloud foram achados
  assert.equal(resumo.googleSemCopia, 1);
  assert.equal(resumo.icloudSemCopia, 0);
});

test('vídeo não casa com foto no mesmo segundo', () => {
  const g = [{ id: 'g:1', source: 'google', ts: T, extrasLidos: true, w: 1920, h: 1080 }];
  const local = [normalizarLocal(arq('v/clip.mov'), { ts: T, durMs: 3000 })];
  assert.equal(cruzarLocal(local, g, []).linhas[0].cls, 'soPasta');
});

test('CSV com separador ; e aspas quando preciso', () => {
  const l = normalizarLocal(arq('pasta; com/IMG_1.JPG'), { wall: T + F, tzOffset: F, w: 1, h: 1 });
  const csv = csvLocal([{ l, g: null, a: null, provaG: null, provaA: null, cls: 'soPasta' }]);
  assert.match(csv, /^caminho;situacao/);
  assert.match(csv, /"pasta; com\/IMG_1\.JPG";Só na pasta/);
});
