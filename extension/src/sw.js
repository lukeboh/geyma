// Service worker: recebe os dados das páginas, normaliza, grava no inventário
// e encaminha os comandos do painel para as abas dos serviços.
import { parseGoogleBatchText, parseIcloudQuery, parseIcloudCounts } from './core/normalize.js';
import { putItems, setMeta, getMeta } from './core/db.js';

const SITES = {
  google: { url: 'https://photos.google.com/', match: 'https://photos.google.com/*' },
  icloud: { url: 'https://www.icloud.com/photos/', match: 'https://www.icloud.com/*' },
};

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }));

const broadcast = (msg) => chrome.runtime.sendMessage({ kind: 'status', ...msg }).catch(() => {});

async function handlePageEvent(site, type, payload) {
  if (type === 'google-batch') {
    const { items } = parseGoogleBatchText(payload.body);
    if (items.length) await putItems(items);
    broadcast({ site, event: 'items', added: items.length });
  } else if (type === 'icloud-records') {
    const items = parseIcloudQuery(JSON.parse(payload.body));
    if (items.length) await putItems(items);
    broadcast({ site, event: 'items', added: items.length });
  } else if (type === 'icloud-counts') {
    const counts = parseIcloudCounts(payload.request, JSON.parse(payload.body));
    if (counts.length) {
      const prev = (await getMeta('icloudCounts'))?.value || {};
      await setMeta('icloudCounts', { ...prev, ...Object.fromEntries(counts) });
      broadcast({ site, event: 'counts' });
    }
  } else if (type === 'icloud-error') {
    await setMeta('icloudLastError', { status: payload.status });
    broadcast({ site, event: 'error', status: payload.status });
  } else if (type === 'progress') {
    await setMeta(`${payload.task}Progress`, payload);
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
    handlePageEvent(msg.site, msg.type, msg.payload).catch((err) => broadcast({ site: msg.site, event: 'falha', reason: String(err) }));
    return false;
  }
  if (msg?.kind === 'start' || msg?.kind === 'stop') {
    (async () => {
      const tab = await findOrOpenTab(msg.site);
      if (msg.kind === 'start' && msg.site === 'icloud') {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });
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
