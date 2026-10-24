# Como atualizar o banco de questões sem perder o progresso dos usuários

## Como o progresso fica guardado

Todo o progresso dos usuários fica preso ao **código fixo** de cada questão, como `DTRAB-001` ou `DCONST-165`. Isso vale para as respostas, o Raio-X, os pontos do ranking, os cadernos e os simulados. O código é formado pela sigla da matéria e por um número sequencial:

| Matéria | Sigla | Códigos hoje |
|---|---|---|
| Direito do Trabalho | DTRAB | DTRAB-001 a DTRAB-205 |
| Direito Processual do Trabalho | PTRAB | PTRAB-001 a PTRAB-145 |
| Direito Civil | DCIV | DCIV-001 a DCIV-120 |
| Direito Processual Civil | PCIV | PCIV-001 a PCIV-280 |
| Direito Administrativo | DADM | DADM-001 a DADM-200 |
| Direito Constitucional | DCONST | DCONST-001 a DCONST-165 |

**Regra de ouro:** um código, depois de publicado, **nunca muda de questão e nunca é reaproveitado**. Questões novas recebem sempre o próximo número livre da matéria. Por exemplo, a próxima questão de Direito Civil será a `DCIV-121`, mesmo que no caderno em PDF ela apareça no meio do tópico 3.

Todas as questões ficam num único arquivo: **`dados/questoes.js`**. As regras do Firestore e os dados dos usuários **não precisam mudar** quando você acrescenta questões.

## Opção 1 (mais simples): pedir ao Claude

No projeto "Estudo Reverso TRT-8 2026":

1. Gere o caderno comentado novo ou ampliado, no mesmo padrão dos atuais.
2. Anexe o caderno em PDF **e** o arquivo `dados/questoes.js` que está publicado hoje no GitHub.
3. Peça: *"Atualize o banco de questões do site com este caderno, mantendo os códigos das questões que já existem, e me mostre o relatório."*
4. Envie o `questoes.js` novo para a pasta `dados` do GitHub, substituindo o antigo (Add file › Upload files › Commit changes).

## Opção 2: rodar a ferramenta você mesma

A pasta `ferramentas` tem o programa **`atualizar_banco.py`**. Ele:

- lê os cadernos em PDF, no mesmo padrão dos atuais;
- reconhece as questões que **já existem**, comparando o enunciado com as alternativas, e **mantém o código delas**, mesmo que tenham mudado de posição ou de tópico;
- dá o próximo código livre para cada questão **nova**;
- atualiza o gabarito e os comentários das questões existentes quando você corrigir alguma coisa no caderno, desde que o enunciado e as alternativas continuem iguais;
- **mantém** as questões antigas que não estiverem no PDF novo. Para apagá-las, use a opção `--remover-ausentes`.

Passo a passo (precisa do Python 3 instalado):

```bash
pip install pymupdf
python3 ferramentas/atualizar_banco.py --banco dados/questoes.js caminho/do/Caderno_Civil_novo.pdf
```

O programa mostra um relatório parecido com este:

```
Direito Civil: 130 no PDF · 120 mantidas com o mesmo código · 10 novas · 0 removidas · 0 antigas fora deste PDF (mantidas)
Total no banco: 1125 questões.
```

Depois, envie o `dados/questoes.js` atualizado para o GitHub.

## Casos especiais

- **Corrigir só um gabarito ou um comentário:** se o enunciado e as alternativas continuarem iguais, a questão mantém o código. As estatísticas antigas continuam valendo como foram registradas.
- **Mudar o enunciado ou alguma alternativa de uma questão:** a ferramenta vai tratar a versão nova como **outra questão**, com código novo. A antiga continua no banco, a menos que você use `--remover-ausentes`. Se quiser que o código antigo seja mantido mesmo assim, peça ao Claude para fazer a troca manualmente.
- **Remover questões:** os cadernos que as continham passam a ignorá-las, com um aviso na tela do caderno. Os pontos de ranking já conquistados não são retirados.
- **Uma matéria nova** (por exemplo, Língua Portuguesa): exige uma pequena mudança no código do site e nas regras do Firestore, porque a sigla nova precisa ser acrescentada. Peça ao Claude: *"Inclua a matéria X no site de questões"*. Depois, envie os arquivos alterados e publique as regras novas (Etapa 4 do guia).
- **Composição do simulado** (10/10/5/5/5/5): fica na constante `SIM_COMP` do arquivo `js/app.js`.

## O que nunca fazer

- Não renumere as questões e não edite os códigos à mão.
- Não apague o arquivo `questoes.js` antigo antes de ter o novo pronto.
- Não troque a sigla de uma matéria (`DCIV`, `PCIV`…).

## Questão repetida entre matérias

Hoje, uma questão aparece em dois cadernos: **DCIV-016** (Direito Civil) e **DADM-184** (Direito Administrativo), da prova da ALERR 2026. As duas versões ficam no banco, uma em cada matéria, como nos cadernos.
