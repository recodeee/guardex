---
name: guardex
description: "Use when you need to check, repair, or bootstrap multi-agent safety guardrails in this repository."
---

# GuardeX (Codex skill)

Use this skill whenever branch safety, lock ownership, or guardrail setup may be broken.

## Fast path

1. Run `gx status`.
2. If repo safety is degraded, run `gx doctor`.
3. If issues remain, run `gx scan` and address the findings.

## Setup path

If guardrails are missing entirely, run:

```sh
gx setup
```

Then verify:

```sh
gx status
gx scan
```

## Operator notes

- Prefer `gx doctor` for one-step repair + verification.
- Keep agent work isolated (`agent/*` branches + lock claims).
- For one-command Codex sandbox startup, use `bash scripts/codex-agent.sh "<task>" "<agent-name>"`.
- For skill-file-only merges into the local base branch (`dev` by default), use `$guardex-merge-skills-to-dev`.
- Do not bypass protected branch safeguards unless explicitly required.
