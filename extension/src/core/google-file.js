// Ficha do arquivo guardado no Google Fotos: formato, tamanho e nome do
// original, lidos do cabeçalho do download (pedido HEAD: nada é baixado).
// A listagem do Google não traz isso; com a ficha dá para dizer se a cópia do
// Google é o original (HEIC do iPhone, por exemplo) ou uma cópia convertida
// (JPEG de uma exportação ou de um compartilhamento), e o nome ajuda a
// reconhecer a mesma foto. O arquivo entregue pelo download difere do
// guardado em poucos bytes (o Google reescreve metadados; medido em 18/11):
// o SHA-1 dele não confere com o da listagem, que é o do arquivo enviado.
// Não vale para vídeos (o download sem sufixo de vídeo devolve a capa).

const TIPOS = {
  'image/heic': 'HEIC', 'image/heif': 'HEIF', 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/gif': 'GIF',
  'image/webp': 'WEBP', 'image/tiff': 'TIFF', 'image/x-adobe-dng': 'DNG', 'video/quicktime': 'MOV', 'video/mp4': 'MP4',
};

/** Nome do arquivo de um Content-Disposition (filename*= ou filename=). */
export function nomeDoArquivo(disp) {
  if (typeof disp !== 'string') return null;
  const estrela = disp.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (estrela) { try { return decodeURIComponent(estrela[1].trim().replace(/^"|"$/g, '')); } catch { /* segue */ } }
  const simples = disp.match(/filename="?([^";]+)"?/i);
  return simples ? simples[1].trim() : null;
}

/** Ficha a partir dos cabeçalhos ({get(nome)}). */
export function fichaDoCabecalho(headers, at = Date.now()) {
  const tipo = (headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null;
  const bytes = Number(headers.get('content-length')) || null;
  return { tipo, formato: TIPOS[tipo] || (tipo ? tipo.split('/')[1]?.toUpperCase() : null), bytes, nome: nomeDoArquivo(headers.get('content-disposition')), at };
}

/** Nome sem extensão e sem sufixos de cópia ("IMG_8437 (1).jpg" → "img_8437"). */
export function radical(nome) {
  if (typeof nome !== 'string' || !nome) return null;
  return nome.replace(/\.[^.]+$/, '').replace(/\s*\(\d+\)$/, '').replace(/[-_ ]?(edited|editado)$/i, '').trim().toLowerCase() || null;
}

/** As duas versões vêm do mesmo arquivo de origem (mesmo nome, extensões à parte)? */
export const mesmoNome = (a, gFile) => Boolean(radical(a?.filename) && radical(a.filename) === radical(gFile?.nome));

// Mesmo formato e mesmas dimensões, mas o arquivo do Google abaixo de 90% do
// original: recomprimido. Medido em 18/11/2026 nos pares JPEG × JPEG: as
// cópias fiéis ficam entre 99% e 101% (o Google só reescreve metadados) e as
// recomprimidas, em geral, entre 50% e 70%; quase nada no meio.
export const LIMIAR_RECOMPRESSAO = 0.9;

const mesmasDims = (a, g) => Boolean(a?.w && g?.w) && ((a.w === g.w && a.h === g.h) || (a.w === g.h && a.h === g.w));

/**
 * Como o Google guarda esta foto, comparada com o iCloud:
 * 'original' (mesmo formato, arquivo do mesmo tamanho), 'recomprimida'
 * (mesmo formato e dimensões, arquivo bem menor; ou provado pela comparação
 * das tabelas de quantização com o original), 'convertida' (outro formato,
 * por exemplo HEIC no iCloud e JPEG no Google) ou null (sem ficha).
 */
export function copiaNoGoogle(a, g) {
  const f = g?.file;
  // vídeos: o download sem sufixo de vídeo devolve a capa (JPEG), não o arquivo
  if (!f?.formato || a?.video || g?.video) return null;
  const fa = String(a?.fileType || '').toLowerCase();
  const formatoA = fa.includes('heic') || fa.includes('heif') ? 'HEIC' : fa.includes('jpeg') ? 'JPEG' : fa.includes('png') ? 'PNG' : null;
  if (!formatoA) return null;
  // HEIC e HEIF são o mesmo formato (o Google às vezes rotula o HEIC do iPhone como image/heif)
  const formatoG = f.formato === 'HEIF' ? 'HEIC' : f.formato;
  if (formatoA !== formatoG) return 'convertida';
  // conferida pelos originais (amostragem): a prova vale mais que o tamanho
  if (f.codificacao === 'recomprimida') return 'recomprimida';
  if (f.codificacao === 'mesma') return 'original';
  // foto editada: o Google pode guardar a versão editada, de outro tamanho
  if (!a.edited && mesmasDims(a, g) && a.size && f.bytes && f.bytes < LIMIAR_RECOMPRESSAO * a.size) return 'recomprimida';
  return 'original';
}
