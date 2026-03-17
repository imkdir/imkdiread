#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BACKUP_DIR="${LOCAL_BACKUP_DIR:-$ROOT_DIR/backups}"
REMOTE_HOST="${REMOTE_HOST:-imkdiread.com}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_DB_PATH="${REMOTE_DB_PATH:-/srv/imkdiread/shared/database.sqlite}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/imkdiread_vps}"
FILE_PREFIX="${FILE_PREFIX:-database}"

VERIFY_BACKUP=1
LOCAL_OUTPUT_PATH=""

usage() {
  cat <<EOF
Usage: scripts/sync-vps-database.sh [options]

Create a consistent SQLite backup snapshot on the VPS and copy it locally.

Defaults:
  - remote DB:   $REMOTE_USER@$REMOTE_HOST:$REMOTE_DB_PATH
  - local dir:   $LOCAL_BACKUP_DIR
  - ssh key:     $SSH_KEY_PATH
  - file prefix: $FILE_PREFIX

Options:
  --host HOST        Override remote host (default: $REMOTE_HOST)
  --user USER        Override remote user (default: $REMOTE_USER)
  --remote-db PATH   Override remote SQLite path
  --backup-dir DIR   Save timestamped backups into DIR
  --output FILE      Save to an exact local file path instead of a timestamped name
  --prefix NAME      Override the local backup filename prefix
  --key PATH         Override SSH key path (default: $SSH_KEY_PATH)
  --no-verify        Skip local 'PRAGMA integrity_check'
  --help             Show this help

Examples:
  bash scripts/sync-vps-database.sh
  bash scripts/sync-vps-database.sh --host my-vps --remote-db /srv/imkdiread/shared/database.sqlite
  bash scripts/sync-vps-database.sh --output ~/Backups/imkdiread-latest.sqlite

Environment:
  REMOTE_HOST
  REMOTE_USER
  REMOTE_DB_PATH
  LOCAL_BACKUP_DIR
  SSH_KEY_PATH
  FILE_PREFIX
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
    --host)
      [[ $# -ge 2 ]] || fail "--host requires a value"
      REMOTE_HOST="$2"
      shift
      ;;
    --user)
      [[ $# -ge 2 ]] || fail "--user requires a value"
      REMOTE_USER="$2"
      shift
      ;;
    --remote-db)
      [[ $# -ge 2 ]] || fail "--remote-db requires a value"
      REMOTE_DB_PATH="$2"
      shift
      ;;
    --backup-dir)
      [[ $# -ge 2 ]] || fail "--backup-dir requires a value"
      LOCAL_BACKUP_DIR="$2"
      shift
      ;;
    --output)
      [[ $# -ge 2 ]] || fail "--output requires a value"
      LOCAL_OUTPUT_PATH="$2"
      shift
      ;;
    --prefix)
      [[ $# -ge 2 ]] || fail "--prefix requires a value"
      FILE_PREFIX="$2"
      shift
      ;;
    --key)
      [[ $# -ge 2 ]] || fail "--key requires a value"
      SSH_KEY_PATH="$2"
      shift
      ;;
    --no-verify)
      VERIFY_BACKUP=0
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

command -v ssh >/dev/null 2>&1 || fail "ssh is required"
command -v scp >/dev/null 2>&1 || fail "scp is required"

[[ -f "$SSH_KEY_PATH" ]] || fail "SSH key not found: $SSH_KEY_PATH"

safe_host="$(printf '%s' "$REMOTE_HOST" | tr -c 'A-Za-z0-9._-' '-')"
safe_prefix="$(printf '%s' "$FILE_PREFIX" | tr -c 'A-Za-z0-9._-' '-')"
timestamp="$(date '+%Y%m%d-%H%M%S')"
remote_tmp_path="/tmp/${safe_prefix}-${safe_host}-${timestamp}-$$.sqlite"

if [[ -n "$LOCAL_OUTPUT_PATH" ]]; then
  mkdir -p "$(dirname "$LOCAL_OUTPUT_PATH")"
  local_target="$LOCAL_OUTPUT_PATH"
else
  mkdir -p "$LOCAL_BACKUP_DIR"
  local_target="$LOCAL_BACKUP_DIR/${safe_prefix}-${safe_host}-${timestamp}.sqlite"
  latest_link="$LOCAL_BACKUP_DIR/${safe_prefix}-${safe_host}-latest.sqlite"
fi

SSH_ARGS=(-F /dev/null -i "$SSH_KEY_PATH")

cleanup_remote() {
  ssh "${SSH_ARGS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" /bin/bash -s -- "$remote_tmp_path" <<'EOF' >/dev/null 2>&1 || true
set -euo pipefail
remote_tmp_path="$1"
rm -f "$remote_tmp_path"
EOF
}

trap cleanup_remote EXIT

log "Creating SQLite snapshot on $REMOTE_HOST"
ssh "${SSH_ARGS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" /bin/bash -s -- "$REMOTE_DB_PATH" "$remote_tmp_path" <<'EOF'
set -euo pipefail

remote_db_path="$1"
remote_tmp_path="$2"

command -v sqlite3 >/dev/null 2>&1 || {
  echo "sqlite3 is not installed on the remote host" >&2
  exit 1
}

if [[ ! -f "$remote_db_path" ]]; then
  echo "Remote database not found: $remote_db_path" >&2
  exit 1
fi

# Use SQLite's backup API so we don't copy a live database file mid-write.
sqlite3 "$remote_db_path" ".backup '$remote_tmp_path'"
chmod 600 "$remote_tmp_path" || true
EOF

log "Downloading backup to $local_target"
scp "${SSH_ARGS[@]}" "${REMOTE_USER}@${REMOTE_HOST}:$remote_tmp_path" "$local_target"

if [[ $VERIFY_BACKUP -eq 1 ]]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    log "Verifying local SQLite backup"
    integrity_check="$(sqlite3 "$local_target" 'PRAGMA integrity_check;')"
    [[ "$integrity_check" == "ok" ]] || fail "Backup failed integrity check: $integrity_check"
  else
    log "Skipping integrity check because sqlite3 is not installed locally"
  fi
fi

if [[ -n "${latest_link:-}" ]]; then
  ln -sfn "$(basename "$local_target")" "$latest_link"
  log "Updated latest backup link: $latest_link"
fi

log "Backup saved to $local_target"
