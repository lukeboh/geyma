// Geyma no celular: servidor local que mostra no celular o que a extensão já
// processou no Chrome de automação.
//
// - Escuta só em 127.0.0.1; o acesso de fora vem pelo `tailscale serve`
//   (somente dentro da sua rede Tailscale, nada na internet).
// - Exige uma senha de acesso (token aleatório guardado fora do repositório,
//   em %LOCALAPPDATA%\geyma\celular.json); o primeiro acesso usa o link com o
//   token, que vira um cookie.
// - Os dados vêm da própria extensão, pela porta de depuração 9222
//   (window.geymaApi no painel). Nada aqui altera os serviços: marcar só grava a
//   decisão no inventário da extensão.
//
// Uso: node mobile/servidor.mjs   (opções: --porta 8765, --novo-token)
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = join(HERE, '..', 'extension');
const CDP = 'http://127.0.0.1:9222';
const args = process.argv.slice(2);
const PORT = Number(args[args.indexOf('--porta') + 1]) || 8765;
const CONF_DIR = join(process.env.LOCALAPPDATA || join(process.env.HOME || '.', '.config'), 'geyma');
const CONF = join(CONF_DIR, 'celular.json');

// ---------- senha de acesso ----------
async function loadToken() {
  if (!args.includes('--novo-token') && existsSync(CONF)) {
    const c = JSON.parse(await readFile(CONF, 'utf8'));
    if (c.token) return c.token;
  }
  const token = randomBytes(24).toString('base64url');
  await mkdir(CONF_DIR, { recursive: true });
  await writeFile(CONF, JSON.stringify({ token, criadoEm: new Date().toISOString() }, null, 2));
  return token;
}
const TOKEN = await loadToken();
const sameToken = (t) => {
  if (typeof t !== 'string' || t.length !== TOKEN.length) return false;
  return timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
};
const cookieToken = (req) => /(?:^|;\s*)geyma=([^;]+)/.exec(req.headers.cookie || '')?.[1];

// ---------- ponte com a extensão (CDP) ----------
let sock = null;
let seq = 0;
const pending = new Map();

async function dashboardTarget() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  let t = list.find((x) => x.type === 'page' && /^chrome-extension:\/\/[a-p]{32}\/dashboard\.html/.test(x.url));
  if (t) return t;
  // sem painel aberto: abre um, a partir do service worker da extensão
  const sw = list.find((x) => x.type === 'service_worker' && /\/src\/sw\.js$/.test(x.url));
  if (!sw) throw new Error('extensão Geyma não encontrada no Chrome de automação');
  const base = sw.url.replace(/\/src\/sw\.js$/, '');
  await fetch(`${CDP}/json/new?${base}/dashboard.html%23prot`, { method: 'PUT' });
  await new Promise((r) => setTimeout(r, 3000));
  return dashboardTarget();
}

async function connect() {
  if (sock && sock.readyState === WebSocket.OPEN) return sock;
  const t = await dashboardTarget();
  sock = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { sock.onopen = resolve; sock.onerror = () => reject(new Error('sem conexão com o Chrome')); });
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else if (m.result?.exceptionDetails) p.reject(new Error(m.result.exceptionDetails.exception?.description?.split('\n')[0] || 'erro no painel'));
    else p.resolve(m.result?.result?.value);
  };
  sock.onclose = () => {
    sock = null;
    for (const p of pending.values()) p.reject(new Error('conexão com o Chrome fechada'));
    pending.clear();
  };
  return sock;
}

/** Chama window.geymaApi[fn](...args) no painel da extensão. */
async function api(fn, ...callArgs) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ws = await connect();
      // espera o módulo da API carregar (painel recém-aberto)
      const expr = `(async () => { for (let i = 0; i < 100 && !window.geymaApi; i++) await new Promise((r) => setTimeout(r, 200));
        if (!window.geymaApi) throw new Error('painel sem a API do celular; recarregue a extensão');
        return window.geymaApi[${JSON.stringify(fn)}](...${JSON.stringify(callArgs)}); })()`;
      const id = ++seq;
      const result = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => { if (pending.delete(id)) reject(new Error('o painel demorou demais para responder')); }, 120000);
      });
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
      return await result;
    } catch (err) {
      if (attempt === 1 || !/conexão|Chrome/.test(err.message)) throw err;
      sock = null;
    }
  }
}

// ---------- miniaturas (cache em memória) ----------
const THUMB_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(usercontent\.google\.com|googleusercontent\.com|icloud-content\.com)\//;
const cache = new Map();
const CACHE_MAX = 2500;
async function thumb(url) {
  if (cache.has(url)) { const v = cache.get(url); cache.delete(url); cache.set(url, v); return v; }
  const r = await api('thumb', url);
  if (!r?.ok) return null;
  const v = { type: r.type, body: Buffer.from(r.b64, 'base64') };
  cache.set(url, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return v;
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const STATIC = {
  '/': join(HERE, 'index.html'),
  '/app.js': join(HERE, 'app.js'),
  '/app.css': join(HERE, 'app.css'),
  '/manifest.webmanifest': join(HERE, 'manifest.webmanifest'),
  '/icone.svg': join(HERE, 'icone.svg'),
  '/assets/archivo.woff2': join(EXT, 'assets', 'archivo.woff2'),
};
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
};

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { ...SECURITY, ...headers });
  res.end(body);
};
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });

async function readBody(req, limit = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('pedido grande demais'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const LOGIN_PAGE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Geyma</title><link rel="stylesheet" href="/app.css"></head>
<body class="login"><div class="aurora"></div><main class="vidro entrar"><h1 class="marca">Geyma</h1><p>Abra o link de acesso que aparece no notebook ao iniciar o servidor.</p></main></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    // só aceita conexões locais (o tailscale serve entrega como local)
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return send(res, 403, 'proibido');

    if (url.pathname === '/entrar') {
      if (!sameToken(url.searchParams.get('t'))) return send(res, 403, LOGIN_PAGE, { 'content-type': 'text/html; charset=utf-8' });
      return send(res, 303, '', { location: '/', 'set-cookie': `geyma=${TOKEN}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000` });
    }
    if (url.pathname === '/app.css' || url.pathname === '/assets/archivo.woff2' || url.pathname === '/icone.svg' || url.pathname === '/manifest.webmanifest') {
      const f = STATIC[url.pathname];
      return send(res, 200, await readFile(f), { 'content-type': MIME[extname(f)], 'cache-control': 'max-age=3600' });
    }
    if (!sameToken(cookieToken(req))) {
      if (url.pathname.startsWith('/api/')) return json(res, 401, { erro: 'acesso não autorizado: abra o link de acesso' });
      return send(res, 401, LOGIN_PAGE, { 'content-type': 'text/html; charset=utf-8' });
    }

    if (STATIC[url.pathname]) {
      const f = STATIC[url.pathname];
      return send(res, 200, await readFile(f), { 'content-type': MIME[extname(f)], 'cache-control': 'no-cache' });
    }

    if (url.pathname === '/api/status') return json(res, 200, await api('status'));
    if (url.pathname === '/api/summary') return json(res, 200, await api('summary'));
    if (url.pathname === '/api/rows') {
      const q = url.searchParams;
      const f = { cls: q.get('cls') || '', cat: q.get('cat') || '', dec: q.get('dec') || '', year: q.get('year') || '', kind: q.get('kind') || '' };
      return json(res, 200, await api('rows', f, Number(q.get('page')) || 0, Number(q.get('size')) || 30));
    }
    if (url.pathname === '/api/thumb') {
      const u = url.searchParams.get('u') || '';
      if (!THUMB_HOSTS.test(u)) return send(res, 400, 'endereço não permitido');
      const t = await thumb(u);
      if (!t) return send(res, 404, 'miniatura indisponível');
      return send(res, 200, t.body, { 'content-type': t.type, 'cache-control': 'private, max-age=86400' });
    }
    if (req.method === 'POST' && req.headers['x-geyma'] === '1') {
      if (url.pathname === '/api/decide') {
        const b = await readBody(req);
        if (!Array.isArray(b.ids) || !b.ids.length || b.ids.length > 200000) return json(res, 400, { erro: 'itens inválidos' });
        return json(res, 200, await api('decide', b.ids.map(String), b.decision ?? null));
      }
      if (url.pathname === '/api/recompute') return json(res, 200, { ok: await api('recompute') });
    }
    return send(res, 404, 'não encontrado');
  } catch (err) {
    console.error(new Date().toLocaleTimeString('pt-BR'), err.message);
    if (!res.headersSent) json(res, 500, { erro: err.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Geyma no celular: escutando em http://127.0.0.1:${PORT} (só local)`);
  console.log('Para o celular, publique na rede Tailscale com: tailscale serve --bg --http 8080 http://127.0.0.1:8765 (ou rode mobile/iniciar.ps1)');
  console.log(`Link de acesso (guarde; vale até gerar outro com --novo-token): /entrar?t=${TOKEN}`);
});
