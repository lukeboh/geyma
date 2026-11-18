# Testes humanos

Casos que só uma pessoa consegue conferir: olhar a foto, abrir o celular,
decidir se algo está certo. Faça **um por vez**, na ordem. Marque o resultado
na caixa e anote o que viu em "Observado"; quando algo falhar, o link da
foto ("Copiar link" no visualizador) basta para investigar.

Antes de começar: Chrome com o painel do Geyma aberto, as abas do iCloud
Fotos e do Google Fotos abertas e carregadas, e um cruzamento recente.

Legenda: ☐ não testado · ✅ passou · ❌ falhou · ➖ não se aplica.

---

## 1. Envio pelo site (0.7)

Os casos E1 e E2 não enviam nada. A partir do E3, **cada caso envia uma
foto de verdade**; se algo der errado, a foto enviada pode ser apagada no
próprio serviço.

### E1 — Ensaio iCloud → Google ☐
1. Revisão → filtro "Só no iCloud" → abra uma foto marcada Pessoal (de
   preferência uma Live Photo).
2. Clique **Só baixar e conferir**.

**Esperado:** em até uns 15 s, "Conferido, nada enviado: IMG_xxxx.HEIC +
IMG_xxxx.MOV, N MB". Nada aparece no Google.
Observado:

### E2 — Ensaio Google → iCloud ☐
1. Revisão → filtro "Só no Google" → abra uma foto marcada Pessoal.
2. Clique **Só baixar e conferir**.

**Esperado:** "Conferido, nada enviado: <nome>, N MB".
Observado:

### E3 — Piloto: 1 foto parada, iCloud → Google ☐
1. Escolha uma foto só do iCloud, **sem edição e que não seja Live Photo**.
   Copie o link dela.
2. Clique **Enviar ao Google Fotos** (ou tecle E).
3. Vá para a aba do Google Fotos.

**Esperado:**
- O visualizador diz "Entregue ao site do Google Fotos (como arrastar
  arquivos)".
- O Google Fotos mostra o envio em andamento e depois a foto.
- No Google, a foto aparece **na data em que foi tirada** (não hoje) e com
  a localização, se tinha.
- Depois de ler o catálogo do Google ("Ler catálogo") e do cruzamento, a foto passa a "Em ambos", e o visualizador diz "Envio ao Google Fotos: chegou ao destino".

Observado (data no Google, localização, tempo do envio):

### E4 — Live Photo, iCloud → Google ☐
Como o E3, com uma Live Photo sem edição.

**Esperado:** no app do Google Fotos no celular, a foto **tem movimento**
(o Google juntou HEIC + MOV). Se vierem dois itens separados (uma foto e um
vídeo), anote: muda o jeito de enviar Live Photos.
Observado:

### E5 — Foto editada, iCloud → Google ☐
Como o E3, com uma foto editada no iPhone (o visualizador mostra "como está
agora (editada)" e o original ao lado).

**Esperado:** o Google recebe a **versão editada** (JPEG), com a data certa.
Observado:

### E6 — Piloto: 1 foto, Google → iCloud ☐
1. Escolha uma foto só do Google, de câmera, recente (de 2015 em diante).
2. Deixe a aba do iCloud Fotos aberta e carregada.
3. Clique **Enviar ao iCloud**.

**Esperado:**
- O visualizador diz "Entregue ao site do iCloud (pelo campo de envio)".
- A aba do iCloud mostra o envio e depois a foto, **na data em que foi
  tirada**.
- A sessão do iCloud continua aberta (sem pedir login de novo).
- No próximo percurso do iCloud, o visualizador diz "chegou ao destino".

Observado (data no iCloud, sessão):

### E7 — Foto antiga sem dados de câmera, Google → iCloud ☐
Como o E6, com uma foto antiga digitalizada ou recebida (sem EXIF).

**Esperado:** o iCloud põe a foto na data dela. **Se aparecer com a data de
hoje**, anote: fotos assim vão precisar de outro tratamento antes do lote.
Observado:

### E8 — Sem a aba de destino ☐
1. Feche a aba do iCloud Fotos.
2. Tente **Enviar ao iCloud** numa foto só do Google.

**Esperado:** o Geyma abre o iCloud Fotos; se o site ainda não tiver
carregado, aparece "não achei o campo de envio na página (abra o site e
espere carregar)" e nada é enviado. Tentar de novo depois de carregar
funciona.
Observado:

### E9 — O que não pode ir não tem botão ☐
Abra uma foto **Pendente** (por exemplo, uma captura de tela), uma marcada
**Descartar** e uma que **já está nos dois** serviços.

**Esperado:** nenhuma delas mostra "Enviar ao…".
Observado:

### E10 — Envio em lote (só depois de E3 a E7 darem certo) ☐
1. Revisão → Situação "Só no iCloud" (ou "Só no Google").
2. A barra "Enviar ao … as próximas N fotos" aparece acima da lista.
3. Clique **Enviar N** e depois **Confirmar o envio de N fotos**.

**Esperado:** "Enviando 1 de N…", uma foto a cada poucos segundos; o botão
**Parar** interrompe entre uma foto e outra; ao fim, "N foto(s) entregue(s)".
Nenhuma foto Pendente, vídeo ou repetida vai. No próximo cruzamento, as que
chegaram somem da lista.
Observado:

### E11 — Lote com pausa e cota ☐
1. Revisão → "Só no iCloud" → **Tamanho do lote** "até 50" → **Enviar 50**.
2. O texto mostra o tamanho do lote e o espaço livre do Google. Confirme.
3. Depois de uns itens, **Pausar**. Feche o painel e abra de novo.
4. Revisão → a barra diz "Lote ao Google Fotos: N de 50 enviados; pausado"
   → **Continuar**.

**Esperado:** o envio retoma de onde parou, sem repetir; **Descartar o
lote** volta à barra normal. Faça o mesmo no sentido Google → iCloud (recarregue
a aba do iCloud antes, para o Geyma ver o espaço livre).
Observado:

### E12 — Envio contínuo (só depois de E11) ☐
1. Proteção → **Envio contínuo do que é novo** → deixe a data de hoje e
   marque **Ligado**.
2. Tire duas fotos no iPhone e espere elas aparecerem no iCloud.com.
3. **Verificar agora** e acompanhe o texto do bloco.

**Esperado:** "Lendo as novidades do Google…", "Recarregando a aba do
iCloud Fotos…", "Refazendo o cruzamento…" e o envio das duas fotos ao
Google; o último ciclo diz quantas foram. Nada anterior à data vai.
Desligue ao fim, se não quiser deixar ligado.
Observado:

---

## 2. Classificação (0.6)

### C1 — Documentos ☐
Revisão → categoria **Documento**.
**Esperado:** poucos itens (gravados pelo Office ou pelas Notas do iPhone),
todos de fato documentos ou papéis digitalizados.
Observado (quantos, quantos errados):

### C2 — Propaganda ☐
Revisão → categoria **Propaganda**.
**Esperado:** as imagens salvas de apps de loja são anúncios.
Observado:

### C4 — Gravações de tela ☐
Revisão → categoria "Captura de tela", Tipo "Só vídeos".
**Esperado:** as gravações de tela do iPhone (`ScreenRecording…`,
`RPReplay…`) estão aqui, e não em "Pessoal (câmera)".
Observado:

### C3 — Fotos digitalizadas continuam pessoais ☐
Procure fotos com nome `scan…` ou `SCANS_…` (fotos antigas digitalizadas).
**Esperado:** nenhuma está em Documento.
Observado:

### C5 — Classificação pela imagem (CLIP) ☐
Proteção → "Pessoal ou lixo?" → **Classificar pela imagem**. Na primeira vez
baixa o modelo (89 MB). Deixe passar as indefinidas (vão primeiro) e pare.
Depois, na Revisão, filtre cada categoria e procure no motivo "pela imagem".
**Esperado:**
- Documento, Captura de tela e Propaganda "pela imagem": de fato papéis,
  telas e anúncios (anote quantos de 20 estão errados).
- Pessoal "pela imagem" (eram indefinidas): fotos de câmera.
- Indefinido "pela imagem: incerta": casos ambíguos de verdade.
- O botão Parar para em poucos segundos; apertar de novo continua de onde
  parou.
Observado:

---

## 2b. Qualidade (0.5)

### Q1 — Recompressão no Google ☐
Proteção → "Como o Google guarda as suas fotos" → **Conferir os arquivos do
Google** (só cabeçalhos; pode demorar) e depois **Provar numa amostra pelos
originais**.
**Esperado:** a amostra diz "recomprimidas pelo Google" para quase todas.
Abra duas delas no visualizador (Google e iCloud lado a lado, com zoom): a
do Google pode mostrar menos detalhe ou blocos em áreas lisas. As fotos
"recomprimidas" aparecem com a melhor cópia no iCloud.
Observado:

### Q2 — Recortes e edições ☐
Proteção → "Como o Google guarda as suas fotos" → **Comparar recortes e
edições pelas miniaturas**. Depois, na Revisão, abra pares com o placar
"uma é recorte da outra" e "uma foi editada".
**Esperado:** no recorte, uma foto é de fato um pedaço da outra, e a melhor
cópia é a inteira. Na edição, a mesma cena com outro tom ou cor, e não outra
foto do mesmo segundo.
Observado:

## 2c. Vídeos (0.9)

### V0 — Chave Fotos | Vídeos | Tudo ☐
No topo do painel, troque entre **Fotos**, **Vídeos** e **Tudo** nas três
abas.
**Esperado:** no Inventário, o número grande e o gráfico por ano mudam (os
cartões mostram sempre "N fotos · M vídeos"); na Proteção, as classes, a
identidade, os passos e as duplicatas mudam, o bloco Vídeos só aparece em
Vídeos e Tudo, e os blocos só de fotos somem em Vídeos; na Revisão, a lista
mostra só o tipo escolhido. A escolha fica ao reabrir o painel.
Observado:

### V1 — Painel de vídeos e mesmo vídeo ☐
Proteção → bloco **Vídeos**. Abra "a confirmar" (vai à Revisão filtrada por
vídeos) e abra três pares no visualizador.
**Esperado:** os números fazem sentido para a sua biblioteca; nos pares, a
legenda mostra a duração dos dois lados e o placar diz "mesma duração" ou
"durações diferentes". Num par de durações diferentes, um vídeo é outro ou
foi cortado. Clique "▶ assistir" nos dois lados: os dois tocam, com som e
controles (o do Google em qualidade menor, 360 linhas).
Observado:

### V2 — Arquivos de vídeo do Google ☐
Bloco **Vídeos** → **Conferir os arquivos de vídeo do Google** (só
cabeçalhos; uns minutos). Depois abra, pelo link "Melhor cópia no iCloud",
dois vídeos.
**Esperado:** a legenda do Google mostra o nome, o formato e o tamanho do
arquivo; nos vídeos com a melhor cópia no iCloud, o do Google é menor
(recomprimido ou reduzido) ou mais curto. Assista no próprio Google Fotos
(link do visualizador) para conferir.
Observado:

### V4 — Quadros dos vídeos a confirmar ☐
Deixe a aba do iCloud Fotos visível (outra janela). Bloco **Vídeos** →
**Comparar quadros dos vídeos a confirmar**; depois de uns minutos,
**Parar**. Abra pela Revisão ("Mesma foto: confirmada", chave em Vídeos)
dois pares que acabaram de ser comparados.
**Esperado:** o andamento conta "iguais" e "diferentes"; nos pares, o
placar mostra "mesmos quadros"; assista os dois lados (▶ assistir): são o
mesmo vídeo. Um par desfeito por quadros diferentes vira dois itens, cada
um num serviço só.
Observado:

### V3 — Envio de um vídeo pequeno ☐
Marque como Pessoal um vídeo só do iCloud com menos de 300 MB. No
visualizador: **Ensaiar** e depois **Enviar ao Google**.
**Esperado:** o ensaio mostra o arquivo .MOV ou .MP4 com o tamanho do
original; o envio aparece no Google Fotos com a data certa e toca; na
próxima leitura do Google ele aparece como "chegou". Repita com um vídeo
grande (mais de 300 MB): o ensaio mostra o andamento ("baixando o vídeo do
iCloud", "conferindo o arquivo") e o notebook não fica lento. Faça também
um vídeo só do Google ao iCloud (Enviar ao iCloud): ele aparece no iCloud
com a data certa e toca.
Observado:

---

## 2d. Lixeira (0.8)

### L1 — Ensaio no Google ☐
Revisão → "Cópias repetidas no Google" → marque **Descartar** duas cópias
(abra antes para ver que a que fica é a melhor). Proteção → bloco
**Lixeira** → **Ensaiar com 1 no Google**.
**Esperado:** uma aba abre em segundo plano e fecha sozinha; "Ensaio certo:
a página da foto abriu com o botão…". Nada some do Google.
Observado:

### L2 — Mover uma cópia para a lixeira do Google ☐
Com só uma cópia marcada Descartar: **Mover 1 para a lixeira do Google** →
**Confirmar**.
**Esperado:** "1 movidos para a lixeira do Google"; no Google Fotos, a cópia
está na Lixeira (e pode ser restaurada), e a que fica continua na
biblioteca. O bloco diz "Já na lixeira pelo Geyma: 1 no Google".
Observado:

### L3 — Lista do iCloud ☐
Marque **Descartar** uma cópia repetida do iCloud. Bloco **Lixeira** →
**Lista para apagar no iCloud (CSV)**.
**Esperado:** o CSV abre no Excel com acentos certos e traz a data, o nome
e o tamanho; ache o item no app Fotos pela data e apague. No próximo
percurso completo do iCloud, ele sai da lista.
Observado:

---

## 3. Identidade (0.4)

### I1 — Taxa de erro do pareamento automático ☐
Este é o critério para fechar a etapa 0.4.
1. Revisão → filtro "Mesma foto: provável".
2. Responda **20 pares seguidos** com "São a mesma foto" (M) ou "São fotos
   diferentes" (D), sem pular.

**Esperado:** no máximo 1 par em 20 respondido como "diferentes".
Observado (quantos "diferentes" em 20):

### I2 — Pares incertos ☐
Revisão → filtro "Mesma foto: incerta" → responda 10 pares.
**Esperado:** o visualizador passa para o próximo depois de cada resposta;
o número de incertos cai depois do cruzamento.
Observado:

### I3 — Sugestões para fotos só do iCloud ☐
Abra fotos "Só no iCloud" até achar uma com sugestões do Google embaixo.
**Esperado:** quando a sugestão é a mesma foto, um clique junta as duas, e a
foto sai de "Só no iCloud".
Observado:

### I4 — Foto editada ☐
Abra uma foto editada no iPhone.
**Esperado:** duas imagens do iCloud, "como está agora (editada)" e
"original"; a editada carrega grande ao ampliar (pode levar uns 7 s quando
o link venceu).
Observado:

### I5 — Placar de identidade ☐
Abra alguns pares (filtro "Em ambos").
**Esperado:** sob as fotos, "Placar +N:" com as provas e os pontos de cada
uma (instante, dimensões, imagem, nome, outras fotos no mesmo segundo). As
provas batem com o que você vê nas fotos.
Observado:

### I6 — Pares com poucas provas ☐
Revisão → filtro **"Mesma foto: poucas provas (placar baixo)"** → responda
10 pares.
**Esperado:** são os pares mais duvidosos (fotos em sequência no mesmo
segundo, imagens só parecidas). Anote quantos eram mesmo a mesma foto: se
quase todos forem, o placar está pessimista demais.
Observado (mesma foto em quantos de 10):

### I7 — Fotos em sequência resolvidas pela imagem ☐
Procure, nos pares, um placar com "a mais parecida entre N fotos do Google
no mesmo segundo".
**Esperado:** a foto do Google mostrada é de fato a mesma (não a anterior ou
a seguinte da sequência). São poucos casos.
Observado:

---

## 4. Celular

### M1 — Revisão pelo celular ☐
1. No notebook: `mobile/iniciar.ps1`.
2. No celular (Tailscale ligado): abra o endereço mostrado.
3. Responda um par "São a mesma foto?".

**Esperado:** o cartão "O que fazer agora" aparece; a resposta vale no painel
do notebook depois do cruzamento.
Observado:

### M2 — Envio pelo celular ☐
Depois do E3 e do E6 darem certo no notebook.
1. No celular, abra uma foto "Só no iCloud" marcada Pessoal.
2. Toque **Só baixar e conferir** e depois **Enviar ao Google Fotos**.

**Esperado:** as mesmas mensagens do notebook; a foto aparece no Google.
Uma foto Pendente não mostra os botões.
Observado:

---

## 5. Google

### G1 — Fichas dos arquivos do Google ☐
Cartão "O que fazer agora" → ler as fichas dos arquivos que faltam.
**Esperado:** a leitura avança; se o Google der erro, ela para e diz qual
(a última parou num 500).
Observado:
