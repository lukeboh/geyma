# Changelog

Formato: versão, data (America/Sao_Paulo), mudanças e verificação.

## 0.2.33 — 16/11/2026

- Fotos ocultas do iCloud ficam fora do cruzamento e, portanto, de qualquer
  plano de envio e da revisão (decisão do usuário). Continuam no inventário;
  a aba Proteção diz quantas ficaram de fora (`paraCruzar` em `match.js`).
  A marca vem do campo `isHidden`, gravado quando o álbum Ocultas é aberto no
  site; fotos ocultas registradas antes da 0.2.32 só ganham a marca quando o
  álbum for aberto de novo.

Verificação: 106 testes passando.

## 0.2.32 — 16/11/2026

- Como o Google guarda cada foto: a leitura do Google passa a registrar o
  movimento da Live Photo (`motionMs`) e a duração dos vídeos, tirados do
  dicionário no fim de cada item da listagem. Uma conferência nova lê só o
  cabeçalho do download do original (pedido HEAD, nada é baixado): formato,
  tamanho e nome do arquivo (`src/core/google-file.js`). Conferido no uso
  real que o arquivo entregue tem o mesmo SHA-1 que o Google informa para o
  original guardado. Vídeos ficam de fora (o download sem sufixo de vídeo
  devolve a capa). HEIF do Google conta como o mesmo formato do HEIC.
- Cruzamento: mesmo nome de arquivo no mesmo instante mantém o par mesmo com
  as imagens diferentes. Se for Live Photo, vira "quadro diferente"; senão,
  "versão editada". Resumo novo de Live Photos (com movimento no Google, só a
  foto parada, ainda não lido) e de cópias no Google (original, em outro
  formato, no tamanho cheio).
- Revisão e celular: etiquetas e linhas "Live completa no Google", "Google
  sem o movimento", "Google: cópia em JPEG", "versão editada"; o
  visualizador mostra nome, formato e tamanho do arquivo do Google (busca a
  ficha na hora, se faltar).
- iCloud: registra fotos ocultas (`hidden`, campo `isHidden`), que entram no
  inventário quando o álbum Ocultas é aberto no site.

Verificação: 105 testes passando (`ext-google-file`, novos casos em
`ext-match` e `ext-normalize`). Uso real: Google relido inteiro e os
arquivos dos pares relevantes conferidos sem erro; a maioria das Live Photos
tem o movimento no Google, e a maior parte das cópias em outro formato está
no tamanho cheio. O par relatado é uma cópia JPEG reduzida, com o mesmo nome
de arquivo e com movimento.

## 0.2.31 — 15/11/2026

- Live Photo com quadro principal diferente: os quadros de um mesmo clique
  têm o mesmo instante; se o quadro principal foi trocado (no iPhone, ou numa
  cópia enviada antes da troca), as imagens diferem mas é a mesma foto. Com o
  instante idêntico ao milissegundo (ou, se o Google guardou sem
  milissegundos, o mesmo segundo com um só candidato) e o item do iCloud
  sendo Live Photo, o par é mantido, sem ir para "a confirmar" nem ser
  desfeito, com a etiqueta "Live Photo · quadro diferente" (`mesmoClique`,
  `isLive` em `match.js`; total em `summary.quadroDiferente`).
- Inventário do iCloud passa a registrar `live` (vídeo complementar no
  original); itens antigos usam `assetSubtypeV2 = 2`, conferido contra os
  tipos de arquivo (2 = Live, 3 = captura de tela, 1 = panorama).

Verificação: 97 testes passando. Uso real: pares de Live Photo com quadro
diferente reconhecidos (parte deles tinha sido desfeita e voltou a contar
como protegida); o par relatado aparece como cópia reduzida da mesma Live
Photo.

## 0.2.30 — 15/11/2026

- Correção: "cópia reduzida" afirmada sem comparar as imagens. Mesmo
  instante (até o milissegundo) e mesma proporção não bastam: dois quadros
  da mesma Live Photo (com o quadro principal trocado no iPhone) têm os dois.
  Agora a conferência do Google pelas miniaturas inclui os pares reduzidos
  ainda sem pHash (`googlePhashNeeded` em `match.js`); imagens claramente
  diferentes desfazem o par; imagens só parecidas (distância entre 11 e 21)
  vão para "a confirmar", com a etiqueta "imagens só parecidas"; e o que
  ainda não foi comparado mostra "imagem não conferida".

Verificação: 94 testes passando (casos reais em `ext-match`). Uso real: as
miniaturas do Google dos pares reduzidos foram conferidas; parte dos pares
foi desfeita por imagens diferentes e parte passou para "a confirmar"; o par
relatado (distância 14, Live Photo editada) saiu de "cópia reduzida".

## 0.2.29 — 15/11/2026

- Painel abre rápido: o último cruzamento fica guardado no notebook
  (IndexedDB v3, área `cache`) e aparece na hora; só é refeito, em segundo
  plano, quando o inventário mudou de verdade (meta `inventario.versao`, que
  ignora os links novos da Apple a cada passada). Marcações feitas depois do
  cálculo valem por cima do resultado guardado (`decisoesRecentes`,
  `src/core/calc-cache.js`) e não forçam recálculo.
- Andamento do cálculo nas abas Proteção e Revisão: barra com a etapa
  (lendo, cruzando, cópias no Google, cópias no iCloud, lista, guardando) e o
  tempo decorrido.
- Inventário sem ler os itens: contagem por serviço e por ano mantida a cada
  gravação (`src/core/inv-summary.js`) e refeita do zero a cada cruzamento.
- Renovação de link do iCloud usa as datas em ordem guardadas pelo
  cruzamento, em vez de percorrer o índice (o primeiro pedido ficava lento).
- Links copiáveis: abrir uma foto põe o endereço `#rev?foto=<id>` na barra e
  o visualizador ganhou "Copiar link"; abrir esse link (ou colá-lo numa aba
  já aberta) mostra a mesma foto. No celular, "Copiar link desta foto" na
  ficha e no visualizador (sem HTTPS, mostra o link para copiar à mão). O
  título do visualizador diz por que a foto é tida como cópia.

Verificação: 91 testes passando (`ext-inv-summary`). Uso real: abrir o
painel com o cruzamento guardado levou 3,7 s até os números (antes, de 25 a
58 s calculando); aba Inventário em 2,3 s (antes, cerca de 9 s lendo os
itens, repetidos a cada 5 s durante leituras); link de uma cópia repetida
abriu as três versões lado a lado.

## 0.2.28 — 15/11/2026

- Link novo para foto do iCloud sob demanda: ao abrir no visualizador uma
  foto do iCloud com o link vencido, a extensão rola a grade do site do
  iCloud até a data dela (como no percurso, sem consultas próprias) e o site
  carrega aquela região com links novos; o visualizador troca a imagem
  sozinho. A posição é estimada pela ordem da data entre todas as fotos do
  iCloud e corrigida pelas datas que chegaram, em até 5 tentativas
  (`src/core/icloud-locate.js`); uma renovação por vez; com a tela bloqueada,
  pela emulação de foco. Renova também as vizinhas da mesma data.
- Celular: `GET /api/icloud-grande?id=` pede o link novo ao notebook.
- Confirmado no uso real que a grade traz a versão média (`resJPEGMedRes`)
  na maioria das fotos (273 de 315 na amostra); sem ela, vem a miniatura.

Verificação: 85 testes passando (`ext-icloud-locate`). Uso real: fotos de
2023, 2016 e 2011 com links vencidos renovadas na primeira tentativa (cerca
de 7 s; 21 s na primeira, que lê as datas); no painel, par "a confirmar"
aberto com o lado do iCloud em 2.365 px; pelo servidor do celular, link
novo em 7 s e imagem entregue.

## 0.2.27 — 15/11/2026

- Visualizador de fotos em tamanho grande (`extension/viewer.js` e
  `viewer.css`, usados pelo painel e pelo celular): uma foto ou as versões da
  linha lado a lado (no celular, uma sobre a outra), com zoom e movimento em
  paralelo ("Mover juntas", pode desligar). Roda, pinça, arrastar, duplo
  clique ou toque duplo, botões − 1:1 + e teclado (+ − 0, setas, Esc).
  Abre com a miniatura e troca pela versão grande quando ela chega.
- Painel: na lista, clicar na miniatura abre o visualizador; na grade, o
  clique continua selecionando e a lupa ⤢ abre. O link para o Google Fotos
  passou para dentro do visualizador. Celular: no detalhe (segurar a foto),
  tocar numa foto ou em "Ver em tamanho grande".
- Versão grande: Google pela sessão (=w2400/=w2000, sem corte); iCloud pela
  versão média em JPEG (`resJPEGMedRes`, agora guardada no inventário)
  enquanto a URL vale (até 4 h depois do percurso); depois, a miniatura
  guardada. Sem nenhuma imagem, o painel explica o motivo.
- Miniaturas guardadas passam a incluir o lado do iCloud dos pares
  "cópia reduzida" e "a confirmar", que são os que se quer comparar (vale a
  partir do próximo percurso).

Verificação: 81 testes passando (`ext-viewer-src`, versão média no
`ext-normalize`). Uso real: no painel, par reduzido e cópia do iCloud abertos
lado a lado, zoom pela roda aplicado igual nas duas; no celular emulado, o
detalhe abre o visualizador com as duas versões empilhadas.

## 0.2.26 — 15/11/2026

- Uso real: percurso completo do iCloud com o desempate e a guarda de
  miniaturas, com a tela bloqueada, sem falhas nem URLs expiradas. Quase
  todos os pares "a confirmar" foram resolvidos pela imagem, e as cópias
  repetidas dentro do iCloud passaram a ser confirmadas pela imagem.
- Roadmap: impressão digital dos dois lados concluída. Falta exercitar
  "Continuar de onde parou" com a correção da 0.2.22 para fechar a etapa 0.3.

Verificação: 78 testes passando; cruzamento recalculado no painel.

## 0.2.25 — 14/11/2026

- Miniaturas do iCloud guardadas no notebook: as URLs da Apple expiram em
  horas, e as fotos que só estão no iCloud sumiam da revisão. Durante o
  percurso, a mesma descarga que calcula a impressão digital guarda a
  miniatura (cerca de 70 KB) dos itens que só estão no iCloud, das cópias
  repetidas nele, das que ficam e das candidatas a duplicata. Ficam num
  depósito novo do inventário (`thumbs`, IndexedDB versão 2).
- Painel e celular mostram a miniatura guardada quando existe, e a URL
  quando não; o servidor do celular aceita o item (`id`) junto da URL.

Verificação: 78 testes passando. Uso real: o cruzamento separou 8.398 itens
para a impressão digital e 32.145 para guardar; no primeiro minuto do
percurso, 577 miniaturas guardadas e nenhuma falha. Pelo servidor do celular,
uma URL expirada com o item devolve a miniatura guardada (200), e sem o item
devolve 404.

## 0.2.24 — 14/11/2026

- Guia passo a passo (painel e celular): a faixa colorida no topo do cartão
  passava das bordas arredondadas. Era um `::before` de 3 px com o raio do
  cartão, e o canto não cabia nessa altura; virou uma camada do fundo do
  próprio cartão, recortada pelos cantos.

Verificação: 77 testes passando (o novo `ui-guia-faixa` falha com o CSS
antigo); cartão conferido em captura ampliada no painel.

## 0.2.23 — 14/11/2026

- Desempate pelas miniaturas do iCloud durante o próprio percurso: o
  cruzamento grava quais itens do iCloud a imagem decidiria (pares a
  confirmar ou reduzidos e candidatas a duplicata, sem pHash) e o service
  worker baixa e resume a miniatura de cada um assim que o percurso a vê, com
  8 downloads simultâneos (`src/core/thumb-queue.js`). Antes era um passo
  separado, e as URLs (temporárias) expiravam antes dele: 6 h depois do
  percurso anterior, todas respondiam 410.
- Aba Proteção: sem miniaturas guardadas, diz quantos itens o próximo
  percurso vai conferir.

Verificação: 75 testes passando. Uso real: lista com 26.101 itens; no
percurso iniciado às 22h19, os primeiros itens desejados (a partir de 2008)
foram baixados e resumidos durante a leitura, sem falhas.

## 0.2.22 — 14/11/2026

- Percurso do iCloud sem depender da tela: a extensão se conecta à aba do
  iCloud pelo protocolo de depuração do Chrome (permissão `debugger`) e liga a
  emulação de foco; a página continua se achando visível e desenhando com a
  janela coberta ou a tela bloqueada. Desliga ao fim, parada ou erro, e religa
  se o percurso voltar a esperar a aba. O Chrome mostra o aviso de depuração
  enquanto roda.
- O pedido de energia passa a ser `system`: o notebook não dorme durante as
  leituras, mas a tela apaga e bloqueia normalmente (respeita a política de
  bloqueio do notebook).
- "Continuar de onde parou": um aviso sem posição (como "aguardando a aba")
  apagava a posição salva e o percurso recomeçava do início; agora mantém a
  última fração lida (`src/core/progress.js`).
- Textos do painel, do guia e do celular atualizados: não é mais preciso
  deixar a tela desbloqueada.

Verificação: 72 testes passando. Uso real: com a tela bloqueada (aba
`hidden`), a emulação levou a aba a `visible`, com quadros e timers normais;
o percurso retomado nessas condições avançou de 0,2% para 1% em 45 s.

## 0.2.21 — 14/11/2026

- Tela acesa durante as leituras: a extensão pede ao Chrome para manter a
  tela ligada (permissão `power`, o mesmo pedido de um vídeo em reprodução)
  enquanto alguma leitura está lendo ou esperando a aba voltar, e solta o
  pedido quando tudo termina, para ou dá erro (`src/core/keep-awake.js`).
  Motivo: o percurso do iCloud parou às 12h38 porque a tela bloqueou por
  inatividade (política do notebook: 15 minutos).

Verificação: 70 testes passando; permissão e API conferidas no service worker
do Chrome de automação.

## 0.2.20 — 14/11/2026

- Desempate pelas miniaturas do iCloud: 8 downloads simultâneos (antes 4;
  cerca de 4,5 por segundo era pouco para acompanhar o percurso).
- Uso real: segundo percurso do iCloud iniciado com a tela desbloqueada,
  janela própria e miniaturas no menor tamanho; as URLs das miniaturas do
  iCloud passaram a ser guardadas. Primeiro lote do desempate (607 itens, sem
  falhas): 577 pares saíram de "a confirmar" para "Em ambos" e 106 cópias
  repetidas novas apareceram dentro do iCloud.

Verificação: 68 testes passando; desempate conferido no navegador.

## 0.2.19 — 14/11/2026

- Guia passo a passo também no celular (`mobile/guia.js`), que faltava na
  0.2.18: na primeira visita a cada aba (Resumo, Revisar, Cópias, Leituras),
  destaca a parte da tela e explica o gesto (toque seleciona, segurar abre o
  detalhe, barra de baixo marca várias); cartão encaixado no alto ou embaixo,
  do lado oposto ao destaque; botão "?" no topo repete o guia da aba.
- Servidor do celular: a folha de estilos era guardada por uma hora no
  navegador e o celular ficava com a versão antiga (o guia não aparecia);
  agora revalida a cada acesso, e a página pede CSS e JS com a versão no
  endereço.

Verificação: 68 testes passando; guias do Resumo e da Revisão percorridos com
emulação de iPhone, com capturas de tela.

## 0.2.18 — 14/11/2026

- **Geyma no celular** (`mobile/`), pedido pelo usuário: servidor local
  (Node, sem dependências) que mostra no celular o que a extensão processou no
  notebook — resumo, plano de envio, categorias, cópias repetidas, leituras e
  revisão com miniaturas e marcação.
  - Acesso só pela rede Tailscale (`tailscale serve`, HTTP restrito à rede);
    o servidor escuta só em 127.0.0.1 e recusa outras origens.
  - Senha de acesso: token aleatório fora do repositório, trocado por um
    cookie HttpOnly/SameSite=Strict; POST exige cabeçalho próprio; política de
    segurança de conteúdo restritiva; miniaturas só dos domínios de imagem dos
    serviços, com cache em memória.
  - `mobile/iniciar.ps1` inicia em segundo plano, sem janela, e publica na
    rede; o link de acesso aparece ao iniciar.
  - Interface no vidro tátil do painel, com abas embaixo, grade de três
    colunas, seleção por toque, detalhe ao segurar a foto, folha de
    confirmação e ícone para a tela de início do iPhone.
- Extensão: `mobile-api.js` (API interna que o servidor chama pela porta de
  depuração) e `src/core/review.js` (filtro e contagens da revisão, agora
  compartilhados pelo painel e pelo celular).

Verificação: 68 testes passando (3 novos do filtro). Servidor testado: sem
login 401, token errado 403, login pela rede Tailscale, resumo, lista,
miniatura (200, JPEG) e domínio proibido (400). Telas conferidas com
emulação de iPhone: resumo, cópias, revisão com seleção, detalhe e leituras.

## 0.2.17 — 14/11/2026

- Guia passo a passo (`extension/tour.js`), pedido pelo usuário: na primeira
  visita a cada etapa (Inventário, Proteção, Revisão), destaca uma parte da
  tela por vez e explica o que fazer; Voltar, Próximo, Pular guia, Esc e setas;
  botão "?" no topo repete o guia. O cartão do guia se posiciona abaixo, acima
  ou ao lado do trecho destacado sem cobri-lo; passos sem quadro na tela são
  pulados; na Revisão, o guia troca para a grade ao explicar a seleção.
- Situação da leitura sem notícias há mais de 10 min aparece como "sem
  notícias desde…" (antes ficava "aguardando" para sempre), com a data do
  último percurso completo do iCloud; registro retroativo da conclusão do
  primeiro percurso.
- Itens sem miniatura (iCloud, até o próximo percurso) ganham um marcador de
  lugar com explicação, em vez de texto sobre a caixa de seleção.

Verificação: 65 testes passando; guias das três etapas percorridos no
navegador, com capturas de tela dos passos.

## 0.2.16 — 14/11/2026

- Revisão: miniaturas do Google em PNG (como capturas de tela) eram
  descartadas junto com o PNG que o Google devolve quando bloqueia o acesso;
  agora vale qualquer imagem com status de sucesso (o bloqueio já vem com
  status de erro).

Verificação: 65 testes passando; na grade de cópias repetidas, nenhuma
miniatura faltando depois da correção (antes, 69 de 240).

## 0.2.15 — 14/11/2026

- Deduplicação nos dois serviços (`src/core/dedup.js`), pedida pelo usuário:
  - provas, da mais forte para a mais fraca: arquivo idêntico (impressão
    digital do original no iCloud, SHA-1 no Google, em qualquer instante),
    mesma imagem pelo pHash e, só como candidata, mesmo segundo com as mesmas
    dimensões;
  - em cada grupo fica a cópia de maior qualidade (mais pixels, depois mais
    bytes, depois favorita); as demais são cópias a revisar.
- Painel: quadro "Duplicatas nos dois serviços" (cópias, grupos, arquivos
  idênticos, espaço quando conhecido, fotos diferentes, incertos e o que falta
  conferir); filtros "Cópias repetidas no Google" e "no iCloud" na Revisão,
  com a cópia que fica ao lado; candidatas do iCloud entram no desempate pelas
  miniaturas do iCloud.
- Plano de envio não conta cópias repetidas de nenhum dos lados.
- Nada é removido: marcar como Descartar só registra a decisão; a remoção para
  a lixeira dos serviços fica para a etapa 0.8, com confirmação explícita.

Verificação: 65 testes passando (8 novos de deduplicação e 1 do plano). No
navegador: contagens dos dois lados conferidas; no iCloud, as cópias
idênticas já aparecem confirmadas sem baixar nada.

## 0.2.14 — 14/11/2026

- Visual do painel na linguagem do Urna Velox: aurora azul ao fundo, vidro
  tátil (cartões translúcidos com borda de luz que inclinam de leve e acendem
  um reflexo sob o ponteiro), etapas e botões em pílula com degradê
  azul-turquesa, fonte Archivo embutida (OFL).
- Tema escuro e claro, com botão ◐ (a escolha fica salva; sem escolha, segue o
  sistema) e aplicação antes do primeiro desenho.
- Cores das situações validadas nos dois temas (azul do Google e
  coral-laranja do iCloud, complementares; turquesa, âmbar e rosa para as
  demais); no tema claro, gráficos com legenda e tabela.
- Movimento reduzido do sistema desliga inclinações e transições.

Verificação: 56 testes passando; painel conferido no navegador nos dois temas.

## 0.2.13 — 14/11/2026

- Registro no changelog da 0.2.12, que saiu sem ele.

## 0.2.12 — 14/11/2026

- Handoff: trabalho da noite e próximos passos (percurso do iCloud com o
  usuário e, logo depois, o desempate pelas miniaturas do iCloud).

Verificação: somente documentação; 56 testes continuam passando.

## 0.2.11 — 14/11/2026

- Revisão das cópias repetidas do Google: cada cópia aparece ao lado da
  original (borda tracejada), na lista e na grade, e a legenda da grade indica
  "cópia". O motor informa de qual item cada cópia é repetição (`extraOf`).

Verificação: 56 testes passando. No navegador: filtro "Cópias repetidas no
Google" em grade, com original e cópia lado a lado.

## 0.2.10 — 14/11/2026

- Motor: com o pHash do iCloud, a imagem decide o par. Candidatos claramente
  diferentes saem; o mais parecido vem primeiro; par confirmado pela imagem
  vira "Em ambos" mesmo havendo disputa; foto diferente de todos os candidatos
  fica "Só no iCloud"; duas cópias da mesma foto no iCloud com uma no Google
  contam as duas como "Em ambos".
- Painel: quadro "Desempate com as miniaturas do iCloud", que baixa as
  miniaturas guardadas no percurso (até 4 por vez, sem consultar a Apple por
  conta própria), calcula o pHash e recalcula o cruzamento; para se as URLs
  temporárias tiverem expirado e pede um novo percurso.
- `src/core/phash-image.js`: pHash a partir de imagem, comum ao service
  worker e ao painel.
- Permissão de host para o CDN de miniaturas do iCloud.

Verificação: 56 testes passando (3 novos do desempate pela imagem). No
navegador: service worker refatorado calculou o pHash dos últimos itens do
Google; o quadro novo aparece e informa que ainda não há miniaturas do iCloud
guardadas. O desempate pelo iCloud ainda não foi exercitado: depende de um
novo percurso do iCloud com a tela desbloqueada.

## 0.2.9 — 14/11/2026

- Miniaturas na Revisão: o inventário passa a guardar a URL da miniatura
  (Google: só abre com a sessão; iCloud: temporária). O painel busca as do
  Google com a sessão, graças à permissão de host para os domínios de imagem
  do Google; clicar na do Google abre a foto no Google Fotos.
- Revisão em **grade**: 120 miniaturas por página, seleção por clique e
  marcação dos selecionados ou dos não selecionados da página (para marcar o
  resto depois de separar as exceções), com confirmação.
- **Plano de envio (prévia)** na aba Proteção (`src/core/plan.js`): o que iria
  em cada sentido com as marcações em vigor, com quantidade e espaço (fotos e
  vídeos separados; tamanho do lado do Google estimado por bytes por pixel do
  iCloud); cópias repetidas do Google e itens Pendente ou Descartar ficam de
  fora.
- Conferência pelas miniaturas: inclui os candidatos de pares disputados (a ±1
  s, fora dos grupos de mesmo segundo) e percorre o catálogo inteiro,
  atualizando o inventário na mesma passagem.
- Conferência completa em uso real, sem nenhuma falha: a maior parte dos
  grupos de mesmo segundo do Google é a mesma foto repetida.
- Documentação: README da extensão, handoff e usabilidade atualizados.

Verificação: 53 testes passando (plano de envio e candidatos de disputa). No
navegador: miniaturas do Google carregadas pelo painel (status 200 com a
sessão), grade com fotos reais, prévia do plano conferida.

## 0.2.8 — 14/11/2026

- Classificação por regras (`src/core/classify.js`, primeira parte da etapa
  0.6): categorias Pessoal (câmera), Captura de tela, Recebida de mensageiro ou
  rede social, Salva da internet ou de apps e Indefinido, com o motivo de cada
  uma. Sinais do iCloud: tipo da Apple (captura de tela, Live Photo,
  panorama…), app que importou (câmera, WhatsApp, Mensagens, Instagram,
  ChatGPT…), padrões de nome (câmeras, data e hora, filme digitalizado, UUID)
  e tamanho de tela. Do Google só há dimensões: regras conservadoras. Telas de
  iPad e 1080×1920 ficaram fora da lista de telas (iguais a câmeras antigas e a
  vídeos).
- Marcação de decisão (Pessoal, Pendente, Manter, Descartar) gravada nos dois
  itens do par; sem marcação vale a sugestão (só o claramente pessoal é
  sugerido como Pessoal; o resto fica Pendente).
- Revisão: filtros por situação, categoria, marcação, ano e tipo; marcação por
  linha; marcação em lote dos itens filtrados com confirmação; resumo do que
  está em vigor; CSV com categoria, motivo e marcação. Abre em "Todas".
- Proteção: quadro "Pessoal ou lixo?" com a contagem por categoria e atalho
  para revisar.
- Conferência pelas miniaturas: 12 downloads simultâneos (cerca de 19 por
  segundo no uso real, antes 7); estado "lendo" antigo sem atualização é
  mostrado como interrompido e pode ser retomado.

Verificação: 46 testes passando (8 novos do classificador). No navegador:
filtros, contagens, gravação de uma marcação e volta à sugestão conferidas no
inventário; conferência retomada só com os itens ainda sem hash.

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
