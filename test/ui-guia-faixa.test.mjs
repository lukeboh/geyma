import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A faixa colorida do topo dos cartões do guia era um ::before de 3px com o
// raio do cartão: o canto não cabia e a faixa passava das bordas arredondadas.
// Agora é uma camada do fundo do próprio cartão, recortada pelos cantos.
function regra(css, sel) {
  const ini = css.indexOf(`\n${sel} {`);
  if (ini < 0) return '';
  return css.slice(ini, css.indexOf('}', ini));
}

for (const [arq, sel] of [['extension/dashboard.css', '.tour-card'], ['mobile/app.css', '.guia-cartao']]) {
  test(`${sel}: faixa do topo é camada do fundo, sem pseudo-elemento`, () => {
    const css = readFileSync(new URL(`../${arq}`, import.meta.url), 'utf8');
    const corpo = regra(css, sel);
    assert.ok(corpo, `regra ${sel} não encontrada`);
    assert.ok(corpo.includes('linear-gradient(90deg, var(--acento), var(--acento-2)) top / 100% 3px no-repeat'), 'faixa como camada do fundo');
    assert.ok(!css.includes(`${sel}::before`), 'sem ::before na faixa');
  });
}
