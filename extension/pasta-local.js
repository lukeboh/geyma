// Cartão "Pasta local" do Inventário (0.10): escolhe um diretório (do
// notebook, de um HD externo ou de um NAS montado na rede), lê o começo de
// cada foto e vídeo (EXIF / mvhd) e compara com o Google e o iCloud.
// Só leitura: nenhum arquivo da pasta é alterado e nada sai do notebook.
import { putItems, clearSource, getItemsBySource, getMeta, setMeta } from './src/core/db.js';
import { paraCruzar } from './src/core/match.js';
import { lerMoov } from './src/core/mp4.js';
import { ehMidia, pastaIgnorada, exifJpeg, posicaoExifHeic, exifDoItemHeic, mvhd, normalizarLocal, resumoLocal, cruzarLocal, csvLocal, CLASSES_LOCAL } from './src/core/local.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('pt-BR');
const dia = (ts) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—');
const quando = (ts) => new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// leituras simultâneas: num NAS pela rede, poucas de cada vez rendem mais que muitas
const PARALELO = 4;
const LOTE = 500;
let parar = false;
let lendo = false;
let ultimo = null; // último cruzamento (para o CSV)

/** Lê o começo do arquivo e devolve o que interessa para a identidade. */
async function lerMeta(file) {
  const nome = file.name.toLowerCase();
  const fatia = async (ini, fim) => new Uint8Array(await file.slice(ini, fim).arrayBuffer());
  if (/\.jpe?g$/.test(nome)) return exifJpeg(await fatia(0, 256 * 1024));
  if (/\.(heic|heif)$/.test(nome)) {
    const pos = posicaoExifHeic(await fatia(0, 64 * 1024));
    return pos ? exifDoItemHeic(await fatia(pos.inicio, pos.inicio + Math.min(pos.tamanho, 128 * 1024))) : null;
  }
  if (/\.(mov|mp4|m4v|3gp)$/.test(nome)) {
    const moov = await lerMoov((ini, fim) => file.slice(ini, fim).arrayBuffer(), file.size);
    return moov ? mvhd(moov) : null;
  }
  return null;
}

/** Percorre a pasta (e subpastas) e devolve os arquivos de foto e vídeo. */
async function* percorrer(dir, prefixo = '') {
  for await (const e of dir.values()) {
    if (parar) return;
    if (e.kind === 'directory') {
      if (!pastaIgnorada(e.name)) yield* percorrer(e, `${prefixo}${e.name}/`);
    } else if (ehMidia(e.name)) {
      yield { handle: e, path: `${prefixo}${e.name}` };
    }
  }
}

async function permissao(dir) {
  const op = { mode: 'read' };
  if ((await dir.queryPermission?.(op)) === 'granted') return true;
  return (await dir.requestPermission?.(op)) === 'granted';
}

function estado(texto, erro = false) {
  $('l-state').textContent = texto;
  $('l-state').classList.toggle('state-erro', erro);
}

async function ler(dir) {
  if (lendo) return;
  if (!(await permissao(dir))) { estado('sem permissão para ler a pasta', true); return; }
  lendo = true;
  parar = false;
  botoes();
  const inicio = Date.now();
  let n = 0;
  let semData = 0;
  let lote = [];
  try {
    // releitura completa: o que saiu da pasta sai do inventário
    await clearSource('local', { versao: false });
    await setMeta('localCruzamento', null);
    ultimo = null;
    const fila = [];
    const gravar = async () => { if (lote.length) { await putItems(lote, { versao: false }); lote = []; } };
    const trabalhar = async (f) => {
      let meta = null;
      const file = await f.handle.getFile();
      try { meta = await lerMeta(file); } catch { /* arquivo corrompido ou incompleto: fica sem data */ }
      const it = normalizarLocal({ path: f.path, name: file.name, size: file.size, lastModified: file.lastModified }, meta);
      if (it.tsFonte === 'arquivo' || !it.tsFonte) semData++;
      lote.push(it);
      n++;
      if (n % 50 === 0) estado(`lendo… ${fmt.format(n)} arquivos`);
      if (lote.length >= LOTE) await gravar();
    };
    for await (const f of percorrer(dir)) {
      fila.push(trabalhar(f));
      if (fila.length >= PARALELO) await fila.shift();
    }
    await Promise.all(fila);
    await gravar();
    const progresso = { state: parar ? 'parado' : 'concluido', n, semData, ms: Date.now() - inicio, nome: dir.name };
    await setMeta('localProgress', progresso);
  } catch (e) {
    await setMeta('localProgress', { state: 'erro', n, reason: String(e?.message || e), nome: dir.name });
    estado(`erro: ${e?.message || e}`, true);
  } finally {
    lendo = false;
    botoes();
  }
  const itens = await mostrar();
  if (!parar && itens.length) await comparar();
}

function botoes() {
  $('l-pick').disabled = lendo;
  $('l-reread').disabled = lendo;
  $('l-stop').disabled = !lendo;
  $('l-compare').disabled = lendo;
}

/** Atualiza o cartão com o que está guardado. */
async function mostrar() {
  const [itens, prog, dir] = await Promise.all([getItemsBySource('local'), getMeta('localProgress'), getMeta('localDir')]);
  const r = resumoLocal(itens);
  $('l-total').textContent = fmt.format(r.total);
  $('l-dir').textContent = dir?.value?.name || '—';
  $('l-tipos').textContent = r.total ? `${fmt.format(r.total - r.videos)} fotos · ${fmt.format(r.videos)} vídeos` : '—';
  $('l-range').textContent = r.de ? `${dia(r.de)} a ${dia(r.ate)}` : '—';
  $('l-semdata').textContent = r.total ? fmt.format(r.semData) : '—';
  const p = prog?.value;
  if (!lendo) {
    if (!p) estado(dir ? 'pasta escolhida, ainda não lida' : 'nenhuma pasta escolhida');
    else if (p.state === 'erro') estado(`erro: ${p.reason}`, true);
    else estado(`${p.state === 'parado' ? 'parado por você' : 'lida'} em ${quando(prog.at)}${p.ms ? ` (${Math.round(p.ms / 1000)} s)` : ''}`);
  }
  $('l-reread').hidden = !dir;
  $('l-compare').hidden = !r.total;
  return itens;
}

/** Cruza a pasta com o inventário do Google e do iCloud e guarda o resumo. */
async function comparar() {
  $('l-msg').textContent = 'comparando…';
  const [local, google, icloud] = await Promise.all([getItemsBySource('local'), getItemsBySource('google'), getItemsBySource('icloud')]);
  const t0 = performance.now();
  ultimo = cruzarLocal(local, google, paraCruzar(icloud));
  await setMeta('localCruzamento', ultimo.resumo);
  mostrarResultado(ultimo.resumo);
  if (!google.length && !icloud.length) $('l-msg').textContent = 'Leia o Google e o iCloud primeiro: sem inventário deles, tudo aparece como só na pasta.';
  else $('l-msg').textContent = `comparado em ${Math.round(performance.now() - t0)} ms`;
}

function mostrarResultado(r) {
  const ul = $('l-result');
  ul.innerHTML = '';
  for (const [k, rotulo] of Object.entries(CLASSES_LOCAL)) {
    const li = document.createElement('li');
    li.innerHTML = '<b></b> <span></span>';
    li.querySelector('b').textContent = fmt.format(r[k]);
    li.querySelector('span').textContent = rotulo[0].toLowerCase() + rotulo.slice(1);
    ul.append(li);
  }
  const extra = document.createElement('li');
  extra.className = 'muted';
  extra.textContent = r.de
    ? `No período da pasta (${dia(r.de)} a ${dia(r.ate)}): ${fmt.format(r.googleSemCopia)} do Google e ${fmt.format(r.icloudSemCopia)} do iCloud sem cópia nela.`
    : 'A pasta não tem fotos com data de captura para comparar.';
  ul.append(extra);
  if (r.varios) {
    const v = document.createElement('li');
    v.className = 'muted';
    v.textContent = `${fmt.format(r.varios)} com mais de uma candidata no mesmo segundo (rajadas): a mais parecida pelo nome e pelas dimensões foi escolhida.`;
    ul.append(v);
  }
  $('l-result-box').hidden = false;
  $('l-csv').hidden = !(r.soPasta + r.semData);
}

async function baixarCsv() {
  if (!ultimo) await comparar();
  const linhas = ultimo.linhas.filter((x) => x.cls === 'soPasta' || x.cls === 'semData');
  const blob = new Blob(['﻿', csvLocal(linhas)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `geyma-pasta-sem-copia-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function initPastaLocal() {
  if (!('showDirectoryPicker' in window)) {
    $('l-pick').disabled = true;
    estado('este navegador não permite escolher pastas (use o Chrome ou o Edge)', true);
    return;
  }
  $('l-pick').addEventListener('click', async () => {
    let dir;
    try { dir = await window.showDirectoryPicker({ id: 'geyma-pasta', mode: 'read' }); } catch { return; } // cancelado
    // o acesso fica guardado (o navegador pede confirmação de novo na próxima sessão)
    await setMeta('localDir', dir);
    await setMeta('localProgress', null);
    await mostrar();
    ler(dir);
  });
  $('l-reread').addEventListener('click', async () => {
    const dir = (await getMeta('localDir'))?.value;
    if (dir) ler(dir);
  });
  $('l-stop').addEventListener('click', () => { parar = true; estado('parando…'); });
  $('l-compare').addEventListener('click', comparar);
  $('l-csv').addEventListener('click', baixarCsv);
  botoes();
  // o último resultado guardado: comparar de novo lê o inventário inteiro, só quando pedido
  mostrar().then(async (itens) => {
    const r = (await getMeta('localCruzamento'))?.value;
    if (itens.length && r) { mostrarResultado(r); $('l-msg').textContent = 'resultado da última comparação; use Comparar depois de ler os serviços de novo'; }
  });
}
