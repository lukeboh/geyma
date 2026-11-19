// Todo controle das páginas (botão, seletor, caixa, campo, resumo) explica o
// que faz: dica (title) nele mesmo ou no rótulo que o envolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CONTROLES = new Set(['button', 'select', 'input', 'summary', 'textarea']);

/** Controles sem dica: percorre as etiquetas e lembra os <label> abertos com title. */
function semDica(html) {
  const faltam = [];
  const rotulos = [];
  for (const m of html.matchAll(/<(\/?)([a-z]+)([^>]*)>/gi)) {
    const [, fecha, nomeBruto, attrs] = m;
    const nome = nomeBruto.toLowerCase();
    if (nome === 'label') {
      if (fecha) rotulos.pop();
      else rotulos.push(/\stitle="/.test(attrs));
      continue;
    }
    if (fecha || !CONTROLES.has(nome)) continue;
    if (/type="hidden"/.test(attrs)) continue;
    const dica = /\stitle="[^"]{8,}/.test(attrs) || rotulos.some(Boolean);
    if (!dica) faltam.push(`<${nome}${attrs.slice(0, 60)}>`);
  }
  return faltam;
}

for (const pagina of ['extension/dashboard.html', 'mobile/index.html']) {
  test(`${pagina}: todo controle tem dica`, () => {
    assert.deepEqual(semDica(fs.readFileSync(pagina, 'utf8')), []);
  });
}

test('o verificador acha um botão sem dica', () => {
  assert.equal(semDica('<button id="x">X</button><label title="rótulo longo"><select></select></label>').length, 1);
});
