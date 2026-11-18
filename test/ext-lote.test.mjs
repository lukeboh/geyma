// Envio em lote (pausa, retomada, erro) e conferência de cota.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoLote, proximoDoLote, registrarNoLote, pausarLote, pararLote, retomarLote, loteAberto, restamNoLote } from '../extension/src/core/lote.js';
import { lerCotaGoogle, lerCotaIcloud, cabeNaCota, FOLGA_MIN } from '../extension/src/core/cota.js';
import { bytesDoEnvio, espacoDasLinhas, VIDEO_BYTES_POR_S } from '../extension/src/core/plan.js';

const GB = 1024 ** 3;
const TB = 1024 ** 4;

test('lote: um por vez, para no erro e retoma no mesmo item', () => {
  let l = novoLote('google', ['a:1', 'a:2', 'a:3'], 0);
  assert.equal(proximoDoLote(l), 'a:1');
  l = registrarNoLote(l, { ok: true });
  assert.equal(proximoDoLote(l), 'a:2');
  l = registrarNoLote(l, { ok: false, erro: 'HTTP 403' });
  assert.equal(l.estado, 'erro');
  assert.equal(l.erro, 'HTTP 403');
  assert.equal(proximoDoLote(l), 'a:2');
  assert.ok(loteAberto(l));
  l = retomarLote(l);
  assert.equal(l.estado, 'rodando');
  assert.equal(l.erro, null);
  l = registrarNoLote(l, { ok: true, pulado: true });
  l = registrarNoLote(l, { ok: true });
  assert.equal(l.estado, 'concluido');
  assert.equal(l.pulados, 1);
  assert.equal(restamNoLote(l), 0);
  assert.equal(loteAberto(l), false);
  assert.equal(proximoDoLote(l), null);
});

test('lote: pausa e retoma; parado não volta; interrompido (rodando guardado) retoma', () => {
  let l = novoLote('icloud', ['g:1', 'g:2'], 0);
  l = pausarLote(l);
  assert.equal(l.estado, 'pausado');
  assert.ok(loteAberto(l));
  l = retomarLote(l);
  assert.equal(l.estado, 'rodando');
  // painel fechado no meio: o lote guardado continua "rodando" e pode ser retomado
  assert.ok(loteAberto(l));
  assert.equal(retomarLote(l).estado, 'rodando');
  l = pararLote(l);
  assert.equal(l.estado, 'parado');
  assert.equal(loteAberto(l), false);
  assert.equal(retomarLote(l).estado, 'parado');
  // registrar depois de parado (o item em andamento terminou) mantém parado
  assert.equal(registrarNoLote(l, { ok: true }).estado, 'parado');
});

test('cota do Google pelo texto da página, em português e em inglês', () => {
  const c = lerCotaGoogle('Armazenamento usado: 1,7 TB de 5 TB');
  assert.ok(Math.abs(c.usado - 1.7 * TB) < 1);
  assert.equal(c.total, 5 * TB);
  assert.equal(c.aproximado, true);
  assert.equal(lerCotaGoogle('12.5 GB of 15 GB used').total, 15 * GB);
  assert.equal(lerCotaGoogle('Armazenamento usado: 1.024,5 GB de 2 TB').usado, 1024.5 * GB);
  assert.equal(lerCotaGoogle('sem texto'), null);
});

test('cota do iCloud pela resposta de storageUsageInfo', () => {
  assert.deepEqual(lerCotaIcloud({ storageUsageInfo: { usedStorageInBytes: 10, totalStorageInBytes: 100 } }), { usado: 10, total: 100 });
  assert.equal(lerCotaIcloud({}), null);
});

test('cabe na cota: com folga; desconhecida não bloqueia', () => {
  const cota = { usado: 100 * GB, total: 200 * GB };
  assert.equal(cabeNaCota(cota, 50 * GB).ok, true);
  const quase = cabeNaCota(cota, 99 * GB);
  assert.equal(quase.ok, false, 'a folga mínima tira 2 GB');
  assert.equal(quase.livre, 100 * GB - FOLGA_MIN);
  assert.ok(quase.falta > 0);
  // texto do Google arredondado: desconta também meia casa decimal
  const g = cabeNaCota({ usado: 1.7 * TB, total: 5 * TB, aproximado: true }, 3.2 * TB);
  assert.equal(g.ok, false);
  assert.deepEqual(cabeNaCota(null, 1), { ok: null, livre: null, falta: 0 });
});

test('bytes do envio: original do iCloud ao Google; ficha ou estimativa ao iCloud', () => {
  const rows = [
    { a: { size: 3e6 }, g: null },
    { a: null, g: { w: 1000, h: 1000, file: { bytes: 5e5 } } },
    { a: null, g: { video: true, w: 1920, h: 1080, fileV: { bytes: 4e7 } } },
    { a: null, g: { video: true, w: 1920, h: 1080, videoMs: 10000 } },
  ];
  assert.equal(bytesDoEnvio(rows, 'google'), 3e6);
  assert.equal(bytesDoEnvio(rows, 'icloud'), 5e5 + 4e7 + 10 * VIDEO_BYTES_POR_S);
  // vídeo sem ficha não é estimado como foto
  assert.equal(espacoDasLinhas([{ g: { video: true, w: 1920, h: 1080, videoMs: 1000 } }], 0.35).google, VIDEO_BYTES_POR_S);
});

test('vídeo que o Google não serve mais (só a capa): iCloud é a única cópia; só do Google não vai', async () => {
  const { copiaVideoNoGoogle, resumoVideos } = await import('../extension/src/core/video.js');
  const { melhorCopia } = await import('../extension/src/core/qualidade.js');
  const { podeEnviar } = await import('../extension/src/core/envio.js');
  const a = { video: true, size: 1e7, w: 1920, h: 1080, durMs: 5000 };
  const g = { video: true, w: 1920, h: 1080, videoMs: 5000, fileV: { indisponivel: true, status: 400 } };
  assert.equal(copiaVideoNoGoogle(a, g), 'indisponivel');
  assert.equal(copiaVideoNoGoogle({ size: 1, w: 1, h: 1 }, g), null);
  const par = { cls: 'ambos', a, g, copiaGoogle: 'indisponivel' };
  assert.ok(melhorCopia(par).icloud.includes('googleSemVideo'));
  const so = { cls: 'soGoogle', cat: 'pessoal', a: null, g: { id: 'g:1', ...g } };
  assert.match(podeEnviar(so, 'icloud').motivo, /só a capa/);
  const v = resumoVideos([{ ...par, ident: 'confirmada' }, so]);
  assert.equal(v.copia.indisponivel, 1);
  assert.equal(v.soGoogleIndisponivel, 1);
});
