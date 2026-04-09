#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="dev"
SOURCE_BRANCH=""
PUSH_ENABLED=1
DELETE_REMOTE_BRANCH=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --branch)
      SOURCE_BRANCH="${2:-}"
      shift 2
      ;;
    --no-push)
      PUSH_ENABLED=0
      shift
      ;;
    --keep-remote-branch)
      DELETE_REMOTE_BRANCH=0
      shift
      ;;
    *)
      echo "[agent-branch-finish] Unknown argument: $1" >&2
      echo "Usage: $0 [--base <branch>] [--branch <branch>] [--no-push] [--keep-remote-branch]" >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[agent-branch-finish] Not inside a git repository." >&2
  exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
current_worktree="$(pwd -P)"

if [[ -z "$SOURCE_BRANCH" ]]; then
  SOURCE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
fi

if [[ "$SOURCE_BRANCH" == "$BASE_BRANCH" ]]; then
  echo "[agent-branch-finish] Source branch and base branch are both '$BASE_BRANCH'." >&2
  echo "[agent-branch-finish] Switch to your agent branch or pass --branch <agent-branch>." >&2
  exit 1
fi

if ! git -C "$repo_root" show-ref --verify --quiet "refs/heads/${SOURCE_BRANCH}"; then
  echo "[agent-branch-finish] Local source branch does not exist: ${SOURCE_BRANCH}" >&2
  exit 1
fi

get_worktree_for_branch() {
  local branch="$1"
  git -C "$repo_root" worktree list --porcelain | awk -v target="refs/heads/${branch}" '
    $1 == "worktree" { wt = $2 }
    $1 == "branch" && $2 == target { print wt; exit }
  '
}

is_clean_worktree() {
  local wt="$1"
  git -C "$wt" diff --quiet && git -C "$wt" diff --cached --quiet
}

source_worktree="$(get_worktree_for_branch "$SOURCE_BRANCH")"
created_source_probe=0
source_probe_path=""

if [[ -z "$source_worktree" ]]; then
  source_probe_path="${repo_root}/.omx/agent-worktrees/__source-probe-${SOURCE_BRANCH//\//__}-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$(dirname "$source_probe_path")"
  git -C "$repo_root" worktree add "$source_probe_path" "$SOURCE_BRANCH" >/dev/null
  source_worktree="$source_probe_path"
  created_source_probe=1
fi

if ! is_clean_worktree "$source_worktree"; then
  echo "[agent-branch-finish] Source worktree is not clean for '${SOURCE_BRANCH}': ${source_worktree}" >&2
  echo "[agent-branch-finish] Commit/stash changes on the source branch before finishing." >&2
  exit 1
fi

start_ref="$BASE_BRANCH"
if git -C "$repo_root" show-ref --verify --quiet "refs/remotes/origin/${BASE_BRANCH}"; then
  git -C "$repo_root" fetch origin "$BASE_BRANCH" --quiet
  start_ref="origin/${BASE_BRANCH}"
fi

integration_worktree="${repo_root}/.omx/agent-worktrees/__integrate-${BASE_BRANCH//\//__}-$(date +%Y%m%d-%H%M%S)"
integration_branch="__agent_integrate_${BASE_BRANCH//\//_}_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$(dirname "$integration_worktree")"

git -C "$repo_root" worktree add "$integration_worktree" "$start_ref" >/dev/null
git -C "$integration_worktree" checkout -b "$integration_branch" >/dev/null

cleanup() {
  if [[ -d "$integration_worktree" ]]; then
    git -C "$repo_root" worktree remove "$integration_worktree" --force >/dev/null 2>&1 || true
  fi
  if [[ "$created_source_probe" -eq 1 && -n "$source_probe_path" && -d "$source_probe_path" ]]; then
    git -C "$repo_root" worktree remove "$source_probe_path" --force >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if git -C "$repo_root" show-ref --verify --quiet "refs/remotes/origin/${BASE_BRANCH}"; then
  git -C "$source_worktree" fetch origin "$BASE_BRANCH" --quiet

  if ! git -C "$source_worktree" merge --no-commit --no-ff "origin/${BASE_BRANCH}" >/dev/null 2>&1; then
    conflict_files="$(git -C "$source_worktree" diff --name-only --diff-filter=U || true)"
    git -C "$source_worktree" merge --abort >/dev/null 2>&1 || true

    echo "[agent-branch-finish] Preflight conflict detected between '${SOURCE_BRANCH}' and latest origin/${BASE_BRANCH}." >&2
    if [[ -n "$conflict_files" ]]; then
      echo "[agent-branch-finish] Conflicting files:" >&2
      while IFS= read -r file; do
        [[ -n "$file" ]] && echo "  - ${file}" >&2
      done <<< "$conflict_files"
    fi
    echo "[agent-branch-finish] Rebase/merge '${BASE_BRANCH}' into '${SOURCE_BRANCH}' and resolve conflicts before finishing." >&2
    exit 1
  fi

  git -C "$source_worktree" merge --abort >/dev/null 2>&1 || true
fi

if ! git -C "$integration_worktree" merge --no-ff --no-edit "$SOURCE_BRANCH"; then
  echo "[agent-branch-finish] Merge conflict detected while merging '${SOURCE_BRANCH}' into '${BASE_BRANCH}'." >&2
  git -C "$integration_worktree" merge --abort >/dev/null 2>&1 || true
  exit 1
fi

if [[ "$PUSH_ENABLED" -eq 1 ]]; then
  git -C "$integration_worktree" push origin "HEAD:${BASE_BRANCH}"
fi

if [[ -x "${repo_root}/scripts/agent-file-locks.py" ]]; then
  python3 "${repo_root}/scripts/agent-file-locks.py" release --branch "$SOURCE_BRANCH" >/dev/null 2>&1 || true
fi

if [[ "$source_worktree" == "$repo_root" ]]; then
  if is_clean_worktree "$source_worktree"; then
    git -C "$source_worktree" checkout "$BASE_BRANCH" >/dev/null 2>&1 || true
  fi
elif [[ "$source_worktree" == "$current_worktree" && "$source_worktree" == "${repo_root}/.omx/agent-worktrees"/* ]]; then
  git -C "$source_worktree" checkout --detach >/dev/null 2>&1 || true
fi

if [[ "$source_worktree" != "$current_worktree" && "$source_worktree" == "${repo_root}/.omx/agent-worktrees"/* ]]; then
  git -C "$repo_root" worktree remove "$source_worktree" --force >/dev/null 2>&1 || true
fi

git -C "$repo_root" branch -d "$SOURCE_BRANCH"

if [[ "$PUSH_ENABLED" -eq 1 && "$DELETE_REMOTE_BRANCH" -eq 1 ]]; then
  if git -C "$repo_root" ls-remote --exit-code --heads origin "$SOURCE_BRANCH" >/dev/null 2>&1; then
    git -C "$repo_root" push origin --delete "$SOURCE_BRANCH"
  fi
fi

base_worktree="$(get_worktree_for_branch "$BASE_BRANCH")"
if [[ -n "$base_worktree" ]] && is_clean_worktree "$base_worktree" && [[ "$PUSH_ENABLED" -eq 1 ]]; then
  git -C "$base_worktree" pull --ff-only origin "$BASE_BRANCH" >/dev/null 2>&1 || true
fi

echo "[agent-branch-finish] Merged '${SOURCE_BRANCH}' into '${BASE_BRANCH}' and removed branch."
if [[ "$source_worktree" == "$current_worktree" && "$source_worktree" == "${repo_root}/.omx/agent-worktrees"/* ]]; then
  echo "[agent-branch-finish] Current worktree '${source_worktree}' still exists because it is the active shell cwd." >&2
  echo "[agent-branch-finish] Leave this directory, then run: git -C \"${repo_root}\" worktree remove \"${source_worktree}\" --force" >&2
fi
