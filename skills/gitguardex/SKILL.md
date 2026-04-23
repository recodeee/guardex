---
name: gitguardex
description: "Repo guardrail check and repair."
---

Use when repo safety may be broken.

`gx status` -> `gx doctor` -> `gx status --strict`

Bootstrap: `gx setup`
Ops: `gx branch start "<task>" "<agent>"`, `gx locks claim --branch "<agent-branch>" <file...>`, `gx branch finish --branch "<agent-branch>" --base <base> --via-pr --wait-for-merge --cleanup`, `gx finish --all`, `gx cleanup`
