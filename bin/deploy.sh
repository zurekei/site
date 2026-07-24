#!/usr/bin/env bash
# zurekei-site を Cloudflare Pages にデプロイする。
#
# 使い方:
#   1. リポジトリ直下に .deploy.env を作る（初回だけ。gitignore 済みなのでコミットされない）:
#        CLOUDFLARE_ACCOUNT_ID=xxxxxxxx
#        CLOUDFLARE_API_TOKEN=cfut_xxxxxxxx
#   2. 以後は毎回これだけ:
#        bin/deploy.sh
#
# トークンは Cloudflare の My Profile → API Tokens → Custom Token
# (Account / Cloudflare Pages / Edit、対象は zurekei アカウントのみ) で発行する。
# ※ wrangler login / logout はしないこと（別アカウントの作業を壊す）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.deploy.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "エラー: $ENV_FILE がありません。" >&2
  echo "次の2行を書いた .deploy.env を作ってください（コミットされません）:" >&2
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
exec npx wrangler pages deploy . --project-name=zurekei-site
