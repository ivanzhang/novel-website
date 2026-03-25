#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/var/www/novel-website"
LOG_FILE="$DEPLOY_DIR/deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

cd "$DEPLOY_DIR"

PREV_COMMIT=$(git rev-parse HEAD)
log "开始部署 — 当前 commit: $PREV_COMMIT"

# 拉取最新代码
git fetch origin main
git reset --hard origin/main
NEW_COMMIT=$(git rev-parse HEAD)
log "更新到 commit: $NEW_COMMIT"

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  log "代码无变化，跳过部署"
  exit 0
fi

# 检查是否需要重建镜像（依赖或 Dockerfile 变更）
NEEDS_BUILD=false
CHANGED_FILES=$(git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT")

if echo "$CHANGED_FILES" | grep -qE '^backend/(package\.json|package-lock\.json|Dockerfile)$|^docker-compose\.yml$'; then
  NEEDS_BUILD=true
fi

if [ "$NEEDS_BUILD" = true ]; then
  log "检测到依赖或构建配置变更，重建镜像..."
  docker compose up -d --build -V --remove-orphans 2>&1 | tee -a "$LOG_FILE"
elif echo "$CHANGED_FILES" | grep -qE '^backend/'; then
  log "检测到后端代码变更，重启 backend 容器..."
  docker compose restart backend 2>&1 | tee -a "$LOG_FILE"
else
  log "仅前端或配置变更，git pull 已生效（volume 挂载），无需重启"
fi

# 健康检查（最多等待 60 秒）
log "等待健康检查..."
HEALTHY=false
for i in $(seq 1 12); do
  sleep 5
  if curl -sf http://127.0.0.1/api/health > /dev/null 2>&1; then
    HEALTHY=true
    break
  fi
  log "健康检查第 $i 次尝试失败，继续等待..."
done

if [ "$HEALTHY" = true ]; then
  log "部署成功 ✓ commit: $NEW_COMMIT"
else
  log "健康检查失败，开始回滚到 $PREV_COMMIT"
  git reset --hard "$PREV_COMMIT"
  docker compose up -d --build -V --remove-orphans 2>&1 | tee -a "$LOG_FILE"

  # 等待回滚后的健康检查
  for i in $(seq 1 12); do
    sleep 5
    if curl -sf http://127.0.0.1/api/health > /dev/null 2>&1; then
      break
    fi
  done

  log "已回滚到 $PREV_COMMIT"
  exit 1
fi
