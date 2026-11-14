# Usabilidade

Como o Geyma deve se comportar para quem usa. Vale para o uso pessoal e para o
produto (ver [ESTRATEGIA.md](ESTRATEGIA.md)).

## Para quem

- **Uso pessoal (primeiro):** quem tem duas bibliotecas grandes e antigas,
  com fotos de família espalhadas, cópias repetidas e lixo misturado.
- **Produto (depois):** a mesma dor, mas sem conhecimento técnico. Não sabe o
  que é pHash, SHA-1 ou CloudKit e não precisa saber.

## Princípios

1. **Confiança antes de tudo.** Nada é apagado automaticamente. Nada suspeito
   de lixo é copiado sem decisão. Toda ação que mexe nos serviços mostra antes
   o que vai acontecer, quanto vai ocupar e como desfazer.
2. **Uma frase responde a pergunta principal.** Antes de números e gráficos:
   "87% das fotos do iCloud também estão no Google".
3. **Incerteza à vista.** O que o metadado não garante aparece como "a
   confirmar", nunca como certeza. Resultado parcial tem aviso fixo, com a data
   até onde vale.
4. **Linguagem do usuário.** Situações com nome simples (Em ambos, Só no
   Google, Cópia reduzida…) e uma linha explicando cada uma. Nada de termos
   técnicos na tela.
5. **Do resumo ao item.** Todo número leva à lista que o compõe ("Ver lista").
6. **Decidir em lote, conferir por amostra.** Bibliotecas têm dezenas de
   milhares de itens; decidir foto a foto não é viável. Decisões por grupo
   (ano, tipo, situação, grupo de duplicatas), sempre com amostra visível.
7. **O trabalho longo não depende de atenção.** Leituras retomam de onde
   pararam, explicam por que pausaram e dizem quanto falta.

## Jornada

| Etapa | Pergunta que responde | Situação |
|-------|-----------------------|----------|
| 1. Inventário | O que existe em cada serviço? | pronta (0.3) |
| 2. Proteção | O que está nos dois lugares, o que está só num, o que perdeu qualidade? O que parece lixo? Quanto custaria enviar? | primeira versão (0.2.6 a 0.2.9) |
| 3. Revisão | O que fazer com cada grupo? | filtros, miniaturas, marcação por linha e em lote (0.2.8 e 0.2.9) |
| 4. Envio | Copiar o que foi aprovado, com estimativa de espaço e tempo | prévia do plano (0.2.9); envio na 0.7 |
| 5. Limpeza | Remover duplicatas e lixo aprovados, com lixeira dos serviços | 0.8 |

## Telas

- **Inventário:** um cartão por serviço com total, período, situação da
  leitura e botões de iniciar, parar e continuar; gráfico por ano com tabela.
- **Proteção:** frase-resumo, cartões por situação com explicação e acesso à
  lista, colunas empilhadas por ano (cores fixas por situação, legenda e
  tabela) e o quadro de possíveis duplicatas no Google.
- **Proteção** também mostra "Pessoal ou lixo?" (contagem por categoria, com
  atalho para revisar) e o **plano de envio**: quantos itens e quanto espaço
  iriam em cada sentido com as marcações de agora, separando os vídeos, que
  concentram o volume.
- **Revisão:** resumo do que está em vigor (marcação do usuário ou sugestão);
  filtros por situação, categoria, marcação, ano e tipo; miniaturas dos dois
  lados (a do Google abre a foto no Google Fotos); marcação por linha; marcação
  em lote dos itens filtrados, sempre com uma confirmação que diz quantos itens
  e que nada muda nos serviços; exportação em CSV com categoria e motivo.

## Aprendizados do uso real

- **A aba do iCloud precisa ficar visível**, e olhar o painel na mesma janela
  a esconde. A extensão agora move o iCloud para uma janela própria.
- **O controle de tamanho das miniaturas do iCloud** (no próprio site) no
  menor valor deixou o percurso cerca de 7 vezes mais rápido. A extensão agora
  ajusta sozinha.
- **O Google repete fotos:** grupos com o mesmo segundo e as mesmas dimensões
  são, na maior parte, a mesma foto guardada duas vezes. É economia de espaço
  que merece uma tela própria de revisão.
- **Vídeos dominam o volume:** o que falta no Google é quase todo vídeo em
  bytes. O plano de envio separa fotos e vídeos para a decisão ser consciente.
- **A categoria precisa mostrar o motivo** (passar o mouse): sem isso, a
  sugestão "Pendente" parece arbitrária.

## Próximos passos de interface

- Grade de miniaturas grandes para revisar um filtro inteiro de uma vez
  (selecionar as exceções e marcar o resto em lote), com atalhos de teclado.
- Comparação lado a lado para os pares "a confirmar" e para as duplicatas.
- Espaço que cada decisão libera ou ocupa, ao lado do botão de lote.
- Assistente de início: extensão instalada, sessões abertas, janela do
  iCloud, tamanho das miniaturas.
