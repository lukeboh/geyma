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
