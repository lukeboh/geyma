# Roadmap do Geyma

Estratégia e justificativas em [docs/ESTRATEGIA.md](docs/ESTRATEGIA.md).
Versão atual em [VERSION](VERSION) e histórico em [CHANGELOG.md](CHANGELOG.md).
Versionamento: MAJOR.MINOR.PATCH. PATCH a cada commit de trabalho; MINOR ao
concluir e validar uma etapa. Os números futuros são alvos.

## Concluído

| Versão | Entrega |
|---|---|
| 0.1.0 | Protótipo client-side: Picker do Google, pasta local da Apple, comparação por nome e data, painel com estimativas (registro retroativo, sem tag) |

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

### 0.3 — Extensão e inventário *(em andamento)*
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
- [ ] Exercitar "Continuar de onde parou" depois da correção da posição salva
  (0.2.22): último item para marcar 0.3.0

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
- Placar de identidade: instante, dimensões, hash perceptual, hash exato quando
  houver, nome como evidência
- [x] Fusos horários: segunda passada pela hora local, a confirmar pela
  imagem (0.2.42)
- Tratamento de rajadas
- [x] Estado "confirmada / provável / incerta", com resumo e filtro (0.2.39)

**Critério:** falso positivo abaixo de um limite definido na 0.2, numa amostra
revisada manualmente.

### 0.5 — Qualidade
- [x] Indicador da melhor cópia de cada foto (resolução, formato do arquivo do
  Google, movimento da Live Photo), com filtro na revisão e no plano de
  envio (0.2.38)
- Redimensionamento pelos metadados
- Recorte, edição e recompressão pela comparação de miniaturas e, por amostragem,
  dos originais
- Indicador da melhor cópia de cada foto, usando a ficha do arquivo do Google
  (original, convertido, reduzido) e o movimento das Live Photos
- Live Photos que no Google estão sem o movimento: candidatas a envio a
  partir do iCloud

### 0.6 — Classificação e painel de proteção
- [x] Regras baratas sobre metadados, com categoria, motivo e sugestão (0.2.8)
- [x] Marcação de decisão por item e em lote, na aba Revisão (0.2.8)
- [x] Miniaturas lado a lado na revisão (0.2.11) e visualizador grande com
  zoom e movimento sincronizados (0.2.27)
- [x] Revisão pelo celular, pelo Tailscale
- [x] Links copiáveis de cada foto, para mandar um caso e investigar (0.2.29)
- [x] Fotos só do Google: movimento, vídeo e nome do arquivo nas regras (0.2.44)
- [ ] Modelo visual local para o que as regras deixam como indefinido
- Marcações da Apple, regras baratas e modelo visual local (CLIP)
- Categorias: pessoal, print, internet, propaganda, documento, indefinido
  (indefinido conta como pessoal)
- **Marcação de decisão** por item: Pessoal, Pendente, Manter, Descartar
  (suspeita de lixo e indefinido entram como Pendente)
- Painel "protegida" com motivos e **revisão em lote** dos Pendentes

**Critério:** responder com números "quais fotos pessoais estão nos dois lugares
com qualidade preservada". Marco de validação do uso pessoal.

### 0.7 — Envio curado nos dois sentidos
Caminhos e proposta em [docs/ENVIO.md](docs/ENVIO.md) (aguarda decisão).
- Envia **somente** itens marcados Pessoal ou Manter; Pendente e Descartar nunca
  são copiados; fotos ocultas do iCloud nunca entram (decisão de 16/11)
- Google Photos Library API (escopo de envio), em lotes, em fluxo, com retomada
- Google → iCloud: escolher o caminho (transferência oficial, pasta de envio do
  iCloud para Windows ou página do iCloud.com)
- Conferência de cota antes de enviar, nos dois serviços
- Envio contínuo do que é novo (substitui o backup automático do celular)

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
- Inventário, identidade (duração, codec, quadros amostrados), qualidade e envio

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
