# Handoff do Geyma — 13/11/2026

Estado do projeto para quem retomar o trabalho (pessoa ou IA). Leia também
[ESTRATEGIA.md](ESTRATEGIA.md), [../ROADMAP.md](../ROADMAP.md) e
[prova-de-acesso.md](prova-de-acesso.md).

## 1. Onde estamos

| Item | Estado |
|---|---|
| Versão | **0.2.2** (`VERSION`); tag `v0.2.0` marca o fim da prova de acesso |
| Branch | `claude/icloud-google-photos-sync-y42lpa` (é também a principal) |
| Etapa atual | **0.3 — Extensão e inventário**, em andamento |
| Testes | `node --test test/*.test.mjs` → 19 passando |
| Extensão | Carregada sem compactação no Chrome de automação; **ainda não testada em uso real** |
| Repositório | **Público** no GitHub: não registrar dados da biblioteca pessoal |

## 2. Objetivo (pedido original)

1. Identificar a mesma foto nos dois serviços independentemente do nome (o nome
   é só uma evidência).
2. Detectar se o conteúdo foi alterado e se houve perda de informação
   (redimensionamento, recompressão).
3. Separar fotos pessoais de prints, imagens da internet, propaganda e outros.
4. Responder: **quais fotos estão nos dois serviços e se as fotos importantes
   estão guardadas em dois lugares**.
5. Sincronizar e sanitizar as bibliotecas; no futuro, também vídeos.
6. Ser econômico: rodar num notebook que não comporta baixar a biblioteca.
7. Decidir em lote, não foto a foto.
8. **Nada com suspeita de lixo é copiado sem confirmação** (marcação de decisão:
   Pessoal, Pendente, Manter, Descartar).
9. Transformar a solução em produto para outras pessoas e monetizar.

## 3. O que foi feito, em ordem

1. **Protótipo 0.1.0** (antes desta sessão): app client-side com Google Photos
   Picker, pasta local da Apple e comparação por nome e data.
2. **Plano e prova de acesso** (0.1.1 a 0.2.0):
   - leitura do catálogo do iCloud e do Google pela sessão do navegador, via
     Chrome DevTools Protocol (porta 9222), sem baixar originais;
   - descoberta das contagens oficiais da Apple por categoria;
   - teste de casamento entre os serviços com hash perceptual;
   - confirmação de que o Google guarda o SHA-1 do arquivo original;
   - leitura completa do catálogo do Google sem rolar a página.
3. **Incidente com a Apple:** depois de recarregar a aba do iCloud várias vezes e
   repetir consultas internas, a sessão caiu e o login passou a falhar só no
   perfil de automação ("Não foi possível verificar sua identidade"). A conta
   continuou normal (o login funcionou no Edge). Limpar cookies e armazenamento
   da Apple no perfil resolveu. **Desde então, o iCloud só é lido em modo
   passivo.**
4. **Estratégia, roadmap e versionamento** (0.1.1), com a marcação de decisão
   pedida pelo usuário.
5. **Revisão da estratégia** (0.2.0): as bibliotecas se completam (Google com os
   anos antigos, iCloud com os recentes); envio curado nos dois sentidos.
6. **Extensão de navegador** (0.2.1) em `extension/`.

## 4. Decisões e motivos

| Decisão | Motivo |
|---|---|
| Índice leve (metadados + miniatura) em vez de cópia | Originais somam centenas de GB; miniaturas, poucos GB |
| Extensão de navegador, não programa externo | Tudo depende da sessão do navegador; a automação externa travava com a janela oculta ou a tela bloqueada; miniaturas do Google só vêm pela sessão |
| iCloud somente passivo | A leitura ativa coincidiu com a queda da sessão da Apple |
| Google com leitura ativa | Funcionou no catálogo inteiro, sem erro, em segundo plano |
| Envio curado nos dois sentidos | Cada lado tem fotos que o outro não tem |
| Não religar o backup do Google no celular por enquanto | Ele envia tudo, inclusive lixo, e leva semanas |
| Nunca apagar automaticamente | Risco de perda irreversível |

## 5. Conhecimento técnico essencial

### Google Fotos (sessão web)
- Listagem: `POST /_/PhotosUi/data/batchexecute?rpcids=lcxiM` com
  `f.req=[[["lcxiM","[cursor,null,null,null,1,1,null]",null,"generic"]]]` e
  `at=WIZ_global_data.SNlM0e`; `f.sid=FdrFJe`, `bl=cfb2h`. ~300 itens por página;
  o cursor vem no índice 1 da resposta.
- Item: `[chave, [url, largura, altura, …], captura_ms, sha1_base64url(27), fuso_ms, …, mapa]`.
  O nome do arquivo **não** vem na listagem. A chave `76647426` do mapa final
  provavelmente marca vídeo (**não confirmado**).
- Miniatura: `url` + `=w256-h256`, **só pela sessão do navegador** (fora dele
  vem HTML). ~26 KB.

### iCloud Fotos (sessão web)
- O próprio site consulta
  `p*-ckdatabasews.icloud.com/database/1/com.apple.photos.cloud/production/private/records/query`
  com `recordType` `CPLAssetAndMasterByAssetDateWithoutHiddenOrDeleted`
  (100 registros por resposta: pares CPLAsset + CPLMaster) e
  `HyperionIndexCountLookup` (totais por categoria: vídeo, screenshot, Live etc.).
- Campos úteis: `assetDate`, `timeZoneOffset`, `resOriginalWidth/Height/FileSize`,
  `resOriginalFingerprint`, `filenameEnc` (base64 de texto), `itemType`,
  `adjustmentRenderType` (editada), `assetSubtypeV2`, `burstFlags`,
  `resJPEGThumbRes.downloadURL` (miniatura ~70 KB, URL temporária que funciona
  fora do navegador).
- A grade é um elemento rolável grande, com as fotos antigas no topo. Saltar o
  `scrollTop` (como quem arrasta a barra) faz o site buscar aquele período: busca
  binária pela data em ~9 saltos.
- **Regras de segurança:** não recarregar a aba repetidamente, não repetir
  consultas por conta própria, ritmo humano, parar no primeiro status ≥ 400.

### Identidade (teste com 60 pares)
- Mesmo milissegundo + mesmas dimensões: 29/29 confirmados por pHash (mediana 2).
- Até 3 s de diferença: em geral são outras fotos (sequências).
- "Cópia reduzida" com mesma proporção: em geral é outra foto.
- Limites iniciais de pHash (64 bits): ≤ 10 confirma; 11–21 incerto; ≥ 22
  diferente. Controle (pares sorteados) teve mínimo 22.
- SHA-1 do original da Apple igual ao campo de 27 caracteres do Google prova
  arquivo idêntico (3 de 10 pares; nos demais, o Google guarda bytes
  diferentes).

## 6. Ambiente

- **Chrome de automação:** iniciar com `he chrome-automation` (perfil
  `%LOCALAPPDATA%\Google\Chrome\DebugProfile`, porta 9222). Regra do usuário: não
  abrir navegadores ou perfis paralelos para automação.
- **Extensão:** carregada sem compactação a partir de `extension/`. Depois de
  alterar o código: Recarregar em `chrome://extensions` e recarregar as abas dos
  serviços.
- **Páginas ocultas não rolam:** tela bloqueada ou janela coberta travam a
  rolagem. Quando o usuário está usando outra janela, o Windows não deixa trazer
  o Chrome para frente por script.
- **Memória:** o notebook tem 16 GB, muitas vezes com ~2 GB livres; um processo
  em segundo plano já foi encerrado pelo sistema por isso.
- **Python:** `.venv/` local (fora do Git) com Pillow e ImageHash, usado na
  prova; tem também `pyicloud`, que acabou não sendo usado e pode ser removido.
- Os scripts da prova de acesso eram descartáveis e **não estão no
  repositório**; o conhecimento está nesta seção e em `prova-de-acesso.md`.

## 7. Próximos passos

1. **Testar a extensão em uso real** (etapa 0.3):
   - Google: "Ler catálogo" no painel; conferir o total e o gráfico por ano.
   - iCloud: "Percorrer biblioteca" com a aba **visível**; acompanhar a cobertura
     contra o total informado pela Apple; testar "Continuar de onde parou".
   - Corrigir o que aparecer e registrar.
2. Calcular o pHash das miniaturas dentro da extensão (WebAssembly ou canvas) e
   guardar no índice.
3. Etapa 0.4: motor de identidade com o placar descrito acima.
4. Etapas seguintes conforme o roadmap: qualidade, classificação com marcação
   de decisão, painel de proteção, envio curado, sanitização, vídeos.

## 8. Regras do usuário que se aplicam

- Commits em pt-BR, Conventional Commits com gitmoji (`tipo emoji: mensagem`).
- Versão: `VERSION` é a fonte; PATCH a cada commit, MINOR ao concluir etapa do
  roadmap, tag anotada `vX.Y.0` nos marcos. Atualizar o CHANGELOG.
- Push imediato após commit só de documentação ou com testes passando; fora
  disso, pedir autorização.
- Nada é apagado nem copiado sem a decisão do usuário; suspeita de lixo fica
  Pendente.

## 9. Pendências de decisão do usuário

- Caminho do envio Google → iCloud (etapa 0.7).
- Plano de armazenamento do Google e do iCloud, se o volume curado não couber.
- Repositório público: a estratégia comercial está visível. Avaliar tornar o
  repositório privado antes da trilha de produto.
