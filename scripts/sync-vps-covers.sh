#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_PUBLIC_DIR="${LOCAL_PUBLIC_DIR:-$ROOT_DIR/backend/public}"
REMOTE_HOST="${REMOTE_HOST:-imkdiread.com}"
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_PUBLIC_DIR="${REMOTE_PUBLIC_DIR:-/srv/imkdiread/shared/public}"
SSH_KEY_PATH="${SSH_KEY_PATH:-$HOME/.ssh/imkdiread_vps}"
SYNC_SUBDIR="imgs/covers"

DRY_RUN=0
DELETE_REMOTE=0

usage() {
  cat <<EOF
Usage: scripts/sync-vps-covers.sh [options]

Sync backend/public assets to the VPS.

Defaults:
  - syncs only imgs/covers
  - local root:  $LOCAL_PUBLIC_DIR
  - remote root: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PUBLIC_DIR

Options:
  --public           Sync the entire backend/public tree
  --subdir PATH      Sync only a specific subdirectory under backend/public
                     Examples: imgs/covers, imgs/screensavers, imgs/avatars, files
  --dry-run          Show what would change without uploading
  --delete           Delete remote files that no longer exist locally
  --host HOST        Override remote host (default: $REMOTE_HOST)
  --user USER        Override remote user (default: $REMOTE_USER)
  --local-root DIR   Override local backend/public root
  --remote-root DIR  Override remote public root
  --key PATH         Override SSH key path (default: $SSH_KEY_PATH)
  --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public)
      SYNC_SUBDIR=""
      ;;
    --subdir)
      [[ $# -ge 2 ]] || { echo "--subdir requires a value" >&2; exit 1; }
      SYNC_SUBDIR="${2#/}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --delete)
      DELETE_REMOTE=1
      ;;
    --host)
      [[ $# -ge 2 ]] || { echo "--host requires a value" >&2; exit 1; }
      REMOTE_HOST="$2"
      shift
      ;;
    --user)
      [[ $# -ge 2 ]] || { echo "--user requires a value" >&2; exit 1; }
      REMOTE_USER="$2"
      shift
      ;;
    --local-root)
      [[ $# -ge 2 ]] || { echo "--local-root requires a value" >&2; exit 1; }
      LOCAL_PUBLIC_DIR="$2"
      shift
      ;;
    --remote-root)
      [[ $# -ge 2 ]] || { echo "--remote-root requires a value" >&2; exit 1; }
      REMOTE_PUBLIC_DIR="$2"
      shift
      ;;
    --key)
      [[ $# -ge 2 ]] || { echo "--key requires a value" >&2; exit 1; }
      SSH_KEY_PATH="$2"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ ! -d "$LOCAL_PUBLIC_DIR" ]]; then
  echo "Local public root not found: $LOCAL_PUBLIC_DIR" >&2
  exit 1
fi

if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo "SSH key not found: $SSH_KEY_PATH" >&2
  exit 1
fi

LOCAL_SOURCE="$LOCAL_PUBLIC_DIR/"
REMOTE_TARGET="$REMOTE_PUBLIC_DIR/"
TARGET_LABEL="entire public tree"

if [[ -n "$SYNC_SUBDIR" ]]; then
  LOCAL_SOURCE="$LOCAL_PUBLIC_DIR/$SYNC_SUBDIR/"
  REMOTE_TARGET="$REMOTE_PUBLIC_DIR/$SYNC_SUBDIR/"
  TARGET_LABEL="$SYNC_SUBDIR"
fi

if [[ ! -d "$LOCAL_SOURCE" ]]; then
  echo "Local sync source not found: $LOCAL_SOURCE" >&2
  exit 1
fi

RSYNC_ARGS=(
  -av
  --progress
  -e
  "ssh -F /dev/null -i $SSH_KEY_PATH"
)

if [[ $DRY_RUN -eq 1 ]]; then
  RSYNC_ARGS+=(--dry-run)
fi

if [[ $DELETE_REMOTE -eq 1 ]]; then
  RSYNC_ARGS+=(--delete)
fi

echo "Syncing $TARGET_LABEL"
echo "from:"
echo "  $LOCAL_SOURCE"
echo "to:"
echo "  $REMOTE_USER@$REMOTE_HOST:$REMOTE_TARGET"

rsync "${RSYNC_ARGS[@]}" \
  "$LOCAL_SOURCE" \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TARGET"
