# Estratégia do Geyma

Registro de 13/11/2026. Define como resolver o problema pessoal que deu origem ao
projeto e como transformar a solução em produto. As metas técnicas e as versões
estão em [ROADMAP.md](../ROADMAP.md); as evidências medidas, em
[prova-de-acesso.md](prova-de-acesso.md).

## 1. Problema

Quem usa Google Fotos e Apple (iCloud) Fotos ao mesmo tempo não consegue
responder a uma pergunta simples: **minhas fotos importantes estão guardadas em
dois lugares, sem chance de perda?**

- As bibliotecas divergem com o tempo: sincronização desligada em um período,
  exclusões feitas em um lado só, celulares trocados.
- A mesma foto aparece com nomes, formatos (HEIC × JPG), resoluções e metadados
  diferentes. Comparar por nome engana.
- Uma cópia redimensionada ou recomprimida parece um backup, mas perdeu
  informação.
- As bibliotecas misturam fotos pessoais com prints, imagens da internet,
  memes, propaganda e documentos. Sincronizar tudo copia o lixo junto.
- Não há API pública para listar o iCloud Fotos. Desde 31/03/2025, a API do
  Google também não lê mais a biblioteca inteira.
- Baixar tudo para comparar exige centenas de GB de disco e banda que um notebook
  comum não tem.

## 2. Princípios

1. **Nada é apagado automaticamente.** O Geyma propõe e a pessoa decide. A
   exclusão só alcança itens comprovadamente protegidos e passa por quarentena
   (a lixeira do próprio serviço).
2. **Índice leve em vez de cópia.** Ler metadados e miniaturas, guardar uma
   impressão digital por item e buscar o original só para tirar dúvida ou copiar.
3. **Local first.** O processamento acontece no navegador ou no computador da
   pessoa. As fotos não passam por servidor do Geyma.
4. **Sessão é patrimônio da pessoa.** Ritmo humano, nenhuma repetição agressiva,
   parada no primeiro erro do serviço e retomada do ponto em que parou.
5. **Decisão em lote.** Revisar conjuntos (ex.: "prints de 2021") com amostra
   visual e nível de confiança, retirando só as exceções.
6. **Erro seguro.** Dizer "é a mesma foto" quando não é faz alguém achar que tem
   backup que não tem. Na dúvida, o item conta como não protegido e nunca é
   apagado.
7. **Suspeita de lixo não viaja sem confirmação.** Copiar algo que depois será
   apagado desperdiça banda, tempo e cota. Todo item com suspeita de lixo (ou de
   categoria indefinida) recebe uma marcação de decisão e fica fora do envio até
   a pessoa decidir.

## 3. Marcação de decisão

Cada item recebe uma marcação que define o seu encaminhamento:

| Marcação | Quem define | Encaminhamento |
|---|---|---|
| **Pessoal** | Classificador, com confiança alta | Entra no envio |
| **Pendente** | Classificador: suspeita de lixo ou categoria indefinida | Fica parado: não é copiado nem apagado |
| **Manter** | Pessoa, na revisão em lote | Entra no envio |
| **Descartar** | Pessoa, na revisão em lote | Não é copiado; vai para a lista de exclusão (só depois da quarentena) |

A revisão em lote trabalha sobre os conjuntos **Pendente** (ex.: "1.200 prints
de 2021"), com amostra visual e nível de confiança; a pessoa decide o conjunto e
retira as exceções. A pessoa pode reverter **Pessoal** para **Descartar** a
qualquer momento antes do envio.

## 4. Definição de "protegida"

Uma foto pessoal está **protegida** quando:

- existe nos dois serviços, com identidade confirmada; e
- pelo menos uma das cópias preserva a qualidade original (mesma resolução, sem
  recompressão relevante).

Todo o resto aparece no painel com o motivo: só em um lugar, só em versão
reduzida, identidade não confirmada ou categoria indefinida.

## 5. Estratégia para a biblioteca pessoal (caso fundador)

Situação (medida em 13/11/2026): a biblioteca do Google é maior que a do iCloud
e concentra os anos até 2017; o iCloud concentra os anos recentes. O Google não
recebe fotos do celular desde dezembro de 2023 e teve exclusões. **Cada lado tem
fotos que o outro não tem.** A pessoa quer voltar a usar o Google sem levar lixo.

### Decisão: as bibliotecas se completam; envio curado nos dois sentidos

Nenhum lado é a "fonte da verdade". A verdade é a união das fotos pessoais dos
dois, e cada foto pessoal que estiver em um lado só é enviada ao outro.

#### iCloud → Google

| Caminho | Prós | Contras | Uso |
|---|---|---|---|
| Religar o backup do Google Fotos no celular | Oficial e simples | Envia tudo, inclusive o lixo; leva semanas; consome a cota | **Não agora.** Opção de reserva |
| Transferência oficial Apple → Google (privacy.apple.com) | Oficial, sem passar pelo notebook | Copia tudo, sem filtro, e cria duplicatas do que já existe | Reserva, após avaliação |
| **Envio curado pelo Geyma** (Google Photos Library API, escopo de envio) | Oficial do lado Google; só fotos pessoais que faltam; os itens enviados ficam gerenciáveis pelo app | Exige desenvolvimento; a banda passa pelo computador, em fluxo, sem acumular disco | **Recomendado** |

#### Google → iCloud

A Apple não tem API para enviar fotos ao iCloud. Opções a avaliar na etapa 0.7:

| Caminho | Observação |
|---|---|
| Transferência oficial Google → Apple (Google Takeout) | Oficial, mas copia tudo, sem filtro, e criaria duplicatas; a verificar |
| Pasta de envio do iCloud para Windows | Oficial do lado Apple; os arquivos passam pelo computador em lotes |
| Envio pela página do iCloud.com | Usa a sessão do navegador; interface não oficial |

Sequência:

1. **Não religar o backup do celular por enquanto.** Ele não filtra lixo.
2. **Inventariar os dois lados** (metadados e miniaturas) e fixar a identidade de
   cada foto.
3. **Classificar** pessoal × resto, aplicar a marcação de decisão e o estado de
   proteção.
4. **Revisar em lote os itens Pendentes.** Só **Pessoal** e **Manter** seguem
   para o envio; nada suspeito é copiado antes da decisão.
5. **Conferir a cota do Google** contra o volume curado. Se não couber, o plano
   de armazenamento é uma decisão de custo da pessoa.
6. **Enviar em lotes, nos dois sentidos**, baixando de um lado e enviando ao
   outro em fluxo, com retomada.
7. **Manutenção contínua:** rodar o Geyma periodicamente para enviar só as fotos
   pessoais novas, substituindo o backup automático do celular.
8. **Sanitizar** depois que o painel mostrar as fotos protegidas: listas de
   exclusão revisadas, primeiro do lado com mais lixo.

Vídeos seguem o mesmo fluxo em uma etapa posterior.

## 6. Arquitetura-alvo

- **Extensão de navegador (Chrome/Edge, Manifest V3)** usando as sessões que a
  pessoa já tem abertas, reaproveitando o núcleo client-side atual (IndexedDB,
  motor de comparação, painel).
- **Conectores por serviço**, isolados, com limite de ritmo e retomada:
  - Google: API oficial para envio; leitura do catálogo pela sessão web.
  - Apple: leitura do catálogo pela sessão web, em modo passivo (o próprio site
    busca os dados enquanto a página é percorrida).
- **Motor de identidade:** placar com instante de captura, dimensões, hash
  perceptual da miniatura, hash exato quando disponível e embedding visual para
  casos difíceis.
- **Motor de qualidade:** resolução pelos metadados; recompressão e edição pela
  comparação de miniaturas e, por amostragem, dos originais.
- **Classificador:** marcações do próprio serviço (ex.: screenshot), regras
  baratas e, para o restante, modelo visual local (CLIP via WebAssembly/WebGPU).

## 7. Produto

### Para quem

- Famílias e pessoas com dezenas de milhares de fotos em Google e Apple, que já
  tiveram susto com cota, troca de celular ou sincronização desligada.
- Quem está migrando entre ecossistemas (Android ↔ iPhone).
- Mercado inicial: Brasil (pt-BR); depois, inglês e espanhol.

### Proposta de valor

"Descubra em minutos se suas fotos importantes estão a salvo, sem enviar suas
fotos para ninguém." Depois: limpar o lixo e completar o backup só com o que
importa.

### Modelo de receita (hipótese a validar)

| Plano | Conteúdo | Cobrança |
|---|---|---|
| Gratuito | Inventário, índice de proteção e relatório | — |
| Faxina | Revisão em lote, duplicatas, lista de exclusão, envio curado | Pagamento único por biblioteca |
| Guardião | Verificação periódica, envio contínuo do que é novo, alertas, vídeos | Assinatura anual |

Como é local first, o custo de infraestrutura por cliente é baixo: licenças,
site e suporte. Não há armazenamento de fotos.

### Diferenciais

Verificação **entre nuvens**, e não só duplicatas dentro de uma; detecção de
perda de qualidade; separação de lixo; decisão em lote; privacidade por
desenho.

### Riscos e o que fazer antes de vender

| Risco | Mitigação |
|---|---|
| **Uso das interfaces web não oficiais pode violar termos de serviço** e quebrar sem aviso | Análise jurídica antes de qualquer venda; priorizar caminhos oficiais (Picker/Library API, Data Portability API, transferências oficiais) e tratar o acesso web como modo avançado, opcional e explicado |
| Bloqueio ou derrubada de sessão da conta do cliente | Modo passivo, ritmo humano, parada no primeiro erro; aprendizado já registrado na prova de acesso |
| Perda de foto por decisão errada | Nunca apagar automaticamente; quarentena; só alcança itens protegidos |
| Rejeição nas lojas de extensões | Revisar as políticas das lojas antes de publicar; distribuição direta como alternativa |
| Concorrência (limpadores de duplicatas, transferidores entre nuvens) | Mapear os concorrentes na descoberta e focar o diferencial entre nuvens |

### Validação comercial (antes de investir no produto)

1. Terminar o uso pessoal até o painel de proteção (marco 0.6 do roadmap).
2. Página de apresentação com lista de espera e pesquisa curta de dor/preço.
3. Teste com 5 a 10 pessoas próximas, com o modo pessoal.
4. Decidir sobre o produto com base em adesão, preço aceito e parecer jurídico.
