// Motor de identidade: cruza o inventário do Google Fotos com o do iCloud Fotos
// usando só metadados (instante de captura e dimensões). Funções puras.
//
// Regras, medidas na prova de acesso e no inventário real:
// - O Google guarda o instante quase sempre sem milissegundos (truncado ou
//   arredondado); o iCloud guarda com milissegundos. Por isso o instante é
//   comparado com tolerância de 1 s.
// - As dimensões podem vir trocadas (orientação EXIF): largura × altura de um
//   lado igual a altura × largura do outro conta como a mesma foto.
// - Mesma proporção com área diferente = cópia reduzida (perda de qualidade de
//   um dos lados).
// - Mais de um candidato no mesmo segundo (rajadas, duplicatas) = par provável,
//   que precisa de confirmação visual (pHash) antes de qualquer decisão.
// - Live Photo: os quadros de um mesmo clique têm o mesmo instante. Se o
//   quadro principal foi trocado (no iPhone, ou numa cópia enviada depois), as
//   imagens diferem mas é a mesma foto: "mesmo clique, quadro diferente".

import { hamming, SAME_MAX, DIFFERENT_MIN } from './phash.js';
import { mesmoNome, copiaNoGoogle } from './google-file.js';

export const TOLERANCE_MS = 1000;

// Fotos em sequência no mesmo segundo (rajadas): a candidata mais parecida
// resolve a disputa quando está perto (até RAJADA_MAX) e ganha das outras
// candidatas, e das outras fotos do iCloud que a querem, por RAJADA_MARGEM.
// Medido em 18/11: resolve poucas disputas; nas outras, a escolhida não tem
// imagem comparada, outra candidata está quase à mesma distância ou a melhor
// está longe. Essas ficam para o usuário.
export const RAJADA_MAX = 16;
export const RAJADA_MARGEM = 8;

/**
 * A disputa no mesmo segundo se resolve pela imagem?
 * @param pick candidata escolhida ({g, d}); c todas as candidatas do item
 * @param rivais outros itens do iCloud que também querem a mesma foto do
 *   Google: {d: distância até ela, melhor: menor distância deles até
 *   qualquer candidata}. Numa rajada dos dois lados, cada quadro do iCloud
 *   tem o seu par; a rival que tem uma opção claramente melhor (por
 *   RAJADA_MARGEM) não disputa esta. null = sem imagem para comparar.
 * @returns {{n: number, margem: number} | null}
 */
export function rajadaResolvida(pick, c, rivais = []) {
  const nada = (d) => d === undefined || d === null;
  if (nada(pick?.d) || pick.d > RAJADA_MAX) return null;
  const outras = c.filter((x) => x !== pick);
  if (outras.some((x) => nada(x.d))) return null;
  const disputam = [];
  for (const r of rivais) {
    if (nada(r.d)) return null;
    if (!nada(r.melhor) && r.d - r.melhor >= RAJADA_MARGEM) continue;
    disputam.push(r.d);
  }
  const margem = Math.min(...outras.map((x) => x.d), ...disputam, 64) - pick.d;
  return margem >= RAJADA_MARGEM ? { n: c.length, margem } : null;
}

// ficha do arquivo do Google só vale para fotos (em vídeos é a da capa)
const fichaFoto = (g) => (g.video ? null : g.file);

/** Live Photo no iCloud (campo live do registro; nos itens antigos, assetSubtypeV2 = 2). */
export const isLive = (a) => Boolean(a?.live ?? a?.subtype === 2);

/**
 * Mesmo clique de uma Live Photo: instante idêntico ao milissegundo, ou, se o
 * Google guardou sem milissegundos, o mesmo segundo com um só candidato.
 */
export function mesmoClique(a, g, nCandidatos = 1) {
  if (!isLive(a)) return false;
  if (g.ts === a.ts) return true;
  return g.ts % 1000 === 0 && Math.floor(g.ts / 1000) === Math.floor(a.ts / 1000) && nCandidatos === 1;
}

export const CLASSES = {
  ambos: 'Em ambos',
  confirmar: 'Em ambos, a confirmar',
  reduzida: 'Cópia reduzida',
  soGoogle: 'Só no Google',
  soIcloud: 'Só no iCloud',
};

/** Relação entre as dimensões de dois itens: 'igual', 'reduzida' ou null. */
export function dimRelation(a, b) {
  if (!a.w || !a.h || !b.w || !b.h) return null;
  if ((a.w === b.w && a.h === b.h) || (a.w === b.h && a.h === b.w)) return 'igual';
  const ra = a.w / a.h;
  const rb = b.w / b.h;
  const same = (x, y) => Math.abs(x - y) / Math.max(x, y) < 0.01;
  if (same(ra, rb) || same(ra, 1 / rb)) return 'reduzida';
  return null;
}

/**
 * Relação de dimensões entre um item do iCloud e um do Google, considerando
 * também a versão editada do iCloud (um corte muda as dimensões, e o Google
 * pode ter guardado a foto já cortada). Prefere 'igual'. dimsA = as dimensões
 * do iCloud que valeram.
 */
export function relacaoDims(a, g) {
  const orig = dimRelation(a, g);
  const ed = a.editW && a.editH && (a.editW !== a.w || a.editH !== a.h) ? { w: a.editW, h: a.editH } : null;
  const rEd = ed ? dimRelation(ed, g) : null;
  if (orig === 'igual' || !rEd) return { rel: orig, dimsA: { w: a.w, h: a.h } };
  if (rEd === 'igual' || !orig) return { rel: rEd, dimsA: ed };
  return { rel: orig, dimsA: { w: a.w, h: a.h } };
}

/**
 * Distância entre as imagens de um item do iCloud e um do Google: a menor
 * entre a versão atual (phash) e o original (phashOrig, só nas editadas).
 * null se não der para comparar.
 */
export function distImagem(a, g) {
  const ds = [hamming(a.phash, g.phash), hamming(a.phashOrig, g.phash)].filter((d) => d !== null && d !== undefined);
  return ds.length ? Math.min(...ds) : null;
}

/**
 * Cruza as duas bibliotecas.
 * @param {Array} google itens normalizados do Google ({id, ts, w, h, ...})
 * @param {Array} icloud itens normalizados do iCloud
 * @param {{until?: number}} opts until: só considera itens até este instante
 *   (para cruzar enquanto o iCloud ainda está sendo lido)
 * @returns {{pairs: Array, soGoogle: Array, soIcloud: Array}}
 *   pairs: {a, g, cls: 'ambos'|'confirmar'|'reduzida', menor?: 'google'|'icloud', dt}
 */
export function matchLibraries(google, icloud, opts = {}) {
  const until = opts.until ?? Infinity;
  const G = google.filter((g) => g.ts <= until);
  const A = icloud.filter((a) => a.ts <= until);

  // índice do Google por segundo
  const bySec = new Map();
  for (const g of G) {
    const s = Math.floor(g.ts / 1000);
    let l = bySec.get(s);
    if (!l) bySec.set(s, (l = []));
    l.push(g);
  }
  // veredito do usuário no visualizador (mesmaQue / diferenteDe, no item do iCloud)
  // recorte achado pelas miniaturas (recorte.js): no item do iCloud, com a foto do Google
  const gById = A.some((a) => a.mesmaQue || a.recorte) ? new Map(G.map((g) => [g.id, g])) : null;
  const candidatesOf = (a) => {
    const escolhida = a.mesmaQue && gById?.get(a.mesmaQue);
    if (escolhida) {
      const { rel, dimsA } = relacaoDims(a, escolhida);
      return [{ g: escolhida, rel: rel || 'igual', dt: Math.abs(escolhida.ts - a.ts), dimsA, peloUsuario: true }];
    }
    const recortada = a.recorte && !a.diferenteDe?.includes(a.recorte.g) && gById?.get(a.recorte.g);
    if (recortada) return [{ g: recortada, rel: 'recorte', dt: Math.abs(recortada.ts - a.ts), dimsA: { w: a.w, h: a.h }, porRecorte: true }];
    const recusadas = a.diferenteDe?.length ? new Set(a.diferenteDe) : null;
    const s = Math.floor(a.ts / 1000);
    const out = [];
    for (const k of [s - 1, s, s + 1]) {
      for (const g of bySec.get(k) || []) {
        const dt = Math.abs(g.ts - a.ts);
        if (dt > TOLERANCE_MS || recusadas?.has(g.id)) continue;
        const { rel, dimsA } = relacaoDims(a, g);
        if (rel) out.push({ g, rel, dt, dimsA });
      }
    }
    // melhor primeiro: dimensões iguais, depois menor diferença de instante
    out.sort((x, y) => (x.rel === y.rel ? x.dt - y.dt : x.rel === 'igual' ? -1 : 1));
    return out;
  };

  // Com o pHash dos dois lados, a imagem decide: candidatos claramente
  // diferentes saem, e os mais parecidos vêm primeiro.
  const byImage = (a, c) => {
    if ((!a.phash && !a.phashOrig) || c[0]?.peloUsuario || c[0]?.porRecorte) return c;
    const scored = c.map((x) => ({ ...x, d: distImagem(a, x.g), clique: mesmoClique(a, x.g, c.length) || mesmoNome(a, fichaFoto(x.g)) }));
    return scored
      // imagem diferente sai, a não ser que seja outro quadro do mesmo clique de
      // uma Live Photo ou o mesmo arquivo de origem (nome igual, no mesmo instante)
      .filter((x) => x.d === null || x.d < DIFFERENT_MIN || x.clique)
      .sort((x, y) => (x.d ?? 99) - (y.d ?? 99) || (x.rel === y.rel ? x.dt - y.dt : x.rel === 'igual' ? -1 : 1));
  };

  const cands = new Map(); // id do iCloud -> candidatos
  const demand = new Map(); // id do Google -> quantos itens do iCloud o querem
  const distPorG = new Map(); // id do Google -> [{aId, d}] (rajadas)
  for (const a of A) {
    const c = byImage(a, candidatesOf(a));
    cands.set(a.id, c);
    for (const x of c) {
      demand.set(x.g.id, (demand.get(x.g.id) || 0) + 1);
      let l = distPorG.get(x.g.id);
      if (!l) distPorG.set(x.g.id, (l = []));
      l.push({ aId: a.id, d: x.d ?? null });
    }
  }

  // menor distância de um item do iCloud até qualquer candidata (rajadas)
  const melhorDist = (aId) => {
    const ds = cands.get(aId).map((x) => x.d).filter((d) => d !== undefined && d !== null);
    return ds.length ? Math.min(...ds) : null;
  };

  // atribuição um-para-um: primeiro os casos sem disputa, depois os demais
  // (os pares que o usuário confirmou vêm antes de todos)
  const confirmou = (x) => (cands.get(x.id)[0]?.peloUsuario || cands.get(x.id)[0]?.porRecorte ? 0 : 1);
  const order = [...A].sort((x, y) => confirmou(x) - confirmou(y) || cands.get(x.id).length - cands.get(y.id).length || x.ts - y.ts);
  const usedG = new Set();
  const pairs = [];
  const soIcloud = [];
  for (const a of order) {
    const c = cands.get(a.id);
    let pick = c.find(({ g }) => !usedG.has(g.id));
    // mesma imagem já usada por outro item do iCloud (duplicata no iCloud):
    // o conteúdo está no Google, então o item conta como "em ambos"
    let reused = false;
    if (!pick && a.phash) {
      const twin = c.find((x) => x.d !== undefined && x.d !== null && x.d <= SAME_MAX);
      if (twin) { pick = twin; reused = true; }
    }
    if (!pick) { soIcloud.push(a); continue; }
    usedG.add(pick.g.id);
    const peloUsuario = Boolean(pick.peloUsuario);
    // recorte: a imagem já provou (uma é pedaço da outra); o pHash não serve
    const imageConfirmed = peloUsuario || Boolean(pick.porRecorte) || (pick.d !== undefined && pick.d !== null && pick.d <= SAME_MAX);
    // vários candidatos que são a mesma imagem (duplicatas no Google) não são disputa
    const sameImage = c.length > 1 && c.every(({ g }) => samePicture(g, pick.g));
    let disputed = !imageConfirmed && ((c.length > 1 && !sameImage) || demand.get(pick.g.id) > 1);
    // fotos em sequência: a imagem mais parecida, com folga, resolve a disputa
    const rajada = disputed ? rajadaResolvida(pick, c, distPorG.get(pick.g.id).filter((x) => x.aId !== a.id).map((x) => ({ d: x.d, melhor: melhorDist(x.aId) }))) : null;
    if (rajada) disputed = false;
    // provas guardadas para o placar de identidade (placar.js)
    const pair = { a, g: pick.g, dt: pick.dt, rel: pick.rel, dist: pick.porRecorte ? null : pick.d ?? distImagem(a, pick.g) };
    if (pick.porRecorte) { pair.recorte = a.recorte.cortada; pair.recorteNcc = a.recorte.ncc; }
    if (peloUsuario) pair.confirmadoPeloUsuario = true;
    else if (imageConfirmed) pair.confirmadoPorImagem = true;
    if (reused) pair.duplicataNoIcloud = true;
    // imagens comparadas e só parecidas (nem iguais, nem claramente diferentes):
    // por exemplo dois quadros de uma Live Photo, ou fotos de rajada
    const comparada = !imageConfirmed && pick.d !== undefined && pick.d !== null;
    const nome = mesmoNome(a, fichaFoto(pick.g));
    const quadro = comparada && (mesmoClique(a, pick.g, c.length) || (nome && isLive(a)));
    // mesmo arquivo de origem com a imagem mudada: versão editada (corte, filtro);
    // ou a mesma imagem com outro tom, pela comparação das miniaturas (recorte.js)
    const pelaMiniatura = comparada && !quadro && !nome && a.edicao?.g === pick.g.id;
    const editada = comparada && !quadro && (nome || pelaMiniatura);
    const parecida = comparada && !quadro && !editada;
    if (parecida) pair.parecida = true;
    if (rajada) pair.rajada = rajada;
    if (quadro) pair.quadroDiferente = true;
    if (editada) pair.versaoEditada = true;
    if (pelaMiniatura) pair.edicaoNcc = a.edicao.ncc;
    if (nome) pair.mesmoNome = true;
    if (pick.rel === 'reduzida') {
      pair.menor = pick.dimsA.w * pick.dimsA.h < pick.g.w * pick.g.h ? 'icloud' : 'google';
      // só é "cópia reduzida" se não houver dúvida de que é a mesma imagem
      pair.cls = (parecida && !rajada) || disputed ? 'confirmar' : 'reduzida';
    } else {
      pair.cls = disputed ? 'confirmar' : 'ambos';
    }
    if (disputed) { pair.disputado = true; pair.candidatos = c.map(({ g }) => g.id); }
    if (sameImage) pair.duplicatasNoGoogle = c.length - 1;
    pairs.push(pair);
  }
  const fuso = parearPorFuso(soIcloud, G.filter((g) => !usedG.has(g.id)));
  for (const p of fuso.pairs) { usedG.add(p.g.id); pairs.push(p); }
  const soGoogle = G.filter((g) => !usedG.has(g.id));
  return { pairs, soGoogle, soIcloud: fuso.restantes };
}

/**
 * Segunda passada, só com o que sobrou: a mesma foto com o instante deslocado
 * por fuso horário. Medido no inventário real: a maior parte das sobras com
 * par deslocado tem a mesma hora local nos dois serviços (instante + fuso
 * guardado) e o instante diferente; outra parte tem a hora local de um lado
 * guardada como se fosse UTC do outro. Só com dimensões iguais (ou giradas) e
 * um único candidato; o par fica "a confirmar" até a imagem decidir:
 * imagens iguais confirmam, imagens claramente diferentes desfazem o par.
 */
/**
 * Deslocamento que um fuso horário explica: múltiplo de 15 min (com 2 s de
 * folga, pelo Google sem milissegundos) e até 14 h. Fusos estranhos guardados
 * em fotos antigas dão deslocamentos de minutos quebrados, que não servem.
 */
export function deslocamentoDeFuso(ms) {
  const q = 15 * 60000;
  const abs = Math.abs(ms);
  if (abs < q - 2000 || abs > 14 * 3600000 + 2000) return false;
  const resto = abs % q;
  return Math.min(resto, q - resto) <= 2000;
}

export function parearPorFuso(icloud, google) {
  const local = (x) => (x.tzOffset ? x.ts + x.tzOffset : null);
  const porSeg = new Map();
  const add = (s, g) => { let l = porSeg.get(s); if (!l) porSeg.set(s, (l = [])); if (!l.includes(g)) l.push(g); };
  for (const g of google) {
    // instante do Google, e também a hora local dele (para o caso inverso)
    add(Math.floor(g.ts / 1000), g);
    const lg = local(g);
    if (lg != null) add(Math.floor(lg / 1000), g);
  }
  const usados = new Set();
  const pairs = [];
  const restantes = [];
  for (const a of icloud) {
    const la = local(a);
    const recusadas = a.diferenteDe?.length ? new Set(a.diferenteDe) : null;
    const achados = new Map();
    // hora local do iCloud contra a hora local do Google ou o instante do Google;
    // instante do iCloud contra a hora local do Google
    for (const t of [la, a.ts]) {
      if (t == null) continue;
      const s = Math.floor(t / 1000);
      for (const k of [s - 1, s, s + 1]) {
        for (const g of porSeg.get(k) || []) {
          if (usados.has(g.id) || recusadas?.has(g.id) || Math.abs(g.ts - a.ts) <= TOLERANCE_MS) continue;
          const lg = local(g);
          const bate = (t === la && (Math.abs(g.ts - la) <= TOLERANCE_MS || (lg != null && Math.abs(lg - la) <= TOLERANCE_MS)))
            || (t === a.ts && lg != null && Math.abs(lg - a.ts) <= TOLERANCE_MS);
          if (bate && deslocamentoDeFuso(g.ts - a.ts) && dimRelation(a, g) === 'igual') achados.set(g.id, g);
        }
      }
    }
    if (achados.size !== 1) { restantes.push(a); continue; }
    const [g] = achados.values();
    const d = distImagem(a, g);
    if (d !== null && d >= DIFFERENT_MIN) { restantes.push(a); continue; }
    usados.add(g.id);
    const pair = { a, g, dt: Math.abs(g.ts - a.ts), fuso: true, deslocamentoMs: g.ts - a.ts, rel: 'igual', dist: d };
    if (d !== null && d <= SAME_MAX) { pair.cls = 'ambos'; pair.confirmadoPorImagem = true; }
    else { pair.cls = 'confirmar'; if (d !== null) pair.parecida = true; }
    pairs.push(pair);
  }
  return { pairs, restantes };
}

/**
 * Certeza de que um par é a mesma foto:
 * - 'confirmada': você disse que é; ou as imagens foram conferidas e são
 *   iguais; ou é o mesmo arquivo de origem (mesmo nome) no mesmo instante ao
 *   milissegundo;
 * - 'incerta': a confirmar (outra candidata no mesmo segundo, imagens só
 *   parecidas) ou cópia reduzida sem a imagem conferida;
 * - 'provavel': o resto — instante e dimensões batem, sem outra candidata
 *   (inclui o outro quadro de uma Live Photo, a versão editada e a foto em
 *   sequência resolvida pela imagem).
 */
export function estadoIdentidade(p) {
  if (p.confirmadoPeloUsuario || p.confirmadoPorImagem || (p.mesmoNome && p.a.ts === p.g.ts)) return 'confirmada';
  // rajada resolvida pela imagem: a mais parecida, com folga sobre as outras
  if (p.rajada && !p.disputado) return 'provavel';
  if (p.cls === 'confirmar' || p.parecida || p.disputado || (p.cls === 'reduzida' && !p.confirmadoPorImagem)) return 'incerta';
  return 'provavel';
}

/** Mesma imagem pelo pHash (os dois precisam ter o hash calculado). */
export function samePicture(x, y) {
  if (x === y) return true;
  const d = hamming(x.phash, y.phash);
  return d !== null && d <= SAME_MAX;
}

/**
 * Classifica os grupos de mesmo segundo do Google pelo pHash.
 * Cada grupo vira agrupamentos de imagens iguais; o que passa do primeiro de
 * cada agrupamento é duplicata confirmada.
 * @returns {{confirmados, extrasConfirmados, diferentes, incertos, pendentes, pendingIds, extraIds, extraOf}}
 *   extraOf: id da cópia -> id do primeiro item do agrupamento (a "original")
 */
export function analyzeGoogleDuplicates(groups) {
  const out = { confirmados: 0, extrasConfirmados: 0, diferentes: 0, incertos: 0, pendentes: 0, pendingIds: [], extraIds: [], extraOf: {} };
  for (const l of groups) {
    const missing = l.filter((g) => !g.phash);
    if (missing.length) {
      out.pendentes++;
      for (const g of missing) out.pendingIds.push(g.id);
      continue;
    }
    const clusters = [];
    let uncertain = false;
    for (const g of l) {
      const home = clusters.find((cl) => hamming(cl[0].phash, g.phash) <= SAME_MAX);
      if (home) { home.push(g); continue; }
      if (clusters.some((cl) => hamming(cl[0].phash, g.phash) < DIFFERENT_MIN)) uncertain = true;
      clusters.push([g]);
    }
    const extras = clusters.reduce((n, cl) => n + cl.length - 1, 0);
    for (const cl of clusters) for (const g of cl.slice(1)) { out.extraIds.push(g.id); out.extraOf[g.id] = cl[0].id; }
    if (extras) { out.confirmados++; out.extrasConfirmados += extras; }
    else if (uncertain) out.incertos++;
    else out.diferentes++;
  }
  return out;
}

/** Itens do Google com outro item no mesmo segundo e mesmas dimensões: possível duplicata. */
export function googleSameSecondGroups(google) {
  const groups = new Map();
  for (const g of google) {
    const k = `${Math.floor(g.ts / 1000)}|${Math.min(g.w, g.h)}x${Math.max(g.w, g.h)}`;
    let l = groups.get(k);
    if (!l) groups.set(k, (l = []));
    l.push(g);
  }
  return [...groups.values()].filter((l) => l.length > 1);
}

/** Resumo do cruzamento: totais por classe e por ano (ano UTC da captura). */
export function summarizeMatch({ pairs, soGoogle, soIcloud }) {
  const totals = { ambos: 0, confirmar: 0, reduzida: 0, soGoogle: soGoogle.length, soIcloud: soIcloud.length };
  const identidade = { confirmada: 0, provavel: 0, incerta: 0 };
  const reduzidaMenor = { google: 0, icloud: 0 };
  let quadroDiferente = 0;
  // Live Photos do iCloud que estão nos dois: o Google tem o movimento? (só se a leitura do Google já trouxe esse dado)
  const live = { total: 0, comMovimento: 0, semMovimento: 0, naoLido: 0 };
  const copia = { original: 0, convertida: 0, convertidaCheia: 0, recomprimida: 0 };
  const byYear = {};
  const bump = (ts, cls) => {
    const y = new Date(ts).getUTCFullYear();
    byYear[y] ??= { ambos: 0, confirmar: 0, reduzida: 0, soGoogle: 0, soIcloud: 0 };
    byYear[y][cls]++;
  };
  for (const p of pairs) {
    totals[p.cls]++;
    identidade[estadoIdentidade(p)]++;
    if (p.cls === 'reduzida') reduzidaMenor[p.menor]++;
    if (p.quadroDiferente) quadroDiferente++;
    if (isLive(p.a)) {
      live.total++;
      if (!p.g.extrasLidos) live.naoLido++;
      else if (p.g.motionMs) live.comMovimento++;
      else live.semMovimento++;
    }
    const k = copiaNoGoogle(p.a, p.g);
    if (k) copia[k]++;
    // convertida no mesmo tamanho: perde o formato (HEIC → JPEG), não a resolução
    if (k === 'convertida' && p.a.w * p.a.h === p.g.w * p.g.h) copia.convertidaCheia++;
    bump(p.a.ts, p.cls);
  }
  for (const g of soGoogle) bump(g.ts, 'soGoogle');
  for (const a of soIcloud) bump(a.ts, 'soIcloud');
  return { totals, identidade, reduzidaMenor, quadroDiferente, live, copia, byYear };
}

/** Limite do trecho já lido do iCloud enquanto o percurso não termina. */
export function partialUntil(icloud) {
  if (icloud.length < 100) return null;
  const ts = icloud.map((a) => a.ts).sort((x, y) => x - y);
  // a captura passiva traz alguns itens recentes logo no início; o percentil 99
  // marca o ponto até onde a grade foi percorrida em ordem
  return ts[Math.floor(ts.length * 0.99)];
}

/**
 * Itens do Google sem pHash que a imagem decidiria: duplicatas pendentes,
 * candidatos de pares disputados e pares "cópia reduzida" (mesmo instante e
 * mesma proporção não bastam: duas fotos de uma Live Photo, ou de uma rajada,
 * podem ter o mesmo instante e a mesma proporção sem ser a mesma imagem).
 * Devolve as chaves do Google (sem o prefixo "g:").
 */
export function googlePhashNeeded(pendingIds, pairs, hasHash) {
  const need = new Set(pendingIds);
  for (const p of pairs) {
    for (const id of p.candidatos || []) if (!hasHash.has(id)) need.add(id);
    if (p.cls === 'reduzida' && !p.confirmadoPorImagem && !p.confirmadoPeloUsuario && !hasHash.has(p.g.id)) need.add(p.g.id);
    // par por fuso horário: a imagem decide
    if (p.fuso && !p.confirmadoPorImagem && !hasHash.has(p.g.id)) need.add(p.g.id);
  }
  return [...need].map((id) => id.slice(2));
}

/**
 * Itens do Google cuja ficha do arquivo (formato, tamanho, nome) ajuda: todos
 * os pares de fotos, porque o tamanho diz se o Google recomprimiu (0.5).
 * Primeiro os que também ajudam na identidade e no movimento: Live Photos do
 * iCloud, cópias reduzidas, pares a confirmar e imagens só parecidas.
 */
export function googleFileNeeded(pairs) {
  const primeiro = [];
  const depois = [];
  for (const p of pairs) {
    if (p.g.file || !p.g.thumb || p.a.video || p.g.video) continue;
    (isLive(p.a) || p.cls !== 'ambos' || p.parecida ? primeiro : depois).push({ id: p.g.id, url: p.g.thumb });
  }
  return [...primeiro, ...depois];
}

/**
 * Itens do iCloud que entram no cruzamento. Ficam de fora (e, portanto, de
 * qualquer envio) as fotos ocultas e as que o último percurso completo da
 * biblioteca não encontrou (ocultas registradas sem a marca, ou apagadas).
 */
export const paraCruzar = (icloud) => icloud.filter((x) => !x.hidden && !x.foraDoPercurso);

/**
 * Depois de um percurso completo iniciado em inicio: itens do iCloud que ele
 * não viu (thumbAt anterior ao início). Se forem mais que a fração limite do
 * total, o percurso provavelmente pulou trechos: devolve null e nada é marcado.
 */
export function naoVistosNoPercurso(icloud, inicio, limite = 0.02) {
  const fora = icloud.filter((x) => !x.hidden && (x.thumbAt || 0) < inicio && (x.seenAt || 0) < inicio).map((x) => x.id);
  return fora.length > Math.max(50, icloud.length * limite) ? null : fora;
}
