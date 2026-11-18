// Quadros amostrados: leitura do MP4, escolha dos trechos, comparação e cruzamento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caixas, lerMoov, faixaDeVideo, fimDaFaixa, trechoAte, quadrosEspalhados, compararQuadros } from '../extension/src/core/mp4.js';
import { hamming } from '../extension/src/core/phash.js';
import { matchLibraries, estadoIdentidade } from '../extension/src/core/match.js';
import { quadrosNeeded } from '../extension/src/core/video.js';
import { placarIdentidade } from '../extension/src/core/placar.js';

// ---------- MP4 sintético ----------
const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n) => [(n >> 8) & 255, n & 255];
const txt = (s) => [...s].map((c) => c.charCodeAt(0));
const box = (t, ...partes) => { const corpo = partes.flat(); return [...u32(8 + corpo.length), ...txt(t), ...corpo]; };
const full = (t, ...partes) => box(t, [0, 0, 0, 0], ...partes);

/** Vídeo de 10 amostras (3 por pedaço), quadro-chave a cada 4, 30 qps, girado 90°, com ctts. */
function mp4(mdatAntes = true) {
  const n = 10;
  const tamanhos = Array.from({ length: n }, (_, i) => 100 + i);
  const avcC = [1, 0x64, 0x00, 0x1f, 0xff, 0xe1, 0, 0];
  const avc1 = box('avc1', new Array(6).fill(0), u16(1), new Array(16).fill(0), u16(848), u16(480), new Array(50).fill(0), box('avcC', avcC));
  const stsd = full('stsd', u32(1), avc1);
  const stts = full('stts', u32(1), u32(n), u32(1000));
  const ctts = full('ctts', u32(1), u32(n), u32(2000));
  const stss = full('stss', u32(3), u32(1), u32(5), u32(9));
  const stsz = full('stsz', u32(0), u32(n), ...tamanhos.map(u32));
  const stsc = full('stsc', u32(1), u32(1), u32(3), u32(1));
  const chunks = 4;
  // matriz de rotação de 90°: a=0, b=1, c=-1, d=0
  const matriz = [...u32(0), ...u32(0x10000), ...u32(0), ...u32(0xffff0000), ...u32(0), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];
  const tkhd = full('tkhd', new Array(36).fill(0), matriz, u32(848 << 16), u32(480 << 16));
  const hdlr = full('hdlr', u32(0), txt('vide'), new Array(12).fill(0), [0]);
  const mdhd = full('mdhd', u32(0), u32(0), u32(30000), u32(n * 1000), u16(0), u16(0));
  const montar = (base) => {
    let o = base;
    const offs = [];
    for (let c = 0; c < chunks; c++) { offs.push(o); for (let k = 0; k < 3 && c * 3 + k < n; k++) o += tamanhos[c * 3 + k]; }
    const stco = full('stco', u32(chunks), ...offs.map(u32));
    const stbl = box('stbl', stsd, stts, ctts, stss, stsz, stsc, stco);
    return box('moov', box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', stbl))));
  };
  const dados = tamanhos.reduce((s, t) => s + t, 0);
  const ftyp = box('ftyp', txt('isom'), u32(0));
  if (mdatAntes) {
    const base = ftyp.length + 8;
    const mdat = box('mdat', new Array(dados).fill(7));
    return new Uint8Array([...ftyp, ...mdat, ...montar(base)]).buffer;
  }
  const moov0 = montar(0);
  const base = ftyp.length + moov0.length + 8;
  return new Uint8Array([...ftyp, ...montar(base), ...box('mdat', new Array(dados).fill(7))]).buffer;
}
const leitor = (buf) => { let pedidos = 0; return { ler: async (a, b) => { pedidos++; return buf.slice(a, b); }, pedidos: () => pedidos }; };

test('acha o moov no fim e no começo, lendo só cabeçalhos', async () => {
  for (const antes of [true, false]) {
    const buf = mp4(antes);
    const l = leitor(buf);
    const moov = await lerMoov(l.ler, buf.byteLength);
    assert.equal(caixas(moov)[0].tipo, 'moov');
    assert.ok(l.pedidos() <= 4);
  }
});

test('faixa de vídeo: codec, rotação, amostras, tempos e quadros-chave', async () => {
  const buf = mp4(true);
  const f = faixaDeVideo(await lerMoov(leitor(buf).ler, buf.byteLength));
  assert.equal(f.codec, 'avc1.64001f');
  assert.equal(f.largura, 848);
  assert.equal(f.altura, 480);
  assert.equal(f.rotacao, 90);
  assert.equal(f.escala, 30000);
  assert.equal(f.amostras.length, 10);
  assert.deepEqual(f.chave, [0, 4, 8]);
  assert.equal(f.amostras[3].dts, 3000);
  assert.equal(f.amostras[3].pts, 5000);
  // a amostra 3 começa o segundo pedaço, logo depois do mdat das três primeiras
  const base = f.amostras[0].offset;
  assert.equal(f.amostras[3].offset, base + 100 + 101 + 102);
  assert.equal(new Uint8Array(buf, f.amostras[9].offset, 1)[0], 7);
  assert.equal(fimDaFaixa(f), 11000);
});

test('trecho até o instante: do quadro-chave anterior, sem passar do próximo grupo', async () => {
  const buf = mp4(true);
  const f = faixaDeVideo(await lerMoov(leitor(buf).ler, buf.byteLength));
  assert.deepEqual(trechoAte(f, 6500), [4, 5, 6, 7]);
  assert.deepEqual(trechoAte(f, 2000, 0), [0, 1, 2]);
  assert.deepEqual(quadrosEspalhados(f, 2).length, 2);
});

test('comparação: alinhados para o vídeo inteiro, cruzados para o cortado', () => {
  const a = ['0000000000000000', 'ffffffff00000000', '00000000ffffffff', 'ffff0000ffff0000', '0f0f0f0f0f0f0f0f'];
  const igual = compararQuadros(a, a, hamming);
  assert.equal(igual.iguais, true);
  assert.equal(igual.alinhado, 0);
  // cortado: os mesmos quadros em outra ordem (outras posições)
  const cortado = compararQuadros(a, [a[2], a[3], a[4], a[0], a[1]], hamming);
  assert.equal(cortado.iguais, true);
  assert.ok(cortado.alinhado > 10);
  const outro = compararQuadros(a, ['5555555555555555', 'aaaaaaaaaaaaaaaa', '3333333333333333', 'cccccccccccccccc', '6666666666666666'], hamming);
  assert.equal(outro.iguais, false);
  assert.equal(compararQuadros([], a, hamming).iguais, null);
});

test('cruzamento: quadros iguais confirmam o par (mesmo de duração diferente); diferentes o desfazem', () => {
  const T = Date.UTC(2021, 3, 1, 12);
  const g1 = { id: 'g:1', source: 'google', ts: T, w: 1920, h: 1080, video: true, videoMs: 8000, extrasLidos: true };
  const g2 = { id: 'g:2', source: 'google', ts: T + 300, w: 1920, h: 1080, video: true, videoMs: 9000, extrasLidos: true };
  const a = { id: 'a:1', source: 'icloud', ts: T, w: 1920, h: 1080, video: true, durMs: 12000 };
  // sem os quadros: duração diferente nos dois, disputa
  let r = matchLibraries([g1, g2], [a]);
  assert.equal(r.pairs[0].cls, 'confirmar');
  const need = quadrosNeeded(r.pairs);
  assert.deepEqual(need.map((x) => x.g).sort(), ['g:1', 'g:2']);
  // g:2 tem os mesmos quadros (o do Google foi cortado); g:1 é outro vídeo
  const comQuadros = { ...a, quadros: [{ g: 'g:1', iguais: false, dist: 30 }, { g: 'g:2', iguais: true, dist: 2, alinhado: 18, n: 5 }] };
  r = matchLibraries([g1, g2], [comQuadros]);
  const p = r.pairs[0];
  assert.equal(p.g.id, 'g:2');
  assert.equal(p.cls, 'ambos');
  assert.equal(estadoIdentidade(p), 'confirmada');
  assert.deepEqual(p.quadros, { dist: 2, alinhado: 18, n: 5 });
  assert.deepEqual(r.soGoogle.map((g) => g.id), ['g:1']);
  assert.deepEqual(quadrosNeeded(r.pairs), []);
  const pl = placarIdentidade({ a: {}, g: {}, prova: { dt: 300, rel: 'igual', dist: null, quadros: p.quadros, dur: 'diferente', durA: 12000, durG: 9000 }, cls: p.cls });
  assert.ok(pl.provas.some((x) => x.k === 'quadros' && x.pontos === 4));
});
