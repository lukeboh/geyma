import * as db from './db.js';
import { requestAccessToken, pickPhotos } from './google.js';
import { scanDirectoryHandle, scanFileList } from './apple.js';
import { compare, toCsv } from './match.js';
import { buildPlans, estimateSeconds, formatDuration, formatBytes } from './estimate.js';

const $ = (selector) => document.querySelector(selector);

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const RING_CIRCUMFERENCE = 2 * Math.PI * 62;

let lastResult = null;
let lastPlans = null;
let lastTotals = null;
let direction = 'bi';

function setStatus(element, message, kind = '') {
  element.textContent = message;
  element.className = `status ${kind}`.trim();
}

function toggleHelp(link, panel) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    panel.classList.toggle('hidden');
  });
}

// ---- Passo 1: configuração ----

async function initConfig() {
  const input = $('#input-client-id');
  const saved = await db.getSetting('clientId');
  if (saved) {
    input.value = saved;
    setStatus($('#status-config'), 'Client ID salvo neste navegador.', 'ok');
    $('#btn-google-connect').disabled = false;
  }

  $('#btn-save-client-id').addEventListener('click', async () => {
    const clientId = input.value.trim();
    if (!clientId.endsWith('.apps.googleusercontent.com')) {
      setStatus($('#status-config'), 'Isso não parece um Client ID válido (deve terminar em .apps.googleusercontent.com).', 'error');
      return;
    }
    await db.setSetting('clientId', clientId);
    setStatus($('#status-config'), 'Client ID salvo neste navegador.', 'ok');
    $('#btn-google-connect').disabled = false;
  });

  toggleHelp($('#link-help-config'), $('#config-help'));
}

// ---- Passo 2: Google Fotos ----

async function refreshGoogleSummary() {
  const total = await db.count('googlePhotos');
  const summary = $('#summary-google');
  if (total > 0) {
    summary.textContent = `${total} itens do Google Fotos importados e salvos localmente.`;
    summary.classList.remove('hidden');
  } else {
    summary.classList.add('hidden');
  }
  updateCompareButton();
}

function initGoogle() {
  const status = $('#status-google');

  $('#btn-google-connect').addEventListener('click', async () => {
    try {
      const clientId = await db.getSetting('clientId');
      if (!clientId) {
        setStatus(status, 'Salve o Client ID no passo 1 antes de conectar.', 'error');
        return;
      }
      setStatus(status, 'Abrindo login do Google…', 'busy');
      const token = await requestAccessToken(clientId);
      const items = await pickPhotos(token, (message) => setStatus(status, message, 'busy'));
      await db.putAll('googlePhotos', items);
      setStatus(status, `Importação concluída: ${items.length} itens.`, 'ok');
      await refreshGoogleSummary();
    } catch (error) {
      setStatus(status, error.message, 'error');
    }
  });

  $('#btn-google-clear').addEventListener('click', async () => {
    await db.clearStore('googlePhotos');
    setStatus(status, 'Importação do Google removida.', '');
    await refreshGoogleSummary();
  });
}

// ---- Passo 3: Apple / iCloud ----

async function refreshAppleSummary() {
  const total = await db.count('applePhotos');
  const summary = $('#summary-apple');
  if (total > 0) {
    summary.textContent = `${total} itens da pasta do iCloud Fotos indexados e salvos localmente.`;
    summary.classList.remove('hidden');
  } else {
    summary.classList.add('hidden');
  }
  updateCompareButton();
}

function initApple() {
  const status = $('#status-apple');
  const progress = $('#apple-progress');

  const onProgress = (done, total) => {
    progress.classList.remove('hidden');
    progress.max = total;
    progress.value = done;
    setStatus(status, `Lendo arquivos… ${done}/${total}`, 'busy');
  };

  const ingest = async (records) => {
    await db.clearStore('applePhotos');
    await db.putAll('applePhotos', records);
    progress.classList.add('hidden');
    setStatus(status, `Indexação concluída: ${records.length} arquivos de mídia.`, 'ok');
    await refreshAppleSummary();
  };

  $('#btn-apple-pick').addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      setStatus(status, 'Seu navegador não suporta seleção de pasta. Use o botão alternativo ao lado.', 'error');
      return;
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
      setStatus(status, 'Varrendo a pasta…', 'busy');
      const records = await scanDirectoryHandle(dirHandle, onProgress);
      await ingest(records);
    } catch (error) {
      if (error.name === 'AbortError') return; // usuário cancelou o seletor
      progress.classList.add('hidden');
      setStatus(status, error.message, 'error');
    }
  });

  $('#input-apple-files').addEventListener('change', async (event) => {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      setStatus(status, 'Varrendo os arquivos…', 'busy');
      const records = await scanFileList(files, onProgress);
      await ingest(records);
    } catch (error) {
      progress.classList.add('hidden');
      setStatus(status, error.message, 'error');
    } finally {
      event.target.value = '';
    }
  });

  $('#btn-apple-clear').addEventListener('click', async () => {
    await db.clearStore('applePhotos');
    setStatus(status, 'Importação da Apple removida.', '');
    await refreshAppleSummary();
  });

  toggleHelp($('#link-help-apple'), $('#apple-help'));
}

// ---- Passo 4: painel de sincronização ----

// Contador animado: sobe do valor atual até o alvo com easing suave.
function animateValue(element, target) {
  const tile = element.closest('.stat');
  if (tile) {
    tile.classList.remove('pop');
    void tile.offsetWidth; // reinicia a animação CSS
    tile.classList.add('pop');
  }
  if (REDUCED_MOTION) {
    element.textContent = target.toLocaleString('pt-BR');
    return;
  }
  const duration = 900;
  const start = performance.now();
  const from = parseInt(element.textContent.replace(/\D/g, ''), 10) || 0;
  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    element.textContent = Math.round(from + (target - from) * eased).toLocaleString('pt-BR');
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function syncPercent() {
  const { matched, onlyGoogle, onlyApple } = lastResult;
  const denominators = {
    bi: matched.length + onlyGoogle.length + onlyApple.length,
    g2a: matched.length + onlyGoogle.length,
    a2g: matched.length + onlyApple.length,
  };
  const total = denominators[direction];
  return total === 0 ? 100 : (matched.length / total) * 100;
}

const RING_CAPTIONS = {
  bi: 'presentes nos dois acervos',
  g2a: 'do Google já estão na Apple',
  a2g: 'da Apple já estão no Google',
};

function renderRing() {
  if (!lastResult) return;
  const percent = syncPercent();
  const fill = $('#ring-fill');
  fill.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - percent / 100);
  $('#ring-pct').textContent = `${percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  $('#ring-caption').textContent = RING_CAPTIONS[direction];
  $('#ring-panel').classList.toggle('complete', percent >= 100);
}

function renderEstimates() {
  if (!lastPlans) return;
  const mbps = parseFloat($('#input-mbps').value);
  const pps = parseFloat($('#input-pps').value);
  $('#output-mbps').textContent = `${mbps.toLocaleString('pt-BR')} MB/s`;
  $('#output-pps').textContent = `${pps.toLocaleString('pt-BR')} fotos/s`;

  const g2aSeconds = estimateSeconds(lastPlans.toApple, mbps, pps);
  const a2gSeconds = estimateSeconds(lastPlans.toGoogle, mbps, pps);

  const describe = (plan) =>
    plan.count === 0
      ? 'acervo já coberto'
      : `${plan.count.toLocaleString('pt-BR')} fotos · ${formatBytes(plan.bytes)}${plan.estimated ? ' (estim.)' : ''}`;

  $('#est-g2a-time').textContent = formatDuration(g2aSeconds);
  $('#est-g2a-detail').textContent = describe(lastPlans.toApple);
  $('#est-a2g-time').textContent = formatDuration(a2gSeconds);
  $('#est-a2g-detail').textContent = describe(lastPlans.toGoogle);

  const biCount = lastPlans.toApple.count + lastPlans.toGoogle.count;
  $('#est-bi-time').textContent = formatDuration(g2aSeconds + a2gSeconds);
  $('#est-bi-detail').textContent =
    biCount === 0
      ? 'acervos já espelhados'
      : `${biCount.toLocaleString('pt-BR')} fotos · ${formatBytes(lastPlans.toApple.bytes + lastPlans.toGoogle.bytes)}`;

  const activeId = { bi: 'est-bi', g2a: 'est-g2a', a2g: 'est-a2g' }[direction];
  for (const tile of document.querySelectorAll('.est')) {
    tile.classList.toggle('active', tile.id === activeId);
  }
}

function initDashboardControls() {
  for (const button of document.querySelectorAll('#direction button')) {
    button.addEventListener('click', async () => {
      document.querySelectorAll('#direction button').forEach((b) => b.classList.remove('active'));
      button.classList.add('active');
      direction = button.dataset.dir;
      await db.setSetting('direction', direction);
      renderRing();
      renderEstimates();
    });
  }

  for (const id of ['input-mbps', 'input-pps']) {
    $(`#${id}`).addEventListener('input', async () => {
      renderEstimates();
      await db.setSetting(id, $(`#${id}`).value);
    });
  }
}

async function restoreDashboardSettings() {
  const [savedDirection, mbps, pps] = await Promise.all([
    db.getSetting('direction'),
    db.getSetting('input-mbps'),
    db.getSetting('input-pps'),
  ]);
  if (savedDirection && ['bi', 'g2a', 'a2g'].includes(savedDirection)) {
    direction = savedDirection;
    document.querySelectorAll('#direction button').forEach((b) => {
      b.classList.toggle('active', b.dataset.dir === direction);
    });
  }
  if (mbps) $('#input-mbps').value = mbps;
  if (pps) $('#input-pps').value = pps;
}

async function updateCompareButton() {
  const [googleCount, appleCount] = await Promise.all([
    db.count('googlePhotos'),
    db.count('applePhotos'),
  ]);
  $('#btn-compare').disabled = !(googleCount > 0 && appleCount > 0);
}

function formatDate(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '—';
  return new Date(time).toLocaleString('pt-BR');
}

function renderTab(tab) {
  const tbody = $('#results-table tbody');
  tbody.textContent = '';
  if (!lastResult) return;

  const rows = [];
  if (tab === 'only-google') {
    for (const item of lastResult.onlyGoogle) {
      rows.push([item.filename, formatDate(item.createTime), item.mimeType || item.type || '']);
    }
  } else if (tab === 'only-apple') {
    for (const item of lastResult.onlyApple) {
      rows.push([item.filename, formatDate(item.createTime), item.path]);
    }
  } else if (tab === 'matched') {
    for (const pair of lastResult.matched) {
      rows.push([pair.google.filename, formatDate(pair.google.createTime), `Apple: ${pair.apple.path}`]);
    }
  } else if (tab === 'uncertain') {
    for (const pair of lastResult.uncertain) {
      rows.push([
        pair.google.filename,
        `${formatDate(pair.google.createTime)} × ${formatDate(pair.apple.createTime)}`,
        pair.reason,
      ]);
    }
  }

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'Nenhum item nesta categoria. 🎉';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((cells, index) => {
    const tr = document.createElement('tr');
    tr.style.setProperty('--row-index', Math.min(index, 12));
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function initCompare() {
  const status = $('#status-compare');

  $('#btn-compare').addEventListener('click', async () => {
    setStatus(status, 'Comparando acervos…', 'busy');
    const [googlePhotos, applePhotos] = await Promise.all([
      db.getAll('googlePhotos'),
      db.getAll('applePhotos'),
    ]);
    lastResult = compare(googlePhotos, applePhotos);
    lastPlans = buildPlans(lastResult, applePhotos);
    lastTotals = { google: googlePhotos.length, apple: applePhotos.length };

    $('#results').classList.remove('hidden');
    $('#btn-export').classList.remove('hidden');

    animateValue($('#stat-google-total'), lastTotals.google);
    animateValue($('#stat-apple-total'), lastTotals.apple);
    animateValue($('#stat-matched'), lastResult.matched.length);
    animateValue($('#stat-only-google'), lastResult.onlyGoogle.length);
    animateValue($('#stat-only-apple'), lastResult.onlyApple.length);
    animateValue($('#stat-uncertain'), lastResult.uncertain.length);

    renderRing();
    renderEstimates();

    const missing = lastResult.onlyGoogle.length + lastResult.onlyApple.length;
    setStatus(
      status,
      missing === 0
        ? 'Acervos sincronizados: nenhuma foto faltando de nenhum lado. ✅'
        : `${missing.toLocaleString('pt-BR')} fotos faltando em um dos lados. Ajuste a direção e a velocidade para estimar a sincronização.`,
      missing === 0 ? 'ok' : '',
    );

    renderTab(document.querySelector('.tab.active').dataset.tab);
  });

  initDashboardControls();

  for (const tabButton of document.querySelectorAll('.tab')) {
    tabButton.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tabButton.classList.add('active');
      renderTab(tabButton.dataset.tab);
    });
  }

  $('#btn-export').addEventListener('click', () => {
    if (!lastResult) return;
    const blob = new Blob(['﻿' + toCsv(lastResult)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geyma-relatorio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ---- Geral ----

function initReset() {
  $('#btn-reset').addEventListener('click', async () => {
    const confirmed = confirm('Apagar todos os dados salvos neste navegador (Client ID e importações)?');
    if (!confirmed) return;
    await db.clearAll();
    location.reload();
  });
}

async function main() {
  await initConfig();
  initGoogle();
  initApple();
  initCompare();
  initReset();
  await restoreDashboardSettings();
  await Promise.all([refreshGoogleSummary(), refreshAppleSummary()]);
}

main();
