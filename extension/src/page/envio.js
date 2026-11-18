// Envio pelo próprio site (0.7): recebe da extensão os arquivos em pedaços e
// os entrega ao campo de envio da página, o mesmo que o botão "Enviar" usa.
// Quem envia é o código do site. iCloud: campo de arquivo fixo do app de Fotos
// (input.UploadHiddenInput, no iframe). Google Fotos: o campo só existe depois
// de abrir o menu, então os arquivos são "soltos" na página, como ao arrastar.
// Envio direto (vídeos do iCloud ao Google): a própria página baixa o
// original do iCloud (link assinado da Apple, sem sessão) para um Blob, que o
// Chrome guarda em disco, e calcula o SHA-1 lendo o Blob em pedaços. O
// arquivo não passa pela memória da extensão: serve para vídeos de qualquer
// tamanho.
// Só responde a mensagens da própria extensão.
(() => {
  const lotes = new Map();

  const bytes = (b64) => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };

  function alvo() {
    const campo = [...document.querySelectorAll('input[type=file]')].find((i) => !i.accept || /image/.test(i.accept));
    if (campo) return { tipo: 'campo', el: campo };
    if (location.hostname === 'photos.google.com' && window === window.top) return { tipo: 'arrastar', el: document.querySelector('[role=main]') || document.body };
    return null;
  }

  function entregar(lote) {
    for (const f of lote.arquivos) {
      if (!f || f.partes.some((p) => !p)) return { ok: false, erro: 'faltou um pedaço do arquivo' };
    }
    return entregarArquivos(lote.arquivos.map((f) => new File(f.partes, f.nome, { type: f.tipo, lastModified: f.lastModified })));
  }

  function entregarArquivos(arquivos) {
    const a = alvo();
    if (!a) return { ok: false, erro: 'o campo de envio sumiu da página' };
    const dt = new DataTransfer();
    for (const f of arquivos) dt.items.add(f);
    if (a.tipo === 'campo') {
      a.el.files = dt.files;
      a.el.dispatchEvent(new Event('input', { bubbles: true }));
      a.el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      for (const t of ['dragenter', 'dragover', 'drop']) {
        a.el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt }));
      }
    }
    return { ok: true, estrategia: a.tipo, n: dt.files.length };
  }

  // avisa a extensão a cada 10 s (mantém o service worker acordado e mostra o andamento)
  const avisar = (pedido, fase, feitos, total) => chrome.runtime.sendMessage({ kind: 'envio-andamento', pedido, fase, feitos, total }).catch(() => {});

  async function envioDireto(msg) {
    const { sha1DoBlob } = await import(chrome.runtime.getURL('src/core/sha1.js'));
    let fase = 'baixando';
    let feitos = 0;
    let total = 0;
    const timer = setInterval(() => avisar(msg.pedido, fase, feitos, total), 10000);
    try {
      const res = await fetch(msg.url);
      if (!res.ok) return { ok: false, erro: `HTTP ${res.status}`, status: res.status };
      total = Number(res.headers.get('content-length')) || 0;
      const blob = await res.blob();
      if (!blob.size) return { ok: false, erro: `o arquivo ${msg.nome} veio vazio` };
      if (total && blob.size !== total) return { ok: false, erro: `o arquivo ${msg.nome} veio incompleto (${blob.size} de ${total} bytes)` };
      fase = 'conferindo';
      total = blob.size;
      const sha1 = await sha1DoBlob(blob, (n) => { feitos = n; });
      const info = { ok: true, bytes: blob.size, sha1 };
      if (msg.ensaio) return info;
      fase = 'entregando';
      const r = entregarArquivos([new File([blob], msg.nome, { type: msg.tipo, lastModified: msg.lastModified })]);
      return r.ok ? { ...info, ...r } : r;
    } finally {
      clearInterval(timer);
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
    if (msg?.kind === 'envio-direto') {
      envioDireto(msg).then(responder, (err) => responder({ ok: false, erro: String(err.message || err) }));
      return true;
    }
    if (msg?.kind === 'envio-alvo') {
      const a = alvo();
      if (a) chrome.runtime.sendMessage({ kind: 'envio-alvo-resp', pedido: msg.pedido, tipo: a.tipo }).catch(() => {});
      return false;
    }
    if (msg?.kind === 'envio-parte') {
      let l = lotes.get(msg.lote);
      if (!l) { l = { arquivos: [] }; lotes.set(msg.lote, l); }
      let f = l.arquivos[msg.arquivo];
      if (!f) { f = { nome: msg.nome, tipo: msg.tipo, lastModified: msg.lastModified, partes: new Array(msg.total) }; l.arquivos[msg.arquivo] = f; }
      f.partes[msg.parte] = bytes(msg.b64);
      responder({ ok: true });
      return false;
    }
    if (msg?.kind === 'envio-entregar') {
      const l = lotes.get(msg.lote);
      lotes.delete(msg.lote);
      if (!l || l.arquivos.length !== msg.n) responder({ ok: false, erro: 'os arquivos não chegaram inteiros à página' });
      else {
        try { responder(entregar(l)); } catch (err) { responder({ ok: false, erro: String(err.message || err) }); }
      }
      return false;
    }
    return false;
  });
})();
