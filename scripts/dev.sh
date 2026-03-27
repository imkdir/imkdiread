#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

if [[ -f "$BACKEND_DIR/.env" ]]; then
  printf '==> Loading backend environment from backend/.env\n'
  set -a
  # shellcheck disable=SC1091
  source "$BACKEND_DIR/.env"
  set +a
fi

if [[ "${OLLAMA_ENABLED:-1}" =~ ^(0|false|FALSE|no|NO|off|OFF|disabled|DISABLED)$ ]]; then
  printf '==> Ollama disabled via OLLAMA_ENABLED=%s\n' "${OLLAMA_ENABLED:-0}"
else
  printf '==> Ollama enabled via OLLAMA_ENABLED=%s\n' "${OLLAMA_ENABLED:-1}"
  ollama pull "${OLLAMA_MODEL:-}"
fi

cd "$ROOT_DIR"
exec npx concurrently "npm run dev --prefix frontend" "npm run dev --prefix backend"
