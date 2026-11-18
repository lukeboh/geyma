// "O que fazer agora": os próximos passos que dependem do usuário, em ordem,
// com quantos itens cada um envolve. Só lista; quem executa é o painel.
import { effectiveDecision } from './plan.js';
import { podeEnviar } from './envio.js';

const DIA = 24 * 60 * 60 * 1000;

/**
 * @param d dados do cruzamento ({rows, phashNeeded, googleFileNeeded, videoFileNeeded, icloudPhashNeeded, icloudPhashWanted});
 *   com d.tipo ('foto' | 'video', a vista da chave Fotos | Vídeos), só os passos daquele tipo
 * @param extra {icloudConcluidoEm?: number, agora?: number, ocupado?: {google?: boolean}, envio?: object}
 *   envio: estado dos envios (meta 'envio'), para não contar o que já foi
 * @returns {{id: string, n: number, texto: string}[]}
 */
export function proximosPassos(d, { icloudConcluidoEm = null, agora = Date.now(), ocupado = {}, envio = {} } = {}) {
  const passos = [];
  const add = (id, n, texto) => { if (n > 0) passos.push({ id, n, texto }); };
  const video = d.tipo === 'video';
  const foto = d.tipo === 'foto';
  // palavra e concordância do tipo em vista (fotos: feminino; vídeos e itens: masculino)
  const N = video ? 'vídeos' : foto ? 'fotos' : 'itens';
  const o = foto ? 'as' : 'os';
  if (!video) {
    if (!ocupado.google) add('conferirGoogle', d.phashNeeded?.length || 0, 'fotos do Google precisam ser comparadas pelas miniaturas (o Geyma faz sozinho; leva alguns minutos)');
    add('conferirIcloud', d.icloudPhashNeeded?.length || 0, 'fotos do iCloud podem desempatar pares pela miniatura (melhor logo depois de um percurso, enquanto os links valem)');
    add('arquivosGoogle', d.googleFileNeeded?.length || 0, 'arquivos do Google para conferir o formato e se foram recomprimidos (só o cabeçalho, nada é baixado)');
  }
  if (!foto) add('arquivosVideo', d.videoFileNeeded?.length || 0, 'arquivos de vídeo do Google para conferir se são o original, recomprimidos ou cortados (só o cabeçalho, nada é baixado)');
  const rows = d.rows || [];
  add('responderPares', rows.filter((r) => r.ident === 'incerta').length, `pares para você responder "${video ? 'É o mesmo vídeo?' : 'São a mesma foto?'}" (atalhos M e D; passa sozinho para o próximo)`);
  if (!icloudConcluidoEm) add('percorrerIcloud', 1, 'o iCloud ainda não foi percorrido inteiro');
  else if (agora - icloudConcluidoEm > 30 * DIA) add('percorrerIcloud', 1, 'o último percurso completo do iCloud tem mais de 30 dias');
  else if (!video) add('percorrerIcloud', d.icloudPhashWanted || 0, 'fotos do iCloud esperam o próximo percurso para serem comparadas');
  // fotos que só estão num serviço e podem ir para o outro (envio pelo site)
  const jaFoi = (it) => ['enviado', 'chegou'].includes(envio?.[it?.id]?.estado);
  const podemIr = rows.filter((r) => (r.cls === 'soIcloud' && podeEnviar(r, 'google').ok && !jaFoi(r.a)) || (r.cls === 'soGoogle' && podeEnviar(r, 'icloud').ok && !jaFoi(r.g))).length;
  const algumEnvio = Object.values(envio || {}).some((e) => ['enviado', 'chegou'].includes(e.estado));
  add('enviar', podemIr, algumEnvio
    ? `${N} só num serviço podem ir para o outro (pela revisão, em lotes)`
    : `${N} só num serviço podem ir para o outro: comece pelo piloto de ${video ? 'um vídeo' : 'uma foto'} (abra, clique Enviar e confira no destino)`);
  add('revisarPendentes', rows.filter((r) => !r.dup && !r.dupIcloud && !r.decision && effectiveDecision(r) === 'pendente').length, `${N} sugerid${o} como Pendente esperam a sua revisão (em lote, por categoria)`);
  return passos;
}
