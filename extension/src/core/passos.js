// "O que fazer agora": os próximos passos que dependem do usuário, em ordem,
// com quantos itens cada um envolve. Só lista; quem executa é o painel.
import { effectiveDecision } from './plan.js';

const DIA = 24 * 60 * 60 * 1000;

/**
 * @param d dados do cruzamento ({rows, phashNeeded, googleFileNeeded, icloudPhashNeeded, icloudPhashWanted})
 * @param extra {icloudConcluidoEm?: number, agora?: number, ocupado?: {google?: boolean}}
 * @returns {{id: string, n: number, texto: string}[]}
 */
export function proximosPassos(d, { icloudConcluidoEm = null, agora = Date.now(), ocupado = {} } = {}) {
  const passos = [];
  const add = (id, n, texto) => { if (n > 0) passos.push({ id, n, texto }); };
  if (!ocupado.google) add('conferirGoogle', d.phashNeeded?.length || 0, 'fotos do Google precisam ser comparadas pelas miniaturas (o Geyma faz sozinho; leva alguns minutos)');
  add('conferirIcloud', d.icloudPhashNeeded?.length || 0, 'fotos do iCloud podem desempatar pares pelas miniaturas guardadas');
  add('arquivosGoogle', d.googleFileNeeded?.length || 0, 'arquivos do Google para conferir o formato (só o cabeçalho, nada é baixado)');
  const rows = d.rows || [];
  add('responderPares', rows.filter((r) => r.ident === 'incerta').length, 'pares para você responder "São a mesma foto?" (atalhos M e D; passa sozinho para o próximo)');
  if (!icloudConcluidoEm) add('percorrerIcloud', 1, 'o iCloud ainda não foi percorrido inteiro');
  else if (agora - icloudConcluidoEm > 30 * DIA) add('percorrerIcloud', 1, 'o último percurso completo do iCloud tem mais de 30 dias');
  else add('percorrerIcloud', d.icloudPhashWanted || 0, 'fotos do iCloud esperam o próximo percurso para serem comparadas');
  add('revisarPendentes', rows.filter((r) => !r.dup && !r.dupIcloud && !r.decision && effectiveDecision(r) === 'pendente').length, 'fotos sugeridas como Pendente esperam a sua revisão (em lote, por categoria)');
  return passos;
}
