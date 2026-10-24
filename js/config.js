/* =====================================================================
   CONFIGURAÇÃO DO SITE
   ---------------------------------------------------------------------
   1) Cole abaixo a configuração do seu projeto Firebase (veja o
      GUIA_PUBLICACAO.md, etapa 5). Enquanto "apiKey" estiver vazio,
      o site funciona em MODO DEMONSTRAÇÃO: as contas e o progresso
      ficam guardados só no navegador de quem está usando.
   2) A configuração do Firebase para sites NÃO é segredo: ela só
      identifica o projeto. Quem protege os dados são as regras do
      Firestore (arquivo firestore.rules). Nunca coloque senhas aqui.
   ===================================================================== */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDpyd4LBvv7H0eLnS2YZrCaEtsF14O0B18",
  authDomain: "coisa-de-concurseiro-questoes.firebaseapp.com",
  projectId: "coisa-de-concurseiro-questoes",
  storageBucket: "coisa-de-concurseiro-questoes.firebasestorage.app",
  messagingSenderId: "305817193192",
  appId: "1:305817193192:web:2b925f6e5297b83681d75d"
};

/* Dados do canal (aparecem no menu, no login e no rodapé) */
window.SITE = {
  nome: "Coisa de Concurseiro",
  subtitulo: "Questões",
  projeto: "Projeto Estude Comigo para TRT",
  concurso: "TRT-8 2026 · FCC · Analista Judiciário – Área Judiciária",
  canal: "https://www.youtube.com/@coisadeconcurseiro",
  canalNome: "@coisadeconcurseiro",
  aviso: "Iniciativa independente e gratuita, sem vínculo oficial com tribunais."
};
