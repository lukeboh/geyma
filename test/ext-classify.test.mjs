import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIcloud, classifyGoogle, suggestDecision } from '../extension/src/core/classify.js';

const a = (o) => ({ filename: 'x.jpg', fileType: 'public.jpeg', w: 1000, h: 700, video: false, subtype: 0, importedBy: null, ...o });

test('captura de tela marcada pela Apple ou pelo nome', () => {
  assert.equal(classifyIcloud(a({ subtype: 3, filename: 'IMG_0001.PNG' })).cat, 'print');
  assert.equal(classifyIcloud(a({ filename: 'Screenshot 2020-01-01.png' })).cat, 'print');
});

test('foto renomeada com data, mas do tamanho de uma tela, é captura de tela', () => {
  assert.equal(classifyIcloud(a({ filename: '20160411-001416--750 x 1334-2.jpg', w: 750, h: 1334 })).cat, 'print');
});

test('câmeras antigas 4:3 e vídeos 1080×1920 não viram captura de tela', () => {
  assert.equal(classifyIcloud(a({ filename: 'P1060996.JPG', w: 2048, h: 1536 })).cat, 'pessoal');
  assert.equal(classifyIcloud(a({ filename: 'v.MOV', w: 1080, h: 1920, video: true, fileType: 'com.apple.quicktime-movie' })).cat, 'pessoal');
  assert.equal(classifyGoogle({ w: 1536, h: 2048 }).cat, 'pessoal');
});

test('recebidas por mensageiro ou rede social', () => {
  assert.equal(classifyIcloud(a({ importedBy: 'net.whatsapp.WhatsApp', filename: 'IMG_8319.JPG' })).cat, 'recebida');
  assert.equal(classifyIcloud(a({ filename: 'IMG-20190101-WA0001.jpg' })).cat, 'recebida');
});

test('salvas da internet ou de apps', () => {
  assert.equal(classifyIcloud(a({ importedBy: 'com.openai.chat' })).cat, 'internet');
  assert.equal(classifyIcloud(a({ filename: '141CE7C7-7A78-4F51-A912-39B80DA320F5.jpg', w: 3840, h: 2160 })).cat, 'internet');
  assert.equal(classifyIcloud(a({ fileType: 'com.compuserve.gif', filename: 'a.gif' })).cat, 'internet');
  assert.equal(classifyIcloud(a({ w: 640, h: 480, filename: 'Imag028.JPG' })).cat, 'internet');
});

test('pessoais: câmera, Live Photo, RAW, nome com data, filme digitalizado', () => {
  assert.equal(classifyIcloud(a({ filename: 'IMG_4445.HEIC', w: 5712, h: 4284 })).cat, 'pessoal');
  assert.equal(classifyIcloud(a({ subtype: 2 })).cat, 'pessoal');
  assert.equal(classifyIcloud(a({ fileType: 'com.nikon.raw-image', filename: 'a.NEF' })).cat, 'pessoal');
  assert.equal(classifyIcloud(a({ filename: '2013-09-14 13.11.55.jpg', w: 2448, h: 3264 })).cat, 'pessoal');
  assert.equal(classifyIcloud(a({ filename: 'filme-1981-L-04.jpg' })).cat, 'pessoal');
});

test('Google: só dimensões, regras conservadoras', () => {
  assert.equal(classifyGoogle({ w: 1125, h: 2436 }).cat, 'print');
  assert.equal(classifyGoogle({ w: 640, h: 480 }).cat, 'internet');
  assert.equal(classifyGoogle({ w: 4032, h: 3024 }).cat, 'pessoal');
  assert.equal(classifyGoogle({ w: 1920, h: 1080 }).cat, 'indefinido');
});

test('só o claramente pessoal é sugerido como Pessoal; o resto fica Pendente', () => {
  assert.equal(suggestDecision('pessoal'), 'pessoal');
  for (const c of ['print', 'recebida', 'internet', 'indefinido']) assert.equal(suggestDecision(c), 'pendente');
});

test('Google: foto com movimento, vídeo e nome do arquivo (quando a ficha foi lida)', () => {
  // foto com movimento é de câmera, mesmo fora da proporção
  assert.deepEqual(classifyGoogle({ w: 1920, h: 1080, motionMs: 1500 }), { cat: 'pessoal', reasons: ['foto com movimento (Live Photo)'] });
  // vídeo grande é de câmera; vídeo pequeno não vira "internet"
  assert.equal(classifyGoogle({ w: 1920, h: 1080, video: true }).cat, 'pessoal');
  assert.equal(classifyGoogle({ w: 640, h: 480, video: true }).cat, 'indefinido');
  // o tamanho de tela não vale para vídeo (gravação de tela vem do iCloud com a marca)
  assert.equal(classifyGoogle({ w: 1170, h: 2532, video: true }).cat, 'indefinido');
  // nome do arquivo pela ficha
  assert.equal(classifyGoogle({ w: 1920, h: 1080, file: { nome: 'IMG-20200101-WA0001.jpg' } }).cat, 'recebida');
  assert.equal(classifyGoogle({ w: 1920, h: 1080, file: { nome: 'Screenshot_2020.png' } }).cat, 'print');
  assert.deepEqual(classifyGoogle({ w: 1920, h: 1080, file: { nome: 'IMG_1234.HEIC' } }).reasons, ['nome de câmera']);
  // ficha de vídeo é a da capa: não conta
  assert.equal(classifyGoogle({ w: 640, h: 480, video: true, file: { nome: 'IMG_1234.jpg' } }).cat, 'indefinido');
});

test('gravações de tela: pelo nome ou pelo gravador do iPhone', () => {
  const v = { video: true, fileType: 'com.apple.quicktime-movie', w: 1126, h: 2436 };
  assert.deepEqual(classifyIcloud(a({ ...v, filename: 'ScreenRecording_11-16-2026 14-03-18_1.MP4' })), { cat: 'print', reasons: ['nome de gravação de tela'] });
  assert.equal(classifyIcloud(a({ ...v, filename: 'RPReplay_Final1690000000.MP4' })).cat, 'print');
  assert.deepEqual(classifyIcloud(a({ ...v, filename: 'IMG_1.MP4', importedBy: 'com.apple.replayd' })), { cat: 'print', reasons: ['gravação de tela do iPhone'] });
});

test('documentos: nome ou app de digitalizar, antes de "recebida"', () => {
  assert.equal(classifyIcloud(a({ filename: 'Comprovante_pix.jpg' })).cat, 'documento');
  assert.equal(classifyIcloud(a({ filename: 'CamScanner 01-02-2020.jpg', w: 2480, h: 3508 })).cat, 'documento');
  assert.equal(classifyIcloud(a({ filename: 'IMG_0001.PNG', importedBy: 'com.microsoft.officemobile' })).cat, 'documento');
  assert.equal(classifyIcloud(a({ filename: 'Recibo.jpg', importedBy: 'net.whatsapp.WhatsApp' })).cat, 'documento');
  assert.equal(classifyGoogle({ w: 2480, h: 3508, file: { nome: 'Boleto-agosto.jpg' } }).cat, 'documento');
  // fotos antigas digitalizadas não são documento
  for (const filename of ['scan0042.jpg', 'SCANS_A12.jpeg', 'Scan-110-AA (3).jpg', 'filme-1981-B-04-scan.jpg']) {
    assert.notEqual(classifyIcloud(a({ filename, w: 2524, h: 1686 })).cat, 'documento', filename);
  }
  // captura de tela continua vencendo
  assert.equal(classifyIcloud(a({ subtype: 3, filename: 'Comprovante.png' })).cat, 'print');
});

test('propaganda: nome ou loja', () => {
  assert.equal(classifyIcloud(a({ filename: 'Promoção Natal.jpg' })).cat, 'propaganda');
  assert.equal(classifyIcloud(a({ filename: 'convite-aniversario.png', importedBy: 'net.whatsapp.WhatsApp' })).cat, 'propaganda');
  assert.equal(classifyIcloud(a({ filename: 'IMG_1.JPG', importedBy: 'com.beeasy.shopee.br' })).cat, 'propaganda');
  assert.equal(classifyGoogle({ w: 1080, h: 1080, file: { nome: 'flyer_evento.jpg' } }).cat, 'propaganda');
  // nome de câmera não vira propaganda por acaso
  assert.equal(classifyIcloud(a({ filename: 'IMG_4445.HEIC', w: 5712, h: 4284 })).cat, 'pessoal');
  assert.equal(suggestDecision('documento'), 'pendente');
  assert.equal(suggestDecision('propaganda'), 'pendente');
});

test('iCloud: localização (GPS) conta como câmera, depois das regras de lixo', () => {
  assert.deepEqual(classifyIcloud({ w: 1920, h: 1080, local: true }), { cat: 'pessoal', reasons: ['com localização (GPS)'] });
  // captura de tela e mensageiro continuam vencendo
  assert.equal(classifyIcloud({ w: 1920, h: 1080, local: true, subtype: 3 }).cat, 'print');
  assert.equal(classifyIcloud({ w: 1920, h: 1080, local: true, importedBy: 'net.whatsapp.WhatsApp' }).cat, 'recebida');
  assert.equal(classifyIcloud({ w: 1920, h: 1080 }).cat, 'indefinido');
});
