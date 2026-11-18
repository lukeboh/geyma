// Envio pelo site de cada serviço (0.7): o que pode ir, quais arquivos baixar,
// conferência da chegada e transporte em pedaços.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { podeEnviar, filaDeEnvio, arquivosDoItem, sha1Base64Url, base64DeBytes, bytesDeBase64, pedacos, registrarEnvio, conferirChegadas, resumoEnvio, nomePelaData } from '../extension/src/core/envio.js';
import { parseIcloudQuery } from '../extension/src/core/normalize.js';

const A = (o = {}) => ({ id: 'a:1', source: 'icloud', ts: 1700000000000, filename: 'IMG_0001.HEIC', fileType: 'public.heic', orig: 'https://x.icloud-content.com/o', ...o });
const G = (o = {}) => ({ id: 'g:1', source: 'google', ts: 1700000000000, thumb: 'https://lh3.googleusercontent.com/k', sha1: 'S'.repeat(27), ...o });

test('só vai o que está marcado Pessoal ou Manter, sem repetidas, ocultas nem vídeos', () => {
  const soI = { cls: 'soIcloud', cat: 'pessoal', a: A() };
  assert.deepEqual(podeEnviar(soI, 'google'), { ok: true, origem: 'icloud' });
  assert.equal(podeEnviar({ ...soI, cat: 'print' }, 'google').ok, false); // sugestão Pendente
  assert.equal(podeEnviar({ ...soI, cat: 'print', decision: 'manter' }, 'google').ok, true);
  assert.equal(podeEnviar({ ...soI, decision: 'descartar' }, 'google').ok, false);
  assert.equal(podeEnviar({ ...soI, a: A({ hidden: true }) }, 'google').ok, false);
  assert.equal(podeEnviar({ ...soI, a: A({ foraDoPercurso: 123 }) }, 'google').ok, false);
  assert.equal(podeEnviar({ ...soI, a: A({ video: true }) }, 'google').ok, false);
  assert.equal(podeEnviar({ ...soI, dupIcloud: true }, 'google').ok, false);
  // só no iCloud não vai "ao iCloud"
  assert.equal(podeEnviar(soI, 'icloud').ok, false);
  const soG = { cls: 'soGoogle', cat: 'pessoal', g: G() };
  assert.deepEqual(podeEnviar(soG, 'icloud'), { ok: true, origem: 'google' });
  assert.equal(podeEnviar({ ...soG, dup: true }, 'icloud').ok, false);
});

test('nos dois serviços: reenvia ao Google só quando o iCloud guarda a melhor cópia', () => {
  const par = { cls: 'ambos', cat: 'pessoal', a: A(), g: G() };
  assert.equal(podeEnviar(par, 'google').ok, false);
  assert.equal(podeEnviar({ ...par, melhor: { icloud: ['googleMenor'], google: [] } }, 'google').ok, true);
  assert.equal(podeEnviar({ ...par, melhor: { icloud: [], google: ['icloudMenor'] } }, 'icloud').ok, false);
});

test('fila respeita a ordem e o limite', () => {
  const rows = [
    { cls: 'soIcloud', cat: 'pessoal', a: A({ id: 'a:1' }) },
    { cls: 'soIcloud', cat: 'print', a: A({ id: 'a:2' }) },
    { cls: 'soIcloud', cat: 'pessoal', a: A({ id: 'a:3' }) },
    { cls: 'soIcloud', cat: 'pessoal', a: A({ id: 'a:4' }) },
  ];
  assert.deepEqual(filaDeEnvio(rows, 'google', { limite: 2 }).map((r) => r.a.id), ['a:1', 'a:3']);
});

test('arquivos: original do iCloud, par HEIC + MOV na Live Photo, versão atual na editada', () => {
  assert.deepEqual(arquivosDoItem(A()), [{ url: 'https://x.icloud-content.com/o', nome: 'IMG_0001.HEIC', papel: 'foto', credenciais: 'omit' }]);
  const live = arquivosDoItem(A({ live: true, origVid: 'https://x.icloud-content.com/v' }));
  assert.deepEqual(live.map((f) => [f.nome, f.papel]), [['IMG_0001.HEIC', 'foto'], ['IMG_0001.MOV', 'movimento']]);
  const ed = arquivosDoItem(A({ edited: true, full: 'https://x.icloud-content.com/f', live: true, origVid: 'v' }));
  assert.deepEqual(ed.map((f) => [f.url, f.nome]), [['https://x.icloud-content.com/f', 'IMG_0001.JPG']]);
  // sem link do original: pedir link novo antes
  assert.deepEqual(arquivosDoItem(A({ orig: null })), []);
  // sem nome: pela data
  assert.equal(arquivosDoItem(A({ filename: null, fileType: 'public.jpeg' }))[0].nome, '20231114_221320.JPG');
});

test('arquivos: Google pelo download do original, com o nome da ficha', () => {
  assert.deepEqual(arquivosDoItem(G({ file: { nome: 'foto.jpg' } })), [{ url: 'https://lh3.googleusercontent.com/k=d', nome: 'foto.jpg', papel: 'foto', credenciais: 'include', sha1: 'S'.repeat(27) }]);
  assert.equal(arquivosDoItem(G({ file: { formato: 'HEIC' } }))[0].nome, '20231114_221320.HEIC');
  assert.deepEqual(arquivosDoItem(G({ thumb: null })), []);
  assert.equal(nomePelaData(0, 'JPG'), '19700101_000000.JPG');
});

test('normalize guarda os links do original e do vídeo da Live Photo', () => {
  const u = (k) => ({ value: { downloadURL: `https://c.icloud-content.com/${k}` } });
  const master = { recordName: 'M', recordType: 'CPLMaster', fields: { itemType: { value: 'public.heic' }, resOriginalRes: u('o'), resOriginalVidComplRes: u('v'), resJPEGThumbRes: u('t') } };
  const asset = { recordName: 'A', recordType: 'CPLAsset', fields: { assetDate: { value: 1 }, masterRef: { value: { recordName: 'M' } } } };
  const [it] = parseIcloudQuery({ records: [master, asset] });
  assert.equal(it.orig, 'https://c.icloud-content.com/o');
  assert.equal(it.origVid, 'https://c.icloud-content.com/v');
  assert.equal(it.live, true);
});

test('SHA-1 no formato da listagem do Google (base64url, 27 caracteres)', async () => {
  const bytes = new TextEncoder().encode('geyma');
  const esperado = createHash('sha1').update(bytes).digest('base64url');
  assert.equal(await sha1Base64Url(bytes), esperado);
  assert.equal(esperado.length, 27);
});

test('transporte: base64 em pedaços válidos, ida e volta', () => {
  const bytes = Uint8Array.from({ length: 100003 }, (_, i) => (i * 31) % 256);
  const b64 = base64DeBytes(bytes);
  assert.equal(b64, Buffer.from(bytes).toString('base64'));
  const partes = pedacos(b64, 1001); // vira 1000 (múltiplo de 4)
  assert.ok(partes.every((p, i) => i === partes.length - 1 || p.length === 1000));
  const volta = partes.map(bytesDeBase64);
  const junto = new Uint8Array(volta.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of volta) { junto.set(p, o); o += p.length; }
  assert.deepEqual(junto, bytes);
  assert.deepEqual(pedacos(''), ['']);
});

test('estado do envio e conferência da chegada', () => {
  let e = registrarEnvio(null, 'a:1', { destino: 'google', estado: 'enviado', sha1: 'X'.repeat(27) }, 1000);
  e = registrarEnvio(e, 'g:9', { destino: 'icloud', estado: 'enviado', ts: 5000 }, 2000);
  e = registrarEnvio(e, 'a:2', { destino: 'google', estado: 'falhou', erro: 'HTTP 410' }, 3000);
  assert.deepEqual(resumoEnvio(e), { ensaio: 0, enviado: 2, chegou: 0, falhou: 1 });
  const google = [{ id: 'g:novo', sha1: 'X'.repeat(27) }];
  // no iCloud: mesmo instante, visto depois do envio (uma foto antiga do mesmo segundo não conta)
  const icloud = [{ id: 'a:velha', ts: 5000, seenAt: 10 }, { id: 'a:nova', ts: 5400, seenAt: 2500 }];
  assert.deepEqual(conferirChegadas(e, { google, icloud }), [{ id: 'a:1', chegou: 'g:novo' }, { id: 'g:9', chegou: 'a:nova' }]);
  // registrar de novo mantém o que já havia
  assert.equal(registrarEnvio(e, 'a:1', { estado: 'chegou' })['a:1'].sha1, 'X'.repeat(27));
});
