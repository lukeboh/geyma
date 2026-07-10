# Geyma — Validador Google Fotos × Apple (iCloud) Fotos

Aplicação web **100% client-side** que valida, de forma cruzada, se todas as fotos
do seu Google Fotos estão no Apple (iCloud) Fotos e vice-versa. Toda a base de
dados vive **no navegador** (IndexedDB) — nenhum servidor próprio, nenhum dado
enviado para fora da sua máquina além da comunicação direta e autenticada com o
Google.

## Como funciona

| Lado | Fonte | Mecanismo |
|------|-------|-----------|
| Google Fotos | API oficial | Login OAuth (Google Identity Services) + **Google Photos Picker API** |
| Apple / iCloud Fotos | Pasta local | File System Access API (leitura de nome, tamanho e data EXIF) |
| Base de dados | Navegador | IndexedDB (stores `googlePhotos`, `applePhotos`, `settings`) |

O motor de comparação cruza os dois acervos usando o **nome de arquivo
normalizado** como chave (sem extensão — HEIC de um lado costuma virar JPG do
outro — e sem sufixos de cópia/edição como `(1)`, `-edited`, `IMG_E…`) e a
**data de captura** como confirmação, com tolerância de ±26 h para absorver
fusos horários. O resultado é classificado em:

- **Em ambos** — nome bate e datas compatíveis (ou indisponíveis);
- **Só no Google** — falta no acervo Apple;
- **Só na Apple** — falta no Google Fotos;
- **Incertos** — mesmo nome, mas datas divergentes (provável homônimo).

O relatório pode ser exportado em CSV.

## Limitações impostas pelas plataformas (importante)

1. **Apple não tem API pública para o iCloud Fotos.** Não existe OAuth nem
   endpoint oficial para um app de terceiros listar a biblioteca. Por isso o
   lado Apple é lido de uma **pasta local**, que pode vir de:
   - *iCloud para Windows* (pasta "Fotos do iCloud" sincronizada);
   - app Fotos do macOS: *Arquivo → Exportar → Exportar original não modificado*;
   - download em massa no [iCloud.com](https://www.icloud.com/photos);
   - export de dados em [privacy.apple.com](https://privacy.apple.com).

2. **Google removeu o acesso de leitura à biblioteca inteira em 31/03/2025**
   (escopo `photoslibrary.readonly`). O caminho suportado hoje é a
   **Picker API**: o app abre o seletor do Google Fotos, o usuário marca as
   fotos (é possível selecionar todas) e o app lê os metadados apenas dos itens
   escolhidos.

## Configuração

### 1. Criar o Client ID no Google Cloud

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) e crie um projeto.
2. Em **APIs e serviços → Biblioteca**, habilite a **Google Photos Picker API**.
3. Em **APIs e serviços → Tela de consentimento OAuth**, configure o app
   (tipo *Externo*) e adicione seu e-mail como **usuário de teste**.
4. Em **APIs e serviços → Credenciais**, crie um **ID do cliente OAuth** do tipo
   *Aplicativo da Web* e adicione a origem onde a página vai rodar
   (ex.: `http://localhost:8000`) em *Origens JavaScript autorizadas*.
5. Copie o Client ID (`…apps.googleusercontent.com`).

### 2. Servir a aplicação

É um site estático — qualquer servidor serve. Exemplo:

```bash
python3 -m http.server 8000
# ou: npx serve .
```

Abra `http://localhost:8000` (a mesma origem cadastrada no Google Cloud;
`file://` não funciona porque o OAuth exige uma origem HTTP).

### 3. Usar

1. Cole o Client ID no passo 1 e salve (fica no IndexedDB).
2. No passo 2, entre com o Google e selecione as fotos na janela do Picker.
3. No passo 3, aponte para a pasta local com as fotos do iCloud.
4. No passo 4, clique em **Comparar acervos** e analise/exporte o relatório.

O botão **Limpar dados locais** apaga tudo que foi salvo no navegador.

## Requisitos de navegador

- Chrome/Edge/Opera recentes: experiência completa (File System Access API).
- Firefox/Safari: use o botão alternativo de seleção de pasta
  (`<input webkitdirectory>`), que carrega a lista de arquivos de uma vez.

## Estrutura do código

```
index.html      — página única com os 4 passos
css/styles.css  — estilos (com tema escuro automático)
js/db.js        — camada IndexedDB
js/google.js    — OAuth + Google Photos Picker API
js/apple.js     — varredura de pasta local + parser EXIF mínimo (JPEG)
js/match.js     — motor de comparação e export CSV
js/app.js       — orquestração da UI
test/match.test.mjs — testes do motor de comparação (node --test)
```

## Testes

```bash
node --test test/match.test.mjs
```
