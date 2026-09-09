#!/usr/bin/env bash
# Chrome for Testing を「GD-Peeker 実機テスト専用プロファイル」で素のまま起動する。
# 自動化フラグを付けずに起動するので、この窓で Google にログインすれば弾かれない。
# ログイン後は窓を閉じるだけ。以後 tests/e2e-drive.mjs と scripts/drive-inspect.mjs が
# 同じプロファイル(~/.gd-peeker/profile)を Playwright から使う。
#
#   bash scripts/drive-profile.sh            # 起動(拡張も読み込み済み)
#   CHROME_FOR_TESTING=/path/to/Chrome bash scripts/drive-profile.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${GD_PEEKER_PROFILE:-$HOME/.gd-peeker/profile}"
mkdir -p "$PROFILE"

find_chrome() {
  if [ -n "${CHROME_FOR_TESTING:-}" ]; then echo "$CHROME_FOR_TESTING"; return; fi
  local cache="$HOME/Library/Caches/ms-playwright"
  local d
  for d in $(ls -d "$cache"/chromium-* 2>/dev/null | sort -t- -k2 -n -r); do
    local p="$d/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
    if [ -x "$p" ]; then echo "$p"; return; fi
  done
  echo "Chrome for Testing が見つかりません。任意のディレクトリで 'npm i playwright-core && npx playwright install chromium' を実行するか CHROME_FOR_TESTING で指定してください" >&2
  exit 1
}

CHROME="$(find_chrome)"
echo "profile : $PROFILE"
echo "chrome  : $CHROME"
echo "この窓でテスト用 Google アカウントにログインし、Drive が開けたら窓を閉じてください。"
exec "$CHROME" \
  --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check \
  --disable-extensions-except="$ROOT/extension" \
  --load-extension="$ROOT/extension" \
  "https://drive.google.com/drive/my-drive"
