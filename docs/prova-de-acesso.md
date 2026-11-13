# Prova de acesso (novembro de 2026)

Testes feitos em 10 a 13/11/2026, só com leitura, em um navegador já
autenticado. Os números da biblioteca usada no teste não são registrados aqui
porque o repositório é público.

## Resultados

| Pergunta | Resultado |
|---|---|
| Ler o catálogo do iCloud sem baixar originais | **Sim.** Cada item traz nome, dimensões, tamanho, fingerprint do original, miniatura e marcações da Apple (ex.: screenshot, vídeo, Live Photo, rajada) |
| Contagens por categoria no iCloud | **Sim.** O próprio site expõe os totais por tipo (vídeos, screenshots etc.) |
| Miniaturas do iCloud | **Sim.** ~70 KB cada, baixáveis sem sessão por URL temporária |
| Ler o catálogo do Google sem baixar | **Sim.** Páginas de ~300 itens com chave, dimensões, data de captura e um campo de 27 caracteres (hipótese: hash do arquivo original, **não confirmado**). O nome do arquivo não vem nessa listagem |
| Paginação automática no Google | **Sim**, por cursor |
| Ler o catálogo inteiro do Google sem rolar a página | **Sim.** A chamada é montada com os dados da própria página; ~110 itens/s com pausas, sem erro, inclusive com a aba em segundo plano. O campo 4 do item é o fuso horário em ms |
| Leitura passiva do iCloud (rolando a página) | **Sim.** ~10 itens/s, sem erro do servidor |
| Chegar a um período antigo no iCloud sem consultas próprias | **Sim.** Saltos pela barra de rolagem (busca binária pela data), ~9 saltos |
| Campo de 27 caracteres do Google | **É o SHA-1 do arquivo original** (base64url): bateu com o original da Apple em 3 de 10 pares; nos demais, o Google guarda bytes diferentes |
| Miniaturas do Google | Só pela sessão do navegador (fora dele, a URL devolve HTML). ~26 KB em 256 px |
| Casar a mesma foto entre os serviços | **Sim**, com regras. Ver abaixo |

## Teste de casamento (amostra de 60 pares, ~2,5 meses em comum)

Distância de hash perceptual (pHash, 64 bits) entre as miniaturas:

| Tipo de par | Bateram (pHash ≤ 10) | Mediana |
|---|---|---|
| Mesmo milissegundo e mesmas dimensões | **29/29** | 2 |
| Até 3 s de diferença, mesmas dimensões | 8/26 | 18 |
| Mesma proporção, cópia menor no Google | 0/5 | 22 |
| Controle (pares sorteados) | 0/60 (mínimo 22) | 28 |

Conclusões para o motor de identidade:

- **Instante exato + dimensões** é evidência fortíssima; o pHash confirma.
- **Instante aproximado não basta.** Fotos tiradas em sequência têm o mesmo
  segundo e as mesmas dimensões e são outras fotos. O pHash precisa decidir entre
  os candidatos da janela de tempo, e o par certo pode ter instante diferente.
- **"Cópia reduzida" só vale com confirmação visual.** Os pares de mesma
  proporção e tamanho menor eram, em geral, outras fotos.
- Limite inicial: pHash ≤ 10 confirma, 11 a 21 é incerto e ≥ 22 é diferente.
  Validar com amostra maior na 0.4.
- Rotação não foi problema: as miniaturas dos dois lados já vêm orientadas.
- Para provar o mesmo arquivo, basta comparar o SHA-1 do original da Apple com o
  campo de 27 caracteres do Google, sem baixar nada do Google.

## Lições

- **A sessão da Apple caiu** quando o teste recarregou a página várias vezes e
  repetiu consultas internas. O login seguinte falhou só naquele perfil de
  navegador e voltou após limpar os dados da Apple nele. Desde então, o acesso
  ao iCloud é só passivo, com parada no primeiro erro.
- **Páginas ocultas não rolam.** Com a tela bloqueada ou a janela coberta, o
  navegador para de desenhar e a leitura passiva trava. A leitura precisa de
  janela visível ou de outro mecanismo (extensão).
- **Estimativa de volume:** miniaturas de uma biblioteca de ~90 mil itens somam
  ~6,5 GB trafegados; os originais, centenas de GB. O índice leve é viável num
  notebook; a cópia completa, não.

- **Leitura de miniaturas e catálogo do Google exige janela visível** quando
  depende de rolagem; em alguns ciclos, o Google não carregou páginas novas e foi
  preciso tentar de novo.

- **As bibliotecas se completam.** O Google era maior e concentrava os anos até
  2017; o iCloud, os recentes. A estratégia passou a prever envio nos dois
  sentidos.

## Decisão

Prova concluída em 13/11/2026 (versão 0.2.0). Arquitetura escolhida: **extensão
de navegador**, porque tudo o que funcionou depende da sessão do navegador e a
automação externa travava com a janela oculta ou a tela bloqueada.
