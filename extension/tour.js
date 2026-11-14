// Guia passo a passo (tour) na primeira visita a cada etapa do painel.
// Destaca uma parte da tela por vez e explica o que fazer ali. Teclado: → e
// Enter avançam, ← volta, Esc fecha. Fica salvo que o guia já foi visto; o
// botão "?" do topo repete o guia da etapa aberta.

const TOURS = {
  inv: [
    {
      title: 'Bem-vindo ao Geyma',
      text: 'O Geyma confere se as suas fotos estão guardadas em dois lugares, no Google Fotos e no iCloud, e ajuda a separar o que é pessoal do que é lixo e das cópias repetidas.<br><br>São três etapas, nesta ordem: <b>Inventário</b> (ler os dois serviços), <b>Proteção</b> (ver o que está onde) e <b>Revisão</b> (decidir). <b>Nada é copiado, alterado ou apagado nos serviços</b> por aqui.',
    },
    { sel: '.steps', title: 'As três etapas', text: 'Navegue por aqui. Comece pelo Inventário; quando os dois serviços estiverem lidos, siga para Proteção e depois Revisão.' },
    {
      sel: '.card[data-site="google"]',
      title: '1. Leia o Google Fotos',
      text: 'Abra <b>photos.google.com</b> neste navegador, já com a sua conta, e clique em <b>Ler catálogo</b>. A leitura roda sozinha, mesmo em segundo plano, e leva poucos minutos. Você pode continuar usando o computador.',
    },
    {
      sel: '.card[data-site="icloud"]',
      title: '2. Percorra o iCloud Fotos',
      text: 'Abra <b>icloud.com/photos</b> com a sua conta e clique em <b>Percorrer biblioteca</b>. O Geyma abre o iCloud numa janela própria e rola a grade como uma pessoa.<br><br><b>Deixe essa janela visível, sem nada por cima e com a tela desbloqueada</b>, até terminar (cerca de 1h30). Se precisar parar, use <b>Parar</b> e depois <b>Continuar de onde parou</b>.',
    },
    { sel: '#chart', title: 'Quantas fotos por ano', text: 'Este gráfico compara os dois serviços ano a ano. Quando os dois cartões acima disserem "concluído", vá para a etapa <b>Proteção</b>.' },
    { sel: '#ajuda', title: 'Ajuda quando quiser', text: 'Este guia aparece só na primeira vez. Para ver de novo, clique em <b>?</b>. O botão ao lado troca entre tema claro e escuro.' },
  ],
  prot: [
    { sel: '.panel.lead', title: 'O resumo em uma frase', text: 'Aqui está a resposta principal: quanto do iCloud também está no Google e vice-versa. Se aparecer um aviso amarelo de "cruzamento parcial", o iCloud ainda não foi lido inteiro.' },
    {
      sel: '#m-classes',
      title: 'A situação de cada foto',
      text: '<b>Em ambos</b>: protegida em dois lugares. <b>A confirmar</b>: os dados batem, mas há outra foto no mesmo segundo. <b>Cópia reduzida</b>: um lado guarda versão menor. <b>Só no Google</b> e <b>Só no iCloud</b>: estão em um lugar só.<br><br>Clique em <b>Ver lista</b> para ver as fotos de cada situação.',
    },
    { sel: '#m-plan-box', title: 'O que seria copiado', text: 'Uma prévia do envio de um serviço para o outro, com quantidade e espaço. Só entra o que está marcado como <b>Pessoal</b> ou <b>Manter</b>; o resto fica de fora até você decidir. Repare quanto os vídeos pesam.' },
    { sel: '#m-cat-box', title: 'Pessoal ou lixo?', text: 'O Geyma separa por regras: fotos de câmera, capturas de tela, recebidas por mensageiro, salvas da internet e indefinidas. Só o claramente pessoal vem sugerido como Pessoal; o resto fica <b>Pendente</b>. Clique em <b>Revisar</b> para conferir uma categoria.' },
    { sel: '#m-dup-box', title: 'Cópias repetidas', text: 'A mesma foto guardada mais de uma vez no mesmo serviço. A cópia de melhor qualidade fica; as outras aparecem para você revisar em <b>Ver cópias</b>. Se houver o botão <b>Conferir pelas miniaturas</b>, ele compara as imagens para confirmar.' },
    { sel: '#m-ic-box', title: 'Desempate pelo iCloud', text: 'Depois de percorrer o iCloud, clique aqui <b>logo em seguida</b>: as miniaturas do iCloud desempatam os casos "a confirmar" e as cópias do iCloud. Os links dessas miniaturas expiram em algumas horas.' },
  ],
  rev: [
    { sel: '.filters', title: 'Escolha o que revisar', text: 'Filtre por situação, categoria, marcação, ano e tipo. Um bom começo: <b>Categoria = Captura de tela</b>, ou <b>Situação = Cópias repetidas no Google</b>.' },
    { sel: '.view-toggle', title: 'Lista ou grade', text: 'A <b>Grade</b> mostra as fotos grandes e é a melhor para decidir rápido. A <b>Lista</b> mostra nome, tamanho e o motivo da categoria (passe o mouse sobre ela).' },
    { sel: '#r-grid', before: () => document.getElementById('r-view-grid')?.click(), title: 'As fotos', text: 'Cada cartão mostra as miniaturas. Borda azul: Google; laranja: iCloud. Nas cópias repetidas, a miniatura com <b>borda tracejada</b> é a que fica. Clique no cartão para selecionar.' },
    { sel: '#r-selbar:not([hidden])', title: 'Marque as exceções', text: 'O jeito rápido: selecione só as fotos que <b>fogem da regra</b> e marque <b>os não selecionados desta página</b> de uma vez. Por exemplo, numa página de capturas de tela, selecione as que quer guardar e marque o resto como Descartar.' },
    { sel: '#r-batch', title: 'Tudo de uma vez', text: 'Estes botões marcam <b>todos</b> os itens do filtro, não só a página. Sempre aparece uma confirmação com a quantidade antes.' },
    { sel: '#r-summary', title: 'Seu progresso', text: 'Quantas fotos você já marcou e como fica cada decisão. <b>Marcar não apaga nada</b>: só registra a sua decisão. Copiar ou remover será uma etapa à parte, sempre com a sua confirmação.' },
  ],
};

const seenKey = (name) => `geyma-guia-${name}`;
const wasSeen = (name) => { try { return localStorage.getItem(seenKey(name)) === '1'; } catch { return false; } };
const markSeen = (name) => { try { localStorage.setItem(seenKey(name), '1'); } catch {} };

let ui = null;
let state = null;

function build() {
  if (ui) return ui;
  const root = document.createElement('div');
  root.className = 'tour';
  root.hidden = true;
  root.innerHTML = `
    <div class="tour-spot" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div class="tour-top"><span class="tour-count"></span><button class="tour-close" type="button" aria-label="Fechar o guia">×</button></div>
      <h3 id="tour-title"></h3>
      <p id="tour-text"></p>
      <div class="tour-dots" aria-hidden="true"></div>
      <div class="tour-actions">
        <button class="tour-skip" type="button">Pular guia</button>
        <span class="tour-gap"></span>
        <button class="tour-back" type="button">Voltar</button>
        <button class="tour-next primary" type="button">Próximo</button>
      </div>
    </div>`;
  document.body.append(root);
  ui = {
    root,
    spot: root.querySelector('.tour-spot'),
    card: root.querySelector('.tour-card'),
    count: root.querySelector('.tour-count'),
    title: root.querySelector('#tour-title'),
    text: root.querySelector('#tour-text'),
    dots: root.querySelector('.tour-dots'),
    back: root.querySelector('.tour-back'),
    next: root.querySelector('.tour-next'),
  };
  root.querySelector('.tour-close').addEventListener('click', () => end(true));
  root.querySelector('.tour-skip').addEventListener('click', () => end(true));
  ui.back.addEventListener('click', () => go(state.i - 1, -1));
  ui.next.addEventListener('click', () => (state.i >= state.steps.length - 1 ? end(true) : go(state.i + 1, 1)));
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); end(true); }
    if (e.key === 'ArrowRight') { e.preventDefault(); ui.next.click(); }
    if (e.key === 'ArrowLeft' && state.i > 0) { e.preventDefault(); ui.back.click(); }
  });
  addEventListener('resize', () => state && place());
  addEventListener('scroll', () => state && place(), { passive: true });
  return ui;
}

const visible = (el) => el && !el.closest('[hidden]') && el.getClientRects().length > 0;
const targetOf = (step) => (step.sel ? [...document.querySelectorAll(step.sel)].find(visible) : null);

function go(i, dir) {
  // passos cujo alvo não está na tela (ex.: quadro ainda sem dados) são pulados
  const ready = (k) => { state.steps[k].before?.(); return !state.steps[k].sel || targetOf(state.steps[k]); };
  while (i >= 0 && i < state.steps.length && !ready(i)) i += dir || 1;
  if (i < 0) i = state.i;
  if (i >= state.steps.length) { end(true); return; }
  state.i = i;
  const step = state.steps[i];
  const total = state.steps.length;
  ui.count.textContent = `${i + 1} de ${total}`;
  ui.title.textContent = step.title;
  ui.text.innerHTML = step.text;
  ui.dots.innerHTML = state.steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  ui.back.disabled = i === 0;
  ui.next.textContent = i === total - 1 ? 'Concluir' : 'Próximo';
  const t = targetOf(step);
  if (t) {
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    ui.card.style.width = `${Math.min(380, innerWidth - 32)}px`;
    const r = t.getBoundingClientRect();
    // se alvo e cartão cabem juntos, o alvo vai para o alto e o cartão fica logo abaixo
    if (r.height + ui.card.offsetHeight + 56 <= innerHeight) scrollBy({ top: r.top - 24, behavior });
    else t.scrollIntoView({ block: 'center', behavior });
  }
  place();
  // reposiciona depois da rolagem suave
  setTimeout(place, 350);
  ui.next.focus({ preventScroll: true });
}

function place() {
  const step = state.steps[state.i];
  const t = targetOf(step);
  const card = ui.card;
  const vw = innerWidth;
  const vh = innerHeight;
  const cw = Math.min(380, vw - 32);
  card.style.width = `${cw}px`;
  if (!t) {
    ui.spot.style.opacity = '0';
    ui.root.classList.add('center');
    card.style.left = `${(vw - cw) / 2}px`;
    card.style.top = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
    return;
  }
  ui.root.classList.remove('center');
  const r = t.getBoundingClientRect();
  const pad = 8;
  Object.assign(ui.spot.style, {
    opacity: '1',
    left: `${r.left - pad}px`,
    top: `${r.top - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  });
  const ch = card.offsetHeight;
  const clampTop = (t) => Math.max(12, Math.min(t, vh - ch - 12));
  let top;
  let left;
  if (r.bottom + 16 + ch <= vh - 12) {
    // abaixo do alvo
    top = r.bottom + 16;
    left = r.left + Math.min(24, r.width / 4);
  } else if (r.top - 16 - ch >= 12) {
    // acima
    top = r.top - ch - 16;
    left = r.left + Math.min(24, r.width / 4);
  } else if (r.left - 16 - cw >= 12) {
    // à esquerda
    left = r.left - cw - 16;
    top = clampTop(r.top);
  } else if (r.right + 16 + cw <= vw - 12) {
    // à direita
    left = r.right + 16;
    top = clampTop(r.top);
  } else {
    // alvo maior que a tela: no rodapé, sobre ele
    top = Math.max(12, vh - ch - 16);
    left = r.left + Math.min(24, r.width / 4);
  }
  left = Math.max(16, Math.min(left, vw - cw - 16));
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function end(done) {
  if (!state) return;
  if (done) markSeen(state.name);
  state = null;
  ui.root.hidden = true;
  document.body.classList.remove('tour-on');
}

/** Abre o guia de uma etapa (inv, prot, rev). */
export function startTour(name) {
  const steps = TOURS[name];
  if (!steps) return;
  build();
  state = { name, steps, i: 0 };
  ui.root.hidden = false;
  document.body.classList.add('tour-on');
  go(0, 1);
}

/** Na primeira visita a uma etapa, abre o guia depois que a tela estiver pronta. */
export function maybeTour(name, delay = 600) {
  if (wasSeen(name) || state) return;
  setTimeout(() => { if (!wasSeen(name) && !state) startTour(name); }, delay);
}

export const tourOpen = () => Boolean(state);
