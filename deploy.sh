#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

COMMIT_MSG="${1:-更新網站內容}"
IMAGE_NAME="arther-web-site"
CONTAINER_NAME="arther-web-site"
PORT="8080"

echo "==> Git commit & push"
git add -A
if git diff --cached --quiet; then
  echo "沒有變更需要 commit，略過"
else
  git commit -m "$COMMIT_MSG"
  git push
fi

echo "==> 建置新的 Docker image"
docker build -t "$IMAGE_NAME" .

echo "==> 重啟 container"
docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER_NAME" -p "$PORT:8080" --restart unless-stopped "$IMAGE_NAME" >/dev/null

echo "==> 完成！網站已更新：http://localhost:$PORT"
