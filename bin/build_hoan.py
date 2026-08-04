#!/usr/bin/env python3
"""法案タブ データビルダー（案A: 制定法のみ / v1）

e-Gov法令API v2 から対象期間の制定法を列挙し、附則の見直し条項を抽出して
  data/hoan_review.csv           … 索引・機械項目（1行1法律）
  data/hoan_clauses/{law_id}.txt … 見直し条項の原文（逐語・サイドカー）
を生成する。あわせて法務省「日本法令外国語訳データベースシステム」に公式英訳が
あるかを法令番号で照会し、あれば translation_url / translation_note を埋める。

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
- 公式英訳の有無は**焼き込まず毎回照会する**。訳は後から追加されるので、一覧を
  コードに書くと必ず腐る（下の jlt_lookup のコメントを参照）。
"""
import argparse, csv, http.cookiejar, json, os, re, sys, time
import urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from datetime import date

API = "https://laws.e-gov.go.jp/api/2"
UA = "zurekei-build/1.0 (+https://zurekei.org/)"
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

# --- 漢数字→int（法令番号用。百の位まで。「元」＝1） ---
# 上の kanji_num と分けてあるのは入力の性質が違うため。あちらは見直し条項の
# 「施行後◯年」（1〜99・算用数字混じりもある本文からの抜き出し）で、こちらは
# 法令番号の年と号（令和四年法律第百五号のように百を含み、令和元年もある）。
# 規則は hoan.js の kanjiToInt と同じにしてある（同じ文字列を同じ数に読む必要が
# あるのは、この2つが同一のCSV列を作る側と読む側だから）。
def kanji_int(s):
    n, cur = 0, 0
    for ch in s or '':
        if ch == '元':
            cur = 1
        elif ch in K and ch != '〇':
            cur = K[ch]
        elif ch == '十':
            n += (cur or 1) * 10
            cur = 0
        elif ch == '百':
            n += (cur or 1) * 100
            cur = 0
        else:
            return None
    return n + cur

# --- 公式英訳（法務省「日本法令外国語訳データベースシステム」）の照会 ---
#
# 訳がある法律だけ一次資料へのリンクを出すために、対象法ごとに**法令番号で**
# 照会する。法令名での照会にしないのは、JLT側の日本語表題が e-Gov と字句レベルで
# 一致する保証が無いのに対し、法令番号は法律の識別子そのものだから。
#
# 結果の一覧をコードに焼き込まないこと。カバー率は時間とともに上がる（2026-08-04
# の実測で対象49法のうち18法=37%）ので、焼き込むと必ず古くなる。
#
# 検索フォーム（/ja/laws/search-no）は POST で、CSRFトークンとcookieが要る。
# 検索範囲のチェックボックスは4つあり、既定では ia（暫定版）と ja（概要情報）が
# 入っている。**ja は必ず外す。** 概要情報は「訳は無いが概要だけある」法律にも
# 付いているので、外さないと訳の無い法律まで当たる。ha（過去の法令データ）と
# la（未翻訳法令の法令名）も外したままにする。
#
# 暫定版（JLT の言う "Tentative translation"。ネイティブ・専門家の校閲前）は
# 訳の質が違うので区別して記録する。判定は ia を外した検索で当たるかどうかで
# 見る。ページ本文の「暫定版」表示を読む手もあるが、それは注意書きの文言に
# 依存する（実際、表題の側には何も付かない）ので検索条件で切るほうが堅い。
JLT = "https://www.japaneselawtranslation.go.jp"
ERA_CODE = {'明治': 1, '大正': 2, '昭和': 3, '平成': 4, '令和': 5}
LAW_NUM_RE = re.compile(r'^(明治|大正|昭和|平成|令和)(.+?)年法律第(.+?)号$')

def law_num_parts(law_num):
    """"令和四年法律第七十八号" -> (5, 4, 78)。読めない形は None。"""
    m = LAW_NUM_RE.match(law_num or '')
    if not m:
        return None
    year, no = kanji_int(m.group(2)), kanji_int(m.group(3))
    if not year or not no:
        return None
    return ERA_CODE[m.group(1)], year, no

def jlt_open():
    """cookie付きのopenerとCSRFトークンを返す。"""
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [('User-Agent', UA)]
    html = op.open(f"{JLT}/ja/laws/search-no", timeout=60).read().decode('utf-8')
    m = re.search(r'name="_csrfToken"[^>]*value="([^"]+)"', html)
    if not m:
        raise RuntimeError("JLT: 検索フォームから _csrfToken を取れない（フォームの作りが変わった可能性）")
    return op, m.group(1)

def jlt_search(op, tok, gn, sy, no, tentative):
    """法令番号で検索し、当たった翻訳データのID（/laws/view/{id} の id）を返す。"""
    fields = {'_csrfToken': tok, 'gn': str(gn), 'sy': str(sy), 'ht': 'A', 'no': str(no)}
    if tentative:
        fields['ia'] = '03'   # 暫定版を含む
    req = urllib.request.Request(
        f"{JLT}/ja/laws/result/",
        data=urllib.parse.urlencode(fields).encode(),
        headers={'User-Agent': UA, 'Referer': f"{JLT}/ja/laws/search-no"},
    )
    body = op.open(req, timeout=60).read().decode('utf-8')
    ids = re.findall(r'/ja/laws/view/(\d+)', body)
    return sorted(set(ids), key=ids.index)

def jlt_lookup(op, tok, law_num, law_title):
    """(translation_url, translation_note) を返す。訳が無ければ ("", "")。"""
    parts = law_num_parts(law_num)
    if not parts:
        print(f"  ⚠ 法令番号を読めないので英訳の照会を省く: {law_num}", file=sys.stderr)
        return "", ""
    gn, sy, no = parts
    ids = jlt_search(op, tok, gn, sy, no, tentative=False)
    note = ""
    time.sleep(0.3)
    if not ids:
        ids = jlt_search(op, tok, gn, sy, no, tentative=True)
        time.sleep(0.3)
        if ids:
            note = "暫定版"
    if not ids:
        return "", ""
    if len(ids) > 1:
        raise RuntimeError(f"JLT: {law_num} に翻訳データが{len(ids)}件当たった（法令番号は一意のはず）: {ids}")
    vid = ids[0]
    # 当たったデータが本当にこの法律かを、翻訳ページ側の法令番号で確かめる。
    # 検索が法令番号によるものである以上ふつうは自明だが、ここを信じ違えると
    # 「別の法律の訳へのリンク」を一次資料として出すことになるので確認する。
    page = op.open(f"{JLT}/en/laws/view/{vid}", timeout=60).read().decode('utf-8')
    page = re.sub(r'\s+', ' ', page)
    titles = re.findall(r'<div class="title"> (.*?) </div>', page)
    if not titles or f"（{law_num}）" not in titles[0]:
        raise RuntimeError(f"JLT: view/{vid} の表題に {law_num} が無い（照合失敗）: {titles[:1]}")
    if titles[0].replace(f"（{law_num}）", "").strip() != law_title:
        # 表題の字句違いは実害が無い（照合は法令番号でしている）ので止めない。
        print(f"  ⚠ 英訳ページの法令名が e-Gov と違う: {law_num}", file=sys.stderr)
    time.sleep(0.3)
    return f"{JLT}/en/laws/view/{vid}", note

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
    jlt_op, jlt_tok = jlt_open()
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
        trans_url, trans_note = jlt_lookup(jlt_op, jlt_tok, li['law_num'], ri['law_title'])
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
            "translation_url": trans_url,
            "translation_note": trans_note,
            "last_checked": TODAY,
        })
        # サイドカー: 見直し条項の原文（逐語）
        header = f"{ri['law_title']}（{li['law_num']}）\n出典: https://laws.e-gov.go.jp/law/{law_id}\n\n"
        with open(os.path.join(CLAUSE_DIR, f"{law_id}.txt"), "w", encoding="utf-8") as f:
            f.write(header + "\n\n".join(blocks) + "\n")
        tr = "英訳" + ("(暫定版)" if trans_note else "") if trans_url else "—"
        print(f"  ✅ {li['law_num']} {ri['law_title'][:26]}  年数={years} 期限={deadline or '—'} {status} {tr}", file=sys.stderr)
        time.sleep(0.15)

    # ASCII カンマ混入チェック（csv.js の単純パーサ保護）
    cols = ["law_id","law_title","law_num","promulgation_date","enforcement_date",
            "enforcement_note","review_years","review_deadline","review_status",
            "status_note","source_law_url","translation_url","translation_note","last_checked"]
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
    n_tr = sum(1 for r in rows if r["translation_url"])
    n_tent = sum(1 for r in rows if r["translation_note"] == "暫定版")
    print(f"# {len(rows)}件を {out} に出力（うち due={n_due} / 公式英訳あり={n_tr}（暫定版{n_tent}））", file=sys.stderr)

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="dfrom", default="2021-01-01")
    ap.add_argument("--to", dest="dto", default="2025-12-31")
    a = ap.parse_args()
    build(a.dfrom, a.dto)
