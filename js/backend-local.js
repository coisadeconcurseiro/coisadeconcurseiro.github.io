/* =====================================================================
   MODO DEMONSTRAÇÃO (sem Firebase)
   Tudo fica no localStorage deste navegador. Serve para testar o site
   antes de configurar o Firebase. Não use em produção: os dados não
   saem deste aparelho. A senha nunca é guardada: só um hash PBKDF2
   com sal, apenas para simular o login.
   ===================================================================== */
const CHAVE = 'cdc_demo_v1';
const MATS = ['DTRAB', 'PTRAB', 'DCIV', 'PCIV', 'DADM', 'DCONST'];

function ler() {
  try { return JSON.parse(localStorage.getItem(CHAVE)) || { contas: {}, docs: {}, nomes: {}, ranking: {}, cadernos: {}, simulados: {}, sessao: null }; }
  catch (e) { return { contas: {}, docs: {}, nomes: {}, ranking: {}, cadernos: {}, simulados: {}, sessao: null }; }
}
function gravar(db) { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch (e) { console.warn('localStorage indisponível', e); } }
function id() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
function erro(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

async function hash(senha, sal) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(sal), iterations: 120000, hash: 'SHA-256' }, chave, 256);
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function docInicial(username) {
  const pc = {}, pe = {}, ciclo = {};
  MATS.forEach(m => { pc[m] = {}; pe[m] = {}; ciclo[m] = []; });
  return { username, criadoEm: Date.now(), r: {}, dias: {}, pc, pe, ciclo, em: Date.now(), zeradoEm: null };
}

export function criarBackendLocal() {
  let ouvinte = null;
  let atual = null;
  const avisar = () => ouvinte && ouvinte(atual);

  return {
    modo: 'demo',
    async iniciar(cb) {
      ouvinte = cb;
      const db = ler();
      if (db.sessao && db.contas[db.sessao]) atual = { uid: db.sessao, email: db.contas[db.sessao].email };
      avisar();
    },
    async nomeDisponivel(username) {
      return !ler().nomes[username.toLowerCase()];
    },
    async cadastrar({ username, email, senha }) {
      const db = ler();
      email = email.trim().toLowerCase();
      if (Object.values(db.contas).some(c => c.email === email)) throw erro('auth/email-already-in-use');
      if (db.nomes[username.toLowerCase()]) throw erro('nome-em-uso');
      if (senha.length < 6) throw erro('auth/weak-password');
      const uid = 'demo-' + id();
      const sal = id();
      db.contas[uid] = { email, sal, h: await hash(senha, sal) };
      db.nomes[username.toLowerCase()] = uid;
      db.docs[uid] = docInicial(username);
      db.ranking[uid] = { u: username, pts: {}, resp: {}, total: 0, totalResp: 0, em: Date.now() };
      db.sessao = uid;
      gravar(db);
      atual = { uid, email };
      avisar();
    },
    async entrar(email, senha) {
      const db = ler();
      email = email.trim().toLowerCase();
      const uid = Object.keys(db.contas).find(k => db.contas[k].email === email);
      if (!uid) throw erro('auth/invalid-credential');
      const c = db.contas[uid];
      if (await hash(senha, c.sal) !== c.h) throw erro('auth/invalid-credential');
      db.sessao = uid; gravar(db);
      atual = { uid, email };
      avisar();
    },
    async sair() { const db = ler(); db.sessao = null; gravar(db); atual = null; avisar(); },
    async redefinirSenha(email) {
      // No modo demonstração não há envio de e-mail.
      throw erro('demo/sem-email');
    },
    async carregarDoc() {
      const db = ler();
      return db.docs[atual.uid] || null;
    },
    async definirUsername(username) {
      const db = ler();
      if (db.nomes[username.toLowerCase()]) throw erro('nome-em-uso');
      db.nomes[username.toLowerCase()] = atual.uid;
      db.docs[atual.uid] = docInicial(username);
      db.ranking[atual.uid] = { u: username, pts: {}, resp: {}, total: 0, totalResp: 0, em: Date.now() };
      gravar(db);
    },
    /* patch: { r:{id:obj}, dias:{data:obj}, pcAdd:{M:[ids]}, peAdd:{M:[ids]}, ciclo:{M:[ids]}|null }, rank: objeto do ranking */
    async salvarProgresso(patch, rank) {
      const db = ler();
      const d = db.docs[atual.uid];
      Object.assign(d.r, patch.r || {});
      Object.assign(d.dias, patch.dias || {});
      for (const m of MATS) {
        (patch.pcAdd?.[m] || []).forEach(q => { if (!d.pe[m][q]) d.pc[m][q] = true; });
        (patch.peAdd?.[m] || []).forEach(q => { if (!d.pc[m][q]) d.pe[m][q] = true; });
      }
      if (patch.ciclo) Object.assign(d.ciclo, patch.ciclo);
      d.em = Date.now();
      if (rank) db.ranking[atual.uid] = { ...rank, em: Date.now() };
      gravar(db);
    },
    async zerar() {
      const db = ler();
      const d = db.docs[atual.uid];
      d.r = {}; d.dias = {}; MATS.forEach(m => d.ciclo[m] = []); d.zeradoEm = Date.now(); d.em = Date.now();
      delete db.simulados[atual.uid];
      gravar(db);
    },
    async listarCadernos() {
      const db = ler();
      return Object.entries(db.cadernos[atual.uid] || {}).map(([k, v]) => ({ id: k, ...v }));
    },
    async salvarCaderno(cid, dados) {
      const db = ler();
      db.cadernos[atual.uid] = db.cadernos[atual.uid] || {};
      const k = cid || id();
      const antigo = db.cadernos[atual.uid][k];
      db.cadernos[atual.uid][k] = { ...dados, criadoEm: antigo?.criadoEm || Date.now(), atualizadoEm: Date.now() };
      gravar(db);
      return k;
    },
    async excluirCaderno(cid) {
      const db = ler();
      if (db.cadernos[atual.uid]) delete db.cadernos[atual.uid][cid];
      gravar(db);
    },
    async listarSimulados() {
      const db = ler();
      return Object.entries(db.simulados[atual.uid] || {}).map(([k, v]) => ({ id: k, ...v }));
    },
    async salvarSimulado(dados) {
      const db = ler();
      db.simulados[atual.uid] = db.simulados[atual.uid] || {};
      const k = id();
      db.simulados[atual.uid][k] = { ...dados, criadoEm: Date.now() };
      gravar(db);
      return k;
    },
    async excluirSimulado(sid) {
      const db = ler();
      if (db.simulados[atual.uid]) delete db.simulados[atual.uid][sid];
      gravar(db);
    },
    async ranking() {
      const db = ler();
      return Object.entries(db.ranking).map(([uid, v]) => ({ uid, ...v }));
    },
    async excluirConta(senha) {
      const db = ler();
      const c = db.contas[atual.uid];
      if (await hash(senha, c.sal) !== c.h) throw erro('auth/invalid-credential');
      const u = db.docs[atual.uid]?.username;
      if (u) delete db.nomes[u.toLowerCase()];
      delete db.contas[atual.uid]; delete db.docs[atual.uid]; delete db.ranking[atual.uid];
      delete db.cadernos[atual.uid]; delete db.simulados[atual.uid];
      db.sessao = null; gravar(db);
      atual = null; avisar();
    }
  };
}
