// Recorte e edição pela comparação de miniaturas (etapa 0.5).
//
// Recorte: uma das cópias é um pedaço da outra (corte feito num app, ou na
// exportação). As duas não viram par no cruzamento, porque as proporções
// diferem; ficam "só no iCloud" e "só no Google" no mesmo segundo. Aqui se
// procura a menor dentro da maior, em várias escalas e posições, pela
// correlação das miniaturas em tons de cinza.
//
// Edição: as duas cópias têm a mesma estrutura, pixel a pixel, mas outro tom
// (filtro, luz, cor). A correlação depois de normalizar o brilho e o
// contraste de cada uma fica muito alta, mesmo com o pHash só "parecido".
//
// Só cálculo puro; as miniaturas são lidas no painel (protection.js).

/** RGBA → tons de cinza (Float32Array), pesos do olho humano. */
export function cinza(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = 0.299 * rgba[4 * i] + 0.587 * rgba[4 * i + 1] + 0.114 * rgba[4 * i + 2];
  return out;
}

/** Redução por média de área (img {px, w, h} → nw × nh). */
export function reduzir(img, nw, nh) {
  const out = new Float32Array(nw * nh);
  const fx = img.w / nw;
  const fy = img.h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let s = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) s += img.px[yy * img.w + xx];
      out[y * nw + x] = s / ((y1 - y0) * (x1 - x0));
    }
  }
  return { px: out, w: nw, h: nh };
}

/** Média e desvio de um vetor. */
function estat(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  const m = s / v.length;
  let q = 0;
  for (let i = 0; i < v.length; i++) q += (v[i] - m) ** 2;
  return { m, d: Math.sqrt(q / v.length) || 1 };
}

/**
 * Correlação normalizada entre a imagem p (pw × ph) e a janela de g com canto
 * em (ox, oy). 1 = mesma imagem a menos de brilho e contraste.
 */
function nccJanela(g, p, ps, ox, oy) {
  let sg = 0;
  let sgg = 0;
  let sgp = 0;
  const n = p.w * p.h;
  for (let y = 0; y < p.h; y++) {
    const lg = (oy + y) * g.w + ox;
    const lp = y * p.w;
    for (let x = 0; x < p.w; x++) {
      const vg = g.px[lg + x];
      sg += vg;
      sgg += vg * vg;
      sgp += vg * (p.px[lp + x] - ps.m);
    }
  }
  const mg = sg / n;
  const dg = Math.sqrt(Math.max(sgg / n - mg * mg, 1e-6));
  return sgp / n / (dg * ps.d);
}

/** Correlação normalizada entre duas imagens do mesmo tamanho. */
export function ncc(a, b) {
  return nccJanela(a, b, estat(b.px), 0, 0);
}

/** Melhor janela para uma largura rw (todas as posições, ou só perto de (cx, cy) com raio r). */
function melhorNaLargura(grande, pequena, rw, perto) {
  const rh = Math.round((rw * pequena.h) / pequena.w);
  if (rw < 12 || rh < 12 || rh > grande.h || rw > grande.w) return null;
  // a janela inteira não é recorte (seria a mesma proporção)
  if (rw === grande.w && rh === grande.h) return null;
  const p = reduzir(pequena, rw, rh);
  const ps = estat(p.px);
  const [x0, x1, y0, y1] = perto
    ? [Math.max(0, perto.x - perto.r), Math.min(grande.w - rw, perto.x + perto.r), Math.max(0, perto.y - perto.r), Math.min(grande.h - rh, perto.y + perto.r)]
    : [0, grande.w - rw, 0, grande.h - rh];
  let melhor = null;
  for (let oy = y0; oy <= y1; oy++) {
    for (let ox = x0; ox <= x1; ox++) {
      const r = nccJanela(grande, p, ps, ox, oy);
      if (!melhor || r > melhor.ncc) melhor = { ncc: r, x: ox, y: oy, w: rw, h: rh };
    }
  }
  return melhor;
}

/**
 * Procura a imagem pequena dentro da grande. Ambas {px, w, h} em tons de
 * cinza, com o lado maior por volta de 128 px. Busca grossa na metade do
 * tamanho (todas as larguras e posições) e refino no tamanho cheio, perto da
 * melhor. Devolve a janela {x, y, w, h} em frações da grande e a
 * correlação, ou null. minFrac: a menor largura tentada (fração da grande).
 */
export function acharDentro(grande, pequena, { minFrac = 0.3, passos = 14 } = {}) {
  const meia = (img) => reduzir(img, Math.max(1, Math.round(img.w / 2)), Math.max(1, Math.round(img.h / 2)));
  const g2 = meia(grande);
  const p2 = meia(pequena);
  let grossa = null;
  for (let k = 0; k <= passos; k++) {
    const m = melhorNaLargura(g2, p2, Math.round(g2.w * (minFrac + ((1 - minFrac) * k) / passos)), null);
    if (m && (!grossa || m.ncc > grossa.ncc)) grossa = m;
  }
  if (!grossa) return null;
  // refino: larguras vizinhas, pixel a pixel, posições a até 3 px
  const passo = Math.ceil((grande.w * (1 - minFrac)) / passos);
  let melhor = null;
  for (let rw = 2 * grossa.w - passo; rw <= 2 * grossa.w + passo; rw++) {
    const m = melhorNaLargura(grande, pequena, rw, { x: 2 * grossa.x, y: 2 * grossa.y, r: 3 });
    if (m && (!melhor || m.ncc > melhor.ncc)) melhor = m;
  }
  melhor ??= { ...grossa, x: 2 * grossa.x, y: 2 * grossa.y, w: 2 * grossa.w, h: 2 * grossa.h };
  const { ncc: c, x, y, w, h } = melhor;
  return { ncc: Math.round(c * 1000) / 1000, x: x / grande.w, y: y / grande.h, w: w / grande.w, h: h / grande.h };
}

// Medido em 18/11/2026 nos 18 candidatos da biblioteca real, conferidos a
// olho: recortes de 0,83 a 0,99 (8 de 9 acima de 0,85); fotos diferentes do
// mesmo segundo até 0,79.
export const RECORTE_MIN = 0.85;

/**
 * Uma das duas é recorte da outra? a = iCloud, g = Google, cada uma
 * {px, w, h} em tons de cinza com o lado maior por volta de 128 px.
 * pixels: {a, g} = largura × altura dos arquivos, para desempatar quando a
 * diferença é pequena e as duas buscas acham (a cortada tem menos pixels).
 * Devolve {cortada: 'google'|'icloud', caixa, ncc} ou null.
 */
export function recorteEntre(a, g, pixels = null) {
  const gDentroDeA = acharDentro(a, g);
  const aDentroDeG = acharDentro(g, a);
  const okG = Boolean(gDentroDeA) && gDentroDeA.ncc >= RECORTE_MIN;
  const okA = Boolean(aDentroDeG) && aDentroDeG.ncc >= RECORTE_MIN;
  if (!okG && !okA) return null;
  let cortada;
  if (okG && okA && pixels?.a && pixels?.g) cortada = pixels.g < pixels.a ? 'google' : 'icloud';
  else if (okG && okA) cortada = gDentroDeA.ncc >= aDentroDeG.ncc ? 'google' : 'icloud';
  else cortada = okG ? 'google' : 'icloud';
  const best = { cortada, ...(cortada === 'google' ? gDentroDeA : aDentroDeG) };
  const { ncc: c, x, y, w, h } = best;
  return { cortada, ncc: c, caixa: { x: +x.toFixed(3), y: +y.toFixed(3), w: +w.toFixed(3), h: +h.toFixed(3) } };
}

// Edição: correlação das miniaturas inteiras (mesmo tamanho). Medido em
// 18/11/2026: fotos editadas no iPhone × o original, 5 de 8 entre 0,96 e
// 1,00 (as outras, edições pesadas, de 0,61 a 0,93); fotos em sequência no
// mesmo segundo, até 0,93 em 16 pares.
export const EDICAO_MIN = 0.95;
// Imagem quase lisa (foto no escuro, parede): a correlação mede ruído e não
// diz nada. Desvio mínimo dos tons de cinza (0 a 255) nas duas miniaturas.
export const CONTRASTE_MIN = 12;

/** As duas miniaturas (mesmo tamanho) são a mesma imagem com outro tom? {ncc} ou null. */
export function edicaoEntre(a, g) {
  if (a.w !== g.w || a.h !== g.h) return null;
  if (estat(a.px).d < CONTRASTE_MIN || estat(g.px).d < CONTRASTE_MIN) return null;
  const c = ncc(a, g);
  return c >= EDICAO_MIN ? { ncc: Math.round(c * 1000) / 1000 } : null;
}

/**
 * Pares só parecidos (mesmo instante e dimensões, pHash entre "igual" e
 * "diferente") que a comparação das miniaturas pode explicar como edição.
 */
export function candidatosEdicao(pairs) {
  const out = [];
  for (const p of pairs) {
    // vídeos ficam para a 0.9 (a miniatura do Google vem com o ícone de reprodução)
    if (!p.parecida || !p.g.thumb || p.a.video || p.g.video || p.a.edicao || p.a.semEdicao?.includes(p.g.id)) continue;
    out.push({ aId: p.a.id, gId: p.g.id, gThumb: p.g.thumb, aThumb: p.a.thumb || null, aThumbAt: p.a.thumbAt || 0 });
  }
  return out;
}

const proporcao = (w, h) => Math.max(w, h) / Math.min(w, h);

/**
 * Candidatos a recorte: foto só do iCloud e foto só do Google no mesmo
 * segundo, com proporções diferentes (se fossem iguais, o cruzamento já as
 * teria comparado). Ficam de fora os pares já conferidos (semRecorte), os
 * que o usuário disse serem diferentes e as fotos que já têm recorte achado.
 */
export function candidatosRecorte(soIcloud, soGoogle) {
  const porSeg = new Map();
  for (const g of soGoogle) {
    if (g.video || !g.thumb || !g.w || !g.h) continue;
    const k = Math.floor(g.ts / 1000);
    let l = porSeg.get(k);
    if (!l) porSeg.set(k, (l = []));
    l.push(g);
  }
  const out = [];
  for (const a of soIcloud) {
    if (a.video || a.recorte || !a.w || !a.h) continue;
    const k = Math.floor(a.ts / 1000);
    for (const g of [...(porSeg.get(k - 1) || []), ...(porSeg.get(k) || []), ...(porSeg.get(k + 1) || [])]) {
      if (Math.abs(g.ts - a.ts) >= 1000 || a.semRecorte?.includes(g.id) || a.diferenteDe?.includes(g.id)) continue;
      if (Math.abs(proporcao(a.w, a.h) - proporcao(g.w, g.h)) < 0.02) continue;
      out.push({ aId: a.id, gId: g.id, gThumb: g.thumb, aThumb: a.thumb || null, aThumbAt: a.thumbAt || 0, pixA: a.w * a.h, pixG: g.w * g.h });
    }
  }
  return out;
}

/** Tamanho da miniatura para a busca: lado maior = lado, mantendo a proporção. */
export function tamanhoPara(w, h, lado = 128) {
  const f = lado / Math.max(w, h);
  return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
}
