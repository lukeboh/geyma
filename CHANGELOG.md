# Changelog

Formato: versão, data (America/Sao_Paulo), mudanças e verificação.

## 0.2.5 — 13/11/2026

- Causa encontrada: o app de Fotos do iCloud roda num iframe da mesma origem
  (`/applications/photos…`), e a extensão só era injetada na página principal.
  Por isso as contagens oficiais da Apple não chegavam (problema em aberto da
  0.2.3) e a captura passiva via poucos itens.
- Extensão: scripts do iCloud injetados em todos os frames; só o frame do app
  de Fotos executa o percurso da grade, para não haver dois percursos.
- `test/ext-manifest.test.mjs`: injeção em todos os frames do iCloud, percurso
  restrito ao frame do app e versão do manifesto igual a `VERSION`.

Verificação: o teste novo falha no código anterior (2 de 3) e passa com a
correção; 22 testes passando. Em uso real, as contagens por tipo chegaram ao
inventário e o percurso do iCloud começou a ler a grade com a aba visível.

## 0.2.4 — 13/11/2026

- Extensão: o percurso do iCloud espera a aba ficar visível antes de procurar a
  grade, tenta por até 20 s e procura também em shadow DOM e iframes da mesma
  origem. Antes, com a aba oculta, falhava com "grade de fotos não encontrada".
- Observado: o Windows impede que a extensão traga o Chrome para frente quando
  o usuário está em outra janela; o percurso agora espera em vez de falhar.

Verificação: 19 testes passando; sintaxe validada. Percurso do iCloud ainda não
validado com a aba visível.

## 0.2.3 — 13/11/2026

- Extensão: a captura passiva passa a ler respostas XHR em JSON e o corpo de
  pedidos `fetch` feitos com `Request`.
- Primeiro uso real: a leitura completa do catálogo do Google pela extensão
  funcionou, em segundo plano, a partir do painel, com o mesmo total da medição
  da prova de acesso.
- **Problema em aberto:** as contagens oficiais da Apple ainda não chegam ao
  inventário, mesmo com a correção acima. A causa não foi identificada; a
  investigação exige recarregar a aba do iCloud várias vezes e foi adiada.

Verificação: 19 testes passando; leitura do Google acompanhada pelo painel até
"concluído".

## 0.2.2 — 13/11/2026

- `docs/HANDOFF.md`: estado do projeto, cronologia, decisões, conhecimento
  técnico das duas fontes, ambiente, próximos passos e regras para retomar o
  trabalho.
- Extensão carregada sem compactação no Chrome de automação (ainda sem teste
  em uso real).

Verificação: somente documentação; 19 testes continuam passando.

## 0.2.1 — 13/11/2026

- Extensão de navegador em `extension/` (Manifest V3, Chrome/Edge):
  - captura passiva das respostas do Google Fotos e do iCloud;
  - leitura ativa do catálogo do Google, sem rolar a página;
  - percurso da grade do iCloud em ritmo humano, que espera com a aba oculta,
    para no primeiro erro do servidor e retoma pela posição salva;
  - inventário em IndexedDB e painel com totais, período, contagens da Apple,
    gráfico por ano (com tabela) e exportação em JSON.
- `test/ext-normalize.test.mjs`: interpretação dos dados dos serviços.

Verificação: `node --test test/*.test.mjs` com 19 testes passando; sintaxe dos
scripts de página e manifesto validados. Ainda não testada carregada no
navegador.

## 0.2.0 — 13/11/2026 — Prova de acesso concluída

- Catálogo completo do Google lido sem rolar a página e sem erro; total medido.
- Arquitetura decidida: extensão de navegador.
- Estratégia revista: as bibliotecas se completam (Google com os anos antigos,
  iCloud com os recentes); envio curado nos dois sentidos, com as opções do
  caminho Google → iCloud.

Verificação: critérios da etapa 0.2 do roadmap atendidos; somente documentação.

## 0.1.2 — 13/11/2026

- Prova de acesso: resultado do teste de casamento entre Google e iCloud
  (instante exato + dimensões + pHash), confirmação do SHA-1 do original no
  Google, navegação passiva por saltos no iCloud e regras iniciais para o motor
  de identidade.
- Roadmap: itens da etapa 0.2 atualizados.

Verificação: somente documentação; testes feitos com scripts descartáveis, fora
do repositório, só com leitura.

## 0.1.1 — 13/11/2026

- Adoção do versionamento MAJOR.MINOR.PATCH, com `VERSION` como fonte única.
- Estratégia do projeto e do produto em `docs/ESTRATEGIA.md`, com a marcação de
  decisão (Pessoal, Pendente, Manter, Descartar): suspeita de lixo não é copiada
  sem confirmação.
- Roadmap em `ROADMAP.md`.
- Resultados e lições da prova de acesso em `docs/prova-de-acesso.md`.
- `.gitignore` para o ambiente Python local (`.venv/`).

Verificação: somente documentação; nenhum código alterado.

## 0.1.0 — 10/11/2026 (registro retroativo, sem tag)

Commits `78cc8a8` e `40f6a1c`: protótipo client-side com Google Photos Picker,
leitura de pasta local da Apple, comparação por nome e data, exportação CSV e
painel de sincronização com estimativas de tempo.

Verificação na época: `node --test test/match.test.mjs test/estimate.test.mjs`.
