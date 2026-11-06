# Planilha de registro — como configurar

> Login com Google: veja [LOGIN_GOOGLE.md](LOGIN_GOOGLE.md).

A planilha guarda uma linha por proposta e por Termo e controla a numeração,
para dois consultores nunca receberem o mesmo número.

## Primeira configuração (≈10 min, uma vez só)

1. Entre com a **conta Google da OZZ** que vai ser dona da planilha e crie uma planilha nova,
   por exemplo **"OZZ – Propostas e Termos"**.
2. Na planilha, vá em **Extensões → Apps Script**. Apague o que estiver no editor e cole todo o
   conteúdo de [`Codigo.gs`](Codigo.gs). Clique em **Salvar** (ícone de disquete).
3. Volte para a planilha e **recarregue a página**. Aparece o menu **OZZ Gerador**.
4. **OZZ Gerador → Configurar planilha.** O Google vai pedir autorização: escolha a conta → se aparecer
   "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)** → **Permitir**
   (o aviso aparece porque o script é da própria OZZ). Rode **Configurar planilha** de novo se a
   autorização interromper. São criadas as abas **Propostas**, **Termos** e **Config**, e aparece o
   **código de sincronização** (OZZ-XXXX-XXXX-XXXX).
5. Na aba **Config**, célula **B1**, coloque o **próximo número de proposta** (ex.: 700001).
6. No Apps Script, clique em **Implantar → Nova implantação** → engrenagem → **App da Web**:
   Executar como **Eu**, Quem pode acessar **Qualquer pessoa** → **Implantar**. Copie o
   **URL do app da Web** (termina em `/exec`) e mande para ser colocado no portal.
7. **Em cada computador** que vai gerar propostas e termos: no portal, **configurar numeração →
   Planilha do Google → Código de sincronização**, cole o código, clique em **Testar conexão** e **Salvar**.
8. **Compartilhe a planilha** só com quem precisa ver os dados — ela guarda CPF, endereço e consumo.

## Atualizar o script (quando o `Codigo.gs` mudar)

1. Extensões → Apps Script → apague tudo, cole o novo `Codigo.gs` e salve.
2. **Implantar → Gerenciar implantações** → lápis → Versão: **Nova versão** → **Implantar**.
   Assim o endereço `/exec` continua o mesmo.
3. Recarregue a planilha. Se o menu **OZZ Gerador** pedir, rode **Configurar planilha** (não apaga nada).

## Código de sincronização

- Ver o código: **OZZ Gerador → Mostrar código de sincronização**.
- Trocar o código (se vazou ou alguém saiu da equipe): **OZZ Gerador → Gerar novo código**.
  Os computadores com o código antigo param de registrar até receberem o novo.
- O código **não fica no código do portal** (que é público no GitHub): fica guardado só na planilha
  e em cada computador.

**Segurança:** sem o código, o script recusa tudo. Com o código, ele só grava linhas e devolve o
número da proposta; ele nunca devolve CPF, endereço ou outros dados de clientes.
