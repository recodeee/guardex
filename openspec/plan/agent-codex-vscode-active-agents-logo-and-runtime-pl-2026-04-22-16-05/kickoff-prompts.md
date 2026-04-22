# Kickoff Prompts (Copy/Paste)

Wave splitting is inactive for this completed plan.

Reason:
- The lane converged under one owner.
- The runtime audit stayed delta-only and did not create 3 independent execution packets.
- Both the implementation lane (`PR #322`) and cleanup bookkeeping lane (`PR #326`) are already `MERGED`.

Use these only if a future follow-up explicitly reopens parallel execution.

## Prompt A — Wave A (Primary lane)

```text
You own Wave-A for plan `agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05` in /home/deadpool/Documents/recodee/gitguardex.

Goal:
Implement the assigned Wave-A scope and return verification evidence.

Hard constraints:
- You are not alone in the codebase; do not revert others' work.
- Stay in your owned files/modules only.
- Record explicit handoff notes for integration.

Owned scope:
- <fill owned files/modules>

Verification:
- <fill commands>

Handoff format:
- Files changed
- Behavior touched
- Verification outputs
- Risks/follow-ups
```

## Prompt B — Wave B (Secondary lane)

```text
You own Wave-B for plan `agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05` in /home/deadpool/Documents/recodee/gitguardex.

Goal:
Implement the assigned Wave-B scope and return verification evidence.

Hard constraints:
- You are not alone in the codebase; do not revert others' work.
- Stay in your owned files/modules only.
- Record explicit handoff notes for integration.

Owned scope:
- <fill owned files/modules>

Verification:
- <fill commands>

Handoff format:
- Files changed
- Behavior touched
- Verification outputs
- Risks/follow-ups
```

## Prompt C — Wave C (Secondary lane)

```text
You own Wave-C for plan `agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05` in /home/deadpool/Documents/recodee/gitguardex.

Goal:
Implement the assigned Wave-C scope and return verification evidence.

Hard constraints:
- You are not alone in the codebase; do not revert others' work.
- Stay in your owned files/modules only.
- Record explicit handoff notes for integration.

Owned scope:
- <fill owned files/modules>

Verification:
- <fill commands>

Handoff format:
- Files changed
- Behavior touched
- Verification outputs
- Risks/follow-ups
```

## Prompt D — Integrator lane

```text
You are the integrator for plan `agent-codex-vscode-active-agents-logo-and-runtime-pl-2026-04-22-16-05` in /home/deadpool/Documents/recodee/gitguardex.

Goal:
Integrate completed waves, resolve conflicts, run final verification, and prepare rollout/cutover notes.

Hard constraints:
- You are not alone in the codebase; do not revert others' work.
- Preserve safety-critical behavior unless explicitly planned and tested.
- Keep final output evidence-first.

Owned scope:
- integration glue and shared touchpoints
- final validation + handoff summary

Verification:
- <fill commands>

Final report:
- Files changed
- Integration decisions
- Verification outputs
- Remaining risks
```
