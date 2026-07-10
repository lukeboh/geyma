import * as db from './db.js';
import { requestAccessToken, pickPhotos } from './google.js';
import { scanDirectoryHandle, scanFileList } from './apple.js';
import { compare, toCsv } from './match.js';

const $ = (selector) => document.querySelector(selector);

let lastResult = null;

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

// ---- Passo 4: comparação ----

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

  for (const cells of rows) {
    const tr = document.createElement('tr');
    for (const cell of cells) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
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

    $('#stat-matched').textContent = lastResult.matched.length;
    $('#stat-only-google').textContent = lastResult.onlyGoogle.length;
    $('#stat-only-apple').textContent = lastResult.onlyApple.length;
    $('#stat-uncertain').textContent = lastResult.uncertain.length;

    const missing = lastResult.onlyGoogle.length + lastResult.onlyApple.length;
    setStatus(
      status,
      missing === 0
        ? 'Acervos sincronizados: nenhuma foto faltando de nenhum lado. ✅'
        : `${missing} itens faltando em um dos lados. Veja os detalhes abaixo.`,
      missing === 0 ? 'ok' : 'busy',
    );

    $('#results').classList.remove('hidden');
    $('#btn-export').classList.remove('hidden');
    renderTab(document.querySelector('.tab.active').dataset.tab);
  });

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
  await Promise.all([refreshGoogleSummary(), refreshAppleSummary()]);
}

main();
