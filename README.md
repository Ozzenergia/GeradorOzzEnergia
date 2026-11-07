# Portal Interno · OZZ Energia

Portal de uso interno da OZZ Energia / Energia Certa Consórcio.

**Acesse:** https://ozzenergia.github.io/GeradorOzzEnergia/

## O que tem

- **Gerador de Propostas** — usa o modelo padrão de Energia por Assinatura (não precisa carregar), lê a fatura em PDF ou **foto** (layout RGE/CPFL; a foto é lida no próprio navegador com Tesseract.js), calcula média de consumo, plano de desconto, custo e economia, e gera a proposta preenchida. Outro modelo pode ser importado pelo ícone ⇪ ao lado de "Modelo: Padrão OZZ".
- **Gerador de Termo de Adesão** — lê a proposta aprovada e gera o Termo no modelo oficial. Campos não preenchidos saem destacados em amarelo no Word.

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
