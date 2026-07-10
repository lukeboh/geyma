// Estimativa de tempo de sincronização.
//
// Modelo: uma cópia de N fotos somando B bytes é limitada por dois gargalos —
// a banda média (MB/s) e a taxa de processamento por item (fotos/s, que cobre
// latência de API, geração de miniaturas etc.). O tempo estimado é o maior dos
// dois, pois o gargalo domina.
//
// A Picker API do Google não expõe o tamanho em bytes dos arquivos, então o
// volume Google→Apple é estimado a partir do tamanho médio observado no acervo
// Apple (ou 3,5 MB por foto quando não há amostra).

export const DEFAULT_AVG_PHOTO_BYTES = 3.5 * 1024 * 1024;

export function averageSize(records) {
  let total = 0;
  let counted = 0;
  for (const record of records) {
    if (record.size > 0) {
      total += record.size;
      counted += 1;
    }
  }
  return counted > 0 ? total / counted : null;
}

// Retorna os dois planos unidirecionais a partir do resultado de compare().
export function buildPlans(result, appleRecords) {
  const avg = averageSize(appleRecords) ?? DEFAULT_AVG_PHOTO_BYTES;

  const toApple = {
    count: result.onlyGoogle.length,
    bytes: result.onlyGoogle.length * avg, // tamanhos do Google são estimados
    estimated: true,
  };

  let appleBytes = 0;
  for (const item of result.onlyApple) {
    appleBytes += item.size > 0 ? item.size : avg;
  }
  const toGoogle = {
    count: result.onlyApple.length,
    bytes: appleBytes,
    estimated: false,
  };

  return { toApple, toGoogle };
}

export function estimateSeconds(plan, mbPerSecond, photosPerSecond) {
  if (plan.count === 0) return 0;
  const byBandwidth = plan.bytes / (mbPerSecond * 1024 * 1024);
  const byRate = plan.count / photosPerSecond;
  return Math.max(byBandwidth, byRate);
}

export function formatDuration(seconds) {
  if (seconds === 0) return 'nada a copiar';
  if (seconds < 1) return '< 1 s';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min ${s % 60 ? `${s % 60} s` : ''}`.trim();
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24 ? `${hours % 24} h` : ''}`.trim();
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 2 ** (10 * power);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${units[power]}`;
}
