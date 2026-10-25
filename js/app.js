/* =====================================================================
   Coisa de Concurseiro · Questões — aplicativo
   ===================================================================== */
import { criarBackendLocal } from './backend-local.js';

const B = window.BANCO;
const SITE = window.SITE;
const MATS = B.materias.map(m => m.id);
const MAT = Object.fromEntries(B.materias.map(m => [m.id, m]));
const Q = {};
B.questoes.forEach((q, i) => { q.i = i; Q[q.id] = q; });
const TOP = {};
B.materias.forEach(m => m.topicos.forEach(t => { TOP[m.id + ':' + t.n] = t.t; }));
const ORGAOS = [...new Set(B.questoes.filter(q => q.org).map(q => q.org))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
const ANOS = [...new Set(B.questoes.filter(q => q.ano).map(q => q.ano))].sort((a, b) => b - a);
const SIM_COMP = { DTRAB: 10, PTRAB: 10, DCIV: 5, PCIV: 5, DADM: 5, DCONST: 5 };
const SIM_TOTAL = 40;
const LETRAS = 'ABCDE';
const MIN_REVISAO = 5;       // mínimo de respostas no assunto para entrar na lista de revisão
const LIMITE_REVISAO = 70;   // aproveitamento abaixo deste % entra na revisão
const MAX_CADERNO = 500;
const INTERVALO_GRAVACAO = 2300; // ms entre gravações (as regras do Firestore exigem 2 s)

const S = {
  backend: null, user: null, doc: null,
  cadernos: null, simulados: null, rank: null, rankEm: 0,
  filtros: {}, pratica: null, sim: null, simTimer: null,
  fila: null, gravando: false, ultimaGravacao: 0, timerFila: null,
  rankAba: 'geral'
};

/* ------------------------------------------------------------------ utilidades */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const hojeISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const fmtPct = (a, b) => b ? `${pct(a, b)}%` : '—';
const num = n => Number(n || 0).toLocaleString('pt-BR');
function fmtData(ms, hora = false) {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleDateString('pt-BR') + (hora ? ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
}
function fmtTempo(seg) {
  seg = Math.max(0, Math.round(seg));
  const h = Math.floor(seg / 3600), m = Math.floor(seg % 3600 / 60), s = seg % 60;
  return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
}
function aleatorio(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
function embaralhar(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = aleatorio(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function iniciais(n) { return esc((n || '?').slice(0, 1).toUpperCase()); }
function porBanco(ids) { return [...ids].sort((a, b) => Q[a].i - Q[b].i); }

function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 6000 : 3200);
}

/* modal genérico: botoes = [{rot, cls, acao(raiz) -> false para manter aberto}] */
function modal({ titulo, corpo, botoes = [], aoAbrir }) {
  return new Promise(resolve => {
    const raiz = document.createElement('div');
    raiz.className = 'modal-fundo';
    raiz.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <h2>${esc(titulo)}</h2><div class="modal-corpo">${corpo}</div>
      <div class="botoes">${botoes.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${b.rot}</button>`).join('')}</div></div>`;
    $('#modal-raiz').appendChild(raiz);
    const fechar = v => { raiz.remove(); resolve(v); };
    raiz.addEventListener('click', async e => {
      if (e.target === raiz) return fechar(null);
      const bt = e.target.closest('button[data-i]');
      if (!bt) return;
      const b = botoes[+bt.dataset.i];
      if (!b.acao) return fechar(b.valor ?? null);
      bt.disabled = true;
      try {
        const r = await b.acao(raiz);
        if (r !== false) fechar(r === undefined ? true : r);
      } finally { bt.disabled = false; }
    });
    raiz.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(null); });
    aoAbrir && aoAbrir(raiz);
    const foco = raiz.querySelector('input, select, button.btn-ouro, button');
    foco && foco.focus();
  });
}
function confirmar(titulo, texto, rotOk = 'Confirmar', perigo = false) {
  return modal({
    titulo, corpo: `<p>${texto}</p>`,
    botoes: [{ rot: 'Cancelar', cls: 'btn-texto', valor: false }, { rot: rotOk, cls: perigo ? 'btn-perigo' : 'btn-ouro', valor: true }]
  }).then(v => v === true);
}

/* ------------------------------------------------------------------ ícones */
const IC = {
  questoes: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  simulados: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>',
  cadernos: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18M11 8h4"/></svg>',
  raiox: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  ranking: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M8 21V11H3v10zM15 21V5h-6v16zM21 21v-7h-6v7z"/></svg>',
  conta: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  contato: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  admin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/></svg>',
  yt: '<svg viewBox="0 0 24 24" width="20" height="20"><rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="M10 9v6l5-3z" fill="#0E2449"/></svg>',
  sol: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  lua: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'
};

/* ------------------------------------------------------------------ tema */
function tema() { return document.documentElement.getAttribute('data-tema') || 'escuro'; }
function alternarTema() {
  const novo = tema() === 'escuro' ? 'claro' : 'escuro';
  document.documentElement.setAttribute('data-tema', novo);
  try { localStorage.setItem('cdc_tema', novo); } catch (e) { }
  desenharMenu();
  if (location.hash.startsWith('#/conta')) render();
}

/* ------------------------------------------------------------------ progresso: gravação em fila */
function calcRank() {
  const pts = {}, resp = {};
  let total = 0, totalResp = 0;
  MATS.forEach(m => {
    pts[m] = Object.keys(S.doc.pc[m] || {}).length;
    resp[m] = pts[m] + Object.keys(S.doc.pe[m] || {}).length;
    total += pts[m]; totalResp += resp[m];
  });
  return { u: S.doc.username, pts, resp, total, totalResp };
}
function juntarPatch(a, b) {
  if (!a) return b;
  const r = { r: { ...a.r, ...b.r }, dias: { ...a.dias, ...b.dias }, pcAdd: {}, peAdd: {}, ciclo: (a.ciclo || b.ciclo) ? { ...(a.ciclo || {}), ...(b.ciclo || {}) } : null };
  MATS.forEach(m => {
    const pc = [...(a.pcAdd?.[m] || []), ...(b.pcAdd?.[m] || [])];
    const pe = [...(a.peAdd?.[m] || []), ...(b.peAdd?.[m] || [])];
    if (pc.length) r.pcAdd[m] = pc;
    if (pe.length) r.peAdd[m] = pe;
  });
  return r;
}
function enfileirar(patch) {
  S.fila = juntarPatch(S.fila, patch);
  agendarGravacao();
}
function agendarGravacao(atraso) {
  clearTimeout(S.timerFila);
  const espera = atraso ?? Math.max(0, INTERVALO_GRAVACAO - (Date.now() - S.ultimaGravacao));
  S.timerFila = setTimeout(gravarFila, espera);
}
async function gravarFila(tentativa = 0) {
  if (!S.fila || S.gravando) return;
  if (Date.now() - S.ultimaGravacao < INTERVALO_GRAVACAO) return agendarGravacao();
  const patch = S.fila; S.fila = null; S.gravando = true;
  const muda = MATS.some(m => patch.pcAdd?.[m]?.length || patch.peAdd?.[m]?.length);
  try {
    await S.backend.salvarProgresso(patch, muda ? calcRank() : null);
    S.ultimaGravacao = Date.now();
    S.rank = null;
  } catch (e) {
    console.error('Falha ao gravar progresso', e);
    S.ultimaGravacao = Date.now();
    S.fila = juntarPatch(patch, S.fila || { r: {}, dias: {}, pcAdd: {}, peAdd: {} });
    if (tentativa < 2) { S.gravando = false; setTimeout(() => gravarFila(tentativa + 1), 3000); return; }
    toast('Não foi possível salvar seu progresso agora. Recarregando seus dados do servidor…', 'erro');
    S.fila = null;
    try { S.doc = await S.backend.carregarDoc(); } catch (_) { }
  }
  S.gravando = false;
  if (S.fila) agendarGravacao();
}
window.addEventListener('beforeunload', e => {
  if (S.fila || S.gravando) { gravarFila(); e.preventDefault(); e.returnValue = ''; }
});

/* registra respostas (lista de {id, alt}) no documento local e na fila */
function registrarRespostas(lista) {
  const agora = Date.now();
  const dia = hojeISO();
  const patch = { r: {}, dias: {}, pcAdd: {}, peAdd: {} };
  for (const { id, alt } of lista) {
    const q = Q[id]; if (!q) continue;
    const ok = alt === q.g;
    const ant = S.doc.r[id] || { n: 0, a: 0 };
    const novo = { n: ant.n + 1, a: ant.a + (ok ? 1 : 0), l: alt, ok, t: agora };
    S.doc.r[id] = novo; patch.r[id] = novo;
    const dd = S.doc.dias[dia] || { r: 0, a: 0 };
    const nd = { r: dd.r + 1, a: dd.a + (ok ? 1 : 0) };
    S.doc.dias[dia] = nd; patch.dias[dia] = nd;
    if (!S.doc.pc[q.m][id] && !S.doc.pe[q.m][id]) {
      (ok ? S.doc.pc : S.doc.pe)[q.m][id] = true;
      const k = ok ? 'pcAdd' : 'peAdd';
      (patch[k][q.m] = patch[k][q.m] || []).push(id);
    }
  }
  enfileirar(patch);
}

/* ------------------------------------------------------------------ filtros */
function filtrosPadrao() { return { mats: [], tops: [], origem: 'todas', orgs: [], anos: [], situacao: 'todas', qtd: '20', ordem: 'banco' }; }
function situacaoDe(id) {
  const r = S.doc?.r?.[id];
  if (!r) return 'nao';
  return r.ok ? 'acertei' : 'errei';
}
function aplicarFiltros(f) {
  return B.questoes.filter(q => {
    if (f.mats.length && !f.mats.includes(q.m)) return false;
    if (f.tops.length && !f.tops.includes(q.m + ':' + q.tp)) return false;
    if (f.origem === 'reais' && !q.r) return false;
    if (f.origem === 'ineditas' && q.r) return false;
    if (f.orgs.length && !f.orgs.includes(q.org)) return false;
    if (f.anos.length && !f.anos.includes(q.ano)) return false;
    if (f.situacao !== 'todas' && situacaoDe(q.id) !== f.situacao) return false;
    return true;
  }).map(q => q.id);
}
function msHTML(nome, rotulo, opcoes, sel, larga = false) {
  const marcados = new Set(sel.map(String));
  let resumo = 'Todos';
  if (sel.length === 1) resumo = opcoes.find(o => String(o.v) === String(sel[0]))?.t || '1 selecionado';
  else if (sel.length > 1) resumo = `${sel.length} selecionados`;
  let lista = '', grupo = null;
  for (const o of opcoes) {
    if (o.g && o.g !== grupo) { grupo = o.g; lista += `<div class="grupo">${esc(grupo)}</div>`; }
    lista += `<label><input type="checkbox" value="${esc(o.v)}" ${marcados.has(String(o.v)) ? 'checked' : ''}><span>${esc(o.t)}</span></label>`;
  }
  return `<div class="campo" data-campo="${nome}"><span>${rotulo}</span>
    <details class="ms" data-ms="${nome}"><summary>${esc(resumo)}</summary>
    <div class="ms-lista ${larga ? 'larga' : ''}"><div class="ms-acoes"><button type="button" class="btn btn-texto btn-peq" data-acao="ms-limpar">Limpar</button><button type="button" class="btn btn-ouro btn-peq" data-acao="ms-ok">OK</button></div>${lista || '<p class="apagado pequeno">Nada para escolher.</p>'}</div></details></div>`;
}
function opcoesTopicos(f) {
  const mats = f.mats.length ? f.mats : MATS;
  const op = [];
  mats.forEach(m => MAT[m].topicos.forEach(t => op.push({ v: m + ':' + t.n, t: `${t.n}. ${t.t}`, g: MAT[m].nome })));
  return op;
}
function filtrosHTML(chave, { situacao = true, extras = true } = {}) {
  const f = S.filtros[chave];
  const sel = (nome, rot, ops) => `<label class="campo"><span>${rot}</span><select data-f="${nome}">${ops.map(([v, t]) => `<option value="${v}" ${f[nome] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  return `<div class="filtros" data-filtros="${chave}">
    ${msHTML('mats', 'Matéria', B.materias.map(m => ({ v: m.id, t: m.nome })), f.mats)}
    ${msHTML('tops', 'Assunto (tópico do edital)', opcoesTopicos(f), f.tops, true)}
    ${sel('origem', 'Origem', [['todas', 'Todas'], ['reais', 'Reais da FCC'], ['ineditas', 'Inéditas (padrão FCC)']])}
    ${msHTML('orgs', 'Órgão', ORGAOS.map(o => ({ v: o, t: o })), f.orgs)}
    ${msHTML('anos', 'Ano', ANOS.map(a => ({ v: a, t: String(a) })), f.anos)}
    ${situacao ? sel('situacao', 'Situação', [['todas', 'Todas'], ['nao', 'Não resolvidas'], ['acertei', 'Acertei'], ['errei', 'Errei']]) : ''}
    ${extras ? sel('qtd', 'Quantidade', [['10', '10 questões'], ['20', '20 questões'], ['30', '30 questões'], ['50', '50 questões'], ['100', '100 questões'], ['todas', 'Todas as encontradas']]) : ''}
    ${extras ? sel('ordem', 'Ordem', [['banco', 'Ordem do banco'], ['aleatoria', 'Aleatória']]) : ''}
  </div>`;
}
function atualizarContagem(chave) {
  const n = aplicarFiltros(S.filtros[chave]).length;
  $$(`[data-contagem="${chave}"]`).forEach(el => { el.innerHTML = `<b>${num(n)}</b> ${n === 1 ? 'questão encontrada' : 'questões encontradas'}`; });
  $$(`[data-precisa="${chave}"]`).forEach(b => { b.disabled = n === 0; });
}
function aoMudarFiltro(ev) {
  const caixa = ev.target.closest('[data-filtros]');
  if (!caixa) return;
  const chave = caixa.dataset.filtros;
  const f = S.filtros[chave];
  const ms = ev.target.closest('[data-ms]');
  if (ms) {
    const nome = ms.dataset.ms;
    const vals = $$('input:checked', ms).map(i => i.value);
    f[nome] = nome === 'anos' ? vals.map(Number) : vals;
    atualizarResumoMs(ms, f[nome]);
    if (nome === 'mats') {
      if (f.mats.length) f.tops = f.tops.filter(t => f.mats.includes(t.split(':')[0]));
      const campo = $('[data-campo="tops"]', caixa);
      campo.outerHTML = msHTML('tops', 'Assunto (tópico do edital)', opcoesTopicos(f), f.tops, true);
    }
  } else if (ev.target.matches('select[data-f]')) {
    f[ev.target.dataset.f] = ev.target.value;
  }
  atualizarContagem(chave);
}
function atualizarResumoMs(ms, sel) {
  const s = $('summary', ms);
  if (!sel.length) s.textContent = 'Todos';
  else if (sel.length === 1) s.textContent = $(`input[value="${CSS.escape(String(sel[0]))}"]`, ms)?.nextElementSibling?.textContent || '1 selecionado';
  else s.textContent = `${sel.length} selecionados`;
}
function idsDosFiltros(chave) {
  const f = S.filtros[chave];
  let ids = aplicarFiltros(f);
  if (f.ordem === 'aleatoria') ids = embaralhar(ids);
  if (f.qtd !== 'todas') ids = ids.slice(0, +f.qtd);
  return ids;
}
document.addEventListener('click', e => {
  $$('details.ms[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

/* ------------------------------------------------------------------ questão: HTML */
const RE_JURIS = /S[úu]m(ula)?\.?\s|S[úu]mula|\bOJ\b|\bOJs\b|STF|STJ|TST|\bTema\b|\bADI\b|\bADC\b|\bADPF\b|\bRE\s|\bREsp\b|IRR|IRDR|Precedente|Repercuss|\bSV\b|Vinculante|\bIAC\b|Informativo/;
function pilulaOrigem(q) {
  return q.r ? `<span class="pilula p-fcc">${esc(q.o)}</span>` : `<span class="pilula p-inedita">${esc(q.o)}</span>`;
}
function enunciadoHTML(q) {
  let h = '<div class="enunciado">', itens = [];
  const descarregar = () => { if (itens.length) { h += `<div class="itens">${itens.join('')}</div>`; itens = []; } };
  for (const b of q.e) {
    if (Array.isArray(b)) itens.push(`<div class="item"><b>${esc(b[0])}</b><span>${esc(b[1])}</span></div>`);
    else { descarregar(); h += `<p>${esc(b)}</p>`; }
  }
  descarregar();
  return h + '</div>';
}
function correcaoHTML(q, marcada) {
  let h = '<div class="correcao">';
  if (q.ai) {
    h += `<div class="analise"><div class="pilula p-caso" style="margin-bottom:6px">ANÁLISE DOS ITENS</div>${q.ai.map(([r, t]) => `<div class="linha"><b>${esc(r)}</b><span>${esc(t)}</span></div>`).join('')}</div>`;
  }
  h += '<h3>Fundamentação de cada alternativa</h3>';
  q.c.forEach(([ref, txt], k) => {
    const certa = k === q.g;
    const juris = RE_JURIS.test(ref);
    h += `<div class="coment ${certa ? 'c-certa' : 'c-errada'} ${marcada === k ? 'sua' : ''}">
      <div class="c-topo"><span class="c-letra">${LETRAS[k]}</span>
      <span class="pilula ${certa ? 'p-certa' : 'p-errada'}">${certa ? 'CERTA ✓' : 'ERRADA ✗'}</span>
      ${marcada === k ? '<span class="pilula p-neutra">SUA RESPOSTA</span>' : ''}
      <span class="ref ${juris ? 'juris' : 'lei'}">${esc(ref)}</span></div>
      <p>${esc(txt)}</p></div>`;
  });
  return h + '</div>';
}
function questaoHTML(q, { num, total, marcada = null, respondida = false, modo = 'pratica' }) {
  const ok = respondida && marcada === q.g;
  const r = S.doc?.r?.[q.id];
  let alts = '<ol class="alternativas">';
  q.a.forEach((t, k) => {
    let cls = '';
    if (respondida) { if (k === q.g) cls = 'certa'; else if (k === marcada) cls = 'errada'; }
    else if (k === marcada) cls = 'marcada';
    alts += `<li><button type="button" class="alt ${cls}" data-acao="marcar" data-alt="${k}" ${respondida ? 'disabled' : ''} aria-pressed="${k === marcada}">
      <span class="letra">${LETRAS[k]}</span><span class="txt">${esc(t)}</span></button></li>`;
  });
  alts += '</ol>';
  const historico = (modo === 'pratica' && r && !respondida)
    ? `<span class="pilula ${r.ok ? 'p-certa' : 'p-errada'}" title="Sua última resposta a esta questão">${r.ok ? 'Você já acertou' : 'Você já errou'} · ${r.n}×</span>` : '';
  return `<article class="questao ${respondida ? (ok ? 'acertou' : 'errou') : ''}" data-qid="${q.id}">
    <div class="q-cab"><span class="q-num">Questão ${num}${total ? ` <span class="apagado" style="font-size:.85rem">de ${total}</span>` : ''}</span>${pilulaOrigem(q)}${historico}<span class="q-cod">${q.id}</span></div>
    <div class="q-topico">${esc(MAT[q.m].nome)} · <b>${q.tp}. ${esc(TOP[q.m + ':' + q.tp])}</b></div>
    ${enunciadoHTML(q)}
    ${alts}
    ${respondida && modo !== 'simulado' ? `<div class="resultado ${ok ? 'ok' : 'nok'}"><span class="ic"><span>${ok ? '✓' : '✗'}</span></span>${ok ? 'Você acertou!' : (marcada == null ? `Sem resposta. Gabarito: ${LETRAS[q.g]}` : `Você errou. Gabarito: ${LETRAS[q.g]}`)}</div>` : ''}
    ${respondida ? correcaoHTML(q, marcada) : ''}
    ${modo !== 'simulado' ? `<div class="q-erro"><button type="button" class="btn btn-texto btn-peq" data-acao="avisar-erro" data-id="${q.id}">⚑ Avisar erro nesta questão</button></div>` : ''}
  </article>`;
}

/* ------------------------------------------------------------------ menu */
const ROTAS = [
  ['questoes', 'Questões', IC.questoes], ['simulados', 'Simulados', IC.simulados], ['cadernos', 'Meus cadernos', IC.cadernos],
  ['raio-x', 'Raio-X', IC.raiox], ['ranking', 'Ranking', IC.ranking], ['contato', 'Fale comigo', IC.contato], ['conta', 'Minha conta', IC.conta]
];
const ehAdmin = () => !!(S.user && window.ADMIN_UID && S.user.uid === window.ADMIN_UID);
function rotas() { return ehAdmin() ? [...ROTAS, ['admin', 'Administrador', IC.admin]] : ROTAS; }
function seloMenu(r) {
  if (r === 'contato' && S.respostasNovas) return `<span class="selo-menu">${S.respostasNovas}</span>`;
  if (r === 'admin' && S.naoLidas) return `<span class="selo-menu">${S.naoLidas}</span>`;
  return '';
}
function pilulaOnline() {
  if (S.online == null) return '';
  return `<span class="online-agora" title="Pessoas com o site aberto nos últimos 3 minutos"><i></i><b>${num(S.online)}</b> ${S.online === 1 ? 'estudando agora' : 'estudando agora'}</span>`;
}
function atualizarOnlineNaTela() {
  $$('[data-online]').forEach(el => { el.innerHTML = pilulaOnline(); });
}
function desenharMenu() {
  const atual = (location.hash.split('/')[1] || 'questoes');
  $('#menu').innerHTML = `
    <a class="logo" href="#/questoes"><img src="img/logo-192.png" alt="Logotipo Coisa de Concurseiro">
      <span><span class="coisa">COISA DE</span><span class="concurseiro">Concurseiro</span><span class="sub">Questões · TRT-8 2026 · FCC</span></span></a>
    <nav>${rotas().map(([r, t, ic]) => `<a href="#/${r}" class="${atual === r ? 'ativo' : ''}">${ic}<span>${t}</span>${seloMenu(r)}</a>`).join('')}</nav>
    <div class="menu-rodape">
      <div data-online>${pilulaOnline()}</div>
      <div class="usuario"><span class="avatar">${iniciais(S.doc?.username)}</span><div style="min-width:0"><b>${esc(S.doc?.username || '')}</b><span>${S.backend?.modo === 'demo' ? 'modo demonstração' : 'conectado'}</span></div></div>
      <button class="btn-tema" data-acao="tema">${tema() === 'escuro' ? IC.sol + ' Tema claro' : IC.lua + ' Tema escuro'}</button>
      <a class="btn-canal" href="${SITE.canal}" target="_blank" rel="noopener">${IC.yt} Assista às aulas no canal</a>
      <span>${esc(SITE.projeto)}</span>
    </div>`;
}
function fecharMenuMobile() { $('#menu').classList.remove('aberto'); $('#veu').classList.remove('aberto'); }

/* ------------------------------------------------------------------ roteador */
function rodape() {
  return `<footer class="rodape-site"><span>© ${new Date().getFullYear()} ${esc(SITE.nome)} · ${esc(SITE.projeto)}</span><span>${esc(SITE.aviso)}</span><a href="${SITE.canal}" target="_blank" rel="noopener">${esc(SITE.canalNome)}</a></footer>`;
}
function faixaDemo() {
  return S.backend?.modo === 'demo' ? `<div class="faixa-demo"><b>Modo demonstração:</b> o Firebase ainda não foi configurado, então contas e progresso ficam só neste navegador. Veja o GUIA_PUBLICACAO.md.</div>` : '';
}
async function render() {
  if (!S.doc) return;
  const partes = location.hash.replace(/^#\/?/, '').split('/');
  const rota = partes[0] || 'questoes';
  if (S.simTimer && !(rota === 'simulados' && partes[1] === 'fazer')) { clearInterval(S.simTimer); S.simTimer = null; }
  desenharMenu();
  fecharMenuMobile();
  const c = $('#conteudo');
  const telas = { questoes: telaQuestoes, simulados: telaSimulados, cadernos: telaCadernos, 'raio-x': telaRaioX, ranking: telaRanking, conta: telaConta, contato: telaContato, admin: telaAdmin };
  const mob = $('.topo-mobile > span:last-child'); if (mob) { mob.setAttribute('data-online', ''); mob.innerHTML = pilulaOnline(); }
  const f = telas[rota] || telaQuestoes;
  try { await f(c, partes.slice(1)); }
  catch (e) { console.error(e); c.innerHTML = `<div class="cartao"><h2>Algo deu errado</h2><p>${esc(e.message || e)}</p><button class="btn" onclick="location.reload()">Recarregar</button></div>`; }
}
function ir(h) { if (location.hash === h) render(); else location.hash = h; }
function topo() { window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' }); $('#conteudo').focus({ preventScroll: true }); }

/* ================================================================== QUESTÕES */
async function telaQuestoes(c, sub) {
  if (sub[0] === 'resolver' && S.pratica) return telaResolver(c);
  if (!S.filtros.q) S.filtros.q = filtrosPadrao();
  const totalResp = Object.keys(S.doc.r).length;
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Resolver <span class="marca">questões</span></h1>
      <p>${num(B.questoes.length)} questões comentadas, alternativa por alternativa, nos 223 tópicos do edital.</p></div>
      <span class="dica">${totalResp ? `você já resolveu ${num(totalResp)} questões diferentes!` : 'comece por um tópico que caiu na aula de hoje :)'}</span></div>
    ${S.pratica ? `<div class="cartao cartao-ouro" style="margin-bottom:16px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center">
        <div><b>${esc(S.pratica.titulo)}</b><div class="texto2 pequeno">Questão ${S.pratica.i + 1} de ${S.pratica.ids.length} · ${Object.keys(S.pratica.resp).length} respondidas</div></div>
        <div class="botoes"><button class="btn btn-ouro" data-acao="continuar-pratica">Continuar</button><button class="btn btn-texto" data-acao="descartar-pratica">Descartar</button></div></div>` : ''}
    <section class="cartao">
      <h2>Filtros</h2>
      ${filtrosHTML('q')}
      <div class="resumo-filtro"><span class="contador-grande" data-contagem="q"></span>
        <div class="botoes"><button class="btn btn-texto" data-acao="limpar-filtros" data-chave="q">Limpar filtros</button>
        <button class="btn btn-ouro" data-acao="iniciar-pratica" data-precisa="q">Resolver questões</button></div></div>
    </section>
    <section class="grade g3" style="margin-top:16px">
      ${B.materias.map(m => {
        const ids = B.questoes.filter(q => q.m === m.id);
        const feitas = ids.filter(q => S.doc.r[q.id]).length;
        return `<button class="cartao" style="text-align:left;cursor:pointer;color:inherit" data-acao="atalho-materia" data-m="${m.id}">
          <div class="pequeno texto2" style="font-weight:800;letter-spacing:.04em">${m.topicos.length} TÓPICOS · ${ids.length} QUESTÕES</div>
          <h3 style="margin:4px 0 10px">${esc(m.nome)}</h3>
          <div class="q-progresso" style="margin:0 0 6px"><i style="width:${pct(feitas, ids.length)}%"></i></div>
          <div class="pequeno texto2">${feitas} de ${ids.length} resolvidas</div></button>`;
      }).join('')}
    </section>${rodape()}`;
  atualizarContagem('q');
}
function iniciarPratica(ids, titulo, origem = 'filtro') {
  S.pratica = { ids, i: 0, resp: {}, marc: {}, titulo, origem };
  ir('#/questoes/resolver');
}
function telaResolver(c) {
  const p = S.pratica;
  const id = p.ids[p.i];
  const q = Q[id];
  const resp = p.resp[id];
  const nResp = Object.keys(p.resp).length;
  const nOk = Object.values(p.resp).filter(r => r.ok).length;
  const fim = nResp === p.ids.length;
  c.innerHTML = `
    <div class="q-barra"><div><h2 style="margin:0">${esc(p.titulo)}</h2>
      <span class="texto2 pequeno">${nResp} ${nResp === 1 ? 'respondida' : 'respondidas'} · <b style="color:var(--verde)">${nOk} ${nOk === 1 ? 'acerto' : 'acertos'}</b> · <b style="color:var(--verm)">${nResp - nOk} ${nResp - nOk === 1 ? 'erro' : 'erros'}</b></span></div>
      <div class="botoes"><button class="btn btn-texto" data-acao="add-caderno" data-id="${id}">+ Adicionar a caderno</button>
      <button class="btn" data-acao="encerrar-pratica">${fim ? 'Ver resultado' : 'Encerrar'}</button></div></div>
    <div class="q-progresso"><i style="width:${pct(p.i + 1, p.ids.length)}%"></i></div>
    ${questaoHTML(q, { num: p.i + 1, total: p.ids.length, marcada: resp ? resp.alt : (p.marc[id] ?? null), respondida: !!resp })}
    <div class="q-acoes">
      <div class="navq"><button class="btn" data-acao="nav" data-d="-1" ${p.i === 0 ? 'disabled' : ''}>← Anterior</button>
      ${resp ? '' : `<button class="btn" data-acao="nav" data-d="1" ${p.i === p.ids.length - 1 ? 'disabled' : ''}>Pular →</button>`}</div>
      ${resp ? (p.i === p.ids.length - 1 || fim ? `<button class="btn btn-ouro" data-acao="encerrar-pratica">Ver resultado</button>` : `<button class="btn btn-ouro" data-acao="nav" data-d="1">Próxima questão →</button>`)
        : `<button class="btn btn-ouro" data-acao="responder" ${p.marc[id] == null ? 'disabled' : ''}>Responder</button>`}
    </div>`;
}
function resultadoPratica() {
  const p = S.pratica;
  const c = $('#conteudo');
  const lista = Object.entries(p.resp);
  const ok = lista.filter(([, r]) => r.ok).length;
  const erradas = lista.filter(([, r]) => !r.ok).map(([id]) => id);
  c.innerHTML = `<div class="cabecalho-pagina"><div><h1>Resultado: <span class="marca">${esc(p.titulo)}</span></h1><p>${lista.length} de ${p.ids.length} questões respondidas.</p></div></div>
    <div class="grade g3"><div class="stat ok"><div class="rot">Acertos</div><div class="val">${ok}</div></div>
    <div class="stat err"><div class="rot">Erros</div><div class="val">${lista.length - ok}</div></div>
    <div class="stat ouro"><div class="rot">Aproveitamento</div><div class="val">${fmtPct(ok, lista.length)}</div></div></div>
    <div class="cartao" style="margin-top:16px"><div class="botoes">
      ${erradas.length ? `<button class="btn btn-ouro" data-acao="refazer-erradas">Refazer as ${erradas.length} que errei</button>` : ''}
      <button class="btn" data-acao="salvar-sessao-caderno">Salvar estas questões como caderno</button>
      <button class="btn" data-acao="nova-pratica">Novo filtro</button></div>
      ${lista.length < p.ids.length ? '<p class="texto2 pequeno" style="margin-bottom:0">As questões não respondidas não entram nas suas estatísticas.</p>' : ''}</div>${rodape()}`;
  S.pratica._erradas = erradas;
  topo();
}

/* ================================================================== SIMULADOS */
function chaveSim() { return 'cdc_sim_' + S.user.uid; }
function salvarSimLocal() { try { localStorage.setItem(chaveSim(), JSON.stringify(S.sim)); } catch (e) { } }
function lerSimLocal() { try { return JSON.parse(localStorage.getItem(chaveSim())); } catch (e) { return null; } }
function apagarSimLocal() { try { localStorage.removeItem(chaveSim()); } catch (e) { } }

function sortearSimulado() {
  const ciclo = {}, qids = [];
  for (const [m, n] of Object.entries(SIM_COMP)) {
    const todos = B.questoes.filter(q => q.m === m).map(q => q.id);
    const usados = new Set((S.doc.ciclo?.[m] || []).filter(id => Q[id]));
    const disp = todos.filter(id => !usados.has(id));
    let esc_;
    if (disp.length >= n) {
      esc_ = embaralhar(disp).slice(0, n);
      ciclo[m] = [...usados, ...esc_];
      if (ciclo[m].length >= todos.length) ciclo[m] = [];
    } else {
      // o que restou do ciclo atual + começo de um novo ciclo
      const resto = embaralhar(todos.filter(id => !disp.includes(id))).slice(0, n - disp.length);
      esc_ = [...disp, ...resto];
      ciclo[m] = [...resto];
    }
    qids.push(...embaralhar(esc_));
  }
  return { qids, ciclo };
}
async function telaSimulados(c, sub) {
  if (sub[0] === 'fazer') return telaFazerSimulado(c);
  if (sub[0] === 'ver' && sub[1]) return telaVerSimulado(c, sub[1]);
  if (!S.simulados) S.simulados = await S.backend.listarSimulados();
  const andamento = lerSimLocal();
  const hist = [...S.simulados].sort((a, b) => (b.criadoEm || b.data) - (a.criadoEm || a.data));
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Simulados <span class="marca">de 40 questões</span></h1>
      <p>Sorteio fechado, no peso da prova. Você só vê a nota e a correção no final.</p></div></div>
    <div class="grade g2">
      <section class="cartao cartao-ouro"><h2>Novo simulado</h2>
        <div class="composicao">${Object.entries(SIM_COMP).map(([m, n]) => `<div><span>${esc(MAT[m].nome)}</span><b>${n}</b></div>`).join('')}</div>
        <p class="texto2 pequeno">Em cada matéria, uma questão só volta a aparecer depois que todas as questões daquela matéria já tiverem saído nos seus simulados. Aí o ciclo recomeça.</p>
        <div class="botoes">${andamento ? `<button class="btn btn-ouro" data-acao="continuar-sim">Continuar simulado em andamento</button><button class="btn btn-texto" data-acao="descartar-sim">Descartar</button>` : `<button class="btn btn-ouro" data-acao="iniciar-sim">Iniciar simulado</button>`}</div>
      </section>
      <section class="cartao"><h2>Ciclo de sorteio</h2>
        <div class="barras">${MATS.map(m => {
          const tot = B.questoes.filter(q => q.m === m).length;
          const us = (S.doc.ciclo?.[m] || []).length;
          return `<div class="barra-linha"><span class="nome">${esc(MAT[m].curto)}</span><div class="barra" title="${us} de ${tot} já sorteadas no ciclo atual"><i class="ok" style="width:${pct(us, tot)}%;background:var(--ouro);border-radius:4px"></i></div><span class="num">${us}/${tot}<small>já saíram</small></span></div>`;
        }).join('')}</div></section>
    </div>
    <section class="cartao" style="margin-top:16px"><h2>Histórico de simulados</h2>
      ${hist.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Data</th><th class="num">Nota</th><th class="num">Acertos</th><th class="num some-cel">Tempo</th><th class="some-cel">Por matéria</th><th></th></tr></thead><tbody>
      ${hist.map(s => `<tr><td>${fmtData(s.data, true)}</td><td class="num"><b>${(s.acertos / s.total * 10).toFixed(1).replace('.', ',')}</b></td><td class="num">${s.acertos}/${s.total}</td><td class="num some-cel">${fmtTempo(s.tempo)}</td>
        <td class="some-cel">${MATS.map(m => s.porMateria?.[m] ? `<span class="pilula p-neutra" style="margin:2px" title="${esc(MAT[m].nome)}">${esc(MAT[m].curto)} ${s.porMateria[m].a}/${s.porMateria[m].t}</span>` : '').join('')}</td>
        <td><button class="btn btn-peq" data-acao="ver-sim" data-id="${s.id}">Correção</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Você ainda não fez nenhum simulado.<span class="dica">que tal o primeiro hoje?</span></div>'}
    </section>${rodape()}`;
}
async function iniciarSimulado() {
  const { qids, ciclo } = sortearSimulado();
  MATS.forEach(m => { S.doc.ciclo[m] = ciclo[m]; });
  enfileirar({ r: {}, dias: {}, pcAdd: {}, peAdd: {}, ciclo });
  S.sim = { qids, resp: {}, i: 0, inicio: Date.now() };
  salvarSimLocal();
  ir('#/simulados/fazer');
}
function telaFazerSimulado(c) {
  if (!S.sim) S.sim = lerSimLocal();
  if (!S.sim) return ir('#/simulados');
  const s = S.sim;
  const q = Q[s.qids[s.i]];
  const nResp = Object.keys(s.resp).length;
  c.innerHTML = `<div class="sim-layout">
    <div>
      <div class="q-barra"><h2 style="margin:0">Simulado · ${esc(MAT[q.m].nome)}</h2><span class="texto2">${nResp} de ${SIM_TOTAL} respondidas</span></div>
      ${questaoHTML(q, { num: s.i + 1, total: SIM_TOTAL, marcada: s.resp[q.id] ?? null, respondida: false, modo: 'simulado' })}
      <div class="q-acoes"><div class="navq"><button class="btn" data-acao="sim-nav" data-d="-1" ${s.i === 0 ? 'disabled' : ''}>← Anterior</button>
        <button class="btn" data-acao="sim-nav" data-d="1" ${s.i === SIM_TOTAL - 1 ? 'disabled' : ''}>Próxima →</button></div>
        <button class="btn btn-ouro" data-acao="sim-finalizar">Finalizar simulado</button></div>
    </div>
    <aside class="sim-lado">
      <div class="cartao" style="text-align:center"><div class="rot texto2 pequeno" style="font-weight:800">TEMPO DE PROVA</div><div class="cronometro" id="cronometro">${fmtTempo((Date.now() - s.inicio) / 1000)}</div></div>
      <div class="cartao"><div class="mapa-sim">${s.qids.map((id, k) => `<button data-acao="sim-ir" data-k="${k}" class="${s.resp[id] != null ? 'resp' : ''} ${k === s.i ? 'atual' : ''}" title="${esc(MAT[Q[id].m].curto)}">${k + 1}</button>`).join('')}</div>
      <p class="texto2 pequeno" style="margin:10px 0 0">Clique numa alternativa para marcar; clique de novo para desmarcar. Você pode trocar a resposta até finalizar.</p></div>
    </aside></div>`;
  clearInterval(S.simTimer);
  S.simTimer = setInterval(() => { const el = $('#cronometro'); if (el) el.textContent = fmtTempo((Date.now() - S.sim.inicio) / 1000); }, 1000);
}
async function finalizarSimulado() {
  const s = S.sim;
  const faltam = SIM_TOTAL - Object.keys(s.resp).length;
  const ok = await confirmar('Finalizar o simulado?', faltam ? `Ainda há <b>${faltam}</b> ${faltam === 1 ? 'questão' : 'questões'} sem resposta, que contarão como erro.` : 'Todas as questões foram respondidas. Depois de finalizar, não dá para mudar as respostas.', 'Finalizar e ver a nota');
  if (!ok) return;
  clearInterval(S.simTimer); S.simTimer = null;
  const tempo = Math.round((Date.now() - s.inicio) / 1000);
  const porMateria = {};
  let acertos = 0;
  s.qids.forEach(id => {
    const q = Q[id];
    porMateria[q.m] = porMateria[q.m] || { a: 0, t: 0 };
    porMateria[q.m].t++;
    if (s.resp[id] === q.g) { porMateria[q.m].a++; acertos++; }
  });
  registrarRespostas(s.qids.filter(id => s.resp[id] != null).map(id => ({ id, alt: s.resp[id] })));
  const dados = { data: Date.now(), acertos, total: SIM_TOTAL, tempo, porMateria, qids: s.qids, resp: s.qids.map(id => s.resp[id] ?? -1) };
  try {
    const sid = await S.backend.salvarSimulado(dados);
    S.simulados = null;
    S.sim = null; apagarSimLocal();
    S.simVisto = { id: sid, ...dados };
    ir('#/simulados/ver/' + sid);
  } catch (e) {
    console.error(e);
    toast('Não foi possível salvar o simulado. Verifique a conexão e tente finalizar de novo.', 'erro');
  }
}
async function telaVerSimulado(c, sid) {
  let s = S.simVisto?.id === sid ? S.simVisto : null;
  if (!s) { if (!S.simulados) S.simulados = await S.backend.listarSimulados(); s = S.simulados.find(x => x.id === sid); }
  if (!s) return ir('#/simulados');
  S.simVisto = s;
  const soErr = S.simSoErradas;
  const itens = s.qids.map((id, k) => ({ id, k, alt: s.resp[k] === -1 ? null : s.resp[k] })).filter(x => Q[x.id]);
  const lista = soErr ? itens.filter(x => x.alt !== Q[x.id].g) : itens;
  c.innerHTML = `<div class="cabecalho-pagina"><div><h1>Simulado de <span class="marca">${fmtData(s.data, true)}</span></h1><p>Tempo: ${fmtTempo(s.tempo)}</p></div>
      <div class="botoes"><button class="btn" data-acao="voltar-sims">← Simulados</button></div></div>
    <div class="grade g4"><div class="stat ouro"><div class="rot">Nota</div><div class="val">${(s.acertos / s.total * 10).toFixed(1).replace('.', ',')}<small> / 10</small></div></div>
      <div class="stat ok"><div class="rot">Acertos</div><div class="val">${s.acertos}<small> / ${s.total}</small></div></div>
      <div class="stat err"><div class="rot">Erros</div><div class="val">${s.total - s.acertos}</div></div>
      <div class="stat"><div class="rot">Tempo</div><div class="val">${fmtTempo(s.tempo)}</div></div></div>
    <section class="cartao" style="margin-top:16px"><h2>Acertos por matéria</h2>
      <div class="legenda"><span style="--c:var(--verde)">Acertos</span><span style="--c:var(--verm)">Erros</span></div>
      <div class="barras">${MATS.filter(m => s.porMateria?.[m]).map(m => { const p = s.porMateria[m]; return barraLinha(MAT[m].nome, p.a, p.t); }).join('')}</div></section>
    <section class="cartao" style="margin-top:16px"><div class="q-barra"><h2 style="margin:0">Gabarito e comentários</h2>
      <div class="seg"><button class="${soErr ? '' : 'ativa'}" data-acao="sim-filtro" data-v="0">Todas</button><button class="${soErr ? 'ativa' : ''}" data-acao="sim-filtro" data-v="1">Só as que errei</button></div></div>
      <div class="mapa-sim" style="margin-bottom:16px">${itens.map(x => `<button data-acao="rolar" data-alvo="sq-${x.k}" class="${x.alt === Q[x.id].g ? 'ok' : 'nok'}">${x.k + 1}</button>`).join('')}</div>
      <div style="display:grid;gap:16px">${lista.map(x => `<div id="sq-${x.k}">${questaoHTML(Q[x.id], { num: x.k + 1, total: s.total, marcada: x.alt, respondida: true, modo: 'revisao' })}</div>`).join('') || '<div class="vazio">Você não errou nenhuma questão neste simulado. 🎉</div>'}</div>
    </section>${rodape()}`;
}

/* ================================================================== CADERNOS */
async function carregarCadernos() { if (!S.cadernos) S.cadernos = await S.backend.listarCadernos(); return S.cadernos; }
function materiasDe(ids) { return MATS.filter(m => ids.some(id => Q[id]?.m === m)); }
async function telaCadernos(c, sub) {
  await carregarCadernos();
  if (sub[0] === 'novo') return telaNovoCaderno(c, null);
  if (sub[0] === 'adicionar' && sub[1]) return telaNovoCaderno(c, sub[1]);
  if (sub[0]) return telaCaderno(c, sub[0]);
  const lista = [...S.cadernos].sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Meus <span class="marca">cadernos</span></h1><p>Monte cadernos com os filtros, resolva no site ou imprima em PDF.</p></div>
      <button class="btn btn-ouro" data-acao="novo-caderno">+ Novo caderno</button></div>
    ${lista.length ? `<div class="lista-cads">${lista.map(cad => {
      const ids = cad.qids.filter(id => Q[id]);
      const feitas = ids.filter(id => S.doc.r[id]).length;
      return `<article class="cartao cad"><h3>${esc(cad.nome)}</h3>
        <div class="meta">${ids.length} questões · ${materiasDe(ids).map(m => esc(MAT[m].curto)).join(', ') || '—'}</div>
        <div class="q-progresso" style="margin:0"><i style="width:${pct(feitas, ids.length)}%"></i></div>
        <div class="meta pequeno">${feitas} resolvidas · atualizado em ${fmtData(cad.atualizadoEm)}</div>
        <div class="botoes"><button class="btn btn-ouro btn-peq" data-acao="resolver-caderno" data-id="${cad.id}">Resolver</button><a class="btn btn-peq" href="#/cadernos/${cad.id}">Abrir</a></div></article>`;
    }).join('')}</div>`
      : `<div class="cartao vazio"><p>Você ainda não tem cadernos.</p><p class="pequeno">Crie um pelos filtros, marque questões avulsas com “+ Adicionar a caderno” enquanto resolve, ou gere um caderno de revisão no Raio-X.</p><span class="dica">dica: um caderno “só as que errei” é ótimo para a reta final!</span></div>`}
    ${rodape()}`;
}
function telaNovoCaderno(c, cid) {
  const cad = cid ? S.cadernos.find(x => x.id === cid) : null;
  const chave = cid ? 'cadAdd' : 'cadNovo';
  if (!S.filtros[chave] || S.filtros._para !== cid) { S.filtros[chave] = { ...filtrosPadrao(), qtd: '50' }; S.filtros._para = cid; }
  c.innerHTML = `<div class="cabecalho-pagina"><div><h1>${cad ? `Adicionar questões a <span class="marca">${esc(cad.nome)}</span>` : 'Novo <span class="marca">caderno</span>'}</h1>
      <p>${cad ? `O caderno tem ${cad.qids.length} questões. As repetidas são ignoradas.` : 'Escolha as questões pelos filtros, defina a quantidade e a ordem.'}</p></div>
      <a class="btn" href="#/cadernos${cad ? '/' + cad.id : ''}">← Voltar</a></div>
    <section class="cartao">
      ${cad ? '' : `<label class="campo"><span>Nome do caderno</span><input type="text" id="nome-cad" maxlength="80" placeholder="Ex.: Revisão de Processo do Trabalho – erradas"></label>`}
      ${filtrosHTML(chave)}
      <div class="resumo-filtro"><span class="contador-grande" data-contagem="${chave}"></span>
        <div class="botoes"><button class="btn btn-ouro" data-acao="salvar-filtro-caderno" data-chave="${chave}" data-id="${cid || ''}" data-precisa="${chave}">${cad ? 'Adicionar ao caderno' : 'Criar caderno'}</button></div></div>
      <p class="texto2 pequeno" style="margin-bottom:0">Limite de ${MAX_CADERNO} questões por caderno.</p>
    </section>${rodape()}`;
  atualizarContagem(chave);
}
function telaCaderno(c, cid) {
  const cad = S.cadernos.find(x => x.id === cid);
  if (!cad) return ir('#/cadernos');
  const ids = cad.qids.filter(id => Q[id]);
  const removidas = cad.qids.length - ids.length;
  c.innerHTML = `<div class="cabecalho-pagina"><div><h1><span class="marca">${esc(cad.nome)}</span></h1>
      <p>${ids.length} questões · ${materiasDe(ids).map(m => esc(MAT[m].nome)).join(', ') || 'sem questões'} · ordem ${cad.ordem === 'aleatoria' ? 'aleatória' : 'do banco'}</p></div>
      <a class="btn" href="#/cadernos">← Meus cadernos</a></div>
    <section class="cartao"><div class="botoes">
      <button class="btn btn-ouro" data-acao="resolver-caderno" data-id="${cid}" ${ids.length ? '' : 'disabled'}>Resolver no site</button>
      <button class="btn" data-acao="imprimir" data-formato="responder" data-id="${cid}" ${ids.length ? '' : 'disabled'}>🖨 Caderno para responder</button>
      <button class="btn" data-acao="imprimir" data-formato="comentado" data-id="${cid}" ${ids.length ? '' : 'disabled'}>🖨 Caderno comentado</button>
      <button class="btn btn-texto" data-acao="renomear-caderno" data-id="${cid}">Renomear</button>
      <a class="btn btn-texto" href="#/cadernos/adicionar/${cid}">+ Adicionar questões</a>
      <button class="btn btn-texto" data-acao="embaralhar-caderno" data-id="${cid}">Embaralhar ordem</button>
      <button class="btn btn-perigo" data-acao="excluir-caderno" data-id="${cid}">Excluir</button></div>
      <p class="texto2 pequeno" style="margin-bottom:0">Na impressão, as questões são agrupadas por matéria e tópico, como nos cadernos em PDF, com capa, sumário${''} e numeração de páginas. Use “Salvar como PDF” na janela de impressão.</p>
      ${removidas ? `<p class="pequeno" style="color:var(--laranja)">${removidas} questão(ões) deste caderno não existem mais no banco e foram ignoradas.</p>` : ''}</section>
    <section class="cartao" style="margin-top:16px"><h2>Questões do caderno</h2>
      ${ids.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Código</th><th>Assunto</th><th class="some-cel">Origem</th><th>Situação</th><th></th></tr></thead><tbody>
      ${ids.map((id, k) => { const q = Q[id]; const s = situacaoDe(id); return `<tr><td class="pos">${k + 1}</td><td><b>${id}</b></td><td class="pequeno">${esc(MAT[q.m].curto)} · ${q.tp}. ${esc(TOP[q.m + ':' + q.tp])}</td><td class="some-cel">${q.r ? `<span class="pilula p-fcc">${esc(q.org)} · ${q.ano}</span>` : '<span class="pilula p-inedita">Inédita</span>'}</td>
        <td>${s === 'nao' ? '<span class="apagado pequeno">não resolvida</span>' : `<span class="pilula ${s === 'acertei' ? 'p-certa' : 'p-errada'}">${s === 'acertei' ? 'acertei' : 'errei'}</span>`}</td>
        <td><button class="btn btn-texto btn-peq" data-acao="remover-do-caderno" data-id="${cid}" data-q="${id}" title="Remover do caderno">✕</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="vazio">Este caderno está vazio. Use “+ Adicionar questões”.</div>'}
    </section>${rodape()}`;
}
async function salvarCaderno(cid, dados) {
  dados.qids = [...new Set(dados.qids)].slice(0, MAX_CADERNO);
  const id = await S.backend.salvarCaderno(cid, dados);
  S.cadernos = null;
  await carregarCadernos();
  return id;
}
async function escolherCaderno(qid) {
  await carregarCadernos();
  const lista = [...S.cadernos].sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
  return modal({
    titulo: 'Adicionar a caderno',
    corpo: `<p class="texto2">Questão <b>${qid}</b>.</p>
      ${lista.length ? `<div class="lista-escolha">${lista.map(c => `<button type="button" data-cad="${c.id}"><span>${esc(c.nome)}</span><span class="apagado">${c.qids.includes(qid) ? 'já está aqui' : c.qids.length + ' questões'}</span></button>`).join('')}</div>` : ''}
      <label class="campo" style="margin-top:12px"><span>Ou crie um caderno novo</span><input type="text" id="novo-cad-nome" maxlength="80" placeholder="Nome do novo caderno"></label><div class="erro-form" id="erro-cad"></div>`,
    botoes: [{ rot: 'Fechar', cls: 'btn-texto', valor: null }, {
      rot: 'Criar e adicionar', cls: 'btn-ouro', acao: async raiz => {
        const nome = $('#novo-cad-nome', raiz).value.trim();
        if (!nome) { $('#erro-cad', raiz).textContent = 'Digite um nome ou escolha um caderno da lista.'; return false; }
        await salvarCaderno(null, { nome, qids: [qid], ordem: 'banco' });
        toast(`Questão adicionada ao caderno “${nome}”.`);
      }
    }],
    aoAbrir: raiz => raiz.addEventListener('click', async e => {
      const b = e.target.closest('[data-cad]'); if (!b) return;
      const cad = S.cadernos.find(c => c.id === b.dataset.cad);
      if (cad.qids.includes(qid)) { toast('Essa questão já está nesse caderno.'); return; }
      if (cad.qids.length >= MAX_CADERNO) { toast(`O caderno já tem ${MAX_CADERNO} questões.`, 'erro'); return; }
      b.disabled = true;
      await salvarCaderno(cad.id, { nome: cad.nome, qids: [...cad.qids, qid], ordem: cad.ordem });
      toast(`Questão adicionada ao caderno “${cad.nome}”.`);
      raiz.remove();
    })
  });
}
async function pedirNomeCaderno(titulo, inicial = '') {
  return modal({
    titulo,
    corpo: `<label class="campo"><span>Nome do caderno</span><input type="text" id="nome-modal" maxlength="80" value="${esc(inicial)}"></label><div class="erro-form" id="erro-nome"></div>`,
    botoes: [{ rot: 'Cancelar', cls: 'btn-texto', valor: null }, {
      rot: 'Salvar', cls: 'btn-ouro', acao: raiz => {
        const v = $('#nome-modal', raiz).value.trim();
        if (!v) { $('#erro-nome', raiz).textContent = 'Digite um nome.'; return false; }
        return v;
      }
    }],
    aoAbrir: raiz => { const i = $('#nome-modal', raiz); i.addEventListener('keydown', e => { if (e.key === 'Enter') raiz.querySelector('.btn-ouro').click(); }); setTimeout(() => i.select(), 30); }
  });
}

/* ------------------------------------------------------------------ impressão */
async function imprimirCaderno(cad, formato) {
  const ids = porBanco(cad.qids.filter(id => Q[id]));
  const comentado = formato === 'comentado';
  const mats = materiasDe(ids);
  const data = new Date().toLocaleDateString('pt-BR');
  const reais = ids.filter(id => Q[id].r).length;
  // sumário por tópico
  const grupos = [];
  ids.forEach((id, k) => {
    const q = Q[id]; const ch = q.m + ':' + q.tp;
    const g = grupos[grupos.length - 1];
    if (g && g.ch === ch) g.fim = k + 1; else grupos.push({ ch, m: q.m, tp: q.tp, ini: k + 1, fim: k + 1 });
  });
  let sum = '<table>';
  let matAnt = null;
  grupos.forEach(g => {
    if (g.m !== matAnt) { sum += `<tr class="mat"><td colspan="3">${esc(MAT[g.m].nome)}</td></tr>`; matAnt = g.m; }
    sum += `<tr><td class="n">${g.tp}.</td><td>${esc(TOP[g.ch])}</td><td class="q">${g.ini === g.fim ? `Questão ${g.ini}` : `Questões ${g.ini} a ${g.fim}`}</td></tr>`;
  });
  sum += '</table>';
  let corpo = '';
  matAnt = null;
  let k = 0;
  grupos.forEach(g => {
    if (g.m !== matAnt) { corpo += `<h2 class="pr-materia">${esc(MAT[g.m].nome)}</h2>`; matAnt = g.m; }
    corpo += `<div class="pr-topico"><span>${g.tp}.</span>${esc(TOP[g.ch])}</div>`;
    for (let n = g.ini; n <= g.fim; n++) {
      const q = Q[ids[n - 1]]; k++;
      let h = `<div class="pr-q"><div class="pr-q-cab"><b>Questão ${n}</b><span class="pr-tag ${q.r ? '' : 'ined'}">${esc(q.o)}</span></div>`;
      let itens = '';
      const desc = () => { if (itens) { h += `<div class="pr-itens">${itens}</div>`; itens = ''; } };
      q.e.forEach(b => { if (Array.isArray(b)) itens += `<div class="pr-item"><b>${esc(b[0])}</b><span>${esc(b[1])}</span></div>`; else { desc(); h += `<p>${esc(b)}</p>`; } });
      desc();
      h += '<div class="pr-alts">' + q.a.map((t, j) => `<div class="pr-alt ${comentado && j === q.g ? 'certa' : ''}"><b>${LETRAS[j]})</b><span>${esc(t)}</span></div>`).join('') + '</div>';
      if (comentado) {
        h += `<div class="pr-gab">Gabarito: ${LETRAS[q.g]}</div>`;
        if (q.ai) h += `<div class="pr-analise"><div class="t">Análise dos itens</div>${q.ai.map(([r, t]) => `<div><b>${esc(r)}</b><span>– ${esc(t)}</span></div>`).join('')}</div>`;
        h += q.c.map(([ref, t], j) => `<div class="pr-com"><b class="${j === q.g ? 'c' : 'e'}">${LETRAS[j]})</b><span><span class="ref">${esc(ref)}</span> ${esc(t)}</span></div>`).join('');
      }
      corpo += h + '</div>';
    }
  });
  let extras = '';
  if (!comentado) {
    extras += `<section class="pr-folha"><h2>Folha de respostas</h2><div class="pr-instr">Marque uma alternativa por questão. Confira com o gabarito na última página.</div><div class="pr-folha-grade">
      ${ids.map((_, n) => `<div class="pr-linha-folha"><b>${n + 1}</b>${[...LETRAS].map(l => `<span class="pr-bolha">${l}</span>`).join('')}</div>`).join('')}</div></section>
      <section class="pr-gabarito"><h2>Gabarito</h2><div class="pr-gab-grade">${ids.map((id, n) => `<div><b>${n + 1}</b><span>${LETRAS[Q[id].g]}</span></div>`).join('')}</div></section>`;
  }
  const titulo = comentado ? 'Caderno de Questões Comentadas' : 'Caderno de Questões';
  const el = $('#impressao');
  el.className = 'impressao previa';
  el.setAttribute('aria-hidden', 'false');
  el.innerHTML = `<div class="barra-previa"><span><b>${esc(titulo)}</b> · ${ids.length} questões · prévia de impressão</span>
      <span class="botoes"><button class="btn btn-ouro btn-peq" data-pr="imprimir">🖨 Imprimir / Salvar em PDF</button><button class="btn btn-peq" data-pr="fechar">Fechar</button></span></div>
    <div class="pr-folha-pagina">
      <section class="pr-capa">
        <div class="pr-marca"><img src="img/logo-192.png" alt=""><div><span class="coisa">COISA DE</span><span class="concurseiro">Concurseiro</span></div></div>
        <h1>${titulo}</h1>
        <div class="pr-sub">TRT-8 2026 (FCC) · Analista Judiciário – Área Judiciária</div>
        <div class="pr-nome">${esc(cad.nome)}</div>
        <div class="pr-caixa">
          <p><b>${ids.length} ${ids.length === 1 ? 'questão' : 'questões'}</b>${reais ? `, sendo <b>${reais} ${reais === 1 ? 'real' : 'reais'} da FCC</b>` : ''}${ids.length - reais ? `${reais ? ' e' : ', sendo'} <b>${ids.length - reais} ${ids.length - reais === 1 ? 'inédita' : 'inéditas'} no padrão FCC</b>` : ''}.</p>
          <p><b>Matérias:</b> ${mats.map(m => esc(MAT[m].nome)).join(' · ')}</p>
          <p><b>Aluno(a):</b> ${esc(S.doc.username)} · <b>Data:</b> ${data}</p>
          <p>${comentado ? 'Cada questão traz o gabarito e a fundamentação de todas as alternativas, e a análise dos itens quando houver.' : 'Questões sem resposta. Use a folha de respostas e confira com o gabarito no final.'}</p>
        </div>
        <div class="pr-rodape">${esc(SITE.nome)} · ${esc(SITE.projeto)} · ${esc(SITE.aviso)}</div>
      </section>
      <section class="pr-sumario"><h2>Sumário por tópico do edital</h2>${sum}</section>
      <section>${corpo}</section>
      ${extras}
    </div>`;
  // rodapé de página com nome do caderno e numeração
  let st = $('#estilo-pagina');
  if (!st) { st = document.createElement('style'); st.id = 'estilo-pagina'; document.head.appendChild(st); }
  const rot = (cad.nome + ' · ' + S.doc.username).replace(/["\\]/g, '');
  st.textContent = `@media print { @page { @bottom-left { content: "${rot}"; font: 7.5pt Nunito, Arial, sans-serif; color: #475569; } @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 7.5pt Nunito, Arial, sans-serif; color: #475569; } } @page :first { @bottom-left { content: none; } @bottom-right { content: none; } } }`;
  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 0);
  el.onclick = async e => {
    const b = e.target.closest('[data-pr]'); if (!b) return;
    if (b.dataset.pr === 'fechar') return fecharImpressao();
    try { await document.fonts.ready; } catch (_) { }
    window.print();
  };
}
function fecharImpressao() {
  const el = $('#impressao');
  el.className = 'impressao'; el.innerHTML = ''; el.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ================================================================== RAIO-X */
function barraLinha(nome, a, t, extra = '') {
  return `<div class="barra-linha" title="${esc(nome)}: ${a} acertos e ${t - a} erros em ${t} respostas"><span class="nome">${esc(nome)}</span>
    <div class="barra">${t ? `<i class="ok" style="width:${a / t * 100}%"></i><i class="nok" style="width:${(t - a) / t * 100}%"></i>` : ''}</div>
    <span class="num">${fmtPct(a, t)}<small>${a}/${t}${extra}</small></span></div>`;
}
function estatisticas() {
  const porM = {}, porT = {};
  let resolvidas = 0, acertos = 0;
  MATS.forEach(m => porM[m] = { n: 0, a: 0, u: 0 });
  for (const [id, r] of Object.entries(S.doc.r)) {
    const q = Q[id]; if (!q) continue;
    resolvidas += r.n; acertos += r.a;
    porM[q.m].n += r.n; porM[q.m].a += r.a; porM[q.m].u++;
    const ch = q.m + ':' + q.tp;
    porT[ch] = porT[ch] || { n: 0, a: 0, u: 0 };
    porT[ch].n += r.n; porT[ch].a += r.a; porT[ch].u++;
  }
  return { resolvidas, acertos, unicas: Object.keys(S.doc.r).filter(id => Q[id]).length, porM, porT };
}
async function telaRaioX(c) {
  const e = estatisticas();
  if (!S.simulados) S.simulados = await S.backend.listarSimulados();
  const revisao = Object.entries(e.porT).filter(([, v]) => v.n >= MIN_REVISAO && pct(v.a, v.n) < LIMITE_REVISAO)
    .sort((a, b) => (a[1].a / a[1].n) - (b[1].a / b[1].n) || b[1].n - a[1].n).slice(0, 12);
  // últimos 30 dias
  const dias = [];
  for (let i = 29; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = hojeISO(d); dias.push({ k, d, ...(S.doc.dias[k] || { r: 0, a: 0 }) }); }
  const max = Math.max(5, ...dias.map(d => d.r));
  const sims = [...S.simulados].sort((a, b) => b.data - a.data).slice(0, 6);
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Raio-<span class="marca">X</span></h1><p>Seu desempenho em todas as questões resolvidas (prática e simulados).</p></div>
      <span class="dica">${e.resolvidas ? (pct(e.acertos, e.resolvidas) >= 70 ? 'mandando bem! continue assim.' : 'erro é pista de onde revisar :)') : 'resolva questões para ver seu raio-x'}</span></div>
    <div class="grade g4" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
      <div class="stat"><div class="rot">Resolvidas</div><div class="val">${num(e.resolvidas)}</div></div>
      <div class="stat"><div class="rot">Questões únicas</div><div class="val">${num(e.unicas)}<small> / ${num(B.questoes.length)}</small></div></div>
      <div class="stat ok"><div class="rot">Acertos</div><div class="val">${num(e.acertos)}</div></div>
      <div class="stat err"><div class="rot">Erros</div><div class="val">${num(e.resolvidas - e.acertos)}</div></div>
      <div class="stat ouro"><div class="rot">Média geral</div><div class="val">${fmtPct(e.acertos, e.resolvidas)}</div></div>
    </div>
    <section class="cartao" style="margin-top:16px"><h2>Desempenho por matéria</h2>
      <div class="legenda"><span style="--c:var(--verde)">% de acertos</span><span style="--c:var(--verm)">% de erros</span></div>
      <div class="barras">${MATS.map(m => barraLinha(MAT[m].nome, e.porM[m].a, e.porM[m].n)).join('')}</div></section>
    <section class="cartao" style="margin-top:16px"><h2>Assuntos que merecem revisão</h2>
      <p class="texto2 pequeno">Tópicos com pelo menos ${MIN_REVISAO} respostas e aproveitamento abaixo de ${LIMITE_REVISAO}%, do pior para o melhor.</p>
      ${revisao.length ? `<div class="barras">${revisao.map(([ch, v]) => barraLinha(`${MAT[ch.split(':')[0]].curto} · ${ch.split(':')[1]}. ${TOP[ch]}`, v.a, v.n)).join('')}</div>
        <div class="botoes" style="margin-top:16px"><button class="btn btn-ouro" data-acao="caderno-revisao" data-tops="${revisao.map(r => r[0]).join(',')}">Gerar caderno com esses assuntos</button></div>`
      : '<div class="vazio">Nenhum assunto abaixo de ' + LIMITE_REVISAO + '% (com ' + MIN_REVISAO + ' respostas ou mais) até agora.</div>'}
    </section>
    <section class="cartao" style="margin-top:16px"><h2>Desempenho por assunto</h2>
      ${MATS.map(m => `<details class="bloco-materia"><summary><span>${esc(MAT[m].nome)}</span><span class="texto2 pequeno">${fmtPct(e.porM[m].a, e.porM[m].n)} · ${e.porM[m].u}/${B.questoes.filter(q => q.m === m).length} questões</span></summary>
        <div class="barras">${MAT[m].topicos.map(t => { const v = e.porT[m + ':' + t.n] || { n: 0, a: 0 }; return barraLinha(`${t.n}. ${t.t}`, v.a, v.n); }).join('')}</div></details>`).join('')}
    </section>
    <div class="grade g2" style="margin-top:16px">
      <section class="cartao"><h2>Resoluções por dia</h2><p class="texto2 pequeno" style="margin-top:-6px">Últimos 30 dias</p>
        <div class="legenda"><span style="--c:var(--verde)">Acertos</span><span style="--c:var(--verm)">Erros</span></div>
        <div class="colunas">${dias.map(d => `<div class="col">${d.r ? `<i class="nok" style="height:${(d.r - d.a) / max * 100}%"></i><i class="ok" style="height:${d.a / max * 100}%;order:-1"></i>` : ''}<span class="dica-col">${d.d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}: ${d.r} resolvidas, ${d.a} acertos</span></div>`).join('')}</div>
        <div class="eixo-x"><span>${dias[0].d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span><span>hoje</span></div></section>
      <section class="cartao"><h2>Últimas notas de simulados</h2>
        ${sims.length ? `<div class="barras">${sims.map(s => barraLinha(fmtData(s.data), s.acertos, s.total, ` · nota ${(s.acertos / s.total * 10).toFixed(1).replace('.', ',')}`)).join('')}</div>` : '<div class="vazio">Nenhum simulado feito ainda.</div>'}
      </section></div>
    <section class="cartao" style="margin-top:16px;display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center">
      <div><b>Zerar meu histórico</b><div class="texto2 pequeno">Apaga o Raio-X, a situação acertei/errei, o histórico de simulados e o ciclo de sorteio. Os pontos do ranking são mantidos.</div></div>
      <button class="btn btn-perigo" data-acao="zerar">Zerar histórico</button></section>
    ${rodape()}`;
}

/* ================================================================== RANKING */
function ordenarRanking(lista, m) {
  const p = r => m ? (r.pts?.[m] || 0) : (r.total || 0);
  const t = r => m ? (r.resp?.[m] || 0) : (r.totalResp || 0);
  return lista.filter(r => t(r) > 0 && r.uid !== window.ADMIN_UID).sort((a, b) =>
    p(b) - p(a) || (p(b) / t(b)) - (p(a) / t(a)) || t(b) - t(a) || (a.em || 0) - (b.em || 0)).map(r => ({ ...r, P: p(r), T: t(r) }));
}
async function telaRanking(c) {
  if (!S.rank || Date.now() - S.rankEm > 60000) {
    c.innerHTML = '<div class="vazio">Carregando ranking…</div>';
    S.rank = await S.backend.ranking(); S.rankEm = Date.now();
  }
  const m = S.rankAba === 'geral' ? null : S.rankAba;
  const lista = ordenarRanking(S.rank, m);
  const meu = lista.findIndex(r => r.uid === S.user.uid);
  const top = [lista[1], lista[0], lista[2]];
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1><span class="marca">Ranking</span></h1>
      <p>1 ponto por questão acertada na <b>primeira tentativa</b>. Desempate: aproveitamento, depois mais questões respondidas.</p></div>
      ${meu >= 0 ? `<span class="dica">você está em ${meu + 1}º lugar!</span>` : ''}</div>
    <div class="abas-rank"><button class="${!m ? 'ativa' : ''}" data-acao="rank-aba" data-v="geral">Geral</button>${MATS.map(x => `<button class="${m === x ? 'ativa' : ''}" data-acao="rank-aba" data-v="${x}">${esc(MAT[x].curto)}</button>`).join('')}</div>
    <div class="podio">${top.map((r, i) => { const pos = [2, 1, 3][i]; return r ? `<div class="degrau p${pos}"><div class="medalha">${pos}º</div><div class="nome" title="${esc(r.u)}">${esc(r.u)}</div><div class="pts">${num(r.P)} pts</div><div class="texto2 pequeno">${fmtPct(r.P, r.T)} · ${num(r.T)} resp.</div></div>` : `<div class="degrau p${pos} vazio-p"><div class="medalha">${pos}º</div><div class="nome">—</div></div>`; }).join('')}</div>
    <section class="cartao">${lista.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>#</th><th>Usuário</th><th class="num">Pontos</th><th class="num">Aproveitamento</th><th class="num some-cel">Respondidas</th></tr></thead><tbody>
      ${lista.map((r, i) => `<tr class="${r.uid === S.user.uid ? 'eu' : ''}"><td class="pos">${i + 1}º</td><td>${esc(r.u)}${r.uid === S.user.uid ? ' <span class="apagado">(você)</span>' : ''}</td><td class="num"><b>${num(r.P)}</b></td><td class="num">${fmtPct(r.P, r.T)}</td><td class="num some-cel">${num(r.T)}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="vazio">Ninguém pontuou aqui ainda. Seja a primeira pessoa!</div>'}
      <p class="texto2 pequeno" style="margin-bottom:0">Atualizado em ${fmtData(S.rankEm, true)}. <button class="btn btn-texto btn-peq" data-acao="rank-atualizar">Atualizar</button></p></section>
    ${rodape()}`;
}

/* ================================================================== CONTA */
function telaConta(c) {
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Minha <span class="marca">conta</span></h1></div></div>
    <div class="grade g2">
      <section class="cartao"><h2>Dados</h2>
        <p><span class="texto2">Nome de usuário (aparece no ranking)</span><br><b style="font-size:1.15rem">${esc(S.doc.username)}</b></p>
        <p><span class="texto2">E-mail (só você vê)</span><br><b>${esc(S.user.email)}</b></p>
        <p><span class="texto2">Conta criada em</span><br><b>${fmtData(S.doc.criadoEm)}</b></p>
        <div class="botoes"><button class="btn" data-acao="trocar-senha">Trocar senha</button><button class="btn" data-acao="sair">Sair</button></div></section>
      <section class="cartao"><h2>Preferências</h2>
        <p class="texto2">Tema atual: <b>${tema() === 'escuro' ? 'escuro' : 'claro'}</b></p>
        <button class="btn" data-acao="tema">${tema() === 'escuro' ? IC.sol + ' Usar tema claro' : IC.lua + ' Usar tema escuro'}</button>
        <h2 style="margin-top:22px">Aulas</h2>
        <p class="texto2">As videoaulas de estudo reverso estão no canal <b>${esc(SITE.nome)}</b>.</p>
        <a class="btn btn-ouro" href="${SITE.canal}" target="_blank" rel="noopener">${IC.yt} Abrir o canal no YouTube</a></section>
    </div>
    <section class="cartao" style="margin-top:16px"><h2>Privacidade</h2>
      <p class="texto2">Seu e-mail e sua senha servem só para o login e ficam com o Firebase Authentication (Google). A senha nunca é guardada pelo site. Suas respostas são usadas só para as suas estatísticas. Os outros usuários veem apenas o seu nome de usuário e a sua pontuação no ranking.</p></section>
    <section class="cartao" style="margin-top:16px"><h2>Zona de cuidado</h2>
      <div class="botoes"><button class="btn btn-perigo" data-acao="zerar">Zerar histórico</button><button class="btn btn-perigo" data-acao="excluir-conta">Excluir minha conta</button></div>
      <p class="texto2 pequeno" style="margin-bottom:0">Zerar histórico apaga o Raio-X, os simulados e a situação das questões (os cadernos e os pontos do ranking ficam). Excluir a conta apaga tudo, inclusive os cadernos e a sua posição no ranking.</p></section>
    ${rodape()}`;
}

/* ================================================================== AÇÕES (cliques) */
const ACOES = {
  'tema': () => alternarTema(),
  'ms-limpar': (el) => { const ms = el.closest('[data-ms]'); $$('input', ms).forEach(i => { i.checked = false; }); ms.querySelector('input')?.dispatchEvent(new Event('change', { bubbles: true })); },
  'ms-ok': (el) => { el.closest('details').open = false; },
  'limpar-filtros': (el) => { S.filtros[el.dataset.chave] = filtrosPadrao(); render(); },
  'atalho-materia': (el) => { S.filtros.q = { ...filtrosPadrao(), mats: [el.dataset.m] }; render().then(() => $('[data-filtros]')?.scrollIntoView({ behavior: 'smooth' })); },
  'iniciar-pratica': () => {
    const ids = idsDosFiltros('q');
    if (!ids.length) return toast('Nenhuma questão com esses filtros.');
    const f = S.filtros.q;
    const nome = f.mats.length === 1 ? MAT[f.mats[0]].nome : (f.mats.length ? `${f.mats.length} matérias` : 'Todas as matérias');
    iniciarPratica(ids, nome);
  },
  'continuar-pratica': () => ir('#/questoes/resolver'),
  'descartar-pratica': () => { S.pratica = null; render(); },
  'marcar': (el) => {
    const art = el.closest('[data-qid]'); const id = art.dataset.qid; const alt = +el.dataset.alt;
    if (location.hash.startsWith('#/simulados/fazer')) {
      if (S.sim.resp[id] === alt) delete S.sim.resp[id]; else S.sim.resp[id] = alt;
      salvarSimLocal(); telaFazerSimulado($('#conteudo'));
      return;
    }
    const p = S.pratica; if (!p || p.resp[id]) return;
    p.marc[id] = p.marc[id] === alt ? null : alt;
    $$('.alt', art).forEach(b => { const k = +b.dataset.alt; b.classList.toggle('marcada', k === p.marc[id]); b.setAttribute('aria-pressed', k === p.marc[id]); });
    const r = $('[data-acao="responder"]'); if (r) r.disabled = p.marc[id] == null;
  },
  'responder': () => {
    const p = S.pratica; const id = p.ids[p.i]; const alt = p.marc[id];
    if (alt == null) return;
    const ok = alt === Q[id].g;
    p.resp[id] = { alt, ok };
    registrarRespostas([{ id, alt }]);
    telaResolver($('#conteudo'));
    $('.resultado')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  'nav': (el) => { const p = S.pratica; p.i = Math.min(p.ids.length - 1, Math.max(0, p.i + +el.dataset.d)); telaResolver($('#conteudo')); topo(); },
  'encerrar-pratica': () => { if (!Object.keys(S.pratica.resp).length) { S.pratica = null; return ir('#/questoes'); } resultadoPratica(); },
  'refazer-erradas': () => { const e = S.pratica._erradas; iniciarPratica(e, 'Refazendo as que errei'); },
  'nova-pratica': () => { S.pratica = null; ir('#/questoes'); },
  'salvar-sessao-caderno': async () => {
    const nome = await pedirNomeCaderno('Salvar como caderno', S.pratica.titulo);
    if (!nome) return;
    const id = await salvarCaderno(null, { nome, qids: S.pratica.ids, ordem: 'banco' });
    toast('Caderno criado!'); ir('#/cadernos/' + id);
  },
  'add-caderno': (el) => escolherCaderno(el.dataset.id),
  // simulados
  'iniciar-sim': () => iniciarSimulado(),
  'continuar-sim': () => { S.sim = lerSimLocal(); ir('#/simulados/fazer'); },
  'descartar-sim': async () => { if (await confirmar('Descartar o simulado?', 'As respostas deste simulado em andamento serão perdidas.', 'Descartar', true)) { S.sim = null; apagarSimLocal(); render(); } },
  'sim-nav': (el) => { S.sim.i = Math.min(SIM_TOTAL - 1, Math.max(0, S.sim.i + +el.dataset.d)); salvarSimLocal(); telaFazerSimulado($('#conteudo')); topo(); },
  'sim-ir': (el) => { S.sim.i = +el.dataset.k; salvarSimLocal(); telaFazerSimulado($('#conteudo')); topo(); },
  'sim-finalizar': () => finalizarSimulado(),
  'ver-sim': (el) => { S.simSoErradas = false; ir('#/simulados/ver/' + el.dataset.id); },
  'voltar-sims': () => ir('#/simulados'),
  'sim-filtro': (el) => { S.simSoErradas = el.dataset.v === '1'; render(); },
  'rolar': (el) => { const a = document.getElementById(el.dataset.alvo); if (a) a.scrollIntoView({ behavior: 'smooth' }); else { S.simSoErradas = false; render().then(() => document.getElementById(el.dataset.alvo)?.scrollIntoView()); } },
  // cadernos
  'novo-caderno': () => { S.filtros.cadNovo = null; ir('#/cadernos/novo'); },
  'salvar-filtro-caderno': async (el) => {
    const chave = el.dataset.chave; const cid = el.dataset.id || null;
    const ids = idsDosFiltros(chave);
    if (!ids.length) return toast('Nenhuma questão com esses filtros.');
    if (cid) {
      const cad = S.cadernos.find(c => c.id === cid);
      const novos = ids.filter(id => !cad.qids.includes(id));
      const espaco = MAX_CADERNO - cad.qids.length;
      if (espaco <= 0) return toast(`O caderno já tem ${MAX_CADERNO} questões.`, 'erro');
      await salvarCaderno(cid, { nome: cad.nome, qids: [...cad.qids, ...novos.slice(0, espaco)], ordem: cad.ordem });
      toast(`${Math.min(novos.length, espaco)} questões adicionadas.`);
      S.filtros.cadAdd = null;
      return ir('#/cadernos/' + cid);
    }
    const nome = $('#nome-cad').value.trim();
    if (!nome) { $('#nome-cad').focus(); return toast('Dê um nome ao caderno.', 'erro'); }
    const id = await salvarCaderno(null, { nome, qids: ids.slice(0, MAX_CADERNO), ordem: S.filtros[chave].ordem });
    S.filtros.cadNovo = null;
    toast('Caderno criado!');
    ir('#/cadernos/' + id);
  },
  'resolver-caderno': async (el) => {
    await carregarCadernos();
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    const ids = cad.qids.filter(id => Q[id]);
    if (!ids.length) return;
    iniciarPratica(ids, cad.nome, 'caderno');
  },
  'renomear-caderno': async (el) => {
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    const nome = await pedirNomeCaderno('Renomear caderno', cad.nome);
    if (!nome) return;
    await salvarCaderno(cad.id, { nome, qids: cad.qids, ordem: cad.ordem });
    render();
  },
  'embaralhar-caderno': async (el) => {
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    await salvarCaderno(cad.id, { nome: cad.nome, qids: embaralhar(cad.qids), ordem: 'aleatoria' });
    toast('Ordem embaralhada.'); render();
  },
  'excluir-caderno': async (el) => {
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    if (!await confirmar('Excluir caderno?', `O caderno “${esc(cad.nome)}” será apagado. Seu progresso nas questões continua.`, 'Excluir', true)) return;
    await S.backend.excluirCaderno(cad.id); S.cadernos = null; toast('Caderno excluído.'); ir('#/cadernos');
  },
  'remover-do-caderno': async (el) => {
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    await salvarCaderno(cad.id, { nome: cad.nome, qids: cad.qids.filter(q => q !== el.dataset.q), ordem: cad.ordem });
    render();
  },
  'imprimir': async (el) => {
    await carregarCadernos();
    const cad = S.cadernos.find(c => c.id === el.dataset.id);
    imprimirCaderno(cad, el.dataset.formato);
  },
  'caderno-revisao': async (el) => {
    const tops = el.dataset.tops.split(',');
    const escolha = await modal({
      titulo: 'Caderno de revisão',
      corpo: `<p>${tops.length} assuntos com menor aproveitamento. Quais questões entram?</p>
        <label class="campo"><span>Questões</span><select id="rev-tipo"><option value="todas">Todas as questões desses assuntos</option><option value="errei">Só as que errei</option><option value="naoacertei">As que errei e as que ainda não resolvi</option></select></label>
        <label class="campo"><span>Nome</span><input type="text" id="rev-nome" maxlength="80" value="Revisão – ${new Date().toLocaleDateString('pt-BR')}"></label>`,
      botoes: [{ rot: 'Cancelar', cls: 'btn-texto', valor: null }, { rot: 'Criar caderno', cls: 'btn-ouro', acao: raiz => ({ tipo: $('#rev-tipo', raiz).value, nome: $('#rev-nome', raiz).value.trim() || 'Revisão' }) }]
    });
    if (!escolha) return;
    let ids = B.questoes.filter(q => tops.includes(q.m + ':' + q.tp)).map(q => q.id);
    if (escolha.tipo === 'errei') ids = ids.filter(id => situacaoDe(id) === 'errei');
    if (escolha.tipo === 'naoacertei') ids = ids.filter(id => situacaoDe(id) !== 'acertei');
    if (!ids.length) return toast('Nenhuma questão nessa combinação.');
    const id = await salvarCaderno(null, { nome: escolha.nome, qids: ids, ordem: 'banco' });
    toast('Caderno de revisão criado!'); ir('#/cadernos/' + id);
  },
  // ranking
  'rank-aba': (el) => { S.rankAba = el.dataset.v; render(); },
  'rank-atualizar': () => { S.rank = null; render(); },
  // conta
  'sair': async () => { pararPresenca(); await gravarFila(); S.doc = null; S.pratica = null; S.cadernos = null; S.simulados = null; S.rank = null; await S.backend.sair(); location.hash = ''; },
  'trocar-senha': async () => {
    try { await S.backend.redefinirSenha(S.user.email); toast('Enviamos um e-mail para você criar uma nova senha.'); }
    catch (e) { toast(msgErro(e), 'erro'); }
  },
  'zerar': async () => {
    if (!await confirmar('Zerar seu histórico?', 'Isso apaga o Raio-X, a situação acertei/errei das questões, o histórico de simulados e o ciclo de sorteio. <b>Não dá para desfazer.</b> Seus cadernos e seus pontos no ranking são mantidos.', 'Zerar histórico', true)) return;
    await gravarFila();
    const espera = INTERVALO_GRAVACAO - (Date.now() - S.ultimaGravacao);
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    try {
      await S.backend.zerar();
      S.ultimaGravacao = Date.now();
      S.doc.r = {}; S.doc.dias = {}; MATS.forEach(m => { S.doc.ciclo[m] = []; });
      S.simulados = null; S.sim = null; apagarSimLocal();
      toast('Histórico zerado.'); render();
    } catch (e) { console.error(e); toast('Não foi possível zerar agora. Tente de novo em alguns segundos.', 'erro'); }
  },
  'excluir-conta': async () => {
    const senha = await modal({
      titulo: 'Excluir minha conta',
      corpo: `<p>Isso apaga sua conta, seus cadernos, seu histórico e sua posição no ranking. <b>Não dá para desfazer.</b></p>
        <label class="campo"><span>Digite sua senha para confirmar</span><input type="password" id="senha-exc" autocomplete="current-password"></label><div class="erro-form" id="erro-exc"></div>`,
      botoes: [{ rot: 'Cancelar', cls: 'btn-texto', valor: null }, {
        rot: 'Excluir definitivamente', cls: 'btn-perigo', acao: async raiz => {
          const s = $('#senha-exc', raiz).value;
          if (!s) { $('#erro-exc', raiz).textContent = 'Digite a senha.'; return false; }
          try { await S.backend.excluirConta(s); return true; }
          catch (e) { $('#erro-exc', raiz).textContent = msgErro(e); return false; }
        }
      }]
    });
    if (senha) { S.doc = null; apagarSimLocal(); toast('Conta excluída.'); }
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-acao]');
  if (!el || el.disabled) return;
  const f = ACOES[el.dataset.acao];
  if (f) { e.preventDefault(); Promise.resolve(f(el, e)).catch(err => { console.error(err); toast(msgErro(err), 'erro'); }); }
});
document.addEventListener('change', aoMudarFiltro);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') fecharImpressao();
  if (!location.hash.startsWith('#/questoes/resolver') || !S.pratica || e.target.matches('input, select, textarea')) return;
  const k = e.key.toUpperCase();
  if (LETRAS.includes(k) && k.length === 1) { const b = $(`.alt[data-alt="${LETRAS.indexOf(k)}"]`); if (b && !b.disabled) b.click(); }
  else if (e.key === 'Enter') { const b = $('[data-acao="responder"]') || $('.q-acoes .btn-ouro'); if (b && !b.disabled) b.click(); }
  else if (e.key === 'ArrowRight') $('[data-acao="nav"][data-d="1"]:not(:disabled)')?.click();
  else if (e.key === 'ArrowLeft') $('[data-acao="nav"][data-d="-1"]:not(:disabled)')?.click();
});

/* ================================================================== LOGIN */
const ERROS = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Use “Entrar” ou “Esqueci minha senha”.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/missing-email': 'Digite seu e-mail.',
  'auth/requires-recent-login': 'Por segurança, saia e entre de novo antes de fazer isso.',
  'nome-em-uso': 'Esse nome de usuário já está em uso. Escolha outro.',
  'demo/sem-email': 'No modo demonstração não há envio de e-mail. Depois de configurar o Firebase, este botão envia o e-mail de redefinição.',
  'permission-denied': 'Permissão negada pelo servidor.',
  'unavailable': 'Servidor indisponível. Verifique sua conexão.'
};
function msgErro(e) { return ERROS[e?.code] || ERROS[e?.message] || 'Algo deu errado. Tente de novo.'; }
const RE_USER = /^[A-Za-z0-9_.]{3,20}$/;

function telaLogin(aba = 'entrar') {
  const t = $('#tela-login');
  t.hidden = false; $('#layout').hidden = true;
  t.innerHTML = `
    <div class="login-lado">
      <div class="wordmark"><img src="img/logo-192.png" width="92" height="92" alt="Logotipo Coisa de Concurseiro"><div><div class="coisa">COISA DE</div><div class="concurseiro">Concurseiro</div></div></div>
      <p class="lema"><b style="color:#E9CD82">Questões</b> · ${esc(SITE.concurso)}<br>Banco gratuito do ${esc(SITE.projeto)}.</p>
      <ul>
        <li><span class="selo-check">✓</span><span><b>${num(B.questoes.length)} questões</b> comentadas alternativa por alternativa, nos 223 tópicos do edital.</span></li>
        <li><span class="selo-check">✓</span><span><b>Simulados de 40 questões</b> no peso da prova, sem repetir até acabar o banco.</span></li>
        <li><span class="selo-check">✓</span><span><b>Cadernos para imprimir</b> ou salvar em PDF, para responder ou já comentados.</span></li>
        <li><span class="selo-check">✓</span><span><b>Raio-X e ranking</b> para ver onde revisar e acompanhar a turma.</span></li>
      </ul>
      <span class="dica">estude comigo: aula no canal, questão aqui!</span>
      <div class="rodape-login">${esc(SITE.aviso)} · <a href="${SITE.canal}" target="_blank" rel="noopener">${esc(SITE.canalNome)}</a></div>
    </div>
    <div class="login-form"><div class="login-caixa">
      ${S.backend.modo === 'demo' ? '<div class="aviso-demo"><b>Modo demonstração.</b> O Firebase ainda não foi configurado: a conta fica só neste navegador.</div>' : ''}
      <div class="abas" role="tablist">
        <button class="${aba === 'entrar' ? 'ativa' : ''}" data-aba="entrar" role="tab">Entrar</button>
        <button class="${aba === 'criar' ? 'ativa' : ''}" data-aba="criar" role="tab">Criar conta</button></div>
      <form id="form-login" novalidate>${formLogin(aba)}</form>
      <div class="privacidade"><span>🔒</span><span>Seus dados são usados só para o login e para as suas estatísticas. No ranking aparece apenas o seu nome de usuário; o e-mail nunca é mostrado.</span></div>
    </div></div>`;
  t.querySelectorAll('[data-aba]').forEach(b => b.onclick = () => telaLogin(b.dataset.aba));
  t.querySelector('[data-esqueci]')?.addEventListener('click', e => { e.preventDefault(); telaLogin('esqueci'); });
  t.querySelector('[data-voltar]')?.addEventListener('click', e => { e.preventDefault(); telaLogin('entrar'); });
  $('#form-login').onsubmit = e => enviarLogin(e, aba);
  setTimeout(() => $('#form-login input')?.focus(), 30);
}
function formLogin(aba) {
  if (aba === 'criar') return `
    <label class="campo"><span>Nome de usuário <span class="apagado">(aparece no ranking)</span></span><input type="text" name="username" autocomplete="username" maxlength="20" placeholder="ex.: ana_trt8" required></label>
    <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" required></label>
    <label class="campo"><span>Senha <span class="apagado">(mínimo 6 caracteres)</span></span><input type="password" name="senha" autocomplete="new-password" minlength="6" required></label>
    <label class="campo"><span>Repita a senha</span><input type="password" name="senha2" autocomplete="new-password" required></label>
    <div class="erro-form" id="erro-login"></div>
    <button class="btn btn-ouro" style="width:100%" type="submit">Criar minha conta</button>
    <p class="pequeno apagado" style="margin-bottom:0">Nome de usuário: 3 a 20 caracteres, só letras sem acento, números, ponto e sublinhado.</p>`;
  if (aba === 'esqueci') return `
    <h2>Esqueci minha senha</h2><p class="texto2 pequeno">Digite o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha.</p>
    <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" required></label>
    <div class="erro-form" id="erro-login"></div>
    <button class="btn btn-ouro" style="width:100%" type="submit">Enviar link de redefinição</button>
    <p style="text-align:center"><a href="#" data-voltar>← Voltar para o login</a></p>`;
  return `
    <label class="campo"><span>E-mail</span><input type="email" name="email" autocomplete="email" required></label>
    <label class="campo"><span>Senha</span><input type="password" name="senha" autocomplete="current-password" required></label>
    <div class="erro-form" id="erro-login"></div>
    <button class="btn btn-ouro" style="width:100%" type="submit">Entrar</button>
    <p style="text-align:center;margin-bottom:0"><a href="#" data-esqueci>Esqueci minha senha</a></p>`;
}
async function enviarLogin(e, aba) {
  e.preventDefault();
  const f = e.target; const erro = $('#erro-login'); erro.textContent = ''; erro.className = 'erro-form';
  const v = n => (f.elements[n]?.value || '').trim();
  const bt = f.querySelector('button[type=submit]'); bt.disabled = true;
  try {
    if (aba === 'criar') {
      const username = v('username');
      if (!RE_USER.test(username)) throw { code: 'x', msg: 'Nome de usuário inválido: use 3 a 20 caracteres (letras sem acento, números, ponto ou sublinhado).' };
      if (!/^\S+@\S+\.\S+$/.test(v('email'))) throw { code: 'auth/invalid-email' };
      if (f.elements.senha.value.length < 6) throw { code: 'auth/weak-password' };
      if (f.elements.senha.value !== f.elements.senha2.value) throw { code: 'x', msg: 'As senhas não são iguais.' };
      if (!await S.backend.nomeDisponivel(username)) throw { code: 'nome-em-uso' };
      await S.backend.cadastrar({ username, email: v('email'), senha: f.elements.senha.value });
    } else if (aba === 'esqueci') {
      if (!v('email')) throw { code: 'auth/missing-email' };
      await S.backend.redefinirSenha(v('email'));
      erro.className = 'ok-form';
      erro.textContent = 'Se existir uma conta com esse e-mail, o link de redefinição já foi enviado. Confira também a caixa de spam.';
    } else {
      if (!v('email') || !f.elements.senha.value) throw { code: 'x', msg: 'Preencha e-mail e senha.' };
      await S.backend.entrar(v('email'), f.elements.senha.value);
    }
  } catch (err) {
    console.warn(err);
    erro.className = 'erro-form';
    erro.textContent = err.msg || msgErro(err);
  } finally { bt.disabled = false; }
}
function telaEscolherNome() {
  const t = $('#tela-login');
  t.hidden = false; $('#layout').hidden = true;
  t.innerHTML = `<div class="login-lado"><div class="wordmark"><img src="img/logo-192.png" width="80" height="80" alt=""><div><div class="coisa">COISA DE</div><div class="concurseiro">Concurseiro</div></div></div></div>
    <div class="login-form"><div class="login-caixa"><h2>Falta só escolher seu nome de usuário</h2>
      <p class="texto2 pequeno">Ele aparece no ranking no lugar do seu e-mail.</p>
      <form id="form-nome"><label class="campo"><span>Nome de usuário</span><input type="text" name="username" maxlength="20" required></label>
      <div class="erro-form" id="erro-nome"></div><button class="btn btn-ouro" style="width:100%">Continuar</button>
      <p style="text-align:center"><a href="#" id="sair-nome">Sair</a></p></form></div></div>`;
  $('#sair-nome').onclick = e => { e.preventDefault(); S.backend.sair(); };
  $('#form-nome').onsubmit = async e => {
    e.preventDefault();
    const u = e.target.elements.username.value.trim();
    const er = $('#erro-nome');
    if (!RE_USER.test(u)) { er.textContent = 'Use 3 a 20 caracteres: letras sem acento, números, ponto ou sublinhado.'; return; }
    try {
      if (!await S.backend.nomeDisponivel(u)) throw { code: 'nome-em-uso' };
      await S.backend.definirUsername(u);
      await entrarNoApp();
    } catch (err) { er.textContent = msgErro(err); }
  };
}

/* ================================================================== PRESENÇA (online agora) */
const PULSO_MS = 120000, CONTAGEM_MS = 60000;
function pararPresenca() { clearInterval(S.timerPulso); clearInterval(S.timerOnline); S.timerPulso = S.timerOnline = null; }
async function pulsar() {
  if (!S.doc || document.visibilityState !== 'visible') return;
  S.ultimoPulso = Date.now();
  try { await S.backend.pulso(S.doc.username); } catch (e) { console.warn('presença', e); }
}
async function contarOnline() {
  if (!S.doc || document.visibilityState !== 'visible') return;
  try { S.online = Math.max(1, await S.backend.contarOnline()); atualizarOnlineNaTela(); } catch (e) { console.warn('online', e); }
}
function iniciarPresenca() {
  pararPresenca();
  pulsar().then(contarOnline);
  S.timerPulso = setInterval(pulsar, PULSO_MS);
  S.timerOnline = setInterval(contarOnline, CONTAGEM_MS);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.doc) {
    if (!S.ultimoPulso || Date.now() - S.ultimoPulso > 60000) pulsar().then(contarOnline);
    atualizarSelos();
  }
});
async function atualizarSelos() {
  if (!S.doc) return;
  try {
    const minhas = await S.backend.minhasMensagens();
    S.minhasMsgs = minhas;
    S.respostasNovas = minhas.filter(m => m.resposta && !m.vista).length;
    if (ehAdmin()) S.naoLidas = await S.backend.admContarNaoLidas();
    desenharMenu();
  } catch (e) { console.warn('selos', e); }
}

/* ================================================================== CONTA BLOQUEADA */
function telaBloqueado() {
  const t = $('#tela-login');
  t.hidden = false; $('#layout').hidden = true;
  t.innerHTML = `<div class="login-lado"><div class="wordmark"><img src="img/logo-192.png" width="80" height="80" alt=""><div><div class="coisa">COISA DE</div><div class="concurseiro">Concurseiro</div></div></div></div>
    <div class="login-form"><div class="login-caixa"><h2>Conta bloqueada</h2>
      <p class="texto2">Esta conta foi bloqueada pelo administrador do site e não pode mais ser usada.</p>
      <p class="texto2 pequeno">Se você acha que foi um engano, fale com o canal <a href="${SITE.canal}" target="_blank" rel="noopener">${esc(SITE.nome)}</a> no YouTube.</p>
      <button class="btn" style="width:100%" id="sair-bloq">Sair</button></div></div>`;
  $('#sair-bloq').onclick = () => S.backend.sair();
}

/* ================================================================== FALE COMIGO */
const TIPOS_MSG = { sugestao: 'Sugestão', solicitacao: 'Solicitação', problema: 'Problema no site', erro: 'Erro em questão', outro: 'Outro assunto' };
const MAX_MSG = 1500;
function pilulaTipo(t) {
  const cls = { sugestao: 'p-caso', solicitacao: 'p-juris', problema: 'p-fcc-cobra', erro: 'p-errada', outro: 'p-neutra' }[t] || 'p-neutra';
  return `<span class="pilula ${cls}">${esc(TIPOS_MSG[t] || t)}</span>`;
}
function rotuloQuestao(qid) {
  const q = Q[qid]; if (!q) return esc(qid || '');
  return `<b>${esc(qid)}</b> · ${esc(MAT[q.m].curto)} · ${q.tp}. ${esc(TOP[q.m + ':' + q.tp])}`;
}
async function enviarMensagem({ tipo, texto, qid }) {
  texto = (texto || '').trim();
  if (texto.length < 3) throw { code: 'x', msg: 'Escreva a sua mensagem.' };
  if (texto.length > MAX_MSG) throw { code: 'x', msg: `A mensagem pode ter no máximo ${MAX_MSG} caracteres.` };
  if (S.ultimaMsg && Date.now() - S.ultimaMsg < 20000) throw { code: 'x', msg: 'Aguarde alguns segundos antes de enviar outra mensagem.' };
  if (qid && !Q[qid]) throw { code: 'x', msg: 'Código de questão não encontrado. Confira o código (ex.: DTRAB-001).' };
  await S.backend.enviarMensagem({ u: S.doc.username, tipo, texto, qid: qid || null });
  S.ultimaMsg = Date.now();
}
async function telaContato(c) {
  c.innerHTML = '<div class="vazio">Carregando…</div>';
  let minhas = [];
  try { minhas = await S.backend.minhasMensagens(); } catch (e) { console.warn(e); }
  minhas.sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  S.minhasMsgs = minhas;
  const tipoPre = S.contatoTipo || 'sugestao';
  c.innerHTML = `${faixaDemo()}
    <div class="cabecalho-pagina"><div><h1>Fale <span class="marca">comigo</span></h1>
      <p>Mande sugestões, pedidos, dúvidas sobre o site ou avise um erro em alguma questão. Eu leio tudo!</p></div>
      <span class="dica">sua ideia ajuda a melhorar o site :)</span></div>
    <section class="cartao cartao-ouro">
      <h2>Nova mensagem</h2>
      <form id="form-msg">
        <div class="grade g2" style="gap:12px 16px">
          <label class="campo"><span>Assunto</span><select name="tipo">${Object.entries(TIPOS_MSG).map(([k, v]) => `<option value="${k}" ${k === tipoPre ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="campo" id="campo-qid" ${tipoPre === 'erro' ? '' : 'hidden'}><span>Código da questão <span class="apagado">(aparece no canto da questão, ex.: DTRAB-001)</span></span><input type="text" name="qid" maxlength="12" placeholder="DTRAB-001" value="${esc(S.contatoQid || '')}"></label>
        </div>
        <label class="campo"><span>Mensagem</span><textarea name="texto" rows="5" maxlength="${MAX_MSG}" placeholder="Escreva aqui…" style="resize:vertical"></textarea></label>
        <div class="resumo-filtro" style="margin-top:4px"><span class="apagado pequeno"><span id="cont-msg">0</span>/${MAX_MSG} · o administrador vê só o seu nome de usuário e a mensagem.</span>
          <button class="btn btn-ouro" type="submit">Enviar mensagem</button></div>
        <div class="erro-form" id="erro-msg"></div>
      </form>
    </section>
    <section class="cartao" style="margin-top:16px"><h2>Minhas mensagens</h2>
      ${minhas.length ? `<div class="lista-msg">${minhas.map(m => `
        <article class="msg ${m.resposta && !m.vista ? 'msg-nova' : ''}">
          <div class="msg-topo">${pilulaTipo(m.tipo)}<span class="apagado pequeno">${fmtData(m.criadoEm, true)}</span>
            ${m.resposta ? '<span class="pilula p-certa">Respondida</span>' : '<span class="pilula p-neutra">Aguardando resposta</span>'}
            ${m.resposta && !m.vista ? '<span class="pilula p-fcc">NOVA RESPOSTA</span>' : ''}</div>
          ${m.qid ? `<div class="pequeno texto2">Questão: ${rotuloQuestao(m.qid)}</div>` : ''}
          <p class="msg-texto">${esc(m.texto)}</p>
          ${m.resposta ? `<div class="msg-resposta"><div class="pequeno" style="font-weight:800;color:var(--ouro)">Resposta do administrador · ${fmtData(m.respondidaEm, true)}</div><p class="msg-texto">${esc(m.resposta)}</p></div>` : ''}
        </article>`).join('')}</div>` : '<div class="vazio">Você ainda não mandou nenhuma mensagem.</div>'}
    </section>${rodape()}`;
  S.contatoTipo = null; S.contatoQid = null;
  const f = $('#form-msg');
  f.elements.tipo.onchange = () => { $('#campo-qid').hidden = f.elements.tipo.value !== 'erro'; };
  f.elements.texto.oninput = () => { $('#cont-msg').textContent = f.elements.texto.value.length; };
  f.onsubmit = async e => {
    e.preventDefault();
    const er = $('#erro-msg'); er.textContent = ''; er.className = 'erro-form';
    const bt = f.querySelector('button[type=submit]'); bt.disabled = true;
    try {
      const tipo = f.elements.tipo.value;
      await enviarMensagem({ tipo, texto: f.elements.texto.value, qid: tipo === 'erro' ? f.elements.qid.value.trim().toUpperCase() : null });
      toast('Mensagem enviada! Obrigado.');
      telaContato(c);
    } catch (err) { er.textContent = err.msg || msgErro(err); } finally { bt.disabled = false; }
  };
  // marca respostas como vistas
  const novas = minhas.filter(m => m.resposta && !m.vista);
  if (novas.length) {
    Promise.all(novas.map(m => S.backend.marcarVista(m.id).catch(() => { }))).then(() => { S.respostasNovas = 0; desenharMenu(); });
  }
}

/* ================================================================== ADMINISTRADOR */
function diasAtras(n) { const d = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); d.push(hojeISO(x)); } return d; }
function fmtDia(iso) { const [a, m, d] = iso.split('-'); return `${d}/${m}`; }
function fmtRelativo(msv) {
  if (!msv) return '—';
  const s = Math.round((Date.now() - msv) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400); return d === 1 ? 'ontem' : `há ${d} dias`;
}
function graficoColunas(dias, valores, { cls = 'ouro', acao = '', sel = null, rotulo = 'acessos' } = {}) {
  const max = Math.max(3, ...valores);
  return `<div class="colunas">${dias.map((d, i) => `<div class="col ${acao ? 'clicavel' : ''} ${sel === d ? 'sel' : ''}" ${acao ? `data-acao="${acao}" data-dia="${d}"` : ''}>
      ${valores[i] ? `<i class="${cls}" style="height:${valores[i] / max * 100}%"></i>` : ''}<span class="dica-col">${fmtDia(d)}: ${valores[i]} ${rotulo}</span></div>`).join('')}</div>
    <div class="eixo-x"><span>${fmtDia(dias[0])}</span><span>${fmtDia(dias[Math.floor(dias.length / 2)])}</span><span>hoje</span></div>`;
}
async function telaAdmin(c, sub) {
  if (!ehAdmin()) { c.innerHTML = '<div class="cartao vazio">Área restrita ao administrador.</div>'; return; }
  c.innerHTML = '<div class="vazio">Carregando o painel…</div>';
  const DIAS = diasAtras(14);
  const A = S.adm = S.adm || {};
  A.dia = A.dia || DIAS[DIAS.length - 1];
  A.filtroMsg = A.filtroMsg || 'naolidas';
  const [dados, acessos, quem, msgs, sims, online] = await Promise.all([
    S.backend.admUsuarios(), S.backend.admAcessosPorDia(DIAS), S.backend.admAcessosDoDia(A.dia),
    S.backend.admMensagens(), S.backend.admContarSimulados().catch(() => null), S.backend.contarOnline().catch(() => null)
  ]);
  A.dados = dados;
  const us = dados.usuarios;
  const nomes = Object.fromEntries(us.map(u => [u.uid, u.username]));
  const stat = u => { let n = 0, a = 0; for (const r of Object.values(u.r)) { n += r.n || 0; a += r.a || 0; } return { n, a, unicas: Object.keys(u.r).length }; };
  us.forEach(u => Object.assign(u, stat(u)));
  const totalRes = us.reduce((t, u) => t + u.n, 0);
  const resDia = DIAS.map(d => us.reduce((t, u) => t + ((u.dias[d] || {}).r || 0), 0));
  const lim = Date.now() - 180000;
  const onlineLista = Object.entries(dados.presenca).filter(([, em]) => em && em >= lim).map(([uid]) => nomes[uid] || '(sem nome)');
  const naoLidas = msgs.filter(m => !m.lida).length;
  S.naoLidas = naoLidas;
  const listaMsg = msgs.filter(m => A.filtroMsg === 'todas' || !m.lida).sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  const busca = (A.busca || '').toLowerCase();
  const usOrd = [...us].filter(u => !busca || (u.username || '').toLowerCase().includes(busca)).sort((a, b) => (b.ultimo || 0) - (a.ultimo || 0) || (b.criadoEm || 0) - (a.criadoEm || 0));
  const hoje = DIAS[DIAS.length - 1];
  const novosHoje = us.filter(u => u.criadoEm && hojeISO(new Date(u.criadoEm)) === hoje).length;
  c.innerHTML = `
    <div class="cabecalho-pagina"><div><h1>Painel do <span class="marca">administrador</span></h1>
      <p>Só você vê esta área. Os acessos começaram a ser contados a partir da publicação do painel.</p></div>
      <button class="btn" data-acao="adm-atualizar">↻ Atualizar</button></div>
    <div class="grade" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div class="stat ouro"><div class="rot">Usuários cadastrados</div><div class="val">${num(us.length)}</div><div class="pequeno texto2">${novosHoje} novo(s) hoje</div></div>
      <div class="stat ok"><div class="rot">Online agora</div><div class="val">${num(online ?? onlineLista.length)}</div></div>
      <div class="stat"><div class="rot">Acessos hoje</div><div class="val">${num(acessos[acessos.length - 1])}<small> pessoas</small></div></div>
      <div class="stat ${naoLidas ? 'err' : ''}"><div class="rot">Mensagens não lidas</div><div class="val">${num(naoLidas)}</div></div>
      <div class="stat"><div class="rot">Questões resolvidas</div><div class="val">${num(totalRes)}</div></div>
      <div class="stat"><div class="rot">Simulados feitos</div><div class="val">${sims == null ? '—' : num(sims)}</div></div>
    </div>

    <section class="cartao" style="margin-top:16px" id="adm-msgs">
      <div class="q-barra"><h2 style="margin:0">Mensagens dos usuários</h2>
        <div class="seg"><button class="${A.filtroMsg === 'naolidas' ? 'ativa' : ''}" data-acao="adm-filtro-msg" data-v="naolidas">Não lidas (${naoLidas})</button><button class="${A.filtroMsg === 'todas' ? 'ativa' : ''}" data-acao="adm-filtro-msg" data-v="todas">Todas (${msgs.length})</button></div></div>
      ${listaMsg.length ? `<div class="lista-msg">${listaMsg.map(m => `
        <article class="msg ${m.lida ? '' : 'msg-nova'}" data-mid="${m.id}">
          <div class="msg-topo">${pilulaTipo(m.tipo)}<b>${esc(m.u || nomes[m.uid] || '(usuário removido)')}</b><span class="apagado pequeno">${fmtData(m.criadoEm, true)}</span>${m.lida ? '' : '<span class="pilula p-fcc">NÃO LIDA</span>'}</div>
          ${m.qid ? `<div class="pequeno texto2">Questão: ${rotuloQuestao(m.qid)}</div>` : ''}
          <p class="msg-texto">${esc(m.texto)}</p>
          ${m.resposta ? `<div class="msg-resposta"><div class="pequeno" style="font-weight:800;color:var(--ouro)">Sua resposta · ${fmtData(m.respondidaEm, true)}${m.vista ? ' · lida pelo usuário' : ''}</div><p class="msg-texto">${esc(m.resposta)}</p></div>` : ''}
          <textarea class="adm-resp" rows="2" maxlength="${MAX_MSG}" placeholder="${m.resposta ? 'Editar a resposta…' : 'Escrever uma resposta (aparece para o usuário em “Fale comigo”)…'}"></textarea>
          <div class="botoes" style="margin-top:8px">
            <button class="btn btn-ouro btn-peq" data-acao="adm-responder" data-id="${m.id}">Responder</button>
            <button class="btn btn-peq" data-acao="adm-lida" data-id="${m.id}" data-v="${m.lida ? 0 : 1}">${m.lida ? 'Marcar como não lida' : 'Marcar como lida'}</button>
            <button class="btn btn-texto btn-peq" data-acao="adm-excluir-msg" data-id="${m.id}">Excluir</button></div>
        </article>`).join('')}</div>` : `<div class="vazio">${A.filtroMsg === 'todas' ? 'Nenhuma mensagem ainda.' : 'Nenhuma mensagem não lida. 🎉'}</div>`}
    </section>

    <div class="grade g2" style="margin-top:16px">
      <section class="cartao"><h2>Acessos por dia</h2><p class="texto2 pequeno" style="margin-top:-6px">Pessoas diferentes que entraram no site, nos últimos 14 dias. Clique numa coluna para ver quem acessou.</p>
        ${graficoColunas(DIAS, acessos, { acao: 'adm-dia', sel: A.dia, rotulo: 'pessoas' })}
        <h3 style="margin-top:16px">Quem acessou em ${fmtDia(A.dia)} <span class="apagado pequeno">(${quem.length})</span></h3>
        ${quem.length ? `<div class="chips-nomes">${quem.sort((a, b) => (b.em || 0) - (a.em || 0)).map(x => `<span class="pilula p-neutra" title="último registro ${fmtData(x.em, true)}">${esc(nomes[x.uid] || x.u || '?')}</span>`).join('')}</div>` : '<p class="apagado">Ninguém registrado neste dia.</p>'}
      </section>
      <section class="cartao"><h2>Questões resolvidas por dia</h2><p class="texto2 pequeno" style="margin-top:-6px">Soma de todos os usuários, nos últimos 14 dias.</p>
        ${graficoColunas(DIAS, resDia, { cls: 'ok', rotulo: 'questões' })}
        <h3 style="margin-top:16px">Online agora <span class="apagado pequeno">(${onlineLista.length})</span></h3>
        ${onlineLista.length ? `<div class="chips-nomes">${onlineLista.map(n => `<span class="pilula p-certa">🟢 ${esc(n)}</span>`).join('')}</div>` : '<p class="apagado">Ninguém online neste momento.</p>'}
      </section>
    </div>

    <section class="cartao" style="margin-top:16px"><div class="q-barra"><h2 style="margin:0">Usuários <span class="apagado pequeno">(${us.length})</span></h2>
      <input type="text" id="adm-busca" placeholder="Buscar pelo nome de usuário…" value="${esc(A.busca || '')}" style="max-width:320px"></div>
      <div class="rolagem"><table class="tabela"><thead><tr><th>Usuário</th><th class="some-cel">Cadastro</th><th>Último acesso</th><th class="num">Resolvidas</th><th class="num some-cel">Aproveit.</th><th></th></tr></thead><tbody>
      ${usOrd.map(u => `<tr><td><b>${esc(u.username || '(sem nome)')}</b>${u.uid === window.ADMIN_UID ? ' <span class="apagado">(você)</span>' : ''}${u.ultimo && u.ultimo >= lim ? ' <span title="online agora">🟢</span>' : ''}</td>
        <td class="some-cel">${fmtData(u.criadoEm)}</td><td>${fmtRelativo(u.ultimo)}</td><td class="num">${num(u.n)}</td><td class="num some-cel">${fmtPct(u.a, u.n)}</td>
        <td>${u.uid === window.ADMIN_UID ? '' : `<button class="btn btn-perigo btn-peq" data-acao="adm-excluir-user" data-id="${u.uid}" data-u="${esc(u.username || '')}">Excluir</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="apagado">Nenhum usuário encontrado.</td></tr>'}
      </tbody></table></div>
      <p class="texto2 pequeno" style="margin-bottom:0">“Último acesso” passa a ser registrado a partir da publicação do painel. Usuários antigos aparecem com “—” até entrarem de novo.</p>
    </section>

    <section class="cartao" style="margin-top:16px"><h2>Usuários bloqueados <span class="apagado pequeno">(${dados.bloqueados.length})</span></h2>
      ${dados.bloqueados.length ? `<div class="rolagem"><table class="tabela"><thead><tr><th>Usuário</th><th>Bloqueado em</th><th class="some-cel">Código (UID)</th><th></th></tr></thead><tbody>
        ${dados.bloqueados.map(b => `<tr><td>${esc(b.u || '—')}</td><td>${fmtData(b.em, true)}</td><td class="some-cel pequeno apagado">${esc(b.uid)}</td><td><button class="btn btn-peq" data-acao="adm-desbloquear" data-id="${b.uid}">Desbloquear</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="apagado">Nenhum usuário bloqueado.</p>'}
      <details class="bloco-materia" style="margin-top:12px"><summary><span>Como apagar de vez a conta de login (e-mail e senha)</span><span>▾</span></summary><div>
        <ol class="texto2" style="margin:0;padding-left:20px;line-height:1.7">
          <li>Exclua o usuário aqui no painel (ele fica bloqueado e os dados são apagados).</li>
          <li>Abra <b>console.firebase.google.com</b> › projeto <b>coisa-de-concurseiro-questoes</b> › <b>Authentication</b> › <b>Usuários</b>.</li>
          <li>Procure o código (UID) que aparece na tabela acima, clique nos <b>três pontinhos ⋮</b> da linha e escolha <b>Excluir conta</b>.</li>
          <li>Pronto: o e-mail fica livre. Se a pessoa criar uma conta nova, ela recebe outro código e não fica bloqueada; nesse caso, exclua de novo pelo painel.</li>
        </ol></div></details>
    </section>${rodape()}`;
  desenharMenu();
  const b = $('#adm-busca');
  if (b) { b.oninput = () => { A.busca = b.value; clearTimeout(A.tb); A.tb = setTimeout(() => { const pos = b.selectionStart; telaAdmin(c).then(() => { const n = $('#adm-busca'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); }, 350); }; }
}

Object.assign(ACOES, {
  'avisar-erro': async (el) => {
    const qid = el.dataset.id;
    await modal({
      titulo: 'Avisar erro nesta questão',
      corpo: `<p class="texto2 pequeno">Questão ${rotuloQuestao(qid)}</p>
        <label class="campo"><span>O que está errado?</span><textarea id="txt-erro" rows="5" maxlength="${MAX_MSG}" placeholder="Ex.: o gabarito deveria ser a letra C, porque…" style="resize:vertical"></textarea></label>
        <div class="erro-form" id="erro-erro"></div>`,
      botoes: [{ rot: 'Cancelar', cls: 'btn-texto', valor: null }, {
        rot: 'Enviar aviso', cls: 'btn-ouro', acao: async raiz => {
          try { await enviarMensagem({ tipo: 'erro', texto: $('#txt-erro', raiz).value, qid }); toast('Aviso enviado! Obrigado por ajudar a melhorar as questões.'); return true; }
          catch (err) { $('#erro-erro', raiz).textContent = err.msg || msgErro(err); return false; }
        }
      }]
    });
  },
  'adm-atualizar': () => { render(); },
  'adm-dia': (el) => { S.adm.dia = el.dataset.dia; render(); },
  'adm-filtro-msg': (el) => { S.adm.filtroMsg = el.dataset.v; render(); },
  'adm-responder': async (el) => {
    const art = el.closest('[data-mid]'); const txt = $('.adm-resp', art).value.trim();
    if (!txt) { toast('Escreva a resposta antes de enviar.', 'erro'); $('.adm-resp', art).focus(); return; }
    await S.backend.admResponder(el.dataset.id, txt); toast('Resposta enviada.'); render();
  },
  'adm-lida': async (el) => { await S.backend.admMarcarLida(el.dataset.id, el.dataset.v === '1'); render(); },
  'adm-excluir-msg': async (el) => {
    if (!await confirmar('Excluir mensagem?', 'A mensagem será apagada para você e para o usuário.', 'Excluir', true)) return;
    await S.backend.admExcluirMensagem(el.dataset.id); toast('Mensagem excluída.'); render();
  },
  'adm-excluir-user': async (el) => {
    const u = el.dataset.u || 'este usuário';
    if (!await confirmar(`Excluir ${esc(u)}?`, `<b>${esc(u)}</b> será <b>bloqueado</b> e terá apagados o progresso, os cadernos, os simulados e a posição no ranking. As mensagens dele continuam no painel. <b>Não dá para desfazer</b> a exclusão dos dados (só o bloqueio).`, 'Excluir e bloquear', true)) return;
    await S.backend.admExcluirUsuario(el.dataset.id, el.dataset.u); S.rank = null; toast('Usuário excluído e bloqueado.'); render();
  },
  'adm-desbloquear': async (el) => {
    if (!await confirmar('Desbloquear?', 'A pessoa poderá entrar de novo e começar do zero (os dados apagados não voltam).', 'Desbloquear')) return;
    await S.backend.admDesbloquear(el.dataset.id); toast('Usuário desbloqueado.'); render();
  }
});

/* estilos das novidades */
(function () {
  const st = document.createElement('style');
  st.textContent = `
.selo-menu{margin-left:auto;min-width:24px;height:24px;border-radius:99px;background:#F07070;color:#fff;font-size:.8rem;font-weight:900;display:grid;place-items:center;padding:0 7px;font-family:'Nunito',sans-serif}
.menu nav a.ativo .selo-menu{background:#0E2449;color:#DBB040}
.online-agora{display:inline-flex;align-items:center;gap:7px;font-size:.85rem;font-weight:700;color:#DCE4F1;background:rgba(110,205,135,.12);border:1.5px solid rgba(110,205,135,.45);border-radius:99px;padding:4px 12px;white-space:nowrap}
.online-agora i{width:9px;height:9px;border-radius:50%;background:#6ECD87;box-shadow:0 0 0 0 rgba(110,205,135,.7);animation:pulsoOn 2s infinite}
.online-agora b{color:#6ECD87}
.topo-mobile .online-agora{font-size:.78rem;padding:3px 9px}
@keyframes pulsoOn{70%{box-shadow:0 0 0 8px rgba(110,205,135,0)}100%{box-shadow:0 0 0 0 rgba(110,205,135,0)}}
.q-erro{margin-top:14px;text-align:right}
.q-erro .btn{color:var(--apagado)}
.q-erro .btn:hover{color:var(--verm)}
.lista-msg{display:grid;gap:12px}
.msg{border:2px solid var(--borda);border-radius:16px;padding:14px 16px;background:var(--cartao2)}
.msg.msg-nova{border-color:var(--ouro2)}
.msg-topo{display:flex;flex-wrap:wrap;gap:8px 10px;align-items:center;margin-bottom:6px}
.msg-texto{white-space:pre-wrap;margin:6px 0 0;word-break:break-word}
.msg-resposta{margin-top:10px;border-left:4px solid var(--ouro);background:var(--cartao);border-radius:0 12px 12px 0;padding:10px 14px}
.adm-resp{width:100%;margin-top:10px;background:var(--fundo);border:2px solid var(--borda);border-radius:12px;padding:.6em .8em;color:var(--texto);resize:vertical;font:inherit}
textarea{width:100%;background:var(--fundo);border:2px solid var(--borda);border-radius:12px;padding:.62em .85em;color:var(--texto);font:inherit}
textarea:focus{border-color:var(--ouro2);outline:none}
.colunas .col i.ouro{background:var(--ouro);border-radius:4px 4px 0 0}
.colunas .col.clicavel{cursor:pointer}
.colunas .col.sel{background:color-mix(in srgb,var(--ouro) 18%,transparent);border-radius:4px 4px 0 0}
.chips-nomes{display:flex;flex-wrap:wrap;gap:6px}
`;
  document.head.appendChild(st);
})();

/* ------------------------------------------------------------------ mostrar/ocultar senha (olho) */
(function () {
  const st = document.createElement('style');
  st.textContent = `.senha-wrap{position:relative;display:block}
.senha-wrap input{padding-right:52px!important}
.olho{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;background:none;color:var(--texto2);border-radius:10px;cursor:pointer;display:grid;place-items:center;padding:0}
.olho:hover{color:var(--ouro);background:rgba(255,255,255,.06)}`;
  document.head.appendChild(st);
  const ABERTO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const FECHADO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  function equipar(raiz) {
    raiz.querySelectorAll('input[type=password]:not([data-olho])').forEach(inp => {
      inp.dataset.olho = '1';
      const w = document.createElement('span'); w.className = 'senha-wrap';
      inp.parentNode.insertBefore(w, inp); w.appendChild(inp);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'olho';
      b.setAttribute('aria-label', 'Mostrar senha'); b.title = 'Mostrar senha'; b.innerHTML = ABERTO;
      b.addEventListener('click', () => {
        const ver = inp.type === 'password';
        inp.type = ver ? 'text' : 'password';
        b.innerHTML = ver ? FECHADO : ABERTO;
        const r = ver ? 'Ocultar senha' : 'Mostrar senha'; b.setAttribute('aria-label', r); b.title = r;
        inp.focus();
      });
      w.appendChild(b);
    });
  }
  new MutationObserver(() => equipar(document)).observe(document.body, { childList: true, subtree: true });
  equipar(document);
})();

/* ================================================================== INÍCIO */
async function entrarNoApp() {
  if (await S.backend.bloqueado()) return telaBloqueado();
  S.doc = await S.backend.carregarDoc();
  if (!S.doc) return telaEscolherNome();
  // garante estrutura
  ['r', 'dias'].forEach(k => { S.doc[k] = S.doc[k] || {}; });
  ['pc', 'pe', 'ciclo'].forEach(k => { S.doc[k] = S.doc[k] || {}; MATS.forEach(m => { S.doc[k][m] = S.doc[k][m] || (k === 'ciclo' ? [] : {}); }); });
  S.ultimaGravacao = Date.now();
  $('#tela-login').hidden = true; $('#tela-login').innerHTML = '';
  $('#layout').hidden = false;
  if (!location.hash || location.hash === '#') location.hash = '#/questoes';
  render();
  iniciarPresenca();
  S.backend.registrarAcesso(S.doc.username, hojeISO()).catch(e => console.warn('acesso', e));
  atualizarSelos();
}
async function aoMudarUsuario(u) {
  S.user = u;
  $('#carregando').hidden = true;
  if (!u) { S.doc = null; pararPresenca(); return telaLogin(); }
  try { await entrarNoApp(); }
  catch (e) { console.error(e); toast('Não foi possível carregar seus dados: ' + msgErro(e), 'erro'); telaLogin(); }
}
async function iniciar() {
  const cfg = window.FIREBASE_CONFIG || {};
  if (cfg.apiKey && cfg.projectId) {
    try {
      const { criarBackendFirebase } = await import('./backend-firebase.js');
      S.backend = criarBackendFirebase(cfg);
    } catch (e) {
      console.error('Falha ao iniciar o Firebase', e);
      $('#carregando').innerHTML = '<p style="max-width:420px;text-align:center">Não foi possível conectar ao Firebase. Confira a configuração em js/config.js.</p>';
      return;
    }
  } else {
    S.backend = criarBackendLocal();
  }
  window.addEventListener('hashchange', () => { if (S.doc) render(); });
  $('#abrir-menu').onclick = () => { $('#menu').classList.add('aberto'); $('#veu').classList.add('aberto'); };
  $('#veu').onclick = fecharMenuMobile;
  await S.backend.iniciar(aoMudarUsuario);
}
iniciar();
