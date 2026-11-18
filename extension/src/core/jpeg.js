// Cabeçalho de um JPEG: tabelas de quantização (DQT) e quadro (SOF), lidas do
// começo do arquivo (bastam os primeiros 256 KB; o resto é a imagem).
//
// Serve para provar a recompressão: um JPEG recodificado (por exemplo, pelo
// "economia de espaço" do Google Fotos) sai com outras tabelas de
// quantização, mesmo quando a qualidade estimada parece igual. Mesmas tabelas
// e mesmo quadro: a mesma codificação (só os metadados podem ter mudado).
// Medido em 18/11/2026: original do iCloud com a codificação da câmera e a
// cópia do Google com outras tabelas e Huffman otimizado; nas cópias de
// mesmo tamanho, cabeçalhos idênticos.

// ordem zigue-zague → posição natural na tabela 8×8
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const SEM_TAMANHO = new Set([0x01, 0xD8, 0xD9, 0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7]);

/**
 * Lê os segmentos até o início da imagem (SOS). Devolve {tabelas: [{id, v[64]}],
 * quadro: {bits, h, w, componentes}} ou null se não for JPEG ou se o começo
 * não chegar até a imagem.
 */
export function cabecalhoJpeg(b) {
  if (!b || b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) return null;
  const tabelas = [];
  let quadro = null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; } // preenchimento
    if (SEM_TAMANHO.has(m)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xDA) return quadro && tabelas.length ? { tabelas, quadro } : null;
    if (i + 2 + len > b.length) return null;
    if (m === 0xDB) {
      for (let j = i + 4; j < i + 2 + len;) {
        const pq = b[j] >> 4;
        const id = b[j] & 15;
        j++;
        const v = new Array(64);
        for (let k = 0; k < 64; k++) v[ZZ[k]] = pq ? (b[j + 2 * k] << 8) | b[j + 2 * k + 1] : b[j + k];
        j += pq ? 128 : 64;
        tabelas.push({ id, v });
      }
    } else if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      quadro = { bits: b[i + 4], h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], componentes: b[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

const chave = (c) => JSON.stringify([c.quadro, [...c.tabelas].sort((x, y) => x.id - y.id).map((t) => t.v)]);

/**
 * Compara a codificação de dois JPEGs pelo começo dos arquivos:
 * 'mesma' (mesmas tabelas e mesmo quadro), 'recomprimida' (outras tabelas ou
 * outro quadro) ou null (algum dos dois não deu para ler).
 */
export function compararCodificacao(bytesA, bytesB) {
  const a = cabecalhoJpeg(bytesA);
  const b = cabecalhoJpeg(bytesB);
  if (!a || !b) return null;
  return chave(a) === chave(b) ? 'mesma' : 'recomprimida';
}
