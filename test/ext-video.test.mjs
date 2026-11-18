// Vídeos (0.9): campos do iCloud, duração como prova de identidade, ficha do
// arquivo de vídeo do Google, resumo, classificação e envio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIcloudPair } from '../extension/src/core/normalize.js';
import { relacaoDuracao, textoDuracao, copiaVideoNoGoogle, movimentosDeLive, videoFileNeeded, resumoVideos, ehVideo, LIMITE_VIDEO_ENVIO } from '../extension/src/core/video.js';
import { matchLibraries, estadoIdentidade, tipoCompativel } from '../extension/src/core/match.js';
import { placarIdentidade } from '../extension/src/core/placar.js';
import { melhorCopia } from '../extension/src/core/qualidade.js';
import { classifyGoogle, classifyIcloud } from '../extension/src/core/classify.js';
import { arquivosDoItem, pedacosDeBytes, bytesDeBase64, podeEnviar } from '../extension/src/core/envio.js';

const enc = (s) => Buffer.from(s).toString('base64');
const T = 1700000000000;

test('normalize: duração, codec, quadros por segundo e versão para assistir de um vídeo do iCloud', () => {
  const asset = { recordName: 'A1', fields: { assetDate: { value: T }, duration: { value: 31063 } } };
  const master = { recordName: 'M1', fields: {
    itemType: { value: 'com.apple.quicktime-movie' }, filenameEnc: { value: enc('IMG_3668.MOV') },
    resOriginalWidth: { value: 3840 }, resOriginalHeight: { value: 2160 }, resOriginalFileSize: { value: 336008805 },
    codec: { value: 'HEVC' }, videoFrameRate: { value: 60 },
    resVidMedRes: { value: { downloadURL: 'https://x.icloud-content.com/med' } },
  } };
  const it = normalizeIcloudPair(asset, master);
  assert.equal(it.video, true);
  assert.equal(it.durMs, 31063);
  assert.equal(it.codec, 'HEVC');
  assert.equal(it.fps, 60);
  assert.equal(it.vidMed, 'https://x.icloud-content.com/med');
  // foto: sem os campos de vídeo
  const foto = normalizeIcloudPair(asset, { recordName: 'M2', fields: { itemType: { value: 'public.heic' }, filenameEnc: { value: enc('IMG_1.HEIC') } } });
  assert.equal(foto.video, false);
  assert.equal('durMs' in foto, false);
});

test('vídeo .m4v que a Apple marca como "unsupported" é vídeo pelo nome', () => {
  const asset = { recordName: 'A2', fields: { assetDate: { value: T } } };
  const master = { recordName: 'M3', fields: { itemType: { value: 'unsupported' }, filenameEnc: { value: enc('clipe.m4v') } } };
  assert.equal(normalizeIcloudPair(asset, master).video, true);
  // itens antigos do inventário, gravados sem a marca
  assert.equal(ehVideo({ video: false, filename: 'clipe.M4V' }), true);
  assert.equal(ehVideo({ video: false, filename: 'IMG_1.HEIC' }), false);
});

test('relação entre as durações: igual, câmera lenta, próxima, diferente', () => {
  assert.equal(relacaoDuracao({ durMs: 31063 }, { videoMs: 31040 }), 'igual');
  // clipes curtos: o Google mede só a trilha de vídeo (até 200 ms a menos)
  assert.equal(relacaoDuracao({ durMs: 3017 }, { videoMs: 2842 }), 'igual');
  // câmera lenta a 240 qps: o Google conta o tempo de reprodução (4,5×)
  assert.equal(relacaoDuracao({ durMs: 19743, fps: 240 }, { videoMs: 88833 }), 'lenta');
  assert.equal(relacaoDuracao({ durMs: 19743, fps: 30 }, { videoMs: 88833 }), 'diferente');
  assert.equal(relacaoDuracao({ durMs: 20000 }, { videoMs: 20600 }), 'proxima');
  assert.equal(relacaoDuracao({ durMs: 19035 }, { videoMs: 18051 }), 'diferente');
  assert.equal(relacaoDuracao({ durMs: 2412 }, { videoMs: 3391 }), 'diferente');
  assert.equal(relacaoDuracao({ durMs: 51262 }, { videoMs: 56038 }), 'diferente');
  assert.equal(relacaoDuracao({}, { videoMs: 1000 }), null);
});

test('texto da duração', () => {
  assert.equal(textoDuracao(3017), '3,0 s');
  assert.equal(textoDuracao(31063), '31 s');
  assert.equal(textoDuracao(65000), '1 min 05 s');
  assert.equal(textoDuracao(3725000), '1 h 02 min');
  assert.equal(textoDuracao(null), '');
});

const A = (o = {}) => ({ id: 'a:1', source: 'icloud', ts: T, w: 1920, h: 1080, video: true, durMs: 10000, size: 100e6, filename: 'IMG_1.MOV', ...o });
const G = (o = {}) => ({ id: 'g:1', source: 'google', ts: T, w: 1920, h: 1080, video: true, videoMs: 10000, extrasLidos: true, thumb: 'https://lh3.googleusercontent.com/g1', ...o });

test('como o Google guarda o vídeo, pela ficha do arquivo (=dv)', () => {
  assert.equal(copiaVideoNoGoogle(A(), G({ fileV: { bytes: 100e6 } })), 'original');
  assert.equal(copiaVideoNoGoogle(A(), G({ fileV: { bytes: 19e6 } })), 'recomprimida');
  assert.equal(copiaVideoNoGoogle(A(), G({ w: 1280, h: 720, fileV: { bytes: 30e6 } })), 'reduzida');
  assert.equal(copiaVideoNoGoogle(A(), G({ videoMs: 6000, fileV: { bytes: 60e6 } })), 'aparada');
  assert.equal(copiaVideoNoGoogle(A(), G()), null);
  const m = melhorCopia({ cls: 'ambos', a: A(), g: G(), copiaGoogle: 'aparada' });
  assert.deepEqual(m.icloud, ['googleAparado']);
  assert.deepEqual(melhorCopia({ cls: 'ambos', a: A(), g: G(), copiaGoogle: 'recomprimida' }).icloud, ['googleRecomprimida']);
});

test('foto e vídeo nunca formam par (o tipo do Google só vale com os dados extras)', () => {
  assert.equal(tipoCompativel(A({ video: false, filename: 'IMG_1.HEIC' }), G()), false);
  assert.equal(tipoCompativel(A(), G({ video: false })), false);
  assert.equal(tipoCompativel(A(), G({ video: false, extrasLidos: false })), true);
  // a Live Photo do iCloud e o movimento dela enviado ao Google como vídeo
  const live = A({ video: false, live: true, filename: 'IMG_1.HEIC', w: 4032, h: 3024 });
  const r = matchLibraries([G({ w: 4032, h: 3024, videoMs: 2000 })], [live]);
  assert.equal(r.pairs.length, 0);
  assert.equal(movimentosDeLive(r.soGoogle, [live]).get('g:1'), 'a:1');
});

test('mesma duração confirma o vídeo; duração diferente fica a confirmar', () => {
  const ok = matchLibraries([G()], [A()]);
  assert.equal(ok.pairs[0].confirmadoPorDuracao, true);
  assert.equal(estadoIdentidade(ok.pairs[0]), 'confirmada');
  const lenta = matchLibraries([G({ videoMs: 45000 })], [A({ fps: 240 })]);
  assert.equal(lenta.pairs[0].duracao, 'lenta');
  assert.equal(estadoIdentidade(lenta.pairs[0]), 'confirmada');
  const dif = matchLibraries([G({ videoMs: 4000 })], [A()]);
  assert.equal(dif.pairs[0].cls, 'confirmar');
  assert.equal(dif.pairs[0].duracaoDiferente, true);
  assert.equal(estadoIdentidade(dif.pairs[0]), 'incerta');
  // sem a duração do iCloud (lida antes da 0.9): como antes, provável
  const sem = matchLibraries([G()], [A({ durMs: undefined })]);
  assert.equal(estadoIdentidade(sem.pairs[0]), 'provavel');
  // cópia reduzida com a mesma duração: confirmada sem precisar da imagem
  const red = matchLibraries([G({ w: 1280, h: 720 })], [A()]);
  assert.equal(red.pairs[0].cls, 'reduzida');
  assert.equal(estadoIdentidade(red.pairs[0]), 'confirmada');
});

test('dois vídeos no mesmo segundo: a duração desfaz a troca', () => {
  const g1 = G({ id: 'g:1', ts: T, videoMs: 3391 });
  const g2 = G({ id: 'g:2', ts: T + 300, videoMs: 2333 });
  const a1 = A({ id: 'a:1', ts: T, durMs: 3480 });
  const a2 = A({ id: 'a:2', ts: T + 300, durMs: 2412 });
  const r = matchLibraries([g1, g2], [a1, a2]);
  const par = Object.fromEntries(r.pairs.map((p) => [p.a.id, p.g.id]));
  assert.deepEqual(par, { 'a:1': 'g:1', 'a:2': 'g:2' });
  for (const p of r.pairs) assert.equal(estadoIdentidade(p), 'confirmada');
});

test('placar: a duração entra como prova', () => {
  const base = { a: A(), g: G(), prova: { dt: 0, dist: null, rel: 'igual' } };
  const igual = placarIdentidade({ ...base, prova: { ...base.prova, dur: 'igual', durA: 10000, durG: 10010 } });
  assert.ok(igual.provas.some((p) => p.k === 'duracao' && p.pontos === 3 && /mesma duração \(10 s\)/.test(p.texto)));
  const dif = placarIdentidade({ ...base, prova: { ...base.prova, dur: 'diferente', durA: 10000, durG: 4000 } });
  assert.ok(dif.provas.some((p) => p.k === 'duracao' && p.pontos === -2 && /cortado/.test(p.texto)));
});

test('fichas de vídeo a conferir: primeiro as que ajudam na identidade', () => {
  const pares = [
    { cls: 'ambos', duracao: 'igual', a: A(), g: G({ id: 'g:1' }) },
    { cls: 'confirmar', duracao: 'diferente', a: A(), g: G({ id: 'g:2' }) },
    { cls: 'ambos', duracao: 'igual', a: A(), g: G({ id: 'g:3', fileV: { bytes: 1 } }) },
    { cls: 'ambos', a: A({ video: false }), g: G({ id: 'g:4', video: false }) },
  ];
  assert.deepEqual(videoFileNeeded(pares).map((x) => x.id), ['g:2', 'g:1']);
  assert.equal(videoFileNeeded(pares)[0].v, true);
});

test('resumo dos vídeos para o painel', () => {
  const rows = [
    { cls: 'ambos', ident: 'confirmada', duracao: 'igual', copiaGoogle: 'original', a: { video: true, durMs: 10000, size: 5 }, g: { video: true, videoMs: 10000, fileV: { bytes: 5 } } },
    { cls: 'soIcloud', a: { video: true, durMs: 2000, size: LIMITE_VIDEO_ENVIO + 1 } },
    { cls: 'soGoogle', movimentoDe: 'a:9', g: { video: true, videoMs: 1500 } },
    { cls: 'ambos', a: { video: false }, g: { video: true } },
    { cls: 'ambos', a: { video: false }, g: {} },
  ];
  const v = resumoVideos(rows);
  assert.equal(v.pares.n, 1);
  assert.equal(v.pares.ms, 10000);
  assert.equal(v.identidade.confirmada, 1);
  assert.equal(v.duracao.igual, 1);
  assert.equal(v.copia.original, 1);
  assert.equal(v.soIcloud.n, 1);
  assert.equal(v.grandes, 1);
  assert.equal(v.soGoogle.ms, 1500);
  assert.equal(v.movimentoLive, 1);
  assert.equal(v.misturados, 1);
});

test('classificação: nomes de vídeo do WhatsApp e de câmera; o nome do vídeo do Google vem da ficha =dv', () => {
  assert.equal(classifyIcloud(A({ filename: 'VID-20200101-WA0003.mp4', w: 480, h: 848 })).cat, 'recebida');
  assert.equal(classifyIcloud(A({ filename: 'VID_20200101_120000.mp4', w: 480, h: 848 })).cat, 'pessoal');
  assert.equal(classifyGoogle(G({ w: 480, h: 848, fileV: { nome: 'VID-20200101-WA0003.mp4' } })).cat, 'recebida');
  // o nome da capa (=d) não vale para um vídeo
  assert.equal(classifyGoogle(G({ w: 480, h: 848, file: { nome: 'VID-20200101-WA0003.mp4.jpg' } })).cat, 'indefinido');
});

test('envio de vídeos: o arquivo de vídeo dos dois lados, até o limite de tamanho', () => {
  assert.deepEqual(arquivosDoItem(A({ orig: 'https://x/o', edited: true, full: 'https://x/full.jpg' })).map((f) => [f.url, f.nome, f.papel]), [['https://x/o', 'IMG_1.MOV', 'video']]);
  assert.deepEqual(arquivosDoItem(A({ orig: 'https://x/o', filename: 'clipe.m4v', video: false })).map((f) => f.nome), ['clipe.M4V']);
  const g = arquivosDoItem(G({ fileV: { nome: 'IMG_2.MOV' } }));
  assert.equal(g[0].url, 'https://lh3.googleusercontent.com/g1=dv');
  assert.equal(g[0].nome, 'IMG_2.MOV');
  assert.match(arquivosDoItem(G())[0].nome, /\.MP4$/);
  const soG = { cls: 'soGoogle', cat: 'pessoal', g: G({ fileV: { bytes: LIMITE_VIDEO_ENVIO + 1 } }) };
  assert.equal(podeEnviar(soG, 'icloud').ok, false);
  assert.equal(podeEnviar({ ...soG, g: G({ fileV: { bytes: 10 } }) }, 'icloud').ok, true);
});

test('pedaços em base64 direto dos bytes remontam o arquivo', () => {
  const bytes = new Uint8Array(1000).map((_, i) => (i * 7) % 256);
  const partes = [...pedacosDeBytes(bytes, 100)];
  assert.equal(partes.length, 11); // 99 bytes por pedaço (múltiplo de 3)
  const junto = Buffer.concat(partes.map((p) => Buffer.from(bytesDeBase64(p))));
  assert.deepEqual(new Uint8Array(junto), bytes);
  assert.deepEqual([...pedacosDeBytes(new Uint8Array(0))], ['']);
});

test('duplicatas: foto e vídeo do mesmo segundo não se misturam; vídeos com a mesma duração são cópias', async () => {
  const { analyzeDuplicates, candidateGroups } = await import('../extension/src/core/dedup.js');
  const v1 = { id: 'g:v1', ts: T, w: 1920, h: 1080, video: true, videoMs: 10000, seenAt: 1 };
  const v2 = { id: 'g:v2', ts: T + 200, w: 1080, h: 1920, video: true, videoMs: 10050, seenAt: 2 };
  const v3 = { id: 'g:v3', ts: T + 400, w: 1920, h: 1080, video: true, videoMs: 4000, seenAt: 3 };
  const foto = { id: 'g:f', ts: T, w: 1920, h: 1080, seenAt: 4 };
  assert.equal(candidateGroups([v1, foto]).length, 0);
  const d = analyzeDuplicates([v1, v2, v3, foto]);
  assert.equal(d.copias, 1);
  assert.equal(d.copies.get('g:v2').evidence, 'duracao');
  // o vídeo de outra duração é outro vídeo, não fica pendente de imagem
  assert.deepEqual(d.pendingIds, []);
});
