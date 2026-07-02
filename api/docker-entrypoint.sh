#!/bin/sh
set -e

if [ -n "${DATABASE_URL:-}" ] && echo "$DATABASE_URL" | grep -q '@postgres:'; then
  echo "[surveybox] waiting for postgres:5432..."
  i=0
  while [ "$i" -lt 60 ]; do
    if nc -z postgres 5432 2>/dev/null; then
      echo "[surveybox] postgres is reachable"
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  if ! nc -z postgres 5432 2>/dev/null; then
    echo "[surveybox] ERROR: postgres not reachable after 60s" >&2
    exit 1
  fi
fi

exec "$@"
