// Service worker: recebe os dados das páginas, normaliza, grava no inventário
// e encaminha os comandos do painel para as abas dos serviços.
import { parseGoogleBatchText, parseIcloudQuery, parseIcloudCounts } from './core/normalize.js';
import { putItems, patchItems, setMeta, getMeta, putThumbs, thumbIds, getItem, icloudTsSorted, getItemsBySource } from './core/db.js';
import { naoVistosNoPercurso } from './core/match.js';
import { estimateFrac, nextFrac } from './core/icloud-locate.js';
import { ICLOUD_URL_VALIDA_MS } from './core/viewer-src.js';
import { phashFromBase64, phashFromBlob } from './core/phash-image.js';
import { ThumbQueue } from './core/thumb-queue.js';
import { shouldKeepAwake } from './core/keep-awake.js';
import { mergeProgress } from './core/progress.js';
import { arquivosDoItem, tipoDoArquivo, sha1Base64Url, pedacosDeBytes, registrarEnvio, envioDireto } from './core/envio.js';
import { lerCotaGoogle, lerCotaIcloud } from './core/cota.js';

const SITES = {
  google: { url: 'https://photos.google.com/', match: 'https://photos.google.com/*' },
  icloud: { url: 'https://www.icloud.com/photos/', match: 'https://www.icloud.com/*' },
};

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));

// Tela acesa enquanto uma leitura roda (o percurso do iCloud para se a tela bloquear).
const taskStates = {};
function updateKeepAwake(task, state) {
  if (task) taskStates[task] = state;
  // 'system': o notebook não dorme, mas a tela pode apagar e bloquear normalmente
  if (shouldKeepAwake(taskStates)) chrome.power.requestKeepAwake('system');
  else chrome.power.releaseKeepAwake();
  if (task === 'icloud' && !shouldKeepAwake({ icloud: state })) releaseFocus();
}

// O percurso do iCloud depende de a página se achar visível (a grade só
// carrega fotos novas quando desenha). Com a tela bloqueada ou a janela
// coberta, o Chrome esconde a aba. A extensão se conecta à aba pelo protocolo
// de depuração e liga a emulação de foco: a página continua se achando
// visível e desenhando, sem depender da tela. Desliga ao fim do percurso.
let focusTab = null;
async function holdFocus(tabId) {
  if (focusTab !== tabId) {
    await releaseFocus();
    try { await chrome.debugger.attach({ tabId }, '1.3'); } catch (err) { if (!/already attached/i.test(String(err.message || err))) throw err; }
    focusTab = tabId;
  }
  await chrome.debugger.sendCommand({ tabId }, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  await chrome.debugger.sendCommand({ tabId }, 'Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
}
async function releaseFocus() {
  if (focusTab == null) return;
  const tabId = focusTab;
  focusTab = null;
  await chrome.debugger.detach({ tabId }).catch(() => {});
}
chrome.debugger.onDetach.addListener((src) => { if (src.tabId === focusTab) focusTab = null; });

// Miniaturas do iCloud durante o percurso (as URLs expiram em horas): baixa
// assim que o percurso as vê, calcula a impressão digital dos itens que a
// imagem decidiria e guarda a miniatura dos que só estão no iCloud ou são
// cópias repetidas nele.
const thumbQueue = new ThumbQueue({
  concurrency: 8,
  work: async (url, need, urlOrig) => {
    const baixar = async (u) => {
      const res = await fetch(u, { credentials: 'omit' });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      return res.blob();
    };
    const blob = await baixar(url);
    const got = {};
    if (need.phash) {
      got.phash = await phashFromBlob(blob);
      got.phashV = 2;
      // editada: o original também conta (o Google pode ter guardado qualquer uma)
      if (urlOrig) got.phashOrig = await baixar(urlOrig).then(phashFromBlob).catch(() => null);
    }
    if (need.keep) got.blob = blob;
    return got;
  },
  save: async (results) => {
    const hashes = results.filter((r) => r.phash).map((r) => ({ id: r.id, phash: r.phash, phashV: r.phashV, ...(r.phashOrig ? { phashOrig: r.phashOrig } : {}) }));
    const blobs = results.filter((r) => r.blob).map((r) => ({ id: r.id, blob: r.blob }));
    if (hashes.length) await patchItems(hashes);
    if (blobs.length) {
      await putThumbs(blobs);
      // miniaturas de editadas já na versão atual (as guardadas antes eram do original)
      const novas = results.filter((r) => r.blob && r.editada).map((r) => r.id);
      if (novas.length) {
        const atual = new Set((await getMeta('icloudThumbAtual'))?.value || []);
        for (const id of novas) { atual.add(id); thumbQueue.keepIfEdited.delete(id); }
        await setMeta('icloudThumbAtual', [...atual]);
      }
    }
    const st = thumbQueue.stats();
    await setMeta('icloudPhashLive', st);
    broadcast({ site: 'icloud', event: 'phash-icloud', ...st });
  },
});
let wantedLoaded = false;
async function offerIcloudThumbs(items) {
  if (!wantedLoaded) {
    const [phash, keep, have, atual] = await Promise.all([getMeta('icloudPhashWanted'), getMeta('icloudThumbKeep'), thumbIds(), getMeta('icloudThumbAtual')]);
    const saved = new Set(have);
    const jaAtual = new Set(atual?.value || []);
    const lista = keep?.value || [];
    // guardadas antes da 0.2.36: numa editada, a miniatura é a do original e é trocada pela atual
    thumbQueue.setWanted(phash?.value || [], lista.filter((id) => !saved.has(id)), lista.filter((id) => saved.has(id) && !jaAtual.has(id)));
    wantedLoaded = true;
  }
  thumbQueue.offer(items);
}

// ---------- renovar o link de uma foto do iCloud ----------
// Rola a grade do site até a data da foto (como no percurso, sem consultas
// próprias) e espera o site carregar aquela região com links novos. Uma
// renovação por vez; até 5 tentativas, corrigindo a posição pelas datas que
// chegaram.
let refreshChain = Promise.resolve();
let gotoWaiter = null;
let seenRange = null;
let tsCache = null;
function noteRefreshed(items) {
  if (!seenRange) return;
  for (const it of items) {
    if (it.ts < seenRange.min) seenRange.min = it.ts;
    if (it.ts > seenRange.max) seenRange.max = it.ts;
  }
}
const linksDe = (it) => ({ thumb: it.thumb, med: it.med || null, full: it.full || null, thumbOrig: it.thumbOrig || null, medOrig: it.medOrig || null, edited: Boolean(it.edited), thumbAt: it.thumbAt });
const freshOf = (it, since) => it && it.thumbAt > since && linksDe(it);

async function refreshIcloud(id, { forcar = false } = {}) {
  const it = await getItem(id);
  if (!it || it.source !== 'icloud') return { ok: false, erro: 'foto não encontrada no inventário' };
  // forcar: o link "ainda válido" falhou ao carregar; busca outro mesmo assim
  if (!forcar && it.thumbAt && Date.now() - it.thumbAt < ICLOUD_URL_VALIDA_MS) return { ok: true, ...linksDe(it) };
  if (shouldKeepAwake({ icloud: taskStates.icloud })) return { ok: false, erro: 'o percurso do iCloud está rodando; a foto ganha link novo quando ele passar por ela' };
  const [tab] = await chrome.tabs.query({ url: SITES.icloud.match });
  if (!tab) return { ok: false, erro: 'abra o iCloud Fotos no Chrome do notebook' };
  if (!tsCache || Date.now() - tsCache.at > 30 * 60 * 1000) {
    // datas em ordem guardadas pelo último cruzamento; sem elas, percorre o índice (lento)
    const guardadas = (await getMeta('icloudTs'))?.value;
    tsCache = { at: Date.now(), list: Array.isArray(guardadas) && guardadas.length ? guardadas : await icloudTsSorted() };
  }
  const sorted = tsCache.list;
  await holdFocus(tab.id).catch(() => {});
  const t0 = Date.now();
  let pos = estimateFrac(sorted, it.ts);
  try {
    for (let tent = 0; tent < 5; tent++) {
      seenRange = { min: Infinity, max: -Infinity };
      const done = new Promise((r) => { gotoWaiter = r; setTimeout(() => r({ erro: 'o iCloud demorou demais' }), 30000); });
      await chrome.tabs.sendMessage(tab.id, { kind: 'command', cmd: 'icloud-goto', startFrac: pos });
      const res = await done;
      gotoWaiter = null;
      const novo = freshOf(await getItem(id), t0);
      if (novo) return { ok: true, ...novo, tentativas: tent + 1 };
      if (res.erro) return { ok: false, erro: res.erro };
      const r = seenRange;
      const prox = nextFrac(sorted, it.ts, pos, Number.isFinite(r.min) ? r.min : null, Number.isFinite(r.max) ? r.max : null);
      if (prox == null || prox === pos) {
        // nada novo chegou ou a data já estava no intervalo: só um último ajuste fino
        if (tent > 0) break;
        pos = Math.min(1, pos + 0.002);
      } else pos = prox;
    }
    return { ok: false, erro: 'não achei a foto na grade do iCloud' };
  } finally {
    seenRange = null;
    gotoWaiter = null;
    if (!shouldKeepAwake({ icloud: taskStates.icloud })) await releaseFocus();
  }
}

// ---------- envio pelo site do outro serviço (0.7) ----------
// Baixa o arquivo de um serviço, confere, e o entrega ao campo de envio da
// página do outro (src/page/envio.js). Uma foto por vez; para no primeiro erro.
// ensaio: só baixa e confere, nada é enviado.
let envioChain = Promise.resolve();
const alvoWaiters = new Map();
const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

async function acharCampoDeEnvio(tabId) {
  const pedido = crypto.randomUUID();
  const achou = new Promise((r) => { alvoWaiters.set(pedido, r); setTimeout(() => r(null), 4000); });
  await chrome.tabs.sendMessage(tabId, { kind: 'envio-alvo', pedido }).catch(() => {});
  const r = await achou;
  alvoWaiters.delete(pedido);
  if (!r) throw new Error('não achei o campo de envio na página (abra o site e espere carregar)');
  return r;
}

async function enviarUm(id, destino, ensaio) {
  let it = await getItem(id);
  if (!it) throw new Error('foto não encontrada no inventário');
  if (it.source === destino) throw new Error(`a foto já é do ${destino === 'google' ? 'Google' : 'iCloud'}`);
  if (it.source === 'icloud') {
    // links da Apple vencem em minutos: renova pela grade do site, se preciso
    // itens lidos antes da 0.3.4 não têm o link do original: pede outro mesmo com a miniatura válida
    const r = await refreshIcloud(id, { forcar: !it.orig && !(it.edited && it.full && !it.video) });
    if (!r.ok) throw new Error(r.erro);
    it = await getItem(id);
  }
  const arquivos = arquivosDoItem(it);
  if (!arquivos.length) throw new Error(it.source === 'icloud' ? 'o iCloud não deu o link do original desta foto (passe o percurso por ela)' : 'sem o endereço da foto no Google');
  if (envioDireto(it, destino)) return enviarDireto(it, destino, arquivos[0], ensaio);
  const baixados = [];
  for (const f of arquivos) {
    const res = await fetch(f.url, { credentials: f.credenciais });
    if (!res.ok) throw erroHttp(res.status);
    const tipo = tipoDoArquivo(f.nome, res.headers.get('content-type'));
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha1 = await sha1Base64Url(bytes);
    if (!bytes.length) throw new Error(`o arquivo ${f.nome} veio vazio`);
    // o download do Google reescreve os metadados (poucos bytes de diferença,
    // medido em 18/11): o SHA-1 da listagem não confere, só fica anotado
    baixados.push({ ...f, tipo, bytes, sha1, confere: f.sha1 ? f.sha1 === sha1 : null });
  }
  const foto = baixados.find((b) => b.papel === 'foto' || b.papel === 'video') || baixados[0];
  const info = { destino, sha1: foto.sha1, ts: it.ts, bytes: baixados.reduce((s, b) => s + b.bytes.length, 0), arquivos: baixados.map((b) => `${b.nome} (${b.tipo})`) };
  if (ensaio) return { estado: 'ensaio', ...info };
  const tab = await findOrOpenTab(destino);
  const { frameId } = await acharCampoDeEnvio(tab.id);
  const lote = crypto.randomUUID();
  for (const [i, b] of baixados.entries()) {
    const PEDACO = 6 * 1024 * 1024;
    const total = Math.max(1, Math.ceil(b.bytes.length / PEDACO));
    let j = 0;
    for (const b64 of pedacosDeBytes(b.bytes, PEDACO)) {
      await chrome.tabs.sendMessage(tab.id, { kind: 'envio-parte', lote, arquivo: i, nome: b.nome, tipo: b.tipo, lastModified: it.ts, parte: j++, total, b64 }, { frameId });
    }
  }
  const r = await chrome.tabs.sendMessage(tab.id, { kind: 'envio-entregar', lote, n: baixados.length }, { frameId });
  if (!r?.ok) throw new Error(r?.erro || 'a página não aceitou os arquivos');
  return { estado: 'enviado', estrategia: r.estrategia, ...info };
}

/**
 * Envio direto (vídeos do iCloud ao Google): a página do Google baixa o
 * original, confere (SHA-1 em pedaços) e entrega ao envio do site. O ensaio
 * também roda na página (baixa e confere, sem entregar).
 */
// senhas de uso único da ponte (ponte.html): senha -> endereço que ela libera
const ponteSenhas = new Map();

async function enviarDireto(it, destino, f, ensaio) {
  const tab = await findOrOpenTab(destino);
  const { frameId } = await acharCampoDeEnvio(tab.id);
  const pedido = crypto.randomUUID();
  // do Google ao iCloud: a ponte baixa com a sessão da extensão; o endereço não passa pela página
  let senha = null;
  if (it.source === 'google') {
    senha = crypto.randomUUID();
    ponteSenhas.set(senha, f.url);
    setTimeout(() => ponteSenhas.delete(senha), 60000);
  }
  const r = await chrome.tabs.sendMessage(tab.id, { kind: 'envio-direto', pedido, ...(senha ? { senha } : { url: f.url }), nome: f.nome, tipo: tipoDoArquivo(f.nome, null), lastModified: it.ts, ensaio }, { frameId });
  if (!r?.ok) throw (r?.status ? erroHttp(r.status) : new Error(r?.erro || 'a página não aceitou o arquivo'));
  const info = { destino, sha1: r.sha1, ts: it.ts, bytes: r.bytes, arquivos: [`${f.nome} (${tipoDoArquivo(f.nome, null)})`], direto: true };
  return ensaio ? { estado: 'ensaio', ...info } : { estado: 'enviado', estrategia: r.estrategia, ...info };
}

async function gravarEnvio(id, info) {
  const atual = (await getMeta('envio'))?.value || {};
  // um ensaio não apaga o registro de um envio feito
  if (info.estado === 'ensaio' && ['enviado', 'chegou'].includes(atual[id]?.estado)) return;
  await setMeta('envio', registrarEnvio(atual, id, info));
}

async function enviarLista(ids, destino, { ensaio = false } = {}) {
  const resultados = [];
  for (const id of ids) {
    try {
      const r = await enviarUm(id, destino, ensaio);
      await gravarEnvio(id, r);
      resultados.push({ id, ...r });
    } catch (err) {
      const r = { destino, estado: 'falhou', erro: String(err.message || err) };
      await gravarEnvio(id, r);
      resultados.push({ id, ...r });
      break;
    }
    broadcast({ event: 'envio', feitos: resultados.length, total: ids.length });
  }
  broadcast({ event: 'envio', feitos: resultados.length, total: ids.length, fim: true });
  return { ok: !resultados.some((r) => r.estado === 'falhou'), resultados };
}

const broadcast = (msg) => chrome.runtime.sendMessage({ kind: 'status', ...msg }).catch(() => {});

async function handlePageEvent(site, type, payload, tabId) {
  if (type === 'google-batch') {
    const { items } = parseGoogleBatchText(payload.body);
    if (items.length) await putItems(items);
    broadcast({ site, event: 'items', added: items.length });
  } else if (type === 'icloud-records') {
    const items = parseIcloudQuery(JSON.parse(payload.body));
    if (items.length) { await putItems(items); await offerIcloudThumbs(items); noteRefreshed(items); }
    broadcast({ site, event: 'items', added: items.length });
  } else if (type === 'icloud-cota') {
    // cota do iCloud, da resposta que o próprio site buscou
    let cota = null;
    try { cota = lerCotaIcloud(JSON.parse(payload.body)); } catch {}
    if (cota) await setMeta('cotaIcloud', cota);
  } else if (type === 'icloud-counts') {
    const counts = parseIcloudCounts(payload.request, JSON.parse(payload.body));
    if (counts.length) {
      const prev = (await getMeta('icloudCounts'))?.value || {};
      await setMeta('icloudCounts', { ...prev, ...Object.fromEntries(counts) });
      broadcast({ site, event: 'counts' });
    }
  } else if (type === 'google-thumbs') {
    const patches = [];
    for (const { id, b64 } of payload.items) {
      const hash = await phashFromBase64(b64).catch(() => null);
      if (hash) patches.push({ id, phash: hash });
    }
    if (patches.length) await patchItems(patches);
    broadcast({ site, event: 'phash', added: patches.length });
  } else if (type === 'icloud-error') {
    await setMeta('icloudLastError', { status: payload.status });
    broadcast({ site, event: 'error', status: payload.status });
  } else if (type === 'goto-done') {
    gotoWaiter?.(payload);
  } else if (type === 'progress') {
    await setMeta(`${payload.task}Progress`, mergeProgress((await getMeta(`${payload.task}Progress`))?.value, payload));
    updateKeepAwake(payload.task, payload.state);
    // percurso esperando a aba aparecer: religa a emulação de foco (se a conexão caiu)
    if (payload.task === 'icloud' && payload.state === 'aguardando' && tabId != null) await holdFocus(tabId).catch(() => {});
    // a conclusão do percurso do iCloud fica registrada mesmo depois de outro percurso parado
    if (payload.task === 'icloud' && payload.state === 'concluido') {
      await setMeta('icloudCompleted', { at: Date.now() });
      await marcarNaoVistos().catch((err) => setMeta('icloudForaDoPercurso', { erro: String(err.message || err) }));
    }
    broadcast({ site, event: 'progress', progress: payload });
  }
}

/**
 * Fim de um percurso completo: marca os itens do iCloud que ele não viu
 * (ocultos sem a marca, ou apagados) para ficarem fora do cruzamento.
 */
async function marcarNaoVistos() {
  const inicio = (await getMeta('icloudWalkStart'))?.value;
  if (!inicio) return;
  const icloud = await getItemsBySource('icloud');
  const fora = naoVistosNoPercurso(icloud, inicio);
  if (fora === null) { await setMeta('icloudForaDoPercurso', { inicio, pulado: true, total: icloud.length }); return; }
  for (let i = 0; i < fora.length; i += 2000) await patchItems(fora.slice(i, i + 2000).map((id) => ({ id, foraDoPercurso: inicio })));
  await setMeta('icloudForaDoPercurso', { inicio, n: fora.length, total: icloud.length });
  await setMeta('icloudWalkStart', null);
}

async function findOrOpenTab(site) {
  const [tab] = await chrome.tabs.query({ url: SITES[site].match });
  if (tab) return tab;
  return chrome.tabs.create({ url: SITES[site].url, active: site === 'icloud' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.kind === 'page-event') {
    handlePageEvent(msg.site, msg.type, msg.payload, sender.tab?.id).catch((err) => broadcast({ site: msg.site, event: 'falha', reason: String(err) }));
    return false;
  }
  // a ponte pede o endereço que a senha libera (uma vez só; só a própria ponte)
  if (msg?.kind === 'ponte-url') {
    const daPonte = sender.url?.startsWith(chrome.runtime.getURL('ponte.html'));
    const url = daPonte ? ponteSenhas.get(String(msg.senha)) : null;
    ponteSenhas.delete(String(msg.senha));
    sendResponse({ url: url || null });
    return false;
  }
  // andamento do envio direto (a página baixa e confere o vídeo): mostra no painel
  if (msg?.kind === 'envio-andamento') {
    broadcast({ event: 'envio-andamento', fase: msg.fase, feitos: msg.feitos, total: msg.total });
    return false;
  }
  if (msg?.kind === 'envio-alvo-resp') {
    alvoWaiters.get(msg.pedido)?.({ frameId: sender.frameId, tipo: msg.tipo });
    return false;
  }
  // cota dos dois serviços: Google pelo texto da própria página; iCloud pela última resposta observada
  if (msg?.kind === 'cota') {
    (async () => {
      const [tab] = await chrome.tabs.query({ url: SITES.google.match });
      if (tab) {
        const r = await chrome.tabs.sendMessage(tab.id, { kind: 'cota-texto' }).catch(() => null);
        const cota = lerCotaGoogle(r?.texto);
        if (cota) await setMeta('cotaGoogle', cota);
      }
      const [g, a] = await Promise.all([getMeta('cotaGoogle'), getMeta('cotaIcloud')]);
      return { ok: true, google: g?.value ? { ...g.value, at: g.at } : null, icloud: a?.value ? { ...a.value, at: a.at } : null };
    })().then(sendResponse, (err) => sendResponse({ ok: false, erro: String(err.message || err) }));
    return true;
  }
  if (msg?.kind === 'envio') {
    const ids = (Array.isArray(msg.ids) ? msg.ids : []).map(String);
    const job = envioChain.then(() => enviarLista(ids, msg.destino === 'icloud' ? 'icloud' : 'google', { ensaio: Boolean(msg.ensaio) }));
    envioChain = job.catch(() => {});
    job.then(sendResponse, (err) => sendResponse({ ok: false, erro: String(err.message || err) }));
    return true;
  }
  // tarefas longas do painel (classificação pela imagem): o notebook não dorme enquanto rodam
  if (msg?.kind === 'acordado') {
    updateKeepAwake(String(msg.task), msg.ativo ? 'ocupado' : 'parado');
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.kind === 'icloud-refresh') {
    const job = refreshChain.then(() => refreshIcloud(String(msg.id), { forcar: Boolean(msg.forcar) }));
    refreshChain = job.catch(() => {});
    job.then(sendResponse, (err) => sendResponse({ ok: false, erro: String(err.message || err) }));
    return true;
  }
  if (msg?.kind === 'phash') {
    (async () => {
      const tab = await findOrOpenTab('google');
      await setMeta('phashProgress', { task: 'phash', state: 'lendo', done: 0, total: msg.keys.length });
      updateKeepAwake('phash', 'lendo');
      await chrome.tabs.sendMessage(tab.id, { kind: 'command', cmd: 'google-thumbs', keys: msg.keys });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, reason: String(err.message || err) }));
    return true;
  }
  if (msg?.kind === 'start' || msg?.kind === 'stop') {
    (async () => {
      const tab = await findOrOpenTab(msg.site);
      if (msg.kind === 'start' && msg.site === 'icloud') {
        // A aba do iCloud precisa ficar visível. Numa janela com outras abas
        // (como o painel), basta olhar o painel para escondê-la: vai para uma
        // janela própria, do mesmo tamanho. Mover a aba não recarrega a página.
        const others = await chrome.tabs.query({ windowId: tab.windowId });
        if (others.length > 1) {
          const win = await chrome.windows.get(tab.windowId);
          await chrome.windows.create({ tabId: tab.id, focused: true, left: win.left, top: win.top, width: win.width, height: win.height });
        } else {
          await chrome.tabs.update(tab.id, { active: true });
          await chrome.windows.update(tab.windowId, { focused: true });
        }
      }
      if (msg.kind === 'start') updateKeepAwake(msg.site, 'lendo');
      if (msg.kind === 'start' && msg.site === 'icloud') wantedLoaded = false;
      if (msg.site === 'icloud') {
        if (msg.kind === 'start') await holdFocus(tab.id).catch((err) => broadcast({ site: 'icloud', event: 'falha', reason: `emulação de foco: ${err.message || err}` }));
      }
      const startFrac = msg.site === 'icloud' && msg.resume ? (await getMeta('icloudProgress'))?.value?.frac || 0 : 0;
      // início de um percurso do zero: o que ele não vir até o fim está fora da biblioteca principal
      if (msg.kind === 'start' && msg.site === 'icloud' && !msg.resume) await setMeta('icloudWalkStart', Date.now());
      const cmd = msg.kind === 'stop' ? 'stop' : msg.site === 'google' ? 'google-crawl' : 'icloud-walk';
      await chrome.tabs.sendMessage(tab.id, { kind: 'command', cmd, startFrac });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, reason: String(err.message || err) }));
    return true;
  }
  return false;
});
