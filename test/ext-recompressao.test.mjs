// Recompressão (0.5): pelo tamanho do arquivo do Google e, por amostragem,
// pelas tabelas de quantização comparadas com o original do iCloud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cabecalhoJpeg, compararCodificacao } from '../extension/src/core/jpeg.js';
import { copiaNoGoogle, LIMIAR_RECOMPRESSAO } from '../extension/src/core/google-file.js';
import { melhorCopia } from '../extension/src/core/qualidade.js';
import { googleFileNeeded, summarizeMatch } from '../extension/src/core/match.js';

// JPEG mínimo: SOI, APP1 opcional, DQT (2 tabelas), SOF0, SOS
const seg = (m, corpo) => [0xFF, m, (corpo.length + 2) >> 8, (corpo.length + 2) & 255, ...corpo];
function jpeg({ q0 = 2, q1 = 3, w = 4032, h = 3024, exif = 0 } = {}) {
  const tabela = (id, v) => [id, ...Array.from({ length: 64 }, (_, k) => v + (k % 7))];
  return Uint8Array.from([
    0xFF, 0xD8,
    ...(exif ? seg(0xE1, Array.from({ length: exif }, () => 0x45)) : []),
    ...seg(0xDB, [...tabela(0, q0), ...tabela(1, q1)]),
    ...seg(0xC0, [8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]),
    ...seg(0xDA, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]),
    0x12, 0x34,
  ]);
}

test('lê as tabelas de quantização (ordem natural) e o quadro', () => {
  const c = cabecalhoJpeg(jpeg({ exif: 300 }));
  assert.equal(c.tabelas.length, 2);
  assert.deepEqual(c.quadro, { bits: 8, h: 3024, w: 4032, componentes: 3 });
  // zigue-zague: a posição 1 do arquivo vai para a coluna 1, a 2 para a linha 1
  assert.equal(c.tabelas[0].v[0], 2);
  assert.equal(c.tabelas[0].v[1], 3);
  assert.equal(c.tabelas[0].v[8], 4);
  assert.equal(cabecalhoJpeg(Uint8Array.from([0x00, 0x01])), null);
  // começo cortado antes da imagem: não dá para dizer
  assert.equal(cabecalhoJpeg(jpeg().subarray(0, 60)), null);
});

test('mesma codificação com metadados diferentes; outras tabelas = recomprimida', () => {
  assert.equal(compararCodificacao(jpeg({ exif: 500 }), jpeg({ exif: 20 })), 'mesma');
  assert.equal(compararCodificacao(jpeg(), jpeg({ q0: 4 })), 'recomprimida');
  assert.equal(compararCodificacao(jpeg(), jpeg({ w: 2048, h: 1536 })), 'recomprimida');
  assert.equal(compararCodificacao(jpeg(), new Uint8Array(10)), null);
});

const A = (o) => ({ fileType: 'public.jpeg', w: 4032, h: 3024, size: 2_000_000, ...o });
const G = (bytes, o) => ({ w: 4032, h: 3024, file: { formato: 'JPEG', bytes }, ...o });

test('pelo tamanho: abaixo de 90% do original no mesmo formato e dimensões', () => {
  assert.equal(LIMIAR_RECOMPRESSAO, 0.9);
  assert.equal(copiaNoGoogle(A(), G(1_999_980)), 'original'); // só metadados
  assert.equal(copiaNoGoogle(A(), G(1_200_000)), 'recomprimida');
  assert.equal(copiaNoGoogle(A(), G(1_200_000, { w: 3024, h: 4032 })), 'recomprimida'); // girada
  // Google maior: não é perda do Google
  assert.equal(copiaNoGoogle(A(), G(3_000_000)), 'original');
  // outras dimensões: é a cópia reduzida, já contada à parte
  assert.equal(copiaNoGoogle(A(), G(500_000, { w: 2048, h: 1536 })), 'original');
  // editada: o Google pode ter a versão editada
  assert.equal(copiaNoGoogle(A({ edited: true }), G(1_200_000)), 'original');
  // HEIC × HEIF também
  assert.equal(copiaNoGoogle(A({ fileType: 'public.heic' }), G(1_000_000, { file: { formato: 'HEIF', bytes: 1_000_000 } })), 'recomprimida');
  // outro formato continua "convertida"
  assert.equal(copiaNoGoogle(A({ fileType: 'public.heic' }), G(1_000_000)), 'convertida');
});

test('a prova pelos originais vale mais que o tamanho', () => {
  assert.equal(copiaNoGoogle(A(), G(1_200_000, { file: { formato: 'JPEG', bytes: 1_200_000, codificacao: 'mesma' } })), 'original');
  assert.equal(copiaNoGoogle(A(), G(1_990_000, { file: { formato: 'JPEG', bytes: 1_990_000, codificacao: 'recomprimida' } })), 'recomprimida');
});

test('melhor cópia no iCloud quando o Google recomprimiu', () => {
  const m = melhorCopia({ cls: 'ambos', copiaGoogle: 'recomprimida', a: { live: false }, g: {} });
  assert.deepEqual(m, { lado: 'icloud', icloud: ['googleRecomprimida'], google: [] });
});

test('ficha do Google pedida para todos os pares de fotos, os da identidade primeiro', () => {
  const p = (id, o = {}) => ({ cls: 'ambos', a: { subtype: 0 }, g: { id, thumb: `u${id}` }, ...o });
  const lista = googleFileNeeded([p('g:1'), p('g:2', { cls: 'confirmar' }), p('g:3', { g: { id: 'g:3', thumb: 'u', file: {} } }), p('g:4', { a: { video: true } })]);
  assert.deepEqual(lista.map((x) => x.id), ['g:2', 'g:1']);
});

test('resumo conta as recomprimidas', () => {
  const par = { cls: 'ambos', a: A({ ts: 0 }), g: G(1_000_000) };
  assert.equal(summarizeMatch({ pairs: [par], soGoogle: [], soIcloud: [] }).copia.recomprimida, 1);
});
