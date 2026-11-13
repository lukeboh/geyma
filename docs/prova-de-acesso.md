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
| Leitura passiva do iCloud (rolando a página) | **Sim.** ~10 itens/s, sem erro do servidor |
| Casar a mesma foto entre os serviços | **Não testado ainda.** As amostras não tiveram período em comum |

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

## Pendências da prova

1. Teste de casamento num período presente nos dois serviços.
2. Confirmar se o campo de 27 caracteres do Google é o SHA-1 do original.
3. Medir o total da biblioteca do Google e o tamanho das miniaturas.
