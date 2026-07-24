#!/usr/bin/env python3
"""法案タブ データビルダー（案A: 制定法のみ / v1）

e-Gov法令API v2 から対象期間の制定法を列挙し、附則の見直し条項を抽出して
  data/hoan_review.csv           … 索引・機械項目（1行1法律）
  data/hoan_clauses/{law_id}.txt … 見直し条項の原文（逐語・サイドカー）
を生成する。

使い方:
  python3 bin/build_hoan.py                 # 既定期間で全件生成
  python3 bin/build_hoan.py --from 2021-01-01 --to 2025-12-31

設計メモ（仕様書 v0.2 §5/§6 準拠）:
- 対象は制定法のみ。改正法の見直し条項は改正対象法の附則に AmendLawNum 付きで畳み込まれるため、
  ここでは `AmendLawNum` を持たない <SupplProvision>（＝その法自身の附則）だけを見る。
- 定型句マッチは受動態対応必須（議員立法は「検討が加えられ／措置が講ぜられる」）。
- 当初施行日は amendment_type=="1"（制定）リビジョンの施行日を採用（政令依存の施行日もここで解決済み）。
  段階施行で制定リビジョンが複数ある場合は本体施行日（最後の制定リビジョン）を採り、注記を付す。
- CSV の自由記述欄に ASCII カンマ・改行を入れない（既存 csv.js は単純 split(",")）。読点は「、」。
"""
import argparse, csv, json, os, re, sys, time, urllib.request
import xml.etree.ElementTree as ET
from datetime import date

API = "https://laws.e-gov.go.jp/api/2"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.normpath(os.path.join(HERE, "..", "data"))
CLAUSE_DIR = os.path.join(DATA, "hoan_clauses")
TODAY = date.today().isoformat()

# --- HTTP ---
def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1:
                raise
            time.sleep(1.0 + i)

# --- 漢数字→int（1〜99で足りる） ---
K = {'〇':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
def kanji_num(s):
    if not s:
        return None
    if '十' in s:
        a, _, b = s.partition('十')
        return (K.get(a, 1) if a else 1) * 10 + (K.get(b, 0) if b else 0)
    if s in K:
        return K[s]
    m = re.search(r'\d+', s)
    return int(m.group()) if m else None

# --- 定型句パターン（§5・受動態対応） ---
KENTO = re.compile(r'検討(?:を加え|が加えられ|を行(?:い|う)|する)')
YEAR = re.compile(r'施行(?:の日)?(?:から|後)(?:起算して)?([一二三四五六七八九十〇\d]+)年')

def local(tag):
    return tag.rsplit('}', 1)[-1]

def norm(el):
    return re.sub(r'[\s　]+', '', ''.join(el.itertext()))

def flow(el):
    """原文表示用: 各行を strip して空行を落とし、見出し・条番号・本文を素直に並べる。"""
    lines = [re.sub(r'[ \t　]+', '', ln) for ln in ''.join(el.itertext()).split('\n')]
    return '\n'.join(ln for ln in lines if ln)

def original_suppl(root):
    """AmendLawNum を持たない <SupplProvision>（その法自身の附則）を返す。"""
    return [sp for sp in root.iter()
            if local(sp.tag) == 'SupplProvision' and 'AmendLawNum' not in sp.attrib]

def review_blocks(sp):
    """附則内の見直し条項ブロック（Article単位、なければ Paragraph 単位）を原文で返す。"""
    arts = [e for e in sp.iter() if local(e.tag) == 'Article']
    candidates = arts if arts else [e for e in sp.iter() if local(e.tag) == 'Paragraph']
    blocks = []
    for e in candidates:
        txt = norm(e)
        if KENTO.search(txt):
            blocks.append(flow(e))
    # 重複（Article内Paragraphの二重取り）を除去
    uniq = []
    for b in blocks:
        if not any(b in u or u in b for u in uniq):
            uniq.append(b)
    return uniq

def enforcement(law_id):
    """当初施行日（本体施行日）と段階施行フラグを返す。"""
    try:
        d = json.loads(get(f"{API}/law_revisions/{law_id}"))
    except Exception:
        return None, False
    revs = d.get('revisions', []) or []
    seibutei = [r for r in revs if r.get('amendment_type') == '1'
                and r.get('amendment_enforcement_date')]
    if not seibutei:
        return None, False
    dates = sorted(r['amendment_enforcement_date'] for r in seibutei)
    # 本体施行日 = 最後（最も遅い）の制定リビジョンの施行日
    return dates[-1], (len(set(dates)) > 1)

def add_years(iso, n):
    y, m, d = map(int, iso.split('-'))
    try:
        return date(y + n, m, d).isoformat()
    except ValueError:  # 2/29 等
        return date(y + n, m, d - 1).isoformat()

def list_acts(dfrom, dto):
    laws, offset = [], 0
    while True:
        url = (f"{API}/laws?law_type=Act&promulgation_date_from={dfrom}"
               f"&promulgation_date_to={dto}&limit=100&offset={offset}")
        d = json.loads(get(url))
        laws.extend(d['laws'])
        offset = d.get('next_offset')
        if not offset or offset >= d['total_count']:
            break
    return laws

def build(dfrom, dto):
    os.makedirs(CLAUSE_DIR, exist_ok=True)
    laws = list_acts(dfrom, dto)
    print(f"# 制定法 {len(laws)}件（{dfrom}〜{dto}）を走査", file=sys.stderr)
    rows = []
    for l in laws:
        li, ri = l['law_info'], l['revision_info']
        law_id = li['law_id']
        root = ET.fromstring(get(f"{API}/law_data/{law_id}?response_format=xml"))
        blocks = []
        for sp in original_suppl(root):
            blocks.extend(review_blocks(sp))
        if not blocks:
            time.sleep(0.15)
            continue
        joined = "\n".join(blocks)
        ym = YEAR.search(joined)
        years = kanji_num(ym.group(1)) if ym else None
        enf, staged = enforcement(law_id)
        deadline = add_years(enf, years) if (enf and years) else ""
        if years is None:
            status = "no_deadline"
        elif deadline and deadline <= TODAY:
            status = "due"
        else:
            status = "pending"
        note = "段階施行" if staged else ""
        rows.append({
            "law_id": law_id,
            "law_title": ri['law_title'],
            "law_num": li['law_num'],
            "promulgation_date": li['promulgation_date'],
            "enforcement_date": enf or "",
            "enforcement_note": note,
            "review_years": years if years is not None else "",
            "review_deadline": deadline,
            "review_status": status,
            "status_note": "",
            "source_law_url": f"https://laws.e-gov.go.jp/law/{law_id}",
            "last_checked": TODAY,
        })
        # サイドカー: 見直し条項の原文（逐語）
        header = f"{ri['law_title']}（{li['law_num']}）\n出典: https://laws.e-gov.go.jp/law/{law_id}\n\n"
        with open(os.path.join(CLAUSE_DIR, f"{law_id}.txt"), "w", encoding="utf-8") as f:
            f.write(header + "\n\n".join(blocks) + "\n")
        print(f"  ✅ {li['law_num']} {ri['law_title'][:26]}  年数={years} 期限={deadline or '—'} {status}", file=sys.stderr)
        time.sleep(0.15)

    # ASCII カンマ混入チェック（csv.js の単純パーサ保護）
    cols = ["law_id","law_title","law_num","promulgation_date","enforcement_date",
            "enforcement_note","review_years","review_deadline","review_status",
            "status_note","source_law_url","last_checked"]
    for r in rows:
        for c in cols:
            if "," in str(r[c]) or "\n" in str(r[c]):
                raise ValueError(f"ASCIIカンマ/改行混入: {r['law_id']} {c}={r[c]!r}")
    # 期限順（due→pending→no_deadline、期限昇順）
    order = {"due": 0, "pending": 1, "no_deadline": 2}
    rows.sort(key=lambda r: (order[r["review_status"]], r["review_deadline"] or "9999"))
    out = os.path.join(DATA, "hoan_review.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    n_due = sum(1 for r in rows if r["review_status"] == "due")
    print(f"# {len(rows)}件を {out} に出力（うち due={n_due}）", file=sys.stderr)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="dfrom", default="2021-01-01")
    ap.add_argument("--to", dest="dto", default="2025-12-31")
    a = ap.parse_args()
    build(a.dfrom, a.dto)
