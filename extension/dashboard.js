import { getItemsBySource, getMeta } from './src/core/db.js';
import { summarize } from './src/core/normalize.js';
import { initProtection, ensureComputed, compute, hasData, showPhashProgress } from './protection.js';
import { startTour, maybeTour } from './tour.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR');
const day = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const STATE_LABEL = {
  lendo: 'lendo…',
  concluido: 'concluído',
  parado: 'parado por você',
  aguardando: 'aguardando',
  erro: 'erro',
  ocupado: 'já em execução',
};

const quando = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Texto da situação de uma leitura. meta = {value, at} gravado pela extensão. */
function describe(meta, completed) {
  const progress = meta?.value;
  const doneNote = completed?.at && progress?.state !== 'concluido' ? ` · último percurso completo em ${quando(completed.at)}` : '';
  if (!progress) return { text: completed?.at ? `concluído em ${quando(completed.at)}` : 'não iniciado', error: false };
  // "lendo"/"aguardando" sem notícia há mais de 10 min: a leitura não está mais rodando
  // (extensão recarregada, aba fechada) ou espera a aba ficar visível há muito tempo
  if (['lendo', 'aguardando'].includes(progress.state) && meta.at && Date.now() - meta.at > 600000) {
    const pct = typeof progress.frac === 'number' ? ` em ${Math.round(progress.frac * 100)}% da grade` : '';
    return { text: `sem notícias desde ${quando(meta.at)}${pct}; use Continuar de onde parou${doneNote}`, error: false };
  }
  const base = STATE_LABEL[progress.state] || progress.state;
  const extra = progress.reason || (progress.status ? `servidor respondeu ${progress.status}` : '');
  const pct = typeof progress.frac === 'number' && progress.state !== 'concluido' ? ` (${Math.round(progress.frac * 100)}% da grade)` : '';
  const pages = progress.pages ? ` — ${progress.pages} páginas` : '';
  return { text: `${base}${pct}${pages}${extra ? ` — ${extra}` : ''}${doneNote}`, error: progress.state === 'erro' };
}

function setState(el, meta, completed) {
  const d = describe(meta, completed);
  el.textContent = d.text;
  el.classList.toggle('state-erro', d.error);
}

let rendering = false;
let pending = false;
async function render() {
  if (rendering) { pending = true; return; }
  rendering = true;
  try {
    const [g, a, gp, ap, counts, done] = await Promise.all([
      getItemsBySource('google'),
      getItemsBySource('icloud'),
      getMeta('googleProgress'),
      getMeta('icloudProgress'),
      getMeta('icloudCounts'),
      getMeta('icloudCompleted'),
    ]);
    const gs = summarize(g);
    const as = summarize(a);
    $('g-total').textContent = fmt.format(gs.total);
    $('g-range').textContent = gs.total ? `${day(gs.from)} a ${day(gs.to)}` : '—';
    setState($('g-state'), gp);
    $('a-total').textContent = fmt.format(as.total);
    $('a-range').textContent = as.total ? `${day(as.from)} a ${day(as.to)}` : '—';
    $('a-videos').textContent = as.total ? fmt.format(as.videos) : '—';
    setState($('a-state'), ap, done);

    const c = counts?.value || {};
    const appleTotal = c.CPLAssetByAssetDateWithoutHiddenOrDeleted;
    $('a-coverage').textContent = appleTotal
      ? `de ${fmt.format(appleTotal)} informados pela Apple (${Math.min(100, Math.round((100 * as.total) / appleTotal))}%)`
      : 'itens no inventário';
    const extras = Object.entries(c).filter(([k]) => k !== 'CPLAssetByAssetDateWithoutHiddenOrDeleted');
    $('a-counts-box').hidden = !extras.length;
    $('a-counts').innerHTML = '';
    for (const [k, v] of extras) {
      const li = document.createElement('li');
      li.textContent = `${k}: ${fmt.format(v)}`;
      $('a-counts').append(li);
    }
    drawYears(gs.byYear, as.byYear);
  } finally {
    rendering = false;
    if (pending) { pending = false; setTimeout(render, 300); }
  }
}

function drawYears(gy, ay) {
  const years = [...new Set([...Object.keys(gy), ...Object.keys(ay)])].map(Number).sort((x, y) => x - y);
  const tbody = document.querySelector('#year-table tbody');
  tbody.innerHTML = '';
  for (const y of years) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${y}</td><td>${fmt.format(gy[y] || 0)}</td><td>${fmt.format(ay[y] || 0)}</td>`;
    tbody.append(tr);
  }
  const chart = $('chart');
  if (!years.length) { chart.innerHTML = '<p class="muted">Sem dados ainda. Comece pela leitura de um dos serviços.</p>'; return; }

  const W = Math.max(560, years.length * 44);
  const H = 240, padL = 48, padB = 26, padT = 10;
  const max = Math.max(1, ...years.map((y) => Math.max(gy[y] || 0, ay[y] || 0)));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotH = H - padB - padT;
  const colW = (W - padL) / years.length;
  const barW = Math.min(16, (colW - 8) / 2);
  const y = (v) => padT + plotH - (v / top) * plotH;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  const grid = document.createElementNS(ns, 'g');
  grid.setAttribute('class', 'grid axis');
  for (let v = 0; v <= top; v += step) {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W);
    line.setAttribute('y1', y(v)); line.setAttribute('y2', y(v));
    grid.append(line);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', padL - 8); t.setAttribute('y', y(v) + 4); t.setAttribute('text-anchor', 'end');
    t.textContent = fmt.format(v);
    grid.append(t);
  }
  svg.append(grid);
  years.forEach((yr, i) => {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'col');
    const cx = padL + i * colW + colW / 2;
    const bar = (cls, v, x) => {
      if (!v) return;
      const r = document.createElementNS(ns, 'rect');
      const hgt = Math.max(1, plotH * (v / top));
      r.setAttribute('class', cls);
      r.setAttribute('x', x); r.setAttribute('y', padT + plotH - hgt);
      r.setAttribute('width', barW); r.setAttribute('height', hgt);
      r.setAttribute('rx', Math.min(4, barW / 2));
      g.append(r);
    };
    bar('g', gy[yr] || 0, cx - barW - 1);
    bar('a', ay[yr] || 0, cx + 1);
    const hit = document.createElementNS(ns, 'rect');
    hit.setAttribute('class', 'hit');
    hit.setAttribute('x', padL + i * colW); hit.setAttribute('y', padT);
    hit.setAttribute('width', colW); hit.setAttribute('height', plotH);
    hit.addEventListener('mousemove', (e) => showTip(e, yr, gy[yr] || 0, ay[yr] || 0));
    hit.addEventListener('mouseleave', hideTip);
    g.append(hit);
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', cx); label.setAttribute('y', H - 8); label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'axis');
    label.textContent = years.length > 14 ? `'${String(yr).slice(2)}` : yr;
    g.append(label);
    svg.append(g);
  });
  chart.innerHTML = '';
  chart.append(svg);
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

function showTip(e, yr, gv, av) {
  const tip = $('tooltip');
  tip.innerHTML = `<b>${yr}</b>Google Fotos: ${fmt.format(gv)}<br>iCloud Fotos: ${fmt.format(av)}`;
  tip.hidden = false;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 200)}px`;
  tip.style.top = `${e.clientY + 14}px`;
}
const hideTip = () => { $('tooltip').hidden = true; };

async function send(kind, site, extra = {}) {
  $('msg').textContent = '';
  const res = await chrome.runtime.sendMessage({ kind, site, ...extra });
  if (!res?.ok) $('msg').textContent = `Não foi possível: ${res?.reason || 'abra a aba do serviço e tente de novo'}`;
}

$('g-start').addEventListener('click', () => send('start', 'google'));
$('g-stop').addEventListener('click', () => send('stop', 'google'));
$('a-start').addEventListener('click', () => send('start', 'icloud'));
$('a-resume').addEventListener('click', () => send('start', 'icloud', { resume: true }));
$('a-stop').addEventListener('click', () => send('stop', 'icloud'));
$('export').addEventListener('click', async () => {
  const [g, a] = await Promise.all([getItemsBySource('google'), getItemsBySource('icloud')]);
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), google: g, icloud: a })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `geyma-inventario-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
});

// ---------- abas ----------
const TABS = { inv: 'view-inv', prot: 'view-prot', rev: 'view-rev' };
let current = 'inv';
function showTab(name) {
  if (!TABS[name]) name = 'inv';
  current = name;
  for (const [k, view] of Object.entries(TABS)) {
    $(view).hidden = k !== name;
    $(`tab-${k}`).setAttribute('aria-selected', String(k === name));
  }
  try { history.replaceState(null, '', `#${name}`); } catch {}
  if (name === 'inv') { render(); maybeTour('inv'); }
  else { ensureComputed(); if (hasData()) maybeTour(name); }
}
// Proteção e Revisão: o guia espera os dados do cruzamento (os quadros só aparecem com eles)
document.addEventListener('geyma-ready', () => { if (current !== 'inv') maybeTour(current, 300); });
$('ajuda').addEventListener('click', () => startTour(current));
for (const k of Object.keys(TABS)) $(`tab-${k}`).addEventListener('click', () => showTab(k));
document.addEventListener('geyma-tab', (e) => showTab(e.detail));
initProtection();

// ---------- tema ----------
$('tema').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('geyma-tema', root.dataset.theme); } catch {}
});

// ---------- vidro tátil: inclina de leve e acende o reflexo sob o ponteiro ----------
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function tatil(c) {
  if (c.dataset.tatil) return;
  c.dataset.tatil = '1';
  c.classList.add('tatil');
  const mover = (e) => {
    if (reduced.matches) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    // cartões grandes inclinam menos
    const k = Math.max(0.6, Math.min(3, 900 / Math.max(r.width, 1)));
    c.style.setProperty('--ry', `${((x - 0.5) * k).toFixed(2)}deg`);
    c.style.setProperty('--rx', `${((0.5 - y) * k).toFixed(2)}deg`);
    c.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    c.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    c.style.setProperty('--luz', '1');
  };
  const soltar = () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); c.style.setProperty('--luz', '0'); };
  c.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) mover(e); });
  c.addEventListener('pointerdown', mover);
  c.addEventListener('pointerleave', soltar);
  c.addEventListener('pointercancel', soltar);
}
// cartões entram e saem com os dados: observa o documento e aplica nos novos
const TATEIS = '.card, .class-card, .cat-grid article, .panel.lead';
const aplicar = () => document.querySelectorAll(TATEIS).forEach(tatil);
new MutationObserver(aplicar).observe(document.body, { childList: true, subtree: true });
aplicar();

// O inventário tem centenas de milhares de itens: redesenha no máximo a cada
// 5 s e só com a aba Inventário aberta.
let timer = null;
let lastIcloudState = null;
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind !== 'status') return;
  const st = msg.progress?.state;
  if (msg.progress?.task === 'phash') {
    showPhashProgress(msg.progress);
    if (st !== 'lendo' && hasData()) compute();
    return;
  }
  if (msg.site === 'icloud' && st && st !== lastIcloudState) {
    lastIcloudState = st;
    if (st === 'concluido' && hasData()) compute();
  }
  if (current !== 'inv' || timer) return;
  timer = setTimeout(() => { timer = null; render(); }, 5000);
});
showTab(location.hash.slice(1));
