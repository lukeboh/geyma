// Abas 2 (Proteção) e 3 (Revisão) do painel: cruzamento das bibliotecas,
// visão por ano e lista filtrável para revisar item a item.
import { CLASSES } from './src/core/match.js';
import { CATEGORIES, DECISIONS, suggestDecision } from './src/core/classify.js';
import { patchItems } from './src/core/db.js';
import { sendPlan, effectiveDecision } from './src/core/plan.js';
import { phashFromBlob } from './src/core/phash-image.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR');
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const day = (ts) => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const when = (ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' });

// ordem fixa das classes (empilhamento, legenda, cartões); a cor segue a classe
const ORDER = ['ambos', 'confirmar', 'reduzida', 'soGoogle', 'soIcloud'];
const EXPLAIN = {
  ambos: 'Mesmo instante e mesmas dimensões nos dois serviços, sem outro candidato. Protegidas em dois lugares.',
  confirmar: 'Batem pelos metadados, mas há outra foto no mesmo segundo (rajada ou duplicata). Falta a confirmação visual.',
  reduzida: 'Mesma foto, mas um dos lados guarda uma cópia menor. Perda de qualidade a corrigir.',
  soGoogle: 'Só existem no Google Fotos. Candidatas a enviar para o iCloud, depois da sua revisão.',
  soIcloud: 'Só existem no iCloud. Candidatas a enviar para o Google, depois da sua revisão.',
};

let data = null;
let worker = null;
let busy = false;

export function initProtection() {
  document.body.append($('tooltip'));
  $('m-refresh').addEventListener('click', compute);
  for (const id of ['r-cls', 'r-cat', 'r-dec', 'r-year', 'r-kind']) $(id).addEventListener('change', () => { page = 0; renderList(); });
  for (const [k, l] of Object.entries(CATEGORIES)) $('r-cat').append(new Option(l, k));
  for (const [k, l] of Object.entries(DECISIONS)) $('r-dec').append(new Option(l, k));
  for (const b of document.querySelectorAll('#r-batch button[data-dec]')) b.addEventListener('click', () => askBatch(b.dataset.dec));
  $('r-confirm-yes').addEventListener('click', confirmBatch);
  $('r-view-list').addEventListener('click', () => setGrid(false));
  $('r-view-grid').addEventListener('click', () => setGrid(true));
  for (const [k, l] of Object.entries(DECISIONS)) $('r-sel-dec').append(new Option(l, k));
  $('r-sel-dec').value = 'descartar';
  $('r-sel-apply').addEventListener('click', applySelection);
  $('r-sel-all').addEventListener('click', () => selectAll(true));
  $('r-sel-none').addEventListener('click', () => selectAll(false));
  $('r-confirm-no').addEventListener('click', cancelBatch);
  $('r-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderList(); });
  $('r-next').addEventListener('click', () => { page++; renderList(); });
  $('r-csv').addEventListener('click', exportCsv);
  $('m-phash').addEventListener('click', startPhash);
  $('m-ic-run').addEventListener('click', runIcloudCheck);
  $('m-ic-stop').addEventListener('click', () => { if (icJob) icJob.stop = true; });
  $('m-phash-stop').addEventListener('click', () => chrome.runtime.sendMessage({ kind: 'stop', site: 'google' }));
  const cls = $('r-cls');
  cls.append(new Option('Todas', ''));
  for (const k of ORDER) cls.append(new Option(CLASSES[k], k));
  cls.append(new Option('Cópias repetidas no Google (conferidas)', 'dupGoogle'));
  cls.value = '';
}

/** Calcula na primeira visita; depois só quando pedido (Recalcular) ou quando o iCloud termina. */
export function ensureComputed() {
  if (!data && !busy) compute();
}

export function compute() {
  if (busy) return;
  busy = true;
  $('m-refresh').disabled = true;
  $('m-time').textContent = 'calculando…';
  const t0 = performance.now();
  worker ??= new Worker('src/match-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    busy = false;
    $('m-refresh').disabled = false;
    if (!e.data.ok) { $('m-headline').textContent = `Não foi possível cruzar: ${e.data.reason}`; $('m-time').textContent = ''; return; }
    data = e.data;
    $('m-time').textContent = `calculado em ${((performance.now() - t0) / 1000).toFixed(1)} s`;
    renderProtection();
    fillYears();
    renderList();
  };
  worker.postMessage('run');
}

function renderProtection() {
  const { summary: s, until, complete, counts, dup } = data;
  const t = s.totals;
  const both = t.ambos + t.confirmar + t.reduzida;
  const icloudScope = both + t.soIcloud;
  const googleScope = both + t.soGoogle;

  const banner = $('m-partial');
  banner.hidden = complete || !until;
  if (!complete && until) {
    banner.textContent = `Cruzamento parcial: o iCloud ainda está sendo lido. Por enquanto só entram as fotos até ${day(until)}, dos dois lados. Quando o percurso terminar, clique em Recalcular.`;
  }
  if (!counts.google || !counts.icloud) {
    $('m-headline').textContent = 'Leia os dois serviços na aba Inventário para ver o cruzamento.';
    $('m-sub').textContent = '';
    return;
  }
  $('m-headline').innerHTML = `<b>${pct(both, icloudScope)}</b> das fotos do iCloud também estão no Google, e <b>${pct(both, googleScope)}</b> das fotos do Google também estão no iCloud.`;
  $('m-sub').textContent = `${fmt.format(both)} fotos em ambos · ${fmt.format(t.soGoogle)} só no Google · ${fmt.format(t.soIcloud)} só no iCloud`;

  const box = $('m-classes');
  box.innerHTML = '';
  for (const k of ORDER) {
    const card = document.createElement('article');
    card.className = 'class-card';
    card.style.setProperty('--cor', `var(--c-${k})`);
    const extra = k === 'reduzida' && t.reduzida
      ? `<p class="hint">menor no Google: ${fmt.format(s.reduzidaMenor.google)} · menor no iCloud: ${fmt.format(s.reduzidaMenor.icloud)}</p>`
      : '';
    card.innerHTML = `<h3><i class="swatch c-${k}"></i>${CLASSES[k]}</h3><p class="big">${fmt.format(t[k])}</p><p class="hint">${EXPLAIN[k]}</p>${extra}`;
    const btn = document.createElement('button');
    btn.textContent = 'Ver lista';
    btn.disabled = !t[k];
    btn.addEventListener('click', () => { $('r-cls').value = k; $('r-cat').value = ''; $('r-dec').value = ''; page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' })); });
    card.append(btn);
    box.append(card);
  }

  $('m-legend').innerHTML = ORDER.map((k) => `<span><i class="swatch c-${k}"></i>${CLASSES[k]}</span>`).join('');
  drawStack(s.byYear);

  renderDup();
  renderCategories();
  renderPlan();
  renderIcloudCheck();
}

// ---------- desempate pelo iCloud ----------
let icJob = null;
function renderIcloudCheck() {
  const need = data.icloudPhashNeeded || [];
  const disputed = data.summary.totals.confirmar + data.summary.totals.reduzida;
  $('m-ic-box').hidden = !disputed;
  $('m-ic').innerHTML = need.length
    ? `<b>${fmt.format(need.length)}</b> itens do iCloud têm miniatura guardada e podem desempatar pares.`
    : `Nenhum item com miniatura do iCloud guardada para desempatar. As miniaturas chegam no próximo percurso da biblioteca do iCloud (aba Inventário).`;
  $('m-ic-run').hidden = !need.length || Boolean(icJob);
}

async function runIcloudCheck() {
  const need = data?.icloudPhashNeeded || [];
  if (!need.length || icJob) return;
  icJob = { stop: false, done: 0, failed: 0, expired: 0 };
  $('m-ic-run').hidden = true;
  $('m-ic-stop').hidden = false;
  const queue = [...need];
  let batch = [];
  const flush = async () => { if (batch.length) { const b = batch; batch = []; await patchItems(b); } };
  const show = (msg) => { $('m-ic-state').textContent = msg || `conferindo… ${fmt.format(icJob.done)} de ${fmt.format(need.length)} (falhas: ${fmt.format(icJob.failed)})`; };
  const worker = async () => {
    while (queue.length && !icJob.stop) {
      const it = queue.shift();
      try {
        const res = await fetch(it.url.replace('${f}', 'thumb.jpg'));
        if (!res.ok) {
          icJob.failed++;
          if ([401, 403, 404, 410].includes(res.status)) icJob.expired++;
          // as primeiras falharem todas: URLs expiradas, não insiste
          if (icJob.done === 0 && icJob.expired >= 8) icJob.stop = 'expiradas';
          continue;
        }
        batch.push({ id: it.id, phash: await phashFromBlob(await res.blob()) });
        icJob.done++;
        if (batch.length >= 50) await flush();
        if (icJob.done % 50 === 0) show();
      } catch { icJob.failed++; }
    }
  };
  show();
  await Promise.all(Array.from({ length: 4 }, worker));
  await flush();
  const why = icJob.stop === 'expiradas' ? 'as URLs das miniaturas expiraram: percorra a biblioteca do iCloud de novo e tente outra vez'
    : icJob.stop ? 'parada por você' : 'concluída';
  show(`${why}: ${fmt.format(icJob.done)} de ${fmt.format(need.length)} conferidos, ${fmt.format(icJob.failed)} falhas.`);
  icJob = null;
  $('m-ic-stop').hidden = true;
  compute();
}

const GB = (bytes) => `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;

/** Prévia do envio curado, a partir das marcações em vigor. */
export function renderPlan() {
  if (!data) return;
  const plan = sendPlan(data.rows);
  $('m-plan-box').hidden = !data.rows.length;
  $('m-plan').innerHTML = [
    ['iCloud → Google', plan.toGoogle.n, `${GB(plan.toGoogle.bytes)}, dos quais ${fmt.format(plan.toGoogle.videos)} vídeos somam ${GB(plan.toGoogle.videoBytes)} · ${fmt.format(plan.toGoogle.held)} retidos (Pendente ou Descartar)`],
    ['Google → iCloud', plan.toIcloud.n, `${GB(plan.toIcloud.bytes)} estimados · ${fmt.format(plan.toIcloud.held)} retidos`],
    ['Reenviar original ao Google', plan.quality.n, 'o Google guarda uma cópia menor; o iCloud tem a melhor'],
  ].map(([t, n, sub]) => `<article><span>${t}</span><span class="n">${fmt.format(n)}</span><span class="hint">${sub}</span></article>`).join('');
  $('m-plan-note').textContent = 'O tamanho do lado do Google é estimado pela resolução, com a média de bytes por pixel das fotos do iCloud (o Google não informa o tamanho dos arquivos). Vídeos do Google entram pela mesma estimativa.';
}

function renderCategories() {
  const counts = {};
  for (const r of data.rows) counts[r.cat] = (counts[r.cat] || 0) + 1;
  $('m-cat-box').hidden = !data.rows.length;
  const box = $('m-cats');
  box.innerHTML = '';
  for (const [k, label] of Object.entries(CATEGORIES)) {
    const el = document.createElement('article');
    const sug = DECISIONS[suggestDecision(k)];
    el.innerHTML = `<span>${label}</span><span class="n">${fmt.format(counts[k] || 0)}</span><span class="hint">sugestão: ${sug}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Revisar';
    btn.disabled = !counts[k];
    btn.addEventListener('click', () => {
      $('r-cls').value = ''; $('r-cat').value = k; $('r-dec').value = ''; page = 0; renderList();
      document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' }));
    });
    el.append(btn);
    box.append(el);
  }
}

function renderDup() {
  const { dup, phashNeeded } = data;
  $('m-dup-box').hidden = !dup.groups;
  const lines = [`<b>${fmt.format(dup.groups)}</b> grupos, com <b>${fmt.format(dup.extras)}</b> itens além do primeiro de cada grupo.`];
  const checked = dup.groups - dup.pendentes;
  if (checked) {
    lines.push(`Conferidos pelas miniaturas: <b>${fmt.format(checked)}</b> grupos. A mesma foto repetida: <b>${fmt.format(dup.confirmados)}</b> grupos, com <b>${fmt.format(dup.extrasConfirmados)}</b> cópias a mais. Fotos diferentes: ${fmt.format(dup.diferentes)}. Incertos: ${fmt.format(dup.incertos)}.`);
  }
  $('m-dup').innerHTML = lines.map((l) => `<span class="line">${l}</span>`).join('');
  const btn = $('m-phash');
  btn.hidden = !phashNeeded.length;
  btn.textContent = `Conferir pelas miniaturas (${fmt.format(phashNeeded.length)} itens)`;
  showPhashProgress(data.phashProgress);
}

export function showPhashProgress(p) {
  const el = $('m-phash-state');
  if (!p) { el.textContent = ''; return; }
  const n = `${fmt.format(p.done || 0)} de ${fmt.format(p.total || 0)} miniaturas`;
  // "lendo" gravado há mais de 2 min sem atualização = conferência interrompida
  // (por exemplo, a extensão foi recarregada); o botão volta a funcionar
  const stale = p.state === 'lendo' && p.at && Date.now() - p.at > 120000;
  if (stale) p = { ...p, state: 'interrompida' };
  const label = { interrompida: `interrompida em ${n}; clique para continuar`, lendo: `conferindo… ${n}`, concluido: `conferência concluída: ${n}`, parado: `parada por você: ${n}`, erro: `parou por erro do Google (${p.status || p.reason || '?'}): ${n}` }[p.state] || p.state;
  el.textContent = label;
  $('m-phash').disabled = p.state === 'lendo';
  $('m-phash-stop').hidden = p.state !== 'lendo';
}

async function startPhash() {
  if (!data?.phashNeeded.length) return;
  $('m-phash').disabled = true;
  const res = await chrome.runtime.sendMessage({ kind: 'phash', keys: data.phashNeeded });
  if (!res?.ok) { $('m-phash-state').textContent = `Não foi possível: ${res?.reason || 'abra o Google Fotos e tente de novo'}`; $('m-phash').disabled = false; }
  else showPhashProgress({ state: 'lendo', done: 0, total: data.phashNeeded.length });
}

function drawStack(byYear) {
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const thead = document.querySelector('#m-table thead');
  thead.innerHTML = `<tr><th>Ano</th>${ORDER.map((k) => `<th>${CLASSES[k]}</th>`).join('')}</tr>`;
  const tbody = document.querySelector('#m-table tbody');
  tbody.innerHTML = years.map((y) => `<tr><td>${y}</td>${ORDER.map((k) => `<td>${fmt.format(byYear[y][k])}</td>`).join('')}</tr>`).join('');

  const chart = $('m-chart');
  if (!years.length) { chart.innerHTML = '<p class="muted">Sem dados ainda.</p>'; return; }
  const W = Math.max(560, chart.clientWidth || 900); // largura real: texto dos eixos em tamanho legível
  const H = 260, padL = 52, padB = 26, padT = 10;
  const tot = (y) => ORDER.reduce((n, k) => n + byYear[y][k], 0);
  const max = Math.max(1, ...years.map(tot));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotH = H - padB - padT;
  const colW = (W - padL) / years.length;
  const barW = Math.max(2, Math.min(22, colW - (colW > 8 ? 3 : 1)));
  const ns = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => { const n = document.createElementNS(ns, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });
  const grid = el('g', { class: 'grid axis' });
  for (let v = 0; v <= top; v += step) {
    const yy = padT + plotH - (v / top) * plotH;
    grid.append(el('line', { x1: padL, x2: W, y1: yy, y2: yy }));
    const t = el('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end' });
    t.textContent = fmt.format(v);
    grid.append(t);
  }
  svg.append(grid);
  const labelEvery = Math.ceil(years.length / Math.max(4, Math.floor(W / 60)));
  years.forEach((yr, i) => {
    const g = el('g', { class: 'col' });
    const x = padL + i * colW + (colW - barW) / 2;
    let base = padT + plotH;
    const segs = ORDER.filter((k) => byYear[yr][k]);
    segs.forEach((k, j) => {
      const h = Math.max(1, plotH * (byYear[yr][k] / top));
      const gap = j < segs.length - 1 && h > 3 ? 2 : 0; // espaço de 2px entre segmentos
      base -= h;
      g.append(el('rect', { class: `c-${k}`, x, y: base + gap, width: barW, height: Math.max(1, h - gap), rx: j === segs.length - 1 ? Math.min(4, barW / 2) : 0 }));
    });
    const hit = el('rect', { class: 'hit', x: padL + i * colW, y: padT, width: colW, height: plotH });
    hit.addEventListener('mousemove', (e) => tip(e, yr, byYear[yr]));
    hit.addEventListener('mouseleave', () => { $('tooltip').hidden = true; });
    g.append(hit);
    if (i % labelEvery === 0) {
      const t = el('text', { x: padL + i * colW + colW / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' });
      t.textContent = years.length > 14 ? `'${String(yr).slice(2)}` : yr;
      g.append(t);
    }
    svg.append(g);
  });
  chart.innerHTML = '';
  chart.append(svg);
}

function tip(e, yr, row) {
  const t = $('tooltip');
  t.innerHTML = `<b>${yr}</b>${ORDER.map((k) => `<span class="tip-row"><i class="swatch c-${k}"></i>${CLASSES[k]}: ${fmt.format(row[k])}</span>`).join('')}`;
  t.hidden = false;
  t.style.left = `${Math.min(e.clientX + 14, innerWidth - 260)}px`;
  t.style.top = `${e.clientY + 14}px`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

// ---------- revisão ----------
let gridMode = false;
const pageSize = () => (gridMode ? 120 : 50);
let page = 0;
let pendingBatch = null;
let selected = new Set();
let pageRows = [];

function fillYears() {
  const sel = $('r-year');
  const keep = sel.value;
  const years = Object.keys(data.summary.byYear).sort().reverse();
  sel.length = 1;
  for (const y of years) sel.append(new Option(y, y));
  sel.value = years.includes(keep) ? keep : '';
}

// marcação em vigor: a do usuário ou, sem ela, a sugestão das regras
const effective = effectiveDecision;

function filtered() {
  if (!data) return [];
  const cls = $('r-cls').value;
  const cat = $('r-cat').value;
  const dec = $('r-dec').value;
  const year = $('r-year').value;
  const kind = $('r-kind').value;
  return data.rows.filter((r) => (cls === '' || (cls === 'dupGoogle' ? r.dup : r.cls === cls))
    && (!cat || r.cat === cat)
    && (!dec || (dec === 'sugestao' ? !r.decision : r.decision === dec))
    && (!year || new Date(r.ts).getUTCFullYear() === Number(year))
    && (!kind || (kind === 'video') === Boolean(r.a?.video)))
    .sort((x, y) => y.ts - x.ts);
}

const dims = (o) => (o?.w ? `${o.w}×${o.h}` : '—');
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '');

function renderReviewSummary() {
  if (!data) return;
  const counts = { pessoal: 0, pendente: 0, manter: 0, descartar: 0 };
  let decided = 0;
  for (const r of data.rows) { counts[effective(r)]++; if (r.decision) decided++; }
  $('r-summary').innerHTML = `Marcadas por você: <b>${fmt.format(decided)}</b> de ${fmt.format(data.rows.length)} fotos. `
    + `Em vigor (sua marcação ou a sugestão): ${Object.entries(DECISIONS).map(([k, l]) => `${l} ${fmt.format(counts[k])}`).join(' · ')}.`;
}

function renderList() {
  const rows = filtered();
  const PAGE = pageSize();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(page, pages - 1);
  $('r-count').textContent = data ? `${fmt.format(rows.length)} itens` : 'abra a aba Proteção para calcular';
  $('r-page').textContent = `página ${page + 1} de ${pages}`;
  $('r-prev').disabled = page === 0;
  $('r-next').disabled = page >= pages - 1;
  $('r-batch-n').textContent = fmt.format(rows.length);
  for (const b of document.querySelectorAll('#r-batch button[data-dec]')) b.disabled = !rows.length;
  cancelBatch();
  renderReviewSummary();
  pageRows = rows.slice(page * PAGE, (page + 1) * PAGE);
  selected = new Set();
  $('r-list').hidden = gridMode;
  $('r-grid').hidden = !gridMode;
  $('r-selbar').hidden = !gridMode;
  if (gridMode) { renderGrid(); return; }
  const tbody = document.querySelector('#r-table tbody');
  tbody.innerHTML = '';
  for (const r of pageRows) {
    const tr = document.createElement('tr');
    const note = r.cls === 'reduzida' ? ` <span class="tag">menor no ${r.menor === 'google' ? 'Google' : 'iCloud'}</span>` : r.dup ? ' <span class="tag">cópia repetida</span>' : '';
    tr.innerHTML = `<td class="thumbs"></td><td>${when(r.ts)}</td><td><i class="swatch c-${r.cls}"></i> ${CLASSES[r.cls]}${note}</td><td class="cat"></td><td class="dec"></td><td class="name"></td><td>${dims(r.a)} ${mb(r.a?.size)}</td><td>${dims(r.g)}</td>`;
    const cat = tr.querySelector('.cat');
    cat.textContent = CATEGORIES[r.cat];
    if (r.why) cat.title = r.why;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Marcação');
    sel.append(new Option(`sugestão: ${DECISIONS[suggestDecision(r.cat)]}`, ''));
    for (const [k, l] of Object.entries(DECISIONS)) sel.append(new Option(l, k));
    sel.value = r.decision || '';
    sel.classList.toggle('suggested', !r.decision);
    sel.addEventListener('change', async () => {
      await decide([r], sel.value || null);
      sel.classList.toggle('suggested', !r.decision);
      renderReviewSummary();
      renderPlan();
    });
    tr.querySelector('.dec').append(sel);
    tr.querySelector('.name').textContent = r.a?.name || (r.a ? '(sem nome)' : '—');
    fillThumbs(tr.querySelector('.thumbs'), r);
    tbody.append(tr);
  }
}

// ---------- miniaturas ----------
// Google: a imagem exige a sessão; a extensão busca com cookies (permissão de
// host) e mostra como blob. iCloud: URL temporária assinada, carregada direto.
const thumbCache = new Map();
let thumbActive = 0;
const thumbQueue = [];
function googleThumb(base) {
  if (thumbCache.has(base)) return thumbCache.get(base);
  const p = new Promise((resolve) => thumbQueue.push({ base, resolve }));
  thumbCache.set(base, p);
  pumpThumbs();
  return p;
}
function pumpThumbs() {
  while (thumbActive < 6 && thumbQueue.length) {
    const { base, resolve } = thumbQueue.shift();
    thumbActive++;
    fetch(`${base}=w160-h160-c`, { credentials: 'include' })
      .then(async (res) => {
        const type = res.headers.get('content-type') || '';
        resolve(res.ok && type.startsWith('image/') && !type.includes('png') ? URL.createObjectURL(await res.blob()) : null);
      })
      .catch(() => resolve(null))
      .finally(() => { thumbActive--; pumpThumbs(); });
  }
}

function fillThumbs(td, r, link = true) {
  const add = (label, side) => {
    const fig = document.createElement('a');
    fig.className = `thumb ${side}`;
    fig.title = label;
    if (link && side === 'google' && r.g?.key) { fig.href = `https://photos.google.com/photo/${r.g.key}`; fig.target = '_blank'; fig.rel = 'noopener'; }
    const img = document.createElement('img');
    img.alt = label;
    img.loading = 'lazy';
    img.onerror = () => fig.classList.add('missing');
    fig.append(img);
    td.append(fig);
    return img;
  };
  if (r.a?.thumb) add('Miniatura no iCloud', 'icloud').src = r.a.thumb.replace('${f}', 'thumb.jpg');
  // cópia repetida: mostra a original ao lado, para conferir antes de decidir
  if (r.dupOf?.thumb) {
    const img = add('Original no Google (esta linha é uma cópia dela)', 'original');
    googleThumb(r.dupOf.thumb).then((src) => { if (src) img.src = src; else img.parentElement.classList.add('missing'); });
  }
  if (r.g?.thumb) {
    const img = add(link ? 'Miniatura no Google (clique para abrir no Google Fotos)' : 'Miniatura no Google', 'google');
    googleThumb(r.g.thumb).then((src) => { if (src) img.src = src; else img.parentElement.classList.add('missing'); });
  }
  if (!td.children.length) td.innerHTML = '<span class="hint">sem miniatura</span>';
}

/** Grava a marcação nos itens (os dois lados do par). null volta para a sugestão. */
async function decide(rows, decision) {
  const at = Date.now();
  const patches = [];
  for (const r of rows) {
    r.decision = decision;
    for (const id of r.ids) patches.push({ id, decision, decidedAt: decision ? at : null });
  }
  for (let i = 0; i < patches.length; i += 5000) await patchItems(patches.slice(i, i + 5000));
}

function askBatch(decision, rows = filtered(), what = 'itens') {
  if (!rows.length) return;
  pendingBatch = { decision, rows };
  $('r-confirm-text').textContent = `Marcar ${fmt.format(rows.length)} ${what} como ${DECISIONS[decision]}? Isso só registra a sua decisão aqui; nada muda nos serviços.`;
  $('r-confirm').hidden = false;
}

// ---------- grade ----------
function renderGrid() {
  const grid = $('r-grid');
  grid.innerHTML = '';
  for (const r of pageRows) {
    const tile = document.createElement('label');
    tile.className = 'tile';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => {
      if (box.checked) selected.add(r); else selected.delete(r);
      tile.classList.toggle('on', box.checked);
      $('r-sel-n').textContent = fmt.format(selected.size);
    });
    const pic = document.createElement('div');
    pic.className = 'pic';
    fillThumbs(pic, r, false);
    const cap = document.createElement('span');
    cap.className = 'cap';
    const dec = r.decision ? DECISIONS[r.decision] : `sugestão: ${DECISIONS[suggestDecision(r.cat)]}`;
    cap.textContent = `${r.dup ? 'cópia · ' : ''}${day(r.ts)} · ${dec}`;
    tile.title = `${CATEGORIES[r.cat]}${r.why ? ` (${r.why})` : ''}${r.a?.name ? ` · ${r.a.name}` : ''}`;
    tile.append(box, pic, cap);
    grid.append(tile);
  }
  $('r-sel-n').textContent = '0';
}

function setGrid(on) {
  gridMode = on;
  $('r-view-list').setAttribute('aria-pressed', String(!on));
  $('r-view-grid').setAttribute('aria-pressed', String(on));
  page = 0;
  renderList();
}

function applySelection() {
  const which = $('r-sel-which').value;
  const rows = which === 'sel' ? [...selected] : pageRows.filter((r) => !selected.has(r));
  askBatch($('r-sel-dec').value, rows, which === 'sel' ? 'itens selecionados' : 'itens não selecionados desta página');
}

function selectAll(on) {
  for (const box of $('r-grid').querySelectorAll('input[type=checkbox]')) {
    if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event('change')); }
  }
}

function cancelBatch() { pendingBatch = null; $('r-confirm').hidden = true; }

async function confirmBatch() {
  if (!pendingBatch) return;
  const { decision, rows } = pendingBatch;
  $('r-confirm-text').textContent = 'gravando…';
  await decide(rows, decision);
  $('r-msg').textContent = `${fmt.format(rows.length)} itens marcados como ${DECISIONS[decision]}.`;
  renderList();
  renderPlan();
}

function exportCsv() {
  const rows = filtered();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['captura_utc', 'situacao', 'categoria', 'motivo', 'marcacao', 'arquivo_icloud', 'icloud_dim', 'icloud_bytes', 'google_dim', 'video'].join(',')];
  for (const r of rows) {
    lines.push([new Date(r.ts).toISOString(), CLASSES[r.cls], CATEGORIES[r.cat], r.why, r.decision ? DECISIONS[r.decision] : `sugestão: ${DECISIONS[suggestDecision(r.cat)]}`,
      r.a?.name, dims(r.a), r.a?.size, dims(r.g), r.a?.video ? 'sim' : ''].map(esc).join(','));
  }
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `geyma-revisao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function hasData() { return Boolean(data); }
