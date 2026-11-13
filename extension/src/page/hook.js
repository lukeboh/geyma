// Roda no contexto da própria página (world MAIN) do Google Fotos e do iCloud.
// 1. Observa as respostas que o próprio site busca (modo passivo).
// 2. Executa comandos da extensão: listar o catálogo do Google; percorrer a grade do iCloud.
// Comunicação com a extensão via window.postMessage, intermediada por relay.js.
(() => {
  if (window.__geymaHook) return;
  window.__geymaHook = true;

  const SITE = location.host === 'photos.google.com' ? 'google' : 'icloud';
  const post = (type, payload) => window.postMessage({ __geyma: true, site: SITE, type, payload }, location.origin);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const humanPause = (base) => sleep(base + Math.random() * base * 0.6);

  // ---------- observação passiva ----------
  function inspect(url, requestBody, status, text) {
    if (SITE === 'icloud' && /ckdatabasews\.icloud\.com\/database\/1\/com\.apple\.photos\.cloud\//.test(url)) {
      if (status >= 400) { post('icloud-error', { status }); return; }
      const body = typeof requestBody === 'string' ? requestBody : '';
      if (body.includes('CPLAssetAndMaster')) post('icloud-records', { body: text });
      else if (body.includes('HyperionIndexCountLookup')) post('icloud-counts', { request: body, body: text });
    }
    if (SITE === 'google' && /\/batchexecute\?.*rpcids=lcxiM/.test(url) && status === 200) {
      post('google-batch', { body: text });
    }
  }

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url || '';
    const watched = /ckdatabasews|batchexecute/.test(url);
    // o corpo do pedido pode vir em init.body (texto) ou dentro de um Request
    let bodyPromise = Promise.resolve('');
    if (watched) {
      if (typeof init?.body === 'string') bodyPromise = Promise.resolve(init.body);
      else if (input instanceof Request) bodyPromise = input.clone().text().catch(() => '');
    }
    const res = await origFetch.apply(this, arguments);
    if (watched) {
      Promise.all([bodyPromise, res.clone().text()])
        .then(([body, t]) => inspect(url, body, res.status, t))
        .catch(() => {});
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__geymaUrl = String(url);
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (/ckdatabasews|batchexecute/.test(this.__geymaUrl || '')) {
      this.addEventListener('load', () => {
        try {
          const rt = this.responseType;
          const text = rt === '' || rt === 'text' ? this.responseText : rt === 'json' && this.response ? JSON.stringify(this.response) : '';
          if (text || this.status >= 400) inspect(this.__geymaUrl, typeof body === 'string' ? body : '', this.status, text);
        } catch {}
      });
    }
    return origSend.apply(this, arguments);
  };

  // ---------- comandos ----------
  let stopRequested = false;
  let running = null;

  async function googleList(cursor) {
    const w = window.WIZ_global_data || {};
    if (!w.SNlM0e || !w.FdrFJe) throw new Error('sessão do Google Fotos não encontrada nesta página');
    const qs = new URLSearchParams({
      rpcids: 'lcxiM',
      'source-path': location.pathname,
      'f.sid': w.FdrFJe,
      bl: w.cfb2h || '',
      hl: document.documentElement.lang || 'pt-BR',
      _reqid: String(Math.floor(Math.random() * 900000) + 100000),
      rt: 'c',
    });
    const inner = [cursor, null, null, null, 1, 1, null];
    const body = new URLSearchParams({ 'f.req': JSON.stringify([[['lcxiM', JSON.stringify(inner), null, 'generic']]]), at: w.SNlM0e });
    const res = await origFetch('/_/PhotosUi/data/batchexecute?' + qs, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'x-same-domain': '1' },
      body: body.toString() + '&',
    });
    return { status: res.status, text: await res.text() };
  }

  async function googleCrawl() {
    let cursor = null;
    let pages = 0;
    for (;;) {
      if (stopRequested) { post('progress', { task: 'google', state: 'parado', pages }); return; }
      const { status, text } = await googleList(cursor);
      if (status !== 200) { post('progress', { task: 'google', state: 'erro', status, pages }); return; }
      pages++;
      post('google-batch', { body: text, page: pages });
      const line = text.split('\n').find((l) => l.startsWith('[["wrb.fr"'));
      let next = null;
      try { next = JSON.parse(JSON.parse(line)[0][2])[1] || null; } catch {}
      if (!next) { post('progress', { task: 'google', state: 'concluido', pages }); return; }
      cursor = next;
      if (pages % 10 === 0) post('progress', { task: 'google', state: 'lendo', pages });
      await humanPause(900);
    }
  }

  // A grade pode estar no documento, em shadow DOM ou num iframe da mesma origem.
  function findScroller() {
    let best = null;
    const visit = (root) => {
      for (const el of root.querySelectorAll('*')) {
        const d = el.scrollHeight - el.clientHeight;
        if (d > 2000 && (!best || d > best.d)) best = { el, d };
        if (el.shadowRoot) visit(el.shadowRoot);
        if (el.tagName === 'IFRAME') {
          try { if (el.contentDocument) visit(el.contentDocument); } catch {}
        }
      }
    };
    visit(document);
    return best?.el || null;
  }

  const waitVisible = async (task) => {
    if (document.visibilityState === 'visible') return;
    post('progress', { task, state: 'aguardando', reason: 'aba oculta: deixe a aba do iCloud visível' });
    await new Promise((r) => document.addEventListener('visibilitychange', function h() {
      if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', h); r(); }
    }));
  };

  let icloudError = 0;
  async function icloudWalk(startFrac = 0) {
    icloudError = 0;
    await waitVisible('icloud');
    let el = null;
    for (let i = 0; i < 20 && !el && !stopRequested; i++) {
      el = findScroller();
      if (!el) await sleep(1000);
    }
    if (!el) { post('progress', { task: 'icloud', state: 'erro', reason: 'grade de fotos não encontrada; abra Fotos no iCloud e deixe a aba visível' }); return; }
    el.scrollTop = Math.round(startFrac * (el.scrollHeight - el.clientHeight));
    await humanPause(2500);
    let step = 0;
    for (;;) {
      if (stopRequested) { post('progress', { task: 'icloud', state: 'parado', frac: frac(el) }); return; }
      if (icloudError) { post('progress', { task: 'icloud', state: 'erro', status: icloudError, frac: frac(el) }); return; }
      if (document.visibilityState !== 'visible') {
        await waitVisible('icloud');
        continue;
      }
      const before = el.scrollTop;
      el.scrollTop = before + Math.round(el.clientHeight * 0.9);
      step++;
      await humanPause(1600);
      if (step % 5 === 0) post('progress', { task: 'icloud', state: 'lendo', frac: frac(el) });
      if (el.scrollTop === before) {
        await humanPause(2500);
        if (el.scrollTop === before) { post('progress', { task: 'icloud', state: 'concluido', frac: 1 }); return; }
      }
    }
  }
  const frac = (el) => el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight);

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__geymaCmd) return;
    const { cmd, startFrac } = e.data;
    if (cmd === 'stop') { stopRequested = true; return; }
    if (running) { post('progress', { task: SITE, state: 'ocupado' }); return; }
    stopRequested = false;
    const job = cmd === 'google-crawl' && SITE === 'google' ? googleCrawl()
      : cmd === 'icloud-walk' && SITE === 'icloud' ? icloudWalk(Number(startFrac) || 0)
      : null;
    if (!job) return;
    running = job.catch((err) => post('progress', { task: SITE, state: 'erro', reason: String(err.message || err) })).finally(() => { running = null; });
  });

  // um erro do servidor do iCloud interrompe a leitura na hora
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data?.__geyma && e.data.type === 'icloud-error') icloudError = e.data.payload.status;
  });

  post('ready', {});
})();
