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

O painel tem três etapas.

1. **Inventário**
   - Entre no [Google Fotos](https://photos.google.com/) e no
     [iCloud Fotos](https://www.icloud.com/photos/) no mesmo navegador.
   - **Ler catálogo** do Google: roda na aba do Google Fotos, inclusive em
     segundo plano.
   - **Percorrer biblioteca** do iCloud: a extensão põe a aba do iCloud numa
     janela própria, reduz o tamanho das miniaturas do site e rola a grade como
     uma pessoa. A janela precisa ficar **visível** (sem nada por cima; tela
     bloqueada também pausa). Um erro do servidor da Apple interrompe a leitura
     na hora. **Continuar de onde parou** retoma pela posição salva.
2. **Proteção**
   - Frase-resumo, situação de cada foto (Em ambos, A confirmar, Cópia
     reduzida, Só no Google, Só no iCloud) e gráfico por ano.
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
     confirmação. Marcar só registra a sua decisão aqui.
   - Exportação em CSV.

## Como funciona

| Arquivo | Papel |
|---|---|
| `src/page/hook.js` | Roda na página (world `MAIN`, também no iframe do app de Fotos do iCloud): observa as respostas do próprio site, lê o catálogo do Google, percorre a grade do iCloud e baixa miniaturas do Google para o pHash |
| `src/page/relay.js` | Ponte entre a página e a extensão |
| `src/sw.js` | Service worker: normaliza, grava, calcula o pHash e encaminha comandos |
| `src/core/normalize.js` | Interpretação dos dados dos serviços |
| `src/core/match.js` | Motor de identidade: cruzamento, cópias reduzidas, duplicatas |
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

## Limites conhecidos

- As interfaces lidas não são oficiais e podem mudar sem aviso.
- O iCloud exige a janela visível durante o percurso.
- O catálogo do Google não informa o nome nem o tamanho do arquivo.
- A classificação é por regras; o que elas não resolvem fica Indefinido
  (Pendente) até a revisão ou um modelo visual local.
