// Guia passo a passo do celular: na primeira visita a cada aba, destaca uma
// parte da tela por vez e explica o gesto (toque, segurar, barra de baixo).
// O cartão fica encaixado no alto ou embaixo, do lado oposto ao destaque.
// Fica salvo no próprio celular que o guia já foi visto; o "?" repete.

const GUIAS = {
  resumo: [
    {
      titulo: 'Bem-vindo ao Geyma no celular',
      texto: 'Aqui você vê o que o notebook já leu e cruzou do <b>Google Fotos</b> e do <b>iCloud</b>, e decide o que fazer com cada foto.<br><br>Tudo é feito no notebook: o celular só mostra e registra as suas decisões. <b>Nada é copiado, alterado ou apagado nos serviços</b> por aqui.',
    },
    { sel: '.destaque', titulo: 'A resposta principal', texto: 'Quanto das fotos do iCloud também está no Google, e vice-versa. Quanto mais perto de 100%, mais fotos estão guardadas em dois lugares.' },
    { sel: '#classes', titulo: 'A situação de cada foto', texto: '<b>Em ambos</b>: protegida em dois lugares. <b>A confirmar</b>: os dados batem, mas há outra foto no mesmo segundo. <b>Cópia reduzida</b>: um lado tem versão menor. <b>Só no Google</b> e <b>Só no iCloud</b>: estão num lugar só.<br><br><b>Toque num cartão</b> para ver aquelas fotos.' },
    { sel: '#plano', titulo: 'O que seria copiado', texto: 'Uma prévia de quanto iria de um serviço para o outro. Só entra o que você marcar como <b>Pessoal</b> ou <b>Manter</b>. Repare quanto os vídeos pesam.' },
    { sel: '#categorias', titulo: 'Pessoal ou lixo?', texto: 'O Geyma separa por regras: câmera, capturas de tela, recebidas por mensageiro, salvas da internet. Só o claramente pessoal vem sugerido como Pessoal; o resto fica <b>Pendente</b> até você decidir. Toque para revisar.' },
    { sel: '.abas', titulo: 'As quatro abas', texto: '<b>Resumo</b> (esta), <b>Revisar</b> (ver e marcar as fotos), <b>Cópias</b> (fotos repetidas) e <b>Leituras</b> (o que o notebook está fazendo).' },
    { sel: '#ajuda', titulo: 'Ajuda quando quiser', texto: 'Cada aba tem o seu guia, que aparece na primeira visita. Para ver de novo, toque em <b>?</b>. O <b>↻</b> ao lado atualiza os dados.' },
  ],
  revisar: [
    { sel: '.filtros', titulo: 'Escolha o que revisar', texto: 'Filtre por situação, categoria, marcação e ano. Um bom começo: <b>Categoria = Captura de tela</b>, ou <b>Situação = Cópias no Google</b>.' },
    { sel: '#grade', titulo: 'As fotos', texto: '<b>Toque</b> numa foto para selecionar. <b>Segure</b> para ver os detalhes, as duas versões lado a lado e marcar só ela.<br><br>Faixa azul embaixo: Google; laranja: iCloud. Nas cópias, a foto com <b>borda tracejada</b> é a que fica.' },
    { sel: '#selecao', titulo: 'Marque várias de uma vez', texto: 'O jeito rápido: selecione só as fotos que <b>fogem da regra</b>, escolha <b>O resto da página</b> e a marcação, e toque em <b>Marcar</b>. Por exemplo, numa página de capturas de tela, selecione as que quer guardar e marque o resto como Descartar.' },
    { sel: '.paginas', titulo: 'Mais fotos', texto: 'São 30 fotos por página. Sempre aparece uma confirmação antes de marcar, e <b>marcar não apaga nada</b>: só registra a sua decisão.' },
  ],
  copias: [
    { sel: '#dups', titulo: 'Cópias repetidas', texto: 'A mesma foto guardada mais de uma vez no mesmo serviço. A de melhor qualidade fica; as outras são cópias que você pode marcar como Descartar.<br><br><b>Toque num cartão</b> para ver as cópias ao lado da que fica.' },
  ],
  leituras: [
    { sel: '#leituras', titulo: 'O que o notebook está fazendo', texto: 'Quantas fotos o notebook já leu de cada serviço e quando. Esta tela se atualiza sozinha.<br><br>O percurso do iCloud só anda com a tela do notebook <b>desbloqueada</b> e a janela do iCloud visível.' },
    { sel: '#recalcular', titulo: 'Recalcular', texto: 'Depois de uma leitura nova no notebook, toque aqui para refazer o cruzamento e atualizar os números.' },
  ],
};

const chave = (n) => `geyma-guia-celular-${n}`;
const visto = (n) => { try { return localStorage.getItem(chave(n)) === '1'; } catch { return false; } };
const marcarVisto = (n) => { try { localStorage.setItem(chave(n), '1'); } catch {} };

let ui = null;
let estado = null;

function montar() {
  if (ui) return ui;
  const raiz = document.createElement('div');
  raiz.className = 'guia';
  raiz.hidden = true;
  raiz.innerHTML = `
    <div class="guia-luz" aria-hidden="true"></div>
    <div class="guia-cartao vidro" role="dialog" aria-modal="true" aria-labelledby="guia-titulo" aria-describedby="guia-texto">
      <div class="guia-topo"><span class="guia-conta"></span><button class="guia-fechar" type="button" aria-label="Fechar o guia">×</button></div>
      <h3 id="guia-titulo"></h3>
      <p id="guia-texto"></p>
      <div class="guia-pontos" aria-hidden="true"></div>
      <div class="guia-acoes">
        <button class="guia-pular" type="button">Pular</button>
        <button class="guia-voltar" type="button">Voltar</button>
        <button class="guia-prox primario" type="button">Próximo</button>
      </div>
    </div>`;
  document.body.append(raiz);
  ui = {
    raiz,
    luz: raiz.querySelector('.guia-luz'),
    cartao: raiz.querySelector('.guia-cartao'),
    conta: raiz.querySelector('.guia-conta'),
    titulo: raiz.querySelector('#guia-titulo'),
    texto: raiz.querySelector('#guia-texto'),
    pontos: raiz.querySelector('.guia-pontos'),
    voltar: raiz.querySelector('.guia-voltar'),
    prox: raiz.querySelector('.guia-prox'),
  };
  raiz.querySelector('.guia-fechar').addEventListener('click', () => fim());
  raiz.querySelector('.guia-pular').addEventListener('click', () => fim());
  ui.voltar.addEventListener('click', () => ir(estado.i - 1, -1));
  ui.prox.addEventListener('click', () => (estado.i >= estado.passos.length - 1 ? fim() : ir(estado.i + 1, 1)));
  addEventListener('resize', () => estado && posicionar());
  addEventListener('scroll', () => estado && posicionar(), { passive: true });
  return ui;
}

const visivel = (el) => el && !el.closest('[hidden]') && el.getClientRects().length > 0;
const alvo = (p) => (p.sel ? [...document.querySelectorAll(p.sel)].find(visivel) : null);

function ir(i, dir) {
  while (i >= 0 && i < estado.passos.length && estado.passos[i].sel && !alvo(estado.passos[i])) i += dir || 1;
  if (i < 0) i = estado.i;
  if (i >= estado.passos.length) { fim(); return; }
  estado.i = i;
  const p = estado.passos[i];
  const n = estado.passos.length;
  ui.conta.textContent = `${i + 1} de ${n}`;
  ui.titulo.textContent = p.titulo;
  ui.texto.innerHTML = p.texto;
  ui.pontos.innerHTML = estado.passos.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
  ui.voltar.disabled = i === 0;
  ui.prox.textContent = i === n - 1 ? 'Entendi' : 'Próximo';
  const t = alvo(p);
  const fixo = t && getComputedStyle(t).position === 'fixed';
  if (t && !fixo) {
    // o alvo vai para a metade da tela que o cartão não ocupa
    const r = t.getBoundingClientRect();
    const espaco = innerHeight - ui.cartao.offsetHeight - 120;
    const topoDesejado = Math.max(12, Math.min(espaco - r.height, 70));
    scrollBy({ top: r.top - topoDesejado, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  posicionar();
  setTimeout(posicionar, 380);
}

function posicionar() {
  const t = alvo(estado.passos[estado.i]);
  const c = ui.cartao;
  if (!t) {
    ui.luz.style.opacity = '0';
    ui.raiz.classList.add('centro');
    c.style.top = `${Math.max(12, (innerHeight - c.offsetHeight) / 2)}px`;
    c.style.bottom = 'auto';
    return;
  }
  ui.raiz.classList.remove('centro');
  const r = t.getBoundingClientRect();
  const pad = 6;
  Object.assign(ui.luz.style, {
    opacity: '1',
    left: `${Math.max(4, r.left - pad)}px`,
    top: `${r.top - pad}px`,
    width: `${Math.min(innerWidth - 8, r.width + pad * 2)}px`,
    height: `${r.height + pad * 2}px`,
  });
  // cartão do lado oposto ao destaque: alvo na metade de cima -> cartão embaixo
  const centroAlvo = r.top + r.height / 2;
  if (centroAlvo < innerHeight / 2) {
    c.style.top = 'auto';
    c.style.bottom = `calc(12px + env(safe-area-inset-bottom))`;
  } else {
    c.style.bottom = 'auto';
    c.style.top = `calc(12px + env(safe-area-inset-top))`;
  }
}

function fim() {
  if (!estado) return;
  marcarVisto(estado.nome);
  estado = null;
  ui.raiz.hidden = true;
}

/** Abre o guia de uma aba (resumo, revisar, copias, leituras). */
export function abrirGuia(nome) {
  const passos = GUIAS[nome];
  if (!passos) return;
  montar();
  estado = { nome, passos, i: 0 };
  ui.raiz.hidden = false;
  ir(0, 1);
  ui.prox.focus({ preventScroll: true });
}

/** Na primeira visita a uma aba, abre o guia depois que ela carregar. */
export function talvezGuia(nome, espera = 500) {
  if (visto(nome) || estado) return;
  setTimeout(() => { if (!visto(nome) && !estado) abrirGuia(nome); }, espera);
}
