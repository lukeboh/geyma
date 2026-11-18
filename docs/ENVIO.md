# Envio curado (etapa 0.7)

Decisão do usuário em 18/11/2026: **enviar pelo próprio site de cada serviço,
sem instalar nada no notebook.** Este documento registra como isso funciona,
o que já foi conferido e o que falta. O roteiro do piloto está em
[TESTES-HUMANOS.md](TESTES-HUMANOS.md).

## Regras que valem sempre

- Só vai o que está marcado Pessoal ou Manter (marcação do usuário ou
  sugestão). Pendente e Descartar nunca vão.
- Fotos ocultas do iCloud e itens fora da biblioteca principal nunca vão.
- Cópias repetidas não vão; de cada foto vai a melhor cópia.
- Vídeos ficam para a etapa 0.9.
- Uma foto por vez, parando no primeiro erro. Nada é enviado sem um clique
  do usuário.

## Como funciona

1. No visualizador, uma foto que pode ir mostra **"Enviar ao Google Fotos"**
   ou **"Enviar ao iCloud"** (atalho E) e **"Só baixar e conferir"** (ensaio:
   baixa e confere, não envia).
2. A extensão baixa o arquivo do serviço de origem:
   - **iCloud:** o original (HEIC, JPEG, RAW...) pelo link que o próprio site
     entrega; numa Live Photo, também o vídeo do clique (o par HEIC + MOV com
     o mesmo nome); numa foto editada, a versão atual em JPEG. Os links da
     Apple vencem em uns 15 minutos: se preciso, a extensão renova o link
     rolando a grade do site até a foto (sem consultas próprias).
   - **Google:** o arquivo guardado (`=d`), com o nome da ficha.
3. A extensão passa os bytes, em pedaços, ao script do Geyma na página do
   outro serviço, que os entrega **ao mecanismo de envio do próprio site**:
   - **iCloud:** ao campo de envio fixo do app de Fotos
     (`input.UploadHiddenInput`, no iframe), o mesmo do botão de envio. Ele
     aceita HEIC, JPEG, PNG, MOV e MP4, vários de uma vez.
   - **Google Fotos:** o campo de envio só existe depois de abrir o menu
     "Criar e adicionar fotos"; por isso os arquivos são entregues como se
     fossem arrastados para a página (o Google Fotos aceita arrastar arquivos
     em qualquer lugar).
4. Quem envia é o código do site. O Geyma não escreve em nenhuma API.
5. **Chegada:** a cada cruzamento, o Geyma procura o que enviou no
   inventário do destino.
   - **Ao Google:** pelo SHA-1 do arquivo enviado, que o Google informa na
     listagem. É exato: o SHA-1 do original do iCloud bateu com o do Google em
     2 de 2 fotos guardadas nos dois serviços (18/11).
   - **Ao iCloud:** por uma foto do mesmo instante vista depois do envio.

## O que já foi conferido (18/11, sem enviar nada)

- O campo de envio do iCloud existe e fica fixo na página.
- O Google Fotos não tem campo fixo (só o botão "Criar e adicionar fotos").
- Ensaio Google: original baixado, com nome e formato.
- Ensaio iCloud: Live Photo com o link renovado em 9 s e o par HEIC + MOV
  baixado.
- O download `=d` do Google **não** é idêntico ao arquivo guardado: o Google
  reescreve metadados (de 4 a 8 bytes de diferença), e o SHA-1 não confere.
  A foto é a mesma; só os metadados mudam.

## Pontos que só o piloto responde

- Se o site aceita os arquivos entregues pelo Geyma (campo no iCloud,
  arrastar no Google) e conclui o envio.
- **Data:** se o destino usa a data da foto (EXIF) e a põe no lugar certo da
  linha do tempo. Fotos sem EXIF (digitalizadas, recebidas) podem aparecer
  com a data do envio. A extensão entrega o arquivo com a data da foto como
  "data de modificação", o que alguns sites usam quando falta o EXIF.
- **Live Photo:** se o Google junta o par HEIC + MOV numa foto com movimento.
- **Localização:** se vem junto (está no EXIF do original).
- Se a sessão do iCloud continua firme depois de alguns envios (no iCloud,
  enviar sai do modo só leitura; por isso, uma foto por vez no começo).

## Depois do piloto

- Envio em lote a partir da lista da revisão, com pausa entre as fotos e
  parada no primeiro erro.
- Conferência de cota antes de enviar.
- Envio contínuo do que é novo (substitui o backup automático do celular).

## Caminhos considerados e deixados de lado

- **Pasta local + programas oficiais** (Google Drive para computador, iCloud
  para Windows): exige instalar e manter programas; o usuário prefere não.
- **Google Photos Library API:** exige projeto no Google Cloud e só resolve
  um sentido; não junta Live Photos.
- **Transferências oficiais** (privacy.apple.com, Google Takeout): copiam
  tudo, sem curadoria.
- **Imitar as chamadas internas de envio dos sites:** protocolo não
  documentado; o caminho escolhido evita isso entregando o arquivo ao próprio
  site.
