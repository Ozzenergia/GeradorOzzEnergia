# Login com Google — como ligar

O login usa a conta Google (Gmail) de cada pessoa. O Google confirma quem é, e a planilha
decide quem pode registrar: só e-mails **ativos** na aba **Usuários**.

## 1. Criar o "ID do cliente" no Google Cloud (≈10 min, uma vez só)

1. Acesse **console.cloud.google.com** com a conta Google da OZZ (a mesma da planilha, de preferência)
   e aceite os termos se for o primeiro acesso.
2. No topo, clique no seletor de projetos → **Novo projeto** → nome **OZZ Portal** → **Criar**.
   Confira que o projeto **OZZ Portal** ficou selecionado no topo.
3. Menu ☰ → **APIs e serviços → Tela de permissão OAuth** (pode aparecer como **Google Auth Platform**)
   → **Começar**:
   - Nome do app: **OZZ Portal** · E-mail de suporte: o e-mail da OZZ
   - Público: **Externo**
   - Dados de contato: o e-mail da OZZ → aceite a política → **Criar**
4. Em **Público** (Audience), clique em **Publicar app** → confirmar. O status fica **Em produção**.
   (O portal só pede nome, e-mail e foto, então o Google não exige verificação. Sem publicar,
   só "usuários de teste" cadastrados ali conseguiriam entrar.)
5. Em **Clientes** → **Criar cliente**:
   - Tipo de aplicativo: **Aplicativo da Web** · Nome: **Portal GitHub**
   - **Origens JavaScript autorizadas** → Adicionar URI: `https://ozzenergia.github.io`
   - (não precisa preencher "URIs de redirecionamento")
   - **Criar** e copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
6. **Mande esse ID** para ser colocado no portal. Ele não é segredo: o Google só aceita login
   vindo de `ozzenergia.github.io`.

## 2. Preparar a planilha

1. Atualize o script (veja [COMO_CONFIGURAR.md](COMO_CONFIGURAR.md) → "Atualizar o script"):
   cole o novo `Codigo.gs`, salve e implante uma **Nova versão**.
2. Recarregue a planilha → **OZZ Gerador → Configurar planilha**. O Google vai pedir uma
   autorização nova ("conectar a um serviço externo"): é o script conferindo o login com o Google.
3. Surge a aba **Usuários**, já com o seu e-mail como admin. Inclua cada pessoa que vai usar o portal:

   | E-mail | Nome | Perfil | Ativo |
   |---|---|---|---|
   | ana@gmail.com | Ana Souza | vendedor | SIM |

   **Perfis** (a coluna tem uma lista para escolher):

   | Perfil | O que acessa |
   |---|---|
   | `ti` | tudo (geradores, pós-venda e análise), e ainda pode **ver como** outro perfil (só muda a tela; a planilha continua usando o perfil verdadeiro) |
   | `admin` | tudo (geradores, pós-venda e análise) |
   | `administrativo` | só os geradores (propostas e termos) |
   | `vendedor` | geradores e pós-venda |

   Perfil vazio ou diferente desses (por exemplo o antigo `consultor`) vale como **vendedor**.
   A planilha também confere o perfil: um administrativo não consegue buscar clientes do pós-venda
   mesmo que abra o link direto.

   O **Nome** é o que aparece como consultor nas propostas. Para tirar o acesso de alguém, troque
   **Ativo** para **NÃO** (vale na hora, sem mexer no portal).

## 3. Ligar

Depois que o portal estiver atualizado com o ID do cliente, cole o mesmo ID na aba **Config**,
célula **B3**. A partir daí:

- só quem entrou com Google e está ativo em **Usuários** registra propostas e termos;
- o código de sincronização deixa de valer;
- quem entrar como **visitante** pode testar, mas nada é registrado e as propostas saem com número **TESTE-…**.

Para desligar o login (voltar ao código de sincronização), basta apagar a célula **B3**.
