// Cota de armazenamento dos dois serviços (0.7), lida sem consultas próprias:
// Google: o texto "Armazenamento usado: 1,7 TB de 5 TB" que a própria página
// do Google Fotos mostra no menu. iCloud: a resposta de storageUsageInfo que o
// próprio site do iCloud busca ao abrir (observação passiva, hook.js).

const UNIDADE = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
const numero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

/**
 * Lê o texto de armazenamento da página do Google ("Armazenamento usado: 1,7 TB
 * de 5 TB", ou em inglês "1.7 TB of 5 TB used").
 * @returns {{usado: number, total: number, aproximado: true} | null}
 */
export function lerCotaGoogle(texto) {
  const t = String(texto || '');
  const pt = t.match(/([\d.,]+)\s*(B|KB|MB|GB|TB)\s+de\s+([\d.,]+)\s*(B|KB|MB|GB|TB)/i);
  const en = !pt && t.match(/([\d.]+)\s*(B|KB|MB|GB|TB)\s+of\s+([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  const m = pt || en;
  if (!m) return null;
  const conv = pt ? numero : Number;
  const usado = conv(m[1]) * UNIDADE[m[2].toUpperCase()];
  const total = conv(m[3]) * UNIDADE[m[4].toUpperCase()];
  if (!(total > 0) || !(usado >= 0)) return null;
  // o texto arredonda (1,7 TB): o erro é de até meia casa decimal
  return { usado, total, aproximado: true };
}

/**
 * Lê a resposta de storageUsageInfo do iCloud.
 * @returns {{usado: number, total: number} | null}
 */
export function lerCotaIcloud(json) {
  const s = json?.storageUsageInfo;
  const total = Number(s?.totalStorageInBytes);
  const usado = Number(s?.usedStorageInBytes);
  if (!(total > 0) || !(usado >= 0)) return null;
  return { usado, total };
}

// folga: 1% do total ou 2 GB, o que for maior (e a imprecisão do texto do Google)
export const FOLGA_MIN = 2 * 1024 ** 3;
const folgaDe = (c) => Math.max(FOLGA_MIN, c.total * 0.01) + (c.aproximado ? margemTexto(c.total) : 0);
// o texto mostra uma casa decimal na unidade do total: erro de até 0,05 unidade
const margemTexto = (total) => {
  const u = total >= UNIDADE.TB ? UNIDADE.TB : total >= UNIDADE.GB ? UNIDADE.GB : UNIDADE.MB;
  return 0.05 * u;
};

/**
 * Cabe? bytes a enviar contra o espaço livre do destino, com folga.
 * @param cota {usado, total, aproximado?} ou null (desconhecida)
 * @returns {{ok: boolean|null, livre: number|null, falta: number}}
 *   ok null = cota desconhecida (o envio pode seguir, com aviso)
 */
export function cabeNaCota(cota, bytes) {
  if (!cota) return { ok: null, livre: null, falta: 0 };
  const livre = Math.max(0, cota.total - cota.usado - folgaDe(cota));
  return { ok: bytes <= livre, livre, falta: Math.max(0, bytes - livre) };
}

/** Cota guardada há mais de um dia não vale para decidir. */
export const COTA_VALIDA_MS = 24 * 60 * 60 * 1000;
