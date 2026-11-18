# Envio curado (etapa 0.7): caminhos e proposta

Documento de decisão, escrito em 18/11/2026 para o usuário escolher o caminho.
Nada foi enviado. O Geyma já sabe **o que** enviar (plano de envio na aba
Proteção); falta decidir **como**.

## Regras que valem para qualquer caminho

- Só entra o que está marcado Pessoal ou Manter (marcação do usuário ou
  sugestão). Pendente e Descartar nunca vão.
- Fotos ocultas do iCloud e itens fora da biblioteca principal nunca vão.
- Cópias repetidas não vão; de cada foto vai a melhor cópia (0.2.38).
- Lotes pequenos, com retomada; o Geyma confere a chegada pelo inventário do
  outro serviço antes de considerar o item enviado.
- Primeiro um piloto com poucas fotos escolhidas pelo usuário.

## O que precisa ser feito

| Sentido | O que vai | De onde vem o arquivo |
|---|---|---|
| iCloud → Google | fotos que só estão no iCloud e originais que o Google guarda pior (menor, convertida, sem o movimento) | original do iCloud: o próprio site entrega o link do original (`resOriginalRes`) junto com os registros que a extensão já lê |
| Google → iCloud | fotos que só estão no Google (sobretudo os anos antigos) | original do Google: `=d` com a sessão entrega o arquivo guardado (mesmo SHA-1 do original, conferido) |

## Caminhos

### A. Pasta local + cliente oficial de cada serviço (proposta)

A extensão baixa os originais em lotes para uma pasta do notebook, com
`chrome.downloads`, e um programa oficial sobe:

- **Google:** o Google Drive para computador (já instalado) tem a opção de
  fazer backup de uma pasta para o Google Fotos.
- **iCloud:** o iCloud para Windows (não instalado; vem da Microsoft Store)
  tem a pasta de envio do iCloud Fotos.

Prós: nenhuma escrita por API não documentada; quem envia é o programa
oficial; o Geyma não precisa de senha nem de credenciais novas; dá para
pausar fechando o programa. A chegada é conferida pelo inventário.
Contras: precisa de espaço temporário (lotes de poucos GB; o disco E: tem
folga) e de apagar a pasta depois de conferida a chegada; instalar o iCloud
para Windows. A ponto de confirmar no piloto: se cada cliente junta a foto e o
vídeo de uma Live Photo (HEIC + MOV com o mesmo nome) numa Live Photo.

### B. Google Photos Library API (só iCloud → Google)

Envio oficial por API (`photoslibrary.appendonly`): sobe os bytes e cria os
itens em lotes de até 50. Desde 2025 a API só lê o que o próprio app criou,
o que não atrapalha o envio.
Contras: exige criar um projeto no Google Cloud com tela de consentimento
(modo de teste basta para uso pessoal); não junta Live Photos; não resolve o
sentido Google → iCloud.

### C. Envio pela página de cada serviço (sessão do navegador)

A extensão imitaria o arrastar arquivos para photos.google.com e para
icloud.com.
Contras: escrita por protocolo não documentado; no iCloud contraria a regra
de só ler em modo passivo (a sessão da Apple já caiu uma vez). **Não
recomendado.**

### D. Transferências oficiais entre os serviços

A Apple e o Google oferecem transferir uma cópia da biblioteca de um para o
outro (privacy.apple.com e Google Takeout).
Contras: copiam tudo (ou álbuns inteiros), sem a curadoria; trariam o lixo e
as duplicatas de volta. Úteis só se o usuário montar um álbum com o que deve
ir, e mesmo assim sem conferência item a item.

## Proposta

1. **Caminho A nos dois sentidos**, começando por **Google → iCloud** só
   depois de instalar o iCloud para Windows, e por **iCloud → Google** já com
   o Drive para computador.
2. **Piloto:** 10 fotos escolhidas pelo usuário em cada sentido, incluindo
   uma Live Photo e uma foto editada; conferir no inventário e no celular.
3. Depois do piloto, lotes de cerca de 2 GB, com a pasta limpa a cada lote
   conferido.

## O que o usuário precisa decidir

- Aprovar o caminho A (ou escolher outro).
- Instalar o iCloud para Windows (para o sentido Google → iCloud).
- Escolher a pasta temporária (sugestão: no disco E:).
- Vídeos: entram agora ou depois (concentram quase todo o volume).
