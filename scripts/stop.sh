#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a && source .env && set +a
fi
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/data/workspace/db/pg/SurveyBox}"

docker compose down
echo "[surveybox] 已停止所有服务（数据库数据保留于 ${POSTGRES_DATA_DIR}）"
