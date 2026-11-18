// Classificação por regras baratas (etapa 0.6): separa o que é claramente
// pessoal do que é suspeito de lixo, só com metadados. Não decide nada: gera
// uma categoria e uma sugestão de marcação. Suspeito e indefinido viram
// "Pendente" — nada suspeito é copiado sem decisão do usuário.

export const CATEGORIES = {
  pessoal: 'Pessoal (câmera)',
  print: 'Captura de tela',
  recebida: 'Recebida de mensageiro ou rede social',
  internet: 'Salva da internet ou de apps',
  documento: 'Documento, recibo ou digitalização de papel',
  propaganda: 'Propaganda, oferta ou convite',
  indefinido: 'Indefinido',
};

export const DECISIONS = {
  pessoal: 'Pessoal',
  pendente: 'Pendente',
  manter: 'Manter',
  descartar: 'Descartar',
};

// assetSubtypeV2 do iCloud (conferido contra as contagens oficiais da Apple)
const SUBTYPE = { 1: 'panorama', 2: 'live', 3: 'screenshot', 100: 'slomo', 101: 'timelapse' };

const MESSENGERS = /whatsapp|MobileSMS|telegram|instagram|picaboo|facebook|messenger|twitter|tiktok|discord|signal/i;
const APPS = /openai|chrome|safari|pinterest|canva|reddit|imgur/i;
const CAMERA_APPS = /com\.apple\.camera|lrmobile|halide|vsco|snapseed/i;
// apps de digitalizar papel (Office Lens, Notas, CamScanner, Adobe Scan, Genius Scan...)
const DOC_APPS = /officemobile|officelens|com\.apple\.mobilenotes|camscanner|intsig|com\.adobe\.scan|geniusscan|grizzlylabs|scannerpro|readdle\.scanner|tinyscanner/i;
// lojas e apps de compras ou entrega: o que vem delas é anúncio de produto
const SHOP_APPS = /shopee|mercadoli|mercadopago|amazon|aliexpress|alibaba|ifood|magalu|magazineluiza|americanas|casasbahia|submarino|temu|shein|rappi|netshoes|centauro/i;

// Nomes de documento e de propaganda. Nunca "scan" sozinho: na prática, os
// arquivos "scan*.jpg" e "SCANS_*" são fotos antigas digitalizadas.
const DOC_NAME = /^(CamScanner|Scanned[ _-]|Adobe Scan|Office Lens|Doc(umento)?[ _-]?\d|Comprovante|Recibo|Boleto|Fatura|Nota[ _-]?Fiscal|NF-?e|Receita[ _-]|Laudo|Exame|Certid[aã]o|Contrato|Receipt|Invoice|RG[ _-]|CNH[ _-]|CPF[ _-]|Passaporte)/i;
const AD_NAME = /(promo[cç][aã]o|^promo[ _-]|oferta|flyer|panfleto|cartaz|banner|cupom|desconto|black ?friday|an[uú]ncio|convite[ _-]|propaganda)/i;

// telas de celular e tablet (retrato), comuns em capturas de tela
const SCREENS = new Set([
  '640x960', '640x1136', '750x1334', '1242x2208', '1125x2436', '828x1792', '1242x2688', '1170x2532',
  '1284x2778', '1179x2556', '1290x2796', '1206x2622', '1320x2868', '1080x2340', '1080x2400', '1440x2560',
  '1440x3200', '1080x2280', '1440x3040',
]);
// fora da lista de propósito: telas de iPad (4:3, iguais a câmeras antigas) e
// 720×1280 / 1080×1920 (tamanhos comuns de vídeo e de foto 16:9)
const isScreen = (w, h) => Boolean(w && h) && SCREENS.has(`${Math.min(w, h)}x${Math.max(w, h)}`);

const NAME = [
  [/^IMG-\d{8}-WA\d+/i, 'recebida', 'nome do WhatsApp'],
  [/^(received_|FB_IMG|Snapchat-|inbound)/i, 'recebida', 'nome de mensageiro ou rede social'],
  [/^(Screenshot|Screen Shot|Captura de Tela|Captura de ecrã|Simulator Screen)/i, 'print', 'nome de captura de tela'],
  [/^(IMG_\d{4}|IMG_E\d{4}|DSC[NF_]?\d+|_DSC\d+|P\d{7}|DSCF\d+|GOPR\d+|PXL_\d{8}|IMG_\d{8}_\d{6}|\d{8}_\d{6})/i, 'pessoal', 'nome de câmera'],
  [/(NIKON|Canon|iPhone|SONY|Panasonic|FUJIFILM|OLYMPUS|Galaxy)/i, 'pessoal', 'modelo da câmera no nome'],
  [/^filme-\d{4}/i, 'pessoal', 'filme digitalizado'],
  [/^(\d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}|\d{8}-\d{6}-)/, 'pessoal', 'nome com data e hora da captura'],
];

// câmera: 4:3 ou 3:2 a partir de 1 MP
function cameraShape(w, h) {
  if (!w || !h) return false;
  const r = Math.max(w, h) / Math.min(w, h);
  return (w * h) / 1e6 >= 1 && (Math.abs(r - 4 / 3) < 0.02 || Math.abs(r - 3 / 2) < 0.02);
}

/** Documento ou propaganda pelo nome do arquivo ou pelo app que gravou a foto; null se nenhum. */
export function documentoOuPropaganda(name = '', from = '') {
  if (DOC_NAME.test(name)) return { cat: 'documento', reasons: ['nome de documento'] };
  if (DOC_APPS.test(from)) return { cat: 'documento', reasons: [`importada por ${from} (app de digitalizar)`] };
  if (AD_NAME.test(name)) return { cat: 'propaganda', reasons: ['nome de propaganda ou convite'] };
  if (SHOP_APPS.test(from)) return { cat: 'propaganda', reasons: [`importada por ${from} (loja)`] };
  return null;
}

/** Classifica um item do iCloud (metadados completos). */
export function classifyIcloud(a) {
  const reasons = [];
  const sub = SUBTYPE[a.subtype];
  const name = a.filename || '';
  const from = a.importedBy || '';
  if (sub === 'screenshot') return { cat: 'print', reasons: ['marcada pela Apple como captura de tela'] };
  for (const [re, cat, why] of NAME) if (cat === 'print' && re.test(name)) return { cat, reasons: [why] };
  // documento e propaganda antes de "recebida": um comprovante mandado pelo
  // WhatsApp é antes de tudo um comprovante
  const doc = documentoOuPropaganda(name, from);
  if (doc) return doc;
  if (MESSENGERS.test(from)) return { cat: 'recebida', reasons: [`importada por ${from}`] };
  for (const [re, cat, why] of NAME) if (cat === 'recebida' && re.test(name)) return { cat, reasons: [why] };
  if (APPS.test(from)) return { cat: 'internet', reasons: [`importada por ${from}`] };
  // foto (não vídeo) do tamanho exato de uma tela: câmeras não geram esse tamanho
  if (!a.video && sub !== 'live' && !CAMERA_APPS.test(from) && isScreen(a.w, a.h)) {
    return { cat: 'print', reasons: ['do tamanho de uma tela de celular ou tablet'] };
  }

  if (CAMERA_APPS.test(from)) reasons.push(`importada por ${from}`);
  if (sub && sub !== 'screenshot') reasons.push(`tipo da Apple: ${sub}`);
  if (/raw-image/.test(a.fileType || '')) reasons.push('arquivo RAW');
  for (const [re, cat, why] of NAME) if (cat === 'pessoal' && re.test(name)) reasons.push(why);
  if (a.favorite) reasons.push('favorita');
  if (a.local) reasons.push('com localização (GPS)');
  if (reasons.length) return { cat: 'pessoal', reasons };

  if (a.fileType === 'com.compuserve.gif') return { cat: 'internet', reasons: ['GIF'] };
  if (/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}/i.test(name)) return { cat: 'internet', reasons: ['nome gerado por app (UUID)'] };
  if (a.w && a.h && Math.max(a.w, a.h) < 800 && !a.video) return { cat: 'internet', reasons: ['imagem pequena (menos de 800 px)'] };
  if (!a.video && cameraShape(a.w, a.h)) return { cat: 'pessoal', reasons: ['proporção e resolução de câmera'] };
  if (a.video && Math.max(a.w || 0, a.h || 0) >= 1280) return { cat: 'pessoal', reasons: ['vídeo em resolução de câmera'] };
  return { cat: 'indefinido', reasons: [] };
}

/**
 * Classifica um item só do Google: regras conservadoras sobre as dimensões,
 * o tipo (vídeo, foto com movimento) que a listagem traz e, quando a ficha do
 * arquivo foi lida, o nome do arquivo.
 */
export function classifyGoogle(g) {
  const nome = (!g.video && g.file?.nome) || '';
  for (const [re, cat, why] of NAME) if (cat === 'print' && re.test(nome)) return { cat, reasons: [why] };
  const doc = nome && documentoOuPropaganda(nome);
  if (doc) return doc;
  for (const [re, cat, why] of NAME) if (cat === 'recebida' && re.test(nome)) return { cat, reasons: [why] };
  if (!g.video && !g.motionMs && isScreen(g.w, g.h)) return { cat: 'print', reasons: ['do tamanho de uma tela de celular ou tablet'] };
  const reasons = [];
  // foto com movimento: Live Photo (ou foto em movimento do Android), só a câmera faz
  if (g.motionMs && !g.video) reasons.push('foto com movimento (Live Photo)');
  for (const [re, cat, why] of NAME) if (cat === 'pessoal' && re.test(nome)) reasons.push(why);
  if (reasons.length) return { cat: 'pessoal', reasons };
  if (g.video) {
    // do tamanho exato de uma tela: pode ser gravação de tela
    if (isScreen(g.w, g.h)) return { cat: 'indefinido', reasons: ['vídeo do tamanho de uma tela (pode ser gravação de tela)'] };
    if (Math.max(g.w || 0, g.h || 0) >= 1280) return { cat: 'pessoal', reasons: ['vídeo em resolução de câmera'] };
    // vídeo pequeno: câmeras antigas também gravavam assim; fica indefinido
    return { cat: 'indefinido', reasons: [] };
  }
  if (g.w && g.h && Math.max(g.w, g.h) < 800) return { cat: 'internet', reasons: ['imagem pequena (menos de 800 px)'] };
  if (cameraShape(g.w, g.h)) return { cat: 'pessoal', reasons: ['proporção e resolução de câmera'] };
  return { cat: 'indefinido', reasons: [] };
}

/** Classifica uma foto do cruzamento: usa o iCloud quando existe (mais metadados). */
export function classifyRow(a, g) {
  return a ? classifyIcloud(a) : classifyGoogle(g);
}

/** Sugestão de marcação: só o que é claramente pessoal vai direto; o resto fica Pendente. */
export function suggestDecision(cat) {
  return cat === 'pessoal' ? 'pessoal' : 'pendente';
}
