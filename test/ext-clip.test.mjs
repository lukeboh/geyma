// Classificação pela imagem (CLIP): preparo, probabilidades por categoria,
// combinação com as regras e fila. O modelo em si é medido no navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { recorteCentral, pixelsParaTensor, classificarEmbed, comImagem, filaDoClip, registroClip, googleParaClip, CLIP_VERSAO, CATS_CLIP, MODELO, urlDoModelo } from '../extension/src/core/clip.js';
import { classifyRow, suggestDecision } from '../extension/src/core/classify.js';

const textos = JSON.parse(readFileSync(new URL('../extension/assets/clip-textos.json', import.meta.url)));

test('recorte do CLIP: lado menor em 224 e centro', () => {
  assert.deepEqual(recorteCentral(448, 224), { rw: 448, rh: 224, x: 112, y: 0 });
  assert.deepEqual(recorteCentral(300, 400), { rw: 224, rh: 299, x: 0, y: 37 });
  assert.deepEqual(recorteCentral(224, 224), { rw: 224, rh: 224, x: 0, y: 0 });
});

test('tensor em canais separados e normalizado', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // 2 pixels
  const t = pixelsParaTensor(rgba, 2);
  assert.equal(t.length, 6);
  assert.ok(Math.abs(t[0] - (1 - 0.48145466) / 0.26862954) < 1e-6); // R do 1º
  assert.ok(Math.abs(t[3] - (1 - 0.4578275) / 0.26130258) < 1e-6); // G do 2º
});

test('frases geradas pelo mesmo modelo e revisão, normalizadas, de todas as categorias', () => {
  assert.equal(textos.modelo, MODELO.nome);
  assert.equal(textos.revisao, MODELO.revisao);
  assert.deepEqual([...new Set(textos.frases.map((f) => f.cat))].sort(), [...CATS_CLIP].sort());
  for (const f of textos.frases) {
    assert.equal(f.v.length, 512);
    assert.ok(Math.abs(Math.hypot(...f.v) - 1) < 1e-3, f.texto);
  }
  assert.match(urlDoModelo(), /^https:\/\/huggingface\.co\/Xenova\/clip-vit-base-patch32\/resolve\/[0-9a-f]{40}\/onnx\/vision_model_quantized\.onnx$/);
});

test('a imagem igual à frase de uma categoria cai nela, com as probabilidades somando 1', () => {
  const doc = textos.frases.find((f) => f.texto === 'a photo of a receipt');
  const r = classificarEmbed(Float32Array.from(doc.v, (x) => x * 3), textos.frases); // a escala não importa
  assert.equal(r.cat, 'documento');
  assert.equal(r.frase, 'a photo of a receipt');
  assert.ok(Math.abs(r.probs.reduce((a, b) => a + b, 0) - 1) < 0.01);
  const reg = registroClip(r);
  assert.deepEqual(Object.keys(reg), ['v', 'cat', 'p', 'frase', 'probs']);
  assert.equal(reg.v, CLIP_VERSAO);
});

const clip = (cat, p) => ({ v: CLIP_VERSAO, cat, p, frase: 'x', probs: [] });

test('indefinido: a imagem decide com confiança; sem confiança, continua indefinido', () => {
  const ind = { cat: 'indefinido', reasons: [] };
  assert.deepEqual(comImagem(ind, clip('documento', 0.7)), { cat: 'documento', reasons: ['pela imagem: parece documento (70%)'] });
  assert.equal(comImagem(ind, clip('pessoal', 0.9)).cat, 'pessoal');
  assert.deepEqual(comImagem(ind, clip('print', 0.4)), { cat: 'indefinido', reasons: ['pela imagem: incerta (captura de tela, 40%)'] });
});

test('pessoal pelas regras só sai com imagem muito clara, e vai para Pendente', () => {
  const pes = { cat: 'pessoal', reasons: ['nome de câmera'] };
  assert.equal(comImagem(pes, clip('documento', 0.65)), pes);
  const r = comImagem(pes, clip('documento', 0.85));
  assert.equal(r.cat, 'documento');
  assert.deepEqual(r.reasons, ['pela imagem: parece documento (85%)', 'as regras diziam: nome de câmera']);
  assert.equal(suggestDecision(r.cat), 'pendente');
  assert.equal(comImagem(pes, clip('pessoal', 0.99)), pes);
});

test('regras fortes continuam valendo; recebida pode virar documento ou propaganda', () => {
  const print = { cat: 'print', reasons: ['marcada pela Apple como captura de tela'] };
  assert.equal(comImagem(print, clip('pessoal', 0.99)), print);
  const rec = { cat: 'recebida', reasons: ['importada por app'] };
  assert.equal(comImagem(rec, clip('pessoal', 0.99)), rec);
  assert.equal(comImagem(rec, clip('propaganda', 0.9)).cat, 'propaganda');
  // classificação de outra versão do modelo não vale
  assert.equal(comImagem({ cat: 'indefinido', reasons: [] }, { ...clip('pessoal', 0.99), v: CLIP_VERSAO + 1 }).cat, 'indefinido');
});

test('classifyRow usa a imagem guardada no item do Google ou do iCloud', () => {
  assert.equal(classifyRow(null, { w: 1920, h: 1080, clip: clip('propaganda', 0.8) }).cat, 'propaganda');
  assert.equal(classifyRow({ w: 1920, h: 1080, clip: clip('internet', 0.8) }, null).cat, 'internet');
  assert.equal(classifyRow({ w: 1920, h: 1080 }, { w: 1920, h: 1080, clip: clip('documento', 0.8) }).cat, 'documento');
});

test('fila: só fotos ainda não olhadas, indefinidas primeiro, miniatura do Google quando há', () => {
  const rows = [
    { cls: 'ambos', cat: 'pessoal', clipV: 0, a: { id: 'a:1' }, g: { id: 'g:1', thumb: 'https://g/1' } },
    { cls: 'soIcloud', cat: 'indefinido', clipV: 0, a: { id: 'a:2', thumb: 'u', thumbAt: 5 } },
    { cls: 'soGoogle', cat: 'pessoal', clipV: CLIP_VERSAO, g: { id: 'g:3', thumb: 'https://g/3' } },
    { cls: 'soGoogle', cat: 'indefinido', clipV: 0, g: { id: 'g:4', thumb: 'https://g/4', video: true } },
    { cls: 'dupGoogle', cat: 'pessoal', clipV: 0, g: { id: 'g:5', thumb: 'https://g/5' } },
  ];
  assert.deepEqual(filaDoClip(rows), [
    { prioridade: 0, lado: 'a', id: 'a:2', thumb: 'u', thumbAt: 5 },
    { prioridade: 1, lado: 'g', id: 'g:1', base: 'https://g/1' },
  ]);
  assert.equal(googleParaClip('https://g/1'), 'https://g/1=w224-h224-c');
});

test('ONNX Runtime embutido na extensão e CSP que permite WebAssembly', () => {
  for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.wasm']) {
    assert.ok(existsSync(new URL(`../extension/vendor/onnxruntime-web/${f}`, import.meta.url)), f);
  }
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.match(manifest.content_security_policy.extension_pages, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(manifest.content_security_policy.extension_pages, /https?:/); // nenhum código de fora
});
