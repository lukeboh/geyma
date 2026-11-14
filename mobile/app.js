// Geyma no celular: telas Resumo, Revisar, Cópias e Leituras, com dados vindos
// do servidor local (que fala com a extensão no notebook).
const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR');
const pct = (x) => `${Math.round(x * 100)}%`;
const GB = (b) => `${(b / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;
const dia = (ts) => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const quando = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const COR = { ambos: '--c-ambos', confirmar: '--c-confirmar', reduzida: '--c-reduzida', soGoogle: '--google', soIcloud: '--icloud' };
const ORDEM = ['ambos', 'confirmar', 'reduzida', 'soGoogle', 'soIcloud'];

let resumo = null;
let tela = 'resumo';
const filtro = { cls: '', cat: '', dec: '', year: '' };
let pagina = 0;
const TAM = 30;
let linhas = [];
const selecionadas = new Set();

// ---------- rede ----------
async function get(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (r.status === 401) { location.reload(); throw new Error('sem acesso'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
  return j;
}
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-geyma': '1' }, body: JSON.stringify(body || {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
  return j;
}
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}
const thumbUrl = (u) => `/api/thumb?u=${encodeURIComponent(u)}`;

// ---------- navegação ----------
function mostrar(nome) {
  tela = nome;
  for (const s of ['resumo', 'revisar', 'copias', 'leituras']) {
    $(`t-${s}`).hidden = s !== nome;
    const b = $(`nav-${s}`);
    if (s === nome) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('selecao').hidden = nome !== 'revisar';
  scrollTo({ top: 0 });
  if (nome === 'revisar') carregarLinhas();
  if (nome === 'leituras') carregarLeituras();
  try { history.replaceState(null, '', `#${nome}`); } catch {}
}
for (const b of document.querySelectorAll('.abas button')) b.addEventListener('click', () => mostrar(b.dataset.tela));

function irParaRevisar(f) {
  Object.assign(filtro, { cls: '', cat: '', dec: '', year: '' }, f);
  for (const k of Object.keys(filtro)) $(`f-${k}`).value = filtro[k];
  pagina = 0;
  mostrar('revisar');
}

// ---------- resumo ----------
const cartao = ({ rot, num, det, cor, onClick, largo }) => {
  const el = document.createElement(onClick ? 'button' : 'article');
  el.className = `cartao${largo ? ' largo-2' : ''}`;
  if (onClick) { el.type = 'button'; el.addEventListener('click', onClick); }
  if (cor) el.style.setProperty('--cor', `var(${cor})`);
  el.innerHTML = `<span class="rot">${esc(rot)}</span><span class="num">${esc(num)}</span>${det ? `<span class="det">${det}</span>` : ''}`;
  return el;
};

async function carregarResumo() {
  resumo = await get('/api/summary');
  const s = resumo;
  $('frase').innerHTML = `<b>${pct(s.pctIcloudInGoogle)}</b> das fotos do iCloud também estão no Google, e <b>${pct(s.pctGoogleInIcloud)}</b> das do Google também estão no iCloud.`;
  $('frase-sub').textContent = `${fmt.format(s.both)} em ambos · ${fmt.format(s.totals.soGoogle)} só no Google · ${fmt.format(s.totals.soIcloud)} só no iCloud`;
  $('parcial').hidden = s.complete || !s.until;
  if (!s.complete && s.until) $('parcial').textContent = `Cruzamento parcial: o iCloud ainda está sendo lido (fotos até ${dia(s.until)}).`;

  const cl = $('classes');
  cl.replaceChildren(...ORDEM.map((k) => cartao({ rot: s.labels.classes[k], num: fmt.format(s.totals[k]), cor: COR[k], onClick: () => irParaRevisar({ cls: k }) })));

  const p = s.plan;
  $('plano').replaceChildren(
    cartao({ rot: 'iCloud → Google', num: fmt.format(p.toGoogle.n), det: `${GB(p.toGoogle.bytes)}; vídeos: ${fmt.format(p.toGoogle.videos)} (${GB(p.toGoogle.videoBytes)})` }),
    cartao({ rot: 'Google → iCloud', num: fmt.format(p.toIcloud.n), det: `${GB(p.toIcloud.bytes)} estimados` }),
    cartao({ rot: 'Reenviar original ao Google', num: fmt.format(p.quality.n), det: 'o Google guarda cópia menor', largo: true }),
  );

  $('categorias').replaceChildren(...Object.entries(s.labels.categories).map(([k, l]) => cartao({
    rot: l, num: fmt.format(s.categories[k] || 0), det: `sugestão: ${k === 'pessoal' ? 'Pessoal' : 'Pendente'}`, onClick: () => irParaRevisar({ cat: k }),
  })));

  const d = s.dup;
  $('dups').replaceChildren(
    cartao({ rot: 'Google Fotos', num: fmt.format(d.google.copias), det: `cópias a mais em ${fmt.format(d.google.grupos)} grupos${d.google.identicos ? ` · ${fmt.format(d.google.identicos)} idênticas` : ''}`, cor: '--google', onClick: () => irParaRevisar({ cls: 'dupGoogle' }), largo: true }),
    cartao({ rot: 'iCloud Fotos', num: fmt.format(d.icloud.copias), det: `cópias a mais${d.icloud.bytes ? ` · ${GB(d.icloud.bytes)}` : ''}${d.icloud.pendentes ? ` · ${fmt.format(d.icloud.pendentes)} grupos aguardam conferência` : ''}`, cor: '--icloud', onClick: () => irParaRevisar({ cls: 'dupIcloud' }), largo: true }),
  );

  preencherFiltros();
}

function preencherFiltros() {
  const s = resumo;
  const cls = $('f-cls');
  if (!cls.options.length) {
    cls.append(new Option('Todas', ''));
    for (const k of ORDEM) cls.append(new Option(s.labels.classes[k], k));
    cls.append(new Option('Cópias no Google', 'dupGoogle'), new Option('Cópias no iCloud', 'dupIcloud'));
    for (const [k, l] of Object.entries(s.labels.categories)) $('f-cat').append(new Option(l, k));
    for (const [k, l] of Object.entries(s.labels.decisions)) { $('f-dec').append(new Option(l, k)); $('sel-dec').append(new Option(l, k)); }
    $('sel-dec').value = 'descartar';
    for (const y of s.years) $('f-year').append(new Option(y, y));
  }
  for (const k of Object.keys(filtro)) $(`f-${k}`).value = filtro[k];
}
for (const k of Object.keys(filtro)) {
  $(`f-${k}`).addEventListener('change', (e) => { filtro[k] = e.target.value; pagina = 0; carregarLinhas(); });
}

// ---------- revisar ----------
const rotDec = (r) => (r.decision ? resumo.labels.decisions[r.decision] : `sug.: ${resumo.labels.decisions[r.sug]}`);

async function carregarLinhas() {
  if (!resumo) return;
  $('grade').innerHTML = '<p class="nota">Carregando…</p>';
  const q = new URLSearchParams({ ...filtro, page: pagina, size: TAM });
  const r = await get(`/api/rows?${q}`);
  linhas = r.rows;
  selecionadas.clear();
  atualizarSelecao();
  const paginas = Math.max(1, Math.ceil(r.total / TAM));
  $('r-total').textContent = `${fmt.format(r.total)} fotos`;
  $('r-pag').textContent = `${pagina + 1} de ${fmt.format(paginas)}`;
  $('r-ant').disabled = pagina === 0;
  $('r-prox').disabled = pagina >= paginas - 1;
  const grade = $('grade');
  grade.replaceChildren(...linhas.map((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'foto';
    b.setAttribute('aria-label', `${dia(l.ts)}, ${resumo.labels.categories[l.cat]}, ${rotDec(l)}`);
    const imgs = document.createElement('span');
    imgs.className = 'imgs';
    // até duas miniaturas: a cópia que fica e a cópia, ou iCloud e Google
    const t = l.thumbs.slice(0, 2);
    for (const th of t) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.alt = '';
      img.className = `${th.side.startsWith('google') ? 'google' : 'icloud'}${th.side.endsWith('fica') ? ' fica' : ''}`;
      img.src = thumbUrl(th.url);
      img.onerror = () => img.remove();
      imgs.append(img);
    }
    if (!t.length) imgs.innerHTML = '<span class="sem">sem miniatura (chega no próximo percurso do iCloud)</span>';
    b.append(imgs);
    b.insertAdjacentHTML('beforeend', `<span class="check">✓</span><span class="tag">${esc(dia(l.ts))} · ${esc(rotDec(l))}</span>`);
    // toque seleciona; toque longo abre o detalhe
    let longo = null;
    b.addEventListener('pointerdown', () => { longo = setTimeout(() => { longo = 'aberto'; abrirDetalhe(i); }, 450); });
    const cancelar = () => { if (longo && longo !== 'aberto') clearTimeout(longo); };
    b.addEventListener('pointerup', cancelar);
    b.addEventListener('pointerleave', cancelar);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      if (longo === 'aberto') { longo = null; return; }
      if (selecionadas.has(i)) selecionadas.delete(i); else selecionadas.add(i);
      b.classList.toggle('on', selecionadas.has(i));
      atualizarSelecao();
    });
    return b;
  }));
  if (!linhas.length) grade.innerHTML = '<p class="nota">Nenhuma foto neste filtro.</p>';
}
$('r-ant').addEventListener('click', () => { pagina = Math.max(0, pagina - 1); carregarLinhas(); scrollTo({ top: 0 }); });
$('r-prox').addEventListener('click', () => { pagina++; carregarLinhas(); scrollTo({ top: 0 }); });

function atualizarSelecao() {
  $('sel-n').textContent = `${selecionadas.size} selecionada${selecionadas.size === 1 ? '' : 's'} nesta página · segure uma foto para ver detalhes`;
}

// ---------- marcar ----------
let pendente = null;
function confirmar(texto, acao) {
  pendente = acao;
  $('folha-texto').textContent = texto;
  $('folha').hidden = false;
  $('folha-sim').focus();
}
$('folha-nao').addEventListener('click', () => { $('folha').hidden = true; pendente = null; });
$('folha-sim').addEventListener('click', async () => {
  const acao = pendente;
  $('folha').hidden = true;
  pendente = null;
  if (acao) await acao();
});

async function marcar(rows, decision) {
  try {
    const ids = rows.flatMap((r) => r.ids);
    const r = await post('/api/decide', { ids, decision });
    toast(`${fmt.format(r.marcadas)} foto${r.marcadas === 1 ? '' : 's'} marcada${r.marcadas === 1 ? '' : 's'} como ${decision ? resumo.labels.decisions[decision] : 'sugestão'}`);
    await carregarLinhas();
  } catch (e) { toast(`Não foi possível: ${e.message}`); }
}

$('sel-aplicar').addEventListener('click', () => {
  const quais = $('sel-quais').value;
  const dec = $('sel-dec').value;
  const rows = quais === 'sel' ? [...selecionadas].map((i) => linhas[i]) : linhas.filter((_, i) => !selecionadas.has(i));
  if (!rows.length) { toast(quais === 'sel' ? 'Selecione fotos primeiro.' : 'Não sobrou nenhuma foto na página.'); return; }
  const o = quais === 'sel' ? 'selecionadas' : 'não selecionadas desta página';
  confirmar(`Marcar ${rows.length} fotos ${o} como ${resumo.labels.decisions[dec]}? Só registra a sua decisão; nada muda nos serviços.`, () => marcar(rows, dec));
});

// ---------- detalhe ----------
function abrirDetalhe(i) {
  const l = linhas[i];
  const nomes = { icloud: 'iCloud', google: 'Google', 'google-fica': 'Google (fica)', 'icloud-fica': 'iCloud (fica)' };
  $('det-fotos').replaceChildren(...l.thumbs.map((t) => {
    const f = document.createElement('figure');
    f.innerHTML = `<img alt="" src="${esc(thumbUrl(t.url))}"><figcaption>${esc(nomes[t.side] || t.side)}</figcaption>`;
    return f;
  }));
  $('det-titulo').textContent = `${dia(l.ts)} · ${resumo.labels.classes[l.cls]}`;
  const info = [
    ['Categoria', resumo.labels.categories[l.cat]],
    ['Motivo', l.why || '—'],
    ['Marcação', rotDec(l)],
    l.a && ['iCloud', `${l.a.name || '(sem nome)'} · ${l.a.w}×${l.a.h}${l.a.size ? ` · ${(l.a.size / 1048576).toFixed(1)} MB` : ''}${l.a.video ? ' · vídeo' : ''}`],
    l.g && ['Google', `${l.g.w}×${l.g.h}`],
    (l.dup || l.dupIcloud) && ['Cópia', `repetição de outra foto no ${[l.dup && 'Google', l.dupIcloud && 'iCloud'].filter(Boolean).join(' e no ')}`],
  ].filter(Boolean);
  $('det-info').innerHTML = info.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('det-marcar').replaceChildren(...Object.entries(resumo.labels.decisions).map(([k, lab]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = lab;
    if (l.decision === k) b.classList.add('atual');
    b.addEventListener('click', async () => { $('detalhe').hidden = true; await marcar([l], k); });
    return b;
  }));
  if (l.g?.key) {
    const a = document.createElement('a');
    a.href = `https://photos.google.com/photo/${l.g.key}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Abrir no Google Fotos';
    a.className = 'largo';
    $('det-marcar').append(a);
  }
  $('detalhe').hidden = false;
}
$('det-fechar').addEventListener('click', () => { $('detalhe').hidden = true; });
$('detalhe').addEventListener('click', (e) => { if (e.target === $('detalhe')) $('detalhe').hidden = true; });

// ---------- leituras ----------
function textoLeitura(p, nome) {
  if (!p) return 'não iniciada';
  const parado = ['lendo', 'aguardando'].includes(p.state) && p.at && Date.now() - p.at > 600000;
  if (parado) return `sem notícias desde ${quando(p.at)}`;
  const st = { lendo: 'lendo…', concluido: 'concluída', parado: 'parada', aguardando: 'aguardando a aba visível no notebook', erro: 'erro' }[p.state] || p.state;
  const extra = typeof p.frac === 'number' && p.state !== 'concluido' ? ` (${Math.round(p.frac * 100)}%)` : p.pages ? ` (${p.pages} páginas)` : '';
  void nome;
  return `${st}${extra}${p.at ? ` · ${quando(p.at)}` : ''}`;
}
async function carregarLeituras() {
  try {
    const s = await get('/api/status');
    const inv = s.inventory || {};
    $('leituras').replaceChildren(
      cartao({ rot: 'Google Fotos', num: fmt.format(inv.google || 0), det: esc(textoLeitura(s.google, 'google')), cor: '--google', largo: true }),
      cartao({ rot: 'iCloud Fotos', num: fmt.format(inv.icloud || 0), det: esc(`${textoLeitura(s.icloud, 'icloud')}${s.appleTotal ? ` · Apple informa ${fmt.format(s.appleTotal)}` : ''}${s.icloudCompletedAt ? ` · último percurso completo ${quando(s.icloudCompletedAt)}` : ''}`), cor: '--icloud', largo: true }),
    );
  } catch (e) { toast(`Leituras: ${e.message}`); }
}
setInterval(() => { if (tela === 'leituras' && !document.hidden) carregarLeituras(); }, 10000);

$('recalcular').addEventListener('click', async () => {
  toast('Recalculando no notebook…');
  try { await post('/api/recompute'); await carregarResumo(); toast('Cruzamento atualizado.'); } catch (e) { toast(`Não foi possível: ${e.message}`); }
});

$('atualizar').addEventListener('click', async () => {
  const b = $('atualizar');
  b.classList.add('girando');
  try {
    await carregarResumo();
    if (tela === 'revisar') await carregarLinhas();
    if (tela === 'leituras') await carregarLeituras();
  } catch (e) { toast(e.message); }
  setTimeout(() => b.classList.remove('girando'), 400);
});

// ---------- início ----------
(async () => {
  try {
    await carregarResumo();
    const h = location.hash.slice(1);
    mostrar(['resumo', 'revisar', 'copias', 'leituras'].includes(h) ? h : 'resumo');
  } catch (e) {
    $('frase').textContent = `Não foi possível falar com o notebook: ${e.message}`;
  }
})();
