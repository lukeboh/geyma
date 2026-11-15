// Service worker: recebe os dados das páginas, normaliza, grava no inventário
// e encaminha os comandos do painel para as abas dos serviços.
import { parseGoogleBatchText, parseIcloudQuery, parseIcloudCounts } from './core/normalize.js';
import { putItems, patchItems, setMeta, getMeta } from './core/db.js';
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

// Desempate durante o percurso: baixa a miniatura dos itens do iCloud que a
// imagem decidiria assim que o percurso os vê (as URLs expiram em horas).
const thumbQueue = new ThumbQueue({
  concurrency: 8,
  hash: async (url) => {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
    return phashFromBlob(await res.blob());
  },
  save: async (patches) => {
    await patchItems(patches);
    const st = thumbQueue.stats();
    await setMeta('icloudPhashLive', st);
    broadcast({ site: 'icloud', event: 'phash-icloud', ...st });
  },
});
let wantedLoaded = false;
async function offerIcloudThumbs(items) {
  if (!wantedLoaded) { thumbQueue.setWanted((await getMeta('icloudPhashWanted'))?.value || []); wantedLoaded = true; }
  thumbQueue.offer(items);
}

const broadcast = (msg) => chrome.runtime.sendMessage({ kind: 'status', ...msg }).catch(() => {});

async function handlePageEvent(site, type, payload, tabId) {
  if (type === 'google-batch') {
    const { items } = parseGoogleBatchText(payload.body);
    if (items.length) await putItems(items);
    broadcast({ site, event: 'items', added: items.length });
  } else if (type === 'icloud-records') {
    const items = parseIcloudQuery(JSON.parse(payload.body));
    if (items.length) { await putItems(items); await offerIcloudThumbs(items); }
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
