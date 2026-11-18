// Envio contínuo do que é novo (0.7): no lugar do backup automático do
// celular. Com o painel aberto, a cada CICLO_MS o Geyma lê as novidades do
// Google (só as páginas mais recentes do catálogo), recarrega a aba do iCloud
// (o próprio site traz as fotos recentes), refaz o cruzamento e envia, em
// lote, o que foi capturado a partir da data escolhida e está num serviço só.
// Vale a mesma regra de sempre: só vai o que está Pessoal ou Manter (pela
// marcação ou pela sugestão), sem repetidas, ocultas nem vídeos sem arquivo.
import { podeEnviar } from './envio.js';

export const CICLO_MS = 6 * 60 * 60 * 1000;
const DIA = 24 * 60 * 60 * 1000;

/** Configuração inicial: desligado, nos dois sentidos, a partir de hoje. */
export const continuoPadrao = (agora = Date.now()) => ({ ativo: false, google: true, icloud: true, desde: inicioDoDia(agora), ultimoCiclo: 0, ultimo: null });

/** Meia-noite (UTC) do dia de ts: as datas de captura são guardadas em UTC. */
export const inicioDoDia = (ts) => Math.floor(ts / DIA) * DIA;

/** Já está na hora de um ciclo? */
export const cicloDevido = (cfg, agora = Date.now()) => Boolean(cfg?.ativo) && agora - (cfg.ultimoCiclo || 0) >= CICLO_MS;

/** Até onde ler o catálogo do Google: um dia antes da data escolhida, de folga. */
export const googleAte = (cfg) => (cfg?.desde || 0) - DIA;

/**
 * O que o ciclo enviaria: itens novos (captura a partir de cfg.desde) que só
 * estão num serviço, podem ir e ainda não foram. Do mais antigo ao mais novo.
 * @returns {{google: object[], icloud: object[]}} linhas por destino
 */
export function filaContinua(rows, cfg, envio = {}) {
  const out = { google: [], icloud: [] };
  if (!cfg) return out;
  const jaFoi = (it) => ['enviado', 'chegou'].includes(envio?.[it?.id]?.estado);
  for (const r of rows) {
    if (!(r.ts >= cfg.desde)) continue;
    if (cfg.google && r.cls === 'soIcloud' && !jaFoi(r.a) && podeEnviar(r, 'google').ok) out.google.push(r);
    if (cfg.icloud && r.cls === 'soGoogle' && !jaFoi(r.g) && podeEnviar(r, 'icloud').ok) out.icloud.push(r);
  }
  for (const k of ['google', 'icloud']) out[k].sort((x, y) => x.ts - y.ts);
  return out;
}

/**
 * A listagem do Google vem da captura mais recente para a mais antiga: a
 * leitura das novidades para na primeira página toda anterior a `ate`.
 */
export const paginaAntiga = (tsDaPagina, ate) => Boolean(ate) && tsDaPagina.length > 0 && Math.max(...tsDaPagina) < ate;
