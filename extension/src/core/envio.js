// Envio curado pelo próprio site de cada serviço (etapa 0.7, caminho C).
// A extensão baixa o arquivo de um serviço e o entrega ao campo de envio da
// página do outro (o mesmo que o botão "Enviar" usa). Quem envia é o código do
// próprio site; o Geyma não escreve em nenhuma API. Módulo puro: roda no
// navegador e no Node (testes).
import { SENDABLE, effectiveDecision } from './plan.js';
import { LIMITE_VIDEO_ENVIO, ehVideo } from './video.js';

export const DESTINOS = { google: 'Google Fotos', icloud: 'iCloud' };

/**
 * Pode enviar esta linha do cruzamento ao destino? Só fotos marcadas Pessoal
 * ou Manter, sem cópia repetida, fora das ocultas e dos itens fora da
 * biblioteca principal. Vídeos do iCloud vão direto ao Google (envioDireto);
 * do Google ao iCloud, até LIMITE_VIDEO_ENVIO (o arquivo passa pela memória).
 * @returns {{ok: boolean, motivo?: string, origem?: 'icloud'|'google'}}
 */
export function podeEnviar(r, destino) {
  if (!r || !DESTINOS[destino]) return { ok: false, motivo: 'destino desconhecido' };
  const origem = destino === 'google' ? 'icloud' : 'google';
  const it = origem === 'icloud' ? r.a : r.g;
  if (!it) return { ok: false, motivo: `a foto não está no ${DESTINOS[origem]}` };
  if (!SENDABLE.has(effectiveDecision(r))) return { ok: false, motivo: 'só vão fotos marcadas Pessoal ou Manter' };
  if (it.hidden || it.foraDoPercurso) return { ok: false, motivo: 'foto oculta ou fora da biblioteca principal' };
  // do iCloud ao Google, o vídeo vai direto (a página do Google baixa o
  // original para o disco): sem limite. Do Google ao iCloud, passa pela memória.
  if (it.video && !(origem === 'icloud' && destino === 'google')) {
    const bytes = it.fileV?.bytes;
    if (bytes > LIMITE_VIDEO_ENVIO) return { ok: false, motivo: `vídeo grande demais para o envio pelo site (mais de ${Math.round(LIMITE_VIDEO_ENVIO / 1048576)} MB): fica para o envio pelo computador` };
  }
  if (r.dup || r.dupIcloud) return { ok: false, motivo: 'cópia repetida: vai só a melhor' };
  const so = destino === 'google' ? 'soIcloud' : 'soGoogle';
  if (r.cls === so) return { ok: true, origem };
  // nos dois serviços: só reenviar ao Google quando o iCloud guarda a melhor cópia
  if (destino === 'google' && r.a && r.g && r.melhor?.icloud?.length) return { ok: true, origem };
  return { ok: false, motivo: `a foto já está no ${DESTINOS[destino]}` };
}

/**
 * Vai pelo envio direto? Vídeo do iCloud ao Google: a página do Google baixa
 * o original do iCloud (link assinado, sem sessão) e o entrega ao próprio
 * envio do site, sem passar pela memória da extensão.
 */
export const envioDireto = (it, destino) => destino === 'google' && it?.source === 'icloud' && ehVideo(it);

/** Linhas que podem ir ao destino, na ordem da lista. */
export function filaDeEnvio(rows, destino, { limite = Infinity } = {}) {
  const out = [];
  for (const r of rows) {
    if (out.length >= limite) break;
    if (podeEnviar(r, destino).ok) out.push(r);
  }
  return out;
}

const EXT = { 'public.heic': 'HEIC', 'public.heif': 'HEIF', 'public.jpeg': 'JPG', 'public.png': 'PNG', 'public.tiff': 'TIF', 'com.compuserve.gif': 'GIF' };
const pad = (n) => String(n).padStart(2, '0');
/** Nome a partir da data, para quando o serviço não dá o nome do arquivo. */
export function nomePelaData(ts, ext) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}_${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.${ext}`;
}
const semExtensao = (n) => String(n).replace(/\.[^.]+$/, '');
const extensaoDe = (n) => (String(n).match(/\.([^.]+)$/)?.[1] || '').toUpperCase();

/**
 * Arquivos a baixar de um item do inventário: [{url, nome, papel, credenciais}].
 * iCloud: a foto como está hoje (a versão editada, em JPEG, quando foi
 * editada; senão o original) e, numa Live Photo não editada, o vídeo do
 * clique com o mesmo nome (o par HEIC + MOV é como a Apple e o Google
 * reconhecem uma Live Photo). Google: o arquivo guardado (`=d`).
 * Lista vazia quando falta o link (iCloud: pedir link novo antes).
 */
export function arquivosDoItem(it) {
  if (!it) return [];
  if (it.source === 'google') {
    if (!it.thumb) return [];
    // vídeo: o arquivo do vídeo (`=dv`); o `=d` de um vídeo é a capa
    if (it.video) return [{ url: `${it.thumb}=dv`, nome: it.fileV?.nome || nomePelaData(it.ts, 'MP4'), papel: 'video', credenciais: 'include', sha1: it.sha1 || null }];
    const nome = it.file?.nome || nomePelaData(it.ts, it.file?.formato === 'HEIC' ? 'HEIC' : 'JPG');
    // sha1: o da listagem, só anotado (o download reescreve metadados e não confere)
    return [{ url: `${it.thumb}=d`, nome, papel: 'foto', credenciais: 'include', sha1: it.sha1 || null }];
  }
  const base = it.filename ? semExtensao(it.filename) : semExtensao(nomePelaData(it.ts, 'X'));
  // vídeo: sempre o original (o `full` de um vídeo editado é uma imagem JPEG)
  if (ehVideo(it)) {
    if (!it.orig) return [];
    const extV = (it.filename && extensaoDe(it.filename)) || (/mpeg-4/.test(it.fileType || '') ? 'MP4' : 'MOV');
    return [{ url: it.orig, nome: `${base}.${extV}`, papel: 'video', credenciais: 'omit' }];
  }
  if (it.edited && it.full) return [{ url: it.full, nome: `${base}.JPG`, papel: 'foto', credenciais: 'omit' }];
  if (!it.orig) return [];
  const ext = (it.filename && extensaoDe(it.filename)) || EXT[it.fileType] || 'JPG';
  const out = [{ url: it.orig, nome: `${base}.${ext}`, papel: 'foto', credenciais: 'omit' }];
  if (it.live && it.origVid) out.push({ url: it.origVid, nome: `${base}.MOV`, papel: 'movimento', credenciais: 'omit' });
  return out;
}

const MIME = { HEIC: 'image/heic', HEIF: 'image/heif', JPG: 'image/jpeg', JPEG: 'image/jpeg', PNG: 'image/png', GIF: 'image/gif', TIF: 'image/tiff', TIFF: 'image/tiff', WEBP: 'image/webp', DNG: 'image/x-adobe-dng', MOV: 'video/quicktime', MP4: 'video/mp4', M4V: 'video/x-m4v', AVI: 'video/x-msvideo', '3GP': 'video/3gpp' };
/**
 * Tipo do arquivo para entregar ao site: o da resposta, ou pela extensão do
 * nome quando a resposta é genérica (a Apple manda application/octet-stream).
 */
export function tipoDoArquivo(nome, tipoDaResposta) {
  const t = String(tipoDaResposta || '').split(';')[0].trim().toLowerCase();
  if (t && t !== 'application/octet-stream' && t !== 'binary/octet-stream') return t;
  return MIME[extensaoDe(nome)] || 'application/octet-stream';
}

/** SHA-1 em base64url sem preenchimento (27 caracteres), o formato que a listagem do Google traz. */
export async function sha1Base64Url(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  return base64DeBytes(h).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes → base64, em blocos (btoa não aceita textos enormes de uma vez). */
export function base64DeBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** base64 → bytes. */
export function bytesDeBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Divide um texto base64 em pedaços para as mensagens da extensão (limite de
 * 64 MB por mensagem). O tamanho é múltiplo de 4 para cada pedaço ser base64
 * válido sozinho.
 */
export function pedacos(b64, tamanho = 8 * 1024 * 1024) {
  const t = Math.max(4, tamanho - (tamanho % 4));
  const out = [];
  for (let i = 0; i < b64.length; i += t) out.push(b64.slice(i, i + t));
  return out.length ? out : [''];
}

/**
 * Pedaços em base64 direto dos bytes, um de cada vez: um vídeo grande não
 * vira um texto único (a memória dobraria, e o V8 limita o tamanho de um
 * texto a uns 500 milhões de caracteres). O tamanho é múltiplo de 3 para
 * cada pedaço ser base64 válido sozinho.
 */
export function* pedacosDeBytes(bytes, tamanho = 6 * 1024 * 1024) {
  const t = Math.max(3, tamanho - (tamanho % 3));
  if (!bytes.length) { yield ''; return; }
  for (let i = 0; i < bytes.length; i += t) yield base64DeBytes(bytes.subarray(i, i + t));
}

/**
 * Registro de um envio no estado guardado (meta 'envio'): { id: {destino,
 * estado, at, sha1?, estrategia?, erro?} }. estado: 'ensaio' (baixado e
 * conferido, nada enviado), 'enviado', 'falhou' ou 'chegou'.
 */
export function registrarEnvio(estado, id, info, agora = Date.now()) {
  const novo = { ...(estado?.[id] || {}), ...info, at: agora };
  // o erro de uma tentativa anterior não vale para a nova
  if (!('erro' in info)) delete novo.erro;
  return { ...(estado || {}), [id]: novo };
}

/**
 * Confere quais envios já aparecem no inventário do destino:
 * ao Google, pelo SHA-1 do arquivo enviado (exato); ao iCloud, por uma foto
 * do mesmo instante (até 1 s) vista depois do envio.
 * @returns {{id, chegou: string}[]} ids de origem e o id do item que chegou
 */
export function conferirChegadas(estado, { google = [], icloud = [] } = {}) {
  const porSha = new Map();
  for (const g of google) if (g.sha1) porSha.set(g.sha1, g.id);
  const out = [];
  for (const [id, e] of Object.entries(estado || {})) {
    if (e.estado !== 'enviado') continue;
    if (e.destino === 'google' && e.sha1 && porSha.has(e.sha1)) out.push({ id, chegou: porSha.get(e.sha1) });
    if (e.destino === 'icloud' && Number.isFinite(e.ts)) {
      const a = icloud.find((x) => Math.abs(x.ts - e.ts) <= 1000 && (x.seenAt || 0) >= e.at);
      if (a) out.push({ id, chegou: a.id });
    }
  }
  return out;
}

/** Marca as chegadas conferidas ({id, chegou}) no estado; devolve o mesmo objeto se nada mudou. */
export function marcarChegadas(estado, chegadas, agora = Date.now()) {
  if (!chegadas.length) return estado;
  let novo = estado;
  for (const { id, chegou } of chegadas) novo = registrarEnvio(novo, id, { estado: 'chegou', chegouComo: chegou }, agora);
  return novo;
}

/** Contagem por estado, para o painel. */
export function resumoEnvio(estado) {
  const r = { ensaio: 0, enviado: 0, chegou: 0, falhou: 0 };
  for (const e of Object.values(estado || {})) if (e.estado in r) r[e.estado]++;
  return r;
}
