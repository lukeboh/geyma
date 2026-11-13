# Changelog

Formato: versão, data (America/Sao_Paulo), mudanças e verificação.

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
