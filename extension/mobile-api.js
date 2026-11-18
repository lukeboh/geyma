// API interna para a versão do celular. O servidor local (mobile/servidor.mjs)
// chama estas funções pela porta de depuração do Chrome de automação; a
// extensão continua sendo a única fonte de verdade (inventário, cruzamento,
// marcações). Nada aqui altera os serviços: marcar só grava a decisão.
import { getData, whenComputed, decideRows, recomputeAndWait, isBusy, calcProgress } from './protection.js';
import { filterRows, decisionCounts } from './src/core/review.js';
import { sendPlan } from './src/core/plan.js';
import { CLASSES } from './src/core/match.js';
import { CATEGORIES, DECISIONS, suggestDecision } from './src/core/classify.js';
import { getMeta, getThumb } from './src/core/db.js';
import { googleGrande, icloudGrande, icloudOriginal, linkAtual, linkOriginal, temOriginal } from './src/core/viewer-src.js';

const THUMB_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(usercontent\.google\.com|googleusercontent\.com|icloud-content\.com)\//;

let indexed = null;
let index = new Map();
function rowIndex(data) {
  if (indexed !== data) {
    index = new Map();
    for (const r of data.rows) for (const id of r.ids) index.set(id, r);
    indexed = data;
  }
  return index;
}

const thumbsOf = (r) => {
  const t = [];
  // full: a versão grande para o visualizador (Google pela sessão; iCloud só enquanto a URL vale)
  const dims = (it) => (it?.w && it?.h ? `${it.w}×${it.h}` : '');
  // celular: a versão média basta (a cheia de uma editada pesa megabytes)
  const media = { cheia: false };
  if (r.a?.thumb) {
    const editada = temOriginal(r.a);
    t.push({ side: editada ? 'icloud-atual' : 'icloud', url: r.a.thumb.replace('${f}', 'thumb.jpg'), id: r.a.id, full: icloudGrande(r.a, Date.now(), media), dims: dims(r.a) });
    // editada: o original ao lado (sem a miniatura guardada, que pode ser de qualquer versão)
    if (editada) t.push({ side: 'icloud-original', url: (r.a.thumbOrig || r.a.medOrig).replace('${f}', 'thumb.jpg'), id: r.a.id, versao: 'original', semGuardada: true, full: icloudOriginal(r.a), dims: dims(r.a) });
  }
  if (r.dupOfIcloud?.thumb) t.push({ side: 'icloud-fica', url: r.dupOfIcloud.thumb.replace('${f}', 'thumb.jpg'), id: r.dupOfIcloud.id, full: icloudGrande(r.dupOfIcloud, Date.now(), media), dims: dims(r.dupOfIcloud) });
  if (r.dupOf?.thumb) t.push({ side: 'google-fica', url: `${r.dupOf.thumb}=w320-h320-c`, full: googleGrande(r.dupOf.thumb, 2000), dims: dims(r.dupOf) });
  if (r.g?.thumb) t.push({ side: 'google', url: `${r.g.thumb}=w320-h320-c`, full: googleGrande(r.g.thumb, 2000), dims: dims(r.g) });
  return t;
};

const compact = (r) => ({
  ids: r.ids,
  ts: r.ts,
  cls: r.cls,
  cat: r.cat,
  why: r.why,
  decision: r.decision,
  sug: suggestDecision(r.cat),
  dup: Boolean(r.dup),
  dupIcloud: Boolean(r.dupIcloud),
  menor: r.menor || null,
  a: r.a && { name: r.a.name, w: r.a.w, h: r.a.h, size: r.a.size, video: r.a.video, live: Boolean(r.a.live) },
  g: r.g && { w: r.g.w, h: r.g.h, key: r.g.key, file: r.g.file || null, motionMs: r.g.motionMs || null, extrasLidos: Boolean(r.g.extrasLidos) },
  copiaGoogle: r.copiaGoogle || null,
  quadroDiferente: Boolean(r.quadroDiferente),
  versaoEditada: Boolean(r.versaoEditada),
  parecida: Boolean(r.parecida),
  thumbs: thumbsOf(r),
});

window.geymaApi = {
  /** Situação das leituras (não depende do cruzamento). */
  async status() {
    const [gp, ap, done, counts] = await Promise.all([getMeta('googleProgress'), getMeta('icloudProgress'), getMeta('icloudCompleted'), getMeta('icloudCounts')]);
    const data = getData();
    return {
      google: gp ? { ...gp.value, at: gp.at } : null,
      icloud: ap ? { ...ap.value, at: ap.at } : null,
      icloudCompletedAt: done?.at || null,
      appleTotal: counts?.value?.CPLAssetByAssetDateWithoutHiddenOrDeleted || null,
      inventory: data?.counts || null,
      busy: isBusy(),
      calc: calcProgress(),
      calculadoEm: data?.calculadoEm || null,
      painel: `${location.origin}/dashboard.html`,
    };
  },

  /** Resumo da proteção, das duplicatas, do plano e das categorias. */
  async summary() {
    const data = await whenComputed();
    const t = data.summary.totals;
    const both = t.ambos + t.confirmar + t.reduzida;
    const cats = {};
    for (const r of data.rows) cats[r.cat] = (cats[r.cat] || 0) + 1;
    return {
      complete: data.complete,
      until: data.until,
      totals: t,
      pctIcloudInGoogle: both / Math.max(1, both + t.soIcloud),
      pctGoogleInIcloud: both / Math.max(1, both + t.soGoogle),
      both,
      reduzidaMenor: data.summary.reduzidaMenor,
      dup: data.dup,
      plan: sendPlan(data.rows),
      categories: cats,
      decisions: decisionCounts(data.rows),
      years: Object.keys(data.summary.byYear).sort().reverse(),
      labels: { classes: CLASSES, categories: CATEGORIES, decisions: DECISIONS },
    };
  },

  /** Página da revisão. f = {cls, cat, dec, year, kind}. */
  async rows(f = {}, page = 0, size = 30) {
    const data = await whenComputed();
    const all = filterRows(data.rows, f);
    const n = Math.max(1, Math.min(120, Number(size) || 30));
    const p = Math.max(0, Number(page) || 0);
    return { total: all.length, page: p, size: n, rows: all.slice(p * n, (p + 1) * n).map(compact) };
  },

  /** Grava a marcação das linhas que contêm estes itens. decision null = volta para a sugestão. */
  async decide(ids, decision) {
    if (decision !== null && !Object.hasOwn(DECISIONS, decision)) throw new Error('marcação inválida');
    const data = await whenComputed();
    const idx = rowIndex(data);
    const rows = [...new Set(ids.map((id) => idx.get(id)).filter(Boolean))];
    await decideRows(rows, decision);
    return { marcadas: rows.length };
  },

  /** Miniatura pelo navegador (com a sessão do Google, quando precisa). Só domínios de imagem dos serviços. */
  async thumb(url, id) {
    if (!THUMB_HOSTS.test(url)) throw new Error('endereço não permitido');
    // iCloud: a miniatura guardada no notebook vale mesmo depois que a URL expira
    const saved = typeof id === 'string' && id.startsWith('a:') ? await getThumb(id).catch(() => null) : null;
    let type, b;
    if (saved) {
      type = saved.type || 'image/jpeg';
      b = new Uint8Array(await saved.arrayBuffer());
    } else {
      const res = await fetch(url, { credentials: url.includes('icloud-content.com') ? 'omit' : 'include' });
      type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) return { ok: false, status: res.status };
      b = new Uint8Array(await res.arrayBuffer());
    }
    let s = '';
    for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return { ok: true, type, b64: btoa(s) };
  },

  /** Link novo de uma foto do iCloud (a extensão rola a grade do site até ela). Devolve a URL da versão maior disponível. */
  async icloudRefresh(id, versao = 'atual') {
    if (typeof id !== 'string' || !id.startsWith('a:')) throw new Error('item inválido');
    const r = await chrome.runtime.sendMessage({ kind: 'icloud-refresh', id });
    if (!r?.ok) return { ok: false, erro: r?.erro || 'sem link novo' };
    const url = (versao === 'original' ? linkOriginal(r) : linkAtual(r, { cheia: false })) || (r.thumb || '').replace('${f}', 'thumb.jpg');
    return url ? { ok: true, url } : { ok: false, erro: 'sem link novo' };
  },

  /** Recalcula o cruzamento (por exemplo, depois de uma leitura). */
  async recompute() {
    await recomputeAndWait();
    return true;
  },
};
