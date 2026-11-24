# Portal Interno · OZZ Energia

Portal de uso interno da OZZ Energia / Energia Certa Consórcio.

**Acesse:** https://ozzenergia.github.io/GeradorOzzEnergia/

## O que tem

- **Gerador de Propostas** — usa o modelo padrão de Energia por Assinatura (não precisa carregar), lê a fatura em PDF ou **foto** (layout RGE/CPFL; a foto é lida no próprio navegador com Tesseract.js), calcula média de consumo, plano de desconto, custo e economia, e gera a proposta preenchida. Outro modelo pode ser importado pelo ícone ⇪ ao lado de "Modelo: Padrão OZZ".
- **Gerador de Termo de Adesão** — lê a proposta aprovada e gera o Termo no modelo oficial. Campos não preenchidos saem destacados em amarelo no Word.

- **Cobranças** (Clientes → Cobranças, TI e Admin) — copia as abas dos meses da planilha de controle para duas abas da
  planilha do portal: **Cobranças** (uma linha por cliente e mês, pronta para tabela dinâmica) e **Cobranças Clientes**
  (uma linha por UC). A cópia roda em segundo plano (de 10 em 10 min e no botão Atualizar) e **não grava nada** na planilha
  de controle. A tela mostra o que falta emitir, enviar e receber, com o motivo. Cliente novo (sem nenhuma fatura) fica em
  "Aguardando 1ª fatura" até 90 dias depois da entrada no rateio (Anexo G). Na ficha do cliente dá para corrigir a data
  de entrada no rateio e escrever uma anotação: essas duas colunas da aba Cobranças Clientes nunca são apagadas na cópia.
  A visão **Faturas da RGE** é o checklist do mês: para cada cliente ativo, mostra se a fatura da RGE daquele mês de
  referência já foi lida no Leitor, se chegou no e-mail (PROGRAMAÇÃO) e falta ler, ou se ainda não chegou. As faturas lidas
  também entram no motivo da cobrança ("a fatura de 10/2026 já foi lida: dá para emitir") e na ficha do cliente.
  Cada cliente que "chegou no e-mail" tem o link **Abrir conta ↗** (o link da CPFL que está na PROGRAMAÇÃO): baixar o PDF e
  arrastar no Leitor.
  **Fluxo da cobrança no portal:** botões *Marcar emitida* (com o valor), *Marcar enviada* (com o vencimento) e *Marcar paga*
  (com o dia), e *Desfazer* na ficha do cliente. Fica na aba **Cobranças Andamento** da planilha do portal, que a cópia nunca
  apaga, e vale quando está mais adiantado que o STATUS da planilha de controle.
  **Cálculo da cobrança:** o Leitor extrai as linhas da conta (TUSD, TE, bandeira, iluminação pública, injetado e outros
  débitos/créditos) e o portal faz a mesma conta da aba ASSINATURA: fatura sem a OZZ − desconto (% do plano sobre o total
  ou sobre o injetado). Parcelamento da distribuidora (Art. 321/323) e "Ajuste Saldo" não são repassados. O plano de cada
  cliente (% de desconto, base e R$/kWh do investidor) vem do último bloco dele na ASSINATURA e pode ser ajustado na ficha.
  A ficha mostra a conta passo a passo e compara com o valor da planilha de controle; "Marcar emitida" já vem preenchido.
  **PDFs das faturas:** ao guardar no Leitor, o PDF vai para a pasta **Faturas RGE (portal OZZ)** no Google Drive de quem
  implantou o script (uma subpasta por mês de referência; ler de novo substitui o arquivo). A pasta fica privada: no portal,
  o botão **Ver PDF** (ficha do cliente e checklist de faturas) abre o arquivo pelo próprio script.

- **Pós-venda** (`posvenda/`) — cópia do app de visitas de pós-venda (repositório `visita_P-s_Vendas`, que segue
  instalado nos iPads e não foi alterado). Usa a mesma planilha central de visitas, mas guarda os dados do aparelho
  em separado para não misturar com o app original.

Tudo roda no navegador: nenhum arquivo ou dado de cliente é enviado para servidor.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O portal (página única) |
| `modelos/PROPOSTA_OZZ_ENERGIA_MODELO.docx` | Modelo padrão da proposta — Energia por Assinatura (campos `{…}`), carregado automaticamente |
| `modelos/PROPOSTA_SOLAR_MODELO.docx` | Modelo da proposta de sistema fotovoltaico — pode ser importado pelo ícone ⇪ |
| `modelos/TERMO_DE_ADESAO_MODELO.docx` | Template do Termo — é o modelo padrão, já embutido no portal (não precisa carregar). Outro modelo pode ser importado pelo ícone ⇪ ao lado de "Modelo: Padrão OZZ" |

## Planilha de registro (Google Sheets)

Cada proposta e cada Termo gerados podem ser registrados numa planilha do Google, que também
controla a numeração (sem números repetidos entre consultores). Veja [`planilha/COMO_CONFIGURAR.md`](planilha/COMO_CONFIGURAR.md).
Sem a planilha configurada, o portal funciona normalmente com a numeração de cada navegador.

## Campos do template da proposta

Marque no Word os pontos a preencher com chaves, por exemplo `{titular}`, `{consumo}`, `{plano}`, `{desconto}`, `{custo_mensal}`, `{economia_mensal}`, `{economia_anual}`, `{numero_proposta}`, `{data}`.
Campos que o portal não reconhece aparecem em "Outros campos do template" para preencher à mão.
