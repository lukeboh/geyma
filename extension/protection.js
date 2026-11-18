// Abas 2 (Proteção) e 3 (Revisão) do painel: cruzamento das bibliotecas,
// visão por ano e lista filtrável para revisar item a item.
import { CLASSES } from './src/core/match.js';
import { CATEGORIES, DECISIONS, suggestDecision } from './src/core/classify.js';
import { patchItems, getThumb, getCache, getMeta, registrarDecisoes, getItem } from './src/core/db.js';
import { patchVeredito, vereditoDoPar } from './src/core/veredito.js';
import { textoEtapa, desatualizado, aplicarDecisoes } from './src/core/calc-cache.js';
import { sendPlan, effectiveDecision, espacoDasLinhas, bytesPerPixel } from './src/core/plan.js';
import { filterRows, decisionCounts } from './src/core/review.js';
import { phashFromBlob } from './src/core/phash-image.js';
import { abrirVisor } from './viewer.js';
import { googleGrande, icloudGrande, icloudOriginal, linkAtual, linkOriginal, temOriginal } from './src/core/viewer-src.js';
import { fichaDoCabecalho } from './src/core/google-file.js';
import { etiquetaQualidade, porqueQualidade } from './src/core/qualidade.js';
import { resumoProtecao } from './src/core/protecao.js';
import { proximosPassos } from './src/core/passos.js';
import { sugestoesDoGoogle } from './src/core/sugestoes.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR');
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const day = (ts) => new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
const local = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const when = (ts) => new Date(ts).toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' });

// ordem fixa das classes (empilhamento, legenda, cartões); a cor segue a classe
const ORDER = ['ambos', 'confirmar', 'reduzida', 'soGoogle', 'soIcloud'];
const EXPLAIN = {
  ambos: 'Mesmo instante e mesmas dimensões nos dois serviços, sem outro candidato. Protegidas em dois lugares.',
  confirmar: 'Batem pelos metadados, mas há outra foto no mesmo segundo (rajada ou duplicata) ou as imagens são só parecidas (como dois quadros de uma Live Photo). Falta a confirmação visual.',
  reduzida: 'Mesma foto, mas um dos lados guarda uma cópia menor. Perda de qualidade a corrigir.',
  soGoogle: 'Só existem no Google Fotos. Candidatas a enviar para o iCloud, depois da sua revisão.',
  soIcloud: 'Só existem no iCloud. Candidatas a enviar para o Google, depois da sua revisão.',
};

let data = null;
let worker = null;
let busy = false;

export function initProtection() {
  document.body.append($('tooltip'));
  $('m-refresh').addEventListener('click', () => compute());
  for (const id of ['r-cls', 'r-cat', 'r-dec', 'r-year', 'r-kind']) $(id).addEventListener('change', () => { page = 0; renderList(); });
  for (const [k, l] of Object.entries(CATEGORIES)) $('r-cat').append(new Option(l, k));
  for (const [k, l] of Object.entries(DECISIONS)) $('r-dec').append(new Option(l, k));
  for (const b of document.querySelectorAll('#r-batch button[data-dec]')) b.addEventListener('click', () => askBatch(b.dataset.dec));
  $('r-confirm-yes').addEventListener('click', confirmBatch);
  $('r-view-list').addEventListener('click', () => setGrid(false));
  $('r-view-grid').addEventListener('click', () => setGrid(true));
  for (const [k, l] of Object.entries(DECISIONS)) $('r-sel-dec').append(new Option(l, k));
  $('r-sel-dec').value = 'descartar';
  $('r-sel-apply').addEventListener('click', applySelection);
  $('r-sel-all').addEventListener('click', () => selectAll(true));
  $('r-sel-none').addEventListener('click', () => selectAll(false));
  $('r-confirm-no').addEventListener('click', cancelBatch);
  $('r-prev').addEventListener('click', () => { page = Math.max(0, page - 1); renderList(); });
  $('r-next').addEventListener('click', () => { page++; renderList(); });
  $('r-csv').addEventListener('click', exportCsv);
  $('m-phash').addEventListener('click', startPhash);
  $('m-ic-run').addEventListener('click', runIcloudCheck);
  $('m-ic-stop').addEventListener('click', () => { if (icJob) icJob.stop = true; });
  $('m-gf-run').addEventListener('click', runGoogleFiles);
  $('m-gf-stop').addEventListener('click', () => { if (gfJob) gfJob.stop = true; });
  $('m-phash-stop').addEventListener('click', () => chrome.runtime.sendMessage({ kind: 'stop', site: 'google' }));
  const cls = $('r-cls');
  cls.append(new Option('Todas', ''));
  for (const k of ORDER) cls.append(new Option(CLASSES[k], k));
  cls.append(new Option('Cópias repetidas no Google', 'dupGoogle'));
  cls.append(new Option('Cópias repetidas no iCloud', 'dupIcloud'));
  cls.append(new Option('Mesma foto: confirmada', 'idConfirmada'));
  cls.append(new Option('Mesma foto: provável', 'idProvavel'));
  cls.append(new Option('Mesma foto: incerta', 'idIncerta'));
  cls.append(new Option('Melhor cópia no iCloud', 'melhorIcloud'));
  cls.append(new Option('Melhor cópia no Google', 'melhorGoogle'));
  cls.value = '';
}

/**
 * Primeira visita: mostra o último cruzamento guardado na hora e, se o
 * inventário mudou depois dele, recalcula em segundo plano. Sem cruzamento
 * guardado, calcula mostrando as etapas.
 */
let carregandoCache = null;
export function ensureComputed() {
  if (data || busy) return carregandoCache || Promise.resolve();
  carregandoCache ??= (async () => {
    setCalc({ etapa: 'abrindo o último cruzamento guardado…' });
    let cache = null;
    let versao = 0;
    try {
      [cache, versao] = await Promise.all([getCache('cruzamento'), getMeta('inventario').then((m) => m?.value?.versao || 0)]);
    } catch { cache = null; }
    if (cache?.rows && !data) {
      const recentes = (await getMeta('decisoesRecentes').catch(() => null))?.value;
      aplicarDecisoes(cache.rows, recentes, cache.lidoEm || 0);
      mostrar(cache);
      if (desatualizado(cache, versao)) compute({ motivo: 'o inventário mudou depois do último cálculo; atualizando em segundo plano' });
      else setCalc(null);
    } else if (!data) compute();
    carregandoCache = null;
  })();
  return carregandoCache;
}

/** Andamento do cálculo, nas abas Proteção e Revisão. p = {etapa, i, n, total} ou null (parado). */
let ultimoAndamento = null;
function setCalc(p) {
  ultimoAndamento = p;
  for (const id of ['m-prog', 'r-prog']) {
    const box = $(id);
    if (!box) continue;
    box.hidden = !p;
    if (!p) continue;
    const bar = box.querySelector('progress');
    if (typeof p.i === 'number') { bar.max = p.n; bar.value = p.i; } else bar.removeAttribute('value');
    const seg = p.total ? ` · ${Math.round(p.total / 1000)} s` : '';
    box.querySelector('span').textContent = `${p.motivo ? `${p.motivo} — ` : ''}${p.etapa}${seg}`;
  }
  $('m-time').textContent = p ? '' : (data?.calculadoEm ? `calculado em ${local(data.calculadoEm)}` : '');
}

function mostrar(d) {
  data = d;
  renderProtection();
  fillYears();
  renderList();
  document.dispatchEvent(new CustomEvent('geyma-ready'));
}

export function compute({ motivo = '' } = {}) {
  if (busy) return;
  busy = true;
  $('m-refresh').disabled = true;
  setCalc({ etapa: textoEtapa('ler'), i: 0, n: 7, motivo });
  worker ??= new Worker('src/match-worker.js', { type: 'module' });
  worker.onmessage = (e) => {
    const p = e.data.progresso;
    if (p) {
      // o worker continua guardando depois de entregar; só o andamento interessa aqui
      if (busy) setCalc({ ...p, etapa: textoEtapa(p.etapa), motivo });
      if (p.etapa === 'fim') console.debug('[geyma] cruzamento', p);
      return;
    }
    if (e.data.resumo) return;
    busy = false;
    $('m-refresh').disabled = false;
    if (!e.data.ok) { setCalc(null); $('m-headline').textContent = `Não foi possível cruzar: ${e.data.reason}`; return; }
    mostrar(e.data);
    setCalc(null);
  };
  worker.postMessage('run');
}

function renderProtection() {
  const { summary: s, until, complete, counts, dup } = data;
  const t = s.totals;
  const both = t.ambos + t.confirmar + t.reduzida;
  const icloudScope = both + t.soIcloud;
  const googleScope = both + t.soGoogle;

  const banner = $('m-partial');
  banner.hidden = complete || !until;
  if (!complete && until) {
    banner.textContent = `Cruzamento parcial: o iCloud ainda está sendo lido. Por enquanto só entram as fotos até ${day(until)}, dos dois lados. Quando o percurso terminar, clique em Recalcular.`;
  }
  if (!counts.google || !counts.icloud) {
    $('m-headline').textContent = 'Leia os dois serviços na aba Inventário para ver o cruzamento.';
    $('m-sub').textContent = '';
    return;
  }
  $('m-headline').innerHTML = `<b>${pct(both, icloudScope)}</b> das fotos do iCloud também estão no Google, e <b>${pct(both, googleScope)}</b> das fotos do Google também estão no iCloud.`;
  $('m-sub').textContent = `${fmt.format(both)} fotos em ambos · ${fmt.format(t.soGoogle)} só no Google · ${fmt.format(t.soIcloud)} só no iCloud`
    + (counts.ocultas ? ` · ${fmt.format(counts.ocultas)} do iCloud ficam de fora, sem entrar em nenhum envio (ocultas, ou não encontradas no último percurso completo: ocultas ou apagadas)` : '');

  const id = s.identidade;
  $('m-ident').hidden = !id || !both;
  if (id && both) {
    $('m-ident').innerHTML = `Certeza de que é a mesma foto, nas ${fmt.format(both)} em ambos: `
      + `<a href="#rev" data-cls="idConfirmada" title="Imagens conferidas e iguais, mesmo arquivo de origem no mesmo instante, ou você confirmou">confirmada em ${fmt.format(id.confirmada)}</a> · `
      + `<a href="#rev" data-cls="idProvavel" title="Instante e dimensões batem e não há outra candidata; as imagens ainda não foram comparadas (ou são outro quadro da mesma Live Photo, ou a versão editada)">provável em ${fmt.format(id.provavel)}</a> · `
      + `<a href="#rev" data-cls="idIncerta" title="Há outra foto no mesmo segundo, as imagens são só parecidas, ou é uma cópia reduzida sem a imagem conferida: abra e responda São a mesma foto?">incerta em ${fmt.format(id.incerta)}</a>`;
    for (const a of $('m-ident').querySelectorAll('a[data-cls]')) {
      a.addEventListener('click', (e) => { e.preventDefault(); $('r-cls').value = a.dataset.cls; $('r-cat').value = ''; $('r-dec').value = ''; page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' })); });
    }
  }

  const box = $('m-classes');
  box.innerHTML = '';
  for (const k of ORDER) {
    const card = document.createElement('article');
    card.className = 'class-card';
    card.style.setProperty('--cor', `var(--c-${k})`);
    const extraLive = (k === 'ambos' || k === 'reduzida') && s.quadroDiferente
      ? `<p class="hint">inclui Live Photos com o quadro principal diferente em cada serviço (${fmt.format(s.quadroDiferente)} no total): mesmo clique, mesma foto</p>` : '';
    const extra = extraLive + (k === 'reduzida' && t.reduzida
      ? `<p class="hint">menor no Google: ${fmt.format(s.reduzidaMenor.google)} · menor no iCloud: ${fmt.format(s.reduzidaMenor.icloud)}</p>`
      : '');
    card.innerHTML = `<h3><i class="swatch c-${k}"></i>${CLASSES[k]}</h3><p class="big">${fmt.format(t[k])}</p><p class="hint">${EXPLAIN[k]}</p>${extra}`;
    const btn = document.createElement('button');
    btn.textContent = 'Ver lista';
    btn.disabled = !t[k];
    btn.addEventListener('click', () => { $('r-cls').value = k; $('r-cat').value = ''; $('r-dec').value = ''; page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' })); });
    card.append(btn);
    box.append(card);
  }

  $('m-legend').innerHTML = ORDER.map((k) => `<span><i class="swatch c-${k}"></i>${CLASSES[k]}</span>`).join('');
  drawStack(s.byYear);

  renderDup();
  renderCategories();
  renderPlan();
  renderIcloudCheck();
  renderGoogleFiles();
}

// ---------- arquivos do Google (formato, nome; só cabeçalhos) ----------
let gfJob = null;
const MB = (b) => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

/** Ficha do arquivo do Google: HEAD no download do original (nada é baixado). */
async function fichaGoogle(base) {
  const res = await fetch(`${base}=d`, { method: 'HEAD', credentials: 'include' });
  if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
  return fichaDoCabecalho(res.headers);
}
const textoFicha = (f) => (f ? [f.nome, f.formato, f.bytes ? MB(f.bytes) : null].filter(Boolean).join(' · ') : '');

function renderGoogleFiles() {
  const need = data.googleFileNeeded || [];
  const { live, copia } = data.summary;
  const box = $('m-gf-box');
  box.hidden = !live?.total && !need.length && !(copia?.original + copia?.convertida) && !data.qualidade?.pares;
  if (box.hidden) return;
  const partes = [];
  if (live?.total) {
    const lidos = live.comMovimento + live.semMovimento;
    partes.push(`<b>${fmt.format(live.total)}</b> Live Photos do iCloud também estão no Google.`
      + (lidos ? ` Delas, ${fmt.format(live.comMovimento)} têm o movimento no Google e <b>${fmt.format(live.semMovimento)}</b> estão lá só como foto parada.` : '')
      + (live.naoLido ? ` De ${fmt.format(live.naoLido)} ainda não se sabe: o dado vem na próxima leitura do Google (aba Inventário).` : ''));
  }
  if (copia.original + copia.convertida) {
    partes.push(`Arquivos conferidos: ${fmt.format(copia.original)} no mesmo formato do iCloud (original) e <b>${fmt.format(copia.convertida)}</b> em outro formato (em geral JPEG no lugar do HEIC), dos quais ${fmt.format(copia.convertidaCheia || 0)} no tamanho cheio e ${fmt.format(copia.convertida - (copia.convertidaCheia || 0))} também reduzidos.`);
  }
  partes.push(need.length ? `Faltam conferir ${fmt.format(need.length)} arquivos do Google.` : 'Todos os arquivos que importam já foram conferidos.');
  const q = data.qualidade;
  if (q?.pares) {
    const m = q.motivos;
    const det = [m.googleMenor && `${fmt.format(m.googleMenor)} menores`, m.googleConvertida && `${fmt.format(m.googleConvertida)} convertidas`, m.googleSemMovimento && `${fmt.format(m.googleSemMovimento)} sem o movimento`].filter(Boolean).join(', ');
    partes.push(`<br><b>Melhor cópia</b> das ${fmt.format(q.pares)} fotos que estão nos dois: equivalentes em ${fmt.format(q.iguais)}; `
      + `<a href="#rev" data-cls="melhorIcloud">no iCloud em <b>${fmt.format(q.icloud + q.misto)}</b></a>${det ? ` (no Google: ${det})` : ''}; `
      + `<a href="#rev" data-cls="melhorGoogle">no Google em ${fmt.format(q.google + q.misto)}</a>${q.misto ? ` (${fmt.format(q.misto)} com vantagem dos dois lados)` : ''}.`);
  }
  $('m-gf').innerHTML = partes.join(' ');
  for (const a of $('m-gf').querySelectorAll('a[data-cls]')) {
    a.addEventListener('click', (e) => { e.preventDefault(); $('r-cls').value = a.dataset.cls; $('r-cat').value = ''; $('r-dec').value = ''; page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' })); });
  }
  if (!gfJob) { $('m-gf-run').hidden = !need.length; $('m-gf-run').textContent = `Conferir os arquivos do Google (${fmt.format(need.length)})`; }
}

async function runGoogleFiles() {
  const need = data?.googleFileNeeded || [];
  if (!need.length || gfJob) return;
  gfJob = { stop: false, done: 0, failed: 0, status: null };
  $('m-gf-run').hidden = true;
  $('m-gf-stop').hidden = false;
  const queue = [...need];
  let batch = [];
  const flush = async () => { if (batch.length) { const b = batch; batch = []; await patchItems(b); } };
  const show = (msg) => { $('m-gf-state').textContent = msg || `conferindo… ${fmt.format(gfJob.done)} de ${fmt.format(need.length)}`; };
  const worker = async () => {
    while (queue.length && !gfJob.stop) {
      const it = queue.shift();
      try {
        const file = await fichaGoogle(it.url);
        batch.push({ id: it.id, file });
        gfJob.done++;
      } catch (e) {
        gfJob.failed++;
        // 404: a foto saiu do Google; outros erros (403, 429...) param tudo
        if (e.status !== 404) { gfJob.stop = 'erro'; gfJob.status = e.status || e.message; }
      }
      if (batch.length >= 200) await flush();
      if (gfJob.done % 20 === 0) show();
    }
  };
  show();
  await Promise.all(Array.from({ length: 4 }, worker));
  await flush();
  const why = gfJob.stop === 'erro' ? `parou por erro do Google (${gfJob.status})` : gfJob.stop ? 'parada por você' : 'concluída';
  show(`${why}: ${fmt.format(gfJob.done)} de ${fmt.format(need.length)} conferidos.`);
  gfJob = null;
  $('m-gf-stop').hidden = true;
  compute();
}

// ---------- desempate pelo iCloud ----------
let icJob = null;
function renderIcloudCheck() {
  const need = data.icloudPhashNeeded || [];
  const disputed = data.summary.totals.confirmar + data.summary.totals.reduzida;
  $('m-ic-box').hidden = !disputed;
  $('m-ic').innerHTML = need.length
    ? `<b>${fmt.format(need.length)}</b> itens do iCloud têm miniatura guardada e podem desempatar pares.`
    : data.icloudPhashWanted
      ? `<b>${fmt.format(data.icloudPhashWanted)}</b> itens do iCloud precisam da imagem para desempatar. O próximo percurso da biblioteca do iCloud (aba Inventário) confere cada um assim que o vê, sem outro passo, e guarda no notebook a miniatura das fotos que só estão no iCloud ou têm cópias repetidas nele (${fmt.format(data.icloudThumbKeep || 0)} itens), para a revisão funcionar depois que os links da Apple expirarem.`
      : `Nenhum item do iCloud precisa da imagem para desempatar.`;
  $('m-ic-run').hidden = !need.length || Boolean(icJob);
}

async function runIcloudCheck() {
  const need = data?.icloudPhashNeeded || [];
  if (!need.length || icJob) return;
  icJob = { stop: false, done: 0, failed: 0, expired: 0 };
  $('m-ic-run').hidden = true;
  $('m-ic-stop').hidden = false;
  const queue = [...need];
  let batch = [];
  const flush = async () => { if (batch.length) { const b = batch; batch = []; await patchItems(b); } };
  const show = (msg) => { $('m-ic-state').textContent = msg || `conferindo… ${fmt.format(icJob.done)} de ${fmt.format(need.length)} (falhas: ${fmt.format(icJob.failed)})`; };
  const worker = async () => {
    while (queue.length && !icJob.stop) {
      const it = queue.shift();
      try {
        const res = await fetch(it.url.replace('${f}', 'thumb.jpg'));
        if (!res.ok) {
          icJob.failed++;
          if ([401, 403, 404, 410].includes(res.status)) icJob.expired++;
          // as primeiras falharem todas: URLs expiradas, não insiste
          if (icJob.done === 0 && icJob.expired >= 8) icJob.stop = 'expiradas';
          continue;
        }
        const p = { id: it.id, phash: await phashFromBlob(await res.blob()), phashV: 2 };
        // editada: o original também conta
        if (it.urlOrig) {
          const ro = await fetch(it.urlOrig.replace('${f}', 'thumb.jpg')).catch(() => null);
          if (ro?.ok) p.phashOrig = await phashFromBlob(await ro.blob()).catch(() => null);
        }
        batch.push(p);
        icJob.done++;
        if (batch.length >= 50) await flush();
        if (icJob.done % 50 === 0) show();
      } catch { icJob.failed++; }
    }
  };
  show();
  await Promise.all(Array.from({ length: 8 }, worker));
  await flush();
  const why = icJob.stop === 'expiradas' ? 'as URLs das miniaturas expiraram: percorra a biblioteca do iCloud de novo e tente outra vez'
    : icJob.stop ? 'parada por você' : 'concluída';
  show(`${why}: ${fmt.format(icJob.done)} de ${fmt.format(need.length)} conferidos, ${fmt.format(icJob.failed)} falhas.`);
  icJob = null;
  $('m-ic-stop').hidden = true;
  compute();
}

const GB = (bytes) => `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;

// ---------- o que fazer agora ----------
const irPara = (filtro) => {
  $('r-cls').value = filtro.cls || ''; $('r-cat').value = filtro.cat || ''; $('r-dec').value = filtro.dec || '';
  page = 0; renderList(); document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' }));
};
const PASSO = {
  conferirGoogle: { botao: 'Conferir', fazer: () => $('m-phash').click() },
  conferirIcloud: { botao: 'Conferir', fazer: () => $('m-ic-run').click() },
  arquivosGoogle: { botao: 'Conferir', fazer: () => $('m-gf-run').click() },
  responderPares: { botao: 'Começar', fazer: () => { irPara({ cls: 'idIncerta' }); const l = filtered(); for (const r of l) if (verFotos(r, null, l)) break; } },
  percorrerIcloud: { botao: 'Ir ao Inventário', fazer: () => document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'inv' })) },
  revisarPendentes: { botao: 'Ver categorias', fazer: () => $('m-cat-box').scrollIntoView({ behavior: 'smooth', block: 'start' }) },
};
async function renderPassos() {
  const [concl, prog] = await Promise.all([getMeta('icloudCompleted'), getMeta('phashProgress')]);
  const passos = proximosPassos(data, { icloudConcluidoEm: concl?.value?.at || null, ocupado: { google: prog?.value?.state === 'lendo' } });
  $('m-passos-box').hidden = !passos.length;
  $('m-passos').replaceChildren(...passos.map((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<span><b>${fmt.format(p.n)}</b> ${escHtml(p.texto)}</span>`;
    if (p.id === 'percorrerIcloud' && p.n === 1) li.querySelector('b').remove();
    const b = document.createElement('button');
    b.textContent = PASSO[p.id].botao;
    b.addEventListener('click', PASSO[p.id].fazer);
    li.append(b);
    return li;
  }));
}

/** A pergunta central: fotos pessoais guardadas nos dois lugares, sem perda (muda com as marcações). */
function renderProtecao() {
  const p = resumoProtecao(data.rows);
  const el = $('m-protecao');
  el.hidden = !p.total;
  if (!p.total) return;
  el.innerHTML = `Das <b>${fmt.format(p.total)}</b> fotos pessoais (Pessoal ou Manter, pela sua marcação ou pela sugestão), `
    + `<b>${pct(p.protegidas, p.total)}</b> estão guardadas nos dois lugares sem perda (${fmt.format(p.protegidas)}). `
    + `Faltam: ${fmt.format(p.comPerda)} nos dois, mas com a melhor cópia num lugar só; ${fmt.format(p.incertas)} a confirmar se são a mesma foto; `
    + `${fmt.format(p.soIcloud)} só no iCloud e ${fmt.format(p.soGoogle)} só no Google.`;
}

/** Prévia do envio curado, a partir das marcações em vigor. */
export function renderPlan() {
  if (!data) return;
  renderProtecao();
  renderPassos().catch(() => {});
  const plan = sendPlan(data.rows);
  $('m-plan-box').hidden = !data.rows.length;
  $('m-plan').innerHTML = [
    ['iCloud → Google', plan.toGoogle.n, `${GB(plan.toGoogle.bytes)}, dos quais ${fmt.format(plan.toGoogle.videos)} vídeos somam ${GB(plan.toGoogle.videoBytes)} · ${fmt.format(plan.toGoogle.held)} retidos (Pendente ou Descartar)`],
    ['Google → iCloud', plan.toIcloud.n, `${GB(plan.toIcloud.bytes)} estimados · ${fmt.format(plan.toIcloud.held)} retidos`],
    ['Reenviar original ao Google', plan.quality.n, `o iCloud tem a melhor cópia: ${[`${fmt.format(plan.quality.googleMenor)} menores no Google`, `${fmt.format(plan.quality.googleConvertida)} convertidas`, `${fmt.format(plan.quality.googleSemMovimento)} sem o movimento`].join(', ')}`],
  ].map(([t, n, sub]) => `<article><span>${t}</span><span class="n">${fmt.format(n)}</span><span class="hint">${sub}</span></article>`).join('');
  $('m-plan-note').textContent = 'O tamanho do lado do Google é estimado pela resolução, com a média de bytes por pixel das fotos do iCloud (o Google não informa o tamanho dos arquivos). Vídeos do Google entram pela mesma estimativa.';
}

function renderCategories() {
  const counts = {};
  for (const r of data.rows) counts[r.cat] = (counts[r.cat] || 0) + 1;
  $('m-cat-box').hidden = !data.rows.length;
  const box = $('m-cats');
  box.innerHTML = '';
  for (const [k, label] of Object.entries(CATEGORIES)) {
    const el = document.createElement('article');
    const sug = DECISIONS[suggestDecision(k)];
    el.innerHTML = `<span>${label}</span><span class="n">${fmt.format(counts[k] || 0)}</span><span class="hint">sugestão: ${sug}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Revisar';
    btn.disabled = !counts[k];
    btn.addEventListener('click', () => {
      $('r-cls').value = ''; $('r-cat').value = k; $('r-dec').value = ''; page = 0; renderList();
      document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' }));
    });
    el.append(btn);
    box.append(el);
  }
}

function renderDup() {
  const { dup, phashNeeded, icloudPhashNeeded } = data;
  const side = (el, title, d, filter, pend) => {
    const mb = d.bytes ? ` · ${GB(d.bytes)}` : '';
    el.innerHTML = `<span>${title}</span><span class="n">${fmt.format(d.copias)}</span>`
      + `<span class="hint">cópias a mais em ${fmt.format(d.grupos)} grupos${mb}${d.identicos ? ` · ${fmt.format(d.identicos)} são arquivos idênticos` : ''}</span>`
      + `<span class="hint">fotos diferentes no mesmo segundo: ${fmt.format(d.diferentes)} · incertos: ${fmt.format(d.incertos)} · ainda sem conferir: ${fmt.format(d.pendentes)}${pend}</span>`;
    const btn = document.createElement('button');
    btn.textContent = 'Ver cópias';
    btn.disabled = !d.copias;
    btn.addEventListener('click', () => {
      $('r-cls').value = filter; $('r-cat').value = ''; $('r-dec').value = ''; page = 0; renderList();
      document.dispatchEvent(new CustomEvent('geyma-tab', { detail: 'rev' }));
    });
    el.append(btn);
  };
  $('m-dup-box').hidden = !(dup.google.candidatos || dup.icloud.candidatos || dup.google.copias || dup.icloud.copias);
  side($('m-dup-g'), 'Google Fotos', dup.google, 'dupGoogle', '');
  const icPend = dup.icloud.pendentes && !(icloudPhashNeeded || []).length ? ' (precisam das miniaturas do próximo percurso do iCloud)' : '';
  side($('m-dup-a'), 'iCloud Fotos', dup.icloud, 'dupIcloud', icPend);
  const btn = $('m-phash');
  btn.hidden = !phashNeeded.length;
  btn.textContent = `Conferir o Google pelas miniaturas (${fmt.format(phashNeeded.length)} itens)`;
  showPhashProgress(data.phashProgress);
}

export function showPhashProgress(p) {
  const el = $('m-phash-state');
  if (!p) { el.textContent = ''; return; }
  const n = `${fmt.format(p.done || 0)} de ${fmt.format(p.total || 0)} miniaturas`;
  // "lendo" gravado há mais de 2 min sem atualização = conferência interrompida
  // (por exemplo, a extensão foi recarregada); o botão volta a funcionar
  const stale = p.state === 'lendo' && p.at && Date.now() - p.at > 120000;
  if (stale) p = { ...p, state: 'interrompida' };
  const label = { interrompida: `interrompida em ${n}; clique para continuar`, lendo: `conferindo… ${n}`, concluido: `conferência concluída: ${n}`, parado: `parada por você: ${n}`, erro: `parou por erro do Google (${p.status || p.reason || '?'}): ${n}` }[p.state] || p.state;
  el.textContent = label;
  $('m-phash').disabled = p.state === 'lendo';
  $('m-phash-stop').hidden = p.state !== 'lendo';
}

async function startPhash() {
  if (!data?.phashNeeded.length) return;
  $('m-phash').disabled = true;
  const res = await chrome.runtime.sendMessage({ kind: 'phash', keys: data.phashNeeded });
  if (!res?.ok) { $('m-phash-state').textContent = `Não foi possível: ${res?.reason || 'abra o Google Fotos e tente de novo'}`; $('m-phash').disabled = false; }
  else showPhashProgress({ state: 'lendo', done: 0, total: data.phashNeeded.length });
}

function drawStack(byYear) {
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const thead = document.querySelector('#m-table thead');
  thead.innerHTML = `<tr><th>Ano</th>${ORDER.map((k) => `<th>${CLASSES[k]}</th>`).join('')}</tr>`;
  const tbody = document.querySelector('#m-table tbody');
  tbody.innerHTML = years.map((y) => `<tr><td>${y}</td>${ORDER.map((k) => `<td>${fmt.format(byYear[y][k])}</td>`).join('')}</tr>`).join('');

  const chart = $('m-chart');
  if (!years.length) { chart.innerHTML = '<p class="muted">Sem dados ainda.</p>'; return; }
  const W = Math.max(560, chart.clientWidth || 900); // largura real: texto dos eixos em tamanho legível
  const H = 260, padL = 52, padB = 26, padT = 10;
  const tot = (y) => ORDER.reduce((n, k) => n + byYear[y][k], 0);
  const max = Math.max(1, ...years.map(tot));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const plotH = H - padB - padT;
  const colW = (W - padL) / years.length;
  const barW = Math.max(2, Math.min(22, colW - (colW > 8 ? 3 : 1)));
  const ns = 'http://www.w3.org/2000/svg';
  const el = (name, attrs) => { const n = document.createElementNS(ns, name); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });
  const grid = el('g', { class: 'grid axis' });
  for (let v = 0; v <= top; v += step) {
    const yy = padT + plotH - (v / top) * plotH;
    grid.append(el('line', { x1: padL, x2: W, y1: yy, y2: yy }));
    const t = el('text', { x: padL - 8, y: yy + 4, 'text-anchor': 'end' });
    t.textContent = fmt.format(v);
    grid.append(t);
  }
  svg.append(grid);
  const labelEvery = Math.ceil(years.length / Math.max(4, Math.floor(W / 60)));
  years.forEach((yr, i) => {
    const g = el('g', { class: 'col' });
    const x = padL + i * colW + (colW - barW) / 2;
    let base = padT + plotH;
    const segs = ORDER.filter((k) => byYear[yr][k]);
    segs.forEach((k, j) => {
      const h = Math.max(1, plotH * (byYear[yr][k] / top));
      const gap = j < segs.length - 1 && h > 3 ? 2 : 0; // espaço de 2px entre segmentos
      base -= h;
      g.append(el('rect', { class: `c-${k}`, x, y: base + gap, width: barW, height: Math.max(1, h - gap), rx: j === segs.length - 1 ? Math.min(4, barW / 2) : 0 }));
    });
    const hit = el('rect', { class: 'hit', x: padL + i * colW, y: padT, width: colW, height: plotH });
    hit.addEventListener('mousemove', (e) => tip(e, yr, byYear[yr]));
    hit.addEventListener('mouseleave', () => { $('tooltip').hidden = true; });
    g.append(hit);
    if (i % labelEvery === 0) {
      const t = el('text', { x: padL + i * colW + colW / 2, y: H - 8, 'text-anchor': 'middle', class: 'axis' });
      t.textContent = years.length > 14 ? `'${String(yr).slice(2)}` : yr;
      g.append(t);
    }
    svg.append(g);
  });
  chart.innerHTML = '';
  chart.append(svg);
}

function tip(e, yr, row) {
  const t = $('tooltip');
  t.innerHTML = `<b>${yr}</b>${ORDER.map((k) => `<span class="tip-row"><i class="swatch c-${k}"></i>${CLASSES[k]}: ${fmt.format(row[k])}</span>`).join('')}`;
  t.hidden = false;
  t.style.left = `${Math.min(e.clientX + 14, innerWidth - 260)}px`;
  t.style.top = `${e.clientY + 14}px`;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

// ---------- revisão ----------
let gridMode = false;
const pageSize = () => (gridMode ? 120 : 50);
let page = 0;
let pendingBatch = null;
let selected = new Set();
let pageRows = [];

function fillYears() {
  const sel = $('r-year');
  const keep = sel.value;
  const years = Object.keys(data.summary.byYear).sort().reverse();
  sel.length = 1;
  for (const y of years) sel.append(new Option(y, y));
  sel.value = years.includes(keep) ? keep : '';
}

// marcação em vigor: a do usuário ou, sem ela, a sugestão das regras
const effective = effectiveDecision;

function filtered() {
  if (!data) return [];
  return filterRows(data.rows, { cls: $('r-cls').value, cat: $('r-cat').value, dec: $('r-dec').value, year: $('r-year').value, kind: $('r-kind').value });
}

const dims = (o) => (o?.w ? `${o.w}×${o.h}` : '—');
const mb = (n) => (n ? `${(n / 1048576).toFixed(1)} MB` : '');

function renderReviewSummary() {
  if (!data) return;
  const { counts, decided } = decisionCounts(data.rows);
  $('r-summary').innerHTML = `Marcadas por você: <b>${fmt.format(decided)}</b> de ${fmt.format(data.rows.length)} fotos. `
    + `Em vigor (sua marcação ou a sugestão): ${Object.entries(DECISIONS).map(([k, l]) => `${l} ${fmt.format(counts[k])}`).join(' · ')}.`;
}

function renderList() {
  const rows = filtered();
  const PAGE = pageSize();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(page, pages - 1);
  $('r-count').textContent = data ? `${fmt.format(rows.length)} itens` : 'calculando o cruzamento…';
  $('r-page').textContent = `página ${page + 1} de ${pages}`;
  $('r-prev').disabled = page === 0;
  $('r-next').disabled = page >= pages - 1;
  $('r-batch-n').textContent = fmt.format(rows.length);
  for (const b of document.querySelectorAll('#r-batch button[data-dec]')) b.disabled = !rows.length;
  cancelBatch();
  renderReviewSummary();
  pageRows = rows.slice(page * PAGE, (page + 1) * PAGE);
  selected = new Set();
  $('r-list').hidden = gridMode;
  $('r-grid').hidden = !gridMode;
  $('r-selbar').hidden = !gridMode;
  if (gridMode) { renderGrid(); return; }
  const tbody = document.querySelector('#r-table tbody');
  tbody.innerHTML = '';
  for (const r of pageRows) {
    const tr = document.createElement('tr');
    const note = (r.cls === 'reduzida' ? ` <span class="tag">menor no ${r.menor === 'google' ? 'Google' : 'iCloud'}</span>` : '')
      + (r.quadroDiferente ? ' <span class="tag" title="Live Photo: mesmo clique, mesmo instante, mas o quadro principal é outro em cada serviço (por exemplo, trocado no iPhone depois de a cópia ir para o Google).">Live Photo · quadro diferente</span>' : '')
      + (r.versaoEditada ? ' <span class="tag" title="Mesmo nome de arquivo e mesmo instante, com a imagem mudada: uma versão editada (corte, filtro) da mesma foto.">versão editada</span>' : '')
      + (r.a?.live && r.g?.extrasLidos ? (r.g.motionMs ? ' <span class="tag" title="Live Photo: o Google também tem o movimento.">Live completa no Google</span>' : ' <span class="tag" title="Live Photo no iCloud, mas no Google só a foto parada (sem o movimento).">Google sem o movimento</span>') : '')
      + (r.copiaGoogle === 'convertida' ? ` <span class="tag" title="${escHtml(textoFicha(r.g.file))}">Google: cópia em ${escHtml(r.g.file.formato)}</span>` : '')
      + (etiquetaQualidade(r.melhor) ? ` <span class="tag" title="${escHtml(porqueQualidade(r.melhor))}">${etiquetaQualidade(r.melhor)}</span>` : '')
      + (r.fuso ? ` <span class="tag" title="Mesma hora local, instante deslocado: um dos serviços guardou a foto com outro fuso horário. Fica a confirmar até as imagens serem comparadas.">fuso horário (${textoFuso(r.fuso)})</span>` : '')
      + (r.peloUsuario ? ' <span class="tag" title="Você disse no visualizador que são a mesma foto.">mesma foto, por você</span>' : '')
      + (!r.g && r.a?.diferenteDe?.length ? ' <span class="tag" title="Você disse no visualizador que esta foto é diferente da que o Google tinha no mesmo instante.">diferente, por você</span>' : '')
      + (r.parecida ? ' <span class="tag" title="As imagens foram comparadas: são parecidas, mas não iguais. Pode ser outro quadro da mesma Live Photo ou uma foto de rajada.">imagens só parecidas</span>' : '')
      + (r.semConferencia ? ' <span class="tag" title="Mesmo instante e mesma proporção, mas as imagens ainda não foram comparadas. Use Conferir o Google pelas miniaturas na aba Proteção.">imagem não conferida</span>' : '')
      + (r.dup ? ' <span class="tag">cópia no Google</span>' : '') + (r.dupIcloud ? ' <span class="tag">cópia no iCloud</span>' : '');
    tr.innerHTML = `<td class="thumbs"></td><td>${when(r.ts)}</td><td><i class="swatch c-${r.cls}"></i> ${CLASSES[r.cls]}${note}</td><td class="cat"></td><td class="dec"></td><td class="name"></td><td>${dims(r.a)} ${mb(r.a?.size)}</td><td>${dims(r.g)}</td>`;
    const cat = tr.querySelector('.cat');
    cat.textContent = CATEGORIES[r.cat];
    if (r.why) cat.title = r.why;
    const sel = document.createElement('select');
    sel.setAttribute('aria-label', 'Marcação');
    sel.append(new Option(`sugestão: ${DECISIONS[suggestDecision(r.cat)]}`, ''));
    for (const [k, l] of Object.entries(DECISIONS)) sel.append(new Option(l, k));
    sel.value = r.decision || '';
    sel.classList.toggle('suggested', !r.decision);
    sel.addEventListener('change', async () => {
      await decide([r], sel.value || null);
      sel.classList.toggle('suggested', !r.decision);
      renderReviewSummary();
      renderPlan();
    });
    tr.querySelector('.dec').append(sel);
    tr.querySelector('.name').textContent = r.a?.name || (r.a ? '(sem nome)' : '—');
    fillThumbs(tr.querySelector('.thumbs'), r);
    tbody.append(tr);
  }
}

// ---------- miniaturas ----------
// Google: a imagem exige a sessão; a extensão busca com cookies (permissão de
// host) e mostra como blob. iCloud: URL temporária assinada, carregada direto.
const thumbCache = new Map();
let thumbActive = 0;
const thumbQueue = [];
function googleThumb(base) {
  if (thumbCache.has(base)) return thumbCache.get(base);
  const p = new Promise((resolve) => thumbQueue.push({ base, resolve }));
  thumbCache.set(base, p);
  pumpThumbs();
  return p;
}
function pumpThumbs() {
  while (thumbActive < 6 && thumbQueue.length) {
    const { base, resolve } = thumbQueue.shift();
    thumbActive++;
    fetch(`${base}=w160-h160-c`, { credentials: 'include' })
      .then(async (res) => {
        const type = res.headers.get('content-type') || '';
        resolve(res.ok && type.startsWith('image/') ? URL.createObjectURL(await res.blob()) : null);
      })
      .catch(() => resolve(null))
      .finally(() => { thumbActive--; pumpThumbs(); });
  }
}

// iCloud: a miniatura guardada no notebook, se houver; senão a URL (temporária)
const icloudCache = new Map();
function icloudThumb(img, it) {
  const url = it.thumb.replace('${f}', 'thumb.jpg');
  if (!it.id) { img.src = url; return; }
  if (!icloudCache.has(it.id)) icloudCache.set(it.id, getThumb(it.id).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  icloudCache.get(it.id).then((src) => { img.src = src || url; });
}

// ---------- foto grande ----------
// Google: a foto grande também exige a sessão; busca com cookies e vira blob.
async function googleBlob(url) {
  const res = await fetch(url, { credentials: 'include' });
  const type = res.headers.get('content-type') || '';
  return res.ok && type.startsWith('image/') ? URL.createObjectURL(await res.blob()) : null;
}

/**
 * Versão grande do iCloud: a foto como está agora (numa editada, a versão
 * cheia já editada) se o link ainda vale; senão pede ao percurso um link novo
 * (rola a grade até a foto). original: o original de uma editada.
 */
function icloudGrandeOuRenova(it, { original = false } = {}) {
  const pronto = original ? icloudOriginal(it) : icloudGrande(it);
  if (pronto) return async () => pronto;
  if (!it.id) return null;
  return async () => {
    const r = await renovarIcloud(it.id);
    return (original ? linkOriginal(r) : linkAtual(r)) || (r.thumb || '').replace('${f}', 'thumb.jpg') || null;
  };
}
// uma renovação por foto, mesmo com dois painéis (atual e original) pedindo
const renovacoes = new Map();
function renovarIcloud(id) {
  if (!renovacoes.has(id)) {
    renovacoes.set(id, chrome.runtime.sendMessage({ kind: 'icloud-refresh', id }).then((r) => {
      if (!r?.ok) throw new Error(r?.erro || 'sem link novo');
      return r;
    }));
    renovacoes.get(id).catch(() => {}).finally(() => setTimeout(() => renovacoes.delete(id), 60000));
  }
  return renovacoes.get(id);
}
const RENOVANDO = 'buscando um link novo no iCloud (alguns segundos)…';

const SEM_ICLOUD = 'Não deu para trazer esta foto do iCloud agora (o link da Apple expirou e a renovação falhou). Confira se a aba do iCloud Fotos está aberta no notebook.';
/** Deslocamento do Google em relação ao iCloud, em horas ("Google +3 h"). */
const textoFuso = (ms) => `Google ${ms > 0 ? '+' : '−'}${(Math.abs(ms) / 3600000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h`;
const dimsTxt = (it) => (it?.w && it?.h ? `${it.w}×${it.h}` : '');

// miniatura inicial no visualizador quando a linha não está na tela (aberta por link)
const thumbInicial = (it, side) => {
  if (side === 'google') return googleThumb(it.thumb);
  const url = it.thumb.replace('${f}', 'thumb.jpg');
  if (!it.id) return url;
  if (!icloudCache.has(it.id)) icloudCache.set(it.id, getThumb(it.id).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  return icloudCache.get(it.id).then((src) => src || url);
};

/** Dimensões e, quando houver, a ficha do arquivo do Google (busca e guarda se faltar). */
function infoGoogle(g, video = false) {
  const dims = dimsTxt(g);
  // vídeo: o download sem sufixo de vídeo devolve a capa (JPEG); a ficha enganaria
  if (video || g.video) return [dims, 'vídeo'].join(' · ');
  const mov = g.extrasLidos ? (g.motionMs ? 'com movimento' : '') : '';
  const junta = (f) => [dims, textoFicha(f), mov].filter(Boolean).join(' · ');
  if (g.file || !g.thumb || !g.id) return junta(g.file);
  return fichaGoogle(g.thumb).then((file) => { g.file = file; patchItems([{ id: g.id, file }]).catch(() => {}); return junta(file); }, () => junta(null));
}

/** Link que abre esta linha no painel (para copiar e mandar). */
export const linkDaFoto = (r) => `${location.origin}${location.pathname}#rev?foto=${encodeURIComponent(r.ids[0])}`;

/** Abre as fotos da linha em tamanho grande, lado a lado quando há mais de uma. td = célula com as miniaturas já carregadas (opcional). */
/**
 * Abre a linha r no visualizador. lista: as linhas do filtro em vigor, para
 * andar entre elas sem fechar (as sem miniatura são puladas).
 */
function verFotos(r, td, lista = null) {
  const imgs = td ? [...td.querySelectorAll('img')] : [];
  const fotos = [];
  let i = 0;
  const src = (it, side) => { const img = imgs[i++]; return img?.currentSrc || img?.src || thumbInicial(it, side); };
  if (r.a?.thumb) {
    const editada = temOriginal(r.a);
    // dimensões da editada só quando mudaram (um corte); trocadas = só girada
    const mesmas = (r.a.editW === r.a.w && r.a.editH === r.a.h) || (r.a.editW === r.a.h && r.a.editH === r.a.w);
    const dimsEd = editada && r.a.editW && !mesmas ? `cortada: ${r.a.editW}×${r.a.editH} (original ${dimsTxt(r.a)})` : '';
    fotos.push({ src: src(r.a, 'icloud'), rotulo: editada ? 'iCloud · como está agora (editada)' : 'iCloud', semImagem: SEM_ICLOUD, info: [dimsEd || dimsTxt(r.a), r.a.name].filter(Boolean).join(' · '), grande: icloudGrandeOuRenova(r.a), carregando: icloudGrande(r.a) ? null : RENOVANDO });
    if (editada) {
      // o original fica ao lado: o Google pode ter guardado qualquer uma das duas
      fotos.push({ src: icloudOriginal(r.a) || (r.a.thumbOrig || '').replace('${f}', 'thumb.jpg'), rotulo: 'iCloud · original, antes da edição', semImagem: SEM_ICLOUD, info: dimsTxt(r.a), grande: icloudGrandeOuRenova(r.a, { original: true }), carregando: icloudOriginal(r.a) ? null : RENOVANDO });
    } else if (r.a.edited) {
      fotos[fotos.length - 1].info = Promise.resolve(fotos[fotos.length - 1].info).then((t) => [t, 'editada no iPhone; o próximo percurso traz também o original'].filter(Boolean).join(' · '));
    }
  }
  if (r.dupOfIcloud?.thumb) {
    fotos.push({ src: src(r.dupOfIcloud, 'icloud'), rotulo: 'iCloud (a que fica)', semImagem: SEM_ICLOUD, info: dimsTxt(r.dupOfIcloud), grande: icloudGrandeOuRenova(r.dupOfIcloud), carregando: icloudGrande(r.dupOfIcloud) ? null : RENOVANDO });
  }
  if (r.dupOf?.thumb) {
    fotos.push({ src: src(r.dupOf, 'google'), rotulo: 'Google (a que fica)', info: dimsTxt(r.dupOf), grande: () => googleBlob(googleGrande(r.dupOf.thumb)), link: r.dupOf.key ? `https://photos.google.com/photo/${r.dupOf.key}` : null });
  }
  if (r.g?.thumb) {
    fotos.push({ src: src(r.g, 'google'), rotulo: 'Google', info: infoGoogle(r.g, Boolean(r.a?.video)), grande: () => googleBlob(googleGrande(r.g.thumb)), link: r.g.key ? `https://photos.google.com/photo/${r.g.key}` : null });
  }
  if (!fotos.length) return false;
  // a barra de endereço passa a identificar a foto: copiar o endereço também serve
  const link = linkDaFoto(r);
  const antes = location.hash;
  try { history.replaceState(null, '', link); } catch {}
  const PROVA = { identico: 'mesmos dados do arquivo', imagem: 'imagens quase iguais' };
  const evid = [...new Set([r.dupEvidence, r.dupEvidenceIcloud].filter(Boolean))].map((k) => PROVA[k] || k).join(' · ');
  abrirVisor(fotos, `${when(r.ts)} · ${CLASSES[r.cls]}${r.semConferencia ? ' · imagem ainda não conferida' : ''}${r.peloUsuario ? ' · mesma foto, por você' : ''}${r.fuso ? ` · instante deslocado por fuso horário (${textoFuso(r.fuso)})` : ''}${r.parecida ? ' · imagens só parecidas, não iguais' : ''}${r.quadroDiferente ? ' · Live Photo, mesmo clique com quadro diferente' : ''}${r.dup || r.dupIcloud ? ' · cópia repetida' : ''}${evid ? ` (${evid})` : ''}`, {
    link,
    ...vereditoNoVisor(r),
    ...navegacao(r, lista),
    aoFechar: () => { try { history.replaceState(null, '', antes.includes('foto=') ? '#rev' : antes || '#rev'); } catch {} },
  });
  return true;
}

/**
 * Grava o veredito do usuário sobre um par ('mesma' | 'diferente' | 'desfazer')
 * no item do iCloud e refaz o cruzamento em segundo plano.
 */
export async function registrarVeredito(aId, gId, tipo) {
  const a = await getItem(aId);
  if (!a || a.source !== 'icloud') throw new Error('foto do iCloud não encontrada');
  if (gId && !(await getItem(gId))) throw new Error('foto do Google não encontrada');
  const p = patchVeredito(a, gId, tipo);
  await patchItems([p]);
  // a linha aberta passa a refletir o veredito até o cruzamento novo chegar
  for (const r of data?.rows || []) if (r.a?.id === aId) Object.assign(r.a, { mesmaQue: p.mesmaQue, diferenteDe: p.diferenteDe });
  compute({ motivo: 'sua decisão sobre um par' });
  return p;
}

const RESPOSTA = {
  mesma: 'Anotado: são a mesma foto. O cruzamento é refeito em segundo plano.',
  diferente: 'Anotado: são fotos diferentes. O cruzamento é refeito em segundo plano; cada uma passa a contar como só de um lado, se não houver outra.',
  desfazer: 'Desfeito: a decisão volta a ser automática. O cruzamento é refeito em segundo plano.',
};

/** Pergunta e botões do veredito para uma linha aberta no visualizador. */
function vereditoNoVisor(r) {
  if (!r.a?.id) return {};
  const age = (tipo, gId = r.g?.id) => async () => { await registrarVeredito(r.a.id, gId, tipo); return RESPOSTA[tipo]; };
  if (r.g?.id) {
    const ja = vereditoDoPar(r.a, r.g.id);
    if (ja === 'mesma') return { pergunta: 'Você disse que são a mesma foto.', acoes: [{ rotulo: 'Desfazer', titulo: 'Voltar para a decisão automática', tecla: 'z', aoClicar: age('desfazer') }] };
    return {
      pergunta: 'Estas fotos são a mesma?',
      acoes: [
        { rotulo: 'São a mesma foto', tecla: 'm', titulo: 'Conta como guardada nos dois serviços, mesmo com imagens só parecidas (por exemplo, outro quadro da mesma Live Photo)', aoClicar: age('mesma') },
        { rotulo: 'São fotos diferentes', tecla: 'd', titulo: 'Desfaz o par: cada foto passa a contar só no seu serviço, se não houver outra igual', aoClicar: age('diferente') },
      ],
    };
  }
  // só no iCloud: fotos do Google sem par, mesmas dimensões e instante próximo
  const sugestoes = r.cls === 'soIcloud' ? sugestoesParaParear(r) : [];
  // só no iCloud porque o usuário recusou um par: dá para desfazer
  if (r.a.diferenteDe?.length) {
    return { pergunta: `Você disse que esta foto é diferente de ${r.a.diferenteDe.length === 1 ? 'uma foto' : `${r.a.diferenteDe.length} fotos`} do Google.${sugestoes.length ? ' Ou é uma destas?' : ''}`, acoes: [{ rotulo: 'Desfazer', titulo: 'Voltar para a decisão automática', tecla: 'z', aoClicar: age('desfazer', null) }], sugestoes };
  }
  if (sugestoes.length) return { pergunta: 'Está no Google com outro horário? Se for uma destas, clique nela:', sugestoes };
  return {};
}

// fotos só do Google, por instante, para sugerir pares à mão (refeito a cada cruzamento)
let soGoogleCache = null;
/** Fotos só do Google que podem ser a mesma de uma linha só do iCloud (também para o celular). */
export function candidatosDoGoogle(r) {
  if (soGoogleCache?.data !== data) soGoogleCache = { data, lista: data.rows.filter((x) => x.cls === 'soGoogle' && !x.dup && x.g?.thumb).map((x) => ({ ...x.g, ts: x.ts })) };
  return sugestoesDoGoogle({ ...r.a, ts: r.ts }, soGoogleCache.lista);
}
function sugestoesParaParear(r) {
  return candidatosDoGoogle(r).map((g) => ({
    src: googleThumb(g.thumb),
    rotulo: `${when(g.ts)} · ${dimsTxt(g)}`,
    aoEscolher: async () => { await registrarVeredito(r.a.id, g.id, 'mesma'); return RESPOSTA.mesma; },
  }));
}

/** Anterior e próxima da lista no visualizador. */
function navegacao(r, lista) {
  const i = lista ? lista.indexOf(r) : -1;
  if (i < 0) return {};
  const ir = (passo) => () => {
    for (let j = i + passo; j >= 0 && j < lista.length; j += passo) if (verFotos(lista[j], null, lista)) return;
  };
  return { anterior: i > 0 ? ir(-1) : null, proxima: i < lista.length - 1 ? ir(1) : null, posicao: `${fmt.format(i + 1)} de ${fmt.format(lista.length)}` };
}

/** Abre a foto de um link (#rev?foto=<id>): a linha que contém o item, na lista e no visualizador. */
export async function abrirFotoDoLink(id) {
  const d = await whenComputed();
  const r = d.rows.find((x) => x.ids.includes(id) || x.dupOf?.id === id || x.dupOfIcloud?.id === id);
  if (!r) { $('r-msg').textContent = `A foto do link (${id}) não está no cruzamento atual.`; return false; }
  if (!verFotos(r, null)) $('r-msg').textContent = `A foto do link (${id}) não tem miniatura para mostrar.`;
  return true;
}

function fillThumbs(td, r, link = true) {
  const add = (label, side) => {
    const fig = document.createElement('a');
    fig.className = `thumb ${side}`;
    // na lista, clicar abre a foto grande; na grade, clicar seleciona (a lupa abre)
    if (link) {
      fig.title = `${label} · clique para ver em tamanho grande`;
      fig.href = '#';
      fig.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); verFotos(r, td, filtered()); });
    } else fig.title = label;
    const img = document.createElement('img');
    img.alt = label;
    img.loading = 'lazy';
    img.onerror = () => fig.classList.add('missing');
    fig.append(img);
    td.append(fig);
    return img;
  };
  if (r.a?.thumb) icloudThumb(add('Miniatura no iCloud', 'icloud'), r.a);
  // cópia repetida: mostra a cópia que fica ao lado, para conferir antes de decidir
  if (r.dupOfIcloud?.thumb) icloudThumb(add('Cópia que fica no iCloud (esta linha é uma repetição dela)', 'original icloud-orig'), r.dupOfIcloud);
  if (r.dupOf?.thumb) {
    const img = add('Cópia que fica no Google (esta linha é uma repetição dela)', 'original');
    googleThumb(r.dupOf.thumb).then((src) => { if (src) img.src = src; else img.parentElement.classList.add('missing'); });
  }
  if (r.g?.thumb) {
    const img = add('Miniatura no Google', 'google');
    googleThumb(r.g.thumb).then((src) => { if (src) img.src = src; else img.parentElement.classList.add('missing'); });
  }
  if (!td.children.length) {
    const none = document.createElement('span');
    none.className = 'nothumb';
    none.textContent = 'sem miniatura';
    // itens do iCloud ganham miniatura no próximo percurso da biblioteca
    none.title = r.a ? 'A miniatura do iCloud chega no próximo percurso da biblioteca (aba Inventário).' : 'Miniatura indisponível.';
    td.append(none);
  }
}

/** Grava a marcação nos itens (os dois lados do par). null volta para a sugestão. */
async function decide(rows, decision) {
  const at = Date.now();
  const patches = [];
  for (const r of rows) {
    r.decision = decision;
    for (const id of r.ids) patches.push({ id, decision, decidedAt: decision ? at : null });
  }
  // marcar não muda o cruzamento: não invalida o resultado guardado, só entra na lista de marcações recentes
  for (let i = 0; i < patches.length; i += 5000) await patchItems(patches.slice(i, i + 5000), { versao: false });
  await registrarDecisoes(Object.fromEntries(patches.map((p) => [p.id, { d: decision, at }])));
}

function askBatch(decision, rows = filtered(), what = 'itens') {
  if (!rows.length) return;
  pendingBatch = { decision, rows };
  const esp = espacoDasLinhas(rows, bytesPerPixel(data.rows));
  const ocupa = [esp.icloud && `${GB(esp.icloud)} no iCloud`, esp.google && `${esp.googleEstimado ? 'cerca de ' : ''}${GB(esp.google)} no Google`].filter(Boolean).join(' e ');
  $('r-confirm-text').textContent = `Marcar ${fmt.format(rows.length)} ${what} como ${DECISIONS[decision]}?${ocupa ? ` Eles ocupam ${ocupa}.` : ''} Isso só registra a sua decisão aqui; nada muda nos serviços.`;
  $('r-confirm').hidden = false;
}

// ---------- grade ----------
function renderGrid() {
  const grid = $('r-grid');
  grid.innerHTML = '';
  for (const r of pageRows) {
    const tile = document.createElement('label');
    tile.className = 'tile';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => {
      if (box.checked) selected.add(r); else selected.delete(r);
      tile.classList.toggle('on', box.checked);
      $('r-sel-n').textContent = fmt.format(selected.size);
    });
    const pic = document.createElement('div');
    pic.className = 'pic';
    fillThumbs(pic, r, false);
    const ver = document.createElement('button');
    ver.type = 'button';
    ver.className = 'tile-ver';
    ver.textContent = '⤢';
    ver.title = 'Ver em tamanho grande';
    ver.setAttribute('aria-label', 'Ver em tamanho grande');
    ver.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); verFotos(r, pic, filtered()); });
    pic.append(ver);
    const cap = document.createElement('span');
    cap.className = 'cap';
    const dec = r.decision ? DECISIONS[r.decision] : `sugestão: ${DECISIONS[suggestDecision(r.cat)]}`;
    cap.textContent = `${r.dup || r.dupIcloud ? 'cópia · ' : ''}${day(r.ts)} · ${dec}`;
    tile.title = `${CATEGORIES[r.cat]}${r.why ? ` (${r.why})` : ''}${r.a?.name ? ` · ${r.a.name}` : ''}`;
    tile.append(box, pic, cap);
    grid.append(tile);
  }
  $('r-sel-n').textContent = '0';
}

function setGrid(on) {
  gridMode = on;
  $('r-view-list').setAttribute('aria-pressed', String(!on));
  $('r-view-grid').setAttribute('aria-pressed', String(on));
  page = 0;
  renderList();
}

function applySelection() {
  const which = $('r-sel-which').value;
  const rows = which === 'sel' ? [...selected] : pageRows.filter((r) => !selected.has(r));
  askBatch($('r-sel-dec').value, rows, which === 'sel' ? 'itens selecionados' : 'itens não selecionados desta página');
}

function selectAll(on) {
  for (const box of $('r-grid').querySelectorAll('input[type=checkbox]')) {
    if (box.checked !== on) { box.checked = on; box.dispatchEvent(new Event('change')); }
  }
}

function cancelBatch() { pendingBatch = null; $('r-confirm').hidden = true; }

async function confirmBatch() {
  if (!pendingBatch) return;
  const { decision, rows } = pendingBatch;
  $('r-confirm-text').textContent = 'gravando…';
  await decide(rows, decision);
  $('r-msg').textContent = `${fmt.format(rows.length)} itens marcados como ${DECISIONS[decision]}.`;
  renderList();
  renderPlan();
}

function exportCsv() {
  const rows = filtered();
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['captura_utc', 'situacao', 'categoria', 'motivo', 'marcacao', 'arquivo_icloud', 'icloud_dim', 'icloud_bytes', 'google_dim', 'video'].join(',')];
  for (const r of rows) {
    lines.push([new Date(r.ts).toISOString(), CLASSES[r.cls], CATEGORIES[r.cat], r.why, r.decision ? DECISIONS[r.decision] : `sugestão: ${DECISIONS[suggestDecision(r.cat)]}`,
      r.a?.name, dims(r.a), r.a?.size, dims(r.g), r.a?.video ? 'sim' : ''].map(esc).join(','));
  }
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `geyma-revisao-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function hasData() { return Boolean(data); }

// ---------- acesso para a versão do celular (mobile-api.js) ----------
export const getData = () => data;
export const isBusy = () => busy;
/** Espera o cruzamento estar pronto (calcula se ainda não houver). */
export function whenComputed() {
  // o cruzamento guardado serve enquanto o novo é calculado em segundo plano
  if (data) return Promise.resolve(data);
  const pronto = new Promise((resolve) => document.addEventListener('geyma-ready', () => resolve(data), { once: true }));
  ensureComputed();
  return pronto;
}
/** Recalcula e espera o resultado novo. */
export function recomputeAndWait() {
  const pronto = new Promise((resolve) => document.addEventListener('geyma-ready', () => resolve(data), { once: true }));
  compute();
  return pronto;
}
/** Andamento do cálculo em curso (para o celular), ou null. */
export const calcProgress = () => (busy ? ultimoAndamento : null);
/** Marca linhas vindas do celular e atualiza o painel aberto. */
export async function decideRows(rows, decision) {
  await decide(rows, decision);
  renderList();
  renderPlan();
}
