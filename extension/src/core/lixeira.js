// Sanitização (0.8): o que pode ir para a lixeira de cada serviço. Só itens
// que você marcou Descartar (a sugestão nunca basta). Cópias repetidas só
// quando a cópia que fica continua lá. Nada é apagado de vez: vai para a
// lixeira do serviço (quarentena: 60 dias no Google, 30 no iCloud).
// Google: pelo próprio botão "Mover para a lixeira" da página da foto, com a
// confirmação do site (src/page/envio.js). iCloud: o Geyma não apaga (só lê o
// iCloud de forma passiva); dá a lista para apagar no app Fotos e confere no
// próximo percurso o que saiu.

export const LADOS = { google: 'Google Fotos', icloud: 'iCloud' };

/**
 * Pode ir para a lixeira daquele lado?
 * @returns {{ok: boolean, motivo: string}} motivo: por que vai, ou por que não
 */
export function podeIrParaLixeira(r, lado) {
  const it = lado === 'google' ? r?.g : r?.a;
  if (!it?.id) return { ok: false, motivo: `não está no ${LADOS[lado] || '?'}` };
  if (r.decision !== 'descartar') return { ok: false, motivo: 'só vai o que você marcou Descartar' };
  const copia = lado === 'google' ? r.dup : r.dupIcloud;
  const fica = lado === 'google' ? r.dupOf : r.dupOfIcloud;
  if (copia) {
    if (!fica?.id || fica.id === it.id) return { ok: false, motivo: 'a cópia que fica não foi encontrada' };
    return { ok: true, motivo: 'cópia repetida (a melhor fica)' };
  }
  return { ok: true, motivo: 'marcada Descartar' };
}

/**
 * Listas por lado, sem o que já foi para a lixeira.
 * @param registro meta 'lixeira': {id: {estado, at, lado}}
 * @returns {{google: object[], icloud: object[]}} {id, ts, nome, key, motivo, bytes}
 */
export function listaLixeira(rows, registro = {}) {
  const out = { google: [], icloud: [] };
  for (const r of rows) {
    for (const lado of ['google', 'icloud']) {
      const p = podeIrParaLixeira(r, lado);
      if (!p.ok) continue;
      const it = lado === 'google' ? r.g : r.a;
      if (registro[it.id]?.estado === 'na-lixeira') continue;
      out[lado].push({ id: it.id, ts: r.ts, nome: it.name || it.fileV?.nome || it.file?.nome || '', key: it.key || null, motivo: p.motivo, bytes: it.size || it.fileV?.bytes || it.file?.bytes || 0, video: Boolean(it.video) });
    }
  }
  for (const l of Object.values(out)) l.sort((x, y) => x.ts - y.ts);
  return out;
}

/** Registra o resultado de um item no registro da lixeira (sem alterar o original). */
export function registrarLixeira(registro, id, lado, res, agora = Date.now()) {
  const estado = res?.ok ? (res.ensaio ? 'ensaio' : 'na-lixeira') : 'falhou';
  return { ...registro, [id]: { estado, lado, at: agora, ...(res?.erro ? { erro: res.erro } : {}) } };
}

/** Resumo do registro: quantos foram para a lixeira (e quantos o inventário já não vê). */
export function resumoLixeira(registro = {}, presentes = null) {
  const out = { google: 0, icloud: 0, falhas: 0, sumiram: 0 };
  for (const [id, x] of Object.entries(registro)) {
    if (x.estado === 'falhou') out.falhas++;
    if (x.estado !== 'na-lixeira') continue;
    out[x.lado]++;
    if (presentes && !presentes.has(id)) out.sumiram++;
  }
  return out;
}

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const quando = (ts) => new Date(ts).toISOString().replace('T', ' ').slice(0, 19);

/** Lista do iCloud para apagar no app Fotos: data (UTC), nome, tamanho e motivo. */
export function csvLixeiraIcloud(lista) {
  const linhas = [['captura (UTC)', 'arquivo', 'MB', 'tipo', 'motivo'].map(csv).join(',')];
  for (const x of lista) linhas.push([quando(x.ts), x.nome, (x.bytes / 1048576).toFixed(1), x.video ? 'vídeo' : 'foto', x.motivo].map(csv).join(','));
  return linhas.join('\r\n');
}
