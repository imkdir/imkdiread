#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RUN_INSTALL=1
RUN_SMOKE=1
RUN_LINT=1
RUN_RESTART=1
RUN_OLLAMA=1
SYSTEMD_SERVICE="${SYSTEMD_SERVICE:-imkdiread}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-}"
OLLAMA_HOST="${OLLAMA_HOST:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-llama3}"

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [options]

Options:
  --skip-install        Skip npm install at the repo root
  --skip-smoke          Skip backend smoke tests
  --skip-lint           Skip frontend lint
  --skip-ollama         Skip Ollama install/start/model warm-up
  --skip-restart        Skip systemd restart
  --service NAME        Override the systemd service name (default: imkdiread)
  --health-url URL      Verify the deployed app with GET URL after restart
  --help                Show this help

Environment:
  SYSTEMD_SERVICE       Same as --service
  HEALTHCHECK_URL       Same as --health-url
  DB_PATH               Used by backend db:ensure and optional scripts
  OLLAMA_HOST           Ollama API host (default: http://127.0.0.1:11434)
  OLLAMA_MODEL          Ollama model to pull and warm up (default: llama3)

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
    --skip-ollama)
      RUN_OLLAMA=0
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

wait_for_ollama() {
  local attempt

  for attempt in {1..20}; do
    if curl --fail --silent --show-error "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  return 1
}

stop_ollama_if_running() {
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl stop ollama >/dev/null 2>&1 || true
  else
    pkill -x ollama >/dev/null 2>&1 || true
  fi
}

start_ollama() {
  if command -v systemctl >/dev/null 2>&1; then
    log "Starting Ollama service"
    sudo systemctl enable ollama >/dev/null 2>&1 || true
    sudo systemctl restart ollama
  else
    log "Starting Ollama without systemd"
    if ! pgrep -x ollama >/dev/null 2>&1; then
      nohup ollama serve >/tmp/ollama.log 2>&1 &
    fi
  fi
}

warm_ollama_model() {
  local response_file
  local http_code

  response_file="$(mktemp)"
  http_code="$(
    curl \
      --silent \
      --show-error \
      --output "$response_file" \
      --write-out "%{http_code}" \
      "$OLLAMA_HOST/api/generate" \
      -H "Content-Type: application/json" \
      -d "$(printf '{"model":"%s","prompt":"Hello.","stream":false,"keep_alive":"15m"}' "$OLLAMA_MODEL")" \
      || true
  )"

  if [[ "$http_code" == "200" ]]; then
    rm -f "$response_file"
    return 0
  fi

  printf '\nWARNING: Ollama warm-up returned HTTP %s\n' "${http_code:-unknown}" >&2
  if [[ -s "$response_file" ]]; then
    printf 'Response:\n' >&2
    cat "$response_file" >&2
    printf '\n' >&2
  fi
  rm -f "$response_file"
  return 1
}

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

if [[ $RUN_OLLAMA -eq 1 ]]; then
  log "Ensuring Ollama is installed"
  if ! command -v ollama >/dev/null 2>&1; then
    curl -fsSL https://ollama.com/install.sh | sh
  fi
  log "Stopping Ollama before frontend build"
  stop_ollama_if_running
else
  log "Skipping Ollama setup"
fi

log "Type-checking frontend"
"$FRONTEND_DIR/node_modules/.bin/tsc" -b

log "Bundling frontend"
"$FRONTEND_DIR/node_modules/.bin/vite" build

if [[ $RUN_LINT -eq 1 ]]; then
  log "Linting frontend"
  npm run lint --prefix frontend
else
  log "Skipping frontend lint"
fi

if [[ $RUN_OLLAMA -eq 1 ]]; then
  start_ollama

  log "Waiting for Ollama API at $OLLAMA_HOST"
  wait_for_ollama || fail "Ollama did not become ready at $OLLAMA_HOST"

  log "Pulling Ollama model: $OLLAMA_MODEL"
  ollama pull "$OLLAMA_MODEL"

  log "Warming Ollama model: $OLLAMA_MODEL"
  if ! warm_ollama_model; then
    log "Continuing deployment without blocking on Ollama warm-up"
  fi
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
