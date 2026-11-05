# Portal Interno · OZZ Energia

Portal de uso interno da OZZ Energia / Energia Certa Consórcio.

**Acesse:** https://ozzenergia.github.io/portal-ozz-energia/

## O que tem

- **Gerador de Propostas** — carrega o template da proposta (.docx) uma vez, lê a fatura em PDF (layout RGE/CPFL), calcula média de consumo, plano de desconto, custo e economia, e gera a proposta preenchida.
- **Gerador de Termo de Adesão** — lê a proposta aprovada e gera o Termo no modelo oficial. Campos não preenchidos saem destacados em amarelo no Word.

Tudo roda no navegador: nenhum arquivo ou dado de cliente é enviado para servidor.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O portal (página única) |
| `modelos/PROPOSTA_OZZ_ENERGIA_MODELO.docx` | Template padrão da proposta (campos `{…}`) |
| `modelos/TERMO_DE_ADESAO_MODELO.docx` | Template do Termo (também embutido no portal) |

## Campos do template da proposta

Marque no Word os pontos a preencher com chaves, por exemplo `{titular}`, `{consumo}`, `{plano}`, `{desconto}`, `{custo_mensal}`, `{economia_mensal}`, `{economia_anual}`, `{numero_proposta}`, `{data}`.
Campos que o portal não reconhece aparecem em "Outros campos do template" para preencher à mão.
