# Extensão Geyma (Chrome / Edge)

Inventário local do Google Fotos e do iCloud Fotos. A extensão usa as sessões
que você já tem abertas no navegador. Não copia, não altera e não apaga nada nos
serviços, e os dados ficam só neste navegador (IndexedDB da extensão).

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` (no Edge: `edge://extensions`).
2. Ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `extension/` deste
   repositório.
4. Fixe o ícone do Geyma na barra e clique nele para abrir o painel.

Depois de atualizar o código, clique em **Recarregar** no cartão da extensão e
recarregue as abas do Google Fotos e do iCloud.

## Usar

1. Entre no [Google Fotos](https://photos.google.com/) e no
   [iCloud Fotos](https://www.icloud.com/photos/) no mesmo navegador.
2. No painel, **Ler catálogo** do Google: a leitura roda na aba do Google Fotos,
   inclusive em segundo plano, a ~300 itens por chamada.
3. **Percorrer biblioteca** do iCloud: a extensão rola a grade da aba do iCloud
   como uma pessoa. A aba precisa ficar **visível**; se ficar oculta, a leitura
   espera. Qualquer erro do servidor da Apple interrompe a leitura na hora, sem
   nova tentativa. **Continuar de onde parou** retoma pela posição salva.
4. Mesmo sem comandos, o Geyma registra o que você navegar nos dois sites.

## Como funciona

| Arquivo | Papel |
|---|---|
| `src/page/hook.js` | Roda na página (world `MAIN`): observa as respostas do próprio site e executa a leitura |
| `src/page/relay.js` | Ponte entre a página e a extensão |
| `src/sw.js` | Service worker: normaliza, grava e encaminha comandos |
| `src/core/normalize.js` | Interpretação dos dados dos serviços (testada em `test/ext-normalize.test.mjs`) |
| `src/core/db.js` | Inventário em IndexedDB |
| `dashboard.*` | Painel |

O inventário guarda, por item: identificador, data de captura, fuso, dimensões,
SHA-1 do original (Google), tamanho, tipo, nome do arquivo, fingerprint e
marcações (iCloud). Não guarda URLs nem conteúdo das fotos.

## Limites conhecidos

- As interfaces lidas não são oficiais e podem mudar sem aviso.
- O iCloud exige a aba visível durante a leitura.
- O catálogo do Google não informa o nome do arquivo.
