// Quadros amostrados de um vídeo (0.9), no navegador: lê o índice do MP4
// pelos trechos do arquivo (mp4.js), decodifica com o WebCodecs só o grupo de
// quadros em volta de cada instante escolhido e tira o pHash de cada quadro.
// Funciona com o painel em segundo plano (não usa <video>). Baixa poucas
// centenas de KB por vídeo.
import { lerMoov, faixaDeVideo, fimDaFaixa, trechoAte, POSICOES } from './mp4.js';
import { grayFromRgba, phashFromGray } from './phash.js';

let ctx = null;

/** Abre o arquivo por trechos: {ler(inicio, fim), total}. Segue o redirecionamento uma vez. */
async function abrir(url, credentials) {
  const r0 = await fetch(url, { headers: { Range: 'bytes=0-15' }, credentials });
  if (!r0.ok) { r0.body?.cancel().catch(() => {}); throw Object.assign(new Error(`HTTP ${r0.status}`), { status: r0.status }); }
  const total = Number((r0.headers.get('content-range') || '').split('/')[1]) || 0;
  await r0.arrayBuffer();
  const final = r0.url;
  const ler = async (a, b) => {
    const r = await fetch(final, { headers: { Range: `bytes=${a}-${b - 1}` }, credentials });
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status });
    return r.arrayBuffer();
  };
  return { ler, total };
}

/** pHash de um quadro, na orientação de exibição. */
async function hashDoQuadro(frame, rotacao) {
  ctx ??= new OffscreenCanvas(32, 32).getContext('2d', { willReadFrequently: true });
  const bmp = await createImageBitmap(frame, { resizeWidth: 32, resizeHeight: 32, resizeQuality: 'high' });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 32, 32);
  ctx.translate(16, 16);
  ctx.rotate((rotacao * Math.PI) / 180);
  ctx.drawImage(bmp, -16, -16, 32, 32);
  bmp.close();
  return phashFromGray(grayFromRgba(ctx.getImageData(0, 0, 32, 32).data));
}

/**
 * pHash dos quadros nos mesmos instantes relativos (POSICOES da duração).
 * @returns {Promise<{hashes: string[], bytes: number, codec: string, duracaoMs: number}>}
 */
export async function hashesDoVideo(url, { credentials = 'omit', limiteBytes = 8e6 } = {}) {
  const { ler, total } = await abrir(url, credentials);
  if (!total) throw new Error('o servidor não informou o tamanho do arquivo');
  const moov = await lerMoov(ler, total);
  if (!moov) throw new Error('MP4 sem índice (moov)');
  const f = faixaDeVideo(moov);
  if (!f?.amostras.length) throw new Error('MP4 sem faixa de vídeo');
  const conf = { codec: f.codec, description: f.descricao, codedWidth: f.largura, codedHeight: f.altura };
  if (!(await VideoDecoder.isConfigSupported(conf)).supported) throw new Error(`o Chrome não decodifica ${f.codec}`);
  const fim = fimDaFaixa(f);
  const hashes = [];
  let bytes = moov.byteLength;
  for (const p of POSICOES) {
    const alvo = fim * p;
    let idx = trechoAte(f, alvo);
    const faixa = (l) => [Math.min(...l.map((i) => f.amostras[i].offset)), Math.max(...l.map((i) => f.amostras[i].offset + f.amostras[i].tamanho))];
    let [a0, a1] = faixa(idx);
    // grupo de quadros grande demais: só o quadro-chave
    if (a1 - a0 > limiteBytes) { idx = [idx[0]]; [a0, a1] = faixa(idx); }
    const buf = await ler(a0, a1);
    bytes += buf.byteLength;
    // guarda só o quadro mais perto do alvo e fecha os outros na hora: o
    // decodificador tem poucos quadros para emprestar e para quando acabam
    const alvoUs = (alvo * 1e6) / f.escala;
    let melhor = null;
    let saiu = 0;
    let erro = null;
    const dec = new VideoDecoder({
      output: (q) => {
        saiu++;
        if (!melhor || Math.abs(q.timestamp - alvoUs) < Math.abs(melhor.timestamp - alvoUs)) { melhor?.close(); melhor = q; } else q.close();
      },
      error: (e) => { erro = e; },
    });
    dec.configure(conf);
    for (const i of idx) {
      const s = f.amostras[i];
      dec.decode(new EncodedVideoChunk({ type: i === idx[0] ? 'key' : 'delta', timestamp: Math.round((s.pts * 1e6) / f.escala), data: new Uint8Array(buf, s.offset - a0, s.tamanho) }));
    }
    await dec.flush().catch((e) => { erro ??= e; });
    if (dec.state !== 'closed') dec.close();
    if (erro && !saiu) throw new Error(`não decodificou: ${erro.message || erro}`);
    if (melhor) { hashes.push(await hashDoQuadro(melhor, f.rotacao)); melhor.close(); }
  }
  return { hashes, bytes, codec: f.codec, duracaoMs: Math.round((fim * 1000) / f.escala) };
}
