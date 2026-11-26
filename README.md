# Portal Interno · OZZ Energia

Portal de uso interno da OZZ Energia / Energia Certa Consórcio.

**Acesse:** https://ozzenergia.github.io/GeradorOzzEnergia/

## O que tem

- **Gerador de Propostas** — usa o modelo padrão de Energia por Assinatura (não precisa carregar), lê a fatura em PDF ou **foto** (layout RGE/CPFL; a foto é lida no próprio navegador com Tesseract.js), calcula média de consumo, plano de desconto, custo e economia, e gera a proposta preenchida. Outro modelo pode ser importado pelo ícone ⇪ ao lado de "Modelo: Padrão OZZ".
- **Gerador de Termo de Adesão** — lê a proposta aprovada e gera o Termo no modelo oficial. Campos não preenchidos saem destacados em amarelo no Word.

- **Cadastro único de clientes** (Clientes → Registrar / Tabela) — além dos dados de contato, guarda o contrato: UC antiga,
  status, entrada no rateio (Anexo G), usina, responsável, % de desconto (vem do plano escolhido e pode ser mudado), base do
  desconto, R$/kWh do investidor (só TI e Admin veem), consumo médio e tipo de fornecimento. As Cobranças, o cálculo da
  cobrança e o Rateio usam o cadastro primeiro e só depois a planilha de controle. Cliente conectado com usina entra no
  Rateio ao salvar. O botão **Completar pela planilha de controle** (TI e Admin) mostra uma prévia e cadastra os clientes que
  faltam e completa os campos vazios, sem trocar nada que já está preenchido.

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
  **Importar de uma pasta do Google Drive:** no Leitor, cole o link de uma pasta (precisa estar no Drive, ou compartilhada
  com, a conta que implantou o script). O portal lista os PDFs (com subpastas), lê um por um e, ao guardar, copia cada PDF
  para "Faturas RGE (portal OZZ)". Os arquivos importados ficam na aba **Faturas Importadas** e são pulados da próxima vez.
  Também dá para **arrastar uma pasta inteira** (com subpastas) ou o **.zip** baixado do Drive direto no Leitor (o .zip é
  aberto no próprio navegador), ou usar "escolher uma pasta". Só os PDFs entram.
  **Faturas não lidas:** o que o Leitor não consegue ler vai para a aba **Faturas não lidas** (arquivo, origem, motivo,
  tentativas), aparece no botão "Faturas não lidas guardadas" e não se perde quando a página fecha. As que vieram do Drive
  podem ser lidas de novo com um clique; quando uma é lida e guardada, sai da lista.
  **PDF escaneado:** é lido como imagem (o mesmo leitor de fotos, no navegador) e fica marcado **CONFERIR**: só é guardado
  depois de clicar em "Conferi" e confirmar a UC. As linhas da conta só valem para o cálculo da cobrança se os números
  baterem (kWh × tarifa = valor).
  **Usina x unidade consumidora:** o site reconhece se a UC é **USINA** (Rateio Usinas ou abas INVESTIDORES, FATURAS GERADOR
  e GERADORES - CONSÓRCIO da planilha de controle) ou **BENEFICIÁRIA** (cadastro, CLIENTES ou Rateio Beneficiárias) e mostra
  a etiqueta no Leitor, nas Contas a pagar e na ficha do cliente. Fatura de usina fica marcada na aba Faturas Lidas
  (coluna "Tipo da UC"), fora das Cobranças, e o PDF vai para **Faturas RGE (portal OZZ)/Usinas geradoras/AAAA-MM**; as das
  unidades consumidoras vão para **.../Unidades consumidoras/AAAA-MM**. O botão "Organizar os PDFs do Drive" separa os PDFs
  já guardados (os links não mudam). Propostas e Termo avisam quando a UC é uma usina.
- **Rateio enviado à RGE:** em Rateio de créditos → "Rateios salvos desta usina", o botão **Marcar enviado à RGE** pede a
  data do envio do Anexo G, marca o rateio como "ENVIADO À RGE" e grava essa data como **entrada no rateio** no cadastro das
  UCs novas (as que nunca estiveram num rateio enviado e ainda não têm data). Quem já tinha data não muda; UC fora do cadastro
  é cadastrada com a usina. As Cobranças passam a mostrar esses clientes como "Aguardando 1ª fatura".
- **PROGRAMAÇÃO acompanha as abas dos meses:** a cada 10 minutos, a conta da RGE marcada **PAGO** na coluna RGE da aba do
  mês também fica **PAGO** na aba PROGRAMAÇÃO da planilha de controle (mesma UC, nova ou antiga, e mesma data de vencimento),
  com uma nota na célula dizendo de qual aba veio. Só marca PAGO: nunca desfaz nem muda outra situação. Para desligar,
  escreva NÃO em Config!B9 da planilha do portal.
- **Cobranças abrem na hora:** o navegador guarda uma cópia da última leitura das Cobranças (IndexedDB, por usuário; é
  apagada ao sair). A tela e o painel "O que fazer hoje" abrem com essa cópia ("Mostrando o que foi lido em dd/mm às hh:mm ·
  atualizando…") e a leitura nova entra sozinha quando chega. Se uma ficha ou a janela de marcar estiver aberta, a leitura
  nova espera ela fechar, para não perder o que está sendo digitado.
- **O que fazer hoje** (tela inicial do portal — abre ao entrar e ao clicar no logo OZZ; TI e Admin): um painel com o que está pendente, cada item abre a ficha:
  cobranças vencidas, para emitir no Asaas, para enviar, que vencem em até 3 dias; faturas da RGE que chegaram no e-mail
  e falta ler no Leitor; clientes novos sem Anexo G enviado (e se já estão num rateio salvo); 1ª fatura atrasada (mais de
  90 dias da entrada no rateio); cobranças do portal para conferir; contas da RGE vencidas ou vencendo em até 3 dias.
- **Consultar UC** (Clientes → Consultar UC): digite a UC (nova ou antiga) ou o nome e veja tudo numa tela: cadastro,
  cobranças, faturas lidas (com Ver PDF), rateio (usina e % no último rateio), contas da RGE e pós-venda. Para usina:
  geração estimada × real, último rateio e titular. Cada perfil só vê as partes a que tem acesso.
- **Termo de adesão → cadastro:** ao registrar o termo, o cliente entra (ou é completado) no cadastro com o **% de desconto
  da proposta** (pelo número dela ou, sem número, a proposta mais nova da mesma UC), desconto "sobre o total", o consumo
  médio e o status CONTRATO ASSINADO. Só preenche o que estiver vazio.
- **Anexo G (formulários da RGE) gerado pelo portal:** no Rateio de créditos, cada rateio salvo tem o botão **📄 Anexo G**.
  A janela confere a soma (100%), avisa UCs sem CPF/CNPJ e pede os dados do titular da usina (nome, CPF/CNPJ, e-mail,
  responsável quando PJ, UC âncora), que ficam guardados na aba Rateio Usinas para a próxima vez. Gera:
  **Anexo G.2 (Word)**, o formulário de alteração de percentuais e beneficiárias, com a tabela de até 30 UCs (acima disso
  sai "conforme lista anexa"); e a **Lista de rateio G.3 (Excel)** da geração compartilhada (UC, %, CPF/CNPJ sem pontos,
  nome), sem limite de linhas. Os modelos ficam em `modelos/ANEXO_G2_MODELO.docx` e `modelos/ANEXO_G3_MODELO.xlsx`.
  Depois de assinar e enviar para microgeracaorge@cpfl.com.br, use **Marcar enviado à RGE**.
- **Cobrança do mês criada pelo portal (período em paralelo):** cada fatura da RGE lida no Leitor (de cliente, não de usina)
  vira uma cobrança na aba **Cobranças Portal**: valor sem a OZZ, desconto do plano (cadastro do cliente; senão a ASSINATURA),
  cobrança, investidor e lucro, com vencimento **2 dias antes** do vencimento da conta da RGE (Config!B8 muda os dias).
  O mês da cobrança segue o padrão de cada cliente na planilha de controle (aba do mês da referência ou do seguinte);
  cliente novo usa o mês do vencimento da RGE. Nas Cobranças a cobrança aparece como "Não emitida" com o valor pronto para
  emitir no Asaas; a ficha tem "Ajustar valor" (pede o motivo e guarda quem mudou). Cobrança já emitida não muda se a fatura
  for relida: só aparece um aviso. A vista **Planilha × portal** mostra iguais, diferentes, só no portal e só na planilha,
  e o botão "Recalcular cobranças do portal" (use uma vez depois de atualizar o script, para as faturas já lidas).
  Quando os números baterem por 1 ou 2 meses, a planilha de controle pode deixar de ser a fonte.
- **Pós-venda na ficha do cliente:** a ficha (nas Cobranças e no Cadastro de clientes) mostra as visitas do app de pós-venda
  daquele cliente: data, funcionário, nota e perfil (promotor/neutro/detrator), tratativa (aberta/em contato/resolvida),
  motivo, problema, próximo passo, anotações, indicações, brinde e o link da assinatura. O portal só **lê** a aba Visitas da
  planilha central "OZZ Visitas": cole o ID ou link dela em **Config!B7** da planilha do portal (a conta que implantou o
  Apps Script precisa ter acesso a ela). Acha as visitas pela UC (nova ou antiga) e, se a visita não tiver UC, pelo nome.
- **Geração real das usinas:** o Leitor lê na tabela do medidor a "Energia Injetada" (na fatura da usina, é a geração do
  mês) e grava em Faturas Lidas. No Rateio de créditos aparece "Fatura da usina de MM/AAAA: X kWh injetados (±% da estimada)",
  e o quadro "Geração estimada × real". **A fatura é o número oficial:** quando há fatura lida da usina no mês, o Rateio já
  usa essa geração; a estimada (aba Rateio Geração) só entra quando a fatura ainda não chegou. Nas **Contas a pagar**, cada conta é conferida com a
  fatura lida da mesma UC e mês ("✓ confere" ou o valor da fatura) e tem o botão **Ver PDF**.

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
