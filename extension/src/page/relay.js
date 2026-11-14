// Ponte entre a página (hook.js, world MAIN) e a extensão (service worker).
// Só repassa mensagens da própria janela e só aceita comandos vindos da extensão.
window.addEventListener('message', (e) => {
  if (e.source !== window || !e.data?.__geyma) return;
  const { site, type, payload } = e.data;
  chrome.runtime.sendMessage({ kind: 'page-event', site, type, payload }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.kind === 'command') window.postMessage({ __geymaCmd: true, cmd: msg.cmd, startFrac: msg.startFrac, keys: msg.keys }, location.origin);
});
