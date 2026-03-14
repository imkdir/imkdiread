#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RUN_INSTALL=1
RUN_SMOKE=1
RUN_LINT=1
RUN_RESTART=1
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-imkdiread}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Options:
  --skip-install        Skip npm install at the repo root
  --skip-smoke          Skip backend smoke tests
  --skip-lint           Skip frontend lint
  --skip-restart        Skip systemd restart
  --service NAME        Override the systemd service name (default: imkdiread)
  --health-url URL      Verify the deployed app with GET URL after restart
  --help                Show this help

Environment:
  SYSTEMD_SERVICE       Same as --service
  HEALTHCHECK_URL       Same as --health-url
  DB_PATH               Used by backend db:ensure and optional scripts

Notes:
  - If backend/.env exists, it will be loaded automatically before running steps.
  - Restart uses: sudo systemctl restart <service>
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install)
      RUN_INSTALL=0
      ;;
    --skip-smoke)
      RUN_SMOKE=0
      ;;
    --skip-lint)
      RUN_LINT=0
      ;;
    --skip-restart)
      RUN_RESTART=0
      ;;
    --service)
      [[ $# -ge 2 ]] || fail "--service requires a value"
      SYSTEMD_SERVICE="$2"
      shift
      ;;
    --health-url)
      [[ $# -ge 2 ]] || fail "--health-url requires a value"
      HEALTHCHECK_URL="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

if [[ -f "$BACKEND_DIR/.env" ]]; then
  log "Loading backend environment from backend/.env"
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

cd "$ROOT_DIR"

log "Preparing backend media directories"
mkdir -p \
  "$BACKEND_DIR/public/files" \
  "$BACKEND_DIR/public/imgs/covers" \
  "$BACKEND_DIR/public/imgs/avatars" \
  "$BACKEND_DIR/public/imgs/users/avatars" \
  "$BACKEND_DIR/public/imgs/screensavers" \
  "$BACKEND_DIR/public/imgs/genres"

if [[ $RUN_INSTALL -eq 1 ]]; then
  log "Installing dependencies"
  npm install
else
  log "Skipping dependency install"
fi

log "Building frontend"
npm run build --prefix frontend

if [[ $RUN_LINT -eq 1 ]]; then
  log "Linting frontend"
  npm run lint --prefix frontend
else
  log "Skipping frontend lint"
fi

log "Ensuring backend database schema"
npm run db:ensure --prefix backend

if [[ $RUN_SMOKE -eq 1 ]]; then
  log "Running backend smoke tests"
  npm run test:smoke --prefix backend
else
  log "Skipping backend smoke tests"
fi

if [[ $RUN_RESTART -eq 1 ]]; then
  log "Restarting systemd service: $SYSTEMD_SERVICE"
  sudo systemctl restart "$SYSTEMD_SERVICE"
  sudo systemctl status "$SYSTEMD_SERVICE" --no-pager
else
  log "Skipping service restart"
fi

if [[ -n "$HEALTHCHECK_URL" ]]; then
  log "Checking health endpoint"
  curl --fail --silent --show-error "$HEALTHCHECK_URL"
  printf '\n'
fi

log "Deployment automation complete"
