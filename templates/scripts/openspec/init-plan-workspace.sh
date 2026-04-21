#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <plan-slug> [role ...]"
  echo "Example: $0 stabilize-dashboard planner architect critic executor writer verifier"
  exit 1
fi

PLAN_SLUG="$1"
shift || true

if [[ "$PLAN_SLUG" =~ [^a-z0-9-] ]]; then
  echo "Error: plan slug must be kebab-case (lowercase letters, numbers, hyphens)." >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  ROLES=("$@")
else
  ROLES=(planner architect critic executor writer verifier)
fi

PLAN_DIR="openspec/plan/${PLAN_SLUG}"
mkdir -p "$PLAN_DIR"

write_if_missing() {
  local file="$1"
  shift
  if [[ ! -f "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    cat > "$file" <<EOF
$*
EOF
  fi
}

write_if_missing "$PLAN_DIR/summary.md" "# Plan Summary: ${PLAN_SLUG}

- **Mode:** ralplan
- **Status:** draft

## Context

Describe the problem, constraints, and intended outcomes.
"

write_if_missing "$PLAN_DIR/checkpoints.md" "# Plan Checkpoints: ${PLAN_SLUG}

Chronological checkpoint log for all roles.
"

write_if_missing "$PLAN_DIR/README.md" "# Plan Workspace: ${PLAN_SLUG}

Durable pre-implementation planning workspace.

Each role folder includes a copyable \`prompt.md\` for joined Codex helpers.
Helpers reuse the owner branch/worktree, claim the role files they touch, and
leave PR merge + sandbox cleanup to the owner change lane.

Use this command to update checkpoints:

\`\`\`bash
/opsx:checkpoint ${PLAN_SLUG} <role> <checkpoint-id> <state> <note...>
\`\`\`
"

write_if_missing "$PLAN_DIR/planner/plan.md" "# ExecPlan: ${PLAN_SLUG}

This document is a living plan. Keep progress and decisions current.

## Purpose / Big Picture

## Progress

- [ ] Initial draft
- [ ] Review + iterate
- [ ] Approved for execution

## Surprises & Discoveries

## Decision Log

## Outcomes & Retrospective

## Validation and Acceptance
"

for role in "${ROLES[@]}"; do
  ROLE_DIR="$PLAN_DIR/$role"
  mkdir -p "$ROLE_DIR"

  write_if_missing "$ROLE_DIR/README.md" "# ${role}

Role workspace for \`${role}\`.
"

  write_if_missing "$ROLE_DIR/prompt.md" "# ${role} prompt

You are the \`${role}\` lane for shared plan \`${PLAN_SLUG}\`.

## Scope

- Work inside \`openspec/plan/${PLAN_SLUG}/${role}/\` plus directly-related shared plan files you explicitly claim.
- Reuse the owner's branch/worktree instead of creating a separate sandbox unless the owner says otherwise.

## Ownership

- Before editing, claim this role's files in the shared owner lane:
  \`python3 scripts/agent-file-locks.py claim --branch <owner-branch> openspec/plan/${PLAN_SLUG}/${role}/README.md openspec/plan/${PLAN_SLUG}/${role}/prompt.md openspec/plan/${PLAN_SLUG}/${role}/tasks.md openspec/plan/${PLAN_SLUG}/checkpoints.md\`
- Record branch, worktree, and scope in \`tasks.md\`.
- Do not change another role's files without reassignment.

## Deliverables

- Complete the role checklist in \`tasks.md\`.
- Leave a handoff with files changed, verification, and risks.
- The owner alone runs the change completion flow and sandbox cleanup after change tasks 4.1-4.3 are done.
"

  write_if_missing "$ROLE_DIR/tasks.md" "# ${role} tasks

## Ownership

- [ ] Claim this role's files in the shared owner branch/worktree before editing.
- [ ] Record branch, worktree, and scope for this role.
- [ ] Copy or hand off \`prompt.md\` when another agent joins this role.

## 1. Spec

- [ ] Define requirements and scope for ${role}
- [ ] Confirm acceptance criteria are explicit and testable

## 2. Tests

- [ ] Define verification approach and evidence requirements
- [ ] List concrete commands for verification

## 3. Implementation

- [ ] Execute role-specific deliverables
- [ ] Capture decisions, risks, and handoff notes

## 4. Checkpoints

- [ ] Publish checkpoint update for this role

## 5. Collaboration

- [ ] Leave a role handoff with files changed, verification, and risks.
- [ ] Owner records \`accept\`, \`revise\`, or \`reject\` for joined output, or marks \`N/A\` if no helper joined.

## 6. Completion

- [ ] Keep sandbox cleanup blocked until change tasks 4.1-4.3 are complete.
"
done

echo "[gitguardex] OpenSpec plan workspace ready: ${PLAN_DIR}"
echo "[gitguardex] Roles: ${ROLES[*]}"
