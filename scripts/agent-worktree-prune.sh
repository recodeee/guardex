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
IDLE_MINUTES=0
NOW_EPOCH_RAW="${MUSAFETY_PRUNE_NOW_EPOCH:-}"
IDLE_SECONDS=0
NOW_EPOCH=0

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
    --idle-minutes)
      IDLE_MINUTES="${2:-}"
      shift 2
      ;;
    *)
      echo "[agent-worktree-prune] Unknown argument: $1" >&2
      echo "Usage: $0 [--base <branch>] [--dry-run] [--force-dirty] [--delete-branches] [--delete-remote-branches] [--only-dirty-worktrees] [--branch <agent/...>] [--idle-minutes <minutes>]" >&2
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
repo_common_dir="$(
  git -C "$repo_root" rev-parse --git-common-dir \
    | awk -v root="$repo_root" '{ if ($0 ~ /^\//) { print $0 } else { print root "/" $0 } }'
)"
repo_common_dir="$(cd "$repo_common_dir" && pwd -P)"

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

if [[ ! "$IDLE_MINUTES" =~ ^[0-9]+$ ]]; then
  echo "[agent-worktree-prune] --idle-minutes must be an integer >= 0." >&2
  exit 1
fi

if [[ -n "$NOW_EPOCH_RAW" && ! "$NOW_EPOCH_RAW" =~ ^[0-9]+$ ]]; then
  echo "[agent-worktree-prune] MUSAFETY_PRUNE_NOW_EPOCH must be a unix timestamp integer." >&2
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

IDLE_SECONDS=$((IDLE_MINUTES * 60))
if [[ -n "$NOW_EPOCH_RAW" ]]; then
  NOW_EPOCH="$NOW_EPOCH_RAW"
else
  NOW_EPOCH="$(date +%s)"
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

resolve_worktree_common_dir() {
  local wt="$1"
  local common_dir=""
  common_dir="$(git -C "$wt" rev-parse --git-common-dir 2>/dev/null || true)"
  if [[ -z "$common_dir" ]]; then
    return 1
  fi
  if [[ "$common_dir" == /* ]]; then
    common_dir="$(cd "$common_dir" 2>/dev/null && pwd -P || true)"
  else
    common_dir="$(cd "$wt/$common_dir" 2>/dev/null && pwd -P || true)"
  fi
  if [[ -z "$common_dir" ]]; then
    return 1
  fi
  printf '%s' "$common_dir"
}

select_unique_worktree_path() {
  local root="$1"
  local name="$2"
  local candidate="${root}/${name}"
  local suffix=2
  while [[ -e "$candidate" ]]; do
    candidate="${root}/${name}-${suffix}"
    suffix=$((suffix + 1))
  done
  printf '%s' "$candidate"
}

read_branch_activity_epoch() {
  local branch="$1"
  local wt="${2:-}"
  local activity_epoch=""

  activity_epoch="$(
    git -C "$repo_root" reflog show --format='%ct' -n 1 "refs/heads/${branch}" 2>/dev/null \
      | head -n 1 \
      | tr -d '[:space:]'
  )"
  if [[ -z "$activity_epoch" ]]; then
    activity_epoch="$(
      git -C "$repo_root" log -1 --format='%ct' "$branch" 2>/dev/null \
        | head -n 1 \
        | tr -d '[:space:]'
    )"
  fi

  if [[ -n "$wt" && -d "$wt" ]]; then
    local lock_file="${wt}/.omx/state/agent-file-locks.json"
    if [[ -f "$lock_file" ]]; then
      local lock_mtime=""
      lock_mtime="$(stat -c %Y "$lock_file" 2>/dev/null || stat -f %m "$lock_file" 2>/dev/null || true)"
      if [[ "$lock_mtime" =~ ^[0-9]+$ ]]; then
        if [[ -z "$activity_epoch" || "$lock_mtime" -gt "$activity_epoch" ]]; then
          activity_epoch="$lock_mtime"
        fi
      fi
    fi
  fi

  printf '%s' "$activity_epoch"
}

skipped_recent=0

branch_idle_gate() {
  local branch="$1"
  local wt="$2"
  local reason="$3"
  if [[ "$IDLE_SECONDS" -le 0 ]]; then
    return 0
  fi
  if [[ -z "$branch" ]]; then
    return 0
  fi

  local last_activity_epoch=""
  last_activity_epoch="$(read_branch_activity_epoch "$branch" "$wt")"
  if [[ ! "$last_activity_epoch" =~ ^[0-9]+$ ]]; then
    return 0
  fi

  local idle_age=$((NOW_EPOCH - last_activity_epoch))
  if [[ "$idle_age" -lt 0 ]]; then
    idle_age=0
  fi
  if [[ "$idle_age" -lt "$IDLE_SECONDS" ]]; then
    skipped_recent=$((skipped_recent + 1))
    echo "[agent-worktree-prune] Skipping recent branch (${reason}): ${branch} (idle=${idle_age}s < ${IDLE_SECONDS}s)"
    return 1
  fi
  return 0
}

relocated_foreign=0
skipped_foreign=0

relocate_foreign_worktree_entries() {
  [[ -d "$worktree_root" ]] || return 0

  local entry=""
  for entry in "${worktree_root}"/*; do
    [[ -d "$entry" ]] || continue
    if ! git -C "$entry" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      continue
    fi

    local entry_common_dir=""
    entry_common_dir="$(resolve_worktree_common_dir "$entry" || true)"
    [[ -n "$entry_common_dir" ]] || continue

    if [[ "$entry_common_dir" == "$repo_common_dir" ]]; then
      continue
    fi

    if [[ "$(basename "$entry_common_dir")" != ".git" ]]; then
      skipped_foreign=$((skipped_foreign + 1))
      echo "[agent-worktree-prune] Skipping foreign worktree with unsupported git common dir: ${entry}"
      continue
    fi

    local owner_repo_root
    owner_repo_root="$(dirname "$entry_common_dir")"
    local owner_worktree_root="${owner_repo_root}/.omx/agent-worktrees"
    local target_path
    target_path="$(select_unique_worktree_path "$owner_worktree_root" "$(basename "$entry")")"

    if [[ "$entry" == "$current_pwd" || "$current_pwd" == "${entry}"/* ]]; then
      skipped_foreign=$((skipped_foreign + 1))
      echo "[agent-worktree-prune] Skipping active foreign worktree: ${entry}"
      continue
    fi

    echo "[agent-worktree-prune] Relocating foreign worktree to owning repo: ${entry} -> ${target_path}"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      relocated_foreign=$((relocated_foreign + 1))
      continue
    fi

    mkdir -p "$owner_worktree_root"
    if git -C "$owner_repo_root" worktree move "$entry" "$target_path" >/dev/null 2>&1; then
      relocated_foreign=$((relocated_foreign + 1))
    else
      skipped_foreign=$((skipped_foreign + 1))
      echo "[agent-worktree-prune] Failed to relocate foreign worktree: ${entry}" >&2
    fi
  done
}

removed_worktrees=0
removed_branches=0
skipped_active=0
skipped_dirty=0

relocate_foreign_worktree_entries

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

  if ! branch_idle_gate "$branch" "$wt" "$remove_reason"; then
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
    if ! branch_idle_gate "$branch" "" "stale-merged-branch"; then
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

echo "[agent-worktree-prune] Summary: base=${BASE_BRANCH}, idle_minutes=${IDLE_MINUTES}, removed_worktrees=${removed_worktrees}, removed_branches=${removed_branches}, skipped_active=${skipped_active}, skipped_dirty=${skipped_dirty}, skipped_recent=${skipped_recent}"
if [[ "$relocated_foreign" -gt 0 || "$skipped_foreign" -gt 0 ]]; then
  echo "[agent-worktree-prune] Foreign routing: relocated=${relocated_foreign}, skipped=${skipped_foreign}"
fi
if [[ "$skipped_active" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: leave active agent worktree directories, then run this command again for full cleanup." >&2
fi
if [[ "$skipped_dirty" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: dirty worktrees were preserved. Clean/finish them first, or pass --force-dirty to remove anyway." >&2
fi
if [[ "$IDLE_SECONDS" -gt 0 && "$skipped_recent" -gt 0 ]]; then
  echo "[agent-worktree-prune] Tip: recent branches were preserved by --idle-minutes=${IDLE_MINUTES}. Re-run later or lower the threshold." >&2
fi
