// Integração com o Google: OAuth (Google Identity Services) + Photos Picker API.
//
// Desde 31/03/2025 o Google removeu os escopos de leitura da biblioteca inteira
// (photoslibrary.readonly). O caminho suportado para apps de terceiros é a
// Picker API: o usuário abre uma sessão do seletor do Google Fotos, marca as
// fotos (pode selecionar todas) e o app lê apenas os itens escolhidos.

const PICKER_BASE = 'https://photospicker.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

let gisLoaded = null;

function loadGis() {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Falha ao carregar o script de login do Google.'));
    document.head.appendChild(script);
  });
  return gisLoaded;
}

export async function requestAccessToken(clientId) {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Login negado: ${response.error}`));
        } else {
          resolve(response.access_token);
        }
      },
      error_callback: (err) => reject(new Error(`Login falhou: ${err.type || err.message || err}`)),
    });
    client.requestAccessToken();
  });
}

async function api(token, path, options = {}) {
  const res = await fetch(`${PICKER_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Picker API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Abre uma sessão do Picker, espera o usuário concluir a seleção na aba do
// Google Fotos e retorna os metadados dos itens selecionados.
// onStatus(texto) recebe atualizações de progresso para a UI.
export async function pickPhotos(token, onStatus) {
  const session = await api(token, '/sessions', { method: 'POST', body: '{}' });

  const pickerWindow = window.open(session.pickerUri, '_blank');
  if (!pickerWindow) {
    throw new Error('O navegador bloqueou a janela do seletor. Permita pop-ups para este site.');
  }
  onStatus('Selecione as fotos na aba do Google Fotos que foi aberta e confirme…');

  // Aguarda o usuário terminar a seleção, respeitando o intervalo sugerido pela API.
  const pollMs = parseDuration(session.pollingConfig?.pollInterval, 3000);
  const timeoutMs = parseDuration(session.pollingConfig?.timeoutIn, 10 * 60 * 1000);
  const deadline = Date.now() + timeoutMs;

  let current = session;
  while (!current.mediaItemsSet) {
    if (Date.now() > deadline) {
      await deleteSession(token, session.id);
      throw new Error('Tempo esgotado aguardando a seleção de fotos.');
    }
    await sleep(pollMs);
    current = await api(token, `/sessions/${session.id}`);
  }

  onStatus('Seleção concluída. Baixando metadados…');

  const items = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ sessionId: session.id, pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await api(token, `/mediaItems?${params}`);
    for (const item of page.mediaItems || []) items.push(normalize(item));
    pageToken = page.nextPageToken || '';
    if (items.length) onStatus(`Baixando metadados… ${items.length} itens.`);
  } while (pageToken);

  await deleteSession(token, session.id);
  return items;
}

async function deleteSession(token, sessionId) {
  try {
    await api(token, `/sessions/${sessionId}`, { method: 'DELETE' });
  } catch {
    // Sessões expiram sozinhas; falha na limpeza não deve interromper o fluxo.
  }
}

function normalize(item) {
  const file = item.mediaFile || {};
  const meta = file.mediaFileMetadata || {};
  return {
    id: item.id,
    filename: file.filename || '',
    mimeType: file.mimeType || '',
    createTime: item.createTime || '',
    width: meta.width || null,
    height: meta.height || null,
    type: item.type || '',
    source: 'google',
  };
}

// A API retorna durações como "3s" ou "3.5s".
function parseDuration(value, fallbackMs) {
  if (typeof value !== 'string') return fallbackMs;
  const seconds = parseFloat(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
