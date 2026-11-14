import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
const version = readFileSync(new URL('../VERSION', import.meta.url), 'utf8').trim();

test('versão do manifesto acompanha VERSION', () => {
  assert.equal(manifest.version, version);
});

// O app de Fotos do iCloud roda num iframe (/applications/photos…): sem
// all_frames, o hook não vê as consultas nem encontra a grade.
test('scripts do iCloud são injetados em todos os frames', () => {
  const icloud = manifest.content_scripts.filter((c) => c.matches.some((m) => m.includes('icloud.com')));
  assert.equal(icloud.length, 2);
  for (const c of icloud) assert.equal(c.all_frames, true);
  assert.ok(icloud.some((c) => c.world === 'MAIN' && c.js.includes('src/page/hook.js')));
  assert.ok(icloud.some((c) => !c.world && c.js.includes('src/page/relay.js')));
});

test('hook percorre a grade só no frame do app de Fotos', () => {
  const hook = readFileSync(new URL('../extension/src/page/hook.js', import.meta.url), 'utf8');
  assert.match(hook, /cmd === 'icloud-walk' && !isPhotosFrame\(\)/);
});
