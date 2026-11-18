// Leitura mínima de MP4/MOV (0.9, quadros amostrados): acha o moov pelos
// trechos do arquivo (Range), e da faixa de vídeo tira o codec, a descrição
// para o decodificador (avcC/hvcC) e onde estão os quadros-chave. Assim o
// painel baixa só alguns quadros-chave de cada vídeo, não o vídeo inteiro.

const tipo = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

/** Caixas de um trecho: [{tipo, inicio, tamanho, cab}] (cab = tamanho do cabeçalho). */
export function caixas(buf, inicio = 0, fim = buf.byteLength) {
  const dv = new DataView(buf);
  const out = [];
  let o = inicio;
  while (o + 8 <= fim) {
    let tam = dv.getUint32(o);
    const t = tipo(dv, o + 4);
    let cab = 8;
    if (tam === 1) {
      if (o + 16 > fim) break;
      tam = Number(dv.getBigUint64(o + 8));
      cab = 16;
    } else if (tam === 0) tam = fim - o;
    if (tam < cab) break;
    out.push({ tipo: t, inicio: o, tamanho: tam, cab });
    o += tam;
  }
  return out;
}

const filha = (buf, cx, t, extra = 0) => caixas(buf, cx.inicio + cx.cab + extra, cx.inicio + cx.tamanho).find((c) => c.tipo === t);
const caminho = (buf, cx, ...ts) => ts.reduce((c, t) => c && filha(buf, c, t), cx);

/**
 * Onde está o moov, lendo só cabeçalhos de caixas do nível de cima.
 * @param ler (inicio, fim) => Promise<ArrayBuffer> (fim exclusivo)
 * @param tamanho tamanho total do arquivo
 * @returns {Promise<ArrayBuffer|null>} a caixa moov inteira
 */
export async function lerMoov(ler, tamanho) {
  let o = 0;
  for (let i = 0; i < 12 && o + 8 <= tamanho; i++) {
    const cab = await ler(o, Math.min(tamanho, o + 16));
    if (cab.byteLength < 8) return null;
    const dv = new DataView(cab);
    let tam = dv.getUint32(0);
    if (tam === 1 && cab.byteLength >= 16) tam = Number(dv.getBigUint64(8));
    else if (tam === 0) tam = tamanho - o;
    if (tam < 8) return null;
    if (tipo(dv, 4) === 'moov') return ler(o, o + tam);
    o += tam;
  }
  return null;
}

/** Codec no formato do WebCodecs a partir da caixa avcC (H.264). */
function codecAvc(u8) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `avc1.${h(u8[1])}${h(u8[2])}${h(u8[3])}`;
}

/** Codec no formato do WebCodecs a partir da caixa hvcC (HEVC), como o mp4box.js. */
function codecHevc(entrada, u8) {
  const espaco = ['', 'A', 'B', 'C'][u8[1] >> 6];
  const tier = (u8[1] >> 5) & 1 ? 'H' : 'L';
  const perfil = u8[1] & 0x1f;
  let compat = (u8[2] << 24) | (u8[3] << 16) | (u8[4] << 8) | u8[5];
  // os bits de compatibilidade vão invertidos
  let inv = 0;
  for (let i = 0; i < 32; i++) { inv = (inv << 1) | (compat & 1); compat >>>= 1; }
  const nivel = u8[12];
  const restr = [...u8.slice(6, 12)];
  while (restr.length && restr[restr.length - 1] === 0) restr.pop();
  return [entrada, `${espaco}${perfil}`, (inv >>> 0).toString(16).toUpperCase(), `${tier}${nivel}`, ...restr.map((b) => b.toString(16).toUpperCase())].join('.');
}

/**
 * Faixa de vídeo do moov.
 * @returns {{codec, descricao: Uint8Array, largura, altura, escala, duracao, amostras: {offset, tamanho, dts}[], chave: number[]} | null}
 *   chave: índices (base 0) das amostras que são quadros-chave
 */
export function faixaDeVideo(moov) {
  const raiz = caixas(moov)[0];
  if (!raiz || raiz.tipo !== 'moov') return null;
  const dv = new DataView(moov);
  for (const trak of caixas(moov, raiz.inicio + raiz.cab, raiz.inicio + raiz.tamanho).filter((c) => c.tipo === 'trak')) {
    const mdia = caminho(moov, trak, 'mdia');
    const hdlr = mdia && filha(moov, mdia, 'hdlr');
    if (!hdlr || tipo(dv, hdlr.inicio + hdlr.cab + 8) !== 'vide') continue;
    // rotação de exibição (matriz do tkhd): o iPhone grava o vídeo em pé deitado, com a matriz
    let rotacao = 0;
    const tkhd = filha(moov, trak, 'tkhd');
    if (tkhd) {
      const m = tkhd.inicio + tkhd.cab + (dv.getUint8(tkhd.inicio + tkhd.cab) === 1 ? 52 : 40);
      const a = dv.getInt32(m) / 65536;
      const b = dv.getInt32(m + 4) / 65536;
      rotacao = (Math.round((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360;
    }
    const mdhd = filha(moov, mdia, 'mdhd');
    const v1 = dv.getUint8(mdhd.inicio + mdhd.cab) === 1;
    const escala = dv.getUint32(mdhd.inicio + mdhd.cab + (v1 ? 20 : 12));
    const duracao = v1 ? Number(dv.getBigUint64(mdhd.inicio + mdhd.cab + 24)) : dv.getUint32(mdhd.inicio + mdhd.cab + 16);
    const stbl = caminho(moov, mdia, 'minf', 'stbl');
    if (!stbl) return null;
    // descrição: a primeira entrada do stsd (avc1/hvc1/hev1), com a avcC/hvcC dentro
    const stsd = filha(moov, stbl, 'stsd');
    const [ent] = caixas(moov, stsd.inicio + stsd.cab + 8, stsd.inicio + stsd.tamanho);
    if (!ent) return null;
    const largura = dv.getUint16(ent.inicio + ent.cab + 24);
    const altura = dv.getUint16(ent.inicio + ent.cab + 26);
    const conf = caixas(moov, ent.inicio + ent.cab + 78, ent.inicio + ent.tamanho).find((c) => c.tipo === 'avcC' || c.tipo === 'hvcC');
    if (!conf) return null;
    const descricao = new Uint8Array(moov.slice(conf.inicio + conf.cab, conf.inicio + conf.tamanho));
    const codec = conf.tipo === 'avcC' ? codecAvc(descricao) : codecHevc(ent.tipo, descricao);
    const ler32 = (cx, k) => dv.getUint32(cx.inicio + cx.cab + k);
    // tamanhos
    const stsz = filha(moov, stbl, 'stsz');
    const fixo = ler32(stsz, 4);
    const n = ler32(stsz, 8);
    const tamanhos = new Array(n);
    for (let i = 0; i < n; i++) tamanhos[i] = fixo || ler32(stsz, 12 + 4 * i);
    // pedaços (chunks)
    const stco = filha(moov, stbl, 'stco');
    const co64 = filha(moov, stbl, 'co64');
    const offs = [];
    if (stco) { const m = ler32(stco, 4); for (let i = 0; i < m; i++) offs.push(ler32(stco, 8 + 4 * i)); }
    else if (co64) { const m = ler32(co64, 4); for (let i = 0; i < m; i++) offs.push(Number(dv.getBigUint64(co64.inicio + co64.cab + 8 + 8 * i))); }
    const stsc = filha(moov, stbl, 'stsc');
    const ns = ler32(stsc, 4);
    const regras = [];
    for (let i = 0; i < ns; i++) regras.push({ primeiro: ler32(stsc, 8 + 12 * i) - 1, porChunk: ler32(stsc, 12 + 12 * i) });
    const amostras = [];
    let s = 0;
    for (let c = 0; c < offs.length && s < n; c++) {
      let r = regras[0];
      for (const x of regras) if (x.primeiro <= c) r = x;
      let o = offs[c];
      for (let k = 0; k < r.porChunk && s < n; k++, s++) { amostras.push({ offset: o, tamanho: tamanhos[s], dts: 0 }); o += tamanhos[s]; }
    }
    // tempos (stts)
    const stts = filha(moov, stbl, 'stts');
    const nt = ler32(stts, 4);
    let t = 0;
    let i = 0;
    for (let e = 0; e < nt; e++) {
      const cont = ler32(stts, 8 + 8 * e);
      const delta = ler32(stts, 12 + 8 * e);
      for (let k = 0; k < cont && i < amostras.length; k++, i++) { amostras[i].dts = t; t += delta; }
    }
    // tempo de apresentação (ctts): com quadros B, a ordem de exibição difere da de decodificação
    for (const a of amostras) a.pts = a.dts;
    const ctts = filha(moov, stbl, 'ctts');
    if (ctts) {
      const v1c = dv.getUint8(ctts.inicio + ctts.cab) === 1;
      const nc = ler32(ctts, 4);
      let j = 0;
      for (let e = 0; e < nc; e++) {
        const cont = ler32(ctts, 8 + 8 * e);
        const off = v1c ? dv.getInt32(ctts.inicio + ctts.cab + 12 + 8 * e) : ler32(ctts, 12 + 8 * e);
        for (let k = 0; k < cont && j < amostras.length; k++, j++) amostras[j].pts = amostras[j].dts + off;
      }
    }
    // quadros-chave (sem stss, todos são)
    const stss = filha(moov, stbl, 'stss');
    let chave;
    if (stss) { const m = ler32(stss, 4); chave = []; for (let k = 0; k < m; k++) chave.push(ler32(stss, 8 + 4 * k) - 1); }
    else chave = amostras.map((_, k) => k);
    return { codec, descricao, largura, altura, escala, duracao, rotacao, amostras, chave: chave.filter((k) => k < amostras.length) };
  }
  return null;
}

/** Até n quadros-chave espalhados pela duração (evita o primeiro e o último segundo, quando dá). */
export function quadrosEspalhados(faixa, n = 6) {
  const { chave, amostras, escala } = faixa;
  if (!chave.length) return [];
  if (chave.length <= n) return [...chave];
  const fim = amostras[amostras.length - 1].dts;
  const margem = Math.min(escala, fim / 10);
  const out = new Set();
  for (let k = 0; k < n; k++) {
    const alvo = margem + ((fim - 2 * margem) * (k + 0.5)) / n;
    let melhor = chave[0];
    for (const c of chave) if (Math.abs(amostras[c].dts - alvo) < Math.abs(amostras[melhor].dts - alvo)) melhor = c;
    out.add(melhor);
  }
  return [...out].sort((x, y) => x - y);
}

/** Fim do vídeo, na escala da faixa (o maior tempo de apresentação). */
export const fimDaFaixa = (f) => f.amostras.reduce((m, a) => Math.max(m, a.pts), 0);

/** Posições (fração da duração) dos quadros comparados nos mesmos instantes. */
export const POSICOES = [0.15, 0.35, 0.55, 0.75, 0.9];

/**
 * Para mostrar o quadro do instante `alvo` (na escala da faixa): decodifica do
 * quadro-chave anterior até um pouco depois do alvo (quadros B chegam fora de
 * ordem). Devolve os índices a decodificar, na ordem de decodificação.
 */
export function trechoAte(f, alvo, folga = 4) {
  const { amostras, chave } = f;
  let k = chave[0] ?? 0;
  for (const c of chave) if (amostras[c].pts <= alvo) k = c;
  let fim = k;
  while (fim + 1 < amostras.length && amostras[fim].dts < alvo) fim++;
  fim = Math.min(amostras.length - 1, fim + folga);
  // não passa do próximo quadro-chave (outro grupo de quadros)
  const prox = chave.find((c) => c > k);
  if (prox !== undefined) fim = Math.min(fim, prox - 1);
  const idx = [];
  for (let i = k; i <= fim; i++) idx.push(i);
  return idx;
}

const mediana = (l) => { const s = [...l].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };

/**
 * Compara os quadros de dois vídeos (pHash dos quadros nos mesmos instantes
 * relativos, POSICOES). Alinhados: quadro i com quadro i (mesmo vídeo inteiro).
 * Cruzados: para cada quadro, o mais parecido do outro vídeo (serve a um vídeo
 * cortado, cujos quadros aparecem em outra posição). Medido na biblioteca:
 * o mesmo vídeo dá de 0 a 2; vídeos diferentes, de 26 a 38.
 * @returns {{dist: number|null, alinhado: number|null, iguais: boolean|null, n: number}}
 *   iguais null = nem igual nem claramente diferente
 */
export function compararQuadros(hashesA, hashesG, hamming, igualMax = 10, diferenteMin = 22) {
  const n = Math.min(hashesA.length, hashesG.length);
  if (!n) return { dist: null, alinhado: null, iguais: null, n: 0 };
  const alinhado = hashesA.length === hashesG.length ? mediana(hashesA.map((h, i) => hamming(h, hashesG[i]) ?? 64)) : null;
  const [curto, longo] = hashesA.length <= hashesG.length ? [hashesA, hashesG] : [hashesG, hashesA];
  const dist = mediana(curto.map((h) => Math.min(...longo.map((o) => hamming(h, o) ?? 64))));
  const melhor = Math.min(dist, alinhado ?? 64);
  return { dist, alinhado, iguais: melhor <= igualMax ? true : melhor >= diferenteMin ? false : null, n };
}
