// Abas 2 (Proteção) e 3 (Revisão) do painel: cruzamento das bibliotecas,
// visão por ano e lista filtrável para revisar item a item.
import { CLASSES } from './src/core/match.js';

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
  for (const id of ['r-cls', 'r-year', 'r-kind']) $(id).addEventListener('change', () => { page = 0; renderList(); });
  $('r-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderList(); });
  $('r-next').addEventListener('click', () => { page++; renderList(); });
  $('r-csv').addEventListener('click', exportCsv);
  $('m-phash').addEventListener('click', startPhash);
  $('m-phash-stop').addEventListener('click', () => chrome.runtime.sendMessage({ kind: 'stop', site: 'google' }));
  const cls = $('r-cls');
  for (const k of ORDER) cls.append(new Option(CLASSES[k], k));
  cls.append(new Option('Cópias repetidas no Google (conferidas)', 'dupGoogle'));
  cls.value = 'soIcloud';
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
    const extra = k === 'reduzida' && t.reduzida
      ? `<p class="hint">menor no Google: ${fmt.format(s.reduzidaMenor.google)} · menor no iCloud: ${fmt.format(s.reduzidaMenor.icloud)}</p>`
      : '';
    card.innerHTML = `<h3><i class="swatch c-${k}"></i>${CLASSES[k]}</h3><p class="big">${fmt.format(t[k])}</p><p class="hint">${EXPLAIN[k]}</p>${extra}`;
    const btn = document.createElement('button');
    btn.textContent = 'Ver lista';
    btn.disabled = !t[k];
    btn.addEventListener('click', () => { $('r-cls').value = k; page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' })); });
    card.append(btn);
    box.append(card);
  }

  $('m-legend').innerHTML = ORDER.map((k) => `<span><i class="swatch c-${k}"></i>${CLASSES[k]}</span>`).join('');
  drawStack(s.byYear);

  renderDup();
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
  const label = { lendo: `conferindo… ${n}`, concluido: `conferência concluída: ${n}`, parado: `parada por você: ${n}`, erro: `parou por erro do Google (${p.status || p.reason || '?'}): ${n}` }[p.state] || p.state;
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
const PAGE = 50;
let page = 0;

function fillYears() {
  const sel = $('r-year');
  const keep = sel.value;
  const years = Object.keys(data.summary.byYear).sort().reverse();
  sel.length = 1;
  for (const y of years) sel.append(new Option(y, y));
  sel.value = years.includes(keep) ? keep : '';
}

function filtered() {
  if (!data) return [];
  const cls = $('r-cls').value;
  const year = $('r-year').value;
  const kind = $('r-kind').value;
  return data.rows.filter((r) => (cls === 'dupGoogle' ? r.dup : r.cls === cls)
    && (!year || new Date(r.ts).getUTCFullYear() === Number(year))
    && (!kind || (kind === 'video') === Boolean(r.a?.video)))
    .sort((x, y) => y.ts - x.ts);
}

const dims = (o) => (o?.w ? `${o.w}×${o.h}` : '—');
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '');

function renderList() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(page, pages - 1);
  $('r-count').textContent = data ? `${fmt.format(rows.length)} itens` : 'abra a aba Proteção para calcular';
  $('r-page').textContent = `página ${page + 1} de ${pages}`;
  $('r-prev').disabled = page === 0;
  $('r-next').disabled = page >= pages - 1;
  const tbody = document.querySelector('#r-table tbody');
  tbody.innerHTML = '';
  for (const r of rows.slice(page * PAGE, (page + 1) * PAGE)) {
    const tr = document.createElement('tr');
    const note = r.cls === 'reduzida' ? ` <span class="tag">menor no ${r.menor === 'google' ? 'Google' : 'iCloud'}</span>` : '';
    tr.innerHTML = `<td>${when(r.ts)}</td><td><i class="swatch c-${r.cls}"></i> ${CLASSES[r.cls]}${note}</td><td class="name"></td><td>${dims(r.a)} ${mb(r.a?.size)}</td><td>${dims(r.g)}</td>`;
    tr.querySelector('.name').textContent = r.a?.name || (r.a ? '(sem nome)' : '—');
    tbody.append(tr);
  }
}

function exportCsv() {
  const rows = filtered();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['captura_utc', 'situacao', 'arquivo_icloud', 'icloud_dim', 'icloud_bytes', 'google_dim', 'video'].join(',')];
  for (const r of rows) lines.push([new Date(r.ts).toISOString(), CLASSES[r.cls], r.a?.name, dims(r.a), r.a?.size, dims(r.g), r.a?.video ? 'sim' : ''].map(esc).join(','));
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `geyma-${$('r-cls').value}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function hasData() { return Boolean(data); }
