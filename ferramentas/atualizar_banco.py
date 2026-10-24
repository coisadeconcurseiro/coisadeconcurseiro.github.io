#!/usr/bin/env python3
"""
ATUALIZAR O BANCO DE QUESTÕES SEM PERDER O PROGRESSO DOS USUÁRIOS
=================================================================
Lê cadernos de questões comentadas em PDF (no mesmo padrão dos cadernos do
projeto) e atualiza o arquivo site/dados/questoes.js.

  • Questões que JÁ existem no banco mantêm o MESMO código (ex.: DCIV-007),
    mesmo que mudem de posição no caderno. A comparação é feita pelo texto
    do enunciado + alternativas.
  • Questões novas recebem o próximo código livre da matéria (ex.: DCIV-121).
  • Códigos nunca são reaproveitados.
  • Questões que sumiram dos PDFs continuam no banco, a menos que você use
    --remover-ausentes (aí cadernos antigos simplesmente as ignoram).

Uso (precisa de Python 3 e do pacote PyMuPDF:  pip install pymupdf):
  python3 ferramentas/atualizar_banco.py --banco dados/questoes.js \
          novo_caderno_civil.pdf [outro.pdf ...]

A matéria de cada PDF é reconhecida pelo subtítulo da capa
("Direito Civil · TRT-8 2026 ...").
"""
import sys, re, json, glob, pymupdf, collections
FILES_ANTIGO = [
 ('DTRAB','Direito do Trabalho','TRT8_DT_'),
 ('PTRAB','Direito Processual do Trabalho','TRT8_ProcTrab_'),
 ('DCIV','Direito Civil','TRT8_DirCivil_'),
 ('PCIV','Direito Processual Civil','TRT8_ProcCivil_'),
 ('DADM','Direito Administrativo','TRT8_DirAdm_'),
 ('DCONST','Direito Constitucional','TRT8_DirConst_'),
]
NAVY=0x1e3a5f; BODY=0x1d2433; GREEN=0x166534; RED=0xb91c1c; GOLD=0x9a6700; PURPLE=0x6d28d9; YEL=0xf2b705; WHITE=0xffffff
problems=[]
def lines_of(doc):
    out=[]
    for page in doc:
        for b in page.get_text("dict")["blocks"]:
            if b["type"]!=0: continue
            for l in b["lines"]:
                sp=[s for s in l["spans"] if not s["font"].startswith("Type3")]
                if not sp: continue
                out.append(dict(page=page.number, y=l["bbox"][1], y1=l["bbox"][3], x=sp[0]["bbox"][0], spans=[(s["color"],round(s["size"],1),s["text"],s["bbox"][0]) for s in sp]))
    # sort within page by y then x
    out.sort(key=lambda L:(L['page'],round(L['y']),L['x']))
    return out
def txt(L): return ''.join(s[2] for s in L['spans'])
def join(a,b):
    a=a.rstrip(); b=b.strip()
    if not a: return b
    if not b: return a
    if a.endswith('-') and not a.endswith(' -'): return a+b
    return a+' '+b
def parse(code, name, f):
    doc=pymupdf.open(f)
    Ls=lines_of(doc)
    # merge lines on same y (spans split into separate lines by mupdf)
    merged=[]
    for L in Ls:
        if merged and merged[-1]['page']==L['page'] and abs(merged[-1]['y']-L['y'])<2.5:
            merged[-1]['spans']+=L['spans']; merged[-1]['spans'].sort(key=lambda s:s[3]); continue
        merged.append(dict(L))
    Ls=merged
    topics=[]; qs=[]; cur=None; state=None; prev=None
    i0=next(i for i,L in enumerate(Ls) if L['spans'][0][0]==YEL and L['spans'][0][1]==11.0)
    for L in Ls[i0:]:
        s0=L['spans'][0]; t=txt(L).strip()
        if not t: continue
        color,size=s0[0],s0[1]
        gap = (L['y']-prev['y']) if prev and prev['page']==L['page'] else None
        newpage = prev is not None and prev['page']!=L['page']
        # topic header
        if color==YEL and size==11.0:
            num=int(s0[2].strip().rstrip('.'))
            title=''.join(s[2] for s in L['spans'][1:]).strip()
            topics.append(dict(n=num,title=title)); state='topic'; prev=L; continue
        if color==WHITE and size==11.0 and state=='topic':
            topics[-1]['title']=join(topics[-1]['title'],t); prev=L; continue
        if color==NAVY and size==11.0 and t.startswith('Questão'):
            m=re.match(r'Questão (\d+)$',t)
            cur=dict(n=int(m.group(1)),topic=topics[-1]['n'],origem='',blocks=[],alts={},gab=None,analise=[],coments={},_page=L['page']+1)
            qs.append(cur); state='orig'; prev=L; continue
        if size==8.0 and color in (GOLD,PURPLE) and state in ('orig',):
            cur['origem']=join(cur['origem'],t); cur['_ocol']=color; prev=L; continue
        if state=='orig' and size==8.0: problems.append((code,cur['n'],'tag?',t))
        if color==GREEN and size==10.4 and t.startswith('Gabarito:'):
            cur['gab']=t.split(':',1)[1].strip(); state='gab'; prev=L; continue
        if state in ('orig','stmt','alt'):
            if state=='orig': state='stmt'
            if color==NAVY and size==10.4:
                lab=s0[2].strip(); rest=''.join(s[2] for s in L['spans'][1:]).strip()
                if re.fullmatch(r'[A-E]\)',lab):
                    cur['alts'][lab[0]]=rest; cur['_last']=('alt',lab[0]); state='alt'
                elif re.fullmatch(r'[IVX]+[.)]?',lab):
                    cur['blocks'].append(dict(k='item',r=lab,t=rest)); cur['_last']=('item',)
                else:
                    problems.append((code,cur['n'],'navy?',t)); cur['blocks'].append(dict(k='p',t=t)); cur['_last']=('p',)
                prev=L; continue
            # body text
            if state=='alt':
                k=cur['_last'][1]; cur['alts'][k]=join(cur['alts'][k],t)
                if L['x']<70: problems.append((code,cur['n'],'alt-cont x',t))
                prev=L; continue
            last=cur.get('_last')
            if last and last[0]=='item' and L['x']>=78 and not newpage and gap is not None and gap<16:
                cur['blocks'][-1]['t']=join(cur['blocks'][-1]['t'],t)
            elif last and last[0]=='item' and L['x']>=78 and newpage:
                cur['blocks'][-1]['t']=join(cur['blocks'][-1]['t'],t)
            elif last and last[0]=='p' and (gap is not None and gap<16.5 or newpage) and L['x']<78:
                cur['blocks'][-1]['t']=join(cur['blocks'][-1]['t'],t)
            else:
                cur['blocks'].append(dict(k='p',t=t,x=round(L['x']))); cur['_last']=('p',)
            prev=L; continue
        if state in ('gab','an','com'):
            if size==9.6 and color==BODY:
                if t=='Análise dos itens': state='an'; prev=L; continue
                m=re.match(r'^([IVX]+)\s+–\s+(.*)$',t)
                if m and L['x']<64: cur['analise'].append(dict(r=m.group(1),t=m.group(2)))
                elif cur['analise']: cur['analise'][-1]['t']=join(cur['analise'][-1]['t'],t)
                else: problems.append((code,cur['n'],'an?',t))
                prev=L; continue
            if color in (RED,GREEN) and size==10.4 and re.fullmatch(r'[A-E]\)',s0[2].strip()):
                k=s0[2].strip()[0]; ref=''; body=''
                for c,sz,tx,x in L['spans'][1:]:
                    if c==GOLD and sz==9.0: ref+=tx
                    else: body+=tx
                cur['coments'][k]=dict(ok=(color==GREEN),ref=ref.strip(),t=body.strip()); cur['_ck']=k; state='com'; prev=L; continue
            if state=='com':
                k=cur['_ck']; c=cur['coments'][k]
                for cc,sz,tx,x in L['spans']:
                    if cc==GOLD and sz==9.0 and not c['t']: c['ref']=join(c['ref'],tx)
                    else: c['t']=join(c['t'],tx)
                prev=L; continue
            problems.append((code,cur['n'] if cur else None,'unexp',t)); prev=L; continue
        problems.append((code,cur['n'] if cur else None,'unexp2',state,t)); prev=L
    return f,topics,qs

NOMES = {'Direito do Trabalho': 'DTRAB', 'Direito Processual do Trabalho': 'PTRAB', 'Direito Civil': 'DCIV',
         'Direito Processual Civil': 'PCIV', 'Direito Administrativo': 'DADM', 'Direito Constitucional': 'DCONST'}
CURTO = {'DTRAB': 'D. Trabalho', 'PTRAB': 'Proc. Trabalho', 'DCIV': 'D. Civil', 'PCIV': 'Proc. Civil', 'DADM': 'D. Administrativo', 'DCONST': 'D. Constitucional'}
ORDEM = ['DTRAB', 'PTRAB', 'DCIV', 'PCIV', 'DADM', 'DCONST']

def norm_orgao(o):
    o = o.replace('‑', '-')
    o = re.sub(r'^TRT-(\d)', r'TRT \1', o)
    o = re.sub(r'ªRegião', 'ª Região', o)
    o = re.sub(r'^(TR[TF] \d+ª)$', r'\1 Região', o)
    o = o.replace('Prefeitura do Jaboatão', 'Prefeitura de Jaboatão')
    if o == 'Prefeitura de Teresina-PI': o = 'Prefeitura de Teresina'
    return o

def digital(rec):
    t = ' '.join((b if isinstance(b, str) else b[0] + ' ' + b[1]) for b in rec['e']) + ' | ' + ' | '.join(rec['a'])
    return re.sub(r'\W+', '', t.lower())

def materia_do_pdf(f):
    capa = pymupdf.open(f)[0].get_text()
    for nome, code in sorted(NOMES.items(), key=lambda x: -len(x[0])):
        if nome + ' ·' in capa: return code, nome
    sys.exit(f'Não reconheci a matéria do PDF {f}. A capa precisa ter "Nome da matéria · TRT-8 ...".')

def registro(q, code):
    o = q['origem']; real = o.startswith('FCC')
    rec = dict(m=code, tp=q['topic'], o=o, r=1 if real else 0)
    if real:
        p = o.split(' · ')
        if len(p) >= 4 and p[2].strip().isdigit():
            rec['org'] = norm_orgao(p[1]); rec['ano'] = int(p[2]); rec['cargo'] = ' · '.join(p[3:])
    rec['e'] = [[b['r'], b['t']] if b['k'] == 'item' else b['t'] for b in q['blocks']]
    rec['a'] = [q['alts'][k] for k in 'ABCDE']
    rec['g'] = 'ABCDE'.index(q['gab'])
    rec['c'] = [[q['coments'][k]['ref'], q['coments'][k]['t']] for k in 'ABCDE']
    if q['analise']: rec['ai'] = [[a['r'], a['t']] for a in q['analise']]
    return rec

def main():
    import argparse, datetime
    ap = argparse.ArgumentParser(description='Atualiza dados/questoes.js a partir de cadernos em PDF.')
    ap.add_argument('--banco', required=True, help='caminho do dados/questoes.js atual')
    ap.add_argument('--remover-ausentes', action='store_true', help='remove do banco as questões que não estão nos PDFs dessas matérias')
    ap.add_argument('pdfs', nargs='+')
    a = ap.parse_args()
    txt = open(a.banco, encoding='utf-8').read()
    banco = json.loads(txt.split('window.BANCO = ', 1)[1].rstrip().rstrip(';'))
    por_id = {q['id']: q for q in banco['questoes']}
    por_dig = collections.defaultdict(list)
    for q in banco['questoes']: por_dig[digital(q)].append(q['id'])
    maior = collections.Counter()
    for q in banco['questoes']:
        m, n = q['id'].rsplit('-', 1); maior[m] = max(maior[m], int(n))
    mats = {m['id']: m for m in banco['materias']}
    relatorio = []
    for f in a.pdfs:
        code, nome = materia_do_pdf(f)
        _, topics, qs = parse(code, nome, f)
        if problems:
            print('ATENÇÃO – problemas de leitura:'); [print('  ', p) for p in problems]
            sys.exit('Corrija o PDF (ou peça ajuda) antes de atualizar.')
        mats.setdefault(code, dict(id=code, nome=nome, curto=CURTO[code], topicos=[]))
        mats[code]['topicos'] = [dict(n=t['n'], t=t['title']) for t in topics]
        vistos = set(); novos = mantidos = 0
        for q in qs:
            rec = registro(q, code)
            d = digital(rec)
            iguais = [i for i in por_dig.get(d, []) if i.startswith(code + '-') and i not in vistos]
            if iguais:
                rec['id'] = iguais[0]; mantidos += 1
            else:
                maior[code] += 1; rec['id'] = f'{code}-{maior[code]:03d}'; novos += 1
            por_id[rec['id']] = rec; vistos.add(rec['id'])
        removidos = 0
        if a.remover_ausentes:
            for qid in [k for k in por_id if k.startswith(code + '-') and k not in vistos]:
                del por_id[qid]; removidos += 1
        ausentes = len([k for k in por_id if k.startswith(code + '-') and k not in vistos])
        relatorio.append(f'{nome}: {len(qs)} no PDF · {mantidos} mantidas com o mesmo código · {novos} novas · {removidos} removidas · {ausentes} antigas fora deste PDF (mantidas)')
    qs = sorted(por_id.values(), key=lambda r: (ORDEM.index(r['m']), int(r['id'].rsplit('-', 1)[1])))
    out = dict(versao=datetime.date.today().isoformat(), materias=[mats[m] for m in ORDEM if m in mats], questoes=qs)
    js = '/* Banco de questões – gerado a partir dos cadernos comentados. Não edite à mão; veja ATUALIZAR_BANCO.md */\nwindow.BANCO = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(a.banco, 'w', encoding='utf-8').write(js)
    print('\n'.join(relatorio)); print(f'Total no banco: {len(qs)} questões. Arquivo salvo: {a.banco}')

if __name__ == '__main__':
    main()
