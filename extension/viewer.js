// Visualizador de fotos em tamanho grande, usado pelo painel e pelo celular.
//
// - Uma foto ou várias lado a lado (comparação). Em tela estreita, uma em cima
//   da outra.
// - Zoom e movimento em paralelo: ampliar ou arrastar uma foto faz o mesmo nas
//   outras, para comparar o mesmo ponto (pode desligar em "Mover juntas").
// - Mouse: roda amplia no ponto do cursor, arrastar move, duplo clique alterna
//   entre caber na tela e 2,5×. Toque: pinça amplia, um dedo move, toque duplo
//   alterna. Teclado: + − 0 e setas; Esc fecha.
// - Cada foto abre primeiro com a miniatura e troca pela versão grande quando
//   ela chega.
//
// Estilos em viewer.css (o celular proíbe <style> embutido).

const MIN = 1;
const MAX = 8;

let ui = null;
let estado = null;

function montar() {
  if (ui) return ui;
  const raiz = document.createElement('div');
  raiz.className = 'visor';
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');
  raiz.setAttribute('aria-label', 'Foto em tamanho grande');
  raiz.innerHTML = `
    <div class="visor-barra">
      <span class="visor-titulo"></span>
      <div class="visor-acoes">
        <span class="visor-nav" hidden><button type="button" class="visor-btn" data-nav="-1" aria-label="Anterior" title="Anterior (Page Up)">‹</button><span class="visor-pos"></span><button type="button" class="visor-btn" data-nav="1" aria-label="Próxima" title="Próxima (Page Down)">›</button></span>
        <button type="button" class="visor-btn visor-link" hidden title="Copiar um link que abre estas fotos (para mandar a quem vai investigar)">Copiar link</button>
        <label class="visor-sync" title="Ampliar e mover todas as fotos juntas"><input type="checkbox" checked> Mover juntas</label>
        <button type="button" class="visor-btn" data-z="-" aria-label="Reduzir">−</button>
        <button type="button" class="visor-btn" data-z="0" aria-label="Caber na tela">1:1</button>
        <button type="button" class="visor-btn" data-z="+" aria-label="Ampliar">+</button>
        <button type="button" class="visor-btn visor-fechar" aria-label="Fechar">×</button>
      </div>
    </div>
    <div class="visor-paineis"></div>
    <div class="visor-acoes-foto" hidden><span class="visor-pergunta"></span><span class="visor-botoes"></span><span class="visor-sugestoes"></span><span class="visor-resposta" role="status"></span></div>
    <p class="visor-dica">Roda ou pinça amplia · arraste para mover · duplo clique alterna · Esc fecha</p>`;
  document.body.append(raiz);
  ui = {
    raiz,
    titulo: raiz.querySelector('.visor-titulo'),
    paineis: raiz.querySelector('.visor-paineis'),
    sync: raiz.querySelector('.visor-sync input'),
    link: raiz.querySelector('.visor-link'),
    acoes: raiz.querySelector('.visor-acoes-foto'),
    nav: raiz.querySelector('.visor-nav'),
  };
  raiz.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => navegar(Number(b.dataset.nav))));
  ui.link.addEventListener('click', () => copiarLink(estado?.link));
  raiz.querySelector('.visor-fechar').addEventListener('click', fecharVisor);
  raiz.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => {
    const z = b.dataset.z;
    const alvos = ui.sync.checked ? estado.vistas : [estado.vistas[estado.ativo] || estado.vistas[0]];
    for (const v of alvos) {
      if (z === '0') Object.assign(v, { s: 1, x: 0, y: 0 });
      else zoomEm(v, z === '+' ? 1.5 : 1 / 1.5, 0.5, 0.5);
    }
    aplicar();
  }));
  ui.sync.addEventListener('change', () => {
    // ao religar, todas seguem a foto ativa
    if (ui.sync.checked) { const b = estado.vistas[estado.ativo]; for (const v of estado.vistas) Object.assign(v, { s: b.s, x: b.x, y: b.y }); aplicar(); }
  });
  addEventListener('keydown', (e) => {
    if (!estado) return;
    if (e.ctrlKey || e.altKey || e.metaKey || e.target?.closest?.('input, textarea, select')) return;
    if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); navegar(e.key === 'PageDown' ? 1 : -1); return; }
    // atalhos das perguntas (por exemplo, M = São a mesma foto)
    const atalho = estado.atalhos?.get(e.key.toLowerCase());
    if (atalho && !atalho.disabled) { e.preventDefault(); atalho.click(); return; }
    const v = estado.vistas[estado.ativo] || estado.vistas[0];
    const passo = 60 / v.s;
    const mapa = { Escape: () => fecharVisor(), '+': () => zoomEm(v, 1.5, 0.5, 0.5), '=': () => zoomEm(v, 1.5, 0.5, 0.5), '-': () => zoomEm(v, 1 / 1.5, 0.5, 0.5), 0: () => Object.assign(v, { s: 1, x: 0, y: 0 }),
      ArrowLeft: () => { v.x += passo; }, ArrowRight: () => { v.x -= passo; }, ArrowUp: () => { v.y += passo; }, ArrowDown: () => { v.y -= passo; } };
    if (!mapa[e.key]) return;
    e.preventDefault();
    mapa[e.key]();
    propagar(v);
    aplicar();
  });
  addEventListener('resize', () => estado && aplicar());
  return ui;
}

/**
 * Copia o link; onde a área de transferência não existe (página sem HTTPS,
 * como o celular pela rede local), mostra o link selecionado para copiar à mão.
 */
async function copiarLink(link) {
  if (!link) return;
  const b = ui.link;
  try {
    await navigator.clipboard.writeText(link);
    b.textContent = 'Link copiado';
  } catch {
    window.prompt('Copie o link:', link);
  }
  setTimeout(() => { b.textContent = 'Copiar link'; }, 2000);
}

/** Amplia a vista por um fator, mantendo fixo o ponto (fx, fy) da área (0..1). */
function zoomEm(v, fator, fx, fy) {
  const s = Math.min(MAX, Math.max(MIN, v.s * fator));
  const r = v.area.getBoundingClientRect();
  // ponto da área, relativo ao centro, em pixels
  const px = (fx - 0.5) * r.width;
  const py = (fy - 0.5) * r.height;
  // a translação é aplicada antes da escala: posição na imagem = (p / s) - t
  v.x = px / s - (px / v.s - v.x);
  v.y = py / s - (py / v.s - v.y);
  v.s = s;
  if (s === 1) { v.x = 0; v.y = 0; }
}

/** Limita o movimento para a foto não sair da área. */
function limitar(v) {
  const r = v.area.getBoundingClientRect();
  const mx = (r.width / 2) * (1 - 1 / v.s);
  const my = (r.height / 2) * (1 - 1 / v.s);
  v.x = Math.min(mx, Math.max(-mx, v.x));
  v.y = Math.min(my, Math.max(-my, v.y));
}

function propagar(origem) {
  if (!ui.sync.checked) return;
  for (const v of estado.vistas) if (v !== origem) Object.assign(v, { s: origem.s, x: origem.x, y: origem.y });
}

function aplicar() {
  for (const v of estado.vistas) {
    limitar(v);
    v.img.style.transform = `scale(${v.s}) translate(${v.x}px, ${v.y}px)`;
    v.area.classList.toggle('ampliada', v.s > 1);
  }
}

function ligarGestos(v, i) {
  const area = v.area;
  const ativo = () => { estado.ativo = i; };
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    ativo();
    const r = area.getBoundingClientRect();
    zoomEm(v, e.deltaY < 0 ? 1.25 : 1 / 1.25, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    propagar(v);
    aplicar();
  }, { passive: false });
  area.addEventListener('dblclick', (e) => {
    ativo();
    const r = area.getBoundingClientRect();
    if (v.s > 1) Object.assign(v, { s: 1, x: 0, y: 0 });
    else zoomEm(v, 2.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    propagar(v);
    aplicar();
  });
  // ponteiros: um arrasta, dois fazem pinça; toque duplo alterna o zoom
  const ptrs = new Map();
  let pinca = null;
  let ultimoToque = 0;
  area.addEventListener('pointerdown', (e) => {
    ativo();
    area.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'touch' && ptrs.size === 1) {
      const agora = Date.now();
      if (agora - ultimoToque < 300) {
        const r = area.getBoundingClientRect();
        if (v.s > 1) Object.assign(v, { s: 1, x: 0, y: 0 });
        else zoomEm(v, 2.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        propagar(v);
        aplicar();
        ultimoToque = 0;
        return;
      }
      ultimoToque = agora;
    }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinca = { d: Math.hypot(a.x - b.x, a.y - b.y), s: v.s };
    }
  });
  area.addEventListener('pointermove', (e) => {
    const antes = ptrs.get(e.pointerId);
    if (!antes) return;
    const agora = { x: e.clientX, y: e.clientY };
    ptrs.set(e.pointerId, agora);
    if (ptrs.size >= 2 && pinca) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = area.getBoundingClientRect();
      const cx = ((a.x + b.x) / 2 - r.left) / r.width;
      const cy = ((a.y + b.y) / 2 - r.top) / r.height;
      zoomEm(v, (pinca.s * (d / pinca.d)) / v.s, cx, cy);
    } else if (v.s > 1) {
      v.x += (agora.x - antes.x) / v.s;
      v.y += (agora.y - antes.y) / v.s;
    } else return;
    propagar(v);
    aplicar();
  });
  const solta = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinca = null; };
  area.addEventListener('pointerup', solta);
  area.addEventListener('pointercancel', solta);
}

/**
 * Abre o visualizador.
 * @param {{ src: string, grande?: () => Promise<string|null>, rotulo: string, info?: string|Promise<string>, link?: string, semImagem?: string, carregando?: string }[]} fotos
 *   src: imagem já disponível (miniatura); grande: busca a versão maior;
 *   semImagem: o que dizer se nenhuma imagem carregar; reserva: busca outra
 *   versão grande se a primeira falhar ao carregar (link vencido).
 *   src pode ser uma Promise (miniatura que ainda está chegando).
 * @param {string} [titulo]
 * @param {{ link?: string, aoFechar?: () => void, pergunta?: string,
 *   acoes?: { rotulo: string, titulo?: string, tecla?: string, seguir?: boolean, aoClicar: () => Promise<string> }[],
 *   sugestoes?: { src: string|Promise<string>, rotulo: string, aoEscolher: () => Promise<string> }[],
 *   anterior?: () => void, proxima?: () => void, posicao?: string }} [opcoes]
 *   link: o que "Copiar link" copia. acoes: botões sob as fotos (por exemplo,
 *   "São a mesma foto"); aoClicar devolve a resposta a mostrar; tecla: atalho;
 *   seguir: false para uma ação que não passa à próxima foto (enviar).
 *   anterior/proxima: andar pela lista sem fechar (‹ ›, Page Up/Down); depois
 *   de uma resposta, o visualizador passa sozinho para a próxima.
 */
/** Botão que toca o vídeo no lugar da imagem do painel. */
function botaoAssistir(f, area, img) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'visor-assistir';
  b.textContent = '▶ assistir';
  b.addEventListener('click', async () => {
    b.disabled = true;
    b.textContent = 'carregando o vídeo…';
    try {
      const url = await f.video();
      if (!url) throw new Error('sem o link do vídeo');
      const v = document.createElement('video');
      v.className = 'visor-video';
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      // os gestos de zoom do painel não pegam nos controles do vídeo
      for (const ev of ['pointerdown', 'wheel', 'dblclick']) v.addEventListener(ev, (e) => e.stopPropagation());
      v.onloadeddata = () => b.remove();
      v.onerror = () => { v.remove(); img.hidden = false; b.disabled = false; b.textContent = '▶ assistir (o Chrome não conseguiu tocar este vídeo)'; };
      v.src = url;
      img.hidden = true;
      area.append(v);
    } catch (err) {
      b.disabled = false;
      b.textContent = `▶ assistir (falhou: ${err.message || err})`;
    }
  });
  return b;
}

// resposta da ação em andamento (para mostrar o progresso de um envio longo)
let respostaAtiva = null;

/** Texto de andamento da ação em curso no visualizador (some quando ela termina). */
export function mostrarAndamento(texto) {
  if (respostaAtiva) respostaAtiva.textContent = texto;
}

export function abrirVisor(fotos, titulo = '', opcoes = {}) {
  montar();
  if (estado) fecharVisor();
  ui.titulo.textContent = titulo;
  ui.paineis.replaceChildren();
  ui.paineis.dataset.n = String(fotos.length);
  estado = { vistas: [], ativo: 0, link: opcoes.link || null, aoFechar: opcoes.aoFechar || null, anterior: opcoes.anterior || null, proxima: opcoes.proxima || null, atalhos: new Map() };
  ui.link.hidden = !opcoes.link;
  ui.nav.hidden = !opcoes.anterior && !opcoes.proxima;
  ui.nav.querySelector('[data-nav="-1"]').disabled = !opcoes.anterior;
  ui.nav.querySelector('[data-nav="1"]').disabled = !opcoes.proxima;
  ui.nav.querySelector('.visor-pos').textContent = opcoes.posicao || '';
  montarAcoes(opcoes);
  fotos.forEach((f, i) => {
    const painel = document.createElement('figure');
    painel.className = 'visor-painel';
    const area = document.createElement('div');
    area.className = 'visor-area';
    const img = document.createElement('img');
    img.alt = f.rotulo;
    img.draggable = false;
    const aviso = document.createElement('p');
    aviso.className = 'visor-sem';
    aviso.hidden = true;
    aviso.textContent = f.semImagem || 'Imagem indisponível.';
    let temImagem = false;
    img.onload = () => { temImagem = true; aviso.hidden = true; img.hidden = false; };
    img.onerror = () => { if (!temImagem) { aviso.hidden = false; img.hidden = true; } };
    // sem miniatura e sem versão grande, avisa já; com a grande a caminho, espera por ela
    const semNada = () => { if (!temImagem && !f.grande) { aviso.hidden = false; img.hidden = true; } };
    Promise.resolve(f.src).then((src) => { if (src) img.src = src; else semNada(); }, semNada);
    area.append(img, aviso);
    const leg = document.createElement('figcaption');
    leg.innerHTML = '<b></b> <span class="visor-info"></span> <span class="visor-carregando">carregando a versão grande…</span>';
    leg.querySelector('b').textContent = f.rotulo;
    if (f.carregando) leg.querySelector('.visor-carregando').textContent = f.carregando;
    // info pode chegar depois (ficha do arquivo do Google)
    Promise.resolve(f.info).then((t) => { leg.querySelector('.visor-info').textContent = t || ''; }, () => {});
    if (f.link) {
      const a = document.createElement('a');
      a.href = f.link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'abrir no serviço';
      leg.append(' ', a);
    }
    // vídeo: "assistir" troca a imagem pelo vídeo (f.video devolve o link)
    if (f.video) leg.append(' ', botaoAssistir(f, area, img));
    painel.append(area, leg);
    ui.paineis.append(painel);
    const v = { area, img, s: 1, x: 0, y: 0 };
    estado.vistas.push(v);
    ligarGestos(v, i);
    const carregando = leg.querySelector('.visor-carregando');
    if (!f.grande) { carregando.remove(); return; }
    const semGrande = () => {
      if (temImagem) carregando.textContent = 'versão grande indisponível; mostrando a miniatura';
      else { carregando.remove(); aviso.hidden = false; img.hidden = true; }
    };
    f.grande().then((primeiro) => {
      let src = primeiro;
      if (!src || !estado?.vistas.includes(v)) { semGrande(); return; }
      const pre = new Image();
      pre.onload = () => { img.src = src; carregando.remove(); };
      // o link falhou (por exemplo, link da Apple vencido): tenta a reserva uma vez
      pre.onerror = () => {
        if (!f.reserva) { semGrande(); return; }
        const reserva = f.reserva;
        f.reserva = null;
        carregando.textContent = f.carregandoReserva || 'buscando um link novo (alguns segundos)…';
        reserva().then((s2) => {
          if (!s2 || !estado?.vistas.includes(v)) { semGrande(); return; }
          pre.onerror = semGrande;
          pre.src = s2;
          src = s2;
        }).catch(semGrande);
      };
      pre.src = src;
    }).catch(semGrande);
  });
  ui.raiz.hidden = false;
  document.documentElement.classList.add('visor-aberto');
  aplicar();
  ui.raiz.querySelector('.visor-fechar').focus({ preventScroll: true });
}

function montarAcoes({ pergunta = '', acoes = [], sugestoes = [] }) {
  const caixa = ui.acoes;
  caixa.hidden = !acoes.length && !sugestoes.length;
  montarSugestoes(caixa, sugestoes);
  caixa.querySelector('.visor-pergunta').textContent = pergunta;
  const resposta = caixa.querySelector('.visor-resposta');
  resposta.textContent = '';
  const botoes = caixa.querySelector('.visor-botoes');
  botoes.replaceChildren(...acoes.map((a) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'visor-btn visor-acao';
    b.textContent = a.rotulo;
    if (a.titulo || a.tecla) b.title = [a.titulo, a.tecla && `atalho: ${a.tecla.toUpperCase()}`].filter(Boolean).join(' · ');
    if (a.tecla) estado.atalhos.set(a.tecla.toLowerCase(), b);
    b.addEventListener('click', async () => {
      for (const x of botoes.querySelectorAll('button')) x.disabled = true;
      resposta.textContent = 'gravando…';
      respostaAtiva = resposta;
      try {
        const texto = await a.aoClicar();
        respostaAtiva = null;
        resposta.textContent = texto || 'Anotado.';
        // ação que não responde à pergunta (como enviar): fica na mesma foto, os outros botões voltam
        if (a.seguir === false) { for (const x of botoes.querySelectorAll('button')) if (x !== b) x.disabled = false; return; }
        // respondida: segue para a próxima da lista, se houver
        const seguir = estado?.proxima;
        if (seguir) { resposta.textContent += ' Indo para a próxima…'; const daqui = estado; setTimeout(() => { if (estado === daqui) seguir(); }, 900); }
      } catch (err) {
        respostaAtiva = null;
        resposta.textContent = `Não foi possível: ${err.message || err}`;
        for (const x of botoes.querySelectorAll('button')) x.disabled = false;
      }
    });
    return b;
  }));
}

/**
 * Miniaturas clicáveis sob as fotos (por exemplo, fotos do Google que podem
 * ser a mesma). Cada uma: {src (pode ser Promise), rotulo, aoEscolher}.
 */
function montarSugestoes(caixa, sugestoes) {
  const lugar = caixa.querySelector('.visor-sugestoes');
  const resposta = caixa.querySelector('.visor-resposta');
  lugar.replaceChildren(...sugestoes.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'visor-sugestao';
    b.title = s.rotulo;
    const img = document.createElement('img');
    img.alt = s.rotulo;
    Promise.resolve(s.src).then((u) => { if (u) img.src = u; }, () => {});
    const leg = document.createElement('span');
    leg.textContent = s.rotulo;
    b.append(img, leg);
    b.addEventListener('click', async () => {
      for (const x of caixa.querySelectorAll('button')) x.disabled = true;
      resposta.textContent = 'gravando…';
      try {
        resposta.textContent = (await s.aoEscolher()) || 'Anotado.';
        const seguir = estado?.proxima;
        if (seguir) { resposta.textContent += ' Indo para a próxima…'; const daqui = estado; setTimeout(() => { if (estado === daqui) seguir(); }, 900); }
      } catch (err) {
        respostaAtiva = null;
        resposta.textContent = `Não foi possível: ${err.message || err}`;
        for (const x of caixa.querySelectorAll('button')) x.disabled = false;
      }
    });
    return b;
  }));
}

function navegar(passo) {
  const f = passo > 0 ? estado?.proxima : estado?.anterior;
  if (f) f();
}

export function fecharVisor() {
  if (!estado) return;
  const aoFechar = estado.aoFechar;
  estado = null;
  aoFechar?.();
  ui.raiz.hidden = true;
  ui.paineis.replaceChildren();
  document.documentElement.classList.remove('visor-aberto');
}

export const visorAberto = () => Boolean(estado);
