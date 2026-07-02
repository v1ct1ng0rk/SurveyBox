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

info "构建镜像..."
docker compose build

info "启动服务..."
docker compose up -d

info "等待服务就绪..."
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
info ""
info "常用命令:"
info "  查看日志: docker compose logs -f"
info "  停止服务: ./scripts/stop.sh"
