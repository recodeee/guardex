## Why

- `bin/multiagent-safety.js` is roughly 7,864 lines long and currently mixes CLI parsing, template rendering, git/worktree plumbing, protected-base sandboxing, finish/merge logic, toolchain self-update, and output/report formatting.
- That shared module scope makes even small changes hard to review and easy to regress because unrelated helpers are tightly coupled and tests have to exercise one monolith.
- The requested outcome is a seam-based decomposition so future Guardex CLI changes can land in smaller diffs with clearer ownership and lower regression risk.

## What Changes

- Introduce a `src/` runtime layout that separates `cli`, `output`, `git`, `scaffold`, `hooks`, `toolchain`, `sandbox`, and `finish`, with only small shared helpers left in `src/context.js` and `src/core/runtime.js`.
- Reduce `bin/multiagent-safety.js` to a thin entrypoint that boots `src/cli/main.js`.
- Preserve the current command surface, aliases, and targeted behavior while moving the existing logic wholesale into the new modules.
- Update package shipping and regression coverage so installed CLIs still include `src/**` and the extracted runtime stays exercised by install/metadata tests.

## Impact

- Primary surfaces: `bin/multiagent-safety.js`, new `src/**` modules, `package.json`, and CLI regression tests.
- Main refactor risk is hidden cross-module coupling in `doctor`, protected-main sandbox flows, and finish/cleanup helpers, so extraction should move lower-risk seams first and verify after each pass.
- This is an internal architecture cleanup only; it must not intentionally change command names, output contracts, or the zero-copy install surface.
