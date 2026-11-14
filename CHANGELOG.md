# Changelog

Formato: versão, data (America/Sao_Paulo), mudanças e verificação.

## 0.2.7 — 14/11/2026

- pHash na extensão (`src/core/phash.js`), idêntico ao da biblioteca Python
  imagehash a partir da matriz 32×32 (testado com valores gerados por ela).
- Conferência pelas miniaturas: a aba do Google relê o catálogo para obter as
  URLs (que não ficam no inventário), baixa miniaturas de 128 px com a sessão
  da página (até 4 por vez, sem timers, para funcionar com a aba oculta) e o
  service worker calcula o pHash e grava no item. Para no primeiro erro.
- Motor: candidatos do mesmo segundo que são a mesma imagem deixam de ser
  disputa (o par vira "Em ambos"); grupos do Google classificados em cópias
  repetidas, fotos diferentes, incertos e pendentes.
- Painel: quadro de duplicatas com o resultado, botão "Conferir pelas
  miniaturas", progresso ao vivo e filtro "Cópias repetidas no Google" na
  Revisão.
- Inventário: gravar mescla com o registro existente (o pHash sobrevive a uma
  nova leitura; `seenAt` guarda a primeira vez).
- A conclusão do percurso do iCloud fica registrada; o cruzamento também é
  completo quando o inventário alcança o total oficial da Apple.
- Parar o percurso do iCloud encerra na hora a espera pela aba visível.
- Uso real: o total oficial da Apple chegou ao painel e o inventário do iCloud
  ficou com 100% de cobertura.

Verificação: 38 testes passando (pHash contra o imagehash, uso do pHash no
motor e nas duplicatas). No navegador, o pHash das miniaturas da amostra
difere do Python em mediana 2 bits; a classificação dos 30 grupos só diverge
em 2 casos na faixa de fronteira. Conferência iniciada em escala, com hashes
gravados no inventário.

## 0.2.6 — 14/11/2026

- Motor de identidade (`extension/src/core/match.js`): cruza Google e iCloud
  pelo instante (tolerância de 1 s), dimensões iguais ou giradas e proporção
  (cópia reduzida, com o lado menor); atribuição um para um; "a confirmar"
  quando há outro candidato no mesmo segundo; grupos de possíveis duplicatas
  no Google; cruzamento parcial até onde o iCloud já foi lido.
- Painel em três etapas: Inventário, Proteção (frase-resumo, cartões por
  situação, colunas empilhadas por ano com tabela, duplicatas do Google) e
  Revisão (filtros por situação, ano e tipo, lista paginada, CSV). O cálculo
  roda num worker.
- Painel do inventário redesenha no máximo a cada 5 s e só com a aba aberta.
- Percurso do iCloud: a extensão põe as miniaturas no menor tamanho (controle
  do próprio site, por teclado) e, se a aba do iCloud divide a janela com
  outras, move-a para uma janela própria, sem recarregar.
- Primeiro inventário completo do iCloud pela extensão, sem erro do servidor:
  total igual ao medido na prova de acesso (mais as fotos novas) e vídeos
  batendo com a contagem oficial da Apple.
- `docs/USABILIDADE.md`: princípios, jornada, telas e aprendizados do uso real.
- Achados no inventário real (trecho lido do iCloud): o Google guarda o
  instante sem milissegundos; a maioria das fotos do iCloud já lidas tem par no
  Google; parte das cópias do Google é reduzida; numa amostra de 30 grupos do
  Google com o mesmo segundo e as mesmas dimensões, 21 eram a mesma foto
  (pHash ≤ 10).

Verificação: 30 testes passando (8 novos do motor). Abas Proteção e Revisão
conferidas no navegador com o inventário completo (cálculo em cerca de 12 s,
num worker). O ajuste das miniaturas foi testado isoladamente na página do
iCloud (ArrowLeft reduz; Home não funciona); a janela própria ainda não foi
exercitada num novo percurso.

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
