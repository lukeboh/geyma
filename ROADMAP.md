# Roadmap do Geyma

Estratégia e justificativas em [docs/ESTRATEGIA.md](docs/ESTRATEGIA.md).
Versão atual em [VERSION](VERSION) e histórico em [CHANGELOG.md](CHANGELOG.md).
Versionamento: MAJOR.MINOR.PATCH. PATCH a cada commit de trabalho; MINOR ao
concluir e validar uma etapa. Os números futuros são alvos.

## Concluído

| Versão | Entrega |
|---|---|
| 0.1.0 | Protótipo client-side: Picker do Google, pasta local da Apple, comparação por nome e data, painel com estimativas (registro retroativo, sem tag) |
| 0.3.0 | Extensão e inventário: os dois serviços lidos inteiros, retomáveis, sem queda de sessão (tag `v0.3.0`) |

## Etapas

### 0.2 — Prova de acesso *(concluída em 0.2.0)*
- [x] Leitura do catálogo do iCloud e do Google pela sessão web (0.1.1)
- [x] Leitura passiva do iCloud, sem erro do servidor (0.1.1)
- [x] Teste de casamento num período comum aos dois serviços (0.1.2)
- [x] Campo de 27 caracteres do Google confirmado como SHA-1 do original (0.1.2)
- [x] Miniaturas do Google medidas (0.1.2)
- [x] Total do Google medido, com leitura completa sem rolar a página (0.2.0)
- [x] Arquitetura decidida: extensão de navegador (0.2.0)

**Critério:** pares confirmados por instante, dimensão e hash perceptual numa
amostra, com a taxa de falso positivo medida contra um controle.

### 0.3 — Extensão e inventário *(concluída em 0.3.0)*
- [x] Esqueleto da extensão (Chrome/Edge, MV3) e painel com cobertura por ano (0.2.1)
- [x] Conectores Google (leitura ativa) e iCloud (percurso passivo, parada no
  primeiro erro, retomada pela posição) (0.2.1)
- [x] Inventário local de metadados, sem URLs nem fotos (0.2.1)
- [x] Contagens oficiais do iCloud por categoria (0.2.1), que chegam ao
  inventário desde que o hook roda no iframe do app de Fotos (0.2.5)
- [x] Validação em uso real: inventário completo dos dois lados (Google lido
  inteiro; percurso do iCloud concluído com 100% do total oficial) (0.2.22)
- [x] Impressão digital das miniaturas (pHash), calculada só para os pares e
  grupos que precisam de desempate (não para a biblioteca inteira): Google
  (0.2.10); iCloud durante o próprio percurso (0.2.23), validado em uso real
  com miniaturas guardadas para a revisão (0.2.25)
- [x] Percurso do iCloud numa janela própria e com as miniaturas no menor
  tamanho, ajustados pela extensão (0.2.17), e sem depender da tela: anda com
  a janela coberta e a tela bloqueada (0.2.22)
- [x] Painel rápido: cruzamento guardado e refeito em segundo plano só quando
  o inventário muda, com barra de etapas; contagem do inventário mantida a
  cada gravação (0.2.29)
- [x] Fotos ocultas e itens que o percurso completo não encontra ficam fora
  do cruzamento e de qualquer envio (0.2.33, 0.2.34; validado em 16/11)
- [x] "Continuar de onde parou" exercitado: parado em 22%, extensão
  recarregada, retomado na posição salva e concluído (0.3.0)

**Critério:** inventário completo dos dois lados, retomável, sem queda de sessão.

### 0.4 — Identidade
- [x] Primeira versão do motor (0.2.6): instante com tolerância de 1 s (o Google
  guarda sem milissegundos), dimensões iguais ou giradas, cópia reduzida pela
  proporção, atribuição um para um e estado "a confirmar" quando há outro
  candidato no mesmo segundo
- [x] Aba Proteção e aba Revisão no painel, com cruzamento parcial enquanto o
  iCloud é lido (0.2.6)
- [x] Duplicatas dentro do Google (mesmo segundo e dimensões) conferidas por
  pHash calculado na extensão (0.2.7)
- [x] "Cópia reduzida" só com a imagem conferida; imagens só parecidas vão
  para "a confirmar" (0.2.30)
- [x] Live Photos: quadro principal diferente no mesmo clique (instante ao
  milissegundo) conta como a mesma foto (0.2.31)
- [x] HEIC × JPG: ficha do arquivo do Google (formato, tamanho, nome) pelo
  cabeçalho do download; nome do arquivo como evidência; movimento da Live
  Photo lido da listagem do Google (0.2.32)
- [x] Versão atual das fotos editadas no iCloud (corte, filtro, quadro
  trocado): comparação e visualizador com a atual e o original (0.2.36)
- [x] Botões "São a mesma foto / São fotos diferentes" nos pares, com a
  decisão do usuário valendo como evidência (0.2.37)
- [x] Placar de identidade: instante, dimensões, imagem, nome e disputa, com os
  pontos de cada prova no visualizador e o filtro "poucas provas" (0.3.8)
- [x] Fusos horários: segunda passada pela hora local, a confirmar pela
  imagem (0.2.42)
- [x] Tratamento de rajadas: a foto mais parecida resolve a disputa no mesmo
  segundo quando ganha com folga; as ambíguas ficam para o usuário (0.3.9)
- [x] Estado "confirmada / provável / incerta", com resumo e filtro (0.2.39)
- [x] Sugestões do Google para parear à mão uma foto só do iCloud (0.2.49)

**Critério:** falso positivo abaixo de um limite definido na 0.2, numa amostra
revisada manualmente.

### 0.5 — Qualidade
- [x] Indicador da melhor cópia de cada foto (resolução, formato do arquivo do
  Google, movimento da Live Photo), com filtro na revisão e no plano de
  envio (0.2.38)
- [x] Redimensionamento pelos metadados: "cópia reduzida" pela proporção das
  dimensões, conferida pela imagem (0.2.30), e "menor no Google" na melhor
  cópia (0.2.38)
- [x] Live Photos que no Google estão sem o movimento: candidatas a reenvio a
  partir do iCloud, com o botão de envio (0.3.5); a cópia antiga do Google
  sai depois, na limpeza (0.8)
- [x] Recompressão: pelo tamanho do arquivo no mesmo formato e dimensões,
  provada por amostragem pelas tabelas de quantização dos originais (0.3.15)
- [x] Recorte e edição pela comparação de miniaturas (0.3.16)

### 0.6 — Classificação e painel de proteção
- [x] Regras baratas sobre metadados, com categoria, motivo e sugestão (0.2.8)
- [x] Marcação de decisão por item e em lote, na aba Revisão (0.2.8)
- [x] Miniaturas lado a lado na revisão (0.2.11) e visualizador grande com
  zoom e movimento sincronizados (0.2.27)
- [x] Revisão pelo celular, pelo Tailscale
- [x] Links copiáveis de cada foto, para mandar um caso e investigar (0.2.29)
- [x] Fotos só do Google: movimento, vídeo e nome do arquivo nas regras (0.2.44)
- [x] Resposta em números: fotos pessoais nos dois lugares sem perda, com a
  melhor cópia num lugar só, a confirmar e num lugar só (0.2.45)
- [x] Categorias documento e propaganda nas regras baratas (0.3.3)
- [x] Modelo visual local (CLIP) para o que as regras deixam como indefinido
  e para achar documentos e propagandas pela imagem (0.3.14)

**Critério:** responder com números "quais fotos pessoais estão nos dois lugares
com qualidade preservada". Marco de validação do uso pessoal.

### 0.7 — Envio curado nos dois sentidos
Caminho decidido em 18/11: pelo próprio site de cada serviço, sem instalar
nada ([docs/ENVIO.md](docs/ENVIO.md)).
- [x] Envia **somente** itens marcados Pessoal ou Manter; Pendente e Descartar
  nunca são copiados; fotos ocultas do iCloud nunca entram (0.3.4)
- [x] Envio de uma foto pelo visualizador, entregue ao mecanismo de envio do
  próprio site, nos dois sentidos, com ensaio sem enviar (0.3.5)
- [x] Conferência da chegada pelo inventário do destino (SHA-1 exato no
  Google) (0.3.6)
- [ ] Piloto do usuário ([docs/TESTES-HUMANOS.md](docs/TESTES-HUMANOS.md), E3–E9)
- [ ] Envio em lote, com pausa, retomada e parada no primeiro erro
- [ ] Conferência de cota antes de enviar, nos dois serviços
- [ ] Envio contínuo do que é novo (substitui o backup automático do celular)

### 0.8 — Sanitização guiada
- [x] Deduplicação nos dois serviços (0.2.15): arquivos idênticos pela
  impressão digital (iCloud) ou SHA-1 (Google), mesma imagem pelo pHash e
  candidatas de mesmo segundo; cópia de maior qualidade fica; revisão com a
  cópia ao lado da que fica e marcação em lote
- [x] Duplicatas candidatas do iCloud conferidas pelas miniaturas durante o
  percurso (0.2.23)
- [ ] Remoção das cópias aprovadas para a lixeira de cada serviço, só com
  confirmação explícita
- Listas de exclusão revisadas em lote, só para itens protegidos
- Quarentena pela lixeira do serviço e relatório do que foi feito

### 0.9 — Vídeos
- [x] Inventário: duração, codec, quadros por segundo e versão para assistir
  (iCloud); duração (Google); .m4v "unsupported" reconhecido pelo nome (0.3.17)
- [x] Identidade pela duração: confirma, desfaz trocas no mesmo segundo,
  reconhece câmera lenta; foto e vídeo nunca formam par (0.3.17)
- [x] Qualidade: ficha do arquivo de vídeo do Google (original, recomprimido,
  reduzido, cortado) e melhor cópia (0.3.17)
- [x] Envio pelo site até 300 MB, nos dois sentidos (0.3.17)
- [x] Painel "Vídeos" e visualizador com duração, codec e ficha (0.3.17)
- [ ] Piloto do envio de um vídeo (caso V3) e conferência da chegada
- [ ] Vídeos acima de 300 MB: envio sem passar o arquivo inteiro pela memória
- [ ] Assistir os dois lados no visualizador
- [ ] Quadros amostrados (pHash de quadros) para vídeos sem duração ou cortados

### 1.0 — Uso pessoal completo
- Biblioteca pessoal protegida e sanitizada, rotina de manutenção funcionando

## Backlog (sem etapa definida)

- Início automático do servidor do celular (opcional, aguarda decisão).
- Reler o álbum Ocultas para marcar as ocultas diretamente (hoje o percurso
  completo já as deixa de fora).
- Ficha do arquivo do Google para vídeos (`=dv`), se os vídeos entrarem no
  envio.
- Avaliar tornar o repositório privado antes da trilha de produto.

## Trilha de produto (paralela, a partir da 0.6)

| Alvo | Entrega |
|---|---|
| P1 | Página de apresentação, lista de espera e pesquisa de dor/preço |
| P2 | Análise jurídica (termos de serviço, LGPD) e das políticas das lojas de extensões |
| P3 | Teste com 5 a 10 pessoas próximas |
| P4 | Decisão de produto e modelo de receita (gratuito / faxina / guardião) |
| 2.0 | Primeira versão comercial, se P4 aprovar |
