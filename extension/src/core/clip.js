// Classificação pela imagem com o CLIP (etapa 0.6), para o que as regras
// baratas deixam como indefinido e para achar documentos, capturas de tela e
// propagandas entre fotos que as regras dão como pessoais.
//
// O modelo de imagem roda no notebook, num worker do painel (src/clip-worker.js),
// com o ONNX Runtime embutido na extensão. Só os pesos do modelo vêm da
// internet, uma vez, de uma revisão fixa conferida pelo SHA-256; nenhuma foto
// sai do notebook. As frases de cada categoria já vêm representadas pelo lado
// de texto do CLIP (assets/clip-textos.json, gerado por ferramentas/clip-textos.mjs).
//
// Aqui fica só o que é cálculo puro: preparo dos pixels, probabilidades por
// categoria, combinação com as regras e a fila de fotos a classificar.

export const MODELO = {
  nome: 'Xenova/clip-vit-base-patch32',
  revisao: '6b7c523703ae26e39be4b03774966f8571c7f523',
  arquivo: 'onnx/vision_model_quantized.onnx',
  bytes: 89117001,
  sha256: '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
};
export const urlDoModelo = (m = MODELO) => `https://huggingface.co/${m.nome}/resolve/${m.revisao}/${m.arquivo}`;

/** Versão da classificação gravada nos itens: subir quando o modelo, as frases ou o preparo mudarem. */
export const CLIP_VERSAO = 1;
export const LADO = 224;
const MEDIA = [0.48145466, 0.4578275, 0.40821073];
const DESVIO = [0.26862954, 0.26130258, 0.27577711];
// escala de temperatura aprendida pelo CLIP (logit_scale = ln 100)
const ESCALA = 100;

// ordem fixa das probabilidades gravadas no item
export const CATS_CLIP = ['pessoal', 'print', 'documento', 'propaganda', 'internet'];

/**
 * Redução e recorte do CLIP: o lado menor vai a 224 e o centro é recortado
 * em 224×224. Devolve o tamanho reduzido e o deslocamento do recorte.
 */
export function recorteCentral(w, h, lado = LADO) {
  const f = lado / Math.min(w, h);
  const rw = Math.max(lado, Math.round(w * f));
  const rh = Math.max(lado, Math.round(h * f));
  return { rw, rh, x: Math.floor((rw - lado) / 2), y: Math.floor((rh - lado) / 2) };
}

/** Pixels RGBA (n = lado×lado) → tensor [1,3,lado,lado] normalizado, canal por canal. */
export function pixelsParaTensor(rgba, n = LADO * LADO) {
  const t = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) t[c * n + i] = (rgba[i * 4 + c] / 255 - MEDIA[c]) / DESVIO[c];
  }
  return t;
}

/**
 * Probabilidades por categoria: semelhança da imagem com cada frase, softmax
 * sobre todas as frases e soma por categoria. frases = [{cat, texto, v}].
 * Devolve {cat, p, frase, probs: [por CATS_CLIP]}.
 */
export function classificarEmbed(emb, frases) {
  let norma = 0;
  for (let i = 0; i < emb.length; i++) norma += emb[i] * emb[i];
  norma = Math.sqrt(norma) || 1;
  const logits = frases.map(({ v }) => {
    let s = 0;
    for (let i = 0; i < v.length; i++) s += v[i] * emb[i];
    return (ESCALA * s) / norma;
  });
  const max = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - max));
  const soma = ex.reduce((x, y) => x + y, 0);
  const probs = Object.fromEntries(CATS_CLIP.map((c) => [c, 0]));
  ex.forEach((e, i) => { probs[frases[i].cat] += e / soma; });
  const cat = CATS_CLIP.reduce((a, b) => (probs[b] > probs[a] ? b : a));
  // a frase mais parecida dentro da categoria vencedora (explica a escolha)
  let melhor = -1;
  ex.forEach((e, i) => { if (frases[i].cat === cat && (melhor < 0 || e > ex[melhor])) melhor = i; });
  return { cat, p: probs[cat], frase: frases[melhor].texto, probs: CATS_CLIP.map((c) => Math.round(probs[c] * 1000) / 1000) };
}

/** O que fica gravado no item: compacto (sem a representação de 512 números). */
export const registroClip = (r) => ({ v: CLIP_VERSAO, cat: r.cat, p: Math.round(r.p * 1000) / 1000, frase: r.frase, probs: r.probs });

// Limiares: uma categoria indefinida passa a ser a da imagem com LIMIAR; uma
// regra que já dava categoria só é corrigida pela imagem com LIMIAR_FORTE.
export const LIMIAR = 0.6;
export const LIMIAR_FORTE = 0.7;

const NOMES = { pessoal: 'foto pessoal', print: 'captura de tela', documento: 'documento', propaganda: 'propaganda', internet: 'imagem da internet' };
const porImagem = (c) => `pela imagem: parece ${NOMES[c.cat]} (${Math.round(c.p * 100)}%)`;

/**
 * Combina a categoria das regras com a da imagem. As regras fortes (marca da
 * Apple, nome de captura de tela, app de digitalizar) continuam valendo; a
 * imagem decide o indefinido e tira das "pessoais" o que é claramente
 * documento, captura de tela, propaganda ou imagem da internet, que então
 * ficam Pendentes para o usuário decidir.
 */
export function comImagem(regra, clip) {
  if (!clip || clip.v !== CLIP_VERSAO) return regra;
  const motivo = porImagem(clip);
  if (regra.cat === 'indefinido') {
    return clip.p >= LIMIAR ? { cat: clip.cat, reasons: [motivo] } : { cat: 'indefinido', reasons: [`pela imagem: incerta (${NOMES[clip.cat]}, ${Math.round(clip.p * 100)}%)`] };
  }
  if (regra.cat === 'pessoal') {
    if (clip.cat !== 'pessoal' && clip.p >= LIMIAR_FORTE) return { cat: clip.cat, reasons: [motivo, `as regras diziam: ${regra.reasons.join('; ')}`] };
    return regra;
  }
  // recebida ou salva da internet que, pela imagem, é documento ou propaganda
  if ((regra.cat === 'recebida' || regra.cat === 'internet') && (clip.cat === 'documento' || clip.cat === 'propaganda') && clip.p >= LIMIAR_FORTE) {
    return { cat: clip.cat, reasons: [motivo, ...regra.reasons] };
  }
  return regra;
}

/**
 * Fila de fotos a classificar pela imagem: só fotos (vídeos ficam para a 0.9),
 * sem classificação da versão atual, as indefinidas primeiro. Cada linha
 * informa qual imagem usar: a miniatura do Google quando há, senão a do iCloud.
 */
export function filaDoClip(rows) {
  const fila = [];
  for (const r of rows) {
    if (r.clipV === CLIP_VERSAO || r.a?.video || r.g?.video) continue;
    if (r.cls === 'dupGoogle' || r.cls === 'dupIcloud') continue;
    const fonte = r.g?.thumb ? { lado: 'g', id: r.g.id, base: r.g.thumb } : r.a ? { lado: 'a', id: r.a.id, thumb: r.a.thumb || null, thumbAt: r.a.thumbAt || 0 } : null;
    if (fonte) fila.push({ prioridade: r.cat === 'indefinido' ? 0 : 1, ...fonte });
  }
  return fila.sort((x, y) => x.prioridade - y.prioridade);
}

/** URL da miniatura do Google já no recorte do CLIP (o Google reduz e recorta o centro). */
export const googleParaClip = (base) => `${base}=w${LADO}-h${LADO}-c`;
