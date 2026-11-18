// Ponte de envio (0.9): página da extensão embutida, invisível, na aba do
// iCloud, para vídeos do Google ao iCloud. Ela baixa o vídeo do Google com a
// sessão da extensão (a página do iCloud não pode) para um Blob, que o Chrome
// guarda em disco, calcula o SHA-1 em pedaços e devolve o Blob à página do
// iCloud por um MessageChannel (passa a referência, não os bytes).
// Segurança: a ponte não aceita endereço vindo da página. Ela recebe uma
// senha de uso único, que o service worker criou para este envio e só o
// script da extensão na página conhece, e pede ao service worker o endereço
// que essa senha libera. Um script do próprio site não consegue usar a ponte.
import { sha1DoBlob } from './src/core/sha1.js';

window.addEventListener('message', (e) => {
  const porta = e.ports?.[0];
  if (e.data?.kind !== 'geyma-ponte' || !porta || e.origin !== 'https://www.icloud.com') return;
  (async () => {
    const lib = await chrome.runtime.sendMessage({ kind: 'ponte-url', senha: String(e.data.senha || '') });
    if (!lib?.url) return { ok: false, erro: 'envio não autorizado pela extensão' };
    const res = await fetch(lib.url, { credentials: 'include' });
    if (!res.ok) return { ok: false, erro: `HTTP ${res.status}`, status: res.status };
    const total = Number(res.headers.get('content-length')) || 0;
    porta.postMessage({ andamento: 'baixando', total });
    const blob = await res.blob();
    if (!blob.size) return { ok: false, erro: 'o arquivo veio vazio' };
    if (total && blob.size !== total) return { ok: false, erro: `o arquivo veio incompleto (${blob.size} de ${total} bytes)` };
    let ultimo = 0;
    const sha1 = await sha1DoBlob(blob, (feitos) => {
      if (Date.now() - ultimo > 5000) { ultimo = Date.now(); porta.postMessage({ andamento: 'conferindo', feitos, total: blob.size }); }
    });
    return { ok: true, blob, bytes: blob.size, sha1 };
  })().then((r) => porta.postMessage(r), (err) => porta.postMessage({ ok: false, erro: String(err.message || err) }));
});
