// SHA-1 aos poucos (pedaço por pedaço), para arquivos grandes: o WebCrypto só
// calcula o SHA-1 de um bloco inteiro na memória. Usado no envio direto de
// vídeos (src/page/envio.js): a página baixa o original do iCloud para um
// Blob (que o Chrome guarda em disco) e calcula o SHA-1 lendo o Blob em
// pedaços, para a conferência da chegada no Google. Módulo puro.

const rotl = (x, n) => (x << n) | (x >>> (32 - n));

export class Sha1 {
  constructor() {
    this.h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
    this.buf = new Uint8Array(64);
    this.nbuf = 0;
    this.len = 0; // bytes
    this.w = new Int32Array(80);
  }

  bloco(b, o) {
    const w = this.w;
    for (let i = 0; i < 16; i++) w[i] = (b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3];
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, bb, c, d, e] = this.h;
    for (let i = 0; i < 80; i++) {
      let f;
      let k;
      if (i < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d; d = c; c = rotl(bb, 30); bb = a; a = t;
    }
    this.h[0] = (this.h[0] + a) | 0;
    this.h[1] = (this.h[1] + bb) | 0;
    this.h[2] = (this.h[2] + c) | 0;
    this.h[3] = (this.h[3] + d) | 0;
    this.h[4] = (this.h[4] + e) | 0;
  }

  /** Acrescenta bytes (Uint8Array). */
  update(bytes) {
    let i = 0;
    this.len += bytes.length;
    if (this.nbuf) {
      while (this.nbuf < 64 && i < bytes.length) this.buf[this.nbuf++] = bytes[i++];
      if (this.nbuf < 64) return this;
      this.bloco(this.buf, 0);
      this.nbuf = 0;
    }
    for (; i + 64 <= bytes.length; i += 64) this.bloco(bytes, i);
    while (i < bytes.length) this.buf[this.nbuf++] = bytes[i++];
    return this;
  }

  /** Resultado: 20 bytes. */
  digest() {
    const bits = this.len * 8;
    const fim = new Uint8Array(this.nbuf < 56 ? 64 : 128);
    fim.set(this.buf.subarray(0, this.nbuf));
    fim[this.nbuf] = 0x80;
    const dv = new DataView(fim.buffer);
    dv.setUint32(fim.length - 8, Math.floor(bits / 2 ** 32));
    dv.setUint32(fim.length - 4, bits >>> 0);
    for (let o = 0; o < fim.length; o += 64) this.bloco(fim, o);
    const out = new Uint8Array(20);
    const odv = new DataView(out.buffer);
    this.h.forEach((v, j) => odv.setUint32(4 * j, v >>> 0));
    return out;
  }
}

/** SHA-1 em base64url sem preenchimento (27 caracteres), como a listagem do Google. */
export function base64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * SHA-1 de um Blob lido em pedaços (memória baixa mesmo num vídeo de
 * gigabytes). aoAndar(feitos, total) é chamado a cada pedaço.
 */
export async function sha1DoBlob(blob, aoAndar = null) {
  const h = new Sha1();
  const leitor = blob.stream().getReader();
  let feitos = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    h.update(value);
    feitos += value.length;
    aoAndar?.(feitos, blob.size);
  }
  return base64Url(h.digest());
}
