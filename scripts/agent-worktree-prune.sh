#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="dev"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-dev}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "[agent-worktree-prune] Unknown argument: $1" >&2
      echo "Usage: $0 [--base <branch>] [--dry-run]" >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[agent-worktree-prune] Not inside a git repository." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
current_pwd="$(pwd -P)"
worktree_root="${repo_root}/.omx/agent-worktrees"

if ! git -C "$repo_root" show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
  echo "[agent-worktree-prune] Base branch not found: ${BASE_BRANCH}" >&2
  exit 1
fi

run_cmd() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[agent-worktree-prune] [dry-run] $*"
    return 0
  fi
  "$@"
}

branch_has_worktree() {
  local branch="$1"
  git -C "$repo_root" worktree list --porcelain | grep -q "^branch refs/heads/${branch}$"
}

removed_worktrees=0
removed_branches=0
skipped_active=0

process_entry() {
  local wt="$1"
  local branch_ref="$2"

  [[ -z "$wt" ]] && return
  [[ "$wt" != "${worktree_root}"/* ]] && return

  local branch=""
  if [[ -n "$branch_ref" ]]; then
    branch="${branch_ref#refs/heads/}"
  fi

  if [[ "$wt" == "$current_pwd" ]]; then
    skipped_active=$((skipped_active + 1))
    echo "[agent-worktree-prune] Skipping active cwd worktree: ${wt}"
    return
  fi

  local remove_reason=""

  if [[ -z "$branch_ref" ]]; then
    remove_reason="detached-worktree"
  elif ! git -C "$repo_root" show-ref --verify --quiet "refs/heads/${branch}"; then
    remove_reason="missing-branch"
  elif [[ "$branch" == agent/* ]]; then
    if git -C "$repo_root" merge-base --is-ancestor "$branch" "$BASE_BRANCH"; then
      remove_reason="merged-agent-branch"
    fi
  elif [[ "$branch" == __agent_integrate_* || "$branch" == __source-probe-* ]]; then
    remove_reason="temporary-worktree"
  fi

  if [[ -z "$remove_reason" ]]; then
    return
  fi

  echo "[agent-worktree-prune] Removing worktree (${remove_reason}): ${wt}"
  run_cmd git -C "$repo_root" worktree remove "$wt" --force
  removed_worktrees=$((removed_worktrees + 1))

  if [[ -z "$branch" ]]; then
    return
  fi

  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/${branch}" && ! branch_has_worktree "$branch"; then
    if [[ "$branch" == agent/* ]]; then
      if run_cmd git -C "$repo_root" branch -d "$branch" >/dev/null 2>&1; then
        removed_branches=$((removed_branches + 1))
        echo "[agent-worktree-prune] Deleted merged branch: ${branch}"
      fi
    elif [[ "$branch" == __agent_integrate_* || "$branch" == __source-probe-* ]]; then
      run_cmd git -C "$repo_root" branch -D "$branch" >/dev/null 2>&1 || true
      removed_branches=$((removed_branches + 1))
      echo "[agent-worktree-prune] Deleted temporary branch: ${branch}"
    fi
  fi
}

current_wt=""
current_branch_ref=""

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ -z "$line" ]]; then
    process_entry "$current_wt" "$current_branch_ref"
    current_wt=""
    current_branch_ref=""
    continue
  fi

  case "$line" in
    worktree\ *)
      current_wt="${line#worktree }"
      ;;
    branch\ *)
      current_branch_ref="${line#branch }"
      ;;
  esac
done < <(git -C "$repo_root" worktree list --porcelain)

process_entry "$current_wt" "$current_branch_ref"

while IFS= read -r branch; do
  [[ -z "$branch" ]] && continue
  if branch_has_worktree "$branch"; then
    continue
  fi
  if git -C "$repo_root" merge-base --is-ancestor "$branch" "$BASE_BRANCH"; then
    if run_cmd git -C "$repo_root" branch -d "$branch" >/dev/null 2>&1; then
      removed_branches=$((removed_branches + 1))
      echo "[agent-worktree-prune] Deleted stale merged branch: ${branch}"
    fi
  fi
done < <(git -C "$repo_root" for-each-ref --format='%(refname:short)' refs/heads/agent)

run_cmd git -C "$repo_root" worktree prune

echo "[agent-worktree-prune] Summary: removed_worktrees=${removed_worktrees}, removed_branches=${removed_branches}, skipped_active=${skipped_active}"
if [[ "$skipped_active" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: leave active agent worktree directories, then run this command again for full cleanup." >&2
fi
