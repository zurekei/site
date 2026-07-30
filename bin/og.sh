#!/usr/bin/env bash
# assets/og.png(ja) と assets/og-en.png(en) を og.html から焼き直す。
#
# 何をするか:
#   1. リポジトリルートをドキュメントルートにローカルHTTPサーバを一時的に立てる
#   2. ヘッドレスChromeで og.html?shot(ja) と og.html?shot&lang=en(en) をそれぞれ
#      1200x630・DPR2でスクリーンショットし、2400x1260のPNGとして書き出す
#   3. 書き出したPNGのサイズと、同じChrome実行で取った--dump-domの中身を
#      検証してから所定の場所へ置く(検証前の一時ファイルに書き、通ってから
#      mvするので、失敗時に既存の正しいassets/og*.pngを上書きすることもない)
#   4. 入力ファイル群(CSV・og.html・csv.js・style.css)のsha256を
#      assets/og.inputs.json(スタンプ)へ書く。node bin/build.mjs --check の
#      陳腐化検査はこのスタンプを見て「焼き直し忘れ」を検出する(詳細は
#      bin/build.mjs の ogStalenessErrors() 直上コメントを参照)
#
# ■ verify_size が実際に保証すること・しないこと(正直に書く)
#   verify_sizeが見ているのは --window-size と force-device-scale-factor
#   から機械的に決まる寸法(2400x1260)だけで、**ページの内容には一切依存
#   しない**。フォント読み込み失敗・CSVのfetch失敗で空のチャートになった
#   場合・Chromeがエラーページを表示した場合、いずれも寸法自体は2400x1260の
#   まま出てくるので、verify_sizeだけでは検出できない。実際に守れるのは
#   「Chromeがファイルを書けなかった」「DPR指定が効かなかった」の類だけ。
#   中身の検証は下のverify_dom()が別に行う(--dump-domでDOMを取り、フッタの
#   年度ラベルと実績線のパスが描けているかを見る)。それでも**フォントの
#   フォールバック表示(指定フォントが読めず代替書体で描かれる)はどちらの
#   機械的検査でも捕まらない**。ここは焼いた画像を目で見て確認するしかない。
#
# 使い方:
#   bin/og.sh
#
# data/gdp_forecast.csv や og.html を直しても、このスクリプトで焼き直すまでは
# 配信中のOGP画像が古いまま(実際にFY1980〜1997の見通しを収集した後もこれを
# 忘れ、破線が1998年からしか無い古い画像が公開され続けていたことがある)。
# node bin/build.mjs --check がこの焼き直し忘れを検出する(詳細はそちらの
# コメントを参照)。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# node bin/build.mjs の OG_INPUT_RELS と同じ集合を指す(片方だけ増減すると
# --check が「スタンプの記録パスが一致しない」で機械的に気づく)。
INPUT_RELS=(data/gdp_forecast.csv og.html csv.js style.css)
STAMP_REL="assets/og.inputs.json"

for cmd in python3 sips curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: $cmd が必要です(未インストール)。" >&2
    exit 1
  fi
done

if [[ ! -x "$CHROME" ]]; then
  echo "エラー: Google Chrome が見つかりません($CHROME)。" >&2
  exit 1
fi

# フッタの年度ラベルが「data/gdp_forecast.csvの最小年度から始まっているか」を
# verify_domで機械的に見るための期待値。og.html側もCSVのxMinから導いている
# (ハードコードしていない)ので、ここも同じくCSVから計算する。
MIN_YEAR="$(python3 -c '
import csv, sys
with open(sys.argv[1], newline="") as f:
    years = [int(row["fiscal_year"]) for row in csv.DictReader(f) if row.get("fiscal_year")]
print(min(years))
' "$ROOT/data/gdp_forecast.csv")"

# 他の常用サービスと衝突しにくい範囲から、空いているポートを1つ選ぶ。
# 「使用中かどうか」は実際に接続を試みて判定する(lsof等の追加ツールを
# 要求しないため)。候補が全滅していたら明示的に失敗する。
# --max-time は「接続は受けるが応答しない」相手で無限に待つ経路を塞ぐための
# 保険(--connect-timeoutは接続確立までしか見ない)。
PORT=""
for candidate in 8917 8927 8937 8947 8957; do
  if ! curl -s -o /dev/null --connect-timeout 1 --max-time 2 "http://127.0.0.1:$candidate/" 2>/dev/null; then
    PORT="$candidate"
    break
  fi
done
if [[ -z "$PORT" ]]; then
  echo "エラー: 候補ポート(8917/8927/8937/8947/8957)がすべて使用中でした。" >&2
  exit 1
fi

# site/ 配下に一時ファイルを置かない(デプロイ対象に混入する事故が過去にある。
# bin/deploy.sh の「なぜリポジトリの外に置くのか」参照)。mktemp は既定で
# システムの一時領域を使うので、ここでは何も指定しない。
SRV_PID=""
cleanup() {
  if [[ -n "$SRV_PID" ]]; then
    kill "$SRV_PID" 2>/dev/null || true
    wait "$SRV_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SRV_PID=$!

# 上のポート判定(空き確認)とここでの実際のbind(python起動)の間には、
# 別プロセスが同じポートを取ってしまう競合の余地が原理的にある。
# pythonは`&`でバックグラウンド起動しているので、bind失敗しても`set -e`には
# 掛からない。ここでのREADYプローブに`-f`を付けるのはその対策: `-f`が無いと
# 「(別プロセスが返した)HTTPエラー応答」も「成功」として扱われてしまい、
# 正規のサーバが立っていないのに後続のChromeが誤ったページ(404等)を
# スクリーンショットし、それを正規画像として上書きしかねない。`-f`なら
# 2xx以外は失敗として扱われるので、そのすり替わりを防げる。--max-timeは
# 上と同じく「応答しない相手」で1回のプローブが無限に待たないための保険。
READY=""
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$PORT/og.html"; then
    READY=1
    break
  fi
  sleep 0.1
done
if [[ -z "$READY" ]]; then
  echo "エラー: ローカルサーバ(ポート$PORT)が起動しませんでした。" >&2
  exit 1
fi

verify_size() {
  local f="$1"
  local w h
  w="$(sips -g pixelWidth "$f" 2>/dev/null | awk '/pixelWidth/{print $2}')"
  h="$(sips -g pixelHeight "$f" 2>/dev/null | awk '/pixelHeight/{print $2}')"
  if [[ "$w" != "2400" || "$h" != "1260" ]]; then
    echo "エラー: $f のサイズが 2400x1260 ではありません(実際: ${w:-?}x${h:-?})。" >&2
    echo "  Chromeがファイルを書けなかった等の可能性があります(中身の壊れ方はverify_domが別に見る)。" >&2
    exit 1
  fi
}

# --dump-dom で取ったDOMの中身を見て、絵として壊れていないかを機械的に
# 確かめる(verify_sizeは寸法しか見ないため、これとは別枠で必要)。
#   (a) フッタの年度ラベルが「${MIN_YEAR}–」で始まっているか
#       (CSVのfetch失敗でrowsが空になると、og.htmlのfooterRange()は
#       呼ばれるがxMin/xMaxがNaN・Infinity等になり、この形にならない)
#   (b) 実績線(line-actual)のpath要素にd="M <数字>…という実データが
#       入っているか(rowsが空だとd=""になり、線が1本も引かれない)
# ここで捕まえられないもの(正直に書く): 指定フォントの読み込みに失敗して
# 代替書体にフォールバックした場合。DOM構造やテキスト自体は正しいままなので
# 機械的には検出できず、目視確認に頼るしかない。
verify_dom() {
  local dom="$1" query="$2"
  if [[ ! -s "$dom" ]]; then
    echo "エラー: --dump-domの出力が空です(query=$query)。Chromeがページを読めていない可能性。" >&2
    exit 1
  fi
  if ! grep -q "id=\"og-footer-range\">[^<]*${MIN_YEAR}–" "$dom"; then
    echo "エラー: フッタの年度ラベルが期待どおりでない(${MIN_YEAR}– を含まない、query=$query)。" >&2
    echo "  CSVのfetch失敗やJSエラーの可能性があります。" >&2
    exit 1
  fi
  if ! grep -Eq 'class="line-actual"[^>]*d="M [0-9]' "$dom"; then
    echo "エラー: 実績線(line-actual)にデータが描かれていません(query=$query)。" >&2
    echo "  CSVのfetch失敗の可能性があります。" >&2
    exit 1
  fi
}

# $1: og.html に渡すクエリ文字列(shot / shot&lang=en) $2: 書き出し先の最終パス
shoot() {
  local query="$1" out="$2"
  local udir wdir tmp_png tmp_dom
  udir="$(mktemp -d)"
  wdir="$(mktemp -d)"
  tmp_png="$wdir/shot.png"
  tmp_dom="$wdir/shot.dom.html"

  # --screenshot と --dump-dom は同一のChrome実行で両立する(実機で確認済み:
  # PNGとDOMの両方が正しく書き出される)。2回走らせて実行時間と壊れやすさを
  # 増やすより、1回の起動で両方取れるほうが良いのでこの形にしている。
  "$CHROME" \
    --headless=new --disable-gpu --hide-scrollbars \
    --user-data-dir="$udir" \
    --window-size=1200,630 --force-device-scale-factor=2 \
    --virtual-time-budget=10000 \
    --screenshot="$tmp_png" \
    --dump-dom \
    "http://127.0.0.1:$PORT/og.html?$query" \
    > "$tmp_dom" 2>/dev/null &
  local cpid=$!

  # --virtual-time-budget が経過すればスクリーンショット自体はその時点で
  # 書き出されるが、Chrome(headless=new)のプロセスがそのあと自分で終了せず
  # 居座ることが実機で確認できている(GoogleUpdater等の裏プロセスを連れて
  # 残り続ける)。ファイルはこの時点で既に完成しているので、プロセスの自然
  # 終了を待たず一定秒数で強制終了して先へ進む。10秒の予算に対して25秒待てば
  # 十分な余裕がある。
  local waited=0
  while kill -0 "$cpid" 2>/dev/null; do
    if (( waited >= 25 )); then
      kill -9 "$cpid" 2>/dev/null || true
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$cpid" 2>/dev/null || true

  rm -rf "$udir"
  if [[ ! -s "$tmp_png" ]]; then
    echo "エラー: Chromeがスクリーンショットを書き出せませんでした(query=$query)。" >&2
    rm -rf "$wdir"
    exit 1
  fi
  verify_size "$tmp_png"
  verify_dom "$tmp_dom" "$query"
  mv "$tmp_png" "$out"
  rm -rf "$wdir"
  echo "✓ $out を書き出しました。"
}

# 入力ファイル群のsha256をスタンプファイルへ書く。node bin/build.mjs --check
# はこのファイルと「いまの入力の実ハッシュ」を突き合わせて陳腐化を判定する
# (git のコミット日時やmtimeは見ない。理由は bin/build.mjs 側のコメント参照)。
# site/配下に置くため配信される(このファイルもwrangler pages deployの対象)が、
# 中身はパスとsha256ハッシュの対応表だけで秘密は一切含まない。承知の上で
# 置いている旨をJSON自身にもコメント相当のフィールドとして残す。
write_stamp() {
  python3 - "$ROOT" "$ROOT/$STAMP_REL" "${INPUT_RELS[@]}" <<'PYEOF'
import hashlib
import json
import os
import sys

root, out = sys.argv[1], sys.argv[2]
rels = sys.argv[3:]

inputs = {}
for rel in rels:
    with open(os.path.join(root, rel), "rb") as f:
        inputs[rel] = "sha256:" + hashlib.sha256(f.read()).hexdigest()

data = {
    "_comment": (
        "bin/og.sh が assets/og.png・assets/og-en.png を焼くたびに書き直す。"
        "node bin/build.mjs --check の陳腐化検査(ogStalenessErrors)が、"
        "ここに記録したsha256といまの入力ファイルの実ハッシュを突き合わせて"
        "焼き直し忘れを検出する。このファイルはsite/配下にあるため配信されるが、"
        "パスとハッシュの対応表だけで秘密は含まない(承知の上で置いている)。"
    ),
    "inputs": inputs,
}
with open(out, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=True)
    f.write("\n")
PYEOF
  echo "✓ $ROOT/$STAMP_REL を更新しました。"
}

shoot "shot" "$ROOT/assets/og.png"
shoot "shot&lang=en" "$ROOT/assets/og-en.png"
write_stamp
