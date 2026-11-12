# Ideias guardadas (ainda não feitas)

## Desconto dos clientes mês a mês (Análise)
*Anotada em 12/11/2026. Não é prioridade agora.*

**Objetivo:** mostrar na Análise a economia que a OZZ gera para cada cliente, por mês e por ano
(em R$ e em %), e apontar quem está recebendo mais ou menos desconto do que o plano prevê.

**Por que ainda não dá:** as abas dos meses (JANEIRO … DEZEMBRO) da planilha de controle só têm a
**FATURA** (o valor *com* desconto). Falta o valor que o cliente pagaria *sem* a OZZ. Hoje ele só
existe na aba ASSINATURA, para alguns clientes de agosto/2025.

**O que precisa (opção A, escolhida):** criar nas abas dos meses uma coluna **FATURA SEM DESCONTO**,
preenchida com o valor que sai da calculadora da assinatura, na mesma base da FATURA (com bandeira,
multa, juros etc. dos dois lados).

**Cálculo:** `desconto = FATURA SEM DESCONTO − FATURA` (exato).
Exemplo: Panificadora Menino Deus (Rosane), ago/25: 8.142,98 − 6.692,33 = **R$ 1.450,65** (≈ 18%).

**Cuidados:**
- O portal acha a coluna pelo nome do título, então ela pode ficar em qualquer posição.
- Cliente sem o valor aparece como "sem dados", não como desconto zero.
- Meses antigos só terão desconto se forem preenchidos.
- Falta conversar com a chefia antes de mexer na planilha.

**Alternativa sem mexer na planilha (aproximada):** injetado × tarifa (~R$ 1,03) × % do plano,
marcada como "estimado". Exemplo da Rosane: ≈ R$ 1.425 contra R$ 1.450,65 reais.
