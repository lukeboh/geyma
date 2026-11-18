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

---

## 2. Classificação (0.6)

### C1 — Documentos ☐
Revisão → categoria **Documento**.
**Esperado:** poucos itens (gravados pelo Office ou pelas Notas do iPhone),
todos de fato documentos ou papéis digitalizados.
Observado (quantos, quantos errados):

### C2 — Propaganda ☐
Revisão → categoria **Propaganda**.
**Esperado:** a imagem salva da Shopee é um anúncio.
Observado:

### C3 — Fotos digitalizadas continuam pessoais ☐
Procure fotos com nome `scan…` ou `SCANS_…` (fotos antigas digitalizadas).
**Esperado:** nenhuma está em Documento.
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

---

## 4. Celular

### M1 — Revisão pelo celular ☐
1. No notebook: `mobile/iniciar.ps1`.
2. No celular (Tailscale ligado): abra o endereço mostrado.
3. Responda um par "São a mesma foto?".

**Esperado:** o cartão "O que fazer agora" aparece; a resposta vale no painel
do notebook depois do cruzamento.
Observado:

---

## 5. Google

### G1 — Fichas dos arquivos do Google ☐
Cartão "O que fazer agora" → ler as fichas dos arquivos que faltam.
**Esperado:** a leitura avança; se o Google der erro, ela para e diz qual
(a última parou num 500).
Observado:
