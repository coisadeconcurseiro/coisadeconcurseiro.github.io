# Guia de publicação: GitHub Pages + Firebase

Este guia leva o site **Coisa de Concurseiro · Questões** do seu computador para um link público, com contas, progresso, cadernos e ranking salvos no Firebase. Você não precisa saber programar: é só criar contas, clicar e colar.

Tempo estimado: 30 a 40 minutos, na primeira vez.

> Os nomes dos menus podem variar um pouco, porque o Google e o GitHub mudam as telas de vez em quando. Se algum botão estiver com outro nome, procure o mais parecido.

---

## O que você vai precisar

- A pasta **site-questoes-trt8** (do arquivo `site-questoes-trt8.zip`), descompactada no seu computador. Dentro dela ficam `index.html` e as pastas `css`, `js`, `dados`, `img` e `ferramentas`.
- Uma conta Google, para o Firebase.
- Uma conta no GitHub (github.com).

---

## Parte 1 — Firebase (contas e banco de dados)

### Etapa 1. Criar o projeto

1. Acesse **console.firebase.google.com** e entre com sua conta Google.
2. Clique em **Criar um projeto** (ou **Adicionar projeto**).
3. Dê um nome, por exemplo `coisa-de-concurseiro-questoes`, e clique em **Continuar**.
4. Na tela do Google Analytics, pode **desativar**: o site não usa. Clique em **Criar projeto** e espere terminar.
5. Ainda no projeto, abra **⚙ Configurações do projeto › Geral** e, em **Nome voltado ao público**, escreva `Coisa de Concurseiro`. É esse nome que aparece nos e-mails de redefinição de senha.

O projeto já começa no plano gratuito **Spark**. Não é preciso cadastrar cartão.

### Etapa 2. Ativar o login por e-mail e senha

1. No menu da esquerda, abra **Criação (Build) › Authentication** e clique em **Vamos começar**.
2. Na aba **Método de login**, clique em **E-mail/senha**.
3. Ative **só a primeira chave** (E-mail/senha). Deixe "Link do e-mail (login sem senha)" desligado.
4. Clique em **Salvar**.
5. Opcional: na aba **Modelos**, clique no lápis do modelo **Redefinição de senha** e confira o idioma **Português (Brasil)**. O site já pede os e-mails em português automaticamente.

As senhas ficam só no Firebase Authentication. O site e o banco de dados nunca recebem nem guardam senha.

### Etapa 3. Criar o banco de dados (Cloud Firestore)

1. No menu da esquerda, abra **Criação (Build) › Firestore Database** e clique em **Criar banco de dados**.
2. Se o Firebase perguntar a edição, escolha a **Standard**.
3. Local: escolha **southamerica-east1 (São Paulo)**. **Atenção:** o local não pode ser trocado depois.
4. Escolha **Iniciar no modo de produção** e clique em **Criar**.

### Etapa 4. Colar as regras de segurança

1. Ainda em **Firestore Database**, abra a aba **Regras**.
2. Apague todo o texto que estiver lá.
3. Abra o arquivo `firestore.rules`, que está na pasta do site, no Bloco de Notas. Copie **tudo** e cole no Firebase.
4. Clique em **Publicar**.

Se aparecer um erro em vermelho, confira se você copiou o arquivo inteiro, do `rules_version = '2';` até a última chave `}`.

### Etapa 5. Registrar o site e colar a configuração

1. Clique na engrenagem **⚙ › Configurações do projeto**.
2. Na aba **Geral**, desça até **Seus apps** e clique no ícone **`</>`** (Web).
3. Apelido do app: `site-questoes`. **Não** marque "Firebase Hosting". Clique em **Registrar app**.
4. Vai aparecer um bloco de código parecido com este:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "coisa-de-concurseiro-questoes.firebaseapp.com",
     projectId: "coisa-de-concurseiro-questoes",
     storageBucket: "coisa-de-concurseiro-questoes.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
5. No seu computador, abra o arquivo **`js/config.js`** no Bloco de Notas. Copie cada valor que está entre aspas e cole entre as aspas vazias correspondentes:
   ```js
   window.FIREBASE_CONFIG = {
     apiKey: "AIza...",
     authDomain: "coisa-de-concurseiro-questoes.firebaseapp.com",
     projectId: "coisa-de-concurseiro-questoes",
     storageBucket: "coisa-de-concurseiro-questoes.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abc123"
   };
   ```
6. Salve o arquivo.

Essa configuração **não é senha nem segredo**. Ela só diz ao site qual projeto do Firebase usar, e pode ficar pública no GitHub sem problema. Quem protege os dados são as regras da Etapa 4.

Enquanto o `apiKey` estiver vazio, o site funciona em **modo demonstração**: tudo fica só no navegador de quem está usando, e aparece uma faixa roxa avisando.

---

## Parte 2 — GitHub Pages (o link público)

### Etapa 6. Criar o repositório

1. Entre em **github.com** e clique em **+ › New repository**.
2. Nome: por exemplo `questoes-trt8`.
3. Marque **Public**. O GitHub Pages gratuito exige repositório público.
4. Clique em **Create repository**.

### Etapa 7. Enviar os arquivos

1. Na página do repositório, clique em **uploading an existing file** (ou **Add file › Upload files**).
2. Abra a pasta **site-questoes-trt8** no seu computador, selecione **tudo o que está dentro dela** (`index.html`, `css`, `js`, `dados`, `img`, `ferramentas`, `firestore.rules` e os arquivos `.md`) e arraste para a página do GitHub.
   - Arraste o conteúdo da pasta, não a pasta inteira. O `index.html` precisa ficar na "raiz" do repositório.
3. Espere terminar o envio. O arquivo de questões tem cerca de 2 MB e pode levar alguns segundos.
4. Clique em **Commit changes**.

### Etapa 8. Ligar o GitHub Pages

1. No repositório, abra **Settings › Pages**.
2. Em **Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha **main** e a pasta **/ (root)**. Clique em **Save**.
4. Espere 1 ou 2 minutos e recarregue a página. Vai aparecer o endereço do site, no formato
   **`https://SEU-USUARIO.github.io/questoes-trt8/`**

### Etapa 9. Autorizar o endereço no Firebase

1. No Firebase, abra **Authentication › Configurações › Domínios autorizados**.
2. Clique em **Adicionar domínio** e digite **`SEU-USUARIO.github.io`**, sem `https://` e sem o nome do repositório.
3. Salve.

### Etapa 10. Testar

1. Abra o link do site no computador e no celular.
2. Crie uma conta, resolva duas ou três questões e abra o **Raio-X** e o **Ranking**.
3. No Firebase, em **Firestore Database › Dados**, devem aparecer as coleções `users`, `usernames` e `ranking`.
4. Teste o **Esqueci minha senha** com o seu e-mail. Se o e-mail não chegar, confira a caixa de spam.

Pronto! Agora é só divulgar o link no canal.

---

## Cotas do plano gratuito (Spark)

Por dia, o plano gratuito permite cerca de **50 mil leituras** e **20 mil gravações** no Firestore. O site foi feito para economizar:

- O progresso inteiro da pessoa é **um único documento**: uma leitura ao entrar.
- As respostas são agrupadas e gravadas **no máximo uma vez a cada 2 segundos**. Cada gravação conta como 1 a 2 operações (progresso + ranking).
- O ranking é lido quando a pessoa abre a tela e fica guardado por 1 minuto. Cada usuário cadastrado custa 1 leitura.

Na prática, dá para atender **milhares de questões resolvidas por dia** sem custo. Se um dia a cota acabar, as gravações voltam a funcionar na virada do dia (meia-noite no horário do Pacífico, por volta de 4h ou 5h em Brasília). Você acompanha o uso em **Firestore Database › Uso**.

---

## Segurança: o que as regras garantem e quais são os limites

**Garantido pelas regras do Firestore:**
- Ninguém lê nem altera o progresso, os cadernos ou os simulados de outra pessoa.
- Ninguém altera a linha de outra pessoa no ranking.
- O nome de usuário é único e não pode ser tomado por outra pessoa.
- A pontuação do ranking precisa ser **igual** ao registro de primeiras tentativas da própria pessoa. Esse registro **só cresce**: não dá para apagar uma resposta errada para tentar de novo, nem marcar a mesma questão como certa e errada.
- No máximo 60 primeiras tentativas novas por gravação e uma gravação a cada 2 segundos. Isso freia scripts.
- O e-mail não aparece para ninguém. O ranking mostra só o nome de usuário.

**O limite (vale para qualquer site gratuito sem servidor próprio):** o gabarito precisa estar no site para mostrar a correção na hora. Por isso, alguém com conhecimento técnico pode, de propósito, registrar "acertei" em questões que nem resolveu. Mesmo assim, o teto é **1 ponto por questão do banco** (1.115 hoje), e ninguém consegue mexer nos pontos de outra pessoa. Para bloquear isso de vez seria preciso um servidor pago (Cloud Functions, no plano Blaze) corrigindo as respostas.

**Se aparecer alguém suspeito no ranking:**
1. Em **Authentication › Usuários**, encontre a pessoa e clique em **⋮ › Desativar conta**. Ela não consegue mais entrar.
2. Em **Firestore Database › Dados › ranking**, apague o documento dela. O código do documento é o mesmo "UID de usuário" que aparece em Authentication.

**Login por nome de usuário:** ficou de fora de propósito. Para isso funcionar, o vínculo entre nome de usuário e e-mail teria de ficar público, e qualquer pessoa conseguiria descobrir os e-mails a partir dos nomes do ranking. Por isso, o login é só por e-mail e senha.

---

## Atualizar o site depois

- **Mudou algum arquivo** (por exemplo, um banco de questões novo)? No GitHub, abra a pasta correspondente, clique em **Add file › Upload files**, envie o arquivo com **o mesmo nome** e clique em **Commit changes**. O site se atualiza em 1 ou 2 minutos.
- O progresso, os cadernos e o ranking ficam no Firebase. **Reenviar arquivos do site não apaga nada disso.**
- Para incluir novas questões, siga o arquivo **ATUALIZAR_BANCO.md**.
