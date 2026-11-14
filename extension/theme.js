// Aplica o tema salvo antes do primeiro desenho (sem piscar). Escuro/claro
// seguem o sistema até o usuário escolher no botão ◐.
try {
  const t = localStorage.getItem('geyma-tema');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch {}
