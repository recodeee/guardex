# multiagent-safety

A command-line tool that installs a proven multi-agent collaboration safety workflow into any git repository.

> [!WARNING]
> Not affiliated with OpenAI or Codex. Not an official tool.

## How it Works

`multiagent-safety` copies a guarded multi-agent workflow into your target repo:

1. Branch guard hook blocks direct commits on protected branches (`dev`, `main`, `master`).
2. Agent branch lifecycle scripts create isolated agent branches/worktrees and safely merge back.
3. File ownership lock script prevents two agents from committing overlapping files.
4. Optional `AGENTS.md` snippet documents the collaboration contract for future sessions.

The installer is idempotent by default and only overwrites managed files when `--force` is provided.

## Requirements

- Node.js 18+
- Git
- Python 3 (for lock helper script)

## Install (npm)

```sh
npm i -g multiagent-safety
```

## Usage

```sh
# install into current repository
multiagent-safety install

# install into another repository
multiagent-safety install --target /path/to/repo

# preview changes only
multiagent-safety install --dry-run

# print AGENTS snippet only
multiagent-safety print-agents-snippet

# shorthand: no command defaults to "install"
multiagent-safety
```

### Install options

- `--target <path>`: target repo path (defaults to current directory)
- `--force`: overwrite existing managed files when content differs
- `--skip-agents`: do not create/update `AGENTS.md`
- `--skip-package-json`: do not inject helper npm scripts
- `--dry-run`: show planned actions without writing files

## What gets added to the target repo

```text
scripts/agent-branch-start.sh
scripts/agent-branch-finish.sh
scripts/agent-file-locks.py
scripts/install-agent-git-hooks.sh
.githooks/pre-commit
.omx/state/agent-file-locks.json
```

If `package.json` exists, these scripts are added/updated:

- `agent:branch:start`
- `agent:branch:finish`
- `agent:hooks:install`
- `agent:locks:claim`
- `agent:locks:release`
- `agent:locks:status`

The installer also runs:

```sh
git config core.hooksPath .githooks
```

## Recommended agent workflow (inside installed repo)

```sh
# 1) Start isolated agent branch/worktree
bash scripts/agent-branch-start.sh "my-task" "agent-name"

# 2) Claim file ownership before editing
python3 scripts/agent-file-locks.py claim \
  --branch "$(git rev-parse --abbrev-ref HEAD)" \
  path/to/file1 path/to/file2

# 3) Finish and merge back safely
bash scripts/agent-branch-finish.sh --branch "$(git rev-parse --abbrev-ref HEAD)"
```

## Local development

```sh
npm test
node bin/multiagent-safety.js --help
npm pack --dry-run
```
