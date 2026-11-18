// Worker do CLIP: carrega o modelo de imagem (baixado uma vez e guardado no
// Cache Storage da extensão, conferido pelo SHA-256) e devolve a representação
// de cada imagem. Nenhuma imagem sai do notebook.
//
// Mensagens: {tipo: 'carregar'} → {tipo: 'baixando', recebidos, total} … {tipo: 'pronto'};
// {tipo: 'imagem', id, blob} → {tipo: 'resultado', id, emb} ou {tipo: 'falha', id, erro}.
import * as ort from '../vendor/onnxruntime-web/ort.wasm.bundle.min.mjs';
import { MODELO, urlDoModelo, LADO, recorteCentral, pixelsParaTensor } from './core/clip.js';

ort.env.wasm.numThreads = 1; // sem isolamento entre origens não há threads
// só o .wasm vem de fora do pacote; a cola em JavaScript já está embutida nele
ort.env.wasm.wasmPaths = { wasm: new URL('../vendor/onnxruntime-web/ort-wasm-simd-threaded.wasm', import.meta.url).href };

const CACHE = 'geyma-modelos';
let sessao = null;
let canvas = null;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function bytesDoModelo() {
  const url = urlDoModelo();
  const cache = await caches.open(CACHE);
  const guardado = await cache.match(url);
  if (guardado) return new Uint8Array(await guardado.arrayBuffer());
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`download do modelo: HTTP ${res.status}`);
  const total = MODELO.bytes;
  const partes = [];
  let recebidos = 0;
  let aviso = 0;
  const leitor = res.body.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    partes.push(value);
    recebidos += value.length;
    if (recebidos - aviso > 2e6) { aviso = recebidos; postMessage({ tipo: 'baixando', recebidos, total }); }
  }
  const bytes = new Uint8Array(recebidos);
  let pos = 0;
  for (const p of partes) { bytes.set(p, pos); pos += p.length; }
  const sha = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (sha !== MODELO.sha256) throw new Error('o modelo baixado não confere (SHA-256 diferente); nada foi guardado');
  await cache.put(url, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
  return bytes;
}

async function carregar() {
  if (sessao) return;
  const bytes = await bytesDoModelo();
  sessao = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function representar(blob) {
  const bmp = await createImageBitmap(blob);
  const { rw, rh, x, y } = recorteCentral(bmp.width, bmp.height);
  // a redução em duas etapas (createImageBitmap de alta qualidade, depois o recorte) se aproxima da bicúbica do CLIP
  const reduzida = await createImageBitmap(bmp, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'high' });
  bmp.close();
  canvas ??= new OffscreenCanvas(LADO, LADO).getContext('2d', { willReadFrequently: true });
  canvas.fillStyle = '#fff';
  canvas.fillRect(0, 0, LADO, LADO);
  canvas.drawImage(reduzida, -x, -y);
  reduzida.close();
  const dados = pixelsParaTensor(canvas.getImageData(0, 0, LADO, LADO).data);
  const saida = await sessao.run({ pixel_values: new ort.Tensor('float32', dados, [1, 3, LADO, LADO]) });
  return saida.image_embeds.data;
}

// uma imagem por vez, na ordem de chegada
let fila = Promise.resolve();
onmessage = (e) => {
  const m = e.data;
  fila = fila.then(async () => {
    if (m.tipo === 'carregar') {
      try { await carregar(); postMessage({ tipo: 'pronto' }); } catch (err) { postMessage({ tipo: 'erro', erro: String(err.message || err) }); }
    } else if (m.tipo === 'imagem') {
      try {
        const emb = await representar(m.blob);
        postMessage({ tipo: "resultado", id: m.id, emb: Float32Array.from(emb) });
      } catch (err) { postMessage({ tipo: 'falha', id: m.id, erro: String(err.message || err) }); }
    }
  });
};
