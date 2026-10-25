/* =====================================================================
   BACKEND FIREBASE (Authentication + Cloud Firestore)
   SDK oficial do Firebase 12.19.0, copiado para js/vendor/.
   ===================================================================== */
import { initializeApp } from './vendor/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail, reauthenticateWithCredential, EmailAuthProvider, deleteUser
} from './vendor/firebase-auth.js';
import {
  getFirestore, doc, getDoc, getDocs, collection, writeBatch, serverTimestamp,
  FieldPath, addDoc, setDoc, deleteDoc, updateDoc, query, where, Timestamp,
  getCountFromServer, collectionGroup
} from './vendor/firebase-firestore.js';

const MATS = ['DTRAB', 'PTRAB', 'DCIV', 'PCIV', 'DADM', 'DCONST'];
const ms = v => (v && typeof v.toMillis === 'function') ? v.toMillis() : (v ?? null);

function zeros() { const o = {}; MATS.forEach(m => o[m] = 0); return o; }

export function criarBackendFirebase(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'pt-BR';
  const db = getFirestore(app);
  let atual = null;
  let segurarAviso = false;
  let ouvinte = null;

  const ref = {
    user: () => doc(db, 'users', atual.uid),
    rank: () => doc(db, 'ranking', atual.uid),
    nome: n => doc(db, 'usernames', n.toLowerCase()),
    cadernos: () => collection(db, 'users', atual.uid, 'cadernos'),
    simulados: () => collection(db, 'users', atual.uid, 'simulados')
  };

  function loteInicial(batch, uid, username) {
    const pc = {}, pe = {}, ciclo = {};
    MATS.forEach(m => { pc[m] = {}; pe[m] = {}; ciclo[m] = []; });
    batch.set(doc(db, 'usernames', username.toLowerCase()), { uid });
    batch.set(doc(db, 'users', uid), {
      username, criadoEm: serverTimestamp(), r: {}, dias: {}, pc, pe, ciclo,
      em: serverTimestamp(), zeradoEm: null
    });
    batch.set(doc(db, 'ranking', uid), {
      u: username, pts: zeros(), resp: zeros(), total: 0, totalResp: 0, em: serverTimestamp()
    });
  }

  return {
    modo: 'firebase',
    async iniciar(cb) {
      ouvinte = cb;
      onAuthStateChanged(auth, u => {
        atual = u ? { uid: u.uid, email: u.email } : null;
        if (!segurarAviso) cb(atual);
      });
    },
    async nomeDisponivel(username) {
      const s = await getDoc(ref.nome(username));
      return !s.exists();
    },
    async cadastrar({ username, email, senha }) {
      segurarAviso = true;
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        atual = { uid: cred.user.uid, email: cred.user.email };
        const b = writeBatch(db);
        loteInicial(b, cred.user.uid, username);
        await b.commit();
      } catch (e) {
        if (cred) {
          try { await deleteUser(cred.user); } catch (_) { await signOut(auth); }
          if (e.code === 'permission-denied') { const x = new Error('nome-em-uso'); x.code = 'nome-em-uso'; segurarAviso = false; throw x; }
        }
        segurarAviso = false;
        throw e;
      }
      segurarAviso = false;
      ouvinte && ouvinte(atual);
    },
    async entrar(email, senha) { await signInWithEmailAndPassword(auth, email.trim(), senha); },
    async sair() { await signOut(auth); },
    async redefinirSenha(email) { await sendPasswordResetEmail(auth, email.trim()); },

    async carregarDoc() {
      const s = await getDoc(ref.user());
      if (!s.exists()) return null;
      const d = s.data();
      d.criadoEm = ms(d.criadoEm); d.em = ms(d.em); d.zeradoEm = ms(d.zeradoEm);
      MATS.forEach(m => { d.pc[m] = d.pc[m] || {}; d.pe[m] = d.pe[m] || {}; d.ciclo[m] = d.ciclo?.[m] || []; });
      return d;
    },
    async definirUsername(username) {
      const b = writeBatch(db);
      loteInicial(b, atual.uid, username);
      try { await b.commit(); }
      catch (e) { if (e.code === 'permission-denied') { const x = new Error('nome-em-uso'); x.code = 'nome-em-uso'; throw x; } throw e; }
    },

    async salvarProgresso(patch, rank) {
      const b = writeBatch(db);
      const pares = [];
      for (const [q, v] of Object.entries(patch.r || {})) pares.push(new FieldPath('r', q), v);
      for (const [dia, v] of Object.entries(patch.dias || {})) pares.push(new FieldPath('dias', dia), v);
      for (const m of MATS) {
        (patch.pcAdd?.[m] || []).forEach(q => pares.push(new FieldPath('pc', m, q), true));
        (patch.peAdd?.[m] || []).forEach(q => pares.push(new FieldPath('pe', m, q), true));
        if (patch.ciclo && patch.ciclo[m]) pares.push(new FieldPath('ciclo', m), patch.ciclo[m]);
      }
      b.update(ref.user(), 'em', serverTimestamp(), ...pares);
      if (rank) b.set(ref.rank(), { ...rank, em: serverTimestamp() });
      await b.commit();
    },
    async zerar() {
      const b = writeBatch(db);
      const ciclo = {}; MATS.forEach(m => ciclo[m] = []);
      b.update(ref.user(), { r: {}, dias: {}, ciclo, zeradoEm: serverTimestamp(), em: serverTimestamp() });
      await b.commit();
      const sims = await getDocs(ref.simulados());
      await Promise.all(sims.docs.map(d => deleteDoc(d.ref)));
    },

    async listarCadernos() {
      const s = await getDocs(ref.cadernos());
      return s.docs.map(d => { const v = d.data(); return { id: d.id, ...v, criadoEm: ms(v.criadoEm), atualizadoEm: ms(v.atualizadoEm) }; });
    },
    async salvarCaderno(cid, dados) {
      const corpo = { nome: dados.nome, qids: dados.qids, ordem: dados.ordem || 'banco', atualizadoEm: serverTimestamp() };
      if (cid) {
        const r = doc(db, 'users', atual.uid, 'cadernos', cid);
        await setDoc(r, corpo, { merge: true });
        return cid;
      }
      const r = await addDoc(ref.cadernos(), { ...corpo, criadoEm: serverTimestamp() });
      return r.id;
    },
    async excluirCaderno(cid) { await deleteDoc(doc(db, 'users', atual.uid, 'cadernos', cid)); },

    async listarSimulados() {
      const s = await getDocs(ref.simulados());
      return s.docs.map(d => { const v = d.data(); return { id: d.id, ...v, criadoEm: ms(v.criadoEm) }; });
    },
    async salvarSimulado(dados) {
      const r = await addDoc(ref.simulados(), { ...dados, criadoEm: serverTimestamp() });
      return r.id;
    },
    async excluirSimulado(sid) { await deleteDoc(doc(db, 'users', atual.uid, 'simulados', sid)); },

    async ranking() {
      const s = await getDocs(collection(db, 'ranking'));
      return s.docs.map(d => ({ uid: d.id, ...d.data(), em: ms(d.data().em) }));
    },

    /* ---------------- presença, acessos, bloqueio ---------------- */
    async bloqueado() {
      try { return (await getDoc(doc(db, 'bloqueios', atual.uid))).exists(); } catch (e) { return false; }
    },
    async pulso(u) { await setDoc(doc(db, 'presenca', atual.uid), { u, em: serverTimestamp() }); },
    async sairPresenca() { try { await deleteDoc(doc(db, 'presenca', atual.uid)); } catch (e) { } },
    async contarOnline() {
      const s = await getCountFromServer(query(collection(db, 'presenca'), where('em', '>=', Timestamp.fromMillis(Date.now() - 180000))));
      return s.data().count;
    },
    async registrarAcesso(u, dia) {
      await setDoc(doc(db, 'acessos', dia + '_' + atual.uid), { dia, uid: atual.uid, u, em: serverTimestamp() });
    },
    /* ---------------- mensagens (Fale comigo) ---------------- */
    async enviarMensagem({ u, tipo, texto, qid }) {
      await addDoc(collection(db, 'mensagens'), { uid: atual.uid, u, tipo, texto, qid: qid || null, criadoEm: serverTimestamp(), lida: false, resposta: null, respondidaEm: null, vista: false });
    },
    async minhasMensagens() {
      const s = await getDocs(query(collection(db, 'mensagens'), where('uid', '==', atual.uid)));
      return s.docs.map(d => { const v = d.data(); return { id: d.id, ...v, criadoEm: ms(v.criadoEm), respondidaEm: ms(v.respondidaEm) }; });
    },
    async marcarVista(id) { await updateDoc(doc(db, 'mensagens', id), { vista: true }); },
    /* ---------------- administrador ---------------- */
    async admUsuarios() {
      const [us, pr, bl] = await Promise.all([getDocs(collection(db, 'users')), getDocs(collection(db, 'presenca')), getDocs(collection(db, 'bloqueios'))]);
      const pres = {}; pr.docs.forEach(d => { pres[d.id] = ms(d.data().em); });
      const usuarios = us.docs.map(d => { const v = d.data(); return { uid: d.id, username: v.username, criadoEm: ms(v.criadoEm), r: v.r || {}, dias: v.dias || {}, ultimo: pres[d.id] || null }; });
      const bloqueados = bl.docs.map(d => ({ uid: d.id, ...d.data(), em: ms(d.data().em) }));
      return { usuarios, bloqueados, presenca: pres };
    },
    async admAcessosPorDia(dias) {
      return Promise.all(dias.map(async dia => (await getCountFromServer(query(collection(db, 'acessos'), where('dia', '==', dia)))).data().count));
    },
    async admAcessosDoDia(dia) {
      const s = await getDocs(query(collection(db, 'acessos'), where('dia', '==', dia)));
      return s.docs.map(d => ({ ...d.data(), em: ms(d.data().em) }));
    },
    async admContarSimulados() { return (await getCountFromServer(collectionGroup(db, 'simulados'))).data().count; },
    async admContarNaoLidas() { return (await getCountFromServer(query(collection(db, 'mensagens'), where('lida', '==', false)))).data().count; },
    async admMensagens() {
      const s = await getDocs(collection(db, 'mensagens'));
      return s.docs.map(d => { const v = d.data(); return { id: d.id, ...v, criadoEm: ms(v.criadoEm), respondidaEm: ms(v.respondidaEm) }; });
    },
    async admMarcarLida(id, lida) { await updateDoc(doc(db, 'mensagens', id), { lida }); },
    async admResponder(id, resposta) { await updateDoc(doc(db, 'mensagens', id), { resposta, respondidaEm: serverTimestamp(), lida: true, vista: false }); },
    async admExcluirMensagem(id) { await deleteDoc(doc(db, 'mensagens', id)); },
    async admExcluirUsuario(uid, username) {
      await setDoc(doc(db, 'bloqueios', uid), { u: username || '', em: serverTimestamp() });
      const [cads, sims] = await Promise.all([getDocs(collection(db, 'users', uid, 'cadernos')), getDocs(collection(db, 'users', uid, 'simulados'))]);
      await Promise.all([...cads.docs, ...sims.docs].map(d => deleteDoc(d.ref)));
      const b = writeBatch(db);
      b.delete(doc(db, 'ranking', uid)); b.delete(doc(db, 'presenca', uid)); b.delete(doc(db, 'users', uid));
      if (username) b.delete(doc(db, 'usernames', username.toLowerCase()));
      await b.commit();
    },
    async admDesbloquear(uid) { await deleteDoc(doc(db, 'bloqueios', uid)); },

    async excluirConta(senha) {
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, senha));
      const perfil = await getDoc(ref.user());
      const [cads, sims] = await Promise.all([getDocs(ref.cadernos()), getDocs(ref.simulados())]);
      await Promise.all([...cads.docs, ...sims.docs].map(d => deleteDoc(d.ref)));
      await deleteDoc(ref.rank());
      try { await deleteDoc(doc(db, 'presenca', atual.uid)); } catch (e) { }
      if (perfil.exists()) await deleteDoc(ref.nome(perfil.data().username));
      await deleteDoc(ref.user());
      await deleteUser(u);
    }
  };
}
