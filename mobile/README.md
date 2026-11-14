# Geyma no celular

Mostra no celular o que a extensão já processou no Chrome do notebook: resumo
da proteção, plano de envio, "pessoal ou lixo", cópias repetidas, situação das
leituras e a revisão com miniaturas, com marcação (Pessoal, Pendente, Manter,
Descartar). Marcar só grava a decisão no inventário da extensão; nada muda nos
serviços.

## Como funciona

- `servidor.mjs` (Node, sem dependências) escuta só em `127.0.0.1:8765` e
  conversa com a extensão pela porta de depuração 9222 do Chrome de automação
  (`window.geymaApi`, em `extension/mobile-api.js`). Se o painel não estiver
  aberto, ele abre um.
- O acesso de fora é pelo `tailscale serve`, **só dentro da sua rede
  Tailscale** (nada na internet), em `http://<nome-do-notebook>.<tailnet>.ts.net:8080`.
- Senha de acesso: um token aleatório guardado fora do repositório, em
  `%LOCALAPPDATA%\geyma\celular.json`. O primeiro acesso usa o link com o token,
  que vira um cookie no celular. Para trocar: `node mobile/servidor.mjs --novo-token`.
- As miniaturas passam pelo notebook, que tem as sessões abertas; o celular não
  precisa estar logado no Google nem na Apple. Só domínios de imagem dos dois
  serviços são aceitos.

## Usar

1. No notebook: `powershell -NoProfile -ExecutionPolicy Bypass -File mobile\iniciar.ps1`
   (inicia em segundo plano, sem janela, e publica na rede Tailscale; mostra o
   link de acesso). Log em `%LOCALAPPDATA%\geyma\celular.log`.
2. No celular, com o Tailscale ligado, abra o link uma vez. Depois basta
   `http://<nome-do-notebook>.<tailnet>.ts.net:8080/`. No iPhone, "Compartilhar →
   Adicionar à Tela de Início" deixa o Geyma como um app.
3. Para desligar o acesso: `tailscale serve --http=8080 off` e encerre o
   processo `node` do servidor.

Requisitos: notebook ligado e sem suspender, Chrome de automação aberto com a
extensão. Ver e marcar funcionam com a tela bloqueada; o percurso do iCloud
continua exigindo a tela desbloqueada no notebook.

## Telas

- **Resumo:** frase-resumo, situação das fotos, plano de envio e categorias
  (toque num cartão para revisar aquele grupo).
- **Revisar:** filtros, grade de miniaturas (toque seleciona; segure para ver
  detalhes e marcar uma foto; "Abrir no Google Fotos"), marcação das
  selecionadas ou do resto da página, com confirmação.
- **Cópias:** cópias repetidas no Google e no iCloud.
- **Leituras:** andamento das leituras no notebook (atualiza sozinha) e
  recálculo do cruzamento.
