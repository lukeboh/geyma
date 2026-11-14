// Hash perceptual (pHash) igual ao da biblioteca Python imagehash, usada nas
// medições da prova de acesso: cinza 32×32, DCT-II nas duas direções, bloco 8×8
// de baixa frequência, bit = coeficiente acima da mediana.
// Limites medidos: distância ≤ 10 = mesma imagem; 11–21 incerto; ≥ 22 diferente.

export const SAME_MAX = 10;
export const DIFFERENT_MIN = 22;

const N = 32;
const COS = (() => {
  const t = new Float64Array(N * N);
  for (let k = 0; k < N; k++) for (let n = 0; n < N; n++) t[k * N + n] = Math.cos((Math.PI * k * (2 * n + 1)) / (2 * N));
  return t;
})();

/** Cinza (0–255) a partir de RGBA 32×32, com os pesos do modo "L" do Pillow. */
export function grayFromRgba(data) {
  const g = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const o = i * 4;
    g[i] = (data[o] * 299 + data[o + 1] * 587 + data[o + 2] * 114) / 1000;
  }
  return g;
}

/** pHash de uma matriz de cinza 32×32 (linha a linha) → 16 dígitos hexadecimais. */
export function phashFromGray(gray) {
  if (gray.length !== N * N) throw new Error('esperado 32×32');
  // DCT nas colunas (axis=0), só as 8 primeiras frequências
  const cols = new Float64Array(8 * N);
  for (let k = 0; k < 8; k++) {
    for (let x = 0; x < N; x++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += gray[y * N + x] * COS[k * N + y];
      cols[k * N + x] = 2 * s;
    }
  }
  // DCT nas linhas (axis=1), bloco 8×8
  const low = new Float64Array(64);
  for (let r = 0; r < 8; r++) {
    for (let k = 0; k < 8; k++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += cols[r * N + x] * COS[k * N + x];
      low[r * 8 + k] = 2 * s;
    }
  }
  const sorted = [...low].sort((a, b) => a - b);
  const median = (sorted[31] + sorted[32]) / 2;
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let b = 0; b < 4; b++) nib = (nib << 1) | (low[i + b] > median ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}

const POP = Array.from({ length: 16 }, (_, i) => (i & 1) + ((i >> 1) & 1) + ((i >> 2) & 1) + ((i >> 3) & 1));

/** Distância de Hamming entre dois pHash em hexadecimal. */
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return null;
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POP[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}
