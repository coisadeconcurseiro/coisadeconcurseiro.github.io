# Coisa de Concurseiro · Questões

Banco gratuito de questões comentadas para o **TRT-8 2026 (FCC) – Analista Judiciário, Área Judiciária**, do Projeto Estude Comigo para TRT ([youtube.com/@coisadeconcurseiro](https://www.youtube.com/@coisadeconcurseiro)).

O site não tem servidor próprio: as páginas ficam no GitHub Pages, e as contas e o progresso ficam no Firebase (Authentication + Cloud Firestore, no plano gratuito Spark).

## Arquivos

| Arquivo / pasta | O que é |
|---|---|
| `index.html` | página do site (aplicativo de uma página só) |
| `css/estilo.css` | visual da tela (tema escuro padrão e tema claro) |
| `css/impressao.css` | visual da impressão dos cadernos (A4, padrão claro dos PDFs) |
| `js/config.js` | **configuração do Firebase** (preencha seguindo o guia) e dados do canal |
| `js/app.js` | telas: Questões, Simulados, Meus cadernos, Raio-X, Ranking e Minha conta |
| `js/backend-firebase.js` | ligação com o Firebase |
| `js/backend-local.js` | modo demonstração (sem Firebase, dados só no navegador) |
| `js/vendor/` | SDK oficial do Firebase 12.19.0 (licença Apache 2.0) |
| `dados/questoes.js` | as 1.115 questões, com códigos fixos |
| `img/` | logotipo e ícones |
| `firestore.rules` | regras de segurança do Firestore |
| `ferramentas/atualizar_banco.py` | atualiza o banco a partir de novos cadernos em PDF |
| `GUIA_PUBLICACAO.md` | passo a passo para publicar (GitHub Pages + Firebase) |
| `ATUALIZAR_BANCO.md` | como acrescentar questões sem perder o progresso |

## Testar no computador

O site usa módulos JavaScript, então precisa ser aberto por um servidor local, e não com dois cliques no `index.html`:

```bash
cd site-questoes-trt8
python3 -m http.server 8000
# abra http://localhost:8000
```

Enquanto o `js/config.js` estiver sem a configuração do Firebase, o site roda em **modo demonstração**.

## Atalhos ao resolver questões

Teclas **A** a **E** marcam a alternativa · **Enter** responde ou passa para a próxima · **← / →** navegam entre as questões.
