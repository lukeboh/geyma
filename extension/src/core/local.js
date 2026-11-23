// Pasta local (0.10): um diretório do notebook, de um HD externo ou de um NAS
// montado na rede (unidade mapeada, compartilhamento SMB) como terceira fonte
// do cruzamento. Módulo puro: roda no navegador e no Node (testes).
//
// Lê só o começo de cada arquivo: o EXIF de JPEG e HEIC (instante da captura,
// fuso, dimensões) e o mvhd de MOV/MP4 (instante e duração). Nada é enviado
// a lugar nenhum e nenhum arquivo da pasta é alterado.
//
// Identidade com os serviços, da prova mais forte para a mais fraca:
// - 'arquivo': mesmo nome (radical, sem extensão e sufixos de cópia) e mesmo
//   tamanho em bytes do original do iCloud (o iCloud informa os dois);
// - 'instante': o mesmo segundo de captura (instante, ou a hora local quando
//   o EXIF não traz o fuso) e dimensões compatíveis, foto com foto e vídeo
//   com vídeo.

import { dimRelation } from './match.js';
import { radical } from './google-file.js';
import { ehVideo } from './normalize.js';
import { caixas } from './mp4.js';

export const TOLERANCIA_MS = 1000;

const FOTO_EXT = /\.(jpe?g|heic|heif|png|gif|webp|tiff?|bmp|dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i;
const VIDEO_EXT = /\.(mov|mp4|m4v|avi|3gp|3g2|mpe?g|mkv|wmv|webm|mts|m2ts)$/i;

/** Arquivo de foto ou vídeo pelo nome (ignora os ocultos e os do sistema). */
export const ehMidia = (nome) => typeof nome === 'string' && !nome.startsWith('.') && (FOTO_EXT.test(nome) || VIDEO_EXT.test(nome));

/** Pastas que não fazem parte da biblioteca (lixeiras, miniaturas do NAS, sistema). */
export const pastaIgnorada = (nome) => /^(\.|@eaDir$|#recycle$|\$RECYCLE\.BIN$|System Volume Information$|\.Trash)/i.test(nome);

// ---------------------------------------------------------------- EXIF (TIFF)

/** "AAAA:MM:DD HH:MM:SS" → milissegundos da hora local tratada como UTC. */
function horaDoExif(s, subseg) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m || m[1] === '0000') return null;
  const ms = /^\d+$/.test(subseg || '') ? Math.round(Number(`0.${subseg}`) * 1000) : 0;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], ms);
  return Number.isFinite(t) ? t : null;
}

/** "+03:00" / "-03:00" → milissegundos. */
function fusoDoExif(s) {
  const m = /^([+-])(\d{2}):(\d{2})/.exec(s || '');
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 3600000 + +m[3] * 60000) : null;
}

/**
 * Lê um bloco TIFF (o EXIF). dv: DataView; base: início do cabeçalho TIFF.
 * @returns {{wall, tzOffset, w, h} | null} wall = hora local da captura como se fosse UTC
 */
export function lerTiff(dv, base) {
  if (base + 8 > dv.byteLength) return null;
  const ordem = dv.getUint16(base);
  const le = ordem === 0x4949;
  if (!le && ordem !== 0x4d4d) return null;
  const tags = {};
  const ascii = (off, n) => {
    let s = '';
    for (let i = 0; i < n && off + i < dv.byteLength; i++) {
      const c = dv.getUint8(off + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const lerIfd = (off) => {
    const ini = base + off;
    if (off <= 0 || ini + 2 > dv.byteLength) return;
    const n = dv.getUint16(ini, le);
    for (let i = 0; i < n; i++) {
      const e = ini + 2 + i * 12;
      if (e + 12 > dv.byteLength) return;
      const tag = dv.getUint16(e, le);
      const tipo = dv.getUint16(e + 2, le);
      const cont = dv.getUint32(e + 4, le);
      if (tipo === 2) tags[tag] = ascii(cont <= 4 ? e + 8 : base + dv.getUint32(e + 8, le), cont);
      else if (tipo === 3) tags[tag] = dv.getUint16(e + 8, le);
      else if (tipo === 4) tags[tag] = dv.getUint32(e + 8, le);
    }
  };
  lerIfd(dv.getUint32(base + 4, le));
  if (tags[0x8769]) lerIfd(tags[0x8769]); // IFD do EXIF
  const wall = horaDoExif(tags[0x9003] || tags[0x9004], tags[0x9291] || tags[0x9292]); // DateTimeOriginal / Digitized + SubSec
  const tzOffset = fusoDoExif(tags[0x9011] || tags[0x9012]); // OffsetTimeOriginal / Digitized
  return { wall, tzOffset, w: tags[0xa002] || null, h: tags[0xa003] || null };
}

/** EXIF de um JPEG (primeiros ~128 KB). Dimensões do quadro (SOF) quando o EXIF não traz. */
export function exifJpeg(u8) {
  if (!u8 || u8.length < 4 || u8[0] !== 0xff || u8[1] !== 0xd8) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let out = null;
  let sof = null;
  let i = 2;
  while (i + 4 <= u8.length) {
    if (u8[i] !== 0xff) break;
    const m = u8[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xda || m === 0xd9) break;
    const len = dv.getUint16(i + 2);
    if (m === 0xe1 && !out && i + 10 <= u8.length && dv.getUint32(i + 4) === 0x45786966 && dv.getUint16(i + 8) === 0) out = lerTiff(dv, i + 10);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc && i + 9 <= u8.length) sof = { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
    i += 2 + len;
  }
  if (!out && !sof) return null;
  out ??= { wall: null, tzOffset: null, w: null, h: null };
  if ((!out.w || !out.h) && sof) { out.w = sof.w; out.h = sof.h; }
  return out;
}

/**
 * Onde fica o EXIF dentro de um HEIC (caixa meta: iinf + iloc), a partir do
 * começo do arquivo. @returns {{inicio, tamanho} | null}
 */
export function posicaoExifHeic(u8) {
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  const dv = new DataView(buf);
  const topo = caixas(buf);
  if (topo[0]?.tipo !== 'ftyp') return null;
  const meta = topo.find((c) => c.tipo === 'meta');
  if (!meta) return null;
  const filhas = caixas(buf, meta.inicio + meta.cab + 4, Math.min(buf.byteLength, meta.inicio + meta.tamanho));
  const iinf = filhas.find((c) => c.tipo === 'iinf');
  const iloc = filhas.find((c) => c.tipo === 'iloc');
  if (!iinf || !iloc) return null;
  // item do tipo 'Exif'
  let p = iinf.inicio + iinf.cab;
  const vI = dv.getUint8(p);
  p += 4;
  p += vI === 0 ? 2 : 4; // quantidade de entradas
  let exifId = null;
  for (const infe of caixas(buf, p, iinf.inicio + iinf.tamanho)) {
    if (infe.tipo !== 'infe') continue;
    const q = infe.inicio + infe.cab;
    const v = dv.getUint8(q);
    if (v < 2) continue;
    const id = v === 2 ? dv.getUint16(q + 4) : dv.getUint32(q + 4);
    const t = q + 4 + (v === 2 ? 2 : 4) + 2;
    if (String.fromCharCode(dv.getUint8(t), dv.getUint8(t + 1), dv.getUint8(t + 2), dv.getUint8(t + 3)) === 'Exif') { exifId = id; break; }
  }
  if (exifId === null) return null;
  // localização do item
  let q = iloc.inicio + iloc.cab;
  const v = dv.getUint8(q);
  q += 4;
  const a = dv.getUint8(q);
  const b = dv.getUint8(q + 1);
  const offSize = a >> 4;
  const lenSize = a & 15;
  const baseSize = b >> 4;
  const idxSize = v === 1 || v === 2 ? b & 15 : 0;
  q += 2;
  const ler = (n) => {
    let x = 0;
    for (let k = 0; k < n; k++) x = x * 256 + dv.getUint8(q + k);
    q += n;
    return x;
  };
  const n = v < 2 ? ler(2) : ler(4);
  for (let k = 0; k < n; k++) {
    const id = v < 2 ? ler(2) : ler(4);
    if (v === 1 || v === 2) ler(2); // método de construção
    ler(2); // índice da referência de dados
    const baseOff = ler(baseSize);
    const ext = ler(2);
    let primeiro = null;
    for (let e = 0; e < ext; e++) {
      if (idxSize) ler(idxSize);
      const off = ler(offSize);
      const len = ler(lenSize);
      primeiro ??= { inicio: baseOff + off, tamanho: len };
    }
    if (id === exifId) return primeiro;
  }
  return null;
}

/** EXIF a partir do conteúdo do item Exif de um HEIC (4 bytes de deslocamento + TIFF). */
export function exifDoItemHeic(u8) {
  if (!u8 || u8.length < 12) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return lerTiff(dv, 4 + dv.getUint32(0));
}

/** Instante (UTC) e duração de um MOV/MP4 pela caixa mvhd da caixa moov. */
export function mvhd(moovBuf) {
  const moov = caixas(moovBuf)[0];
  if (!moov || moov.tipo !== 'moov') return null;
  const cx = caixas(moovBuf, moov.inicio + moov.cab, moov.inicio + moov.tamanho).find((c) => c.tipo === 'mvhd');
  if (!cx) return null;
  const dv = new DataView(moovBuf);
  const p = cx.inicio + cx.cab;
  const v = dv.getUint8(p);
  const criado = v === 1 ? Number(dv.getBigUint64(p + 4)) : dv.getUint32(p + 4);
  const escala = v === 1 ? dv.getUint32(p + 20) : dv.getUint32(p + 12);
  const dur = v === 1 ? Number(dv.getBigUint64(p + 24)) : dv.getUint32(p + 16);
  // segundos desde 1904-01-01 UTC; zero = câmera sem relógio
  const ts = criado > 0 ? Date.UTC(1904, 0, 1) + criado * 1000 : null;
  return { ts, durMs: escala ? Math.round((dur / escala) * 1000) : null };
}

// ------------------------------------------------------------------ inventário

/**
 * Item do inventário a partir do arquivo e do que foi lido dele.
 * @param f {path, name, size, lastModified}
 * @param meta {wall, tzOffset, w, h} do EXIF, ou {ts, durMs} do vídeo, ou null
 */
export function normalizarLocal(f, meta) {
  const video = VIDEO_EXT.test(f.name);
  const it = {
    id: `l:${f.path}`,
    source: 'local',
    path: f.path,
    filename: f.name,
    size: f.size ?? null,
    mtime: f.lastModified ?? null,
    video,
    w: meta?.w || null,
    h: meta?.h || null,
    wall: null,
    tzOffset: null,
    ts: null,
    tsFonte: null,
  };
  if (meta?.wall != null) {
    it.wall = meta.wall;
    it.tzOffset = meta.tzOffset ?? null;
    // sem o fuso no EXIF, o instante exato não é conhecido: só a hora local
    it.ts = it.tzOffset != null ? meta.wall - it.tzOffset : meta.wall;
    it.tsFonte = it.tzOffset != null ? 'exif' : 'exif-local';
  } else if (meta?.ts != null) {
    it.ts = meta.ts;
    it.tsFonte = 'video';
    if (meta.durMs) it.durMs = meta.durMs;
  } else if (f.lastModified) {
    // data do arquivo: só serve para o gráfico, não para a identidade
    it.ts = f.lastModified;
    it.tsFonte = 'arquivo';
  }
  return it;
}

/** Resumo da pasta: total, fotos, vídeos, período e quantos sem data de captura. */
export function resumoLocal(itens) {
  let de = Infinity;
  let ate = -Infinity;
  let videos = 0;
  let semData = 0;
  for (const it of itens) {
    if (it.video) videos++;
    if (!it.tsFonte || it.tsFonte === 'arquivo') { semData++; continue; }
    if (it.ts < de) de = it.ts;
    if (it.ts > ate) ate = it.ts;
  }
  return { total: itens.length, videos, semData, de: Number.isFinite(de) ? de : null, ate: Number.isFinite(ate) ? ate : null };
}

// -------------------------------------------------------------------- cruzamento

const seg = (t) => Math.floor(t / 1000);

function indice(itens) {
  const porInstante = new Map();
  const porHora = new Map();
  const porNome = new Map();
  const add = (m, k, x) => { let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(x); };
  for (const x of itens) {
    if (Number.isFinite(x.ts)) add(porInstante, seg(x.ts), x);
    if (Number.isFinite(x.ts) && x.tzOffset != null) add(porHora, seg(x.ts + x.tzOffset), x);
    const r = radical(x.filename || x.file?.nome);
    if (r) add(porNome, r, x);
  }
  return { porInstante, porHora, porNome };
}

const fotoOuVideo = (l, x) => (x.source === 'google' && !(x.extrasLidos || x.video)) || ehVideo(l) === ehVideo(x);
const dimsOk = (l, x) => !l.w || !l.h || !x.w || !x.h || dimRelation(l, x) !== null;

/**
 * Melhor correspondente de um item da pasta num serviço.
 * @returns {{x, prova: 'arquivo'|'instante', dt?: number, varios?: boolean} | null}
 */
function acharEm(l, idx) {
  const r = radical(l.filename);
  // mesmo arquivo: nome e tamanho (o iCloud informa os dois; o Google, na ficha)
  for (const x of (r && idx.porNome.get(r)) || []) {
    const bytes = x.source === 'google' ? x.file?.bytes : x.size;
    if (bytes && l.size === bytes) return { x, prova: 'arquivo' };
  }
  if (!l.tsFonte || l.tsFonte === 'arquivo') return null;
  const achados = new Map();
  const olhar = (mapa, alvo, campo, filtro = null) => {
    for (const k of [seg(alvo) - 1, seg(alvo), seg(alvo) + 1]) {
      for (const x of mapa.get(k) || []) {
        if (filtro && !filtro(x)) continue;
        const t = campo === 'hora' ? x.ts + x.tzOffset : x.ts;
        const dt = Math.abs(t - alvo);
        if (dt <= TOLERANCIA_MS && fotoOuVideo(l, x) && dimsOk(l, x) && !(achados.get(x.id)?.dt <= dt)) achados.set(x.id, { x, dt });
      }
    }
  };
  if (l.tsFonte === 'exif-local') {
    // sem fuso: a hora local da foto contra a hora local do serviço
    olhar(idx.porHora, l.wall, 'hora');
    // serviço sem o fuso guardado: o instante dele costuma ser a hora local
    olhar(idx.porInstante, l.wall, 'instante', (x) => x.tzOffset == null);
  } else {
    olhar(idx.porInstante, l.ts, 'instante');
  }
  if (!achados.size) return null;
  const lista = [...achados.values()].sort((p, q) =>
    (radical(q.x.filename || q.x.file?.nome) === r) - (radical(p.x.filename || p.x.file?.nome) === r)
    || (dimRelation(q.x, l) === 'igual') - (dimRelation(p.x, l) === 'igual')
    || p.dt - q.dt);
  return { x: lista[0].x, prova: 'instante', dt: lista[0].dt, ...(lista.length > 1 ? { varios: true } : {}) };
}

/**
 * Cruza a pasta com os dois serviços.
 * @param local itens da pasta (normalizarLocal)
 * @param google itens do Google; icloud itens do iCloud (já sem ocultas: paraCruzar)
 * @returns {{linhas, resumo}} linhas: uma por item da pasta, {l, g, a, provaG, provaA, cls}
 *   cls: 'tres' (nos dois serviços), 'soGoogle', 'soIcloud', 'soPasta', 'semData'
 */
export function cruzarLocal(local, google, icloud) {
  const ig = indice(google);
  const ia = indice(icloud);
  const usadosG = new Set();
  const usadosA = new Set();
  const linhas = [];
  const resumo = { total: local.length, tres: 0, soGoogle: 0, soIcloud: 0, soPasta: 0, semData: 0, varios: 0, porArquivo: 0, googleSemCopia: 0, icloudSemCopia: 0, de: null, ate: null };
  for (const l of local) {
    const g = acharEm(l, ig);
    const a = acharEm(l, ia);
    if (g) usadosG.add(g.x.id);
    if (a) usadosA.add(a.x.id);
    let cls;
    if (g && a) cls = 'tres';
    else if (g) cls = 'soGoogle';
    else if (a) cls = 'soIcloud';
    else cls = !l.tsFonte || l.tsFonte === 'arquivo' ? 'semData' : 'soPasta';
    resumo[cls]++;
    if (g?.varios || a?.varios) resumo.varios++;
    if (g?.prova === 'arquivo' || a?.prova === 'arquivo') resumo.porArquivo++;
    linhas.push({ l, g: g?.x || null, a: a?.x || null, provaG: g?.prova || null, provaA: a?.prova || null, cls });
  }
  // o que está nos serviços e não na pasta, só dentro do período que a pasta cobre
  const { de, ate } = resumoLocal(local);
  resumo.de = de;
  resumo.ate = ate;
  if (de != null) {
    const dentro = (x) => x.ts >= de - 86400000 && x.ts <= ate + 86400000;
    resumo.googleSemCopia = google.filter((x) => dentro(x) && !usadosG.has(x.id)).length;
    resumo.icloudSemCopia = icloud.filter((x) => dentro(x) && !usadosA.has(x.id)).length;
  }
  return { linhas, resumo };
}

export const CLASSES_LOCAL = {
  tres: 'Na pasta e nos dois serviços',
  soGoogle: 'Na pasta e só no Google',
  soIcloud: 'Na pasta e só no iCloud',
  soPasta: 'Só na pasta (em nenhum serviço)',
  semData: 'Sem data de captura (não comparado)',
};

/** CSV (separador ;, para o Excel em português) das linhas escolhidas. */
export function csvLocal(linhas) {
  const q = (v) => (v == null ? '' : /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const data = (t) => (Number.isFinite(t) ? new Date(t).toISOString().replace('T', ' ').slice(0, 19) : '');
  const cab = ['caminho', 'situacao', 'captura_utc', 'fonte_da_data', 'bytes', 'largura', 'altura', 'no_google', 'no_icloud'];
  const corpo = linhas.map(({ l, g, a, provaG, provaA, cls }) => [l.path, CLASSES_LOCAL[cls], l.tsFonte && l.tsFonte !== 'arquivo' ? data(l.ts) : '', l.tsFonte || '', l.size, l.w, l.h, g ? provaG : '', a ? provaA : ''].map(q).join(';'));
  return `${cab.join(';')}\n${corpo.join('\n')}\n`;
}
