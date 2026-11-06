# Planilha de registro — como configurar (≈10 min, uma vez só)

A planilha guarda uma linha por proposta e por Termo e controla a numeração,
para dois consultores nunca receberem o mesmo número.

1. Entre com a **conta Google da OZZ** que vai ser dona da planilha e crie uma planilha nova,
   por exemplo **"OZZ – Propostas e Termos"**.
2. Na planilha, vá em **Extensões → Apps Script**. Apague o que estiver no editor e cole todo o
   conteúdo de [`Codigo.gs`](Codigo.gs). Clique em **Salvar** (ícone de disquete).
3. No topo do editor, escolha a função **`configurar`** e clique em **Executar**.
   O Google vai pedir autorização: **Revisar permissões** → escolha a conta → se aparecer
   "O Google não verificou este app", clique em **Avançado → Acessar (não seguro)** → **Permitir**.
   (O aviso aparece porque o script é da própria OZZ, não de uma empresa verificada pelo Google.)
4. Volte para a planilha: foram criadas as abas **Propostas**, **Termos** e **Config**.
   Na aba **Config**, célula **B1**, coloque o **próximo número de proposta** (ex.: 700001).
5. No Apps Script, clique em **Implantar → Nova implantação** → engrenagem → **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**

   Clique em **Implantar** e copie o **URL do app da Web** (termina em `/exec`).
6. Mande esse endereço para ser colocado no portal. Até lá dá para testar colando-o em
   **configurar numeração → Planilha do Google**, no seu navegador.
7. **Compartilhe a planilha** (botão Compartilhar) só com quem precisa ver os dados — ela guarda
   CPF, endereço e consumo dos clientes.

**Se o script for alterado depois:** em Implantar → Gerenciar implantações → lápis → Versão:
"Nova versão" → Implantar. Assim o endereço continua o mesmo.

**Segurança:** o script só grava linhas e devolve o número da proposta. Ele não devolve CPF,
endereço nem outros dados de clientes, então quem tiver o endereço não consegue ler a planilha.
