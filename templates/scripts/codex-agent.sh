#!/usr/bin/env bash
set -euo pipefail

TASK_NAME="${MUSAFETY_TASK_NAME:-task}"
AGENT_NAME="${MUSAFETY_AGENT_NAME:-agent}"
BASE_BRANCH="${MUSAFETY_BASE_BRANCH:-dev}"
CODEX_BIN="${MUSAFETY_CODEX_BIN:-codex}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task)
      TASK_NAME="${2:-$TASK_NAME}"
      shift 2
      ;;
    --agent)
      AGENT_NAME="${2:-$AGENT_NAME}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-$BASE_BRANCH}"
      shift 2
      ;;
    --codex-bin)
      CODEX_BIN="${2:-$CODEX_BIN}"
      shift 2
      ;;
    --)
      shift
      break
      ;;
    -*)
      break
      ;;
    *)
      TASK_NAME="$1"
      shift
      if [[ $# -gt 0 && "${1:-}" != -* ]]; then
        AGENT_NAME="$1"
        shift
      fi
      if [[ $# -gt 0 && "${1:-}" != -* ]]; then
        BASE_BRANCH="$1"
        shift
      fi
      break
      ;;
  esac
done

if ! command -v "$CODEX_BIN" >/dev/null 2>&1; then
  echo "[codex-agent] Missing Codex CLI command: $CODEX_BIN" >&2
  echo "[codex-agent] Install Codex first, then retry." >&2
  exit 127
fi

if [[ ! -x "scripts/agent-branch-start.sh" ]]; then
  echo "[codex-agent] Missing scripts/agent-branch-start.sh. Run: musafety setup" >&2
  exit 1
fi

start_output="$(bash scripts/agent-branch-start.sh "$TASK_NAME" "$AGENT_NAME" "$BASE_BRANCH")"
printf '%s\n' "$start_output"

worktree_path="$(printf '%s\n' "$start_output" | sed -n 's/^\[agent-branch-start\] Worktree: //p' | tail -n1)"
if [[ -z "$worktree_path" ]]; then
  echo "[codex-agent] Could not determine sandbox worktree path from agent-branch-start output." >&2
  exit 1
fi

if [[ ! -d "$worktree_path" ]]; then
  echo "[codex-agent] Reported worktree path does not exist: $worktree_path" >&2
  exit 1
fi

echo "[codex-agent] Launching ${CODEX_BIN} in sandbox: $worktree_path"
cd "$worktree_path"
exec "$CODEX_BIN" "$@"
