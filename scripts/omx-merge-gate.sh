#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)"
python3 "${repo_root}/scripts/omx_github_context.py" merge-gate "$@"
