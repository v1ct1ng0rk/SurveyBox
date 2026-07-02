#!/usr/bin/env bash
# SurveyBox Docker 一键部署
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { echo "[surveybox] $*"; }
warn() { echo "[surveybox] WARN: $*" >&2; }

if ! command -v docker >/dev/null 2>&1; then
  echo "请先安装 Docker: https://docs.docker.com/get-docker/" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "请安装 Docker Compose V2 (docker compose)" >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  warn "已创建 .env，请至少修改 JWT_SECRET（生产环境必改）"
fi

# 生产环境检查
if grep -q 'change-me-to-a-long-random-string-in-production' .env 2>/dev/null; then
  if [[ "${ALLOW_INSECURE_JWT:-}" != "1" ]]; then
    warn "JWT_SECRET 仍为默认值。可运行: openssl rand -base64 32"
    warn "临时跳过检查: ALLOW_INSECURE_JWT=1 ./scripts/deploy.sh"
    exit 1
  fi
fi

CLI_WEB_PORT="${WEB_PORT:-}"
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi
[[ -n "$CLI_WEB_PORT" ]] && WEB_PORT="$CLI_WEB_PORT"
WEB_PORT="${WEB_PORT:-80}"
export WEB_PORT

POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/data/workspace/db/pg/SurveyBox}"
export POSTGRES_DATA_DIR
if [[ ! -d "$POSTGRES_DATA_DIR" ]]; then
  info "创建 PostgreSQL 数据目录: $POSTGRES_DATA_DIR"
  if ! mkdir -p "$POSTGRES_DATA_DIR" 2>/dev/null; then
    warn "需要 sudo 创建数据目录"
    sudo mkdir -p "$POSTGRES_DATA_DIR"
  fi
fi
# 空目录时确保 postgres 容器（uid 70）可写
if [[ ! -f "$POSTGRES_DATA_DIR/PG_VERSION" ]] && command -v chown >/dev/null 2>&1; then
  if chown 70:70 "$POSTGRES_DATA_DIR" 2>/dev/null; then
    :
  elif sudo chown 70:70 "$POSTGRES_DATA_DIR" 2>/dev/null; then
    :
  fi
fi

info "构建镜像..."
docker compose build

info "启动服务..."
if ! docker compose up -d; then
  warn "启动失败，最近日志："
  docker compose logs --tail=60 postgres api 2>/dev/null || true
  echo ""
  warn "常见原因："
  warn "  1. POSTGRES_PASSWORD 与已有数据库数据不一致 → 改回旧密码或清空 ${POSTGRES_DATA_DIR}"
  warn "  2. postgres 未就绪 → 执行: docker compose logs postgres"
  warn "  3. api 连库失败 → 执行: docker compose logs api"
  exit 1
fi

info "等待 API 健康检查..."
for i in {1..60}; do
  status="$(docker inspect surveybox-api --format '{{.State.Health.Status}}' 2>/dev/null || echo unknown)"
  if [[ "$status" == "healthy" ]]; then
    break
  fi
  if docker inspect surveybox-api --format '{{.State.Status}}' 2>/dev/null | grep -q exited; then
    warn "API 容器已退出，日志："
    docker compose logs --tail=40 api
    exit 1
  fi
  sleep 2
done
for i in {1..30}; do
  if curl -sf "http://localhost:${WEB_PORT}/api/config/public" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

docker compose ps

info ""
info "部署完成"
info "  访问地址: http://localhost:${WEB_PORT}"
info "  默认账号: admin / admin123"
info "  数据库目录: ${POSTGRES_DATA_DIR}"
info ""
info "常用命令:"
info "  查看日志: docker compose logs -f"
info "  停止服务: ./scripts/stop.sh"
