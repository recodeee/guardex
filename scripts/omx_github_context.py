#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FAILED_STATES = {
    "ACTION_REQUIRED",
    "CANCELLED",
    "ERROR",
    "FAILURE",
    "FAILED",
    "TIMED_OUT",
}

LOCK_FILE_RELATIVE = Path(".omx/state/agent-file-locks.json")


class ContextError(RuntimeError):
    pass


@dataclass(slots=True)
class GhAvailability:
    gh_cli: bool
    gh_auth: bool
    remote_context: bool


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(value: str, fallback: str = "context") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or fallback


def run_cmd(args: list[str], cwd: Path, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        raise ContextError(result.stderr.strip() or result.stdout.strip() or f"command failed: {' '.join(args)}")
    return result


def resolve_repo_root() -> Path:
    result = run_cmd(["git", "rev-parse", "--show-toplevel"], Path.cwd())
    return Path(result.stdout.strip()).resolve()


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def gh_cli_available() -> bool:
    result = subprocess.run(["bash", "-lc", "command -v gh >/dev/null 2>&1"], check=False)
    return result.returncode == 0


def gh_auth_available(repo_root: Path) -> bool:
    if not gh_cli_available():
        return False
    result = run_cmd(["gh", "auth", "status"], repo_root, check=False)
    return result.returncode == 0


def local_branch(repo_root: Path) -> str | None:
    result = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], repo_root, check=False)
    branch = result.stdout.strip()
    if not branch or branch == "HEAD":
        return None
    return branch


def branch_exists(repo_root: Path, branch: str) -> bool:
    return run_cmd(["git", "show-ref", "--verify", "--quiet", f"refs/heads/{branch}"], repo_root, check=False).returncode == 0


def remote_branch_exists(repo_root: Path, branch: str) -> bool:
    return run_cmd(["git", "show-ref", "--verify", "--quiet", f"refs/remotes/origin/{branch}"], repo_root, check=False).returncode == 0


def resolve_base_branch(repo_root: Path) -> str:
    configured = run_cmd(["git", "config", "--get", "multiagent.baseBranch"], repo_root, check=False).stdout.strip()
    if configured and branch_exists(repo_root, configured):
        return configured
    current = local_branch(repo_root)
    if current and branch_exists(repo_root, current):
        return current
    for fallback in ("dev", "main", "master"):
        if branch_exists(repo_root, fallback):
            return fallback
    raise ContextError("Unable to infer base branch.")


def normalize_changed_files(raw_files: Any) -> list[str]:
    changed: list[str] = []
    if not isinstance(raw_files, list):
        return changed
    for item in raw_files:
        if isinstance(item, str):
            changed.append(item)
            continue
        if not isinstance(item, dict):
            continue
        path = item.get("path") or item.get("file") or item.get("name")
        if isinstance(path, str) and path:
            changed.append(path)
    return sorted(dict.fromkeys(changed))


def normalize_checks_payload(payload: Any) -> list[dict[str, Any]]:
    items = payload if isinstance(payload, list) else payload.get("checks", []) if isinstance(payload, dict) else []
    normalized: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        state = str(item.get("state") or item.get("status") or item.get("conclusion") or "").upper()
        bucket = str(item.get("bucket") or item.get("workflow") or "")
        if state not in FAILED_STATES:
            continue
        normalized.append(
            {
                "name": str(item.get("name") or bucket or "Unnamed check"),
                "state": state,
                "link": str(item.get("link") or item.get("url") or ""),
                "bucket": bucket,
                "workflow": str(item.get("workflow") or ""),
                "event": str(item.get("event") or ""),
                "details": str(item.get("details") or item.get("summary") or ""),
            }
        )
    return normalized


def build_context_markdown(context: dict[str, Any]) -> str:
    lines = [
        f"# GitHub Context: {context['slug']}",
        "",
        f"- Generated at: {context['generated_at']}",
        f"- Repo root: `{context['repo_root']}`",
        f"- Remote repo: `{context.get('repo') or 'unknown'}`",
        "",
    ]
    warnings = context.get("warnings") or []
    if warnings:
        lines.extend(["## Warnings", ""])
        lines.extend([f"- {warning}" for warning in warnings])
        lines.append("")

    pull_request = context.get("pull_request")
    if isinstance(pull_request, dict):
        lines.extend(
            [
                "## Pull Request",
                "",
                f"- Number: {pull_request.get('number', 'n/a')}",
                f"- Title: {pull_request.get('title', 'n/a')}",
                f"- State: {pull_request.get('state', 'n/a')}",
                f"- Base: `{pull_request.get('base_ref', 'n/a')}`",
                f"- Head: `{pull_request.get('head_ref', 'n/a')}`",
            ]
        )
        if pull_request.get("url"):
            lines.append(f"- URL: {pull_request['url']}")
        if pull_request.get("review_decision"):
            lines.append(f"- Review decision: {pull_request['review_decision']}")
        if pull_request.get("merge_state_status"):
            lines.append(f"- Merge state: {pull_request['merge_state_status']}")
        lines.append("")

    changed_files = context.get("changed_files") or []
    lines.extend(["## Changed Files", ""])
    if changed_files:
        lines.extend([f"- `{path}`" for path in changed_files])
    else:
        lines.append("- None captured")
    lines.append("")

    failed_checks = context.get("failed_checks") or []
    lines.extend(["## Failed Checks", ""])
    if failed_checks:
        for check in failed_checks:
            suffix = f" ({check['state']})" if check.get("state") else ""
            line = f"- {check.get('name', 'Unnamed check')}{suffix}"
            if check.get("link"):
                line += f" — {check['link']}"
            lines.append(line)
    else:
        lines.append("- None")
    lines.append("")

    return "\n".join(lines)


def context_artifact_paths(output_dir: Path, slug: str) -> tuple[Path, Path, Path, Path]:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base_name = f"{slug}-{timestamp}"
    return (
        output_dir / f"{base_name}.json",
        output_dir / f"{base_name}.md",
        output_dir / f"{slug}-latest.json",
        output_dir / f"{slug}-latest.md",
    )


def read_pr_payload(repo_root: Path, pr_ref: str, repo: str | None) -> dict[str, Any]:
    args = [
        "gh",
        "pr",
        "view",
        pr_ref,
        "--json",
        "number,title,body,url,state,isDraft,baseRefName,headRefName,reviewDecision,mergeStateStatus,files",
    ]
    if repo:
        args.extend(["--repo", repo])
    result = run_cmd(args, repo_root)
    return json.loads(result.stdout)


def read_pr_checks(repo_root: Path, pr_ref: str, repo: str | None) -> list[dict[str, Any]]:
    args = ["gh", "pr", "checks", pr_ref, "--json", "name,link,bucket,state,workflow,event"]
    if repo:
        args.extend(["--repo", repo])
    result = run_cmd(args, repo_root)
    payload = json.loads(result.stdout)
    if not isinstance(payload, list):
        return []
    return payload


def build_sync_context(
    *,
    repo_root: Path,
    repo: str | None,
    branch: str | None,
    pr_ref: str | None,
    pr_payload: dict[str, Any] | None,
    checks_payload: list[dict[str, Any]] | None,
    warnings: list[str],
    availability: GhAvailability,
) -> dict[str, Any]:
    slug_parts = []
    if pr_ref:
        slug_parts.append(f"pr-{pr_ref}")
    elif branch:
        slug_parts.append(branch.replace("/", "-"))
    slug = slugify("-".join(slug_parts) or "github-context")

    pull_request = None
    changed_files: list[str] = []
    if pr_payload:
        pull_request = {
            "number": pr_payload.get("number"),
            "title": pr_payload.get("title"),
            "body": pr_payload.get("body"),
            "url": pr_payload.get("url"),
            "state": pr_payload.get("state"),
            "is_draft": pr_payload.get("isDraft"),
            "base_ref": pr_payload.get("baseRefName"),
            "head_ref": pr_payload.get("headRefName"),
            "review_decision": pr_payload.get("reviewDecision"),
            "merge_state_status": pr_payload.get("mergeStateStatus"),
        }
        changed_files = normalize_changed_files(pr_payload.get("files"))

    return {
        "version": 1,
        "generated_at": now_iso(),
        "slug": slug,
        "repo_root": str(repo_root),
        "repo": repo,
        "request": {
            "branch": branch,
            "pr": pr_ref,
        },
        "availability": {
            "gh_cli": availability.gh_cli,
            "gh_auth": availability.gh_auth,
            "remote_context": availability.remote_context,
        },
        "warnings": warnings,
        "pull_request": pull_request,
        "changed_files": changed_files,
        "failed_checks": normalize_checks_payload(checks_payload or []),
    }


def write_context_bundle(output_dir: Path, context: dict[str, Any]) -> tuple[Path, Path]:
    json_path, md_path, latest_json, latest_md = context_artifact_paths(output_dir, context["slug"])
    write_json(json_path, context)
    markdown = build_context_markdown(context)
    write_text(md_path, markdown)
    write_json(latest_json, context)
    write_text(latest_md, markdown)
    return latest_json, latest_md


def build_fix_tasks(context: dict[str, Any]) -> dict[str, Any]:
    tasks = []
    for index, check in enumerate(context.get("failed_checks") or [], start=1):
        title = str(check.get("name") or f"failed-check-{index}")
        task_slug = slugify(title, f"failed-check-{index}")
        tasks.append(
            {
                "id": task_slug,
                "title": f"Fix failing check: {title}",
                "state": check.get("state"),
                "workflow": check.get("workflow"),
                "bucket": check.get("bucket"),
                "link": check.get("link"),
                "instructions": [
                    "Reproduce the failure locally if possible.",
                    "Inspect the touched files and adjacent tests for the failed area.",
                    "Patch the smallest viable fix, then rerun verification.",
                ],
            }
        )
    return {
        "version": 1,
        "generated_at": now_iso(),
        "slug": context["slug"],
        "source_context": context,
        "tasks": tasks,
    }


def build_fix_tasks_markdown(tasks_payload: dict[str, Any]) -> str:
    lines = [
        f"# Fix Tasks: {tasks_payload['slug']}",
        "",
        f"- Generated at: {tasks_payload['generated_at']}",
        "",
    ]
    tasks = tasks_payload.get("tasks") or []
    if not tasks:
        lines.append("- No failed checks were available.")
        return "\n".join(lines)

    for task in tasks:
        lines.extend(
            [
                f"## {task['title']}",
                "",
                f"- State: {task.get('state') or 'unknown'}",
                f"- Workflow: {task.get('workflow') or 'unknown'}",
            ]
        )
        if task.get("link"):
            lines.append(f"- Link: {task['link']}")
        lines.append("- Suggested loop:")
        for instruction in task.get("instructions") or []:
            lines.append(f"  - {instruction}")
        lines.append("")
    return "\n".join(lines)


def write_fix_tasks(output_dir: Path, tasks_payload: dict[str, Any]) -> tuple[Path, Path]:
    slug = tasks_payload["slug"]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"{slug}-fix-tasks-{timestamp}.json"
    md_path = output_dir / f"{slug}-fix-tasks-{timestamp}.md"
    latest_json = output_dir / f"{slug}-fix-tasks-latest.json"
    latest_md = output_dir / f"{slug}-fix-tasks-latest.md"
    write_json(json_path, tasks_payload)
    markdown = build_fix_tasks_markdown(tasks_payload)
    write_text(md_path, markdown)
    write_json(latest_json, tasks_payload)
    write_text(latest_md, markdown)
    return latest_json, latest_md


def parse_worktree_list(repo_root: Path) -> list[tuple[str, str]]:
    result = run_cmd(["git", "worktree", "list", "--porcelain"], repo_root)
    items: list[tuple[str, str]] = []
    current_worktree: str | None = None
    current_branch: str | None = None
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            if current_worktree and current_branch:
                items.append((current_branch, current_worktree))
            current_worktree = None
            current_branch = None
            continue
        if line.startswith("worktree "):
            current_worktree = line.split(" ", 1)[1]
        elif line.startswith("branch "):
            branch_ref = line.split(" ", 1)[1]
            current_branch = branch_ref.removeprefix("refs/heads/")
    if current_worktree and current_branch:
        items.append((current_branch, current_worktree))
    return items


def resolve_worktree_for_branch(repo_root: Path, branch: str) -> Path | None:
    for candidate_branch, candidate_worktree in parse_worktree_list(repo_root):
        if candidate_branch == branch:
            return Path(candidate_worktree)
    return None


def resolve_compare_ref(repo_root: Path, base_branch: str) -> str:
    return f"origin/{base_branch}" if remote_branch_exists(repo_root, base_branch) else base_branch


def changed_files_for_branch(repo_root: Path, branch: str, compare_ref: str) -> list[str]:
    merge_base = run_cmd(["git", "merge-base", compare_ref, branch], repo_root).stdout.strip()
    result = run_cmd(["git", "diff", "--name-only", f"{merge_base}..{branch}"], repo_root)
    return sorted({line.strip() for line in result.stdout.splitlines() if line.strip()})


def load_locks(repo_root: Path) -> dict[str, dict[str, Any]]:
    path = repo_root / LOCK_FILE_RELATIVE
    if not path.exists():
        return {}
    payload = load_json(path)
    if not isinstance(payload, dict):
        return {}
    locks = payload.get("locks")
    return locks if isinstance(locks, dict) else {}


def build_conflict_payload(repo_root: Path, branch: str, base_branch: str) -> dict[str, Any]:
    compare_ref = resolve_compare_ref(repo_root, base_branch)
    source_changed = changed_files_for_branch(repo_root, branch, compare_ref)
    other_branches = []
    for other_branch, _worktree in parse_worktree_list(repo_root):
        if other_branch == branch or not other_branch.startswith("agent/"):
            continue
        if not branch_exists(repo_root, other_branch):
            continue
        other_changed = changed_files_for_branch(repo_root, other_branch, compare_ref)
        overlap = sorted(set(source_changed).intersection(other_changed))
        if overlap:
            other_branches.append({"branch": other_branch, "files": overlap})

    locks = load_locks(repo_root)
    foreign_locks = []
    for file_path in source_changed:
        entry = locks.get(file_path)
        if not isinstance(entry, dict):
            continue
        owner = str(entry.get("branch") or "")
        if owner and owner != branch:
            foreign_locks.append({"file": file_path, "branch": owner})

    return {
        "version": 1,
        "generated_at": now_iso(),
        "branch": branch,
        "base_branch": base_branch,
        "compare_ref": compare_ref,
        "source_changed_files": source_changed,
        "overlaps": other_branches,
        "foreign_locks": foreign_locks,
        "passed": not other_branches and not foreign_locks,
    }


def build_conflict_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Conflict Prediction: {payload['branch']}",
        "",
        f"- Base branch: `{payload['base_branch']}`",
        f"- Compare ref: `{payload['compare_ref']}`",
        f"- Passed: `{payload['passed']}`",
        "",
        "## Source Changed Files",
        "",
    ]
    changed_files = payload.get("source_changed_files") or []
    if changed_files:
        lines.extend([f"- `{path}`" for path in changed_files])
    else:
        lines.append("- None")
    lines.append("")
    lines.extend(["## Overlaps", ""])
    overlaps = payload.get("overlaps") or []
    if overlaps:
        for overlap in overlaps:
            lines.append(f"- {overlap['branch']}: {', '.join(overlap['files'])}")
    else:
        lines.append("- None")
    lines.append("")
    lines.extend(["## Foreign Locks", ""])
    foreign_locks = payload.get("foreign_locks") or []
    if foreign_locks:
        for lock in foreign_locks:
            lines.append(f"- `{lock['file']}` owned by `{lock['branch']}`")
    else:
        lines.append("- None")
    lines.append("")
    return "\n".join(lines)


def write_conflict_bundle(output_dir: Path, payload: dict[str, Any]) -> tuple[Path, Path]:
    slug = slugify(payload["branch"].replace("/", "__"), "branch")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"{slug}-conflict-{timestamp}.json"
    md_path = output_dir / f"{slug}-conflict-{timestamp}.md"
    latest_json = output_dir / f"{slug}-conflict-latest.json"
    latest_md = output_dir / f"{slug}-conflict-latest.md"
    write_json(json_path, payload)
    markdown = build_conflict_markdown(payload)
    write_text(md_path, markdown)
    write_json(latest_json, payload)
    write_text(latest_md, markdown)
    return latest_json, latest_md


def is_clean_worktree(path: Path) -> bool:
    result = run_cmd(["git", "status", "--porcelain"], path, check=False)
    return result.returncode == 0 and not result.stdout.strip()


def build_merge_gate_payload(
    *,
    repo_root: Path,
    branch: str,
    base_branch: str,
    require_remote: bool,
    pr_ref: str | None,
    repo: str | None,
    context_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    blockers: list[str] = []
    worktree = resolve_worktree_for_branch(repo_root, branch)
    worktree_path = str(worktree) if worktree else None
    clean = is_clean_worktree(worktree) if worktree else False
    if worktree is None:
        blockers.append(f"No active worktree found for branch '{branch}'.")
    elif not clean:
        blockers.append(f"Source worktree is dirty for branch '{branch}'.")

    local_payload = build_conflict_payload(repo_root, branch, base_branch)
    if local_payload.get("overlaps"):
        blockers.append("Predicted merge conflicts with other active agent branches.")
    if local_payload.get("foreign_locks"):
        blockers.append("Files changed by this branch are locked by another branch.")

    remote: dict[str, Any] = {
        "required": require_remote,
        "available": False,
        "pull_request": None,
        "failed_checks": [],
        "warnings": [],
    }
    if context_payload:
        remote["available"] = True
        remote["pull_request"] = context_payload.get("pull_request")
        remote["failed_checks"] = context_payload.get("failed_checks") or []
    elif require_remote:
        warnings: list[str] = []
        availability = GhAvailability(
            gh_cli=gh_cli_available(),
            gh_auth=gh_auth_available(repo_root),
            remote_context=False,
        )
        if availability.gh_cli and availability.gh_auth and pr_ref:
            try:
                pr_payload = read_pr_payload(repo_root, pr_ref, repo)
                checks_payload = read_pr_checks(repo_root, pr_ref, repo)
                remote_context = build_sync_context(
                    repo_root=repo_root,
                    repo=repo,
                    branch=branch,
                    pr_ref=pr_ref,
                    pr_payload=pr_payload,
                    checks_payload=checks_payload,
                    warnings=warnings,
                    availability=GhAvailability(True, True, True),
                )
                remote["available"] = True
                remote["pull_request"] = remote_context.get("pull_request")
                remote["failed_checks"] = remote_context.get("failed_checks") or []
            except ContextError as exc:
                warnings.append(str(exc))
        else:
            warnings.append("GitHub CLI context was unavailable for remote gates.")
        remote["warnings"] = warnings

    if require_remote:
        if not remote["available"]:
            blockers.append("Remote gates are required but GitHub context was unavailable.")
        failed_checks = remote.get("failed_checks") or []
        if failed_checks:
            blockers.append(f"Remote checks are failing ({len(failed_checks)} failing check(s)).")

    return {
        "version": 1,
        "generated_at": now_iso(),
        "branch": branch,
        "base_branch": base_branch,
        "passed": not blockers,
        "blockers": blockers,
        "local": {
            "worktree": worktree_path,
            "clean": clean,
            "conflicts": local_payload,
        },
        "remote": remote,
    }


def build_merge_gate_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Merge Gates: {payload['branch']}",
        "",
        f"- Base branch: `{payload['base_branch']}`",
        f"- Passed: `{payload['passed']}`",
        "",
        "## Blockers",
        "",
    ]
    blockers = payload.get("blockers") or []
    if blockers:
        lines.extend([f"- {blocker}" for blocker in blockers])
    else:
        lines.append("- None")
    lines.append("")

    local_payload = payload.get("local") or {}
    lines.extend(
        [
            "## Local Gates",
            "",
            f"- Worktree: `{local_payload.get('worktree') or 'missing'}`",
            f"- Clean: `{local_payload.get('clean')}`",
            "",
        ]
    )

    remote = payload.get("remote") or {}
    lines.extend(
        [
            "## Remote Gates",
            "",
            f"- Required: `{remote.get('required')}`",
            f"- Available: `{remote.get('available')}`",
        ]
    )
    failed_checks = remote.get("failed_checks") or []
    if failed_checks:
        lines.append("- Failed checks:")
        for check in failed_checks:
            lines.append(f"  - {check.get('name', 'Unnamed check')} ({check.get('state', 'unknown')})")
    else:
        lines.append("- Failed checks: none")
    lines.append("")
    return "\n".join(lines)


def write_merge_gate_bundle(output_dir: Path, payload: dict[str, Any]) -> tuple[Path, Path]:
    slug = slugify(payload["branch"].replace("/", "__"), "branch")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"{slug}-merge-gates-{timestamp}.json"
    md_path = output_dir / f"{slug}-merge-gates-{timestamp}.md"
    latest_json = output_dir / f"{slug}-merge-gates-latest.json"
    latest_md = output_dir / f"{slug}-merge-gates-latest.md"
    write_json(json_path, payload)
    markdown = build_merge_gate_markdown(payload)
    write_text(md_path, markdown)
    write_json(latest_json, payload)
    write_text(latest_md, markdown)
    return latest_json, latest_md


def write_context_pack_bundle(output_dir: Path, payload: dict[str, Any]) -> Path:
    slug = slugify(payload.get("slug") or "context-pack", "context-pack")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    json_path = output_dir / f"{slug}-pack-{timestamp}.json"
    latest_json = output_dir / f"{slug}-pack-latest.json"
    write_json(json_path, payload)
    write_json(latest_json, payload)
    return latest_json


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")


def resolve_latest_file(path: Path, fallback_glob: str) -> Path | None:
    if path.exists():
        return path
    parent = path.parent
    if not parent.exists():
        return None
    candidates = sorted(parent.glob(fallback_glob), key=lambda item: item.stat().st_mtime, reverse=True)
    if not candidates:
        return None
    return candidates[0]


def load_optional_json(path: Path, *, warnings: list[str], label: str) -> dict[str, Any] | None:
    try:
        payload = load_json(path)
    except FileNotFoundError:
        warnings.append(f"{label} file was not found: {path}")
        return None
    except json.JSONDecodeError as exc:
        warnings.append(f"{label} file is invalid JSON ({path}): {exc}")
        return None
    if isinstance(payload, dict):
        return payload
    warnings.append(f"{label} file does not contain an object payload: {path}")
    return None


def build_context_pack_payload(
    *,
    slug: str,
    branch: str | None,
    base_branch: str | None,
    context_payload: dict[str, Any] | None,
    fix_tasks_payload: dict[str, Any] | None,
    conflict_payload: dict[str, Any] | None,
    merge_gate_payload: dict[str, Any] | None,
    extra_files: list[str],
    warnings: list[str],
) -> dict[str, Any]:
    changed_files = context_payload.get("changed_files") if isinstance(context_payload, dict) else []
    failed_checks = context_payload.get("failed_checks") if isinstance(context_payload, dict) else []
    fix_tasks = fix_tasks_payload.get("tasks") if isinstance(fix_tasks_payload, dict) else []
    blockers = merge_gate_payload.get("blockers") if isinstance(merge_gate_payload, dict) else []
    return {
        "version": 1,
        "generated_at": now_iso(),
        "slug": slug,
        "branch": branch,
        "base_branch": base_branch,
        "warnings": warnings,
        "summary": {
            "changed_file_count": len(changed_files) if isinstance(changed_files, list) else 0,
            "failed_check_count": len(failed_checks) if isinstance(failed_checks, list) else 0,
            "fix_task_count": len(fix_tasks) if isinstance(fix_tasks, list) else 0,
            "blocker_count": len(blockers) if isinstance(blockers, list) else 0,
        },
        "sources": {
            "context": context_payload,
            "fix_tasks": fix_tasks_payload,
            "conflict_prediction": conflict_payload,
            "merge_gate": merge_gate_payload,
            "extra_files": extra_files,
        },
    }


def cmd_sync(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root()
    output_dir = ensure_dir(Path(args.output_dir) if args.output_dir else repo_root / ".omx" / "context" / "github")
    warnings: list[str] = []
    pr_payload = load_json(Path(args.input_json)) if args.input_json else None
    checks_payload = load_json(Path(args.checks_json)) if args.checks_json else None

    availability = GhAvailability(
        gh_cli=gh_cli_available(),
        gh_auth=gh_auth_available(repo_root),
        remote_context=False,
    )

    if not pr_payload and args.pr and availability.gh_cli and availability.gh_auth:
        try:
            pr_payload = read_pr_payload(repo_root, args.pr, args.repo)
            availability.remote_context = True
        except ContextError as exc:
            warnings.append(str(exc))
    elif args.pr and not availability.gh_cli:
        warnings.append("GitHub CLI is not installed; wrote local-only context.")
    elif args.pr and availability.gh_cli and not availability.gh_auth:
        warnings.append("GitHub CLI is not authenticated; wrote local-only context.")

    if checks_payload is None and args.pr and availability.remote_context:
        try:
            checks_payload = read_pr_checks(repo_root, args.pr, args.repo)
        except ContextError as exc:
            warnings.append(str(exc))

    branch = args.branch or local_branch(repo_root)
    context = build_sync_context(
        repo_root=repo_root,
        repo=args.repo,
        branch=branch,
        pr_ref=args.pr,
        pr_payload=pr_payload,
        checks_payload=checks_payload or [],
        warnings=warnings,
        availability=availability,
    )
    latest_json, latest_md = write_context_bundle(output_dir, context)

    if not args.skip_ingest:
        tasks_payload = build_fix_tasks(context)
        write_fix_tasks(output_dir, tasks_payload)

    print(f"Context JSON: {latest_json}")
    print(f"Context Markdown: {latest_md}")
    return 0


def cmd_ingest_checks(args: argparse.Namespace) -> int:
    if args.context_file:
        context = load_json(Path(args.context_file))
    else:
        context = {
            "slug": slugify(args.slug or "github-context"),
            "failed_checks": normalize_checks_payload(load_json(Path(args.checks_json))),
        }
    output_dir = ensure_dir(Path(args.output_dir) if args.output_dir else resolve_repo_root() / ".omx" / "context" / "github")
    payload = build_fix_tasks(context)
    latest_json, latest_md = write_fix_tasks(output_dir, payload)
    print(f"Fix tasks JSON: {latest_json}")
    print(f"Fix tasks Markdown: {latest_md}")
    return 0


def cmd_conflict_predict(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root()
    branch = args.branch or local_branch(repo_root)
    if not branch:
        raise ContextError("Unable to infer current branch for conflict prediction.")
    base_branch = args.base or resolve_base_branch(repo_root)
    output_dir = ensure_dir(Path(args.output_dir) if args.output_dir else repo_root / ".omx" / "state" / "merge-gates")
    payload = build_conflict_payload(repo_root, branch, base_branch)
    latest_json, latest_md = write_conflict_bundle(output_dir, payload)
    print(f"Conflict JSON: {latest_json}")
    print(f"Conflict Markdown: {latest_md}")
    return 0 if payload.get("passed") else 1


def cmd_merge_gate(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root()
    branch = args.branch or local_branch(repo_root)
    if not branch:
        raise ContextError("Unable to infer branch for merge gates.")
    base_branch = args.base or resolve_base_branch(repo_root)
    context_payload = load_json(Path(args.context_file)) if args.context_file else None
    payload = build_merge_gate_payload(
        repo_root=repo_root,
        branch=branch,
        base_branch=base_branch,
        require_remote=args.require_remote,
        pr_ref=args.pr,
        repo=args.repo,
        context_payload=context_payload,
    )
    output_dir = ensure_dir(Path(args.output_dir) if args.output_dir else repo_root / ".omx" / "state" / "merge-gates")
    latest_json, latest_md = write_merge_gate_bundle(output_dir, payload)
    print(f"Merge gate JSON: {latest_json}")
    print(f"Merge gate Markdown: {latest_md}")
    return 0 if payload.get("passed") else 1


def cmd_pack(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root()
    warnings: list[str] = []

    branch = args.branch or local_branch(repo_root)
    base_branch = args.base or resolve_base_branch(repo_root)
    slug = slugify(args.slug or (branch or "context-pack"), "context-pack")

    context_path = Path(args.context_file) if args.context_file else repo_root / ".omx" / "context" / "github" / "github-context-latest.json"
    context_candidate = resolve_latest_file(context_path, "*-latest.json")
    context_payload = (
        load_optional_json(context_candidate, warnings=warnings, label="context")
        if context_candidate
        else None
    )
    if context_candidate is None:
        warnings.append("No GitHub context artifact was available.")

    fix_path = Path(args.fix_tasks_file) if args.fix_tasks_file else repo_root / ".omx" / "context" / "github" / f"{slug}-fix-tasks-latest.json"
    fix_candidate = resolve_latest_file(fix_path, "*-fix-tasks-latest.json")
    fix_payload = load_optional_json(fix_candidate, warnings=warnings, label="fix tasks") if fix_candidate else None
    if fix_candidate is None:
        warnings.append("No fix-task artifact was available.")

    conflict_path = Path(args.conflict_file) if args.conflict_file else repo_root / ".omx" / "state" / "merge-gates" / f"{slugify((branch or 'branch').replace('/', '__'), 'branch')}-conflict-latest.json"
    conflict_candidate = resolve_latest_file(conflict_path, "*-conflict-latest.json")
    conflict_payload = (
        load_optional_json(conflict_candidate, warnings=warnings, label="conflict prediction")
        if conflict_candidate
        else None
    )

    merge_gate_path = Path(args.merge_gate_file) if args.merge_gate_file else repo_root / ".omx" / "state" / "merge-gates" / f"{slugify((branch or 'branch').replace('/', '__'), 'branch')}-merge-gates-latest.json"
    merge_gate_candidate = resolve_latest_file(merge_gate_path, "*-merge-gates-latest.json")
    merge_gate_payload = (
        load_optional_json(merge_gate_candidate, warnings=warnings, label="merge gate")
        if merge_gate_candidate
        else None
    )

    output_dir = ensure_dir(Path(args.output_dir) if args.output_dir else repo_root / ".omx" / "context" / "packs")
    extra_files = [str(Path(item).resolve()) for item in args.include_file or []]
    pack_payload = build_context_pack_payload(
        slug=slug,
        branch=branch,
        base_branch=base_branch,
        context_payload=context_payload,
        fix_tasks_payload=fix_payload,
        conflict_payload=conflict_payload,
        merge_gate_payload=merge_gate_payload,
        extra_files=extra_files,
        warnings=warnings,
    )
    latest_json = write_context_pack_bundle(output_dir, pack_payload)
    print(f"Context pack JSON: {latest_json}")
    return 0


def cmd_capture_learning(args: argparse.Namespace) -> int:
    repo_root = resolve_repo_root()
    branch = args.branch or local_branch(repo_root)
    if not branch:
        raise ContextError("Unable to infer branch for learning capture.")

    base_branch = args.base or resolve_base_branch(repo_root)
    slug = slugify(args.slug or branch.replace("/", "__"), "learning")
    learning_dir = ensure_dir(Path(args.output_dir) if args.output_dir else repo_root / ".omx" / "learning")
    output_file = Path(args.output_file) if args.output_file else learning_dir / f"{slug}.jsonl"

    context_payload = load_json(Path(args.context_file)) if args.context_file else None
    merge_gate_payload = load_json(Path(args.merge_gate_file)) if args.merge_gate_file else None

    entry: dict[str, Any] = {
        "version": 1,
        "captured_at": now_iso(),
        "slug": slug,
        "outcome": args.outcome,
        "summary": args.summary or "",
        "repo": args.repo,
        "branch": branch,
        "base_branch": base_branch,
        "pull_request": args.pr,
        "context": context_payload if isinstance(context_payload, dict) else None,
        "merge_gate": merge_gate_payload if isinstance(merge_gate_payload, dict) else None,
    }
    append_jsonl(output_file, entry)
    print(f"Learning JSONL: {output_file}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OMX GitHub context and merge-gate helpers")
    subparsers = parser.add_subparsers(dest="command", required=True)

    sync = subparsers.add_parser("sync", help="Write normalized GitHub context artifacts")
    sync.add_argument("--branch", help="Branch associated with the context")
    sync.add_argument("--pr", help="Pull request number, URL, or branch ref")
    sync.add_argument("--repo", help="GitHub repo override (owner/name)")
    sync.add_argument("--input-json", help="Fixture PR payload JSON")
    sync.add_argument("--checks-json", help="Fixture checks payload JSON")
    sync.add_argument("--output-dir", help="Artifact directory")
    sync.add_argument("--skip-ingest", action="store_true", help="Skip generating fix tasks from failed checks")
    sync.set_defaults(func=cmd_sync)

    ingest = subparsers.add_parser("ingest-checks", help="Turn failed checks into fix-task artifacts")
    ingest.add_argument("--context-file", help="Existing sync context JSON")
    ingest.add_argument("--checks-json", help="Checks fixture JSON when no context file is provided")
    ingest.add_argument("--slug", help="Context slug when ingesting checks JSON directly")
    ingest.add_argument("--output-dir", help="Artifact directory")
    ingest.set_defaults(func=cmd_ingest_checks)

    conflict = subparsers.add_parser("conflict-predict", help="Predict branch conflicts and ownership issues")
    conflict.add_argument("--branch", help="Branch to inspect")
    conflict.add_argument("--base", help="Base branch to compare against")
    conflict.add_argument("--output-dir", help="Artifact directory")
    conflict.set_defaults(func=cmd_conflict_predict)

    gate = subparsers.add_parser("merge-gate", help="Evaluate local and remote merge-quality gates")
    gate.add_argument("--branch", help="Branch to inspect")
    gate.add_argument("--base", help="Base branch to compare against")
    gate.add_argument("--pr", help="Pull request number, URL, or branch ref")
    gate.add_argument("--repo", help="GitHub repo override (owner/name)")
    gate.add_argument("--context-file", help="Existing sync context JSON to reuse for remote checks")
    gate.add_argument("--require-remote", action="store_true", help="Fail closed when remote checks are unavailable or failing")
    gate.add_argument("--output-dir", help="Artifact directory")
    gate.set_defaults(func=cmd_merge_gate)

    pack = subparsers.add_parser("pack", help="Assemble a startup context pack from latest artifacts")
    pack.add_argument("--slug", help="Context pack slug")
    pack.add_argument("--branch", help="Branch associated with the pack")
    pack.add_argument("--base", help="Base branch associated with the pack")
    pack.add_argument("--context-file", help="Existing sync context JSON")
    pack.add_argument("--fix-tasks-file", help="Existing fix-task JSON")
    pack.add_argument("--conflict-file", help="Existing conflict prediction JSON")
    pack.add_argument("--merge-gate-file", help="Existing merge gate JSON")
    pack.add_argument("--include-file", action="append", help="Additional file paths to include as references")
    pack.add_argument("--output-dir", help="Artifact directory")
    pack.set_defaults(func=cmd_pack)

    learning = subparsers.add_parser("capture-learning", help="Append post-merge learning evidence to JSONL")
    learning.add_argument("--slug", help="Learning artifact slug")
    learning.add_argument("--branch", help="Branch associated with the captured learning")
    learning.add_argument("--base", help="Base branch associated with the captured learning")
    learning.add_argument("--pr", help="Pull request number/url/reference")
    learning.add_argument("--repo", help="GitHub repo override (owner/name)")
    learning.add_argument("--summary", help="Operator summary of what changed/fixed")
    learning.add_argument("--outcome", default="merged", help="Outcome label (default: merged)")
    learning.add_argument("--context-file", help="Optional context artifact JSON")
    learning.add_argument("--merge-gate-file", help="Optional merge gate artifact JSON")
    learning.add_argument("--output-dir", help="Learning directory")
    learning.add_argument("--output-file", help="Explicit JSONL file path")
    learning.set_defaults(func=cmd_capture_learning)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except ContextError as exc:
        print(f"[omx-github-context] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
