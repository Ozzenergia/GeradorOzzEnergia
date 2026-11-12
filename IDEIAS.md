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

## Contas de clientes que não entram na PROGRAMAÇÃO
*Anotada em 12/11/2026. Ainda não mexer.*

**Caso encontrado:** Posto Dalri, unidade de Agudo (CNPJ 08.824.904/0011-15).
UC nova 2.003.613.001-99, UC antiga 3092293708. Usina: Eliana Luisa Borre.
É cliente desde abril/2026 e paga em dia, mas as contas da CPFL dessa UC **não aparecem na
PROGRAMAÇÃO** (verificado no arquivo enviado em 12/11/2026). A conta pode ser acessada no site da CPFL
pelo CNPJ.

**Causa provável:** o importador da PROGRAMAÇÃO só lê os e-mails "Conta por e-mail" que chegam em
ozzenergia@gmail.com. Se a conta dessa UC vai para outro e-mail (ou não está em conta digital), ela
não entra. Verificar no site da CPFL para qual e-mail a conta digital dessa UC está cadastrada.

**Lembrete: verificar as demais contas.** Cruzar todas as UCs ativas da aba CLIENTES (e as UCs
geradoras da FATURAS GERADOR) com as UCs que aparecem na PROGRAMAÇÃO e listar as que nunca
aparecem. Isso dá a lista de contas que estão fora do controle de pagamentos (e fora do fluxo de
caixa, que usa a PROGRAMAÇÃO para as contas da RGE).

**Outro ponto do mesmo cliente:** lucro de setembro/2026 saiu 51% (R$ 2.410,54 sobre R$ 3.842,00),
bem acima dos outros meses (15% a 39%). Conferir se é erro de digitação.
