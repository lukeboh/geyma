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

### 0.2 — Prova de acesso *(em andamento)*
- [x] Leitura do catálogo do iCloud e do Google pela sessão web (0.1.1)
- [x] Leitura passiva do iCloud, sem erro do servidor (0.1.1)
- [ ] Teste de casamento num período comum aos dois serviços
- [ ] Confirmar a natureza do campo de 27 caracteres do Google (hash do original?)
- [ ] Medir o total do Google e as miniaturas
- [ ] Decidir a arquitetura: extensão de navegador (recomendada) × programa local

**Critério:** pares confirmados por instante, dimensão e hash perceptual numa
amostra, com a taxa de falso positivo medida contra um controle.

### 0.3 — Extensão e inventário
- Esqueleto da extensão (Chrome/Edge, MV3) com o núcleo atual reaproveitado
- Conectores Google e iCloud com ritmo humano, parada no primeiro erro e retomada
- Índice local: metadados, miniatura processada e impressão digital; sem guardar
  fotos
- Contagem por categoria nos dois lados

**Critério:** inventário completo dos dois lados, retomável, sem queda de sessão.

### 0.4 — Identidade
- Placar de identidade: instante, dimensões, hash perceptual, hash exato quando
  houver, nome como evidência
- Tratamento de rajadas, Live Photos, HEIC × JPG e fusos horários
- Estado "confirmada / provável / incerta"

**Critério:** falso positivo abaixo de um limite definido na 0.2, numa amostra
revisada manualmente.

### 0.5 — Qualidade
- Redimensionamento pelos metadados
- Recorte, edição e recompressão pela comparação de miniaturas e, por amostragem,
  dos originais
- Indicador da melhor cópia de cada foto

### 0.6 — Classificação e painel de proteção
- Marcações da Apple, regras baratas e modelo visual local (CLIP)
- Categorias: pessoal, print, internet, propaganda, documento, indefinido
  (indefinido conta como pessoal)
- **Marcação de decisão** por item: Pessoal, Pendente, Manter, Descartar
  (suspeita de lixo e indefinido entram como Pendente)
- Painel "protegida" com motivos e **revisão em lote** dos Pendentes

**Critério:** responder com números "quais fotos pessoais estão nos dois lugares
com qualidade preservada". Marco de validação do uso pessoal.

### 0.7 — Envio curado iCloud → Google
- Envia **somente** itens marcados Pessoal ou Manter; Pendente e Descartar nunca
  são copiados
- Google Photos Library API (escopo de envio), em lotes, em fluxo, com retomada
- Conferência de cota antes de enviar
- Envio contínuo do que é novo (substitui o backup automático do celular)

### 0.8 — Sanitização guiada
- Listas de exclusão revisadas em lote, só para itens protegidos
- Quarentena pela lixeira do serviço e relatório do que foi feito

### 0.9 — Vídeos
- Inventário, identidade (duração, codec, quadros amostrados), qualidade e envio

### 1.0 — Uso pessoal completo
- Biblioteca pessoal protegida e sanitizada, rotina de manutenção funcionando

## Trilha de produto (paralela, a partir da 0.6)

| Alvo | Entrega |
|---|---|
| P1 | Página de apresentação, lista de espera e pesquisa de dor/preço |
| P2 | Análise jurídica (termos de serviço, LGPD) e das políticas das lojas de extensões |
| P3 | Teste com 5 a 10 pessoas próximas |
| P4 | Decisão de produto e modelo de receita (gratuito / faxina / guardião) |
| 2.0 | Primeira versão comercial, se P4 aprovar |
