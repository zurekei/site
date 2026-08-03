#!/usr/bin/env bash
# assets/og*.png(汎用2枚 + 指標8種×2言語の16枚 + 出生率専用2言語2枚 = 計20枚、
# 2026-07-30に出生率2枚を追加)を og.html から焼き直す。
#
# 何をするか:
#   1. リポジトリルートをドキュメントルートにローカルHTTPサーバを一時的に立てる
#   2. `node bin/build.mjs --og-list` から「焼くべきカード一覧」と「入力ファイル
#      一覧」をTSVで受け取る(この2つの集合の唯一の出所はbin/build.mjs側。
#      og.sh は自分でMETRICSやCSVパスの一覧を持たない。詳細は
#      bin/build.mjsのOG_CARDS/OG_INPUT_RELS直上コメントを参照)
#   3. ヘッドレスChromeで各カードのURL(og.html?<query>)を1200x630・DPR2で
#      スクリーンショットし、2400x1260のPNGとして書き出す
#   4. 書き出したPNGのサイズと、同じChrome実行で取った--dump-domの中身を
#      検証してから所定の場所へ置く(検証前の一時ファイルに書き、通ってから
#      mvするので、失敗時に既存の正しいassets/og*.pngを上書きすることもない)
#   5. 入力ファイル群(chart.js・全指標CSV・出生率CSV2本・og.html・csv.js・
#      style.css)のsha256を assets/og.inputs.json(スタンプ)へ書く。node bin/build.mjs
#      --check の陳腐化検査はこのスタンプを見て「焼き直し忘れ」を検出する
#      (詳細は bin/build.mjs の ogStalenessErrors() 直上コメントを参照)。
#      ハッシュは**焼き始める前**に固定し、全カードが成功したあとに書く
#      (write_stamp直上コメントのTOCTOU対策を参照)。
#
# ■ verify_size が実際に保証すること・しないこと(正直に書く)
#   verify_sizeが見ているのは --window-size と force-device-scale-factor
#   から機械的に決まる寸法(2400x1260)だけで、**ページの内容には一切依存
#   しない**。フォント読み込み失敗・CSVのfetch失敗で空のチャートになった
#   場合・Chromeがエラーページを表示した場合、いずれも寸法自体は2400x1260の
#   まま出てくるので、verify_sizeだけでは検出できない。実際に守れるのは
#   「Chromeがファイルを書けなかった」「DPR指定が効かなかった」の類だけ。
#   **PNGが途中で切れている場合も検出できない**(sipsは先頭のIHDRだけで
#   寸法を答えるため、切り詰めたファイルでも2400x1260と返す。実測で確認)。
#   これは png_complete() が末尾のIENDチャンクで別に見る。
#   中身の検証は下のverify_dom()が別に行う(--dump-domでDOMを取り、フッタの
#   年度ラベルと見通し線・実績線のパスが「データの実態どおりに」描けているかを
#   見る)。それでも**フォントのフォールバック表示(指定フォントが読めず
#   代替書体で描かれる)や、y軸ラベルのはみ出し(og.htmlのPAD.left見積もりは
#   実測ではない)はどちらの機械的検査でも捕まらない**。ここは焼いた画像を
#   目で見て確認するしかない。
#
# 使い方:
#   bin/og.sh
#
# data/*.csv や og.html を直しても、このスクリプトで焼き直すまでは配信中の
# OGP画像が古いまま(実際にFY1980〜1997の見通しを収集した後もこれを忘れ、
# 破線が1998年からしか無い古い画像が公開され続けていたことがある)。
# node bin/build.mjs --check がこの焼き直し忘れを検出する(詳細はそちらの
# コメントを参照)。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
STAMP_REL="assets/og.inputs.json"

for cmd in python3 sips curl node; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: $cmd が必要です(未インストール)。" >&2
    exit 1
  fi
done

if [[ ! -x "$CHROME" ]]; then
  echo "エラー: Google Chrome が見つかりません($CHROME)。" >&2
  exit 1
fi

# site/ 配下に一時ファイルを置かない(デプロイ対象に混入する事故が過去にある。
# bin/deploy.sh の「なぜリポジトリの外に置くのか」参照)。mktemp は既定で
# システムの一時領域を使うので、ここでは何も指定しない。
# cleanup対象になる一時ファイル/プロセスをここでまとめて宣言し、trapを
# スクリプトの早い段階で仕掛ける(以前はSRV_PID起動直前でtrapしていたが、
# それより前段(--og-listの読み出し)で使う一時ファイルもここに含めたため、
# その一時ファイルが作られるより前にtrapが効いている必要がある)。
SRV_PID=""
OG_LIST=""
STAMP_TMP=""
cleanup() {
  if [[ -n "$SRV_PID" ]]; then
    kill "$SRV_PID" 2>/dev/null || true
    wait "$SRV_PID" 2>/dev/null || true
  fi
  [[ -n "$OG_LIST" ]] && rm -f "$OG_LIST"
  [[ -n "$STAMP_TMP" ]] && rm -f "$STAMP_TMP"
  # 正常終了時、ここに来る時点でOG_LISTもSTAMP_TMPも既に""に戻っている
  # (それぞれ読み終わった・所定の場所へmvし終えた直後にリセットしている)ため、
  # 直前の `[[ -n "$STAMP_TMP" ]] && rm -f ...` は条件が偽のまま連鎖して
  # 関数の戻り値が1になる。**この関数の失敗を`set -e`(48行)が拾う**ため、
  # 無指定だと全カード成功・スタンプ更新も成功しているのに `bin/og.sh` が
  # exit 1で終わる欠陥があった(2026-07-30発見・出生率カード追加時に気づいた。
  # fertility対応そのものとは無関係の既存バグ)。明示的にreturn 0で閉じる。
  #
  # 機構の注記(2026-07-30に実測で確かめ直した): 「EXITトラップの戻り値が
  # スクリプトの終了コードにそのまま反映される」という説明を最初ここに書いたが、
  # **これは誤り**。同じcleanupを持つスクリプトから`set -e`だけ外すと正常終了は
  # exit 0になる(bash 3.2.57で確認)。起きているのは`set -e`が「トラップとして
  # 呼ばれたcleanupの失敗」を拾うことで、この違いは将来`set -e`の扱いを
  # 変える判断のときに効くので直しておく。`return 0`という対処自体は
  # どちらの機構でも正しい(正常時0・`exit 1`経路は1のまま。これも実測済み)。
  return 0
}
trap cleanup EXIT

# 焼くべきカード一覧と入力ファイル一覧を `node bin/build.mjs --og-list` から
# 受け取る。og.sh 側にMETRICSやCSVパスの手書きコピーを持たない(以前は
# INPUT_RELS をここに手書きし、「bin/build.mjs の OG_INPUT_RELS と同じ集合を
# 指す(片方だけ増減すると--checkが気づく)」という運用だったが、2026-07-30
# にそもそも1箇所にする設計へ変えた: --og-list はビルド側で全ページを一度
# メモリ生成してから返す作りなので実行に多少かかるが、ここで1回呼ぶだけで
# 済むので許容する)。
#
# ■ プロセス置換ではなく一時ファイルへ書き出してから読む(2026-07-30、C)
#   以前は `done < <(node "$ROOT/bin/build.mjs" --og-list)` というプロセス
#   置換で読んでいた。**プロセス置換の中のコマンドの終了コードは`set -e`では
#   拾えない**(bashの既知の仕様。置換全体はパイプの読み出し側の終了コードで
#   評価される)。当時は非空ガードしかなく、--og-listの出力が途中で切れた
#   場合(INPUT行が先頭にまとまって出る形式なので、切れるのはカード行側)、
#   一部のカードだけ焼いて**スタンプは全入力のハッシュで書く**という壊れ方を
#   しえた。焼かれなかったカードが古いまま`--check`が緑になり配信される。
#   過去のpre-pushフックの事故(`$(...)`の失敗を誰も見ずにexit 0していた)と
#   同型の穴だったため、`node ... --og-list > "$OG_LIST"` とリダイレクトで
#   一時ファイルへ書いてから読む形に変えた。これなら`set -e`がnodeの終了
#   コードを直接見る。
#   さらに --og-list 側(bin/build.mjs)が出力の末尾にENDセンチネルを付ける
#   ようになった(件数付き)。ここでは最終行がENDであること・実際に読めた
#   INPUT/CARDの件数がENDの宣言と一致することを確かめ、食い違えば止まる。
#   これで「センチネルより後ろが切れている」だけでなく「センチネル自体は
#   出たがその手前が切れている」ような部分出力も閉じられる。
#
#   出力形式(bin/build.mjsの--og-list直上コメントと対で。2026-07-30、
#   出生率カード対応でtype/vintageCountの2列を追加):
#     INPUT\t<相対パス>
#     CARD\t<query>\t<出力先相対パス>\t<期待最小年度>\t<hasForecast:0/1>\t<hasActual:0/1>\t<type>\t<vintageCount>
#     END\t<INPUT件数>\t<CARD件数>
#   type は "metric"(汎用2枚+指標8種×2言語)か "fertility"(出生率2言語)。
#   verify_dom はこれで検査内容を分岐する(下記参照)。未知のtypeが来たら
#   エラーで止める(fail-closed。「知らない行=カード」のフォールバックを
#   無くしたのと同じ趣旨)。vintageCount は type="fertility" のときだけ意味を
#   持つ(扇の本数の期待値)。type="metric" では常に0で未使用。
#
# ■ 知らない行はエラーにする(2026-07-30、D)
#   以前は "INPUT" 以外の行を無条件にカード扱いしていた。誰かがbin/build.mjs
#   の`--og-list`分岐より前(トップレベル)にデバッグの`console.log`を1行足す
#   だけで、その行がカードとして扱われ、タブを含まない行なら出力先が空に
#   なって `mv "$tmp_png" "$ROOT/"` でsite/直下にPNGが置かれ、次のデプロイで
#   配信されかねなかった(期待最小年度も空になるためフッタ検査(a)も退化して
#   どのフッタでも通ってしまう)。1列目が INPUT/CARD/END のいずれでもなければ
#   ここでエラーにする(「知らない行=カード」というフォールバックを無くす)。
#   カード行の形式(出力先が assets/og*.png の形・期待最小年度が数字のみ・
#   hasForecast/hasActualが0/1のみ・typeがmetric/fertilityのみ・vintageCountが
#   数字のみ)も併せて検証する(構造で塞ぐのと形式で塞ぐのは別の網なので
#   両方入れる)。
OG_LIST="$(mktemp)"
node "$ROOT/bin/build.mjs" --og-list > "$OG_LIST"

INPUT_RELS=()
CARD_QUERIES=()
CARD_OUTS=()
CARD_MIN_YEARS=()
CARD_HAS_FORECAST=()
CARD_HAS_ACTUAL=()
CARD_TYPES=()
CARD_VINTAGE_COUNTS=()
input_count=0
card_count=0
end_seen=0
end_line_no=0
line_no=0
while IFS=$'\t' read -r col1 col2 col3 col4 col5 col6 col7 col8; do
  line_no=$((line_no + 1))
  [[ -z "$col1" ]] && continue
  case "$col1" in
    INPUT)
      INPUT_RELS+=("$col2")
      input_count=$((input_count + 1))
      ;;
    CARD)
      # col2=query col3=出力先 col4=期待最小年度 col5=hasForecast col6=hasActual
      # col7=type(metric/fertility) col8=vintageCount(fertilityのみ意味を持つ)
      if [[ ! "$col3" =~ ^assets/og[A-Za-z0-9._-]*\.png$ ]]; then
        echo "エラー: --og-list のCARD行の出力先が assets/og*.png の形でない(out=$col3)。" >&2
        exit 1
      fi
      if [[ ! "$col4" =~ ^[0-9]+$ ]]; then
        echo "エラー: --og-list のCARD行の期待最小年度が数字でない(min_year=$col4, out=$col3)。" >&2
        exit 1
      fi
      if [[ "$col5" != "0" && "$col5" != "1" ]]; then
        echo "エラー: --og-list のCARD行のhasForecastが0/1でない(値=$col5, out=$col3)。" >&2
        exit 1
      fi
      if [[ "$col6" != "0" && "$col6" != "1" ]]; then
        echo "エラー: --og-list のCARD行のhasActualが0/1でない(値=$col6, out=$col3)。" >&2
        exit 1
      fi
      if [[ "$col7" != "metric" && "$col7" != "fertility" ]]; then
        echo "エラー: --og-list のCARD行のtypeがmetric/fertilityのいずれでもない(値=$col7, out=$col3)。bin/build.mjs側にtypeの付け忘れ・タイポがある可能性。" >&2
        exit 1
      fi
      if [[ ! "$col8" =~ ^[0-9]+$ ]]; then
        echo "エラー: --og-list のCARD行のvintageCountが数字でない(値=$col8, out=$col3)。" >&2
        exit 1
      fi
      CARD_QUERIES+=("$col2")
      CARD_OUTS+=("$col3")
      CARD_MIN_YEARS+=("$col4")
      CARD_HAS_FORECAST+=("$col5")
      CARD_HAS_ACTUAL+=("$col6")
      CARD_TYPES+=("$col7")
      CARD_VINTAGE_COUNTS+=("$col8")
      card_count=$((card_count + 1))
      ;;
    END)
      end_seen=1
      end_line_no=$line_no
      if [[ "$col2" != "$input_count" || "$col3" != "$card_count" ]]; then
        echo "エラー: --og-list のENDが宣言する件数(INPUT=$col2, CARD=$col3)が実際に読めた件数(INPUT=$input_count, CARD=$card_count)と一致しない(出力が途中で切れた可能性)。" >&2
        exit 1
      fi
      ;;
    *)
      echo "エラー: --og-list に未知の行種別($col1)。CARD行のつもりならbin/build.mjs側にCARD接頭辞の付け忘れがある可能性。" >&2
      exit 1
      ;;
  esac
done < "$OG_LIST"
rm -f "$OG_LIST"
OG_LIST=""

if [[ "$end_seen" -ne 1 ]]; then
  echo "エラー: --og-list の出力にENDセンチネルが無い(出力が途中で切れた可能性)。" >&2
  exit 1
fi
if [[ "$end_line_no" -ne "$line_no" ]]; then
  echo "エラー: --og-list のENDセンチネルが最終行でない(END行のあとにも行がある)。" >&2
  exit 1
fi

if [[ ${#CARD_OUTS[@]} -eq 0 || ${#INPUT_RELS[@]} -eq 0 ]]; then
  echo "エラー: node bin/build.mjs --og-list の出力が空(または不完全)でした。" >&2
  exit 1
fi

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

# PNGが最後まで書けているか。PNGの仕様上ファイルは必ずIENDチャンクで終わる
# ので、末尾12バイトに "IEND" があれば書き込みは完了している。
#
# なぜこれが要るか: **`sips` は途中で切れたPNGでも寸法を正しく答える**
# (IHDRはファイルの先頭にあるため)。実測で、正常な画像の先頭40000バイトだけを
# 切り出したファイルに対し `sips -g pixelWidth/pixelHeight` は 2400x1260 を
# 返して終了コード0だった。つまり verify_size は切り詰めを検出できない。
# 下の待ち合わせが「出力が完成したらChromeを強制終了する」方式である以上、
# 完成の判定を誤れば半分だけ描かれた画像がそのまま配信物になるので、
# ここは寸法とは別に必ず見る(2026-07-30に追加)。
png_complete() {
  local f="$1"
  [[ -s "$f" ]] || return 1
  tail -c 12 "$f" 2>/dev/null | LC_ALL=C grep -aq "IEND"
}

# --dump-dom の出力が最後まで書けているか。png_complete()と対称の考え方:
# `--dump-dom`が書くのはHTML文字列なので、`</html>`で終わっていれば書き込みは
# 完結している(2026-07-30追加、E)。
#
# なぜこれが要るか: 待ち合わせは以前 `[[ -s "$tmp_dom" ]]`(1バイト以上あるか)
# しか見ていなかった。PNG→DOMの順に書くChrome実行では、PNG完成・DOM書き出し
# 途中の瞬間に(png_completeとtmp_domの非空判定が両方たまたま真になり)
# `kill -9`が入りうる。結果は偽の赤(verify_domがフッタや線のパターンに
# マッチせず落ちる)なので配信事故には直結しないが、頻繁に誤爆する検査は
# 人を素の`npx wrangler`のような検査を経ない経路に逃がしかねないため、
# このリポジトリでは「安全性の問題」として扱い、png_complete()と同じ形の
# 待ち合わせ+検査を対で用意した。
dom_complete() {
  local f="$1"
  [[ -s "$f" ]] || return 1
  tail -c 200 "$f" 2>/dev/null | LC_ALL=C grep -aq "</html>"
}

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
# 確かめる(verify_sizeは寸法しか見ないため、これとは別枠で必要)。typeで
# 検査内容を分岐する(2026-07-30、出生率カード対応で追加):
#   (a) フッタの年度ラベルが「${min_year}–」を含むか(汎用カードは
#       「指標名 ${min_year}–…」、指標カードは「${min_year}–…」そのもの、
#       出生率カードは「${min_year}–…年」と文言の形がそれぞれ違うが、
#       どれも"${min_year}–"を含む点は共通なので同じパターンで全対応できる)。
#       これはtypeによらず常に見る。
#       min_year は `node bin/build.mjs --og-list` の4列目(カードごとの
#       期待最小年度)から受け取る。bash側にCSVパスや列名を持たず、
#       chart.js の METRICS(またはfertility用の専用CSV)が唯一の出所である
#       べきという方針に合わせている。なお、CSVのfetchがrejectする経路
#       (og.htmlのloadCSVが失敗する場合)はfooterRange()系関数自体が呼ばれず、
#       置き文字列(「…」)のまま残る。xMin/xMaxがNaN/Infinityになって呼ばれた
#       結果壊れた文字列が出る、という経路ではない(2026-07-30、H-3で記述を
#       実態に合わせた)。どちらの経路でもこの検査(a)は落ちるので実害は無い。
#   (b) type="metric" のとき: 見通し線(line-forecast)・実績線(line-actual)の
#       path要素それぞれについて、そのカードにその系列のデータが実際にある
#       か(hasForecast/hasActual、`--og-list`の5・6列目)に応じてd属性の形を
#       見る:
#         - データがある(1) → d="M <数字>… という実データが入っていることを
#           要求する(以前からある検査)
#         - データが無い(0) → その`class=`を持つ要素自体は存在し、かつ
#           d="M <数字>…になっていないことを要求する
#       2026-07-30(A)で追加。以前は実績線に対して「d="M <数字>を無条件に
#       要求する」という検査だけだったため、見通しだけ先に収集して実績値が
#       1つも無い指標をMETRICSに足すと、og.htmlは空のd=""を描き、この検査が
#       必ず落ちてbin/og.shが完走できなくなる(スタンプが書けず--checkも
#       赤のまま=時刻比較方式で踏んだのと同型のデッドロック)欠陥があった。
#       また検査が実績線しか見ていなかったため、forecastColの列名タイポ等で
#       見通し線が全滅しても検査は全部通り、実績線だけのカードが静かに
#       配信されうる欠陥もあった。データの実態どおりの線を要求する形にして
#       両方を塞いだ。
#   (c) type="fertility" のとき: 出生率カードには line-forecast が存在しない
#       (og.htmlのrenderFertility()はこの要素を一切appendしない別系統の
#       描画なので、metricの(b)のように「要素はあるがd=""」を要求すると
#       誤爆する)。代わりに実績線(line-actual)にデータが入っていることと、
#       扇の線(line-forecast-vintage)がvintageCount(`--og-list`の8列目)本
#       ちょうどデータ付きで描かれていることを見る(verify_fan、2026-07-30
#       追加)。1本でも欠けたら、あるいは余分に描かれても落ちる。
# ここで捕まえられないもの(正直に書く): 指定フォントの読み込みに失敗して
# 代替書体にフォールバックした場合。DOM構造やテキスト自体は正しいままなので
# 機械的には検出できず、目視確認に頼るしかない。同様にy軸ラベルの幅の
# 見積もり(og.htmlのPAD.left)がはみ出しているかどうかも、DOMのテキスト
# 自体は正しいので機械検査では捕まらず、目視確認に頼るしかない。
verify_dom() {
  local dom="$1" query="$2" min_year="$3" has_forecast="$4" has_actual="$5" type="$6" vintage_count="$7"
  if [[ ! -s "$dom" ]]; then
    echo "エラー: --dump-domの出力が空です(query=$query)。Chromeがページを読めていない可能性。" >&2
    exit 1
  fi
  if ! grep -q "id=\"og-footer-range\">[^<]*${min_year}–" "$dom"; then
    echo "エラー: フッタの年度ラベルが期待どおりでない(${min_year}– を含まない、query=$query)。" >&2
    echo "  CSVのfetch失敗やJSエラーの可能性があります。" >&2
    exit 1
  fi
  # (a-2) d属性にNaNが混ざっていないか(typeによらず全カードで見る。
  # 2026-07-30追加)。
  #
  # なぜ本数や「d="M <数字>」の検査だけでは足りないのか: csv.jsのtoNum()は
  # 空文字だけをnullにし、**空でない非数値セル(転記ミスの `1.49x934`、全角
  # 数字、単位の混入など)にはNaNを返す**。呼び出し側のフィルタは
  # `!== null` なのでNaNは素通りし、Math.min/Math.maxを1個汚染するだけで
  # y軸の定義域がNaNになり、**扇7本と実績線の全pathが
  # d="M 176,NaN L …NaN…" になって画面には1本も描かれない**。それでも
  #   - フッタ検査(a)はx定義域が無傷なので通る
  #   - verify_fan/verify_lineのパターンは `d="M [0-9]` で**最初のx座標しか
  #     見ない**ので、7本ちょうど数えて通る
  #   - bin/build.mjsのfertilityCardInfo()も同じ `!== null` フィルタで数えるため
  #     vintageCountは7のままで、両側が自己整合的に「正常」と答える
  # という具合に、**真っ白なカードが全機械検査を通過してデプロイされる**。
  # データの転記ミスはこのサイトで最もありそうな壊れ方なので、
  # 「1本でも描き漏れたら落ちる」という検査の触れ込みがそこで効かないのは
  # 設計の穴として塞ぐ(2026-07-30にog.htmlを実際に汚して再現を確認した)。
  # og.html/bin/build.mjs側もNumber.isFiniteで弾くようにしたが(そちらは
  # 「そもそもNaNを作らない」対策)、ここはDOMという最終成果物の側で見る
  # 独立した網として置く。指標カード側の `L x,NaN` の途中混入も同時に塞げる。
  #
  # パターンを**タグの中の属性値**に限定している(`<要素名 …属性="…NaN…"`)。
  # `d="[^"]*NaN` のような素朴なパターンでは駄目で、**--dump-domは<script>の
  # 中身もDOMとして吐く**ため、og.html側のJSコメントに壊れたd属性の実例を
  # 文字列として書いた瞬間に全カードで誤爆する(2026-07-30に実際に踏んだ。
  # og.htmlのrenderFertility側にも「実例を書くな」と注記した)。属性値に
  # 限定したのは、d属性以外(グリッド線のy1/y2、ラベルのx/y)もy軸の定義域が
  # 非数になれば同時に汚染されるので、そちらも一緒に捕まえるためでもある。
  if grep -Eq '<[a-z]+[^>]*="[^"]*NaN' "$dom"; then
    echo "エラー: SVG要素の属性値にNaNが混ざっています(query=$query)。" >&2
    echo "  CSVに空でない非数値セル(転記ミス・全角数字・単位の混入など)がある可能性があります。" >&2
    echo "  該当箇所: $(grep -Eo '<[a-z]+[^>]*="[^"]*NaN[^"]*"' "$dom" | head -1 | cut -c1-120)" >&2
    exit 1
  fi

  # ウェブフォントが載らないまま焼けた回を捕まえる(og.html の末尾が立てる印)。
  # IBM Plex Mono は 2026-08-03 から assets/fonts/ の woff2 を style.css の
  # @font-face で読む自前ホストになった(それ以前は Google Fonts の @import で、
  # 取得が --virtual-time-budget の内に間に合わないと落ちた)。自前ホストでも
  # ファイルの取り違え・パスの綴り違い・unicode-range の書き損じで同じ壊れ方を
  # するので、この検査は外さない。2026-08-01に og-fertility-en.png が実際に
  # フォールバックで焼かれている(データ・線は正しく、ワードマークだけが
  # サンセリフになる)。**PNGの中身は誰も検査していない**ので、DOM側にこの印を
  # 出させて見るのが唯一の機械的な手当てになる。印が立たない(=false、または
  # main() が投げて then に到達しなかった)場合はここで止める。
  if ! grep -q 'data-font-ok="1"' "$dom"; then
    echo "エラー: ウェブフォント(IBM Plex Mono)が載らないまま焼かれています(query=$query)。" >&2
    echo "  そのまま出すとワードマークだけがフォールバックのサンセリフになったカードが配信されます。" >&2
    echo "  assets/fonts/ の woff2 と style.css の @font-face の src が合っているかを確認すること" >&2
    echo "  (このスクリプトが立てるローカルサーバのルートは $ROOT なので、/assets/fonts/... で引ける)。" >&2
    exit 1
  fi

  case "$type" in
    metric)
      verify_line "$dom" "line-forecast" "$has_forecast" "$query"
      verify_line "$dom" "line-actual" "$has_actual" "$query"
      ;;
    fertility)
      verify_line "$dom" "line-actual" "$has_actual" "$query"
      verify_fan "$dom" "$vintage_count" "$query"
      ;;
    *)
      # --og-list読み込み時点(上のwhileループ)でmetric/fertility以外は
      # 既に弾いているので、ここに来るのはverify_domの呼び出し側自体に
      # バグがある場合のみ。fail-closedの最終防波堤として残す。
      echo "エラー: verify_domに未知のtype($type)が渡された(query=$query)。呼び出し側のバグの可能性。" >&2
      exit 1
      ;;
  esac
}

# verify_dom(b) の実体。class ("line-forecast"/"line-actual") が持つ
# d属性が、そのカードのデータ有無(want_data、0/1)と整合しているかを見る。
verify_line() {
  local dom="$1" class="$2" want_data="$3" query="$4"
  if [[ "$want_data" == "1" ]]; then
    if ! grep -Eq "class=\"${class}\"[^>]*d=\"M [0-9]" "$dom"; then
      echo "エラー: ${class}にデータが描かれていません(query=$query)。" >&2
      echo "  CSVのfetch失敗や列名(forecastCol/actualCol)の食い違いの可能性があります。" >&2
      exit 1
    fi
  else
    if ! grep -Eq "class=\"${class}\"" "$dom"; then
      echo "エラー: ${class}のpath要素自体がDOMに無い(query=$query)。og.htmlがd=\"\"でも常に両方のpath要素をappendする前提が崩れている可能性。" >&2
      exit 1
    fi
    if grep -Eq "class=\"${class}\"[^>]*d=\"M [0-9]" "$dom"; then
      echo "エラー: データが無いはずの${class}にd=\"M <数字>…が描かれています(query=$query)。" >&2
      echo "  --og-listのhasForecast/hasActualとog.html側の実際の描画が食い違っています(データやCSV列名の食い違いの可能性)。" >&2
      exit 1
    fi
  fi
}

# verify_dom(c) の実体。出生率カード専用: line-forecast-vintage クラスを
# 持つpath要素のうち、実際にデータ(d="M <数字>…)が入っているものの本数を
# 数え、期待本数(want_count、--og-listの8列目=vintage_yearの異なる値の
# 個数)とちょうど一致するかを見る。grep -o は一致1件につき1行を出力する
# ので、wc -l がそのまま本数になる(2026-07-30追加)。
verify_fan() {
  local dom="$1" want_count="$2" query="$3"
  local actual_count
  # `|| true` は grep の「0件マッチ=終了コード1」だけを握り潰すためのもので、
  # 本数の値そのものは wc の出力で確定している(2026-07-30追加)。これが無いと
  # `set -euo pipefail` 下でパイプライン全体が1になり、**代入文の失敗として
  # errexit が即座にスクリプトを殺す**ため、下の比較にも「本数が期待と違う」
  # というメッセージにも一切到達せず無言でexit 1になる。実測で確認した。
  # 影響は2つあり、どちらも都合が悪い:
  #   - 扇が全滅した(0本)という**この検査が最も捕まえたいケース**でだけ
  #     診断が出ない(1本欠けの6本なら出る、という一貫しない挙動になる)
  #   - data/fertility_forecast.csv が正当に空でvintageCount=0のとき、
  #     0==0で通るべきところが代入時点で死ぬのでbin/og.shが永久に完走できず、
  #     スタンプが書けず--checkが赤のまま=デプロイゲートが開かない
  actual_count="$(grep -Eo 'class="line-forecast-vintage"[^>]*d="M [0-9][^"]*"' "$dom" | wc -l | tr -d ' ')" || true
  if [[ "$actual_count" != "$want_count" ]]; then
    echo "エラー: 扇の線(line-forecast-vintage)の本数が期待と違う(期待=$want_count, 実際=$actual_count, query=$query)。" >&2
    echo "  data/fertility_forecast.csvのvintage_yearの種類数とog.htmlのrenderFertility()の描画が食い違っている可能性があります。" >&2
    exit 1
  fi
}

# $1: og.html に渡すクエリ文字列 $2: 書き出し先の最終パス(絶対) $3: 期待最小年度
# $4: hasForecast(0/1) $5: hasActual(0/1) $6: type(metric/fertility)
# $7: vintageCount(fertilityのみ意味を持つ)
shoot() {
  local query="$1" out="$2" min_year="$3" has_forecast="$4" has_actual="$5" type="$6" vintage_count="$7"
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
  # 終了を待たず出力の完成を確認でき次第、強制終了して先へ進む。
  #
  # 以前は固定25秒待ってから`kill -9`していた(10秒の予算に対して25秒待てば
  # 十分な余裕がある、という判断)。焼く枚数が2枚から18枚、さらに20枚に増えたことで
  # 固定待ちでは所要時間が7分半になり現実的でなくなったため、2026-07-30に
  # 「出力ファイルの完成を0.2秒ごとにポーリングし、揃ったら即kill」する方式へ
  # 変えた。25秒の上限は保険として残す。
  #
  # 完成の判定は png_complete()(末尾のIENDチャンク)と dom_complete()
  # (末尾の</html>)で行う。**「バイト数が直前のポーリングと同じなら完成」
  # という判定にはしない**: 書き込みが一瞬停まった隙に2回続けて同じサイズを
  # 読むと、途中で切れたファイルを完成とみなしてChromeを殺してしまう。
  # そして`sips`は切り詰めたPNGでも寸法を正しく答えるため(png_complete直上
  # のコメント参照)、後段のverify_sizeもverify_domもそれを通してしまう。
  # IEND/`</html>`の有無なら「完成したか」を推測ではなく事実として判定できる
  # ので、この経路自体が存在しない。
  local waited_ms=0
  while kill -0 "$cpid" 2>/dev/null; do
    if png_complete "$tmp_png" && dom_complete "$tmp_dom"; then
      kill -9 "$cpid" 2>/dev/null || true
      break
    fi
    if (( waited_ms >= 25000 )); then
      kill -9 "$cpid" 2>/dev/null || true
      break
    fi
    sleep 0.2
    waited_ms=$((waited_ms + 200))
  done
  wait "$cpid" 2>/dev/null || true

  rm -rf "$udir"
  if [[ ! -s "$tmp_png" ]]; then
    echo "エラー: Chromeがスクリーンショットを書き出せませんでした(query=$query)。" >&2
    rm -rf "$wdir"
    exit 1
  fi
  # 25秒の上限で諦めた場合(=完成を確認できないまま強制終了した場合)は
  # ここで止まる。上の待ち合わせと同じ判定を検査としても置いておく:
  # 待ち合わせ側は「いつ殺すか」を決めるためのもので、通ってきた出力が
  # 完成しているかどうかはfail-closedに別途確かめる必要がある。
  if ! png_complete "$tmp_png"; then
    echo "エラー: PNGが途中で切れています(末尾にIENDチャンクが無い、query=$query)。" >&2
    echo "  Chromeの書き出しが完了する前に打ち切られた可能性があります。" >&2
    rm -rf "$wdir"
    exit 1
  fi
  if ! dom_complete "$tmp_dom"; then
    echo "エラー: --dump-domの出力が途中で切れています(末尾に</html>が無い、query=$query)。" >&2
    echo "  Chromeの書き出しが完了する前に打ち切られた可能性があります。" >&2
    rm -rf "$wdir"
    exit 1
  fi
  verify_size "$tmp_png"
  verify_dom "$tmp_dom" "$query" "$min_year" "$has_forecast" "$has_actual" "$type" "$vintage_count"
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
#
# ■ TOCTOU対策: ハッシュは焼き始める前に計算し、成功後に配置する(2026-07-30、G)
#   以前は(18枚だった当時)焼き終わったあとに入力ファイルのハッシュを計算していた。
#   bin/og.shの実行中(約1分)にchart.jsやCSVを編集すると、「古い内容で
#   焼いた画像 + 新しい内容のハッシュ」でスタンプが書かれ、`--check`が
#   緑のまま古いカードが残り続けるTOCTOU(検査から使用までの間の変化)が
#   起きえた。焼き始める前にハッシュを一時ファイル(STAMP_TMP)へ書いて
#   固定し、全カードが成功したあとにそれを最終位置へ`mv`する形に変えた。
compute_stamp() {
  local out_tmp="$1"
  python3 - "$ROOT" "$out_tmp" "${INPUT_RELS[@]}" <<'PYEOF'
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
        "bin/og.sh が assets/og*.png(汎用2枚+指標8種×2言語+出生率2言語の計20枚)を焼く"
        "たびに書き直す。node bin/build.mjs --check の陳腐化検査"
        "(ogStalenessErrors)が、ここに記録したsha256といまの入力ファイルの"
        "実ハッシュを突き合わせて焼き直し忘れを検出する。入力ファイルの一覧"
        "(chart.js・METRICSの全指標CSV・出生率カード用のdata/fertility_*.csv"
        "2本・og.html・csv.js・style.css)は"
        "node bin/build.mjs --og-list が唯一の出所で、ここに手書きのコピーは"
        "持たない。このファイルはsite/配下にあるため配信されるが、パスと"
        "ハッシュの対応表だけで秘密は含まない(承知の上で置いている)。"
        "ハッシュは焼き始める前に計算し固定したもの(TOCTOU対策。"
        "bin/og.shのcompute_stamp直上コメント参照)。"
    ),
    "inputs": inputs,
}
with open(out, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False, sort_keys=True)
    f.write("\n")
PYEOF
}

STAMP_TMP="$(mktemp)"
compute_stamp "$STAMP_TMP"

for i in "${!CARD_OUTS[@]}"; do
  shoot "${CARD_QUERIES[$i]}" "$ROOT/${CARD_OUTS[$i]}" "${CARD_MIN_YEARS[$i]}" \
    "${CARD_HAS_FORECAST[$i]}" "${CARD_HAS_ACTUAL[$i]}" "${CARD_TYPES[$i]}" "${CARD_VINTAGE_COUNTS[$i]}"
done

mv "$STAMP_TMP" "$ROOT/$STAMP_REL"
STAMP_TMP=""
echo "✓ $ROOT/$STAMP_REL を更新しました。"
