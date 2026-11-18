// Melhor cópia de cada foto que está nos dois serviços (etapa 0.5). Usa o que
// o inventário já tem, sem baixar nada:
// - resolução: dimensões iguais ou "cópia reduzida" (um dos lados menor);
// - formato: a ficha do arquivo do Google diz se ele guarda o original (HEIC
//   do iPhone) ou uma cópia convertida (JPEG de exportação: recomprimida);
// - recompressão: mesmo formato e dimensões, mas o arquivo do Google bem
//   menor (provada por amostragem pelas tabelas de quantização);
// - movimento: Live Photo no iCloud e, no Google, foto com ou sem o movimento.
// A versão editada no iPhone não conta como perda: é a mesma foto com outra
// escolha (o original continua no iCloud).

export const MOTIVOS = {
  googleMenor: 'o Google guarda uma cópia menor',
  googleConvertida: 'o Google guarda uma cópia convertida (outro formato, recomprimida)',
  googleRecomprimida: 'o Google guarda uma cópia recomprimida (mesmo formato e tamanho, arquivo bem menor)',
  googleSemMovimento: 'o Google guarda só a foto parada (sem o movimento da Live Photo)',
  icloudMenor: 'o iCloud guarda uma cópia menor',
  googleRecortada: 'o Google guarda a foto recortada (o iCloud tem a imagem inteira)',
  icloudRecortada: 'o iCloud guarda a foto recortada (o Google tem a imagem inteira)',
  icloudSemMovimento: 'só o Google tem o movimento',
  googleAparado: 'o Google guarda o vídeo mais curto (cortado)',
};

/**
 * @param r linha do cruzamento ({cls, menor, copiaGoogle, a:{live, video}, g:{extrasLidos, motionMs}})
 * @returns {{lado: 'icloud'|'google'|'misto'|'iguais', icloud: string[], google: string[]}|null}
 *   lado: quem tem a melhor cópia; icloud/google: as vantagens de cada lado (chaves de MOTIVOS)
 */
export function melhorCopia(r) {
  if (!r?.a || !r?.g) return null;
  const icloud = [];
  const google = [];
  if (r.cls === 'reduzida' && r.menor === 'google') icloud.push('googleMenor');
  if (r.cls === 'reduzida' && r.menor === 'icloud') google.push('icloudMenor');
  if (r.copiaGoogle === 'convertida') icloud.push('googleConvertida');
  if (r.copiaGoogle === 'recomprimida') icloud.push('googleRecomprimida');
  // vídeos (video.js): ficha do arquivo de vídeo do Google
  if (r.copiaGoogle === 'reduzida' && r.cls !== 'reduzida') icloud.push('googleMenor');
  if (r.copiaGoogle === 'aparada') icloud.push('googleAparado');
  if (r.recorte === 'google') icloud.push('googleRecortada');
  if (r.recorte === 'icloud') google.push('icloudRecortada');
  if (!r.a.video && r.g.extrasLidos) {
    if (r.a.live && !r.g.motionMs) icloud.push('googleSemMovimento');
    if (!r.a.live && r.g.motionMs) google.push('icloudSemMovimento');
  }
  const lado = icloud.length && google.length ? 'misto' : icloud.length ? 'icloud' : google.length ? 'google' : 'iguais';
  return { lado, icloud, google };
}

/** Totais para o painel: quantos pares têm a melhor cópia em cada lado, por motivo. */
export function resumoQualidade(rows) {
  const out = { pares: 0, iguais: 0, icloud: 0, google: 0, misto: 0, motivos: Object.fromEntries(Object.keys(MOTIVOS).map((k) => [k, 0])) };
  for (const r of rows) {
    const m = r.melhor || melhorCopia(r);
    if (!m) continue;
    out.pares++;
    out[m.lado]++;
    for (const k of [...m.icloud, ...m.google]) out.motivos[k]++;
  }
  return out;
}

/** Texto curto para a etiqueta da lista. */
export function etiquetaQualidade(m) {
  if (!m || m.lado === 'iguais') return null;
  if (m.lado === 'misto') return 'cada lado tem uma vantagem';
  return m.lado === 'icloud' ? 'melhor cópia no iCloud' : 'melhor cópia no Google';
}

/** Explicação (passar o mouse): as vantagens de cada lado. */
export function porqueQualidade(m) {
  if (!m) return '';
  return [...m.icloud, ...m.google].map((k) => MOTIVOS[k]).join('; ');
}
