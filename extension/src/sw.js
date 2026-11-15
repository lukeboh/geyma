// Service worker: recebe os dados das páginas, normaliza, grava no inventário
// e encaminha os comandos do painel para as abas dos serviços.
import { parseGoogleBatchText, parseIcloudQuery, parseIcloudCounts } from './core/normalize.js';
import { putItems, patchItems, setMeta, getMeta, putThumbs, thumbIds, getItem, icloudTsSorted } from './core/db.js';
import { estimateFrac, nextFrac } from './core/icloud-locate.js';
import { ICLOUD_URL_VALIDA_MS } from './core/viewer-src.js';
import { phashFromBase64, phashFromBlob } from './core/phash-image.js';
import { ThumbQueue } from './core/thumb-queue.js';
import { shouldKeepAwake } from './core/keep-awake.js';
import { mergeProgress } from './core/progress.js';

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
  work: async (url, need) => {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    const blob = await res.blob();
    const got = {};
    if (need.phash) got.phash = await phashFromBlob(blob);
    if (need.keep) got.blob = blob;
    return got;
  },
  save: async (results) => {
    const hashes = results.filter((r) => r.phash).map((r) => ({ id: r.id, phash: r.phash }));
    const blobs = results.filter((r) => r.blob).map((r) => ({ id: r.id, blob: r.blob }));
    if (hashes.length) await patchItems(hashes);
    if (blobs.length) await putThumbs(blobs);
    const st = thumbQueue.stats();
    await setMeta('icloudPhashLive', st);
    broadcast({ site: 'icloud', event: 'phash-icloud', ...st });
  },
});
let wantedLoaded = false;
async function offerIcloudThumbs(items) {
  if (!wantedLoaded) {
    const [phash, keep, have] = await Promise.all([getMeta('icloudPhashWanted'), getMeta('icloudThumbKeep'), thumbIds()]);
    const saved = new Set(have);
    thumbQueue.setWanted(phash?.value || [], (keep?.value || []).filter((id) => !saved.has(id)));
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
const freshOf = (it, since) => it && it.thumbAt > since && { thumb: it.thumb, med: it.med || null, thumbAt: it.thumbAt };

async function refreshIcloud(id) {
  const it = await getItem(id);
  if (!it || it.source !== 'icloud') return { ok: false, erro: 'foto não encontrada no inventário' };
  if (it.thumbAt && Date.now() - it.thumbAt < ICLOUD_URL_VALIDA_MS) return { ok: true, thumb: it.thumb, med: it.med || null, thumbAt: it.thumbAt };
  if (shouldKeepAwake({ icloud: taskStates.icloud })) return { ok: false, erro: 'o percurso do iCloud está rodando; a foto ganha link novo quando ele passar por ela' };
  const [tab] = await chrome.tabs.query({ url: SITES.icloud.match });
  if (!tab) return { ok: false, erro: 'abra o iCloud Fotos no Chrome do notebook' };
  if (!tsCache || Date.now() - tsCache.at > 30 * 60 * 1000) tsCache = { at: Date.now(), list: await icloudTsSorted() };
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
    if (payload.task === 'icloud' && payload.state === 'concluido') await setMeta('icloudCompleted', { at: Date.now() });
    broadcast({ site, event: 'progress', progress: payload });
  }
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
  if (msg?.kind === 'icloud-refresh') {
    const job = refreshChain.then(() => refreshIcloud(String(msg.id)));
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
      const cmd = msg.kind === 'stop' ? 'stop' : msg.site === 'google' ? 'google-crawl' : 'icloud-walk';
      await chrome.tabs.sendMessage(tab.id, { kind: 'command', cmd, startFrac });
      sendResponse({ ok: true });
    })().catch((err) => sendResponse({ ok: false, reason: String(err.message || err) }));
    return true;
  }
  return false;
});
