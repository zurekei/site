#!/usr/bin/env bash
# sitemap.xml に載っている全URLを IndexNow プロトコルで検索エンジンに通知する。
#
# ■ なぜ IndexNow なのか(Search Console/Bing Webmaster Toolsではない理由)
#   このサイトは匿名運営を選択肢として残している。Search Console や Bing Webmaster
#   Tools はアカウント登録が要り、そのアカウントが身元の連結子になり得る。
#   IndexNow はドメイン直下にキーファイルを1つ置くだけで検証が済み、アカウント登録が
#   不要なので、この制約と噛み合う唯一のクロール誘発手段としてこれを選んだ。
#   (2026-07-29時点の判断。事情が変わったら見直してよい)
#
# ■ 対応している検索エンジン(誤解しないこと)
#   IndexNow はプロトコルの共同開発元である Microsoft Bing / Yandex のほか、
#   Naver・Seznam.cz・Yep が正式対応している(出典: https://www.indexnow.org/ トップページ)。
#   **Google は対応していない(2026-07-29時点で indexnow.org の対応表に載っていない)。**
#   このスクリプトを回しても Google 検索には直接効かない。Google 向けには
#   sitemap.xml と robots.txt の Sitemap 行(通常のクロール発見経路)に頼るしかない。
#   「これで全検索エンジンに効く」という早合点をしないこと。
#
# ■ キーファイルについて(「公開URLに置く」と「誰に知られてもよい」は別の話)
#   site/ 直下の <key>.txt がそれ。IndexNow のキーは「このドメインの管理者である」
#   ことを検索エンジン側に示す検証トークンで、公開URLで取得できること自体は
#   仕様上の必須要件。ただし仕様の建前は "Only you and the search engines should
#   know the key and your file key location" であって、**「誰に知られてもよい値」
#   ではない**(推測不能なURLに置くことで実質知られない、という設計)。
#   このリポジトリは公開なので、コミットした時点でキーは誰にでも読める状態になり、
#   仕様の想定を一段超える。それでも管理下に置いているのは:
#     - 悪用されてもできるのは「zurekei.org のURLの代理送信」だけで、他ホストの
#       URLは422で弾かれる(踏み台にはならない)。身元漏洩・課金・データ流出の
#       いずれにもつながらない。過去の .deploy.env 事故とは性質が違う
#     - 実害(429やスパム判定で正規の通知が効かなくなる)が出たら、キーを作り直して
#       差し替えるだけで即座に無効化できる
#     - 逆に .gitignore すると deploy.sh が毎回「git管理外のファイル」として警告を
#       出すようになり、**本物の混入事故に気づけなくなる**。そちらのほうが危険
#   2026-07-29に、この割り切りを運営が承認したうえで置いている。
#   「機密をsite/に置かない」という縛りの対象ではない(APIトークンとは性質が違う)。
#
# ■ 一括送信の仕組み(なぜ1エンジンにしか送らないのか)
#   IndexNow に参加している検索エンジンは、受け取ったURLを他の参加エンジンとも
#   自動的に共有することに規約上合意している(indexnow.org/documentation の
#   "Requirement for search engines" 節)。そのため api.indexnow.org という
#   共通の集約エンドポイントに1回送れば、Bing・Yandex 等の参加エンジン全部に
#   届く前提になっている。エンジンごとに送り直す必要はない。
#
# ■ 上限とレスポンスコード(出典: https://www.indexnow.org/documentation)
#   一括送信は1回のリクエストにつき最大10,000 URL。
#   200=受理 / 202=受理・キー検証待ち / 400=リクエスト形式が不正 /
#   403=キーが無効 / 422=URLがhostに属さない / 429=送信過多(スパム判定)。
#   429を無視して送り続けると悪質な送信元として扱われる恐れがあるため、
#   このスクリプトは200/202以外を「失敗」として扱い、黙って成功扱いにしない。
#
# ■ Cloudflare の Crawler Hints との関係(人間が判断すること)
#   Cloudflare には Crawler Hints というダッシュボード機能があり、有効化すると
#   Cloudflare が edge のキャッシュ信号を見て自動的に IndexNow へ通知を送る
#   (このスクリプトとは無関係に動く)。有効化条件・送信タイミングの詳細は
#   Cloudflare 側のドキュメントにも明記がなく、こちらでは確認できなかった。
#   **このスクリプトと Crawler Hints を両方使うと二重送信になり得るが、
#   IndexNow の仕様上、同じURLを複数回送ること自体はエラーではない
#   (せいぜい 429 で弾かれるだけ)。** どちらを使うか、両方使うかは
#   ダッシュボードを触れる人間が決めること。このコメントは判断材料として残す。
#
# 使い方:
#   bin/indexnow.sh            sitemap.xml の全URLを実際に送信する
#   DRY_RUN=1 bin/indexnow.sh  送信内容を表示するだけで、実際には送らない
#
# ※ bin/deploy.sh とは連結していない。デプロイのたびに自動送信はしない
#   (検索エンジンへの通知は対外行為なので、送るかどうかは人間が決める)。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SITEMAP="$ROOT/sitemap.xml"
HOST="zurekei.org"

for cmd in xmllint jq curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "エラー: $cmd が必要です(未インストール)。" >&2
    exit 1
  fi
done

if [[ ! -f "$SITEMAP" ]]; then
  echo "エラー: $SITEMAP がありません。" >&2
  exit 1
fi

# キーファイルは site/ 直下に <8〜128文字の16進>.txt として1つだけ置いてある。
# 名前を決め打ちにせず探すのは、キーをローテーションしたときにこのスクリプトを
# 直さなくて済むようにするため。
KEY_FILES=()
while IFS= read -r f; do
  KEY_FILES+=("$f")
done < <(find "$ROOT" -maxdepth 1 -type f -regex '.*/[A-Za-z0-9-]\{8,128\}\.txt' 2>/dev/null | sort)

if (( ${#KEY_FILES[@]} == 0 )); then
  echo "エラー: IndexNow のキーファイル(<key>.txt)が $ROOT に見つかりません。" >&2
  exit 1
fi
if (( ${#KEY_FILES[@]} > 1 )); then
  echo "エラー: キーファイルらしきものが複数あります。どれが有効か分からないので止めます:" >&2
  printf '  %s\n' "${KEY_FILES[@]}" >&2
  exit 1
fi

KEY_FILE="${KEY_FILES[0]}"
KEY_NAME="$(basename "$KEY_FILE" .txt)"
KEY_CONTENT="$(tr -d '[:space:]' < "$KEY_FILE")"

# ファイル名と中身が一致していることを確認する(IndexNowの仕様どおりの配置か)。
# ずれていると「キーファイルは置いたのに検証に失敗する」という気づきにくい
# 壊れ方をするので、送信の手前で機械的に見る。
#
# なお実ファイルは末尾に改行を入れていない。仕様は "UTF-8 encoded text key file"
# としか言わず末尾空白の扱いに触れていないので、検索エンジン側が完全一致で
# 検証していた場合に落ちる余地を残さないため。403(キーが無効)が返ったら、
# まずキーファイルの末尾に余計な文字が混じっていないかを疑うこと。
# (この比較自体は tr で空白を落としているので、ここでは検出できない)
if [[ "$KEY_NAME" != "$KEY_CONTENT" ]]; then
  echo "エラー: キーファイル名と中身が一致していません($KEY_FILE)。" >&2
  echo "  ファイル名: $KEY_NAME" >&2
  echo "  中身      : $KEY_CONTENT" >&2
  exit 1
fi

KEY="$KEY_CONTENT"
KEY_LOCATION="https://$HOST/$KEY_NAME.txt"

# URL一覧は sitemap.xml から読む(二重管理しない)。指標を増やしたときの
# 更新漏れの起点を1箇所にする。
URLS=()
while IFS= read -r u; do
  [[ -z "$u" ]] && continue
  URLS+=("$u")
done < <(xmllint --xpath '//*[local-name()="loc"]/text()' "$SITEMAP" 2>/dev/null)

if (( ${#URLS[@]} == 0 )); then
  echo "エラー: $SITEMAP からURLを1件も読めませんでした。" >&2
  exit 1
fi

# 読めた各行が本当にこのホストのURLかを、送信の手前で確かめる。
# xmllint は版によって text() ノードの出し方が違い、古い libxml2 は区切りなしで
# 連結する。その版で回すと "https://zurekei.org/https://zurekei.org/chart/..." が
# 「1件」として送られるが、件数の空チェックではこれを拾えない(1件はあるので)。
# 連結事故・sitemapへの異物混入・ホスト外URLを、ここで一緒に止める。
for u in "${URLS[@]}"; do
  if [[ "$u" != "https://$HOST/"* ]]; then
    echo "エラー: $HOST のURLとして読めない行があります: $u" >&2
    echo "  sitemap.xml の書式か xmllint の挙動を疑うこと。" >&2
    exit 1
  fi
done

if (( ${#URLS[@]} > 10000 )); then
  echo "エラー: 一括送信の上限(10,000件)を超えています(${#URLS[@]}件)。" >&2
  exit 1
fi

PAYLOAD="$(jq -n \
  --arg host "$HOST" \
  --arg key "$KEY" \
  --arg keyLocation "$KEY_LOCATION" \
  '{host: $host, key: $key, keyLocation: $keyLocation, urlList: $ARGS.positional}' \
  --args "${URLS[@]}")"

echo "送信予定URL: ${#URLS[@]}件"
echo "$PAYLOAD" | jq .

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN: 送信内容の表示のみ。実際には送信しません。"
  exit 0
fi

# api.indexnow.org は参加エンジン共通の集約エンドポイント(上のコメント参照)。
ENDPOINT="https://api.indexnow.org/indexnow"

RESPONSE_BODY="$(mktemp)"
trap 'rm -f "$RESPONSE_BODY"' EXIT

HTTP_CODE="$(curl -sS -o "$RESPONSE_BODY" -w '%{http_code}' \
  -X POST "$ENDPOINT" \
  -H 'Content-Type: application/json; charset=utf-8' \
  --data "$PAYLOAD")"

# 200=受理 / 202=受理・キー検証待ち。それ以外は失敗として扱い、黙って
# 成功扱いにしない(429の送りすぎ等をここで拾う)。
case "$HTTP_CODE" in
  200|202)
    echo "送信成功(HTTP $HTTP_CODE)。"
    ;;
  *)
    echo "エラー: IndexNow への送信に失敗しました(HTTP $HTTP_CODE)。" >&2
    echo "--- レスポンス本文 ---" >&2
    cat "$RESPONSE_BODY" >&2
    exit 1
    ;;
esac
