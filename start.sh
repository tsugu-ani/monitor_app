#!/usr/bin/env bash
# Monitor App 起動スクリプト
# 使い方: ./start.sh [ポート番号(省略時:8000)]

set -e

PORT=${1:-8000}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TUNNEL_LOG=$(mktemp)

echo "=== Monitor App 起動 ==="

# バックエンド起動（バックグラウンド）
cd "${SCRIPT_DIR}/backend"
uv run uvicorn main:app --host 127.0.0.1 --port "${PORT}" &
UVICORN_PID=$!

# uvicorn の起動を待つ
sleep 2

# Cloudflare Tunnel 起動（ログをファイルに書き出し）
echo ""
echo "=== Cloudflare Tunnel 起動中 ==="
cloudflared tunnel --url "http://localhost:${PORT}" --no-autoupdate 2>"${TUNNEL_LOG}" &
CF_PID=$!

# URL が出力されるまで待つ（最大15秒）
PUBLIC_URL=""
for i in $(seq 1 15); do
  PUBLIC_URL=$(grep -oP 'https://[a-z0-9\-]+\.trycloudflare\.com' "${TUNNEL_LOG}" 2>/dev/null | head -1 || true)
  if [ -n "${PUBLIC_URL}" ]; then
    break
  fi
  sleep 1
done

echo ""
echo "======================================="
if [ -n "${PUBLIC_URL}" ]; then
  echo "  公開URL (スマホからアクセス):"
  echo "  ${PUBLIC_URL}"
else
  echo "  URL 取得中... ${TUNNEL_LOG} を確認してください"
fi
echo "======================================="
echo ""
echo "CTRL+C で停止します"

# 終了時にプロセスをクリーンアップ
cleanup() {
  echo ""
  echo "停止中..."
  kill "${UVICORN_PID}" "${CF_PID}" 2>/dev/null || true
  rm -f "${TUNNEL_LOG}"
}
trap cleanup EXIT INT TERM

wait
