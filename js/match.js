// Motor de validação cruzada entre os dois acervos.
//
// Estratégia: o identificador mais estável entre plataformas é o nome do
// arquivo original (IMG_1234, DSC0042…), que ambas preservam. A comparação
// usa o nome normalizado (sem extensão, sem sufixos de cópia/edição) como
// chave primária e a data de captura como critério de desempate/confirmação.
//
// HEIC no iCloud costuma aparecer como JPG no Google (e vice-versa), por isso
// a extensão fica fora da chave.

const DATE_TOLERANCE_MS = 26 * 60 * 60 * 1000; // ±26h absorve fusos e horário de verão

export function normalizeKey(filename) {
  let base = filename.toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot > 0) base = base.slice(0, dot);
  base = base
    .replace(/\s*\((\d+)\)$/, '')   // "IMG_1 (2)" → cópias de download
    .replace(/[-_ ]?copy$/i, '')    // "IMG_1 copy"
    .replace(/[-_]edited$/i, '')    // sufixo de edição do Google
    .replace(/^img_e(\d+)$/i, 'img_$1'); // iOS: IMG_E1234 é a versão editada de IMG_1234
  return base;
}

function groupByKey(records) {
  const map = new Map();
  for (const record of records) {
    const key = normalizeKey(record.filename);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function datesClose(a, b) {
  const ta = Date.parse(a.createTime);
  const tb = Date.parse(b.createTime);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null; // sem como comparar
  return Math.abs(ta - tb) <= DATE_TOLERANCE_MS;
}

// Retorna { matched, onlyGoogle, onlyApple, uncertain }
//   matched   — presente nos dois acervos (nome bate e datas compatíveis ou indisponíveis)
//   uncertain — nome bate mas as datas divergem além da tolerância
export function compare(googlePhotos, applePhotos) {
  const googleByKey = groupByKey(googlePhotos);
  const appleByKey = groupByKey(applePhotos);

  const matched = [];
  const uncertain = [];
  const onlyGoogle = [];
  const onlyApple = [];

  for (const [key, googleItems] of googleByKey) {
    const appleItems = appleByKey.get(key);
    if (!appleItems) {
      onlyGoogle.push(...googleItems);
      continue;
    }
    for (const g of googleItems) {
      const exact = appleItems.find((a) => datesClose(g, a) !== false);
      if (exact) {
        matched.push({ google: g, apple: exact, key });
      } else {
        uncertain.push({
          google: g,
          apple: appleItems[0],
          key,
          reason: 'Mesmo nome de arquivo, mas datas de captura divergentes.',
        });
      }
    }
  }

  for (const [key, appleItems] of appleByKey) {
    if (!googleByKey.has(key)) onlyApple.push(...appleItems);
  }

  return { matched, uncertain, onlyGoogle, onlyApple };
}

export function toCsv({ matched, uncertain, onlyGoogle, onlyApple }) {
  const rows = [['status', 'arquivo', 'data', 'origem', 'detalhes']];
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  for (const item of onlyGoogle) {
    rows.push(['somente_google', item.filename, item.createTime, 'google', item.mimeType]);
  }
  for (const item of onlyApple) {
    rows.push(['somente_apple', item.filename, item.createTime, 'apple', item.path]);
  }
  for (const pair of uncertain) {
    rows.push(['incerto', pair.google.filename, pair.google.createTime, 'google+apple', pair.reason]);
  }
  for (const pair of matched) {
    rows.push(['em_ambos', pair.google.filename, pair.google.createTime, 'google+apple', pair.apple.path]);
  }

  return rows.map((row) => row.map(esc).join(',')).join('\r\n');
}
