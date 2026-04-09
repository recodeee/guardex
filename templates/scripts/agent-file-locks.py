#!/usr/bin/env python3
"""Per-file lock registry for concurrent agent branches.

Usage examples:
  python3 scripts/agent-file-locks.py claim --branch agent/a path/to/file1 path/to/file2
  python3 scripts/agent-file-locks.py validate --branch agent/a --staged
  python3 scripts/agent-file-locks.py release --branch agent/a
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LOCK_FILE_RELATIVE = Path('.omx/state/agent-file-locks.json')


@dataclass
class LockEntry:
    branch: str
    claimed_at: str


class LockError(Exception):
    pass


def run_git(args: list[str], cwd: Path) -> str:
    result = subprocess.run(
        ['git', *args],
        cwd=str(cwd),
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode != 0:
        raise LockError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def resolve_repo_root() -> Path:
    output = run_git(['rev-parse', '--show-toplevel'], cwd=Path.cwd())
    return Path(output).resolve()


def normalize_repo_path(repo_root: Path, raw_path: str) -> str:
    joined = Path(raw_path)
    abs_path = joined if joined.is_absolute() else (repo_root / joined)
    normalized_abs = Path(os.path.normpath(str(abs_path)))
    try:
        relative = normalized_abs.relative_to(repo_root)
    except ValueError as exc:
        raise LockError(f"Path is outside repository: {raw_path}") from exc
    return relative.as_posix()


def lock_file_path(repo_root: Path) -> Path:
    return repo_root / LOCK_FILE_RELATIVE


def load_state(repo_root: Path) -> dict[str, Any]:
    path = lock_file_path(repo_root)
    if not path.exists():
        return {'locks': {}}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise LockError(f'Lock file is invalid JSON: {path}') from exc

    if not isinstance(data, dict):
        return {'locks': {}}
    locks = data.get('locks', {})
    if not isinstance(locks, dict):
        return {'locks': {}}
    return {'locks': locks}


def write_state(repo_root: Path, state: dict[str, Any]) -> None:
    path = lock_file_path(repo_root)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True) + '\n')
    tmp.replace(path)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def staged_files(repo_root: Path) -> list[str]:
    out = run_git(['diff', '--cached', '--name-only', '--diff-filter=ACMRDTUXB'], cwd=repo_root)
    if not out:
        return []
    return [line.strip() for line in out.splitlines() if line.strip()]


def cmd_claim(args: argparse.Namespace, repo_root: Path) -> int:
    state = load_state(repo_root)
    locks: dict[str, dict[str, Any]] = state['locks']

    files = [normalize_repo_path(repo_root, p) for p in args.files]
    conflicts: list[tuple[str, str]] = []

    for file_path in files:
        existing = locks.get(file_path)
        if existing and existing.get('branch') != args.branch:
            conflicts.append((file_path, str(existing.get('branch'))))

    if conflicts:
        print('[agent-file-locks] Cannot claim files already locked by other branches:', file=sys.stderr)
        for file_path, owner_branch in conflicts:
            print(f'  - {file_path} (locked by {owner_branch})', file=sys.stderr)
        return 1

    for file_path in files:
        locks[file_path] = LockEntry(branch=args.branch, claimed_at=now_iso()).__dict__

    write_state(repo_root, state)
    print(f"[agent-file-locks] Claimed {len(files)} file(s) for {args.branch}.")
    return 0


def cmd_release(args: argparse.Namespace, repo_root: Path) -> int:
    state = load_state(repo_root)
    locks: dict[str, dict[str, Any]] = state['locks']

    to_release: set[str]
    if args.files:
        requested = {normalize_repo_path(repo_root, p) for p in args.files}
        to_release = {p for p in requested if locks.get(p, {}).get('branch') == args.branch}
    else:
        to_release = {p for p, entry in locks.items() if entry.get('branch') == args.branch}

    for file_path in to_release:
        locks.pop(file_path, None)

    write_state(repo_root, state)
    print(f"[agent-file-locks] Released {len(to_release)} file(s) for {args.branch}.")
    return 0


def cmd_status(args: argparse.Namespace, repo_root: Path) -> int:
    state = load_state(repo_root)
    locks: dict[str, dict[str, Any]] = state['locks']

    rows: list[tuple[str, str, str]] = []
    for file_path, entry in sorted(locks.items()):
        branch = str(entry.get('branch', ''))
        if args.branch and branch != args.branch:
            continue
        claimed_at = str(entry.get('claimed_at', ''))
        rows.append((file_path, branch, claimed_at))

    if not rows:
        print('[agent-file-locks] No active locks.')
        return 0

    print('[agent-file-locks] Active locks:')
    for file_path, branch, claimed_at in rows:
        print(f'  - {file_path} | {branch} | {claimed_at}')
    return 0


def cmd_validate(args: argparse.Namespace, repo_root: Path) -> int:
    state = load_state(repo_root)
    locks: dict[str, dict[str, Any]] = state['locks']

    files = staged_files(repo_root) if args.staged else [normalize_repo_path(repo_root, p) for p in args.files]

    files = [f for f in files if f and f != LOCK_FILE_RELATIVE.as_posix()]
    if not files:
        return 0

    missing: list[str] = []
    foreign: list[tuple[str, str]] = []

    for file_path in files:
        entry = locks.get(file_path)
        if not entry:
            missing.append(file_path)
            continue
        owner = str(entry.get('branch', ''))
        if owner != args.branch:
            foreign.append((file_path, owner))

    if not missing and not foreign:
        return 0

    print('[agent-file-locks] Commit blocked: staged files must be claimed by this branch first.', file=sys.stderr)
    if missing:
        print('  Unclaimed files:', file=sys.stderr)
        for file_path in missing:
            print(f'    - {file_path}', file=sys.stderr)
    if foreign:
        print('  Files claimed by another branch:', file=sys.stderr)
        for file_path, owner in foreign:
            print(f'    - {file_path} (owner: {owner})', file=sys.stderr)

    print('\nClaim files with:', file=sys.stderr)
    print(f'  python3 scripts/agent-file-locks.py claim --branch "{args.branch}" <file...>', file=sys.stderr)
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='Concurrent agent file-lock utility')
    sub = parser.add_subparsers(dest='command', required=True)

    claim = sub.add_parser('claim', help='Claim file locks for a branch')
    claim.add_argument('--branch', required=True, help='Owner branch name (e.g., agent/foo/...)')
    claim.add_argument('files', nargs='+', help='Files to claim (repo-relative or absolute)')

    release = sub.add_parser('release', help='Release file locks for a branch')
    release.add_argument('--branch', required=True, help='Owner branch name')
    release.add_argument('files', nargs='*', help='Optional files; omit to release all branch locks')

    status = sub.add_parser('status', help='Show lock status')
    status.add_argument('--branch', help='Filter by branch')

    validate = sub.add_parser('validate', help='Validate staged files are locked by branch')
    validate.add_argument('--branch', required=True, help='Owner branch name')
    validate.add_argument('--staged', action='store_true', help='Validate staged files from git index')
    validate.add_argument('files', nargs='*', help='Files to validate when --staged is not used')

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    try:
        repo_root = resolve_repo_root()
        if args.command == 'claim':
            return cmd_claim(args, repo_root)
        if args.command == 'release':
            return cmd_release(args, repo_root)
        if args.command == 'status':
            return cmd_status(args, repo_root)
        if args.command == 'validate':
            if not args.staged and not args.files:
                raise LockError('validate requires --staged or one or more file paths')
            return cmd_validate(args, repo_root)
        raise LockError(f'Unknown command: {args.command}')
    except LockError as exc:
        print(f'[agent-file-locks] {exc}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
