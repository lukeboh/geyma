# Extensão Geyma (Chrome / Edge)

Inventário local do Google Fotos e do iCloud Fotos, cruzamento das duas
bibliotecas e revisão do que é pessoal e do que é lixo. A extensão usa as
sessões que você já tem abertas no navegador. Não copia, não altera e não apaga
nada nos serviços, e os dados ficam só neste navegador (IndexedDB da extensão).

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` (no Edge: `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extension/` deste
   repositório.
4. Fixe o ícone do Geyma na barra e clique nele para abrir o painel.

Depois de atualizar o código, clique em **Recarregar** no cartão da extensão e
recarregue a aba do Google Fotos. Recarregue a aba do iCloud só se for
percorrer a biblioteca de novo (uma vez; recarregar várias vezes já derrubou a
sessão da Apple).

## Usar

O painel tem três etapas. Na primeira visita a cada uma, um **guia passo a
passo** explica a tela; o botão **?** do topo repete o guia.

1. **Inventário**
   - Entre no [Google Fotos](https://photos.google.com/) e no
     [iCloud Fotos](https://www.icloud.com/photos/) no mesmo navegador.
   - **Ler catálogo** do Google: roda na aba do Google Fotos, inclusive em
     segundo plano.
   - **Percorrer biblioteca** do iCloud: a extensão põe a aba do iCloud numa
     janela própria, reduz o tamanho das miniaturas do site e rola a grade como
     uma pessoa. Funciona com a janela coberta ou a tela
     bloqueada: a extensão liga a emulação de foco do Chrome na aba (permissão
     `debugger`; o Chrome mostra o aviso de depuração enquanto roda) e impede o
     notebook de dormir (permissão `power`). Um erro do servidor da Apple interrompe a leitura
     na hora. **Continuar de onde parou** retoma pela posição salva.
2. **Proteção**
   - Frase-resumo, certeza de que cada par é a mesma foto (confirmada,
     provável, incerta) e a resposta central: das fotos pessoais, quantas
     estão nos dois lugares sem perda.
   - **O que fazer agora**: os próximos passos, com a contagem e um botão.
   - Situação de cada foto (Em ambos, A confirmar, Cópia reduzida, Só no
     Google, Só no iCloud) e gráfico por ano.
   - **Como o Google guarda as suas fotos**: Live Photos com e sem o
     movimento, arquivos originais ou convertidos e a **melhor cópia** de
     cada par.
   - **Pessoal ou lixo?**: contagem por categoria.
   - **Plano de envio (prévia)**: o que seria copiado em cada sentido com as
     marcações de agora, com quantidade e espaço.
   - **Possíveis duplicatas no Google** e **Conferir pelas miniaturas**: baixa
     uma miniatura pequena de cada item suspeito pela sessão do Google e compara
     as imagens (pHash).
3. **Revisão**
   - Filtros por situação, categoria, marcação, ano e tipo; miniaturas dos dois
     lados (clique na do Google para abrir a foto no Google Fotos).
   - Marcação por linha ou em lote (Pessoal, Pendente, Manter, Descartar), com
     confirmação e o espaço que os itens ocupam. Marcar só registra a sua
     decisão aqui.
   - **Visualizador** (clique numa miniatura): as fotos lado a lado, com zoom
     e movimento juntos. Numa foto editada no iPhone, mostra a versão atual
     do iCloud ao lado do original. Pergunta **"São a mesma foto?"** (atalhos
     M, D e Z para desfazer); ‹ › ou Page Up/Down andam pela lista, e depois
     de responder ele passa sozinho para a próxima. Numa foto só do iCloud,
     sugere fotos do Google que podem ser a mesma (outro horário).
   - Exportação em CSV.

## Como funciona

| Arquivo | Papel |
|---|---|
| `src/page/hook.js` | Roda na página (world `MAIN`, também no iframe do app de Fotos do iCloud): observa as respostas do próprio site, lê o catálogo do Google, percorre a grade do iCloud e baixa miniaturas do Google para o pHash |
| `src/page/relay.js` | Ponte entre a página e a extensão |
| `src/sw.js` | Service worker: normaliza, grava, calcula o pHash e encaminha comandos |
| `src/core/normalize.js` | Interpretação dos dados dos serviços |
| `src/core/match.js` | Motor de identidade: cruzamento, cópias reduzidas, duplicatas, fuso horário, veredito do usuário e certeza |
| `src/core/qualidade.js`, `protecao.js`, `passos.js` | Melhor cópia, fotos pessoais protegidas e próximos passos |
| `src/core/veredito.js`, `sugestoes.js` | "São a mesma foto?" e sugestões para parear à mão |
| `src/core/phash.js` | Hash perceptual igual ao da biblioteca Python imagehash |
| `src/core/classify.js` | Categorias por regras e sugestão de marcação |
| `src/core/db.js` | Inventário em IndexedDB (gravação mescla com o registro existente) |
| `src/match-worker.js` | Cruzamento em segundo plano para o painel |
| `dashboard.*`, `protection.js` | Painel |

O inventário guarda, por item: identificador, data de captura, fuso, dimensões,
SHA-1 do original (Google), tamanho, tipo, nome do arquivo e marcações da Apple
(iCloud), URL da miniatura (a do Google só abre com a sessão; a do iCloud é
temporária), pHash e a sua marcação. Não guarda o conteúdo das fotos.

Testes: `node --test test/*.test.mjs` na raiz do repositório.

## Visual

Aurora azul ao fundo, vidro "tátil" (cartões translúcidos que inclinam de leve
e acendem um reflexo sob o ponteiro) e pílulas, na linguagem do Urna Velox.
Tema escuro e claro (botão ◐; sem escolha, segue o sistema). Movimento
reduzido do sistema é respeitado. Fonte: **Archivo** (variável), licença SIL
Open Font License, embutida em `assets/archivo.woff2`.

## Limites conhecidos

- As interfaces lidas não são oficiais e podem mudar sem aviso.
- O percurso do iCloud depende da emulação de foco (protocolo de depuração do
  Chrome); se o aviso de depuração for cancelado, ele espera a aba visível.
- O catálogo do Google não informa o nome nem o tamanho do arquivo; a ficha
  do arquivo (cabeçalho do download) traz os dois, mas não vale para vídeos.
- A classificação é por regras; o que elas não resolvem fica Indefinido
  (Pendente) até a revisão ou um modelo visual local.
