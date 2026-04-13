#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${MUSAFETY_BASE_BRANCH:-}"
BASE_BRANCH_EXPLICIT=0
DRY_RUN=0
FORCE_DIRTY=0
DELETE_BRANCHES=0
DELETE_REMOTE_BRANCHES=0
ONLY_DIRTY_WORKTREES=0
TARGET_BRANCH=""

if [[ -n "$BASE_BRANCH" ]]; then
  BASE_BRANCH_EXPLICIT=1
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      BASE_BRANCH_EXPLICIT=1
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --force-dirty)
      FORCE_DIRTY=1
      shift
      ;;
    --delete-branches)
      DELETE_BRANCHES=1
      shift
      ;;
    --delete-remote-branches)
      DELETE_REMOTE_BRANCHES=1
      shift
      ;;
    --only-dirty-worktrees)
      ONLY_DIRTY_WORKTREES=1
      shift
      ;;
    --branch)
      TARGET_BRANCH="${2:-}"
      shift 2
      ;;
    *)
      echo "[agent-worktree-prune] Unknown argument: $1" >&2
      echo "Usage: $0 [--base <branch>] [--dry-run] [--force-dirty] [--delete-branches] [--delete-remote-branches] [--only-dirty-worktrees] [--branch <agent/...>]" >&2
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

resolve_base_branch() {
  local configured=""
  local current=""

  configured="$(git -C "$repo_root" config --get multiagent.baseBranch || true)"
  if [[ -n "$configured" ]] && git -C "$repo_root" show-ref --verify --quiet "refs/heads/${configured}"; then
    printf '%s' "$configured"
    return 0
  fi

  current="$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [[ -n "$current" && "$current" != "HEAD" ]] && git -C "$repo_root" show-ref --verify --quiet "refs/heads/${current}"; then
    printf '%s' "$current"
    return 0
  fi

  for fallback in main dev; do
    if git -C "$repo_root" show-ref --verify --quiet "refs/heads/${fallback}"; then
      printf '%s' "$fallback"
      return 0
    fi
  done

  printf '%s' ""
}

if [[ "$BASE_BRANCH_EXPLICIT" -eq 1 && -z "$BASE_BRANCH" ]]; then
  echo "[agent-worktree-prune] --base requires a non-empty branch name." >&2
  exit 1
fi

if [[ -n "$TARGET_BRANCH" && "$TARGET_BRANCH" != agent/* ]]; then
  echo "[agent-worktree-prune] --branch must reference an agent/* branch: ${TARGET_BRANCH}" >&2
  exit 1
fi

if [[ "$BASE_BRANCH_EXPLICIT" -eq 0 ]]; then
  BASE_BRANCH="$(resolve_base_branch)"
fi

if [[ -z "$BASE_BRANCH" ]]; then
  echo "[agent-worktree-prune] Unable to infer base branch. Pass --base <branch>." >&2
  exit 1
fi

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

is_clean_worktree() {
  local wt="$1"
  git -C "$wt" diff --quiet -- . ":(exclude).omx/state/agent-file-locks.json" \
    && git -C "$wt" diff --cached --quiet -- . ":(exclude).omx/state/agent-file-locks.json" \
    && [[ -z "$(git -C "$wt" ls-files --others --exclude-standard)" ]]
}

removed_worktrees=0
removed_branches=0
skipped_active=0
skipped_dirty=0

process_entry() {
  local wt="$1"
  local branch_ref="$2"

  [[ -z "$wt" ]] && return
  [[ "$wt" != "${worktree_root}"/* ]] && return

  local branch=""
  if [[ -n "$branch_ref" ]]; then
    branch="${branch_ref#refs/heads/}"
  fi

  if [[ -n "$TARGET_BRANCH" && "$branch" != "$TARGET_BRANCH" ]]; then
    return
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
      if [[ "$DELETE_BRANCHES" -eq 1 ]]; then
        remove_reason="merged-agent-branch"
      fi
    elif [[ "$ONLY_DIRTY_WORKTREES" -eq 1 ]] && is_clean_worktree "$wt"; then
      remove_reason="clean-agent-worktree"
    fi
  elif [[ "$branch" == __agent_integrate_* || "$branch" == __source-probe-* ]]; then
    remove_reason="temporary-worktree"
  fi

  if [[ -z "$remove_reason" ]]; then
    return
  fi

  if [[ "$FORCE_DIRTY" -ne 1 ]] && ! is_clean_worktree "$wt"; then
    skipped_dirty=$((skipped_dirty + 1))
    echo "[agent-worktree-prune] Skipping dirty worktree (${remove_reason}): ${wt}"
    return
  fi

  echo "[agent-worktree-prune] Removing worktree (${remove_reason}): ${wt}"
  run_cmd git -C "$repo_root" worktree remove "$wt" --force
  removed_worktrees=$((removed_worktrees + 1))

  if [[ -z "$branch" ]]; then
    return
  fi

  if git -C "$repo_root" show-ref --verify --quiet "refs/heads/${branch}" && ! branch_has_worktree "$branch"; then
    if [[ "$branch" == agent/* && "$DELETE_BRANCHES" -eq 1 ]]; then
      if run_cmd git -C "$repo_root" branch -d "$branch" >/dev/null 2>&1; then
        removed_branches=$((removed_branches + 1))
        echo "[agent-worktree-prune] Deleted merged branch: ${branch}"
        if [[ "$DELETE_REMOTE_BRANCHES" -eq 1 ]]; then
          if git -C "$repo_root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
            run_cmd git -C "$repo_root" push origin --delete "$branch" >/dev/null 2>&1 || true
            echo "[agent-worktree-prune] Deleted merged remote branch: ${branch}"
          fi
        fi
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

if [[ "$DELETE_BRANCHES" -eq 1 ]]; then
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    if [[ -n "$TARGET_BRANCH" && "$branch" != "$TARGET_BRANCH" ]]; then
      continue
    fi
    if branch_has_worktree "$branch"; then
      continue
    fi
    if git -C "$repo_root" merge-base --is-ancestor "$branch" "$BASE_BRANCH"; then
      if run_cmd git -C "$repo_root" branch -d "$branch" >/dev/null 2>&1; then
        removed_branches=$((removed_branches + 1))
        echo "[agent-worktree-prune] Deleted stale merged branch: ${branch}"
        if [[ "$DELETE_REMOTE_BRANCHES" -eq 1 ]]; then
          if git -C "$repo_root" ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
            run_cmd git -C "$repo_root" push origin --delete "$branch" >/dev/null 2>&1 || true
            echo "[agent-worktree-prune] Deleted stale merged remote branch: ${branch}"
          fi
        fi
      fi
    fi
  done < <(git -C "$repo_root" for-each-ref --format='%(refname:short)' refs/heads/agent)
fi

run_cmd git -C "$repo_root" worktree prune

echo "[agent-worktree-prune] Summary: base=${BASE_BRANCH}, removed_worktrees=${removed_worktrees}, removed_branches=${removed_branches}, skipped_active=${skipped_active}, skipped_dirty=${skipped_dirty}"
if [[ "$skipped_active" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: leave active agent worktree directories, then run this command again for full cleanup." >&2
fi
if [[ "$skipped_dirty" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: dirty worktrees were preserved. Clean/finish them first, or pass --force-dirty to remove anyway." >&2
fi
