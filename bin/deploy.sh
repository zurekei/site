#!/usr/bin/env bash
# zurekei-site を Cloudflare Pages にデプロイする。
#
# 使い方:
#   1. リポジトリの「ひとつ上」に .deploy.env を作る（初回だけ）:
#        ../.deploy.env
#        CLOUDFLARE_ACCOUNT_ID=xxxxxxxx
#        CLOUDFLARE_API_TOKEN=cfut_xxxxxxxx
#   2. 以後は毎回これだけ:
#        bin/deploy.sh
#
# ※ なぜリポジトリの外に置くのか（重要・実際に事故が起きた）:
#   `wrangler pages deploy .` は指定ディレクトリを丸ごとアップロードする。.gitignore は
#   一切参照されない。以前この手順はリポジトリ直下に置く指示になっていて、その結果
#   .deploy.env が公開URLとして配信され、APIトークンが読める状態になっていた。
#   「gitignore 済みだから安全」は成り立たない。デプロイ対象ディレクトリの外に置くこと。
#
# トークンは Cloudflare の My Profile → API Tokens → Custom Token
# (Account / Cloudflare Pages / Edit、対象は zurekei アカウントのみ) で発行する。
# ※ wrangler login / logout はしないこと（別アカウントの作業を壊す）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$(dirname "$ROOT")/.deploy.env"

# 配信対象の中に秘密が紛れていたらデプロイ自体を止める。手順を直しても、うっかり
# 置いてしまう経路（エディタの保存先ミス・コピー）は残るため、最後の関門を機械側に持たせる。
#
# 突き合わせの相手は「git が無視しているファイル」。commit したくないものと公開したく
# ないものはほぼ同じ集合なのに、wrangler は .gitignore を一切見ないので、この2つが
# ずれたところが事故になる（.deploy.env / デザイン下書き / support.js が実際に配信された）。
# .DS_Store と .wrangler/ は配信されないことを外形で確認済みなので除く。
#
# 秘密らしい名前のファイルは git の管理状態を問わず実ファイルとして探す。
# 「git 管理外のものだけ見る」では足りない: .gitignore に載っていない stray（新しく
# 置いたばかりの *.env など）は ignored 扱いにならず、素通りする。
STRAY_SECRET=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  STRAY_SECRET+=("${f#"$ROOT"/}")
done < <(find "$ROOT" -path "$ROOT/.git" -prune -o -type f \
  \( -name '*.env' -o -name '.env' -o -name '*.pem' -o -name '*.key' \
     -o -iname '*secret*' -o -iname '*token*' -o -iname '*credential*' \) -print 2>/dev/null || true)

# git が無視しているファイルは、秘密でなくても「公開したくないもの」であることが多い。
STRAY_OTHER=()
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  case "$f" in
    .DS_Store|.wrangler/) continue ;;
    *) STRAY_OTHER+=("$f") ;;
  esac
done < <(git -C "$ROOT" ls-files --others --ignored --exclude-standard --directory 2>/dev/null || true)

if (( ${#STRAY_SECRET[@]} > 0 )); then
  echo "エラー: デプロイ対象ディレクトリの中に秘密ファイルがあります:" >&2
  printf '  %s\n' "${STRAY_SECRET[@]}" >&2
  echo "wrangler はこれをそのまま公開URLとして配信します。外へ移してから実行してください。" >&2
  exit 1
fi

if (( ${#STRAY_OTHER[@]} > 0 )); then
  echo "警告: git 管理外のファイルがデプロイ対象に入っています。公開されて困らないか確認してください:" >&2
  printf '  %s\n' "${STRAY_OTHER[@]}" >&2
fi

# chart/*.html と、fertility.html / hoan.html の数値部分は data/*.csv から生成して
# いる。CSV を直してビルドを忘れると、同じ年について表とグラフが違う数字を出す
# 状態のまま公開される。ズレの記録を名乗るサイトでそれは最悪の壊れ方なので、
# 記憶ではなくここで止める。
# 併せて、sitemap とトップの素のリンクが指標を取りこぼしていないかも見る
# （欠けても見た目には何も起きず、静かに索引から漏れるだけなので）。
if ! node "$ROOT/bin/build.mjs" --check; then
  echo "エラー: 指標ページが最新ではありません。" >&2
  exit 1
fi

# sitemap.xml は生成物であっても中身がXMLとして壊れうる(コメントに連続ハイフンを
# 書いてしまい実際に一度パースエラーを起こしている)。--check は文字列比較しか
# しないので壊れていても素通りする。ここでXMLとして開けるかだけ見る。
# xmllint が無い環境(未インストールのCI等)でもデプロイ自体は止めない(無ければ
# 検査を飛ばすだけで、既存の運用を壊さない側に倒す)。
if command -v xmllint >/dev/null 2>&1; then
  if ! xmllint --noout "$ROOT/sitemap.xml"; then
    echo "エラー: sitemap.xml がXMLとして壊れています。" >&2
    exit 1
  fi
else
  echo "警告: xmllint が無いので sitemap.xml の構文検査を飛ばしました。" >&2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "エラー: $ENV_FILE がありません。" >&2
  echo "次の2行を書いた .deploy.env を「リポジトリの外」に作ってください:" >&2
  echo "  CLOUDFLARE_ACCOUNT_ID=..." >&2
  echo "  CLOUDFLARE_API_TOKEN=cfut_..." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${CLOUDFLARE_ACCOUNT_ID:?.deploy.env に CLOUDFLARE_ACCOUNT_ID が必要です}"
: "${CLOUDFLARE_API_TOKEN:?.deploy.env に CLOUDFLARE_API_TOKEN が必要です}"

cd "$ROOT"

# 配信するのは「リポジトリそのもの」ではなく「除外を適用した複製」にする（2026-08-12）。
#
# きっかけ: bin/ 配下のビルド道具6本（build.mjs 283KB・deploy.sh・og.sh・
# indexnow.sh・build_*.py）が https://zurekei.org/bin/... としてそのまま配信されて
# いた。これ自体は漏洩ではない（全部 public repo に入っていてGitHub上で読める内容で、
# 禁止文字列もアカウントIDも含まない）。直す理由は、ビルド道具がサイトの一部として
# 配信されている状態が単に筋が悪いことと、毎回280KB超を本番に上げていること。
#
# ⚠ .assetsignore は使えない。あれは Workers Assets（syncAssets）の仕組みで、
# `wrangler pages deploy` のアップローダ（validate/walk）は .assetsignore も
# .gitignore も一切見ず、固定の IGNORE_LIST（_worker.js / _redirects / _headers /
# _routes.json / functions / .DS_Store / node_modules / .git / .wrangler）だけを
# 除く。wrangler 4.104.0 の実装を読んで確認した。置いても黙って無視されるので、
# 「置いたから安全」という思い込みだけが残る（このリポジトリが一番嫌う壊れ方）。
# よって除外はwranglerに頼らず、こちら側で対象ディレクトリを作って渡す。
#
# 除外は「サイトから辿れないもの」だけに絞る。LICENSE / LICENSE-DATA / NOTICE /
# data/README.md は cite ページから実際にリンクしているので配信対象のまま
# （消すとリンク切れになる。about.md は誰も取得しないがサイズが小さいので触らない）。
DEPLOY_EXCLUDE=(
  bin        # ビルド・デプロイ道具。サイトからは一切参照しない
  .git       # wrangler も無視するが、16MBを複製する意味が無いので先に外す
  .wrangler  # 同上
)

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/zurekei-deploy.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

TAR_EXCLUDE=()
for e in "${DEPLOY_EXCLUDE[@]}"; do
  TAR_EXCLUDE+=(--exclude="./$e")
done
tar -cf - "${TAR_EXCLUDE[@]}" -C "$ROOT" . | tar -xf - -C "$STAGE"

# 複製が意図どおりかを、複製とは別の手段（find）で数え直す。
# tar の --exclude のパターン解釈を信用しないための独立検算で、
# 「除外し過ぎて配信物が欠ける」方向も「除外できていない」方向も両方見る。
# 片方向だけの検査だと、除外に失敗しても静かに通ってしまう。
expected="$(cd "$ROOT" && find . -type f -print | while IFS= read -r f; do
  rel="${f#./}"
  top="${rel%%/*}"
  skip=""
  for e in "${DEPLOY_EXCLUDE[@]}"; do
    [[ "$top" == "$e" ]] && skip=1
  done
  [[ -n "$skip" ]] || printf '%s\n' "$rel"
done | sort)"
actual="$(cd "$STAGE" && find . -type f -print | sed 's|^\./||' | sort)"

if [[ "$expected" != "$actual" ]]; then
  echo "エラー: 配信用の複製が意図と一致しません（除外の実装が壊れています）。" >&2
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
  exit 1
fi

if (( ${#expected} == 0 )); then
  echo "エラー: 配信対象が0件です。" >&2
  exit 1
fi

echo "配信対象: $(printf '%s\n' "$expected" | wc -l | tr -d ' ') ファイル（除外: ${DEPLOY_EXCLUDE[*]}）"

# DRY_RUN=1 bin/deploy.sh で、実際に配信せず上のチェックだけを回せる。
# チェック自体を「本番デプロイを1回撃たないと確かめられない」状態にしないための口。
# 複製の作成と検算もDRY_RUNの対象に入れてある（除外の実装を確かめるのに本番
# デプロイが要る状態にしない）。
if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN: チェックのみ通過。デプロイは実行しません。"
  exit 0
fi

# exec にしない: trap で $STAGE を消す必要がある。
npx wrangler pages deploy "$STAGE" --project-name=zurekei-site
