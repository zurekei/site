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

# DRY_RUN=1 bin/deploy.sh で、実際に配信せず上のチェックだけを回せる。
# チェック自体を「本番デプロイを1回撃たないと確かめられない」状態にしないための口。
if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "DRY_RUN: チェックのみ通過。デプロイは実行しません。"
  exit 0
fi

exec npx wrangler pages deploy . --project-name=zurekei-site
