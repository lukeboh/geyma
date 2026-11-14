// Converte as respostas dos sites em itens normalizados do inventário.
// Módulo puro: roda no navegador (extensão) e no Node (testes). Não guarda URLs,
// que expiram, nem conteúdo das fotos.

/** Decodifica campos *Enc do iCloud (base64 de texto UTF-8). Retorna null se não for texto. */
export function decodeEnc(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const bin = atob(value);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return /^[\p{L}\p{N}\p{P}\p{S}\p{Zs}]+$/u.test(text) ? text : null;
  } catch {
    return null;
  }
}

/** Extrai a lista de itens e o cursor de uma resposta de listagem do Google Fotos. */
export function parseGoogleBatchText(text) {
  const line = String(text)
    .split('\n')
    .find((l) => l.startsWith('[["wrb.fr"'));
  if (!line) return { items: [], cursor: null };
  const payload = JSON.parse(line)[0][2];
  if (!payload) return { items: [], cursor: null };
  return parseGoogleListData(JSON.parse(payload));
}

/** Mesmo que parseGoogleBatchText, a partir dos dados já decodificados. */
export function parseGoogleListData(data) {
  const raw = Array.isArray(data?.[0]) ? data[0] : [];
  const items = raw.map(normalizeGoogleItem).filter(Boolean);
  const cursor = typeof data?.[1] === 'string' && data[1] ? data[1] : null;
  return { items, cursor };
}

/** Item bruto do Google: [chave, [url, largura, altura, ...], captura_ms, sha1_b64url, fuso_ms, ...]. */
export function normalizeGoogleItem(it) {
  if (!Array.isArray(it) || typeof it[0] !== 'string' || !Array.isArray(it[1])) return null;
  const ts = Number(it[2]);
  if (!Number.isFinite(ts)) return null;
  return {
    id: `g:${it[0]}`,
    source: 'google',
    ts,
    tzOffset: typeof it[4] === 'number' ? it[4] : null,
    w: Number(it[1][1]) || null,
    h: Number(it[1][2]) || null,
    sha1: typeof it[3] === 'string' && it[3].length === 27 ? it[3] : null,
    // URL-base da imagem (exige a sessão do Google; acrescentar =w160-h160 etc.)
    thumb: typeof it[1][0] === 'string' && it[1][0].startsWith('https://') ? it[1][0] : null,
  };
}

const VIDEO_TYPES = /movie|mpeg-4|video|avi|3gpp/i;

/** Resposta de consulta do iCloud (CPLAssetAndMaster...) → itens, juntando asset e master. */
export function parseIcloudQuery(json) {
  const records = Array.isArray(json?.records) ? json.records : [];
  const masters = new Map();
  for (const r of records) if (r.recordType === 'CPLMaster') masters.set(r.recordName, r);
  const items = [];
  for (const r of records) {
    if (r.recordType !== 'CPLAsset') continue;
    const master = masters.get(r.fields?.masterRef?.value?.recordName);
    if (!master) continue;
    const item = normalizeIcloudPair(r, master);
    if (item) items.push(item);
  }
  return items;
}

export function normalizeIcloudPair(asset, master) {
  const a = (k) => asset.fields?.[k]?.value;
  const m = (k) => master.fields?.[k]?.value;
  const ts = Number(a('assetDate'));
  if (!Number.isFinite(ts)) return null;
  const fileType = m('itemType') || null;
  return {
    id: `a:${asset.recordName}`,
    source: 'icloud',
    ts,
    tzOffset: Number.isFinite(Number(a('timeZoneOffset'))) ? Number(a('timeZoneOffset')) * 1000 : null,
    w: Number(m('resOriginalWidth')) || null,
    h: Number(m('resOriginalHeight')) || null,
    size: Number(m('resOriginalFileSize')) || null,
    fileType,
    video: fileType ? VIDEO_TYPES.test(fileType) : false,
    filename: decodeEnc(m('filenameEnc')),
    fingerprint: m('resOriginalFingerprint') || null,
    edited: Number(a('adjustmentRenderType')) > 0,
    subtype: a('assetSubtypeV2') ?? a('assetSubtype') ?? null,
    burst: Number(a('burstFlags')) > 0,
    favorite: Number(a('isFavorite')) === 1,
    importedBy: decodeEnc(m('importedByBundleIdentifierEnc')),
    // miniatura JPEG (URL temporária assinada pela Apple); thumbAt diz quando foi vista
    thumb: typeof m('resJPEGThumbRes')?.downloadURL === 'string' ? m('resJPEGThumbRes').downloadURL : null,
    thumbAt: Date.now(),
  };
}

/** Contagens oficiais do iCloud (HyperionIndexCountLookup): pares [indice, total]. */
export function parseIcloudCounts(requestBody, json) {
  let ids = [];
  try {
    const filter = JSON.parse(requestBody).query.filterBy.find((f) => f.fieldName === 'indexCountID');
    ids = [].concat(filter.fieldValue.value);
  } catch {
    return [];
  }
  const values = (json?.records || []).map((r) => Number(r.fields?.itemCount?.value));
  return ids.map((id, i) => [String(id).replace(/^CPLAssetInSmartAlbumByAssetDate:/, ''), values[i]]).filter(([, v]) => Number.isFinite(v));
}

/** Resumo para o painel: total, período e contagem por ano. */
export function summarize(items) {
  const byYear = {};
  let min = Infinity;
  let max = -Infinity;
  let videos = 0;
  for (const it of items) {
    const y = new Date(it.ts).getUTCFullYear();
    byYear[y] = (byYear[y] || 0) + 1;
    if (it.ts < min) min = it.ts;
    if (it.ts > max) max = it.ts;
    if (it.video) videos++;
  }
  return {
    total: items.length,
    videos,
    from: items.length ? min : null,
    to: items.length ? max : null,
    byYear,
  };
}
