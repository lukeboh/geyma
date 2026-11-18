// Worker do cruzamento: lê o inventário, cruza as bibliotecas e devolve o resumo
// e linhas compactas para a revisão, sem travar o painel.
import { getItemsBySource, getMeta, setMeta, putCache, setInventorySummary, registrarDecisoes } from './core/db.js';
import { summarize } from './core/normalize.js';
import { ETAPAS, CALCULO_VERSAO } from './core/calc-cache.js';
import { classifyRow } from './core/classify.js';
import { estadoIdentidade, matchLibraries, summarizeMatch, partialUntil, googlePhashNeeded, googleFileNeeded, isLive, paraCruzar } from './core/match.js';
import { copiaNoGoogle } from './core/google-file.js';
import { ICLOUD_URL_VALIDA_MS } from './core/viewer-src.js';
import { melhorCopia, resumoQualidade } from './core/qualidade.js';
import { analyzeDuplicates, candidateGroups, copiesBytes } from './core/dedup.js';
import { conferirChegadas, marcarChegadas } from './core/envio.js';
import { candidatosRecorte, candidatosEdicao } from './core/recorte.js';
import { ehVideo, copiaVideoNoGoogle, videoFileNeeded, movimentosDeLive, resumoVideos } from './core/video.js';
import { separarPorTipo, itensPorTipo, juntarDuplicatas, tipoDaLinha } from './core/tipo.js';

const row = (cls, a, g, extra = {}) => {
  const { cat, reasons } = classifyRow(a, g);
  return {
    cls,
    ts: (a || g).ts,
    ids: [a?.id, g?.id].filter(Boolean),
    cat,
    why: reasons.join('; '),
    decision: a?.decision || g?.decision || null,
    clipV: (g?.clip || a?.clip)?.v || 0,
    a: a && { id: a.id, name: a.filename, w: a.w, h: a.h, size: a.size, type: a.fileType, video: a.video, live: isLive(a), thumb: a.thumb || null, thumbAt: a.thumbAt || null, med: a.med || null, ...versoesIcloud(a), ...(a.mesmaQue ? { mesmaQue: a.mesmaQue } : {}), ...(a.diferenteDe?.length ? { diferenteDe: a.diferenteDe } : {}), ...(a.video ? { durMs: a.durMs || null, codec: a.codec || null, fps: a.fps || null, vidMed: a.vidMed || null } : {}) },
    g: g && { id: g.id, w: g.w, h: g.h, ...(g.video ? { video: true } : {}), thumb: g.thumb || null, key: g.id.slice(2), file: (!g.video && !a?.video && g.file) || null, motionMs: g.motionMs || null, extrasLidos: Boolean(g.extrasLidos), ...(g.video ? { videoMs: g.videoMs || null, fileV: g.fileV || null } : {}) },
    ...(a && g ? { copiaGoogle: a.video && g.video ? copiaVideoNoGoogle(a, g) : copiaNoGoogle(a, g) } : {}),
    ...extra,
  };
};

/** Versões de uma foto editada do iCloud (a atual está em thumb/med): só aparecem quando existem. */
function versoesIcloud(a) {
  const o = {};
  if (a.edited) o.edited = true;
  if (a.full) o.full = a.full;
  if (a.thumbOrig) o.thumbOrig = a.thumbOrig;
  if (a.medOrig) o.medOrig = a.medOrig;
  if (a.editW && a.editH) { o.editW = a.editW; o.editH = a.editH; }
  return o;
}

/**
 * Falta a impressão digital: sem pHash, ou editada com o pHash de antes da
 * 0.2.36 (calculado só sobre o original, sem a versão atual).
 */
export const faltaPhash = (a) => !a.phash || (a.edited && a.phashV !== 2);

/**
 * Itens do iCloud sem pHash que a imagem decidiria (pares disputados ou
 * reduzidos e candidatas a duplicata) e com o link da miniatura ainda válido;
 * os outros são conferidos pelo próximo percurso, na hora em que ele os vê.
 */
function icloudPhashNeeded(pairs, dupPending, icloudById) {
  const need = new Map();
  const agora = Date.now();
  const vale = (a) => a.thumb && agora - (a.thumbAt || 0) < ICLOUD_URL_VALIDA_MS;
  for (const p of pairs) {
    if ((p.cls === 'confirmar' || p.cls === 'reduzida' || p.parecida) && vale(p.a) && faltaPhash(p.a)) need.set(p.a.id, p.a);
  }
  for (const id of dupPending) { const a = icloudById.get(id); if (a && vale(a) && !a.phash) need.set(id, a); }
  return [...need.values()].map((a) => ({ id: a.id, url: a.thumb, urlOrig: a.thumbOrig || null, at: a.thumbAt || 0 }));
}

/** Itens do iCloud sem pHash que a imagem decidiria, com ou sem miniatura: o próximo percurso baixa a miniatura deles na hora em que a vê. */
function icloudPhashWanted(pairs, dupPending, icloudById) {
  const ids = new Set();
  for (const p of pairs) if ((p.cls === 'confirmar' || p.cls === 'reduzida' || p.parecida) && faltaPhash(p.a)) ids.add(p.a.id);
  for (const id of dupPending) if (!icloudById.get(id)?.phash) ids.add(id);
  return [...ids];
}

/** Itens do iCloud cuja miniatura fica guardada no notebook: os que só estão no iCloud e as cópias repetidas nele (com a que fica). */
function icloudThumbKeep(soIcloud, dupA, pairs) { // (+ candidatas a duplicata e pares a comparar)
  const ids = new Set(soIcloud.map((x) => x.id));
  // pares em que comparar as duas versões importa: um lado reduzido ou ainda a confirmar
  for (const p of pairs) if (p.cls === 'reduzida' || p.cls === 'confirmar') ids.add(p.a.id);
  for (const [id, c] of dupA.copies) { ids.add(id); if (c.keeper) ids.add(c.keeper); }
  // candidatas ainda sem desempate podem virar cópias neste mesmo percurso
  for (const id of dupA.pendingIds) ids.add(id);
  return [...ids];
}

/** Resumo de duplicatas de um serviço para o painel. */
const dupSummary = (items, d) => ({
  candidatos: candidateGroups(items).length,
  grupos: d.grupos,
  copias: d.copias,
  identicos: d.identicos,
  diferentes: d.diferentes,
  incertos: d.incertos,
  pendentes: d.pendentes,
  bytes: copiesBytes(items, d.copies),
});

/** Miniatura da cópia a manter, para mostrar ao lado da cópia na revisão. */
const keeperInfo = (it, side) => it && { id: it.id, med: it.med || null, thumbAt: it.thumbAt || null, thumb: it.thumb || null, key: side === 'google' ? it.id.slice(2) : null, side, w: it.w, h: it.h, ...(side === 'icloud' ? versoesIcloud(it) : {}) };

// avisa o painel de cada etapa (com o tempo da anterior, para achar gargalos)
let t0 = 0;
let tEtapa = 0;
const etapa = (k) => {
  const agora = performance.now();
  self.postMessage({ progresso: { etapa: k, i: ETAPAS.findIndex((e) => e.k === k), n: ETAPAS.length, ms: Math.round(agora - tEtapa), total: Math.round(agora - t0) } });
  tEtapa = agora;
};

/** Só o resumo do inventário (quando ainda não há contagem guardada). */
async function soResumo() {
  const versao = (await getMeta('inventario'))?.value?.versao || 0;
  const [google, icloud] = await Promise.all([getItemsBySource('google'), getItemsBySource('icloud')]);
  const resumo = { google: summarize(google), icloud: summarize(icloud) };
  await setInventorySummary(resumo, versao);
  self.postMessage({ ok: true, resumo });
}

self.onmessage = async (e) => {
  if (e.data === 'resumo') {
    try { await soResumo(); } catch (err) { self.postMessage({ ok: false, reason: String(err.message || err) }); }
    return;
  }
  t0 = tEtapa = performance.now();
  const lidoEm = Date.now();
  try {
    const versao = (await getMeta('inventario'))?.value?.versao || 0;
    etapa('ler');
    const [google, icloudTodo, progress, completed, counts, phashProgress] = await Promise.all([
      getItemsBySource('google'),
      getItemsBySource('icloud'),
      getMeta('icloudProgress'),
      getMeta('icloudCompleted'),
      getMeta('icloudCounts'),
      getMeta('phashProgress'),
    ]);
    // envios do Geyma que já aparecem no inventário do destino (0.7)
    const envio = (await getMeta('envio'))?.value;
    if (envio) {
      const chegadas = conferirChegadas(envio, { google, icloud: icloudTodo });
      if (chegadas.length) await setMeta('envio', marcarChegadas(envio, chegadas));
    }
    // fotos ocultas no iPhone, e as que o último percurso completo não achou,
    // ficam fora do cruzamento (e de qualquer envio). Continuam no inventário.
    // vídeos que a Apple guarda sem tipo reconhecido (.m4v "unsupported"): pelo nome
    for (const x of icloudTodo) if (!x.video && ehVideo(x)) x.video = true;
    const icloud = paraCruzar(icloudTodo);
    const ocultas = icloudTodo.length - icloud.length;
    // percurso concluído alguma vez, ou inventário do tamanho do total oficial da Apple
    const appleTotal = counts?.value?.CPLAssetByAssetDateWithoutHiddenOrDeleted;
    const complete = Boolean(completed) || progress?.value?.state === 'concluido' || Boolean(appleTotal && icloud.length >= appleTotal);
    etapa('cruzar');
    const until = complete ? null : partialUntil(icloud);
    const result = matchLibraries(google, icloud, { until: until ?? Infinity });
    const summary = summarizeMatch(result);
    const scopeG = until ? google.filter((g) => g.ts <= until) : google;
    const scopeA = until ? icloud.filter((x) => x.ts <= until) : icloud;
    // duplicatas por tipo (os grupos nunca misturam foto e vídeo) e juntas
    const scopeGT = itensPorTipo(scopeG);
    const scopeAT = itensPorTipo(scopeA);
    etapa('dupG');
    const dupGT = { foto: analyzeDuplicates(scopeGT.foto), video: analyzeDuplicates(scopeGT.video) };
    const dupG = juntarDuplicatas(dupGT.foto, dupGT.video);
    etapa('dupA');
    const dupAT = { foto: analyzeDuplicates(scopeAT.foto), video: analyzeDuplicates(scopeAT.video) };
    const dupA = juntarDuplicatas(dupAT.foto, dupAT.video);
    const googleById = new Map(google.map((g) => [g.id, g]));
    const icloudById = new Map(icloud.map((x) => [x.id, x]));
    // marca a linha como cópia (de um lado ou dos dois) e traz a cópia a manter
    const dupInfo = (a, g) => {
      const extra = {};
      const cg = g && dupG.copies.get(g.id);
      const ca = a && dupA.copies.get(a.id);
      if (cg) { extra.dup = true; extra.dupOf = keeperInfo(googleById.get(cg.keeper), 'google'); extra.dupEvidence = cg.evidence; }
      if (ca) { extra.dupIcloud = true; extra.dupOfIcloud = keeperInfo(icloudById.get(ca.keeper), 'icloud'); extra.dupEvidenceIcloud = ca.evidence; }
      return extra;
    };
    etapa('lista');
    // vídeo curto do Google no instante de uma Live Photo do iCloud: o movimento dela, enviado à parte
    const movimentos = movimentosDeLive(result.soGoogle, icloud);
    const rows = [
      ...result.pairs.map((p) => row(p.cls, p.a, p.g, {
        ...(p.menor ? { menor: p.menor } : {}),
        // reduzida sem a imagem conferida: só instante e proporção dizem que é a mesma foto
        ...(p.cls === 'reduzida' && !p.confirmadoPorImagem && !p.confirmadoPorDuracao ? { semConferencia: true } : {}),
        ...(p.parecida ? { parecida: true } : {}),
        ...(p.confirmadoPeloUsuario ? { peloUsuario: true } : {}),
        ident: estadoIdentidade(p),
        // provas brutas, para o placar no visualizador (placar.js)
        prova: { dt: p.dt, dist: p.dist ?? null, rel: p.rel || null, ...(p.recorte ? { recorte: p.recorteNcc } : {}), ...(p.edicaoNcc ? { edicao: p.edicaoNcc } : {}), ...(p.mesmoNome ? { nome: true } : {}), ...(p.disputado ? { cand: p.candidatos.length } : {}), ...(p.rajada ? { rajada: p.rajada } : {}), ...(p.duracao ? { dur: p.duracao, durA: p.a.durMs, durG: p.g.videoMs } : {}) },
        ...(p.duracao ? { duracao: p.duracao } : {}),
        ...(p.fuso ? { fuso: p.deslocamentoMs } : {}),
        ...(p.recorte ? { recorte: p.recorte } : {}),
        ...(p.quadroDiferente ? { quadroDiferente: true } : {}),
        ...(p.versaoEditada ? { versaoEditada: true } : {}),
        ...dupInfo(p.a, p.g),
      })),
      ...result.soGoogle.map((g) => row('soGoogle', null, g, { ...dupInfo(null, g), ...(movimentos.has(g.id) ? { movimentoDe: movimentos.get(g.id), cat: 'indefinido', why: 'parece o movimento de uma Live Photo do iCloud (mesmo instante), enviado à parte como vídeo' } : {}) })),
      ...result.soIcloud.map((x) => row('soIcloud', x, null, dupInfo(x, null))),
    ];
    // melhor cópia de cada par (só guarda quando um lado é melhor)
    for (const r of rows) { const m = melhorCopia(r); if (m && m.lado !== 'iguais') r.melhor = m; }
    const qualidade = resumoQualidade(rows);
    const videos = resumoVideos(rows);
    const wanted = icloudPhashWanted(result.pairs, dupA.pendingIds, icloudById);
    await setMeta('icloudPhashWanted', wanted);
    const keep = icloudThumbKeep(result.soIcloud, dupA, result.pairs);
    await setMeta('icloudThumbKeep', keep);
    // os mesmos números, separados entre fotos e vídeos (a chave Fotos | Vídeos do painel)
    const resT = separarPorTipo(result);
    const googleT = itensPorTipo(google);
    const icloudT = itensPorTipo(icloud);
    const todoT = itensPorTipo(icloudTodo);
    const porTipo = {};
    for (const t of ['foto', 'video']) {
      const rowsT = rows.filter((r) => tipoDaLinha(r) === t);
      porTipo[t] = {
        summary: summarizeMatch(resT[t]),
        qualidade: resumoQualidade(rowsT),
        dup: { google: dupSummary(scopeGT[t], dupGT[t]), icloud: dupSummary(scopeAT[t], dupAT[t]) },
        counts: { google: googleT[t].length, icloud: icloudT[t].length, ocultas: todoT[t].length - icloudT[t].length, marcadasOcultas: todoT[t].filter((x) => x.hidden).length },
      };
    }
    etapa('guardar');
    const out = {
      porTipo,
      ok: true,
      complete,
      until,
      summary,
      qualidade,
      videos,
      dup: { google: dupSummary(scopeG, dupG), icloud: dupSummary(scopeA, dupA) },
      phashNeeded: googlePhashNeeded(dupG.pendingIds, result.pairs, new Set(google.filter((g) => g.phash).map((g) => g.id))),
      icloudPhashNeeded: icloudPhashNeeded(result.pairs, dupA.pendingIds, icloudById),
      googleFileNeeded: googleFileNeeded(result.pairs),
      videoFileNeeded: videoFileNeeded(result.pairs, result.soGoogle),
      recorteNeeded: candidatosRecorte(result.soIcloud, result.soGoogle),
      edicaoNeeded: candidatosEdicao(result.pairs),
      icloudPhashWanted: wanted.length,
      icloudThumbKeep: keep.length,
      phashProgress: phashProgress ? { ...phashProgress.value, at: phashProgress.at } : null,
      counts: { google: google.length, icloud: icloud.length, ocultas, marcadasOcultas: icloudTodo.filter((x) => x.hidden).length },
      rows,
      versao,
      calculo: CALCULO_VERSAO,
      lidoEm,
      calculadoEm: Date.now(),
    };
    // contagem do inventário refeita do zero e datas do iCloud em ordem (para achar uma foto na grade)
    await setInventorySummary({ google: summarize(google), icloud: summarize(icloudTodo) }, versao);
    await setMeta('icloudTs', icloud.map((x) => x.ts).sort((x, y) => x - y));
    self.postMessage(out);
    // guarda depois de entregar: o painel não espera a gravação
    await putCache('cruzamento', out);
    await registrarDecisoes({}, lidoEm);
    etapa('fim');
  } catch (err) {
    self.postMessage({ ok: false, reason: String(err.message || err) });
  }
};
