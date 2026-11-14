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
| 2. Proteção | O que está nos dois lugares, o que está só num, o que perdeu qualidade? | primeira versão (0.2.6) |
| 3. Revisão | O que fazer com cada grupo? | lista e filtros; decisões na 0.6 |
| 4. Envio | Copiar o que foi aprovado, com estimativa de espaço e tempo | 0.7 |
| 5. Limpeza | Remover duplicatas e lixo aprovados, com lixeira dos serviços | 0.8 |

## Telas

- **Inventário:** um cartão por serviço com total, período, situação da
  leitura e botões de iniciar, parar e continuar; gráfico por ano com tabela.
- **Proteção:** frase-resumo, cartões por situação com explicação e acesso à
  lista, colunas empilhadas por ano (cores fixas por situação, legenda e
  tabela) e o quadro de possíveis duplicatas no Google.
- **Revisão:** filtros por situação, ano e tipo; lista paginada; exportação em
  CSV.

## Aprendizados do uso real

- **A aba do iCloud precisa ficar visível**, e olhar o painel na mesma janela
  a esconde. Resolvido no uso abrindo o iCloud numa janela própria; a
  extensão deve fazer isso sozinha.
- **O controle de tamanho das miniaturas do iCloud** (no próprio site) no
  menor valor deixou o percurso cerca de 7 vezes mais rápido. A extensão deve
  ajustar sozinha ou pedir isso no início.
- **O Google repete fotos:** grupos com o mesmo segundo e as mesmas dimensões
  são, na maior parte, a mesma foto guardada duas vezes. É economia de espaço
  que merece uma tela própria de revisão.

## Próximos passos de interface

- Miniaturas lado a lado (iCloud × Google) para confirmar pares e duplicatas,
  com atalhos de teclado (confirmar, rejeitar, pular).
- Marcação Pessoal, Pendente, Manter, Descartar, com decisões em lote e
  contador "revisadas X de Y".
- Espaço que cada decisão libera ou ocupa.
- Assistente de início: extensão instalada, sessões abertas, janela do
  iCloud, tamanho das miniaturas.
